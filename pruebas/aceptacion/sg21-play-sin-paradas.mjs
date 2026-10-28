/**
 * SG21 · EL PLAY NO SE PARA EN EL TP, EL SL NI EL OBJETIVO; EL BREACH, COMO EN PRODUCCION (orden 1-124 del CTO)
 *
 * Regresion de uso normal. El 23-oct, con el Go to (785d9a8), el Play se paraba y no dejaba avanzar; produccion volvio
 * a f5b713b. Regla de Ramon: el Play solo se para cuando lo para el alumno, o con el aviso del plazo de 12 s si un cierre
 * no se confirma. La parada medida venia de la frontera economica (lib/sim/salto.js creaFrontera: false cuando el reto
 * deja de estar activo) y de lib/replayEngine.js _tickFrame (bloqueado + pause()).
 *
 * El Play se arranca como handlePlayPause (_SessionInner.js): la frontera del Play (si existe) y e.play(). Los
 * fotogramas, a mano con _tickFrame (requestAnimationFrame no corre en las pruebas), 1 vela por fotograma. Cada pause()
 * del motor se apunta con la hora de su vela.
 *
 * ORACULOS, a mano. Reto 2F fase 1 (objetivo 10 %, DD diario 5 %), 100.000, EUR/USD, 10 $ por pip y lote, 15 velas M1
 * desde el 7-ene-2025 11:55 UTC; SELL a 1,1000:
 *   P1 1 lote, TP 1,0990 (vela 1, minimo 1,0989): +100
 *   P2 1 lote, SL 1,1010 (vela 3, maximo 1,1011): -100
 *   P3 10 lotes, TP 1,0890 (vela 5, minimo 1,0889): +11.000 → saldo 111.000 = +11 % ≥ 10 %: objetivo
 * El Play sigue sin una sola pausa hasta la vela 10 (la prueba lo corta ahi, con la suya).
 * BREACH (lo que hace f5b713b, components/useChallengeFlow.js: tras un breach, engine.pause() y setIsPlaying(false)):
 *   P 10 lotes SELL a 1,1000, SL 1,1200; vela 2 con maximo 1,1060: flotante -6.000 > 5 % diario → failed_dd_daily, el
 *   cierre BREACH y el Play parado en la vela 2 (y ahi sigue con mas fotogramas). Esa pausa NO viene del 785d9a8 (orden
 *   1-124: no se toca; el choque con «Play pasando por el breach sin pararse» lo plantea la ventana 1 al CTO).
 */
import { titulo, ver, oraculo, fin, escenario, sesionSim, vela, importa, A, asienta, db, fuente } from '../lib.mjs'
import { banco, velasEnStorage } from '../banco-motor.mjs'
// en f5b713b (produccion) no hay lib/sim/salto.js: el Play de entonces es e.play() sin frontera
const SAL = await importa('lib/sim/salto.js').catch(() => null)
const CI = await importa('lib/sim/cierre.js').catch(() => null)
const SV = await importa('lib/sim/servicio.js').catch(() => null)
const COLA = await importa('lib/sim/cola.js').catch(() => null)

// el banco copia el arranque del Play de la pagina: si la pagina cambia, el banco miente
const pagina = fuente('components/_SessionInner.js')
ver('el arranque del Play copiado sigue en _SessionInner.js', SAL?.creaFrontera
  ? pagina.includes('e.frontera=creaFrontera({engine:e,sid:id,pairState,esReto:!!sessionRef.current?.challenge_type,refresca:refreshChallengeStatus,play:true})\n      e.play();setIsPlaying(true)')
  : /e\.play\(\);setIsPlaying\(true\)/.test(pagina))

const T = Date.parse('2025-01-07T11:55:00Z') / 1000
async function monta(velas, posiciones) {
  const ses = sesionSim({ pair: 'EUR/USD', date_from: '2025-01-07', date_to: '2025-01-10', last_timestamp: T, capital: 100000, balance: 100000, challenge_type: '2F', challenge_phase: 1 })
  escenario({ sim_sessions: [ses] })
  velasEnStorage('EUR/USD', velas, [2024], { tramoAbierto: true })
  const b = await banco({ sesion: ses, userId: A })
  CI?.fijaSaldoConfirmado?.(ses.id, 100000); if (SV?.leeServicio) await SV.leeServicio(); await b.repinta()
  for (const p of posiciones) b.abreMercado(p)
  await b.repinta()
  return { ses, b }
}
// el Play como handlePlayPause; devuelve las pausas (hora de la vela - T, en s) y si sigue reproduciendo
async function reproduce({ ses, b }, hasta, maxFotogramas = 60) {
  const e = b.motor(), pausas = [], pausa = e.pause.bind(e)
  e.pause = () => { if (e.isPlaying) pausas.push(e.currentTime - T); pausa() }
  e._loop = () => {}
  // como la pagina (orden 1-153: la frontera del Play, play: true)
  e.frontera = SAL?.creaFrontera?.({ engine: e, sid: ses.id, pairState: b.refs.pairState, esReto: true, refresca: b.caja.valor.reto.refreshChallengeStatus, play: true }) ?? null
  e.speed = 4; e.play(); b.estado.isPlaying = true
  let k = 0
  while (e.isPlaying && e.currentTime < T + hasta && k < maxFotogramas) {
    e._tickFrame(k++ * 250)
    if (e._esperando) await e._esperando
    await asienta(20); await b.repinta()
  }
  const sigue = e.isPlaying, reloj = e.currentTime - T
  // dos fotogramas mas: lo que esta parado no avanza solo
  e._tickFrame(k++ * 250); e._tickFrame(k++ * 250); await asienta(20)
  const relojDespues = e.currentTime - T
  e.pause = pausa; pausa()
  await asienta(80); if (COLA?.esperaCola) await COLA.esperaCola(ses.id); await asienta(80); await b.repinta()
  return { pausas, sigue, reloj, relojDespues, k }
}
// las filas de la base (pnl y hora de cierre); el motivo, del trade del cliente (la fila no lo guarda). Los oraculos
// identifican cada cierre por su pnl: la hora closed_at no es de esta orden (en f5b713b sale una vela antes, el
// currentTime de la pagina; el paquete graba la de la vela) y va solo en las cifras
const pnls = tr => tr.map(x => x[0])
const trades = () => db.tablas.sim_trades.map(t => [Number(t.pnl), Date.parse(t.closed_at) / 1000 - T]).sort((x, y) => x[1] - y[1])
const motivos = b => (b.ps().trades || []).map(t => t.reason)

titulo('uso normal: el Play pasa por un TP, un SL y el objetivo sin pararse')
{
  const vs = Array.from({ length: 15 }, (_, i) => i === 1 ? vela(T + 60, 1.1, 1.1002, 1.0989, 1.1)
    : i === 3 ? vela(T + 180, 1.1, 1.1011, 1.0999, 1.1)
    : i === 5 ? vela(T + 300, 1.1, 1.1002, 1.0889, 1.1)
    : vela(T + i * 60, 1.1, 1.1002, 1.0999, 1.1))
  const m = await monta(vs, [
    { side: 'SELL', entry: 1.1, sl: 1.11, tp: 1.099, lots: 1 },
    { side: 'SELL', entry: 1.1, sl: 1.101, tp: 1.08, lots: 1 },
    { side: 'SELL', entry: 1.1, sl: 1.11, tp: 1.089, lots: 10 },
  ])
  const r = await reproduce(m, 600)
  const tr = trades(), reto = m.b.caja.valor.reto
  const cifras = JSON.stringify({ ...r, trades: tr, estado: reto.challengeStatus?.evaluation?.status, saldo: m.b.estado.saldo })
  console.log('USO NORMAL', cifras)
  const pasa = (t) => !r.pausas.some(p => p <= t) && r.reloj > t
  oraculo('SG21', 'TP (vela 1, +100): el Play lo pasa sin pararse', pnls(tr).includes(100) && pasa(60), cifras)
  oraculo('SG21', 'SL (vela 3, -100): el Play lo pasa sin pararse', pnls(tr).includes(-100) && pasa(180), cifras)
  oraculo('SG21', 'objetivo (vela 5, +11.000, target_reached): el Play lo pasa sin pararse y sigue reproduciendo hasta la vela 10',
    pnls(tr).includes(11000) && reto.challengeStatus?.evaluation?.status === 'target_reached' && r.pausas.length === 0 && r.sigue && r.reloj === 600, cifras)
  oraculo('SG21', 'lo economico: 3 cierres [+100, -100, +11.000], saldo 111.000, 0 abiertas, el modal de fase pasada (como f5b713b)',
    JSON.stringify(pnls(tr)) === JSON.stringify([100, -100, 11000]) && m.b.estado.saldo === 111000 && m.b.ps().positions.length === 0 && reto.challengeModal === 'passed_phase',
    `${cifras} · modal ${reto.challengeModal}`)
  m.b.caja.raiz.desmonta?.()
}

titulo('breach: el comportamiento de f5b713b (useChallengeFlow pausa el Play en la vela del breach)')
{
  const vs = Array.from({ length: 15 }, (_, i) => i === 2 ? vela(T + 120, 1.1, 1.106, 1.0999, 1.1) : vela(T + i * 60, 1.1, 1.1002, 1.0999, 1.1))
  const m = await monta(vs, [{ side: 'SELL', entry: 1.1, sl: 1.12, tp: 1.05, lots: 10 }])
  const r = await reproduce(m, 600)
  const tr = trades(), reto = m.b.caja.valor.reto
  const cifras = JSON.stringify({ ...r, trades: tr, motivos: motivos(m.b), estado: reto.challengeStatus?.evaluation?.status, modal: reto.challengeModal })
  console.log('BREACH', cifras)
  oraculo('SG21', 'breach (vela 2): failed_dd_daily, un cierre BREACH y el Play parado en la vela 2, como en produccion',
    reto.challengeStatus?.evaluation?.status === 'failed_dd_daily' && tr.length === 1 && JSON.stringify(motivos(m.b)) === '["DD_DAILY_BREACH"]' && !r.sigue && r.reloj === 120 && r.pausas[0] === 120, cifras)
  oraculo('SG21', 'tras el breach, mas fotogramas no avanzan (sigue en la vela 2) y el modal es el de quemado', r.relojDespues === 120 && reto.challengeModal === 'failed', cifras)
  m.b.caja.raiz.desmonta?.()
}
fin()
