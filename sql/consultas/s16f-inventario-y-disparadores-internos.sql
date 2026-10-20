-- ============================================================================
-- CONSULTA DE SOLO LECTURA · S16f · el inventario de las 14 tablas con lo que añade la ronda 4
-- (sobrecargas y permiso efectivo de las tres auxiliares, estado de los indices) y los disparadores
-- internos de sus FK en los dos sentidos (etapa 3, ronda 4; CTO 17-oct, orden 1-009; Astra E3R3-01..04)
--
-- Mide en produccion el bloque «inventario» (el mismo texto que sim-004b y la s16) con el search_path
-- del editor y con el vacio, como la s16e, y ademas las filas de los disparadores internos (los de las FK
-- de las 14 tablas, tambien los que viven en profiles y auth.users) tal como las compara sim-004b, con el
-- search_path vacio; y (RE3-01) session_replication_role y row_security, efectivos y donde estan fijados, solo por
-- nombre. Con su salida, el CTO acredita los valores esperados de sim-004b y de la s16.
--
-- NO cambia nada. Es un bloque DO: no escribe, no hace EXECUTE dinamico y solo cambia el search_path
-- DENTRO de su transaccion (set_config local), que ademas se deshace al acabar con error. Solo catalogo:
-- ningun dato de alumnos ni de filas. Ensayada en READ ONLY (pruebas/s16f-inventario-y-disparadores-internos.mjs).
-- Ramon la pega como postgres en el editor SQL de Supabase cuando el CTO la pida. El resultado sale como
-- un ERROR (asi lo ensena el editor): es el informe, no un fallo. Acaba en «FIN | s16f | consulta».
-- ============================================================================
do $s16f$
declare
  v_sp text := pg_catalog.current_setting('search_path');
  v_esq text;
  v_ed text;
  v_vacio text;
  v_trg text;
  v_aj text;
  v_tablas oid[] := array(select pg_catalog.to_regclass('public.' || x)::oid from unnest(array['sim_alumnos', 'sim_arrendamientos', 'sim_recibos', 'sim_eventos', 'sim_escrituras_v0', 'sim_escrituras_v0_marcas', 'sim_servicio', 'sim_sessions', 'sim_trades', 'session_drawings', 'session_chart_config', 'sim_drawing_templates', 'user_chart_config', 'user_tool_config']) x);
begin
  -- 1 con el search_path del editor, fijado aqui (solo en esta transaccion): asi mide sus md5 aunque el de partida sea
  -- otro (RINV4-02); el de partida sale en la fila «search_path»
  perform pg_catalog.set_config('search_path', '"$user", public, extensions', true);
  v_esq := pg_catalog.current_schemas(false)::text;
  select string_agg('s16f | ' || v_esq || ' | ' || i.familia || ' | ' || i.objeto || ' | ' || i.detalle, E'\n' order by i.familia, i.objeto)
    into v_ed
    from (
      -- >>> inventario (identico en sql/sim-004b-contrato-v1.sql y sql/consultas/s16-catalogo-sim004b.sql)
      -- R3E3B-01 (revisor interno; CTO 17-oct): el inventario EXACTO de las 14 tablas fuera de pg_proc, por familias
      -- (E3R3-01/02/04, Astra r3: las sobrecargas y el permiso efectivo de las tres auxiliares; el estado de los indices),
      -- con los textos TAL CUAL los da el catalogo (RINV3-01, CTO 17-oct: sin quitar ningun prefijo): la tabla (relkind, persistencia, particion, hijas,
      -- padres, particionada), cada columna (tipo, NOT NULL, identity, generated, colacion, valor por defecto), cada
      -- restriccion (tipo y definicion, validada, diferible), cada indice (pg_get_indexdef), cada regla, y las politicas
      -- de las 3 no protegidas (las de las 11 protegidas ya son exactas aparte). Las dos restricciones que cambia
      -- sim-004b van por nombre: su definicion la acredita su estado. Los disparadores ya tienen inventario exacto aparte
      -- Por familia se compara el recuento y el md5 del conjunto ordenado con lo medido en produccion (s16e y s16f, 17-oct;
      -- sql/consultas/salidas/), uno por search_path: el vacio (sim-004b) y el del editor (la s16), por sus esquemas
      -- efectivos (current_schemas); con otro, la fila «search_path» no coincide. Las tres funciones ajenas, ficha a ficha
      -- (una lista fija: no puede haber otras). Si algo no coincide, se mide fila a fila con una consulta aparte
      select v.familia, v.objeto, v.detalle, v.bien from (
        with inv as (
          select x.familia, x.fila from (
            select 'tabla'::pg_catalog.text familia, r.t OPERATOR(pg_catalog.||) '|' OPERATOR(pg_catalog.||)
                   case when c.oid is null then 'NO EXISTE'
                        else 'relkind=' OPERATOR(pg_catalog.||) c.relkind::pg_catalog.text OPERATOR(pg_catalog.||) ' · persistencia=' OPERATOR(pg_catalog.||) c.relpersistence::pg_catalog.text OPERATOR(pg_catalog.||) ' · particion=' OPERATOR(pg_catalog.||) c.relispartition::pg_catalog.text
                             OPERATOR(pg_catalog.||) ' · hijas=' OPERATOR(pg_catalog.||) (select pg_catalog.count(*) from pg_catalog.pg_inherits i where i.inhparent OPERATOR(pg_catalog.=) c.oid)
                             OPERATOR(pg_catalog.||) ' · padres=' OPERATOR(pg_catalog.||) coalesce((select pg_catalog.string_agg(i.inhparent::pg_catalog.regclass::pg_catalog.text, ',' order by i.inhseqno) from pg_catalog.pg_inherits i where i.inhrelid OPERATOR(pg_catalog.=) c.oid), '-')
                             OPERATOR(pg_catalog.||) ' · particionada=' OPERATOR(pg_catalog.||) exists (select 1 from pg_catalog.pg_partitioned_table p where p.partrelid OPERATOR(pg_catalog.=) c.oid)::pg_catalog.text
                             -- RINV-01: el dueño («ejecutor» si es quien ejecuta); RINV-04: la RLS de las 3 no protegidas
                             OPERATOR(pg_catalog.||) ' · dueño=' OPERATOR(pg_catalog.||) case when c.relowner OPERATOR(pg_catalog.=) (select x.oid from pg_catalog.pg_roles x where x.rolname OPERATOR(pg_catalog.=) current_user) then 'ejecutor' else pg_catalog.pg_get_userbyid(c.relowner)::pg_catalog.text end
                             OPERATOR(pg_catalog.||) case when r.t OPERATOR(pg_catalog.=) any (array['sim_drawing_templates', 'user_chart_config', 'user_tool_config'])
                                     then ' · rls=' OPERATOR(pg_catalog.||) c.relrowsecurity::pg_catalog.text OPERATOR(pg_catalog.||) ' · forzada=' OPERATOR(pg_catalog.||) c.relforcerowsecurity::pg_catalog.text else '' end end fila
              from (values ('sim_alumnos'), ('sim_arrendamientos'), ('sim_recibos'), ('sim_eventos'), ('sim_escrituras_v0'), ('sim_escrituras_v0_marcas'), ('sim_servicio'),
                           ('sim_sessions'), ('sim_trades'), ('session_drawings'), ('session_chart_config'), ('sim_drawing_templates'), ('user_chart_config'), ('user_tool_config')) r(t)
                   left join pg_catalog.pg_class c on c.oid OPERATOR(pg_catalog.=) pg_catalog.to_regclass('public.' OPERATOR(pg_catalog.||) r.t)
            union all
            select 'columna', c.relname OPERATOR(pg_catalog.||) '.' OPERATOR(pg_catalog.||) a.attname OPERATOR(pg_catalog.||) '|' OPERATOR(pg_catalog.||)
                   -- RINV-02: el tipo con su esquema, sin quitarlo (un dominio public.text no pasa por text)
                   'tipo=' OPERATOR(pg_catalog.||) pg_catalog.format_type(a.atttypid, a.atttypmod) OPERATOR(pg_catalog.||) ' · tipo_esquema=' OPERATOR(pg_catalog.||) tn.nspname::pg_catalog.text
                   OPERATOR(pg_catalog.||) ' · notnull=' OPERATOR(pg_catalog.||) a.attnotnull::pg_catalog.text
                   OPERATOR(pg_catalog.||) ' · identity=' OPERATOR(pg_catalog.||) coalesce(case when a.attidentity::pg_catalog.text OPERATOR(pg_catalog.=) '' then null else a.attidentity::pg_catalog.text end, '-')
                   OPERATOR(pg_catalog.||) ' · generated=' OPERATOR(pg_catalog.||) coalesce(case when a.attgenerated::pg_catalog.text OPERATOR(pg_catalog.=) '' then null else a.attgenerated::pg_catalog.text end, '-')
                   -- RINV2-02: «por defecto» solo la predeterminada (oid 100); cualquier otra, con esquema, proveedor, determinista y locale
                   OPERATOR(pg_catalog.||) ' · colacion=' OPERATOR(pg_catalog.||) case when a.attcollation OPERATOR(pg_catalog.=) 0 then '-' when a.attcollation OPERATOR(pg_catalog.=) 100 then 'por defecto'
                                             else coalesce((select pg_catalog.concat(cn.nspname, '.', co.collname, ' · proveedor=', co.collprovider::pg_catalog.text, ' · determinista=', co.collisdeterministic::pg_catalog.text,
                                                                                     ' · locale=', coalesce(co.collcollate, co.colllocale, '-'))
                                                              from pg_catalog.pg_collation co join pg_catalog.pg_namespace cn on cn.oid OPERATOR(pg_catalog.=) co.collnamespace where co.oid OPERATOR(pg_catalog.=) a.attcollation), 'NO EXISTE') end
                   OPERATOR(pg_catalog.||) ' · defecto=' OPERATOR(pg_catalog.||) coalesce(pg_catalog.pg_get_expr(d.adbin, d.adrelid), '-')
              from pg_catalog.pg_class c join pg_catalog.pg_attribute a on a.attrelid OPERATOR(pg_catalog.=) c.oid and a.attnum OPERATOR(pg_catalog.>) 0 and not a.attisdropped
                   join pg_catalog.pg_type ty on ty.oid OPERATOR(pg_catalog.=) a.atttypid join pg_catalog.pg_namespace tn on tn.oid OPERATOR(pg_catalog.=) ty.typnamespace
                   left join pg_catalog.pg_attrdef d on d.adrelid OPERATOR(pg_catalog.=) a.attrelid and d.adnum OPERATOR(pg_catalog.=) a.attnum
             where c.relnamespace OPERATOR(pg_catalog.=) 'public'::pg_catalog.regnamespace and c.relname OPERATOR(pg_catalog.=) any (array['sim_alumnos', 'sim_arrendamientos', 'sim_recibos', 'sim_eventos', 'sim_escrituras_v0', 'sim_escrituras_v0_marcas', 'sim_servicio',
                           'sim_sessions', 'sim_trades', 'session_drawings', 'session_chart_config', 'sim_drawing_templates', 'user_chart_config', 'user_tool_config']::pg_catalog.name[]) and c.relkind OPERATOR(pg_catalog.=) 'r'
            union all
            select 'restriccion', c.relname OPERATOR(pg_catalog.||) '.' OPERATOR(pg_catalog.||) k.conname OPERATOR(pg_catalog.||) '|' OPERATOR(pg_catalog.||)
                   case when ((c.relname OPERATOR(pg_catalog.=) 'sim_sessions' and k.conname OPERATOR(pg_catalog.=) 'sim_sessions_terminal_valida') or (c.relname OPERATOR(pg_catalog.=) 'sim_eventos' and k.conname OPERATOR(pg_catalog.=) 'sim_eventos_tipo_check'))
                        then k.contype::pg_catalog.text OPERATOR(pg_catalog.||) ' · (la de sim-004b, segun su estado)'
                        else k.contype::pg_catalog.text OPERATOR(pg_catalog.||) ' · ' OPERATOR(pg_catalog.||) pg_catalog.pg_get_constraintdef(k.oid)
                             OPERATOR(pg_catalog.||) ' · validada=' OPERATOR(pg_catalog.||) k.convalidated::pg_catalog.text OPERATOR(pg_catalog.||) ' · diferible=' OPERATOR(pg_catalog.||) k.condeferrable::pg_catalog.text OPERATOR(pg_catalog.||) '/' OPERATOR(pg_catalog.||) k.condeferred::pg_catalog.text end
              from pg_catalog.pg_class c join pg_catalog.pg_constraint k on k.conrelid OPERATOR(pg_catalog.=) c.oid
             where c.relnamespace OPERATOR(pg_catalog.=) 'public'::pg_catalog.regnamespace and c.relname OPERATOR(pg_catalog.=) any (array['sim_alumnos', 'sim_arrendamientos', 'sim_recibos', 'sim_eventos', 'sim_escrituras_v0', 'sim_escrituras_v0_marcas', 'sim_servicio',
                           'sim_sessions', 'sim_trades', 'session_drawings', 'session_chart_config', 'sim_drawing_templates', 'user_chart_config', 'user_tool_config']::pg_catalog.name[])
            union all
            -- E3R3-04 (Astra r3): ademas de la definicion, el estado operativo (unico, valido, listo y vivo)
            select 'indice', c.relname OPERATOR(pg_catalog.||) '.' OPERATOR(pg_catalog.||) ic.relname OPERATOR(pg_catalog.||) '|' OPERATOR(pg_catalog.||) pg_catalog.pg_get_indexdef(x.indexrelid)
                   OPERATOR(pg_catalog.||) ' · unico=' OPERATOR(pg_catalog.||) x.indisunique::pg_catalog.text OPERATOR(pg_catalog.||) ' · valido=' OPERATOR(pg_catalog.||) x.indisvalid::pg_catalog.text OPERATOR(pg_catalog.||) ' · listo=' OPERATOR(pg_catalog.||) x.indisready::pg_catalog.text OPERATOR(pg_catalog.||) ' · vivo=' OPERATOR(pg_catalog.||) x.indislive::pg_catalog.text
              from pg_catalog.pg_class c join pg_catalog.pg_index x on x.indrelid OPERATOR(pg_catalog.=) c.oid join pg_catalog.pg_class ic on ic.oid OPERATOR(pg_catalog.=) x.indexrelid
             where c.relnamespace OPERATOR(pg_catalog.=) 'public'::pg_catalog.regnamespace and c.relname OPERATOR(pg_catalog.=) any (array['sim_alumnos', 'sim_arrendamientos', 'sim_recibos', 'sim_eventos', 'sim_escrituras_v0', 'sim_escrituras_v0_marcas', 'sim_servicio',
                           'sim_sessions', 'sim_trades', 'session_drawings', 'session_chart_config', 'sim_drawing_templates', 'user_chart_config', 'user_tool_config']::pg_catalog.name[])
            union all
            -- RINV-03: cada secuencia identity, con todos sus parametros y su dueño
            select 'identidad', c.relname OPERATOR(pg_catalog.||) '.' OPERATOR(pg_catalog.||) a.attname OPERATOR(pg_catalog.||) '|' OPERATOR(pg_catalog.||)
                   'tipo=' OPERATOR(pg_catalog.||) pg_catalog.format_type(s.seqtypid, null) OPERATOR(pg_catalog.||) ' · inicio=' OPERATOR(pg_catalog.||) s.seqstart OPERATOR(pg_catalog.||) ' · incremento=' OPERATOR(pg_catalog.||) s.seqincrement
                   OPERATOR(pg_catalog.||) ' · minimo=' OPERATOR(pg_catalog.||) s.seqmin OPERATOR(pg_catalog.||) ' · maximo=' OPERATOR(pg_catalog.||) s.seqmax OPERATOR(pg_catalog.||) ' · cache=' OPERATOR(pg_catalog.||) s.seqcache OPERATOR(pg_catalog.||) ' · ciclo=' OPERATOR(pg_catalog.||) s.seqcycle::pg_catalog.text
                   OPERATOR(pg_catalog.||) ' · dueño=' OPERATOR(pg_catalog.||) case when sc.relowner OPERATOR(pg_catalog.=) (select x.oid from pg_catalog.pg_roles x where x.rolname OPERATOR(pg_catalog.=) current_user) then 'ejecutor' else pg_catalog.pg_get_userbyid(sc.relowner)::pg_catalog.text end
              from pg_catalog.pg_class c join pg_catalog.pg_attribute a on a.attrelid OPERATOR(pg_catalog.=) c.oid and a.attnum OPERATOR(pg_catalog.>) 0 and not a.attisdropped and a.attidentity OPERATOR(pg_catalog.<>) ''
                   join pg_catalog.pg_depend dp on dp.refobjid OPERATOR(pg_catalog.=) c.oid and dp.refobjsubid OPERATOR(pg_catalog.=) a.attnum and dp.classid OPERATOR(pg_catalog.=) 'pg_catalog.pg_class'::pg_catalog.regclass and dp.deptype OPERATOR(pg_catalog.=) 'i'
                   join pg_catalog.pg_class sc on sc.oid OPERATOR(pg_catalog.=) dp.objid and sc.relkind OPERATOR(pg_catalog.=) 'S'
                   join pg_catalog.pg_sequence s on s.seqrelid OPERATOR(pg_catalog.=) sc.oid
             where c.relnamespace OPERATOR(pg_catalog.=) 'public'::pg_catalog.regnamespace and c.relname OPERATOR(pg_catalog.=) any (array['sim_alumnos', 'sim_arrendamientos', 'sim_recibos', 'sim_eventos', 'sim_escrituras_v0', 'sim_escrituras_v0_marcas', 'sim_servicio',
                           'sim_sessions', 'sim_trades', 'session_drawings', 'session_chart_config', 'sim_drawing_templates', 'user_chart_config', 'user_tool_config']::pg_catalog.name[])
            union all
            -- RINV2-01 y RINV2-04: de que dependen, FUERA de pg_catalog, los valores por defecto, las restricciones y los indices
            -- (por pg_depend: no depende del texto ni del search_path; un public.now() o un public.length() salen aqui). La s16d
            select 'ajeno', o.nombre OPERATOR(pg_catalog.||) '|' OPERATOR(pg_catalog.||) pg_catalog.pg_describe_object(dp.refclassid, dp.refobjid, 0)
              from (select 'pg_catalog.pg_attrdef'::pg_catalog.regclass clase, d.oid, c.relname OPERATOR(pg_catalog.||) '.' OPERATOR(pg_catalog.||) a.attname OPERATOR(pg_catalog.||) ' (defecto)' nombre
                      from pg_catalog.pg_class c join pg_catalog.pg_attrdef d on d.adrelid OPERATOR(pg_catalog.=) c.oid join pg_catalog.pg_attribute a on a.attrelid OPERATOR(pg_catalog.=) d.adrelid and a.attnum OPERATOR(pg_catalog.=) d.adnum
                     where c.relnamespace OPERATOR(pg_catalog.=) 'public'::pg_catalog.regnamespace and c.relname OPERATOR(pg_catalog.=) any (array['sim_alumnos', 'sim_arrendamientos', 'sim_recibos', 'sim_eventos', 'sim_escrituras_v0', 'sim_escrituras_v0_marcas', 'sim_servicio',
                           'sim_sessions', 'sim_trades', 'session_drawings', 'session_chart_config', 'sim_drawing_templates', 'user_chart_config', 'user_tool_config']::pg_catalog.name[])
                    union all
                    select 'pg_catalog.pg_constraint'::pg_catalog.regclass, k.oid, c.relname OPERATOR(pg_catalog.||) '.' OPERATOR(pg_catalog.||) k.conname OPERATOR(pg_catalog.||) ' (restriccion)'
                      from pg_catalog.pg_class c join pg_catalog.pg_constraint k on k.conrelid OPERATOR(pg_catalog.=) c.oid
                     where c.relnamespace OPERATOR(pg_catalog.=) 'public'::pg_catalog.regnamespace and c.relname OPERATOR(pg_catalog.=) any (array['sim_alumnos', 'sim_arrendamientos', 'sim_recibos', 'sim_eventos', 'sim_escrituras_v0', 'sim_escrituras_v0_marcas', 'sim_servicio',
                           'sim_sessions', 'sim_trades', 'session_drawings', 'session_chart_config', 'sim_drawing_templates', 'user_chart_config', 'user_tool_config']::pg_catalog.name[])
                    union all
                    select 'pg_catalog.pg_class'::pg_catalog.regclass, x.indexrelid, c.relname OPERATOR(pg_catalog.||) '.' OPERATOR(pg_catalog.||) ic.relname OPERATOR(pg_catalog.||) ' (indice)'
                      from pg_catalog.pg_class c join pg_catalog.pg_index x on x.indrelid OPERATOR(pg_catalog.=) c.oid join pg_catalog.pg_class ic on ic.oid OPERATOR(pg_catalog.=) x.indexrelid
                     where c.relnamespace OPERATOR(pg_catalog.=) 'public'::pg_catalog.regnamespace and c.relname OPERATOR(pg_catalog.=) any (array['sim_alumnos', 'sim_arrendamientos', 'sim_recibos', 'sim_eventos', 'sim_escrituras_v0', 'sim_escrituras_v0_marcas', 'sim_servicio',
                           'sim_sessions', 'sim_trades', 'session_drawings', 'session_chart_config', 'sim_drawing_templates', 'user_chart_config', 'user_tool_config']::pg_catalog.name[])) o
                   join pg_catalog.pg_depend dp on dp.classid OPERATOR(pg_catalog.=) o.clase and dp.objid OPERATOR(pg_catalog.=) o.oid
             where (dp.refclassid OPERATOR(pg_catalog.=) 'pg_catalog.pg_proc'::pg_catalog.regclass and (select p.pronamespace from pg_catalog.pg_proc p where p.oid OPERATOR(pg_catalog.=) dp.refobjid) OPERATOR(pg_catalog.<>) 'pg_catalog'::pg_catalog.regnamespace)
                or (dp.refclassid OPERATOR(pg_catalog.=) 'pg_catalog.pg_operator'::pg_catalog.regclass and (select p.oprnamespace from pg_catalog.pg_operator p where p.oid OPERATOR(pg_catalog.=) dp.refobjid) OPERATOR(pg_catalog.<>) 'pg_catalog'::pg_catalog.regnamespace)
                or (dp.refclassid OPERATOR(pg_catalog.=) 'pg_catalog.pg_type'::pg_catalog.regclass and (select p.typnamespace from pg_catalog.pg_type p where p.oid OPERATOR(pg_catalog.=) dp.refobjid) OPERATOR(pg_catalog.<>) 'pg_catalog'::pg_catalog.regnamespace)
                or (dp.refclassid OPERATOR(pg_catalog.=) 'pg_catalog.pg_collation'::pg_catalog.regclass and (select p.collnamespace from pg_catalog.pg_collation p where p.oid OPERATOR(pg_catalog.=) dp.refobjid) OPERATOR(pg_catalog.<>) 'pg_catalog'::pg_catalog.regnamespace)
            union all
            select 'regla', c.relname OPERATOR(pg_catalog.||) '.' OPERATOR(pg_catalog.||) w.rulename OPERATOR(pg_catalog.||) '|' OPERATOR(pg_catalog.||) pg_catalog.pg_get_ruledef(w.oid)
              from pg_catalog.pg_class c join pg_catalog.pg_rewrite w on w.ev_class OPERATOR(pg_catalog.=) c.oid
             where c.relnamespace OPERATOR(pg_catalog.=) 'public'::pg_catalog.regnamespace and c.relname OPERATOR(pg_catalog.=) any (array['sim_alumnos', 'sim_arrendamientos', 'sim_recibos', 'sim_eventos', 'sim_escrituras_v0', 'sim_escrituras_v0_marcas', 'sim_servicio',
                           'sim_sessions', 'sim_trades', 'session_drawings', 'session_chart_config', 'sim_drawing_templates', 'user_chart_config', 'user_tool_config']::pg_catalog.name[])
            union all
            select 'politica', p.tablename OPERATOR(pg_catalog.||) '.' OPERATOR(pg_catalog.||) p.policyname OPERATOR(pg_catalog.||) '|' OPERATOR(pg_catalog.||)
                   p.permissive OPERATOR(pg_catalog.||) ' · ' OPERATOR(pg_catalog.||) p.cmd OPERATOR(pg_catalog.||) ' · ' OPERATOR(pg_catalog.||) p.roles::pg_catalog.text OPERATOR(pg_catalog.||) ' · using=' OPERATOR(pg_catalog.||) coalesce(p.qual, '-')
                   OPERATOR(pg_catalog.||) ' · check=' OPERATOR(pg_catalog.||) coalesce(p.with_check, '-')
              from pg_catalog.pg_policies p where p.schemaname OPERATOR(pg_catalog.=) 'public' and p.tablename OPERATOR(pg_catalog.=) any (array['sim_drawing_templates', 'user_chart_config', 'user_tool_config']::pg_catalog.name[])
            union all
            -- E3R3-01 (Astra r3): TODAS las funciones con esos nombres en esos esquemas (las RPC las llaman calificadas,
            -- extensions.digest(...), y una sobrecarga de mas en el mismo esquema hace ambigua la llamada: 42725)
            select 'sobrecarga', n.nspname::pg_catalog.text OPERATOR(pg_catalog.||) '.' OPERATOR(pg_catalog.||) p.proname::pg_catalog.text OPERATOR(pg_catalog.||) '(' OPERATOR(pg_catalog.||) pg_catalog.pg_get_function_identity_arguments(p.oid) OPERATOR(pg_catalog.||) ')'
              from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid OPERATOR(pg_catalog.=) p.pronamespace
             where ((n.nspname OPERATOR(pg_catalog.=) 'extensions' and p.proname OPERATOR(pg_catalog.=) 'digest') or (n.nspname OPERATOR(pg_catalog.=) 'extensions' and p.proname OPERATOR(pg_catalog.=) 'gen_random_bytes') or (n.nspname OPERATOR(pg_catalog.=) 'auth' and p.proname OPERATOR(pg_catalog.=) 'uid'))
            union all
            -- E3R3-02 (Astra r3): el permiso EFECTIVO de EXECUTE de quien las usa: el dueño de las RPC (definer) las tres,
            -- y authenticated auth.uid() (las politicas de RLS). Lo medido, no la ACL textual
            select 'permiso', f.firma OPERATOR(pg_catalog.||) '|dueño_rpc=' OPERATOR(pg_catalog.||) coalesce(pg_catalog.has_function_privilege(r.proowner, p.oid, 'EXECUTE')::pg_catalog.text, 'NO EXISTE')
                   OPERATOR(pg_catalog.||) case when f.firma OPERATOR(pg_catalog.=) 'auth.uid()' then ' · authenticated=' OPERATOR(pg_catalog.||) coalesce(pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')::pg_catalog.text, 'NO EXISTE') else '' end
              from (values ('extensions.digest(bytea,text)'), ('extensions.gen_random_bytes(integer)'), ('auth.uid()')) f(firma)
                   left join pg_catalog.pg_proc p on p.oid OPERATOR(pg_catalog.=) pg_catalog.to_regprocedure(f.firma)
                   left join pg_catalog.pg_proc r on r.oid OPERATOR(pg_catalog.=) pg_catalog.to_regprocedure('public.sim_crear_sesion(uuid,uuid,uuid,text,integer,jsonb,jsonb,jsonb,jsonb)')
            union all
            -- RE3-02 y RE3-03 (revisor interno de c4d46e3): el permiso EFECTIVO del dueño de las RPC sobre lo que usan sus
            -- cuerpos: los siete privilegios en las 14 tablas y EXECUTE en las funciones sim_* de public (un REVOKE a si
            -- mismo las deja en 42501)
            select 'permiso', 'tabla:' OPERATOR(pg_catalog.||) c.relname OPERATOR(pg_catalog.||) '|dueño_rpc=' OPERATOR(pg_catalog.||) coalesce((select pg_catalog.string_agg(pr.p, ',' order by pr.n) from (values ('SELECT', 1), ('INSERT', 2), ('UPDATE', 3), ('DELETE', 4), ('TRUNCATE', 5), ('REFERENCES', 6), ('TRIGGER', 7)) pr(p, n)
                                                                                  where pg_catalog.has_table_privilege(r.proowner, c.oid, pr.p)), '-')
              from pg_catalog.pg_class c
                   left join pg_catalog.pg_proc r on r.oid OPERATOR(pg_catalog.=) pg_catalog.to_regprocedure('public.sim_crear_sesion(uuid,uuid,uuid,text,integer,jsonb,jsonb,jsonb,jsonb)')
             where c.relnamespace OPERATOR(pg_catalog.=) 'public'::pg_catalog.regnamespace and c.relname OPERATOR(pg_catalog.=) any (array['sim_alumnos', 'sim_arrendamientos', 'sim_recibos', 'sim_eventos', 'sim_escrituras_v0', 'sim_escrituras_v0_marcas', 'sim_servicio',
                           'sim_sessions', 'sim_trades', 'session_drawings', 'session_chart_config', 'sim_drawing_templates', 'user_chart_config', 'user_tool_config']::pg_catalog.name[]) and c.relkind OPERATOR(pg_catalog.=) 'r'
            union all
            select 'permiso', 'funcion:' OPERATOR(pg_catalog.||) p.oid::pg_catalog.regprocedure::pg_catalog.text OPERATOR(pg_catalog.||) '|dueño_rpc=' OPERATOR(pg_catalog.||) coalesce(pg_catalog.has_function_privilege(r.proowner, p.oid, 'EXECUTE')::pg_catalog.text, 'NO EXISTE')
              from pg_catalog.pg_proc p
                   left join pg_catalog.pg_proc r on r.oid OPERATOR(pg_catalog.=) pg_catalog.to_regprocedure('public.sim_crear_sesion(uuid,uuid,uuid,text,integer,jsonb,jsonb,jsonb,jsonb)')
             where p.pronamespace OPERATOR(pg_catalog.=) 'public'::pg_catalog.regnamespace and (p.proname OPERATOR(pg_catalog.~~) 'sim\_%' or p.proname OPERATOR(pg_catalog.=) 'enforce_sim_session_limit')
               and p.proname OPERATOR(pg_catalog.<>) 'sim_escrituras_v0_puerta'  -- la de la puerta (estado 2) es de disparador: no se llama
            union all
            -- R3E3B-02 (CTO 17-oct): las tres funciones ajenas que llaman los cuerpos, con la ficha de la s16b
            select 'funcion_ajena', f.firma OPERATOR(pg_catalog.||) '|' OPERATOR(pg_catalog.||)
                   case when p.oid is null then 'NO EXISTE' else
                     'functiondef md5=' OPERATOR(pg_catalog.||) pg_catalog.md5(pg_catalog.pg_get_functiondef(p.oid))
                     OPERATOR(pg_catalog.||) ' · prosrc md5=' OPERATOR(pg_catalog.||) pg_catalog.md5(coalesce(p.prosrc, '')) OPERATOR(pg_catalog.||) ' · probin=' OPERATOR(pg_catalog.||) coalesce(p.probin, '-')
                     OPERATOR(pg_catalog.||) ' · lenguaje=' OPERATOR(pg_catalog.||) l.lanname OPERATOR(pg_catalog.||) ' · dueño=' OPERATOR(pg_catalog.||) pg_catalog.pg_get_userbyid(p.proowner)
                     OPERATOR(pg_catalog.||) ' · prosecdef=' OPERATOR(pg_catalog.||) p.prosecdef::pg_catalog.text OPERATOR(pg_catalog.||) ' · provolatile=' OPERATOR(pg_catalog.||) p.provolatile::pg_catalog.text OPERATOR(pg_catalog.||) ' · proconfig=' OPERATOR(pg_catalog.||) coalesce(p.proconfig::pg_catalog.text, '-')
                     OPERATOR(pg_catalog.||) ' · proisstrict=' OPERATOR(pg_catalog.||) p.proisstrict::pg_catalog.text OPERATOR(pg_catalog.||) ' · proleakproof=' OPERATOR(pg_catalog.||) p.proleakproof::pg_catalog.text OPERATOR(pg_catalog.||) ' · proparallel=' OPERATOR(pg_catalog.||) p.proparallel::pg_catalog.text
                     OPERATOR(pg_catalog.||) ' · prokind=' OPERATOR(pg_catalog.||) p.prokind::pg_catalog.text OPERATOR(pg_catalog.||) ' · proretset=' OPERATOR(pg_catalog.||) p.proretset::pg_catalog.text OPERATOR(pg_catalog.||) ' · prorettype=' OPERATOR(pg_catalog.||) pg_catalog.format_type(p.prorettype, null)
                     OPERATOR(pg_catalog.||) ' · proargmodes=' OPERATOR(pg_catalog.||) coalesce(p.proargmodes::pg_catalog.text, '-') OPERATOR(pg_catalog.||) ' · proargnames=' OPERATOR(pg_catalog.||) coalesce(p.proargnames::pg_catalog.text, '-')
                     OPERATOR(pg_catalog.||) ' · pronargdefaults=' OPERATOR(pg_catalog.||) p.pronargdefaults::pg_catalog.text OPERATOR(pg_catalog.||) ' · procost=' OPERATOR(pg_catalog.||) p.procost::pg_catalog.text OPERATOR(pg_catalog.||) ' · prorows=' OPERATOR(pg_catalog.||) p.prorows::pg_catalog.text end
              from (values ('extensions.digest(bytea,text)'), ('extensions.gen_random_bytes(integer)'), ('auth.uid()')) f(firma)
                   left join pg_catalog.pg_proc p on p.oid OPERATOR(pg_catalog.=) pg_catalog.to_regprocedure(f.firma) left join pg_catalog.pg_language l on l.oid OPERATOR(pg_catalog.=) p.prolang
          ) x
        ),
        esp_f(esquemas, familia, n, h) as (values
          ('{}', 'ajeno', 0, 'd41d8cd98f00b204e9800998ecf8427e'),
          ('{}', 'columna', 135, '9610bdfa6bce4ff3b95a3d4fafd743b0'),
          ('{}', 'identidad', 4, '472c2271705ab4440fba7bbe0c61ed04'),
          ('{}', 'indice', 31, '79cdc8554026972e2802601707a99bd1'),
          ('{}', 'permiso', 39, '25fc63d1d9d6b85da7fc125969fc6144'),
          ('{}', 'politica', 3, 'ae70c7a2dca8be8f6aa6c6eae4d9754f'),
          ('{}', 'regla', 0, 'd41d8cd98f00b204e9800998ecf8427e'),
          ('{}', 'restriccion', 59, '4f9d1a1af4e93723672d6bba7ae10829'),
          ('{}', 'sobrecarga', 4, 'df3ad2088d0f399ac318d9e1346413b4'),
          ('{}', 'tabla', 14, 'a9b56cc77c3da41b455e0250b489e0aa'),
          ('{public,extensions}', 'ajeno', 0, 'd41d8cd98f00b204e9800998ecf8427e'),
          ('{public,extensions}', 'columna', 135, '9610bdfa6bce4ff3b95a3d4fafd743b0'),
          ('{public,extensions}', 'identidad', 4, '472c2271705ab4440fba7bbe0c61ed04'),
          ('{public,extensions}', 'indice', 31, '79cdc8554026972e2802601707a99bd1'),
          ('{public,extensions}', 'permiso', 39, '6a3ba7f0b9e33c9e43e91aacd6eeaf3b'),
          ('{public,extensions}', 'politica', 3, 'ae70c7a2dca8be8f6aa6c6eae4d9754f'),
          ('{public,extensions}', 'regla', 0, 'd41d8cd98f00b204e9800998ecf8427e'),
          ('{public,extensions}', 'restriccion', 59, '8c1bcac993492ca83039e80ec6168d01'),
          ('{public,extensions}', 'sobrecarga', 4, 'df3ad2088d0f399ac318d9e1346413b4'),
          ('{public,extensions}', 'tabla', 14, 'a9b56cc77c3da41b455e0250b489e0aa')),
        esp_a(firma, ficha) as (values
          ('auth.uid()', 'functiondef md5=ea3b41bf29e2ad573067939329aa088e · prosrc md5=cdef18c69c4f4cbbced2eaf81e628b49 · probin=- · lenguaje=sql · dueño=supabase_auth_admin · prosecdef=false · provolatile=s · proconfig=- · proisstrict=false · proleakproof=false · proparallel=u · prokind=f · proretset=false · prorettype=uuid · proargmodes=- · proargnames=- · pronargdefaults=0 · procost=100 · prorows=0'),
          ('extensions.digest(bytea,text)', 'functiondef md5=85b88685f74a398b1ff164ad33eeaaca · prosrc md5=926ba3fbdb45dc078b3e3cafddc392cc · probin=$libdir/pgcrypto · lenguaje=c · dueño=postgres · prosecdef=false · provolatile=i · proconfig=- · proisstrict=true · proleakproof=false · proparallel=s · prokind=f · proretset=false · prorettype=bytea · proargmodes=- · proargnames=- · pronargdefaults=0 · procost=1 · prorows=0'),
          ('extensions.gen_random_bytes(integer)', 'functiondef md5=a7569a34c9be929beb24ef5670d42636 · prosrc md5=393a992bef3cadec88b224bd3dace51c · probin=$libdir/pgcrypto · lenguaje=c · dueño=postgres · prosecdef=false · provolatile=v · proconfig=- · proisstrict=true · proleakproof=false · proparallel=s · prokind=f · proretset=false · prorettype=bytea · proargmodes=- · proargnames=- · pronargdefaults=0 · procost=1 · prorows=0')),
        med_f as (select i.familia, pg_catalog.count(*)::pg_catalog.int4 n, pg_catalog.md5(pg_catalog.string_agg(i.fila, E'\n' order by i.fila collate pg_catalog."C")) h from inv i where i.familia OPERATOR(pg_catalog.<>) 'funcion_ajena' group by i.familia),
        med_a as (select pg_catalog.split_part(i.fila, '|', 1) firma, pg_catalog.substr(i.fila, pg_catalog.strpos(i.fila, '|') OPERATOR(pg_catalog.+) 1) ficha from inv i where i.familia OPERATOR(pg_catalog.=) 'funcion_ajena')
        select 'inventario'::pg_catalog.text familia, e.familia objeto,
               'n=' OPERATOR(pg_catalog.||) coalesce(m.n, 0) OPERATOR(pg_catalog.||) ' md5=' OPERATOR(pg_catalog.||) coalesce(m.h, pg_catalog.md5(''))
               OPERATOR(pg_catalog.||) case when coalesce(m.n, 0) OPERATOR(pg_catalog.=) e.n and coalesce(m.h, pg_catalog.md5('')) OPERATOR(pg_catalog.=) e.h then ''
                       else ' (sim-004b espera n=' OPERATOR(pg_catalog.||) e.n OPERATOR(pg_catalog.||) ' md5=' OPERATOR(pg_catalog.||) e.h OPERATOR(pg_catalog.||) ' con esquemas=' OPERATOR(pg_catalog.||) e.esquemas OPERATOR(pg_catalog.||) '; que fila: medirlo aparte)' end detalle,
               coalesce(m.n, 0) OPERATOR(pg_catalog.=) e.n and coalesce(m.h, pg_catalog.md5('')) OPERATOR(pg_catalog.=) e.h bien
          from esp_f e left join med_f m on m.familia OPERATOR(pg_catalog.=) e.familia
         where e.esquemas OPERATOR(pg_catalog.=) pg_catalog.current_schemas(false)::pg_catalog.text
        union all
        select 'inventario', 'search_path', 'esquemas=' OPERATOR(pg_catalog.||) pg_catalog.current_schemas(false)::pg_catalog.text
               OPERATOR(pg_catalog.||) ' (sin valores esperados: solo {} en sim-004b y {public,extensions}, el del editor, en la s16)', false
         where not exists (select 1 from esp_f e where e.esquemas OPERATOR(pg_catalog.=) pg_catalog.current_schemas(false)::pg_catalog.text)
        union all
        select 'funcion_ajena', coalesce(e.firma, m.firma),
               coalesce(m.ficha, 'NO EXISTE') OPERATOR(pg_catalog.||) case when not coalesce(m.ficha OPERATOR(pg_catalog.=) e.ficha, m.ficha is null and e.ficha is null) then ' (sim-004b espera ' OPERATOR(pg_catalog.||) e.ficha OPERATOR(pg_catalog.||) ')' else '' end,
               coalesce(m.ficha OPERATOR(pg_catalog.=) e.ficha, m.ficha is null and e.ficha is null)
          from esp_a e left join med_a m on m.firma OPERATOR(pg_catalog.=) e.firma
      ) v
      -- <<< inventario
    ) i;
  -- 2 con el search_path vacio (el de sim-004b), solo en esta transaccion
  perform pg_catalog.set_config('search_path', '', true);
  select string_agg('s16f | ' || pg_catalog.current_schemas(false)::text || ' | ' || i.familia || ' | ' || i.objeto || ' | ' || i.detalle, E'\n' order by i.familia, i.objeto)
    into v_vacio
    from (
      -- >>> inventario (identico en sql/sim-004b-contrato-v1.sql y sql/consultas/s16-catalogo-sim004b.sql)
      -- R3E3B-01 (revisor interno; CTO 17-oct): el inventario EXACTO de las 14 tablas fuera de pg_proc, por familias
      -- (E3R3-01/02/04, Astra r3: las sobrecargas y el permiso efectivo de las tres auxiliares; el estado de los indices),
      -- con los textos TAL CUAL los da el catalogo (RINV3-01, CTO 17-oct: sin quitar ningun prefijo): la tabla (relkind, persistencia, particion, hijas,
      -- padres, particionada), cada columna (tipo, NOT NULL, identity, generated, colacion, valor por defecto), cada
      -- restriccion (tipo y definicion, validada, diferible), cada indice (pg_get_indexdef), cada regla, y las politicas
      -- de las 3 no protegidas (las de las 11 protegidas ya son exactas aparte). Las dos restricciones que cambia
      -- sim-004b van por nombre: su definicion la acredita su estado. Los disparadores ya tienen inventario exacto aparte
      -- Por familia se compara el recuento y el md5 del conjunto ordenado con lo medido en produccion (s16e y s16f, 17-oct;
      -- sql/consultas/salidas/), uno por search_path: el vacio (sim-004b) y el del editor (la s16), por sus esquemas
      -- efectivos (current_schemas); con otro, la fila «search_path» no coincide. Las tres funciones ajenas, ficha a ficha
      -- (una lista fija: no puede haber otras). Si algo no coincide, se mide fila a fila con una consulta aparte
      select v.familia, v.objeto, v.detalle, v.bien from (
        with inv as (
          select x.familia, x.fila from (
            select 'tabla'::pg_catalog.text familia, r.t OPERATOR(pg_catalog.||) '|' OPERATOR(pg_catalog.||)
                   case when c.oid is null then 'NO EXISTE'
                        else 'relkind=' OPERATOR(pg_catalog.||) c.relkind::pg_catalog.text OPERATOR(pg_catalog.||) ' · persistencia=' OPERATOR(pg_catalog.||) c.relpersistence::pg_catalog.text OPERATOR(pg_catalog.||) ' · particion=' OPERATOR(pg_catalog.||) c.relispartition::pg_catalog.text
                             OPERATOR(pg_catalog.||) ' · hijas=' OPERATOR(pg_catalog.||) (select pg_catalog.count(*) from pg_catalog.pg_inherits i where i.inhparent OPERATOR(pg_catalog.=) c.oid)
                             OPERATOR(pg_catalog.||) ' · padres=' OPERATOR(pg_catalog.||) coalesce((select pg_catalog.string_agg(i.inhparent::pg_catalog.regclass::pg_catalog.text, ',' order by i.inhseqno) from pg_catalog.pg_inherits i where i.inhrelid OPERATOR(pg_catalog.=) c.oid), '-')
                             OPERATOR(pg_catalog.||) ' · particionada=' OPERATOR(pg_catalog.||) exists (select 1 from pg_catalog.pg_partitioned_table p where p.partrelid OPERATOR(pg_catalog.=) c.oid)::pg_catalog.text
                             -- RINV-01: el dueño («ejecutor» si es quien ejecuta); RINV-04: la RLS de las 3 no protegidas
                             OPERATOR(pg_catalog.||) ' · dueño=' OPERATOR(pg_catalog.||) case when c.relowner OPERATOR(pg_catalog.=) (select x.oid from pg_catalog.pg_roles x where x.rolname OPERATOR(pg_catalog.=) current_user) then 'ejecutor' else pg_catalog.pg_get_userbyid(c.relowner)::pg_catalog.text end
                             OPERATOR(pg_catalog.||) case when r.t OPERATOR(pg_catalog.=) any (array['sim_drawing_templates', 'user_chart_config', 'user_tool_config'])
                                     then ' · rls=' OPERATOR(pg_catalog.||) c.relrowsecurity::pg_catalog.text OPERATOR(pg_catalog.||) ' · forzada=' OPERATOR(pg_catalog.||) c.relforcerowsecurity::pg_catalog.text else '' end end fila
              from (values ('sim_alumnos'), ('sim_arrendamientos'), ('sim_recibos'), ('sim_eventos'), ('sim_escrituras_v0'), ('sim_escrituras_v0_marcas'), ('sim_servicio'),
                           ('sim_sessions'), ('sim_trades'), ('session_drawings'), ('session_chart_config'), ('sim_drawing_templates'), ('user_chart_config'), ('user_tool_config')) r(t)
                   left join pg_catalog.pg_class c on c.oid OPERATOR(pg_catalog.=) pg_catalog.to_regclass('public.' OPERATOR(pg_catalog.||) r.t)
            union all
            select 'columna', c.relname OPERATOR(pg_catalog.||) '.' OPERATOR(pg_catalog.||) a.attname OPERATOR(pg_catalog.||) '|' OPERATOR(pg_catalog.||)
                   -- RINV-02: el tipo con su esquema, sin quitarlo (un dominio public.text no pasa por text)
                   'tipo=' OPERATOR(pg_catalog.||) pg_catalog.format_type(a.atttypid, a.atttypmod) OPERATOR(pg_catalog.||) ' · tipo_esquema=' OPERATOR(pg_catalog.||) tn.nspname::pg_catalog.text
                   OPERATOR(pg_catalog.||) ' · notnull=' OPERATOR(pg_catalog.||) a.attnotnull::pg_catalog.text
                   OPERATOR(pg_catalog.||) ' · identity=' OPERATOR(pg_catalog.||) coalesce(case when a.attidentity::pg_catalog.text OPERATOR(pg_catalog.=) '' then null else a.attidentity::pg_catalog.text end, '-')
                   OPERATOR(pg_catalog.||) ' · generated=' OPERATOR(pg_catalog.||) coalesce(case when a.attgenerated::pg_catalog.text OPERATOR(pg_catalog.=) '' then null else a.attgenerated::pg_catalog.text end, '-')
                   -- RINV2-02: «por defecto» solo la predeterminada (oid 100); cualquier otra, con esquema, proveedor, determinista y locale
                   OPERATOR(pg_catalog.||) ' · colacion=' OPERATOR(pg_catalog.||) case when a.attcollation OPERATOR(pg_catalog.=) 0 then '-' when a.attcollation OPERATOR(pg_catalog.=) 100 then 'por defecto'
                                             else coalesce((select pg_catalog.concat(cn.nspname, '.', co.collname, ' · proveedor=', co.collprovider::pg_catalog.text, ' · determinista=', co.collisdeterministic::pg_catalog.text,
                                                                                     ' · locale=', coalesce(co.collcollate, co.colllocale, '-'))
                                                              from pg_catalog.pg_collation co join pg_catalog.pg_namespace cn on cn.oid OPERATOR(pg_catalog.=) co.collnamespace where co.oid OPERATOR(pg_catalog.=) a.attcollation), 'NO EXISTE') end
                   OPERATOR(pg_catalog.||) ' · defecto=' OPERATOR(pg_catalog.||) coalesce(pg_catalog.pg_get_expr(d.adbin, d.adrelid), '-')
              from pg_catalog.pg_class c join pg_catalog.pg_attribute a on a.attrelid OPERATOR(pg_catalog.=) c.oid and a.attnum OPERATOR(pg_catalog.>) 0 and not a.attisdropped
                   join pg_catalog.pg_type ty on ty.oid OPERATOR(pg_catalog.=) a.atttypid join pg_catalog.pg_namespace tn on tn.oid OPERATOR(pg_catalog.=) ty.typnamespace
                   left join pg_catalog.pg_attrdef d on d.adrelid OPERATOR(pg_catalog.=) a.attrelid and d.adnum OPERATOR(pg_catalog.=) a.attnum
             where c.relnamespace OPERATOR(pg_catalog.=) 'public'::pg_catalog.regnamespace and c.relname OPERATOR(pg_catalog.=) any (array['sim_alumnos', 'sim_arrendamientos', 'sim_recibos', 'sim_eventos', 'sim_escrituras_v0', 'sim_escrituras_v0_marcas', 'sim_servicio',
                           'sim_sessions', 'sim_trades', 'session_drawings', 'session_chart_config', 'sim_drawing_templates', 'user_chart_config', 'user_tool_config']::pg_catalog.name[]) and c.relkind OPERATOR(pg_catalog.=) 'r'
            union all
            select 'restriccion', c.relname OPERATOR(pg_catalog.||) '.' OPERATOR(pg_catalog.||) k.conname OPERATOR(pg_catalog.||) '|' OPERATOR(pg_catalog.||)
                   case when ((c.relname OPERATOR(pg_catalog.=) 'sim_sessions' and k.conname OPERATOR(pg_catalog.=) 'sim_sessions_terminal_valida') or (c.relname OPERATOR(pg_catalog.=) 'sim_eventos' and k.conname OPERATOR(pg_catalog.=) 'sim_eventos_tipo_check'))
                        then k.contype::pg_catalog.text OPERATOR(pg_catalog.||) ' · (la de sim-004b, segun su estado)'
                        else k.contype::pg_catalog.text OPERATOR(pg_catalog.||) ' · ' OPERATOR(pg_catalog.||) pg_catalog.pg_get_constraintdef(k.oid)
                             OPERATOR(pg_catalog.||) ' · validada=' OPERATOR(pg_catalog.||) k.convalidated::pg_catalog.text OPERATOR(pg_catalog.||) ' · diferible=' OPERATOR(pg_catalog.||) k.condeferrable::pg_catalog.text OPERATOR(pg_catalog.||) '/' OPERATOR(pg_catalog.||) k.condeferred::pg_catalog.text end
              from pg_catalog.pg_class c join pg_catalog.pg_constraint k on k.conrelid OPERATOR(pg_catalog.=) c.oid
             where c.relnamespace OPERATOR(pg_catalog.=) 'public'::pg_catalog.regnamespace and c.relname OPERATOR(pg_catalog.=) any (array['sim_alumnos', 'sim_arrendamientos', 'sim_recibos', 'sim_eventos', 'sim_escrituras_v0', 'sim_escrituras_v0_marcas', 'sim_servicio',
                           'sim_sessions', 'sim_trades', 'session_drawings', 'session_chart_config', 'sim_drawing_templates', 'user_chart_config', 'user_tool_config']::pg_catalog.name[])
            union all
            -- E3R3-04 (Astra r3): ademas de la definicion, el estado operativo (unico, valido, listo y vivo)
            select 'indice', c.relname OPERATOR(pg_catalog.||) '.' OPERATOR(pg_catalog.||) ic.relname OPERATOR(pg_catalog.||) '|' OPERATOR(pg_catalog.||) pg_catalog.pg_get_indexdef(x.indexrelid)
                   OPERATOR(pg_catalog.||) ' · unico=' OPERATOR(pg_catalog.||) x.indisunique::pg_catalog.text OPERATOR(pg_catalog.||) ' · valido=' OPERATOR(pg_catalog.||) x.indisvalid::pg_catalog.text OPERATOR(pg_catalog.||) ' · listo=' OPERATOR(pg_catalog.||) x.indisready::pg_catalog.text OPERATOR(pg_catalog.||) ' · vivo=' OPERATOR(pg_catalog.||) x.indislive::pg_catalog.text
              from pg_catalog.pg_class c join pg_catalog.pg_index x on x.indrelid OPERATOR(pg_catalog.=) c.oid join pg_catalog.pg_class ic on ic.oid OPERATOR(pg_catalog.=) x.indexrelid
             where c.relnamespace OPERATOR(pg_catalog.=) 'public'::pg_catalog.regnamespace and c.relname OPERATOR(pg_catalog.=) any (array['sim_alumnos', 'sim_arrendamientos', 'sim_recibos', 'sim_eventos', 'sim_escrituras_v0', 'sim_escrituras_v0_marcas', 'sim_servicio',
                           'sim_sessions', 'sim_trades', 'session_drawings', 'session_chart_config', 'sim_drawing_templates', 'user_chart_config', 'user_tool_config']::pg_catalog.name[])
            union all
            -- RINV-03: cada secuencia identity, con todos sus parametros y su dueño
            select 'identidad', c.relname OPERATOR(pg_catalog.||) '.' OPERATOR(pg_catalog.||) a.attname OPERATOR(pg_catalog.||) '|' OPERATOR(pg_catalog.||)
                   'tipo=' OPERATOR(pg_catalog.||) pg_catalog.format_type(s.seqtypid, null) OPERATOR(pg_catalog.||) ' · inicio=' OPERATOR(pg_catalog.||) s.seqstart OPERATOR(pg_catalog.||) ' · incremento=' OPERATOR(pg_catalog.||) s.seqincrement
                   OPERATOR(pg_catalog.||) ' · minimo=' OPERATOR(pg_catalog.||) s.seqmin OPERATOR(pg_catalog.||) ' · maximo=' OPERATOR(pg_catalog.||) s.seqmax OPERATOR(pg_catalog.||) ' · cache=' OPERATOR(pg_catalog.||) s.seqcache OPERATOR(pg_catalog.||) ' · ciclo=' OPERATOR(pg_catalog.||) s.seqcycle::pg_catalog.text
                   OPERATOR(pg_catalog.||) ' · dueño=' OPERATOR(pg_catalog.||) case when sc.relowner OPERATOR(pg_catalog.=) (select x.oid from pg_catalog.pg_roles x where x.rolname OPERATOR(pg_catalog.=) current_user) then 'ejecutor' else pg_catalog.pg_get_userbyid(sc.relowner)::pg_catalog.text end
              from pg_catalog.pg_class c join pg_catalog.pg_attribute a on a.attrelid OPERATOR(pg_catalog.=) c.oid and a.attnum OPERATOR(pg_catalog.>) 0 and not a.attisdropped and a.attidentity OPERATOR(pg_catalog.<>) ''
                   join pg_catalog.pg_depend dp on dp.refobjid OPERATOR(pg_catalog.=) c.oid and dp.refobjsubid OPERATOR(pg_catalog.=) a.attnum and dp.classid OPERATOR(pg_catalog.=) 'pg_catalog.pg_class'::pg_catalog.regclass and dp.deptype OPERATOR(pg_catalog.=) 'i'
                   join pg_catalog.pg_class sc on sc.oid OPERATOR(pg_catalog.=) dp.objid and sc.relkind OPERATOR(pg_catalog.=) 'S'
                   join pg_catalog.pg_sequence s on s.seqrelid OPERATOR(pg_catalog.=) sc.oid
             where c.relnamespace OPERATOR(pg_catalog.=) 'public'::pg_catalog.regnamespace and c.relname OPERATOR(pg_catalog.=) any (array['sim_alumnos', 'sim_arrendamientos', 'sim_recibos', 'sim_eventos', 'sim_escrituras_v0', 'sim_escrituras_v0_marcas', 'sim_servicio',
                           'sim_sessions', 'sim_trades', 'session_drawings', 'session_chart_config', 'sim_drawing_templates', 'user_chart_config', 'user_tool_config']::pg_catalog.name[])
            union all
            -- RINV2-01 y RINV2-04: de que dependen, FUERA de pg_catalog, los valores por defecto, las restricciones y los indices
            -- (por pg_depend: no depende del texto ni del search_path; un public.now() o un public.length() salen aqui). La s16d
            select 'ajeno', o.nombre OPERATOR(pg_catalog.||) '|' OPERATOR(pg_catalog.||) pg_catalog.pg_describe_object(dp.refclassid, dp.refobjid, 0)
              from (select 'pg_catalog.pg_attrdef'::pg_catalog.regclass clase, d.oid, c.relname OPERATOR(pg_catalog.||) '.' OPERATOR(pg_catalog.||) a.attname OPERATOR(pg_catalog.||) ' (defecto)' nombre
                      from pg_catalog.pg_class c join pg_catalog.pg_attrdef d on d.adrelid OPERATOR(pg_catalog.=) c.oid join pg_catalog.pg_attribute a on a.attrelid OPERATOR(pg_catalog.=) d.adrelid and a.attnum OPERATOR(pg_catalog.=) d.adnum
                     where c.relnamespace OPERATOR(pg_catalog.=) 'public'::pg_catalog.regnamespace and c.relname OPERATOR(pg_catalog.=) any (array['sim_alumnos', 'sim_arrendamientos', 'sim_recibos', 'sim_eventos', 'sim_escrituras_v0', 'sim_escrituras_v0_marcas', 'sim_servicio',
                           'sim_sessions', 'sim_trades', 'session_drawings', 'session_chart_config', 'sim_drawing_templates', 'user_chart_config', 'user_tool_config']::pg_catalog.name[])
                    union all
                    select 'pg_catalog.pg_constraint'::pg_catalog.regclass, k.oid, c.relname OPERATOR(pg_catalog.||) '.' OPERATOR(pg_catalog.||) k.conname OPERATOR(pg_catalog.||) ' (restriccion)'
                      from pg_catalog.pg_class c join pg_catalog.pg_constraint k on k.conrelid OPERATOR(pg_catalog.=) c.oid
                     where c.relnamespace OPERATOR(pg_catalog.=) 'public'::pg_catalog.regnamespace and c.relname OPERATOR(pg_catalog.=) any (array['sim_alumnos', 'sim_arrendamientos', 'sim_recibos', 'sim_eventos', 'sim_escrituras_v0', 'sim_escrituras_v0_marcas', 'sim_servicio',
                           'sim_sessions', 'sim_trades', 'session_drawings', 'session_chart_config', 'sim_drawing_templates', 'user_chart_config', 'user_tool_config']::pg_catalog.name[])
                    union all
                    select 'pg_catalog.pg_class'::pg_catalog.regclass, x.indexrelid, c.relname OPERATOR(pg_catalog.||) '.' OPERATOR(pg_catalog.||) ic.relname OPERATOR(pg_catalog.||) ' (indice)'
                      from pg_catalog.pg_class c join pg_catalog.pg_index x on x.indrelid OPERATOR(pg_catalog.=) c.oid join pg_catalog.pg_class ic on ic.oid OPERATOR(pg_catalog.=) x.indexrelid
                     where c.relnamespace OPERATOR(pg_catalog.=) 'public'::pg_catalog.regnamespace and c.relname OPERATOR(pg_catalog.=) any (array['sim_alumnos', 'sim_arrendamientos', 'sim_recibos', 'sim_eventos', 'sim_escrituras_v0', 'sim_escrituras_v0_marcas', 'sim_servicio',
                           'sim_sessions', 'sim_trades', 'session_drawings', 'session_chart_config', 'sim_drawing_templates', 'user_chart_config', 'user_tool_config']::pg_catalog.name[])) o
                   join pg_catalog.pg_depend dp on dp.classid OPERATOR(pg_catalog.=) o.clase and dp.objid OPERATOR(pg_catalog.=) o.oid
             where (dp.refclassid OPERATOR(pg_catalog.=) 'pg_catalog.pg_proc'::pg_catalog.regclass and (select p.pronamespace from pg_catalog.pg_proc p where p.oid OPERATOR(pg_catalog.=) dp.refobjid) OPERATOR(pg_catalog.<>) 'pg_catalog'::pg_catalog.regnamespace)
                or (dp.refclassid OPERATOR(pg_catalog.=) 'pg_catalog.pg_operator'::pg_catalog.regclass and (select p.oprnamespace from pg_catalog.pg_operator p where p.oid OPERATOR(pg_catalog.=) dp.refobjid) OPERATOR(pg_catalog.<>) 'pg_catalog'::pg_catalog.regnamespace)
                or (dp.refclassid OPERATOR(pg_catalog.=) 'pg_catalog.pg_type'::pg_catalog.regclass and (select p.typnamespace from pg_catalog.pg_type p where p.oid OPERATOR(pg_catalog.=) dp.refobjid) OPERATOR(pg_catalog.<>) 'pg_catalog'::pg_catalog.regnamespace)
                or (dp.refclassid OPERATOR(pg_catalog.=) 'pg_catalog.pg_collation'::pg_catalog.regclass and (select p.collnamespace from pg_catalog.pg_collation p where p.oid OPERATOR(pg_catalog.=) dp.refobjid) OPERATOR(pg_catalog.<>) 'pg_catalog'::pg_catalog.regnamespace)
            union all
            select 'regla', c.relname OPERATOR(pg_catalog.||) '.' OPERATOR(pg_catalog.||) w.rulename OPERATOR(pg_catalog.||) '|' OPERATOR(pg_catalog.||) pg_catalog.pg_get_ruledef(w.oid)
              from pg_catalog.pg_class c join pg_catalog.pg_rewrite w on w.ev_class OPERATOR(pg_catalog.=) c.oid
             where c.relnamespace OPERATOR(pg_catalog.=) 'public'::pg_catalog.regnamespace and c.relname OPERATOR(pg_catalog.=) any (array['sim_alumnos', 'sim_arrendamientos', 'sim_recibos', 'sim_eventos', 'sim_escrituras_v0', 'sim_escrituras_v0_marcas', 'sim_servicio',
                           'sim_sessions', 'sim_trades', 'session_drawings', 'session_chart_config', 'sim_drawing_templates', 'user_chart_config', 'user_tool_config']::pg_catalog.name[])
            union all
            select 'politica', p.tablename OPERATOR(pg_catalog.||) '.' OPERATOR(pg_catalog.||) p.policyname OPERATOR(pg_catalog.||) '|' OPERATOR(pg_catalog.||)
                   p.permissive OPERATOR(pg_catalog.||) ' · ' OPERATOR(pg_catalog.||) p.cmd OPERATOR(pg_catalog.||) ' · ' OPERATOR(pg_catalog.||) p.roles::pg_catalog.text OPERATOR(pg_catalog.||) ' · using=' OPERATOR(pg_catalog.||) coalesce(p.qual, '-')
                   OPERATOR(pg_catalog.||) ' · check=' OPERATOR(pg_catalog.||) coalesce(p.with_check, '-')
              from pg_catalog.pg_policies p where p.schemaname OPERATOR(pg_catalog.=) 'public' and p.tablename OPERATOR(pg_catalog.=) any (array['sim_drawing_templates', 'user_chart_config', 'user_tool_config']::pg_catalog.name[])
            union all
            -- E3R3-01 (Astra r3): TODAS las funciones con esos nombres en esos esquemas (las RPC las llaman calificadas,
            -- extensions.digest(...), y una sobrecarga de mas en el mismo esquema hace ambigua la llamada: 42725)
            select 'sobrecarga', n.nspname::pg_catalog.text OPERATOR(pg_catalog.||) '.' OPERATOR(pg_catalog.||) p.proname::pg_catalog.text OPERATOR(pg_catalog.||) '(' OPERATOR(pg_catalog.||) pg_catalog.pg_get_function_identity_arguments(p.oid) OPERATOR(pg_catalog.||) ')'
              from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid OPERATOR(pg_catalog.=) p.pronamespace
             where ((n.nspname OPERATOR(pg_catalog.=) 'extensions' and p.proname OPERATOR(pg_catalog.=) 'digest') or (n.nspname OPERATOR(pg_catalog.=) 'extensions' and p.proname OPERATOR(pg_catalog.=) 'gen_random_bytes') or (n.nspname OPERATOR(pg_catalog.=) 'auth' and p.proname OPERATOR(pg_catalog.=) 'uid'))
            union all
            -- E3R3-02 (Astra r3): el permiso EFECTIVO de EXECUTE de quien las usa: el dueño de las RPC (definer) las tres,
            -- y authenticated auth.uid() (las politicas de RLS). Lo medido, no la ACL textual
            select 'permiso', f.firma OPERATOR(pg_catalog.||) '|dueño_rpc=' OPERATOR(pg_catalog.||) coalesce(pg_catalog.has_function_privilege(r.proowner, p.oid, 'EXECUTE')::pg_catalog.text, 'NO EXISTE')
                   OPERATOR(pg_catalog.||) case when f.firma OPERATOR(pg_catalog.=) 'auth.uid()' then ' · authenticated=' OPERATOR(pg_catalog.||) coalesce(pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')::pg_catalog.text, 'NO EXISTE') else '' end
              from (values ('extensions.digest(bytea,text)'), ('extensions.gen_random_bytes(integer)'), ('auth.uid()')) f(firma)
                   left join pg_catalog.pg_proc p on p.oid OPERATOR(pg_catalog.=) pg_catalog.to_regprocedure(f.firma)
                   left join pg_catalog.pg_proc r on r.oid OPERATOR(pg_catalog.=) pg_catalog.to_regprocedure('public.sim_crear_sesion(uuid,uuid,uuid,text,integer,jsonb,jsonb,jsonb,jsonb)')
            union all
            -- RE3-02 y RE3-03 (revisor interno de c4d46e3): el permiso EFECTIVO del dueño de las RPC sobre lo que usan sus
            -- cuerpos: los siete privilegios en las 14 tablas y EXECUTE en las funciones sim_* de public (un REVOKE a si
            -- mismo las deja en 42501)
            select 'permiso', 'tabla:' OPERATOR(pg_catalog.||) c.relname OPERATOR(pg_catalog.||) '|dueño_rpc=' OPERATOR(pg_catalog.||) coalesce((select pg_catalog.string_agg(pr.p, ',' order by pr.n) from (values ('SELECT', 1), ('INSERT', 2), ('UPDATE', 3), ('DELETE', 4), ('TRUNCATE', 5), ('REFERENCES', 6), ('TRIGGER', 7)) pr(p, n)
                                                                                  where pg_catalog.has_table_privilege(r.proowner, c.oid, pr.p)), '-')
              from pg_catalog.pg_class c
                   left join pg_catalog.pg_proc r on r.oid OPERATOR(pg_catalog.=) pg_catalog.to_regprocedure('public.sim_crear_sesion(uuid,uuid,uuid,text,integer,jsonb,jsonb,jsonb,jsonb)')
             where c.relnamespace OPERATOR(pg_catalog.=) 'public'::pg_catalog.regnamespace and c.relname OPERATOR(pg_catalog.=) any (array['sim_alumnos', 'sim_arrendamientos', 'sim_recibos', 'sim_eventos', 'sim_escrituras_v0', 'sim_escrituras_v0_marcas', 'sim_servicio',
                           'sim_sessions', 'sim_trades', 'session_drawings', 'session_chart_config', 'sim_drawing_templates', 'user_chart_config', 'user_tool_config']::pg_catalog.name[]) and c.relkind OPERATOR(pg_catalog.=) 'r'
            union all
            select 'permiso', 'funcion:' OPERATOR(pg_catalog.||) p.oid::pg_catalog.regprocedure::pg_catalog.text OPERATOR(pg_catalog.||) '|dueño_rpc=' OPERATOR(pg_catalog.||) coalesce(pg_catalog.has_function_privilege(r.proowner, p.oid, 'EXECUTE')::pg_catalog.text, 'NO EXISTE')
              from pg_catalog.pg_proc p
                   left join pg_catalog.pg_proc r on r.oid OPERATOR(pg_catalog.=) pg_catalog.to_regprocedure('public.sim_crear_sesion(uuid,uuid,uuid,text,integer,jsonb,jsonb,jsonb,jsonb)')
             where p.pronamespace OPERATOR(pg_catalog.=) 'public'::pg_catalog.regnamespace and (p.proname OPERATOR(pg_catalog.~~) 'sim\_%' or p.proname OPERATOR(pg_catalog.=) 'enforce_sim_session_limit')
               and p.proname OPERATOR(pg_catalog.<>) 'sim_escrituras_v0_puerta'  -- la de la puerta (estado 2) es de disparador: no se llama
            union all
            -- R3E3B-02 (CTO 17-oct): las tres funciones ajenas que llaman los cuerpos, con la ficha de la s16b
            select 'funcion_ajena', f.firma OPERATOR(pg_catalog.||) '|' OPERATOR(pg_catalog.||)
                   case when p.oid is null then 'NO EXISTE' else
                     'functiondef md5=' OPERATOR(pg_catalog.||) pg_catalog.md5(pg_catalog.pg_get_functiondef(p.oid))
                     OPERATOR(pg_catalog.||) ' · prosrc md5=' OPERATOR(pg_catalog.||) pg_catalog.md5(coalesce(p.prosrc, '')) OPERATOR(pg_catalog.||) ' · probin=' OPERATOR(pg_catalog.||) coalesce(p.probin, '-')
                     OPERATOR(pg_catalog.||) ' · lenguaje=' OPERATOR(pg_catalog.||) l.lanname OPERATOR(pg_catalog.||) ' · dueño=' OPERATOR(pg_catalog.||) pg_catalog.pg_get_userbyid(p.proowner)
                     OPERATOR(pg_catalog.||) ' · prosecdef=' OPERATOR(pg_catalog.||) p.prosecdef::pg_catalog.text OPERATOR(pg_catalog.||) ' · provolatile=' OPERATOR(pg_catalog.||) p.provolatile::pg_catalog.text OPERATOR(pg_catalog.||) ' · proconfig=' OPERATOR(pg_catalog.||) coalesce(p.proconfig::pg_catalog.text, '-')
                     OPERATOR(pg_catalog.||) ' · proisstrict=' OPERATOR(pg_catalog.||) p.proisstrict::pg_catalog.text OPERATOR(pg_catalog.||) ' · proleakproof=' OPERATOR(pg_catalog.||) p.proleakproof::pg_catalog.text OPERATOR(pg_catalog.||) ' · proparallel=' OPERATOR(pg_catalog.||) p.proparallel::pg_catalog.text
                     OPERATOR(pg_catalog.||) ' · prokind=' OPERATOR(pg_catalog.||) p.prokind::pg_catalog.text OPERATOR(pg_catalog.||) ' · proretset=' OPERATOR(pg_catalog.||) p.proretset::pg_catalog.text OPERATOR(pg_catalog.||) ' · prorettype=' OPERATOR(pg_catalog.||) pg_catalog.format_type(p.prorettype, null)
                     OPERATOR(pg_catalog.||) ' · proargmodes=' OPERATOR(pg_catalog.||) coalesce(p.proargmodes::pg_catalog.text, '-') OPERATOR(pg_catalog.||) ' · proargnames=' OPERATOR(pg_catalog.||) coalesce(p.proargnames::pg_catalog.text, '-')
                     OPERATOR(pg_catalog.||) ' · pronargdefaults=' OPERATOR(pg_catalog.||) p.pronargdefaults::pg_catalog.text OPERATOR(pg_catalog.||) ' · procost=' OPERATOR(pg_catalog.||) p.procost::pg_catalog.text OPERATOR(pg_catalog.||) ' · prorows=' OPERATOR(pg_catalog.||) p.prorows::pg_catalog.text end
              from (values ('extensions.digest(bytea,text)'), ('extensions.gen_random_bytes(integer)'), ('auth.uid()')) f(firma)
                   left join pg_catalog.pg_proc p on p.oid OPERATOR(pg_catalog.=) pg_catalog.to_regprocedure(f.firma) left join pg_catalog.pg_language l on l.oid OPERATOR(pg_catalog.=) p.prolang
          ) x
        ),
        esp_f(esquemas, familia, n, h) as (values
          ('{}', 'ajeno', 0, 'd41d8cd98f00b204e9800998ecf8427e'),
          ('{}', 'columna', 135, '9610bdfa6bce4ff3b95a3d4fafd743b0'),
          ('{}', 'identidad', 4, '472c2271705ab4440fba7bbe0c61ed04'),
          ('{}', 'indice', 31, '79cdc8554026972e2802601707a99bd1'),
          ('{}', 'permiso', 39, '25fc63d1d9d6b85da7fc125969fc6144'),
          ('{}', 'politica', 3, 'ae70c7a2dca8be8f6aa6c6eae4d9754f'),
          ('{}', 'regla', 0, 'd41d8cd98f00b204e9800998ecf8427e'),
          ('{}', 'restriccion', 59, '4f9d1a1af4e93723672d6bba7ae10829'),
          ('{}', 'sobrecarga', 4, 'df3ad2088d0f399ac318d9e1346413b4'),
          ('{}', 'tabla', 14, 'a9b56cc77c3da41b455e0250b489e0aa'),
          ('{public,extensions}', 'ajeno', 0, 'd41d8cd98f00b204e9800998ecf8427e'),
          ('{public,extensions}', 'columna', 135, '9610bdfa6bce4ff3b95a3d4fafd743b0'),
          ('{public,extensions}', 'identidad', 4, '472c2271705ab4440fba7bbe0c61ed04'),
          ('{public,extensions}', 'indice', 31, '79cdc8554026972e2802601707a99bd1'),
          ('{public,extensions}', 'permiso', 39, '6a3ba7f0b9e33c9e43e91aacd6eeaf3b'),
          ('{public,extensions}', 'politica', 3, 'ae70c7a2dca8be8f6aa6c6eae4d9754f'),
          ('{public,extensions}', 'regla', 0, 'd41d8cd98f00b204e9800998ecf8427e'),
          ('{public,extensions}', 'restriccion', 59, '8c1bcac993492ca83039e80ec6168d01'),
          ('{public,extensions}', 'sobrecarga', 4, 'df3ad2088d0f399ac318d9e1346413b4'),
          ('{public,extensions}', 'tabla', 14, 'a9b56cc77c3da41b455e0250b489e0aa')),
        esp_a(firma, ficha) as (values
          ('auth.uid()', 'functiondef md5=ea3b41bf29e2ad573067939329aa088e · prosrc md5=cdef18c69c4f4cbbced2eaf81e628b49 · probin=- · lenguaje=sql · dueño=supabase_auth_admin · prosecdef=false · provolatile=s · proconfig=- · proisstrict=false · proleakproof=false · proparallel=u · prokind=f · proretset=false · prorettype=uuid · proargmodes=- · proargnames=- · pronargdefaults=0 · procost=100 · prorows=0'),
          ('extensions.digest(bytea,text)', 'functiondef md5=85b88685f74a398b1ff164ad33eeaaca · prosrc md5=926ba3fbdb45dc078b3e3cafddc392cc · probin=$libdir/pgcrypto · lenguaje=c · dueño=postgres · prosecdef=false · provolatile=i · proconfig=- · proisstrict=true · proleakproof=false · proparallel=s · prokind=f · proretset=false · prorettype=bytea · proargmodes=- · proargnames=- · pronargdefaults=0 · procost=1 · prorows=0'),
          ('extensions.gen_random_bytes(integer)', 'functiondef md5=a7569a34c9be929beb24ef5670d42636 · prosrc md5=393a992bef3cadec88b224bd3dace51c · probin=$libdir/pgcrypto · lenguaje=c · dueño=postgres · prosecdef=false · provolatile=v · proconfig=- · proisstrict=true · proleakproof=false · proparallel=s · prokind=f · proretset=false · prorettype=bytea · proargmodes=- · proargnames=- · pronargdefaults=0 · procost=1 · prorows=0')),
        med_f as (select i.familia, pg_catalog.count(*)::pg_catalog.int4 n, pg_catalog.md5(pg_catalog.string_agg(i.fila, E'\n' order by i.fila collate pg_catalog."C")) h from inv i where i.familia OPERATOR(pg_catalog.<>) 'funcion_ajena' group by i.familia),
        med_a as (select pg_catalog.split_part(i.fila, '|', 1) firma, pg_catalog.substr(i.fila, pg_catalog.strpos(i.fila, '|') OPERATOR(pg_catalog.+) 1) ficha from inv i where i.familia OPERATOR(pg_catalog.=) 'funcion_ajena')
        select 'inventario'::pg_catalog.text familia, e.familia objeto,
               'n=' OPERATOR(pg_catalog.||) coalesce(m.n, 0) OPERATOR(pg_catalog.||) ' md5=' OPERATOR(pg_catalog.||) coalesce(m.h, pg_catalog.md5(''))
               OPERATOR(pg_catalog.||) case when coalesce(m.n, 0) OPERATOR(pg_catalog.=) e.n and coalesce(m.h, pg_catalog.md5('')) OPERATOR(pg_catalog.=) e.h then ''
                       else ' (sim-004b espera n=' OPERATOR(pg_catalog.||) e.n OPERATOR(pg_catalog.||) ' md5=' OPERATOR(pg_catalog.||) e.h OPERATOR(pg_catalog.||) ' con esquemas=' OPERATOR(pg_catalog.||) e.esquemas OPERATOR(pg_catalog.||) '; que fila: medirlo aparte)' end detalle,
               coalesce(m.n, 0) OPERATOR(pg_catalog.=) e.n and coalesce(m.h, pg_catalog.md5('')) OPERATOR(pg_catalog.=) e.h bien
          from esp_f e left join med_f m on m.familia OPERATOR(pg_catalog.=) e.familia
         where e.esquemas OPERATOR(pg_catalog.=) pg_catalog.current_schemas(false)::pg_catalog.text
        union all
        select 'inventario', 'search_path', 'esquemas=' OPERATOR(pg_catalog.||) pg_catalog.current_schemas(false)::pg_catalog.text
               OPERATOR(pg_catalog.||) ' (sin valores esperados: solo {} en sim-004b y {public,extensions}, el del editor, en la s16)', false
         where not exists (select 1 from esp_f e where e.esquemas OPERATOR(pg_catalog.=) pg_catalog.current_schemas(false)::pg_catalog.text)
        union all
        select 'funcion_ajena', coalesce(e.firma, m.firma),
               coalesce(m.ficha, 'NO EXISTE') OPERATOR(pg_catalog.||) case when not coalesce(m.ficha OPERATOR(pg_catalog.=) e.ficha, m.ficha is null and e.ficha is null) then ' (sim-004b espera ' OPERATOR(pg_catalog.||) e.ficha OPERATOR(pg_catalog.||) ')' else '' end,
               coalesce(m.ficha OPERATOR(pg_catalog.=) e.ficha, m.ficha is null and e.ficha is null)
          from esp_a e left join med_a m on m.firma OPERATOR(pg_catalog.=) e.firma
      ) v
      -- <<< inventario
    ) i;
  -- 3 los disparadores internos de las 14 tablas y los de sus FK en la otra tabla (profiles, auth.users), con el
  -- search_path vacio: el mismo alcance y la misma expresion que sim-004b (4.5) para los internos
  select string_agg('s16f | disparador | ' || x, E'\n' order by x collate "C") into v_trg from (
    select c.oid::regclass::text || '|' || 'fk:' || k.conname || '|' || t.tgfoid::regprocedure::text
           || ' · when=' || case when t.tgqual is null then 'no' else 'SI' end || ' · args=' || t.tgnargs || ':' || encode(t.tgargs, 'hex')
           || ' · ref=' || case when t.tgconstrrelid = 0 then '-' else t.tgconstrrelid::regclass::text end
           || ' · indice=' || case when t.tgconstrindid = 0 then '-' else t.tgconstrindid::regclass::text end
           || ' · diferible=' || t.tgdeferrable::text || '/' || t.tginitdeferred::text || ' · columnas=' || t.tgattr::text
           || '|' || t.tgtype || '|' || t.tgenabled::text as x
      from pg_catalog.pg_trigger t join pg_catalog.pg_class c on c.oid = t.tgrelid join pg_catalog.pg_constraint k on k.oid = t.tgconstraint
     where t.tgisinternal and (t.tgrelid = any (v_tablas) or (k.contype = 'f' and k.conrelid = any (v_tablas)))) s;
  perform pg_catalog.set_config('search_path', v_sp, true);
  -- 4 RE3-01 (CTO 17-oct, orden 1-010): session_replication_role y row_security, efectivos y donde estan fijados en
  -- pg_db_role_setting, SOLO por nombre (la misma expresion que la s16 y sim-004b; ningun valor se lee ni se imprime)
  select string_agg('s16f | ajuste | ' || a.detalle, E'\n' order by a.nombre) into v_aj from (
  select g.nombre, pg_catalog.current_setting(g.nombre) = g.esperado efectivo_bien, f.donde,
           g.nombre || ': efectivo ' || g.esperado || '=' || (pg_catalog.current_setting(g.nombre) = g.esperado)::text
           || ' · fijado en pg_db_role_setting: ' || coalesce(f.donde, 'ninguno') detalle
      from (values ('session_replication_role', 'origin'), ('row_security', 'on')) g(nombre, esperado)
           left join (select split_part(c.x, '=', 1) nombre,
             string_agg(case when s.setrole = 0 then 'base' else 'rol ' || r.rolname::text end
                        || case when s.setdatabase = 0 then ' (en todas las bases)' else '' end, ', '
                        order by case when s.setrole = 0 then 'base' else 'rol ' || r.rolname::text end) donde
        from pg_catalog.pg_db_role_setting s left join pg_catalog.pg_roles r on r.oid = s.setrole
             cross join lateral unnest(s.setconfig) c(x)
       where (s.setdatabase = 0 or s.setdatabase = (select d.oid from pg_catalog.pg_database d where d.datname = pg_catalog.current_database()))
         and (s.setrole = 0 or r.rolname in ('postgres', 'authenticator', 'authenticated', 'anon', 'service_role') or r.rolname = current_user)
         and split_part(c.x, '=', 1) in ('session_replication_role', 'row_security')
       group by 1) f on f.nombre = g.nombre
  ) a;
  raise exception using message = E'informe s16f (no es un fallo)\n'
    || 's16f | search_path | ' || v_sp || E'\n' || v_ed || E'\n' || v_vacio || E'\n' || coalesce(v_trg, 's16f | disparador | NINGUNO') || E'\n' || v_aj || E'\nFIN | s16f | consulta';
end
$s16f$;
