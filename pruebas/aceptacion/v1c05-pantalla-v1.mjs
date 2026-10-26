/**
 * V1C05 · LA PANTALLA V1 ENCENDIDA (etapa 2 del motor, piezas 6 y 7; orden 1-125 del CTO; SIMMOTOR1-01 de Astra). Escrita
 * ANTES que el codigo (sin components/useSesionV1.js ni lib/sim/v1/crear.js: en rojo).
 *   A · el dashboard con NEXT_PUBLIC_SIM_V1_PANTALLA=encendido crea la sesion por /api/sim/crear (v1, desde cero:
 *       saldo = capital); apagada, el insert de hoy (la linea sigue y la bandera se lee literal)
 *   B · la pagina en modo v1 (los hooks REALES en el banco, con useSesionV1 como en _SessionInner): abrir, la limit,
 *       el tirador, cerrar total y parcial y cancelar son comandos; lo pintado (posiciones, pendientes, trades y saldo)
 *       es el estado del servidor; el Play pasa por el fill, el SL y el TP sin pararse
 *   C · reto 2F: el breach lo confirma el servidor; el HUD y el modal salen del estado (adaptador: dd_daily, ddDailyPct);
 *       superada → el modal de fase y /api/sim/avanzar-fase, y a la hija
 *   S · SIMMOTOR1-01, en todo B y C: checkSLTP, checkLimitOrders, checkChallengeBreach (sus refs puente) y rutaComun y
 *       cierreEnVela (pruebas/espias-vela.mjs) NO se llaman ni una vez
 *   D · control positivo con la bandera APAGADA (la misma sesion v1): v1Ref null, y los espias SI cuentan (el banco
 *       los ve)
 * Contra lib/servidor REAL y PostgreSQL desechable (montaje-v1 + sim-004b + sim-006, como v1c04). Datos inventados.
 * Mercado: EURUSD 1,1 hasta el minuto 10 del 6-ene-2025; 1,09 del 10 al 19; 1,1 desde el 20. El resto, constante.
 */
import { register } from 'node:module'
register('../espias-vela.mjs', import.meta.url)
const { titulo, ver, oraculo, fin, importa, fuente, asienta, escenario } = await import('../lib.mjs')
const { hayPostgres } = await import('../pg-ensayo.mjs')
const { montajeV1, L, conUidDelMontaje } = await import('../montaje-v1.mjs')
const { cerrojoEnMemoria } = await import('../cerrojo-falso.mjs')
const N = 18
const HOOK = await importa('components/useSesionV1.js').catch(() => null), CRV = await importa('lib/sim/v1/crear.js').catch(() => null)
if (!HOOK?.default || !CRV?.creaSesionV1) { for (let i = 0; i < N; i++) oraculo('V1C05', `caso ${i}: sin components/useSesionV1.js ni lib/sim/v1/crear.js no se puede`, false, 'no esta'); fin() }
if (!hayPostgres()) { ver('PostgreSQL 17 local: NO hay', false); fin() }
const { banco, velasEnStorage } = await import('../banco-motor.mjs')
const { router } = await import('../next-falso.mjs')
const OR = await importa('lib/sim/v1/ordenes.js'), VI = await importa('lib/sim/v1/vista.js'), BA = await importa('lib/sim/v1/bandera.js')
const P = await importa('lib/mercado/publicador-v1.mjs'), PV = await importa('lib/mercado/publica-v1.mjs')
const { minutoCerrado } = await importa('lib/mercado/calidad.mjs')
const CR = await importa('lib/servidor/crear.mjs'), TO = await importa('lib/servidor/tomar.mjs'), SO = await importa('lib/servidor/sobre.mjs')
const CO = await importa('lib/servidor/comando.mjs'), ES = await importa('lib/servidor/estado.mjs'), FA = await importa('lib/servidor/fase.mjs')
const CA = await importa('lib/motor/cartera.mjs')
const HUECO = "v_guarda pg_catalog.text := '⟦HUECO guarda canonica⟧';"
const deEnsayo = t => { if (t.split(HUECO).length !== 2) throw new Error('el hueco no esta una vez'); return t.replace(HUECO, "v_guarda pg_catalog.text := 'montaje de ensayo (v1c05)';") }
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
let nId = 50000
const nuevoId = () => u(++nId)
// los espias: las refs puente del banco y las dos funciones de la regla de la vela
const cuenta = {}
const espia = (n, f) => (typeof f !== 'function' ? f : (...a) => { cuenta[n] = (cuenta[n] ?? 0) + 1; return f(...a) })
const espias = () => ({ ...cuenta, ...(globalThis.__espiasVela ?? {}) })
const cero = () => { for (const k of Object.keys(cuenta)) delete cuenta[k]; globalThis.__espiasVela = {} }
const sinCierres = () => { const e = espias(); return ['checkSLTP', 'checkLimitOrders', 'checkChallengeBreach', 'rutaComun', 'cierreEnVela'].every(k => !e[k]) }
// la pagina pide las velas del par visible a /api/candles (Storage doble), como siempre
escenario({})
velasEnStorage('EUR/USD', velasDe('EURUSD'), [2024], { tramoAbierto: true })

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
    const puertos = { almacen: mercado, rpc: pg.rpc(d), leeSesion, ahora: () => Date.parse('2026-10-14T10:00:00Z') }
    const orden = { '/api/sim/crear': CR.ordenCrear, '/api/sim/tomar': TO.ordenTomar, '/api/sim/comando': CO.ordenComando, '/api/sim/estado': ES.ordenEstado, '/api/sim/avanzar-fase': FA.ordenFase }
    const llamadas = []
    async function llama(ruta, { cuerpo }) {
      const r = await orden[ruta]({ actor: AL, cuerpo, puertos })
      llamadas.push({ ruta, tipo: cuerpo?.tipo ?? null, http: r.http })
      if (r.http === 429 && r.cuerpo?.motivo === 'demasiados_avances') uno('update public.sim_alumnos set siguiente_avance_desde = null')
      return { http: r.http, cuerpo: r.cuerpo }
    }
    const trades = sid => JSON.parse(uno(`select coalesce(json_agg(json_build_object('id', id, 'pair', pair, 'side', side, 'entry_price', entry_price, 'exit_price', exit_price, 'lots', lots, 'pnl', pnl, 'result', result, 'closed_at', closed_at) order by closed_at, id), '[]')::text from public.sim_trades where session_id = ${L(sid)}`))
    const puertosPagina = sid => ({ llama, nuevoId, local: web(), almacenSesion: web(), plazoMs: 3000,
      leeTrades: async () => trades(sid).map(t => ({ id: t.id, pair: t.pair, side: t.side, entry: t.entry_price, exit: t.exit_price, lots: t.lots, pnl: t.pnl, result: t.result })),
      buscaHija: async () => uno(`select id from public.sim_sessions where challenge_parent_id = ${L(sid)} limit 1`) || null })
    const servidor = async sid => VI.vistaDe((await ES.ordenEstado({ actor: AL, cuerpo: { session_id: sid }, puertos })).cuerpo)
    return { d, uno, llama, llamadas, leeSesion, puertos, trades, puertosPagina, servidor }
  }
  // la pagina con la pantalla v1 (si la bandera esta encendida); espera a que el par visible tenga velas
  async function pagina(B, sid) {
    const fila = await B.leeSesion(sid)
    cero()
    const b = await banco({ sesion: fila, userId: AL, v1: { puertos: B.puertosPagina(sid) }, espia })
    for (let k = 0; k < 50 && !b.ps()?.ready; k++) { await asienta(20); await b.repinta() }
    await b.refs.v1Ref.current?.arranca()
    await b.repinta()
    return b
  }
  const avance = b => b.refs.v1Ref.current.avance({ engine: () => b.motor() })
  const igualServidor = async (B, sid, b) => {
    const v = VI.delPar(await B.servidor(sid), 'EUR/USD'), ps = b.ps()
    const pos = x => x.map(p => [p.id, p.side, p.entry, p.sl, p.tp, p.lots]), ord = x => x.map(o => [o.id, o.side, o.entry, o.sl, o.tp, o.lots])
    return { ok: tx(pos(ps.positions)) === tx(pos(v.posiciones)) && tx(ord(ps.orders ?? [])) === tx(ord(v.ordenes)) && b.estado.saldo === v.saldo, pantalla: { pos: pos(ps.positions), ord: ord(ps.orders ?? []), saldo: b.estado.saldo }, servidor: { pos: pos(v.posiciones), ord: ord(v.ordenes), saldo: v.saldo } }
  }

  titulo('A · el dashboard crea la sesion por /api/sim/crear con la bandera encendida')
  delete process.env.NEXT_PUBLIC_SIM_V1_PANTALLA
  ver('control: sin la variable, la bandera esta apagada', BA.pantallaV1() === false)
  process.env.NEXT_PUBLIC_SIM_V1_PANTALLA = 'encendido'
  const B1 = await base('q1')
  const form = { name: 'Mi sesion', pair: 'EUR/USD', dateFrom: '2025-01-06', dateTo: '2025-12-31', capital: 100000 }
  const cA = await CRV.creaSesionV1({ llama: B1.llama, nuevoId, form })
  const fA = cA.ok ? await B1.leeSesion(cA.id) : null
  oraculo('V1C05', 'A · creaSesionV1: 201 por /api/sim/crear; la fila es v1 (motor_version 1) desde cero: saldo = capital = 100.000, sin reto', cA.ok && fA?.motor_version === 1 && Number(fA.balance) === 100000 && Number(fA.capital) === 100000 && fA.challenge_type == null && B1.llamadas.some(x => x.ruta === '/api/sim/crear' && x.http === 201), tx({ cA, mv: fA?.motor_version, bal: fA?.balance }))
  const dash = fuente('pages/dashboard.js'), iV1 = dash.indexOf('if (pantallaV1()) {'), iIns = dash.indexOf(".from('sim_sessions').insert(")
  oraculo('V1C05', 'A · dashboard.js: con pantallaV1() llama a creaSesionV1 ANTES del insert de hoy, que sigue ahi para la bandera apagada', iV1 > 0 && iIns > iV1 && dash.slice(iV1, iIns).includes('creaSesionV1(') && /return\s*\n\s*}\s*\n\s*const \{ data, error \} = await supabase\.from\('sim_sessions'\)\.insert\(/.test(dash.slice(iV1)), tx({ iV1, iIns }))
  oraculo('V1C05', 'A · la bandera de cliente va escrita literal (Next la copia al construir)', fuente('lib/sim/v1/bandera.js').includes('process.env.NEXT_PUBLIC_SIM_V1_PANTALLA'))

  titulo('B · la pagina en modo v1: ordenes como comandos, lo pintado = el servidor, Play sin paradas')
  const S1 = cA.id
  const b = await pagina(B1, S1)
  const pv = b.refs.v1Ref.current
  oraculo('V1C05', 'B · con la bandera encendida y una sesion v1, la pagina monta la pantalla v1 (v1Ref) y el saldo es el del servidor (100.000)', !!pv && b.estado.saldo === 100000, tx({ v1: !!pv, saldo: b.estado.saldo }))
  const av = avance(b)
  const r0 = await av.irA(m(2))
  const ab = await pv.envia(OR.comandoAbrir({ pair: 'EUR/USD', side: 'BUY', lots: 1, sl: 1.095, cursor: pv.cursor() }))
  await b.pendiente({ side: 'BUY_LIMIT', entry: 1.0901, sl: 1.08, tp: 1.095, lots: 1 })
  // confirmLimitOrder no espera al comando: se espera a la serie del cliente y a que se vuelque
  await pv.cliente.recupera(); await asienta(40); await b.repinta()
  const i1 = await igualServidor(B1, S1, b)
  oraculo('V1C05', 'B · abrir a mercado y la limit (confirmLimitOrder REAL) son comandos: la pantalla tiene la posicion y la pendiente del servidor, ni mas ni menos', r0.conclusion === 'llegado' && ab.conclusion === 'confirmado' && i1.ok && i1.pantalla.pos.length === 1 && i1.pantalla.ord.length === 1, tx({ r0: r0.conclusion, ab: ab.conclusion, i1 }))
  oraculo('V1C05', 'B · _SessionInner manda el OrderModal como comando en modo v1 (la linea que el banco copia sigue ahi)', fuente('components/_SessionInner.js').includes('v1Ref.current.envia(comandoAbrir({pair:m.pair,side:m.isLimit?'))
  const p1 = b.ps().positions[0]?.id
  await b.caja.valor.trading.handlePositionDragEnd(p1, 'sl', 1.095514)
  await b.repinta()
  const i2 = await igualServidor(B1, S1, b)
  oraculo('V1C05', 'B · el tirador manda modificar: el SL soltado en 1,095514 es 1,09551 (al tick) en el servidor y en la pantalla', i2.ok && b.ps().positions[0]?.sl === 1.09551, tx(i2))
  const rP = await av.play({ lote: 10, hasta: m(30) })
  await b.repinta()
  const i3 = await igualServidor(B1, S1, b), tr3 = B1.trades(S1)
  oraculo('V1C05', 'B · Play hasta el 30 en una llamada (el SL y el fill del 10 y el TP del 20 no lo paran); la grafica anima hasta el 30', rP.conclusion === 'llegado' && b.motor().currentTime === m(30), tx({ c: rP.conclusion, t: (b.motor().currentTime - M0) / 60 }))
  oraculo('V1C05', 'B · tras el Play, lo pintado = el servidor: sin posiciones ni pendientes, 2 trades (SL y TP) y su saldo', i3.ok && i3.pantalla.pos.length === 0 && i3.pantalla.ord.length === 0 && tr3.length === 2 && b.ps().trades.length === 2, tx({ i3, trades: tr3.length, pinta: b.ps().trades.length }))
  await pv.envia(OR.comandoAbrir({ pair: 'EUR/USD', side: 'SELL', lots: 2, cursor: pv.cursor() }))
  await b.repinta()
  const p2 = b.ps().positions[0]?.id
  await b.caja.valor.trading.closePartial(p2, 'EUR/USD', 0.5)
  await b.repinta()
  const parcial = b.ps().positions[0]?.lots
  await b.caja.valor.trading.closePosition(p2, 'MANUAL', 'EUR/USD', 1.1)
  await b.repinta()
  await pv.envia(OR.comandoAbrir({ pair: 'EUR/USD', side: 'SELL_LIMIT', entry: 1.12, lots: 1 }))
  await b.repinta()
  const o3 = b.ps().orders[0]?.id
  await b.caja.valor.trading.cancelLimitOrder(o3, 'EUR/USD')
  await b.repinta()
  const i4 = await igualServidor(B1, S1, b)
  oraculo('V1C05', 'B · cerrar parcial (1,5 lotes quedan), cerrar total y cancelar son comandos: al final nada abierto, 4 trades, como el servidor', parcial === 1.5 && i4.ok && i4.pantalla.pos.length === 0 && i4.pantalla.ord.length === 0 && B1.trades(S1).length === 4 && b.ps().trades.length === 4, tx({ parcial, i4, trades: B1.trades(S1).length }))
  oraculo('V1C05', 'S · en todo B: checkSLTP, checkLimitOrders, checkChallengeBreach, rutaComun y cierreEnVela no se llaman', sinCierres(), tx(espias()))

  titulo('C · reto 2F: breach y fase, del estado del servidor')
  const B2 = await base('q2')
  const S2 = u(2002)
  ver('control: reto 2F creado por /api/sim/crear', (await B2.llama('/api/sim/crear', { cuerpo: { session_id: S2, command_id: nuevoId(), epoca: 1, name: 'R', pair: 'EUR/USD', timeframe: 'M1', date_from: '2025-01-06', date_to: '2025-12-31', capital: '100000', challenge_type: '2F' } })).http === 201)
  const c = await pagina(B2, S2)
  const cv = c.refs.v1Ref.current, cav = avance(c)
  await cav.irA(m(5))
  await cv.envia(OR.comandoAbrir({ pair: 'EUR/USD', side: 'BUY', lots: 6, cursor: cv.cursor() }))
  const rB = await cav.play({ lote: 10, hasta: m(30) })
  await c.repinta(); await asienta(40); await c.repinta()
  const st = c.caja.valor.reto.challengeStatus
  oraculo('V1C05', 'C · el Play no se para antes del breach del minuto 10: acaba porque la sesion termino (terminada)', rB.conclusion === 'terminada', tx(rB))
  oraculo('V1C05', 'C · HUD y modal del estado: failed_dd_daily, failureReason dd_daily (adaptador), config.ddDailyPct 5, saldo 93.964; el modal de fallo se abre', st?.evaluation?.status === 'failed_dd_daily' && st.evaluation.failureReason === 'dd_daily' && st.config?.ddDailyPct === 5 && st.evaluation.balanceNow === 93964 && c.caja.valor.reto.challengeModal === 'failed', tx({ s: st?.evaluation?.status, f: st?.evaluation?.failureReason, p: st?.config?.ddDailyPct, b: st?.evaluation?.balanceNow, modal: c.caja.valor.reto.challengeModal }))
  oraculo('V1C05', 'C · lo pintado = el servidor tras el breach (sin posiciones; saldo)', (await igualServidor(B2, S2, c)).ok)
  const S3 = u(3003)
  await B2.llama('/api/sim/crear', { cuerpo: { session_id: S3, command_id: nuevoId(), epoca: 1, name: 'R2', pair: 'EUR/USD', timeframe: 'M1', date_from: '2025-01-06', date_to: '2025-12-31', capital: '100000', challenge_type: '2F' } })
  const f3 = await B2.leeSesion(S3)
  const est = CA.deserializa(JSON.stringify(f3.estado))
  est.motor.saldo_µ = 110500_000000n; est.estado = 'superada'; est.superada = { saldo_µ: 110500_000000n, dias: 4, en: { t: m(5) } }; est.dias_con_apertura = ['2025-01-01', '2025-01-02', '2025-01-03', '2025-01-06']
  B2.uno(`update public.sim_sessions set estado = ${L(JSON.parse(CA.serializa(est)))}::jsonb where id = ${L(S3)}`)
  const g = await pagina(B2, S3)
  await g.caja.valor.reto.refreshChallengeStatus(); await g.repinta(); await asienta(40); await g.repinta()
  oraculo('V1C05', 'C · fase superada en el servidor: el modal de fase (passed_phase) se abre', g.caja.valor.reto.challengeModal === 'passed_phase', tx({ modal: g.caja.valor.reto.challengeModal, st: g.caja.valor.reto.challengeStatus?.evaluation?.status }))
  const nav0 = router.navegado.length
  await g.caja.valor.reto.handleChallengePass()
  const hija = B2.uno(`select id from public.sim_sessions where challenge_parent_id = ${L(S3)}`)
  const fh = hija ? await B2.leeSesion(hija) : null
  oraculo('V1C05', 'C · «Continuar» manda /api/sim/avanzar-fase y lleva a la hija (fase 2 v1)', !!hija && fh?.estado?.fase === 2 && fh.motor_version === 1 && tx(router.navegado.slice(nav0)) === tx([['push', `/session/${hija}`]]) && B2.llamadas.some(x => x.ruta === '/api/sim/avanzar-fase' && x.http < 300), tx({ hija, fase: fh?.estado?.fase, nav: router.navegado.slice(nav0) }))
  oraculo('V1C05', 'S · en todo C: checkSLTP, checkLimitOrders, checkChallengeBreach, rutaComun y cierreEnVela no se llaman', sinCierres(), tx(espias()))

  titulo('D · control positivo: la bandera apagada, la misma clase de sesion v1')
  delete process.env.NEXT_PUBLIC_SIM_V1_PANTALLA
  const S4 = u(4004)
  await B1.llama('/api/sim/crear', { cuerpo: { session_id: S4, command_id: nuevoId(), epoca: 1, name: 'Apagada', pair: 'EUR/USD', timeframe: 'H1', date_from: '2025-01-06', date_to: '2025-12-31', capital: '100000', challenge_type: null } })
  const z = await pagina(B1, S4)
  z.abreMercado({ side: 'BUY', entry: 1.1, sl: 1.095, tp: 1.2, lots: 1 })
  await z.paso(12)
  const ez = espias()
  oraculo('V1C05', 'D · apagada: sin pantalla v1 (v1Ref null) y la pagina de hoy mira SL/TP: checkSLTP, rutaComun y cierreEnVela SI se llaman (los espias ven)', z.refs.v1Ref.current === null && ez.checkSLTP > 0 && ez.checkLimitOrders > 0 && ez.rutaComun > 0 && ez.cierreEnVela > 0, tx(ez))
} finally { pg.cierra() }
fin()
