/**
 * SG01 · EL GO TO RECORRE TODAS LAS VELAS DEL TRAMO (orden 1-080 del CTO; el caso de Luis)
 *
 * En 8d99f6b handleGoTo hacia seekToTime(destino): UN onTick para todo el tramo y despues
 * un reset de cursores. checkSLTP va antes que checkLimitOrders: una pendiente que se
 * llenaba dentro del salto quedaba abierta sin mirar nunca su SL ni su TP (M04, variante
 * Go to). Regla del CTO: un salto se comporta igual que el replay vela a vela.
 *
 * Se ejecuta con el banco del motor (cableado REAL; irA llama al salto REAL, lib/sim/salto.js).
 * Cada caso se mira dos veces: con el Go to y paso a paso (handleStep, nextCandle(1)), sobre
 * las mismas velas (otro año, por la cache de /api/candles por par y año, D05).
 *
 * ORACULOS, a mano. Enero (EST, UTC−5): NY AM abre a las 12:00 UTC. El salto va de las
 * 11:55 a las 12:00. 1 lote de un XXX/USD = 10 USD/pip.
 *   1 BUY LIMIT 1,1000 · SL 1,0990 · TP 1,1030. 11:56 baja a 1,0999 (se llena); 11:57 sube
 *     a 1,1031 sin bajar del SL → TP: +30 pips × 10 = +300, cerrada en la vela de las 11:57.
 *   2 La misma; 11:57 baja a 1,0985 sin tocar el TP → SL: −10 × 10 = −100, a las 11:57.
 *   3 BUY a mercado 1,1020 antes del salto · SL 1,0990 · TP 1,1050; 11:57 sube a 1,1051 → TP
 *     +300, a las 11:57 (no a la hora de la pagina antes del salto).
 *   4 Reto 2F, capital 100.000, perdida diaria 5 % = 5.000. BUY LIMIT 1,2000 de 10 lotes
 *     (100 USD/pip) · SL 1,1900 · TP 1,2300. 11:56 se llena; 11:57 baja a 1,1940: el limite
 *     se cruza a 1,1950 (−50 pips × 100 = −5.000) y lib/trading/breach.js cierra medio pip
 *     mas alla, a 1,19495 (−50,5 × 100 = −5.050) → cierre forzado ahi, y el salto PARA en
 *     esa vela (11:57), como el replay, que queda bloqueado.
 * La regla de la misma vela (SL y TP tocados a la vez) es la de checkSLTP: gana el TP; esta
 * prueba no la usa (los casos tocan uno solo). La de una pendiente que se llena y toca su
 * SL en la MISMA vela sigue en fase1/m04 (rojo tambien paso a paso: no es del salto).
 */
import { titulo, ver, oraculo, fin, escenario, sesionSim, vela } from '../lib.mjs'
import { banco, velasEnStorage, copiasVigentes } from '../banco-motor.mjs'

ver('control: las lineas copiadas de _SessionInner siguen ahi', Object.values(copiasVigentes()).every(Boolean), JSON.stringify(copiasVigentes()))
const hhmm = t => new Date(t * 1000).toISOString().slice(11, 16)

// las velas de 11:55 a 12:02 de un dia de enero: (o, h, l, c) por minuto desde las 11:55
function velasDe(dia, filas) {
  const T0 = Date.parse(`${dia}T11:55:00Z`) / 1000
  return { T0, velas: filas.map((f, i) => vela(T0 + i * 60, ...f)) }
}
const TRAMO = {
  tp:  [[1.1020, 1.1022, 1.1018, 1.1020], [1.1010, 1.1012, 1.0999, 1.1001], [1.1005, 1.1031, 1.1001, 1.1025], [1.1020, 1.1022, 1.1015, 1.1018], [1.1018, 1.1020, 1.1012, 1.1015], [1.1015, 1.1016, 1.1010, 1.1012], [1.1012, 1.1013, 1.1011, 1.1012], [1.1012, 1.1013, 1.1011, 1.1012]],
  sl:  [[1.1020, 1.1022, 1.1018, 1.1020], [1.1010, 1.1012, 1.0999, 1.1001], [1.1001, 1.1004, 1.0985, 1.0995], [1.0995, 1.1005, 1.0993, 1.1000], [1.1000, 1.1002, 1.0998, 1.1000], [1.1000, 1.1001, 1.0999, 1.1000], [1.1000, 1.1001, 1.0999, 1.1000], [1.1000, 1.1001, 1.0999, 1.1000]],
  mer: [[1.1020, 1.1022, 1.1018, 1.1020], [1.1020, 1.1030, 1.1015, 1.1028], [1.1028, 1.1051, 1.1025, 1.1040], [1.1040, 1.1042, 1.1030, 1.1035], [1.1035, 1.1036, 1.1030, 1.1032], [1.1032, 1.1033, 1.1030, 1.1031], [1.1031, 1.1032, 1.1030, 1.1031], [1.1031, 1.1032, 1.1030, 1.1031]],
  dd:  [[1.2020, 1.2022, 1.2018, 1.2020], [1.2010, 1.2012, 1.1999, 1.2001], [1.2001, 1.2003, 1.1940, 1.1960], [1.1960, 1.1990, 1.1955, 1.1985], [1.1985, 1.2050, 1.1980, 1.2040], [1.2040, 1.2045, 1.2035, 1.2040], [1.2040, 1.2041, 1.2039, 1.2040], [1.2040, 1.2041, 1.2039, 1.2040]],
}
// dias de enero en lunes-viernes, lejos del cambio de hora; uno para el salto y otro para paso a paso
const DIAS = { salto: '2025-01-07', paso: '2024-01-09' }

async function caso({ par, tramo, saltando, reto = false, pendiente = null, mercado = null }) {
  const dia = DIAS[saltando ? 'salto' : 'paso']
  const { T0, velas } = velasDe(dia, tramo)
  const ses = sesionSim({ pair: par, date_from: dia, date_to: dia.slice(0, 8) + String(+dia.slice(8) + 3).padStart(2, '0'),
    ...(reto ? { capital: 100000, balance: 100000, challenge_type: '2F', challenge_phase: 1 } : {}) })
  escenario({ sim_sessions: [ses] })
  velasEnStorage(par, velas, [+dia.slice(0, 4) - 1], { tramoAbierto: true })
  const b = await banco({ sesion: ses })
  await b.repinta()
  const ini = b.motor().currentTime
  if (pendiente) await b.pendiente(pendiente)
  if (mercado) b.abreMercado(mercado)
  let destino = null
  if (saltando) destino = await b.irA('nyam')
  else for (let i = 0; i < 5 && b.motor().currentTime < T0 + 300; i++) { if (reto && b.estado.isPlaying === false && b.ps().trades.some(t => /BREACH/.test(t.reason))) break; await b.paso(1) }
  await new Promise(r => setTimeout(r, 50)); await b.repinta()
  return { b, T0, ini, destino, trades: b.ps().trades, abiertas: b.ps().positions, pendientes: b.ps().orders || [], fin: b.motor().currentTime }
}
const resumen = r => JSON.stringify({ cerradas: r.trades.map(t => [t.reason, +t.pnl.toFixed(2), hhmm(t.closeTime)]), abiertas: r.abiertas.map(p => [p.entry, hhmm(p.openTime)]), pendientes: r.pendientes.length, motor: hhmm(r.fin) })
// minuto (opcional): la vela del cierre, en minutos desde las 11:55. Los controles no lo miran: en
// 8d99f6b el cierre llevaba la hora de la pagina, una vela tarde tambien paso a paso
const unCierre = (r, motivo, pnl, minuto = null) => r.trades.length === 1 && r.abiertas.length === 0 && r.trades[0].reason === motivo
  && Math.abs(r.trades[0].pnl - pnl) < 0.01 && (minuto == null || r.trades[0].closeTime === r.T0 + minuto * 60)
const mismo = (a, b) => a.trades.length === b.trades.length && a.trades.every((t, i) => t.reason === b.trades[i].reason
  && Math.abs(t.pnl - b.trades[i].pnl) < 0.01 && t.closeTime - a.T0 === b.trades[i].closeTime - b.T0) && a.abiertas.length === b.abiertas.length

const LIMIT = { side: 'BUY_LIMIT', entry: 1.1000, sl: 1.0990, tp: 1.1030, lots: 1, slPips: 10, tpPips: 30 }

titulo('1 · pendiente → se activa → TP, dentro del salto')
const p1 = await caso({ par: 'EUR/USD', tramo: TRAMO.tp, saltando: false, pendiente: LIMIT })
const s1 = await caso({ par: 'EUR/USD', tramo: TRAMO.tp, saltando: true, pendiente: LIMIT })
ver('control: el salto empieza a las 11:55 y su destino es la apertura de NY AM, las 12:00', hhmm(s1.ini) === '11:55' && s1.destino?.time === s1.T0 + 300, JSON.stringify({ ini: hhmm(s1.ini), destino: s1.destino && hhmm(s1.destino.time) }))
ver('control: paso a paso, TP +300', unCierre(p1, 'TP', 300), resumen(p1))
oraculo('SG01', 'paso a paso: el cierre es de la vela que toca el TP (11:57), no de la hora de la pagina de la vela anterior', unCierre(p1, 'TP', 300, 2), resumen(p1))
oraculo('SG01', 'Go to: la pendiente se llena a las 11:56 y cierra en su TP (+300) a las 11:57', unCierre(s1, 'TP', 300, 2), resumen(s1))
oraculo('SG01', 'Go to = paso a paso (mismos cierres, a la misma hora)', mismo(s1, p1), `salto ${resumen(s1)} · paso ${resumen(p1)}`)
oraculo('SG01', 'Go to: el motor llega a las 12:00', s1.fin === s1.T0 + 300 && s1.destino?.llego !== false, hhmm(s1.fin))

titulo('2 · pendiente → se activa → SL, dentro del salto')
const p2 = await caso({ par: 'GBP/USD', tramo: TRAMO.sl, saltando: false, pendiente: LIMIT })
const s2 = await caso({ par: 'GBP/USD', tramo: TRAMO.sl, saltando: true, pendiente: LIMIT })
ver('control: paso a paso, SL −100', unCierre(p2, 'SL', -100), resumen(p2))
oraculo('SG01', 'Go to: la pendiente se llena a las 11:56 y cierra en su SL (−100) a las 11:57', unCierre(s2, 'SL', -100, 2), resumen(s2))
oraculo('SG01', 'Go to = paso a paso', mismo(s2, p2), `salto ${resumen(s2)} · paso ${resumen(p2)}`)

titulo('3 · posicion abierta antes del salto → TP dentro del salto')
const MER = { side: 'BUY', entry: 1.1020, sl: 1.0990, tp: 1.1050, lots: 1, slPips: 30, tpPips: 30 }
const p3 = await caso({ par: 'AUD/USD', tramo: TRAMO.mer, saltando: false, mercado: MER })
const s3 = await caso({ par: 'AUD/USD', tramo: TRAMO.mer, saltando: true, mercado: MER })
ver('control: paso a paso, TP +300', unCierre(p3, 'TP', 300), resumen(p3))
oraculo('SG01', 'Go to: cierra en su TP (+300) y el cierre es de la vela de las 11:57, no de la hora de antes del salto', unCierre(s3, 'TP', 300, 2), resumen(s3))
oraculo('SG01', 'Go to = paso a paso', mismo(s3, p3), `salto ${resumen(s3)} · paso ${resumen(p3)}`)

titulo('4 · reto: la perdida diaria se cruza dentro del salto')
const DD = { side: 'BUY_LIMIT', entry: 1.2000, sl: 1.1900, tp: 1.2300, lots: 10, slPips: 100, tpPips: 300 }
const p4 = await caso({ par: 'NZD/USD', tramo: TRAMO.dd, saltando: false, reto: true, pendiente: DD })
const s4 = await caso({ par: 'NZD/USD', tramo: TRAMO.dd, saltando: true, reto: true, pendiente: DD })
const forzado = r => r.trades.filter(t => /BREACH/.test(t.reason))
ver('control: el estado del reto llego del endpoint real (2F, cap diario 5.000)', s4.b.caja.valor.reto.challengeStatus?.config?.code === '2F' && s4.b.caja.valor.reto.challengeStatus?.evaluation?.ddDailyCapUSD === 5000,
  JSON.stringify(s4.b.caja.valor.reto.challengeStatus?.evaluation?.ddDailyCapUSD))
ver('control: paso a paso, cierre forzado a 1,19495 (−5.050) y el replay para en las 11:57', forzado(p4).length === 1 && Math.abs(forzado(p4)[0].pnl + 5050) < 1 && p4.fin === p4.T0 + 120, resumen(p4))
oraculo('SG01', 'Go to: la pendiente se llena y el cruce de la perdida diaria la cierra a 1,19495 (−5.050) a las 11:57', forzado(s4).length === 1 && Math.abs(forzado(s4)[0].pnl + 5050) < 1
  && Math.abs(forzado(s4)[0].exit - 1.19495) < 1e-6 && forzado(s4)[0].closeTime === s4.T0 + 120 && s4.abiertas.length === 0, resumen(s4))
oraculo('SG01', 'Go to: el salto PARA en la vela del cruce (11:57), no sigue hasta las 12:00', s4.fin === s4.T0 + 120 && s4.destino?.llego === false, `motor ${hhmm(s4.fin)}`)
oraculo('SG01', 'Go to = paso a paso', mismo(s4, p4), `salto ${resumen(s4)} · paso ${resumen(p4)}`)

titulo('control: un salto sin posiciones ni pendientes no cambia nada y llega')
const s5 = await caso({ par: 'USD/CAD', tramo: TRAMO.tp, saltando: true })
ver('sin nada abierto: llega a las 12:00, sin cierres', s5.fin === s5.T0 + 300 && s5.trades.length === 0, resumen(s5))
fin()
