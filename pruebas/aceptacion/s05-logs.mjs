/**
 * S05 · LOS LOGS GUARDAN OPERATIVA, IDENTIDAD Y UN PREFIJO DE LA CLAVE
 *
 * Astra (4-oct): advance registra el array completo de posiciones abiertas
 * ligado a usuario y sesion (pages/api/challenge/advance.js:224); el wipe
 * registra el email (pages/api/admin/wipe-simulador.js:104); el diagnostico
 * opcional del actualizador imprime los 10 primeros caracteres de la clave de
 * servicio (scripts/actualizar-diario.js:25).
 * Decision del CTO (4-oct, bloque A): logs sin posiciones, email ni prefijos
 * de credencial.
 *
 * Se ejecutan los tres de verdad (handlers REALES, script REAL con
 * pruebas/script-falso.mjs) y se captura TODO lo que imprimen.
 *
 * ORACULOS: en lo impreso no aparece ningun dato de las posiciones (precio de
 * entrada, lotes, id de posicion), ni el email del alumno, ni ningun trozo de
 * la clave (ni sus 6 primeros caracteres). Controles: cada camino imprime
 * algo (el log sigue existiendo: no se arregla callando).
 */
import { titulo, ver, oraculo, fin, escenario, sesionSim, tradeSim, perfil, importa, db, A, B, ADM, tok } from '../lib.mjs'
import { llama } from '../supabase-falso.mjs'
import { correScript, ejecucionesScripts } from '../script-falso.mjs'
const advance = (await importa('pages/api/challenge/advance.js')).default
const wipe = (await importa('pages/api/admin/wipe-simulador.js')).default
const capturado = []
for (const k of ['log', 'error', 'warn', 'info']) { const o = console[k]; console[k] = (...a) => { capturado.push(a.map(x => typeof x === 'string' ? x : JSON.stringify(x)).join(' ')); o(...a) } }
const impreso = () => capturado.join('\n')

titulo('1 · advance con posiciones abiertas')
escenario({ sim_sessions: [sesionSim({ id: 'reto-s05', challenge_type: '2F', challenge_phase: 1, capital: 100000, balance: 110000 })],
  sim_trades: [tradeSim({ session_id: 'reto-s05', pnl: 10000, result: 'WIN', closed_at: '2025-03-04T12:00:00Z' })] })
capturado.length = 0
const POS = [{ position_id: 'pos-SECRETA-77', pair: 'GBP/USD', side: 'SELL', entry_price: 1.23457, lots: 3.21, opened_at: '2025-03-04T10:00:00.000Z' }]
const r = await llama(advance, { method: 'POST', token: tok(A), body: { session_id: 'reto-s05', outcome: 'pass', end_timestamp: 1741100000, open_positions: POS } })
ver('control: paso de fase (200 phase_passed) e imprimio algo', r.estado === 200 && r.cuerpo.action === 'phase_passed' && capturado.length > 0, `${r.estado} · ${capturado.length} lineas`)
const fuga = ['pos-SECRETA-77', '1.23457', '3.21', 'entry_price'].filter(x => impreso().includes(x))
oraculo('S05', 'advance: ningun dato de las posiciones en el log', fuga.length === 0, fuga.length ? `aparecen: ${fuga.join(', ')}` : '')

titulo('2 · wipe correcto')
escenario({ sesion: ADM, perfiles: [perfil(A, { email: 'alumna.privada@ejemplo.test' }), perfil(B), perfil(ADM, { rol_global: 'admin' })], sim_sessions: [sesionSim({ id: 'sw' })] })
capturado.length = 0
const w = await llama(wipe, { method: 'POST', token: tok(ADM), body: { user_id: A, confirm_email: 'alumna.privada@ejemplo.test' } })
ver('control: wipe 200 e imprimio algo', w.estado === 200 && capturado.length > 0, `${w.estado} · ${capturado.length} lineas`)
oraculo('S05', 'wipe: el email del alumno no sale en el log', !impreso().includes('alumna.privada'), impreso().includes('alumna.privada') ? 'aparece el email' : '')

titulo('3 · actualizar-diario con DIAG_CREDS=1')
escenario()
const CLAVE = 'zzfalsa_Q7w9ClaveDePruebaNoReal_0123456789'
const d = await correScript('scripts/actualizar-diario.js', { ahora: '2026-10-02T06:00:00Z',
  env: { NEXT_PUBLIC_SUPABASE_URL: 'https://falso.supabase.co', SUPABASE_SERVICE_ROLE_KEY: CLAVE + '\n', DIAG_CREDS: '1' } })
const diag = d.salida.filter(l => /\[DIAG\]/.test(l))
ver('control: el diagnostico se imprimio (sigue diciendo largos y espacios sobrantes)', diag.length >= 2 && diag.some(l => /largo/.test(l)), diag.join(' | '))
const trozos = [CLAVE.slice(0, 6), CLAVE.slice(6, 12), CLAVE.slice(-6)].filter(x => d.salida.join('\n').includes(x))
oraculo('S05', 'actualizar-diario: ningun trozo de la clave en la salida', trozos.length === 0, trozos.length ? `aparece «${trozos[0]}…»` : '')
ver('control (H06): todos los scripts terminaron (veredicto o exit), ninguno por timeout', ejecucionesScripts.length > 0 && ejecucionesScripts.every(e => e.terminoPor !== 'timeout'), JSON.stringify(ejecucionesScripts.map(e => e.terminoPor + ':' + e.codigo)))
fin()
