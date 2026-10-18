-- ============================================================================
-- CONSULTA DE SOLO LECTURA · S14c · las funciones de los disparadores de
-- storage.buckets por dentro (etapa 2; CTO 14-oct, tras la s14b)
--
-- La s14b del 14-oct enseño cinco disparadores en storage.buckets, donde
-- mercado-001 inserta el bucket «mercado». El CTO no los ha acreditado aun:
--   enforce_bucket_name_length_trigger   → storage.enforce_bucket_name_length (md5 bd3d77a2603f)
--   protect_bucket_control_insert        → storage.protect_bucket_control_columns('service_role') (787041545267)
--   protect_bucket_control_update        → storage.protect_bucket_control_columns() (787041545267)
--   protect_bucket_control_update_role   → storage.enforce_bucket_lifecycle_service_role('service_role') (7691066f4111)
--   protect_buckets_delete               → storage.protect_delete (998d324ea2b1, acreditada)
-- Esta consulta enseña, de CADA funcion que dispara un disparador de
-- storage.buckets (y de las tres de arriba por su nombre, existan o no): el
-- cuerpo entero linea a linea, lenguaje, SECURITY DEFINER o INVOKER, dueño,
-- proconfig, argumentos y md5 (el mismo calculo que s14 y s14b: los 12
-- primeros hex de md5(prosrc), y el completo); los ajustes que leen
-- (current_setting('x', true) de cada nombre que aparece en el cuerpo, SIN
-- cambiarlo); y las columnas de storage.buckets que nombran los disparadores.
--
-- NO cambia nada: UNA sola SELECT, sin escrituras ni EXECUTE ni set_config.
-- Ensayada dentro de una transaccion READ ONLY (pruebas/s14c-disparadores-
-- buckets.mjs). Sin datos de filas: solo catalogo (codigo de Supabase). Se
-- pega como postgres en el editor SQL de Supabase. Acaba en
-- «FIN | s14c | consulta».
-- ============================================================================
with fn as (
  -- las funciones que disparan los disparadores de storage.buckets, y las tres por su nombre
  select distinct f.oid, n.nspname, f.proname
    from pg_catalog.pg_proc f join pg_catalog.pg_namespace n on n.oid = f.pronamespace
   where f.oid in (select t.tgfoid from pg_catalog.pg_trigger t where t.tgrelid = pg_catalog.to_regclass('storage.buckets') and not t.tgisinternal)
      or (n.nspname = 'storage' and f.proname in ('enforce_bucket_name_length', 'protect_bucket_control_columns', 'enforce_bucket_lifecycle_service_role'))
)
select seccion, objeto, detalle from (
  -- 1 ficha de cada funcion
  select 1 o, x.proname::text || ' ' || x.oid::text k, 0 s, 'funcion' seccion, x.nspname || '.' || x.proname || '(' || pg_catalog.pg_get_function_identity_arguments(f.oid) || ')' objeto,
         'existe · ' || l.lanname || case when f.prosecdef then ' · SECURITY DEFINER' else ' · SECURITY INVOKER' end
         || ' · dueño=' || pg_catalog.pg_get_userbyid(f.proowner)
         || ' · proconfig=' || coalesce(pg_catalog.array_to_string(f.proconfig, ', '), '-')
         || ' · devuelve=' || pg_catalog.format_type(f.prorettype, null)
         || ' · volatilidad=' || f.provolatile::text
         || ' · md5 del cuerpo ' || pg_catalog.left(pg_catalog.md5(coalesce(f.prosrc, '')), 12)
         || ' (completo ' || pg_catalog.md5(coalesce(f.prosrc, '')) || ')'
         || ' · lineas=' || (select count(*) from pg_catalog.regexp_split_to_table(coalesce(f.prosrc, ''), E'\n'))
         || ' · la usan: ' || coalesce((select pg_catalog.string_agg(r.relname || '.' || t.tgname, ', ' order by r.relname, t.tgname)
                                          from pg_catalog.pg_trigger t join pg_catalog.pg_class r on r.oid = t.tgrelid
                                         where t.tgfoid = f.oid and not t.tgisinternal), '(ningun disparador)') detalle
    from fn x join pg_catalog.pg_proc f on f.oid = x.oid join pg_catalog.pg_language l on l.oid = f.prolang
  union all
  select 1, y.proname || ' ', 0, 'funcion', 'storage.' || y.proname, 'NO EXISTE'
    from (values ('enforce_bucket_name_length'), ('protect_bucket_control_columns'), ('enforce_bucket_lifecycle_service_role')) y(proname)
   where not exists (select 1 from fn where fn.nspname = 'storage' and fn.proname = y.proname)
  union all
  -- 1 el cuerpo, linea a linea (numerada)
  select 1, x.proname || ' ' || x.oid::text, c.i::int, 'cuerpo', x.nspname || '.' || x.proname || ' ' || pg_catalog.lpad(c.i::text, 3, '0'), c.linea
    from fn x join pg_catalog.pg_proc f on f.oid = x.oid,
         pg_catalog.regexp_split_to_table(coalesce(f.prosrc, ''), E'\n') with ordinality c(linea, i)
  union all
  -- 2 los ajustes que leen: su valor en ESTA sesion, sin cambiarlo
  select 2, a.nombre, 0, 'ajuste', a.nombre,
         'lo lee ' || a.funciones || ' · current_setting en esta sesion = '
         || coalesce('«' || pg_catalog.current_setting(a.nombre, true) || '»', '(sin valor: NULL)')
    from (select m.v[1] nombre, pg_catalog.string_agg(distinct x.nspname || '.' || x.proname, ', ') funciones
            from fn x join pg_catalog.pg_proc f on f.oid = x.oid,
                 pg_catalog.regexp_matches(coalesce(f.prosrc, ''), $r$current_setting\s*\(\s*'([A-Za-z0-9_.]+)'$r$, 'g') m(v)
           group by m.v[1]) a
  union all
  select 2, '~', 0, 'ajuste', '(resumen)',
         case when exists (select 1 from fn x join pg_catalog.pg_proc f on f.oid = x.oid where f.prosrc ~ 'current_setting')
              then 'las funciones leen ajustes: arriba, cada uno'
              else 'ninguna de estas funciones lee current_setting' end
  union all
  -- 3 las columnas de storage.buckets (nombre y tipo), para leer los cuerpos
  select 3, '', a.attnum::int, 'columna', 'storage.buckets.' || a.attname, pg_catalog.format_type(a.atttypid, a.atttypmod) || case when a.attnotnull then ' not null' else '' end
    from pg_catalog.pg_attribute a
   where a.attrelid = pg_catalog.to_regclass('storage.buckets') and a.attnum > 0 and not a.attisdropped
  union all
  select 4, '', 0, 'FIN', 's14c', 'consulta'
) x order by o, k collate "C", s, objeto collate "C", detalle;
