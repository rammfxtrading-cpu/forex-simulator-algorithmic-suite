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
import { clearCurrentTime, getSeriesData, getRealLen } from '../lib/sessionData'
import { initVisibleRange, scrollToTail, markUserScrollIfReal } from '../lib/chartViewport'
import { isJpy, pipMult, calcPnl } from '../lib/trading/pricing'
import { realizePnl } from '../lib/trading/orders'
import { nextSessionOpen, sessionKeyAt } from '../lib/killzonesDomain'
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
import ChallengePassedPhaseModal from './ChallengePassedPhaseModal'
import ChallengePassedAllModal from './ChallengePassedAllModal'
import ChallengeFailedModal from './ChallengeFailedModal'
import { TF_LIST, SPEED_OPTS, ALL_PAIRS, normPair, chartOpts, fmtPx, fmtPnl, pnlColor, fmtTs, computePhantomsNeeded } from '../lib/sessionUi'
import TfInputModal from './TfInputModal'
import { s, css } from './sessionStyles'
import Spin from './Spin'
import AntimatterLoader from './AntimatterLoader'
import CloseModal from './CloseModal'
import PositionOverlay from './PositionOverlay'
import SessionTopBar from './SessionTopBar'
import ReplayPill from './ReplayPill'
import SessionBottomBar from './SessionBottomBar'
import SessionPanels from './SessionPanels'
import useChallengeFlow from './useChallengeFlow'
import usePairData from './usePairData'
import useTradingActions from './useTradingActions'

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

  const [session,     setSession]     = useState(null)
  const [loading,     setLoading]     = useState(true)
  const [activePairs, setActivePairs] = useState([])
  const [activePair,  setActivePair]  = useState(null)
  const [addingPair,  setAddingPair]  = useState(false)
  const [gotoOpen,    setGotoOpen]    = useState(false)
  const [gotoMiss,    setGotoMiss]    = useState(false)
  const [gotoDir,     setGotoDir]     = useState('up')
  const [pairTf,      setPairTf]      = useState({})
  const [isPlaying,   setIsPlaying]   = useState(false)
  const [speed,       setSpeed]       = useState(1)
  const [progress,    setProgress]    = useState(0)
  const [currentTime, setCurrentTime] = useState(null)
  const [currentPrice,setCurrentPrice]= useState(null)
  const [dataReady,   setDataReady]   = useState(false)
  const everReadyRef = useRef(false) // mini-corte H: true tras el primer dataReady; decide orbe vs mini-overlay
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
  /**
   * chartTick — contrato formal de invalidación de cache derivado del dataset.
   *
   * Señal monotónica (entero que solo crece con setChartTick(t => t+1))
   * que un overlay con cache derivado del dataset DEBE incluir como dep
   * de su useEffect de cache.
   *
   * Productores en este archivo:
   *   - L~891 (dentro de subscribeVisibleLogicalRangeChange): cambio
   *     de visible logical range (zoom/pan/scroll del usuario).
   *   - L~1221 (dentro de scrollToTailAndNotify, helper R6 post-5c):
   *     cambio de TF que reemplaza el dataset vía applyForcedSetData.
   *
   * Consumidores objetivo:
   *   - KillzonesOverlay (sub-fase 5d.2)
   *   - RulerOverlay (sub-fase 5d.3)
   *   - CustomDrawingsOverlay (sub-fase 5d.5, sesión 22)
   *   - PositionOverlay (sub-fase 5d.6, sesión 22)
   *
   * Distinto de `tick` (L207), que es señal de propósito general bumpeada
   * por trades, balance, order modal — NO refleja cambios de dataset.
   *
   * Contrato introducido en sub-fase 5d.1.
   */
  const [chartTick, setChartTick] = useState(0)
  const [hoverCandle, setHoverCandle] = useState(null) // {o,h,l,c,t}
  const [textInput, setTextInput] = useState(null) // {x,y,onConfirm}
  const [tfInput, setTfInput] = useState('')  // TF keyboard modal
  const [selectedDrawing, setSelectedDrawing] = useState(null) // {id, x, y}
  const selectedDrawingRef = useRef(null)

  // Challenge: estado, lockout, breach y handlers de modales viven en useChallengeFlow
  // (Fase 7, Corte D). API devuelta con los mismos nombres: ningún call-site cambia.
  const {
    challengeStatus, challengeLocked, challengeModal, setChallengeModal,
    challengeAdvancing, refreshChallengeStatus, checkChallengeBreach,
    handleChallengePass, handleChallengeFail, handleCtaRealChallenge,
    handleGoToDashboard, handleGoToNewChallenge,
  } = useChallengeFlow({ id, router, session, setSession, sessionRef, currentTime, pairState, balanceRef, closePositionRef, setIsPlaying })

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
    // Fuente per-par: par ACTIVO (no el principal de sesion), normalizado sin barra.
    // Fallback al par principal si activePairRef aun no se sincronizo (arranca null)
    // -> garantiza no-null para la columna NOT NULL.
    const pair = normPair(activePairRef.current || sessionRef.current?.pair)
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
        .update({ user_id: uid, pair, data: combined, updated_at: new Date().toISOString() })
        .eq('session_id', sid)
        .eq('pair', pair)
        .select('session_id')
      if (!upErr && (!updated || updated.length === 0)) {
        // No existía: insert. Si ahora otro tab se nos adelantó y ya creó la
        // fila entre el UPDATE y el INSERT (carrera muy rara), el catch lo
        // absorbe — el dato más reciente ya está en BD igualmente.
        await supabase.from('session_drawings').insert(
          { session_id: sid, user_id: uid, pair, data: combined, updated_at: new Date().toISOString() }
        ).then(()=>{}).catch(()=>{})
      }
    } catch(e) {}
  }, [exportTools, customDrawingsToJSON])
  useEffect(() => { saveDrawingsRef.current = saveSessionDrawings }, [saveSessionDrawings])

  // Load session drawings — wait for plugin to be fully ready (async init)
  useEffect(() => {
    if(!pluginReady || !id || !userIdRef.current) return
    const load = async () => {
      // Par activo normalizado (closure, valor fresco del re-run del effect).
      // NO activePairRef aqui: este effect corre ANTES del sync del ref (L428)
      // en el mismo flush -> el ref aun apuntaria al par viejo.
      const loadPairKey = normPair(activePair)
      try {
        const { data } = await supabase.from('session_drawings').select('data').eq('session_id', id).eq('pair', loadPairKey).order('updated_at', { ascending: false }).limit(1).maybeSingle()
        // Stale-guard: si el usuario cambio de par durante el await, abortar
        // para no inyectar drawings del par viejo en el plugin del nuevo.
        // Aqui si el ref: tras el await ya esta sincronizado.
        if (normPair(activePairRef.current) !== loadPairKey) return
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
  }, [pluginReady, id, activePair])

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
    return()=>{
      offAfterEdit(afterEditHandler)
      offDoubleClick(dblClickHandler)
    }
  },[pluginReady,activePair])
  useEffect(()=>{activePairRef.current=activePair},[activePair])
  useEffect(()=>{selectedToolRef.current=selectedTool},[selectedTool])

  // Sync selectedTool on click — reactivo vía subscribeClick LWC oficial (reemplaza polling 300ms s40 5f.2)
  useEffect(()=>{
    if(!dataReady) return
    everReadyRef.current = true // mini-corte H
    const cr=chartMap.current[activePair]
    if(!cr?.chart) return
    const handler=()=>{
      // Small delay to let plugin process click first
      setTimeout(()=>{
        try{
          const sel=getSelected()
          if(!sel||sel.length===0){
            setSelectedTool(null)
          }else{
            const t=sel[0]
            if(t?.id){
              setSelectedTool(prev=>prev?.id===t.id?prev:{id:t.id,toolType:t.toolType})
              if(t.toolType) setActiveToolKey(t.toolType)
            }
          }
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
            if(id) supabase.from("sim_sessions").update({timeframe:tf}).eq("id",id).then(()=>{}).catch(()=>{})
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

  // Datos y chart del par: saveProgress, loadPair y updateChart viven en usePairData
  // (Fase 7, Corte E). API devuelta con los mismos nombres: ningún call-site cambia.
  const { saveProgress, loadPair, updateChart } = usePairData({
    id, session, activePair,
    pairState, chartMap, sessionRef, activePairRef, pairTfRef, speedRef,
    checkSLTPRef, checkLimitOrdersRef, checkChallengeBreachRef,
    setIsPlaying, setCurrentTime, setProgress, setCurrentPrice, setDataReady, setTick,
    exportTools,
  })

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
      markUserScrollIfReal(_cr)
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
    // ─── sub-fase 5c — TF transition orchestrator ──────────────────────
    // Las 6 responsabilidades del cambio de TF, extraídas a funciones
    // nombradas locales con orden de ejecución explícito:
    //
    //   1. resolveCtx               → { ps, cr, newTf } | null
    //   2. deselectActiveDrawings   → limpia selección pre-setData
    //   3. computeTfPhantomsCount   → phantoms necesarias en TF nuevo
    //   4. applyForcedSetData       → siembra phantoms + fuerza updateChart
    //   5. bumpTfKey                → re-render hooks dependientes
    //   6. scrollToTailAndNotify    → scroll a tail + chartTick a overlays
    //
    // Cero cambios de comportamiento respecto al handler pre-5c. Si se
    // detecta regresión empírica (Killzones descolocadas, drawings
    // desanclados, etc.), revertir 5c entera.
    // ───────────────────────────────────────────────────────────────────

    // R1: contexto de la transición. Devuelve null si no hay par activo
    //     o si engine/cr aún no están listos.
    const resolveCtx = () => {
      if(!activePair) return null
      const ps=pairState.current[activePair], cr=chartMap.current[activePair]
      if(!ps?.engine || !cr) return null
      const newTf = pairTf[activePair] || 'H1'
      return { ps, cr, newTf }
    }

    // R2: deselect drawings antes del re-render. Mantiene UX limpia y
    //     previene el contraerse del LongShortPosition durante el setData.
    const deselectActiveDrawings = () => {
      try{ deselectAll() }catch{}
    }

    // R3: cuántas phantoms necesitamos en el TF nuevo para que TODOS los
    //     drawings se rendericen correctamente (sus timestamps deben caer
    //     dentro del array de velas, sea sobre vela real o phantom).
    const computeTfPhantomsCount = (ps, newTf) => {
      let phantomsNeeded = 10  // mínimo por defecto
      try {
        const TF_SECS = {M1:60, M3:180, M5:300, M15:900, M30:1800, H1:3600, H4:14400, D1:86400}
        const newSecs = TF_SECS[newTf] || 3600
        const newAgg = ps.engine.getAggregated(newTf)
        const newLastReal = newAgg.length ? newAgg[newAgg.length-1].time : null
        if (newLastReal) {
          const tools = JSON.parse(exportTools() || '[]')
          phantomsNeeded = computePhantomsNeeded(tools, newLastReal, newSecs)
        }
      } catch(e){ /* swallow — fallback al default 10 */ }
      return phantomsNeeded
    }

    // R4: forzar setData con las phantoms calculadas. Pasamos
    //     phantomsNeeded a updateChart vía un ref (cr._phantomsNeeded).
    //     prevCount=0 fuerza recreación completa del array de velas.
    const applyForcedSetData = (cr, phantomsNeeded, ps) => {
      cr._phantomsNeeded = phantomsNeeded
      cr.prevCount = 0
      updateChart(activePair, ps.engine, true)
    }

    // R5: bump tfKey para re-render de hooks dependientes (overlays, etc.).
    const bumpTfKey = () => setTfKey(k => k+1)

    // R6: scroll a la posición actual tras el cambio de TF y notifica
    //     a los overlays vía chartTick (KillzonesOverlay, RulerOverlay, etc.)
    //
    //     Sub-fase 5d.7 (deuda 5.1): el offset incluye phantomsNeeded para
    //     que el viewport se ancle al ÚLTIMO REAL + 8 barras, ignorando los
    //     phantoms sembrados por drawings extendidos a la derecha. Sin esto,
    //     scrollToPosition mide desde el final del array (que incluye phantoms)
    //     y el viewport arrastra el endpoint del drawing — comportamiento
    //     reportado por Ramón desde sesión 20 (espacio negro + pérdida de
    //     posición visible al cambiar TF). Estilo TradingView.
    const scrollToTailAndNotify = (cr, phantomsNeeded) => {
      const offset = 8 - (phantomsNeeded || 0)
      scrollToTail(cr, offset, () => setChartTick(t => t+1))
    }

    // ─── orquestador ───────────────────────────────────────────────────
    const ctx = resolveCtx()
    if (!ctx) return
    const { ps, cr, newTf } = ctx
    const oldTf = prevTfRef.current  // preservado para trazabilidad — candidato limpieza sub-fase 5f

    deselectActiveDrawings()
    const phantomsNeeded = computeTfPhantomsCount(ps, newTf)
    applyForcedSetData(cr, phantomsNeeded, ps)
    bumpTfKey()
    scrollToTailAndNotify(cr, phantomsNeeded)

    prevTfRef.current = newTf
  },[pairTf,activePair,updateChart,deselectAll,exportTools])

  // ── Replay ────────────────────────────────────────────────────────────────────
  const eng=()=>pairState.current[activePair]?.engine
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
  const handleStep=useCallback(()=>{const e=eng();if(!e||e.isPlaying)return;e.nextCandle(1);const cr=chartMap.current[activePair];if(cr)cr.prevCount=0;updateChart(activePair,e,true);setCurrentTime(e.currentTime);setProgress(Math.round(e.progress*100));saveProgress(e.currentTime)},[activePair,updateChart,saveProgress])
  const handleSpeed=useCallback((v)=>{speedRef.current=v;setSpeed(v);Object.values(pairState.current).forEach(ps=>ps?.engine?.setSpeed(v))},[])
  const handleGoTo=useCallback((sessKey)=>{
    setGotoOpen(false)
    const e=eng();if(!e)return
    if(e.isPlaying){e.pause();setIsPlaying(false)}
    const target=nextSessionOpen(e.candles,e.currentIndex,sessKey)
    if(!target){setGotoMiss(true);setTimeout(()=>setGotoMiss(false),1500);return}
    e.seekToTime(target.time)
    // Belt-reset de cursores como el scrubber (cinturon para el caso sin posiciones)
    const ps=pairState.current[activePair]
    if(ps){ps.lastSLTPIdx=e.currentIndex;ps.lastLimitIdx=e.currentIndex}
    setCurrentTime(e.currentTime);setProgress(Math.round(e.progress*100))
    const cr=chartMap.current[activePair];if(cr)cr.prevCount=0
    updateChart(activePair,e,true)
    saveProgress(e.currentTime)
  },[activePair,updateChart,saveProgress])

  // ── Trading ───────────────────────────────────────────────────────────────────────────────
  // Acciones de trading (closePosition, preview y órdenes límite, drag SL/TP,
  // checkSLTP/checkLimitOrders) viven en useTradingActions (Fase 7, Corte F).
  // API con los mismos nombres: ningún call-site cambia. openPosition y tpPips
  // eran código muerto (cero call-sites) y se eliminan en este corte.
  const {
    closePosition, createPositionLines,
    previewOrder, confirmLimitOrder, cancelPreview, handlePositionDragEnd,
    cancelLimitOrder, updatePreviewSl, updatePreviewTp,
    checkSLTP, checkLimitOrders,
  } = useTradingActions({
    id, activePair, currentPrice, currentTime, lots, preview,
    pairState, chartMap, sessionRef, balanceRef, userIdRef, closePositionRef,
    setBalance, setTick, setPreview, setCtxMenu, refreshChallengeStatus,
  })

  // Keep refs always pointing to latest values/functions
  balanceRef.current = balance
  useEffect(()=>{
    closePositionRef.current    = closePosition
    checkSLTPRef.current        = checkSLTP
    checkLimitOrdersRef.current = checkLimitOrders
    checkChallengeBreachRef.current = checkChallengeBreach
  })

  // B1: Reset de pairState al cambiar de sesión.
  // useRef sobrevive al cambio de URL /session/[id] (Next.js reutiliza el componente),
  // y el loader de la sesión reutiliza el slot del par si ya existe — heredando
  // positions/orders/engine vivos de la sesión anterior. Esto era el mecanismo del
  // bug B1 lado cliente: tras router.push a la fase hija, el chart de la hija
  // mostraba el flotante de la madre. Reset explícito al cambiar id soluciona.
  useEffect(() => {
    pairState.current = {}
  }, [id])

  // ── Position price lines (entry, SL, TP) ────────────────────────────────────

  function updatePositionLine(posId,pair,type,newPrice,pos){
    // Lines are rendered by HTML overlay — nothing to update in LWC
  }

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
      // Alt+R (Win/Linux) / Option+R (Mac) → reset viewport TradingView-style.
      // Restaura ventana TF-default custom del simulador (initVisibleRange) +
      // autoScale eje Y. Convención TradingView ratificada empíricamente.
      if(e.altKey && e.code === 'KeyR'){
        e.preventDefault()
        const pair = activePairRef.current
        const cr = chartMap.current[pair]
        if(!cr?.chart) return
        const tf = pairTfRef.current[pair] || 'H1'
        const aggLength = getRealLen()
        if(!aggLength) return
        initVisibleRange(cr, tf, aggLength)
        try { cr.chart.priceScale('right').applyOptions({ autoScale: true }) } catch {}
      }
    }
    window.addEventListener('keydown',onKey)
    return()=>window.removeEventListener('keydown',onKey)
  },[handlePlayPause,handleStep,challengeLocked])

  // Autosave: persistir avance cada 5s si ha cambiado (play, scrubber, etc)
  useEffect(()=>{
    let last=0
    const iv=setInterval(()=>{const e=pairState.current[activePairRef.current]?.engine;if(e?.currentTime&&e.currentTime!==last){last=e.currentTime;saveProgress(e.currentTime)}},5000)
    return()=>clearInterval(iv)
  },[saveProgress])
  useEffect(()=>()=>{
    // Save drawings before unmount
    if(saveDrawingsRef.current) saveDrawingsRef.current()
    // Save progress before unmount
    const e = pairState.current[activePairRef.current]?.engine
    if(e?.currentTime && id){
      try{supabase.from('sim_sessions').update({last_timestamp:e.currentTime,balance:balanceRef.current,timeframe:pairTfRef.current[activePairRef.current]||"H1"}).eq('id',id)}catch(err){}
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

  if(loading) return <AntimatterLoader/>

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
                if(moved){setTimeout(()=>{ if(saveDrawingsRef.current) saveDrawingsRef.current() },100)}
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
        <KillzonesOverlay chartMap={chartMap} activePair={activePair} tick={tick} tfKey={tfKey} dataReady={dataReady} currentTf={pairTf[activePair]||'H1'} currentTime={currentTime}/>
        <RulerOverlay active={rulerActive} onDeactivate={()=>{setRulerActive(false);setActiveTool('cursor')}} chartMap={chartMap} activePair={activePair} chartTick={chartTick} />
        <CustomDrawingsOverlay drawings={drawings} chartMap={chartMap} activePair={activePair} tfKey={tfKey} chartTick={chartTick} />
        {!dataReady&&everReadyRef.current&&(
          <div style={s.overlay}><Spin/><span style={s.overlayTxt}>Cargando {activePair}…</span></div>
        )}
        <PositionOverlay
          positions={openPositions}
          pendingOrders={pendingOrders}
          chartMap={chartMap}
          activePair={activePair}
          dataReady={dataReady}
          chartTick={chartTick}
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

      {/* TOP BAR — extraído a SessionTopBar (Fase 7, Corte C) */}
      <SessionTopBar
        session={session} activePairs={activePairs} activePair={activePair} setActivePair={setActivePair}
        pairState={pairState} removePair={removePair} addPair={addPair}
        addingPair={addingPair} setAddingPair={setAddingPair}
      />

      {/* TF BAR */}
      <div style={s.tfBar}>
        {TF_LIST.map(tf=>(
          <button key={tf} style={{...s.tfBtn,...(activeTf===tf?s.tfActive:{})}}
            onClick={()=>{const n={...pairTfRef.current,[activePair]:tf};pairTfRef.current=n;setPairTf(n);if(id)supabase.from("sim_sessions").update({timeframe:tf}).eq("id",id).then(()=>{}).catch(()=>{})}}
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

      {/* REPLAY PILL — extraído a ReplayPill (Fase 7, Corte C) */}
      <ReplayPill
        pillPos={pillPos} setPillPos={setPillPos} pillDragRef={pillDragRef}
        isPlaying={isPlaying} challengeLocked={challengeLocked} dataReady={dataReady}
        handlePlayPause={handlePlayPause} handleStep={handleStep} progress={progress}
        speed={speed} handleSpeed={handleSpeed}
        gotoMiss={gotoMiss} gotoOpen={gotoOpen} setGotoOpen={setGotoOpen} gotoDir={gotoDir} setGotoDir={setGotoDir} handleGoTo={handleGoTo}
      />

      {/* BOTTOM BAR — extraído a SessionBottomBar (Fase 7, Corte C) */}
      <SessionBottomBar
        lastTrade={lastTrade} challengeLocked={challengeLocked} setOrderModal={setOrderModal}
        currentPrice={currentPrice} activePair={activePair} dataReady={dataReady}
        balance={balance} realized={realized} unrealized={unrealized}
        allTrades={allTrades} challengeStatus={challengeStatus}
        openPositions={openPositions} pendingOrders={pendingOrders}
        showPos={showPos} setShowPos={setShowPos} showOrders={showOrders} setShowOrders={setShowOrders} showTrades={showTrades} setShowTrades={setShowTrades}
      />

      {/* PANELES POS/LIMIT/JOURNAL — extraídos a SessionPanels (Fase 7, Corte C) */}
      <SessionPanels
        showPos={showPos} setShowPos={setShowPos} openPositions={openPositions} closePosition={closePosition}
        currentPrice={currentPrice} activePair={activePair} setCloseModal={setCloseModal}
        showOrders={showOrders} setShowOrders={setShowOrders} pendingOrders={pendingOrders} cancelLimitOrder={cancelLimitOrder}
        showTrades={showTrades} setShowTrades={setShowTrades} allTrades={allTrades}
      />

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
            const { pnl, rrReal, result } = realizePnl({ side: pos.side, entry: pos.entry, exit: currentPrice, lots: lotsToClose, pair: closeModal.pair, initialSlPips: pos.initialSlPips, slPips: pos.slPips })
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
                  session_type:(realOpen&&realOpen>1000000000)?sessionKeyAt(realOpen):null,
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

      {!dataReady&&!everReadyRef.current&&<AntimatterLoader/>}

      <style>{css}</style>
    </div>
  )
}
