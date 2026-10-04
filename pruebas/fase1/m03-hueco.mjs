/**
 * M03 · UN STOP ATRAVESADO POR UN HUECO SE LLENA EN EL SL, NO EN LA APERTURA
 *
 * Astra (4-oct): checkSLTP cierra siempre a pos.sl
 * (components/useTradingActions.js:195). BUY 1,1000, SL 1,0990; la vela
 * siguiente abre en 1,0950 → el codigo da −100.
 *
 * ORACULO, a mano: el precio nunca cotizo entre 1,0990 y 1,0950; un stop es
 * una orden a mercado al tocarse, y la primera cotizacion es la apertura:
 *   (1,0950 − 1,1000) × 10.000 pips × 1 lote × 10 USD = −500.
 * Simetrico para el TP: un hueco a favor no regala mas que la apertura, pero
 * un TP es limitada y se llena a su precio o mejor (no se prueba aqui).
 */
import { titulo, ver, oraculo, fin, escenario, sesionSim, vela } from '../lib.mjs'
import { banco, velasEnStorage } from '../banco-motor.mjs'
const T = Date.parse('2025-03-03T10:00:00Z') / 1000
const ses = sesionSim()
escenario({ sim_sessions: [ses] })
velasEnStorage('EUR/USD', [
  vela(T, 1.1000, 1.1002, 1.0998, 1.1000),
  vela(T + 60, 1.0950, 1.0960, 1.0940, 1.0955),       // abre por debajo del SL
  vela(T + 120, 1.0955, 1.0956, 1.0954, 1.0955),
], [2024])

titulo('1 · BUY 1,1000 / SL 1,0990 y la vela siguiente abre en 1,0950')
const b = await banco({ sesion: ses })
b.abreMercado({ side: 'BUY', entry: 1.1000, sl: 1.0990, tp: 1.1100, lots: 1 })
await b.paso(1)
const t = b.ps().trades[0]
ver('control: la posicion se cerro por SL en esa vela', t?.reason === 'SL', t?.reason)
oraculo('M03', 'se llena en la apertura del hueco: 1,0950, −500', Math.abs((t?.exit ?? 0) - 1.0950) < 1e-9 && Math.abs(t.pnl + 500) < 1e-6, `salida ${t?.exit} pnl ${t?.pnl?.toFixed(2)}`)
fin()
