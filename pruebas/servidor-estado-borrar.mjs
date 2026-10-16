/**
 * ETAPA 3 · /api/sim/estado (S4-07) y /api/sim/borrar (diseño sim-004 b.2, h.11, i.2
 * S4-07, o.8). Escrito ANTES que el codigo (contra 7b8a407: en rojo).
 *
 *   estado: lectura en el SERVIDOR (h.11: el cliente no lee `estado` por RLS) del
 *     snapshot confirmado + version, epoca, terminal, legado y escritor (cliente_id,
 *     hasta; nunca el testigo), para practica y reto v1. Sin RPC. De otro alumno:
 *     404 sin decir nada; no existe o lapida: 410; motor_version 0: 409 no_es_v1.
 *     GET con ?session_id; cuerpo cerrado.
 *   borrar: { session_id } y nada mas; elige por motor_version de la fila leida:
 *     v1 → sim_borrar_sesion (lapida con sus fases), v0 → sim_borrar_legacy; la RPC
 *     vuelve a mirar todo bajo sus bloqueos (no_es_v1 / no_es_legado). Repetir: 410.
 *   S4-07, los select('*') del cliente sobre sim_sessions (dashboard.js, analytics.js,
 *     _SessionInner.js) pasan a una lista de columnas SIN estado ni escritor, y cada
 *     columna de la lista existe en el catalogo (s04 + sim-003 + preparatoria).
 */
import { cerrojoEnMemoria } from './cerrojo-falso.mjs'
import { titulo, ver, oraculo, fin, importa, escenario, perfil, tok, db, fuente } from './lib.mjs'
import { llama } from './supabase-falso.mjs'
import { hayPostgres } from './pg-ensayo.mjs'
import { montajeV1, L } from './montaje-v1.mjs'
const P = await importa('lib/mercado/publicador-v1.mjs')
const PV = await importa('lib/mercado/publica-v1.mjs')
const { minutoCerrado } = await importa('lib/mercado/calidad.mjs')
const CR = await importa('lib/servidor/crear.mjs'), TO = await importa('lib/servidor/tomar.mjs'), SO = await importa('lib/servidor/sobre.mjs')
const cargar = async p => { try { return await importa(p) } catch { return null } }
const ES = await cargar('lib/servidor/estado.mjs'), BO = await cargar('lib/servidor/borrar.mjs')
const u = k => `00000000-0000-4000-8000-${String(k).padStart(12, '0')}`
const AHORA = Date.parse('2026-10-14T10:00:00Z')
const tx = x => JSON.stringify(x, (k, v) => (typeof v === 'bigint' ? `${v}n` : v))

titulo('1 · S4-07: el cliente no pide estado ni escritor')
const FICHEROS = ['pages/dashboard.js', 'pages/analytics.js', 'components/_SessionInner.js']
// la lista: un literal, o la constante COLUMNAS_SESION de lib/sim/columnas.js (resuelta aqui)
const constante = (/COLUMNAS_SESION = '([^']*)'/.exec(fuente('lib/sim/columnas.js') ?? '') ?? [])[1]
const selects = FICHEROS.flatMap(f => [...fuente(f).matchAll(/from\('sim_sessions'\)\.select\((?:'([^']*)'|(COLUMNAS_SESION))/g)].map(x => [f, x[1] ?? constante ?? '(constante sin leer)']))
oraculo('ESTA', 'ningun select(\'*\') del cliente sobre sim_sessions', selects.length >= 3 && !selects.some(([, c]) => c.trim() === '*'), tx(selects))
const columnas = selects.filter(([, c]) => c !== 'id').map(([f, c]) => [f, c.split(',').map(x => x.trim())])
oraculo('ESTA', 'las listas no llevan estado ni escritor', columnas.length >= 3 && columnas.every(([, cs]) => !cs.includes('estado') && !cs.includes('escritor')), tx(columnas))

titulo('2 · las intenciones')
oraculo('ESTA', 'estado: solo session_id (otra clave, 422; sin UUID, 422)', ES && ES.validaEstado({ session_id: u(1) }).ok === true && ES.validaEstado({ session_id: u(1), version: 1 }).en === 'version' && ES.validaEstado({ session_id: 'x' }).en === 'session_id', '')
oraculo('BORR', 'borrar: solo session_id', BO && BO.validaBorrar({ session_id: u(1) }).ok === true && BO.validaBorrar({ session_id: u(1), forzar: true }).en === 'forzar' && BO.validaBorrar({}).en === 'session_id', '')

const PX = { AUDCAD: 0.9, AUDUSD: 0.65, EURUSD: 1.1, GBPJPY: 190.5, GBPUSD: 1.3, NZDUSD: 0.6, USDCAD: 1.37, USDCHF: 0.88, USDJPY: 150.2 }
function velas(par) { const o = []; for (let t = Date.parse('2025-01-06T00:00:00Z') / 1000; t < Date.parse('2025-01-11T00:00:00Z') / 1000; t += 60) if (!minutoCerrado(t)) o.push({ time: t, open: PX[par], high: PX[par], low: PX[par], close: PX[par], volume: 1 }); return o }
function almacen() { const o = new Map(); return { o, async lee(r) { return o.has(r) ? Buffer.from(o.get(r)) : null }, async sube(r, b, { upsert = false } = {}) { if (!upsert && o.has(r)) return 'existe'; o.set(r, Buffer.from(b)); return 'ok' }, async borra(r) { o.delete(r) }, async lista() { return [] } } }
const mercado = almacen()
await PV.publica({ cerrojo: cerrojoEnMemoria(), almacen: mercado, planes: SO.PARES.map(par => P.planificaPar({ par, velas: velas(par), texto: '', anterior: null, diasAceptados: new Map() })), dueno: 'mercado-v1-publica', ahora: '2026-10-14T09:00:00.000Z' })

if (!hayPostgres()) { ver('PostgreSQL 17 local: NO hay; la parte contra la base real no se ha ejecutado', false); fin() }
const pg = montajeV1()
try {
  pg.arranca()
  const d = pg.base('e1')
  const AL = u(1), OT = u(2)
  pg.alumno(d, AL); pg.alumno(d, OT)
  titulo('3 · las columnas de la lista, en el catalogo')
  const cat = new Set(pg.uno(d, `select string_agg(column_name, ',') from information_schema.columns where table_schema = 'public' and table_name = 'sim_sessions'`).split(','))
  const faltan = columnas.flatMap(([f, cs]) => cs.filter(c => !cat.has(c)).map(c => `${f}: ${c}`))
  oraculo('ESTA', 'cada columna pedida existe en sim_sessions (s04 + sim-003 + preparatoria)', columnas.length >= 3 && faltan.length === 0 && cat.has('rev_saldo'), tx(faltan))

  let rpcs = 0
  const rpc = pg.rpc(d)
  const leeSesion = async id => { const t = pg.uno(d, `select row_to_json(s)::text from public.sim_sessions s where id = ${L(id)}`); return t ? JSON.parse(t) : null }
  const pu = { almacen: mercado, rpc: async (n, a) => { rpcs++; return rpc(n, a) }, leeSesion, ahora: () => AHORA }
  const crea = (k, actor, o = {}) => CR.ordenCrear({ actor, cuerpo: { session_id: u(1000 + k), command_id: u(2000 + k), epoca: 1, name: 'S' + k, pair: 'EUR/USD', timeframe: 'H1', date_from: '2025-01-06', date_to: '2025-12-31', capital: '100000', challenge_type: null, ...o }, puertos: pu })
  ver('control: tres sesiones v1 (practica, reto 2F, de otro alumno)', (await crea(1, AL)).http === 201 && (await crea(2, AL, { challenge_type: '2F' })).http === 201 && (await crea(9, OT)).http === 201)
  pg.uno(d, `insert into public.sim_sessions (id, user_id, name, pair, timeframe, date_from, date_to, capital, balance, legado) values (${L(u(1003))}, ${L(AL)}, 'vieja', 'EUR/USD', 'H1', '2025-01-01', '2025-07-01', 10000, 10000, true)`)
  await TO.ordenTomar({ actor: AL, cuerpo: { session_id: u(1001), command_id: u(3001), epoca: 1, cliente_id: 'pestana-1', forzar: false }, puertos: pu })

  titulo('4 · estado')
  const lee = (id, actor = AL) => (ES ? ES.ordenEstado({ actor, cuerpo: { session_id: id }, puertos: pu }) : Promise.resolve({ http: null }))
  rpcs = 0
  const e1 = await lee(u(1001))
  oraculo('ESTA', 'practica: 200 con version 0, epoca 1, terminal null, legado false, el estado (sim-cartera@1) y el escritor (cliente_id, hasta), sin testigo', e1.http === 200 && e1.cuerpo?.version === 0 && e1.cuerpo.epoca === 1 && e1.cuerpo.terminal === null && e1.cuerpo.legado === false && e1.cuerpo.estado?.esquema === 'sim-cartera@1' && e1.cuerpo.escritor?.cliente_id === 'pestana-1' && !/testigo/.test(tx(e1.cuerpo)), tx(e1).slice(0, 300))
  const e2 = await lee(u(1002))
  oraculo('ESTA', 'reto: 200 con reto@1', e2.http === 200 && e2.cuerpo?.estado?.esquema === 'reto@1', tx(e2).slice(0, 200))
  const e9 = await lee(u(1009))
  oraculo('ESTA', 'la de otro alumno: 404 sesion_no_encontrada, sin estado', e9.http === 404 && e9.cuerpo?.motivo === 'sesion_no_encontrada' && !('estado' in (e9.cuerpo ?? {})), tx(e9))
  const eNo = await lee(u(1077))
  oraculo('ESTA', 'una que no existe: 410 sesion_borrada', eNo.http === 410 && eNo.cuerpo?.motivo === 'sesion_borrada', tx(eNo))
  const eV = await lee(u(1003))
  oraculo('ESTA', 'una v0 (legado): 409 no_es_v1', eV.http === 409 && eV.cuerpo?.motivo === 'no_es_v1', tx(eV))
  oraculo('ESTA', 'leer no llama a ninguna RPC', rpcs === 0, String(rpcs))

  titulo('5 · borrar')
  const borra = (id, actor = AL) => (BO ? BO.ordenBorrar({ actor, cuerpo: { session_id: id }, puertos: pu }) : Promise.resolve({ http: null }))
  const bA = await borra(u(1009))
  oraculo('BORR', 'la de otro alumno: 404, y sigue entera', bA.http === 404 && pg.uno(d, `select coalesce(terminal, '-') from public.sim_sessions where id = ${L(u(1009))}`) === '-', tx(bA))
  const b1 = await borra(u(1001))
  oraculo('BORR', 'v1: 200 por sim_borrar_sesion; lapida (terminal borrada, sin estado ni arrendamiento)', b1.http === 200 && b1.cuerpo?.ok === true && pg.uno(d, `select terminal || ' ' || (estado is null) from public.sim_sessions where id = ${L(u(1001))}`) === 'borrada true' && pg.uno(d, `select count(*) from public.sim_arrendamientos where session_id = ${L(u(1001))}`) === '0', tx(b1))
  const b1b = await borra(u(1001))
  oraculo('BORR', 'otra vez: 410 sesion_borrada', b1b.http === 410 && b1b.cuerpo?.motivo === 'sesion_borrada', tx(b1b))
  const e1b = await lee(u(1001))
  oraculo('ESTA', 'el estado de una lapida: 410', e1b.http === 410, tx(e1b))
  const bV = await borra(u(1003))
  oraculo('BORR', 'legado (v0): 200 por sim_borrar_legacy', bV.http === 200 && bV.cuerpo?.ok === true && pg.uno(d, `select coalesce(terminal, '-') from public.sim_sessions where id = ${L(u(1003))}`) === 'borrada', tx(bV))

  titulo('6 · por la URL')
  const hE = (await importa('pages/api/sim/estado.js')).default, hB = (await importa('pages/api/sim/borrar.js')).default
  const espejo = id => { escenario({ perfiles: [perfil(AL, { simulador_activo: true })], sim_sessions: [JSON.parse(pg.uno(d, `select row_to_json(s)::text from public.sim_sessions s where id = ${L(id)}`))] }); db.rpcExterno = rpc }
  delete process.env.SIM_V1_ENDPOINTS
  espejo(u(1002))
  const off = await llama(hE, { method: 'GET', token: tok(AL), query: { session_id: u(1002) } })
  oraculo('ESTA', 'sin el interruptor: estado 503 apagado (literal) y nada', off.estado === 503 && JSON.stringify(off.cuerpo) === '{"ok":false,"http":503,"motivo":"apagado"}' && db.log.length === 0, tx(off.cuerpo))
  process.env.SIM_V1_ENDPOINTS = 'encendido'
  espejo(u(1002))
  const on = await llama(hE, { method: 'GET', token: tok(AL), query: { session_id: u(1002) } })
  oraculo('ESTA', 'GET /api/sim/estado?session_id: 200 con el reto, no-store', on.estado === 200 && on.cuerpo?.estado?.esquema === 'reto@1' && on.cabeceras['cache-control'] === 'no-store', tx({ e: on.estado, x: on.excepcion?.message, c: on.cuerpo }).slice(0, 300))
  const post = await llama(hE, { method: 'POST', token: tok(AL), body: { session_id: u(1002) } })
  oraculo('ESTA', 'POST a estado: 405', post.estado === 405, String(post.estado))
  espejo(u(1002))
  const bb = await llama(hB, { method: 'POST', token: tok(AL), body: { session_id: u(1002) } })
  oraculo('BORR', 'POST /api/sim/borrar de punta a punta: 200 y lapida en la base real', bb.estado === 200 && pg.uno(d, `select terminal from public.sim_sessions where id = ${L(u(1002))}`) === 'borrada', tx({ e: bb.estado, c: bb.cuerpo, x: bb.excepcion?.message }))
  delete process.env.SIM_V1_ENDPOINTS
  db.rpcExterno = null
} finally { pg.cierra() }
fin()
