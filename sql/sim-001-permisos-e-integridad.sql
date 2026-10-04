-- ============================================================================
-- sim-001 — permisos e integridad de las 7 tablas del simulador
--
-- De donde sale. Consulta de solo lectura s04 (sql/consultas/s04-esquema-
-- simulador.sql), ejecutada por Ramon en produccion el 4-oct-2026; resumen en
-- sql/APLICADOS.md:
--   · RLS activa en las 9 tablas; en las 7 del simulador, politicas ALL con
--     auth.uid() = user_id; profiles y messages solo SELECT.
--   · anon y authenticated tienen TODOS los grants en las 7, incluidos
--     TRUNCATE, REFERENCES y TRIGGER.
--   · session_chart_config.session_id no tiene FK.
--   · user_id nulable en sim_sessions, sim_trades y sim_drawing_templates;
--     session_id nulable en sim_trades.
--   · sin indices por user_id ni session_id en sim_sessions ni sim_trades.
--
-- Y lo que necesita el codigo (rama auditoria-simulador, 4-oct): el navegador
-- solo hace SELECT, INSERT, UPDATE, DELETE y upsert sobre las 7 tablas, siempre
-- con sesion (authenticated); nunca como anon, nunca TRUNCATE, REFERENCES ni
-- TRIGGER. El servidor y los scripts usan service_role.
--
-- Lo que hace, tabla por tabla (nunca ALL TABLES IN SCHEMA):
--   1. REVOKE ALL a anon en las 7.
--   2. REVOKE TRUNCATE, REFERENCES, TRIGGER a authenticated en las 7.
--   3. FK session_chart_config.session_id → sim_sessions(id) ON DELETE CASCADE.
--      Precondicion: si hay filas huerfanas (session_id que no existe en
--      sim_sessions), el bloque FALLA, dice cuantas y no aplica NADA.
--   4. Indices: sim_sessions(user_id), sim_trades(session_id),
--      sim_trades(user_id, closed_at).
--   5. NOT NULL en sim_sessions.user_id, sim_trades.user_id,
--      sim_drawing_templates.user_id y sim_trades.session_id, CADA UNO solo si
--      no tiene nulos. Si tiene, no se aplica ese y el informe dice cuantos.
--
-- ── LO QUE ESTO NO TOCA, A PROPOSITO ───────────────────────────────────────
--   · Las politicas de escritura (van con la cartera durable).
--   · profiles, messages, Storage (grants, politicas y el bucket forex-data).
--   · Los privilegios por defecto del esquema (tablas futuras).
--
-- ── COMO SE EJECUTA ────────────────────────────────────────────────────────
--   Entero, de una vez, en el editor SQL de Supabase. Son DOS ordenes:
--     1. un solo bloque DO que lo aplica todo y COMPRUEBA el resultado. Si una
--        comprobacion falla, revienta con «sim-001: …» y no queda NADA
--        aplicado: un bloque DO es una sola transaccion.
--     2. una SELECT de informe, que no cambia nada y acaba en
--        «FIN | sim-001 aplicada».
--   Idempotente: ejecutarlo dos veces deja la base igual. No borra datos.
--   Los indices se crean sin CONCURRENTLY (no cabe en una transaccion): con
--   tablas de este tamaño el bloqueo es breve.
--
-- ⚠️ POR QUE SE COMPRUEBA CADA REVOKE. Un REVOKE que no encuentra el privilegio
--    concedido POR QUIEN LO EJECUTA no falla: avisa y no hace nada. Y un grant a
--    PUBLIC no se quita revocando a anon. Por eso el bloque mira despues con
--    has_table_privilege (que ve PUBLIC y la herencia) y por columna.
--
-- Ensayado en PostgreSQL 17 local con un esquema INVENTADO con esos hechos
-- (pruebas/sim-001.mjs). No prueba el editor de Supabase.
-- ============================================================================

DO $sim_001$
DECLARE
  t       text;
  priv    text;
  rol     text;
  n       bigint;
  tipo_a  text;
  tipo_b  text;
  borrado "char";
  SIM CONSTANT text[] := ARRAY['sim_sessions', 'sim_trades', 'session_drawings', 'session_chart_config',
                               'sim_drawing_templates', 'user_chart_config', 'user_tool_config'];
BEGIN
  -- ── 0 · lo que se da por hecho ──────────────────────────────────────────
  FOREACH t IN ARRAY SIM LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE EXCEPTION 'sim-001: no existe public.%: no se aplica nada', t;
    END IF;
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = ('public.' || t)::regclass) THEN
      RAISE EXCEPTION 'sim-001: RLS esta apagada en %; este bloque no la toca: revisar antes', t;
    END IF;
  END LOOP;

  -- ── 1 y 2 · grants, tabla por tabla ─────────────────────────────────────
  REVOKE ALL ON public.sim_sessions          FROM anon;
  REVOKE ALL ON public.sim_trades            FROM anon;
  REVOKE ALL ON public.session_drawings      FROM anon;
  REVOKE ALL ON public.session_chart_config  FROM anon;
  REVOKE ALL ON public.sim_drawing_templates FROM anon;
  REVOKE ALL ON public.user_chart_config     FROM anon;
  REVOKE ALL ON public.user_tool_config      FROM anon;
  REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.sim_sessions          FROM authenticated;
  REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.sim_trades            FROM authenticated;
  REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.session_drawings      FROM authenticated;
  REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.session_chart_config  FROM authenticated;
  REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.sim_drawing_templates FROM authenticated;
  REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.user_chart_config     FROM authenticated;
  REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.user_tool_config      FROM authenticated;

  -- ── 3 · FK de session_chart_config.session_id ───────────────────────────
  SELECT format_type(a.atttypid, a.atttypmod) INTO tipo_a FROM pg_attribute a
   WHERE a.attrelid = 'public.session_chart_config'::regclass AND a.attname = 'session_id' AND NOT a.attisdropped;
  SELECT format_type(a.atttypid, a.atttypmod) INTO tipo_b FROM pg_attribute a
   WHERE a.attrelid = 'public.sim_sessions'::regclass AND a.attname = 'id' AND NOT a.attisdropped;
  IF tipo_a IS NULL THEN
    RAISE EXCEPTION 'sim-001: session_chart_config no tiene columna session_id: no se aplica nada';
  END IF;
  IF tipo_a IS DISTINCT FROM tipo_b THEN
    RAISE EXCEPTION 'sim-001: session_chart_config.session_id es % y sim_sessions.id es %: la FK no cabe; no se aplica nada', tipo_a, tipo_b;
  END IF;
  -- una FK que ya existe en esa columna: si es la nuestra, nada que hacer; si
  -- es otra (otro destino u otro ON DELETE), no se toca y se para
  SELECT k.confdeltype INTO borrado FROM pg_constraint k
   WHERE k.conrelid = 'public.session_chart_config'::regclass AND k.contype = 'f'
     AND k.conkey = ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid = 'public.session_chart_config'::regclass AND attname = 'session_id')]::int2[]
   LIMIT 1;
  IF borrado IS NULL THEN
    SELECT count(*) INTO n FROM public.session_chart_config c
     WHERE c.session_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.sim_sessions s WHERE s.id = c.session_id);
    IF n > 0 THEN
      RAISE EXCEPTION 'sim-001: session_chart_config tiene % fila(s) huerfana(s) (session_id que no existe en sim_sessions): no se aplica nada', n;
    END IF;
    ALTER TABLE public.session_chart_config
      ADD CONSTRAINT session_chart_config_session_id_fkey
      FOREIGN KEY (session_id) REFERENCES public.sim_sessions(id) ON DELETE CASCADE;
  ELSIF borrado <> 'c' OR NOT EXISTS (SELECT 1 FROM pg_constraint k
          WHERE k.conrelid = 'public.session_chart_config'::regclass AND k.contype = 'f'
            AND k.confrelid = 'public.sim_sessions'::regclass AND k.confdeltype = 'c') THEN
    RAISE EXCEPTION 'sim-001: session_chart_config.session_id ya tiene una FK distinta de la de este fichero: %',
      (SELECT string_agg(conname || ' ' || pg_get_constraintdef(oid), '; ') FROM pg_constraint
        WHERE conrelid = 'public.session_chart_config'::regclass AND contype = 'f');
  END IF;

  -- ── 4 · indices ─────────────────────────────────────────────────────────
  CREATE INDEX IF NOT EXISTS sim_sessions_user_id_idx      ON public.sim_sessions (user_id);
  CREATE INDEX IF NOT EXISTS sim_trades_session_id_idx     ON public.sim_trades (session_id);
  CREATE INDEX IF NOT EXISTS sim_trades_user_id_closed_idx ON public.sim_trades (user_id, closed_at);

  -- ── 5 · NOT NULL, cada uno solo con cero nulos ──────────────────────────
  SELECT count(*) INTO n FROM public.sim_sessions WHERE user_id IS NULL;
  IF n = 0 THEN ALTER TABLE public.sim_sessions ALTER COLUMN user_id SET NOT NULL;
  ELSE RAISE NOTICE 'sim-001: sim_sessions.user_id tiene % nulo(s): NOT NULL no aplicado', n; END IF;
  SELECT count(*) INTO n FROM public.sim_trades WHERE user_id IS NULL;
  IF n = 0 THEN ALTER TABLE public.sim_trades ALTER COLUMN user_id SET NOT NULL;
  ELSE RAISE NOTICE 'sim-001: sim_trades.user_id tiene % nulo(s): NOT NULL no aplicado', n; END IF;
  SELECT count(*) INTO n FROM public.sim_drawing_templates WHERE user_id IS NULL;
  IF n = 0 THEN ALTER TABLE public.sim_drawing_templates ALTER COLUMN user_id SET NOT NULL;
  ELSE RAISE NOTICE 'sim-001: sim_drawing_templates.user_id tiene % nulo(s): NOT NULL no aplicado', n; END IF;
  SELECT count(*) INTO n FROM public.sim_trades WHERE session_id IS NULL;
  IF n = 0 THEN ALTER TABLE public.sim_trades ALTER COLUMN session_id SET NOT NULL;
  ELSE RAISE NOTICE 'sim-001: sim_trades.session_id tiene % nulo(s): NOT NULL no aplicado', n; END IF;

  -- ── 6 · comprobaciones: si una falla, no queda NADA aplicado ─────────────
  FOREACH t IN ARRAY SIM LOOP
    FOREACH priv IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] LOOP
      IF has_table_privilege('anon', 'public.' || t, priv) THEN
        RAISE EXCEPTION 'sim-001: anon conserva % sobre % (¿grant a PUBLIC?)', priv, t;
      END IF;
    END LOOP;
    FOREACH priv IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'REFERENCES'] LOOP
      IF has_any_column_privilege('anon', 'public.' || t, priv) THEN
        RAISE EXCEPTION 'sim-001: anon conserva % por columna sobre %', priv, t;
      END IF;
    END LOOP;
    FOREACH priv IN ARRAY ARRAY['TRUNCATE', 'REFERENCES', 'TRIGGER'] LOOP
      IF has_table_privilege('authenticated', 'public.' || t, priv) THEN
        RAISE EXCEPTION 'sim-001: authenticated conserva % sobre % (¿grant a PUBLIC?)', priv, t;
      END IF;
    END LOOP;
    IF has_any_column_privilege('authenticated', 'public.' || t, 'REFERENCES') THEN
      RAISE EXCEPTION 'sim-001: authenticated conserva REFERENCES por columna sobre %', t;
    END IF;
    -- lo que la app SI necesita, que siga
    FOREACH rol IN ARRAY ARRAY['authenticated', 'service_role'] LOOP
      FOREACH priv IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE'] LOOP
        IF NOT has_table_privilege(rol, 'public.' || t, priv) THEN
          RAISE EXCEPTION 'sim-001: % no tiene % sobre %: el simulador dejaria de funcionar', rol, priv, t;
        END IF;
      END LOOP;
    END LOOP;
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = ('public.' || t)::regclass) THEN
      RAISE EXCEPTION 'sim-001: RLS no quedo activa en %', t;
    END IF;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.session_chart_config'::regclass AND contype = 'f'
                  AND confrelid = 'public.sim_sessions'::regclass AND confdeltype = 'c' AND convalidated) THEN
    RAISE EXCEPTION 'sim-001: no quedo la FK de session_chart_config.session_id con ON DELETE CASCADE';
  END IF;
  FOREACH t IN ARRAY ARRAY['sim_sessions_user_id_idx', 'sim_trades_session_id_idx', 'sim_trades_user_id_closed_idx'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_index x WHERE x.indexrelid = to_regclass('public.' || t) AND x.indisvalid) THEN
      RAISE EXCEPTION 'sim-001: el indice % no existe o no es valido', t;
    END IF;
  END LOOP;
END
$sim_001$;


-- ============================================================================
-- INFORME (solo lectura). Lo que el bloque ha dejado, para pegarlo tal cual.
-- Sin filas de datos: solo catalogo y cuantos nulos quedan en las 4 columnas.
-- ============================================================================
with t(nombre) as (values ('sim_sessions'), ('sim_trades'), ('session_drawings'), ('session_chart_config'),
                          ('sim_drawing_templates'), ('user_chart_config'), ('user_tool_config'))
select seccion, detalle from (
  select 1 o, 'rls' seccion, c.oid::regclass::text || ' rls=' || c.relrowsecurity detalle
    from pg_class c where c.oid in (select ('public.' || nombre)::regclass from t)
  union all
  select 2, 'grant', g.table_name || ' · ' || g.grantee || ' · ' || string_agg(g.privilege_type, ',' order by g.privilege_type)
    from information_schema.role_table_grants g
   where g.table_schema = 'public' and g.table_name in (select nombre from t)
     and g.grantee in ('anon', 'authenticated', 'service_role', 'PUBLIC')
   group by g.table_name, g.grantee
  union all
  select 3, 'fk', conrelid::regclass::text || ' · ' || conname || ' · ' || pg_get_constraintdef(oid) || ' · validada=' || convalidated
    from pg_constraint where conrelid = 'public.session_chart_config'::regclass and contype = 'f'
  union all
  select 4, 'indice', pg_get_indexdef(x.indexrelid) || ' · valido=' || x.indisvalid
    from pg_index x
   where x.indexrelid in (to_regclass('public.sim_sessions_user_id_idx'), to_regclass('public.sim_trades_session_id_idx'),
                          to_regclass('public.sim_trades_user_id_closed_idx'))
  union all
  select 5, 'not null', 'sim_sessions.user_id · not_null=' || (select attnotnull from pg_attribute where attrelid = 'public.sim_sessions'::regclass and attname = 'user_id')
         || ' · nulos=' || (select count(*) from public.sim_sessions where user_id is null)
  union all
  select 5, 'not null', 'sim_trades.user_id · not_null=' || (select attnotnull from pg_attribute where attrelid = 'public.sim_trades'::regclass and attname = 'user_id')
         || ' · nulos=' || (select count(*) from public.sim_trades where user_id is null)
  union all
  select 5, 'not null', 'sim_drawing_templates.user_id · not_null=' || (select attnotnull from pg_attribute where attrelid = 'public.sim_drawing_templates'::regclass and attname = 'user_id')
         || ' · nulos=' || (select count(*) from public.sim_drawing_templates where user_id is null)
  union all
  select 5, 'not null', 'sim_trades.session_id · not_null=' || (select attnotnull from pg_attribute where attrelid = 'public.sim_trades'::regclass and attname = 'session_id')
         || ' · nulos=' || (select count(*) from public.sim_trades where session_id is null)
  union all
  select 9, 'FIN', 'sim-001 aplicada'
) r order by o, detalle;
