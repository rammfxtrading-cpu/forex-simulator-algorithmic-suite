// Núcleo puro del detector de breach intra-vela (Fase 6 · Corte 2a).
// Extraído verbatim de components/_SessionInner.js L1683-1742 (checkChallengeBreach,
// anillo 1), parametrizado según §3 de refactor/fase-6-corte-2-plan.md.
//
// El componente conserva la lectura de refs (anillo 2) y el disparo de cierres
// (anillo 3). Este módulo recibe UNA vela ya filtrada (livePositions, high, low)
// + los escalares de contexto ya leídos y devuelve el veredicto de esa vela.
//
// Conducta-neutral por EQUIVALENCIA verificada (harness §8, Object.is, 0 fails),
// NO por movimiento de bytes: el inline estaba acoplado a refs de React; esto es
// una reescritura con firma. Los dos `continue` del bucle inline (L1703, L1730)
// mapean a `return { breach: false }`; el componente reproduce el salto con
// `if (!r.breach) continue` (Corte 2b).
//
// Encadenamiento de módulos del dominio: importa pipMult/calcPnl/pipValue de ./pricing.
import { pipMult, calcPnl, pipValue } from './pricing'

export function resolveBreach({
  livePositions,
  high,
  low,
  pair,
  capital,
  realizedDelta,
  floatingOtherPairs,
  ddTotalCapUSD,
  ddDailyCapUSD,
  ddDailyAlreadyUSD,
}) {
  // PnL combinado al low y al high.
  const pnlAtLow  = livePositions.reduce((s, p) => s + calcPnl(p.side, p.entry, low,  p.lots, pair), 0)
  const pnlAtHigh = livePositions.reduce((s, p) => s + calcPnl(p.side, p.entry, high, p.lots, pair), 0)
  // Peor escenario floating de este pair en esta vela.
  const worstFloating = Math.min(pnlAtLow, pnlAtHigh)

  // Equity worst-case en esta vela = capital + realized + floatingOther + worstFloating
  const equityWorst = capital + realizedDelta + floatingOtherPairs + worstFloating
  // Caída total desde capital inicial.
  const ddTotalAtWorst = Math.max(0, capital - equityWorst)
  // Caída del DÍA worst-case (misma aproximación que el backend recalcula al cerrar).
  const ddDailyAtWorst = ddDailyAlreadyUSD + Math.max(0, -worstFloating - floatingOtherPairs)

  const totalBreach = ddTotalAtWorst >= ddTotalCapUSD - 0.01
  const dailyBreach = ddDailyAtWorst >= ddDailyCapUSD - 0.01

  if (!totalBreach && !dailyBreach) return { breach: false }

  // ─── Hay breach. Calcular el precio EXACTO donde el equity tocó el cap ───
  // pnl(price) = price*A - B  con A = sum(±pipMult*lots*pipValue), B = sum(±entry*pipMult*lots*pipValue)
  const mult = pipMult(pair)
  const pv = pipValue(pair)
  let A = 0, B = 0
  livePositions.forEach(p => {
    const sign = p.side === 'BUY' ? 1 : -1
    const coef = sign * mult * Number(p.lots) * pv
    A += coef
    B += coef * Number(p.entry)
  })
  // pnlObjetivo = el menos negativo de los dos targets (se cruza primero).
  const targetForTotal = -(ddTotalCapUSD) - realizedDelta - floatingOtherPairs
  const targetForDaily = -(ddDailyCapUSD - ddDailyAlreadyUSD) - floatingOtherPairs
  const pnlObjetivo = Math.max(targetForTotal, targetForDaily)
  const reasonStr = (targetForDaily > targetForTotal) ? 'DD_DAILY_BREACH' : 'DD_TOTAL_BREACH'

  // Si A es cero (no debería), no hay solución lineal.
  if (Math.abs(A) < 1e-9) return { breach: false }
  let breachPrice = (pnlObjetivo + B) / A
  // Empuje de 0.5 pips más allá del breach exacto (evita falsos negativos por
  // redondeo IEEE-754 en el backend). Dirección según el extremo peor.
  const halfPip = 0.5 / mult
  const pushDown = (pnlAtLow < pnlAtHigh)
  breachPrice += pushDown ? -halfPip : halfPip
  // Clamp al rango de la vela [low, high].
  breachPrice = Math.max(low, Math.min(high, breachPrice))

  return { breach: true, breachPrice, reason: reasonStr }
}
