/**
 * MOTOR · VERSIONES DE LA POLITICA DEL CAMINO (orden 1-119 del CTO, punto 3). Escrita ANTES que el codigo.
 *   · lo nuevo: el estado dice motor@3 y los eventos de una vela ambigua, politica recorrido@2 (la regla de la vela)
 *   · lo grabado antes: un estado motor@2 (sacado con el motor de 43d01b4, por `git show`) se sigue avanzando con SU
 *     version: el motor nuevo da los MISMOS eventos (politica recorrido@1 y su causa) y el mismo estado que el motor
 *     viejo, en el motor de un par y en la cartera. Casos: A03 (b) (vela alcista: la regla daria B, recorrido@1 da A) y la
 *     SELL con TP de MCV1 (alcista: la regla, fase 2; recorrido@1, fase 3)
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { titulo, oraculo, ver, fin, importa, REPO } from '../lib.mjs'
const BASE = '43d01b4'
function extrae(ref) {
  const dir = mkdtempSync(path.join(tmpdir(), 'versiones-'))
  for (const f of execFileSync('git', ['-C', REPO, 'ls-tree', '--name-only', ref, 'lib/motor/', 'lib/mercado/'], { encoding: 'utf8' }).split('\n').filter(f => f.endsWith('.mjs'))) {
    mkdirSync(path.join(dir, path.dirname(f)), { recursive: true }); writeFileSync(path.join(dir, f), execFileSync('git', ['-C', REPO, 'show', `${ref}:${f}`]))
  }
  return dir
}
const dir = extrae(BASE)
const VIEJO = { M: await import(pathToFileURL(path.join(dir, 'lib/motor/motor.mjs')).href), CA: await import(pathToFileURL(path.join(dir, 'lib/motor/cartera.mjs')).href) }
rmSync(dir, { recursive: true, force: true })
const NUEVO = { M: await importa('lib/motor/motor.mjs'), CA: await importa('lib/motor/cartera.mjs') }
const T = Date.parse('2026-03-03T10:00:00Z') / 1000
const tx = x => JSON.stringify(x, (k, v) => (typeof v === 'bigint' ? `${v}n` : v))
const sin = Object.freeze({ version: 'prueba:versiones', spread_pips: { EURUSD: 0, USDJPY: 0 }, comision_lote_µ: 3_000_000n, swap_µ: 0n })
const f = (t, o, h, l, c) => ({ time: t, open: o, high: h, low: l, close: c })
const CASOS = [
  { id: 'A03 (b)', par: 'EURUSD', filas: [f(T, '1.10000', '1.10000', '1.10000', '1.10000'), f(T + 60, '1.10000', '1.10150', '1.09850', '1.10050')], com: { tipo: 'abrir', orden: 'stop', lado: 'BUY', lotes: '1', precio: '1.10100', sl: '1.09900' } },
  { id: 'MCV1 SELL TP', par: 'USDJPY', filas: [f(T, '150.000', '150.000', '150.000', '150.000'), f(T + 60, '150.000', '151.000', '149.000', '150.500')], com: { tipo: 'abrir', orden: 'mercado', lado: 'SELL', lotes: '1', tp: '149.500' } },
]
// prepara con `prep` (el motor que GRABA el estado) y avanza la vela con `MO`
function corre(prep, MO, cartera, { par, filas, com }) {
  const v = prep.M.velas(par, filas), vs = cartera ? { [par]: v } : v
  const P = cartera ? prep.CA : prep.M
  let e = cartera ? P.crea({ pares: [par], capital: '100000', costes: sin }) : P.crea({ par, capital: '100000', costes: sin })
  e = P.aplica(e, { tipo: 'avanzar', hasta: T }, vs).estado
  e = P.aplica(e, { ...(cartera ? { par } : {}), ...com, ...(com.orden === 'mercado' ? { cotizadoEn: T } : {}) }, vs).estado
  const grabado = P.serializa(e)                                   // lo que guarda la base
  const A = cartera ? MO.CA : MO.M
  const r = A.aplica(A.deserializa(grabado), { tipo: 'avanzar', hasta: T + 60 }, cartera ? { [par]: MO.M.velas(par, filas) } : MO.M.velas(par, filas))
  return { version: e.versiones.motor, eventos: r.eventos, estado: A.serializa(r.estado) }
}

titulo('1 · lo nuevo: motor@3 y recorrido@2')
for (const cartera of [false, true]) {
  const x = corre(NUEVO, NUEVO, cartera, CASOS[0])
  const amb = x.eventos.filter(e => e.ambigua)
  oraculo('VER', `${cartera ? 'cartera' : 'un par'}: una sesion nueva dice motor@3`, x.version === 'motor@3', x.version)
  oraculo('VER', `${cartera ? 'cartera' : 'un par'}: los eventos de la vela ambigua de A03 (b) llevan politica recorrido@2`, amb.length > 0 && amb.every(e => e.politica === 'recorrido@2'), tx(amb.map(e => e.politica)))
}
titulo('2 · lo grabado con motor@2 se sigue avanzando con su version (recorrido@1)')
for (const c of CASOS) for (const cartera of [false, true]) {
  const viejo = corre(VIEJO, VIEJO, cartera, c), nuevo = corre(VIEJO, NUEVO, cartera, c)
  ver(`${c.id} ${cartera ? 'cartera' : 'un par'}: el estado grabado dice motor@2`, viejo.version === 'motor@2', viejo.version)
  oraculo('VER', `${c.id} ${cartera ? 'cartera' : 'un par'}: un estado motor@2 avanza en el motor nuevo IGUAL que en el viejo (eventos, politica, causa y estado)`, tx(nuevo.eventos) === tx(viejo.eventos) && nuevo.estado === viejo.estado, tx({ viejo: viejo.eventos.map(e => [e.tipo, e.motivo, e.politica]), nuevo: nuevo.eventos.map(e => [e.tipo, e.motivo, e.politica]) }))
}
// control: con la regla nueva, los mismos casos SI cambian (si no, el contraste de arriba no vería nada)
for (const c of CASOS) {
  const viejo = corre(VIEJO, VIEJO, true, c), nuevo = corre(NUEVO, NUEVO, true, c)
  ver(`control ${c.id}: una sesion nueva (motor@3) da otra cosa que motor@2`, tx(viejo.eventos) !== tx(nuevo.eventos))
}
fin()
