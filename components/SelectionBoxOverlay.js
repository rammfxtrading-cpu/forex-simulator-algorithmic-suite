import { useEffect, useRef, useState, useCallback } from 'react'

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
      const im = plugin._interactionManager
      const scene = JSON.parse(plugin.exportLineTools() || '[]')
      // Convertimos las DOS esquinas del recuadro (pantalla) a coordenadas
      // nativas del dibujo (timestamp/price) con la propia función del plugin,
      // que es la inversa EXACTA de cómo coloca los dibujos — incluido el espacio
      // futuro/en blanco. Así comparamos en el MISMO espacio en que el dibujo
      // guarda sus puntos, sin reinventar la conversión timestamp→píxel (que
      // fallaba en los bordes por huecos de fin de semana y velas phantom).
      const c1 = im?.screenPointToLineToolPoint?.({ x: box.x1, y: box.y1 })
      const c2 = im?.screenPointToLineToolPoint?.({ x: box.x2, y: box.y2 })
      if (!c1 || !c2) return
      const tMin = Math.min(c1.timestamp, c2.timestamp)
      const tMax = Math.max(c1.timestamp, c2.timestamp)
      const pMin = Math.min(c1.price, c2.price)
      const pMax = Math.max(c1.price, c2.price)
      const selectedIds = []
      for (const tool of scene) {
        if (!Array.isArray(tool.points) || tool.points.length === 0) continue
        let tTMin = Infinity, tTMax = -Infinity, tPMin = Infinity, tPMax = -Infinity
        for (const p of tool.points) {
          if (p.timestamp < tTMin) tTMin = p.timestamp
          if (p.timestamp > tTMax) tTMax = p.timestamp
          if (p.price < tPMin) tPMin = p.price
          if (p.price > tPMax) tPMax = p.price
        }
        // Intersección AABB en espacio timestamp/price.
        const overlaps = tTMin <= tMax && tTMax >= tMin && tPMin <= pMax && tPMax >= pMin
        if (overlaps) selectedIds.push(tool.id)
      }
      if (selectedIds.length === 0) return
      // Marca cada dibujo solapado como seleccionado (sin deseleccionar el resto:
      // así un recuadro tras otro acumula, igual que ⌘+clic). setSelected hace
      // updateAllViews + requestUpdate (repinta los handles).
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
        // Propaga al padre las bounds en coords de VIEWPORT (sumando el origen del canvas)
        // + el nº de tools seleccionados, para anclar una barra flotante de grupo.
        try{
          if(typeof onSelectArea === 'function'){
            const vp = {
              x1: Math.min(start.x, x) + rect.left,
              y1: Math.min(start.y, y) + rect.top,
              x2: Math.max(start.x, x) + rect.left,
              y2: Math.max(start.y, y) + rect.top,
            }
            onSelectArea(vp)
          }
        }catch{}
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
