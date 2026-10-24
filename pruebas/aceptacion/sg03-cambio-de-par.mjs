/**
 * SG03 · AL VOLVER A UN PAR, SU MOTOR SE PONE AL DIA VELA A VELA (orden 1-081 del CTO)
 *
 * En 8d99f6b, al volver a un par su motor saltaba al tiempo maestro con seekToTime: UN onTick para
 * todo el hueco (components/usePairData.js, el efecto del par activo). Una pendiente de ese par que se
 * llenaba en el hueco no miraba su SL/TP (M04, la misma familia que el Go to: sg01).
 *
 * Banco de dos pares (pruebas/banco-motor.mjs, cambiaPar: el estado y activePairRef como la pagina).
 * ORACULO, a mano: GBP/USD, BUY LIMIT 1,1000 · SL 1,0990 · TP 1,1030. 11:56 se llena (baja a 1,0999);
 * 11:57 sube a 1,1031 → TP +300 a las 11:57. Se pone la pendiente en GBP/USD a las 11:55, se cambia a
 * EUR/USD, se avanzan 5 velas (12:00) y se vuelve a GBP/USD: tiene que dar lo mismo que haberse
 * quedado en GBP/USD paso a paso (otro año: cache de /api/candles por par y año, D05).
 */
import { titulo, ver, oraculo, fin, escenario, sesionSim, vela } from '../lib.mjs'
import { banco, velasEnStorage } from '../banco-motor.mjs'
const hhmm = t => new Date(t * 1000).toISOString().slice(11, 16)
const GBP = [[1.1020, 1.1022, 1.1018, 1.1020], [1.1010, 1.1012, 1.0999, 1.1001], [1.1005, 1.1031, 1.1001, 1.1025], [1.1020, 1.1022, 1.1015, 1.1018], [1.1018, 1.1020, 1.1012, 1.1015], [1.1015, 1.1016, 1.1010, 1.1012], [1.1012, 1.1013, 1.1011, 1.1012], [1.1012, 1.1013, 1.1011, 1.1012]]
const EUR = GBP.map(() => [1.0500, 1.0501, 1.0499, 1.0500])
const LIMIT = { side: 'BUY_LIMIT', entry: 1.1000, sl: 1.0990, tp: 1.1030, lots: 1, slPips: 10, tpPips: 30 }

async function caso(dia, cambiando) {
  const T0 = Date.parse(`${dia}T11:55:00Z`) / 1000
  const ses = sesionSim({ pair: 'GBP/USD', date_from: dia, date_to: dia.slice(0, 8) + String(+dia.slice(8) + 3).padStart(2, '0') })
  escenario({ sim_sessions: [ses] })
  velasEnStorage('EUR/USD', EUR.map((f, i) => vela(T0 + i * 60, ...f)), [+dia.slice(0, 4) - 1], { tramoAbierto: true })
  velasEnStorage('GBP/USD', GBP.map((f, i) => vela(T0 + i * 60, ...f)), [+dia.slice(0, 4) - 1], { tramoAbierto: true })
  const b = await banco({ sesion: ses })
  await b.repinta()
  const ini = b.motor('GBP/USD').currentTime
  await b.pendiente(LIMIT)
  let eur = null
  if (cambiando) {
    await b.cambiaPar('EUR/USD')
    eur = b.motor('EUR/USD')?.currentTime
    await b.paso(5)
    eur = { carga: eur, tras: b.motor('EUR/USD')?.currentTime }
    await b.cambiaPar('GBP/USD')
  } else await b.paso(5)
  await new Promise(r => setTimeout(r, 50)); await b.repinta()
  const ps = b.ps('GBP/USD')
  return { T0, ini, eur, trades: ps.trades, abiertas: ps.positions, pendientes: ps.orders || [], fin: b.motor('GBP/USD').currentTime }
}
const resumen = r => JSON.stringify({ cerradas: r.trades.map(t => [t.reason, +t.pnl.toFixed(2)]), abiertas: r.abiertas.map(p => [p.entry, hhmm(p.openTime)]), pendientes: r.pendientes.length, gbp: hhmm(r.fin) })
const tp = r => r.trades.length === 1 && r.trades[0].reason === 'TP' && Math.abs(r.trades[0].pnl - 300) < 0.01 && r.abiertas.length === 0

titulo('volver a GBP/USD con una pendiente que se llena y va a TP mientras se estaba en EUR/USD')
const p = await caso('2024-01-09', false)
const c = await caso('2025-01-07', true)
ver('control: quedandose en GBP/USD paso a paso, TP +300', tp(p), resumen(p))
ver('control: EUR/USD se cargo a las 11:55 y avanzo hasta las 12:00', c.eur?.carga === c.T0 && c.eur?.tras === c.T0 + 300, JSON.stringify({ carga: c.eur?.carga && hhmm(c.eur.carga), tras: c.eur?.tras && hhmm(c.eur.tras) }))
oraculo('SG03', 'al volver, GBP/USD llega a las 12:00', c.fin === c.T0 + 300, hhmm(c.fin))
oraculo('SG03', 'al volver, la pendiente llenada a las 11:56 ha cerrado en su TP (+300)', tp(c), resumen(c))
oraculo('SG03', 'el TP es de la vela de las 11:57 (la del toque, no la de la vuelta)', c.trades[0]?.closeTime === c.T0 + 120, c.trades[0] ? hhmm(c.trades[0].closeTime) : '-')
fin()
