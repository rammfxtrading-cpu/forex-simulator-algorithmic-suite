import { requireAdmin } from '../../../lib/authApi'
// CTO 6-oct: al cliente un mensaje fijo; en el log, solo clase y codigo
import { registra } from '../../../lib/mercado/errores.mjs'
// POST /api/admin/set-plan-sim  Body: { user_id, plan:'basic'|'extra' }  Solo admin; no toca simulador_activo.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const auth = await requireAdmin(req, res)
  if (!auth) return
  const { supabaseAdmin } = auth
  const { user_id, plan } = req.body || {}
  if (!user_id || typeof user_id !== 'string') return res.status(400).json({ error: 'user_id requerido' })
  if (plan !== 'basic' && plan !== 'extra') return res.status(400).json({ error: "plan debe ser basic o extra" })
  const { data, error } = await supabaseAdmin.from('profiles').update({ plan }).eq('id', user_id).select('id, email, plan').single()
  if (error) return (registra('admin/set-plan-sim', error), res.status(500).json({ error: 'Error actualizando' }))
  if (!data) return res.status(404).json({ error: 'Usuario no encontrado' })
  return res.status(200).json({ ok: true, profile: data })
}
