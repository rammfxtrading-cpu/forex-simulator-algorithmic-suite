/**
 * DrawingToolbarV2.js v3
 * Píldora horizontal + píldora contextual completa
 * - Color línea, fondo, grosor, estilo
 * - Texto con tamaño y alineación (vertical + horizontal)
 * - Plantillas en la config pill (···)
 * - Cambios en tiempo real al dibujo seleccionado
 */
import { useState, useRef, useEffect } from 'react'

const TOOLS = [
  { id: 'cursor',           label: 'Cursor',             icon: CursorIcon,   toolKey: null },
  { id: 'TrendLine',        label: 'Línea de tendencia', icon: TrendIcon,    toolKey: 'TrendLine' },
  { id: 'Path',             label: 'Path',               icon: PathIcon,     toolKey: 'Path' },
  { id: 'Rectangle',        label: 'Rectángulo',         icon: RectIcon,     toolKey: 'Rectangle' },
  { id: 'FibRetracement',   label: 'Fibonacci',          icon: FibIcon,      toolKey: 'FibRetracement' },
  { id: 'LongShortPosition',label: 'Long / Short',       icon: PosIcon,      toolKey: 'LongShortPosition' },
  { id: 'text',             label: 'Texto',              icon: TextIcon,     toolKey: null },
  { id: 'ruler',            label: 'Regla',              icon: RulerIcon,    toolKey: null },
]

const PILL = {
  display:'flex',alignItems:'center',gap:4,
  background:'rgba(255,255,255,0.10)',
  border:'1px solid rgba(255,255,255,0.22)',
  borderRadius:12,padding:'6px 10px',
  backdropFilter:'blur(40px) saturate(220%) brightness(1.1)',
  WebkitBackdropFilter:'blur(40px) saturate(220%) brightness(1.1)',
  boxShadow:'0 8px 32px rgba(0,0,0,0.4),inset 0 1px 0 rgba(255,255,255,0.3)',
  userSelect:'none',fontFamily:"'Montserrat',sans-serif",
}
const DIV = { width:1,height:16,background:'rgba(255,255,255,0.12)',margin:'0 4px',flexShrink:0 }
const btn = (active,danger) => ({
  background: danger?'rgba(239,83,80,0.10)':active?'rgba(41,98,255,0.45)':'rgba(255,255,255,0.06)',
  border: danger?'1px solid rgba(239,83,80,0.35)':active?'1px solid rgba(41,98,255,0.7)':'1px solid rgba(255,255,255,0.1)',
  borderRadius:7,color:danger?'#ef5350':'#fff',
  width:28,height:28,cursor:'pointer',
  display:'flex',alignItems:'center',justifyContent:'center',
  padding:0,flexShrink:0,fontFamily:"'Montserrat',sans-serif",
})

function useDrag(init) {
  const [pos,setPos]=useState(init)
  const ref=useRef(null)
  const onMD=(e)=>{
    if(e.target.tagName==='BUTTON'||e.target.closest('button')||e.target.tagName==='INPUT'||e.target.tagName==='SELECT') return
    const r=e.currentTarget.getBoundingClientRect()
    ref.current={ox:e.clientX-r.left,oy:e.clientY-r.top}
    const mv=(ev)=>setPos({x:ev.clientX-ref.current.ox,y:ev.clientY-ref.current.oy})
    const up=()=>{ref.current=null;window.removeEventListener('mousemove',mv);window.removeEventListener('mouseup',up)}
    window.addEventListener('mousemove',mv);window.addEventListener('mouseup',up);e.preventDefault()
  }
  return [pos,onMD]
}

// ── Main toolbar ──────────────────────────────────────────────────────────────
export default function DrawingToolbarV2({ activeTool,onToolChange,onAddTool,onRemoveAll,drawingCount,templates,onSaveTemplate,onLoadTemplate }) {
  const [pos,onMD]=useDrag({x:null,y:null})
  const [showTpl,setShowTpl]=useState(false)
  const [tplName,setTplName]=useState('')

  return (
    <div style={{...PILL,position:'absolute',cursor:'grab',zIndex:25,...(pos.x!=null?{left:pos.x,top:pos.y}:{left:'50%',top:76,transform:'translateX(-50%)'})}} onMouseDown={onMD}>
      {TOOLS.map((tool,i)=>(
        <div key={tool.id} style={{display:'flex',alignItems:'center',gap:4}}>
          {i===1&&<div style={DIV}/>}
          <button title={tool.label} style={btn(activeTool===tool.id)} onClick={()=>{onToolChange(tool.id);if(tool.toolKey)onAddTool(tool.toolKey)}}><tool.icon/></button>
        </div>
      ))}

      {drawingCount>0&&(<><div style={DIV}/><button title="Borrar todo" style={btn(false,true)} onClick={onRemoveAll}><TrashIcon/></button></>)}
    </div>
  )
}

// ── Config pill ───────────────────────────────────────────────────────────────
export function DrawingConfigPill({ selectedTool,toolKey,toolConfig,onUpdate,onDelete,onDeselect,templates,onSaveTemplate,onLoadTemplate,onDeleteTemplate,onOpenConfig,visibleTf,onVisibilityChange }) {
  const [pos,onMD]=useDrag({x:null,y:null})
  const [showText,setShowText]=useState(false)
  const [showTpl,setShowTpl]=useState(false)
  const [showTf,setShowTf]=useState(false)
  const [tplName,setTplName]=useState('')
  const [label,setLabel]=useState('')

  useEffect(()=>{ setLabel(toolConfig?.label||''); setShowText(false); setShowTpl(false) },[selectedTool?.id])

  if(!selectedTool) return null
  const cfg=toolConfig||{}

  const apply=(patch)=>{
    const next={...cfg,...patch}
    onUpdate(next)
  }

  const WIDTHS=[1,2,3]
  const STYLES=[{k:0,l:'—',t:'Sólido'},{k:2,l:'╌╌',t:'Discontinua'},{k:1,l:'···',t:'Punteada'}]
  const FONT_SIZES=[9,10,11,12,14,16]
  const V_ALIGN=[{k:'top',l:'↑'},{k:'middle',l:'↕'},{k:'bottom',l:'↓'}]
  const H_ALIGN=[{k:'left',l:'←'},{k:'center',l:'↔'},{k:'right',l:'→'}]
  const hasRect=toolKey==='Rectangle'||toolKey==='FibRetracement'

  return (
    <div style={{...PILL,position:'fixed',cursor:'grab',zIndex:200,...(pos.x!=null?{left:pos.x,top:pos.y}:{right:80,top:80})}} onMouseDown={onMD} onClick={e=>e.stopPropagation()} onPointerDown={e=>e.stopPropagation()}>

      {/* Color línea */}
      {toolKey !== 'LongShortPosition' && <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:2}}>
        <span style={{fontSize:7,color:'rgba(255,255,255,0.45)',letterSpacing:0.5}}>LÍNEA</span>
        <label style={{width:22,height:22,borderRadius:4,cursor:'pointer',border:'1px solid rgba(255,255,255,0.2)',display:'block',background:cfg.color||'#fff',overflow:'hidden'}}>
          <input type="color" value={cfg.color||'#ffffff'} onChange={e=>apply({color:e.target.value})} style={{opacity:0,width:'100%',height:'100%',cursor:'pointer'}}/>
        </label>
      </div>}

      {hasRect&&<>
        <div style={DIV}/>
        <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:2}}>
          <span style={{fontSize:7,color:'rgba(255,255,255,0.45)',letterSpacing:0.5}}>FONDO</span>
          <label style={{width:22,height:22,borderRadius:4,cursor:'pointer',border:'1px solid rgba(255,255,255,0.2)',display:'block',overflow:'hidden',background:cfg.fillColor||'rgba(41,98,255,0.15)'}}>
            <input type="color" value='#2962FF' onChange={e=>apply({fillColor:e.target.value+'28'})} style={{opacity:0,width:'100%',height:'100%',cursor:'pointer'}}/>
          </label>
        </div>
      </>}

      {toolKey !== 'LongShortPosition' && <><div style={DIV}/>

      {/* Grosor */}
      <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:2}}>
        <span style={{fontSize:7,color:'rgba(255,255,255,0.45)',letterSpacing:0.5}}>GROSOR</span>
        <div style={{display:'flex',gap:2}}>
          {WIDTHS.map(w=><button key={w} onClick={()=>apply({width:w})} style={{...btn(cfg.width===w),width:20,height:20,fontSize:9,fontWeight:700}}>{w}</button>)}
        </div>
      </div>

      <div style={DIV}/>

      {/* Estilo */}
      <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:2}}>
        <span style={{fontSize:7,color:'rgba(255,255,255,0.45)',letterSpacing:0.5}}>ESTILO</span>
        <div style={{display:'flex',gap:2}}>
          {STYLES.map(s=><button key={s.k} title={s.t} onClick={()=>apply({style:s.k})} style={{...btn(cfg.style===s.k),minWidth:22,height:20,fontSize:9}}>{s.l}</button>)}
        </div>
      </div></>}

      {toolKey !== 'Path' && toolKey !== 'LongShortPosition' && <><div style={DIV}/>

      {/* Texto — no para Path */}
      <div style={{position:'relative'}}>
        <button title="Texto" style={btn(showText)} onClick={()=>setShowText(v=>!v)}><TextIcon/></button>
        {showText&&(
          <>
            <div style={{position:'fixed',inset:0,zIndex:299}} onClick={()=>setShowText(false)}/>
            <div style={{position:'absolute',bottom:36,left:'50%',transform:'translateX(-50%)',zIndex:300,background:'rgba(4,10,24,0.97)',border:'1px solid rgba(30,144,255,0.3)',borderRadius:10,padding:'10px',width:240,boxShadow:'0 4px 24px rgba(0,0,0,0.6)',fontFamily:"'Montserrat',sans-serif"}}>
              <div style={{fontSize:8,fontWeight:700,color:'rgba(255,255,255,0.4)',letterSpacing:1.5,marginBottom:6}}>ETIQUETA</div>
              <div style={{display:'flex',gap:6,marginBottom:8,alignItems:'center'}}>
                <label style={{display:'flex',alignItems:'center',gap:4,fontSize:9,color:'rgba(255,255,255,0.5)'}}>
                  Color texto
                  <span style={{width:18,height:18,borderRadius:3,border:'1px solid rgba(255,255,255,0.2)',display:'inline-block',background:cfg.textColor||cfg.color||'#ffffff',overflow:'hidden',cursor:'pointer'}}>
                    <input type="color" value={cfg.textColor||cfg.color||'#ffffff'} onChange={e=>apply({textColor:e.target.value})} style={{opacity:0,width:'100%',height:'100%',cursor:'pointer'}}/>
                  </span>
                </label>
              </div>
              <input value={label} onChange={e=>setLabel(e.target.value)}
                onKeyDown={e=>{if(e.key==='Enter'){apply({label});setShowText(false)}if(e.key==='Escape')setShowText(false)}}
                placeholder="Escribe aquí..." autoFocus
                style={{width:'100%',background:'rgba(255,255,255,0.08)',border:'1px solid rgba(255,255,255,0.15)',borderRadius:6,padding:'5px 8px',color:'#fff',fontSize:11,fontFamily:"'Montserrat',sans-serif",outline:'none',marginBottom:8,boxSizing:'border-box'}}
              />
              {/* Tamaño fuente */}
              <div style={{fontSize:8,fontWeight:700,color:'rgba(255,255,255,0.4)',letterSpacing:1.5,marginBottom:4}}>TAMAÑO</div>
              <div style={{display:'flex',gap:3,marginBottom:8}}>
                {FONT_SIZES.map(s=><button key={s} onClick={()=>apply({fontSize:s})} style={{...btn(cfg.fontSize===s),width:28,height:22,fontSize:9,fontWeight:700}}>{s}</button>)}
              </div>
              {/* Alineación vertical */}
              <div style={{fontSize:8,fontWeight:700,color:'rgba(255,255,255,0.4)',letterSpacing:1.5,marginBottom:4}}>POSICIÓN VERTICAL</div>
              <div style={{display:'flex',gap:3,marginBottom:8}}>
                {V_ALIGN.map(a=><button key={a.k} title={a.k} onClick={()=>apply({textV:a.k})} style={{...btn(cfg.textV===a.k),flex:1,height:22,fontSize:12}}>{a.l}</button>)}
              </div>
              {/* Alineación horizontal */}
              <div style={{fontSize:8,fontWeight:700,color:'rgba(255,255,255,0.4)',letterSpacing:1.5,marginBottom:4}}>POSICIÓN HORIZONTAL</div>
              <div style={{display:'flex',gap:3,marginBottom:8}}>
                {H_ALIGN.map(a=><button key={a.k} title={a.k} onClick={()=>apply({textH:a.k})} style={{...btn(cfg.textH===a.k),flex:1,height:22,fontSize:12}}>{a.l}</button>)}
              </div>
              <button onClick={()=>{apply({label});setShowText(false)}} style={{width:'100%',background:'rgba(41,98,255,0.4)',border:'1px solid rgba(41,98,255,0.6)',borderRadius:6,color:'#fff',fontSize:10,fontWeight:700,padding:'5px',cursor:'pointer',fontFamily:"'Montserrat',sans-serif"}}>Aplicar</button>
            </div>
          </>
        )}
      </div></> }

      <div style={DIV}/>

      {/* Plantillas en config pill — modal liquid glass */}
      <div style={{position:'relative'}}>
        <button title="Plantillas" style={btn(showTpl)} onClick={()=>setShowTpl(v=>!v)}><TemplateIcon/></button>
        {showTpl&&(
          <>
            <div style={{position:'fixed',inset:0,zIndex:399,background:'rgba(0,0,0,0.45)',backdropFilter:'blur(6px)',WebkitBackdropFilter:'blur(6px)'}} onClick={()=>setShowTpl(false)}/>
            <div style={{position:'fixed',top:'50%',left:'50%',transform:'translate(-50%,-50%)',zIndex:400,width:300,background:'rgba(8,14,30,0.82)',border:'1px solid rgba(255,255,255,0.1)',borderRadius:18,boxShadow:'0 8px 48px rgba(0,0,0,0.8)',backdropFilter:'blur(40px)',WebkitBackdropFilter:'blur(40px)',fontFamily:"'Montserrat',sans-serif",overflow:'hidden'}}>
              {/* Header */}
              <div style={{padding:'14px 16px 12px',borderBottom:'1px solid rgba(255,255,255,0.07)',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                <span style={{fontSize:11,fontWeight:700,color:'#fff',letterSpacing:0.5}}>Plantillas</span>
                <button onClick={()=>setShowTpl(false)} style={{background:'none',border:'none',color:'rgba(255,255,255,0.4)',cursor:'pointer',fontSize:16,lineHeight:1,padding:0}}>&times;</button>
              </div>
              {/* Guardar actual */}
              <div style={{padding:'12px 16px',borderBottom:'1px solid rgba(255,255,255,0.06)'}}>
                <div style={{fontSize:8,fontWeight:700,color:'rgba(255,255,255,0.35)',letterSpacing:1.5,marginBottom:8}}>GUARDAR CONFIGURACIÓN ACTUAL</div>
                <div style={{display:'flex',gap:6}}>
                  <input value={tplName} onChange={e=>setTplName(e.target.value)}
                    onKeyDown={e=>{if(e.key==='Enter'&&tplName.trim()){onSaveTemplate(tplName.trim());setTplName('');setShowTpl(false)}}}
                    placeholder="Nombre de la plantilla..." autoFocus
                    style={{flex:1,background:'rgba(255,255,255,0.07)',border:'1px solid rgba(255,255,255,0.12)',borderRadius:8,padding:'7px 10px',color:'#fff',fontSize:11,fontFamily:"'Montserrat',sans-serif",outline:'none'}}/>
                  <button onClick={()=>{if(tplName.trim()){onSaveTemplate(tplName.trim());setTplName('');setShowTpl(false)}}}
                    style={{background:'rgba(41,98,255,0.35)',border:'1px solid rgba(41,98,255,0.5)',borderRadius:8,color:'#fff',fontSize:11,fontWeight:700,padding:'7px 12px',cursor:'pointer',fontFamily:"'Montserrat',sans-serif",whiteSpace:'nowrap'}}>
                    Guardar
                  </button>
                </div>
              </div>
              {/* Lista plantillas */}
              <div style={{maxHeight:240,overflowY:'auto',padding:'8px 0'}}>
                <div style={{padding:'4px 16px 6px',fontSize:8,fontWeight:700,color:'rgba(255,255,255,0.35)',letterSpacing:1.5}}>PLANTILLAS GUARDADAS</div>
                {(!templates||templates.filter(t=>!toolKey||t.tool_key===toolKey).length===0)
                  ?<div style={{padding:'10px 16px',fontSize:11,color:'rgba(255,255,255,0.2)'}}>Sin plantillas para esta herramienta</div>
                  :templates.filter(t=>!toolKey||t.tool_key===toolKey).map(t=>(
                    <div key={t.id} style={{display:'flex',alignItems:'center',padding:'2px 8px 2px 16px',gap:6}}>
                      <button onClick={()=>{onLoadTemplate(t);setShowTpl(false)}}
                        style={{flex:1,background:'none',border:'none',color:'#fff',fontSize:11,fontWeight:600,padding:'8px 0',cursor:'pointer',textAlign:'left',fontFamily:"'Montserrat',sans-serif"}}>
                        {t.name}
                      </button>
                      {onDeleteTemplate&&<button onClick={()=>onDeleteTemplate(t.id)}
                        style={{background:'none',border:'none',color:'rgba(239,83,80,0.5)',cursor:'pointer',fontSize:14,padding:'4px',lineHeight:1,borderRadius:4,flexShrink:0}}
                        title="Eliminar">×</button>}
                    </div>
                  ))
                }
              </div>
            </div>
          </>
        )}
      </div>

      {toolKey === 'LongShortPosition' && <>
        {/* Color TP */}
        <label style={{display:'flex',alignItems:'center',gap:4,cursor:'pointer',title:'Color beneficio'}}>
          <span style={{width:16,height:16,borderRadius:3,background:cfg.profitColor||'rgba(38,166,154,0.4)',border:'1px solid rgba(255,255,255,0.2)',display:'inline-block',overflow:'hidden'}}>
            <input type="color" defaultValue="#26a69a" onChange={e=>apply({profitColor:e.target.value+'66'})} style={{opacity:0,width:'100%',height:'100%',cursor:'pointer'}}/>
          </span>
        </label>
        {/* Color SL */}
        <label style={{display:'flex',alignItems:'center',gap:4,cursor:'pointer',title:'Color stop'}}>
          <span style={{width:16,height:16,borderRadius:3,background:cfg.stopColor||'rgba(239,83,80,0.4)',border:'1px solid rgba(255,255,255,0.2)',display:'inline-block',overflow:'hidden'}}>
            <input type="color" defaultValue="#ef5350" onChange={e=>apply({stopColor:e.target.value+'66'})} style={{opacity:0,width:'100%',height:'100%',cursor:'pointer'}}/>
          </span>
        </label>
        {/* Color texto */}
        <label style={{display:'flex',alignItems:'center',gap:4,cursor:'pointer',title:'Color texto'}}>
          <span style={{width:16,height:16,borderRadius:3,background:cfg.textColor||'#ffffff',border:'1px solid rgba(255,255,255,0.2)',display:'inline-block',overflow:'hidden'}}>
            <input type="color" defaultValue="#ffffff" onChange={e=>apply({textColor:e.target.value})} style={{opacity:0,width:'100%',height:'100%',cursor:'pointer'}}/>
          </span>
        </label>
        <div style={DIV}/>
        <button title="Configurar posición" style={btn(false)} onClick={onOpenConfig}><GearIcon/></button>
      </>}

      <div style={DIV}/>

      {/* Visibilidad TF */}
      <div style={{position:'relative'}}>
        <button title="Visibilidad por temporalidad" style={btn(showTf)} onClick={()=>setShowTf(v=>!v)}><TfIcon/></button>
        {showTf&&(
          <>
            <div style={{position:'fixed',inset:0,zIndex:399,background:'rgba(0,0,0,0.45)',backdropFilter:'blur(6px)',WebkitBackdropFilter:'blur(6px)'}} onClick={()=>setShowTf(false)}/>
            <div style={{position:'fixed',top:'50%',left:'50%',transform:'translate(-50%,-50%)',zIndex:400,width:260,background:'rgba(8,14,30,0.82)',border:'1px solid rgba(255,255,255,0.1)',borderRadius:18,boxShadow:'0 8px 48px rgba(0,0,0,0.8)',backdropFilter:'blur(40px)',WebkitBackdropFilter:'blur(40px)',fontFamily:"'Montserrat',sans-serif",overflow:'hidden'}}>
              <div style={{padding:'14px 16px 12px',borderBottom:'1px solid rgba(255,255,255,0.07)',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                <span style={{fontSize:11,fontWeight:700,color:'#fff',letterSpacing:0.5}}>Visibilidad por temporalidad</span>
                <button onClick={()=>setShowTf(false)} style={{background:'none',border:'none',color:'rgba(255,255,255,0.4)',cursor:'pointer',fontSize:16,lineHeight:1,padding:0}}>&times;</button>
              </div>
              <div style={{padding:'12px 16px'}}>
                <div style={{fontSize:8,fontWeight:700,color:'rgba(255,255,255,0.35)',letterSpacing:1.5,marginBottom:10}}>MOSTRAR EN</div>
                <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
                  {['M1','M5','M15','M30','H1','H4','D1'].map(tf=>{
                    const active=(visibleTf||['M1','M5','M15','M30','H1','H4','D1']).includes(tf)
                    return <button key={tf} onClick={()=>{
                      const cur=visibleTf||['M1','M5','M15','M30','H1','H4','D1']
                      const next=active?cur.filter(t=>t!==tf):[...cur,tf]
                      onVisibilityChange&&onVisibilityChange(next)
                    }} style={{padding:'5px 10px',borderRadius:6,border:`1px solid ${active?'rgba(41,98,255,0.6)':'rgba(255,255,255,0.1)'}`,background:active?'rgba(41,98,255,0.3)':'rgba(255,255,255,0.04)',color:active?'#fff':'rgba(255,255,255,0.35)',fontSize:10,fontWeight:700,cursor:'pointer',fontFamily:"'Montserrat',sans-serif"}}>{tf}</button>
                  })}
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      <div style={DIV}/>

      {/* Borrar */}
      <button title="Borrar (Del)" style={btn(false,true)} onClick={onDelete}><TrashIcon/></button>
      {/* Cerrar */}
      <button title="Cerrar" style={{...btn(false),fontSize:10}} onClick={onDeselect}>✕</button>
    </div>
  )
}

// ── Context menu clic derecho ─────────────────────────────────────────────────
export function DrawingContextMenu({ x,y,onDelete,onClose }) {
  if(!x&&!y) return null
  return (
    <>
      <div style={{position:'fixed',inset:0,zIndex:998}} onClick={onClose}/>
      <div style={{position:'fixed',left:x,top:y,zIndex:999,background:'rgba(4,10,24,0.96)',border:'1px solid rgba(30,144,255,0.3)',borderRadius:10,minWidth:160,overflow:'hidden',boxShadow:'0 8px 40px rgba(0,0,0,0.7)',backdropFilter:'blur(40px)',WebkitBackdropFilter:'blur(40px)',fontFamily:"'Montserrat',sans-serif"}}>
        <button onClick={()=>{onDelete();onClose()}} style={{display:'flex',justifyContent:'space-between',alignItems:'center',width:'100%',background:'none',border:'none',color:'#ef5350',fontSize:11,fontWeight:600,padding:'10px 14px',cursor:'pointer',fontFamily:"'Montserrat',sans-serif",gap:16}}>
          <span>🗑 Eliminar dibujo</span>
          <span style={{fontSize:9,color:'rgba(239,83,80,0.6)'}}>Del</span>
        </button>
        <button onClick={onClose} style={{display:'block',width:'100%',background:'none',border:'none',borderTop:'1px solid rgba(255,255,255,0.06)',color:'rgba(255,255,255,0.5)',fontSize:11,fontWeight:600,padding:'8px 14px',cursor:'pointer',textAlign:'left',fontFamily:"'Montserrat',sans-serif"}}>Cerrar</button>
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
function PathIcon()     { return <svg width="13" height="13" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none"><path d="M3 17 C6 17 6 7 9 7 C12 7 12 17 15 17 C18 17 18 7 21 7"/></svg> }
function TfIcon() { return <svg width="13" height="13" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> }
function TemplateIcon() { return <svg width="13" height="13" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="9" x2="9" y2="21"/></svg> }
function GearIcon()     { return <svg width="13" height="13" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg> }
function TrashIcon()    { return <svg width="12" height="12" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none"><polyline points="3,6 5,6 21,6"/><path d="M19,6l-1,14H6L5,6"/><path d="M10,11v6M14,11v6"/><path d="M9,6V4h6v2"/></svg> }
function TextIcon()     { return <svg width="12" height="12" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none"><polyline points="4,7 4,4 20,4 20,7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg> }
function RulerIcon()    { return <svg width="13" height="13" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none"><rect x="2" y="8" width="20" height="8" rx="1"/><line x1="6" y1="8" x2="6" y2="12"/><line x1="10" y1="8" x2="10" y2="11"/><line x1="14" y1="8" x2="14" y2="11"/><line x1="18" y1="8" x2="18" y2="12"/></svg> }
