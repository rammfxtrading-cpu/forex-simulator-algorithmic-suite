/**
 * M06 · EL BREACH INTRAVELA QUEMA UN CHALLENGE QUE NO HA PERDIDO EL 5 % DEL DIA
 *
 * Astra (4-oct): resolveBreach suma «la caida ya producida hoy» y el peor
 * flotante como si fueran del mismo instante (lib/trading/breach.js:41), e
 * ignora lo ganado hoy. Caso A: realizado hoy +3.000, flotante −6.000 →
 * equity 97.000 (−3.000 en el dia) y aun asi fuerza un cierre de −5.005; el
 * evaluador sigue «active». Caso B: hoy −3.000 y +3.000, flotante −2.500 →
 * fuerza −2.005.
 *
 * Se ejecuta con el banco del motor (cableado REAL, pruebas/banco-motor.mjs):
 * useChallengeFlow REAL pide el estado a /api/challenge/status REAL (sobre la
 * base falsa) y el onTick REAL llama a checkChallengeBreach, que cierra con
 * closePosition REAL.
 *
 * ORACULOS, a mano (regla de perdida diaria: la equity no puede bajar del
 * saldo de inicio del dia menos el 5 % del capital inicial; total: no bajar
 * del capital menos el 10 %). Capital 100.000; 1 lote EURUSD = 10 USD/pip.
 *   A: inicio del dia 100.000; +3.000 realizado → 103.000; BUY 1,2000 y la
 *      vela baja a 1,1400 → flotante (1,14 − 1,20) × 10.000 × 10 = −6.000;
 *      peor equity 97.000 ≥ 95.000 y ≥ 90.000 → NO hay breach.
 *   B: inicio 100.000; −3.000 y +3.000 → 100.000; flotante a 1,1750 = −2.500;
 *      peor equity 97.500 ≥ 95.000 → NO hay breach. (El −3.000 de las 09:00 y
 *      el −2.500 de las 10:01 no coinciden en el tiempo: no se suman.)
 */
import { titulo, ver, oraculo, fin, escenario, sesionSim, tradeSim, vela, importa } from '../lib.mjs'
import { banco, velasEnStorage } from '../banco-motor.mjs'
const T = Date.parse('2025-03-04T10:00:00Z') / 1000

async function caso({ realizados, saldo, minimo, par }) {
  const ses = sesionSim({ pair: par, capital: 100000, balance: saldo, challenge_type: '2F', challenge_phase: 1, date_from: '2025-03-04', date_to: '2025-03-07' })
  escenario({ sim_sessions: [ses], sim_trades: realizados.map(([hora, pnl]) => tradeSim({ session_id: ses.id, pair: par, pnl, result: pnl > 0 ? 'WIN' : 'LOSS', closed_at: `2025-03-04T${hora}:00Z` })) })
  velasEnStorage(par, [vela(T, 1.2000, 1.2001, 1.1999, 1.2000), vela(T + 60, 1.1990, 1.1995, minimo, minimo + 0.0050), vela(T + 120, 1.1950, 1.1960, 1.1940, 1.1950)], [2024])
  const b = await banco({ sesion: ses })
  await b.repinta()
  const ev = () => b.caja.valor.reto.challengeStatus?.evaluation
  const pos = b.abreMercado({ side: 'BUY', entry: 1.2000, sl: 1.1000, tp: 1.3000, lots: 1 })
  await b.paso(1)
  await new Promise(r => setTimeout(r, 50)); await b.repinta()
  return { b, ev, pos, forzados: b.ps().trades.filter(t => /BREACH/.test(t.reason)) }
}

titulo('A · realizado hoy +3.000, flotante −6.000')
// cada caso con su par: /api/candles cachea por par y año (D05)
const A = await caso({ realizados: [['09:00', 3000]], saldo: 103000, minimo: 1.1400, par: 'EUR/USD' })
ver('control: el estado del reto llego del endpoint real (2F, cap diario 5.000)', A.b.caja.valor.reto.challengeStatus?.config?.code === '2F' && A.ev()?.ddDailyCapUSD === 5000, JSON.stringify({ cap: A.ev()?.ddDailyCapUSD, hoy: A.ev()?.ddDailyCurrentUSD }))
ver('control: la vela bajo a 1,1400 con la posicion abierta (motor en esa vela)', A.b.motor().currentIndex === 1)
const fa = A.forzados[0]
oraculo('M06', 'A: sin breach (peor equity 97.000 > 95.000): la posicion sigue abierta', A.forzados.length === 0 && A.b.ps().positions.length === 1, fa ? `cierre forzado ${fa.reason} ${fa.pnl.toFixed(2)} a ${fa.exit.toFixed(5)}` : '')

titulo('B · hoy −3.000 y +3.000, flotante −2.500')
const B = await caso({ realizados: [['09:00', -3000], ['09:15', 3000]], saldo: 100000, minimo: 1.1750, par: 'GBP/USD' })
ver('control: el endpoint dice que hoy ya se cayo 3.000', B.ev()?.ddDailyCurrentUSD === 3000, B.ev()?.ddDailyCurrentUSD)
const fb = B.forzados[0]
oraculo('M06', 'B: sin breach (peor equity 97.500 > 95.000): la posicion sigue abierta', B.forzados.length === 0 && B.b.ps().positions.length === 1, fb ? `cierre forzado ${fb.reason} ${fb.pnl.toFixed(2)}` : '')

titulo('control: el evaluador del servidor no ve quemado ninguno de los dos')
const { evaluateChallenge } = await importa('lib/challengeEngine.js')
const tradesA = [{ closed_at: '2025-03-04T09:00:00Z', result: 'WIN', pnl: 3000 }, ...(fa ? [{ closed_at: '2025-03-04T10:01:00Z', result: 'LOSS', pnl: fa.pnl }] : [])]
const evA = evaluateChallenge({ challengeType: '2F', currentPhase: 1, capital: 100000, trades: tradesA, currentTimeIso: '2025-03-04T10:01:00Z' })
ver('con el cierre forzado incluido, el evaluador sigue «active» en A', evA.status === 'active', `${evA.status} · DD dia ${evA.ddDailyWorstUSD.toFixed(2)}`)
fin()
