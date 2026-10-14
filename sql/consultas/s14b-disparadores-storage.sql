-- ============================================================================
-- CONSULTA DE SOLO LECTURA · S14b · los disparadores de storage.objects por
-- dentro (etapa 2; CTO 14-oct, tras la s14 de produccion que dio «PARAR»)
--
-- La s14 del 14-oct encontro dos disparadores en storage.objects:
--   protect_objects_delete      BEFORE DELETE, por sentencia, storage.protect_delete (md5 998d324ea2b1)
--   update_objects_updated_at   BEFORE UPDATE, por fila, storage.update_updated_at_column (md5 7596e66a7698)
-- El CTO tiene que acreditarlos (E2R3-03) antes de mercado-000 y mercado-001.
-- Esta consulta enseña lo que hace falta para decidir: el cuerpo entero de
-- las dos funciones, su lenguaje, SECURITY DEFINER, dueño, search_path
-- (proconfig) y md5 (el mismo calculo que s14: los 12 primeros hex de
-- md5(prosrc)); la definicion de cada disparador de storage.objects (y, aparte,
-- de storage.buckets, donde mercado-001 inserta el bucket) con su estado
-- (tgenabled); los ajustes que leen las funciones (current_setting('x', true)
-- de cada nombre que aparece en el cuerpo, SIN cambiarlo); los ajustes
-- storage.* fijados por base o por rol (pg_db_role_setting); el
-- session_replication_role de la sesion; y los privilegios de anon y
-- authenticated sobre storage.objects (si les falta DELETE, el error llega
-- antes que el disparador).
--
-- NO cambia nada: UNA sola SELECT, sin escrituras ni EXECUTE ni set_config.
-- Ensayada dentro de una transaccion READ ONLY (pruebas/s14b-disparadores.mjs).
-- Sin datos de filas: solo catalogo (codigo de Supabase y ajustes). Se pega
-- como postgres en el editor SQL de Supabase. Acaba en «FIN | s14b | consulta».
-- ============================================================================
select seccion, objeto, detalle from (
  -- 1 las dos funciones: ficha
  select 1 o, f.proname::text k, 0 s, 'funcion' seccion, n.nspname || '.' || f.proname objeto,
         'existe · ' || l.lanname || case when f.prosecdef then ' · SECURITY DEFINER' else ' · SECURITY INVOKER' end
         || ' · dueño=' || pg_catalog.pg_get_userbyid(f.proowner)
         || ' · proconfig=' || coalesce(pg_catalog.array_to_string(f.proconfig, ', '), '-')
         || ' · volatilidad=' || f.provolatile::text
         || ' · md5 del cuerpo ' || pg_catalog.left(pg_catalog.md5(coalesce(f.prosrc, '')), 12)
         || ' (completo ' || pg_catalog.md5(coalesce(f.prosrc, '')) || ')'
         || ' · lineas=' || (select count(*) from pg_catalog.regexp_split_to_table(coalesce(f.prosrc, ''), E'\n')) detalle
    from pg_catalog.pg_proc f join pg_catalog.pg_namespace n on n.oid = f.pronamespace join pg_catalog.pg_language l on l.oid = f.prolang
   where n.nspname = 'storage' and f.proname in ('protect_delete', 'update_updated_at_column')
  union all
  select 1, x.proname, 0, 'funcion', 'storage.' || x.proname, 'NO EXISTE'
    from (values ('protect_delete'), ('update_updated_at_column')) x(proname)
   where not exists (select 1 from pg_catalog.pg_proc f join pg_catalog.pg_namespace n on n.oid = f.pronamespace
                      where n.nspname = 'storage' and f.proname = x.proname)
  union all
  select 1, x.proname, 0, 'funcion', 'storage.' || x.proname, 'HAY ' || count(*) || ' funciones con ese nombre en storage (sobrecargas): se enseñan todas'
    from pg_catalog.pg_proc f join pg_catalog.pg_namespace n on n.oid = f.pronamespace
         join (values ('protect_delete'), ('update_updated_at_column')) x(proname) on x.proname = f.proname
   where n.nspname = 'storage' group by x.proname having count(*) > 1
  union all
  -- 1 el cuerpo, linea a linea (numerada)
  select 1, f.proname, c.i::int, 'cuerpo', 'storage.' || f.proname || ' ' || pg_catalog.lpad(c.i::text, 3, '0'), c.linea
    from pg_catalog.pg_proc f join pg_catalog.pg_namespace n on n.oid = f.pronamespace,
         pg_catalog.regexp_split_to_table(coalesce(f.prosrc, ''), E'\n') with ordinality c(linea, i)
   where n.nspname = 'storage' and f.proname in ('protect_delete', 'update_updated_at_column')
  union all
  -- 2 los disparadores de storage.objects y de storage.buckets: definicion y estado
  select 2, r.relname || ' ' || t.tgname, 0, 'disparador', r.relname || '.' || t.tgname,
         pg_catalog.pg_get_triggerdef(t.oid)
         || ' · tgenabled=' || t.tgenabled::text
         || case t.tgenabled when 'O' then ' (se dispara: origin/local)' when 'D' then ' (DESACTIVADO)' when 'R' then ' (solo en replica)' when 'A' then ' (SIEMPRE)' else '' end
    from pg_catalog.pg_trigger t join pg_catalog.pg_class r on r.oid = t.tgrelid join pg_catalog.pg_namespace rn on rn.oid = r.relnamespace
   where rn.nspname = 'storage' and r.relname in ('objects', 'buckets') and not t.tgisinternal
  union all
  select 2, r.relname || ' ~', 1, 'disparador', r.relname || '.(funcion)',
         t.tgname || ' → ' || fn.nspname || '.' || f.proname || ' · ' || l.lanname || case when f.prosecdef then ' · SECURITY DEFINER' else '' end
         || ' · md5 del cuerpo ' || pg_catalog.left(pg_catalog.md5(coalesce(f.prosrc, '')), 12)
    from pg_catalog.pg_trigger t join pg_catalog.pg_class r on r.oid = t.tgrelid join pg_catalog.pg_namespace rn on rn.oid = r.relnamespace
         join pg_catalog.pg_proc f on f.oid = t.tgfoid join pg_catalog.pg_namespace fn on fn.oid = f.pronamespace join pg_catalog.pg_language l on l.oid = f.prolang
   where rn.nspname = 'storage' and r.relname = 'buckets' and not t.tgisinternal
  union all
  select 2, '~', 0, 'disparador', '(resumen)',
         'storage.objects: ' || count(*) filter (where r.relname = 'objects') || ' · storage.buckets: ' || count(*) filter (where r.relname = 'buckets')
    from pg_catalog.pg_trigger t join pg_catalog.pg_class r on r.oid = t.tgrelid join pg_catalog.pg_namespace rn on rn.oid = r.relnamespace
   where rn.nspname = 'storage' and r.relname in ('objects', 'buckets') and not t.tgisinternal
  union all
  -- 3 los ajustes que leen las dos funciones: su valor en ESTA sesion, sin cambiarlo
  select 3, a.nombre, 0, 'ajuste', a.nombre,
         'lo lee ' || a.funciones || ' · current_setting en esta sesion = '
         || coalesce('«' || pg_catalog.current_setting(a.nombre, true) || '»', '(sin valor: NULL)')
    from (select m.nombre, pg_catalog.string_agg(distinct 'storage.' || f.proname, ', ') funciones
            from pg_catalog.pg_proc f join pg_catalog.pg_namespace n on n.oid = f.pronamespace,
                 pg_catalog.regexp_matches(coalesce(f.prosrc, ''), $r$current_setting\s*\(\s*'([A-Za-z0-9_.]+)'$r$, 'g') g(v),
                 lateral (select g.v[1] nombre) m
           where n.nspname = 'storage' and f.proname in ('protect_delete', 'update_updated_at_column')
           group by m.nombre) a
  union all
  select 3, '~', 0, 'ajuste', '(resumen)',
         case when exists (select 1 from pg_catalog.pg_proc f join pg_catalog.pg_namespace n on n.oid = f.pronamespace
                            where n.nspname = 'storage' and f.proname in ('protect_delete', 'update_updated_at_column')
                              and f.prosrc ~ 'current_setting')
              then 'las funciones leen ajustes: arriba, cada uno'
              else 'ninguna de las dos funciones lee current_setting' end
  union all
  -- 3 ajustes storage.* fijados por base o por rol (no los cambia)
  select 3, 'zz ' || coalesce(d.datname, '') || coalesce(ro.rolname, ''), 1, 'ajuste fijado',
         'base=' || coalesce(d.datname, '(todas)') || ' · rol=' || coalesce(ro.rolname, '(todos)'), c.cfg
    from pg_catalog.pg_db_role_setting s
         left join pg_catalog.pg_database d on d.oid = s.setdatabase
         left join pg_catalog.pg_roles ro on ro.oid = s.setrole,
         pg_catalog.unnest(s.setconfig) c(cfg)
   where c.cfg like 'storage.%'
  union all
  select 3, 'zz', 2, 'ajuste fijado', '(resumen)', 'ningun ajuste storage.* fijado por base o por rol'
   where not exists (select 1 from pg_catalog.pg_db_role_setting s, pg_catalog.unnest(s.setconfig) c(cfg) where c.cfg like 'storage.%')
  union all
  select 3, 'zzz', 0, 'ajuste', 'session_replication_role', pg_catalog.current_setting('session_replication_role')
  union all
  -- 4 privilegios de anon y authenticated sobre storage.objects (con herencia)
  select 4, r.rol, 0, 'privilegios', r.rol || ' en storage.objects',
         coalesce(nullif(pg_catalog.concat_ws(',',
           case when pg_catalog.has_table_privilege(r.rol, 'storage.objects', 'SELECT') then 'SELECT' end,
           case when pg_catalog.has_table_privilege(r.rol, 'storage.objects', 'INSERT') then 'INSERT' end,
           case when pg_catalog.has_table_privilege(r.rol, 'storage.objects', 'UPDATE') then 'UPDATE' end,
           case when pg_catalog.has_table_privilege(r.rol, 'storage.objects', 'DELETE') then 'DELETE' end), ''), '-')
         || ' · USAGE en storage=' || case when pg_catalog.has_schema_privilege(r.rol, 'storage', 'USAGE') then 'si' else 'no' end
         || ' · EXECUTE de storage.protect_delete=' || coalesce((select string_agg(case when pg_catalog.has_function_privilege(r.rol, f.oid, 'EXECUTE') then 'si' else 'no' end, ',')
                                                                    from pg_catalog.pg_proc f join pg_catalog.pg_namespace n on n.oid = f.pronamespace
                                                                   where n.nspname = 'storage' and f.proname = 'protect_delete'), '-')
    from (values ('anon'), ('authenticated')) r(rol)
   where pg_catalog.to_regrole(r.rol) is not null and pg_catalog.to_regclass('storage.objects') is not null
  union all
  select 5, '', 0, 'FIN', 's14b', 'consulta'
) x order by o, k collate "C", s, objeto collate "C", detalle;
