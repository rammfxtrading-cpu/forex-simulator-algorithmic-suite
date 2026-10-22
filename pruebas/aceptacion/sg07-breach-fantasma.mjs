/**
 * SG07 · UN SL EN CURSO NO DA UN BREACH FANTASMA QUE PARE EL GO TO (salto = avance; revisor adversario de sim-goto-r2)
 * Reproduccion original del revisor en revisiones-suite/2026-10-22-sim-goto-r2/revisor/ (rojo en 415a1f7 y 4f3d245).
 */
// REV-R3: en un reto, una vela que toca el SL de una posicion Y cuyo extremo superaria el DD diario.
// checkSLTP pide el cierre a SL (pendiente en la cola) y en el mismo onTick checkChallengeBreach ve la
// posicion aun viva, "detecta" un breach y llama engine.pause(). El reto sigue activo (el SL se guardo).
// Avanzando con Step ese pause no hace nada y se sigue; en el Go to corta el salto: salto != avance.
import { titulo, ver, oraculo, fin, escenario, sesionSim, vela, importa, A, db } from '../lib.mjs'
import { banco, velasEnStorage } from '../banco-motor.mjs'
const CI = await importa('lib/sim/cierre.js').catch(() => null), SV = await importa('lib/sim/servicio.js').catch(() => null)
// el codigo auditado (c470c8f, historicas.sh) no tiene la cola de la etapa 1: ahi, rojo
if (!CI || !SV) { oraculo('REV-R3', 'sin lib/sim/cierre.js ni servicio.js (la cola de la etapa 1) no se puede', false, 'no estan'); fin() }
const dia = '2025-01-07', T = Date.parse(`${dia}T05:00:00Z`) / 1000   // martes 05:00 UTC; london abre despues
const vs = Array.from({ length: 600 }, (_, i) => i === 3
  ? vela(T + i * 60, 1.1, 1.1200, 1.0999, 1.1003)     // mecha: toca el SL (1,1010) y llega a 1,1200
  : vela(T + i * 60, 1.1, 1.1002, 1.0998, 1.1))
async function corre(modo) {
  const ses = sesionSim({ pair: 'EUR/USD', date_from: dia, date_to: '2025-01-10', last_timestamp: T, capital: 100000, balance: 100000, challenge_type: '2F', challenge_phase: 1 })
  escenario({ sim_sessions: [ses] })
  globalThis.window.__algSuiteCurrentTime = null
  velasEnStorage('EUR/USD', vs, [2024], { tramoAbierto: true })
  const b = await banco({ sesion: ses, userId: A }); CI.fijaSaldoConfirmado(ses.id, 100000); await SV.leeServicio(); await b.repinta()
  b.abreMercado({ side: 'SELL', entry: 1.1, sl: 1.101, tp: 1.09, lots: 10, slPips: 10, tpPips: 100 })
  let hasta
  if (modo === 'salto') { const r = await b.irA('london'); hasta = r.time; console.log('  irA', JSON.stringify(r)) }
  else { const { nextSessionOpen } = await importa('lib/killzonesDomain.js'); hasta = nextSessionOpen(b.motor().candles, b.motor().currentIndex, 'london').time
    while (b.motor().currentTime < hasta) await b.paso(1) }
  await new Promise(s => setTimeout(s, 80)); await b.repinta()
  const ps = b.ps('EUR/USD')
  const r = { motor: (b.motor().currentTime - T) / 60, hasta: (hasta - T) / 60, saldo: +b.estado.saldo.toFixed(2), estado: b.caja.valor.reto.challengeStatus?.evaluation?.status,
    trades: ps.trades.map(t => [t.reason, +t.pnl.toFixed(2), (t.closeTime - T) / 60]), filas: db.tablas.sim_trades.map(f => [+Number(f.pnl).toFixed(2), f.closed_at]) }
  b.caja.raiz.desmonta?.()
  return r
}
const s = await corre('salto'), p = await corre('paso')
console.log('  salto ', JSON.stringify(s)); console.log('  avance', JSON.stringify(p))
ver('control: el SL se ejecuta en los dos (-1000 en la vela 3) y el reto sigue activo', [s, p].every(x => JSON.stringify(x.trades) === '[["SL",-1000,3]]' && x.estado === 'active'))
oraculo('REV-R3', 'salto = avance (hora del motor)', s.motor === p.motor, `salto T+${s.motor} min · avance T+${p.motor} min (destino T+${p.hasta})`)
fin()
