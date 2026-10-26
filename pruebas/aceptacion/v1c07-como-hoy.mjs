/**
 * V1C07 · LA PANTALLA V1 «COMO HOY» (orden 1-129 B del CTO; regla de Ramon: con la bandera encendida el alumno ve y siente
 * lo mismo que hoy en produccion, f5b713b). Escrita ANTES que el codigo (en b88b531: en rojo).
 *   B1 · (6) el reconocimiento del modal del reto quemado se PERSISTE como hoy: en f5b713b, «Revisar» o «Nuevo reto» del
 *        ChallengeFailedModal llaman a /api/challenge/advance con outcome 'fail' y el servidor deja sim_sessions.status en
 *        failed_dd_daily / failed_dd_total; al volver a abrir, la fila cerrada no saca el modal. En v1 lo mismo por el
 *        servidor: advance acepta 'fail' en una sesion v1 SOLO si su estado confirmado (reto@1) es un breach, y escribe
 *        solo status (ni saldo, ni last_timestamp, ni estado: los lleva la RPC). Una v1 sin breach: 400 y cero escrituras;
 *        'pass' en v1 sigue en 409 (su camino es avanzar-fase). Al reabrir, el modal no sale y el reto sigue bloqueado.
 *   B2 · la fila del trade de un cierre manual (total y parcial) aparece AL INSTANTE (optimista), con la peticion
 *        retenida, como en f5b713b (closePosition pone el trade en memoria antes de guardar); al confirmar, la del
 *        servidor; si el servidor rechaza, la fila desaparece y vuelve lo confirmado con el aviso.
 *   B3 · una limit abierta desde el OrderModal NO dibuja lineas de precio (f5b713b: el onConfirm del OrderModal solo la
 *        mete en ps.orders; las lineas con createPriceLine son de confirmLimitOrder). La de confirmLimitOrder si (control).
 *   B4 · el precio de entrada. CONTRATO CAMBIADO por la orden 1-134 (decision de Ramon: «el motor v1 cobra spread, como
 *        en una cuenta real»; cambio visible declarado: la entrada y la salida incluyen el spread y el P&L es algo menor
 *        que hoy). En f5b713b la entrada a mercado es el close de la vela visible, sin spread (medido:
 *        orden-1-129/medidas/medida-entrada-f5b713b.log). En v1 la pantalla enseña la entrada del motor: el BUY al ask
 *        (close + spread), el SELL al bid; la fila del trade, la de sim_trades. Lo que se ve cuadra con el P&L (v1c08).
 *   S · en todo: checkSLTP, checkLimitOrders, checkChallengeBreach, rutaComun y cierreEnVela no se llaman.
 * Contra lib/servidor REAL y PostgreSQL desechable (montaje-v1 + sim-004b + sim-006, como v1c05). El advance de B1, sobre
 * supabase-falso con la MISMA fila de la sesion v1 (la pagina habla con una sola base; aqui son dos dobles). Datos
 * inventados. Mercado: EURUSD 1,1 hasta el minuto 10 del 6-ene-2025; 1,09 del 10 al 19; 1,1 desde el 20.
 */
import { register } from 'node:module'
register('../espias-vela.mjs', import.meta.url)
const { titulo, ver, oraculo, fin, importa, fuente, asienta, escenario, db, perfil, tok } = await import('../lib.mjs')
const { hayPostgres } = await import('../pg-ensayo.mjs')
const { montajeV1, L, conUidDelMontaje } = await import('../montaje-v1.mjs')
const { cerrojoEnMemoria } = await import('../cerrojo-falso.mjs')
const { llama: llamaHandler } = await import('../supabase-falso.mjs')
const N = 17
const HOOK = await importa('components/useSesionV1.js').catch(() => null)
if (!HOOK?.default) { for (let i = 0; i < N; i++) oraculo('V1C07', `caso ${i}: sin components/useSesionV1.js no se puede`, false, 'no esta'); fin() }
if (!hayPostgres()) { ver('PostgreSQL 17 local: NO hay', false); fin() }
const { banco, velasEnStorage } = await import('../banco-motor.mjs')
const OR = await importa('lib/sim/v1/ordenes.js'), VI = await importa('lib/sim/v1/vista.js'), AV = await importa('lib/sim/avisos.js')
const P = await importa('lib/mercado/publicador-v1.mjs'), PV = await importa('lib/mercado/publica-v1.mjs')
const { minutoCerrado } = await importa('lib/mercado/calidad.mjs')
const CR = await importa('lib/servidor/crear.mjs'), TO = await importa('lib/servidor/tomar.mjs'), SO = await importa('lib/servidor/sobre.mjs')
const CO = await importa('lib/servidor/comando.mjs'), ES = await importa('lib/servidor/estado.mjs'), FA = await importa('lib/servidor/fase.mjs')
const ADV = (await importa('pages/api/challenge/advance.js')).default
const HUECO = "v_guarda pg_catalog.text := '⟦HUECO guarda canonica⟧';"
const deEnsayo = t => { if (t.split(HUECO).length !== 2) throw new Error('el hueco no esta una vez'); return t.replace(HUECO, "v_guarda pg_catalog.text := 'montaje de ensayo (v1c07)';") }
const S4B = conUidDelMontaje(fuente('sql/sim-004b-contrato-v1.sql')), S6 = deEnsayo(fuente('sql/sim-006-tope-de-pasos.sql'))

const u = k => `00000000-0000-4000-8000-${String(k).padStart(12, '0')}`
const U = iso => Date.parse(iso) / 1000
const M0 = U('2025-01-06T00:00:00Z'), m = k => M0 + 60 * k
const tx = x => JSON.stringify(x, (k, v) => (typeof v === 'bigint' ? `${v}n` : v))
const PX = { AUDCAD: 0.9, AUDUSD: 0.65, EURUSD: 1.1, GBPJPY: 190.5, GBPUSD: 1.3, NZDUSD: 0.6, USDCAD: 1.37, USDCHF: 0.88, USDJPY: 150.2 }
const precioEn = (par, t) => (par === 'EURUSD' && t >= m(10) && t < m(20) ? 1.09 : PX[par])
function velasDe(par) { const o = []; for (let t = M0; t < U('2025-01-11T00:00:00Z'); t += 60) if (!minutoCerrado(t)) { const p = precioEn(par, t); o.push({ time: t, open: p, high: p, low: p, close: p, volume: 1 }) } return o }
function almacen() { const o = new Map(); return { o, async lee(r) { return o.has(r) ? Buffer.from(o.get(r)) : null }, async sube(r, b, { upsert = false } = {}) { if (!upsert && o.has(r)) return 'existe'; o.set(r, Buffer.from(b)); return 'ok' }, async borra(r) { o.delete(r) }, async lista() { return [] } } }
const mercado = almacen()
await PV.publica({ cerrojo: cerrojoEnMemoria(), almacen: mercado, planes: SO.PARES.map(par => P.planificaPar({ par, velas: velasDe(par), texto: '', anterior: null, diasAceptados: new Map() })), dueno: 'mercado-v1-publica', ahora: '2026-10-14T09:00:00.000Z' })
const web = () => { const o = new Map(); return { getItem: k => (o.has(k) ? o.get(k) : null), setItem: (k, v) => o.set(k, String(v)), removeItem: k => o.delete(k) } }
const AL = u(1)
let nId = 90000
const nuevoId = () => u(++nId)
const cuenta = {}
const espia = (n, f) => (typeof f !== 'function' ? f : (...a) => { cuenta[n] = (cuenta[n] ?? 0) + 1; return f(...a) })
const espias = () => ({ ...cuenta, ...(globalThis.__espiasVela ?? {}) })
const cero = () => { for (const k of Object.keys(cuenta)) delete cuenta[k]; globalThis.__espiasVela = {} }
const sinCierres = () => { const e = espias(); return ['checkSLTP', 'checkLimitOrders', 'checkChallengeBreach', 'rutaComun', 'cierreEnVela'].every(k => !e[k]) }
const textos = () => AV.avisos().map(a => a.texto)
escenario({})
velasEnStorage('EUR/USD', velasDe('EURUSD'), [2024], { tramoAbierto: true })

titulo('B4 · la vista enseña la entrada del motor, con su spread (orden 1-134)')
{
  // un estado de cartera con un BUY y un SELL llenados a mercado con bid 1,1 (ask 1,10003: spread 0,3 pip = 3 ticks)
  const T = m(5)
  const snap = { version: 3, estado: { esquema: 'cartera@1', pares: ['EURUSD'], reloj: { cursor: T }, saldo_µ: '100000000000', estado: 'activo', costes: { spread_ticks: { EURUSD: 3 } },
    cotizaciones: { EURUSD: { bid: 110000, en: T } },
    posiciones: [{ id: 'p1', par: 'EURUSD', lado: 'BUY', entrada: 110003, sl: 109903, tp: 110203, lotes_c: 100, abierta_en: { t: T } }, { id: 'p2', par: 'EURUSD', lado: 'SELL', entrada: 110000, sl: 111000, tp: null, lotes_c: 100, abierta_en: { t: T } }],
    ordenes: [] } }
  const v = VI.vistaDe(snap)
  const [b, s] = v.posiciones
  oraculo('V1C07', 'B4 · vista: el BUY llenado al ask 1,10003 se enseña con esa entrada (la que cobra el motor, orden 1-134); SL/TP intactos y sus pips desde 1,10003',
    b?.entry === 1.10003 && b.sl === 1.09903 && b.tp === 1.10203 && b.slPips === 10 && b.tpPips === 20, tx(b))
  oraculo('V1C07', 'B4 · vista: el SELL (llenado al bid) se enseña tal cual: 1,1', s?.entry === 1.1, tx(s))
}

const pg = montajeV1()
try {
  pg.arranca()
  async function base(d) {
    pg.base(d)
    const a4 = pg.comoEjecutor(d, S4B), a6 = pg.comoEjecutor(d, S6)
    ver(`control (${d}): sim-004b y sim-006 aplicadas`, a4.ok && a6.ok, (a4.err + a6.err).slice(0, 200))
    pg.alumno(d, AL)
    const uno = q => pg.uno(d, q)
    const leeSesion = async id => { const t = uno(`select row_to_json(s)::text from public.sim_sessions s where id = ${L(id)}`); return t ? JSON.parse(t) : null }
    const puertos = { almacen: mercado, rpc: pg.rpc(d), parDeId: pg.parDeId(d), leeSesion, ahora: () => Date.parse('2026-10-14T10:00:00Z') }
    const orden = { '/api/sim/crear': CR.ordenCrear, '/api/sim/tomar': TO.ordenTomar, '/api/sim/comando': CO.ordenComando, '/api/sim/estado': ES.ordenEstado, '/api/sim/avanzar-fase': FA.ordenFase }
    async function llama(ruta, { cuerpo }) {
      const r = await orden[ruta]({ actor: AL, cuerpo, puertos })
      if (r.http === 429 && r.cuerpo?.motivo === 'demasiados_avances') uno('update public.sim_alumnos set siguiente_avance_desde = null')
      return { http: r.http, cuerpo: r.cuerpo }
    }
    const filasTrades = sid => JSON.parse(uno(`select coalesce(json_agg(t order by closed_at, id), '[]')::text from (select id, pair, side, entry_price, exit_price, lots, sl_price, tp_price, rr, pnl, result, opened_at, closed_at from public.sim_trades where session_id = ${L(sid)}) t`))
    const puertosPagina = sid => ({ llama, nuevoId, local: web(), almacenSesion: web(), plazoMs: 3000,
      leeTrades: async () => filasTrades(sid).map(HOOK.deFila),
      buscaHija: async () => uno(`select id from public.sim_sessions where challenge_parent_id = ${L(sid)} limit 1`) || null })
    const crea = async (sid, reto = null) => (await llama('/api/sim/crear', { cuerpo: { session_id: sid, command_id: nuevoId(), epoca: 1, name: 'S', pair: 'EUR/USD', timeframe: 'M1', date_from: '2025-01-06', date_to: '2025-12-31', capital: '100000', challenge_type: reto } })).http === 201
    return { d, uno, llama, leeSesion, puertos, filasTrades, puertosPagina, crea }
  }
  async function pagina(B, sid, cambia = {}) {
    const fila = await B.leeSesion(sid)
    const b = await banco({ sesion: fila, userId: AL, v1: { puertos: { ...B.puertosPagina(sid), ...cambia } }, espia })
    for (let k = 0; k < 50 && !b.ps()?.ready; k++) { await asienta(20); await b.repinta() }
    await b.refs.v1Ref.current?.arranca()
    await b.repinta()
    return b
  }
  const avance = b => b.refs.v1Ref.current.avance({ engine: () => b.motor(), par: () => b.estado.activa })
  const asentado = async b => { await b.refs.v1Ref.current.cliente.recupera(); await asienta(60); await b.repinta() }
  const cierraPestanas = B => B.uno("update public.sim_arrendamientos set hasta = now() - interval '1 minute'")
  function conPuerta(llama) {
    let retiene = false
    const colas = []
    const f = async (ruta, o) => {
      if (retiene && ruta === '/api/sim/comando' && o?.cuerpo?.tipo !== 'avanzar') await new Promise(r => colas.push(r))
      return llama(ruta, o)
    }
    f.retiene = () => { retiene = true }
    f.retenidas = () => colas.length
    f.suelta = () => { retiene = false; for (const r of colas.splice(0)) r() }
    return f
  }
  process.env.NEXT_PUBLIC_SIM_V1_PANTALLA = 'encendido'
  const B1 = await base('w1')

  titulo('B4 · en la pagina: la entrada que se ve es la del motor (orden 1-134); la fila, la de sim_trades')
  const S4 = u(4104)
  ver('control: practica creada (B4)', await B1.crea(S4))
  const p4 = await pagina(B1, S4)
  const v4 = p4.refs.v1Ref.current
  cero()
  await avance(p4).irA(m(2))
  const close2 = p4.motor().candles[p4.motor().currentIndex]?.close
  // el OrderModal de hoy: entry = currentPrice (el close de la vela visible), tal como lo manda _SessionInner
  await v4.envia(OR.comandoAbrir({ pair: 'EUR/USD', side: 'BUY', lots: 1, cursor: v4.cursor() }), { entry: close2, openTime: m(2) })
  await asentado(p4)
  const pB = p4.ps().positions[0]
  oraculo('V1C07', 'B4 · BUY a mercado: la posicion confirmada se ve con la entrada del motor = el close de la vela visible (1,1) + el spread = 1,10003 (orden 1-134)',
    close2 === 1.1 && pB?.entry === 1.10003, tx({ close2, pos: pB }))
  await p4.caja.valor.trading.closePosition(pB.id, 'MANUAL', 'EUR/USD', 1.1)
  await asentado(p4)
  const fB = B1.filasTrades(S4)[0], tB = p4.ps().trades[0]
  oraculo('V1C07', 'B4 · la fila del trade se ve como la guarda el motor en sim_trades: entrada 1,10003 (ask) y su pnl (orden 1-134)',
    tB?.entry === 1.10003 && Number(fB?.entry_price) === 1.10003 && Number(tB?.pnl) === Number(fB?.pnl), tx({ pantalla: tB && { entry: tB.entry, pnl: tB.pnl }, base: fB && { entry: fB.entry_price, pnl: fB.pnl } }))
  await v4.envia(OR.comandoAbrir({ pair: 'EUR/USD', side: 'SELL', lots: 1, cursor: v4.cursor() }), { entry: close2, openTime: m(2) })
  await asentado(p4)
  oraculo('V1C07', 'B4 · SELL a mercado: entrada 1,1 (el motor ya llena al bid)', p4.ps().positions[0]?.entry === 1.1, tx(p4.ps().positions[0]))
  oraculo('V1C07', 'S · en todo B4: los espias de cierre a cero', sinCierres(), tx(espias()))

  titulo('B2 · la fila del trade de un cierre manual aparece al instante; un rechazo la quita')
  const S2 = u(4102)
  ver('control: practica creada (B2)', await B1.crea(S2))
  cierraPestanas(B1)
  const pu = conPuerta(B1.llama)
  const p2 = await pagina(B1, S2, { llama: pu })
  const v2 = p2.refs.v1Ref.current, T2 = p2.caja.valor.trading
  cero()
  await avance(p2).irA(m(2))
  await v2.envia(OR.comandoAbrir({ pair: 'EUR/USD', side: 'BUY', lots: 2, cursor: v2.cursor() }), { entry: 1.1, openTime: m(2) })
  await asentado(p2)
  const pid = p2.ps().positions[0]?.id
  pu.retiene()
  const pP = T2.closePartial(pid, 'EUR/USD', 0.5)
  await asienta(10)
  const oP = { ret: pu.retenidas(), tr: p2.ps().trades.map(t => [t.lots, t.exit, t.closeTime, t.reason]) }
  pu.suelta(); await pP; await asentado(p2)
  oraculo('V1C07', 'B2 · parcial: con la peticion retenida ya se ve su fila (0,5 lotes, salida 1,1 al bid como el motor, en la vela visible, PARTIAL); al confirmar, 1 fila del servidor',
    oP.ret === 1 && tx(oP.tr) === tx([[0.5, 1.1, m(2), 'PARTIAL']]) && p2.ps().trades.length === 1 && B1.filasTrades(S2).length === 1, tx({ oP, tras: p2.ps().trades.length }))
  pu.retiene()
  const pC = T2.closePosition(pid, 'MANUAL', 'EUR/USD', 1.1)
  await asienta(10)
  const oC = { ret: pu.retenidas(), n: p2.ps().trades.length, ult: p2.ps().trades.at(-1) && [p2.ps().trades.at(-1).lots, p2.ps().trades.at(-1).exit, p2.ps().trades.at(-1).reason] }
  pu.suelta(); await pC; await asentado(p2)
  oraculo('V1C07', 'B2 · total: con la peticion retenida ya se ven 2 filas (la nueva, 1,5 lotes, MANUAL); al confirmar, las 2 del servidor',
    oC.ret === 1 && oC.n === 2 && tx(oC.ult) === tx([1.5, 1.1, 'MANUAL']) && p2.ps().trades.length === 2 && B1.filasTrades(S2).length === 2, tx(oC))
  oraculo('V1C07', 'S · en todo B2: los espias de cierre a cero', sinCierres(), tx(espias()))

  titulo('B2 · rechazo: la fila optimista desaparece y vuelve lo confirmado con el aviso')
  const S2b = u(4112)
  ver('control: practica creada (B2 rechazo)', await B1.crea(S2b))
  cierraPestanas(B1)
  let rechazaCierre = false
  const pr = conPuerta(async (ruta, o) => {
    if (rechazaCierre && ruta === '/api/sim/comando' && o?.cuerpo?.tipo === 'cerrar') return { http: 409, cuerpo: { ok: false, motivo: 'conflicto' } }
    return B1.llama(ruta, o)
  })
  const p2b = await pagina(B1, S2b, { llama: pr })
  const v2b = p2b.refs.v1Ref.current
  cero()
  await avance(p2b).irA(m(2))
  await v2b.envia(OR.comandoAbrir({ pair: 'EUR/USD', side: 'BUY', lots: 1, cursor: v2b.cursor() }), { entry: 1.1, openTime: m(2) })
  await asentado(p2b)
  const pidR = p2b.ps().positions[0]?.id
  AV.vaciaAvisos()
  rechazaCierre = true
  pr.retiene()
  const pRR = p2b.caja.valor.trading.closePosition(pidR, 'MANUAL', 'EUR/USD', 1.1)
  await asienta(10)
  const oRR = { n: p2b.ps().trades.length, pos: p2b.ps().positions.length }
  pr.suelta(); await pRR; await asentado(p2b)
  oraculo('V1C07', 'B2 · rechazo: la fila se pinto al instante y, al rechazar el servidor, desaparece; la posicion vuelve y sale «El simulador ha rechazado la operación.»',
    oRR.n === 1 && oRR.pos === 0 && p2b.ps().trades.length === 0 && p2b.ps().positions.length === 1 && textos().includes('El simulador ha rechazado la operación.'), tx({ oRR, tras: { n: p2b.ps().trades.length, pos: p2b.ps().positions.length }, avisos: textos() }))
  oraculo('V1C07', 'S · en el rechazo: los espias de cierre a cero', sinCierres(), tx(espias()))

  titulo('B3 · la limit del OrderModal no dibuja lineas de precio (como hoy); la de confirmLimitOrder si')
  const lineas = []
  const serie = { createPriceLine: o => { const l = { o, viva: true }; lineas.push(l); return l }, removePriceLine: l => { l.viva = false }, setData() {}, update() {} }
  p2b.refs.chartMap.current['EUR/USD'] = { series: serie, priceLines: {}, hasLoaded: true, chart: { timeScale: () => ({ getVisibleLogicalRange: () => null, setVisibleLogicalRange() {} }) } }
  const vivas = () => lineas.filter(l => l.viva).map(l => l.o.title).sort()
  rechazaCierre = false
  cero()
  // el onConfirm del OrderModal en modo v1, tal cual (_SessionInner): comandoAbrir con la entrada al tick y { entry, openTime }
  await v2b.envia(OR.comandoAbrir({ pair: 'EUR/USD', side: 'BUY_LIMIT', entry: 1.095, lots: 1, sl: 1.09, tp: 1.105, cursor: v2b.cursor() }), { entry: 1.095, openTime: m(2) })
  await asentado(p2b)
  const l1 = vivas(), o1 = p2b.ps().orders.length
  oraculo('V1C07', 'B3 · OrderModal: la limit esta (1 pendiente) y NO hay lineas de precio', o1 === 1 && l1.length === 0, tx({ o1, l1 }))
  await p2b.pendiente({ side: 'SELL_LIMIT', entry: 1.12, sl: 1.13, tp: 1.1, lots: 1 })
  await asentado(p2b)
  const l2 = vivas()
  oraculo('V1C07', 'B3 · control: la limit de confirmLimitOrder si dibuja sus tres lineas (S.LIM 1L, SL, TP) y la del OrderModal sigue sin', tx(l2) === tx(['S.LIM 1L', 'SL', 'TP'].sort()) && p2b.ps().orders.length === 2, tx({ l2, n: p2b.ps().orders.length }))
  const SI = fuente('components/_SessionInner.js')
  oraculo('V1C07', 'B3 · _SessionInner: el OrderModal en v1 sigue mandando { entry, openTime } (y, desde la 1-136, el dibujo del que nace; la linea que esta prueba copia)', /comandoAbrir\(\{pair:m\.pair[^\n]*\}\),\{entry:entradaTick,openTime:currentTime(,dibujo:m\.dibujo\?\?null)?\}\)/.test(SI))
  oraculo('V1C07', 'S · en B3: los espias de cierre a cero', sinCierres(), tx(espias()))

  titulo('B1 · el reto quemado reconocido queda marcado, como hoy')
  const SB = u(4101)
  ver('control: reto 2F creado (B1)', await B1.crea(SB, '2F'))
  cierraPestanas(B1)
  const q = await pagina(B1, SB)
  const qv = q.refs.v1Ref.current, qav = avance(q)
  cero()
  await qav.irA(m(5))
  await qv.envia(OR.comandoAbrir({ pair: 'EUR/USD', side: 'BUY', lots: 6, cursor: qv.cursor() }), { entry: 1.1, openTime: m(5) })
  const rQ = await qav.play({ lote: 10, hasta: m(30) })
  await q.repinta(); await asienta(40); await q.repinta()
  ver('control: breach diario y el modal de fallo abierto', rQ.conclusion === 'terminada' && q.caja.valor.reto.challengeModal === 'failed', tx({ c: rQ.conclusion, modal: q.caja.valor.reto.challengeModal }))
  // la misma fila en el doble de supabase (la pagina real habla con una sola base)
  const filaPg = await B1.leeSesion(SB)
  db.tablas.profiles.push(perfil(AL)); db.tokens[tok(AL)] = { id: AL, email: 'al@ejemplo.test' }
  db.sesion = { user: { id: AL, email: 'al@ejemplo.test' }, access_token: tok(AL) }
  db.tablas.sim_sessions.push({ ...filaPg, rev_saldo: 0 })
  const escrituras = () => db.log.filter(l => ['insert', 'update', 'delete', 'upsert'].includes(l.op) && l.tabla === 'sim_sessions')
  db.log.length = 0
  globalThis.window.__algSuiteCurrentTime = m(10)
  await q.caja.valor.reto.handleChallengeFail(); await asienta(40)
  const fF = db.tablas.sim_sessions.find(x => x.id === SB)
  const w = escrituras()
  oraculo('V1C07', 'B1 · «Revisar» del modal de fallo (onAdvance) en v1: el servidor marca la fila failed_dd_daily, como hoy, y solo el status (ni saldo, ni last_timestamp, ni estado)',
    fF?.status === 'failed_dd_daily' && w.length === 1 && tx(Object.keys(w[0].payload ?? {}).sort()) === tx(['status']) && fF.balance === filaPg.balance && fF.last_timestamp === filaPg.last_timestamp && tx(fF.estado) === tx(filaPg.estado),
    tx({ status: fF?.status, w: w.map(x => x.filtros), cambios: w[0]?.payload }))
  // al reabrir: la base de la pagina tiene la marca (aqui se lleva al PostgreSQL de las RPC)
  B1.uno(`update public.sim_sessions set status = 'failed_dd_daily' where id = ${L(SB)}`)
  cierraPestanas(B1)
  const q2 = await pagina(B1, SB)
  await q2.caja.valor.reto.refreshChallengeStatus(); await q2.repinta(); await asienta(40); await q2.repinta()
  oraculo('V1C07', 'B1 · al reabrir el reto reconocido: el modal de fallo NO sale y el reto sigue bloqueado (como hoy con la fila cerrada)',
    q2.caja.valor.reto.challengeModal == null && q2.caja.valor.reto.challengeLocked === true, tx({ modal: q2.caja.valor.reto.challengeModal, locked: q2.caja.valor.reto.challengeLocked }))
  // el servidor: una v1 sin breach no se marca; 'pass' sigue por avanzar-fase
  const SC = u(4111)
  await B1.crea(SC, '2F')
  db.tablas.sim_sessions.push({ ...(await B1.leeSesion(SC)), rev_saldo: 0 })
  db.log.length = 0
  const rF = await llamaHandler(ADV, { method: 'POST', token: tok(AL), body: { session_id: SC, outcome: 'fail', end_timestamp: m(5) } })
  const rP = await llamaHandler(ADV, { method: 'POST', token: tok(AL), body: { session_id: SC, outcome: 'pass', end_timestamp: m(5) } })
  oraculo('V1C07', 'B1 · servidor: una v1 sin breach no se marca (400) y pass en v1 sigue en 409 usa_avanzar_fase; cero escrituras',
    rF.estado === 400 && rP.estado === 409 && rP.cuerpo?.code === 'usa_avanzar_fase' && escrituras().length === 0, tx({ f: [rF.estado, rF.cuerpo?.error], p: [rP.estado, rP.cuerpo?.code], w: escrituras().length }))
  oraculo('V1C07', 'S · en B1: los espias de cierre a cero', sinCierres(), tx(espias()))
} finally { pg.cierra() }
fin()
