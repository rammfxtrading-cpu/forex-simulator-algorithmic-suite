// UN REACT MINIMO para ejecutar las paginas y componentes REALES del simulador
// sin navegador (no hay jsdom en node_modules ni red para instalarlo).
// ⚠️ LIMITES (H07): ver pruebas/LEEME.md. Un <button> de envio dispara el
//    onSubmit de su <form> aunque su onClick haya llamado a preventDefault.
//
// Implementa lo que el journal usa y nada mas: useState, useEffect, useRef,
// useMemo/useCallback, createContext/useContext, Fragment y el runtime
// automatico de JSX. raiz.alPintar(texto) se llama tras cada pintado. Reglas de React que SI respeta
// (son las que deciden los hallazgos):
//   · los efectos corren tras pintar, hijos antes que padres, y solo si cambia
//     alguna dependencia (Object.is); al cambiar o desmontar, antes la limpieza
//     que devolvio el efecto (la que devuelve el EFECTO, no un callback suyo)
//   · un setState con el mismo valor no repinta; varios seguidos, un repintado
//   · se repinta desde el componente que cambio: el resto, con el mismo
//     elemento y sin setState pendiente, no se vuelve a ejecutar (bailout)
//   · un setState de un componente desmontado no hace nada
//   · un hijo que es un objeto plano revienta el render («Objects are not valid
//     as a React child») y, sin error boundary, la pantalla queda en blanco
//   · un <button> deshabilitado no recibe el clic, ni un campo deshabilitado lo tecleado; un <button> sin type dentro
//     de un <form> lo envia
//   · un ref de objeto apunta al nodo mientras esta montado y vuelve a null al
//     desmontarse; una key distinta es un nodo distinto
// ⛔ NO modela: StrictMode (doble efecto en dev), concurrencia, Suspense,
//    refs de callback, eventos con burbuja. Si una prueba los
//    necesita, este fichero no vale para ella.
export const Fragment = Symbol.for('react.fragment')
export function jsx(type, props, key) {
  const { ref, ...resto } = props || {}
  return { $$el: true, type, props: resto, ref: ref ?? null, key: key === undefined ? null : String(key) }
}
export const jsxs = jsx, jsxDEV = jsx
let actual = null
const usa = () => { if (!actual) throw new Error('react-falso: hook fuera de un componente'); return actual }
export function useState(ini) {
  const inst = usa(), i = inst.i++
  if (!(i in inst.hooks)) {
    const h = inst.hooks[i] = { v: typeof ini === 'function' ? ini() : ini }
    h.set = x => {
      const nv = typeof x === 'function' ? x(h.v) : x
      if (Object.is(nv, h.v)) return
      h.v = nv
      inst.sucio = true
      if (!inst.muerto) inst.raiz.programa()
    }
  }
  return [inst.hooks[i].v, inst.hooks[i].set]
}
export function useRef(ini) { const inst = usa(), i = inst.i++; return inst.hooks[i] ??= { current: ini } }
export function useEffect(fn, deps) {
  const inst = usa(), i = inst.i++
  const h = inst.hooks[i] ??= { efecto: true, deps: undefined, limpia: null, primera: true }
  const cambia = h.primera || !deps || !h.deps || deps.length !== h.deps.length || deps.some((d, k) => !Object.is(d, h.deps[k]))
  if (cambia) inst.efectos.push({ h, fn, deps })
}
export const useLayoutEffect = useEffect
export function useMemo(fn, deps) {
  const inst = usa(), i = inst.i++
  const h = inst.hooks[i]
  if (!h || !deps || deps.length !== h.deps.length || deps.some((d, k) => !Object.is(d, h.deps[k]))) inst.hooks[i] = { v: fn(), deps: deps || [] }
  return inst.hooks[i].v
}
export const useCallback = (fn, deps) => useMemo(() => fn, deps)
// Contexto: el Provider deja su valor a todo lo que pinta debajo; como cada
// repintado es completo desde la raiz, basta una pila por contexto.
export function createContext(porDefecto) {
  const ctx = { porDefecto, pila: [] }
  ctx.Provider = function Provider({ children }) { return children }
  ctx.Provider.__ctx = ctx
  return ctx
}
export function useContext(ctx) { usa(); return ctx.pila.length ? ctx.pila[ctx.pila.length - 1] : ctx.porDefecto }
export default { useState, useRef, useEffect, useLayoutEffect, useMemo, useCallback, createContext, useContext, Fragment }

// ── nodos «del DOM»: un objeto por ruta, con un canvas que lo traga todo ────
const traga = new Proxy(function () {}, { get: (t, k) => k === Symbol.toPrimitive ? () => 0 : traga, apply: () => traga, set: () => true })
const nodoDom = (tipo) => ({ tagName: tipo.toUpperCase(), width: 300, height: 150, style: {}, getContext: () => traga,
  addEventListener() {}, removeEventListener() {}, getBoundingClientRect: () => ({ width: 300, height: 150, top: 0, left: 0 }) })

const nombre = t => typeof t === 'string' ? t : t === Fragment ? '#f' : (t?.name || 'anonimo')
export class Raiz {
  constructor(el) {
    Object.assign(this, { el, insts: new Map(), doms: new Map(), sucio: false, renders: 0, errores: [], desmontada: false, arbol: null })
    this.render()
  }
  programa() {
    if (this.sucio || this.desmontada) return
    this.sucio = true
    queueMicrotask(() => { this.sucio = false; if (!this.desmontada) this.render() })
  }
  // render({ forzar: true }): repinta TODO el arbol (lo usa la sonda de hooks
  // cuando la prueba cambia sus argumentos desde fuera de React)
  render({ forzar = false } = {}) {
    this.forzar = forzar
    this.renders++
    this.vistos = new Set(); this.domVistos = new Set(); this.efectos = []
    try {
      this.arbol = this.resuelve(this.el, 'r', null)
    } catch (e) {
      // sin error boundary: React desmonta el arbol entero
      this.errores.push(e); this.arbol = null; this.vistos = new Set(); this.domVistos = new Set(); this.efectos = []
    }
    for (const [ruta, inst] of this.insts) if (!this.vistos.has(ruta)) this.desmontaInst(ruta, inst)
    // como React: el ref de un nodo que se va se suelta solo si sigue apuntando a
    // el (con otra key, el mismo ref ya apunta al nodo nuevo)
    for (const [ruta, d] of this.doms) if (!this.domVistos.has(ruta)) { if (d.ref && d.ref.current === d.nodo) d.ref.current = null; this.doms.delete(ruta) }
    if (this.alPintar) this.alPintar(this.texto())
    const efectos = this.efectos
    for (const { h } of efectos) if (h.limpia) { const l = h.limpia; h.limpia = null; l() }
    for (const { h, fn, deps } of efectos) { h.primera = false; h.deps = deps; const r = fn(); h.limpia = typeof r === 'function' ? r : null }
  }
  desmontaInst(ruta, inst) {
    inst.muerto = true
    for (const h of inst.hooks) if (h?.efecto && h.limpia) { const l = h.limpia; h.limpia = null; l() }
    this.insts.delete(ruta)
  }
  resuelve(n, ruta, padre) {
    if (n == null || typeof n === 'boolean') return null
    if (typeof n === 'string' || typeof n === 'number') return { texto: String(n), padre }
    if (Array.isArray(n)) return n.flatMap((h, i) => { const r = this.resuelve(h, `${ruta}.${h?.key != null ? 'k' + h.key : i}`, padre); return r == null ? [] : [r].flat() })
    if (!n.$$el) throw new Error(`Objects are not valid as a React child (found: object with keys {${Object.keys(n).join(', ')}})`)
    const { type, props } = n
    const aqui = `${ruta}/${n.key != null ? 'k' + n.key + ':' : ''}${nombre(type)}`
    if (type === Fragment) return this.resuelve(props.children, aqui, padre)
    if (typeof type === 'function') {
      let inst = this.insts.get(aqui)
      if (inst && inst.tipo !== type) { this.desmontaInst(aqui, inst); inst = null }
      if (!inst) { inst = { tipo: type, hooks: [], raiz: this, muerto: false }; this.insts.set(aqui, inst) }
      this.vistos.add(aqui)
      const ctx = type.__ctx
      // Como React: un componente que no tiene un setState pendiente y recibe el
      // MISMO elemento que la vez anterior no se vuelve a ejecutar (bailout); se
      // reusa su salida y se baja a sus hijos, que deciden igual. Un Provider que
      // se ejecuta obliga a repintar todo lo que tiene debajo (por su valor).
      const reusa = !this.forzar && !this.bajoProvider && inst.el === n && !inst.sucio && 'salida' in inst
      let salida
      if (reusa) { salida = inst.salida; inst.efectos = [] }
      else {
        const antes = actual
        actual = inst; inst.i = 0; inst.efectos = []
        try { salida = type(props) } finally { actual = antes }
        inst.salida = salida; inst.el = n; inst.sucio = false
      }
      const bajoAntes = this.bajoProvider
      if (ctx) { ctx.pila.push(props.value); if (!reusa) this.bajoProvider = true }
      let r
      try { r = this.resuelve(salida, aqui, padre) } finally { if (ctx) ctx.pila.pop(); this.bajoProvider = bajoAntes }
      this.efectos.push(...inst.efectos)   // hijos antes que padres
      return r
    }
    const nodo = { tipo: type, props, hijos: [], padre }
    if (n.ref && typeof n.ref === 'object') {
      let d = this.doms.get(aqui)
      if (!d) { d = { nodo: nodoDom(type), ref: n.ref }; this.doms.set(aqui, d) }
      d.ref = n.ref; n.ref.current = d.nodo; nodo.dom = d.nodo
      this.domVistos.add(aqui)
    }
    const h = this.resuelve(props.children, aqui, nodo)
    nodo.hijos = h == null ? [] : [h].flat()
    return nodo
  }
  // ── consultas ──────────────────────────────────────────────────────────
  *recorre(n = this.arbol) {
    if (n == null) return
    if (Array.isArray(n)) { for (const x of n) yield* this.recorre(x); return }
    yield n
    if (n.hijos) for (const h of n.hijos) yield* this.recorre(h)
  }
  texto(n = this.arbol) { return [...this.recorre(n)].filter(x => x.texto != null).map(x => x.texto).join('') }
  todos(pred) { return [...this.recorre()].filter(x => x.tipo && pred(x)) }
  busca(pred) { return this.todos(pred)[0] ?? null }
  boton(texto) { return this.busca(x => x.tipo === 'button' && this.texto(x).includes(texto)) }
  // ── eventos ────────────────────────────────────────────────────────────
  evento(extra = {}) { return { preventDefault() {}, stopPropagation() {}, target: {}, currentTarget: { style: {} }, ...extra } }
  pulsa(n) {
    if (!n) throw new Error('react-falso: pulsa(null)')
    if (n.tipo === 'button' && n.props.disabled) return false
    n.props.onClick?.(this.evento())
    if (n.tipo === 'button' && (n.props.type ?? 'submit') === 'submit') {
      let f = n.padre; while (f && f.tipo !== 'form') f = f.padre
      if (f) f.props.onSubmit?.(this.evento())
    }
    return true
  }
  // un campo deshabilitado no recibe lo que se teclea
  escribe(n, valor) { if (n.props.disabled) return false; n.props.onChange?.(this.evento({ target: { value: valor } })); return true }
  // ── tiempo ─────────────────────────────────────────────────────────────
  async asienta(ms = 0) {
    if (ms) await new Promise(r => setTimeout(r, ms))
    for (let k = 0; k < 40; k++) await new Promise(r => setImmediate(r))
  }
  desmonta() { this.desmontada = true; for (const [ruta, inst] of this.insts) this.desmontaInst(ruta, inst); for (const d of this.doms.values()) if (d.ref) d.ref.current = null; this.doms.clear(); this.arbol = null }
}
export const monta = (Comp, props = {}) => new Raiz(jsx(Comp, props))
