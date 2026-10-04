/**
 * C03 · DOS SESIONES CON EL MISMO NOMBRE NO SE DISTINGUEN EN ANALYTICS
 *
 * Astra (4-oct): el selector usa el NOMBRE como valor y el filtro hace
 * sessions.find(s => s.name === selectedSession) (pages/analytics.js:76, :92):
 * con dos «Modelo» siempre sale la primera.
 * Decision del CTO (4-oct, bloque A): filtrar por id de sesion.
 *
 * Se ejecuta: la pagina REAL de Analytics (React falso). Se elige en el
 * selector la SEGUNDA opcion «Modelo», como lo haria el alumno: el valor que
 * llega al onChange es el de esa opcion (su `value`, o su texto si no tiene,
 * como en el navegador).
 *
 * ORACULO, a mano: «Modelo» A (capital 10.000) con +100; «Modelo» B
 * (capital 20.000) con −40 y −10. Elegida la B: TOTAL P&L −$50.00, 2 trades,
 * ACCOUNT BALANCE $19950.00. Y las dos opciones se distinguen a la vista.
 */
import { titulo, ver, oraculo, fin, escenario, sesionSim, tradeSim, perfil, importa, monta, A } from '../lib.mjs'
const Analytics = (await importa('pages/analytics.js')).default
const sA = sesionSim({ id: 's-modelo-a', name: 'Modelo', capital: 10000, created_at: '2026-09-20T00:00:00Z', date_from: '2025-01-06', date_to: '2025-01-10' })
const sB = sesionSim({ id: 's-modelo-b', name: 'Modelo', capital: 20000, created_at: '2026-09-10T00:00:00Z', pair: 'GBP/USD', date_from: '2025-02-03', date_to: '2025-02-07' })
escenario({ sesion: A, perfiles: [perfil(A)], sim_sessions: [sA, sB], sim_trades: [
  tradeSim({ session_id: 's-modelo-a', pnl: 100, result: 'WIN' }),
  tradeSim({ session_id: 's-modelo-b', pnl: -40, result: 'LOSS' }), tradeSim({ session_id: 's-modelo-b', pnl: -10, result: 'LOSS' })] })
// el importe como numero: la pagina escribe los negativos «$-50.00» (formato aparte de C03)
const importe = v => v == null ? NaN : Number(v.replace(/[^0-9.-]/g, ''))
const valorDe = (p, etiqueta) => { const n = p.busca(x => x.tipo && p.texto(x) === etiqueta); return n ? p.texto(n.padre).replace(etiqueta, '').trim() : null }

titulo('1 · elegir la segunda «Modelo»')
const p = monta(Analytics, {}); await p.asienta(100)
const sel = p.busca(x => x.tipo === 'select')
const opciones = p.todos(x => x.tipo === 'option')
ver('control: selector con «All Sessions» y dos opciones de sesion', !!sel && opciones.length === 3, opciones.map(o => p.texto(o)).join(' | '))
ver('control: «All Sessions» suma los 3 trades (+$50.00)', valorDe(p, 'TOTAL TRADES') === '3' && valorDe(p, 'TOTAL P&L') === '+$50.00', `${valorDe(p, 'TOTAL TRADES')} · ${valorDe(p, 'TOTAL P&L')}`)
// la sesion B es la segunda de la lista (sesiones por created_at descendente)
const optB = opciones[2]
const valorB = optB.props.value ?? p.texto(optB)
p.escribe(sel, valorB); await p.asienta(50)
oraculo('C03', 'elegida la segunda «Modelo»: TOTAL P&L −$50.00 con 2 trades', importe(valorDe(p, 'TOTAL P&L')) === -50 && valorDe(p, 'TOTAL TRADES') === '2', `${valorDe(p, 'TOTAL P&L')} con ${valorDe(p, 'TOTAL TRADES')} trades`)
oraculo('C03', 'y su capital: ACCOUNT BALANCE $19950.00', valorDe(p, 'ACCOUNT BALANCE') === '$19950.00', valorDe(p, 'ACCOUNT BALANCE'))
const textos = opciones.slice(1).map(o => p.texto(o))
oraculo('C03', 'las dos opciones se distinguen a la vista', textos[0] !== textos[1], textos.join(' | '))
fin()
