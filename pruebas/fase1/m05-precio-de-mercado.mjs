/**
 * M05 · UNA ORDEN A MERCADO SE ABRE AL PRECIO DE CUANDO SE ABRIO EL MODAL
 *
 * Astra (4-oct): el boton Buy/Sell guarda currentPrice en el modal
 * (components/SessionBottomBar.js:23) y el alta usa ese entry
 * (components/_SessionInner.js:1879); el replay no se pausa al abrir el modal.
 *
 * Se ejecuta: la PAGINA DE SESION REAL (React falso) con un grafico minimo
 * inyectado en window.__chartMap (la propia pagina lo expone,
 * _SessionInner.js:63) para que updateChart actualice el precio vivo como con
 * el grafico de verdad; el doble de serie no hace nada mas (sin guard: P01 va
 * aparte). Se abre el modal con Buy, el replay avanza 5 velas con el modal
 * abierto (ArrowRight, el atajo real), y se confirma con el OrderModal REAL.
 *
 * ORACULO, a mano: velas M1 que suben 0,0010 cada una. Modal abierto a
 * 1,10100; cinco velas despues el precio vigente es 1,10600. Una orden a
 * mercado se ejecuta al precio vigente al confirmar: entrada 1,10600 y flotante
 * 0,00 en el instante de abrir. (Con 1 % de 10.000 y SL 10 pips el modal da
 * 1 lote: abrir a 1,10100 regala 50 pips × 1 lote × 10 USD = +500.)
 */
import { titulo, ver, oraculo, fin, escenario, sesionSim, importa, monta, router, vela, nav } from '../lib.mjs'
import { velasEnStorage } from '../banco-motor.mjs'
const Sesion = (await importa('components/_SessionInner.js')).default
escenario({ sim_sessions: [sesionSim({ id: 'ses-m05', capital: 10000, balance: 10000 })] })
const T = Date.parse('2025-03-03T10:00:00Z') / 1000
velasEnStorage('EUR/USD', Array.from({ length: 30 }, (_, i) => { const px = +(1.1 + i * 0.001).toFixed(4); return vela(T + i * 60, px, px, px, px) }), [2024], { tramoAbierto: true })
router.query = { id: 'ses-m05' }

const p = monta(Sesion, {}); await p.asienta(300)
const ts = { getVisibleLogicalRange: () => ({ from: 0, to: 50 }), setVisibleLogicalRange() {}, scrollToPosition() {} }
window.__chartMap.current['EUR/USD'] = { series: { setData() {}, update() {}, priceToCoordinate: () => 0, createPriceLine: () => ({}), removePriceLine() {} },
  chart: { timeScale: () => ts, priceScale: () => ({ applyOptions() {} }) }, prevCount: 0 }
const paso = async () => { for (const f of [...(nav.oyentes.keydown || [])]) f({ code: 'ArrowRight', key: 'ArrowRight', target: { tagName: 'DIV' }, preventDefault() {} }); await p.asienta(20) }
// un Field del OrderModal: div > [div etiqueta, div > input]
const campo = etiqueta => p.busca(x => x.tipo === 'div' && x.hijos?.length === 2 && p.texto(x.hijos[0]) === etiqueta && x.hijos[1].hijos?.[0]?.tipo === 'input')?.hijos[1].hijos[0].props.value
const entradaModal = () => campo('ENTRADA')
// bloque D, punto 7: la etiqueta es «Float par activo (PAR):»
const flotante = () => /Float[^:]*: ([+-]\d+\.\d{2})/.exec(p.texto())?.[1]
const lotes = () => campo('LOTS')

titulo('1 · abrir el modal y dejar que el replay avance')
await paso()
ver('control: el precio vivo avanza con el replay (1,10100 tras una vela)', p.texto().includes('1.10100'))
p.pulsa(p.boton('▲ Buy')); await p.asienta(100)
ver('control: el OrderModal real esta abierto con entrada 1.10100 y 1 lote', /BUY MARKET/.test(p.texto()) && entradaModal() === '1.10100' && Number(lotes()) === 1, `${entradaModal()} · ${lotes()} lotes`)
for (let i = 0; i < 5; i++) await paso()
ver('control: con el modal abierto el replay siguio: precio vigente 1,10600', p.texto().includes('1.10600'))
oraculo('M05', 'el modal enseña la entrada vigente (1.10600)', entradaModal() === '1.10600', `sigue enseñando ${entradaModal()}`)

titulo('2 · confirmar')
p.pulsa(p.boton('Ejecutar Buy')); await p.asienta(100)
ver('control: la posicion se abrio (1 POS)', !!p.busca(x => x.tipo === 'button' && /^1 POS$/.test(p.texto(x).trim())))
oraculo('M05', 'la orden a mercado entra al precio vigente: flotante 0,00 al abrir', flotante() === '+0.00', `flotante al abrir ${flotante()} (entrada 1,10100 con el precio en 1,10600)`)
fin()
