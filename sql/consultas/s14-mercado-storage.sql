-- ============================================================================
-- CONSULTA DE SOLO LECTURA · S14 · Storage y el bucket «mercado» (etapa 2)
--
-- Diseño revisiones/2026-10-12-diseno-sim-004-y-motor-v1.md, p.7–p.8: antes
-- de aplicar sql/mercado-001-bucket.sql (¿choca «mercado» con algo? ¿alguna
-- politica de storage.objects podria abrirlo?) y despues (¿quedo privado?
-- ¿que hay publicado?). Se pega como postgres en el editor SQL de Supabase.
--
-- NO cambia nada: UNA sola SELECT, sin escrituras ni EXECUTE. Nada que editar.
-- Ensayada dentro de una transaccion READ ONLY (pruebas/mercado-001-
-- bucket.mjs). Acaba en «FIN | s14 | consulta».
--
-- Nada personal: de los buckets ajenos solo cuentas y bytes, nunca nombres de
-- objetos. Del bucket mercado, solo agregados por par y la fecha del puntero.
-- Del texto de las politicas, los UUID y los correos salen como <uuid> y
-- <email>.
--
-- Que trae, por este orden:
--   1 bucket      cada bucket: publico, limite, tipos MIME, objetos y bytes
--   2 rls         storage.objects · rls=true|false
--   2 disparador  cada disparador de storage.objects: momento, ordenes, por
--                 fila o por sentencia, funcion (uno por sentencia en DELETE
--                 haria «no concluyente» la sonda de mercado-001)
--   3 politica    cada politica de storage.objects: orden, PERMISSIVE o
--                 RESTRICTIVE, roles y veredicto con la MISMA lista blanca
--                 que la guarda de mercado-001 (el bloque «clasificador» es
--                 identico en los dos ficheros): «reconocida: solo <bucket>» o
--                 «NO RECONOCIDA: mercado-001 abortaria»; debajo, el texto de
--                 su USING y de su WITH CHECK tal como lo guarda PostgreSQL
--   4 mercado     si existe: trozos y manifiestos por par, el puntero
--                 (v1/actual.json) y su ultima actualizacion, el cerrojo
--                 (v1/_cerrojo.json), las constancias de liberacion
--                 (v1/_liberados/) y objetos fuera de v1/
-- ============================================================================
with recursive
-- >>> clasificador (identico en sql/mercado-001-bucket.sql y sql/consultas/s14-mercado-storage.sql)
pol as (
  select p.policyname, p.cmd, p.permissive, p.roles::text roles, p.qual, p.with_check
    from pg_policies p where p.schemaname = 'storage' and p.tablename = 'objects'
),
ex as (
  select policyname, 'USING' cual, qual t from pol where qual is not null
  union all
  select policyname, 'WITH CHECK', with_check from pol where with_check is not null
),
-- caracter a caracter: d0/d1 = profundidad de parentesis antes/despues, q = comilla abierta
car (policyname, cual, t, i, c, d0, d1, q) as (
  select policyname, cual, t, 1, left(t, 1), 0,
         case left(t, 1) when '(' then 1 when ')' then -1 else 0 end,
         case when left(t, 1) in ('''', '"') then left(t, 1) else '' end
    from ex where t <> ''
  union all
  select policyname, cual, t, i + 1, substr(t, i + 1, 1), d1,
         d1 + case when q <> '' then 0 when substr(t, i + 1, 1) = '(' then 1 when substr(t, i + 1, 1) = ')' then -1 else 0 end,
         case when q = '' and substr(t, i + 1, 1) in ('''', '"') then substr(t, i + 1, 1) when q <> '' and substr(t, i + 1, 1) = q then '' else q end
    from car where i < length(t)
),
-- esqueleto: lo que queda a profundidad 0-1; una conjuncion de nivel superior es «(() AND () ...)»
forma as (
  select policyname, cual,
         string_agg(case when least(d0, d1) <= 1 then c else '' end, '' order by i) esqueleto,
         bool_and(d1 >= 1 or i = length(t)) envuelta,
         max(case when i = length(t) then d1::text || '|' || q end) final
    from car group by policyname, cual
),
exp_ok as (
  select e.policyname, e.cual,
         case
           when e.t ~ '''mercado''' then null
           when e.t ~ '^\(bucket_id = ''[^'']*''::text\)$' then substring(e.t from '^\(bucket_id = ''([^'']*)''::text\)$')
           when f.envuelta and f.final = '0|' and f.esqueleto ~ '^\(\(\)( AND \(\))+\)$' then
             (select min(substring(substr(g.t, g.i) from '^\(bucket_id = ''([^'']*)''::text\)'))
                from car g where g.policyname = e.policyname and g.cual = e.cual and g.c = '(' and g.d0 = 1 and g.d1 = 2)
         end bucket
    from ex e left join forma f on f.policyname = e.policyname and f.cual = e.cual
),
veredicto as (
  select p.policyname, p.cmd, p.permissive, p.roles, p.qual, p.with_check,
         case when (p.cmd = 'INSERT' and p.with_check is null) or (p.cmd <> 'INSERT' and p.qual is null) then null
              when exists (select 1 from exp_ok e where e.policyname = p.policyname and e.bucket is null) then null
              else (select string_agg(distinct e.bucket, ', ') from exp_ok e where e.policyname = p.policyname) end buckets
    from pol p
)
-- <<< clasificador
, m as (
  select o.name, o.updated_at, coalesce((o.metadata ->> 'size')::bigint, 0) bytes
    from storage.objects o where o.bucket_id = 'mercado'
),
texto as (
  select policyname, s, cual, regexp_replace(regexp_replace(regexp_replace(t, '\s+', ' ', 'g'),
           '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}', '<uuid>', 'g'),
           '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+', '<email>', 'g') t
    from (select policyname, 2 s, 'USING' cual, qual t from veredicto union all select policyname, 3, 'WITH CHECK', with_check from veredicto) x
)
select seccion, objeto, detalle from (
  select 1 o, 1 s, 'bucket' seccion, b.id objeto,
         'public=' || b.public || ' · file_size_limit=' || coalesce(b.file_size_limit::text, '-') || ' · allowed_mime_types=' || coalesce(b.allowed_mime_types::text, '-')
         || ' · objetos=' || (select count(*) from storage.objects x where x.bucket_id = b.id)
         || ' · bytes=' || (select coalesce(sum((x.metadata ->> 'size')::bigint), 0) from storage.objects x where x.bucket_id = b.id) detalle
    from storage.buckets b
  union all
  select 1, 1, 'bucket', 'mercado', 'NO EXISTE' where not exists (select 1 from storage.buckets where id = 'mercado' or name = 'mercado')
  union all
  select 2, 1, 'rls', 'storage.objects', 'rls=' || c.relrowsecurity from pg_class c where c.oid = to_regclass('storage.objects')
  union all
  select 2, 2, 'disparador', t.tgname,
         case when t.tgtype & 2 = 2 then 'BEFORE' when t.tgtype & 64 = 64 then 'INSTEAD OF' else 'AFTER' end || ' '
         || concat_ws('/', case when t.tgtype & 4 = 4 then 'INSERT' end, case when t.tgtype & 8 = 8 then 'DELETE' end, case when t.tgtype & 16 = 16 then 'UPDATE' end, case when t.tgtype & 32 = 32 then 'TRUNCATE' end)
         || ' · ' || case when t.tgtype & 1 = 1 then 'por fila' else 'POR SENTENCIA' end || ' · ' || t.tgfoid::regproc::text || case when t.tgenabled = 'D' then ' · desactivado' else '' end
    from pg_trigger t where t.tgrelid = to_regclass('storage.objects') and not t.tgisinternal
  union all
  select 3, 1, 'politica', v.policyname, v.cmd || ' · ' || v.permissive || ' · ' || v.roles || ' · '
         || case when v.buckets is not null then 'reconocida: solo ' || v.buckets else 'NO RECONOCIDA: mercado-001 abortaria' end
    from veredicto v
  union all
  select 3, x.s, 'politica', x.policyname, x.cual || ': ' || coalesce(x.t, '(sin expresion)') from texto x
  union all
  select 3, 1, 'politica', '(ninguna)', 'storage.objects no tiene politicas' where not exists (select 1 from pol)
  union all
  select 4, 1, 'mercado', split_part(m.name, '/', 2), 'trozos=' || count(*) filter (where m.name ~ '\.bin\.br$') || ' · bytes=' || sum(m.bytes) filter (where m.name ~ '\.bin\.br$')
         || ' · manifiestos=' || count(*) filter (where m.name ~ '/manifiestos/')
    from m where m.name ~ '^v1/[A-Z]{6}/' group by split_part(m.name, '/', 2)
  union all
  select 4, 1, 'mercado', 'puntero', coalesce((select 'v1/actual.json · actualizado ' || to_char(m.updated_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS') || ' UTC' from m where m.name = 'v1/actual.json'), 'no hay')
   where exists (select 1 from storage.buckets where id = 'mercado')
  union all
  select 4, 1, 'mercado', 'cerrojo', coalesce((select 'PUESTO desde ' || to_char(m.updated_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS') || ' UTC' from m where m.name = 'v1/_cerrojo.json'), 'no hay')
   where exists (select 1 from storage.buckets where id = 'mercado')
  union all
  select 4, 1, 'mercado', 'liberaciones', count(*)::text || ' constancia(s) en v1/_liberados/ (scripts/mercado-v1-liberar-cerrojo.mjs)' from m where m.name ~ '^v1/_liberados/' having count(*) > 0
  union all
  select 4, 1, 'mercado', 'fuera de v1/', count(*)::text from m where m.name !~ '^v1/' having count(*) > 0
  union all
  select 5, 1, 'FIN', 's14', 'consulta'
) x order by o, objeto collate "C", s, detalle;
