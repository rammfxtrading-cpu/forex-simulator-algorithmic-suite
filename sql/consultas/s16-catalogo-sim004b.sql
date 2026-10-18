-- ============================================================================
-- CONSULTA DE SOLO LECTURA · S16 · el catalogo que acredita sim-004b, MEDIDO antes de aplicarla
--
-- Diseño revisiones/2026-10-12-diseno-sim-004-y-motor-v1.md, q.16.3 y q.16.6 (CTO 15-oct): los
-- cuerpos de sim-003 y de la preparatoria se miden en produccion antes de aplicar sim-004b. Va en
-- el orden de la etapa 3 (q.13) DESPUES de la puerta y ANTES de sim-004b.
--
-- NO cambia nada: es UNA sola SELECT, sin escrituras ni EXECUTE. No hay nada que editar. Solo
-- catalogo: ni una fila de alumnos. Va DENTRO de una transaccion READ ONLY real (regla del LEEME del
-- buzon, 18-oct; orden 1-027, D2): BEGIN READ ONLY al principio y ROLLBACK al final. Si se pega por
-- partes, o el editor la ejecuta fuera de esa transaccion, la guarda la hace fallar cerrada con el
-- mensaje «s16: pegala ENTERA…», sin dar datos (como la s16h). Ensayada como un ejecutor NO
-- superusuario (pruebas/s16-catalogo-sim004b.mjs), que tambien comprueba que lo que da por bueno es
-- exactamente lo que exige sim-004b. Acaba en «FIN | s16 | consulta».
--
-- Que trae, por este orden (cada fila acaba en «coincide» o en DIFIERE / DE MAS / FALTA):
--   0 requisito      PostgreSQL >= 17, los roles anon, authenticated y service_role (seccion 0) y el
--                    search_path del editor (esquemas efectivos {public,extensions}); y session_replication_role
--                    (origin) y row_security (on), ninguno fijado para la base ni los roles que ejecutan (RE3-01);
--                    y ninguna clave pgrst.* fijada para ellos (CTO 17-oct, orden 1-011; s16g: hoy ninguna)
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
-- Los textos van TAL CUAL los da el catalogo, sin quitar ningun prefijo (RINV3-01, CTO 17-oct: quitar
-- «public.» con regexp_replace tambien lo quitaba de dentro de los literales). Por eso dependen del
-- search_path: la s16 exige el del editor (requisito «search_path») y el inventario lleva sus propios md5.
-- GR1-02 (Astra, guardas r1; orden 1-041): la guarda calificada NO bastaba. Con un «~(text,text)» homonimo en public y
-- un search_path con public delante de pg_catalog, el recuento de «malas» salia 0 con filas DIFIERE (veredicto OK con la
-- puerta desactivada), y un «=(text,text)» homonimo hacia «coincidir» el requisito del search_path. Ahora TODO lo que
-- se ejecuta esta calificado con pg_catalog: operadores (OPERATOR(pg_catalog.x); IN → = any (array[…]), LIKE → ~~,
-- IS [NOT] DISTINCT FROM → coalesce(a = b, a is null and b is null), NULLIF → case), funciones, tipos de las
-- conversiones, catalogos y la colacion "C". SIN SET: sigue midiendo el search_path del editor (los textos de
-- pg_get_* y de ::regclass/::regprocedure dependen de el, a proposito). Equivalencia: el mismo pg_get_viewdef que la de
-- a6bb3a5 salvo esas cuatro formas, y la misma salida, byte a byte, en el ensayo (pruebas/s16-catalogo-sim004b.mjs).
-- LIMITE DECLARADO (RINV2-03, CTO 17-oct): solo catalogo. El ESTADO de las secuencias identity
-- (last_value, is_called; un RESTART o un setval) no es catalogo y cambia con el uso normal: esta
-- consulta NO lo mide. Lo comprueba sim-004b al aplicarse (seccion 0: el siguiente valor de cada
-- secuencia, por encima de max(id), solo con el agregado) y aborta antes de cambiar nada.
-- ============================================================================
begin read only;
with
-- la guarda: falla cerrada si no estamos dentro de la transaccion READ ONLY
guarda as (select case when pg_catalog.current_setting('transaction_read_only') OPERATOR(pg_catalog.=) 'on' then true
                       -- el texto depende de un valor de ejecucion: si fuera constante, PostgreSQL lo convertiria al
                       -- planificar y la guarda saltaria siempre. S10RO-01 (Astra; LEEME «Guardas de las consultas:
                       -- calificadas»): operadores y conversion de pg_catalog, para que un operador homonimo (= o ||)
                       -- en otro esquema del search_path no la haga pasar
                       else ('s16: pegala ENTERA, con su BEGIN READ ONLY y su ROLLBACK (transaction_read_only='
                             OPERATOR(pg_catalog.||) pg_catalog.current_setting('transaction_read_only') OPERATOR(pg_catalog.||) ')')::pg_catalog.bool end ok),
puerta as (select pg_catalog.to_regprocedure('public.sim_escrituras_v0_puerta()') is not null as hay),
tablas(t, protegida) as (values
    ('sim_alumnos', true), ('sim_arrendamientos', true), ('sim_recibos', true), ('sim_eventos', true),
    ('sim_escrituras_v0', true), ('sim_escrituras_v0_marcas', true), ('sim_servicio', true),
    ('sim_sessions', true), ('sim_trades', true), ('session_drawings', true), ('session_chart_config', true),
    ('sim_drawing_templates', false), ('user_chart_config', false), ('user_tool_config', false)),
rls as (
  select t.t, c.relrowsecurity rls, c.relforcerowsecurity forzada,
         coalesce(c.oid is not null and (c.relrowsecurity or not t.protegida) and not c.relforcerowsecurity, false) bien
    from tablas t left join pg_catalog.pg_class c on c.oid OPERATOR(pg_catalog.=) pg_catalog.to_regclass('public.' OPERATOR(pg_catalog.||) t.t)),
pol_med as (
  select p.tablename OPERATOR(pg_catalog.||) '|' OPERATOR(pg_catalog.||) p.policyname OPERATOR(pg_catalog.||) '|' OPERATOR(pg_catalog.||) p.permissive OPERATOR(pg_catalog.||) '|' OPERATOR(pg_catalog.||) p.cmd OPERATOR(pg_catalog.||) '|' OPERATOR(pg_catalog.||) p.roles::pg_catalog.text OPERATOR(pg_catalog.||) '|'
         OPERATOR(pg_catalog.||) coalesce(p.qual, '-') OPERATOR(pg_catalog.||) '|' OPERATOR(pg_catalog.||) coalesce(p.with_check, '-') x
    from pg_catalog.pg_policies p where p.schemaname OPERATOR(pg_catalog.=) 'public' and p.tablename OPERATOR(pg_catalog.=) any (select t from tablas where protegida)),
cond(c) as (values (E'(EXISTS ( SELECT 1\n   FROM sim_sessions s\n  WHERE ((s.id = TABLA.session_id) AND (s.user_id = ( SELECT auth.uid() AS uid)))))')),
pol_esp as (
  select x from (values
    ('sim_recibos|sim_recibos_select_propios|PERMISSIVE|SELECT|{authenticated}|(auth.uid() = user_id)|-'),
    ('sim_eventos|sim_eventos_select_propios|PERMISSIVE|SELECT|{authenticated}|(auth.uid() = user_id)|-'),
    ('sim_servicio|sim_servicio_lectura|PERMISSIVE|SELECT|{authenticated}|true|-')) v(x)
  union all
  select t OPERATOR(pg_catalog.||) '|' OPERATOR(pg_catalog.||) n OPERATOR(pg_catalog.||) '|PERMISSIVE|ALL|{public}|(auth.uid() = user_id)|-'
    from (values ('sim_sessions', 'Users see own sessions'), ('sim_trades', 'Users see own trades'),
                 ('session_drawings', 'user owns session drawings'), ('session_chart_config', 'user owns session config')) v(t, n)
  union all
  select t OPERATOR(pg_catalog.||) '|' OPERATOR(pg_catalog.||) t OPERATOR(pg_catalog.||) '_sesion_propia_insert|RESTRICTIVE|INSERT|{authenticated}|-|' OPERATOR(pg_catalog.||) pg_catalog.replace(c, 'TABLA', t)
    from cond, pg_catalog.unnest(array['sim_trades', 'session_drawings', 'session_chart_config']) t
  union all
  select t OPERATOR(pg_catalog.||) '|' OPERATOR(pg_catalog.||) t OPERATOR(pg_catalog.||) '_sesion_propia_update|RESTRICTIVE|UPDATE|{authenticated}|' OPERATOR(pg_catalog.||) pg_catalog.replace(c, 'TABLA', t) OPERATOR(pg_catalog.||) '|' OPERATOR(pg_catalog.||) pg_catalog.replace(c, 'TABLA', t)
    from cond, pg_catalog.unnest(array['sim_trades', 'session_drawings', 'session_chart_config']) t),
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
         (select pg_catalog.concat_ws('|', l.lanname, p.prosecdef::pg_catalog.text, p.provolatile::pg_catalog.text, coalesce(pg_catalog.array_to_string(p.proconfig, ','), '-'),
                           case when p.proowner OPERATOR(pg_catalog.=) (select r.oid from pg_catalog.pg_roles r where r.rolname OPERATOR(pg_catalog.=) current_user) then 'dueño=ejecutor'
                                else 'dueño=' OPERATOR(pg_catalog.||) pg_catalog.pg_get_userbyid(p.proowner) end,
                           pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p.prosrc, 'UTF8')), 'hex'),
                           coalesce((select pg_catalog.string_agg(g, ',' order by g collate pg_catalog."C") from (
                                       -- R3E3-03 (revisor interno): la opcion de concesion tambien cuenta
                                       select case when a.grantee OPERATOR(pg_catalog.=) 0 then 'PUBLIC' else a.grantee::pg_catalog.regrole::pg_catalog.text end
                                              OPERATOR(pg_catalog.||) case when a.is_grantable then ' (con opcion de concesion)' else '' end g
                                         from pg_catalog.aclexplode(coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))) a
                                        where a.grantee OPERATOR(pg_catalog.<>) p.proowner and a.privilege_type OPERATOR(pg_catalog.=) 'EXECUTE') x), ''),
                           -- E3R2-01 (Astra r2; CTO 16-oct): todos los atributos de pg_proc y el md5 de pg_get_functiondef (la misma expresion que sim-004b)
                           pg_catalog.concat_ws('|', 'strict=' OPERATOR(pg_catalog.||) p.proisstrict::pg_catalog.text, 'leakproof=' OPERATOR(pg_catalog.||) p.proleakproof::pg_catalog.text, 'parallel=' OPERATOR(pg_catalog.||) p.proparallel::pg_catalog.text, 'kind=' OPERATOR(pg_catalog.||) p.prokind::pg_catalog.text, 'retset=' OPERATOR(pg_catalog.||) p.proretset::pg_catalog.text, 'ret=' OPERATOR(pg_catalog.||) pg_catalog.format_type(p.prorettype, NULL), 'args=' OPERATOR(pg_catalog.||) coalesce((SELECT pg_catalog.string_agg(pg_catalog.format_type(u.t, NULL), ',' ORDER BY u.n) FROM pg_catalog.unnest(p.proargtypes::pg_catalog.oid[]) WITH ORDINALITY u(t, n)), ''), 'modes=' OPERATOR(pg_catalog.||) coalesce(p.proargmodes::pg_catalog.text, '-'), 'names=' OPERATOR(pg_catalog.||) coalesce(pg_catalog.array_to_string(p.proargnames, ','), '-'), 'defaults=' OPERATOR(pg_catalog.||) coalesce(pg_catalog.pg_get_expr(p.proargdefaults, 0), '-'), 'ndefaults=' OPERATOR(pg_catalog.||) p.pronargdefaults::pg_catalog.text, 'cost=' OPERATOR(pg_catalog.||) p.procost::pg_catalog.text, 'rows=' OPERATOR(pg_catalog.||) p.prorows::pg_catalog.text, 'def=' OPERATOR(pg_catalog.||) pg_catalog.md5(pg_catalog.pg_get_functiondef(p.oid))))
            from pg_catalog.pg_proc p join pg_catalog.pg_language l on l.oid OPERATOR(pg_catalog.=) p.prolang where p.oid OPERATOR(pg_catalog.=) pg_catalog.to_regprocedure('public.' OPERATOR(pg_catalog.||) e.firma)) medido,
         (select 'md5 ' OPERATOR(pg_catalog.||) pg_catalog.md5(p.prosrc) OPERATOR(pg_catalog.||) ' · dueño ' OPERATOR(pg_catalog.||) pg_catalog.pg_get_userbyid(p.proowner) OPERATOR(pg_catalog.||) ' · acl ' OPERATOR(pg_catalog.||) coalesce(p.proacl::pg_catalog.text, '(por defecto)')
            from pg_catalog.pg_proc p where p.oid OPERATOR(pg_catalog.=) pg_catalog.to_regprocedure('public.' OPERATOR(pg_catalog.||) e.firma)) crudo
    from fun_esp e, puerta where not e.solo_con_puerta or puerta.hay),
tri_esp(x, solo_con_puerta) as (values
    ('auth.users|fk:session_chart_config_user_id_fkey|"RI_FKey_cascade_del"() · when=no · args=0: · ref=session_chart_config · indice=auth.users_pkey · diferible=false/false · columnas=|9|O', false),
    ('auth.users|fk:session_chart_config_user_id_fkey|"RI_FKey_noaction_upd"() · when=no · args=0: · ref=session_chart_config · indice=auth.users_pkey · diferible=false/false · columnas=|17|O', false),
    ('auth.users|fk:session_drawings_user_id_fkey|"RI_FKey_cascade_del"() · when=no · args=0: · ref=session_drawings · indice=auth.users_pkey · diferible=false/false · columnas=|9|O', false),
    ('auth.users|fk:session_drawings_user_id_fkey|"RI_FKey_noaction_upd"() · when=no · args=0: · ref=session_drawings · indice=auth.users_pkey · diferible=false/false · columnas=|17|O', false),
    ('auth.users|fk:sim_drawing_templates_user_id_fkey|"RI_FKey_cascade_del"() · when=no · args=0: · ref=sim_drawing_templates · indice=auth.users_pkey · diferible=false/false · columnas=|9|O', false),
    ('auth.users|fk:sim_drawing_templates_user_id_fkey|"RI_FKey_noaction_upd"() · when=no · args=0: · ref=sim_drawing_templates · indice=auth.users_pkey · diferible=false/false · columnas=|17|O', false),
    ('auth.users|fk:sim_sessions_user_id_fkey|"RI_FKey_cascade_del"() · when=no · args=0: · ref=sim_sessions · indice=auth.users_pkey · diferible=false/false · columnas=|9|O', false),
    ('auth.users|fk:sim_sessions_user_id_fkey|"RI_FKey_noaction_upd"() · when=no · args=0: · ref=sim_sessions · indice=auth.users_pkey · diferible=false/false · columnas=|17|O', false),
    ('auth.users|fk:sim_trades_user_id_fkey|"RI_FKey_cascade_del"() · when=no · args=0: · ref=sim_trades · indice=auth.users_pkey · diferible=false/false · columnas=|9|O', false),
    ('auth.users|fk:sim_trades_user_id_fkey|"RI_FKey_noaction_upd"() · when=no · args=0: · ref=sim_trades · indice=auth.users_pkey · diferible=false/false · columnas=|17|O', false),
    ('auth.users|fk:user_chart_config_user_id_fkey|"RI_FKey_cascade_del"() · when=no · args=0: · ref=user_chart_config · indice=auth.users_pkey · diferible=false/false · columnas=|9|O', false),
    ('auth.users|fk:user_chart_config_user_id_fkey|"RI_FKey_noaction_upd"() · when=no · args=0: · ref=user_chart_config · indice=auth.users_pkey · diferible=false/false · columnas=|17|O', false),
    ('auth.users|fk:user_tool_config_user_id_fkey|"RI_FKey_cascade_del"() · when=no · args=0: · ref=user_tool_config · indice=auth.users_pkey · diferible=false/false · columnas=|9|O', false),
    ('auth.users|fk:user_tool_config_user_id_fkey|"RI_FKey_noaction_upd"() · when=no · args=0: · ref=user_tool_config · indice=auth.users_pkey · diferible=false/false · columnas=|17|O', false),
    ('profiles|fk:sim_alumnos_user_id_fkey|"RI_FKey_cascade_del"() · when=no · args=0: · ref=sim_alumnos · indice=profiles_pkey · diferible=false/false · columnas=|9|O', false),
    ('profiles|fk:sim_alumnos_user_id_fkey|"RI_FKey_noaction_upd"() · when=no · args=0: · ref=sim_alumnos · indice=profiles_pkey · diferible=false/false · columnas=|17|O', false),
    ('profiles|fk:sim_sessions_user_id_perfil_fkey|"RI_FKey_cascade_del"() · when=no · args=0: · ref=sim_sessions · indice=profiles_pkey · diferible=false/false · columnas=|9|O', false),
    ('profiles|fk:sim_sessions_user_id_perfil_fkey|"RI_FKey_noaction_upd"() · when=no · args=0: · ref=sim_sessions · indice=profiles_pkey · diferible=false/false · columnas=|17|O', false),
    ('sim_sessions|fk:session_chart_config_session_id_fkey|"RI_FKey_cascade_del"() · when=no · args=0: · ref=session_chart_config · indice=sim_sessions_pkey · diferible=false/false · columnas=|9|O', false),
    ('sim_sessions|fk:session_chart_config_session_id_fkey|"RI_FKey_noaction_upd"() · when=no · args=0: · ref=session_chart_config · indice=sim_sessions_pkey · diferible=false/false · columnas=|17|O', false),
    ('sim_sessions|fk:session_drawings_session_id_fkey|"RI_FKey_cascade_del"() · when=no · args=0: · ref=session_drawings · indice=sim_sessions_pkey · diferible=false/false · columnas=|9|O', false),
    ('sim_sessions|fk:session_drawings_session_id_fkey|"RI_FKey_noaction_upd"() · when=no · args=0: · ref=session_drawings · indice=sim_sessions_pkey · diferible=false/false · columnas=|17|O', false),
    ('sim_sessions|fk:sim_arrendamientos_session_id_fkey|"RI_FKey_cascade_del"() · when=no · args=0: · ref=sim_arrendamientos · indice=sim_sessions_pkey · diferible=false/false · columnas=|9|O', false),
    ('sim_sessions|fk:sim_arrendamientos_session_id_fkey|"RI_FKey_noaction_upd"() · when=no · args=0: · ref=sim_arrendamientos · indice=sim_sessions_pkey · diferible=false/false · columnas=|17|O', false),
    ('sim_sessions|fk:sim_eventos_session_id_fkey|"RI_FKey_cascade_del"() · when=no · args=0: · ref=sim_eventos · indice=sim_sessions_pkey · diferible=false/false · columnas=|9|O', false),
    ('sim_sessions|fk:sim_eventos_session_id_fkey|"RI_FKey_noaction_upd"() · when=no · args=0: · ref=sim_eventos · indice=sim_sessions_pkey · diferible=false/false · columnas=|17|O', false),
    ('sim_sessions|fk:sim_recibos_session_id_fkey|"RI_FKey_cascade_del"() · when=no · args=0: · ref=sim_recibos · indice=sim_sessions_pkey · diferible=false/false · columnas=|9|O', false),
    ('sim_sessions|fk:sim_recibos_session_id_fkey|"RI_FKey_noaction_upd"() · when=no · args=0: · ref=sim_recibos · indice=sim_sessions_pkey · diferible=false/false · columnas=|17|O', false),
    ('sim_sessions|fk:sim_sessions_challenge_parent_id_fkey|"RI_FKey_check_ins"() · when=no · args=0: · ref=sim_sessions · indice=sim_sessions_pkey · diferible=false/false · columnas=|5|O', false),
    ('sim_sessions|fk:sim_sessions_challenge_parent_id_fkey|"RI_FKey_check_upd"() · when=no · args=0: · ref=sim_sessions · indice=sim_sessions_pkey · diferible=false/false · columnas=|17|O', false),
    ('sim_sessions|fk:sim_sessions_challenge_parent_id_fkey|"RI_FKey_noaction_upd"() · when=no · args=0: · ref=sim_sessions · indice=sim_sessions_pkey · diferible=false/false · columnas=|17|O', false),
    ('sim_sessions|fk:sim_sessions_challenge_parent_id_fkey|"RI_FKey_setnull_del"() · when=no · args=0: · ref=sim_sessions · indice=sim_sessions_pkey · diferible=false/false · columnas=|9|O', false),
    ('sim_sessions|fk:sim_sessions_user_id_fkey|"RI_FKey_check_ins"() · when=no · args=0: · ref=auth.users · indice=auth.users_pkey · diferible=false/false · columnas=|5|O', false),
    ('sim_sessions|fk:sim_sessions_user_id_fkey|"RI_FKey_check_upd"() · when=no · args=0: · ref=auth.users · indice=auth.users_pkey · diferible=false/false · columnas=|17|O', false),
    ('sim_sessions|fk:sim_sessions_user_id_perfil_fkey|"RI_FKey_check_ins"() · when=no · args=0: · ref=profiles · indice=profiles_pkey · diferible=false/false · columnas=|5|O', false),
    ('sim_sessions|fk:sim_sessions_user_id_perfil_fkey|"RI_FKey_check_upd"() · when=no · args=0: · ref=profiles · indice=profiles_pkey · diferible=false/false · columnas=|17|O', false),
    ('sim_sessions|fk:sim_trades_session_id_fkey|"RI_FKey_cascade_del"() · when=no · args=0: · ref=sim_trades · indice=sim_sessions_pkey · diferible=false/false · columnas=|9|O', false),
    ('sim_sessions|fk:sim_trades_session_id_fkey|"RI_FKey_noaction_upd"() · when=no · args=0: · ref=sim_trades · indice=sim_sessions_pkey · diferible=false/false · columnas=|17|O', false),
    ('sim_sessions|trg_enforce_sim_session_limit|CREATE TRIGGER trg_enforce_sim_session_limit BEFORE INSERT ON public.sim_sessions FOR EACH ROW EXECUTE FUNCTION enforce_sim_session_limit()|7|O', false),
    ('sim_trades|fk:sim_trades_evento_id_fkey|"RI_FKey_check_ins"() · when=no · args=0: · ref=sim_eventos · indice=sim_eventos_pkey · diferible=false/false · columnas=|5|O', false),
    ('sim_trades|fk:sim_trades_evento_id_fkey|"RI_FKey_check_upd"() · when=no · args=0: · ref=sim_eventos · indice=sim_eventos_pkey · diferible=false/false · columnas=|17|O', false),
    ('sim_trades|fk:sim_trades_session_id_fkey|"RI_FKey_check_ins"() · when=no · args=0: · ref=sim_sessions · indice=sim_sessions_pkey · diferible=false/false · columnas=|5|O', false),
    ('sim_trades|fk:sim_trades_session_id_fkey|"RI_FKey_check_upd"() · when=no · args=0: · ref=sim_sessions · indice=sim_sessions_pkey · diferible=false/false · columnas=|17|O', false),
    ('sim_trades|fk:sim_trades_user_id_fkey|"RI_FKey_check_ins"() · when=no · args=0: · ref=auth.users · indice=auth.users_pkey · diferible=false/false · columnas=|5|O', false),
    ('sim_trades|fk:sim_trades_user_id_fkey|"RI_FKey_check_upd"() · when=no · args=0: · ref=auth.users · indice=auth.users_pkey · diferible=false/false · columnas=|17|O', false),
    ('sim_escrituras_v0_marcas|sim_escrituras_v0_inmutable_fila|CREATE TRIGGER sim_escrituras_v0_inmutable_fila BEFORE DELETE OR UPDATE ON public.sim_escrituras_v0_marcas FOR EACH ROW EXECUTE FUNCTION sim_escrituras_v0_inmutable()|27|O', false),
    ('sim_escrituras_v0_marcas|sim_escrituras_v0_inmutable_truncate|CREATE TRIGGER sim_escrituras_v0_inmutable_truncate BEFORE TRUNCATE ON public.sim_escrituras_v0_marcas FOR EACH STATEMENT EXECUTE FUNCTION sim_escrituras_v0_inmutable()|34|O', false),
    ('sim_escrituras_v0_marcas|sim_escrituras_v0_solo_disparador|CREATE TRIGGER sim_escrituras_v0_solo_disparador BEFORE INSERT ON public.sim_escrituras_v0_marcas FOR EACH ROW EXECUTE FUNCTION sim_escrituras_v0_solo_disparador()|7|O', false),
    ('sim_escrituras_v0|sim_escrituras_v0_inmutable_fila|CREATE TRIGGER sim_escrituras_v0_inmutable_fila BEFORE DELETE OR UPDATE ON public.sim_escrituras_v0 FOR EACH ROW EXECUTE FUNCTION sim_escrituras_v0_inmutable()|27|O', false),
    ('sim_escrituras_v0|sim_escrituras_v0_inmutable_truncate|CREATE TRIGGER sim_escrituras_v0_inmutable_truncate BEFORE TRUNCATE ON public.sim_escrituras_v0 FOR EACH STATEMENT EXECUTE FUNCTION sim_escrituras_v0_inmutable()|34|O', false),
    ('sim_escrituras_v0|sim_escrituras_v0_solo_disparador|CREATE TRIGGER sim_escrituras_v0_solo_disparador BEFORE INSERT ON public.sim_escrituras_v0 FOR EACH ROW EXECUTE FUNCTION sim_escrituras_v0_solo_disparador()|7|O', false),
    ('sim_sessions|sim_escrituras_v0_a|CREATE TRIGGER sim_escrituras_v0_a AFTER INSERT OR DELETE OR UPDATE ON public.sim_sessions FOR EACH ROW EXECUTE FUNCTION sim_escrituras_v0_registra()|29|O', false),
    ('sim_sessions|sim_escrituras_v0_b_balance|CREATE TRIGGER sim_escrituras_v0_b_balance AFTER UPDATE OF balance ON public.sim_sessions FOR EACH ROW EXECUTE FUNCTION sim_escrituras_v0_marca_balance()|17|O', false),
    ('sim_sessions|sim_sessions_padre_propio|CREATE TRIGGER sim_sessions_padre_propio BEFORE INSERT OR UPDATE ON public.sim_sessions FOR EACH ROW EXECUTE FUNCTION sim_sessions_padre_propio()|23|O', false),
    ('sim_sessions|sim_sessions_rev_saldo|CREATE TRIGGER sim_sessions_rev_saldo BEFORE INSERT OR UPDATE ON public.sim_sessions FOR EACH ROW EXECUTE FUNCTION sim_sessions_rev_saldo()|23|O', false),
    ('sim_trades|sim_escrituras_v0_a|CREATE TRIGGER sim_escrituras_v0_a AFTER INSERT OR DELETE OR UPDATE ON public.sim_trades FOR EACH ROW EXECUTE FUNCTION sim_escrituras_v0_registra()|29|O', false),
    ('sim_trades|sim_trades_rev_saldo|CREATE TRIGGER sim_trades_rev_saldo AFTER INSERT OR DELETE OR UPDATE ON public.sim_trades FOR EACH ROW EXECUTE FUNCTION sim_trades_rev_saldo()|29|O', false),
    ('session_chart_config|fk:session_chart_config_session_id_fkey|"RI_FKey_check_ins"() · when=no · args=0: · ref=sim_sessions · indice=sim_sessions_pkey · diferible=false/false · columnas=|5|O', false),
    ('session_chart_config|fk:session_chart_config_session_id_fkey|"RI_FKey_check_upd"() · when=no · args=0: · ref=sim_sessions · indice=sim_sessions_pkey · diferible=false/false · columnas=|17|O', false),
    ('session_chart_config|fk:session_chart_config_user_id_fkey|"RI_FKey_check_ins"() · when=no · args=0: · ref=auth.users · indice=auth.users_pkey · diferible=false/false · columnas=|5|O', false),
    ('session_chart_config|fk:session_chart_config_user_id_fkey|"RI_FKey_check_upd"() · when=no · args=0: · ref=auth.users · indice=auth.users_pkey · diferible=false/false · columnas=|17|O', false),
    ('session_drawings|fk:session_drawings_session_id_fkey|"RI_FKey_check_ins"() · when=no · args=0: · ref=sim_sessions · indice=sim_sessions_pkey · diferible=false/false · columnas=|5|O', false),
    ('session_drawings|fk:session_drawings_session_id_fkey|"RI_FKey_check_upd"() · when=no · args=0: · ref=sim_sessions · indice=sim_sessions_pkey · diferible=false/false · columnas=|17|O', false),
    ('session_drawings|fk:session_drawings_user_id_fkey|"RI_FKey_check_ins"() · when=no · args=0: · ref=auth.users · indice=auth.users_pkey · diferible=false/false · columnas=|5|O', false),
    ('session_drawings|fk:session_drawings_user_id_fkey|"RI_FKey_check_upd"() · when=no · args=0: · ref=auth.users · indice=auth.users_pkey · diferible=false/false · columnas=|17|O', false),
    ('sim_alumnos|fk:sim_alumnos_user_id_fkey|"RI_FKey_check_ins"() · when=no · args=0: · ref=profiles · indice=profiles_pkey · diferible=false/false · columnas=|5|O', false),
    ('sim_alumnos|fk:sim_alumnos_user_id_fkey|"RI_FKey_check_upd"() · when=no · args=0: · ref=profiles · indice=profiles_pkey · diferible=false/false · columnas=|17|O', false),
    ('sim_arrendamientos|fk:sim_arrendamientos_session_id_fkey|"RI_FKey_check_ins"() · when=no · args=0: · ref=sim_sessions · indice=sim_sessions_pkey · diferible=false/false · columnas=|5|O', false),
    ('sim_arrendamientos|fk:sim_arrendamientos_session_id_fkey|"RI_FKey_check_upd"() · when=no · args=0: · ref=sim_sessions · indice=sim_sessions_pkey · diferible=false/false · columnas=|17|O', false),
    ('sim_drawing_templates|fk:sim_drawing_templates_user_id_fkey|"RI_FKey_check_ins"() · when=no · args=0: · ref=auth.users · indice=auth.users_pkey · diferible=false/false · columnas=|5|O', false),
    ('sim_drawing_templates|fk:sim_drawing_templates_user_id_fkey|"RI_FKey_check_upd"() · when=no · args=0: · ref=auth.users · indice=auth.users_pkey · diferible=false/false · columnas=|17|O', false),
    ('sim_eventos|fk:sim_eventos_session_id_fkey|"RI_FKey_check_ins"() · when=no · args=0: · ref=sim_sessions · indice=sim_sessions_pkey · diferible=false/false · columnas=|5|O', false),
    ('sim_eventos|fk:sim_eventos_session_id_fkey|"RI_FKey_check_upd"() · when=no · args=0: · ref=sim_sessions · indice=sim_sessions_pkey · diferible=false/false · columnas=|17|O', false),
    ('sim_eventos|fk:sim_trades_evento_id_fkey|"RI_FKey_cascade_del"() · when=no · args=0: · ref=sim_trades · indice=sim_eventos_pkey · diferible=false/false · columnas=|9|O', false),
    ('sim_eventos|fk:sim_trades_evento_id_fkey|"RI_FKey_noaction_upd"() · when=no · args=0: · ref=sim_trades · indice=sim_eventos_pkey · diferible=false/false · columnas=|17|O', false),
    ('sim_recibos|fk:sim_recibos_session_id_fkey|"RI_FKey_check_ins"() · when=no · args=0: · ref=sim_sessions · indice=sim_sessions_pkey · diferible=false/false · columnas=|5|O', false),
    ('sim_recibos|fk:sim_recibos_session_id_fkey|"RI_FKey_check_upd"() · when=no · args=0: · ref=sim_sessions · indice=sim_sessions_pkey · diferible=false/false · columnas=|17|O', false),
    ('user_chart_config|fk:user_chart_config_user_id_fkey|"RI_FKey_check_ins"() · when=no · args=0: · ref=auth.users · indice=auth.users_pkey · diferible=false/false · columnas=|5|O', false),
    ('user_chart_config|fk:user_chart_config_user_id_fkey|"RI_FKey_check_upd"() · when=no · args=0: · ref=auth.users · indice=auth.users_pkey · diferible=false/false · columnas=|17|O', false),
    ('user_tool_config|fk:user_tool_config_user_id_fkey|"RI_FKey_check_ins"() · when=no · args=0: · ref=auth.users · indice=auth.users_pkey · diferible=false/false · columnas=|5|O', false),
    ('user_tool_config|fk:user_tool_config_user_id_fkey|"RI_FKey_check_upd"() · when=no · args=0: · ref=auth.users · indice=auth.users_pkey · diferible=false/false · columnas=|17|O', false),
    ('sim_sessions|sim_escrituras_v0_puerta|CREATE TRIGGER sim_escrituras_v0_puerta BEFORE INSERT OR DELETE OR UPDATE ON public.sim_sessions FOR EACH ROW EXECUTE FUNCTION sim_escrituras_v0_puerta()|31|O', true),
    ('sim_trades|sim_escrituras_v0_puerta|CREATE TRIGGER sim_escrituras_v0_puerta BEFORE INSERT OR DELETE OR UPDATE ON public.sim_trades FOR EACH ROW EXECUTE FUNCTION sim_escrituras_v0_puerta()|31|O', true)),
tri_e as (select x from tri_esp, puerta where not tri_esp.solo_con_puerta or puerta.hay),
tri_med as (
  select c.oid::pg_catalog.regclass::pg_catalog.text OPERATOR(pg_catalog.||) '|' OPERATOR(pg_catalog.||)
           case when t.tgisinternal then 'fk:' OPERATOR(pg_catalog.||) k.conname OPERATOR(pg_catalog.||) '|' OPERATOR(pg_catalog.||) t.tgfoid::pg_catalog.regprocedure::pg_catalog.text
                -- E3R3-03 (Astra r3): lo que decide si y como se ejecuta, sin OIDs ni nombres generados
                OPERATOR(pg_catalog.||) ' · when=' OPERATOR(pg_catalog.||) CASE WHEN t.tgqual IS NULL THEN 'no' ELSE 'SI' END OPERATOR(pg_catalog.||) ' · args=' OPERATOR(pg_catalog.||) t.tgnargs OPERATOR(pg_catalog.||) ':' OPERATOR(pg_catalog.||) pg_catalog.encode(t.tgargs, 'hex')
                OPERATOR(pg_catalog.||) ' · ref=' OPERATOR(pg_catalog.||) CASE WHEN t.tgconstrrelid OPERATOR(pg_catalog.=) 0 THEN '-' ELSE t.tgconstrrelid::pg_catalog.regclass::pg_catalog.text END
                OPERATOR(pg_catalog.||) ' · indice=' OPERATOR(pg_catalog.||) CASE WHEN t.tgconstrindid OPERATOR(pg_catalog.=) 0 THEN '-' ELSE t.tgconstrindid::pg_catalog.regclass::pg_catalog.text END
                OPERATOR(pg_catalog.||) ' · diferible=' OPERATOR(pg_catalog.||) t.tgdeferrable::pg_catalog.text OPERATOR(pg_catalog.||) '/' OPERATOR(pg_catalog.||) t.tginitdeferred::pg_catalog.text OPERATOR(pg_catalog.||) ' · columnas=' OPERATOR(pg_catalog.||) t.tgattr::pg_catalog.text
                else t.tgname OPERATOR(pg_catalog.||) '|' OPERATOR(pg_catalog.||) pg_catalog.pg_get_triggerdef(t.oid) end
           OPERATOR(pg_catalog.||) '|' OPERATOR(pg_catalog.||) t.tgtype OPERATOR(pg_catalog.||) '|' OPERATOR(pg_catalog.||) t.tgenabled::pg_catalog.text x
    from pg_catalog.pg_trigger t join pg_catalog.pg_class c on c.oid OPERATOR(pg_catalog.=) t.tgrelid left join pg_catalog.pg_constraint k on k.oid OPERATOR(pg_catalog.=) t.tgconstraint
   where c.oid OPERATOR(pg_catalog.=) any (select pg_catalog.to_regclass('public.' OPERATOR(pg_catalog.||) t) from tablas)
      -- E3R3-03: y los del otro extremo de sus FK (en profiles y auth.users: la cascada al borrar el perfil)
      or t.tgconstraint OPERATOR(pg_catalog.=) any (select k2.oid from pg_catalog.pg_constraint k2 where k2.contype OPERATOR(pg_catalog.=) 'f' and k2.conrelid OPERATOR(pg_catalog.=) any (select pg_catalog.to_regclass('public.' OPERATOR(pg_catalog.||) t) from tablas))),
-- 0-3 lo que sim-004b exige ANTES de su seccion 4 (revisor de d20dcef, H1; CTO: la s16 mide TODO lo
-- que sim-004b exige, ni mas ni menos). Las definiciones, COPIADAS de sql/sim-004b-contrato-v1.sql (la
-- prueba lo comprueba); los textos tal cual, con el search_path del editor (sus esquemas efectivos son los
-- mismos que los de search_path = public, con el que sim-004b compara estas: el requisito «search_path»).
-- RE3-01 (revisor interno de c4d46e3; CTO 17-oct, orden 1-010): los ajustes que cambian la semantica sin tocar el
-- catalogo. session_replication_role = replica apaga los disparadores (tambien los de las FK) y row_security = off cambia
-- la RLS: efectivos origin y on, y ninguno fijado en pg_db_role_setting para la base o para los roles que ejecutan
-- (postgres, authenticator, authenticated, anon, service_role y el ejecutor). SOLO por nombre: no se lee ni se imprime
-- ningun valor de pg_db_role_setting (los de Supabase pueden ser secretos). El resto de pg_db_role_setting queda fuera:
-- limite declarado
ajuste as (
  select g.nombre, coalesce(pg_catalog.current_setting(g.nombre, true) OPERATOR(pg_catalog.=) g.esperado, true) efectivo_bien, f.donde,
         g.nombre OPERATOR(pg_catalog.||) case when g.esperado is null then '' else ': efectivo ' OPERATOR(pg_catalog.||) g.esperado OPERATOR(pg_catalog.||) '=' OPERATOR(pg_catalog.||) (pg_catalog.current_setting(g.nombre, true) OPERATOR(pg_catalog.=) g.esperado)::pg_catalog.text end
         OPERATOR(pg_catalog.||) ' · fijado en pg_db_role_setting: ' OPERATOR(pg_catalog.||) coalesce(f.donde, 'ninguno') detalle
    from (values ('session_replication_role', 'origin'), ('row_security', 'on'), ('pgrst.*', null)) g(nombre, esperado)
         left join (select case when pg_catalog.split_part(c.x, '=', 1) OPERATOR(pg_catalog.~~) 'pgrst.%' then 'pgrst.*' else pg_catalog.split_part(c.x, '=', 1) end nombre,
           pg_catalog.string_agg(case when s.setrole OPERATOR(pg_catalog.=) 0 then 'base' else 'rol ' OPERATOR(pg_catalog.||) r.rolname::pg_catalog.text end
                      OPERATOR(pg_catalog.||) case when s.setdatabase OPERATOR(pg_catalog.=) 0 then ' (en todas las bases)' else '' end
                      OPERATOR(pg_catalog.||) case when pg_catalog.split_part(c.x, '=', 1) OPERATOR(pg_catalog.~~) 'pgrst.%' then ': ' OPERATOR(pg_catalog.||) pg_catalog.split_part(c.x, '=', 1) else '' end, ', '
                      order by case when s.setrole OPERATOR(pg_catalog.=) 0 then 'base' else 'rol ' OPERATOR(pg_catalog.||) r.rolname::pg_catalog.text end) donde
      from pg_catalog.pg_db_role_setting s left join pg_catalog.pg_roles r on r.oid OPERATOR(pg_catalog.=) s.setrole
           cross join lateral pg_catalog.unnest(s.setconfig) c(x)
     where (s.setdatabase OPERATOR(pg_catalog.=) 0 or s.setdatabase OPERATOR(pg_catalog.=) (select d.oid from pg_catalog.pg_database d where d.datname OPERATOR(pg_catalog.=) pg_catalog.current_database()))
       -- CTO 17-oct, orden 1-011: y el dueño de las RPC y todo rol miembro de authenticator o del que authenticator sea miembro
       and (s.setrole OPERATOR(pg_catalog.=) 0 or r.rolname OPERATOR(pg_catalog.=) any (array['postgres', 'authenticator', 'authenticated', 'anon', 'service_role']::pg_catalog.name[]) or r.rolname OPERATOR(pg_catalog.=) current_user
            or r.oid OPERATOR(pg_catalog.=) (select p.proowner from pg_catalog.pg_proc p where p.oid OPERATOR(pg_catalog.=) pg_catalog.to_regprocedure('public.sim_crear_sesion(uuid,uuid,uuid,text,integer,jsonb,jsonb,jsonb,jsonb)'))
            or exists (select 1 from pg_catalog.pg_roles a where a.rolname OPERATOR(pg_catalog.=) 'authenticator' and r.oid OPERATOR(pg_catalog.<>) a.oid
                       and (pg_catalog.pg_has_role(r.oid, a.oid, 'MEMBER') or pg_catalog.pg_has_role(a.oid, r.oid, 'MEMBER'))))
       and (pg_catalog.split_part(c.x, '=', 1) OPERATOR(pg_catalog.=) any (array['session_replication_role', 'row_security']) or pg_catalog.split_part(c.x, '=', 1) OPERATOR(pg_catalog.~~) 'pgrst.%')
     group by 1) f on f.nombre OPERATOR(pg_catalog.=) g.nombre),
requisito(objeto, bien, detalle) as (
  select a.nombre, a.efectivo_bien and a.donde is null, a.detalle from ajuste a
  union all
-- RE4-01 (revisor interno de d2910e6): los roles del alumno sin BYPASSRLS ni superusuario (ALTER ROLE authenticated
-- BYPASSRLS es DDL ordinario para postgres, que tiene ADMIN sobre ellos, s06, y deja ver y escribir lo ajeno); y el USAGE
-- de los esquemas que usan: el dueño de las RPC en public y extensions, authenticated en public y auth (sin el, 42501)
  select 'roles del alumno' objeto,
         coalesce(pg_catalog.bool_and(not r.rolsuper and not r.rolbypassrls), false) and pg_catalog.count(*) OPERATOR(pg_catalog.=) 2 bien,
         coalesce(pg_catalog.string_agg(r.rolname::pg_catalog.text OPERATOR(pg_catalog.||) ': superusuario=' OPERATOR(pg_catalog.||) r.rolsuper::pg_catalog.text OPERATOR(pg_catalog.||) ' bypassrls=' OPERATOR(pg_catalog.||) r.rolbypassrls::pg_catalog.text, ' · ' order by r.rolname), 'NO EXISTEN') detalle
    from pg_catalog.pg_roles r where r.rolname OPERATOR(pg_catalog.=) any (array['anon', 'authenticated']::pg_catalog.name[])
  union all
  select 'uso de esquemas',
         pg_catalog.bool_and(coalesce(u.uso, false)),
         pg_catalog.string_agg(u.quien OPERATOR(pg_catalog.||) ' USAGE ' OPERATOR(pg_catalog.||) u.esquema OPERATOR(pg_catalog.||) '=' OPERATOR(pg_catalog.||) coalesce(u.uso::pg_catalog.text, 'NO EXISTE'), ' · ' order by u.quien, u.esquema)
    from (select 'dueño_rpc' quien, e.esquema, pg_catalog.has_schema_privilege(o.proowner, e.esquema, 'USAGE') uso
            from (values ('public'), ('extensions')) e(esquema)
                 left join pg_catalog.pg_proc o on o.oid OPERATOR(pg_catalog.=) pg_catalog.to_regprocedure('public.sim_crear_sesion(uuid,uuid,uuid,text,integer,jsonb,jsonb,jsonb,jsonb)')
          union all
          select 'authenticated', e.esquema, pg_catalog.has_schema_privilege('authenticated', e.esquema, 'USAGE')
            from (values ('public'), ('auth')) e(esquema)) u
  union all
  -- E3R4-01 (Astra r4): el permiso efectivo minimo del dueño de las RPC sobre la unica relacion de fuera de las 14 que
  -- tocan sus cuerpos y auxiliares (public.profiles: lee id, plan y simulador_activo, y sim_bloquea_alumno la bloquea FOR
  -- KEY SHARE, que exige UPDATE en alguna columna). Por columna. No se concede nada: si falta, DIFIERE / aborta
  select 'permiso en profiles',
         coalesce(pg_catalog.has_column_privilege(o.proowner, 'public.profiles', 'id', 'SELECT')
                  and pg_catalog.has_column_privilege(o.proowner, 'public.profiles', 'plan', 'SELECT')
                  and pg_catalog.has_column_privilege(o.proowner, 'public.profiles', 'simulador_activo', 'SELECT')
                  and pg_catalog.has_any_column_privilege(o.proowner, 'public.profiles', 'UPDATE'), false),
         'dueño_rpc SELECT(id, plan, simulador_activo)='
         OPERATOR(pg_catalog.||) coalesce((pg_catalog.has_column_privilege(o.proowner, 'public.profiles', 'id', 'SELECT')
                      and pg_catalog.has_column_privilege(o.proowner, 'public.profiles', 'plan', 'SELECT')
                      and pg_catalog.has_column_privilege(o.proowner, 'public.profiles', 'simulador_activo', 'SELECT'))::pg_catalog.text, 'NO EXISTE')
         OPERATOR(pg_catalog.||) ' · UPDATE en alguna columna (FOR KEY SHARE)=' OPERATOR(pg_catalog.||) coalesce(pg_catalog.has_any_column_privilege(o.proowner, 'public.profiles', 'UPDATE')::pg_catalog.text, 'NO EXISTE')
    from (select 1) x left join pg_catalog.pg_proc o on o.oid OPERATOR(pg_catalog.=) pg_catalog.to_regprocedure('public.sim_crear_sesion(uuid,uuid,uuid,text,integer,jsonb,jsonb,jsonb,jsonb)')
  union all
  -- E3R4-02 (Astra r4): anon y authenticated no pueden alcanzar, por pertenencia (directa o en cadena, con SET o con
  -- INHERIT: pg_has_role MEMBER las cubre todas), ni service_role ni postgres ni el dueño de las RPC ni ningun rol
  -- superusuario, con BYPASSRLS o dueño de alguna de las 14 tablas. El sentido authenticator → roles de peticion es otro
  -- y sigue valiendo
  select 'pertenencias del alumno', pg_catalog.count(*) OPERATOR(pg_catalog.=) 0,
         coalesce(pg_catalog.string_agg(a.rolname::pg_catalog.text OPERATOR(pg_catalog.||) case when a.oid OPERATOR(pg_catalog.=) r.oid then ' es él mismo un rol privilegiado (dueño directo)' else ' → ' OPERATOR(pg_catalog.||) r.rolname::pg_catalog.text end, ', ' order by a.rolname, r.rolname), 'ninguna')
    from pg_catalog.pg_roles a cross join pg_catalog.pg_roles r
   where a.rolname OPERATOR(pg_catalog.=) any (array['anon', 'authenticated']::pg_catalog.name[])
     and (r.rolname OPERATOR(pg_catalog.=) any (array['service_role', 'postgres']::pg_catalog.name[]) or r.rolsuper or r.rolbypassrls
          or r.oid OPERATOR(pg_catalog.=) (select o.proowner from pg_catalog.pg_proc o where o.oid OPERATOR(pg_catalog.=) pg_catalog.to_regprocedure('public.sim_crear_sesion(uuid,uuid,uuid,text,integer,jsonb,jsonb,jsonb,jsonb)'))
          or r.oid OPERATOR(pg_catalog.=) any (select c.relowner from pg_catalog.pg_class c where c.oid OPERATOR(pg_catalog.=) any (select pg_catalog.to_regclass('public.' OPERATOR(pg_catalog.||) t) from pg_catalog.unnest(array['sim_alumnos', 'sim_arrendamientos', 'sim_recibos', 'sim_eventos', 'sim_escrituras_v0', 'sim_escrituras_v0_marcas', 'sim_servicio', 'sim_sessions', 'sim_trades', 'session_drawings', 'session_chart_config', 'sim_drawing_templates', 'user_chart_config', 'user_tool_config']) t))
          -- RE5-01 (revisor interno de 4c522cb): y los dueños de lo que usan los cuerpos fuera de las 14: profiles, auth.users
          -- y auth.uid() (un miembro con INHERIT del dueño de profiles actua como dueño: privilegios y RLS)
          or r.oid OPERATOR(pg_catalog.=) any (select c.relowner from pg_catalog.pg_class c where c.oid OPERATOR(pg_catalog.=) any (array[pg_catalog.to_regclass('public.profiles')::pg_catalog.oid, pg_catalog.to_regclass('auth.users')::pg_catalog.oid]))
          or r.oid OPERATOR(pg_catalog.=) (select f.proowner from pg_catalog.pg_proc f where f.oid OPERATOR(pg_catalog.=) pg_catalog.to_regprocedure('auth.uid()'))
          -- RE6-01 (revisor interno de 09492b0): y los dueños de los esquemas public, extensions y auth (el dueño de un esquema
          -- puede borrar y sustituir lo que hay dentro, p. ej. extensions.digest)
          or r.oid OPERATOR(pg_catalog.=) any (select n.nspowner from pg_catalog.pg_namespace n where n.nspname OPERATOR(pg_catalog.=) any (array['public', 'extensions', 'auth']::pg_catalog.name[])))
     -- E3R5-01 (Astra r5): o ES el rol privilegiado (p. ej. dueño directo de profiles), no solo miembro de otro
     and (a.oid OPERATOR(pg_catalog.=) r.oid or pg_catalog.pg_has_role(a.oid, r.oid, 'MEMBER'))
  union all values
    ('PostgreSQL >= 17', pg_catalog.current_setting('server_version_num')::pg_catalog.int4 OPERATOR(pg_catalog.>=) 170000, pg_catalog.current_setting('server_version')),
    ('rol anon', exists (select 1 from pg_catalog.pg_roles where rolname OPERATOR(pg_catalog.=) 'anon'), 'existe'),
    ('rol authenticated', exists (select 1 from pg_catalog.pg_roles where rolname OPERATOR(pg_catalog.=) 'authenticated'), 'existe'),
    ('rol service_role', exists (select 1 from pg_catalog.pg_roles where rolname OPERATOR(pg_catalog.=) 'service_role'), 'existe'),
    -- RINV3-01 (CTO 17-oct): sin normalizar, los textos dependen del search_path; el del editor, por sus esquemas efectivos
    ('search_path', pg_catalog.current_schemas(false)::pg_catalog.text OPERATOR(pg_catalog.=) '{public,extensions}',
     'esquemas=' OPERATOR(pg_catalog.||) pg_catalog.current_schemas(false)::pg_catalog.text OPERATOR(pg_catalog.||) ' (el del editor de Supabase: "$user", public, extensions)')),
def_dos(conrel, conname, vieja, nueva) as (values
    ('sim_sessions', 'sim_sessions_terminal_valida', 'CHECK (((terminal IS NULL) OR (terminal = ANY (ARRAY[''borrada''::text, ''revocada''::text]))))', 'CHECK (((terminal IS NULL) OR (terminal = ANY (ARRAY[''borrada''::text, ''revocada''::text, ''superado''::text]))))'),
    ('sim_eventos', 'sim_eventos_tipo_check', 'CHECK ((tipo = ANY (ARRAY[''orden_creada''::text, ''orden_modificada''::text, ''orden_cancelada''::text, ''fill''::text, ''cierre''::text, ''reset_diario''::text, ''breach''::text, ''fase_superada''::text, ''fin_de_datos''::text, ''posicion_modificada''::text, ''no_valorable''::text])))', 'CHECK ((tipo = ANY (ARRAY[''orden_creada''::text, ''orden_modificada''::text, ''orden_cancelada''::text, ''fill''::text, ''cierre''::text, ''reset_diario''::text, ''breach''::text, ''fase_superada''::text, ''fin_de_datos''::text, ''posicion_modificada''::text, ''no_valorable''::text, ''hueco_aceptado''::text])))')),
dos as (
  select d.conname,
         (select pg_catalog.pg_get_constraintdef(k.oid) from pg_catalog.pg_constraint k
           where k.conrelid OPERATOR(pg_catalog.=) pg_catalog.to_regclass('public.' OPERATOR(pg_catalog.||) d.conrel) and k.conname OPERATOR(pg_catalog.=) d.conname) def,
         (select k.convalidated from pg_catalog.pg_constraint k where k.conrelid OPERATOR(pg_catalog.=) pg_catalog.to_regclass('public.' OPERATOR(pg_catalog.||) d.conrel) and k.conname OPERATOR(pg_catalog.=) d.conname) validada,
         d.vieja, d.nueva
    from def_dos d),
sust(firma, sha, atr) as (values
    ('sim_comando(uuid,uuid,uuid,text,text,integer,bigint,text,text,jsonb)', '94f4db481cc09a2bc9b5d86512931186d8ec5aa98689bf6dc54bd6418798bc36', 'strict=false|leakproof=false|parallel=u|kind=f|retset=false|ret=jsonb|args=uuid,uuid,uuid,text,text,integer,bigint,text,text,jsonb|modes=-|names=p_actor,p_session_id,p_command_id,p_tipo,p_sobre,p_epoca,p_version_esperada,p_cliente_id,p_testigo,p_resultado|defaults=-|ndefaults=0|cost=100|rows=0|def=8d7d99c91cd3207fa686f97a13fe526c'),
    ('sim_tomar_escritor(uuid,uuid,uuid,text,integer,text,boolean)', 'f58af2b0e4945d9313ea2c3bb55f4be7c003521be80ed92a5a0a56b5cdc03d48', 'strict=false|leakproof=false|parallel=u|kind=f|retset=false|ret=jsonb|args=uuid,uuid,uuid,text,integer,text,boolean|modes=-|names=p_actor,p_session_id,p_command_id,p_sobre,p_epoca,p_cliente_id,p_forzar|defaults=-|ndefaults=0|cost=100|rows=0|def=da773a9b444cf9cac9a610848a52b78b'),
    ('sim_avanzar_fase(uuid,uuid,uuid,uuid,text,integer,bigint,jsonb,jsonb,jsonb,jsonb)', '3409a208f5b26211be3406f8d4a93ed074cd1e1a72c6c3eed32f5b2d9c99526b', 'strict=false|leakproof=false|parallel=u|kind=f|retset=false|ret=jsonb|args=uuid,uuid,uuid,uuid,text,integer,bigint,jsonb,jsonb,jsonb,jsonb|modes=-|names=p_actor,p_padre_id,p_hija_id,p_command_id,p_sobre,p_epoca,p_version_esperada,p_sesion,p_estado,p_mercado,p_resumen|defaults=-|ndefaults=0|cost=100|rows=0|def=e26f913d4b994863373db75cd571ed94')),
estado as (
  select (select pg_catalog.count(*) from dos where def OPERATOR(pg_catalog.=) vieja) viejas,
         (select pg_catalog.count(*) from dos where def OPERATOR(pg_catalog.=) nueva and validada) nuevas,
         (select pg_catalog.count(*) from sust s join pg_catalog.pg_proc p on p.oid OPERATOR(pg_catalog.=) pg_catalog.to_regprocedure('public.' OPERATOR(pg_catalog.||) s.firma)
           where pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p.prosrc, 'UTF8')), 'hex') OPERATOR(pg_catalog.=) s.sha) cuerpos),
-- las tres RPC que sustituye: EXECUTE siempre (CREATE OR REPLACE conserva los permisos); SECURITY y
-- search_path solo con sim-004b ya aplicada (antes, su CREATE OR REPLACE los vuelve a fijar)
fsust as (
  select s.firma, p.oid,
         case when p.oid is null then null else
           'anon=' OPERATOR(pg_catalog.||) pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE') OPERATOR(pg_catalog.||) ' authenticated=' OPERATOR(pg_catalog.||) pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')
           OPERATOR(pg_catalog.||) ' PUBLIC=' OPERATOR(pg_catalog.||) exists (select 1 from pg_catalog.aclexplode(coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))) a where a.grantee OPERATOR(pg_catalog.=) 0)
           OPERATOR(pg_catalog.||) ' service_role=' OPERATOR(pg_catalog.||) pg_catalog.has_function_privilege('service_role', p.oid, 'EXECUTE')
           -- R3E3-03: los receptores de EXECUTE, con su opcion de concesion (CREATE OR REPLACE conserva la ACL)
           OPERATOR(pg_catalog.||) ' receptores=' OPERATOR(pg_catalog.||) coalesce((select pg_catalog.string_agg(case when a.grantee OPERATOR(pg_catalog.=) 0 then 'PUBLIC' else a.grantee::pg_catalog.regrole::pg_catalog.text end
                                                           OPERATOR(pg_catalog.||) case when a.is_grantable then ' (con opcion de concesion)' else '' end, ',' order by a.grantee::pg_catalog.regrole::pg_catalog.text collate pg_catalog."C")
                                          from pg_catalog.aclexplode(coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))) a
                                         where a.grantee OPERATOR(pg_catalog.<>) p.proowner and a.privilege_type OPERATOR(pg_catalog.=) 'EXECUTE'), '')
           OPERATOR(pg_catalog.||) case when (select viejas OPERATOR(pg_catalog.=) 0 and nuevas OPERATOR(pg_catalog.=) 2 and cuerpos OPERATOR(pg_catalog.=) 3 from estado)
                   then ' definer=' OPERATOR(pg_catalog.||) p.prosecdef OPERATOR(pg_catalog.||) ' search_path_vacio=' OPERATOR(pg_catalog.||) coalesce('search_path=""' OPERATOR(pg_catalog.=) any (p.proconfig), false)
                        -- E3R2-01: con sim-004b aplicada, todos sus atributos (antes, su CREATE OR REPLACE los vuelve a fijar)
                        OPERATOR(pg_catalog.||) ' atributos=' OPERATOR(pg_catalog.||) pg_catalog.concat_ws('|', 'strict=' OPERATOR(pg_catalog.||) p.proisstrict::pg_catalog.text, 'leakproof=' OPERATOR(pg_catalog.||) p.proleakproof::pg_catalog.text, 'parallel=' OPERATOR(pg_catalog.||) p.proparallel::pg_catalog.text, 'kind=' OPERATOR(pg_catalog.||) p.prokind::pg_catalog.text, 'retset=' OPERATOR(pg_catalog.||) p.proretset::pg_catalog.text, 'ret=' OPERATOR(pg_catalog.||) pg_catalog.format_type(p.prorettype, NULL), 'args=' OPERATOR(pg_catalog.||) coalesce((SELECT pg_catalog.string_agg(pg_catalog.format_type(u.t, NULL), ',' ORDER BY u.n) FROM pg_catalog.unnest(p.proargtypes::pg_catalog.oid[]) WITH ORDINALITY u(t, n)), ''), 'modes=' OPERATOR(pg_catalog.||) coalesce(p.proargmodes::pg_catalog.text, '-'), 'names=' OPERATOR(pg_catalog.||) coalesce(pg_catalog.array_to_string(p.proargnames, ','), '-'), 'defaults=' OPERATOR(pg_catalog.||) coalesce(pg_catalog.pg_get_expr(p.proargdefaults, 0), '-'), 'ndefaults=' OPERATOR(pg_catalog.||) p.pronargdefaults::pg_catalog.text, 'cost=' OPERATOR(pg_catalog.||) p.procost::pg_catalog.text, 'rows=' OPERATOR(pg_catalog.||) p.prorows::pg_catalog.text, 'def=' OPERATOR(pg_catalog.||) pg_catalog.md5(pg_catalog.pg_get_functiondef(p.oid))) else '' end end medido,
         'anon=false authenticated=false PUBLIC=false service_role=true receptores=service_role'
           OPERATOR(pg_catalog.||) case when (select viejas OPERATOR(pg_catalog.=) 0 and nuevas OPERATOR(pg_catalog.=) 2 and cuerpos OPERATOR(pg_catalog.=) 3 from estado) then ' definer=true search_path_vacio=true atributos=' OPERATOR(pg_catalog.||) s.atr else '' end esperado
    from sust s left join pg_catalog.pg_proc p on p.oid OPERATOR(pg_catalog.=) pg_catalog.to_regprocedure('public.' OPERATOR(pg_catalog.||) s.firma)),
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
         (select pg_catalog.pg_get_constraintdef(k.oid) OPERATOR(pg_catalog.||) case when k.convalidated then '' else ' (NO VALIDADA)' end
            from pg_catalog.pg_constraint k where k.conrelid OPERATOR(pg_catalog.=) pg_catalog.to_regclass('public.' OPERATOR(pg_catalog.||) e.rel) and k.conname OPERATOR(pg_catalog.=) e.nombre) medido
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
  select e.nombre, e.def esperado,
         (select pg_catalog.pg_get_indexdef(i.indexrelid)
                 OPERATOR(pg_catalog.||) case when i.indisunique then '' else ' (NO UNICO)' end OPERATOR(pg_catalog.||) case when i.indisvalid then '' else ' (NO VALIDO)' end
                 OPERATOR(pg_catalog.||) case when i.indisready then '' else ' (NO LISTO)' end OPERATOR(pg_catalog.||) case when i.indislive then '' else ' (NO VIVO)' end
            from pg_catalog.pg_index i where i.indexrelid OPERATOR(pg_catalog.=) pg_catalog.to_regclass('public.' OPERATOR(pg_catalog.||) e.nombre)) medido
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
         (select pg_catalog.string_agg(ro.r OPERATOR(pg_catalog.||) '=' OPERATOR(pg_catalog.||) coalesce((select pg_catalog.string_agg(pr.p, ',' order by pr.n) from priv pr
                                                     where pg_catalog.has_table_privilege(ro.r, c.oid, pr.p)), '-'), ' ' order by ro.n)
            from roles ro where c.oid is not null) medido,
         (select pg_catalog.string_agg(ro.r OPERATOR(pg_catalog.||) '=' OPERATOR(pg_catalog.||) coalesce((select pg_catalog.string_agg(pr.p, ',' order by pr.n) from priv pr
                                                     where case when t.t OPERATOR(pg_catalog.=) any (array['sim_sessions', 'sim_trades', 'session_drawings', 'session_chart_config'])
                                                                 then ro.r OPERATOR(pg_catalog.=) 'service_role' or (ro.r OPERATOR(pg_catalog.=) 'authenticated' and pr.p OPERATOR(pg_catalog.=) any (array['SELECT', 'INSERT', 'UPDATE', 'DELETE']))
                                                               else pr.p OPERATOR(pg_catalog.=) 'SELECT' and ro.r OPERATOR(pg_catalog.=) any (array['authenticated', 'service_role']) and t.t OPERATOR(pg_catalog.=) any (array['sim_recibos', 'sim_eventos', 'sim_servicio']) end), '-'), ' ' order by ro.n)
            from roles ro) esperado
    from tablas t left join pg_catalog.pg_class c on c.oid OPERATOR(pg_catalog.=) pg_catalog.to_regclass('public.' OPERATOR(pg_catalog.||) t.t) where t.protegida),
nuevas(o) as (values ('sim_alumnos'), ('sim_arrendamientos'), ('sim_recibos'), ('sim_eventos'), ('sim_escrituras_v0'),
                     ('sim_escrituras_v0_marcas'), ('sim_servicio'), ('sim_recibos_id_seq'), ('sim_eventos_id_seq'),
                     ('sim_escrituras_v0_id_seq'), ('sim_escrituras_v0_marcas_id_seq')),
acl_r as (
  select n.o, c.oid,
         (select pg_catalog.string_agg(case when a.grantee OPERATOR(pg_catalog.=) 0 then 'PUBLIC' else a.grantee::pg_catalog.regrole::pg_catalog.text end OPERATOR(pg_catalog.||) '=' OPERATOR(pg_catalog.||) a.privilege_type, ', '
                            order by case when a.grantee OPERATOR(pg_catalog.=) 0 then 'PUBLIC' else a.grantee::pg_catalog.regrole::pg_catalog.text end collate pg_catalog."C", a.privilege_type collate pg_catalog."C")
            from pg_catalog.aclexplode(coalesce(c.relacl, pg_catalog.acldefault(case when c.relkind OPERATOR(pg_catalog.=) 'S' then 's'::pg_catalog.char else 'r'::pg_catalog.char end, c.relowner))) a
           where a.grantee OPERATOR(pg_catalog.<>) c.relowner
             and not (a.privilege_type OPERATOR(pg_catalog.=) 'SELECT' and c.relname OPERATOR(pg_catalog.=) any (array['sim_recibos', 'sim_eventos', 'sim_servicio']::pg_catalog.name[])
                      and a.grantee OPERATOR(pg_catalog.=) any (array['authenticated'::pg_catalog.regrole::pg_catalog.oid, 'service_role'::pg_catalog.regrole::pg_catalog.oid]))) de_mas
    from nuevas n left join pg_catalog.pg_class c on c.oid OPERATOR(pg_catalog.=) pg_catalog.to_regclass('public.' OPERATOR(pg_catalog.||) n.o)),
acl_c as (
  select pg_catalog.string_agg(a.attrelid::pg_catalog.regclass::pg_catalog.text OPERATOR(pg_catalog.||) '.' OPERATOR(pg_catalog.||) a.attname OPERATOR(pg_catalog.||) ' ' OPERATOR(pg_catalog.||) a.attacl::pg_catalog.text, ', '
                    order by a.attrelid::pg_catalog.regclass::pg_catalog.text collate pg_catalog."C", a.attname collate pg_catalog."C") de_mas
    from pg_catalog.pg_attribute a
   where a.attrelid OPERATOR(pg_catalog.=) any (select pg_catalog.to_regclass('public.' OPERATOR(pg_catalog.||) t) from tablas where protegida) and a.attnum OPERATOR(pg_catalog.>) 0 and coalesce(pg_catalog.cardinality(a.attacl), 0) OPERATOR(pg_catalog.>) 0),
filas as (
  select 1 o, r.t o2, 'rls' seccion, r.t objeto,
         case when r.rls is null then 'NO EXISTE' else 'rls=' OPERATOR(pg_catalog.||) r.rls OPERATOR(pg_catalog.||) ' · force=' OPERATOR(pg_catalog.||) r.forzada end OPERATOR(pg_catalog.||) ' · '
         OPERATOR(pg_catalog.||) case when r.bien then 'coincide' else 'DIFIERE' end detalle
    from rls r
  union all select 2, x, 'politica', x, 'coincide' from (select x from pol_med intersect all select x from pol_esp) i
  union all select 2, x, 'politica', x, 'DE MAS' from (select x from pol_med except all select x from pol_esp) d
  union all select 2, x, 'politica', x, 'FALTA' from (select x from pol_esp except all select x from pol_med) d
  union all
  select 3, firma, 'funcion', firma,
         coalesce(medido, '(no existe)') OPERATOR(pg_catalog.||) ' · ' OPERATOR(pg_catalog.||) coalesce(crudo, '-') OPERATOR(pg_catalog.||) ' · '
         OPERATOR(pg_catalog.||) case when coalesce(medido OPERATOR(pg_catalog.=) esperado, medido is null and esperado is null) then 'coincide' else 'DIFIERE (sim-004b espera ' OPERATOR(pg_catalog.||) esperado OPERATOR(pg_catalog.||) ')' end
    from fun
  union all select 4, x, 'disparador', x, 'coincide' from (select x from tri_med intersect all select x from tri_e) i
  union all select 4, x, 'disparador', x, 'DE MAS' from (select x from tri_med except all select x from tri_e) d
  union all select 4, x, 'disparador', x, 'FALTA' from (select x from tri_e except all select x from tri_med) d
  union all
  select 0.1, r.objeto, 'requisito', r.objeto, r.detalle OPERATOR(pg_catalog.||) ' · ' OPERATOR(pg_catalog.||) case when r.bien then 'coincide' else 'DIFIERE' end from requisito r
  union all
  select 0.2, '', 'sim004b_estado', 'las 2 restricciones y los 3 cuerpos que cambia',
         'restricciones viejas ' OPERATOR(pg_catalog.||) e.viejas OPERATOR(pg_catalog.||) ', nuevas ' OPERATOR(pg_catalog.||) e.nuevas OPERATOR(pg_catalog.||) ' de 2; cuerpos de sim-004b ' OPERATOR(pg_catalog.||) e.cuerpos OPERATOR(pg_catalog.||) ' de 3 · '
         OPERATOR(pg_catalog.||) case when e.viejas OPERATOR(pg_catalog.=) 2 and e.nuevas OPERATOR(pg_catalog.=) 0 and e.cuerpos OPERATOR(pg_catalog.=) 0 then 'sin aplicar · coincide'
                 when e.viejas OPERATOR(pg_catalog.=) 0 and e.nuevas OPERATOR(pg_catalog.=) 2 and e.cuerpos OPERATOR(pg_catalog.=) 3 then 'aplicada · coincide'
                 else 'A MEDIAS o alterada · DIFIERE' end
    from estado e
  union all
  select 0.3, r.nombre, 'restriccion', r.rel OPERATOR(pg_catalog.||) '.' OPERATOR(pg_catalog.||) r.nombre,
         coalesce(r.medido, 'NO EXISTE') OPERATOR(pg_catalog.||) ' · ' OPERATOR(pg_catalog.||) case when coalesce(r.medido OPERATOR(pg_catalog.=) r.esperado, r.medido is null and r.esperado is null) then 'coincide' else 'DIFIERE (sim-004b espera ' OPERATOR(pg_catalog.||) r.esperado OPERATOR(pg_catalog.||) ')' end
    from restr r
  union all
  select 0.4, i.nombre, 'indice', i.nombre,
         coalesce(i.medido, 'NO EXISTE') OPERATOR(pg_catalog.||) ' · ' OPERATOR(pg_catalog.||) case when coalesce(i.medido OPERATOR(pg_catalog.=) i.esperado, i.medido is null and i.esperado is null) then 'coincide' else 'DIFIERE (sim-004b espera ' OPERATOR(pg_catalog.||) i.esperado OPERATOR(pg_catalog.||) ')' end
    from idx i
  union all
  select 3.5, f.firma, 'funcion_sustituida', f.firma,
         coalesce(f.medido, 'NO EXISTE') OPERATOR(pg_catalog.||) ' · ' OPERATOR(pg_catalog.||) case when coalesce(f.medido OPERATOR(pg_catalog.=) f.esperado, f.medido is null and f.esperado is null) then 'coincide' else 'DIFIERE (sim-004b espera ' OPERATOR(pg_catalog.||) f.esperado OPERATOR(pg_catalog.||) ')' end
    from fsust f
  union all
  -- R3E3-04 (revisor interno): ninguna otra funcion de public con el nombre de una acreditada (una sobrecarga
  -- cambia que resuelven las llamadas por nombre)
  select 3.6, 'public', 'homonimos', 'public',
         coalesce((select 'de mas: ' OPERATOR(pg_catalog.||) pg_catalog.string_agg(p.oid::pg_catalog.regprocedure::pg_catalog.text, ', ' order by p.oid::pg_catalog.regprocedure::pg_catalog.text collate pg_catalog."C") OPERATOR(pg_catalog.||) ' · DIFIERE'
                     from pg_catalog.pg_proc p
                    where p.pronamespace OPERATOR(pg_catalog.=) 'public'::pg_catalog.regnamespace
                      and p.proname OPERATOR(pg_catalog.=) any (select pg_catalog.split_part(firma, '(', 1) from fun_esp union select pg_catalog.split_part(firma, '(', 1) from sust)
                      and not (p.oid OPERATOR(pg_catalog.=) any (select pg_catalog.to_regprocedure('public.' OPERATOR(pg_catalog.||) firma) from fun_esp where pg_catalog.to_regprocedure('public.' OPERATOR(pg_catalog.||) firma) is not null
                                        union select pg_catalog.to_regprocedure('public.' OPERATOR(pg_catalog.||) firma) from sust where pg_catalog.to_regprocedure('public.' OPERATOR(pg_catalog.||) firma) is not null))), 'ninguno · coincide')
  union all
  -- R3E3B-01 y R3E3B-02 (CTO 17-oct): el inventario exacto de las 14 tablas y las funciones ajenas, el mismo bloque que sim-004b
  select 3.7, i.objeto, i.familia, i.objeto, i.detalle OPERATOR(pg_catalog.||) ' · ' OPERATOR(pg_catalog.||) case when i.bien then 'coincide' else 'DIFIERE' end
    from (
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
            select 'tabla'::pg_catalog.text familia, r.t OPERATOR(pg_catalog.||) '|' OPERATOR(pg_catalog.||)
                   case when c.oid is null then 'NO EXISTE'
                        else 'relkind=' OPERATOR(pg_catalog.||) c.relkind::pg_catalog.text OPERATOR(pg_catalog.||) ' · persistencia=' OPERATOR(pg_catalog.||) c.relpersistence::pg_catalog.text OPERATOR(pg_catalog.||) ' · particion=' OPERATOR(pg_catalog.||) c.relispartition::pg_catalog.text
                             OPERATOR(pg_catalog.||) ' · hijas=' OPERATOR(pg_catalog.||) (select pg_catalog.count(*) from pg_catalog.pg_inherits i where i.inhparent OPERATOR(pg_catalog.=) c.oid)
                             OPERATOR(pg_catalog.||) ' · padres=' OPERATOR(pg_catalog.||) coalesce((select pg_catalog.string_agg(i.inhparent::pg_catalog.regclass::pg_catalog.text, ',' order by i.inhseqno) from pg_catalog.pg_inherits i where i.inhrelid OPERATOR(pg_catalog.=) c.oid), '-')
                             OPERATOR(pg_catalog.||) ' · particionada=' OPERATOR(pg_catalog.||) exists (select 1 from pg_catalog.pg_partitioned_table p where p.partrelid OPERATOR(pg_catalog.=) c.oid)::pg_catalog.text
                             -- RINV-01: el dueño («ejecutor» si es quien ejecuta); RINV-04: la RLS de las 3 no protegidas
                             OPERATOR(pg_catalog.||) ' · dueño=' OPERATOR(pg_catalog.||) case when c.relowner OPERATOR(pg_catalog.=) (select x.oid from pg_catalog.pg_roles x where x.rolname OPERATOR(pg_catalog.=) current_user) then 'ejecutor' else pg_catalog.pg_get_userbyid(c.relowner)::pg_catalog.text end
                             OPERATOR(pg_catalog.||) case when r.t OPERATOR(pg_catalog.=) any (array['sim_drawing_templates', 'user_chart_config', 'user_tool_config'])
                                     then ' · rls=' OPERATOR(pg_catalog.||) c.relrowsecurity::pg_catalog.text OPERATOR(pg_catalog.||) ' · forzada=' OPERATOR(pg_catalog.||) c.relforcerowsecurity::pg_catalog.text else '' end end fila
              from (values ('sim_alumnos'), ('sim_arrendamientos'), ('sim_recibos'), ('sim_eventos'), ('sim_escrituras_v0'), ('sim_escrituras_v0_marcas'), ('sim_servicio'),
                           ('sim_sessions'), ('sim_trades'), ('session_drawings'), ('session_chart_config'), ('sim_drawing_templates'), ('user_chart_config'), ('user_tool_config')) r(t)
                   left join pg_catalog.pg_class c on c.oid OPERATOR(pg_catalog.=) pg_catalog.to_regclass('public.' OPERATOR(pg_catalog.||) r.t)
            union all
            select 'columna', c.relname OPERATOR(pg_catalog.||) '.' OPERATOR(pg_catalog.||) a.attname OPERATOR(pg_catalog.||) '|' OPERATOR(pg_catalog.||)
                   -- RINV-02: el tipo con su esquema, sin quitarlo (un dominio public.text no pasa por text)
                   'tipo=' OPERATOR(pg_catalog.||) pg_catalog.format_type(a.atttypid, a.atttypmod) OPERATOR(pg_catalog.||) ' · tipo_esquema=' OPERATOR(pg_catalog.||) tn.nspname::pg_catalog.text
                   OPERATOR(pg_catalog.||) ' · notnull=' OPERATOR(pg_catalog.||) a.attnotnull::pg_catalog.text
                   OPERATOR(pg_catalog.||) ' · identity=' OPERATOR(pg_catalog.||) coalesce(case when a.attidentity::pg_catalog.text OPERATOR(pg_catalog.=) '' then null else a.attidentity::pg_catalog.text end, '-')
                   OPERATOR(pg_catalog.||) ' · generated=' OPERATOR(pg_catalog.||) coalesce(case when a.attgenerated::pg_catalog.text OPERATOR(pg_catalog.=) '' then null else a.attgenerated::pg_catalog.text end, '-')
                   -- RINV2-02: «por defecto» solo la predeterminada (oid 100); cualquier otra, con esquema, proveedor, determinista y locale
                   OPERATOR(pg_catalog.||) ' · colacion=' OPERATOR(pg_catalog.||) case when a.attcollation OPERATOR(pg_catalog.=) 0 then '-' when a.attcollation OPERATOR(pg_catalog.=) 100 then 'por defecto'
                                             else coalesce((select pg_catalog.concat(cn.nspname, '.', co.collname, ' · proveedor=', co.collprovider::pg_catalog.text, ' · determinista=', co.collisdeterministic::pg_catalog.text,
                                                                                     ' · locale=', coalesce(co.collcollate, co.colllocale, '-'))
                                                              from pg_catalog.pg_collation co join pg_catalog.pg_namespace cn on cn.oid OPERATOR(pg_catalog.=) co.collnamespace where co.oid OPERATOR(pg_catalog.=) a.attcollation), 'NO EXISTE') end
                   OPERATOR(pg_catalog.||) ' · defecto=' OPERATOR(pg_catalog.||) coalesce(pg_catalog.pg_get_expr(d.adbin, d.adrelid), '-')
              from pg_catalog.pg_class c join pg_catalog.pg_attribute a on a.attrelid OPERATOR(pg_catalog.=) c.oid and a.attnum OPERATOR(pg_catalog.>) 0 and not a.attisdropped
                   join pg_catalog.pg_type ty on ty.oid OPERATOR(pg_catalog.=) a.atttypid join pg_catalog.pg_namespace tn on tn.oid OPERATOR(pg_catalog.=) ty.typnamespace
                   left join pg_catalog.pg_attrdef d on d.adrelid OPERATOR(pg_catalog.=) a.attrelid and d.adnum OPERATOR(pg_catalog.=) a.attnum
             where c.relnamespace OPERATOR(pg_catalog.=) 'public'::pg_catalog.regnamespace and c.relname OPERATOR(pg_catalog.=) any (array['sim_alumnos', 'sim_arrendamientos', 'sim_recibos', 'sim_eventos', 'sim_escrituras_v0', 'sim_escrituras_v0_marcas', 'sim_servicio',
                           'sim_sessions', 'sim_trades', 'session_drawings', 'session_chart_config', 'sim_drawing_templates', 'user_chart_config', 'user_tool_config']::pg_catalog.name[]) and c.relkind OPERATOR(pg_catalog.=) 'r'
            union all
            select 'restriccion', c.relname OPERATOR(pg_catalog.||) '.' OPERATOR(pg_catalog.||) k.conname OPERATOR(pg_catalog.||) '|' OPERATOR(pg_catalog.||)
                   case when ((c.relname OPERATOR(pg_catalog.=) 'sim_sessions' and k.conname OPERATOR(pg_catalog.=) 'sim_sessions_terminal_valida') or (c.relname OPERATOR(pg_catalog.=) 'sim_eventos' and k.conname OPERATOR(pg_catalog.=) 'sim_eventos_tipo_check'))
                        then k.contype::pg_catalog.text OPERATOR(pg_catalog.||) ' · (la de sim-004b, segun su estado)'
                        else k.contype::pg_catalog.text OPERATOR(pg_catalog.||) ' · ' OPERATOR(pg_catalog.||) pg_catalog.pg_get_constraintdef(k.oid)
                             OPERATOR(pg_catalog.||) ' · validada=' OPERATOR(pg_catalog.||) k.convalidated::pg_catalog.text OPERATOR(pg_catalog.||) ' · diferible=' OPERATOR(pg_catalog.||) k.condeferrable::pg_catalog.text OPERATOR(pg_catalog.||) '/' OPERATOR(pg_catalog.||) k.condeferred::pg_catalog.text end
              from pg_catalog.pg_class c join pg_catalog.pg_constraint k on k.conrelid OPERATOR(pg_catalog.=) c.oid
             where c.relnamespace OPERATOR(pg_catalog.=) 'public'::pg_catalog.regnamespace and c.relname OPERATOR(pg_catalog.=) any (array['sim_alumnos', 'sim_arrendamientos', 'sim_recibos', 'sim_eventos', 'sim_escrituras_v0', 'sim_escrituras_v0_marcas', 'sim_servicio',
                           'sim_sessions', 'sim_trades', 'session_drawings', 'session_chart_config', 'sim_drawing_templates', 'user_chart_config', 'user_tool_config']::pg_catalog.name[])
            union all
            -- E3R3-04 (Astra r3): ademas de la definicion, el estado operativo (unico, valido, listo y vivo)
            select 'indice', c.relname OPERATOR(pg_catalog.||) '.' OPERATOR(pg_catalog.||) ic.relname OPERATOR(pg_catalog.||) '|' OPERATOR(pg_catalog.||) pg_catalog.pg_get_indexdef(x.indexrelid)
                   OPERATOR(pg_catalog.||) ' · unico=' OPERATOR(pg_catalog.||) x.indisunique::pg_catalog.text OPERATOR(pg_catalog.||) ' · valido=' OPERATOR(pg_catalog.||) x.indisvalid::pg_catalog.text OPERATOR(pg_catalog.||) ' · listo=' OPERATOR(pg_catalog.||) x.indisready::pg_catalog.text OPERATOR(pg_catalog.||) ' · vivo=' OPERATOR(pg_catalog.||) x.indislive::pg_catalog.text
              from pg_catalog.pg_class c join pg_catalog.pg_index x on x.indrelid OPERATOR(pg_catalog.=) c.oid join pg_catalog.pg_class ic on ic.oid OPERATOR(pg_catalog.=) x.indexrelid
             where c.relnamespace OPERATOR(pg_catalog.=) 'public'::pg_catalog.regnamespace and c.relname OPERATOR(pg_catalog.=) any (array['sim_alumnos', 'sim_arrendamientos', 'sim_recibos', 'sim_eventos', 'sim_escrituras_v0', 'sim_escrituras_v0_marcas', 'sim_servicio',
                           'sim_sessions', 'sim_trades', 'session_drawings', 'session_chart_config', 'sim_drawing_templates', 'user_chart_config', 'user_tool_config']::pg_catalog.name[])
            union all
            -- RINV-03: cada secuencia identity, con todos sus parametros y su dueño
            select 'identidad', c.relname OPERATOR(pg_catalog.||) '.' OPERATOR(pg_catalog.||) a.attname OPERATOR(pg_catalog.||) '|' OPERATOR(pg_catalog.||)
                   'tipo=' OPERATOR(pg_catalog.||) pg_catalog.format_type(s.seqtypid, null) OPERATOR(pg_catalog.||) ' · inicio=' OPERATOR(pg_catalog.||) s.seqstart OPERATOR(pg_catalog.||) ' · incremento=' OPERATOR(pg_catalog.||) s.seqincrement
                   OPERATOR(pg_catalog.||) ' · minimo=' OPERATOR(pg_catalog.||) s.seqmin OPERATOR(pg_catalog.||) ' · maximo=' OPERATOR(pg_catalog.||) s.seqmax OPERATOR(pg_catalog.||) ' · cache=' OPERATOR(pg_catalog.||) s.seqcache OPERATOR(pg_catalog.||) ' · ciclo=' OPERATOR(pg_catalog.||) s.seqcycle::pg_catalog.text
                   OPERATOR(pg_catalog.||) ' · dueño=' OPERATOR(pg_catalog.||) case when sc.relowner OPERATOR(pg_catalog.=) (select x.oid from pg_catalog.pg_roles x where x.rolname OPERATOR(pg_catalog.=) current_user) then 'ejecutor' else pg_catalog.pg_get_userbyid(sc.relowner)::pg_catalog.text end
              from pg_catalog.pg_class c join pg_catalog.pg_attribute a on a.attrelid OPERATOR(pg_catalog.=) c.oid and a.attnum OPERATOR(pg_catalog.>) 0 and not a.attisdropped and a.attidentity OPERATOR(pg_catalog.<>) ''
                   join pg_catalog.pg_depend dp on dp.refobjid OPERATOR(pg_catalog.=) c.oid and dp.refobjsubid OPERATOR(pg_catalog.=) a.attnum and dp.classid OPERATOR(pg_catalog.=) 'pg_catalog.pg_class'::pg_catalog.regclass and dp.deptype OPERATOR(pg_catalog.=) 'i'
                   join pg_catalog.pg_class sc on sc.oid OPERATOR(pg_catalog.=) dp.objid and sc.relkind OPERATOR(pg_catalog.=) 'S'
                   join pg_catalog.pg_sequence s on s.seqrelid OPERATOR(pg_catalog.=) sc.oid
             where c.relnamespace OPERATOR(pg_catalog.=) 'public'::pg_catalog.regnamespace and c.relname OPERATOR(pg_catalog.=) any (array['sim_alumnos', 'sim_arrendamientos', 'sim_recibos', 'sim_eventos', 'sim_escrituras_v0', 'sim_escrituras_v0_marcas', 'sim_servicio',
                           'sim_sessions', 'sim_trades', 'session_drawings', 'session_chart_config', 'sim_drawing_templates', 'user_chart_config', 'user_tool_config']::pg_catalog.name[])
            union all
            -- RINV2-01 y RINV2-04: de que dependen, FUERA de pg_catalog, los valores por defecto, las restricciones y los indices
            -- (por pg_depend: no depende del texto ni del search_path; un public.now() o un public.length() salen aqui). La s16d
            select 'ajeno', o.nombre OPERATOR(pg_catalog.||) '|' OPERATOR(pg_catalog.||) pg_catalog.pg_describe_object(dp.refclassid, dp.refobjid, 0)
              from (select 'pg_catalog.pg_attrdef'::pg_catalog.regclass clase, d.oid, c.relname OPERATOR(pg_catalog.||) '.' OPERATOR(pg_catalog.||) a.attname OPERATOR(pg_catalog.||) ' (defecto)' nombre
                      from pg_catalog.pg_class c join pg_catalog.pg_attrdef d on d.adrelid OPERATOR(pg_catalog.=) c.oid join pg_catalog.pg_attribute a on a.attrelid OPERATOR(pg_catalog.=) d.adrelid and a.attnum OPERATOR(pg_catalog.=) d.adnum
                     where c.relnamespace OPERATOR(pg_catalog.=) 'public'::pg_catalog.regnamespace and c.relname OPERATOR(pg_catalog.=) any (array['sim_alumnos', 'sim_arrendamientos', 'sim_recibos', 'sim_eventos', 'sim_escrituras_v0', 'sim_escrituras_v0_marcas', 'sim_servicio',
                           'sim_sessions', 'sim_trades', 'session_drawings', 'session_chart_config', 'sim_drawing_templates', 'user_chart_config', 'user_tool_config']::pg_catalog.name[])
                    union all
                    select 'pg_catalog.pg_constraint'::pg_catalog.regclass, k.oid, c.relname OPERATOR(pg_catalog.||) '.' OPERATOR(pg_catalog.||) k.conname OPERATOR(pg_catalog.||) ' (restriccion)'
                      from pg_catalog.pg_class c join pg_catalog.pg_constraint k on k.conrelid OPERATOR(pg_catalog.=) c.oid
                     where c.relnamespace OPERATOR(pg_catalog.=) 'public'::pg_catalog.regnamespace and c.relname OPERATOR(pg_catalog.=) any (array['sim_alumnos', 'sim_arrendamientos', 'sim_recibos', 'sim_eventos', 'sim_escrituras_v0', 'sim_escrituras_v0_marcas', 'sim_servicio',
                           'sim_sessions', 'sim_trades', 'session_drawings', 'session_chart_config', 'sim_drawing_templates', 'user_chart_config', 'user_tool_config']::pg_catalog.name[])
                    union all
                    select 'pg_catalog.pg_class'::pg_catalog.regclass, x.indexrelid, c.relname OPERATOR(pg_catalog.||) '.' OPERATOR(pg_catalog.||) ic.relname OPERATOR(pg_catalog.||) ' (indice)'
                      from pg_catalog.pg_class c join pg_catalog.pg_index x on x.indrelid OPERATOR(pg_catalog.=) c.oid join pg_catalog.pg_class ic on ic.oid OPERATOR(pg_catalog.=) x.indexrelid
                     where c.relnamespace OPERATOR(pg_catalog.=) 'public'::pg_catalog.regnamespace and c.relname OPERATOR(pg_catalog.=) any (array['sim_alumnos', 'sim_arrendamientos', 'sim_recibos', 'sim_eventos', 'sim_escrituras_v0', 'sim_escrituras_v0_marcas', 'sim_servicio',
                           'sim_sessions', 'sim_trades', 'session_drawings', 'session_chart_config', 'sim_drawing_templates', 'user_chart_config', 'user_tool_config']::pg_catalog.name[])) o
                   join pg_catalog.pg_depend dp on dp.classid OPERATOR(pg_catalog.=) o.clase and dp.objid OPERATOR(pg_catalog.=) o.oid
             where (dp.refclassid OPERATOR(pg_catalog.=) 'pg_catalog.pg_proc'::pg_catalog.regclass and (select p.pronamespace from pg_catalog.pg_proc p where p.oid OPERATOR(pg_catalog.=) dp.refobjid) OPERATOR(pg_catalog.<>) 'pg_catalog'::pg_catalog.regnamespace)
                or (dp.refclassid OPERATOR(pg_catalog.=) 'pg_catalog.pg_operator'::pg_catalog.regclass and (select p.oprnamespace from pg_catalog.pg_operator p where p.oid OPERATOR(pg_catalog.=) dp.refobjid) OPERATOR(pg_catalog.<>) 'pg_catalog'::pg_catalog.regnamespace)
                or (dp.refclassid OPERATOR(pg_catalog.=) 'pg_catalog.pg_type'::pg_catalog.regclass and (select p.typnamespace from pg_catalog.pg_type p where p.oid OPERATOR(pg_catalog.=) dp.refobjid) OPERATOR(pg_catalog.<>) 'pg_catalog'::pg_catalog.regnamespace)
                or (dp.refclassid OPERATOR(pg_catalog.=) 'pg_catalog.pg_collation'::pg_catalog.regclass and (select p.collnamespace from pg_catalog.pg_collation p where p.oid OPERATOR(pg_catalog.=) dp.refobjid) OPERATOR(pg_catalog.<>) 'pg_catalog'::pg_catalog.regnamespace)
            union all
            select 'regla', c.relname OPERATOR(pg_catalog.||) '.' OPERATOR(pg_catalog.||) w.rulename OPERATOR(pg_catalog.||) '|' OPERATOR(pg_catalog.||) pg_catalog.pg_get_ruledef(w.oid)
              from pg_catalog.pg_class c join pg_catalog.pg_rewrite w on w.ev_class OPERATOR(pg_catalog.=) c.oid
             where c.relnamespace OPERATOR(pg_catalog.=) 'public'::pg_catalog.regnamespace and c.relname OPERATOR(pg_catalog.=) any (array['sim_alumnos', 'sim_arrendamientos', 'sim_recibos', 'sim_eventos', 'sim_escrituras_v0', 'sim_escrituras_v0_marcas', 'sim_servicio',
                           'sim_sessions', 'sim_trades', 'session_drawings', 'session_chart_config', 'sim_drawing_templates', 'user_chart_config', 'user_tool_config']::pg_catalog.name[])
            union all
            select 'politica', p.tablename OPERATOR(pg_catalog.||) '.' OPERATOR(pg_catalog.||) p.policyname OPERATOR(pg_catalog.||) '|' OPERATOR(pg_catalog.||)
                   p.permissive OPERATOR(pg_catalog.||) ' · ' OPERATOR(pg_catalog.||) p.cmd OPERATOR(pg_catalog.||) ' · ' OPERATOR(pg_catalog.||) p.roles::pg_catalog.text OPERATOR(pg_catalog.||) ' · using=' OPERATOR(pg_catalog.||) coalesce(p.qual, '-')
                   OPERATOR(pg_catalog.||) ' · check=' OPERATOR(pg_catalog.||) coalesce(p.with_check, '-')
              from pg_catalog.pg_policies p where p.schemaname OPERATOR(pg_catalog.=) 'public' and p.tablename OPERATOR(pg_catalog.=) any (array['sim_drawing_templates', 'user_chart_config', 'user_tool_config']::pg_catalog.name[])
            union all
            -- E3R3-01 (Astra r3): TODAS las funciones con esos nombres en esos esquemas (las RPC las llaman calificadas,
            -- extensions.digest(...), y una sobrecarga de mas en el mismo esquema hace ambigua la llamada: 42725)
            select 'sobrecarga', n.nspname::pg_catalog.text OPERATOR(pg_catalog.||) '.' OPERATOR(pg_catalog.||) p.proname::pg_catalog.text OPERATOR(pg_catalog.||) '(' OPERATOR(pg_catalog.||) pg_catalog.pg_get_function_identity_arguments(p.oid) OPERATOR(pg_catalog.||) ')'
              from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid OPERATOR(pg_catalog.=) p.pronamespace
             where ((n.nspname OPERATOR(pg_catalog.=) 'extensions' and p.proname OPERATOR(pg_catalog.=) 'digest') or (n.nspname OPERATOR(pg_catalog.=) 'extensions' and p.proname OPERATOR(pg_catalog.=) 'gen_random_bytes') or (n.nspname OPERATOR(pg_catalog.=) 'auth' and p.proname OPERATOR(pg_catalog.=) 'uid'))
            union all
            -- E3R3-02 (Astra r3): el permiso EFECTIVO de EXECUTE de quien las usa: el dueño de las RPC (definer) las tres,
            -- y authenticated auth.uid() (las politicas de RLS). Lo medido, no la ACL textual
            select 'permiso', f.firma OPERATOR(pg_catalog.||) '|dueño_rpc=' OPERATOR(pg_catalog.||) coalesce(pg_catalog.has_function_privilege(r.proowner, p.oid, 'EXECUTE')::pg_catalog.text, 'NO EXISTE')
                   OPERATOR(pg_catalog.||) case when f.firma OPERATOR(pg_catalog.=) 'auth.uid()' then ' · authenticated=' OPERATOR(pg_catalog.||) coalesce(pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')::pg_catalog.text, 'NO EXISTE') else '' end
              from (values ('extensions.digest(bytea,text)'), ('extensions.gen_random_bytes(integer)'), ('auth.uid()')) f(firma)
                   left join pg_catalog.pg_proc p on p.oid OPERATOR(pg_catalog.=) pg_catalog.to_regprocedure(f.firma)
                   left join pg_catalog.pg_proc r on r.oid OPERATOR(pg_catalog.=) pg_catalog.to_regprocedure('public.sim_crear_sesion(uuid,uuid,uuid,text,integer,jsonb,jsonb,jsonb,jsonb)')
            union all
            -- RE3-02 y RE3-03 (revisor interno de c4d46e3): el permiso EFECTIVO del dueño de las RPC sobre lo que usan sus
            -- cuerpos: los siete privilegios en las 14 tablas y EXECUTE en las funciones sim_* de public (un REVOKE a si
            -- mismo las deja en 42501)
            select 'permiso', 'tabla:' OPERATOR(pg_catalog.||) c.relname OPERATOR(pg_catalog.||) '|dueño_rpc=' OPERATOR(pg_catalog.||) coalesce((select pg_catalog.string_agg(pr.p, ',' order by pr.n) from (values ('SELECT', 1), ('INSERT', 2), ('UPDATE', 3), ('DELETE', 4), ('TRUNCATE', 5), ('REFERENCES', 6), ('TRIGGER', 7)) pr(p, n)
                                                                                  where pg_catalog.has_table_privilege(r.proowner, c.oid, pr.p)), '-')
              from pg_catalog.pg_class c
                   left join pg_catalog.pg_proc r on r.oid OPERATOR(pg_catalog.=) pg_catalog.to_regprocedure('public.sim_crear_sesion(uuid,uuid,uuid,text,integer,jsonb,jsonb,jsonb,jsonb)')
             where c.relnamespace OPERATOR(pg_catalog.=) 'public'::pg_catalog.regnamespace and c.relname OPERATOR(pg_catalog.=) any (array['sim_alumnos', 'sim_arrendamientos', 'sim_recibos', 'sim_eventos', 'sim_escrituras_v0', 'sim_escrituras_v0_marcas', 'sim_servicio',
                           'sim_sessions', 'sim_trades', 'session_drawings', 'session_chart_config', 'sim_drawing_templates', 'user_chart_config', 'user_tool_config']::pg_catalog.name[]) and c.relkind OPERATOR(pg_catalog.=) 'r'
            union all
            select 'permiso', 'funcion:' OPERATOR(pg_catalog.||) p.oid::pg_catalog.regprocedure::pg_catalog.text OPERATOR(pg_catalog.||) '|dueño_rpc=' OPERATOR(pg_catalog.||) coalesce(pg_catalog.has_function_privilege(r.proowner, p.oid, 'EXECUTE')::pg_catalog.text, 'NO EXISTE')
              from pg_catalog.pg_proc p
                   left join pg_catalog.pg_proc r on r.oid OPERATOR(pg_catalog.=) pg_catalog.to_regprocedure('public.sim_crear_sesion(uuid,uuid,uuid,text,integer,jsonb,jsonb,jsonb,jsonb)')
             where p.pronamespace OPERATOR(pg_catalog.=) 'public'::pg_catalog.regnamespace and (p.proname OPERATOR(pg_catalog.~~) 'sim\_%' or p.proname OPERATOR(pg_catalog.=) 'enforce_sim_session_limit')
               and p.proname OPERATOR(pg_catalog.<>) 'sim_escrituras_v0_puerta'  -- la de la puerta (estado 2) es de disparador: no se llama
            union all
            -- R3E3B-02 (CTO 17-oct): las tres funciones ajenas que llaman los cuerpos, con la ficha de la s16b
            select 'funcion_ajena', f.firma OPERATOR(pg_catalog.||) '|' OPERATOR(pg_catalog.||)
                   case when p.oid is null then 'NO EXISTE' else
                     'functiondef md5=' OPERATOR(pg_catalog.||) pg_catalog.md5(pg_catalog.pg_get_functiondef(p.oid))
                     OPERATOR(pg_catalog.||) ' · prosrc md5=' OPERATOR(pg_catalog.||) pg_catalog.md5(coalesce(p.prosrc, '')) OPERATOR(pg_catalog.||) ' · probin=' OPERATOR(pg_catalog.||) coalesce(p.probin, '-')
                     OPERATOR(pg_catalog.||) ' · lenguaje=' OPERATOR(pg_catalog.||) l.lanname OPERATOR(pg_catalog.||) ' · dueño=' OPERATOR(pg_catalog.||) pg_catalog.pg_get_userbyid(p.proowner)
                     OPERATOR(pg_catalog.||) ' · prosecdef=' OPERATOR(pg_catalog.||) p.prosecdef::pg_catalog.text OPERATOR(pg_catalog.||) ' · provolatile=' OPERATOR(pg_catalog.||) p.provolatile::pg_catalog.text OPERATOR(pg_catalog.||) ' · proconfig=' OPERATOR(pg_catalog.||) coalesce(p.proconfig::pg_catalog.text, '-')
                     OPERATOR(pg_catalog.||) ' · proisstrict=' OPERATOR(pg_catalog.||) p.proisstrict::pg_catalog.text OPERATOR(pg_catalog.||) ' · proleakproof=' OPERATOR(pg_catalog.||) p.proleakproof::pg_catalog.text OPERATOR(pg_catalog.||) ' · proparallel=' OPERATOR(pg_catalog.||) p.proparallel::pg_catalog.text
                     OPERATOR(pg_catalog.||) ' · prokind=' OPERATOR(pg_catalog.||) p.prokind::pg_catalog.text OPERATOR(pg_catalog.||) ' · proretset=' OPERATOR(pg_catalog.||) p.proretset::pg_catalog.text OPERATOR(pg_catalog.||) ' · prorettype=' OPERATOR(pg_catalog.||) pg_catalog.format_type(p.prorettype, null)
                     OPERATOR(pg_catalog.||) ' · proargmodes=' OPERATOR(pg_catalog.||) coalesce(p.proargmodes::pg_catalog.text, '-') OPERATOR(pg_catalog.||) ' · proargnames=' OPERATOR(pg_catalog.||) coalesce(p.proargnames::pg_catalog.text, '-')
                     OPERATOR(pg_catalog.||) ' · pronargdefaults=' OPERATOR(pg_catalog.||) p.pronargdefaults::pg_catalog.text OPERATOR(pg_catalog.||) ' · procost=' OPERATOR(pg_catalog.||) p.procost::pg_catalog.text OPERATOR(pg_catalog.||) ' · prorows=' OPERATOR(pg_catalog.||) p.prorows::pg_catalog.text end
              from (values ('extensions.digest(bytea,text)'), ('extensions.gen_random_bytes(integer)'), ('auth.uid()')) f(firma)
                   left join pg_catalog.pg_proc p on p.oid OPERATOR(pg_catalog.=) pg_catalog.to_regprocedure(f.firma) left join pg_catalog.pg_language l on l.oid OPERATOR(pg_catalog.=) p.prolang
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
        med_f as (select i.familia, pg_catalog.count(*)::pg_catalog.int4 n, pg_catalog.md5(pg_catalog.string_agg(i.fila, E'\n' order by i.fila collate pg_catalog."C")) h from inv i where i.familia OPERATOR(pg_catalog.<>) 'funcion_ajena' group by i.familia),
        med_a as (select pg_catalog.split_part(i.fila, '|', 1) firma, pg_catalog.substr(i.fila, pg_catalog.strpos(i.fila, '|') OPERATOR(pg_catalog.+) 1) ficha from inv i where i.familia OPERATOR(pg_catalog.=) 'funcion_ajena')
        select 'inventario'::pg_catalog.text familia, e.familia objeto,
               'n=' OPERATOR(pg_catalog.||) coalesce(m.n, 0) OPERATOR(pg_catalog.||) ' md5=' OPERATOR(pg_catalog.||) coalesce(m.h, pg_catalog.md5(''))
               OPERATOR(pg_catalog.||) case when coalesce(m.n, 0) OPERATOR(pg_catalog.=) e.n and coalesce(m.h, pg_catalog.md5('')) OPERATOR(pg_catalog.=) e.h then ''
                       else ' (sim-004b espera n=' OPERATOR(pg_catalog.||) e.n OPERATOR(pg_catalog.||) ' md5=' OPERATOR(pg_catalog.||) e.h OPERATOR(pg_catalog.||) ' con esquemas=' OPERATOR(pg_catalog.||) e.esquemas OPERATOR(pg_catalog.||) '; que fila: medirlo aparte)' end detalle,
               coalesce(m.n, 0) OPERATOR(pg_catalog.=) e.n and coalesce(m.h, pg_catalog.md5('')) OPERATOR(pg_catalog.=) e.h bien
          from esp_f e left join med_f m on m.familia OPERATOR(pg_catalog.=) e.familia
         where e.esquemas OPERATOR(pg_catalog.=) pg_catalog.current_schemas(false)::pg_catalog.text
        union all
        select 'inventario', 'search_path', 'esquemas=' OPERATOR(pg_catalog.||) pg_catalog.current_schemas(false)::pg_catalog.text
               OPERATOR(pg_catalog.||) ' (sin valores esperados: solo {} en sim-004b y {public,extensions}, el del editor, en la s16)', false
         where not exists (select 1 from esp_f e where e.esquemas OPERATOR(pg_catalog.=) pg_catalog.current_schemas(false)::pg_catalog.text)
        union all
        select 'funcion_ajena', coalesce(e.firma, m.firma),
               coalesce(m.ficha, 'NO EXISTE') OPERATOR(pg_catalog.||) case when not coalesce(m.ficha OPERATOR(pg_catalog.=) e.ficha, m.ficha is null and e.ficha is null) then ' (sim-004b espera ' OPERATOR(pg_catalog.||) e.ficha OPERATOR(pg_catalog.||) ')' else '' end,
               coalesce(m.ficha OPERATOR(pg_catalog.=) e.ficha, m.ficha is null and e.ficha is null)
          from esp_a e left join med_a m on m.firma OPERATOR(pg_catalog.=) e.firma
      ) v
      -- <<< inventario
    ) i
  union all
  select 5, a.t, 'acl_tabla', a.t,
         coalesce(a.medido, 'NO EXISTE') OPERATOR(pg_catalog.||) ' · '
         OPERATOR(pg_catalog.||) case when coalesce(a.medido OPERATOR(pg_catalog.=) a.esperado, a.medido is null and a.esperado is null) then 'coincide' else 'DIFIERE (sim-004b espera ' OPERATOR(pg_catalog.||) a.esperado OPERATOR(pg_catalog.||) ')' end
    from acl_m a
  union all
  select 6, r.o, 'acl_receptores', r.o,
         case when r.oid is null and r.o OPERATOR(pg_catalog.~~) '%\_seq' then 'no existe (sim-004b no exige las secuencias, solo sus receptores si estan) · coincide'
              when r.oid is null then 'NO EXISTE · DIFIERE' when r.de_mas is null then 'ninguno de mas · coincide'
              else 'de mas: ' OPERATOR(pg_catalog.||) r.de_mas OPERATOR(pg_catalog.||) ' · DIFIERE' end
    from acl_r r
  union all
  select 7, '', 'acl_columna', 'las 11 protegidas',
         case when c.de_mas is null then 'ninguna · coincide' else 'de mas: ' OPERATOR(pg_catalog.||) c.de_mas OPERATOR(pg_catalog.||) ' · DIFIERE' end
    from acl_c c),
malas as (select pg_catalog.count(*) n from filas where detalle OPERATOR(pg_catalog.~) '(DIFIERE|DE MAS|FALTA)$' or detalle OPERATOR(pg_catalog.~) 'DIFIERE \(')
select seccion, objeto, detalle from (
  select o, o2, seccion, objeto, detalle from filas
  union all
  select 8, '', 'veredicto', case when n OPERATOR(pg_catalog.=) 0 then 'OK' else 'DIFIEREN ' OPERATOR(pg_catalog.||) n end,
         case when n OPERATOR(pg_catalog.=) 0 then 'lo que exige sim-004b (requisitos, estado, restricciones, indices, rls, force, politicas, funciones, disparadores y ACL de tabla) coincide: se puede aplicar'
              else 'NO aplicar sim-004b: revisar las filas DIFIERE / DE MAS / FALTA y parar (decide el CTO)' end
    from malas
  union all
  select 9, '', 'FIN', 's16', 'consulta'
) x where (select g.ok from guarda g) order by o, o2 collate pg_catalog."C", detalle collate pg_catalog."C";
rollback;
