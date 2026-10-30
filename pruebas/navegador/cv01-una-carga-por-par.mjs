/**
 * CV01 · UNA SOLA CARGA DE VELAS POR PAR EN VUELO, Y QUIEN PIDE CADA UNA (orden 1-179 (e) del CTO).
 * En la preview de la rama, con la bandera v1, /api/candles?year=2025 salio 4 veces (503 ×4). Aqui se MIDE en la pagina
 * real: cada peticion de velas con su initiator de Chrome (Network.requestWillBeSent con la pila, tambien la asincrona:
 * Debugger.setAsyncCallStackDepth) y, para cada marco, la linea de codigo que la lanzo (Debugger.getScriptSource): asi se
 * atribuye a su disparador (usePairData.js:299 / :303, _SessionInner.js:1061 / :1317) sin suponerlo.
 * PESADA: Chrome, `next dev` (dos: la bandera v1 se fija al arrancar) y PostgreSQL. SIEMPRE con el turno:
 *   revisiones-suite/con-turno node pruebas/navegador/cv01-una-carga-por-par.mjs
 *   V0 · bandera apagada, sesion v0 (2-mar → 13-mar-2026, el contexto de 180 dias cae en 2025) y /api/candles con 503 para
 *        2025, como la rama. ORACULO: cada (par, año) se pide UNA vez.
 *   V1 · bandera ENCENDIDA, sesion v1 con lib/servidor REAL + PostgreSQL desechable (motor-v1-real.mjs), mismo 503 de 2025.
 *        ORACULO: cada peticion de velas (/api/candles por año, o /api/sim/velas por ventana) sale UNA vez.
 * Salida: MEDIDA (por defecto .pruebas/cv01-medida.json): cada peticion con su pila y su disparador.
 * Codigo 0 verde, 1 rojo, 2 control roto.
 */
import fs from 'node:fs'
import path from 'node:path'
import { setTimeout as espera } from 'node:timers/promises'
import { montaPagina } from './sesion-comun.mjs'
import { arrancaNext } from './app.mjs'
import { REPO } from './cdp.mjs'
import { motorV1Real, sesionDelDoble } from './motor-v1-real.mjs'

let rojos = 0, verdes = 0, rotos = 0
const oraculo = (d, ok, extra = '') => { ok ? verdes++ : rojos++; console.log(`  ${ok ? '🟢 VERDE' : '🔴 ROJO '} [CV01] ${d}${extra ? '  · ' + extra : ''}`) }
const control = (d, ok, extra = '') => { if (!ok) rotos++; console.log(`  ${ok ? '✓' : '✗ CONTROL ROTO'} ${d}${extra ? '  · ' + extra : ''}`) }
const CAPTURAS = process.env.CAPTURAS || path.join(REPO, '.pruebas')
fs.mkdirSync(CAPTURAS, { recursive: true })
const MEDIDA = process.env.MEDIDA || path.join(CAPTURAS, 'cv01-medida.json')
const HASTA = Date.parse('2026-03-03T10:00:00Z') / 1000
const ES_VELAS = u => u.pathname === '/api/candles' || u.pathname === '/api/sim/velas'

// los disparadores conocidos de loadPair, por el texto de la linea que llama (el codigo de next dev esta transformado: los
// numeros de linea no son los del fichero; el texto si)
const DISPARADORES = [
  [/if\s*\(\s*session\s*&&\s*activePair\s*\)\s*loadPair\(activePair\)/, 'usePairData.js:303 (efecto [session, activePair, loadPair])'],
  // (transformado, el setDataReady(false) de :299 queda en la linea de antes)
  [/if\s*\(\s*sessionRef\.current\s*\)\s*loadPair\(activePair\)/, 'usePairData.js:299 (efecto [activePair, loadPair], par sin motor)'],
]
// en _SessionInner, loadPair(pair) aparece dos veces: se distingue por el texto de alrededor
function disparadorDe(marcos) {
  for (const m of marcos) {
    const t = m.linea || ''
    for (const [re, nombre] of DISPARADORES) if (re.test(t)) return nombre
    if (/loadPair\(pair\)/.test(t) || /loadPair\(pair\)/.test(m.entorno || '')) {
      if (/delete\s+st\.error|reintentaPar|setTick/.test(m.entorno || '')) return '_SessionInner.js:1317 (reintentaPar, boton Reintentar)'
      if (/dragCleanup|removeEventListener|mountPair/.test(m.entorno || '')) return '_SessionInner.js:1061 (mountPairRef: montaje del grafico del par)'
      return '_SessionInner.js (loadPair(pair) sin identificar)'
    }
  }
  return '(sin identificar)'
}

async function medidor(cdp, on) {
  const peticiones = []
  await cdp('Debugger.enable')
  await cdp('Debugger.setAsyncCallStackDepth', { maxDepth: 64 })
  on('Network.requestWillBeSent', p => {
    let u; try { u = new URL(p.request.url) } catch { return }
    if (!ES_VELAS(u)) return
    peticiones.push({ ms: Date.now(), ruta: u.pathname, query: Object.fromEntries(u.searchParams), initiator: p.initiator })
  })
  const fuentes = new Map()
  async function fuente(scriptId) {
    if (!fuentes.has(scriptId)) { const r = await cdp('Debugger.getScriptSource', { scriptId }); fuentes.set(scriptId, (r.result?.scriptSource ?? '').split('\n')) }
    return fuentes.get(scriptId)
  }
  // la pila (sincrona y asincrona) de cada peticion, con el texto de cada linea
  async function resuelve() {
    const out = []
    for (const p of peticiones) {
      const marcos = []
      for (let s = p.initiator?.stack, k = 0; s && k < 40; s = s.parent, k++) {
        for (const f of s.callFrames ?? []) {
          const ls = await fuente(f.scriptId).catch(() => [])
          const linea = (ls[f.lineNumber] ?? '').trim()
          const entorno = ls.slice(Math.max(0, f.lineNumber - 6), f.lineNumber + 3).join(' ')
          marcos.push({ async: s.description ?? null, fn: f.functionName || '(anonima)', url: f.url.replace(/^.*\/_next\//, '_next/'), linea: linea.length > 220 ? linea.slice(Math.max(0, f.columnNumber - 110), f.columnNumber + 110) : linea, entorno: entorno.slice(0, 600) })
        }
      }
      out.push({ ruta: p.ruta, query: p.query, ms: p.ms, disparador: disparadorDe(marcos), marcos: marcos.map(({ entorno, ...m }) => m) })
    }
    return out
  }
  return { peticiones, resuelve }
}
// la clave de una peticion: el par y su año (/api/candles) o su ventana (/api/sim/velas)
const clave = p => p.ruta === '/api/candles' ? `${p.query.pair} ${p.query.year} ${p.query.from}-${p.query.to}` : `${p.query.par} ${p.query.desde ?? '(rango)'}..${p.query.hasta ?? ''}`
const repetidas = lista => { const n = new Map(); for (const p of lista) n.set(clave(p), (n.get(clave(p)) ?? 0) + 1); return [...n].filter(([, k]) => k > 1) }

const medida = { fecha: new Date().toISOString(), arbol: null, V0: null, V1: null }
let m = null, app0 = null, app1 = null
const paginas = []
const sale = () => {
  try { fs.writeFileSync(MEDIDA, JSON.stringify(medida, null, 1)); console.log(`    medida: ${MEDIDA}`) } catch {}
  console.log(`\n${rojos} en rojo · ${verdes} en verde · ${rotos} controles rotos`)
  for (const g of paginas) { try { g.cierraPagina() } catch {} }
  app0?.mata(); app1?.mata(); m?.cierra(); process.exit(rotos ? 2 : rojos ? 1 : 0)
}
try {
  // V0 · bandera apagada
  app0 = await arrancaNext()
  let red0 = null
  const g0 = await montaPagina({ app: app0, velasCaidas: [2025], red: async (cdp, on) => { red0 = await medidor(cdp, on) } })
  paginas.push(g0)
  await espera(8000)
  control('V0 · la pagina v0 monto el grafico de EUR/USD', !!(await g0.E(`!!${g0.CR}?.series`)))
  const r0 = await red0.resuelve()
  medida.V0 = r0
  control('V0 · se pidio /api/candles de 2025 y de 2026 (el contexto cae en 2025)', r0.some(p => p.query.year === '2025') && r0.some(p => p.query.year === '2026'), JSON.stringify(r0.map(p => [p.query.year, p.disparador])))
  console.log(`    (medida V0) ${r0.length} peticiones: ${JSON.stringify(r0.map(p => [p.ruta, p.query.year ?? p.query.desde, p.disparador]))}`)
  oraculo('V0 · cada (par, año) de velas se pide UNA sola vez', repetidas(r0).length === 0, JSON.stringify(repetidas(r0)))
  g0.cierraPagina(); app0.mata(); app0 = null

  // V1 · bandera encendida, motor real
  m = await motorV1Real()
  const f0 = await m.prepara({ hasta: HASTA })
  control('V1 · la practica v1 creada en el servidor real con el cursor el 3-mar 10:00 UTC', f0?.estado?.reloj?.cursor === HASTA)
  app1 = await arrancaNext({ env: { NEXT_PUBLIC_SIM_V1_PANTALLA: 'encendido' } })
  let red1 = null
  const g1 = await montaPagina({ app: app1, sesion: sesionDelDoble(await m.fila()), api: m.api, velasCaidas: [2025], red: async (cdp, on) => { red1 = await medidor(cdp, on) } })
  paginas.push(g1)
  await espera(8000)
  control('V1 · la pagina v1 monto el grafico de EUR/USD y tomo el escritor', !!(await g1.E(`!!${g1.CR}?.series`)) && m.llamadas.some(l => l.ruta === '/api/sim/tomar' && l.http === 200))
  const r1 = await red1.resuelve()
  medida.V1 = r1
  console.log(`    (medida V1) ${r1.length} peticiones: ${JSON.stringify(r1.map(p => [p.ruta, p.query.year ?? p.query.desde ?? '(rango)', p.disparador]))}`)
  control('V1 · la pagina pidio velas', r1.length > 0)
  oraculo('V1 · cada peticion de velas (por año o por ventana) sale UNA sola vez', repetidas(r1).length === 0, JSON.stringify(repetidas(r1)))
  const fuera = paginas.flatMap(g => g.fuera)
  control('las paginas no han pedido nada fuera de la maquina salvo la fuente de Google (bloqueada)', fuera.every(u => u.startsWith('https://fonts.googleapis.com/')), JSON.stringify(fuera))
  console.log(`    (informativo) errores de consola: ${JSON.stringify(paginas.flatMap(g => g.b.errores).slice(0, 5))}`)
} catch (e) { control('la prueba corrio entera', false, e.stack) }
sale()
