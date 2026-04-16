/**
 * chartCoords.js - Deterministic coordinate system for custom drawings
 * SOURCE OF TRUTH: window.__algSuiteSeriesData (real + phantom candles)
 * time -> binary search with interpolation -> logicalIndex -> pixel
 * price -> series.priceToCoordinate -> pixel
 */

export function timeToLogical(time) {
  const allData = window.__algSuiteSeriesData
  if (!allData || allData.length < 2) return null
  const realLen = window.__algSuiteRealDataLen || allData.length
  const data = allData.slice(0, realLen)
  const t = Number(time)
  const first = Number(data[0].time)
  const last = Number(data[data.length - 1].time)
  if (t <= first) {
    const interval = Number(data[1].time) - first
    if (interval <= 0) return 0
    return (t - first) / interval
  }
  if (t >= last) {
    const prev = Number(data[data.length - 2].time)
    const interval = last - prev
    if (interval <= 0) return data.length - 1
    return (data.length - 1) + (t - last) / interval
  }
  let lo = 0, hi = data.length - 1
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1
    if (Number(data[mid].time) <= t) lo = mid
    else hi = mid
  }
  const tLo = Number(data[lo].time)
  const tHi = Number(data[hi].time)
  if (tHi === tLo) return lo
  return lo + (t - tLo) / (tHi - tLo)
}

export function toScreenCoords(cr, time, price) {
  if (!cr?.chart || !cr?.series) return null
  try {
    // Prefer LWC's native timeToCoordinate — reliable across all TF changes
    let x = null
    try { x = cr.chart.timeScale().timeToCoordinate(time) } catch {}

    // Fallback: manual logical index calculation
    if (x === null) {
      const logical = timeToLogical(time)
      if (logical === null) return null
      x = cr.chart.timeScale().logicalToCoordinate(logical)
      if (x === null) {
        const vr = cr.chart.timeScale().getVisibleLogicalRange()
        if (vr) {
          const x1 = cr.chart.timeScale().logicalToCoordinate(vr.from)
          const x2 = cr.chart.timeScale().logicalToCoordinate(vr.to)
          if (x1 !== null && x2 !== null && vr.to !== vr.from) {
            const visibleSpan = vr.to - vr.from
            const clampedLogical = Math.max(vr.from - visibleSpan, Math.min(vr.to + visibleSpan, logical))
            x = x1 + (clampedLogical - vr.from) * (x2 - x1) / visibleSpan
          }
        }
      }
    }
    if (x === null) return null
    const y = cr.series.priceToCoordinate(price)
    if (y === null) return null
    return { x, y }
  } catch { return null }
}

export function fromScreenCoords(cr, x, y) {
  if (!cr?.chart || !cr?.series) return null
  try {
    const data = window.__algSuiteSeriesData
    if (!data?.length) return null
    const rawLogical = cr.chart.timeScale().coordinateToLogical(x)
    if (rawLogical === null) return null
    const price = cr.series.coordinateToPrice(y)
    if (price === null) return null
    // Use real data length only — never phantom range
    const realLen = window.__algSuiteRealDataLen || data.length
    const realData = data.slice(0, realLen)
    if (rawLogical >= realLen - 1) {
      // Beyond real data — extrapolate using last real interval
      const last = Number(realData[realLen - 1].time)
      const prev = Number(realData[realLen - 2].time)
      const interval = last - prev
      const time = Math.round(last + (rawLogical - (realLen - 1)) * interval)
      return { time, price }
    }
    const logical = Math.max(0, Math.min(rawLogical, realLen - 1))
    const floorIdx = Math.max(0, Math.min(Math.floor(logical), realLen - 2))
    const ceilIdx = floorIdx + 1
    const tFloor = Number(realData[floorIdx].time)
    const tCeil = Number(realData[ceilIdx].time)
    const frac = Math.max(0, Math.min(logical - floorIdx, 1))
    const time = Math.round(tFloor + frac * (tCeil - tFloor))
    return { time, price }
  } catch { return null }
}
