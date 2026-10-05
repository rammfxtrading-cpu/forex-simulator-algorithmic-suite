/**
 * C02 · RAMON Y EL ALUMNO VEN METRICAS INCOMPATIBLES; ALGUNA FORMULA ES ERRONEA
 *
 * Astra (4-oct): con tres trades +100/−100/0 (R +1/−1/0), la expectativa del
 * admin es −33,33 porque mete los breakeven en la probabilidad de perder
 * (pages/admin.js:249-251); el «R:R medio» es 1 para el alumno (solo
 * ganadoras, pages/analytics.js:93) y 0 para el mentor (todas, admin.js:238).
 * Con dos sesiones de 10.000 y 50.000, «todas las sesiones» parte de 60.000
 * para el alumno (analytics.js:107-109) y de 10.000 para el admin (admin.js:253-255).
 *
 * Se ejecuta: las dos PAGINAS REALES (React falso) sobre los mismos datos; el
 * admin pide el detalle a /api/admin/alumno-sim/[id] REAL. El capital de
 * partida se lee del campo «Start balance» del Montecarlo, que cada pagina
 * rellena con su initialBalance.
 *
 * ORACULOS, a mano:
 *   · expectativa = suma de P&L / numero de trades = (100 − 100 + 0) / 3 = 0
 *   · el R:R medio es el mismo numero para el alumno y para el mentor
 *   · el capital de partida de «todas las sesiones» es el mismo en las dos
 *     (cual de los dos —60.000 o el de una sesion— es decision de producto)
 * Decisiones del CTO (4-oct, bloque B): un unico modulo de metricas;
 * expectativa = suma de P&L / trades; R:R con una sola definicion; orden por
 * cierre; capital = suma de las sesiones incluidas; actividad por fecha real.
 *   · capital de «todas»: 10.000 + 50.000 = 60.000 en las dos
 *   · orden por cierre: abiertas G (09:00), P (10:00), G (12:00), cerradas
 *     P (11:00), G (13:00), G (16:00) → racha maxima 2 ganadoras y 1 perdedora
 *   · actividad: un trade registrado ayer (created_at) de mercado de 2025
 *     cuenta como activo en los ultimos 7 dias
 */
import { titulo, ver, oraculo, fin, escenario, sesionSim, tradeSim, perfil, importa, monta, A, ADM, db, tok } from '../lib.mjs'
import { llama } from '../supabase-falso.mjs'
const Analytics = (await importa('pages/analytics.js')).default
const Admin = (await importa('pages/admin.js')).default
const s1 = sesionSim({ id: 's-diez', name: 'Diez mil', capital: 10000, balance: 10000, created_at: '2026-09-20T00:00:00Z' })
const s2 = sesionSim({ id: 's-cincuenta', name: 'Cincuenta mil', capital: 50000, balance: 50000, created_at: '2026-09-10T00:00:00Z' })
const TRADES = [
  tradeSim({ session_id: 's-diez', pnl: 100, rr: 1, result: 'WIN', opened_at: '2025-03-03T09:00:00Z', closed_at: '2025-03-03T10:00:00Z' }),
  tradeSim({ session_id: 's-diez', pnl: -100, rr: -1, result: 'LOSS', opened_at: '2025-03-03T11:00:00Z', closed_at: '2025-03-03T12:00:00Z' }),
  tradeSim({ session_id: 's-diez', pnl: 0, rr: 0, result: 'BREAKEVEN', opened_at: '2025-03-03T13:00:00Z', closed_at: '2025-03-03T14:00:00Z' }),
]
const datos = sesion => escenario({ sesion, perfiles: [perfil(A), perfil(ADM, { rol_global: 'admin' })], sim_sessions: [s1, s2], sim_trades: TRADES })
// el valor de una tarjeta: el texto del nodo padre de la etiqueta, sin la etiqueta
// el campo «Start balance ($)» del Montecarlo: el input mas cercano a esa etiqueta
const startBalance = p => {
  let n = p.busca(x => x.tipo && p.texto(x) === 'Start balance ($)')
  for (let i = 0; n && i < 4; i++, n = n.padre) { const inp = [...p.recorre(n)].find(x => x.tipo === 'input'); if (inp) return String(inp.props.value) }
  return null
}
const valorDe = (p, etiqueta) => { const n = p.busca(x => x.tipo && p.texto(x) === etiqueta); return n ? p.texto(n.padre).replace(etiqueta, '').trim() : null }

titulo('1 · el alumno en Analytics')
datos(A)
const pa = monta(Analytics, {}); await pa.asienta(100)
const rrA = valorDe(pa, 'AVG R:R')
ver('control: Analytics pinto los 3 trades', valorDe(pa, 'TOTAL TRADES') === '3', valorDe(pa, 'TOTAL TRADES'))
const sbA = startBalance(pa)
pa.desmonta()

titulo('2 · Ramon en el admin, detalle del mismo alumno')
datos(ADM)
const pm = monta(Admin, {}); await pm.asienta(100)
ver('control: la lista de alumnos cargo (botones «Ver analytics»)', pm.todos(x => x.props?.title === 'Ver analytics').length >= 1)
// el boton del alumno A: el que esta en la fila con su email
const filas = pm.todos(x => x.props?.title === 'Ver analytics')
const fila = filas.find(b => { let n = b; for (let i = 0; i < 8 && n; i++) { if (pm.texto(n).includes('a@ejemplo.test')) return true; n = n.padre } return false })
ver('control: hay boton para el alumno A', !!fila, filas.length)
pm.pulsa(fila); await pm.asienta(100)
const tm = pm.texto()
ver('control: el detalle cargo de /api/admin/alumno-sim/[id] (EXPECTATIVA y R:R PROMEDIO en pantalla)', /EXPECTATIVA/.test(tm) && /R:R PROMEDIO/.test(tm))
const sbM = startBalance(pm)
const expectativa = valorDe(pm, 'EXPECTATIVA')
const rrMentor = valorDe(pm, 'R:R PROMEDIO')
pm.desmonta()

titulo('3 · los numeros')
ver('control: se leyeron los dos R:R y la expectativa', !!rrA && !!rrMentor && !!expectativa, `${rrA} / ${rrMentor} / ${expectativa}`)
oraculo('C02', 'expectativa del admin = (100 − 100 + 0) / 3 = 0', /^\+?\$?0\.00$/.test(expectativa ?? ''), `admin enseña ${expectativa}`)
oraculo('C02', 'el R:R medio es el mismo para alumno y mentor', parseFloat(rrA) === parseFloat(rrMentor), `alumno ${rrA} · mentor ${rrMentor}`)
ver('control: se leyo el capital de partida de las dos', !!sbA && !!sbM, `${sbA} / ${sbM}`)
oraculo('C02', '«todas las sesiones» parte del mismo capital en las dos', sbA === sbM, `alumno ${sbA} · admin ${sbM}`)
oraculo('C02', 'y es la suma de las sesiones incluidas: 60.000', Number(sbA) === 60000 && Number(sbM) === 60000, `alumno ${sbA} · admin ${sbM}`)

titulo('4 · orden por cierre (racha en el admin)')
const ORDEN = [
  tradeSim({ session_id: 's-diez', pnl: 100, rr: 1, result: 'WIN', opened_at: '2025-03-04T09:00:00Z', closed_at: '2025-03-04T16:00:00Z' }),
  tradeSim({ session_id: 's-diez', pnl: -100, rr: -1, result: 'LOSS', opened_at: '2025-03-04T10:00:00Z', closed_at: '2025-03-04T11:00:00Z' }),
  tradeSim({ session_id: 's-diez', pnl: 100, rr: 1, result: 'WIN', opened_at: '2025-03-04T12:00:00Z', closed_at: '2025-03-04T13:00:00Z' }),
]
escenario({ sesion: ADM, perfiles: [perfil(A), perfil(ADM, { rol_global: 'admin' })], sim_sessions: [s1], sim_trades: ORDEN })
const pr = monta(Admin, {}); await pr.asienta(100)
const filaR = pr.todos(x => x.props?.title === 'Ver analytics').find(b => { let n = b; for (let i = 0; i < 8 && n; i++) { if (pr.texto(n).includes('a@ejemplo.test')) return true; n = n.padre } return false })
pr.pulsa(filaR); await pr.asienta(100)
const racha = valorDe(pr, 'RACHA MAX')
ver('control: el detalle enseña la racha', !!racha, racha)
oraculo('C02', 'racha en orden de cierre: 2W / 1L', racha === '2W / 1L', `admin enseña ${racha} (orden de apertura: 1W / 1L)`)
pr.desmonta()

titulo('5 · actividad por fecha real (lista de alumnos del admin)')
const ayer = new Date(Date.now() - 86400000).toISOString()
escenario({ sesion: ADM, perfiles: [perfil(A), perfil(ADM, { rol_global: 'admin' })], sim_sessions: [{ ...s1, created_at: '2026-01-10T00:00:00Z' }],
  sim_trades: [tradeSim({ session_id: 's-diez', opened_at: '2025-03-04T09:00:00Z', closed_at: '2025-03-04T10:00:00Z', created_at: ayer })] })
const lista = await llama((await importa('pages/api/admin/list-alumnos-sim.js')).default, { method: 'GET', token: tok(ADM) })
ver('control: la lista respondio con el alumno A', lista.estado === 200 && lista.cuerpo.usuarios.some(u => u.id === A), lista.estado)
oraculo('C02', 'un trade registrado ayer (de mercado 2025) cuenta como actividad de los ultimos 7 dias', lista.cuerpo.aggregates?.activos_7d === 1,
  `activos_7d ${lista.cuerpo.aggregates?.activos_7d}; ultima actividad ${lista.cuerpo.usuarios.find(u => u.id === A)?.metrics?.last_activity}`)

titulo('bloque D, punto 7: el flotante dice que es solo del par activo')
// Astra (cierres, 5-oct): la barra reduce solo activePs.positions (EURUSD +300,
// GBPUSD −500: enseña +300 o −500 segun el par activo; la cartera es −200).
// Hasta el motor nuevo (valoracion de toda la cartera), la etiqueta lo dice.
const Barra = (await importa('components/SessionBottomBar.js')).default
const nada = () => {}
const pb = monta(Barra, { lastTrade: null, challengeLocked: false, setOrderModal: nada, currentPrice: 1.1, activePair: 'EUR/USD', dataReady: true,
  balance: 10000, realized: 0, unrealized: 300, allTrades: [], challengeStatus: null, openPositions: [], pendingOrders: [],
  showPos: false, setShowPos: nada, showOrders: false, setShowOrders: nada, showTrades: false, setShowTrades: nada })
await pb.asienta()
const txt = pb.texto().replace(/\s+/g, ' ')
ver('control: la barra pinta el flotante (+300)', /\+300\.00/.test(txt), txt.slice(0, 160))
oraculo('C02', 'la etiqueta del flotante dice «par activo» y que par es', /Float par activo \(EUR\/USD\): \+300\.00/.test(txt), (/Float[^$]*?[+-]\d+\.\d{2}/.exec(txt) ?? [''])[0])
pb.desmonta()
fin()
