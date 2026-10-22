/**
 * SG05 · SALTAR = AVANZAR VELA A VELA: PRUEBA DE PROPIEDAD CON VELAS REALES (orden 1-083 del CTO)
 *
 * El contrato de todo el Go to: con los mismos datos, saltar da EXACTAMENTE lo mismo que avanzar vela
 * a vela: saldo, trades con su hora, filas guardadas (closed_at, el dia al que cuenta), posiciones,
 * pendientes y hora del motor. Muchos tramos al azar (semilla fija; SEMILLA=n para otra) sobre una
 * semana REAL de EUR/USD (pruebas/fixtures/velas/, Dukascopy M1, sin red). Cualquier diferencia, rojo.
 *
 * Tres familias, las de SIMGOTO1 (Astra, 22-oct):
 *   goto   Go to a asia/london/nyam desde una hora al azar, con una posicion a mercado y una pendiente
 *          al azar; en practica o en un reto 2F con usuario (cierres por la funcion atomica, doble).
 *   final  el historico ACABA en la vela de destino y solo esa vela toca el TP (SIMGOTO-02: antes, sin su
 *          onTick, tambien con Step): ademas de la igualdad, el TP tiene que ejecutarse.
 *   finde  Go to desde el viernes por la tarde cruzando el fin de semana (dos semanas: la real y la
 *          misma +7 dias): el hueco del lunes.
 *   par    se cambia a GBP/USD, se avanzan k = 1..6 velas y se vuelve (la puesta al dia, SIMGOTO-03:
 *          antes, con k = 1 no se recorria y el reloj maestro retrocedia) contra quedarse y avanzar k.
 * El control (avance) es Step: nextCandle(1) y repintar, parando en el breach como la pagina.
 */
import { readFileSync } from 'node:fs'
import { titulo, ver, oraculo, fin, escenario, sesionSim, vela, importa, A, db } from '../lib.mjs'
import { banco, velasEnStorage } from '../banco-motor.mjs'
import { nextSessionOpen } from '../../lib/killzonesDomain.js'

const fx = JSON.parse(readFileSync(new URL('../fixtures/velas/eurusd-2026-03-02-semana.json', import.meta.url), 'utf8'))
const REALES = fx.velas.map(([t, o, h, l, c]) => vela(t, o, h, l, c))
ver('control: la semana real esta entera (7.068 velas M1, 2-mar a 6-mar-2026)', REALES.length === 7068, String(REALES.length))
// finde: dos semanas seguidas (la misma semana real repetida +7 dias) para cruzar el hueco del fin de
// semana; lo encontro el revisor adversario de r2 (breach fantasma con el gap del lunes)
const DOS = [...REALES, ...REALES.map(v => vela(v.time + 7 * 86400, v.open, v.high, v.low, v.close))]
const velasDe = c => c.familia === 'finde' ? DOS : REALES
const CI = await importa('lib/sim/cierre.js').catch(() => null), SV = await importa('lib/sim/servicio.js').catch(() => null)

// semilla fija: los mismos tramos en cada tanda (mulberry32)
const SEMILLA = Number(process.env.SEMILLA ?? 20261022)
function azar(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 } }
let r = azar(SEMILLA)
const entre = (a, b) => a + Math.floor(r() * (b - a + 1))
const elige = xs => xs[Math.floor(r() * xs.length)]
const PIP = 0.0001, red = x => +x.toFixed(5)

let vueltasPar = 0
function tramo(familia) {
  const reto = r() < 0.5
  const desde = familia === 'finde' ? entre(7068 - 400, 7068 - 2) : entre(60, 5600)   // finde: vie por la tarde; si no, lun 01:00 → jue
  const p = (familia === 'finde' ? DOS : REALES)[desde].close
  const lados = r() < 0.5 ? 1 : -1
  const mercado = { side: lados > 0 ? 'BUY' : 'SELL', entry: p, lots: entre(1, 10), slPips: entre(5, 40), tpPips: entre(5, 40) }
  mercado.sl = red(p - lados * mercado.slPips * PIP); mercado.tp = red(p + lados * mercado.tpPips * PIP)
  const lp = r() < 0.5 ? 1 : -1, dist = entre(2, 15)
  const lim = { side: lp > 0 ? 'BUY_LIMIT' : 'SELL_LIMIT', entry: red(p - lp * dist * PIP), lots: entre(1, 10), slPips: entre(5, 30), tpPips: entre(5, 40) }
  lim.sl = red(lim.entry - lp * lim.slPips * PIP); lim.tp = red(lim.entry + lp * lim.tpPips * PIP)
  const c = { familia, reto, desde, mercado, lim, sesion: elige(['asia', 'london', 'nyam']), k: entre(1, 6) }
  if (familia === 'par') {
    c.k = 1 + (vueltasPar++ % 6)   // k = 1..6 en orden: el 1 es SIMGOTO-03
    // en k minutos tiene que pasar algo: la pendiente a 0–2 pips y protecciones de 1–4 pips
    const d2 = entre(0, 2); lim.entry = red(p - lp * d2 * PIP); lim.slPips = entre(1, 4); lim.tpPips = entre(1, 4)
    lim.sl = red(lim.entry - lp * lim.slPips * PIP); lim.tp = red(lim.entry + lp * lim.tpPips * PIP)
    mercado.slPips = entre(1, 4); mercado.tpPips = entre(1, 4)
    mercado.sl = red(p - lados * mercado.slPips * PIP); mercado.tp = red(p + lados * mercado.tpPips * PIP)
  }
  if (familia === 'final') {
    // el TP de la posicion a mercado lo toca SOLO la vela de destino, la ultima del historico
    // (SIMGOTO-02): se parte de 1–5 velas antes y se busca un destino en que la ultima vela supere
    // a las anteriores del tramo
    for (let intento = 0; intento < 400; intento++) {
      const ini = entre(60, 6900), dest = nextSessionOpen(REALES, ini, c.sesion)
      if (!dest) continue
      const j = REALES.findIndex(v => v.time === dest.time), d0 = j - entre(1, 5)
      if (d0 < 1) continue
      const prev = REALES.slice(d0 + 1, j), ult = REALES[j], p0 = REALES[d0].close
      const maxH = Math.max(p0, ...prev.map(v => v.high)), minL = Math.min(p0, ...prev.map(v => v.low))
      const compra = ult.high - maxH > 0.3 * PIP, vende = minL - ult.low > 0.3 * PIP
      if (!compra && !vende) continue
      c.desde = d0
      c.mercado = compra
        ? { side: 'BUY', entry: p0, lots: entre(1, 10), slPips: 40, sl: red(p0 - 40 * PIP), tp: red((maxH + ult.high) / 2) }
        : { side: 'SELL', entry: p0, lots: entre(1, 10), slPips: 40, sl: red(p0 + 40 * PIP), tp: red((minL + ult.low) / 2) }
      c.mercado.tpPips = +(Math.abs(c.mercado.tp - p0) / PIP).toFixed(1)
      // la pendiente, lejos: aqui solo cuenta la ultima vela
      lim.entry = red(p0 - lp * 80 * PIP); lim.sl = red(lim.entry - lp * lim.slPips * PIP); lim.tp = red(lim.entry + lp * lim.tpPips * PIP)
      c.tpEnUltima = true
      return c
    }
    return null
  }
  return c
}

async function corre(c, modo) {
  const t0 = velasDe(c)[c.desde].time
  let velas = velasDe(c)
  if (c.familia === 'final') {
    const destino = nextSessionOpen(REALES, c.desde, c.sesion)
    if (!destino) return null
    velas = REALES.filter(v => v.time <= destino.time)
  }
  const ses = sesionSim({ pair: 'EUR/USD', date_from: '2026-03-02', date_to: c.familia === 'finde' ? '2026-03-13' : '2026-03-06', last_timestamp: t0,
    ...(c.reto ? { capital: 100000, balance: 100000, challenge_type: '2F', challenge_phase: 1 } : {}) })
  escenario({ sim_sessions: [ses] })
  if (globalThis.window) globalThis.window.__algSuiteCurrentTime = null   // el reloj maestro del tramo anterior
  velasEnStorage('EUR/USD', velas, [2025])   // el año anterior, vacio: el codigo auditado lo pide
  velasEnStorage('GBP/USD', velas.map(v => vela(v.time, 1.25, 1.2501, 1.2499, 1.25)), [2025])
  const b = await banco({ sesion: ses, userId: c.reto ? A : null })
  if (c.reto) { CI.fijaSaldoConfirmado(ses.id, 100000); await SV.leeServicio(); await b.repinta() }
  if (b.motor()?.currentTime !== t0) return { roto: `el motor no arranca en la vela de partida (${b.motor()?.currentTime} ≠ ${t0})` }
  b.abreMercado(c.mercado)
  await b.pendiente(c.lim)
  const quemado = () => b.ps('EUR/USD').trades.some(t => /BREACH/.test(t.reason))
  let hasta
  if (c.familia === 'par') {
    hasta = REALES[c.desde + c.k].time
    if (modo === 'salto') { await b.cambiaPar('GBP/USD'); await b.paso(c.k); await b.cambiaPar('EUR/USD') }
    else for (let i = 0; i < c.k && !quemado(); i++) await b.paso(1)
  } else {
    const destino = nextSessionOpen(b.motor().candles, b.motor().currentIndex, c.sesion)
    if (!destino) return null
    hasta = destino.time
    if (modo === 'salto') await b.irA(c.sesion)
    else while (b.motor().currentTime < hasta && !quemado()) { const antes = b.motor().currentTime; await b.paso(1); if (b.motor().currentTime === antes) break }
  }
  await new Promise(s => setTimeout(s, 60)); await b.repinta()
  const ps = b.ps('EUR/USD')
  const res = {
    motor: b.motor('EUR/USD').currentTime - t0,
    saldo: +b.estado.saldo.toFixed(2),
    trades: ps.trades.map(t => [t.reason, +t.pnl.toFixed(2), t.closeTime - t0]),
    filas: db.tablas.sim_trades.map(f => [+Number(f.pnl).toFixed(2), f.closed_at]),
    abiertas: ps.positions.map(p => [p.side, p.entry, p.openTime - t0]),
    pendientes: ps.orders.length,
  }
  b.caja.raiz.desmonta?.()
  return { res, hasta: hasta - t0 }
}

const N = { goto: 14, final: 6, par: 12, finde: 16 }
let corridos = 0, distintos = 0, sinTramo = 0, conCierres = 0
for (const [familia, n] of Object.entries(N)) {
  // finde, con su propio generador desde la semilla: los mismos tramos que el revisor (el 1 de 16 en rojo)
  if (familia === 'finde') r = azar(SEMILLA)
  titulo(`${familia}: ${n} tramos al azar (semilla ${SEMILLA})`)
  for (let i = 0; i < n; i++) {
    const c = tramo(familia)
    // un tramo que no se puede correr cuenta en ROJO, con los oraculos que habria tenido (el minimo
    // de minimos.json no baja en silencio): en HEAD no pasa (control de abajo: sinTramo = 0)
    const rojos = (motivo, det) => { for (let k = familia === 'final' ? 2 : 1; k > 0; k--) oraculo('SG05', `${familia} ${i}: ${motivo}`, false, det) }
    if (!c) { sinTramo++; rojos('no se encuentra un destino con TP solo en la ultima vela', '-'); continue }
    if (c.reto && (!CI || !SV)) { rojos('sin lib/sim/cierre.js ni servicio.js no hay reto con usuario', 'no estan'); continue }
    const salto = await corre(c, 'salto'), paso = await corre(c, 'paso')
    if (!salto || !paso) { sinTramo++; rojos('sin destino para el Go to', JSON.stringify(c)); continue }
    if (salto.roto || paso.roto) { ver(`${familia} ${i}: el banco arranca`, false, salto.roto || paso.roto); continue }
    corridos++
    if (paso.res.trades.length) conCierres++
    // la igualdad sola no basta: en 415a1f7 el Step tambien se saltaba la ultima vela (los dos mal)
    if (c.tpEnUltima) oraculo('SG05', `${familia} ${i}: el TP que toca solo la ultima vela del historico se ejecuta, saltando y avanzando`,
      [salto, paso].every(x => x.res.trades.some(t => t[0] === 'TP' && t[2] === x.hasta)), `salto ${JSON.stringify(salto)} · avance ${JSON.stringify(paso)}`)
    const igual = JSON.stringify(salto.res) === JSON.stringify(paso.res)
    if (!igual) distintos++
    oraculo('SG05', `${familia} ${i} (${c.reto ? 'reto' : 'practica'}, ${familia === 'par' ? `k=${c.k}` : c.sesion}, desde ${new Date(velasDe(c)[c.desde].time * 1000).toISOString().slice(5, 16)}): salto = avance`,
      igual, `caso ${JSON.stringify(c)} · salto ${JSON.stringify(salto.res)} · avance ${JSON.stringify(paso.res)}`)
  }
}
// sin cierres no hay nada que comparar: la familia tiene que mover dinero de verdad (se mide con el
// codigo de la etapa 1; en el auditado, sin la cola, los retos ya salen en rojo y no cuentan)
if (CI && SV) ver(`control: la mayoria de los tramos tienen cierres (${conCierres} de ${corridos}) y ninguno se descarta (${sinTramo})`, corridos >= 48 && sinTramo === 0 && conCierres >= corridos / 2, JSON.stringify({ corridos, conCierres, sinTramo, distintos }))
fin()
