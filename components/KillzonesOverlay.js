import { useEffect, useState, useRef, useCallback } from 'react'

// NY offset: EDT = UTC-4 (Mar-Nov), EST = UTC-5 (Nov-Mar)
function getNYOffset(utcTs) {
  const d = new Date(utcTs * 1000)
  const yr = d.getUTCFullYear()
  // DST: 2nd Sunday March → 1st Sunday November
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

function inSession(nyH, nyM, sess) {
  const cur = toMinutes(nyH, nyM)
  if (sess.crossesMidnight) {
    // 20:00-00:00: from 20*60 to 24*60 (inclusive midnight treated as 0)
    return cur >= toMinutes(sess.hStart, sess.mStart)
  }
  return cur >= toMinutes(sess.hStart, sess.mStart) && cur < toMinutes(sess.hEnd, sess.mEnd)
}

function calcSessions(candles, cfg) {
  // Returns array of completed + current session boxes
  const boxes = [] // {key, label, startTime, endTime, high, low, bg, border, text}
  const active = {} // key -> {startTime, high, low}

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
  // Add any still-open sessions
  for (const sess of SESSIONS) {
    if (active[sess.key]) boxes.push({ ...sess, ...active[sess.key] })
  }

  return boxes
}

const DEF = { visible: true, asia: true, london: true, nyam: true, nypm: false, showLabel: true, history: 5 }

export default function KillzonesOverlay({ chartMap, activePair, tick, chartTick, dataReady }) {
  const debounceRef = useRef(null)
  const [boxes, setBoxes]       = useState([])
  const [cfg, setCfg]           = useState(DEF)
  const [hovered, setHovered]   = useState(false)
  const [showPanel, setShowPanel] = useState(false)
  const panelRef = useRef(null)

  useEffect(() => {
    if (!showPanel) return
    const fn = e => { if (panelRef.current && !panelRef.current.contains(e.target)) setShowPanel(false) }
    document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [showPanel])

  // Recalculate pixel coordinates on every animation frame during scroll
  const recalcPixels = useCallback(() => {
    const cr = chartMap.current[activePair]
    if (!cr?.chart || !cr?.series || !sessionsRef.current.length) return
    const ts = cr.chart.timeScale()
    const nb = []
    for (const s of sessionsRef.current) {
      try {
        const x1 = ts.timeToCoordinate(s.startTime)
        const x2 = ts.timeToCoordinate(s.endTime)
        const y1 = cr.series.priceToCoordinate(s.high)
        const y2 = cr.series.priceToCoordinate(s.low)
        if (x1 == null || x2 == null || y1 == null || y2 == null) continue
        const left = Math.min(x1, x2), width = Math.abs(x2 - x1)
        const top = Math.min(y1, y2), height = Math.abs(y2 - y1)
        if (width < 2 || height < 1) continue
        nb.push({ ...s, left, top, width, height })
      } catch {}
    }
    setBoxes(nb)
  }, [activePair, chartMap])

  // RAF loop during scroll
  useEffect(() => {
    const loop = () => {
      if (isScrollingRef.current) {
        recalcPixels()
        rafRef.current = requestAnimationFrame(loop)
      }
    }
    const cr = chartMap.current?.[activePair]
    if (!cr?.chart) return
    const onScroll = () => {
      isScrollingRef.current = true
      cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(loop)
      clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        isScrollingRef.current = false
        recalcPixels()
      }, 100)
    }
    try { cr.chart.timeScale().subscribeVisibleLogicalRangeChange(onScroll) } catch {}
    return () => {
      try { cr.chart.timeScale().unsubscribeVisibleLogicalRangeChange(onScroll) } catch {}
      cancelAnimationFrame(rafRef.current)
    }
  }, [activePair, chartMap, recalcPixels])

  useEffect(() => {
    if(debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
    if (!cfg.visible || !dataReady || !activePair) return setBoxes([])
    const cr = chartMap.current[activePair]
    if (!cr?.chart || !cr?.series) return
    const allData = window.__algSuiteSeriesData
    const realLen = window.__algSuiteRealDataLen
    if (!allData || !realLen) return

    const candles = allData.slice(0, realLen)
    const sessions = calcSessions(candles, cfg)

    // Keep only last N sessions per type
    const counts = {}
    const filtered = sessions.reverse().filter(s => {
      counts[s.key] = (counts[s.key] || 0) + 1
      return counts[s.key] <= cfg.history
    }).reverse()

    const ts = cr.chart.timeScale()
    const nb = []
    for (const s of filtered) {
      try {
        const x1 = ts.timeToCoordinate(s.startTime)
        const x2 = ts.timeToCoordinate(s.endTime)
        const y1 = cr.series.priceToCoordinate(s.high)
        const y2 = cr.series.priceToCoordinate(s.low)
        if (x1 == null || x2 == null || y1 == null || y2 == null) continue
        const left  = Math.min(x1, x2)
        const width = Math.abs(x2 - x1)
        const top   = Math.min(y1, y2)
        const height = Math.abs(y2 - y1)
        if (width < 2 || height < 1) continue
        nb.push({ ...s, left, top, width, height })
      } catch {}
    }
    sessionsRef.current = filtered
    recalcPixels()
    }, 50)
  }, [chartTick, dataReady, activePair, cfg, recalcPixels])
  // Note: tick updates on every engine tick — debounce is handled by React batching

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

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 5, overflow: 'hidden' }}>

      {/* Session boxes */}
      {boxes.map((b, i) => (
        <div key={b.key + b.startTime} style={{
          position: 'absolute', left: b.left, top: b.top,
          width: b.width, height: Math.max(b.height, 1),
          background: b.bg,
          border: `1px dashed ${b.border}`,
          boxSizing: 'border-box', pointerEvents: 'none'
        }}>
          {cfg.showLabel && b.height > 14 && (
            <span style={{
              position: 'absolute', left: 4, bottom: 2,
              fontSize: 9, fontWeight: 700, color: b.text,
              fontFamily: "'Montserrat',sans-serif", lineHeight: 1,
              opacity: 0.85, pointerEvents: 'none'
            }}>{b.label}</span>
          )}
        </div>
      ))}

      {/* Indicator label — TradingView style */}
      <div
        style={{
          position: 'absolute', top: 20, left: 6, pointerEvents: 'all',
          display: 'flex', alignItems: 'center', gap: 4,
          fontFamily: "'Montserrat',sans-serif", fontSize: 11,
          color: cfg.visible ? 'rgba(255,255,255,0.82)' : 'rgba(255,255,255,0.35)',
          cursor: 'default', userSelect: 'none', whiteSpace: 'nowrap'
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => { if (!showPanel) setHovered(false) }}
      >
        <span style={{ fontWeight: 500, letterSpacing: 0.1 }}>Killzones</span>

        <span style={{ display: 'flex', alignItems: 'center', gap: 1,
          opacity: hovered || showPanel ? 1 : 0, transition: 'opacity .12s', marginLeft: 2 }}>

          {/* Eye */}
          <button title={cfg.visible ? 'Ocultar' : 'Mostrar'}
            onClick={() => setCfg(p => ({ ...p, visible: !p.visible }))}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '1px 3px',
              color: 'rgba(255,255,255,0.55)', display: 'flex', alignItems: 'center' }}>
            {cfg.visible
              ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
            }
          </button>

          {/* Settings */}
          <button title="Configuración" onClick={() => setShowPanel(p => !p)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '1px 3px',
              color: 'rgba(255,255,255,0.55)', display: 'flex', alignItems: 'center' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
            </svg>
          </button>
        </span>

        {/* Settings panel */}
        {showPanel && (
          <div ref={panelRef} style={{
            position: 'absolute', top: '100%', left: 0, marginTop: 4,
            background: 'rgba(10,14,26,0.97)', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 8, padding: '12px 14px', minWidth: 220,
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
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)' }}>Sesiones a mostrar</span>
              <input type="number" min={1} max={20} value={cfg.history}
                style={{ width: 46, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 4, color: '#fff', fontSize: 11, padding: '3px 6px',
                  fontFamily: "'Montserrat',sans-serif", outline: 'none', textAlign: 'right' }}
                onChange={e => setCfg(p => ({ ...p, history: Math.max(1, Math.min(20, +e.target.value || 1)) }))} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
