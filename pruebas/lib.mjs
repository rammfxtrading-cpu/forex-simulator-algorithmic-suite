// Utilidades comunes de las pruebas del simulador: una forma de contar, un solo sitio.
//
// Dos clases de comprobacion, y no se mezclan:
//   ver(desc, cond)        CONTROL: el montaje es el que se cree (el dato de
//                          partida, que el codigo real corrio, que el doble no
//                          miente). Si un control falla, la prueba NO mira: sale
//                          con codigo 2 y su resultado no vale.
//   oraculo(id, desc, cond, cifras)
//                          lo que el producto DEBERIA hacer, con el oraculo
//                          escrito en la propia prueba. En rojo = el hallazgo se
//                          reproduce. Codigo 1 si alguno esta en rojo.
// Cada oraculo se apunta en .pruebas/fase1.jsonl para el informe.
import { readFileSync, mkdirSync, appendFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'
import { gunzipSync } from 'node:zlib'
import { db, reset } from './supabase-falso.mjs'
import { router } from './next-falso.mjs'
import { api, nav, retenApi } from './entorno.mjs'
import { proveedor, resetProveedor } from './proveedor-falso.mjs'
import { monta, jsx } from './react-falso.mjs'

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..') + '/'
export const fuente = p => readFileSync(REPO + p, 'utf8')
export const importa = p => import(pathToFileURL(REPO + p).href)
export const puerta = () => { let abrir; const p = new Promise(r => { abrir = r }); return { p, abrir } }
export const espera = ms => new Promise(r => setTimeout(r, ms))
export const asienta = async (n = 40) => { for (let k = 0; k < n; k++) await new Promise(r => setImmediate(r)) }

let controlesMal = 0, rojos = 0, verdes = 0
// Una excepcion no capturada NO es un hallazgo reproducido: node saldria con 1,
// que es el codigo de «en rojo». Se fuerza el 3 (fallo del arnes o de la prueba).
// (Un process.exit de un script corrido por script-falso.mjs es una SalidaDeScript
// marcada: no es un fallo de la prueba, se ignora aqui.)
for (const ev of ['uncaughtException', 'unhandledRejection']) process.on(ev, e => { if (e?.salidaDeScript) return; console.log(`\n✗ FALLO DE LA PRUEBA (${ev}): ${e?.stack || e}`); process.exit(3) })
export const titulo = t => console.log('\n── ' + t)
export const ver = (d, c, extra = '') => {
  if (!c) controlesMal++
  console.log(`  ${c ? '✓' : '✗ CONTROL ROTO:'} ${d}${extra !== '' ? '  · ' + extra : ''}`)
  return c
}
export function oraculo(id, desc, correcto, cifras = '') {
  correcto ? verdes++ : rojos++
  console.log(`  ${correcto ? '🟢 VERDE' : '🔴 ROJO '} [${id}] ${desc}${cifras !== '' ? '  · ' + cifras : ''}`)
  mkdirSync(REPO + '.pruebas', { recursive: true })
  appendFileSync(REPO + '.pruebas/fase1.jsonl', JSON.stringify({ id, desc, reproducido: !correcto, cifras: String(cifras), fichero: path.basename(process.argv[1]) }) + '\n')
  return correcto
}
// H04 (Astra, 5-oct; bloque D, punto 8): una prueba de aceptacion/, fase1/ o
// historicas/ sin oraculos NO aprueba (codigo 2); y en aceptacion/ tiene que
// llegar al minimo que declara su minimos.json (un fichero sin minimo
// declarado tampoco vale). En el contraste historico (copia en .pruebas/) el
// minimo no se aplica: contra el codigo viejo basta con que haya oraculos.
export const fin = () => {
  console.log(`\n${rojos} en rojo · ${verdes} en verde · ${controlesMal} controles rotos`)
  const fichero = process.argv[1] ? path.resolve(process.argv[1]) : ''
  const carpeta = path.basename(path.dirname(fichero))
  let invalida = ''
  if (['aceptacion', 'fase1', 'historicas', 'motor'].includes(carpeta)) {
    const n = rojos + verdes
    if (n === 0) invalida = 'ningun oraculo: una prueba vacia no aprueba'
    else if ((carpeta === 'aceptacion' || carpeta === 'motor') && !fichero.includes(`${path.sep}.pruebas${path.sep}`)) {
      let minimos = null
      try { minimos = JSON.parse(readFileSync(path.join(path.dirname(fichero), 'minimos.json'), 'utf8')) } catch { minimos = null }
      const min = minimos?.[path.basename(fichero, '.mjs')]
      if (!Number.isInteger(min)) invalida = `sin minimo declarado en ${carpeta}/minimos.json`
      else if (n < min) invalida = `${n} oraculos, por debajo del minimo declarado (${min})`
    }
  }
  if (invalida) { console.log(`✗ RECUENTO (H04): ${invalida}`); process.exit(2) }
  process.exit(controlesMal ? 2 : rojos ? 1 : 0)
}

// ── Escenario: datos INVENTADOS, nunca de alumnos ─────────────────────────
export const A = 'aaaaaaaa-1111-4111-8111-111111111111'
export const B = 'bbbbbbbb-2222-4222-8222-222222222222'
export const ADM = 'dddddddd-9999-4999-8999-999999999999'
export const perfil = (id, extra = {}) => ({ id, email: id.slice(0, 1) + '@ejemplo.test', nombre: 'Alumno ' + id.slice(0, 1).toUpperCase(),
  rol_global: 'user', journal_activo: false, simulador_activo: true, plan: 'basic', created_at: '2026-09-01T00:00:00Z', ...extra })
export const tok = id => 'tok-' + id.slice(0, 1)
export function escenario({ perfiles = [perfil(A), perfil(B), perfil(ADM, { rol_global: 'admin', simulador_activo: false })], sesion = A,
  sim_sessions = [], sim_trades = [], storage = { 'forex-data': {} }, otras = {} } = {}) {
  reset()
  db.tablas.profiles = perfiles.map(p => ({ ...p }))
  db.tablas.sim_sessions = sim_sessions.map(s => ({ ...s }))
  db.tablas.sim_trades = sim_trades.map(t => ({ ...t }))
  for (const [t, filas] of Object.entries(otras)) db.tablas[t] = filas.map(f => ({ ...f }))
  db.storage = structuredClone(storage)
  db.tokens = Object.fromEntries(perfiles.map(p => [tok(p.id), { id: p.id, email: p.email }]))
  db.sesion = sesion ? { user: { id: sesion, email: perfiles.find(p => p.id === sesion)?.email }, access_token: tok(sesion) } : null
  router.navegado.length = 0; router.query = {}; router.oyentes = {}
  api.llamadas.length = 0; resetProveedor()
  nav.alertas.length = 0; nav.destinos.length = 0; nav.confirmar = true; nav.oyentes = {}
  document.hidden = false; document.visibilityState = 'visible'
  retenApi.antes = null; retenApi.pierde = null; retenApi.responde = null
  globalThis.localStorage.clear()
  window.__algSuiteCurrentTime = null; window.__algSuiteSeriesData = null; window.__algSuiteRealDataLen = null
}
let n = 0
export const sesionSim = (extra = {}) => ({ id: 's' + String(++n).padStart(4, '0'), user_id: A, name: 'Sesion ' + n, pair: 'EUR/USD', timeframe: 'H1',
  date_from: '2025-03-03', date_to: '2025-03-07', capital: 10000, balance: 10000, status: 'active', challenge_type: null, challenge_phase: null,
  challenge_parent_id: null, last_timestamp: null, created_at: '2026-09-01T00:00:00Z', ...extra })
export const tradeSim = (extra = {}) => ({ id: 't' + String(++n).padStart(4, '0'), user_id: A, session_id: null, pair: 'EUR/USD', side: 'BUY', lots: 1,
  entry_price: 1.1, exit_price: 1.101, sl_price: 1.099, tp_price: 1.101, rr: 1, pnl: 100, result: 'WIN', notes: null, session_type: null,
  opened_at: '2025-03-03T10:00:00Z', closed_at: '2025-03-03T11:00:00Z', created_at: '2026-09-01T00:00:00Z', ...extra })

// Vela M1 (segundos, como las del simulador)
export const vela = (time, open, high, low, close) => ({ time, open, high, low, close, volume: 1 })

// Lo guardado en forex-data para un año (`base` = 'EURUSD/M1/2026', sin extension),
// como lo leen los lectores (compresion, 5-oct-2026): el .json.gz si esta y, si no,
// el .json. → { formato: 'gz' | 'json' | null, velas: lista | null }
export function guardado(base, bucket = 'forex-data') {
  const b = db.storage[bucket] || {}
  if (Object.hasOwn(b, base + '.json.gz')) return { formato: 'gz', velas: JSON.parse(gunzipSync(Buffer.from(b[base + '.json.gz'])).toString('utf8')) }
  if (Object.hasOwn(b, base + '.json')) return { formato: 'json', velas: JSON.parse(String(b[base + '.json'])) }
  return { formato: null, velas: null }
}

// ── Una SONDA para hooks: monta un componente que solo llama al hook y
// expone lo que devuelve en sonda.valor (siempre el del ultimo pintado).
export function sonda(hook, args) {
  const caja = { valor: null, args }
  function Sonda() { caja.valor = hook(caja.args); return null }
  caja.raiz = monta(Sonda, {})
  caja.repinta = () => caja.raiz.render({ forzar: true })
  return caja
}
export { db, router, api, nav, retenApi, proveedor, jsx, monta }
