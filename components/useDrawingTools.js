/**
 * useDrawingTools.js v3 — estructura de opciones correcta
 */
import { useEffect, useRef, useCallback, useState } from 'react'

// LineStyle numbers
export const LS = { SOLID: 0, DOTTED: 1, DASHED: 2, LARGE_DASHED: 3, SPARSE_DOTTED: 4 }

// BoxVerticalAlignment / BoxHorizontalAlignment strings
export const VA = { Top: 'top', Middle: 'middle', Bottom: 'bottom' }
export const HA = { Left: 'left', Center: 'center', Right: 'right' }

const DEFAULT_CFG = {
  TrendLine:         { color: '#ffffff', width: 1, style: 0, label: '', fontSize: 12, textV: 'bottom', textH: 'center' },
  HorizontalLine:    { color: '#ffffff', width: 1, style: 0, label: '', fontSize: 12, textV: 'bottom', textH: 'center' },
  HorizontalRay:     { color: '#ffffff', width: 1, style: 0, label: '', fontSize: 12, textV: 'bottom', textH: 'center' },
  Rectangle:         { color: '#2962FF', width: 1, style: 0, fillColor: 'rgba(41,98,255,0.15)', label: '', fontSize: 12, textV: 'middle', textH: 'center' },
  FibRetracement:    { color: '#2962FF', width: 1, style: 0, label: '', fontSize: 10, textV: 'bottom', textH: 'left' },
  LongShortPosition: { color: '#26a69a', width: 1, style: 0, label: '', fontSize: 12, textV: 'middle', textH: 'center' },
}

function buildOptions(toolKey, cfg) {
  const base = { visible: true, editable: true }

  if (toolKey === 'Rectangle') {
    return {
      ...base,
      background: { color: cfg.fillColor || 'rgba(41,98,255,0.15)' },
      border: { color: cfg.color, width: cfg.width, style: cfg.style, radius: 0 },
      text: buildText(cfg),
    }
  }

  if (toolKey === 'FibRetracement') {
    return {
      ...base,
      line: { color: cfg.color, width: cfg.width, style: cfg.style },
      // Keep default levels but override colors
    }
  }

  if (toolKey === 'LongShortPosition') {
    return {
      ...base,
      line: { color: cfg.color, width: cfg.width, style: cfg.style },
    }
  }

  // TrendLine, HorizontalLine, HorizontalRay
  return {
    ...base,
    line: { color: cfg.color, width: cfg.width, style: cfg.style, extend: { left: false, right: false } },
    text: buildText(cfg),
  }
}

function buildText(cfg) {
  if (!cfg.label) return { value: '' }
  return {
    value: cfg.label,
    font: { family: 'Montserrat, sans-serif', color: cfg.textColor || cfg.color, size: cfg.fontSize || 12, bold: false, italic: false },
    box: {
      scale: 1, angle: 0,
      alignment: { vertical: cfg.textV || 'middle', horizontal: cfg.textH || 'center' },
      padding: { x: 3, y: 0 },
      background: { color: 'rgba(0,0,0,0)', inflation: { x: 3, y: 3 } },
      border: { color: 'transparent', width: 0, style: 0, radius: 0, highlight: false },
    },
  }
}

export function useDrawingTools({ chartMap, activePair, dataReady }) {
  const pluginRef       = useRef(null)
  const [toolConfigs, setToolConfigs] = useState({ ...DEFAULT_CFG })
  const cfgRef          = useRef({ ...DEFAULT_CFG })
  const pausePollRef    = useRef(false)

  useEffect(() => { cfgRef.current = toolConfigs }, [toolConfigs])

  const initPlugin = useCallback(async () => {
    if (!dataReady) return
    const cr = chartMap.current[activePair]
    if (!cr?.chart || !cr?.series || pluginRef.current) return
    try {
      const { createLineToolsPlugin }                                          = await import('lightweight-charts-line-tools-core')
      const { LineToolTrendLine, LineToolHorizontalLine, LineToolHorizontalRay } = await import('lightweight-charts-line-tools-lines')
      const { LineToolRectangle }                                              = await import('lightweight-charts-line-tools-rectangle')
      const { LineToolFibRetracement }                                         = await import('lightweight-charts-line-tools-fib-retracement')
      const { LineToolLongShortPosition }                                      = await import('lightweight-charts-line-tools-long-short-position')

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
    const cfg = cfgRef.current[toolKey] || DEFAULT_CFG[toolKey] || {}
    try { p.addLineTool(toolKey, [], buildOptions(toolKey, cfg)) } catch (e) { console.error('addTool:', e) }
  }, [])

  const updateToolConfig = useCallback((toolKey, patch) => {
    setToolConfigs(prev => ({ ...prev, [toolKey]: { ...prev[toolKey], ...patch } }))
  }, [])

  // Apply to a specific tool ID immediately
  const applyToTool = useCallback((toolId, toolKey, cfg) => {
    const p = pluginRef.current; if (!p || !toolId || !toolKey) return
    try {
      p.applyLineToolOptions({
        id: toolId,
        toolType: toolKey,
        options: buildOptions(toolKey, cfg),

      })
      // Pause polling so config pill stays visible after apply
      pausePollRef.current = true
      setTimeout(() => { pausePollRef.current = false }, 1500)
    } catch (e) { console.error('applyToTool:', e) }
  }, [])

  const removeSelected = useCallback(() => { try { pluginRef.current?.removeSelectedLineTools() } catch {} }, [])
  const removeAll      = useCallback(() => { try { pluginRef.current?.removeAllLineTools() } catch {} }, [])
  const exportTools    = useCallback(() => { try { return pluginRef.current?.exportLineTools() ?? null } catch { return null } }, [])
  const importTools    = useCallback((json) => { try { pluginRef.current?.importLineTools(json) } catch (e) { console.error(e) } }, [])
  const onAfterEdit    = useCallback((h) => { try { pluginRef.current?.subscribeLineToolsAfterEdit(h) } catch {} }, [])
  const onDoubleClick  = useCallback((h) => { try { pluginRef.current?.subscribeLineToolsDoubleClick(h) } catch {} }, [])
  const getSelected    = useCallback(() => { try { return JSON.parse(pluginRef.current?.getSelectedLineTools() || '[]') } catch { return [] } }, [])

  return { pluginRef, toolConfigs, updateToolConfig, applyToTool, addTool, removeSelected, removeAll, exportTools, importTools, onAfterEdit, onDoubleClick, getSelected }
}
