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
    this.pidiendo     = false   // SGR6-02: saltaA en su espera inicial (aun no «saltando»): para la pagina, ocupado
    this._pausas      = 0       // SIMGOTO5-01: cuantas veces se ha pausado; quien espera la mira antes y despues
    this.onPausa      = null    // el motor se ha parado solo (un cierre incierto): la pagina deja de mostrar «reproduciendo»
    this.saltando     = false   // avanzaHasta() en curso
    this.frontera     = null    // Play: () => null | Promise<boolean> (lib/sim/salto.js creaFrontera)
    this.bloqueado    = false   // la frontera dijo que el reto ya no esta activo: no se avanza mas (SIMGOTO3-02)
    this._esperando   = null    // Play: la frontera pendiente
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

  // Devuelve false al llegar al final. La ultima vela tambien pasa por onTick (SIMGOTO-02,
  // orden 1-083): antes se llegaba a ella sin onTick y su SL/TP no se miraba nunca.
  nextCandle(steps = null) {
    return this._avanza(steps).quedan
  }

  // procesada: se paso a una vela nueva con su onTick; quedan: hay mas velas despues
  _avanza(steps = null) {
    const s      = steps ?? this.speed
    const ultimo = this.candles.length - 1
    const idx    = Math.min(this.currentIndex + s, ultimo)
    const newTime = this.candles[idx]?.time ?? null

    if (newTime === null || newTime === this._currentTime) {
      this._currentTime = this.candles[ultimo]?.time ?? null
      this.pause()
      if (this.onEnd) this.onEnd()
      return { procesada: false, quedan: false }
    }

    this._currentTime = newTime
    if (this.onTick) this.onTick()
    if (idx >= ultimo) {
      this.pause()
      if (this.onEnd) this.onEnd()
      return { procesada: true, quedan: false }
    }
    return { procesada: true, quedan: true }
  }

  // ── Salto recorriendo el tramo (Go to; orden 1-080 del CTO) ─────────────
  // Avanza hasta `timestamp` VELA M1 A VELA M1, con su onTick en cada una (SL/TP,
  // pendientes, reglas del reto), como play(): nunca un solo onTick para todo el
  // tramo. Tras cada vela espera a trasVela() (lib/sim/salto.js: los cierres y el
  // estado del reto); un false, o un pause() durante el salto (breach, bloqueo),
  // lo para en esa vela. Mientras dura, `saltando` (el onTick no repinta el
  // grafico y play() no arranca). Devuelve true si llego.
  // Limites del tramo (SIMGOTO-03, orden 1-083): se procesan todas las velas con hora
  // <= timestamp y ninguna posterior, aunque el par tenga un hueco justo ahi; asi la
  // puesta al dia de un par nunca pasa del reloj maestro. La ultima vela del historico
  // se procesa y se espera como las demas (SIMGOTO-02).
  // antesDeVela (SIMGOTO4-01): null, una promesa que se espera ANTES de procesar la vela (un cierre en vuelo) o
  // false (un cierre incierto): no se avanza
  async avanzaHasta(timestamp, trasVela = null, antesDeVela = null) {
    // con la frontera del Play pendiente no se avanza: quien llama espera antes (saltaA, SGR4-01)
    if (this.saltando || this.bloqueado || this._esperando) return false
    this.pause()
    this.saltando = true
    this._cortado = false
    try {
      for (;;) {
        const sig = this.candles[this.currentIndex + 1]
        if (!sig || sig.time <= this._currentTime) return this._currentTime >= timestamp
        if (sig.time > timestamp) return true
        const antes = antesDeVela ? antesDeVela() : null
        if (antes === false) return false
        // SIMGOTO5-01: tras CADA espera, si hubo una pausa (un bloqueo, un cambio de par), no se sigue: lo mismo en
        // la espera inicial del salto y del Step (lib/sim/salto.js saltaA) y en el Play (_tickFrame: la pausa le quita isPlaying)
        if (antes) { const m = this._pausas; const v = await antes; if (v === 'plazo' || this._cortado || this._pausas !== m) return false; continue }
        const { procesada, quedan } = this._avanza(1)
        if (!procesada) return false
        // la frontera, SIEMPRE, tambien en la vela de una pausa (un breach): su economia se confirma antes
        // de devolver el control (SIMGOTO3-02, orden 1-090); si el reto ya no esta activo, el motor queda
        // bloqueado para Step, Play y Go to (this.bloqueado)
        const tv = trasVela ? await trasVela() : true
        if (tv === false) { this.bloqueado = true; return false }
        // orden 1-117: el plazo de la cola vencio en la frontera de esta vela: se para aqui, reanudable
        if (tv === 'plazo') return false
        // un pause() en el onTick (breach, bloqueo) corta; el del final no
        if (this._cortado && quedan) return false
        if (!quedan) return this._currentTime >= timestamp
        if (this._cortado) return false
      }
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
    if (this.isPlaying || this.saltando || this.bloqueado) return
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
    if (this._esperando) return   // la frontera economica sigue pendiente: su .then reanuda el bucle
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
        // SIMGOTO4-01: con un cierre en vuelo, se espera a la cola ANTES de la vela (como el Step y el salto)
        const antes = this.frontera?.antes ? this.frontera.antes() : null
        // un cierre incierto: el Play se para (y la pagina lo sabe por onPausa)
        if (antes === false) { this.pause(); if (this.onPausa) this.onPausa(); return }
        if (antes) {
          this._esperando = antes.then(v => {
            this._esperando = null
            // orden 1-117: el plazo de la cola vencio; parado y REANUDABLE (no bloqueado), y la pagina lo sabe
            if (v === 'plazo') { this.pause(); if (this.onPausa) this.onPausa(); return }
            this._lastFrameTs = null; this._fracAcc = 0
            this._loop()
          }, () => { this._esperando = null; this.pause() })
          return
        }
        if (!this.nextCandle(1)) return
        // la frontera economica (lib/sim/salto.js, SIMGOTO2-01): si la vela trajo algo, el Play espera a
        // los cierres y al reto antes de la siguiente, como el Step y el salto
        // Orden 1-124 (Ramon): false (el reto ya no esta activo: objetivo o breach) NO para el Play. El Play
        // solo lo para el alumno o el aviso del plazo; en un breach lo pausa useChallengeFlow, como en
        // produccion (f5b713b). El motor queda bloqueado para el Step y el Go to (sin cambio) y para un
        // Play nuevo, como la pagina, que con el reto terminado congela el replay (challengeLocked)
        const espera = this.frontera ? this.frontera() : null
        if (espera) {
          this._esperando = espera.then(sigue => {
            this._esperando = null
            if (sigue === false) this.bloqueado = true
            if (sigue === 'plazo') { this.pause(); if (this.onPausa) this.onPausa(); return }
            this._lastFrameTs = null; this._fracAcc = 0
            this._loop()
          }, () => { this._esperando = null; this.pause() })
          return
        }
      }
    }
    this._loop()
  }

  // ocupado: saltando (dentro de avanzaHasta) o pidiendo (saltaA, en su espera inicial). La pagina no arranca otro
  // avance encima y, al cambiar de par, lo pausa (y la pausa lo corta: SIMGOTO5-01)
  get ocupado() { return this.saltando || this.pidiendo }

  pause() {
    this._pausas++
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
