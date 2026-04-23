import { requireAdmin } from '../../../lib/authApi'

/**
 * POST /api/admin/toggle-acceso-sim
 * Body: { user_id: string, simulador_activo: boolean }
 *
 * Reglas:
 *  - Solo admin.
 *  - Auto-protección: un admin no puede desactivarse a sí mismo.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const auth = await requireAdmin(req, res)
  if (!auth) return
  const { user, supabaseAdmin } = auth

  const { user_id, simulador_activo } = req.body || {}

  if (!user_id || typeof user_id !== 'string') {
    return res.status(400).json({ error: 'user_id requerido' })
  }
  if (typeof simulador_activo !== 'boolean') {
    return res.status(400).json({ error: 'simulador_activo debe ser boolean' })
  }

  // Auto-protección: no permitir que el admin se desactive a sí mismo
  if (user_id === user.id && simulador_activo === false) {
    return res.status(403).json({
      error: 'El admin no puede desactivarse el acceso a sí mismo'
    })
  }

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .update({ simulador_activo })
    .eq('id', user_id)
    .select('id, email, simulador_activo')
    .single()

  if (error) {
    return res.status(500).json({ error: 'Error actualizando', detail: error.message })
  }
  if (!data) {
    return res.status(404).json({ error: 'Usuario no encontrado' })
  }

  return res.status(200).json({ ok: true, profile: data })
}
