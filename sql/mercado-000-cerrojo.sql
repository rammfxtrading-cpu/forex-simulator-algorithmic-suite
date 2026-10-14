-- ============================================================================
-- mercado-000-cerrojo — el CERROJO del publicador del mercado v1, en la base
-- (etapa 2; Astra E2R3-01, CTO 14-oct)
--
-- POR QUE EXISTE. El cerrojo era un objeto de Storage (v1/_cerrojo.json).
-- Storage borra por ruta, sin condicion: un DELETE incierto (timeout del
-- cliente con la peticion aun en el servidor) podia llegar tarde y borrar el
-- cerrojo de OTRO publicador (Astra, delete-tardio.mjs). En la base el borrado
-- es condicional y atomico:
--   adquirir  INSERT (recurso, dueno, descripcion): falla (23505) si ya hay fila;
--   soltar    DELETE ... WHERE recurso = X AND dueno = <uuid de la ejecucion>:
--             un DELETE tardio solo puede borrar la fila de SU dueño;
--   liberar   lo mismo, con el dueño que confirma una persona (--confirmo <uuid>).
-- Lo usa solo service_role (scripts/mercado-v1-*.mjs), que no pasa por la RLS.
--
-- QUE HACE: crea public.mercado_cerrojo (recurso text PK, solo 'mercado/v1';
-- dueno uuid; desde timestamptz default now(); descripcion text con forma
-- cerrada), RLS ACTIVA y SIN politicas; quita todo a PUBLIC, anon,
-- authenticated y service_role, y da a service_role SELECT, INSERT y DELETE.
-- Nada mas: ni funciones, ni disparadores, ni otras tablas.
--
-- GUARDAS (aborta sin tocar nada, con «mercado-000:» en el error):
--   · faltan los roles anon, authenticated o service_role;
--   · el nombre esta ocupado por otra cosa (cualquier relacion o tipo de
--     public con ese nombre; el indice de la clave);
--   · ya existe public.mercado_cerrojo con OTRA forma (columnas, tipos,
--     nulos, valores por defecto, restricciones, RLS, politicas, disparadores,
--     reglas de reescritura (E2R4-02) o permisos de columna): no se toca;
--     decide el CTO;
--   · PERMISOS EFECTIVOS no acreditados (E2R4-01, Astra; CTO 14-oct). No basta
--     el ACL directo: un rol que authenticated hereda (o que puede tomar con
--     SET ROLE) y que recibe TRUNCATE por los privilegios por defecto del
--     creador deja vaciar la tabla, y TRUNCATE no pasa por la RLS. Se exige,
--     con herencia y pertenencias (los privilegios de cualquier rol del que
--     sean miembros, pg_has_role MEMBER):
--       PUBLIC, anon y authenticated: ninguno de SELECT, INSERT, UPDATE,
--         DELETE, TRUNCATE, REFERENCES, TRIGGER (y MAINTAIN en PG >= 17);
--       service_role: exactamente SELECT, INSERT y DELETE, sin opcion de
--         conceder;
--       en el ACL, nadie mas que el dueño y service_role. A un destinatario
--         ajeno NO se le revoca a ciegas: se aborta y se lista;
--       ni anon, ni authenticated, ni service_role pueden actuar como el
--         DUEÑO (ser miembros de su rol, con herencia o solo con SET ROLE).
--         E2R5-01 (Astra r5): el dueño puede volver a concederse cualquier
--         privilegio aunque su ACL este revocado, y has_table_privilege no lo
--         ve: con el dueño sin permisos, authenticated tomaba su rol, se daba
--         TRUNCATE y vaciaba la tabla.
--     El error dice tambien los privilegios por defecto del creador en public
--     (pg_default_acl), de donde suelen venir. En primera aplicacion (la
--     creacion se deshace entera) y en cada reejecucion.
-- IDEMPOTENTE: si ya existe con esta forma, no la toca, lo dice y la vuelve a
-- comprobar. ATOMICA: un DO (o todo o nada); la comprobacion final de la forma
-- corre tambien cuando acaba de crearla.
--
-- COMO SE APLICA: entera, en el editor SQL de Supabase (como postgres), ANTES
-- de mercado-001 (runbook). Dos SET LOCAL (valen si el editor lo ejecuta todo
-- en una transaccion), el DO (fija dentro search_path y lock_timeout) y una
-- SELECT de informe que acaba en «FIN | mercado-000 aplicada», con los permisos
-- directos, los efectivos y los privilegios por defecto del creador. Ensayada en
-- PostgreSQL 17 local (pruebas/mercado-000-cerrojo.mjs), como superusuario y
-- como el postgres no superusuario de s06, sobre el montaje literal de s04.
-- ============================================================================
set local statement_timeout = '30s';
set local lock_timeout = '5s';
do $m$
declare
  t regclass;
  forma text;
  permisos text;
  defecto text;
  nueva boolean := false;
  privs text[];
begin
  perform pg_catalog.set_config('search_path', 'pg_catalog, pg_temp', true);
  perform pg_catalog.set_config('lock_timeout', '5s', true);
  if to_regrole('anon') is null or to_regrole('authenticated') is null or to_regrole('service_role') is null then
    raise exception 'mercado-000: faltan los roles anon, authenticated o service_role; no se crea nada';
  end if;

  t := to_regclass('public.mercado_cerrojo');
  if t is null then
    if exists (select 1 from pg_class c where c.relnamespace = 'public'::regnamespace and c.relname in ('mercado_cerrojo', 'mercado_cerrojo_pkey'))
       or exists (select 1 from pg_type y where y.typnamespace = 'public'::regnamespace and y.typname in ('mercado_cerrojo', '_mercado_cerrojo')) then
      raise exception 'mercado-000: el nombre mercado_cerrojo (o su indice o su tipo) ya esta ocupado en public; no se crea nada; decide el CTO';
    end if;
    create table public.mercado_cerrojo (
      recurso text primary key check (recurso = 'mercado/v1'),
      dueno uuid not null,
      desde timestamptz not null default now(),
      descripcion text not null check (descripcion ~ '^[a-z0-9][a-z0-9-]{0,39}$')
    );
    alter table public.mercado_cerrojo enable row level security;
    revoke all on table public.mercado_cerrojo from public, anon, authenticated, service_role;
    grant select, insert, delete on table public.mercado_cerrojo to service_role;
    t := 'public.mercado_cerrojo'::regclass;
    nueva := true;
  else
    raise notice 'mercado-000: public.mercado_cerrojo ya existe; se comprueba su forma y no se toca';
  end if;

  -- la forma, siempre (tambien recien creada)
  select concat_ws('; ',
    case when (select c.relkind from pg_class c where c.oid = t) <> 'r' then 'no es una tabla' end,
    case when (select string_agg(a.attname || ' ' || format_type(a.atttypid, a.atttypmod) || case when a.attnotnull then ' not null' else '' end
                                 || coalesce(' default ' || pg_get_expr(d.adbin, d.adrelid), ''), ', ' order by a.attnum)
                 from pg_attribute a left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
                where a.attrelid = t and a.attnum > 0 and not a.attisdropped)
              is distinct from 'recurso text not null, dueno uuid not null, desde timestamp with time zone not null default now(), descripcion text not null'
         then 'columnas distintas' end,
    case when (select string_agg(pg_get_constraintdef(k.oid), ' | ' order by pg_get_constraintdef(k.oid)) from pg_constraint k where k.conrelid = t)
              is distinct from 'CHECK ((descripcion ~ ''^[a-z0-9][a-z0-9-]{0,39}$''::text)) | CHECK ((recurso = ''mercado/v1''::text)) | PRIMARY KEY (recurso)'
         then 'restricciones distintas' end,
    case when not (select c.relrowsecurity from pg_class c where c.oid = t) then 'RLS apagada' end,
    case when exists (select 1 from pg_policy p where p.polrelid = t) then 'tiene politicas' end,
    case when exists (select 1 from pg_trigger g where g.tgrelid = t and not g.tgisinternal) then 'tiene disparadores' end,
    case when exists (select 1 from pg_rewrite w where w.ev_class = t) then 'tiene reglas de reescritura' end,
    case when (select count(*) from pg_index i where i.indrelid = t) <> 1 then 'indices distintos de la clave' end,
    case when exists (select 1 from pg_attribute a where a.attrelid = t and a.attacl is not null) then 'permisos de columna' end
  ) into forma;
  if forma <> '' then
    raise exception 'mercado-000: public.mercado_cerrojo existe con otra forma (%); no se toca; decide el CTO', forma;
  end if;

  -- E2R4-01: los permisos EFECTIVOS (ver la cabecera)
  privs := array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']
           || case when current_setting('server_version_num')::int >= 170000 then array['MAINTAIN'] else array[]::text[] end;
  select concat_ws('; ',
    -- en el ACL, nadie mas que el dueño y service_role
    (select 'destinatarios ajenos: ' || string_agg(a.g, ', ' order by a.g) from (
       select case when x.grantee = 0 then 'PUBLIC' else x.grantee::regrole::text end || '=' || string_agg(x.privilege_type, ',' order by x.privilege_type) g
         from pg_class c, aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) x
        where c.oid = t and x.grantee not in (c.relowner, 'service_role'::regrole)
        group by x.grantee) a),
    -- PUBLIC, anon y authenticated: nada, con herencia y pertenencias
    (select string_agg(e.u || ' tiene ' || e.p, '; ' order by e.n) from (
       select u.u, u.n, string_agg(pr, ',' order by pr) p
         from unnest(array['PUBLIC', 'anon', 'authenticated']) with ordinality u(u, n), unnest(privs) pr
        where case when u.u = 'PUBLIC' then has_table_privilege('public', t, pr)
                   else exists (select 1 from pg_roles r where pg_has_role(u.u, r.oid, 'MEMBER') and has_table_privilege(r.oid, t, pr)) end
        group by u.u, u.n) e),
    -- service_role: exactamente SELECT, INSERT y DELETE, con herencia y pertenencias, y en su ACL directo
    (select 'service_role tiene ' || coalesce(string_agg(pr, ',' order by pr), '-') || ' (tienen que ser exactamente DELETE,INSERT,SELECT)'
       from unnest(privs) pr
      where exists (select 1 from pg_roles r where pg_has_role('service_role', r.oid, 'MEMBER') and has_table_privilege(r.oid, t, pr))
     having coalesce(string_agg(pr, ',' order by pr), '-') <> 'DELETE,INSERT,SELECT'),
    case when (select string_agg(x.privilege_type, ',' order by x.privilege_type) from pg_class c, aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) x
                where c.oid = t and x.grantee = 'service_role'::regrole) is distinct from 'DELETE,INSERT,SELECT'
         then 'el ACL directo de service_role no es DELETE,INSERT,SELECT' end,
    case when exists (select 1 from pg_class c, aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) x
                       where c.oid = t and x.grantee = 'service_role'::regrole and x.is_grantable) then 'service_role puede conceder' end,
    -- E2R5-01: nadie de los tres puede actuar como el dueño (que concede lo que quiera, aunque su ACL este vacio)
    (select string_agg(u.u || ' puede actuar como el dueño (' || c.relowner::regrole::text || ')', '; ' order by u.n)
       from pg_class c, unnest(array['anon', 'authenticated', 'service_role']) with ordinality u(u, n)
      where c.oid = t and pg_has_role(u.u, c.relowner, 'MEMBER'))
  ) into permisos;
  if permisos <> '' then
    -- de donde suelen venir: los privilegios por defecto del creador (el dueño) en public y globales
    select r.rolname || ': en public: ' || coalesce((
             select string_agg(a.g, '; ' order by a.g) from pg_default_acl d, lateral (
               select case when x.grantee = 0 then 'PUBLIC' else x.grantee::regrole::text end || '=' || string_agg(x.privilege_type, ',' order by x.privilege_type) g
                 from aclexplode(d.defaclacl) x group by x.grantee) a
              where d.defaclrole = r.oid and d.defaclnamespace = 'public'::regnamespace and d.defaclobjtype = 'r'), '-')
           || ' · global: ' || coalesce((
             select string_agg(a.g, '; ' order by a.g) from pg_default_acl d, lateral (
               select case when x.grantee = 0 then 'PUBLIC' else x.grantee::regrole::text end || '=' || string_agg(x.privilege_type, ',' order by x.privilege_type) g
                 from aclexplode(d.defaclacl) x group by x.grantee) a
              where d.defaclrole = r.oid and d.defaclnamespace = 0 and d.defaclobjtype = 'r'), '-')
      into defecto
      from pg_class c join pg_roles r on r.oid = c.relowner where c.oid = t;
    raise exception 'mercado-000: permisos de public.mercado_cerrojo NO ACREDITADOS (%); privilegios por defecto de %; % no se revoca nada ajeno; decide el CTO',
      permisos, defecto, case when nueva then 'no se crea nada;' else 'no se toca;' end;
  end if;
end $m$;

select seccion, detalle from (
  select 1 o, 'tabla' seccion, 'public.mercado_cerrojo · rls=' || c.relrowsecurity || ' · politicas=' || (select count(*) from pg_catalog.pg_policy p where p.polrelid = c.oid)
         || ' · filas=' || (select count(*) from public.mercado_cerrojo) detalle
    from pg_catalog.pg_class c where c.oid = to_regclass('public.mercado_cerrojo')
  union all
  -- el ACL directo: todos los destinatarios menos el dueño
  select 2, 'permisos', coalesce((select pg_catalog.string_agg(case when x.grantee = 0 then 'PUBLIC' else x.grantee::pg_catalog.regrole::text end || '=' || x.privilege_type, ', '
                                                    order by case when x.grantee = 0 then 'PUBLIC' else x.grantee::pg_catalog.regrole::text end, x.privilege_type)
                                    from pg_catalog.pg_class c, pg_catalog.aclexplode(c.relacl) x
                                   where c.oid = pg_catalog.to_regclass('public.mercado_cerrojo') and x.grantee <> c.relowner), '-')
  union all
  -- E2R4-01: los efectivos, con herencia y pertenencias (los ha comprobado el DO)
  select 2, 'efectivos', (
    select pg_catalog.string_agg(u.u || '=' || coalesce((
             select pg_catalog.string_agg(pr, ',' order by pr)
               from pg_catalog.unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']
                                      || case when pg_catalog.current_setting('server_version_num')::int >= 170000 then array['MAINTAIN'] else array[]::text[] end) pr
              where case when u.u = 'PUBLIC' then pg_catalog.has_table_privilege('public', pg_catalog.to_regclass('public.mercado_cerrojo'), pr)
                         else exists (select 1 from pg_catalog.pg_roles r where pg_catalog.pg_has_role(u.u, r.oid, 'MEMBER')
                                                                            and pg_catalog.has_table_privilege(r.oid, pg_catalog.to_regclass('public.mercado_cerrojo'), pr)) end), '-'),
           ' · ' order by u.n)
      from pg_catalog.unnest(array['PUBLIC', 'anon', 'authenticated', 'service_role']) with ordinality u(u, n))
    || ' · ajenos=' || coalesce((select pg_catalog.string_agg(distinct case when x.grantee = 0 then 'PUBLIC' else x.grantee::pg_catalog.regrole::text end, ',')
                                   from pg_catalog.pg_class c, pg_catalog.aclexplode(c.relacl) x
                                  where c.oid = pg_catalog.to_regclass('public.mercado_cerrojo') and x.grantee not in (c.relowner, 'service_role'::pg_catalog.regrole)), 'ninguno')
  union all
  -- y los privilegios por defecto del creador (el dueño), en public y globales: de ahi vienen los grants de una tabla nueva
  select 2, 'por defecto', (
    select r.rolname || ': en public: ' || coalesce((
             select pg_catalog.string_agg(a.g, '; ' order by a.g) from pg_catalog.pg_default_acl d, lateral (
               select case when x.grantee = 0 then 'PUBLIC' else x.grantee::pg_catalog.regrole::text end || '=' || pg_catalog.string_agg(x.privilege_type, ',' order by x.privilege_type) g
                 from pg_catalog.aclexplode(d.defaclacl) x group by x.grantee) a
              where d.defaclrole = r.oid and d.defaclnamespace = 'public'::pg_catalog.regnamespace and d.defaclobjtype = 'r'), '-')
           || ' · global: ' || coalesce((
             select pg_catalog.string_agg(a.g, '; ' order by a.g) from pg_catalog.pg_default_acl d, lateral (
               select case when x.grantee = 0 then 'PUBLIC' else x.grantee::pg_catalog.regrole::text end || '=' || pg_catalog.string_agg(x.privilege_type, ',' order by x.privilege_type) g
                 from pg_catalog.aclexplode(d.defaclacl) x group by x.grantee) a
              where d.defaclrole = r.oid and d.defaclnamespace = 0 and d.defaclobjtype = 'r'), '-')
      from pg_catalog.pg_class c join pg_catalog.pg_roles r on r.oid = c.relowner where c.oid = pg_catalog.to_regclass('public.mercado_cerrojo'))
  union all
  select 3, 'limites', 'lock_timeout=' || current_setting('lock_timeout') || ' · statement_timeout=' || current_setting('statement_timeout') || ' (en el editor, una sola transaccion: 5s y 30s; dentro del DO, lock_timeout=5s siempre)'
  union all
  select 4, 'FIN', 'mercado-000 aplicada'
) x order by o;
