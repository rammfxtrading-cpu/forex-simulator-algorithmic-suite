// LAS FUNCIONES DE STORAGE DE SUPABASE QUE SE HAN MEDIDO EN PRODUCCION, byte a
// byte (s14b y s14c del 14-oct: sql/consultas/salidas/). El cuerpo de cada una
// reproduce su prosrc exacto: la prueba que las usa comprueba el md5 contra el
// medido. Lo que no se ha medido no esta aqui.
export const MD5 = {
  protect_delete: '998d324ea2b1abc49351e8c2367b5796',
  update_updated_at_column: '7596e66a7698d5a6b5129c5ce9b24c5f',
}
export const PROTECT_DELETE = `create function storage.protect_delete() returns trigger language plpgsql as $f$
BEGIN
    -- Check if storage.allow_delete_query is set to 'true'
    IF COALESCE(current_setting('storage.allow_delete_query', true), 'false') != 'true' THEN
        RAISE EXCEPTION 'Direct deletion from storage tables is not allowed. Use the Storage API instead.'
            USING HINT = 'This prevents accidental data loss from orphaned objects.',
                  ERRCODE = '42501';
    END IF;
    RETURN NULL;
END;
$f$;`
export const UPDATE_UPDATED_AT = `create function storage.update_updated_at_column() returns trigger language plpgsql as $f$
BEGIN
    NEW.updated_at = now();
    RETURN NEW; 
END;
$f$;`
// los dos disparadores de storage.objects, como los enseño la s14b (pg_get_triggerdef)
export const DISPARADORES_OBJETOS = `create trigger protect_objects_delete before delete on storage.objects for each statement execute function storage.protect_delete();
create trigger update_objects_updated_at before update on storage.objects for each row execute function storage.update_updated_at_column();`
export const PROTECT_BUCKETS_DELETE = `create trigger protect_buckets_delete before delete on storage.buckets for each statement execute function storage.protect_delete();`
// la consulta que comprueba que el montaje tiene los cuerpos medidos
export const COMPRUEBA_MD5 = `select string_agg(proname || '=' || md5(prosrc), ',' order by proname) from pg_proc where pronamespace = 'storage'::regnamespace and proname in ('protect_delete', 'update_updated_at_column')`
export const MD5_ESPERADO = `protect_delete=${MD5.protect_delete},update_updated_at_column=${MD5.update_updated_at_column}`

// LAS FUNCIONES DE LOS DISPARADORES DE STORAGE.BUCKETS, byte a byte como las midio la s14c (14-oct:
// sql/consultas/salidas/s14c-disparadores-buckets-2026-10-14.csv; acreditadas por el CTO el 14-oct).
// Con su proconfig medido (search_path=pg_catalog en dos de ellas)
export const ENFORCE_BUCKET_NAME_LENGTH = `create function storage.enforce_bucket_name_length() returns trigger language plpgsql as $f$
begin
    if length(new.name) > 100 then
        raise exception 'bucket name "%" is too long (% characters). Max is 100.', new.name, length(new.name);
    end if;
    return new;
end;
$f$;`
export const PROTECT_BUCKET_CONTROL_COLUMNS = `create function storage.protect_bucket_control_columns() returns trigger language plpgsql set search_path = pg_catalog as $f$
DECLARE
  configuration_changed boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.lifecycle_configuration IS NOT NULL
       OR NEW.lifecycle_configuration_generation IS NOT NULL THEN
      IF NOT pg_has_role(current_user, TG_ARGV[0], 'MEMBER') THEN
        RAISE EXCEPTION 'only members of the configured storage service role may insert lifecycle policy state'
          USING ERRCODE = '42501',
                HINT = format(
                  'Insert with both lifecycle columns NULL and configure lifecycle through the Storage API afterward, or insert as a member of %I.',
                  TG_ARGV[0]
                );
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  configuration_changed =
    OLD.lifecycle_configuration IS DISTINCT FROM NEW.lifecycle_configuration
    OR OLD.lifecycle_configuration_generation IS DISTINCT FROM NEW.lifecycle_configuration_generation;

  IF NOT configuration_changed THEN
    RETURN NEW;
  END IF;

  IF NEW.type IS DISTINCT FROM 'STANDARD' THEN
    RAISE EXCEPTION 'bucket versioning and lifecycle controls require a Standard bucket'
      USING ERRCODE = '0A000';
  END IF;

  IF NEW.lifecycle_configuration IS NULL
     AND NEW.lifecycle_configuration_generation IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.lifecycle_configuration IS NULL
     OR NEW.lifecycle_configuration_generation IS NULL
     OR OLD.lifecycle_configuration IS NOT DISTINCT FROM NEW.lifecycle_configuration
     OR OLD.lifecycle_configuration_generation IS NOT DISTINCT FROM NEW.lifecycle_configuration_generation THEN
    RAISE EXCEPTION 'a changed lifecycle policy requires a new non-null generation'
      USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$f$;`
export const ENFORCE_BUCKET_LIFECYCLE_SERVICE_ROLE = `create function storage.enforce_bucket_lifecycle_service_role() returns trigger language plpgsql set search_path = pg_catalog as $f$
BEGIN
  IF current_user::text IS DISTINCT FROM TG_ARGV[0]
     AND (
       OLD.lifecycle_configuration IS DISTINCT FROM NEW.lifecycle_configuration
       OR OLD.lifecycle_configuration_generation IS DISTINCT FROM NEW.lifecycle_configuration_generation
     ) THEN
    -- AFTER runs only after caller RLS has accepted the proposed row. The API
    -- recognizes this specific error after rolling back its permission probe;
    -- direct non-service writes still fail and cannot persist the change.
    RAISE EXCEPTION 'bucket control columns may only be changed by the configured storage service role'
      USING ERRCODE = 'PST01',
            SCHEMA = TG_TABLE_SCHEMA,
            TABLE = TG_TABLE_NAME,
            CONSTRAINT = TG_NAME;
  END IF;

  RETURN NULL;
END;
$f$;`
export const MD5_BUCKETS = {
  enforce_bucket_name_length: 'bd3d77a2603f7f344035a81def5502fa',
  protect_bucket_control_columns: '7870415452678f5aa85f91dde952ef12',
  enforce_bucket_lifecycle_service_role: '7691066f4111610b457b74bdead6e80b',
}
// las columnas de ciclo de vida que esas funciones leen (s14c: jsonb y uuid, admiten NULL; s14d: sin valor por defecto)
export const COLUMNAS_CICLO = `alter table storage.buckets add column if not exists lifecycle_configuration jsonb, add column if not exists lifecycle_configuration_generation uuid;`
// type y versioning_status, NOT NULL, como los midio la s14d (15-oct: sql/consultas/salidas/s14d-columnas-buckets-2026-10-15.csv):
// el enum storage.buckettype con sus tres valores en su orden y los dos valores por defecto. protect_bucket_control_columns lee NEW.type
export const TIPO_Y_VERSIONADO = `create type storage.buckettype as enum ('STANDARD', 'ANALYTICS', 'VECTOR');
alter table storage.buckets add column type storage.buckettype not null default 'STANDARD', add column versioning_status text not null default 'DISABLED';`
// los cinco disparadores de storage.buckets, como los enseño la s14b (pg_get_triggerdef)
export const DISPARADORES_BUCKETS = `create trigger enforce_bucket_name_length_trigger before insert or update of name on storage.buckets for each row execute function storage.enforce_bucket_name_length();
create trigger protect_bucket_control_insert before insert on storage.buckets for each row execute function storage.protect_bucket_control_columns('service_role');
create trigger protect_bucket_control_update before update of lifecycle_configuration, lifecycle_configuration_generation on storage.buckets for each row execute function storage.protect_bucket_control_columns();
create trigger protect_bucket_control_update_role after update of lifecycle_configuration, lifecycle_configuration_generation on storage.buckets for each row execute function storage.enforce_bucket_lifecycle_service_role('service_role');
create trigger protect_buckets_delete before delete on storage.buckets for each statement execute function storage.protect_delete();`
export const COMPRUEBA_MD5_BUCKETS = `select string_agg(proname || '=' || md5(prosrc), ',' order by proname) from pg_proc where pronamespace = 'storage'::regnamespace and proname in ('enforce_bucket_name_length', 'protect_bucket_control_columns', 'enforce_bucket_lifecycle_service_role')`
export const MD5_BUCKETS_ESPERADO = Object.entries(MD5_BUCKETS).sort(([a], [b]) => a < b ? -1 : 1).map(([k, v]) => `${k}=${v}`).join(',')

// E2R7-01: el dueño medido de las cinco funciones (s14b y s14c: supabase_storage_admin). En el montaje las crea el
// superusuario del ensayo; aqui pasan a ese rol, como en produccion (crear funciones con otro dueño no cambia prosrc)
export const DUENO_STORAGE = `do $r$ begin if not exists (select 1 from pg_roles where rolname = 'supabase_storage_admin') then create role supabase_storage_admin nologin; end if; end $r$;
alter function storage.protect_delete() owner to supabase_storage_admin;
alter function storage.update_updated_at_column() owner to supabase_storage_admin;
alter function storage.enforce_bucket_name_length() owner to supabase_storage_admin;
alter function storage.protect_bucket_control_columns() owner to supabase_storage_admin;
alter function storage.enforce_bucket_lifecycle_service_role() owner to supabase_storage_admin;`
// la ficha de cada una en el montaje, con la forma de la s14b/s14c («plpgsql · SECURITY INVOKER · dueño=… · proconfig=… · volatilidad=…»)
export const FICHAS_MONTAJE = `select string_agg(p.proname || ': ' || l.lanname || ' · SECURITY ' || case when p.prosecdef then 'DEFINER' else 'INVOKER' end || ' · dueño=' || pg_get_userbyid(p.proowner)
  || ' · proconfig=' || coalesce(array_to_string(p.proconfig, ','), '-') || ' · volatilidad=' || p.provolatile::text, E'\n' order by p.proname)
  from pg_proc p join pg_language l on l.oid = p.prolang where p.pronamespace = 'storage'::regnamespace
   and p.proname in ('protect_delete', 'update_updated_at_column', 'enforce_bucket_name_length', 'protect_bucket_control_columns', 'enforce_bucket_lifecycle_service_role')`
