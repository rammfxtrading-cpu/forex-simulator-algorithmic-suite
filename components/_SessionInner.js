import dynamic from 'next/dynamic'
const OrderModal = dynamic(() => import('./OrderModal'), { ssr: false })
/**
 * pages/session/[id].js
 * Forex Simulator — Algorithmic Suite — R.A.M.M.FX TRADING™
 * Diseño unificado con Dashboard — red animada + cristal
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabase'
import ReplayEngine from '../lib/replayEngine'
import { fetchSessionCandles, setSeriesData, updateSeriesAt, setMasterTime, clearCurrentTime, getMasterTime, getSeriesData, getRealLen } from '../lib/sessionData'
import DrawingToolbarV2, { DrawingConfigPill, DrawingContextMenu } from './DrawingToolbarV2'
import LongShortModal from './LongShortModal'
import { useDrawingTools } from './useDrawingTools'
import ChartConfigPanel, { useChartConfig, applyChartConfig } from './ChartConfigPanel'
import RulerOverlay from './RulerOverlay'
import KillzonesOverlay from './KillzonesOverlay'
import useCustomDrawings, { DRAWING_TYPES } from './useCustomDrawings'
import CustomDrawingsOverlay from './CustomDrawingsOverlay'
import { fromScreenCoords, toScreenCoords } from '../lib/chartCoords'
import { useAuth } from '../lib/useAuth'
import NoAccess from './NoAccess'
import ChallengeHUD from './ChallengeHUD'
import ChallengePassedPhaseModal from './ChallengePassedPhaseModal'
import ChallengePassedAllModal from './ChallengePassedAllModal'
import ChallengeFailedModal from './ChallengeFailedModal'

const TF_LIST     = ['M1','M3','M5','M15','M30','H1','H4','D1']
const SPEED_OPTS  = [{l:'1×',v:1},{l:'5×',v:5},{l:'15×',v:15},{l:'60×',v:60},{l:'∞',v:500}]
const LOT_PRESETS = [0.01,0.05,0.1,0.25,0.5,1.0]
const RR_PRESETS  = [1,1.5,2,3]
const ALL_PAIRS   = ['EUR/USD','GBP/USD','USD/JPY','USD/CHF','AUD/USD','USD/CAD','NZD/USD','AUD/CAD','EUR/GBP','EUR/JPY','GBP/JPY']

function chartOpts(w,h){return{
  width:w,height:h,
  layout:{
    background:{color:'#000000'},
    textColor:'#ffffff',
    fontFamily:"'Montserrat',sans-serif",
    // FontSize 11 (antes 13). LWC calcula la densidad de ticks del eje Y
    // según el espacio que ocupan los labels. Con fontSize más pequeño caben
    // más ticks → resolución más fina (cada 25-10-5 pips según zoom),
    // similar a TradingView. Si subes a 13 vuelven los ticks de 50 en 50.
    fontSize:11,
  },
  grid:{
    vertLines:{color:'rgba(255,255,255,0.03)',style:0,visible:false},
    horzLines:{color:'rgba(255,255,255,0.06)',style:0,visible:false},
  },
  crosshair:{
    mode:0,
    vertLine:{color:'#ffffff',labelBackgroundColor:'#1a1a2e',width:1,style:2},
    horzLine:{color:'#ffffff',labelBackgroundColor:'#1a1a2e',width:1,style:2},
  },
  rightPriceScale:{
    borderColor:'rgba(255,255,255,0.1)',
    textColor:'#ffffff',
    scaleMargins:{top:0.02,bottom:0.02},
    autoScale:true,
    mode:0,
    ticksVisible:true,
    minimumWidth:60,
    entireTextOnly:false,
  },
  timeScale:{
    borderColor:'rgba(255,255,255,0.1)',
    textColor:'rgba(255,255,255,0.85)',
    timeVisible:true,
    secondsVisible:false,
    rightOffset:8,
    barSpacing:12,
    rightBarStaysOnScroll:true,
    minBarSpacing:3,
    shiftVisibleRangeOnNewBar:false,
    fixLeftEdge:false,
    fixRightEdge:false,
    ticksVisible:true,
    lockVisibleTimeRangeOnResize:true,
    tickMarkFormatter:(time,tickMarkType,locale)=>{
      const d=new Date(time*1000)
      const days=['Dom','Lun','Mar','Mie','Jue','Vie','Sab']
      const months=['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
      const day=days[d.getUTCDay()]
      const date=d.getUTCDate()
      const mon=months[d.getUTCMonth()]
      const h=d.getUTCHours().toString().padStart(2,'0')
      const m=d.getUTCMinutes().toString().padStart(2,'0')
      // tickMarkType: 0=Year, 1=Month, 2=DayOfMonth, 3=Time, 4=TimeWithSeconds
      if(tickMarkType<=1) return mon+' '+d.getUTCFullYear()
      if(tickMarkType===2) return day+' '+date+' '+mon
      return day+' '+h+':'+m
    },
  },
  handleScroll:{mouseWheel:true,pressedMouseMove:true,horzTouchDrag:true,vertTouchDrag:false},
  handleScale:{axisPressedMouseMove:{time:true,price:true},mouseWheel:true,pinch:true},
}}

const isJpy    = p=>p?.includes('JPY')
const pipMult  = p=>isJpy(p)?100:10000
const fmtPx    = (px,p)=>px?.toFixed(isJpy(p)?3:5)??'—'
const fmtPnl   = v=>(!v&&v!==0)||isNaN(v)?'+$0.00':(v>=0?'+':'')+v.toFixed(2)
const pnlColor = v=>v>0?'#1E90FF':v<0?'#ef5350':'#a0b8d0'
const fmtTs = (ts) => {
  if(!ts || ts < 1000000000) return '—'
  return new Date(ts*1000).toLocaleString('es-ES',{month:'short',day:'2-digit',hour:'2-digit',minute:'2-digit'})
}
function calcPnl(side,entry,exit,lots,pair){const pips=side==='BUY'?(exit-entry)*pipMult(pair):(entry-exit)*pipMult(pair);return pips*lots*10}

const TF_VALID={'1m':'M1','3m':'M3','5m':'M5','15m':'M15','30m':'M30','1h':'H1','4h':'H4','1d':'D1'}
const TF_OPTS=[{l:'1m',tf:'M1'},{l:'3m',tf:'M3'},{l:'5m',tf:'M5'},{l:'15m',tf:'M15'},{l:'30m',tf:'M30'},{l:'1h',tf:'H1'},{l:'4h',tf:'H4'},{l:'1d',tf:'D1'}]
function TfInputModal({tfInput,activeTf}){
  const match=TF_VALID[tfInput.toLowerCase().trim()]
  const ok=!!match
  return(
    <div style={{position:'fixed',inset:0,zIndex:9000,display:'flex',alignItems:'center',justifyContent:'center',pointerEvents:'none',fontFamily:"'Montserrat',sans-serif"}}>
      <div style={{background:'rgba(255,255,255,0.10)',border:'1px solid '+(ok?'rgba(41,98,255,0.7)':'rgba(255,255,255,0.22)'),borderRadius:20,backdropFilter:'blur(40px) saturate(200%) brightness(1.1)',WebkitBackdropFilter:'blur(40px) saturate(200%) brightness(1.1)',boxShadow:'0 24px 80px rgba(0,0,0,0.5),inset 0 1px 0 rgba(255,255,255,0.25)',padding:'20px 28px 18px',minWidth:240,textAlign:'center'}}>
        <div style={{fontSize:38,fontWeight:900,color:ok?'#2962FF':'#ffffff',letterSpacing:2,marginBottom:8,lineHeight:1}}>
          {tfInput}<span style={{display:'inline-block',width:2,height:38,background:ok?'#2962FF':'rgba(255,255,255,0.6)',marginLeft:3,verticalAlign:'middle',animation:'blink 1s step-end infinite'}}/>
        </div>
        <div style={{fontSize:11,fontWeight:700,color:ok?'rgba(41,98,255,0.9)':'rgba(255,255,255,0.3)',letterSpacing:1.5,marginBottom:16}}>
          {ok?('-> '+match):'1m  5m  15m  30m  1h  4h  1d'}
        </div>
        <div style={{display:'flex',gap:5,justifyContent:'center',flexWrap:'wrap'}}>
          {TF_OPTS.map(o=>(
            <div key={o.l} style={{padding:'3px 10px',borderRadius:6,fontSize:10,fontWeight:700,background:match===o.tf?'rgba(41,98,255,0.35)':activeTf===o.tf?'rgba(255,255,255,0.1)':'rgba(255,255,255,0.05)',border:'1px solid '+(match===o.tf?'rgba(41,98,255,0.7)':activeTf===o.tf?'rgba(255,255,255,0.2)':'rgba(255,255,255,0.08)'),color:match===o.tf?'#fff':activeTf===o.tf?'#fff':'rgba(255,255,255,0.4)'}}>{o.l}</div>
          ))}
        </div>
        {ok&&<div style={{marginTop:12,fontSize:9,color:'rgba(255,255,255,0.35)',fontWeight:600,letterSpacing:1}}>ENTER confirma  ESC cancela</div>}
      </div>
    </div>
  )
}
export default function SessionPage(){
  const router=useRouter()
  const {id}=router.query

  // Auth + check de acceso al Simulador
  const { user: authUser, profile, loading: authLoading, hasAccess } = useAuth('simulador_activo')

  const bgCanvasRef   = useRef(null)
  const pairState     = useRef({})
  const chartMap      = useRef({})
  if(typeof window!=="undefined") window.__chartMap=chartMap
  const sessionRef    = useRef(null)
  const userIdRef     = useRef(null)
  const speedRef      = useRef(1)
  const activePairRef = useRef(null)
  const mountPairRef  = useRef(null)
  const pairTfRef     = useRef({})
  const currentTimeRef = useRef(null) // timestamp de la vela actual del simulador (unix segundos). Se usa en refreshChallengeStatus.
  const lastMadridDayRef = useRef(null) // ultimo dia Madrid detectado para evitar refetch en cada tick

  const [session,     setSession]     = useState(null)
  const [challengeStatus, setChallengeStatus] = useState(null) // FTMO-style: {session,config,evaluation} o null si no es challenge
  // Ref espejo del state — el detector de breach intra-vela necesita leerlo
  // dentro del onTick del engine (que NO se re-suscribe a cada cambio de state).
  const challengeStatusRef = useRef(null)
  // Flag que indica que YA se está procesando un breach en este tick para
  // evitar disparos duplicados (el modal solo se debe abrir una vez).
  const challengeBreachFiringRef = useRef(false)
  // Challenge modal state — qué modal mostrar (null = ninguno)
  // 'passed_phase' = pasaste fase intermedia, 'passed_all' = clímax, 'failed' = quemado
  const [challengeModal, setChallengeModal] = useState(null)
  const [challengeAdvancing, setChallengeAdvancing] = useState(false)
  // Para evitar mostrar el modal cada vez que se refresca status mientras el alumno
  // todavía no ha cerrado el modal — solo mostrar la primera vez que detectamos el evento.
  const challengeModalShownRef = useRef(false)
  const [loading,     setLoading]     = useState(true)
  const [activePairs, setActivePairs] = useState([])
  const [activePair,  setActivePair]  = useState(null)
  const [addingPair,  setAddingPair]  = useState(false)
  const [pairTf,      setPairTf]      = useState({})
  const [isPlaying,   setIsPlaying]   = useState(false)
  const [speed,       setSpeed]       = useState(1)
  const [progress,    setProgress]    = useState(0)
  const [currentTime, setCurrentTime] = useState(null)
  const [currentPrice,setCurrentPrice]= useState(null)
  const [dataReady,   setDataReady]   = useState(false)
  const [balance,     setBalance]     = useState(10000)
  const [lots,        setLots]        = useState(0.01)
  const [slPips,      setSlPips]      = useState(20)
  const [rr,          setRr]          = useState(2)
  const [showPos,     setShowPos]     = useState(false)
  const [showTrades,  setShowTrades]  = useState(false)
  const [showOrders,  setShowOrders]  = useState(false)
  const [lastTrade,   setLastTrade]   = useState(null)
  const [tick,        setTick]        = useState(0)
  // Pending order preview (before confirm)
  const [preview,     setPreview]     = useState(null)  // {pair,side,entry,sl,tp,lots,slPips,tpPips}
  const [ctxMenu,     setCtxMenu]     = useState(null)  // {x,y,price,pair}
  const [pillPos,     setPillPos]     = useState({x:null,y:null})  // draggable pill
  const pillDragRef   = useRef(null)
  const [closeModal,  setCloseModal]  = useState(null)  // {posId,pair,pos}
  const draggingRef      = useRef(null)  // {posId,pair,type:'sl'|'tp',pos}
  const closePositionRef    = useRef(null)
  const checkSLTPRef        = useRef(null)
  const checkLimitOrdersRef = useRef(null)
  const checkChallengeBreachRef = useRef(null)
  const balanceRef          = useRef(10000)
  // Order modal
  const [orderModal,  setOrderModal]  = useState(null)  // {side,entry,pair,isLimit}
  const [activeTool,    setActiveTool]    = useState('cursor')
  const activeToolRef = useRef('cursor')
  const [drawingCount,  setDrawingCount]  = useState(0)
  const [selectedTool,  setSelectedTool]  = useState(null)
  const [templates,     setTemplates]     = useState([])
  const [drawingTfMap,  setDrawingTfMap]  = useState({}) // {toolId: string[]}
  const drawingTfMapRef = useRef({})
  const [drawingCtxMenu, setDrawingCtxMenu] = useState(null)  // {x,y}
  const [longShortModal, setLongShortModal] = useState(null)  // {toolId, tool}
  const [activeToolKey,  setActiveToolKey]  = useState(null)
  const selectedToolRef  = useRef(null)
  const activeToolKeyRef = useRef(null)
  const [chartConfigOpen, setChartConfigOpen] = useState(false)
  const [rulerActive, setRulerActive] = useState(false)
  const [tfKey, setTfKey] = useState(0)
  const [chartTick, setChartTick] = useState(0)
  const [hoverCandle, setHoverCandle] = useState(null) // {o,h,l,c,t}
  const [textInput, setTextInput] = useState(null) // {x,y,onConfirm}
  const [tfInput, setTfInput] = useState('')  // TF keyboard modal
  const [selectedDrawing, setSelectedDrawing] = useState(null) // {id, x, y}
  const selectedDrawingRef = useRef(null)

  // Challenge lockout: derivado calculado lo más arriba posible para que esté disponible
  // en TODOS los hooks (useEffect del keydown, useCallback, etc.) sin problemas TDZ.
  // No permite abrir nuevas operaciones, dibujar, ni avanzar el replay si:
  //   - La sesión ya está cerrada en BD (passed_phase / passed_all / failed_dd_*)
  //   - El motor detectó un evento terminal en runtime (target_reached / failed_dd_*)
  // Posiciones abiertas pueden seguir cerrándose normalmente (SL/TP o manual).
  const sessionStatus = session?.status || 'active'
  const evalStatus = challengeStatus?.evaluation?.status
  const challengeLocked = (
    sessionStatus === 'failed_dd_daily' ||
    sessionStatus === 'failed_dd_total' ||
    sessionStatus === 'passed_phase' ||
    sessionStatus === 'passed_all' ||
    evalStatus === 'target_reached' ||
    evalStatus === 'failed_dd_daily' ||
    evalStatus === 'failed_dd_total'
  )

  useEffect(()=>{selectedDrawingRef.current=selectedDrawing},[selectedDrawing])
  const textPillDragRef = useRef(null)
  const onTextPillMouseDown = (e) => {
    if(e.target.tagName==='BUTTON'||e.target.closest('button')||e.target.tagName==='INPUT') return
    const r = e.currentTarget.getBoundingClientRect()
    textPillDragRef.current = {ox: e.clientX - r.left, oy: e.clientY - r.top}
    const mv = (ev) => setSelectedDrawing(prev => prev ? {...prev, x: ev.clientX - textPillDragRef.current.ox, y: ev.clientY - textPillDragRef.current.oy} : prev)
    const up = () => { textPillDragRef.current=null; window.removeEventListener('mousemove',mv); window.removeEventListener('mouseup',up) }
    window.addEventListener('mousemove',mv); window.addEventListener('mouseup',up); e.preventDefault()
  }
  const { drawings, drawingsRef, addDrawing, updateDrawing, removeDrawing, removeAll: removeAllCustom, toJSON: customDrawingsToJSON, fromJSON: customDrawingsFromJSON } = useCustomDrawings()

  const { pluginRef, pluginReady, toolConfigs, updateToolConfig, applyToTool, setToolVisible, addTool, removeSelected, removeAll, deselectAll, exportTools, importTools, onAfterEdit, offAfterEdit, onDoubleClick, offDoubleClick, getSelected } = useDrawingTools({
    chartMap,
    activePair,
    dataReady,
    userId: userIdRef.current,
  })
  

  const sessionId = typeof window !== 'undefined' ? window.location.pathname.split('/').pop() : null
  const { config: chartConfig, saveConfig: saveChartConfig, loaded: chartConfigLoaded } = useChartConfig({
    sessionId,
    userId: userIdRef.current,
  })

  // Apply config whenever chart is ready or config loads
  useEffect(() => {
    if (!chartConfigLoaded || !activePair) return
    applyChartConfig(chartMap, activePair, chartConfig)
  }, [chartConfigLoaded, chartConfig, activePair])


  // Save session drawings to Supabase
  const saveDrawingsRef = useRef(null)
  const saveSessionDrawings = useCallback(async () => {
    const uid = userIdRef.current
    const sid = router.query?.id
    if(!uid || !sid) return
    try {
      const vendorJson = exportTools()
      const customJson = customDrawingsToJSON()
      const tfMap      = drawingTfMapRef.current
      const combined   = JSON.stringify({
        v: vendorJson || '[]',
        c: customJson || '[]',
        tfMap: Object.keys(tfMap).length > 0 ? tfMap : undefined,
      })
      // Upsert manual: UPDATE primero, INSERT solo si no existía la fila.
      // El patrón anterior (delete + insert en dos llamadas) producía 409 cuando
      // dos saves se solapaban — el delete del segundo aún no había resuelto y
      // el insert del primero chocaba con la fila vieja. Este patrón es
      // atómico-por-fila y no requiere constraint UNIQUE en BD (que no
      // queremos asumir que esté creado).
      const { data: updated, error: upErr } = await supabase
        .from('session_drawings')
        .update({ user_id: uid, data: combined, updated_at: new Date().toISOString() })
        .eq('session_id', sid)
        .select('session_id')
      if (!upErr && (!updated || updated.length === 0)) {
        // No existía: insert. Si ahora otro tab se nos adelantó y ya creó la
        // fila entre el UPDATE y el INSERT (carrera muy rara), el catch lo
        // absorbe — el dato más reciente ya está en BD igualmente.
        await supabase.from('session_drawings').insert(
          { session_id: sid, user_id: uid, data: combined, updated_at: new Date().toISOString() }
        ).then(()=>{}).catch(()=>{})
      }
    } catch(e) {}
  }, [exportTools, customDrawingsToJSON])
  useEffect(() => { saveDrawingsRef.current = saveSessionDrawings }, [saveSessionDrawings])

  // Load session drawings — wait for plugin to be fully ready (async init)
  useEffect(() => {
    if(!pluginReady || !id || !userIdRef.current) return
    const load = async () => {
      try {
        const { data } = await supabase.from('session_drawings').select('data').eq('session_id', id).order('updated_at', { ascending: false }).limit(1).maybeSingle()
        if(!data?.data || data.data === '[]') return
        try {
          const parsed = JSON.parse(data.data)
          if(parsed && typeof parsed === 'object' && !Array.isArray(parsed) && parsed.v) {
            if(parsed.v && parsed.v !== '[]') importTools(parsed.v)
            if(parsed.c && parsed.c !== '[]') customDrawingsFromJSON(parsed.c)
            // Restore TF visibility map and re-apply to all drawings
            if(parsed.tfMap && Object.keys(parsed.tfMap).length > 0) {
              setDrawingTfMap(parsed.tfMap)
              drawingTfMapRef.current = parsed.tfMap
              // Re-apply visibility after a short delay (plugin needs to finish importing)
              setTimeout(() => {
                const tf = pairTfRef.current[activePairRef.current] || 'H1'
                Object.entries(parsed.tfMap).forEach(([toolId, entry]) => {
                  const tfs = Array.isArray(entry) ? entry : (entry.tfs || ['M1','M5','M15','M30','H1','H4','D1'])
                  setToolVisible(toolId, tfs.includes(tf))
                })
              }, 300)
            }
          } else {
            importTools(data.data)
          }
        } catch(e) {}
      } catch(e) {}
    }
    load()
  }, [pluginReady, id])

  // Drawing tools events — subscribe only when plugin is confirmed ready
  useEffect(()=>{
    if(!pluginReady) return
    const afterEditHandler=(event)=>{
      setDrawingCount(c=>c+1)
      try{
        const sel=getSelected()
        if(sel&&sel.length>0){
          const t=sel[0]
          setSelectedTool({id:t.id,toolType:t.toolType})
          if(t.toolType) setActiveToolKey(t.toolType)
          if(t.toolType==='Callout' && event?.stage==='lineToolFinished'){
            setTextInput({
              x: window.innerWidth/2 - 120,
              y: window.innerHeight/2 - 60,
              onConfirm:(text)=>{
                if(!text.trim()) return
                try{ applyToTool(t.id,{label:text}) }catch{}
                if(saveDrawingsRef.current) saveDrawingsRef.current()
              }
            })
          }
        }
      }catch{}
      if(saveDrawingsRef.current) saveDrawingsRef.current()
    }
    const dblClickHandler=(event)=>{
      try{setSelectedTool({id:event?.toolId,toolType:event?.toolType});if(event?.toolType)setActiveToolKey(event.toolType)}catch{}
    }
    onAfterEdit(afterEditHandler)
    onDoubleClick(dblClickHandler)
    const iv=setInterval(()=>{
      try{
        const sel=getSelected()
        if(sel&&sel.length>0){
          const t=sel[0]
          if(t?.id){
            setSelectedTool(prev=>prev?.id===t.id?prev:{id:t.id,toolType:t.toolType})
            if(t.toolType) setActiveToolKey(t.toolType)
          }
        }
      }catch{}
    },300)
    return()=>{
      clearInterval(iv)
      offAfterEdit(afterEditHandler)
      offDoubleClick(dblClickHandler)
    }
  },[pluginReady,activePair])
  useEffect(()=>{activePairRef.current=activePair},[activePair])
  useEffect(()=>{selectedToolRef.current=selectedTool},[selectedTool])

  // Clear selectedTool when user clicks empty chart area
  useEffect(()=>{
    if(!dataReady) return
    const cr=chartMap.current[activePair]
    if(!cr?.chart) return
    const handler=()=>{
      // Small delay to let plugin process click first
      setTimeout(()=>{
        try{
          const sel=getSelected()
          if(!sel||sel.length===0) setSelectedTool(null)
        }catch{}
      },50)
    }
    cr.chart.subscribeClick(handler)
    return()=>{ try{cr.chart.unsubscribeClick(handler)}catch{} }
  },[dataReady,activePair])
  useEffect(()=>{activeToolKeyRef.current=activeToolKey},[activeToolKey])
  useEffect(()=>{activeToolRef.current=activeTool},[activeTool])
  useEffect(()=>{pairTfRef.current=pairTf},[pairTf])
  const tfMapSaveTimerRef = useRef(null)
  useEffect(()=>{
    drawingTfMapRef.current=drawingTfMap
    if(Object.keys(drawingTfMap).length>0){
      // Debounce — if user clicks multiple TFs quickly, only save once
      if(tfMapSaveTimerRef.current) clearTimeout(tfMapSaveTimerRef.current)
      tfMapSaveTimerRef.current=setTimeout(()=>{ if(saveDrawingsRef.current) saveDrawingsRef.current() },400)
    }
  },[drawingTfMap])

  // Apply TF visibility when timeframe changes
  useEffect(()=>{
    const tf=pairTf[activePair]||'H1'
    Object.entries(drawingTfMap).forEach(([toolId,entry])=>{
      const tfs=Array.isArray(entry)?entry:(entry.tfs||['M1','M5','M15','M30','H1','H4','D1'])
      setToolVisible(toolId, tfs.includes(tf))
    })
  },[pairTf,activePair,drawingTfMap,setToolVisible])

  // ── Background constellation animation ──────────────────────────────────────
  useEffect(()=>{
    const canvas=bgCanvasRef.current; if(!canvas) return
    const ctx=canvas.getContext('2d')
    const resize=()=>{canvas.width=window.innerWidth;canvas.height=window.innerHeight}
    resize()
    const nodes=[]
    for(let i=0;i<55;i++) nodes.push({x:Math.random()*canvas.width,y:Math.random()*canvas.height,vx:(Math.random()-.5)*.3,vy:(Math.random()-.5)*.3,r:Math.random()*1.4+.7})
    let raf
    let lastFrame = 0
    function draw(ts){
      raf=requestAnimationFrame(draw)
      if(document.hidden) return           // pause when tab not visible
      if(ts - lastFrame < 33) return       // cap at ~30fps
      lastFrame = ts
      ctx.clearRect(0,0,canvas.width,canvas.height)
      for(let i=0;i<nodes.length;i++) for(let j=i+1;j<nodes.length;j++){
        const dx=nodes[i].x-nodes[j].x,dy=nodes[i].y-nodes[j].y,d=Math.sqrt(dx*dx+dy*dy)
        if(d<160){ctx.strokeStyle=`rgba(30,144,255,${(1-d/160)*.4})`;ctx.lineWidth=.6;ctx.beginPath();ctx.moveTo(nodes[i].x,nodes[i].y);ctx.lineTo(nodes[j].x,nodes[j].y);ctx.stroke()}
      }
      nodes.forEach(n=>{
        ctx.beginPath();ctx.arc(n.x,n.y,n.r*1.8,0,Math.PI*2);ctx.fillStyle='rgba(30,144,255,0.9)';ctx.fill()
        n.x+=n.vx;n.y+=n.vy
        if(n.x<0||n.x>canvas.width)n.vx*=-1
        if(n.y<0||n.y>canvas.height)n.vy*=-1
      })
    }
    draw(0)
    window.addEventListener('resize',resize)
    return()=>{cancelAnimationFrame(raf);window.removeEventListener('resize',resize)}
  },[])

  // ── Auth ─────────────────────────────────────────────────────────────────────
  // La sesión y el check de acceso los gestiona useAuth() (arriba).
  // Aquí solo propagamos el userId a userIdRef y cargamos los templates del usuario.
  useEffect(()=>{
    if(!authUser || !hasAccess) return
    userIdRef.current=authUser.id
    supabase.from('sim_drawing_templates').select('*').eq('user_id',authUser.id).then(({data:tpls})=>{
      if(tpls)setTemplates(tpls)
    })
  },[authUser, hasAccess])

  // ── TF keyboard input — TradingView style ─────────────────────────────────────
  // Atajos:
  //   - Números solos + Enter → minutos: 1, 3, 5, 15, 30  (no hace falta "m")
  //   - Con sufijo h/d + Enter → 1h, 4h, 1d
  // Esto cubre los TFs disponibles: M1, M3, M5, M15, M30, H1, H4, D1.
  useEffect(()=>{
    const VALID={
      // minutos (sin sufijo)
      '1':'M1','3':'M3','5':'M5','15':'M15','30':'M30',
      // alias con 'm' (compat hacia atrás)
      '1m':'M1','3m':'M3','5m':'M5','15m':'M15','30m':'M30',
      // horas y días (con sufijo obligatorio)
      '1h':'H1','4h':'H4','1d':'D1',
    }
    const onKey=(e)=>{
      const tag=e.target?.tagName
      if(tag==='INPUT'||tag==='TEXTAREA'||e.target?.contentEditable==='true') return
      if(e.ctrlKey||e.metaKey||e.altKey) return
      if(e.key==='Escape'){setTfInput(''); return}
      if(e.key==='Enter'){
        setTfInput(prev=>{
          const tf=VALID[prev.toLowerCase().trim()]
          if(tf&&activePairRef.current){
            const n={...pairTfRef.current,[activePairRef.current]:tf}
            pairTfRef.current=n;setPairTf(n)
          }
          return ''
        })
        return
      }
      if(e.key==='Backspace'){setTfInput(prev=>prev.slice(0,-1));return}
      if(e.key.length===1&&/[0-9a-zA-Z]/.test(e.key)){setTfInput(prev=>(prev+e.key).slice(0,4))}
    }
    window.addEventListener('keydown',onKey)
    return()=>window.removeEventListener('keydown',onKey)
  },[])

  // ── Session load ──────────────────────────────────────────────────────────────
  useEffect(()=>{
    if(!id) return
    // ── FIX: limpiar masterTime global al cambiar de sesión ─────────────────────
    // el masterTime persiste entre navegaciones SPA (Next.js no
    // recarga la window al hacer router.push). Si NO lo limpiamos, una sesión
    // nueva de challenge arranca el replay en la fecha donde quedó el challenge
    // anterior, porque resumeReal lo prioriza sobre date_from.
    clearCurrentTime()
    supabase.from('sim_sessions').select('*').eq('id',id).maybeSingle().then(async ({data})=>{
      if(!data){setLoading(false);return}
      sessionRef.current=data
      setSession(data)
      // Use persisted balance (updated after each trade); fallback to capital or default
      const savedBalance = parseFloat(data.balance) || parseFloat(data.capital) || 10000
      setBalance(savedBalance)
      balanceRef.current = savedBalance
      const p=data.pair||'EUR/USD', tf=data.timeframe||'H1'
      setActivePairs([p]); setActivePair(p)
      const initTf={[p]:tf}; setPairTf(initTf); pairTfRef.current=initTf
      // Load previous trades for this session to show in journal
      const { data: prevTrades } = await supabase.from('sim_trades').select('*').eq('session_id',id).order('closed_at',{ascending:true})
      if(prevTrades?.length){
        // Put them in pairState so allTrades shows them
        if(!pairState.current[p]) pairState.current[p]={engine:null,ready:false,positions:[],trades:[],orders:[]}
        pairState.current[p].trades=[...prevTrades.map(t=>({
          id:t.id, pair:t.pair, side:t.side, entry:t.entry_price, exit:t.exit_price,
          lots:t.lots, sl:t.sl_price, tp:t.tp_price,
          rr:t.rr, rrReal:t.rr, pnl:t.pnl, result:t.result, reason:'—',
          openTime:t.opened_at?Math.floor(new Date(t.opened_at).getTime()/1000):null,
          closeTime:t.closed_at?Math.floor(new Date(t.closed_at).getTime()/1000):null,
        }))]
      }
      setLoading(false)
    })
  },[id])

  // ── Challenge: fetch status helper ───────────────────────────────────────────
  // Se llama al cargar sesion y despues de cada trade cerrado.
  // Si la sesion no es un challenge (session.challenge_type == null), no hace nada.
  const refreshChallengeStatus = useCallback(async () => {
    if (!id || !sessionRef.current?.challenge_type) return
    try {
      // Pasamos currentTime del simulador: así el motor sabe qué día es HOY en el backtest.
      // El DD diario se resetea en el día Madrid de esta vela, no de la fecha real del ordenador.
      // Leemos currentTimeRef (state de React, se inicializa al cargar el engine).
      // Fallback adicional a getMasterTime() por si acaso.
      const ct = currentTimeRef.current
        || getMasterTime()
        || null
      const qs = ct ? `?session_id=${id}&current_time=${ct}` : `?session_id=${id}`
      const res = await fetch(`/api/challenge/status${qs}`)
      if (!res.ok) return
      const data = await res.json()
      setChallengeStatus(data)
      // Actualizamos también el state `session` con el status vivo de BD.
      // Sin esto, sessionStatus quedaba congelado en 'active' aunque el motor
      // hubiera persistido 'failed_dd_daily' — y challengeLocked solo se
      // activaba parcialmente (vía evalStatus). Tras cualquier breach o pase
      // de fase, esto garantiza que session.status refleje el estado real.
      if (data?.session?.status) {
        setSession(prev => prev ? { ...prev, status: data.session.status, balance: data.session.balance, challenge_phase: data.session.challenge_phase } : prev)
        if (sessionRef.current) {
          sessionRef.current = { ...sessionRef.current, status: data.session.status, balance: data.session.balance, challenge_phase: data.session.challenge_phase }
        }
      }
    } catch (e) {
      console.error('[challenge/status] error', e)
    }
  }, [id])

  // Fetch inicial cuando la sesion ya cargo y es un challenge
  useEffect(() => {
    if (session?.challenge_type) refreshChallengeStatus()
  }, [session?.id, session?.challenge_type, refreshChallengeStatus])

  // Refrescar el HUD cuando cambia el DIA MADRID del simulador.
  // Sin esto, si avanzas velas sin cerrar trades, el HUD se queda en el ultimo valor
  // y no muestra el reset del DD diario al cambiar de dia.
  useEffect(() => {
    if (!session?.challenge_type || !currentTime) return
    // Solo refresca al cruzar frontera de día Madrid, no en cada tick (seria spam)
    try {
      const madridFmt = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/Madrid',
        year: 'numeric', month: '2-digit', day: '2-digit',
      })
      const currentDay = madridFmt.format(new Date(currentTime * 1000))
      if (currentDay !== lastMadridDayRef.current) {
        lastMadridDayRef.current = currentDay
        refreshChallengeStatus()
      }
    } catch {}
  }, [currentTime, session?.challenge_type, refreshChallengeStatus])

  // Detector de eventos challenge — abre el modal correspondiente cuando el motor
  // detecta target_reached, failed_dd_daily o failed_dd_total.
  // Solo abre la PRIMERA vez para no spamear si el alumno ignora el modal.
  // Se resetea al avanzar/fallar (cambia session.id) o al desmontar.
  //
  // GUARD CRÍTICO: tras un transition (passed_phase → nueva sesión Fase 2),
  // challengeStatus puede contener datos residuales de la sesión anterior durante
  // un instante mientras refreshChallengeStatus() aún no terminó. Si actuamos
  // sobre esos datos, abrimos un modal "Has pasado" en una sesión que no ha pasado.
  // Por eso exigimos que challengeStatus.session.id === id (id de la URL actual).

  // Reset del estado de modal al cambiar de sesión (Next.js puede reutilizar el
  // componente entre rutas /session/[id], lo que mantendría refs vivos).
  useEffect(() => {
    challengeModalShownRef.current = false
    setChallengeModal(null)
  }, [id])

  useEffect(() => {
    if (!challengeStatus?.evaluation) return
    if (challengeModalShownRef.current) return
    if (challengeModal) return // ya hay modal abierto

    // Guard race condition: el status debe corresponder a la sesión que estamos viendo.
    // Si no, ignoramos hasta que llegue el refresh con los datos correctos.
    if (challengeStatus.session?.id && challengeStatus.session.id !== id) return

    const evalStatus = challengeStatus.evaluation.status
    const sessStatus = challengeStatus.session?.status

    // Si la sesión ya está CERRADA en BD (passed_phase, passed_all, failed_*),
    // el alumno ya vio el modal cuando ocurrió el evento. Al re-entrar para revisar
    // el chart histórico, NO le interrumpimos con el modal otra vez. Los bloqueos
    // del Paso 3 (botones, replay, dibujos) ya impiden cualquier acción que pueda
    // alterar el resultado. El alumno solo viene a leer el pasado.
    if (sessStatus === 'passed_all'
        || sessStatus === 'passed_phase'
        || sessStatus === 'failed_dd_daily'
        || sessStatus === 'failed_dd_total') {
      return
    }

    // Si la sesión está active pero el motor detectó evento EN RUNTIME, abrir modal.
    // Este es el momento clímax — el alumno acaba de cerrar el trade que cruzó target,
    // o el SL que quemó el challenge. La primera vez que ocurre sí merece celebración
    // (o disociación, si es fail).
    if (evalStatus === 'target_reached') {
      const isLastPhase = (challengeStatus.session?.challenge_phase || 1)
                          >= (challengeStatus.config?.phases || 1)
      setChallengeModal(isLastPhase ? 'passed_all' : 'passed_phase')
      challengeModalShownRef.current = true
      return
    }
    if (evalStatus === 'failed_dd_daily' || evalStatus === 'failed_dd_total') {
      setChallengeModal('failed')
      challengeModalShownRef.current = true
      return
    }
  }, [challengeStatus, challengeModal, id])

  // B1: recolecta posiciones vivas de todos los pares para enviarlas al backend
  // en el momento del cierre de fase. El servidor las descarta sin persistir
  // (doctrina "fase nueva = virgen"). Se envían solo para trazabilidad/logs.
  const collectOpenPositions = () => {
    const out = []
    Object.entries(pairState.current).forEach(([pair, ps]) => {
      if (!ps?.positions?.length) return
      ps.positions.forEach(p => {
        out.push({
          position_id: p.id,
          pair,
          side: p.side,
          entry_price: p.entry,
          lots: p.lots,
          opened_at: p.openTime
            ? new Date(p.openTime * 1000).toISOString()
            : null,
        })
      })
    })
    return out
  }

  // Llamada al endpoint /api/challenge/advance.
  // outcome='pass' o 'fail' según contexto. Devuelve el nextSession (si aplica).
  const callChallengeAdvance = useCallback(async (outcome) => {
    if (!id) return null
    setChallengeAdvancing(true)
    try {
      const res = await fetch('/api/challenge/advance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: id,
          outcome,
          end_timestamp: getMasterTime(),   // B4: endTime real del cierre, fuente de verdad cliente
          open_positions: collectOpenPositions(),   // B1: flotantes vivos en el momento del cierre, servidor los descarta
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        console.error('[challenge/advance] error:', data?.error || res.statusText)
        return null
      }
      return data
    } catch (e) {
      console.error('[challenge/advance] fetch failed', e)
      return null
    } finally {
      setChallengeAdvancing(false)
    }
  }, [id])

  // Handlers compartidos por los modales
  const handleChallengePass = useCallback(async () => {
    const data = await callChallengeAdvance('pass')
    if (!data) return
    if (data.action === 'phase_passed' && data.next_session?.id) {
      // Redirect a la nueva sesión de la siguiente fase
      router.push(`/session/${data.next_session.id}`)
    } else if (data.action === 'challenge_completed') {
      // Solo persistimos en BD. El modal handler decide qué hacer luego.
      // Refrescar status local para reflejar passed_all
      await refreshChallengeStatus()
    }
  }, [callChallengeAdvance, router, refreshChallengeStatus])

  const handleChallengeFail = useCallback(async () => {
    const data = await callChallengeAdvance('fail')
    if (!data) return
    await refreshChallengeStatus()
  }, [callChallengeAdvance, refreshChallengeStatus])

  // CTA "Comenzar Challenge Real" — abre afiliado FTMO en pestaña nueva
  const handleCtaRealChallenge = useCallback(() => {
    const ftmoAffiliateUrl = 'https://trader.ftmo.com/?affiliates=VQiFmiFmoBxymSRKPBtl'
    if (typeof window !== 'undefined') {
      window.open(ftmoAffiliateUrl, '_blank', 'noopener,noreferrer')
    }
  }, [])

  // Volver al dashboard / empezar nuevo challenge
  const handleGoToDashboard = useCallback(() => {
    router.push('/dashboard')
  }, [router])

  const handleGoToNewChallenge = useCallback(() => {
    router.push('/dashboard') // El dashboard tiene el botón para empezar challenge nuevo
  }, [router])

  // ── Load pair data ────────────────────────────────────────────────────────────
  const loadPair=useCallback(async(pair)=>{
    const sess=sessionRef.current
    if(!sess||pairState.current[pair]?.ready) return
    try{
      const result = await fetchSessionCandles({
        pair, dateFrom: sess.date_from, dateTo: sess.date_to
      })
      if (!result) return
      const { candles: ordinalCandles, replayTs, toTs } = result

      const engine=new ReplayEngine()
      // If there's a master time (another pair already advanced), use that. Otherwise resume saved position.
      // Doble protección: además de limpiarla al cambiar id, validamos que
      // masterTime caiga dentro del rango temporal de ESTA sesión. Si está fuera
      // (por race condition entre montajes), la ignoramos y caemos al fallback.
      const rawMaster = getMasterTime()
      const masterTime = (rawMaster && rawMaster >= replayTs && rawMaster <= toTs) ? rawMaster : null
      // Convert real masterTime/resumeTs to ordinal if needed
      const toOrdinal = (t) => t ?? null  // real timestamps — no conversion needed
      const isOrdinal = (t) => t && t < 1000000000
      const resumeReal = masterTime || (isOrdinal(sess.last_timestamp)?null:sess.last_timestamp) || replayTs
      const resumeTs = toOrdinal(resumeReal) ?? 0
      engine.load(ordinalCandles); engine.seekToTime(resumeTs); engine.speed=speedRef.current
      engine.onTick=()=>{
        updateChart(pair,engine,false)
        checkSLTPRef.current?.(pair,engine)
        checkLimitOrdersRef.current?.(pair,engine)
        // Challenge breach intra-vela: si el floating PnL + cerrado supera
        // el cap diario o total, fuerza cierre de TODAS las posiciones al
        // precio exacto donde se cruzó el cap. Estilo FTMO real.
        checkChallengeBreachRef.current?.(pair,engine)
        if(pair===activePairRef.current){
          setCurrentTime(engine.currentTime)
          setProgress(Math.round(engine.progress*100))
          setMasterTime(engine.currentTime)
        }
      }
      engine.onEnd=()=>{if(pair===activePairRef.current){setIsPlaying(false);saveProgress(engine.currentTime)}}
      const ps={engine,ready:true,positions:[],trades:[],
        lastSLTPIdx: engine.currentIndex,   // start from current — don't re-check history
        lastLimitIdx: engine.currentIndex,
      }
      pairState.current[pair]=ps
      updateChart(pair,engine,true)
      if(pair===activePairRef.current){
        setDataReady(true);setCurrentTime(engine.currentTime);setProgress(Math.round(engine.progress*100))
        const agg=engine.getAggregated(pairTfRef.current[pair]||'H1')
        setCurrentPrice(agg.slice(-1)[0]?.close??null)
      }
      setTick(t=>t+1)
    }catch(e){console.error('loadPair',pair,e)}
  },[])

  // ── Mount chart ───────────────────────────────────────────────────────────────
  mountPairRef.current=async(pair,el)=>{
    if(!el||chartMap.current[pair]) return
    const lc=await import('lightweight-charts')
    if(chartMap.current[pair]) return
    const chart=lc.createChart(el,chartOpts(el.clientWidth,el.clientHeight))
    const series=chart.addSeries(lc.CandlestickSeries,{
      upColor:'#2962FF',downColor:'#ffffff',
      borderUpColor:'#2962FF',borderDownColor:'#ffffff',
      wickUpColor:'#2962FF',wickDownColor:'#ffffff',
      borderVisible:false,
      priceFormat:{type:'price',precision:5,minMove:0.00001},
      autoscaleInfoProvider: (originalFn) => {
        // CRÍTICO: lightweight-charts pasa una FUNCIÓN al provider, no un objeto.
        // Llamarla devuelve el priceRange por defecto que LWC habría calculado.
        // Si retornamos `originalFn` directamente, LWC lee `.priceRange` de una
        // función (undefined) → crashea al hacer `undefined.minValue` durante
        // el autoscale del eje Y. Reproducible al BAJAR de TF: el realLen aún
        // no está actualizado en el primer render, caemos en el `return original`
        // y el chart muere con `Cannot read properties of undefined (reading 'minValue')`.
        const computeOriginal = () => {
          try { return originalFn() } catch { return null }
        }
        try {
          const data = getSeriesData()
          const realLen = getRealLen()
          if(!data||!realLen) return computeOriginal()
          // Get visible range from chart (stored on chartMap)
          const cr = window.__chartMap?.current?.[pair]
          if(!cr) return computeOriginal()
          const range = cr.chart.timeScale().getVisibleLogicalRange()
          if(!range) return computeOriginal()
          const from = Math.max(0, Math.floor(range.from))
          const to = Math.min(realLen-1, Math.ceil(range.to))
          const visible = data.slice(from, to+1)
          if(!visible.length) return computeOriginal()
          let min=Infinity,max=-Infinity
          for(const c of visible){ if(c.low<min)min=c.low; if(c.high>max)max=c.high }
          if(!isFinite(min)||!isFinite(max)) return computeOriginal()
          const margin=(max-min)*0.05
          return { priceRange:{ minValue:min-margin, maxValue:max+margin } }
        } catch(e){ return computeOriginal() }
      }
    })
    const ro=new ResizeObserver(entries=>{
      const{width,height}=entries[0].contentRect
      try{if(chartMap.current[pair]) chart.resize(width,height)}catch{}
    })
    ro.observe(el)
    chartMap.current[pair]={chart,series,prevCount:0,ro}

    chart.timeScale().subscribeVisibleLogicalRangeChange(()=>{
      const _cr=chartMap.current[pair]
      if(_cr?.hasLoaded&&!_cr?.isAutoSettingRange) _cr.userScrolled=true
      setChartTick(t=>t+1)
    })

    chart.subscribeCrosshairMove((param)=>{
      if(pair!==activePairRef.current) return
      if(!param?.time||!param?.seriesData) return
      try{
        const bar=param.seriesData.get(series)
        if(bar){ setHoverCandle({o:bar.open,h:bar.high,l:bar.low,c:bar.close,t:param.time}) }
        else setHoverCandle(null)
      }catch{ setHoverCandle(null) }
    })

    chart.subscribeClick((param)=>{
      // Hit test text drawings in cursor mode
      if(activeToolRef.current === 'cursor' && param?.point){
        const cr=chartMap.current[pair]; if(!cr) return
        const allDrawings = drawingsRef.current
        for(const d of allDrawings){
          if(d.type !== 'text') continue
          const coords = d.points[0]
          if(!coords) continue
          const sc = toScreenCoords(cr, coords.time, coords.price)
          if(!sc) continue
          const dx = param.point.x - sc.x
          const dy = param.point.y - sc.y
          if(Math.abs(dx) < 80 && Math.abs(dy) < 24){
            const clientX = param.sourceEvent?.clientX || sc.x
            const clientY = param.sourceEvent?.clientY || sc.y
            setSelectedDrawing({id: d.id, x: clientX, y: clientY - 80}); setPillPos({x:null,y:null})
            return
          }
        }
        setSelectedDrawing(null)
        return
      }
      if(activeToolRef.current !== 'text') return
      const cr=chartMap.current[pair]; if(!cr) return
      if(!param?.point) return
      const coords = fromScreenCoords(cr, param.point.x, param.point.y)
      if(!coords) return
      setTextInput({
        x: (param.sourceEvent?.clientX || window.innerWidth/2),
        y: (param.sourceEvent?.clientY || window.innerHeight/2) - 60,
        onConfirm: (text) => {
          if(!text.trim()) return
          addDrawing(DRAWING_TYPES.TEXT, [{ time: coords.time, price: coords.price }], { text, fontSize: 12, color: '#ffffff' })
          setActiveTool('cursor')
          activeToolRef.current = 'cursor'
          // Save immediately — text drawings are not vendor tools so onAfterEdit never fires
          setTimeout(()=>{ if(saveDrawingsRef.current) saveDrawingsRef.current() }, 100)
        }
      })
    })

    el.addEventListener('contextmenu', e=>{
      e.preventDefault()
      const cr=chartMap.current[pair]; if(!cr) return
      const rect=el.getBoundingClientRect()
      let price=null
      try{ price=cr.series.coordinateToPrice(e.clientY-rect.top) }catch{}
      if(price==null||isNaN(price)) return
      setCtxMenu({x:e.clientX, y:e.clientY, price:parseFloat(price.toFixed(5)), pair})
      setPreview(null)
    })

    // ── Drag SL/TP ──────────────────────────────────────────────────────────────
    // Use capture phase on canvas to intercept LWC events.
    //
    // Bug previo: en algunos casos las líneas SL/TP "saltaban" a la posición de
    // un click cualquiera del usuario (incluso al hacer click para navegar el
    // chart). Causas:
    //   1) Los listeners de mousemove/mouseup se añadían a window SIN cleanup,
    //      por lo que en re-mounts del par se acumulaban.
    //   2) onMouseUp hacía early return sin limpiar draggingRef cuando había un
    //      mismatch de pair (closure stale), dejando un drag "zombi" activo.
    //   3) Cualquier mousedown+mouseup contaba como drag aunque no hubiera un
    //      arrastre real (movimiento del ratón mayor a un threshold).
    //
    // Fix: registramos los listeners scoped al pair de este mount, los
    // limpiamos cuando el par se desmonta (guardándolos en `cr.dragCleanup`),
    // marcamos un flag `moved` que sólo se activa con movimiento real >3px,
    // y el mouseup siempre resetea draggingRef sin importar el path.
    const getCanvas=()=>el.querySelector('canvas')||el

    const onMouseDown=e=>{
      if(e.button!==0) return
      const cr=chartMap.current[pair]; if(!cr) return
      const rect=el.getBoundingClientRect()
      const clickY = e.clientY - rect.top
      let clickPrice=null
      try{ clickPrice=cr.series.coordinateToPrice(clickY) }catch{}
      if(clickPrice==null||isNaN(clickPrice)) return
      const ps=pairState.current[pair]; if(!ps?.positions?.length) return
      // Threshold en PÍXELES, no en pips. Así el área activa es siempre 8px
      // verticales sin importar el zoom del eje Y, y un click de navegación
      // 100 pips abajo nunca puede confundirse con la línea.
      const PIXEL_THRESHOLD = 8
      for(const pos of ps.positions){
        let slY=null, tpY=null
        try{ slY = cr.series.priceToCoordinate(pos.sl) }catch{}
        try{ tpY = cr.series.priceToCoordinate(pos.tp) }catch{}
        if(slY!=null && Math.abs(clickY - slY) <= PIXEL_THRESHOLD){
          draggingRef.current={posId:pos.id,pair,type:'sl',pos:{...pos},startX:e.clientX,startY:e.clientY,moved:false}
          e.stopPropagation(); e.preventDefault(); return
        }
        if(tpY!=null && Math.abs(clickY - tpY) <= PIXEL_THRESHOLD){
          draggingRef.current={posId:pos.id,pair,type:'tp',pos:{...pos},startX:e.clientX,startY:e.clientY,moved:false}
          e.stopPropagation(); e.preventDefault(); return
        }
      }
    }
    el.addEventListener('mousedown', onMouseDown, {capture:true})

    const onMouseMove=e=>{
      const drag=draggingRef.current
      if(!drag||drag.pair!==pair) return
      // Sólo consideramos arrastre real si el ratón se ha movido >3px desde el
      // mousedown. Esto evita que un simple click (sin movimiento) actualice
      // la línea por error.
      if(!drag.moved){
        const dx=Math.abs(e.clientX-drag.startX), dy=Math.abs(e.clientY-drag.startY)
        if(dx<3&&dy<3) return
        drag.moved=true
      }
      const cr=chartMap.current[pair]; if(!cr) return
      const rect=el.getBoundingClientRect()
      let newPrice=null
      try{ newPrice=cr.series.coordinateToPrice(e.clientY-rect.top) }catch{}
      if(newPrice==null||isNaN(newPrice)) return
      updatePositionLine(drag.posId,pair,drag.type,newPrice,drag.pos)
    }

    const onMouseUp=e=>{
      const drag=draggingRef.current
      // Reset SIEMPRE al final, sin importar si llegamos al return temprano
      // o no. Esto blinda contra el "drag zombi" que dejaba la línea siguiendo
      // al ratón en futuros clicks.
      try{
        if(!drag||drag.pair!==pair) return
        // Si nunca hubo movimiento real, no actualizamos nada (era sólo un click).
        if(!drag.moved) return
        const cr=chartMap.current[pair]; if(!cr) return
        const rect=el.getBoundingClientRect()
        let newPrice=null
        try{ newPrice=cr.series.coordinateToPrice(e.clientY-rect.top) }catch{}
        if(newPrice==null||isNaN(newPrice)) return
        const{posId,pair:p,type}=drag
        const ps=pairState.current[p]
        if(!ps?.positions) return
        const pos=ps.positions.find(x=>x.id===posId)
        if(!pos) return
        const pips=Math.abs((newPrice-pos.entry)*pipMult(p))
        if(type==='sl'){pos.sl=newPrice;pos.slPips=parseFloat(pips.toFixed(1))}
        else{pos.tp=newPrice;pos.tpPips=parseFloat(pips.toFixed(1))}
        updatePositionLine(posId,p,type,newPrice,pos)
        ps.positions=[...ps.positions]
        setTick(t=>t+1)
      } finally {
        // Reset incondicional: aunque hubiera early return o exception, siempre
        // limpiamos para que el siguiente click no herede estado de drag.
        if(drag&&drag.pair===pair) draggingRef.current=null
      }
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)

    // Cleanup: guardamos la función para que se llame cuando este par se
    // desmonte (cambio de par, recarga). Sin esto, los listeners se acumulan
    // y en algún momento uno con closure stale dispara comportamiento errático.
    const cr0=chartMap.current[pair]
    if(cr0){
      cr0.dragCleanup=()=>{
        try{ el.removeEventListener('mousedown', onMouseDown, {capture:true}) }catch{}
        window.removeEventListener('mousemove', onMouseMove)
        window.removeEventListener('mouseup', onMouseUp)
      }
    }

    loadPair(pair)
  }
  const mountPair=useCallback((pair,el)=>{mountPairRef.current(pair,el)},[])

  // ── Update chart ──────────────────────────────────────────────────────────────
  const updateChart=useCallback((pair,engine,full)=>{
    const cr=chartMap.current[pair]; if(!cr||!engine) return
    const tf=pairTfRef.current[pair]||'H1'
    const agg=engine.getAggregated(tf); if(!agg.length) return
    const prev=cr.prevCount,curr=agg.length
    const _tfMap2={'M1':60,'M3':180,'M5':300,'M15':900,'M30':1800,'H1':3600,'H4':14400,'D1':86400}
    const _tfS2 = _tfMap2[tf]||3600
    const _lastT = agg[agg.length-1].time
    const _lastC = agg[agg.length-1].close
    // Phantoms = velas "futuras" sin movimiento que reservan espacio a la
    // derecha del último precio. CRÍTICO: deben tener OHLC definidos, no
    // sólo `time`. Si sólo tienen time, lightweight-charts intenta hacer
    // autoscale del eje Y leyendo minValue/maxValue de cada bucket y
    // crashea con `Cannot read properties of undefined (reading 'minValue')`.
    // Con OHLC = lastClose se ven como velas plana (línea horizontal) y el
    // autoscale las ignora correctamente.
    const _mkPhantom = (t) => ({ time: t, open: _lastC, high: _lastC, low: _lastC, close: _lastC })

if(full||(curr!==prev&&curr!==prev+1)){
      // Cantidad de phantoms: por defecto 10. Si hay drawings cuyos puntos
      // caen más allá, el effect de cambio de TF setea cr._phantomsNeeded para
      // que el array sea suficientemente largo para renderizarlos correctamente.
      const _phN = cr._phantomsNeeded || 10
      cr._phantomsNeeded = null  // consumir, vuelve a default en próxima llamada
      cr.phantom=Array.from({length:_phN},(_,i)=>_mkPhantom(_lastT+_tfS2*(i+1)))
      let _savedRange=null
      try{ if(cr.hasLoaded) _savedRange=cr.chart.timeScale().getVisibleLogicalRange() }catch{}
      cr.series.setData([...agg,...cr.phantom])
      setSeriesData([...agg, ...cr.phantom], agg.length)
      if(!cr.hasLoaded){
        cr.hasLoaded=true
        cr.userScrolled=false
        const _tbars={'M1':80,'M3':75,'M5':70,'M15':60,'M30':50,'H1':60,'H4':50,'D1':40}
        const _show=_tbars[tf]||80
        const _to=agg.length+5
        const _from=Math.max(0,_to-_show)
        requestAnimationFrame(()=>{
          try{cr.chart.timeScale().setVisibleLogicalRange({from:_from,to:_to})}catch{}
        })
      } else {
        // TF change or rebuild — restore previous range
        if(full) cr.userScrolled=false
        if(_savedRange){
          requestAnimationFrame(()=>{
            try{ cr.chart.timeScale().setVisibleLogicalRange(_savedRange) }catch{}
          })
        }
      }
    } else if(curr===prev+1){
      // Una vela TF nueva se ha cerrado. Regeneramos las phantoms ANTES de
      // escribir __algSuiteSeriesData para evitar dos cosas críticas:
      //   1. Timestamps DUPLICADOS: si no se regenera, phantom[0].time
      //      coincide con agg[last].time (ambos = _oldLastT + _tfS2). Eso
      //      rompe la búsqueda binaria de interpolateLogicalIndexFromTime
      //      en el plugin de drawings → al arrastrar un rectángulo cerca
      //      de la vela actual, se "estira" hacia el infinito porque el
      //      logical index resuelve a posiciones ambiguas.
      //   2. OHLC desfasado: las phantoms quedarían ancladas al close de
      //      la vela TF anterior → cola plana visible a la derecha.
      const _phN = cr.phantom?.length || 10
      cr.phantom = Array.from({length:_phN},(_,i)=>_mkPhantom(_lastT+_tfS2*(i+1)))
      setSeriesData([...agg, ...cr.phantom], agg.length)
      try{
        // Save range, update, restore — prevents chart from scrolling
        const _rng=cr.userScrolled?cr.chart.timeScale().getVisibleLogicalRange():null
        cr.series.update(agg[agg.length-1])
        // Re-aplicar phantoms en el chart (10 update() son irrelevantes en perf)
        for(const ph of cr.phantom){ try{ cr.series.update(ph) }catch{} }
        // [DEBUG TEMP] Log para investigar bug long/short se contrae al play
        if(typeof window!=='undefined' && window.__algSuiteDebugLS){
          const _expJson = (typeof window.__algSuiteExportTools === 'function') ? window.__algSuiteExportTools() : null
          const _tools = _expJson ? JSON.parse(_expJson) : []
          const _ls = _tools.find(t => t.toolType === 'LongShortPosition')
          if(_ls){
            console.log('[LS-DEBUG] new candle', {
              tf, agg_len: agg.length, last_real_t: _lastT,
              phantom_first_t: cr.phantom?.[0]?.time, phantom_last_t: cr.phantom?.[cr.phantom.length-1]?.time,
              ls_points: _ls.points,
            })
          }
        }
        if(_rng) requestAnimationFrame(()=>{try{cr.chart.timeScale().setVisibleLogicalRange(_rng)}catch{}})
      }catch{
        // Fallback
        cr.phantom=Array.from({length:10},(_,i)=>_mkPhantom(_lastT+_tfS2*(i+1)))
        const _r2=cr.chart.timeScale().getVisibleLogicalRange()
        cr.series.setData([...agg,...cr.phantom])
        setSeriesData([...agg, ...cr.phantom], agg.length)
        if(_r2) requestAnimationFrame(()=>{ try{cr.chart.timeScale().setVisibleLogicalRange(_r2)}catch{} })
      }
    } else {
      // Within-bucket update — solo cambió la última vela. Refrescamos las
      // phantoms in-place si _lastC se ha movido, para que la cola a la
      // derecha siga el precio actual y no se quede anclada al close viejo.
      // Esto era el bloque ALGSUITE_PHANTOM_REFRESH y es CRÍTICO en TFs
      // grandes (H1, M30) donde una vela tarda mucho en cerrar.
      try{
        cr.series.update(agg[agg.length-1])
        updateSeriesAt(agg.length - 1, agg[agg.length - 1])
        if(cr.phantom){
          for(let i=0;i<cr.phantom.length;i++){
            const ph=cr.phantom[i]
            if(ph.close!==_lastC){
              ph.open=_lastC; ph.high=_lastC; ph.low=_lastC; ph.close=_lastC
              try{ cr.series.update(ph) }catch{}
            }
          }
        }
      }catch{
        // Fallback to setData if update fails
        cr.series.setData([...agg,...cr.phantom])
        setSeriesData([...agg, ...cr.phantom], agg.length)
      }
    }
    cr.prevCount=curr
    if(pair===activePairRef.current) setCurrentPrice(agg[agg.length-1].close)
  },[])

  // ── TF change: re-render chart sin tocar timestamps de drawings ─────────────
  // Cuando el alumno cambia de TF, los drawings cuyo punto cae a la DERECHA del
  // último precio real (sobre las "phantom candles") se desanclan si en el
  // TF nuevo no generamos suficientes phantoms para cubrir ese timestamp.
  // El plugin LWC ya sabe interpolar timestamps a posiciones sub-bucket via
  // interpolateLogicalIndexFromTime — solo necesita que el array de velas
  // sea suficientemente largo para que logicalToCoordinate no devuelva 0.
  //
  // Solución: NO tocamos los timestamps. Calculamos cuál es el timestamp más
  // a la derecha entre todos los drawings, y generamos suficientes phantoms
  // en el TF nuevo para que ese timestamp caiga dentro del array.
  const prevTfRef = useRef(null)
  useEffect(()=>{
    if(!activePair) return
    const ps=pairState.current[activePair], cr=chartMap.current[activePair]
    if(!ps?.engine || !cr) return

    const newTf = pairTf[activePair] || 'H1'
    const oldTf = prevTfRef.current

    // Deseleccionar drawings antes del re-render (mantiene UX limpia y
    // previene el contraerse del LongShortPosition durante el setData).
    try{ deselectAll() }catch{}

    // Calcular cuántas phantoms necesitamos en el TF nuevo para que TODOS los
    // drawings se rendericen correctamente (sus timestamps deben caer dentro
    // del array de velas, sea sobre vela real o phantom).
    let phantomsNeeded = 10  // mínimo por defecto
    try {
      const TF_SECS = {M1:60, M3:180, M5:300, M15:900, M30:1800, H1:3600, H4:14400, D1:86400}
      const newSecs = TF_SECS[newTf] || 3600
      const newAgg = ps.engine.getAggregated(newTf)
      const newLastReal = newAgg.length ? newAgg[newAgg.length-1].time : null
      if (newLastReal) {
        const exportJson = exportTools()
        const tools = exportJson ? JSON.parse(exportJson) : []
        let maxTs = newLastReal
        tools.forEach(tool => {
          (tool.points || []).forEach(p => {
            if (typeof p?.timestamp === 'number' && p.timestamp > maxTs) {
              maxTs = p.timestamp
            }
          })
        })
        if (maxTs > newLastReal) {
          // +10 de colchón para que el chart respire visualmente a la derecha
          phantomsNeeded = Math.ceil((maxTs - newLastReal) / newSecs) + 10
        }
      }
    } catch(e){ /* swallow — fallback al default 10 */ }

    // Pasamos phantomsNeeded a updateChart vía un ref que lee la función.
    cr._phantomsNeeded = phantomsNeeded
    cr.prevCount = 0
    updateChart(activePair, ps.engine, true)
    setTfKey(k => k+1)

    // Scroll a la posición actual tras el cambio de TF.
    requestAnimationFrame(()=>{
      try{ cr.chart.timeScale().scrollToPosition(8,false) }catch{}
      requestAnimationFrame(()=>setChartTick(t => t+1))
    })

    prevTfRef.current = newTf
  },[pairTf,activePair,updateChart,deselectAll,exportTools])

  useEffect(()=>{
    if(!activePair) return
    const ps=pairState.current[activePair]
    if(ps?.engine){
      // Sync this pair's engine to the current master time (from whichever pair was active before)
      const masterTime = getMasterTime()
      if(masterTime && Math.abs(ps.engine.currentTime - masterTime) > 60) {
        ps.engine.seekToTime(masterTime)
      }
      setIsPlaying(ps.engine.isPlaying);setCurrentTime(ps.engine.currentTime)
      setProgress(Math.round(ps.engine.progress*100))
      const agg=ps.engine.getAggregated(pairTfRef.current[activePair]||'H1')
      setCurrentPrice(agg.slice(-1)[0]?.close??null);setDataReady(true);setMasterTime(ps.engine.currentTime)
    }else{setDataReady(false);if(sessionRef.current)loadPair(activePair)}
    setTick(t=>t+1)
  },[activePair,loadPair])

  useEffect(()=>{if(session&&activePair)loadPair(activePair)},[session,activePair,loadPair])

  // ── Replay ────────────────────────────────────────────────────────────────────
  const eng=()=>pairState.current[activePair]?.engine
  const saveProgress=useCallback(async(ts)=>{
    if(!id||!ts) return
    try{ await supabase.from('sim_sessions').update({last_timestamp:ts}).eq('id',id) }catch(e){}
  },[id])

  const handlePlayPause=useCallback(()=>{
    const e=eng();if(!e)return
    if(e.isPlaying){
      e.pause();setIsPlaying(false)
      saveProgress(e.currentTime)
      // Also save balance on pause
      if(userIdRef.current) supabase.from('sim_sessions').update({balance:balanceRef.current,last_timestamp:e.currentTime}).eq('id',id).then(()=>{}).catch(()=>{})
    }else{
      // Al pulsar PLAY: deseleccionar cualquier drawing activo. Si un
      // LongShortPosition queda seleccionado durante el replay, sus puntos
      // azules de edición hacen que el plugin re-calcule la geometría en
      // cada tick y el rectángulo se "contrae" al ancho de una sola vela.
      // Deseleccionar al play no afecta el dibujo en sí (sigue ahí), solo
      // quita los handles de edición.
      try{ deselectAll() }catch{}
      e.play();setIsPlaying(true)
    }
  },[activePair,saveProgress,deselectAll])
  const handleStep=useCallback(()=>{const e=eng();if(!e||e.isPlaying)return;e.nextCandle(1);const cr=chartMap.current[activePair];if(cr)cr.prevCount=0;updateChart(activePair,e,true);setCurrentTime(e.currentTime);setProgress(Math.round(e.progress*100))},[activePair,updateChart])
  const handleSpeed=useCallback((v)=>{speedRef.current=v;setSpeed(v);Object.values(pairState.current).forEach(ps=>ps?.engine?.setSpeed(v))},[])

  // ── Trading ───────────────────────────────────────────────────────────────────
  const tpPips=slPips*rr
  const openPosition=useCallback((side)=>{
    if(!currentPrice||!activePair) return
    const ps=pairState.current[activePair];if(!ps) return
    const pipSz=1/pipMult(activePair)
    const sl=side==='BUY'?currentPrice-slPips*pipSz:currentPrice+slPips*pipSz
    const tp=side==='BUY'?currentPrice+tpPips*pipSz:currentPrice-tpPips*pipSz
    const posId=`${Date.now()}`
    const newPos={id:posId,pair:activePair,side,entry:currentPrice,sl,tp,lots,slPips,tpPips,rr,openTime:currentTime,initialSlPips:slPips}
    ps.positions=[...ps.positions,newPos]
    createPositionLines(posId,activePair,newPos)
    setLastTrade(side);setTimeout(()=>setLastTrade(null),700);setTick(t=>t+1)
  },[currentPrice,activePair,lots,slPips,tpPips,rr,currentTime])

  // closePosition accepts optional pair+exitPrice for use from engine.onTick
  const closePosition=useCallback(async(posId,reason='MANUAL',pairOverride,exitPriceOverride,note=null)=>{
    const usePair=pairOverride||activePair
    const usePrice=exitPriceOverride||currentPrice
    const ps=pairState.current[usePair];if(!ps||!usePrice) return
    const pos=ps.positions.find(p=>p.id===posId);if(!pos) return
    const pnl=calcPnl(pos.side,pos.entry,usePrice,pos.lots,usePair)
    const result=pnl>0?'WIN':pnl<0?'LOSS':'BREAKEVEN'
    // FIX BUG C: RR real se calcula contra el SL INICIAL, no contra el SL actual.
    // Si alumno movió SL a BE o trailing, slPips actual puede ser ~0 y haría explotar el RR.
    // initialSlPips se guarda en la apertura y nunca cambia. Fallback a slPips para trades antiguos.
    const slPipsForRr = pos.initialSlPips ?? pos.slPips
    const rrReal=slPipsForRr>0?pnl/(slPipsForRr*pos.lots*10):0
    ps.positions=ps.positions.filter(p=>p.id!==posId)
    ps.trades=[...ps.trades,{...pos,exit:usePrice,closeTime:currentTime,pnl,result,rrReal:parseFloat(rrReal.toFixed(2)),reason}]
    removePositionLines(posId,usePair)
    const newBalance = parseFloat((balanceRef.current+pnl).toFixed(2))
    setBalance(newBalance);setTick(t=>t+1)
    if(userIdRef.current){
      try{
        // Convert ordinal timestamps → real unix timestamps for DB storage
        const ps2=pairState.current[usePair]
        const realOpenTime = pos.openTime??null
        const realCloseTime = currentTime>1000000000?currentTime:null
        await supabase.from('sim_trades').insert({
          user_id:userIdRef.current,
          session_id:id,
          pair:pos.pair,
          side:pos.side,
          lots:parseFloat(pos.lots)||0.01,
          entry_price:parseFloat(pos.entry)||0,
          exit_price:parseFloat(usePrice)||0,
          sl_price:parseFloat(pos.sl)||0,
          tp_price:parseFloat(pos.tp)||0,
          rr:parseFloat(rrReal.toFixed(2)),
          pnl:parseFloat(pnl.toFixed(2)),
          result,
          notes: note||null,
          opened_at:realOpenTime?new Date(realOpenTime*1000).toISOString():new Date().toISOString(),
          closed_at:realCloseTime?new Date(realCloseTime*1000).toISOString():new Date().toISOString(),
        })
        await supabase.from('sim_sessions').update({balance:newBalance,last_timestamp:currentTime}).eq('id',id)
      }catch(e){console.error(e)}
    }
    // Si es un challenge, refrescar HUD con nuevo balance/DD/target
    if(sessionRef.current?.challenge_type) refreshChallengeStatus()
  },[activePair,currentPrice,currentTime,id,refreshChallengeStatus])

  // Keep refs always pointing to latest values/functions
  balanceRef.current = balance
  currentTimeRef.current = currentTime
  challengeStatusRef.current = challengeStatus
  useEffect(()=>{
    closePositionRef.current    = closePosition
    checkSLTPRef.current        = checkSLTP
    checkLimitOrdersRef.current = checkLimitOrders
    checkChallengeBreachRef.current = checkChallengeBreach
  })

  // Reset del flag breach al cambiar de sesión (por si se reabre).
  useEffect(() => {
    challengeBreachFiringRef.current = false
  }, [id])

  // B1: Reset de pairState al cambiar de sesión.
  // useRef sobrevive al cambio de URL /session/[id] (Next.js reutiliza el componente),
  // y el loader de la sesión reutiliza el slot del par si ya existe — heredando
  // positions/orders/engine vivos de la sesión anterior. Esto era el mecanismo del
  // bug B1 lado cliente: tras router.push a la fase hija, el chart de la hija
  // mostraba el flotante de la madre. Reset explícito al cambiar id soluciona.
  useEffect(() => {
    pairState.current = {}
  }, [id])

  // ── Limit order helpers ──────────────────────────────────────────────────────

  // ── Position price lines (entry, SL, TP) ────────────────────────────────────

  function createPositionLines(posId,pair,pos){
    // Lines are rendered by HTML overlay — no LWC price lines needed
  }

  function removePositionLines(posId,pair){
    // Lines are rendered by HTML overlay — nothing to remove from LWC
  }

  function updatePositionLine(posId,pair,type,newPrice,pos){
    // Lines are rendered by HTML overlay — nothing to update in LWC
  }

  const previewOrder=useCallback((side, price, pair)=>{
    setCtxMenu(null)
    const mult=pipMult(pair), pipSz=1/mult
    const defaultSl=10, defaultTp=30
    const sl=side==='BUY_LIMIT' ? price-defaultSl*pipSz : price+defaultSl*pipSz
    const tp=side==='BUY_LIMIT' ? price+defaultTp*pipSz : price-defaultTp*pipSz
    setPreview({pair,side,entry:price,sl,tp,lots,slPips:defaultSl,tpPips:defaultTp,rr:3})
  },[lots])

  const confirmLimitOrder=useCallback(()=>{
    if(!preview) return
    const ps=pairState.current[preview.pair]; if(!ps) return
    if(!ps.orders) ps.orders=[]
    const order={...preview, id:`L${Date.now()}`, createdTime:currentTime}
    ps.orders=[...ps.orders, order]
    // Price lines — subtle colors
    const cr=chartMap.current[preview.pair]
    if(cr?.series){
      if(!cr.priceLines) cr.priceLines={}
      cr.priceLines[order.id+'_entry']=cr.series.createPriceLine({price:order.entry,color:'rgba(180,180,180,0.5)',lineWidth:1,lineStyle:0,axisLabelVisible:true,title:`${order.side==='BUY_LIMIT'?'B':'S'}.LIM ${order.lots}L`})
      cr.priceLines[order.id+'_sl']=cr.series.createPriceLine({price:order.sl,color:'rgba(239,83,80,0.4)',lineWidth:1,lineStyle:2,axisLabelVisible:true,title:`SL`})
      cr.priceLines[order.id+'_tp']=cr.series.createPriceLine({price:order.tp,color:'rgba(30,144,255,0.4)',lineWidth:1,lineStyle:2,axisLabelVisible:true,title:`TP`})
    }
    setPreview(null)
    setTick(t=>t+1)
  },[preview,currentTime])

  const cancelPreview=useCallback(()=>setPreview(null),[])

  // Called by PositionOverlay when user finishes dragging a SL/TP line
  const handlePositionDragEnd=useCallback((posId, type, newPrice)=>{
    const ps=pairState.current[activePair]; if(!ps) return
    // Handle open positions
    const pos=ps.positions?.find(x=>x.id===posId)
    if(pos){
      const pips=parseFloat((Math.abs((newPrice-pos.entry)*pipMult(activePair))).toFixed(1))
      if(type==='sl'){pos.sl=newPrice;pos.slPips=pips}
      else if(type==='tp'){pos.tp=newPrice;pos.tpPips=pips}
      ps.positions=[...ps.positions]
      setTick(t=>t+1)
      return
    }
    // Handle limit orders
    const ord=ps.orders?.find(x=>x.id===posId)
    if(ord){
      const pips=parseFloat((Math.abs((newPrice-ord.entry)*pipMult(activePair))).toFixed(1))
      if(type==='lim_sl'){ord.sl=newPrice;ord.slPips=pips}
      else if(type==='lim_tp'){ord.tp=newPrice;ord.tpPips=pips}
      else if(type==='lim_e'){ord.entry=newPrice}
      // Update price lines on chart
      const cr=chartMap.current[activePair]
      if(cr?.series&&cr?.priceLines){
        const keyMap={lim_e:'_entry',lim_sl:'_sl',lim_tp:'_tp'}
        const k=keyMap[type]
        if(k&&cr.priceLines[ord.id+k]){
          try{cr.series.removePriceLine(cr.priceLines[ord.id+k])}catch{}
          cr.priceLines[ord.id+k]=cr.series.createPriceLine({
            price:newPrice,
            color:k==='_entry'?'rgba(180,180,180,0.5)':k==='_sl'?'rgba(239,83,80,0.4)':'rgba(30,144,255,0.4)',
            lineWidth:1,lineStyle:k==='_entry'?0:2,axisLabelVisible:true,
            title:k==='_entry'?`${ord.side==='BUY_LIMIT'?'B':'S'}.LIM ${ord.lots}L`:k==='_sl'?'SL':'TP'
          })
        }
      }
      ps.orders=[...ps.orders]
      setTick(t=>t+1)
    }
  },[activePair])

  const cancelLimitOrder=useCallback((orderId,pair)=>{
    const ps=pairState.current[pair]; if(!ps?.orders) return
    ps.orders=ps.orders.filter(o=>o.id!==orderId)
    const cr=chartMap.current[pair]
    if(cr?.priceLines){
      ['_entry','_sl','_tp'].forEach(k=>{
        if(cr.priceLines[orderId+k]){
          try{cr.series.removePriceLine(cr.priceLines[orderId+k])}catch{}
          delete cr.priceLines[orderId+k]
        }
      })
    }
    setTick(t=>t+1)
  },[])

  // Update preview SL/TP pips when dragged
  const updatePreviewSl=useCallback((pips)=>{
    setPreview(prev=>{
      if(!prev) return prev
      const mult=pipMult(prev.pair), pipSz=1/mult
      const sl=prev.side==='BUY_LIMIT' ? prev.entry-pips*pipSz : prev.entry+pips*pipSz
      return{...prev,sl,slPips:pips}
    })
  },[])

  const updatePreviewTp=useCallback((pips)=>{
    setPreview(prev=>{
      if(!prev) return prev
      const mult=pipMult(prev.pair), pipSz=1/mult
      const tp=prev.side==='BUY_LIMIT' ? prev.entry+pips*pipSz : prev.entry-pips*pipSz
      return{...prev,tp,tpPips:pips,rr:parseFloat((pips/prev.slPips).toFixed(1))}
    })
  },[])

  const checkSLTP=useCallback((pair,engine)=>{
    const ps=pairState.current[pair];if(!ps?.positions?.length) return
    const curIdx=engine.currentIndex
    // Determine range to check — from last checked index+1 to current
    // This ensures no M1 candle is skipped at any speed (1x, 5x, 15x, 60x, ∞)
    const fromIdx = ps.lastSLTPIdx != null ? ps.lastSLTPIdx + 1 : curIdx
    ps.lastSLTPIdx = curIdx

    const toClose=[]
    for(let i=fromIdx; i<=curIdx; i++){
      const candle=engine.candles[i];if(!candle) continue
      const{high,low}=candle
      ps.positions.forEach(pos=>{
        if(toClose.find(x=>x.id===pos.id)) return // already queued
        // FIX BUG A: Skip candles before this position was opened.
        // Without this guard, past candles could trigger SL/TP retroactively
        // (e.g. when a LIMIT activated incorrectly on a past candle).
        if(pos.openTime != null && candle.time < pos.openTime) return
        const hitTp=pos.side==='BUY'?high>=pos.tp:low<=pos.tp
        const hitSl=pos.side==='BUY'?low<=pos.sl:high>=pos.sl
        if(hitTp) toClose.push({id:pos.id,reason:'TP',price:pos.tp})
        else if(hitSl) toClose.push({id:pos.id,reason:'SL',price:pos.sl})
      })
    }
    toClose.forEach(({id,reason,price})=>closePositionRef.current(id,reason,pair,price))
  },[])

  const checkLimitOrders=useCallback((pair,engine)=>{
    const ps=pairState.current[pair]; if(!ps?.orders?.length) return
    const curIdx=engine.currentIndex
    const fromIdx = ps.lastLimitIdx != null ? ps.lastLimitIdx + 1 : curIdx
    ps.lastLimitIdx = curIdx

    const executed=[]
    for(let i=fromIdx; i<=curIdx; i++){
      const candle=engine.candles[i]; if(!candle) continue
      ps.orders.forEach(order=>{
        if(executed.includes(order.id)) return
        // FIX BUG A: Skip candles before this LIMIT was placed.
        // Without this guard, a past candle that already crossed the entry would activate the LIMIT retroactively.
        if(order.createdTime != null && candle.time < order.createdTime) return
        const hit=(order.side==='BUY_LIMIT'&&candle.low<=order.entry)||(order.side==='SELL_LIMIT'&&candle.high>=order.entry)
        if(!hit) return
        executed.push(order.id)
        const cr=chartMap.current[pair]
        if(cr?.priceLines){
          ['_entry','_sl','_tp'].forEach(k=>{
            if(cr.priceLines[order.id+k]){try{cr.series.removePriceLine(cr.priceLines[order.id+k])}catch{};delete cr.priceLines[order.id+k]}
          })
        }
        const side=order.side==='BUY_LIMIT'?'BUY':'SELL'
        if(!ps.positions) ps.positions=[]
        const posId=`P${Date.now()}-${Math.random().toString(36).slice(2,5)}`
        // openTime = timestamp of the candle that triggered the LIMIT, not engine.currentTime.
        // This ensures checkSLTP only checks candles AFTER this position was actually opened.
        const newPos={id:posId,pair,side,entry:order.entry,sl:order.sl,tp:order.tp,lots:order.lots,slPips:order.slPips,tpPips:order.tpPips,rr:order.rr,openTime:candle.time,initialSlPips:order.slPips}
        ps.positions=[...ps.positions,newPos]
        setTimeout(()=>createPositionLines(posId,pair,newPos),50)
      })
    }
    if(executed.length){
      ps.orders=ps.orders.filter(o=>!executed.includes(o.id))
      setTick(t=>t+1)
    }
  },[])

  // ── Challenge breach detector (FTMO-style) ─────────────────────────────────
  // Para cada vela en el rango [fromIdx, curIdx]:
  //   1. Calcula el peor floating PnL posible en la vela usando high/low por posición.
  //   2. Suma con el realizado total + floating de OTROS pares.
  //   3. Si esa suma cruza el cap diario o total, el alumno ha quemado el challenge.
  //   4. Calcula el PRECIO EXACTO donde se cruza el cap (fórmula lineal).
  //   5. Cierra todas las posiciones a ese precio. Reason = 'DD_BREACH'.
  //   6. Setea un flag para abrir el modal de fail tras el render.
  //
  // Notas:
  // - Solo opera sobre posiciones del pair actual (las del tick). Posiciones de
  //   otros pares se cuentan a su PnL "actual" (último precio cerrado), porque
  //   sus propios ticks ya cerrarán por su lado si su vela las quema.
  // - Si hay múltiples posiciones del mismo par, la fórmula combinada sigue
  //   siendo lineal (suma de pnl-por-precio de cada una), así que la solución
  //   sigue siendo cerrada — no necesita búsqueda binaria.
  const checkChallengeBreach = useCallback((pair, engine) => {
    const sess = sessionRef.current
    if (!sess?.challenge_type) return
    // Si el challenge ya está terminado (failed/passed), no recheckar.
    const cs = challengeStatusRef.current
    if (cs?.evaluation?.status && cs.evaluation.status !== 'active' && cs.evaluation.status !== 'target_reached') return
    // Si ya se disparó un breach en este tick previo, no recalcular.
    if (challengeBreachFiringRef.current) return

    const ps = pairState.current[pair]
    if (!ps?.positions?.length) return

    const cfg = cs?.config
    if (!cfg) return
    const capital = Number(sess.capital)
    if (!(capital > 0)) return

    // Cap total absoluto (suelo fijo desde capital inicial).
    const ddTotalCapUSD = capital * (cfg.dd_total_pct / 100)
    // Cap diario relativo (startOfDayBalance × dd_daily_pct).
    // Como aproximación segura usamos lo que el HUD ya calculó (ddDailyCapUSD).
    // Si no está disponible, usamos capital × pct como conservador.
    const ddDailyCapUSD = cs?.evaluation?.ddDailyCapUSD || (capital * (cfg.dd_daily_pct / 100))
    // PnL realizado del DÍA actual: lo que el HUD ya calculó (ddDailyCurrentUSD
    // representa la caída ya producida hoy).
    const ddDailyAlreadyUSD = cs?.evaluation?.ddDailyCurrentUSD || 0
    // PnL realizado total desde capital inicial: balance actual - capital.
    const realizedDelta = balanceRef.current - capital
    // Floating de OTROS pares (no el del tick): suma de su unrealized actual
    // usando el último close del candle actual del engine. No el high/low —
    // esos pares tienen sus propios ticks que detectarán su breach localmente.
    let floatingOtherPairs = 0
    Object.entries(pairState.current).forEach(([k, ps2]) => {
      if (k === pair || !ps2?.positions?.length || !ps2.engine) return
      const candles = ps2.engine.candles || []
      const idx2 = ps2.engine.currentIndex
      const lastCandle = candles[idx2]
      const lastPrice = lastCandle?.close ?? ps2.positions[0].entry
      ps2.positions.forEach(p => {
        floatingOtherPairs += calcPnl(p.side, p.entry, lastPrice, p.lots, k)
      })
    })

    // Itera velas como hace checkSLTP, desde la última registrada.
    const curIdx = engine.currentIndex
    const fromIdx = ps.lastBreachIdx != null ? ps.lastBreachIdx + 1 : curIdx
    ps.lastBreachIdx = curIdx

    // Para cada vela, calculamos el WORST floating en esa vela:
    // - BUY pierde más cuando el precio baja: peor PnL al low.
    // - SELL pierde más cuando el precio sube: peor PnL al high.
    // Como múltiples posiciones del mismo par pueden tener distinto side,
    // y el precio se mueve por toda la vela, evaluamos el peor caso EN AMBOS
    // EXTREMOS y nos quedamos con el peor de los dos.
    for (let i = fromIdx; i <= curIdx; i++) {
      const candle = engine.candles[i]
      if (!candle) continue
      const { high, low } = candle
      // Filtramos posiciones que ya estaban abiertas en esta vela.
      const livePositions = ps.positions.filter(p => p.openTime == null || candle.time >= p.openTime)
      if (!livePositions.length) continue

      // PnL combinado al low y al high.
      const pnlAtLow  = livePositions.reduce((s, p) => s + calcPnl(p.side, p.entry, low,  p.lots, pair), 0)
      const pnlAtHigh = livePositions.reduce((s, p) => s + calcPnl(p.side, p.entry, high, p.lots, pair), 0)
      // Peor escenario floating de este pair en esta vela.
      const worstFloating = Math.min(pnlAtLow, pnlAtHigh)

      // Equity worst-case en esta vela = capital + realized + floatingOther + worstFloating
      const equityWorst = capital + realizedDelta + floatingOtherPairs + worstFloating
      // Caída total desde capital inicial.
      const ddTotalAtWorst = Math.max(0, capital - equityWorst)
      // Caída del DÍA: realized del día (ya producida) + (worst-case que esta
      // vela podría empeorarlo). Solo cuenta lo NEGATIVO de la combinación.
      // Aproximación: si la caída total agregada empeora respecto al inicio del
      // día, ese delta cuenta como ddDaily adicional.
      // Para simplicidad usamos la métrica de capital base — el motor backend
      // recalculará exacto al cerrar.
      const ddDailyAtWorst = ddDailyAlreadyUSD + Math.max(0, -worstFloating - floatingOtherPairs)

      const totalBreach = ddTotalAtWorst >= ddTotalCapUSD - 0.01
      const dailyBreach = ddDailyAtWorst >= ddDailyCapUSD - 0.01

      if (!totalBreach && !dailyBreach) continue

      // ─── Hay breach. Calcular el precio EXACTO donde el equity tocó el cap ───
      // Modelamos el PnL combinado de las posiciones del pair como función
      // lineal del precio: pnl(price) = sum( ±(price - entry_i) × pipMult × lots_i × 10 )
      // Donde el signo es + si BUY y - si SELL.
      //   = price × A - B   con A = sum(±pipMult × lots × 10), B = sum(±entry × pipMult × lots × 10)
      // Resolvemos: pnl(price) = pnlObjetivo  ⇒  price = (pnlObjetivo + B) / A
      const mult = pipMult(pair)
      let A = 0, B = 0
      livePositions.forEach(p => {
        const sign = p.side === 'BUY' ? 1 : -1
        const coef = sign * mult * Number(p.lots) * 10
        A += coef
        B += coef * Number(p.entry)
      })
      // Determinar el pnlObjetivo: el peor de los dos caps (el que se cruce primero).
      // - Para total breach: pnlObjetivo de pair = -(ddTotalCapUSD - realizedDelta - floatingOtherPairs)
      // - Para daily breach: pnlObjetivo de pair = -(ddDailyCapUSD - ddDailyAlreadyUSD) - floatingOtherPairs
      // Tomamos el menos negativo (= se cruza antes).
      const targetForTotal = -(ddTotalCapUSD) - realizedDelta - floatingOtherPairs
      const targetForDaily = -(ddDailyCapUSD - ddDailyAlreadyUSD) - floatingOtherPairs
      // Queremos el target con mayor valor (menos pérdida) — se cruza primero.
      const pnlObjetivo = Math.max(targetForTotal, targetForDaily)
      const reasonStr = (targetForDaily > targetForTotal) ? 'DD_DAILY_BREACH' : 'DD_TOTAL_BREACH'

      // Si A es cero (no debería), salimos.
      if (Math.abs(A) < 1e-9) continue
      let breachPrice = (pnlObjetivo + B) / A
      // Empujamos 0.5 pips MÁS ALLÁ del precio de breach exacto para asegurar
      // que el motor backend detecte el fail (evita falsos negativos por
      // redondeo IEEE-754 al guardar/leer pnl en BD).
      const halfPip = 0.5 / mult
      // Dirección: si el equity worst se da al low (BUY agregado), empujamos
      // ABAJO. Si se da al high (SELL agregado), empujamos ARRIBA.
      const pushDown = (pnlAtLow < pnlAtHigh)
      breachPrice += pushDown ? -halfPip : halfPip
      // Clampar al rango de la vela [low, high]. Si por error matemático
      // sale fuera, usamos el extremo más cercano.
      breachPrice = Math.max(low, Math.min(high, breachPrice))

      // Disparar cierre forzado de TODAS las posiciones de TODOS los pares al
      // mejor precio disponible (en pair actual = breachPrice; en otros pares
      // = su último precio conocido). Reason marca el motivo.
      challengeBreachFiringRef.current = true
      const reasonLabel = reasonStr === 'DD_DAILY_BREACH' ? 'dd_daily' : 'dd_total'

      // Cierre en pair actual al breachPrice
      const positionsToClose = [...livePositions]
      positionsToClose.forEach(p => {
        try { closePositionRef.current(p.id, reasonStr, pair, breachPrice) } catch(e) { console.error('[breach close]', e) }
      })
      // Cierre en otros pares al último precio conocido (close del candle actual)
      Object.entries(pairState.current).forEach(([k, ps2]) => {
        if (k === pair || !ps2?.positions?.length || !ps2.engine) return
        const candles = ps2.engine.candles || []
        const idx2 = ps2.engine.currentIndex
        const lastCandle = candles[idx2]
        const lastPrice = lastCandle?.close ?? ps2.positions[0].entry
        const otherPositions = [...ps2.positions]
        otherPositions.forEach(p => {
          try { closePositionRef.current(p.id, reasonStr, k, lastPrice) } catch(e) { console.error('[breach close other]', e) }
        })
      })

      // Pausar el motor — el alumno ha quemado el challenge.
      try { engine.pause() } catch {}
      try { setIsPlaying(false) } catch {}

      // Disparar modal de fail DESPUÉS de que el backend confirme el nuevo
      // estado. Si abriéramos el modal antes, mostraría datos stale (DD %
      // pre-cierre) y un failureReason incorrecto.
      //
      // Estrategia: esperamos suficiente para que la inserción del trade en
      // BD haya terminado (las llamadas a closePosition arriba son async),
      // luego refrescamos status y solo entonces abrimos el modal.
      // Usamos un await encadenado en lugar de setTimeout para tener
      // control real del orden.
      ;(async () => {
        // Pequeño respiro para que las inserts paralelas a sim_trades terminen.
        await new Promise(r => setTimeout(r, 300))
        // Reintentamos el refresh hasta 3 veces si el motor backend aún no
        // ve los nuevos trades (consistencia eventual). En la mayoría de casos
        // basta el primer intento.
        for (let attempt = 0; attempt < 3; attempt++) {
          await refreshChallengeStatus()
          // Leemos el state recién seteado. challengeStatusRef.current es el
          // espejo que actualizamos en cada render.
          const st = challengeStatusRef.current?.evaluation?.status
          if (st === 'failed_dd_daily' || st === 'failed_dd_total') break
          await new Promise(r => setTimeout(r, 250))
        }
        setChallengeModal('failed')
      })()

      // Salimos del bucle de velas: ya quemado, no procesamos más.
      break
    }
  }, [refreshChallengeStatus])

  // ── Multi-pair ────────────────────────────────────────────────────────────────
  const addPair=useCallback((pair)=>{
    setAddingPair(false)
    if(activePairs.includes(pair)){setActivePair(pair);return}
    const nxt={...pairTfRef.current,[pair]:'H1'};pairTfRef.current=nxt;setPairTf(nxt)
    setActivePairs(prev=>[...prev,pair]);setActivePair(pair)
  },[activePairs])

  const removePair=useCallback((pair)=>{
    if(activePairs.length===1) return
    const cr=chartMap.current[pair];if(cr){try{cr.ro?.disconnect()}catch{};try{cr.chart.remove()}catch{};delete chartMap.current[pair]}
    delete pairState.current[pair]
    const next=activePairs.filter(p=>p!==pair);setActivePairs(next)
    if(activePair===pair)setActivePair(next[0])
  },[activePairs,activePair])

  // ── Shift+Click → activate ruler ─────────────────────────────────────────────
  useEffect(()=>{
    const onMouseDown=(e)=>{
      if(e.button!==0||!e.shiftKey) return
      // Only trigger inside the chart area
      const chartEl=document.querySelector('[data-chart-wrap]')
      if(chartEl&&!chartEl.contains(e.target)) return
      setRulerActive(true)
      setActiveTool('ruler')
    }
    window.addEventListener('mousedown',onMouseDown)
    return()=>window.removeEventListener('mousedown',onMouseDown)
  },[])
  useEffect(()=>{
    const onKey=e=>{
      if(e.target.tagName==='INPUT'||e.target.tagName==='TEXTAREA') return
      // Si la sesión está terminada, bloqueamos atajos de replay para evitar
      // que el alumno avance velas con el teclado y "vea el futuro" del precio.
      if(e.code==='Space'){
        if(challengeLocked) return
        e.preventDefault();handlePlayPause()
      }
      if(e.code==='ArrowRight'){
        if(challengeLocked) return
        handleStep()
      }
      if(e.code==='Escape'){ setActiveTool('cursor'); setRulerActive(false) }
      if(e.code==='Delete'||e.code==='Backspace'){
        let deleted = false
        // Delete custom drawing (text)
        if(selectedDrawingRef.current){
          removeDrawing(selectedDrawingRef.current.id)
          setSelectedDrawing(null)
          deleted = true
        }
        // Delete vendor drawing (TrendLine, Rectangle, etc.)
        if(selectedToolRef.current){
          removeSelected()
          setSelectedTool(null)
          deleted = true
        }
        // Persist immediately so deletion survives reload
        if(deleted) setTimeout(()=>{ if(saveDrawingsRef.current) saveDrawingsRef.current() }, 100)
      }
    }
    window.addEventListener('keydown',onKey)
    return()=>window.removeEventListener('keydown',onKey)
  },[handlePlayPause,handleStep,challengeLocked])

  useEffect(()=>()=>{
    // Save drawings before unmount
    if(saveDrawingsRef.current) saveDrawingsRef.current()
    // Save progress before unmount
    const e = pairState.current[activePairRef.current]?.engine
    if(e?.currentTime && id){
      try{supabase.from('sim_sessions').update({last_timestamp:e.currentTime,balance:balanceRef.current}).eq('id',id)}catch(err){}
    }
    Object.values(pairState.current).forEach(ps=>ps?.engine?.pause())
    Object.values(chartMap.current).forEach(cr=>{try{cr.ro?.disconnect()}catch{};try{cr.chart.remove()}catch{}})
  },[])

  // ── Computed ──────────────────────────────────────────────────────────────────
  const activePs      = pairState.current[activePair]
  const pendingOrders = activePs?.orders??[]
  const openPositions = activePs?.positions??[]
  const allTrades     = Object.values(pairState.current).flatMap(ps=>ps?.trades??[])
  const unrealized    = openPositions.reduce((s,p)=>s+calcPnl(p.side,p.entry,currentPrice??p.entry,p.lots,activePair),0)
  // Realized = current balance - initial capital (persists across sessions)
  const initialCapital = session ? parseFloat(session.capital||session.balance||10000) : 10000
  const realized      = parseFloat((balance - initialCapital).toFixed(2))
  const activeTf      = pairTf[activePair]||'H1'

  // Si el usuario está autenticado pero no tiene acceso al Simulador, bloqueamos.
  if(!authLoading && !hasAccess) return <NoAccess profile={profile} producto="Simulador" />

  if(loading) return <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',background:'#000'}}><Spin/></div>

  return (
    <div style={s.root}>

      {/* Constellation background */}
      <canvas ref={bgCanvasRef} style={s.bgCanvas}/>

      {/* CHART — full screen */}
      <div style={s.chartWrap} data-chart-wrap="1">
        {activePairs.map(pair=>(
          <div key={pair}
            ref={el=>{if(el&&!chartMap.current[pair])mountPair(pair,el)}}
            style={{...s.chart,display:pair===activePair?'block':'none'}}
          />
        ))}
        {drawings.filter(d=>d.type==='text').map(d=>{
          const cr=chartMap.current?.[activePair]
          if(!cr) return null
          const sc=toScreenCoords(cr,d.points[0].time,d.points[0].price)
          if(!sc) return null
          const isSelected=selectedDrawing?.id===d.id
          return <div key={d.id}
            style={{position:'absolute',left:sc.x,top:sc.y,transform:'translate(-4px,-100%)',
              zIndex:20,cursor:'grab',userSelect:'none',
              background:'rgba(4,10,24,0.85)',border:`1px solid ${isSelected?'rgba(30,144,255,0.8)':'rgba(30,144,255,0.3)'}`,
              borderRadius:4,padding:'3px 7px',
              color:d.metadata?.color||'#ffffff',
              fontSize:d.metadata?.fontSize||12,
              fontFamily:"'Montserrat',sans-serif",
              whiteSpace:'nowrap'}}
            onMouseDown={e=>{
              if(e.button!==0) return
              e.stopPropagation()
              const startX=e.clientX,startY=e.clientY
              const origTime=d.points[0].time,origPrice=d.points[0].price
              const el=e.currentTarget.parentElement
              const rect=el.getBoundingClientRect()
              const origSc=toScreenCoords(cr,origTime,origPrice)
              let moved=false
              const mv=(ev)=>{
                moved=true
                const dx=ev.clientX-startX,dy=ev.clientY-startY
                if(!origSc) return
                const newCoords=fromScreenCoords(cr,origSc.x+dx,origSc.y+dy)
                if(newCoords) updateDrawing(d.id,{points:[{time:newCoords.time,price:newCoords.price}]})
              }
              const up=(ev)=>{
                window.removeEventListener('mousemove',mv)
                window.removeEventListener('mouseup',up)
                if(!moved){
                  setSelectedDrawing(prev=>prev?.id===d.id?null:{id:d.id,x:ev.clientX,y:ev.clientY-80})
                }
              }
              window.addEventListener('mousemove',mv)
              window.addEventListener('mouseup',up)
              e.preventDefault()
            }}
          >{d.metadata?.text||''}</div>
        })}
        <KillzonesOverlay chartMap={chartMap} activePair={activePair} tick={tick} chartTick={chartTick} dataReady={dataReady} currentTf={pairTf[activePair]||'H1'} currentTime={currentTime}/>
        <RulerOverlay active={rulerActive} onDeactivate={()=>{setRulerActive(false);setActiveTool('cursor')}} chartMap={chartMap} activePair={activePair} />
        <CustomDrawingsOverlay drawings={drawings} chartMap={chartMap} activePair={activePair} tfKey={tfKey} />
        {!dataReady&&(
          <div style={s.overlay}><Spin/><span style={s.overlayTxt}>Cargando {activePair}…</span></div>
        )}
        <PositionOverlay
          positions={openPositions}
          pendingOrders={pendingOrders}
          chartMap={chartMap}
          activePair={activePair}
          dataReady={dataReady}
          onClosePos={(posId)=>{ const p=openPositions.find(x=>x.id===posId); if(p) setCloseModal({posId,pair:activePair,pos:p}) }}
          onCancelOrder={(ordId)=>cancelLimitOrder(ordId,activePair)}
          onDragEnd={handlePositionDragEnd}
        />

      </div>

      {/* DrawingToolbarV2 + DrawingConfigPill ocultos en sesiones terminadas:
          el alumno solo puede ver lo que hizo, no dibujar nuevo. */}
      {!challengeLocked && (<>
      <DrawingToolbarV2
        activeTool={activeTool}
        onToolChange={(id)=>{
          setActiveTool(id)
          setActiveToolKey((id==='cursor'||id==='text'||id==='ruler')?null:id)
          setRulerActive(id==='ruler')
          if(id==='cursor')setSelectedTool(null)
        }}
        onAddTool={(toolKey)=>addTool(toolKey)}
        onRemoveSelected={removeSelected}
        onRemoveAll={()=>{
          removeAll()
          removeAllCustom()
          setDrawingCount(0)
          setSelectedTool(null)
          setSelectedDrawing(null)
          setTimeout(()=>{ if(saveDrawingsRef.current) saveDrawingsRef.current() },100)
        }}
        drawingCount={drawingCount}
        templates={templates}
        onSaveTemplate={async(name)=>{
          const json=exportTools();if(!json||!userIdRef.current)return
          const{data}=await supabase.from('sim_drawing_templates').insert({user_id:userIdRef.current,name,data:json}).select().single()
          if(data)setTemplates(prev=>[...prev,data])
        }}
        onLoadTemplate={(t)=>{if(!t?.data)return;removeAll();importTools(t.data)}}
      />
      <DrawingConfigPill
        selectedTool={selectedTool}
        toolKey={activeToolKey}
        toolConfig={activeToolKey?toolConfigs[activeToolKey]:null}
        onUpdate={(newCfg)=>{
          const tk=activeToolKeyRef.current
          const st=selectedToolRef.current
          if(tk){
            updateToolConfig(tk,newCfg)
            if(st?.id) applyToTool(st.id,tk,newCfg)
            // Persist so changes survive reload
            setTimeout(()=>{ if(saveDrawingsRef.current) saveDrawingsRef.current() },150)
          }
        }}
        onOpenConfig={()=>{
          if(activeToolKeyRef.current==='LongShortPosition'&&selectedToolRef.current?.id){
            try{const json=pluginRef.current?.getLineToolByID(selectedToolRef.current.id);const arr=JSON.parse(json);setLongShortModal({toolId:selectedToolRef.current.id,tool:arr?.[0]});}catch{}
          }
        }}
        onDelete={()=>{removeSelected();setSelectedTool(null);setTimeout(()=>{ if(saveDrawingsRef.current) saveDrawingsRef.current() },100)}}
        visibleTf={selectedTool?.id?(()=>{const e=drawingTfMap[selectedTool.id];return e?Array.isArray(e)?e:e.tfs||['M1','M5','M15','M30','H1','H4','D1']:['M1','M5','M15','M30','H1','H4','D1']})():['M1','M5','M15','M30','H1','H4','D1']}
        onVisibilityChange={(tfs)=>{
          if(!selectedTool?.id||!activeToolKey) return
          try{
            const json=pluginRef.current?.getLineToolByID(selectedTool.id)
            const arr=json?JSON.parse(json):null
            const origCfg=arr?.[0]?.options||toolConfigs[activeToolKey]||{}
            setDrawingTfMap(prev=>({...prev,[selectedTool.id]:{tfs,cfg:origCfg,toolKey:activeToolKey}}))
          }catch{
            setDrawingTfMap(prev=>({...prev,[selectedTool.id]:{tfs,cfg:toolConfigs[activeToolKey]||{},toolKey:activeToolKey}}))
          }
        }}
        onDeselect={()=>setSelectedTool(null)}
        templates={templates}
        onSaveTemplate={async(name)=>{
          const cfg=activeToolKey?toolConfigs[activeToolKey]:{}
          const entry=selectedTool?.id?drawingTfMap[selectedTool.id]:null
          const tfsToSave=entry?(Array.isArray(entry)?entry:entry.tfs||null):null
          const cfgWithTf={...cfg,...(tfsToSave?{visibleTf:tfsToSave}:{})}
          if(!userIdRef.current) return
          const insRes=await supabase.from('sim_drawing_templates').insert({user_id:userIdRef.current,name,tool_key:activeToolKey,config:JSON.stringify(cfgWithTf),data:'{}'}).select().single()
          if(insRes.data)setTemplates(prev=>[...prev,insRes.data])
        }}
        onDeleteTemplate={async(id)=>{
          await supabase.from('sim_drawing_templates').delete().eq('id',id)
          setTemplates(prev=>prev.filter(t=>t.id!==id))
        }}
        onLoadTemplate={(t)=>{
          if(!t?.config||!activeToolKey) return
          try{
            const cfg=JSON.parse(t.config)
            const {visibleTf:tfs,...cfgWithoutTf}=cfg
            updateToolConfig(activeToolKey,cfgWithoutTf)
            if(selectedTool?.id){
              applyToTool(selectedTool.id,activeToolKey,cfgWithoutTf)
              if(tfs&&Array.isArray(tfs)){
                const json=pluginRef.current?.getLineToolByID(selectedTool.id)
                const arr=json?JSON.parse(json):null
                const origCfg=arr?.[0]?.options||cfgWithoutTf
                setDrawingTfMap(prev=>({...prev,[selectedTool.id]:{tfs,cfg:origCfg,toolKey:activeToolKey}}))
                const tf=pairTf[activePair]||'H1'
                setToolVisible(selectedTool.id,tfs.includes(tf))
              }
            }
          }catch{}
        }}
      />
      </>)}
      {longShortModal&&(
        <LongShortModal
          tool={longShortModal.tool}
          toolId={longShortModal.toolId}
          activePair={activePair}
          balance={balance}
          initialBalance={initialCapital}
          isChallenge={!!session?.challenge_type}
          onClose={()=>setLongShortModal(null)}
          onStyleUpdate={(styleOpts)=>{
            const tk='LongShortPosition'
            const cfg={...toolConfigs[tk]}
            if(styleOpts.profitColor) cfg.profitColor=styleOpts.profitColor
            if(styleOpts.stopColor)   cfg.stopColor=styleOpts.stopColor
            if(styleOpts.textColor)   cfg.textColor=styleOpts.textColor
            if(styleOpts.borderWidth) cfg.borderWidth=styleOpts.borderWidth
            updateToolConfig(tk,cfg)
            if(longShortModal.toolId) applyToTool(longShortModal.toolId,tk,cfg)
          }}
          onConfirm={(posData)=>{
            setLongShortModal(null)
            // Challenge lockout: no permitir crear orden desde dibujo si terminó
            if(challengeLocked) return
            setOrderModal({side:posData.side,entry:posData.entry,pair:activePair,isLimit:true,...posData})
          }}
        />
      )}
      <DrawingContextMenu
        x={drawingCtxMenu?.x}
        y={drawingCtxMenu?.y}
        onOpenConfig={()=>{
          if(activeToolKeyRef.current==='LongShortPosition'&&selectedToolRef.current?.id){
            try{const json=pluginRef.current?.getLineToolByID(selectedToolRef.current.id);const arr=JSON.parse(json);setLongShortModal({toolId:selectedToolRef.current.id,tool:arr?.[0]});}catch{}
          }
        }}
        onDelete={()=>{removeSelected();setSelectedTool(null);setTimeout(()=>{ if(saveDrawingsRef.current) saveDrawingsRef.current() },100)}}
        onClose={()=>setDrawingCtxMenu(null)}
      />

      {/* TOP BAR — FX Replay style: session name left, pair tabs center, stats right */}
      <div style={s.topBar}>
        {/* Left: back + session name */}
        <div style={s.topLeft}>
          <button style={s.iconBtn} onClick={()=>router.push('/dashboard')}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15,18 9,12 15,6"/></svg>
          </button>
          <div style={s.vDiv}/>
          <span style={s.sessName}>{session?.name||'Sesión'}</span>
        </div>

        {/* Center: pair tabs + add */}
        <div style={s.tabRow}>
          {activePairs.map(pair=>(
            <div key={pair} style={{...s.tab,...(pair===activePair?s.tabActive:{})}}>
              <span style={s.tabLabel} onClick={()=>setActivePair(pair)}>
                {pair}
                {(pairState.current[pair]?.positions?.length>0)&&<span style={s.tabDot}/>}
              </span>
              {activePairs.length>1&&<button style={s.tabClose} onClick={()=>removePair(pair)}>✕</button>}
            </div>
          ))}
          <div style={{position:'relative',flexShrink:0}}>
            <button style={s.addBtn} onClick={()=>setAddingPair(v=>!v)}>＋</button>
            {addingPair&&(
              <div style={s.dropdown}>
                {ALL_PAIRS.filter(p=>!activePairs.includes(p)).map(p=>(
                  <button key={p} style={s.ddItem} onClick={()=>addPair(p)}>{p}</button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: fullscreen */}
        <div style={{display:'flex',alignItems:'center',gap:6,flexShrink:0}}>
          <button style={s.fullBtn} onClick={()=>{if(!document.fullscreenElement)document.documentElement.requestFullscreen();else document.exitFullscreen()}} title="Pantalla completa">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15,3 21,3 21,9"/><polyline points="9,21 3,21 3,15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
          </button>
        </div>
      </div>

      {/* TF BAR */}
      <div style={s.tfBar}>
        {TF_LIST.map(tf=>(
          <button key={tf} style={{...s.tfBtn,...(activeTf===tf?s.tfActive:{})}}
            onClick={()=>{const n={...pairTfRef.current,[activePair]:tf};pairTfRef.current=n;setPairTf(n)}}
          >{tf}</button>
        ))}
        <div style={{flex:1}}/>
        {/* OHLCV hover display */}
        {hoverCandle&&dataReady&&(()=>{
          const isUp=hoverCandle.c>=hoverCandle.o
          const col=isUp?'#2962FF':'#ffffff'
          const fmt=p=>fmtPx(p,activePair)
          return(
            <div style={{display:'flex',gap:10,alignItems:'center',fontSize:10,fontWeight:600,fontFamily:"'Montserrat',sans-serif",marginRight:8}}>
              <span style={{color:'rgba(255,255,255,0.35)'}}>O</span><span style={{color:col}}>{fmt(hoverCandle.o)}</span>
              <span style={{color:'rgba(255,255,255,0.35)'}}>H</span><span style={{color:col}}>{fmt(hoverCandle.h)}</span>
              <span style={{color:'rgba(255,255,255,0.35)'}}>L</span><span style={{color:col}}>{fmt(hoverCandle.l)}</span>
              <span style={{color:'rgba(255,255,255,0.35)'}}>C</span><span style={{color:col}}>{fmt(hoverCandle.c)}</span>
            </div>
          )
        })()}
        {currentTime&&<span style={s.tsBadge}>{fmtTs(currentTime)}</span>}
        {currentPrice&&<span style={s.pxBadge}>{fmtPx(currentPrice,activePair)}</span>}
      </div>

      {/* REPLAY PILL — draggable, liquid glass */}
      <div
        style={{...s.replayPill,
          ...(pillPos.x!=null?{left:pillPos.x,top:pillPos.y,transform:'none'}:{})
        }}
        onMouseDown={e=>{
          if(e.target.tagName==='BUTTON'||e.target.closest('button')) return
          const rect=e.currentTarget.getBoundingClientRect()
          pillDragRef.current={offX:e.clientX-rect.left,offY:e.clientY-rect.top}
          const onMove=ev=>{
            setPillPos({x:ev.clientX-pillDragRef.current.offX,y:ev.clientY-pillDragRef.current.offY})
          }
          const onUp=()=>{
            pillDragRef.current=null
            window.removeEventListener('mousemove',onMove)
            window.removeEventListener('mouseup',onUp)
          }
          window.addEventListener('mousemove',onMove)
          window.addEventListener('mouseup',onUp)
          e.preventDefault()
        }}
      >
        <button
          style={{
            ...s.pillPlay,
            ...(isPlaying?s.pillPause:{}),
            ...(challengeLocked ? {opacity:0.35, cursor:'not-allowed'} : {}),
          }}
          title={challengeLocked ? 'Sesión terminada — replay congelado' : undefined}
          onClick={handlePlayPause}
          disabled={!dataReady||challengeLocked}>
          {isPlaying
            ?<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="4" width="4" height="16"/><rect x="15" y="4" width="4" height="16"/></svg>
            :<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><polygon points="6,3 20,12 6,21"/></svg>
          }
        </button>
        <button
          style={{
            ...s.pillBtn,
            ...(challengeLocked ? {opacity:0.35, cursor:'not-allowed'} : {}),
          }}
          onClick={handleStep}
          disabled={!dataReady||challengeLocked}
          title={challengeLocked ? 'Sesión terminada — replay congelado' : 'Avanzar vela'}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,4 15,12 5,20"/><rect x="17" y="4" width="3" height="16"/></svg>
        </button>
        <div style={s.pillDivider}/>
        <div
          style={{
            ...s.pillProgress,
            ...(challengeLocked ? {opacity:0.4, cursor:'not-allowed', pointerEvents:'none'} : {}),
          }}
          title={challengeLocked ? 'Sesión terminada' : `${progress}% — clic para saltar`}
          onClick={challengeLocked ? undefined : e=>{
            const rect=e.currentTarget.getBoundingClientRect()
            const fraction=(e.clientX-rect.left)/rect.width
            const e2=eng();if(!e2)return
            e2.seekToProgress(Math.max(0,Math.min(1,fraction)))
            // Reset check indices so we don't re-fire SL/TP on already-passed candles
            const ps=pairState.current[activePair]
            if(ps){ ps.lastSLTPIdx=e2.currentIndex; ps.lastLimitIdx=e2.currentIndex }
            setCurrentTime(e2.currentTime);setProgress(Math.round(e2.progress*100))
            const cr=chartMap.current[activePair];if(cr)cr.prevCount=0
            updateChart(activePair,e2,true)
          }}>
          <div style={{...s.pillProgressFill,width:`${progress}%`}}/>
        </div>
        <div style={s.pillDivider}/>
        <div style={{...s.speedRow, ...(challengeLocked ? {opacity:0.35, pointerEvents:'none'} : {})}}>
          {SPEED_OPTS.map(o=>(
            <button key={o.v} style={{...s.speedBtn,...(speed===o.v?s.speedActive:{})}} onClick={()=>handleSpeed(o.v)}>{o.l}</button>
          ))}
        </div>
      </div>

      {/* BOTTOM BAR — BUY/SELL + balance */}
      <div style={s.btmBar}>
        {/* BUY / SELL */}
        <div style={s.tradeActions}>
          <button
            style={{
              ...s.buyBtn,
              ...(lastTrade==='BUY'?s.flash:{}),
              ...(challengeLocked ? {opacity:0.35, cursor:'not-allowed'} : {}),
            }}
            title={challengeLocked ? 'Challenge terminado — no se pueden abrir nuevas operaciones' : undefined}
            onClick={()=>setOrderModal({side:'BUY',entry:currentPrice,pair:activePair,isLimit:false})}
            disabled={!dataReady||!currentPrice||challengeLocked}>
            ▲ Buy
          </button>
          <button
            style={{
              ...s.sellBtn,
              ...(lastTrade==='SELL'?s.flash:{}),
              ...(challengeLocked ? {opacity:0.35, cursor:'not-allowed'} : {}),
            }}
            title={challengeLocked ? 'Challenge terminado — no se pueden abrir nuevas operaciones' : undefined}
            onClick={()=>setOrderModal({side:'SELL',entry:currentPrice,pair:activePair,isLimit:false})}
            disabled={!dataReady||!currentPrice||challengeLocked}>
            ▼ Sell
          </button>
        </div>

        <div style={{flex:1}}/>

        {/* Balance info — right side like FX Replay */}
        <div style={s.balanceRow}>
          <span style={s.balLbl}>Balance: <span style={s.balVal}>${balance.toFixed(2)}</span></span>
          <span style={s.balLbl}>PnL: <span style={{...s.balVal,color:pnlColor(realized)}}>{fmtPnl(realized)}</span></span>
          <span style={s.balLbl}>Float: <span style={{...s.balVal,color:pnlColor(unrealized)}}>{fmtPnl(unrealized)}</span></span>
          {allTrades.length>0&&(()=>{
            const wins=allTrades.filter(t=>t.result==='WIN').length
            const losses=allTrades.filter(t=>t.result==='LOSS').length
            const wr=allTrades.length>0?Math.round(wins/allTrades.length*100):0
            return(
              <>
                <div style={{width:1,height:16,background:'rgba(255,255,255,0.1)'}}/>
                <span style={s.balLbl}><span style={{color:wins>0?'#1E90FF':'rgba(255,255,255,0.4)',fontWeight:700}}>{wins}W</span> <span style={{color:'rgba(255,255,255,0.3)'}}>·</span> <span style={{color:losses>0?'#ef5350':'rgba(255,255,255,0.4)',fontWeight:700}}>{losses}L</span></span>
                <span style={{...s.balLbl,color:wr>=50?'#1E90FF':'#ef5350',fontWeight:700}}>{wr}%</span>
              </>
            )
          })()}
          <ChallengeHUD status={challengeStatus} />
        </div>

        <div style={s.pillDivider}/>

        {/* Panels toggle */}
        <div style={s.toggleRow}>
          {openPositions.length>0&&(
            <button style={{...s.togBtn,...(showPos?s.togOn:{})}} onClick={()=>{setShowPos(v=>!v);setShowTrades(false);setShowOrders(false)}}>
              {openPositions.length} POS
            </button>
          )}
          {pendingOrders.length>0&&(
            <button style={{...s.togBtn,...(showOrders?s.togOn:{})}} onClick={()=>{setShowOrders(v=>!v);setShowPos(false);setShowTrades(false)}}>
              {pendingOrders.length} LIMIT
            </button>
          )}
          {allTrades.length>0&&(
            <button style={{...s.togBtn,...(showTrades?s.togOn:{})}} onClick={()=>{setShowTrades(v=>!v);setShowPos(false);setShowOrders(false)}}>
              {allTrades.length} TRADES
            </button>
          )}
        </div>
      </div>

      {/* POSITIONS PANEL */}
      {showPos&&openPositions.length>0&&(
        <div style={s.panel}>
          <div style={s.panelHdr}>
            <span style={s.panelTitle}>POSICIONES ABIERTAS</span>
            <div style={{display:'flex',gap:8}}>
              <button style={s.dangerBtn} onClick={()=>{openPositions.forEach(p=>closePosition(p.id));setShowPos(false)}}>Cerrar todas</button>
              <button style={s.iconBtn} onClick={()=>setShowPos(false)}>✕</button>
            </div>
          </div>
          <div style={{overflowX:'auto'}}>
            <table style={s.tbl}>
              <thead><tr>{['PAR','DIR','ENTRADA','ACTUAL','SL','TP','LOTS','P&L',''].map(h=><th key={h} style={s.th}>{h}</th>)}</tr></thead>
              <tbody>
                {openPositions.map(pos=>{
                  const pnl=calcPnl(pos.side,pos.entry,currentPrice??pos.entry,pos.lots,activePair)
                  return(
                    <tr key={pos.id} style={s.tblRow}>
                      <td style={s.td}>{pos.pair}</td>
                      <td style={{...s.td,color:pos.side==='BUY'?'#1E90FF':'#ef5350',fontWeight:800}}>{pos.side}</td>
                      <td style={s.td}>{fmtPx(pos.entry,pos.pair)}</td>
                      <td style={s.td}>{fmtPx(currentPrice,pos.pair)}</td>
                      <td style={{...s.td,color:'rgba(239,83,80,0.7)'}}>{fmtPx(pos.sl,pos.pair)}</td>
                      <td style={{...s.td,color:'rgba(30,144,255,0.7)'}}>{fmtPx(pos.tp,pos.pair)}</td>
                      <td style={s.td}>{pos.lots}</td>
                      <td style={{...s.td,color:pnlColor(pnl),fontWeight:700}}>{fmtPnl(pnl)}</td>
                      <td style={s.td}><button style={s.closeBtn} onClick={()=>setCloseModal({posId:pos.id,pair:activePair,pos})}>✕</button></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* PENDING ORDERS */}
      {showOrders&&pendingOrders.length>0&&(
        <div style={s.panel}>
          <div style={s.panelHdr}>
            <span style={s.panelTitle}>ÓRDENES LÍMITE</span>
            <button style={s.iconBtn} onClick={()=>setShowOrders(false)}>✕</button>
          </div>
          <div style={{overflowX:'auto'}}>
            <table style={s.tbl}>
              <thead><tr>{['PAR','TIPO','ENTRADA','SL','TP','LOTS',''].map(h=><th key={h} style={s.th}>{h}</th>)}</tr></thead>
              <tbody>
                {pendingOrders.map(o=>(
                  <tr key={o.id} style={s.tblRow}>
                    <td style={s.td}>{o.pair}</td>
                    <td style={{...s.td,color:o.side==='BUY_LIMIT'?'#1E90FF':'#ef5350',fontWeight:700}}>{o.side==='BUY_LIMIT'?'Buy Limit':'Sell Limit'}</td>
                    <td style={s.td}>{fmtPx(o.entry,o.pair)}</td>
                    <td style={{...s.td,color:'rgba(239,83,80,0.6)'}}>{fmtPx(o.sl,o.pair)}</td>
                    <td style={{...s.td,color:'rgba(30,144,255,0.6)'}}>{fmtPx(o.tp,o.pair)}</td>
                    <td style={s.td}>{o.lots}</td>
                    <td style={s.td}><button style={s.closeBtn} onClick={()=>cancelLimitOrder(o.id,o.pair)}>✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TRADES JOURNAL */}
      {showTrades&&allTrades.length>0&&(
        <div style={s.panel}>
          <div style={s.panelHdr}>
            <span style={s.panelTitle}>JOURNAL</span>
            <button style={s.iconBtn} onClick={()=>setShowTrades(false)}>✕</button>
          </div>
          <div style={{overflowX:'auto'}}>
            <table style={s.tbl}>
              <thead><tr>{['PAR','DIR','ENTRY','EXIT','LOTS','R:R','P&L','RESULT','ABIERTO','CERRADO','NOTA'].map(h=><th key={h} style={s.th}>{h}</th>)}</tr></thead>
              <tbody>
                {allTrades.map((t,i)=>(
                  <tr key={i} style={s.tblRow}>
                    <td style={s.td}>{t.pair}</td>
                    <td style={{...s.td,color:t.side==='BUY'?'#1E90FF':'#ef5350',fontWeight:800}}>{t.side}</td>
                    <td style={s.td}>{fmtPx(t.entry,t.pair)}</td>
                    <td style={s.td}>{fmtPx(t.exit,t.pair)}</td>
                    <td style={s.td}>{t.lots}</td>
                    <td style={s.td}>{t.rrReal}R</td>
                    <td style={{...s.td,color:pnlColor(t.pnl),fontWeight:700}}>{fmtPnl(t.pnl)}</td>
                    <td style={{...s.td,color:t.result==='WIN'?'#1E90FF':t.result==='LOSS'?'#ef5350':'#a0b8d0',fontWeight:700}}>{t.result}</td>
                    <td style={{...s.td,color:'rgba(255,255,255,0.5)',fontSize:9}}>{fmtTs(t.openTime)}</td>
                    <td style={{...s.td,color:'rgba(255,255,255,0.5)',fontSize:9}}>{fmtTs(t.closeTime)}</td>
                    <td style={{...s.td,color:'rgba(255,255,255,0.6)',fontSize:9,maxWidth:120,overflow:'hidden',textOverflow:'ellipsis'}}>{t.note||'—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* CONTEXT MENU */}
      {ctxMenu&&(
        <>
          <div style={{position:'fixed',inset:0,zIndex:998}} onClick={()=>setCtxMenu(null)}/>
          <div style={{position:'fixed',left:ctxMenu.x,top:ctxMenu.y,background:'rgba(4,10,24,0.92)',border:'1px solid rgba(30,144,255,0.35)',borderRadius:12,zIndex:999,minWidth:160,overflow:'hidden',boxShadow:'0 8px 40px rgba(0,0,0,0.6)',backdropFilter:'blur(40px)',WebkitBackdropFilter:'blur(40px)',fontFamily:"'Montserrat',sans-serif"}}>
            <div style={{padding:'8px 14px 6px',fontSize:10,fontWeight:700,color:'rgba(255,255,255,0.92)',borderBottom:'1px solid rgba(255,255,255,0.06)'}}>{ctxMenu.price.toFixed(5)}</div>
            {ctxMenu.price<(currentPrice||0)&&!challengeLocked&&(
              <button style={s.ctxItem} onClick={()=>{setCtxMenu(null);setOrderModal({side:'BUY',entry:ctxMenu.price,pair:ctxMenu.pair,isLimit:true})}}>
                <span style={{color:'#4da6ff'}}>▲ Buy Limit</span>
                <span style={{color:'#ffffff',fontSize:9}}>{ctxMenu.price.toFixed(5)}</span>
              </button>
            )}
            {ctxMenu.price>(currentPrice||0)&&!challengeLocked&&(
              <button style={s.ctxItem} onClick={()=>{setCtxMenu(null);setOrderModal({side:'SELL',entry:ctxMenu.price,pair:ctxMenu.pair,isLimit:true})}}>
                <span style={{color:'#ff6b6b'}}>▼ Sell Limit</span>
                <span style={{color:'#ffffff',fontSize:9}}>{ctxMenu.price.toFixed(5)}</span>
              </button>
            )}
            <button style={{...s.ctxItem,borderTop:'1px solid rgba(255,255,255,0.06)'}} onClick={()=>{setCtxMenu(null);setChartConfigOpen(true)}}>
              <span style={{color:'rgba(255,255,255,0.7)'}}>⚙ Configuración</span>
            </button>
            <button style={{...s.ctxItem,borderTop:'1px solid rgba(255,255,255,0.06)'}} onClick={()=>setCtxMenu(null)}>
              <span style={{color:'#ffffff'}}>Cerrar</span>
            </button>
          </div>
        </>
      )}

      {selectedDrawing&&(()=>{
        const d = drawings.find(x=>x.id===selectedDrawing.id)
        if(!d) return null
        const SPILL={display:'flex',alignItems:'center',gap:4,background:'rgba(255,255,255,0.10)',border:'1px solid rgba(255,255,255,0.22)',borderRadius:12,padding:'6px 10px',backdropFilter:'blur(40px) saturate(220%) brightness(1.1)',WebkitBackdropFilter:'blur(40px) saturate(220%) brightness(1.1)',boxShadow:'0 8px 32px rgba(0,0,0,0.4),inset 0 1px 0 rgba(255,255,255,0.3)',userSelect:'none',fontFamily:"'Montserrat',sans-serif"}
        const SDIV={width:1,height:16,background:'rgba(255,255,255,0.12)',margin:'0 4px',flexShrink:0}
        const sbtn=(active,danger)=>({background:danger?'rgba(239,83,80,0.10)':active?'rgba(41,98,255,0.45)':'rgba(255,255,255,0.06)',border:danger?'1px solid rgba(239,83,80,0.35)':active?'1px solid rgba(41,98,255,0.7)':'1px solid rgba(255,255,255,0.1)',borderRadius:7,color:danger?'#ef5350':'#fff',width:28,height:28,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',padding:0,flexShrink:0,fontFamily:"'Montserrat',sans-serif"})
        const FONT_SIZES=[9,10,11,12,14,16,18,20,24]
        return <>
          <div style={{position:'fixed',inset:0,zIndex:1998}} onClick={()=>setSelectedDrawing(null)}/>
          <div style={{...SPILL,position:'fixed',left:pillPos.x??selectedDrawing.x,top:pillPos.y??selectedDrawing.y,zIndex:1999,cursor:'grab'}} onMouseDown={onTextPillMouseDown}>
            {/* Color */}
            <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:2}}>
              <span style={{fontSize:7,color:'rgba(255,255,255,0.45)',letterSpacing:0.5}}>COLOR</span>
              <label style={{width:22,height:22,borderRadius:4,cursor:'pointer',border:'1px solid rgba(255,255,255,0.2)',display:'block',background:d.metadata?.color||'#ffffff',overflow:'hidden'}}>
                <input type="color" value={d.metadata?.color||'#ffffff'} onChange={e=>{updateDrawing(d.id,{metadata:{...d.metadata,color:e.target.value}});setTimeout(()=>{ if(saveDrawingsRef.current) saveDrawingsRef.current() },200)}} style={{opacity:0,width:'100%',height:'100%',cursor:'pointer'}}/>
              </label>
            </div>
            <div style={SDIV}/>
            {/* Tamaño */}
            <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:2}}>
              <span style={{fontSize:7,color:'rgba(255,255,255,0.45)',letterSpacing:0.5}}>TAMAÑO</span>
              <div style={{display:'flex',gap:2}}>
                {FONT_SIZES.map(s=><button key={s} onClick={()=>{updateDrawing(d.id,{metadata:{...d.metadata,fontSize:s}});setTimeout(()=>{ if(saveDrawingsRef.current) saveDrawingsRef.current() },100)}} style={{...sbtn(d.metadata?.fontSize===s),width:'auto',minWidth:20,height:20,fontSize:9,padding:'0 3px'}}>{s}</button>)}
              </div>
            </div>
            <div style={SDIV}/>
            {/* Borrar */}
            <button title="Borrar" style={sbtn(false,true)} onClick={()=>{removeDrawing(d.id);setSelectedDrawing(null)}}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
            </button>
            {/* Cerrar */}
            <button title="Cerrar" style={sbtn(false)} onClick={()=>setSelectedDrawing(null)}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </>
      })()}

      {textInput&&(
        <>
          <div style={{position:'fixed',inset:0,zIndex:2000}} onClick={()=>setTextInput(null)}/>
          <div style={{position:'fixed',left:textInput.x,top:textInput.y,zIndex:2001,background:'rgba(4,10,24,0.95)',border:'1px solid rgba(30,144,255,0.4)',borderRadius:12,padding:'12px 14px',boxShadow:'0 8px 40px rgba(0,0,0,0.7)',backdropFilter:'blur(40px)',WebkitBackdropFilter:'blur(40px)',fontFamily:"'Montserrat',sans-serif"}}>
            <div style={{fontSize:10,color:'rgba(255,255,255,0.5)',marginBottom:8,fontWeight:600}}>TEXTO</div>
            <input
              autoFocus
              style={{background:'rgba(255,255,255,0.07)',border:'1px solid rgba(30,144,255,0.3)',borderRadius:7,color:'#fff',fontSize:12,padding:'6px 10px',outline:'none',fontFamily:"'Montserrat',sans-serif",width:200}}
              placeholder="Escribe aquí..."
              onKeyDown={e=>{
                if(e.key==='Enter'){textInput.onConfirm(e.target.value);setTextInput(null)}
                if(e.key==='Escape') setTextInput(null)
              }}
            />
            <div style={{fontSize:9,color:'rgba(255,255,255,0.3)',marginTop:6}}>Enter para confirmar · Esc para cancelar</div>
          </div>
        </>
      )}
      <ChartConfigPanel
        open={chartConfigOpen}
        onClose={()=>setChartConfigOpen(false)}
        config={chartConfig}
        onSave={(newConfig)=>{
          saveChartConfig(newConfig)
          applyChartConfig(chartMap, activePair, newConfig)
        }}
      />

      {/* ORDER MODAL */}
      {orderModal&&(
        <OrderModal modal={orderModal} balance={balance}
          initialBalance={initialCapital}
          isChallenge={!!session?.challenge_type}
          currentPrice={currentPrice}
          onClose={()=>setOrderModal(null)}
          onConfirm={(posData)=>{
            if(orderModal.isLimit){
              const ps=pairState.current[orderModal.pair]||{engine:null,ready:false,positions:[],trades:[],orders:[]}
              pairState.current[orderModal.pair]=ps
              if(!ps.orders) ps.orders=[]
              const order={...posData,id:`L${Date.now()}`,pair:orderModal.pair,side:orderModal.side==='BUY'?'BUY_LIMIT':'SELL_LIMIT',entry:orderModal.entry,createdTime:currentTime}
              ps.orders=[...ps.orders,order]
            } else {
              const ps=pairState.current[orderModal.pair]; if(!ps) return
              const posId=`${Date.now()}`
              const newPos={id:posId,pair:orderModal.pair,side:orderModal.side,entry:orderModal.entry,...posData,openTime:currentTime,initialSlPips:posData.slPips}
              ps.positions=[...ps.positions,newPos]
              createPositionLines(posId,orderModal.pair,newPos)
              setLastTrade(orderModal.side);setTimeout(()=>setLastTrade(null),700)
            }
            setOrderModal(null);setTick(t=>t+1)
          }}
        />
      )}

      {/* CLOSE MODAL */}
      {closeModal&&(
        <CloseModal modal={closeModal} currentPrice={currentPrice}
          onClose={()=>setCloseModal(null)}
          onConfirm={(lotsToClose,note)=>{
            const ps=pairState.current[closeModal.pair]
            const pos=ps?.positions?.find(p=>p.id===closeModal.posId)
            if(!pos||!currentPrice) return
            const pnl=calcPnl(pos.side,pos.entry,currentPrice,lotsToClose,closeModal.pair)
            const result=pnl>0?'WIN':pnl<0?'LOSS':'BREAKEVEN'
            // FIX BUG C: RR real contra SL inicial, no actual
            const slPipsForRr = pos.initialSlPips ?? pos.slPips
            const rrReal=slPipsForRr>0?pnl/(slPipsForRr*lotsToClose*10):0
            // Convert ordinal→real for DB timestamps
            // toReal2 removed — using real timestamps directly
            if(lotsToClose>=pos.lots){
              closePosition(pos.id,'MANUAL',closeModal.pair,currentPrice,note)
            } else {
              const remaining=parseFloat((pos.lots-lotsToClose).toFixed(2))
              ps.trades=[...ps.trades,{...pos,lots:lotsToClose,exit:currentPrice,closeTime:currentTime,pnl,result,rrReal:parseFloat(rrReal.toFixed(2)),reason:'PARTIAL',note}]
              pos.lots=remaining
              ps.positions=[...ps.positions]
              const newBal=parseFloat((balanceRef.current+pnl).toFixed(2))
              setBalance(newBal);setTick(t=>t+1)
              if(userIdRef.current){
                const realOpen=pos.openTime??null
                const realClose=currentTime>1000000000?currentTime:null
                supabase.from('sim_sessions').update({balance:newBal}).eq('id',id).then(()=>{}).catch(()=>{})
                supabase.from('sim_trades').insert({
                  user_id:userIdRef.current, session_id:id,
                  pair:pos.pair, side:pos.side,
                  lots:parseFloat(lotsToClose)||0.01,
                  entry_price:parseFloat(pos.entry)||0,
                  exit_price:parseFloat(currentPrice)||0,
                  sl_price:parseFloat(pos.sl)||0,
                  tp_price:parseFloat(pos.tp)||0,
                  rr:parseFloat(rrReal.toFixed(2)),
                  pnl:parseFloat(pnl.toFixed(2)),
                  result,
                  notes: note||null,
                  opened_at:realOpen?new Date(realOpen*1000).toISOString():new Date().toISOString(),
                  closed_at:realClose?new Date(realClose*1000).toISOString():new Date().toISOString(),
                }).then(()=>{}).catch(()=>{})
              }
            }
            // Si es un challenge, refrescar HUD tras cerrar (parcial o total)
            if(sessionRef.current?.challenge_type) refreshChallengeStatus()
            setCloseModal(null)
          }}
        />
      )}

      {tfInput&&<TfInputModal tfInput={tfInput} activeTf={pairTf[activePair]||'H1'}/>}

      {/* CHALLENGE MODALS — pass / fail / passed-all */}
      {challengeModal === 'passed_phase' && challengeStatus && (
        <ChallengePassedPhaseModal
          status={challengeStatus}
          advancing={challengeAdvancing}
          onAdvance={async () => { await handleChallengePass() }}
          onClose={() => { setChallengeModal(null); handleGoToDashboard() }}
          onReview={() => { setChallengeModal(null) }}
        />
      )}
      {challengeModal === 'passed_all' && challengeStatus && (
        <ChallengePassedAllModal
          status={challengeStatus}
          advancing={challengeAdvancing}
          onAdvance={async () => { await handleChallengePass() }}
          onCtaReal={handleCtaRealChallenge}
          onClose={() => { setChallengeModal(null); handleGoToDashboard() }}
          onReview={() => { setChallengeModal(null) }}
        />
      )}
      {challengeModal === 'failed' && challengeStatus && (
        <ChallengeFailedModal
          status={challengeStatus}
          advancing={challengeAdvancing}
          onAdvance={async () => { await handleChallengeFail() }}
          onNewChallenge={handleGoToNewChallenge}
          onClose={() => { setChallengeModal(null) }}
        />
      )}

      <style>{css}</style>
    </div>
  )
}

const glass='rgba(2,8,16,0.75)'
const glassBorder='1px solid rgba(255,255,255,0.1)'

const s={
  root:{display:'block',height:'100vh',background:'#000',fontFamily:"'Montserrat',sans-serif",overflow:'hidden',color:'#fff',position:'relative'},
  bgCanvas:{position:'fixed',inset:0,width:'100%',height:'100%',pointerEvents:'none',zIndex:0},

  // Chart fills everything
  chartWrap:{position:'absolute',top:68,bottom:44,left:0,right:0,overflow:'hidden',zIndex:0},
  chart:{position:'absolute',inset:0,width:'100%',height:'100%'},
  overlay:{position:'absolute',inset:0,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:12,background:'rgba(0,0,0,0.7)',zIndex:10},
  overlayTxt:{fontSize:11,color:'#ffffff',fontWeight:700},

  // Top bar — floating
  topBar:{position:'absolute',top:0,left:0,right:0,zIndex:20,height:40,background:'rgba(10,10,12,0.85)',borderBottom:'1px solid rgba(255,255,255,0.07)',backdropFilter:'blur(20px)',WebkitBackdropFilter:'blur(20px)',display:'flex',alignItems:'center',padding:'0 12px',gap:8},
  topLeft:{display:'flex',alignItems:'center',gap:8,flexShrink:0},
  vDiv:{width:1,height:16,background:'rgba(255,255,255,0.1)'},
  sessName:{fontSize:11,fontWeight:700,color:'#ffffff',letterSpacing:0.3},
  tabRow:{display:'flex',alignItems:'center',gap:2,flex:1,overflow:'visible',minWidth:0},
  tab:{display:'flex',alignItems:'center',gap:4,padding:'3px 10px',borderRadius:6,background:'transparent',flexShrink:0,cursor:'pointer',border:'1px solid transparent'},
  tabActive:{background:'rgba(255,255,255,0.08)',border:'1px solid rgba(255,255,255,0.12)'},
  tabLabel:{fontSize:11,fontWeight:600,color:'#ffffff',letterSpacing:0.2,display:'flex',alignItems:'center',gap:4},
  tabDot:{width:4,height:4,borderRadius:'50%',background:'#1E90FF',display:'inline-block'},
  tabClose:{background:'none',border:'none',color:'#ffffff',cursor:'pointer',fontSize:9,padding:'0 2px',fontFamily:"'Montserrat',sans-serif"},
  addBtn:{background:'transparent',border:'1px solid rgba(255,255,255,0.12)',color:'#ffffff',width:22,height:22,borderRadius:4,cursor:'pointer',fontSize:14,display:'flex',alignItems:'center',justifyContent:'center',fontFamily:"'Montserrat',sans-serif",flexShrink:0},
  dropdown:{position:'fixed',top:40,background:'rgba(4,10,24,0.97)',border:'1px solid rgba(30,144,255,0.3)',borderRadius:10,zIndex:9999,minWidth:130,padding:'4px 0',boxShadow:'0 8px 32px rgba(0,0,0,0.8)',backdropFilter:'blur(20px)',WebkitBackdropFilter:'blur(20px)'},
  ddItem:{display:'block',width:'100%',background:'none',border:'none',color:'#ffffff',fontSize:11,fontWeight:600,padding:'8px 14px',cursor:'pointer',textAlign:'left',fontFamily:"'Montserrat',sans-serif"},
  statsRow:{display:'flex',alignItems:'center',gap:4,flexShrink:0},
  fullBtn:{background:'transparent',border:'1px solid rgba(255,255,255,0.1)',borderRadius:5,color:'#ffffff',cursor:'pointer',width:26,height:26,display:'flex',alignItems:'center',justifyContent:'center',marginLeft:4},

  // TF bar
  tfBar:{position:'absolute',top:40,left:0,right:0,zIndex:20,height:28,background:'rgba(10,10,12,0.75)',borderBottom:'1px solid rgba(255,255,255,0.05)',backdropFilter:'blur(16px)',WebkitBackdropFilter:'blur(16px)',display:'flex',alignItems:'center',padding:'0 12px',gap:2},
  tfBtn:{background:'none',border:'none',color:'rgba(255,255,255,0.9)',fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:4,cursor:'pointer',fontFamily:"'Montserrat',sans-serif"},
  tfActive:{background:'rgba(255,255,255,0.1)',color:'#ffffff'},
  tsBadge:{fontSize:9,color:'#ffffff',fontWeight:600,padding:'2px 8px',background:'rgba(255,255,255,0.04)',borderRadius:4},
  pxBadge:{fontSize:12,color:'#ffffff',fontWeight:800,padding:'2px 10px',background:'rgba(255,255,255,0.08)',borderRadius:4,marginLeft:6},

  // Bottom bar
  btmBar:{position:'absolute',bottom:0,left:0,right:0,zIndex:20,height:50,background:'rgba(10,10,12,0.85)',borderTop:'1px solid rgba(255,255,255,0.07)',backdropFilter:'blur(20px)',WebkitBackdropFilter:'blur(20px)',display:'flex',alignItems:'center',padding:'0 14px',gap:12},
  replayRow:{display:'flex',alignItems:'center',gap:4,flexShrink:0},
  ctrlBtn:{background:'rgba(255,255,255,0.06)',border:'1px solid rgba(255,255,255,0.1)',color:'#ffffff',width:26,height:26,borderRadius:6,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'},
  playBtn:{background:'#fff',border:'none',color:'#000',width:30,height:30,borderRadius:'50%',boxShadow:'none'},
  pauseBtn:{background:'rgba(255,255,255,0.6)'},
  speedRow:{display:'flex',gap:0,marginLeft:4},
  speedBtn:{background:'none',border:'none',color:'#ffffff',fontSize:9,fontWeight:700,padding:'3px 5px',cursor:'pointer',borderRadius:3,fontFamily:"'Montserrat',sans-serif"},
  speedActive:{color:'#ffffff',background:'rgba(255,255,255,0.08)'},
  progWrap:{flex:1,display:'flex',alignItems:'center',gap:8,minWidth:60},
  progTrack:{flex:1,height:2,background:'rgba(255,255,255,0.1)',borderRadius:2,overflow:'hidden'},
  progFill:{height:'100%',background:'rgba(255,255,255,0.6)',borderRadius:2,transition:'width .3s linear'},
  progLabel:{fontSize:8,color:'#ffffff',fontWeight:700,width:28,textAlign:'right',flexShrink:0},
  tradeActions:{display:'flex',gap:6,flexShrink:0},
  buyBtn:{background:'#2962FF',border:'none',color:'#fff',borderRadius:6,padding:'6px 18px',fontSize:11,fontWeight:800,cursor:'pointer',fontFamily:"'Montserrat',sans-serif",letterSpacing:0.5},
  sellBtn:{background:'#ef5350',border:'none',color:'#fff',borderRadius:6,padding:'6px 18px',fontSize:11,fontWeight:800,cursor:'pointer',fontFamily:"'Montserrat',sans-serif",letterSpacing:0.5},
  flash:{transform:'scale(0.94)',opacity:0.8},
  toggleRow:{display:'flex',gap:4},
  togBtn:{background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.1)',color:'#ffffff',borderRadius:5,padding:'4px 10px',fontSize:9,fontWeight:700,cursor:'pointer',fontFamily:"'Montserrat',sans-serif",whiteSpace:'nowrap'},
  togOn:{background:'rgba(255,255,255,0.1)',borderColor:'rgba(255,255,255,0.25)',color:'#fff'},
  // Replay pill
  replayPill:{position:'absolute',top:76,left:'50%',transform:'translateX(-50%)',zIndex:25,display:'flex',alignItems:'center',gap:6,background:'rgba(255,255,255,0.1)',border:'1px solid rgba(255,255,255,0.22)',borderRadius:12,padding:'6px 14px',cursor:'grab',userSelect:'none',backdropFilter:'blur(40px) saturate(220%) brightness(1.1)',WebkitBackdropFilter:'blur(40px) saturate(220%) brightness(1.1)',boxShadow:'0 8px 32px rgba(0,0,0,0.4),inset 0 1px 0 rgba(255,255,255,0.3),inset 0 -1px 0 rgba(0,0,0,0.1),0 0 0 0.5px rgba(255,255,255,0.1)'},
  pillBtn:{background:'rgba(255,255,255,0.06)',border:'none',color:'#ffffff',cursor:'pointer',width:28,height:28,display:'flex',alignItems:'center',justifyContent:'center',borderRadius:7,padding:0},
  pillPlay:{background:'rgba(255,255,255,0.15)',border:'1px solid rgba(255,255,255,0.25)',color:'#fff',width:32,height:28,borderRadius:8,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',padding:0},
  pillPause:{background:'rgba(255,255,255,0.1)',borderColor:'rgba(255,255,255,0.2)'},
  pillDivider:{width:1,height:16,background:'rgba(255,255,255,0.1)',margin:'0 4px'},
  pillProgress:{width:100,height:3,background:'rgba(255,255,255,0.1)',borderRadius:2,overflow:'hidden',cursor:'pointer'},
  pillProgressFill:{height:'100%',background:'#2962FF',borderRadius:2,transition:'width .3s linear'},
  // Balance row
  balanceRow:{display:'flex',alignItems:'center',gap:16,flexShrink:0},
  balLbl:{fontSize:10,color:'#ffffff',fontWeight:500},
  balVal:{color:'#ffffff',fontWeight:700,fontWeight:600},

  // Panels
  panel:{position:'absolute',bottom:50,left:0,right:0,background:'rgba(4,10,24,0.97)',borderTop:'1px solid rgba(30,144,255,0.25)',zIndex:100,maxHeight:240,overflowY:'auto',backdropFilter:'blur(20px)',WebkitBackdropFilter:'blur(20px)'},
  panelHdr:{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'6px 14px',borderBottom:'1px solid rgba(30,144,255,0.15)',position:'sticky',top:0,background:'rgba(4,10,24,0.99)'},
  panelTitle:{fontSize:9,fontWeight:700,color:'#ffffff',letterSpacing:1.5},
  dangerBtn:{background:'rgba(239,83,80,0.08)',border:'1px solid rgba(239,83,80,0.2)',color:'#ef5350',borderRadius:4,padding:'3px 10px',fontSize:9,fontWeight:700,cursor:'pointer',fontFamily:"'Montserrat',sans-serif"},
  tbl:{width:'100%',borderCollapse:'collapse',fontSize:10},
  tblRow:{borderBottom:'1px solid rgba(255,255,255,0.04)'},
  th:{padding:'4px 12px',textAlign:'left',color:'#ffffff',fontWeight:600,fontSize:8,letterSpacing:1,whiteSpace:'nowrap'},
  td:{padding:'6px 12px',color:'rgba(255,255,255,0.92)',whiteSpace:'nowrap'},
  closeBtn:{background:'none',border:'none',color:'rgba(255,255,255,0.25)',cursor:'pointer',fontSize:11,padding:'0 2px',fontFamily:"'Montserrat',sans-serif"},
  ctxItem:{display:'flex',justifyContent:'space-between',alignItems:'center',width:'100%',background:'none',border:'none',color:'#ffffff',fontSize:11,fontWeight:600,padding:'9px 14px',cursor:'pointer',fontFamily:"'Montserrat',sans-serif",gap:16},
  iconBtn:{background:'rgba(255,255,255,0.06)',border:'1px solid rgba(255,255,255,0.1)',borderRadius:5,padding:'4px 7px',cursor:'pointer',color:'#ffffff',display:'flex',alignItems:'center',fontFamily:"'Montserrat',sans-serif"},
}

const css=`
  *{box-sizing:border-box;margin:0;padding:0}
  body{overflow:hidden;background:#000}
  input[type=number]::-webkit-inner-spin-button,input[type=number]::-webkit-outer-spin-button{opacity:0}
  button:not(:disabled):hover{filter:brightness(1.15)}
  button:disabled{opacity:0.3;cursor:not-allowed!important}
  .sp{width:24px;height:24px;border:2px solid rgba(255,255,255,0.1);border-top-color:rgba(255,255,255,0.6);border-radius:50%;animation:sp .6s linear infinite}
  @keyframes sp{to{transform:rotate(360deg)}}
  @keyframes blink{0%,100%{opacity:1}50%{opacity:0}}
`


function Spin(){ return <div className="sp"/> }

function StatBadge({label,val,color}){
  return(
    <div style={{display:'flex',flexDirection:'column',padding:'0 10px',borderLeft:'1px solid rgba(255,255,255,0.07)'}}>
      <span style={{fontSize:7,fontWeight:600,color:'#ffffff',letterSpacing:0.8}}>{label}</span>
      <span style={{fontSize:10,fontWeight:700,color:color||'#ffffff'}}>{val}</span>
    </div>
  )
}

// ─── Close / Partial Close Modal ─────────────────────────────────────────────
function CloseModal({modal,currentPrice,onClose,onConfirm}){
  const {pos,pair}=modal
  const isBuy=pos.side==='BUY'
  const isJpy=pair?.includes('JPY')
  const PRESETS=[10,25,50,75,90,100]
  const [pct,setPct]=useState(100)
  const [customPct,setCustomPct]=useState('')   // input libre 1-100
  const [note,setNote]=useState('')
  // pct efectivo: si el usuario escribió un custom válido, se usa; si no, el preset.
  const customNum = parseFloat(customPct)
  const usingCustom = customPct !== '' && !isNaN(customNum) && customNum>0 && customNum<=100
  const effectivePct = usingCustom ? customNum : pct
  const lotsToClose=parseFloat((pos.lots*effectivePct/100).toFixed(2))
  const estPnl=calcPnl(pos.side,pos.entry,currentPrice||pos.entry,lotsToClose,pair)
  const fmtP=p=>p?.toFixed(isJpy?3:5)??'—'
  const isProfit=estPnl>=0
  const pnlColor=isProfit?'rgba(30,144,255,0.95)':'rgba(239,83,80,0.95)'
  const accentColor=isBuy?'#1E90FF':'#ef5350'
  const accentRgb=isBuy?'30,144,255':'239,83,80'

  return(
    <div style={{position:'fixed',inset:0,background:'rgba(0,5,20,0.75)',zIndex:500,display:'flex',alignItems:'center',justifyContent:'center',backdropFilter:'blur(8px)',WebkitBackdropFilter:'blur(8px)',fontFamily:"'Montserrat',sans-serif"}} onClick={onClose}>
      <div style={{
        background:'rgba(255,255,255,0.07)',
        border:'1px solid rgba(255,255,255,0.18)',
        borderRadius:24,width:380,
        boxShadow:'0 32px 80px rgba(0,0,0,0.6),inset 0 1px 0 rgba(255,255,255,0.25)',
        backdropFilter:'blur(40px) saturate(220%) brightness(1.08)',
        WebkitBackdropFilter:'blur(40px) saturate(220%) brightness(1.08)',
        overflow:'hidden',
      }} onClick={e=>e.stopPropagation()}>

        {/* Header */}
        <div style={{padding:'18px 22px 14px',borderBottom:'1px solid rgba(255,255,255,0.08)',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            <div style={{width:8,height:8,borderRadius:'50%',background:accentColor,boxShadow:`0 0 10px ${accentColor}`}}/>
            <span style={{fontSize:14,fontWeight:900,color:'#fff'}}>{pos.side} — {pair}</span>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:6}}>
            <span style={{fontSize:9,color:'#ffffff',fontWeight:600}}>{pos.lots}L @ {fmtP(pos.entry)}</span>
            <button onClick={onClose} style={{background:'rgba(255,255,255,0.08)',border:'1px solid rgba(255,255,255,0.12)',borderRadius:8,color:'#ffffff',cursor:'pointer',width:28,height:28,display:'flex',alignItems:'center',justifyContent:'center',fontSize:13}}>✕</button>
          </div>
        </div>

        <div style={{padding:'16px 22px 20px'}}>

          {/* P&L big */}
          <div style={{
            background:isProfit?'rgba(30,144,255,0.08)':'rgba(239,83,80,0.08)',
            border:`1px solid ${isProfit?'rgba(30,144,255,0.2)':'rgba(239,83,80,0.2)'}`,
            borderRadius:16,padding:'16px',textAlign:'center',marginBottom:16,
          }}>
            <div style={{fontSize:8,fontWeight:700,color:'#ffffff',letterSpacing:1.5,marginBottom:6}}>P&L ESTIMADO</div>
            <div style={{fontSize:28,fontWeight:900,color:pnlColor,letterSpacing:-1}}>{estPnl>=0?'+':''}{estPnl.toFixed(2)}</div>
            <div style={{fontSize:8,color:'#ffffff',marginTop:4}}>precio actual: {fmtP(currentPrice)}</div>
          </div>

          {/* % presets */}
          <div style={{marginBottom:14}}>
            <div style={{fontSize:8,fontWeight:700,color:'#ffffff',letterSpacing:1.5,marginBottom:8}}>PORCENTAJE A CERRAR</div>
            <div style={{display:'flex',gap:6,marginBottom:10}}>
              <div style={{flex:1,display:'flex',gap:3,background:'rgba(255,255,255,0.04)',borderRadius:12,padding:4}}>
                {PRESETS.map(p=>(
                  <button key={p} onClick={()=>{setPct(p);setCustomPct('')}} style={{
                    flex:1,padding:'7px 0',borderRadius:9,border:'none',
                    background:(!usingCustom && pct===p)?accentColor:'transparent',
                    color:(!usingCustom && pct===p)?'#fff':'rgba(255,255,255,0.4)',
                    fontSize:11,fontWeight:800,cursor:'pointer',
                    fontFamily:"'Montserrat',sans-serif",
                    boxShadow:(!usingCustom && pct===p)?`0 2px 12px rgba(${accentRgb},0.4)`:'none',
                  }}>{p}%</button>
                ))}
              </div>
              {/* Input libre — se ilumina sólo cuando hay un valor válido escrito */}
              <div style={{
                display:'flex',alignItems:'center',gap:0,
                background:usingCustom?`rgba(${accentRgb},0.18)`:'rgba(255,255,255,0.04)',
                border:`1px solid ${usingCustom?accentColor:'rgba(255,255,255,0.08)'}`,
                borderRadius:12,padding:'0 8px',width:78,
                boxShadow:usingCustom?`0 2px 12px rgba(${accentRgb},0.25)`:'none',
                transition:'all 0.15s ease',
              }}>
                <input
                  type="number" min="1" max="100" step="1"
                  value={customPct}
                  onChange={e=>setCustomPct(e.target.value)}
                  placeholder="—"
                  style={{
                    width:'100%',background:'transparent',border:'none',outline:'none',
                    color:usingCustom?'#fff':'rgba(255,255,255,0.55)',
                    fontSize:11,fontWeight:800,fontFamily:"'Montserrat',sans-serif",
                    textAlign:'right',padding:'7px 0',
                  }}
                />
                <span style={{fontSize:10,fontWeight:700,color:usingCustom?'#fff':'rgba(255,255,255,0.4)',marginLeft:2}}>%</span>
              </div>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
              <div>
                <div style={{fontSize:7,fontWeight:700,color:'#ffffff',letterSpacing:1.5,marginBottom:5}}>LOTS A CERRAR</div>
                <div style={{display:'flex',alignItems:'center',background:'rgba(255,255,255,0.06)',border:'1px solid rgba(255,255,255,0.1)',borderRadius:10,padding:'0 12px',height:36}}>
                  <span style={{fontSize:13,fontWeight:700,color:'#fff'}}>{lotsToClose}</span>
                </div>
              </div>
              <div>
                <div style={{fontSize:7,fontWeight:700,color:'#ffffff',letterSpacing:1.5,marginBottom:5}}>RESTANTES</div>
                <div style={{display:'flex',alignItems:'center',background:'rgba(255,255,255,0.06)',border:'1px solid rgba(255,255,255,0.1)',borderRadius:10,padding:'0 12px',height:36}}>
                  <span style={{fontSize:13,fontWeight:700,color:'#ffffff'}}>{Math.max(0,parseFloat((pos.lots-lotsToClose).toFixed(2)))}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Note */}
          <div style={{marginBottom:14}}>
            <div style={{fontSize:8,fontWeight:700,color:'rgba(255,255,255,0.4)',letterSpacing:1.5,marginBottom:6}}>NOTA (OPCIONAL)</div>
            <textarea
              value={note} onChange={e=>setNote(e.target.value)}
              placeholder="¿Por qué entraste? ¿Qué salió bien o mal?..."
              rows={2}
              style={{width:'100%',background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.1)',borderRadius:10,padding:'8px 12px',color:'rgba(255,255,255,0.85)',fontSize:11,fontFamily:"'Montserrat',sans-serif",outline:'none',resize:'none',boxSizing:'border-box'}}
            />
          </div>

          {/* Confirm */}
          <button onClick={()=>onConfirm(lotsToClose,note.trim()||null)} style={{
            width:'100%',
            background:isProfit
              ?'linear-gradient(135deg,rgba(30,144,255,0.9),rgba(20,110,100,0.9))'
              :'linear-gradient(135deg,rgba(239,83,80,0.9),rgba(150,30,30,0.9))',
            border:'none',borderRadius:14,padding:'14px',
            fontSize:13,fontWeight:900,color:'#fff',cursor:'pointer',
            fontFamily:"'Montserrat',sans-serif",
            boxShadow:isProfit?'0 4px 24px rgba(30,144,255,0.3)':'0 4px 24px rgba(239,83,80,0.3)',
            inset:'0 1px 0 rgba(255,255,255,0.2)',
          }}>
            {effectivePct===100?'Cerrar posición':`Cerrar ${effectivePct}%`} · {estPnl>=0?'+':''}{estPnl.toFixed(2)}
          </button>
        </div>
      </div>
    </div>
  )
}


// ─── Position Overlay — HTML lines with reliable drag ────────────────────────
function PositionOverlay({positions,pendingOrders,chartMap,activePair,dataReady,onClosePos,onCancelOrder,onDragEnd}){
  const [lines,    setLines]    = useState([])
  const dragState = useRef(null) // {posId, type, active:bool}
  const chartElRef = useRef(null)

  // Get chart DOM element once
  useEffect(()=>{
    const cr = chartMap.current[activePair]
    if(cr?.chart) {
      try{ chartElRef.current = cr.chart.chartElement() }catch{}
    }
  },[activePair, dataReady])

  // Update line Y positions every 100ms
  useEffect(()=>{
    if(!dataReady) return
    const update=()=>{
      // Skip if nothing to show — saves CPU when no trades are open
      if(!positions.length && !pendingOrders?.length){ setLines([]); return }
      const cr=chartMap.current[activePair]; if(!cr?.series) return
      const all=[]
      positions.forEach(pos=>{
        let eY=null,slY=null,tpY=null
        try{eY =cr.series.priceToCoordinate(pos.entry)}catch{}
        try{slY=cr.series.priceToCoordinate(pos.sl)}catch{}
        try{tpY=cr.series.priceToCoordinate(pos.tp)}catch{}
        const slPnl=(-(pos.slPips*pos.lots*10)).toFixed(2)
        const tpPnl='+'+(pos.tpPips*pos.lots*10).toFixed(2)
        if(eY!=null)  all.push({id:pos.id+'_e', posId:pos.id,type:'entry',y:Math.round(eY),label:`${pos.side} ${pos.lots}L`,  color:'rgba(200,200,200,0.55)',drag:false,close:true})
        if(slY!=null) all.push({id:pos.id+'_sl',posId:pos.id,type:'sl',   y:Math.round(slY),label:`SL  -$${slPnl}`,            color:'rgba(239,83,80,0.65)',  drag:true, close:false})
        if(tpY!=null) all.push({id:pos.id+'_tp',posId:pos.id,type:'tp',   y:Math.round(tpY),label:`TP  ${tpPnl}`,              color:'rgba(30,144,255,0.65)', drag:true, close:false})
      })
      ;(pendingOrders||[]).forEach(ord=>{
        const cr2=chartMap.current[activePair]
        let eY=null,slY=null,tpY=null
        try{eY =cr2?.series?.priceToCoordinate(ord.entry)}catch{}
        try{slY=cr2?.series?.priceToCoordinate(ord.sl)}catch{}
        try{tpY=cr2?.series?.priceToCoordinate(ord.tp)}catch{}
        const lbl=ord.side==='BUY_LIMIT'?'B.LIM':'S.LIM'
        if(eY!=null)  all.push({id:ord.id+'_e', ordId:ord.id,type:'lim_e', y:Math.round(eY), label:`${lbl} ${ord.lots}L`,color:'rgba(180,180,180,0.55)',drag:true, cancel:true})
        if(slY!=null) all.push({id:ord.id+'_sl',ordId:ord.id,type:'lim_sl',y:Math.round(slY),label:'SL', color:'rgba(239,83,80,0.5)',  drag:true, cancel:true})
        if(tpY!=null) all.push({id:ord.id+'_tp',ordId:ord.id,type:'lim_tp',y:Math.round(tpY),label:'TP', color:'rgba(30,144,255,0.5)', drag:true, cancel:true})
      })
      if(!dragState.current?.active) setLines(all)
    }
    update()
    const iv=setInterval(update,150)
    return()=>clearInterval(iv)
  },[positions,pendingOrders,activePair,dataReady])

  // Drag handlers
  const onLineMouseDown=(e,line)=>{
    if(!line.drag) return
    e.stopPropagation()
    e.preventDefault()
    // Use ordId for limit orders, posId for open positions
    dragState.current={posId:line.ordId||line.posId,type:line.type,active:true}
  }

  useEffect(()=>{
    const onMove=e=>{
      if(!dragState.current?.active) return
      const cr=chartMap.current[activePair]; if(!cr?.series) return
      const el=chartElRef.current||cr.chart.chartElement?.()
      if(!el) return
      const rect=el.getBoundingClientRect()
      const y=e.clientY-rect.top
      let price=null
      try{price=cr.series.coordinateToPrice(y)}catch{}
      if(price==null||isNaN(price)) return
      // Move line visually during drag
      const ds=dragState.current; if(!ds) return
      setLines(prev=>prev.map(l=>{
        const id=l.ordId||l.posId
        return id===ds.posId&&l.type===ds.type
          ? {...l,y:Math.round(y)}
          : l
      }))
    }
    const onUp=e=>{
      if(!dragState.current?.active) return
      const cr=chartMap.current[activePair]; if(!cr?.series) return
      const el=chartElRef.current||cr.chart.chartElement?.()
      if(el){
        const rect=el.getBoundingClientRect()
        const y=e.clientY-rect.top
        let price=null
        try{price=cr.series.coordinateToPrice(y)}catch{}
        if(price!=null&&!isNaN(price)){
          onDragEnd(dragState.current.posId,dragState.current.type,price)
        }
      }
      dragState.current=null
    }
    window.addEventListener('mousemove',onMove)
    window.addEventListener('mouseup',onUp)
    return()=>{
      window.removeEventListener('mousemove',onMove)
      window.removeEventListener('mouseup',onUp)
    }
  },[activePair,onDragEnd])

  if(!dataReady||lines.length===0) return null

  return(
    <div style={{position:'absolute',inset:0,pointerEvents:'none',zIndex:5,overflow:'hidden'}}>
      {lines.map(line=>(
        <div key={line.id} style={{
          position:'absolute',
          left:0,right:0,
          top:line.y-10,
          height:20,
          pointerEvents:'auto',
          cursor:line.drag?'ns-resize':'default',
          userSelect:'none',
        }}
          onMouseDown={e=>onLineMouseDown(e,line)}
        >
          {/* Visible line */}
          <div style={{
            position:'absolute',left:0,right:0,
            top:'50%',transform:'translateY(-50%)',
            height:1,background:line.color,
          }}/>
          {/* Label + buttons */}
          <div style={{
            position:'absolute',right:56,top:'50%',transform:'translateY(-50%)',
            display:'flex',gap:4,alignItems:'center',
          }}>
            <div style={{
              background:'rgba(3,8,16,0.88)',
              border:`1px solid ${line.color}`,
              borderRadius:3,padding:'2px 7px',
              fontSize:8,fontWeight:700,color:'#ffffff',
              whiteSpace:'nowrap',
            }}>{line.label}</div>
            {line.drag&&(
              <div style={{
                background:'rgba(3,8,16,0.7)',
                border:`1px solid ${line.color}`,
                borderRadius:3,padding:'1px 4px',
                fontSize:9,color:'rgba(255,255,255,0.6)',
                cursor:'ns-resize',
              }}
                onMouseDown={e=>onLineMouseDown(e,line)}
              >⠿</div>
            )}
            {line.close&&(
              <button
                style={{background:'rgba(239,83,80,0.12)',border:'1px solid rgba(239,83,80,0.35)',borderRadius:3,color:'#ef5350',width:18,height:18,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',padding:0,fontSize:11,fontFamily:"'Montserrat',sans-serif"}}
                onMouseDown={e=>e.stopPropagation()}
                onClick={e=>{e.stopPropagation();onClosePos(line.posId)}}
              >✕</button>
            )}
            {line.cancel&&(
              <button
                style={{background:'rgba(239,83,80,0.1)',border:'1px solid rgba(239,83,80,0.3)',borderRadius:3,color:'#ef5350',width:18,height:18,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',padding:0,fontSize:11,fontFamily:"'Montserrat',sans-serif"}}
                onMouseDown={e=>e.stopPropagation()}
                onClick={e=>{e.stopPropagation();onCancelOrder(line.ordId)}}
              >✕</button>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
