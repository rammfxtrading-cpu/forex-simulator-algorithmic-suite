/**
 * DrawingToolbar — Algorithmic Suite Forex Simulator
 * Píldora vertical flotante de herramientas de dibujo
 * Mismo liquid glass design que ReplayPill
 */
import { useState, useRef, useEffect, useCallback } from 'react'

const TOOLS = [
  { id: 'cursor',     label: 'Cursor',            icon: CursorIcon },
  { id: 'hline',      label: 'Línea horizontal',  icon: HLineIcon },
  { id: 'trendline',  label: 'Línea de tendencia',icon: TrendIcon },
  { id: 'rect',       label: 'Rectángulo',         icon: RectIcon },
  { id: 'fib',        label: 'Fibonacci',          icon: FibIcon },
]

export default function DrawingToolbar({ activeTool, onToolChange, onClear, drawingCount }) {
  const [pos, setPos] = useState({ x: 14, y: null })
  const dragRef = useRef(null)

  const onMouseDown = (e) => {
    if (e.target.tagName === 'BUTTON' || e.target.closest('button')) return
    const rect = e.currentTarget.getBoundingClientRect()
    dragRef.current = { offX: e.clientX - rect.left, offY: e.clientY - rect.top }
    const onMove = (ev) => setPos({ x: ev.clientX - dragRef.current.offX, y: ev.clientY - dragRef.current.offY })
    const onUp = () => {
      dragRef.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    e.preventDefault()
  }

  const pillStyle = {
    position: 'absolute',
    left: pos.x,
    ...(pos.y != null ? { top: pos.y } : { top: '50%', transform: 'translateY(-50%)' }),
    zIndex: 25,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
    background: 'rgba(255,255,255,0.10)',
    border: '1px solid rgba(255,255,255,0.22)',
    borderRadius: 14,
    padding: '10px 7px',
    cursor: 'grab',
    userSelect: 'none',
    backdropFilter: 'blur(40px) saturate(220%) brightness(1.1)',
    WebkitBackdropFilter: 'blur(40px) saturate(220%) brightness(1.1)',
    boxShadow: '0 8px 32px rgba(0,0,0,0.4),inset 0 1px 0 rgba(255,255,255,0.3),inset 0 -1px 0 rgba(0,0,0,0.1),0 0 0 0.5px rgba(255,255,255,0.1)',
  }

  return (
    <div style={pillStyle} onMouseDown={onMouseDown}>
      {TOOLS.map((tool, i) => (
        <div key={tool.id}>
          <button
            title={tool.label}
            onClick={() => onToolChange(tool.id)}
            style={{
              background: activeTool === tool.id ? 'rgba(41,98,255,0.5)' : 'rgba(255,255,255,0.06)',
              border: activeTool === tool.id ? '1px solid rgba(41,98,255,0.7)' : '1px solid rgba(255,255,255,0.1)',
              borderRadius: 8,
              color: '#fff',
              width: 30,
              height: 30,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
              transition: 'all 0.15s',
              fontFamily: "'Montserrat',sans-serif",
            }}
          >
            <tool.icon />
          </button>
          {i === 0 && (
            <div style={{ width: 20, height: 1, background: 'rgba(255,255,255,0.1)', margin: '4px auto' }} />
          )}
        </div>
      ))}

      {drawingCount > 0 && (
        <>
          <div style={{ width: 20, height: 1, background: 'rgba(255,255,255,0.1)', margin: '2px auto' }} />
          <button
            title="Borrar todo"
            onClick={onClear}
            style={{
              background: 'rgba(239,83,80,0.12)',
              border: '1px solid rgba(239,83,80,0.3)',
              borderRadius: 8,
              color: '#ef5350',
              width: 30,
              height: 30,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
            }}
          >
            <TrashIcon />
          </button>
        </>
      )}
    </div>
  )
}

// ── Drawing Canvas ────────────────────────────────────────────────────────────
export function DrawingCanvas({ activeTool, chartMap, activePair, dataReady, drawings, setDrawings }) {
  const canvasRef = useRef(null)
  const stateRef  = useRef({ drawing: false, start: null, current: null })

  const screenToChart = useCallback((clientX, clientY) => {
    const cr = chartMap.current[activePair]; if (!cr?.series) return null
    const canvas = canvasRef.current; if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    const x = clientX - rect.left
    const y = clientY - rect.top
    let price = null, time = null
    try { price = cr.series.coordinateToPrice(y) } catch {}
    try { time  = cr.chart.timeScale().coordinateToTime(x) } catch {}
    return { price, time, x, y }
  }, [activePair])

  const priceToY = useCallback((price) => {
    const cr = chartMap.current[activePair]; if (!cr?.series) return null
    try { return cr.series.priceToCoordinate(price) } catch { return null }
  }, [activePair])

  const timeToX = useCallback((time) => {
    const cr = chartMap.current[activePair]; if (!cr?.chart) return null
    try { return cr.chart.timeScale().timeToCoordinate(time) } catch { return null }
  }, [activePair])

  const redraw = useCallback(() => {
    const canvas = canvasRef.current; if (!canvas) return
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    drawings.forEach(d => drawShape(ctx, canvas, d))

    const st = stateRef.current
    if (st.drawing && st.start && st.current) {
      drawInProgress(ctx, canvas, st.start, st.current, activeTool)
    }
  }, [drawings, activeTool, priceToY, timeToX])

  function drawShape(ctx, canvas, d) {
    const color = d.color || 'rgba(255,255,255,0.7)'
    ctx.strokeStyle = color
    ctx.lineWidth = 1.5
    ctx.setLineDash([])

    if (d.type === 'hline') {
      const y = priceToY(d.price); if (y == null) return
      ctx.beginPath()
      ctx.moveTo(0, y); ctx.lineTo(canvas.width, y)
      ctx.stroke()
      ctx.fillStyle = 'rgba(3,8,16,0.85)'
      const label = d.price?.toFixed(5) || ''
      ctx.font = 'bold 9px Montserrat,sans-serif'
      const tw = ctx.measureText(label).width
      ctx.fillRect(canvas.width - tw - 14, y - 9, tw + 10, 16)
      ctx.fillStyle = color
      ctx.textAlign = 'right'
      ctx.fillText(label, canvas.width - 6, y + 4)
    }

    if (d.type === 'trendline') {
      const x1 = timeToX(d.t1), y1 = priceToY(d.p1)
      const x2 = timeToX(d.t2), y2 = priceToY(d.p2)
      if (x1 == null || y1 == null || x2 == null || y2 == null) return
      const slope = (y2 - y1) / ((x2 - x1) || 1)
      const yLeft  = y1 - slope * x1
      const yRight = y1 + slope * (canvas.width - x1)
      ctx.beginPath()
      ctx.moveTo(0, yLeft); ctx.lineTo(canvas.width, yRight)
      ctx.stroke()
      ctx.fillStyle = color
      ctx.beginPath(); ctx.arc(x1, y1, 3, 0, Math.PI * 2); ctx.fill()
      ctx.beginPath(); ctx.arc(x2, y2, 3, 0, Math.PI * 2); ctx.fill()
    }

    if (d.type === 'rect') {
      const x1 = timeToX(d.t1), y1 = priceToY(d.p1)
      const x2 = timeToX(d.t2), y2 = priceToY(d.p2)
      if (x1 == null || y1 == null || x2 == null || y2 == null) return
      ctx.fillStyle = 'rgba(41,98,255,0.07)'
      ctx.fillRect(x1, y1, x2 - x1, y2 - y1)
      ctx.strokeRect(x1, y1, x2 - x1, y2 - y1)
    }

    if (d.type === 'fib') {
      const x1 = timeToX(d.t1), y1 = priceToY(d.p1)
      const x2 = timeToX(d.t2), y2 = priceToY(d.p2)
      if (x1 == null || y1 == null || x2 == null || y2 == null) return
      const levels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1]
      const colors  = [
        'rgba(255,255,255,0.6)', 'rgba(30,144,255,0.8)', 'rgba(46,213,115,0.8)',
        'rgba(255,200,0,0.8)',   'rgba(46,213,115,0.8)', 'rgba(30,144,255,0.8)',
        'rgba(255,255,255,0.6)'
      ]
      const pRange = d.p1 - d.p2
      levels.forEach((lvl, i) => {
        const price = d.p2 + pRange * lvl
        const y = priceToY(price); if (y == null) return
        ctx.strokeStyle = colors[i]
        ctx.lineWidth = (lvl === 0 || lvl === 1) ? 1.5 : 1
        ctx.setLineDash((lvl === 0 || lvl === 1) ? [] : [5, 4])
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke()
        ctx.setLineDash([])
        ctx.fillStyle = colors[i]
        ctx.font = 'bold 8px Montserrat,sans-serif'
        ctx.textAlign = 'left'
        ctx.fillText(`${(lvl * 100).toFixed(1)}%  ${price.toFixed(5)}`, 52, y - 3)
      })
    }
  }

  function drawInProgress(ctx, canvas, start, current, tool) {
    ctx.strokeStyle = 'rgba(255,255,255,0.45)'
    ctx.lineWidth = 1.5
    ctx.setLineDash([6, 4])

    if (tool === 'hline') {
      ctx.beginPath()
      ctx.moveTo(0, current.y); ctx.lineTo(canvas.width, current.y)
      ctx.stroke()
    } else if (tool === 'trendline') {
      ctx.beginPath()
      ctx.moveTo(start.x, start.y); ctx.lineTo(current.x, current.y)
      ctx.stroke()
    } else if (tool === 'rect') {
      ctx.fillStyle = 'rgba(41,98,255,0.05)'
      ctx.fillRect(start.x, start.y, current.x - start.x, current.y - start.y)
      ctx.strokeRect(start.x, start.y, current.x - start.x, current.y - start.y)
    } else if (tool === 'fib') {
      ctx.beginPath()
      ctx.moveTo(start.x, start.y); ctx.lineTo(current.x, current.y)
      ctx.stroke()
    }
    ctx.setLineDash([])
  }

  // Resize
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return
    const parent = canvas.parentElement; if (!parent) return
    const ro = new ResizeObserver(() => {
      canvas.width  = parent.clientWidth
      canvas.height = parent.clientHeight
      redraw()
    })
    ro.observe(parent)
    canvas.width  = parent.clientWidth
    canvas.height = parent.clientHeight
    return () => ro.disconnect()
  }, [])

  // Redraw on drawings/scroll change
  useEffect(() => {
    redraw()
    const cr = chartMap.current[activePair]; if (!cr?.chart) return
    let u1, u2
    try {
      u1 = cr.chart.timeScale().subscribeVisibleLogicalRangeChange(redraw)
      u2 = cr.chart.subscribeCrosshairMove(redraw)
    } catch {}
    return () => { try { u1?.(); u2?.() } catch {} }
  }, [drawings, activeTool, redraw, activePair, dataReady])

  const isDrawingTool = activeTool !== 'cursor'

  const onMouseDown = useCallback((e) => {
    if (!isDrawingTool || e.button !== 0) return
    const pt = screenToChart(e.clientX, e.clientY); if (!pt) return
    stateRef.current = { drawing: true, start: pt, current: pt }
    e.stopPropagation()
  }, [isDrawingTool, screenToChart])

  const onMouseMove = useCallback((e) => {
    if (!stateRef.current.drawing) return
    const pt = screenToChart(e.clientX, e.clientY); if (!pt) return
    stateRef.current.current = pt
    redraw()
  }, [screenToChart, redraw])

  const onMouseUp = useCallback((e) => {
    if (!stateRef.current.drawing) return
    const { start } = stateRef.current
    const pt = screenToChart(e.clientX, e.clientY)
    stateRef.current = { drawing: false, start: null, current: null }
    if (!pt || !start) { redraw(); return }

    const id = `d${Date.now()}`
    let newD = null

    if (activeTool === 'hline') {
      newD = { id, type: 'hline', price: pt.price, color: 'rgba(255,255,255,0.75)' }
    } else if (activeTool === 'trendline') {
      if (Math.abs(pt.x - start.x) < 5) { redraw(); return }
      newD = { id, type: 'trendline', t1: start.time, p1: start.price, t2: pt.time, p2: pt.price, color: 'rgba(255,255,255,0.75)' }
    } else if (activeTool === 'rect') {
      if (Math.abs(pt.x - start.x) < 5) { redraw(); return }
      newD = { id, type: 'rect', t1: start.time, p1: start.price, t2: pt.time, p2: pt.price, color: 'rgba(41,98,255,0.85)' }
    } else if (activeTool === 'fib') {
      if (Math.abs(pt.x - start.x) < 5) { redraw(); return }
      newD = { id, type: 'fib', t1: start.time, p1: start.price, t2: pt.time, p2: pt.price }
    }

    if (newD) setDrawings(prev => [...prev, newD])
    redraw()
  }, [activeTool, screenToChart, setDrawings, redraw])

  return (
    <canvas
      ref={canvasRef}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 6,
        cursor: isDrawingTool ? 'crosshair' : 'default',
        pointerEvents: isDrawingTool ? 'auto' : 'none',
      }}
    />
  )
}

// ── Icons ─────────────────────────────────────────────────────────────────────
function CursorIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M4 2l16 11-7 1.5-4 8z"/></svg>
}
function HLineIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" fill="none"><line x1="2" y1="12" x2="22" y2="12"/><circle cx="2" cy="12" r="1.5" fill="currentColor"/><circle cx="22" cy="12" r="1.5" fill="currentColor"/></svg>
}
function TrendIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" fill="none"><line x1="3" y1="20" x2="21" y2="4"/><circle cx="3" cy="20" r="1.5" fill="currentColor"/><circle cx="21" cy="4" r="1.5" fill="currentColor"/></svg>
}
function RectIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" fill="none"><rect x="3" y="6" width="18" height="12" rx="1"/></svg>
}
function FibIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" fill="none"><line x1="2" y1="4" x2="22" y2="4"/><line x1="2" y1="9" x2="22" y2="9"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="16" x2="22" y2="16"/><line x1="2" y1="20" x2="22" y2="20"/></svg>
}
function TrashIcon() {
  return <svg width="13" height="13" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none"><polyline points="3,6 5,6 21,6"/><path d="M19,6l-1,14H6L5,6"/><path d="M10,11v6M14,11v6"/><path d="M9,6V4h6v2"/></svg>
}
