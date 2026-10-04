import { metricas, ultimaActividad, activoEnLosUltimos } from '../../../lib/metricas'
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
    .select('id, email, nombre, rol_global, journal_activo, simulador_activo, plan, created_at')
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
      supabaseAdmin.from('sim_sessions').select('id, user_id, capital, created_at').in('user_id', activeIds),
      supabaseAdmin.from('sim_trades').select('id, user_id, result, pnl, rr, closed_at, opened_at, created_at').in('user_id', activeIds)
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

  const usuarios = profiles.map(p => {
    const userSessions = sessionsByUser[p.id] || []
    const userTrades = tradesByUser[p.id] || []
    // Mismas definiciones que el alumno (lib/metricas.js, auditoria C02); la
    // actividad, por la fecha REAL en que se registro (created_at), no por la
    // fecha del mercado que se estaba practicando.
    const m = metricas(userTrades, userSessions)
    const closed = m.cerrados
    const totalPnl = m.totalPnl
    const winRate = m.winRate
    const lastActivity = ultimaActividad(userTrades, userSessions)
    const isActive7d = activoEnLosUltimos(lastActivity, 7)

    return {
      id: p.id,
      email: p.email,
      nombre: p.nombre,
      rol_global: p.rol_global,
      journal_activo: !!p.journal_activo,
      simulador_activo: !!p.simulador_activo,
      plan: p.plan,
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
