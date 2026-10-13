-- ============================================================================
-- sim-004a-puerta — activa la puerta: las escrituras de alumno sin la cabecera
-- x-sim-cliente (clientes anteriores a la etapa 1) se rechazan
--
-- POR QUE EXISTE. Diseño revisiones/2026-10-12-diseno-sim-004-y-motor-v1.md,
-- l.1 b, m.3, m.4 y o.0 (S4R6-02). Con la puerta activa, un cliente antiguo no
-- puede escribir NINGUNA de las dos mitades de un cierre: no se pueden crear
-- cierres partidos nuevos.
--
-- CUANDO: lo primero de (a) 72 h seguidas sin escrituras «sin firma de alumno»
-- (s10) o (b) 7 dias desde que se instalo el registro (m.3). Con el sí del CTO.
--
-- QUE HACE, en UNA transaccion (m.3: la creacion de los disparadores espera a
-- las escrituras en vuelo, que asi se confirman o abortan antes; es la
-- barrera de drenaje):
--   public.sim_escrituras_v0_puerta()   SECURITY INVOKER, search_path vacio,
--       EXECUTE de nadie (un disparador no lo necesita). Rechaza con
--       «sim_escrituras_v0_puerta: …» si el rol del JWT es authenticated o
--       anon y no hay x-sim-cliente (ausente o vacia: lo mismo, l.4). No mira
--       la version. service_role y el dueño pasan.
--   sim_escrituras_v0_puerta  BEFORE INSERT OR UPDATE OR DELETE … FOR EACH ROW
--       en sim_sessions y en sim_trades.
--
-- ESTADOS (o.0): necesita el estado 1 (registro instalado, catalogo EXACTO) y
-- deja el estado 2 (registro + puerta). En el estado 2 comprueba y no toca
-- nada: reejecutarlo no la reabre ni la duplica. Cualquier otro catalogo →
-- «sim-004a-puerta: …» y no queda nada.
--
-- LA HORA DE ACTIVACION (m.3) es la del COMMIT. El editor la da al devolver el
-- resultado, que llega DESPUES del COMMIT: esa hora se apunta en
-- sql/APLICADOS.md y es cota superior. La segunda s10 se lanza cuando han
-- pasado 2 × statement_timeout desde ella (l.1 c, paso 3).
--
-- ── COMO SE EJECUTA ────────────────────────────────────────────────────────
--   Entero, de una vez, en el editor SQL de Supabase: un DO y una SELECT de
--   informe que acaba en «FIN | sim-004a-puerta aplicada».
-- Despues, sql/sim-004a-preparatoria.sql se puede volver a ejecutar: reconoce
-- el estado 2 y lo comprueba entero, cuerpo de la puerta incluido.
-- ============================================================================

DO $sim_004a_puerta$
DECLARE
  rol        text;
  v_n        integer;
  v_txt      text;
  v_sp       text;
  v_estado   integer;
  v_esperado text;
  v_actual   text;

  v_puerta text := $c$
DECLARE
  v_h json := nullif(current_setting('request.headers', true), '')::json;
  v_c json := nullif(current_setting('request.jwt.claims', true), '')::json;
BEGIN
  IF nullif(v_c ->> 'role', '') IN ('authenticated', 'anon') AND nullif(v_h ->> 'x-sim-cliente', '') IS NULL THEN
    RAISE EXCEPTION 'sim_escrituras_v0_puerta: escritura sin x-sim-cliente rechazada (cliente anterior a la etapa 1: recarga la pagina)';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END
$c$;

  -- las mismas listas que sql/sim-004a-preparatoria.sql (o.0, S4R6-02)
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
  v_registro text := concat_ws(E'\n',
    'public.sim_escrituras_v0_marcas|sim_escrituras_v0_inmutable_fila|CREATE TRIGGER sim_escrituras_v0_inmutable_fila BEFORE DELETE OR UPDATE ON public.sim_escrituras_v0_marcas FOR EACH ROW EXECUTE FUNCTION public.sim_escrituras_v0_inmutable()|27|O',
    'public.sim_escrituras_v0_marcas|sim_escrituras_v0_inmutable_truncate|CREATE TRIGGER sim_escrituras_v0_inmutable_truncate BEFORE TRUNCATE ON public.sim_escrituras_v0_marcas FOR EACH STATEMENT EXECUTE FUNCTION public.sim_escrituras_v0_inmutable()|34|O',
    'public.sim_escrituras_v0_marcas|sim_escrituras_v0_solo_disparador|CREATE TRIGGER sim_escrituras_v0_solo_disparador BEFORE INSERT ON public.sim_escrituras_v0_marcas FOR EACH ROW EXECUTE FUNCTION public.sim_escrituras_v0_solo_disparador()|7|O',
    'public.sim_escrituras_v0|sim_escrituras_v0_inmutable_fila|CREATE TRIGGER sim_escrituras_v0_inmutable_fila BEFORE DELETE OR UPDATE ON public.sim_escrituras_v0 FOR EACH ROW EXECUTE FUNCTION public.sim_escrituras_v0_inmutable()|27|O',
    'public.sim_escrituras_v0|sim_escrituras_v0_inmutable_truncate|CREATE TRIGGER sim_escrituras_v0_inmutable_truncate BEFORE TRUNCATE ON public.sim_escrituras_v0 FOR EACH STATEMENT EXECUTE FUNCTION public.sim_escrituras_v0_inmutable()|34|O',
    'public.sim_escrituras_v0|sim_escrituras_v0_solo_disparador|CREATE TRIGGER sim_escrituras_v0_solo_disparador BEFORE INSERT ON public.sim_escrituras_v0 FOR EACH ROW EXECUTE FUNCTION public.sim_escrituras_v0_solo_disparador()|7|O',
    'public.sim_sessions|sim_escrituras_v0_a|CREATE TRIGGER sim_escrituras_v0_a AFTER INSERT OR DELETE OR UPDATE ON public.sim_sessions FOR EACH ROW EXECUTE FUNCTION public.sim_escrituras_v0_registra()|29|O',
    'public.sim_sessions|sim_escrituras_v0_b_balance|CREATE TRIGGER sim_escrituras_v0_b_balance AFTER UPDATE OF balance ON public.sim_sessions FOR EACH ROW EXECUTE FUNCTION public.sim_escrituras_v0_marca_balance()|17|O',
    'public.sim_trades|sim_escrituras_v0_a|CREATE TRIGGER sim_escrituras_v0_a AFTER INSERT OR DELETE OR UPDATE ON public.sim_trades FOR EACH ROW EXECUTE FUNCTION public.sim_escrituras_v0_registra()|29|O');
  v_lapuerta text := concat_ws(E'\n',
    'public.sim_sessions|sim_escrituras_v0_puerta|CREATE TRIGGER sim_escrituras_v0_puerta BEFORE INSERT OR DELETE OR UPDATE ON public.sim_sessions FOR EACH ROW EXECUTE FUNCTION public.sim_escrituras_v0_puerta()|31|O',
    'public.sim_trades|sim_escrituras_v0_puerta|CREATE TRIGGER sim_escrituras_v0_puerta BEFORE INSERT OR DELETE OR UPDATE ON public.sim_trades FOR EACH ROW EXECUTE FUNCTION public.sim_escrituras_v0_puerta()|31|O');
BEGIN
  IF current_setting('server_version_num')::integer < 170000 THEN
    RAISE EXCEPTION 'sim-004a-puerta: hace falta PostgreSQL 17 o posterior (hay %)', current_setting('server_version');
  END IF;
  IF to_regclass('public.sim_escrituras_v0') IS NULL OR to_regclass('public.sim_escrituras_v0_marcas') IS NULL THEN
    RAISE EXCEPTION 'sim-004a-puerta: el registro no esta instalado (sql/sim-004a-preparatoria.sql va antes): no se toca nada';
  END IF;

  -- ¿estado 1 o 2? Por el catalogo EXACTO, no por un indicador
  v_sp := current_setting('search_path');
  PERFORM set_config('search_path', '', true);
  SELECT coalesce(string_agg(x, E'\n' ORDER BY x COLLATE "C"), '') INTO v_actual FROM (
    SELECT c.oid::regclass::text || '|' ||
           CASE WHEN t.tgisinternal THEN 'fk:' || k.conname || '|' || t.tgfoid::regprocedure::text
                ELSE t.tgname || '|' || pg_get_triggerdef(t.oid) END
           || '|' || t.tgtype || '|' || t.tgenabled::text AS x
      FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid LEFT JOIN pg_constraint k ON k.oid = t.tgconstraint
     WHERE c.oid IN ('public.sim_sessions'::regclass, 'public.sim_trades'::regclass,
                     'public.sim_escrituras_v0'::regclass, 'public.sim_escrituras_v0_marcas'::regclass)) s;
  -- (la variable de un FOR entero es local al bucle: el estado se copia fuera)
  FOR v_n IN 1 .. 2 LOOP
    SELECT string_agg(x, E'\n' ORDER BY x COLLATE "C") INTO v_esperado
      FROM regexp_split_to_table(concat_ws(E'\n', v_hoy, v_registro, CASE WHEN v_n = 2 THEN v_lapuerta END), E'\n') x;
    v_estado := v_n;
    EXIT WHEN v_actual = v_esperado;
  END LOOP;
  IF v_actual IS DISTINCT FROM v_esperado THEN
    RAISE EXCEPTION 'sim-004a-puerta: los disparadores no son ni los del estado 1 ni los del 2 (o.0). Frente al 2, de mas: [%] · de menos: [%]',
      (SELECT string_agg(x, ' ; ') FROM (SELECT regexp_split_to_table(v_actual, E'\n') x EXCEPT ALL SELECT regexp_split_to_table(v_esperado, E'\n')) d),
      (SELECT string_agg(x, ' ; ') FROM (SELECT regexp_split_to_table(v_esperado, E'\n') x EXCEPT ALL SELECT regexp_split_to_table(v_actual, E'\n')) d);
  END IF;
  PERFORM set_config('search_path', v_sp, true);

  IF v_estado = 1 THEN
    IF to_regprocedure('public.sim_escrituras_v0_puerta()') IS NOT NULL THEN
      RAISE EXCEPTION 'sim-004a-puerta: existe la funcion de la puerta sin sus disparadores (A MEDIAS): no se toca nada; revisar a mano';
    END IF;
    SELECT string_agg(p.oid::regprocedure::text, ', ') INTO v_txt FROM pg_proc p WHERE p.proname = 'sim_escrituras_v0_puerta';
    IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'sim-004a-puerta: nombre de funcion ocupado: %', v_txt; END IF;
    EXECUTE format('CREATE FUNCTION public.sim_escrituras_v0_puerta() '
                   'RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = '''' AS %L', v_puerta);
    REVOKE ALL ON FUNCTION public.sim_escrituras_v0_puerta() FROM PUBLIC, anon, authenticated, service_role;
    CREATE TRIGGER sim_escrituras_v0_puerta BEFORE INSERT OR UPDATE OR DELETE ON public.sim_sessions
      FOR EACH ROW EXECUTE FUNCTION public.sim_escrituras_v0_puerta();
    CREATE TRIGGER sim_escrituras_v0_puerta BEFORE INSERT OR UPDATE OR DELETE ON public.sim_trades
      FOR EACH ROW EXECUTE FUNCTION public.sim_escrituras_v0_puerta();
  END IF;

  -- ── comprobaciones (tambien en la segunda ejecucion): el estado 2 exacto ─
  PERFORM set_config('search_path', '', true);
  SELECT coalesce(string_agg(x, E'\n' ORDER BY x COLLATE "C"), '') INTO v_actual FROM (
    SELECT c.oid::regclass::text || '|' ||
           CASE WHEN t.tgisinternal THEN 'fk:' || k.conname || '|' || t.tgfoid::regprocedure::text
                ELSE t.tgname || '|' || pg_get_triggerdef(t.oid) END
           || '|' || t.tgtype || '|' || t.tgenabled::text AS x
      FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid LEFT JOIN pg_constraint k ON k.oid = t.tgconstraint
     WHERE c.oid IN ('public.sim_sessions'::regclass, 'public.sim_trades'::regclass,
                     'public.sim_escrituras_v0'::regclass, 'public.sim_escrituras_v0_marcas'::regclass)) s;
  SELECT string_agg(x, E'\n' ORDER BY x COLLATE "C") INTO v_esperado
    FROM regexp_split_to_table(concat_ws(E'\n', v_hoy, v_registro, v_lapuerta), E'\n') x;
  IF v_actual IS DISTINCT FROM v_esperado THEN
    RAISE EXCEPTION 'sim-004a-puerta: tras activar, los disparadores no son los del estado 2';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_language l ON l.oid = p.prolang
                  WHERE p.oid = to_regprocedure('public.sim_escrituras_v0_puerta()') AND l.lanname = 'plpgsql'
                    AND p.prosrc = v_puerta AND NOT p.prosecdef AND p.provolatile = 'v'
                    AND p.prorettype = 'trigger'::regtype AND p.proconfig = ARRAY['search_path=""']) THEN
    RAISE EXCEPTION 'sim-004a-puerta: la funcion de la puerta no es la de este fichero (cuerpo, invoker, search_path)';
  END IF;
  FOREACH rol IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF has_function_privilege(rol, 'public.sim_escrituras_v0_puerta()'::regprocedure, 'EXECUTE') THEN
      RAISE EXCEPTION 'sim-004a-puerta: % puede ejecutar la funcion de la puerta', rol;
    END IF;
  END LOOP;
  SELECT count(*) INTO v_n FROM pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
   WHERE p.oid = 'public.sim_escrituras_v0_puerta()'::regprocedure AND a.grantee <> p.proowner;
  IF v_n > 0 THEN RAISE EXCEPTION 'sim-004a-puerta: la funcion de la puerta tiene % receptores ademas del dueño', v_n; END IF;
  PERFORM set_config('search_path', v_sp, true);
END
$sim_004a_puerta$;


-- ============================================================================
-- INFORME (solo lectura): catalogo, sin datos de alumnos.
-- ============================================================================
select seccion, detalle from (
  select 1 o, 'estado' seccion,
         case when (select count(*) from pg_trigger where tgname = 'sim_escrituras_v0_puerta'
                     and tgrelid in ('public.sim_sessions'::regclass, 'public.sim_trades'::regclass)) = 2
              then 'registro + puerta' else 'SIN PUERTA' end detalle
  union all
  select 2, 'disparador', t.tgrelid::regclass::text || ' · ' || t.tgname || ' · enabled=' || t.tgenabled::text
    from pg_trigger t where t.tgname = 'sim_escrituras_v0_puerta'
  union all
  select 3, 'funcion', p.oid::regprocedure::text || ' · definer=' || p.prosecdef || ' · ' || array_to_string(p.proconfig, ',')
         || ' · sha256 ' || encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex')
    from pg_proc p where p.oid = to_regprocedure('public.sim_escrituras_v0_puerta()')
  union all
  select 4, 'hora del informe (antes del COMMIT)', to_char(clock_timestamp() at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS') || ' UTC'
  union all
  select 5, 'FIN', 'sim-004a-puerta aplicada'
) x order by o, detalle;
