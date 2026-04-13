/**
 * useDrawingTools.js
 * Hook que inicializa el sistema de dibujo con difurious line tools
 * Forex Simulator — Algorithmic Suite
 */
import { useEffect, useRef, useCallback } from 'react'

export function useDrawingTools({ chartMap, activePair, seriesRef, dataReady }) {
  const pluginRef = useRef(null)
  const registeredRef = useRef(false)

  const initPlugin = useCallback(async () => {
    if (!dataReady) return
    const cr = chartMap.current[activePair]
    if (!cr?.chart || !cr?.series) return
    if (pluginRef.current) return

    try {
      const { createLineToolsPlugin } = await import('lightweight-charts-line-tools-core')
      const { LineToolTrendLine, LineToolHorizontalLine, LineToolHorizontalRay } = await import('lightweight-charts-line-tools-lines')
      const { LineToolRectangle } = await import('lightweight-charts-line-tools-rectangle')
      const { LineToolFibRetracement } = await import('lightweight-charts-line-tools-fib-retracement')
      const { LineToolLongShortPosition } = await import('lightweight-charts-line-tools-long-short-position')

      const plugin = createLineToolsPlugin(cr.chart, cr.series)

      plugin.registerLineTool('TrendLine',        LineToolTrendLine)
      plugin.registerLineTool('HorizontalLine',   LineToolHorizontalLine)
      plugin.registerLineTool('HorizontalRay',    LineToolHorizontalRay)
      plugin.registerLineTool('Rectangle',        LineToolRectangle)
      plugin.registerLineTool('FibRetracement',   LineToolFibRetracement)
      plugin.registerLineTool('LongShortPosition',LineToolLongShortPosition)

      pluginRef.current = plugin
      registeredRef.current = true
    } catch (e) {
      console.error('Drawing tools init error:', e)
    }
  }, [activePair, dataReady])

  useEffect(() => {
    pluginRef.current = null
    registeredRef.current = false
  }, [activePair])

  useEffect(() => {
    if (dataReady) initPlugin()
  }, [dataReady, initPlugin])

  const addTool = useCallback((type, options = {}) => {
    const p = pluginRef.current; if (!p) return
    try { p.addLineTool(type, [], options) } catch (e) { console.error(e) }
  }, [])

  const removeSelected = useCallback(() => {
    const p = pluginRef.current; if (!p) return
    try { p.removeSelectedLineTools() } catch (e) {}
  }, [])

  const removeAll = useCallback(() => {
    const p = pluginRef.current; if (!p) return
    try { p.removeAllLineTools() } catch (e) {}
  }, [])

  const exportTools = useCallback(() => {
    const p = pluginRef.current; if (!p) return null
    try { return p.exportLineTools() } catch (e) { return null }
  }, [])

  const importTools = useCallback((json) => {
    const p = pluginRef.current; if (!p) return
    try { p.importLineTools(json) } catch (e) { console.error(e) }
  }, [])

  const onAfterEdit = useCallback((handler) => {
    const p = pluginRef.current; if (!p) return
    try { p.subscribeLineToolsAfterEdit(handler) } catch (e) {}
  }, [])

  const onDoubleClick = useCallback((handler) => {
    const p = pluginRef.current; if (!p) return
    try { p.subscribeLineToolsDoubleClick(handler) } catch (e) {}
  }, [])

  return { pluginRef, addTool, removeSelected, removeAll, exportTools, importTools, onAfterEdit, onDoubleClick }
}
