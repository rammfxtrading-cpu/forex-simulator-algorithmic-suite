// lib/challengeRules.js
// ────────────────────────────────────────────────────────────────────────────
// Reglas de los challenges tipo FTMO.
// Modificar aquí = cambiar comportamiento en toda la app.
// ────────────────────────────────────────────────────────────────────────────

export const ACCOUNT_SIZES = [10000, 25000, 50000, 100000, 200000]

// Reglas comunes a todos los challenges
const COMMON_RULES = {
  dd_daily_pct: 5,   // % drawdown diario máximo sobre balance de inicio del día
  dd_total_pct: 10,  // % drawdown total máximo sobre capital inicial
}

export const CHALLENGES = {
  '1F': {
    code: '1F',
    name: '1 Fase',
    description: 'Un solo paso. Profit target agresivo.',
    phases: 1,
    ...COMMON_RULES,
    targets_pct: [15],        // Fase 1: 15% profit
  },
  '2F': {
    code: '2F',
    name: '2 Fases',
    description: 'Formato FTMO clásico. Evaluación + Verificación.',
    phases: 2,
    ...COMMON_RULES,
    targets_pct: [10, 5],     // Fase 1: 10%, Fase 2: 5%
  },
  '3F': {
    code: '3F',
    name: '3 Fases',
    description: 'Progresión gradual. Ideal para consistencia.',
    phases: 3,
    ...COMMON_RULES,
    targets_pct: [5, 5, 5],   // 5% en cada fase
  },
}

// Helper: obtener config por código
export function getChallengeConfig(code) {
  return CHALLENGES[code] || null
}

// Helper: obtener target % de una fase concreta (1-indexed)
export function getPhaseTarget(code, phase) {
  const cfg = CHALLENGES[code]
  if (!cfg) return null
  return cfg.targets_pct[phase - 1] ?? null
}

// Helper: formatear tamaño de cuenta
export function formatAccountSize(n) {
  if (n >= 1000) return `$${(n / 1000).toFixed(0)}K`
  return `$${n}`
}
