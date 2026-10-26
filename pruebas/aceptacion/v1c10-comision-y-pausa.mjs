/**
 * V1C10 · LA COMISION A LA VISTA Y LA REGLA DE LA 1-135 EN EL MODAL, EL CIERRE, LOS TIRADORES Y CANCELAR (orden 1-136 del
 * CTO; bandera v1 encendida). Escrita ANTES que el codigo (en c99e9c0: en rojo).
 *   K · la comision (3 USD por lote, la cobra el motor al abrir) se ve: la fila del trade lleva la de sim_trades
 *       (comision_micro, la que guarda el servidor; nada se calcula en la pantalla) y entrada, salida, comision y P&L
 *       cuadran; la posicion abierta, la del estado del servidor. El JOURNAL y POSICIONES ABIERTAS (SessionPanels) la
 *       enseñan en una columna «COMISIÓN» solo con la bandera encendida (conComision); apagada, la tabla de hoy
 *   M · pulsar Buy o Sell (abrir el modal) con el Play en marcha lo pausa ya (no al confirmar), y el modal enseña el precio
 *       al que de verdad se abre: el ask para Buy y el bid para Sell, el del motor con su spread, en la vela visible
 *       (= la confirmada). Con el Play parado, lo mismo sin pausar
 *   P · a 15× o mas, cerrar, mover un tirador o cancelar con el Play en marcha: primero se pausa y se aplica en lo que se
 *       ve (= lo confirmado tras la pausa). A 5× (lote de 1 vela) no se pausa (como hasta ahora)
 *   S · en todo: checkSLTP, checkLimitOrders, checkChallengeBreach, rutaComun y cierreEnVela no se llaman
 * Contra lib/servidor REAL y PostgreSQL desechable (montaje-v1 + sim-004b + sim-006). Datos inventados: EURUSD sube 0,1 pip
 * cada minuto (cada vela se reconoce por su precio); el resto de pares, constante.
 */
import { register } from 'node:module'
register('../espias-vela.mjs', import.meta.url)
const { titulo, ver, oraculo, fin, importa, fuente, asienta, escenario, monta } = await import('../lib.mjs')
const { hayPostgres } = await import('../pg-ensayo.mjs')
const { montajeV1, L, conUidDelMontaje } = await import('../montaje-v1.mjs')
const { cerrojoEnMemoria } = await import('../cerrojo-falso.mjs')
const N = 16
const HOOK = await importa('components/useSesionV1.js').catch(() => null)
if (!HOOK?.default) { for (let i = 0; i < N; i++) oraculo('V1C10', `caso ${i}: sin components/useSesionV1.js no se puede`, false, 'no esta'); fin() }
const AVA = await importa('lib/sim/v1/avance.js'), OR = await importa('lib/sim/v1/ordenes.js'), VI = await importa('lib/sim/v1/vista.js')
const SP = await importa('components/SessionPanels.js')
const tx = x => JSON.stringify(x, (k, v) => (typeof v === 'bigint' ? `${v}n` : v))

titulo('K · SessionPanels: la columna «COMISIÓN» solo con la bandera encendida')
{
  const fila = { id: 't1', pair: 'EUR/USD', side: 'BUY', entry: 1.10003, exit: 1.1005, lots: 1, rrReal: 0.5, pnl: 44, comision: 3, result: 'WIN', openTime: 1736150400, closeTime: 1736150460 }
  const pos = { id: 'p1', pair: 'EUR/USD', side: 'BUY', entry: 1.10013, sl: null, tp: null, lots: 2, comision: 6 }
  const pinta = extra => { const r = monta(SP.default, { showPos: true, setShowPos() {}, openPositions: [pos], closePosition() {}, currentPrice: 1.1, activePair: 'EUR/USD', setCloseModal() {},
    showOrders: false, setShowOrders() {}, pendingOrders: [], cancelLimitOrder() {}, showTrades: true, setShowTrades() {}, allTrades: [fila], ocupadas: new Set(), ...extra }); const t = r.texto(); r.desmonta(); return t }
  const con = pinta({ conComision: true }), sin = pinta({})
  oraculo('V1C10', 'K · con la bandera: el JOURNAL y POSICIONES ABIERTAS tienen la columna «COMISIÓN» con la del servidor en negativo (-3.00 y -6.00)',
    (con.match(/COMISIÓN/g) ?? []).length === 2 && con.includes('-3.00') && con.includes('-6.00'), con.slice(0, 400))
  oraculo('V1C10', 'K · sin la bandera: ni columna ni cifra (la tabla de hoy)', !sin.includes('COMISIÓN') && !sin.includes('-3.00') && !sin.includes('-6.00'), sin.slice(0, 300))
  const SI = fuente('components/_SessionInner.js')
  oraculo('V1C10', 'K · _SessionInner pasa conComision={!!v1Ref.current} a SessionPanels', SI.includes('conComision={!!v1Ref.current}'))
}

if (!hayPostgres()) { ver('PostgreSQL 17 local: NO hay', false); fin() }
const { banco, velasEnStorage } = await import('../banco-motor.mjs')
const P = await importa('lib/mercado/publicador-v1.mjs'), PV = await importa('lib/mercado/publica-v1.mjs')
const { minutoCerrado } = await importa('lib/mercado/calidad.mjs')
const CR = await importa('lib/servidor/crear.mjs'), TO = await importa('lib/servidor/tomar.mjs'), SO = await importa('lib/servidor/sobre.mjs')
const CO = await importa('lib/servidor/comando.mjs'), ES = await importa('lib/servidor/estado.mjs')
const HUECO = "v_guarda pg_catalog.text := '⟦HUECO guarda canonica⟧';"
const deEnsayo = t => { if (t.split(HUECO).length !== 2) throw new Error('el hueco no esta una vez'); return t.replace(HUECO, "v_guarda pg_catalog.text := 'montaje de ensayo (v1c10)';") }
const S4B = conUidDelMontaje(fuente('sql/sim-004b-contrato-v1.sql')), S6 = deEnsayo(fuente('sql/sim-006-tope-de-pasos.sql'))
const u = k => `00000000-0000-4000-8000-${String(k).padStart(12, '0')}`
const U = iso => Date.parse(iso) / 1000
const M0 = U('2025-01-06T00:00:00Z')
const PX = { AUDCAD: 0.9, AUDUSD: 0.65, EURUSD: 1.1, GBPJPY: 190.5, GBPUSD: 1.3, NZDUSD: 0.6, USDCAD: 1.37, USDCHF: 0.88, USDJPY: 150.2 }
const precioEn = (par, t) => (par === 'EURUSD' ? Number((1.1 + (((t - M0) / 60) % 1000) * 0.00001).toFixed(5)) : PX[par])
function velasDe(par) { const o = []; for (let t = M0; t < U('2025-01-11T00:00:00Z'); t += 60) if (!minutoCerrado(t)) { const p = precioEn(par, t); o.push({ time: t, open: p, high: p, low: p, close: p, volume: 1 }) } return o }
function almacen() { const o = new Map(); return { o, async lee(r) { return o.has(r) ? Buffer.from(o.get(r)) : null }, async sube(r, b, { upsert = false } = {}) { if (!upsert && o.has(r)) return 'existe'; o.set(r, Buffer.from(b)); return 'ok' }, async borra(r) { o.delete(r) }, async lista() { return [] } } }
const mercado = almacen()
await PV.publica({ cerrojo: cerrojoEnMemoria(), almacen: mercado, planes: SO.PARES.map(par => P.planificaPar({ par, velas: velasDe(par), texto: '', anterior: null, diasAceptados: new Map() })), dueno: 'mercado-v1-publica', ahora: '2026-10-14T09:00:00.000Z' })
const web = () => { const o = new Map(); return { getItem: k => (o.has(k) ? o.get(k) : null), setItem: (k, v) => o.set(k, String(v)), removeItem: k => o.delete(k) } }
const AL = u(1)
let nId = 98000
const nuevoId = () => u(++nId)
const cuenta = {}
const espia = (n, f) => (typeof f !== 'function' ? f : (...a) => { cuenta[n] = (cuenta[n] ?? 0) + 1; return f(...a) })
const espias = () => ({ ...cuenta, ...(globalThis.__espiasVela ?? {}) })
const cero = () => { for (const k of Object.keys(cuenta)) delete cuenta[k]; globalThis.__espiasVela = {} }
const sinCierres = () => { const e = espias(); return ['checkSLTP', 'checkLimitOrders', 'checkChallengeBreach', 'rutaComun', 'cierreEnVela'].every(k => !e[k]) }
escenario({})
velasEnStorage('EUR/USD', velasDe('EURUSD'), [2024], { tramoAbierto: true })
const r5 = x => Number(Number(x).toFixed(5))

const pg = montajeV1()
try {
  pg.arranca()
  const d = 'x10'
  pg.base(d)
  const a4 = pg.comoEjecutor(d, S4B), a6 = pg.comoEjecutor(d, S6)
  ver('control: sim-004b y sim-006 aplicadas', a4.ok && a6.ok, (a4.err + a6.err).slice(0, 200))
  pg.alumno(d, AL)
  const uno = q => pg.uno(d, q)
  const leeSesion = async id => { const t = uno(`select row_to_json(s)::text from public.sim_sessions s where id = ${L(id)}`); return t ? JSON.parse(t) : null }
  const puertos = { almacen: mercado, rpc: pg.rpc(d), leeSesion, ahora: () => Date.parse('2026-10-14T10:00:00Z') }
  const orden = { '/api/sim/crear': CR.ordenCrear, '/api/sim/tomar': TO.ordenTomar, '/api/sim/comando': CO.ordenComando, '/api/sim/estado': ES.ordenEstado }
  async function llama(ruta, { cuerpo }) {
    const r = await orden[ruta]({ actor: AL, cuerpo, puertos })
    if (r.http === 429 && r.cuerpo?.motivo === 'demasiados_avances') uno('update public.sim_alumnos set siguiente_avance_desde = null')
    return { http: r.http, cuerpo: r.cuerpo }
  }
  // las filas de sim_trades como las lee la pagina (to_jsonb: todas las columnas, la comision incluida)
  const filas = sid => JSON.parse(uno(`select coalesce(json_agg(to_jsonb(t) order by closed_at, id), '[]')::text from public.sim_trades t where session_id = ${L(sid)}`))
  let nS = 9300
  async function pagina() {
    const sid = u(++nS)
    const c = await llama('/api/sim/crear', { cuerpo: { session_id: sid, command_id: nuevoId(), epoca: 1, name: 'S', pair: 'EUR/USD', timeframe: 'M1', date_from: '2025-01-06', date_to: '2025-12-31', capital: '100000', challenge_type: null } })
    ver(`control: practica creada (${sid.slice(-4)})`, c.http === 201, tx(c))
    uno("update public.sim_arrendamientos set hasta = now() - interval '1 minute'")
    process.env.NEXT_PUBLIC_SIM_V1_PANTALLA = 'encendido'
    const b = await banco({ sesion: await leeSesion(sid), userId: AL, espia, v1: { puertos: { llama, nuevoId, local: web(), almacenSesion: web(), plazoMs: 5000, leeTrades: async () => filas(sid).map(HOOK.deFila), buscaHija: async () => null } } })
    for (let k = 0; k < 50 && !b.ps()?.ready; k++) { await asienta(20); await b.repinta() }
    await b.refs.v1Ref.current?.arranca()
    await b.repinta()
    return { b, sid }
  }
  const asentado = async b => { await b.refs.v1Ref.current.cliente.recupera(); await asienta(60); await b.repinta() }
  // el Play de la pagina (_SessionInner avanceV1) a la velocidad v; enEspera(n) se llama en la espera n-esima
  function playDePagina(b, v, enEspera) {
    const pv = b.refs.v1Ref.current
    let acc = 0, n = 0
    const espera = () => {
      n++; enEspera?.(n)
      acc += 1000 / Math.max(1, v); if (acc < 16) return; const ms = acc; acc = 0
      return new Promise(r => setTimeout(r, ms))
    }
    const av = pv.avance({ engine: () => b.motor(), par: () => b.estado.activa, espera })
    return { av, corre: () => av.play({ lote: AVA.loteDelPlay(v) }) }
  }
  // una accion del alumno en la espera K del Play (con salvaguarda: si el Play no se para solo, a mano 25 esperas despues)
  async function duranteElPlay(b, v, K, accion) {
    let prom = null, tope = false, visAlPulsar = null
    const pl = playDePagina(b, v, n => {
      if (n > K + 25 && !tope) { tope = true; pl.av.pausa() }
      if (n === K && !prom) { visAlPulsar = b.motor().currentTime; prom = accion() }
    })
    const r = await pl.corre()
    const ra = await prom
    await asentado(b)
    return { r, ra, tope, visAlPulsar, vis: b.motor().currentTime, cur: b.refs.v1Ref.current.cursor(), reproduciendo: pl.av.reproduciendo }
  }
  const min = t => (t == null ? null : (t - M0) / 60)

  titulo('K · la comision de la fila y de la posicion, la del servidor')
  const { b: b1, sid: s1 } = await pagina()
  const pv1 = b1.refs.v1Ref.current, T1 = b1.caja.valor.trading
  cero()
  await pv1.avance({ engine: () => b1.motor(), par: () => b1.estado.activa }).irA(M0 + 60 * 5)
  await pv1.envia(OR.comandoAbrir({ pair: 'EUR/USD', side: 'BUY', lots: 2, cursor: pv1.cursor() }), { entry: precioEn('EURUSD', M0 + 300), openTime: M0 + 300 })
  await asentado(b1)
  const pA = b1.ps().positions[0]
  oraculo('V1C10', 'K · la posicion abierta (2 lotes) lleva la comision que el motor cobro al abrir: 6 USD, del estado del servidor', pA?.comision === 6, tx(pA))
  await pv1.avance({ engine: () => b1.motor(), par: () => b1.estado.activa }).irA(M0 + 60 * 40)
  await T1.closePartial(pA.id, 'EUR/USD', 0.5)
  await asentado(b1)
  await T1.closePosition(pA.id, 'MANUAL', 'EUR/USD', b1.estado.precio)
  await asentado(b1)
  // los dos cierres son de la misma vela (misma closed_at): se miran por lotes, no por el orden de la lectura
  const porLotes = (a, b) => Number(a.lots) - Number(b.lots)
  const tr = [...b1.ps().trades].sort(porLotes), fs = filas(s1).sort(porLotes)
  const cuadra = t => Math.abs((t.exit - t.entry) * 100000 * t.lots - t.comision - t.pnl) < 0.006
  oraculo('V1C10', 'K · las filas (parcial 0,5 y resto 1,5 lotes) llevan la comision de sim_trades: 1,5 y 4,5 USD',
    tr.length === 2 && tr[0].comision === 1.5 && tr[1].comision === 4.5 && fs.length === 2 && Number(fs[0].comision_micro) === 1500000 && Number(fs[1].comision_micro) === 4500000, tx({ tr: tr.map(t => [t.lots, t.comision]), fs: fs.map(f => [f.lots, f.comision_micro]) }))
  oraculo('V1C10', 'K · entrada, salida, comision y P&L cuadran a la vista: (salida − entrada) × 100.000 × lotes − comision = P&L', tr.length === 2 && tr.every(cuadra), tx(tr.map(t => ({ entry: t.entry, exit: t.exit, lots: t.lots, comision: t.comision, pnl: t.pnl }))))

  titulo('M · pulsar Buy o Sell: pausa ya y el modal enseña el ask (Buy) o el bid (Sell)')
  const SI = fuente('components/_SessionInner.js')
  oraculo('V1C10', 'M · _SessionInner: la barra de abajo abre el modal por abreOrden, que en v1 pide preparaOrden (pausa y precio) antes de abrirlo',
    /const abreOrden=async\s*m=>\{[^\n]*v1Ref\.current\.preparaOrden\(m\.side,m\.pair\)/.test(SI) && SI.includes('setOrderModal={abreOrden}'))
  for (const [v, lado, K] of [[60, 'BUY', 17], [15, 'SELL', 5], [1, 'BUY', 3]]) {
    const prep = b1.refs.v1Ref.current.preparaOrden
    const o = await duranteElPlay(b1, v, K, async () => { const p = await prep?.(lado, 'EUR/USD'); return { p, rep: null } })
    const esperado = r5(precioEn('EURUSD', o.vis) + (lado === 'BUY' ? 0.00003 : 0))
    oraculo('V1C10', `M · ${v}×, ${lado}: al pulsar, el Play se pausa ya (sin esperar a confirmar) en la vela confirmada, y el modal enseña ${lado === 'BUY' ? 'el ask (close + spread)' : 'el bid'} de esa vela`,
      typeof prep === 'function' && !o.tope && o.r?.conclusion === 'pausado' && o.vis === o.cur && o.ra?.p === esperado, tx({ c: o.r?.conclusion, tope: o.tope, vis: min(o.vis), cur: min(o.cur), precio: o.ra?.p, esperado }))
  }
  {
    const p = await b1.refs.v1Ref.current.preparaOrden?.('SELL', 'EUR/USD')
    oraculo('V1C10', 'M · con el Play parado: no pausa nada y enseña el bid de la vela visible', p === r5(precioEn('EURUSD', b1.motor().currentTime)), tx({ p, vis: min(b1.motor().currentTime) }))
  }

  titulo('P · a 15× o mas, cerrar, mover un tirador o cancelar con el Play en marcha: pausa primero y se aplica en lo que se ve')
  const { b: b2 } = await pagina()
  const pv2 = b2.refs.v1Ref.current, T2 = b2.caja.valor.trading
  await pv2.avance({ engine: () => b2.motor(), par: () => b2.estado.activa }).irA(M0 + 60 * 5)
  for (let i = 0; i < 3; i++) await pv2.envia(OR.comandoAbrir({ pair: 'EUR/USD', side: 'BUY', lots: 1, sl: 1.05, tp: 1.2, cursor: pv2.cursor() }), { entry: 1.1, openTime: M0 + 300 })
  await pv2.envia(OR.comandoAbrir({ pair: 'EUR/USD', side: 'BUY_LIMIT', entry: 1.05, lots: 1, sl: 1.04, tp: 1.2, cursor: pv2.cursor() }), { entry: 1.05, openTime: M0 + 300 })
  await asentado(b2)
  const [q1, q2, q3] = b2.ps().positions.map(p => p.id), o1 = b2.ps().orders[0]?.id
  ver('control: 3 posiciones y 1 pendiente', !!q3 && !!o1, tx({ p: b2.ps().positions.length, o: b2.ps().orders.length }))
  {
    const o = await duranteElPlay(b2, 60, 17, () => T2.closePosition(q1, 'MANUAL', 'EUR/USD', b2.estado.precio))
    const t = b2.ps().trades.at(-1)
    oraculo('V1C10', 'P · 60×: cerrar con el Play en marcha lo pausa primero; el cierre es en la vela visible (= la confirmada): salida = el bid de esa vela',
      !o.tope && o.r?.conclusion === 'pausado' && o.vis === o.cur && !!t && t.exit === r5(precioEn('EURUSD', o.vis)) && !b2.ps().positions.some(p => p.id === q1), tx({ c: o.r?.conclusion, tope: o.tope, vis: min(o.vis), cur: min(o.cur), t: t && { exit: t.exit, cierre: min(t.closeTime) } }))
  }
  {
    const o = await duranteElPlay(b2, 15, 5, () => T2.handlePositionDragEnd(q2, 'sl', 1.06))
    const p = b2.ps().positions.find(x => x.id === q2)
    oraculo('V1C10', 'P · 15×: mover el tirador del SL con el Play en marcha lo pausa primero y el SL queda movido (1,06) en la vela visible',
      !o.tope && o.r?.conclusion === 'pausado' && o.vis === o.cur && o.ra?.conclusion === 'confirmado' && p?.sl === 1.06, tx({ c: o.r?.conclusion, tope: o.tope, vis: min(o.vis), cur: min(o.cur), ra: o.ra?.conclusion, sl: p?.sl }))
  }
  {
    const o = await duranteElPlay(b2, 500, 230, () => T2.cancelLimitOrder(o1, 'EUR/USD'))
    oraculo('V1C10', 'P · ∞: cancelar con el Play en marcha lo pausa primero; la pendiente ya no esta, en la vela visible',
      !o.tope && o.r?.conclusion === 'pausado' && o.vis === o.cur && o.ra?.conclusion === 'confirmado' && b2.ps().orders.length === 0, tx({ c: o.r?.conclusion, tope: o.tope, vis: min(o.vis), cur: min(o.cur), ra: o.ra?.conclusion, o: b2.ps().orders.length }))
  }
  {
    const o = await duranteElPlay(b2, 5, 4, () => T2.closePosition(q3, 'MANUAL', 'EUR/USD', b2.estado.precio))
    oraculo('V1C10', 'P · 5× (lote de 1 vela): cerrar con el Play en marcha NO lo pausa (como hasta ahora); el cierre se confirma',
      o.tope && o.ra?.conclusion === 'confirmado' && !b2.ps().positions.some(p => p.id === q3), tx({ tope: o.tope, ra: o.ra?.conclusion }))
  }
  oraculo('V1C10', 'S · en todo: checkSLTP, checkLimitOrders, checkChallengeBreach, rutaComun y cierreEnVela no se llaman', sinCierres(), tx(espias()))
} finally { pg.cierra() }
fin()
