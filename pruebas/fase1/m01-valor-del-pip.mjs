/**
 * M01 · EL TAMAÑO DEL MODAL Y EL P&L DEL CIERRE NO USAN EL MISMO VALOR DEL PIP
 *
 * Astra (4-oct): el modal calcula lotes con 10 USD/pip/lote para todos los
 * pares (components/OrderModal.js:43) y el cierre usa una tabla fija por divisa
 * cotizada (lib/trading/pricing.js:12). Riesgo 1 % de 100.000 con stop de 10
 * pips → 10 lotes; perdidas reales EURUSD −1.000, USDJPY −625, EURGBP −1.335,
 * USDCHF −1.265. Y USDJPY 150→151 con 1 lote: 625 en vez de 662,251656.
 *
 * Se ejecuta: el OrderModal REAL (pintado con el React falso) para leer los
 * lotes y la perdida anunciada, y realizePnl REAL para la perdida al tocar el
 * SL que el propio modal calcula.
 *
 * ORACULOS, calculados a mano (lote estandar = 100.000 unidades de la base;
 * cuenta en USD):
 *   · el riesgo anunciado se cumple: perder en el SL lo que el modal dice,
 *     1 % de 100.000 = 1.000 USD, en cualquier par
 *   · USDJPY 150 → 151, BUY 1 lote: 100.000 × (151 − 150) = 100.000 JPY;
 *     a 151 JPY/USD = 100.000 / 151 = 662,251656 USD
 *   · EURGBP con GBPUSD = 1,2500: 1 pip de 1 lote = 10 GBP = 12,50 USD (el
 *     valor depende del cambio del momento; la tabla fija dice 13,35)
 */
import { titulo, ver, oraculo, fin, importa, escenario, monta } from '../lib.mjs'
const OrderModal = (await importa('components/OrderModal.js')).default
const { realizePnl } = await importa('lib/trading/orders.js')
const { calcPnl, pipValue } = await importa('lib/trading/pricing.js')
escenario()

// el valor del campo con esa etiqueta (Field: div > [div etiqueta, div > input])
const campo = (r, etiqueta) => {
  const caja = r.busca(x => x.tipo === 'div' && x.hijos?.length === 2 && r.texto(x.hijos[0]) === etiqueta && x.hijos[1].hijos?.[0]?.tipo === 'input')
  return caja?.hijos[1].hijos[0].props.value
}
const PARES = { 'EUR/USD': 1.10000, 'USD/JPY': 150.000, 'EUR/GBP': 0.85000, 'USD/CHF': 0.90000 }

titulo('1 · riesgo 1 % de 100.000, SL 10 pips, BUY a mercado')
const filas = []
for (const [par, px] of Object.entries(PARES)) {
  let enviado = null
  const r = monta(OrderModal, { modal: { side: 'BUY', entry: px, pair: par, isLimit: false }, balance: 100000, initialBalance: 100000,
    isChallenge: true, currentPrice: px, onClose() {}, onConfirm: d => { enviado = d } })
  const lotes = Number(campo(r, 'LOTS'))
  const anunciada = Number(/PÉRDIDA MÁX-\$([\d.]+)/.exec(r.texto())?.[1])
  r.pulsa(r.boton('Ejecutar Buy'))
  const { pnl } = realizePnl({ side: 'BUY', entry: px, exit: enviado.sl, lots: enviado.lots, pair: par, slPips: enviado.slPips })
  filas.push({ par, lotes, anunciada, real: Math.round(pnl * 100) / 100 })
  r.desmonta()
}
ver('control: el modal pinta 10 lotes y anuncia −1.000 en los cuatro', filas.every(f => f.lotes === 10 && f.anunciada === 1000), JSON.stringify(filas.map(f => [f.par, f.lotes, f.anunciada])))
const usd = filas.find(f => f.par === 'EUR/USD')
ver('control: EURUSD pierde exactamente 1.000 (10 pips × 10 lotes × 10 USD)', Math.abs(usd.real + 1000) < 0.01, usd.real)
for (const f of filas.filter(f => f.par !== 'EUR/USD')) {
  oraculo('M01', `${f.par}: perder en el SL lo anunciado (−1.000)`, Math.abs(f.real + 1000) < 0.01, `real ${f.real}`)
}

titulo('2 · USDJPY 150 → 151, BUY 1 lote')
const jpy = calcPnl('BUY', 150, 151, 1, 'USD/JPY')
ver('control: EURUSD 1,1000 → 1,1010, 1 lote = +100 USD', Math.abs(calcPnl('BUY', 1.1, 1.101, 1, 'EUR/USD') - 100) < 1e-9)
oraculo('M01', 'USDJPY 150→151, 1 lote = 100.000/151 = 662,251656 USD', Math.abs(jpy - 662.251656) < 1e-6, `codigo ${jpy}`)

titulo('3 · EURGBP depende del cambio del momento')
ver('control: la tabla fija da 13,35 USD/pip para cualquier GBP', pipValue('EUR/GBP') === 13.35)
oraculo('M01', 'EURGBP con GBPUSD 1,2500: 1 pip de 1 lote = 12,50 USD', Math.abs(calcPnl('BUY', 0.85, 0.8501, 1, 'EUR/GBP') - 12.5) < 1e-6, `codigo ${calcPnl('BUY', 0.85, 0.8501, 1, 'EUR/GBP').toFixed(4)} (no recibe el cambio: no puede saberlo)`)
fin()
