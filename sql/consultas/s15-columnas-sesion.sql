-- ============================================================================
-- CONSULTA DE SOLO LECTURA · S15 · las columnas de sim_sessions que pide el cliente
--
-- Diseño revisiones/2026-10-12-diseno-sim-004-y-motor-v1.md, S4-07, q.9.6 y q.10 h (CTO
-- 14-oct): dashboard.js, analytics.js y _SessionInner.js leen sim_sessions con una LISTA
-- de columnas (lib/sim/columnas.js, COLUMNAS_SESION: todas menos estado y escritor). Si en
-- produccion faltase una sola, la lectura entera fallaria (PostgREST). Esto lo comprueba
-- contra information_schema ANTES de desplegar ese cliente.
--
-- NO cambia nada: es UNA sola SELECT, sin escrituras ni EXECUTE. No hay nada que editar.
-- Solo catalogo: ni una fila de alumnos. Ensayada dentro de una transaccion READ ONLY
-- (pruebas/s15-columnas-sesion.mjs), que tambien comprueba que la lista de aqui es,
-- literal, COLUMNAS_SESION. Acaba en «FIN | s15 | consulta».
--
-- Que trae, por este orden:
--   1 columna   una fila por columna pedida: «existe · <tipo>» o «FALTA»
--   2 sobra     las columnas de sim_sessions que NO se piden (deben ser estado y escritor
--               y las que se añadan despues); «nada» si no hay ninguna
--   3 veredicto «OK: estan las 24» o «FALTAN n: <lista> — NO desplegar ese cliente»
-- ============================================================================
with pedidas(orden, nombre) as (
  select ordinality::integer, trim(c) from unnest(string_to_array(
    'id, user_id, name, pair, timeframe, date_from, date_to, capital, balance, status, created_at, last_timestamp, challenge_type, challenge_phase, challenge_parent_id, motor_version, epoca, version, terminal, legado, legado_snapshot, mercado, creada_por_rpc, rev_saldo',
    ',')) with ordinality c
), reales as (
  select column_name::text nombre, data_type::text tipo
    from information_schema.columns
   where table_schema = 'public' and table_name = 'sim_sessions'
), faltan as (
  select p.orden, p.nombre from pedidas p where not exists (select 1 from reales r where r.nombre = p.nombre)
)
select seccion, objeto, detalle from (
  select 1 o, p.orden o2, 'columna' seccion, p.nombre objeto,
         coalesce((select 'existe · ' || r.tipo from reales r where r.nombre = p.nombre), 'FALTA') detalle
    from pedidas p
  union all
  select 2, 0, 'sobra', coalesce(string_agg(r.nombre, ', ' order by r.nombre), 'nada'), 'no las pide el cliente'
    from reales r where not exists (select 1 from pedidas p where p.nombre = r.nombre)
  union all
  select 3, 0, 'veredicto',
         case when (select count(*) from faltan) = 0 then 'OK' else 'FALTAN ' || (select count(*) from faltan) end,
         case when (select count(*) from faltan) = 0 then 'estan las ' || (select count(*) from pedidas) || ' columnas que pide el cliente'
              else (select string_agg(nombre, ', ' order by orden) from faltan) || ' — NO desplegar ese cliente' end
  union all
  select 4, 0, 'FIN', 's15', 'consulta'
) x order by o, o2, objeto collate "C";
