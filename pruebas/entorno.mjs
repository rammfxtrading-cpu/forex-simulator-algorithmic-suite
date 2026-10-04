// El entorno de las pruebas: un navegador minimo y UN fetch que reparte.
//   /api/...          → el handler REAL de pages/api (rutas dinamicas [id]
//                       incluidas), con la cookie de sesion de db.sesion (como la
//                       manda el navegador del simulador)
//   cualquier otra cosa → el fetch cortado de sin-red.mjs
// ⛔ Sin sin-red.mjs delante esto se niega a arrancar: el «resto» tiene que ir
//    al fetch cortado, nunca al de verdad.
import { pathToFileURL, fileURLToPath } from 'node:url'
import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { db, llama } from './supabase-falso.mjs'
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..') + '/'

const bloqueado = globalThis.__fetchBloqueado
if (!bloqueado || globalThis.fetch !== bloqueado) throw new Error('entorno.mjs: falta sin-red.mjs delante (node --import ./pruebas/sin-red.mjs ...)')

// pages/api/<ruta>.js, o el [param].js de su carpeta (como el router de Next)
function resuelveApi(ruta) {
  const directo = REPO + 'pages/api/' + ruta + '.js'
  if (existsSync(directo)) return { fichero: directo, query: {} }
  const partes = ruta.split('/'), ultimo = partes.pop(), dir = REPO + 'pages/api/' + partes.join('/')
  const din = existsSync(dir) && readdirSync(dir).find(f => /^\[[^\]]+\]\.js$/.test(f))
  if (!din) throw new Error('entorno: no hay handler para /api/' + ruta)
  return { fichero: dir + '/' + din, query: { [din.slice(1, -4)]: decodeURIComponent(ultimo) } }
}

// ── /api → handler real ────────────────────────────────────────────────────
export const api = globalThis.__api ??= { llamadas: [] }
export const cookieDeSesion = () => db.sesion
  ? `sb-falso-auth-token=${encodeURIComponent(JSON.stringify({ access_token: db.sesion.access_token }))}` : null
async function apiReal(u, o = {}) {
  const url = new URL(u, 'https://simulator.algorithmicsuite.com')
  const { fichero, query } = resuelveApi(url.pathname.replace(/^\/api\//, ''))
  const handler = (await import(pathToFileURL(fichero).href)).default
  const headers = Object.fromEntries(Object.entries(o.headers || {}).map(([k, v]) => [k.toLowerCase(), v]))
  const metodo = (o.method || 'GET').toUpperCase()
  let body = o.body
  if (typeof body === 'string' && /json/.test(headers['content-type'] || '')) body = JSON.parse(body)
  const r = await llama(handler, { method: metodo, body, query: { ...Object.fromEntries(url.searchParams), ...query }, headers, cookie: cookieDeSesion() })
  api.llamadas.push({ ruta: url.pathname, metodo, estado: r.estado, body })
  if (r.excepcion) api.llamadas.at(-1).excepcion = r.excepcion.message
  return {
    ok: r.estado >= 200 && r.estado < 300, status: r.estado,
    json: async () => { if (r.cuerpo === undefined) throw new SyntaxError('Unexpected end of JSON input'); return structuredClone(r.cuerpo) },
    text: async () => r.cuerpo === undefined ? '' : JSON.stringify(r.cuerpo),
  }
}
// antes(u, o): promesa que retiene esa llamada · pierde(u, o): true = el servidor la
// procesa pero la respuesta no llega · responde(u, o): una respuesta inventada en
// lugar del handler (p. ej. un 500 de /api/candles)
export const retenApi = globalThis.__retenApi ??= { antes: null, pierde: null, responde: null }
globalThis.fetch = async (u, o) => {
  const s = String(u)
  if (s.startsWith('/api/')) {
    if (retenApi.antes) await retenApi.antes(s, o)
    const inventada = retenApi.responde && await retenApi.responde(s, o)
    if (inventada) { api.llamadas.push({ ruta: s.split('?')[0], metodo: (o?.method || 'GET').toUpperCase(), estado: inventada.status, inventada: true }); return inventada }
    const r = await apiReal(s, o)
    if (retenApi.pierde?.(s, o)) throw new TypeError('Failed to fetch')
    return r
  }
  return bloqueado(u)
}
export const respuesta = (status, cuerpo) => ({ ok: status >= 200 && status < 300, status, json: async () => structuredClone(cuerpo), text: async () => JSON.stringify(cuerpo) })

// ── navegador minimo ───────────────────────────────────────────────────────
export const nav = globalThis.__nav ??= { alertas: [], confirmar: true, destinos: [], oyentes: {} }
nav.dispara = tipo => { for (const f of [...(nav.oyentes[tipo] || [])]) f({ type: tipo }) }
const oye = (t, f) => { (nav.oyentes[t] ??= []).push(f) }
const deja = (t, f) => { nav.oyentes[t] = (nav.oyentes[t] || []).filter(g => g !== f) }
const almacen = () => { const m = new Map(); return { getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), clear: () => m.clear() } }
globalThis.localStorage = almacen()
globalThis.window = {
  location: { hostname: 'simulator.algorithmicsuite.com', origin: 'https://simulator.algorithmicsuite.com', pathname: '/', search: '', hash: '',
    get href() { return 'https://simulator.algorithmicsuite.com' + this.pathname + this.search + this.hash }, set href(v) { nav.destinos.push(v) } },
  innerWidth: 1440, innerHeight: 900, devicePixelRatio: 2,
  addEventListener: oye, removeEventListener: deja,
  matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  localStorage: globalThis.localStorage,
  open: u => { nav.destinos.push(u) },
}
globalThis.document = { cookie: '', hidden: false, visibilityState: 'visible', fullscreenElement: null, addEventListener: oye, removeEventListener: deja, querySelector: () => null, documentElement: {}, body: {} }
globalThis.requestAnimationFrame = () => 1
globalThis.cancelAnimationFrame = () => {}
globalThis.confirm = () => nav.confirmar
globalThis.alert = m => { nav.alertas.push(String(m)) }
// Sin layout: un ResizeObserver que no observa nada (los overlays lo crean al montar)
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }
