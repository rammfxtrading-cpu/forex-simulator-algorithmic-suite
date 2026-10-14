// LAS FUNCIONES DE STORAGE DE SUPABASE QUE SE HAN MEDIDO EN PRODUCCION, byte a
// byte (s14b del 14-oct: sql/consultas/salidas/s14b-disparadores-storage-
// 2026-10-14.csv). El cuerpo de cada una reproduce su prosrc exacto: la prueba
// que las usa comprueba el md5 contra el medido. Lo que no se ha medido no
// esta aqui (las funciones de storage.buckets salen de la s14c).
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
