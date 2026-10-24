/**
 * SG04 · CAMBIAR DE PAR MIENTRAS EL GO TO ESPERA: NUNCA DOS RELOJES, CADA CIERRE CON LA HORA DE SU PAR
 * (SIMGOTO-01, Astra 22-oct; orden 1-083 del CTO)
 *
 * En 415a1f7 el salto de GBP/USD seguia en segundo plano tras cambiar a EUR/USD y sus cierres se
 * guardaban con la hora del motor del par ACTIVO: un TP de las 23:00 UTC (00:00 en Madrid, dia nuevo)
 * quedaba a las 22:59, en el dia anterior. Reproduccion de Astra (astra-en-vuelo.mjs): reto 2F con
 * usuario, BUY LIMIT 1,1000 · SL 1,0990 · TP 1,1030; la vela 1 la llena, la 2 toca el TP. Se retiene la
 * respuesta de challenge/status de la vela del llenado, se cambia de par y se suelta.
 *
 * Contrato (orden 1-083): cambiar de par corta el salto en la vela en que va, como si se hubiera
 * avanzado hasta ahi y despues cambiado de par. ORACULOS, a mano, de dia (11:55) y cruzando la
 * medianoche de Madrid (22:58):
 *   1 cortado: GBP/USD se queda en la vela del llenado (T+60), sin trades ni filas; EUR/USD, en T+60.
 *   2 al volver a GBP/USD y repetir el Go to, lo mismo que sin cambiar de par: TP +300 a T+120, y la
 *     fila con closed_at de T+120 (el dia de Madrid de SU vela).
 */
import { titulo, ver, oraculo, fin, escenario, sesionSim, vela, importa, A, retenApi, puerta, asienta, db } from '../lib.mjs'
import { banco, velasEnStorage } from '../banco-motor.mjs'
const CI = await importa('lib/sim/cierre.js').catch(() => null), SV = await importa('lib/sim/servicio.js').catch(() => null)
if (!CI || !SV) { for (const c of ['11:55 · cortado', '11:55 · = sin cambiar', '22:58 · cortado', '22:58 · = sin cambiar']) oraculo('SG04', `${c}: sin la cola de la etapa 1 no se puede`, false, 'no estan'); fin() }

async function caso(hora, cambia) {
  const dia = hora === '11:55' ? '2025-01-07' : '2024-01-09', T = Date.parse(`${dia}T${hora}:00Z`) / 1000
  const ses = sesionSim({ pair: 'GBP/USD', date_from: dia, date_to: dia.slice(0, 8) + String(+dia.slice(8) + 3).padStart(2, '0'), capital: 100000, balance: 100000, challenge_type: '2F', challenge_phase: 1 })
  escenario({ sim_sessions: [ses] })
  if (globalThis.window) globalThis.window.__algSuiteCurrentTime = null
  const vs = Array.from({ length: 505 }, (_, i) => vela(T + i * 60, ...(i === 1 ? [1.101, 1.1012, 1.0999, 1.1001] : i === 2 ? [1.1005, 1.1031, 1.1001, 1.1025] : [1.102, 1.1022, 1.1018, 1.102])))
  velasEnStorage('GBP/USD', vs, [+dia.slice(0, 4) - 1], { tramoAbierto: true })
  velasEnStorage('EUR/USD', vs.map(v => vela(v.time, 1.05, 1.0501, 1.0499, 1.05)), [+dia.slice(0, 4) - 1], { tramoAbierto: true })
  const b = await banco({ sesion: ses, userId: A }); CI.fijaSaldoConfirmado(ses.id, 100000); await SV.leeServicio(); await b.repinta()
  await b.pendiente({ side: 'BUY_LIMIT', entry: 1.1, sl: 1.099, tp: 1.103, lots: 1, slPips: 10, tpPips: 30 })
  const sesion = hora === '11:55' ? 'nyam' : 'london'
  const entrada = puerta(), salida = puerta(); let retenido = false
  retenApi.antes = async u => { if (!retenido && u.includes('challenge/status') && u.includes('current_time=' + (T + 60))) { retenido = true; entrada.abrir(); await salida.p } }
  const prom = b.irA(sesion)
  await Promise.race([entrada.p, new Promise((_, r) => setTimeout(() => r(new Error('no llega a la barrera')), 3000))])
  ver(`${hora}: control, retenido el status de la vela del llenado`, b.motor('GBP/USD').currentTime === T + 60)
  if (cambia) await b.cambiaPar('EUR/USD')
  salida.abrir(); await prom; await asienta(100); await b.repinta()
  retenApi.antes = null
  const foto = () => ({ gbp: b.motor('GBP/USD').currentTime - T, eur: b.motor('EUR/USD') ? b.motor('EUR/USD').currentTime - T : null,
    trades: b.ps('GBP/USD').trades.map(t => [t.reason, +t.pnl.toFixed(2), t.closeTime - T]), filas: db.tablas.sim_trades.map(f => [+Number(f.pnl).toFixed(2), f.closed_at]) })
  const enVuelo = foto()
  if (cambia) { await b.cambiaPar('GBP/USD'); await b.irA(sesion); await asienta(100); await b.repinta() }
  const final = foto()
  b.caja.raiz.desmonta?.()
  return { T, enVuelo, final }
}

for (const h of ['11:55', '22:58']) {
  titulo(`${h}: cambio de par mientras el salto espera al reto`)
  const a = await caso(h, false), c = await caso(h, true)
  const tp = new Date((a.T + 120) * 1000).toISOString()
  ver(`${h}: control, sin cambiar de par: TP +300 a T+120 y su fila a ${tp}`, JSON.stringify(a.final.trades) === JSON.stringify([['TP', 300, 120]]) && JSON.stringify(a.final.filas) === JSON.stringify([[300, tp]]), JSON.stringify(a.final))
  oraculo('SG04', `${h} · cambiar de par corta el salto en la vela del llenado: GBP/USD y EUR/USD en T+60, sin trades ni filas`,
    c.enVuelo.gbp === 60 && c.enVuelo.eur === 60 && !c.enVuelo.trades.length && !c.enVuelo.filas.length, JSON.stringify(c.enVuelo))
  oraculo('SG04', `${h} · al volver y repetir el Go to, lo mismo que sin cambiar: TP con la hora de SU vela y fila en su dia`,
    JSON.stringify(c.final.trades) === JSON.stringify(a.final.trades) && JSON.stringify(c.final.filas) === JSON.stringify(a.final.filas), `cambiando ${JSON.stringify(c.final)} · sin cambiar ${JSON.stringify(a.final)}`)
}
fin()
