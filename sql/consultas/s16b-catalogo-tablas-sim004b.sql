-- ============================================================================
-- CONSULTA DE SOLO LECTURA · S16b · el catalogo de las 14 tablas que acredita
-- sim-004b, fuera de pg_proc, y las tres funciones ajenas que llaman sus cuerpos
-- (etapa 3, ronda 3; CTO 17-oct, R3E3B-01 y R3E3B-02 del revisor interno)
--
-- La s16 y sim-004b acreditan de estas tablas la RLS, sus politicas (en las 11
-- protegidas), las restricciones e indices de sim-003 POR NOMBRE, los
-- disparadores (inventario exacto, ya: no se repiten aqui) y las ACL. No miden
-- si hay reglas, valores por defecto, la forma de las columnas, restricciones o
-- indices DE MAS, herencia o particiones. Esta consulta los ensena, para que el
-- CTO acredite el inventario exacto con su salida literal. Trae, de las 14:
--   1 tabla       relkind, persistencia, si es particion, hijas y padres
--   2 columna     cada columna: tipo, NOT NULL, identity, generated, colacion y
--                 valor por defecto (pg_get_expr)
--   3 restriccion cada restriccion: tipo y pg_get_constraintdef, validada,
--                 diferible
--   4 indice      cada indice: pg_get_indexdef (unicos y parciales incluidos)
--   5 regla       cada regla (pg_rewrite): pg_get_ruledef
--   6 politica    las politicas de las 3 tablas no protegidas (las de las 11
--                 protegidas las acredita ya la s16, seccion 2)
--   7 funcion     extensions.digest(bytea,text), extensions.gen_random_bytes
--                 (integer) y auth.uid(): la ficha de pg_proc (md5 de
--                 pg_get_functiondef, md5 de prosrc, probin, lenguaje, dueño,
--                 SECURITY, volatilidad, proconfig y los atributos explicitos)
--   8 resumen     los recuentos por seccion, y el search_path de la sesion
-- Los textos van SIN el prefijo «public.» (como la s16: el editor tiene public
-- en el search_path y sim-004b compara con search_path vacio).
--
-- NO cambia nada: UNA sola SELECT, sin escrituras ni EXECUTE ni set_config.
-- Solo catalogo: ningun dato de alumnos ni de filas. Ensayada en READ ONLY
-- (pruebas/s16b-catalogo-tablas-sim004b.mjs). Ramon la pega como postgres en el
-- editor SQL de Supabase DESPUES de la s10 del dia, nunca antes ni entre
-- medias, y solo si el CTO la pide. Acaba en «FIN | s16b | consulta».
-- ============================================================================
with tablas(t) as (values ('sim_alumnos'), ('sim_arrendamientos'), ('sim_recibos'), ('sim_eventos'), ('sim_escrituras_v0'),
                          ('sim_escrituras_v0_marcas'), ('sim_servicio'), ('sim_sessions'), ('sim_trades'), ('session_drawings'),
                          ('session_chart_config'), ('sim_drawing_templates'), ('user_chart_config'), ('user_tool_config')),
rel as (select t.t, c.oid from tablas t left join pg_catalog.pg_class c on c.oid = pg_catalog.to_regclass('public.' || t.t)),
fun(firma) as (values ('extensions.digest(bytea,text)'), ('extensions.gen_random_bytes(integer)'), ('auth.uid()'))
select seccion, objeto, detalle from (
  select 1 o, 'tabla' seccion, r.t objeto,
         case when c.oid is null then 'NO EXISTE'
              else 'relkind=' || c.relkind::text || ' · persistencia=' || c.relpersistence::text || ' · particion=' || c.relispartition::text
                   || ' · hijas=' || (select count(*) from pg_catalog.pg_inherits i where i.inhparent = c.oid)
                   || ' · padres=' || coalesce((select string_agg(regexp_replace(i.inhparent::regclass::text, '^public\.', ''), ',' order by i.inhseqno) from pg_catalog.pg_inherits i where i.inhrelid = c.oid), '-')
                   || ' · particionada=' || exists (select 1 from pg_catalog.pg_partitioned_table p where p.partrelid = c.oid)::text end detalle
    from rel r left join pg_catalog.pg_class c on c.oid = r.oid
  union all
  select 2, 'columna', r.t || '.' || a.attname,
         'tipo=' || regexp_replace(pg_catalog.format_type(a.atttypid, a.atttypmod), '\mpublic\.', '', 'g')
         || ' · notnull=' || a.attnotnull::text
         || ' · identity=' || coalesce(nullif(a.attidentity::text, ''), '-')
         || ' · generated=' || coalesce(nullif(a.attgenerated::text, ''), '-')
         || ' · colacion=' || coalesce((select case when a.attcollation = t.typcollation then 'por defecto' else co.collname::text end
                                          from pg_catalog.pg_collation co, pg_catalog.pg_type t where co.oid = a.attcollation and t.oid = a.atttypid), '-')
         || ' · defecto=' || coalesce(regexp_replace(pg_catalog.pg_get_expr(d.adbin, d.adrelid), '\mpublic\.', '', 'g'), '-')
    from rel r join pg_catalog.pg_attribute a on a.attrelid = r.oid and a.attnum > 0 and not a.attisdropped
         left join pg_catalog.pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
  union all
  select 3, 'restriccion', r.t || '.' || k.conname,
         k.contype::text || ' · ' || regexp_replace(pg_catalog.pg_get_constraintdef(k.oid), '\mpublic\.', '', 'g')
         || ' · validada=' || k.convalidated::text || ' · diferible=' || k.condeferrable::text || '/' || k.condeferred::text
    from rel r join pg_catalog.pg_constraint k on k.conrelid = r.oid
  union all
  select 4, 'indice', r.t || '.' || ic.relname, regexp_replace(pg_catalog.pg_get_indexdef(x.indexrelid), '\mpublic\.', '', 'g')
    from rel r join pg_catalog.pg_index x on x.indrelid = r.oid join pg_catalog.pg_class ic on ic.oid = x.indexrelid
  union all
  select 5, 'regla', r.t || '.' || w.rulename, regexp_replace(pg_catalog.pg_get_ruledef(w.oid), '\mpublic\.', '', 'g')
    from rel r join pg_catalog.pg_rewrite w on w.ev_class = r.oid
  union all
  select 6, 'politica', p.tablename || '.' || p.policyname,
         p.permissive || ' · ' || p.cmd || ' · ' || p.roles::text || ' · using=' || coalesce(regexp_replace(p.qual, '\mpublic\.', '', 'g'), '-')
         || ' · check=' || coalesce(regexp_replace(p.with_check, '\mpublic\.', '', 'g'), '-')
    from pg_catalog.pg_policies p where p.schemaname = 'public' and p.tablename in ('sim_drawing_templates', 'user_chart_config', 'user_tool_config')
  union all
  select 7, 'funcion', f.firma,
         case when p.oid is null then 'NO EXISTE' else
           'functiondef md5=' || pg_catalog.md5(pg_catalog.pg_get_functiondef(p.oid))
           || ' · prosrc md5=' || pg_catalog.md5(coalesce(p.prosrc, '')) || ' · probin=' || coalesce(p.probin, '-')
           || ' · lenguaje=' || l.lanname || ' · dueño=' || pg_catalog.pg_get_userbyid(p.proowner)
           || ' · prosecdef=' || p.prosecdef::text || ' · provolatile=' || p.provolatile::text || ' · proconfig=' || coalesce(p.proconfig::text, '-')
           || ' · proisstrict=' || p.proisstrict::text || ' · proleakproof=' || p.proleakproof::text || ' · proparallel=' || p.proparallel::text
           || ' · prokind=' || p.prokind::text || ' · proretset=' || p.proretset::text || ' · prorettype=' || pg_catalog.format_type(p.prorettype, null)
           || ' · proargmodes=' || coalesce(p.proargmodes::text, '-') || ' · proargnames=' || coalesce(p.proargnames::text, '-')
           || ' · pronargdefaults=' || p.pronargdefaults::text || ' · procost=' || p.procost::text || ' · prorows=' || p.prorows::text end
    from fun f left join pg_catalog.pg_proc p on p.oid = pg_catalog.to_regprocedure(f.firma) left join pg_catalog.pg_language l on l.oid = p.prolang
  union all
  select 8, 'resumen', 'recuentos',
         (select count(*) from rel where oid is not null)::text || ' tablas · '
         || (select count(*) from rel r join pg_catalog.pg_attribute a on a.attrelid = r.oid and a.attnum > 0 and not a.attisdropped)::text || ' columnas · '
         || (select count(*) from rel r join pg_catalog.pg_attrdef d on d.adrelid = r.oid)::text || ' valores por defecto · '
         || (select count(*) from rel r join pg_catalog.pg_constraint k on k.conrelid = r.oid)::text || ' restricciones · '
         || (select count(*) from rel r join pg_catalog.pg_index x on x.indrelid = r.oid)::text || ' indices · '
         || (select count(*) from rel r join pg_catalog.pg_rewrite w on w.ev_class = r.oid)::text || ' reglas · '
         || (select count(*) from rel r join pg_catalog.pg_inherits i on i.inhrelid = r.oid or i.inhparent = r.oid)::text || ' herencias'
  union all
  select 8, 'resumen', 'search_path', pg_catalog.current_setting('search_path')
  union all
  select 9, 'FIN', 's16b', 'consulta'
) x order by o, objeto collate "C", detalle;
