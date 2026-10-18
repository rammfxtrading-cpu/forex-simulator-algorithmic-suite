-- ============================================================================
-- CONSULTA DE SOLO LECTURA · S16h · las pertenencias de anon y authenticated (con sus opciones) y los privilegios
-- efectivos del dueño de las RPC en public.profiles (etapa 3, ronda 5; CTO 18-oct, orden 1-013; Astra E3R4-01/02)
--
-- Mide en produccion lo que exigen los dos requisitos nuevos de la s16 y de sim-004b, para acreditarlos antes de
-- aplicarlos: que anon y authenticated no pertenecen (directa o en cadena, con SET o con INHERIT) a ningun rol
-- privilegiado, y que el dueño de las RPC tiene en profiles lo que necesitan sus cuerpos. Trae:
--   1 miembro     cada concesion directa A → R (A anon o authenticated): admin, inherit, set y quien la concedio
--   2 alcanza     cada rol privilegiado que anon o authenticated alcanzan por pertenencia (lo esperado: ninguno)
--   3 profiles    el dueño de las RPC: SELECT de id, plan y simulador_activo; UPDATE en alguna columna; y en la tabla
--   4 resumen
--
-- NO cambia nada: una sola SELECT, precedida de SET LOCAL search_path (se deshace con el ROLLBACK), sin escrituras ni
-- EXECUTE ni set_config, DENTRO de una transaccion READ ONLY real
-- (regla del LEEME del buzon, 18-oct: BEGIN READ ONLY al principio y ROLLBACK al final). Si se pega por partes, o el
-- editor la ejecuta fuera de esa transaccion, la guarda la hace fallar cerrada con el mensaje «s16h: pegala ENTERA…»,
-- sin dar datos. Solo catalogo y funciones de privilegio: ningun dato de alumnos. Ensayada (pruebas/s16h-…mjs). Ramon la
-- pega ENTERA como postgres en el editor SQL de Supabase cuando el CTO la pida. Acaba en «FIN | s16h | consulta».
-- F8 (bateria de familias, informe 1-036; orden 1-041): pegada sin su BEGIN, el SET LOCAL no hace nada, y un =
-- homonimo con RESTRICT = eqsel se ejecutaba al PLANIFICAR, antes de la guarda. Ahora todo el cuerpo va calificado con
-- pg_catalog (operadores, IN → = any (array[…]), NOT IN → <> all, LIKE → ~~, IS DISTINCT FROM → coalesce, funciones,
-- conversiones, catalogos), como la s16 (GR1-02): no depende del SET LOCAL. Mismo pg_get_viewdef que la de a6bb3a5.
-- ============================================================================
begin read only;
-- S10RO-01: lo primero, el search_path de pg_catalog (LEEME): nada de la consulta resuelve en otro esquema por su nombre
set local search_path = pg_catalog, pg_temp;
with
-- la guarda: falla cerrada si no estamos dentro de la transaccion READ ONLY
guarda as (select case when pg_catalog.current_setting('transaction_read_only') OPERATOR(pg_catalog.=) 'on' then true
                       -- el texto depende de un valor de ejecucion: si fuera constante, PostgreSQL lo convertiria al
                       -- planificar y la guarda saltaria siempre. S10RO-01 (Astra; LEEME «Guardas de las consultas:
                       -- calificadas»): operadores y conversion de pg_catalog, para que un operador homonimo (= o ||)
                       -- en otro esquema del search_path no la haga pasar
                       else ('s16h: pegala ENTERA, con su BEGIN READ ONLY y su ROLLBACK (transaction_read_only='
                             OPERATOR(pg_catalog.||) pg_catalog.current_setting('transaction_read_only') OPERATOR(pg_catalog.||) ')')::pg_catalog.bool end ok),
dueno as (select p.proowner o from pg_catalog.pg_proc p where p.oid OPERATOR(pg_catalog.=) pg_catalog.to_regprocedure('public.sim_crear_sesion(uuid,uuid,uuid,text,integer,jsonb,jsonb,jsonb,jsonb)')),
alumno as (select r.oid, r.rolname from pg_catalog.pg_roles r where r.rolname OPERATOR(pg_catalog.=) any (array['anon', 'authenticated']::pg_catalog.name[])),
privilegiado as (
  select r.oid, r.rolname from pg_catalog.pg_roles r
   where r.rolname OPERATOR(pg_catalog.=) any (array['service_role', 'postgres']::pg_catalog.name[]) or r.rolsuper or r.rolbypassrls or r.oid OPERATOR(pg_catalog.=) any (select o from dueno)
      or r.oid OPERATOR(pg_catalog.=) any (select c.relowner from pg_catalog.pg_class c where c.oid OPERATOR(pg_catalog.=) any (select pg_catalog.to_regclass('public.' OPERATOR(pg_catalog.||) t) from pg_catalog.unnest(array['sim_alumnos', 'sim_arrendamientos', 'sim_recibos', 'sim_eventos', 'sim_escrituras_v0', 'sim_escrituras_v0_marcas', 'sim_servicio', 'sim_sessions', 'sim_trades', 'session_drawings', 'session_chart_config', 'sim_drawing_templates', 'user_chart_config', 'user_tool_config']) t))
      -- RE5-01 (revisor interno de 4c522cb): y los dueños de lo que usan los cuerpos fuera de las 14: profiles, auth.users
      -- y auth.uid() (un miembro con INHERIT del dueño de profiles actua como dueño: privilegios y RLS)
      or r.oid OPERATOR(pg_catalog.=) any (select c.relowner from pg_catalog.pg_class c where c.oid OPERATOR(pg_catalog.=) any (array[pg_catalog.to_regclass('public.profiles')::pg_catalog.oid, pg_catalog.to_regclass('auth.users')::pg_catalog.oid]))
      or r.oid OPERATOR(pg_catalog.=) (select f.proowner from pg_catalog.pg_proc f where f.oid OPERATOR(pg_catalog.=) pg_catalog.to_regprocedure('auth.uid()'))
      -- RE6-01 (revisor interno de 09492b0): y los dueños de los esquemas public, extensions y auth (el dueño de un esquema
      -- puede borrar y sustituir lo que hay dentro, p. ej. extensions.digest)
      or r.oid OPERATOR(pg_catalog.=) any (select n.nspowner from pg_catalog.pg_namespace n where n.nspname OPERATOR(pg_catalog.=) any (array['public', 'extensions', 'auth']::pg_catalog.name[]))),
filas as (
  select 1 o, 'miembro' seccion, a.rolname OPERATOR(pg_catalog.||) ' → ' OPERATOR(pg_catalog.||) g.rolname objeto,
         'admin=' OPERATOR(pg_catalog.||) m.admin_option::pg_catalog.text OPERATOR(pg_catalog.||) ' · inherit=' OPERATOR(pg_catalog.||) m.inherit_option::pg_catalog.text OPERATOR(pg_catalog.||) ' · set=' OPERATOR(pg_catalog.||) m.set_option::pg_catalog.text OPERATOR(pg_catalog.||) ' · concedido_por=' OPERATOR(pg_catalog.||) pg_catalog.pg_get_userbyid(m.grantor) detalle
    from pg_catalog.pg_auth_members m join alumno a on a.oid OPERATOR(pg_catalog.=) m.member join pg_catalog.pg_roles g on g.oid OPERATOR(pg_catalog.=) m.roleid
  union all
  -- E3R5-01 (Astra r5): tambien si el alumno ES el rol privilegiado (dueño directo), no solo miembro de otro
  select 2, 'alcanza', a.rolname OPERATOR(pg_catalog.||) ' → ' OPERATOR(pg_catalog.||) p.rolname, case when a.oid OPERATOR(pg_catalog.=) p.oid then 'ES el mismo rol (dueño directo)' else 'MEMBER (directa o en cadena, con SET o con INHERIT)' end
    from alumno a cross join privilegiado p where a.oid OPERATOR(pg_catalog.=) p.oid or pg_catalog.pg_has_role(a.oid, p.oid, 'MEMBER')
  union all
  select 3, 'profiles', 'dueño de las RPC (' OPERATOR(pg_catalog.||) coalesce((select pg_catalog.pg_get_userbyid(o) from dueno), 'NO EXISTE') OPERATOR(pg_catalog.||) ')',
         'SELECT id=' OPERATOR(pg_catalog.||) coalesce(pg_catalog.has_column_privilege((select o from dueno), 'public.profiles', 'id', 'SELECT')::pg_catalog.text, '-')
         OPERATOR(pg_catalog.||) ' plan=' OPERATOR(pg_catalog.||) coalesce(pg_catalog.has_column_privilege((select o from dueno), 'public.profiles', 'plan', 'SELECT')::pg_catalog.text, '-')
         OPERATOR(pg_catalog.||) ' simulador_activo=' OPERATOR(pg_catalog.||) coalesce(pg_catalog.has_column_privilege((select o from dueno), 'public.profiles', 'simulador_activo', 'SELECT')::pg_catalog.text, '-')
         OPERATOR(pg_catalog.||) ' · UPDATE en alguna columna=' OPERATOR(pg_catalog.||) coalesce(pg_catalog.has_any_column_privilege((select o from dueno), 'public.profiles', 'UPDATE')::pg_catalog.text, '-')
         OPERATOR(pg_catalog.||) ' · tabla SELECT=' OPERATOR(pg_catalog.||) coalesce(pg_catalog.has_table_privilege((select o from dueno), 'public.profiles', 'SELECT')::pg_catalog.text, '-')
         OPERATOR(pg_catalog.||) ' UPDATE=' OPERATOR(pg_catalog.||) coalesce(pg_catalog.has_table_privilege((select o from dueno), 'public.profiles', 'UPDATE')::pg_catalog.text, '-')
         OPERATOR(pg_catalog.||) ' · dueño de profiles=' OPERATOR(pg_catalog.||) pg_catalog.pg_get_userbyid((select c.relowner from pg_catalog.pg_class c where c.oid OPERATOR(pg_catalog.=) 'public.profiles'::pg_catalog.regclass)))
select seccion, objeto, detalle from (
  select o, seccion, objeto, detalle from filas
  union all
  select 4, 'resumen', 'recuentos', (select pg_catalog.count(*) from filas where seccion OPERATOR(pg_catalog.=) 'miembro')::pg_catalog.text OPERATOR(pg_catalog.||) ' concesiones directas · '
         OPERATOR(pg_catalog.||) (select pg_catalog.count(*) from filas where seccion OPERATOR(pg_catalog.=) 'alcanza')::pg_catalog.text OPERATOR(pg_catalog.||) ' roles privilegiados alcanzados'
  union all
  select 5, 'FIN', 's16h', 'consulta'
) x where (select g.ok from guarda g) order by o, objeto collate pg_catalog."C", detalle collate pg_catalog."C";
rollback;
