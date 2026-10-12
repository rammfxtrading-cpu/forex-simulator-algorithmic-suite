-- ============================================================================
-- CONSULTA DE SOLO LECTURA · S06 · roles, ejecutor y catalogo antes de sim-003
--
-- Astra sim-003 ronda 2 (12-oct, «Lista exacta antes de aplicar», puntos 1-6 y
-- la precondicion de huerfanos): lo que s04/s05 no leen. NO cambia nada: es
-- UNA sola SELECT, solo catalogo, sin datos de alumnos (de las sesiones solo
-- sale UN numero). Ensayada en PostgreSQL 17 dentro de una transaccion READ
-- ONLY sobre el montaje literal de s04 (pruebas/s06-roles.mjs).
--
-- Se pega entera en el editor SQL de Supabase, TAL CUAL (el editor la corre
-- con su propio usuario: ese es el ejecutor que importa), y se devuelve el
-- resultado completo (todas las filas). Acaba en «FIN | s06 | consulta».
--
-- Que trae, por este orden:
--   1 version      version() y server_version_num
--   2 ejecutor     current_user y session_user
--   3 rol          anon, authenticated, service_role, postgres y el ejecutor:
--                  superuser, bypassrls, inherit, createrole (o NO EXISTE)
--   4 miembro      pg_auth_members con los dos extremos entre esos roles
--                  (admin/inherit/set si la version los tiene)
--   5 puede_ser    ademas, lo que cada uno de esos roles puede asumir de los
--                  otros, directo o heredado (pg_has_role MEMBER); solo los «si»
--   6 default_acl  pg_default_acl del ejecutor: global y de public (o «sin
--                  entradas», que tambien es un dato)
--   7 esquema      USAGE y CREATE de anon, authenticated y service_role en
--                  public, auth y extensions
--   8 auth.uid     dueño, SECURITY DEFINER, search_path, ACL y la definicion
--   9 fk           las FK vigentes que salen de sim_sessions o profiles o
--                  llegan a ellas, con su definicion y si estan validadas
--  10 inventario   cada nombre que sim-003 crea (el inventario de su guarda,
--                  sql/sim-003-persistencia-aditiva.sql, seccion «1 · nombres
--                  libres»): LIBRE u OCUPADO; y el total. Si sale algo
--                  OCUPADO, hay otra variante o un nombre de otro producto:
--                  no se aplica
--  11 huerfanos    cuantas sesiones no tienen perfil (SOLO el numero) y si el
--                  ejecutor ve todas las filas de sim_sessions y de profiles
--                  (si no, el numero no vale)
-- ============================================================================
with rol(nombre) as (select x from unnest(array['anon', 'authenticated', 'service_role', 'postgres',
                                                current_user::text, session_user::text]) x group by x)
, r as (select rol.nombre, p.oid from rol left join pg_roles p on p.rolname = rol.nombre)
, esq(nombre) as (values ('public'), ('auth'), ('extensions'))
, inv(clase, nombre) as (
    select 'relacion', x from unnest(array['sim_alumnos', 'sim_alumnos_pkey', 'sim_arrendamientos', 'sim_arrendamientos_pkey',
        'sim_arrendamientos_user_id_idx', 'sim_recibos', 'sim_recibos_pkey', 'sim_recibos_id_seq',
        'sim_recibos_session_command_key', 'sim_recibos_ultimo_avance_key', 'sim_recibos_session_creado_idx',
        'sim_eventos', 'sim_eventos_pkey', 'sim_eventos_id_seq', 'sim_eventos_session_seq_key',
        'sim_eventos_session_command_ordinal_key', 'sim_trades_evento_id_key', 'sim_sessions_una_hija_v1_key']) x
    union all
    select 'funcion', x from unnest(array['sim_crear_sesion', 'sim_tomar_escritor', 'sim_comando', 'sim_avanzar_fase',
        'sim_borrar_sesion', 'sim_borrar_legacy', 'sim_borrar_alumno', 'sim_error', 'sim_bloquea_alumno']) x
    union all
    select 'tipo', x from unnest(array['sim_alumnos', 'sim_arrendamientos', 'sim_recibos', 'sim_eventos',
        'sim_crear_sesion', 'sim_tomar_escritor', 'sim_comando', 'sim_avanzar_fase',
        'sim_borrar_sesion', 'sim_borrar_legacy', 'sim_borrar_alumno', 'sim_error', 'sim_bloquea_alumno']) x
    union all
    select 'restriccion', x from unnest(array['sim_sessions_user_id_perfil_fkey', 'sim_sessions_v1_coherente',
        'sim_sessions_terminal_valida', 'sim_trades_v1_coherente', 'sim_trades_evento_id_fkey']) x
    union all
    select 'columna', 'sim_sessions.' || x from unnest(array['motor_version', 'epoca', 'version', 'estado', 'escritor',
        'terminal', 'legado', 'legado_snapshot', 'mercado', 'creada_por_rpc']) x
    union all
    select 'columna', 'sim_trades.' || x from unnest(array['evento_id', 'motor_version', 'bruto_micro', 'neto_micro',
        'comision_micro', 'spread_micro', 'swap_micro', 'conversion', 'ambigua', 'causa_ambiguedad']) x)
, ocu as (select inv.clase, inv.nombre, case inv.clase
    when 'relacion' then (select string_agg(n.nspname || '.' || c.relname || ' (' || c.relkind::text || ')', ' · ' order by 1)
                            from pg_class c join pg_namespace n on n.oid = c.relnamespace where c.relname = inv.nombre)
    when 'funcion' then (select string_agg(p.oid::regprocedure::text, ' · ' order by 1) from pg_proc p where p.proname = inv.nombre)
    when 'tipo' then (select string_agg(n.nspname || '.' || t.typname || ' (' || t.typtype::text || ')', ' · ' order by 1)
                        from pg_type t join pg_namespace n on n.oid = t.typnamespace where t.typname = inv.nombre)
    when 'restriccion' then (select string_agg(c.conrelid::regclass::text || '.' || c.conname, ' · ' order by 1)
                               from pg_constraint c where c.conname = inv.nombre
                                and c.conrelid in (select to_regclass('public.sim_sessions') union select to_regclass('public.sim_trades')))
    else (select 'OCUPADA · ' || format_type(a.atttypid, a.atttypmod) from pg_attribute a
           where a.attrelid = to_regclass('public.' || split_part(inv.nombre, '.', 1))
             and a.attname = split_part(inv.nombre, '.', 2) and a.attnum > 0 and not a.attisdropped) end ocupado
    from inv)
, ve(tabla, todo) as (
    select t, case when c.oid is null then null
                   else not c.relrowsecurity
                        or (select rolsuper or rolbypassrls from pg_roles where rolname = current_user)
                        or (pg_has_role(current_user, c.relowner, 'USAGE') and not c.relforcerowsecurity) end
      from unnest(array['sim_sessions', 'profiles']) t left join pg_class c on c.oid = to_regclass('public.' || t))
select seccion, objeto, detalle from (
  -- 1 · version
  select 1 o, 'version' seccion, 'version()' objeto, version() detalle, 0 n
  union all
  select 1, 'version', 'server_version_num', current_setting('server_version_num'), 1
  union all
  -- 2 · ejecutor
  select 2, 'ejecutor', 'current_user', current_user::text, 0
  union all
  select 2, 'ejecutor', 'session_user', session_user::text, 1
  union all
  -- 3 · roles
  select 3, 'rol', r.nombre,
         coalesce((select 'superuser=' || p.rolsuper || ' · bypassrls=' || p.rolbypassrls || ' · inherit=' || p.rolinherit
                          || ' · createrole=' || p.rolcreaterole || ' · login=' || p.rolcanlogin
                     from pg_roles p where p.oid = r.oid), 'NO EXISTE'), 0
    from r
  union all
  -- 4 · membresias directas entre esos roles (to_jsonb: las columnas cambian con la version)
  select 4, 'miembro', pg_get_userbyid(m.member) || ' → ' || pg_get_userbyid(m.roleid),
         'admin=' || coalesce(to_jsonb(m) ->> 'admin_option', '-') || ' · inherit=' || coalesce(to_jsonb(m) ->> 'inherit_option', '-')
         || ' · set=' || coalesce(to_jsonb(m) ->> 'set_option', '-') || ' · concedido_por=' || coalesce(pg_get_userbyid((to_jsonb(m) ->> 'grantor')::oid), '-'), 0
    from pg_auth_members m
   where m.member in (select oid from r where oid is not null) and m.roleid in (select oid from r where oid is not null)
  union all
  -- 5 · lo que cada rol puede asumir de los otros, directo o heredado
  select 5, 'puede_ser', a.nombre || ' → ' || b.nombre,
         'member=si · usage=' || case when pg_has_role(a.oid, b.oid, 'USAGE') then 'si' else 'no' end, 0
    from r a cross join r b
   where a.oid is not null and b.oid is not null and a.oid <> b.oid and pg_has_role(a.oid, b.oid, 'MEMBER')
  union all
  -- 6 · privilegios por defecto del ejecutor (global = sin esquema)
  select 6, 'default_acl', current_user || ' · ' || coalesce(n.nspname, 'global') || ' · '
         || case d.defaclobjtype when 'r' then 'tablas' when 'S' then 'secuencias' when 'f' then 'funciones'
                 when 'T' then 'tipos' when 'n' then 'esquemas' else d.defaclobjtype::text end,
         d.defaclacl::text, 0
    from pg_default_acl d left join pg_namespace n on n.oid = d.defaclnamespace
   where d.defaclrole = (select oid from pg_roles where rolname = current_user)
     and (d.defaclnamespace = 0 or n.nspname = 'public')
  union all
  select 6, 'default_acl', current_user || ' · global y public', 'sin entradas', 0
   where not exists (select 1 from pg_default_acl d left join pg_namespace n on n.oid = d.defaclnamespace
                      where d.defaclrole = (select oid from pg_roles where rolname = current_user)
                        and (d.defaclnamespace = 0 or n.nspname = 'public'))
  union all
  -- 7 · USAGE y CREATE en los esquemas
  select 7, 'esquema', esq.nombre || ' · ' || r.nombre,
         case when to_regnamespace(esq.nombre) is null then 'NO EXISTE el esquema'
              when r.oid is null then 'NO EXISTE el rol'
              else 'usage=' || has_schema_privilege(r.oid, to_regnamespace(esq.nombre)::oid, 'USAGE')
                   || ' · create=' || has_schema_privilege(r.oid, to_regnamespace(esq.nombre)::oid, 'CREATE') end, 0
    from esq cross join r where r.nombre in ('anon', 'authenticated', 'service_role')
  union all
  -- 8 · auth.uid()
  select 8, 'auth.uid', 'auth.uid()',
         coalesce((select 'dueño=' || pg_get_userbyid(p.proowner) || ' · security_definer=' || p.prosecdef
                          || ' · config=' || coalesce(array_to_string(p.proconfig, ' ; '), '-')
                          || ' · acl=' || coalesce(p.proacl::text, '-') || ' · ' || pg_get_functiondef(p.oid)
                     from pg_proc p where p.oid = to_regprocedure('auth.uid()')), 'NO EXISTE'), 0
  union all
  -- 9 · FK que salen de sim_sessions/profiles o llegan a ellas
  select 9, 'fk', c.conrelid::regclass::text || '.' || c.conname,
         pg_get_constraintdef(c.oid) || ' · validada=' || c.convalidated, 0
    from pg_constraint c
   where c.contype = 'f'
     and (c.conrelid in (select to_regclass('public.sim_sessions') union select to_regclass('public.profiles'))
          or c.confrelid in (select to_regclass('public.sim_sessions') union select to_regclass('public.profiles')))
  union all
  -- 10 · el inventario de sim-003
  select 10, 'inventario', ocu.clase || ' · ' || ocu.nombre,
         case when ocu.ocupado is null then 'LIBRE' when ocu.clase = 'columna' then ocu.ocupado else 'OCUPADO · ' || ocu.ocupado end, 0
    from ocu
  union all
  select 10, 'inventario', '~ total', count(*) || ' nombres · ' || count(ocupado) || ' ocupados', 1
    from ocu
  union all
  -- 11 · sesiones sin perfil: solo el numero
  select 11, 'huerfanos', 'sesiones_sin_perfil',
         case when to_regclass('public.sim_sessions') is null or to_regclass('public.profiles') is null then 'NO EXISTE sim_sessions o profiles'
              else (select count(*) from public.sim_sessions s where not exists (select 1 from public.profiles p where p.id = s.user_id))::text
                   || ' · el ejecutor ve todas las filas: sim_sessions=' || coalesce((select case when todo then 'si' else 'NO' end from ve where tabla = 'sim_sessions'), '-')
                   || ' · profiles=' || coalesce((select case when todo then 'si' else 'NO' end from ve where tabla = 'profiles'), '-') end, 0
  union all
  select 99, 'FIN', 's06', 'consulta', 0
) x order by o, objeto, n;
