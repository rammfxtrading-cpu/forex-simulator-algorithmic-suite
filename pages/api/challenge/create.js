import { requireUser } from '../../../lib/authApi'
import { getChallengeConfig } from '../../../lib/challengeRules'

/**
 * POST /api/challenge/create
 *
 * Crea una nueva sesión de simulador en modo challenge (fase 1).
 *
 * Body:
 *   {
 *     challenge_type: '1F' | '2F' | '3F',   // requerido
 *     capital:        10000 | 25000 | 50000 | 100000 | 200000,  // requerido
 *     pair:           'EURUSD' | ...        // requerido (símbolo)
 *     timeframe:      'M1' | 'M5' | ...     // requerido
 *     date_from:      'YYYY-MM-DD'          // requerido
 *     date_to:        'YYYY-MM-DD'          // requerido
 *     name:           string                // opcional. Si falta → auto
 *   }
 *
 * Respuesta 200:
 *   { ok: true, session: { ...fila insertada } }
 *
 * Reglas:
 *  - Solo usuario autenticado (alumno o admin).
 *  - Valida challenge_type contra lib/challengeRules.
 *  - Valida capital contra ACCOUNT_SIZES.
 *  - Siempre crea como fase 1. El avance a fase 2/3 se hace por /api/challenge/advance.
 *  - challenge_parent_id = null en la fase 1.
 *  - status = 'active'.
 *  - balance = capital (sin trades todavía).
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const auth = await requireUser(req, res)
  if (!auth) return
  const { user, supabaseAdmin } = auth

  const {
    challenge_type,
    capital,
    pair,
    timeframe,
    date_from,
    date_to,
    name,
  } = req.body || {}

  // ── Validación
  const cfg = getChallengeConfig(challenge_type)
  if (!cfg) {
    return res.status(400).json({ error: 'challenge_type inválido. Debe ser 1F, 2F o 3F.' })
  }

  const capitalNum = Number(capital)
  const VALID_SIZES = [10000, 25000, 50000, 100000, 200000]
  if (!VALID_SIZES.includes(capitalNum)) {
    return res.status(400).json({
      error: `capital inválido. Debe ser uno de: ${VALID_SIZES.join(', ')}`
    })
  }

  if (!pair || typeof pair !== 'string') {
    return res.status(400).json({ error: 'pair requerido' })
  }
  if (!timeframe || typeof timeframe !== 'string') {
    return res.status(400).json({ error: 'timeframe requerido' })
  }
  if (!date_from || !/^\d{4}-\d{2}-\d{2}$/.test(date_from)) {
    return res.status(400).json({ error: 'date_from requerido (YYYY-MM-DD)' })
  }
  if (!date_to || !/^\d{4}-\d{2}-\d{2}$/.test(date_to)) {
    return res.status(400).json({ error: 'date_to requerido (YYYY-MM-DD)' })
  }
  if (new Date(date_from) >= new Date(date_to)) {
    return res.status(400).json({ error: 'date_from debe ser anterior a date_to' })
  }

  // ── Nombre automático si no lo pasan
  const autoName = `Challenge ${cfg.name} · ${formatCapital(capitalNum)} · ${pair}`
  const finalName = (name && typeof name === 'string' && name.trim()) ? name.trim() : autoName

  // ── Insert
  const payload = {
    user_id: user.id,
    name: finalName,
    pair,
    timeframe,
    date_from,
    date_to,
    capital: capitalNum,
    balance: capitalNum,
    status: 'active',
    challenge_type,
    challenge_phase: 1,
    challenge_parent_id: null,
  }

  const { data, error } = await supabaseAdmin
    .from('sim_sessions')
    .insert(payload)
    .select('*')
    .single()

  if (error) {
    return res.status(500).json({ error: 'Error creando challenge', detail: error.message })
  }

  return res.status(200).json({ ok: true, session: data })
}

function formatCapital(n) {
  if (n >= 1000) return `$${(n / 1000).toFixed(0)}K`
  return `$${n}`
}
