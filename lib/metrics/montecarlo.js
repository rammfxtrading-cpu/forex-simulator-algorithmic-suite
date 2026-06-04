/**
 * lib/metrics/montecarlo.js — Simulación Montecarlo paramétrica (Bloque 3, feature 3/4, s58).
 *
 * Modelo estilo FX Replay (contrato: refactor/montecarlo-plan.md §2-§3):
 * cada trade simulado es WIN (+avgGain) con probabilidad winRate(%), o LOSS (-avgLoss).
 * Módulo PURO: sin React, sin Supabase, sin dependencias npm. Determinista con seed.
 *
 * Exports:
 *   MC_MAX_SIMS / MC_MAX_TRADES   → topes duros (100 / 100)
 *   mulberry32(seed)              → rng() en [0,1), determinista por seed
 *   deriveParams(closedTrades)    → precargas desde trades reales (BREAKEVEN excluidos)
 *   runMontecarlo(opts)           → { curves, stats, params }
 */

export const MC_MAX_SIMS = 100
export const MC_MAX_TRADES = 100

// RNG determinista mulberry32 (dominio público). 32-bit, suficiente para simulación visual.
export function mulberry32(seed) {
  let a = (Number.isFinite(seed) ? seed : 1) >>> 0
  return function () {
    a = (a + 0x6D2B79F5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function toFiniteNumber(v, fallback) {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

function clampInt(v, min, max) {
  const n = Math.floor(toFiniteNumber(v, min))
  if (n < min) return min
  if (n > max) return max
  return n
}

/**
 * Deriva las precargas desde trades cerrados reales (filas de sim_trades ya fetched por la UI).
 * BREAKEVEN excluido del cómputo (plan §2.2): winRate = wins/(wins+losses)*100.
 * OPEN y filas sin result se ignoran. avgLoss se devuelve POSITIVO (magnitud media).
 */
export function deriveParams(closedTrades) {
  let nW = 0, nL = 0, sumW = 0, sumL = 0
  for (const t of (Array.isArray(closedTrades) ? closedTrades : [])) {
    if (!t) continue
    if (t.result === 'WIN') { nW++; sumW += toFiniteNumber(t.pnl, 0) }
    else if (t.result === 'LOSS') { nL++; sumL += toFiniteNumber(t.pnl, 0) }
  }
  const winRate = (nW + nL) > 0 ? (nW / (nW + nL)) * 100 : 0
  const avgGain = nW > 0 ? sumW / nW : 0
  const avgLoss = nL > 0 ? Math.abs(sumL / nL) : 0
  return { winRate, avgGain, avgLoss, wins: nW, losses: nL }
}

/**
 * Corre la simulación.
 * opts: { nSims (1..100), nTrades (1..100), startBalance, winRate (0..100), avgGain, avgLoss, seed }
 * Inputs no finitos caen a fallbacks seguros; nSims/nTrades se clavan a [1,100]; winRate a [0,100];
 * avgGain/avgLoss se toman en valor absoluto.
 *
 * Devuelve:
 *   curves: nSims arrays de nTrades+1 balances (curve[0] = startBalance)
 *   stats:
 *     avgBalance / maxBalance / minBalance  → sobre el balance FINAL de cada simulación
 *     avgProfitFactor                       → media de PF_i = ganado_i/perdido_i por simulación;
 *                                             sims con perdido_i = 0 se excluyen; null si ninguna computable
 *     maxConsecWins / maxConsecLosses      → máximos GLOBALES entre todas las simulaciones
 *     totalWins / totalLosses              → sumas globales (totalWins+totalLosses = nSims*nTrades)
 *   params: eco de los parámetros efectivos tras clamps (incluye seed)
 */
export function runMontecarlo(opts) {
  const o = opts || {}
  const nSims = clampInt(o.nSims, 1, MC_MAX_SIMS)
  const nTrades = clampInt(o.nTrades, 1, MC_MAX_TRADES)
  const startBalance = toFiniteNumber(o.startBalance, 0)
  const winRate = Math.min(100, Math.max(0, toFiniteNumber(o.winRate, 0)))
  const avgGain = Math.abs(toFiniteNumber(o.avgGain, 0))
  const avgLoss = Math.abs(toFiniteNumber(o.avgLoss, 0))
  const seed = toFiniteNumber(o.seed, 1)
  const rng = mulberry32(seed)

  const curves = []
  const finals = []
  let totalWins = 0, totalLosses = 0
  let maxConsecWins = 0, maxConsecLosses = 0
  let pfSum = 0, pfCount = 0

  for (let s = 0; s < nSims; s++) {
    let bal = startBalance
    const curve = [bal]
    let cw = 0, cl = 0, gained = 0, lost = 0
    for (let i = 0; i < nTrades; i++) {
      if (rng() * 100 < winRate) {
        bal += avgGain; gained += avgGain; totalWins++
        cw++; cl = 0
        if (cw > maxConsecWins) maxConsecWins = cw
      } else {
        bal -= avgLoss; lost += avgLoss; totalLosses++
        cl++; cw = 0
        if (cl > maxConsecLosses) maxConsecLosses = cl
      }
      curve.push(bal)
    }
    curves.push(curve)
    finals.push(bal)
    if (lost > 0) { pfSum += gained / lost; pfCount++ }
  }

  let sumF = 0, maxF = -Infinity, minF = Infinity
  for (const f of finals) { sumF += f; if (f > maxF) maxF = f; if (f < minF) minF = f }

  return {
    curves,
    stats: {
      avgBalance: sumF / nSims,
      maxBalance: maxF,
      minBalance: minF,
      avgProfitFactor: pfCount > 0 ? pfSum / pfCount : null,
      maxConsecWins,
      maxConsecLosses,
      totalWins,
      totalLosses,
    },
    params: { nSims, nTrades, startBalance, winRate, avgGain, avgLoss, seed },
  }
}
