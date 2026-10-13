-- ============================================================================
-- sim-004a-preparatoria — cierre atomico, registro de escrituras v0 y estado
-- del servicio (etapa 1)
--
-- POR QUE EXISTE. Diseño revisiones/2026-10-12-diseno-sim-004-y-motor-v1.md:
-- i.1 S4-01a (cierre atomico), k.1 c–d y k.4 c (registro), l.1 a, l.4, m.1,
-- m.4, n.7, n.9 y o (decisiones del CTO del 13-oct). Se aplica con la etapa 1,
-- ANTES de desplegar el cliente de la etapa 1, que llama al cierre atomico y
-- lee sim_servicio.
--
-- QUE CREA (todo en public):
--   sim_cierre_v0(uuid, numeric, bigint, jsonb)  el cierre total o parcial en
--       UNA transaccion: INSERT del trade y UPDATE del saldo. SECURITY INVOKER,
--       search_path vacio, EXECUTE solo authenticated: puede exactamente lo
--       que podian las dos sentencias de hoy, con los permisos y la RLS de hoy,
--       y solo sobre una sesion ACTIVA (ronda 2, E1-04): si el reto ya esta
--       decidido (passed_phase, passed_all, failed_*) rechaza con el error
--       prefijado «sim_cierre_v0: sesion cerrada:» y no guarda nada.
--   sim_escrituras_v0         el registro de escrituras en sim_sessions y
--       sim_trades (disparador A). INMUTABLE. Guarda nombres de columnas,
--       el delta de saldo y el id y pnl del trade; nunca el JSON de la fila.
--   sim_escrituras_v0_marcas  una marca por UPDATE de sim_sessions que
--       menciona balance (disparador B, AFTER UPDATE OF balance). INMUTABLE.
--   sim_escrituras_v0_parejas(uuid), sim_escrituras_v0_canonico(uuid)
--       el emparejamiento y el texto canonico con su sha256 (o.0, o.4). Solo
--       los ejecuta el dueño: s10 y el DO del corte.
--   sim_sessions.rev_saldo    (ronda 3, CTO 13-oct, Astra E1R2-01) columna
--       bigint NOT NULL DEFAULT 0 (sin reescribir la tabla, sin grants de
--       columna): el contador de revision del saldo. La mantiene SOLO el
--       disparador sim_sessions_rev_saldo (BEFORE INSERT OR UPDATE, funcion
--       public.sim_sessions_rev_saldo(), search_path vacio, sin SQL dinamico):
--       en INSERT la pone a 0; en UPDATE la sube en 1 si balance cambia (IS
--       DISTINCT FROM) y si no la deja como estaba. Ningun cliente la puede
--       fijar ni restaurar. /api/challenge/advance la lee con la sesion y
--       condiciona su escritura a ella (CAS): dos cierres que se compensan
--       dejan el saldo igual pero el contador no.
--       Y (ronda 3, CTO 13-oct) cualquier escritura en sim_trades (INSERT,
--       UPDATE, DELETE) sube en 1 el contador de su sesion (en un UPDATE que
--       cambia session_id, el de las dos): disparador sim_trades_rev_saldo
--       AFTER … FOR EACH ROW, funcion SECURITY DEFINER, search_path vacio,
--       sin SQL dinamico. El disparador de sim_sessions solo acepta ese +1
--       dentro de un disparador (pg_trigger_depth() > 1) Y con la marca de
--       transaccion sim.rev_saldo_trades = la sesion, que pone esa funcion
--       justo antes y borra justo despues (diseño o.16.5). Un cierre por
--       sim_cierre_v0 sube el contador 2 (trade + saldo): es monotonico; nadie
--       debe contar unidades, solo compararlo.
--   dos politicas RESTRICTIVE de sim_trades para authenticated (ronda 3 ter,
--       CTO 13-oct, o.16.7): sim_trades_sesion_propia_insert (WITH CHECK) y
--       sim_trades_sesion_propia_update (USING y WITH CHECK) exigen que la
--       sesion del trade sea del alumno (EXISTS sobre sim_sessions con id =
--       session_id y user_id = auth.uid()). Se suman (AND) a la politica de
--       hoy «Users see own trades» (FOR ALL, auth.uid() = user_id), que no se
--       toca: un alumno ya no puede escribir ni mover trades a una sesion
--       ajena. SELECT y DELETE, sin cambios. service_role (BYPASSRLS) no se ve
--       afectado. Antes de crearlas se comprueba que la politica vigente es
--       exactamente la de s04; si no, no se toca nada.
--       Lo mismo (ronda 3 quater, o.16.9) en session_drawings y
--       session_chart_config: <tabla>_sesion_propia_insert / _update.
--   sim_sessions_padre_propio (ronda 3 quater, o.16.9) disparador BEFORE
--       INSERT OR UPDATE en sim_sessions, funcion SECURITY DEFINER, search_path
--       vacio: challenge_parent_id solo puede apuntar a una sesion que existe y
--       es del mismo usuario (se comprueba al ponerlo o cambiarlo, o al cambiar
--       user_id). Sin politica sobre sim_sessions que lea sim_sessions (seria
--       recursiva). Vale para todos, service_role incluido: la hija legitima
--       de advance es del mismo usuario.
--   sim_servicio              una fila: mantenimiento y version minima del
--       cliente (o.5). La leen authenticated (el cliente) y service_role (los
--       endpoints que escriben economia en el servidor, o.12); la escribe solo
--       el dueño, por SQL anotado en sql/APLICADOS.md. Nace con
--       mantenimiento = false y version_minima = '1'.
--
-- ⚠️ EL REGISTRO NO ES SEGURIDAD: la cabecera x-sim-cliente se puede
--    falsificar. Detecta clientes anteriores a la etapa 1 (k.1 d, k.3.3).
-- ⚠️ La puerta (rechazar escrituras de alumno sin cabecera) NO va aqui: es
--    sql/sim-004a-puerta.sql, que se aplica despues (m.3).
--
-- ESTADOS (o.0, S4R6-02). Este fichero reconoce tres y compara el catalogo
-- EXACTO de disparadores de sim_sessions, sim_trades y las dos tablas del
-- registro:
--   0 · antes de la preparatoria → instala y termina en el estado 1
--   1 · registro instalado        → comprueba, no cambia nada
--   2 · registro + puerta         → comprueba, no cambia nada; la puerta sigue
--   cualquier otro (a medias, un disparador de mas o de menos, una
--   definicion distinta) → revienta con «sim-004a: …» y no toca nada.
--
-- SUCESION (k.1 c, o.1): despues de este fichero, sim-003 se puede volver a
-- ejecutar y termina SIN error (este fichero no cambia nada que sim-003
-- compare). Lo que deja a sim-003 sin poder ejecutarse es sim-004b.
--
-- ── COMO SE EJECUTA ────────────────────────────────────────────────────────
--   Entero, de una vez, en el editor SQL de Supabase. Son DOS ordenes:
--     1. un bloque DO que comprueba, crea y vuelve a comprobar. Si algo falla
--        revienta con «sim-004a: …» y no queda NADA (una transaccion).
--     2. una SELECT de informe (solo catalogo y la fila de sim_servicio, sin
--        datos de alumnos) que acaba en «FIN | sim-004a-preparatoria aplicada».
--   Segunda ejecucion: la misma salida, sin cambios. No toca la fila de
--   sim_servicio (el dueño puede haber activado el mantenimiento).
--
-- Ensayado en PostgreSQL 17 local, con el esquema de produccion de s04 + sim-002
-- + sim-003 y un ejecutor NO superusuario con los privilegios por defecto de
-- s06 (pruebas/sim-004a.mjs). No prueba el editor de Supabase.
-- ============================================================================

DO $sim_004a$
DECLARE
  f          text;
  rol        text;
  v_n        integer;
  v_txt      text;
  v_tipo     text;
  v_sp       text;
  v_hay      integer := 0;
  v_puerta   integer := 0;
  v_estado   integer;
  v_esperado text;
  v_actual   text;

  -- ── los cuerpos: se crean con estos textos y se comparan con ellos ──────
  v_cierre text := $c$
DECLARE
  v_id     uuid;
  v_n      integer;
  v_extra  text;
  v_status text;
BEGIN
  IF p_session_id IS NULL OR p_balance IS NULL OR p_trade IS NULL OR jsonb_typeof(p_trade) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'sim_cierre_v0: faltan la sesion, el saldo o el trade';
  END IF;
  SELECT string_agg(k, ', ' ORDER BY k) INTO v_extra FROM jsonb_object_keys(p_trade) k
   WHERE k NOT IN ('id', 'user_id', 'pair', 'side', 'lots', 'entry_price', 'exit_price', 'sl_price', 'tp_price',
                   'rr', 'pnl', 'result', 'notes', 'session_type', 'opened_at', 'closed_at');
  IF v_extra IS NOT NULL THEN
    RAISE EXCEPTION 'sim_cierre_v0: claves no admitidas en el trade: %', v_extra;
  END IF;
  IF nullif(p_trade ->> 'id', '') IS NULL THEN
    RAISE EXCEPTION 'sim_cierre_v0: el trade necesita su id (lo genera el cliente)';
  END IF;
  INSERT INTO public.sim_trades (id, session_id, user_id, pair, side, lots, entry_price, exit_price, sl_price, tp_price,
                                 rr, pnl, result, notes, session_type, opened_at, closed_at)
  SELECT r.id, p_session_id, r.user_id, r.pair, r.side, r.lots, r.entry_price, r.exit_price, r.sl_price, r.tp_price,
         r.rr, r.pnl, r.result, r.notes, r.session_type, r.opened_at, r.closed_at
    FROM jsonb_populate_record(NULL::public.sim_trades, p_trade) r
  RETURNING id INTO v_id;
  -- ronda 2 (CTO 13-oct, Astra E1-04): solo sobre una sesion ACTIVA (status NULL = activa,
  -- como en el cliente). La condicion va en el UPDATE: si el paso de fase confirma mientras
  -- este cierre espera su cerrojo, el UPDATE la vuelve a mirar y no actualiza nada
  IF p_last_timestamp IS NULL THEN
    UPDATE public.sim_sessions SET balance = p_balance WHERE id = p_session_id AND coalesce(status, 'active') = 'active';
  ELSE
    UPDATE public.sim_sessions SET balance = p_balance, last_timestamp = p_last_timestamp WHERE id = p_session_id AND coalesce(status, 'active') = 'active';
  END IF;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n IS DISTINCT FROM 1 THEN
    SELECT s.status INTO v_status FROM public.sim_sessions s WHERE s.id = p_session_id;
    IF FOUND THEN
      RAISE EXCEPTION 'sim_cierre_v0: sesion cerrada: la sesion % ya no esta activa (%)', p_session_id, v_status;
    END IF;
    RAISE EXCEPTION 'sim_cierre_v0: la sesion % no existe o no es tuya', p_session_id;
  END IF;
  RETURN v_id;
END
$c$;

  v_registra text := $c$
DECLARE
  v_h     json := nullif(current_setting('request.headers', true), '')::json;
  v_c     json := nullif(current_setting('request.jwt.claims', true), '')::json;
  v_fila  jsonb;
  v_vieja jsonb;
  v_cols  text[];
  v_ses   uuid;
  v_delta numeric;
  v_trade uuid;
  v_pnl   numeric;
BEGIN
  IF TG_OP = 'DELETE' THEN v_fila := to_jsonb(OLD); ELSE v_fila := to_jsonb(NEW); END IF;
  IF TG_OP = 'UPDATE' THEN
    v_vieja := to_jsonb(OLD);
    SELECT coalesce(array_agg(n.key ORDER BY n.key), '{}') INTO v_cols
      FROM jsonb_each(v_fila) n JOIN jsonb_each(v_vieja) o ON o.key = n.key
     WHERE n.value IS DISTINCT FROM o.value;
  ELSE
    SELECT array_agg(k ORDER BY k) INTO v_cols FROM jsonb_object_keys(v_fila) k;
  END IF;
  -- el +1 que sim_trades_rev_saldo hace en la sesion (solo rev_saldo, dentro de otro disparador) no es
  -- una escritura de cliente: la de sim_trades ya queda registrada. No se registra (o.16.5)
  IF TG_TABLE_NAME = 'sim_sessions' AND TG_OP = 'UPDATE' AND v_cols = ARRAY['rev_saldo'] AND pg_trigger_depth() > 1 THEN
    RETURN NULL;
  END IF;
  IF TG_TABLE_NAME = 'sim_sessions' THEN
    v_ses := (v_fila ->> 'id')::uuid;
    IF TG_OP = 'UPDATE' THEN
      v_delta := (v_fila ->> 'balance')::numeric - (v_vieja ->> 'balance')::numeric;
    ELSIF TG_OP = 'INSERT' THEN
      v_delta := (v_fila ->> 'balance')::numeric - (v_fila ->> 'capital')::numeric;
    END IF;
  ELSE
    v_ses := (v_fila ->> 'session_id')::uuid;
    v_trade := (v_fila ->> 'id')::uuid;
    IF TG_OP <> 'UPDATE' THEN v_pnl := (v_fila ->> 'pnl')::numeric; END IF;
  END IF;
  INSERT INTO public.sim_escrituras_v0 (session_id, user_id, tabla, operacion, xact, cliente, rol_jwt, rol_guc,
                                        columnas, delta, trade_id, pnl, en)
  VALUES (v_ses, (v_fila ->> 'user_id')::uuid, TG_TABLE_NAME, TG_OP, pg_current_xact_id()::text,
          coalesce(nullif(v_h ->> 'x-sim-cliente', ''), 'sin-firma'), nullif(v_c ->> 'role', ''),
          current_setting('role', true), v_cols, v_delta, v_trade, v_pnl, clock_timestamp());
  RETURN NULL;
END
$c$;

  v_marca text := $c$
DECLARE
  v_x  text := pg_current_xact_id()::text;
  v_id bigint;
BEGIN
  SELECT e.id INTO v_id FROM public.sim_escrituras_v0 e
   WHERE e.session_id = NEW.id AND e.xact = v_x AND e.tabla = 'sim_sessions' AND e.operacion = 'UPDATE'
   ORDER BY e.id DESC LIMIT 1;
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'sim_escrituras_v0: marca de balance sin fila de registro (sesion %)', NEW.id;
  END IF;
  INSERT INTO public.sim_escrituras_v0_marcas (escritura_id, xact) VALUES (v_id, v_x);
  RETURN NULL;
END
$c$;

  v_inmutable text := $c$
BEGIN
  RAISE EXCEPTION 'sim_escrituras_v0: % es inmutable (% rechazado)', TG_TABLE_NAME, TG_OP;
END
$c$;

  -- el contador de revision del saldo (E1R2-01): lo unico que hace es fijar NEW.rev_saldo
  v_rev text := $c$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.rev_saldo := 0;
  ELSIF NEW.balance IS DISTINCT FROM OLD.balance THEN
    NEW.rev_saldo := OLD.rev_saldo + 1;
  ELSIF pg_trigger_depth() > 1
        AND current_setting('sim.rev_saldo_trades', true) IS NOT DISTINCT FROM OLD.id::text
        AND NEW.rev_saldo IS NOT DISTINCT FROM OLD.rev_saldo + 1 THEN
    -- el +1 de sim_trades_rev_saldo: dentro de un disparador y con su marca para ESTA sesion
    NEW.rev_saldo := OLD.rev_saldo + 1;
  ELSE
    NEW.rev_saldo := OLD.rev_saldo;
  END IF;
  RETURN NEW;
END
$c$;

  -- (o.16.9) challenge_parent_id solo apunta a una sesion que existe y es del mismo usuario; se mira al
  -- ponerlo o cambiarlo, o al cambiar user_id (las filas de antes no se revisan aqui: las mide s12)
  v_padre text := $c$
DECLARE
  v_dueno uuid;
BEGIN
  IF NEW.challenge_parent_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.challenge_parent_id IS DISTINCT FROM OLD.challenge_parent_id OR NEW.user_id IS DISTINCT FROM OLD.user_id) THEN
    SELECT s.user_id INTO v_dueno FROM public.sim_sessions s WHERE s.id = NEW.challenge_parent_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'sim_sessions_padre_propio: la sesion padre % no existe', NEW.challenge_parent_id;
    END IF;
    IF v_dueno IS DISTINCT FROM NEW.user_id THEN
      RAISE EXCEPTION 'sim_sessions_padre_propio: la sesion padre % es de otro usuario', NEW.challenge_parent_id;
    END IF;
  END IF;
  RETURN NEW;
END
$c$;

  -- cualquier escritura de sim_trades sube 1 el contador de su sesion (ronda 3, o.16.5); en orden
  -- de id para que dos movimientos de trades entre las mismas sesiones bloqueen en el mismo orden
  v_rev_trades text := $c$
DECLARE
  v_ids uuid[];
  v_id  uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN v_ids := ARRAY[NEW.session_id];
  ELSIF TG_OP = 'DELETE' THEN v_ids := ARRAY[OLD.session_id];
  ELSE v_ids := ARRAY[OLD.session_id, NEW.session_id];
  END IF;
  FOR v_id IN SELECT DISTINCT x FROM unnest(v_ids) x WHERE x IS NOT NULL ORDER BY x LOOP
    PERFORM set_config('sim.rev_saldo_trades', v_id::text, true);
    UPDATE public.sim_sessions SET rev_saldo = rev_saldo + 1 WHERE id = v_id;
    PERFORM set_config('sim.rev_saldo_trades', '', true);
  END LOOP;
  RETURN NULL;
END
$c$;

  v_solo text := $c$
BEGIN
  IF pg_trigger_depth() IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'sim_escrituras_v0: en % solo inserta su disparador (profundidad %)', TG_TABLE_NAME, pg_trigger_depth();
  END IF;
  RETURN NEW;
END
$c$;

  v_parejas text := $c$
DECLARE
  r     record;
  v_i   bigint;
  v_usa bigint[] := '{}';
  v_k   integer := 0;
BEGIN
  FOR r IN SELECT e.id, e.en, e.delta FROM public.sim_escrituras_v0 e
            WHERE e.session_id = p_session_id AND e.tabla = 'sim_sessions' AND e.operacion = 'UPDATE'
              AND e.cliente = 'sin-firma' AND e.rol_jwt IN ('authenticated', 'anon')
            ORDER BY e.en, e.id
  LOOP
    v_i := NULL;
    SELECT t.id INTO v_i FROM public.sim_escrituras_v0 t
     WHERE t.session_id = p_session_id AND t.tabla = 'sim_trades' AND t.operacion = 'INSERT'
       AND t.cliente = 'sin-firma' AND t.rol_jwt IN ('authenticated', 'anon')
       AND NOT (t.id = ANY (v_usa))
       AND abs(r.delta - t.pnl) <= 0.01
       AND t.en BETWEEN r.en - interval '10 seconds' AND r.en + interval '10 seconds'
     ORDER BY t.en, t.id LIMIT 1;
    IF v_i IS NOT NULL THEN
      v_usa := v_usa || v_i;
      v_k := v_k + 1;
      orden := v_k; escritura_update := r.id; escritura_insert := v_i;
      RETURN NEXT;
    END IF;
  END LOOP;
END
$c$;

  v_canonico text := $c$
DECLARE
  v_filas   text;
  v_parejas text;
  v_texto   text;
BEGIN
  SELECT string_agg('[' || concat_ws(',',
           coalesce(to_json(e.id::text)::text, 'null'),
           coalesce(to_json(e.session_id::text)::text, 'null'),
           coalesce(to_json(e.user_id::text)::text, 'null'),
           coalesce(to_json(e.tabla)::text, 'null'),
           coalesce(to_json(e.operacion)::text, 'null'),
           coalesce(to_json(e.xact)::text, 'null'),
           coalesce(to_json(e.cliente)::text, 'null'),
           coalesce(to_json(e.rol_jwt)::text, 'null'),
           coalesce(to_json(e.rol_guc)::text, 'null'),
           CASE WHEN e.columnas IS NULL THEN 'null'
                ELSE coalesce((SELECT array_to_json(array_agg(c ORDER BY c))::text FROM unnest(e.columnas) c), '[]') END,
           coalesce(to_json(trim_scale(e.delta)::text)::text, 'null'),
           coalesce(to_json(e.trade_id::text)::text, 'null'),
           coalesce(to_json(trim_scale(e.pnl)::text)::text, 'null'),
           coalesce(to_json(to_char(e.en AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'))::text, 'null'),
           coalesce(to_json(m.id::text)::text, 'null'),
           coalesce(to_json(m.xact)::text, 'null')) || ']', ',' ORDER BY e.id, m.id)
    INTO v_filas
    FROM public.sim_escrituras_v0 e
    LEFT JOIN public.sim_escrituras_v0_marcas m ON m.escritura_id = e.id
   WHERE e.session_id = p_session_id AND e.cliente = 'sin-firma' AND e.rol_jwt IN ('authenticated', 'anon');
  SELECT string_agg('[' || to_json(p.escritura_update::text)::text || ',' || to_json(p.escritura_insert::text)::text || ']', ',' ORDER BY p.orden)
    INTO v_parejas
    FROM public.sim_escrituras_v0_parejas(p_session_id) p;
  v_texto := '{"version":' || to_json('sim-escrituras-canonico@1'::text)::text
          || ',"sesion":' || coalesce(to_json(p_session_id::text)::text, 'null')
          || ',"filas":[' || coalesce(v_filas, '') || ']'
          || ',"parejas":[' || coalesce(v_parejas, '') || ']}';
  texto := v_texto;
  sha256 := encode(sha256(convert_to(v_texto, 'UTF8')), 'hex');
  RETURN NEXT;
END
$c$;

  -- las politicas de sim_trades (o.16.7): la de hoy (s04) y las dos RESTRICTIVE de este fichero, como las
  -- devuelve pg_policies con search_path vacio
  -- tabla · su politica de hoy (s04, FOR ALL TO public USING auth.uid() = user_id), o.16.7 y o.16.9
  v_pol_tablas   text[][] := ARRAY[
    ARRAY['session_chart_config', 'user owns session config'],
    ARRAY['session_drawings', 'user owns session drawings'],
    ARRAY['sim_trades', 'Users see own trades']];
  -- la condicion de las RESTRICTIVE, con TABLA en lugar del nombre de la tabla
  v_pol_cond     constant text := E'(EXISTS ( SELECT 1\n   FROM public.sim_sessions s\n  WHERE ((s.id = TABLA.session_id) AND (s.user_id = ( SELECT auth.uid() AS uid)))))';
  v_pol_trades   text;
  v_cond         text;

  -- sha256 del cuerpo de la funcion de la puerta (sql/sim-004a-puerta.sql):
  -- con la puerta activa, este fichero comprueba que es esa y no otra
  v_puerta_sha constant text := 'fe4c7c32b146e7d525665760047af0ad49d85d2dc538e1afcf3b080a9f305883';

  -- firma · cuerpo · definer · volatilidad · retorno · quien la ejecuta
  v_funciones text[][] := ARRAY[
    ARRAY['sim_cierre_v0(uuid,numeric,bigint,jsonb)', 'cierre', 'f', 'v', 'uuid', 'authenticated'],
    ARRAY['sim_escrituras_v0_registra()', 'registra', 't', 'v', 'trigger', ''],
    ARRAY['sim_escrituras_v0_marca_balance()', 'marca', 't', 'v', 'trigger', ''],
    ARRAY['sim_escrituras_v0_inmutable()', 'inmutable', 'f', 'v', 'trigger', ''],
    ARRAY['sim_escrituras_v0_solo_disparador()', 'solo', 'f', 'v', 'trigger', ''],
    ARRAY['sim_escrituras_v0_parejas(uuid)', 'parejas', 'f', 's', 'record', ''],
    ARRAY['sim_escrituras_v0_canonico(uuid)', 'canonico', 'f', 's', 'record', ''],
    ARRAY['sim_sessions_rev_saldo()', 'rev', 'f', 'v', 'trigger', ''],
    ARRAY['sim_trades_rev_saldo()', 'rev_trades', 't', 'v', 'trigger', ''],
    ARRAY['sim_sessions_padre_propio()', 'padre', 't', 'v', 'trigger', '']];
  v_tablas    text[] := ARRAY['sim_escrituras_v0', 'sim_escrituras_v0_marcas', 'sim_servicio'];
  v_secuencias text[] := ARRAY['sim_escrituras_v0_id_seq', 'sim_escrituras_v0_marcas_id_seq'];
  v_nombres   text[] := ARRAY['sim_escrituras_v0', 'sim_escrituras_v0_pkey', 'sim_escrituras_v0_id_seq',
                              'sim_escrituras_v0_sesion_xact_idx', 'sim_escrituras_v0_marcas', 'sim_escrituras_v0_marcas_pkey',
                              'sim_escrituras_v0_marcas_id_seq', 'sim_escrituras_v0_marcas_escritura_idx',
                              'sim_servicio', 'sim_servicio_pkey'];
  v_nom_fun   text[] := ARRAY['sim_cierre_v0', 'sim_escrituras_v0_registra', 'sim_escrituras_v0_marca_balance',
                              'sim_escrituras_v0_inmutable', 'sim_escrituras_v0_solo_disparador',
                              'sim_escrituras_v0_parejas', 'sim_escrituras_v0_canonico', 'sim_escrituras_v0_puerta',
                              'sim_sessions_rev_saldo', 'sim_trades_rev_saldo', 'sim_sessions_padre_propio'];
  v_disp      text[] := ARRAY['sim_escrituras_v0_a', 'sim_escrituras_v0_b_balance', 'sim_escrituras_v0_inmutable_fila',
                              'sim_escrituras_v0_inmutable_truncate', 'sim_escrituras_v0_solo_disparador', 'sim_sessions_rev_saldo',
                              'sim_trades_rev_saldo', 'sim_sessions_padre_propio'];
  v_total     integer;

  -- los 22 + 6 disparadores de hoy (s04 + sim-003): estado 0 (o.0, S4R6-02)
  v_hoy text := concat_ws(E'\n',
    'public.sim_sessions|fk:session_chart_config_session_id_fkey|"RI_FKey_cascade_del"()|9|O',
    'public.sim_sessions|fk:session_chart_config_session_id_fkey|"RI_FKey_noaction_upd"()|17|O',
    'public.sim_sessions|fk:session_drawings_session_id_fkey|"RI_FKey_cascade_del"()|9|O',
    'public.sim_sessions|fk:session_drawings_session_id_fkey|"RI_FKey_noaction_upd"()|17|O',
    'public.sim_sessions|fk:sim_arrendamientos_session_id_fkey|"RI_FKey_cascade_del"()|9|O',
    'public.sim_sessions|fk:sim_arrendamientos_session_id_fkey|"RI_FKey_noaction_upd"()|17|O',
    'public.sim_sessions|fk:sim_eventos_session_id_fkey|"RI_FKey_cascade_del"()|9|O',
    'public.sim_sessions|fk:sim_eventos_session_id_fkey|"RI_FKey_noaction_upd"()|17|O',
    'public.sim_sessions|fk:sim_recibos_session_id_fkey|"RI_FKey_cascade_del"()|9|O',
    'public.sim_sessions|fk:sim_recibos_session_id_fkey|"RI_FKey_noaction_upd"()|17|O',
    'public.sim_sessions|fk:sim_sessions_challenge_parent_id_fkey|"RI_FKey_check_ins"()|5|O',
    'public.sim_sessions|fk:sim_sessions_challenge_parent_id_fkey|"RI_FKey_check_upd"()|17|O',
    'public.sim_sessions|fk:sim_sessions_challenge_parent_id_fkey|"RI_FKey_noaction_upd"()|17|O',
    'public.sim_sessions|fk:sim_sessions_challenge_parent_id_fkey|"RI_FKey_setnull_del"()|9|O',
    'public.sim_sessions|fk:sim_sessions_user_id_fkey|"RI_FKey_check_ins"()|5|O',
    'public.sim_sessions|fk:sim_sessions_user_id_fkey|"RI_FKey_check_upd"()|17|O',
    'public.sim_sessions|fk:sim_sessions_user_id_perfil_fkey|"RI_FKey_check_ins"()|5|O',
    'public.sim_sessions|fk:sim_sessions_user_id_perfil_fkey|"RI_FKey_check_upd"()|17|O',
    'public.sim_sessions|fk:sim_trades_session_id_fkey|"RI_FKey_cascade_del"()|9|O',
    'public.sim_sessions|fk:sim_trades_session_id_fkey|"RI_FKey_noaction_upd"()|17|O',
    'public.sim_sessions|trg_enforce_sim_session_limit|CREATE TRIGGER trg_enforce_sim_session_limit BEFORE INSERT ON public.sim_sessions FOR EACH ROW EXECUTE FUNCTION public.enforce_sim_session_limit()|7|O',
    'public.sim_trades|fk:sim_trades_evento_id_fkey|"RI_FKey_check_ins"()|5|O',
    'public.sim_trades|fk:sim_trades_evento_id_fkey|"RI_FKey_check_upd"()|17|O',
    'public.sim_trades|fk:sim_trades_session_id_fkey|"RI_FKey_check_ins"()|5|O',
    'public.sim_trades|fk:sim_trades_session_id_fkey|"RI_FKey_check_upd"()|17|O',
    'public.sim_trades|fk:sim_trades_user_id_fkey|"RI_FKey_check_ins"()|5|O',
    'public.sim_trades|fk:sim_trades_user_id_fkey|"RI_FKey_check_upd"()|17|O');
  -- lo que añade este fichero: estado 1
  v_registro text := concat_ws(E'\n',
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
  v_lapuerta text := concat_ws(E'\n',
    'public.sim_sessions|sim_escrituras_v0_puerta|CREATE TRIGGER sim_escrituras_v0_puerta BEFORE INSERT OR DELETE OR UPDATE ON public.sim_sessions FOR EACH ROW EXECUTE FUNCTION public.sim_escrituras_v0_puerta()|31|O',
    'public.sim_trades|sim_escrituras_v0_puerta|CREATE TRIGGER sim_escrituras_v0_puerta BEFORE INSERT OR DELETE OR UPDATE ON public.sim_trades FOR EACH ROW EXECUTE FUNCTION public.sim_escrituras_v0_puerta()|31|O');
BEGIN
  -- ── 0 · lo que se da por hecho ──────────────────────────────────────────
  IF current_setting('server_version_num')::integer < 170000 THEN
    RAISE EXCEPTION 'sim-004a: hace falta PostgreSQL 17 o posterior (hay %)', current_setting('server_version');
  END IF;
  FOREACH rol IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = rol) THEN
      RAISE EXCEPTION 'sim-004a: no existe el rol %', rol;
    END IF;
  END LOOP;
  -- sim-003 aplicada: sus funciones y sus tablas (la comprobacion completa de
  -- sim-003 es la suya; se puede volver a ejecutar despues de esta, o.1)
  FOREACH f IN ARRAY ARRAY['sim_crear_sesion(uuid,uuid,uuid,text,integer,jsonb,jsonb,jsonb,jsonb)', 'sim_borrar_legacy(uuid,uuid)',
                           'sim_borrar_alumno(uuid)'] LOOP
    IF to_regprocedure('public.' || f) IS NULL THEN RAISE EXCEPTION 'sim-004a: sim-003 no esta aplicada (falta public.%)', f; END IF;
  END LOOP;
  -- las columnas que usan el cierre y el registro, con su tipo (s04 + sim-003)
  FOR f, v_txt IN SELECT * FROM (VALUES
      ('sim_sessions.id', 'uuid'), ('sim_sessions.user_id', 'uuid'), ('sim_sessions.capital', 'numeric'),
      ('sim_sessions.balance', 'numeric'), ('sim_sessions.last_timestamp', 'bigint'), ('sim_sessions.legado', 'boolean'),
      ('sim_sessions.terminal', 'text'),
      ('sim_trades.id', 'uuid'), ('sim_trades.session_id', 'uuid'), ('sim_trades.user_id', 'uuid'), ('sim_trades.pair', 'text'),
      ('sim_trades.side', 'text'), ('sim_trades.lots', 'numeric(10,2)'), ('sim_trades.entry_price', 'numeric(10,5)'),
      ('sim_trades.exit_price', 'numeric(10,5)'), ('sim_trades.sl_price', 'numeric(10,5)'), ('sim_trades.tp_price', 'numeric(10,5)'),
      ('sim_trades.rr', 'numeric(10,2)'), ('sim_trades.pnl', 'numeric(10,2)'), ('sim_trades.result', 'text'),
      ('sim_trades.notes', 'text'), ('sim_trades.session_type', 'text'), ('sim_trades.opened_at', 'timestamp with time zone'),
      ('sim_trades.closed_at', 'timestamp with time zone')) c(col, tipo)
  LOOP
    v_tipo := NULL;
    SELECT format_type(a.atttypid, a.atttypmod) INTO v_tipo
      FROM pg_attribute a
     WHERE a.attrelid = to_regclass('public.' || split_part(f, '.', 1)) AND a.attname = split_part(f, '.', 2)
       AND a.attnum > 0 AND NOT a.attisdropped;
    IF v_tipo IS DISTINCT FROM v_txt THEN
      RAISE EXCEPTION 'sim-004a: public.% es % y se esperaba %: no se aplica nada', f, coalesce(v_tipo, '(no existe)'), v_txt;
    END IF;
  END LOOP;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.sim_sessions'::regclass)
     OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.sim_trades'::regclass) THEN
    RAISE EXCEPTION 'sim-004a: RLS apagada en sim_sessions o sim_trades: revisar antes';
  END IF;

  -- ── ¿estado 0, 1, 2 o a medias? ─────────────────────────────────────────
  SELECT count(*) INTO v_n FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = ANY (v_tablas) AND c.relkind = 'r';
  v_hay := v_hay + v_n;
  SELECT count(*) INTO v_n FROM generate_subscripts(v_funciones, 1) i WHERE to_regprocedure('public.' || v_funciones[i][1]) IS NOT NULL;
  v_hay := v_hay + v_n;
  SELECT count(*) INTO v_n FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND t.tgname = ANY (v_disp)
     AND c.relname IN ('sim_sessions', 'sim_trades', 'sim_escrituras_v0', 'sim_escrituras_v0_marcas');
  v_hay := v_hay + v_n;
  -- la columna rev_saldo (E1R2-01) tambien es una pieza: en el estado 0 su nombre tiene que estar libre
  SELECT count(*) INTO v_n FROM pg_attribute WHERE attrelid = 'public.sim_sessions'::regclass AND attname = 'rev_saldo' AND NOT attisdropped;
  v_hay := v_hay + v_n;
  -- y las dos politicas de sim_trades (o.16.7)
  SELECT count(*) INTO v_n FROM pg_policy WHERE polrelid = 'public.sim_trades'::regclass
     AND polname IN ('sim_trades_sesion_propia_insert', 'sim_trades_sesion_propia_update');
  v_hay := v_hay + v_n;
  -- (o.16.9) las cuatro de session_drawings y session_chart_config
  SELECT count(*) INTO v_n FROM pg_policy WHERE polrelid IN ('public.session_drawings'::regclass, 'public.session_chart_config'::regclass)
     AND polname IN ('session_drawings_sesion_propia_insert', 'session_drawings_sesion_propia_update',
                     'session_chart_config_sesion_propia_insert', 'session_chart_config_sesion_propia_update');
  v_hay := v_hay + v_n;
  v_total := cardinality(v_tablas) + array_length(v_funciones, 1) + 12 + 1 + 6;
  SELECT (to_regprocedure('public.sim_escrituras_v0_puerta()') IS NOT NULL)::integer
       + (SELECT count(*) FROM pg_trigger WHERE tgname = 'sim_escrituras_v0_puerta'
           AND tgrelid IN ('public.sim_sessions'::regclass, 'public.sim_trades'::regclass))::integer
    INTO v_puerta;

  IF v_hay > 0 AND v_hay < v_total THEN
    RAISE EXCEPTION 'sim-004a: A MEDIAS (% de % piezas ya existen): no se toca nada; revisar a mano', v_hay, v_total;
  END IF;
  IF v_hay = 0 AND v_puerta > 0 THEN
    RAISE EXCEPTION 'sim-004a: hay piezas de la puerta sin el registro: no se toca nada; revisar a mano';
  END IF;
  IF v_puerta NOT IN (0, 3) THEN
    RAISE EXCEPTION 'sim-004a: la puerta esta A MEDIAS (% de 3 piezas): no se toca nada; revisar a mano', v_puerta;
  END IF;
  v_estado := CASE WHEN v_hay = 0 THEN 0 WHEN v_puerta = 0 THEN 1 ELSE 2 END;

  -- el catalogo de disparadores, con search_path vacio (nombres completos)
  v_sp := current_setting('search_path');
  PERFORM set_config('search_path', '', true);
  SELECT coalesce(string_agg(x, E'\n' ORDER BY x COLLATE "C"), '') INTO v_actual FROM (
    SELECT c.oid::regclass::text || '|' ||
           CASE WHEN t.tgisinternal THEN 'fk:' || k.conname || '|' || t.tgfoid::regprocedure::text
                ELSE t.tgname || '|' || pg_get_triggerdef(t.oid) END
           || '|' || t.tgtype || '|' || t.tgenabled::text AS x
      FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid LEFT JOIN pg_constraint k ON k.oid = t.tgconstraint
     WHERE c.oid IN ('public.sim_sessions'::regclass, 'public.sim_trades'::regclass)
        OR c.oid = to_regclass('public.sim_escrituras_v0') OR c.oid = to_regclass('public.sim_escrituras_v0_marcas')) s;
  SELECT string_agg(x, E'\n' ORDER BY x COLLATE "C") INTO v_esperado
    FROM regexp_split_to_table(concat_ws(E'\n', v_hoy,
           CASE WHEN v_estado >= 1 THEN v_registro END,
           CASE WHEN v_estado = 2 THEN v_lapuerta END), E'\n') x;
  PERFORM set_config('search_path', v_sp, true);
  IF v_actual IS DISTINCT FROM v_esperado THEN
    RAISE EXCEPTION 'sim-004a: los disparadores no son los del estado % (o.0). De mas: [%] · De menos: [%]', v_estado,
      (SELECT string_agg(x, ' ; ') FROM (SELECT regexp_split_to_table(v_actual, E'\n') x EXCEPT ALL SELECT regexp_split_to_table(v_esperado, E'\n')) d),
      (SELECT string_agg(x, ' ; ') FROM (SELECT regexp_split_to_table(v_esperado, E'\n') x EXCEPT ALL SELECT regexp_split_to_table(v_actual, E'\n')) d);
  END IF;

  IF v_estado = 0 THEN
    -- ── 1 · nombres libres, en CUALQUIER esquema ────────────────────────
    SELECT string_agg(n.nspname || '.' || c.relname, ', ' ORDER BY 1) INTO v_txt
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relname = ANY (v_nombres);
    IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'sim-004a: nombre ocupado: %', v_txt; END IF;
    SELECT string_agg(p.oid::regprocedure::text, ', ' ORDER BY 1) INTO v_txt FROM pg_proc p WHERE p.proname = ANY (v_nom_fun);
    IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'sim-004a: nombre de funcion ocupado: %', v_txt; END IF;
    SELECT string_agg(n.nspname || '.' || t.typname, ', ' ORDER BY 1) INTO v_txt
      FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE t.typname = ANY (v_tablas);
    IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'sim-004a: nombre de tipo ocupado: %', v_txt; END IF;

    -- las politicas vigentes de sim_trades, session_drawings y session_chart_config: exactamente la de
    -- s04 en cada una (o.16.7, o.16.9); si no, no se toca nada
    PERFORM set_config('search_path', '', true);
    FOR v_n IN 1 .. array_length(v_pol_tablas, 1) LOOP
      f := v_pol_tablas[v_n][1];
      v_esperado := v_pol_tablas[v_n][2] || '|PERMISSIVE|ALL|{public}|(auth.uid() = user_id)|-';
      SELECT string_agg(p.policyname || '|' || p.permissive || '|' || p.cmd || '|' || p.roles::text || '|' || coalesce(p.qual, '-') || '|' || coalesce(p.with_check, '-'),
                        ' ;; ' ORDER BY p.policyname COLLATE "C") INTO v_txt
        FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = f;
      IF v_txt IS DISTINCT FROM v_esperado THEN
        RAISE EXCEPTION 'sim-004a: las politicas de public.% no son las de s04 (se esperaba solo «%»); hay: %', f, v_esperado, coalesce(v_txt, '(ninguna)');
      END IF;
    END LOOP;
    PERFORM set_config('search_path', v_sp, true);

    -- ── 2 · tablas ───────────────────────────────────────────────────────
    -- el orden de las columnas es el del texto canonico (o.0, S4R6-01)
    CREATE TABLE public.sim_escrituras_v0 (
      id         bigint      GENERATED ALWAYS AS IDENTITY (SEQUENCE NAME public.sim_escrituras_v0_id_seq),
      session_id uuid,
      user_id    uuid,
      tabla      text        NOT NULL,
      operacion  text        NOT NULL,
      xact       text        NOT NULL,
      cliente    text        NOT NULL,
      rol_jwt    text,
      rol_guc    text,
      columnas   text[]      NOT NULL,
      delta      numeric,
      trade_id   uuid,
      pnl        numeric,
      en         timestamptz NOT NULL,
      CONSTRAINT sim_escrituras_v0_pkey PRIMARY KEY (id),
      CONSTRAINT sim_escrituras_v0_tabla_check CHECK (tabla IN ('sim_sessions', 'sim_trades')),
      CONSTRAINT sim_escrituras_v0_operacion_check CHECK (operacion IN ('INSERT', 'UPDATE', 'DELETE')));
    CREATE INDEX sim_escrituras_v0_sesion_xact_idx ON public.sim_escrituras_v0 (session_id, xact);

    CREATE TABLE public.sim_escrituras_v0_marcas (
      id           bigint GENERATED ALWAYS AS IDENTITY (SEQUENCE NAME public.sim_escrituras_v0_marcas_id_seq),
      escritura_id bigint NOT NULL,
      xact         text   NOT NULL,
      CONSTRAINT sim_escrituras_v0_marcas_pkey PRIMARY KEY (id));
    CREATE INDEX sim_escrituras_v0_marcas_escritura_idx ON public.sim_escrituras_v0_marcas (escritura_id);

    CREATE TABLE public.sim_servicio (
      id             boolean     NOT NULL DEFAULT true,
      mantenimiento  boolean     NOT NULL,
      version_minima text        NOT NULL,
      cambiado_en    timestamptz NOT NULL,
      CONSTRAINT sim_servicio_pkey PRIMARY KEY (id),
      CONSTRAINT sim_servicio_una_fila CHECK (id),
      CONSTRAINT sim_servicio_version_minima_check CHECK (version_minima ~ '^[1-9][0-9]{0,8}$'));
    INSERT INTO public.sim_servicio (id, mantenimiento, version_minima, cambiado_en) VALUES (true, false, '1', now());

    -- la columna del contador (E1R2-01): un DEFAULT constante no reescribe la tabla (PostgreSQL ≥ 11);
    -- sin grants de columna
    ALTER TABLE public.sim_sessions ADD COLUMN rev_saldo bigint NOT NULL DEFAULT 0;

    -- ── 3 · funciones ────────────────────────────────────────────────────
    EXECUTE format('CREATE FUNCTION public.sim_cierre_v0(p_session_id uuid, p_balance numeric, p_last_timestamp bigint, p_trade jsonb) '
                   'RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = '''' AS %L', v_cierre);
    EXECUTE format('CREATE FUNCTION public.sim_escrituras_v0_registra() '
                   'RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '''' AS %L', v_registra);
    EXECUTE format('CREATE FUNCTION public.sim_escrituras_v0_marca_balance() '
                   'RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '''' AS %L', v_marca);
    EXECUTE format('CREATE FUNCTION public.sim_escrituras_v0_inmutable() '
                   'RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = '''' AS %L', v_inmutable);
    EXECUTE format('CREATE FUNCTION public.sim_escrituras_v0_solo_disparador() '
                   'RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = '''' AS %L', v_solo);
    EXECUTE format('CREATE FUNCTION public.sim_escrituras_v0_parejas(p_session_id uuid) '
                   'RETURNS TABLE (orden integer, escritura_update bigint, escritura_insert bigint) '
                   'LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '''' AS %L', v_parejas);
    EXECUTE format('CREATE FUNCTION public.sim_escrituras_v0_canonico(p_session_id uuid) '
                   'RETURNS TABLE (texto text, sha256 text) '
                   'LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '''' AS %L', v_canonico);
    EXECUTE format('CREATE FUNCTION public.sim_sessions_rev_saldo() '
                   'RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = '''' AS %L', v_rev);
    EXECUTE format('CREATE FUNCTION public.sim_sessions_padre_propio() '
                   'RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '''' AS %L', v_padre);
    EXECUTE format('CREATE FUNCTION public.sim_trades_rev_saldo() '
                   'RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '''' AS %L', v_rev_trades);

    -- ── 4 · permisos: las revocaciones, antes de cualquier actividad (m.4) ─
    ALTER TABLE public.sim_escrituras_v0        ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.sim_escrituras_v0_marcas ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.sim_servicio             ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.sim_escrituras_v0, public.sim_escrituras_v0_marcas, public.sim_servicio
      FROM PUBLIC, anon, authenticated, service_role;
    REVOKE ALL ON SEQUENCE public.sim_escrituras_v0_id_seq, public.sim_escrituras_v0_marcas_id_seq
      FROM PUBLIC, anon, authenticated, service_role;
    GRANT SELECT ON public.sim_servicio TO authenticated, service_role;
    CREATE POLICY sim_servicio_lectura ON public.sim_servicio FOR SELECT TO authenticated USING (true);
    -- o.16.7 y o.16.9: un alumno solo escribe trades, dibujos y config del grafico en SUS sesiones (se suman
    -- con AND a la politica de hoy de cada tabla, que no se toca)
    FOR v_n IN 1 .. array_length(v_pol_tablas, 1) LOOP
      f := v_pol_tablas[v_n][1];
      v_cond := format('EXISTS (SELECT 1 FROM public.sim_sessions s WHERE s.id = %I.session_id AND s.user_id = (SELECT auth.uid()))', f);
      EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (%s)', f || '_sesion_propia_insert', f, v_cond);
      EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)', f || '_sesion_propia_update', f, v_cond, v_cond);
    END LOOP;
    FOR v_n IN 1 .. array_length(v_funciones, 1) LOOP
      EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated, service_role', v_funciones[v_n][1]);
    END LOOP;
    GRANT EXECUTE ON FUNCTION public.sim_cierre_v0(uuid, numeric, bigint, jsonb) TO authenticated;

    -- ── 5 · disparadores (A antes que B por el nombre, m.5.5) ────────────
    CREATE TRIGGER sim_escrituras_v0_inmutable_fila BEFORE UPDATE OR DELETE ON public.sim_escrituras_v0
      FOR EACH ROW EXECUTE FUNCTION public.sim_escrituras_v0_inmutable();
    CREATE TRIGGER sim_escrituras_v0_inmutable_truncate BEFORE TRUNCATE ON public.sim_escrituras_v0
      FOR EACH STATEMENT EXECUTE FUNCTION public.sim_escrituras_v0_inmutable();
    CREATE TRIGGER sim_escrituras_v0_solo_disparador BEFORE INSERT ON public.sim_escrituras_v0
      FOR EACH ROW EXECUTE FUNCTION public.sim_escrituras_v0_solo_disparador();
    CREATE TRIGGER sim_escrituras_v0_inmutable_fila BEFORE UPDATE OR DELETE ON public.sim_escrituras_v0_marcas
      FOR EACH ROW EXECUTE FUNCTION public.sim_escrituras_v0_inmutable();
    CREATE TRIGGER sim_escrituras_v0_inmutable_truncate BEFORE TRUNCATE ON public.sim_escrituras_v0_marcas
      FOR EACH STATEMENT EXECUTE FUNCTION public.sim_escrituras_v0_inmutable();
    CREATE TRIGGER sim_escrituras_v0_solo_disparador BEFORE INSERT ON public.sim_escrituras_v0_marcas
      FOR EACH ROW EXECUTE FUNCTION public.sim_escrituras_v0_solo_disparador();
    CREATE TRIGGER sim_escrituras_v0_a AFTER INSERT OR UPDATE OR DELETE ON public.sim_sessions
      FOR EACH ROW EXECUTE FUNCTION public.sim_escrituras_v0_registra();
    CREATE TRIGGER sim_escrituras_v0_b_balance AFTER UPDATE OF balance ON public.sim_sessions
      FOR EACH ROW EXECUTE FUNCTION public.sim_escrituras_v0_marca_balance();
    CREATE TRIGGER sim_escrituras_v0_a AFTER INSERT OR UPDATE OR DELETE ON public.sim_trades
      FOR EACH ROW EXECUTE FUNCTION public.sim_escrituras_v0_registra();
    -- el contador (E1R2-01): BEFORE, y por el nombre DESPUES de la puerta (los BEFORE van por orden de nombre)
    CREATE TRIGGER sim_sessions_rev_saldo BEFORE INSERT OR UPDATE ON public.sim_sessions
      FOR EACH ROW EXECUTE FUNCTION public.sim_sessions_rev_saldo();
    -- (o.16.9) el padre de una sesion, del mismo usuario
    CREATE TRIGGER sim_sessions_padre_propio BEFORE INSERT OR UPDATE ON public.sim_sessions
      FOR EACH ROW EXECUTE FUNCTION public.sim_sessions_padre_propio();
    -- toda escritura de sim_trades sube el de su sesion (AFTER: la fila ya paso la puerta, el cupo y las FK)
    CREATE TRIGGER sim_trades_rev_saldo AFTER INSERT OR UPDATE OR DELETE ON public.sim_trades
      FOR EACH ROW EXECUTE FUNCTION public.sim_trades_rev_saldo();
    v_estado := 1;
  END IF;

  -- ── 6 · comprobaciones (tambien en la segunda ejecucion) ────────────────
  v_sp := current_setting('search_path');
  PERFORM set_config('search_path', '', true);

  -- 6.1 los disparadores: el catalogo EXACTO del estado (o.0, S4R6-02)
  SELECT coalesce(string_agg(x, E'\n' ORDER BY x COLLATE "C"), '') INTO v_actual FROM (
    SELECT c.oid::regclass::text || '|' ||
           CASE WHEN t.tgisinternal THEN 'fk:' || k.conname || '|' || t.tgfoid::regprocedure::text
                ELSE t.tgname || '|' || pg_get_triggerdef(t.oid) END
           || '|' || t.tgtype || '|' || t.tgenabled::text AS x
      FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid LEFT JOIN pg_constraint k ON k.oid = t.tgconstraint
     WHERE c.oid IN ('public.sim_sessions'::regclass, 'public.sim_trades'::regclass,
                     'public.sim_escrituras_v0'::regclass, 'public.sim_escrituras_v0_marcas'::regclass)) s;
  SELECT string_agg(x, E'\n' ORDER BY x COLLATE "C") INTO v_esperado
    FROM regexp_split_to_table(concat_ws(E'\n', v_hoy, v_registro, CASE WHEN v_estado = 2 THEN v_lapuerta END), E'\n') x;
  IF v_actual IS DISTINCT FROM v_esperado THEN
    RAISE EXCEPTION 'sim-004a: los disparadores no son los del estado % (o.0). De mas: [%] · De menos: [%]', v_estado,
      (SELECT string_agg(x, ' ; ') FROM (SELECT regexp_split_to_table(v_actual, E'\n') x EXCEPT ALL SELECT regexp_split_to_table(v_esperado, E'\n')) d),
      (SELECT string_agg(x, ' ; ') FROM (SELECT regexp_split_to_table(v_esperado, E'\n') x EXCEPT ALL SELECT regexp_split_to_table(v_actual, E'\n')) d);
  END IF;

  -- 6.2 las funciones: cuerpo literal, definer, volatilidad, search_path, retorno
  FOR v_n IN 1 .. array_length(v_funciones, 1) LOOP
    f := v_funciones[v_n][1];
    IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_language l ON l.oid = p.prolang
                    WHERE p.oid = to_regprocedure('public.' || f) AND l.lanname = 'plpgsql'
                      AND p.prosrc = CASE v_funciones[v_n][2] WHEN 'cierre' THEN v_cierre WHEN 'registra' THEN v_registra
                                       WHEN 'marca' THEN v_marca WHEN 'inmutable' THEN v_inmutable WHEN 'solo' THEN v_solo
                                       WHEN 'parejas' THEN v_parejas WHEN 'canonico' THEN v_canonico WHEN 'rev' THEN v_rev WHEN 'rev_trades' THEN v_rev_trades WHEN 'padre' THEN v_padre END
                      AND p.prosecdef = (v_funciones[v_n][3] = 't') AND p.provolatile::text = v_funciones[v_n][4]
                      AND p.prorettype::regtype::text = v_funciones[v_n][5]
                      AND p.proconfig = ARRAY['search_path=""']) THEN
      RAISE EXCEPTION 'sim-004a: la funcion public.% falta o no es la de este fichero (cuerpo, definer, volatilidad, search_path o retorno)', f;
    END IF;
    -- EXECUTE: solo el dueño, y authenticated en el cierre; nadie mas, ni PUBLIC
    FOREACH rol IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
      IF has_function_privilege(rol, to_regprocedure('public.' || f), 'EXECUTE') <> (rol = v_funciones[v_n][6]) THEN
        RAISE EXCEPTION 'sim-004a: EXECUTE de % sobre public.% no es el previsto', rol, f;
      END IF;
    END LOOP;
    SELECT string_agg(CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE a.grantee::regrole::text END, ', ') INTO v_txt
      FROM pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
     WHERE p.oid = to_regprocedure('public.' || f) AND a.grantee <> p.proowner
       AND (a.grantee = 0 OR a.grantee::regrole::text IS DISTINCT FROM nullif(v_funciones[v_n][6], ''));
    IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'sim-004a: receptores de mas en public.%: %', f, v_txt; END IF;
  END LOOP;
  -- la puerta, si esta: la de sql/sim-004a-puerta.sql
  IF v_estado = 2 AND NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid = to_regprocedure('public.sim_escrituras_v0_puerta()')
                                    AND encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') = v_puerta_sha) THEN
    RAISE EXCEPTION 'sim-004a: la puerta activa no es la de sql/sim-004a-puerta.sql (sha256 del cuerpo distinto)';
  END IF;

  -- 6.3 las tablas: columnas exactas (o.0, S4R6-01), restricciones, indices
  FOR f, v_esperado IN SELECT * FROM (VALUES
      ('sim_escrituras_v0', '1:id:bigint:t:a|2:session_id:uuid:f:|3:user_id:uuid:f:|4:tabla:text:t:|5:operacion:text:t:|6:xact:text:t:|7:cliente:text:t:|8:rol_jwt:text:f:|9:rol_guc:text:f:|10:columnas:text[]:t:|11:delta:numeric:f:|12:trade_id:uuid:f:|13:pnl:numeric:f:|14:en:timestamp with time zone:t:'),
      ('sim_escrituras_v0_marcas', '1:id:bigint:t:a|2:escritura_id:bigint:t:|3:xact:text:t:'),
      ('sim_servicio', '1:id:boolean:t:|2:mantenimiento:boolean:t:|3:version_minima:text:t:|4:cambiado_en:timestamp with time zone:t:')) c(t, cols)
  LOOP
    SELECT string_agg(a.attnum || ':' || a.attname || ':' || format_type(a.atttypid, a.atttypmod) || ':' || a.attnotnull::text::char(1)
                      || ':' || a.attidentity::text, '|' ORDER BY a.attnum) INTO v_actual
      FROM pg_attribute a WHERE a.attrelid = ('public.' || f)::regclass AND a.attnum > 0 AND NOT a.attisdropped;
    IF v_actual IS DISTINCT FROM v_esperado THEN
      RAISE EXCEPTION 'sim-004a: las columnas de public.% no son las previstas: %', f, v_actual;
    END IF;
  END LOOP;
  -- la columna del contador en sim_sessions (E1R2-01): tipo, NOT NULL, DEFAULT 0, sin identidad ni generada
  -- (sus ACL de columna, en 6.4 con las demas)
  SELECT format_type(a.atttypid, a.atttypmod) || ':' || a.attnotnull::text || ':' || coalesce(pg_get_expr(d.adbin, d.adrelid), '-')
         || ':' || a.attidentity::text || ':' || a.attgenerated::text INTO v_txt
    FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
   WHERE a.attrelid = 'public.sim_sessions'::regclass AND a.attname = 'rev_saldo' AND NOT a.attisdropped;
  IF v_txt IS DISTINCT FROM 'bigint:true:0::' THEN
    RAISE EXCEPTION 'sim-004a: la columna public.sim_sessions.rev_saldo no es la prevista (bigint NOT NULL DEFAULT 0): %', coalesce(v_txt, '(no existe)');
  END IF;
  FOR f, v_txt, v_esperado IN SELECT * FROM (VALUES
      ('sim_escrituras_v0', 'sim_escrituras_v0_pkey', 'PRIMARY KEY (id)'),
      ('sim_escrituras_v0', 'sim_escrituras_v0_tabla_check', 'CHECK ((tabla = ANY (ARRAY[''sim_sessions''::text, ''sim_trades''::text])))'),
      ('sim_escrituras_v0', 'sim_escrituras_v0_operacion_check', 'CHECK ((operacion = ANY (ARRAY[''INSERT''::text, ''UPDATE''::text, ''DELETE''::text])))'),
      ('sim_escrituras_v0_marcas', 'sim_escrituras_v0_marcas_pkey', 'PRIMARY KEY (id)'),
      ('sim_servicio', 'sim_servicio_pkey', 'PRIMARY KEY (id)'),
      ('sim_servicio', 'sim_servicio_una_fila', 'CHECK (id)'),
      ('sim_servicio', 'sim_servicio_version_minima_check', 'CHECK ((version_minima ~ ''^[1-9][0-9]{0,8}$''::text))')) c(t, nombre, def)
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint k WHERE k.conrelid = ('public.' || f)::regclass AND k.conname = v_txt
                    AND k.convalidated AND pg_get_constraintdef(k.oid) = v_esperado) THEN
      RAISE EXCEPTION 'sim-004a: la restriccion %.% falta o no es la prevista (%)', f, v_txt, v_esperado;
    END IF;
  END LOOP;
  SELECT count(*) INTO v_n FROM pg_constraint k
   WHERE k.conrelid IN ('public.sim_escrituras_v0'::regclass, 'public.sim_escrituras_v0_marcas'::regclass, 'public.sim_servicio'::regclass);
  IF v_n <> 7 THEN RAISE EXCEPTION 'sim-004a: % restricciones en las tablas nuevas; se esperaban 7 (ninguna FK)', v_n; END IF;
  SELECT string_agg(d, ' ; ' ORDER BY d COLLATE "C") INTO v_actual
    FROM (SELECT pg_get_indexdef(i.indexrelid) d FROM pg_index i
           WHERE i.indrelid IN ('public.sim_escrituras_v0'::regclass, 'public.sim_escrituras_v0_marcas'::regclass,
                                'public.sim_servicio'::regclass)) x;
  SELECT string_agg(d, ' ; ' ORDER BY d COLLATE "C") INTO v_esperado FROM unnest(ARRAY[
       'CREATE INDEX sim_escrituras_v0_marcas_escritura_idx ON public.sim_escrituras_v0_marcas USING btree (escritura_id)',
       'CREATE INDEX sim_escrituras_v0_sesion_xact_idx ON public.sim_escrituras_v0 USING btree (session_id, xact)',
       'CREATE UNIQUE INDEX sim_escrituras_v0_marcas_pkey ON public.sim_escrituras_v0_marcas USING btree (id)',
       'CREATE UNIQUE INDEX sim_escrituras_v0_pkey ON public.sim_escrituras_v0 USING btree (id)',
       'CREATE UNIQUE INDEX sim_servicio_pkey ON public.sim_servicio USING btree (id)']) d;
  IF v_actual IS DISTINCT FROM v_esperado THEN
    RAISE EXCEPTION 'sim-004a: los indices de las tablas nuevas no son los previstos: %', v_actual;
  END IF;

  -- 6.4 RLS, politicas y la matriz efectiva de privilegios (l.4, n.7)
  FOREACH f IN ARRAY v_tablas LOOP
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = ('public.' || f)::regclass) THEN
      RAISE EXCEPTION 'sim-004a: RLS apagada en public.%', f;
    END IF;
    FOREACH rol IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
      IF has_table_privilege(rol, 'public.' || f, 'INSERT') OR has_table_privilege(rol, 'public.' || f, 'UPDATE')
         OR has_table_privilege(rol, 'public.' || f, 'DELETE') OR has_table_privilege(rol, 'public.' || f, 'TRUNCATE')
         OR has_table_privilege(rol, 'public.' || f, 'REFERENCES') OR has_table_privilege(rol, 'public.' || f, 'TRIGGER') THEN
        RAISE EXCEPTION 'sim-004a: % puede escribir en public.%', rol, f;
      END IF;
      IF has_table_privilege(rol, 'public.' || f, 'SELECT') <> (rol IN ('authenticated', 'service_role') AND f = 'sim_servicio') THEN
        RAISE EXCEPTION 'sim-004a: SELECT de % sobre public.% no es el previsto', rol, f;
      END IF;
    END LOOP;
    SELECT string_agg(CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE a.grantee::regrole::text END || '=' || a.privilege_type, ', ') INTO v_txt
      FROM pg_class c, aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
     WHERE c.oid = ('public.' || f)::regclass AND a.grantee <> c.relowner
       AND NOT (f = 'sim_servicio' AND a.grantee IN ('authenticated'::regrole, 'service_role'::regrole) AND a.privilege_type = 'SELECT');
    IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'sim-004a: receptores de mas en public.%: %', f, v_txt; END IF;
  END LOOP;
  -- y por COLUMNA (ronda 2, CTO 13-oct, Astra E1-05): has_table_privilege y relacl no ven
  -- los grants de columna (pg_attribute.attacl). Ninguna ACL de columna en las tablas nuevas
  -- ni en sim_sessions/sim_trades, y los privilegios EFECTIVOS de cada columna (con
  -- herencia) para PUBLIC y los tres roles: solo SELECT de sim_servicio para authenticated
  -- y service_role
  SELECT string_agg(a.attrelid::regclass::text || '.' || a.attname || ' ' || a.attacl::text, ', '
                    ORDER BY a.attrelid::regclass::text COLLATE "C", a.attnum) INTO v_txt
    FROM pg_attribute a
   WHERE a.attrelid IN ('public.sim_escrituras_v0'::regclass, 'public.sim_escrituras_v0_marcas'::regclass, 'public.sim_servicio'::regclass,
                        'public.sim_sessions'::regclass, 'public.sim_trades'::regclass)
     AND a.attnum > 0 AND coalesce(cardinality(a.attacl), 0) > 0;
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'sim-004a: ACL de columna no prevista: %', v_txt; END IF;
  SELECT string_agg(x.r || ':' || x.c || ':' || x.p, ', ' ORDER BY x.r COLLATE "C", x.c COLLATE "C", x.p COLLATE "C") INTO v_txt
    FROM (SELECT r, a.attrelid::regclass::text || '.' || a.attname c, p
            FROM unnest(ARRAY['public', 'anon', 'authenticated', 'service_role']) r,
                 pg_attribute a, unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'REFERENCES']) p
           WHERE a.attrelid IN ('public.sim_escrituras_v0'::regclass, 'public.sim_escrituras_v0_marcas'::regclass, 'public.sim_servicio'::regclass)
             AND a.attnum > 0 AND NOT a.attisdropped
             AND has_column_privilege(r, a.attrelid, a.attnum, p)
                 <> (p = 'SELECT' AND r IN ('authenticated', 'service_role') AND a.attrelid = 'public.sim_servicio'::regclass)) x;
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'sim-004a: privilegios de columna no previstos: %', v_txt; END IF;
  FOREACH f IN ARRAY v_secuencias LOOP
    SELECT string_agg(CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE a.grantee::regrole::text END || '=' || a.privilege_type, ', ') INTO v_txt
      FROM pg_class c, aclexplode(coalesce(c.relacl, acldefault('s', c.relowner))) a
     WHERE c.oid = ('public.' || f)::regclass AND a.grantee <> c.relowner;
    IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'sim-004a: receptores de mas en la secuencia public.%: %', f, v_txt; END IF;
  END LOOP;
  SELECT count(*) INTO v_n FROM pg_policies WHERE schemaname = 'public' AND tablename = ANY (v_tablas);
  IF v_n <> 1 OR NOT EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = 'sim_servicio'
                               AND p.policyname = 'sim_servicio_lectura' AND p.permissive = 'PERMISSIVE' AND p.cmd = 'SELECT'
                               AND p.roles = ARRAY['authenticated']::name[] AND p.qual = 'true' AND p.with_check IS NULL) THEN
    RAISE EXCEPTION 'sim-004a: politicas de las tablas nuevas: se esperaba solo sim_servicio_lectura (SELECT · authenticated · true); hay %', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM public.sim_servicio;
  IF v_n <> 1 THEN RAISE EXCEPTION 'sim-004a: sim_servicio tiene % filas; tiene que tener 1', v_n; END IF;
  -- las politicas de sim_trades, session_drawings y session_chart_config (o.16.7, o.16.9): en cada una,
  -- exactamente la de s04 y las dos RESTRICTIVE, con su texto
  FOR v_n IN 1 .. array_length(v_pol_tablas, 1) LOOP
    f := v_pol_tablas[v_n][1];
    v_cond := replace(v_pol_cond, 'TABLA', f);
    SELECT string_agg(p.policyname || '|' || p.permissive || '|' || p.cmd || '|' || p.roles::text || '|' || coalesce(p.qual, '-') || '|' || coalesce(p.with_check, '-'),
                      ' ;; ' ORDER BY p.policyname COLLATE "C") INTO v_pol_trades
      FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = f;
    SELECT string_agg(x, ' ;; ' ORDER BY x COLLATE "C") INTO v_esperado FROM unnest(ARRAY[
      v_pol_tablas[v_n][2] || '|PERMISSIVE|ALL|{public}|(auth.uid() = user_id)|-',
      f || '_sesion_propia_insert|RESTRICTIVE|INSERT|{authenticated}|-|' || v_cond,
      f || '_sesion_propia_update|RESTRICTIVE|UPDATE|{authenticated}|' || v_cond || '|' || v_cond]) x;
    IF v_pol_trades IS DISTINCT FROM v_esperado THEN
      RAISE EXCEPTION 'sim-004a: las politicas de public.% no son las previstas: %', f, coalesce(v_pol_trades, '(ninguna)');
    END IF;
  END LOOP;

  PERFORM set_config('search_path', v_sp, true);
END
$sim_004a$;


-- ============================================================================
-- INFORME (solo lectura). Lo que el bloque ha dejado, para pegarlo tal cual.
-- Catalogo y la fila de sim_servicio: ni una fila de alumnos.
-- ============================================================================
select seccion, detalle from (
  select 1 o, 'estado' seccion,
         case when exists (select 1 from pg_trigger where tgname = 'sim_escrituras_v0_puerta')
              then 'registro + puerta' else 'registro instalado' end detalle
  union all
  select 2, 'tabla', c.relname || ' · rls=' || c.relrowsecurity
         || ' · politicas=' || (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname)
         || ' · acl de columna=' || (select count(*) from pg_attribute a where a.attrelid = c.oid and a.attnum > 0 and coalesce(cardinality(a.attacl), 0) > 0)
         || ' · select authenticated=' || has_table_privilege('authenticated', c.oid, 'SELECT')
         || ' service_role=' || has_table_privilege('service_role', c.oid, 'SELECT')
         || ' · escritura anon/authenticated/service_role=' || (has_table_privilege('anon', c.oid, 'INSERT,UPDATE,DELETE,TRUNCATE')
                                 or has_table_privilege('authenticated', c.oid, 'INSERT,UPDATE,DELETE,TRUNCATE')
                                 or has_table_privilege('service_role', c.oid, 'INSERT,UPDATE,DELETE,TRUNCATE'))
    from pg_class c where c.oid in (to_regclass('public.sim_escrituras_v0'), to_regclass('public.sim_escrituras_v0_marcas'), to_regclass('public.sim_servicio'))
  union all
  select 3, 'funcion', p.oid::regprocedure::text || ' · definer=' || p.prosecdef || ' · ' || array_to_string(p.proconfig, ',')
         || ' · execute anon=' || has_function_privilege('anon', p.oid, 'EXECUTE')
         || ' authenticated=' || has_function_privilege('authenticated', p.oid, 'EXECUTE')
         || ' service_role=' || has_function_privilege('service_role', p.oid, 'EXECUTE')
         || ' · sha256 ' || left(encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex'), 16)
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and (p.proname like 'sim\_escrituras\_v0\_%' or p.proname in ('sim_cierre_v0', 'sim_sessions_rev_saldo', 'sim_trades_rev_saldo', 'sim_sessions_padre_propio'))
  union all
  select 3, 'columna', 'sim_sessions.rev_saldo ' || format_type(a.atttypid, a.atttypmod) || ' · not null=' || a.attnotnull
         || ' · default ' || coalesce(pg_get_expr(d.adbin, d.adrelid), '-') || ' · acl de columna=' || coalesce(cardinality(a.attacl), 0)
    from pg_attribute a left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
   where a.attrelid = 'public.sim_sessions'::regclass and a.attname = 'rev_saldo' and not a.attisdropped
  union all
  select 4, 'disparador', t.tgrelid::regclass::text || ' · ' || t.tgname || ' · enabled=' || t.tgenabled::text
    from pg_trigger t
   where not t.tgisinternal and t.tgrelid in ('public.sim_sessions'::regclass, 'public.sim_trades'::regclass,
                                              to_regclass('public.sim_escrituras_v0'), to_regclass('public.sim_escrituras_v0_marcas'))
  union all
  select 5, 'disparadores internos (FK)', t.tgrelid::regclass::text || ' · ' || count(*)
    from pg_trigger t where t.tgisinternal and t.tgrelid in ('public.sim_sessions'::regclass, 'public.sim_trades'::regclass)
   group by t.tgrelid
  union all
  select 5, 'politica ' || p.tablename, p.policyname || ' · ' || p.permissive || ' · ' || p.cmd || ' · ' || p.roles::text
    from pg_policies p where p.schemaname = 'public' and p.tablename in ('sim_trades', 'session_drawings', 'session_chart_config')
  union all
  select 6, 'sim_servicio', 'mantenimiento=' || s.mantenimiento || ' · version_minima=' || s.version_minima from public.sim_servicio s
  union all
  select 7, 'FIN', 'sim-004a-preparatoria aplicada'
) x order by o, detalle;
