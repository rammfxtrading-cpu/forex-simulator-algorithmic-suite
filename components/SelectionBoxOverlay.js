import { useEffect, useRef, useState, useCallback } from 'react'
import { getSeriesData } from '../lib/sessionData'

// Overlay del recuadro de selección (paridad TradingView: ⌘/Ctrl + arrastrar).
// Gemelo de RulerOverlay. EN ESTA PIEZA solo dibuja el recuadro mientras ⌘/Ctrl
// está pulsada; la selección de dibujos se añade en la pieza siguiente.
// Clave técnica: cuando el canvas tiene pointerEvents:'all' captura el ratón
// ANTES que el chart, así el pan/scroll del chart NO se dispara durante el arrastre.
export default function SelectionBoxOverlay({ chartMap, activePair, onSelectArea }) {
  const canvasRef = useRef(null)
  const stateRef  = useRef({ dragging: false, start: null, end: null })
  const [modDown, setModDown] = useState(false)  // ⌘ (Mac) o Ctrl (PC) pulsada

  // ── Escucha global de ⌘/Ctrl para armar/desarmar el overlay ──
  useEffect(() => {
    const setMod = (v) => { setModDown(v); if (typeof window !== 'undefined') window.__modKeyDown = v }
    const onKeyDown = (e) => { if (e.metaKey || e.ctrlKey) setMod(true) }
    const onKeyUp   = (e) => { if (!e.metaKey && !e.ctrlKey) setMod(false) }
    // Si la ventana pierde el foco con la tecla pulsada, desarmamos por seguridad.
    const onBlur    = () => setMod(false)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [])

  // ── Dibuja el recuadro en el canvas ──
  const draw = useCallback((start, end) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    if (!start || !end) return
    const x1 = Math.min(start.x, end.x)
    const y1 = Math.min(start.y, end.y)
    const w  = Math.abs(end.x - start.x)
    const h  = Math.abs(end.y - start.y)
    // Relleno azul translúcido + borde punteado (estilo TradingView).
    ctx.fillStyle = 'rgba(41,98,255,0.10)'
    ctx.fillRect(x1, y1, w, h)
    ctx.strokeStyle = 'rgba(41,98,255,0.9)'
    ctx.lineWidth = 1
    ctx.setLineDash([4, 3])
    ctx.strokeRect(x1, y1, w, h)
    ctx.setLineDash([])
  }, [])

  // ── Selección por área: marca los dibujos cuyo bounding-box solapa el recuadro ──
  // Convierte los points de cada dibujo (timestamp/price) a píxeles de pantalla
  // y comprueba intersección de cajas (AABB). Trata los points fuera de vista
  // (timeToCoordinate → null): si TODOS caen fuera, el dibujo se ignora; si solo
  // algunos, se usa el bounding-box de los válidos. Marca con setSelected, igual
  // que el patrón ya usado en useDrawingTools (toca internos del fork, en try/catch).
  const selectInArea = useCallback((box) => {
    const cr = chartMap?.current?.[activePair]
    const plugin = cr?.plugin
    if (!plugin || !cr?.series || !cr?.chart) return
    try {
      const ts = cr.chart.timeScale()
      const s  = cr.series
      const scene = JSON.parse(plugin.exportLineTools() || '[]')
      // Datos de la serie para mapear timestamp → índice de vela. El chart trabaja
      // en espacio LÓGICO (índice de barra): logicalToCoordinate(idx) da el píxel X.
      // NO se puede usar timeToCoordinate(timestamp) porque espera fechas yyyy-mm-dd
      // y lanza error con timestamps Unix.
      const data = getSeriesData() || []
      const dlen = data.length
      // timestamp → índice lógico replicando la interpolación del fork
      // (interpolateLogicalIndexFromTime): índice = (timestamp - time0) / interval,
      // con interval = tiempo entre las dos primeras velas. SIN clampar: extrapola
      // a índices fraccionarios y fuera de rango, igual que hace el plugin para
      // dibujos en el espacio futuro/en blanco (a la derecha de la última vela).
      // Clampar (como hacía la búsqueda binaria) colocaba mal Path/Rectangle
      // dibujados en el hueco futuro, pegándolos al borde de los datos.
      // Intervalo entre velas (segundos), estimado como la mediana de las
      // diferencias para ser robusto ante irregularidades. Se usa SOLO para
      // extrapolar dibujos que caen más allá de la última vela.
      const lastIdx = dlen - 1
      const lastTime = dlen > 0 ? data[lastIdx].time : null
      const firstTime = dlen > 0 ? data[0].time : null
      const interval = dlen > 1 ? (data[1].time - data[0].time) : 900
      const tsToIndex = (timestamp) => {
        if (dlen === 0) return null
        // Antes del primer dato: extrapola hacia la izquierda (índices negativos).
        if (timestamp <= firstTime) return (timestamp - firstTime) / interval
        // Más allá del último dato (espacio futuro/en blanco): extrapola a la
        // derecha desde el último índice real. Aquí NO hay velas que buscar, así
        // que el intervalo es la única referencia (replica al fork en el hueco).
        if (timestamp >= lastTime) return lastIdx + (timestamp - lastTime) / interval
        // Dentro del rango: búsqueda binaria del índice real. Robusta ante huecos
        // de fin de semana (no asume una vela cada 'interval' segundos).
        let lo = 0, hi = lastIdx
        while (lo <= hi) {
          const mid = (lo + hi) >> 1
          const tm = data[mid].time
          if (tm === timestamp) return mid
          if (tm < timestamp) lo = mid + 1
          else hi = mid - 1
        }
        // No hay match exacto: interpola entre los dos índices vecinos (hi y lo)
        // según la posición real del timestamp entre sus tiempos. Da un índice
        // fraccionario preciso aun con velas irregularmente espaciadas.
        const iLo = Math.max(0, hi), iHi = Math.min(lastIdx, lo)
        if (iLo === iHi) return iLo
        const tLo = data[iLo].time, tHi = data[iHi].time
        const frac = (tHi === tLo) ? 0 : (timestamp - tLo) / (tHi - tLo)
        return iLo + frac
      }
      // Caja del recuadro normalizada.
      const rx1 = Math.min(box.x1, box.x2), ry1 = Math.min(box.y1, box.y2)
      const rx2 = Math.max(box.x1, box.x2), ry2 = Math.max(box.y1, box.y2)
      const selectedIds = []
      for (const tool of scene) {
        if (!Array.isArray(tool.points) || tool.points.length === 0) continue
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
        let anyValid = false
        for (const p of tool.points) {
          const idx = tsToIndex(p.timestamp)
          const px = (idx == null) ? null : ts.logicalToCoordinate(idx)
          const py = s.priceToCoordinate(p.price)
          if (px == null || py == null) continue  // point no convertible
          anyValid = true
          if (px < minX) minX = px
          if (px > maxX) maxX = px
          if (py < minY) minY = py
          if (py > maxY) maxY = py
        }
        if (!anyValid) continue  // dibujo sin coordenadas válidas
        // Intersección AABB entre la caja del dibujo y el recuadro.
        const overlaps = minX <= rx2 && maxX >= rx1 && minY <= ry2 && maxY >= ry1
        if (overlaps) selectedIds.push(tool.id)
      }
      if (selectedIds.length === 0) return
      // Marca cada dibujo solapado como seleccionado (sin deseleccionar el resto:
      // así un recuadro tras otro acumula, igual que ⌘+clic). setSelected hace
      // updateAllViews + requestUpdate (repinta los handles).
      const im = plugin._interactionManager
      let last = null
      for (const id of selectedIds) {
        const t = plugin._tools?.get(id)
        if (!t) continue
        t.setSelected(true)
        last = t
      }
      // _selectedTool apunta al último marcado (para que drag/estilo operen sobre algo).
      if (im && last) im._selectedTool = last
      plugin.requestUpdate?.()
    } catch (e) { console.error('selectInArea:', e) }
  }, [chartMap, activePair])

  // ── Gesto de arrastre (solo activo mientras ⌘/Ctrl está pulsada) ──
  useEffect(() => {
    if (!modDown) {
      // Al desarmar, limpiamos cualquier recuadro a medio dibujar.
      stateRef.current = { dragging: false, start: null, end: null }
      const canvas = canvasRef.current
      if (canvas) canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height)
      return
    }
    const canvas = canvasRef.current
    if (!canvas) return

    const onMouseDown = (e) => {
      if (e.button !== 0) return
      const rect = canvas.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      stateRef.current = { dragging: true, start: { x, y }, end: null }
    }
    const onMouseMove = (e) => {
      if (!stateRef.current.dragging) return
      const rect = canvas.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      stateRef.current.end = { x, y }
      draw(stateRef.current.start, { x, y })
    }
    const onMouseUp = (e) => {
      if (!stateRef.current.dragging) return
      const rect = canvas.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      const start = stateRef.current.start
      const dx = x - (start?.x || 0)
      const dy = y - (start?.y || 0)
      const moved = Math.sqrt(dx*dx + dy*dy) >= 5
      if (moved && start) {
        selectInArea({ x1: start.x, y1: start.y, x2: x, y2: y })
      }
      stateRef.current = { dragging: false, start: null, end: null }
      canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height)
    }

    canvas.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      canvas.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [modDown, draw, selectInArea])

  // ── Mantener el canvas al tamaño del contenedor ──
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

  return (
    <canvas ref={canvasRef} style={{
      position: 'absolute', inset: 0, zIndex: 19,
      width: '100%', height: '100%',
      pointerEvents: modDown ? 'all' : 'none',
      cursor: modDown ? 'crosshair' : 'default',
    }}/>
  )
}
