/**
 * AP01 · LAS RUTAS DE pages/api NO DEVUELVEN NI REGISTRAN EL message DE UN ERROR
 * (CTO, 6-oct-2026, sobre 4030318; cierra G-APP)
 *
 * pages/api/candles.js:165 respondia el 500 inesperado con { error: e.message }
 * y registraba el error entero. El mismo patron, en las demas rutas: 19 sitios
 * devolvian `detail: <error>.message` (admin y challenge). El texto de un error
 * lo escribe quien lo lanza (storage-js, PostgREST, fetch) y puede llevar
 * rutas, URLs o datos. Decision del CTO: mensaje fijo al cliente y, en el log
 * del servidor, solo clase y codigo (lib/mercado/errores.mjs).
 *
 * ORACULOS: con un marcador dentro del mensaje del error,
 *   candles: 500 con mensaje fijo, sin el marcador en la respuesta ni en el log,
 *   y el log dice la clase;
 *   admin/list-alumnos-sim (503) y challenge/status (503): sin el marcador en
 *   la respuesta ni en el log;
 *   barrido: ninguna ruta de pages/api pone un .message en una respuesta ni
 *   registra un error entero (console.* con el objeto del error).
 */
import { titulo, oraculo, fin, escenario, importa, db, A, ADM, tok, perfil, sesionSim, tradeSim } from '../lib.mjs'
import { llama } from '../supabase-falso.mjs'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { REPO } from '../lib.mjs'
const MARCA = 'SECRETO-API-7c1e'
const candles = (await importa('pages/api/candles.js')).default
const listaAlumnos = (await importa('pages/api/admin/list-alumnos-sim.js')).default
const status = (await importa('pages/api/challenge/status.js')).default

// lo que el servidor escribe en su log durante una llamada
async function conLog(f) {
  const lineas = [], orig = { e: console.error, w: console.warn, l: console.log }
  const toma = (...a) => lineas.push(a.map(x => (typeof x === 'string' ? x : x instanceof Error ? `${x.name}: ${x.message}\n${x.stack}` : JSON.stringify(x))).join(' '))
  console.error = toma; console.warn = toma
  try { const r = await f(); return { r, log: lineas } } finally { console.error = orig.e; console.warn = orig.w }
}
const limpio = (r, log) => !JSON.stringify(r?.cuerpo ?? '').includes(MARCA) && !log.some(l => l.includes(MARCA))

titulo('1 · candles: un 500 inesperado')
escenario({ perfiles: [perfil(A)], storage: { 'forex-data': { 'EURUSD/M1/2026.json': '[]' } } })
db.pausa = async c => { if (c.op === 'info') throw new TypeError(`fetch failed https://x.supabase.co/storage/v1/object/info?k=${MARCA}`) }
const { r: r1, log: l1 } = await conLog(() => llama(candles, { method: 'GET', token: tok(A), query: { pair: 'EURUSD', timeframe: 'M1', from: String(Date.UTC(2026, 0, 5) / 1000), to: String(Date.UTC(2026, 0, 6) / 1000), year: '2026' } }))
db.pausa = null
oraculo('AP01', 'candles: 500 con un mensaje fijo, sin el texto del error', r1.estado === 500 && typeof r1.cuerpo?.error === 'string' && !r1.cuerpo.error.includes(MARCA) && !/fetch failed/.test(r1.cuerpo.error), `${r1.estado} · ${JSON.stringify(r1.cuerpo)}`)
oraculo('AP01', 'candles: el log del servidor dice la clase (TypeError) y no el mensaje', l1.some(l => /\[candles\]/.test(l) && /TypeError/.test(l)) && !l1.some(l => l.includes(MARCA) || /fetch failed/.test(l)), l1.join(' | ').slice(0, 300))

titulo('2 · admin/list-alumnos-sim: los trades en error (503)')
escenario({ perfiles: [perfil(ADM, { rol_global: 'admin' }), perfil(A)], sesion: ADM, sim_sessions: [sesionSim({})], sim_trades: [tradeSim({})] })
db.falla = c => (c.tabla === 'sim_trades' && c.op === 'select') || String(c.tabla).startsWith('rpc:sim_trades') ? { message: `upstream ${MARCA}`, code: '57014' } : null
const { r: r2, log: l2 } = await conLog(() => llama(listaAlumnos, { method: 'GET', token: tok(ADM) }))
db.falla = null
oraculo('AP01', 'list-alumnos-sim: 503 sin el mensaje del error en la respuesta ni en el log', r2.estado === 503 && limpio(r2, l2), `${r2.estado} · ${JSON.stringify(r2.cuerpo)} · log: ${l2.join(' | ').slice(0, 200)}`)

titulo('3 · challenge/status: las operaciones en error (503)')
const reto = sesionSim({ id: 'reto-x', challenge_type: '2F', challenge_phase: 1, capital: 100000, balance: 100000 })
escenario({ perfiles: [perfil(A)], sim_sessions: [reto], sim_trades: [tradeSim({ session_id: 'reto-x' })] })
db.falla = c => (c.tabla === 'sim_trades' && c.op === 'select') || String(c.tabla).startsWith('rpc:sim_trades') ? { message: `upstream ${MARCA}`, code: '57014' } : null
const { r: r3, log: l3 } = await conLog(() => llama(status, { method: 'GET', token: tok(A), query: { session_id: 'reto-x' } }))
db.falla = null
oraculo('AP01', 'challenge/status: 503 sin el mensaje del error en la respuesta ni en el log', r3.estado === 503 && limpio(r3, l3), `${r3.estado} · ${JSON.stringify(r3.cuerpo)} · log: ${l3.join(' | ').slice(0, 200)}`)

titulo('4 · W-01 (Astra, 7-oct): reintentar el cierre de un reto ya cerrado')
// H4 dejo registra(iErr) en el retorno de «sesion ya cerrada», antes de declararse
// iErr: ReferenceError y 500 en vez del 409 controlado. Reintento sobre una fase
// cerrada de cada tipo y la respuesta perdida (el cierre se aplico; se repite).
const advance = (await importa('pages/api/challenge/advance.js')).default
const escrituras = () => db.log.filter(l => ['insert', 'update', 'delete', 'upsert'].includes(l.op) && !String(l.tabla).startsWith('storage')).length
const retoCerrado = status => { escenario({ perfiles: [perfil(A)], sim_sessions: [sesionSim({ id: 'reto-c', challenge_type: '2F', challenge_phase: 1, capital: 100000, balance: 110000, status })], sim_trades: [tradeSim({ session_id: 'reto-c', pnl: 10000, result: 'WIN', closed_at: '2025-03-04T12:00:00Z' })] }) }
const avanza = (id, outcome = 'pass') => llama(advance, { method: 'POST', token: tok(A), body: { session_id: id, outcome, end_timestamp: 1741100000 } })
const vistos409 = {}
for (const st of ['passed_phase', 'failed_dd_total', 'passed_all']) {
  retoCerrado(st)
  const antes = escrituras()
  let r
  try { r = await avanza('reto-c') } catch (e) { r = { estado: 'lanzo ' + (e?.name ?? 'Error') } }
  vistos409[st] = `${r.estado}${r.cuerpo?.currentStatus ? ' ' + r.cuerpo.currentStatus : ''} · ${escrituras() - antes} escrituras`
}
oraculo('AP01', 'reintento sobre passed_phase, failed_dd_total y passed_all: 409 controlado (con su estado) y cero escrituras', Object.entries(vistos409).every(([st, v]) => v === `409 ${st} · 0 escrituras`), JSON.stringify(vistos409))
escenario({ perfiles: [perfil(A)], sim_sessions: [sesionSim({ id: 'reto-p', challenge_type: '2F', challenge_phase: 1, capital: 100000, balance: 110000 })], sim_trades: [tradeSim({ session_id: 'reto-p', pnl: 10000, result: 'WIN', closed_at: '2025-03-04T12:00:00Z' })] })
const primero = await avanza('reto-p')
const antesRe = escrituras()
let re
try { re = await avanza('reto-p') } catch (e) { re = { estado: 'lanzo ' + (e?.name ?? 'Error') } }
const hijas = db.tablas.sim_sessions.filter(x => x.challenge_parent_id === 'reto-p').length
oraculo('AP01', 'respuesta perdida: el cierre se aplico (phase_passed); el reintento responde 409 sin escribir y sigue habiendo una sola fase hija', primero.estado === 200 && re.estado === 409 && re.cuerpo?.currentStatus === 'passed_phase' && escrituras() === antesRe && hijas === 1, `1.º ${primero.estado} ${primero.cuerpo?.action ?? ''} · reintento ${re.estado} · ${escrituras() - antesRe} escrituras · ${hijas} hija(s)`)

titulo('5 · W-02 (Astra, 7-oct): el admin intenta borrar sus propios datos del simulador')
// H4 dejo registra(toggleErr) en la autoproteccion, antes de declararse
// toggleErr: ReferenceError y 500 en vez de 403.
const wipe = (await importa('pages/api/admin/wipe-simulador.js')).default
escenario({ perfiles: [perfil(ADM, { rol_global: 'admin', email: 'adm@ejemplo.test' })], sesion: ADM, sim_sessions: [sesionSim({ user_id: ADM })] })
const tablasTocadas = () => db.log.filter(l => ['insert', 'update', 'delete', 'upsert'].includes(l.op)).map(l => `${l.op} ${l.tabla}`)
let rw
try { rw = await llama(wipe, { method: 'POST', token: tok(ADM), body: { user_id: ADM, confirm_email: 'adm@ejemplo.test' } }) } catch (e) { rw = { estado: 'lanzo ' + (e?.name ?? 'Error') } }
oraculo('AP01', 'autoborrado: 403 con su mensaje y ninguna tabla tocada', rw.estado === 403 && /propios datos/.test(rw.cuerpo?.error ?? '') && tablasTocadas().length === 0, `${rw.estado} · ${JSON.stringify(rw.cuerpo)} · ${tablasTocadas().join(', ') || 'nada tocado'}`)

titulo('6 · barrido de pages/api')
const rutas = []
const recorre = d => { for (const n of readdirSync(d)) { const p = d + '/' + n; if (statSync(p).isDirectory()) recorre(p); else if (/\.m?js$/.test(n)) rutas.push(p) } }
recorre(REPO + 'pages/api')
const malas = []
for (const p of rutas) {
  const lineas = readFileSync(p, 'utf8').split('\n')
  lineas.forEach((l, i) => {
    if (/^\s*\/\//.test(l)) return
    // un .message que viaja a la respuesta (en la linea de un .json( o como detail:)
    if (/\.message\b/.test(l) && (/\.json\(/.test(l) || /\b(detail|error)\s*:/.test(l))) malas.push(`${p.slice(REPO.length)}:${i + 1}`)
    // un error entero al log
    if (/console\.(error|warn|log)\([^)]*,\s*(e|err|error)\s*\)/.test(l)) malas.push(`${p.slice(REPO.length)}:${i + 1} (log del error entero)`)
  })
}
oraculo('AP01', `ninguna de las ${rutas.length} rutas devuelve un .message ni registra el error entero`, rutas.length >= 10 && malas.length === 0, malas.join(' · '))
fin()
