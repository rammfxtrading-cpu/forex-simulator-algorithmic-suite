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
--     NUNCA cuenta como «la RLS bloquea»: es «sonda no concluyente». El informe
--     dice el valor del ajuste al terminar. NOTA (PostgreSQL): una vez fijado en
--     la sesion, al deshacerse vuelve a '' (vacio), no a NULL; protect_delete
--     lo trata igual (COALESCE('', 'false') != 'true': bloquea).
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

  -- CAPA 2: sonda con un centinela que se deshace
  -- protect_delete (CTO 14-oct): el disparador de Supabase tiene que estar, con su forma y habilitado
  if not exists (select 1 from pg_catalog.pg_trigger t join pg_catalog.pg_proc f on f.oid = t.tgfoid join pg_catalog.pg_namespace n on n.oid = f.pronamespace
                  where t.tgrelid = 'storage.objects'::regclass and t.tgname = 'protect_objects_delete' and not t.tgisinternal
                    and t.tgenabled in ('O', 'A') and n.nspname = 'storage' and f.proname = 'protect_delete'
                    and t.tgtype & 1 = 0 and t.tgtype & 2 = 2 and t.tgtype & 8 = 8) then
    raise exception 'mercado-001: falta el disparador protect_objects_delete de Supabase en storage.objects (BEFORE DELETE por sentencia, storage.protect_delete) o esta desactivado: la sonda no seria la del Storage medido; no se crea nada; decide el CTO';
  end if;
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
  select 2, 'rls', 'storage.objects · rls=' || c.relrowsecurity from pg_class c where c.oid = 'storage.objects'::regclass
  union all
  select 3, 'politicas de storage.objects', count(*)::text || ' (todas reconocidas: si no, no se habria llegado aqui)' from pg_policies p where p.schemaname = 'storage' and p.tablename = 'objects'
  union all
  select 4, 'sonda', 'anon y authenticated no alcanzan un centinela de mercado (SELECT, UPDATE y DELETE del centinela; el DELETE con storage.allow_delete_query=true solo en su sentencia, para probar la RLS y no protect_delete); centinela deshecho; ninguna politica de escritura para ellos'
  union all
  select 4, 'ajuste', 'storage.allow_delete_query al terminar = ' || coalesce('«' || pg_catalog.current_setting('storage.allow_delete_query', true) || '»', 'NULL')
         || case when pg_catalog.current_setting('storage.allow_delete_query', true) = 'true' then ' · ES TRUE: PARAR' else ' (no es true: protect_delete vuelve a bloquear los DELETE directos)' end
  union all
  select 4, 'limites', 'lock_timeout=' || current_setting('lock_timeout') || ' · statement_timeout=' || current_setting('statement_timeout') || ' (en el editor, una sola transaccion: 5s y 30s; dentro del DO, lock_timeout=5s siempre)'
  union all
  select 5, 'objetos en mercado', count(*)::text from storage.objects o where o.bucket_id = 'mercado'
  union all
  select 6, 'FIN', 'mercado-001 aplicada'
) x order by o, detalle;
