// components/KillzonesPrimitive.js — Fase 5g
// Migración Opción C: primitive custom directo implementando ISeriesPrimitive
// nativo LWC 5.1.0. Elimina estructuralmente S33.4 (race scale X barSpacing
// stale) porque la conversión coords se hace dentro del pipeline LWC con
// scale fresh garantizado en cada frame.
//
// API consumer:
//   const kp = new KillzonesPrimitive()
//   series.attachPrimitive(kp)
//   kp.setSessions(sessions, currentTime, showLabel)  // dispara redibujado
//   series.detachPrimitive(kp)                         // en unmount

import { getSeriesData, getRealLen } from '../lib/sessionData'
import { SESSIONS, toNYHM, inSession } from '../lib/killzonesDomain'

// ─────────────────────────────────────────────────────────────────────────────
// KillzonesRenderer — implementa IPrimitivePaneRenderer
// ─────────────────────────────────────────────────────────────────────────────

class KillzonesRenderer {
  constructor(data, showLabel) {
    this._data = data || []
    this._showLabel = showLabel
  }

  draw(target) {
    if (this._data.length === 0) return

    target.useBitmapCoordinateSpace((scope) => {
      const ctx = scope.context
      const hpr = scope.horizontalPixelRatio
      const vpr = scope.verticalPixelRatio

      // Patrón DPR correction para crispness sub-pixel (extraído de
      // MarkersPrimitiveRenderer LWC oficial L15614-L15615 v5.1.0).
      // DPR=1 → correction=0.5, DPR=2 → correction=0, DPR=3 → correction=0.5
      const tickWidth = Math.max(1, Math.floor(hpr))
      const correction = (tickWidth % 2) / 2

      for (const b of this._data) {
        // Conversión CSS → bitmap pixels
        const x1 = Math.round(b.x1 * hpr)
        const y1 = Math.round(b.y1 * vpr)
        const x2 = Math.round(b.x2 * hpr)
        const y2 = Math.round(b.y2 * vpr)
        const left = Math.min(x1, x2)
        const top  = Math.min(y1, y2)
        const width  = Math.abs(x2 - x1)
        const height = Math.max(Math.abs(y2 - y1), 1)

        // Culling (preservado de KillzonesOverlay L272 actual, escalado bitmap)
        if (width < 2 * hpr) continue

        // ─── Background fill ─────────────────────────────────────────────
        ctx.fillStyle = b.bg
        ctx.fillRect(left, top, width, height)

        // ─── Border dashed [4, 3] DPR-aware ──────────────────────────────
        ctx.strokeStyle = b.border
        ctx.lineWidth = tickWidth
        ctx.setLineDash([4 * hpr, 3 * hpr])
        ctx.strokeRect(
          left + correction,
          top + correction,
          Math.max(width - tickWidth, 0),
          Math.max(height - tickWidth, 0)
        )
        ctx.setLineDash([])

        // ─── Label condicional ───────────────────────────────────────────
        if (this._showLabel && height > 14 * vpr) {
          ctx.font = `700 ${Math.round(9 * vpr)}px 'Montserrat', sans-serif`
          ctx.fillStyle = b.text
          ctx.globalAlpha = 0.85
          ctx.textBaseline = 'bottom'
          ctx.fillText(
            b.label,
            left + 4 * hpr,
            top + height - 2 * vpr
          )
          ctx.globalAlpha = 1
        }
      }
    })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper S33.3 KZ activa endpoint vivo (extraído de KillzonesOverlay draw L215-L249)
// ─────────────────────────────────────────────────────────────────────────────
//
// Preserva al carácter la lógica original:
// 1. Identifica la sesión cuya ventana NY contiene currentTime
// 2. Matchea por key con la box más reciente de cache
// 3. Recalcula liveHigh/liveLow iterando velas desde el final hacia atrás
//    rompiendo al salir del rango temporal de la KZ activa
//
// Retorna { activeSession, liveHigh, liveLow, lastRealTs } — todos null
// si no hay KZ activa o si falta data.

function computeActiveSession(sessions, currentTime) {
  if (!currentTime) return { activeSession: null, liveHigh: null, liveLow: null, lastRealTs: null }

  const allData = getSeriesData()
  const realLen = getRealLen()
  const lastRealTs = (allData && realLen) ? allData[realLen - 1].time : null
  if (!lastRealTs) return { activeSession: null, liveHigh: null, liveLow: null, lastRealTs: null }

  const { h: nyH, m: nyM } = toNYHM(currentTime)
  let activeKey = null
  for (const sess of SESSIONS) {
    if (inSession(nyH, nyM, sess)) { activeKey = sess.key; break }
  }
  if (!activeKey) return { activeSession: null, liveHigh: null, liveLow: null, lastRealTs }

  let activeSession = null
  for (const s of sessions) {
    if (s.key === activeKey && (!activeSession || s.endTime > activeSession.endTime)) activeSession = s
  }
  if (!activeSession) return { activeSession: null, liveHigh: null, liveLow: null, lastRealTs }

  let liveHigh = null, liveLow = null
  for (let i = realLen - 1; i >= 0; i--) {
    const c = allData[i]
    if (c.time < activeSession.startTime) break
    if (c.time > lastRealTs) continue
    if (liveHigh == null || c.high > liveHigh) liveHigh = c.high
    if (liveLow == null || c.low < liveLow) liveLow = c.low
  }

  return { activeSession, liveHigh, liveLow, lastRealTs }
}

// ─────────────────────────────────────────────────────────────────────────────
// KillzonesPaneView — implementa IPrimitivePaneView
// ─────────────────────────────────────────────────────────────────────────────

class KillzonesPaneView {
  constructor(primitive) {
    this._primitive = primitive
    this._data = []
    this._showLabel = true
  }

  renderer() {
    // Nueva instancia cada call (patrón canónico LWC oficial — ver
    // TextWatermarkPaneView L14530 + MarkersPrimitivePaneView L15681).
    return new KillzonesRenderer(this._data, this._showLabel)
  }

  zOrder() {
    return 'bottom'  // typings L4747-L4749: "Draw below everything except the background"
  }

  _update(sessions, currentTime, showLabel) {
    this._showLabel = showLabel

    const chart = this._primitive._chart
    const series = this._primitive._series
    if (!chart || !series || !sessions || sessions.length === 0) {
      this._data = []
      return
    }
    const timeScale = chart.timeScale()

    // S33.3 — KZ activa endpoint vivo
    const { activeSession, liveHigh, liveLow, lastRealTs } = computeActiveSession(sessions, currentTime)

    this._data = sessions.map(s => {
      const isActive = (s === activeSession)
      const endTs = (isActive && lastRealTs != null && lastRealTs > s.endTime) ? lastRealTs : s.endTime
      const sHigh = (isActive && liveHigh != null) ? liveHigh : s.high
      const sLow  = (isActive && liveLow  != null) ? liveLow  : s.low

      // Conversión coords — LWC garantiza scale fresh aquí
      const y1 = series.priceToCoordinate(sHigh)
      const y2 = series.priceToCoordinate(sLow)
      if (y1 == null || y2 == null) return null

      const x1 = timeScale.timeToCoordinate(s.startTime)
      const x2 = timeScale.timeToCoordinate(endTs)
      if (x1 == null || x2 == null) return null

      return {
        x1, y1, x2, y2,
        bg: s.bg,
        border: s.border,
        text: s.text,
        label: s.label,
      }
    }).filter(b => b !== null)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// KillzonesPrimitive — implementa ISeriesPrimitive (clase principal)
// ─────────────────────────────────────────────────────────────────────────────

export class KillzonesPrimitive {
  constructor() {
    this._sessions = []
    this._currentTime = null
    this._showLabel = true
    this._paneViewsArray = [new KillzonesPaneView(this)]  // ref estable (perf hint typings L2611)
    this._chart = null
    this._series = null
    this._requestUpdate = null
  }

  // ─── ISeriesPrimitive API ──────────────────────────────────────────────

  attached({ chart, series, requestUpdate }) {
    this._chart = chart
    this._series = series
    this._requestUpdate = requestUpdate
  }

  detached() {
    this._chart = null
    this._series = null
    this._requestUpdate = null
  }

  paneViews() {
    return this._paneViewsArray  // misma ref siempre
  }

  updateAllViews() {
    // LWC invoca este método cuando consumer llama requestUpdate() o cuando
    // el chart repinta por cualquier razón interna (resize/pan/zoom/drag).
    // Scale fresh garantizado aquí.
    this._paneViewsArray.forEach(pv => pv._update(this._sessions, this._currentTime, this._showLabel))
  }

  // ─── API consumer-side ─────────────────────────────────────────────────

  setSessions(sessions, currentTime, showLabel) {
    this._sessions = sessions || []
    this._currentTime = currentTime
    this._showLabel = showLabel !== false
    this._requestUpdate?.()
  }
}
