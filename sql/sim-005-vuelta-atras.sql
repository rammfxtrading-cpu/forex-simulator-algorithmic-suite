-- ============================================================================
-- sim-005 · VUELTA ATRAS: quita el disparador sim_sessions_progreso_monotono y su funcion
-- Solo si estan con la definicion de la sim-005 (o ya no estan: idempotente); con otra, PARA (V005-01) y no quita nada.
-- Mismo contexto completo que la sim-005 y con los mismos nombres (partida = sin el disparador; destino = con el). Atomica.
-- Errores V005-NN.
-- Tras quitarla, last_timestamp puede volver a bajar (SIMGOTO3-01): el cliente sigue sin bajarlo (lib/sim/progreso.js).
-- ⛔ NO se aplica por el buzon: la aplica Ramon con el OK del CTO, despues de Astra.
-- GENERADA por pruebas/genera-sim-005.mjs: NO editar a mano.
-- ============================================================================
begin;
set local search_path = pg_catalog, pg_temp;
set local lock_timeout = '5s';
DO $v005$
DECLARE
  -- CONTEXTO COMPLETO (revisiones-suite/guardas/contexto.mjs v4): lo esperado, ⟦HUECO s-contexto v4⟧ hasta medirlo en produccion
  -- (sql/consultas/s-contexto-sim.sql); el destino, el de produccion con solo lo que cambia esta migracion
  CC_PREFIJO constant pg_catalog.text := 'V005';
  CC_FUNCIONES constant pg_catalog.text[] := '{}';
  CC_GRAFO constant pg_catalog.text := '⟦HUECO s-contexto v4⟧';
  CC_DISP_PARTIDA constant pg_catalog.text[] := ARRAY[
    ARRAY['public.sim_sessions', '⟦HUECO s-contexto v4⟧'],
    ARRAY['public.profiles', '⟦HUECO s-contexto v4⟧'],
    ARRAY['public.session_chart_config', '⟦HUECO s-contexto v4⟧'],
    ARRAY['public.session_drawings', '⟦HUECO s-contexto v4⟧'],
    ARRAY['public.sim_arrendamientos', '⟦HUECO s-contexto v4⟧'],
    ARRAY['public.sim_escrituras_v0', '⟦HUECO s-contexto v4⟧'],
    ARRAY['public.sim_escrituras_v0_marcas', '⟦HUECO s-contexto v4⟧'],
    ARRAY['public.sim_eventos', '⟦HUECO s-contexto v4⟧'],
    ARRAY['public.sim_recibos', '⟦HUECO s-contexto v4⟧'],
    ARRAY['public.sim_trades', '⟦HUECO s-contexto v4⟧'],
    ARRAY['public.ia_alertas', '⟦HUECO s-contexto v4⟧'],
    ARRAY['public.ia_borrados', '⟦HUECO s-contexto v4⟧'],
    ARRAY['public.ia_consentimiento', '⟦HUECO s-contexto v4⟧'],
    ARRAY['public.ia_conversaciones', '⟦HUECO s-contexto v4⟧'],
    ARRAY['public.ia_notas_mentor', '⟦HUECO s-contexto v4⟧'],
    ARRAY['public.ia_operaciones', '⟦HUECO s-contexto v4⟧'],
    ARRAY['public.ia_perfil_alumno', '⟦HUECO s-contexto v4⟧'],
    ARRAY['public.ia_recados', '⟦HUECO s-contexto v4⟧'],
    ARRAY['public.ia_turnos', '⟦HUECO s-contexto v4⟧'],
    ARRAY['public.ia_uso', '⟦HUECO s-contexto v4⟧'],
    ARRAY['public.macro_conversaciones', '⟦HUECO s-contexto v4⟧'],
    ARRAY['public.macro_ia_uso', '⟦HUECO s-contexto v4⟧'],
    ARRAY['public.macro_planes', '⟦HUECO s-contexto v4⟧'],
    ARRAY['public.notas', '⟦HUECO s-contexto v4⟧'],
    ARRAY['public.sim_alumnos', '⟦HUECO s-contexto v4⟧'],
    ARRAY['public.trades', '⟦HUECO s-contexto v4⟧']
  ];
  CC_DISP_DESTINO constant pg_catalog.text[] := ARRAY[
    ARRAY['public.sim_sessions', '⟦HUECO s-contexto v4⟧'],
    ARRAY['public.profiles', '⟦HUECO s-contexto v4⟧'],
    ARRAY['public.session_chart_config', '⟦HUECO s-contexto v4⟧'],
    ARRAY['public.session_drawings', '⟦HUECO s-contexto v4⟧'],
    ARRAY['public.sim_arrendamientos', '⟦HUECO s-contexto v4⟧'],
    ARRAY['public.sim_escrituras_v0', '⟦HUECO s-contexto v4⟧'],
    ARRAY['public.sim_escrituras_v0_marcas', '⟦HUECO s-contexto v4⟧'],
    ARRAY['public.sim_eventos', '⟦HUECO s-contexto v4⟧'],
    ARRAY['public.sim_recibos', '⟦HUECO s-contexto v4⟧'],
    ARRAY['public.sim_trades', '⟦HUECO s-contexto v4⟧'],
    ARRAY['public.ia_alertas', '⟦HUECO s-contexto v4⟧'],
    ARRAY['public.ia_borrados', '⟦HUECO s-contexto v4⟧'],
    ARRAY['public.ia_consentimiento', '⟦HUECO s-contexto v4⟧'],
    ARRAY['public.ia_conversaciones', '⟦HUECO s-contexto v4⟧'],
    ARRAY['public.ia_notas_mentor', '⟦HUECO s-contexto v4⟧'],
    ARRAY['public.ia_operaciones', '⟦HUECO s-contexto v4⟧'],
    ARRAY['public.ia_perfil_alumno', '⟦HUECO s-contexto v4⟧'],
    ARRAY['public.ia_recados', '⟦HUECO s-contexto v4⟧'],
    ARRAY['public.ia_turnos', '⟦HUECO s-contexto v4⟧'],
    ARRAY['public.ia_uso', '⟦HUECO s-contexto v4⟧'],
    ARRAY['public.macro_conversaciones', '⟦HUECO s-contexto v4⟧'],
    ARRAY['public.macro_ia_uso', '⟦HUECO s-contexto v4⟧'],
    ARRAY['public.macro_planes', '⟦HUECO s-contexto v4⟧'],
    ARRAY['public.notas', '⟦HUECO s-contexto v4⟧'],
    ARRAY['public.sim_alumnos', '⟦HUECO s-contexto v4⟧'],
    ARRAY['public.trades', '⟦HUECO s-contexto v4⟧']
  ];
  CC_DISPARADORES pg_catalog.text[];
  CUERPO constant pg_catalog.text := $c$
BEGIN
  -- sim-005 (SIMGOTO3-01, orden 1-090): last_timestamp nunca baja, venga de donde venga la escritura (el cierre
  -- atomico, el guardado del progreso o cualquier otro UPDATE). NULL tampoco borra un progreso ya guardado
  IF OLD.last_timestamp IS NOT NULL AND (NEW.last_timestamp IS NULL OR NEW.last_timestamp OPERATOR(pg_catalog.<) OLD.last_timestamp) THEN
    NEW.last_timestamp := OLD.last_timestamp;
  END IF;
  RETURN NEW;
END
$c$;
  DISPARADOR constant pg_catalog.text := 'CREATE TRIGGER sim_sessions_progreso_monotono BEFORE UPDATE OF last_timestamp ON public.sim_sessions FOR EACH ROW EXECUTE FUNCTION public.sim_sessions_progreso_monotono()';
  hay_f pg_catalog.int4;
  hay_t pg_catalog.int4;
  f_ok pg_catalog.bool;
  t_ok pg_catalog.bool;
  estado pg_catalog.text;
BEGIN
  -- 00 · la guarda: el contexto de resolucion, lo primero
  IF pg_catalog.current_setting('search_path') OPERATOR(pg_catalog.<>) 'pg_catalog, pg_temp' THEN
    RAISE EXCEPTION 'V005-00: el search_path no es «pg_catalog, pg_temp»: pegala ENTERA, con su BEGIN. Nada aplicado';
  END IF;
  -- 01 · en que estado esta (lo demas lo decide el contexto completo)
  SELECT pg_catalog.count(*)::pg_catalog.int4, pg_catalog.bool_and(p.prosrc OPERATOR(pg_catalog.=) CUERPO AND NOT p.prosecdef
           AND p.provolatile OPERATOR(pg_catalog.=) 'v' AND p.proconfig OPERATOR(pg_catalog.=) ARRAY['search_path=""']::pg_catalog.text[]
           AND p.prorettype OPERATOR(pg_catalog.=) 'pg_catalog.trigger'::pg_catalog.regtype AND p.pronargs OPERATOR(pg_catalog.=) 0)
    INTO hay_f, f_ok
    FROM pg_catalog.pg_proc p
   WHERE p.proname OPERATOR(pg_catalog.=) 'sim_sessions_progreso_monotono' AND p.pronamespace OPERATOR(pg_catalog.=) 'public'::pg_catalog.regnamespace;
  SELECT pg_catalog.count(*)::pg_catalog.int4, pg_catalog.bool_and(pg_catalog.pg_get_triggerdef(t.oid) OPERATOR(pg_catalog.=) DISPARADOR AND t.tgenabled OPERATOR(pg_catalog.=) 'O')
    INTO hay_t, t_ok
    FROM pg_catalog.pg_trigger t
   WHERE t.tgname OPERATOR(pg_catalog.=) 'sim_sessions_progreso_monotono' AND t.tgrelid OPERATOR(pg_catalog.=) 'public.sim_sessions'::pg_catalog.regclass;
  IF hay_f OPERATOR(pg_catalog.=) 0 AND hay_t OPERATOR(pg_catalog.=) 0 THEN estado := 'partida';
  ELSIF hay_f OPERATOR(pg_catalog.=) 1 AND f_ok AND hay_t OPERATOR(pg_catalog.=) 1 AND t_ok THEN estado := 'destino';
  ELSE
    RAISE EXCEPTION 'V005-01: ni partida ni destino (funcion: % %, disparador: % %). Nada cambiado; avisar al CTO', hay_f, f_ok, hay_t, t_ok;
  END IF;
  -- 02 · el contexto completo, ANTES de quitar nada (aqui la «partida» de la vuelta es el destino de la sim-005)
  CC_DISPARADORES := CASE estado WHEN 'destino' THEN CC_DISP_DESTINO ELSE CC_DISP_PARTIDA END;
  -- ⟦contexto-completo v4 · revisiones-suite/guardas/contexto.mjs · NO EDITAR A MANO⟧
  DECLARE
    cc_f pg_catalog.text[];
    cc_v pg_catalog.text;
    cc_t pg_catalog.oid;
    cc_k pg_catalog.record;
    cc_n pg_catalog.int8;
    cc_rs pg_catalog.text;
    cc_fs pg_catalog.text[];
    cc_ts pg_catalog.text[];
    cc_j pg_catalog.jsonb;
    cc_mal pg_catalog.text := '';
  BEGIN
    IF pg_catalog.current_setting('session_replication_role') OPERATOR(pg_catalog.<>) 'origin' THEN
      cc_mal := cc_mal OPERATOR(pg_catalog.||) 'session_replication_role=' OPERATOR(pg_catalog.||) pg_catalog.current_setting('session_replication_role') OPERATOR(pg_catalog.||) '; ';
    END IF;
    -- MCQ-02: una consulta de solo lectura, con una sola instantánea para el bloque y su veredicto
    IF pg_catalog.current_setting('transaction_read_only') OPERATOR(pg_catalog.=) 'on'
       AND pg_catalog.current_setting('transaction_isolation') OPERATOR(pg_catalog.<>) ALL (ARRAY['repeatable read', 'serializable']) THEN
      cc_mal := cc_mal OPERATOR(pg_catalog.||) 'una consulta de solo lectura va en BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY (es ' OPERATOR(pg_catalog.||) pg_catalog.current_setting('transaction_isolation') OPERATOR(pg_catalog.||) '); ';
    END IF;
    IF pg_catalog.cardinality(CC_FUNCIONES) OPERATOR(pg_catalog.>) 0 AND pg_catalog.array_ndims(CC_FUNCIONES) IS DISTINCT FROM 2 THEN
      cc_mal := cc_mal OPERATOR(pg_catalog.||) 'CC_FUNCIONES no es de dos dimensiones; ';
    END IF;
    IF pg_catalog.cardinality(CC_DISPARADORES) OPERATOR(pg_catalog.>) 0 AND pg_catalog.array_ndims(CC_DISPARADORES) IS DISTINCT FROM 2 THEN
      cc_mal := cc_mal OPERATOR(pg_catalog.||) 'CC_DISPARADORES no es de dos dimensiones; ';
    END IF;
    IF pg_catalog.array_ndims(CC_FUNCIONES) OPERATOR(pg_catalog.=) 2 THEN
      FOREACH cc_f SLICE 1 IN ARRAY CC_FUNCIONES LOOP
        cc_v := NULL;
        SELECT pg_catalog.jsonb_build_object(
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
          INTO cc_v FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_language l ON l.oid OPERATOR(pg_catalog.=) p.prolang
         WHERE p.oid OPERATOR(pg_catalog.=) pg_catalog.to_regprocedure(cc_f[1]);
        IF cc_v IS DISTINCT FROM cc_f[2] THEN
          cc_mal := cc_mal OPERATOR(pg_catalog.||) cc_f[1] OPERATOR(pg_catalog.||) ' tiene OTRA ficha (' OPERATOR(pg_catalog.||) coalesce(cc_v, 'no existe') OPERATOR(pg_catalog.||) '); ';
        END IF;
      END LOOP;
    END IF;
    cc_v := (WITH RECURSIVE cc_b(oid) AS (
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
           AND pg_catalog.has_parameter_privilege(a.oid, s.name, q.q)))::pg_catalog.text);
    IF cc_v IS DISTINCT FROM CC_GRAFO THEN
      cc_mal := cc_mal OPERATOR(pg_catalog.||) 'el grafo de roles es OTRO, o el entorno (' OPERATOR(pg_catalog.||) coalesce(cc_v, '-') OPERATOR(pg_catalog.||) '); ';
    END IF;
    WITH RECURSIVE cc_r(oid) AS (
        SELECT a.oid FROM pg_catalog.pg_roles a WHERE a.rolname OPERATOR(pg_catalog.=) ANY (ARRAY['anon', 'authenticated', 'service_role', 'authenticator']::pg_catalog.name[])
        UNION SELECT m.roleid FROM pg_catalog.pg_auth_members m JOIN cc_r ON m.member OPERATOR(pg_catalog.=) cc_r.oid)
    SELECT pg_catalog.string_agg(a.rolname::pg_catalog.text, ',' ORDER BY a.rolname::pg_catalog.text COLLATE pg_catalog."C") INTO cc_v
      FROM pg_catalog.pg_roles a JOIN cc_r ON a.oid OPERATOR(pg_catalog.=) cc_r.oid
     WHERE a.rolsuper OR (pg_catalog.array_ndims(CC_FUNCIONES) OPERATOR(pg_catalog.=) 2 AND a.oid OPERATOR(pg_catalog.=) ANY (
             SELECT p.proowner FROM pg_catalog.pg_proc p, pg_catalog.generate_subscripts(CC_FUNCIONES, 1) g(i)
              WHERE p.oid OPERATOR(pg_catalog.=) pg_catalog.to_regprocedure(CC_FUNCIONES[g.i][1])));
    IF cc_v IS NOT NULL THEN
      cc_mal := cc_mal OPERATOR(pg_catalog.||) 'roles del modelo que alcanzan al dueño o a un superusuario: ' OPERATOR(pg_catalog.||) cc_v OPERATOR(pg_catalog.||) '; ';
    END IF;
    WITH RECURSIVE cc_r(oid) AS (
        SELECT a.oid FROM pg_catalog.pg_roles a WHERE a.rolname OPERATOR(pg_catalog.=) ANY (ARRAY['anon', 'authenticated', 'service_role', 'authenticator']::pg_catalog.name[])
        UNION SELECT m.roleid FROM pg_catalog.pg_auth_members m JOIN cc_r ON m.member OPERATOR(pg_catalog.=) cc_r.oid)
    SELECT pg_catalog.string_agg(a.rolname::pg_catalog.text OPERATOR(pg_catalog.||) ':' OPERATOR(pg_catalog.||) s.name OPERATOR(pg_catalog.||) ':' OPERATOR(pg_catalog.||) q.q, ','
             ORDER BY a.rolname::pg_catalog.text COLLATE pg_catalog."C", s.name COLLATE pg_catalog."C", q.q) INTO cc_v
      FROM pg_catalog.pg_roles a JOIN cc_r ON a.oid OPERATOR(pg_catalog.=) cc_r.oid, pg_catalog.pg_settings s, (VALUES ('SET'), ('ALTER SYSTEM')) q(q)
     WHERE (s.context OPERATOR(pg_catalog.=) 'superuser' OR q.q OPERATOR(pg_catalog.=) 'ALTER SYSTEM') AND pg_catalog.has_parameter_privilege(a.oid, s.name, q.q);
    IF cc_v IS NOT NULL THEN
      cc_mal := cc_mal OPERATOR(pg_catalog.||) 'roles del modelo que pueden cambiar parámetros de superusuario: ' OPERATOR(pg_catalog.||) cc_v OPERATOR(pg_catalog.||) '; ';
    END IF;
    IF pg_catalog.array_ndims(CC_DISPARADORES) OPERATOR(pg_catalog.=) 2 THEN
      FOREACH cc_f SLICE 1 IN ARRAY CC_DISPARADORES LOOP
        cc_t := pg_catalog.to_regclass(cc_f[1]);
        cc_v := CASE WHEN cc_t IS NULL THEN NULL ELSE (SELECT pg_catalog.jsonb_build_object(
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
      )::pg_catalog.text) END;
        IF cc_v IS DISTINCT FROM cc_f[2] THEN
          cc_mal := cc_mal OPERATOR(pg_catalog.||) cc_f[1] OPERATOR(pg_catalog.||) ' tiene OTROS disparadores, hijas, permisos, RLS, políticas, reglas, restricciones, índices o columnas (' OPERATOR(pg_catalog.||) coalesce(cc_v, 'no existe') OPERATOR(pg_catalog.||) '); ';
        END IF;
        -- CANON1-02: 0 huérfanos en cada FK de la tabla, en los dos sentidos (solo una cuenta). CC3-07: según MATCH FULL o
        -- SIMPLE, y con row_security = off (quien no se salta la RLS da ERROR, no un 0)
        IF cc_t IS NOT NULL THEN
          cc_rs := pg_catalog.current_setting('row_security');
          PERFORM pg_catalog.set_config('row_security', 'off', true);
          FOR cc_k IN SELECT k.oid, k.conname, k.conrelid, k.confrelid, k.confmatchtype,
                (SELECT pg_catalog.string_agg(pg_catalog.format('c.%I IS NOT NULL', a.attname), ' AND ' ORDER BY x.n)
                   FROM pg_catalog.unnest(k.conkey) WITH ORDINALITY x(a, n) JOIN pg_catalog.pg_attribute a ON a.attrelid OPERATOR(pg_catalog.=) k.conrelid AND a.attnum OPERATOR(pg_catalog.=) x.a) nn,
                (SELECT pg_catalog.string_agg(pg_catalog.format('c.%I IS NULL', a.attname), ' AND ' ORDER BY x.n)
                   FROM pg_catalog.unnest(k.conkey) WITH ORDINALITY x(a, n) JOIN pg_catalog.pg_attribute a ON a.attrelid OPERATOR(pg_catalog.=) k.conrelid AND a.attnum OPERATOR(pg_catalog.=) x.a) tn,
                (SELECT pg_catalog.string_agg(pg_catalog.format('c.%I IS NULL', a.attname), ' OR ' ORDER BY x.n)
                   FROM pg_catalog.unnest(k.conkey) WITH ORDINALITY x(a, n) JOIN pg_catalog.pg_attribute a ON a.attrelid OPERATOR(pg_catalog.=) k.conrelid AND a.attnum OPERATOR(pg_catalog.=) x.a) an,
                (SELECT pg_catalog.string_agg(pg_catalog.format('p.%I OPERATOR(pg_catalog.=) c.%I', pa.attname, ca.attname), ' AND ' ORDER BY x.n)
                   FROM ROWS FROM (pg_catalog.unnest(k.conkey), pg_catalog.unnest(k.confkey)) WITH ORDINALITY x(a, b, n)
                   JOIN pg_catalog.pg_attribute ca ON ca.attrelid OPERATOR(pg_catalog.=) k.conrelid AND ca.attnum OPERATOR(pg_catalog.=) x.a
                   JOIN pg_catalog.pg_attribute pa ON pa.attrelid OPERATOR(pg_catalog.=) k.confrelid AND pa.attnum OPERATOR(pg_catalog.=) x.b) eq
              FROM pg_catalog.pg_constraint k
             WHERE k.contype OPERATOR(pg_catalog.=) 'f' AND (k.conrelid OPERATOR(pg_catalog.=) cc_t OR k.confrelid OPERATOR(pg_catalog.=) cc_t)
             ORDER BY k.conname COLLATE pg_catalog."C" LOOP
            IF cc_k.confmatchtype OPERATOR(pg_catalog.=) 'f' THEN
              EXECUTE pg_catalog.format('SELECT pg_catalog.count(*) FROM %s c WHERE NOT (%s) AND ((%s) OR NOT EXISTS (SELECT 1 FROM %s p WHERE %s))',
                      cc_k.conrelid::pg_catalog.regclass, cc_k.tn, cc_k.an, cc_k.confrelid::pg_catalog.regclass, cc_k.eq) INTO cc_n;
            ELSE
              EXECUTE pg_catalog.format('SELECT pg_catalog.count(*) FROM %s c WHERE %s AND NOT EXISTS (SELECT 1 FROM %s p WHERE %s)',
                      cc_k.conrelid::pg_catalog.regclass, cc_k.nn, cc_k.confrelid::pg_catalog.regclass, cc_k.eq) INTO cc_n;
            END IF;
            IF cc_n OPERATOR(pg_catalog.<>) 0 THEN
              cc_mal := cc_mal OPERATOR(pg_catalog.||) cc_k.conname OPERATOR(pg_catalog.||) ' tiene ' OPERATOR(pg_catalog.||) cc_n::pg_catalog.text OPERATOR(pg_catalog.||) ' filas huérfanas; ';
            END IF;
          END LOOP;
          PERFORM pg_catalog.set_config('row_security', cc_rs, true);
        END IF;
      END LOOP;
    END IF;
    -- MCQ-01 y MCQ-04: los cierres de funciones y de tablas, medidos en la base, contra lo declarado
    cc_fs := CASE WHEN pg_catalog.array_ndims(CC_FUNCIONES) OPERATOR(pg_catalog.=) 2
                  THEN (SELECT pg_catalog.array_agg(CC_FUNCIONES[g.i][1]) FROM pg_catalog.generate_subscripts(CC_FUNCIONES, 1) g(i)) ELSE '{}'::pg_catalog.text[] END;
    cc_ts := CASE WHEN pg_catalog.array_ndims(CC_DISPARADORES) OPERATOR(pg_catalog.=) 2
                  THEN (SELECT pg_catalog.array_agg(CC_DISPARADORES[g.i][1]) FROM pg_catalog.generate_subscripts(CC_DISPARADORES, 1) g(i)) ELSE '{}'::pg_catalog.text[] END;
    cc_j := (WITH cc_ta AS (SELECT pg_catalog.to_regclass(z.z)::pg_catalog.oid t FROM pg_catalog.unnest(cc_ts) z(z)),
      cc_cu AS (SELECT pg_catalog.to_regprocedure(z.z)::pg_catalog.oid f FROM pg_catalog.unnest(cc_fs) z(z)
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
          FROM cc_me m WHERE NOT EXISTS (SELECT FROM cc_ta WHERE cc_ta.t OPERATOR(pg_catalog.=) m.oid)), '[]'::pg_catalog.jsonb)));
    IF cc_j OPERATOR(pg_catalog.<>) '{"funciones": [], "tablas": []}'::pg_catalog.jsonb THEN
      cc_mal := cc_mal OPERATOR(pg_catalog.||) 'el cierre no está declarado: faltan en CC_FUNCIONES ' OPERATOR(pg_catalog.||) (cc_j OPERATOR(pg_catalog.->) 'funciones')::pg_catalog.text
                OPERATOR(pg_catalog.||) ' y en CC_DISPARADORES ' OPERATOR(pg_catalog.||) (cc_j OPERATOR(pg_catalog.->) 'tablas')::pg_catalog.text OPERATOR(pg_catalog.||) '; ';
    END IF;
    IF cc_mal OPERATOR(pg_catalog.<>) '' THEN
      RAISE EXCEPTION '%-CC: el contexto no es el esperado: %. Nada cambiado; avisar al CTO', CC_PREFIJO, cc_mal;
    END IF;
    -- MCQ-02: la marca (local a esta transacción) que exige VEREDICTO()
    PERFORM pg_catalog.set_config('cc.contexto', CC_PREFIJO OPERATOR(pg_catalog.||) ':' OPERATOR(pg_catalog.||) pg_catalog.pg_backend_pid()::pg_catalog.text OPERATOR(pg_catalog.||) ':' OPERATOR(pg_catalog.||) EXTRACT(epoch FROM pg_catalog.now())::pg_catalog.text, true);
  END;
  -- ⟦/contexto-completo⟧

  IF estado OPERATOR(pg_catalog.=) 'partida' THEN
    RAISE NOTICE 'V005: no esta aplicada; no se cambia nada';
  ELSE
  IF pg_catalog.current_setting('session_replication_role') OPERATOR(pg_catalog.<>) 'origin' THEN RAISE EXCEPTION '%-CC: session_replication_role=% justo antes de escribir. Nada cambiado; avisar al CTO', CC_PREFIJO, pg_catalog.current_setting('session_replication_role'); END IF;  -- ⟦origen v4⟧

    DROP TRIGGER sim_sessions_progreso_monotono ON public.sim_sessions;
  IF pg_catalog.current_setting('session_replication_role') OPERATOR(pg_catalog.<>) 'origin' THEN RAISE EXCEPTION '%-CC: session_replication_role=% justo antes de escribir. Nada cambiado; avisar al CTO', CC_PREFIJO, pg_catalog.current_setting('session_replication_role'); END IF;  -- ⟦origen v4⟧

    DROP FUNCTION public.sim_sessions_progreso_monotono();
  END IF;
  IF EXISTS (SELECT FROM pg_catalog.pg_trigger t WHERE t.tgname OPERATOR(pg_catalog.=) 'sim_sessions_progreso_monotono' AND t.tgrelid OPERATOR(pg_catalog.=) 'public.sim_sessions'::pg_catalog.regclass)
     OR EXISTS (SELECT FROM pg_catalog.pg_proc p WHERE p.proname OPERATOR(pg_catalog.=) 'sim_sessions_progreso_monotono' AND p.pronamespace OPERATOR(pg_catalog.=) 'public'::pg_catalog.regnamespace) THEN
    RAISE EXCEPTION 'V005-04: no quedo sin el disparador y su funcion. Nada cambiado';
  END IF;
  CC_DISPARADORES := CC_DISP_PARTIDA;
  -- ⟦contexto-completo v4 · revisiones-suite/guardas/contexto.mjs · NO EDITAR A MANO⟧
  DECLARE
    cc_f pg_catalog.text[];
    cc_v pg_catalog.text;
    cc_t pg_catalog.oid;
    cc_k pg_catalog.record;
    cc_n pg_catalog.int8;
    cc_rs pg_catalog.text;
    cc_fs pg_catalog.text[];
    cc_ts pg_catalog.text[];
    cc_j pg_catalog.jsonb;
    cc_mal pg_catalog.text := '';
  BEGIN
    IF pg_catalog.current_setting('session_replication_role') OPERATOR(pg_catalog.<>) 'origin' THEN
      cc_mal := cc_mal OPERATOR(pg_catalog.||) 'session_replication_role=' OPERATOR(pg_catalog.||) pg_catalog.current_setting('session_replication_role') OPERATOR(pg_catalog.||) '; ';
    END IF;
    -- MCQ-02: una consulta de solo lectura, con una sola instantánea para el bloque y su veredicto
    IF pg_catalog.current_setting('transaction_read_only') OPERATOR(pg_catalog.=) 'on'
       AND pg_catalog.current_setting('transaction_isolation') OPERATOR(pg_catalog.<>) ALL (ARRAY['repeatable read', 'serializable']) THEN
      cc_mal := cc_mal OPERATOR(pg_catalog.||) 'una consulta de solo lectura va en BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY (es ' OPERATOR(pg_catalog.||) pg_catalog.current_setting('transaction_isolation') OPERATOR(pg_catalog.||) '); ';
    END IF;
    IF pg_catalog.cardinality(CC_FUNCIONES) OPERATOR(pg_catalog.>) 0 AND pg_catalog.array_ndims(CC_FUNCIONES) IS DISTINCT FROM 2 THEN
      cc_mal := cc_mal OPERATOR(pg_catalog.||) 'CC_FUNCIONES no es de dos dimensiones; ';
    END IF;
    IF pg_catalog.cardinality(CC_DISPARADORES) OPERATOR(pg_catalog.>) 0 AND pg_catalog.array_ndims(CC_DISPARADORES) IS DISTINCT FROM 2 THEN
      cc_mal := cc_mal OPERATOR(pg_catalog.||) 'CC_DISPARADORES no es de dos dimensiones; ';
    END IF;
    IF pg_catalog.array_ndims(CC_FUNCIONES) OPERATOR(pg_catalog.=) 2 THEN
      FOREACH cc_f SLICE 1 IN ARRAY CC_FUNCIONES LOOP
        cc_v := NULL;
        SELECT pg_catalog.jsonb_build_object(
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
          INTO cc_v FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_language l ON l.oid OPERATOR(pg_catalog.=) p.prolang
         WHERE p.oid OPERATOR(pg_catalog.=) pg_catalog.to_regprocedure(cc_f[1]);
        IF cc_v IS DISTINCT FROM cc_f[2] THEN
          cc_mal := cc_mal OPERATOR(pg_catalog.||) cc_f[1] OPERATOR(pg_catalog.||) ' tiene OTRA ficha (' OPERATOR(pg_catalog.||) coalesce(cc_v, 'no existe') OPERATOR(pg_catalog.||) '); ';
        END IF;
      END LOOP;
    END IF;
    cc_v := (WITH RECURSIVE cc_b(oid) AS (
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
           AND pg_catalog.has_parameter_privilege(a.oid, s.name, q.q)))::pg_catalog.text);
    IF cc_v IS DISTINCT FROM CC_GRAFO THEN
      cc_mal := cc_mal OPERATOR(pg_catalog.||) 'el grafo de roles es OTRO, o el entorno (' OPERATOR(pg_catalog.||) coalesce(cc_v, '-') OPERATOR(pg_catalog.||) '); ';
    END IF;
    WITH RECURSIVE cc_r(oid) AS (
        SELECT a.oid FROM pg_catalog.pg_roles a WHERE a.rolname OPERATOR(pg_catalog.=) ANY (ARRAY['anon', 'authenticated', 'service_role', 'authenticator']::pg_catalog.name[])
        UNION SELECT m.roleid FROM pg_catalog.pg_auth_members m JOIN cc_r ON m.member OPERATOR(pg_catalog.=) cc_r.oid)
    SELECT pg_catalog.string_agg(a.rolname::pg_catalog.text, ',' ORDER BY a.rolname::pg_catalog.text COLLATE pg_catalog."C") INTO cc_v
      FROM pg_catalog.pg_roles a JOIN cc_r ON a.oid OPERATOR(pg_catalog.=) cc_r.oid
     WHERE a.rolsuper OR (pg_catalog.array_ndims(CC_FUNCIONES) OPERATOR(pg_catalog.=) 2 AND a.oid OPERATOR(pg_catalog.=) ANY (
             SELECT p.proowner FROM pg_catalog.pg_proc p, pg_catalog.generate_subscripts(CC_FUNCIONES, 1) g(i)
              WHERE p.oid OPERATOR(pg_catalog.=) pg_catalog.to_regprocedure(CC_FUNCIONES[g.i][1])));
    IF cc_v IS NOT NULL THEN
      cc_mal := cc_mal OPERATOR(pg_catalog.||) 'roles del modelo que alcanzan al dueño o a un superusuario: ' OPERATOR(pg_catalog.||) cc_v OPERATOR(pg_catalog.||) '; ';
    END IF;
    WITH RECURSIVE cc_r(oid) AS (
        SELECT a.oid FROM pg_catalog.pg_roles a WHERE a.rolname OPERATOR(pg_catalog.=) ANY (ARRAY['anon', 'authenticated', 'service_role', 'authenticator']::pg_catalog.name[])
        UNION SELECT m.roleid FROM pg_catalog.pg_auth_members m JOIN cc_r ON m.member OPERATOR(pg_catalog.=) cc_r.oid)
    SELECT pg_catalog.string_agg(a.rolname::pg_catalog.text OPERATOR(pg_catalog.||) ':' OPERATOR(pg_catalog.||) s.name OPERATOR(pg_catalog.||) ':' OPERATOR(pg_catalog.||) q.q, ','
             ORDER BY a.rolname::pg_catalog.text COLLATE pg_catalog."C", s.name COLLATE pg_catalog."C", q.q) INTO cc_v
      FROM pg_catalog.pg_roles a JOIN cc_r ON a.oid OPERATOR(pg_catalog.=) cc_r.oid, pg_catalog.pg_settings s, (VALUES ('SET'), ('ALTER SYSTEM')) q(q)
     WHERE (s.context OPERATOR(pg_catalog.=) 'superuser' OR q.q OPERATOR(pg_catalog.=) 'ALTER SYSTEM') AND pg_catalog.has_parameter_privilege(a.oid, s.name, q.q);
    IF cc_v IS NOT NULL THEN
      cc_mal := cc_mal OPERATOR(pg_catalog.||) 'roles del modelo que pueden cambiar parámetros de superusuario: ' OPERATOR(pg_catalog.||) cc_v OPERATOR(pg_catalog.||) '; ';
    END IF;
    IF pg_catalog.array_ndims(CC_DISPARADORES) OPERATOR(pg_catalog.=) 2 THEN
      FOREACH cc_f SLICE 1 IN ARRAY CC_DISPARADORES LOOP
        cc_t := pg_catalog.to_regclass(cc_f[1]);
        cc_v := CASE WHEN cc_t IS NULL THEN NULL ELSE (SELECT pg_catalog.jsonb_build_object(
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
      )::pg_catalog.text) END;
        IF cc_v IS DISTINCT FROM cc_f[2] THEN
          cc_mal := cc_mal OPERATOR(pg_catalog.||) cc_f[1] OPERATOR(pg_catalog.||) ' tiene OTROS disparadores, hijas, permisos, RLS, políticas, reglas, restricciones, índices o columnas (' OPERATOR(pg_catalog.||) coalesce(cc_v, 'no existe') OPERATOR(pg_catalog.||) '); ';
        END IF;
        -- CANON1-02: 0 huérfanos en cada FK de la tabla, en los dos sentidos (solo una cuenta). CC3-07: según MATCH FULL o
        -- SIMPLE, y con row_security = off (quien no se salta la RLS da ERROR, no un 0)
        IF cc_t IS NOT NULL THEN
          cc_rs := pg_catalog.current_setting('row_security');
          PERFORM pg_catalog.set_config('row_security', 'off', true);
          FOR cc_k IN SELECT k.oid, k.conname, k.conrelid, k.confrelid, k.confmatchtype,
                (SELECT pg_catalog.string_agg(pg_catalog.format('c.%I IS NOT NULL', a.attname), ' AND ' ORDER BY x.n)
                   FROM pg_catalog.unnest(k.conkey) WITH ORDINALITY x(a, n) JOIN pg_catalog.pg_attribute a ON a.attrelid OPERATOR(pg_catalog.=) k.conrelid AND a.attnum OPERATOR(pg_catalog.=) x.a) nn,
                (SELECT pg_catalog.string_agg(pg_catalog.format('c.%I IS NULL', a.attname), ' AND ' ORDER BY x.n)
                   FROM pg_catalog.unnest(k.conkey) WITH ORDINALITY x(a, n) JOIN pg_catalog.pg_attribute a ON a.attrelid OPERATOR(pg_catalog.=) k.conrelid AND a.attnum OPERATOR(pg_catalog.=) x.a) tn,
                (SELECT pg_catalog.string_agg(pg_catalog.format('c.%I IS NULL', a.attname), ' OR ' ORDER BY x.n)
                   FROM pg_catalog.unnest(k.conkey) WITH ORDINALITY x(a, n) JOIN pg_catalog.pg_attribute a ON a.attrelid OPERATOR(pg_catalog.=) k.conrelid AND a.attnum OPERATOR(pg_catalog.=) x.a) an,
                (SELECT pg_catalog.string_agg(pg_catalog.format('p.%I OPERATOR(pg_catalog.=) c.%I', pa.attname, ca.attname), ' AND ' ORDER BY x.n)
                   FROM ROWS FROM (pg_catalog.unnest(k.conkey), pg_catalog.unnest(k.confkey)) WITH ORDINALITY x(a, b, n)
                   JOIN pg_catalog.pg_attribute ca ON ca.attrelid OPERATOR(pg_catalog.=) k.conrelid AND ca.attnum OPERATOR(pg_catalog.=) x.a
                   JOIN pg_catalog.pg_attribute pa ON pa.attrelid OPERATOR(pg_catalog.=) k.confrelid AND pa.attnum OPERATOR(pg_catalog.=) x.b) eq
              FROM pg_catalog.pg_constraint k
             WHERE k.contype OPERATOR(pg_catalog.=) 'f' AND (k.conrelid OPERATOR(pg_catalog.=) cc_t OR k.confrelid OPERATOR(pg_catalog.=) cc_t)
             ORDER BY k.conname COLLATE pg_catalog."C" LOOP
            IF cc_k.confmatchtype OPERATOR(pg_catalog.=) 'f' THEN
              EXECUTE pg_catalog.format('SELECT pg_catalog.count(*) FROM %s c WHERE NOT (%s) AND ((%s) OR NOT EXISTS (SELECT 1 FROM %s p WHERE %s))',
                      cc_k.conrelid::pg_catalog.regclass, cc_k.tn, cc_k.an, cc_k.confrelid::pg_catalog.regclass, cc_k.eq) INTO cc_n;
            ELSE
              EXECUTE pg_catalog.format('SELECT pg_catalog.count(*) FROM %s c WHERE %s AND NOT EXISTS (SELECT 1 FROM %s p WHERE %s)',
                      cc_k.conrelid::pg_catalog.regclass, cc_k.nn, cc_k.confrelid::pg_catalog.regclass, cc_k.eq) INTO cc_n;
            END IF;
            IF cc_n OPERATOR(pg_catalog.<>) 0 THEN
              cc_mal := cc_mal OPERATOR(pg_catalog.||) cc_k.conname OPERATOR(pg_catalog.||) ' tiene ' OPERATOR(pg_catalog.||) cc_n::pg_catalog.text OPERATOR(pg_catalog.||) ' filas huérfanas; ';
            END IF;
          END LOOP;
          PERFORM pg_catalog.set_config('row_security', cc_rs, true);
        END IF;
      END LOOP;
    END IF;
    -- MCQ-01 y MCQ-04: los cierres de funciones y de tablas, medidos en la base, contra lo declarado
    cc_fs := CASE WHEN pg_catalog.array_ndims(CC_FUNCIONES) OPERATOR(pg_catalog.=) 2
                  THEN (SELECT pg_catalog.array_agg(CC_FUNCIONES[g.i][1]) FROM pg_catalog.generate_subscripts(CC_FUNCIONES, 1) g(i)) ELSE '{}'::pg_catalog.text[] END;
    cc_ts := CASE WHEN pg_catalog.array_ndims(CC_DISPARADORES) OPERATOR(pg_catalog.=) 2
                  THEN (SELECT pg_catalog.array_agg(CC_DISPARADORES[g.i][1]) FROM pg_catalog.generate_subscripts(CC_DISPARADORES, 1) g(i)) ELSE '{}'::pg_catalog.text[] END;
    cc_j := (WITH cc_ta AS (SELECT pg_catalog.to_regclass(z.z)::pg_catalog.oid t FROM pg_catalog.unnest(cc_ts) z(z)),
      cc_cu AS (SELECT pg_catalog.to_regprocedure(z.z)::pg_catalog.oid f FROM pg_catalog.unnest(cc_fs) z(z)
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
          FROM cc_me m WHERE NOT EXISTS (SELECT FROM cc_ta WHERE cc_ta.t OPERATOR(pg_catalog.=) m.oid)), '[]'::pg_catalog.jsonb)));
    IF cc_j OPERATOR(pg_catalog.<>) '{"funciones": [], "tablas": []}'::pg_catalog.jsonb THEN
      cc_mal := cc_mal OPERATOR(pg_catalog.||) 'el cierre no está declarado: faltan en CC_FUNCIONES ' OPERATOR(pg_catalog.||) (cc_j OPERATOR(pg_catalog.->) 'funciones')::pg_catalog.text
                OPERATOR(pg_catalog.||) ' y en CC_DISPARADORES ' OPERATOR(pg_catalog.||) (cc_j OPERATOR(pg_catalog.->) 'tablas')::pg_catalog.text OPERATOR(pg_catalog.||) '; ';
    END IF;
    IF cc_mal OPERATOR(pg_catalog.<>) '' THEN
      RAISE EXCEPTION '%-CC: el contexto no es el esperado: %. Nada cambiado; avisar al CTO', CC_PREFIJO, cc_mal;
    END IF;
    -- MCQ-02: la marca (local a esta transacción) que exige VEREDICTO()
    PERFORM pg_catalog.set_config('cc.contexto', CC_PREFIJO OPERATOR(pg_catalog.||) ':' OPERATOR(pg_catalog.||) pg_catalog.pg_backend_pid()::pg_catalog.text OPERATOR(pg_catalog.||) ':' OPERATOR(pg_catalog.||) EXTRACT(epoch FROM pg_catalog.now())::pg_catalog.text, true);
  END;
  -- ⟦/contexto-completo⟧

END
$v005$;
select 'FIN' fin, 'sim-005 retirada (sin sim_sessions_progreso_monotono)' estado;
commit;
