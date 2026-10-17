-- ============================================================================
-- CONSULTA DE SOLO LECTURA · S16e · el inventario de las 14 tablas SIN normalizar, medido con los dos
-- search_path (etapa 3, ronda 3; CTO 17-oct, orden 1-008; revisor interno de ce8b315: RINV3-01)
--
-- Hasta ce8b315, sim-004b y la s16 quitaban «public.» de los textos con regexp_replace, tambien de dentro
-- de los literales (RINV3-01). Ahora comparan los textos TAL CUAL, y el texto depende del search_path:
-- sim-004b lo mide con el vacio y la s16 con el del editor. Esta consulta mide en produccion el bloque
-- «inventario» (el mismo texto que sim-004b y la s16) con los dos: primero con el del editor y despues
-- con el vacio (fija los dos solo en su transaccion y dice el de partida). Trae, por familia, el recuento y el md5 de cada uno, y las fichas de las tres funciones
-- ajenas. Con su salida, el CTO acredita los valores esperados de sim-004b y de la s16.
--
-- NO cambia nada. Es un bloque DO (el editor de Supabase no deja cambiar el search_path y despues medir
-- en una sola SELECT): no escribe, no hace EXECUTE dinamico y solo cambia el search_path DENTRO de su
-- transaccion (set_config local), que ademas se deshace al acabar con error. Solo catalogo: ningun dato
-- de alumnos ni de filas. Ensayada en READ ONLY (pruebas/s16e-inventario-sin-normalizar.mjs).
-- Ramon la pega como postgres en el editor SQL de Supabase cuando el CTO la pida. El resultado sale como
-- un ERROR (asi lo ensena el editor): es el informe, no un fallo. Acaba en «FIN | s16e | consulta».
-- ============================================================================
do $s16e$
declare
  v_sp text := pg_catalog.current_setting('search_path');
  v_esq text;
  v_ed text;
  v_vacio text;
begin
  -- 1 con el search_path del editor, fijado aqui (solo en esta transaccion): asi mide sus md5 aunque el de partida sea
  -- otro (RINV4-02); el de partida sale en la fila «search_path»
  perform pg_catalog.set_config('search_path', '"$user", public, extensions', true);
  v_esq := pg_catalog.current_schemas(false)::text;
  select string_agg('s16e | ' || v_esq || ' | ' || i.familia || ' | ' || i.objeto || ' | ' || i.detalle, E'\n' order by i.familia, i.objeto)
    into v_ed
    from (
      -- >>> inventario (identico en sql/sim-004b-contrato-v1.sql y sql/consultas/s16-catalogo-sim004b.sql)
      -- R3E3B-01 (revisor interno; CTO 17-oct): el inventario EXACTO de las 14 tablas fuera de pg_proc, por familias,
      -- con los textos TAL CUAL los da el catalogo (RINV3-01, CTO 17-oct: sin quitar ningun prefijo): la tabla (relkind, persistencia, particion, hijas,
      -- padres, particionada), cada columna (tipo, NOT NULL, identity, generated, colacion, valor por defecto), cada
      -- restriccion (tipo y definicion, validada, diferible), cada indice (pg_get_indexdef), cada regla, y las politicas
      -- de las 3 no protegidas (las de las 11 protegidas ya son exactas aparte). Las dos restricciones que cambia
      -- sim-004b van por nombre: su definicion la acredita su estado. Los disparadores ya tienen inventario exacto aparte
      -- Por familia se compara el recuento y el md5 del conjunto ordenado con lo medido en produccion (s16e, 17-oct;
      -- sql/consultas/salidas/), uno por search_path: el vacio (sim-004b) y el del editor (la s16), por sus esquemas
      -- efectivos (current_schemas); con otro, la fila «search_path» no coincide. Las tres funciones ajenas, ficha a ficha
      -- (una lista fija: no puede haber otras). Si algo no coincide, se mide fila a fila con una consulta aparte
      select v.familia, v.objeto, v.detalle, v.bien from (
        with inv as (
          select x.familia, x.fila from (
            select 'tabla'::text familia, r.t || '|' ||
                   case when c.oid is null then 'NO EXISTE'
                        else 'relkind=' || c.relkind::text || ' · persistencia=' || c.relpersistence::text || ' · particion=' || c.relispartition::text
                             || ' · hijas=' || (select count(*) from pg_catalog.pg_inherits i where i.inhparent = c.oid)
                             || ' · padres=' || coalesce((select string_agg(i.inhparent::regclass::text, ',' order by i.inhseqno) from pg_catalog.pg_inherits i where i.inhrelid = c.oid), '-')
                             || ' · particionada=' || exists (select 1 from pg_catalog.pg_partitioned_table p where p.partrelid = c.oid)::text
                             -- RINV-01: el dueño («ejecutor» si es quien ejecuta); RINV-04: la RLS de las 3 no protegidas
                             || ' · dueño=' || case when c.relowner = (select x.oid from pg_catalog.pg_roles x where x.rolname = current_user) then 'ejecutor' else pg_catalog.pg_get_userbyid(c.relowner)::text end
                             || case when r.t in ('sim_drawing_templates', 'user_chart_config', 'user_tool_config')
                                     then ' · rls=' || c.relrowsecurity::text || ' · forzada=' || c.relforcerowsecurity::text else '' end end fila
              from (values ('sim_alumnos'), ('sim_arrendamientos'), ('sim_recibos'), ('sim_eventos'), ('sim_escrituras_v0'), ('sim_escrituras_v0_marcas'), ('sim_servicio'),
                           ('sim_sessions'), ('sim_trades'), ('session_drawings'), ('session_chart_config'), ('sim_drawing_templates'), ('user_chart_config'), ('user_tool_config')) r(t)
                   left join pg_catalog.pg_class c on c.oid = pg_catalog.to_regclass('public.' || r.t)
            union all
            select 'columna', c.relname || '.' || a.attname || '|' ||
                   -- RINV-02: el tipo con su esquema, sin quitarlo (un dominio public.text no pasa por text)
                   'tipo=' || pg_catalog.format_type(a.atttypid, a.atttypmod) || ' · tipo_esquema=' || tn.nspname::text
                   || ' · notnull=' || a.attnotnull::text
                   || ' · identity=' || coalesce(nullif(a.attidentity::text, ''), '-')
                   || ' · generated=' || coalesce(nullif(a.attgenerated::text, ''), '-')
                   -- RINV2-02: «por defecto» solo la predeterminada (oid 100); cualquier otra, con esquema, proveedor, determinista y locale
                   || ' · colacion=' || case when a.attcollation = 0 then '-' when a.attcollation = 100 then 'por defecto'
                                             else coalesce((select pg_catalog.concat(cn.nspname, '.', co.collname, ' · proveedor=', co.collprovider::text, ' · determinista=', co.collisdeterministic::text,
                                                                                     ' · locale=', coalesce(co.collcollate, co.colllocale, '-'))
                                                              from pg_catalog.pg_collation co join pg_catalog.pg_namespace cn on cn.oid = co.collnamespace where co.oid = a.attcollation), 'NO EXISTE') end
                   || ' · defecto=' || coalesce(pg_catalog.pg_get_expr(d.adbin, d.adrelid), '-')
              from pg_catalog.pg_class c join pg_catalog.pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
                   join pg_catalog.pg_type ty on ty.oid = a.atttypid join pg_catalog.pg_namespace tn on tn.oid = ty.typnamespace
                   left join pg_catalog.pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
             where c.relnamespace = 'public'::regnamespace and c.relname in ('sim_alumnos', 'sim_arrendamientos', 'sim_recibos', 'sim_eventos', 'sim_escrituras_v0', 'sim_escrituras_v0_marcas', 'sim_servicio',
                           'sim_sessions', 'sim_trades', 'session_drawings', 'session_chart_config', 'sim_drawing_templates', 'user_chart_config', 'user_tool_config') and c.relkind = 'r'
            union all
            select 'restriccion', c.relname || '.' || k.conname || '|' ||
                   case when (c.relname, k.conname) in (('sim_sessions', 'sim_sessions_terminal_valida'), ('sim_eventos', 'sim_eventos_tipo_check'))
                        then k.contype::text || ' · (la de sim-004b, segun su estado)'
                        else k.contype::text || ' · ' || pg_catalog.pg_get_constraintdef(k.oid)
                             || ' · validada=' || k.convalidated::text || ' · diferible=' || k.condeferrable::text || '/' || k.condeferred::text end
              from pg_catalog.pg_class c join pg_catalog.pg_constraint k on k.conrelid = c.oid
             where c.relnamespace = 'public'::regnamespace and c.relname in ('sim_alumnos', 'sim_arrendamientos', 'sim_recibos', 'sim_eventos', 'sim_escrituras_v0', 'sim_escrituras_v0_marcas', 'sim_servicio',
                           'sim_sessions', 'sim_trades', 'session_drawings', 'session_chart_config', 'sim_drawing_templates', 'user_chart_config', 'user_tool_config')
            union all
            select 'indice', c.relname || '.' || ic.relname || '|' || pg_catalog.pg_get_indexdef(x.indexrelid)
              from pg_catalog.pg_class c join pg_catalog.pg_index x on x.indrelid = c.oid join pg_catalog.pg_class ic on ic.oid = x.indexrelid
             where c.relnamespace = 'public'::regnamespace and c.relname in ('sim_alumnos', 'sim_arrendamientos', 'sim_recibos', 'sim_eventos', 'sim_escrituras_v0', 'sim_escrituras_v0_marcas', 'sim_servicio',
                           'sim_sessions', 'sim_trades', 'session_drawings', 'session_chart_config', 'sim_drawing_templates', 'user_chart_config', 'user_tool_config')
            union all
            -- RINV-03: cada secuencia identity, con todos sus parametros y su dueño
            select 'identidad', c.relname || '.' || a.attname || '|' ||
                   'tipo=' || pg_catalog.format_type(s.seqtypid, null) || ' · inicio=' || s.seqstart || ' · incremento=' || s.seqincrement
                   || ' · minimo=' || s.seqmin || ' · maximo=' || s.seqmax || ' · cache=' || s.seqcache || ' · ciclo=' || s.seqcycle::text
                   || ' · dueño=' || case when sc.relowner = (select x.oid from pg_catalog.pg_roles x where x.rolname = current_user) then 'ejecutor' else pg_catalog.pg_get_userbyid(sc.relowner)::text end
              from pg_catalog.pg_class c join pg_catalog.pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped and a.attidentity <> ''
                   join pg_catalog.pg_depend dp on dp.refobjid = c.oid and dp.refobjsubid = a.attnum and dp.classid = 'pg_catalog.pg_class'::regclass and dp.deptype = 'i'
                   join pg_catalog.pg_class sc on sc.oid = dp.objid and sc.relkind = 'S'
                   join pg_catalog.pg_sequence s on s.seqrelid = sc.oid
             where c.relnamespace = 'public'::regnamespace and c.relname in ('sim_alumnos', 'sim_arrendamientos', 'sim_recibos', 'sim_eventos', 'sim_escrituras_v0', 'sim_escrituras_v0_marcas', 'sim_servicio',
                           'sim_sessions', 'sim_trades', 'session_drawings', 'session_chart_config', 'sim_drawing_templates', 'user_chart_config', 'user_tool_config')
            union all
            -- RINV2-01 y RINV2-04: de que dependen, FUERA de pg_catalog, los valores por defecto, las restricciones y los indices
            -- (por pg_depend: no depende del texto ni del search_path; un public.now() o un public.length() salen aqui). La s16d
            select 'ajeno', o.nombre || '|' || pg_catalog.pg_describe_object(dp.refclassid, dp.refobjid, 0)
              from (select 'pg_catalog.pg_attrdef'::regclass clase, d.oid, c.relname || '.' || a.attname || ' (defecto)' nombre
                      from pg_catalog.pg_class c join pg_catalog.pg_attrdef d on d.adrelid = c.oid join pg_catalog.pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
                     where c.relnamespace = 'public'::regnamespace and c.relname in ('sim_alumnos', 'sim_arrendamientos', 'sim_recibos', 'sim_eventos', 'sim_escrituras_v0', 'sim_escrituras_v0_marcas', 'sim_servicio',
                           'sim_sessions', 'sim_trades', 'session_drawings', 'session_chart_config', 'sim_drawing_templates', 'user_chart_config', 'user_tool_config')
                    union all
                    select 'pg_catalog.pg_constraint'::regclass, k.oid, c.relname || '.' || k.conname || ' (restriccion)'
                      from pg_catalog.pg_class c join pg_catalog.pg_constraint k on k.conrelid = c.oid
                     where c.relnamespace = 'public'::regnamespace and c.relname in ('sim_alumnos', 'sim_arrendamientos', 'sim_recibos', 'sim_eventos', 'sim_escrituras_v0', 'sim_escrituras_v0_marcas', 'sim_servicio',
                           'sim_sessions', 'sim_trades', 'session_drawings', 'session_chart_config', 'sim_drawing_templates', 'user_chart_config', 'user_tool_config')
                    union all
                    select 'pg_catalog.pg_class'::regclass, x.indexrelid, c.relname || '.' || ic.relname || ' (indice)'
                      from pg_catalog.pg_class c join pg_catalog.pg_index x on x.indrelid = c.oid join pg_catalog.pg_class ic on ic.oid = x.indexrelid
                     where c.relnamespace = 'public'::regnamespace and c.relname in ('sim_alumnos', 'sim_arrendamientos', 'sim_recibos', 'sim_eventos', 'sim_escrituras_v0', 'sim_escrituras_v0_marcas', 'sim_servicio',
                           'sim_sessions', 'sim_trades', 'session_drawings', 'session_chart_config', 'sim_drawing_templates', 'user_chart_config', 'user_tool_config')) o
                   join pg_catalog.pg_depend dp on dp.classid = o.clase and dp.objid = o.oid
             where (dp.refclassid = 'pg_catalog.pg_proc'::regclass and (select p.pronamespace from pg_catalog.pg_proc p where p.oid = dp.refobjid) <> 'pg_catalog'::regnamespace)
                or (dp.refclassid = 'pg_catalog.pg_operator'::regclass and (select p.oprnamespace from pg_catalog.pg_operator p where p.oid = dp.refobjid) <> 'pg_catalog'::regnamespace)
                or (dp.refclassid = 'pg_catalog.pg_type'::regclass and (select p.typnamespace from pg_catalog.pg_type p where p.oid = dp.refobjid) <> 'pg_catalog'::regnamespace)
                or (dp.refclassid = 'pg_catalog.pg_collation'::regclass and (select p.collnamespace from pg_catalog.pg_collation p where p.oid = dp.refobjid) <> 'pg_catalog'::regnamespace)
            union all
            select 'regla', c.relname || '.' || w.rulename || '|' || pg_catalog.pg_get_ruledef(w.oid)
              from pg_catalog.pg_class c join pg_catalog.pg_rewrite w on w.ev_class = c.oid
             where c.relnamespace = 'public'::regnamespace and c.relname in ('sim_alumnos', 'sim_arrendamientos', 'sim_recibos', 'sim_eventos', 'sim_escrituras_v0', 'sim_escrituras_v0_marcas', 'sim_servicio',
                           'sim_sessions', 'sim_trades', 'session_drawings', 'session_chart_config', 'sim_drawing_templates', 'user_chart_config', 'user_tool_config')
            union all
            select 'politica', p.tablename || '.' || p.policyname || '|' ||
                   p.permissive || ' · ' || p.cmd || ' · ' || p.roles::text || ' · using=' || coalesce(p.qual, '-')
                   || ' · check=' || coalesce(p.with_check, '-')
              from pg_catalog.pg_policies p where p.schemaname = 'public' and p.tablename in ('sim_drawing_templates', 'user_chart_config', 'user_tool_config')
            union all
            -- R3E3B-02 (CTO 17-oct): las tres funciones ajenas que llaman los cuerpos, con la ficha de la s16b
            select 'funcion_ajena', f.firma || '|' ||
                   case when p.oid is null then 'NO EXISTE' else
                     'functiondef md5=' || pg_catalog.md5(pg_catalog.pg_get_functiondef(p.oid))
                     || ' · prosrc md5=' || pg_catalog.md5(coalesce(p.prosrc, '')) || ' · probin=' || coalesce(p.probin, '-')
                     || ' · lenguaje=' || l.lanname || ' · dueño=' || pg_catalog.pg_get_userbyid(p.proowner)
                     || ' · prosecdef=' || p.prosecdef::text || ' · provolatile=' || p.provolatile::text || ' · proconfig=' || coalesce(p.proconfig::text, '-')
                     || ' · proisstrict=' || p.proisstrict::text || ' · proleakproof=' || p.proleakproof::text || ' · proparallel=' || p.proparallel::text
                     || ' · prokind=' || p.prokind::text || ' · proretset=' || p.proretset::text || ' · prorettype=' || pg_catalog.format_type(p.prorettype, null)
                     || ' · proargmodes=' || coalesce(p.proargmodes::text, '-') || ' · proargnames=' || coalesce(p.proargnames::text, '-')
                     || ' · pronargdefaults=' || p.pronargdefaults::text || ' · procost=' || p.procost::text || ' · prorows=' || p.prorows::text end
              from (values ('extensions.digest(bytea,text)'), ('extensions.gen_random_bytes(integer)'), ('auth.uid()')) f(firma)
                   left join pg_catalog.pg_proc p on p.oid = pg_catalog.to_regprocedure(f.firma) left join pg_catalog.pg_language l on l.oid = p.prolang
          ) x
        ),
        esp_f(esquemas, familia, n, h) as (values
          ('{}', 'ajeno', 0, 'd41d8cd98f00b204e9800998ecf8427e'),
          ('{}', 'columna', 135, '9610bdfa6bce4ff3b95a3d4fafd743b0'),
          ('{}', 'identidad', 4, '472c2271705ab4440fba7bbe0c61ed04'),
          ('{}', 'indice', 31, '6f248b06ad3aac95b276fc24a00ecb88'),
          ('{}', 'politica', 3, 'ae70c7a2dca8be8f6aa6c6eae4d9754f'),
          ('{}', 'regla', 0, 'd41d8cd98f00b204e9800998ecf8427e'),
          ('{}', 'restriccion', 59, '4f9d1a1af4e93723672d6bba7ae10829'),
          ('{}', 'tabla', 14, 'a9b56cc77c3da41b455e0250b489e0aa'),
          ('{public,extensions}', 'ajeno', 0, 'd41d8cd98f00b204e9800998ecf8427e'),
          ('{public,extensions}', 'columna', 135, '9610bdfa6bce4ff3b95a3d4fafd743b0'),
          ('{public,extensions}', 'identidad', 4, '472c2271705ab4440fba7bbe0c61ed04'),
          ('{public,extensions}', 'indice', 31, '6f248b06ad3aac95b276fc24a00ecb88'),
          ('{public,extensions}', 'politica', 3, 'ae70c7a2dca8be8f6aa6c6eae4d9754f'),
          ('{public,extensions}', 'regla', 0, 'd41d8cd98f00b204e9800998ecf8427e'),
          ('{public,extensions}', 'restriccion', 59, '8c1bcac993492ca83039e80ec6168d01'),
          ('{public,extensions}', 'tabla', 14, 'a9b56cc77c3da41b455e0250b489e0aa')),
        esp_a(firma, ficha) as (values
          ('auth.uid()', 'functiondef md5=ea3b41bf29e2ad573067939329aa088e · prosrc md5=cdef18c69c4f4cbbced2eaf81e628b49 · probin=- · lenguaje=sql · dueño=supabase_auth_admin · prosecdef=false · provolatile=s · proconfig=- · proisstrict=false · proleakproof=false · proparallel=u · prokind=f · proretset=false · prorettype=uuid · proargmodes=- · proargnames=- · pronargdefaults=0 · procost=100 · prorows=0'),
          ('extensions.digest(bytea,text)', 'functiondef md5=85b88685f74a398b1ff164ad33eeaaca · prosrc md5=926ba3fbdb45dc078b3e3cafddc392cc · probin=$libdir/pgcrypto · lenguaje=c · dueño=postgres · prosecdef=false · provolatile=i · proconfig=- · proisstrict=true · proleakproof=false · proparallel=s · prokind=f · proretset=false · prorettype=bytea · proargmodes=- · proargnames=- · pronargdefaults=0 · procost=1 · prorows=0'),
          ('extensions.gen_random_bytes(integer)', 'functiondef md5=a7569a34c9be929beb24ef5670d42636 · prosrc md5=393a992bef3cadec88b224bd3dace51c · probin=$libdir/pgcrypto · lenguaje=c · dueño=postgres · prosecdef=false · provolatile=v · proconfig=- · proisstrict=true · proleakproof=false · proparallel=s · prokind=f · proretset=false · prorettype=bytea · proargmodes=- · proargnames=- · pronargdefaults=0 · procost=1 · prorows=0')),
        med_f as (select i.familia, count(*)::integer n, pg_catalog.md5(string_agg(i.fila, E'\n' order by i.fila collate "C")) h from inv i where i.familia <> 'funcion_ajena' group by i.familia),
        med_a as (select split_part(i.fila, '|', 1) firma, substr(i.fila, strpos(i.fila, '|') + 1) ficha from inv i where i.familia = 'funcion_ajena')
        select 'inventario'::text familia, e.familia objeto,
               'n=' || coalesce(m.n, 0) || ' md5=' || coalesce(m.h, pg_catalog.md5(''))
               || case when coalesce(m.n, 0) = e.n and coalesce(m.h, pg_catalog.md5('')) = e.h then ''
                       else ' (sim-004b espera n=' || e.n || ' md5=' || e.h || ' con esquemas=' || e.esquemas || '; que fila: medirlo aparte)' end detalle,
               coalesce(m.n, 0) = e.n and coalesce(m.h, pg_catalog.md5('')) = e.h bien
          from esp_f e left join med_f m on m.familia = e.familia
         where e.esquemas = pg_catalog.current_schemas(false)::text
        union all
        select 'inventario', 'search_path', 'esquemas=' || pg_catalog.current_schemas(false)::text
               || ' (sin valores esperados: solo {} en sim-004b y {public,extensions}, el del editor, en la s16)', false
         where not exists (select 1 from esp_f e where e.esquemas = pg_catalog.current_schemas(false)::text)
        union all
        select 'funcion_ajena', coalesce(e.firma, m.firma),
               coalesce(m.ficha, 'NO EXISTE') || case when m.ficha is distinct from e.ficha then ' (sim-004b espera ' || e.ficha || ')' else '' end,
               m.ficha is not distinct from e.ficha
          from esp_a e left join med_a m on m.firma = e.firma
      ) v
      -- <<< inventario
    ) i;
  -- 2 con el search_path vacio (el de sim-004b), solo en esta transaccion
  perform pg_catalog.set_config('search_path', '', true);
  select string_agg('s16e | ' || pg_catalog.current_schemas(false)::text || ' | ' || i.familia || ' | ' || i.objeto || ' | ' || i.detalle, E'\n' order by i.familia, i.objeto)
    into v_vacio
    from (
      -- >>> inventario (identico en sql/sim-004b-contrato-v1.sql y sql/consultas/s16-catalogo-sim004b.sql)
      -- R3E3B-01 (revisor interno; CTO 17-oct): el inventario EXACTO de las 14 tablas fuera de pg_proc, por familias,
      -- con los textos TAL CUAL los da el catalogo (RINV3-01, CTO 17-oct: sin quitar ningun prefijo): la tabla (relkind, persistencia, particion, hijas,
      -- padres, particionada), cada columna (tipo, NOT NULL, identity, generated, colacion, valor por defecto), cada
      -- restriccion (tipo y definicion, validada, diferible), cada indice (pg_get_indexdef), cada regla, y las politicas
      -- de las 3 no protegidas (las de las 11 protegidas ya son exactas aparte). Las dos restricciones que cambia
      -- sim-004b van por nombre: su definicion la acredita su estado. Los disparadores ya tienen inventario exacto aparte
      -- Por familia se compara el recuento y el md5 del conjunto ordenado con lo medido en produccion (s16e, 17-oct;
      -- sql/consultas/salidas/), uno por search_path: el vacio (sim-004b) y el del editor (la s16), por sus esquemas
      -- efectivos (current_schemas); con otro, la fila «search_path» no coincide. Las tres funciones ajenas, ficha a ficha
      -- (una lista fija: no puede haber otras). Si algo no coincide, se mide fila a fila con una consulta aparte
      select v.familia, v.objeto, v.detalle, v.bien from (
        with inv as (
          select x.familia, x.fila from (
            select 'tabla'::text familia, r.t || '|' ||
                   case when c.oid is null then 'NO EXISTE'
                        else 'relkind=' || c.relkind::text || ' · persistencia=' || c.relpersistence::text || ' · particion=' || c.relispartition::text
                             || ' · hijas=' || (select count(*) from pg_catalog.pg_inherits i where i.inhparent = c.oid)
                             || ' · padres=' || coalesce((select string_agg(i.inhparent::regclass::text, ',' order by i.inhseqno) from pg_catalog.pg_inherits i where i.inhrelid = c.oid), '-')
                             || ' · particionada=' || exists (select 1 from pg_catalog.pg_partitioned_table p where p.partrelid = c.oid)::text
                             -- RINV-01: el dueño («ejecutor» si es quien ejecuta); RINV-04: la RLS de las 3 no protegidas
                             || ' · dueño=' || case when c.relowner = (select x.oid from pg_catalog.pg_roles x where x.rolname = current_user) then 'ejecutor' else pg_catalog.pg_get_userbyid(c.relowner)::text end
                             || case when r.t in ('sim_drawing_templates', 'user_chart_config', 'user_tool_config')
                                     then ' · rls=' || c.relrowsecurity::text || ' · forzada=' || c.relforcerowsecurity::text else '' end end fila
              from (values ('sim_alumnos'), ('sim_arrendamientos'), ('sim_recibos'), ('sim_eventos'), ('sim_escrituras_v0'), ('sim_escrituras_v0_marcas'), ('sim_servicio'),
                           ('sim_sessions'), ('sim_trades'), ('session_drawings'), ('session_chart_config'), ('sim_drawing_templates'), ('user_chart_config'), ('user_tool_config')) r(t)
                   left join pg_catalog.pg_class c on c.oid = pg_catalog.to_regclass('public.' || r.t)
            union all
            select 'columna', c.relname || '.' || a.attname || '|' ||
                   -- RINV-02: el tipo con su esquema, sin quitarlo (un dominio public.text no pasa por text)
                   'tipo=' || pg_catalog.format_type(a.atttypid, a.atttypmod) || ' · tipo_esquema=' || tn.nspname::text
                   || ' · notnull=' || a.attnotnull::text
                   || ' · identity=' || coalesce(nullif(a.attidentity::text, ''), '-')
                   || ' · generated=' || coalesce(nullif(a.attgenerated::text, ''), '-')
                   -- RINV2-02: «por defecto» solo la predeterminada (oid 100); cualquier otra, con esquema, proveedor, determinista y locale
                   || ' · colacion=' || case when a.attcollation = 0 then '-' when a.attcollation = 100 then 'por defecto'
                                             else coalesce((select pg_catalog.concat(cn.nspname, '.', co.collname, ' · proveedor=', co.collprovider::text, ' · determinista=', co.collisdeterministic::text,
                                                                                     ' · locale=', coalesce(co.collcollate, co.colllocale, '-'))
                                                              from pg_catalog.pg_collation co join pg_catalog.pg_namespace cn on cn.oid = co.collnamespace where co.oid = a.attcollation), 'NO EXISTE') end
                   || ' · defecto=' || coalesce(pg_catalog.pg_get_expr(d.adbin, d.adrelid), '-')
              from pg_catalog.pg_class c join pg_catalog.pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
                   join pg_catalog.pg_type ty on ty.oid = a.atttypid join pg_catalog.pg_namespace tn on tn.oid = ty.typnamespace
                   left join pg_catalog.pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
             where c.relnamespace = 'public'::regnamespace and c.relname in ('sim_alumnos', 'sim_arrendamientos', 'sim_recibos', 'sim_eventos', 'sim_escrituras_v0', 'sim_escrituras_v0_marcas', 'sim_servicio',
                           'sim_sessions', 'sim_trades', 'session_drawings', 'session_chart_config', 'sim_drawing_templates', 'user_chart_config', 'user_tool_config') and c.relkind = 'r'
            union all
            select 'restriccion', c.relname || '.' || k.conname || '|' ||
                   case when (c.relname, k.conname) in (('sim_sessions', 'sim_sessions_terminal_valida'), ('sim_eventos', 'sim_eventos_tipo_check'))
                        then k.contype::text || ' · (la de sim-004b, segun su estado)'
                        else k.contype::text || ' · ' || pg_catalog.pg_get_constraintdef(k.oid)
                             || ' · validada=' || k.convalidated::text || ' · diferible=' || k.condeferrable::text || '/' || k.condeferred::text end
              from pg_catalog.pg_class c join pg_catalog.pg_constraint k on k.conrelid = c.oid
             where c.relnamespace = 'public'::regnamespace and c.relname in ('sim_alumnos', 'sim_arrendamientos', 'sim_recibos', 'sim_eventos', 'sim_escrituras_v0', 'sim_escrituras_v0_marcas', 'sim_servicio',
                           'sim_sessions', 'sim_trades', 'session_drawings', 'session_chart_config', 'sim_drawing_templates', 'user_chart_config', 'user_tool_config')
            union all
            select 'indice', c.relname || '.' || ic.relname || '|' || pg_catalog.pg_get_indexdef(x.indexrelid)
              from pg_catalog.pg_class c join pg_catalog.pg_index x on x.indrelid = c.oid join pg_catalog.pg_class ic on ic.oid = x.indexrelid
             where c.relnamespace = 'public'::regnamespace and c.relname in ('sim_alumnos', 'sim_arrendamientos', 'sim_recibos', 'sim_eventos', 'sim_escrituras_v0', 'sim_escrituras_v0_marcas', 'sim_servicio',
                           'sim_sessions', 'sim_trades', 'session_drawings', 'session_chart_config', 'sim_drawing_templates', 'user_chart_config', 'user_tool_config')
            union all
            -- RINV-03: cada secuencia identity, con todos sus parametros y su dueño
            select 'identidad', c.relname || '.' || a.attname || '|' ||
                   'tipo=' || pg_catalog.format_type(s.seqtypid, null) || ' · inicio=' || s.seqstart || ' · incremento=' || s.seqincrement
                   || ' · minimo=' || s.seqmin || ' · maximo=' || s.seqmax || ' · cache=' || s.seqcache || ' · ciclo=' || s.seqcycle::text
                   || ' · dueño=' || case when sc.relowner = (select x.oid from pg_catalog.pg_roles x where x.rolname = current_user) then 'ejecutor' else pg_catalog.pg_get_userbyid(sc.relowner)::text end
              from pg_catalog.pg_class c join pg_catalog.pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped and a.attidentity <> ''
                   join pg_catalog.pg_depend dp on dp.refobjid = c.oid and dp.refobjsubid = a.attnum and dp.classid = 'pg_catalog.pg_class'::regclass and dp.deptype = 'i'
                   join pg_catalog.pg_class sc on sc.oid = dp.objid and sc.relkind = 'S'
                   join pg_catalog.pg_sequence s on s.seqrelid = sc.oid
             where c.relnamespace = 'public'::regnamespace and c.relname in ('sim_alumnos', 'sim_arrendamientos', 'sim_recibos', 'sim_eventos', 'sim_escrituras_v0', 'sim_escrituras_v0_marcas', 'sim_servicio',
                           'sim_sessions', 'sim_trades', 'session_drawings', 'session_chart_config', 'sim_drawing_templates', 'user_chart_config', 'user_tool_config')
            union all
            -- RINV2-01 y RINV2-04: de que dependen, FUERA de pg_catalog, los valores por defecto, las restricciones y los indices
            -- (por pg_depend: no depende del texto ni del search_path; un public.now() o un public.length() salen aqui). La s16d
            select 'ajeno', o.nombre || '|' || pg_catalog.pg_describe_object(dp.refclassid, dp.refobjid, 0)
              from (select 'pg_catalog.pg_attrdef'::regclass clase, d.oid, c.relname || '.' || a.attname || ' (defecto)' nombre
                      from pg_catalog.pg_class c join pg_catalog.pg_attrdef d on d.adrelid = c.oid join pg_catalog.pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
                     where c.relnamespace = 'public'::regnamespace and c.relname in ('sim_alumnos', 'sim_arrendamientos', 'sim_recibos', 'sim_eventos', 'sim_escrituras_v0', 'sim_escrituras_v0_marcas', 'sim_servicio',
                           'sim_sessions', 'sim_trades', 'session_drawings', 'session_chart_config', 'sim_drawing_templates', 'user_chart_config', 'user_tool_config')
                    union all
                    select 'pg_catalog.pg_constraint'::regclass, k.oid, c.relname || '.' || k.conname || ' (restriccion)'
                      from pg_catalog.pg_class c join pg_catalog.pg_constraint k on k.conrelid = c.oid
                     where c.relnamespace = 'public'::regnamespace and c.relname in ('sim_alumnos', 'sim_arrendamientos', 'sim_recibos', 'sim_eventos', 'sim_escrituras_v0', 'sim_escrituras_v0_marcas', 'sim_servicio',
                           'sim_sessions', 'sim_trades', 'session_drawings', 'session_chart_config', 'sim_drawing_templates', 'user_chart_config', 'user_tool_config')
                    union all
                    select 'pg_catalog.pg_class'::regclass, x.indexrelid, c.relname || '.' || ic.relname || ' (indice)'
                      from pg_catalog.pg_class c join pg_catalog.pg_index x on x.indrelid = c.oid join pg_catalog.pg_class ic on ic.oid = x.indexrelid
                     where c.relnamespace = 'public'::regnamespace and c.relname in ('sim_alumnos', 'sim_arrendamientos', 'sim_recibos', 'sim_eventos', 'sim_escrituras_v0', 'sim_escrituras_v0_marcas', 'sim_servicio',
                           'sim_sessions', 'sim_trades', 'session_drawings', 'session_chart_config', 'sim_drawing_templates', 'user_chart_config', 'user_tool_config')) o
                   join pg_catalog.pg_depend dp on dp.classid = o.clase and dp.objid = o.oid
             where (dp.refclassid = 'pg_catalog.pg_proc'::regclass and (select p.pronamespace from pg_catalog.pg_proc p where p.oid = dp.refobjid) <> 'pg_catalog'::regnamespace)
                or (dp.refclassid = 'pg_catalog.pg_operator'::regclass and (select p.oprnamespace from pg_catalog.pg_operator p where p.oid = dp.refobjid) <> 'pg_catalog'::regnamespace)
                or (dp.refclassid = 'pg_catalog.pg_type'::regclass and (select p.typnamespace from pg_catalog.pg_type p where p.oid = dp.refobjid) <> 'pg_catalog'::regnamespace)
                or (dp.refclassid = 'pg_catalog.pg_collation'::regclass and (select p.collnamespace from pg_catalog.pg_collation p where p.oid = dp.refobjid) <> 'pg_catalog'::regnamespace)
            union all
            select 'regla', c.relname || '.' || w.rulename || '|' || pg_catalog.pg_get_ruledef(w.oid)
              from pg_catalog.pg_class c join pg_catalog.pg_rewrite w on w.ev_class = c.oid
             where c.relnamespace = 'public'::regnamespace and c.relname in ('sim_alumnos', 'sim_arrendamientos', 'sim_recibos', 'sim_eventos', 'sim_escrituras_v0', 'sim_escrituras_v0_marcas', 'sim_servicio',
                           'sim_sessions', 'sim_trades', 'session_drawings', 'session_chart_config', 'sim_drawing_templates', 'user_chart_config', 'user_tool_config')
            union all
            select 'politica', p.tablename || '.' || p.policyname || '|' ||
                   p.permissive || ' · ' || p.cmd || ' · ' || p.roles::text || ' · using=' || coalesce(p.qual, '-')
                   || ' · check=' || coalesce(p.with_check, '-')
              from pg_catalog.pg_policies p where p.schemaname = 'public' and p.tablename in ('sim_drawing_templates', 'user_chart_config', 'user_tool_config')
            union all
            -- R3E3B-02 (CTO 17-oct): las tres funciones ajenas que llaman los cuerpos, con la ficha de la s16b
            select 'funcion_ajena', f.firma || '|' ||
                   case when p.oid is null then 'NO EXISTE' else
                     'functiondef md5=' || pg_catalog.md5(pg_catalog.pg_get_functiondef(p.oid))
                     || ' · prosrc md5=' || pg_catalog.md5(coalesce(p.prosrc, '')) || ' · probin=' || coalesce(p.probin, '-')
                     || ' · lenguaje=' || l.lanname || ' · dueño=' || pg_catalog.pg_get_userbyid(p.proowner)
                     || ' · prosecdef=' || p.prosecdef::text || ' · provolatile=' || p.provolatile::text || ' · proconfig=' || coalesce(p.proconfig::text, '-')
                     || ' · proisstrict=' || p.proisstrict::text || ' · proleakproof=' || p.proleakproof::text || ' · proparallel=' || p.proparallel::text
                     || ' · prokind=' || p.prokind::text || ' · proretset=' || p.proretset::text || ' · prorettype=' || pg_catalog.format_type(p.prorettype, null)
                     || ' · proargmodes=' || coalesce(p.proargmodes::text, '-') || ' · proargnames=' || coalesce(p.proargnames::text, '-')
                     || ' · pronargdefaults=' || p.pronargdefaults::text || ' · procost=' || p.procost::text || ' · prorows=' || p.prorows::text end
              from (values ('extensions.digest(bytea,text)'), ('extensions.gen_random_bytes(integer)'), ('auth.uid()')) f(firma)
                   left join pg_catalog.pg_proc p on p.oid = pg_catalog.to_regprocedure(f.firma) left join pg_catalog.pg_language l on l.oid = p.prolang
          ) x
        ),
        esp_f(esquemas, familia, n, h) as (values
          ('{}', 'ajeno', 0, 'd41d8cd98f00b204e9800998ecf8427e'),
          ('{}', 'columna', 135, '9610bdfa6bce4ff3b95a3d4fafd743b0'),
          ('{}', 'identidad', 4, '472c2271705ab4440fba7bbe0c61ed04'),
          ('{}', 'indice', 31, '6f248b06ad3aac95b276fc24a00ecb88'),
          ('{}', 'politica', 3, 'ae70c7a2dca8be8f6aa6c6eae4d9754f'),
          ('{}', 'regla', 0, 'd41d8cd98f00b204e9800998ecf8427e'),
          ('{}', 'restriccion', 59, '4f9d1a1af4e93723672d6bba7ae10829'),
          ('{}', 'tabla', 14, 'a9b56cc77c3da41b455e0250b489e0aa'),
          ('{public,extensions}', 'ajeno', 0, 'd41d8cd98f00b204e9800998ecf8427e'),
          ('{public,extensions}', 'columna', 135, '9610bdfa6bce4ff3b95a3d4fafd743b0'),
          ('{public,extensions}', 'identidad', 4, '472c2271705ab4440fba7bbe0c61ed04'),
          ('{public,extensions}', 'indice', 31, '6f248b06ad3aac95b276fc24a00ecb88'),
          ('{public,extensions}', 'politica', 3, 'ae70c7a2dca8be8f6aa6c6eae4d9754f'),
          ('{public,extensions}', 'regla', 0, 'd41d8cd98f00b204e9800998ecf8427e'),
          ('{public,extensions}', 'restriccion', 59, '8c1bcac993492ca83039e80ec6168d01'),
          ('{public,extensions}', 'tabla', 14, 'a9b56cc77c3da41b455e0250b489e0aa')),
        esp_a(firma, ficha) as (values
          ('auth.uid()', 'functiondef md5=ea3b41bf29e2ad573067939329aa088e · prosrc md5=cdef18c69c4f4cbbced2eaf81e628b49 · probin=- · lenguaje=sql · dueño=supabase_auth_admin · prosecdef=false · provolatile=s · proconfig=- · proisstrict=false · proleakproof=false · proparallel=u · prokind=f · proretset=false · prorettype=uuid · proargmodes=- · proargnames=- · pronargdefaults=0 · procost=100 · prorows=0'),
          ('extensions.digest(bytea,text)', 'functiondef md5=85b88685f74a398b1ff164ad33eeaaca · prosrc md5=926ba3fbdb45dc078b3e3cafddc392cc · probin=$libdir/pgcrypto · lenguaje=c · dueño=postgres · prosecdef=false · provolatile=i · proconfig=- · proisstrict=true · proleakproof=false · proparallel=s · prokind=f · proretset=false · prorettype=bytea · proargmodes=- · proargnames=- · pronargdefaults=0 · procost=1 · prorows=0'),
          ('extensions.gen_random_bytes(integer)', 'functiondef md5=a7569a34c9be929beb24ef5670d42636 · prosrc md5=393a992bef3cadec88b224bd3dace51c · probin=$libdir/pgcrypto · lenguaje=c · dueño=postgres · prosecdef=false · provolatile=v · proconfig=- · proisstrict=true · proleakproof=false · proparallel=s · prokind=f · proretset=false · prorettype=bytea · proargmodes=- · proargnames=- · pronargdefaults=0 · procost=1 · prorows=0')),
        med_f as (select i.familia, count(*)::integer n, pg_catalog.md5(string_agg(i.fila, E'\n' order by i.fila collate "C")) h from inv i where i.familia <> 'funcion_ajena' group by i.familia),
        med_a as (select split_part(i.fila, '|', 1) firma, substr(i.fila, strpos(i.fila, '|') + 1) ficha from inv i where i.familia = 'funcion_ajena')
        select 'inventario'::text familia, e.familia objeto,
               'n=' || coalesce(m.n, 0) || ' md5=' || coalesce(m.h, pg_catalog.md5(''))
               || case when coalesce(m.n, 0) = e.n and coalesce(m.h, pg_catalog.md5('')) = e.h then ''
                       else ' (sim-004b espera n=' || e.n || ' md5=' || e.h || ' con esquemas=' || e.esquemas || '; que fila: medirlo aparte)' end detalle,
               coalesce(m.n, 0) = e.n and coalesce(m.h, pg_catalog.md5('')) = e.h bien
          from esp_f e left join med_f m on m.familia = e.familia
         where e.esquemas = pg_catalog.current_schemas(false)::text
        union all
        select 'inventario', 'search_path', 'esquemas=' || pg_catalog.current_schemas(false)::text
               || ' (sin valores esperados: solo {} en sim-004b y {public,extensions}, el del editor, en la s16)', false
         where not exists (select 1 from esp_f e where e.esquemas = pg_catalog.current_schemas(false)::text)
        union all
        select 'funcion_ajena', coalesce(e.firma, m.firma),
               coalesce(m.ficha, 'NO EXISTE') || case when m.ficha is distinct from e.ficha then ' (sim-004b espera ' || e.ficha || ')' else '' end,
               m.ficha is not distinct from e.ficha
          from esp_a e left join med_a m on m.firma = e.firma
      ) v
      -- <<< inventario
    ) i;
  perform pg_catalog.set_config('search_path', v_sp, true);
  raise exception using message = E'informe s16e (no es un fallo)\n'
    || 's16e | search_path | ' || v_sp || E'\n' || v_ed || E'\n' || v_vacio || E'\nFIN | s16e | consulta';
end
$s16e$;
