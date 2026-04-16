import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

const DEFAULT_CONFIG = {
  bullCandleBody:   '#26a69a',
  bullCandleBorder: '#26a69a',
  bullCandleWick:   '#26a69a',
  bearCandleBody:   '#ef5350',
  bearCandleBorder: '#ef5350',
  bearCandleWick:   '#ef5350',
  bgColor:          '#040a18',
  bgGradient:       false,
  bgGradientTo:     '#0a1628',
  crosshair:        true,
  grid:             false,
}

export function useChartConfig({ sessionId, userId }) {
  const [config, setConfig] = useState(DEFAULT_CONFIG)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!sessionId || !userId) return
    const load = async () => {
      // Try session config first
      const { data: sc } = await supabase
        .from('session_chart_config')
        .select('config')
        .eq('session_id', sessionId)
        .maybeSingle()
      if (sc?.config && Object.keys(sc.config).length > 0) {
        setConfig({ ...DEFAULT_CONFIG, ...sc.config })
        setLoaded(true)
        return
      }
      // Fallback to user global config
      const { data: uc } = await supabase
        .from('user_chart_config')
        .select('config')
        .eq('user_id', userId)
        .maybeSingle()
      if (uc?.config && Object.keys(uc.config).length > 0) {
        setConfig({ ...DEFAULT_CONFIG, ...uc.config })
      }
      setLoaded(true)
    }
    load()
  }, [sessionId, userId])

  const saveConfig = async (newConfig) => {
    setConfig(newConfig)
    if (!sessionId || !userId) return
    // Save to session
    await supabase.from('session_chart_config').upsert(
      { session_id: sessionId, user_id: userId, config: newConfig, updated_at: new Date().toISOString() },
      { onConflict: 'session_id' }
    )
    // Update global user config (template for new sessions)
    await supabase.from('user_chart_config').upsert(
      { user_id: userId, config: newConfig, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    )
  }

  return { config, saveConfig, loaded }
}

export function applyChartConfig(chartMap, pair, config) {
  const cr = chartMap?.current?.[pair]
  if (!cr?.chart || !cr?.series) return
  try {
    // Candle colors
    cr.series.applyOptions({
      upColor:          config.bullCandleBody,
      downColor:        config.bearCandleBody,
      borderUpColor:    config.bullCandleBorder,
      borderDownColor:  config.bearCandleBorder,
      wickUpColor:      config.bullCandleWick,
      wickDownColor:    config.bearCandleWick,
    })
    // Background
    cr.chart.applyOptions({
      layout: {
        background: config.bgGradient
          ? { type: 'gradient', topColor: config.bgColor, bottomColor: config.bgGradientTo }
          : { type: 'solid', color: config.bgColor },
        textColor: 'rgba(255,255,255,0.7)',
      },
      crosshair: {
        mode: config.crosshair ? 1 : 0,
      },
      grid: {
        vertLines: { visible: config.grid, color: 'rgba(255,255,255,0.04)' },
        horzLines: { visible: config.grid, color: 'rgba(255,255,255,0.04)' },
      },
    })
  } catch (e) {}
}

export default function ChartConfigPanel({ open, onClose, config, onSave }) {
  const [local, setLocal] = useState(config)
  const panelRef = useRef(null)

  useEffect(() => { setLocal(config) }, [config])

  useEffect(() => {
    if (!open) return
    const handleKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  if (!open) return null

  const set = (key, val) => setLocal(p => ({ ...p, [key]: val }))

  const s = {
    overlay: {
      position: 'fixed', inset: 0, zIndex: 2000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    },
    backdrop: {
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
      backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
    },
    panel: {
      position: 'relative', zIndex: 1,
      background: 'rgba(8,16,36,0.82)',
      border: '1px solid rgba(30,144,255,0.25)',
      borderRadius: 20,
      boxShadow: '0 20px 80px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.07)',
      backdropFilter: 'blur(40px)', WebkitBackdropFilter: 'blur(40px)',
      width: 380, maxHeight: '85vh', overflowY: 'auto',
      fontFamily: "'Montserrat',sans-serif",
      padding: '0 0 20px',
    },
    header: {
      padding: '18px 20px 14px',
      borderBottom: '1px solid rgba(255,255,255,0.06)',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    },
    title: { fontSize: 13, fontWeight: 700, color: '#fff', letterSpacing: 1 },
    closeBtn: {
      background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)',
      cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 0,
    },
    section: { padding: '14px 20px 0' },
    sectionTitle: {
      fontSize: 9, fontWeight: 700, letterSpacing: 2,
      color: 'rgba(30,144,255,0.7)', textTransform: 'uppercase',
      marginBottom: 10,
    },
    row: {
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      marginBottom: 8,
    },
    label: { fontSize: 11, color: 'rgba(255,255,255,0.6)', fontWeight: 500 },
    colorWrap: {
      display: 'flex', alignItems: 'center', gap: 6,
    },
    colorInput: {
      width: 32, height: 24, borderRadius: 6, border: '1px solid rgba(255,255,255,0.15)',
      cursor: 'pointer', padding: 2, background: 'none',
    },
    toggle: (active) => ({
      width: 36, height: 20, borderRadius: 10, cursor: 'pointer', border: 'none',
      background: active ? '#1E90FF' : 'rgba(255,255,255,0.1)',
      position: 'relative', transition: 'background 0.2s',
      flexShrink: 0,
    }),
    toggleKnob: (active) => ({
      position: 'absolute', top: 2, left: active ? 18 : 2,
      width: 16, height: 16, borderRadius: 8,
      background: '#fff', transition: 'left 0.2s',
    }),
    divider: {
      height: 1, background: 'rgba(255,255,255,0.05)',
      margin: '14px 20px 0',
    },
    saveBtn: {
      margin: '18px 20px 0',
      width: 'calc(100% - 40px)',
      padding: '10px 0',
      background: 'linear-gradient(135deg,#1E90FF,#0a5cbf)',
      border: 'none', borderRadius: 10,
      color: '#fff', fontSize: 12, fontWeight: 700,
      cursor: 'pointer', letterSpacing: 1,
    },
  }

  const Toggle = ({ active, onChange }) => (
    <button style={s.toggle(active)} onClick={() => onChange(!active)}>
      <div style={s.toggleKnob(active)} />
    </button>
  )

  const ColorRow = ({ label, value, onChange }) => (
    <div style={s.row}>
      <span style={s.label}>{label}</span>
      <div style={s.colorWrap}>
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace' }}>{value}</span>
        <input type="color" value={value} onChange={e => onChange(e.target.value)} style={s.colorInput} />
      </div>
    </div>
  )

  return (
    <div style={s.overlay}>
      <div style={s.backdrop} onClick={onClose} />
      <div style={s.panel} ref={panelRef}>
        <div style={s.header}>
          <span style={s.title}>⚙ CONFIGURACIÓN DEL GRÁFICO</span>
          <button style={s.closeBtn} onClick={onClose}>×</button>
        </div>

        {/* VELAS ALCISTAS */}
        <div style={s.section}>
          <div style={s.sectionTitle}>Velas Alcistas</div>
          <ColorRow label="Cuerpo" value={local.bullCandleBody} onChange={v => set('bullCandleBody', v)} />
          <ColorRow label="Borde" value={local.bullCandleBorder} onChange={v => set('bullCandleBorder', v)} />
          <ColorRow label="Mecha" value={local.bullCandleWick} onChange={v => set('bullCandleWick', v)} />
        </div>

        <div style={s.divider} />

        {/* VELAS BAJISTAS */}
        <div style={s.section}>
          <div style={s.sectionTitle}>Velas Bajistas</div>
          <ColorRow label="Cuerpo" value={local.bearCandleBody} onChange={v => set('bearCandleBody', v)} />
          <ColorRow label="Borde" value={local.bearCandleBorder} onChange={v => set('bearCandleBorder', v)} />
          <ColorRow label="Mecha" value={local.bearCandleWick} onChange={v => set('bearCandleWick', v)} />
        </div>

        <div style={s.divider} />

        {/* FONDO */}
        <div style={s.section}>
          <div style={s.sectionTitle}>Fondo</div>
          <ColorRow label="Color base" value={local.bgColor} onChange={v => set('bgColor', v)} />
          <div style={s.row}>
            <span style={s.label}>Gradiente</span>
            <Toggle active={local.bgGradient} onChange={v => set('bgGradient', v)} />
          </div>
          {local.bgGradient && (
            <ColorRow label="Color gradiente" value={local.bgGradientTo} onChange={v => set('bgGradientTo', v)} />
          )}
        </div>

        <div style={s.divider} />

        {/* OPCIONES */}
        <div style={s.section}>
          <div style={s.sectionTitle}>Opciones</div>
          <div style={s.row}>
            <span style={s.label}>Crosshair (cursor)</span>
            <Toggle active={local.crosshair} onChange={v => set('crosshair', v)} />
          </div>
          <div style={s.row}>
            <span style={s.label}>Cuadrícula</span>
            <Toggle active={local.grid} onChange={v => set('grid', v)} />
          </div>
        </div>

        <button style={s.saveBtn} onClick={() => { onSave(local); onClose() }}>
          GUARDAR CONFIGURACIÓN
        </button>
      </div>
    </div>
  )
}
