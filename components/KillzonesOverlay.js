import { useEffect, useRef, useState, useCallback } from 'react'
import { getSeriesData, getRealLen } from '../lib/sessionData'

// NY offset: EDT = UTC-4 (Mar-Nov), EST = UTC-5 (Nov-Mar)
function getNYOffset(utcTs) {
  const d = new Date(utcTs * 1000)
  const yr = d.getUTCFullYear()
  const dstStart = new Date(Date.UTC(yr, 2, 8 - new Date(Date.UTC(yr,2,1)).getUTCDay(), 7))
  const dstEnd   = new Date(Date.UTC(yr, 10, 1 - new Date(Date.UTC(yr,10,1)).getUTCDay(), 6))
  return d >= dstStart && d < dstEnd ? -4 : -5
}

function toNYHM(utcTs) {
  const off = getNYOffset(utcTs)
  const d = new Date((utcTs + off * 3600) * 1000)
  return { h: d.getUTCHours(), m: d.getUTCMinutes() }
}

function toMinutes(h, m) { return h * 60 + m }

const SESSIONS = [
  { key: 'asia',   label: 'Asia KZ',    hStart: 20, mStart: 0, hEnd: 0,  mEnd: 0,  bg: 'rgba(30,144,255,0.10)', border: 'rgba(30,144,255,0.55)', text: '#1E90FF', crossesMidnight: true },
  { key: 'london', label: 'Londres KZ', hStart: 2,  mStart: 0, hEnd: 5,  mEnd: 0,  bg: 'rgba(255,255,255,0.06)', border: 'rgba(220,220,220,0.4)', text: '#ffffff', crossesMidnight: false },
  { key: 'nyam',   label: 'NY AM KZ',   hStart: 7,  mStart: 0, hEnd: 10, mEnd: 0,  bg: 'rgba(255,255,255,0.06)', border: 'rgba(220,220,220,0.4)', text: '#ffffff', crossesMidnight: false },
  { key: 'nypm',   label: 'NY PM KZ',   hStart: 13, mStart: 30,hEnd: 16, mEnd: 0,  bg: 'rgba(255,255,255,0.06)', border: 'rgba(220,220,220,0.4)', text: '#ffffff', crossesMidnight: false },
]

const TF_LIST = ['M1','M3','M5','M15','M30','H1','H4','D1']

function inSession(nyH, nyM, sess) {
  const cur = toMinutes(nyH, nyM)
  if (sess.crossesMidnight) return cur >= toMinutes(sess.hStart, sess.mStart)
  return cur >= toMinutes(sess.hStart, sess.mStart) && cur < toMinutes(sess.hEnd, sess.mEnd)
}

function calcSessions(candles, cfg) {
  const boxes = []
  const active = {}

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i]
    const { h, m } = toNYHM(c.time)

    for (const sess of SESSIONS) {
      if (!cfg[sess.key]) continue
      const inside = inSession(h, m, sess)
      if (inside) {
        if (!active[sess.key]) {
          active[sess.key] = { startTime: c.time, endTime: c.time, high: c.high, low: c.low }
        } else {
          active[sess.key].endTime = c.time
          active[sess.key].high = Math.max(active[sess.key].high, c.high)
          active[sess.key].low  = Math.min(active[sess.key].low,  c.low)
        }
      } else {
        if (active[sess.key]) {
          boxes.push({ ...sess, ...active[sess.key] })
          delete active[sess.key]
        }
      }
    }
  }
  for (const sess of SESSIONS) {
    if (active[sess.key]) boxes.push({ ...sess, ...active[sess.key] })
  }

  return boxes
}

const DEF = {
  visible: true,
  asia: true, london: true, nyam: true, nypm: false,
  showLabel: true,
  history: 5,
  tfs: { M1: true, M3: true, M5: true, M15: true, M30: true, H1: true, H4: true, D1: false },
}

const STORAGE_KEY = 'killzones_cfg_v2'

function loadCfg() {
  if (typeof window === 'undefined') return DEF
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEF
    const parsed = JSON.parse(raw)
    return { ...DEF, ...parsed, tfs: { ...DEF.tfs, ...(parsed.tfs || {}) } }
  } catch {
    return DEF
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// KillzonesOverlay v4 — cached sessions + drag-aware redraw
// ─────────────────────────────────────────────────────────────────────────────
//
// MEJORAS RESPECTO A v3:
//
// 1. CACHE DE SESIONES (filtered): calcSessions() recorre TODAS las velas,
//    O(n × 4 sesiones). En M5/M1 con datasets largos, ejecutar eso en cada
//    frame de pan bloquea el hilo y se siente "no fluido". Ahora calcSessions
//    sólo se ejecuta cuando cambia realLen, dataReady o cfg. El draw() se
//    queda con un trabajo trivial: 4 conversiones por sesión visible.
//
// 2. DRAG VERTICAL DE LA ESCALA DE PRECIOS: lightweight-charts NO dispara
//    subscribeVisibleLogicalRangeChange cuando el usuario arrastra la escala
//    de precios (cambio vertical). Sólo lo dispara para horizontal.
//    Solución: mientras el botón del ratón está pulsado sobre el chart,
//    arrancar un loop de rAF que redibuja en cada frame. Al soltar, parar.
//    Esto cubre: drag horizontal, drag vertical, drag de escala de precios,
//    drag de escala de tiempo. Coste: ~16 lookups por frame durante drag,
//    insignificante.
//
// El resto de mejoras de v3 (canvas en lugar de divs, sin setState en
// el path crítico) se mantienen.
// ─────────────────────────────────────────────────────────────────────────────

export default function KillzonesOverlay({ chartMap, activePair, dataReady, currentTf, tick, chartTick, currentTime }) {
  const canvasRef                 = useRef(null)
  const [cfg, setCfg]             = useState(loadCfg)
  const [hovered, setHovered]     = useState(false)
  const [showPanel, setShowPanel] = useState(false)
  const panelRef                  = useRef(null)

  // Refs frescos
  const cfgRef         = useRef(cfg);         cfgRef.current = cfg
  const tfAllowed = !currentTf || cfg.tfs[currentTf] !== false
  const tfAllowedRef   = useRef(tfAllowed);   tfAllowedRef.current = tfAllowed
  const activePairRef  = useRef(activePair);  activePairRef.current = activePair
  const dataReadyRef   = useRef(dataReady);   dataReadyRef.current = dataReady

  // Cache de sesiones calculadas (logical coords: time/price). Se rellena
  // en un useEffect que depende de los datos, NO se recalcula en cada draw.
  const cachedSessionsRef = useRef([])

  // Persistir cfg
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg)) } catch {}
  }, [cfg])

  // Cerrar panel al click fuera
  useEffect(() => {
    if (!showPanel) return
    const fn = e => { if (panelRef.current && !panelRef.current.contains(e.target)) setShowPanel(false) }
    document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [showPanel])

  // Resize del canvas con devicePixelRatio
  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    const w = canvas.offsetWidth
    const h = canvas.offsetHeight
    canvas.width  = w * dpr
    canvas.height = h * dpr
    canvas.style.width  = w + 'px'
    canvas.style.height = h + 'px'
    const ctx = canvas.getContext('2d')
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }, [])

  // ── Recalcular sesiones cuando cambien datos/cfg/tick/currentTime ──────
  // Esta es la operación pesada: recorre todas las velas. Se hace 1 vez
  // por cambio de dataset/tick/cfg, NO en cada frame de pan.
  //
  // currentTime: bucketed a 30 min para que el replay (que avanza segundo
  // a segundo) no dispare un recálculo en cada vela M1, pero sí cuando
  // entre/salga de un horario de killzone (todas las KZ están alineadas a
  // intervalos de 30 min en hora NY). Esto cubre el caso de "estoy haciendo
  // replay y la sesión actual no aparece hasta que cambio de TF".
  const ctBucket = currentTime ? Math.floor(currentTime / 1800) : 0
  useEffect(() => {
    if (!cfg.visible || !tfAllowed || !dataReady || !activePair) {
      cachedSessionsRef.current = []
      return
    }
    const allData = getSeriesData()
    const realLen = getRealLen()
    if (!allData || !realLen) {
      cachedSessionsRef.current = []
      return
    }
    const candles = allData.slice(0, realLen)
    const sessions = calcSessions(candles, cfg)
    // Limitar a las N más recientes por tipo
    const counts = {}
    cachedSessionsRef.current = sessions.reverse().filter(s => {
      counts[s.key] = (counts[s.key] || 0) + 1
      return counts[s.key] <= cfg.history
    }).reverse()
  }, [cfg, tfAllowed, dataReady, activePair, tick, chartTick, ctBucket])

  // ── draw — solo lookup de coords y dibujo ─────────────────────────────
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.offsetWidth, canvas.offsetHeight)

    const c  = cfgRef.current
    const ap = activePairRef.current
    if (!c.visible || !tfAllowedRef.current || !dataReadyRef.current || !ap) return
    const cr = chartMap.current[ap]
    if (!cr?.chart || !cr?.series) return

    const sessions = cachedSessionsRef.current
    if (!sessions.length) return

    const ts = cr.chart.timeScale()
    for (const s of sessions) {
      let x1, x2, y1, y2
      try {
        x1 = ts.timeToCoordinate(s.startTime)
        x2 = ts.timeToCoordinate(s.endTime)
        y1 = cr.series.priceToCoordinate(s.high)
        y2 = cr.series.priceToCoordinate(s.low)
      } catch { continue }
      if (x1 == null || x2 == null || y1 == null || y2 == null) continue

      const left   = Math.min(x1, x2)
      const top    = Math.min(y1, y2)
      const width  = Math.abs(x2 - x1)
      const height = Math.max(Math.abs(y2 - y1), 1)
      if (width < 2) continue

      ctx.fillStyle = s.bg
      ctx.fillRect(left, top, width, height)

      ctx.strokeStyle = s.border
      ctx.lineWidth = 1
      ctx.setLineDash([4, 3])
      ctx.strokeRect(left + 0.5, top + 0.5, Math.max(width - 1, 0), Math.max(height - 1, 0))
      ctx.setLineDash([])

      if (c.showLabel && height > 14) {
        ctx.font = "700 9px 'Montserrat', sans-serif"
        ctx.fillStyle = s.text
        ctx.globalAlpha = 0.85
        ctx.textBaseline = 'bottom'
        ctx.fillText(s.label, left + 4, top + height - 2)
        ctx.globalAlpha = 1
      }
    }
  }, [chartMap])

  // ── Subscripciones al chart + listeners de mouse para drag vertical ────
  useEffect(() => {
    if (!activePair) return
    const cr = chartMap.current[activePair]
    if (!cr?.chart) return
    const tsApi = cr.chart.timeScale()

    resizeCanvas()
    draw()

    const ro = new ResizeObserver(() => { resizeCanvas(); draw() })
    if (canvasRef.current) ro.observe(canvasRef.current)

    // Handler síncrono — para cambios horizontales de range
    const handler = () => draw()
    let unsubA = null, unsubB = null
    try {
      tsApi.subscribeVisibleLogicalRangeChange(handler)
      unsubA = () => { try { tsApi.unsubscribeVisibleLogicalRangeChange(handler) } catch {} }
    } catch {}
    try {
      tsApi.subscribeSizeChange(handler)
      unsubB = () => { try { tsApi.unsubscribeSizeChange(handler) } catch {} }
    } catch {}

    // ── Drag-aware redraw ───────────────────────────────────────────────
    // Mientras el ratón esté pulsado sobre el chart, redibujamos en cada
    // frame. Esto captura cambios verticales (drag de escala de precios,
    // drag general del chart con cambio de price scale) que NO disparan
    // subscribeVisibleLogicalRangeChange.
    let dragRafId = null
    let dragging = false

    const dragLoop = () => {
      if (!dragging) { dragRafId = null; return }
      draw()
      dragRafId = requestAnimationFrame(dragLoop)
    }

    const chartEl = (() => {
      try { return cr.chart.chartElement() } catch { return null }
    })()

    const onMouseDown = (e) => {
      // Solo nos interesa drag con botón izquierdo y dentro del chart
      if (e.button !== 0) return
      if (!chartEl || !chartEl.contains(e.target)) return
      dragging = true
      if (dragRafId == null) dragRafId = requestAnimationFrame(dragLoop)
    }
    const onMouseUp = () => {
      dragging = false
      // Un draw final por si quedó algún frame por capturar
      draw()
    }

    // También wheel (zoom con rueda dispara el horizontal handler, pero
    // por si acaso forzamos un draw extra)
    const onWheel = () => { draw() }

    if (chartEl) {
      chartEl.addEventListener('mousedown', onMouseDown)
      chartEl.addEventListener('wheel', onWheel, { passive: true })
    }
    window.addEventListener('mouseup', onMouseUp)

    return () => {
      ro.disconnect()
      if (unsubA) unsubA()
      if (unsubB) unsubB()
      if (dragRafId != null) cancelAnimationFrame(dragRafId)
      if (chartEl) {
        chartEl.removeEventListener('mousedown', onMouseDown)
        chartEl.removeEventListener('wheel', onWheel)
      }
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [activePair, chartMap, dataReady, draw, resizeCanvas])

  // Redibujar cuando cambia config (no afecta posicionamiento, solo qué
  // se muestra y cómo se pinta)
  useEffect(() => { draw() }, [cfg, tfAllowed, draw])

  // Redibujar cuando cambia el tick (avance del replay → nuevas sesiones
  // ya están en el cache via el otro effect, aquí solo redibujamos)
  useEffect(() => { draw() }, [tick, draw])

  // Redibujar también conforme avanza el replay — esto hace que la sesión
  // activa "crezca" visualmente durante el replay. Bucket de 60s para no
  // saturar React a velocidades altas (∞ = 500 vel M1/seg). Visualmente,
  // un step de 1 minuto en una caja de killzone de varias horas es
  // imperceptible.
  const ctRedrawBucket = currentTime ? Math.floor(currentTime / 60) : 0
  useEffect(() => { draw() }, [ctRedrawBucket, draw])

  // ── UI ──────────────────────────────────────────────────────────────────
  const Toggle = ({ label, k }) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)' }}>{label}</span>
      <div onClick={() => setCfg(p => ({ ...p, [k]: !p[k] }))}
        style={{ width: 30, height: 17, borderRadius: 9, cursor: 'pointer', position: 'relative',
          background: cfg[k] ? '#2962FF' : 'rgba(255,255,255,0.15)', transition: 'background .2s' }}>
        <div style={{ position: 'absolute', top: 2.5, left: cfg[k] ? 14 : 3,
          width: 12, height: 12, borderRadius: '50%', background: '#fff', transition: 'left .2s' }} />
      </div>
    </div>
  )

  const TfChip = ({ tf }) => (
    <div onClick={() => setCfg(p => ({ ...p, tfs: { ...p.tfs, [tf]: !p.tfs[tf] } }))}
      style={{
        padding: '3px 7px', fontSize: 10, fontWeight: 600,
        borderRadius: 4, cursor: 'pointer', userSelect: 'none',
        background: cfg.tfs[tf] ? 'rgba(41,98,255,0.85)' : 'rgba(255,255,255,0.06)',
        color: cfg.tfs[tf] ? '#fff' : 'rgba(255,255,255,0.45)',
        border: cfg.tfs[tf] ? '1px solid rgba(41,98,255,0.9)' : '1px solid rgba(255,255,255,0.08)',
        transition: 'background .15s, color .15s',
      }}>
      {tf}
    </div>
  )

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 5, overflow: 'hidden' }}>

      {/* Capa 1: Canvas de cajas */}
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute', inset: 0,
          width: '100%', height: '100%',
          pointerEvents: 'none',
        }}
      />

      {/* Capa 2: Indicator label */}
      <div
        style={{
          position: 'absolute', top: 20, left: 6, pointerEvents: 'all',
          display: 'flex', alignItems: 'center', gap: 4,
          fontFamily: "'Montserrat',sans-serif", fontSize: 11,
          color: cfg.visible && tfAllowed ? 'rgba(255,255,255,0.82)' : 'rgba(255,255,255,0.35)',
          cursor: 'default', userSelect: 'none', whiteSpace: 'nowrap'
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => { if (!showPanel) setHovered(false) }}
      >
        <span style={{ fontWeight: 500, letterSpacing: 0.1 }}>Killzones</span>

        <span style={{ display: 'flex', alignItems: 'center', gap: 1,
          opacity: hovered || showPanel ? 1 : 0, transition: 'opacity .12s', marginLeft: 2 }}>

          <button title={cfg.visible ? 'Ocultar' : 'Mostrar'}
            onClick={() => setCfg(p => ({ ...p, visible: !p.visible }))}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '1px 3px',
              color: 'rgba(255,255,255,0.55)', display: 'flex', alignItems: 'center' }}>
            {cfg.visible
              ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
            }
          </button>

          <button title="Configuración" onClick={() => setShowPanel(p => !p)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '1px 3px',
              color: 'rgba(255,255,255,0.55)', display: 'flex', alignItems: 'center' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
            </svg>
          </button>
        </span>

        {showPanel && (
          <div ref={panelRef} style={{
            position: 'absolute', top: '100%', left: 0, marginTop: 4,
            background: 'rgba(10,14,26,0.97)', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 8, padding: '12px 14px', minWidth: 240,
            boxShadow: '0 8px 32px rgba(0,0,0,0.7)',
            backdropFilter: 'blur(20px)', zIndex: 200, pointerEvents: 'all'
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.4)',
              letterSpacing: 1, marginBottom: 12, textTransform: 'uppercase' }}>Killzones SMC</div>
            <Toggle label="Asia KZ  (20:00–00:00 NY)" k="asia" />
            <Toggle label="Londres KZ  (02:00–05:00 NY)" k="london" />
            <Toggle label="NY AM KZ  (07:00–10:00 NY)" k="nyam" />
            <Toggle label="NY PM KZ  (13:30–16:00 NY)" k="nypm" />
            <Toggle label="Etiquetas" k="showLabel" />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, marginBottom: 12 }}>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)' }}>Sesiones a mostrar</span>
              <input type="number" min={1} max={20} value={cfg.history}
                style={{ width: 46, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 4, color: '#fff', fontSize: 11, padding: '3px 6px',
                  fontFamily: "'Montserrat',sans-serif", outline: 'none', textAlign: 'right' }}
                onChange={e => setCfg(p => ({ ...p, history: Math.max(1, Math.min(20, +e.target.value || 1)) }))} />
            </div>

            <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 10, marginTop: 4 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.4)',
                letterSpacing: 1, marginBottom: 8, textTransform: 'uppercase' }}>Visible en</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {TF_LIST.map(tf => <TfChip key={tf} tf={tf} />)}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
