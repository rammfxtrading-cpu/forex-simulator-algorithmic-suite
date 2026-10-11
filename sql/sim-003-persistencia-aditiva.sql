-- ============================================================================
-- sim-003 — persistencia del motor, parte ADITIVA (sin corte)
--
-- POR QUE EXISTE. Diseño de la persistencia (revisiones/2026-10-07-diseno-
-- persistencia.md, rev. 4) y decisiones del CTO del 10-oct-2026: el motor no
-- corre en SQL; el servidor calcula fuera de bloqueo y UNA funcion breve
-- confirma (CAS de version, epoca, testigo del arrendamiento, idempotencia por
-- recibo). Este fichero crea todo lo nuevo SIN cambiar lo que ya hay: la web
-- actual sigue escribiendo como hoy. El corte (legado, permisos de
-- authenticated, disparador del cupo, challenge_parent_id en cascada) es
-- sim-004, otro fichero.
--
-- Esquema de partida: la salida de s04 y s05 del 10-oct (Ramon), transmitida
-- por el CTO el 11-oct (resumen, no filas literales; ver sql/APLICADOS.md).
--
-- QUE CREA:
--   columnas  sim_sessions: motor_version, epoca, version, estado, escritor,
--               terminal, legado, legado_snapshot, mercado, creada_por_rpc
--             sim_trades: evento_id, motor_version, bruto_micro, neto_micro,
--               comision_micro, spread_micro, swap_micro, conversion, ambigua,
--               causa_ambiguedad
--             Todas con valor por defecto o nulas: una fila que inserta la web
--             actual nace motor_version = 0 (legado de hecho) y cumple los CHECK.
--   tablas    sim_alumnos         barrera por alumno + siguiente_avance_desde
--             sim_arrendamientos  quien escribe cada sesion (solo el HASH del
--                                 testigo); nadie la lee salvo las funciones
--             sim_recibos         un recibo por comando (idempotencia)
--             sim_eventos         los eventos del motor, seq por sesion
--   FK        sim_sessions.user_id → profiles(id) ON DELETE CASCADE (nueva; la
--             de auth.users se queda). Aprobada por el CTO y por Ramon (10-oct,
--             «si ambas»). APLICAR este fichero pide otro si: no esta aplicado.
--   indice    una sola hija v1 por reto padre (unico parcial, motor_version = 1)
--   funciones SECURITY DEFINER, search_path vacio, EXECUTE solo service_role:
--               sim_crear_sesion, sim_tomar_escritor, sim_comando,
--               sim_avanzar_fase, sim_borrar_sesion y sim_borrar_legacy
--               (dejan la fila como lapida, terminal = 'borrada'),
--               sim_borrar_alumno (borra las filas)
--             auxiliares (nadie mas que su dueño las ejecuta):
--               sim_error, sim_bloquea_alumno
--   RLS       sim_recibos y sim_eventos: authenticated lee LOS SUYOS; nada mas.
--             sim_alumnos y sim_arrendamientos: sin politicas ni grants.
--             service_role: solo SELECT de recibos y eventos; escribe por las
--             funciones. Las cascadas desde sim_sessions borran igual.
--
-- ── LO QUE ESTO NO TOCA (es de sim-004) ─────────────────────────────────────
--   Ni politicas ni grants de las tablas que ya existen; ni el disparador
--   trg_enforce_sim_session_limit; ni la FK de challenge_parent_id (sigue
--   SET NULL); ni un solo dato: ninguna fila existente cambia (las columnas
--   nuevas toman su valor por defecto).
--
-- ⚠️ VENTANA HASTA sim-004 (medida en el ensayo): authenticated conserva hoy
--    UPDATE e INSERT sobre sim_sessions y sim_trades (politica ALL), asi que
--    PUEDE escribir las columnas nuevas de SUS filas. Ninguna funcion de aqui
--    se usa hasta el corte, y sim-004 tiene que (1) quitar esos permisos y
--    (2) no fiarse de las columnas nuevas de las filas de antes del corte.
--
-- ── RESPUESTAS DE LAS FUNCIONES ─────────────────────────────────────────────
--   Siempre un jsonb: { ok, http, motivo, ... }. Un rechazo del protocolo
--   (410, 404, 403, 409, 426, 429, 422) no escribe nada. Lo que no es del
--   protocolo (un tipo de dato imposible de convertir, un interbloqueo 40P01,
--   el P0001 del disparador del cupo actual) sale como error de SQL y deshace
--   la llamada entera.
--
-- ── COMO SE EJECUTA ────────────────────────────────────────────────────────
--   Entero, de una vez, en el editor SQL de Supabase. Son DOS ordenes:
--     1. un bloque DO que comprueba lo que da por hecho, crea todo y COMPRUEBA
--        el resultado. Si algo falla revienta con «sim-003: …» y no queda NADA
--        (un DO es una transaccion). Acaba SIN error.
--     2. una SELECT de informe (solo catalogo, sin datos de alumnos) que acaba
--        en «FIN | sim-003 aplicada».
--   Segunda ejecucion: ve que ya esta, no crea nada, repite las comprobaciones
--   y da el mismo informe. Si encuentra una parte si y otra no, se para.
--
-- Ensayado en PostgreSQL 17 local con el esquema de produccion reconstruido
-- desde s04 (pruebas/sim-003.mjs). No prueba el editor de Supabase.
-- ============================================================================

DO $sim_003$
DECLARE
  f          text;
  rol        text;
  cfg        text[];
  v_txt      text;
  v_n        integer;
  v_hay      integer := 0;
  v_tablas    text[] := ARRAY['sim_alumnos', 'sim_arrendamientos', 'sim_recibos', 'sim_eventos'];
  v_rpc       text[] := ARRAY['sim_crear_sesion(uuid,uuid,uuid,text,integer,jsonb,jsonb,jsonb,jsonb)',
                              'sim_tomar_escritor(uuid,uuid,uuid,text,integer,text,boolean)',
                              'sim_comando(uuid,uuid,uuid,text,text,integer,bigint,text,text,jsonb)',
                              'sim_avanzar_fase(uuid,uuid,uuid,uuid,text,integer,bigint,jsonb,jsonb,jsonb,jsonb)',
                              'sim_borrar_sesion(uuid,uuid)',
                              'sim_borrar_legacy(uuid,uuid)',
                              'sim_borrar_alumno(uuid)'];
  v_aux       text[] := ARRAY['sim_error(integer,text,jsonb)', 'sim_bloquea_alumno(uuid)'];
  v_funciones text[] := ARRAY['sim_crear_sesion', 'sim_tomar_escritor', 'sim_comando', 'sim_avanzar_fase',
                              'sim_borrar_sesion', 'sim_borrar_legacy', 'sim_borrar_alumno', 'sim_error', 'sim_bloquea_alumno'];
  v_relaciones text[] := ARRAY['sim_alumnos', 'sim_alumnos_pkey', 'sim_arrendamientos', 'sim_arrendamientos_pkey',
                              'sim_arrendamientos_user_id_idx', 'sim_recibos', 'sim_recibos_pkey', 'sim_recibos_id_seq',
                              'sim_recibos_session_command_key', 'sim_recibos_ultimo_avance_key', 'sim_recibos_session_creado_idx',
                              'sim_eventos', 'sim_eventos_pkey', 'sim_eventos_id_seq', 'sim_eventos_session_seq_key',
                              'sim_eventos_session_command_ordinal_key', 'sim_trades_evento_id_key', 'sim_sessions_una_hija_v1_key'];
  v_col_ses   text[] := ARRAY['motor_version', 'epoca', 'version', 'estado', 'escritor', 'terminal', 'legado',
                              'legado_snapshot', 'mercado', 'creada_por_rpc'];
  v_col_tra   text[] := ARRAY['evento_id', 'motor_version', 'bruto_micro', 'neto_micro', 'comision_micro', 'spread_micro',
                              'swap_micro', 'conversion', 'ambigua', 'causa_ambiguedad'];
  v_restr     text[] := ARRAY['sim_sessions_user_id_perfil_fkey', 'sim_sessions_v1_coherente', 'sim_sessions_terminal_valida',
                              'sim_trades_v1_coherente', 'sim_trades_evento_id_fkey'];
  v_total     integer;
  v_tipo      text;
BEGIN
  -- ── 0 · lo que se da por hecho ──────────────────────────────────────────
  IF current_setting('server_version_num')::integer < 170000 THEN
    RAISE EXCEPTION 'sim-003: hace falta PostgreSQL 17 o posterior (hay %)', current_setting('server_version');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
                  WHERE e.extname = 'pgcrypto' AND n.nspname = 'extensions') THEN
    RAISE EXCEPTION 'sim-003: pgcrypto no esta instalada en el esquema extensions (s05 dijo que si): no se aplica nada';
  END IF;
  FOREACH rol IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = rol) THEN
      RAISE EXCEPTION 'sim-003: no existe el rol %', rol;
    END IF;
  END LOOP;
  -- las columnas de s04 que este fichero usa, con su tipo
  FOR f, v_txt IN SELECT * FROM (VALUES
      ('profiles.id', 'uuid'), ('profiles.plan', 'text'), ('profiles.simulador_activo', 'boolean'),
      ('sim_sessions.id', 'uuid'), ('sim_sessions.user_id', 'uuid'), ('sim_sessions.name', 'text'),
      ('sim_sessions.pair', 'text'), ('sim_sessions.timeframe', 'text'), ('sim_sessions.date_from', 'date'),
      ('sim_sessions.date_to', 'date'), ('sim_sessions.capital', 'numeric'), ('sim_sessions.balance', 'numeric'),
      ('sim_sessions.status', 'text'), ('sim_sessions.last_timestamp', 'bigint'), ('sim_sessions.challenge_type', 'text'),
      ('sim_sessions.challenge_phase', 'integer'), ('sim_sessions.challenge_parent_id', 'uuid'),
      ('sim_trades.id', 'uuid'), ('sim_trades.session_id', 'uuid'), ('sim_trades.user_id', 'uuid'),
      ('sim_trades.pair', 'text'), ('sim_trades.side', 'text'), ('sim_trades.pnl', 'numeric(10,2)'),
      ('sim_trades.opened_at', NULL), ('sim_trades.closed_at', NULL)) c(col, tipo)
  LOOP
    SELECT format_type(a.atttypid, a.atttypmod) INTO v_tipo
      FROM pg_attribute a
     WHERE a.attrelid = to_regclass('public.' || split_part(f, '.', 1)) AND a.attname = split_part(f, '.', 2)
       AND a.attnum > 0 AND NOT a.attisdropped;
    IF v_tipo IS NULL THEN
      RAISE EXCEPTION 'sim-003: no existe la columna public.% (s04 dijo que si): no se aplica nada', f;
    END IF;
    IF v_txt IS NOT NULL AND v_tipo <> v_txt THEN
      RAISE EXCEPTION 'sim-003: public.% es % y s04 dijo %: no se aplica nada', f, v_tipo, v_txt;
    END IF;
    v_tipo := NULL;
  END LOOP;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.sim_sessions'::regclass)
     OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.sim_trades'::regclass) THEN
    RAISE EXCEPTION 'sim-003: RLS apagada en sim_sessions o sim_trades: revisar antes';
  END IF;

  -- ── ¿ya aplicada, sin aplicar o a medias? ───────────────────────────────
  SELECT count(*) INTO v_n FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = ANY (v_tablas) AND c.relkind = 'r';
  v_hay := v_hay + v_n;
  SELECT count(*) INTO v_n FROM unnest(v_rpc || v_aux) x WHERE to_regprocedure('public.' || x) IS NOT NULL;
  v_hay := v_hay + v_n;
  SELECT count(*) INTO v_n FROM pg_attribute WHERE attrelid = 'public.sim_sessions'::regclass AND attname = ANY (v_col_ses) AND NOT attisdropped;
  v_hay := v_hay + v_n;
  SELECT count(*) INTO v_n FROM pg_attribute WHERE attrelid = 'public.sim_trades'::regclass AND attname = ANY (v_col_tra) AND NOT attisdropped;
  v_hay := v_hay + v_n;
  v_total := cardinality(v_tablas) + cardinality(v_rpc) + cardinality(v_aux) + cardinality(v_col_ses) + cardinality(v_col_tra);

  IF v_hay > 0 AND v_hay < v_total THEN
    RAISE EXCEPTION 'sim-003: A MEDIAS o con nombres ocupados en public (% de % piezas ya existen): no se toca nada; revisar a mano', v_hay, v_total;
  END IF;

  IF v_hay = 0 THEN
    -- ── 1 · nombres libres, en CUALQUIER esquema (s05 + los de este fichero) ─
    SELECT string_agg(n.nspname || '.' || c.relname, ', ' ORDER BY 1) INTO v_txt
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relname = ANY (v_relaciones);
    IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'sim-003: nombre ocupado: %', v_txt; END IF;
    SELECT string_agg(p.oid::regprocedure::text, ', ' ORDER BY 1) INTO v_txt FROM pg_proc p WHERE p.proname = ANY (v_funciones);
    IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'sim-003: nombre de funcion ocupado: %', v_txt; END IF;
    SELECT string_agg(n.nspname || '.' || t.typname, ', ' ORDER BY 1) INTO v_txt
      FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE t.typname = ANY (v_tablas || v_funciones);
    IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'sim-003: nombre de tipo ocupado: %', v_txt; END IF;
    SELECT string_agg(conrelid::regclass::text || '.' || conname, ', ' ORDER BY 1) INTO v_txt
      FROM pg_constraint WHERE conname = ANY (v_restr)
        AND conrelid IN ('public.sim_sessions'::regclass, 'public.sim_trades'::regclass);
    IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'sim-003: restriccion ocupada: %', v_txt; END IF;

    -- ── 2 · sesiones sin perfil: la FK nueva no entraria ──────────────────
    SELECT count(*) INTO v_n FROM public.sim_sessions s
     WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = s.user_id);
    IF v_n > 0 THEN
      RAISE EXCEPTION 'sim-003: % sesion(es) sin perfil en profiles: la FK a profiles no se puede crear; no se aplica nada', v_n;
    END IF;

    -- ── 3 · columnas nuevas (con defecto: ninguna fila cambia de sentido) ─
    ALTER TABLE public.sim_sessions
      ADD COLUMN motor_version   smallint NOT NULL DEFAULT 0,
      ADD COLUMN epoca           integer  NOT NULL DEFAULT 0,
      ADD COLUMN version         bigint   NOT NULL DEFAULT 0,
      ADD COLUMN estado          jsonb,
      ADD COLUMN escritor        jsonb,
      ADD COLUMN terminal        text,
      ADD COLUMN legado          boolean  NOT NULL DEFAULT false,
      ADD COLUMN legado_snapshot jsonb,
      ADD COLUMN mercado         jsonb,
      ADD COLUMN creada_por_rpc  boolean  NOT NULL DEFAULT false,
      ADD CONSTRAINT sim_sessions_terminal_valida CHECK (terminal IS NULL OR terminal IN ('borrada', 'revocada')),
      -- v1 solo nace por RPC, con estado y mercado fijado; un legado es v0
      ADD CONSTRAINT sim_sessions_v1_coherente CHECK (
            motor_version IN (0, 1) AND epoca >= 0 AND version >= 0
        AND (motor_version = 0 OR (creada_por_rpc AND estado IS NOT NULL AND mercado IS NOT NULL))
        AND (NOT legado OR motor_version = 0));

    ALTER TABLE public.sim_trades
      ADD COLUMN evento_id        bigint,
      ADD COLUMN motor_version    smallint NOT NULL DEFAULT 0,
      ADD COLUMN bruto_micro      bigint,
      ADD COLUMN neto_micro       bigint,
      ADD COLUMN comision_micro   bigint,
      ADD COLUMN spread_micro     bigint,
      ADD COLUMN swap_micro       bigint,
      ADD COLUMN conversion       jsonb,
      ADD COLUMN ambigua          boolean,
      ADD COLUMN causa_ambiguedad text,
      -- un trade v1 nace de un evento cierre y trae sus importes en µUSD
      ADD CONSTRAINT sim_trades_v1_coherente CHECK (
            (motor_version = 0 AND evento_id IS NULL)
         OR (motor_version = 1 AND evento_id IS NOT NULL AND bruto_micro IS NOT NULL AND neto_micro IS NOT NULL
             AND comision_micro IS NOT NULL AND spread_micro IS NOT NULL AND swap_micro IS NOT NULL AND ambigua IS NOT NULL));

    -- ── 4 · tablas nuevas ─────────────────────────────────────────────────
    CREATE TABLE public.sim_alumnos (
      user_id                uuid        NOT NULL,
      siguiente_avance_desde timestamptz,
      creado                 timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT sim_alumnos_pkey PRIMARY KEY (user_id),
      CONSTRAINT sim_alumnos_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles (id) ON DELETE CASCADE);

    CREATE TABLE public.sim_arrendamientos (
      session_id   uuid        NOT NULL,
      user_id      uuid        NOT NULL,
      cliente_id   text        NOT NULL CHECK (length(cliente_id) BETWEEN 1 AND 100),
      testigo_hash text        NOT NULL CHECK (testigo_hash ~ '^[0-9a-f]{64}$'),
      hasta        timestamptz NOT NULL,
      CONSTRAINT sim_arrendamientos_pkey PRIMARY KEY (session_id),
      CONSTRAINT sim_arrendamientos_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.sim_sessions (id) ON DELETE CASCADE);
    CREATE INDEX sim_arrendamientos_user_id_idx ON public.sim_arrendamientos (user_id);

    CREATE TABLE public.sim_recibos (
      id                 bigint GENERATED BY DEFAULT AS IDENTITY (SEQUENCE NAME public.sim_recibos_id_seq),
      session_id         uuid        NOT NULL,
      user_id            uuid        NOT NULL,
      command_id         uuid        NOT NULL,
      tipo               text        NOT NULL CHECK (tipo IN ('abrir', 'modificar', 'cancelar', 'cerrar', 'avanzar', 'checkpoint', 'crear', 'tomar_escritor')),
      digest             text        NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
      epoca              integer     NOT NULL,
      version_partida    bigint      NOT NULL,
      version_resultante bigint,
      resultado          text        NOT NULL CHECK (resultado IN ('aceptado', 'rechazado', 'conflicto')),
      motivo             text,
      resumen            jsonb,
      clase              text        NOT NULL CHECK (clase IN ('economico', 'ultimo_avance')),
      creado             timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT sim_recibos_pkey PRIMARY KEY (id),
      CONSTRAINT sim_recibos_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.sim_sessions (id) ON DELETE CASCADE,
      CONSTRAINT sim_recibos_session_command_key UNIQUE (session_id, command_id),
      CONSTRAINT sim_recibos_clase_tipo CHECK (clase = 'economico' OR tipo IN ('avanzar', 'checkpoint')));
    CREATE UNIQUE INDEX sim_recibos_ultimo_avance_key ON public.sim_recibos (session_id) WHERE clase = 'ultimo_avance';
    CREATE INDEX sim_recibos_session_creado_idx ON public.sim_recibos (session_id, creado);

    CREATE TABLE public.sim_eventos (
      id         bigint GENERATED BY DEFAULT AS IDENTITY (SEQUENCE NAME public.sim_eventos_id_seq),
      session_id uuid    NOT NULL,
      user_id    uuid    NOT NULL,
      seq        bigint  NOT NULL CHECK (seq >= 1),
      command_id uuid    NOT NULL,
      ordinal    integer NOT NULL CHECK (ordinal >= 0),
      tipo       text    NOT NULL CHECK (tipo IN ('orden_creada', 'orden_modificada', 'orden_cancelada', 'fill', 'cierre',
                                                  'reset_diario', 'breach', 'fase_superada', 'fin_de_datos',
                                                  'posicion_modificada', 'no_valorable')),
      t_mercado  bigint  NOT NULL,
      datos      jsonb   NOT NULL,
      CONSTRAINT sim_eventos_pkey PRIMARY KEY (id),
      CONSTRAINT sim_eventos_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.sim_sessions (id) ON DELETE CASCADE,
      CONSTRAINT sim_eventos_session_seq_key UNIQUE (session_id, seq),
      CONSTRAINT sim_eventos_session_command_ordinal_key UNIQUE (session_id, command_id, ordinal));

    ALTER TABLE public.sim_trades
      ADD CONSTRAINT sim_trades_evento_id_key UNIQUE (evento_id),
      ADD CONSTRAINT sim_trades_evento_id_fkey FOREIGN KEY (evento_id) REFERENCES public.sim_eventos (id) ON DELETE CASCADE;

    -- ── 5 · la FK de la sesion al perfil y la hija unica ──────────────────
    ALTER TABLE public.sim_sessions
      ADD CONSTRAINT sim_sessions_user_id_perfil_fkey FOREIGN KEY (user_id) REFERENCES public.profiles (id) ON DELETE CASCADE;
    CREATE UNIQUE INDEX sim_sessions_una_hija_v1_key ON public.sim_sessions (challenge_parent_id)
      WHERE motor_version = 1 AND challenge_parent_id IS NOT NULL;

    -- ── 6 · funciones ─────────────────────────────────────────────────────

    -- respuesta de rechazo: { ok: false, http, motivo, ...extra }
    CREATE FUNCTION public.sim_error(p_http integer, p_motivo text, p_extra jsonb DEFAULT '{}'::jsonb)
      RETURNS jsonb LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path = ''
    AS $f$ SELECT jsonb_build_object('ok', false, 'http', p_http, 'motivo', p_motivo) || coalesce(p_extra, '{}'::jsonb) $f$;

    -- Paso (1) del orden comun de bloqueos (V4-01; CTO 10-oct, decision 1):
    -- el perfil SOLO FOR KEY SHARE (impide que se borre mientras dura la
    -- transaccion; profiles no se escribe) y la fila del alumno en
    -- sim_alumnos FOR UPDATE: la barrera por alumno. Sin perfil → NULL.
    CREATE FUNCTION public.sim_bloquea_alumno(p_actor uuid)
      RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
    AS $f$
    DECLARE v_activo boolean; v_plan text; v_sig timestamptz;
    BEGIN
      SELECT p.simulador_activo, p.plan INTO v_activo, v_plan FROM public.profiles p WHERE p.id = p_actor FOR KEY SHARE;
      IF NOT FOUND THEN RETURN NULL; END IF;
      INSERT INTO public.sim_alumnos (user_id) VALUES (p_actor) ON CONFLICT (user_id) DO NOTHING;
      SELECT a.siguiente_avance_desde INTO v_sig FROM public.sim_alumnos a WHERE a.user_id = p_actor FOR UPDATE;
      -- acceso: SOLO si simulador_activo es exactamente true (CTO 11-oct)
      RETURN jsonb_build_object('acceso', v_activo IS TRUE, 'plan', v_plan, 'siguiente_avance_desde', v_sig);
    END $f$;

    -- CREAR (§ 4.3.2). El id de la sesion lo trae el cliente. Mismo actor y
    -- mismo digest → la misma respuesta; otro digest u otro actor → 409
    -- clave_reutilizada (sin decir de quien); con la lapida de una borrada,
    -- 410 (A24). Cupo: raices del alumno que no son legado ni lapida; 12 con
    -- plan 'extra', 6 si no (las cifras del disparador real, s04). p_sesion: name, pair, timeframe, date_from, date_to, capital y,
    -- si es reto, challenge_type (fase 1).
    CREATE FUNCTION public.sim_crear_sesion(p_actor uuid, p_session_id uuid, p_command_id uuid, p_sobre text,
                                            p_epoca integer, p_sesion jsonb, p_estado jsonb, p_mercado jsonb, p_resumen jsonb)
      RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
    AS $f$
    DECLARE
      v_sobre jsonb; v_digest text; v_al jsonb; v_s public.sim_sessions; v_r public.sim_recibos; v_n integer; v_lim integer;
      v_nueva public.sim_sessions;
    BEGIN
      IF p_actor IS NULL OR p_session_id IS NULL OR p_command_id IS NULL OR p_sobre IS NULL OR p_epoca IS NULL THEN
        RETURN public.sim_error(422, 'argumentos_incompletos');
      END IF;
      BEGIN v_sobre := p_sobre::jsonb; EXCEPTION WHEN others THEN RETURN public.sim_error(422, 'sobre_invalido'); END;
      IF jsonb_typeof(v_sobre) <> 'object' OR v_sobre->>'tipo' IS DISTINCT FROM 'crear' THEN
        RETURN public.sim_error(422, 'sobre_invalido');
      END IF;
      v_digest := encode(extensions.digest(convert_to(p_sobre, 'UTF8'), 'sha256'), 'hex');

      v_al := public.sim_bloquea_alumno(p_actor);
      IF v_al IS NULL THEN RETURN public.sim_error(410, 'perfil_borrado'); END IF;

      SELECT * INTO v_s FROM public.sim_sessions WHERE id = p_session_id FOR UPDATE;
      IF FOUND THEN
        IF v_s.user_id <> p_actor THEN RETURN public.sim_error(409, 'clave_reutilizada'); END IF;
        -- A24: una sesion borrada no se recrea (su lapida sigue ahi)
        IF v_s.terminal = 'borrada' THEN RETURN public.sim_error(410, 'sesion_borrada'); END IF;
        SELECT * INTO v_r FROM public.sim_recibos WHERE session_id = p_session_id AND command_id = p_command_id AND tipo = 'crear';
        IF FOUND AND v_r.digest = v_digest THEN
          RETURN jsonb_build_object('ok', true, 'http', 200, 'repetido', true, 'recibo', to_jsonb(v_r));
        END IF;
        RETURN public.sim_error(409, 'clave_reutilizada');
      END IF;

      IF NOT (v_al->>'acceso')::boolean THEN RETURN public.sim_error(403, 'sin_acceso'); END IF;
      IF p_epoca <> 1 THEN RETURN public.sim_error(426, 'actualizar_cliente'); END IF;
      IF p_sesion IS NULL OR jsonb_typeof(p_sesion) <> 'object'
         OR EXISTS (SELECT 1 FROM jsonb_object_keys(p_sesion) k WHERE k NOT IN ('name', 'pair', 'timeframe', 'date_from', 'date_to', 'capital', 'challenge_type'))
         OR p_estado IS NULL OR jsonb_typeof(p_estado) <> 'object'
         OR p_mercado IS NULL OR jsonb_typeof(p_mercado) <> 'object' OR p_mercado = '{}'::jsonb THEN
        RETURN public.sim_error(422, 'carga_invalida');
      END IF;
      BEGIN
        v_nueva := jsonb_populate_record(NULL::public.sim_sessions, p_sesion);
      EXCEPTION WHEN others THEN RETURN public.sim_error(422, 'carga_invalida'); END;
      IF v_nueva.name IS NULL OR v_nueva.pair IS NULL OR v_nueva.timeframe IS NULL OR v_nueva.date_from IS NULL
         OR v_nueva.date_to IS NULL OR v_nueva.capital IS NULL OR v_nueva.capital <= 0 THEN
        RETURN public.sim_error(422, 'carga_invalida');
      END IF;

      v_lim := CASE WHEN v_al->>'plan' = 'extra' THEN 12 ELSE 6 END;
      SELECT count(*) INTO v_n FROM public.sim_sessions
       WHERE user_id = p_actor AND challenge_parent_id IS NULL AND NOT legado AND terminal IS DISTINCT FROM 'borrada';
      IF v_n >= v_lim THEN
        RETURN public.sim_error(409, 'limite_sesiones', jsonb_build_object('limite', v_lim, 'plan', v_al->>'plan'));
      END IF;

      INSERT INTO public.sim_sessions (id, user_id, name, pair, timeframe, date_from, date_to, capital, balance, status,
                                       challenge_type, challenge_phase, motor_version, epoca, version, estado, mercado, creada_por_rpc)
      VALUES (p_session_id, p_actor, v_nueva.name, v_nueva.pair, v_nueva.timeframe, v_nueva.date_from, v_nueva.date_to,
              v_nueva.capital, v_nueva.capital, 'active', v_nueva.challenge_type,
              CASE WHEN v_nueva.challenge_type IS NULL THEN NULL ELSE 1 END, 1, p_epoca, 0, p_estado, p_mercado, true);
      INSERT INTO public.sim_recibos (session_id, user_id, command_id, tipo, digest, epoca, version_partida, version_resultante,
                                      resultado, resumen, clase)
      VALUES (p_session_id, p_actor, p_command_id, 'crear', v_digest, p_epoca, 0, 0, 'aceptado', p_resumen, 'economico')
      RETURNING * INTO v_r;
      RETURN jsonb_build_object('ok', true, 'http', 201, 'recibo', to_jsonb(v_r));
    END $f$;

    -- TOMAR EL ESCRITOR (§ 4.2, D-16, D-18). Testigo nuevo en cada toma; la
    -- base guarda solo su hash. Bloqueos: alumno → arrendamientos que toca
    -- (los de sus sesiones y el de esta, por session_id) → padre → sesion.
    -- Un reintento con la misma clave devuelve el recibo, que NO lleva el
    -- testigo (no esta guardado): la pestaña vuelve a tomar con otra clave.
    CREATE FUNCTION public.sim_tomar_escritor(p_actor uuid, p_session_id uuid, p_command_id uuid, p_sobre text,
                                              p_epoca integer, p_cliente_id text, p_forzar boolean)
      RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
    AS $f$
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
      IF v_s.legado THEN RETURN public.sim_error(409, 'solo_lectura'); END IF;
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
    END $f$;

    -- EL COMANDO (§ 4.3; CTO 10-oct, decision 5). El motor NO corre aqui: el
    -- servidor calculo fuera de bloqueo sobre la version esperada y trae
    -- p_resultado = { resultado: aceptado|rechazado, motivo, clase, estado,
    -- eventos: [{ordinal, tipo, t_mercado, datos}], trades: [{ordinal del
    -- cierre, columnas de sim_trades…}], proyeccion: {balance,
    -- last_timestamp}, resumen }. Esta funcion confirma o rechaza:
    --   bloqueos (alumno → arrendamiento → padre → sesion) → t_decision →
    --   410/404 → idempotencia (mismo digest: el recibo; otro: 409) →
    --   avance caducado (409) → terminal, acceso, legado, v1, epoca, testigo,
    --   version (409 conflicto) → tasa de avances (429) → escribe.
    -- La clase la comprueba aqui (avanzar/checkpoint sin eventos economicos
    -- = ultimo_avance; lo demas, economico) y la version sube si y solo si el
    -- estado nuevo es distinto del confirmado (V3-01).
    CREATE FUNCTION public.sim_comando(p_actor uuid, p_session_id uuid, p_command_id uuid, p_tipo text, p_sobre text,
                                       p_epoca integer, p_version_esperada bigint, p_cliente_id text, p_testigo text,
                                       p_resultado jsonb)
      RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
    AS $f$
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
                                  'breach', 'fase_superada', 'fin_de_datos', 'posicion_modificada', 'no_valorable')
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
                                              'posicion_modificada', 'reset_diario', 'breach', 'fase_superada'))
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

      IF v_s.id IS NULL THEN RETURN public.sim_error(410, 'sesion_borrada'); END IF;
      IF v_s.user_id <> p_actor THEN RETURN public.sim_error(404, 'sesion_no_encontrada'); END IF;
      SELECT * INTO v_r FROM public.sim_recibos WHERE session_id = p_session_id AND command_id = p_command_id;
      IF FOUND THEN
        IF v_r.digest = v_digest AND v_r.tipo = p_tipo THEN
          RETURN jsonb_build_object('ok', true, 'http', 200, 'repetido', true, 'recibo', to_jsonb(v_r), 'version', v_s.version);
        END IF;
        RETURN public.sim_error(409, 'clave_reutilizada');
      END IF;
      IF v_avance AND p_version_esperada <> v_s.version THEN
        RETURN public.sim_error(409, 'comando_caducado', jsonb_build_object('version', v_s.version));
      END IF;
      IF v_s.terminal = 'borrada' THEN RETURN public.sim_error(410, 'sesion_borrada'); END IF;
      IF v_s.terminal = 'revocada' THEN RETURN public.sim_error(403, 'acceso_revocado'); END IF;
      IF NOT (v_al->>'acceso')::boolean THEN RETURN public.sim_error(403, 'sin_acceso'); END IF;
      IF v_s.legado THEN RETURN public.sim_error(409, 'solo_lectura'); END IF;
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
    END $f$;

    -- PASAR DE FASE (§ 2.5, § 4.3.2, D07). Crea la hija (fase 2) de un reto
    -- v1 cuya fase 1 esta superada en su estado (reto@1, estado 'superada').
    -- Es una creacion: el id de la hija lo trae quien la pide y el recibo
    -- 'crear' va en la hija; mismo id + misma clave + mismo digest → la misma
    -- respuesta. CAS sobre la version del padre. Mismo capital que el padre.
    -- El padre queda con status 'passed_phase' (la proyeccion de hoy,
    -- pages/api/challenge/advance.js).
    CREATE FUNCTION public.sim_avanzar_fase(p_actor uuid, p_padre_id uuid, p_hija_id uuid, p_command_id uuid, p_sobre text,
                                            p_epoca integer, p_version_esperada bigint, p_sesion jsonb, p_estado jsonb,
                                            p_mercado jsonb, p_resumen jsonb)
      RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
    AS $f$
    DECLARE
      v_sobre jsonb; v_digest text; v_al jsonb; v_p public.sim_sessions; v_h public.sim_sessions; v_r public.sim_recibos;
      v_nueva public.sim_sessions;
    BEGIN
      IF p_actor IS NULL OR p_padre_id IS NULL OR p_hija_id IS NULL OR p_command_id IS NULL OR p_sobre IS NULL
         OR p_epoca IS NULL OR p_version_esperada IS NULL THEN
        RETURN public.sim_error(422, 'argumentos_incompletos');
      END IF;
      BEGIN v_sobre := p_sobre::jsonb; EXCEPTION WHEN others THEN RETURN public.sim_error(422, 'sobre_invalido'); END;
      IF jsonb_typeof(v_sobre) <> 'object' OR v_sobre->>'tipo' IS DISTINCT FROM 'crear' THEN
        RETURN public.sim_error(422, 'sobre_invalido');
      END IF;
      v_digest := encode(extensions.digest(convert_to(p_sobre, 'UTF8'), 'sha256'), 'hex');

      v_al := public.sim_bloquea_alumno(p_actor);
      IF v_al IS NULL THEN RETURN public.sim_error(410, 'sesion_borrada'); END IF;
      SELECT * INTO v_p FROM public.sim_sessions WHERE id = p_padre_id FOR UPDATE;
      IF NOT FOUND THEN RETURN public.sim_error(410, 'sesion_borrada'); END IF;
      SELECT * INTO v_h FROM public.sim_sessions WHERE id = p_hija_id FOR UPDATE;
      IF v_p.user_id <> p_actor THEN RETURN public.sim_error(404, 'sesion_no_encontrada'); END IF;
      IF v_h.id IS NOT NULL THEN
        IF v_h.user_id = p_actor AND v_h.terminal = 'borrada' THEN RETURN public.sim_error(410, 'sesion_borrada'); END IF;
        IF v_h.user_id = p_actor AND v_h.challenge_parent_id = p_padre_id THEN
          SELECT * INTO v_r FROM public.sim_recibos WHERE session_id = p_hija_id AND command_id = p_command_id AND tipo = 'crear';
          IF FOUND AND v_r.digest = v_digest THEN
            RETURN jsonb_build_object('ok', true, 'http', 200, 'repetido', true, 'recibo', to_jsonb(v_r));
          END IF;
        END IF;
        RETURN public.sim_error(409, 'clave_reutilizada');
      END IF;
      IF v_p.terminal = 'borrada' THEN RETURN public.sim_error(410, 'sesion_borrada'); END IF;
      IF v_p.terminal = 'revocada' THEN RETURN public.sim_error(403, 'acceso_revocado'); END IF;
      IF NOT (v_al->>'acceso')::boolean THEN RETURN public.sim_error(403, 'sin_acceso'); END IF;
      IF v_p.legado THEN RETURN public.sim_error(409, 'solo_lectura'); END IF;
      IF v_p.motor_version <> 1 THEN RETURN public.sim_error(409, 'no_es_v1'); END IF;
      IF p_epoca <> v_p.epoca THEN RETURN public.sim_error(426, 'actualizar_cliente'); END IF;
      IF EXISTS (SELECT 1 FROM public.sim_sessions WHERE challenge_parent_id = p_padre_id AND motor_version = 1) THEN
        RETURN public.sim_error(409, 'transicion_hecha');
      END IF;
      IF p_version_esperada <> v_p.version THEN
        RETURN public.sim_error(409, 'conflicto', jsonb_build_object('version', v_p.version));
      END IF;
      IF v_p.challenge_type IS NULL OR v_p.estado->>'esquema' IS DISTINCT FROM 'reto@1'
         OR v_p.estado->>'estado' IS DISTINCT FROM 'superada' OR v_p.estado->>'fase' IS DISTINCT FROM '1' THEN
        RETURN public.sim_error(409, 'fase_no_superada');
      END IF;
      IF p_estado IS NULL OR p_estado->>'esquema' IS DISTINCT FROM 'reto@1' OR p_estado->>'fase' IS DISTINCT FROM '2'
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
              'active', coalesce(v_nueva.last_timestamp, v_p.last_timestamp), v_p.challenge_type, 2, p_padre_id, 1, v_p.epoca, 0,
              p_estado, p_mercado, true);
      UPDATE public.sim_sessions SET status = 'passed_phase' WHERE id = p_padre_id;
      INSERT INTO public.sim_recibos (session_id, user_id, command_id, tipo, digest, epoca, version_partida, version_resultante,
                                      resultado, resumen, clase)
      VALUES (p_hija_id, p_actor, p_command_id, 'crear', v_digest, v_p.epoca, 0, 0, 'aceptado',
              coalesce(p_resumen, '{}'::jsonb) || jsonb_build_object('padre', p_padre_id, 'version_padre', v_p.version), 'economico')
      RETURNING * INTO v_r;
      RETURN jsonb_build_object('ok', true, 'http', 201, 'recibo', to_jsonb(v_r));
    END $f$;

    -- BORRAR UNA SESION v1 (§ 1.6, CD07; CTO 11-oct, opcion a): bajo los
    -- bloqueos del orden comun, la fila QUEDA como lapida (terminal =
    -- 'borrada') y se borran sus trades, eventos, recibos, dibujos y su
    -- arrendamiento. La configuracion del grafico (session_chart_config) se
    -- queda. Ya borrada: 410. Recrear ese id: 410 (sim_crear_sesion). El
    -- cupo no cuenta las lapidas; el dashboard tiene que no listarlas.
    CREATE FUNCTION public.sim_borrar_sesion(p_actor uuid, p_session_id uuid)
      RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
    AS $f$
    DECLARE v_al jsonb; v_padre uuid; v_s public.sim_sessions;
    BEGIN
      IF p_actor IS NULL OR p_session_id IS NULL THEN RETURN public.sim_error(422, 'argumentos_incompletos'); END IF;
      v_al := public.sim_bloquea_alumno(p_actor);
      IF v_al IS NULL THEN RETURN public.sim_error(410, 'sesion_borrada'); END IF;
      PERFORM 1 FROM public.sim_arrendamientos WHERE session_id = p_session_id FOR UPDATE;
      SELECT challenge_parent_id INTO v_padre FROM public.sim_sessions WHERE id = p_session_id;
      IF v_padre IS NOT NULL THEN PERFORM 1 FROM public.sim_sessions WHERE id = v_padre FOR UPDATE; END IF;
      SELECT * INTO v_s FROM public.sim_sessions WHERE id = p_session_id FOR UPDATE;
      IF NOT FOUND THEN RETURN public.sim_error(410, 'sesion_borrada'); END IF;
      IF v_s.user_id <> p_actor THEN RETURN public.sim_error(404, 'sesion_no_encontrada'); END IF;
      IF v_s.motor_version <> 1 THEN RETURN public.sim_error(409, 'no_es_v1'); END IF;
      IF v_s.terminal = 'borrada' THEN RETURN public.sim_error(410, 'sesion_borrada'); END IF;
      UPDATE public.sim_sessions SET terminal = 'borrada', escritor = NULL WHERE id = p_session_id;
      DELETE FROM public.sim_trades WHERE session_id = p_session_id;
      DELETE FROM public.sim_eventos WHERE session_id = p_session_id;
      DELETE FROM public.sim_recibos WHERE session_id = p_session_id;
      DELETE FROM public.session_drawings WHERE session_id = p_session_id;
      DELETE FROM public.sim_arrendamientos WHERE session_id = p_session_id;
      RETURN jsonb_build_object('ok', true, 'http', 200, 'borrada', p_session_id);
    END $f$;

    -- BORRAR UNA SESION LEGACY (CTO 10-oct, decision 6): la llama el
    -- endpoint con la sesion del alumno; comprueba que es suya y que es de la
    -- epoca legacy (motor_version = 0) y deja la fila como lapida, igual que
    -- sim_borrar_sesion (CTO 11-oct, opcion a).
    CREATE FUNCTION public.sim_borrar_legacy(p_user_id uuid, p_session_id uuid)
      RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
    AS $f$
    DECLARE v_al jsonb; v_padre uuid; v_s public.sim_sessions;
    BEGIN
      IF p_user_id IS NULL OR p_session_id IS NULL THEN RETURN public.sim_error(422, 'argumentos_incompletos'); END IF;
      v_al := public.sim_bloquea_alumno(p_user_id);
      IF v_al IS NULL THEN RETURN public.sim_error(410, 'sesion_borrada'); END IF;
      PERFORM 1 FROM public.sim_arrendamientos WHERE session_id = p_session_id FOR UPDATE;
      SELECT challenge_parent_id INTO v_padre FROM public.sim_sessions WHERE id = p_session_id;
      IF v_padre IS NOT NULL THEN PERFORM 1 FROM public.sim_sessions WHERE id = v_padre FOR UPDATE; END IF;
      SELECT * INTO v_s FROM public.sim_sessions WHERE id = p_session_id FOR UPDATE;
      IF NOT FOUND THEN RETURN public.sim_error(410, 'sesion_borrada'); END IF;
      IF v_s.user_id <> p_user_id THEN RETURN public.sim_error(404, 'sesion_no_encontrada'); END IF;
      IF v_s.motor_version <> 0 THEN RETURN public.sim_error(409, 'no_es_legado'); END IF;
      IF v_s.terminal = 'borrada' THEN RETURN public.sim_error(410, 'sesion_borrada'); END IF;
      UPDATE public.sim_sessions SET terminal = 'borrada', escritor = NULL WHERE id = p_session_id;
      DELETE FROM public.sim_trades WHERE session_id = p_session_id;
      DELETE FROM public.sim_eventos WHERE session_id = p_session_id;
      DELETE FROM public.sim_recibos WHERE session_id = p_session_id;
      DELETE FROM public.session_drawings WHERE session_id = p_session_id;
      DELETE FROM public.sim_arrendamientos WHERE session_id = p_session_id;
      RETURN jsonb_build_object('ok', true, 'http', 200, 'borrada', p_session_id);
    END $f$;

    -- BORRAR TODO EL SIMULADOR DE UN ALUMNO (wipe del admin, § 7.0): barrera
    -- del alumno, sus arrendamientos, sus sesiones (padres antes que hijas),
    -- y las BORRA (aqui no queda lapida: CTO 11-oct); y las tablas del
    -- simulador sin sesion. El perfil y
    -- profiles.simulador_activo no se tocan (los lleva el endpoint).
    CREATE FUNCTION public.sim_borrar_alumno(p_user_id uuid)
      RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
    AS $f$
    DECLARE v_al jsonb; v_n integer; v_otros jsonb := '{}'::jsonb; v_m integer;
    BEGIN
      IF p_user_id IS NULL THEN RETURN public.sim_error(422, 'argumentos_incompletos'); END IF;
      v_al := public.sim_bloquea_alumno(p_user_id);
      PERFORM 1 FROM public.sim_arrendamientos WHERE user_id = p_user_id ORDER BY session_id FOR UPDATE;
      PERFORM 1 FROM public.sim_sessions WHERE user_id = p_user_id
        ORDER BY (challenge_parent_id IS NOT NULL), id FOR UPDATE;
      UPDATE public.sim_sessions SET terminal = 'borrada' WHERE user_id = p_user_id;
      DELETE FROM public.sim_sessions WHERE user_id = p_user_id;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      DELETE FROM public.sim_trades WHERE user_id = p_user_id;              GET DIAGNOSTICS v_m = ROW_COUNT; v_otros := v_otros || jsonb_build_object('sim_trades', v_m);
      DELETE FROM public.session_drawings WHERE user_id = p_user_id;        GET DIAGNOSTICS v_m = ROW_COUNT; v_otros := v_otros || jsonb_build_object('session_drawings', v_m);
      DELETE FROM public.session_chart_config WHERE user_id = p_user_id;    GET DIAGNOSTICS v_m = ROW_COUNT; v_otros := v_otros || jsonb_build_object('session_chart_config', v_m);
      DELETE FROM public.sim_drawing_templates WHERE user_id = p_user_id;   GET DIAGNOSTICS v_m = ROW_COUNT; v_otros := v_otros || jsonb_build_object('sim_drawing_templates', v_m);
      DELETE FROM public.user_chart_config WHERE user_id = p_user_id;       GET DIAGNOSTICS v_m = ROW_COUNT; v_otros := v_otros || jsonb_build_object('user_chart_config', v_m);
      DELETE FROM public.user_tool_config WHERE user_id = p_user_id;        GET DIAGNOSTICS v_m = ROW_COUNT; v_otros := v_otros || jsonb_build_object('user_tool_config', v_m);
      RETURN jsonb_build_object('ok', true, 'http', 200, 'sesiones', v_n, 'sueltas', v_otros, 'perfil', v_al IS NOT NULL);
    END $f$;

    -- ── 7 · permisos y RLS de lo nuevo ────────────────────────────────────
    ALTER TABLE public.sim_alumnos        ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.sim_arrendamientos ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.sim_recibos        ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.sim_eventos        ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.sim_alumnos, public.sim_arrendamientos, public.sim_recibos, public.sim_eventos
      FROM PUBLIC, anon, authenticated, service_role;
    REVOKE ALL ON SEQUENCE public.sim_recibos_id_seq, public.sim_eventos_id_seq FROM PUBLIC, anon, authenticated, service_role;
    GRANT SELECT ON public.sim_recibos, public.sim_eventos TO authenticated, service_role;
    CREATE POLICY sim_recibos_select_propios ON public.sim_recibos FOR SELECT TO authenticated USING (auth.uid() = user_id);
    CREATE POLICY sim_eventos_select_propios ON public.sim_eventos FOR SELECT TO authenticated USING (auth.uid() = user_id);

    FOREACH f IN ARRAY v_rpc || v_aux LOOP
      EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated, service_role', f);
    END LOOP;
    FOREACH f IN ARRAY v_rpc LOOP
      EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', f);
    END LOOP;
  END IF;

  -- ── 8 · comprobaciones (tambien en la segunda ejecucion) ────────────────
  FOREACH f IN ARRAY v_rpc || v_aux LOOP
    IF to_regprocedure('public.' || f) IS NULL THEN RAISE EXCEPTION 'sim-003: falta la funcion public.%', f; END IF;
    IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = to_regprocedure('public.' || f)) THEN
      RAISE EXCEPTION 'sim-003: public.% no es SECURITY DEFINER', f;
    END IF;
    SELECT proconfig INTO cfg FROM pg_proc WHERE oid = to_regprocedure('public.' || f);
    IF cfg IS NULL OR NOT ('search_path=""' = ANY (cfg)) THEN
      RAISE EXCEPTION 'sim-003: public.% no tiene el search_path vacio: %', f, cfg;
    END IF;
    FOREACH rol IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      IF has_function_privilege(rol, to_regprocedure('public.' || f), 'EXECUTE') THEN
        RAISE EXCEPTION 'sim-003: % puede ejecutar public.%', rol, f;
      END IF;
    END LOOP;
    IF EXISTS (SELECT 1 FROM pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                WHERE p.oid = to_regprocedure('public.' || f) AND a.grantee = 0) THEN
      RAISE EXCEPTION 'sim-003: PUBLIC conserva EXECUTE sobre public.%', f;
    END IF;
    IF has_function_privilege('service_role', to_regprocedure('public.' || f), 'EXECUTE') <> (f = ANY (v_rpc)) THEN
      RAISE EXCEPTION 'sim-003: service_role % ejecutar public.% y no deberia', CASE WHEN f = ANY (v_rpc) THEN 'NO puede' ELSE 'puede' END, f;
    END IF;
  END LOOP;
  FOREACH f IN ARRAY v_tablas LOOP
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = ('public.' || f)::regclass) THEN
      RAISE EXCEPTION 'sim-003: RLS apagada en public.%', f;
    END IF;
    FOREACH rol IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
      IF has_table_privilege(rol, 'public.' || f, 'INSERT') OR has_table_privilege(rol, 'public.' || f, 'UPDATE')
         OR has_table_privilege(rol, 'public.' || f, 'DELETE') OR has_table_privilege(rol, 'public.' || f, 'TRUNCATE')
         OR has_table_privilege(rol, 'public.' || f, 'REFERENCES') OR has_table_privilege(rol, 'public.' || f, 'TRIGGER') THEN
        RAISE EXCEPTION 'sim-003: % puede escribir en public.%', rol, f;
      END IF;
      IF has_table_privilege(rol, 'public.' || f, 'SELECT') <> (rol <> 'anon' AND f IN ('sim_recibos', 'sim_eventos')) THEN
        RAISE EXCEPTION 'sim-003: SELECT de % sobre public.% no es el previsto', rol, f;
      END IF;
    END LOOP;
  END LOOP;
  SELECT count(*) INTO v_n FROM pg_policies WHERE schemaname = 'public' AND tablename = ANY (v_tablas);
  IF v_n <> 2 THEN RAISE EXCEPTION 'sim-003: % politicas en las tablas nuevas; se esperaban 2', v_n; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.sim_sessions'::regclass
                  AND conname = 'sim_sessions_user_id_perfil_fkey' AND contype = 'f' AND confdeltype = 'c'
                  AND confrelid = 'public.profiles'::regclass AND convalidated) THEN
    RAISE EXCEPTION 'sim-003: falta la FK sim_sessions.user_id → profiles ON DELETE CASCADE, validada';
  END IF;
END
$sim_003$;


-- ============================================================================
-- INFORME (solo lectura). Lo que el bloque ha dejado, para pegarlo tal cual.
-- Solo catalogo: ni una fila de alumnos.
-- ============================================================================
with t(nombre) as (values ('sim_alumnos'), ('sim_arrendamientos'), ('sim_recibos'), ('sim_eventos'))
, f(firma, rpc) as (values
    ('public.sim_crear_sesion(uuid,uuid,uuid,text,integer,jsonb,jsonb,jsonb,jsonb)', true),
    ('public.sim_tomar_escritor(uuid,uuid,uuid,text,integer,text,boolean)', true),
    ('public.sim_comando(uuid,uuid,uuid,text,text,integer,bigint,text,text,jsonb)', true),
    ('public.sim_avanzar_fase(uuid,uuid,uuid,uuid,text,integer,bigint,jsonb,jsonb,jsonb,jsonb)', true),
    ('public.sim_borrar_sesion(uuid,uuid)', true), ('public.sim_borrar_legacy(uuid,uuid)', true),
    ('public.sim_borrar_alumno(uuid)', true), ('public.sim_error(integer,text,jsonb)', false),
    ('public.sim_bloquea_alumno(uuid)', false))
select seccion, detalle from (
  select 1 o, 'tabla' seccion, c.relname || ' · rls=' || c.relrowsecurity
         || ' · select: authenticated=' || has_table_privilege('authenticated', c.oid, 'SELECT')
         || ' service_role=' || has_table_privilege('service_role', c.oid, 'SELECT')
         || ' · escritura: ' || (has_table_privilege('authenticated', c.oid, 'INSERT,UPDATE,DELETE')
                                 or has_table_privilege('service_role', c.oid, 'INSERT,UPDATE,DELETE')
                                 or has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE')) detalle
    from pg_class c where c.oid in (select to_regclass('public.' || nombre) from t)
  union all
  select 2, 'columna', a.attrelid::regclass::text || '.' || a.attname || ' ' || format_type(a.atttypid, a.atttypmod)
         || case when a.attnotnull then ' not null' else '' end || coalesce(' default ' || pg_get_expr(d.adbin, d.adrelid), '')
    from pg_attribute a left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
   where a.attrelid in ('public.sim_sessions'::regclass, 'public.sim_trades'::regclass) and a.attnum > 0 and not a.attisdropped
     and a.attname in ('motor_version', 'epoca', 'version', 'estado', 'escritor', 'terminal', 'legado', 'legado_snapshot', 'mercado',
                       'creada_por_rpc', 'evento_id', 'bruto_micro', 'neto_micro', 'comision_micro', 'spread_micro', 'swap_micro',
                       'conversion', 'ambigua', 'causa_ambiguedad')
  union all
  select 3, 'restriccion', k.conrelid::regclass::text || '.' || k.conname || ' · ' || pg_get_constraintdef(k.oid) || ' · validada=' || k.convalidated
    from pg_constraint k
   where k.conname in ('sim_sessions_user_id_perfil_fkey', 'sim_sessions_v1_coherente', 'sim_sessions_terminal_valida',
                       'sim_trades_v1_coherente', 'sim_trades_evento_id_fkey', 'sim_trades_evento_id_key')
      or k.conrelid in (select to_regclass('public.' || nombre) from t)
  union all
  select 4, 'indice', i.indexrelid::regclass::text || ' · ' || pg_get_indexdef(i.indexrelid)
    from pg_index i where i.indexrelid = to_regclass('public.sim_sessions_una_hija_v1_key')
  union all
  select 5, 'politica', p.tablename || '.' || p.policyname || ' · ' || p.cmd || ' · ' || array_to_string(p.roles, ',') || ' · ' || p.qual
    from pg_policies p where p.schemaname = 'public' and p.tablename in (select nombre from t)
  union all
  select 6, 'funcion', p.oid::regprocedure::text || ' · security_definer=' || p.prosecdef
         || ' · config=' || coalesce(array_to_string(p.proconfig, ','), '-')
         || ' · execute: anon=' || has_function_privilege('anon', p.oid, 'EXECUTE')
         || ' authenticated=' || has_function_privilege('authenticated', p.oid, 'EXECUTE')
         || ' service_role=' || has_function_privilege('service_role', p.oid, 'EXECUTE')
         || ' PUBLIC=' || exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where a.grantee = 0)
    from pg_proc p join f on p.oid = to_regprocedure(f.firma)
  union all
  select 9, 'FIN', 'sim-003 aplicada'
) x order by o, detalle;
