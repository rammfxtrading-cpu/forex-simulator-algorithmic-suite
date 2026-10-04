// next/router, next/link, next/head y next/dynamic falsos (ver cargador.mjs).
// El router es uno y estable, como el de Next: globalThis.__router. Navegar no
// monta nada: se apunta en __router.navegado para que la prueba lo mire.
// next/dynamic: carga el modulo de verdad (como Next en el cliente, ssr:false)
// y lo pinta cuando llega; mientras, lo que diga `loading` o nada.
import { jsx, useState, useEffect } from './react-falso.mjs'
export const router = globalThis.__router ??= {
  pathname: '/', query: {}, asPath: '/', navegado: [], oyentes: {},
  push(u) { this.navegado.push(['push', u]); return Promise.resolve(true) },
  replace(u) { this.navegado.push(['replace', u]); return Promise.resolve(true) },
  prefetch() { return Promise.resolve() },
  events: { on(ev, f) { (router.oyentes[ev] ??= []).push(f) }, off(ev, f) { router.oyentes[ev] = (router.oyentes[ev] || []).filter(g => g !== f) } },
}
export const useRouter = () => router
export const Router = router
export function Link({ href, children, ...resto }) { return jsx('a', { href, ...resto, children }) }
export function Head() { return null }
export function dynamic(cargar, opciones = {}) {
  let Comp = null
  const listo = Promise.resolve().then(cargar).then(m => { Comp = m.default ?? m })
  return function Dinamico(props) {
    const [, setVez] = useState(0)
    useEffect(() => { if (!Comp) listo.then(() => setVez(v => v + 1)) }, [])
    return Comp ? jsx(Comp, props) : (opciones.loading ? jsx(opciones.loading, {}) : null)
  }
}
