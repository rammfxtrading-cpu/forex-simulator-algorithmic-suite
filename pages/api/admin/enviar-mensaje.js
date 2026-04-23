import { requireAdmin } from '../../../lib/authApi'

/**
 * POST /api/admin/enviar-mensaje
 * Body: { to_user_id: string, subject: string, body: string }
 *
 * Usa la tabla `messages` compartida del ecosistema (del hub).
 * El alumno lo verá en su buzón del hub.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const auth = await requireAdmin(req, res)
  if (!auth) return
  const { user, supabaseAdmin } = auth

  const { to_user_id, subject, body } = req.body || {}

  if (!to_user_id || typeof to_user_id !== 'string') {
    return res.status(400).json({ error: 'to_user_id requerido' })
  }
  if (!subject || typeof subject !== 'string' || !subject.trim()) {
    return res.status(400).json({ error: 'subject requerido' })
  }
  if (!body || typeof body !== 'string' || !body.trim()) {
    return res.status(400).json({ error: 'body requerido' })
  }

  // No dejar que el admin se mande mensajes a sí mismo
  if (to_user_id === user.id) {
    return res.status(400).json({ error: 'No puedes enviarte mensajes a ti mismo' })
  }

  const { data, error } = await supabaseAdmin
    .from('messages')
    .insert({
      to_user_id,
      from_user_id: user.id,
      subject: subject.trim(),
      body: body.trim()
    })
    .select('id, created_at')
    .single()

  if (error) {
    return res.status(500).json({ error: 'Error enviando mensaje', detail: error.message })
  }

  return res.status(200).json({ ok: true, message: data })
}
