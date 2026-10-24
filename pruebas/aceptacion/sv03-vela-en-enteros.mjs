/**
 * SV03 · LA REGLA DE LA VELA EN ENTEROS (SIMVELA2-01, Astra; orden 1-108 del CTO)
 * Cada precio se convierte UNA vez a puntos enteros del par (×10^5 sin JPY, ×10^3 con JPY: decimas de pip) y todo se
 * compara en enteros. En dea0b26 las distancias se restaban en coma flotante y se redondeaban despues: un doji con los
 * dos extremos a 0,95 pip exactos de la apertura (decimal) daba TP en vez de SL.
 * EL ORACULO, independiente de lib/sim/vela.js: los precios de la prueba se construyen como ENTEROS en centesimas de pip
 * (las «unidades» de Astra: 0,000001 sin JPY, 0,0001 con JPY; diez unidades = un punto) y el punto de cada precio se
 * calcula con aritmetica entera: unidades/10 redondeado a la mitad PAR (el redondeo unico que fija lib/sim/vela.js para
 * un precio con mas decimales que el par). Con los puntos: alcista O→L→H→C, bajista O→H→L→C, doji el extremo mas
 * cercano, empate → SL.
 *   A · barrido de Astra (astra-bordes-r2): 9 pares × 4 aperturas × distancias 94..116 unidades arriba y abajo × BUY/SELL
 *   B · familias integradas de Astra (astra-integrado-r2) en Step, Play y Go to, con la fila del doble, mas las mismas
 *       familias JPY con la apertura EN la rejilla del par (151,234): motivo y hora, e igualdad de los tres modos
 * ⚠️ Un precio con MAS decimales que el par (las familias JPY de Astra con apertura 151,2345) ya no conserva la
 *    distancia decimal: la apertura se redondea a su punto (151,234) y los extremos tambien. Ahi el esperado es el de la
 *    orden 1-108 (precios en puntos), no el de las distancias decimales de SIMVELA2: lo calcula el oraculo y va anotado.
 */
import { ver, oraculo, fin, escenario, sesionSim, vela, importa, A, asienta, db } from '../lib.mjs'
import { banco, velasEnStorage } from '../banco-motor.mjs'
const V = await importa('lib/sim/vela.js').catch(() => null), SAL = await importa('lib/sim/salto.js').catch(() => null), CI = await importa('lib/sim/cierre.js').catch(() => null), SV = await importa('lib/sim/servicio.js').catch(() => null), COLA = await importa('lib/sim/cola.js').catch(() => null)
if (!V?.cierreEnVela || !SAL?.creaFrontera || !CI || !SV || !COLA) { for (let i = 0; i < 281; i++) oraculo('SV03', `caso ${i}: sin lib/sim/vela.js ni la cola no se puede`, false, 'no estan'); fin() }

// ── el oraculo en enteros ─────────────────────────────────────────────────────
const punto = u => { const q = Math.floor(u / 10), r = u - q * 10; return r > 5 || (r === 5 && q % 2 === 1) ? q + 1 : q }   // unidades → puntos, mitad par
function esperado({ side, o, h, l, c = o, sl, tp }) {   // todo en UNIDADES enteras
  const [O, H, L, C, S, T] = [o, h, l, c, sl, tp].map(punto)
  const rutas = C > O ? [[O, L, H, C]] : C < O ? [[O, H, L, C]] : (O - L < H - O ? [[O, L, H, C]] : H - O < O - L ? [[O, H, L, C]] : [[O, L, H, C], [O, H, L, C]])
  const toca = r => { for (let k = 0; k < 3; k++) { const a = r[k], b = r[k + 1], lo = Math.min(a, b), hi = Math.max(a, b)
    const s = S >= lo && S <= hi, t = T >= lo && T <= hi
    if (s && t) return Math.abs(S - a) <= Math.abs(T - a) ? 'SL' : 'TP'
    if (s) return 'SL'; if (t) return 'TP' } return null }
  const rs = rutas.map(toca)
  return rs.includes('SL') ? 'SL' : rs.every(x => x === 'TP') ? 'TP' : null
}
const PARES = ['EUR/USD', 'GBP/USD', 'AUD/USD', 'NZD/USD', 'USD/CAD', 'USD/CHF', 'AUD/CAD', 'USD/JPY', 'GBP/JPY']
const factor = par => par.includes('JPY') ? 10000 : 1000000

// ── A · barrido ───────────────────────────────────────────────────────────────
for (const par of PARES) {
  const j = par.includes('JPY'), f = factor(par), orig = j ? [1500000, 1512345, 1400000, 999995] : [1100000, 1234567, 999995, 700000]
  let total = 0, malos = []
  for (const oi of orig) for (let up = 94; up <= 116; up++) for (let down = 94; down <= 116; down++) for (const side of ['BUY', 'SELL']) {
    const sl = oi + (side === 'BUY' ? -50 : 50), tp = oi + (side === 'BUY' ? 50 : -50)
    const v = { open: oi / f, close: oi / f, high: (oi + up) / f, low: (oi - down) / f }
    const r = V.cierreEnVela({ pair: par, entry: oi / f, side, sl: sl / f, tp: tp / f }, v)
    const e = esperado({ side, o: oi, h: oi + up, l: oi - down, sl, tp })
    total++; if (r !== e && malos.length < 1e6) malos.push({ oi, up, down, side, e, r })
  }
  oraculo('SV03', `A · ${par}: ${total} dojis de 0,94 a 1,16 pip, en puntos enteros`, malos.length === 0, JSON.stringify({ total, malos: malos.length, ejemplos: malos.slice(0, 3) }))
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
  const f = factor(c.par), u = c.u, motivo = esperado({ side: c.side, ...u })
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
    oraculo('SV03', `B · ${c.id} ${modo}: ${motivo} en la vela (a mano, en puntos)`, rr.reloj === 60 && rr.trades.length === 1 && rr.trades[0].motivo === motivo && rr.trades[0].hora === 60 && rr.filas.length === 1, JSON.stringify(rr))
    b.caja.raiz.desmonta(); await asienta()
  }
  const sig = r => JSON.stringify({ ...r, modo: null })
  oraculo('SV03', `B · ${c.id}: igualdad de Step, Play y Go to`, resultados.every(r => sig(r) === sig(resultados[0])))
}
fin()
