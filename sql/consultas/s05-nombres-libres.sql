-- ============================================================================
-- CONSULTA DE SOLO LECTURA · S05 · ¿estan libres los nombres de la persistencia?
--
-- Antes de escribir el SQL estructural de la persistencia del motor
-- (revisiones/2026-10-07-diseno-persistencia.md), cada nombre nuevo tiene que
-- estar libre en la base compartida (simulador, hub, journal, Eirene y macro
-- viven en el mismo proyecto). NO cambia nada: es UNA sola SELECT, solo
-- catalogo, sin datos de alumnos. Ensayada en PostgreSQL 17 dentro de una
-- transaccion READ ONLY (pruebas/s05-nombres.mjs).
--
-- Se pega entera en el editor SQL de Supabase y se devuelve el resultado
-- completo (todas las filas, tal cual). Acaba en «FIN | s05 | consulta».
--
-- Que trae, por este orden:
--   1 nombre    cada tabla, funcion, tipo o secuencia que se crearia, en
--               CUALQUIER esquema: LIBRE, u OCUPADO con su esquema y su clase
--   2 columna   cada columna nueva de sim_sessions, sim_trades y profiles:
--               LIBRE, u OCUPADA con su tipo (y si la tabla no existe, lo dice)
--   3 prefijo   todo lo que ya existe en public con nombre sim_% (tablas,
--               vistas, indices, secuencias, funciones, tipos, restricciones,
--               politicas y triggers): lo que no sea de las 7 tablas conocidas
--               es de otro producto o de un intento anterior
--   4 extension pgcrypto (gen_random_bytes, digest): instalada o no, y en que
--               esquema
-- ============================================================================
with obj(nombre) as (values
    ('sim_recibos'), ('sim_eventos'), ('sim_arrendamientos'), ('sim_alumnos'),
    ('sim_comando'), ('sim_crear_sesion'), ('sim_tomar_escritor'), ('sim_avanzar_fase'),
    ('sim_borrar_sesion'), ('sim_borrar_alumno'), ('sim_error'), ('sim_bloquea_alumno'))
, col(tabla, columna) as (values
    ('sim_sessions', 'motor_version'), ('sim_sessions', 'epoca'), ('sim_sessions', 'version'),
    ('sim_sessions', 'estado'), ('sim_sessions', 'escritor'), ('sim_sessions', 'terminal'),
    ('sim_sessions', 'legado'), ('sim_sessions', 'legado_snapshot'), ('sim_sessions', 'mercado'),
    ('sim_sessions', 'creada_por_rpc'),
    ('sim_trades', 'evento_id'), ('sim_trades', 'motor_version'),
    ('sim_trades', 'bruto_µ'), ('sim_trades', 'neto_µ'), ('sim_trades', 'comision_µ'),
    ('sim_trades', 'spread_µ'), ('sim_trades', 'swap_µ'),
    ('sim_trades', 'bruto_micro'), ('sim_trades', 'neto_micro'), ('sim_trades', 'comision_micro'),
    ('sim_trades', 'spread_micro'), ('sim_trades', 'swap_micro'),
    ('sim_trades', 'conversion'), ('sim_trades', 'ambigua'), ('sim_trades', 'causa_ambiguedad'),
    ('profiles', 'siguiente_avance_desde'))
, conocidas(relname) as (values ('sim_sessions'), ('sim_trades'), ('sim_drawing_templates'))
select seccion, objeto, detalle from (
  -- 1 · nombres de objeto, en cualquier esquema
  select 1 o, 'nombre' seccion, obj.nombre::text objeto,
         coalesce((select string_agg(x, ' · ' order by x) from (
             select n.nspname || '.' || c.relname || ' (' || case c.relkind when 'r' then 'tabla' when 'v' then 'vista'
                    when 'm' then 'vista materializada' when 'i' then 'indice' when 'S' then 'secuencia'
                    when 'p' then 'tabla particionada' when 'f' then 'tabla externa' else c.relkind::text end || ')' x
               from pg_class c join pg_namespace n on n.oid = c.relnamespace where c.relname = obj.nombre
             union all
             select p.oid::regprocedure::text || ' (' || case p.prokind when 'f' then 'funcion' when 'p' then 'procedimiento'
                    when 'a' then 'agregado' else 'ventana' end || ')'
               from pg_proc p where p.proname = obj.nombre
             union all
             select n.nspname || '.' || t.typname || ' (tipo)'
               from pg_type t join pg_namespace n on n.oid = t.typnamespace
              where t.typname = obj.nombre and t.typtype <> 'c'
           ) s), 'LIBRE') detalle, 0 n
    from obj
  union all
  -- 2 · columnas nuevas
  select 2, 'columna', col.tabla || '.' || col.columna,
         case when to_regclass('public.' || quote_ident(col.tabla)) is null then 'NO EXISTE la tabla public.' || col.tabla
              else coalesce((select 'OCUPADA · ' || format_type(a.atttypid, a.atttypmod)
                               from pg_attribute a
                              where a.attrelid = to_regclass('public.' || quote_ident(col.tabla))
                                and a.attname = col.columna and a.attnum > 0 and not a.attisdropped), 'LIBRE') end, 0
    from col
  union all
  -- 3 · todo lo que ya existe en public con prefijo sim_
  select 3, 'prefijo', c.relname::text,
         case c.relkind when 'r' then 'tabla' when 'v' then 'vista' when 'm' then 'vista materializada' when 'i' then 'indice'
              when 'S' then 'secuencia' when 'p' then 'tabla particionada' else c.relkind::text end
         || case when c.relkind = 'i' then ' de ' || (select t.relname from pg_index i join pg_class t on t.oid = i.indrelid where i.indexrelid = c.oid) else '' end
         || case when c.relname in (select relname from conocidas) then ' · conocida' else '' end, 0
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname like 'sim\_%'
  union all
  select 3, 'prefijo', p.oid::regprocedure::text, 'funcion · dueño=' || pg_get_userbyid(p.proowner), 0
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname like 'sim\_%'
  union all
  select 3, 'prefijo', t.typname::text, 'tipo', 0
    from pg_type t join pg_namespace n on n.oid = t.typnamespace
   where n.nspname = 'public' and t.typname like 'sim\_%' and t.typtype <> 'c' and t.typelem = 0
  union all
  select 3, 'prefijo', r.conname::text, 'restriccion de ' || r.conrelid::regclass::text || ' · ' || r.contype::text, 0
    from pg_constraint r join pg_namespace n on n.oid = r.connamespace
   where n.nspname = 'public' and r.conname like 'sim\_%'
  union all
  select 3, 'prefijo', pol.policyname::text, 'politica de ' || pol.schemaname || '.' || pol.tablename || ' · ' || pol.cmd, 0
    from pg_policies pol where pol.schemaname = 'public' and pol.policyname like 'sim\_%'
  union all
  select 3, 'prefijo', tg.tgname::text, 'trigger de ' || tg.tgrelid::regclass::text, 0
    from pg_trigger tg join pg_class c on c.oid = tg.tgrelid join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and not tg.tgisinternal and tg.tgname like 'sim\_%'
  union all
  -- 4 · pgcrypto
  select 4, 'extension', 'pgcrypto',
         coalesce((select 'instalada · esquema=' || n.nspname || ' · version=' || e.extversion
                     from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname = 'pgcrypto'),
                  'NO instalada'), 0
  union all
  select 9, 'FIN', 's05', 'consulta', 0
) x order by o, objeto, n;
