-- ============================================================================
-- CONSULTA DE SOLO LECTURA · S16g · que NOMBRES de ajuste hay fijados en pg_db_role_setting para la base y los
-- roles por los que pasa la ejecucion (etapa 3, ronda 4; CTO 17-oct, orden 1-011; revisor interno de d2910e6)
--
-- Antes de exigir que no haya ninguna clave pgrst.* (ni session_replication_role ni row_security) fijada en la base o
-- en esos roles, se mide que NOMBRES hay hoy en produccion (Supabase puede fijar alguna a proposito en authenticator),
-- para acreditar esa lista exacta y no convertirla en un rojo falso. Trae:
--   1 rol       cada rol del conjunto: anon, authenticated, service_role, authenticator, el dueño de las RPC, y todo rol
--               que sea miembro de authenticator o del que authenticator sea miembro (directo o indirecto); y por que
--   2 fijado    donde | nombre: cada ajuste pgrst.*, session_replication_role o row_security fijado para la base actual
--               o para uno de esos roles (en esta base o en todas)
--   3 resumen   cuantos
--
-- NO cambia nada: UNA sola SELECT, sin escrituras ni EXECUTE ni set_config. SOLO NOMBRES: de pg_db_role_setting se lee
-- unicamente la parte anterior al «=» de cada ajuste; ningun valor se lee ni se imprime (los de Supabase pueden ser
-- secretos). Ensayada en READ ONLY (pruebas/s16g-ajustes-por-nombre.mjs). Ramon la pega como postgres en el editor SQL
-- de Supabase cuando el CTO la pida. Acaba en «FIN | s16g | consulta».
-- ============================================================================
with
dueno as (select p.proowner o from pg_catalog.pg_proc p where p.oid = pg_catalog.to_regprocedure('public.sim_crear_sesion(uuid,uuid,uuid,text,integer,jsonb,jsonb,jsonb,jsonb)')),
aut as (select a.oid from pg_catalog.pg_roles a where a.rolname = 'authenticator'),
roles as (
  select r.oid, r.rolname::text nombre,
         concat_ws(', ',
           case when r.rolname in ('anon', 'authenticated', 'service_role', 'authenticator') then 'de la lista' end,
           case when r.oid in (select o from dueno) then 'dueño de las RPC' end,
           case when exists (select 1 from aut where r.oid <> aut.oid and pg_catalog.pg_has_role(r.oid, aut.oid, 'MEMBER')) then 'miembro de authenticator' end,
           case when exists (select 1 from aut where r.oid <> aut.oid and pg_catalog.pg_has_role(aut.oid, r.oid, 'MEMBER')) then 'authenticator es miembro' end) por
    from pg_catalog.pg_roles r
   where r.rolname in ('anon', 'authenticated', 'service_role', 'authenticator') or r.oid in (select o from dueno)
      or exists (select 1 from aut where r.oid <> aut.oid and (pg_catalog.pg_has_role(r.oid, aut.oid, 'MEMBER') or pg_catalog.pg_has_role(aut.oid, r.oid, 'MEMBER')))),
fijados as (
  select case when s.setrole = 0 then 'base' else 'rol ' || r.nombre end
         || case when s.setdatabase = 0 then ' (en todas las bases)' else '' end donde,
         split_part(c.x, '=', 1) nombre
    from pg_catalog.pg_db_role_setting s left join roles r on r.oid = s.setrole
         cross join lateral unnest(s.setconfig) c(x)
   where (s.setdatabase = 0 or s.setdatabase = (select d.oid from pg_catalog.pg_database d where d.datname = pg_catalog.current_database()))
     and (s.setrole = 0 or r.oid is not null)
     and (split_part(c.x, '=', 1) like 'pgrst.%' or split_part(c.x, '=', 1) in ('session_replication_role', 'row_security')))
select seccion, objeto, detalle from (
  select 1 o, 'rol' seccion, r.nombre objeto, r.por detalle from roles r
  union all
  select 2, 'fijado', f.donde, f.nombre from fijados f
  union all
  select 3, 'resumen', 'recuentos', (select count(*) from roles)::text || ' roles · ' || (select count(*) from fijados)::text || ' ajustes fijados (solo nombres)'
  union all
  select 4, 'FIN', 's16g', 'consulta'
) x order by o, objeto collate "C", detalle collate "C";
