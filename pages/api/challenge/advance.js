import { porColumnas } from '../../../lib/paginado'
import { tradesDeSesion } from '../../../lib/tradesEstables'
import { requireSimulador } from '../../../lib/authApi'
import { evaluateChallenge, isChallengeOver } from '../../../lib/challengeEngine'
import { getChallengeConfig } from '../../../lib/challengeRules'
// CTO 6-oct: al cliente un mensaje fijo; en el log, solo clase y codigo
import { registra } from '../../../lib/mercado/errores.mjs'
import { servicioPermite } from '../../../lib/sim/servicioServidor'

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
 *   409 { code: 'saldo_cambiado' } — CAS (CTO 13-oct, sobre o.13.4): el saldo
 *         (o el status) cambió entre la lectura y la escritura (otra pestaña
 *         guardó un cierre). No se escribe nada; el cliente vuelve a pasar
 *         por la barrera de fase y reintenta.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const auth = await requireSimulador(req, res)
  if (!auth) return
  const { user, supabaseAdmin } = auth

  const { session_id, outcome, end_timestamp, open_positions: openPositionsRaw } = req.body || {}
  // B1: el cliente envía las posiciones vivas en el momento del cierre.
  // Servidor las descarta sin persistirlas (doctrina "fase nueva = virgen").
  // No validamos estructura porque NO se persiste — solo se loguea.
  const open_positions = Array.isArray(openPositionsRaw) ? openPositionsRaw : []
  if (!session_id || typeof session_id !== 'string') {
    return res.status(400).json({ error: 'session_id requerido' })
  }
  if (outcome !== 'pass' && outcome !== 'fail') {
    return res.status(400).json({ error: "outcome debe ser 'pass' o 'fail'" })
  }
  // B4: end_timestamp es el momento exacto del cierre del trade que disparó la
  // transición de fase. Lo envía el cliente leyendo getMasterTime() de la API
  // del data layer (lib/sessionData.js, fase 2a). Sin este campo no podemos
  // persistir el last_timestamp correcto en la sesión que se cierra.
  if (!Number.isInteger(end_timestamp) || end_timestamp <= 0) {
    return res.status(400).json({ error: 'end_timestamp requerido (integer > 0)' })
  }
  const maxAllowed = Math.floor(Date.now() / 1000) + 86400
  if (end_timestamp > maxAllowed) {
    return res.status(400).json({ error: 'end_timestamp fuera de rango razonable' })
  }

  // ── 1. Cargar la sesión. balance_texto: el saldo como TEXTO de la base (numeric
  //      exacto), para el CAS del paso 7: el balance de '*' llega como numero JSON y
  //      supabase-js lo pasa a float, que pierde cifras en un numeric largo (409 eterno).
  //      Con '*' vienen tambien rev_saldo (el contador de revision del saldo, que solo
  //      mueve el disparador de sim-004a-preparatoria) y status: TODO lo que el CAS
  //      compara sale de ESTA lectura, que va ANTES de leer el historial (paso 5).
  const { data: session, error: sErr } = await supabaseAdmin
    .from('sim_sessions')
    .select('*, balance_texto:balance::text')
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

  // ── 3b. Orden 1-127 (ii), decision de Ramon: tras el corte, una sesion «Simulador anterior» (legado) es de solo lectura
  //        y NO avanza de fase (ni pass ni fail: no se marca nada ni nace ninguna hija, tampoco v1). Una sesion v1 avanza
  //        por /api/sim/avanzar-fase, nunca por aqui.
  if (session.legado === true) {
    return res.status(409).json({ error: 'Esta sesión es del Simulador anterior: solo lectura.', code: 'solo_lectura' })
  }
  if (session.motor_version === 1) {
    return res.status(409).json({ error: 'Esta sesión avanza de fase por el simulador nuevo.', code: 'usa_avanzar_fase' })
  }

  // ── 4. Idempotencia: si ya está cerrada, no hacer nada. Status NULL = activa, como
  //      en sim_cierre_v0 y en el cliente (o.14.2; Astra E1R2-02).
  if (session.status != null && session.status !== 'active') {
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
  // Todas las operaciones, paginadas y con el total comprobado (C04)
  // Bloque E, punto 3 (Astra BD-04): en UNA sentencia (sql/sim-002).
  const { data: trades, error: tErr } = await tradesDeSesion(supabaseAdmin, session_id, { ordena: porColumnas([['id', 'asc']]) })

  if (tErr) {
    return (registra('challenge/advance', tErr), res.status(503).json({ error: 'No se han podido leer todas las operaciones. Prueba de nuevo.' }))
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
    return (registra('challenge/advance', e), res.status(500).json({ error: 'Error evaluando' }))
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
  // Etapa 1 (o.12): con el simulador en mantenimiento, o sin poder saberlo, no se escribe
  if (!(await servicioPermite(supabaseAdmin, res, 'challenge/advance'))) return

  // CAS (CTO 13-oct, sobre o.13.4 y Astra E1R2-01): la sesion solo se cierra si su
  // contador de revision del saldo sigue siendo el leido en el paso 1 (y su saldo, como
  // texto, y sigue activa: NULL o 'active'). Si otra pestaña guardo un cierre entre la
  // lectura y aqui, el contador ya no casa, AUNQUE el saldo haya vuelto al mismo numero
  // (−x y +x): el UPDATE no afecta a 1 fila → 409 y nada escrito; el cliente reevalua.
  // Sin el contador en la lectura (la preparatoria no esta aplicada) no se escribe: 503.
  if (session.rev_saldo == null) {
    registra('challenge/advance', new Error('sim_sessions.rev_saldo no esta: falta sim-004a-preparatoria'))
    return res.status(503).json({ error: 'No se puede comprobar el saldo de la sesión. Prueba de nuevo más tarde.' })
  }
  const cierraConCAS = async (cambios) => {
    const { data, error } = await supabaseAdmin
      .from('sim_sessions')
      .update(cambios)
      .eq('id', session_id)
      .eq('rev_saldo', session.rev_saldo)
      .eq('balance', session.balance_texto)
      .or('status.is.null,status.eq.active')
      .select('*')
    if (error) return { error }
    if (!Array.isArray(data) || data.length !== 1) return { cambiado: true }
    return { data: data[0] }
  }
  const SALDO_CAMBIADO = { error: 'El saldo cambió, vuelve a intentarlo', code: 'saldo_cambiado' }

  // ─ FAIL ─
  if (outcome === 'fail') {
    const newStatus = evaluation.status // 'failed_dd_daily' | 'failed_dd_total'
    const { data: updated, error: uErr, cambiado } = await cierraConCAS({
      status: newStatus,
      balance: evaluation.balanceNow,
      last_timestamp: end_timestamp,   // B4: persistir endTime real del cierre
    })

    if (uErr) {
      return (registra('challenge/advance', uErr), res.status(500).json({ error: 'Error cerrando sesión' }))
    }
    if (cambiado) return res.status(409).json(SALDO_CAMBIADO)

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
    const { data: updated, error: uErr, cambiado } = await cierraConCAS({
      status: 'passed_all',
      balance: evaluation.balanceNow,
      last_timestamp: end_timestamp,   // B4: persistir endTime real del cierre
    })

    if (uErr) {
      return (registra('challenge/advance', uErr), res.status(500).json({ error: 'Error cerrando challenge' }))
    }
    if (cambiado) return res.status(409).json(SALDO_CAMBIADO)

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

  // B1: loggear flotantes descartados antes de cerrar la fase. NO se persisten
  // en sim_trades ni se contabilizan en balance. La hija nace virgen.
  if (open_positions.length > 0) {
    // S05 (auditoria 4-oct-2026): solo el evento y cuantas; ni las posiciones
    // (operativa del alumno) ni su usuario: la sesion ya basta para correlacionar.
    console.log('[challenge/advance] descarte de flotantes en passed_phase', {
      session_id,
      discarded_positions: open_positions.length,
    })
  }
  const { data: closed, error: uErr, cambiado } = await cierraConCAS({
    status: 'passed_phase',
    balance: evaluation.balanceNow,
    last_timestamp: end_timestamp,   // B4: persistir endTime real del cierre
  })

  if (uErr) {
    return (registra('challenge/advance', uErr), res.status(500).json({ error: 'Error cerrando fase' }))
  }
  if (cambiado) return res.status(409).json(SALDO_CAMBIADO)

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
    // FTMO-real: el replay NO retrocede. Arranca donde el alumno cerró la fase anterior.
    // En FTMO real, las credenciales de Fase 2 te llegan el día siguiente al pass de Fase 1;
    // el mercado sigue donde lo dejaste. El capital sí se resetea (cuenta nueva), pero
    // el tiempo del mundo no retrocede al 1 de abril.
    // B4: usar end_timestamp (cliente) en lugar de session.last_timestamp (stale en BD).
    // Garantiza que la hija nace con el cursor en el momento exacto del cierre, sin
    // depender del timing del último PATCH asíncrono del cliente.
    last_timestamp: end_timestamp,
  }

  const { data: nextSession, error: iErr } = await supabaseAdmin
    .from('sim_sessions')
    .insert(nextPayload)
    .select('*')
    .single()

  if (iErr) {
    registra('challenge/advance', iErr)
    // Revertir: volver al status que tenia la fase que acabamos de cerrar (active o NULL).
    await supabaseAdmin
      .from('sim_sessions')
      .update({ status: session.status ?? null })
      .eq('id', session_id)

    return res.status(500).json({
      error: 'Error creando siguiente fase (se ha revertido el cierre de la actual)',
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
