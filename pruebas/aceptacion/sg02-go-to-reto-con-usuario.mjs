/**
 * SG02 · EL GO TO EN UN RETO CON USUARIO: ESPERA A LOS CIERRES Y RELEE EL RETO VELA A VELA (orden 1-080)
 *
 * La revision adversarial de sim-goto-r1: sg01 va sin usuario (los cierres no llegan al reto) y aprobaba
 * igual un salto sin trasVela (lib/sim/salto.js). Aqui los cierres van por la funcion atomica (doble) y el
 * reto se lee del endpoint real; cada caso, con el Go to y paso a paso (otro año: cache de /api/candles).
 *
 * ORACULOS, a mano. 1 lote = 10 USD/pip; cap diario 5 % de 100.000 = 5.000.
 *   5 y 6 (la revision adversarial: sin usuario los cierres no llegan al reto y nada probaba que el
 *     salto espere a la cola y relea el reto). Reto 2F con usuario, 100.000, cierres por la funcion
 *     atomica (doble). De las 22:55 UTC a la apertura de Londres (07:00 UTC). BUY a mercado 1,2000 de
 *     10 lotes, SL 1,1960: cierra a las 22:57 en −4.000. BUY LIMIT 1,1950 de 10 lotes, SL 1,1850.
 *   5 Mismo dia de Madrid: se llena a las 22:58 y a las 22:59 (23:59 en Madrid) baja a 1,1930. Hoy ya
 *     se perdieron 4.000: quedan 1.000 = 10 pips → 1,1940, y medio pip mas alla, 1,19395: −1.050. El
 *     salto para a las 22:59. Sin la espera, el reto se mira con el estado de antes del SL.
 *   6 Cruza la medianoche de Madrid: se llena a las 00:10 UTC y a las 00:30 baja a 1,1930: −2.000 en el
 *     dia NUEVO (el −4.000 era de ayer), sin breach; la pendiente sigue abierta y el salto llega a las 07:00.
 */
import { titulo, ver, oraculo, fin, escenario, sesionSim, vela, importa, A } from '../lib.mjs'
import { banco, velasEnStorage, copiasVigentes } from '../banco-motor.mjs'
ver('control: las lineas copiadas de _SessionInner siguen ahi', Object.values(copiasVigentes()).every(Boolean), JSON.stringify(copiasVigentes()))
const hhmm = t => new Date(t * 1000).toISOString().slice(11, 16)

titulo('5 y 6 · reto con usuario: el salto espera a los cierres y relee el reto vela a vela')
// el codigo auditado (c470c8f, historicas.sh) no tiene la cola ni el cierre atomico de la etapa 1: ahi, rojo
const CI = await importa('lib/sim/cierre.js').catch(() => null), SV = await importa('lib/sim/servicio.js').catch(() => null)
if (!CI || !SV) { for (const c of ['5 · mismo dia', '5 · = paso a paso', '6 · medianoche', '6 · = paso a paso']) oraculo('SG02', `${c}: sin lib/sim/cierre.js ni servicio.js (la cola de la etapa 1) no se puede`, false, 'no estan'); fin() }
// minutos desde las 22:55 UTC: m (llenado de la pendiente) y b (la bajada a 1,1930)
function nocturno(dia, m, b) {
  const T0 = Date.parse(`${dia}T22:55:00Z`) / 1000, velas = []
  for (let t = T0; t <= T0 + 8 * 3600 + 6 * 60; t += 60) {
    const i = (t - T0) / 60
    let f = i < 2 ? [1.2000, 1.2002, 1.1998, 1.2000] : [1.1980, 1.1982, 1.1978, 1.1980]
    if (i === 2) f = [1.2000, 1.2001, 1.1958, 1.1980]          // el SL del mercado (1,1960)
    if (i === m) f = [1.1980, 1.1981, 1.1949, 1.1955]          // llena la limit (1,1950)
    if (i > m) f = [1.1960, 1.1962, 1.1958, 1.1960]
    if (i === b) f = [1.1960, 1.1961, 1.1930, 1.1950]          // la bajada
    velas.push(vela(t, ...f))
  }
  return { T0, velas }
}
async function nocturnoCaso({ par, dia, m, b: bajada, saltando }) {
  const { T0, velas } = nocturno(dia, m, bajada)
  const ses = sesionSim({ pair: par, date_from: dia, date_to: dia.slice(0, 8) + String(+dia.slice(8) + 3).padStart(2, '0'), capital: 100000, balance: 100000, challenge_type: '2F', challenge_phase: 1 })
  escenario({ sim_sessions: [ses] })
  velasEnStorage(par, velas, [+dia.slice(0, 4) - 1], { tramoAbierto: true })
  const b = await banco({ sesion: ses, userId: A }); CI.fijaSaldoConfirmado(ses.id, 100000); await SV.leeServicio(); await b.repinta()
  b.abreMercado({ side: 'BUY', entry: 1.2000, sl: 1.1960, tp: 1.2300, lots: 10, slPips: 40, tpPips: 300 })
  await b.pendiente({ side: 'BUY_LIMIT', entry: 1.1950, sl: 1.1850, tp: 1.2300, lots: 10, slPips: 100, tpPips: 350 })
  let destino = null
  const londres = T0 + 8 * 3600 + 5 * 60
  if (saltando) destino = await b.irA('london')
  else while (b.motor().currentTime < londres) { if (b.ps().trades.some(t => /BREACH/.test(t.reason))) break; await b.paso(1) }
  await new Promise(r => setTimeout(r, 80)); await b.repinta()
  return { b, T0, destino, londres, trades: b.ps().trades.map(t => [t.reason, +t.pnl.toFixed(2), t.closeTime - T0]), abiertas: b.ps().positions.length, fin: b.motor().currentTime }
}
// los controles, sin la vela del cierre (en 8d99f6b, la hora de la pagina: una vela tarde)
const sinHora = r => JSON.stringify(r.trades.map(([m, p]) => [m, p]))
const igualN = (x, y) => JSON.stringify([x.trades, x.abiertas, x.fin - x.T0]) === JSON.stringify([y.trades, y.abiertas, y.fin - y.T0])
const n = r => JSON.stringify({ cerradas: r.trades, abiertas: r.abiertas, motor: hhmm(r.fin) })
const p5 = await nocturnoCaso({ par: 'EUR/USD', dia: '2025-01-07', m: 3, b: 4, saltando: false })
const s5n = await nocturnoCaso({ par: 'GBP/USD', dia: '2024-01-09', m: 3, b: 4, saltando: true })
const esperado5 = JSON.stringify([['SL', -4000, 120], ['DD_DAILY_BREACH', -1050, 240]])
ver('control: paso a paso, SL −4.000 y breach diario −1.050, y para a las 22:59', sinHora(p5) === JSON.stringify([['SL', -4000], ['DD_DAILY_BREACH', -1050]]) && hhmm(p5.fin) === '22:59', n(p5))
oraculo('SG02', '5 · Go to, mismo dia: SL −4.000 y breach −1.050 a las 22:59 (el reto releido tras el SL), y para ahi', JSON.stringify(s5n.trades) === esperado5 && hhmm(s5n.fin) === '22:59' && s5n.destino?.llego === false, n(s5n))
oraculo('SG02', '5 · Go to = paso a paso', igualN(s5n, p5), `salto ${n(s5n)} · paso ${n(p5)}`)
const p6 = await nocturnoCaso({ par: 'EUR/USD', dia: '2024-01-09', m: 75, b: 95, saltando: false })
const s6 = await nocturnoCaso({ par: 'GBP/USD', dia: '2025-01-07', m: 75, b: 95, saltando: true })
ver('control: paso a paso, solo el SL −4.000; la limit, abierta; llega a Londres', sinHora(p6) === JSON.stringify([['SL', -4000]]) && p6.abiertas === 1, n(p6))
oraculo('SG02', '6 · Go to cruzando la medianoche de Madrid: sin breach (el −4.000 era de ayer), la limit abierta y llega a las 07:00', JSON.stringify(s6.trades) === JSON.stringify([['SL', -4000, 120]]) && s6.abiertas === 1 && s6.destino?.llego === true && hhmm(s6.fin) === '07:00', n(s6))
oraculo('SG02', '6 · Go to = paso a paso', igualN(s6, p6), `salto ${n(s6)} · paso ${n(p6)}`)

fin()
