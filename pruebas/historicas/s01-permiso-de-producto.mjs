/**
 * S01 · LAS APIS DE VELAS Y DE CHALLENGE NO MIRAN EL PERMISO DEL SIMULADOR
 *
 * Astra (4-oct): /api/candles y /api/challenge/{create,status,advance} usan
 * requireUser (lib/authApi.js:71), que solo valida el JWT; ninguna mira
 * profiles.simulador_activo. Una cuenta sin permiso recibe 200 y cero lecturas
 * de permiso.
 *
 * Se ejecuta: los handlers REALES con una cuenta del hub sin simulador
 * (simulador_activo = false, rol user), por el fetch del entorno con su cookie.
 *
 * ORACULO: sin simulador_activo (y sin ser admin) → 403, sin leer velas ni
 * crear nada. Controles: sin token → 401 (el guard de identidad funciona), y la
 * misma peticion con permiso → 200.
 */
import { titulo, ver, oraculo, fin, escenario, perfil, A, B, db, sesionSim, tradeSim } from '../lib.mjs'
const VELAS = JSON.stringify([{ time: 1741168800, open: 1.1, high: 1.1, low: 1.1, close: 1.1, volume: 1 }])
const montaje = (conPermiso) => {
  const ses = sesionSim({ id: 'reto1', user_id: A, challenge_type: '2F', challenge_phase: 1, capital: 100000, balance: 100000 })
  // un +10.000 cerrado: el 10 % de la fase 1 de un 2F, para que advance pueda pasar de fase
  escenario({ perfiles: [perfil(A, { simulador_activo: conPermiso }), perfil(B)], sim_sessions: [ses],
    sim_trades: [tradeSim({ session_id: 'reto1', pnl: 10000, result: 'WIN', closed_at: '2025-03-04T12:00:00Z' })],
    storage: { 'forex-data': { 'EURUSD/M1/2025.json': VELAS } } })
}
const pide = (u, o) => fetch(u, o).then(async r => ({ estado: r.status, cuerpo: await r.json().catch(() => null) }))
const LLAMADAS = [
  ['GET /api/candles', () => pide('/api/candles?pair=EURUSD&timeframe=M1&from=1741132800&to=1741219200&year=2025')],
  ['POST /api/challenge/create', () => pide('/api/challenge/create', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ challenge_type: '2F', capital: 100000, pair: 'EUR/USD', timeframe: 'H1', date_from: '2025-03-03', date_to: '2025-03-07' }) })],
  ['GET /api/challenge/status', () => pide('/api/challenge/status?session_id=reto1')],
  ['POST /api/challenge/advance', () => pide('/api/challenge/advance', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ session_id: 'reto1', outcome: 'pass', end_timestamp: 1741100000 }) })],
]

titulo('1 · controles')
montaje(false); db.sesion = null
const sinToken = await LLAMADAS[0][1]()
ver('sin token: 401', sinToken.estado === 401, sinToken.estado)
montaje(true)
for (const [n, f] of LLAMADAS) { const r = await f(); ver(`con permiso: ${n} → 200`, r.estado === 200, r.estado) }

titulo('2 · una cuenta del hub SIN simulador')
for (const [n, f] of LLAMADAS) {
  montaje(false)
  const r = await f()
  const lecturasPermiso = db.log.filter(l => l.tabla === 'profiles').length
  const escrituras = db.log.filter(l => ['insert', 'update', 'delete', 'upsert'].includes(l.op)).map(l => `${l.op} ${l.tabla}`)
  oraculo('S01', `${n} sin permiso → 403`, r.estado === 403,
    `estado ${r.estado}; lecturas de profiles ${lecturasPermiso}; ${r.cuerpo?.count != null ? `velas servidas ${r.cuerpo.count}; ` : ''}escrituras: ${escrituras.join(', ') || 'ninguna'}${r.cuerpo?.action ? '; ' + r.cuerpo.action : ''}`)
}
fin()
