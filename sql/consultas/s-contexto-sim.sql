-- ============================================================================
-- CONSULTA s-contexto-sim (contexto completo v4) — lo que espera la sim-005 (sql/sim-005-progreso-monotono.sql),
-- MEDIDO en produccion: el grafo de roles, la ficha entera de cada tabla de su cierre (las de pruebas/genera-sim-005.mjs),
-- lo que falta declarar (fila «cierre»: tiene que salir vacia; si no, sus fichas en «tabla+») y una cuenta de huerfanos por FK.
-- Generada por pruebas/genera-sim-005.mjs con revisiones-suite/guardas/contexto.mjs (sContexto): NO EDITAR A MANO.
-- ⛔ SOLO LECTURA. Del catalogo, todo; de los datos, solo una CUENTA por FK (ni un id, ni un email).
-- ⭐ Se pega ENTERA, de una vez, en el editor de Supabase. La PRIMERA fila es la «envoltura»
--    («READ ONLY · lock_timeout 2s · statement_timeout 30s») y la ULTIMA, «FIN». Exportar a CSV y pasarlo a la ventana 1.
-- ============================================================================
begin isolation level repeatable read read only;
set local search_path = pg_catalog, pg_temp;
set local lock_timeout = '2s';
set local statement_timeout = '30s';
set local row_security = off;
with
guarda as (select case when pg_catalog.current_setting('transaction_read_only') OPERATOR(pg_catalog.=) 'on' then true
                       else ('s-contexto: pegala ENTERA, con su BEGIN READ ONLY y su ROLLBACK (transaction_read_only='
                             OPERATOR(pg_catalog.||) pg_catalog.current_setting('transaction_read_only') OPERATOR(pg_catalog.||) ')')::pg_catalog.bool end ok),
fun(firma) as (values
),
tab(nombre) as (values
    ('public.sim_sessions'),
    ('public.profiles'),
    ('public.session_chart_config'),
    ('public.session_drawings'),
    ('public.sim_arrendamientos'),
    ('public.sim_escrituras_v0'),
    ('public.sim_escrituras_v0_marcas'),
    ('public.sim_eventos'),
    ('public.sim_recibos'),
    ('public.sim_trades'),
    ('public.ia_alertas'),
    ('public.ia_borrados'),
    ('public.ia_consentimiento'),
    ('public.ia_conversaciones'),
    ('public.ia_notas_mentor'),
    ('public.ia_operaciones'),
    ('public.ia_perfil_alumno'),
    ('public.ia_recados'),
    ('public.ia_turnos'),
    ('public.ia_uso'),
    ('public.macro_conversaciones'),
    ('public.macro_ia_uso'),
    ('public.macro_planes'),
    ('public.notas'),
    ('public.sim_alumnos'),
    ('public.trades')),
-- MCQ-01 y MCQ-04: lo que falta declarar en estas listas, medido en la base (una vez)
falt as (select (WITH cc_ta AS (SELECT pg_catalog.to_regclass(z.z)::pg_catalog.oid t FROM pg_catalog.unnest((select pg_catalog.array_agg(x.nombre) from tab x)) z(z)),
      cc_cu AS (SELECT pg_catalog.to_regprocedure(z.z)::pg_catalog.oid f FROM pg_catalog.unnest((select pg_catalog.array_agg(f.firma) from fun f)) z(z)
        UNION SELECT t.tgfoid FROM pg_catalog.pg_trigger t WHERE NOT t.tgisinternal AND t.tgrelid OPERATOR(pg_catalog.=) ANY (SELECT cc_ta.t FROM cc_ta)
        UNION SELECT dp.refobjid FROM pg_catalog.pg_depend dp
         WHERE dp.refclassid OPERATOR(pg_catalog.=) 'pg_catalog.pg_proc'::pg_catalog.regclass
           AND ((dp.classid OPERATOR(pg_catalog.=) 'pg_catalog.pg_attrdef'::pg_catalog.regclass AND dp.objid OPERATOR(pg_catalog.=) ANY (SELECT d.oid FROM pg_catalog.pg_attrdef d WHERE d.adrelid OPERATOR(pg_catalog.=) ANY (SELECT cc_ta.t FROM cc_ta)))
             OR (dp.classid OPERATOR(pg_catalog.=) 'pg_catalog.pg_constraint'::pg_catalog.regclass AND dp.objid OPERATOR(pg_catalog.=) ANY (SELECT k.oid FROM pg_catalog.pg_constraint k WHERE k.conrelid OPERATOR(pg_catalog.=) ANY (SELECT cc_ta.t FROM cc_ta)))
             OR (dp.classid OPERATOR(pg_catalog.=) 'pg_catalog.pg_policy'::pg_catalog.regclass AND dp.objid OPERATOR(pg_catalog.=) ANY (SELECT o.oid FROM pg_catalog.pg_policy o WHERE o.polrelid OPERATOR(pg_catalog.=) ANY (SELECT cc_ta.t FROM cc_ta)))
             OR (dp.classid OPERATOR(pg_catalog.=) 'pg_catalog.pg_trigger'::pg_catalog.regclass AND dp.objid OPERATOR(pg_catalog.=) ANY (SELECT t.oid FROM pg_catalog.pg_trigger t WHERE t.tgrelid OPERATOR(pg_catalog.=) ANY (SELECT cc_ta.t FROM cc_ta)))
             OR (dp.classid OPERATOR(pg_catalog.=) 'pg_catalog.pg_class'::pg_catalog.regclass AND dp.objid OPERATOR(pg_catalog.=) ANY (SELECT i.indexrelid FROM pg_catalog.pg_index i WHERE i.indrelid OPERATOR(pg_catalog.=) ANY (SELECT cc_ta.t FROM cc_ta))))),
      cc_tx AS (SELECT pg_catalog.regexp_replace(COALESCE(p.prosrc, '') OPERATOR(pg_catalog.||) ' ' OPERATOR(pg_catalog.||) COALESCE(pg_catalog.pg_get_function_sqlbody(p.oid), ''), '--[^\n]*', '', 'g') x
          FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_language l ON l.oid OPERATOR(pg_catalog.=) p.prolang
         WHERE p.oid OPERATOR(pg_catalog.=) ANY (SELECT cc_cu.f FROM cc_cu) AND l.lanname OPERATOR(pg_catalog.=) ANY (ARRAY['sql', 'plpgsql']::pg_catalog.name[])),
      cc_fc AS (SELECT p.oid, n.nspname::pg_catalog.text esq, p.proname::pg_catalog.text nom FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid OPERATOR(pg_catalog.=) p.pronamespace
         WHERE n.nspname OPERATOR(pg_catalog.<>) ALL (ARRAY['pg_catalog', 'information_schema']::pg_catalog.name[]) AND n.nspname::pg_catalog.text OPERATOR(pg_catalog.!~) '^pg_'),
      cc_ll AS (SELECT DISTINCT c.oid FROM cc_fc c, cc_tx x
         WHERE x.x OPERATOR(pg_catalog.~*) ('(^|[^A-Za-z0-9_$"])"?' OPERATOR(pg_catalog.||) pg_catalog.regexp_replace(c.esq, '([^A-Za-z0-9_])', '\\\1', 'g') OPERATOR(pg_catalog.||) '"?\s*\.\s*"?' OPERATOR(pg_catalog.||) pg_catalog.regexp_replace(c.nom, '([^A-Za-z0-9_])', '\\\1', 'g') OPERATOR(pg_catalog.||) '"?\s*\(')
            OR (NOT EXISTS (SELECT FROM pg_catalog.pg_proc q WHERE q.pronamespace OPERATOR(pg_catalog.=) 'pg_catalog'::pg_catalog.regnamespace AND q.proname::pg_catalog.text OPERATOR(pg_catalog.=) c.nom)
                AND x.x OPERATOR(pg_catalog.~*) ('(^|[^A-Za-z0-9_$."])"?' OPERATOR(pg_catalog.||) pg_catalog.regexp_replace(c.nom, '([^A-Za-z0-9_])', '\\\1', 'g') OPERATOR(pg_catalog.||) '"?\s*\('))),
      cc_tc AS (SELECT c.oid, n.nspname::pg_catalog.text esq, c.relname::pg_catalog.text nom FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid OPERATOR(pg_catalog.=) c.relnamespace
         WHERE c.relkind OPERATOR(pg_catalog.=) ANY (ARRAY['r', 'p', 'v', 'm', 'f']::pg_catalog."char"[]) AND n.nspname OPERATOR(pg_catalog.<>) ALL (ARRAY['pg_catalog', 'information_schema']::pg_catalog.name[]) AND n.nspname::pg_catalog.text OPERATOR(pg_catalog.!~) '^pg_'),
      cc_me AS (SELECT DISTINCT c.oid FROM cc_tc c, cc_tx x
         WHERE x.x OPERATOR(pg_catalog.~*) ('(^|[^A-Za-z0-9_$"])"?' OPERATOR(pg_catalog.||) pg_catalog.regexp_replace(c.esq, '([^A-Za-z0-9_])', '\\\1', 'g') OPERATOR(pg_catalog.||) '"?\s*\.\s*"?' OPERATOR(pg_catalog.||) pg_catalog.regexp_replace(c.nom, '([^A-Za-z0-9_])', '\\\1', 'g') OPERATOR(pg_catalog.||) '"?($|[^A-Za-z0-9_$"])')
            OR (c.esq OPERATOR(pg_catalog.=) 'public' AND x.x OPERATOR(pg_catalog.~*) ('(^|[^A-Za-z0-9_$."])"?' OPERATOR(pg_catalog.||) pg_catalog.regexp_replace(c.nom, '([^A-Za-z0-9_])', '\\\1', 'g') OPERATOR(pg_catalog.||) '"?($|[^A-Za-z0-9_$"])'))
        UNION SELECT k.conrelid FROM pg_catalog.pg_constraint k
         WHERE k.contype OPERATOR(pg_catalog.=) 'f' AND k.confrelid OPERATOR(pg_catalog.=) ANY (SELECT cc_ta.t FROM cc_ta)
           AND (k.confdeltype OPERATOR(pg_catalog.=) ANY (ARRAY['c', 'n', 'd']::pg_catalog."char"[]) OR k.confupdtype OPERATOR(pg_catalog.=) ANY (ARRAY['c', 'n', 'd']::pg_catalog."char"[])))
      SELECT pg_catalog.jsonb_build_object(
        'funciones', COALESCE((SELECT pg_catalog.jsonb_agg(l.oid::pg_catalog.regprocedure::pg_catalog.text ORDER BY l.oid::pg_catalog.regprocedure::pg_catalog.text COLLATE pg_catalog."C")
          FROM cc_ll l WHERE NOT EXISTS (SELECT FROM cc_cu WHERE cc_cu.f OPERATOR(pg_catalog.=) l.oid)), '[]'::pg_catalog.jsonb),
        'tablas', COALESCE((SELECT pg_catalog.jsonb_agg(m.oid::pg_catalog.regclass::pg_catalog.text ORDER BY m.oid::pg_catalog.regclass::pg_catalog.text COLLATE pg_catalog."C")
          FROM cc_me m WHERE NOT EXISTS (SELECT FROM cc_ta WHERE cc_ta.t OPERATOR(pg_catalog.=) m.oid)), '[]'::pg_catalog.jsonb))) j),
filas as (
  select 0 o, 'envoltura'::pg_catalog.text seccion,
         (case when pg_catalog.current_setting('transaction_read_only') OPERATOR(pg_catalog.=) 'on' then 'READ ONLY' else 'NO READ ONLY' end
          OPERATOR(pg_catalog.||) ' · lock_timeout ' OPERATOR(pg_catalog.||) pg_catalog.current_setting('lock_timeout')
          OPERATOR(pg_catalog.||) ' · statement_timeout ' OPERATOR(pg_catalog.||) pg_catalog.current_setting('statement_timeout')) objeto,
         ''::pg_catalog.text valor
  union all
  select 1, 'grafo', 'contexto v4: el componente de anon, authenticated, service_role y authenticator, y el entorno', (WITH RECURSIVE cc_b(oid) AS (
        SELECT a.oid FROM pg_catalog.pg_roles a WHERE a.rolname OPERATOR(pg_catalog.=) ANY (ARRAY['anon', 'authenticated', 'service_role', 'authenticator']::pg_catalog.name[])),
      cc_n(oid) AS (SELECT cc_b.oid FROM cc_b UNION SELECT CASE WHEN m.member OPERATOR(pg_catalog.=) cc_n.oid THEN m.roleid ELSE m.member END
        FROM pg_catalog.pg_auth_members m JOIN cc_n ON m.member OPERATOR(pg_catalog.=) cc_n.oid OR m.roleid OPERATOR(pg_catalog.=) cc_n.oid),
      cc_arriba(oid) AS (SELECT cc_b.oid FROM cc_b UNION SELECT m.roleid FROM pg_catalog.pg_auth_members m JOIN cc_arriba ON m.member OPERATOR(pg_catalog.=) cc_arriba.oid),
      cc_db(oid) AS (SELECT d.oid FROM pg_catalog.pg_database d WHERE d.datname OPERATOR(pg_catalog.=) pg_catalog.current_database())
      SELECT pg_catalog.jsonb_build_object(
        'roles', (SELECT pg_catalog.jsonb_object_agg(a.rolname::pg_catalog.text, pg_catalog.jsonb_build_object(
                 'super', a.rolsuper, 'bypassrls', a.rolbypassrls, 'login', a.rolcanlogin, 'inherit', a.rolinherit,
                 'createrole', a.rolcreaterole, 'createdb', a.rolcreatedb, 'replication', a.rolreplication, 'connlimit', a.rolconnlimit,
                 'validuntil', pg_catalog.date_part('epoch', a.rolvaliduntil),
                 'config', (SELECT pg_catalog.jsonb_agg(z.z ORDER BY z.z COLLATE pg_catalog."C") FROM pg_catalog.unnest(a.rolconfig) z(z)),
                 'configdb', (SELECT (SELECT pg_catalog.jsonb_agg(z.z ORDER BY z.z COLLATE pg_catalog."C") FROM pg_catalog.unnest(r.setconfig) z(z)) FROM pg_catalog.pg_db_role_setting r, cc_db
                   WHERE r.setrole OPERATOR(pg_catalog.=) a.oid AND r.setdatabase OPERATOR(pg_catalog.=) cc_db.oid)))
          FROM pg_catalog.pg_roles a JOIN cc_n ON a.oid OPERATOR(pg_catalog.=) cc_n.oid),
        'aristas', (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(pg_catalog.pg_get_userbyid(m.member)::pg_catalog.text, pg_catalog.pg_get_userbyid(m.roleid)::pg_catalog.text,
                 m.admin_option, m.inherit_option, m.set_option, pg_catalog.pg_get_userbyid(m.grantor)::pg_catalog.text)
                 ORDER BY pg_catalog.pg_get_userbyid(m.member)::pg_catalog.text COLLATE pg_catalog."C", pg_catalog.pg_get_userbyid(m.roleid)::pg_catalog.text COLLATE pg_catalog."C", pg_catalog.pg_get_userbyid(m.grantor)::pg_catalog.text COLLATE pg_catalog."C")
          FROM pg_catalog.pg_auth_members m
         WHERE m.member OPERATOR(pg_catalog.=) ANY (SELECT cc_n.oid FROM cc_n) OR m.roleid OPERATOR(pg_catalog.=) ANY (SELECT cc_n.oid FROM cc_n)),
        'base', (SELECT (SELECT pg_catalog.jsonb_agg(z.z ORDER BY z.z COLLATE pg_catalog."C") FROM pg_catalog.unnest(r.setconfig) z(z)) FROM pg_catalog.pg_db_role_setting r, cc_db
                 WHERE r.setrole OPERATOR(pg_catalog.=) 0::pg_catalog.oid AND r.setdatabase OPERATOR(pg_catalog.=) cc_db.oid),
        'eventos', (SELECT pg_catalog.jsonb_object_agg(e.evtname::pg_catalog.text, pg_catalog.jsonb_build_object('evento', e.evtevent::pg_catalog.text,
                 'enabled', e.evtenabled::pg_catalog.text, 'dueño', pg_catalog.pg_get_userbyid(e.evtowner)::pg_catalog.text, 'tags', pg_catalog.to_jsonb(e.evttags),
                 'funcion', e.evtfoid::pg_catalog.regprocedure::pg_catalog.text, 'ficha', (SELECT pg_catalog.jsonb_build_object(
        'dueño', pg_catalog.pg_get_userbyid(p.proowner)::pg_catalog.text,
        'dueño_rol', (SELECT pg_catalog.jsonb_build_object('super', r.rolsuper, 'bypassrls', r.rolbypassrls, 'login', r.rolcanlogin, 'inherit', r.rolinherit,
          'createrole', r.rolcreaterole, 'createdb', r.rolcreatedb, 'replication', r.rolreplication,
          'config', (SELECT pg_catalog.jsonb_agg(z.z ORDER BY z.z COLLATE pg_catalog."C") FROM pg_catalog.unnest(r.rolconfig) z(z)))
        FROM pg_catalog.pg_roles r WHERE r.oid OPERATOR(pg_catalog.=) p.proowner),
        'acl', pg_catalog.to_jsonb(p.proacl::pg_catalog.text[]),
        'ret', p.prorettype::pg_catalog.regtype::pg_catalog.text,
        'setof', p.proretset,
        'args', (SELECT pg_catalog.jsonb_agg(t.t::pg_catalog.regtype::pg_catalog.text ORDER BY t.o) FROM pg_catalog.unnest(p.proargtypes::pg_catalog.oid[]) WITH ORDINALITY t(t, o)),
        'todos', (SELECT pg_catalog.jsonb_agg(t.t::pg_catalog.regtype::pg_catalog.text ORDER BY t.o) FROM pg_catalog.unnest(p.proallargtypes) WITH ORDINALITY t(t, o)),
        'modos', pg_catalog.to_jsonb(p.proargmodes::pg_catalog.text[]),
        'nombres', pg_catalog.to_jsonb(p.proargnames),
        'ndefaults', p.pronargdefaults,
        'defaults', pg_catalog.md5(pg_catalog.pg_get_expr(p.proargdefaults, 0::pg_catalog.oid)),
        'variadic', p.provariadic::pg_catalog.regtype::pg_catalog.text,
        'config', (SELECT pg_catalog.jsonb_agg(c.c ORDER BY c.c COLLATE pg_catalog."C") FROM pg_catalog.unnest(p.proconfig) c(c)),
        'vol', p.provolatile::pg_catalog.text,
        'strict', p.proisstrict,
        'definer', p.prosecdef,
        'leakproof', p.proleakproof,
        'par', p.proparallel::pg_catalog.text,
        'cost', p.procost,
        'rows', p.prorows,
        'kind', p.prokind::pg_catalog.text,
        'lang', l.lanname::pg_catalog.text,
        'soporte', p.prosupport::pg_catalog.text,
        'bin', p.probin,
        'cuerpo', pg_catalog.md5(p.prosrc),
        'sqlbody', pg_catalog.md5(pg_catalog.pg_get_function_sqlbody(p.oid)),
        'trf', (SELECT pg_catalog.jsonb_agg(t.t::pg_catalog.regtype::pg_catalog.text ORDER BY t.o) FROM pg_catalog.unnest(p.protrftypes) WITH ORDINALITY t(t, o)),
        'rettipo', (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(a.attname::pg_catalog.text, pg_catalog.format_type(a.atttypid, a.atttypmod)) ORDER BY a.attnum)
          FROM pg_catalog.pg_type y JOIN pg_catalog.pg_attribute a ON a.attrelid OPERATOR(pg_catalog.=) y.typrelid
         WHERE y.oid OPERATOR(pg_catalog.=) p.prorettype AND a.attnum OPERATOR(pg_catalog.>) 0 AND NOT a.attisdropped),
        'homonimos', (SELECT pg_catalog.jsonb_agg(o.oid::pg_catalog.regprocedure::pg_catalog.text ORDER BY o.oid::pg_catalog.regprocedure::pg_catalog.text COLLATE pg_catalog."C")
          FROM pg_catalog.pg_proc o WHERE o.proname OPERATOR(pg_catalog.=) p.proname AND o.pronamespace OPERATOR(pg_catalog.=) p.pronamespace)) FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_language l ON l.oid OPERATOR(pg_catalog.=) p.prolang WHERE p.oid OPERATOR(pg_catalog.=) e.evtfoid)))
          FROM pg_catalog.pg_event_trigger e),
        'esquema_public', (SELECT pg_catalog.jsonb_build_object('dueño', pg_catalog.pg_get_userbyid(n.nspowner)::pg_catalog.text, 'acl', pg_catalog.to_jsonb(n.nspacl::pg_catalog.text[]))
          FROM pg_catalog.pg_namespace n WHERE n.nspname OPERATOR(pg_catalog.=) 'public'),
        'lenguajes', (SELECT pg_catalog.jsonb_object_agg(g.lanname::pg_catalog.text, pg_catalog.jsonb_build_object('dueño', pg_catalog.pg_get_userbyid(g.lanowner)::pg_catalog.text,
                 'acl', pg_catalog.to_jsonb(g.lanacl::pg_catalog.text[]), 'confiable', g.lanpltrusted))
          FROM pg_catalog.pg_language g WHERE g.lanname OPERATOR(pg_catalog.=) ANY (ARRAY['sql', 'plpgsql']::pg_catalog.name[])),
        'parametros', (SELECT pg_catalog.jsonb_object_agg(x.parname, pg_catalog.to_jsonb(x.paracl::pg_catalog.text[])) FROM pg_catalog.pg_parameter_acl x),
        'parametros_del_modelo', (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(a.rolname::pg_catalog.text, s.name, q.q)
                 ORDER BY a.rolname::pg_catalog.text COLLATE pg_catalog."C", s.name COLLATE pg_catalog."C", q.q)
          FROM pg_catalog.pg_roles a JOIN cc_arriba ON a.oid OPERATOR(pg_catalog.=) cc_arriba.oid, pg_catalog.pg_settings s,
               (VALUES ('SET'), ('ALTER SYSTEM')) q(q)
         WHERE (s.context OPERATOR(pg_catalog.=) 'superuser' OR q.q OPERATOR(pg_catalog.=) 'ALTER SYSTEM')
           AND pg_catalog.has_parameter_privilege(a.oid, s.name, q.q)))::pg_catalog.text)
  union all
  select 2, 'funcion', f.firma, coalesce((select pg_catalog.jsonb_build_object(
        'dueño', pg_catalog.pg_get_userbyid(p.proowner)::pg_catalog.text,
        'dueño_rol', (SELECT pg_catalog.jsonb_build_object('super', r.rolsuper, 'bypassrls', r.rolbypassrls, 'login', r.rolcanlogin, 'inherit', r.rolinherit,
          'createrole', r.rolcreaterole, 'createdb', r.rolcreatedb, 'replication', r.rolreplication,
          'config', (SELECT pg_catalog.jsonb_agg(z.z ORDER BY z.z COLLATE pg_catalog."C") FROM pg_catalog.unnest(r.rolconfig) z(z)))
        FROM pg_catalog.pg_roles r WHERE r.oid OPERATOR(pg_catalog.=) p.proowner),
        'acl', pg_catalog.to_jsonb(p.proacl::pg_catalog.text[]),
        'ret', p.prorettype::pg_catalog.regtype::pg_catalog.text,
        'setof', p.proretset,
        'args', (SELECT pg_catalog.jsonb_agg(t.t::pg_catalog.regtype::pg_catalog.text ORDER BY t.o) FROM pg_catalog.unnest(p.proargtypes::pg_catalog.oid[]) WITH ORDINALITY t(t, o)),
        'todos', (SELECT pg_catalog.jsonb_agg(t.t::pg_catalog.regtype::pg_catalog.text ORDER BY t.o) FROM pg_catalog.unnest(p.proallargtypes) WITH ORDINALITY t(t, o)),
        'modos', pg_catalog.to_jsonb(p.proargmodes::pg_catalog.text[]),
        'nombres', pg_catalog.to_jsonb(p.proargnames),
        'ndefaults', p.pronargdefaults,
        'defaults', pg_catalog.md5(pg_catalog.pg_get_expr(p.proargdefaults, 0::pg_catalog.oid)),
        'variadic', p.provariadic::pg_catalog.regtype::pg_catalog.text,
        'config', (SELECT pg_catalog.jsonb_agg(c.c ORDER BY c.c COLLATE pg_catalog."C") FROM pg_catalog.unnest(p.proconfig) c(c)),
        'vol', p.provolatile::pg_catalog.text,
        'strict', p.proisstrict,
        'definer', p.prosecdef,
        'leakproof', p.proleakproof,
        'par', p.proparallel::pg_catalog.text,
        'cost', p.procost,
        'rows', p.prorows,
        'kind', p.prokind::pg_catalog.text,
        'lang', l.lanname::pg_catalog.text,
        'soporte', p.prosupport::pg_catalog.text,
        'bin', p.probin,
        'cuerpo', pg_catalog.md5(p.prosrc),
        'sqlbody', pg_catalog.md5(pg_catalog.pg_get_function_sqlbody(p.oid)),
        'trf', (SELECT pg_catalog.jsonb_agg(t.t::pg_catalog.regtype::pg_catalog.text ORDER BY t.o) FROM pg_catalog.unnest(p.protrftypes) WITH ORDINALITY t(t, o)),
        'rettipo', (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(a.attname::pg_catalog.text, pg_catalog.format_type(a.atttypid, a.atttypmod)) ORDER BY a.attnum)
          FROM pg_catalog.pg_type y JOIN pg_catalog.pg_attribute a ON a.attrelid OPERATOR(pg_catalog.=) y.typrelid
         WHERE y.oid OPERATOR(pg_catalog.=) p.prorettype AND a.attnum OPERATOR(pg_catalog.>) 0 AND NOT a.attisdropped),
        'homonimos', (SELECT pg_catalog.jsonb_agg(o.oid::pg_catalog.regprocedure::pg_catalog.text ORDER BY o.oid::pg_catalog.regprocedure::pg_catalog.text COLLATE pg_catalog."C")
          FROM pg_catalog.pg_proc o WHERE o.proname OPERATOR(pg_catalog.=) p.proname AND o.pronamespace OPERATOR(pg_catalog.=) p.pronamespace))::pg_catalog.text
      from pg_catalog.pg_proc p join pg_catalog.pg_language l on l.oid OPERATOR(pg_catalog.=) p.prolang
     where p.oid OPERATOR(pg_catalog.=) pg_catalog.to_regprocedure(f.firma)), 'no existe')
    from fun f
  union all
  select 3, 'tabla', x.nombre, coalesce((select (SELECT pg_catalog.jsonb_build_object(
        'disp', (SELECT pg_catalog.jsonb_object_agg(t.tgname::pg_catalog.text, pg_catalog.jsonb_build_object('enabled', t.tgenabled::pg_catalog.text,
                   'def', pg_catalog.md5(pg_catalog.pg_get_triggerdef(t.oid)), 'funcion', t.tgfoid::pg_catalog.regprocedure::pg_catalog.text, 'ficha', (SELECT pg_catalog.jsonb_build_object(
        'dueño', pg_catalog.pg_get_userbyid(p.proowner)::pg_catalog.text,
        'dueño_rol', (SELECT pg_catalog.jsonb_build_object('super', r.rolsuper, 'bypassrls', r.rolbypassrls, 'login', r.rolcanlogin, 'inherit', r.rolinherit,
          'createrole', r.rolcreaterole, 'createdb', r.rolcreatedb, 'replication', r.rolreplication,
          'config', (SELECT pg_catalog.jsonb_agg(z.z ORDER BY z.z COLLATE pg_catalog."C") FROM pg_catalog.unnest(r.rolconfig) z(z)))
        FROM pg_catalog.pg_roles r WHERE r.oid OPERATOR(pg_catalog.=) p.proowner),
        'acl', pg_catalog.to_jsonb(p.proacl::pg_catalog.text[]),
        'ret', p.prorettype::pg_catalog.regtype::pg_catalog.text,
        'setof', p.proretset,
        'args', (SELECT pg_catalog.jsonb_agg(t.t::pg_catalog.regtype::pg_catalog.text ORDER BY t.o) FROM pg_catalog.unnest(p.proargtypes::pg_catalog.oid[]) WITH ORDINALITY t(t, o)),
        'todos', (SELECT pg_catalog.jsonb_agg(t.t::pg_catalog.regtype::pg_catalog.text ORDER BY t.o) FROM pg_catalog.unnest(p.proallargtypes) WITH ORDINALITY t(t, o)),
        'modos', pg_catalog.to_jsonb(p.proargmodes::pg_catalog.text[]),
        'nombres', pg_catalog.to_jsonb(p.proargnames),
        'ndefaults', p.pronargdefaults,
        'defaults', pg_catalog.md5(pg_catalog.pg_get_expr(p.proargdefaults, 0::pg_catalog.oid)),
        'variadic', p.provariadic::pg_catalog.regtype::pg_catalog.text,
        'config', (SELECT pg_catalog.jsonb_agg(c.c ORDER BY c.c COLLATE pg_catalog."C") FROM pg_catalog.unnest(p.proconfig) c(c)),
        'vol', p.provolatile::pg_catalog.text,
        'strict', p.proisstrict,
        'definer', p.prosecdef,
        'leakproof', p.proleakproof,
        'par', p.proparallel::pg_catalog.text,
        'cost', p.procost,
        'rows', p.prorows,
        'kind', p.prokind::pg_catalog.text,
        'lang', l.lanname::pg_catalog.text,
        'soporte', p.prosupport::pg_catalog.text,
        'bin', p.probin,
        'cuerpo', pg_catalog.md5(p.prosrc),
        'sqlbody', pg_catalog.md5(pg_catalog.pg_get_function_sqlbody(p.oid)),
        'trf', (SELECT pg_catalog.jsonb_agg(t.t::pg_catalog.regtype::pg_catalog.text ORDER BY t.o) FROM pg_catalog.unnest(p.protrftypes) WITH ORDINALITY t(t, o)),
        'rettipo', (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(a.attname::pg_catalog.text, pg_catalog.format_type(a.atttypid, a.atttypmod)) ORDER BY a.attnum)
          FROM pg_catalog.pg_type y JOIN pg_catalog.pg_attribute a ON a.attrelid OPERATOR(pg_catalog.=) y.typrelid
         WHERE y.oid OPERATOR(pg_catalog.=) p.prorettype AND a.attnum OPERATOR(pg_catalog.>) 0 AND NOT a.attisdropped),
        'homonimos', (SELECT pg_catalog.jsonb_agg(o.oid::pg_catalog.regprocedure::pg_catalog.text ORDER BY o.oid::pg_catalog.regprocedure::pg_catalog.text COLLATE pg_catalog."C")
          FROM pg_catalog.pg_proc o WHERE o.proname OPERATOR(pg_catalog.=) p.proname AND o.pronamespace OPERATOR(pg_catalog.=) p.pronamespace)) FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_language l ON l.oid OPERATOR(pg_catalog.=) p.prolang WHERE p.oid OPERATOR(pg_catalog.=) t.tgfoid)))
          FROM pg_catalog.pg_trigger t WHERE t.tgrelid OPERATOR(pg_catalog.=) cc_t AND NOT t.tgisinternal),
        'internos', (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(k.conname::pg_catalog.text, t.tgrelid::pg_catalog.regclass::pg_catalog.text, t.tgtype,
                   t.tgenabled::pg_catalog.text, t.tgfoid::pg_catalog.regprocedure::pg_catalog.text, t.tgdeferrable, t.tginitdeferred)
                   ORDER BY k.conname::pg_catalog.text COLLATE pg_catalog."C", t.tgrelid::pg_catalog.regclass::pg_catalog.text COLLATE pg_catalog."C", t.tgtype, t.tgfoid::pg_catalog.regprocedure::pg_catalog.text COLLATE pg_catalog."C")
          FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_constraint k ON k.oid OPERATOR(pg_catalog.=) t.tgconstraint
         WHERE t.tgisinternal AND (k.conrelid OPERATOR(pg_catalog.=) cc_t OR k.confrelid OPERATOR(pg_catalog.=) cc_t)),
        'restricciones', (SELECT pg_catalog.jsonb_object_agg(k.conname::pg_catalog.text, pg_catalog.jsonb_build_object('tipo', k.contype::pg_catalog.text, 'validada', k.convalidated,
                   'diferible', k.condeferrable, 'diferida', k.condeferred, 'local', k.conislocal, 'noinherit', k.connoinherit, 'def', pg_catalog.md5(pg_catalog.pg_get_constraintdef(k.oid))))
          FROM pg_catalog.pg_constraint k WHERE k.conrelid OPERATOR(pg_catalog.=) cc_t),
        'indices', (SELECT pg_catalog.jsonb_object_agg(c.relname::pg_catalog.text, pg_catalog.jsonb_build_object('def', pg_catalog.md5(pg_catalog.pg_get_indexdef(i.indexrelid)),
                   'unico', i.indisunique, 'primaria', i.indisprimary, 'exclusion', i.indisexclusion, 'inmediato', i.indimmediate, 'valido', i.indisvalid, 'listo', i.indisready, 'vivo', i.indislive,
                   'replica', i.indisreplident))
          FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class c ON c.oid OPERATOR(pg_catalog.=) i.indexrelid WHERE i.indrelid OPERATOR(pg_catalog.=) cc_t),
        'columnas', (SELECT pg_catalog.jsonb_object_agg(a.attname::pg_catalog.text, pg_catalog.jsonb_build_object('tipo', pg_catalog.format_type(a.atttypid, a.atttypmod),
                   'notnull', a.attnotnull, 'default', pg_catalog.md5(pg_catalog.pg_get_expr(d.adbin, d.adrelid)), 'identidad', a.attidentity::pg_catalog.text,
                   'generada', a.attgenerated::pg_catalog.text, 'colacion', a.attcollation::pg_catalog.regcollation::pg_catalog.text, 'acl', pg_catalog.to_jsonb(a.attacl::pg_catalog.text[]),
                   'dominio', (SELECT pg_catalog.jsonb_build_object('base', pg_catalog.format_type(y.typbasetype, y.typtypmod), 'notnull', y.typnotnull, 'default', pg_catalog.md5(y.typdefault),
                       'dueño', pg_catalog.pg_get_userbyid(y.typowner)::pg_catalog.text, 'acl', pg_catalog.to_jsonb(y.typacl::pg_catalog.text[]),
                       'checks', (SELECT pg_catalog.jsonb_object_agg(k.conname::pg_catalog.text, pg_catalog.jsonb_build_object('def', pg_catalog.md5(pg_catalog.pg_get_constraintdef(k.oid)), 'validada', k.convalidated))
                         FROM pg_catalog.pg_constraint k WHERE k.contypid OPERATOR(pg_catalog.=) y.oid))
                     FROM pg_catalog.pg_type y WHERE y.oid OPERATOR(pg_catalog.=) a.atttypid AND y.typtype OPERATOR(pg_catalog.=) 'd')))
          FROM pg_catalog.pg_attribute a LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid OPERATOR(pg_catalog.=) a.attrelid AND d.adnum OPERATOR(pg_catalog.=) a.attnum
         WHERE a.attrelid OPERATOR(pg_catalog.=) cc_t AND a.attnum OPERATOR(pg_catalog.>) 0 AND NOT a.attisdropped),
        'orden', (SELECT pg_catalog.jsonb_agg(a.attname::pg_catalog.text ORDER BY a.attnum) FROM pg_catalog.pg_attribute a
         WHERE a.attrelid OPERATOR(pg_catalog.=) cc_t AND a.attnum OPERATOR(pg_catalog.>) 0 AND NOT a.attisdropped),
        'hijas', (SELECT pg_catalog.count(*) FROM pg_catalog.pg_inherits i WHERE i.inhparent OPERATOR(pg_catalog.=) cc_t),
        'padres', (SELECT pg_catalog.jsonb_agg(i.inhparent::pg_catalog.regclass::pg_catalog.text ORDER BY i.inhseqno) FROM pg_catalog.pg_inherits i WHERE i.inhrelid OPERATOR(pg_catalog.=) cc_t),
        'vistas', (SELECT pg_catalog.jsonb_object_agg(v.oid::pg_catalog.regclass::pg_catalog.text, pg_catalog.jsonb_build_object('tipo', v.relkind::pg_catalog.text,
                   'dueño', pg_catalog.pg_get_userbyid(v.relowner)::pg_catalog.text, 'acl', pg_catalog.to_jsonb(v.relacl::pg_catalog.text[]),
                   'opciones', (SELECT pg_catalog.jsonb_agg(z.z ORDER BY z.z COLLATE pg_catalog."C") FROM pg_catalog.unnest(v.reloptions) z(z)),
                   'def', pg_catalog.md5(pg_catalog.pg_get_viewdef(v.oid))))
          FROM pg_catalog.pg_class v WHERE v.oid OPERATOR(pg_catalog.=) ANY (SELECT w.ev_class FROM pg_catalog.pg_depend d JOIN pg_catalog.pg_rewrite w ON w.oid OPERATOR(pg_catalog.=) d.objid
                 WHERE d.classid OPERATOR(pg_catalog.=) 'pg_catalog.pg_rewrite'::pg_catalog.regclass AND d.refclassid OPERATOR(pg_catalog.=) 'pg_catalog.pg_class'::pg_catalog.regclass
                   AND d.refobjid OPERATOR(pg_catalog.=) cc_t AND w.ev_class OPERATOR(pg_catalog.<>) cc_t)),
        'publicaciones', (SELECT pg_catalog.jsonb_object_agg(b.pubname::pg_catalog.text, pg_catalog.jsonb_build_object('todas', b.puballtables, 'insert', b.pubinsert, 'update', b.pubupdate,
                   'delete', b.pubdelete, 'truncate', b.pubtruncate, 'raiz', b.pubviaroot, 'dueño', pg_catalog.pg_get_userbyid(b.pubowner)::pg_catalog.text,
                   'esquema', EXISTS (SELECT FROM pg_catalog.pg_publication_namespace n JOIN pg_catalog.pg_class c ON c.relnamespace OPERATOR(pg_catalog.=) n.pnnspid
                                WHERE n.pnpubid OPERATOR(pg_catalog.=) b.oid AND c.oid OPERATOR(pg_catalog.=) cc_t),
                   'tabla', (SELECT pg_catalog.jsonb_build_object(
                       'columnas', (SELECT pg_catalog.jsonb_agg(a.attname::pg_catalog.text ORDER BY x.n) FROM pg_catalog.unnest(r.prattrs::pg_catalog.int2[]) WITH ORDINALITY x(a, n)
                                    JOIN pg_catalog.pg_attribute a ON a.attrelid OPERATOR(pg_catalog.=) r.prrelid AND a.attnum OPERATOR(pg_catalog.=) x.a),
                       'filtro', pg_catalog.md5(pg_catalog.pg_get_expr(r.prqual, r.prrelid)))
                     FROM pg_catalog.pg_publication_rel r WHERE r.prpubid OPERATOR(pg_catalog.=) b.oid AND r.prrelid OPERATOR(pg_catalog.=) cc_t)))
          FROM pg_catalog.pg_publication b
         WHERE b.puballtables OR EXISTS (SELECT FROM pg_catalog.pg_publication_rel r WHERE r.prpubid OPERATOR(pg_catalog.=) b.oid AND r.prrelid OPERATOR(pg_catalog.=) cc_t)
            OR EXISTS (SELECT FROM pg_catalog.pg_publication_namespace n JOIN pg_catalog.pg_class c ON c.relnamespace OPERATOR(pg_catalog.=) n.pnnspid
                        WHERE n.pnpubid OPERATOR(pg_catalog.=) b.oid AND c.oid OPERATOR(pg_catalog.=) cc_t)),
        'replident', (SELECT c.relreplident::pg_catalog.text FROM pg_catalog.pg_class c WHERE c.oid OPERATOR(pg_catalog.=) cc_t),
        'persistencia', (SELECT c.relpersistence::pg_catalog.text FROM pg_catalog.pg_class c WHERE c.oid OPERATOR(pg_catalog.=) cc_t),
        'opciones', (SELECT (SELECT pg_catalog.jsonb_agg(z.z ORDER BY z.z COLLATE pg_catalog."C") FROM pg_catalog.unnest(c.reloptions) z(z)) FROM pg_catalog.pg_class c WHERE c.oid OPERATOR(pg_catalog.=) cc_t),
        'dueño_rol', (SELECT (SELECT pg_catalog.jsonb_build_object('super', r.rolsuper, 'bypassrls', r.rolbypassrls, 'login', r.rolcanlogin, 'inherit', r.rolinherit,
          'createrole', r.rolcreaterole, 'createdb', r.rolcreatedb, 'replication', r.rolreplication,
          'config', (SELECT pg_catalog.jsonb_agg(z.z ORDER BY z.z COLLATE pg_catalog."C") FROM pg_catalog.unnest(r.rolconfig) z(z)))
        FROM pg_catalog.pg_roles r WHERE r.oid OPERATOR(pg_catalog.=) c.relowner) FROM pg_catalog.pg_class c WHERE c.oid OPERATOR(pg_catalog.=) cc_t),
        'dueño', (SELECT pg_catalog.pg_get_userbyid(c.relowner)::pg_catalog.text FROM pg_catalog.pg_class c WHERE c.oid OPERATOR(pg_catalog.=) cc_t),
        'tipo', (SELECT c.relkind::pg_catalog.text FROM pg_catalog.pg_class c WHERE c.oid OPERATOR(pg_catalog.=) cc_t),
        'acl', (SELECT pg_catalog.to_jsonb(c.relacl::pg_catalog.text[]) FROM pg_catalog.pg_class c WHERE c.oid OPERATOR(pg_catalog.=) cc_t),
        'rls', (SELECT c.relrowsecurity FROM pg_catalog.pg_class c WHERE c.oid OPERATOR(pg_catalog.=) cc_t),
        'force', (SELECT c.relforcerowsecurity FROM pg_catalog.pg_class c WHERE c.oid OPERATOR(pg_catalog.=) cc_t),
        'pol', (SELECT pg_catalog.jsonb_object_agg(o.polname::pg_catalog.text, pg_catalog.jsonb_build_object('cmd', o.polcmd::pg_catalog.text, 'permisiva', o.polpermissive,
                   'roles', (SELECT pg_catalog.jsonb_agg(z.n ORDER BY z.n COLLATE pg_catalog."C") FROM (SELECT CASE WHEN r.r OPERATOR(pg_catalog.=) 0::pg_catalog.oid THEN 'public'
                      ELSE pg_catalog.pg_get_userbyid(r.r)::pg_catalog.text END n FROM pg_catalog.unnest(o.polroles) r(r)) z),
                   'using', pg_catalog.md5(pg_catalog.pg_get_expr(o.polqual, o.polrelid)), 'check', pg_catalog.md5(pg_catalog.pg_get_expr(o.polwithcheck, o.polrelid))))
          FROM pg_catalog.pg_policy o WHERE o.polrelid OPERATOR(pg_catalog.=) cc_t),
        'reglas', (SELECT pg_catalog.jsonb_object_agg(w.rulename::pg_catalog.text, pg_catalog.jsonb_build_object('enabled', w.ev_enabled::pg_catalog.text, 'def', pg_catalog.md5(pg_catalog.pg_get_ruledef(w.oid))))
          FROM pg_catalog.pg_rewrite w WHERE w.ev_class OPERATOR(pg_catalog.=) cc_t AND w.rulename OPERATOR(pg_catalog.<>) '_RETURN'),
        'dependencias', (SELECT pg_catalog.jsonb_object_agg(f.f::pg_catalog.regprocedure::pg_catalog.text, (SELECT pg_catalog.jsonb_build_object(
        'dueño', pg_catalog.pg_get_userbyid(p.proowner)::pg_catalog.text,
        'dueño_rol', (SELECT pg_catalog.jsonb_build_object('super', r.rolsuper, 'bypassrls', r.rolbypassrls, 'login', r.rolcanlogin, 'inherit', r.rolinherit,
          'createrole', r.rolcreaterole, 'createdb', r.rolcreatedb, 'replication', r.rolreplication,
          'config', (SELECT pg_catalog.jsonb_agg(z.z ORDER BY z.z COLLATE pg_catalog."C") FROM pg_catalog.unnest(r.rolconfig) z(z)))
        FROM pg_catalog.pg_roles r WHERE r.oid OPERATOR(pg_catalog.=) p.proowner),
        'acl', pg_catalog.to_jsonb(p.proacl::pg_catalog.text[]),
        'ret', p.prorettype::pg_catalog.regtype::pg_catalog.text,
        'setof', p.proretset,
        'args', (SELECT pg_catalog.jsonb_agg(t.t::pg_catalog.regtype::pg_catalog.text ORDER BY t.o) FROM pg_catalog.unnest(p.proargtypes::pg_catalog.oid[]) WITH ORDINALITY t(t, o)),
        'todos', (SELECT pg_catalog.jsonb_agg(t.t::pg_catalog.regtype::pg_catalog.text ORDER BY t.o) FROM pg_catalog.unnest(p.proallargtypes) WITH ORDINALITY t(t, o)),
        'modos', pg_catalog.to_jsonb(p.proargmodes::pg_catalog.text[]),
        'nombres', pg_catalog.to_jsonb(p.proargnames),
        'ndefaults', p.pronargdefaults,
        'defaults', pg_catalog.md5(pg_catalog.pg_get_expr(p.proargdefaults, 0::pg_catalog.oid)),
        'variadic', p.provariadic::pg_catalog.regtype::pg_catalog.text,
        'config', (SELECT pg_catalog.jsonb_agg(c.c ORDER BY c.c COLLATE pg_catalog."C") FROM pg_catalog.unnest(p.proconfig) c(c)),
        'vol', p.provolatile::pg_catalog.text,
        'strict', p.proisstrict,
        'definer', p.prosecdef,
        'leakproof', p.proleakproof,
        'par', p.proparallel::pg_catalog.text,
        'cost', p.procost,
        'rows', p.prorows,
        'kind', p.prokind::pg_catalog.text,
        'lang', l.lanname::pg_catalog.text,
        'soporte', p.prosupport::pg_catalog.text,
        'bin', p.probin,
        'cuerpo', pg_catalog.md5(p.prosrc),
        'sqlbody', pg_catalog.md5(pg_catalog.pg_get_function_sqlbody(p.oid)),
        'trf', (SELECT pg_catalog.jsonb_agg(t.t::pg_catalog.regtype::pg_catalog.text ORDER BY t.o) FROM pg_catalog.unnest(p.protrftypes) WITH ORDINALITY t(t, o)),
        'rettipo', (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(a.attname::pg_catalog.text, pg_catalog.format_type(a.atttypid, a.atttypmod)) ORDER BY a.attnum)
          FROM pg_catalog.pg_type y JOIN pg_catalog.pg_attribute a ON a.attrelid OPERATOR(pg_catalog.=) y.typrelid
         WHERE y.oid OPERATOR(pg_catalog.=) p.prorettype AND a.attnum OPERATOR(pg_catalog.>) 0 AND NOT a.attisdropped),
        'homonimos', (SELECT pg_catalog.jsonb_agg(o.oid::pg_catalog.regprocedure::pg_catalog.text ORDER BY o.oid::pg_catalog.regprocedure::pg_catalog.text COLLATE pg_catalog."C")
          FROM pg_catalog.pg_proc o WHERE o.proname OPERATOR(pg_catalog.=) p.proname AND o.pronamespace OPERATOR(pg_catalog.=) p.pronamespace)) FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_language l ON l.oid OPERATOR(pg_catalog.=) p.prolang WHERE p.oid OPERATOR(pg_catalog.=) f.f)) FROM (SELECT DISTINCT dp.refobjid f
          FROM pg_catalog.pg_depend dp
         WHERE dp.refclassid OPERATOR(pg_catalog.=) 'pg_catalog.pg_proc'::pg_catalog.regclass
           AND ((dp.classid OPERATOR(pg_catalog.=) 'pg_catalog.pg_attrdef'::pg_catalog.regclass AND dp.objid OPERATOR(pg_catalog.=) ANY (SELECT d.oid FROM pg_catalog.pg_attrdef d WHERE d.adrelid OPERATOR(pg_catalog.=) cc_t))
             OR (dp.classid OPERATOR(pg_catalog.=) 'pg_catalog.pg_constraint'::pg_catalog.regclass AND dp.objid OPERATOR(pg_catalog.=) ANY (SELECT k.oid FROM pg_catalog.pg_constraint k WHERE k.conrelid OPERATOR(pg_catalog.=) cc_t))
             OR (dp.classid OPERATOR(pg_catalog.=) 'pg_catalog.pg_policy'::pg_catalog.regclass AND dp.objid OPERATOR(pg_catalog.=) ANY (SELECT o.oid FROM pg_catalog.pg_policy o WHERE o.polrelid OPERATOR(pg_catalog.=) cc_t))
             OR (dp.classid OPERATOR(pg_catalog.=) 'pg_catalog.pg_trigger'::pg_catalog.regclass AND dp.objid OPERATOR(pg_catalog.=) ANY (SELECT t.oid FROM pg_catalog.pg_trigger t WHERE t.tgrelid OPERATOR(pg_catalog.=) cc_t))
             OR (dp.classid OPERATOR(pg_catalog.=) 'pg_catalog.pg_class'::pg_catalog.regclass AND dp.objid OPERATOR(pg_catalog.=) ANY (SELECT i.indexrelid FROM pg_catalog.pg_index i WHERE i.indrelid OPERATOR(pg_catalog.=) cc_t)))) f)
      )::pg_catalog.text)
      from (select pg_catalog.to_regclass(x.nombre)::pg_catalog.oid cc_t) y where y.cc_t is not null), 'no existe')
    from tab x
  union all
  -- MCQ-01 y MCQ-04: lo que falta declarar en estas listas (tiene que salir vacío) y, por si no, la ficha de cada una
  -- (un nivel más: así no hace falta otra corrida para declararlas)
  select 4, 'cierre', 'faltan', (select x.j from falt x)::pg_catalog.text
  union all
  select 4, 'tabla+', z.z, COALESCE((select (SELECT pg_catalog.jsonb_build_object(
        'disp', (SELECT pg_catalog.jsonb_object_agg(t.tgname::pg_catalog.text, pg_catalog.jsonb_build_object('enabled', t.tgenabled::pg_catalog.text,
                   'def', pg_catalog.md5(pg_catalog.pg_get_triggerdef(t.oid)), 'funcion', t.tgfoid::pg_catalog.regprocedure::pg_catalog.text, 'ficha', (SELECT pg_catalog.jsonb_build_object(
        'dueño', pg_catalog.pg_get_userbyid(p.proowner)::pg_catalog.text,
        'dueño_rol', (SELECT pg_catalog.jsonb_build_object('super', r.rolsuper, 'bypassrls', r.rolbypassrls, 'login', r.rolcanlogin, 'inherit', r.rolinherit,
          'createrole', r.rolcreaterole, 'createdb', r.rolcreatedb, 'replication', r.rolreplication,
          'config', (SELECT pg_catalog.jsonb_agg(z.z ORDER BY z.z COLLATE pg_catalog."C") FROM pg_catalog.unnest(r.rolconfig) z(z)))
        FROM pg_catalog.pg_roles r WHERE r.oid OPERATOR(pg_catalog.=) p.proowner),
        'acl', pg_catalog.to_jsonb(p.proacl::pg_catalog.text[]),
        'ret', p.prorettype::pg_catalog.regtype::pg_catalog.text,
        'setof', p.proretset,
        'args', (SELECT pg_catalog.jsonb_agg(t.t::pg_catalog.regtype::pg_catalog.text ORDER BY t.o) FROM pg_catalog.unnest(p.proargtypes::pg_catalog.oid[]) WITH ORDINALITY t(t, o)),
        'todos', (SELECT pg_catalog.jsonb_agg(t.t::pg_catalog.regtype::pg_catalog.text ORDER BY t.o) FROM pg_catalog.unnest(p.proallargtypes) WITH ORDINALITY t(t, o)),
        'modos', pg_catalog.to_jsonb(p.proargmodes::pg_catalog.text[]),
        'nombres', pg_catalog.to_jsonb(p.proargnames),
        'ndefaults', p.pronargdefaults,
        'defaults', pg_catalog.md5(pg_catalog.pg_get_expr(p.proargdefaults, 0::pg_catalog.oid)),
        'variadic', p.provariadic::pg_catalog.regtype::pg_catalog.text,
        'config', (SELECT pg_catalog.jsonb_agg(c.c ORDER BY c.c COLLATE pg_catalog."C") FROM pg_catalog.unnest(p.proconfig) c(c)),
        'vol', p.provolatile::pg_catalog.text,
        'strict', p.proisstrict,
        'definer', p.prosecdef,
        'leakproof', p.proleakproof,
        'par', p.proparallel::pg_catalog.text,
        'cost', p.procost,
        'rows', p.prorows,
        'kind', p.prokind::pg_catalog.text,
        'lang', l.lanname::pg_catalog.text,
        'soporte', p.prosupport::pg_catalog.text,
        'bin', p.probin,
        'cuerpo', pg_catalog.md5(p.prosrc),
        'sqlbody', pg_catalog.md5(pg_catalog.pg_get_function_sqlbody(p.oid)),
        'trf', (SELECT pg_catalog.jsonb_agg(t.t::pg_catalog.regtype::pg_catalog.text ORDER BY t.o) FROM pg_catalog.unnest(p.protrftypes) WITH ORDINALITY t(t, o)),
        'rettipo', (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(a.attname::pg_catalog.text, pg_catalog.format_type(a.atttypid, a.atttypmod)) ORDER BY a.attnum)
          FROM pg_catalog.pg_type y JOIN pg_catalog.pg_attribute a ON a.attrelid OPERATOR(pg_catalog.=) y.typrelid
         WHERE y.oid OPERATOR(pg_catalog.=) p.prorettype AND a.attnum OPERATOR(pg_catalog.>) 0 AND NOT a.attisdropped),
        'homonimos', (SELECT pg_catalog.jsonb_agg(o.oid::pg_catalog.regprocedure::pg_catalog.text ORDER BY o.oid::pg_catalog.regprocedure::pg_catalog.text COLLATE pg_catalog."C")
          FROM pg_catalog.pg_proc o WHERE o.proname OPERATOR(pg_catalog.=) p.proname AND o.pronamespace OPERATOR(pg_catalog.=) p.pronamespace)) FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_language l ON l.oid OPERATOR(pg_catalog.=) p.prolang WHERE p.oid OPERATOR(pg_catalog.=) t.tgfoid)))
          FROM pg_catalog.pg_trigger t WHERE t.tgrelid OPERATOR(pg_catalog.=) cc_t AND NOT t.tgisinternal),
        'internos', (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(k.conname::pg_catalog.text, t.tgrelid::pg_catalog.regclass::pg_catalog.text, t.tgtype,
                   t.tgenabled::pg_catalog.text, t.tgfoid::pg_catalog.regprocedure::pg_catalog.text, t.tgdeferrable, t.tginitdeferred)
                   ORDER BY k.conname::pg_catalog.text COLLATE pg_catalog."C", t.tgrelid::pg_catalog.regclass::pg_catalog.text COLLATE pg_catalog."C", t.tgtype, t.tgfoid::pg_catalog.regprocedure::pg_catalog.text COLLATE pg_catalog."C")
          FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_constraint k ON k.oid OPERATOR(pg_catalog.=) t.tgconstraint
         WHERE t.tgisinternal AND (k.conrelid OPERATOR(pg_catalog.=) cc_t OR k.confrelid OPERATOR(pg_catalog.=) cc_t)),
        'restricciones', (SELECT pg_catalog.jsonb_object_agg(k.conname::pg_catalog.text, pg_catalog.jsonb_build_object('tipo', k.contype::pg_catalog.text, 'validada', k.convalidated,
                   'diferible', k.condeferrable, 'diferida', k.condeferred, 'local', k.conislocal, 'noinherit', k.connoinherit, 'def', pg_catalog.md5(pg_catalog.pg_get_constraintdef(k.oid))))
          FROM pg_catalog.pg_constraint k WHERE k.conrelid OPERATOR(pg_catalog.=) cc_t),
        'indices', (SELECT pg_catalog.jsonb_object_agg(c.relname::pg_catalog.text, pg_catalog.jsonb_build_object('def', pg_catalog.md5(pg_catalog.pg_get_indexdef(i.indexrelid)),
                   'unico', i.indisunique, 'primaria', i.indisprimary, 'exclusion', i.indisexclusion, 'inmediato', i.indimmediate, 'valido', i.indisvalid, 'listo', i.indisready, 'vivo', i.indislive,
                   'replica', i.indisreplident))
          FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class c ON c.oid OPERATOR(pg_catalog.=) i.indexrelid WHERE i.indrelid OPERATOR(pg_catalog.=) cc_t),
        'columnas', (SELECT pg_catalog.jsonb_object_agg(a.attname::pg_catalog.text, pg_catalog.jsonb_build_object('tipo', pg_catalog.format_type(a.atttypid, a.atttypmod),
                   'notnull', a.attnotnull, 'default', pg_catalog.md5(pg_catalog.pg_get_expr(d.adbin, d.adrelid)), 'identidad', a.attidentity::pg_catalog.text,
                   'generada', a.attgenerated::pg_catalog.text, 'colacion', a.attcollation::pg_catalog.regcollation::pg_catalog.text, 'acl', pg_catalog.to_jsonb(a.attacl::pg_catalog.text[]),
                   'dominio', (SELECT pg_catalog.jsonb_build_object('base', pg_catalog.format_type(y.typbasetype, y.typtypmod), 'notnull', y.typnotnull, 'default', pg_catalog.md5(y.typdefault),
                       'dueño', pg_catalog.pg_get_userbyid(y.typowner)::pg_catalog.text, 'acl', pg_catalog.to_jsonb(y.typacl::pg_catalog.text[]),
                       'checks', (SELECT pg_catalog.jsonb_object_agg(k.conname::pg_catalog.text, pg_catalog.jsonb_build_object('def', pg_catalog.md5(pg_catalog.pg_get_constraintdef(k.oid)), 'validada', k.convalidated))
                         FROM pg_catalog.pg_constraint k WHERE k.contypid OPERATOR(pg_catalog.=) y.oid))
                     FROM pg_catalog.pg_type y WHERE y.oid OPERATOR(pg_catalog.=) a.atttypid AND y.typtype OPERATOR(pg_catalog.=) 'd')))
          FROM pg_catalog.pg_attribute a LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid OPERATOR(pg_catalog.=) a.attrelid AND d.adnum OPERATOR(pg_catalog.=) a.attnum
         WHERE a.attrelid OPERATOR(pg_catalog.=) cc_t AND a.attnum OPERATOR(pg_catalog.>) 0 AND NOT a.attisdropped),
        'orden', (SELECT pg_catalog.jsonb_agg(a.attname::pg_catalog.text ORDER BY a.attnum) FROM pg_catalog.pg_attribute a
         WHERE a.attrelid OPERATOR(pg_catalog.=) cc_t AND a.attnum OPERATOR(pg_catalog.>) 0 AND NOT a.attisdropped),
        'hijas', (SELECT pg_catalog.count(*) FROM pg_catalog.pg_inherits i WHERE i.inhparent OPERATOR(pg_catalog.=) cc_t),
        'padres', (SELECT pg_catalog.jsonb_agg(i.inhparent::pg_catalog.regclass::pg_catalog.text ORDER BY i.inhseqno) FROM pg_catalog.pg_inherits i WHERE i.inhrelid OPERATOR(pg_catalog.=) cc_t),
        'vistas', (SELECT pg_catalog.jsonb_object_agg(v.oid::pg_catalog.regclass::pg_catalog.text, pg_catalog.jsonb_build_object('tipo', v.relkind::pg_catalog.text,
                   'dueño', pg_catalog.pg_get_userbyid(v.relowner)::pg_catalog.text, 'acl', pg_catalog.to_jsonb(v.relacl::pg_catalog.text[]),
                   'opciones', (SELECT pg_catalog.jsonb_agg(z.z ORDER BY z.z COLLATE pg_catalog."C") FROM pg_catalog.unnest(v.reloptions) z(z)),
                   'def', pg_catalog.md5(pg_catalog.pg_get_viewdef(v.oid))))
          FROM pg_catalog.pg_class v WHERE v.oid OPERATOR(pg_catalog.=) ANY (SELECT w.ev_class FROM pg_catalog.pg_depend d JOIN pg_catalog.pg_rewrite w ON w.oid OPERATOR(pg_catalog.=) d.objid
                 WHERE d.classid OPERATOR(pg_catalog.=) 'pg_catalog.pg_rewrite'::pg_catalog.regclass AND d.refclassid OPERATOR(pg_catalog.=) 'pg_catalog.pg_class'::pg_catalog.regclass
                   AND d.refobjid OPERATOR(pg_catalog.=) cc_t AND w.ev_class OPERATOR(pg_catalog.<>) cc_t)),
        'publicaciones', (SELECT pg_catalog.jsonb_object_agg(b.pubname::pg_catalog.text, pg_catalog.jsonb_build_object('todas', b.puballtables, 'insert', b.pubinsert, 'update', b.pubupdate,
                   'delete', b.pubdelete, 'truncate', b.pubtruncate, 'raiz', b.pubviaroot, 'dueño', pg_catalog.pg_get_userbyid(b.pubowner)::pg_catalog.text,
                   'esquema', EXISTS (SELECT FROM pg_catalog.pg_publication_namespace n JOIN pg_catalog.pg_class c ON c.relnamespace OPERATOR(pg_catalog.=) n.pnnspid
                                WHERE n.pnpubid OPERATOR(pg_catalog.=) b.oid AND c.oid OPERATOR(pg_catalog.=) cc_t),
                   'tabla', (SELECT pg_catalog.jsonb_build_object(
                       'columnas', (SELECT pg_catalog.jsonb_agg(a.attname::pg_catalog.text ORDER BY x.n) FROM pg_catalog.unnest(r.prattrs::pg_catalog.int2[]) WITH ORDINALITY x(a, n)
                                    JOIN pg_catalog.pg_attribute a ON a.attrelid OPERATOR(pg_catalog.=) r.prrelid AND a.attnum OPERATOR(pg_catalog.=) x.a),
                       'filtro', pg_catalog.md5(pg_catalog.pg_get_expr(r.prqual, r.prrelid)))
                     FROM pg_catalog.pg_publication_rel r WHERE r.prpubid OPERATOR(pg_catalog.=) b.oid AND r.prrelid OPERATOR(pg_catalog.=) cc_t)))
          FROM pg_catalog.pg_publication b
         WHERE b.puballtables OR EXISTS (SELECT FROM pg_catalog.pg_publication_rel r WHERE r.prpubid OPERATOR(pg_catalog.=) b.oid AND r.prrelid OPERATOR(pg_catalog.=) cc_t)
            OR EXISTS (SELECT FROM pg_catalog.pg_publication_namespace n JOIN pg_catalog.pg_class c ON c.relnamespace OPERATOR(pg_catalog.=) n.pnnspid
                        WHERE n.pnpubid OPERATOR(pg_catalog.=) b.oid AND c.oid OPERATOR(pg_catalog.=) cc_t)),
        'replident', (SELECT c.relreplident::pg_catalog.text FROM pg_catalog.pg_class c WHERE c.oid OPERATOR(pg_catalog.=) cc_t),
        'persistencia', (SELECT c.relpersistence::pg_catalog.text FROM pg_catalog.pg_class c WHERE c.oid OPERATOR(pg_catalog.=) cc_t),
        'opciones', (SELECT (SELECT pg_catalog.jsonb_agg(z.z ORDER BY z.z COLLATE pg_catalog."C") FROM pg_catalog.unnest(c.reloptions) z(z)) FROM pg_catalog.pg_class c WHERE c.oid OPERATOR(pg_catalog.=) cc_t),
        'dueño_rol', (SELECT (SELECT pg_catalog.jsonb_build_object('super', r.rolsuper, 'bypassrls', r.rolbypassrls, 'login', r.rolcanlogin, 'inherit', r.rolinherit,
          'createrole', r.rolcreaterole, 'createdb', r.rolcreatedb, 'replication', r.rolreplication,
          'config', (SELECT pg_catalog.jsonb_agg(z.z ORDER BY z.z COLLATE pg_catalog."C") FROM pg_catalog.unnest(r.rolconfig) z(z)))
        FROM pg_catalog.pg_roles r WHERE r.oid OPERATOR(pg_catalog.=) c.relowner) FROM pg_catalog.pg_class c WHERE c.oid OPERATOR(pg_catalog.=) cc_t),
        'dueño', (SELECT pg_catalog.pg_get_userbyid(c.relowner)::pg_catalog.text FROM pg_catalog.pg_class c WHERE c.oid OPERATOR(pg_catalog.=) cc_t),
        'tipo', (SELECT c.relkind::pg_catalog.text FROM pg_catalog.pg_class c WHERE c.oid OPERATOR(pg_catalog.=) cc_t),
        'acl', (SELECT pg_catalog.to_jsonb(c.relacl::pg_catalog.text[]) FROM pg_catalog.pg_class c WHERE c.oid OPERATOR(pg_catalog.=) cc_t),
        'rls', (SELECT c.relrowsecurity FROM pg_catalog.pg_class c WHERE c.oid OPERATOR(pg_catalog.=) cc_t),
        'force', (SELECT c.relforcerowsecurity FROM pg_catalog.pg_class c WHERE c.oid OPERATOR(pg_catalog.=) cc_t),
        'pol', (SELECT pg_catalog.jsonb_object_agg(o.polname::pg_catalog.text, pg_catalog.jsonb_build_object('cmd', o.polcmd::pg_catalog.text, 'permisiva', o.polpermissive,
                   'roles', (SELECT pg_catalog.jsonb_agg(z.n ORDER BY z.n COLLATE pg_catalog."C") FROM (SELECT CASE WHEN r.r OPERATOR(pg_catalog.=) 0::pg_catalog.oid THEN 'public'
                      ELSE pg_catalog.pg_get_userbyid(r.r)::pg_catalog.text END n FROM pg_catalog.unnest(o.polroles) r(r)) z),
                   'using', pg_catalog.md5(pg_catalog.pg_get_expr(o.polqual, o.polrelid)), 'check', pg_catalog.md5(pg_catalog.pg_get_expr(o.polwithcheck, o.polrelid))))
          FROM pg_catalog.pg_policy o WHERE o.polrelid OPERATOR(pg_catalog.=) cc_t),
        'reglas', (SELECT pg_catalog.jsonb_object_agg(w.rulename::pg_catalog.text, pg_catalog.jsonb_build_object('enabled', w.ev_enabled::pg_catalog.text, 'def', pg_catalog.md5(pg_catalog.pg_get_ruledef(w.oid))))
          FROM pg_catalog.pg_rewrite w WHERE w.ev_class OPERATOR(pg_catalog.=) cc_t AND w.rulename OPERATOR(pg_catalog.<>) '_RETURN'),
        'dependencias', (SELECT pg_catalog.jsonb_object_agg(f.f::pg_catalog.regprocedure::pg_catalog.text, (SELECT pg_catalog.jsonb_build_object(
        'dueño', pg_catalog.pg_get_userbyid(p.proowner)::pg_catalog.text,
        'dueño_rol', (SELECT pg_catalog.jsonb_build_object('super', r.rolsuper, 'bypassrls', r.rolbypassrls, 'login', r.rolcanlogin, 'inherit', r.rolinherit,
          'createrole', r.rolcreaterole, 'createdb', r.rolcreatedb, 'replication', r.rolreplication,
          'config', (SELECT pg_catalog.jsonb_agg(z.z ORDER BY z.z COLLATE pg_catalog."C") FROM pg_catalog.unnest(r.rolconfig) z(z)))
        FROM pg_catalog.pg_roles r WHERE r.oid OPERATOR(pg_catalog.=) p.proowner),
        'acl', pg_catalog.to_jsonb(p.proacl::pg_catalog.text[]),
        'ret', p.prorettype::pg_catalog.regtype::pg_catalog.text,
        'setof', p.proretset,
        'args', (SELECT pg_catalog.jsonb_agg(t.t::pg_catalog.regtype::pg_catalog.text ORDER BY t.o) FROM pg_catalog.unnest(p.proargtypes::pg_catalog.oid[]) WITH ORDINALITY t(t, o)),
        'todos', (SELECT pg_catalog.jsonb_agg(t.t::pg_catalog.regtype::pg_catalog.text ORDER BY t.o) FROM pg_catalog.unnest(p.proallargtypes) WITH ORDINALITY t(t, o)),
        'modos', pg_catalog.to_jsonb(p.proargmodes::pg_catalog.text[]),
        'nombres', pg_catalog.to_jsonb(p.proargnames),
        'ndefaults', p.pronargdefaults,
        'defaults', pg_catalog.md5(pg_catalog.pg_get_expr(p.proargdefaults, 0::pg_catalog.oid)),
        'variadic', p.provariadic::pg_catalog.regtype::pg_catalog.text,
        'config', (SELECT pg_catalog.jsonb_agg(c.c ORDER BY c.c COLLATE pg_catalog."C") FROM pg_catalog.unnest(p.proconfig) c(c)),
        'vol', p.provolatile::pg_catalog.text,
        'strict', p.proisstrict,
        'definer', p.prosecdef,
        'leakproof', p.proleakproof,
        'par', p.proparallel::pg_catalog.text,
        'cost', p.procost,
        'rows', p.prorows,
        'kind', p.prokind::pg_catalog.text,
        'lang', l.lanname::pg_catalog.text,
        'soporte', p.prosupport::pg_catalog.text,
        'bin', p.probin,
        'cuerpo', pg_catalog.md5(p.prosrc),
        'sqlbody', pg_catalog.md5(pg_catalog.pg_get_function_sqlbody(p.oid)),
        'trf', (SELECT pg_catalog.jsonb_agg(t.t::pg_catalog.regtype::pg_catalog.text ORDER BY t.o) FROM pg_catalog.unnest(p.protrftypes) WITH ORDINALITY t(t, o)),
        'rettipo', (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(a.attname::pg_catalog.text, pg_catalog.format_type(a.atttypid, a.atttypmod)) ORDER BY a.attnum)
          FROM pg_catalog.pg_type y JOIN pg_catalog.pg_attribute a ON a.attrelid OPERATOR(pg_catalog.=) y.typrelid
         WHERE y.oid OPERATOR(pg_catalog.=) p.prorettype AND a.attnum OPERATOR(pg_catalog.>) 0 AND NOT a.attisdropped),
        'homonimos', (SELECT pg_catalog.jsonb_agg(o.oid::pg_catalog.regprocedure::pg_catalog.text ORDER BY o.oid::pg_catalog.regprocedure::pg_catalog.text COLLATE pg_catalog."C")
          FROM pg_catalog.pg_proc o WHERE o.proname OPERATOR(pg_catalog.=) p.proname AND o.pronamespace OPERATOR(pg_catalog.=) p.pronamespace)) FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_language l ON l.oid OPERATOR(pg_catalog.=) p.prolang WHERE p.oid OPERATOR(pg_catalog.=) f.f)) FROM (SELECT DISTINCT dp.refobjid f
          FROM pg_catalog.pg_depend dp
         WHERE dp.refclassid OPERATOR(pg_catalog.=) 'pg_catalog.pg_proc'::pg_catalog.regclass
           AND ((dp.classid OPERATOR(pg_catalog.=) 'pg_catalog.pg_attrdef'::pg_catalog.regclass AND dp.objid OPERATOR(pg_catalog.=) ANY (SELECT d.oid FROM pg_catalog.pg_attrdef d WHERE d.adrelid OPERATOR(pg_catalog.=) cc_t))
             OR (dp.classid OPERATOR(pg_catalog.=) 'pg_catalog.pg_constraint'::pg_catalog.regclass AND dp.objid OPERATOR(pg_catalog.=) ANY (SELECT k.oid FROM pg_catalog.pg_constraint k WHERE k.conrelid OPERATOR(pg_catalog.=) cc_t))
             OR (dp.classid OPERATOR(pg_catalog.=) 'pg_catalog.pg_policy'::pg_catalog.regclass AND dp.objid OPERATOR(pg_catalog.=) ANY (SELECT o.oid FROM pg_catalog.pg_policy o WHERE o.polrelid OPERATOR(pg_catalog.=) cc_t))
             OR (dp.classid OPERATOR(pg_catalog.=) 'pg_catalog.pg_trigger'::pg_catalog.regclass AND dp.objid OPERATOR(pg_catalog.=) ANY (SELECT t.oid FROM pg_catalog.pg_trigger t WHERE t.tgrelid OPERATOR(pg_catalog.=) cc_t))
             OR (dp.classid OPERATOR(pg_catalog.=) 'pg_catalog.pg_class'::pg_catalog.regclass AND dp.objid OPERATOR(pg_catalog.=) ANY (SELECT i.indexrelid FROM pg_catalog.pg_index i WHERE i.indrelid OPERATOR(pg_catalog.=) cc_t)))) f)
      )::pg_catalog.text)
      from (select pg_catalog.to_regclass(z.z)::pg_catalog.oid cc_t) y where y.cc_t is not null), 'no existe')
    from falt x, pg_catalog.jsonb_array_elements_text(x.j OPERATOR(pg_catalog.->) 'tablas') z(z)
  union all
  select 4, 'funcion+', z.z, COALESCE((select pg_catalog.jsonb_build_object(
        'dueño', pg_catalog.pg_get_userbyid(p.proowner)::pg_catalog.text,
        'dueño_rol', (SELECT pg_catalog.jsonb_build_object('super', r.rolsuper, 'bypassrls', r.rolbypassrls, 'login', r.rolcanlogin, 'inherit', r.rolinherit,
          'createrole', r.rolcreaterole, 'createdb', r.rolcreatedb, 'replication', r.rolreplication,
          'config', (SELECT pg_catalog.jsonb_agg(z.z ORDER BY z.z COLLATE pg_catalog."C") FROM pg_catalog.unnest(r.rolconfig) z(z)))
        FROM pg_catalog.pg_roles r WHERE r.oid OPERATOR(pg_catalog.=) p.proowner),
        'acl', pg_catalog.to_jsonb(p.proacl::pg_catalog.text[]),
        'ret', p.prorettype::pg_catalog.regtype::pg_catalog.text,
        'setof', p.proretset,
        'args', (SELECT pg_catalog.jsonb_agg(t.t::pg_catalog.regtype::pg_catalog.text ORDER BY t.o) FROM pg_catalog.unnest(p.proargtypes::pg_catalog.oid[]) WITH ORDINALITY t(t, o)),
        'todos', (SELECT pg_catalog.jsonb_agg(t.t::pg_catalog.regtype::pg_catalog.text ORDER BY t.o) FROM pg_catalog.unnest(p.proallargtypes) WITH ORDINALITY t(t, o)),
        'modos', pg_catalog.to_jsonb(p.proargmodes::pg_catalog.text[]),
        'nombres', pg_catalog.to_jsonb(p.proargnames),
        'ndefaults', p.pronargdefaults,
        'defaults', pg_catalog.md5(pg_catalog.pg_get_expr(p.proargdefaults, 0::pg_catalog.oid)),
        'variadic', p.provariadic::pg_catalog.regtype::pg_catalog.text,
        'config', (SELECT pg_catalog.jsonb_agg(c.c ORDER BY c.c COLLATE pg_catalog."C") FROM pg_catalog.unnest(p.proconfig) c(c)),
        'vol', p.provolatile::pg_catalog.text,
        'strict', p.proisstrict,
        'definer', p.prosecdef,
        'leakproof', p.proleakproof,
        'par', p.proparallel::pg_catalog.text,
        'cost', p.procost,
        'rows', p.prorows,
        'kind', p.prokind::pg_catalog.text,
        'lang', l.lanname::pg_catalog.text,
        'soporte', p.prosupport::pg_catalog.text,
        'bin', p.probin,
        'cuerpo', pg_catalog.md5(p.prosrc),
        'sqlbody', pg_catalog.md5(pg_catalog.pg_get_function_sqlbody(p.oid)),
        'trf', (SELECT pg_catalog.jsonb_agg(t.t::pg_catalog.regtype::pg_catalog.text ORDER BY t.o) FROM pg_catalog.unnest(p.protrftypes) WITH ORDINALITY t(t, o)),
        'rettipo', (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(a.attname::pg_catalog.text, pg_catalog.format_type(a.atttypid, a.atttypmod)) ORDER BY a.attnum)
          FROM pg_catalog.pg_type y JOIN pg_catalog.pg_attribute a ON a.attrelid OPERATOR(pg_catalog.=) y.typrelid
         WHERE y.oid OPERATOR(pg_catalog.=) p.prorettype AND a.attnum OPERATOR(pg_catalog.>) 0 AND NOT a.attisdropped),
        'homonimos', (SELECT pg_catalog.jsonb_agg(o.oid::pg_catalog.regprocedure::pg_catalog.text ORDER BY o.oid::pg_catalog.regprocedure::pg_catalog.text COLLATE pg_catalog."C")
          FROM pg_catalog.pg_proc o WHERE o.proname OPERATOR(pg_catalog.=) p.proname AND o.pronamespace OPERATOR(pg_catalog.=) p.pronamespace))::pg_catalog.text
      from pg_catalog.pg_proc p join pg_catalog.pg_language l on l.oid OPERATOR(pg_catalog.=) p.prolang
     where p.oid OPERATOR(pg_catalog.=) pg_catalog.to_regprocedure(z.z)), 'no existe')
    from falt x, pg_catalog.jsonb_array_elements_text(x.j OPERATOR(pg_catalog.->) 'funciones') z(z)
  union all
  -- CANON1-02: una CUENTA de huérfanos por cada FK de las tablas (solo un número; ni un id)
  select 5, 'huerfanos', k.conname::pg_catalog.text, (pg_catalog.xpath('/row/n/text()', pg_catalog.query_to_xml(pg_catalog.format(
         'SELECT pg_catalog.count(*) n FROM %s c WHERE %s AND NOT EXISTS (SELECT 1 FROM %s p WHERE %s)', k.conrelid::pg_catalog.regclass,
         (SELECT CASE WHEN k.confmatchtype OPERATOR(pg_catalog.=) 'f'
                      THEN '(NOT (' OPERATOR(pg_catalog.||) pg_catalog.string_agg(pg_catalog.format('c.%I IS NULL', a.attname), ' AND ' ORDER BY x.n) OPERATOR(pg_catalog.||) '))'
                      ELSE pg_catalog.string_agg(pg_catalog.format('c.%I IS NOT NULL', a.attname), ' AND ' ORDER BY x.n) END
            FROM pg_catalog.unnest(k.conkey) WITH ORDINALITY x(a, n) JOIN pg_catalog.pg_attribute a ON a.attrelid OPERATOR(pg_catalog.=) k.conrelid AND a.attnum OPERATOR(pg_catalog.=) x.a),
         k.confrelid::pg_catalog.regclass,
         (SELECT pg_catalog.string_agg(pg_catalog.format('p.%I OPERATOR(pg_catalog.=) c.%I', pa.attname, ca.attname), ' AND ' ORDER BY x.n)
            FROM ROWS FROM (pg_catalog.unnest(k.conkey), pg_catalog.unnest(k.confkey)) WITH ORDINALITY x(a, b, n)
            JOIN pg_catalog.pg_attribute ca ON ca.attrelid OPERATOR(pg_catalog.=) k.conrelid AND ca.attnum OPERATOR(pg_catalog.=) x.a
            JOIN pg_catalog.pg_attribute pa ON pa.attrelid OPERATOR(pg_catalog.=) k.confrelid AND pa.attnum OPERATOR(pg_catalog.=) x.b)),
         false, true, '')))[1]::pg_catalog.text
    from pg_catalog.pg_constraint k
   where k.contype OPERATOR(pg_catalog.=) 'f' and exists (select from tab x where k.conrelid OPERATOR(pg_catalog.=) pg_catalog.to_regclass(x.nombre) or k.confrelid OPERATOR(pg_catalog.=) pg_catalog.to_regclass(x.nombre))
  union all
  select 6, 'FIN', 's-contexto', ''
)
select f.seccion, f.objeto, f.valor from filas f where (select g.ok from guarda g) order by f.o, f.objeto collate pg_catalog."C";
rollback;
