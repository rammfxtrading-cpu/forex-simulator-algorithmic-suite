/**
 * SG20 · UNA PETICION QUE NO CONTESTA NUNCA YA NO CONGELA EL AVANCE (orden 1-117 del CTO; el Play de Ramon, 1-106)
 * Pagina real montada (_SessionInner y sus hooks; React, grafico y base, dobles) y el bucle del Play con un
 * requestAnimationFrame de VERDAD (el del entorno no llama nunca). Practica, EUR/USD, BUY 1 lote a 1,1000 con TP 1,1020
 * (+20 pips) que la vela de las 11:57 toca. En 785d9a8, si la peticion del cierre no contestaba, el Play, el Step y el
 * Go to esperaban a la cola para siempre: reloj parado, `_esperando` o `pidiendo` colgados y volver a pulsar no hacia
 * nada (repro: revisiones-suite/2026-10-24-paquete-simulador/variante-cuelga-785d9a8.log).
 * Con el plazo (lib/sim/plazo.js; aqui 1,5 s en lugar de 12 s) y en los tres modos:
 *   rpc        sim_cierre_v0 no contesta nunca y NO llega a la base
 *   guardada   sim_cierre_v0 SI se guarda en la base pero la respuesta no llega nunca
 *   servicio   la lectura de sim_servicio del cierre no contesta nunca (no se manda nada)
 * ORACULOS, a mano:
 *   1 · vencido el plazo: parado, NO congelado (ni _esperando ni pidiendo ni saltando), el boton en pausa y un aviso
 *   2 · rpc: al volver a pulsar se relee el trade del servidor; no consta y aun no han pasado 20 s: sigue parado, avisa
 *   3 · final (volviendo a pulsar; en rpc, pasados los 20 s del incierto):
 *         rpc       la posicion vuelve, abierta; ningun trade; saldo 100.000; el reloj pasa de la vela
 *         guardada  consta guardado: cerrada con +200 (una fila); saldo 100.200; el reloj pasa de la vela
 *         servicio  no se mando nada: la posicion vuelve, abierta; ningun trade; el reloj pasa de la vela
 */
import { ver, oraculo, fin, escenario, sesionSim, vela, importa, asienta, db, espera, monta, router } from '../lib.mjs'
import { velasEnStorage } from '../banco-motor.mjs'
;(globalThis.__simPlazo ??= {}).ms = 1500   // el plazo de lib/sim/plazo.js, corto para la prueba (el real: 12 s)
const CI = await importa('lib/sim/cierre.js').catch(() => null), SV = await importa('lib/sim/servicio.js').catch(() => null), COLA = await importa('lib/sim/cola.js').catch(() => null)
if (!CI || !SV || !COLA) { for (let i = 0; i < 21; i++) oraculo('SG20', `caso ${i}: sin la cola de la etapa 1 no se puede`, false, 'no estan'); fin() }
const Sesion = (await importa('components/_SessionInner.js')).default
const T = Date.parse('2025-01-07T11:55:00Z') / 1000
const props = (p, name) => [...p.insts.values()].find(i => i.tipo.name === name)?.el.props
const nunca = new Promise(() => {})
const avisos = () => (globalThis.__simAvisos?.lista || []).map(a => a.texto)
// un requestAnimationFrame de verdad, solo en esta prueba
globalThis.requestAnimationFrame = cb => setTimeout(() => cb(performance.now()), 16); globalThis.cancelAnimationFrame = x => clearTimeout(x)

for (const variante of ['rpc', 'guardada', 'servicio']) for (const modo of ['play', 'paso', 'salto']) {
  const id = `${variante}/${modo}`
  const ses = sesionSim({ pair: 'EUR/USD', date_from: '2025-01-07', date_to: '2025-01-10', last_timestamp: T, capital: 100000, balance: 100000 }); escenario({ sim_sessions: [ses] })
  velasEnStorage('EUR/USD', Array.from({ length: 12 }, (_, i) => vela(T + i * 60, 1.1, i === 2 ? 1.103 : 1.1001, 1.0999, 1.1)), [2024], { tramoAbierto: true }); router.query = { id: ses.id }
  const p = monta(Sesion, {}); await p.asienta(300)
  const h = [...p.insts.values()].flatMap(i => i.hooks), ref = h.find(x => x?.current?.['EUR/USD']?.engine), ps = ref?.current['EUR/USD'], e = ps?.engine
  ver(`${id}: control: pagina real montada, motor a las 11:55`, !!e && e.currentTime === T && p.errores.length === 0, JSON.stringify(p.errores.map(x => x.message)))
  if (!e) continue
  const ts = { getVisibleLogicalRange: () => ({ from: 0, to: 50 }), setVisibleLogicalRange() {}, scrollToPosition() {} }
  window.__chartMap.current['EUR/USD'] = { series: { setData() {}, update() {}, priceToCoordinate: () => 0, createPriceLine: () => ({}), removePriceLine() {} }, chart: { timeScale: () => ts, priceScale: () => ({ applyOptions() {} }) }, prevCount: 0 }
  CI.fijaSaldoConfirmado(ses.id, 100000); await SV.leeServicio()
  ps.positions = [{ id: 'pos1', pair: 'EUR/USD', side: 'BUY', entry: 1.1, sl: 1.09, tp: 1.102, lots: 1, slPips: 100, tpPips: 20, initialSlPips: 100, openTime: T }]; p.render({ forzar: true }); await asienta()
  // la peticion que no contesta: solo la PRIMERA (la del cierre de la vela de las 11:57)
  let primera = true, servicioArmado = false
  if (variante === 'rpc') db.pausa = c => (c.tabla === 'rpc:sim_cierre_v0' && primera ? ((primera = false), nunca) : null)
  if (variante === 'guardada') db.rpcExterno = async (n, a) => {
    if (n !== 'sim_cierre_v0') return { data: null, error: { code: 'PGRST202', message: n } }
    ;(db.tablas.sim_trades ??= []).push({ ...a.p_trade, session_id: a.p_session_id }); const s = db.tablas.sim_sessions.find(x => x.id === a.p_session_id); s.balance = a.p_balance
    if (primera) { primera = false; return nunca }
    return { data: a.p_trade.id, error: null, status: 200 }
  }
  if (variante === 'servicio') { servicioArmado = true; db.pausa = c => (c.tabla === 'sim_servicio' && servicioArmado && COLA.cierresPendientes(ses.id) > 0 ? ((servicioArmado = false), nunca) : null) }
  const pill = () => props(p, 'ReplayPill')
  let primerPaso = true
  const accion = async () => {
    if (modo === 'play') { if (pill().isPlaying) await pill().handlePlayPause(); await pill().handleSpeed(5); await pill().handlePlayPause() }
    // el Step: hasta la vela del TP (dos pasos desde las 11:55) y, despues, uno por pulsacion
    else if (modo === 'paso') { for (let i = 0; i < 2 && (e.currentTime - T) / 60 < 2; i++) { await pill().handleStep(); if ((e.currentTime - T) / 60 < 2) await COLA.esperaCola(ses.id) } if ((e.currentTime - T) / 60 >= 2 && primerPaso) { primerPaso = false; return } ; if (!primerPaso) await pill().handleStep() }
    else await pill().handleGoTo('nyam')
  }
  const congelado = () => !!e._esperando || !!e.pidiendo || !!e.saltando
  // 1) hasta la vela del TP y el plazo
  const corre = accion(); await espera(1500 + 1800); await p.asienta(10)
  const c1 = { reloj: (e.currentTime - T) / 60, congelado: congelado(), play: e.isPlaying, boton: pill().isPlaying, avisos: avisos() }
  oraculo('SG20', `${id}: vencido el plazo, parado en la vela del TP y NO congelado, con aviso`, c1.reloj === 2 && !c1.congelado && !c1.play && !c1.boton && c1.avisos.length > 0, JSON.stringify(c1))
  await Promise.race([corre, espera(200)])
  // 2) rpc: aun no consta y no han pasado 20 s
  if (variante === 'rpc') {
    const lecturas = db.log.filter(c => c.tabla === 'sim_trades' && c.op === 'select').length
    // (con tope: en 785d9a8 la pulsacion se queda esperando para siempre)
    await Promise.race([accion(), espera(2500)]); await espera(600); await p.asienta(10)
    const c2 = { reloj: (e.currentTime - T) / 60, congelado: congelado(), relee: db.log.filter(c => c.tabla === 'sim_trades' && c.op === 'select').length > lecturas, ultimo: avisos().at(-1), abiertas: ps.positions.length }
    oraculo('SG20', `${id}: al volver a pulsar se relee el trade del servidor; no consta (antes de 20 s): sigue parado y avisa`, c2.reloj === 2 && !c2.congelado && c2.relee && /No se sabe si tu último cierre se guardó/.test(c2.ultimo || ''), JSON.stringify(c2))
    // pasan los 20 s del incierto (servicio.js ESPERA_INCIERTO_MS)
    for (const x of globalThis.__simServicio.inciertos) x.desde -= 21000
  }
  // 3) volver a pulsar hasta pasar de la vela
  for (let k = 0; k < 4 && (e.currentTime - T) / 60 <= 2; k++) { await Promise.race([accion(), espera(2500)]); await espera(modo === 'play' ? 1200 : 300); await p.asienta(10) }
  if (e.isPlaying) await Promise.race([pill().handlePlayPause(), espera(2500)])
  await Promise.race([COLA.esperaCola(ses.id), espera(2500)]); await p.asienta(20)
  const fila = db.tablas.sim_sessions.find(x => x.id === ses.id)
  const c3 = { reloj: (e.currentTime - T) / 60, congelado: congelado(), abiertas: ps.positions.length, trades: db.tablas.sim_trades.length, pnl: db.tablas.sim_trades.map(t => +t.pnl), saldoBase: +fila.balance, ocupadas: COLA.hayOcupadas(ses.id) }
  const esperado = variante === 'guardada' ? c3.abiertas === 0 && c3.trades === 1 && c3.pnl[0] === 200 && c3.saldoBase === 100200 : c3.abiertas === 1 && c3.trades === 0 && c3.saldoBase === 100000
  oraculo('SG20', `${id}: al reanudar, ${variante === 'guardada' ? 'consta guardado: cerrada con +200' : 'la posicion vuelve, abierta y sin trade'}, y el reloj pasa de la vela`, c3.reloj > 2 && !c3.congelado && !c3.ocupadas && esperado, JSON.stringify(c3))
  db.pausa = null; db.rpcExterno = null; e.pause(); p.desmonta(); await asienta()
}
fin()
