-- ============================================================================
-- CONSULTA DE SOLO LECTURA · S16 · el catalogo que acredita sim-004b, MEDIDO antes de aplicarla
--
-- Diseño revisiones/2026-10-12-diseno-sim-004-y-motor-v1.md, q.16.3 y q.16.6 (CTO 15-oct): los
-- cuerpos de sim-003 y de la preparatoria se miden en produccion antes de aplicar sim-004b. Va en
-- el orden de la etapa 3 (q.13) DESPUES de la puerta y ANTES de sim-004b.
--
-- NO cambia nada: es UNA sola SELECT, sin escrituras ni EXECUTE. No hay nada que editar. Solo
-- catalogo: ni una fila de alumnos. Ensayada dentro de una transaccion READ ONLY y como un
-- ejecutor NO superusuario (pruebas/s16-catalogo-sim004b.mjs), que tambien comprueba que lo que
-- da por bueno es exactamente lo que exige sim-004b. Acaba en «FIN | s16 | consulta».
--
-- Que trae, por este orden (cada fila acaba en «coincide» o en DIFIERE / DE MAS / FALTA):
--   1 rls        las 14 tablas que acredita sim-004b: rls (exigida en 11) y force (false en las 14)
--   2 politica   las politicas de las 11 tablas protegidas, una por fila
--   3 funcion    las 17 funciones que sim-004b CONSERVA (y la puerta si esta): lenguaje|SECURITY
--                DEFINER|volatilidad|proconfig|dueño|sha256 del cuerpo|EXECUTE, y aparte el md5
--                del cuerpo, el dueño y la ACL cruda. «dueño=ejecutor»: el dueño es quien corre la
--                consulta (en el editor, postgres: el mismo que aplicara sim-004b)
--   4 disparador el inventario exacto de las 14 tablas (estado 1, o 2 con la puerta)
--   5 acl_tabla      las 11 protegidas: la matriz efectiva de los siete privilegios para PUBLIC,
--                    anon, authenticated y service_role (lo mismo que exige sim-004b, su 4.3)
--   6 acl_receptores las 7 tablas nuevas y sus 4 secuencias: receptores aparte del dueño y de los
--                    SELECT previstos
--   7 acl_columna    ACL de columna en las 11 protegidas (ninguna)
--   8 veredicto  «OK» (se puede aplicar sim-004b) o «DIFIEREN n» — NO aplicar sim-004b
-- Los textos van SIN el prefijo «public.» (el editor tiene public en el search_path y sim-004b
-- compara con search_path vacio: quitarlo hace la salida igual con los dos).
-- ============================================================================
with
puerta as (select to_regprocedure('public.sim_escrituras_v0_puerta()') is not null as hay),
tablas(t, protegida) as (values
    ('sim_alumnos', true), ('sim_arrendamientos', true), ('sim_recibos', true), ('sim_eventos', true),
    ('sim_escrituras_v0', true), ('sim_escrituras_v0_marcas', true), ('sim_servicio', true),
    ('sim_sessions', true), ('sim_trades', true), ('session_drawings', true), ('session_chart_config', true),
    ('sim_drawing_templates', false), ('user_chart_config', false), ('user_tool_config', false)),
rls as (
  select t.t, c.relrowsecurity rls, c.relforcerowsecurity forzada,
         coalesce(c.oid is not null and (c.relrowsecurity or not t.protegida) and not c.relforcerowsecurity, false) bien
    from tablas t left join pg_class c on c.oid = to_regclass('public.' || t.t)),
pol_med as (
  select regexp_replace(p.tablename || '|' || p.policyname || '|' || p.permissive || '|' || p.cmd || '|' || p.roles::text || '|'
                        || coalesce(p.qual, '-') || '|' || coalesce(p.with_check, '-'), '\mpublic\.', '', 'g') x
    from pg_policies p where p.schemaname = 'public' and p.tablename in (select t from tablas where protegida)),
cond(c) as (values (E'(EXISTS ( SELECT 1\n   FROM sim_sessions s\n  WHERE ((s.id = TABLA.session_id) AND (s.user_id = ( SELECT auth.uid() AS uid)))))')),
pol_esp as (
  select x from (values
    ('sim_recibos|sim_recibos_select_propios|PERMISSIVE|SELECT|{authenticated}|(auth.uid() = user_id)|-'),
    ('sim_eventos|sim_eventos_select_propios|PERMISSIVE|SELECT|{authenticated}|(auth.uid() = user_id)|-'),
    ('sim_servicio|sim_servicio_lectura|PERMISSIVE|SELECT|{authenticated}|true|-')) v(x)
  union all
  select t || '|' || n || '|PERMISSIVE|ALL|{public}|(auth.uid() = user_id)|-'
    from (values ('sim_sessions', 'Users see own sessions'), ('sim_trades', 'Users see own trades'),
                 ('session_drawings', 'user owns session drawings'), ('session_chart_config', 'user owns session config')) v(t, n)
  union all
  select t || '|' || t || '_sesion_propia_insert|RESTRICTIVE|INSERT|{authenticated}|-|' || replace(c, 'TABLA', t)
    from cond, unnest(array['sim_trades', 'session_drawings', 'session_chart_config']) t
  union all
  select t || '|' || t || '_sesion_propia_update|RESTRICTIVE|UPDATE|{authenticated}|' || replace(c, 'TABLA', t) || '|' || replace(c, 'TABLA', t)
    from cond, unnest(array['sim_trades', 'session_drawings', 'session_chart_config']) t),
fun_esp(firma, esperado, solo_con_puerta) as (values
    ('sim_crear_sesion(uuid,uuid,uuid,text,integer,jsonb,jsonb,jsonb,jsonb)', 'plpgsql|true|v|search_path=""|dueño=ejecutor|0634aba8572b154630175e35f6f4041656ce967608d80060b82baddeded2eace|service_role', false),
    ('sim_borrar_sesion(uuid,uuid)', 'plpgsql|true|v|search_path=""|dueño=ejecutor|210d6d9ef38f483eab2d2a73a773fcd68b49b4e58ac33d813bbf34532426360d|service_role', false),
    ('sim_borrar_legacy(uuid,uuid)', 'plpgsql|true|v|search_path=""|dueño=ejecutor|699be648cae457b5339a5f94d80bbe30f03f5952fb7dbeb9dadc79f3bce114f5|service_role', false),
    ('sim_borrar_alumno(uuid)', 'plpgsql|true|v|search_path=""|dueño=ejecutor|99130396d3fc4e301110d7aaf42c70240a80e7ae07d81ae738c1cba63e84cdea|service_role', false),
    ('sim_error(integer,text,jsonb)', 'sql|true|i|search_path=""|dueño=ejecutor|d549317d65746f847af514cee10c6c31cb6bfd7eb678900af8531e14f01ccdc0|', false),
    ('sim_bloquea_alumno(uuid)', 'plpgsql|true|v|search_path=""|dueño=ejecutor|6f0b01b1fb10aedfe788a79dbc6500f23b43c74008f2e41f8062ad7206ffc672|', false),
    ('sim_cierre_v0(uuid,numeric,bigint,jsonb)', 'plpgsql|false|v|search_path=""|dueño=ejecutor|3f116e57f9ba0c4ef6b2d1176f0a91997548106ab186b9e3eff9c0f27126d70b|authenticated', false),
    ('sim_escrituras_v0_registra()', 'plpgsql|true|v|search_path=""|dueño=ejecutor|c47b1970ee48912748434f3161a62062835bfe1ec51af864659164dcddb7a6b4|', false),
    ('sim_escrituras_v0_marca_balance()', 'plpgsql|true|v|search_path=""|dueño=ejecutor|894174ce7cbdd7f7ec69af214dd39fcff00ed12e117c48887c44bd0a058c3117|', false),
    ('sim_escrituras_v0_inmutable()', 'plpgsql|false|v|search_path=""|dueño=ejecutor|58154aea4b93fa65064079566019ad2e390969860961b6aece7281b8463b48d3|', false),
    ('sim_escrituras_v0_solo_disparador()', 'plpgsql|false|v|search_path=""|dueño=ejecutor|6b0f60c5164ea97357a5234501a106b95fcbacfb3362a203b070ad3ca1cb3146|', false),
    ('sim_escrituras_v0_parejas(uuid)', 'plpgsql|false|s|search_path=""|dueño=ejecutor|287f3eba3f68aa68385b6dd2e82512b9ccea1ed963a8def38382f1fdd6adbf32|', false),
    ('sim_escrituras_v0_canonico(uuid)', 'plpgsql|false|s|search_path=""|dueño=ejecutor|a84f48563b8abc6af7731fccee921d9b04231daeccd1bfa8abe81dddee0192b9|', false),
    ('sim_sessions_rev_saldo()', 'plpgsql|false|v|search_path=""|dueño=ejecutor|c209d2326065f55a610319b3207c7b43fdc4ffb5be79302285081b0c5ce18503|', false),
    ('sim_trades_rev_saldo()', 'plpgsql|true|v|search_path=""|dueño=ejecutor|94c4e7220af33da3f257dfc4eae01d00acbc412b5417d025636d83f88f74569d|', false),
    ('sim_sessions_padre_propio()', 'plpgsql|true|v|search_path=""|dueño=ejecutor|3285b822d279587324951b93f7dd6268c2103bc5ff39f4e11d2e9a85d2623291|', false),
    ('enforce_sim_session_limit()', 'plpgsql|true|v|search_path=public|dueño=ejecutor|16cecbd9686b423fa48e75a8a18bfa0a99bff07382c0c5438bc7ba402ae67505|PUBLIC,anon,authenticated,service_role', false),
    ('sim_escrituras_v0_puerta()', 'plpgsql|false|v|search_path=""|dueño=ejecutor|fe4c7c32b146e7d525665760047af0ad49d85d2dc538e1afcf3b080a9f305883|', true)),
fun as (
  select e.firma, e.esperado,
         (select concat_ws('|', l.lanname, p.prosecdef::text, p.provolatile::text, coalesce(array_to_string(p.proconfig, ','), '-'),
                           case when p.proowner = (select r.oid from pg_roles r where r.rolname = current_user) then 'dueño=ejecutor'
                                else 'dueño=' || pg_get_userbyid(p.proowner) end,
                           encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex'),
                           coalesce((select string_agg(g, ',' order by g collate "C") from (
                                       select case when a.grantee = 0 then 'PUBLIC' else a.grantee::regrole::text end g
                                         from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                                        where a.grantee <> p.proowner and a.privilege_type = 'EXECUTE') x), ''))
            from pg_proc p join pg_language l on l.oid = p.prolang where p.oid = to_regprocedure('public.' || e.firma)) medido,
         (select 'md5 ' || md5(p.prosrc) || ' · dueño ' || pg_get_userbyid(p.proowner) || ' · acl ' || coalesce(p.proacl::text, '(por defecto)')
            from pg_proc p where p.oid = to_regprocedure('public.' || e.firma)) crudo
    from fun_esp e, puerta where not e.solo_con_puerta or puerta.hay),
tri_esp(x, solo_con_puerta) as (values
    ('sim_sessions|fk:session_chart_config_session_id_fkey|"RI_FKey_cascade_del"()|9|O', false),
    ('sim_sessions|fk:session_chart_config_session_id_fkey|"RI_FKey_noaction_upd"()|17|O', false),
    ('sim_sessions|fk:session_drawings_session_id_fkey|"RI_FKey_cascade_del"()|9|O', false),
    ('sim_sessions|fk:session_drawings_session_id_fkey|"RI_FKey_noaction_upd"()|17|O', false),
    ('sim_sessions|fk:sim_arrendamientos_session_id_fkey|"RI_FKey_cascade_del"()|9|O', false),
    ('sim_sessions|fk:sim_arrendamientos_session_id_fkey|"RI_FKey_noaction_upd"()|17|O', false),
    ('sim_sessions|fk:sim_eventos_session_id_fkey|"RI_FKey_cascade_del"()|9|O', false),
    ('sim_sessions|fk:sim_eventos_session_id_fkey|"RI_FKey_noaction_upd"()|17|O', false),
    ('sim_sessions|fk:sim_recibos_session_id_fkey|"RI_FKey_cascade_del"()|9|O', false),
    ('sim_sessions|fk:sim_recibos_session_id_fkey|"RI_FKey_noaction_upd"()|17|O', false),
    ('sim_sessions|fk:sim_sessions_challenge_parent_id_fkey|"RI_FKey_check_ins"()|5|O', false),
    ('sim_sessions|fk:sim_sessions_challenge_parent_id_fkey|"RI_FKey_check_upd"()|17|O', false),
    ('sim_sessions|fk:sim_sessions_challenge_parent_id_fkey|"RI_FKey_noaction_upd"()|17|O', false),
    ('sim_sessions|fk:sim_sessions_challenge_parent_id_fkey|"RI_FKey_setnull_del"()|9|O', false),
    ('sim_sessions|fk:sim_sessions_user_id_fkey|"RI_FKey_check_ins"()|5|O', false),
    ('sim_sessions|fk:sim_sessions_user_id_fkey|"RI_FKey_check_upd"()|17|O', false),
    ('sim_sessions|fk:sim_sessions_user_id_perfil_fkey|"RI_FKey_check_ins"()|5|O', false),
    ('sim_sessions|fk:sim_sessions_user_id_perfil_fkey|"RI_FKey_check_upd"()|17|O', false),
    ('sim_sessions|fk:sim_trades_session_id_fkey|"RI_FKey_cascade_del"()|9|O', false),
    ('sim_sessions|fk:sim_trades_session_id_fkey|"RI_FKey_noaction_upd"()|17|O', false),
    ('sim_sessions|trg_enforce_sim_session_limit|CREATE TRIGGER trg_enforce_sim_session_limit BEFORE INSERT ON sim_sessions FOR EACH ROW EXECUTE FUNCTION enforce_sim_session_limit()|7|O', false),
    ('sim_trades|fk:sim_trades_evento_id_fkey|"RI_FKey_check_ins"()|5|O', false),
    ('sim_trades|fk:sim_trades_evento_id_fkey|"RI_FKey_check_upd"()|17|O', false),
    ('sim_trades|fk:sim_trades_session_id_fkey|"RI_FKey_check_ins"()|5|O', false),
    ('sim_trades|fk:sim_trades_session_id_fkey|"RI_FKey_check_upd"()|17|O', false),
    ('sim_trades|fk:sim_trades_user_id_fkey|"RI_FKey_check_ins"()|5|O', false),
    ('sim_trades|fk:sim_trades_user_id_fkey|"RI_FKey_check_upd"()|17|O', false),
    ('sim_escrituras_v0_marcas|sim_escrituras_v0_inmutable_fila|CREATE TRIGGER sim_escrituras_v0_inmutable_fila BEFORE DELETE OR UPDATE ON sim_escrituras_v0_marcas FOR EACH ROW EXECUTE FUNCTION sim_escrituras_v0_inmutable()|27|O', false),
    ('sim_escrituras_v0_marcas|sim_escrituras_v0_inmutable_truncate|CREATE TRIGGER sim_escrituras_v0_inmutable_truncate BEFORE TRUNCATE ON sim_escrituras_v0_marcas FOR EACH STATEMENT EXECUTE FUNCTION sim_escrituras_v0_inmutable()|34|O', false),
    ('sim_escrituras_v0_marcas|sim_escrituras_v0_solo_disparador|CREATE TRIGGER sim_escrituras_v0_solo_disparador BEFORE INSERT ON sim_escrituras_v0_marcas FOR EACH ROW EXECUTE FUNCTION sim_escrituras_v0_solo_disparador()|7|O', false),
    ('sim_escrituras_v0|sim_escrituras_v0_inmutable_fila|CREATE TRIGGER sim_escrituras_v0_inmutable_fila BEFORE DELETE OR UPDATE ON sim_escrituras_v0 FOR EACH ROW EXECUTE FUNCTION sim_escrituras_v0_inmutable()|27|O', false),
    ('sim_escrituras_v0|sim_escrituras_v0_inmutable_truncate|CREATE TRIGGER sim_escrituras_v0_inmutable_truncate BEFORE TRUNCATE ON sim_escrituras_v0 FOR EACH STATEMENT EXECUTE FUNCTION sim_escrituras_v0_inmutable()|34|O', false),
    ('sim_escrituras_v0|sim_escrituras_v0_solo_disparador|CREATE TRIGGER sim_escrituras_v0_solo_disparador BEFORE INSERT ON sim_escrituras_v0 FOR EACH ROW EXECUTE FUNCTION sim_escrituras_v0_solo_disparador()|7|O', false),
    ('sim_sessions|sim_escrituras_v0_a|CREATE TRIGGER sim_escrituras_v0_a AFTER INSERT OR DELETE OR UPDATE ON sim_sessions FOR EACH ROW EXECUTE FUNCTION sim_escrituras_v0_registra()|29|O', false),
    ('sim_sessions|sim_escrituras_v0_b_balance|CREATE TRIGGER sim_escrituras_v0_b_balance AFTER UPDATE OF balance ON sim_sessions FOR EACH ROW EXECUTE FUNCTION sim_escrituras_v0_marca_balance()|17|O', false),
    ('sim_sessions|sim_sessions_padre_propio|CREATE TRIGGER sim_sessions_padre_propio BEFORE INSERT OR UPDATE ON sim_sessions FOR EACH ROW EXECUTE FUNCTION sim_sessions_padre_propio()|23|O', false),
    ('sim_sessions|sim_sessions_rev_saldo|CREATE TRIGGER sim_sessions_rev_saldo BEFORE INSERT OR UPDATE ON sim_sessions FOR EACH ROW EXECUTE FUNCTION sim_sessions_rev_saldo()|23|O', false),
    ('sim_trades|sim_escrituras_v0_a|CREATE TRIGGER sim_escrituras_v0_a AFTER INSERT OR DELETE OR UPDATE ON sim_trades FOR EACH ROW EXECUTE FUNCTION sim_escrituras_v0_registra()|29|O', false),
    ('sim_trades|sim_trades_rev_saldo|CREATE TRIGGER sim_trades_rev_saldo AFTER INSERT OR DELETE OR UPDATE ON sim_trades FOR EACH ROW EXECUTE FUNCTION sim_trades_rev_saldo()|29|O', false),
    ('session_chart_config|fk:session_chart_config_session_id_fkey|"RI_FKey_check_ins"()|5|O', false),
    ('session_chart_config|fk:session_chart_config_session_id_fkey|"RI_FKey_check_upd"()|17|O', false),
    ('session_chart_config|fk:session_chart_config_user_id_fkey|"RI_FKey_check_ins"()|5|O', false),
    ('session_chart_config|fk:session_chart_config_user_id_fkey|"RI_FKey_check_upd"()|17|O', false),
    ('session_drawings|fk:session_drawings_session_id_fkey|"RI_FKey_check_ins"()|5|O', false),
    ('session_drawings|fk:session_drawings_session_id_fkey|"RI_FKey_check_upd"()|17|O', false),
    ('session_drawings|fk:session_drawings_user_id_fkey|"RI_FKey_check_ins"()|5|O', false),
    ('session_drawings|fk:session_drawings_user_id_fkey|"RI_FKey_check_upd"()|17|O', false),
    ('sim_alumnos|fk:sim_alumnos_user_id_fkey|"RI_FKey_check_ins"()|5|O', false),
    ('sim_alumnos|fk:sim_alumnos_user_id_fkey|"RI_FKey_check_upd"()|17|O', false),
    ('sim_arrendamientos|fk:sim_arrendamientos_session_id_fkey|"RI_FKey_check_ins"()|5|O', false),
    ('sim_arrendamientos|fk:sim_arrendamientos_session_id_fkey|"RI_FKey_check_upd"()|17|O', false),
    ('sim_drawing_templates|fk:sim_drawing_templates_user_id_fkey|"RI_FKey_check_ins"()|5|O', false),
    ('sim_drawing_templates|fk:sim_drawing_templates_user_id_fkey|"RI_FKey_check_upd"()|17|O', false),
    ('sim_eventos|fk:sim_eventos_session_id_fkey|"RI_FKey_check_ins"()|5|O', false),
    ('sim_eventos|fk:sim_eventos_session_id_fkey|"RI_FKey_check_upd"()|17|O', false),
    ('sim_eventos|fk:sim_trades_evento_id_fkey|"RI_FKey_cascade_del"()|9|O', false),
    ('sim_eventos|fk:sim_trades_evento_id_fkey|"RI_FKey_noaction_upd"()|17|O', false),
    ('sim_recibos|fk:sim_recibos_session_id_fkey|"RI_FKey_check_ins"()|5|O', false),
    ('sim_recibos|fk:sim_recibos_session_id_fkey|"RI_FKey_check_upd"()|17|O', false),
    ('user_chart_config|fk:user_chart_config_user_id_fkey|"RI_FKey_check_ins"()|5|O', false),
    ('user_chart_config|fk:user_chart_config_user_id_fkey|"RI_FKey_check_upd"()|17|O', false),
    ('user_tool_config|fk:user_tool_config_user_id_fkey|"RI_FKey_check_ins"()|5|O', false),
    ('user_tool_config|fk:user_tool_config_user_id_fkey|"RI_FKey_check_upd"()|17|O', false),
    ('sim_sessions|sim_escrituras_v0_puerta|CREATE TRIGGER sim_escrituras_v0_puerta BEFORE INSERT OR DELETE OR UPDATE ON sim_sessions FOR EACH ROW EXECUTE FUNCTION sim_escrituras_v0_puerta()|31|O', true),
    ('sim_trades|sim_escrituras_v0_puerta|CREATE TRIGGER sim_escrituras_v0_puerta BEFORE INSERT OR DELETE OR UPDATE ON sim_trades FOR EACH ROW EXECUTE FUNCTION sim_escrituras_v0_puerta()|31|O', true)),
tri_e as (select x from tri_esp, puerta where not tri_esp.solo_con_puerta or puerta.hay),
tri_med as (
  select regexp_replace(c.oid::regclass::text || '|' ||
           case when t.tgisinternal then 'fk:' || k.conname || '|' || t.tgfoid::regprocedure::text
                else t.tgname || '|' || pg_get_triggerdef(t.oid) end
           || '|' || t.tgtype || '|' || t.tgenabled::text, '\mpublic\.', '', 'g') x
    from pg_trigger t join pg_class c on c.oid = t.tgrelid left join pg_constraint k on k.oid = t.tgconstraint
   where c.oid in (select to_regclass('public.' || t) from tablas)),
-- 5 las ACL de tabla, con la MISMA regla que sim-004b (su seccion 4.3; CTO 15-oct, ronda 2: la s16 mide
-- todo lo que sim-004b exige). En las 11 protegidas, la matriz EFECTIVA de los siete privilegios para
-- PUBLIC, anon, authenticated y service_role (en las cuatro de s04, la medida del 10-oct; no la ACL cruda,
-- que s04 no midio con MAINTAIN). En las siete nuevas y sus cuatro secuencias, ningun receptor aparte del
-- dueño y de los SELECT previstos. Y ninguna ACL de columna en las 11.
priv(p, n) as (values ('SELECT', 1), ('INSERT', 2), ('UPDATE', 3), ('DELETE', 4), ('TRUNCATE', 5), ('REFERENCES', 6), ('TRIGGER', 7)),
roles(r, n) as (values ('public', 1), ('anon', 2), ('authenticated', 3), ('service_role', 4)),
acl_m as (
  select t.t, c.oid,
         (select string_agg(ro.r || '=' || coalesce((select string_agg(pr.p, ',' order by pr.n) from priv pr
                                                     where has_table_privilege(ro.r, c.oid, pr.p)), '-'), ' ' order by ro.n)
            from roles ro where c.oid is not null) medido,
         (select string_agg(ro.r || '=' || coalesce((select string_agg(pr.p, ',' order by pr.n) from priv pr
                                                     where case when t.t in ('sim_sessions', 'sim_trades', 'session_drawings', 'session_chart_config')
                                                                 then ro.r = 'service_role' or (ro.r = 'authenticated' and pr.p in ('SELECT', 'INSERT', 'UPDATE', 'DELETE'))
                                                               else pr.p = 'SELECT' and ro.r in ('authenticated', 'service_role') and t.t in ('sim_recibos', 'sim_eventos', 'sim_servicio') end), '-'), ' ' order by ro.n)
            from roles ro) esperado
    from tablas t left join pg_class c on c.oid = to_regclass('public.' || t.t) where t.protegida),
nuevas(o) as (values ('sim_alumnos'), ('sim_arrendamientos'), ('sim_recibos'), ('sim_eventos'), ('sim_escrituras_v0'),
                     ('sim_escrituras_v0_marcas'), ('sim_servicio'), ('sim_recibos_id_seq'), ('sim_eventos_id_seq'),
                     ('sim_escrituras_v0_id_seq'), ('sim_escrituras_v0_marcas_id_seq')),
acl_r as (
  select n.o, c.oid,
         (select string_agg(case when a.grantee = 0 then 'PUBLIC' else a.grantee::regrole::text end || '=' || a.privilege_type, ', '
                            order by case when a.grantee = 0 then 'PUBLIC' else a.grantee::regrole::text end collate "C", a.privilege_type collate "C")
            from aclexplode(coalesce(c.relacl, acldefault(case when c.relkind = 'S' then 's'::"char" else 'r'::"char" end, c.relowner))) a
           where a.grantee <> c.relowner
             and not (a.privilege_type = 'SELECT' and c.relname in ('sim_recibos', 'sim_eventos', 'sim_servicio')
                      and a.grantee in ('authenticated'::regrole, 'service_role'::regrole))) de_mas
    from nuevas n left join pg_class c on c.oid = to_regclass('public.' || n.o)),
acl_c as (
  select string_agg(regexp_replace(a.attrelid::regclass::text, '\mpublic\.', '', 'g') || '.' || a.attname || ' ' || a.attacl::text, ', '
                    order by a.attrelid::regclass::text collate "C", a.attname collate "C") de_mas
    from pg_attribute a
   where a.attrelid in (select to_regclass('public.' || t) from tablas where protegida) and a.attnum > 0 and coalesce(cardinality(a.attacl), 0) > 0),
filas as (
  select 1 o, r.t o2, 'rls' seccion, r.t objeto,
         case when r.rls is null then 'NO EXISTE' else 'rls=' || r.rls || ' · force=' || r.forzada end || ' · '
         || case when r.bien then 'coincide' else 'DIFIERE' end detalle
    from rls r
  union all select 2, x, 'politica', x, 'coincide' from (select x from pol_med intersect all select x from pol_esp) i
  union all select 2, x, 'politica', x, 'DE MAS' from (select x from pol_med except all select x from pol_esp) d
  union all select 2, x, 'politica', x, 'FALTA' from (select x from pol_esp except all select x from pol_med) d
  union all
  select 3, firma, 'funcion', firma,
         coalesce(medido, '(no existe)') || ' · ' || coalesce(crudo, '-') || ' · '
         || case when medido is not distinct from esperado then 'coincide' else 'DIFIERE (sim-004b espera ' || esperado || ')' end
    from fun
  union all select 4, x, 'disparador', x, 'coincide' from (select x from tri_med intersect all select x from tri_e) i
  union all select 4, x, 'disparador', x, 'DE MAS' from (select x from tri_med except all select x from tri_e) d
  union all select 4, x, 'disparador', x, 'FALTA' from (select x from tri_e except all select x from tri_med) d
  union all
  select 5, a.t, 'acl_tabla', a.t,
         coalesce(a.medido, 'NO EXISTE') || ' · '
         || case when a.medido is not distinct from a.esperado then 'coincide' else 'DIFIERE (sim-004b espera ' || a.esperado || ')' end
    from acl_m a
  union all
  select 6, r.o, 'acl_receptores', r.o,
         case when r.oid is null then 'NO EXISTE · DIFIERE' when r.de_mas is null then 'ninguno de mas · coincide'
              else 'de mas: ' || r.de_mas || ' · DIFIERE' end
    from acl_r r
  union all
  select 7, '', 'acl_columna', 'las 11 protegidas',
         case when c.de_mas is null then 'ninguna · coincide' else 'de mas: ' || c.de_mas || ' · DIFIERE' end
    from acl_c c),
malas as (select count(*) n from filas where detalle ~ '(DIFIERE|DE MAS|FALTA)$' or detalle ~ 'DIFIERE \(')
select seccion, objeto, detalle from (
  select o, o2, seccion, objeto, detalle from filas
  union all
  select 8, '', 'veredicto', case when n = 0 then 'OK' else 'DIFIEREN ' || n end,
         case when n = 0 then 'lo que acredita sim-004b (rls, force, politicas, funciones, disparadores y ACL de tabla) coincide: se puede aplicar'
              else 'NO aplicar sim-004b: revisar las filas DIFIERE / DE MAS / FALTA y parar (decide el CTO)' end
    from malas
  union all
  select 9, '', 'FIN', 's16', 'consulta'
) x order by o, o2 collate "C", detalle collate "C";
