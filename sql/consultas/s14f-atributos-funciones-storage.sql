-- ============================================================================
-- CONSULTA DE SOLO LECTURA · S14f · todos los atributos de pg_proc de las
-- funciones de los disparadores acreditados de storage.objects y
-- storage.buckets (etapa 2, ronda 9; CTO 16-oct, la familia de E3R2-01 de
-- Astra: STRICT y los demas atributos que cambian la ejecucion)
--
-- s14b y s14c midieron cuerpo (md5), lenguaje, SECURITY, dueño, proconfig,
-- volatilidad y firma. No midieron STRICT, LEAKPROOF, PARALLEL, COST, ROWS,
-- prokind, proretset ni los argumentos. Esta consulta los enseña, por cada
-- disparador NO interno de las dos tablas, de la funcion de tgfoid (la que
-- ejecuta de verdad), y el md5 de pg_get_functiondef completo (incluye
-- STRICT, LEAKPROOF, PARALLEL, COST, ROWS y SET). Con su salida el CTO
-- acredita los valores en el bloque «acreditados» de s14 y mercado-001.
--   1 funcion   tabla · disparador · esquema.funcion(argumentos de identidad):
--               md5 de pg_get_functiondef, md5 de prosrc, prokind,
--               proretset, prorettype, pronargs, proargtypes, proargmodes,
--               proargnames, proargdefaults, pronargdefaults, proisstrict,
--               proleakproof, proparallel, provolatile, prosecdef,
--               proconfig, procost, prorows, lenguaje, dueño
--   2 resumen   cuantas funciones distintas
--
-- NO cambia nada: UNA sola SELECT, sin escrituras ni EXECUTE ni set_config.
-- Ensayada en READ ONLY (pruebas/s14f-atributos-funciones-storage.mjs). Solo
-- catalogo. Ramon la pega como postgres en el editor SQL de Supabase DESPUES
-- de la s10 del dia, nunca antes ni entre medias, y solo si el CTO la pide.
-- Acaba en «FIN | s14f | consulta».
-- ============================================================================
select seccion, objeto, detalle from (
  select 1 o, 'funcion' seccion,
         'storage.' || r.relname || ' · ' || t.tgname || ' · ' || n.nspname || '.' || f.proname || '(' || pg_catalog.pg_get_function_identity_arguments(f.oid) || ')' objeto,
         'functiondef md5=' || pg_catalog.md5(pg_catalog.pg_get_functiondef(f.oid))
         || ' · prosrc md5=' || pg_catalog.md5(coalesce(f.prosrc, ''))
         || ' · prokind=' || f.prokind::text
         || ' · proretset=' || f.proretset::text
         || ' · prorettype=' || pg_catalog.format_type(f.prorettype, null)
         || ' · pronargs=' || f.pronargs::text
         || ' · proargtypes=' || coalesce(nullif(f.proargtypes::text, ''), '-')
         || ' · proargmodes=' || coalesce(f.proargmodes::text, '-')
         || ' · proargnames=' || coalesce(f.proargnames::text, '-')
         || ' · proargdefaults=' || coalesce(pg_catalog.pg_get_expr(f.proargdefaults, 0), '-')
         || ' · pronargdefaults=' || f.pronargdefaults::text
         || ' · proisstrict=' || f.proisstrict::text
         || ' · proleakproof=' || f.proleakproof::text
         || ' · proparallel=' || f.proparallel::text
         || ' · provolatile=' || f.provolatile::text
         || ' · prosecdef=' || f.prosecdef::text
         || ' · proconfig=' || coalesce(f.proconfig::text, '-')
         || ' · procost=' || f.procost::text
         || ' · prorows=' || f.prorows::text
         || ' · lenguaje=' || l.lanname
         || ' · dueño=' || pg_catalog.pg_get_userbyid(f.proowner) detalle
    from pg_catalog.pg_trigger t
         join pg_catalog.pg_class r on r.oid = t.tgrelid
         join pg_catalog.pg_proc f on f.oid = t.tgfoid
         join pg_catalog.pg_namespace n on n.oid = f.pronamespace
         join pg_catalog.pg_language l on l.oid = f.prolang
   where t.tgrelid in (pg_catalog.to_regclass('storage.buckets'), pg_catalog.to_regclass('storage.objects')) and not t.tgisinternal
  union all
  select 2, 'resumen', 'funciones',
         (select count(distinct t.tgfoid) from pg_catalog.pg_trigger t
           where t.tgrelid in (pg_catalog.to_regclass('storage.buckets'), pg_catalog.to_regclass('storage.objects')) and not t.tgisinternal)::text || ' funciones distintas'
  union all
  select 3, 'FIN', 's14f', 'consulta'
) x order by o, objeto collate "C", detalle;
