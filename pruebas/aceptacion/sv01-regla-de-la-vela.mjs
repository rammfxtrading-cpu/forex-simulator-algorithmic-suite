/**
 * SV01 · LA REGLA DE LA VELA (decision de Ramon, orden 1-085 del CTO; lib/sim/vela.js)
 *
 * Cuando una vela M1 toca a la vez el SL y el TP de una posicion, gana el que su recorrido alcanza
 * antes: alcista O→L→H→C, bajista O→H→L→C, doji (C = O) el extremo mas cercano a la apertura y, si
 * estan a la misma distancia, el SL. Antes (hasta sim-goto-r2) ganaba siempre el TP.
 *
 * ORACULOS, a mano. Entrada 1,1000, SL y TP a 10 pips; 1 lote = 10 USD/pip (±100).
 *   largo (SL 1,0990 · TP 1,1010)        corto (SL 1,1010 · TP 1,0990)
 *   alcista  O1,1000 H1,1012 L1,0988 C1,1005 → SL (−100)  ·  TP (+100)
 *   bajista  O1,1000 H1,1012 L1,0988 C1,0995 → TP (+100)  ·  SL (−100)
 *   doji     O1,1000 H1,1011 L1,0985 C1,1000 (el maximo, mas cerca) → TP  ·  SL
 *   doji equidistante O1,1000 H1,1012 L1,0988 C1,1000 → SL  ·  SL
 * Cada caso, paso a paso (Step) y con el salto (lib/sim/salto.js): lo mismo.
 * Y la vela del llenado de una pendiente (M04): el recorrido empieza donde toca la entrada.
 */
import { titulo, ver, oraculo, fin, escenario, sesionSim, vela, importa } from '../lib.mjs'
import { banco, velasEnStorage } from '../banco-motor.mjs'
const V = await importa('lib/sim/vela.js').catch(() => null)
const SALTO = await importa('lib/sim/salto.js').catch(() => null)
if (!V) { for (let i = 0; i < 20; i++) oraculo('SV01', `caso ${i}: sin lib/sim/vela.js no hay regla de la vela`, false, 'no esta'); fin() }

const T = Date.parse('2025-01-07T10:00:00Z') / 1000
const CASOS = [
  ['alcista', [1.1000, 1.1012, 1.0988, 1.1005], 'SL', 'TP'],
  ['bajista', [1.1000, 1.1012, 1.0988, 1.0995], 'TP', 'SL'],
  ['doji, maximo mas cerca', [1.1000, 1.1011, 1.0985, 1.1000], 'TP', 'SL'],
  ['doji equidistante', [1.1000, 1.1012, 1.0988, 1.1000], 'SL', 'SL'],
]
const PARES = ['EUR/USD', 'GBP/USD', 'AUD/USD', 'NZD/USD']   // un par por caso: cache de /api/candles por par y año

async function corre(par, v, side, modo) {
  const ses = sesionSim({ pair: par, date_from: '2025-01-07', date_to: '2025-01-10', last_timestamp: T })
  escenario({ sim_sessions: [ses] })
  if (globalThis.window) globalThis.window.__algSuiteCurrentTime = null
  velasEnStorage(par, [vela(T, 1.1000, 1.1001, 1.0999, 1.1000), vela(T + 60, ...v), vela(T + 120, 1.1000, 1.1001, 1.0999, 1.1000), vela(T + 180, 1.1000, 1.1001, 1.0999, 1.1000)], [2024], { tramoAbierto: true })
  const b = await banco({ sesion: ses })
  const largo = side === 'BUY'
  b.abreMercado({ side, entry: 1.1000, sl: largo ? 1.0990 : 1.1010, tp: largo ? 1.1010 : 1.0990, lots: 1, slPips: 10, tpPips: 10 })
  if (modo === 'salto' && SALTO) {
    await SALTO.saltaA({ engine: b.motor(), hasta: T + 120, sid: ses.id, pairState: b.refs.pairState, esReto: false })
    await b.repinta()
  } else await b.paso(2)
  await new Promise(r => setTimeout(r, 40)); await b.repinta()
  const r = b.ps().trades.map(t => [t.reason, Math.round(t.pnl), t.closeTime - T])
  b.caja.raiz.desmonta?.()
  return r
}

titulo('una posicion abierta: la vela toca su SL y su TP')
for (const [i, [nombre, v, largo, corto]] of CASOS.entries()) {
  for (const [side, esperado] of [['BUY', largo], ['SELL', corto]]) {
    const paso = await corre(PARES[i], v, side, 'paso')
    const salto = await corre(PARES[i], v, side, 'salto')
    const ok = JSON.stringify([[esperado, esperado === 'TP' ? 100 : -100, 60]])
    oraculo('SV01', `${nombre}, ${side === 'BUY' ? 'largo' : 'corto'}: ${esperado} en la vela (Step)`, JSON.stringify(paso) === ok, JSON.stringify(paso))
    oraculo('SV01', `${nombre}, ${side === 'BUY' ? 'largo' : 'corto'}: el salto da lo mismo que el Step`, JSON.stringify(salto) === JSON.stringify(paso), `salto ${JSON.stringify(salto)} · paso ${JSON.stringify(paso)}`)
  }
}

titulo('la vela del llenado (M04): el recorrido empieza donde toca la entrada')
// BUY LIMIT 1,1000 · SL 1,0990 · TP 1,1030; SELL LIMIT 1,1000 · SL 1,1010 · TP 1,0970
const L = { side: 'BUY', entry: 1.1000, sl: 1.0990, tp: 1.1030 }, C = { side: 'SELL', entry: 1.1000, sl: 1.1010, tp: 1.0970 }
const v = (o, h, l, c) => ({ open: o, high: h, low: l, close: c })
const LLENADO = [
  // bajista: sube a 1,1035 sin llenar, baja: llena y toca el SL
  ['largo, bajista: O→H (sin llenar) → L (llena, SL)', L, v(1.1010, 1.1035, 1.0985, 1.1000), 'SL'],
  // alcista: baja a 1,0995 (llena, no SL), sube a 1,1035 (TP)
  ['largo, alcista: O→L (llena) → H (TP)', L, v(1.1005, 1.1035, 1.0995, 1.1020), 'TP'],
  // alcista que llena y sigue bajando al SL antes de subir al TP
  ['largo, alcista: O→L (llena y SL) → H', L, v(1.1005, 1.1035, 1.0985, 1.1020), 'SL'],
  // corto, alcista: baja a 1,0965 sin llenar, sube: llena en 1,1000 y toca el SL 1,1010
  ['corto, alcista: O→L (sin llenar) → H (llena, SL)', C, v(1.0990, 1.1015, 1.0965, 1.1000), 'SL'],
  // corto, bajista: sube a 1,1005 (llena, no SL), baja a 1,0965 (TP)
  ['corto, bajista: O→H (llena) → L (TP)', C, v(1.0995, 1.1005, 1.0965, 1.0980), 'TP'],
  // doji equidistante que llena: en un recorrido toca el SL → el SL
  ['largo, doji equidistante: el SL si algun recorrido lo toca', L, v(1.1005, 1.1035, 1.0975, 1.1005), 'SL'],
  // hueco: la vela abre ya por debajo de la entrada de la BUY LIMIT (se llena en la apertura) y por
  // encima del SL; alcista, sube al TP
  ['largo, hueco en la entrada: llena en la apertura y va al TP', L, v(1.0995, 1.1035, 1.0993, 1.1030), 'TP'],
  // sin cierre: llena y no llega ni al SL ni al TP
  ['largo, llena sin tocar nada mas', L, v(1.1005, 1.1010, 1.0995, 1.1008), null],
]
for (const [d, pos, vel, esperado] of LLENADO) {
  const r = V.cierreEnVela(pos, vel, { llenadaAqui: true })
  oraculo('SV01', `${d}: ${esperado ?? 'ninguno'}`, r === esperado, String(r))
}
ver('control: una posicion abierta antes de la vela (no llenada aqui) con un hueco de apertura mas alla del SL: el SL', V.cierreEnVela(L, v(1.0980, 1.1040, 1.0975, 1.1035)) === 'SL')
fin()
