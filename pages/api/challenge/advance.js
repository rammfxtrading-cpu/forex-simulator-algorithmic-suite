import { requireUser } from '../../../lib/authApi'
import { evaluateChallenge, isChallengeOver } from '../../../lib/challengeEngine'
import { getChallengeConfig } from '../../../lib/challengeRules'

/**
 * POST /api/challenge/advance
 *
 * Transición de estado de un challenge. Se usa en 2 escenarios:
 *
 *  (A) El alumno alcanzó el profit target y pulsa "Submit Phase".
 *      El servidor re-evalúa con el motor y si efectivamente está en
 *      target_reached:
 *        - Si era la última fase → marca la sesión como 'passed_all' y
 *          NO crea sesión nueva. Challenge completado.
 *        - Si no era la última → marca la sesión como 'passed_phase' y
 *          crea una nueva sim_session para la siguiente fase, encadenada
 *          con challenge_parent_id. Devuelve el id de la nueva sesión.
 *
 *  (B) El cliente detecta que el motor devolvió failed_dd_daily o
 *      failed_dd_total al cerrar un trade. Llama a este endpoint con
 *      outcome='fail' para persistir el estado. El servidor re-evalúa
 *      para confirmar y marca la sesión como 'failed_dd_daily' o
 *      'failed_dd_total'. No crea sesión nueva.
 *
 * Body:
 *   {
 *     session_id: string (uuid),
 *     outcome: 'pass' | 'fail'
 *   }
 *
 * Respuesta 200 (pass, no última fase):
 *   { ok: true, action: 'phase_passed', session: {...actualizada},
 *     next_session: {...nueva fila} }
 *
 * Respuesta 200 (pass, última fase):
 *   { ok: true, action: 'challenge_completed', session: {...actualizada},
 *     next_session: null }
 *
 * Respuesta 200 (fail):
 *   { ok: true, action: 'challenge_failed', reason: 'dd_daily' | 'dd_total',
 *     session: {...actualizada}, next_session: null }
 *
 * Errores comunes:
 *   400 — body inválido, sesión no es challenge, outcome incompatible con
 *         el estado real (ej: pides 'pass' pero no llegaste al target).
 *   403 — no eres el dueño.
 *   404 — sesión no encontrada.
 *   409 — la sesión ya está cerrada (status != 'active'). Idempotencia:
 *         no reabrir ni re-avanzar.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const auth = await requireUser(req, res)
  if (!auth) return
  const { user, supabaseAdmin } = auth

  const { session_id, outcome } = req.body || {}
  if (!session_id || typeof session_id !== 'string') {
    return res.status(400).json({ error: 'session_id requerido' })
  }
  if (outcome !== 'pass' && outcome !== 'fail') {
    return res.status(400).json({ error: "outcome debe ser 'pass' o 'fail'" })
  }

  // ── 1. Cargar la sesión
  const { data: session, error: sErr } = await supabaseAdmin
    .from('sim_sessions')
    .select('*')
    .eq('id', session_id)
    .single()

  if (sErr || !session) {
    return res.status(404).json({ error: 'Sesión no encontrada' })
  }

  // ── 2. Ownership — solo el dueño puede avanzar su propio challenge.
  //      Admin NO puede avanzar challenges de otros (no tiene sentido).
  if (session.user_id !== user.id) {
    return res.status(403).json({ error: 'No autorizado' })
  }

  // ── 3. Verificar que es challenge
  if (!session.challenge_type) {
    return res.status(400).json({ error: 'La sesión no es un challenge' })
  }

  // ── 4. Idempotencia: si ya está cerrada, no hacer nada.
  if (session.status !== 'active') {
    return res.status(409).json({
      error: 'La sesión ya está cerrada',
      currentStatus: session.status
    })
  }

  const config = getChallengeConfig(session.challenge_type)
  if (!config) {
    return res.status(500).json({
      error: `challenge_type inválido en BD: ${session.challenge_type}`
    })
  }

  // ── 5. Re-evaluar con el motor para validar que el outcome que pide el
  //      cliente coincide con el estado real.
  const { data: trades, error: tErr } = await supabaseAdmin
    .from('sim_trades')
    .select('id, pnl, result, closed_at')
    .eq('session_id', session_id)

  if (tErr) {
    return res.status(500).json({ error: 'Error cargando trades', detail: tErr.message })
  }

  let evaluation
  try {
    evaluation = evaluateChallenge({
      challengeType: session.challenge_type,
      currentPhase: session.challenge_phase || 1,
      capital: Number(session.capital),
      trades: trades || [],
    })
  } catch (e) {
    return res.status(500).json({ error: 'Error evaluando', detail: e.message })
  }

  // ── 6. Validar coherencia cliente ↔ servidor
  if (outcome === 'pass' && evaluation.status !== 'target_reached') {
    return res.status(400).json({
      error: 'Aún no has alcanzado el profit target de esta fase',
      evaluation,
    })
  }
  if (outcome === 'fail' &&
      evaluation.status !== 'failed_dd_daily' &&
      evaluation.status !== 'failed_dd_total') {
    return res.status(400).json({
      error: 'La sesión no está quemada según el motor',
      evaluation,
    })
  }

  // ── 7. Aplicar cambios según outcome

  // ─ FAIL ─
  if (outcome === 'fail') {
    const newStatus = evaluation.status // 'failed_dd_daily' | 'failed_dd_total'
    const { data: updated, error: uErr } = await supabaseAdmin
      .from('sim_sessions')
      .update({
        status: newStatus,
        balance: evaluation.balanceNow,
      })
      .eq('id', session_id)
      .select('*')
      .single()

    if (uErr) {
      return res.status(500).json({ error: 'Error cerrando sesión', detail: uErr.message })
    }

    return res.status(200).json({
      ok: true,
      action: 'challenge_failed',
      reason: evaluation.failureReason, // 'dd_daily' | 'dd_total'
      session: updated,
      next_session: null,
    })
  }

  // ─ PASS ─
  const currentPhase = session.challenge_phase || 1
  const isLastPhase = currentPhase >= config.phases

  if (isLastPhase) {
    // Challenge completo — marcar passed_all y parar.
    const { data: updated, error: uErr } = await supabaseAdmin
      .from('sim_sessions')
      .update({
        status: 'passed_all',
        balance: evaluation.balanceNow,
      })
      .eq('id', session_id)
      .select('*')
      .single()

    if (uErr) {
      return res.status(500).json({ error: 'Error cerrando challenge', detail: uErr.message })
    }

    return res.status(200).json({
      ok: true,
      action: 'challenge_completed',
      session: updated,
      next_session: null,
    })
  }

  // ── Pass parcial: cerrar fase actual y crear la siguiente.
  //     Transacción manual: marcamos la actual y luego insertamos la siguiente.
  //     Si el insert falla, revertimos el update (best-effort).
  const { data: closed, error: uErr } = await supabaseAdmin
    .from('sim_sessions')
    .update({
      status: 'passed_phase',
      balance: evaluation.balanceNow,
    })
    .eq('id', session_id)
    .select('*')
    .single()

  if (uErr) {
    return res.status(500).json({ error: 'Error cerrando fase', detail: uErr.message })
  }

  const nextPhase = currentPhase + 1
  const nextName = `${stripPhaseSuffix(session.name)} · Fase ${nextPhase}`
  const nextPayload = {
    user_id: user.id,
    name: nextName,
    pair: session.pair,
    timeframe: session.timeframe,
    date_from: session.date_from,
    date_to: session.date_to,
    capital: Number(session.capital),   // Mismo capital inicial que la fase 1
    balance: Number(session.capital),   // Empieza fresco en la fase siguiente
    status: 'active',
    challenge_type: session.challenge_type,
    challenge_phase: nextPhase,
    challenge_parent_id: session.id,    // Encadenar con la fase anterior
  }

  const { data: nextSession, error: iErr } = await supabaseAdmin
    .from('sim_sessions')
    .insert(nextPayload)
    .select('*')
    .single()

  if (iErr) {
    // Revertir: volver a active la fase que acabamos de cerrar.
    await supabaseAdmin
      .from('sim_sessions')
      .update({ status: 'active' })
      .eq('id', session_id)

    return res.status(500).json({
      error: 'Error creando siguiente fase (se ha revertido el cierre de la actual)',
      detail: iErr.message,
    })
  }

  return res.status(200).json({
    ok: true,
    action: 'phase_passed',
    session: closed,
    next_session: nextSession,
  })
}

/**
 * Si el nombre de la sesión termina en " · Fase N", lo quita para poder
 * construir el nombre de la siguiente fase sin acumular sufijos.
 */
function stripPhaseSuffix(name) {
  if (!name) return 'Challenge'
  return String(name).replace(/\s·\sFase\s\d+\s*$/u, '').trim()
}
