-- ============================================================================
-- CONSULTA DE SOLO LECTURA · S16c · el catalogo de las 14 tablas que acredita
-- sim-004b, fuera de pg_proc, con lo que le faltaba a la s16b (etapa 3, ronda
-- 3; CTO 17-oct; el revisor interno de 679d363: RINV-01..04)
--
-- Es la s16b (sql/consultas/s16b-catalogo-tablas-sim004b.sql, corrida el
-- 17-oct) con cuatro cosas mas, que la s16b no media:
--   · RINV-01: el dueño de cada tabla («ejecutor» si es quien ejecuta, como en
--     las funciones; si no, su nombre);
--   · RINV-04: la RLS (activa y forzada) de las 3 tablas NO protegidas (la de
--     las 11 protegidas ya la acredita la s16, seccion 1);
--   · RINV-02: el tipo de cada columna con su esquema SIN quitarlo (un dominio
--     public.text no puede pasar por text);
--   · RINV-03: cada secuencia identity: tipo, inicio, incremento, minimo,
--     maximo, cache, ciclo y dueño.
-- Trae, de las 14: 1 tabla · 2 columna · 3 restriccion · 4 indice · 5 regla ·
-- 6 politica (las 3 no protegidas) · 7 identidad · 8 funcion (las tres ajenas)
-- · 9 resumen. Los textos de restricciones, indices, reglas y politicas van sin
-- el prefijo «public.» (como la s16 y la s16b).
--
-- NO cambia nada: UNA sola SELECT, sin escrituras ni EXECUTE ni set_config.
-- Solo catalogo: ningun dato de alumnos ni de filas. Ensayada en READ ONLY
-- (pruebas/s16c-catalogo-tablas-sim004b.mjs). Ramon la pega como postgres en el
-- editor SQL de Supabase cuando el CTO la pida. Acaba en «FIN | s16c | consulta».
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
                   || ' · particionada=' || exists (select 1 from pg_catalog.pg_partitioned_table p where p.partrelid = c.oid)::text
                   || ' · dueño=' || case when c.relowner = (select x.oid from pg_catalog.pg_roles x where x.rolname = current_user) then 'ejecutor' else pg_catalog.pg_get_userbyid(c.relowner)::text end
                   || case when r.t in ('sim_drawing_templates', 'user_chart_config', 'user_tool_config')
                           then ' · rls=' || c.relrowsecurity::text || ' · forzada=' || c.relforcerowsecurity::text else '' end end detalle
    from rel r left join pg_catalog.pg_class c on c.oid = r.oid
  union all
  select 2, 'columna', r.t || '.' || a.attname,
         'tipo=' || pg_catalog.format_type(a.atttypid, a.atttypmod) || ' · tipo_esquema=' || tn.nspname::text
         || ' · notnull=' || a.attnotnull::text
         || ' · identity=' || coalesce(nullif(a.attidentity::text, ''), '-')
         || ' · generated=' || coalesce(nullif(a.attgenerated::text, ''), '-')
         || ' · colacion=' || coalesce((select case when a.attcollation = t.typcollation then 'por defecto' else co.collname::text end
                                          from pg_catalog.pg_collation co, pg_catalog.pg_type t where co.oid = a.attcollation and t.oid = a.atttypid), '-')
         || ' · defecto=' || coalesce(regexp_replace(pg_catalog.pg_get_expr(d.adbin, d.adrelid), '\mpublic\.', '', 'g'), '-')
    from rel r join pg_catalog.pg_attribute a on a.attrelid = r.oid and a.attnum > 0 and not a.attisdropped
         join pg_catalog.pg_type ty on ty.oid = a.atttypid join pg_catalog.pg_namespace tn on tn.oid = ty.typnamespace
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
  select 7, 'identidad', r.t || '.' || a.attname,
         'tipo=' || pg_catalog.format_type(s.seqtypid, null) || ' · inicio=' || s.seqstart || ' · incremento=' || s.seqincrement
         || ' · minimo=' || s.seqmin || ' · maximo=' || s.seqmax || ' · cache=' || s.seqcache || ' · ciclo=' || s.seqcycle::text
         || ' · dueño=' || case when sc.relowner = (select x.oid from pg_catalog.pg_roles x where x.rolname = current_user) then 'ejecutor' else pg_catalog.pg_get_userbyid(sc.relowner)::text end
    from rel r join pg_catalog.pg_attribute a on a.attrelid = r.oid and a.attnum > 0 and not a.attisdropped and a.attidentity <> ''
         join pg_catalog.pg_depend dp on dp.refobjid = r.oid and dp.refobjsubid = a.attnum and dp.classid = 'pg_catalog.pg_class'::regclass and dp.deptype = 'i'
         join pg_catalog.pg_class sc on sc.oid = dp.objid and sc.relkind = 'S'
         join pg_catalog.pg_sequence s on s.seqrelid = sc.oid
  union all
  select 8, 'funcion', f.firma,
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
  select 9, 'resumen', 'recuentos',
         (select count(*) from rel where oid is not null)::text || ' tablas · '
         || (select count(*) from rel r join pg_catalog.pg_attribute a on a.attrelid = r.oid and a.attnum > 0 and not a.attisdropped)::text || ' columnas · '
         || (select count(*) from rel r join pg_catalog.pg_attribute a on a.attrelid = r.oid and a.attnum > 0 and not a.attisdropped and a.attidentity <> '')::text || ' identidades · '
         || (select count(*) from rel r join pg_catalog.pg_constraint k on k.conrelid = r.oid)::text || ' restricciones · '
         || (select count(*) from rel r join pg_catalog.pg_index x on x.indrelid = r.oid)::text || ' indices · '
         || (select count(*) from rel r join pg_catalog.pg_rewrite w on w.ev_class = r.oid)::text || ' reglas'
  union all
  select 9, 'resumen', 'quien', current_user::text || ' · search_path=' || pg_catalog.current_setting('search_path')
  union all
  select 10, 'FIN', 's16c', 'consulta'
) x order by o, objeto collate "C", detalle;
