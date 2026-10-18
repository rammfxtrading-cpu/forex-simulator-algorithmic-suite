/**
 * PROPIEDAD DE LOS TRAMOS (CTO 14-oct, noche: la parada «propiedad de tramos»; diseño q.12, q.15).
 * Un avance cortado en tramos da EXACTAMENTE lo mismo que de un tirón: el estado final y los
 * eventos, byte a byte (serializa).
 *
 * 200 escenarios aleatorios con semilla fija (SEMILLA, impresa en la salida: reproducible):
 *   · tipos: FTMO 2F (fases 1 y 2), 1F, 3F (fases 1–3) y practica (cartera sin reto, con un limite);
 *   · de 1 a 4 pares, con sus pares de conversion y base→USD (cruces incluidos);
 *   · posiciones a mercado con SL/TP y pendientes, con lotes grandes: hay breaches y cierres de
 *     verdad;
 *   · 150 minutos de paseo aleatorio que cruzan la medianoche del reto (23:00 UTC en marzo).
 * Cortes: puntos al azar (a veces a mitad de minuto) y SIEMPRE la medianoche, el minuto exacto de
 * cada breach y de cada cierre por SL/TP del avance de un tirón. Entre tramo y tramo el estado se
 * serializa y se deserializa, como entre dos comandos que pasan por la base.
 * Controles: cuantos escenarios tuvieron breach, cierre por SL/TP y la medianoche cortada con su
 * reset; si alguno es 0, control roto (la prueba no habria mirado lo que dice).
 * Y los mutantes (rojo antes de darla por buena): un tramo que pierde el minuto siguiente al corte,
 * uno que lo duplica y uno que reinicia el ultimo reset en el corte. Los tres tienen que dar
 * diferencias.
 */
import { titulo, oraculo, ver, fin, importa } from '../lib.mjs'
const M = await importa('lib/motor/motor.mjs')
const CA = await importa('lib/motor/cartera.mjs')
const RT = await importa('lib/motor/reto.mjs')
const { COSTES_1 } = await importa('lib/motor/costes.mjs')
const SEMILLA = 20261014
const N = 200
const tx = x => CA.serializa(x)
let s = SEMILLA
const azar = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648 }
const elige = xs => xs[Math.floor(azar() * xs.length)]
const PARES = ['AUDCAD', 'AUDUSD', 'EURUSD', 'GBPJPY', 'GBPUSD', 'NZDUSD', 'USDCAD', 'USDCHF', 'USDJPY']
const BASE = { AUDCAD: 0.9, AUDUSD: 0.65, EURUSD: 1.1, GBPJPY: 190.5, GBPUSD: 1.3, NZDUSD: 0.6, USDCAD: 1.37, USDCHF: 0.88, USDJPY: 150.2 }
const DIG = p => (/JPY/.test(p) ? 3 : 5)
const T0 = Date.parse('2026-03-03T22:00:00Z') / 1000, MINUTOS = 150, FIN = T0 + 60 * MINUTOS
const MEDIANOCHE = RT.medianocheSiguiente(T0)          // 23:00 UTC (CET)
const TIPOS = [['FTMO', 1], ['FTMO', 2], ['1F', 1], ['3F', 1], ['3F', 2], ['3F', 3], ['practica', 0]]
const REGLAS = { FTMO: RT.FTMO_2STEP, '1F': RT.SUITE_1F, '3F': RT.SUITE_3F }

function escenario() {
  let pares = new Set(Array.from({ length: 1 + Math.floor(azar() * 4) }, () => elige(PARES)))
  for (const p of [...pares]) { if (p === 'AUDCAD') { pares.add('USDCAD'); pares.add('AUDUSD') } if (p === 'GBPJPY') { pares.add('USDJPY'); pares.add('GBPUSD') } }
  pares = [...pares].sort()
  const velas = {}
  for (const p of pares) {
    const t = 10 ** -DIG(p), r = x => Number(x.toFixed(DIG(p))); let x = BASE[p]; const vs = []
    for (let i = 0; i <= MINUTOS; i++) {
      if (i > 0 && azar() < 0.03) continue
      const a = azar() < 0.05 ? r(x + (azar() - 0.5) * 60 * t) : x
      const c = r(a + (azar() - 0.5) * 50 * t), h = r(Math.max(a, c) + azar() * 20 * t), l = r(Math.min(a, c) - azar() * 20 * t)
      vs.push({ time: T0 + 60 * i, open: r(a), high: h, low: l, close: c }); x = c
    }
    velas[p] = M.velas(p, vs)
  }
  const [tipo, fase] = elige(TIPOS)
  const ordenes = []
  for (let k = 0; k < 2 + Math.floor(azar() * 4); k++) {
    const par = elige(pares), lado = elige(['BUY', 'SELL']), t = 10 ** -DIG(par), sg = lado === 'BUY' ? 1 : -1
    const px = d => (BASE[par] + d * t).toFixed(DIG(par))
    if (azar() < 0.7) ordenes.push({ tipo: 'abrir', par, lado, orden: 'mercado', lotes: elige(['1', '5', '20', '40']), ...(azar() < 0.7 ? { sl: px(-sg * (20 + Math.floor(azar() * 150))) } : {}), ...(azar() < 0.7 ? { tp: px(sg * (20 + Math.floor(azar() * 150))) } : {}) })
    else ordenes.push({ tipo: 'abrir', par, lado, orden: elige(['limit', 'stop']), lotes: elige(['1', '10']), precio: px((elige(['limit', 'stop']) === 'limit' ? -sg : sg) * (5 + Math.floor(azar() * 60))) })
  }
  const cortes = Array.from({ length: 2 + Math.floor(azar() * 6) }, () => T0 + 60 * (1 + Math.floor(azar() * (MINUTOS - 1))) + (azar() < 0.3 ? 30 : 0))
  return { pares, velas, tipo, fase, ordenes, cortes }
}

// el estado de partida: el reto (o la practica) en T0 con sus ordenes
function partida(esc) {
  const cartera = CA.crea({ pares: esc.pares, costes: COSTES_1, capital: '100000', limites: esc.tipo === 'practica' ? [{ regla: 'p', limite: '97000' }] : [] })
  if (esc.tipo === 'practica') {
    let e = CA.aplica(cartera, { tipo: 'avanzar', hasta: T0 }, esc.velas).estado
    for (const o of esc.ordenes) { const x = CA.aplica(e, { ...o, ...(o.orden === 'mercado' ? { cotizadoEn: e.reloj.cursor } : {}) }, {}); e = x.estado }
    return { practica: true, e }
  }
  let r = RT.creaReto({ motor: cartera, fase: esc.fase, inicio: T0, reglas: REGLAS[esc.tipo] })
  r = RT.avanzaReto(r, T0, esc.velas).reto
  for (const o of esc.ordenes) { const x = RT.aplicaReto(r, { ...o, ...(o.orden === 'mercado' ? { cotizadoEn: r.motor.reloj.cursor } : {}) }); r = x.reto }
  return { practica: false, e: r }
}
// un avance hasta h; mutante: null | 'pierde' | 'duplica' | 'reinicia'
function avanza(p, e, h, velas, mutante = null, desde = null) {
  let vs = velas
  if (mutante === 'pierde' && desde != null) vs = Object.fromEntries(Object.entries(velas).map(([k, v]) => [k, v.filter(x => x.time !== Math.floor(desde / 60) * 60 + 60)]))
  if (p) { const x = CA.aplica(e, { tipo: 'avanzar', hasta: h }, vs); return { e: x.estado, ev: x.eventos } }
  const x = RT.avanzaReto(e, h, vs)
  return { e: x.reto, ev: x.eventos }
}
function deUnTiron(esc) { const p = partida(esc); const r = avanza(p.practica, p.e, FIN, esc.velas); return { e: r.e, ev: r.ev } }
function enTramos(esc, cortes, mutante = null) {
  const p = partida(esc)
  let e = p.e, ev = [], antes = null
  for (const h of [...cortes, FIN]) {
    let x = avanza(p.practica, e, h, esc.velas, mutante, antes)
    if (mutante === 'duplica' && antes != null && !p.practica) {
      // repite el ultimo minuto del tramo anterior: vuelve a avanzar desde un horizonte 60 s atras
      const atras = { ...e, horizonte: e.horizonte - 60, motor: { ...e.motor, reloj: { ...e.motor.reloj, cursor: e.motor.reloj.cursor == null ? null : e.motor.reloj.cursor - 60 } } }
      x = avanza(false, atras, h, esc.velas)
    }
    ev.push(...x.ev)
    e = CA.deserializa(CA.serializa(x.e))                  // entre tramos, por la base
    if (mutante === 'reinicia' && !p.practica) e = { ...e, ultimo_reset: RT.medianocheAnterior(T0) }
    antes = h
  }
  return { e, ev }
}
const momento = en => en?.vela ?? en?.t

titulo(`la propiedad: ${N} escenarios, semilla ${SEMILLA}`)
const escenarios = Array.from({ length: N }, escenario)
let iguales = 0, conBreach = 0, conSLTP = 0, conMedianoche = 0
const distintos = []
const cortesDe = []
for (const [k, esc] of escenarios.entries()) {
  const uno = deUnTiron(esc)
  const breach = uno.ev.filter(x => x.tipo === 'breach').map(x => momento(x.en))
  const sltp = uno.ev.filter(x => x.tipo === 'cierre' && (x.motivo === 'SL' || x.motivo === 'TP')).map(x => momento(x.en))
  const reset = uno.ev.some(x => x.tipo === 'reset_diario' && momento(x.en) === MEDIANOCHE)
  const cortes = [...new Set([...esc.cortes, MEDIANOCHE, ...breach, ...sltp].filter(t => Number.isFinite(t) && t > T0 && t < FIN))].sort((a, b) => a - b)
  cortesDe[k] = cortes
  const tr = enTramos(esc, cortes)
  if (breach.length) conBreach++
  if (sltp.length) conSLTP++
  if (reset) conMedianoche++
  if (tx(uno.e) === tx(tr.e) && tx(uno.ev) === tx(tr.ev)) iguales++
  else distintos.push(`#${k} ${esc.tipo}${esc.fase || ''} ${esc.pares.join('+')}`)
}
console.log(`  escenarios ${N} · con breach ${conBreach} · con cierre SL/TP ${conSLTP} · con la medianoche cortada (y su reset) ${conMedianoche}`)
ver(`control: hay escenarios con breach (${conBreach})`, conBreach > 0)
ver(`control: hay escenarios con cierre por SL/TP (${conSLTP})`, conSLTP > 0)
ver(`control: hay escenarios con la medianoche cortada y su reset (${conMedianoche})`, conMedianoche > 0)
oraculo('TRPR', `de un tiron = en tramos, estado final y eventos byte a byte, en los ${N}`, iguales === N, distintos.slice(0, 8).join(' · '))

titulo('los mutantes: la prueba los caza')
for (const [mut, que] of [['pierde', 'un tramo que pierde el minuto siguiente al corte'], ['duplica', 'un tramo que repite el ultimo minuto del anterior'], ['reinicia', 'un corte que reinicia el ultimo reset']]) {
  let caza = 0
  for (const [k, esc] of escenarios.entries()) {
    const uno = deUnTiron(esc)
    let tr
    try { tr = enTramos(esc, cortesDe[k], mut) } catch { caza++; continue }
    if (tx(uno.e) !== tx(tr.e) || tx(uno.ev) !== tx(tr.ev)) caza++
  }
  ver(`mutante «${que}»: la propiedad lo ve (${caza} escenarios distintos)`, caza > 0)
}
fin()
