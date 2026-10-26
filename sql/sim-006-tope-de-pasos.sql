-- ============================================================================
-- sim-006 — el tope de los avances «paso» (Step y Play): 10 por segundo y alumno, sin los 5 s
--
-- POR QUE. Orden 1-122 del CTO (decision de Ramon y del CTO, 24/26-oct): los avances de tipo paso (Step y Play) ya no
-- tienen el limite de 1 cada 5 s por alumno de sim-003/sim-004b (V4-03); solo un tope contra abusos de 10 por segundo
-- y alumno, con un error claro y con prefijo. Todo lo demas conserva su limite.
--
-- COMO DISTINGUE HOY EL SERVIDOR UN PASO DE UN TRAMO. Por el motivo del comando avanzar, que manda el cliente:
-- motivo 'paso' (Step), 'play' (Play) o 'goto' (Go to, en tramos de hasta 2.400 minutos y 6 s: LIMITES de
-- lib/servidor/comando.mjs). lib/servidor/comando.mjs lo valida y lo mete en el sobre canonico
-- {"payload":{"hasta":…,"motivo":…,"session_id":…},"tipo":"avanzar"}; sim_comando de sim-004b NO lo miraba: los tres,
-- y checkpoint, compartian los 5 s. sim-006 lo lee del sobre (p_sobre, el mismo texto del que sale el digest).
--
-- QUE CAMBIA (aditivo; ninguna fila cambia de sentido):
--   sim_alumnos  + pasos_ventana_desde timestamptz (NULL: sin pasos aun)
--                + pasos_en_ventana integer NOT NULL DEFAULT 0
--                (la barrera por alumno de sim-003; nada economico ni legible por el alumno: sin grants, RLS sin
--                politicas, ninguna ACL de columna, como el resto de la tabla)
--   sim_comando  (CREATE OR REPLACE; misma firma, dueño, ACL, SECURITY DEFINER, search_path vacio y volatilidad):
--     · un avanzar con motivo paso o play NO mira siguiente_avance_desde; cuenta en una ventana fija de 1 s por alumno
--       que empieza en su primer paso: el 11.º de la ventana → 429 demasiados_pasos, sin efectos (rechazo puro, como
--       demasiados_avances), con { mensaje: 'sim-006: …', tope: 10, ventana_ms: 1000, reintentar_en_ms }. Un paso
--       confirmado sigue poniendo siguiente_avance_desde (+5 s): el goto y el checkpoint conservan EXACTAMENTE su
--       limite de hoy (429 demasiados_avances si hubo cualquier avance del alumno en los ultimos 5 s);
--     · un reintento con la misma clave de un paso ya confirmado devuelve su recibo antes del tope (no cuenta);
--     · abrir, modificar, cancelar y cerrar: sin limite, como hoy.
--   El cuerpo nuevo es el de sim-004b con cuatro cambios (pruebas/sim-006.mjs lo comprueba al caracter).
--
-- LO QUE NO TOCA: sim_bloquea_alumno, sim_error, las demas funciones, politicas, grants, indices, ni las otras tablas.
--
-- DEPENDE DE: sim-003, sim-004a-preparatoria y sim-004b APLICADAS (sim-004b el 20-oct; el cuerpo de sim_comando que
-- espera es el de sim-004b: sha256 94f4db481cc09a2bc9b5d86512931186d8ec5aa98689bf6dc54bd6418798bc36, el medido por la
-- s16 tras aplicarla). No depende de sim-005 (otra rama: un disparador sobre sim_sessions.last_timestamp) ni la toca;
-- que las dos convivan en cualquier orden NO esta ensayado.
--
-- ⚠️ Tras aplicarla, sim-004b NO se vuelve a ejecutar (paraba «sim-004b: A MEDIAS …» sin tocar nada: ensayado) y la s16
-- y el inventario de sim-004b veran otro cuerpo de sim_comando y dos columnas mas en sim_alumnos: su esperado se
-- actualiza en la misma hoja en que se aplique.
--
-- ⟦HUECO guarda canonica⟧. La guarda canonica (contexto completo) se añadira cuando este aprobada; aqui NO se inventa.
-- Mientras el hueco este sin rellenar, el DO para con «sim-006: falta la guarda canonica …» sin tocar nada. Las pruebas
-- sustituyen esa linea por la del montaje (pruebas/sim-006.mjs, deEnsayo).
--
-- COMO SE APLICA: entero, de una vez, en el editor SQL de Supabase (sin metacomandos de psql). Dos ordenes:
--   1. un bloque DO (una transaccion): la guarda, ¿sin aplicar, aplicada o a medias?, aplica y COMPRUEBA; si algo
--      falla revienta con «sim-006: …» y no queda NADA;
--   2. una SELECT de informe (solo catalogo) que acaba en «FIN | sim-006 aplicada».
--   Segunda ejecucion: ve que ya esta, no cambia nada, repite las comprobaciones y da el mismo informe. A medias (el
--   cuerpo de una y las columnas de otra, o una columna sola): para sin tocar nada.
-- VUELTA ATRAS: sql/sim-006-vuelta-atras.sql (deja el cuerpo de sim-004b y quita las dos columnas).
--
-- Ensayado en PostgreSQL 17 local (pruebas/sim-006.mjs: montaje-v1 + sim-004b, como el ejecutor de s06). No prueba el
-- editor de Supabase. NO APLICADA.
-- ============================================================================

DO $sim_006$
DECLARE
  -- ⟦HUECO guarda canonica⟧ (ver la cabecera): con el hueco, para
  v_guarda pg_catalog.text := '⟦HUECO guarda canonica⟧';
  v_sp0      pg_catalog.text;
  v_firma    pg_catalog.text := 'public.sim_comando(uuid,uuid,uuid,text,text,integer,bigint,text,text,jsonb)';
  v_sha_004b pg_catalog.text := '94f4db481cc09a2bc9b5d86512931186d8ec5aa98689bf6dc54bd6418798bc36';
  v_cols     pg_catalog.text := 'user_id:uuid:true:-,siguiente_avance_desde:timestamp with time zone:false:-,creado:timestamp with time zone:true:now()';
  v_cols_n   pg_catalog.text := 'user_id:uuid:true:-,siguiente_avance_desde:timestamp with time zone:false:-,creado:timestamp with time zone:true:now(),pasos_ventana_desde:timestamp with time zone:false:-,pasos_en_ventana:integer:true:0';
  v_oid      pg_catalog.oid;
  v_src      pg_catalog.text;
  v_acl      pg_catalog.text;
  v_dueno    pg_catalog.oid;
  v_tacl     pg_catalog.text;
  v_tcols    pg_catalog.text;
  v_nuevas   pg_catalog.int4;
  v_antes    pg_catalog.bool;
  v_hecho    pg_catalog.bool;
  v_nuevo pg_catalog.text := $c$
    DECLARE
      v_sobre jsonb; v_digest text; v_al jsonb; v_padre uuid; v_s public.sim_sessions; v_r public.sim_recibos;
      v_a public.sim_arrendamientos; v_t timestamptz; v_eventos jsonb; v_trades jsonb; v_proy jsonb; v_clase text;
      v_n integer; v_cambia boolean; v_version bigint; v_base bigint; v_seqs jsonb; v_hasta timestamptz;
      v_avance boolean; v_paso boolean; v_ventana timestamptz; v_pasos integer;
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
      -- sim-006 (orden 1-122): Step y Play son avanzar con motivo paso o play (el sobre canonico lo lleva en payload)
      v_paso := coalesce(p_tipo = 'avanzar' AND v_sobre->'payload'->>'motivo' IN ('paso', 'play'), false);

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
      -- sim-006: un paso no mira los 5 s; su tope, 10 por segundo y alumno (ventana fija de 1 s desde el primero)
      IF v_paso THEN
        SELECT a.pasos_ventana_desde, a.pasos_en_ventana INTO v_ventana, v_pasos FROM public.sim_alumnos a WHERE a.user_id = p_actor;
        IF v_ventana IS NULL OR v_t >= v_ventana + interval '1 second' THEN v_ventana := v_t; v_pasos := 0; END IF;
        IF v_pasos >= 10 THEN
          RETURN public.sim_error(429, 'demasiados_pasos', jsonb_build_object(
            'mensaje', 'sim-006: mas de 10 avances paso o play por segundo y alumno; reintentar con la misma clave',
            'tope', 10, 'ventana_ms', 1000,
            'reintentar_en_ms', greatest(1, ceil(extract(epoch FROM (v_ventana + interval '1 second' - v_t)) * 1000))::integer));
        END IF;
      ELSIF v_avance AND (v_al->>'siguiente_avance_desde')::timestamptz > v_t THEN
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
      IF v_paso THEN
        UPDATE public.sim_alumnos SET siguiente_avance_desde = v_t + interval '5 seconds', pasos_ventana_desde = v_ventana,
               pasos_en_ventana = v_pasos + 1 WHERE user_id = p_actor;
      ELSIF v_avance THEN
        UPDATE public.sim_alumnos SET siguiente_avance_desde = v_t + interval '5 seconds' WHERE user_id = p_actor;
      END IF;
      RETURN jsonb_build_object('ok', true, 'http', 200, 'recibo', to_jsonb(v_r), 'version', v_version, 'eventos', v_seqs,
                                'trades', v_n, 'hasta', v_hasta);
    END $c$;
BEGIN
  IF v_guarda OPERATOR(pg_catalog.=) '⟦HUECO guarda canonica⟧' THEN
    RAISE EXCEPTION 'sim-006: falta la guarda canonica (el hueco de la cabecera esta sin rellenar): no se toca nada';
  END IF;
  v_sp0 := pg_catalog.current_setting('search_path');
  PERFORM pg_catalog.set_config('search_path', 'pg_catalog, pg_temp', true);
  PERFORM pg_catalog.set_config('lock_timeout', '5s', true);

  -- ── ¿sin aplicar, aplicada o a medias? ──────────────────────────────────
  v_oid := pg_catalog.to_regprocedure(v_firma);
  IF v_oid IS NULL OR pg_catalog.to_regclass('public.sim_alumnos') IS NULL THEN
    RAISE EXCEPTION 'sim-006: falta public.sim_comando o public.sim_alumnos (¿sim-003 y sim-004b aplicadas?): no se toca nada';
  END IF;
  SELECT p.prosrc, coalesce(p.proacl::text, '-'), p.proowner INTO v_src, v_acl, v_dueno FROM pg_proc p WHERE p.oid = v_oid;
  SELECT coalesce(c.relacl::text, '-') INTO v_tacl FROM pg_class c WHERE c.oid = 'public.sim_alumnos'::regclass;
  SELECT string_agg(a.attname || ':' || format_type(a.atttypid, a.atttypmod) || ':' || a.attnotnull || ':' || coalesce(pg_get_expr(d.adbin, d.adrelid), '-'), ',' ORDER BY a.attnum)
    INTO v_tcols
    FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
   WHERE a.attrelid = 'public.sim_alumnos'::regclass AND a.attnum > 0 AND NOT a.attisdropped;
  SELECT count(*) INTO v_nuevas FROM pg_attribute a
   WHERE a.attrelid = 'public.sim_alumnos'::regclass AND NOT a.attisdropped AND a.attname IN ('pasos_ventana_desde', 'pasos_en_ventana');
  v_antes := encode(sha256(convert_to(v_src, 'UTF8')), 'hex') = v_sha_004b AND v_nuevas = 0 AND v_tcols = v_cols;
  v_hecho := v_src = v_nuevo AND v_tcols = v_cols_n;

  IF v_antes THEN
    -- ── 1 · las dos columnas ──
    ALTER TABLE public.sim_alumnos ADD COLUMN pasos_ventana_desde timestamptz, ADD COLUMN pasos_en_ventana integer NOT NULL DEFAULT 0;
    -- ── 2 · el cuerpo (misma firma: dueño, ACL y atributos se quedan) ──
    EXECUTE format('CREATE OR REPLACE FUNCTION public.sim_comando(p_actor uuid, p_session_id uuid, p_command_id uuid, p_tipo text, p_sobre text, '
                   'p_epoca integer, p_version_esperada bigint, p_cliente_id text, p_testigo text, p_resultado jsonb) '
                   'RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '''' AS %L', v_nuevo);
  ELSIF NOT v_hecho THEN
    RAISE EXCEPTION 'sim-006: A MEDIAS o alterada (cuerpo de sim_comando sha256 %…; columnas de sim_alumnos: %): no se toca nada; revisar a mano',
      left(encode(sha256(convert_to(v_src, 'UTF8')), 'hex'), 16), v_tcols;
  END IF;

  -- ── 3 · comprobaciones (tambien en la segunda ejecucion) ────────────────
  IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid = v_oid AND p.prosrc = v_nuevo AND p.prosecdef AND p.provolatile = 'v'
                  AND p.proconfig = ARRAY['search_path=""'] AND p.prorettype = 'jsonb'::regtype
                  AND p.prolang = (SELECT l.oid FROM pg_language l WHERE l.lanname = 'plpgsql')
                  AND coalesce(p.proacl::text, '-') = v_acl AND p.proowner = v_dueno) THEN
    RAISE EXCEPTION 'sim-006: sim_comando no tiene el cuerpo o los atributos previstos (definer, volatil, search_path vacio, plpgsql, mismo dueño y ACL)';
  END IF;
  IF has_function_privilege('anon', v_oid, 'EXECUTE') OR has_function_privilege('authenticated', v_oid, 'EXECUTE')
     OR NOT has_function_privilege('service_role', v_oid, 'EXECUTE')
     OR EXISTS (SELECT 1 FROM pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a WHERE p.oid = v_oid AND a.grantee = 0) THEN
    RAISE EXCEPTION 'sim-006: EXECUTE de sim_comando no es solo de service_role';
  END IF;
  SELECT string_agg(a.attname || ':' || format_type(a.atttypid, a.atttypmod) || ':' || a.attnotnull || ':' || coalesce(pg_get_expr(d.adbin, d.adrelid), '-'), ',' ORDER BY a.attnum)
    INTO v_tcols
    FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
   WHERE a.attrelid = 'public.sim_alumnos'::regclass AND a.attnum > 0 AND NOT a.attisdropped;
  IF v_tcols IS DISTINCT FROM v_cols_n THEN
    RAISE EXCEPTION 'sim-006: las columnas de sim_alumnos no son las previstas (%)', v_tcols;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = 'public.sim_alumnos'::regclass AND a.attacl IS NOT NULL) THEN
    RAISE EXCEPTION 'sim-006: sim_alumnos tiene ACL de columna';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_class c WHERE c.oid = 'public.sim_alumnos'::regclass AND coalesce(c.relacl::text, '-') = v_tacl
                  AND c.relrowsecurity AND NOT c.relforcerowsecurity) THEN
    RAISE EXCEPTION 'sim-006: sim_alumnos cambio de ACL o de RLS';
  END IF;
  IF has_table_privilege('anon', 'public.sim_alumnos', 'SELECT') OR has_table_privilege('authenticated', 'public.sim_alumnos', 'SELECT') THEN
    RAISE EXCEPTION 'sim-006: anon o authenticated pueden leer sim_alumnos';
  END IF;
  PERFORM pg_catalog.set_config('search_path', v_sp0, true);
END
$sim_006$;


-- ============================================================================
-- INFORME (solo lectura, solo catalogo). Todo calificado con pg_catalog (S038R5-01).
-- ============================================================================
select seccion, detalle from (
  select 1 o, 'funcion' seccion, pg_catalog.format('%s · cuerpo sha256=%s · security_definer=%s · config=%s · execute: anon=%s authenticated=%s service_role=%s',
           p.oid::pg_catalog.regprocedure, pg_catalog.left(pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p.prosrc, 'UTF8')), 'hex'), 16), p.prosecdef,
           pg_catalog.array_to_string(p.proconfig, ','), pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE'),
           pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE'), pg_catalog.has_function_privilege('service_role', p.oid, 'EXECUTE')) detalle
    from pg_catalog.pg_proc p where p.oid OPERATOR(pg_catalog.=) pg_catalog.to_regprocedure('public.sim_comando(uuid,uuid,uuid,text,text,integer,bigint,text,text,jsonb)')
  union all
  select 2, 'columna', pg_catalog.format('sim_alumnos.%s · %s · not null=%s · defecto=%s', a.attname, pg_catalog.format_type(a.atttypid, a.atttypmod), a.attnotnull,
           coalesce(pg_catalog.pg_get_expr(d.adbin, d.adrelid), '-'))
    from pg_catalog.pg_attribute a left join pg_catalog.pg_attrdef d on d.adrelid OPERATOR(pg_catalog.=) a.attrelid and d.adnum OPERATOR(pg_catalog.=) a.attnum
   where a.attrelid OPERATOR(pg_catalog.=) pg_catalog.to_regclass('public.sim_alumnos') and a.attnum OPERATOR(pg_catalog.>) 0 and not a.attisdropped
     and a.attname OPERATOR(pg_catalog.=) any (array['pasos_ventana_desde', 'pasos_en_ventana']::pg_catalog.name[])
  union all
  select 9, 'FIN', 'sim-006 aplicada'
) x order by o, detalle;
