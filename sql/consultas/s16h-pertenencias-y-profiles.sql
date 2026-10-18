-- ============================================================================
-- CONSULTA DE SOLO LECTURA · S16h · las pertenencias de anon y authenticated (con sus opciones) y los privilegios
-- efectivos del dueño de las RPC en public.profiles (etapa 3, ronda 5; CTO 18-oct, orden 1-013; Astra E3R4-01/02)
--
-- Mide en produccion lo que exigen los dos requisitos nuevos de la s16 y de sim-004b, para acreditarlos antes de
-- aplicarlos: que anon y authenticated no pertenecen (directa o en cadena, con SET o con INHERIT) a ningun rol
-- privilegiado, y que el dueño de las RPC tiene en profiles lo que necesitan sus cuerpos. Trae:
--   1 miembro     cada concesion directa A → R (A anon o authenticated): admin, inherit, set y quien la concedio
--   2 alcanza     cada rol privilegiado que anon o authenticated alcanzan por pertenencia (lo esperado: ninguno)
--   3 profiles    el dueño de las RPC: SELECT de id, plan y simulador_activo; UPDATE en alguna columna; y en la tabla
--   4 resumen
--
-- NO cambia nada: UNA sola SELECT, sin escrituras ni EXECUTE ni set_config. Solo catalogo y funciones de privilegio:
-- ningun dato de alumnos. Ensayada en READ ONLY (pruebas/s16h-pertenencias-y-profiles.mjs). Ramon la pega como postgres
-- en el editor SQL de Supabase cuando el CTO la pida. Acaba en «FIN | s16h | consulta».
-- ============================================================================
with
dueno as (select p.proowner o from pg_catalog.pg_proc p where p.oid = pg_catalog.to_regprocedure('public.sim_crear_sesion(uuid,uuid,uuid,text,integer,jsonb,jsonb,jsonb,jsonb)')),
alumno as (select r.oid, r.rolname from pg_catalog.pg_roles r where r.rolname in ('anon', 'authenticated')),
privilegiado as (
  select r.oid, r.rolname from pg_catalog.pg_roles r
   where r.rolname in ('service_role', 'postgres') or r.rolsuper or r.rolbypassrls or r.oid in (select o from dueno)
      or r.oid in (select c.relowner from pg_catalog.pg_class c where c.oid in (select pg_catalog.to_regclass('public.' || t) from unnest(array['sim_alumnos', 'sim_arrendamientos', 'sim_recibos', 'sim_eventos', 'sim_escrituras_v0', 'sim_escrituras_v0_marcas', 'sim_servicio', 'sim_sessions', 'sim_trades', 'session_drawings', 'session_chart_config', 'sim_drawing_templates', 'user_chart_config', 'user_tool_config']) t))
      -- RE5-01 (revisor interno de 4c522cb): y los dueños de lo que usan los cuerpos fuera de las 14: profiles, auth.users
      -- y auth.uid() (un miembro con INHERIT del dueño de profiles actua como dueño: privilegios y RLS)
      or r.oid in (select c.relowner from pg_catalog.pg_class c where c.oid in (pg_catalog.to_regclass('public.profiles'), pg_catalog.to_regclass('auth.users')))
      or r.oid = (select f.proowner from pg_catalog.pg_proc f where f.oid = pg_catalog.to_regprocedure('auth.uid()'))),
filas as (
  select 1 o, 'miembro' seccion, a.rolname || ' → ' || g.rolname objeto,
         'admin=' || m.admin_option::text || ' · inherit=' || m.inherit_option::text || ' · set=' || m.set_option::text || ' · concedido_por=' || pg_catalog.pg_get_userbyid(m.grantor) detalle
    from pg_catalog.pg_auth_members m join alumno a on a.oid = m.member join pg_catalog.pg_roles g on g.oid = m.roleid
  union all
  -- E3R5-01 (Astra r5): tambien si el alumno ES el rol privilegiado (dueño directo), no solo miembro de otro
  select 2, 'alcanza', a.rolname || ' → ' || p.rolname, case when a.oid = p.oid then 'ES el mismo rol (dueño directo)' else 'MEMBER (directa o en cadena, con SET o con INHERIT)' end
    from alumno a cross join privilegiado p where a.oid = p.oid or pg_catalog.pg_has_role(a.oid, p.oid, 'MEMBER')
  union all
  select 3, 'profiles', 'dueño de las RPC (' || coalesce((select pg_catalog.pg_get_userbyid(o) from dueno), 'NO EXISTE') || ')',
         'SELECT id=' || coalesce(pg_catalog.has_column_privilege((select o from dueno), 'public.profiles', 'id', 'SELECT')::text, '-')
         || ' plan=' || coalesce(pg_catalog.has_column_privilege((select o from dueno), 'public.profiles', 'plan', 'SELECT')::text, '-')
         || ' simulador_activo=' || coalesce(pg_catalog.has_column_privilege((select o from dueno), 'public.profiles', 'simulador_activo', 'SELECT')::text, '-')
         || ' · UPDATE en alguna columna=' || coalesce(pg_catalog.has_any_column_privilege((select o from dueno), 'public.profiles', 'UPDATE')::text, '-')
         || ' · tabla SELECT=' || coalesce(pg_catalog.has_table_privilege((select o from dueno), 'public.profiles', 'SELECT')::text, '-')
         || ' UPDATE=' || coalesce(pg_catalog.has_table_privilege((select o from dueno), 'public.profiles', 'UPDATE')::text, '-')
         || ' · dueño de profiles=' || pg_catalog.pg_get_userbyid((select c.relowner from pg_catalog.pg_class c where c.oid = 'public.profiles'::regclass)))
select seccion, objeto, detalle from (
  select o, seccion, objeto, detalle from filas
  union all
  select 4, 'resumen', 'recuentos', (select count(*) from filas where seccion = 'miembro')::text || ' concesiones directas · '
         || (select count(*) from filas where seccion = 'alcanza')::text || ' roles privilegiados alcanzados'
  union all
  select 5, 'FIN', 's16h', 'consulta'
) x order by o, objeto collate "C", detalle collate "C";
