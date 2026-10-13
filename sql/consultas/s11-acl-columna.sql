-- ============================================================================
-- CONSULTA DE SOLO LECTURA · S11 · ACL de columna y privilegios efectivos por
-- columna en las tablas del simulador
--
-- Diseño revisiones/2026-10-12-diseno-sim-004-y-motor-v1.md, o.13.5.7 y o.14
-- (CTO 13-oct). La guarda final de sql/sim-004a-preparatoria.sql (E1-05) exige
-- que sim_sessions y sim_trades NO tengan ninguna ACL de columna
-- (pg_attribute.attacl): si la tuvieran, la preparatoria abortaria. Esta
-- consulta lo mide ANTES. Runbook: paso previo OBLIGATORIO a la preparatoria;
-- Ramon la ejecuta y devuelve el resultado completo, que va a revisiones-suite.
-- Si la seccion acl_columna trae alguna fila distinta de «total», o efectivo
-- trae «DIFIERE DE LA TABLA», se PARA y decide el CTO.
--
-- NO cambia nada: es UNA sola SELECT. Ensayada dentro de una transaccion
-- READ ONLY sobre el montaje literal (pruebas/s11-acl-columna.mjs), con un
-- control: ACL plantadas que tienen que aparecer. Solo catalogo: ni una fila
-- de alumnos. Se pega entera en el editor SQL de Supabase. Acaba en
-- «FIN | s11 | consulta».
--
-- Tablas: sim_sessions, sim_trades y las de sim-003 (sim_alumnos,
-- sim_arrendamientos, sim_recibos, sim_eventos). Si alguna no existe, lo dice.
--
-- Que trae, por este orden:
--   0 hora         ahora (UTC) y version del servidor
--   1 tabla        cada tabla: si existe, cuantas columnas y su dueño
--   2 acl_columna  cada columna con ACL propia (attacl), con la ACL tal cual;
--                  y «total» (0 = ninguna)
--   3 efectivo     por tabla, rol (PUBLIC, anon, authenticated, service_role) y
--                  privilegio (SELECT, INSERT, UPDATE, REFERENCES): el de la
--                  tabla y en cuantas columnas lo tiene de verdad (con herencia).
--                  «DIFIERE DE LA TABLA» si no coinciden (un grant de columna).
--                  PUBLIC va con fila propia; anon, authenticated y service_role
--                  incluyen lo que heredan de PUBLIC y de los roles de que son
--                  miembros (has_column_privilege)
-- ============================================================================
with tablas (o, nombre) as (
  values (1, 'sim_sessions'), (2, 'sim_trades'), (3, 'sim_alumnos'), (4, 'sim_arrendamientos'), (5, 'sim_recibos'), (6, 'sim_eventos')
), t as (
  select o, nombre, to_regclass('public.' || nombre) rel from tablas
), cols as (
  select t.o, t.nombre, t.rel, a.attnum, a.attname, a.attacl
    from t join pg_attribute a on a.attrelid = t.rel and a.attnum > 0 and not a.attisdropped
), roles (r) as (
  values ('public'), ('anon'), ('authenticated'), ('service_role')
), privs (p, op) as (
  values ('SELECT', 1), ('INSERT', 2), ('UPDATE', 3), ('REFERENCES', 4)
), celdas as (
  select c.o, c.nombre, c.rel, c.attnum, c.attname, r.r, pv.p, pv.op,
         has_column_privilege(r.r, c.rel, c.attnum, pv.p) si
    from cols c cross join roles r cross join privs pv
), ef as (
  select o, nombre, r, p, op, has_table_privilege(r, rel, p) en_tabla, count(*) n,
         count(*) filter (where si) n_si,
         string_agg(attname, ',' order by attnum) filter (where si) cols_si
    from celdas group by o, nombre, rel, r, p, op
)
select seccion, objeto, detalle from (
  select 0 o, 0 o2, 'hora' seccion, to_char(now() at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS') || ' UTC' objeto, version() detalle
  union all
  select 1, t.o, 'tabla', t.nombre,
         case when t.rel is null then 'NO EXISTE'
              else (select count(*) from cols c where c.rel = t.rel) || ' columnas · dueño ' || (select pg_get_userbyid(relowner) from pg_class where oid = t.rel) end
    from t
  union all
  select 2, c.o * 1000 + c.attnum, 'acl_columna', c.nombre || '.' || c.attname, c.attacl::text
    from cols c where coalesce(cardinality(c.attacl), 0) > 0
  union all
  select 2, 999999, 'acl_columna', 'total', count(*) || ' columnas con ACL propia'
    from cols c where coalesce(cardinality(c.attacl), 0) > 0
  union all
  select 3, ef.o * 100 + ef.op, 'efectivo', ef.nombre || ' · ' || ef.r || ' · ' || ef.p,
         'tabla=' || ef.en_tabla || ' · columnas: '
         || case when ef.n_si = ef.n then 'todas (' || ef.n || ')' when ef.n_si = 0 then 'ninguna' else ef.n_si || ' de ' || ef.n || ': ' || ef.cols_si end
         || case when (ef.en_tabla and ef.n_si = ef.n) or (not ef.en_tabla and ef.n_si = 0) then '' else ' · DIFIERE DE LA TABLA' end
    from ef
  union all
  select 4, 0, 'FIN', 's11', 'consulta'
) x order by o, o2, objeto collate "C";
