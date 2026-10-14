-- ============================================================================
-- sim-004b — el contrato v1: «completado» (j.8) y hueco_aceptado (S4-04)
--
-- ⚠️ a partir de sim-004b, sim-003 queda superada y NO se vuelve a ejecutar; la
-- referencia del esquema pasa a ser la comprobación final de sim-004b, que verifica
-- también los objetos de sim-003 y de sim-004a-preparatoria que no cambia.
-- (Texto de j.9, que k.1 pasa de sim-004a a sim-004b.) Si se ejecuta sim-003 despues,
-- aborta con su error «sim-003: la restriccion … no es la prevista» y no cambia nada
-- (ensayado: pruebas/sim-004b.mjs).
--
-- POR QUE EXISTE. Diseño sim-004 (revisiones/2026-10-12-diseno-sim-004-y-motor-v1.md):
-- j.8 (CTO 12-oct), S4-04 (i.2), k.1 c) y la aprobacion del CTO del 14-oct (q.4): sim-004b
-- admite hueco_aceptado ademas del «completado». Lo demas que k.1 c) lista para sim-004b
-- (mercado por la RPC, reglas versionadas reto@2, retencion) NO esta aqui.
--
-- QUE CAMBIA (aditivo; ninguna fila cambia de sentido):
--   restricciones  sim_sessions_terminal_valida: + 'superado'
--                  sim_eventos_tipo_check: + 'hueco_aceptado'
--   funciones      (CREATE OR REPLACE; misma firma, mismos permisos: EXECUTE solo service_role)
--     sim_comando        acepta eventos hueco_aceptado; un avance con hueco_aceptado es
--                        de clase 'economico' (no lo sobrescribe ultimo_avance: S4-04);
--                        una sesion 'superado' → 409 solo_lectura
--     sim_tomar_escritor 'superado' → 409 solo_lectura
--     sim_avanzar_fase   generalizada (j.8): de la fase k superada de un reto@1 con
--                        challenge_type 1F (1 fase), 2F (2) o 3F (3):
--                          k < n → la hija k+1, como hasta ahora en 1→2 (recibo en la hija;
--                                  el padre queda passed_phase);
--                          k = n → SIN hija (p_hija_id NULL): la sesion queda terminal
--                                  'superado', status passed_all, version + 1, recibo
--                                  economico avanzar_fase EN LA SESION; la misma clave y el
--                                  mismo sobre → el mismo recibo; otra clave → 409 solo_lectura.
--                        CAS, epoca, acceso releido tras los bloqueos y el orden de bloqueos,
--                        los de sim-003.
--   sim_borrar_sesion no cambia: ya borra una 'superado' (lapida; con las fases, S003-01).
--
-- LO QUE NO TOCA: tablas, columnas, indices, politicas, grants, ni las otras funciones
-- de sim-003 (sim_crear_sesion, sim_borrar_*, sim_error, sim_bloquea_alumno) ni las de
-- la preparatoria. Ningun nombre nuevo (tampoco frente a public.mercado_cerrojo).
--
-- COMO SE EJECUTA: entero, de una vez, en el editor SQL de Supabase. Dos ordenes:
--   1. un bloque DO que comprueba lo que da por hecho (sim-003 y la preparatoria
--      aplicadas), aplica y COMPRUEBA; si algo falla revienta con «sim-004b: …» y no
--      queda NADA (un DO es una transaccion);
--   2. una SELECT de informe (solo catalogo) que acaba en «FIN | sim-004b aplicada».
--   Segunda ejecucion: ve que ya esta (las dos restricciones y los tres cuerpos son los
--   de este fichero), no cambia nada, repite las comprobaciones y da el mismo informe.
--   A medias (una restriccion si y otra no, un cuerpo distinto): se para sin tocar nada.
--
-- Ensayado en PostgreSQL 17 local: s04 literal + sim-002 + sim-003 + preparatoria, con un
-- ejecutor como el de s06 (pruebas/sim-004b.mjs). No prueba el editor de Supabase.
-- NO APLICADA (CTO 14-oct: se escribe y se prueba en local; no se aplica).
-- ============================================================================

DO $sim_004b$
DECLARE
  f          text;
  rol        text;
  v_n        integer;
  v_rel      text;
  v_def      text;
  v_sp       text;
  v_txt      text;
  v_nuevas   integer;
  v_viejas   integer;
  v_cuerpos  integer;
  -- ── los cuerpos: se crean con estos textos y se comparan con ellos ────────
  v_comando text := $c$
    DECLARE
      v_sobre jsonb; v_digest text; v_al jsonb; v_padre uuid; v_s public.sim_sessions; v_r public.sim_recibos;
      v_a public.sim_arrendamientos; v_t timestamptz; v_eventos jsonb; v_trades jsonb; v_proy jsonb; v_clase text;
      v_n integer; v_cambia boolean; v_version bigint; v_base bigint; v_seqs jsonb; v_hasta timestamptz;
      v_avance boolean;
    BEGIN
      IF p_actor IS NULL OR p_session_id IS NULL OR p_command_id IS NULL OR p_tipo IS NULL OR p_sobre IS NULL
         OR p_epoca IS NULL OR p_version_esperada IS NULL OR p_resultado IS NULL THEN
        RETURN public.sim_error(422, 'argumentos_incompletos');
      END IF;
      IF p_tipo NOT IN ('abrir', 'modificar', 'cancelar', 'cerrar', 'avanzar', 'checkpoint') THEN
        RETURN public.sim_error(422, 'tipo_invalido');
      END IF;
      v_avance := p_tipo IN ('avanzar', 'checkpoint');
      BEGIN v_sobre := p_sobre::jsonb; EXCEPTION WHEN others THEN RETURN public.sim_error(422, 'sobre_invalido'); END;
      IF jsonb_typeof(v_sobre) <> 'object' OR v_sobre->>'tipo' IS DISTINCT FROM p_tipo THEN
        RETURN public.sim_error(422, 'sobre_invalido');
      END IF;
      v_digest := encode(extensions.digest(convert_to(p_sobre, 'UTF8'), 'sha256'), 'hex');

      -- forma del resultado, ANTES de bloquear nada (sin efectos)
      v_eventos := coalesce(p_resultado->'eventos', '[]'::jsonb);
      v_trades := coalesce(p_resultado->'trades', '[]'::jsonb);
      v_proy := coalesce(p_resultado->'proyeccion', '{}'::jsonb);
      IF jsonb_typeof(p_resultado) <> 'object' OR jsonb_typeof(v_eventos) <> 'array' OR jsonb_typeof(v_trades) <> 'array'
         OR jsonb_typeof(v_proy) <> 'object' OR jsonb_typeof(p_resultado->'estado') IS DISTINCT FROM 'object'
         OR p_resultado->>'resultado' IS NULL OR p_resultado->>'resultado' NOT IN ('aceptado', 'rechazado')
         OR ((p_resultado->>'resultado' = 'rechazado') <> (p_resultado->>'motivo' IS NOT NULL))
         OR EXISTS (SELECT 1 FROM jsonb_object_keys(v_proy) k WHERE k NOT IN ('balance', 'last_timestamp')) THEN
        RETURN public.sim_error(422, 'resultado_invalido');
      END IF;
      BEGIN
        -- ordinales 0..n-1, tipos conocidos, t_mercado entero, datos objeto
        SELECT count(*) INTO v_n FROM jsonb_array_elements(v_eventos) WITH ORDINALITY e(x, i)
         WHERE (x->>'ordinal')::integer IS DISTINCT FROM (i - 1)::integer
            OR x->>'tipo' IS NULL
            OR x->>'tipo' NOT IN ('orden_creada', 'orden_modificada', 'orden_cancelada', 'fill', 'cierre', 'reset_diario',
                                  'breach', 'fase_superada', 'fin_de_datos', 'posicion_modificada', 'no_valorable',
                                  'hueco_aceptado')
            OR (x->>'t_mercado')::bigint IS NULL OR jsonb_typeof(x->'datos') IS DISTINCT FROM 'object';
        IF v_n > 0 THEN RETURN public.sim_error(422, 'resultado_invalido', jsonb_build_object('en', 'eventos')); END IF;
        -- un trade por cada cierre, y ninguno mas (§ 2.4)
        IF (SELECT count(*) FROM jsonb_array_elements(v_eventos) x WHERE x->>'tipo' = 'cierre')
           <> jsonb_array_length(v_trades)
           OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_trades) t
                       WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_eventos) x
                                          WHERE x->>'tipo' = 'cierre' AND (x->>'ordinal')::integer = (t->>'ordinal')::integer))
           OR (SELECT count(DISTINCT (t->>'ordinal')::integer) FROM jsonb_array_elements(v_trades) t) <> jsonb_array_length(v_trades) THEN
          RETURN public.sim_error(422, 'resultado_invalido', jsonb_build_object('en', 'trades'));
        END IF;
        -- que cada trade se pueda convertir a una fila de sim_trades
        PERFORM jsonb_populate_record(NULL::public.sim_trades, t) FROM jsonb_array_elements(v_trades) t;
        PERFORM (v_proy->>'balance')::numeric, (v_proy->>'last_timestamp')::bigint;
      EXCEPTION WHEN others THEN
        RETURN public.sim_error(422, 'resultado_invalido', jsonb_build_object('en', 'tipos'));
      END;
      v_clase := CASE WHEN v_avance AND NOT EXISTS (
                        SELECT 1 FROM jsonb_array_elements(v_eventos) x
                         WHERE x->>'tipo' IN ('orden_creada', 'orden_modificada', 'orden_cancelada', 'fill', 'cierre',
                                              'posicion_modificada', 'reset_diario', 'breach', 'fase_superada',
                                              'hueco_aceptado'))
                      THEN 'ultimo_avance' ELSE 'economico' END;
      IF p_resultado->>'clase' IS DISTINCT FROM v_clase THEN
        RETURN public.sim_error(422, 'clase_incoherente', jsonb_build_object('clase', v_clase));
      END IF;

      -- bloqueos, en el orden comun
      v_al := public.sim_bloquea_alumno(p_actor);
      IF v_al IS NULL THEN RETURN public.sim_error(410, 'sesion_borrada'); END IF;
      PERFORM 1 FROM public.sim_arrendamientos WHERE session_id = p_session_id FOR UPDATE;
      SELECT challenge_parent_id INTO v_padre FROM public.sim_sessions WHERE id = p_session_id;
      IF v_padre IS NOT NULL THEN PERFORM 1 FROM public.sim_sessions WHERE id = v_padre FOR UPDATE; END IF;
      SELECT * INTO v_s FROM public.sim_sessions WHERE id = p_session_id FOR UPDATE;
      v_t := clock_timestamp();   -- la hora de decision, DESPUES de los bloqueos (V4-01)
      -- acceso y plan vigentes en el punto de decision, releidos tras los
      -- bloqueos (S003-04): una revocacion confirmada mientras se esperaba cuenta
      v_al := v_al || coalesce((SELECT jsonb_build_object('acceso', p.simulador_activo IS TRUE, 'plan', p.plan)
                                  FROM public.profiles p WHERE p.id = p_actor), '{"acceso": false}'::jsonb);

      IF v_s.id IS NULL THEN RETURN public.sim_error(410, 'sesion_borrada'); END IF;
      IF v_s.user_id <> p_actor THEN RETURN public.sim_error(404, 'sesion_no_encontrada'); END IF;
      SELECT * INTO v_r FROM public.sim_recibos WHERE session_id = p_session_id AND command_id = p_command_id;
      IF FOUND THEN
        IF v_r.digest = v_digest AND v_r.tipo = p_tipo THEN
          RETURN jsonb_build_object('ok', true, 'http', 200, 'repetido', true, 'recibo', to_jsonb(v_r), 'version', v_s.version);
        END IF;
        RETURN public.sim_error(409, 'clave_reutilizada');
      END IF;
      -- la lapida antes que el avance caducado (S003-03): una sesion borrada
      -- no manda recargar su estado
      IF v_s.terminal = 'borrada' THEN RETURN public.sim_error(410, 'sesion_borrada'); END IF;
      IF v_avance AND p_version_esperada <> v_s.version THEN
        RETURN public.sim_error(409, 'comando_caducado', jsonb_build_object('version', v_s.version));
      END IF;
      IF v_s.terminal = 'revocada' THEN RETURN public.sim_error(403, 'acceso_revocado'); END IF;
      IF NOT (v_al->>'acceso')::boolean THEN RETURN public.sim_error(403, 'sin_acceso'); END IF;
      IF v_s.legado OR v_s.terminal = 'superado' THEN RETURN public.sim_error(409, 'solo_lectura'); END IF;
      IF v_s.motor_version <> 1 THEN RETURN public.sim_error(409, 'no_es_v1'); END IF;
      IF p_epoca <> v_s.epoca THEN RETURN public.sim_error(426, 'actualizar_cliente'); END IF;
      SELECT * INTO v_a FROM public.sim_arrendamientos WHERE session_id = p_session_id;
      IF NOT FOUND OR v_a.cliente_id IS DISTINCT FROM p_cliente_id OR v_a.hasta <= v_t
         OR v_a.testigo_hash <> encode(extensions.digest(convert_to(coalesce(p_testigo, ''), 'UTF8'), 'sha256'), 'hex') THEN
        RETURN public.sim_error(409, 'sin_arrendamiento');
      END IF;
      IF p_version_esperada <> v_s.version THEN
        RETURN public.sim_error(409, 'conflicto', jsonb_build_object('version', v_s.version));
      END IF;
      IF v_avance AND (v_al->>'siguiente_avance_desde')::timestamptz > v_t THEN
        RETURN public.sim_error(429, 'demasiados_avances');
      END IF;

      -- escribir: eventos, trades, recibo, estado y proyecciones, arrendamiento
      v_cambia := (p_resultado->'estado') IS DISTINCT FROM v_s.estado;
      v_version := v_s.version + CASE WHEN v_cambia THEN 1 ELSE 0 END;
      SELECT coalesce(max(seq), 0) INTO v_base FROM public.sim_eventos WHERE session_id = p_session_id;
      WITH ev AS (
        INSERT INTO public.sim_eventos (session_id, user_id, seq, command_id, ordinal, tipo, t_mercado, datos)
        SELECT p_session_id, v_s.user_id, v_base + (x->>'ordinal')::bigint + 1, p_command_id, (x->>'ordinal')::integer,
               x->>'tipo', (x->>'t_mercado')::bigint, x->'datos'
          FROM jsonb_array_elements(v_eventos) x
        RETURNING id, seq, ordinal
      ), tr AS (
        INSERT INTO public.sim_trades (session_id, user_id, pair, side, entry_price, exit_price, sl_price, tp_price, lots,
                                       risk_percent, risk_amount, rr, pnl, result, session_type, tags, notes, opened_at, closed_at,
                                       motor_version, evento_id, bruto_micro, neto_micro, comision_micro, spread_micro, swap_micro,
                                       conversion, ambigua, causa_ambiguedad)
        SELECT p_session_id, v_s.user_id, r.pair, r.side, r.entry_price, r.exit_price, r.sl_price, r.tp_price, r.lots,
               r.risk_percent, r.risk_amount, r.rr, r.pnl, r.result, r.session_type, r.tags, r.notes, r.opened_at, r.closed_at,
               1, ev.id, r.bruto_micro, r.neto_micro, r.comision_micro, r.spread_micro, r.swap_micro,
               r.conversion, r.ambigua, r.causa_ambiguedad
          FROM jsonb_array_elements(v_trades) t
          CROSS JOIN LATERAL jsonb_populate_record(NULL::public.sim_trades, t) r
          JOIN ev ON ev.ordinal = (t->>'ordinal')::integer
        RETURNING 1
      )
      SELECT coalesce(jsonb_agg(jsonb_build_object('ordinal', ordinal, 'seq', seq, 'id', id) ORDER BY ordinal), '[]'::jsonb),
             (SELECT count(*) FROM tr)
        INTO v_seqs, v_n FROM ev;

      IF v_clase = 'ultimo_avance' THEN
        INSERT INTO public.sim_recibos (session_id, user_id, command_id, tipo, digest, epoca, version_partida, version_resultante,
                                        resultado, motivo, resumen, clase, creado)
        VALUES (p_session_id, v_s.user_id, p_command_id, p_tipo, v_digest, v_s.epoca, v_s.version, v_version,
                p_resultado->>'resultado', p_resultado->>'motivo', p_resultado->'resumen', 'ultimo_avance', v_t)
        ON CONFLICT (session_id) WHERE clase = 'ultimo_avance' DO UPDATE
          SET command_id = excluded.command_id, tipo = excluded.tipo, digest = excluded.digest, epoca = excluded.epoca,
              version_partida = excluded.version_partida, version_resultante = excluded.version_resultante,
              resultado = excluded.resultado, motivo = excluded.motivo, resumen = excluded.resumen, creado = excluded.creado
        RETURNING * INTO v_r;
      ELSE
        INSERT INTO public.sim_recibos (session_id, user_id, command_id, tipo, digest, epoca, version_partida, version_resultante,
                                        resultado, motivo, resumen, clase, creado)
        VALUES (p_session_id, v_s.user_id, p_command_id, p_tipo, v_digest, v_s.epoca, v_s.version, v_version,
                p_resultado->>'resultado', p_resultado->>'motivo', p_resultado->'resumen', 'economico', v_t)
        RETURNING * INTO v_r;
      END IF;

      v_hasta := v_t + interval '60 seconds';
      UPDATE public.sim_arrendamientos SET hasta = v_hasta WHERE session_id = p_session_id;
      UPDATE public.sim_sessions
         SET estado = CASE WHEN v_cambia THEN p_resultado->'estado' ELSE estado END,
             version = v_version,
             balance = coalesce((v_proy->>'balance')::numeric, balance),
             last_timestamp = coalesce((v_proy->>'last_timestamp')::bigint, last_timestamp),
             escritor = jsonb_build_object('cliente_id', v_a.cliente_id, 'hasta', v_hasta)
       WHERE id = p_session_id;
      IF v_avance THEN
        UPDATE public.sim_alumnos SET siguiente_avance_desde = v_t + interval '5 seconds' WHERE user_id = p_actor;
      END IF;
      RETURN jsonb_build_object('ok', true, 'http', 200, 'recibo', to_jsonb(v_r), 'version', v_version, 'eventos', v_seqs,
                                'trades', v_n, 'hasta', v_hasta);
    END $c$;
  v_tomar   text := $c$
    DECLARE
      v_sobre jsonb; v_digest text; v_al jsonb; v_padre uuid; v_s public.sim_sessions; v_r public.sim_recibos;
      v_a public.sim_arrendamientos; v_t timestamptz; v_otras uuid[]; v_testigo text; v_hasta timestamptz;
    BEGIN
      IF p_actor IS NULL OR p_session_id IS NULL OR p_command_id IS NULL OR p_sobre IS NULL OR p_epoca IS NULL
         OR p_cliente_id IS NULL OR length(p_cliente_id) NOT BETWEEN 1 AND 100 THEN
        RETURN public.sim_error(422, 'argumentos_incompletos');
      END IF;
      BEGIN v_sobre := p_sobre::jsonb; EXCEPTION WHEN others THEN RETURN public.sim_error(422, 'sobre_invalido'); END;
      IF jsonb_typeof(v_sobre) <> 'object' OR v_sobre->>'tipo' IS DISTINCT FROM 'tomar_escritor' THEN
        RETURN public.sim_error(422, 'sobre_invalido');
      END IF;
      v_digest := encode(extensions.digest(convert_to(p_sobre, 'UTF8'), 'sha256'), 'hex');

      v_al := public.sim_bloquea_alumno(p_actor);
      IF v_al IS NULL THEN RETURN public.sim_error(410, 'sesion_borrada'); END IF;
      PERFORM 1 FROM public.sim_arrendamientos WHERE user_id = p_actor OR session_id = p_session_id ORDER BY session_id FOR UPDATE;
      SELECT challenge_parent_id INTO v_padre FROM public.sim_sessions WHERE id = p_session_id;
      IF v_padre IS NOT NULL THEN PERFORM 1 FROM public.sim_sessions WHERE id = v_padre FOR UPDATE; END IF;
      SELECT * INTO v_s FROM public.sim_sessions WHERE id = p_session_id FOR UPDATE;
      v_t := clock_timestamp();   -- la hora de decision, DESPUES de los bloqueos (V4-01)
      -- acceso y plan vigentes en el punto de decision, releidos tras los
      -- bloqueos (S003-04): una revocacion confirmada mientras se esperaba cuenta
      v_al := v_al || coalesce((SELECT jsonb_build_object('acceso', p.simulador_activo IS TRUE, 'plan', p.plan)
                                  FROM public.profiles p WHERE p.id = p_actor), '{"acceso": false}'::jsonb);

      IF v_s.id IS NULL THEN RETURN public.sim_error(410, 'sesion_borrada'); END IF;
      IF v_s.user_id <> p_actor THEN RETURN public.sim_error(404, 'sesion_no_encontrada'); END IF;
      SELECT * INTO v_r FROM public.sim_recibos WHERE session_id = p_session_id AND command_id = p_command_id;
      IF FOUND THEN
        IF v_r.digest = v_digest AND v_r.tipo = 'tomar_escritor' THEN
          RETURN jsonb_build_object('ok', true, 'http', 200, 'repetido', true, 'recibo', to_jsonb(v_r));
        END IF;
        RETURN public.sim_error(409, 'clave_reutilizada');
      END IF;
      IF v_s.terminal = 'borrada' THEN RETURN public.sim_error(410, 'sesion_borrada'); END IF;
      IF v_s.terminal = 'revocada' THEN RETURN public.sim_error(403, 'acceso_revocado'); END IF;
      IF NOT (v_al->>'acceso')::boolean THEN RETURN public.sim_error(403, 'sin_acceso'); END IF;
      IF v_s.legado OR v_s.terminal = 'superado' THEN RETURN public.sim_error(409, 'solo_lectura'); END IF;
      IF v_s.motor_version <> 1 THEN RETURN public.sim_error(409, 'no_es_v1'); END IF;
      IF p_epoca <> v_s.epoca THEN RETURN public.sim_error(426, 'actualizar_cliente'); END IF;

      SELECT * INTO v_a FROM public.sim_arrendamientos WHERE session_id = p_session_id;
      IF FOUND AND v_a.hasta > v_t AND v_a.cliente_id <> p_cliente_id AND NOT coalesce(p_forzar, false) THEN
        RETURN public.sim_error(409, 'escritor_ocupado', jsonb_build_object('escritor', jsonb_build_object('cliente_id', v_a.cliente_id, 'hasta', v_a.hasta)));
      END IF;
      -- D-18: una sola sesion v1 en reproduccion a la vez por alumno
      SELECT array_agg(session_id ORDER BY session_id) INTO v_otras FROM public.sim_arrendamientos
       WHERE user_id = p_actor AND session_id <> p_session_id AND hasta > v_t;
      IF v_otras IS NOT NULL THEN
        IF NOT coalesce(p_forzar, false) THEN
          RETURN public.sim_error(409, 'otra_sesion_activa', jsonb_build_object('sesiones', to_jsonb(v_otras)));
        END IF;
        DELETE FROM public.sim_arrendamientos WHERE session_id = ANY (v_otras);
      END IF;

      v_testigo := encode(extensions.gen_random_bytes(32), 'hex');
      v_hasta := v_t + interval '60 seconds';
      INSERT INTO public.sim_arrendamientos (session_id, user_id, cliente_id, testigo_hash, hasta)
      VALUES (p_session_id, p_actor, p_cliente_id, encode(extensions.digest(convert_to(v_testigo, 'UTF8'), 'sha256'), 'hex'), v_hasta)
      ON CONFLICT (session_id) DO UPDATE SET user_id = excluded.user_id, cliente_id = excluded.cliente_id,
                                             testigo_hash = excluded.testigo_hash, hasta = excluded.hasta;
      UPDATE public.sim_sessions SET escritor = jsonb_build_object('cliente_id', p_cliente_id, 'hasta', v_hasta) WHERE id = p_session_id;
      INSERT INTO public.sim_recibos (session_id, user_id, command_id, tipo, digest, epoca, version_partida, version_resultante,
                                      resultado, resumen, clase)
      VALUES (p_session_id, p_actor, p_command_id, 'tomar_escritor', v_digest, v_s.epoca, v_s.version, v_s.version, 'aceptado',
              jsonb_build_object('forzado', coalesce(p_forzar, false), 'liberadas', coalesce(to_jsonb(v_otras), '[]'::jsonb)), 'economico')
      RETURNING * INTO v_r;
      RETURN jsonb_build_object('ok', true, 'http', 200, 'testigo', v_testigo, 'hasta', v_hasta, 'recibo', to_jsonb(v_r));
    END $c$;
  v_fase    text := $c$
    DECLARE
      v_sobre jsonb; v_digest text; v_al jsonb; v_p public.sim_sessions; v_h public.sim_sessions; v_r public.sim_recibos;
      v_nueva public.sim_sessions; v_k integer; v_n integer;
    BEGIN
      -- sim-004b (j.8): p_hija_id es NULL al completar la ultima fase (no hay hija)
      IF p_actor IS NULL OR p_padre_id IS NULL OR p_command_id IS NULL OR p_sobre IS NULL
         OR p_epoca IS NULL OR p_version_esperada IS NULL THEN
        RETURN public.sim_error(422, 'argumentos_incompletos');
      END IF;
      BEGIN v_sobre := p_sobre::jsonb; EXCEPTION WHEN others THEN RETURN public.sim_error(422, 'sobre_invalido'); END;
      IF jsonb_typeof(v_sobre) <> 'object' OR v_sobre->>'tipo' IS DISTINCT FROM 'avanzar_fase' THEN
        RETURN public.sim_error(422, 'sobre_invalido');
      END IF;
      v_digest := encode(extensions.digest(convert_to(p_sobre, 'UTF8'), 'sha256'), 'hex');

      v_al := public.sim_bloquea_alumno(p_actor);
      IF v_al IS NULL THEN RETURN public.sim_error(410, 'sesion_borrada'); END IF;
      SELECT * INTO v_p FROM public.sim_sessions WHERE id = p_padre_id FOR UPDATE;
      IF NOT FOUND THEN RETURN public.sim_error(410, 'sesion_borrada'); END IF;
      IF p_hija_id IS NOT NULL THEN SELECT * INTO v_h FROM public.sim_sessions WHERE id = p_hija_id FOR UPDATE; END IF;
      -- acceso y plan vigentes en el punto de decision, releidos tras los
      -- bloqueos (S003-04): una revocacion confirmada mientras se esperaba cuenta
      v_al := v_al || coalesce((SELECT jsonb_build_object('acceso', p.simulador_activo IS TRUE, 'plan', p.plan)
                                  FROM public.profiles p WHERE p.id = p_actor), '{"acceso": false}'::jsonb);
      IF v_p.user_id <> p_actor THEN RETURN public.sim_error(404, 'sesion_no_encontrada'); END IF;
      IF v_h.id IS NOT NULL THEN
        IF v_h.user_id = p_actor AND v_h.terminal = 'borrada' THEN RETURN public.sim_error(410, 'sesion_borrada'); END IF;
        IF v_h.user_id = p_actor AND v_h.challenge_parent_id = p_padre_id THEN
          SELECT * INTO v_r FROM public.sim_recibos WHERE session_id = p_hija_id AND command_id = p_command_id AND tipo = 'avanzar_fase';
          IF FOUND AND v_r.digest = v_digest THEN
            RETURN jsonb_build_object('ok', true, 'http', 200, 'repetido', true, 'recibo', to_jsonb(v_r));
          END IF;
        END IF;
        RETURN public.sim_error(409, 'clave_reutilizada');
      END IF;
      -- j.8: el completado deja su recibo en la propia sesion; el mismo id y el
      -- mismo sobre → la misma respuesta (antes de mirar terminal: ya es superado)
      IF p_hija_id IS NULL THEN
        SELECT * INTO v_r FROM public.sim_recibos WHERE session_id = p_padre_id AND command_id = p_command_id;
        IF FOUND THEN
          IF v_r.tipo = 'avanzar_fase' AND v_r.digest = v_digest THEN
            RETURN jsonb_build_object('ok', true, 'http', 200, 'repetido', true, 'recibo', to_jsonb(v_r), 'version', v_p.version);
          END IF;
          RETURN public.sim_error(409, 'clave_reutilizada');
        END IF;
      END IF;
      IF v_p.terminal = 'borrada' THEN RETURN public.sim_error(410, 'sesion_borrada'); END IF;
      IF v_p.terminal = 'revocada' THEN RETURN public.sim_error(403, 'acceso_revocado'); END IF;
      IF NOT (v_al->>'acceso')::boolean THEN RETURN public.sim_error(403, 'sin_acceso'); END IF;
      IF v_p.legado OR v_p.terminal = 'superado' THEN RETURN public.sim_error(409, 'solo_lectura'); END IF;
      IF v_p.motor_version <> 1 THEN RETURN public.sim_error(409, 'no_es_v1'); END IF;
      IF p_epoca <> v_p.epoca THEN RETURN public.sim_error(426, 'actualizar_cliente'); END IF;
      -- la fase superada (k) y cuantas tiene el producto (n): 1F 1, 2F 2, 3F 3
      v_n := CASE v_p.challenge_type WHEN '1F' THEN 1 WHEN '2F' THEN 2 WHEN '3F' THEN 3 END;
      v_k := CASE WHEN v_p.estado->>'fase' ~ '^[1-9]$' THEN (v_p.estado->>'fase')::integer END;
      IF v_k IS NOT NULL AND v_n IS NOT NULL AND v_k < v_n
         AND EXISTS (SELECT 1 FROM public.sim_sessions WHERE challenge_parent_id = p_padre_id AND motor_version = 1) THEN
        RETURN public.sim_error(409, 'transicion_hecha');
      END IF;
      IF p_version_esperada <> v_p.version THEN
        RETURN public.sim_error(409, 'conflicto', jsonb_build_object('version', v_p.version));
      END IF;
      IF v_n IS NULL OR v_k IS NULL OR v_k > v_n OR v_p.estado->>'esquema' IS DISTINCT FROM 'reto@1'
         OR v_p.estado->>'estado' IS DISTINCT FROM 'superada' THEN
        RETURN public.sim_error(409, 'fase_no_superada');
      END IF;

      -- ── la ultima fase: completado (j.8). Sin hija; la sesion queda superado ──
      IF v_k = v_n THEN
        IF p_hija_id IS NOT NULL OR p_estado IS NOT NULL OR p_mercado IS NOT NULL
           OR (p_sesion IS NOT NULL AND p_sesion <> '{}'::jsonb) THEN
          RETURN public.sim_error(422, 'carga_invalida');
        END IF;
        UPDATE public.sim_sessions SET terminal = 'superado', status = 'passed_all', version = v_p.version + 1
         WHERE id = p_padre_id;
        INSERT INTO public.sim_recibos (session_id, user_id, command_id, tipo, digest, epoca, version_partida, version_resultante,
                                        resultado, resumen, clase)
        VALUES (p_padre_id, p_actor, p_command_id, 'avanzar_fase', v_digest, v_p.epoca, v_p.version, v_p.version + 1, 'aceptado',
                coalesce(p_resumen, '{}'::jsonb) || jsonb_build_object('completado', true, 'fase', v_k), 'economico')
        RETURNING * INTO v_r;
        RETURN jsonb_build_object('ok', true, 'http', 200, 'recibo', to_jsonb(v_r), 'version', v_p.version + 1);
      END IF;

      -- ── una fase intermedia: la hija k+1 (D07) ──
      IF p_hija_id IS NULL THEN RETURN public.sim_error(422, 'argumentos_incompletos'); END IF;
      IF p_estado IS NULL OR p_estado->>'esquema' IS DISTINCT FROM 'reto@1' OR p_estado->>'fase' IS DISTINCT FROM (v_k + 1)::text
         OR p_estado->>'estado' IS DISTINCT FROM 'en_curso'
         OR p_mercado IS NULL OR jsonb_typeof(p_mercado) <> 'object' OR p_mercado = '{}'::jsonb
         OR p_sesion IS NULL OR jsonb_typeof(p_sesion) <> 'object'
         OR EXISTS (SELECT 1 FROM jsonb_object_keys(p_sesion) k WHERE k NOT IN ('name', 'timeframe', 'date_from', 'date_to', 'last_timestamp')) THEN
        RETURN public.sim_error(422, 'carga_invalida');
      END IF;
      BEGIN
        v_nueva := jsonb_populate_record(NULL::public.sim_sessions, p_sesion);
      EXCEPTION WHEN others THEN RETURN public.sim_error(422, 'carga_invalida'); END;

      INSERT INTO public.sim_sessions (id, user_id, name, pair, timeframe, date_from, date_to, capital, balance, status, last_timestamp,
                                       challenge_type, challenge_phase, challenge_parent_id, motor_version, epoca, version, estado,
                                       mercado, creada_por_rpc)
      VALUES (p_hija_id, p_actor, coalesce(v_nueva.name, v_p.name), v_p.pair, coalesce(v_nueva.timeframe, v_p.timeframe),
              coalesce(v_nueva.date_from, v_p.date_from), coalesce(v_nueva.date_to, v_p.date_to), v_p.capital, v_p.capital,
              'active', coalesce(v_nueva.last_timestamp, v_p.last_timestamp), v_p.challenge_type, v_k + 1, p_padre_id, 1, v_p.epoca, 0,
              p_estado, p_mercado, true);
      UPDATE public.sim_sessions SET status = 'passed_phase' WHERE id = p_padre_id;
      INSERT INTO public.sim_recibos (session_id, user_id, command_id, tipo, digest, epoca, version_partida, version_resultante,
                                      resultado, resumen, clase)
      VALUES (p_hija_id, p_actor, p_command_id, 'avanzar_fase', v_digest, v_p.epoca, 0, 0, 'aceptado',
              coalesce(p_resumen, '{}'::jsonb) || jsonb_build_object('padre', p_padre_id, 'version_padre', v_p.version), 'economico')
      RETURNING * INTO v_r;
      RETURN jsonb_build_object('ok', true, 'http', 201, 'recibo', to_jsonb(v_r));
    END$c$;
  -- ── las dos restricciones, antes y despues (pg_get_constraintdef, search_path = public) ──
  v_terminal_vieja text := 'CHECK (((terminal IS NULL) OR (terminal = ANY (ARRAY[''borrada''::text, ''revocada''::text]))))';
  v_terminal_nueva text := 'CHECK (((terminal IS NULL) OR (terminal = ANY (ARRAY[''borrada''::text, ''revocada''::text, ''superado''::text]))))';
  v_tipo_viejo text := 'CHECK ((tipo = ANY (ARRAY[''orden_creada''::text, ''orden_modificada''::text, ''orden_cancelada''::text, ''fill''::text, ''cierre''::text, ''reset_diario''::text, ''breach''::text, ''fase_superada''::text, ''fin_de_datos''::text, ''posicion_modificada''::text, ''no_valorable''::text])))';
  v_tipo_nuevo text := 'CHECK ((tipo = ANY (ARRAY[''orden_creada''::text, ''orden_modificada''::text, ''orden_cancelada''::text, ''fill''::text, ''cierre''::text, ''reset_diario''::text, ''breach''::text, ''fase_superada''::text, ''fin_de_datos''::text, ''posicion_modificada''::text, ''no_valorable''::text, ''hueco_aceptado''::text])))';
  -- ── las funciones de sim-003 (todas siguen ahi; tres cambian de cuerpo) ──
  v_rpc text[] := ARRAY['sim_crear_sesion(uuid,uuid,uuid,text,integer,jsonb,jsonb,jsonb,jsonb)',
                        'sim_tomar_escritor(uuid,uuid,uuid,text,integer,text,boolean)',
                        'sim_comando(uuid,uuid,uuid,text,text,integer,bigint,text,text,jsonb)',
                        'sim_avanzar_fase(uuid,uuid,uuid,uuid,text,integer,bigint,jsonb,jsonb,jsonb,jsonb)',
                        'sim_borrar_sesion(uuid,uuid)', 'sim_borrar_legacy(uuid,uuid)', 'sim_borrar_alumno(uuid)'];
  v_aux text[] := ARRAY['sim_error(integer,text,jsonb)', 'sim_bloquea_alumno(uuid)'];
  -- ── las funciones de la preparatoria (aplicada el 13-oct): sha256 de su cuerpo ──
  v_prep text[][] := ARRAY[
    ARRAY['sim_cierre_v0(uuid,numeric,bigint,jsonb)', '3f116e57f9ba0c4ef6b2d1176f0a91997548106ab186b9e3eff9c0f27126d70b'],
    ARRAY['sim_escrituras_v0_registra()', 'c47b1970ee48912748434f3161a62062835bfe1ec51af864659164dcddb7a6b4'],
    ARRAY['sim_escrituras_v0_marca_balance()', '894174ce7cbdd7f7ec69af214dd39fcff00ed12e117c48887c44bd0a058c3117'],
    ARRAY['sim_escrituras_v0_inmutable()', '58154aea4b93fa65064079566019ad2e390969860961b6aece7281b8463b48d3'],
    ARRAY['sim_escrituras_v0_solo_disparador()', '6b0f60c5164ea97357a5234501a106b95fcbacfb3362a203b070ad3ca1cb3146'],
    ARRAY['sim_escrituras_v0_parejas(uuid)', '287f3eba3f68aa68385b6dd2e82512b9ccea1ed963a8def38382f1fdd6adbf32'],
    ARRAY['sim_escrituras_v0_canonico(uuid)', 'a84f48563b8abc6af7731fccee921d9b04231daeccd1bfa8abe81dddee0192b9'],
    ARRAY['sim_sessions_rev_saldo()', 'c209d2326065f55a610319b3207c7b43fdc4ffb5be79302285081b0c5ce18503'],
    ARRAY['sim_trades_rev_saldo()', '94c4e7220af33da3f257dfc4eae01d00acbc412b5417d025636d83f88f74569d'],
    ARRAY['sim_sessions_padre_propio()', '3285b822d279587324951b93f7dd6268c2103bc5ff39f4e11d2e9a85d2623291']];
BEGIN
  -- ── 0 · lo que se da por hecho ──────────────────────────────────────────
  IF current_setting('server_version_num')::integer < 170000 THEN
    RAISE EXCEPTION 'sim-004b: hace falta PostgreSQL 17 o posterior (hay %)', current_setting('server_version');
  END IF;
  FOREACH rol IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = rol) THEN RAISE EXCEPTION 'sim-004b: no existe el rol %', rol; END IF;
  END LOOP;
  FOREACH f IN ARRAY v_rpc || v_aux LOOP
    IF to_regprocedure('public.' || f) IS NULL THEN RAISE EXCEPTION 'sim-004b: sim-003 no esta aplicada (falta public.%): no se toca nada', f; END IF;
  END LOOP;
  FOR v_n IN 1 .. array_length(v_prep, 1) LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid = to_regprocedure('public.' || v_prep[v_n][1])
                    AND encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') = v_prep[v_n][2]) THEN
      RAISE EXCEPTION 'sim-004b: la preparatoria no esta aplicada o public.% no es la suya (sha256 del cuerpo): no se toca nada', v_prep[v_n][1];
    END IF;
  END LOOP;
  IF to_regclass('public.sim_servicio') IS NULL OR to_regclass('public.sim_escrituras_v0') IS NULL THEN
    RAISE EXCEPTION 'sim-004b: faltan tablas de la preparatoria (sim_servicio, sim_escrituras_v0): no se toca nada';
  END IF;

  -- ── ¿sin aplicar, aplicada o a medias? ──────────────────────────────────
  v_sp := current_setting('search_path');
  PERFORM set_config('search_path', 'public', true);
  SELECT count(*) INTO v_viejas FROM pg_constraint k
   WHERE (k.conrelid = 'public.sim_sessions'::regclass AND k.conname = 'sim_sessions_terminal_valida' AND pg_get_constraintdef(k.oid) = v_terminal_vieja)
      OR (k.conrelid = 'public.sim_eventos'::regclass AND k.conname = 'sim_eventos_tipo_check' AND pg_get_constraintdef(k.oid) = v_tipo_viejo);
  SELECT count(*) INTO v_nuevas FROM pg_constraint k
   WHERE k.convalidated
     AND ((k.conrelid = 'public.sim_sessions'::regclass AND k.conname = 'sim_sessions_terminal_valida' AND pg_get_constraintdef(k.oid) = v_terminal_nueva)
       OR (k.conrelid = 'public.sim_eventos'::regclass AND k.conname = 'sim_eventos_tipo_check' AND pg_get_constraintdef(k.oid) = v_tipo_nuevo));
  PERFORM set_config('search_path', v_sp, true);
  SELECT count(*) INTO v_cuerpos FROM pg_proc p
   WHERE (p.oid = to_regprocedure('public.' || v_rpc[3]) AND p.prosrc = v_comando)
      OR (p.oid = to_regprocedure('public.' || v_rpc[2]) AND p.prosrc = v_tomar)
      OR (p.oid = to_regprocedure('public.' || v_rpc[4]) AND p.prosrc = v_fase);

  IF v_viejas = 2 AND v_nuevas = 0 AND v_cuerpos = 0 THEN
    -- ── 1 · las dos restricciones (las filas de hoy cumplen las nuevas: son mas anchas) ──
    ALTER TABLE public.sim_sessions DROP CONSTRAINT sim_sessions_terminal_valida,
      ADD CONSTRAINT sim_sessions_terminal_valida CHECK (terminal IS NULL OR terminal IN ('borrada', 'revocada', 'superado'));
    ALTER TABLE public.sim_eventos DROP CONSTRAINT sim_eventos_tipo_check,
      ADD CONSTRAINT sim_eventos_tipo_check CHECK (tipo IN ('orden_creada', 'orden_modificada', 'orden_cancelada', 'fill', 'cierre',
                                                            'reset_diario', 'breach', 'fase_superada', 'fin_de_datos',
                                                            'posicion_modificada', 'no_valorable', 'hueco_aceptado'));
    -- ── 2 · los tres cuerpos (misma firma: los permisos de sim-003 se quedan) ──
    EXECUTE format('CREATE OR REPLACE FUNCTION public.sim_comando(p_actor uuid, p_session_id uuid, p_command_id uuid, p_tipo text, p_sobre text, '
                   'p_epoca integer, p_version_esperada bigint, p_cliente_id text, p_testigo text, p_resultado jsonb) '
                   'RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '''' AS %L', v_comando);
    EXECUTE format('CREATE OR REPLACE FUNCTION public.sim_tomar_escritor(p_actor uuid, p_session_id uuid, p_command_id uuid, p_sobre text, '
                   'p_epoca integer, p_cliente_id text, p_forzar boolean) '
                   'RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '''' AS %L', v_tomar);
    EXECUTE format('CREATE OR REPLACE FUNCTION public.sim_avanzar_fase(p_actor uuid, p_padre_id uuid, p_hija_id uuid, p_command_id uuid, p_sobre text, '
                   'p_epoca integer, p_version_esperada bigint, p_sesion jsonb, p_estado jsonb, p_mercado jsonb, p_resumen jsonb) '
                   'RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '''' AS %L', v_fase);
  ELSIF NOT (v_viejas = 0 AND v_nuevas = 2 AND v_cuerpos = 3) THEN
    RAISE EXCEPTION 'sim-004b: A MEDIAS o alterada (restricciones viejas %, nuevas % de 2; cuerpos de sim-004b % de 3): no se toca nada; revisar a mano',
      v_viejas, v_nuevas, v_cuerpos;
  END IF;

  -- ── 3 · comprobaciones (tambien en la segunda ejecucion) ────────────────
  -- lo de este fichero
  v_sp := current_setting('search_path');
  PERFORM set_config('search_path', 'public', true);
  IF NOT EXISTS (SELECT 1 FROM pg_constraint k WHERE k.conrelid = 'public.sim_sessions'::regclass AND k.conname = 'sim_sessions_terminal_valida'
                  AND k.convalidated AND pg_get_constraintdef(k.oid) = v_terminal_nueva) THEN
    RAISE EXCEPTION 'sim-004b: sim_sessions_terminal_valida no es la prevista (%)', v_terminal_nueva;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint k WHERE k.conrelid = 'public.sim_eventos'::regclass AND k.conname = 'sim_eventos_tipo_check'
                  AND k.convalidated AND pg_get_constraintdef(k.oid) = v_tipo_nuevo) THEN
    RAISE EXCEPTION 'sim-004b: sim_eventos_tipo_check no es la prevista (%)', v_tipo_nuevo;
  END IF;
  -- lo de sim-003 que no cambia: sus restricciones, indices unicos y politicas, al pie de la letra (su seccion 8)
  FOR v_rel, f, v_def IN SELECT * FROM (VALUES
      ('sim_alumnos', 'sim_alumnos_pkey', 'PRIMARY KEY (user_id)'),
      ('sim_alumnos', 'sim_alumnos_user_id_fkey', 'FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE'),
      ('sim_arrendamientos', 'sim_arrendamientos_pkey', 'PRIMARY KEY (session_id)'),
      ('sim_arrendamientos', 'sim_arrendamientos_session_id_fkey', 'FOREIGN KEY (session_id) REFERENCES sim_sessions(id) ON DELETE CASCADE'),
      ('sim_arrendamientos', 'sim_arrendamientos_cliente_id_check', 'CHECK (((length(cliente_id) >= 1) AND (length(cliente_id) <= 100)))'),
      ('sim_arrendamientos', 'sim_arrendamientos_testigo_hash_check', 'CHECK ((testigo_hash ~ ''^[0-9a-f]{64}$''::text))'),
      ('sim_recibos', 'sim_recibos_pkey', 'PRIMARY KEY (id)'),
      ('sim_recibos', 'sim_recibos_session_id_fkey', 'FOREIGN KEY (session_id) REFERENCES sim_sessions(id) ON DELETE CASCADE'),
      ('sim_recibos', 'sim_recibos_session_command_key', 'UNIQUE (session_id, command_id)'),
      ('sim_recibos', 'sim_recibos_tipo_check', 'CHECK ((tipo = ANY (ARRAY[''abrir''::text, ''modificar''::text, ''cancelar''::text, ''cerrar''::text, ''avanzar''::text, ''checkpoint''::text, ''crear''::text, ''tomar_escritor''::text, ''avanzar_fase''::text])))'),
      ('sim_recibos', 'sim_recibos_clase_check', 'CHECK ((clase = ANY (ARRAY[''economico''::text, ''ultimo_avance''::text])))'),
      ('sim_recibos', 'sim_recibos_clase_tipo', 'CHECK (((clase = ''economico''::text) OR (tipo = ANY (ARRAY[''avanzar''::text, ''checkpoint''::text]))))'),
      ('sim_recibos', 'sim_recibos_digest_check', 'CHECK ((digest ~ ''^[0-9a-f]{64}$''::text))'),
      ('sim_recibos', 'sim_recibos_resultado_check', 'CHECK ((resultado = ANY (ARRAY[''aceptado''::text, ''rechazado''::text, ''conflicto''::text])))'),
      ('sim_eventos', 'sim_eventos_pkey', 'PRIMARY KEY (id)'),
      ('sim_eventos', 'sim_eventos_session_id_fkey', 'FOREIGN KEY (session_id) REFERENCES sim_sessions(id) ON DELETE CASCADE'),
      ('sim_eventos', 'sim_eventos_session_seq_key', 'UNIQUE (session_id, seq)'),
      ('sim_eventos', 'sim_eventos_session_command_ordinal_key', 'UNIQUE (session_id, command_id, ordinal)'),
      ('sim_eventos', 'sim_eventos_seq_check', 'CHECK ((seq >= 1))'),
      ('sim_eventos', 'sim_eventos_ordinal_check', 'CHECK ((ordinal >= 0))'),
      ('sim_sessions', 'sim_sessions_user_id_perfil_fkey', 'FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE'),
      ('sim_sessions', 'sim_sessions_v1_coherente', 'CHECK (((motor_version = ANY (ARRAY[0, 1])) AND (epoca >= 0) AND (version >= 0) AND ((motor_version = 0) OR (creada_por_rpc AND (((estado IS NOT NULL) AND (mercado IS NOT NULL)) OR (NOT (terminal IS DISTINCT FROM ''borrada''::text))))) AND ((NOT legado) OR (motor_version = 0))))'),
      ('sim_trades', 'sim_trades_evento_id_fkey', 'FOREIGN KEY (evento_id) REFERENCES sim_eventos(id) ON DELETE CASCADE'),
      ('sim_trades', 'sim_trades_evento_id_key', 'UNIQUE (evento_id)'),
      ('sim_trades', 'sim_trades_v1_coherente', 'CHECK ((((motor_version = 0) AND (evento_id IS NULL)) OR ((motor_version = 1) AND (evento_id IS NOT NULL) AND (bruto_micro IS NOT NULL) AND (neto_micro IS NOT NULL) AND (comision_micro IS NOT NULL) AND (spread_micro IS NOT NULL) AND (swap_micro IS NOT NULL) AND (ambigua IS NOT NULL))))')) c(rel, nombre, def)
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint k WHERE k.conrelid = to_regclass('public.' || v_rel) AND k.conname = f
                    AND k.convalidated AND pg_get_constraintdef(k.oid) = v_def) THEN
      RAISE EXCEPTION 'sim-004b: la restriccion %.% falta, no esta validada o no es la prevista (%)', v_rel, f, v_def;
    END IF;
  END LOOP;
  FOR f, v_def IN SELECT * FROM (VALUES
      ('sim_alumnos_pkey', 'CREATE UNIQUE INDEX sim_alumnos_pkey ON public.sim_alumnos USING btree (user_id)'),
      ('sim_arrendamientos_pkey', 'CREATE UNIQUE INDEX sim_arrendamientos_pkey ON public.sim_arrendamientos USING btree (session_id)'),
      ('sim_recibos_pkey', 'CREATE UNIQUE INDEX sim_recibos_pkey ON public.sim_recibos USING btree (id)'),
      ('sim_recibos_session_command_key', 'CREATE UNIQUE INDEX sim_recibos_session_command_key ON public.sim_recibos USING btree (session_id, command_id)'),
      ('sim_recibos_ultimo_avance_key', 'CREATE UNIQUE INDEX sim_recibos_ultimo_avance_key ON public.sim_recibos USING btree (session_id) WHERE (clase = ''ultimo_avance''::text)'),
      ('sim_eventos_pkey', 'CREATE UNIQUE INDEX sim_eventos_pkey ON public.sim_eventos USING btree (id)'),
      ('sim_eventos_session_seq_key', 'CREATE UNIQUE INDEX sim_eventos_session_seq_key ON public.sim_eventos USING btree (session_id, seq)'),
      ('sim_eventos_session_command_ordinal_key', 'CREATE UNIQUE INDEX sim_eventos_session_command_ordinal_key ON public.sim_eventos USING btree (session_id, command_id, ordinal)'),
      ('sim_trades_evento_id_key', 'CREATE UNIQUE INDEX sim_trades_evento_id_key ON public.sim_trades USING btree (evento_id)'),
      ('sim_sessions_una_hija_v1_key', 'CREATE UNIQUE INDEX sim_sessions_una_hija_v1_key ON public.sim_sessions USING btree (challenge_parent_id) WHERE ((motor_version = 1) AND (challenge_parent_id IS NOT NULL))')) c(nombre, def)
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_index i WHERE i.indexrelid = to_regclass('public.' || f)
                    AND i.indisunique AND i.indisvalid AND pg_get_indexdef(i.indexrelid) = v_def) THEN
      RAISE EXCEPTION 'sim-004b: el indice unico % falta, no es valido o no es el previsto (%)', f, v_def;
    END IF;
  END LOOP;
  FOREACH f IN ARRAY ARRAY['sim_recibos', 'sim_eventos'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = f
                    AND p.policyname = f || '_select_propios' AND p.permissive = 'PERMISSIVE' AND p.cmd = 'SELECT'
                    AND p.roles = ARRAY['authenticated']::name[] AND p.qual = '(auth.uid() = user_id)' AND p.with_check IS NULL) THEN
      RAISE EXCEPTION 'sim-004b: la politica %_select_propios falta o no es SELECT · PERMISSIVE · authenticated · (auth.uid() = user_id)', f;
    END IF;
  END LOOP;
  PERFORM set_config('search_path', v_sp, true);
  IF (SELECT count(*) FROM pg_proc p WHERE (p.oid = to_regprocedure('public.' || v_rpc[3]) AND p.prosrc = v_comando)
        OR (p.oid = to_regprocedure('public.' || v_rpc[2]) AND p.prosrc = v_tomar)
        OR (p.oid = to_regprocedure('public.' || v_rpc[4]) AND p.prosrc = v_fase)) <> 3 THEN
    RAISE EXCEPTION 'sim-004b: sim_comando, sim_tomar_escritor o sim_avanzar_fase no tienen el cuerpo de este fichero';
  END IF;
  -- las nueve funciones de sim-003: definer, search_path vacio, volatil; EXECUTE solo service_role (y solo las RPC)
  FOREACH f IN ARRAY v_rpc || v_aux LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid = to_regprocedure('public.' || f) AND p.prosecdef
                    AND p.proconfig IS NOT NULL AND 'search_path=""' = ANY (p.proconfig)) THEN
      RAISE EXCEPTION 'sim-004b: public.% no es SECURITY DEFINER con el search_path vacio', f;
    END IF;
    FOREACH rol IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      IF has_function_privilege(rol, to_regprocedure('public.' || f), 'EXECUTE') THEN
        RAISE EXCEPTION 'sim-004b: % puede ejecutar public.%', rol, f;
      END IF;
    END LOOP;
    IF EXISTS (SELECT 1 FROM pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                WHERE p.oid = to_regprocedure('public.' || f) AND a.grantee = 0) THEN
      RAISE EXCEPTION 'sim-004b: PUBLIC conserva EXECUTE sobre public.%', f;
    END IF;
    IF has_function_privilege('service_role', to_regprocedure('public.' || f), 'EXECUTE') <> (f = ANY (v_rpc)) THEN
      RAISE EXCEPTION 'sim-004b: service_role % ejecutar public.% y no deberia', CASE WHEN f = ANY (v_rpc) THEN 'NO puede' ELSE 'puede' END, f;
    END IF;
  END LOOP;
  -- la preparatoria: sus diez funciones con su cuerpo (sha256) y sus tablas
  FOR v_n IN 1 .. array_length(v_prep, 1) LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid = to_regprocedure('public.' || v_prep[v_n][1])
                    AND encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') = v_prep[v_n][2]) THEN
      RAISE EXCEPTION 'sim-004b: public.% no es la de la preparatoria (sha256 del cuerpo)', v_prep[v_n][1];
    END IF;
  END LOOP;
  IF to_regclass('public.sim_servicio') IS NULL OR to_regclass('public.sim_escrituras_v0') IS NULL OR to_regclass('public.sim_escrituras_v0_marcas') IS NULL THEN
    RAISE EXCEPTION 'sim-004b: faltan tablas de la preparatoria';
  END IF;
END
$sim_004b$;


-- ============================================================================
-- INFORME (solo lectura). Solo catalogo: ni una fila de alumnos.
-- ============================================================================
select seccion, detalle from (
  select 1 o, 'restriccion' seccion, k.conrelid::regclass::text || '.' || k.conname || ' · ' || pg_get_constraintdef(k.oid) || ' · validada=' || k.convalidated detalle
    from pg_constraint k where k.conname in ('sim_sessions_terminal_valida', 'sim_eventos_tipo_check')
  union all
  select 2, 'funcion', p.oid::regprocedure::text || ' · cuerpo sha256=' || left(encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex'), 16)
         || ' · security_definer=' || p.prosecdef || ' · config=' || coalesce(array_to_string(p.proconfig, ','), '-')
         || ' · execute: anon=' || has_function_privilege('anon', p.oid, 'EXECUTE')
         || ' authenticated=' || has_function_privilege('authenticated', p.oid, 'EXECUTE')
         || ' service_role=' || has_function_privilege('service_role', p.oid, 'EXECUTE')
    from pg_proc p where p.oid in (to_regprocedure('public.sim_comando(uuid,uuid,uuid,text,text,integer,bigint,text,text,jsonb)'),
                                   to_regprocedure('public.sim_tomar_escritor(uuid,uuid,uuid,text,integer,text,boolean)'),
                                   to_regprocedure('public.sim_avanzar_fase(uuid,uuid,uuid,uuid,text,integer,bigint,jsonb,jsonb,jsonb,jsonb)'))
  union all
  select 9, 'FIN', 'sim-004b aplicada'
) x order by o, detalle;
