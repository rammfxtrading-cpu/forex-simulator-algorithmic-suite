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
import DrawingToolbarV2, { DrawingConfigPill, DrawingContextMenu } from './DrawingToolbarV2'
import LongShortModal from './LongShortModal'
import { useDrawingTools } from './useDrawingTools'
import ChartConfigPanel, { useChartConfig, applyChartConfig } from './ChartConfigPanel'
import RulerOverlay from './RulerOverlay'
import useCustomDrawings, { DRAWING_TYPES } from './useCustomDrawings'
import CustomDrawingsOverlay from './CustomDrawingsOverlay'
import { fromScreenCoords, toScreenCoords } from '../lib/chartCoords'

const TF_LIST     = ['M1','M5','M15','M30','H1','H4','D1']
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
    fontSize:13,
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
  },
  timeScale:{
    borderColor:'rgba(255,255,255,0.1)',
    textColor:'rgba(255,255,255,0.85)',
    timeVisible:true,
    secondsVisible:false,
    rightOffset:8,
    barSpacing:12,
    minBarSpacing:3,
    fixLeftEdge:false,
    fixRightEdge:false,
    ticksVisible:true,
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

const TF_VALID={'1m':'M1','5m':'M5','15m':'M15','30m':'M30','1h':'H1','4h':'H4','1d':'D1'}
const TF_OPTS=[{l:'1m',tf:'M1'},{l:'5m',tf:'M5'},{l:'15m',tf:'M15'},{l:'30m',tf:'M30'},{l:'1h',tf:'H1'},{l:'4h',tf:'H4'},{l:'1d',tf:'D1'}]
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

  const bgCanvasRef   = useRef(null)
  const pairState     = useRef({})
  const chartMap      = useRef({})
  const sessionRef    = useRef(null)
  const userIdRef     = useRef(null)
  const speedRef      = useRef(1)
  const activePairRef = useRef(null)
  const mountPairRef  = useRef(null)
  const pairTfRef     = useRef({})

  const [session,     setSession]     = useState(null)
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
  const balanceRef          = useRef(10000)
  // Order modal
  const [orderModal,  setOrderModal]  = useState(null)  // {side,entry,pair,isLimit}
  const [mounted,     setMounted]     = useState(false)
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

  const { pluginRef, pluginReady, toolConfigs, updateToolConfig, applyToTool, setToolVisible, addTool, removeSelected, removeAll, exportTools, importTools, onAfterEdit, offAfterEdit, onDoubleClick, offDoubleClick, getSelected } = useDrawingTools({
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

  useEffect(()=>{setMounted(true)},[])

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
      await supabase.from('session_drawings').delete().eq('session_id', sid).then(()=>{}).catch(()=>{})
      await supabase.from('session_drawings').insert(
        { session_id: sid, user_id: uid, data: combined, updated_at: new Date().toISOString() }
      ).then(()=>{}).catch(()=>{})
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
  useEffect(()=>{
    supabase.auth.getSession().then(async({data:{session:s}})=>{
      if(!s){router.replace('/');return}
      userIdRef.current=s.user.id
      const{data:tpls}=await supabase.from('sim_drawing_templates').select('*').eq('user_id',s.user.id)
      if(tpls)setTemplates(tpls)
    })
  },[])

  // ── TF keyboard input — TradingView style ─────────────────────────────────────
  useEffect(()=>{
    const VALID={'1m':'M1','5m':'M5','15m':'M15','30m':'M30','1h':'H1','4h':'H4','1d':'D1'}
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

  // ── Load pair data ────────────────────────────────────────────────────────────
  const loadPair=useCallback(async(pair)=>{
    const sess=sessionRef.current
    if(!sess||pairState.current[pair]?.ready) return
    const clean=pair.replace('/','')
    const replayTs=sess.date_from?Math.floor(new Date(sess.date_from).getTime()/1000):Math.floor(new Date('2023-01-01').getTime()/1000)
    const toTs=sess.date_to?Math.floor(new Date(sess.date_to+'T23:59:59').getTime()/1000):Math.floor(new Date('2023-12-31T23:59:59').getTime()/1000)
    const ctxTs=replayTs-6*30*24*60*60
    const ctxYear=new Date(ctxTs*1000).getFullYear().toString()
    const rpYear=new Date(replayTs*1000).getFullYear().toString()
    try{
      let all=[]
      for(const yr of[...new Set([ctxYear,rpYear])]){
        const yStart=Math.max(ctxTs,Math.floor(new Date(`${yr}-01-01`).getTime()/1000))
        const yEnd=yr===rpYear?toTs:Math.floor(new Date(`${yr}-12-31T23:59:59`).getTime()/1000)
        const r=await fetch(`/api/candles?pair=${clean}&timeframe=M1&from=${yStart}&to=${yEnd}&year=${yr}`)
        const j=await r.json()
        if(j.candles?.length) all=all.concat(j.candles)
      }
      const seen=new Set()
      all=all.filter(c=>{if(seen.has(c.time))return false;seen.add(c.time);return true}).sort((a,b)=>a.time-b.time)
      if(!all.length) return

      // ── Remove weekend gaps ──────────────────────────────────────────────
      // Filter out Saturday candles and Sunday pre-market (before 20:00 UTC)
      const filtered = all.filter(c => {
        const d = new Date(c.time * 1000)
        const day = d.getUTCDay()
        if(day === 6) return false                           // Saturday — skip entirely
        if(day === 0 && d.getUTCHours() < 20) return false  // Sunday pre-market — skip
        return true
      })
      // Use real timestamps — weekend candles already filtered above
      // LWC renders whatever candles it receives sequentially (no gaps for missing bars)
      const ordinalToReal = null   // not needed — real timestamps used directly
      const realToOrdinal = null
      const ordinalCandles = filtered

      const engine=new ReplayEngine()
      // If there's a master time (another pair already advanced), use that. Otherwise resume saved position.
      const masterTime = (typeof window !== 'undefined' && window.__algSuiteCurrentTime) || null
      // Convert real masterTime/resumeTs to ordinal if needed
      const toOrdinal = (t) => t ? (realToOrdinal.get(t) ?? (() => {
        // Find closest ordinal for approximate timestamps (e.g. different TF boundaries)
        let closest = ordinalCandles[0]?.time ?? 0
        let minDiff = Infinity
        for(const [rt, ot] of realToOrdinal) { const d=Math.abs(rt-t); if(d<minDiff){minDiff=d;closest=ot} }
        return closest
      })()) : null
      const resumeReal = masterTime || sess.last_timestamp || replayTs
      const resumeTs = toOrdinal(resumeReal) ?? 0
      engine.load(ordinalCandles); engine.seekToTime(resumeTs); engine.speed=speedRef.current
      engine.onTick=()=>{
        updateChart(pair,engine,false)
        checkSLTPRef.current?.(pair,engine)
        checkLimitOrdersRef.current?.(pair,engine)
        if(pair===activePairRef.current){
          setCurrentTime(engine.currentTime)
          setProgress(Math.round(engine.progress*100))
          if(typeof window!=='undefined') window.__algSuiteCurrentTime=engine.currentTime
        }
      }
      engine.onEnd=()=>{if(pair===activePairRef.current)setIsPlaying(false)}
      const ps={engine,ready:true,positions:[],trades:[],ordinalToReal,realToOrdinal,
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
    const series=chart.addSeries(lc.CandlestickSeries,{upColor:'#2962FF',downColor:'#ffffff',borderUpColor:'#2962FF',borderDownColor:'#ffffff',wickUpColor:'#2962FF',wickDownColor:'#ffffff',borderVisible:false,priceFormat:{type:'price',precision:5,minMove:0.00001}})
    chartMap.current[pair]={chart,series,prevCount:0}
    new ResizeObserver(entries=>{
      const{width,height}=entries[0].contentRect
      try{if(chartMap.current[pair]) chart.resize(width,height)}catch{}
    }).observe(el)

    chart.timeScale().subscribeVisibleLogicalRangeChange(()=>{
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

    // Drag SL/TP — use capture phase on canvas to intercept LWC events
    const getCanvas=()=>el.querySelector('canvas')||el

    const onMouseDown=e=>{
      if(e.button!==0) return
      const cr=chartMap.current[pair]; if(!cr) return
      const rect=el.getBoundingClientRect()
      let clickPrice=null
      try{ clickPrice=cr.series.coordinateToPrice(e.clientY-rect.top) }catch{}
      if(clickPrice==null||isNaN(clickPrice)) return
      const ps=pairState.current[pair]; if(!ps?.positions?.length) return
      const pipSz=pair?.includes('JPY')?0.01:0.0001
      const threshold=pipSz*12
      for(const pos of ps.positions){
        if(Math.abs(clickPrice-pos.sl)<threshold){
          draggingRef.current={posId:pos.id,pair,type:'sl',pos:{...pos}}
          e.stopPropagation(); e.preventDefault(); return
        }
        if(Math.abs(clickPrice-pos.tp)<threshold){
          draggingRef.current={posId:pos.id,pair,type:'tp',pos:{...pos}}
          e.stopPropagation(); e.preventDefault(); return
        }
      }
    }
    // Use capture:true so we get the event before LWC
    el.addEventListener('mousedown', onMouseDown, {capture:true})

    // mousemove and mouseup on window so drag works even if mouse leaves chart
    const onMouseMove=e=>{
      if(!draggingRef.current||draggingRef.current.pair!==pair) return
      const cr=chartMap.current[pair]; if(!cr) return
      const rect=el.getBoundingClientRect()
      let newPrice=null
      try{ newPrice=cr.series.coordinateToPrice(e.clientY-rect.top) }catch{}
      if(newPrice==null||isNaN(newPrice)) return
      updatePositionLine(draggingRef.current.posId,pair,draggingRef.current.type,newPrice,draggingRef.current.pos)
    }
    const onMouseUp=e=>{
      if(!draggingRef.current||draggingRef.current.pair!==pair) return
      const cr=chartMap.current[pair]; if(!cr) return
      const rect=el.getBoundingClientRect()
      let newPrice=null
      try{ newPrice=cr.series.coordinateToPrice(e.clientY-rect.top) }catch{}
      if(newPrice!=null&&!isNaN(newPrice)){
        const{posId,pair:p,type}=draggingRef.current
        const ps=pairState.current[p]
        if(ps?.positions){
          const pos=ps.positions.find(x=>x.id===posId)
          if(pos){
            const pips=Math.abs((newPrice-pos.entry)*pipMult(p))
            if(type==='sl'){pos.sl=newPrice;pos.slPips=parseFloat(pips.toFixed(1))}
            else{pos.tp=newPrice;pos.tpPips=parseFloat(pips.toFixed(1))}
            updatePositionLine(posId,p,type,newPrice,pos)
            ps.positions=[...ps.positions]
            setTick(t=>t+1)
          }
        }
      }
      draggingRef.current=null
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)

    loadPair(pair)
  }
  const mountPair=useCallback((pair,el)=>{mountPairRef.current(pair,el)},[])

  // ── Update chart ──────────────────────────────────────────────────────────────
  const updateChart=useCallback((pair,engine,full)=>{
    const cr=chartMap.current[pair]; if(!cr||!engine) return
    const tf=pairTfRef.current[pair]||'H1'
    const agg=engine.getAggregated(tf); if(!agg.length) return
    const prev=cr.prevCount,curr=agg.length
    const _tfMap2={'M1':60,'M5':300,'M15':900,'M30':1800,'H1':3600,'H4':14400,'D1':86400}
    const _tfS2 = _tfMap2[tf]||3600
    const _lastT = agg[agg.length-1].time
    const _lastC = agg[agg.length-1].close

    if(full||(curr!==prev&&curr!==prev+1)){
      // Structural change — full rebuild with new phantoms
      cr.phantom = Array.from({length:50},(_,i)=>({
        time:_lastT+_tfS2*(i+1),open:_lastC,high:_lastC,low:_lastC,close:_lastC,
        color:'rgba(0,0,0,0)',wickColor:'rgba(0,0,0,0)',borderColor:'rgba(0,0,0,0)'
      }))
      cr.phantomBaseTime = _lastT
      cr.series.setData([...agg,...cr.phantom])
      if(typeof window!=='undefined'){window.__algSuiteSeriesData=[...agg,...cr.phantom];window.__algSuiteRealDataLen=agg.length}
      if(prev===0&&!cr.hasLoaded){
        cr.chart.timeScale().scrollToPosition(8,false)
        try{cr.chart.timeScale().applyOptions({barSpacing:12,rightOffset:12})}catch{}
        cr.hasLoaded=true
      }
    } else if(curr===prev+1){
      // New TF candle added — update phantoms and add new candle via update()
      cr.phantom = Array.from({length:50},(_,i)=>({
        time:_lastT+_tfS2*(i+1),open:_lastC,high:_lastC,low:_lastC,close:_lastC,
        color:'rgba(0,0,0,0)',wickColor:'rgba(0,0,0,0)',borderColor:'rgba(0,0,0,0)'
      }))
      cr.phantomBaseTime = _lastT
      cr.series.setData([...agg,...cr.phantom])
      if(typeof window!=='undefined'){window.__algSuiteSeriesData=[...agg,...cr.phantom];window.__algSuiteRealDataLen=agg.length}
    } else {
      // Within-bucket update — only last candle changed, use update() — 100x faster than setData
      try{
        cr.series.update(agg[agg.length-1])
        // Update last real candle in-place in the global array (no new allocation)
        if(typeof window!=='undefined'&&window.__algSuiteSeriesData){
          window.__algSuiteSeriesData[agg.length-1]=agg[agg.length-1]
        }
      }catch{
        // Fallback to setData if update fails
        cr.series.setData([...agg,...cr.phantom])
        if(typeof window!=='undefined'){window.__algSuiteSeriesData=[...agg,...cr.phantom];window.__algSuiteRealDataLen=agg.length}
      }
    }
    cr.prevCount=curr
    if(pair===activePairRef.current) setCurrentPrice(agg[agg.length-1].close)
  },[])

  useEffect(()=>{
    if(activePair){
      const ps=pairState.current[activePair],cr=chartMap.current[activePair]
      if(ps?.engine&&cr){
        cr.prevCount=0;updateChart(activePair,ps.engine,true);setTfKey(k=>k+1)
        // Double rAF — ensures LWC has painted the new TF before text positions recalculate
        requestAnimationFrame(()=>requestAnimationFrame(()=>setChartTick(t=>t+1)))
      }
    }
  },[pairTf,activePair,updateChart])

  useEffect(()=>{
    if(!activePair) return
    const ps=pairState.current[activePair]
    if(ps?.engine){
      // Sync this pair's engine to the current master time (from whichever pair was active before)
      const masterTime = window.__algSuiteCurrentTime
      if(masterTime && Math.abs(ps.engine.currentTime - masterTime) > 60) {
        ps.engine.seekToTime(masterTime)
      }
      setIsPlaying(ps.engine.isPlaying);setCurrentTime(ps.engine.currentTime)
      setProgress(Math.round(ps.engine.progress*100))
      const agg=ps.engine.getAggregated(pairTfRef.current[activePair]||'H1')
      setCurrentPrice(agg.slice(-1)[0]?.close??null);setDataReady(true);if(typeof window!=='undefined') window.__algSuiteCurrentTime=ps.engine.currentTime
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
    }else{e.play();setIsPlaying(true)}
  },[activePair,saveProgress])
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
    const newPos={id:posId,pair:activePair,side,entry:currentPrice,sl,tp,lots,slPips,tpPips,rr,openTime:currentTime}
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
    const rrReal=pos.slPips>0?pnl/(pos.slPips*pos.lots*10):0
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
  },[activePair,currentPrice,currentTime,id])

  // Keep refs always pointing to latest values/functions
  balanceRef.current = balance
  useEffect(()=>{
    closePositionRef.current    = closePosition
    checkSLTPRef.current        = checkSLTP
    checkLimitOrdersRef.current = checkLimitOrders
  })

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
        const newPos={id:posId,pair,side,entry:order.entry,sl:order.sl,tp:order.tp,lots:order.lots,slPips:order.slPips,tpPips:order.tpPips,rr:order.rr,openTime:engine.currentTime}
        ps.positions=[...ps.positions,newPos]
        setTimeout(()=>createPositionLines(posId,pair,newPos),50)
      })
    }
    if(executed.length){
      ps.orders=ps.orders.filter(o=>!executed.includes(o.id))
      setTick(t=>t+1)
    }
  },[])

  // ── Multi-pair ────────────────────────────────────────────────────────────────
  const addPair=useCallback((pair)=>{
    setAddingPair(false)
    if(activePairs.includes(pair)){setActivePair(pair);return}
    const nxt={...pairTfRef.current,[pair]:'H1'};pairTfRef.current=nxt;setPairTf(nxt)
    setActivePairs(prev=>[...prev,pair]);setActivePair(pair)
  },[activePairs])

  const removePair=useCallback((pair)=>{
    if(activePairs.length===1) return
    const cr=chartMap.current[pair];if(cr){try{cr.chart.remove()}catch{};delete chartMap.current[pair]}
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
      if(e.code==='Space'){e.preventDefault();handlePlayPause()}
      if(e.code==='ArrowRight') handleStep()
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
  },[handlePlayPause,handleStep])

  useEffect(()=>()=>{
    // Save drawings before unmount
    if(saveDrawingsRef.current) saveDrawingsRef.current()
    // Save progress before unmount
    const e = pairState.current[activePairRef.current]?.engine
    if(e?.currentTime && id){
      try{supabase.from('sim_sessions').update({last_timestamp:e.currentTime,balance:balanceRef.current}).eq('id',id)}catch(err){}
    }
    Object.values(pairState.current).forEach(ps=>ps?.engine?.pause())
    Object.values(chartMap.current).forEach(cr=>{try{cr.chart.remove()}catch{}})
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
      {longShortModal&&(
        <LongShortModal
          tool={longShortModal.tool}
          toolId={longShortModal.toolId}
          activePair={activePair}
          balance={balance}
          initialBalance={initialCapital}
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

        {/* Right: reset + fullscreen */}
        <div style={{display:'flex',alignItems:'center',gap:6,flexShrink:0}}>
          <button style={{...s.iconBtn,color:'rgba(255,255,255,0.5)',fontSize:9,gap:4,padding:'4px 8px'}}
            title="Reiniciar sesión al inicio"
            onClick={()=>{
              if(!confirm('¿Reiniciar la sesión al principio? Las posiciones abiertas se cerrarán.')) return
              const ps=pairState.current[activePair]; if(!ps?.engine) return
              // Close all open positions
              ;[...ps.positions].forEach(p=>closePositionRef.current(p.id,'RESET',activePair,p.entry))
              ps.positions=[];ps.orders=[]
              ps.engine.reset()
              ps.lastSLTPIdx=0; ps.lastLimitIdx=0
              const cr=chartMap.current[activePair];if(cr)cr.prevCount=0
              updateChart(activePair,ps.engine,true)
              setCurrentTime(ps.engine.currentTime);setProgress(0)
              setIsPlaying(false);setTick(t=>t+1)
              // Save reset position to DB
              if(userIdRef.current) supabase.from('sim_sessions').update({last_timestamp:ps.engine.currentTime}).eq('id',id).then(()=>{}).catch(()=>{})
            }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="1,4 1,10 7,10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg>
            Reset
          </button>
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
        <button style={{...s.pillPlay,...(isPlaying?s.pillPause:{})}} onClick={handlePlayPause} disabled={!dataReady}>
          {isPlaying
            ?<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="4" width="4" height="16"/><rect x="15" y="4" width="4" height="16"/></svg>
            :<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><polygon points="6,3 20,12 6,21"/></svg>
          }
        </button>
        <button style={s.pillBtn} onClick={handleStep} disabled={!dataReady} title="Avanzar vela">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,4 15,12 5,20"/><rect x="17" y="4" width="3" height="16"/></svg>
        </button>
        <div style={s.pillDivider}/>
        <div style={s.pillProgress} title={`${progress}% — clic para saltar`}
          onClick={e=>{
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
        <div style={s.speedRow}>
          {SPEED_OPTS.map(o=>(
            <button key={o.v} style={{...s.speedBtn,...(speed===o.v?s.speedActive:{})}} onClick={()=>handleSpeed(o.v)}>{o.l}</button>
          ))}
        </div>
      </div>

      {/* BOTTOM BAR — BUY/SELL + balance */}
      <div style={s.btmBar}>
        {/* BUY / SELL */}
        <div style={s.tradeActions}>
          <button style={{...s.buyBtn,...(lastTrade==='BUY'?s.flash:{})}}
            onClick={()=>setOrderModal({side:'BUY',entry:currentPrice,pair:activePair,isLimit:false})} disabled={!dataReady||!currentPrice}>
            ▲ Buy
          </button>
          <button style={{...s.sellBtn,...(lastTrade==='SELL'?s.flash:{})}}
            onClick={()=>setOrderModal({side:'SELL',entry:currentPrice,pair:activePair,isLimit:false})} disabled={!dataReady||!currentPrice}>
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
            {ctxMenu.price<(currentPrice||0)&&(
              <button style={s.ctxItem} onClick={()=>{setCtxMenu(null);setOrderModal({side:'BUY',entry:ctxMenu.price,pair:ctxMenu.pair,isLimit:true})}}>
                <span style={{color:'#4da6ff'}}>▲ Buy Limit</span>
                <span style={{color:'#ffffff',fontSize:9}}>{ctxMenu.price.toFixed(5)}</span>
              </button>
            )}
            {ctxMenu.price>(currentPrice||0)&&(
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
          initialBalance={initialCapital} currentPrice={currentPrice}
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
              const newPos={id:posId,pair:orderModal.pair,side:orderModal.side,entry:orderModal.entry,...posData,openTime:currentTime}
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
            const rrReal=pos.slPips>0?pnl/(pos.slPips*lotsToClose*10):0
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
            setCloseModal(null)
          }}
        />
      )}

      {tfInput&&<TfInputModal tfInput={tfInput} activeTf={pairTf[activePair]||'H1'}/>}

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
  const PRESETS=[25,50,75,100]
  const [pct,setPct]=useState(100)
  const [note,setNote]=useState('')
  const lotsToClose=parseFloat((pos.lots*pct/100).toFixed(2))
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
            <div style={{display:'flex',gap:4,background:'rgba(255,255,255,0.04)',borderRadius:12,padding:4,marginBottom:10}}>
              {PRESETS.map(p=>(
                <button key={p} onClick={()=>setPct(p)} style={{
                  flex:1,padding:'7px 0',borderRadius:9,border:'none',
                  background:pct===p?accentColor:'transparent',
                  color:pct===p?'#fff':'rgba(255,255,255,0.4)',
                  fontSize:11,fontWeight:800,cursor:'pointer',
                  fontFamily:"'Montserrat',sans-serif",
                  boxShadow:pct===p?`0 2px 12px rgba(${accentRgb},0.4)`:'none',
                }}>{p}%</button>
              ))}
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
            {pct===100?'Cerrar posición':'Cerrar parcial'} · {estPnl>=0?'+':''}{estPnl.toFixed(2)}
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
