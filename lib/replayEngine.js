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
    this.candles      = []
    this._currentTime = null
    this.isPlaying    = false
    this.speed        = 1       // velas M1 efectivas por segundo de tiempo real
    this.tickMs       = 1000    // legado: ya no se usa para play(), preservado por compat
    this.interval     = null    // legado: limpiado por _clearTimers() si quedara colgando
    this.onTick       = null
    this.onEnd        = null
    this.saltando     = false   // avanzaHasta() en curso
    this._cortado     = false   // un pause() durante el salto
    // Aggregation cache — avoids O(n) full scan on every tick
    this._aggCache    = null  // { tf, index, result: [] }
    // rAF play loop state
    this._rafId       = null
    this._lastFrameTs = null  // performance.now() del frame anterior
    this._fracAcc     = 0     // acumulador fraccional de velas M1
  }

  // ── Carga ──────────────────────────────────────────────────────────────────

  load(candles, startTimestamp = null) {
    this.candles = candles
    this._aggCache = null
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

  // currentIndex es SIEMPRE derivado del timestamp — búsqueda binaria O(log n)
  get currentIndex() {
    if (this._currentTime === null || !this.candles.length) return 0
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
    this._aggCache = null  // seek invalidates cache
    if (this.onTick) this.onTick()
  }

  // Salta a una fracción del dataset (0.0 – 1.0) — para el scrubber
  seekToProgress(fraction) {
    if (!this.candles.length) return
    const idx = Math.round(Math.max(0, Math.min(1, fraction)) * (this.candles.length - 1))
    this._currentTime = this.candles[idx].time
    this._aggCache = null
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

  // ── Agregación incremental O(speed) en lugar de O(n) ─────────────────────

  getAggregated(timeframe) {
    const tf  = TIMEFRAMES[timeframe] || 1
    const idx = this.currentIndex

    // Cache hit — same TF and same index, return immediately
    if (this._aggCache && this._aggCache.tf === tf && this._aggCache.index === idx) {
      return this._aggCache.result
    }

    // Incremental update — only process new candles since last call
    if (this._aggCache && this._aggCache.tf === tf && idx > this._aggCache.index) {
      const prevIdx = this._aggCache.index
      const result  = this._aggCache.result  // mutate in place — safe since we own it
      const tfSecs  = tf * 60

      for (let i = prevIdx + 1; i <= idx; i++) {
        const c = this.candles[i]
        const bucketTime = Math.floor(c.time / tfSecs) * tfSecs
        const last = result[result.length - 1]

        if (!last || last.time !== bucketTime) {
          result.push({ time: bucketTime, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume ?? 0 })
        } else {
          if (c.high > last.high) last.high = c.high
          if (c.low  < last.low)  last.low  = c.low
          last.close   = c.close
          last.volume += c.volume ?? 0
        }
      }

      this._aggCache.index = idx
      return result
    }

    // Full recalculate (first call, TF change, or seek)
    const result  = []
    const tfSecs  = tf * 60
    let   bucket  = null

    for (let i = 0; i <= idx; i++) {
      const c = this.candles[i]
      const bucketTime = Math.floor(c.time / tfSecs) * tfSecs

      if (!bucket || bucket.time !== bucketTime) {
        if (bucket) result.push(bucket)
        bucket = { time: bucketTime, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume ?? 0 }
      } else {
        if (c.high > bucket.high) bucket.high = c.high
        if (c.low  < bucket.low)  bucket.low  = c.low
        bucket.close   = c.close
        bucket.volume += c.volume ?? 0
      }
    }
    if (bucket) result.push(bucket)

    this._aggCache = { tf, index: idx, result }
    return result
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

  // ── Salto recorriendo el tramo (Go to; orden 1-080 del CTO) ─────────────
  // Avanza hasta `timestamp` VELA M1 A VELA M1, con su onTick en cada una (SL/TP,
  // pendientes, reglas del reto), como play(): nunca un solo onTick para todo el
  // tramo. Tras cada vela espera a trasVela() (lib/sim/salto.js: los cierres y el
  // estado del reto); un false, o un pause() durante el salto (breach, bloqueo),
  // lo para en esa vela. Mientras dura, `saltando` (el onTick no repinta el
  // grafico y play() no arranca). Devuelve true si llego.
  async avanzaHasta(timestamp, trasVela = null) {
    if (this.saltando) return false
    this.pause()
    this.saltando = true
    this._cortado = false
    try {
      while (this._currentTime < timestamp) {
        if (!this.nextCandle(1) || this._cortado) return false
        if (trasVela && (await trasVela()) === false) return false
        if (this._cortado) return false
      }
      return true
    } finally {
      this.saltando = false
    }
  }

  // ── Controles ─────────────────────────────────────────────────────────────
  //
  // Diseño del loop de reproducción (v3 - rAF):
  // ─────────────────────────────────────────────────────────────────────────
  // El motor avanza `speed` velas M1 por segundo de tiempo real, pero
  // distribuye ese avance en frames de ~16ms (60fps) en vez de un único
  // salto cada 1000ms. Esto elimina los "martillazos" laterales que se
  // producían cuando speed=60 saltaba 60 velas M1 de golpe (= 1 vela H1
  // entera) cada segundo, haciendo que el último close cambiara
  // drásticamente entre frame y frame.
  //
  // Características clave:
  //   - Throughput idéntico al anterior: speed=N → N velas M1/segundo real.
  //   - El avance se calcula con delta-time real (`performance.now()`),
  //     así una pestaña en background (que rAF pausa) no acumula deuda
  //     ni produce un sprint al volver a foreground (clamp a 250ms).
  //   - Acumulador fraccional: cuando speed=1, cada frame añade ~0.016
  //     velas; cuando llega a 1.0 se avanza una vela y se conserva el
  //     resto. Así no se pierden velas por redondeo.
  //   - Si una pestaña se queda sin frames durante un rato, al volver
  //     se ejecuta como mucho 1 vela en ese frame (clamp 250ms) y el
  //     siguiente frame continúa normalmente — sin sprint visible.
  //   - onTick se llama en cada vela avanzada, igual que antes, así
  //     SLTP/limit checks se siguen ejecutando para cada M1.

  play() {
    if (this.isPlaying || this.saltando) return
    this.isPlaying = true
    this._fracAcc = 0
    this._lastFrameTs = null
    this._loop()
  }

  _loop() {
    if (!this.isPlaying) return
    this._rafId = (typeof requestAnimationFrame !== 'undefined')
      ? requestAnimationFrame(ts => this._tickFrame(ts))
      : setTimeout(() => this._tickFrame(performance.now()), 16)
  }

  _tickFrame(now) {
    if (!this.isPlaying) return
    if (this._lastFrameTs === null) {
      this._lastFrameTs = now
      this._loop()
      return
    }
    // Delta de tiempo real entre frames, clamped para evitar sprints
    // tras una pestaña en background o un breakpoint del debugger.
    const rawDelta = now - this._lastFrameTs
    const delta = Math.min(rawDelta, 250)  // 250ms = ~15 frames de margen
    this._lastFrameTs = now

    // velas-M1 a avanzar en este frame: speed × (delta/1000)
    this._fracAcc += this.speed * (delta / 1000)
    let stepsThisFrame = Math.floor(this._fracAcc)
    if (stepsThisFrame > 0) {
      this._fracAcc -= stepsThisFrame
      // Avanzamos vela a vela para que onTick (y por tanto SLTP/limit
      // checks) se ejecute con cada M1. nextCandle() devuelve false al
      // llegar al final, en cuyo caso el loop se autodetiene.
      while (stepsThisFrame-- > 0) {
        if (!this.nextCandle(1)) return
      }
    }
    this._loop()
  }

  pause() {
    if (this.saltando) this._cortado = true
    this.isPlaying = false
    this._clearTimers()
    this._lastFrameTs = null
    this._fracAcc = 0
  }

  setSpeed(speed) {
    this.speed = speed
    // No reseteamos el loop: el cambio de speed se aplica en el siguiente
    // frame de forma natural (this.speed se lee fresh cada frame). Esto
    // evita el parpadeo de pause+play que tenía la versión anterior.
  }

  reset() {
    this.pause()
    this._currentTime = this.candles[0]?.time ?? null
    this._aggCache = null
    if (this.onTick) this.onTick()
  }

  _clearTimers() {
    if (this._rafId != null) {
      try {
        if (typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(this._rafId)
        else clearTimeout(this._rafId)
      } catch {}
      this._rafId = null
    }
    // Compat: si una versión vieja de load() todavía referencia this.interval
    if (this.interval) { try { clearInterval(this.interval) } catch {}; this.interval = null }
  }

  // Compat alias — antes existía _clearInterval. Si algo externo lo llamara
  // (no debería, es interno), seguimos respondiendo correctamente.
  _clearInterval() { this._clearTimers() }
}

// Timeframes en minutos
const TIMEFRAMES = {
  M1: 1, M3: 3, M5: 5, M15: 15, M30: 30,
  H1: 60, H2: 120, H3: 180, H4: 240, D1: 1440, W1: 10080,
}

export { TIMEFRAMES }
export default ReplayEngine
