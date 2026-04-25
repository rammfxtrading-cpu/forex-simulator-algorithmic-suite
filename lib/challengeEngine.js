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

// Reset del DD diario: 00:00 Europe/Madrid (CET/CEST). Estilo FTMO.
// Esta funcion convierte un ISO timestamp al 'dia calendario' en esa zona horaria.
// Ejemplos (asumiendo que en Madrid es UTC+1 o UTC+2 segun DST):
//   '2025-10-28T23:30:00Z'  (UTC) -> 01:30 del 29 en Madrid -> '2025-10-29'
//   '2025-10-28T20:00:00Z'  (UTC) -> 21:00 del 28 en Madrid -> '2025-10-28'
//
// Usamos Intl.DateTimeFormat con zona explicita para que maneje DST correctamente.
const _madridFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Madrid',
  year: 'numeric', month: '2-digit', day: '2-digit',
})
// Normaliza variantes que Postgres/Supabase pueden devolver:
//   '2025-10-24T12:29:00+00'    -> '2025-10-24T12:29:00+00:00'
//   '2025-10-24 12:29:00+00'    -> '2025-10-24T12:29:00+00:00'
// Node.js en modo estricto rechaza el offset '+00' sin los minutos.
function normalizeIso(ts) {
  if (!ts) return null
  let s = String(ts)
  // Postgres a veces usa espacio en lugar de T
  if (s.includes(' ') && !s.includes('T')) s = s.replace(' ', 'T')
  // Offset tipo '+00' al final -> '+00:00'. Tambien '-05' -> '-05:00'
  s = s.replace(/([+-]\d{2})$/, '$1:00')
  return s
}
function dayInMadrid(isoTimestamp) {
  if (!isoTimestamp) return null
  try {
    const d = new Date(normalizeIso(isoTimestamp))
    if (isNaN(d.getTime())) return null
    // en-CA formatea como 'YYYY-MM-DD' directamente
    return _madridFormatter.format(d)
  } catch {
    return null
  }
}

/**
 * Evalúa el estado de un challenge dado el estado actual de sus trades.
 *
 * @param {object} params
 * @param {string} params.challengeType - '1F' | '2F' | '3F'
 * @param {number} params.currentPhase  - 1-indexed
 * @param {number} params.capital       - capital inicial del challenge (USD)
 * @param {Array}  params.trades        - lista de sim_trades (solo los cerrados importan,
 *                                        pero el filtro se hace dentro para ser tolerante)
 * @param {string} [params.currentTimeIso] - timestamp ISO del "ahora" del simulador (vela actual).
 *                                           Si no se pasa, usa la fecha real del servidor.
 *                                           En un backtest histórico, "hoy" debe ser el día del
 *                                           simulador, no del ordenador.
 * @returns {object} ver cabecera
 */
export function evaluateChallenge({ challengeType, currentPhase, capital, trades, currentTimeIso }) {
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

  // ── 4. DD total — REGLA FTMO EXACTA: suelo fijo en capital × (1 - dd_total_pct/100)
  //     NO es peak-to-trough. NO es trailing. Es un suelo ABSOLUTO.
  //     Si tu equity cae por debajo de `capital - 10%` en cualquier momento → QUEMADO.
  //     Si ganas, el suelo NO sube (sigue fijo donde empezaste).
  //
  //     Recorro trades cronológicamente para:
  //       - equity final → balanceNow
  //       - worst histórico: el equity MÍNIMO alcanzado (para analytics y evaluación fail/pass)
  //       - current: caída desde capital hasta equity actual (lo que muestra el HUD live)
  let equity = capital
  let equityMin = capital // equity mínimo histórico (worst)
  for (const t of closedTrades) {
    equity += Number(t.pnl) || 0
    if (equity < equityMin) equityMin = equity
  }
  // Worst: máxima caída desde capital inicial. Si el equity nunca baja de capital, worst = 0.
  const ddTotalWorstUSD = Math.max(0, capital - equityMin)
  const ddTotalWorstPct = (ddTotalWorstUSD / capital) * 100
  // Current: caída actual desde capital. Si equity >= capital (estás en ganancia), current = 0.
  const ddTotalCurrentUSD = Math.max(0, capital - equity)
  const ddTotalCurrentPct = (ddTotalCurrentUSD / capital) * 100
  const ddTotalCapPct = cfg.dd_total_pct
  const ddTotalCapUSD = capital * (ddTotalCapPct / 100)

  // ── 5. DD diario (FTMO-style: peor caída intradía respecto al balance de inicio de día).
  //     Para cada día UTC:
  //       startOfDayBalance = balance al inicio del día (capital + pnl de días anteriores)
  //       Recorro los trades del día EN ORDEN cronológico llevando equity.
  //       dayIntradayLow = el equity MÍNIMO alcanzado durante el día.
  //       ddDay = startOfDay - dayIntradayLow   (si el low está por debajo del inicio)
  //     Nota importante: el DD se mide respecto al BALANCE DE INICIO DE DÍA (no al peak intradía).
  //     Esto es lo que hace FTMO: te queman si tu equity cae más del X% respecto a donde abriste el día.
  //     Aunque luego recuperes, el DD máximo del día ya quedó registrado.
  //
  //     Ejemplo: empiezas día con $100K. Ganas $3K (equity $103K). Pierdes $5K (equity $98K = -2% del inicio).
  //     Ganas $4K (equity $102K). DD diario del día = 2% (medido en el valle $98K vs inicio $100K).
  //     Si cap = 5%, estas bien (aunque el trade ganador recupere); si cap = 1.5%, quemado en el momento de la caída.
  const tradesByDay = new Map() // 'YYYY-MM-DD' (dia Europe/Madrid) -> [trades ordenados]
  for (const t of closedTrades) {
    const day = dayInMadrid(t.closed_at) // reset 00:00 CET/CEST
    if (!day) continue
    if (!tradesByDay.has(day)) tradesByDay.set(day, [])
    tradesByDay.get(day).push(t)
  }
  const days = [...tradesByDay.keys()].sort()
  let runningBalance = capital
  let ddDailyWorstUSD = 0
  let ddDailyWorstPct = 0
  // FTMO-exacto: el cap del DD diario se recalcula cada día como
  // startOfDayBalance * dd_daily_pct / 100. No es un cap fijo sobre capital inicial.
  // dailyCapBreached: flag booleano. Se activa en cuanto algún día toca o cruza el cap.
  // (Antes usábamos un `excess > ddDailyWorstExceededUSD` que con `excess === 0`
  // —caso límite exacto, ddDay igual al cap— no se activaba nunca. Bug.)
  let dailyCapBreached = false
  // Para el DD diario ACTUAL (live): recuerdo el último día registrado y su ddDay + cap.
  let lastDay = null
  let lastDayStartBalance = capital
  let lastDayLowIntraday = capital
  const ddDailyCapRatio = cfg.dd_daily_pct / 100 // p.ej. 0.05 para 5%
  for (const day of days) {
    const startOfDay = runningBalance
    const dayCapUSD = startOfDay * ddDailyCapRatio
    const dayTrades = tradesByDay.get(day) || []
    // Equity intradía, partiendo del balance de inicio de día.
    // closedTrades ya está ordenado por closed_at asc, y dayTrades hereda ese orden.
    let equityIntraday = startOfDay
    let lowIntraday = startOfDay
    for (const t of dayTrades) {
      equityIntraday += Number(t.pnl) || 0
      if (equityIntraday < lowIntraday) lowIntraday = equityIntraday
    }
    const ddDay = Math.max(0, startOfDay - lowIntraday)
    if (ddDay > ddDailyWorstUSD) {
      ddDailyWorstUSD = ddDay
      ddDailyWorstPct = startOfDay > 0 ? (ddDay / startOfDay) * 100 : 0
    }
    // Detectar si este día cruzó (o tocó) el cap (para evaluación fail).
    // Tolerancia 1 céntimo para evitar falsos negativos por floating-point
    // (p.ej. ddDay = 4999.999999999 cuando matemáticamente debería ser 5000).
    if (dayCapUSD > 0 && ddDay >= dayCapUSD - 0.01) {
      dailyCapBreached = true
    }
    lastDay = day
    lastDayStartBalance = startOfDay
    lastDayLowIntraday = lowIntraday
    runningBalance = equityIntraday // balance al cerrar el día (suma de todos los pnl del día)
  }
  const ddDailyCapPct = cfg.dd_daily_pct
  // El cap mostrado en HUD = cap del día actual (startOfDay × 5%), o del último día si no hay trades hoy.
  const ddDailyCapUSD = lastDayStartBalance * ddDailyCapRatio

  // DD diario ACTUAL (live): solo cuenta si HOY (Madrid) tiene trades y ha habido caída.
  // "HOY" = dia Madrid de currentTimeIso (el simulador), o la fecha real del servidor si no se pasa.
  // Si el último día registrado NO es "hoy Madrid", el DD diario actual es 0 (reset automático al cambiar de día).
  const nowIso = currentTimeIso || new Date().toISOString()
  const todayMadrid = dayInMadrid(nowIso)
  let ddDailyCurrentUSD = 0
  let ddDailyCurrentPct = 0
  if (lastDay === todayMadrid && lastDayStartBalance > 0) {
    ddDailyCurrentUSD = Math.max(0, lastDayStartBalance - lastDayLowIntraday)
    ddDailyCurrentPct = (ddDailyCurrentUSD / lastDayStartBalance) * 100
  }

  // ── 6. Determinar status
  //     Orden de prioridad para failures: total > daily (si ambos caen, el total es más grave).
  //     target_reached es informativo — NO avanza fase automáticamente.
  //     El avance lo dispara el alumno con "Submit Phase".
  let status = 'active'
  let failureReason = null

  if (ddTotalWorstUSD >= ddTotalCapUSD) {
    status = 'failed_dd_total'
    failureReason = 'dd_total'
  } else if (dailyCapBreached) {
    // FTMO-exacto: algún día cruzó (o tocó) su cap (startOfDay × 5%).
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
    // Worst hist\u00f3ricos (para evaluaci\u00f3n fail/pass y analytics)
    ddDailyWorstUSD,
    ddDailyWorstPct,
    ddDailyCapUSD,
    ddDailyCapPct,
    ddTotalWorstUSD,
    ddTotalWorstPct,
    ddTotalCapUSD,
    ddTotalCapPct,
    // Live actuales (para HUD: lo que te queda de margen ahora mismo)
    ddDailyCurrentUSD,
    ddDailyCurrentPct,
    ddTotalCurrentUSD,
    ddTotalCurrentPct,
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
