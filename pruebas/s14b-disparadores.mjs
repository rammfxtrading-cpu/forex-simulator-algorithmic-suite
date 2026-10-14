/**
 * S14b (LOS DISPARADORES DE STORAGE POR DENTRO) · ENSAYO EN POSTGRESQL 17 LOCAL
 * (etapa 2; CTO 14-oct, tras la s14 de produccion que dio «PARAR» por dos
 * disparadores en storage.objects).
 *
 * ⚠️ Las dos funciones de abajo son INVENTADAS con la forma que se espera de
 *    Supabase; no son las de produccion. La s14b existe para ver las reales.
 *    Aqui solo se prueba que la consulta enseña lo que dice, sin escribir nada.
 *
 *   1 en READ ONLY: corre, acaba en FIN, y la base no cambia (foto del catalogo
 *     de funciones, disparadores y ajustes antes y despues, con control)
 *   2 el cuerpo: las lineas numeradas reconstruyen prosrc byte a byte; el md5
 *     de 12 hex es el mismo que enseña s14 para ese disparador
 *   3 la ficha: lenguaje, SECURITY DEFINER o INVOKER, dueño, proconfig
 *   4 los disparadores: pg_get_triggerdef y tgenabled (tambien DESACTIVADO);
 *     los de storage.buckets aparte
 *   5 los ajustes: el que lee la funcion, sin valor y con valor fijado por base
 *     (que tambien sale en «ajuste fijado»); session_replication_role
 *   6 privilegios de anon y authenticated sobre storage.objects
 *   7 sin las funciones: «NO EXISTE»
 */
import { createHash } from 'node:crypto'
import { titulo, ver, oraculo, fin, fuente } from './lib.mjs'
import { BIN, hayPostgres, cluster, STUB } from './pg-ensayo.mjs'
if (!hayPostgres()) { ver(`PostgreSQL 17 en ${BIN}: NO hay, la prueba no se ha ejecutado`, false); fin() }
const S14B = fuente('sql/consultas/s14b-disparadores-storage.sql')
const S14 = fuente('sql/consultas/s14-mercado-storage.sql')
const pg = cluster()

// INVENTADAS (ver la cabecera)
const FUNCIONES = `
alter table storage.objects add column if not exists updated_at timestamptz default now(), add column if not exists metadata jsonb;
create function storage.protect_delete() returns trigger language plpgsql as $f$
begin
    if coalesce(current_setting('storage.allow_delete_query', true), 'false') != 'true' then
        raise exception 'Direct deletion from storage tables is not allowed. Use the Storage API instead.'
            using hint = 'This prevents accidental data loss from orphaned objects.', errcode = '42501';
    end if;
    return null;
end;
$f$;
create function storage.update_updated_at_column() returns trigger language plpgsql as $f$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$f$;
create trigger protect_objects_delete before delete on storage.objects for each statement execute function storage.protect_delete();
create trigger update_objects_updated_at before update on storage.objects for each row execute function storage.update_updated_at_column();
create trigger protect_buckets_delete before delete on storage.buckets for each statement execute function storage.protect_delete();
grant usage on schema storage to anon, authenticated;
grant all on storage.objects to anon, authenticated;`

let n = 0
const monta = (extra = '') => {
  const db = `b${++n}`
  const pasos = [pg.psql(`create database ${db}`, 'postgres'), pg.psql(STUB, db), ...(extra ? [pg.psql(extra, db)] : [])]
  if (!pasos.every(x => x.ok)) throw new Error(`montaje ${db}: ${pasos.map(x => x.err).join(' ')}`)
  return db
}
const s14b = db => pg.psql(`begin read only;\n${S14B}\nrollback;`, db)
const filas = r => r.out.split('\n')
const fila = (r, sec, obj) => filas(r).find(l => l.startsWith(`${sec}|${obj}|`))
const foto = db => {
  const r = pg.psql(`select md5(coalesce((select string_agg(p.oid::text || p.proname || md5(p.prosrc) || coalesce(p.proconfig::text, ''), ',' order by p.oid) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'storage'), '-')
  || coalesce((select string_agg(t.oid::text || t.tgname || t.tgenabled::text, ',' order by t.oid) from pg_trigger t where not t.tgisinternal), '-')
  || coalesce((select string_agg(s.setconfig::text, ',' order by s.setdatabase, s.setrole) from pg_db_role_setting s), '-')
  || (select count(*)::text from storage.objects) || (select count(*)::text from storage.buckets))`, db)
  if (!r.ok || !/^[0-9a-f]{32}$/.test(r.out)) throw new Error(`foto ${db}: ${r.err || r.out}`)
  return r.out
}

try {
  pg.arranca()
  titulo('1 · en READ ONLY: corre, acaba en FIN y no cambia nada')
  const d = monta(FUNCIONES)
  const antes = foto(d)
  ver('control: la foto ve un cambio (un disparador desactivado y vuelto a activar cambia tgenabled)', (() => {
    pg.psql(`alter table storage.objects disable trigger update_objects_updated_at`, d); const x = foto(d) !== antes
    pg.psql(`alter table storage.objects enable trigger update_objects_updated_at`, d); return x && foto(d) === antes
  })())
  const r = s14b(d)
  oraculo('S14b', 'corre dentro de una transaccion READ ONLY y acaba en «FIN | s14b | consulta»', r.ok && filas(r).at(-1) === 'FIN|s14b|consulta', r.err || filas(r).at(-1))
  oraculo('S14b', 'la base no cambia (funciones, disparadores, ajustes, filas de storage)', foto(d) === antes)
  const sinRO = pg.psql(S14B, d)
  oraculo('S14b', 'tambien fuera de READ ONLY (como en el editor): la misma salida y la base no cambia', sinRO.ok && sinRO.out === r.out && foto(d) === antes)
  oraculo('S14b', 'el texto no escribe: ni insert, update, delete, set_config, execute, create, alter ni grant fuera de comentarios',
    !/\b(insert|update|delete|set_config|execute|create|alter|grant|revoke|truncate|copy)\b/i.test(S14B.replace(/--.*$/gm, '').replace(/'[^']*'/g, "''").replace(/'UPDATE'|'DELETE'|'INSERT'/g, '')))

  titulo('2 · el cuerpo, linea a linea, y el md5 de s14')
  for (const f of ['protect_delete', 'update_updated_at_column']) {
    const md5 = pg.psql(`select md5(prosrc) from pg_proc where proname = '${f}' and pronamespace = 'storage'::regnamespace`, d).out
    const lineas = filas(r).filter(l => l.startsWith(`cuerpo|storage.${f} `)).map(l => l.slice(`cuerpo|storage.${f} 000|`.length))
    oraculo('S14b', `${f}: las lineas numeradas reconstruyen el cuerpo byte a byte (${lineas.length} lineas, md5 de prosrc)`, lineas.length > 2 && createHash('md5').update(lineas.join('\n')).digest('hex') === md5, md5)
  }
  const s14 = pg.psql(`begin read only;\n${S14}\nrollback;`, d)
  const md5s14 = (fila(s14, 'disparador', 'protect_objects_delete') || '').match(/md5 del cuerpo ([0-9a-f]{12})/)?.[1]
  const md5b = (fila(r, 'funcion', 'storage.protect_delete') || '').match(/md5 del cuerpo ([0-9a-f]{12})/)?.[1]
  oraculo('S14b', 'el md5 de 12 hex de protect_delete es el mismo que enseña s14 para protect_objects_delete', !!md5s14 && md5s14 === md5b, `${md5s14} / ${md5b}`)
  const md5u14 = (fila(s14, 'disparador', 'update_objects_updated_at') || '').match(/md5 del cuerpo ([0-9a-f]{12})/)?.[1]
  oraculo('S14b', 'y el de update_updated_at_column, el de update_objects_updated_at', !!md5u14 && (fila(r, 'funcion', 'storage.update_updated_at_column') || '').includes(`md5 del cuerpo ${md5u14}`))

  titulo('3 · la ficha de cada funcion')
  oraculo('S14b', 'protect_delete: plpgsql, SECURITY INVOKER, dueño postgres, proconfig -', /^funcion\|storage\.protect_delete\|existe · plpgsql · SECURITY INVOKER · dueño=postgres · proconfig=- · volatilidad=v · md5 del cuerpo [0-9a-f]{12} \(completo [0-9a-f]{32}\) · lineas=\d+$/.test(fila(r, 'funcion', 'storage.protect_delete') || ''), fila(r, 'funcion', 'storage.protect_delete'))
  const dDef = monta(FUNCIONES + `\nalter function storage.update_updated_at_column() security definer set search_path = '';`)
  oraculo('S14b', 'con SECURITY DEFINER y search_path fijado, lo dice', /SECURITY DEFINER · dueño=postgres · proconfig=search_path=""/.test(fila(s14b(dDef), 'funcion', 'storage.update_updated_at_column') || ''), fila(s14b(dDef), 'funcion', 'storage.update_updated_at_column'))

  titulo('4 · los disparadores')
  oraculo('S14b', 'protect_objects_delete: su definicion y tgenabled=O', fila(r, 'disparador', 'objects.protect_objects_delete') === 'disparador|objects.protect_objects_delete|CREATE TRIGGER protect_objects_delete BEFORE DELETE ON storage.objects FOR EACH STATEMENT EXECUTE FUNCTION storage.protect_delete() · tgenabled=O (se dispara: origin/local)', fila(r, 'disparador', 'objects.protect_objects_delete'))
  oraculo('S14b', 'update_objects_updated_at: por fila', /^disparador\|objects\.update_objects_updated_at\|CREATE TRIGGER update_objects_updated_at BEFORE UPDATE ON storage\.objects FOR EACH ROW EXECUTE FUNCTION storage\.update_updated_at_column\(\) · tgenabled=O/.test(fila(r, 'disparador', 'objects.update_objects_updated_at') || ''))
  oraculo('S14b', 'los de storage.buckets, aparte, con su funcion; y el resumen cuenta los dos sitios', !!fila(r, 'disparador', 'buckets.protect_buckets_delete') && /protect_buckets_delete → storage\.protect_delete/.test(fila(r, 'disparador', 'buckets.(funcion)') || '') && fila(r, 'disparador', '(resumen)') === 'disparador|(resumen)|storage.objects: 2 · storage.buckets: 1', fila(r, 'disparador', '(resumen)'))
  const dDes = monta(FUNCIONES + `\nalter table storage.objects disable trigger protect_objects_delete;`)
  oraculo('S14b', 'un disparador desactivado dice DESACTIVADO', /tgenabled=D \(DESACTIVADO\)$/.test(fila(s14b(dDes), 'disparador', 'objects.protect_objects_delete') || ''))

  titulo('5 · los ajustes')
  oraculo('S14b', 'el ajuste que lee protect_delete, sin valor: NULL, y nada fijado', fila(r, 'ajuste', 'storage.allow_delete_query') === 'ajuste|storage.allow_delete_query|lo lee storage.protect_delete · current_setting en esta sesion = (sin valor: NULL)' && fila(r, 'ajuste fijado', '(resumen)') === 'ajuste fijado|(resumen)|ningun ajuste storage.* fijado por base o por rol', fila(r, 'ajuste', 'storage.allow_delete_query'))
  oraculo('S14b', 'session_replication_role sale', fila(r, 'ajuste', 'session_replication_role') === 'ajuste|session_replication_role|origin')
  const dSet = monta(FUNCIONES)
  pg.psql(`alter database ${dSet} set storage.allow_delete_query = 'true'`, 'postgres')
  const rSet = s14b(dSet)
  oraculo('S14b', 'fijado por base: lo enseña su valor en la sesion y la fila «ajuste fijado»', /current_setting en esta sesion = «true»$/.test(fila(rSet, 'ajuste', 'storage.allow_delete_query') || '') && fila(rSet, 'ajuste fijado', `base=${dSet} · rol=(todos)`) === `ajuste fijado|base=${dSet} · rol=(todos)|storage.allow_delete_query=true`, filas(rSet).filter(l => /^ajuste/.test(l)).join(' / '))
  const dSin = monta(FUNCIONES.replace(`if coalesce(current_setting('storage.allow_delete_query', true), 'false') != 'true' then`, 'if true then'))
  oraculo('S14b', 'si las funciones no leen ajustes, lo dice', fila(s14b(dSin), 'ajuste', '(resumen)') === 'ajuste|(resumen)|ninguna de las dos funciones lee current_setting')

  titulo('6 · privilegios de anon y authenticated')
  oraculo('S14b', 'anon y authenticated: SELECT,INSERT,UPDATE,DELETE en storage.objects, USAGE y EXECUTE', ['anon', 'authenticated'].every(x => fila(r, 'privilegios', `${x} en storage.objects`) === `privilegios|${x} en storage.objects|SELECT,INSERT,UPDATE,DELETE · USAGE en storage=si · EXECUTE de storage.protect_delete=si`), filas(r).filter(l => /^privilegios/.test(l)).join(' / '))
  const dNo = monta(FUNCIONES + `\nrevoke delete on storage.objects from anon;`)
  oraculo('S14b', 'sin DELETE para anon, lo dice', fila(s14b(dNo), 'privilegios', 'anon en storage.objects') === 'privilegios|anon en storage.objects|SELECT,INSERT,UPDATE · USAGE en storage=si · EXECUTE de storage.protect_delete=si')

  titulo('7 · sin las funciones')
  const r0 = s14b(monta())
  oraculo('S14b', 'sin las funciones: las dos «NO EXISTE», sin cuerpo, sin disparadores, y FIN', r0.ok && fila(r0, 'funcion', 'storage.protect_delete') === 'funcion|storage.protect_delete|NO EXISTE' && fila(r0, 'funcion', 'storage.update_updated_at_column') === 'funcion|storage.update_updated_at_column|NO EXISTE' && !filas(r0).some(l => l.startsWith('cuerpo|')) && fila(r0, 'disparador', '(resumen)') === 'disparador|(resumen)|storage.objects: 0 · storage.buckets: 0' && filas(r0).at(-1) === 'FIN|s14b|consulta', r0.err || r0.out)
} finally { pg.cierra() }
fin()
