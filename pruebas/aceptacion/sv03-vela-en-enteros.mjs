/**
 * SV03 · LA REGLA DE LA VELA EN ENTEROS, A LA ESCALA COMUN (SIMVELA2-01, Astra; ordenes 1-108 y 1-117 del CTO, opcion c)
 * Los precios de la vela y de la posicion se escalan desde su texto a la escala comun del que mas decimales tenga y se
 * comparan como enteros; el doji compara las distancias exactas en decimas de pip (mitad hacia arriba). En dea0b26 las
 * distancias se restaban en coma flotante: un doji con los dos extremos a 0,95 pip exactos daba TP en vez de SL. En
 * 0dde61f cada precio se redondeaba a su punto ANTES de restar: con una apertura fuera de la rejilla del par (JPY con 4
 * decimales) la distancia decimal se perdia.
 * EL ORACULO, independiente de lib/sim/vela.js, es el de Astra (astra-bordes-r2): precios construidos como ENTEROS en
 * centesimas de pip («unidades»: 0,000001 sin JPY, 0,0001 con JPY; diez unidades = una decima de pip), distancias del
 * doji floor((d+5)/10), toques exactos. Alcista O→L→H→C, bajista O→H→L→C, doji el extremo mas cercano, empate → SL.
 * REHECHO (orden 1-119 del CTO, punto 2): un precio fuera de la rejilla del par se AJUSTA al tick al entrar (como
 * TradingView, igual que el motor v1): desde su texto, en enteros, al tick mas cercano con la mitad hacia arriba. El
 * oraculo ajusta primero cada precio (unidades → ticks: floor((u+5)/10)) y aplica la regla sobre los ticks (una decima de
 * pip = un tick: nada que redondear). Antes comparaba los precios sin ajustar, a la escala comun.
 *   A · barrido de Astra: 9 pares × 4 aperturas × distancias 94..116 unidades arriba y abajo × BUY/SELL
 *   B · familias integradas de Astra en Step, Play y Go to, con la fila del doble: las simetricas 0,94/0,95/0,96 pip
 *       (las JPY con la apertura FUERA de la rejilla, 151,2345, y tambien EN ella, 151,234) y las JPY de mitades
 *       desiguales; motivo y hora, e igualdad de los tres modos
 */
import { ver, oraculo, fin, escenario, sesionSim, vela, importa, A, asienta, db } from '../lib.mjs'
import { banco, velasEnStorage } from '../banco-motor.mjs'
const V = await importa('lib/sim/vela.js').catch(() => null), SAL = await importa('lib/sim/salto.js').catch(() => null), CI = await importa('lib/sim/cierre.js').catch(() => null), SV = await importa('lib/sim/servicio.js').catch(() => null), COLA = await importa('lib/sim/cola.js').catch(() => null)
if (!V?.cierreEnVela || !SAL?.creaFrontera || !CI || !SV || !COLA) { for (let i = 0; i < 281; i++) oraculo('SV03', `caso ${i}: sin lib/sim/vela.js ni la cola no se puede`, false, 'no estan'); fin() }

// ── el oraculo en enteros ─────────────────────────────────────────────────────
// todo en UNIDADES enteras exactas (una decima de pip = 10 unidades); el doji, con las distancias exactas pasadas a
// decimas de pip redondeando la mitad hacia arriba (el oraculo de Astra: floor((d+5)/10)); los toques, exactos
function esperado({ side, o, h, l, c = o, sl, tp }) {
  const dec = d => Math.floor((d + 5) / 10)
  const rutas = c > o ? [[o, l, h, c]] : c < o ? [[o, h, l, c]] : (dec(o - l) < dec(h - o) ? [[o, l, h, c]] : dec(h - o) < dec(o - l) ? [[o, h, l, c]] : [[o, l, h, c], [o, h, l, c]])
  const toca = r => { for (let k = 0; k < 3; k++) { const a = r[k], b = r[k + 1], lo = Math.min(a, b), hi = Math.max(a, b)
    const s = sl >= lo && sl <= hi, t = tp >= lo && tp <= hi
    if (s && t) return Math.abs(sl - a) <= Math.abs(tp - a) ? 'SL' : 'TP'
    if (s) return 'SL'; if (t) return 'TP' } return null }
  const rs = rutas.map(toca)
  return rs.includes('SL') ? 'SL' : rs.every(x => x === 'TP') ? 'TP' : null
}
const PARES = ['EUR/USD', 'GBP/USD', 'AUD/USD', 'NZD/USD', 'USD/CAD', 'USD/CHF', 'AUD/CAD', 'USD/JPY', 'GBP/JPY']
const factor = par => par.includes('JPY') ? 10000 : 1000000

// el ajuste al tick, en unidades (10 unidades = un tick), la mitad hacia arriba
const ajU = u => Math.floor((u + 5) / 10) * 10
const esperadoAjustado = ({ side, o, h, l, c = o, sl, tp }) => esperado({ side, o: ajU(o), h: ajU(h), l: ajU(l), c: ajU(c), sl: ajU(sl), tp: ajU(tp) })

// ── A · barrido ───────────────────────────────────────────────────────────────
for (const par of PARES) {
  const j = par.includes('JPY'), f = factor(par), orig = j ? [1500000, 1512345, 1400000, 999995] : [1100000, 1234567, 999995, 700000]
  let total = 0, malos = []
  for (const oi of orig) for (let up = 94; up <= 116; up++) for (let down = 94; down <= 116; down++) for (const side of ['BUY', 'SELL']) {
    const sl = oi + (side === 'BUY' ? -50 : 50), tp = oi + (side === 'BUY' ? 50 : -50)
    const v = { open: oi / f, close: oi / f, high: (oi + up) / f, low: (oi - down) / f }
    const r = V.cierreEnVela({ pair: par, entry: oi / f, side, sl: sl / f, tp: tp / f }, v)
    const e = esperadoAjustado({ side, o: oi, h: oi + up, l: oi - down, sl, tp })
    total++; if (r !== e && malos.length < 1e6) malos.push({ oi, up, down, side, e, r })
  }
  oraculo('SV03', `A · ${par}: ${total} dojis de 0,94 a 1,16 pip, ajustados al tick (orden 1-119)`, malos.length === 0, JSON.stringify({ total, malos: malos.length, ejemplos: malos.slice(0, 3) }))
}

// ── B · familias integradas, tres modos ───────────────────────────────────────
const casos = []
for (const par of ['EUR/USD', 'GBP/USD', 'USD/JPY', 'USD/CHF', 'AUD/USD', 'USD/CAD', 'NZD/USD', 'AUD/CAD', 'GBP/JPY']) for (const side of ['BUY', 'SELL']) for (const d of [94, 95, 96]) {
  const j = par.includes('JPY'), o = j ? 1512345 : 1100000
  casos.push({ id: `${par}-${side}-simetrico-${d}${j ? '-apertura-fuera-de-rejilla' : ''}`, par, side, u: { o, h: o + d, l: o - d, sl: o + (side === 'BUY' ? -50 : 50), tp: o + (side === 'BUY' ? 50 : -50) } })
  if (j) { const o2 = 1512340; casos.push({ id: `${par}-${side}-simetrico-${d}-en-rejilla`, par, side, u: { o: o2, h: o2 + d, l: o2 - d, sl: o2 + (side === 'BUY' ? -50 : 50), tp: o2 + (side === 'BUY' ? 50 : -50) } }) }
}
for (const par of ['USD/JPY', 'GBP/JPY']) casos.push({ id: par + '-mitades-desiguales-fuera-de-rejilla', par, side: 'BUY', u: { o: 1512345, h: 1512450, l: 1512230, sl: 1512295, tp: 1512395 } })
let ix = 0
for (const c of casos) {
  const f = factor(c.par), u = c.u, motivo = esperadoAjustado({ side: c.side, ...u })
  const vv = [u.o / f, u.h / f, u.l / f, u.o / f], entry = u.o / f, sl = u.sl / f, tp = u.tp / f
  let date = new Date(Date.UTC(2025, 0, 7 + ix++)); while (date.getUTCDay() !== 2) date = new Date(+date + 86400000)
  const dia = date.toISOString().slice(0, 10), ny12 = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', hourCycle: 'h23' }).format(new Date(+date + 12 * 3600000))), T = +date / 1000 + (ny12 === 8 ? 11 : 12) * 3600 - 60
  const resultados = []
  for (const modo of ['paso', 'play', 'salto']) {
    const ses = sesionSim({ pair: c.par, date_from: dia, date_to: new Date(+date + 86400000 * 3).toISOString().slice(0, 10), last_timestamp: T, capital: 100000, balance: 100000 }); escenario({ sim_sessions: [ses] }); window.__algSuiteCurrentTime = null
    velasEnStorage(c.par, [vela(T, entry, entry + .0001, entry - .0001, entry), vela(T + 60, ...vv), vela(T + 120, vv[3], vv[3], vv[3], vv[3])], [2024], { tramoAbierto: true })
    const b = await banco({ sesion: ses, userId: A }); CI.fijaSaldoConfirmado(ses.id, 100000); await SV.leeServicio(); await b.repinta()
    ver(c.id + ': el motor usa su vela', !!b.motor()?.candles.some(x => x.time === T + 60 && x.high === vv[1]))
    b.abreMercado({ side: c.side, entry, sl, tp, lots: 1 }); await b.repinta()
    const e = b.motor(), params = { engine: e, sid: ses.id, pairState: b.refs.pairState, esReto: false }
    if (modo === 'paso') await b.paso(1)
    else if (modo === 'salto') { const dest = await b.irA('nyam'); ver(c.id + ': Go to tiene destino en la vela probada', dest?.time === T + 60, JSON.stringify(dest)) }
    else { e._loop = () => {}; e.frontera = SAL.creaFrontera(params); e.speed = 4; e.play(); let k = 0; while (e.isPlaying && e.currentTime < T + 60 && k < 12) { e._tickFrame(k++ * 250); if (e._esperando) await e._esperando; await b.repinta() } e.pause(); ver(c.id + ': el Play llega a la vela', e.currentTime === T + 60) }
    await COLA.esperaCola(ses.id); await asienta(50); await b.repinta()
    const rr = { modo, reloj: e.currentTime - T, saldo: b.estado.saldo, trades: b.ps().trades.map(t => ({ motivo: t.reason, pnl: Math.round(t.pnl * 100) / 100, hora: t.closeTime - T })), filas: db.tablas.sim_trades.map(x => ({ pnl: +x.pnl })) }
    resultados.push(rr)
    oraculo('SV03', `B · ${c.id} ${modo}: ${motivo} en la vela (oraculo de Astra, a mano)`, rr.reloj === 60 && rr.trades.length === 1 && rr.trades[0].motivo === motivo && rr.trades[0].hora === 60 && rr.filas.length === 1, JSON.stringify(rr))
    b.caja.raiz.desmonta(); await asienta()
  }
  const sig = r => JSON.stringify({ ...r, modo: null })
  oraculo('SV03', `B · ${c.id}: igualdad de Step, Play y Go to`, resultados.every(r => sig(r) === sig(resultados[0])))
}
fin()
