/**
 * V1C12 · DOS APERTURAS SOLAPADAS: CADA UNA CON SU IDENTIFICADOR Y SU DIBUJO (PSIMM1-02 de Astra, ALTA; orden 1-175 del
 * CTO). Escrita ANTES que el arreglo (en d3fa792: en rojo). La reproduccion de Astra: revisiones-suite/2026-10-30-psimm1-
 * evidencias/propias-pantalla.mjs, propias-dibujos.mjs y propias-pg.mjs.
 * La regla del CTO: cada apertura lleva su propio identificador local desde que se pulsa hasta que el servidor confirma,
 * sin compartir estado. Borrar el dibujo de una pendiente la cancela en el servidor (o no deja borrarlo hasta que se
 * cancele). Nunca una orden viva sin dibujo.
 *   A · (transporte sintetico) dos aperturas a mercado sin esperar la primera; antes de confirmar, sobre el id
 *       provisional de la SEGUNDA: el tirador del SL (modificar), cerrar; y sobre el de la PRIMERA, el tirador. Cada
 *       comando llega al servidor con el id de SU posicion (p2 o p1) y se aplica. Dos limit solapadas: cancelar la
 *       segunda provisional cancela o2 y deja o1. Control secuencial (ver)
 *   B · (lib/servidor REAL + PostgreSQL desechable; los hooks REALES del banco: useTradingActions.cancelaOrdenesDeDibujos,
 *       como al borrar en la pagina) dos limit nacidas de los dibujos D1 y D2, sin esperar la primera:
 *       · confirmadas las dos, cada pendiente lleva SU dibujo (D1 y D2)
 *       · borrar D2 tras confirmar: el cancelar llega con el id de la segunda; en el servidor solo queda la de D1, con D1
 *       · borrar D2 con las dos aun en vuelo: confirmadas, en el servidor solo queda la de D1
 *       · borrar D1 con las dos en vuelo: en el servidor solo queda la de D2, que sigue con D2
 *       · (Astra, escenario A con PG) dos aperturas a mercado y el SL de la segunda provisional a 1,07: p2 queda en 1,07
 *   S · en todo B: checkSLTP, checkLimitOrders, checkChallengeBreach, rutaComun y cierreEnVela no se llaman
 * Datos inventados. Sin red.
 */
import { register } from 'node:module'
register('../espias-vela.mjs', import.meta.url)
const { titulo, ver, oraculo, fin, importa, fuente, asienta, escenario } = await import('../lib.mjs')
const N = 12
const PA = await importa('lib/sim/v1/pantalla.js').catch(() => null)
const HOOK = await importa('components/useSesionV1.js').catch(() => null)
if (!PA?.creaPantallaV1 || !HOOK?.default) { for (let i = 0; i < N; i++) oraculo('V1C12', `caso ${i}: sin la pantalla v1 no se puede`, false, 'no esta'); fin() }
const tx = x => JSON.stringify(x, (k, v) => (typeof v === 'bigint' ? `${v}n` : v))
const web = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) } }
const T0 = 1736121900
const ticks = x => (x == null ? null : String(Math.round(Number(x) * 1e5)))

// el servidor sintetico (como la RPC: version esperada, recibo con version_partida y version_resultante); la PRIMERA
// peticion de comando se retiene hasta suelta()
function servidor() {
  const s = { version: 0, estado: { esquema: 'cartera@1', estado: 'activo', pares: ['EURUSD'], reloj: { cursor: T0 }, saldo_µ: '100000000000', posiciones: [], ordenes: [],
    cotizaciones: { EURUSD: { bid: '110000' } }, costes: { spread_ticks: { EURUSD: '3' } } } }
  let abre, retener = true
  const puerta = new Promise(r => { abre = r })
  const x = { s, comandos: [], seq: 0, conflictos: 0, suelta: () => abre() }
  x.llama = async (ruta, { cuerpo: c }) => {
    if (ruta.endsWith('/tomar')) return { http: 200, cuerpo: { ok: true, testigo: 'ensayo' } }
    if (ruta.endsWith('/estado')) return { http: 200, cuerpo: { ok: true, version: s.version, epoca: 1, estado: structuredClone(s.estado) } }
    x.comandos.push({ tipo: c.tipo, id: c.id ?? null })
    if (retener) { retener = false; await puerta }
    if (c.version_esperada !== s.version) { x.conflictos++; return { http: 409, cuerpo: { ok: false, motivo: 'conflicto', version: s.version } } }
    const partida = s.version, e = s.estado
    if (c.tipo === 'abrir' && c.orden === 'mercado') e.posiciones.push({ id: 'p' + ++x.seq, par: 'EURUSD', lado: c.lado, entrada: '110003', lotes_c: '100', sl: ticks(c.sl), tp: ticks(c.tp) })
    else if (c.tipo === 'abrir') e.ordenes.push({ id: 'o' + ++x.seq, par: 'EURUSD', lado: c.lado, tipo: c.orden, precio: ticks(c.precio), lotes_c: '100', sl: ticks(c.sl), tp: ticks(c.tp) })
    else if (c.tipo === 'cerrar') e.posiciones = e.posiciones.filter(p => p.id !== c.id)
    else if (c.tipo === 'cancelar') e.ordenes = e.ordenes.filter(o => o.id !== c.id)
    else if (c.tipo === 'modificar') { for (const p of [...e.posiciones, ...e.ordenes]) if (p.id === c.id) { if ('sl' in c) p.sl = ticks(c.sl); if ('tp' in c) p.tp = ticks(c.tp) } }
    s.version++
    return { http: 200, cuerpo: { ok: true, version: s.version, recibo: { resultado: 'aceptado', version_partida: partida, version_resultante: s.version } } }
  }
  return x
}
async function pantalla(x) {
  let n = 0
  const ps = { current: {} }, avisos = []
  const p = PA.creaPantallaV1({ sessionId: 'sesion-ficticia', sesion: {}, usuario: 'alumno-ficticio', nuevoId: () => `id-${++n}`, local: web(), almacenSesion: web(), pairState: ps, llama: x.llama, avisa: a => avisos.push(a), plazoMs: 2000 })
  await p.arranca()
  return { p, ps, avisos, pos: () => ps.current['EUR/USD']?.positions ?? [], ord: () => ps.current['EUR/USD']?.orders ?? [] }
}
const MERCADO = { tipo: 'abrir', carga: { par: 'EURUSD', lado: 'BUY', orden: 'mercado', lotes: '1', sl: '1.09' } }
const LIMIT = { tipo: 'abrir', carga: { par: 'EURUSD', lado: 'BUY', orden: 'limit', precio: '1.09', lotes: '1', sl: '1.08' } }

titulo('A · dos aperturas a mercado solapadas: cada id provisional lleva a SU posicion')
{
  // control secuencial (la primera confirmada antes de la segunda)
  const x = servidor(), v = await pantalla(x)
  const a = v.p.envia(MERCADO); x.suelta(); await a
  const b = v.p.envia(MERCADO); const id = v.pos().at(-1).id
  const m = v.p.envia({ tipo: 'modificar', carga: { id, sl: '1.07' } })
  const r = await Promise.all([b, m])
  ver('control secuencial: el tirador de la segunda provisional se aplica a p2 (SL 1,07)', r.every(q => q.conclusion === 'confirmado') && tx(x.s.estado.posiciones.map(p => [p.id, p.sl])) === tx([['p1', '109000'], ['p2', '107000']]), tx({ r: r.map(q => q.conclusion), srv: x.s.estado.posiciones }))
}
{
  const x = servidor(), v = await pantalla(x)
  const a = v.p.envia(MERCADO), b = v.p.envia(MERCADO)
  const [i1, i2] = v.pos().map(p => p.id)
  const m2 = v.p.envia({ tipo: 'modificar', carga: { id: i2, sl: '1.07' } })
  const m1 = v.p.envia({ tipo: 'modificar', carga: { id: i1, sl: '1.085' } })
  x.suelta()
  const r = await Promise.all([a, b, m2, m1])
  const res = { r: r.map(q => q.conclusion), motivos: r.map(q => q.motivo ?? null), provisionales: [i1, i2], comandos: x.comandos, srv: x.s.estado.posiciones.map(p => [p.id, p.sl]) }
  oraculo('V1C12', 'A · el tirador del SL sobre la SEGUNDA provisional (antes de confirmar) llega como modificar p2 y se aplica (p2 SL 1,07)', r[2].conclusion === 'confirmado' && x.comandos.some(c => c.tipo === 'modificar' && c.id === 'p2') && x.s.estado.posiciones.find(p => p.id === 'p2')?.sl === '107000', tx(res))
  oraculo('V1C12', 'A · y el de la PRIMERA llega como modificar p1 (p1 SL 1,085): cada provisional tiene su id, sin compartir', r[3].conclusion === 'confirmado' && x.s.estado.posiciones.find(p => p.id === 'p1')?.sl === '108500', tx(res))
  oraculo('V1C12', 'A · la pantalla = el servidor al final (p1 1,085 y p2 1,07), sin avisos', tx(v.pos().map(p => [p.id, p.sl])) === tx([['p1', 1.085], ['p2', 1.07]]) && v.avisos.length === 0, tx({ pos: v.pos().map(p => [p.id, p.sl]), avisos: v.avisos }))
}
{
  const x = servidor(), v = await pantalla(x)
  const a = v.p.envia(MERCADO), b = v.p.envia(MERCADO)
  const i2 = v.pos().at(-1).id
  const c = v.p.envia({ tipo: 'cerrar', carga: { id: i2 } })
  x.suelta()
  const r = await Promise.all([a, b, c])
  oraculo('V1C12', 'A · cerrar la SEGUNDA provisional antes de confirmar: llega como cerrar p2; en el servidor y en la pantalla solo queda p1', r[2].conclusion === 'confirmado' && x.comandos.some(q => q.tipo === 'cerrar' && q.id === 'p2') && tx(x.s.estado.posiciones.map(p => p.id)) === tx(['p1']) && tx(v.pos().map(p => p.id)) === tx(['p1']), tx({ r: r.map(q => q.conclusion), comandos: x.comandos, srv: x.s.estado.posiciones.map(p => p.id) }))
}
{
  const x = servidor(), v = await pantalla(x)
  const a = v.p.envia(LIMIT), b = v.p.envia(LIMIT)
  const i2 = v.ord().at(-1).id
  const c = v.p.envia({ tipo: 'cancelar', carga: { id: i2 } })
  x.suelta()
  const r = await Promise.all([a, b, c])
  oraculo('V1C12', 'A · cancelar la SEGUNDA limit provisional antes de confirmar: llega como cancelar o2; queda solo o1 (servidor y pantalla)', r[2].conclusion === 'confirmado' && x.comandos.some(q => q.tipo === 'cancelar' && q.id === 'o2') && tx(x.s.estado.ordenes.map(o => o.id)) === tx(['o1']) && tx(v.ord().map(o => o.id)) === tx(['o1']), tx({ r: r.map(q => q.conclusion), comandos: x.comandos, srv: x.s.estado.ordenes.map(o => o.id) }))
}

// B · lib/servidor REAL, PostgreSQL desechable y los hooks reales del banco
const { hayPostgres } = await import('../pg-ensayo.mjs')
if (!hayPostgres()) { ver('PostgreSQL 17 local: NO hay', false); fin() }
const { banco, velasEnStorage } = await import('../banco-motor.mjs')
const { montajeV1, L, conUidDelMontaje } = await import('../montaje-v1.mjs')
const { cerrojoEnMemoria } = await import('../cerrojo-falso.mjs')
const OR = await importa('lib/sim/v1/ordenes.js'), VI = await importa('lib/sim/v1/vista.js')
const P = await importa('lib/mercado/publicador-v1.mjs'), PV = await importa('lib/mercado/publica-v1.mjs')
const { minutoCerrado } = await importa('lib/mercado/calidad.mjs')
const CR = await importa('lib/servidor/crear.mjs'), TO = await importa('lib/servidor/tomar.mjs'), SO = await importa('lib/servidor/sobre.mjs')
const CO = await importa('lib/servidor/comando.mjs'), ES = await importa('lib/servidor/estado.mjs')
const HUECO = "v_guarda pg_catalog.text := '⟦HUECO guarda canonica⟧';"
const deEnsayo = t => { if (t.split(HUECO).length !== 2) throw new Error('el hueco no esta una vez'); return t.replace(HUECO, "v_guarda pg_catalog.text := 'montaje de ensayo (v1c12)';") }
const S4B = conUidDelMontaje(fuente('sql/sim-004b-contrato-v1.sql')), S6 = deEnsayo(fuente('sql/sim-006-tope-de-pasos.sql'))
const u = k => `00000000-0000-4000-8000-${String(k).padStart(12, '0')}`
const M0 = Date.parse('2025-01-06T00:00:00Z') / 1000, m = k => M0 + 60 * k
const PX = { AUDCAD: 0.9, AUDUSD: 0.65, EURUSD: 1.1, GBPJPY: 190.5, GBPUSD: 1.3, NZDUSD: 0.6, USDCAD: 1.37, USDCHF: 0.88, USDJPY: 150.2 }
function velasDe(par) { const o = []; for (let t = M0; t < M0 + 5 * 86400; t += 60) if (!minutoCerrado(t)) o.push({ time: t, open: PX[par], high: PX[par], low: PX[par], close: PX[par], volume: 1 }); return o }
function almacen() { const o = new Map(); return { async lee(r) { return o.has(r) ? Buffer.from(o.get(r)) : null }, async sube(r, b, { upsert = false } = {}) { if (!upsert && o.has(r)) return 'existe'; o.set(r, Buffer.from(b)); return 'ok' }, async borra(r) { o.delete(r) }, async lista() { return [] } } }
const mercado = almacen()
await PV.publica({ cerrojo: cerrojoEnMemoria(), almacen: mercado, planes: SO.PARES.map(par => P.planificaPar({ par, velas: velasDe(par), texto: '', anterior: null, diasAceptados: new Map() })), dueno: 'mercado-v1-publica', ahora: '2026-10-14T09:00:00.000Z' })
const AL = u(1)
let nId = 94000
const nuevoId = () => u(++nId)
const cuenta = {}
const espia = (n, f) => (typeof f !== 'function' ? f : (...a) => { cuenta[n] = (cuenta[n] ?? 0) + 1; return f(...a) })
const espias = () => ({ ...cuenta, ...(globalThis.__espiasVela ?? {}) })
const sinCierres = () => { const e = espias(); return ['checkSLTP', 'checkLimitOrders', 'checkChallengeBreach', 'rutaComun', 'cierreEnVela'].every(k => !e[k]) }
escenario({})
velasEnStorage('EUR/USD', velasDe('EURUSD'), [2024], { tramoAbierto: true })

const pg = montajeV1()
try {
  pg.arranca()
  const d = 'v1c12'
  pg.base(d)
  const a4 = pg.comoEjecutor(d, S4B), a6 = pg.comoEjecutor(d, S6)
  ver('control: sim-004b y sim-006 aplicadas', a4.ok && a6.ok, (a4.err + a6.err).slice(0, 200))
  pg.alumno(d, AL)
  const uno = q => pg.uno(d, q)
  const leeSesion = async id => { const t = uno(`select row_to_json(s)::text from public.sim_sessions s where id = ${L(id)}`); return t ? JSON.parse(t) : null }
  const puertos = { almacen: mercado, rpc: pg.rpc(d), parDeId: pg.parDeId(d), leeSesion, ahora: () => Date.parse('2026-10-14T10:00:00Z') }
  const orden = { '/api/sim/crear': CR.ordenCrear, '/api/sim/tomar': TO.ordenTomar, '/api/sim/comando': CO.ordenComando, '/api/sim/estado': ES.ordenEstado }
  const enviados = []
  let retenerPrimera = false
  const colas = []
  async function llama(ruta, { cuerpo }) {
    if (ruta === '/api/sim/comando' && cuerpo?.tipo !== 'avanzar') {
      enviados.push({ tipo: cuerpo?.tipo, id: cuerpo?.id ?? null })
      if (retenerPrimera) { retenerPrimera = false; await new Promise(r => colas.push(r)) }
    }
    const r = await orden[ruta]({ actor: AL, cuerpo, puertos })
    if (r.http === 429 && r.cuerpo?.motivo === 'demasiados_avances') uno('update public.sim_alumnos set siguiente_avance_desde = null')
    return { http: r.http, cuerpo: r.cuerpo }
  }
  const suelta = () => { for (const r of colas.splice(0)) r() }
  let nS = 7100
  async function pagina() {
    const sid = u(++nS)
    const c = await llama('/api/sim/crear', { cuerpo: { session_id: sid, command_id: nuevoId(), epoca: 1, name: 'S', pair: 'EUR/USD', timeframe: 'M1', date_from: '2025-01-06', date_to: '2025-12-31', capital: '100000', challenge_type: null } })
    ver(`control: practica creada (${sid.slice(-4)})`, c.http === 201, tx(c))
    uno("update public.sim_arrendamientos set hasta = now() - interval '1 minute'")
    process.env.NEXT_PUBLIC_SIM_V1_PANTALLA = 'encendido'
    const b = await banco({ sesion: await leeSesion(sid), userId: AL, espia, v1: { puertos: { llama, nuevoId, local: web(), almacenSesion: web(), plazoMs: 5000, leeTrades: async () => [], buscaHija: async () => null } } })
    for (let k = 0; k < 50 && !b.ps()?.ready; k++) { await asienta(20); await b.repinta() }
    await b.refs.v1Ref.current?.arranca()
    await b.repinta()
    await b.refs.v1Ref.current.avance({ engine: () => b.motor(), par: () => b.estado.activa }).irA(m(2))
    return { b, sid }
  }
  const asentado = async b => { await b.refs.v1Ref.current.cliente.recupera(); await asienta(60); await b.repinta() }
  const srv = async sid => (await leeSesion(sid)).estado.ordenes.map(o => o.id)
  // el onConfirm del OrderModal en modo v1 (_SessionInner), con el id del dibujo en lo que se pinta
  const limitDelDibujo = (pv, entry, dibujo) => pv.envia(OR.comandoAbrir({ pair: 'EUR/USD', side: 'BUY_LIMIT', entry, lots: 1, sl: entry - 0.01, tp: entry + 0.02, cursor: pv.cursor() }), { entry, openTime: m(2), dibujo })
  const SI = fuente('components/_SessionInner.js')
  ver('control: el onConfirm del OrderModal v1 de _SessionInner manda { entry, openTime, dibujo } (lo que copia la prueba)', SI.includes('{entry:entradaTick,openTime:currentTime,dibujo:m.dibujo??null}'))
  const conDibujo = b => b.ps().orders.map(o => [o.id, o.dibujo ?? null])

  titulo('B · control secuencial (la primera confirmada antes de la segunda)')
  {
    const { b, sid } = await pagina()
    const pv = b.refs.v1Ref.current, TR = b.caja.valor.trading
    await limitDelDibujo(pv, 1.095, 'D1'); await limitDelDibujo(pv, 1.094, 'D2'); await asentado(b)
    const antes = conDibujo(b)
    enviados.length = 0
    await TR.cancelaOrdenesDeDibujos(['D2']); await asentado(b)
    ver('control secuencial: cada limit con su dibujo y borrar D2 cancela la segunda', tx(antes.map(x => x[1])) === tx(['D1', 'D2']) && enviados.some(e => e.tipo === 'cancelar') && (await srv(sid)).length === 1, tx({ antes, enviados, srv: await srv(sid) }))
  }

  titulo('B · dos limit de los dibujos D1 y D2, sin esperar la primera')
  {
    const { b, sid } = await pagina()
    const pv = b.refs.v1Ref.current, TR = b.caja.valor.trading
    retenerPrimera = true
    const a = limitDelDibujo(pv, 1.095, 'D1'), c = limitDelDibujo(pv, 1.094, 'D2')
    await asienta(10); suelta()
    const r = await Promise.all([a, c]); await asentado(b)
    const antes = conDibujo(b), ids = await srv(sid)
    oraculo('V1C12', 'B · confirmadas las dos, cada pendiente lleva SU dibujo (D1 y D2), con su id del servidor', r.every(q => q.conclusion === 'confirmado') && ids.length === 2 && tx(antes) === tx([[ids[0], 'D1'], [ids[1], 'D2']]), tx({ r: r.map(q => q.conclusion), antes, ids }))
    enviados.length = 0
    await TR.cancelaOrdenesDeDibujos(['D2']); await asentado(b)
    oraculo('V1C12', 'B · borrar D2 tras confirmar: el cancelar llega con el id de la segunda; en el servidor queda solo la de D1, que sigue con D1',
      tx(enviados) === tx([{ tipo: 'cancelar', id: ids[1] }]) && tx(await srv(sid)) === tx([ids[0]]) && tx(conDibujo(b)) === tx([[ids[0], 'D1']]), tx({ enviados, srv: await srv(sid), pantalla: conDibujo(b) }))
    oraculo('V1C12', 'S · los espias de cierre a cero', sinCierres(), tx(espias()))
  }
  {
    const { b, sid } = await pagina()
    const pv = b.refs.v1Ref.current, TR = b.caja.valor.trading
    retenerPrimera = true
    const a = limitDelDibujo(pv, 1.095, 'D1'), c = limitDelDibujo(pv, 1.094, 'D2')
    await asienta(10)
    const enVuelo = conDibujo(b).map(([id, dj]) => [String(id).startsWith('v1-'), dj])
    const pc = TR.cancelaOrdenesDeDibujos(['D2'])
    await asienta(10); suelta()
    const r = await Promise.all([a, c, pc]); await asentado(b)
    const quedan = (await leeSesion(sid)).estado.ordenes
    oraculo('V1C12', 'B · borrar D2 con las dos en vuelo: confirmadas, en el servidor queda UNA pendiente (la de D1, a 1,095) y en la pantalla con D1',
      tx(enVuelo) === tx([[true, 'D1'], [true, 'D2']]) && quedan.length === 1 && VI.vistaDe({ estado: { ordenes: quedan } }).ordenes[0]?.entry === 1.095 && tx(conDibujo(b)) === tx([[quedan[0].id, 'D1']]), tx({ enVuelo, r: r.slice(0, 2).map(q => q.conclusion), quedan: quedan.map(o => [o.id, o.precio]), pantalla: conDibujo(b) }))
  }
  {
    const { b, sid } = await pagina()
    const pv = b.refs.v1Ref.current, TR = b.caja.valor.trading
    retenerPrimera = true
    const a = limitDelDibujo(pv, 1.095, 'D1'), c = limitDelDibujo(pv, 1.094, 'D2')
    await asienta(10)
    const pc = TR.cancelaOrdenesDeDibujos(['D1'])
    await asienta(10); suelta()
    await Promise.all([a, c, pc]); await asentado(b)
    const quedan = (await leeSesion(sid)).estado.ordenes
    oraculo('V1C12', 'B · borrar D1 con las dos en vuelo: en el servidor queda solo la de D2 (1,094), que en la pantalla sigue con D2',
      quedan.length === 1 && VI.vistaDe({ estado: { ordenes: quedan } }).ordenes[0]?.entry === 1.094 && tx(conDibujo(b)) === tx([[quedan[0].id, 'D2']]), tx({ quedan: quedan.map(o => [o.id, o.precio]), pantalla: conDibujo(b) }))
    // y con D2 borrado despues, no queda ninguna orden viva
    await TR.cancelaOrdenesDeDibujos(['D2']); await asentado(b)
    oraculo('V1C12', 'B · y borrar despues D2: ninguna orden viva en el servidor ni en la pantalla', (await srv(sid)).length === 0 && b.ps().orders.length === 0, tx({ srv: await srv(sid), pantalla: conDibujo(b) }))
  }

  titulo('B · (escenario A de Astra con PG) dos aperturas a mercado y el SL de la segunda provisional')
  {
    const { b, sid } = await pagina()
    const pv = b.refs.v1Ref.current
    retenerPrimera = true
    const abrir = OR.comandoAbrir({ pair: 'EUR/USD', side: 'BUY', entry: 1.1, lots: 1, sl: 1.08, tp: null, cursor: pv.cursor() })
    const p1 = pv.envia(abrir, { entry: 1.1, openTime: m(2) }), p2 = pv.envia(abrir, { entry: 1.1, openTime: m(2) })
    await asienta(10)
    const provisional = b.ps().positions.at(-1).id
    const drag = pv.envia({ tipo: 'modificar', carga: { id: provisional, sl: '1.07' } })
    suelta()
    const r = await Promise.all([p1, p2, drag]); await asentado(b)
    const pos = (await leeSesion(sid)).estado.posiciones.map(p => [p.id, VI.vistaDe({ estado: { posiciones: [p] } }).posiciones[0].sl])
    oraculo('V1C12', 'B · PG: las dos se confirman y el SL de la segunda provisional se aplica en el servidor (p1 1,08 · p2 1,07); la pantalla igual',
      r.every(q => q.conclusion === 'confirmado') && tx(pos.map(x => x[1])) === tx([1.08, 1.07]) && tx(b.ps().positions.map(p => p.sl)) === tx([1.08, 1.07]), tx({ r: r.map(q => [q.conclusion, q.motivo ?? null]), provisional, pos, pantalla: b.ps().positions.map(p => [p.id, p.sl]) }))
  }
} finally { pg.cierra() }
fin()
