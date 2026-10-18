/**
 * S14f (TODOS LOS ATRIBUTOS DE pg_proc DE LAS FUNCIONES DE LOS DISPARADORES DE STORAGE) · ENSAYO EN
 * POSTGRESQL 17 LOCAL (etapa 2, ronda 9; CTO 16-oct, la familia de E3R2-01).
 *
 *   1 en READ ONLY: corre, acaba en FIN y la base no cambia
 *   2 una fila por cada uno de los siete disparadores, con su funcion (la de tgfoid) y todos los atributos
 *   3 STRICT, LEAKPROOF, PARALLEL SAFE, COST y ROWS (no se pueden poner en una funcion de disparador sin
 *     argumentos que no devuelve un conjunto: ROWS) cambian su atributo y el md5 de pg_get_functiondef
 */
import { titulo, ver, oraculo, fin, fuente } from './lib.mjs'
import { BIN, hayPostgres, cluster, STUB } from './pg-ensayo.mjs'
import { PROTECT_DELETE, UPDATE_UPDATED_AT, DISPARADORES_OBJETOS, TIPO_Y_VERSIONADO, COLUMNAS_CICLO, ENFORCE_BUCKET_NAME_LENGTH, PROTECT_BUCKET_CONTROL_COLUMNS, ENFORCE_BUCKET_LIFECYCLE_SERVICE_ROLE, DISPARADORES_BUCKETS } from './storage-supabase.mjs'
if (!hayPostgres()) { ver(`PostgreSQL 17 en ${BIN}: NO hay, la prueba no se ha ejecutado`, false); fin() }
const S14F = fuente('sql/consultas/s14f-atributos-funciones-storage.sql')
const pg = cluster()
const STORAGE = `${PROTECT_DELETE}\n${UPDATE_UPDATED_AT}\n${DISPARADORES_OBJETOS}\n${TIPO_Y_VERSIONADO}\n${COLUMNAS_CICLO}\n${ENFORCE_BUCKET_NAME_LENGTH}\n${PROTECT_BUCKET_CONTROL_COLUMNS}\n${ENFORCE_BUCKET_LIFECYCLE_SERVICE_ROLE}\n${DISPARADORES_BUCKETS}`
let n = 0
const monta = (extra = '') => {
  const db = `f${++n}`
  const pasos = [pg.psql(`create database ${db}`, 'postgres'), pg.psql(STUB, db), pg.psql(STORAGE, db), ...(extra ? [pg.psql(extra, db)] : [])]
  if (!pasos.every(x => x.ok)) throw new Error(`montaje ${db}: ${pasos.map(x => x.err).join(' ')}`)
  return db
}
const s14f = db => pg.psql(`begin read only;\n${S14F}\nrollback;`, db)
const funciones = r => r.out.split('\n').filter(l => l.startsWith('funcion|'))
const campo = (l, k) => new RegExp(` ${k}=([^ ]+)`).exec(l)?.[1]
try {
  pg.arranca()
  titulo('1 · solo lectura')
  const d = monta()
  const r = s14f(d)
  oraculo('S14f', 'corre en READ ONLY y acaba en «FIN|s14f|consulta»', r.ok && r.out.trim().endsWith('FIN|s14f|consulta'), r.err.slice(0, 200))
  oraculo('S14f', 'una sola SELECT: sin escrituras ni EXECUTE (fuera comentarios)', (() => { const sin = S14F.replace(/--.*$/gm, '').replace(/'[^']*'/g, "''"); return !/\b(insert|update|delete|truncate|alter|create|drop|grant|revoke|execute|perform|call|do)\b/i.test(sin) && (sin.match(/;/g) || []).length === 1 })())

  titulo('2 · los siete, con todos los atributos')
  const fs = funciones(r)
  const claves = ['functiondef md5', 'prosrc md5', 'prokind', 'proretset', 'prorettype', 'pronargs', 'proargtypes', 'proargmodes', 'proargnames', 'proargdefaults', 'pronargdefaults', 'proisstrict', 'proleakproof', 'proparallel', 'provolatile', 'prosecdef', 'proconfig', 'procost', 'prorows', 'lenguaje', 'dueño']
  oraculo('S14f', 'siete filas (una por disparador), cada una con los 21 campos, y «5 funciones distintas»', fs.length === 7 && fs.every(l => claves.every(k => l.includes(`${k}=`))) && r.out.includes('resumen|funciones|5 funciones distintas'), fs.join(' / '))
  oraculo('S14f', 'en el montaje, todas: prokind=f, proretset=false, prorettype=trigger, sin argumentos, sin STRICT ni LEAKPROOF, PARALLEL u, COST 100, ROWS 0', fs.every(l => campo(l, 'prokind') === 'f' && campo(l, 'proretset') === 'false' && campo(l, 'prorettype') === 'trigger' && campo(l, 'pronargs') === '0' && campo(l, 'proargtypes') === '-' && campo(l, 'proisstrict') === 'false' && campo(l, 'proleakproof') === 'false' && campo(l, 'proparallel') === 'u' && campo(l, 'procost') === '100' && campo(l, 'prorows') === '0'), fs.join(' / '))

  titulo('3 · cada atributo que se puede cambiar en una funcion de disparador cambia su campo y el md5 de pg_get_functiondef')
  const fn = 'storage.enforce_bucket_name_length()'
  const base = funciones(s14f(monta())).find(l => l.includes(fn))
  for (const [nombre, alter, k, v] of [
    ['STRICT', 'strict', 'proisstrict', 'true'], ['LEAKPROOF', 'leakproof', 'proleakproof', 'true'], ['PARALLEL SAFE', 'parallel safe', 'proparallel', 's'],
    ['COST 7', 'cost 7', 'procost', '7'], ['IMMUTABLE', 'immutable', 'provolatile', 'i'], ['SECURITY DEFINER', 'security definer', 'prosecdef', 'true'], ['SET work_mem', "set work_mem = '64kB'", 'proconfig', '{work_mem=64kB}'],
  ]) {
    const l = funciones(s14f(monta(`alter function ${fn} ${alter};`))).find(x => x.includes(fn))
    oraculo('S14f', `${nombre}: ${k}=${v} y el md5 de pg_get_functiondef cambia`, !!l && campo(l, k) === v && campo(l, 'md5') !== campo(base, 'md5'), `${l?.slice(0, 160)}`)
  }
  const rows = pg.psql(`alter function ${fn} rows 10;`, monta())
  ver('control: ROWS no se puede poner en una funcion que no devuelve un conjunto (por eso prorows=0 en una de disparador)', !rows.ok && /ROWS is not applicable/i.test(rows.err), rows.err.split('\n')[0])
} finally { pg.cierra() }
fin()
