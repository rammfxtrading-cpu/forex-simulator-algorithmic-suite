-- ============================================================================
-- CONSULTA DE SOLO LECTURA · S14e · los disparadores INTERNOS, las claves
-- foraneas y las reglas de storage.buckets y storage.objects (etapa 2,
-- ronda 9; para E2R8-01 de Astra r8, si el CTO elige medir antes)
--
-- s14, s14b y s14c excluyen tgisinternal: los internos de produccion no se
-- han medido nunca. El CTO admite un interno solo si su funcion es de
-- pg_catalog, de la familia RI_FKey_*, «con la tabla y la restriccion
-- esperadas»; esta consulta enseña cuales hay para acreditarlos por lista.
-- Trae:
--   1 tabla      storage.buckets y storage.objects: relkind, si es
--                particion y cuantas hijas (herencia o particiones) tiene
--   2 interno    cada disparador con tgisinternal: tabla, momento, ordenes,
--                por fila o sentencia, habilitado, funcion (esquema.nombre,
--                lenguaje), la restriccion de la que cuelga (nombre y tipo) y
--                la tabla relacionada. El nombre del disparador interno
--                (RI_ConstraintTrigger_…) lleva un oid y NO se usa para
--                acreditar; sale aparte
--   2 externos   cuantos no internos hay en cada tabla (contraste con s14)
--   3 fk         cada clave foranea que referencia a una de las dos o sale de
--                una de ellas: tabla y columnas de los dos lados, ON DELETE,
--                ON UPDATE, diferible, validada
--   4 regla      cada regla (pg_rewrite) de las dos tablas: evento, INSTEAD
--
-- NO cambia nada: UNA sola SELECT, sin escrituras ni EXECUTE ni set_config.
-- Ensayada en READ ONLY (pruebas/s14e-internos-storage.mjs). Solo catalogo,
-- sin datos de filas. Ramon la pega como postgres en el editor SQL de
-- Supabase DESPUES de la s10 del dia, nunca antes ni entre medias, y solo si
-- el CTO la pide. Acaba en «FIN | s14e | consulta».
-- ============================================================================
select seccion, objeto, detalle from (
  select 1 o, 0 s, 'tabla' seccion, 'storage.' || r.t objeto,
         case when c.oid is null then 'NO EXISTE'
              else 'relkind=' || c.relkind::text || ' · particion=' || c.relispartition::text
                   || ' · hijas=' || (select count(*) from pg_catalog.pg_inherits i where i.inhparent = c.oid) end detalle
    from (values ('buckets'), ('objects')) r(t)
         left join pg_catalog.pg_class c on c.oid = pg_catalog.to_regclass('storage.' || r.t)
  union all
  select 2, 1, 'interno', 'storage.' || c.relname || ' · ' || f.nspname || '.' || p.proname || ' · ' || coalesce(k.conname::text, '(sin restriccion)'),
         case when t.tgtype & 2 = 2 then 'BEFORE' when t.tgtype & 64 = 64 then 'INSTEAD OF' else 'AFTER' end || ' '
         || pg_catalog.concat_ws('/', case when t.tgtype & 4 = 4 then 'INSERT' end, case when t.tgtype & 8 = 8 then 'DELETE' end, case when t.tgtype & 16 = 16 then 'UPDATE' end, case when t.tgtype & 32 = 32 then 'TRUNCATE' end)
         || ' · ' || case when t.tgtype & 1 = 1 then 'por fila' else 'por sentencia' end
         || ' · habilitado=' || t.tgenabled::text
         || ' · lenguaje=' || l.lanname
         || ' · restriccion=' || coalesce(k.conname::text || ' (' || k.contype::text || ')', '-')
         || ' · tabla relacionada=' || coalesce(pg_catalog.quote_ident(rn.nspname) || '.' || pg_catalog.quote_ident(rr.relname), '-')
         || ' · nombre=' || t.tgname
    from pg_catalog.pg_trigger t
         join pg_catalog.pg_class c on c.oid = t.tgrelid
         join pg_catalog.pg_proc p on p.oid = t.tgfoid
         join pg_catalog.pg_namespace f on f.oid = p.pronamespace
         join pg_catalog.pg_language l on l.oid = p.prolang
         left join pg_catalog.pg_constraint k on k.oid = t.tgconstraint
         left join pg_catalog.pg_class rr on rr.oid = t.tgconstrrelid
         left join pg_catalog.pg_namespace rn on rn.oid = rr.relnamespace
   where t.tgrelid in (pg_catalog.to_regclass('storage.buckets'), pg_catalog.to_regclass('storage.objects')) and t.tgisinternal
  union all
  select 2, 0, 'externos', 'storage.' || r.t,
         (select count(*) from pg_catalog.pg_trigger t where t.tgrelid = pg_catalog.to_regclass('storage.' || r.t) and not t.tgisinternal)::text
         || ' no internos · ' || (select count(*) from pg_catalog.pg_trigger t where t.tgrelid = pg_catalog.to_regclass('storage.' || r.t) and t.tgisinternal)::text || ' internos'
    from (values ('buckets'), ('objects')) r(t)
  union all
  select 3, 0, 'fk', k.conname::text,
         pg_catalog.quote_ident(an.nspname) || '.' || pg_catalog.quote_ident(a.relname) || ' (' || (select pg_catalog.string_agg(x.attname::text, ', ' order by u.n) from pg_catalog.unnest(k.conkey) with ordinality u(c, n) join pg_catalog.pg_attribute x on x.attrelid = k.conrelid and x.attnum = u.c) || ')'
         || ' → ' || pg_catalog.quote_ident(bn.nspname) || '.' || pg_catalog.quote_ident(b.relname) || ' (' || (select pg_catalog.string_agg(x.attname::text, ', ' order by u.n) from pg_catalog.unnest(k.confkey) with ordinality u(c, n) join pg_catalog.pg_attribute x on x.attrelid = k.confrelid and x.attnum = u.c) || ')'
         || ' · on delete=' || k.confdeltype::text || ' · on update=' || k.confupdtype::text
         || ' · diferible=' || k.condeferrable::text || ' · validada=' || k.convalidated::text
    from pg_catalog.pg_constraint k
         join pg_catalog.pg_class a on a.oid = k.conrelid join pg_catalog.pg_namespace an on an.oid = a.relnamespace
         join pg_catalog.pg_class b on b.oid = k.confrelid join pg_catalog.pg_namespace bn on bn.oid = b.relnamespace
   where k.contype = 'f' and (k.conrelid in (pg_catalog.to_regclass('storage.buckets'), pg_catalog.to_regclass('storage.objects'))
                              or k.confrelid in (pg_catalog.to_regclass('storage.buckets'), pg_catalog.to_regclass('storage.objects')))
  union all
  select 4, 0, 'regla', 'storage.' || c.relname || ' · ' || w.rulename::text,
         'evento=' || w.ev_type::text || ' · instead=' || w.is_instead::text || ' · habilitada=' || w.ev_enabled::text
    from pg_catalog.pg_rewrite w join pg_catalog.pg_class c on c.oid = w.ev_class
   where w.ev_class in (pg_catalog.to_regclass('storage.buckets'), pg_catalog.to_regclass('storage.objects'))
  union all
  select 4, 1, 'regla', '(resumen)',
         (select count(*) from pg_catalog.pg_rewrite w where w.ev_class in (pg_catalog.to_regclass('storage.buckets'), pg_catalog.to_regclass('storage.objects')))::text || ' reglas'
  union all
  select 5, 0, 'FIN', 's14e', 'consulta'
) x order by o, s, objeto collate "C", detalle;
