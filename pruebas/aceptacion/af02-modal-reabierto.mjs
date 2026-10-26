/**
 * AF02 · «CONTINUE TO PHASE 2» CON EL MODAL REABIERTO TRAS RECARGAR (orden 1-133 del CTO; INFORME 1-128, añadido).
 * La familia que da el 400 «a veces» (77a8311d: el modal de fase pasada abierto tras volver a entrar). En f5b713b:
 *   · al entrar o recargar, _SessionInner pone window.__algSuiteCurrentTime a null (clearCurrentTime, :717);
 *   · usePairData hace seekToTime ANTES de poner onTick (:79-80) y el final de la carga (:111) no llama a setMasterTime;
 *   · solo lo ponen onTick (Play, Step, Go to) o el cambio de par. Con el objetivo ya alcanzado el modal de fase pasada
 *     sale solo y el replay esta bloqueado: «Continue to Phase 2» manda end_timestamp null → 400, en cada intento.
 * La PAGINA REAL (_SessionInner montada con sus hooks y el ChallengePassedPhaseModal; grafico, React y base, dobles; el
 * handler REAL de /api/challenge/advance sobre supabase-falso). Reto 2F fase 1, $100K, objetivo +10 %: dos trades
 * ganadores (6.000 y 4.840), saldo 110.840, last_timestamp 7-ene-2025 11:55 (T). Se pulsa SIN Play ni Step:
 *   A · entrar (o recargar) con el objetivo ya alcanzado → el modal sale solo → Continue
 *   B · tras un Go to que llega al objetivo (un TP en el salto): «Review», recargar → el modal reabierto → Continue
 *   C · con el modal abierto tras entrar: cambio de temporalidad (M1 → M5) → Continue
 *   D · «Close» del modal (al dashboard) y volver a entrar → el modal reabierto → Continue
 * ORACULO en cada caso: UN /api/challenge/advance con end_timestamp entero (la hora de la sesion o del cierre que
 * alcanzo el objetivo, nunca null), 200 phase_passed, la hija nace y la pagina navega a ella; sin aviso de error.
 * El arreglo A de la orden 1-129 (b88b531: last_timestamp de respaldo) ya lo cubre: en f5b713b, rojo; en el paquete, verde.
 * Control: __algSuiteCurrentTime sigue null al pulsar en A, C y D (la secuencia es la que da el valor malo) y la
 * bandera v1 esta apagada (es la pantalla de hoy). Datos inventados. Nada toca Supabase.
 */
import { titulo, ver, oraculo, fin, escenario, sesionSim, tradeSim, vela, importa, A, perfil, asienta, db, api, monta, router } from '../lib.mjs'
import { velasEnStorage } from '../banco-motor.mjs'
const CI = await importa('lib/sim/cierre.js').catch(() => null), SV = await importa('lib/sim/servicio.js').catch(() => null)
const AV = await importa('lib/sim/avisos.js').catch(() => null)
const Sesion = (await importa('components/_SessionInner.js')).default
delete process.env.NEXT_PUBLIC_SIM_V1_PANTALLA
const tx = x => JSON.stringify(x)
const T = Date.parse('2025-01-07T11:55:00Z') / 1000
const props = (p, name) => [...p.insts.values()].find(i => i.tipo.name === name)?.el.props
const madre = extra => sesionSim({ id: 'reto-af02', name: 'Challenge 2 Fases · $100K · EURUSD', pair: 'EUR/USD', timeframe: 'M1', challenge_type: '2F', challenge_phase: 1,
  capital: 100000, balance: 110840, date_from: '2025-01-07', date_to: '2025-01-10', last_timestamp: T, ...extra })
const ganadores = () => [tradeSim({ session_id: 'reto-af02', pnl: 6000, result: 'WIN', closed_at: '2025-01-07T10:00:00Z' }), tradeSim({ session_id: 'reto-af02', pnl: 4840, result: 'WIN', closed_at: '2025-01-07T11:00:00Z' })]
// 40 velas M1 desde las 11:50 a 1,1000; la de las 11:58 sube a 1,1050 (el TP del caso B)
const velas = () => Array.from({ length: 40 }, (_, i) => { const t = T - 300 + 60 * i; return t === T + 180 ? vela(t, 1.1, 1.105, 1.1, 1.1) : vela(t, 1.1, 1.1001, 1.0999, 1.1) })
const hija = () => db.tablas.sim_sessions.find(x => x.challenge_parent_id === 'reto-af02') ?? null
function prepara(fila, trades) {
  escenario({ perfiles: [perfil(A)], sim_sessions: [fila], sim_trades: trades })
  velasEnStorage('EUR/USD', velas(), [2024], { tramoAbierto: true })
  router.query = { id: fila.id }
}
// entra en /session/<id> (la pagina REAL): carga de sesion, velas, status del reto
async function entra(id) {
  router.query = { id }
  const p = monta(Sesion, {})
  await p.asienta(300)
  const ts = { getVisibleLogicalRange: () => ({ from: 0, to: 50 }), setVisibleLogicalRange() {}, scrollToPosition() {} }
  if (globalThis.window.__chartMap?.current) globalThis.window.__chartMap.current['EUR/USD'] ??= { series: { setData() {}, update() {}, priceToCoordinate: () => 0, createPriceLine: () => ({}), removePriceLine() {} }, chart: { timeScale: () => ts, priceScale: () => ({ applyOptions() {} }) }, prevCount: 0 }
  for (let k = 0; k < 20 && !props(p, 'ChallengePassedPhaseModal'); k++) { await asienta(30); p.render({ forzar: true }); await p.asienta(30) }
  return p
}
const advance = n0 => api.llamadas.slice(n0).filter(l => l.ruta === '/api/challenge/advance').map(l => ({ e: l.estado, t: l.body?.end_timestamp }))
async function continua(p) {
  AV?.vaciaAvisos?.()
  const n0 = api.llamadas.length, nav0 = router.navegado.length
  const mod = props(p, 'ChallengePassedPhaseModal')
  const reloj = globalThis.window.__algSuiteCurrentTime ?? null
  if (mod?.onAdvance) { await mod.onAdvance(); await p.asienta(120) }
  return { modal: !!mod, reloj, env: advance(n0), nav: router.navegado.slice(nav0), avisos: (AV?.avisos?.() ?? []).map(a => a.texto), hija: hija()?.id ?? null }
}
const bien = (r, t) => r.modal && r.env.length === 1 && r.env[0].e === 200 && r.env[0].t === t && !!r.hija && r.nav.some(n => n[1] === `/session/${r.hija}`) && !r.avisos.some(a => a.startsWith('No se ha podido'))

titulo('A · entrar (o recargar) con el objetivo ya alcanzado: el modal sale solo y se pulsa sin Play')
{
  const fila = madre({})
  prepara(fila, ganadores())
  globalThis.window.__algSuiteCurrentTime = T + 600   // lo que dejo otra sesion (SPA): la pagina lo limpia al entrar
  const p = await entra(fila.id)
  ver('control: pagina real montada sin errores y la bandera v1 apagada', p.errores.length === 0 && !process.env.NEXT_PUBLIC_SIM_V1_PANTALLA, tx(p.errores.map(e => e.message)))
  const r = await continua(p)
  ver('control: el modal de fase pasada salio solo y el reloj maestro sigue null al pulsar (la secuencia que da el valor malo)', r.modal && r.reloj == null, tx({ modal: r.modal, reloj: r.reloj }))
  oraculo('AF02', 'A · entrar con el objetivo alcanzado y pulsar sin Play: advance con end_timestamp entero (11:55, la de la sesion), 200 y a la fase 2', bien(r, T), tx(r))
  p.desmonta(); await asienta()
}

titulo('B · tras un Go to que llega al objetivo: «Review», recargar y el modal reabierto')
{
  // a 1.000 USD del objetivo: el TP de un BUY de 2 lotes a 1,1000 (TP 1,1050: +1.000) en la vela de las 11:58
  const fila = madre({ balance: 109000 })
  prepara(fila, [tradeSim({ session_id: 'reto-af02', pnl: 9000, result: 'WIN', closed_at: '2025-01-07T11:00:00Z' })])
  globalThis.window.__algSuiteCurrentTime = null
  let p = await entra(fila.id)
  const h = [...p.insts.values()].flatMap(i => i.hooks), ref = h.find(x => x?.current?.['EUR/USD']?.engine), ps = ref?.current['EUR/USD'], e = ps?.engine
  ver('control: motor a las 11:55 y sin modal (aun no hay objetivo)', !!e && e.currentTime === T && !props(p, 'ChallengePassedPhaseModal'), tx({ t: e?.currentTime }))
  if (CI) CI.fijaSaldoConfirmado(fila.id, 109000)
  if (SV) await SV.leeServicio()
  ps.positions = [{ id: 'pos-af02', pair: 'EUR/USD', side: 'BUY', entry: 1.1, sl: 1.09, tp: 1.105, lots: 2, slPips: 100, tpPips: 50, initialSlPips: 100, openTime: T }]
  p.render({ forzar: true }); await asienta()
  await props(p, 'ReplayPill').handleGoTo('nyam'); await p.asienta(200)
  for (let k = 0; k < 20 && !props(p, 'ChallengePassedPhaseModal'); k++) { await asienta(30); p.render({ forzar: true }); await p.asienta(30) }
  const tp = db.tablas.sim_trades.find(t => Number(t.pnl) === 1000)
  ver('control: el Go to cerro por TP (+1.000) y el modal de fase pasada salio', !!tp && !!props(p, 'ChallengePassedPhaseModal'), tx({ trades: db.tablas.sim_trades.map(t => [t.pnl, t.closed_at]), modal: !!props(p, 'ChallengePassedPhaseModal') }))
  props(p, 'ChallengePassedPhaseModal')?.onReview?.(); await p.asienta(40)
  const tCierre = tp ? Math.floor(Date.parse(tp.closed_at) / 1000) : null
  // recargar: la fila de la base (con el last_timestamp que haya guardado la pagina) y la pagina de nuevo
  p.desmonta(); await asienta()
  const guardada = db.tablas.sim_sessions.find(x => x.id === fila.id)
  p = await entra(fila.id)
  const r = await continua(p)
  const t = guardada?.last_timestamp ?? tCierre
  ver('control: al recargar, el reloj maestro sigue null al pulsar', r.reloj == null, tx({ reloj: r.reloj }))
  oraculo('AF02', 'B · tras el Go to, recargar: el modal reabierto manda un end_timestamp entero (la hora guardada de la sesion o la del cierre), 200 y a la fase 2',
    bien(r, t) && Number.isInteger(t) && t >= T, tx({ r, last_timestamp: guardada?.last_timestamp, tCierre }))
  p.desmonta(); await asienta()
}

titulo('C · con el modal abierto tras entrar, un cambio de temporalidad y Continue')
{
  const fila = madre({})
  prepara(fila, ganadores())
  globalThis.window.__algSuiteCurrentTime = null
  const p = await entra(fila.id)
  // el boton «M5» de la barra de temporalidades de la pagina, como lo pulsa el alumno
  const boton = p.busca(x => x.tipo === 'button' && p.texto(x) === 'M5')
  const cambia = !!boton && p.pulsa(boton)
  await p.asienta(60)
  const r = await continua(p)
  ver('control: hubo cambio de temporalidad y el reloj maestro sigue null al pulsar', cambia && r.reloj == null, tx({ cambia, reloj: r.reloj }))
  oraculo('AF02', 'C · tras cambiar de temporalidad con el modal abierto: end_timestamp entero (11:55), 200 y a la fase 2', bien(r, T), tx(r))
  p.desmonta(); await asienta()
}

titulo('D · «Close» del modal (al dashboard) y volver a entrar')
{
  const fila = madre({})
  prepara(fila, ganadores())
  globalThis.window.__algSuiteCurrentTime = null
  let p = await entra(fila.id)
  const nav0 = router.navegado.length
  props(p, 'ChallengePassedPhaseModal')?.onClose?.(); await p.asienta(40)
  ver('control: «Close» lleva al dashboard', router.navegado.slice(nav0).some(n => String(n[1]).startsWith('/dashboard')), tx(router.navegado.slice(nav0)))
  p.desmonta(); await asienta()
  p = await entra(fila.id)
  const r = await continua(p)
  ver('control: al volver, el reloj maestro sigue null al pulsar', r.reloj == null, tx({ reloj: r.reloj }))
  oraculo('AF02', 'D · volver del dashboard con el modal reabierto: end_timestamp entero (11:55), 200 y a la fase 2', bien(r, T), tx(r))
  p.desmonta(); await asienta()
}
fin()
