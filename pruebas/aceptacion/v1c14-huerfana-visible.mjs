/**
 * V1C14 · LA PENDIENTE HUERFANA SE VE Y SE CANCELA (orden 1-177 del CTO: la condicion de R2-8 y de la recarga con la
 * apertura en cola). lib/servidor REAL + PostgreSQL desechable y los hooks REALES del banco. La regla: lo vivo siempre
 * visible y cancelable, aunque sin su dibujo original.
 *   A · R2-8: la pestaña A crea la limit del dibujo D1; su escritor caduca y la pestaña B abre la sesion y coge el
 *       escritor (la pagina v1 no tiene boton «Usar aqui»: es asi como otra pestaña lo coge). La A borra D1: su cancelar
 *       no sale adelante (usar_aqui) y la pendiente queda HUERFANA en el servidor. En la B: se ve como pendiente (sin
 *       dibujo) y cancelarla (cancelLimitOrder, la ✕ de la linea) la deja cancelada en el servidor
 *   B · recarga: la limit del dibujo D2 llega al servidor y su respuesta se pierde (en la cola, sin pintar); se recarga la
 *       pagina (la misma pestaña: localStorage y sessionStorage se conservan). Tras recargar se ve (sin dibujo); cancelarla
 *       resuelve antes la cola (el abrir repetido, sin duplicar) y la deja cancelada en el servidor
 * Si sale en verde en 16ccc74 (lo que se espera), es la DECLARACION de que ya lo hacia. Datos inventados. Sin red.
 */
// orden 1-179 (a): el dia ancla del mercado de la prueba (crear exige las fechas dentro de lo publicado)
import { anclados } from '../mercado-ancla.mjs'
import { register } from 'node:module'
register('../espias-vela.mjs', import.meta.url)
const { titulo, ver, oraculo, fin, importa, fuente, asienta, escenario } = await import('../lib.mjs')
const N = 4
const HOOK = await importa('components/useSesionV1.js').catch(() => null)
const PA = await importa('lib/sim/v1/pantalla.js').catch(() => null)
if (!HOOK?.default || !PA?.creaPantallaV1) { for (let i = 0; i < N; i++) oraculo('V1C14', `caso ${i}: sin la pantalla v1 no se puede`, false, 'no esta'); fin() }
const { hayPostgres } = await import('../pg-ensayo.mjs')
if (!hayPostgres()) { ver('PostgreSQL 17 local: NO hay', false); fin() }
const { banco, velasEnStorage } = await import('../banco-motor.mjs')
const { montajeV1, L, conUidDelMontaje } = await import('../montaje-v1.mjs')
const { cerrojoEnMemoria } = await import('../cerrojo-falso.mjs')
const { router } = await import('../next-falso.mjs')
const OR = await importa('lib/sim/v1/ordenes.js'), CL = await importa('lib/sim/v1/cliente.js'), AV = await importa('lib/sim/avisos.js')
const P = await importa('lib/mercado/publicador-v1.mjs'), PV = await importa('lib/mercado/publica-v1.mjs')
const { minutoCerrado } = await importa('lib/mercado/calidad.mjs')
const CR = await importa('lib/servidor/crear.mjs'), TO = await importa('lib/servidor/tomar.mjs'), SO = await importa('lib/servidor/sobre.mjs')
const CO = await importa('lib/servidor/comando.mjs'), ES = await importa('lib/servidor/estado.mjs'), FA = await importa('lib/servidor/fase.mjs')
const VE = await importa('lib/servidor/velas.mjs')   // orden 1-179 (d): el grafico v1 pide sus velas al servidor
const CA = await importa('lib/motor/cartera.mjs')
const tx = x => JSON.stringify(x, (k, v) => (typeof v === 'bigint' ? `${v}n` : v))
const HUECO = "v_guarda pg_catalog.text := '⟦HUECO guarda canonica⟧';"
const deEnsayo = t => { if (t.split(HUECO).length !== 2) throw new Error('el hueco no esta una vez'); return t.replace(HUECO, "v_guarda pg_catalog.text := 'montaje de ensayo (v1c14)';") }
const S4B = conUidDelMontaje(fuente('sql/sim-004b-contrato-v1.sql')), S6 = deEnsayo(fuente('sql/sim-006-tope-de-pasos.sql'))
const u = k => `00000000-0000-4000-8000-${String(k).padStart(12, '0')}`
const M0 = Date.parse('2025-01-06T00:00:00Z') / 1000, m = k => M0 + 60 * k
const PX = { AUDCAD: 0.9, AUDUSD: 0.65, EURUSD: 1.1, GBPJPY: 190.5, GBPUSD: 1.3, NZDUSD: 0.6, USDCAD: 1.37, USDCHF: 0.88, USDJPY: 150.2 }
function velasDe(par) { const o = []; for (let t = M0; t < M0 + 5 * 86400; t += 60) if (!minutoCerrado(t)) o.push({ time: t, open: PX[par], high: PX[par], low: PX[par], close: PX[par], volume: 1 }); return o }
function almacen() { const o = new Map(); return { async lee(r) { return o.has(r) ? Buffer.from(o.get(r)) : null }, async sube(r, b, { upsert = false } = {}) { if (!upsert && o.has(r)) return 'existe'; o.set(r, Buffer.from(b)); return 'ok' }, async borra(r) { o.delete(r) }, async lista() { return [] } } }
const mercado = almacen()
await PV.publica({ cerrojo: cerrojoEnMemoria(), almacen: mercado, planes: anclados(SO.PARES.map(par => P.planificaPar({ par, velas: velasDe(par), texto: '', anterior: null, diasAceptados: new Map() })), '2025-12-31'), dueno: 'mercado-v1-publica', ahora: '2026-10-14T09:00:00.000Z' })
const web = () => { const o = new Map(); return { getItem: k => (o.has(k) ? o.get(k) : null), setItem: (k, v) => o.set(k, String(v)), removeItem: k => o.delete(k) } }
const AL = u(1)
let nId = 96000
const nuevoId = () => u(++nId)
const cuenta = {}
const espia = (n, f) => (typeof f !== 'function' ? f : (...a) => { cuenta[n] = (cuenta[n] ?? 0) + 1; return f(...a) })
const espias = () => ({ ...cuenta, ...(globalThis.__espiasVela ?? {}) })
const sinCierres = () => { const e = espias(); return ['checkSLTP', 'checkLimitOrders', 'checkChallengeBreach', 'rutaComun', 'cierreEnVela'].every(k => !e[k]) }
const textos = () => AV.avisos().map(a => a.texto)
const AVISO = 'Hay una operación confirmada que no se ha podido mostrar: recarga.'
escenario({})
velasEnStorage('EUR/USD', velasDe('EURUSD'), [2024], { tramoAbierto: true })
const espera = ms => new Promise(r => setTimeout(r, ms))

const pg = montajeV1()
try {
  pg.arranca()
  const d = 'v1c13'
  pg.base(d)
  const a4 = pg.comoEjecutor(d, S4B), a6 = pg.comoEjecutor(d, S6)
  ver('control: sim-004b y sim-006 aplicadas', a4.ok && a6.ok, (a4.err + a6.err).slice(0, 200))
  pg.alumno(d, AL)
  const uno = q => pg.uno(d, q)
  const leeSesion = async id => { const t = uno(`select row_to_json(s)::text from public.sim_sessions s where id = ${L(id)}`); return t ? JSON.parse(t) : null }
  const puertos = { almacen: mercado, rpc: pg.rpc(d), parDeId: pg.parDeId(d), leeSesion, ahora: () => Date.parse('2026-10-14T10:00:00Z') }
  const orden = { '/api/sim/crear': CR.ordenCrear, '/api/sim/tomar': TO.ordenTomar, '/api/sim/comando': CO.ordenComando, '/api/sim/estado': ES.ordenEstado, '/api/sim/velas': VE.ordenVelas, '/api/sim/avanzar-fase': FA.ordenFase }
  // las trampas del transporte de la pagina (nunca en el servidor)
  const T = { pierdeAbrir: false, conflictosCancelar: 0, estadoCaido: false, caeTrasAbrir: false, caeTrasFase: false }
  const enviados = []
  async function directo(ruta, cuerpo) {
    const r = await orden[ruta]({ actor: AL, cuerpo, puertos })
    if (r.http === 429 && r.cuerpo?.motivo === 'demasiados_avances') uno('update public.sim_alumnos set siguiente_avance_desde = null')
    return { http: r.http, cuerpo: r.cuerpo }
  }
  async function llama(ruta, { cuerpo }) {
    if (ruta === '/api/sim/estado' && T.estadoCaido) return { http: 503, cuerpo: { ok: false, motivo: 'no_disponible' } }
    if (ruta === '/api/sim/comando' && cuerpo?.tipo !== 'avanzar') enviados.push({ tipo: cuerpo?.tipo, id: cuerpo?.id ?? null })
    if (ruta === '/api/sim/comando' && cuerpo?.tipo === 'cancelar' && T.conflictosCancelar > 0) { T.conflictosCancelar--; return { http: 409, cuerpo: { ok: false, motivo: 'conflicto' } } }
    const r = await directo(ruta, cuerpo)
    if (ruta === '/api/sim/comando' && cuerpo?.tipo === 'abrir' && T.pierdeAbrir) { T.pierdeAbrir = false; throw new Error('respuesta perdida (ficticia)') }
    if (ruta === '/api/sim/comando' && cuerpo?.tipo === 'abrir' && r.http === 200 && T.caeTrasAbrir) { T.caeTrasAbrir = false; T.estadoCaido = true }
    if (ruta === '/api/sim/avanzar-fase' && r.http < 300 && T.caeTrasFase) { T.caeTrasFase = false; T.estadoCaido = true }
    return r
  }
  let nS = 8200
  async function crea(reto = null) {
    const sid = u(++nS)
    const c = await directo('/api/sim/crear', { session_id: sid, command_id: nuevoId(), epoca: 1, name: 'S', pair: 'EUR/USD', timeframe: 'M1', date_from: '2025-01-06', date_to: '2025-12-31', capital: '100000', challenge_type: reto })
    ver(`control: sesion creada (${sid.slice(-4)}${reto ? ', ' + reto : ''})`, c.http === 201, tx(c).slice(0, 300))
    uno("update public.sim_arrendamientos set hasta = now() - interval '1 minute'")
    return sid
  }
  // local y almacenSesion: los de la pestaña (una recarga conserva los dos; otra pestaña tiene su sessionStorage)
  async function pagina(sid, { irA = m(2), local = web(), almacenSesion = web() } = {}) {
    process.env.NEXT_PUBLIC_SIM_V1_PANTALLA = 'encendido'
    const b = await banco({ sesion: await leeSesion(sid), userId: AL, espia, v1: { puertos: { llama, nuevoId, local, almacenSesion, plazoMs: 5000, leeTrades: async () => [], buscaHija: async () => uno(`select id from public.sim_sessions where challenge_parent_id = ${L(sid)} limit 1`) || null,
      esperasRelectura: [0, 0, 0], esperasCancelar: [20, 40, 80] } } })
    for (let k = 0; k < 50 && !b.ps()?.ready; k++) { await asienta(20); await b.repinta() }
    await b.refs.v1Ref.current?.arranca()
    await b.repinta()
    if (irA != null) await b.refs.v1Ref.current.avance({ engine: () => b.motor(), par: () => b.estado.activa }).irA(irA)
    return b
  }
  const srv = async sid => (await leeSesion(sid)).estado.ordenes.map(o => o.id)
  const asentado = async (b, ms = 0) => { if (ms) await espera(ms); await asienta(60); await b.repinta() }
  const limitDelDibujo = (pv, entry, dibujo) => pv.envia(OR.comandoAbrir({ pair: 'EUR/USD', side: 'BUY_LIMIT', entry, lots: 1, sl: entry - 0.01, tp: entry + 0.02, cursor: pv.cursor() }), { entry, openTime: m(2), dibujo })


  titulo('A · R2-8: otra pestaña coge el escritor; la pendiente huerfana se ve y se cancela')
  {
    const sid = await crea(), a = await pagina(sid)
    const pa = a.refs.v1Ref.current
    await limitDelDibujo(pa, 1.095, 'D1'); await asentado(a)
    ver('control: la A tiene la limit de D1 confirmada', (await srv(sid)).length === 1 && a.ps().orders[0]?.dibujo === 'D1', tx(a.ps().orders))
    uno("update public.sim_arrendamientos set hasta = now() - interval '1 minute'")
    const b = await pagina(sid, { irA: null })
    const pb = b.refs.v1Ref.current
    ver('control: la B cogio el escritor al abrir (sin aviso de otra pestaña)', !pb.soloLectura && !!pb.cliente.testigo(), tx({ aviso: pb.aviso }))
    AV.vaciaAvisos()
    enviados.length = 0
    await a.caja.valor.trading.cancelaOrdenesDeDibujos(['D1']); await asentado(a, 200)
    ver('control: en la A el cancelar no sale adelante (otra pestaña) y la pendiente sigue viva en el servidor: huerfana', (await srv(sid)).length === 1 && textos().includes('Esta sesión está abierta en otra pestaña.'), tx({ srv: await srv(sid), avisos: textos(), enviados }))
    await pb.cliente.leeEstado(); pb.vuelca(); await b.repinta()
    const enB = b.ps().orders.map(o => [o.id, o.side, o.entry, o.dibujo ?? null])
    oraculo('V1C14', 'A · en la pestaña B la pendiente huerfana se ve (B.LIM 1,095, sin dibujo)', enB.length === 1 && enB[0][1] === 'BUY_LIMIT' && enB[0][2] === 1.095 && enB[0][3] === null, tx(enB))
    await b.caja.valor.trading.cancelLimitOrder(enB[0]?.[0], 'EUR/USD'); await asentado(b, 200)
    oraculo('V1C14', 'A · cancelarla desde la B (la ✕ de su linea) la deja cancelada en el servidor y fuera de la pantalla', (await srv(sid)).length === 0 && b.ps().orders.length === 0, tx({ srv: await srv(sid), b: b.ps().orders }))
  }

  titulo('B · recarga con la apertura en la cola')
  {
    const sid = await crea()
    const local = web(), almacenSesion = web()
    const a = await pagina(sid, { local, almacenSesion })
    T.pierdeAbrir = true
    const r = await limitDelDibujo(a.refs.v1Ref.current, 1.095, 'D2'); await asentado(a)
    ver('control: la limit de D2 esta en el servidor y en la cola de la pagina (incierta, sin pintar)', r.conclusion === 'incierto' && (await srv(sid)).length === 1 && a.refs.v1Ref.current.cliente.pendientes().length === 1 && a.ps().orders.length === 0, tx({ r: r.conclusion, srv: await srv(sid) }))
    // recargar: otra pagina con el MISMO localStorage (la cola) y sessionStorage (el escritor)
    const b = await pagina(sid, { irA: null, local, almacenSesion })
    const pb = b.refs.v1Ref.current
    const tras = b.ps().orders.map(o => [o.id, o.entry, o.dibujo ?? null])
    oraculo('V1C14', 'B · tras recargar la pendiente se ve (1,095, sin su dibujo) aunque su abrir siga en la cola', tras.length === 1 && tras[0][1] === 1.095 && tras[0][2] === null && pb.cliente.pendientes().length === 1, tx({ tras, cola: pb.cliente.pendientes().length }))
    enviados.length = 0
    await b.caja.valor.trading.cancelLimitOrder(tras[0]?.[0], 'EUR/USD'); await asentado(b, 200)
    oraculo('V1C14', 'B · cancelarla resuelve la cola (el abrir repetido, sin otra pendiente) y la deja cancelada en el servidor', (await srv(sid)).length === 0 && b.ps().orders.length === 0 && pb.cliente.pendientes().length === 0 && tx(enviados) === tx([{ tipo: 'abrir', id: null }, { tipo: 'cancelar', id: tras[0]?.[0] }]), tx({ srv: await srv(sid), enviados, cola: pb.cliente.pendientes().length }))
  }
} finally { pg.cierra() }
fin()
