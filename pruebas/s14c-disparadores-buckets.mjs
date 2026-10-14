/**
 * S14c (LAS FUNCIONES DE LOS DISPARADORES DE STORAGE.BUCKETS POR DENTRO) ·
 * ENSAYO EN POSTGRESQL 17 LOCAL (etapa 2; CTO 14-oct, tras la s14b).
 *
 * ⚠️ Las funciones de buckets de abajo son INVENTADAS (no se conocen las de
 *    Supabase: la s14c existe para verlas). protect_delete es la de la s14b,
 *    byte a byte (md5 998d324ea2b1abc49351e8c2367b5796).
 *
 *   1 en READ ONLY: corre, acaba en FIN, la base no cambia (foto con control);
 *     tambien fuera de READ ONLY y como un no superusuario
 *   2 cada funcion que dispara un disparador de storage.buckets: ficha (con
 *     argumentos y quien la usa) y cuerpo que reconstruye prosrc byte a byte;
 *     el md5 es el de s14b
 *   3 los ajustes que leen, sin valor y con valor
 *   4 las tres por su nombre, si faltan: «NO EXISTE»; una funcion AJENA (fuera
 *     de storage) usada por un disparador de buckets tambien sale
 */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { titulo, ver, oraculo, fin, fuente } from './lib.mjs'
import { BIN, hayPostgres, cluster, STUB } from './pg-ensayo.mjs'
import { PROTECT_DELETE } from './storage-supabase.mjs'
if (!hayPostgres()) { ver(`PostgreSQL 17 en ${BIN}: NO hay, la prueba no se ha ejecutado`, false); fin() }
const S14C = fuente('sql/consultas/s14c-disparadores-buckets.sql')
const S14B = fuente('sql/consultas/s14b-disparadores-storage.sql')
const pg = cluster()

// INVENTADAS (ver la cabecera), salvo protect_delete
const FUNCIONES = `
alter table storage.buckets add column if not exists lifecycle_configuration jsonb, add column if not exists lifecycle_configuration_generation int;
${PROTECT_DELETE}
create function storage.enforce_bucket_name_length() returns trigger language plpgsql as $f$
begin
    if length(new.name) > 100 then
        raise exception 'bucket name too long';
    end if;
    return new;
end;
$f$;
create function storage.protect_bucket_control_columns() returns trigger language plpgsql as $f$
begin
    if coalesce(current_setting('storage.bucket_control', true), '') <> coalesce(tg_argv[0], '') then
        new.lifecycle_configuration := null;
    end if;
    return new;
end;
$f$;
create function storage.enforce_bucket_lifecycle_service_role() returns trigger language plpgsql security definer set search_path = '' as $f$
begin
    return null;
end;
$f$;
create trigger enforce_bucket_name_length_trigger before insert or update of name on storage.buckets for each row execute function storage.enforce_bucket_name_length();
create trigger protect_bucket_control_insert before insert on storage.buckets for each row execute function storage.protect_bucket_control_columns('service_role');
create trigger protect_bucket_control_update before update of lifecycle_configuration, lifecycle_configuration_generation on storage.buckets for each row execute function storage.protect_bucket_control_columns();
create trigger protect_bucket_control_update_role after update of lifecycle_configuration, lifecycle_configuration_generation on storage.buckets for each row execute function storage.enforce_bucket_lifecycle_service_role('service_role');
create trigger protect_buckets_delete before delete on storage.buckets for each statement execute function storage.protect_delete();`

let n = 0
const monta = (extra = '') => {
  const db = `c${++n}`
  const pasos = [pg.psql(`create database ${db}`, 'postgres'), pg.psql(STUB, db), ...(extra ? [pg.psql(extra, db)] : [])]
  if (!pasos.every(x => x.ok)) throw new Error(`montaje ${db}: ${pasos.map(x => x.err).join(' ')}`)
  return db
}
const s14c = db => pg.psql(`begin read only;\n${S14C}\nrollback;`, db)
const filas = r => r.out.split('\n')
const fila = (r, sec, obj) => filas(r).find(l => l.startsWith(`${sec}|${obj}|`))
const foto = db => {
  const r = pg.psql(`select md5(coalesce((select string_agg(p.oid::text || p.proname || md5(p.prosrc) || coalesce(p.proconfig::text, ''), ',' order by p.oid) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('storage', 'public')), '-')
  || coalesce((select string_agg(t.oid::text || t.tgname || t.tgenabled::text, ',' order by t.oid) from pg_trigger t where not t.tgisinternal), '-')
  || (select count(*)::text from storage.objects) || (select count(*)::text from storage.buckets))`, db)
  if (!r.ok || !/^[0-9a-f]{32}$/.test(r.out)) throw new Error(`foto ${db}: ${r.err || r.out}`)
  return r.out
}
const md5De = (r, nombre) => (filas(r).find(l => l.startsWith(`funcion|storage.${nombre}(`)) || '').match(/md5 del cuerpo ([0-9a-f]{12})/)?.[1]

try {
  pg.arranca()
  titulo('1 · en READ ONLY: corre, acaba en FIN y no cambia nada')
  const d = monta(FUNCIONES)
  const antes = foto(d)
  ver('control: la foto ve un cambio (un disparador desactivado y vuelto a activar)', (() => {
    pg.psql(`alter table storage.buckets disable trigger protect_bucket_control_insert`, d); const x = foto(d) !== antes
    pg.psql(`alter table storage.buckets enable trigger protect_bucket_control_insert`, d); return x && foto(d) === antes
  })())
  const r = s14c(d)
  oraculo('S14c', 'corre dentro de una transaccion READ ONLY y acaba en «FIN | s14c | consulta»', r.ok && filas(r).at(-1) === 'FIN|s14c|consulta', r.err || filas(r).at(-1))
  oraculo('S14c', 'la base no cambia', foto(d) === antes)
  const sinRO = pg.psql(S14C, d)
  oraculo('S14c', 'tambien fuera de READ ONLY (como en el editor): la misma salida y la base no cambia', sinRO.ok && sinRO.out === r.out && foto(d) === antes)
  oraculo('S14c', 'el texto no escribe: ni insert, update, delete, set_config, execute, create, alter ni grant fuera de comentarios y literales',
    !/\b(insert|update|delete|set_config|execute|create|alter|grant|revoke|truncate|copy)\b/i.test(S14C.replace(/--.*$/gm, '').replace(/'[^']*'/g, "''")))
  pg.psql(`do $r$ begin if not exists (select 1 from pg_roles where rolname = 'pgx') then create role pgx login nosuperuser bypassrls createrole; end if; end $r$;`, 'postgres')
  pg.psql(`grant usage on schema storage to pgx; grant select on all tables in schema storage to pgx;`, d)
  const f = path.join(pg.dir, 'c.sql'); writeFileSync(f, `begin read only;\n${S14C}\nrollback;`)
  const rp = spawnSync(path.join(BIN, 'psql'), ['-h', pg.dir, '-p', pg.puerto, '-U', 'pgx', '-X', '-q', '-tA', '-v', 'ON_ERROR_STOP=1', '-d', d, '-f', f], { encoding: 'utf8', env: { PATH: process.env.PATH, LC_ALL: 'en_US.UTF-8', LANG: 'en_US.UTF-8' } })
  oraculo('S14c', 'como un no superusuario con USAGE en storage (el postgres de produccion): la misma salida', rp.status === 0 && rp.stdout.trim() === r.out, (rp.stderr || '').trim())

  titulo('2 · las funciones de buckets: ficha y cuerpo')
  for (const [nombre, args] of [['enforce_bucket_name_length', ''], ['protect_bucket_control_columns', ''], ['enforce_bucket_lifecycle_service_role', ''], ['protect_delete', '']]) {
    const md5 = pg.psql(`select md5(prosrc) from pg_proc where proname = '${nombre}' and pronamespace = 'storage'::regnamespace`, d).out
    const lineas = filas(r).filter(l => l.startsWith(`cuerpo|storage.${nombre} `)).map(l => l.slice(`cuerpo|storage.${nombre} 000|`.length))
    oraculo('S14c', `${nombre}: ficha y cuerpo que reconstruye prosrc byte a byte (${lineas.length} lineas)`, !!fila(r, 'funcion', `storage.${nombre}(${args})`) && lineas.length > 2 && createHash('md5').update(lineas.join('\n')).digest('hex') === md5, md5)
  }
  oraculo('S14c', 'la ficha dice SECURITY DEFINER, proconfig, devuelve y quien la usa', /^funcion\|storage\.enforce_bucket_lifecycle_service_role\(\)\|existe · plpgsql · SECURITY DEFINER · dueño=postgres · proconfig=search_path="" · devuelve=trigger · volatilidad=v · md5 del cuerpo [0-9a-f]{12} \(completo [0-9a-f]{32}\) · lineas=\d+ · la usan: buckets\.protect_bucket_control_update_role$/.test(fila(r, 'funcion', 'storage.enforce_bucket_lifecycle_service_role()') || ''), fila(r, 'funcion', 'storage.enforce_bucket_lifecycle_service_role()'))
  oraculo('S14c', 'una funcion usada por dos disparadores lo dice', /la usan: buckets\.protect_bucket_control_insert, buckets\.protect_bucket_control_update$/.test(fila(r, 'funcion', 'storage.protect_bucket_control_columns()') || ''))
  oraculo('S14c', 'protect_delete sale con el md5 de produccion (998d324ea2b1) y la usa protect_buckets_delete', /md5 del cuerpo 998d324ea2b1 \(completo 998d324ea2b1abc49351e8c2367b5796\).*la usan: buckets\.protect_buckets_delete$/.test(fila(r, 'funcion', 'storage.protect_delete()') || ''))
  const b = pg.psql(`begin read only;\n${S14B}\nrollback;`, d)
  const md5b = (filas(b).find(l => l.startsWith('disparador|buckets.(funcion)|protect_bucket_control_insert')) || '').match(/md5 del cuerpo ([0-9a-f]{12})/)?.[1]
  oraculo('S14c', 'el md5 de 12 hex es el mismo que enseña s14b para el disparador', !!md5b && md5b === md5De(r, 'protect_bucket_control_columns'), `${md5b} / ${md5De(r, 'protect_bucket_control_columns')}`)

  titulo('3 · los ajustes')
  oraculo('S14c', 'los dos ajustes que leen, sin valor', fila(r, 'ajuste', 'storage.allow_delete_query') === 'ajuste|storage.allow_delete_query|lo lee storage.protect_delete · current_setting en esta sesion = (sin valor: NULL)' && fila(r, 'ajuste', 'storage.bucket_control') === 'ajuste|storage.bucket_control|lo lee storage.protect_bucket_control_columns · current_setting en esta sesion = (sin valor: NULL)', filas(r).filter(l => l.startsWith('ajuste')).join(' / '))
  const dSet = monta(FUNCIONES)
  pg.psql(`alter database ${dSet} set storage.bucket_control = 'x'`, 'postgres')
  oraculo('S14c', 'con valor fijado por base, lo enseña', /current_setting en esta sesion = «x»$/.test(fila(s14c(dSet), 'ajuste', 'storage.bucket_control') || ''))
  oraculo('S14c', 'las columnas de storage.buckets salen', !!fila(r, 'columna', 'storage.buckets.lifecycle_configuration') && !!fila(r, 'columna', 'storage.buckets.id'))

  titulo('4 · si faltan, y una funcion ajena')
  const r0 = s14c(monta())
  oraculo('S14c', 'sin las funciones: las tres «NO EXISTE», sin cuerpo, y FIN', r0.ok && ['enforce_bucket_name_length', 'protect_bucket_control_columns', 'enforce_bucket_lifecycle_service_role'].every(x => fila(r0, 'funcion', `storage.${x}`) === `funcion|storage.${x}|NO EXISTE`) && !filas(r0).some(l => l.startsWith('cuerpo|')) && filas(r0).at(-1) === 'FIN|s14c|consulta' && fila(r0, 'ajuste', '(resumen)') === 'ajuste|(resumen)|ninguna de estas funciones lee current_setting', r0.err || r0.out)
  const rA = s14c(monta(`create function public.ajena() returns trigger language plpgsql as $f$ begin perform pg_notify('x', 'y'); return new; end $f$;
create trigger ajena before insert on storage.buckets for each row execute function public.ajena();`))
  oraculo('S14c', 'una funcion ajena (public) que usa un disparador de buckets: sale con su cuerpo', /^funcion\|public\.ajena\(\)\|existe · plpgsql/.test(fila(rA, 'funcion', 'public.ajena()') || '') && filas(rA).some(l => /^cuerpo\|public\.ajena 001\|.*pg_notify/.test(l)), rA.err || filas(rA).filter(l => /ajena/.test(l)).join(' / '))
} finally { pg.cierra() }
fin()
