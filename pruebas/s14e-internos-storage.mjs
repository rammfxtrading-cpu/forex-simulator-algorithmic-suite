/**
 * S14e (DISPARADORES INTERNOS, CLAVES FORANEAS Y REGLAS DE STORAGE) · ENSAYO EN
 * POSTGRESQL 17 LOCAL (etapa 2, ronda 9; para E2R8-01 de Astra r8).
 *
 * El montaje lleva la clave foranea storage.objects.bucket_id → storage.buckets.id
 * (pg-ensayo), que crea cuatro disparadores internos RI_FKey_*, y los siete externos
 * de Supabase. Aqui se prueba que la consulta enseña lo que dice, sin escribir nada.
 *
 *   1 en READ ONLY: corre, acaba en FIN y la base no cambia; tambien como un no
 *     superusuario con USAGE en storage
 *   2 los cuatro internos de la clave foranea, con su funcion, restriccion y tabla
 *     relacionada; el recuento de externos (7) e internos (4)
 *   3 la clave foranea; una nueva desde otra tabla tambien sale (y sus internos)
 *   4 las reglas: ninguna; una regla añadida sale
 *   5 un interno que no es de integridad referencial (tgisinternal puesto a mano) sale
 *     con su funcion de storage y «(sin restriccion)»
 */
import { spawnSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { titulo, ver, oraculo, fin, fuente } from './lib.mjs'
import { BIN, hayPostgres, cluster, STUB } from './pg-ensayo.mjs'
import { PROTECT_DELETE, UPDATE_UPDATED_AT, DISPARADORES_OBJETOS, TIPO_Y_VERSIONADO, COLUMNAS_CICLO, ENFORCE_BUCKET_NAME_LENGTH, PROTECT_BUCKET_CONTROL_COLUMNS, ENFORCE_BUCKET_LIFECYCLE_SERVICE_ROLE, DISPARADORES_BUCKETS } from './storage-supabase.mjs'
if (!hayPostgres()) { ver(`PostgreSQL 17 en ${BIN}: NO hay, la prueba no se ha ejecutado`, false); fin() }
const S14E = fuente('sql/consultas/s14e-internos-storage.sql')
const pg = cluster()
const REALES = `alter table storage.objects add column metadata jsonb, add column updated_at timestamptz default now(), add column owner_id text;`
const STORAGE = `${REALES}\n${PROTECT_DELETE}\n${UPDATE_UPDATED_AT}\n${DISPARADORES_OBJETOS}\n${TIPO_Y_VERSIONADO}\n${COLUMNAS_CICLO}\n${ENFORCE_BUCKET_NAME_LENGTH}\n${PROTECT_BUCKET_CONTROL_COLUMNS}\n${ENFORCE_BUCKET_LIFECYCLE_SERVICE_ROLE}\n${DISPARADORES_BUCKETS}`

let n = 0
const monta = (extra = '') => {
  const db = `e${++n}`
  const pasos = [pg.psql(`create database ${db}`, 'postgres'), pg.psql(STUB, db), pg.psql(STORAGE, db), ...(extra ? [pg.psql(extra, db)] : [])]
  if (!pasos.every(x => x.ok)) throw new Error(`montaje ${db}: ${pasos.map(x => x.err).join(' ')}`)
  return db
}
const s14e = db => pg.psql(`begin read only;\n${S14E}\nrollback;`, db)
const filas = r => r.out.split('\n')
const de = (r, sec) => filas(r).filter(l => l.startsWith(`${sec}|`))
const foto = db => {
  const r = pg.psql(`select md5(coalesce((select string_agg(tgrelid::regclass::text || tgname || tgenabled::text || tgisinternal::text, ',' order by tgrelid, tgname) from pg_trigger), '')
    || coalesce((select string_agg(rulename::text, ',' order by rulename) from pg_rewrite where ev_class in ('storage.buckets'::regclass, 'storage.objects'::regclass)), '')
    || (select count(*)::text from storage.buckets) || (select count(*)::text from storage.objects))`, db)
  if (!r.ok || !/^[0-9a-f]{32}$/.test(r.out)) throw new Error(`foto ${db}: ${r.err || r.out}`)
  return r.out
}

try {
  pg.arranca()
  titulo('1 · en READ ONLY: corre, acaba en FIN y no cambia nada')
  const d = monta()
  const antes = foto(d)
  ver('control: la foto ve un cambio (un disparador desactivado y vuelto a activar)', (() => {
    pg.psql(`alter table storage.buckets disable trigger protect_buckets_delete`, d); const x = foto(d) !== antes
    pg.psql(`alter table storage.buckets enable trigger protect_buckets_delete`, d); return x && foto(d) === antes
  })())
  const r = s14e(d)
  oraculo('S14e', 'corre en READ ONLY y acaba en «FIN | s14e | consulta»', r.ok && filas(r).at(-1) === 'FIN|s14e|consulta', r.err || filas(r).at(-1))
  oraculo('S14e', 'la base no cambia', foto(d) === antes)
  oraculo('S14e', 'el texto no escribe: ni insert, update, delete, set_config, execute, create, alter ni grant fuera de comentarios y literales',
    !/\b(insert|update|delete|set_config|execute|create|alter|grant|revoke|truncate|copy)\b/i.test(S14E.replace(/--.*$/gm, '').replace(/'[^']*'/g, "''")))
  pg.psql(`do $r$ begin if not exists (select 1 from pg_roles where rolname = 'pgx') then create role pgx login nosuperuser bypassrls createrole; end if; end $r$;`, 'postgres')
  pg.psql(`grant usage on schema storage to pgx;`, d)
  const f = path.join(pg.dir, 'e.sql'); writeFileSync(f, `begin read only;\n${S14E}\nrollback;`)
  const rp = spawnSync(path.join(BIN, 'psql'), ['-h', pg.dir, '-p', pg.puerto, '-U', 'pgx', '-X', '-q', '-tA', '-v', 'ON_ERROR_STOP=1', '-d', d, '-f', f], { encoding: 'utf8', env: { PATH: process.env.PATH, LC_ALL: 'en_US.UTF-8', LANG: 'en_US.UTF-8' } })
  oraculo('S14e', 'como un no superusuario con USAGE en storage: corre y da la misma salida (solo catalogo)', rp.status === 0 && (rp.stdout || '').trim() === r.out, (rp.stderr || '').trim())

  titulo('2 · los internos de la clave foranea')
  const internos = de(r, 'interno')
  const esperados = [
    ['storage.buckets · pg_catalog.RI_FKey_noaction_del · objects_bucket_id_fkey', /^AFTER DELETE · por fila · habilitado=O · lenguaje=internal · restriccion=objects_bucket_id_fkey \(f\) · tabla relacionada=storage\.objects · nombre=RI_ConstraintTrigger_a_\d+$/],
    ['storage.buckets · pg_catalog.RI_FKey_noaction_upd · objects_bucket_id_fkey', /^AFTER UPDATE · por fila · habilitado=O · lenguaje=internal · restriccion=objects_bucket_id_fkey \(f\) · tabla relacionada=storage\.objects · nombre=RI_ConstraintTrigger_a_\d+$/],
    ['storage.objects · pg_catalog.RI_FKey_check_ins · objects_bucket_id_fkey', /^AFTER INSERT · por fila · habilitado=O · lenguaje=internal · restriccion=objects_bucket_id_fkey \(f\) · tabla relacionada=storage\.buckets · nombre=RI_ConstraintTrigger_c_\d+$/],
    ['storage.objects · pg_catalog.RI_FKey_check_upd · objects_bucket_id_fkey', /^AFTER UPDATE · por fila · habilitado=O · lenguaje=internal · restriccion=objects_bucket_id_fkey \(f\) · tabla relacionada=storage\.buckets · nombre=RI_ConstraintTrigger_c_\d+$/],
  ]
  oraculo('S14e', 'los cuatro internos RI_FKey_* de objects_bucket_id_fkey, cada uno con su tabla, funcion, restriccion y tabla relacionada', internos.length === 4 && esperados.every(([o, re]) => internos.some(l => l.startsWith(`interno|${o}|`) && re.test(l.split('|')[2]))), internos.join(' / '))
  oraculo('S14e', 'el recuento: buckets 5 no internos y 2 internos; objects 2 no internos y 2 internos', de(r, 'externos').join(' / ') === 'externos|storage.buckets|5 no internos · 2 internos / externos|storage.objects|2 no internos · 2 internos', de(r, 'externos').join(' / '))
  oraculo('S14e', 'las dos tablas: tablas normales, sin particion ni hijas', de(r, 'tabla').join(' / ') === 'tabla|storage.buckets|relkind=r · particion=false · hijas=0 / tabla|storage.objects|relkind=r · particion=false · hijas=0', de(r, 'tabla').join(' / '))

  titulo('3 · las claves foraneas')
  oraculo('S14e', 'la clave foranea objects → buckets, con sus columnas y acciones', de(r, 'fk').join(' / ') === 'fk|objects_bucket_id_fkey|storage.objects (bucket_id) → storage.buckets (id) · on delete=a · on update=a · diferible=false · validada=true', de(r, 'fk').join(' / '))
  const r3 = s14e(monta(`create table public.ajena (id serial primary key, b text references storage.buckets(id) on delete cascade);`))
  oraculo('S14e', 'una clave foranea nueva desde otra tabla hacia storage.buckets sale, y sus dos internos en buckets (cascade y noaction_upd)', de(r3, 'fk').some(l => l === 'fk|ajena_b_fkey|public.ajena (b) → storage.buckets (id) · on delete=c · on update=a · diferible=false · validada=true') && de(r3, 'interno').some(l => l.startsWith('interno|storage.buckets · pg_catalog.RI_FKey_cascade_del · ajena_b_fkey|')) && de(r3, 'externos')[0] === 'externos|storage.buckets|5 no internos · 4 internos', [...de(r3, 'fk'), ...de(r3, 'externos')].join(' / '))

  titulo('4 · las reglas')
  oraculo('S14e', 'sin reglas: «0 reglas»', de(r, 'regla').join(' / ') === 'regla|(resumen)|0 reglas', de(r, 'regla').join(' / '))
  const r4 = s14e(monta(`create rule astra_regla as on insert to storage.buckets do also select 1;`))
  oraculo('S14e', 'una regla añadida en storage.buckets sale con su evento', de(r4, 'regla').join(' / ') === 'regla|storage.buckets · astra_regla|evento=3 · instead=false · habilitada=O / regla|(resumen)|1 reglas', de(r4, 'regla').join(' / '))

  titulo('5 · un interno que no es de integridad referencial')
  const d5 = monta(`create function storage.extra_interna() returns trigger language plpgsql as $x$ begin return new; end $x$;
create trigger extra_interna before insert on storage.buckets for each row execute function storage.extra_interna();
update pg_catalog.pg_trigger set tgisinternal = true where tgname = 'extra_interna';`)
  const r5 = s14e(d5)
  oraculo('S14e', 'el interno puesto a mano (Astra r8) sale con su funcion de storage, plpgsql y «(sin restriccion)»', de(r5, 'interno').some(l => l === 'interno|storage.buckets · storage.extra_interna · (sin restriccion)|BEFORE INSERT · por fila · habilitado=O · lenguaje=plpgsql · restriccion=- · tabla relacionada=- · nombre=extra_interna'), de(r5, 'interno').join(' / '))
} finally { pg.cierra() }
fin()
