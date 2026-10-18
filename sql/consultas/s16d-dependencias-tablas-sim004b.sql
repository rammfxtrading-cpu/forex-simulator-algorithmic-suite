-- ============================================================================
-- CONSULTA DE SOLO LECTURA · S16d · de que objetos FUERA de pg_catalog
-- dependen los valores por defecto, las restricciones y los indices de las 14
-- tablas que acredita sim-004b, y la colacion de cada columna (etapa 3,
-- ronda 3; CTO 17-oct, orden 1-004; revisor interno de 15331a9: RINV2-01,
-- RINV2-02 y RINV2-04)
--
-- La s16b y la s16c ensenan el texto de cada valor por defecto, restriccion e
-- indice SIN el prefijo «public.» (para que el editor y sim-004b den lo mismo).
-- Por eso una funcion public.now() o public.length() no se distingue de la de
-- pg_catalog. Esta consulta lo mide sin depender del texto ni del search_path,
-- por pg_depend: cada funcion, operador, tipo o colacion de la que dependen y
-- que NO es de pg_catalog. Lo esperado es ninguna; con su salida el CTO lo
-- acredita. Trae, de las 14:
--   1 ajeno     <objeto> → <de lo que depende fuera de pg_catalog>
--               (pg_describe_object), para valores por defecto, restricciones e
--               indices
--   2 colacion  cada columna con colacion: si es la predeterminada (oid 100) o
--               cual (esquema, nombre, proveedor, determinista, locale)
--   3 resumen   cuantas dependencias ajenas y cuantas colaciones no
--               predeterminadas
--
-- NO cambia nada: UNA sola SELECT, sin escrituras ni EXECUTE ni set_config.
-- Solo catalogo: ningun dato de alumnos ni de filas. Ensayada en READ ONLY
-- (pruebas/s16d-dependencias-tablas-sim004b.mjs). Ramon la pega como postgres en
-- el editor SQL de Supabase cuando el CTO la pida. Acaba en
-- «FIN | s16d | consulta».
-- ============================================================================
with tablas(t) as (values ('sim_alumnos'), ('sim_arrendamientos'), ('sim_recibos'), ('sim_eventos'), ('sim_escrituras_v0'),
                          ('sim_escrituras_v0_marcas'), ('sim_servicio'), ('sim_sessions'), ('sim_trades'), ('session_drawings'),
                          ('session_chart_config'), ('sim_drawing_templates'), ('user_chart_config'), ('user_tool_config')),
rel as (select t.t, c.oid from tablas t join pg_catalog.pg_class c on c.oid = pg_catalog.to_regclass('public.' || t.t)),
-- los objetos que miramos: el valor por defecto de cada columna, cada restriccion y cada indice
objetos(clase, oid, nombre) as (
  select 'pg_catalog.pg_attrdef'::regclass, d.oid, r.t || '.' || a.attname || ' (defecto)'
    from rel r join pg_catalog.pg_attrdef d on d.adrelid = r.oid join pg_catalog.pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
  union all
  select 'pg_catalog.pg_constraint'::regclass, k.oid, r.t || '.' || k.conname || ' (restriccion)'
    from rel r join pg_catalog.pg_constraint k on k.conrelid = r.oid
  union all
  select 'pg_catalog.pg_class'::regclass, x.indexrelid, r.t || '.' || ic.relname || ' (indice)'
    from rel r join pg_catalog.pg_index x on x.indrelid = r.oid join pg_catalog.pg_class ic on ic.oid = x.indexrelid
),
-- de lo que dependen, si es una funcion, un operador, un tipo o una colacion de fuera de pg_catalog
ajenos as (
  select o.nombre, pg_catalog.pg_describe_object(dp.refclassid, dp.refobjid, 0) referido
    from objetos o join pg_catalog.pg_depend dp on dp.classid = o.clase and dp.objid = o.oid
   where (dp.refclassid = 'pg_catalog.pg_proc'::regclass and (select p.pronamespace from pg_catalog.pg_proc p where p.oid = dp.refobjid) <> 'pg_catalog'::regnamespace)
      or (dp.refclassid = 'pg_catalog.pg_operator'::regclass and (select p.oprnamespace from pg_catalog.pg_operator p where p.oid = dp.refobjid) <> 'pg_catalog'::regnamespace)
      or (dp.refclassid = 'pg_catalog.pg_type'::regclass and (select p.typnamespace from pg_catalog.pg_type p where p.oid = dp.refobjid) <> 'pg_catalog'::regnamespace)
      or (dp.refclassid = 'pg_catalog.pg_collation'::regclass and (select p.collnamespace from pg_catalog.pg_collation p where p.oid = dp.refobjid) <> 'pg_catalog'::regnamespace)
),
colaciones as (
  select r.t || '.' || a.attname objeto,
         case when a.attcollation = 100 then 'predeterminada (oid 100)'
              else pg_catalog.concat(n.nspname, '.', co.collname, ' · proveedor=', co.collprovider::text, ' · determinista=', co.collisdeterministic::text,
                                     ' · locale=', coalesce(co.collcollate, co.colllocale, '-')) end detalle,
         a.attcollation = 100 predeterminada
    from rel r join pg_catalog.pg_attribute a on a.attrelid = r.oid and a.attnum > 0 and not a.attisdropped and a.attcollation <> 0
         left join pg_catalog.pg_collation co on co.oid = a.attcollation left join pg_catalog.pg_namespace n on n.oid = co.collnamespace
)
select seccion, objeto, detalle from (
  select 1 o, 'ajeno' seccion, a.nombre objeto, a.referido detalle from ajenos a
  union all
  select 2, 'colacion', c.objeto, c.detalle from colaciones c
  union all
  select 3, 'resumen', 'recuentos',
         (select count(*) from objetos)::text || ' objetos mirados · ' || (select count(*) from ajenos)::text || ' dependencias fuera de pg_catalog · '
         || (select count(*) from colaciones)::text || ' columnas con colacion · ' || (select count(*) from colaciones where not predeterminada)::text || ' no predeterminadas'
  union all
  select 4, 'FIN', 's16d', 'consulta'
) x order by o, objeto collate "C", detalle;
