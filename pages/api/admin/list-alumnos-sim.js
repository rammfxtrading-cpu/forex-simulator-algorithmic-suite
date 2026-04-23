import { requireAdmin } from '../../../lib/authApi'

/**
 * GET /api/admin/list-alumnos-sim
 * Devuelve todos los usuarios del sistema con:
 *  - datos del perfil
 *  - métricas agregadas del simulador (si tienen trades)
 * La división "con acceso / sin acceso" la hace el frontend según `simulador_activo`.
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const auth = await requireAdmin(req, res)
  if (!auth) return
  const { supabaseAdmin } = auth

  // 1) Traer todos los perfiles
  const { data: profiles, error: profErr } = await supabaseAdmin
    .from('profiles')
    .select('id, email, nombre, rol_global, journal_activo, simulador_activo, created_at')
    .order('created_at', { ascending: false })

  if (profErr) {
    return res.status(500).json({ error: 'Error cargando perfiles', detail: profErr.message })
  }

  // 2) Traer sesiones y trades (solo de alumnos con simulador_activo para no cargar de más)
  const activeIds = profiles.filter(p => p.simulador_activo).map(p => p.id)

  let sessionsByUser = {}
  let tradesByUser = {}

  if (activeIds.length > 0) {
    const [{ data: sessions }, { data: trades }] = await Promise.all([
      supabaseAdmin.from('sim_sessions').select('id, user_id, capital').in('user_id', activeIds),
      supabaseAdmin.from('sim_trades').select('user_id, result, pnl, closed_at, opened_at').in('user_id', activeIds)
    ])

    for (const s of sessions || []) {
      if (!sessionsByUser[s.user_id]) sessionsByUser[s.user_id] = []
      sessionsByUser[s.user_id].push(s)
    }
    for (const t of trades || []) {
      if (!tradesByUser[t.user_id]) tradesByUser[t.user_id] = []
      tradesByUser[t.user_id].push(t)
    }
  }

  // 3) Calcular métricas por usuario
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

  const usuarios = profiles.map(p => {
    const userSessions = sessionsByUser[p.id] || []
    const userTrades = tradesByUser[p.id] || []
    const closed = userTrades.filter(t => t.result && t.result !== 'OPEN')
    const wins = closed.filter(t => t.result === 'WIN')
    const totalPnl = closed.reduce((sum, t) => sum + (parseFloat(t.pnl) || 0), 0)
    const winRate = closed.length > 0 ? (wins.length / closed.length) * 100 : 0

    // Última actividad: último opened_at o closed_at
    let lastActivity = null
    for (const t of userTrades) {
      const d = t.closed_at || t.opened_at
      if (d && (!lastActivity || d > lastActivity)) lastActivity = d
    }
    const isActive7d = lastActivity && new Date(lastActivity) > sevenDaysAgo

    return {
      id: p.id,
      email: p.email,
      nombre: p.nombre,
      rol_global: p.rol_global,
      journal_activo: !!p.journal_activo,
      simulador_activo: !!p.simulador_activo,
      created_at: p.created_at,
      metrics: {
        sessions: userSessions.length,
        trades: closed.length,
        win_rate: winRate,
        total_pnl: totalPnl,
        last_activity: lastActivity,
        active_7d: !!isActive7d
      }
    }
  })

  // 4) Agregados globales
  const conAcceso = usuarios.filter(u => u.simulador_activo)
  const aggregates = {
    con_acceso: conAcceso.length,
    total_usuarios: usuarios.length,
    total_sessions: conAcceso.reduce((s, u) => s + u.metrics.sessions, 0),
    total_trades: conAcceso.reduce((s, u) => s + u.metrics.trades, 0),
    activos_7d: conAcceso.filter(u => u.metrics.active_7d).length
  }

  return res.status(200).json({ usuarios, aggregates })
}
