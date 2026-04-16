/**
 * useDrawingTools.js v4 — estructuras de opciones correctas por herramienta
 */
import { useEffect, useRef, useCallback, useState } from 'react'
import { supabase } from '../lib/supabase'

const DEFAULT_CFG = {
  TrendLine:         { color: '#ffffff', width: 1, style: 0, label: '', textColor: '#ffffff', fontSize: 12, textV: 'middle', textH: 'center' },
  Path:              { color: '#ffffff', width: 1, style: 0 },
  HorizontalRay:     { color: '#ffffff', width: 1, style: 0, label: '', textColor: '#ffffff', fontSize: 12, textV: 'middle', textH: 'center' },
  Rectangle:         { color: '#2962FF', width: 1, style: 0, fillColor: 'rgba(41,98,255,0.15)', label: '', textColor: '#ffffff', fontSize: 12, textV: 'middle', textH: 'center' },
  FibRetracement:    { color: '#2962FF', width: 1, style: 0, label: '', textColor: '#ffffff', fontSize: 10, textV: 'middle', textH: 'left',
    fibShowPrices: true, fibShowLabels: true, fibBgOpacity: 0, fibExtendRight: false, fibReverse: false, fibLabelPosition: 'right',
    fibLevels: [
      { coeff: 0,     color: '#787B86', enabled: true },
      { coeff: 0.5,   color: '#2962FF', enabled: true },
      { coeff: 0.618, color: '#F7525F', enabled: true },
      { coeff: 0.65,  color: '#FF9800', enabled: true },
      { coeff: 0.702, color: '#4CAF50', enabled: true },
      { coeff: 1,     color: '#787B86', enabled: true },
    ]
  },
  LongShortPosition: { color: '#26a69a', width: 1, style: 0, label: '', textColor: '#ffffff', fontSize: 12, textV: 'middle', textH: 'center' },

}

function buildText(cfg) {
  if (!cfg.label) return { value: '' }
  return {
    value: cfg.label,
    alignment: 'center',
    font: {
      family: 'Montserrat, sans-serif',
      color: cfg.textColor || cfg.color || '#ffffff',
      size: cfg.fontSize || 12,
      bold: false,
      italic: false,
    },
    box: {
      scale: 1,
      angle: 0,
      alignment: {
        vertical: cfg.textV || 'middle',
        horizontal: cfg.textH || 'center',
      },
      padding: { x: 3, y: 0 },
      maxHeight: 0,
      shadow: { blur: 0, color: 'transparent', offset: { x: 0, y: 0 } },
      // Transparent bg so line shows through but text is readable
      background: { color: 'rgba(0,0,0,0)', inflation: { x: 0, y: 0 } },
      border: { color: 'transparent', width: 0, radius: 0, highlight: false, style: 0 },
    },
    padding: 0,
    wordWrapWidth: 0,
    forceTextAlign: false,
    forceCalculateMaxLineWidth: false,
  }
}

function buildOptions(toolKey, cfg) {
  const base = { visible: true, editable: true }

  if (toolKey === 'Path') {
    return {
      ...base,
      line: { color: cfg.color || '#ffffff', width: cfg.width || 1, style: cfg.style || 0 },
    }
  }

  if (toolKey === 'Rectangle') {
    return {
      ...base,
      rectangle: {
        extend: { left: false, right: false },
        background: { color: cfg.fillColor || 'rgba(41,98,255,0.15)' },
        border: { radius: 0, width: cfg.width || 1, style: cfg.style || 0, color: cfg.color || '#2962FF' },
      },
      text: buildText(cfg),
    }
  }

  if (toolKey === 'FibRetracement') {
    const levels = (cfg.fibLevels || [
      { coeff: 0,     color: '#787B86', enabled: true },
      { coeff: 0.5,   color: '#2962FF', enabled: true },
      { coeff: 0.618, color: '#F7525F', enabled: true },
      { coeff: 0.65,  color: '#FF9800', enabled: true },
      { coeff: 0.702, color: '#4CAF50', enabled: true },
      { coeff: 1,     color: '#787B86', enabled: true },
    ]).filter(l => l.enabled !== false)
    return {
      ...base,
      line: { width: cfg.width || 1, style: cfg.style || 0 },
      extend: { left: false, right: cfg.fibExtendRight || false },
      reverse: cfg.fibReverse || false,
      labelPosition: cfg.fibLabelPosition || 'right',
      showPrices: cfg.fibShowPrices !== false,
      levels: levels.map(l => ({
        color: l.color || cfg.color || '#2962FF',
        coeff: l.coeff,
        opacity: cfg.fibBgOpacity ?? 0,
      })),
    }
  }

  if (toolKey === 'LongShortPosition') {
    return {
      ...base,
      line: { color: cfg.color || '#26a69a', width: cfg.width || 1, style: cfg.style || 0 },
      entryStopLossRectangle: { background: { color: cfg.stopColor || 'rgba(239,83,80,0.2)' }, border: { width: cfg.borderWidth||1, style: 0, color: cfg.stopColor||'#ef5350', radius:0 } },
      entryPtRectangle: { background: { color: cfg.profitColor || 'rgba(38,166,154,0.2)' }, border: { width: cfg.borderWidth||1, style: 0, color: cfg.profitColor||'#26a69a', radius:0 } },
      showAutoText: false,
      textColor: cfg.textColor || '#ffffff',
    }
  }

  // TrendLine, HorizontalLine, HorizontalRay
  return {
    ...base,
    line: {
      color: cfg.color || '#ffffff',
      width: cfg.width || 1,
      style: cfg.style || 0,
      extend: { left: false, right: false },
    },
    text: buildText(cfg),
  }
}

export function useDrawingTools({ chartMap, activePair, dataReady, userId }) {
  const pluginRef      = useRef(null)
  const [toolConfigs,  setToolConfigs]  = useState({ ...DEFAULT_CFG })
  const [pluginReady,  setPluginReady]  = useState(false)
  const cfgRef         = useRef({ ...DEFAULT_CFG })

  useEffect(() => { cfgRef.current = toolConfigs }, [toolConfigs])

  // Load tool config from Supabase on mount
  useEffect(() => {
    if (!userId) return
    supabase.from('user_tool_config').select('config').eq('user_id', userId).maybeSingle()
      .then(({ data }) => {
        if (data?.config && Object.keys(data.config).length > 0) {
          const merged = {}
          Object.keys(DEFAULT_CFG).forEach(k => {
            merged[k] = { ...DEFAULT_CFG[k], ...(data.config[k] || {}) }
          })
          setToolConfigs(merged)
        }
      }).catch(() => {})
  }, [userId])

  const initPlugin = useCallback(async () => {
    if (!dataReady) return
    const cr = chartMap.current[activePair]
    if (!cr?.chart || !cr?.series || pluginRef.current) return
    try {
      const { createLineToolsPlugin }                                            = await import('lightweight-charts-line-tools-core')
      const { LineToolTrendLine, LineToolHorizontalLine, LineToolHorizontalRay } = await import('lightweight-charts-line-tools-lines')
      const { LineToolPath }           = await import('lightweight-charts-line-tools-path')
      const { LineToolRectangle }      = await import('lightweight-charts-line-tools-rectangle')
      const { LineToolFibRetracement } = await import('../lightweight-charts-line-tools-fib-retracement')
      const { LineToolLongShortPosition } = await import('lightweight-charts-line-tools-long-short-position')

      const plugin = createLineToolsPlugin(cr.chart, cr.series)
      plugin.registerLineTool('TrendLine',          LineToolTrendLine)
      plugin.registerLineTool('Path',               LineToolPath)
      plugin.registerLineTool('HorizontalRay',      LineToolHorizontalRay)
      plugin.registerLineTool('Rectangle',          LineToolRectangle)
      plugin.registerLineTool('FibRetracement',     LineToolFibRetracement)
      plugin.registerLineTool('LongShortPosition',  LineToolLongShortPosition)
      pluginRef.current = plugin
      // Signal that the plugin is ready — triggers onAfterEdit subscription in _SessionInner
      setPluginReady(true)
    } catch (e) { console.error('Drawing tools init error:', e) }
  }, [activePair, dataReady])

  // Reset plugin and ready flag on pair change
  useEffect(() => {
    pluginRef.current = null
    setPluginReady(false)
  }, [activePair])

  useEffect(() => { if (dataReady) initPlugin() }, [dataReady, initPlugin])

  const addTool = useCallback((toolKey) => {
    const p = pluginRef.current; if (!p) return
    const cfg = cfgRef.current[toolKey] || DEFAULT_CFG[toolKey] || {}
    const newCfg = { ...cfg, label: '' }
    try { p.addLineTool(toolKey, [], buildOptions(toolKey, newCfg)) } catch (e) { console.error('addTool:', e) }
  }, [])

  const updateToolConfig = useCallback((toolKey, patch) => {
    setToolConfigs(prev => {
      const next = { ...prev, [toolKey]: { ...prev[toolKey], ...patch } }
      // Save to Supabase
      if (userId) {
        supabase.from('user_tool_config').upsert(
          { user_id: userId, config: next, updated_at: new Date().toISOString() },
          { onConflict: 'user_id' }
        ).then(() => {}).catch(() => {})
      }
      return next
    })
  }, [userId])

  const setToolVisible = useCallback((toolId, visible) => {
    const p = pluginRef.current; if (!p || !toolId) return
    try {
      const json = p.getLineToolByID(toolId)
      if (!json) return
      const arr = JSON.parse(json)
      if (!arr?.length) return
      const { toolType, points, options } = arr[0]
      p.createOrUpdateLineTool(toolType, points, { ...options, visible }, toolId)
    } catch (e) { console.error('setToolVisible:', e) }
  }, [])

  const applyToTool = useCallback((toolId, toolKey, cfg) => {
    const p = pluginRef.current; if (!p || !toolId || !toolKey) return
    try {
      // getLineToolByID returns JSON array: [{id, toolType, points, options}]
      const json = p.getLineToolByID(toolId)
      const arr = JSON.parse(json)
      const points = arr?.[0]?.points || []
      if (!points.length) { console.warn('applyToTool: no points found for', toolId); return }
      p.createOrUpdateLineTool(toolKey, points, buildOptions(toolKey, cfg), toolId)
    } catch (e) { console.error('applyToTool:', e) }
  }, [])

  const removeSelected = useCallback(() => { try { pluginRef.current?.removeSelectedLineTools() } catch {} }, [])
  const removeAll      = useCallback(() => { try { pluginRef.current?.removeAllLineTools() } catch {} }, [])
  const exportTools    = useCallback(() => { try { return pluginRef.current?.exportLineTools() ?? null } catch { return null } }, [])
  const importTools    = useCallback((json) => { try { pluginRef.current?.importLineTools(json) } catch (e) { console.error(e) } }, [])
  const onAfterEdit    = useCallback((h) => { try { pluginRef.current?.subscribeLineToolsAfterEdit(h) } catch {} }, [])
  const offAfterEdit   = useCallback((h) => { try { pluginRef.current?.unsubscribeLineToolsAfterEdit(h) } catch {} }, [])
  const onDoubleClick  = useCallback((h) => { try { pluginRef.current?.subscribeLineToolsDoubleClick(h) } catch {} }, [])
  const offDoubleClick = useCallback((h) => { try { pluginRef.current?.unsubscribeLineToolsDoubleClick(h) } catch {} }, [])
  const getSelected    = useCallback(() => { try { return JSON.parse(pluginRef.current?.getSelectedLineTools() || '[]') } catch { return [] } }, [])

  return { pluginRef, pluginReady, toolConfigs, updateToolConfig, applyToTool, setToolVisible, addTool, removeSelected, removeAll, exportTools, importTools, onAfterEdit, offAfterEdit, onDoubleClick, offDoubleClick, getSelected }
}
