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
--
-- Que trae, por este orden:
--   1 bucket      cada bucket: publico, limite, tipos MIME, objetos y bytes
--   2 rls         storage.objects · rls=true|false
--   3 politica    cada politica de storage.objects: orden, roles y veredicto:
--                 «solo <bucket>» si cada expresion compara literalmente
--                 bucket_id = '<bucket>' sin OR, <>, !=, NOT ni ANY; si no, o
--                 si nombra 'mercado', «A REVISAR» (la misma regla que la
--                 guarda de mercado-001)
--   4 mercado     si existe: trozos y manifiestos por par, el puntero
--                 (v1/actual.json) y su ultima actualizacion, el cerrojo
--                 (v1/_cerrojo.json) y objetos fuera de v1/
-- ============================================================================
with pol as (
  select p.policyname, p.cmd, p.roles,
         (p.qual is not null or p.with_check is not null)
         and coalesce(p.qual ~ 'bucket_id = ''[^'']+''::text' and p.qual !~* '( OR |<>|!=|NOT |ANY)' and p.qual !~ '''mercado''', true)
         and coalesce(p.with_check ~ 'bucket_id = ''[^'']+''::text' and p.with_check !~* '( OR |<>|!=|NOT |ANY)' and p.with_check !~ '''mercado''', true) restringida,
         substring(coalesce(p.qual, p.with_check) from 'bucket_id = ''([^'']+)''::text') bucket
    from pg_policies p where p.schemaname = 'storage' and p.tablename = 'objects'
), m as (
  select o.name, o.updated_at, coalesce((o.metadata ->> 'size')::bigint, 0) bytes
    from storage.objects o where o.bucket_id = 'mercado'
)
select seccion, objeto, detalle from (
  select 1 o, 'bucket' seccion, b.id objeto,
         'public=' || b.public || ' · file_size_limit=' || coalesce(b.file_size_limit::text, '-') || ' · allowed_mime_types=' || coalesce(b.allowed_mime_types::text, '-')
         || ' · objetos=' || (select count(*) from storage.objects x where x.bucket_id = b.id)
         || ' · bytes=' || (select coalesce(sum((x.metadata ->> 'size')::bigint), 0) from storage.objects x where x.bucket_id = b.id) detalle
    from storage.buckets b
  union all
  select 1, 'bucket', 'mercado', 'NO EXISTE' where not exists (select 1 from storage.buckets where id = 'mercado' or name = 'mercado')
  union all
  select 2, 'rls', 'storage.objects', 'rls=' || c.relrowsecurity from pg_class c where c.oid = to_regclass('storage.objects')
  union all
  select 3, 'politica', p.policyname, p.cmd || ' · ' || p.roles::text || ' · ' || case when p.restringida then 'solo ' || p.bucket else 'A REVISAR: podria aplicarse a mercado' end from pol p
  union all
  select 3, 'politica', '(ninguna)', 'storage.objects no tiene politicas' where not exists (select 1 from pol)
  union all
  select 4, 'mercado', split_part(m.name, '/', 2), 'trozos=' || count(*) filter (where m.name ~ '\.bin\.br$') || ' · bytes=' || sum(m.bytes) filter (where m.name ~ '\.bin\.br$')
         || ' · manifiestos=' || count(*) filter (where m.name ~ '/manifiestos/')
    from m where m.name ~ '^v1/[A-Z]{6}/' group by split_part(m.name, '/', 2)
  union all
  select 4, 'mercado', 'puntero', coalesce((select 'v1/actual.json · actualizado ' || to_char(m.updated_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS') || ' UTC' from m where m.name = 'v1/actual.json'), 'no hay')
   where exists (select 1 from storage.buckets where id = 'mercado')
  union all
  select 4, 'mercado', 'cerrojo', coalesce((select 'PUESTO desde ' || to_char(m.updated_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS') || ' UTC' from m where m.name = 'v1/_cerrojo.json'), 'no hay')
   where exists (select 1 from storage.buckets where id = 'mercado')
  union all
  select 4, 'mercado', 'fuera de v1/', count(*)::text from m where m.name !~ '^v1/' having count(*) > 0
  union all
  select 5, 'FIN', 's14', 'consulta'
) x order by o, objeto collate "C", detalle;
