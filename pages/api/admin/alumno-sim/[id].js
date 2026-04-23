import { requireAdmin } from '../../../../lib/authApi'

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
    supabaseAdmin
      .from('sim_sessions')
      .select('*')
      .eq('user_id', id)
      .order('created_at', { ascending: false }),
    supabaseAdmin
      .from('sim_trades')
      .select('*')
      .eq('user_id', id)
      .order('opened_at', { ascending: true })
  ])

  if (profErr || !profile) {
    return res.status(404).json({ error: 'Alumno no encontrado' })
  }
  if (sessErr) {
    return res.status(500).json({ error: 'Error cargando sesiones', detail: sessErr.message })
  }
  if (tradeErr) {
    return res.status(500).json({ error: 'Error cargando trades', detail: tradeErr.message })
  }

  return res.status(200).json({
    profile,
    sessions: sessions || [],
    trades: trades || []
  })
}
