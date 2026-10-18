/**
 * ETAPA 3 · PASAR DE FASE: lib/servidor/fase.mjs y POST /api/sim/avanzar-fase (diseño sim-004
 * b.2, j.7, j.8; decisiones del CTO del 14-oct, q.10 d y e). Escrito ANTES que el codigo.
 *
 * Contra la RPC REAL con sim-004b aplicada en el ensayo (sim_avanzar_fase generalizada):
 *   · 3F: la madre supera la fase 1 con el motor (un cierre por TP en el minuto t); la hija
 *     (fase 2) empieza en t + 60 (d: el minuto del cierre es de la madre), con las mismas
 *     reglas y capital, la cartera de los nueve pares nueva y el mercado VIGENTE al pasar
 *     (e: se publica una version nueva antes de pasar; la hija la fija y la deja anotada en
 *     su recibo; la madre no se toca);
 *   · 2 → 3 igual; la fase 3 superada → completado (superado, sin hija);
 *   · objetivo alcanzado sobre cerrados con una posicion abierta: 409 posiciones_abiertas,
 *     sin llamar a la RPC y sin tocar nada (j.7); sin objetivo: 409 fase_no_superada;
 *   · repetido con la misma clave tras una respuesta perdida; version vieja: la RPC decide;
 *   · la intencion cerrada; por la URL, apagado sin el interruptor y de punta a punta.
 */
import { cerrojoEnMemoria } from './cerrojo-falso.mjs'
import { titulo, ver, oraculo, fin, importa, escenario, perfil, tok, db, REPO } from './lib.mjs'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { llama } from './supabase-falso.mjs'
import { hayPostgres } from './pg-ensayo.mjs'
import { montajeV1, L, conUidDelMontaje } from './montaje-v1.mjs'
const P = await importa('lib/mercado/publicador-v1.mjs')
const PV = await importa('lib/mercado/publica-v1.mjs')
const CA = await importa('lib/motor/cartera.mjs')
const M = await importa('lib/motor/motor.mjs')
const RT = await importa('lib/motor/reto.mjs')
const { COSTES_1 } = await importa('lib/motor/costes.mjs')
const { minutoCerrado } = await importa('lib/mercado/calidad.mjs')
const SO = await importa('lib/servidor/sobre.mjs'), CR = await importa('lib/servidor/crear.mjs')
const ME = await importa('lib/servidor/mercado.mjs')
let FA = null
try { FA = await importa('lib/servidor/fase.mjs') } catch { FA = null }
// R3E3B-02: la ficha de auth.uid() de produccion, por la del montaje (la unica adaptacion; montaje-v1.mjs)
const S4B = conUidDelMontaje(readFileSync(path.join(REPO, 'sql/sim-004b-contrato-v1.sql'), 'utf8'))
const u = k => `00000000-0000-4000-8000-${String(k).padStart(12, '0')}`
const U = iso => Date.parse(iso) / 1000
const tx = x => JSON.stringify(x, (k, v) => (typeof v === 'bigint' ? `${v}n` : v))
const AHORA = Date.parse('2026-10-14T10:00:00Z')

// el mercado v1.1 (del 6 al 10 de enero) y, despues, la continuacion v1.2 (hasta el 17)
const PX = { AUDCAD: 0.9, AUDUSD: 0.65, EURUSD: 1.1, GBPJPY: 190.5, GBPUSD: 1.3, NZDUSD: 0.6, USDCAD: 1.37, USDCHF: 0.88, USDJPY: 150.2 }
function velas(par, hasta) { const o = []; for (let t = U('2025-01-06T00:00:00Z'); t < U(hasta + 'T00:00:00Z'); t += 60) if (!minutoCerrado(t)) o.push({ time: t, open: PX[par], high: PX[par], low: PX[par], close: PX[par], volume: 1 }); return o }
function almacen() { const o = new Map(); return { o, async lee(r) { return o.has(r) ? Buffer.from(o.get(r)) : null }, async sube(r, b, { upsert = false } = {}) { if (!upsert && o.has(r)) return 'existe'; o.set(r, Buffer.from(b)); return 'ok' }, async borra(r) { o.delete(r) }, async lista() { return [] } } }
const mercado = almacen()
await PV.publica({ cerrojo: cerrojoEnMemoria(), almacen: mercado, planes: SO.PARES.map(par => P.planificaPar({ par, velas: velas(par, '2025-01-11'), texto: '', anterior: null, diasAceptados: new Map() })), dueno: 'mercado-v1-publica', ahora: '2026-10-14T09:00:00.000Z' })
const v11 = (await ME.manifiestosVigentes(mercado, SO.PARES)).fijados
async function publicaV12() {
  const planes = []
  for (const par of SO.PARES) planes.push(P.planificaPar({ par, velas: velas(par, '2025-01-18'), texto: '', anterior: await PV.manifiestoVigente(mercado, par), diasAceptados: new Map() }))
  await PV.publica({ cerrojo: cerrojoEnMemoria(), almacen: mercado, planes, dueno: 'mercado-v1-publica', ahora: '2026-10-14T09:30:00.000Z' })
  return (await ME.manifiestosVigentes(mercado, SO.PARES)).fijados
}

// un reto 3F (fase k) llevado por el motor hasta superar, o hasta el objetivo con una posicion abierta
const T = U('2025-01-06T10:00:00Z')
const plana = p => [p, p, p, p]
function madre({ fase = 1, abierta = false, superar = true }) {
  const i = SO.validaCrear({ session_id: u(9), command_id: u(9), epoca: 1, name: 'R', pair: 'EUR/USD', timeframe: 'H1', date_from: '2025-01-06', date_to: '2025-12-31', capital: '100000', challenge_type: '3F' }, { ahora: AHORA }).intencion
  let r = CR.estadoInicial(i, v11).estado
  if (fase !== 1) r = RT.creaReto({ motor: CA.crea({ pares: SO.PARES, costes: COSTES_1, capital: '100000', mercado: v11 }), fase, inicio: U('2025-01-06T00:00:00Z'), reglas: RT.SUITE_3F })
  const vs = { EURUSD: M.velas('EURUSD', [plana('1.10000'), superar ? ['1.10000', '1.20000', '1.10000', '1.20000'] : plana('1.10000')].map((v, k) => ({ time: T + 60 * k, open: v[0], high: v[1], low: v[2], close: v[3] }))) }
  r = RT.avanzaReto(r, T, vs).reto
  r = RT.aplicaReto(r, { tipo: 'abrir', par: 'EURUSD', lado: 'BUY', orden: 'mercado', lotes: '1', cotizadoEn: T, tp: '1.20000' }).reto
  if (abierta) r = RT.aplicaReto(r, { tipo: 'abrir', par: 'EURUSD', lado: 'BUY', orden: 'mercado', lotes: '0.01', cotizadoEn: T }).reto
  r = RT.avanzaReto(r, T + 60, vs).reto
  return r
}

titulo('1 · la intencion')
const vf = c => (FA ? FA.validaFase(c) : { ok: null })
const ok = { padre_id: u(1), hija_id: u(2), command_id: u(3), epoca: 1, version_esperada: 0 }
oraculo('FASE', 'valida, con hija y sin ella (la ultima fase: hija_id null)', vf(ok).ok === true && vf({ ...ok, hija_id: null }).ok === true, tx(vf(ok)))
for (const [que, c, en] of [['estado en el cuerpo', { ...ok, estado: {} }, 'estado'], ['padre sin UUID', { ...ok, padre_id: 'x' }, 'padre_id'], ['hija sin UUID', { ...ok, hija_id: 'x' }, 'hija_id'], ['version negativa', { ...ok, version_esperada: -1 }, 'version_esperada'], ['la hija igual que el padre', { ...ok, hija_id: u(1) }, 'hija_id']]) {
  const r = vf(c)
  oraculo('FASE', `${que}: 422 carga_invalida en «${en}»`, r.ok === false && r.motivo === 'carga_invalida' && r.en === en, tx(r))
}
const m0 = madre({})
ver('control: la madre 3F de fase 1 supera con el TP del minuto 1 (motor real)', m0.estado === 'superada' && (m0.superada?.en?.vela ?? m0.superada?.en?.t) === T + 60, tx({ e: m0.estado, en: m0.superada?.en }))

if (!hayPostgres()) { ver('PostgreSQL 17 local: NO hay; la parte contra la RPC real no se ha ejecutado', false); fin() }
const pg = montajeV1()
try {
  pg.arranca()
  const d = pg.base('f1'); pg.comoEjecutor(d, S4B)
  const AL = u(1)
  pg.alumno(d, AL)
  const leeSesion = async id => { const t = pg.uno(d, `select row_to_json(s)::text from public.sim_sessions s where id = ${L(id)}`); return t ? JSON.parse(t) : null }
  let rpcs = 0
  const rpc = pg.rpc(d)
  const pu = { almacen: mercado, rpc: async (n, a) => { rpcs++; return rpc(n, a) }, leeSesion, ahora: () => AHORA }
  const pasa = (c, actor = AL) => (FA ? FA.ordenFase({ actor, cuerpo: c, puertos: pu }) : Promise.resolve({ http: null }))
  const fila = id => { const t = pg.uno(d, `select row_to_json(s)::text from (select terminal, status, version, challenge_phase, challenge_parent_id, mercado, estado from public.sim_sessions where id = ${L(id)}) s`); return t ? JSON.parse(t) : null }
  // la madre: creada por la RPC y con el estado del motor (superada), como la dejaria un comando
  const R1 = u(101)
  ver('control: la madre 3F creada', (await CR.ordenCrear({ actor: AL, cuerpo: { session_id: R1, command_id: u(201), epoca: 1, name: 'R', pair: 'EUR/USD', timeframe: 'H1', date_from: '2025-01-06', date_to: '2025-12-31', capital: '100000', challenge_type: '3F' }, puertos: pu })).http === 201)
  const pon = (id, r) => pg.uno(d, `update public.sim_sessions set estado = ${L(CA.serializa(r))}::jsonb where id = ${L(id)}`)

  titulo('2 · los rechazos de j.7, sin RPC')
  pon(R1, madre({ abierta: true }))
  const mAb = madre({ abierta: true })
  ver('control: con una posicion abierta el motor no concede (saldo cerrado ≥ objetivo y en curso)', mAb.estado === 'en_curso' && mAb.motor.saldo_µ >= mAb.objetivo_µ && mAb.motor.posiciones.length === 1)
  rpcs = 0
  const antes = tx(fila(R1))
  const pa = await pasa({ padre_id: R1, hija_id: u(102), command_id: u(301), epoca: 1, version_esperada: 0 })
  oraculo('FASE', 'objetivo alcanzado con una posicion abierta: 409 posiciones_abiertas, sin RPC y sin tocar nada', pa.http === 409 && pa.cuerpo?.motivo === 'posiciones_abiertas' && rpcs === 0 && tx(fila(R1)) === antes, tx(pa))
  pon(R1, madre({ superar: false }))
  const nf = await pasa({ padre_id: R1, hija_id: u(102), command_id: u(302), epoca: 1, version_esperada: 0 })
  oraculo('FASE', 'sin objetivo: 409 fase_no_superada, sin RPC', nf.http === 409 && nf.cuerpo?.motivo === 'fase_no_superada' && rpcs === 0, tx(nf))

  titulo('3 · 1 → 2: la hija empieza en el minuto siguiente y fija el mercado vigente')
  pon(R1, m0)
  const v12 = await publicaV12()
  ver('control: el mercado vigente cambio (v1.2) y la madre fija v1.1', v12.EURUSD !== v11.EURUSD && fila(R1)?.mercado?.EURUSD === v11.EURUSD)
  const madreAntes = tx(fila(R1))
  const CMD = u(303)
  const p12 = await pasa({ padre_id: R1, hija_id: u(102), command_id: CMD, epoca: 1, version_esperada: 0 })
  const h = fila(u(102))
  const he = h ? CA.deserializa(JSON.stringify(h.estado)) : null
  oraculo('FASE', 'hija fase 2 (201): reto@1 suite-3f, inicio = minuto del cierre + 60, capital 100.000, cartera nueva de los nueve pares', p12.http === 201 && he?.esquema === 'reto@1' && he.reglas === 'suite-3f@2026-10-12' && he.fase === 2 && he.inicio === T + 120 && he.capital_inicial_µ === 100_000_000_000n && he.motor.pares.length === 9 && he.motor.posiciones.length === 0 && he.motor.reloj.cursor === null && h.challenge_phase === 2, tx({ p12, h: he && { fase: he.fase, inicio: he.inicio, reglas: he.reglas } }).slice(0, 500))
  oraculo('FASE', 'la hija fija el mercado VIGENTE al pasar (v1.2) en el estado y en la columna, y lo deja anotado en su recibo', he?.motor?.versiones?.mercado?.EURUSD === v12.EURUSD && h.mercado?.USDJPY === v12.USDJPY && p12.cuerpo?.recibo?.resumen?.mercado?.EURUSD === v12.EURUSD, tx({ e: he?.motor?.versiones?.mercado?.EURUSD, c: h?.mercado?.EURUSD, r: p12.cuerpo?.recibo?.resumen }).slice(0, 400))
  const madreDespues = fila(R1)
  oraculo('FASE', 'la madre no se toca: su estado y su mercado, igual (solo su status pasa a passed_phase, la RPC)', tx(madreDespues.estado) === tx(JSON.parse(madreAntes).estado) && tx(madreDespues.mercado) === tx(JSON.parse(madreAntes).mercado) && madreDespues.status === 'passed_phase', tx({ s: madreDespues.status }))
  const rep = await pasa({ padre_id: R1, hija_id: u(102), command_id: CMD, epoca: 1, version_esperada: 0 })
  oraculo('FASE', 'la misma clave otra vez (respuesta perdida): 200 repetido, sin otra hija', rep.http === 200 && rep.cuerpo?.repetido === true && pg.uno(d, `select count(*) from public.sim_sessions where challenge_parent_id = ${L(R1)}`) === '1', tx(rep))

  titulo('4 · 2 → 3 y el completado')
  const m2 = madre({ fase: 2 })
  pon(u(102), m2)
  const p23 = await pasa({ padre_id: u(102), hija_id: u(103), command_id: u(304), epoca: 1, version_esperada: 0 })
  oraculo('FASE', '2 → 3: la hija fase 3 (201)', p23.http === 201 && fila(u(103))?.challenge_phase === 3, tx(p23))
  pon(u(103), madre({ fase: 3 }))
  const sinHija = await pasa({ padre_id: u(103), hija_id: u(104), command_id: u(305), epoca: 1, version_esperada: 0 })
  oraculo('FASE', 'la ultima fase con una hija pedida: 422 carga_invalida en hija_id, sin RPC', sinHija.http === 422 && sinHija.cuerpo?.en === 'hija_id', tx(sinHija))
  const fin3 = await pasa({ padre_id: u(103), hija_id: null, command_id: u(306), epoca: 1, version_esperada: 0 })
  oraculo('FASE', 'fase 3 superada: completado (200), superado, passed_all, version 1, sin hija', fin3.http === 200 && fila(u(103))?.terminal === 'superado' && fila(u(103))?.status === 'passed_all' && fila(u(103))?.version === 1 && pg.uno(d, `select count(*) from public.sim_sessions where challenge_parent_id = ${L(u(103))}`) === '0', tx(fin3))
  const fin3b = await pasa({ padre_id: u(103), hija_id: null, command_id: u(307), epoca: 1, version_esperada: 1 })
  oraculo('FASE', 'otra clave sobre superado: 409 solo_lectura (la RPC)', fin3b.http === 409 && fin3b.cuerpo?.motivo === 'solo_lectura', tx(fin3b))
  const fin3c = await pasa({ padre_id: u(103), hija_id: null, command_id: u(306), epoca: 1, version_esperada: 0 })
  oraculo('FASE', 'la misma clave del completado: 200 repetido (no se recalcula: la version leida ya no es la esperada)', fin3c.http === 200 && fin3c.cuerpo?.repetido === true, tx(fin3c))

  titulo('5 · por la URL')
  const handler = (await importa('pages/api/sim/avanzar-fase.js')).default
  const espejo = id => { escenario({ perfiles: [perfil(AL, { simulador_activo: true })], sim_sessions: [JSON.parse(pg.uno(d, `select row_to_json(s)::text from public.sim_sessions s where id = ${L(id)}`))] }); db.rpcExterno = rpc; db.storage.mercado = Object.fromEntries([...mercado.o].map(([k, v]) => [k, Buffer.from(v)])) }
  const R2 = u(111)
  await CR.ordenCrear({ actor: AL, cuerpo: { session_id: R2, command_id: u(211), epoca: 1, name: 'R2', pair: 'EUR/USD', timeframe: 'H1', date_from: '2025-01-06', date_to: '2025-12-31', capital: '100000', challenge_type: '3F' }, puertos: pu })
  pon(R2, m0)
  delete process.env.SIM_V1_ENDPOINTS
  espejo(R2)
  const off = await llama(handler, { method: 'POST', token: tok(AL), body: { padre_id: R2, hija_id: u(112), command_id: u(311), epoca: 1, version_esperada: 0 } })
  oraculo('FASE', 'sin el interruptor: 503 apagado (literal) y nada', off.estado === 503 && JSON.stringify(off.cuerpo) === '{"ok":false,"http":503,"motivo":"apagado"}' && db.log.length === 0, tx(off.cuerpo))
  process.env.SIM_V1_ENDPOINTS = 'encendido'
  espejo(R2)
  const on = await llama(handler, { method: 'POST', token: tok(AL), body: { padre_id: R2, hija_id: u(112), command_id: u(311), epoca: 1, version_esperada: 0 } })
  oraculo('FASE', 'de punta a punta: 201 y la hija en la base real', on.estado === 201 && fila(u(112))?.challenge_phase === 2, tx({ e: on.estado, c: on.cuerpo, x: on.excepcion?.message }).slice(0, 300))
  delete process.env.SIM_V1_ENDPOINTS
  db.rpcExterno = null
} finally { pg.cierra() }
fin()
