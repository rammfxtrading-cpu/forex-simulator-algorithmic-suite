import { requireAdmin } from '../../../lib/authApi'

/**
 * POST /api/admin/wipe-simulador
 * Body: { user_id: string, confirm_email: string }
 *
 * Cancelacion DEFINITIVA del simulador de un alumno:
 *  - Pone simulador_activo = false en su perfil (PRIMERO).
 *  - Borra TODOS sus datos de simulador (7 tablas) por user_id.
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

  // Auditoria D06 (4-oct-2026). Antes: se revocaba el acceso AL FINAL, y si un
  // borrado fallaba a mitad el libro ya estaba perdido con el acceso activo; y
  // la lista omitia user_chart_config y user_tool_config.
  // Ahora: 1) se REVOCA PRIMERO (si falla, no se borra nada); 2) se borran las
  // 7 tablas del simulador, comprobando cada error; si una falla, el alumno ya
  // no tiene acceso y repetir el wipe termina el trabajo (los deletes son
  // idempotentes). sim_sessions va ULTIMA: su CASCADE arrastra sim_trades,
  // session_drawings y (desde sim-001b) session_chart_config.
  const { error: toggleErr } = await supabaseAdmin
    .from('profiles')
    .update({ simulador_activo: false })
    .eq('id', user_id)

  if (toggleErr) {
    return res.status(500).json({
      error: 'No se ha podido quitar el acceso al simulador. No se ha borrado nada.',
      detail: toggleErr.message,
    })
  }

  const tables = [
    'sim_trades',
    'session_drawings',
    'session_chart_config',
    'sim_drawing_templates',
    'user_chart_config',
    'user_tool_config',
    'sim_sessions',
  ]

  const deleted = {}
  for (const table of tables) {
    const { data, error } = await supabaseAdmin
      .from(table)
      .delete()
      .eq('user_id', user_id)
      .select('user_id')

    if (error) {
      return res.status(500).json({
        error: `Error borrando ${table}. Wipe INCOMPLETO: el acceso ya esta quitado; vuelve a lanzar el wipe para terminarlo.`,
        detail: error.message,
        deleted_so_far: deleted,
      })
    }
    deleted[table] = (data || []).length
  }

  console.log('[admin/wipe-simulador] wipe ejecutado', {
    admin_id: user.id,
    target_user_id: user_id,   // S05 (auditoria 4-oct-2026): sin email en el log
    deleted,
  })

  return res.status(200).json({ ok: true, email: profile.email, deleted })
}
