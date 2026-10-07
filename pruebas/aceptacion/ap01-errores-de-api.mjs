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
import { titulo, oraculo, fin, escenario, importa, db, A, B, ADM, tok, perfil, sesionSim, tradeSim } from '../lib.mjs'
import { llama } from '../supabase-falso.mjs'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { REPO } from '../lib.mjs'
import { createRequire } from 'node:module'
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

titulo('6 · todos los retornos tempranos de las diez rutas (Astra, 7-oct: W-01/W-02 no los cubria nadie)')
// (a) barrido ESTATICO con el compilador de TypeScript (node_modules, via Next):
//     TS2448/2449/2450/2454 = variable usada antes de declararse o asignarse.
//     Control positivo: un fragmento con el fallo de W-01 tiene que dar TS2448.
const ts = createRequire(REPO + 'package.json')('typescript')
const usosAntes = (ficheros, extra = {}) => {
  const host = ts.createCompilerHost({}); const leer = host.readFile.bind(host), existe = host.fileExists.bind(host)
  host.readFile = f => (Object.hasOwn(extra, f) ? extra[f] : leer(f)); host.fileExists = f => Object.hasOwn(extra, f) || existe(f)
  host.getSourceFile = (f, v) => { const t = host.readFile(f); return t == null ? undefined : ts.createSourceFile(f, t, v, true) }
  const prog = ts.createProgram([...ficheros, ...Object.keys(extra)], { allowJs: true, checkJs: true, noEmit: true, jsx: ts.JsxEmit.Preserve, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, noResolve: true, types: [] }, host)
  return ts.getPreEmitDiagnostics(prog).filter(d => [2448, 2449, 2450, 2454].includes(d.code) && d.file).map(d => `${d.file.fileName.replace(REPO, '')}:${d.file.getLineAndCharacterOfPosition(d.start).line + 1} TS${d.code}`)
}
const controlTdz = usosAntes([], { '/control-tdz.js': "export default async function h(req, res) {\n  if (req.x) { console.log(iErr); return res.status(409).json({}) }\n  const { error: iErr } = await req.y()\n}\n" })
const rutasApi = []
const recorreApi = d => { for (const n of readdirSync(d)) { const p = d + '/' + n; if (statSync(p).isDirectory()) recorreApi(p); else if (/\.m?js$/.test(n)) rutasApi.push(p) } }
recorreApi(REPO + 'pages/api')
const tdz = usosAntes(rutasApi)
oraculo('AP01', `barrido estatico (TypeScript) de las ${rutasApi.length} rutas: ninguna variable usada antes de declararse (control positivo: el fragmento de W-01 da TS2448)`, controlTdz.length === 1 && /TS2448/.test(controlTdz[0]) && tdz.length === 0, `control ${JSON.stringify(controlTdz)} · rutas ${JSON.stringify(tdz)}`)

// (b) pasada DINAMICA: cada retorno temprano de cada ruta, con su codigo, un JSON
//     con «error» y sin excepcion. Los fallos de base, con db.falla.
const H = {}
for (const r of ['admin/alumno-sim/[id]', 'admin/enviar-mensaje', 'admin/list-alumnos-sim', 'admin/set-plan-sim', 'admin/toggle-acceso-sim', 'admin/wipe-simulador', 'candles', 'challenge/advance', 'challenge/create', 'challenge/status']) H[r] = (await importa(`pages/api/${r}.js`)).default
const NADIE = 'eeeeeeee-0000-4000-8000-000000000000'
const ses = (id, extra) => sesionSim({ id, challenge_type: '2F', challenge_phase: 1, capital: 100000, balance: 110000, ...extra })
const base = () => escenario({ sesion: A, storage: { 'forex-data': {} },
  sim_sessions: [ses('reto'), ses('reto-bajo'), ses('normal', { challenge_type: null }), ses('cerrado', { status: 'passed_phase' }), ses('raro', { challenge_type: 'XX' }), ses('ajena', { user_id: B })],
  sim_trades: [tradeSim({ session_id: 'reto', pnl: 10000, result: 'WIN', closed_at: '2025-03-04T12:00:00Z' }), tradeSim({ session_id: 'reto-bajo', pnl: 100, result: 'WIN', closed_at: '2025-03-04T12:00:00Z' })] })
const falla = pred => () => { db.falla = c => (pred(c) ? { message: `fallo ${MARCA}`, code: '57014' } : null) }
const Q = { pair: 'EURUSD', timeframe: 'M1', from: '1767571200', to: '1767657600', year: '2026' }
const AV = { session_id: 'reto', outcome: 'pass', end_timestamp: 1741100000 }
const CR = { challenge_type: '2F', capital: 100000, pair: 'EUR/USD', timeframe: 'H1', date_from: '2025-03-03', date_to: '2025-03-07' }
// NOTA (7-oct, encontrado al ejecutar esta pasada; NO arreglado: fuera del
// encargo): set-plan-sim y toggle-acceso-sim con un usuario que no existe dan 500,
// no su 404: .update().select().single() sin filas devuelve el error PGRST116 y
// entra por la rama de error. Igual que en c470c8f. Aqui se exige el
// comportamiento ACTUAL controlado (500 con mensaje fijo, sin excepcion).
// [ruta, que, metodo, token, body|query, codigo, prepara?]
const casos = [
  ['admin/alumno-sim/[id]', 'metodo', 'POST', ADM, { id: A }, 405], ['admin/alumno-sim/[id]', 'sin token', 'GET', null, { id: A }, 401], ['admin/alumno-sim/[id]', 'sin id', 'GET', ADM, {}, 400], ['admin/alumno-sim/[id]', 'no existe', 'GET', ADM, { id: NADIE }, 404],
  ['admin/alumno-sim/[id]', 'sesiones en error', 'GET', ADM, { id: A }, 500, falla(c => c.tabla === 'sim_sessions' && c.op === 'select')], ['admin/alumno-sim/[id]', 'trades en error', 'GET', ADM, { id: A }, 500, falla(c => String(c.tabla).startsWith('rpc:sim_trades'))],
  ['admin/enviar-mensaje', 'metodo', 'GET', ADM, {}, 405], ['admin/enviar-mensaje', 'sin token', 'POST', null, {}, 401], ['admin/enviar-mensaje', 'sin destinatario', 'POST', ADM, {}, 400], ['admin/enviar-mensaje', 'sin asunto', 'POST', ADM, { to_user_id: A }, 400],
  ['admin/enviar-mensaje', 'sin cuerpo', 'POST', ADM, { to_user_id: A, subject: 'x' }, 400], ['admin/enviar-mensaje', 'a si mismo', 'POST', ADM, { to_user_id: ADM, subject: 'x', body: 'y' }, 400], ['admin/enviar-mensaje', 'insercion en error', 'POST', ADM, { to_user_id: A, subject: 'x', body: 'y' }, 500, falla(c => c.tabla === 'messages' && c.op === 'insert')],
  ['admin/list-alumnos-sim', 'metodo', 'POST', ADM, {}, 405], ['admin/list-alumnos-sim', 'sin token', 'GET', null, {}, 401], ['admin/list-alumnos-sim', 'sesiones en error', 'GET', ADM, {}, 503, falla(c => c.tabla === 'sim_sessions' && c.op === 'select')],
  ['admin/set-plan-sim', 'metodo', 'GET', ADM, {}, 405], ['admin/set-plan-sim', 'sin token', 'POST', null, {}, 401], ['admin/set-plan-sim', 'sin user_id', 'POST', ADM, {}, 400], ['admin/set-plan-sim', 'plan raro', 'POST', ADM, { user_id: A, plan: 'zz' }, 400],
  ['admin/set-plan-sim', 'update en error', 'POST', ADM, { user_id: A, plan: 'basic' }, 500, falla(c => c.tabla === 'profiles' && c.op === 'update')], ['admin/set-plan-sim', 'no existe (hoy 500: ver nota)', 'POST', ADM, { user_id: NADIE, plan: 'basic' }, 500],
  ['admin/toggle-acceso-sim', 'metodo', 'GET', ADM, {}, 405], ['admin/toggle-acceso-sim', 'sin token', 'POST', null, {}, 401], ['admin/toggle-acceso-sim', 'sin user_id', 'POST', ADM, {}, 400], ['admin/toggle-acceso-sim', 'no booleano', 'POST', ADM, { user_id: A }, 400],
  ['admin/toggle-acceso-sim', 'a si mismo', 'POST', ADM, { user_id: ADM, simulador_activo: false }, 403], ['admin/toggle-acceso-sim', 'update en error', 'POST', ADM, { user_id: A, simulador_activo: true }, 500, falla(c => c.tabla === 'profiles' && c.op === 'update')], ['admin/toggle-acceso-sim', 'no existe (hoy 500: ver nota)', 'POST', ADM, { user_id: NADIE, simulador_activo: true }, 500],
  ['admin/wipe-simulador', 'metodo', 'GET', ADM, {}, 405], ['admin/wipe-simulador', 'sin token', 'POST', null, {}, 401], ['admin/wipe-simulador', 'sin user_id', 'POST', ADM, {}, 400], ['admin/wipe-simulador', 'sin confirmacion', 'POST', ADM, { user_id: A }, 400],
  ['admin/wipe-simulador', 'a si mismo', 'POST', ADM, { user_id: ADM, confirm_email: 'x' }, 403], ['admin/wipe-simulador', 'no existe', 'POST', ADM, { user_id: NADIE, confirm_email: 'x' }, 404], ['admin/wipe-simulador', 'email distinto', 'POST', ADM, { user_id: A, confirm_email: 'otro@ejemplo.test' }, 400],
  ['admin/wipe-simulador', 'quitar acceso en error', 'POST', ADM, { user_id: A, confirm_email: 'a@ejemplo.test' }, 500, falla(c => c.tabla === 'profiles' && c.op === 'update')], ['admin/wipe-simulador', 'borrado en error', 'POST', ADM, { user_id: A, confirm_email: 'a@ejemplo.test' }, 500, falla(c => c.op === 'delete')],
  ['candles', 'metodo', 'POST', A, Q, 405], ['candles', 'sin token', 'GET', null, Q, 401], ['candles', 'sin parametros', 'GET', A, {}, 400], ['candles', 'par raro', 'GET', A, { ...Q, pair: 'XXXYYY' }, 400], ['candles', 'timeframe raro', 'GET', A, { ...Q, timeframe: 'Z9' }, 400],
  ['candles', 'from no entero', 'GET', A, { ...Q, from: 'abc' }, 400], ['candles', 'rango al reves', 'GET', A, { ...Q, to: '1767571100' }, 400], ['candles', 'año raro', 'GET', A, { ...Q, year: '1999' }, 400],
  ['candles', 'lectura en error', 'GET', A, Q, 503, falla(c => String(c.tabla).startsWith('storage'))], ['candles', 'año sin publicar', 'GET', A, Q, 503],
  ['challenge/advance', 'metodo', 'GET', A, AV, 405], ['challenge/advance', 'sin token', 'POST', null, AV, 401], ['challenge/advance', 'sin session_id', 'POST', A, {}, 400], ['challenge/advance', 'outcome raro', 'POST', A, { session_id: 'reto' }, 400],
  ['challenge/advance', 'sin end_timestamp', 'POST', A, { session_id: 'reto', outcome: 'pass' }, 400], ['challenge/advance', 'end_timestamp futuro', 'POST', A, { ...AV, end_timestamp: 4102444800 }, 400], ['challenge/advance', 'no existe', 'POST', A, { ...AV, session_id: 'nada' }, 404],
  ['challenge/advance', 'ajena', 'POST', A, { ...AV, session_id: 'ajena' }, 403], ['challenge/advance', 'no es reto', 'POST', A, { ...AV, session_id: 'normal' }, 400], ['challenge/advance', 'ya cerrada (W-01)', 'POST', A, { ...AV, session_id: 'cerrado' }, 409],
  ['challenge/advance', 'tipo raro', 'POST', A, { ...AV, session_id: 'raro' }, 500], ['challenge/advance', 'trades en error', 'POST', A, AV, 503, falla(c => String(c.tabla).startsWith('rpc:sim_trades'))], ['challenge/advance', 'sin llegar al objetivo', 'POST', A, { ...AV, session_id: 'reto-bajo' }, 400],
  ['challenge/advance', 'cierre en error', 'POST', A, AV, 500, falla(c => c.tabla === 'sim_sessions' && c.op === 'update')], ['challenge/advance', 'fase siguiente en error', 'POST', A, AV, 500, falla(c => c.tabla === 'sim_sessions' && c.op === 'insert')],
  ['challenge/create', 'metodo', 'GET', A, CR, 405], ['challenge/create', 'sin token', 'POST', null, CR, 401], ['challenge/create', 'tipo raro', 'POST', A, { ...CR, challenge_type: 'ZZ' }, 400], ['challenge/create', 'capital raro', 'POST', A, { ...CR, capital: 7 }, 400],
  ['challenge/create', 'sin par', 'POST', A, { ...CR, pair: '' }, 400], ['challenge/create', 'sin timeframe', 'POST', A, { ...CR, timeframe: '' }, 400], ['challenge/create', 'sin desde', 'POST', A, { ...CR, date_from: '' }, 400], ['challenge/create', 'sin hasta', 'POST', A, { ...CR, date_to: '' }, 400],
  ['challenge/create', 'fechas al reves', 'POST', A, { ...CR, date_from: '2025-03-07', date_to: '2025-03-03' }, 400], ['challenge/create', 'insercion en error', 'POST', A, CR, 500, falla(c => c.tabla === 'sim_sessions' && c.op === 'insert')],
  ['challenge/status', 'metodo', 'POST', A, { session_id: 'reto' }, 405], ['challenge/status', 'sin token', 'GET', null, { session_id: 'reto' }, 401], ['challenge/status', 'sin session_id', 'GET', A, {}, 400], ['challenge/status', 'no existe', 'GET', A, { session_id: 'nada' }, 404],
  ['challenge/status', 'ajena', 'GET', A, { session_id: 'ajena' }, 403], ['challenge/status', 'no es reto', 'GET', A, { session_id: 'normal' }, 400], ['challenge/status', 'tipo raro', 'GET', A, { session_id: 'raro' }, 500], ['challenge/status', 'trades en error', 'GET', A, { session_id: 'reto' }, 503, falla(c => String(c.tabla).startsWith('rpc:sim_trades'))],
]
const malos = [], rutasVistas = new Set()
for (const [ruta, que, metodo, token, datos, esperado, prepara] of casos) {
  base(); prepara?.()
  const r = await llama(H[ruta], { method: metodo, token: token ? tok(token) : null, ...(metodo === 'GET' ? { query: datos } : { body: datos, query: ruta.endsWith('[id]') ? datos : {} }) })
  db.falla = null
  rutasVistas.add(ruta)
  if (r.excepcion || r.estado !== esperado || typeof r.cuerpo?.error !== 'string' || JSON.stringify(r.cuerpo).includes(MARCA)) malos.push(`${ruta} «${que}»: ${r.excepcion ? 'EXCEPCION ' + r.excepcion.name : r.estado} (esperado ${esperado})`)
}
oraculo('AP01', `${casos.length} retornos tempranos de las ${rutasVistas.size} rutas: cada uno con su codigo, un «error» controlado y sin excepcion`, rutasVistas.size === 10 && malos.length === 0, malos.join(' · ') || `${casos.length} casos`)

titulo('7 · W-03 (Astra, 7-oct): el 503 de un año sin publicar no promete nada')
escenario({ perfiles: [perfil(A)], storage: { 'forex-data': {} } })
const w3 = await llama(candles, { method: 'GET', token: tok(A), query: { pair: 'EURUSD', timeframe: 'M1', from: '1767571200', to: '1767657600', year: '2026' } })
oraculo('AP01', 'año sin publicar: 503 que dice que no esta disponible, sin prometer actualizacion ni plazo', w3.estado === 503 && /no esta disponible/i.test(w3.cuerpo?.error ?? '') && !/actualizaci|se publica|prueba mas tarde|mañana|pronto|diaria/i.test(w3.cuerpo?.error ?? ''), `${w3.estado} · ${w3.cuerpo?.error}`)

titulo('8 · barrido de pages/api')
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
