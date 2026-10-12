-- ============================================================================
-- CONSULTA DE SOLO LECTURA · S07 · permisos de lo nuevo de sim-003 (secuencias)
--
-- sim-003 (aplicada 12-oct) revoca las dos secuencias nuevas a PUBLIC, anon,
-- authenticated y service_role, pero ninguna guarda de su DO lo comprueba
-- (hueco para Astra, 12-oct). Esta consulta lo mira en la base viva. NO
-- cambia nada: es UNA sola SELECT, solo catalogo, sin datos de alumnos.
-- Ensayada en PostgreSQL 17 dentro de una transaccion READ ONLY sobre el
-- montaje literal de s04 con sim-003 aplicada (pruebas/s07-secuencias.mjs).
--
-- Se pega entera en el editor SQL de Supabase y se devuelve el resultado
-- completo (todas las filas). Acaba en «FIN | s07 | consulta».
--
-- Que trae, por este orden:
--   1 secuencia  sim_recibos_id_seq y sim_eventos_id_seq: USAGE, SELECT y
--                UPDATE de anon, authenticated, service_role y PUBLIC
--                (esperado: todo false)
--   2 acl        el ACL crudo (relacl) de las dos, y su dueño
--   3 tabla      sim_alumnos, sim_arrendamientos, sim_recibos y sim_eventos:
--                SELECT, INSERT, UPDATE y DELETE de anon, authenticated y
--                service_role (esperado: solo SELECT de authenticated y
--                service_role en sim_recibos y sim_eventos)
-- ============================================================================
with sec(nombre) as (values ('sim_recibos_id_seq'), ('sim_eventos_id_seq'))
, tab(nombre) as (values ('sim_alumnos'), ('sim_arrendamientos'), ('sim_recibos'), ('sim_eventos'))
, rol(nombre) as (values ('anon'), ('authenticated'), ('service_role'), ('public'))
select seccion, objeto, detalle from (
  -- 1 · secuencias: privilegios efectivos (PUBLIC incluido)
  select 1 o, 'secuencia' seccion, sec.nombre || ' · ' || case rol.nombre when 'public' then 'PUBLIC' else rol.nombre end objeto,
         case when to_regclass('public.' || sec.nombre) is null then 'NO EXISTE la secuencia'
              when rol.nombre <> 'public' and to_regrole(rol.nombre) is null then 'NO EXISTE el rol'
              else 'usage=' || has_sequence_privilege(rol.nombre, to_regclass('public.' || sec.nombre), 'USAGE')
                   || ' · select=' || has_sequence_privilege(rol.nombre, to_regclass('public.' || sec.nombre), 'SELECT')
                   || ' · update=' || has_sequence_privilege(rol.nombre, to_regclass('public.' || sec.nombre), 'UPDATE') end detalle
    from sec cross join rol
  union all
  -- 2 · ACL crudo
  select 2, 'acl', sec.nombre,
         coalesce((select 'dueño=' || pg_get_userbyid(c.relowner) || ' · relacl=' || coalesce(c.relacl::text, 'NULL (el de por defecto: solo el dueño)')
                     from pg_class c where c.oid = to_regclass('public.' || sec.nombre)), 'NO EXISTE la secuencia')
    from sec
  union all
  -- 3 · tablas nuevas
  select 3, 'tabla', tab.nombre || ' · ' || rol.nombre,
         case when to_regclass('public.' || tab.nombre) is null then 'NO EXISTE la tabla'
              when to_regrole(rol.nombre) is null then 'NO EXISTE el rol'
              else 'select=' || has_table_privilege(rol.nombre, to_regclass('public.' || tab.nombre), 'SELECT')
                   || ' · insert=' || has_table_privilege(rol.nombre, to_regclass('public.' || tab.nombre), 'INSERT')
                   || ' · update=' || has_table_privilege(rol.nombre, to_regclass('public.' || tab.nombre), 'UPDATE')
                   || ' · delete=' || has_table_privilege(rol.nombre, to_regclass('public.' || tab.nombre), 'DELETE') end
    from tab cross join rol where rol.nombre <> 'public'
  union all
  select 9, 'FIN', 's07', 'consulta'
) x order by o, objeto;
