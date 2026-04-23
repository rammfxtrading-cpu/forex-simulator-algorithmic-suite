// lib/challengeEngine.js
// ────────────────────────────────────────────────────────────────────────────
// Motor de evaluación de challenges. Función pura: mismas entradas => mismas salidas.
// No toca React, no hace fetch, no muta nada. Se puede testear en isolation.
//
// Uso:
//   import { evaluateChallenge } from '../lib/challengeEngine'
//   const result = evaluateChallenge({ challengeType, currentPhase, capital, trades })
//
// Retorna:
//   {
//     status: 'active' | 'target_reached' | 'failed_dd_daily' | 'failed_dd_total',
//     balanceNow: number,        // balance actual (capital + suma de pnl de trades cerrados)
//     pnlTotal: number,          // ganancia/pérdida acumulada en USD
//     pnlPct: number,            // % sobre capital inicial
//     targetUSD: number,         // objetivo de la fase en USD
//     targetPct: number,         // objetivo de la fase en %
//     targetRemainingUSD: number, // cuánto falta para el target (nunca negativo)
//     ddDailyWorstUSD: number,   // peor DD diario histórico en USD (magnitud positiva)
//     ddDailyWorstPct: number,   // peor DD diario histórico en %
//     ddDailyCapUSD: number,     // cap de DD diario en USD
//     ddDailyCapPct: number,     // cap de DD diario en %
//     ddTotalWorstUSD: number,   // peor DD total desde equity peak en USD
//     ddTotalWorstPct: number,   // peor DD total desde equity peak en %
//     ddTotalCapUSD: number,     // cap de DD total en USD
//     ddTotalCapPct: number,     // cap de DD total en %
//     failureReason: null | 'dd_daily' | 'dd_total',
//   }
// ────────────────────────────────────────────────────────────────────────────

import { getChallengeConfig, getPhaseTarget } from './challengeRules'

/**
 * Evalúa el estado de un challenge dado el estado actual de sus trades.
 *
 * @param {object} params
 * @param {string} params.challengeType - '1F' | '2F' | '3F'
 * @param {number} params.currentPhase  - 1-indexed
 * @param {number} params.capital       - capital inicial del challenge (USD)
 * @param {Array}  params.trades        - lista de sim_trades (solo los cerrados importan,
 *                                        pero el filtro se hace dentro para ser tolerante)
 * @returns {object} ver cabecera
 */
export function evaluateChallenge({ challengeType, currentPhase, capital, trades }) {
  const cfg = getChallengeConfig(challengeType)
  if (!cfg) {
    throw new Error(`[challengeEngine] Invalid challengeType: ${challengeType}`)
  }
  if (!currentPhase || currentPhase < 1 || currentPhase > cfg.phases) {
    throw new Error(`[challengeEngine] Invalid phase ${currentPhase} for ${challengeType}`)
  }
  if (!(capital > 0)) {
    throw new Error(`[challengeEngine] Invalid capital: ${capital}`)
  }

  // ── 1. Filtrar trades cerrados (con result y closed_at)
  //     Los trades abiertos no cuentan para P&L realizado ni para DD.
  const closedTrades = (trades || [])
    .filter(t => t && t.closed_at && t.result && t.result !== 'OPEN')
    .slice()
    .sort((a, b) => new Date(a.closed_at) - new Date(b.closed_at))

  // ── 2. PnL acumulado y balance actual
  const pnlTotal = closedTrades.reduce((s, t) => s + (Number(t.pnl) || 0), 0)
  const balanceNow = capital + pnlTotal
  const pnlPct = (pnlTotal / capital) * 100

  // ── 3. Target de la fase
  const targetPct = getPhaseTarget(challengeType, currentPhase)
  const targetUSD = capital * (targetPct / 100)
  const targetRemainingUSD = Math.max(0, targetUSD - pnlTotal)

  // ── 4. DD total (máxima caída desde equity peak)
  //     Recorro trades en orden cronológico, llevando equity y peak.
  let equity = capital
  let peak = capital
  let ddTotalWorstUSD = 0
  for (const t of closedTrades) {
    equity += Number(t.pnl) || 0
    if (equity > peak) peak = equity
    const dd = peak - equity // magnitud positiva
    if (dd > ddTotalWorstUSD) ddTotalWorstUSD = dd
  }
  const ddTotalWorstPct = (ddTotalWorstUSD / capital) * 100
  const ddTotalCapPct = cfg.dd_total_pct
  const ddTotalCapUSD = capital * (ddTotalCapPct / 100)

  // ── 5. DD diario (peor pérdida en un día calendario UTC respecto al
  //     balance al inicio de ese día).
  //     Para cada día:
  //       startOfDayBalance = capital + sum(pnl de todos los trades cerrados en días anteriores)
  //       pnlDay = sum(pnl de trades cerrados ese día)
  //       ddDay = max(0, -pnlDay)   // solo pérdidas cuentan
  //     Lo reportamos sobre el startOfDayBalance para ser realista (FTMO usa equity del día).
  const byDay = new Map() // 'YYYY-MM-DD' -> sum pnl
  for (const t of closedTrades) {
    const day = (t.closed_at || '').slice(0, 10) // UTC date part
    if (!day) continue
    byDay.set(day, (byDay.get(day) || 0) + (Number(t.pnl) || 0))
  }
  // Ordenar días
  const days = [...byDay.keys()].sort()
  let runningBalance = capital
  let ddDailyWorstUSD = 0
  let ddDailyWorstPct = 0
  for (const day of days) {
    const startOfDay = runningBalance
    const pnlDay = byDay.get(day) || 0
    const ddDay = Math.max(0, -pnlDay) // solo cuenta si pierdes ese día
    if (ddDay > ddDailyWorstUSD) {
      ddDailyWorstUSD = ddDay
      ddDailyWorstPct = startOfDay > 0 ? (ddDay / startOfDay) * 100 : 0
    }
    runningBalance += pnlDay
  }
  const ddDailyCapPct = cfg.dd_daily_pct
  const ddDailyCapUSD = capital * (ddDailyCapPct / 100)

  // ── 6. Determinar status
  //     Orden de prioridad para failures: total > daily (si ambos caen, el total es más grave).
  //     target_reached es informativo — NO avanza fase automáticamente.
  //     El avance lo dispara el alumno con "Submit Phase".
  let status = 'active'
  let failureReason = null

  if (ddTotalWorstUSD >= ddTotalCapUSD) {
    status = 'failed_dd_total'
    failureReason = 'dd_total'
  } else if (ddDailyWorstUSD >= ddDailyCapUSD) {
    status = 'failed_dd_daily'
    failureReason = 'dd_daily'
  } else if (pnlTotal >= targetUSD) {
    status = 'target_reached'
  }

  return {
    status,
    balanceNow,
    pnlTotal,
    pnlPct,
    targetUSD,
    targetPct,
    targetRemainingUSD,
    ddDailyWorstUSD,
    ddDailyWorstPct,
    ddDailyCapUSD,
    ddDailyCapPct,
    ddTotalWorstUSD,
    ddTotalWorstPct,
    ddTotalCapUSD,
    ddTotalCapPct,
    failureReason,
  }
}

/**
 * Helper: saber si un status indica challenge terminado (no se puede seguir operando).
 */
export function isChallengeOver(status) {
  return status === 'failed_dd_daily' ||
         status === 'failed_dd_total' ||
         status === 'passed_all'
}

/**
 * Helper: saber si un status es de éxito.
 */
export function isChallengePassed(status) {
  return status === 'passed_all'
}

/**
 * Helper: convertir un status interno a texto humano en español.
 */
export function statusLabel(status) {
  switch (status) {
    case 'active':           return 'En curso'
    case 'target_reached':   return 'Objetivo alcanzado'
    case 'passed_phase':     return 'Fase pasada'
    case 'passed_all':       return 'Challenge completado'
    case 'failed_dd_daily':  return 'Quemado por DD diario'
    case 'failed_dd_total':  return 'Quemado por DD total'
    default:                 return status || ''
  }
}
