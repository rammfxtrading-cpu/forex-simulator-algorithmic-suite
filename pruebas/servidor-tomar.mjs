/**
 * ETAPA 3 · TOMAR EL ESCRITOR («Usar aqui») (diseño sim-004 b.2; persistencia § 4.2,
 * D-16, D-18). Escrito ANTES que el codigo (contra bc2641d: en rojo).
 *
 *   · la intencion: session_id, command_id, epoca, cliente_id (1–100), forzar
 *     (booleano); nada mas (422 carga_invalida);
 *   · contra sim_tomar_escritor REAL (pruebas/montaje-v1.mjs), sobre una sesion
 *     creada por ordenCrear: 200 con el testigo (64 hex, solo esta vez) y
 *     «hasta»; otra pestaña: 409 escritor_ocupado; con forzar, otro testigo;
 *     repetir la misma clave: 200 repetido SIN testigo; otra sesion del alumno
 *     en reproduccion: 409 otra_sesion_activa (D-18); la de otro alumno: 404; una
 *     que no existe: 410; epoca 2: 426;
 *   · POST /api/sim/tomar: apagado sin el interruptor; de punta a punta.
 */
import { cerrojoEnMemoria } from './cerrojo-falso.mjs'
import { titulo, ver, oraculo, fin, importa, escenario, perfil, tok, db } from './lib.mjs'
import { llama } from './supabase-falso.mjs'
import { hayPostgres } from './pg-ensayo.mjs'
import { montajeV1 } from './montaje-v1.mjs'
const P = await importa('lib/mercado/publicador-v1.mjs')
const PV = await importa('lib/mercado/publica-v1.mjs')
const { minutoCerrado } = await importa('lib/mercado/calidad.mjs')
const CR = await importa('lib/servidor/crear.mjs')
const cargar = async p => { try { return await importa(p) } catch { return null } }
const SO = await importa('lib/servidor/sobre.mjs'), TO = await cargar('lib/servidor/tomar.mjs')
const u = k => `00000000-0000-4000-8000-${String(k).padStart(12, '0')}`
const AHORA = Date.parse('2026-10-14T10:00:00Z')
const PARES = SO.PARES
const PX = { AUDCAD: 0.9, AUDUSD: 0.65, EURUSD: 1.1, GBPJPY: 190.5, GBPUSD: 1.3, NZDUSD: 0.6, USDCAD: 1.37, USDCHF: 0.88, USDJPY: 150.2 }
function velas(desde, hasta, px) { const o = []; for (let t = Date.parse(desde + 'T00:00:00Z') / 1000; t < Date.parse(hasta + 'T00:00:00Z') / 1000; t += 60) if (!minutoCerrado(t)) o.push({ time: t, open: px, high: px, low: px, close: px, volume: 1 }); return o }
function almacen() { const o = new Map(); return { o, async lee(r) { return o.has(r) ? Buffer.from(o.get(r)) : null }, async sube(r, b, { upsert = false } = {}) { if (!upsert && o.has(r)) return 'existe'; o.set(r, Buffer.from(b)); return 'ok' }, async borra(r) { o.delete(r) }, async lista() { return [] } } }
const mercado = almacen()
await PV.publica({ cerrojo: cerrojoEnMemoria(), almacen: mercado, planes: PARES.map(par => P.planificaPar({ par, velas: velas('2025-01-06', '2025-01-11', PX[par]), texto: '', anterior: null, diasAceptados: new Map() })), dueno: 'mercado-v1-publica', ahora: '2026-10-14T09:00:00.000Z' })
const crear = (k, o = {}) => ({ session_id: u(1000 + k), command_id: u(2000 + k), epoca: 1, name: 'S' + k, pair: 'EUR/USD', timeframe: 'H1', date_from: '2025-01-01', date_to: '2025-12-31', capital: '10000', challenge_type: null, ...o })
const tomar = (k, o = {}) => ({ session_id: u(1000 + k), command_id: u(3000 + Math.floor(Math.random() * 1e8)), epoca: 1, cliente_id: 'pestana-1', forzar: false, ...o })

titulo('1 · la intencion')
const vt = c => (TO ? TO.validaTomar(c) : { ok: null })
oraculo('TOMA', 'valida', vt(tomar(1)).ok === true, JSON.stringify(vt(tomar(1))))
for (const [que, c, en] of [['testigo en el cuerpo', tomar(1, { testigo: 'x' }), 'testigo'], ['cliente_id vacio', tomar(1, { cliente_id: '' }), 'cliente_id'], ['cliente_id de 101', tomar(1, { cliente_id: 'x'.repeat(101) }), 'cliente_id'], ['forzar no booleano', tomar(1, { forzar: 'si' }), 'forzar'], ['epoca no entera', tomar(1, { epoca: 1.5 }), 'epoca']]) {
  const r = vt(c)
  oraculo('TOMA', `${que}: 422 carga_invalida en «${en}»`, r.ok === false && r.motivo === 'carga_invalida' && r.en === en, JSON.stringify(r))
}

if (!hayPostgres()) { ver('PostgreSQL 17 local: NO hay; la parte contra la RPC real no se ha ejecutado', false); fin() }
const m = montajeV1()
try {
  m.arranca()
  titulo('2 · contra sim_tomar_escritor REAL')
  const d = m.base('t1')
  const AL = u(1), OT = u(2)
  m.alumno(d, AL); m.alumno(d, OT)
  const puertos = { almacen: mercado, rpc: m.rpc(d), ahora: () => AHORA }
  for (const k of [1, 2]) ver(`control: la sesion ${k} creada`, (await CR.ordenCrear({ actor: AL, cuerpo: crear(k), puertos })).http === 201)
  ver('control: la sesion de otro alumno creada', (await CR.ordenCrear({ actor: OT, cuerpo: crear(9), puertos })).http === 201)
  const toma = (c, actor = AL) => (TO ? TO.ordenTomar({ actor, cuerpo: c, puertos }) : Promise.resolve({ http: null }))
  const c1 = tomar(1)
  const r1 = await toma(c1)
  oraculo('TOMA', '200 con el testigo (64 hex, solo esta vez) y «hasta»; la base guarda su hash, no el testigo', r1.http === 200 && /^[0-9a-f]{64}$/.test(r1.cuerpo?.testigo ?? '') && !!r1.cuerpo.hasta && m.uno(d, `select count(*) from public.sim_arrendamientos where session_id = '${u(1001)}' and testigo_hash <> '${r1.cuerpo.testigo}'`) === '1', JSON.stringify(r1).slice(0, 300))
  const rRep = await toma(c1)
  oraculo('TOMA', 'repetir la misma clave (respuesta perdida): 200 repetido, SIN testigo', rRep.http === 200 && rRep.cuerpo?.repetido === true && rRep.cuerpo.testigo === undefined, JSON.stringify(rRep).slice(0, 300))
  const rOtra = await toma(tomar(1, { cliente_id: 'pestana-2' }))
  oraculo('TOMA', 'otra pestaña con el arrendamiento vigente: 409 escritor_ocupado', rOtra.http === 409 && rOtra.cuerpo?.motivo === 'escritor_ocupado', JSON.stringify(rOtra))
  const rF = await toma(tomar(1, { cliente_id: 'pestana-2', forzar: true }))
  oraculo('TOMA', 'con forzar: 200 con otro testigo', rF.http === 200 && /^[0-9a-f]{64}$/.test(rF.cuerpo?.testigo ?? '') && rF.cuerpo.testigo !== r1.cuerpo?.testigo, JSON.stringify(rF).slice(0, 200))
  const rD18 = await toma(tomar(2))
  oraculo('TOMA', 'otra sesion del alumno en reproduccion: 409 otra_sesion_activa (D-18)', rD18.http === 409 && rD18.cuerpo?.motivo === 'otra_sesion_activa', JSON.stringify(rD18))
  const rAj = await toma(tomar(9))
  oraculo('TOMA', 'la sesion de otro alumno: 404 sesion_no_encontrada', rAj.http === 404 && rAj.cuerpo?.motivo === 'sesion_no_encontrada', JSON.stringify(rAj))
  const rNo = await toma(tomar(77))
  oraculo('TOMA', 'una sesion que no existe: 410 sesion_borrada', rNo.http === 410 && rNo.cuerpo?.motivo === 'sesion_borrada', JSON.stringify(rNo))
  const rEp = await toma(tomar(1, { epoca: 2, cliente_id: 'pestana-2' }))
  oraculo('TOMA', 'epoca 2: 426 actualizar_cliente', rEp.http === 426 && rEp.cuerpo?.motivo === 'actualizar_cliente', JSON.stringify(rEp))

  titulo('3 · POST /api/sim/tomar')
  const handler = (await importa('pages/api/sim/tomar.js')).default
  const monta = () => { escenario({ perfiles: [perfil(AL, { simulador_activo: true })] }); db.rpcExterno = m.rpc(d); db.storage.mercado = {} }
  delete process.env.SIM_V1_ENDPOINTS
  monta()
  const rA = await llama(handler, { method: 'POST', token: tok(AL), body: tomar(2, { forzar: true }) })
  oraculo('TOMA', 'sin el interruptor: 503 mantenimiento y nada', rA.estado === 503 && db.log.length === 0, JSON.stringify(rA.cuerpo))
  process.env.SIM_V1_ENDPOINTS = 'encendido'
  monta()
  const rE = await llama(handler, { method: 'POST', token: tok(AL), body: tomar(2, { forzar: true }) })
  oraculo('TOMA', 'de punta a punta con la RPC real: forzar sobre la otra sesion → 200 con testigo, y la primera queda liberada', rE.estado === 200 && /^[0-9a-f]{64}$/.test(rE.cuerpo?.testigo ?? '') && m.uno(d, `select count(*) from public.sim_arrendamientos where user_id = '${AL}'`) === '1', JSON.stringify({ e: rE.estado, c: rE.cuerpo, x: rE.excepcion?.message }).slice(0, 300))
  delete process.env.SIM_V1_ENDPOINTS
  db.rpcExterno = null
} finally { m.cierra() }
fin()
