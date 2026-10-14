/**
 * s15 · las columnas de sim_sessions que pide el cliente (sql/consultas/s15-columnas-sesion.sql;
 * diseño q.10 h). ENSAYO LOCAL, dentro de una transaccion READ ONLY; en produccion NO se ha
 * corrido (la corre Ramon antes de desplegar el cliente). Escrita ANTES que la consulta.
 *   · la lista de la consulta es, literal, COLUMNAS_SESION de lib/sim/columnas.js;
 *   · sobre el montaje de hoy (s04 + sim-002 + sim-003 + preparatoria): veredicto OK, 24
 *     columnas «existe», y las que sobran son estado y escritor;
 *   · sin una columna (rev_saldo, sim_sessions sin la preparatoria): veredicto «FALTAN 1»,
 *     esa fila «FALTA» y el aviso de no desplegar (control: el detector detecta);
 *   · es de solo lectura: corre entera dentro de READ ONLY y acaba en FIN.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { titulo, ver, oraculo, fin, REPO, importa } from './lib.mjs'
import { hayPostgres } from './pg-ensayo.mjs'
import { montajeV1 } from './montaje-v1.mjs'
let S15 = null
try { S15 = readFileSync(path.join(REPO, 'sql/consultas/s15-columnas-sesion.sql'), 'utf8') } catch { S15 = null }
const { COLUMNAS_SESION } = await importa('lib/sim/columnas.js')
titulo('1 · la lista')
const lista = S15 ? (/string_to_array\(\s*'([^']*)'/.exec(S15) ?? [])[1] : null
oraculo('S15', 'la lista de la consulta es literal COLUMNAS_SESION', lista === COLUMNAS_SESION, lista ?? '(sin consulta)')
if (!hayPostgres()) { ver('PostgreSQL 17 local: NO hay, la parte contra la base no se ha ejecutado', false); fin() }
const m = montajeV1()
try {
  m.arranca()
  const corre = d => m.pg.psql(`begin read only;\n${S15 ?? 'select 1/0;'}\ncommit;`, d)
  titulo('2 · sobre el montaje de hoy')
  const d = m.base('q1')
  const r = corre(d)
  const filas = r.out.split('\n').filter(l => l.includes('|'))
  const col = filas.filter(l => l.startsWith('columna|'))
  oraculo('S15', 'veredicto OK, las 24 columnas «existe», sobran estado y escritor, y acaba en FIN', r.ok && filas.some(l => l === 'veredicto|OK|estan las 24 columnas que pide el cliente') && col.length === 24 && col.every(l => /\|existe · /.test(l)) && filas.some(l => l === 'sobra|escritor, estado|no las pide el cliente') && filas.at(-1) === 'FIN|s15|consulta', r.ok ? filas.join(' / ').slice(0, 500) : r.err)
  titulo('3 · sin una columna')
  const d2 = m.base('q2')
  m.uno(d2, 'alter table public.sim_sessions rename column rev_saldo to rev_saldo_x')
  const r2 = corre(d2)
  const f2 = r2.out.split('\n')
  oraculo('S15', 'sin rev_saldo: «FALTAN 1 · rev_saldo — NO desplegar ese cliente» y su fila FALTA', r2.ok && f2.includes('veredicto|FALTAN 1|rev_saldo — NO desplegar ese cliente') && f2.includes('columna|rev_saldo|FALTA'), r2.ok ? f2.join(' / ').slice(0, 400) : r2.err)
} finally { m.cierra() }
fin()
