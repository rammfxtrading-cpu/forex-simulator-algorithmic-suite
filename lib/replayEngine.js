/**
 * R.A.M.M. FX Replay — Replay Engine v2
 *
 * SOURCE OF TRUTH: currentTime (unix timestamp)
 * currentIndex es siempre derivado — se recalcula desde currentTime.
 *
 * Esto garantiza consistencia en:
 *   - multi-par (cada engine tiene su propio dataset)
 *   - scrubber (salta por timestamp, no por posición en array)
 *   - cambios de dataset (año, pair) sin romper el estado
 */

class ReplayEngine {
  constructor() {
    this.candles      = []      // todos los M1 cargados
    this._currentTime = null    // SOURCE OF TRUTH — unix seconds
    this.isPlaying    = false
    this.speed        = 1       // minutos M1 por tick
    this.tickMs       = 1000    // 1 tick = 1 segundo real
    this.interval     = null
    this.onTick       = null    // callback()
    this.onEnd        = null    // callback()
  }

  // ── Carga ──────────────────────────────────────────────────────────────────

  load(candles, startTimestamp = null) {
    this.candles = candles
    this._clearInterval()
    this.isPlaying = false

    if (startTimestamp !== null) {
      this.seekToTime(startTimestamp)
    } else {
      this._currentTime = candles[0]?.time ?? null
    }
  }

  // ── Source of truth: currentTime ──────────────────────────────────────────

  get currentTime() {
    return this._currentTime
  }

  // currentIndex es SIEMPRE derivado del timestamp
  get currentIndex() {
    if (this._currentTime === null || !this.candles.length) return 0
    // Búsqueda binaria O(log n)
    let lo = 0, hi = this.candles.length - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (this.candles[mid].time <= this._currentTime) lo = mid
      else hi = mid - 1
    }
    return lo
  }

  // Permite saltar directamente a un timestamp
  seekToTime(timestamp) {
    if (!this.candles.length) return
    const first = this.candles[0].time
    const last  = this.candles[this.candles.length - 1].time
    this._currentTime = Math.max(first, Math.min(last, timestamp))
    if (this.onTick) this.onTick()
  }

  // Salta a una fracción del dataset (0.0 – 1.0) — para el scrubber
  seekToProgress(fraction) {
    if (!this.candles.length) return
    const idx = Math.round(Math.max(0, Math.min(1, fraction)) * (this.candles.length - 1))
    this._currentTime = this.candles[idx].time
    if (this.onTick) this.onTick()
  }

  // Progreso actual (0.0 – 1.0)
  get progress() {
    if (this.candles.length < 2) return 0
    return this.currentIndex / (this.candles.length - 1)
  }

  // ── Velas visibles ────────────────────────────────────────────────────────

  get visibleCandles() {
    return this.candles.slice(0, this.currentIndex + 1)
  }

  // ── Agregación sin lookahead ──────────────────────────────────────────────

  getAggregated(timeframe) {
    const tf = TIMEFRAMES[timeframe] || 1
    const visible = this.visibleCandles
    if (!visible.length) return []

    const aggregated = []
    let bucket = null

    for (const c of visible) {
      const bucketTime = Math.floor(c.time / (tf * 60)) * (tf * 60)

      if (!bucket || bucket.time !== bucketTime) {
        if (bucket) aggregated.push(bucket)
        bucket = { time: bucketTime, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume ?? 0 }
      } else {
        bucket.high = Math.max(bucket.high, c.high)
        bucket.low  = Math.min(bucket.low,  c.low)
        bucket.close = c.close
        bucket.volume += c.volume ?? 0
      }
    }
    if (bucket) aggregated.push(bucket)
    return aggregated
  }

  // ── Avance ────────────────────────────────────────────────────────────────

  nextCandle(steps = null) {
    const s   = steps ?? this.speed
    const idx = Math.min(this.currentIndex + s, this.candles.length - 1)
    const newTime = this.candles[idx]?.time ?? null

    if (newTime === this._currentTime || idx >= this.candles.length - 1) {
      this._currentTime = this.candles[this.candles.length - 1]?.time ?? null
      this.pause()
      if (this.onEnd) this.onEnd()
      return false
    }

    this._currentTime = newTime
    if (this.onTick) this.onTick()
    return true
  }

  // ── Controles ─────────────────────────────────────────────────────────────

  play() {
    if (this.isPlaying) return
    this.isPlaying = true
    this.interval = setInterval(() => {
      if (!this.nextCandle()) this.pause()
    }, this.tickMs)
  }

  pause() {
    this.isPlaying = false
    this._clearInterval()
  }

  setSpeed(speed) {
    this.speed = speed
    if (this.isPlaying) { this.pause(); this.play() }
  }

  reset() {
    this.pause()
    this._currentTime = this.candles[0]?.time ?? null
    if (this.onTick) this.onTick()
  }

  _clearInterval() {
    if (this.interval) { clearInterval(this.interval); this.interval = null }
  }
}

// Timeframes en minutos
const TIMEFRAMES = {
  M1: 1, M3: 3, M5: 5, M15: 15, M30: 30,
  H1: 60, H2: 120, H3: 180, H4: 240, D1: 1440, W1: 10080,
}

export { TIMEFRAMES }
export default ReplayEngine
