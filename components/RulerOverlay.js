import { useEffect, useRef, useState, useCallback } from 'react'
import { getSeriesData, getRealLen } from '../lib/sessionData'

function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return '0m'
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const parts = []
  if (d > 0) parts.push(`${d}d`)
  if (h > 0) parts.push(`${h}h`)
  if (m > 0 || parts.length === 0) parts.push(`${m}m`)
  return parts.join(' ')
}

export default function RulerOverlay({ active, onDeactivate, chartMap, activePair, chartTick }) {
  const canvasRef = useRef(null)
  const stateRef  = useRef({ phase: 'idle', start: null, end: null }) // phase: idle | measuring | fixed
  const [result, setResult] = useState(null)

  const getChart = useCallback(() => chartMap?.current?.[activePair], [chartMap, activePair])

  const coordsToData = useCallback((x, y) => {
    const cr = getChart()
    if (!cr?.series || !cr?.chart) return null
    try {
      const price   = cr.series.coordinateToPrice(y)
      const logical = cr.chart.timeScale().coordinateToLogical(x)
      const data    = getSeriesData()
      if (price == null || logical == null || !data?.length) return null
      const realLen = getRealLen() || data.length
      const idx     = Math.max(0, Math.min(Math.round(logical), realLen - 1))
      const time    = data[idx]?.time ?? null
      return { price, logical, time, idx, x, y }
    } catch { return null }
  }, [getChart])

  const draw = useCallback((start, end) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    if (!start || !end) return

    const isUp      = end.y < start.y  // lower y = higher price
    const color     = isUp ? '#1E90FF' : '#ef5350'
    const fillRgba  = isUp ? 'rgba(30,144,255,0.10)' : 'rgba(239,83,80,0.10)'

    const x1 = Math.min(start.x, end.x)
    const y1 = Math.min(start.y, end.y)
    const x2 = Math.max(start.x, end.x)
    const y2 = Math.max(start.y, end.y)
    const midY = (start.y + end.y) / 2

    // Fill
    ctx.fillStyle = fillRgba
    ctx.fillRect(x1, y1, x2 - x1, y2 - y1)

    // Border 1px solid
    ctx.strokeStyle = color
    ctx.lineWidth = 1
    ctx.setLineDash([])
    ctx.strokeRect(x1, y1, x2 - x1, y2 - y1)

    // Horizontal center line
    ctx.setLineDash([4, 3])
    ctx.beginPath(); ctx.moveTo(x1, midY); ctx.lineTo(x2, midY); ctx.stroke()

    // Vertical center line
    const midX = (start.x + end.x) / 2
    ctx.beginPath(); ctx.moveTo(midX, y1); ctx.lineTo(midX, y2); ctx.stroke()
    ctx.setLineDash([])

    // Arrow at end
    const arrowX = end.x > start.x ? x2 : x1
    const dir    = end.x > start.x ? 1 : -1
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.moveTo(arrowX + dir * 7, midY)
    ctx.lineTo(arrowX + dir * 2, midY - 4)
    ctx.lineTo(arrowX + dir * 2, midY + 4)
    ctx.closePath()
    ctx.fill()

    // Corner dots
    ;[[x1,y1],[x2,y1],[x1,y2],[x2,y2]].forEach(([cx,cy]) => {
      ctx.beginPath(); ctx.arc(cx, cy, 2.5, 0, Math.PI*2); ctx.fill()
    })
  }, [])

  const calcResult = useCallback((startData, endData, clientX, clientY) => {
    if (!startData || !endData) return null
    const isJpy     = activePair?.includes('JPY')
    const pipSize   = isJpy ? 0.01 : 0.0001
    const priceDiff = endData.price - startData.price
    const isUp      = priceDiff >= 0
    const pips      = Math.abs(priceDiff) / pipSize
    const pct       = startData.price !== 0 ? Math.abs(priceDiff / startData.price) * 100 : 0
    const bars      = Math.abs(endData.idx - startData.idx)
    const duration  = (startData.time && endData.time) ? Math.abs(endData.time - startData.time) : null
    return {
      priceDiff: priceDiff.toFixed(isJpy ? 3 : 5),
      pips:      pips.toFixed(1),
      pct:       pct.toFixed(2),
      bars,
      duration:  duration ? formatDuration(duration) : null,
      isUp,
      clientX,
      clientY,
    }
  }, [activePair])

  // Clear everything
  const reset = useCallback(() => {
    stateRef.current = { phase: 'idle', start: null, end: null }
    setResult(null)
    const canvas = canvasRef.current
    if (canvas) canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height)
  }, [])

  useEffect(() => {
    if (!active) { reset(); return }

    const canvas = canvasRef.current
    if (!canvas) return

    const onMouseDown = (e) => {
      if (e.button !== 0) return
      const phase = stateRef.current.phase
      if (phase === 'fixed') {
        // Click while fixed → dismiss
        reset()
        if (onDeactivate) onDeactivate()
        return
      }
      // Start measuring
      const rect = canvas.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      const data = coordsToData(x, y)
      stateRef.current = { phase: 'measuring', start: { x, y, data }, end: null }
      setResult(null)
      canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height)
    }

    const onMouseMove = (e) => {
      if (stateRef.current.phase !== 'measuring') return
      const rect = canvas.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      const data = coordsToData(x, y)
      stateRef.current.end = { x, y, data }
      draw(stateRef.current.start, { x, y })
      if (stateRef.current.start?.data && data) {
        setResult(calcResult(stateRef.current.start.data, data, e.clientX, e.clientY))
      }
    }

    const onMouseUp = (e) => {
      if (stateRef.current.phase !== 'measuring') return
      const rect = canvas.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      const data = coordsToData(x, y)
      const start = stateRef.current.start
      // If barely moved → dismiss (was just a click, not a drag)
      const dx = x - (start?.x || 0)
      const dy = y - (start?.y || 0)
      if (Math.sqrt(dx*dx + dy*dy) < 5) {
        reset()
        if (onDeactivate) onDeactivate()
        return
      }
      stateRef.current.phase = 'fixed'
      if (start?.data && data) {
        setResult(calcResult(start.data, data, e.clientX, e.clientY))
      }
    }

    canvas.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup',   onMouseUp)
    return () => {
      canvas.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup',   onMouseUp)
    }
  }, [active, coordsToData, draw, calcResult, reset, onDeactivate])

  // ── Reset on chartTick — comportamiento TradingView ──
  // La regla es medición transitoria. Al cambiar TF (señal vía contrato
  // chartTick), si la regla estaba fija, se resetea y la herramienta se
  // desactiva. El usuario vuelve a cursor.
  useEffect(() => {
    if (stateRef.current.phase !== 'fixed') return
    reset()
    if (onDeactivate) onDeactivate()
  }, [chartTick, reset, onDeactivate])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ro = new ResizeObserver(() => {
      canvas.width  = canvas.offsetWidth
      canvas.height = canvas.offsetHeight
    })
    ro.observe(canvas)
    return () => ro.disconnect()
  }, [])

  const color = result?.isUp ? '#1E90FF' : '#ef5350'

  return (
    <>
      <canvas ref={canvasRef} style={{
        position: 'absolute', inset: 0, zIndex: 20,
        width: '100%', height: '100%',
        pointerEvents: active ? 'all' : 'none',
        cursor: active ? 'crosshair' : 'default',
      }}/>
      {result && active && (
        <div style={{
          position: 'fixed',
          left: result.clientX + 16,
          top:  result.clientY - 8,
          background: 'rgba(4,10,24,0.95)',
          border: `1px solid ${color}50`,
          borderLeft: `3px solid ${color}`,
          borderRadius: 6,
          padding: '7px 12px',
          zIndex: 100,
          fontFamily: "'Montserrat',sans-serif",
          fontSize: 11,
          color: '#fff',
          pointerEvents: 'none',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          boxShadow: '0 4px 24px rgba(0,0,0,0.6)',
          lineHeight: 1.8,
          minWidth: 130,
          whiteSpace: 'nowrap',
        }}>
          <div style={{ color, fontWeight: 700, fontSize: 12 }}>
            {result.isUp ? '▲' : '▼'} {result.priceDiff} ({result.pct}%)
          </div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.85)' }}>
            <span style={{ color: 'rgba(255,255,255,0.4)', marginRight: 4 }}>pips</span>{result.pips}
          </div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>
            {result.bars} barras{result.duration ? `, ${result.duration}` : ''}
          </div>
        </div>
      )}
    </>
  )
}
