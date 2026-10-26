// EL RETO V1 CON LA FORMA DE /api/challenge/status (etapa 2 del motor, pieza 6; orden 1-125 del CTO). Puro: del estado
// CONFIRMADO del servidor (la vista de vista.js y evaluacionV1 de reto.js) al objeto { session, config, evaluation } que
// ya pintan ChallengeHUD y los modales de fase. Nada se recalcula con reglas propias. El ADAPTADOR de failureReason:
// el motor dice perdida_diaria / perdida_maxima; ChallengeFailedModal lee dd_daily / dd_total, y config.ddDailyPct /
// config.ddTotalPct y evaluation.dd*WorstPct, que salen de aqui (de las normas y cifras del servidor).
//   session.status   lo que hoy queda en la fila DESPUES del modal: con el reto ya terminado al abrir la pagina
//                    (yaTerminado), breach → failed_dd_daily / failed_dd_total; superada con la fase ya pasada (hija o
//                    completado) → passed_phase / passed_all. Si termina con la pagina abierta, active: el modal de hoy
//                    se abre una vez (useChallengeFlow lo abre por evaluation.status y lo calla por session.status)
//   peor DD          el del estado confirmado: lo que el saldo quedo por debajo del de la medianoche / del capital
import { evaluacionV1 } from './reto'
import { getChallengeConfig } from '../../challengeRules'

const MOTIVO = { perdida_diaria: 'dd_daily', perdida_maxima: 'dd_total' }
const r6 = x => (x == null || !Number.isFinite(x) ? null : Math.round(x * 1e6) / 1e6)

export function estadoRetoV1({ vista, sesion, trades = [], pasada = false, yaTerminado = false }) {
  const ev = evaluacionV1(vista)
  if (!ev || !sesion) return null
  const r = vista.reto
  const cfg = getChallengeConfig(sesion.challenge_type) ?? {}
  const fases = ev.fases ?? cfg.phases ?? 1
  const ultima = (ev.phase ?? 1) >= fases
  const status = (ev.status === 'failed_dd_daily' || ev.status === 'failed_dd_total') && yaTerminado ? ev.status
    : ev.status === 'target_reached' && pasada ? (ultima ? 'passed_all' : 'passed_phase') : 'active'
  const ddDailyWorstUSD = r6(Math.max(0, r.saldoMedianoche - vista.saldo))
  const ddTotalWorstUSD = r6(Math.max(0, r.capital - vista.saldo))
  const cerrados = trades.filter(t => Number.isFinite(Number(t.pnl)))
  return {
    ok: true,
    session: { ...sesion, capital: r.capital, balance: vista.saldo, status, challenge_phase: ev.phase },
    config: {
      code: cfg.code ?? sesion.challenge_type, name: cfg.name ?? sesion.challenge_type, phases: fases,
      targets_pct: cfg.targets_pct,
      dd_daily_pct: ev.ddDailyCapPct ?? cfg.dd_daily_pct, dd_total_pct: ev.ddTotalCapPct ?? cfg.dd_total_pct,
      ddDailyPct: ev.ddDailyCapPct ?? cfg.dd_daily_pct, ddTotalPct: ev.ddTotalCapPct ?? cfg.dd_total_pct,
    },
    evaluation: {
      ...ev,
      failureReason: ev.failureReason ? MOTIVO[ev.failureReason] ?? 'dd_total' : null,
      ddDailyWorstUSD, ddDailyWorstPct: r.saldoMedianoche ? r6((ddDailyWorstUSD / r.saldoMedianoche) * 100) : null,
      ddTotalWorstUSD, ddTotalWorstPct: r.capital ? r6((ddTotalWorstUSD / r.capital) * 100) : null,
      totalTrades: cerrados.length, winningTrades: cerrados.filter(t => Number(t.pnl) > 0).length,
    },
    trades_count: trades.length,
  }
}
