-- ============================================================================
-- CONSULTA DE SOLO LECTURA · S04 · el esquema real del simulador
--
-- Para versionar en sql/ el esquema tal como esta en produccion (hallazgo S04
-- de la auditoria de Astra del 4-oct-2026: el repo no tiene ningun SQL y no
-- puede reconstruirlo). NO cambia nada: es UNA sola SELECT, sin datos de
-- alumnos (solo catalogo: definiciones, permisos y la configuracion del bucket).
-- Ensayada en PostgreSQL 17 dentro de una transaccion READ ONLY
-- (pruebas/s04-consulta.mjs): si escribiera algo, fallaria.
--
-- Se pega entera en el editor SQL de Supabase y se devuelve el resultado
-- completo (todas las filas, tal cual). Acaba en «FIN | s04 | consulta».
--
-- Tablas: profiles, messages, sim_sessions, sim_trades, session_drawings,
-- session_chart_config, sim_drawing_templates, user_chart_config,
-- user_tool_config. Si alguna NO existe, sale una fila «0 FALTA».
--
-- Que trae, por este orden:
--   0 falta        las tablas pedidas que no existen en public
--   1 tabla        dueño, RLS (y si es forzada)
--   2 columna      orden, nombre, tipo, NOT NULL, default, identity/generada
--   3 restriccion  PK, FK (con sus ON DELETE), UNIQUE, CHECK, con su definicion
--   4 indice       la definicion completa de cada indice
--   5 trigger      los que no son internos, con su definicion
--   6 politica     comando, roles, USING y CHECK
--   7 grant        por tabla y por columna, a anon, authenticated, service_role y PUBLIC
--   8 funcion      las de los triggers de esas tablas, las de public que se
--                  nombran en sus politicas o en las de storage.objects, y
--                  is_admin() y handle_new_user(): firma literal, dueño,
--                  SECURITY DEFINER, search_path, ACL y la definicion entera
--   9 bucket        forex-data: publico, limite de tamaño, tipos admitidos
--  10 storage      RLS de storage.objects y TODAS sus politicas (una politica
--                  que no nombra el bucket tambien le aplica), marcando cuales
--                  nombran forex-data
-- ============================================================================
with t(nombre) as (values ('profiles'), ('messages'), ('sim_sessions'), ('sim_trades'), ('session_drawings'),
                          ('session_chart_config'), ('sim_drawing_templates'), ('user_chart_config'), ('user_tool_config'))
, rel as (select c.oid, c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relname in (select nombre from t))
, pol as (select p.* from pg_policies p
           where (p.schemaname = 'public' and p.tablename in (select nombre from t))
              or (p.schemaname = 'storage' and p.tablename = 'objects'))
select seccion, objeto, detalle from (
  select 0 o, 'FALTA' seccion, t.nombre::text objeto, 'no existe public.' || t.nombre detalle, 0 n
    from t where to_regclass('public.' || quote_ident(t.nombre)) is null
  union all
  select 1, 'tabla', c.relname::text,
         'dueño=' || pg_get_userbyid(c.relowner) || ' · rls=' || c.relrowsecurity || ' · rls_forzada=' || c.relforcerowsecurity, 0
    from pg_class c where c.oid in (select oid from rel)
  union all
  select 2, 'columna', c.relname::text || '.' || a.attname,
         lpad(a.attnum::text, 2, '0') || ' · ' || format_type(a.atttypid, a.atttypmod)
         || ' · ' || case when a.attnotnull then 'NOT NULL' else 'nulable' end
         || ' · default=' || coalesce(pg_get_expr(d.adbin, d.adrelid), '-')
         || case when a.attidentity <> '' then ' · identity=' || a.attidentity::text else '' end
         || case when a.attgenerated <> '' then ' · generada=' || a.attgenerated::text else '' end, a.attnum
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
   where a.attrelid in (select oid from rel) and a.attnum > 0 and not a.attisdropped
  union all
  select 3, 'restriccion', c.relname::text || '.' || k.conname,
         k.contype::text || ' · ' || pg_get_constraintdef(k.oid), 0
    from pg_constraint k
    join pg_class c on c.oid = k.conrelid
   where k.conrelid in (select oid from rel)
  union all
  -- las FK de OTRAS tablas que apuntan a estas (borrados en cascada que llegan de fuera)
  select 3, 'restriccion', c.relname::text || '.' || k.conname || ' (entrante)',
         k.contype::text || ' · ' || c.relnamespace::regnamespace::text || '.' || c.relname || ' ' || pg_get_constraintdef(k.oid), 0
    from pg_constraint k
    join pg_class c on c.oid = k.conrelid
   where k.contype = 'f' and k.confrelid in (select oid from rel) and k.conrelid not in (select oid from rel)
  union all
  select 4, 'indice', c.relname::text || '.' || i.relname,
         pg_get_indexdef(x.indexrelid) || ' · valido=' || x.indisvalid, 0
    from pg_index x
    join pg_class i on i.oid = x.indexrelid
    join pg_class c on c.oid = x.indrelid
   where x.indrelid in (select oid from rel)
  union all
  select 5, 'trigger', c.relname::text || '.' || g.tgname,
         pg_get_triggerdef(g.oid) || ' · activo=' || g.tgenabled::text, 0
    from pg_trigger g
    join pg_class c on c.oid = g.tgrelid
   where g.tgrelid in (select oid from rel) and not g.tgisinternal
  union all
  select 6, 'politica', p.schemaname || '.' || p.tablename || '.' || p.policyname,
         p.cmd || ' · ' || p.permissive || ' · ' || array_to_string(p.roles, ',')
         || ' · using=' || coalesce(p.qual, '-') || ' · check=' || coalesce(p.with_check, '-'), 0
    from pol p where p.schemaname = 'public'
  union all
  select 7, 'grant', g.table_name::text || ' · ' || g.grantee,
         string_agg(g.privilege_type, ',' order by g.privilege_type), 0
    from information_schema.role_table_grants g
   where g.table_schema = 'public' and g.table_name in (select nombre from t)
     and g.grantee in ('anon', 'authenticated', 'service_role', 'PUBLIC')
   group by g.table_name, g.grantee
  union all
  select 7, 'grant', g.table_name::text || '.' || g.column_name || ' · ' || g.grantee,
         'POR COLUMNA: ' || string_agg(g.privilege_type, ',' order by g.privilege_type), 0
    from information_schema.column_privileges g
   where g.table_schema = 'public' and g.table_name in (select nombre from t)
     and g.grantee in ('anon', 'authenticated', 'service_role', 'PUBLIC')
     and not exists (select 1 from information_schema.role_table_grants r
                      where r.table_schema = g.table_schema and r.table_name = g.table_name
                        and r.grantee = g.grantee and r.privilege_type = g.privilege_type)
   group by g.table_name, g.column_name, g.grantee
  union all
  select 8, 'funcion', p.oid::regprocedure::text,
         'dueño=' || pg_get_userbyid(p.proowner) || ' · definer=' || p.prosecdef
         || ' · config=' || coalesce(array_to_string(p.proconfig, ' '), '-')
         || ' · acl=' || coalesce(array_to_string(p.proacl, ' '), 'por defecto')
         || E'\n' || pg_get_functiondef(p.oid), 0
    from pg_proc p
   where p.prokind = 'f'
     and (p.oid in (select g.tgfoid from pg_trigger g where g.tgrelid in (select oid from rel) and not g.tgisinternal)
          or p.oid in (to_regprocedure('public.is_admin()'), to_regprocedure('public.handle_new_user()'))
          or (p.pronamespace = 'public'::regnamespace
              and exists (select 1 from pol
                           where coalesce(pol.qual, '') || ' ' || coalesce(pol.with_check, '') ~ ('\m' || p.proname || '\s*\('))))
  union all
  select 9, 'bucket', b.id::text,
         'publico=' || coalesce(b.public::text, 'null')
         || ' · limite_bytes=' || coalesce(b.file_size_limit::text, 'sin limite')
         || ' · tipos=' || coalesce(array_to_string(b.allowed_mime_types, ','), 'todos'), 0
    from storage.buckets b where b.id = 'forex-data'
  union all
  select 9, 'bucket', 'forex-data', 'NO EXISTE el bucket forex-data', 0
   where not exists (select 1 from storage.buckets where id = 'forex-data')
  union all
  select 10, 'storage', 'storage.objects',
         'rls=' || c.relrowsecurity || ' · rls_forzada=' || c.relforcerowsecurity, 0
    from pg_class c where c.oid = to_regclass('storage.objects')
  union all
  select 10, 'storage', 'storage.objects.' || p.policyname,
         case when coalesce(p.qual, '') || coalesce(p.with_check, '') like '%forex-data%' then 'NOMBRA forex-data · '
              else 'no nombra forex-data · ' end
         || p.cmd || ' · ' || p.permissive || ' · ' || array_to_string(p.roles, ',')
         || ' · using=' || coalesce(p.qual, '-') || ' · check=' || coalesce(p.with_check, '-'), 0
    from pol p where p.schemaname = 'storage'
  union all
  select 11, 'FIN', 's04', 'consulta', 0
) r order by o, objeto, n;
