/**
 * pages/session/[id].js
 * Forex Simulator — Algorithmic Suite — R.A.M.M.FX TRADING™
 * Diseño unificado con Dashboard — red animada + cristal
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../../lib/supabase'
import ReplayEngine from '../../lib/replayEngine'

const TF_LIST     = ['M1','M5','M15','M30','H1','H4','D1']
const SPEED_OPTS  = [{l:'1×',v:1},{l:'5×',v:5},{l:'15×',v:15},{l:'60×',v:60},{l:'∞',v:500}]
const LOT_PRESETS = [0.01,0.05,0.1,0.25,0.5,1.0]
const RR_PRESETS  = [1,1.5,2,3]
const ALL_PAIRS   = ['EUR/USD','GBP/USD','USD/JPY','USD/CHF','AUD/USD','USD/CAD','EUR/GBP','EUR/JPY','GBP/JPY']

function chartOpts(w,h){return{width:w,height:h,layout:{background:{color:'transparent'},textColor:'#a0b8d0',fontFamily:"'Montserrat',sans-serif",fontSize:11},grid:{vertLines:{color:'#0a1628'},horzLines:{color:'#0a1628'}},crosshair:{mode:1,vertLine:{color:'#1E90FF44',labelBackgroundColor:'#1E90FF'},horzLine:{color:'#1E90FF44',labelBackgroundColor:'#1E90FF'}},rightPriceScale:{borderColor:'#0d2040',scaleMargins:{top:0.06,bottom:0.06}},timeScale:{borderColor:'#0d2040',timeVisible:true,secondsVisible:false,rightOffset:12,barSpacing:6,minBarSpacing:0.5,fixLeftEdge:true},handleScroll:{mouseWheel:true,pressedMouseMove:true},handleScale:{axisPressedMouseMove:true,mouseWheel:true,pinch:true}}}

const isJpy    = p=>p?.includes('JPY')
const pipMult  = p=>isJpy(p)?100:10000
const fmtPx    = (px,p)=>px?.toFixed(isJpy(p)?3:5)??'—'
const fmtPnl   = v=>(v>=0?'+':'')+v.toFixed(2)
const pnlColor = v=>v>0?'#1E90FF':v<0?'#ef5350':'#a0b8d0'
const fmtTs    = ts=>ts?new Date(ts*1000).toLocaleString('es-ES',{month:'short',day:'2-digit',hour:'2-digit',minute:'2-digit'}):'—'
function calcPnl(side,entry,exit,lots,pair){const pips=side==='BUY'?(exit-entry)*pipMult(pair):(entry-exit)*pipMult(pair);return pips*lots*10}

export const getServerSideProps=()=>({props:{}})

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
  const [lastTrade,   setLastTrade]   = useState(null)
  const [tick,        setTick]        = useState(0)

  useEffect(()=>{activePairRef.current=activePair},[activePair])
  useEffect(()=>{pairTfRef.current=pairTf},[pairTf])

  // ── Background constellation animation ──────────────────────────────────────
  useEffect(()=>{
    const canvas=bgCanvasRef.current; if(!canvas) return
    const ctx=canvas.getContext('2d')
    const resize=()=>{canvas.width=window.innerWidth;canvas.height=window.innerHeight}
    resize()
    const nodes=[]
    for(let i=0;i<55;i++) nodes.push({x:Math.random()*canvas.width,y:Math.random()*canvas.height,vx:(Math.random()-.5)*.3,vy:(Math.random()-.5)*.3,r:Math.random()*1.4+.7})
    let raf
    function draw(){
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
      raf=requestAnimationFrame(draw)
    }
    draw()
    window.addEventListener('resize',resize)
    return()=>{cancelAnimationFrame(raf);window.removeEventListener('resize',resize)}
  },[])

  // ── Auth ─────────────────────────────────────────────────────────────────────
  useEffect(()=>{
    supabase.auth.getSession().then(({data:{session:s}})=>{
      if(!s){router.replace('/');return}
      userIdRef.current=s.user.id
    })
  },[])

  // ── Session load ──────────────────────────────────────────────────────────────
  useEffect(()=>{
    if(!id) return
    supabase.from('sim_sessions').select('*').eq('id',id).single().then(({data})=>{
      if(!data){setLoading(false);return}
      sessionRef.current=data
      setSession(data)
      setBalance(parseFloat(data.balance))
      const p=data.pair||'EUR/USD', tf=data.timeframe||'H1'
      setActivePairs([p]); setActivePair(p)
      const initTf={[p]:tf}; setPairTf(initTf); pairTfRef.current=initTf
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
      const engine=new ReplayEngine()
      engine.load(all); engine.seekToTime(replayTs); engine.speed=speedRef.current
      engine.onTick=()=>{
        updateChart(pair,engine,false)
        checkSLTP(pair,engine)
        if(pair===activePairRef.current){setCurrentTime(engine.currentTime);setProgress(Math.round(engine.progress*100))}
      }
      engine.onEnd=()=>{if(pair===activePairRef.current)setIsPlaying(false)}
      pairState.current[pair]={engine,ready:true,positions:[],trades:[]}
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
    const series=chart.addSeries(lc.CandlestickSeries,{upColor:'#1E90FF',downColor:'#ef5350',borderVisible:false,wickUpColor:'#1E90FF99',wickDownColor:'#ef535099'})
    chartMap.current[pair]={chart,series,prevCount:0}
    new ResizeObserver(entries=>{
      const{width,height}=entries[0].contentRect
      if(chartMap.current[pair]) chart.resize(width,height)
    }).observe(el)
    loadPair(pair)
  }
  const mountPair=useCallback((pair,el)=>{mountPairRef.current(pair,el)},[])

  // ── Update chart ──────────────────────────────────────────────────────────────
  const updateChart=useCallback((pair,engine,full)=>{
    const cr=chartMap.current[pair]; if(!cr||!engine) return
    const tf=pairTfRef.current[pair]||'H1'
    const agg=engine.getAggregated(tf); if(!agg.length) return
    const prev=cr.prevCount,curr=agg.length
    if(full||(curr!==prev&&curr!==prev+1)){cr.series.setData(agg);cr.chart.timeScale().scrollToPosition(5,false)}
    else{cr.series.update(agg[agg.length-1]);cr.chart.timeScale().scrollToPosition(5,false)}
    cr.prevCount=curr
    if(pair===activePairRef.current) setCurrentPrice(agg[agg.length-1].close)
  },[])

  useEffect(()=>{
    if(activePair){
      const ps=pairState.current[activePair],cr=chartMap.current[activePair]
      if(ps?.engine&&cr){cr.prevCount=0;updateChart(activePair,ps.engine,true)}
    }
  },[pairTf,activePair,updateChart])

  useEffect(()=>{
    if(!activePair) return
    const ps=pairState.current[activePair]
    if(ps?.engine){
      setIsPlaying(ps.engine.isPlaying);setCurrentTime(ps.engine.currentTime)
      setProgress(Math.round(ps.engine.progress*100))
      const agg=ps.engine.getAggregated(pairTfRef.current[activePair]||'H1')
      setCurrentPrice(agg.slice(-1)[0]?.close??null);setDataReady(true)
    }else{setDataReady(false);if(sessionRef.current)loadPair(activePair)}
    setTick(t=>t+1)
  },[activePair,loadPair])

  useEffect(()=>{if(session&&activePair)loadPair(activePair)},[session,activePair,loadPair])

  // ── Replay ────────────────────────────────────────────────────────────────────
  const eng=()=>pairState.current[activePair]?.engine
  const handlePlayPause=useCallback(()=>{const e=eng();if(!e)return;if(e.isPlaying){e.pause();setIsPlaying(false)}else{e.play();setIsPlaying(true)}},[activePair])
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
    ps.positions=[...ps.positions,{id:`${Date.now()}`,pair:activePair,side,entry:currentPrice,sl,tp,lots,slPips,tpPips,rr,openTime:currentTime}]
    setLastTrade(side);setTimeout(()=>setLastTrade(null),700);setTick(t=>t+1)
  },[currentPrice,activePair,lots,slPips,tpPips,rr,currentTime])

  const closePosition=useCallback(async(posId,reason='MANUAL')=>{
    const ps=pairState.current[activePair];if(!ps||!currentPrice) return
    const pos=ps.positions.find(p=>p.id===posId);if(!pos) return
    const pnl=calcPnl(pos.side,pos.entry,currentPrice,pos.lots,activePair)
    const result=pnl>0?'WIN':pnl<0?'LOSS':'BREAKEVEN'
    const rrReal=pos.slPips>0?pnl/(pos.slPips*pos.lots*10):0
    ps.positions=ps.positions.filter(p=>p.id!==posId)
    ps.trades=[...ps.trades,{...pos,exit:currentPrice,closeTime:currentTime,pnl,result,rrReal:parseFloat(rrReal.toFixed(2)),reason}]
    setBalance(b=>b+pnl);setTick(t=>t+1)
    if(userIdRef.current){
      try{await supabase.from('sim_trades').insert({user_id:userIdRef.current,session_id:id,pair:pos.pair,side:pos.side,lots:pos.lots,entry_price:pos.entry,exit_price:currentPrice,sl:pos.sl,tp:pos.tp,sl_pips:pos.slPips,tp_pips:pos.tpPips,rr:pos.rr,rr_real:parseFloat(rrReal.toFixed(2)),pnl,result,exit_reason:reason,opened_at:pos.openTime?new Date(pos.openTime*1000).toISOString():null,closed_at:currentTime?new Date(currentTime*1000).toISOString():null})}catch(e){console.error(e)}
    }
  },[activePair,currentPrice,currentTime,id])

  const checkSLTP=useCallback((pair,engine)=>{
    const ps=pairState.current[pair];if(!ps?.positions?.length) return
    const agg=engine.getAggregated(pairTfRef.current[pair]||'H1')
    const price=agg.slice(-1)[0]?.close;if(!price) return
    ps.positions.forEach(pos=>{
      const hitTp=pos.side==='BUY'?price>=pos.tp:price<=pos.tp
      const hitSl=pos.side==='BUY'?price<=pos.sl:price>=pos.sl
      if(hitTp)closePosition(pos.id,'TP');else if(hitSl)closePosition(pos.id,'SL')
    })
  },[closePosition])

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

  // ── Keyboard ──────────────────────────────────────────────────────────────────
  useEffect(()=>{
    const onKey=e=>{if(e.target.tagName==='INPUT')return;if(e.code==='Space'){e.preventDefault();handlePlayPause()}if(e.code==='ArrowRight')handleStep()}
    window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey)
  },[handlePlayPause,handleStep])

  useEffect(()=>()=>{
    Object.values(pairState.current).forEach(ps=>ps?.engine?.pause())
    Object.values(chartMap.current).forEach(cr=>{try{cr.chart.remove()}catch{}})
  },[])

  // ── Computed ──────────────────────────────────────────────────────────────────
  const activePs      = pairState.current[activePair]
  const openPositions = activePs?.positions??[]
  const allTrades     = Object.values(pairState.current).flatMap(ps=>ps?.trades??[])
  const unrealized    = openPositions.reduce((s,p)=>s+calcPnl(p.side,p.entry,currentPrice??p.entry,p.lots,activePair),0)
  const realized      = allTrades.reduce((s,t)=>s+(t.pnl??0),0)
  const activeTf      = pairTf[activePair]||'H1'

  if(loading) return <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',background:'#000'}}><Spin/></div>

  return (
    <div style={s.root}>

      {/* Constellation background */}
      <canvas ref={bgCanvasRef} style={s.bgCanvas}/>

      {/* TOP BAR — glass */}
      <div style={s.topBar}>
        <div style={s.topLeft}>
          <button style={s.iconBtn} onClick={()=>router.push('/dashboard')}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15,18 9,12 15,6"/></svg>
          </button>
          <div style={s.vDiv}/>
          <div>
            <div style={s.sessName}>{session?.name||'Sesión'}</div>
            <div style={s.sessDates}>{session?.date_from} → {session?.date_to}</div>
          </div>
        </div>

        {/* PAIR TABS */}
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

        {/* STATS */}
        <div style={s.statsRow}>
          <Pill label="BALANCE"   val={`$${balance.toFixed(2)}`} color="#fff"/>
          <Pill label="REALIZADO" val={fmtPnl(realized)}          color={pnlColor(realized)}/>
          <Pill label="FLOTANTE"  val={fmtPnl(unrealized)}        color={pnlColor(unrealized)}/>
          <Pill label="TRADES"    val={allTrades.length}           color="#a0b8d0"/>
        </div>
      </div>

      {/* TF BAR — glass */}
      <div style={s.tfBar}>
        {TF_LIST.map(tf=>(
          <button key={tf} style={{...s.tfBtn,...(activeTf===tf?s.tfActive:{})}}
            onClick={()=>{const n={...pairTfRef.current,[activePair]:tf};pairTfRef.current=n;setPairTf(n)}}
          >{tf}</button>
        ))}
        <div style={{flex:1}}/>
        {currentTime&&<span style={s.tsBadge}>{fmtTs(currentTime)}</span>}
        {currentPrice&&<span style={s.pxBadge}>{fmtPx(currentPrice,activePair)}</span>}
      </div>

      {/* CHART AREA */}
      <div style={s.chartWrap}>
        {activePairs.map(pair=>(
          <div key={pair}
            ref={el=>{if(el&&!chartMap.current[pair])mountPair(pair,el)}}
            style={{...s.chart,display:pair===activePair?'block':'none'}}
          />
        ))}
        {!dataReady&&(
          <div style={s.overlay}>
            <Spin/>
            <span style={s.overlayTxt}>Cargando {activePair}…</span>
          </div>
        )}
      </div>

      {/* BOTTOM BAR — glass */}
      <div style={s.btmBar}>

        {/* Replay */}
        <div style={s.replayRow}>
          <button style={{...s.ctrlBtn,...s.playBtn,...(isPlaying?s.pauseBtn:{})}} onClick={handlePlayPause} disabled={!dataReady}>
            {isPlaying
              ?<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
              :<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
            }
          </button>
          <button style={s.ctrlBtn} onClick={handleStep} disabled={!dataReady}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polygon points="5,4 15,12 5,20"/><line x1="19" y1="5" x2="19" y2="19"/></svg>
          </button>
          <div style={s.speedRow}>
            {SPEED_OPTS.map(o=>(
              <button key={o.v} style={{...s.speedBtn,...(speed===o.v?s.speedActive:{})}} onClick={()=>handleSpeed(o.v)}>{o.l}</button>
            ))}
          </div>
        </div>

        {/* Progress bar */}
        <div style={s.progWrap}>
          <div style={s.progTrack}><div style={{...s.progFill,width:`${progress}%`}}/></div>
          <span style={s.progLabel}>{progress}%</span>
        </div>

        {/* Trade panel */}
        <div style={s.tradeRow}>
          <ParamGroup label="LOTS" presets={LOT_PRESETS} active={lots} onSelect={setLots}
            input={<input style={s.numIn} type="number" step="0.01" min="0.01" value={lots} onChange={e=>setLots(Math.max(0.01,parseFloat(e.target.value)||0.01))}/>}/>
          <ParamGroup label="SL pips" presets={[10,20,30,50]} active={slPips} onSelect={setSlPips}
            input={<input style={s.numIn} type="number" step="1" min="1" value={slPips} onChange={e=>setSlPips(Math.max(1,parseInt(e.target.value)||1))}/>}/>
          <ParamGroup label="R:R" presets={RR_PRESETS} active={rr} onSelect={setRr}/>
          <div style={s.rrHint}>
            <span style={s.paramLbl}>TP</span>
            <span style={{fontSize:10,color:'#1E90FF',fontWeight:700}}>{tpPips}p</span>
          </div>

          <button style={{...s.tradeBtn,background:'linear-gradient(135deg,#1E90FF,#0060cc)',boxShadow:'0 4px 16px #1E90FF30',...(lastTrade==='BUY'?s.flash:{})}}
            onClick={()=>openPosition('BUY')} disabled={!dataReady||!currentPrice}>
            <span>▲ BUY</span>
            {currentPrice&&<span style={s.tradePx}>{fmtPx(currentPrice,activePair)}</span>}
          </button>
          <button style={{...s.tradeBtn,background:'linear-gradient(135deg,#ef5350,#b71c1c)',boxShadow:'0 4px 16px #ef535030',...(lastTrade==='SELL'?s.flash:{})}}
            onClick={()=>openPosition('SELL')} disabled={!dataReady||!currentPrice}>
            <span>▼ SELL</span>
            {currentPrice&&<span style={s.tradePx}>{fmtPx(currentPrice,activePair)}</span>}
          </button>

          <div style={s.toggleRow}>
            {openPositions.length>0&&(
              <button style={{...s.togBtn,...(showPos?s.togOn:{})}} onClick={()=>{setShowPos(v=>!v);setShowTrades(false)}}>
                {openPositions.length} POS
              </button>
            )}
            {allTrades.length>0&&(
              <button style={{...s.togBtn,...(showTrades?s.togOn:{})}} onClick={()=>{setShowTrades(v=>!v);setShowPos(false)}}>
                {allTrades.length} TRADES
              </button>
            )}
          </div>
        </div>
      </div>

      {/* POSITIONS PANEL — glass */}
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
                      <td style={{...s.td,color:'#ef535066'}}>{fmtPx(pos.sl,pos.pair)}</td>
                      <td style={{...s.td,color:'#1E90FF66'}}>{fmtPx(pos.tp,pos.pair)}</td>
                      <td style={s.td}>{pos.lots}</td>
                      <td style={{...s.td,color:pnlColor(pnl),fontWeight:700}}>{fmtPnl(pnl)}</td>
                      <td style={s.td}><button style={s.closeBtn} onClick={()=>closePosition(pos.id)}>✕</button></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TRADES JOURNAL — glass */}
      {showTrades&&allTrades.length>0&&(
        <div style={s.panel}>
          <div style={s.panelHdr}>
            <span style={s.panelTitle}>JOURNAL</span>
            <button style={s.iconBtn} onClick={()=>setShowTrades(false)}>✕</button>
          </div>
          <div style={{overflowX:'auto'}}>
            <table style={s.tbl}>
              <thead><tr>{['PAR','DIR','ENTRY','EXIT','LOTS','SL','TP','R:R','P&L','RESULT','RAZÓN'].map(h=><th key={h} style={s.th}>{h}</th>)}</tr></thead>
              <tbody>
                {allTrades.map((t,i)=>(
                  <tr key={i} style={s.tblRow}>
                    <td style={s.td}>{t.pair}</td>
                    <td style={{...s.td,color:t.side==='BUY'?'#1E90FF':'#ef5350',fontWeight:800}}>{t.side}</td>
                    <td style={s.td}>{fmtPx(t.entry,t.pair)}</td>
                    <td style={s.td}>{fmtPx(t.exit,t.pair)}</td>
                    <td style={s.td}>{t.lots}</td>
                    <td style={s.td}>{t.slPips}</td>
                    <td style={s.td}>{t.tpPips}</td>
                    <td style={s.td}>{t.rrReal}R</td>
                    <td style={{...s.td,color:pnlColor(t.pnl),fontWeight:700}}>{fmtPnl(t.pnl)}</td>
                    <td style={{...s.td,color:t.result==='WIN'?'#1E90FF':t.result==='LOSS'?'#ef5350':'#a0b8d0',fontWeight:700}}>{t.result}</td>
                    <td style={{...s.td,color:'#2a5070'}}>{t.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <style>{css}</style>
    </div>
  )
}

function Pill({label,val,color}){
  return(
    <div style={{display:'flex',flexDirection:'column',gap:0,padding:'0 10px',borderLeft:'1px solid #0d2040'}}>
      <span style={{fontSize:7,fontWeight:700,color:'#2a5070',letterSpacing:1}}>{label}</span>
      <span style={{fontSize:10,fontWeight:800,color}}>{val}</span>
    </div>
  )
}

function ParamGroup({label,presets,active,onSelect,input}){
  return(
    <div style={{display:'flex',flexDirection:'column',gap:2}}>
      <span style={{fontSize:7,fontWeight:700,color:'#2a5070',letterSpacing:1}}>{label}</span>
      <div style={{display:'flex',gap:2,alignItems:'center'}}>
        {presets.map(p=>(
          <button key={p} style={{background:active===p?'rgba(30,144,255,0.15)':'rgba(3,8,16,0.6)',border:active===p?'1px solid #1E90FF66':'1px solid #0d2040',color:active===p?'#1E90FF':'#4a6080',fontSize:9,fontWeight:700,padding:'2px 5px',borderRadius:4,cursor:'pointer',fontFamily:"'Montserrat',sans-serif"}} onClick={()=>onSelect(p)}>{p}</button>
        ))}
        {input}
      </div>
    </div>
  )
}

function Spin(){
  return<><div className="sp"/><style>{`.sp{width:24px;height:24px;border:2px solid #0d2040;border-top-color:#1E90FF;border-radius:50%;animation:sp .6s linear infinite}@keyframes sp{to{transform:rotate(360deg)}}`}</style></>
}

const glass='rgba(2,8,16,0.75)'
const glassBorder='1px solid #0d2040'

const s={
  root:{display:'flex',flexDirection:'column',height:'100vh',background:'#000',fontFamily:"'Montserrat',sans-serif",overflow:'hidden',color:'#a0b8d0',position:'relative'},
  bgCanvas:{position:'fixed',inset:0,width:'100%',height:'100%',pointerEvents:'none',zIndex:0},
  topBar:{position:'relative',zIndex:1,height:42,background:glass,borderBottom:glassBorder,backdropFilter:'blur(12px)',display:'flex',alignItems:'center',padding:'0 10px',gap:8,flexShrink:0},
  topLeft:{display:'flex',alignItems:'center',gap:8,flexShrink:0},
  vDiv:{width:1,height:18,background:'#0d2040'},
  sessName:{fontSize:10,fontWeight:800,color:'#fff',letterSpacing:0.4},
  sessDates:{fontSize:8,color:'#2a5070',letterSpacing:0.2},
  tabRow:{display:'flex',alignItems:'center',gap:3,flex:1,overflow:'visible',minWidth:0},
  tab:{display:'flex',alignItems:'center',gap:4,padding:'4px 10px',borderRadius:'4px 4px 0 0',border:'1px solid #0d2040',borderBottom:'none',background:'rgba(3,8,16,0.5)',flexShrink:0,cursor:'pointer'},
  tabActive:{background:'rgba(30,144,255,0.08)',borderColor:'#1E90FF44'},
  tabLabel:{fontSize:10,fontWeight:700,color:'#c0d0e8',letterSpacing:0.3,display:'flex',alignItems:'center',gap:4},
  tabDot:{width:5,height:5,borderRadius:'50%',background:'#1E90FF',display:'inline-block'},
  tabClose:{background:'none',border:'none',color:'#2a5070',cursor:'pointer',fontSize:9,padding:'0 2px',fontFamily:"'Montserrat',sans-serif"},
  addBtn:{background:'rgba(3,8,16,0.8)',border:glassBorder,color:'#4a6080',width:24,height:24,borderRadius:4,cursor:'pointer',fontSize:16,display:'flex',alignItems:'center',justifyContent:'center',fontFamily:"'Montserrat',sans-serif",flexShrink:0},
  dropdown:{position:'fixed',top:42,background:'#030f20',border:'1px solid #0d2040',borderRadius:8,zIndex:9999,minWidth:130,padding:'4px 0',boxShadow:'0 12px 40px #000000CC',backdropFilter:'blur(8px)'},
  ddItem:{display:'block',width:'100%',background:'none',border:'none',color:'#c0d0e8',fontSize:11,fontWeight:700,padding:'7px 14px',cursor:'pointer',textAlign:'left',fontFamily:"'Montserrat',sans-serif",letterSpacing:0.3},
  statsRow:{display:'flex',alignItems:'center',flexShrink:0},
  tfBar:{position:'relative',zIndex:1,height:30,background:glass,borderBottom:glassBorder,backdropFilter:'blur(12px)',display:'flex',alignItems:'center',padding:'0 10px',gap:2,flexShrink:0},
  tfBtn:{background:'none',border:'none',color:'#2a5070',fontSize:10,fontWeight:700,padding:'3px 8px',borderRadius:4,cursor:'pointer',fontFamily:"'Montserrat',sans-serif"},
  tfActive:{background:'rgba(30,144,255,0.12)',color:'#1E90FF',border:'1px solid #1E90FF30'},
  tsBadge:{fontSize:9,color:'#4a6080',fontWeight:600,padding:'2px 8px',background:'rgba(3,8,16,0.6)',borderRadius:4,border:glassBorder},
  pxBadge:{fontSize:12,color:'#1E90FF',fontWeight:800,padding:'2px 10px',background:'rgba(30,144,255,0.08)',borderRadius:4,border:'1px solid #1E90FF30',marginLeft:6,letterSpacing:0.5},
  chartWrap:{flex:1,position:'relative',overflow:'hidden',zIndex:1},
  chart:{position:'absolute',inset:0,width:'100%',height:'100%'},
  overlay:{position:'absolute',inset:0,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:12,background:'rgba(0,0,0,0.7)',backdropFilter:'blur(4px)',zIndex:10},
  overlayTxt:{fontSize:11,color:'#4a6080',fontWeight:700,letterSpacing:0.5},
  btmBar:{position:'relative',zIndex:1,height:54,background:glass,borderTop:glassBorder,backdropFilter:'blur(12px)',display:'flex',alignItems:'center',padding:'0 10px',gap:12,flexShrink:0},
  replayRow:{display:'flex',alignItems:'center',gap:4,flexShrink:0},
  ctrlBtn:{background:'rgba(3,8,16,0.8)',border:glassBorder,color:'#a0b8d0',width:26,height:26,borderRadius:6,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'},
  playBtn:{background:'linear-gradient(135deg,#1E90FF,#0060cc)',border:'none',color:'#fff',width:32,height:32,borderRadius:'50%',boxShadow:'0 4px 16px #1E90FF40'},
  pauseBtn:{background:'rgba(30,144,255,0.6)',boxShadow:'none'},
  speedRow:{display:'flex',gap:1,marginLeft:4},
  speedBtn:{background:'none',border:'none',color:'#2a5070',fontSize:9,fontWeight:700,padding:'3px 6px',cursor:'pointer',borderRadius:3,fontFamily:"'Montserrat',sans-serif"},
  speedActive:{background:'rgba(30,144,255,0.12)',color:'#1E90FF'},
  progWrap:{flex:1,display:'flex',alignItems:'center',gap:8,minWidth:60},
  progTrack:{flex:1,height:3,background:'#0d2040',borderRadius:2,overflow:'hidden'},
  progFill:{height:'100%',background:'linear-gradient(90deg,#1E90FF,#00aaff)',borderRadius:2,transition:'width .3s linear'},
  progLabel:{fontSize:8,color:'#2a5070',fontWeight:700,width:28,textAlign:'right',flexShrink:0},
  tradeRow:{display:'flex',alignItems:'center',gap:8,flexShrink:0},
  paramLbl:{fontSize:7,fontWeight:700,color:'#2a5070',letterSpacing:1},
  rrHint:{display:'flex',flexDirection:'column',gap:2,alignItems:'center'},
  numIn:{background:'rgba(3,8,16,0.8)',border:glassBorder,color:'#fff',width:46,height:22,textAlign:'center',fontSize:10,fontWeight:700,borderRadius:4,outline:'none',fontFamily:"'Montserrat',sans-serif"},
  tradeBtn:{border:'none',color:'#fff',borderRadius:6,padding:'5px 14px',fontSize:10,fontWeight:800,cursor:'pointer',display:'flex',flexDirection:'column',alignItems:'center',gap:1,fontFamily:"'Montserrat',sans-serif",lineHeight:1.2},
  tradePx:{fontSize:7,fontWeight:600,opacity:0.75},
  flash:{transform:'scale(0.93)',opacity:0.8},
  toggleRow:{display:'flex',gap:4},
  togBtn:{background:'rgba(3,8,16,0.8)',border:glassBorder,color:'#4a6080',borderRadius:6,padding:'4px 10px',fontSize:9,fontWeight:700,cursor:'pointer',fontFamily:"'Montserrat',sans-serif",whiteSpace:'nowrap'},
  togOn:{background:'rgba(30,144,255,0.12)',borderColor:'#1E90FF44',color:'#1E90FF'},
  panel:{position:'fixed',bottom:54,left:0,right:0,background:'rgba(2,8,16,0.92)',borderTop:glassBorder,backdropFilter:'blur(16px)',zIndex:100,maxHeight:260,overflowY:'auto'},
  panelHdr:{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'7px 14px',borderBottom:glassBorder,position:'sticky',top:0,background:'rgba(2,8,16,0.95)',backdropFilter:'blur(8px)'},
  panelTitle:{fontSize:9,fontWeight:800,color:'#fff',letterSpacing:1.5},
  dangerBtn:{background:'rgba(239,83,80,0.08)',border:'1px solid rgba(239,83,80,0.3)',color:'#ef5350',borderRadius:4,padding:'3px 10px',fontSize:9,fontWeight:700,cursor:'pointer',fontFamily:"'Montserrat',sans-serif"},
  tbl:{width:'100%',borderCollapse:'collapse',fontSize:10},
  tblRow:{borderBottom:'1px solid #030f20'},
  th:{padding:'4px 12px',textAlign:'left',color:'#1E90FF',fontWeight:700,fontSize:8,letterSpacing:1,whiteSpace:'nowrap',borderBottom:'1px solid #0d2040'},
  td:{padding:'6px 12px',color:'#c0d0e8',whiteSpace:'nowrap'},
  closeBtn:{background:'none',border:'none',color:'#2a5070',cursor:'pointer',fontSize:11,padding:'0 2px',fontFamily:"'Montserrat',sans-serif"},
  iconBtn:{background:'rgba(3,8,16,0.8)',border:glassBorder,borderRadius:6,padding:'5px 7px',cursor:'pointer',color:'#4a6080',display:'flex',alignItems:'center',fontFamily:"'Montserrat',sans-serif"},
}

const css=`
  *{box-sizing:border-box;margin:0;padding:0}
  body{overflow:hidden;background:#000}
  input[type=number]::-webkit-inner-spin-button,input[type=number]::-webkit-outer-spin-button{opacity:0}
  button:not(:disabled):hover{opacity:0.82}
  button:disabled{opacity:0.3;cursor:not-allowed!important}
`
