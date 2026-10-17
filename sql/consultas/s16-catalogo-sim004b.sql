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
--   0 requisito      PostgreSQL >= 17 y los roles anon, authenticated y service_role (seccion 0)
--   0 sim004b_estado las dos restricciones y los tres cuerpos que cambia sim-004b: «sin aplicar» o
--                    «aplicada»; si no, A MEDIAS (sim-004b aborta)
--   0 restriccion    las 25 restricciones de sim-003 que sim-004b compara al pie de la letra (seccion 3)
--   0 indice         sus 10 indices unicos (seccion 3)
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
--   3b funcion_sustituida  las 3 RPC que sim-004b sustituye: EXECUTE (anon, authenticated y PUBLIC no;
--                    service_role si) y, con sim-004b ya aplicada, SECURITY DEFINER y search_path vacio
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
    ('sim_crear_sesion(uuid,uuid,uuid,text,integer,jsonb,jsonb,jsonb,jsonb)', 'plpgsql|true|v|search_path=""|dueño=ejecutor|0634aba8572b154630175e35f6f4041656ce967608d80060b82baddeded2eace|service_role|strict=false|leakproof=false|parallel=u|kind=f|retset=false|ret=jsonb|args=uuid,uuid,uuid,text,integer,jsonb,jsonb,jsonb,jsonb|modes=-|names=p_actor,p_session_id,p_command_id,p_sobre,p_epoca,p_sesion,p_estado,p_mercado,p_resumen|defaults=-|ndefaults=0|cost=100|rows=0|def=abb09983533ae8b167c7c3910d36ddb7', false),
    ('sim_borrar_sesion(uuid,uuid)', 'plpgsql|true|v|search_path=""|dueño=ejecutor|210d6d9ef38f483eab2d2a73a773fcd68b49b4e58ac33d813bbf34532426360d|service_role|strict=false|leakproof=false|parallel=u|kind=f|retset=false|ret=jsonb|args=uuid,uuid|modes=-|names=p_actor,p_session_id|defaults=-|ndefaults=0|cost=100|rows=0|def=b039b2b9e9f005b2305416eb11b7e834', false),
    ('sim_borrar_legacy(uuid,uuid)', 'plpgsql|true|v|search_path=""|dueño=ejecutor|699be648cae457b5339a5f94d80bbe30f03f5952fb7dbeb9dadc79f3bce114f5|service_role|strict=false|leakproof=false|parallel=u|kind=f|retset=false|ret=jsonb|args=uuid,uuid|modes=-|names=p_user_id,p_session_id|defaults=-|ndefaults=0|cost=100|rows=0|def=5398552fbd631d0beebc6a2990633340', false),
    ('sim_borrar_alumno(uuid)', 'plpgsql|true|v|search_path=""|dueño=ejecutor|99130396d3fc4e301110d7aaf42c70240a80e7ae07d81ae738c1cba63e84cdea|service_role|strict=false|leakproof=false|parallel=u|kind=f|retset=false|ret=jsonb|args=uuid|modes=-|names=p_user_id|defaults=-|ndefaults=0|cost=100|rows=0|def=bdcb1e2a59d9422d6c7b9951482475ee', false),
    ('sim_error(integer,text,jsonb)', 'sql|true|i|search_path=""|dueño=ejecutor|d549317d65746f847af514cee10c6c31cb6bfd7eb678900af8531e14f01ccdc0||strict=false|leakproof=false|parallel=u|kind=f|retset=false|ret=jsonb|args=integer,text,jsonb|modes=-|names=p_http,p_motivo,p_extra|defaults=''{}''::jsonb|ndefaults=1|cost=100|rows=0|def=a46517c97ea242e3901ad75f89ac92a7', false),
    ('sim_bloquea_alumno(uuid)', 'plpgsql|true|v|search_path=""|dueño=ejecutor|6f0b01b1fb10aedfe788a79dbc6500f23b43c74008f2e41f8062ad7206ffc672||strict=false|leakproof=false|parallel=u|kind=f|retset=false|ret=jsonb|args=uuid|modes=-|names=p_actor|defaults=-|ndefaults=0|cost=100|rows=0|def=c11ecb12f670396198cce2655f88387a', false),
    ('sim_cierre_v0(uuid,numeric,bigint,jsonb)', 'plpgsql|false|v|search_path=""|dueño=ejecutor|3f116e57f9ba0c4ef6b2d1176f0a91997548106ab186b9e3eff9c0f27126d70b|authenticated|strict=false|leakproof=false|parallel=u|kind=f|retset=false|ret=uuid|args=uuid,numeric,bigint,jsonb|modes=-|names=p_session_id,p_balance,p_last_timestamp,p_trade|defaults=-|ndefaults=0|cost=100|rows=0|def=4d35ee3cad1d8f34b22074607fa00e07', false),
    ('sim_escrituras_v0_registra()', 'plpgsql|true|v|search_path=""|dueño=ejecutor|c47b1970ee48912748434f3161a62062835bfe1ec51af864659164dcddb7a6b4||strict=false|leakproof=false|parallel=u|kind=f|retset=false|ret=trigger|args=|modes=-|names=-|defaults=-|ndefaults=0|cost=100|rows=0|def=a342f7511bc8cde06164e95bedfa521d', false),
    ('sim_escrituras_v0_marca_balance()', 'plpgsql|true|v|search_path=""|dueño=ejecutor|894174ce7cbdd7f7ec69af214dd39fcff00ed12e117c48887c44bd0a058c3117||strict=false|leakproof=false|parallel=u|kind=f|retset=false|ret=trigger|args=|modes=-|names=-|defaults=-|ndefaults=0|cost=100|rows=0|def=bb380293db1ca7e5715052e4d7e0bb8a', false),
    ('sim_escrituras_v0_inmutable()', 'plpgsql|false|v|search_path=""|dueño=ejecutor|58154aea4b93fa65064079566019ad2e390969860961b6aece7281b8463b48d3||strict=false|leakproof=false|parallel=u|kind=f|retset=false|ret=trigger|args=|modes=-|names=-|defaults=-|ndefaults=0|cost=100|rows=0|def=28490ac5564dae2cc9137c700e7dac07', false),
    ('sim_escrituras_v0_solo_disparador()', 'plpgsql|false|v|search_path=""|dueño=ejecutor|6b0f60c5164ea97357a5234501a106b95fcbacfb3362a203b070ad3ca1cb3146||strict=false|leakproof=false|parallel=u|kind=f|retset=false|ret=trigger|args=|modes=-|names=-|defaults=-|ndefaults=0|cost=100|rows=0|def=b5e4e4f3516eafbfc60ef7b28f856768', false),
    ('sim_escrituras_v0_parejas(uuid)', 'plpgsql|false|s|search_path=""|dueño=ejecutor|287f3eba3f68aa68385b6dd2e82512b9ccea1ed963a8def38382f1fdd6adbf32||strict=false|leakproof=false|parallel=u|kind=f|retset=true|ret=record|args=uuid|modes={i,t,t,t}|names=p_session_id,orden,escritura_update,escritura_insert|defaults=-|ndefaults=0|cost=100|rows=1000|def=7999fb9592b0450511cb9fa3276bf600', false),
    ('sim_escrituras_v0_canonico(uuid)', 'plpgsql|false|s|search_path=""|dueño=ejecutor|a84f48563b8abc6af7731fccee921d9b04231daeccd1bfa8abe81dddee0192b9||strict=false|leakproof=false|parallel=u|kind=f|retset=true|ret=record|args=uuid|modes={i,t,t}|names=p_session_id,texto,sha256|defaults=-|ndefaults=0|cost=100|rows=1000|def=a946bc032d0fa3b182ad6e3df9167074', false),
    ('sim_sessions_rev_saldo()', 'plpgsql|false|v|search_path=""|dueño=ejecutor|c209d2326065f55a610319b3207c7b43fdc4ffb5be79302285081b0c5ce18503||strict=false|leakproof=false|parallel=u|kind=f|retset=false|ret=trigger|args=|modes=-|names=-|defaults=-|ndefaults=0|cost=100|rows=0|def=a94d218859a71712d274259e40c15a98', false),
    ('sim_trades_rev_saldo()', 'plpgsql|true|v|search_path=""|dueño=ejecutor|94c4e7220af33da3f257dfc4eae01d00acbc412b5417d025636d83f88f74569d||strict=false|leakproof=false|parallel=u|kind=f|retset=false|ret=trigger|args=|modes=-|names=-|defaults=-|ndefaults=0|cost=100|rows=0|def=4ae9b01861c73e7ae45bc51760d56764', false),
    ('sim_sessions_padre_propio()', 'plpgsql|true|v|search_path=""|dueño=ejecutor|3285b822d279587324951b93f7dd6268c2103bc5ff39f4e11d2e9a85d2623291||strict=false|leakproof=false|parallel=u|kind=f|retset=false|ret=trigger|args=|modes=-|names=-|defaults=-|ndefaults=0|cost=100|rows=0|def=758dc4d0b122b53db35f91f8f85d44ec', false),
    ('enforce_sim_session_limit()', 'plpgsql|true|v|search_path=public|dueño=ejecutor|16cecbd9686b423fa48e75a8a18bfa0a99bff07382c0c5438bc7ba402ae67505|PUBLIC,anon,authenticated,service_role|strict=false|leakproof=false|parallel=u|kind=f|retset=false|ret=trigger|args=|modes=-|names=-|defaults=-|ndefaults=0|cost=100|rows=0|def=057b9c51bfe664f3841b2b617aa724ae', false),
    ('sim_escrituras_v0_puerta()', 'plpgsql|false|v|search_path=""|dueño=ejecutor|fe4c7c32b146e7d525665760047af0ad49d85d2dc538e1afcf3b080a9f305883||strict=false|leakproof=false|parallel=u|kind=f|retset=false|ret=trigger|args=|modes=-|names=-|defaults=-|ndefaults=0|cost=100|rows=0|def=58a2b98ce8df1cffcb40e2ee8466e718', true)),
fun as (
  select e.firma, e.esperado,
         (select concat_ws('|', l.lanname, p.prosecdef::text, p.provolatile::text, coalesce(array_to_string(p.proconfig, ','), '-'),
                           case when p.proowner = (select r.oid from pg_roles r where r.rolname = current_user) then 'dueño=ejecutor'
                                else 'dueño=' || pg_get_userbyid(p.proowner) end,
                           encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex'),
                           coalesce((select string_agg(g, ',' order by g collate "C") from (
                                       -- R3E3-03 (revisor interno): la opcion de concesion tambien cuenta
                                       select case when a.grantee = 0 then 'PUBLIC' else a.grantee::regrole::text end
                                              || case when a.is_grantable then ' (con opcion de concesion)' else '' end g
                                         from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                                        where a.grantee <> p.proowner and a.privilege_type = 'EXECUTE') x), ''),
                           -- E3R2-01 (Astra r2; CTO 16-oct): todos los atributos de pg_proc y el md5 de pg_get_functiondef (la misma expresion que sim-004b)
                           concat_ws('|', 'strict=' || p.proisstrict::text, 'leakproof=' || p.proleakproof::text, 'parallel=' || p.proparallel::text, 'kind=' || p.prokind::text, 'retset=' || p.proretset::text, 'ret=' || format_type(p.prorettype, NULL), 'args=' || coalesce((SELECT string_agg(format_type(u.t, NULL), ',' ORDER BY u.n) FROM unnest(p.proargtypes::oid[]) WITH ORDINALITY u(t, n)), ''), 'modes=' || coalesce(p.proargmodes::text, '-'), 'names=' || coalesce(array_to_string(p.proargnames, ','), '-'), 'defaults=' || coalesce(pg_get_expr(p.proargdefaults, 0), '-'), 'ndefaults=' || p.pronargdefaults::text, 'cost=' || p.procost::text, 'rows=' || p.prorows::text, 'def=' || md5(pg_get_functiondef(p.oid))))
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
-- 0-3 lo que sim-004b exige ANTES de su seccion 4 (revisor de d20dcef, H1; CTO: la s16 mide TODO lo
-- que sim-004b exige, ni mas ni menos). Las definiciones, COPIADAS de sql/sim-004b-contrato-v1.sql (la
-- prueba lo comprueba); los textos sin el prefijo «public.» (sim-004b compara con search_path = public).
requisito(objeto, bien, detalle) as (values
    ('PostgreSQL >= 17', current_setting('server_version_num')::integer >= 170000, current_setting('server_version')),
    ('rol anon', exists (select 1 from pg_roles where rolname = 'anon'), 'existe'),
    ('rol authenticated', exists (select 1 from pg_roles where rolname = 'authenticated'), 'existe'),
    ('rol service_role', exists (select 1 from pg_roles where rolname = 'service_role'), 'existe')),
def_dos(conrel, conname, vieja, nueva) as (values
    ('sim_sessions', 'sim_sessions_terminal_valida', 'CHECK (((terminal IS NULL) OR (terminal = ANY (ARRAY[''borrada''::text, ''revocada''::text]))))', 'CHECK (((terminal IS NULL) OR (terminal = ANY (ARRAY[''borrada''::text, ''revocada''::text, ''superado''::text]))))'),
    ('sim_eventos', 'sim_eventos_tipo_check', 'CHECK ((tipo = ANY (ARRAY[''orden_creada''::text, ''orden_modificada''::text, ''orden_cancelada''::text, ''fill''::text, ''cierre''::text, ''reset_diario''::text, ''breach''::text, ''fase_superada''::text, ''fin_de_datos''::text, ''posicion_modificada''::text, ''no_valorable''::text])))', 'CHECK ((tipo = ANY (ARRAY[''orden_creada''::text, ''orden_modificada''::text, ''orden_cancelada''::text, ''fill''::text, ''cierre''::text, ''reset_diario''::text, ''breach''::text, ''fase_superada''::text, ''fin_de_datos''::text, ''posicion_modificada''::text, ''no_valorable''::text, ''hueco_aceptado''::text])))')),
dos as (
  select d.conname,
         (select regexp_replace(pg_get_constraintdef(k.oid), '\mpublic\.', '', 'g') from pg_constraint k
           where k.conrelid = to_regclass('public.' || d.conrel) and k.conname = d.conname) def,
         (select k.convalidated from pg_constraint k where k.conrelid = to_regclass('public.' || d.conrel) and k.conname = d.conname) validada,
         d.vieja, d.nueva
    from def_dos d),
sust(firma, sha, atr) as (values
    ('sim_comando(uuid,uuid,uuid,text,text,integer,bigint,text,text,jsonb)', '94f4db481cc09a2bc9b5d86512931186d8ec5aa98689bf6dc54bd6418798bc36', 'strict=false|leakproof=false|parallel=u|kind=f|retset=false|ret=jsonb|args=uuid,uuid,uuid,text,text,integer,bigint,text,text,jsonb|modes=-|names=p_actor,p_session_id,p_command_id,p_tipo,p_sobre,p_epoca,p_version_esperada,p_cliente_id,p_testigo,p_resultado|defaults=-|ndefaults=0|cost=100|rows=0|def=8d7d99c91cd3207fa686f97a13fe526c'),
    ('sim_tomar_escritor(uuid,uuid,uuid,text,integer,text,boolean)', 'f58af2b0e4945d9313ea2c3bb55f4be7c003521be80ed92a5a0a56b5cdc03d48', 'strict=false|leakproof=false|parallel=u|kind=f|retset=false|ret=jsonb|args=uuid,uuid,uuid,text,integer,text,boolean|modes=-|names=p_actor,p_session_id,p_command_id,p_sobre,p_epoca,p_cliente_id,p_forzar|defaults=-|ndefaults=0|cost=100|rows=0|def=da773a9b444cf9cac9a610848a52b78b'),
    ('sim_avanzar_fase(uuid,uuid,uuid,uuid,text,integer,bigint,jsonb,jsonb,jsonb,jsonb)', '3409a208f5b26211be3406f8d4a93ed074cd1e1a72c6c3eed32f5b2d9c99526b', 'strict=false|leakproof=false|parallel=u|kind=f|retset=false|ret=jsonb|args=uuid,uuid,uuid,uuid,text,integer,bigint,jsonb,jsonb,jsonb,jsonb|modes=-|names=p_actor,p_padre_id,p_hija_id,p_command_id,p_sobre,p_epoca,p_version_esperada,p_sesion,p_estado,p_mercado,p_resumen|defaults=-|ndefaults=0|cost=100|rows=0|def=e26f913d4b994863373db75cd571ed94')),
estado as (
  select (select count(*) from dos where def = vieja) viejas,
         (select count(*) from dos where def = nueva and validada) nuevas,
         (select count(*) from sust s join pg_proc p on p.oid = to_regprocedure('public.' || s.firma)
           where encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') = s.sha) cuerpos),
-- las tres RPC que sustituye: EXECUTE siempre (CREATE OR REPLACE conserva los permisos); SECURITY y
-- search_path solo con sim-004b ya aplicada (antes, su CREATE OR REPLACE los vuelve a fijar)
fsust as (
  select s.firma, p.oid,
         case when p.oid is null then null else
           'anon=' || has_function_privilege('anon', p.oid, 'EXECUTE') || ' authenticated=' || has_function_privilege('authenticated', p.oid, 'EXECUTE')
           || ' PUBLIC=' || exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where a.grantee = 0)
           || ' service_role=' || has_function_privilege('service_role', p.oid, 'EXECUTE')
           -- R3E3-03: los receptores de EXECUTE, con su opcion de concesion (CREATE OR REPLACE conserva la ACL)
           || ' receptores=' || coalesce((select string_agg(case when a.grantee = 0 then 'PUBLIC' else a.grantee::regrole::text end
                                                           || case when a.is_grantable then ' (con opcion de concesion)' else '' end, ',' order by a.grantee::regrole::text collate "C")
                                          from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                                         where a.grantee <> p.proowner and a.privilege_type = 'EXECUTE'), '')
           || case when (select viejas = 0 and nuevas = 2 and cuerpos = 3 from estado)
                   then ' definer=' || p.prosecdef || ' search_path_vacio=' || coalesce('search_path=""' = any (p.proconfig), false)
                        -- E3R2-01: con sim-004b aplicada, todos sus atributos (antes, su CREATE OR REPLACE los vuelve a fijar)
                        || ' atributos=' || concat_ws('|', 'strict=' || p.proisstrict::text, 'leakproof=' || p.proleakproof::text, 'parallel=' || p.proparallel::text, 'kind=' || p.prokind::text, 'retset=' || p.proretset::text, 'ret=' || format_type(p.prorettype, NULL), 'args=' || coalesce((SELECT string_agg(format_type(u.t, NULL), ',' ORDER BY u.n) FROM unnest(p.proargtypes::oid[]) WITH ORDINALITY u(t, n)), ''), 'modes=' || coalesce(p.proargmodes::text, '-'), 'names=' || coalesce(array_to_string(p.proargnames, ','), '-'), 'defaults=' || coalesce(pg_get_expr(p.proargdefaults, 0), '-'), 'ndefaults=' || p.pronargdefaults::text, 'cost=' || p.procost::text, 'rows=' || p.prorows::text, 'def=' || md5(pg_get_functiondef(p.oid))) else '' end end medido,
         'anon=false authenticated=false PUBLIC=false service_role=true receptores=service_role'
           || case when (select viejas = 0 and nuevas = 2 and cuerpos = 3 from estado) then ' definer=true search_path_vacio=true atributos=' || s.atr else '' end esperado
    from sust s left join pg_proc p on p.oid = to_regprocedure('public.' || s.firma)),
restr_esp(rel, nombre, def) as (values
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
    ('sim_trades', 'sim_trades_v1_coherente', 'CHECK ((((motor_version = 0) AND (evento_id IS NULL)) OR ((motor_version = 1) AND (evento_id IS NOT NULL) AND (bruto_micro IS NOT NULL) AND (neto_micro IS NOT NULL) AND (comision_micro IS NOT NULL) AND (spread_micro IS NOT NULL) AND (swap_micro IS NOT NULL) AND (ambigua IS NOT NULL))))')),
restr as (
  select e.rel, e.nombre, e.def esperado,
         (select regexp_replace(pg_get_constraintdef(k.oid), '\mpublic\.', '', 'g') || case when k.convalidated then '' else ' (NO VALIDADA)' end
            from pg_constraint k where k.conrelid = to_regclass('public.' || e.rel) and k.conname = e.nombre) medido
    from restr_esp e),
idx_esp(nombre, def) as (values
    ('sim_alumnos_pkey', 'CREATE UNIQUE INDEX sim_alumnos_pkey ON public.sim_alumnos USING btree (user_id)'),
    ('sim_arrendamientos_pkey', 'CREATE UNIQUE INDEX sim_arrendamientos_pkey ON public.sim_arrendamientos USING btree (session_id)'),
    ('sim_recibos_pkey', 'CREATE UNIQUE INDEX sim_recibos_pkey ON public.sim_recibos USING btree (id)'),
    ('sim_recibos_session_command_key', 'CREATE UNIQUE INDEX sim_recibos_session_command_key ON public.sim_recibos USING btree (session_id, command_id)'),
    ('sim_recibos_ultimo_avance_key', 'CREATE UNIQUE INDEX sim_recibos_ultimo_avance_key ON public.sim_recibos USING btree (session_id) WHERE (clase = ''ultimo_avance''::text)'),
    ('sim_eventos_pkey', 'CREATE UNIQUE INDEX sim_eventos_pkey ON public.sim_eventos USING btree (id)'),
    ('sim_eventos_session_seq_key', 'CREATE UNIQUE INDEX sim_eventos_session_seq_key ON public.sim_eventos USING btree (session_id, seq)'),
    ('sim_eventos_session_command_ordinal_key', 'CREATE UNIQUE INDEX sim_eventos_session_command_ordinal_key ON public.sim_eventos USING btree (session_id, command_id, ordinal)'),
    ('sim_trades_evento_id_key', 'CREATE UNIQUE INDEX sim_trades_evento_id_key ON public.sim_trades USING btree (evento_id)'),
    ('sim_sessions_una_hija_v1_key', 'CREATE UNIQUE INDEX sim_sessions_una_hija_v1_key ON public.sim_sessions USING btree (challenge_parent_id) WHERE ((motor_version = 1) AND (challenge_parent_id IS NOT NULL))')),
idx as (
  select e.nombre, regexp_replace(e.def, '\mpublic\.', '', 'g') esperado,
         (select regexp_replace(pg_get_indexdef(i.indexrelid), '\mpublic\.', '', 'g')
                 || case when i.indisunique then '' else ' (NO UNICO)' end || case when i.indisvalid then '' else ' (NO VALIDO)' end
            from pg_index i where i.indexrelid = to_regclass('public.' || e.nombre)) medido
    from idx_esp e),
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
  select 0.1, r.objeto, 'requisito', r.objeto, r.detalle || ' · ' || case when r.bien then 'coincide' else 'DIFIERE' end from requisito r
  union all
  select 0.2, '', 'sim004b_estado', 'las 2 restricciones y los 3 cuerpos que cambia',
         'restricciones viejas ' || e.viejas || ', nuevas ' || e.nuevas || ' de 2; cuerpos de sim-004b ' || e.cuerpos || ' de 3 · '
         || case when e.viejas = 2 and e.nuevas = 0 and e.cuerpos = 0 then 'sin aplicar · coincide'
                 when e.viejas = 0 and e.nuevas = 2 and e.cuerpos = 3 then 'aplicada · coincide'
                 else 'A MEDIAS o alterada · DIFIERE' end
    from estado e
  union all
  select 0.3, r.nombre, 'restriccion', r.rel || '.' || r.nombre,
         coalesce(r.medido, 'NO EXISTE') || ' · ' || case when r.medido is not distinct from r.esperado then 'coincide' else 'DIFIERE (sim-004b espera ' || r.esperado || ')' end
    from restr r
  union all
  select 0.4, i.nombre, 'indice', i.nombre,
         coalesce(i.medido, 'NO EXISTE') || ' · ' || case when i.medido is not distinct from i.esperado then 'coincide' else 'DIFIERE (sim-004b espera ' || i.esperado || ')' end
    from idx i
  union all
  select 3.5, f.firma, 'funcion_sustituida', f.firma,
         coalesce(f.medido, 'NO EXISTE') || ' · ' || case when f.medido is not distinct from f.esperado then 'coincide' else 'DIFIERE (sim-004b espera ' || f.esperado || ')' end
    from fsust f
  union all
  -- R3E3-04 (revisor interno): ninguna otra funcion de public con el nombre de una acreditada (una sobrecarga
  -- cambia que resuelven las llamadas por nombre)
  select 3.6, 'public', 'homonimos', 'public',
         coalesce((select 'de mas: ' || string_agg(p.oid::regprocedure::text, ', ' order by p.oid::regprocedure::text collate "C") || ' · DIFIERE'
                     from pg_proc p
                    where p.pronamespace = 'public'::regnamespace
                      and p.proname in (select split_part(firma, '(', 1) from fun_esp union select split_part(firma, '(', 1) from sust)
                      and p.oid not in (select to_regprocedure('public.' || firma) from fun_esp where to_regprocedure('public.' || firma) is not null
                                        union select to_regprocedure('public.' || firma) from sust where to_regprocedure('public.' || firma) is not null)), 'ninguno · coincide')
  union all
  -- R3E3B-01 y R3E3B-02 (CTO 17-oct): el inventario exacto de las 14 tablas y las funciones ajenas, el mismo bloque que sim-004b
  select 3.7, i.objeto, i.familia, i.objeto, i.detalle || ' · ' || case when i.bien then 'coincide' else 'DIFIERE' end
    from (
      -- >>> inventario (identico en sql/sim-004b-contrato-v1.sql y sql/consultas/s16-catalogo-sim004b.sql)
      -- R3E3B-01 (revisor interno; CTO 17-oct): el inventario EXACTO de las 14 tablas fuera de pg_proc, por familias,
      -- con las expresiones de la s16b (los textos sin «public.»): la tabla (relkind, persistencia, particion, hijas,
      -- padres, particionada), cada columna (tipo, NOT NULL, identity, generated, colacion, valor por defecto), cada
      -- restriccion (tipo y definicion, validada, diferible), cada indice (pg_get_indexdef), cada regla, y las politicas
      -- de las 3 no protegidas (las de las 11 protegidas ya son exactas aparte). Las dos restricciones que cambia
      -- sim-004b van por nombre: su definicion la acredita su estado. Los disparadores ya tienen inventario exacto aparte
      -- Por familia se compara el recuento y el md5 del conjunto ordenado con lo medido en produccion (s16b, 17-oct;
      -- sql/consultas/salidas/s16b-catalogo-tablas-sim004b-2026-10-17.csv); las tres funciones ajenas, ficha a ficha. Si
      -- algo no coincide, la s16b dice que fila es
      select v.familia, v.objeto, v.detalle, v.bien from (
        with inv as (
          select x.familia, x.fila from (
            select 'tabla'::text familia, r.t || '|' ||
                   case when c.oid is null then 'NO EXISTE'
                        else 'relkind=' || c.relkind::text || ' · persistencia=' || c.relpersistence::text || ' · particion=' || c.relispartition::text
                             || ' · hijas=' || (select count(*) from pg_catalog.pg_inherits i where i.inhparent = c.oid)
                             || ' · padres=' || coalesce((select string_agg(regexp_replace(i.inhparent::regclass::text, '^public\.', ''), ',' order by i.inhseqno) from pg_catalog.pg_inherits i where i.inhrelid = c.oid), '-')
                             || ' · particionada=' || exists (select 1 from pg_catalog.pg_partitioned_table p where p.partrelid = c.oid)::text end fila
              from (values ('sim_alumnos'), ('sim_arrendamientos'), ('sim_recibos'), ('sim_eventos'), ('sim_escrituras_v0'), ('sim_escrituras_v0_marcas'), ('sim_servicio'),
                           ('sim_sessions'), ('sim_trades'), ('session_drawings'), ('session_chart_config'), ('sim_drawing_templates'), ('user_chart_config'), ('user_tool_config')) r(t)
                   left join pg_catalog.pg_class c on c.oid = pg_catalog.to_regclass('public.' || r.t)
            union all
            select 'columna', c.relname || '.' || a.attname || '|' ||
                   'tipo=' || regexp_replace(pg_catalog.format_type(a.atttypid, a.atttypmod), '\mpublic\.', '', 'g')
                   || ' · notnull=' || a.attnotnull::text
                   || ' · identity=' || coalesce(nullif(a.attidentity::text, ''), '-')
                   || ' · generated=' || coalesce(nullif(a.attgenerated::text, ''), '-')
                   || ' · colacion=' || coalesce((select case when a.attcollation = t.typcollation then 'por defecto' else co.collname::text end
                                                    from pg_catalog.pg_collation co, pg_catalog.pg_type t where co.oid = a.attcollation and t.oid = a.atttypid), '-')
                   || ' · defecto=' || coalesce(regexp_replace(pg_catalog.pg_get_expr(d.adbin, d.adrelid), '\mpublic\.', '', 'g'), '-')
              from pg_catalog.pg_class c join pg_catalog.pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
                   left join pg_catalog.pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
             where c.relnamespace = 'public'::regnamespace and c.relname in ('sim_alumnos', 'sim_arrendamientos', 'sim_recibos', 'sim_eventos', 'sim_escrituras_v0', 'sim_escrituras_v0_marcas', 'sim_servicio',
                           'sim_sessions', 'sim_trades', 'session_drawings', 'session_chart_config', 'sim_drawing_templates', 'user_chart_config', 'user_tool_config') and c.relkind = 'r'
            union all
            select 'restriccion', c.relname || '.' || k.conname || '|' ||
                   case when (c.relname, k.conname) in (('sim_sessions', 'sim_sessions_terminal_valida'), ('sim_eventos', 'sim_eventos_tipo_check'))
                        then k.contype::text || ' · (la de sim-004b, segun su estado)'
                        else k.contype::text || ' · ' || regexp_replace(pg_catalog.pg_get_constraintdef(k.oid), '\mpublic\.', '', 'g')
                             || ' · validada=' || k.convalidated::text || ' · diferible=' || k.condeferrable::text || '/' || k.condeferred::text end
              from pg_catalog.pg_class c join pg_catalog.pg_constraint k on k.conrelid = c.oid
             where c.relnamespace = 'public'::regnamespace and c.relname in ('sim_alumnos', 'sim_arrendamientos', 'sim_recibos', 'sim_eventos', 'sim_escrituras_v0', 'sim_escrituras_v0_marcas', 'sim_servicio',
                           'sim_sessions', 'sim_trades', 'session_drawings', 'session_chart_config', 'sim_drawing_templates', 'user_chart_config', 'user_tool_config')
            union all
            select 'indice', c.relname || '.' || ic.relname || '|' || regexp_replace(pg_catalog.pg_get_indexdef(x.indexrelid), '\mpublic\.', '', 'g')
              from pg_catalog.pg_class c join pg_catalog.pg_index x on x.indrelid = c.oid join pg_catalog.pg_class ic on ic.oid = x.indexrelid
             where c.relnamespace = 'public'::regnamespace and c.relname in ('sim_alumnos', 'sim_arrendamientos', 'sim_recibos', 'sim_eventos', 'sim_escrituras_v0', 'sim_escrituras_v0_marcas', 'sim_servicio',
                           'sim_sessions', 'sim_trades', 'session_drawings', 'session_chart_config', 'sim_drawing_templates', 'user_chart_config', 'user_tool_config')
            union all
            select 'regla', c.relname || '.' || w.rulename || '|' || regexp_replace(pg_catalog.pg_get_ruledef(w.oid), '\mpublic\.', '', 'g')
              from pg_catalog.pg_class c join pg_catalog.pg_rewrite w on w.ev_class = c.oid
             where c.relnamespace = 'public'::regnamespace and c.relname in ('sim_alumnos', 'sim_arrendamientos', 'sim_recibos', 'sim_eventos', 'sim_escrituras_v0', 'sim_escrituras_v0_marcas', 'sim_servicio',
                           'sim_sessions', 'sim_trades', 'session_drawings', 'session_chart_config', 'sim_drawing_templates', 'user_chart_config', 'user_tool_config')
            union all
            select 'politica', p.tablename || '.' || p.policyname || '|' ||
                   p.permissive || ' · ' || p.cmd || ' · ' || p.roles::text || ' · using=' || coalesce(regexp_replace(p.qual, '\mpublic\.', '', 'g'), '-')
                   || ' · check=' || coalesce(regexp_replace(p.with_check, '\mpublic\.', '', 'g'), '-')
              from pg_catalog.pg_policies p where p.schemaname = 'public' and p.tablename in ('sim_drawing_templates', 'user_chart_config', 'user_tool_config')
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
        esp_f(familia, n, h) as (values
          ('columna', 135, '28818346b36d6bb04deb43f4b9fc9d1c'),
          ('indice', 31, '34f45c0e9b412391d3d8b9fea837632a'),
          ('politica', 3, 'ae70c7a2dca8be8f6aa6c6eae4d9754f'),
          ('regla', 0, 'd41d8cd98f00b204e9800998ecf8427e'),
          ('restriccion', 59, '8c1bcac993492ca83039e80ec6168d01'),
          ('tabla', 14, 'fbc3d791067856bdb2e543e30481fe17')),
        esp_a(firma, ficha) as (values
          ('auth.uid()', 'functiondef md5=ea3b41bf29e2ad573067939329aa088e · prosrc md5=cdef18c69c4f4cbbced2eaf81e628b49 · probin=- · lenguaje=sql · dueño=supabase_auth_admin · prosecdef=false · provolatile=s · proconfig=- · proisstrict=false · proleakproof=false · proparallel=u · prokind=f · proretset=false · prorettype=uuid · proargmodes=- · proargnames=- · pronargdefaults=0 · procost=100 · prorows=0'),
          ('extensions.digest(bytea,text)', 'functiondef md5=85b88685f74a398b1ff164ad33eeaaca · prosrc md5=926ba3fbdb45dc078b3e3cafddc392cc · probin=$libdir/pgcrypto · lenguaje=c · dueño=postgres · prosecdef=false · provolatile=i · proconfig=- · proisstrict=true · proleakproof=false · proparallel=s · prokind=f · proretset=false · prorettype=bytea · proargmodes=- · proargnames=- · pronargdefaults=0 · procost=1 · prorows=0'),
          ('extensions.gen_random_bytes(integer)', 'functiondef md5=a7569a34c9be929beb24ef5670d42636 · prosrc md5=393a992bef3cadec88b224bd3dace51c · probin=$libdir/pgcrypto · lenguaje=c · dueño=postgres · prosecdef=false · provolatile=v · proconfig=- · proisstrict=true · proleakproof=false · proparallel=s · prokind=f · proretset=false · prorettype=bytea · proargmodes=- · proargnames=- · pronargdefaults=0 · procost=1 · prorows=0')),
        med_f as (select i.familia, count(*)::integer n, pg_catalog.md5(string_agg(i.fila, E'\n' order by i.fila collate "C")) h from inv i where i.familia <> 'funcion_ajena' group by i.familia),
        med_a as (select split_part(i.fila, '|', 1) firma, substr(i.fila, strpos(i.fila, '|') + 1) ficha from inv i where i.familia = 'funcion_ajena')
        select 'inventario'::text familia, e.familia objeto,
               'n=' || coalesce(m.n, 0) || ' md5=' || coalesce(m.h, pg_catalog.md5(''))
               || case when coalesce(m.n, 0) = e.n and coalesce(m.h, pg_catalog.md5('')) = e.h then ''
                       else ' (sim-004b espera n=' || e.n || ' md5=' || e.h || '; que fila, en la s16b)' end detalle,
               coalesce(m.n, 0) = e.n and coalesce(m.h, pg_catalog.md5('')) = e.h bien
          from esp_f e left join med_f m on m.familia = e.familia
        union all
        select 'funcion_ajena', coalesce(e.firma, m.firma),
               coalesce(m.ficha, 'NO EXISTE') || case when e.firma is null then ' (de mas)' when m.ficha is distinct from e.ficha then ' (sim-004b espera ' || e.ficha || ')' else '' end,
               e.firma is not null and m.ficha is not distinct from e.ficha
          from esp_a e full join med_a m on m.firma = e.firma
      ) v
      -- <<< inventario
    ) i
  union all
  select 5, a.t, 'acl_tabla', a.t,
         coalesce(a.medido, 'NO EXISTE') || ' · '
         || case when a.medido is not distinct from a.esperado then 'coincide' else 'DIFIERE (sim-004b espera ' || a.esperado || ')' end
    from acl_m a
  union all
  select 6, r.o, 'acl_receptores', r.o,
         case when r.oid is null and r.o like '%\_seq' then 'no existe (sim-004b no exige las secuencias, solo sus receptores si estan) · coincide'
              when r.oid is null then 'NO EXISTE · DIFIERE' when r.de_mas is null then 'ninguno de mas · coincide'
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
         case when n = 0 then 'lo que exige sim-004b (requisitos, estado, restricciones, indices, rls, force, politicas, funciones, disparadores y ACL de tabla) coincide: se puede aplicar'
              else 'NO aplicar sim-004b: revisar las filas DIFIERE / DE MAS / FALTA y parar (decide el CTO)' end
    from malas
  union all
  select 9, '', 'FIN', 's16', 'consulta'
) x order by o, o2 collate "C", detalle collate "C";
