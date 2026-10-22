/**
 * SG12 · LOS CAMINOS DE GOTOG1 SOBRE R3 (Astra, dictamen GOTOG1; orden 1-089 del CTO)
 *
 * GOTOG1-01 · un cierre manual en vuelo (la posicion, provisionalmente fuera de la lista) y un avance: antes, el
 * salto (y el Step) pasaban por la vela del TP sin la posicion y, si el cierre fallaba, volvia DESPUES. Ahora salto,
 * Step y Play esperan a la cola antes de empezar (lib/sim/salto.js saltaA) y, si una posicion vuelve, sus velas
 * pasadas se revisan (useTradingActions.js restaura → reevaluaSLTP).
 * ORACULOS, a mano: EUR/USD 11:55, BUY 1 lote a 1,1000, SL 1,0900, TP 1,1030; la vela de las 11:57 llega a 1,1031.
 *   el cierre FALLA (23514): la posicion vuelve antes del avance y el TP de las 11:57 se cierra (+300), con su fila
 *   el cierre SALE: cerrada a mano a 1,1000 (0), sin TP despues
 *   en los dos, el salto (Go to NY) da lo mismo que el avance con Step (clics)
 * GOTOG1-03 · quitar un par con posiciones u ordenes las borraba sin cerrarlas: ahora no se quita y avisa.
 * GOTOG1-02 (volver a un par) ya lo cubren sg03 y sg05 (familia par); la reproduccion de Astra da 6/0 en r3.
 */
import { titulo, ver, oraculo, fin, escenario, sesionSim, vela, importa, A, asienta, db, puerta, REPO } from '../lib.mjs'
import { banco, velasEnStorage } from '../banco-motor.mjs'
import fs from 'node:fs'
const CI = await importa('lib/sim/cierre.js').catch(() => null), SV = await importa('lib/sim/servicio.js').catch(() => null)
if (!CI || !SV) { for (let i = 0; i < 7; i++) oraculo('SG12', `caso ${i}: sin la cola de la etapa 1 no se puede`, false, 'no estan'); fin() }

async function corre(falla, modo) {
  const dia = falla ? '2025-01-07' : '2024-01-09', T = Date.parse(dia + 'T11:55:00Z') / 1000
  const ses = sesionSim({ pair: 'EUR/USD', date_from: dia, date_to: dia.slice(0, 8) + '10', last_timestamp: T, capital: 100000, balance: 100000 })
  escenario({ sim_sessions: [ses] })
  if (globalThis.window) globalThis.window.__algSuiteCurrentTime = null
  velasEnStorage('EUR/USD', Array.from({ length: 10 }, (_, i) => vela(T + i * 60, 1.1, i === 2 ? 1.1031 : 1.1001, 1.0999, 1.1)), [+dia.slice(0, 4) - 1], { tramoAbierto: true })
  const b = await banco({ sesion: ses, userId: A }); CI.fijaSaldoConfirmado(ses.id, 100000); await SV.leeServicio(); await b.repinta()
  const pos = b.abreMercado({ side: 'BUY', entry: 1.1, sl: 1.09, tp: 1.103, lots: 1 }); await b.repinta()
  const gate = puerta(); let retenida = false
  db.pausa = ctx => { if (ctx.tabla === 'rpc:sim_cierre_v0') { retenida = true; return gate.p } }
  // falla SOLO el cierre manual (una vez): el del TP de despues tiene que poder guardarse
  let fallado = false
  if (falla) db.falla = ctx => (ctx.tabla === 'rpc:sim_cierre_v0' && !fallado) ? (fallado = true, { code: '23514', message: 'rechazo sintetico' }) : null
  const cerrando = b.caja.valor.trading.closePosition(pos.id, 'MANUAL', 'EUR/USD', 1.1); await asienta(80)
  ver(`control (falla=${falla}, ${modo}): el cierre esta retenido y la posicion, provisionalmente fuera`, retenida && b.ps().positions.length === 0)
  // el alumno pulsa Go to (o Step, cinco veces) con el cierre en vuelo
  const avance = modo === 'salto' ? b.irA('nyam') : Promise.all([b.paso(1), b.paso(1), b.paso(1), b.paso(1), b.paso(1)])
  await asienta(80)
  const durante = b.motor().currentTime - T
  gate.abrir(); await cerrando; await avance; await asienta(80)
  db.pausa = null; db.falla = null
  if (modo === 'paso') { while (b.motor().currentTime < T + 300) { const antes = b.motor().currentTime; await b.paso(1); if (b.motor().currentTime === antes) break } }
  await asienta(80); await b.repinta()
  const r = { durante, fin: b.motor().currentTime - T, trades: b.ps().trades.map(t => [t.reason, Math.round(t.pnl), t.closeTime - T]), abiertas: b.ps().positions.length, filas: db.tablas.sim_trades.map(f => [+Number(f.pnl), f.closed_at]) }
  b.caja.raiz.desmonta?.()
  return r
}

titulo('GOTOG1-01 · cierre en vuelo y avance: se espera al cierre; si falla, la posicion vuelve antes y su TP se ejecuta')
for (const falla of [true, false]) {
  const s = await corre(falla, 'salto'), p = await corre(falla, 'paso')
  oraculo('SG12', `falla=${falla}: con el cierre en vuelo, el salto no avanza`, s.durante === 0, JSON.stringify(s))
  if (falla) oraculo('SG12', 'el cierre falla: la posicion vuelve y el TP de las 11:57 se cierra en su vela (+300), con su fila', JSON.stringify(s.trades) === JSON.stringify([['TP', 300, 120]]) && s.abiertas === 0 && s.filas.length === 1 && s.filas[0][0] === 300, JSON.stringify(s))
  else oraculo('SG12', 'el cierre sale: cerrada a mano a 1,1000, sin TP despues', JSON.stringify(s.trades) === JSON.stringify([['MANUAL', 0, 0]]) && s.abiertas === 0, JSON.stringify(s))
  oraculo('SG12', `falla=${falla}: salto = avance con Step`, JSON.stringify([s.trades, s.abiertas, s.filas]) === JSON.stringify([p.trades, p.abiertas, p.filas]), `salto ${JSON.stringify(s)} · paso ${JSON.stringify(p)}`)
}

titulo('GOTOG1-03 · quitar un par con operaciones: no se quita y avisa')
const src = fs.readFileSync(REPO + 'components/_SessionInner.js', 'utf8')
const i0 = src.indexOf('const removePair=useCallback(')
const cuerpo = src.slice(i0, src.indexOf('},[activePairs,activePair,id])', i0) + 1).replace('const removePair=useCallback(', 'return (').replace(/\}$/, '})')
function quita(estadoGBP) {
  const avisos = [], pairState = { current: { 'EUR/USD': { positions: [], orders: [] }, 'GBP/USD': estadoGBP } }
  let pares = ['EUR/USD', 'GBP/USD']
  const env = { useCallback: f => f, activePairs: pares, chartMap: { current: {} }, pairState, avisa: x => avisos.push(x), setActivePairs: x => { pares = x }, id: 's', localStorage: { setItem() {} }, activePair: 'EUR/USD', setActivePair() {} }
  new Function(...Object.keys(env), cuerpo)(...Object.values(env))('GBP/USD')
  return { avisos, quedan: 'GBP/USD' in pairState.current, pares }
}
const conPos = quita({ positions: [{ id: 'p' }], orders: [] }), conOrd = quita({ positions: [], orders: [{ id: 'o' }] }), vacio = quita({ positions: [], orders: [] })
oraculo('SG12', 'con una posicion abierta en el par: no se quita y avisa', conPos.quedan && conPos.avisos.length === 1, JSON.stringify(conPos))
oraculo('SG12', 'con una orden pendiente en el par: no se quita y avisa', conOrd.quedan && conOrd.avisos.length === 1, JSON.stringify(conOrd))
ver('control: sin operaciones, el par se quita como siempre', !vacio.quedan && vacio.avisos.length === 0 && vacio.pares.join() === 'EUR/USD', JSON.stringify(vacio))
fin()
