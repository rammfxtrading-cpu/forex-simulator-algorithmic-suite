/**
 * CustomDrawingsOverlay.js - Canvas renderer for custom drawings
 * Event-driven rendering — no RAF loop
 * Renders on: drawings change, visible range change
 */
import { useEffect, useRef, useCallback } from 'react'
import { toScreenCoords } from '../lib/chartCoords'
import { DRAWING_TYPES } from './useCustomDrawings'

const FONT = "'Montserrat', sans-serif"

function drawText(ctx, drawing, coords) {
  const { x, y } = coords[0]
  const text = drawing.metadata?.text || ''
  if (!text) return
  const fontSize = drawing.metadata?.fontSize || 12
  ctx.font = `${fontSize}px ${FONT}`
  const metrics = ctx.measureText(text)
  const pad = 6
  const w = metrics.width + pad * 2
  const h = fontSize + pad * 2

  ctx.fillStyle = 'rgba(4,10,24,0.85)'
  ctx.beginPath()
  if (ctx.roundRect) ctx.roundRect(x - pad, y - h + pad, w, h, 4)
  else ctx.rect(x - pad, y - h + pad, w, h)
  ctx.fill()

  ctx.strokeStyle = 'rgba(30,144,255,0.6)'
  ctx.lineWidth = 1
  ctx.stroke()

  ctx.fillStyle = 'rgba(30,144,255,0.8)'
  ctx.beginPath()
  ctx.arc(x, y, 3, 0, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = drawing.metadata?.color || '#ffffff'
  ctx.fillText(text, x, y - pad / 2)
}

function drawRuler(ctx, drawing, coords) {
  if (coords.length < 2) return
  const [p1, p2] = coords
  const x1 = Math.min(p1.x, p2.x), y1 = Math.min(p1.y, p2.y)
  const x2 = Math.max(p1.x, p2.x), y2 = Math.max(p1.y, p2.y)

  ctx.fillStyle = 'rgba(30,144,255,0.08)'
  ctx.fillRect(x1, y1, x2 - x1, y2 - y1)

  ctx.strokeStyle = 'rgba(30,144,255,0.8)'
  ctx.lineWidth = 1.5
  ctx.setLineDash([4, 3])
  ctx.strokeRect(x1, y1, x2 - x1, y2 - y1)
  ctx.setLineDash([])

  ctx.fillStyle = '#1E90FF'
  ;[[x1,y1],[x2,y1],[x1,y2],[x2,y2]].forEach(([cx,cy]) => {
    ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI * 2); ctx.fill()
  })

  const pips = drawing.metadata?.pips || '0'
  const candles = drawing.metadata?.candles || '0'
  const direction = drawing.metadata?.direction || ''
  const label = `${direction} ${pips} pips · ${candles} velas`
  ctx.font = `600 10px ${FONT}`
  const lw = ctx.measureText(label).width
  const lx = x1 + (x2 - x1) / 2 - lw / 2
  const ly = y1 - 8

  ctx.fillStyle = 'rgba(4,10,24,0.9)'
  ctx.beginPath()
  if (ctx.roundRect) ctx.roundRect(lx - 6, ly - 12, lw + 12, 18, 4)
  else ctx.rect(lx - 6, ly - 12, lw + 12, 18)
  ctx.fill()
  ctx.strokeStyle = 'rgba(30,144,255,0.8)'
  ctx.lineWidth = 1
  ctx.stroke()
  ctx.fillStyle = direction === '▲' ? '#26a69a' : '#ef5350'
  ctx.fillText(label, lx, ly)
}

export default function CustomDrawingsOverlay({ drawings, chartMap, activePair, tfKey }) {
  const canvasRef = useRef(null)
  const crRef = useRef(null)
  const unsubRef = useRef(null)

  const render = useCallback(() => {
    const canvas = canvasRef.current
    const cr = chartMap?.current?.[activePair]
    if (!canvas || !cr) return
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    for (const drawing of drawings) {
      const coords = drawing.points.map(p => toScreenCoords(cr, p.time, p.price)).filter(Boolean)
      if (!coords.length) continue
      try {
        // TEXT is rendered as DOM div in _SessionInner.js
      // if (drawing.type === DRAWING_TYPES.TEXT)  drawText(ctx, drawing, coords)
        if (drawing.type === DRAWING_TYPES.RULER) drawRuler(ctx, drawing, coords)
      } catch {}
    }
  }, [drawings, chartMap, activePair])

  // Subscribe to chart visible range changes — event-driven, no RAF
  useEffect(() => {
    const cr = chartMap?.current?.[activePair]
    if (!cr?.chart) return
    crRef.current = cr
    // Unsubscribe previous listener
    if (unsubRef.current) { try { unsubRef.current() } catch {} }
    const handler = () => render()
    cr.chart.timeScale().subscribeVisibleLogicalRangeChange(handler)
    unsubRef.current = () => {
      try { cr.chart.timeScale().unsubscribeVisibleLogicalRangeChange(handler) } catch {}
    }
    render()
    return () => { if (unsubRef.current) unsubRef.current() }
  }, [activePair, chartMap, render])

  // Also render when drawings change
  useEffect(() => { render() }, [drawings, render, tfKey])

  // Resize canvas with devicePixelRatio for sharp text
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ro = new ResizeObserver(() => {
      const dpr = window.devicePixelRatio || 1
      canvas.width = canvas.offsetWidth * dpr
      canvas.height = canvas.offsetHeight * dpr
      canvas.style.width = canvas.offsetWidth + 'px'
      canvas.style.height = canvas.offsetHeight + 'px'
      const ctx = canvas.getContext('2d')
      ctx.scale(dpr, dpr)
      render()
    })
    ro.observe(canvas)
    return () => ro.disconnect()
  }, [render])

  const hoveredId = useRef(null)

  const onMouseMove = useCallback((e) => {
    const canvas = canvasRef.current
    const cr = chartMap?.current?.[activePair]
    if (!canvas || !cr) return
    const rect = canvas.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    let found = false
    for (const drawing of drawings) {
      if (drawing.type !== 'text') continue
      const coords = drawing.points.map(p => toScreenCoords(cr, p.time, p.price)).filter(Boolean)
      if (!coords.length) continue
      const { x, y } = coords[0]
      const text = drawing.metadata?.text || ''
      const fontSize = drawing.metadata?.fontSize || 12
      const textW = text.length * fontSize * 0.6 + 12
      if (mx >= x - 6 && mx <= x + textW && my >= y - fontSize - 6 && my <= y + 6) {
        canvas.style.cursor = 'pointer'
        found = true
        if (hoveredId.current !== drawing.id) {
          hoveredId.current = drawing.id
          render()
        }
        break
      }
    }
    if (!found) {
      canvas.style.cursor = 'default'
      if (hoveredId.current !== null) {
        hoveredId.current = null
        render()
      }
    }
  }, [drawings, chartMap, activePair, render])

  return (
    <canvas
      ref={canvasRef}
      onMouseMove={onMouseMove}
      style={{
        position: 'absolute', inset: 0,
        width: '100%', height: '100%',
        pointerEvents: 'none',
        zIndex: 19,
        cursor: 'default',
      }}
    />
  )
}
