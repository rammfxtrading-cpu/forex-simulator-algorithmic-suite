import { leerTodo, porColumnas } from '../../../../lib/paginado'
import { tradesDeUsuario } from '../../../../lib/tradesEstables'
import { requireAdmin } from '../../../../lib/authApi'
// CTO 6-oct: al cliente un mensaje fijo; en el log, solo clase y codigo
import { registra } from '../../../../lib/mercado/errores.mjs'

/**
 * GET /api/admin/alumno-sim/[id]
 * Devuelve el detalle de un alumno:
 *  - perfil
 *  - sesiones del simulador
 *  - trades del simulador (todos los campos que usa /analytics)
 * El frontend calcula las métricas agregadas exactamente como en /analytics.
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const auth = await requireAdmin(req, res)
  if (!auth) return
  const { supabaseAdmin } = auth

  const { id } = req.query
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'id requerido' })
  }

  const [
    { data: profile, error: profErr },
    { data: sessions, error: sessErr },
    { data: trades, error: tradeErr }
  ] = await Promise.all([
    supabaseAdmin
      .from('profiles')
      .select('id, email, nombre, rol_global, journal_activo, simulador_activo, created_at')
      .eq('id', id)
      .single(),
    // paginadas y con el total comprobado (C04)
    // bloque D, punto 5: por clave (created_at, id); el orden de siempre, despues
    leerTodo(() => supabaseAdmin
      .from('sim_sessions')
      .select('*', { count: 'exact' })
      .eq('user_id', id), { ordena: porColumnas([['created_at', 'desc'], ['id', 'asc']]) }),
    // bloque E, punto 3: los trades en UNA sentencia (sql/sim-002)
    tradesDeUsuario(supabaseAdmin, id, { ordena: porColumnas([['opened_at', 'asc'], ['id', 'asc']]) })
  ])

  if (profErr || !profile) {
    return res.status(404).json({ error: 'Alumno no encontrado' })
  }
  if (sessErr) {
    return (registra('admin/alumno-sim', sessErr), res.status(500).json({ error: 'Error cargando sesiones' }))
  }
  if (tradeErr) {
    return (registra('admin/alumno-sim', tradeErr), res.status(500).json({ error: 'Error cargando trades' }))
  }

  return res.status(200).json({
    profile,
    sessions: sessions || [],
    trades: trades || []
  })
}
