/**
 * R.A.M.M. FX Replay — Replay Engine
 * El motor siempre trabaja en M1 internamente.
 * La velocidad es en minutos de mercado por tick (1 tick = 1 segundo real).
 * El chart agrega desde M1 según el timeframe seleccionado.
 */

class ReplayEngine {
  constructor() {
    this.candles = []        // todos los M1 cargados
    this.currentIndex = 0    // índice actual en el array M1
    this.isPlaying = false
    this.speed = 1           // minutos de mercado que avanza por tick
    this.tickMs = 1000       // 1 tick = 1 segundo real
    this.interval = null
    this.onTick = null       // callback(currentTime, visibleCandles)
    this.onEnd = null        // callback cuando llega al final
  }

  // Carga velas M1 en el motor
  load(candles, startIndex = 0) {
    this.candles = candles
    this.currentIndex = startIndex
    this.isPlaying = false
    this._clearInterval()
  }

  // Timestamp actual del motor (unix seconds)
  get currentTime() {
    return this.candles[this.currentIndex]?.time ?? null
  }

  // Velas M1 visibles hasta el momento actual (sin lookahead)
  get visibleCandles() {
    return this.candles.slice(0, this.currentIndex + 1)
  }

  // Agrega velas M1 al timeframe solicitado sin lookahead
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
        bucket = { time: bucketTime, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume }
      } else {
        bucket.high = Math.max(bucket.high, c.high)
        bucket.low = Math.min(bucket.low, c.low)
        bucket.close = c.close
        bucket.volume += c.volume
      }
    }
    if (bucket) aggregated.push(bucket)
    return aggregated
  }

  // Avanza N minutos de mercado (N velas M1)
  nextCandle(minutes = null) {
    const steps = minutes ?? this.speed
    const next = this.currentIndex + steps

    if (next >= this.candles.length) {
      this.currentIndex = this.candles.length - 1
      this.pause()
      if (this.onEnd) this.onEnd()
      return false
    }

    this.currentIndex = next
    if (this.onTick) this.onTick(this.currentTime, this.visibleCandles)
    return true
  }

  play() {
    if (this.isPlaying) return
    this.isPlaying = true
    this.interval = setInterval(() => {
      const ok = this.nextCandle()
      if (!ok) this.pause()
    }, this.tickMs)
  }

  pause() {
    this.isPlaying = false
    this._clearInterval()
  }

  // speed = minutos de mercado por tick
  setSpeed(speed) {
    this.speed = speed
    if (this.isPlaying) {
      this.pause()
      this.play()
    }
  }

  // Salta a un timestamp específico
  jumpToTime(timestamp) {
    const idx = this.candles.findIndex(c => c.time >= timestamp)
    if (idx !== -1) {
      this.currentIndex = idx
      if (this.onTick) this.onTick(this.currentTime, this.visibleCandles)
    }
  }

  reset() {
    this.pause()
    this.currentIndex = 0
    if (this.onTick) this.onTick(this.currentTime, this.visibleCandles)
  }

  _clearInterval() {
    if (this.interval) {
      clearInterval(this.interval)
      this.interval = null
    }
  }
}

// Timeframes en minutos
const TIMEFRAMES = {
  M1: 1,
  M3: 3,
  M5: 5,
  M15: 15,
  M30: 30,
  H1: 60,
  H2: 120,
  H3: 180,
  H4: 240,
  D1: 1440,
  W1: 10080,
}

export { TIMEFRAMES }
export default ReplayEngine
