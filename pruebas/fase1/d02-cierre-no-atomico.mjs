/**
 * D02 · CERRAR Y ACTUALIZAR EL SALDO NO SON ATOMICOS; LOS ERRORES SE ENSEÑAN COMO EXITO
 *
 * Astra (4-oct): closePosition quita la posicion y sube el saldo en memoria y
 * despues hace dos escrituras sueltas —insert en sim_trades y update del saldo
 * en sim_sessions— sin mirar su { error } (components/useTradingActions.js:37-68;
 * supabase-js DEVUELVE el error, no lo lanza, asi que el try/catch no lo ve).
 *
 * Se ejecuta: closePosition REAL (banco del motor, con usuario: persiste en la
 * base falsa), con fallos programados en cada una de las dos escrituras.
 *
 * ORACULOS, a mano (capital 10.000; BUY 1 lote EURUSD 1,1000 → 1,1010 = +100):
 *   · invariante de la base: saldo guardado = capital + suma de los trades
 *     guardados (10.000 + 100 = 10.100 con el trade, 10.000 sin el)
 *   · si el cierre no se ha guardado, la pantalla no lo da por cerrado sin mas:
 *     la posicion sigue (pendiente de reconciliar) o hay un aviso de error.
 */
import { titulo, ver, oraculo, fin, escenario, sesionSim, vela, db, A } from '../lib.mjs'
import { banco, velasEnStorage } from '../banco-motor.mjs'
const T = Date.parse('2025-03-03T10:00:00Z') / 1000
const ses = sesionSim({ id: 'ses-d02', capital: 10000, balance: 10000 })
const base = () => {
  const s = db.tablas.sim_sessions.find(x => x.id === ses.id)
  const ts = db.tablas.sim_trades.filter(t => t.session_id === ses.id)
  return { saldo: Number(s.balance), suma: ts.reduce((a, t) => a + Number(t.pnl), 0), trades: ts.length }
}
async function cierra(falla) {
  escenario({ sim_sessions: [ses] })
  velasEnStorage('EUR/USD', [vela(T, 1.1, 1.1, 1.1, 1.1), vela(T + 60, 1.1, 1.1, 1.1, 1.1)], [2024], { tramoAbierto: true })
  const b = await banco({ sesion: ses, userId: A })
  const pos = b.abreMercado({ side: 'BUY', entry: 1.1000, sl: 1.0900, tp: 1.1100, lots: 1 })
  db.falla = falla
  await b.caja.valor.trading.closePosition(pos.id, 'MANUAL', 'EUR/USD', 1.1010)
  db.falla = null
  return { b, pos }
}

titulo('0 · control: sin fallos')
const ok = await cierra(null)
ver('trade de +100 guardado y saldo 10.100 en la base', base().trades === 1 && base().saldo === 10100 && Math.abs(base().suma - 100) < 1e-9, JSON.stringify(base()))

titulo('1 · falla el insert del trade')
const a = await cierra(c => c.tabla === 'sim_trades' && c.op === 'insert' ? { message: 'new row violates row-level security policy', code: '42501' } : null)
const ba = base()
ver('control: el trade no esta en la base', ba.trades === 0)
oraculo('D02', '1: la base queda coherente (saldo = capital + trades)', ba.saldo === 10000 + ba.suma, `saldo ${ba.saldo}, trades ${ba.suma}`)
oraculo('D02', '1: la pantalla no da por cerrado lo que no se guardo', a.b.ps().positions.length === 1 || a.b.estado.error != null,
  `posicion quitada, saldo en pantalla ${a.b.estado.saldo}, trade en el historial local: ${a.b.ps().trades.length}`)

titulo('2 · el trade entra, falla el update del saldo')
await cierra(c => c.tabla === 'sim_sessions' && c.op === 'update' ? { message: 'statement timeout', code: '57014' } : null)
const bb = base()
ver('control: el trade si esta en la base', bb.trades === 1)
oraculo('D02', '2: la base queda coherente (saldo = capital + trades)', bb.saldo === 10000 + bb.suma, `saldo ${bb.saldo}, trades ${bb.suma}`)
fin()
