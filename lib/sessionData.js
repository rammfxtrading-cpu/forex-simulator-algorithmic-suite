/**
 * lib/sessionData.js — fase 1a (data layer)
 *
 * Single point of truth para fetch + filtrado de velas M1 de una sesión.
 *
 * IMPORTANTE: replica literalmente el bloque L740–785 de _SessionInner.js (rama
 * main, commit c5a5e26) sin "limpieza". Cualquier mejora (TZ consistente,
 * 6 meses calendario en vez de 180 días, etc.) queda fuera de fase 1 — ver
 * refactor/fase-1-plan.md §3.0.1 para el inventario de decisiones explícitas.
 */

/**
 * Fetch + filtro fin de semana de las velas M1 de una sesión.
 *
 * @param {object} args
 * @param {string} args.pair      — par como "EUR/USD"
 * @param {?string} args.dateFrom — "YYYY-MM-DD" o null/undefined
 * @param {?string} args.dateTo   — "YYYY-MM-DD" o null/undefined
 * @returns {Promise<{candles: object[], replayTs: number, toTs: number} | null>}
 *   - { candles: [...], replayTs, toTs } cuando la fetch produjo datos.
 *     · candles: array M1 post-filter weekend.
 *     · replayTs: unix seconds de inicio (calculado desde dateFrom o default).
 *     · toTs:     unix seconds de fin (calculado desde dateTo o default).
 *   - null cuando la fetch raw devolvió 0 velas. Equivalente exacto al
 *     `if (!all.length) return` de _SessionInner.js:760 — preserva la
 *     diferencia con "filtered.length === 0" (caso teórico donde todas las
 *     velas raw caen en fin de semana). El caller usa `if (!result) return`.
 *
 * Lanza si fetch HTTP o response.json() fallan — el caller debe try/catch
 * (igual que el try-catch de loadPair hoy en main).
 */
export async function fetchSessionCandles({ pair, dateFrom, dateTo }) {
  const clean = pair.replace('/', '')
  const replayTs = dateFrom
    ? Math.floor(new Date(dateFrom).getTime() / 1000)
    : Math.floor(new Date('2023-01-01').getTime() / 1000)
  const toTs = dateTo
    ? Math.floor(new Date(dateTo + 'T23:59:59').getTime() / 1000)
    : Math.floor(new Date('2023-12-31T23:59:59').getTime() / 1000)
  const ctxTs = replayTs - 6 * 30 * 24 * 60 * 60
  const ctxYear = new Date(ctxTs * 1000).getFullYear()
  const toYear = new Date(toTs * 1000).getFullYear()

  // Build list of ALL years needed: from ctxYear to toYear
  const years = []
  for (let y = ctxYear; y <= toYear; y++) years.push(y)

  let all = []
  for (const yr of years) {
    const yStart = Math.max(ctxTs, Math.floor(new Date(`${yr}-01-01`).getTime() / 1000))
    const yEnd = yr === toYear
      ? toTs
      : Math.floor(new Date(`${yr}-12-31T23:59:59`).getTime() / 1000)
    const r = await fetch(`/api/candles?pair=${clean}&timeframe=M1&from=${yStart}&to=${yEnd}&year=${yr}`)
    const j = await r.json()
    if (j.candles?.length) all = all.concat(j.candles)
  }

  const seen = new Set()
  all = all.filter(c => { if (seen.has(c.time)) return false; seen.add(c.time); return true })
           .sort((a, b) => a.time - b.time)

  if (!all.length) return null

  return { candles: filterWeekends(all), replayTs, toTs }
}

// ── Remove weekend gaps ──────────────────────────────────────────────
// Forex en Dukascopy cierra ~21:00 UTC viernes y abre ~21:00 UTC domingo.
// (Confirmado empíricamente vs FX Replay — ambos usan los mismos datos
//  de Dukascopy y el cierre está alrededor de 20:58, apertura 21:54).
// El filtro anterior era incorrecto en dos sentidos:
//   1. Permitía velas viernes >= 21:00 UTC (mercado ya cerrado).
//   2. Filtraba domingo < 22:00 UTC, pero el mercado abre a 21:00 UTC
//      en verano (DST) → perdíamos ~1h de velas líquidas cada domingo.
// Esto causaba que faltara la primera hora de actividad del domingo
// y descuadraba dibujos colocados cerca del fin de semana.
function filterWeekends(candles) {
  return candles.filter(c => {
    const d = new Date(c.time * 1000)
    const day = d.getUTCDay()
    const hour = d.getUTCHours()
    if (day === 6) return false                // Sábado entero
    if (day === 5 && hour >= 21) return false  // Viernes >= 21:00 UTC
    if (day === 0 && hour < 21)  return false  // Domingo < 21:00 UTC
    return true
  })
}
