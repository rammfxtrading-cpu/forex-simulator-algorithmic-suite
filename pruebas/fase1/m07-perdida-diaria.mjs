/**
 * M07 · EL LIMITE DIARIO SE CALCULA SOBRE EL SALDO DEL DIA, NO SOBRE EL CAPITAL
 *
 * Astra (4-oct): el evaluador usa como tope diario el 5 % del saldo de inicio
 * del dia (lib/challengeEngine.js:174), y el producto se presenta como
 * «Formato FTMO clasico» (lib/challengeRules.js:27). En FTMO el tope es el
 * 5 % del capital INICIAL, contado desde el saldo de inicio del dia. Dia 1
 * +3.000, dia 2 −5.100 → el codigo da tope 5.150 y «active».
 *
 * Se ejecuta: evaluateChallenge REAL (el mismo que usan /api/challenge/status
 * y /api/challenge/advance).
 *
 * ORACULO, a mano (2 fases, capital 100.000, 5 % diario del capital inicial):
 *   dia 1: +3.000 → saldo 103.000
 *   dia 2: limite = 103.000 − 5 % × 100.000 = 98.000; tras −5.100 la equity
 *          es 97.900 < 98.000 → failed_dd_daily
 * ⚠️ Es una decision de producto: o se aplica la regla FTMO, o se deja de
 *    llamar FTMO. La prueba usa la regla que el producto dice imitar.
 */
import { titulo, ver, oraculo, fin, importa, escenario } from '../lib.mjs'
const { evaluateChallenge } = await importa('lib/challengeEngine.js')
const { CHALLENGES } = await importa('lib/challengeRules.js')
escenario()
const t = (closed_at, pnl) => ({ closed_at, pnl, result: pnl > 0 ? 'WIN' : 'LOSS' })

titulo('1 · dia 1 +3.000, dia 2 −5.100')
ver('control: el producto llama al 2F «Formato FTMO clasico»', /FTMO/.test(CHALLENGES['2F'].description), CHALLENGES['2F'].description)
const ev = evaluateChallenge({ challengeType: '2F', currentPhase: 1, capital: 100000, currentTimeIso: '2025-03-04T15:00:00Z',
  trades: [t('2025-03-03T12:00:00Z', 3000), t('2025-03-04T12:00:00Z', -5100)] })
ver('control: el evaluador ve las dos jornadas (DD del dia 2 = 5.100)', Math.abs(ev.ddDailyWorstUSD - 5100) < 1e-9, ev.ddDailyWorstUSD)
oraculo('M07', 'tope diario 5.000 (5 % del capital inicial)', Math.abs(ev.ddDailyCapUSD - 5000) < 1e-9, `codigo ${ev.ddDailyCapUSD}`)
oraculo('M07', 'equity 97.900 < 98.000: failed_dd_daily', ev.status === 'failed_dd_daily', `codigo ${ev.status}`)

titulo('2 · control: un dia que baja exactamente el 5 % del capital sin ganancias previas')
const ev2 = evaluateChallenge({ challengeType: '2F', currentPhase: 1, capital: 100000, trades: [t('2025-03-03T12:00:00Z', -5000)] })
ver('saldo inicial = capital: las dos reglas coinciden y quema', ev2.status === 'failed_dd_daily')
fin()
