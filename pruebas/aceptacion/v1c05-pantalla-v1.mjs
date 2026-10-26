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
 * ORDEN 1-127 (pieza 6 con la bandera encendida: el alumno ve y siente lo mismo que hoy en produccion, f5b713b). Escritas
 * ANTES que el codigo (en 5695a04: en rojo):
 *   E · (1) optimista: abrir a mercado, la limit, el tirador, el parcial, el cierre y cancelar se pintan AL INSTANTE, con
 *       la peticion aun retenida (una puerta en el transporte); al confirmar, lo pintado = el servidor. Un rechazo del
 *       servidor (margen insuficiente) vuelve a lo confirmado con «El simulador ha rechazado la operación.». (2) los avisos
 *       nuevos, con sus textos cortos: motor apagado (solo lectura), otra pestaña, rechazo y avance no confirmado
 *   F · (3) un lote del Play (2 → 30) con el SL y el fill del 10 y el TP del 20: cada evento se pinta en SU vela (las
 *       paradas del recibo): de la 11 a la 20 se ve la posicion llenada, 1 trade y el saldo tras el SL; desde la 21,
 *       nada abierto, 2 trades y el saldo final. Nunca el estado del final del lote antes de tiempo. El Play no se para
 *   G · (4) la limit dibuja sus tres lineas con la etiqueta en el eje (createPriceLine con axisLabelVisible, los mismos
 *       colores y titulos que confirmLimitOrder de hoy); el tirador de la entrada la mueve y cancelar las quita
 *   H · (5) el peor DD del modal de fallo, del minimo de equity: la equity del breach que guarda el motor (no el saldo
 *       tras el cierre forzado); (6) un reto ya quemado vuelve a sacar el modal al abrir la pagina (hoy, la fila sigue
 *       «active» hasta que el alumno lo reconoce, y al abrir sale)
 *   I · (g) el Step es UNA VELA del par visible: en un hueco (EURUSD sin velas del minuto 100 al 109) salta a la siguiente
 *       vela con datos (110) en un solo avance, nunca a un minuto vacio
 *   J · (i) /api/sim/crear acepta date_to = hoy (y no mañana); con la bandera encendida, el modal de reto
 *       (ChallengeSetupModal) crea el reto v1 por /api/sim/crear con lo mismo que manda hoy (EURUSD, M15, desde hace 6
 *       meses hasta HOY, sin recortar) y el mismo nombre automatico que /api/challenge/create
 *   En E, F, G y H los espias siguen a cero: lo optimista es solo la accion del alumno, nunca SL/TP, fills ni breach.
 * Contra lib/servidor REAL y PostgreSQL desechable (montaje-v1 + sim-004b + sim-006, como v1c04). Datos inventados.
 * Mercado: EURUSD 1,1 hasta el minuto 10 del 6-ene-2025; 1,09 del 10 al 19; 1,1 desde el 20. El resto, constante.
 */
import { register } from 'node:module'
register('../espias-vela.mjs', import.meta.url)
const { titulo, ver, oraculo, fin, importa, fuente, asienta, escenario } = await import('../lib.mjs')
const { hayPostgres } = await import('../pg-ensayo.mjs')
const { montajeV1, L, conUidDelMontaje } = await import('../montaje-v1.mjs')
const { cerrojoEnMemoria } = await import('../cerrojo-falso.mjs')
const N = 44
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
// orden 1-127 (g): EURUSD sin velas del minuto 100 al 109 (un hueco de 10 minutos, menor que el maximo de 15)
const huecoI = (par, t) => par === 'EURUSD' && t >= m(100) && t < m(110)
const precioEn = (par, t) => (par === 'EURUSD' && t >= m(10) && t < m(20) ? 1.09 : PX[par])
function velasDe(par) { const o = []; for (let t = M0; t < U('2025-01-11T00:00:00Z'); t += 60) if (!minutoCerrado(t) && !huecoI(par, t)) { const p = precioEn(par, t); o.push({ time: t, open: p, high: p, low: p, close: p, volume: 1 }) } return o }
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
      llamadas.push({ ruta, tipo: cuerpo?.tipo ?? null, http: r.http, motivo: cuerpo?.motivo ?? null, par: cuerpo?.par ?? null, hasta: cuerpo?.hasta ?? null })
      if (r.http === 429 && r.cuerpo?.motivo === 'demasiados_avances') uno('update public.sim_alumnos set siguiente_avance_desde = null')
      return { http: r.http, cuerpo: r.cuerpo }
    }
    const trades = sid => JSON.parse(uno(`select coalesce(json_agg(json_build_object('id', id, 'pair', pair, 'side', side, 'entry_price', entry_price, 'exit_price', exit_price, 'lots', lots, 'pnl', pnl, 'result', result, 'closed_at', closed_at) order by closed_at, id), '[]')::text from public.sim_trades where session_id = ${L(sid)}`))
    const filasTrades = sid => JSON.parse(uno(`select coalesce(json_agg(t order by closed_at, id), '[]')::text from (select id, pair, side, entry_price, exit_price, lots, sl_price, tp_price, rr, pnl, result, opened_at, closed_at from public.sim_trades where session_id = ${L(sid)}) t`))
    const puertosPagina = sid => ({ llama, nuevoId, local: web(), almacenSesion: web(), plazoMs: 3000,
      // las filas como las lee la pagina (useSesionV1: tradesDeSesion + deFila, con closeTime y openTime); sin deFila (codigo
      // de antes), la forma de entonces
      leeTrades: async () => (HOOK.deFila ? filasTrades(sid).map(HOOK.deFila) : trades(sid).map(t => ({ id: t.id, pair: t.pair, side: t.side, entry: t.entry_price, exit: t.exit_price, lots: t.lots, pnl: t.pnl, result: t.result }))),
      buscaHija: async () => uno(`select id from public.sim_sessions where challenge_parent_id = ${L(sid)} limit 1`) || null })
    const servidor = async sid => VI.vistaDe((await ES.ordenEstado({ actor: AL, cuerpo: { session_id: sid }, puertos })).cuerpo)
    return { d, uno, llama, llamadas, leeSesion, puertos, trades, puertosPagina, servidor }
  }
  // la pagina con la pantalla v1 (si la bandera esta encendida); espera a que el par visible tenga velas
  async function pagina(B, sid, cambia = {}) {
    const fila = await B.leeSesion(sid)
    cero()
    const b = await banco({ sesion: fila, userId: AL, v1: { puertos: { ...B.puertosPagina(sid), ...cambia } }, espia })
    for (let k = 0; k < 50 && !b.ps()?.ready; k++) { await asienta(20); await b.repinta() }
    await b.refs.v1Ref.current?.arranca()
    await b.repinta()
    return b
  }
  // el par visible, como _SessionInner (avanceV1: par:()=>activePairRef.current)
  const avance = b => b.refs.v1Ref.current.avance({ engine: () => b.motor(), par: () => b.estado.activa })
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

  // ── ORDEN 1-127 ──────────────────────────────────────────────────────────────
  const AV = await importa('lib/sim/avisos.js')
  const textos = () => AV.avisos().map(a => a.texto)
  // una puerta en el transporte: los comandos de la cartera (no los avances) se retienen hasta soltarla
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
  const creaPractica = async (B, sid, name) => (await B.llama('/api/sim/crear', { cuerpo: { session_id: sid, command_id: nuevoId(), epoca: 1, name, pair: 'EUR/USD', timeframe: 'H1', date_from: '2025-01-06', date_to: '2025-12-31', capital: '100000', challenge_type: null } })).http === 201
  // la pestaña de antes se cerro y su arrendamiento vencio (el alumno tiene un solo escritor: otra_sesion_activa)
  const cierraPestanas = B => B.uno("update public.sim_arrendamientos set hasta = now() - interval '1 minute'")
  const asentado = async b => { await b.refs.v1Ref.current.cliente.recupera(); await asienta(60); await b.repinta() }
  const filas = ps => ({ pos: ps.positions.map(p => [p.side, p.entry, p.sl, p.tp, p.lots]), ord: (ps.orders ?? []).map(o => [o.side, o.entry, o.sl, o.tp, o.lots]) })

  titulo('E · (1) optimista: lo que hace el alumno se pinta al instante; un rechazo vuelve a lo confirmado con su aviso')
  process.env.NEXT_PUBLIC_SIM_V1_PANTALLA = 'encendido'
  const SE = u(5005)
  ver('control: practica creada por /api/sim/crear (E)', await creaPractica(B1, SE, 'E'))
  const pu = conPuerta(B1.llama)
  cierraPestanas(B1)
  const e5 = await pagina(B1, SE, { llama: pu })
  const v5 = e5.refs.v1Ref.current, T5 = e5.caja.valor.trading
  cero()
  await avance(e5).irA(m(2))
  // a mercado (el OrderModal de _SessionInner manda la entrada que enseña y la hora de la pagina)
  pu.retiene()
  const pA = v5.envia(OR.comandoAbrir({ pair: 'EUR/USD', side: 'BUY', lots: 1, sl: 1.095, cursor: v5.cursor() }), { entry: 1.1, openTime: m(2) })
  await asienta(10)
  const oA = { ret: pu.retenidas(), ...filas(e5.ps()) }
  pu.suelta(); const rA = await pA; await asentado(e5)
  const iA = await igualServidor(B1, SE, e5)
  // orden 1-134 (Ramon: el motor v1 cobra spread): lo optimista se pinta ya con la entrada del motor, el ask de la cotizacion
  // confirmada (1,1 + 0,3 pip = 1,10003), no con la del modal (1,1): asi no salta al confirmar y cuadra con el P&L (v1c08)
  oraculo('V1C05', 'E · a mercado: la posicion se pinta con la peticion aun retenida (entrada del motor, 1,10003); al confirmar, la del servidor (id del motor)', oA.ret === 1 && tx(oA.pos) === tx([['BUY', 1.10003, 1.095, null, 1]]) && rA.conclusion === 'confirmado' && iA.ok && /^p\d+$/.test(e5.ps().positions[0]?.id ?? ''), tx({ oA, c: rA.conclusion, iA }))
  // la limit por confirmLimitOrder (la funcion REAL)
  pu.retiene()
  await e5.pendiente({ side: 'BUY_LIMIT', entry: 1.0901, sl: 1.08, tp: 1.095, lots: 1 })
  const oL = { ret: pu.retenidas(), ...filas(e5.ps()) }
  pu.suelta(); await asentado(e5)
  const iL = await igualServidor(B1, SE, e5)
  oraculo('V1C05', 'E · la limit (confirmLimitOrder): pintada al instante con la peticion retenida; al confirmar, la del servidor', oL.ret === 1 && tx(oL.ord) === tx([['BUY_LIMIT', 1.0901, 1.08, 1.095, 1]]) && iL.ok && e5.ps().orders.length === 1, tx({ oL, iL }))
  // el tirador del SL (handlePositionDragEnd REAL)
  const pid = e5.ps().positions[0]?.id
  pu.retiene()
  const pT = T5.handlePositionDragEnd(pid, 'sl', 1.095514)
  await asienta(10)
  const oT = { ret: pu.retenidas(), sl: e5.ps().positions[0]?.sl }
  pu.suelta(); await pT; await asentado(e5)
  const iT = await igualServidor(B1, SE, e5)
  oraculo('V1C05', 'E · el tirador: el SL soltado se ve ya en 1,09551 (al tick) con la peticion retenida; al confirmar, igual que el servidor', oT.ret === 1 && oT.sl === 1.09551 && iT.ok && e5.ps().positions[0]?.sl === 1.09551, tx({ oT, iT }))
  // parcial y total (closePartial y closePosition REALES)
  pu.retiene()
  const pP = T5.closePartial(pid, 'EUR/USD', 0.5)
  await asienta(10)
  const oP = { ret: pu.retenidas(), lots: e5.ps().positions[0]?.lots }
  pu.suelta(); await pP; await asentado(e5)
  pu.retiene()
  const pC = T5.closePosition(pid, 'MANUAL', 'EUR/USD', 1.1)
  await asienta(10)
  const oC = { ret: pu.retenidas(), n: e5.ps().positions.length }
  pu.suelta(); await pC; await asentado(e5)
  const iC = await igualServidor(B1, SE, e5)
  oraculo('V1C05', 'E · el parcial (quedan 0,5) y el cierre (sin posicion) se ven al instante con la peticion retenida; al confirmar, como el servidor, con 2 trades', oP.ret === 1 && oP.lots === 0.5 && oC.ret === 1 && oC.n === 0 && iC.ok && B1.trades(SE).length === 2 && e5.ps().trades.length === 2, tx({ oP, oC, iC, trades: B1.trades(SE).length }))
  // cancelar (cancelLimitOrder REAL)
  const oid = e5.ps().orders[0]?.id
  pu.retiene()
  const pX = T5.cancelLimitOrder(oid, 'EUR/USD')
  await asienta(10)
  const oX = { ret: pu.retenidas(), n: e5.ps().orders.length }
  pu.suelta(); await pX; await asentado(e5)
  oraculo('V1C05', 'E · cancelar: la pendiente desaparece al instante con la peticion retenida; al confirmar, sin pendientes como el servidor', oX.ret === 1 && oX.n === 0 && (await igualServidor(B1, SE, e5)).ok, tx(oX))
  // un rechazo del motor (500 lotes: margen insuficiente): se pinta, y al rechazar vuelve a lo confirmado con el aviso
  AV.vaciaAvisos()
  pu.retiene()
  const pR = v5.envia(OR.comandoAbrir({ pair: 'EUR/USD', side: 'BUY', lots: 500, cursor: v5.cursor() }), { entry: 1.1, openTime: m(2) })
  await asienta(10)
  const oR = { ret: pu.retenidas(), n: e5.ps().positions.length }
  pu.suelta(); const rR = await pR; await asentado(e5)
  oraculo('V1C05', 'E · rechazo (margen): pintada al instante; el servidor la rechaza y la pantalla vuelve a lo confirmado (sin posicion) con «El simulador ha rechazado la operación.»', oR.ret === 1 && oR.n === 1 && rR.conclusion === 'rechazado' && e5.ps().positions.length === 0 && (await igualServidor(B1, SE, e5)).ok && textos().includes('El simulador ha rechazado la operación.'), tx({ oR, c: rR.conclusion, avisos: textos() }))
  oraculo('V1C05', 'S · en todo E: checkSLTP, checkLimitOrders, checkChallengeBreach, rutaComun y cierreEnVela no se llaman', sinCierres(), tx(espias()))
  // la pagina: el OrderModal y el tirador del grafico pintan ya (la entrada que enseña y la hora; la linea al tick)
  const SI = fuente('components/_SessionInner.js')
  oraculo('V1C05', 'E · _SessionInner: el OrderModal manda la entrada y la hora para pintar ya, y el tirador del grafico mueve la linea al tick sin esperar', SI.includes('v1Ref.current.envia(comandoAbrir({pair:m.pair,side:m.isLimit?') && /comandoAbrir\(\{pair:m\.pair[^\n]*\}\),\{entry:entradaTick,openTime:currentTime\}\)/.test(SI) && /if\(v1Ref\.current\)\{\s*const sl=alTick\(newPrice,p\)\s*updatePositionLine\(posId,p,type,sl,pos\)/.test(SI))
  // (2) los avisos nuevos, cortos
  AV.vaciaAvisos()
  const apagado = async () => ({ http: 503, cuerpo: { ok: false, http: 503, motivo: 'apagado' } })
  const e5b = await pagina(B1, SE, { llama: apagado })
  const rAp = await e5b.refs.v1Ref.current.envia(OR.comandoAbrir({ pair: 'EUR/USD', side: 'BUY', lots: 1, cursor: m(2) }), { entry: 1.1, openTime: m(2) })
  await e5b.repinta()
  oraculo('V1C05', 'E · (2) motor apagado: «El simulador está en pausa: sesión en solo lectura.», y la orden ni se pinta ni se manda', rAp.conclusion === 'solo_lectura' && e5b.ps()?.positions?.length === 0 && textos().includes('El simulador está en pausa: sesión en solo lectura.'), tx({ c: rAp.conclusion, avisos: textos() }))
  AV.vaciaAvisos()
  const e5c = await pagina(B1, SE)
  oraculo('V1C05', 'E · (2) otra pestaña: «Esta sesión está abierta en otra pestaña.»', textos().includes('Esta sesión está abierta en otra pestaña.'), tx(textos()))
  oraculo('V1C05', 'E · (2) avance no confirmado: «No se ha podido confirmar el avance.» en Step, Play y Go to', SI.split("avisa('No se ha podido confirmar el avance.')").length === 4, String(SI.split("avisa('No se ha podido confirmar el avance.')").length - 1))
  void e5c

  titulo('F · (3) en el Play, cada evento se pinta en su vela exacta (con las paradas del recibo), no con el final del lote')
  const SF = u(6006)
  ver('control: practica creada por /api/sim/crear (F)', await creaPractica(B1, SF, 'F'))
  cierraPestanas(B1)
  const f6 = await pagina(B1, SF)
  const v6 = f6.refs.v1Ref.current
  cero()
  const fotos = []
  const av6 = v6.avance({ engine: () => f6.motor(), espera: async () => { const ps = f6.ps(); fotos.push({ t: (f6.motor().currentTime - M0) / 60, ids: ps.positions.map(p => p.id).join(','), tr: ps.trades.length, saldo: f6.estado.saldo }) } })
  await av6.irA(m(2))
  await v6.envia(OR.comandoAbrir({ pair: 'EUR/USD', side: 'BUY', lots: 1, sl: 1.09551, cursor: v6.cursor() }), { entry: 1.1, openTime: m(2) })
  await f6.pendiente({ side: 'BUY_LIMIT', entry: 1.0901, sl: 1.08, tp: 1.095, lots: 1 })
  await asentado(f6)
  const s0 = f6.estado.saldo, p0 = f6.ps().positions.map(p => p.id).join(',')
  fotos.length = 0
  const n0 = B1.llamadas.length
  const rF = await av6.play({ lote: 30, hasta: m(30) })
  await f6.repinta()
  const lotes = B1.llamadas.slice(n0).filter(x => x.tipo === 'avanzar').length
  const trF = B1.trades(SF), sF = f6.estado.saldo
  // el saldo tras el SL y el fill = el final menos el bruto del TP (la comision ya salio en el fill)
  const brutoTP = Number(B1.uno(`select bruto_micro from public.sim_trades where session_id = ${L(SF)} order by closed_at desc, id desc limit 1`)) / 1e6
  const tramo = (a, b) => fotos.filter(f => f.t >= a && f.t <= b)
  const antes = tramo(3, 10), medio = tramo(11, 20), despues = tramo(21, 30)
  const okAntes = antes.length === 8 && antes.every(f => f.ids === p0 && f.tr === 0 && f.saldo === s0)
  const idMedio = medio[0]?.ids
  const okMedio = medio.length === 10 && medio.every(f => f.ids === idMedio && f.tr === 1) && idMedio && idMedio !== p0 && !idMedio.includes(',') && Math.abs(medio[0].saldo - (sF - brutoTP)) < 1e-6 && medio.every(f => f.saldo === medio[0].saldo)
  const okDespues = despues.length === 10 && despues.every(f => f.ids === '' && f.tr === 2 && f.saldo === sF)
  ver('control: un solo lote del Play (2 → 30) con los tres eventos dentro, y dos trades en la base', lotes === 1 && trF.length === 2, tx({ lotes, trades: trF.length }))
  oraculo('V1C05', 'F · velas 3-10: la posicion de partida, 0 trades y el saldo de partida (nada del lote antes de tiempo)', okAntes, tx(antes.slice(-2)))
  oraculo('V1C05', 'F · velas 11-20: tras el SL y el fill del 10, la posicion llenada sola, 1 trade y el saldo tras el SL (no el final)', okMedio, tx({ medio: medio.slice(0, 2), esperado: sF - brutoTP }))
  oraculo('V1C05', 'F · velas 21-30: tras el TP del 20, nada abierto, 2 trades y el saldo final; el Play no se paro (llegado)', okDespues && rF.conclusion === 'llegado', tx({ c: rF.conclusion, despues: despues.slice(0, 2) }))
  oraculo('V1C05', 'S · en todo F: checkSLTP, checkLimitOrders, checkChallengeBreach, rutaComun y cierreEnVela no se llaman', sinCierres(), tx(espias()))

  titulo('G · (4) las limit dibujan su linea con la etiqueta en el eje, como confirmLimitOrder de hoy')
  // en la pagina de F, que es la que escribe (el alumno tiene un solo escritor)
  const lineas = []
  const serie = { createPriceLine: o => { const l = { o, viva: true }; lineas.push(l); return l }, removePriceLine: l => { l.viva = false }, setData() {}, update() {} }
  f6.refs.chartMap.current['EUR/USD'] = { series: serie, priceLines: {}, hasLoaded: true, chart: { timeScale: () => ({ getVisibleLogicalRange: () => null, setVisibleLogicalRange() {} }) } }
  const vivas = () => lineas.filter(l => l.viva).map(l => [l.o.title, l.o.price, l.o.axisLabelVisible, l.o.color, l.o.lineWidth, l.o.lineStyle]).sort((a, b) => (a[0] < b[0] ? -1 : 1))
  cero()
  await f6.pendiente({ side: 'SELL_LIMIT', entry: 1.12, sl: 1.13, tp: 1.1, lots: 1 })
  await asentado(f6)
  const g1 = vivas()
  oraculo('V1C05', 'G · la limit confirmada: tres lineas con etiqueta en el eje (S.LIM 1L, SL y TP), con los colores y estilos de hoy', tx(g1) === tx([['S.LIM 1L', 1.12, true, 'rgba(180,180,180,0.5)', 1, 0], ['SL', 1.13, true, 'rgba(239,83,80,0.4)', 1, 2], ['TP', 1.1, true, 'rgba(30,144,255,0.4)', 1, 2]]), tx({ g1, ...filas(f6.ps()), n: lineas.length, avisos: textos(), ult: f6.refs.v1Ref.current?.aviso }))
  const og = f6.ps().orders[0]?.id
  await f6.caja.valor.trading.handlePositionDragEnd(og, 'lim_e', 1.121)
  await asentado(f6)
  const g2 = vivas()
  await f6.caja.valor.trading.cancelLimitOrder(og, 'EUR/USD')
  await asentado(f6)
  const g3 = vivas()
  oraculo('V1C05', 'G · el tirador de la entrada mueve su linea (1,121) y cancelar quita las tres', g2.length === 3 && g2[0][0] === 'S.LIM 1L' && g2[0][1] === 1.121 && g3.length === 0, tx({ g2, g3 }))
  oraculo('V1C05', 'S · en todo G: checkSLTP, checkLimitOrders, checkChallengeBreach, rutaComun y cierreEnVela no se llaman', sinCierres(), tx(espias()))

  titulo('H · (5) el peor DD del modal de fallo, del minimo de equity; (6) un reto quemado saca el modal al abrir')
  // en el 2F el cierre forzado es al mismo precio que la valoracion del breach (equity del breach = saldo tras cerrar);
  // con empuje (1F, 3F) el saldo queda por debajo. Para distinguir, la equity guardada del breach se sube 500 $ (dato de
  // prueba, como la fila superada de C): el modal tiene que salir de ESA equity, no del saldo
  const fS2 = await B2.leeSesion(S2)
  const eS2 = CA.deserializa(JSON.stringify(fS2.estado))
  const saldoB = Number(eS2.motor.saldo_µ) / 1e6, medianoche = Number(eS2.saldo_medianoche_µ) / 1e6
  const eqB_µ = eS2.motor.saldo_µ + 500_000000n
  eS2.breach = { ...eS2.breach, equity_µ: eqB_µ }; eS2.motor.breach = { ...eS2.motor.breach, equity_µ: eqB_µ }
  B2.uno(`update public.sim_sessions set estado = ${L(JSON.parse(CA.serializa(eS2)))}::jsonb where id = ${L(S2)}`)
  const eqB = Number(eqB_µ) / 1e6
  ver('control: el breach guarda una equity distinta del saldo tras el cierre forzado (la prueba distingue)', eS2.estado === 'breach' && Math.abs(eqB - saldoB) > 1, tx({ eqB, saldoB, medianoche }))
  cero()
  AV.vaciaAvisos()
  const h2 = await pagina(B2, S2)
  await h2.caja.valor.reto.refreshChallengeStatus(); await h2.repinta(); await asienta(40); await h2.repinta()
  const stH = h2.caja.valor.reto.challengeStatus?.evaluation
  oraculo('V1C05', 'H · (5) ddDailyWorstUSD = saldo de la medianoche − la equity del breach (y su %), no − el saldo', Math.abs(stH?.ddDailyWorstUSD - (medianoche - eqB)) < 1e-6 && Math.abs(stH?.ddDailyWorstPct - ((medianoche - eqB) / medianoche) * 100) < 1e-6, tx({ worst: stH?.ddDailyWorstUSD, esperado: medianoche - eqB, porSaldo: medianoche - saldoB }))
  oraculo('V1C05', 'H · (6) al abrir de nuevo el reto quemado, el modal de fallo sale (como hoy) y el reto sigue bloqueado', h2.caja.valor.reto.challengeModal === 'failed' && h2.caja.valor.reto.challengeLocked === true, tx({ modal: h2.caja.valor.reto.challengeModal, locked: h2.caja.valor.reto.challengeLocked }))
  oraculo('V1C05', 'S · en todo H: checkSLTP, checkLimitOrders, checkChallengeBreach, rutaComun y cierreEnVela no se llaman', sinCierres(), tx(espias()))

  titulo('I · (g) el Step es una vela del par visible: en un hueco salta a la siguiente vela con datos')
  const SI2 = u(7007)
  ver('control: practica creada por /api/sim/crear (I)', await creaPractica(B1, SI2, 'I'))
  cierraPestanas(B1)
  const i7 = await pagina(B1, SI2)
  const av7 = avance(i7)
  await av7.irA(m(99))
  ver('control: en el minuto 99, y el par visible no tiene velas del 100 al 109', i7.motor().currentTime === m(99) && !i7.motor().candles.some(c => c.time >= m(100) && c.time < m(110)))
  const n7 = B1.llamadas.length
  const rI = await av7.paso()
  const pasos = B1.llamadas.slice(n7).filter(x => x.tipo === 'avanzar')
  oraculo('V1C05', 'I · un Step desde el 99: UN avance paso con el par visible (EURUSD) que llega a la vela del 110 (cursor y grafica), no al minuto vacio 100',
    rI.conclusion === 'confirmado' && pasos.length === 1 && pasos[0].motivo === 'paso' && pasos[0].par === 'EURUSD' && pasos[0].http === 200 && i7.refs.v1Ref.current.cursor() === m(110) && i7.motor().currentTime === m(110) && fuente('components/_SessionInner.js').includes('par:()=>activePairRef.current'),
    tx({ c: rI.conclusion, pasos, cursor: (i7.refs.v1Ref.current.cursor() - M0) / 60, grafica: (i7.motor().currentTime - M0) / 60 }))
  const rI2 = await av7.paso()
  oraculo('V1C05', 'I · el Step siguiente, a la vela del 111', rI2.conclusion === 'confirmado' && i7.refs.v1Ref.current.cursor() === m(111) && i7.motor().currentTime === m(111), tx({ c: rI2.conclusion, cursor: (i7.refs.v1Ref.current.cursor() - M0) / 60 }))

  titulo('J · (i) date_to = hoy: /api/sim/crear lo acepta y el modal de reto no recorta nada')
  const hoyJ = new Date(B2.puertos.ahora()).toISOString().slice(0, 10)
  const cJ = fecha => B2.llama('/api/sim/crear', { cuerpo: { session_id: nuevoId(), command_id: nuevoId(), epoca: 1, name: 'J', pair: 'EUR/USD', timeframe: 'M15', date_from: '2026-04-01', date_to: fecha, capital: '100000', challenge_type: '2F' } })
  const jHoy = await cJ(hoyJ), jManana = await cJ(new Date(B2.puertos.ahora() + 86400000).toISOString().slice(0, 10))
  oraculo('V1C05', 'J · /api/sim/crear: date_to = hoy se crea (201); mañana, 422 carga_invalida en date_to', jHoy.http === 201 && jManana.http === 422 && jManana.cuerpo?.en === 'date_to', tx({ hoy: hoyJ, a: jHoy.http, b: jManana.http, en: jManana.cuerpo?.en }))
  const rJ = CRV.creaRetoV1 ? await CRV.creaRetoV1({ llama: B2.llama, nuevoId, tipo: '2F', capital: 100000, hoy: new Date(B2.puertos.ahora()) }) : null
  const fJ = rJ?.ok ? await B2.leeSesion(rJ.id) : null
  const desdeJ = (() => { const d = new Date(B2.puertos.ahora()); d.setMonth(d.getMonth() - 6); return d.toISOString().slice(0, 10) })()
  oraculo('V1C05', 'J · creaRetoV1 (el modal con la bandera): reto 2F v1 por /api/sim/crear con EURUSD, M15, desde hace 6 meses hasta HOY y el nombre de hoy',
    rJ?.ok === true && fJ?.motor_version === 1 && fJ.challenge_type === '2F' && fJ.date_to === hoyJ && fJ.date_from === desdeJ && fJ.timeframe === 'M15' && fJ.pair === 'EUR/USD' && Number(fJ.capital) === 100000 && fJ.name === 'Challenge 2 Fases · $100K · EURUSD',
    tx({ rJ, fila: fJ && { mv: fJ.motor_version, t: fJ.challenge_type, desde: fJ.date_from, hasta: fJ.date_to, tf: fJ.timeframe, par: fJ.pair, nombre: fJ.name } }))
  const MJ = fuente('components/ChallengeSetupModal.js'), iJ = MJ.indexOf('if (pantallaV1()) {'), iF = MJ.indexOf("fetch('/api/challenge/create'")
  oraculo('V1C05', 'J · ChallengeSetupModal: con pantallaV1() llama a creaRetoV1 ANTES del /api/challenge/create de hoy, que sigue para la bandera apagada', iJ > 0 && iF > iJ && MJ.slice(iJ, iF).includes('creaRetoV1('))

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
