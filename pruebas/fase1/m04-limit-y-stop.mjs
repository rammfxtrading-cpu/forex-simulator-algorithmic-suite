/**
 * M04 · UNA LIMIT LLENADA EN UNA VELA NO MIRA SU SL EN ESA MISMA VELA
 *
 * Astra (4-oct): en el onTick, checkSLTP va antes que checkLimitOrders
 * (components/usePairData.js:53-54) y avanza lastSLTPIdx; la posicion que la
 * limit abre en esa vela ya no se revisa en ella, si HAY OTRA posicion abierta.
 * Variante Go to: fill 11:58, stop 11:59, destino 12:00 → el salto no cierra.
 *
 * Se ejecuta con el banco del motor (cableado REAL, pruebas/banco-motor.mjs).
 *
 * H03 (revision de Astra): todo se mira tras UN paso; el segundo, sin duplicar.
 * ORACULO, a mano: BUY LIMIT 1,1000 con SL 1,0990; la vela abre en 1,1010 y
 * baja a 1,0980. Para llegar de 1,1010 a 1,0980 el precio pasa por 1,1000 (se
 * llena) y despues por 1,0990 (SL): no hay ambiguedad. Resultado:
 *   (1,0990 − 1,1000) × 10.000 × 1 lote × 10 USD = −100, en esa misma vela.
 * Go to: el resultado de un salto tiene que ser el mismo que paso a paso (−100).
 */
import { titulo, ver, oraculo, fin, escenario, sesionSim, vela } from '../lib.mjs'
import { banco, velasEnStorage, copiasVigentes } from '../banco-motor.mjs'
const T = Date.parse('2025-03-03T10:00:00Z') / 1000
const ses = sesionSim()
const VELAS = [
  vela(T, 1.1020, 1.1022, 1.1018, 1.1020),
  vela(T + 60, 1.1010, 1.1015, 1.0980, 1.0985),       // llena la limit (1,1000) y toca su SL (1,0990)
  vela(T + 120, 1.0995, 1.1005, 1.0992, 1.1000),      // ya no toca el SL
  vela(T + 180, 1.1000, 1.1001, 1.0999, 1.1000),
]
ver('control: las lineas copiadas de _SessionInner siguen ahi', Object.values(copiasVigentes()).every(Boolean), JSON.stringify(copiasVigentes()))

// H03 (revision de Astra): se mira TRAS UN SOLO PASO. Antes se avanzaban dos
// velas y un cierre tardio (en la vela siguiente) aprobaba el «control».
async function caso(conOtra) {
  escenario({ sim_sessions: [ses] })
  velasEnStorage('EUR/USD', VELAS, [2024])
  const b = await banco({ sesion: ses })
  if (conOtra) b.abreMercado({ side: 'BUY', entry: 1.1020, sl: 1.0900, tp: 1.1200, lots: 1 })
  const orden = await b.pendiente({ side: 'BUY_LIMIT', entry: 1.1000, sl: 1.0990, tp: 1.1030, lots: 1 })
  const delLimit = () => ({ cerradas: b.ps().trades.filter(t => t.entry === 1.1), abiertas: b.ps().positions.filter(p => p.entry === 1.1) })
  await b.paso(1)
  const unPaso = delLimit()
  await b.paso(1)
  const dosPasos = delLimit()
  return { b, orden, unPaso, dosPasos }
}
const enSuVela = c => c.unPaso.cerradas.length === 1 && c.unPaso.cerradas[0].reason === 'SL' && Math.abs(c.unPaso.cerradas[0].pnl + 100) < 1e-6
const describe = r => r.abiertas.length ? `sigue ABIERTA (entrada ${r.abiertas[0].entry}, SL ${r.abiertas[0].sl})` : JSON.stringify(r.cerradas.map(t => [t.reason, +t.pnl.toFixed(2)]))
const unSoloCierre = c => c.dosPasos.cerradas.length === 1 && c.dosPasos.abiertas.length === 0 && Math.abs(c.dosPasos.cerradas[0].pnl + 100) < 1e-6

titulo('1 · sin otra posicion: la limit y su SL en la misma vela')
const sin = await caso(false)
ver('control: la orden existia y se lleno', !!sin.orden && sin.b.ps().orders.length === 0)
oraculo('M04', 'sin otra posicion: tras UN paso, cerrada en su SL (−100)', enSuVela(sin), `tras un paso: ${describe(sin.unPaso)}`)
oraculo('M04', 'sin otra posicion: tras el segundo paso, un solo cierre (sin duplicar)', unSoloCierre(sin), `tras dos pasos: ${describe(sin.dosPasos)}`)

titulo('2 · con otra posicion abierta')
const con = await caso(true)
ver('control: la orden se lleno', con.b.ps().orders.length === 0 && con.unPaso.cerradas.length + con.unPaso.abiertas.length === 1)
oraculo('M04', 'con otra posicion: tras UN paso, cerrada en su SL (−100)', enSuVela(con), `tras un paso: ${describe(con.unPaso)}`)
oraculo('M04', 'con otra posicion: tras el segundo paso, un solo cierre (sin duplicar)', unSoloCierre(con), `tras dos pasos: ${describe(con.dosPasos)}`)

titulo('3 · Go to NY AM: fill 11:58, stop 11:59, destino 12:00 UTC')
// NY AM abre a las 07:00 de Nueva York = 12:00 UTC en enero (EST, UTC−5; enero
// evita la frontera de horario de verano, que es otro hallazgo: M13).
const T0 = Date.parse('2025-01-07T11:57:00Z') / 1000
const GOTO = [
  vela(T0, 1.1020, 1.1022, 1.1018, 1.1020),           // 11:57
  vela(T0 + 60, 1.1010, 1.1012, 1.0999, 1.1001),      // 11:58 llena la limit (1,1000), no toca 1,0990
  vela(T0 + 120, 1.1001, 1.1002, 1.0985, 1.0995),     // 11:59 toca el SL
  vela(T0 + 180, 1.0995, 1.1005, 1.0993, 1.1000),     // 12:00 destino (no toca el SL)
  vela(T0 + 240, 1.1000, 1.1001, 1.0999, 1.1000),
]
// Otro par (GBPUSD, tambien 10 USD/pip): /api/candles guarda en memoria el año
// ya leido (cache por par y año, sin caducidad; es D05) y serviria las velas de
// EURUSD 2025 de las secciones anteriores.
async function goto(saltando) {
  const s2 = sesionSim({ pair: 'GBP/USD', date_from: '2025-01-07', date_to: '2025-01-10' })
  escenario({ sim_sessions: [s2] })
  velasEnStorage('GBP/USD', GOTO, [2024])
  const b = await banco({ sesion: s2 })
  await b.pendiente({ side: 'BUY_LIMIT', entry: 1.1000, sl: 1.0990, tp: 1.1030, lots: 1 })
  const destino = saltando ? await b.irA('nyam') : (await b.paso(3), null)
  return { b, destino, t: b.ps().trades.filter(x => x.entry === 1.1), abiertas: b.ps().positions.filter(p => p.entry === 1.1) }
}
const paso = await goto(false)
ver('control: paso a paso, la limit se llena a las 11:58 y el SL cierra a las 11:59: −100', paso.t.length === 1 && Math.abs(paso.t[0].pnl + 100) < 1e-6, JSON.stringify(paso.t.map(t => [t.reason, t.pnl])))
const salto = await goto(true)
ver('control: el Go to salto a la apertura de NY AM, las 12:00', salto.destino?.time === T0 + 180 && salto.b.motor().currentTime === T0 + 180, JSON.stringify(salto.destino))
oraculo('M04', 'Go to a las 12:00 da lo mismo que paso a paso (−100)', salto.t.length === 1 && Math.abs(salto.t[0].pnl + 100) < 1e-6,
  salto.abiertas.length ? `con el salto la posicion sigue ABIERTA (llenada ${new Date(salto.abiertas[0].openTime * 1000).toISOString().slice(11, 16)}, SL ${salto.abiertas[0].sl})` : JSON.stringify(salto.t.map(t => [t.reason, t.pnl])))
fin()
