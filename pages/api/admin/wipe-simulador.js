import { requireAdmin } from '../../../lib/authApi'

/**
 * POST /api/admin/wipe-simulador
 * Body: { user_id: string, confirm_email: string }
 *
 * Cancelacion DEFINITIVA del simulador de un alumno:
 *  - Borra TODOS sus datos de simulador (5 tablas) por user_id.
 *  - Pone simulador_activo = false en su perfil.
 *  - NO toca el perfil del hub ni el journal.
 *
 * Reglas:
 *  - Solo admin.
 *  - Confirmacion dura: confirm_email debe coincidir con el email del perfil.
 *  - Auto-proteccion: un admin no puede wipearse a si mismo.
 *  - Irreversible. Devuelve conteo de filas borradas por tabla.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const auth = await requireAdmin(req, res)
  if (!auth) return
  const { user, supabaseAdmin } = auth

  const { user_id, confirm_email } = req.body || {}

  if (!user_id || typeof user_id !== 'string') {
    return res.status(400).json({ error: 'user_id requerido' })
  }
  if (!confirm_email || typeof confirm_email !== 'string') {
    return res.status(400).json({ error: 'confirm_email requerido' })
  }

  // Auto-proteccion: el admin no puede borrarse a si mismo
  if (user_id === user.id) {
    return res.status(403).json({
      error: 'El admin no puede borrar sus propios datos del simulador'
    })
  }

  // Cargar el perfil objetivo y verificar la confirmacion dura
  const { data: profile, error: profErr } = await supabaseAdmin
    .from('profiles')
    .select('id, email, simulador_activo')
    .eq('id', user_id)
    .single()

  if (profErr || !profile) {
    return res.status(404).json({ error: 'Usuario no encontrado' })
  }

  if ((profile.email || '').trim().toLowerCase() !== confirm_email.trim().toLowerCase()) {
    return res.status(400).json({
      error: 'La confirmacion no coincide con el email del alumno. Cero filas tocadas.'
    })
  }

  // Borrado explicito de las 5 tablas por user_id.
  // No se confia en CASCADE: session_chart_config no tiene FK.
  // sim_sessions va ULTIMA: su CASCADE arrastra posibles filas hijas
  // con user_id null que el borrado directo por user_id no alcanza.
  const tables = [
    'sim_trades',
    'session_drawings',
    'session_chart_config',
    'sim_drawing_templates',
    'sim_sessions',
  ]

  const deleted = {}
  for (const table of tables) {
    const { data, error } = await supabaseAdmin
      .from(table)
      .delete()
      .eq('user_id', user_id)
      .select('id')

    if (error) {
      return res.status(500).json({
        error: `Error borrando ${table}. Wipe INCOMPLETO.`,
        detail: error.message,
        deleted_so_far: deleted,
      })
    }
    deleted[table] = (data || []).length
  }

  // Quitar el acceso al simulador en el mismo acto (perfil del hub intacto)
  const { error: toggleErr } = await supabaseAdmin
    .from('profiles')
    .update({ simulador_activo: false })
    .eq('id', user_id)

  if (toggleErr) {
    return res.status(500).json({
      error: 'Datos borrados pero fallo al desactivar simulador_activo',
      detail: toggleErr.message,
      deleted,
    })
  }

  console.log('[admin/wipe-simulador] wipe ejecutado', {
    admin_id: user.id,
    target_user_id: user_id,
    target_email: profile.email,
    deleted,
  })

  return res.status(200).json({ ok: true, email: profile.email, deleted })
}
