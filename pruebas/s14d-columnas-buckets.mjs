/**
 * S14d (LAS COLUMNAS DE STORAGE.BUCKETS Y SUS VALORES POR DEFECTO) · ENSAYO EN
 * POSTGRESQL 17 LOCAL (etapa 2; CTO 14-oct, tras la s14c).
 *
 * ⚠️ El montaje INVENTA el tipo storage.buckettype y los valores por defecto de
 *    type y versioning_status: no se conocen (la s14d existe para verlos). Aqui
 *    solo se prueba que la consulta enseña lo que dice, sin escribir nada.
 *
 *   1 en READ ONLY: corre, acaba en FIN y la base no cambia (foto con control);
 *     tambien fuera de READ ONLY y como un no superusuario
 *   2 cada columna: tipo, NOT NULL, valor por defecto tal cual; el resumen
 *     nombra las NOT NULL sin valor por defecto
 *   3 el enum storage.buckettype en su orden; si no existe, o no es un enum
 *   4 los privilegios de quien ejecuta en storage.buckets y storage.objects
 */
import { spawnSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { titulo, ver, oraculo, fin, fuente } from './lib.mjs'
import { BIN, hayPostgres, cluster, STUB } from './pg-ensayo.mjs'
if (!hayPostgres()) { ver(`PostgreSQL 17 en ${BIN}: NO hay, la prueba no se ha ejecutado`, false); fin() }
const S14D = fuente('sql/consultas/s14d-columnas-buckets.sql')
const pg = cluster()

// INVENTADO (ver la cabecera)
const COLUMNAS = `create type storage.buckettype as enum ('STANDARD', 'ANALYTICS');
alter table storage.buckets add column type storage.buckettype not null default 'STANDARD',
  add column versioning_status text not null default 'Unversioned',
  add column lifecycle_configuration jsonb, add column lifecycle_configuration_generation uuid;`

let n = 0
const monta = (extra = '') => {
  const db = `d${++n}`
  const pasos = [pg.psql(`create database ${db}`, 'postgres'), pg.psql(STUB, db), ...(extra ? [pg.psql(extra, db)] : [])]
  if (!pasos.every(x => x.ok)) throw new Error(`montaje ${db}: ${pasos.map(x => x.err).join(' ')}`)
  return db
}
const s14d = db => pg.psql(`begin read only;\n${S14D}\nrollback;`, db)
const filas = r => r.out.split('\n')
const fila = (r, sec, obj) => filas(r).find(l => l.startsWith(`${sec}|${obj}|`))
const foto = db => {
  const r = pg.psql(`select md5(coalesce((select string_agg(a.attname || format_type(a.atttypid, a.atttypmod) || a.attnotnull::text || coalesce(pg_get_expr(d.adbin, d.adrelid), '-'), ',' order by a.attnum)
    from pg_attribute a left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum where a.attrelid = 'storage.buckets'::regclass and a.attnum > 0 and not a.attisdropped), '-')
  || coalesce((select string_agg(enumlabel, ',' order by enumsortorder) from pg_enum where enumtypid = to_regtype('storage.buckettype')), '-')
  || (select count(*)::text from storage.buckets) || (select count(*)::text from storage.objects))`, db)
  if (!r.ok || !/^[0-9a-f]{32}$/.test(r.out)) throw new Error(`foto ${db}: ${r.err || r.out}`)
  return r.out
}

try {
  pg.arranca()
  titulo('1 · en READ ONLY: corre, acaba en FIN y no cambia nada')
  const d = monta(COLUMNAS)
  const antes = foto(d)
  ver('control: la foto ve un cambio (un valor por defecto cambiado y repuesto)', (() => {
    pg.psql(`alter table storage.buckets alter column versioning_status set default 'x'`, d); const x = foto(d) !== antes
    pg.psql(`alter table storage.buckets alter column versioning_status set default 'Unversioned'`, d); return x && foto(d) === antes
  })())
  const r = s14d(d)
  oraculo('S14d', 'corre dentro de una transaccion READ ONLY y acaba en «FIN | s14d | consulta»', r.ok && filas(r).at(-1) === 'FIN|s14d|consulta', r.err || filas(r).at(-1))
  oraculo('S14d', 'la base no cambia', foto(d) === antes)
  const sinRO = pg.psql(S14D, d)
  oraculo('S14d', 'tambien fuera de READ ONLY (como en el editor): la misma salida y la base no cambia', sinRO.ok && sinRO.out === r.out && foto(d) === antes)
  oraculo('S14d', 'el texto no escribe: ni insert, update, delete, set_config, execute, create, alter ni grant fuera de comentarios y literales',
    !/\b(insert|update|delete|set_config|execute|create|alter|grant|revoke|truncate|copy)\b/i.test(S14D.replace(/--.*$/gm, '').replace(/'[^']*'/g, "''")))
  pg.psql(`do $r$ begin if not exists (select 1 from pg_roles where rolname = 'pgx') then create role pgx login nosuperuser bypassrls createrole; end if; end $r$;`, 'postgres')
  pg.psql(`grant usage on schema storage to pgx; grant select on all tables in schema storage to pgx;`, d)
  const f = path.join(pg.dir, 'd.sql'); writeFileSync(f, `begin read only;\n${S14D}\nrollback;`)
  const rp = spawnSync(path.join(BIN, 'psql'), ['-h', pg.dir, '-p', pg.puerto, '-U', 'pgx', '-X', '-q', '-tA', '-v', 'ON_ERROR_STOP=1', '-d', d, '-f', f], { encoding: 'utf8', env: { PATH: process.env.PATH, LC_ALL: 'en_US.UTF-8', LANG: 'en_US.UTF-8' } })
  const op = (rp.stdout || '').trim()
  oraculo('S14d', 'como un no superusuario con USAGE en storage: corre, y sus privilegios son los suyos (solo SELECT)', rp.status === 0 && op.split('\n').at(-1) === 'FIN|s14d|consulta' && op.includes('privilegios|pgx en storage.buckets|SELECT') && op.includes('privilegios|pgx en storage.objects|SELECT'), (rp.stderr || '').trim() || op)

  titulo('2 · las columnas')
  oraculo('S14d', 'type: el enum, NOT NULL y su valor por defecto tal cual', fila(r, 'columna', 'storage.buckets.type') === `columna|storage.buckets.type|storage.buckettype · NOT NULL · por defecto: 'STANDARD'::storage.buckettype`, fila(r, 'columna', 'storage.buckets.type'))
  oraculo('S14d', 'versioning_status: text, NOT NULL, por defecto', fila(r, 'columna', 'storage.buckets.versioning_status') === `columna|storage.buckets.versioning_status|text · NOT NULL · por defecto: 'Unversioned'::text`)
  oraculo('S14d', 'las de ciclo de vida: admiten NULL, sin valor por defecto', fila(r, 'columna', 'storage.buckets.lifecycle_configuration') === 'columna|storage.buckets.lifecycle_configuration|jsonb · admite NULL · por defecto: (ninguno)' && fila(r, 'columna', 'storage.buckets.lifecycle_configuration_generation') === 'columna|storage.buckets.lifecycle_configuration_generation|uuid · admite NULL · por defecto: (ninguno)')
  oraculo('S14d', 'id: NOT NULL sin valor por defecto, y lo dice; el resumen la nombra (y solo a ella)', /^columna\|storage\.buckets\.id\|text · NOT NULL · por defecto: \(ninguno\) · NOT NULL SIN valor por defecto: un INSERT que no la rellene falla$/m.test(r.out) && fila(r, 'columna', '(resumen)') === 'columna|(resumen)|9 columnas · NOT NULL sin valor por defecto: id', fila(r, 'columna', '(resumen)'))
  const dSin = monta(COLUMNAS + `\nalter table storage.buckets alter column versioning_status drop default;`)
  oraculo('S14d', 'versioning_status NOT NULL sin valor por defecto: el resumen la nombra', fila(s14d(dSin), 'columna', '(resumen)') === 'columna|(resumen)|9 columnas · NOT NULL sin valor por defecto: id, versioning_status')

  titulo('3 · el enum')
  oraculo('S14d', 'storage.buckettype: sus valores en orden', fila(r, 'enum', 'storage.buckettype') === 'enum|storage.buckettype|enum con 2 valores' && fila(r, 'enum', 'storage.buckettype 01') === 'enum|storage.buckettype 01|STANDARD' && fila(r, 'enum', 'storage.buckettype 02') === 'enum|storage.buckettype 02|ANALYTICS', filas(r).filter(l => l.startsWith('enum')).join(' / '))
  const r0 = s14d(monta())
  oraculo('S14d', 'sin el tipo: «NO EXISTE» y corre igual hasta FIN', r0.ok && fila(r0, 'enum', 'storage.buckettype') === 'enum|storage.buckettype|NO EXISTE' && filas(r0).at(-1) === 'FIN|s14d|consulta', r0.err || r0.out)
  const rD = s14d(monta(`create domain storage.buckettype as text;`))
  oraculo('S14d', 'si storage.buckettype no es un enum, lo dice', fila(rD, 'enum', 'storage.buckettype') === 'enum|storage.buckettype|existe pero NO es un enum: d', fila(rD, 'enum', 'storage.buckettype'))

  titulo('4 · privilegios de quien ejecuta')
  oraculo('S14d', 'postgres: los cuatro en las dos tablas', fila(r, 'privilegios', 'postgres en storage.buckets') === 'privilegios|postgres en storage.buckets|SELECT,INSERT,UPDATE,DELETE' && fila(r, 'privilegios', 'postgres en storage.objects') === 'privilegios|postgres en storage.objects|SELECT,INSERT,UPDATE,DELETE')
} finally { pg.cierra() }
fin()
