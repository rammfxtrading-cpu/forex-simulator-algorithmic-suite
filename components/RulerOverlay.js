import { useEffect, useRef, useState, useCallback } from 'react'

// Format time duration like TradingView: "2d 19h 30m"
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

export default function RulerOverlay({ active, chartMap, activePair }) {
  const canvasRef = useRef(null)
  const stateRef  = useRef({ dragging: false, start: null, end: null })
  const [result, setResult] = useState(null)

  const getChart = useCallback(() => chartMap?.current?.[activePair], [chartMap, activePair])

  const coordsToData = useCallback((x, y) => {
    const cr = getChart()
    if (!cr?.series || !cr?.chart) return null
    try {
      const price = cr.series.coordinateToPrice(y)
      const logical = cr.chart.timeScale().coordinateToLogical(x)
      const data = window.__algSuiteSeriesData
      if (price == null || logical == null || !data?.length) return null
      const realLen = window.__algSuiteRealDataLen || data.length
      const idx = Math.max(0, Math.min(Math.round(logical), realLen - 1))
      const time = data[idx]?.time ?? null
      return { price, logical, time, idx, x, y }
    } catch { return null }
  }, [getChart])

  const draw = useCallback((start, end, isUp) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    if (!start || !end) return

    const x1 = Math.min(start.x, end.x)
    const y1 = Math.min(start.y, end.y)
    const x2 = Math.max(start.x, end.x)
    const y2 = Math.max(start.y, end.y)
    const w  = x2 - x1
    const h  = y2 - y1

    const color       = isUp ? '#26a69a' : '#ef5350'
    const fillAlpha   = isUp ? 'rgba(38,166,154,0.15)' : 'rgba(239,83,80,0.15)'
    const strokeAlpha = isUp ? 'rgba(38,166,154,0.8)'  : 'rgba(239,83,80,0.8)'

    // Fill
    ctx.fillStyle = fillAlpha
    ctx.fillRect(x1, y1, w, h)

    // Border
    ctx.strokeStyle = strokeAlpha
    ctx.lineWidth = 1
    ctx.setLineDash([])
    ctx.strokeRect(x1, y1, w, h)

    // Horizontal center line
    const midY = (start.y + end.y) / 2
    ctx.strokeStyle = strokeAlpha
    ctx.lineWidth = 1
    ctx.setLineDash([4, 3])
    ctx.beginPath(); ctx.moveTo(x1, midY); ctx.lineTo(x2, midY); ctx.stroke()

    // Vertical center line
    const midX = (start.x + end.x) / 2
    ctx.beginPath(); ctx.moveTo(midX, y1); ctx.lineTo(midX, y2); ctx.stroke()
    ctx.setLineDash([])

    // Arrow pointing right or left from end
    const arrowX = end.x > start.x ? x2 : x1
    const dir    = end.x > start.x ? 1 : -1
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.moveTo(arrowX + dir * 8, midY)
    ctx.lineTo(arrowX + dir * 2, midY - 4)
    ctx.lineTo(arrowX + dir * 2, midY + 4)
    ctx.closePath()
    ctx.fill()

    // Corner dots
    ctx.fillStyle = color
    ;[[x1,y1],[x2,y1],[x1,y2],[x2,y2]].forEach(([cx,cy]) => {
      ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI*2); ctx.fill()
    })
  }, [])

  const calcResult = useCallback((startData, endData, endClientX, endClientY) => {
    if (!startData || !endData) return null
    const isJpy     = activePair?.includes('JPY')
    const pipSize   = isJpy ? 0.01 : 0.0001
    const priceDiff = endData.price - startData.price
    const isUp      = priceDiff >= 0
    const pips      = Math.abs(priceDiff) / pipSize
    const pct       = startData.price !== 0 ? Math.abs(priceDiff / startData.price) * 100 : 0
    const bars      = Math.abs(endData.idx - startData.idx)
    const duration  = (startData.time && endData.time) ? Math.abs(endData.time - startData.time) : null
    const decimals  = isJpy ? 3 : 5
    return {
      priceDiff: priceDiff.toFixed(decimals),
      pips:      pips.toFixed(1),
      pct:       pct.toFixed(2),
      bars,
      duration:  duration ? formatDuration(duration) : null,
      isUp,
      clientX:   endClientX,
      clientY:   endClientY,
    }
  }, [activePair])

  useEffect(() => {
    if (!active) {
      setResult(null)
      stateRef.current = { dragging: false, start: null, end: null }
      const canvas = canvasRef.current
      if (canvas) canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height)
      return
    }

    const canvas = canvasRef.current
    if (!canvas) return

    const onMouseDown = (e) => {
      const rect = canvas.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      const data = coordsToData(x, y)
      stateRef.current = { dragging: true, start: { x, y, data }, end: null }
      setResult(null)
      canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height)
    }

    const onMouseMove = (e) => {
      if (!stateRef.current.dragging) return
      const rect = canvas.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      const data = coordsToData(x, y)
      stateRef.current.end = { x, y, data }
      const isUp = (data && stateRef.current.start?.data)
        ? data.price >= stateRef.current.start.data.price
        : true
      draw(stateRef.current.start, { x, y }, isUp)
      if (stateRef.current.start?.data && data) {
        setResult(calcResult(stateRef.current.start.data, data, e.clientX, e.clientY))
      }
    }

    const onMouseUp = (e) => {
      if (!stateRef.current.dragging) return
      stateRef.current.dragging = false
      const rect = canvas.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      const data = coordsToData(x, y)
      if (stateRef.current.start?.data && data) {
        setResult(calcResult(stateRef.current.start.data, data, e.clientX, e.clientY))
      }
    }

    canvas.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      canvas.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [active, coordsToData, draw, calcResult])

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

  const color = result?.isUp ? '#26a69a' : '#ef5350'

  return (
    <>
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute', inset: 0, zIndex: 20,
          width: '100%', height: '100%',
          pointerEvents: active ? 'all' : 'none',
          cursor: active ? 'crosshair' : 'default',
        }}
      />
      {result && active && (
        <div style={{
          position: 'fixed',
          left: result.clientX + 16,
          top:  result.clientY - 8,
          background: 'rgba(4,10,24,0.95)',
          border: `1px solid ${color}40`,
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
          <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: 11 }}>
            <span style={{ color: 'rgba(255,255,255,0.45)', marginRight: 4 }}>pips</span>
            {result.pips}
          </div>
          <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 10, marginTop: 2 }}>
            {result.bars} barras{result.duration ? `, ${result.duration}` : ''}
          </div>
        </div>
      )}
    </>
  )
}
