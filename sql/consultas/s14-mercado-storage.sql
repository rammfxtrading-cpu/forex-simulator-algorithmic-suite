-- ============================================================================
-- CONSULTA DE SOLO LECTURA · S14 · Storage y el bucket «mercado» (etapa 2)
--
-- Diseño revisiones/2026-10-12-diseno-sim-004-y-motor-v1.md, p.7–p.8: antes
-- de aplicar sql/mercado-001-bucket.sql (¿choca «mercado» con algo? ¿alguna
-- politica de storage.objects podria abrirlo?) y despues (¿quedo privado?
-- ¿que hay publicado?). Se pega como postgres en el editor SQL de Supabase.
--
-- NO cambia nada: UNA sola SELECT, sin escrituras ni EXECUTE. Nada que editar.
-- Ensayada dentro de una transaccion READ ONLY (pruebas/mercado-001-
-- bucket.mjs). Acaba en «FIN | s14 | consulta».
--
-- Nada personal: de los buckets ajenos solo cuentas y bytes, nunca nombres de
-- objetos. Del bucket mercado, solo agregados por par y la fecha del puntero.
-- Del texto de las politicas, los UUID y los correos salen como <uuid> y
-- <email>.
--
-- Que trae, por este orden:
--   1 bucket      cada bucket: publico, limite, tipos MIME, objetos y bytes
--   2 rls         storage.objects · rls=true|false
--   2 contexto    si la lista blanca se puede acreditar (E2R2-01): search_path
--                 que empieza por pg_catalog, ningun operador «=» ajeno que
--                 acepte texto, texteq, bucket_id text con la colacion por
--                 defecto. Si no: «NO ACREDITADO: …» y mercado-001 abortaria
--   1 cerrojo     public.mercado_cerrojo (E2R3-01, sql/mercado-000-cerrojo.sql):
--                 si existe, su RLS, politicas, disparadores, reglas, permisos
--                 directos y EFECTIVOS (E2R4-01: con herencia y pertenencias,
--                 la misma regla que la guarda de mercado-000) y su veredicto;
--                 si no, si el nombre esta libre. Y «por defecto»: los
--                 privilegios por defecto del creador en public y globales; sin
--                 la tabla, si dan algo a un rol que mercado-000 no revoca,
--                 «OTROS ROLES … PARAR». Y «pertenencias»: de que roles son
--                 miembros anon, authenticated y service_role
--   2 disparador  cada disparador de storage.objects: momento, ordenes, por
--                 fila o por sentencia, funcion, si es del esquema storage o
--                 AJENA, lenguaje, SECURITY DEFINER y md5 del cuerpo (12 hex),
--                 y un resumen. La sonda de mercado-001 los dispara (por fila,
--                 los del centinela; por sentencia, todos los de INSERT, UPDATE
--                 y DELETE: E2R3-03): el runbook PARA ante cualquiera hasta que
--                 el CTO lo acredite como estandar y sin efectos externos
--   3 politica    cada politica de storage.objects: orden, PERMISSIVE o
--                 RESTRICTIVE, roles y veredicto con la MISMA lista blanca
--                 que la guarda de mercado-001 (el bloque «clasificador» es
--                 identico en los dos ficheros): «reconocida: solo <bucket>» o
--                 «NO RECONOCIDA: mercado-001 abortaria»; debajo, el texto de
--                 su USING y de su WITH CHECK tal como lo escribe PostgreSQL
--   3 escritura   las politicas UPDATE/DELETE/ALL aplicables a anon,
--                 authenticated o public (E2R2-02): con alguna, mercado-001
--                 abortaria antes de la sonda
--   4 mercado     si existe: trozos y manifiestos por par, el puntero
--                 (v1/actual.json) y su ultima actualizacion, las constancias
--                 de liberacion (v1/_liberados/), objetos fuera de v1/ y, si
--                 los hubiera, objetos del protocolo anterior del cerrojo
--                 (v1/_cerrojo.json, v1/_congelado)
-- ============================================================================
with recursive
-- >>> clasificador (identico en sql/mercado-001-bucket.sql y sql/consultas/s14-mercado-storage.sql)
-- E2R2-01 (Astra, CTO 14-oct): el texto de una politica no dice que operador
-- ejecuta: «bucket_id = 'x'::text» puede ser un «=» de otro esquema si el
-- search_path lo pone delante. El veredicto se acredita en tres sitios:
--   · ctx: el search_path empieza por pg_catalog, sin un esquema temporal delante
--     (E2R3-02; mercado-001 lo fija; si s14 se corre con otro, no concluye); ningun operador «=» fuera de pg_catalog
--     acepta text, varchar, bpchar, name, unknown, un dominio sobre ellos o un
--     pseudotipo; pg_catalog.=(text,text) es texteq; bucket_id es text con la
--     colacion por defecto, y esa colacion es determinista. Si algo falla, TODAS
--     las politicas quedan sin reconocer (falla cerrado);
--   · el texto, como lo escribe pg_get_expr con ese contexto (un operador ajeno
--     saldria como OPERATOR(esquema.=));
--   · el arbol de la expresion (pg_policy): todos sus operadores (:opno) son de
--     pg_catalog, esta texteq, y no hay listas de operadores (:opnos).
ctx as (
  select pg_catalog.concat_ws('; ',
    case when (select s.n from pg_catalog.unnest(pg_catalog.current_schemas(true)) with ordinality s(n, k)
                order by s.k limit 1) OPERATOR(pg_catalog.<>) 'pg_catalog'
         then 'el search_path (' || pg_catalog.array_to_string(pg_catalog.current_schemas(true), ',') || ') no empieza por pg_catalog (un esquema temporal delante cuenta: ejecutar en una sesion nueva)' end,
    (select 'operador = fuera de pg_catalog que acepta texto: ' || pg_catalog.string_agg(z.nombre, ', ' order by z.nombre) from (
     select n.nspname || '.=(' || pg_catalog.format_type(o.oprleft, null) || ',' || pg_catalog.format_type(o.oprright, null) || ')' nombre
       from pg_catalog.pg_operator o join pg_catalog.pg_namespace n on n.oid = o.oprnamespace
      where o.oprname = '=' and o.oprnamespace <> 'pg_catalog'::pg_catalog.regnamespace
        and exists (select 1 from pg_catalog.pg_type y where y.oid in (o.oprleft, o.oprright)
                     and (y.oid in (25, 1043, 1042, 19, 705) or y.typtype = 'p' or (y.typtype = 'd' and y.typbasetype in (25, 1043, 1042, 19, 705))))) z
     having count(*) > 0),
    case when not exists (select 1 from pg_catalog.pg_operator o where o.oid = 'pg_catalog.=(text,text)'::pg_catalog.regoperator and o.oprcode = 'pg_catalog.texteq'::pg_catalog.regproc)
         then 'pg_catalog.=(text,text) no es texteq' end,
    case when not exists (select 1 from pg_catalog.pg_attribute a where a.attrelid = pg_catalog.to_regclass('storage.objects') and a.attname = 'bucket_id' and not a.attisdropped and a.atttypid = 25 and a.attcollation = 100)
         then 'storage.objects.bucket_id no es text con la colacion por defecto' end,
    case when not exists (select 1 from pg_catalog.pg_collation c where c.oid = 100 and c.collisdeterministic)
         then 'la colacion por defecto no es determinista' end
  ) problemas
),
pol as (
  select p.polname::pg_catalog.text policyname,
         case p.polcmd when 'r' then 'SELECT' when 'a' then 'INSERT' when 'w' then 'UPDATE' when 'd' then 'DELETE' else 'ALL' end cmd,
         case when p.polpermissive then 'PERMISSIVE' else 'RESTRICTIVE' end permissive,
         case when p.polroles OPERATOR(pg_catalog.=) '{0}'::pg_catalog.oid[] then '{public}'
              else '{' || (select pg_catalog.string_agg(r.rolname::pg_catalog.text, ',' order by r.rolname) from pg_catalog.pg_roles r where r.oid = any (p.polroles)) || '}' end roles,
         p.polroles,
         pg_catalog.pg_get_expr(p.polqual, p.polrelid) qual, pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid) with_check,
         p.polqual::pg_catalog.text nqual, p.polwithcheck::pg_catalog.text nwith
    from pg_catalog.pg_policy p where p.polrelid = pg_catalog.to_regclass('storage.objects')
),
ex as (
  select policyname, 'USING' cual, qual t, nqual nodo from pol where qual is not null
  union all
  select policyname, 'WITH CHECK', with_check, nwith from pol where with_check is not null
),
-- caracter a caracter: d0/d1 = profundidad de parentesis antes/despues, q = comilla abierta
car (policyname, cual, t, i, c, d0, d1, q) as (
  select policyname, cual, t, 1, pg_catalog.left(t, 1), 0,
         case pg_catalog.left(t, 1) when '(' then 1 when ')' then -1 else 0 end,
         case when pg_catalog.left(t, 1) in ('''', '"') then pg_catalog.left(t, 1) else '' end
    from ex where t <> ''
  union all
  select policyname, cual, t, i + 1, pg_catalog.substr(t, i + 1, 1), d1,
         d1 + case when q <> '' then 0 when pg_catalog.substr(t, i + 1, 1) = '(' then 1 when pg_catalog.substr(t, i + 1, 1) = ')' then -1 else 0 end,
         case when q = '' and pg_catalog.substr(t, i + 1, 1) in ('''', '"') then pg_catalog.substr(t, i + 1, 1) when q <> '' and pg_catalog.substr(t, i + 1, 1) = q then '' else q end
    from car where i < pg_catalog.length(t)
),
-- esqueleto: lo que queda a profundidad 0-1; una conjuncion de nivel superior es «(() AND () ...)»
forma as (
  select policyname, cual,
         pg_catalog.string_agg(case when least(d0, d1) <= 1 then c else '' end, '' order by i) esqueleto,
         pg_catalog.bool_and(d1 >= 1 or i = pg_catalog.length(t)) envuelta,
         pg_catalog.max(case when i = pg_catalog.length(t) then d1::pg_catalog.text || '|' || q end) final
    from car group by policyname, cual
),
-- el arbol: operadores de fuera de pg_catalog, texteq presente, listas de operadores
arbol as (
  select e.policyname, e.cual,
         e.nodo OPERATOR(pg_catalog.~) (':opno ' || ('pg_catalog.=(text,text)'::pg_catalog.regoperator)::pg_catalog.oid::pg_catalog.text || ' ')
         and e.nodo OPERATOR(pg_catalog.!~) ':opnos '
         and not exists (select 1 from pg_catalog.regexp_matches(e.nodo, ':opno ([0-9]+) ', 'g') m(x)
                          where not exists (select 1 from pg_catalog.pg_operator o where o.oid = m.x[1]::pg_catalog.oid and o.oprnamespace = 'pg_catalog'::pg_catalog.regnamespace)) ok
    from ex e
),
exp_ok as (
  select e.policyname, e.cual,
         case
           when (select problemas from ctx) <> '' then null
           when not (select a.ok from arbol a where a.policyname = e.policyname and a.cual = e.cual) then null
           when e.t ~ '''mercado''' then null
           when e.t ~ '^\(bucket_id = ''[^'']*''::text\)$' then pg_catalog.substring(e.t, '^\(bucket_id = ''([^'']*)''::text\)$')
           when f.envuelta and f.final = '0|' and f.esqueleto ~ '^\(\(\)( AND \(\))+\)$' then
             (select pg_catalog.min(pg_catalog.substring(pg_catalog.substr(g.t, g.i), '^\(bucket_id = ''([^'']*)''::text\)'))
                from car g where g.policyname = e.policyname and g.cual = e.cual and g.c = '(' and g.d0 = 1 and g.d1 = 2)
         end bucket
    from ex e left join forma f on f.policyname = e.policyname and f.cual = e.cual
),
veredicto as (
  select p.policyname, p.cmd, p.permissive, p.roles, p.qual, p.with_check,
         case when (p.cmd = 'INSERT' and p.with_check is null) or (p.cmd <> 'INSERT' and p.qual is null) then null
              when exists (select 1 from exp_ok e where e.policyname = p.policyname and e.bucket is null) then null
              else (select pg_catalog.string_agg(distinct e.bucket, ', ') from exp_ok e where e.policyname = p.policyname) end buckets
    from pol p
),
-- E2R2-02 (CTO 14-oct): politicas de ESCRITURA (UPDATE, DELETE, ALL), de cualquier
-- bucket, aplicables a anon, authenticated o public (directamente o por
-- pertenencia): con alguna, mercado-001 no ejecuta la sonda y aborta
escritura as (
  select p.policyname, p.cmd, p.roles from pol p
   where p.cmd in ('UPDATE', 'DELETE', 'ALL')
     and (0::pg_catalog.oid = any (p.polroles)
          or exists (select 1 from pg_catalog.pg_roles r, pg_catalog.unnest(p.polroles) x(rol)
                      where r.rolname in ('anon', 'authenticated') and pg_catalog.pg_has_role(r.oid, x.rol, 'MEMBER')))
)
-- <<< clasificador
, m as (
  select o.name, o.updated_at, coalesce((o.metadata ->> 'size')::bigint, 0) bytes
    from storage.objects o where o.bucket_id = 'mercado'
),
texto as (
  select policyname, s, cual, regexp_replace(regexp_replace(regexp_replace(t, '\s+', ' ', 'g'),
           '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}', '<uuid>', 'g'),
           '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+', '<email>', 'g') t
    from (select policyname, 2 s, 'USING' cual, qual t from veredicto union all select policyname, 3, 'WITH CHECK', with_check from veredicto) x
),
-- E2R4-01 (Astra, CTO 14-oct): los permisos EFECTIVOS del cerrojo, con la misma
-- regla que la guarda de sql/mercado-000-cerrojo.sql: con herencia y
-- pertenencias (los privilegios de cualquier rol del que sean miembros)
cer as (
  select c.oid, c.relowner, c.relacl from pg_catalog.pg_class c where c.oid = pg_catalog.to_regclass('public.mercado_cerrojo')
),
cer_privs as (
  select pr from pg_catalog.unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']
                                   || case when pg_catalog.current_setting('server_version_num')::int >= 170000 then array['MAINTAIN'] else array[]::text[] end) pr
),
cer_ef as (
  select u.u, u.n, coalesce((select pg_catalog.string_agg(p.pr, ',' order by p.pr) from cer_privs p
                              where case when u.u = 'PUBLIC' then pg_catalog.has_table_privilege('public', cer.oid, p.pr)
                                         else exists (select 1 from pg_catalog.pg_roles r where pg_catalog.pg_has_role(u.u, r.oid, 'MEMBER')
                                                                                            and pg_catalog.has_table_privilege(r.oid, cer.oid, p.pr)) end), '-') ef
    from cer, pg_catalog.unnest(array['PUBLIC', 'anon', 'authenticated', 'service_role']) with ordinality u(u, n)
),
cer_acl as (
  select case when x.grantee = 0 then 'PUBLIC' else x.grantee::pg_catalog.regrole::text end quien, x.grantee, x.privilege_type, x.is_grantable, cer.relowner
    from cer, pg_catalog.aclexplode(cer.relacl) x
),
cer_perm as (
  select (select pg_catalog.string_agg(a.quien || ':' || a.privilege_type, ',' order by a.quien, a.privilege_type) from cer_acl a where a.grantee <> a.relowner) permisos,
         (select pg_catalog.string_agg(distinct a.quien, ',') from cer_acl a where a.grantee not in (a.relowner, 'service_role'::pg_catalog.regrole)) ajenos,
         (select pg_catalog.string_agg(e.u || '=' || e.ef, ' ' order by e.n) from cer_ef e) efectivos,
         (select pg_catalog.bool_and(case when e.u = 'service_role' then e.ef = 'DELETE,INSERT,SELECT' else e.ef = '-' end) from cer_ef e)
         and coalesce((select pg_catalog.string_agg(a.privilege_type, ',' order by a.privilege_type) from cer_acl a where a.grantee = 'service_role'::pg_catalog.regrole), '-') = 'DELETE,INSERT,SELECT'
         and not exists (select 1 from cer_acl a where a.grantee = 'service_role'::pg_catalog.regrole and a.is_grantable) efectivos_ok
),
-- los privilegios por defecto del creador (el dueño del cerrojo; si no existe,
-- quien corre s14, que es quien correra mercado-000) en public y globales
cer_def as (
  select r.rolname, d.defaclnamespace, x.grantee,
         case when x.grantee = 0 then 'PUBLIC' else x.grantee::pg_catalog.regrole::text end quien, x.privilege_type
    from pg_catalog.pg_roles r
    join pg_catalog.pg_default_acl d on d.defaclrole = r.oid and d.defaclobjtype = 'r' and d.defaclnamespace in (0, 'public'::pg_catalog.regnamespace)
    cross join lateral pg_catalog.aclexplode(d.defaclacl) x
   where r.oid = coalesce((select relowner from cer), (select oid from pg_catalog.pg_roles where rolname = current_user))
)
select seccion, objeto, detalle from (
  select 1 o, 1 s, 'bucket' seccion, b.id objeto,
         'public=' || b.public || ' · file_size_limit=' || coalesce(b.file_size_limit::text, '-') || ' · allowed_mime_types=' || coalesce(b.allowed_mime_types::text, '-')
         || ' · objetos=' || (select count(*) from storage.objects x where x.bucket_id = b.id)
         || ' · bytes=' || (select coalesce(sum((x.metadata ->> 'size')::bigint), 0) from storage.objects x where x.bucket_id = b.id) detalle
    from storage.buckets b
  union all
  select 1, 1, 'bucket', 'mercado', 'NO EXISTE' where not exists (select 1 from storage.buckets where id = 'mercado' or name = 'mercado')
  union all
  -- E2R3-01: el cerrojo del publicador, en la base (sql/mercado-000-cerrojo.sql)
  select 1, 2, 'cerrojo', 'public.mercado_cerrojo',
         case when pg_catalog.to_regclass('public.mercado_cerrojo') is null then
                case when exists (select 1 from pg_catalog.pg_class c where c.relnamespace = 'public'::pg_catalog.regnamespace and c.relname in ('mercado_cerrojo', 'mercado_cerrojo_pkey'))
                       or exists (select 1 from pg_catalog.pg_type y where y.typnamespace = 'public'::pg_catalog.regnamespace and y.typname in ('mercado_cerrojo', '_mercado_cerrojo'))
                     then 'NO EXISTE, pero el nombre esta OCUPADO (indice o tipo): mercado-000 abortaria'
                     else 'NO EXISTE (mercado-000 sin aplicar); el nombre esta libre' end
              else (select 'rls=' || c.relrowsecurity || ' · politicas=' || (select count(*) from pg_catalog.pg_policy p where p.polrelid = c.oid)
                           || ' · disparadores=' || (select count(*) from pg_catalog.pg_trigger g where g.tgrelid = c.oid and not g.tgisinternal)
                           || ' · reglas=' || (select count(*) from pg_catalog.pg_rewrite w where w.ev_class = c.oid)
                           || ' · permisos=' || coalesce(k.permisos, '-')
                           || ' · efectivos: ' || k.efectivos
                           || case when k.efectivos_ok and k.ajenos is null then ' · permisos acreditados'
                                   else ' · PERMISOS NO ACREDITADOS' || coalesce(' (ajenos: ' || k.ajenos || ')', '') || ': mercado-000 abortaria; PARAR (E2R4-01)' end
                      from pg_catalog.pg_class c, cer_perm k where c.oid = pg_catalog.to_regclass('public.mercado_cerrojo')) end
  union all
  -- E2R4-01: de que roles son miembros (con o sin herencia) anon, authenticated y service_role:
  -- sus privilegios en el cerrojo cuentan como suyos (mercado-000 los comprueba)
  select 1, 2, 'cerrojo', 'pertenencias',
         (select pg_catalog.string_agg(u.u || ': ' || coalesce((select pg_catalog.string_agg(r.rolname, ',' order by r.rolname) from pg_catalog.pg_roles r
                                                                 where r.rolname <> u.u and pg_catalog.pg_has_role(u.u, r.oid, 'MEMBER')), '-'), ' · ' order by u.n)
            from pg_catalog.unnest(array['anon', 'authenticated', 'service_role']) with ordinality u(u, n)
           where pg_catalog.to_regrole(u.u) is not null)
  union all
  -- E2R4-01: de donde vienen los grants de una tabla nueva: los privilegios por defecto del creador
  select 1, 2, 'cerrojo', 'por defecto',
         (select r.rolname from pg_catalog.pg_roles r where r.oid = coalesce((select relowner from cer), (select oid from pg_catalog.pg_roles where rolname = current_user)))
         || ': en public: ' || coalesce((select pg_catalog.string_agg(g, '; ' order by g) from (select d.quien || '=' || pg_catalog.string_agg(d.privilege_type, ',' order by d.privilege_type) g
                                                                                                  from cer_def d where d.defaclnamespace <> 0 group by d.quien) a), '-')
         || ' · global: ' || coalesce((select pg_catalog.string_agg(g, '; ' order by g) from (select d.quien || '=' || pg_catalog.string_agg(d.privilege_type, ',' order by d.privilege_type) g
                                                                                               from cer_def d where d.defaclnamespace = 0 group by d.quien) a), '-')
         || case when not exists (select 1 from cer)
                  and exists (select 1 from cer_def d, pg_catalog.pg_roles r where r.rolname = d.rolname and d.grantee not in (0, r.oid, 'anon'::pg_catalog.regrole, 'authenticated'::pg_catalog.regrole, 'service_role'::pg_catalog.regrole))
                 then ' · OTROS ROLES (' || (select pg_catalog.string_agg(distinct d.quien, ',') from cer_def d, pg_catalog.pg_roles r where r.rolname = d.rolname and d.grantee not in (0, r.oid, 'anon'::pg_catalog.regrole, 'authenticated'::pg_catalog.regrole, 'service_role'::pg_catalog.regrole))
                      || '): mercado-000 abortaria (no se les revoca a ciegas); PARAR (E2R4-01)'
                 else '' end
  union all
  select 2, 1, 'rls', 'storage.objects', 'rls=' || c.relrowsecurity from pg_catalog.pg_class c where c.oid = pg_catalog.to_regclass('storage.objects')
  union all
  select 2, 1, 'contexto', 'lista blanca', case when c.problemas = '' then 'acreditada: search_path empieza por pg_catalog; ningun operador = ajeno que acepte texto; texteq; bucket_id text con la colacion por defecto'
                                                  else 'NO ACREDITADO: ' || c.problemas || ': mercado-001 abortaria' end from ctx c
  union all
  -- E2R3-02: catalogos calificados (una tabla temporal pg_trigger no los sombrea)
  -- E2R3-03: la sonda dispara los de INSERT (el centinela), UPDATE y DELETE, por fila y por sentencia
  select 2, 2, 'disparador', t.tgname,
         case when t.tgtype & 2 = 2 then 'BEFORE' when t.tgtype & 64 = 64 then 'INSTEAD OF' else 'AFTER' end || ' '
         || pg_catalog.concat_ws('/', case when t.tgtype & 4 = 4 then 'INSERT' end, case when t.tgtype & 8 = 8 then 'DELETE' end, case when t.tgtype & 16 = 16 then 'UPDATE' end, case when t.tgtype & 32 = 32 then 'TRUNCATE' end)
         || ' · ' || case when t.tgtype & 1 = 1 then 'por fila' else 'POR SENTENCIA' end || ' · ' || n.nspname || '.' || f.proname || case when t.tgenabled = 'D' then ' · desactivado' else '' end
         || ' · ' || case when n.nspname = 'storage' then 'funcion de storage' else 'FUNCION AJENA (fuera de storage)' end
         || ' · ' || l.lanname || case when f.prosecdef then ' · SECURITY DEFINER' else '' end || ' · md5 del cuerpo ' || pg_catalog.left(pg_catalog.md5(coalesce(f.prosrc, '')), 12)
    from pg_catalog.pg_trigger t join pg_catalog.pg_proc f on f.oid = t.tgfoid join pg_catalog.pg_namespace n on n.oid = f.pronamespace join pg_catalog.pg_language l on l.oid = f.prolang
   where t.tgrelid = pg_catalog.to_regclass('storage.objects') and not t.tgisinternal
  union all
  select 2, 2, 'disparador', '(resumen)',
         case when count(*) = 0 then 'ninguno en storage.objects'
              else count(*)::text || ' en storage.objects (' || count(*) filter (where t.tgtype & 1 = 0) || ' por sentencia): la sonda de mercado-001 los dispara; PARAR hasta que el CTO acredite cada uno como estandar de Supabase y sin efectos externos' end
    from pg_catalog.pg_trigger t where t.tgrelid = pg_catalog.to_regclass('storage.objects') and not t.tgisinternal
  union all
  select 3, 1, 'politica', v.policyname, v.cmd || ' · ' || v.permissive || ' · ' || v.roles || ' · '
         || case when v.buckets is not null then 'reconocida: solo ' || v.buckets
                 when (select c.problemas from ctx c) <> '' then 'NO RECONOCIDA (contexto no acreditado): mercado-001 abortaria'
                 else 'NO RECONOCIDA: mercado-001 abortaria' end
    from veredicto v
  union all
  select 3, x.s, 'politica', x.policyname, x.cual || ': ' || coalesce(x.t, '(sin expresion)') from texto x
  union all
  select 3, 1, 'politica', '(ninguna)', 'storage.objects no tiene politicas' where not exists (select 1 from pol)
  union all
  select 3, 4, 'escritura', w.policyname, w.cmd || ' · ' || w.roles || ' · se aplica a anon/authenticated/public: mercado-001 abortaria antes de la sonda' from escritura w
  union all
  select 3, 4, 'escritura', '(ninguna)', 'ninguna politica UPDATE/DELETE/ALL aplicable a anon, authenticated o public' where not exists (select 1 from escritura)
  union all
  select 4, 1, 'mercado', split_part(m.name, '/', 2), 'trozos=' || count(*) filter (where m.name ~ '\.bin\.br$') || ' · bytes=' || sum(m.bytes) filter (where m.name ~ '\.bin\.br$')
         || ' · manifiestos=' || count(*) filter (where m.name ~ '/manifiestos/')
    from m where m.name ~ '^v1/[A-Z]{6}/' group by split_part(m.name, '/', 2)
  union all
  select 4, 1, 'mercado', 'puntero', coalesce((select 'v1/actual.json · actualizado ' || to_char(m.updated_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS') || ' UTC' from m where m.name = 'v1/actual.json'), 'no hay')
   where exists (select 1 from storage.buckets where id = 'mercado')
  union all
  select 4, 1, 'mercado', 'protocolo anterior', 'HAY ' || pg_catalog.string_agg(m.name, ', ') || ': el cerrojo ya no vive en Storage (E2R3-01); no se usa: avisar al CTO'
    from m where m.name in ('v1/_cerrojo.json', 'v1/_congelado') having count(*) > 0
  union all
  select 4, 1, 'mercado', 'liberaciones', count(*)::text || ' constancia(s) en v1/_liberados/ (scripts/mercado-v1-liberar-cerrojo.mjs)' from m where m.name ~ '^v1/_liberados/' having count(*) > 0
  union all
  select 4, 1, 'mercado', 'fuera de v1/', count(*)::text from m where m.name !~ '^v1/' having count(*) > 0
  union all
  select 5, 1, 'FIN', 's14', 'consulta'
) x order by o, objeto collate "C", s, detalle;
