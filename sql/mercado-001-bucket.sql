-- ============================================================================
-- mercado-001-bucket — el bucket PRIVADO «mercado» del mercado v1 (etapa 2)
--
-- POR QUE EXISTE. Diseño revisiones/2026-10-12-diseno-sim-004-y-motor-v1.md,
-- p.7 y p.8 (CTO 13-oct): los trozos, los manifiestos y el puntero del mercado
-- v1 viven en un bucket privado propio, «mercado», con el prefijo v1/. Los
-- escribe y lee solo service_role (publicador, verificador y, en la etapa 3,
-- los endpoints), que no pasa por la RLS.
--
-- QUE HACE: una fila en storage.buckets: id = name = 'mercado', public =
-- false, file_size_limit = 5 MB (5.242.880 bytes), allowed_mime_types NULL.
-- NADA MAS: ni politicas sobre storage.objects ni grants (sin el si explicito
-- del CTO).
--
-- GUARDAS (aborta sin tocar nada, con «mercado-001:» en el error):
--   · storage.buckets o storage.objects no existen;
--   · la RLS de storage.objects esta apagada (sin ella, un bucket privado se
--     lee por la API con cualquier JWT);
--   · CONTEXTO (Astra E2R2-01, CTO 14-oct): lo primero, el search_path de la
--     transaccion queda en «pg_catalog, pg_temp» (para que pg_get_expr califique
--     cualquier operador ajeno) y lock_timeout en 5 s. Aborta si existe algun
--     operador «=» fuera de pg_catalog que acepte text, varchar, bpchar, name,
--     unknown, un dominio sobre ellos o un pseudotipo, si pg_catalog.=(text,text)
--     no es texteq, o si bucket_id no es text con la colacion por defecto
--     (determinista). Falla cerrado: lo que no se puede acreditar, aborta;
--   · CAPA 1, LISTA BLANCA (Astra E2-01, CTO 14-oct; falla cerrada): cada
--     politica de storage.objects tiene que ser RECONOCIDA. Lo es solo si
--     cada expresion suya (USING y WITH CHECK) es, tal como la escribe
--     PostgreSQL (pg_policies), o bien exactamente
--         (bucket_id = '<b>'::text)
--     o bien una conjuncion de nivel superior ((A) AND (B) [AND ...]) en la
--     que alguno de los terminos es exactamente esa comparacion; '<b>' es un
--     literal sin comillas dentro y distinto de 'mercado', y la expresion no
--     nombra 'mercado' en ningun sitio. Ademas, la expresion que el comando
--     exige tiene que existir (USING en SELECT, UPDATE, DELETE y ALL; WITH
--     CHECK en INSERT). Todo lo demas —IS FALSE, CASE, OR, NOT, funciones o
--     subconsultas alrededor de la comparacion, la comparacion al reves,
--     ANY, COLLATE, una conjuncion anidada, una politica sin expresion,
--     tambien las RESTRICTIVE— es NO RECONOCIDA y aborta. Y el ARBOL de cada
--     expresion (pg_policy) tiene que tener solo operadores de pg_catalog, con
--     texteq entre ellos (E2R2-01). El clasificador es el mismo texto que en
--     s14 (pruebas/mercado-001-bucket.mjs comprueba que es identico);
--   · PRECONDICION DE LA SONDA (Astra E2R2-02, CTO 14-oct): si alguna politica
--     UPDATE, DELETE o ALL de storage.objects, de CUALQUIER bucket, se aplica a
--     anon, authenticated o public (directamente o por pertenencia), aborta con
--     la lista: no se ejecuta nada sobre filas de otros buckets; decide el CTO;
--   · ya existe un bucket con id o nombre «mercado» y OTRA forma (publico,
--     otro limite, tipos MIME, o id y nombre distintos);
--   · CAPA 2, SONDA (CTO 14-oct): con el bucket ya insertado y dentro de la
--     misma transaccion, un objeto CENTINELA inventado en «mercado»; como anon
--     y como authenticated (SET LOCAL ROLE, con request.jwt.claims de un sub
--     aleatorio, dueño del centinela), un SELECT de ese objeto y un UPDATE y
--     un DELETE SOLO DEL CENTINELA (WHERE por su id; E2R2-02: la precondicion
--     ya garantiza que no hay politicas de escritura para esos roles), cada
--     uno en su subtransaccion deshecha; si el centinela fue leido,
--     marcado o borrado, aborta. Si alguno falla por algo que no sea la falta de
--     permiso sobre storage.objects o el esquema storage, aborta tambien
--     («sonda no concluyente»: p. ej. un disparador). El centinela se deshace
--     siempre (ROLLBACK de su subtransaccion) y se comprueba que no queda y
--     que el rol vuelve a ser el de antes. No crea politicas ni grants.
--     protect_delete (Astra/CTO 14-oct, s14b de produccion): Supabase tiene en
--     storage.objects el disparador protect_objects_delete (BEFORE DELETE, por
--     sentencia, storage.protect_delete), que lanza 42501 «Direct deletion from
--     storage tables is not allowed» ANTES de la RLS salvo que el ajuste
--     storage.allow_delete_query valga 'true'. Sin mas, el DELETE de la sonda
--     fallaria siempre por el disparador y no probaria la RLS. Por eso: la
--     sonda EXIGE que protect_objects_delete exista con esa forma y este
--     habilitado (si no, aborta: no seria el Storage medido); el ajuste ya
--     'true' al empezar tambien aborta (protect_delete estaria apagado para
--     todos); SOLO para la sentencia DELETE del centinela, y dentro de su
--     subtransaccion, la sonda pone storage.allow_delete_query = 'true' (local
--     a la transaccion, como hace la API de Storage) y lo repone justo despues;
--     la subtransaccion se deshace igual, y al acabar se comprueba que el
--     ajuste no ha quedado en 'true'. Un 42501 con el mensaje de protect_delete
--     NUNCA cuenta como «la RLS bloquea»: es «sonda no concluyente». Antes de
--     la sonda, la funcion del disparador tiene que tener el md5 COMPLETO
--     acreditado (s14b); si no, «protect_delete ha cambiado: re-acreditar».
--     Despues, la prueba FUNCIONAL (CTO): un DELETE directo de una fila que no
--     existe tiene que fallar con el error de protect_delete; si no, aborta. El
--     informe lo dice en la fila «protect_delete». (En PostgreSQL el ajuste, ya
--     fijado en la sesion, vuelve a '' y no a NULL: por eso la prueba es
--     funcional y no del valor.)
--   · E2R7-01 (Astra r7, CTO 15-oct): ANTES de insertar el bucket (su INSERT
--     dispara los de storage.buckets) y antes de la sonda, cada disparador de
--     la lista acreditada (los dos de storage.objects y los cinco de
--     storage.buckets) tiene que coincidir en TODO con su ficha: definicion,
--     habilitado 'O', md5 completo y el contexto de la funcion a la que apunta
--     (lenguaje, SECURITY INVOKER, dueño, proconfig completo con su
--     search_path, volatilidad y firma). Si no, aborta: «disparadores de
--     storage NO ACREDITADOS: <cual> (difiere: <que>)». El bloque «acreditados»
--     es el mismo texto que en s14 (la prueba lo compara byte a byte). Un
--     disparador que NO esta en la lista tambien aborta (CTO 15-oct: fallar
--     cerrado, igual que s14 manda PARAR): «(difiere: no esta en la lista
--     acreditada)».
--   · POSTCONDICION (CTO 15-oct, con la s14d): type y versioning_status tienen
--     valor por defecto ('STANDARD' y 'DISABLED'), asi que el INSERT no los
--     fija; despues del INSERT, y tambien si el bucket ya existia (CTO
--     15-oct: la reejecucion), se lee la fila y tiene que tener
--     type = 'STANDARD', versioning_status = 'DISABLED' y las dos columnas de
--     ciclo de vida a NULL. Si no: «el bucket mercado no es el esperado (…)» y
--     aborta todo. s14 acredita esos dos valores por defecto y el enum.
--   · PRESENCIA EXACTA (CTO 15-oct, tras Astra r8): uno de los siete de la
--     lista que falte tambien aborta, «(difiere: falta)».
--   · REGLAS (CTO 16-oct): una regla (pg_rewrite) en storage.objects o
--     storage.buckets tambien aborta, antes del INSERT: lo acreditado es
--     ninguna, «regla <nombre> (difiere: regla <evento>: no se acredita
--     ninguna)». Es el mismo bloque que s14 (CTE «reglas» y «otros»).
--   · INTERNOS (E2R8-01, CTO 16-oct, con la s14e de produccion): los
--     disparadores internos de las dos tablas tienen que ser EXACTAMENTE los
--     ocho RI_FKey_* de las tres FK a storage.buckets(id) (funcion, tabla,
--     restriccion, tabla relacionada, momento, habilitado 'O'). Uno de mas o
--     uno de menos aborta antes del INSERT: «interno <funcion> · <restriccion>
--     (difiere: …)». El mismo bloque que s14.
--   · ENUM (E2R8-02, CTO 15-oct): antes del INSERT, el array EXACTO de
--     etiquetas de storage.buckettype en el orden de enumsortorder tiene que
--     ser {STANDARD,ANALYTICS,VECTOR} (s14d); si no, aborta: «el enum
--     storage.buckettype no es el acreditado: …». La misma expresion que s14.
--     LO QUE EL ROLLBACK NO DESHACE (E2R2-02): el INSERT del centinela y las
--     ordenes de la sonda disparan los disparadores de storage.objects (por
--     fila, los del centinela; por sentencia, todos los de UPDATE y DELETE);
--     lo transaccional se deshace, pero no lo que no lo es (una secuencia que
--     avanza, una llamada fuera de la base). Por eso s14 los enseña antes y el
--     runbook para si hay alguno que no sea de Supabase Storage.
-- IDEMPOTENTE: si ya existe con esta misma forma, no lo toca, lo dice y
-- vuelve a pasar las dos capas.
--
-- COMO SE APLICA: entera, en el editor SQL de Supabase (como postgres): dos
-- SET LOCAL (statement_timeout 30 s y lock_timeout 5 s: valen si el editor lo
-- ejecuta todo en una transaccion, que es lo que hace con un texto de varias
-- ordenes; en psql sin BEGIN avisan y no hacen nada), un DO (atomico: o todo o
-- nada; fija dentro lock_timeout, que si vale ahi) y una SELECT de informe que
-- acaba en «FIN | mercado-001 aplicada» y dice los limites que vio. Ensayada en PostgreSQL 17 local
-- (pruebas/mercado-001-bucket.mjs), como superusuario y como un postgres no
-- superusuario con bypassrls (s06), con cada guarda en rojo. Antes y despues:
-- la consulta s14 (solo lectura), que enseña el texto de cada politica.
-- NO comprobado en local: si el editor de Supabase deja a postgres insertar en
-- storage.buckets y storage.objects y hacer SET LOCAL ROLE anon/authenticated
-- (en otras migraciones lo hizo: sql/ del simulador, k.4). Los disparadores de
-- storage.objects de produccion se midieron con s14b (14-oct) y el ensayo usa
-- sus cuerpos byte a byte (pruebas/storage-supabase.mjs); los de
-- storage.buckets, que dispara el INSERT del bucket, los enseña s14c y el
-- runbook para hasta que el CTO los acredite. Si el editor rechaza el INSERT en
-- storage.buckets: alternativa del panel en el runbook (decision 4 del CTO).
-- ============================================================================
set local statement_timeout = '30s';
set local lock_timeout = '5s';
do $m$
declare
  b record;
  malas text;
  yo text := current_user;
  sub uuid;
  centinela text;
  cid uuid;
  sin_acreditar text;
  de_escritura text;
  con_owner boolean;
  con_owner_id boolean;
  rol text;
  op text;
  k bigint;
  alcance text := '';
  dudas text := '';
  ajuste_inicio text;
  ajuste_previo text;
  no_acreditados text;
  creada jsonb;
begin
  -- E2R2-01: contexto de resolucion fijo antes de inspeccionar nada; E2R2-02: esperas acotadas
  perform pg_catalog.set_config('search_path', 'pg_catalog, pg_temp', true);
  perform pg_catalog.set_config('lock_timeout', '5s', true);
  sub := gen_random_uuid();
  centinela := 'v1/_sonda-mercado-001-' || md5(clock_timestamp()::text || random()::text);
  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then
    raise exception 'mercado-001: no existen storage.buckets o storage.objects';
  end if;
  if not (select c.relrowsecurity from pg_class c where c.oid = 'storage.objects'::regclass) then
    raise exception 'mercado-001: la RLS de storage.objects esta apagada: un bucket privado no lo seria';
  end if;

  -- CONTEXTO, CAPA 1 y PRECONDICION: el mismo bloque que s14
  select x.problemas, x.malas, x.escrituras into sin_acreditar, malas, de_escritura
    from (
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
select (select c.problemas from ctx c) problemas,
       (select string_agg(v.policyname || ' (' || v.cmd || ')', ', ' order by v.policyname) from veredicto v where v.buckets is null) malas,
       (select string_agg(w.policyname || ' (' || w.cmd || ' · ' || w.roles || ')', ', ' order by w.policyname) from escritura w) escrituras
    ) x;
  if sin_acreditar <> '' then
    raise exception 'mercado-001: no se puede acreditar la lista blanca: %. No se crea nada; decide el CTO', sin_acreditar;
  end if;
  if malas is not null then
    raise exception 'mercado-001: politicas de storage.objects NO RECONOCIDAS (podrian aplicarse al bucket mercado): %. Su texto, en s14; las decide el CTO; no se crea nada', malas;
  end if;
  if de_escritura is not null then
    raise exception 'mercado-001: politicas de ESCRITURA en storage.objects aplicables a anon, authenticated o public: %. La sonda no se ejecuta sobre otros buckets; no se crea nada; decide el CTO', de_escritura;
  end if;

  -- protect_delete (CTO 14-oct): el disparador de Supabase tiene que estar, con su forma y habilitado
  if not exists (select 1 from pg_catalog.pg_trigger t join pg_catalog.pg_proc f on f.oid = t.tgfoid join pg_catalog.pg_namespace n on n.oid = f.pronamespace
                  where t.tgrelid = 'storage.objects'::regclass and t.tgname = 'protect_objects_delete' and not t.tgisinternal
                    and t.tgenabled in ('O', 'A') and n.nspname = 'storage' and f.proname = 'protect_delete'
                    and t.tgtype & 1 = 0 and t.tgtype & 2 = 2 and t.tgtype & 8 = 8) then
    raise exception 'mercado-001: falta el disparador protect_objects_delete de Supabase en storage.objects (BEFORE DELETE por sentencia, storage.protect_delete) o esta desactivado: la sonda no seria la del Storage medido; no se crea nada; decide el CTO';
  end if;
  -- CTO 14-oct (3b): la funcion de ese disparador tiene que ser la ACREDITADA, por su md5 completo (s14b)
  if (select pg_catalog.md5(coalesce(f.prosrc, '')) from pg_catalog.pg_trigger t join pg_catalog.pg_proc f on f.oid = t.tgfoid
       where t.tgrelid = 'storage.objects'::regclass and t.tgname = 'protect_objects_delete' and not t.tgisinternal)
     is distinct from '998d324ea2b1abc49351e8c2367b5796' then
    raise exception 'mercado-001: protect_delete ha cambiado: re-acreditar (su md5 no es el de la s14b del 14-oct); no se crea nada';
  end if;
  -- E2R7-01 (Astra r7, CTO 15-oct): ANTES de tocar storage.buckets (su INSERT dispara cinco de ellos), cada disparador
  -- de la lista acreditada tiene que coincidir en todo con su ficha: definicion, habilitado, md5 y el contexto de la
  -- funcion (lenguaje, SECURITY, dueño, proconfig, volatilidad, firma). El bloque es el mismo texto que en s14
  select string_agg(case when v.tabla = 'objects' then v.nombre else 'buckets.' || v.nombre end || ' (difiere: ' || v.difiere || ')', ', ' order by v.tabla, v.nombre)
    into no_acreditados
    from (with
-- >>> acreditados (identico en sql/mercado-001-bucket.sql y sql/consultas/s14-mercado-storage.sql)
-- Los disparadores que el CTO ha acreditado (14-oct, s14b y s14c de produccion: estandar de Supabase y sin efectos
-- externos), cada uno con la FICHA COMPLETA de la funcion a la que apunta (tgfoid, no por nombre): md5 COMPLETO del
-- cuerpo y, E2R7-01 (Astra r7, CTO 15-oct), lenguaje, SECURITY INVOKER/DEFINER, dueño, proconfig completo (search_path
-- incluido), volatilidad y la firma con sus argumentos y lo que devuelve. Un disparador de la lista con cualquier
-- diferencia (o no habilitado 'O') es NO ACREDITADO, con lo que difiere: s14 manda PARAR y mercado-001 aborta.
acreditados (tabla, nombre, definicion, md5, lenguaje, seguridad, dueno, proconfig, volatilidad, firma, atributos) as (values
  ('objects'::text, 'protect_objects_delete'::text, 'CREATE TRIGGER protect_objects_delete BEFORE DELETE ON storage.objects FOR EACH STATEMENT EXECUTE FUNCTION storage.protect_delete()'::text, '998d324ea2b1abc49351e8c2367b5796'::text,
   'plpgsql'::text, 'INVOKER'::text, 'supabase_storage_admin'::text, '-'::text, 'v'::text, 'storage.protect_delete() returns trigger'::text, 'strict=false|leakproof=false|parallel=u|kind=f|retset=false|ret=trigger|nargs=0|modes=-|names=-|defaults=-|ndefaults=0|cost=100|rows=0|def=4371ae544fb1ef704f9c5d42265ac324'::text),
  ('objects', 'update_objects_updated_at', 'CREATE TRIGGER update_objects_updated_at BEFORE UPDATE ON storage.objects FOR EACH ROW EXECUTE FUNCTION storage.update_updated_at_column()', '7596e66a7698d5a6b5129c5ce9b24c5f',
   'plpgsql', 'INVOKER', 'supabase_storage_admin', '-', 'v', 'storage.update_updated_at_column() returns trigger', 'strict=false|leakproof=false|parallel=u|kind=f|retset=false|ret=trigger|nargs=0|modes=-|names=-|defaults=-|ndefaults=0|cost=100|rows=0|def=bfecc08a6034296258f0c3e10193076c'),
  -- los cinco de storage.buckets (CTO 14-oct, s14c)
  ('buckets', 'enforce_bucket_name_length_trigger', 'CREATE TRIGGER enforce_bucket_name_length_trigger BEFORE INSERT OR UPDATE OF name ON storage.buckets FOR EACH ROW EXECUTE FUNCTION storage.enforce_bucket_name_length()', 'bd3d77a2603f7f344035a81def5502fa',
   'plpgsql', 'INVOKER', 'supabase_storage_admin', '-', 'v', 'storage.enforce_bucket_name_length() returns trigger', 'strict=false|leakproof=false|parallel=u|kind=f|retset=false|ret=trigger|nargs=0|modes=-|names=-|defaults=-|ndefaults=0|cost=100|rows=0|def=11b3bd509f6b254ec1cd859e712e8c78'),
  ('buckets', 'protect_bucket_control_insert', 'CREATE TRIGGER protect_bucket_control_insert BEFORE INSERT ON storage.buckets FOR EACH ROW EXECUTE FUNCTION storage.protect_bucket_control_columns(''service_role'')', '7870415452678f5aa85f91dde952ef12',
   'plpgsql', 'INVOKER', 'supabase_storage_admin', '{search_path=pg_catalog}', 'v', 'storage.protect_bucket_control_columns() returns trigger', 'strict=false|leakproof=false|parallel=u|kind=f|retset=false|ret=trigger|nargs=0|modes=-|names=-|defaults=-|ndefaults=0|cost=100|rows=0|def=7c31ae406e2f6281ead4009fff69fc68'),
  ('buckets', 'protect_bucket_control_update', 'CREATE TRIGGER protect_bucket_control_update BEFORE UPDATE OF lifecycle_configuration, lifecycle_configuration_generation ON storage.buckets FOR EACH ROW EXECUTE FUNCTION storage.protect_bucket_control_columns()', '7870415452678f5aa85f91dde952ef12',
   'plpgsql', 'INVOKER', 'supabase_storage_admin', '{search_path=pg_catalog}', 'v', 'storage.protect_bucket_control_columns() returns trigger', 'strict=false|leakproof=false|parallel=u|kind=f|retset=false|ret=trigger|nargs=0|modes=-|names=-|defaults=-|ndefaults=0|cost=100|rows=0|def=7c31ae406e2f6281ead4009fff69fc68'),
  ('buckets', 'protect_bucket_control_update_role', 'CREATE TRIGGER protect_bucket_control_update_role AFTER UPDATE OF lifecycle_configuration, lifecycle_configuration_generation ON storage.buckets FOR EACH ROW EXECUTE FUNCTION storage.enforce_bucket_lifecycle_service_role(''service_role'')', '7691066f4111610b457b74bdead6e80b',
   'plpgsql', 'INVOKER', 'supabase_storage_admin', '{search_path=pg_catalog}', 'v', 'storage.enforce_bucket_lifecycle_service_role() returns trigger', 'strict=false|leakproof=false|parallel=u|kind=f|retset=false|ret=trigger|nargs=0|modes=-|names=-|defaults=-|ndefaults=0|cost=100|rows=0|def=b839722d462ea1003fbcf028bd6f6c01'),
  ('buckets', 'protect_buckets_delete', 'CREATE TRIGGER protect_buckets_delete BEFORE DELETE ON storage.buckets FOR EACH STATEMENT EXECUTE FUNCTION storage.protect_delete()', '998d324ea2b1abc49351e8c2367b5796',
   'plpgsql', 'INVOKER', 'supabase_storage_admin', '-', 'v', 'storage.protect_delete() returns trigger', 'strict=false|leakproof=false|parallel=u|kind=f|retset=false|ret=trigger|nargs=0|modes=-|names=-|defaults=-|ndefaults=0|cost=100|rows=0|def=4371ae544fb1ef704f9c5d42265ac324')
),
-- cada disparador de storage.objects y storage.buckets con la ficha de SU funcion (la de tgfoid)
fichas as (
  select r.relname::text tabla, t.tgname::text nombre, t.tgrelid, t.tgtype, t.tgenabled::text habilitado,
         n.nspname::text esquema, f.proname::text funcion, f.prosrc,
         pg_catalog.pg_get_triggerdef(t.oid) definicion, pg_catalog.md5(coalesce(f.prosrc, '')) md5,
         l.lanname::text lenguaje, case when f.prosecdef then 'DEFINER' else 'INVOKER' end seguridad,
         pg_catalog.pg_get_userbyid(f.proowner)::text dueno, coalesce(f.proconfig::text, '-') proconfig, f.provolatile::text volatilidad,
         n.nspname || '.' || f.proname || '(' || pg_catalog.pg_get_function_identity_arguments(f.oid) || ') returns ' || pg_catalog.pg_get_function_result(f.oid) firma,
         -- CTO 16-oct (la familia de E3R2-01): TODOS los atributos de pg_proc que cambian la ejecucion y el md5 de
         -- pg_get_functiondef completo (incluye STRICT, LEAKPROOF, PARALLEL, COST, ROWS y SET); calificado (R9I-02)
         pg_catalog.concat_ws('|', pg_catalog.concat('strict=', f.proisstrict::pg_catalog.text), pg_catalog.concat('leakproof=', f.proleakproof::pg_catalog.text), pg_catalog.concat('parallel=', f.proparallel::pg_catalog.text), pg_catalog.concat('kind=', f.prokind::pg_catalog.text), pg_catalog.concat('retset=', f.proretset::pg_catalog.text), pg_catalog.concat('ret=', pg_catalog.format_type(f.prorettype, null)), pg_catalog.concat('nargs=', f.pronargs::pg_catalog.text), pg_catalog.concat('modes=', coalesce(f.proargmodes::pg_catalog.text, '-')), pg_catalog.concat('names=', coalesce(f.proargnames::pg_catalog.text, '-')), pg_catalog.concat('defaults=', coalesce(pg_catalog.pg_get_expr(f.proargdefaults, 0), '-')), pg_catalog.concat('ndefaults=', f.pronargdefaults::pg_catalog.text), pg_catalog.concat('cost=', f.procost::pg_catalog.text), pg_catalog.concat('rows=', f.prorows::pg_catalog.text), pg_catalog.concat('def=', pg_catalog.md5(pg_catalog.pg_get_functiondef(f.oid)))) atributos
    from pg_catalog.pg_trigger t join pg_catalog.pg_class r on r.oid = t.tgrelid
         join pg_catalog.pg_proc f on f.oid = t.tgfoid join pg_catalog.pg_namespace n on n.oid = f.pronamespace join pg_catalog.pg_language l on l.oid = f.prolang
   where t.tgrelid in (pg_catalog.to_regclass('storage.objects'), pg_catalog.to_regclass('storage.buckets')) and not t.tgisinternal
),
-- el veredicto: «difiere» es '' solo si el disparador esta en la lista y coincide en todo
veredictos as (
  select x.*, (x.difiere = '') acreditado from (
    select d.*, a.tabla is not null en_lista,
           case when a.tabla is null then 'no esta en la lista acreditada'
                else pg_catalog.concat_ws(', ',
                       case when d.definicion is distinct from a.definicion then 'definicion' end,
                       case when d.habilitado is distinct from 'O' then 'habilitado' end,
                       case when d.md5 is distinct from a.md5 then 'md5' end,
                       case when d.lenguaje is distinct from a.lenguaje then 'lenguaje' end,
                       case when d.seguridad is distinct from a.seguridad then 'seguridad' end,
                       case when d.dueno is distinct from a.dueno then 'dueño' end,
                       case when d.proconfig is distinct from a.proconfig then 'proconfig' end,
                       case when d.volatilidad is distinct from a.volatilidad then 'volatilidad' end,
                       case when d.firma is distinct from a.firma then 'firma' end,
                       case when d.atributos is distinct from a.atributos then 'atributos' end) end difiere
      from fichas d left join acreditados a on a.tabla = d.tabla and a.nombre = d.nombre) x
),
-- presencia exacta (CTO 15-oct, tras Astra r8): un disparador de la lista que NO esta en su tabla tambien es NO
-- ACREDITADO (difiere: falta). El conjunto tiene que ser exactamente el acreditado: ni uno mas (veredictos) ni uno menos
faltan as (
  select a.tabla, a.nombre from acreditados a
   where not exists (select 1 from fichas d where d.tabla = a.tabla and d.nombre = a.nombre)
),
-- reglas (CTO 16-oct, ronda 9 del revisor interno): una regla de pg_rewrite en storage.objects o storage.buckets
-- equivale a un disparador que no ve ninguna guarda; entran en la presencia exacta y lo acreditado es NINGUNA
-- (una vista tiene la suya, _RETURN). Cualquiera, NO ACREDITADA: s14 manda PARAR y mercado-001 aborta
reglas as (
  select r.relname::text tabla, w.rulename::text nombre,
         pg_catalog.concat(case w.ev_type when '1' then 'SELECT' when '2' then 'UPDATE' when '3' then 'INSERT' when '4' then 'DELETE' else w.ev_type::text end,
                           case when w.is_instead then ' INSTEAD' else '' end, ' · habilitada=', w.ev_enabled::text) detalle
    from pg_catalog.pg_rewrite w join pg_catalog.pg_class r on r.oid = w.ev_class
   where w.ev_class in (pg_catalog.to_regclass('storage.objects'), pg_catalog.to_regclass('storage.buckets'))
),
-- E2R8-01 (Astra r8; CTO 16-oct, con la s14e de produccion): los disparadores INTERNOS de las dos tablas, por lista
-- EXACTA en las dos direcciones. Los ocho medidos son los de integridad referencial de las tres claves foraneas a
-- storage.buckets(id): funcion de pg_catalog (lenguaje internal), restriccion (tipo f), tabla relacionada, momento y
-- ordenes, habilitado 'O'. El nombre (RI_ConstraintTrigger_…) lleva un oid y no se usa. Uno de mas (otra FK, un
-- disparador marcado interno, otra accion) o uno de menos (una FK quitada): NO ACREDITADO, PARAR y aborto
internos_acreditados (tabla, funcion, restriccion, relacionada, disparo) as (values
  ('buckets'::text, 'pg_catalog.RI_FKey_noaction_del'::text, 'objects_bucketId_fkey'::text, 'storage.objects'::text, 'AFTER DELETE · por fila'::text),
  ('buckets', 'pg_catalog.RI_FKey_noaction_upd', 'objects_bucketId_fkey', 'storage.objects', 'AFTER UPDATE · por fila'),
  ('buckets', 'pg_catalog.RI_FKey_noaction_del', 's3_multipart_uploads_bucket_id_fkey', 'storage.s3_multipart_uploads', 'AFTER DELETE · por fila'),
  ('buckets', 'pg_catalog.RI_FKey_noaction_upd', 's3_multipart_uploads_bucket_id_fkey', 'storage.s3_multipart_uploads', 'AFTER UPDATE · por fila'),
  ('buckets', 'pg_catalog.RI_FKey_noaction_del', 's3_multipart_uploads_parts_bucket_id_fkey', 'storage.s3_multipart_uploads_parts', 'AFTER DELETE · por fila'),
  ('buckets', 'pg_catalog.RI_FKey_noaction_upd', 's3_multipart_uploads_parts_bucket_id_fkey', 'storage.s3_multipart_uploads_parts', 'AFTER UPDATE · por fila'),
  ('objects', 'pg_catalog.RI_FKey_check_ins', 'objects_bucketId_fkey', 'storage.buckets', 'AFTER INSERT · por fila'),
  ('objects', 'pg_catalog.RI_FKey_check_upd', 'objects_bucketId_fkey', 'storage.buckets', 'AFTER UPDATE · por fila')
),
internos as (
  -- R9I-02 (revisor interno): sin operadores sin calificar en lo nuevo (un «||» o un «&» ajenos de public, sin
  -- coincidencia exacta en pg_catalog, ganarian con el search_path del editor): pg_catalog.concat y operator(pg_catalog.…)
  select x.*,
         pg_catalog.concat_ws(', ',
           case when x.tgqual is not null then 'WHEN' end,
           case when x.nargs operator(pg_catalog.<>) 0 then 'argumentos' end,
           case when x.ncols is not null then 'columnas' end,
           case when not x.fk_coherente then 'tablas de la FK' end,
           case when not x.indice then 'indice' end,
           case when not x.diferible then 'diferible' end,
           case when not x.fk_medida then 'definicion de la FK' end) forma
    from (
      select r.relname::text tabla, pg_catalog.concat(n.nspname, '.', f.proname) funcion, coalesce(k.conname::text, '-') restriccion,
             case when rr.oid is null then '-' else pg_catalog.concat(rn.nspname, '.', rr.relname) end relacionada,
             pg_catalog.concat(
               case when (t.tgtype::pg_catalog.int4 operator(pg_catalog.&) 2) operator(pg_catalog.<>) 0 then 'BEFORE' when (t.tgtype::pg_catalog.int4 operator(pg_catalog.&) 64) operator(pg_catalog.<>) 0 then 'INSTEAD OF' else 'AFTER' end, ' ',
               pg_catalog.concat_ws('/', case when (t.tgtype::pg_catalog.int4 operator(pg_catalog.&) 4) operator(pg_catalog.<>) 0 then 'INSERT' end, case when (t.tgtype::pg_catalog.int4 operator(pg_catalog.&) 8) operator(pg_catalog.<>) 0 then 'DELETE' end,
                                        case when (t.tgtype::pg_catalog.int4 operator(pg_catalog.&) 16) operator(pg_catalog.<>) 0 then 'UPDATE' end, case when (t.tgtype::pg_catalog.int4 operator(pg_catalog.&) 32) operator(pg_catalog.<>) 0 then 'TRUNCATE' end),
               ' · ', case when (t.tgtype::pg_catalog.int4 operator(pg_catalog.&) 1) operator(pg_catalog.<>) 0 then 'por fila' else 'por sentencia' end) disparo,
             t.tgenabled::text habilitado, l.lanname::text lenguaje, coalesce(k.contype::text, '-') tipo,
             -- R9I-01 (revisor interno): la FORMA de un interno de integridad referencial. Sin WHEN, sin argumentos ni
             -- columnas, con las tablas, el indice y lo diferible de SU restriccion, y la FK tal como la midio la s14e:
             -- (bucket_id) → storage.buckets (id), NO ACTION en los dos sentidos, no diferible y validada
             t.tgqual, t.tgnargs::pg_catalog.int4 nargs, case when t.tgattr::pg_catalog.text operator(pg_catalog.=) '' then null else t.tgattr::pg_catalog.text end ncols,
             coalesce(k.oid is not null and ((t.tgrelid operator(pg_catalog.=) k.conrelid and t.tgconstrrelid operator(pg_catalog.=) k.confrelid)
                                           or (t.tgrelid operator(pg_catalog.=) k.confrelid and t.tgconstrrelid operator(pg_catalog.=) k.conrelid)), false) fk_coherente,
             coalesce(t.tgconstrindid operator(pg_catalog.=) k.conindid, false) indice,
             coalesce(t.tgdeferrable operator(pg_catalog.=) k.condeferrable and t.tginitdeferred operator(pg_catalog.=) k.condeferred, false) diferible,
             coalesce(k.contype operator(pg_catalog.=) 'f' and k.confrelid operator(pg_catalog.=) pg_catalog.to_regclass('storage.buckets')
                      and (select pg_catalog.array_agg(a.attname::text order by u.n) from pg_catalog.unnest(k.conkey) with ordinality u(c, n) join pg_catalog.pg_attribute a on a.attrelid operator(pg_catalog.=) k.conrelid and a.attnum operator(pg_catalog.=) u.c) operator(pg_catalog.=) array['bucket_id']::pg_catalog.text[]
                      and (select pg_catalog.array_agg(a.attname::text order by u.n) from pg_catalog.unnest(k.confkey) with ordinality u(c, n) join pg_catalog.pg_attribute a on a.attrelid operator(pg_catalog.=) k.confrelid and a.attnum operator(pg_catalog.=) u.c) operator(pg_catalog.=) array['id']::pg_catalog.text[]
                      and k.confupdtype operator(pg_catalog.=) 'a' and k.confdeltype operator(pg_catalog.=) 'a' and not k.condeferrable and k.convalidated
                      -- R9J-01 (revisor interno): los operadores de igualdad que ejecuta el RI, los de pg_catalog para text,
                      -- y el indice, el de la clave primaria de storage.buckets
                      and k.conpfeqop operator(pg_catalog.=) array['pg_catalog.=(text,text)'::pg_catalog.regoperator::pg_catalog.oid]
                      and k.conppeqop operator(pg_catalog.=) array['pg_catalog.=(text,text)'::pg_catalog.regoperator::pg_catalog.oid]
                      and k.conffeqop operator(pg_catalog.=) array['pg_catalog.=(text,text)'::pg_catalog.regoperator::pg_catalog.oid]
                      and k.conindid operator(pg_catalog.=) (select x.indexrelid from pg_catalog.pg_index x where x.indrelid operator(pg_catalog.=) pg_catalog.to_regclass('storage.buckets') and x.indisprimary), false) fk_medida
        from pg_catalog.pg_trigger t join pg_catalog.pg_class r on r.oid = t.tgrelid
             join pg_catalog.pg_proc f on f.oid = t.tgfoid join pg_catalog.pg_namespace n on n.oid = f.pronamespace join pg_catalog.pg_language l on l.oid = f.prolang
             left join pg_catalog.pg_constraint k on k.oid = t.tgconstraint
             left join pg_catalog.pg_class rr on rr.oid = t.tgconstrrelid left join pg_catalog.pg_namespace rn on rn.oid = rr.relnamespace
       where t.tgrelid in (pg_catalog.to_regclass('storage.objects'), pg_catalog.to_regclass('storage.buckets')) and t.tgisinternal) x
),
internos_veredicto as (
  select i.*, (i.forma operator(pg_catalog.=) '' and i.habilitado operator(pg_catalog.=) 'O' and i.lenguaje operator(pg_catalog.=) 'internal' and i.tipo operator(pg_catalog.=) 'f'
               and exists (select 1 from internos_acreditados a
                            where a.tabla operator(pg_catalog.=) i.tabla and a.funcion operator(pg_catalog.=) i.funcion and a.restriccion operator(pg_catalog.=) i.restriccion
                              and a.relacionada operator(pg_catalog.=) i.relacionada and a.disparo operator(pg_catalog.=) i.disparo)) acreditado
    from internos i
),
-- R9I-01: CUENTA exacta. Cada entrada de la lista, con exactamente un interno acreditado (0: falta; 2 o mas: repetido)
internos_cuenta as (
  select a.*, (select pg_catalog.count(*) from internos_veredicto i
                where i.acreditado and i.tabla operator(pg_catalog.=) a.tabla and i.funcion operator(pg_catalog.=) a.funcion and i.restriccion operator(pg_catalog.=) a.restriccion
                  and i.relacionada operator(pg_catalog.=) a.relacionada and i.disparo operator(pg_catalog.=) a.disparo)::pg_catalog.int4 n
    from internos_acreditados a
),
-- lo que no es un disparador de la lista y tampoco se acredita: (tabla, objeto, difiere)
otros as (
  select g.tabla, pg_catalog.concat('regla ', g.nombre) objeto, pg_catalog.concat('regla ', g.detalle, ': no se acredita ninguna') difiere from reglas g
  union all
  select i.tabla, pg_catalog.concat('interno ', i.funcion, ' · ', i.restriccion),
         pg_catalog.concat('interno ', i.disparo, ' · relacionada=', i.relacionada, ' · habilitado=', i.habilitado, ' · lenguaje=', i.lenguaje,
                           case when i.forma operator(pg_catalog.<>) '' then pg_catalog.concat(' · forma: ', i.forma) else '' end,
                           ': no esta en la lista de internos acreditados (s14e, 16-oct)')
    from internos_veredicto i where not i.acreditado
  union all
  select c.tabla, pg_catalog.concat('interno ', c.funcion, ' · ', c.restriccion),
         case when c.n operator(pg_catalog.=) 0 then pg_catalog.concat('falta (interno ', c.disparo, ' de la s14e, 16-oct)')
              else pg_catalog.concat('repetido (', c.n, ' internos ', c.disparo, ' para una sola entrada de la s14e, 16-oct)') end
    from internos_cuenta c where c.n operator(pg_catalog.<>) 1
)
-- <<< acreditados
select v.tabla, v.nombre, v.difiere from veredictos v
   where not v.acreditado
 union all
select f.tabla, f.nombre, 'falta' from faltan f
 union all
select o.tabla, o.objeto, o.difiere from otros o) v;
  if no_acreditados is not null then
    raise exception 'mercado-001: disparadores de storage NO ACREDITADOS: %. Su ficha, en s14; re-acreditar con el CTO; no se crea nada', no_acreditados;
  end if;
  -- R9-01 (revisor interno, ronda 9): la columna type tiene que ser DE ese tipo (no text, ni un dominio, ni otro enum);
  -- la misma expresion que en s14. Antes del INSERT
  if not coalesce((select a.atttypid from pg_catalog.pg_attribute a where a.attrelid = pg_catalog.to_regclass('storage.buckets') and a.attname = 'type' and not a.attisdropped) operator(pg_catalog.=) pg_catalog.to_regtype('storage.buckettype'), false) then
    raise exception 'mercado-001: la columna type de storage.buckets no es del tipo storage.buckettype (es %): la s14d (15-oct) midio storage.buckettype; no se crea nada',
      coalesce((select pg_catalog.format_type(a.atttypid, a.atttypmod) from pg_catalog.pg_attribute a where a.attrelid = pg_catalog.to_regclass('storage.buckets') and a.attname = 'type' and not a.attisdropped), '(no existe)');
  end if;
  -- E2R8-02 (Astra r8, CTO 15-oct): el enum storage.buckettype tiene que ser EXACTAMENTE el de la s14d, el array de
  -- etiquetas en el orden de enumsortorder; la misma expresion que en s14. Antes del INSERT: si no, no se crea nada
  if not coalesce((select pg_catalog.array_agg(v.enumlabel::pg_catalog.text order by v.enumsortorder) from pg_catalog.pg_enum v where v.enumtypid = pg_catalog.to_regtype('storage.buckettype')) operator(pg_catalog.=) array['STANDARD', 'ANALYTICS', 'VECTOR']::pg_catalog.text[], false) then
    raise exception 'mercado-001: el enum storage.buckettype no es el acreditado: %; la s14d (15-oct) midio {STANDARD,ANALYTICS,VECTOR}; no se crea nada',
      coalesce((select pg_catalog.array_agg(v.enumlabel::pg_catalog.text order by v.enumsortorder) from pg_catalog.pg_enum v where v.enumtypid = pg_catalog.to_regtype('storage.buckettype'))::pg_catalog.text, '(no es un enum o no existe)');
  end if;

  select * into b from storage.buckets where id = 'mercado' or name = 'mercado' limit 1;
  if found then
    if b.id = 'mercado' and b.name = 'mercado' and b.public = false and b.file_size_limit = 5242880 and b.allowed_mime_types is null
       and (select count(*) from storage.buckets where id = 'mercado' or name = 'mercado') = 1 then
      raise notice 'mercado-001: el bucket mercado ya existe con esta forma; no se toca nada';
    else
      raise exception 'mercado-001: ya existe un bucket mercado con otra forma (id=%, name=%, public=%, file_size_limit=%, allowed_mime_types=%)',
        b.id, b.name, b.public, b.file_size_limit, b.allowed_mime_types;
    end if;
  else
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('mercado', 'mercado', false, 5242880, null);
  end if;
  -- POSTCONDICION (CTO 15-oct, con la s14d; SIEMPRE, tambien si el bucket ya existia): type y versioning_status no se fijan (tienen valor por defecto,
  -- 'STANDARD' y 'DISABLED'); la fila, creada o ya existente, tiene que tenerlos, y el ciclo de vida a NULL. Por jsonb: si falta una
  -- columna, falta su clave y se aborta aqui. Pero puede abortar ANTES, en el INSERT, dentro de un disparador acreditado que lee NEW
  -- («record "new" has no field …», Astra r8): falla cerrado igual, con otro mensaje; este comentario no promete cual
  select pg_catalog.to_jsonb(x) into creada from storage.buckets x where x.id = 'mercado';
  if creada ->> 'type' is distinct from 'STANDARD' or creada ->> 'versioning_status' is distinct from 'DISABLED'
     or not (creada ? 'lifecycle_configuration' and creada ? 'lifecycle_configuration_generation')
     or creada -> 'lifecycle_configuration' is distinct from 'null'::jsonb or creada -> 'lifecycle_configuration_generation' is distinct from 'null'::jsonb then
    raise exception 'mercado-001: el bucket mercado no es el esperado (type=%, versioning_status=%, lifecycle_configuration=%, lifecycle_configuration_generation=%): se esperaba type=STANDARD, versioning_status=DISABLED (los valores por defecto de la s14d del 15-oct) y el ciclo de vida a NULL; no se crea nada',
      coalesce(creada ->> 'type', 'NULL'), coalesce(creada ->> 'versioning_status', 'NULL'), coalesce(creada ->> 'lifecycle_configuration', 'NULL'), coalesce(creada ->> 'lifecycle_configuration_generation', 'NULL');
  end if;

  -- CAPA 2: sonda con un centinela que se deshace
  ajuste_inicio := pg_catalog.current_setting('storage.allow_delete_query', true);
  if ajuste_inicio = 'true' then
    raise exception 'mercado-001: storage.allow_delete_query ya vale true al empezar: protect_delete no protege nada en esta sesion; no se crea nada; decide el CTO';
  end if;
  select exists (select 1 from pg_attribute where attrelid = 'storage.objects'::regclass and attname = 'owner' and not attisdropped) into con_owner;
  select exists (select 1 from pg_attribute where attrelid = 'storage.objects'::regclass and attname = 'owner_id' and not attisdropped) into con_owner_id;
  begin
    begin
      execute format('insert into storage.objects (bucket_id, name%s%s) values ($1, $2%s%s) returning id',
        case when con_owner then ', owner' else '' end, case when con_owner_id then ', owner_id' else '' end,
        case when con_owner then ', $3' else '' end, case when con_owner_id then ', $3::text' else '' end)
        into cid using 'mercado', centinela, sub;
    exception when others then
      raise exception 'mercado-001: sonda no concluyente: no se pudo crear el centinela (%: %); no se crea nada', sqlstate, sqlerrm;
    end;
    foreach rol in array array['anon', 'authenticated'] loop
      foreach op in array array['SELECT', 'UPDATE', 'DELETE'] loop
        begin
          execute format('set local role %I', rol);
          perform set_config('request.jwt.claims', case rol when 'anon' then json_build_object('role', rol) else json_build_object('role', rol, 'sub', sub) end::text, true);
          perform set_config('request.jwt.claim.role', rol, true);
          perform set_config('request.jwt.claim.sub', case rol when 'anon' then '' else sub::text end, true);
          -- UPDATE y DELETE SOLO DEL CENTINELA (E2R2-02): nada sobre otros
          -- buckets. Con WHERE, PostgreSQL exige ademas las politicas SELECT: lo
          -- que una UPDATE/DELETE abierta permitiria lo cierra la precondicion.
          -- Lo que alcanzan se mira despues como el rol de partida; todo se
          -- deshace al salir.
          if op = 'SELECT' then
            execute 'select count(*) from storage.objects where bucket_id = $1 and name = $2' into k using 'mercado', centinela;
          elsif op = 'UPDATE' then
            execute 'update storage.objects set metadata = $1 where id = $2' using jsonb_build_object('sonda_mercado_001', centinela), cid;
            execute format('set local role %I', yo);
            execute 'select count(*) from storage.objects where bucket_id = $1 and name = $2 and metadata ->> ''sonda_mercado_001'' = $2' into k using 'mercado', centinela;
          else
            -- protect_delete (CTO 14-oct): el ajuste SOLO para esta sentencia, como la API de Storage; se repone
            -- justo despues y la subtransaccion se deshace igual. Asi lo que se prueba es la RLS
            ajuste_previo := pg_catalog.current_setting('storage.allow_delete_query', true);
            perform pg_catalog.set_config('storage.allow_delete_query', 'true', true);
            execute 'delete from storage.objects where id = $1' using cid;
            perform pg_catalog.set_config('storage.allow_delete_query', coalesce(ajuste_previo, ''), true);
            execute format('set local role %I', yo);
            execute 'select 1 - count(*) from storage.objects where bucket_id = $1 and name = $2' into k using 'mercado', centinela;
          end if;
          if k > 0 then alcance := alcance || rol || ' ' || op || '; '; end if;
          raise exception using errcode = 'MR002', message = 'mercado-001: operacion de la sonda deshecha';
        exception
          when sqlstate 'MR002' then null;
          when insufficient_privilege then
            if sqlerrm ~ '^Direct deletion from storage tables' then
              -- el 42501 de protect_delete NUNCA es «la RLS bloquea» (CTO 14-oct)
              dudas := dudas || rol || ' ' || op || ': 42501 con el mensaje de protect_delete (' || sqlerrm || '): no prueba la RLS; ';
            elsif sqlerrm !~ '^permission denied for (table objects|schema storage)$' then
              dudas := dudas || rol || ' ' || op || ': ' || sqlstate || ' ' || sqlerrm || '; ';
            end if;
          when others then
            dudas := dudas || rol || ' ' || op || ': ' || sqlstate || ' ' || sqlerrm || '; ';
        end;
      end loop;
    end loop;
    raise exception using errcode = 'MR001', message = 'mercado-001: centinela deshecho';
  exception when sqlstate 'MR001' then null;
  end;
  if current_user::text <> yo then
    raise exception 'mercado-001: tras la sonda el rol es % y no %; no se crea nada', current_user, yo;
  end if;
  if pg_catalog.current_setting('storage.allow_delete_query', true) = 'true' then
    raise exception 'mercado-001: tras la sonda storage.allow_delete_query vale true; no se crea nada';
  end if;
  -- CTO 14-oct (3a): la prueba FUNCIONAL de que protect_delete vuelve a proteger. Un DELETE directo, como quien
  -- ejecuta, de una fila que no existe: tiene que fallar con el error de protect_delete (es por sentencia: salta
  -- aunque no haya filas). Si pasa, o falla por otra cosa, aborta
  begin
    execute 'delete from storage.objects where id = $1' using gen_random_uuid();
    raise exception using errcode = 'MR003', message = 'mercado-001: tras la sonda, un DELETE directo de prueba NO lo para protect_delete; no se crea nada';
  exception
    when insufficient_privilege then
      if sqlerrm !~ '^Direct deletion from storage tables is not allowed' then
        raise exception 'mercado-001: tras la sonda, el DELETE directo de prueba fallo por otra cosa (%: %), no por protect_delete; no se crea nada', sqlstate, sqlerrm;
      end if;
  end;
  if exists (select 1 from storage.objects where bucket_id = 'mercado' and name = centinela) then
    raise exception 'mercado-001: el centinela de la sonda no se ha deshecho; no se crea nada';
  end if;
  if alcance <> '' then
    raise exception 'mercado-001: la sonda ALCANZA el bucket mercado: %no se crea nada', alcance;
  end if;
  if dudas <> '' then
    raise exception 'mercado-001: sonda no concluyente: %no se crea nada', dudas;
  end if;

  -- comprobacion final
  if (select count(*) from storage.buckets where id = 'mercado' and name = 'mercado' and public = false and file_size_limit = 5242880 and allowed_mime_types is null) <> 1 then
    raise exception 'mercado-001: el bucket no ha quedado como debe';
  end if;
end $m$;

select seccion, detalle from (
  select 1 o, 'bucket' seccion, b.id || ' · public=' || b.public || ' · file_size_limit=' || coalesce(b.file_size_limit::text, '-')
         || ' · allowed_mime_types=' || coalesce(b.allowed_mime_types::text, '-') detalle
    from storage.buckets b where b.id = 'mercado'
  union all
  -- CTO 15-oct: lo que la postcondicion exige (despues del INSERT); aqui, lo que tiene la fila
  select 1, 'postcondicion', 'bucket mercado · type=' || coalesce(j ->> 'type', 'NULL') || ' · versioning_status=' || coalesce(j ->> 'versioning_status', 'NULL')
         || ' · lifecycle_configuration=' || coalesce(j ->> 'lifecycle_configuration', 'NULL') || ' · lifecycle_configuration_generation=' || coalesce(j ->> 'lifecycle_configuration_generation', 'NULL')
    from (select to_jsonb(b) j from storage.buckets b where b.id = 'mercado') y
  union all
  select 2, 'rls', 'storage.objects · rls=' || c.relrowsecurity from pg_class c where c.oid = 'storage.objects'::regclass
  union all
  select 3, 'politicas de storage.objects', count(*)::text || ' (todas reconocidas: si no, no se habria llegado aqui)' from pg_policies p where p.schemaname = 'storage' and p.tablename = 'objects'
  union all
  select 4, 'sonda', 'anon y authenticated no alcanzan un centinela de mercado (SELECT, UPDATE y DELETE del centinela; el DELETE con storage.allow_delete_query=true solo en su sentencia, para probar la RLS y no protect_delete); centinela deshecho; ninguna politica de escritura para ellos'
  union all
  -- CTO 14-oct (3a): si el DO llego al final, el DELETE directo de prueba tras la sonda lo paro protect_delete
  select 4, 'protect_delete', 'tras la sonda, un DELETE directo de prueba (fila inexistente) fallo con el error de protect_delete: vuelve a proteger · md5 acreditado 998d324ea2b1abc49351e8c2367b5796'
  union all
  select 4, 'limites', 'lock_timeout=' || current_setting('lock_timeout') || ' · statement_timeout=' || current_setting('statement_timeout') || ' (en el editor, una sola transaccion: 5s y 30s; dentro del DO, lock_timeout=5s siempre)'
  union all
  select 5, 'objetos en mercado', count(*)::text from storage.objects o where o.bucket_id = 'mercado'
  union all
  select 6, 'FIN', 'mercado-001 aplicada'
) x order by o, detalle;
