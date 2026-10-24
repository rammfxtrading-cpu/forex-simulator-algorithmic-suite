/**
 * SV04 · COBERTURAS Y AJUSTE AL TICK EN LA PANTALLA (orden 1-119 del CTO, puntos 1 y 2). Escrita ANTES que el codigo.
 *   A · cobertura en Step, Play y Go to: EURUSD BUY y SELL de 1 lote abiertas en 1,10000, SL y TP a 4 ticks, vela doji
 *       de 5 y 5 (equidistante). A mano: por O→H→L→C la BUY toca su TP y la SELL su SL en 1,10004; por O→L→H→C, al reves.
 *       Los dos caminos tienen un SL y la equity de la cobertura es constante en los dos (+x −x): empate en el minimo y
 *       en el cierre → B, como el motor v1: BUY SL (−4 ticks = −0,4 pip = −4 USD) y SELL TP (+4). Antes (a54aea3) la pantalla
 *       decidia por posicion: SL y SL (−8). CAMBIO VISIBLE, solo en este caso (un doji equidistante con coberturas).
 *   B · el ajuste al tick al entrar (como TradingView; desde el texto, la mitad hacia arriba):
 *       · el tirador de un SL soltado en 1,0999549 (coordinateToPrice da cualquier decimal) guarda 1,09995;
 *       · el de un TP de JPY soltado en 150,0045 guarda 150,005;
 *       · una limit confirmada (la funcion REAL confirmLimitOrder) con entrada 1,0990000000000002 (lo que da hoy
 *         1,10000 − 10·0,0001 en coma flotante), SL 1,0989549 y TP 1,0993051 guarda 1,099 / 1,09895 / 1,09931;
 *       · priceFromPips (el preview) devuelve precios del tick: 1,10000 − 10 pips = 1,099 exacto
 */
import { ver, oraculo, fin, escenario, sesionSim, vela, importa, A, asienta, db } from '../lib.mjs'
import { banco, velasEnStorage } from '../banco-motor.mjs'
const op = m => importa(m).catch(() => null)
const SAL = await op('lib/sim/salto.js'), CI = await op('lib/sim/cierre.js'), SV = await op('lib/sim/servicio.js'), COLA = await op('lib/sim/cola.js'), OR = await op('lib/trading/orders.js')
// contra el codigo auditado (historicas.sh) faltan modulos: rojo, no excepcion
if (!SAL?.creaFrontera || !CI || !SV || !COLA || !OR?.priceFromPips) { for (let i = 0; i < 9; i++) oraculo('SV04', `caso ${i}: sin lib/sim ni lib/trading/orders no se puede`, false, 'no estan'); fin() }

// ── A · cobertura en los tres modos ───────────────────────────────────────────
const date = new Date(Date.UTC(2025, 0, 7)), dia = date.toISOString().slice(0, 10)
const T = +date / 1000 + 12 * 3600 - 60    // 12:00 UTC en enero = 07:00 NY; Go to «nyam» (sv03) = 12:00 UTC + 60
const filas = []
for (const modo of ['paso', 'play', 'salto']) {
  const ses = sesionSim({ pair: 'EUR/USD', date_from: dia, date_to: new Date(+date + 86400000 * 3).toISOString().slice(0, 10), last_timestamp: T, capital: 100000, balance: 100000 }); escenario({ sim_sessions: [ses] }); window.__algSuiteCurrentTime = null
  velasEnStorage('EUR/USD', [vela(T, 1.1, 1.1001, 1.0999, 1.1), vela(T + 60, 1.1, 1.10005, 1.09995, 1.1), vela(T + 120, 1.1, 1.1, 1.1, 1.1)], [2024], { tramoAbierto: true })
  const b = await banco({ sesion: ses, userId: A }); CI.fijaSaldoConfirmado(ses.id, 100000); await SV.leeServicio(); await b.repinta()
  b.abreMercado({ side: 'BUY', entry: 1.1, sl: 1.09996, tp: 1.10004, lots: 1 }); b.abreMercado({ side: 'SELL', entry: 1.1, sl: 1.10004, tp: 1.09996, lots: 1 }); await b.repinta()
  const e = b.motor(), params = { engine: e, sid: ses.id, pairState: b.refs.pairState, esReto: false }
  if (modo === 'paso') await b.paso(1)
  else if (modo === 'salto') { const dest = await b.irA('nyam'); ver('Go to tiene destino en la vela probada', dest?.time === T + 60, JSON.stringify(dest)) }
  else { e._loop = () => {}; e.frontera = SAL.creaFrontera(params); e.speed = 4; e.play(); let k = 0; while (e.isPlaying && e.currentTime < T + 60 && k < 12) { e._tickFrame(k++ * 250); if (e._esperando) await e._esperando; await b.repinta() } e.pause(); ver('el Play llega a la vela', e.currentTime === T + 60) }
  await COLA.esperaCola(ses.id); await asienta(50); await b.repinta()
  const tr = b.ps().trades.map(t => `${t.side} ${t.reason} ${Math.round(t.pnl)}`).sort()
  filas.push({ modo, tr, reloj: e.currentTime - T })
  oraculo('SV04', `A · cobertura, doji equidistante (${modo}): un camino para las dos, el del motor: BUY SL −4 y SELL TP +4`, JSON.stringify(tr) === JSON.stringify(['BUY SL -4', 'SELL TP 4']) && e.currentTime === T + 60, JSON.stringify({ tr, reloj: e.currentTime - T }))
  b.caja.raiz.desmonta(); await asienta()
}
oraculo('SV04', 'A · igualdad de Step, Play y Go to', filas.every(f => JSON.stringify(f.tr) === JSON.stringify(filas[0].tr)), JSON.stringify(filas))

// ── B · el ajuste al tick al entrar ───────────────────────────────────────────
{
  const ses = sesionSim({ pair: 'EUR/USD', date_from: dia, date_to: new Date(+date + 86400000 * 3).toISOString().slice(0, 10), last_timestamp: T, capital: 100000, balance: 100000 }); escenario({ sim_sessions: [ses] }); window.__algSuiteCurrentTime = null
  velasEnStorage('EUR/USD', [vela(T, 1.1, 1.1001, 1.0999, 1.1), vela(T + 60, 1.1, 1.1, 1.1, 1.1)], [2024], { tramoAbierto: true })
  const b = await banco({ sesion: ses, userId: A }); CI.fijaSaldoConfirmado(ses.id, 100000); await SV.leeServicio(); await b.repinta()
  const p = b.abreMercado({ side: 'BUY', entry: 1.1, sl: 1.0999, tp: 1.1002, lots: 1 }); await b.repinta()
  b.caja.valor.trading.handlePositionDragEnd(p.id, 'sl', 1.0999549); await b.repinta()
  const pos = b.ps().positions.find(x => x.id === p.id)
  oraculo('SV04', 'B · tirador del SL soltado en 1,0999549: guarda 1,09995 (el tick de EURUSD, la mitad hacia arriba)', pos?.sl === 1.09995, String(pos?.sl))
  const o = await b.pendiente({ side: 'BUY_LIMIT', entry: 1.10000 - 10 * 0.0001, sl: 1.0989549, tp: 1.0993051, lots: 1 })
  oraculo('SV04', 'B · limit confirmada con entrada 1,0990000000000002, SL 1,0989549 y TP 1,0993051: guarda 1,099 / 1,09895 / 1,09931', o?.entry === 1.099 && o?.sl === 1.09895 && o?.tp === 1.09931, JSON.stringify(o && { entry: o.entry, sl: o.sl, tp: o.tp }))
  b.caja.valor.trading.handlePositionDragEnd(o.id, 'lim_e', 1.0991249); await b.repinta()
  oraculo('SV04', 'B · tirador de la entrada de la limit soltado en 1,0991249: guarda 1,09912', b.ps().orders.find(x => x.id === o.id)?.entry === 1.09912, String(b.ps().orders.find(x => x.id === o.id)?.entry))
  b.caja.raiz.desmonta(); await asienta()
}
{
  const ses = sesionSim({ pair: 'USD/JPY', date_from: dia, date_to: new Date(+date + 86400000 * 3).toISOString().slice(0, 10), last_timestamp: T, capital: 100000, balance: 100000 }); escenario({ sim_sessions: [ses] }); window.__algSuiteCurrentTime = null
  velasEnStorage('USD/JPY', [vela(T, 150, 150.01, 149.99, 150), vela(T + 60, 150, 150, 150, 150)], [2024], { tramoAbierto: true })
  const b = await banco({ sesion: ses, userId: A }); CI.fijaSaldoConfirmado(ses.id, 100000); await SV.leeServicio(); await b.repinta()
  const p = b.abreMercado({ side: 'BUY', entry: 150, sl: 149.9, tp: 150.1, lots: 1 }); await b.repinta()
  b.caja.valor.trading.handlePositionDragEnd(p.id, 'tp', 150.0045); await b.repinta()
  oraculo('SV04', 'B · tirador del TP de USDJPY soltado en 150,0045: guarda 150,005', b.ps().positions.find(x => x.id === p.id)?.tp === 150.005, String(b.ps().positions.find(x => x.id === p.id)?.tp))
  b.caja.raiz.desmonta(); await asienta()
}
const pf = OR.priceFromPips({ isLong: true, entry: 1.1, pips: 10, pair: 'EUR/USD', leg: 'SL' }), pj = OR.priceFromPips({ isLong: false, entry: 150.123, pips: 20, pair: 'USD/JPY', leg: 'TP' })
oraculo('SV04', 'B · priceFromPips devuelve el tick: 1,1 − 10 pips = 1,099 (hoy 1,0990000000000002); 150,123 − 20 pips = 149,923', pf === 1.099 && pj === 149.923, `${pf} · ${pj}`)
fin()
