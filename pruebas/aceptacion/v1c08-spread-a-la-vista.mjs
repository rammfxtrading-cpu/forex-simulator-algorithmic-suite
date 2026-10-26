/**
 * V1C08 · LA PANTALLA V1 ENSEÑA LO QUE EL MOTOR COBRA (orden 1-134 del CTO; decision de Ramon: «el motor v1 cobra spread,
 * como en una cuenta real»). Escrita ANTES que el codigo (en 4f0123e, con la entrada «sin spread» de 85ddf63: en rojo).
 * Con la bandera encendida, la entrada y la salida que se VEN son las del motor: BUY entra al ask y sale al bid; SELL
 * entra al bid y sale al ask. Y lo que se ve cuadra: en cada fila de la lista de operaciones,
 *     pnl mostrado = (salida − entrada) × (BUY +1 / SELL −1) × 100.000 × lotes  −  comision (3 USD por lote)
 * (EUR/USD: 10 USD el pip por lote; la comision la cobra el motor al abrir y la asigna a cada cierre: lib/motor/dinero.mjs)
 * y es el pnl del servidor (sim_trades). En BUY y SELL, a mercado, limit (llenada en el Play) y cierre parcial:
 *   M · a mercado: la posicion se ve con su entrada con spread desde el instante optimista (BUY 1,10003; SELL 1,1) y la
 *       fila del cierre (optimista y confirmada) con la salida al lado que toca (BUY 1,1; SELL 1,10003)
 *   P · cierre parcial (0,5 de 2 lotes) y el resto: las dos filas cuadran
 *   L · BUY_LIMIT y SELL_LIMIT llenadas durante el Play: en la vela del fill la posicion ya se ve con la entrada del motor
 *       (no «entrada − spread») y su fila, al cerrar, cuadra
 *   S · en todo: checkSLTP, checkLimitOrders, checkChallengeBreach, rutaComun y cierreEnVela no se llaman
 * Con la bandera apagada no cambia nada (v1Ref null: la pantalla de hoy; la cubren las demas pruebas).
 * Contra lib/servidor REAL y PostgreSQL desechable (montaje-v1 + sim-004b + sim-006, como v1c07). Datos inventados.
 * Mercado: EURUSD 1,1 hasta el minuto 10 del 6-ene-2025; 1,09 del 10 al 19; 1,1 desde el 20 (spread 0,3 pip).
 */
import { register } from 'node:module'
register('../espias-vela.mjs', import.meta.url)
const { titulo, ver, oraculo, fin, importa, fuente, asienta, escenario } = await import('../lib.mjs')
const { hayPostgres } = await import('../pg-ensayo.mjs')
const { montajeV1, L, conUidDelMontaje } = await import('../montaje-v1.mjs')
const { cerrojoEnMemoria } = await import('../cerrojo-falso.mjs')
const N = 13
const HOOK = await importa('components/useSesionV1.js').catch(() => null)
if (!HOOK?.default) { for (let i = 0; i < N; i++) oraculo('V1C08', `caso ${i}: sin components/useSesionV1.js no se puede`, false, 'no esta'); fin() }
if (!hayPostgres()) { ver('PostgreSQL 17 local: NO hay', false); fin() }
const { banco, velasEnStorage } = await import('../banco-motor.mjs')
const OR = await importa('lib/sim/v1/ordenes.js'), PA = await importa('lib/sim/v1/pantalla.js')
const P = await importa('lib/mercado/publicador-v1.mjs'), PV = await importa('lib/mercado/publica-v1.mjs')
const { minutoCerrado } = await importa('lib/mercado/calidad.mjs')
const CR = await importa('lib/servidor/crear.mjs'), TO = await importa('lib/servidor/tomar.mjs'), SO = await importa('lib/servidor/sobre.mjs')
const CO = await importa('lib/servidor/comando.mjs'), ES = await importa('lib/servidor/estado.mjs')
const HUECO = "v_guarda pg_catalog.text := '⟦HUECO guarda canonica⟧';"
const deEnsayo = t => { if (t.split(HUECO).length !== 2) throw new Error('el hueco no esta una vez'); return t.replace(HUECO, "v_guarda pg_catalog.text := 'montaje de ensayo (v1c08)';") }
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
let nId = 95000
const nuevoId = () => u(++nId)
const cuenta = {}
const espia = (n, f) => (typeof f !== 'function' ? f : (...a) => { cuenta[n] = (cuenta[n] ?? 0) + 1; return f(...a) })
const espias = () => ({ ...cuenta, ...(globalThis.__espiasVela ?? {}) })
const cero = () => { for (const k of Object.keys(cuenta)) delete cuenta[k]; globalThis.__espiasVela = {} }
const sinCierres = () => { const e = espias(); return ['checkSLTP', 'checkLimitOrders', 'checkChallengeBreach', 'rutaComun', 'cierreEnVela'].every(k => !e[k]) }
escenario({})
velasEnStorage('EUR/USD', velasDe('EURUSD'), [2024], { tramoAbierto: true })

// la cuenta de una fila tal como se ve: (salida − entrada) × signo × 100.000 × lotes − 3 USD por lote
const r2 = x => Math.round(x * 100) / 100
const cuenta1 = t => r2((Number(t.exit) - Number(t.entry)) * (t.side === 'BUY' ? 1 : -1) * 100000 * Number(t.lots) - 3 * Number(t.lots))
const cuadra = (t, f) => !!t && !!f && Math.abs(cuenta1(t) - Number(t.pnl)) < 0.006 && Number(t.pnl) === Number(f.pnl) && Number(t.entry) === Number(f.entry_price) && Number(t.exit) === Number(f.exit_price)
const fila = t => t && { side: t.side, entry: t.entry, exit: t.exit, lots: t.lots, pnl: t.pnl, cuenta: cuenta1(t) }

const pg = montajeV1()
try {
  pg.arranca()
  const d = 'x8'
  pg.base(d)
  const a4 = pg.comoEjecutor(d, S4B), a6 = pg.comoEjecutor(d, S6)
  ver('control: sim-004b y sim-006 aplicadas', a4.ok && a6.ok, (a4.err + a6.err).slice(0, 200))
  pg.alumno(d, AL)
  const uno = q => pg.uno(d, q)
  const leeSesion = async id => { const t = uno(`select row_to_json(s)::text from public.sim_sessions s where id = ${L(id)}`); return t ? JSON.parse(t) : null }
  const puertos = { almacen: mercado, rpc: pg.rpc(d), leeSesion, ahora: () => Date.parse('2026-10-14T10:00:00Z') }
  const orden = { '/api/sim/crear': CR.ordenCrear, '/api/sim/tomar': TO.ordenTomar, '/api/sim/comando': CO.ordenComando, '/api/sim/estado': ES.ordenEstado }
  async function llamaBase(ruta, { cuerpo }) {
    const r = await orden[ruta]({ actor: AL, cuerpo, puertos })
    if (r.http === 429 && r.cuerpo?.motivo === 'demasiados_avances') uno('update public.sim_alumnos set siguiente_avance_desde = null')
    return { http: r.http, cuerpo: r.cuerpo }
  }
  // una puerta en el transporte: los comandos de la cartera (no los avances) se retienen hasta soltarla
  let retiene = false
  const colas = []
  const llama = async (ruta, o) => { if (retiene && ruta === '/api/sim/comando' && o?.cuerpo?.tipo !== 'avanzar') await new Promise(r => colas.push(r)); return llamaBase(ruta, o) }
  const suelta = () => { retiene = false; for (const r of colas.splice(0)) r() }
  const filasTrades = sid => JSON.parse(uno(`select coalesce(json_agg(t order by closed_at, id), '[]')::text from (select id, pair, side, entry_price, exit_price, lots, sl_price, tp_price, rr, pnl, result, opened_at, closed_at from public.sim_trades where session_id = ${L(sid)}) t`))
  const crea = async sid => (await llamaBase('/api/sim/crear', { cuerpo: { session_id: sid, command_id: nuevoId(), epoca: 1, name: 'S', pair: 'EUR/USD', timeframe: 'M1', date_from: '2025-01-06', date_to: '2025-12-31', capital: '100000', challenge_type: null } })).http === 201
  const cierraPestanas = () => uno("update public.sim_arrendamientos set hasta = now() - interval '1 minute'")
  async function pagina(sid) {
    process.env.NEXT_PUBLIC_SIM_V1_PANTALLA = 'encendido'
    const b = await banco({ sesion: await leeSesion(sid), userId: AL, espia, v1: { puertos: { llama, nuevoId, local: web(), almacenSesion: web(), plazoMs: 3000,
      leeTrades: async () => filasTrades(sid).map(HOOK.deFila), buscaHija: async () => null } } })
    for (let k = 0; k < 50 && !b.ps()?.ready; k++) { await asienta(20); await b.repinta() }
    await b.refs.v1Ref.current?.arranca()
    await b.repinta()
    return b
  }
  const asentado = async b => { await b.refs.v1Ref.current.cliente.recupera(); await asienta(60); await b.repinta() }

  titulo('M y P · a mercado y cierre parcial, BUY y SELL: lo que se ve cuadra con el P&L del servidor')
  const S1 = u(8101)
  ver('control: practica creada', await crea(S1))
  const b = await pagina(S1), pv = b.refs.v1Ref.current, T1 = b.caja.valor.trading
  ver('control: la pantalla v1 montada', !!pv)
  cero()
  await pv.avance({ engine: () => b.motor(), par: () => b.estado.activa }).irA(m(2))
  const close2 = b.motor().candles[b.motor().currentIndex]?.close
  // el OrderModal de hoy: entry = currentPrice (el close de la vela visible, el bid), como lo manda _SessionInner
  retiene = true
  const pA = pv.envia(OR.comandoAbrir({ pair: 'EUR/USD', side: 'BUY', lots: 2, cursor: pv.cursor() }), { entry: close2, openTime: m(2) })
  await asienta(10)
  const optB = b.ps().positions[0]?.entry
  suelta(); await pA; await asentado(b)
  const pB = b.ps().positions[0]
  oraculo('V1C08', 'M · BUY a mercado: la posicion se ve con la entrada del motor, el ask 1,10003, ya en el instante optimista y al confirmar',
    close2 === 1.1 && optB === 1.10003 && pB?.entry === 1.10003, tx({ close2, optB, pB: pB && { entry: pB.entry, lots: pB.lots } }))
  await T1.closePartial(pB.id, 'EUR/USD', 0.5)
  await asentado(b)
  const deBase = (sid, t) => filasTrades(sid).find(f => f.id === t?.id)
  const tP = b.ps().trades[0], fP = deBase(S1, tP)
  oraculo('V1C08', 'P · cierre parcial de 0,5 (BUY): la fila se ve con entrada 1,10003 y salida 1,1 (bid) y cuadra: (1,1 − 1,10003) × 100.000 × 0,5 − 1,5 = −3 = pnl del servidor',
    cuadra(tP, fP) && tP.exit === 1.1 && Number(tP.pnl) === -3, tx({ pantalla: fila(tP), base: fP && { e: fP.entry_price, x: fP.exit_price, pnl: fP.pnl } }))
  retiene = true
  const pC = T1.closePosition(pB.id, 'MANUAL', 'EUR/USD', 1.1)
  await asienta(10)
  const optC = b.ps().trades.at(-1)
  suelta(); await pC; await asentado(b)
  const tC = b.ps().trades.find(t => t.side === 'BUY' && Number(t.lots) === 1.5), fC = deBase(S1, tC)
  oraculo('V1C08', 'P · el resto (1,5 lotes, BUY): la fila optimista ya sale con entrada 1,10003 y salida al bid (1,1), y la confirmada cuadra: −4,5 − 4,5 = −9 = pnl del servidor',
    optC?.exit === 1.1 && Number(optC?.entry) === 1.10003 && cuadra(tC, fC) && Number(tC.pnl) === -9, tx({ optimista: fila(optC), pantalla: fila(tC), base: fC && { e: fC.entry_price, x: fC.exit_price, pnl: fC.pnl } }))
  retiene = true
  const pS = pv.envia(OR.comandoAbrir({ pair: 'EUR/USD', side: 'SELL', lots: 1, cursor: pv.cursor() }), { entry: close2, openTime: m(2) })
  await asienta(10)
  const optS = b.ps().positions[0]?.entry
  suelta(); await pS; await asentado(b)
  const pSs = b.ps().positions[0]
  oraculo('V1C08', 'M · SELL a mercado: entrada 1,1 (el bid), en el instante optimista y al confirmar', optS === 1.1 && pSs?.entry === 1.1 && pSs.side === 'SELL', tx({ optS, pSs: pSs && { entry: pSs.entry, side: pSs.side } }))
  retiene = true
  const pSc = T1.closePosition(pSs.id, 'MANUAL', 'EUR/USD', 1.1)
  await asienta(10)
  const optSc = b.ps().trades.at(-1)
  suelta(); await pSc; await asentado(b)
  const tS = b.ps().trades.find(t => t.side === 'SELL'), fS = deBase(S1, tS)
  oraculo('V1C08', 'M · cierre del SELL: la fila optimista y la confirmada salen al ask (1,10003); la confirmada cuadra: (1,1 − 1,10003) × 100.000 − 3 = −6 = pnl del servidor',
    optSc?.exit === 1.10003 && cuadra(tS, fS) && tS.exit === 1.10003 && Number(tS.pnl) === -6, tx({ optimista: fila(optSc), pantalla: fila(tS), base: fS && { e: fS.entry_price, x: fS.exit_price, pnl: fS.pnl } }))
  const tod = b.ps().trades
  oraculo('V1C08', 'M y P · las tres filas de la lista de operaciones cuadran con el P&L del servidor y el saldo es el del servidor (100.000 − 3 − 9 − 6 = 99.982)',
    tod.length === 3 && tod.every(t => cuadra(t, deBase(S1, t))) && b.estado.saldo === 99982, tx({ filas: tod.map(fila), saldo: b.estado.saldo }))
  oraculo('V1C08', 'S · en M y P: los espias de cierre a cero', sinCierres(), tx(espias()))

  titulo('L · limit BUY y SELL llenadas en el Play: el fill se ve con la entrada del motor y la fila cuadra')
  const S2 = u(8102)
  ver('control: practica creada (L)', await crea(S2))
  cierraPestanas()
  const c = await pagina(S2), cv = c.refs.v1Ref.current, T2 = c.caja.valor.trading
  cero()
  // el Play con un testigo en cada vela animada: la entrada de las posiciones que se ven en ese momento
  const visto = []
  const av = cv.avance({ engine: () => c.motor(), par: () => c.estado.activa, espera: async () => { visto.push([(c.motor().currentTime - M0) / 60, c.ps().positions.map(p => p.entry)]) } })
  await av.irA(m(2))
  await cv.envia(OR.comandoAbrir({ pair: 'EUR/USD', side: 'BUY_LIMIT', entry: 1.095, lots: 1, cursor: cv.cursor() }), { entry: 1.095, openTime: m(2) })
  await asentado(c)
  const rL = await av.play({ lote: 10, hasta: m(12) })
  await asentado(c)
  const pL = c.ps().positions[0]
  // la primera vela del Play en que se ve la posicion (la del fill: el minuto 10, o la siguiente si el testigo mira antes
  // de pintar la parada) y su entrada
  const enFill = visto.find(v => v[1].length > 0)
  await T2.closePosition(pL.id, 'MANUAL', 'EUR/USD', 1.09)
  await asentado(c)
  const tL = c.ps().trades[0], fL = deBase(S2, tL)
  oraculo('V1C08', 'L · BUY_LIMIT llenada en el minuto 10: desde la vela del fill la posicion se ve con la entrada del motor (sim_trades: el ask), la misma que al confirmar',
    rL.conclusion === 'llegado' && !!pL && !!enFill && enFill[0] <= 11 && tx(enFill[1]) === tx([pL.entry]) && pL.entry === Number(fL?.entry_price), tx({ c: rL.conclusion, enFill, confirmada: pL?.entry, base: fL?.entry_price, visto: visto.slice(-4) }))
  oraculo('V1C08', 'L · cierre de la BUY_LIMIT en el 12: salida al bid 1,09 y la fila cuadra con el pnl del servidor', cuadra(tL, fL) && tL.exit === 1.09, tx({ pantalla: fila(tL), base: fL && { e: fL.entry_price, x: fL.exit_price, pnl: fL.pnl } }))
  await cv.envia(OR.comandoAbrir({ pair: 'EUR/USD', side: 'SELL_LIMIT', entry: 1.095, lots: 1, cursor: cv.cursor() }), { entry: 1.095, openTime: m(12) })
  await asentado(c)
  visto.length = 0
  const rS = await av.play({ lote: 10, hasta: m(22) })
  await asentado(c)
  const pS2 = c.ps().positions[0]
  const enFillS = visto.find(v => v[1].length > 0)
  await T2.closePosition(pS2.id, 'MANUAL', 'EUR/USD', 1.1)
  await asentado(c)
  const tS2 = c.ps().trades.find(t => t.side === 'SELL'), fS2 = deBase(S2, tS2)
  oraculo('V1C08', 'L · SELL_LIMIT llenada en el minuto 20: desde la vela del fill se ve con la entrada del motor (sim_trades), la misma que al confirmar',
    rS.conclusion === 'llegado' && !!pS2 && pS2.side === 'SELL' && !!enFillS && enFillS[0] <= 21 && tx(enFillS[1]) === tx([pS2.entry]) && pS2.entry === Number(fS2?.entry_price), tx({ c: rS.conclusion, enFillS, confirmada: pS2?.entry, base: fS2?.entry_price }))
  oraculo('V1C08', 'L · cierre de la SELL_LIMIT en el 22: salida al ask 1,10003 y la fila cuadra con el pnl del servidor', cuadra(tS2, fS2) && tS2.exit === 1.10003, tx({ pantalla: fila(tS2), base: fS2 && { e: fS2.entry_price, x: fS2.exit_price, pnl: fS2.pnl } }))
  oraculo('V1C08', 'S · en L: los espias de cierre a cero', sinCierres(), tx(espias()))

  titulo('F · el fill del Play, puro (aplicaParadas): el precio del recibo tal cual, BUY y SELL')
  const base = { saldo: 100000, posiciones: [], ordenes: [{ id: 'o1', pair: 'EUR/USD', side: 'BUY_LIMIT', entry: 1.095, sl: null, tp: null, lots: 1 }, { id: 'o2', pair: 'EUR/USD', side: 'SELL_LIMIT', entry: 1.105, sl: null, tp: null, lots: 1 }],
    cotizaciones: { 'EUR/USD': { bid: 1.09, ask: 1.09003 } }, spreads: { 'EUR/USD': 0.00003 } }
  const ap = PA.aplicaParadas(base, [{ tipo: 'fill', orden: 'o1', posicion: 'p1', precio: '1.09003', lotes: '1', t: m(10) }, { tipo: 'fill', orden: 'o2', posicion: 'p2', precio: '1.10500', lotes: '1', t: m(10) }])
  oraculo('V1C08', 'F · aplicaParadas: el BUY llenado al ask 1,09003 se ve 1,09003 y el SELL a 1,105, 1,105 (nada de restar el spread)',
    tx(ap.posiciones.map(p => [p.side, p.entry])) === tx([['BUY', 1.09003], ['SELL', 1.105]]), tx(ap.posiciones.map(p => [p.side, p.entry])))
} finally { pg.cierra() }
fin()
