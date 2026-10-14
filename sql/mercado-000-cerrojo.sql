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
--     nulos, valores por defecto, restricciones, RLS, politicas, disparadores
--     o permisos distintos): no se toca; decide el CTO.
-- IDEMPOTENTE: si ya existe con esta forma, no la toca, lo dice y la vuelve a
-- comprobar. ATOMICA: un DO (o todo o nada); la comprobacion final de la forma
-- corre tambien cuando acaba de crearla.
--
-- COMO SE APLICA: entera, en el editor SQL de Supabase (como postgres), ANTES
-- de mercado-001 (runbook). Dos SET LOCAL (valen si el editor lo ejecuta todo
-- en una transaccion), el DO (fija dentro search_path y lock_timeout) y una
-- SELECT de informe que acaba en «FIN | mercado-000 aplicada». Ensayada en
-- PostgreSQL 17 local (pruebas/mercado-000-cerrojo.mjs), como superusuario y
-- como el postgres no superusuario de s06, sobre el montaje literal de s04.
-- ============================================================================
set local statement_timeout = '30s';
set local lock_timeout = '5s';
do $m$
declare
  t regclass;
  forma text;
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
    case when (select count(*) from pg_index i where i.indrelid = t) <> 1 then 'indices distintos de la clave' end,
    case when exists (select 1 from pg_class c, aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) x
                       where c.oid = t and x.grantee in (0, 'anon'::regrole, 'authenticated'::regrole)) then 'PUBLIC, anon o authenticated tienen permisos' end,
    case when (select string_agg(x.privilege_type, ',' order by x.privilege_type) from pg_class c, aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) x
                where c.oid = t and x.grantee = 'service_role'::regrole) is distinct from 'DELETE,INSERT,SELECT'
         then 'service_role no tiene exactamente SELECT, INSERT y DELETE' end,
    case when exists (select 1 from pg_attribute a where a.attrelid = t and a.attacl is not null) then 'permisos de columna' end
  ) into forma;
  if forma <> '' then
    raise exception 'mercado-000: public.mercado_cerrojo existe con otra forma (%); no se toca; decide el CTO', forma;
  end if;
end $m$;

select seccion, detalle from (
  select 1 o, 'tabla' seccion, 'public.mercado_cerrojo · rls=' || c.relrowsecurity || ' · politicas=' || (select count(*) from pg_catalog.pg_policy p where p.polrelid = c.oid)
         || ' · filas=' || (select count(*) from public.mercado_cerrojo) detalle
    from pg_catalog.pg_class c where c.oid = to_regclass('public.mercado_cerrojo')
  union all
  select 2, 'permisos', coalesce((select string_agg(r.rolname || '=' || x.privilege_type, ', ' order by r.rolname, x.privilege_type)
                                    from pg_catalog.pg_class c, pg_catalog.aclexplode(c.relacl) x join pg_catalog.pg_roles r on r.oid = x.grantee
                                   where c.oid = to_regclass('public.mercado_cerrojo') and r.rolname in ('anon', 'authenticated', 'service_role')), '-')
  union all
  select 3, 'limites', 'lock_timeout=' || current_setting('lock_timeout') || ' · statement_timeout=' || current_setting('statement_timeout') || ' (en el editor, una sola transaccion: 5s y 30s; dentro del DO, lock_timeout=5s siempre)'
  union all
  select 4, 'FIN', 'mercado-000 aplicada'
) x order by o;
