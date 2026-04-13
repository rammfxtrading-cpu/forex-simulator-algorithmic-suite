/**
 * DrawingToolbarV2.js
 * Píldora horizontal de herramientas + píldora de configuración contextual
 * Forex Simulator — Algorithmic Suite
 * Diseño: liquid glass, mismo estilo que ReplayPill
 */
import { useState, useRef, useCallback, useEffect } from 'react'

// ── Herramientas disponibles ──────────────────────────────────────────────────
const TOOLS = [
  { id: 'cursor',          label: 'Cursor',             icon: CursorIcon,   toolKey: null },
  { id: 'TrendLine',       label: 'Línea de tendencia', icon: TrendIcon,    toolKey: 'TrendLine' },
  { id: 'HorizontalLine',  label: 'Línea horizontal',   icon: HLineIcon,    toolKey: 'HorizontalLine' },
  { id: 'Rectangle',       label: 'Rectángulo',         icon: RectIcon,     toolKey: 'Rectangle' },
  { id: 'FibRetracement',  label: 'Fibonacci',          icon: FibIcon,      toolKey: 'FibRetracement' },
  { id: 'LongShortPosition',label: 'Long / Short',      icon: PosIcon,      toolKey: 'LongShortPosition' },
  { id: 'PriceRange',      label: 'Regla',              icon: RulerIcon,    toolKey: 'PriceRange' },
]

// Pill style — liquid glass, same as ReplayPill
const PILL = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  background: 'rgba(255,255,255,0.10)',
  border: '1px solid rgba(255,255,255,0.22)',
  borderRadius: 12,
  padding: '6px 10px',
  backdropFilter: 'blur(40px) saturate(220%) brightness(1.1)',
  WebkitBackdropFilter: 'blur(40px) saturate(220%) brightness(1.1)',
  boxShadow: '0 8px 32px rgba(0,0,0,0.4),inset 0 1px 0 rgba(255,255,255,0.3),inset 0 -1px 0 rgba(0,0,0,0.1)',
  userSelect: 'none',
  fontFamily: "'Montserrat',sans-serif",
}

const DIVIDER = { width: 1, height: 16, background: 'rgba(255,255,255,0.12)', margin: '0 4px', flexShrink: 0 }

const toolBtn = (active) => ({
  background: active ? 'rgba(41,98,255,0.45)' : 'rgba(255,255,255,0.06)',
  border: active ? '1px solid rgba(41,98,255,0.7)' : '1px solid rgba(255,255,255,0.1)',
  borderRadius: 7,
  color: '#fff',
  width: 28,
  height: 28,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 0,
  flexShrink: 0,
  fontFamily: "'Montserrat',sans-serif",
})

// ── Main toolbar ──────────────────────────────────────────────────────────────
export default function DrawingToolbarV2({
  activeTool, onToolChange, onAddTool,
  onRemoveSelected, onRemoveAll,
  drawingCount, templates, onSaveTemplate, onLoadTemplate,
}) {
  const [pos, setPos]           = useState({ x: null, y: null }) // null = centered top
  const [showTemplates, setShowTemplates] = useState(false)
  const [templateName, setTemplateName]   = useState('')
  const dragRef = useRef(null)

  const onMouseDown = (e) => {
    if (e.target.tagName === 'BUTTON' || e.target.closest('button') || e.target.tagName === 'INPUT') return
    const rect = e.currentTarget.getBoundingClientRect()
    dragRef.current = { offX: e.clientX - rect.left, offY: e.clientY - rect.top }
    const onMove = (ev) => setPos({ x: ev.clientX - dragRef.current.offX, y: ev.clientY - dragRef.current.offY })
    const onUp = () => { dragRef.current = null; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    e.preventDefault()
  }

  const pillStyle = {
    ...PILL,
    position: 'absolute',
    cursor: 'grab',
    zIndex: 25,
    ...(pos.x != null
      ? { left: pos.x, top: pos.y }
      : { left: '50%', top: 76, transform: 'translateX(-50%)' }
    ),
  }

  return (
    <>
      <div style={pillStyle} onMouseDown={onMouseDown}>

        {/* Herramientas */}
        {TOOLS.map((tool, i) => (
          <div key={tool.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {i === 1 && <div style={DIVIDER} />}
            <button
              title={tool.label}
              style={toolBtn(activeTool === tool.id)}
              onClick={() => {
                onToolChange(tool.id)
                if (tool.toolKey) onAddTool(tool.toolKey)
              }}
            >
              <tool.icon />
            </button>
          </div>
        ))}

        <div style={DIVIDER} />

        {/* Plantillas */}
        <div style={{ position: 'relative' }}>
          <button
            title="Plantillas"
            style={toolBtn(showTemplates)}
            onClick={() => setShowTemplates(v => !v)}
          >
            <TemplateIcon />
          </button>

          {showTemplates && (
            <>
              <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => setShowTemplates(false)} />
              <div style={{
                position: 'absolute', top: 36, left: '50%', transform: 'translateX(-50%)',
                background: 'rgba(4,10,24,0.97)',
                border: '1px solid rgba(30,144,255,0.3)',
                borderRadius: 12, zIndex: 100, minWidth: 200,
                boxShadow: '0 8px 40px rgba(0,0,0,0.7)',
                backdropFilter: 'blur(40px)',
                WebkitBackdropFilter: 'blur(40px)',
                padding: '8px 0',
                fontFamily: "'Montserrat',sans-serif",
              }}>
                {/* Guardar plantilla */}
                <div style={{ padding: '6px 12px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.5)', letterSpacing: 1, marginBottom: 6 }}>GUARDAR PLANTILLA</div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input
                      value={templateName}
                      onChange={e => setTemplateName(e.target.value)}
                      placeholder="Nombre..."
                      style={{
                        flex: 1, background: 'rgba(255,255,255,0.06)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: 6, padding: '4px 8px',
                        color: '#fff', fontSize: 10,
                        fontFamily: "'Montserrat',sans-serif",
                        outline: 'none',
                      }}
                    />
                    <button
                      onClick={() => { if (templateName.trim()) { onSaveTemplate(templateName.trim()); setTemplateName(''); setShowTemplates(false) } }}
                      style={{
                        background: 'rgba(41,98,255,0.3)', border: '1px solid rgba(41,98,255,0.5)',
                        borderRadius: 6, color: '#fff', fontSize: 10, fontWeight: 700,
                        padding: '4px 10px', cursor: 'pointer',
                        fontFamily: "'Montserrat',sans-serif",
                      }}
                    >Guardar</button>
                  </div>
                </div>

                {/* Lista de plantillas */}
                {templates.length > 0 ? (
                  <div>
                    <div style={{ padding: '6px 12px 4px', fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.5)', letterSpacing: 1 }}>PLANTILLAS GUARDADAS</div>
                    {templates.map(t => (
                      <button key={t.id} onClick={() => { onLoadTemplate(t); setShowTemplates(false) }}
                        style={{
                          display: 'block', width: '100%', background: 'none',
                          border: 'none', color: '#fff', fontSize: 11,
                          fontWeight: 600, padding: '7px 14px',
                          cursor: 'pointer', textAlign: 'left',
                          fontFamily: "'Montserrat',sans-serif",
                        }}
                      >{t.name}</button>
                    ))}
                  </div>
                ) : (
                  <div style={{ padding: '8px 14px', fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>Sin plantillas guardadas</div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Borrar todo */}
        {drawingCount > 0 && (
          <>
            <div style={DIVIDER} />
            <button title="Borrar todo" style={{ ...toolBtn(false), color: '#ef5350', borderColor: 'rgba(239,83,80,0.3)', background: 'rgba(239,83,80,0.08)' }}
              onClick={onRemoveAll}>
              <TrashIcon />
            </button>
          </>
        )}
      </div>
    </>
  )
}

// ── Config pill — aparece al seleccionar un dibujo ────────────────────────────
export function DrawingConfigPill({ selectedTool, onUpdate, onDelete, onLock, onDeselect }) {
  const [color,  setColor]  = useState(selectedTool?.color  || '#ffffff')
  const [width,  setWidth]  = useState(selectedTool?.width  || 1)
  const [style,  setStyle]  = useState(selectedTool?.style  || 'solid')
  const [fillColor, setFillColor] = useState(selectedTool?.fillColor || 'rgba(41,98,255,0.1)')
  const [pos, setPos]       = useState({ x: null, y: null })
  const dragRef = useRef(null)

  useEffect(() => {
    if (selectedTool) {
      setColor(selectedTool.color || '#ffffff')
      setWidth(selectedTool.width || 1)
      setStyle(selectedTool.style || 'solid')
      setFillColor(selectedTool.fillColor || 'rgba(41,98,255,0.1)')
    }
  }, [selectedTool?.id])

  if (!selectedTool) return null

  const apply = (overrides) => {
    onUpdate({ color, width, style, fillColor, ...overrides })
  }

  const onMouseDown = (e) => {
    if (e.target.tagName === 'BUTTON' || e.target.closest('button') || e.target.tagName === 'INPUT') return
    const rect = e.currentTarget.getBoundingClientRect()
    dragRef.current = { offX: e.clientX - rect.left, offY: e.clientY - rect.top }
    const onMove = (ev) => setPos({ x: ev.clientX - dragRef.current.offX, y: ev.clientY - dragRef.current.offY })
    const onUp = () => { dragRef.current = null; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    e.preventDefault()
  }

  const pillStyle = {
    ...PILL,
    position: 'fixed',
    cursor: 'grab',
    zIndex: 200,
    ...(pos.x != null
      ? { left: pos.x, top: pos.y }
      : { right: 80, top: 80 }
    ),
  }

  const WIDTHS = [1, 2, 3]
  const STYLES = [
    { key: 'solid',  label: '—' },
    { key: 'dashed', label: '- -' },
    { key: 'dotted', label: '···' },
  ]

  return (
    <div style={pillStyle} onMouseDown={onMouseDown}>

      {/* Color línea */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
        <span style={{ fontSize: 7, color: 'rgba(255,255,255,0.5)', letterSpacing: 0.5 }}>COLOR</span>
        <input type="color" value={color}
          onChange={e => { setColor(e.target.value); apply({ color: e.target.value }) }}
          style={{ width: 22, height: 22, border: 'none', borderRadius: 4, cursor: 'pointer', padding: 0, background: 'none' }}
        />
      </div>

      <div style={DIVIDER} />

      {/* Color fondo */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
        <span style={{ fontSize: 7, color: 'rgba(255,255,255,0.5)', letterSpacing: 0.5 }}>FONDO</span>
        <input type="color" value={fillColor.startsWith('rgba') ? '#1E90FF' : fillColor}
          onChange={e => { const v = e.target.value + '40'; setFillColor(v); apply({ fillColor: v }) }}
          style={{ width: 22, height: 22, border: 'none', borderRadius: 4, cursor: 'pointer', padding: 0, background: 'none' }}
        />
      </div>

      <div style={DIVIDER} />

      {/* Grosor */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
        <span style={{ fontSize: 7, color: 'rgba(255,255,255,0.5)', letterSpacing: 0.5 }}>GROSOR</span>
        <div style={{ display: 'flex', gap: 2 }}>
          {WIDTHS.map(w => (
            <button key={w}
              onClick={() => { setWidth(w); apply({ width: w }) }}
              style={{
                background: width === w ? 'rgba(41,98,255,0.4)' : 'rgba(255,255,255,0.06)',
                border: width === w ? '1px solid rgba(41,98,255,0.6)' : '1px solid rgba(255,255,255,0.1)',
                borderRadius: 4, color: '#fff', width: 20, height: 20,
                cursor: 'pointer', fontSize: 9, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: "'Montserrat',sans-serif",
              }}
            >{w}</button>
          ))}
        </div>
      </div>

      <div style={DIVIDER} />

      {/* Estilo línea */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
        <span style={{ fontSize: 7, color: 'rgba(255,255,255,0.5)', letterSpacing: 0.5 }}>ESTILO</span>
        <div style={{ display: 'flex', gap: 2 }}>
          {STYLES.map(s => (
            <button key={s.key}
              onClick={() => { setStyle(s.key); apply({ style: s.key }) }}
              style={{
                background: style === s.key ? 'rgba(41,98,255,0.4)' : 'rgba(255,255,255,0.06)',
                border: style === s.key ? '1px solid rgba(41,98,255,0.6)' : '1px solid rgba(255,255,255,0.1)',
                borderRadius: 4, color: '#fff', minWidth: 26, height: 20,
                cursor: 'pointer', fontSize: 10, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: "'Montserrat',sans-serif",
              }}
            >{s.label}</button>
          ))}
        </div>
      </div>

      <div style={DIVIDER} />

      {/* Acciones */}
      <button title="Bloquear" onClick={onLock}
        style={{ ...toolBtn(false) }}><LockIcon /></button>

      <button title="Eliminar" onClick={onDelete}
        style={{ ...toolBtn(false), color: '#ef5350', borderColor: 'rgba(239,83,80,0.3)', background: 'rgba(239,83,80,0.08)' }}
      ><TrashIcon /></button>

      <button title="Cerrar" onClick={onDeselect}
        style={{ ...toolBtn(false), fontSize: 10 }}>✕</button>
    </div>
  )
}

// ── Icons ─────────────────────────────────────────────────────────────────────
function CursorIcon() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M4 2l16 11-7 1.5-4 8z"/></svg>
}
function TrendIcon() {
  return <svg width="13" height="13" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" fill="none"><line x1="3" y1="20" x2="21" y2="4"/><circle cx="3" cy="20" r="1.5" fill="currentColor"/><circle cx="21" cy="4" r="1.5" fill="currentColor"/></svg>
}
function HLineIcon() {
  return <svg width="13" height="13" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" fill="none"><line x1="2" y1="12" x2="22" y2="12"/><circle cx="2" cy="12" r="1.5" fill="currentColor"/><circle cx="22" cy="12" r="1.5" fill="currentColor"/></svg>
}
function RectIcon() {
  return <svg width="13" height="13" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" fill="none"><rect x="3" y="6" width="18" height="12" rx="1"/></svg>
}
function FibIcon() {
  return <svg width="13" height="13" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" fill="none"><line x1="2" y1="4" x2="22" y2="4"/><line x1="2" y1="9" x2="22" y2="9"/><line x1="2" y1="13" x2="22" y2="13"/><line x1="2" y1="17" x2="22" y2="17"/><line x1="2" y1="21" x2="22" y2="21"/></svg>
}
function PosIcon() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="8" rx="1" stroke="#2962FF"/><rect x="3" y="13" width="18" height="8" rx="1" stroke="#ef5350"/></svg>
}
function RulerIcon() {
  return <svg width="13" height="13" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none"><path d="M3 21L21 3"/><path d="M8 16l-2 2M12 12l-2 2M16 8l-2 2"/></svg>
}
function TemplateIcon() {
  return <svg width="13" height="13" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="9" x2="9" y2="21"/></svg>
}
function TrashIcon() {
  return <svg width="12" height="12" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none"><polyline points="3,6 5,6 21,6"/><path d="M19,6l-1,14H6L5,6"/><path d="M10,11v6M14,11v6"/><path d="M9,6V4h6v2"/></svg>
}
function LockIcon() {
  return <svg width="12" height="12" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
}
