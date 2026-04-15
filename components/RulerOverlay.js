import { useEffect, useRef, useState, useCallback } from 'react'

export default function RulerOverlay({ active, chartMap, activePair, onDone }) {
  const canvasRef = useRef(null)
  const stateRef  = useRef({ dragging: false, start: null, end: null })
  const [result, setResult] = useState(null) // {pips, candles, x, y}

  const getChart = useCallback(() => chartMap?.current?.[activePair], [chartMap, activePair])

  const coordsToData = useCallback((x, y) => {
    const cr = getChart()
    if (!cr?.series || !cr?.chart) return null
    try {
      const price = cr.series.coordinateToPrice(y)
      const logical = cr.chart.timeScale().coordinateToLogical(x)
      const data = window.__algSuiteSeriesData
      if (price == null || logical == null || !data?.length) return null
      const idx = Math.max(0, Math.min(Math.round(logical), data.length - 1))
      const time = data[idx]?.time
      return { price, logical, time, idx }
    } catch { return null }
  }, [getChart])

  const draw = useCallback((start, end) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    if (!start || !end) return

    const x1 = Math.min(start.x, end.x)
    const y1 = Math.min(start.y, end.y)
    const x2 = Math.max(start.x, end.x)
    const y2 = Math.max(start.y, end.y)
    const w = x2 - x1
    const h = y2 - y1

    // Rectangle fill
    ctx.fillStyle = 'rgba(30,144,255,0.08)'
    ctx.fillRect(x1, y1, w, h)

    // Border
    ctx.strokeStyle = 'rgba(30,144,255,0.7)'
    ctx.lineWidth = 1.5
    ctx.setLineDash([4, 3])
    ctx.strokeRect(x1, y1, w, h)
    ctx.setLineDash([])

    // Corner dots
    ctx.fillStyle = '#1E90FF'
    ;[[x1,y1],[x2,y1],[x1,y2],[x2,y2]].forEach(([cx,cy]) => {
      ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI*2); ctx.fill()
    })
  }, [])

  const calcResult = useCallback((startData, endData, endScreenX, endScreenY) => {
    if (!startData || !endData) return null
    const pipSize = activePair?.includes('JPY') ? 0.01 : 0.0001
    const pips = Math.abs(startData.price - endData.price) / pipSize
    const candles = Math.abs(startData.idx - endData.idx)
    const direction = endData.price > startData.price ? '▲' : '▼'
    return {
      pips: pips.toFixed(1),
      candles,
      direction,
      x: endScreenX,
      y: endScreenY,
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
      if (!active) return
      const rect = canvas.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      const data = coordsToData(x, y)
      stateRef.current = { dragging: true, start: { x, y, data }, end: null }
      setResult(null)
    }

    const onMouseMove = (e) => {
      if (!stateRef.current.dragging) return
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

  // Resize canvas to match container
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ro = new ResizeObserver(() => {
      canvas.width = canvas.offsetWidth
      canvas.height = canvas.offsetHeight
    })
    ro.observe(canvas)
    return () => ro.disconnect()
  }, [])

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
          left: result.x + 14,
          top: result.y - 10,
          background: 'rgba(4,10,24,0.92)',
          border: '1px solid rgba(30,144,255,0.4)',
          borderRadius: 8,
          padding: '6px 10px',
          zIndex: 100,
          fontFamily: "'Montserrat',sans-serif",
          fontSize: 11,
          color: '#fff',
          pointerEvents: 'none',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
          lineHeight: 1.6,
          minWidth: 110,
        }}>
          <div style={{color: result.direction === '▲' ? '#26a69a' : '#ef5350', fontWeight: 700}}>
            {result.direction} {result.pips} pips
          </div>
          <div style={{color: 'rgba(255,255,255,0.5)', fontSize: 10}}>
            {result.candles} velas
          </div>
        </div>
      )}
    </>
  )
}
