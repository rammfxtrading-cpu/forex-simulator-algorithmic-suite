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
-- del CTO). Sin politicas que lo nombren, authenticated y anon no leen ni
-- escriben nada del bucket.
--
-- GUARDAS (aborta sin tocar nada, con «mercado-001:» en el error):
--   · storage.buckets o storage.objects no existen;
--   · la RLS de storage.objects esta apagada (sin ella, un bucket privado se
--     lee por la API con cualquier JWT);
--   · alguna politica de storage.objects PODRIA aplicarse a «mercado»: cada
--     expresion (USING / WITH CHECK) tiene que contener la comparacion literal
--     bucket_id = '<otro bucket>' y no contener OR, <>, !=, NOT ni ANY; una
--     politica que nombre 'mercado' tambien aborta. Lo que no se pueda
--     afirmar asi, lo decide el CTO;
--   · ya existe un bucket con id o nombre «mercado» y OTRA forma (publico,
--     otro limite, tipos MIME, o id y nombre distintos).
-- IDEMPOTENTE: si ya existe con esta misma forma, no toca nada y lo dice.
--
-- COMO SE APLICA: entera, en el editor SQL de Supabase (como postgres): un
-- DO (atomico: o todo o nada) y una SELECT de informe que acaba en «FIN |
-- mercado-001 aplicada». Ensayada en PostgreSQL 17 local (pruebas/mercado-001-
-- bucket.mjs), dos veces y con cada guarda en rojo. Antes y despues: la
-- consulta s14 (solo lectura).
-- NO comprobado en local: si el editor de Supabase deja a postgres insertar en
-- storage.buckets (la documentacion de Supabase lo muestra asi). Si lo
-- rechaza, no se ha creado nada: la alternativa (crearlo desde el panel,
-- privado y con 5 MB) la decide el CTO, y s14 lo comprueba igual.
-- ============================================================================
do $m$
declare
  b record;
  malas text;
begin
  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then
    raise exception 'mercado-001: no existen storage.buckets o storage.objects';
  end if;
  if not (select c.relrowsecurity from pg_class c where c.oid = 'storage.objects'::regclass) then
    raise exception 'mercado-001: la RLS de storage.objects esta apagada: un bucket privado no lo seria';
  end if;
  select string_agg(p.policyname || ' (' || p.cmd || ')', ', ' order by p.policyname) into malas
    from pg_policies p
   where p.schemaname = 'storage' and p.tablename = 'objects'
     and not (
       (p.qual is not null or p.with_check is not null)
       and coalesce(p.qual ~ 'bucket_id = ''[^'']+''::text' and p.qual !~* '( OR |<>|!=|NOT |ANY)' and p.qual !~ '''mercado''', true)
       and coalesce(p.with_check ~ 'bucket_id = ''[^'']+''::text' and p.with_check !~* '( OR |<>|!=|NOT |ANY)' and p.with_check !~ '''mercado''', true)
     );
  if malas is not null then
    raise exception 'mercado-001: politicas de storage.objects que podrian aplicarse al bucket mercado: %. Las decide el CTO; no se crea nada', malas;
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
  select 3, 'politicas de storage.objects', count(*)::text from pg_policies p where p.schemaname = 'storage' and p.tablename = 'objects'
  union all
  select 4, 'FIN', 'mercado-001 aplicada'
) x order by o, detalle;
