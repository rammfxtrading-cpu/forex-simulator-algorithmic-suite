/**
 * ET01 · LA ETIQUETA DEL SL DE UNA POSICION, SIN DOBLE SIGNO (orden 1-136 del CTO: «SL -$-100.00»). Escrita ANTES que el
 * codigo (en f5b713b y en d50d028: en rojo).
 * El componente REAL (components/PositionOverlay.js) montado con el React de pruebas y una serie doble: la linea del SL de
 * una posicion lleva «SL  -$<perdida>», la perdida en positivo detras de «-$» (un solo signo). Solo el formato: la cifra
 * es la de hoy (pips × lotes × valor del pip) y la del TP no cambia (control).
 */
import { oraculo, ver, fin, importa, asienta, monta } from '../lib.mjs'
const M = await importa('components/PositionOverlay.js').catch(e => e)
ver('control: components/PositionOverlay.js carga', typeof M?.default === 'function', String(M?.message ?? ''))
if (typeof M?.default !== 'function') fin()

// la serie doble: 1 pip = 1 px desde 1,2
const chartMap = { current: { 'EUR/USD': { series: { priceToCoordinate: p => Math.round((1.2 - p) * 10000), coordinateToPrice: y => 1.2 - y / 10000 }, chart: { chartElement: () => null } } } }
async function etiquetas(pos) {
  const r = monta(M.default, { positions: [pos], pendingOrders: [], chartMap, activePair: 'EUR/USD', dataReady: true, onClosePos() {}, onCancelOrder() {}, onDragEnd() {}, chartTick: 0, ocupadas: new Set() })
  await asienta(20)
  const t = r.texto()
  r.desmonta()
  return { sl: /SL[^T✕⠿]*/.exec(t)?.[0] ?? null, tp: /TP[^S✕⠿]*/.exec(t)?.[0] ?? null, todo: t }
}
const pos = (extra) => ({ id: 'p1', pair: 'EUR/USD', side: 'BUY', entry: 1.1, sl: 1.099, tp: 1.102, lots: 1, slPips: 10, tpPips: 20, openTime: 1000, initialSlPips: 10, ...extra })

const casos = [
  ['largo de 1 lote con el SL a 10 pips', pos({}), 'SL  -$100.00', 'TP  +200.00'],
  ['corto de 0,5 lotes con el SL a 15 pips', pos({ side: 'SELL', entry: 1.1, sl: 1.1015, tp: 1.097, lots: 0.5, slPips: 15, tpPips: 30 }), 'SL  -$75.00', 'TP  +150.00'],
  ['largo de 2 lotes con el SL a 2,5 pips', pos({ lots: 2, sl: 1.09975, slPips: 2.5 }), 'SL  -$50.00', 'TP  +400.00'],
]
for (const [d, p, sl, tp] of casos) {
  const e = await etiquetas(p)
  oraculo('ET01', `${d}: la etiqueta del SL es «${sl}» (un solo signo)`, e.sl === sl && !/-\$-/.test(e.todo), JSON.stringify(e))
  ver(`control (${d}): la etiqueta del TP no cambia («${tp}»)`, e.tp === tp, JSON.stringify(e))
}
fin()
