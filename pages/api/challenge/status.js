import { requireUser } from '../../../lib/authApi'
import { evaluateChallenge } from '../../../lib/challengeEngine'
import { getChallengeConfig } from '../../../lib/challengeRules'

/**
 * GET /api/challenge/status?session_id=<uuid>
 *
 * Evalúa el estado en tiempo real de un challenge.
 * Se puede llamar tantas veces como haga falta (el motor es puro, solo lee).
 *
 * Respuesta 200:
 *   {
 *     ok: true,
 *     session: { id, user_id, challenge_type, challenge_phase, capital, status, ...},
 *     config:  { code, name, phases, targets_pct, dd_daily_pct, dd_total_pct },
 *     evaluation: {
 *       status, balanceNow, pnlTotal, pnlPct,
 *       targetUSD, targetPct, targetRemainingUSD,
 *       ddDailyWorstUSD, ddDailyWorstPct, ddDailyCapUSD, ddDailyCapPct,
 *       ddTotalWorstUSD, ddTotalWorstPct, ddTotalCapUSD, ddTotalCapPct,
 *       failureReason
 *     },
 *     trades_count: number
 *   }
 *
 * Reglas:
 *  - Solo el dueño de la sesión (user_id === session.user_id) o admin.
 *  - Devuelve 404 si la sesión no existe.
 *  - Devuelve 400 si la sesión NO es un challenge (challenge_type = null).
 *  - El status persistido en BD (session.status) NO se modifica aquí — este endpoint
 *    es solo de lectura. Si detecta failure, quien llama es responsable de
 *    persistirlo vía PATCH o llamando a otro endpoint (next steps).
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const auth = await requireUser(req, res)
  if (!auth) return
  const { user, supabaseAdmin } = auth

  const sessionId = req.query.session_id
  if (!sessionId || typeof sessionId !== 'string') {
    return res.status(400).json({ error: 'session_id requerido' })
  }

  // ── 1. Cargar la sesión
  const { data: session, error: sErr } = await supabaseAdmin
    .from('sim_sessions')
    .select('*')
    .eq('id', sessionId)
    .single()

  if (sErr || !session) {
    return res.status(404).json({ error: 'Sesión no encontrada' })
  }

  // ── 2. Verificar ownership. El dueño puede leer su sesión. El admin puede leer cualquiera.
  //      Para saber si es admin consultamos profiles.
  if (session.user_id !== user.id) {
    const { data: prof } = await supabaseAdmin
      .from('profiles')
      .select('rol_global')
      .eq('id', user.id)
      .single()
    if (!prof || prof.rol_global !== 'admin') {
      return res.status(403).json({ error: 'No autorizado' })
    }
  }

  // ── 3. Verificar que es un challenge
  if (!session.challenge_type) {
    return res.status(400).json({ error: 'La sesión no es un challenge' })
  }

  const config = getChallengeConfig(session.challenge_type)
  if (!config) {
    return res.status(500).json({
      error: `challenge_type inválido en BD: ${session.challenge_type}`
    })
  }

  // ── 4. Cargar los trades de esta sesión
  const { data: trades, error: tErr } = await supabaseAdmin
    .from('sim_trades')
    .select('id, pnl, result, closed_at, opened_at')
    .eq('session_id', sessionId)

  if (tErr) {
    return res.status(500).json({ error: 'Error cargando trades', detail: tErr.message })
  }

  // ── 5. Evaluar con el motor puro
  let evaluation
  try {
    evaluation = evaluateChallenge({
      challengeType: session.challenge_type,
      currentPhase: session.challenge_phase || 1,
      capital: Number(session.capital),
      trades: trades || [],
    })
  } catch (e) {
    return res.status(500).json({ error: 'Error evaluando challenge', detail: e.message })
  }

  // ── 6. Respuesta
  return res.status(200).json({
    ok: true,
    session: {
      id: session.id,
      user_id: session.user_id,
      name: session.name,
      pair: session.pair,
      timeframe: session.timeframe,
      capital: Number(session.capital),
      balance: Number(session.balance),
      status: session.status,
      challenge_type: session.challenge_type,
      challenge_phase: session.challenge_phase,
      challenge_parent_id: session.challenge_parent_id,
      date_from: session.date_from,
      date_to: session.date_to,
      created_at: session.created_at,
    },
    config: {
      code: config.code,
      name: config.name,
      phases: config.phases,
      targets_pct: config.targets_pct,
      dd_daily_pct: config.dd_daily_pct,
      dd_total_pct: config.dd_total_pct,
    },
    evaluation,
    trades_count: (trades || []).length,
  })
}
