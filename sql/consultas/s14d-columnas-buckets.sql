-- ============================================================================
-- CONSULTA DE SOLO LECTURA · S14d · las columnas de storage.buckets y sus
-- valores por defecto (etapa 2; CTO 14-oct, tras la s14c)
--
-- La s14c enseño que storage.buckets tiene columnas NOT NULL que el INSERT de
-- mercado-001 no rellena (type storage.buckettype, versioning_status text) y
-- las de ciclo de vida que leen sus disparadores. Esta consulta enseña, de
-- CADA columna de storage.buckets: nombre, tipo, NOT NULL y valor por defecto
-- (pg_get_expr de pg_attrdef, tal cual); los valores del enum
-- storage.buckettype en su orden; y, para la prueba funcional de mercado-001
-- (un DELETE directo tras la sonda), si quien ejecuta tiene SELECT, INSERT,
-- UPDATE y DELETE en storage.buckets y storage.objects.
--
-- NO cambia nada: UNA sola SELECT, sin escrituras ni EXECUTE ni set_config.
-- Ensayada en READ ONLY (pruebas/s14d-columnas-buckets.mjs). Sin datos de
-- filas: solo catalogo. Ramon la pega como postgres en el editor SQL de
-- Supabase DESPUES de la s10 del dia (CTO), nunca antes ni entre medias.
-- Acaba en «FIN | s14d | consulta».
-- ============================================================================
select seccion, objeto, detalle from (
  select 1 o, a.attnum::int s, 'columna' seccion, 'storage.buckets.' || a.attname objeto,
         pg_catalog.format_type(a.atttypid, a.atttypmod)
         || case when a.attnotnull then ' · NOT NULL' else ' · admite NULL' end
         || ' · por defecto: ' || coalesce(pg_catalog.pg_get_expr(d.adbin, d.adrelid), '(ninguno)')
         || case when a.attgenerated <> '' then ' · GENERADA (' || a.attgenerated::text || ')' else '' end
         || case when a.attidentity <> '' then ' · IDENTITY (' || a.attidentity::text || ')' else '' end
         || case when a.attnotnull and d.adbin is null and a.attidentity = '' and a.attgenerated = ''
                 then ' · NOT NULL SIN valor por defecto: un INSERT que no la rellene falla' else '' end detalle
    from pg_catalog.pg_attribute a
         left join pg_catalog.pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
   where a.attrelid = pg_catalog.to_regclass('storage.buckets') and a.attnum > 0 and not a.attisdropped
  union all
  select 1, 0, 'columna', '(resumen)',
         case when pg_catalog.to_regclass('storage.buckets') is null then 'storage.buckets NO EXISTE'
              else count(*)::text || ' columnas · NOT NULL sin valor por defecto: '
                   || coalesce(pg_catalog.string_agg(a.attname::text, ', ' order by a.attnum) filter (where a.attnotnull and d.adbin is null and a.attidentity = '' and a.attgenerated = ''), '-') end
    from pg_catalog.pg_attribute a
         left join pg_catalog.pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
   where a.attrelid = pg_catalog.to_regclass('storage.buckets') and a.attnum > 0 and not a.attisdropped
  union all
  select 2, e.enumsortorder::int, 'enum', 'storage.buckettype ' || pg_catalog.lpad(row_number() over (order by e.enumsortorder)::text, 2, '0'), e.enumlabel::text
    from pg_catalog.pg_enum e
   where e.enumtypid = pg_catalog.to_regtype('storage.buckettype')
  union all
  select 2, 0, 'enum', 'storage.buckettype',
         case when pg_catalog.to_regtype('storage.buckettype') is null then 'NO EXISTE'
              when (select t.typtype from pg_catalog.pg_type t where t.oid = pg_catalog.to_regtype('storage.buckettype')) <> 'e' then 'existe pero NO es un enum: ' || (select t.typtype::text from pg_catalog.pg_type t where t.oid = pg_catalog.to_regtype('storage.buckettype'))
              else 'enum con ' || (select count(*) from pg_catalog.pg_enum e where e.enumtypid = pg_catalog.to_regtype('storage.buckettype')) || ' valores' end
  union all
  select 3, 0, 'privilegios', current_user || ' en storage.' || r.t,
         coalesce(nullif(pg_catalog.concat_ws(',',
           case when pg_catalog.has_table_privilege(current_user, 'storage.' || r.t, 'SELECT') then 'SELECT' end,
           case when pg_catalog.has_table_privilege(current_user, 'storage.' || r.t, 'INSERT') then 'INSERT' end,
           case when pg_catalog.has_table_privilege(current_user, 'storage.' || r.t, 'UPDATE') then 'UPDATE' end,
           case when pg_catalog.has_table_privilege(current_user, 'storage.' || r.t, 'DELETE') then 'DELETE' end), ''), '-')
    from (values ('buckets'), ('objects')) r(t)
   where pg_catalog.to_regclass('storage.' || r.t) is not null
  union all
  select 4, 0, 'FIN', 's14d', 'consulta'
) x order by o, s, objeto collate "C", detalle;
