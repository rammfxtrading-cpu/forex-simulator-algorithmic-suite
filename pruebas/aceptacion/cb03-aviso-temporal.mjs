/**
 * CB03 · EL AVISO DE COBERTURA DURA 10 SEGUNDOS Y SE VA SIN DEJAR RASTRO
 * (Ramon probo produccion, bd0d0aa: el aviso queda fijo y no se puede cerrar;
 * CTO 6-oct-2026)
 *
 * Decision: el aviso se muestra 10 s al cargar el par y se desvanece solo, sin
 * dejar indicador, marca ni icono. Vuelve a mostrarse esos 10 s cada vez que
 * se carga una sesion o un par con dias incompletos (usePairData crea un
 * estado de par NUEVO en cada carga; cambiar de par activo tambien cambia el
 * estado que se pinta). No tapa controles (no recibe el raton). No cambia que
 * dias nombra ni el modo estricto (eso es cb01/cb02/d03).
 *
 * Se ejecuta: components/AvisoCobertura.js REAL en el React minimo, con un
 * reloj MANUAL (setTimeout/clearTimeout de la prueba).
 *
 * ORACULOS, a mano:
 *   al cargar: visible con su texto y sin recibir el raton; a los 9,9 s sigue;
 *   antes de los 10 s empieza a desvanecerse (opacidad 0 con transicion);
 *   a los 10 s no queda NADA en el arbol (ni nodo ni texto);
 *   el mismo estado repintado no lo vuelve a sacar; un estado nuevo (otra
 *   carga u otro par) lo saca otros 10 s; sin dias incompletos no hay nada;
 *   la sesion pinta este componente y ya no el aviso fijo.
 */
import { titulo, oraculo, fin, importa, fuente } from '../lib.mjs'
import { monta, jsx, useState } from '../react-falso.mjs'

let Aviso = null
try { Aviso = (await importa('components/AvisoCobertura.js')).default } catch { Aviso = null }

// reloj manual: los temporizadores solo vencen cuando la prueba avanza
const reloj = { t: 0, cola: [], id: 0 }
const origST = globalThis.setTimeout, origCT = globalThis.clearTimeout
globalThis.setTimeout = (f, ms = 0) => { const id = ++reloj.id; reloj.cola.push({ id, en: reloj.t + ms, f }); return id }
globalThis.clearTimeout = id => { reloj.cola = reloj.cola.filter(x => x.id !== id) }
const espera = async (n = 40) => { for (let k = 0; k < n; k++) await new Promise(r => setImmediate(r)) }
async function avanzaA(t) {
  for (;;) {
    const sig = reloj.cola.filter(x => x.en <= t).sort((a, b) => a.en - b.en)[0]
    if (!sig) break
    reloj.cola = reloj.cola.filter(x => x !== sig); reloj.t = sig.en; sig.f(); await espera()
  }
  reloj.t = t; await espera()
}

// un envoltorio con el estado del par que la prueba cambia
let ponEstado = null
function Envoltorio() {
  const [estado, set] = useState({ avisoDatos: 'EUR/USD: dia incompleto en esta sesion: 20-jul-2026 (900 de 1200 velas). Ahi faltan velas.' })
  ponEstado = set
  return Aviso ? jsx(Aviso, { estadoPar: estado }) : null
}
const nodo = r => r.busca(x => x.props?.role === 'status')
const vacio = r => r.texto() === '' && r.todos(() => true).length === 0

titulo('1 · al cargar el par')
const r = monta(Envoltorio); await espera()
const n0 = nodo(r)
oraculo('CB03', 'visible al cargar, con su texto, y sin recibir el raton (no tapa controles)', !!n0 && /20-jul-2026/.test(r.texto()) && n0.props.style?.pointerEvents === 'none', n0 ? JSON.stringify(n0.props.style) : 'sin aviso')
await avanzaA(9900)
const n1 = nodo(r)
oraculo('CB03', 'a los 9,9 s sigue en el arbol', !!n1, n1 ? 'presente' : 'ausente')
oraculo('CB03', 'antes de los 10 s se esta desvaneciendo (opacidad 0 con transicion)', !!n1 && Number(n1.props.style?.opacity) === 0 && /opacity/.test(String(n1.props.style?.transition ?? '')), n1 ? JSON.stringify(n1.props.style) : 'ausente')
await avanzaA(10000)
oraculo('CB03', 'a los 10 s no queda nada en el arbol: ni nodo, ni texto, ni marca', !!Aviso && vacio(r), `texto «${r.texto()}» · ${r.todos(() => true).length} nodo(s)`)

titulo('2 · repintados y cargas nuevas')
ponEstado(e => e); await espera(); await avanzaA(15000)
oraculo('CB03', 'el mismo estado repintado no lo vuelve a sacar', !!Aviso && vacio(r), r.texto())
ponEstado({ avisoDatos: 'GBP/USD: dia incompleto en esta sesion: 20-jul-2026 (900 de 1200 velas). Ahi faltan velas.' }); await espera()
const vuelve = !!nodo(r) && /GBP\/USD/.test(r.texto())
await avanzaA(15000 + 9900); const sigue = !!nodo(r)
await avanzaA(15000 + 10000)
oraculo('CB03', 'un estado nuevo (otra carga u otro par) lo saca otros 10 s y se vuelve a ir', vuelve && sigue && vacio(r), `aparece ${vuelve} · a 9,9 s ${sigue} · a 10 s vacio ${vacio(r)}`)
ponEstado({ avisoDatos: '' }); await espera(); await avanzaA(40000)
oraculo('CB03', 'un par sin dias incompletos no pinta nada', !!Aviso && vacio(r), r.texto())
r.desmonta()
oraculo('CB03', 'al desmontar no quedan temporizadores pendientes', reloj.cola.length === 0, `${reloj.cola.length} pendiente(s)`)

titulo('3 · la sesion lo usa')
const src = fuente('components/_SessionInner.js')
oraculo('CB03', 'la sesion pinta AvisoCobertura con el estado del par activo y ya no el aviso fijo', /<AvisoCobertura estadoPar=\{pairState\.current\[activePair\]\}/.test(src) && !/\{pairState\.current\[activePair\]\.avisoDatos\}/.test(src), '')
globalThis.setTimeout = origST; globalThis.clearTimeout = origCT
fin()
