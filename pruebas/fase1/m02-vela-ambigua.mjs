/**
 * M02 · UNA VELA QUE TOCA TP Y SL SIEMPRE DA EL TP
 *
 * Astra (4-oct): checkSLTP mira el TP antes que el SL
 * (components/useTradingActions.js:192-195). BUY 1,1000, SL 1,0990, TP 1,1010;
 * vela O 1,1000 H 1,1020 L 1,0980 C 1,1000 → siempre +100.
 *
 * Se ejecuta con el banco del motor (cableado REAL de la pagina, ver
 * pruebas/banco-motor.mjs): la posicion se abre y se avanza UNA vela.
 *
 * ORACULO (politica pedida por el CTO: vela ambigua → stop primero, con marca
 * de ambiguedad). Con OHLC no se sabe que toco antes; lo conservador es el SL:
 *   1 lote EURUSD, 10 pips × 10 USD = −100, y el cierre marcado como ambiguo.
 */
import { titulo, ver, oraculo, fin, escenario, sesionSim, vela } from '../lib.mjs'
import { banco, velasEnStorage } from '../banco-motor.mjs'
const T = Date.parse('2025-03-03T10:00:00Z') / 1000
const ses = sesionSim({ date_from: '2025-03-03', date_to: '2025-03-07' })
escenario({ sim_sessions: [ses] })
velasEnStorage('EUR/USD', [
  vela(T, 1.1000, 1.1002, 1.0998, 1.1000),
  vela(T + 60, 1.1000, 1.1020, 1.0980, 1.1000),      // toca TP (1,1010) y SL (1,0990)
  vela(T + 120, 1.1000, 1.1001, 1.0999, 1.1000),
], [2024])

titulo('1 · BUY 1,1000 / SL 1,0990 / TP 1,1010 y una vela que toca los dos')
const b = await banco({ sesion: ses })
ver('control: el motor real cargo las 3 velas y esta en la primera', b.motor()?.candles.length === 3 && b.motor().currentIndex === 0, b.motor()?.candles.length)
b.abreMercado({ side: 'BUY', entry: 1.1000, sl: 1.0990, tp: 1.1010, lots: 1 })
await b.paso(1)
const t = b.ps().trades[0]
ver('control: la posicion se cerro en esa vela', b.ps().positions.length === 0 && !!t, t?.reason)
oraculo('M02', 'vela ambigua: cierra por el SL (−100)', t?.reason === 'SL' && Math.abs(t.pnl + 100) < 1e-6, `${t?.reason} ${t?.pnl?.toFixed(2)}`)
oraculo('M02', 'y el cierre queda marcado como ambiguo', t?.ambigua === true || /ambig/i.test(JSON.stringify(t ?? {})), Object.keys(t ?? {}).join(','))

titulo('2 · control: una vela que solo toca el TP')
escenario({ sim_sessions: [ses] })
velasEnStorage('EUR/USD', [vela(T, 1.1, 1.1002, 1.0998, 1.1), vela(T + 60, 1.1, 1.1020, 1.0995, 1.1015), vela(T + 120, 1.1, 1.1, 1.1, 1.1)], [2024])
const c = await banco({ sesion: ses })
c.abreMercado({ side: 'BUY', entry: 1.1000, sl: 1.0990, tp: 1.1010, lots: 1 })
await c.paso(1)
ver('sin ambiguedad el TP da +100', c.ps().trades[0]?.reason === 'TP' && Math.abs(c.ps().trades[0].pnl - 100) < 1e-6)
fin()
