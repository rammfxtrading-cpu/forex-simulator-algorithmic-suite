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
--     tambien las RESTRICTIVE— es NO RECONOCIDA y aborta. El clasificador
--     es el mismo texto que en s14 (pruebas/mercado-001-bucket.mjs comprueba
--     que es identico);
--   · ya existe un bucket con id o nombre «mercado» y OTRA forma (publico,
--     otro limite, tipos MIME, o id y nombre distintos);
--   · CAPA 2, SONDA (CTO 14-oct): con el bucket ya insertado y dentro de la
--     misma transaccion, un objeto CENTINELA inventado en «mercado»; como anon
--     y como authenticated (SET LOCAL ROLE, con request.jwt.claims de un sub
--     aleatorio, dueño del centinela), un SELECT de ese objeto y un UPDATE y
--     un DELETE A CIEGAS de la tabla (sin WHERE: con WHERE, PostgreSQL exige
--     tambien las politicas SELECT y una UPDATE/DELETE abierta no se veria),
--     cada uno en su subtransaccion deshecha; si el centinela fue leido,
--     marcado o borrado, aborta. Si alguno falla por algo que no sea la falta de
--     permiso sobre storage.objects o el esquema storage, aborta tambien
--     («sonda no concluyente»: p. ej. un disparador). El centinela se deshace
--     siempre (ROLLBACK de su subtransaccion) y se comprueba que no queda y
--     que el rol vuelve a ser el de antes. No crea politicas ni grants.
-- IDEMPOTENTE: si ya existe con esta misma forma, no lo toca, lo dice y
-- vuelve a pasar las dos capas.
--
-- COMO SE APLICA: entera, en el editor SQL de Supabase (como postgres): un
-- DO (atomico: o todo o nada) y una SELECT de informe que acaba en «FIN |
-- mercado-001 aplicada». Ensayada en PostgreSQL 17 local
-- (pruebas/mercado-001-bucket.mjs), como superusuario y como un postgres no
-- superusuario con bypassrls (s06), con cada guarda en rojo. Antes y despues:
-- la consulta s14 (solo lectura), que enseña el texto de cada politica.
-- NO comprobado en local: si el editor de Supabase deja a postgres insertar en
-- storage.buckets y storage.objects y hacer SET LOCAL ROLE anon/authenticated
-- (en otras migraciones lo hizo: sql/ del simulador, k.4), ni que disparadores
-- tiene storage.objects en produccion (s14 los lista: uno por sentencia en
-- DELETE haria la sonda no concluyente). Si el editor rechaza el INSERT en
-- storage.buckets: alternativa del panel en el runbook (decision 4 del CTO).
-- ============================================================================
do $m$
declare
  b record;
  malas text;
  yo text := current_user;
  sub uuid := gen_random_uuid();
  centinela text := 'v1/_sonda-mercado-001-' || md5(clock_timestamp()::text || random()::text);
  con_owner boolean;
  con_owner_id boolean;
  rol text;
  op text;
  k bigint;
  alcance text := '';
  dudas text := '';
begin
  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then
    raise exception 'mercado-001: no existen storage.buckets o storage.objects';
  end if;
  if not (select c.relrowsecurity from pg_class c where c.oid = 'storage.objects'::regclass) then
    raise exception 'mercado-001: la RLS de storage.objects esta apagada: un bucket privado no lo seria';
  end if;

  -- CAPA 1: lista blanca
  select string_agg(v.policyname || ' (' || v.cmd || ')', ', ' order by v.policyname) into malas
    from (
with recursive
-- >>> clasificador (identico en sql/mercado-001-bucket.sql y sql/consultas/s14-mercado-storage.sql)
pol as (
  select p.policyname, p.cmd, p.permissive, p.roles::text roles, p.qual, p.with_check
    from pg_policies p where p.schemaname = 'storage' and p.tablename = 'objects'
),
ex as (
  select policyname, 'USING' cual, qual t from pol where qual is not null
  union all
  select policyname, 'WITH CHECK', with_check from pol where with_check is not null
),
-- caracter a caracter: d0/d1 = profundidad de parentesis antes/despues, q = comilla abierta
car (policyname, cual, t, i, c, d0, d1, q) as (
  select policyname, cual, t, 1, left(t, 1), 0,
         case left(t, 1) when '(' then 1 when ')' then -1 else 0 end,
         case when left(t, 1) in ('''', '"') then left(t, 1) else '' end
    from ex where t <> ''
  union all
  select policyname, cual, t, i + 1, substr(t, i + 1, 1), d1,
         d1 + case when q <> '' then 0 when substr(t, i + 1, 1) = '(' then 1 when substr(t, i + 1, 1) = ')' then -1 else 0 end,
         case when q = '' and substr(t, i + 1, 1) in ('''', '"') then substr(t, i + 1, 1) when q <> '' and substr(t, i + 1, 1) = q then '' else q end
    from car where i < length(t)
),
-- esqueleto: lo que queda a profundidad 0-1; una conjuncion de nivel superior es «(() AND () ...)»
forma as (
  select policyname, cual,
         string_agg(case when least(d0, d1) <= 1 then c else '' end, '' order by i) esqueleto,
         bool_and(d1 >= 1 or i = length(t)) envuelta,
         max(case when i = length(t) then d1::text || '|' || q end) final
    from car group by policyname, cual
),
exp_ok as (
  select e.policyname, e.cual,
         case
           when e.t ~ '''mercado''' then null
           when e.t ~ '^\(bucket_id = ''[^'']*''::text\)$' then substring(e.t from '^\(bucket_id = ''([^'']*)''::text\)$')
           when f.envuelta and f.final = '0|' and f.esqueleto ~ '^\(\(\)( AND \(\))+\)$' then
             (select min(substring(substr(g.t, g.i) from '^\(bucket_id = ''([^'']*)''::text\)'))
                from car g where g.policyname = e.policyname and g.cual = e.cual and g.c = '(' and g.d0 = 1 and g.d1 = 2)
         end bucket
    from ex e left join forma f on f.policyname = e.policyname and f.cual = e.cual
),
veredicto as (
  select p.policyname, p.cmd, p.permissive, p.roles, p.qual, p.with_check,
         case when (p.cmd = 'INSERT' and p.with_check is null) or (p.cmd <> 'INSERT' and p.qual is null) then null
              when exists (select 1 from exp_ok e where e.policyname = p.policyname and e.bucket is null) then null
              else (select string_agg(distinct e.bucket, ', ') from exp_ok e where e.policyname = p.policyname) end buckets
    from pol p
)
-- <<< clasificador
select * from veredicto
    ) v where v.buckets is null;
  if malas is not null then
    raise exception 'mercado-001: politicas de storage.objects NO RECONOCIDAS (podrian aplicarse al bucket mercado): %. Su texto, en s14; las decide el CTO; no se crea nada', malas;
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
  select exists (select 1 from pg_attribute where attrelid = 'storage.objects'::regclass and attname = 'owner' and not attisdropped) into con_owner;
  select exists (select 1 from pg_attribute where attrelid = 'storage.objects'::regclass and attname = 'owner_id' and not attisdropped) into con_owner_id;
  begin
    begin
      execute format('insert into storage.objects (bucket_id, name%s%s) values ($1, $2%s%s)',
        case when con_owner then ', owner' else '' end, case when con_owner_id then ', owner_id' else '' end,
        case when con_owner then ', $3' else '' end, case when con_owner_id then ', $3::text' else '' end)
        using 'mercado', centinela, sub;
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
          -- UPDATE y DELETE A CIEGAS (sin WHERE y sin leer columnas): con WHERE,
          -- PostgreSQL exige ademas las politicas SELECT y no se veria una
          -- politica UPDATE/DELETE abierta (medido en local). Lo que alcanzan
          -- se mira despues como el rol de partida; todo se deshace al salir.
          if op = 'SELECT' then
            execute 'select count(*) from storage.objects where bucket_id = $1 and name = $2' into k using 'mercado', centinela;
          elsif op = 'UPDATE' then
            execute 'update storage.objects set metadata = $1' using jsonb_build_object('sonda_mercado_001', centinela);
            execute format('set local role %I', yo);
            execute 'select count(*) from storage.objects where bucket_id = $1 and name = $2 and metadata ->> ''sonda_mercado_001'' = $2' into k using 'mercado', centinela;
          else
            execute 'delete from storage.objects';
            execute format('set local role %I', yo);
            execute 'select 1 - count(*) from storage.objects where bucket_id = $1 and name = $2' into k using 'mercado', centinela;
          end if;
          if k > 0 then alcance := alcance || rol || ' ' || op || '; '; end if;
          raise exception using errcode = 'MR002', message = 'mercado-001: operacion de la sonda deshecha';
        exception
          when sqlstate 'MR002' then null;
          when insufficient_privilege then
            if sqlerrm !~ '^permission denied for (table objects|schema storage)$' then
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
  select 4, 'sonda', 'anon y authenticated no alcanzan un centinela de mercado (SELECT, UPDATE, DELETE); centinela deshecho'
  union all
  select 5, 'objetos en mercado', count(*)::text from storage.objects o where o.bucket_id = 'mercado'
  union all
  select 6, 'FIN', 'mercado-001 aplicada'
) x order by o, detalle;
