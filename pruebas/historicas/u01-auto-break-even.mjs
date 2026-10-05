/**
 * U01 · AUTO BREAK-EVEN SE PUEDE ACTIVAR PERO NO LLEGA A NINGUNA PARTE
 *
 * Astra (4-oct): el interruptor solo cambia estado visual
 * (components/OrderModal.js:23, :179); el payload de confirmar no lo lleva
 * (:187) y ningun codigo lo ejecuta.
 *
 * Se ejecuta: el OrderModal REAL; se activa el interruptor y se confirma. Y se
 * busca en TODO el codigo de la app (components/, lib/, pages/) quien podria
 * leer esa opcion. El buscador tiene control positivo: encuentra la variable
 * en el propio OrderModal.
 *
 * ORACULO: si la interfaz ofrece una proteccion, la orden la lleva y algo la
 * ejecuta; o el control no esta.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { titulo, ver, oraculo, fin, importa, escenario, monta, REPO } from '../lib.mjs'
const OrderModal = (await importa('components/OrderModal.js')).default
escenario()

titulo('1 · activar AUTO BREAK-EVEN y confirmar')
let enviado = null
const r = monta(OrderModal, { modal: { side: 'BUY', entry: 1.1, pair: 'EUR/USD', isLimit: false }, balance: 10000, initialBalance: 10000, isChallenge: false,
  currentPrice: 1.1, onClose() {}, onConfirm: d => { enviado = d } })
const fila = () => r.busca(x => x.tipo === 'div' && typeof x.props.onClick === 'function' && /AUTO BREAK-EVEN/.test(r.texto(x)) && !/Ejecutar/.test(r.texto(x)))
ver('control: el control esta en pantalla', !!fila())
const antes = fila().hijos[0].hijos[0].props.style.left
r.pulsa(fila()); r.render()
const despues = fila().hijos[0].hijos[0].props.style.left
ver('control: el interruptor cambia (se ve activado)', antes === 2 && despues === 18, `${antes} → ${despues}`)
r.pulsa(r.boton('Ejecutar Buy'))
ver('control: se confirmo', !!enviado, Object.keys(enviado || {}).join(','))
oraculo('U01', 'la orden confirmada lleva la regla de break-even', Object.keys(enviado).some(k => /be|break/i.test(k)), `payload: ${Object.keys(enviado).join(',')}`)

titulo('2 · quien lee la opcion')
const ficheros = []
const recorre = d => { for (const f of readdirSync(d)) { const p = path.join(d, f); statSync(p).isDirectory() ? recorre(p) : /\.js$/.test(f) && ficheros.push(p) } }
for (const d of ['components', 'lib', 'pages']) recorre(REPO + d)
// Sin /i: «BREAKEVEN» es el RESULTADO de un trade (lib/trading/orders.js:16),
// no la opcion. El buscador mira el nombre de la opcion en el codigo.
const OPCION = /\bautoBE\b|autoBreakEven|auto_be\b|AUTO BREAK-EVEN/
const usan = ficheros.filter(f => OPCION.test(readFileSync(f, 'utf8'))).map(f => path.relative(REPO, f))
ver('control positivo del buscador: encuentra autoBE en OrderModal', usan.includes('components/OrderModal.js'), usan.join(', '))
ver('control negativo: no confunde el resultado BREAKEVEN de lib/trading/orders.js', !usan.includes('lib/trading/orders.js') && /BREAKEVEN/.test(readFileSync(REPO + 'lib/trading/orders.js', 'utf8')))
oraculo('U01', 'algo fuera del modal ejecuta el break-even', usan.some(f => f !== 'components/OrderModal.js'), `solo: ${usan.join(', ')}`)
fin()
