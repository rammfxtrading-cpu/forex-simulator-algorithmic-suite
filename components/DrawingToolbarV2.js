/**
 * DrawingToolbarV2.js
 * Píldora horizontal + píldora contextual de configuración
 * Mismo liquid glass design que ReplayPill
 */
import { useState, useRef, useEffect } from 'react'

const TOOLS = [
  { id: 'cursor',           label: 'Cursor',              icon: CursorIcon,   toolKey: null },
  { id: 'TrendLine',        label: 'Línea de tendencia',  icon: TrendIcon,    toolKey: 'TrendLine' },
  { id: 'HorizontalLine',   label: 'Línea horizontal',    icon: HLineIcon,    toolKey: 'HorizontalLine' },
  { id: 'Rectangle',        label: 'Rectángulo',          icon: RectIcon,     toolKey: 'Rectangle' },
  { id: 'FibRetracement',   label: 'Fibonacci',           icon: FibIcon,      toolKey: 'FibRetracement' },
  { id: 'LongShortPosition',label: 'Long / Short',        icon: PosIcon,      toolKey: 'LongShortPosition' },
]

const PILL = {
  display: 'flex', alignItems: 'center', gap: 4,
  background: 'rgba(255,255,255,0.10)',
  border: '1px solid rgba(255,255,255,0.22)',
  borderRadius: 12, padding: '6px 10px',
  backdropFilter: 'blur(40px) saturate(220%) brightness(1.1)',
  WebkitBackdropFilter: 'blur(40px) saturate(220%) brightness(1.1)',
  boxShadow: '0 8px 32px rgba(0,0,0,0.4),inset 0 1px 0 rgba(255,255,255,0.3),inset 0 -1px 0 rgba(0,0,0,0.1)',
  userSelect: 'none', fontFamily: "'Montserrat',sans-serif",
}
const DIV = { width:1, height:16, background:'rgba(255,255,255,0.12)', margin:'0 4px', flexShrink:0 }
const btn = (active, danger) => ({
  background: danger ? 'rgba(239,83,80,0.10)' : active ? 'rgba(41,98,255,0.45)' : 'rgba(255,255,255,0.06)',
  border: danger ? '1px solid rgba(239,83,80,0.35)' : active ? '1px solid rgba(41,98,255,0.7)' : '1px solid rgba(255,255,255,0.1)',
  borderRadius: 7, color: danger ? '#ef5350' : '#fff',
  width: 28, height: 28, cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  padding: 0, flexShrink: 0, fontFamily: "'Montserrat',sans-serif",
})

function useDrag(initialPos) {
  const [pos, setPos] = useState(initialPos)
  const dragRef = useRef(null)
  const onMouseDown = (e) => {
    if (e.target.tagName === 'BUTTON' || e.target.closest('button') || e.target.tagName === 'INPUT') return
    const rect = e.currentTarget.getBoundingClientRect()
    dragRef.current = { offX: e.clientX - rect.left, offY: e.clientY - rect.top }
    const onMove = (ev) => setPos({ x: ev.clientX - dragRef.current.offX, y: ev.clientY - dragRef.current.offY })
    const onUp   = () => { dragRef.current = null; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    e.preventDefault()
  }
  return [pos, onMouseDown]
}

// ── Main toolbar ──────────────────────────────────────────────────────────────
export default function DrawingToolbarV2({ activeTool, onToolChange, onAddTool, onRemoveSelected, onRemoveAll, drawingCount, templates, onSaveTemplate, onLoadTemplate }) {
  const [pos, onMouseDown] = useDrag({ x: null, y: null })
  const [showTemplates, setShowTemplates] = useState(false)
  const [templateName, setTemplateName]   = useState('')

  const pillStyle = {
    ...PILL, position: 'absolute', cursor: 'grab', zIndex: 25,
    ...(pos.x != null ? { left: pos.x, top: pos.y } : { left: '50%', top: 76, transform: 'translateX(-50%)' }),
  }

  return (
    <div style={pillStyle} onMouseDown={onMouseDown}>
      {TOOLS.map((tool, i) => (
        <div key={tool.id} style={{ display:'flex', alignItems:'center', gap:4 }}>
          {i === 1 && <div style={DIV} />}
          <button title={tool.label} style={btn(activeTool === tool.id)} onClick={() => {
            onToolChange(tool.id)
            if (tool.toolKey) onAddTool(tool.toolKey)
          }}><tool.icon /></button>
        </div>
      ))}

      <div style={DIV} />

      {/* Plantillas */}
      <div style={{ position:'relative' }}>
        <button title="Plantillas" style={btn(showTemplates)} onClick={() => setShowTemplates(v => !v)}><TemplateIcon /></button>
        {showTemplates && (
          <>
            <div style={{ position:'fixed', inset:0, zIndex:99 }} onClick={() => setShowTemplates(false)} />
            <div style={{
              position:'absolute', top:36, left:'50%', transform:'translateX(-50%)',
              background:'rgba(4,10,24,0.97)', border:'1px solid rgba(30,144,255,0.3)',
              borderRadius:12, zIndex:100, minWidth:210,
              boxShadow:'0 8px 40px rgba(0,0,0,0.7)',
              backdropFilter:'blur(40px)', WebkitBackdropFilter:'blur(40px)',
              fontFamily:"'Montserrat',sans-serif",
            }}>
              <div style={{ padding:'8px 12px 10px', borderBottom:'1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ fontSize:8, fontWeight:700, color:'rgba(255,255,255,0.4)', letterSpacing:1.5, marginBottom:6 }}>GUARDAR PLANTILLA ACTUAL</div>
                <div style={{ display:'flex', gap:6 }}>
                  <input value={templateName} onChange={e => setTemplateName(e.target.value)}
                    placeholder="Nombre de plantilla..."
                    style={{ flex:1, background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:6, padding:'4px 8px', color:'#fff', fontSize:10, fontFamily:"'Montserrat',sans-serif", outline:'none' }}
                  />
                  <button onClick={() => { if (templateName.trim()) { onSaveTemplate(templateName.trim()); setTemplateName(''); setShowTemplates(false) } }}
                    style={{ background:'rgba(41,98,255,0.3)', border:'1px solid rgba(41,98,255,0.5)', borderRadius:6, color:'#fff', fontSize:10, fontWeight:700, padding:'4px 10px', cursor:'pointer', fontFamily:"'Montserrat',sans-serif" }}>
                    Guardar
                  </button>
                </div>
              </div>
              <div>
                <div style={{ padding:'6px 12px 4px', fontSize:8, fontWeight:700, color:'rgba(255,255,255,0.4)', letterSpacing:1.5 }}>PLANTILLAS GUARDADAS</div>
                {templates.length === 0
                  ? <div style={{ padding:'8px 14px 10px', fontSize:10, color:'rgba(255,255,255,0.25)' }}>Sin plantillas aún</div>
                  : templates.map(t => (
                    <button key={t.id} onClick={() => { onLoadTemplate(t); setShowTemplates(false) }}
                      style={{ display:'block', width:'100%', background:'none', border:'none', color:'#fff', fontSize:11, fontWeight:600, padding:'8px 14px', cursor:'pointer', textAlign:'left', fontFamily:"'Montserrat',sans-serif" }}>
                      {t.name}
                    </button>
                  ))
                }
              </div>
            </div>
          </>
        )}
      </div>

      {drawingCount > 0 && (<><div style={DIV} /><button title="Borrar todo" style={btn(false, true)} onClick={onRemoveAll}><TrashIcon /></button></>)}
    </div>
  )
}

// ── Config pill contextual ─────────────────────────────────────────────────────
export function DrawingConfigPill({ selectedTool, toolKey, toolConfig, onUpdate, onDelete, onDeselect }) {
  const [pos, onMouseDown] = useDrag({ x: null, y: null })
  const [label, setLabel]  = useState(toolConfig?.label || '')
  const [showLabel, setShowLabel] = useState(false)

  useEffect(() => {
    setLabel(toolConfig?.label || '')
    setShowLabel(false)
  }, [selectedTool?.id])

  if (!selectedTool) return null

  const cfg = toolConfig || {}

  const apply = (overrides) => {
    const newCfg = { ...cfg, ...overrides }
    onUpdate(newCfg)
  }

  const WIDTHS  = [1, 2, 3]
  const STYLES  = [
    { key: 0, label: '—',   title: 'Sólido' },
    { key: 2, label: '- -', title: 'Discontinua' },
    { key: 1, label: '···', title: 'Punteada' },
  ]

  const pillStyle = {
    ...PILL, position: 'fixed', cursor: 'grab', zIndex: 200,
    ...(pos.x != null ? { left: pos.x, top: pos.y } : { right: 80, top: 80 }),
  }

  return (
    <div style={pillStyle} onMouseDown={onMouseDown}>

      {/* Color línea */}
      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:2 }}>
        <span style={{ fontSize:7, color:'rgba(255,255,255,0.45)', letterSpacing:0.5 }}>LÍNEA</span>
        <label style={{ width:22, height:22, borderRadius:4, overflow:'hidden', cursor:'pointer', border:'1px solid rgba(255,255,255,0.15)', display:'block', background: cfg.color }}>
          <input type="color" value={cfg.color || '#ffffff'} onChange={e => apply({ color: e.target.value })}
            style={{ opacity:0, width:'100%', height:'100%', cursor:'pointer' }} />
        </label>
      </div>

      <div style={DIV} />

      {/* Color fondo */}
      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:2 }}>
        <span style={{ fontSize:7, color:'rgba(255,255,255,0.45)', letterSpacing:0.5 }}>FONDO</span>
        <label style={{ width:22, height:22, borderRadius:4, overflow:'hidden', cursor:'pointer', border:'1px solid rgba(255,255,255,0.15)', display:'block', background: cfg.fillColor || 'transparent' }}>
          <input type="color" value={'#2962FF'} onChange={e => apply({ fillColor: e.target.value + '28' })}
            style={{ opacity:0, width:'100%', height:'100%', cursor:'pointer' }} />
        </label>
      </div>

      <div style={DIV} />

      {/* Grosor */}
      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:2 }}>
        <span style={{ fontSize:7, color:'rgba(255,255,255,0.45)', letterSpacing:0.5 }}>GROSOR</span>
        <div style={{ display:'flex', gap:2 }}>
          {WIDTHS.map(w => (
            <button key={w} onClick={() => apply({ width: w })}
              style={{ ...btn(cfg.width === w), width:20, height:20, fontSize:9, fontWeight:700 }}>{w}</button>
          ))}
        </div>
      </div>

      <div style={DIV} />

      {/* Estilo */}
      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:2 }}>
        <span style={{ fontSize:7, color:'rgba(255,255,255,0.45)', letterSpacing:0.5 }}>ESTILO</span>
        <div style={{ display:'flex', gap:2 }}>
          {STYLES.map(s => (
            <button key={s.key} title={s.title} onClick={() => apply({ style: s.key })}
              style={{ ...btn(cfg.style === s.key), minWidth:24, height:20, fontSize:10 }}>{s.label}</button>
          ))}
        </div>
      </div>

      <div style={DIV} />

      {/* Label / texto */}
      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:2, position:'relative' }}>
        <span style={{ fontSize:7, color:'rgba(255,255,255,0.45)', letterSpacing:0.5 }}>TEXTO</span>
        <button title="Añadir texto" style={btn(showLabel)} onClick={() => setShowLabel(v => !v)}><TextIcon /></button>
        {showLabel && (
          <div style={{ position:'absolute', top:36, left:'50%', transform:'translateX(-50%)', zIndex:300, background:'rgba(4,10,24,0.97)', border:'1px solid rgba(30,144,255,0.3)', borderRadius:8, padding:'8px', display:'flex', gap:6, boxShadow:'0 4px 24px rgba(0,0,0,0.6)' }}>
            <input value={label} onChange={e => setLabel(e.target.value)}
              placeholder="Etiqueta..." autoFocus
              onKeyDown={e => { if(e.key==='Enter'){apply({label});setShowLabel(false)} if(e.key==='Escape')setShowLabel(false) }}
              style={{ background:'rgba(255,255,255,0.08)', border:'1px solid rgba(255,255,255,0.15)', borderRadius:6, padding:'4px 8px', color:'#fff', fontSize:11, fontFamily:"'Montserrat',sans-serif", outline:'none', width:140 }}
            />
            <button onClick={() => { apply({ label }); setShowLabel(false) }}
              style={{ background:'rgba(41,98,255,0.4)', border:'1px solid rgba(41,98,255,0.6)', borderRadius:6, color:'#fff', fontSize:10, fontWeight:700, padding:'4px 8px', cursor:'pointer', fontFamily:"'Montserrat',sans-serif" }}>
              OK
            </button>
          </div>
        )}
      </div>

      <div style={DIV} />

      {/* Borrar */}
      <button title="Borrar (Del)" style={btn(false, true)} onClick={onDelete}><TrashIcon /></button>

      {/* Cerrar */}
      <button title="Cerrar" style={{ ...btn(false), fontSize:10 }} onClick={onDeselect}>✕</button>
    </div>
  )
}

// ── Context menu al hacer clic derecho sobre dibujo ───────────────────────────
export function DrawingContextMenu({ x, y, onDelete, onClose }) {
  if (!x && !y) return null
  return (
    <>
      <div style={{ position:'fixed', inset:0, zIndex:998 }} onClick={onClose} />
      <div style={{
        position:'fixed', left:x, top:y, zIndex:999,
        background:'rgba(4,10,24,0.96)', border:'1px solid rgba(30,144,255,0.3)',
        borderRadius:10, minWidth:160, overflow:'hidden',
        boxShadow:'0 8px 40px rgba(0,0,0,0.7)',
        backdropFilter:'blur(40px)', WebkitBackdropFilter:'blur(40px)',
        fontFamily:"'Montserrat',sans-serif",
      }}>
        <button onClick={() => { onDelete(); onClose() }} style={{
          display:'flex', justifyContent:'space-between', alignItems:'center',
          width:'100%', background:'none', border:'none',
          color:'#ef5350', fontSize:11, fontWeight:600,
          padding:'10px 14px', cursor:'pointer', fontFamily:"'Montserrat',sans-serif", gap:16,
        }}>
          <span>🗑 Eliminar dibujo</span>
          <span style={{ fontSize:9, color:'rgba(239,83,80,0.6)' }}>Del</span>
        </button>
        <button onClick={onClose} style={{
          display:'block', width:'100%', background:'none',
          border:'none', borderTop:'1px solid rgba(255,255,255,0.06)',
          color:'rgba(255,255,255,0.5)', fontSize:11, fontWeight:600,
          padding:'8px 14px', cursor:'pointer', textAlign:'left', fontFamily:"'Montserrat',sans-serif",
        }}>Cerrar</button>
      </div>
    </>
  )
}

// ── Icons ─────────────────────────────────────────────────────────────────────
function CursorIcon()   { return <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M4 2l16 11-7 1.5-4 8z"/></svg> }
function TrendIcon()    { return <svg width="13" height="13" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" fill="none"><line x1="3" y1="20" x2="21" y2="4"/><circle cx="3" cy="20" r="1.5" fill="currentColor"/><circle cx="21" cy="4" r="1.5" fill="currentColor"/></svg> }
function HLineIcon()    { return <svg width="13" height="13" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" fill="none"><line x1="2" y1="12" x2="22" y2="12"/><circle cx="2" cy="12" r="1.5" fill="currentColor"/><circle cx="22" cy="12" r="1.5" fill="currentColor"/></svg> }
function RectIcon()     { return <svg width="13" height="13" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" fill="none"><rect x="3" y="6" width="18" height="12" rx="1"/></svg> }
function FibIcon()      { return <svg width="13" height="13" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" fill="none"><line x1="2" y1="4" x2="22" y2="4"/><line x1="2" y1="9" x2="22" y2="9"/><line x1="2" y1="13" x2="22" y2="13"/><line x1="2" y1="17" x2="22" y2="17"/><line x1="2" y1="21" x2="22" y2="21"/></svg> }
function PosIcon()      { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="8" rx="1" stroke="#26a69a"/><rect x="3" y="13" width="18" height="8" rx="1" stroke="#ef5350"/></svg> }
function TemplateIcon() { return <svg width="13" height="13" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="9" x2="9" y2="21"/></svg> }
function TrashIcon()    { return <svg width="12" height="12" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none"><polyline points="3,6 5,6 21,6"/><path d="M19,6l-1,14H6L5,6"/><path d="M10,11v6M14,11v6"/><path d="M9,6V4h6v2"/></svg> }
function TextIcon()     { return <svg width="12" height="12" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none"><polyline points="4,7 4,4 20,4 20,7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg> }
