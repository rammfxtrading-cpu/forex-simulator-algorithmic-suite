/**
 * D07 · AVANZAR DE FASE ES UNA TRANSACCION A MANO QUE PUEDE DEJAR UN ESTADO IMPOSIBLE
 *
 * Astra (4-oct): /api/challenge/advance marca la fase «passed_phase»
 * (pages/api/challenge/advance.js:231), inserta la siguiente (:271) y, si el
 * insert falla, intenta volver a «active» sin mirar si lo consigue (:277-288).
 * A: insert y rollback fallan → responde «se ha revertido» y queda una fase
 * pasada sin hija. B: el insert entra pero su respuesta se pierde → el rollback
 * reactiva el padre aunque la hija existe.
 *
 * Se ejecuta: el handler REAL con la base falsa (fallos y respuestas perdidas
 * programados). La base falsa no tiene las constraints reales (S04): eso NO
 * cambia estas dos rutas, que no dependen de una unicidad.
 *
 * ORACULOS: tras cualquier respuesta, (1) nunca hay una fase «passed_phase»
 * sin hija ni una «active» con hija; (2) si la respuesta dice «se ha
 * revertido», el padre esta «active».
 */
import { titulo, ver, oraculo, fin, escenario, sesionSim, tradeSim, db, A } from '../lib.mjs'
import { llama } from '../supabase-falso.mjs'
import { importa, tok } from '../lib.mjs'
const advance = (await importa('pages/api/challenge/advance.js')).default
const PADRE = 'padre-1'
function montaje() {
  escenario({ sim_sessions: [sesionSim({ id: PADRE, challenge_type: '2F', challenge_phase: 1, capital: 100000, balance: 110000 })],
    sim_trades: [tradeSim({ session_id: PADRE, pnl: 10000, result: 'WIN', closed_at: '2025-03-04T12:00:00Z' })] })
}
const pasa = () => llama(advance, { method: 'POST', token: tok(A), body: { session_id: PADRE, outcome: 'pass', end_timestamp: 1741100000 } })
const estado = () => {
  const padre = db.tablas.sim_sessions.find(s => s.id === PADRE)
  const hijas = db.tablas.sim_sessions.filter(s => s.challenge_parent_id === PADRE)
  return { padre: padre.status, hijas: hijas.length }
}
const posible = e => (e.padre === 'passed_phase' && e.hijas === 1) || (e.padre === 'active' && e.hijas === 0)

titulo('0 · control: el camino normal')
montaje()
const ok = await pasa()
ver('phase_passed, padre passed_phase y una hija en fase 2', ok.estado === 200 && ok.cuerpo.action === 'phase_passed' && estado().padre === 'passed_phase' && estado().hijas === 1, JSON.stringify(estado()))

titulo('A · el insert de la hija falla y el rollback tambien')
montaje()
let updates = 0
db.falla = c => c.tabla === 'sim_sessions' && c.op === 'insert' ? { message: 'connection reset', code: '08006' }
  : c.tabla === 'sim_sessions' && c.op === 'update' && ++updates === 2 ? { message: 'connection reset', code: '08006' } : null
const a = await pasa()
const ea = estado()
ver('control: respondio 500 y hubo dos updates (cierre y rollback)', a.estado === 500 && updates === 2, `${a.estado} · ${a.cuerpo?.error}`)
oraculo('D07', 'A: el estado queda posible (no hay fase pasada sin hija)', posible(ea), JSON.stringify(ea))
oraculo('D07', 'A: si dice «se ha revertido», el padre esta active', !/revertido/.test(a.cuerpo?.error ?? '') || ea.padre === 'active', `dice «${a.cuerpo?.error}» con el padre en ${ea.padre}`)

titulo('B · el insert de la hija entra pero su respuesta se pierde')
montaje()
db.pierde = c => c.tabla === 'sim_sessions' && c.op === 'insert'
const b = await pasa()
const eb = estado()
ver('control: el insert se ejecuto (la hija esta en la base)', eb.hijas === 1)
oraculo('D07', 'B: el estado queda posible (no hay padre active con hija)', posible(eb), `${JSON.stringify(eb)} · respuesta ${b.estado}: ${b.cuerpo?.error ?? b.cuerpo?.action}`)
fin()
