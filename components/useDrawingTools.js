/**
 * useDrawingTools.js v2
 * Hook completo para herramientas de dibujo
 */
import { useEffect, useRef, useCallback, useState } from 'react'

export const LINE_STYLE = { SOLID: 0, DOTTED: 1, DASHED: 2, LARGE_DASHED: 3, SPARSE_DOTTED: 4 }

const DEFAULT_CONFIG = {
  TrendLine:        { color: '#ffffff', width: 1, style: 0, fillColor: 'rgba(255,255,255,0)', label: '' },
  HorizontalLine:   { color: '#ffffff', width: 1, style: 0, fillColor: 'rgba(255,255,255,0)', label: '' },
  HorizontalRay:    { color: '#ffffff', width: 1, style: 0, fillColor: 'rgba(255,255,255,0)', label: '' },
  Rectangle:        { color: '#2962FF', width: 1, style: 0, fillColor: 'rgba(41,98,255,0.1)', label: '' },
  FibRetracement:   { color: '#2962FF', width: 1, style: 0, fillColor: 'rgba(41,98,255,0.05)', label: '' },
  LongShortPosition:{ color: '#26a69a', width: 1, style: 0, fillColor: 'rgba(38,166,154,0.1)', label: '' },
  PriceRange:       { color: '#ffffff', width: 1, style: 1, fillColor: 'rgba(255,255,255,0.05)', label: '' },
}

function buildToolOptions(toolKey, cfg) {
  const base = {
    line: { color: cfg.color, width: cfg.width, style: cfg.style },
    visible: true,
    editable: true,
  }
  if (toolKey === 'Rectangle' || toolKey === 'FibRetracement') {
    base.body = { background: { color: cfg.fillColor } }
    base.border = { color: cfg.color, width: cfg.width, style: cfg.style }
  }
  if (toolKey === 'LongShortPosition') {
    base.profitLine = { color: '#26a69a', width: cfg.width }
    base.stopLine   = { color: '#ef5350', width: cfg.width }
  }
  if (cfg.label) {
    base.text = {
      value: cfg.label,
      font: { color: cfg.color, size: 11, bold: false, italic: false, family: 'Montserrat' },
      box: {
        background: { color: 'rgba(0,0,0,0.6)' },
        border: { color: cfg.color, width: 1, style: 0, radius: 3 },
        padding: { x: 4, y: 2 },
        alignment: { vertical: 'bottom', horizontal: 'center' },
      }
    }
  }
  return base
}

export function useDrawingTools({ chartMap, activePair, dataReady }) {
  const pluginRef      = useRef(null)
  const [toolConfigs, setToolConfigs] = useState({ ...DEFAULT_CONFIG })
  const toolConfigsRef = useRef({ ...DEFAULT_CONFIG })

  useEffect(() => { toolConfigsRef.current = toolConfigs }, [toolConfigs])

  const initPlugin = useCallback(async () => {
    if (!dataReady) return
    const cr = chartMap.current[activePair]
    if (!cr?.chart || !cr?.series || pluginRef.current) return
    try {
      const { createLineToolsPlugin } = await import('lightweight-charts-line-tools-core')
      const { LineToolTrendLine, LineToolHorizontalLine, LineToolHorizontalRay } = await import('lightweight-charts-line-tools-lines')
      const { LineToolRectangle }         = await import('lightweight-charts-line-tools-rectangle')
      const { LineToolFibRetracement }    = await import('lightweight-charts-line-tools-fib-retracement')
      const { LineToolLongShortPosition } = await import('lightweight-charts-line-tools-long-short-position')
      const plugin = createLineToolsPlugin(cr.chart, cr.series)
      plugin.registerLineTool('TrendLine',         LineToolTrendLine)
      plugin.registerLineTool('HorizontalLine',    LineToolHorizontalLine)
      plugin.registerLineTool('HorizontalRay',     LineToolHorizontalRay)
      plugin.registerLineTool('Rectangle',         LineToolRectangle)
      plugin.registerLineTool('FibRetracement',    LineToolFibRetracement)
      plugin.registerLineTool('LongShortPosition', LineToolLongShortPosition)
      pluginRef.current = plugin
    } catch (e) { console.error('Drawing tools init error:', e) }
  }, [activePair, dataReady])

  useEffect(() => { pluginRef.current = null }, [activePair])
  useEffect(() => { if (dataReady) initPlugin() }, [dataReady, initPlugin])

  // Delete key
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
      if (e.key === 'Delete' || e.key === 'Backspace') {
        try { pluginRef.current?.removeSelectedLineTools() } catch {}
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const addTool = useCallback((toolKey) => {
    const p = pluginRef.current; if (!p) return
    const cfg = toolConfigsRef.current[toolKey] || DEFAULT_CONFIG[toolKey] || {}
    try { p.addLineTool(toolKey, [], buildToolOptions(toolKey, cfg)) } catch (e) { console.error(e) }
  }, [])

  const updateToolConfig = useCallback((toolKey, newCfg) => {
    setToolConfigs(prev => ({ ...prev, [toolKey]: { ...prev[toolKey], ...newCfg } }))
  }, [])

  const applyToSelected = useCallback((toolId, toolKey, cfg) => {
    const p = pluginRef.current; if (!p || !toolId) return
    try { p.applyLineToolOptions({ id: toolId, options: buildToolOptions(toolKey, cfg) }) } catch (e) { console.error(e) }
  }, [])

  const removeSelected = useCallback(() => { try { pluginRef.current?.removeSelectedLineTools() } catch {} }, [])
  const removeAll      = useCallback(() => { try { pluginRef.current?.removeAllLineTools() } catch {} }, [])
  const exportTools    = useCallback(() => { try { return pluginRef.current?.exportLineTools() ?? null } catch { return null } }, [])
  const importTools    = useCallback((json) => { try { pluginRef.current?.importLineTools(json) } catch (e) { console.error(e) } }, [])
  const onAfterEdit    = useCallback((h) => { try { pluginRef.current?.subscribeLineToolsAfterEdit(h) } catch {} }, [])
  const onDoubleClick  = useCallback((h) => { try { pluginRef.current?.subscribeLineToolsDoubleClick(h) } catch {} }, [])
  const getSelected    = useCallback(() => { try { return JSON.parse(pluginRef.current?.getSelectedLineTools() || '[]') } catch { return [] } }, [])

  return { pluginRef, toolConfigs, updateToolConfig, applyToSelected, addTool, removeSelected, removeAll, exportTools, importTools, onAfterEdit, onDoubleClick, getSelected }
}
