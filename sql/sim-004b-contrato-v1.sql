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
-- LO QUE ACREDITA (E3-03, Astra 15-oct; CTO; diseño q.16), en la primera ejecucion y en la
-- reejecucion, ademas de lo suyo y de lo de sim-003 que no cambia (seccion 3):
--   · RLS activa en las 11 tablas protegidas (sim-003, preparatoria y las cuatro de E1R3-01);
--   · sus politicas EXACTAS (nombre, tipo, comando, roles, USING y WITH CHECK), ni mas ni menos;
--   · las ACL: la matriz efectiva de tabla; sin receptores de mas en las tablas y secuencias
--     nuevas; ninguna ACL de columna;
--   · las 20 funciones que conserva o de las que depende (sim-003, preparatoria, el cupo de
--     produccion medido en s04 y la puerta si esta) por el sha256 del cuerpo y sus atributos:
--     lenguaje, SECURITY, volatilidad, proconfig, dueño (el ejecutor) y EXECUTE;
--   · el inventario exacto de disparadores de las tablas que escriben las RPC.
--   · RLS NO forzada (relforcerowsecurity = false) en las 14 tablas que acredita (CTO 15-oct, q.16.6).
--   · antes de cambiar nada (seccion 0; RINV2-03, CTO 17-oct): el siguiente valor de cada secuencia identity de
--     las 14 tablas, por encima de max(id) (solo el agregado; tabla vacia, pasa). La s16 no lo mide: no es catalogo.
--   · antes de cambiar nada (seccion 0; RE3-01, CTO 17-oct): session_replication_role = origin y row_security = on,
--     y ninguno de los dos fijado en pg_db_role_setting para la base o los roles que ejecutan (solo por nombre); anon y
--     authenticated sin BYPASSRLS ni superusuario, y el USAGE de los esquemas que usan (RE4-01); y ninguna clave pgrst.*
--     fijada para la base, authenticator, el dueño de las RPC o los roles miembros de authenticator (1-011; s16g).
--   Cualquier desvio: «sim-004b: …» y no queda nada.
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
  -- ── E3-03 (Astra 15-oct; CTO; diseño q.16): lo que sim-004b ACREDITA del catalogo del que
  -- depende, en la primera aplicacion y en la reejecucion (seccion 4). Un desvio aborta y no queda
  -- nada (el DO es una transaccion).
  v_actual   text;
  v_esperado text;
  v_puerta   boolean;
  -- las tablas protegidas: las cuatro de sim-003, las tres de la preparatoria y las cuatro de E1R3-01
  v_protegidas text[] := ARRAY['sim_alumnos', 'sim_arrendamientos', 'sim_recibos', 'sim_eventos',
                               'sim_escrituras_v0', 'sim_escrituras_v0_marcas', 'sim_servicio',
                               'sim_sessions', 'sim_trades', 'session_drawings', 'session_chart_config'];
  -- sus secuencias (las de sim-003 y la preparatoria): sin receptores aparte del dueño
  v_secuencias text[] := ARRAY['sim_recibos_id_seq', 'sim_eventos_id_seq', 'sim_escrituras_v0_id_seq', 'sim_escrituras_v0_marcas_id_seq'];
  -- la condicion de las RESTRICTIVE de la preparatoria (o.16.7, o.16.9), con TABLA en lugar de la tabla
  v_pol_cond constant text := E'(EXISTS ( SELECT 1\n   FROM public.sim_sessions s\n  WHERE ((s.id = TABLA.session_id) AND (s.user_id = ( SELECT auth.uid() AS uid)))))';
  -- las funciones: firma · lenguaje · SECURITY DEFINER · volatilidad · proconfig · sha256 del cuerpo ·
  -- EXECUTE (receptores aparte del dueño). Dueño: el ejecutor (current_user), el mismo que aplico sim-003
  -- y la preparatoria (postgres, s06). sim-003: los cuerpos aplicados (1a951ca, APLICADOS.md); los tres
  -- que sustituye este fichero, los suyos; la preparatoria, los de 4da2df2; enforce_sim_session_limit (el
  -- disparador del cupo de sim_sessions, del que depende sim_crear_sesion), el MEDIDO en s04 (10-oct:
  -- sql/consultas/salidas/s04-esquema-simulador-2026-10-10.csv: definer, search_path=public, EXECUTE a
  -- PUBLIC, anon, authenticated y service_role).
  v_funcs text[][] := ARRAY[
    ARRAY['sim_crear_sesion(uuid,uuid,uuid,text,integer,jsonb,jsonb,jsonb,jsonb)', 'plpgsql', 'true', 'v', 'search_path=""', '0634aba8572b154630175e35f6f4041656ce967608d80060b82baddeded2eace', 'service_role', 'strict=false|leakproof=false|parallel=u|kind=f|retset=false|ret=jsonb|args=uuid,uuid,uuid,text,integer,jsonb,jsonb,jsonb,jsonb|modes=-|names=p_actor,p_session_id,p_command_id,p_sobre,p_epoca,p_sesion,p_estado,p_mercado,p_resumen|defaults=-|ndefaults=0|cost=100|rows=0|def=abb09983533ae8b167c7c3910d36ddb7'],
    ARRAY['sim_tomar_escritor(uuid,uuid,uuid,text,integer,text,boolean)', 'plpgsql', 'true', 'v', 'search_path=""', 'f58af2b0e4945d9313ea2c3bb55f4be7c003521be80ed92a5a0a56b5cdc03d48', 'service_role', 'strict=false|leakproof=false|parallel=u|kind=f|retset=false|ret=jsonb|args=uuid,uuid,uuid,text,integer,text,boolean|modes=-|names=p_actor,p_session_id,p_command_id,p_sobre,p_epoca,p_cliente_id,p_forzar|defaults=-|ndefaults=0|cost=100|rows=0|def=da773a9b444cf9cac9a610848a52b78b'],
    ARRAY['sim_comando(uuid,uuid,uuid,text,text,integer,bigint,text,text,jsonb)', 'plpgsql', 'true', 'v', 'search_path=""', '94f4db481cc09a2bc9b5d86512931186d8ec5aa98689bf6dc54bd6418798bc36', 'service_role', 'strict=false|leakproof=false|parallel=u|kind=f|retset=false|ret=jsonb|args=uuid,uuid,uuid,text,text,integer,bigint,text,text,jsonb|modes=-|names=p_actor,p_session_id,p_command_id,p_tipo,p_sobre,p_epoca,p_version_esperada,p_cliente_id,p_testigo,p_resultado|defaults=-|ndefaults=0|cost=100|rows=0|def=8d7d99c91cd3207fa686f97a13fe526c'],
    ARRAY['sim_avanzar_fase(uuid,uuid,uuid,uuid,text,integer,bigint,jsonb,jsonb,jsonb,jsonb)', 'plpgsql', 'true', 'v', 'search_path=""', '3409a208f5b26211be3406f8d4a93ed074cd1e1a72c6c3eed32f5b2d9c99526b', 'service_role', 'strict=false|leakproof=false|parallel=u|kind=f|retset=false|ret=jsonb|args=uuid,uuid,uuid,uuid,text,integer,bigint,jsonb,jsonb,jsonb,jsonb|modes=-|names=p_actor,p_padre_id,p_hija_id,p_command_id,p_sobre,p_epoca,p_version_esperada,p_sesion,p_estado,p_mercado,p_resumen|defaults=-|ndefaults=0|cost=100|rows=0|def=e26f913d4b994863373db75cd571ed94'],
    ARRAY['sim_borrar_sesion(uuid,uuid)', 'plpgsql', 'true', 'v', 'search_path=""', '210d6d9ef38f483eab2d2a73a773fcd68b49b4e58ac33d813bbf34532426360d', 'service_role', 'strict=false|leakproof=false|parallel=u|kind=f|retset=false|ret=jsonb|args=uuid,uuid|modes=-|names=p_actor,p_session_id|defaults=-|ndefaults=0|cost=100|rows=0|def=b039b2b9e9f005b2305416eb11b7e834'],
    ARRAY['sim_borrar_legacy(uuid,uuid)', 'plpgsql', 'true', 'v', 'search_path=""', '699be648cae457b5339a5f94d80bbe30f03f5952fb7dbeb9dadc79f3bce114f5', 'service_role', 'strict=false|leakproof=false|parallel=u|kind=f|retset=false|ret=jsonb|args=uuid,uuid|modes=-|names=p_user_id,p_session_id|defaults=-|ndefaults=0|cost=100|rows=0|def=5398552fbd631d0beebc6a2990633340'],
    ARRAY['sim_borrar_alumno(uuid)', 'plpgsql', 'true', 'v', 'search_path=""', '99130396d3fc4e301110d7aaf42c70240a80e7ae07d81ae738c1cba63e84cdea', 'service_role', 'strict=false|leakproof=false|parallel=u|kind=f|retset=false|ret=jsonb|args=uuid|modes=-|names=p_user_id|defaults=-|ndefaults=0|cost=100|rows=0|def=bdcb1e2a59d9422d6c7b9951482475ee'],
    ARRAY['sim_error(integer,text,jsonb)', 'sql', 'true', 'i', 'search_path=""', 'd549317d65746f847af514cee10c6c31cb6bfd7eb678900af8531e14f01ccdc0', '', 'strict=false|leakproof=false|parallel=u|kind=f|retset=false|ret=jsonb|args=integer,text,jsonb|modes=-|names=p_http,p_motivo,p_extra|defaults=''{}''::jsonb|ndefaults=1|cost=100|rows=0|def=a46517c97ea242e3901ad75f89ac92a7'],
    ARRAY['sim_bloquea_alumno(uuid)', 'plpgsql', 'true', 'v', 'search_path=""', '6f0b01b1fb10aedfe788a79dbc6500f23b43c74008f2e41f8062ad7206ffc672', '', 'strict=false|leakproof=false|parallel=u|kind=f|retset=false|ret=jsonb|args=uuid|modes=-|names=p_actor|defaults=-|ndefaults=0|cost=100|rows=0|def=c11ecb12f670396198cce2655f88387a'],
    ARRAY['sim_cierre_v0(uuid,numeric,bigint,jsonb)', 'plpgsql', 'false', 'v', 'search_path=""', '3f116e57f9ba0c4ef6b2d1176f0a91997548106ab186b9e3eff9c0f27126d70b', 'authenticated', 'strict=false|leakproof=false|parallel=u|kind=f|retset=false|ret=uuid|args=uuid,numeric,bigint,jsonb|modes=-|names=p_session_id,p_balance,p_last_timestamp,p_trade|defaults=-|ndefaults=0|cost=100|rows=0|def=4d35ee3cad1d8f34b22074607fa00e07'],
    ARRAY['sim_escrituras_v0_registra()', 'plpgsql', 'true', 'v', 'search_path=""', 'c47b1970ee48912748434f3161a62062835bfe1ec51af864659164dcddb7a6b4', '', 'strict=false|leakproof=false|parallel=u|kind=f|retset=false|ret=trigger|args=|modes=-|names=-|defaults=-|ndefaults=0|cost=100|rows=0|def=a342f7511bc8cde06164e95bedfa521d'],
    ARRAY['sim_escrituras_v0_marca_balance()', 'plpgsql', 'true', 'v', 'search_path=""', '894174ce7cbdd7f7ec69af214dd39fcff00ed12e117c48887c44bd0a058c3117', '', 'strict=false|leakproof=false|parallel=u|kind=f|retset=false|ret=trigger|args=|modes=-|names=-|defaults=-|ndefaults=0|cost=100|rows=0|def=bb380293db1ca7e5715052e4d7e0bb8a'],
    ARRAY['sim_escrituras_v0_inmutable()', 'plpgsql', 'false', 'v', 'search_path=""', '58154aea4b93fa65064079566019ad2e390969860961b6aece7281b8463b48d3', '', 'strict=false|leakproof=false|parallel=u|kind=f|retset=false|ret=trigger|args=|modes=-|names=-|defaults=-|ndefaults=0|cost=100|rows=0|def=28490ac5564dae2cc9137c700e7dac07'],
    ARRAY['sim_escrituras_v0_solo_disparador()', 'plpgsql', 'false', 'v', 'search_path=""', '6b0f60c5164ea97357a5234501a106b95fcbacfb3362a203b070ad3ca1cb3146', '', 'strict=false|leakproof=false|parallel=u|kind=f|retset=false|ret=trigger|args=|modes=-|names=-|defaults=-|ndefaults=0|cost=100|rows=0|def=b5e4e4f3516eafbfc60ef7b28f856768'],
    ARRAY['sim_escrituras_v0_parejas(uuid)', 'plpgsql', 'false', 's', 'search_path=""', '287f3eba3f68aa68385b6dd2e82512b9ccea1ed963a8def38382f1fdd6adbf32', '', 'strict=false|leakproof=false|parallel=u|kind=f|retset=true|ret=record|args=uuid|modes={i,t,t,t}|names=p_session_id,orden,escritura_update,escritura_insert|defaults=-|ndefaults=0|cost=100|rows=1000|def=7999fb9592b0450511cb9fa3276bf600'],
    ARRAY['sim_escrituras_v0_canonico(uuid)', 'plpgsql', 'false', 's', 'search_path=""', 'a84f48563b8abc6af7731fccee921d9b04231daeccd1bfa8abe81dddee0192b9', '', 'strict=false|leakproof=false|parallel=u|kind=f|retset=true|ret=record|args=uuid|modes={i,t,t}|names=p_session_id,texto,sha256|defaults=-|ndefaults=0|cost=100|rows=1000|def=a946bc032d0fa3b182ad6e3df9167074'],
    ARRAY['sim_sessions_rev_saldo()', 'plpgsql', 'false', 'v', 'search_path=""', 'c209d2326065f55a610319b3207c7b43fdc4ffb5be79302285081b0c5ce18503', '', 'strict=false|leakproof=false|parallel=u|kind=f|retset=false|ret=trigger|args=|modes=-|names=-|defaults=-|ndefaults=0|cost=100|rows=0|def=a94d218859a71712d274259e40c15a98'],
    ARRAY['sim_trades_rev_saldo()', 'plpgsql', 'true', 'v', 'search_path=""', '94c4e7220af33da3f257dfc4eae01d00acbc412b5417d025636d83f88f74569d', '', 'strict=false|leakproof=false|parallel=u|kind=f|retset=false|ret=trigger|args=|modes=-|names=-|defaults=-|ndefaults=0|cost=100|rows=0|def=4ae9b01861c73e7ae45bc51760d56764'],
    ARRAY['sim_sessions_padre_propio()', 'plpgsql', 'true', 'v', 'search_path=""', '3285b822d279587324951b93f7dd6268c2103bc5ff39f4e11d2e9a85d2623291', '', 'strict=false|leakproof=false|parallel=u|kind=f|retset=false|ret=trigger|args=|modes=-|names=-|defaults=-|ndefaults=0|cost=100|rows=0|def=758dc4d0b122b53db35f91f8f85d44ec'],
    ARRAY['enforce_sim_session_limit()', 'plpgsql', 'true', 'v', 'search_path=public', '16cecbd9686b423fa48e75a8a18bfa0a99bff07382c0c5438bc7ba402ae67505', 'PUBLIC,anon,authenticated,service_role', 'strict=false|leakproof=false|parallel=u|kind=f|retset=false|ret=trigger|args=|modes=-|names=-|defaults=-|ndefaults=0|cost=100|rows=0|def=057b9c51bfe664f3841b2b617aa724ae']];
  -- la puerta (sql/sim-004a-puerta.sql), si esta: estado 2 de la preparatoria
  v_puerta_fn text[] := ARRAY['sim_escrituras_v0_puerta()', 'plpgsql', 'false', 'v', 'search_path=""', 'fe4c7c32b146e7d525665760047af0ad49d85d2dc538e1afcf3b080a9f305883', '', 'strict=false|leakproof=false|parallel=u|kind=f|retset=false|ret=trigger|args=|modes=-|names=-|defaults=-|ndefaults=0|cost=100|rows=0|def=58a2b98ce8df1cffcb40e2ee8466e718'];
  -- los disparadores de las tablas que escriben las RPC y los disparadores (el inventario de la
  -- preparatoria: estado 1, o 2 con la puerta; y el de las demas tablas, solo los de sus FK)
  v_trg_hoy text := concat_ws(E'\n',
    'public.sim_sessions|fk:session_chart_config_session_id_fkey|"RI_FKey_cascade_del"() · when=no · args=0: · ref=public.session_chart_config · indice=public.sim_sessions_pkey · diferible=false/false · columnas=|9|O',
    'public.sim_sessions|fk:session_chart_config_session_id_fkey|"RI_FKey_noaction_upd"() · when=no · args=0: · ref=public.session_chart_config · indice=public.sim_sessions_pkey · diferible=false/false · columnas=|17|O',
    'public.sim_sessions|fk:session_drawings_session_id_fkey|"RI_FKey_cascade_del"() · when=no · args=0: · ref=public.session_drawings · indice=public.sim_sessions_pkey · diferible=false/false · columnas=|9|O',
    'public.sim_sessions|fk:session_drawings_session_id_fkey|"RI_FKey_noaction_upd"() · when=no · args=0: · ref=public.session_drawings · indice=public.sim_sessions_pkey · diferible=false/false · columnas=|17|O',
    'public.sim_sessions|fk:sim_arrendamientos_session_id_fkey|"RI_FKey_cascade_del"() · when=no · args=0: · ref=public.sim_arrendamientos · indice=public.sim_sessions_pkey · diferible=false/false · columnas=|9|O',
    'public.sim_sessions|fk:sim_arrendamientos_session_id_fkey|"RI_FKey_noaction_upd"() · when=no · args=0: · ref=public.sim_arrendamientos · indice=public.sim_sessions_pkey · diferible=false/false · columnas=|17|O',
    'public.sim_sessions|fk:sim_eventos_session_id_fkey|"RI_FKey_cascade_del"() · when=no · args=0: · ref=public.sim_eventos · indice=public.sim_sessions_pkey · diferible=false/false · columnas=|9|O',
    'public.sim_sessions|fk:sim_eventos_session_id_fkey|"RI_FKey_noaction_upd"() · when=no · args=0: · ref=public.sim_eventos · indice=public.sim_sessions_pkey · diferible=false/false · columnas=|17|O',
    'public.sim_sessions|fk:sim_recibos_session_id_fkey|"RI_FKey_cascade_del"() · when=no · args=0: · ref=public.sim_recibos · indice=public.sim_sessions_pkey · diferible=false/false · columnas=|9|O',
    'public.sim_sessions|fk:sim_recibos_session_id_fkey|"RI_FKey_noaction_upd"() · when=no · args=0: · ref=public.sim_recibos · indice=public.sim_sessions_pkey · diferible=false/false · columnas=|17|O',
    'public.sim_sessions|fk:sim_sessions_challenge_parent_id_fkey|"RI_FKey_check_ins"() · when=no · args=0: · ref=public.sim_sessions · indice=public.sim_sessions_pkey · diferible=false/false · columnas=|5|O',
    'public.sim_sessions|fk:sim_sessions_challenge_parent_id_fkey|"RI_FKey_check_upd"() · when=no · args=0: · ref=public.sim_sessions · indice=public.sim_sessions_pkey · diferible=false/false · columnas=|17|O',
    'public.sim_sessions|fk:sim_sessions_challenge_parent_id_fkey|"RI_FKey_noaction_upd"() · when=no · args=0: · ref=public.sim_sessions · indice=public.sim_sessions_pkey · diferible=false/false · columnas=|17|O',
    'public.sim_sessions|fk:sim_sessions_challenge_parent_id_fkey|"RI_FKey_setnull_del"() · when=no · args=0: · ref=public.sim_sessions · indice=public.sim_sessions_pkey · diferible=false/false · columnas=|9|O',
    'public.sim_sessions|fk:sim_sessions_user_id_fkey|"RI_FKey_check_ins"() · when=no · args=0: · ref=auth.users · indice=auth.users_pkey · diferible=false/false · columnas=|5|O',
    'public.sim_sessions|fk:sim_sessions_user_id_fkey|"RI_FKey_check_upd"() · when=no · args=0: · ref=auth.users · indice=auth.users_pkey · diferible=false/false · columnas=|17|O',
    'public.sim_sessions|fk:sim_sessions_user_id_perfil_fkey|"RI_FKey_check_ins"() · when=no · args=0: · ref=public.profiles · indice=public.profiles_pkey · diferible=false/false · columnas=|5|O',
    'public.sim_sessions|fk:sim_sessions_user_id_perfil_fkey|"RI_FKey_check_upd"() · when=no · args=0: · ref=public.profiles · indice=public.profiles_pkey · diferible=false/false · columnas=|17|O',
    'public.sim_sessions|fk:sim_trades_session_id_fkey|"RI_FKey_cascade_del"() · when=no · args=0: · ref=public.sim_trades · indice=public.sim_sessions_pkey · diferible=false/false · columnas=|9|O',
    'public.sim_sessions|fk:sim_trades_session_id_fkey|"RI_FKey_noaction_upd"() · when=no · args=0: · ref=public.sim_trades · indice=public.sim_sessions_pkey · diferible=false/false · columnas=|17|O',
    'public.sim_sessions|trg_enforce_sim_session_limit|CREATE TRIGGER trg_enforce_sim_session_limit BEFORE INSERT ON public.sim_sessions FOR EACH ROW EXECUTE FUNCTION public.enforce_sim_session_limit()|7|O',
    'public.sim_trades|fk:sim_trades_evento_id_fkey|"RI_FKey_check_ins"() · when=no · args=0: · ref=public.sim_eventos · indice=public.sim_eventos_pkey · diferible=false/false · columnas=|5|O',
    'public.sim_trades|fk:sim_trades_evento_id_fkey|"RI_FKey_check_upd"() · when=no · args=0: · ref=public.sim_eventos · indice=public.sim_eventos_pkey · diferible=false/false · columnas=|17|O',
    'public.sim_trades|fk:sim_trades_session_id_fkey|"RI_FKey_check_ins"() · when=no · args=0: · ref=public.sim_sessions · indice=public.sim_sessions_pkey · diferible=false/false · columnas=|5|O',
    'public.sim_trades|fk:sim_trades_session_id_fkey|"RI_FKey_check_upd"() · when=no · args=0: · ref=public.sim_sessions · indice=public.sim_sessions_pkey · diferible=false/false · columnas=|17|O',
    'public.sim_trades|fk:sim_trades_user_id_fkey|"RI_FKey_check_ins"() · when=no · args=0: · ref=auth.users · indice=auth.users_pkey · diferible=false/false · columnas=|5|O',
    'public.sim_trades|fk:sim_trades_user_id_fkey|"RI_FKey_check_upd"() · when=no · args=0: · ref=auth.users · indice=auth.users_pkey · diferible=false/false · columnas=|17|O');
  -- lo que añade este fichero: estado 1
  v_trg_registro text := concat_ws(E'\n',
    'public.sim_escrituras_v0_marcas|sim_escrituras_v0_inmutable_fila|CREATE TRIGGER sim_escrituras_v0_inmutable_fila BEFORE DELETE OR UPDATE ON public.sim_escrituras_v0_marcas FOR EACH ROW EXECUTE FUNCTION public.sim_escrituras_v0_inmutable()|27|O',
    'public.sim_escrituras_v0_marcas|sim_escrituras_v0_inmutable_truncate|CREATE TRIGGER sim_escrituras_v0_inmutable_truncate BEFORE TRUNCATE ON public.sim_escrituras_v0_marcas FOR EACH STATEMENT EXECUTE FUNCTION public.sim_escrituras_v0_inmutable()|34|O',
    'public.sim_escrituras_v0_marcas|sim_escrituras_v0_solo_disparador|CREATE TRIGGER sim_escrituras_v0_solo_disparador BEFORE INSERT ON public.sim_escrituras_v0_marcas FOR EACH ROW EXECUTE FUNCTION public.sim_escrituras_v0_solo_disparador()|7|O',
    'public.sim_escrituras_v0|sim_escrituras_v0_inmutable_fila|CREATE TRIGGER sim_escrituras_v0_inmutable_fila BEFORE DELETE OR UPDATE ON public.sim_escrituras_v0 FOR EACH ROW EXECUTE FUNCTION public.sim_escrituras_v0_inmutable()|27|O',
    'public.sim_escrituras_v0|sim_escrituras_v0_inmutable_truncate|CREATE TRIGGER sim_escrituras_v0_inmutable_truncate BEFORE TRUNCATE ON public.sim_escrituras_v0 FOR EACH STATEMENT EXECUTE FUNCTION public.sim_escrituras_v0_inmutable()|34|O',
    'public.sim_escrituras_v0|sim_escrituras_v0_solo_disparador|CREATE TRIGGER sim_escrituras_v0_solo_disparador BEFORE INSERT ON public.sim_escrituras_v0 FOR EACH ROW EXECUTE FUNCTION public.sim_escrituras_v0_solo_disparador()|7|O',
    'public.sim_sessions|sim_escrituras_v0_a|CREATE TRIGGER sim_escrituras_v0_a AFTER INSERT OR DELETE OR UPDATE ON public.sim_sessions FOR EACH ROW EXECUTE FUNCTION public.sim_escrituras_v0_registra()|29|O',
    'public.sim_sessions|sim_escrituras_v0_b_balance|CREATE TRIGGER sim_escrituras_v0_b_balance AFTER UPDATE OF balance ON public.sim_sessions FOR EACH ROW EXECUTE FUNCTION public.sim_escrituras_v0_marca_balance()|17|O',
    'public.sim_sessions|sim_sessions_padre_propio|CREATE TRIGGER sim_sessions_padre_propio BEFORE INSERT OR UPDATE ON public.sim_sessions FOR EACH ROW EXECUTE FUNCTION public.sim_sessions_padre_propio()|23|O',
    'public.sim_sessions|sim_sessions_rev_saldo|CREATE TRIGGER sim_sessions_rev_saldo BEFORE INSERT OR UPDATE ON public.sim_sessions FOR EACH ROW EXECUTE FUNCTION public.sim_sessions_rev_saldo()|23|O',
    'public.sim_trades|sim_escrituras_v0_a|CREATE TRIGGER sim_escrituras_v0_a AFTER INSERT OR DELETE OR UPDATE ON public.sim_trades FOR EACH ROW EXECUTE FUNCTION public.sim_escrituras_v0_registra()|29|O',
    'public.sim_trades|sim_trades_rev_saldo|CREATE TRIGGER sim_trades_rev_saldo AFTER INSERT OR DELETE OR UPDATE ON public.sim_trades FOR EACH ROW EXECUTE FUNCTION public.sim_trades_rev_saldo()|29|O');
  -- lo que añade sql/sim-004a-puerta.sql: estado 2
  v_trg_puerta text := concat_ws(E'\n',
    'public.sim_sessions|sim_escrituras_v0_puerta|CREATE TRIGGER sim_escrituras_v0_puerta BEFORE INSERT OR DELETE OR UPDATE ON public.sim_sessions FOR EACH ROW EXECUTE FUNCTION public.sim_escrituras_v0_puerta()|31|O',
    'public.sim_trades|sim_escrituras_v0_puerta|CREATE TRIGGER sim_escrituras_v0_puerta BEFORE INSERT OR DELETE OR UPDATE ON public.sim_trades FOR EACH ROW EXECUTE FUNCTION public.sim_escrituras_v0_puerta()|31|O');
  v_trg_otros text := concat_ws(E'\n',
    'auth.users|fk:session_chart_config_user_id_fkey|"RI_FKey_cascade_del"() · when=no · args=0: · ref=public.session_chart_config · indice=auth.users_pkey · diferible=false/false · columnas=|9|O',
    'auth.users|fk:session_chart_config_user_id_fkey|"RI_FKey_noaction_upd"() · when=no · args=0: · ref=public.session_chart_config · indice=auth.users_pkey · diferible=false/false · columnas=|17|O',
    'auth.users|fk:session_drawings_user_id_fkey|"RI_FKey_cascade_del"() · when=no · args=0: · ref=public.session_drawings · indice=auth.users_pkey · diferible=false/false · columnas=|9|O',
    'auth.users|fk:session_drawings_user_id_fkey|"RI_FKey_noaction_upd"() · when=no · args=0: · ref=public.session_drawings · indice=auth.users_pkey · diferible=false/false · columnas=|17|O',
    'auth.users|fk:sim_drawing_templates_user_id_fkey|"RI_FKey_cascade_del"() · when=no · args=0: · ref=public.sim_drawing_templates · indice=auth.users_pkey · diferible=false/false · columnas=|9|O',
    'auth.users|fk:sim_drawing_templates_user_id_fkey|"RI_FKey_noaction_upd"() · when=no · args=0: · ref=public.sim_drawing_templates · indice=auth.users_pkey · diferible=false/false · columnas=|17|O',
    'auth.users|fk:sim_sessions_user_id_fkey|"RI_FKey_cascade_del"() · when=no · args=0: · ref=public.sim_sessions · indice=auth.users_pkey · diferible=false/false · columnas=|9|O',
    'auth.users|fk:sim_sessions_user_id_fkey|"RI_FKey_noaction_upd"() · when=no · args=0: · ref=public.sim_sessions · indice=auth.users_pkey · diferible=false/false · columnas=|17|O',
    'auth.users|fk:sim_trades_user_id_fkey|"RI_FKey_cascade_del"() · when=no · args=0: · ref=public.sim_trades · indice=auth.users_pkey · diferible=false/false · columnas=|9|O',
    'auth.users|fk:sim_trades_user_id_fkey|"RI_FKey_noaction_upd"() · when=no · args=0: · ref=public.sim_trades · indice=auth.users_pkey · diferible=false/false · columnas=|17|O',
    'auth.users|fk:user_chart_config_user_id_fkey|"RI_FKey_cascade_del"() · when=no · args=0: · ref=public.user_chart_config · indice=auth.users_pkey · diferible=false/false · columnas=|9|O',
    'auth.users|fk:user_chart_config_user_id_fkey|"RI_FKey_noaction_upd"() · when=no · args=0: · ref=public.user_chart_config · indice=auth.users_pkey · diferible=false/false · columnas=|17|O',
    'auth.users|fk:user_tool_config_user_id_fkey|"RI_FKey_cascade_del"() · when=no · args=0: · ref=public.user_tool_config · indice=auth.users_pkey · diferible=false/false · columnas=|9|O',
    'auth.users|fk:user_tool_config_user_id_fkey|"RI_FKey_noaction_upd"() · when=no · args=0: · ref=public.user_tool_config · indice=auth.users_pkey · diferible=false/false · columnas=|17|O',
    'public.profiles|fk:sim_alumnos_user_id_fkey|"RI_FKey_cascade_del"() · when=no · args=0: · ref=public.sim_alumnos · indice=public.profiles_pkey · diferible=false/false · columnas=|9|O',
    'public.profiles|fk:sim_alumnos_user_id_fkey|"RI_FKey_noaction_upd"() · when=no · args=0: · ref=public.sim_alumnos · indice=public.profiles_pkey · diferible=false/false · columnas=|17|O',
    'public.profiles|fk:sim_sessions_user_id_perfil_fkey|"RI_FKey_cascade_del"() · when=no · args=0: · ref=public.sim_sessions · indice=public.profiles_pkey · diferible=false/false · columnas=|9|O',
    'public.profiles|fk:sim_sessions_user_id_perfil_fkey|"RI_FKey_noaction_upd"() · when=no · args=0: · ref=public.sim_sessions · indice=public.profiles_pkey · diferible=false/false · columnas=|17|O',
    'public.session_chart_config|fk:session_chart_config_session_id_fkey|"RI_FKey_check_ins"() · when=no · args=0: · ref=public.sim_sessions · indice=public.sim_sessions_pkey · diferible=false/false · columnas=|5|O',
    'public.session_chart_config|fk:session_chart_config_session_id_fkey|"RI_FKey_check_upd"() · when=no · args=0: · ref=public.sim_sessions · indice=public.sim_sessions_pkey · diferible=false/false · columnas=|17|O',
    'public.session_chart_config|fk:session_chart_config_user_id_fkey|"RI_FKey_check_ins"() · when=no · args=0: · ref=auth.users · indice=auth.users_pkey · diferible=false/false · columnas=|5|O',
    'public.session_chart_config|fk:session_chart_config_user_id_fkey|"RI_FKey_check_upd"() · when=no · args=0: · ref=auth.users · indice=auth.users_pkey · diferible=false/false · columnas=|17|O',
    'public.session_drawings|fk:session_drawings_session_id_fkey|"RI_FKey_check_ins"() · when=no · args=0: · ref=public.sim_sessions · indice=public.sim_sessions_pkey · diferible=false/false · columnas=|5|O',
    'public.session_drawings|fk:session_drawings_session_id_fkey|"RI_FKey_check_upd"() · when=no · args=0: · ref=public.sim_sessions · indice=public.sim_sessions_pkey · diferible=false/false · columnas=|17|O',
    'public.session_drawings|fk:session_drawings_user_id_fkey|"RI_FKey_check_ins"() · when=no · args=0: · ref=auth.users · indice=auth.users_pkey · diferible=false/false · columnas=|5|O',
    'public.session_drawings|fk:session_drawings_user_id_fkey|"RI_FKey_check_upd"() · when=no · args=0: · ref=auth.users · indice=auth.users_pkey · diferible=false/false · columnas=|17|O',
    'public.sim_alumnos|fk:sim_alumnos_user_id_fkey|"RI_FKey_check_ins"() · when=no · args=0: · ref=public.profiles · indice=public.profiles_pkey · diferible=false/false · columnas=|5|O',
    'public.sim_alumnos|fk:sim_alumnos_user_id_fkey|"RI_FKey_check_upd"() · when=no · args=0: · ref=public.profiles · indice=public.profiles_pkey · diferible=false/false · columnas=|17|O',
    'public.sim_arrendamientos|fk:sim_arrendamientos_session_id_fkey|"RI_FKey_check_ins"() · when=no · args=0: · ref=public.sim_sessions · indice=public.sim_sessions_pkey · diferible=false/false · columnas=|5|O',
    'public.sim_arrendamientos|fk:sim_arrendamientos_session_id_fkey|"RI_FKey_check_upd"() · when=no · args=0: · ref=public.sim_sessions · indice=public.sim_sessions_pkey · diferible=false/false · columnas=|17|O',
    'public.sim_drawing_templates|fk:sim_drawing_templates_user_id_fkey|"RI_FKey_check_ins"() · when=no · args=0: · ref=auth.users · indice=auth.users_pkey · diferible=false/false · columnas=|5|O',
    'public.sim_drawing_templates|fk:sim_drawing_templates_user_id_fkey|"RI_FKey_check_upd"() · when=no · args=0: · ref=auth.users · indice=auth.users_pkey · diferible=false/false · columnas=|17|O',
    'public.sim_eventos|fk:sim_eventos_session_id_fkey|"RI_FKey_check_ins"() · when=no · args=0: · ref=public.sim_sessions · indice=public.sim_sessions_pkey · diferible=false/false · columnas=|5|O',
    'public.sim_eventos|fk:sim_eventos_session_id_fkey|"RI_FKey_check_upd"() · when=no · args=0: · ref=public.sim_sessions · indice=public.sim_sessions_pkey · diferible=false/false · columnas=|17|O',
    'public.sim_eventos|fk:sim_trades_evento_id_fkey|"RI_FKey_cascade_del"() · when=no · args=0: · ref=public.sim_trades · indice=public.sim_eventos_pkey · diferible=false/false · columnas=|9|O',
    'public.sim_eventos|fk:sim_trades_evento_id_fkey|"RI_FKey_noaction_upd"() · when=no · args=0: · ref=public.sim_trades · indice=public.sim_eventos_pkey · diferible=false/false · columnas=|17|O',
    'public.sim_recibos|fk:sim_recibos_session_id_fkey|"RI_FKey_check_ins"() · when=no · args=0: · ref=public.sim_sessions · indice=public.sim_sessions_pkey · diferible=false/false · columnas=|5|O',
    'public.sim_recibos|fk:sim_recibos_session_id_fkey|"RI_FKey_check_upd"() · when=no · args=0: · ref=public.sim_sessions · indice=public.sim_sessions_pkey · diferible=false/false · columnas=|17|O',
    'public.user_chart_config|fk:user_chart_config_user_id_fkey|"RI_FKey_check_ins"() · when=no · args=0: · ref=auth.users · indice=auth.users_pkey · diferible=false/false · columnas=|5|O',
    'public.user_chart_config|fk:user_chart_config_user_id_fkey|"RI_FKey_check_upd"() · when=no · args=0: · ref=auth.users · indice=auth.users_pkey · diferible=false/false · columnas=|17|O',
    'public.user_tool_config|fk:user_tool_config_user_id_fkey|"RI_FKey_check_ins"() · when=no · args=0: · ref=auth.users · indice=auth.users_pkey · diferible=false/false · columnas=|5|O',
    'public.user_tool_config|fk:user_tool_config_user_id_fkey|"RI_FKey_check_upd"() · when=no · args=0: · ref=auth.users · indice=auth.users_pkey · diferible=false/false · columnas=|17|O');
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
  -- RE3-01 (revisor interno de c4d46e3; CTO 17-oct, orden 1-010): los ajustes que cambian la semantica sin tocar el
  -- catalogo. session_replication_role = replica apaga los disparadores (tambien los de las FK) y row_security = off cambia
  -- la RLS: efectivos origin y on, y ninguno fijado en pg_db_role_setting para la base o para los roles que ejecutan
  -- (postgres, authenticator, authenticated, anon, service_role y el ejecutor). SOLO por nombre: no se lee ni se imprime
  -- ningun valor de pg_db_role_setting (los de Supabase pueden ser secretos). El resto de pg_db_role_setting queda fuera:
  -- limite declarado
  SELECT string_agg(a.detalle, '; ' ORDER BY a.nombre) INTO v_txt FROM (
  select g.nombre, coalesce(pg_catalog.current_setting(g.nombre, true) = g.esperado, true) efectivo_bien, f.donde,
           g.nombre || case when g.esperado is null then '' else ': efectivo ' || g.esperado || '=' || (pg_catalog.current_setting(g.nombre, true) = g.esperado)::text end
           || ' · fijado en pg_db_role_setting: ' || coalesce(f.donde, 'ninguno') detalle
      from (values ('session_replication_role', 'origin'), ('row_security', 'on'), ('pgrst.*', null)) g(nombre, esperado)
           left join (select case when split_part(c.x, '=', 1) like 'pgrst.%' then 'pgrst.*' else split_part(c.x, '=', 1) end nombre,
             string_agg(case when s.setrole = 0 then 'base' else 'rol ' || r.rolname::text end
                        || case when s.setdatabase = 0 then ' (en todas las bases)' else '' end
                      || case when split_part(c.x, '=', 1) like 'pgrst.%' then ': ' || split_part(c.x, '=', 1) else '' end, ', '
                        order by case when s.setrole = 0 then 'base' else 'rol ' || r.rolname::text end) donde
        from pg_catalog.pg_db_role_setting s left join pg_catalog.pg_roles r on r.oid = s.setrole
             cross join lateral unnest(s.setconfig) c(x)
       where (s.setdatabase = 0 or s.setdatabase = (select d.oid from pg_catalog.pg_database d where d.datname = pg_catalog.current_database()))
         -- CTO 17-oct, orden 1-011: y el dueño de las RPC y todo rol miembro de authenticator o del que authenticator sea miembro
       and (s.setrole = 0 or r.rolname in ('postgres', 'authenticator', 'authenticated', 'anon', 'service_role') or r.rolname = current_user
            or r.oid = (select p.proowner from pg_catalog.pg_proc p where p.oid = pg_catalog.to_regprocedure('public.sim_crear_sesion(uuid,uuid,uuid,text,integer,jsonb,jsonb,jsonb,jsonb)'))
            or exists (select 1 from pg_catalog.pg_roles a where a.rolname = 'authenticator' and r.oid <> a.oid
                       and (pg_catalog.pg_has_role(r.oid, a.oid, 'MEMBER') or pg_catalog.pg_has_role(a.oid, r.oid, 'MEMBER'))))
         and (split_part(c.x, '=', 1) in ('session_replication_role', 'row_security') or split_part(c.x, '=', 1) like 'pgrst.%')
       group by 1) f on f.nombre = g.nombre
  ) a WHERE NOT a.efectivo_bien OR a.donde IS NOT NULL;
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'sim-004b: ajustes que cambian la semantica (RE3-01): %; no se toca nada', v_txt;
  END IF;
  -- RE4-01 (revisor interno de d2910e6): los roles del alumno sin BYPASSRLS ni superusuario (ALTER ROLE authenticated
  -- BYPASSRLS es DDL ordinario para postgres, que tiene ADMIN sobre ellos, s06, y deja ver y escribir lo ajeno); y el USAGE
  -- de los esquemas que usan: el dueño de las RPC en public y extensions, authenticated en public y auth (sin el, 42501)
  SELECT string_agg(x.objeto || ': ' || x.detalle, '; ' ORDER BY x.objeto) INTO v_txt FROM (
  select 'roles del alumno' objeto,
           coalesce(bool_and(not r.rolsuper and not r.rolbypassrls), false) and count(*) = 2 bien,
           coalesce(string_agg(r.rolname::text || ': superusuario=' || r.rolsuper::text || ' bypassrls=' || r.rolbypassrls::text, ' · ' order by r.rolname), 'NO EXISTEN') detalle
      from pg_catalog.pg_roles r where r.rolname in ('anon', 'authenticated')
    union all
    select 'uso de esquemas',
           bool_and(coalesce(u.uso, false)),
           string_agg(u.quien || ' USAGE ' || u.esquema || '=' || coalesce(u.uso::text, 'NO EXISTE'), ' · ' order by u.quien, u.esquema)
      from (select 'dueño_rpc' quien, e.esquema, pg_catalog.has_schema_privilege(o.proowner, e.esquema, 'USAGE') uso
              from (values ('public'), ('extensions')) e(esquema)
                   left join pg_catalog.pg_proc o on o.oid = pg_catalog.to_regprocedure('public.sim_crear_sesion(uuid,uuid,uuid,text,integer,jsonb,jsonb,jsonb,jsonb)')
            union all
            select 'authenticated', e.esquema, pg_catalog.has_schema_privilege('authenticated', e.esquema, 'USAGE')
              from (values ('public'), ('auth')) e(esquema)) u
  ) x WHERE NOT x.bien;
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'sim-004b: roles o esquemas que cambian el acceso (RE4-01): %; no se toca nada', v_txt;
  END IF;
  -- RINV2-03 (CTO 17-oct, orden 1-006): el estado de cada secuencia identity no es catalogo (cambia con el uso normal):
  -- la s16 no lo mide; aqui, antes de cualquier cambio, el siguiente valor que daria (last_value si is_called = false;
  -- last_value + incremento si true) debe quedar POR ENCIMA de max(columna). Solo agregados: el max, ninguna fila.
  -- Tabla vacia: pasa. Una secuencia reiniciada a max(id) o por debajo: aborta y no se toca nada.
  FOR v_rel, v_def, v_txt IN
    SELECT pg_catalog.quote_ident(n.nspname) || '.' || pg_catalog.quote_ident(c.relname), pg_catalog.quote_ident(a.attname),
           pg_catalog.pg_get_serial_sequence(pg_catalog.quote_ident(n.nspname) || '.' || pg_catalog.quote_ident(c.relname), a.attname)
      FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped AND a.attidentity <> ''
     WHERE n.nspname = 'public' AND c.relname IN ('sim_alumnos', 'sim_arrendamientos', 'sim_recibos', 'sim_eventos', 'sim_escrituras_v0',
           'sim_escrituras_v0_marcas', 'sim_servicio', 'sim_sessions', 'sim_trades', 'session_drawings', 'session_chart_config',
           'sim_drawing_templates', 'user_chart_config', 'user_tool_config')
     ORDER BY 1, 2
  LOOP
    DECLARE
      v_max numeric; v_ult numeric; v_llamada boolean; v_inc numeric;
    BEGIN
      IF v_txt IS NULL THEN RAISE EXCEPTION 'sim-004b: %.% es identity y no tiene secuencia: no se toca nada', v_rel, v_def; END IF;
      SELECT q.seqincrement INTO v_inc FROM pg_catalog.pg_sequence q WHERE q.seqrelid = v_txt::regclass;
      EXECUTE format('SELECT last_value, is_called FROM %s', v_txt) INTO v_ult, v_llamada;
      EXECUTE format('SELECT max(%s) FROM %s', v_def, v_rel) INTO v_max;
      IF v_max IS NOT NULL AND (v_inc IS NULL OR v_inc <= 0
         OR (CASE WHEN v_llamada THEN v_ult + v_inc ELSE v_ult END) <= v_max) THEN
        RAISE EXCEPTION 'sim-004b: la secuencia % de %.% daria % y max(%) es %: reiniciada por debajo de lo que hay; no se toca nada',
          v_txt, v_rel, v_def, CASE WHEN v_llamada THEN v_ult + v_inc ELSE v_ult END, v_def, v_max;
      END IF;
    END;
  END LOOP;

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
                    AND i.indisunique AND i.indisvalid AND i.indisready AND i.indislive AND pg_get_indexdef(i.indexrelid) = v_def) THEN
      RAISE EXCEPTION 'sim-004b: el indice unico % falta, no es valido, no esta listo o vivo, o no es el previsto (%)', f, v_def;
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
  -- ── 4 · E3-03 (Astra 15-oct; CTO; diseño q.16): el catalogo del que depende sim-004b ──────
  -- Tambien en la reejecucion. Cualquier desvio revienta y el DO entero se deshace: no queda nada.
  -- 4.1 RLS activa en las tablas protegidas (sin ella, sus politicas existen sin aplicarse)
  SELECT string_agg(t, ', ' ORDER BY t COLLATE "C") INTO v_txt FROM unnest(v_protegidas) t
   WHERE NOT coalesce((SELECT c.relrowsecurity FROM pg_class c WHERE c.oid = to_regclass('public.' || t)), false);
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'sim-004b: RLS apagada (o tabla ausente) en public.%: no se toca nada', v_txt;
  END IF;
  -- RLS NO forzada en ninguna tabla que acredita (CTO 15-oct, q.16.6): una FORCE inesperada haria que las
  -- RPC SECURITY DEFINER del dueño pasaran por RLS y se rompieran
  SELECT string_agg(c.relname, ', ' ORDER BY c.relname COLLATE "C") INTO v_txt FROM pg_class c
   WHERE c.oid IN (SELECT to_regclass('public.' || x) FROM unnest(v_protegidas || ARRAY['sim_drawing_templates', 'user_chart_config', 'user_tool_config']) x)
     AND c.relforcerowsecurity;
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'sim-004b: RLS FORZADA en public.%: no se toca nada', v_txt;
  END IF;
  -- 4.2 las politicas EXACTAS de las tablas protegidas (nombre, permisiva/restrictiva, comando, roles,
  -- USING y WITH CHECK), ni una de mas ni de menos; con search_path vacio (nombres completos)
  v_sp := current_setting('search_path');
  PERFORM set_config('search_path', '', true);
  SELECT coalesce(string_agg(x, E'\n' ORDER BY x COLLATE "C"), '') INTO v_actual FROM (
    SELECT p.tablename || '|' || p.policyname || '|' || p.permissive || '|' || p.cmd || '|' || p.roles::text || '|'
           || coalesce(p.qual, '-') || '|' || coalesce(p.with_check, '-') AS x
      FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = ANY (v_protegidas)) s;
  SELECT string_agg(x, E'\n' ORDER BY x COLLATE "C") INTO v_esperado FROM (
    SELECT unnest(ARRAY[
      'sim_recibos|sim_recibos_select_propios|PERMISSIVE|SELECT|{authenticated}|(auth.uid() = user_id)|-',
      'sim_eventos|sim_eventos_select_propios|PERMISSIVE|SELECT|{authenticated}|(auth.uid() = user_id)|-',
      'sim_servicio|sim_servicio_lectura|PERMISSIVE|SELECT|{authenticated}|true|-']) AS x
    UNION ALL   -- las de s04 (10-oct), FOR ALL TO public
    SELECT t || '|' || n || '|PERMISSIVE|ALL|{public}|(auth.uid() = user_id)|-'
      FROM (VALUES ('sim_sessions', 'Users see own sessions'), ('sim_trades', 'Users see own trades'),
                   ('session_drawings', 'user owns session drawings'), ('session_chart_config', 'user owns session config')) v(t, n)
    UNION ALL   -- las RESTRICTIVE de la preparatoria
    SELECT t || '|' || t || '_sesion_propia_insert|RESTRICTIVE|INSERT|{authenticated}|-|' || replace(v_pol_cond, 'TABLA', t)
      FROM unnest(ARRAY['sim_trades', 'session_drawings', 'session_chart_config']) t
    UNION ALL
    SELECT t || '|' || t || '_sesion_propia_update|RESTRICTIVE|UPDATE|{authenticated}|' || replace(v_pol_cond, 'TABLA', t) || '|' || replace(v_pol_cond, 'TABLA', t)
      FROM unnest(ARRAY['sim_trades', 'session_drawings', 'session_chart_config']) t) s;
  PERFORM set_config('search_path', v_sp, true);
  IF v_actual IS DISTINCT FROM v_esperado THEN
    RAISE EXCEPTION 'sim-004b: las politicas de las tablas protegidas no son las previstas. De mas: [%] · De menos: [%]',
      (SELECT string_agg(x, ' ; ') FROM (SELECT regexp_split_to_table(v_actual, E'\n') x EXCEPT ALL SELECT regexp_split_to_table(v_esperado, E'\n')) d),
      (SELECT string_agg(x, ' ; ') FROM (SELECT regexp_split_to_table(v_esperado, E'\n') x EXCEPT ALL SELECT regexp_split_to_table(v_actual, E'\n')) d);
  END IF;
  -- 4.3 las ACL. La matriz EFECTIVA de los siete privilegios de tabla para PUBLIC, anon, authenticated y
  -- service_role: en las cuatro de s04 la medida (10-oct; sim-003 y la preparatoria no la tocan); en las
  -- siete nuevas, SELECT solo de authenticated y service_role en sim_recibos, sim_eventos y sim_servicio
  SELECT string_agg(r || ':' || t || ':' || p, ', ' ORDER BY r COLLATE "C", t COLLATE "C", p COLLATE "C") INTO v_txt
    FROM unnest(ARRAY['public', 'anon', 'authenticated', 'service_role']) r, unnest(v_protegidas) t,
         unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) p
   WHERE has_table_privilege(r, 'public.' || t, p) <> CASE
           WHEN t IN ('sim_sessions', 'sim_trades', 'session_drawings', 'session_chart_config')
             THEN r = 'service_role' OR (r = 'authenticated' AND p IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE'))
           ELSE p = 'SELECT' AND r IN ('authenticated', 'service_role') AND t IN ('sim_recibos', 'sim_eventos', 'sim_servicio') END;
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'sim-004b: privilegios de tabla no previstos (rol:tabla:privilegio): %', v_txt; END IF;
  -- en las siete nuevas y sus secuencias, ningun receptor aparte del dueño y de esos SELECT (cualquier privilegio)
  SELECT string_agg(c.relname || ':' || CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE a.grantee::regrole::text END || '=' || a.privilege_type, ', '
                    ORDER BY c.relname COLLATE "C", a.privilege_type COLLATE "C") INTO v_txt
    FROM pg_class c, aclexplode(coalesce(c.relacl, acldefault(CASE WHEN c.relkind = 'S' THEN 's'::"char" ELSE 'r'::"char" END, c.relowner))) a
   WHERE c.oid IN (SELECT to_regclass('public.' || x) FROM unnest(v_protegidas[1:7] || v_secuencias) x)
     AND a.grantee <> c.relowner
     AND NOT (a.privilege_type = 'SELECT' AND c.relname IN ('sim_recibos', 'sim_eventos', 'sim_servicio')
              AND a.grantee IN ('authenticated'::regrole, 'service_role'::regrole));
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'sim-004b: receptores de mas en las tablas o secuencias nuevas: %', v_txt; END IF;
  -- ninguna ACL de columna en las tablas protegidas (s11, 13-oct: 0 en las cuatro de s04)
  SELECT string_agg(a.attrelid::regclass::text || '.' || a.attname || ' ' || a.attacl::text, ', ') INTO v_txt
    FROM pg_attribute a
   WHERE a.attrelid IN (SELECT to_regclass('public.' || x) FROM unnest(v_protegidas) x) AND a.attnum > 0 AND coalesce(cardinality(a.attacl), 0) > 0;
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'sim-004b: ACL de columna no prevista: %', v_txt; END IF;
  -- 4.4 las funciones que conserva y de las que depende: cuerpo (sha256) y atributos, no el nombre
  v_puerta := to_regprocedure('public.sim_escrituras_v0_puerta()') IS NOT NULL;
  FOR v_n IN 1 .. array_length(v_funcs, 1) + CASE WHEN v_puerta THEN 1 ELSE 0 END LOOP
    IF v_n <= array_length(v_funcs, 1) THEN
      f := v_funcs[v_n][1];
      v_esperado := concat_ws('|', v_funcs[v_n][2], v_funcs[v_n][3], v_funcs[v_n][4], v_funcs[v_n][5], 'dueño=ejecutor', v_funcs[v_n][6], v_funcs[v_n][7], v_funcs[v_n][8]);
    ELSE
      f := v_puerta_fn[1];
      v_esperado := concat_ws('|', v_puerta_fn[2], v_puerta_fn[3], v_puerta_fn[4], v_puerta_fn[5], 'dueño=ejecutor', v_puerta_fn[6], v_puerta_fn[7], v_puerta_fn[8]);
    END IF;
    v_actual := NULL;
    SELECT concat_ws('|', l.lanname, p.prosecdef::text, p.provolatile::text, coalesce(array_to_string(p.proconfig, ','), '-'),
                     CASE WHEN p.proowner = (SELECT r.oid FROM pg_roles r WHERE r.rolname = current_user) THEN 'dueño=ejecutor'
                          ELSE 'dueño=' || pg_get_userbyid(p.proowner) END,
                     encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex'),
                     coalesce((SELECT string_agg(g, ',' ORDER BY g COLLATE "C") FROM (
                                 -- R3E3-03 (revisor interno): la opcion de concesion tambien cuenta
                                 SELECT CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE a.grantee::regrole::text END
                                        || CASE WHEN a.is_grantable THEN ' (con opcion de concesion)' ELSE '' END AS g
                                   FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                                  WHERE a.grantee <> p.proowner AND a.privilege_type = 'EXECUTE') e), ''),
                     -- E3R2-01 (Astra r2; CTO 16-oct): TODOS los atributos de pg_proc que cambian la ejecucion (STRICT,
                     -- LEAKPROOF, PARALLEL, tipo, conjunto, resultado, argumentos, modos, nombres, valores por defecto,
                     -- COST, ROWS) y el md5 de pg_get_functiondef completo. Los valores, medidos en el montaje con los
                     -- ficheros ejecutados en produccion (APLICADOS.md); la misma expresion que s16
                     concat_ws('|', 'strict=' || p.proisstrict::text, 'leakproof=' || p.proleakproof::text, 'parallel=' || p.proparallel::text, 'kind=' || p.prokind::text, 'retset=' || p.proretset::text, 'ret=' || format_type(p.prorettype, NULL), 'args=' || coalesce((SELECT string_agg(format_type(u.t, NULL), ',' ORDER BY u.n) FROM unnest(p.proargtypes::oid[]) WITH ORDINALITY u(t, n)), ''), 'modes=' || coalesce(p.proargmodes::text, '-'), 'names=' || coalesce(array_to_string(p.proargnames, ','), '-'), 'defaults=' || coalesce(pg_get_expr(p.proargdefaults, 0), '-'), 'ndefaults=' || p.pronargdefaults::text, 'cost=' || p.procost::text, 'rows=' || p.prorows::text, 'def=' || md5(pg_get_functiondef(p.oid))))
      INTO v_actual
      FROM pg_proc p JOIN pg_language l ON l.oid = p.prolang WHERE p.oid = to_regprocedure('public.' || f);
    IF v_actual IS DISTINCT FROM v_esperado THEN
      RAISE EXCEPTION 'sim-004b: public.% no es la prevista (lenguaje|definer|volatilidad|proconfig|dueño|sha256 del cuerpo|EXECUTE|atributos de pg_proc y md5 de pg_get_functiondef): % · se esperaba %',
        f, coalesce(v_actual, '(no existe)'), v_esperado;
    END IF;
  END LOOP;
  -- R3E3-04 (revisor interno): ninguna otra funcion de public con el nombre de una acreditada (una sobrecarga
  -- cambia que resuelven las llamadas por nombre, de PostgREST o internas)
  SELECT string_agg(p.oid::regprocedure::text, ', ' ORDER BY p.oid::regprocedure::text COLLATE "C") INTO v_txt
    FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace
     AND p.proname IN (SELECT split_part(x, '(', 1) FROM unnest(ARRAY(SELECT v_funcs[i][1] FROM generate_subscripts(v_funcs, 1) i) || v_puerta_fn[1]) x)
     AND p.oid NOT IN (SELECT to_regprocedure('public.' || x) FROM unnest(ARRAY(SELECT v_funcs[i][1] FROM generate_subscripts(v_funcs, 1) i) || v_puerta_fn[1]) x
                        WHERE to_regprocedure('public.' || x) IS NOT NULL);
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'sim-004b: funciones de public con el nombre de una acreditada y otra firma: %', v_txt; END IF;
  -- 4.5 los disparadores, el inventario EXACTO (definicion completa, tipo y si esta activo) de las tablas que
  -- escriben las RPC y los disparadores: el de la preparatoria (estado 1, o 2 con la puerta) y, en las demas,
  -- solo los de sus FK
  PERFORM set_config('search_path', '', true);
  SELECT coalesce(string_agg(x, E'\n' ORDER BY x COLLATE "C"), '') INTO v_actual FROM (
    SELECT c.oid::regclass::text || '|' ||
           CASE WHEN t.tgisinternal THEN 'fk:' || k.conname || '|' || t.tgfoid::regprocedure::text
                -- E3R3-03 (Astra r3): lo que decide si y como se ejecuta, sin OIDs ni nombres generados
                || ' · when=' || CASE WHEN t.tgqual IS NULL THEN 'no' ELSE 'SI' END || ' · args=' || t.tgnargs || ':' || encode(t.tgargs, 'hex')
                || ' · ref=' || CASE WHEN t.tgconstrrelid = 0 THEN '-' ELSE t.tgconstrrelid::regclass::text END
                || ' · indice=' || CASE WHEN t.tgconstrindid = 0 THEN '-' ELSE t.tgconstrindid::regclass::text END
                || ' · diferible=' || t.tgdeferrable::text || '/' || t.tginitdeferred::text || ' · columnas=' || t.tgattr::text
                ELSE t.tgname || '|' || pg_get_triggerdef(t.oid) END
           || '|' || t.tgtype || '|' || t.tgenabled::text AS x
      FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid LEFT JOIN pg_constraint k ON k.oid = t.tgconstraint
     WHERE c.oid IN (SELECT to_regclass('public.' || x) FROM unnest(v_protegidas || ARRAY['sim_drawing_templates', 'user_chart_config', 'user_tool_config']) x)
        -- E3R3-03: y los del otro extremo de sus FK (en profiles y auth.users: la cascada al borrar el perfil)
        OR t.tgconstraint IN (SELECT k2.oid FROM pg_constraint k2 WHERE k2.contype = 'f' AND k2.conrelid IN
             (SELECT to_regclass('public.' || x) FROM unnest(v_protegidas || ARRAY['sim_drawing_templates', 'user_chart_config', 'user_tool_config']) x))) s;
  SELECT string_agg(x, E'\n' ORDER BY x COLLATE "C") INTO v_esperado
    FROM regexp_split_to_table(concat_ws(E'\n', v_trg_hoy, v_trg_registro, CASE WHEN v_puerta THEN v_trg_puerta END, v_trg_otros), E'\n') x;
  PERFORM set_config('search_path', v_sp, true);
  IF v_actual IS DISTINCT FROM v_esperado THEN
    RAISE EXCEPTION 'sim-004b: los disparadores no son los previstos. De mas: [%] · De menos: [%]',
      (SELECT string_agg(x, ' ; ') FROM (SELECT regexp_split_to_table(v_actual, E'\n') x EXCEPT ALL SELECT regexp_split_to_table(v_esperado, E'\n')) d),
      (SELECT string_agg(x, ' ; ') FROM (SELECT regexp_split_to_table(v_esperado, E'\n') x EXCEPT ALL SELECT regexp_split_to_table(v_actual, E'\n')) d);
  END IF;
  -- 4.6 R3E3B-01 y R3E3B-02 (CTO 17-oct): el inventario EXACTO de las 14 tablas fuera de pg_proc (tabla, columnas,
  -- restricciones, indices, reglas y las politicas de las 3 no protegidas) y las tres funciones ajenas que llaman los
  -- cuerpos, con lo medido en produccion (s16e y s16f). El mismo bloque que s16. Con search_path vacio: los textos tal cual (RINV3-01)
  PERFORM set_config('search_path', '', true);
  SELECT string_agg(i.familia || ' ' || i.objeto || ': ' || i.detalle, ' ; ' ORDER BY i.familia, i.objeto) INTO v_txt
    FROM (
      -- >>> inventario (identico en sql/sim-004b-contrato-v1.sql y sql/consultas/s16-catalogo-sim004b.sql)
      -- R3E3B-01 (revisor interno; CTO 17-oct): el inventario EXACTO de las 14 tablas fuera de pg_proc, por familias
      -- (E3R3-01/02/04, Astra r3: las sobrecargas y el permiso efectivo de las tres auxiliares; el estado de los indices),
      -- con los textos TAL CUAL los da el catalogo (RINV3-01, CTO 17-oct: sin quitar ningun prefijo): la tabla (relkind, persistencia, particion, hijas,
      -- padres, particionada), cada columna (tipo, NOT NULL, identity, generated, colacion, valor por defecto), cada
      -- restriccion (tipo y definicion, validada, diferible), cada indice (pg_get_indexdef), cada regla, y las politicas
      -- de las 3 no protegidas (las de las 11 protegidas ya son exactas aparte). Las dos restricciones que cambia
      -- sim-004b van por nombre: su definicion la acredita su estado. Los disparadores ya tienen inventario exacto aparte
      -- Por familia se compara el recuento y el md5 del conjunto ordenado con lo medido en produccion (s16e y s16f, 17-oct;
      -- sql/consultas/salidas/), uno por search_path: el vacio (sim-004b) y el del editor (la s16), por sus esquemas
      -- efectivos (current_schemas); con otro, la fila «search_path» no coincide. Las tres funciones ajenas, ficha a ficha
      -- (una lista fija: no puede haber otras). Si algo no coincide, se mide fila a fila con una consulta aparte
      select v.familia, v.objeto, v.detalle, v.bien from (
        with inv as (
          select x.familia, x.fila from (
            select 'tabla'::text familia, r.t || '|' ||
                   case when c.oid is null then 'NO EXISTE'
                        else 'relkind=' || c.relkind::text || ' · persistencia=' || c.relpersistence::text || ' · particion=' || c.relispartition::text
                             || ' · hijas=' || (select count(*) from pg_catalog.pg_inherits i where i.inhparent = c.oid)
                             || ' · padres=' || coalesce((select string_agg(i.inhparent::regclass::text, ',' order by i.inhseqno) from pg_catalog.pg_inherits i where i.inhrelid = c.oid), '-')
                             || ' · particionada=' || exists (select 1 from pg_catalog.pg_partitioned_table p where p.partrelid = c.oid)::text
                             -- RINV-01: el dueño («ejecutor» si es quien ejecuta); RINV-04: la RLS de las 3 no protegidas
                             || ' · dueño=' || case when c.relowner = (select x.oid from pg_catalog.pg_roles x where x.rolname = current_user) then 'ejecutor' else pg_catalog.pg_get_userbyid(c.relowner)::text end
                             || case when r.t in ('sim_drawing_templates', 'user_chart_config', 'user_tool_config')
                                     then ' · rls=' || c.relrowsecurity::text || ' · forzada=' || c.relforcerowsecurity::text else '' end end fila
              from (values ('sim_alumnos'), ('sim_arrendamientos'), ('sim_recibos'), ('sim_eventos'), ('sim_escrituras_v0'), ('sim_escrituras_v0_marcas'), ('sim_servicio'),
                           ('sim_sessions'), ('sim_trades'), ('session_drawings'), ('session_chart_config'), ('sim_drawing_templates'), ('user_chart_config'), ('user_tool_config')) r(t)
                   left join pg_catalog.pg_class c on c.oid = pg_catalog.to_regclass('public.' || r.t)
            union all
            select 'columna', c.relname || '.' || a.attname || '|' ||
                   -- RINV-02: el tipo con su esquema, sin quitarlo (un dominio public.text no pasa por text)
                   'tipo=' || pg_catalog.format_type(a.atttypid, a.atttypmod) || ' · tipo_esquema=' || tn.nspname::text
                   || ' · notnull=' || a.attnotnull::text
                   || ' · identity=' || coalesce(nullif(a.attidentity::text, ''), '-')
                   || ' · generated=' || coalesce(nullif(a.attgenerated::text, ''), '-')
                   -- RINV2-02: «por defecto» solo la predeterminada (oid 100); cualquier otra, con esquema, proveedor, determinista y locale
                   || ' · colacion=' || case when a.attcollation = 0 then '-' when a.attcollation = 100 then 'por defecto'
                                             else coalesce((select pg_catalog.concat(cn.nspname, '.', co.collname, ' · proveedor=', co.collprovider::text, ' · determinista=', co.collisdeterministic::text,
                                                                                     ' · locale=', coalesce(co.collcollate, co.colllocale, '-'))
                                                              from pg_catalog.pg_collation co join pg_catalog.pg_namespace cn on cn.oid = co.collnamespace where co.oid = a.attcollation), 'NO EXISTE') end
                   || ' · defecto=' || coalesce(pg_catalog.pg_get_expr(d.adbin, d.adrelid), '-')
              from pg_catalog.pg_class c join pg_catalog.pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
                   join pg_catalog.pg_type ty on ty.oid = a.atttypid join pg_catalog.pg_namespace tn on tn.oid = ty.typnamespace
                   left join pg_catalog.pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
             where c.relnamespace = 'public'::regnamespace and c.relname in ('sim_alumnos', 'sim_arrendamientos', 'sim_recibos', 'sim_eventos', 'sim_escrituras_v0', 'sim_escrituras_v0_marcas', 'sim_servicio',
                           'sim_sessions', 'sim_trades', 'session_drawings', 'session_chart_config', 'sim_drawing_templates', 'user_chart_config', 'user_tool_config') and c.relkind = 'r'
            union all
            select 'restriccion', c.relname || '.' || k.conname || '|' ||
                   case when (c.relname, k.conname) in (('sim_sessions', 'sim_sessions_terminal_valida'), ('sim_eventos', 'sim_eventos_tipo_check'))
                        then k.contype::text || ' · (la de sim-004b, segun su estado)'
                        else k.contype::text || ' · ' || pg_catalog.pg_get_constraintdef(k.oid)
                             || ' · validada=' || k.convalidated::text || ' · diferible=' || k.condeferrable::text || '/' || k.condeferred::text end
              from pg_catalog.pg_class c join pg_catalog.pg_constraint k on k.conrelid = c.oid
             where c.relnamespace = 'public'::regnamespace and c.relname in ('sim_alumnos', 'sim_arrendamientos', 'sim_recibos', 'sim_eventos', 'sim_escrituras_v0', 'sim_escrituras_v0_marcas', 'sim_servicio',
                           'sim_sessions', 'sim_trades', 'session_drawings', 'session_chart_config', 'sim_drawing_templates', 'user_chart_config', 'user_tool_config')
            union all
            -- E3R3-04 (Astra r3): ademas de la definicion, el estado operativo (unico, valido, listo y vivo)
            select 'indice', c.relname || '.' || ic.relname || '|' || pg_catalog.pg_get_indexdef(x.indexrelid)
                   || ' · unico=' || x.indisunique::text || ' · valido=' || x.indisvalid::text || ' · listo=' || x.indisready::text || ' · vivo=' || x.indislive::text
              from pg_catalog.pg_class c join pg_catalog.pg_index x on x.indrelid = c.oid join pg_catalog.pg_class ic on ic.oid = x.indexrelid
             where c.relnamespace = 'public'::regnamespace and c.relname in ('sim_alumnos', 'sim_arrendamientos', 'sim_recibos', 'sim_eventos', 'sim_escrituras_v0', 'sim_escrituras_v0_marcas', 'sim_servicio',
                           'sim_sessions', 'sim_trades', 'session_drawings', 'session_chart_config', 'sim_drawing_templates', 'user_chart_config', 'user_tool_config')
            union all
            -- RINV-03: cada secuencia identity, con todos sus parametros y su dueño
            select 'identidad', c.relname || '.' || a.attname || '|' ||
                   'tipo=' || pg_catalog.format_type(s.seqtypid, null) || ' · inicio=' || s.seqstart || ' · incremento=' || s.seqincrement
                   || ' · minimo=' || s.seqmin || ' · maximo=' || s.seqmax || ' · cache=' || s.seqcache || ' · ciclo=' || s.seqcycle::text
                   || ' · dueño=' || case when sc.relowner = (select x.oid from pg_catalog.pg_roles x where x.rolname = current_user) then 'ejecutor' else pg_catalog.pg_get_userbyid(sc.relowner)::text end
              from pg_catalog.pg_class c join pg_catalog.pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped and a.attidentity <> ''
                   join pg_catalog.pg_depend dp on dp.refobjid = c.oid and dp.refobjsubid = a.attnum and dp.classid = 'pg_catalog.pg_class'::regclass and dp.deptype = 'i'
                   join pg_catalog.pg_class sc on sc.oid = dp.objid and sc.relkind = 'S'
                   join pg_catalog.pg_sequence s on s.seqrelid = sc.oid
             where c.relnamespace = 'public'::regnamespace and c.relname in ('sim_alumnos', 'sim_arrendamientos', 'sim_recibos', 'sim_eventos', 'sim_escrituras_v0', 'sim_escrituras_v0_marcas', 'sim_servicio',
                           'sim_sessions', 'sim_trades', 'session_drawings', 'session_chart_config', 'sim_drawing_templates', 'user_chart_config', 'user_tool_config')
            union all
            -- RINV2-01 y RINV2-04: de que dependen, FUERA de pg_catalog, los valores por defecto, las restricciones y los indices
            -- (por pg_depend: no depende del texto ni del search_path; un public.now() o un public.length() salen aqui). La s16d
            select 'ajeno', o.nombre || '|' || pg_catalog.pg_describe_object(dp.refclassid, dp.refobjid, 0)
              from (select 'pg_catalog.pg_attrdef'::regclass clase, d.oid, c.relname || '.' || a.attname || ' (defecto)' nombre
                      from pg_catalog.pg_class c join pg_catalog.pg_attrdef d on d.adrelid = c.oid join pg_catalog.pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
                     where c.relnamespace = 'public'::regnamespace and c.relname in ('sim_alumnos', 'sim_arrendamientos', 'sim_recibos', 'sim_eventos', 'sim_escrituras_v0', 'sim_escrituras_v0_marcas', 'sim_servicio',
                           'sim_sessions', 'sim_trades', 'session_drawings', 'session_chart_config', 'sim_drawing_templates', 'user_chart_config', 'user_tool_config')
                    union all
                    select 'pg_catalog.pg_constraint'::regclass, k.oid, c.relname || '.' || k.conname || ' (restriccion)'
                      from pg_catalog.pg_class c join pg_catalog.pg_constraint k on k.conrelid = c.oid
                     where c.relnamespace = 'public'::regnamespace and c.relname in ('sim_alumnos', 'sim_arrendamientos', 'sim_recibos', 'sim_eventos', 'sim_escrituras_v0', 'sim_escrituras_v0_marcas', 'sim_servicio',
                           'sim_sessions', 'sim_trades', 'session_drawings', 'session_chart_config', 'sim_drawing_templates', 'user_chart_config', 'user_tool_config')
                    union all
                    select 'pg_catalog.pg_class'::regclass, x.indexrelid, c.relname || '.' || ic.relname || ' (indice)'
                      from pg_catalog.pg_class c join pg_catalog.pg_index x on x.indrelid = c.oid join pg_catalog.pg_class ic on ic.oid = x.indexrelid
                     where c.relnamespace = 'public'::regnamespace and c.relname in ('sim_alumnos', 'sim_arrendamientos', 'sim_recibos', 'sim_eventos', 'sim_escrituras_v0', 'sim_escrituras_v0_marcas', 'sim_servicio',
                           'sim_sessions', 'sim_trades', 'session_drawings', 'session_chart_config', 'sim_drawing_templates', 'user_chart_config', 'user_tool_config')) o
                   join pg_catalog.pg_depend dp on dp.classid = o.clase and dp.objid = o.oid
             where (dp.refclassid = 'pg_catalog.pg_proc'::regclass and (select p.pronamespace from pg_catalog.pg_proc p where p.oid = dp.refobjid) <> 'pg_catalog'::regnamespace)
                or (dp.refclassid = 'pg_catalog.pg_operator'::regclass and (select p.oprnamespace from pg_catalog.pg_operator p where p.oid = dp.refobjid) <> 'pg_catalog'::regnamespace)
                or (dp.refclassid = 'pg_catalog.pg_type'::regclass and (select p.typnamespace from pg_catalog.pg_type p where p.oid = dp.refobjid) <> 'pg_catalog'::regnamespace)
                or (dp.refclassid = 'pg_catalog.pg_collation'::regclass and (select p.collnamespace from pg_catalog.pg_collation p where p.oid = dp.refobjid) <> 'pg_catalog'::regnamespace)
            union all
            select 'regla', c.relname || '.' || w.rulename || '|' || pg_catalog.pg_get_ruledef(w.oid)
              from pg_catalog.pg_class c join pg_catalog.pg_rewrite w on w.ev_class = c.oid
             where c.relnamespace = 'public'::regnamespace and c.relname in ('sim_alumnos', 'sim_arrendamientos', 'sim_recibos', 'sim_eventos', 'sim_escrituras_v0', 'sim_escrituras_v0_marcas', 'sim_servicio',
                           'sim_sessions', 'sim_trades', 'session_drawings', 'session_chart_config', 'sim_drawing_templates', 'user_chart_config', 'user_tool_config')
            union all
            select 'politica', p.tablename || '.' || p.policyname || '|' ||
                   p.permissive || ' · ' || p.cmd || ' · ' || p.roles::text || ' · using=' || coalesce(p.qual, '-')
                   || ' · check=' || coalesce(p.with_check, '-')
              from pg_catalog.pg_policies p where p.schemaname = 'public' and p.tablename in ('sim_drawing_templates', 'user_chart_config', 'user_tool_config')
            union all
            -- E3R3-01 (Astra r3): TODAS las funciones con esos nombres en esos esquemas (las RPC las llaman calificadas,
            -- extensions.digest(...), y una sobrecarga de mas en el mismo esquema hace ambigua la llamada: 42725)
            select 'sobrecarga', n.nspname::text || '.' || p.proname::text || '(' || pg_catalog.pg_get_function_identity_arguments(p.oid) || ')'
              from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
             where (n.nspname, p.proname) in (('extensions', 'digest'), ('extensions', 'gen_random_bytes'), ('auth', 'uid'))
            union all
            -- E3R3-02 (Astra r3): el permiso EFECTIVO de EXECUTE de quien las usa: el dueño de las RPC (definer) las tres,
            -- y authenticated auth.uid() (las politicas de RLS). Lo medido, no la ACL textual
            select 'permiso', f.firma || '|dueño_rpc=' || coalesce(pg_catalog.has_function_privilege(r.proowner, p.oid, 'EXECUTE')::text, 'NO EXISTE')
                   || case when f.firma = 'auth.uid()' then ' · authenticated=' || coalesce(pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')::text, 'NO EXISTE') else '' end
              from (values ('extensions.digest(bytea,text)'), ('extensions.gen_random_bytes(integer)'), ('auth.uid()')) f(firma)
                   left join pg_catalog.pg_proc p on p.oid = pg_catalog.to_regprocedure(f.firma)
                   left join pg_catalog.pg_proc r on r.oid = pg_catalog.to_regprocedure('public.sim_crear_sesion(uuid,uuid,uuid,text,integer,jsonb,jsonb,jsonb,jsonb)')
            union all
            -- RE3-02 y RE3-03 (revisor interno de c4d46e3): el permiso EFECTIVO del dueño de las RPC sobre lo que usan sus
            -- cuerpos: los siete privilegios en las 14 tablas y EXECUTE en las funciones sim_* de public (un REVOKE a si
            -- mismo las deja en 42501)
            select 'permiso', 'tabla:' || c.relname || '|dueño_rpc=' || coalesce((select string_agg(pr.p, ',' order by pr.n) from (values ('SELECT', 1), ('INSERT', 2), ('UPDATE', 3), ('DELETE', 4), ('TRUNCATE', 5), ('REFERENCES', 6), ('TRIGGER', 7)) pr(p, n)
                                                                                  where pg_catalog.has_table_privilege(r.proowner, c.oid, pr.p)), '-')
              from pg_catalog.pg_class c
                   left join pg_catalog.pg_proc r on r.oid = pg_catalog.to_regprocedure('public.sim_crear_sesion(uuid,uuid,uuid,text,integer,jsonb,jsonb,jsonb,jsonb)')
             where c.relnamespace = 'public'::regnamespace and c.relname in ('sim_alumnos', 'sim_arrendamientos', 'sim_recibos', 'sim_eventos', 'sim_escrituras_v0', 'sim_escrituras_v0_marcas', 'sim_servicio',
                           'sim_sessions', 'sim_trades', 'session_drawings', 'session_chart_config', 'sim_drawing_templates', 'user_chart_config', 'user_tool_config') and c.relkind = 'r'
            union all
            select 'permiso', 'funcion:' || p.oid::regprocedure::text || '|dueño_rpc=' || coalesce(pg_catalog.has_function_privilege(r.proowner, p.oid, 'EXECUTE')::text, 'NO EXISTE')
              from pg_catalog.pg_proc p
                   left join pg_catalog.pg_proc r on r.oid = pg_catalog.to_regprocedure('public.sim_crear_sesion(uuid,uuid,uuid,text,integer,jsonb,jsonb,jsonb,jsonb)')
             where p.pronamespace = 'public'::regnamespace and (p.proname like 'sim\_%' or p.proname = 'enforce_sim_session_limit')
               and p.proname <> 'sim_escrituras_v0_puerta'  -- la de la puerta (estado 2) es de disparador: no se llama
            union all
            -- R3E3B-02 (CTO 17-oct): las tres funciones ajenas que llaman los cuerpos, con la ficha de la s16b
            select 'funcion_ajena', f.firma || '|' ||
                   case when p.oid is null then 'NO EXISTE' else
                     'functiondef md5=' || pg_catalog.md5(pg_catalog.pg_get_functiondef(p.oid))
                     || ' · prosrc md5=' || pg_catalog.md5(coalesce(p.prosrc, '')) || ' · probin=' || coalesce(p.probin, '-')
                     || ' · lenguaje=' || l.lanname || ' · dueño=' || pg_catalog.pg_get_userbyid(p.proowner)
                     || ' · prosecdef=' || p.prosecdef::text || ' · provolatile=' || p.provolatile::text || ' · proconfig=' || coalesce(p.proconfig::text, '-')
                     || ' · proisstrict=' || p.proisstrict::text || ' · proleakproof=' || p.proleakproof::text || ' · proparallel=' || p.proparallel::text
                     || ' · prokind=' || p.prokind::text || ' · proretset=' || p.proretset::text || ' · prorettype=' || pg_catalog.format_type(p.prorettype, null)
                     || ' · proargmodes=' || coalesce(p.proargmodes::text, '-') || ' · proargnames=' || coalesce(p.proargnames::text, '-')
                     || ' · pronargdefaults=' || p.pronargdefaults::text || ' · procost=' || p.procost::text || ' · prorows=' || p.prorows::text end
              from (values ('extensions.digest(bytea,text)'), ('extensions.gen_random_bytes(integer)'), ('auth.uid()')) f(firma)
                   left join pg_catalog.pg_proc p on p.oid = pg_catalog.to_regprocedure(f.firma) left join pg_catalog.pg_language l on l.oid = p.prolang
          ) x
        ),
        esp_f(esquemas, familia, n, h) as (values
          ('{}', 'ajeno', 0, 'd41d8cd98f00b204e9800998ecf8427e'),
          ('{}', 'columna', 135, '9610bdfa6bce4ff3b95a3d4fafd743b0'),
          ('{}', 'identidad', 4, '472c2271705ab4440fba7bbe0c61ed04'),
          ('{}', 'indice', 31, '79cdc8554026972e2802601707a99bd1'),
          ('{}', 'permiso', 39, '25fc63d1d9d6b85da7fc125969fc6144'),
          ('{}', 'politica', 3, 'ae70c7a2dca8be8f6aa6c6eae4d9754f'),
          ('{}', 'regla', 0, 'd41d8cd98f00b204e9800998ecf8427e'),
          ('{}', 'restriccion', 59, '4f9d1a1af4e93723672d6bba7ae10829'),
          ('{}', 'sobrecarga', 4, 'df3ad2088d0f399ac318d9e1346413b4'),
          ('{}', 'tabla', 14, 'a9b56cc77c3da41b455e0250b489e0aa'),
          ('{public,extensions}', 'ajeno', 0, 'd41d8cd98f00b204e9800998ecf8427e'),
          ('{public,extensions}', 'columna', 135, '9610bdfa6bce4ff3b95a3d4fafd743b0'),
          ('{public,extensions}', 'identidad', 4, '472c2271705ab4440fba7bbe0c61ed04'),
          ('{public,extensions}', 'indice', 31, '79cdc8554026972e2802601707a99bd1'),
          ('{public,extensions}', 'permiso', 39, '6a3ba7f0b9e33c9e43e91aacd6eeaf3b'),
          ('{public,extensions}', 'politica', 3, 'ae70c7a2dca8be8f6aa6c6eae4d9754f'),
          ('{public,extensions}', 'regla', 0, 'd41d8cd98f00b204e9800998ecf8427e'),
          ('{public,extensions}', 'restriccion', 59, '8c1bcac993492ca83039e80ec6168d01'),
          ('{public,extensions}', 'sobrecarga', 4, 'df3ad2088d0f399ac318d9e1346413b4'),
          ('{public,extensions}', 'tabla', 14, 'a9b56cc77c3da41b455e0250b489e0aa')),
        esp_a(firma, ficha) as (values
          ('auth.uid()', 'functiondef md5=ea3b41bf29e2ad573067939329aa088e · prosrc md5=cdef18c69c4f4cbbced2eaf81e628b49 · probin=- · lenguaje=sql · dueño=supabase_auth_admin · prosecdef=false · provolatile=s · proconfig=- · proisstrict=false · proleakproof=false · proparallel=u · prokind=f · proretset=false · prorettype=uuid · proargmodes=- · proargnames=- · pronargdefaults=0 · procost=100 · prorows=0'),
          ('extensions.digest(bytea,text)', 'functiondef md5=85b88685f74a398b1ff164ad33eeaaca · prosrc md5=926ba3fbdb45dc078b3e3cafddc392cc · probin=$libdir/pgcrypto · lenguaje=c · dueño=postgres · prosecdef=false · provolatile=i · proconfig=- · proisstrict=true · proleakproof=false · proparallel=s · prokind=f · proretset=false · prorettype=bytea · proargmodes=- · proargnames=- · pronargdefaults=0 · procost=1 · prorows=0'),
          ('extensions.gen_random_bytes(integer)', 'functiondef md5=a7569a34c9be929beb24ef5670d42636 · prosrc md5=393a992bef3cadec88b224bd3dace51c · probin=$libdir/pgcrypto · lenguaje=c · dueño=postgres · prosecdef=false · provolatile=v · proconfig=- · proisstrict=true · proleakproof=false · proparallel=s · prokind=f · proretset=false · prorettype=bytea · proargmodes=- · proargnames=- · pronargdefaults=0 · procost=1 · prorows=0')),
        med_f as (select i.familia, count(*)::integer n, pg_catalog.md5(string_agg(i.fila, E'\n' order by i.fila collate "C")) h from inv i where i.familia <> 'funcion_ajena' group by i.familia),
        med_a as (select split_part(i.fila, '|', 1) firma, substr(i.fila, strpos(i.fila, '|') + 1) ficha from inv i where i.familia = 'funcion_ajena')
        select 'inventario'::text familia, e.familia objeto,
               'n=' || coalesce(m.n, 0) || ' md5=' || coalesce(m.h, pg_catalog.md5(''))
               || case when coalesce(m.n, 0) = e.n and coalesce(m.h, pg_catalog.md5('')) = e.h then ''
                       else ' (sim-004b espera n=' || e.n || ' md5=' || e.h || ' con esquemas=' || e.esquemas || '; que fila: medirlo aparte)' end detalle,
               coalesce(m.n, 0) = e.n and coalesce(m.h, pg_catalog.md5('')) = e.h bien
          from esp_f e left join med_f m on m.familia = e.familia
         where e.esquemas = pg_catalog.current_schemas(false)::text
        union all
        select 'inventario', 'search_path', 'esquemas=' || pg_catalog.current_schemas(false)::text
               || ' (sin valores esperados: solo {} en sim-004b y {public,extensions}, el del editor, en la s16)', false
         where not exists (select 1 from esp_f e where e.esquemas = pg_catalog.current_schemas(false)::text)
        union all
        select 'funcion_ajena', coalesce(e.firma, m.firma),
               coalesce(m.ficha, 'NO EXISTE') || case when m.ficha is distinct from e.ficha then ' (sim-004b espera ' || e.ficha || ')' else '' end,
               m.ficha is not distinct from e.ficha
          from esp_a e left join med_a m on m.firma = e.firma
      ) v
      -- <<< inventario
    ) i WHERE NOT i.bien;
  PERFORM set_config('search_path', v_sp, true);
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'sim-004b: el catalogo de las 14 tablas o las funciones ajenas no son las medidas (s16e y s16f, 17-oct): %', v_txt;
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
  select 3, 'rls', c.relname || ' · rls=' || c.relrowsecurity
    from pg_class c where c.oid in (select to_regclass('public.' || t) from unnest(array['sim_alumnos', 'sim_arrendamientos', 'sim_recibos', 'sim_eventos',
      'sim_escrituras_v0', 'sim_escrituras_v0_marcas', 'sim_servicio', 'sim_sessions', 'sim_trades', 'session_drawings', 'session_chart_config']) t)
  union all
  select 9, 'FIN', 'sim-004b aplicada'
) x order by o, detalle;
