/**
 * SG06 · UN PAR CUYO HISTORICO ACABA ANTES NO BAJA EL RELOJ MAESTRO (SIMGOTO-03; revisor adversario de sim-goto-r2)
 * Reproduccion original del revisor en revisiones-suite/2026-10-22-sim-goto-r2/revisor/ (rojo en 415a1f7 y 4f3d245).
 */
// REV-R1: un par cuyo historico acaba ANTES del reloj maestro. Al ponerlo al dia, su ultima vela
// (con onTick desde SIMGOTO-02) mueve el reloj maestro hacia atras, y su onEnd guarda last_timestamp
// atrasado. Contrato SIMGOTO-03: "el reloj maestro nunca retrocede".
import { titulo, ver, oraculo, fin, escenario, sesionSim, vela, db, asienta } from '../lib.mjs'
import { banco, velasEnStorage } from '../banco-motor.mjs'
const dia = '2025-01-07', T = Date.parse(`${dia}T08:00:00Z`) / 1000
const ses = sesionSim({ pair: 'EUR/USD', date_from: dia, date_to: '2025-01-10', last_timestamp: T })
escenario({ sim_sessions: [ses] })
if (globalThis.window) globalThis.window.__algSuiteCurrentTime = null
const eur = Array.from({ length: 400 }, (_, i) => vela(T + i * 60, 1.05, 1.0501, 1.0499, 1.05))
const gbp = Array.from({ length: 100 }, (_, i) => vela(T + i * 60, 1.25, 1.2501, 1.2499, 1.25))   // acaba en T+99 min
velasEnStorage('EUR/USD', eur, [2024], { tramoAbierto: true })
velasEnStorage('GBP/USD', gbp, [2024])
const b = await banco({ sesion: ses })
ver('control: EUR en T', b.motor('EUR/USD').currentTime === T, String(b.motor('EUR/USD')?.currentTime - T))
await b.cambiaPar('GBP/USD'); await b.cambiaPar('EUR/USD')
ver('control: GBP cargado', !!b.motor('GBP/USD'))
await b.paso(200)
const tA = b.motor('EUR/USD').currentTime
ver('control: EUR en T+200 min', tA === T + 200 * 60, String((tA - T) / 60))
titulo('cambio a GBP/USD (su historico acaba en T+99 min)')
await b.cambiaPar('GBP/USD'); await asienta(100); await b.repinta()
const m = globalThis.window.__algSuiteCurrentTime
const fila = db.tablas.sim_sessions.find(s => s.id === ses.id)
console.log('GBP', (b.motor('GBP/USD').currentTime - T) / 60, 'min · maestro', (m - T) / 60, 'min · last_timestamp', (fila.last_timestamp - T) / 60, 'min')
oraculo('REV-R1', 'el reloj maestro no retrocede al poner al dia un par que acaba antes', m >= tA, `maestro T+${(m - T) / 60} < EUR T+${(tA - T) / 60}`)
oraculo('REV-R1', 'last_timestamp guardado no retrocede', fila.last_timestamp >= tA, `last_timestamp T+${(fila.last_timestamp - T) / 60}`)
// y un par NUEVO cargado ahora arranca en el maestro atrasado
velasEnStorage('USD/JPY', eur.map(v => vela(v.time, 150, 150.01, 149.99, 150)), [2024])
await b.cambiaPar('USD/JPY'); await asienta(100); await b.repinta()
const tJ = b.motor('USD/JPY')?.currentTime
oraculo('REV-R1', 'un par nuevo abierto despues arranca en la hora de EUR (T+200), no detras', tJ === tA, `USD/JPY T+${(tJ - T) / 60}`)
fin()
