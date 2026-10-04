/**
 * U01 · AUTO BREAK-EVEN SE PUEDE ACTIVAR PERO NO LLEGA A NINGUNA PARTE
 *
 * Astra (4-oct): el interruptor solo cambia estado visual
 * (components/OrderModal.js:23, :179); el payload de confirmar no lo lleva
 * (:187) y ningun codigo lo ejecuta.
 * Decision del CTO (4-oct, bloque A): ocultar el control hasta que exista.
 *
 * Se ejecuta: el OrderModal REAL; si el control esta, se activa y se confirma.
 * Y se busca en TODO el codigo de la app (components/, lib/, pages/) quien
 * podria leer esa opcion. El buscador tiene control positivo (una opcion que
 * SI existe, «riskPct», se encuentra fuera del modal) y negativo (no confunde
 * el resultado BREAKEVEN).
 *
 * ORACULO: si la interfaz ofrece una proteccion, la orden la lleva y algo la
 * ejecuta; o el control no esta.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { titulo, ver, oraculo, fin, importa, escenario, monta, REPO } from '../lib.mjs'
const OrderModal = (await importa('components/OrderModal.js')).default
escenario()

titulo('1 · el modal')
let enviado = null
const r = monta(OrderModal, { modal: { side: 'BUY', entry: 1.1, pair: 'EUR/USD', isLimit: false }, balance: 10000, initialBalance: 10000, isChallenge: false,
  currentPrice: 1.1, onClose() {}, onConfirm: d => { enviado = d } })
ver('control: el modal se pinto (boton Ejecutar Buy)', !!r.boton('Ejecutar Buy'))
const fila = () => r.busca(x => x.tipo === 'div' && typeof x.props.onClick === 'function' && /AUTO BREAK-EVEN/.test(r.texto(x)) && !/Ejecutar/.test(r.texto(x)))
const enPantalla = /AUTO BREAK-EVEN/i.test(r.texto())
if (enPantalla) { r.pulsa(fila()); r.render() }
r.pulsa(r.boton('Ejecutar Buy'))
ver('control: se confirmo', !!enviado, Object.keys(enviado || {}).join(','))
const lleva = Object.keys(enviado).some(k => /autobe|breakeven|break_even/i.test(k))

titulo('2 · quien lee la opcion')
const ficheros = []
const recorre = d => { for (const f of readdirSync(d)) { const p = path.join(d, f); statSync(p).isDirectory() ? recorre(p) : /\.js$/.test(f) && ficheros.push(p) } }
for (const d of ['components', 'lib', 'pages']) recorre(REPO + d)
const busca = re => ficheros.filter(f => re.test(readFileSync(f, 'utf8'))).map(f => path.relative(REPO, f))
// Sin /i: «BREAKEVEN» es el RESULTADO de un trade (lib/trading/orders.js:16), no la opcion.
const usan = busca(/\bautoBE\b|autoBreakEven|auto_be\b/)
ver('control positivo del buscador: encuentra riskPct (una opcion del modal que SI existe) en el modal', busca(/\briskPct\b/).includes('components/OrderModal.js'))
ver('control negativo: no confunde el resultado BREAKEVEN de lib/trading/orders.js', !usan.includes('lib/trading/orders.js') && /BREAKEVEN/.test(readFileSync(REPO + 'lib/trading/orders.js', 'utf8')))
const ejecuta = usan.some(f => f !== 'components/OrderModal.js')
oraculo('U01', 'AUTO BREAK-EVEN: o no se ofrece, o la orden lo lleva y algo lo ejecuta', !enPantalla || (lleva && ejecuta),
  `en pantalla: ${enPantalla}; en el payload: ${lleva}; quien lo lee: ${usan.join(', ') || 'nadie'}`)
fin()
