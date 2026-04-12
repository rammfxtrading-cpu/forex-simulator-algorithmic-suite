/**
 * pages/session/[id].js
 * Forex Simulator — Algorithmic Suite — R.A.M.M.FX TRADING™
 * Rewrite limpio — SSR-safe, multi-par, multi-TF, forward-only
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../../lib/supabase'
import ReplayEngine from '../../lib/replayEngine'

// ─── Constants ────────────────────────────────────────────────────────────────

const TF_LIST      = ['M1','M5','M15','M30','H1','H4','D1']
const SPEED_OPTS   = [{l:'1×',v:1},{l:'5×',v:5},{l:'15×',v:15},{l:'60×',v:60},{l:'∞',v:500}]
const LOT_PRESETS  = [0.01,0.05,0.1,0.25,0.5,1.0]
const RR_PRESETS   = [1,1.5,2,3]
const ALL_PAIRS    = ['EUR/USD','GBP/USD','USD/JPY','USD/CHF','AUD/USD','USD/CAD','EUR/GBP','EUR/JPY','GBP/JPY']

// ─── Chart options (no LWC imports at module level) ───────────────────────────

function chartOpts(w, h) {
  return {
    width: w, height: h,
    layout: { background:{color:'#000'}, textColor:'#B2B5BE', fontFamily:"'Montserrat',sans-serif", fontSize:11 },
    grid: { vertLines:{color:'#0d1017'}, horzLines:{color:'#0d1017'} },
    crosshair: { mode:1, vertLine:{color:'#1E90FF44',labelBackgroundColor:'#1E90FF'}, horzLine:{color:'#1E90FF44',labelBackgroundColor:'#1E90FF'} },
    rightPriceScale: { borderColor:'#1a1e27', scaleMargins:{top:0.06,bottom:0.06} },
    timeScale: { borderColor:'#1a1e27', timeVisible:true, secondsVisible:false, rightOffset:12, barSpacing:6, minBarSpacing:0.5, fixLeftEdge:true },
    handleScroll: { mouseWheel:true, pressedMouseMove:true },
    handleScale:  { axisPressedMouseMove:true, mouseWheel:true, pinch:true },
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const isJpy    = p => p?.includes('JPY')
const pipMult  = p => isJpy(p) ? 100 : 10000
const fmtPx    = (px,p) => px?.toFixed(isJpy(p)?3:5) ?? '—'
const fmtPnl   = v => (v>=0?'+':'')+v.toFixed(2)
const pnlColor = v => v>0?'#1E90FF':v<0?'#ef5350':'#B2B5BE'
const fmtTs    = ts => ts ? new Date(ts*1000).toLocaleString('es-ES',{month:'short',day:'2-digit',hour:'2-digit',minute:'2-digit'}) : '—'

function calcPnl(side, entry, exit, lots, pair) {
  const pips = side==='BUY' ? (exit-entry)*pipMult(pair) : (entry-exit)*pipMult(pair)
  return pips * lots * 10
}

// ─── Component ────────────────────────────────────────────────────────────────

export const getServerSideProps = () => ({ props: {} })

export default function SessionPage() {
  const router = useRouter()
  const { id } = router.query

  // Refs — mutable, never cause re-renders
  const pairState   = useRef({})   // { pair: { engine, ready, positions, trades } }
  const chartMap    = useRef({})   // { pair: { chart, series, prevCount } }
  const divMap      = useRef({})   // { pair: HTMLDivElement }
  const sessionRef  = useRef(null)
  const userIdRef   = useRef(null)
  const speedRef    = useRef(1)

  // State
  const [session,      setSession]      = useState(null)
  const [loading,      setLoading]      = useState(true)
  const [activePairs,  setActivePairs]  = useState([])
  const [activePair,   setActivePair]   = useState(null)
  const [addingPair,   setAddingPair]   = useState(false)
  const [pairTf,       setPairTf]       = useState({})
  const pairTfRef = useRef({})

  const [isPlaying,    setIsPlaying]    = useState(false)
  const [speed,        setSpeed]        = useState(1)
  const [progress,     setProgress]     = useState(0)
  const [currentTime,  setCurrentTime]  = useState(null)
  const [currentPrice, setCurrentPrice] = useState(null)
  const [dataReady,    setDataReady]    = useState(false)

  const [balance,      setBalance]      = useState(10000)
  const [lots,         setLots]         = useState(0.01)
  const [slPips,       setSlPips]       = useState(20)
  const [rr,           setRr]           = useState(2)
  const [showPos,      setShowPos]      = useState(false)
  const [showTrades,   setShowTrades]   = useState(false)
  const [lastTrade,    setLastTrade]    = useState(null)
  const [tick,         setTick]         = useState(0) // force re-render for positions

  // ── Auth ────────────────────────────────────────────────────────────────────

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (!s) { router.replace('/'); return }
      userIdRef.current = s.user.id
    })
  }, [])

  // ── Session load ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!id) return
    supabase.from('sim_sessions').select('*').eq('id', id).single().then(({ data }) => {
      if (!data) { setLoading(false); return }
      sessionRef.current = data
      setSession(data)
      setBalance(parseFloat(data.balance))
      const p  = data.pair || 'EUR/USD'
      const tf = data.timeframe || 'H1'
      setActivePairs([p])
      setActivePair(p)
      setPairTf({ [p]: tf })
      pairTfRef.current = { [p]: tf }
      setLoading(false)
    })
  }, [id])

  // ── Load data for a pair ────────────────────────────────────────────────────

  const loadPair = useCallback(async (pair) => {
    const sess = sessionRef.current
    if (!sess || pairState.current[pair]?.ready) return

    const clean = pair.replace('/','')
    const replayTs = sess.date_from
      ? Math.floor(new Date(sess.date_from).getTime()/1000)
      : Math.floor(new Date('2023-01-01').getTime()/1000)
    const toTs = sess.date_to
      ? Math.floor(new Date(sess.date_to+'T23:59:59').getTime()/1000)
      : Math.floor(new Date('2023-12-31T23:59:59').getTime()/1000)
    const ctxTs   = replayTs - 6*30*24*60*60
    const ctxYear = new Date(ctxTs*1000).getFullYear().toString()
    const rpYear  = new Date(replayTs*1000).getFullYear().toString()

    try {
      let all = []
      for (const yr of [...new Set([ctxYear, rpYear])]) {
        const yStart = Math.max(ctxTs, Math.floor(new Date(`${yr}-01-01`).getTime()/1000))
        const yEnd   = yr===rpYear ? toTs : Math.floor(new Date(`${yr}-12-31T23:59:59`).getTime()/1000)
        const r = await fetch(`/api/candles?pair=${clean}&timeframe=M1&from=${yStart}&to=${yEnd}&year=${yr}`)
        const j = await r.json()
        if (j.candles?.length) all = all.concat(j.candles)
      }
      const seen = new Set()
      all = all.filter(c => { if(seen.has(c.time)) return false; seen.add(c.time); return true }).sort((a,b)=>a.time-b.time)
      if (!all.length) return

      const engine = new ReplayEngine()
      engine.load(all)
      engine.seekToTime(replayTs)
      engine.speed = speedRef.current

      engine.onTick = () => {
        updateChart(pair, engine, false)
        checkSLTP(pair, engine)
        if (pair === activePairRef.current) {
          setCurrentTime(engine.currentTime)
          setProgress(Math.round(engine.progress*100))
        }
      }
      engine.onEnd = () => {
        if (pair === activePairRef.current) setIsPlaying(false)
      }

      pairState.current[pair] = { engine, ready:true, positions:[], trades:[] }
      updateChart(pair, engine, true)

      if (pair === activePairRef.current) {
        setDataReady(true)
        setCurrentTime(engine.currentTime)
        setProgress(Math.round(engine.progress*100))
        const agg = engine.getAggregated(pairTfRef.current[pair]||'H1')
        setCurrentPrice(agg.slice(-1)[0]?.close ?? null)
      }
      setTick(t => t+1)
    } catch(e) { console.error('loadPair', pair, e) }
  }, [])

  // ── activePair ref (for use inside callbacks) ───────────────────────────────

  const activePairRef = useRef(null)
  useEffect(() => { activePairRef.current = activePair }, [activePair])

  // ── Mount chart via useEffect (stable, no ref callback re-fire) ────────────

  // mountPair: stable function stored in ref so JSX ref callback never changes
  const mountPairRef = useRef(null)
  mountPairRef.current = async (pair, el) => {
    if (chartMap.current[pair]) return
    const lc = await import('lightweight-charts')
    if (chartMap.current[pair]) return
    const chart  = lc.createChart(el, chartOpts(el.clientWidth, el.clientHeight))
    const series = chart.addSeries(lc.CandlestickSeries, {
      upColor:'#2962FF', downColor:'#ef5350', borderVisible:false,
      wickUpColor:'#2962FF', wickDownColor:'#ef5350',
    })
    chartMap.current[pair] = { chart, series, prevCount:0 }
    new ResizeObserver(entries => {
      const {width,height} = entries[0].contentRect
      if (chartMap.current[pair]) chart.resize(width, height)
    }).observe(el)
    loadPair(pair)
  }
  const mountPair = useCallback((pair, el) => {
    mountPairRef.current(pair, el)
  }, [])

  // ── Render chart ────────────────────────────────────────────────────────────

  const updateChart = useCallback((pair, engine, full) => {
    const cr = chartMap.current[pair]
    if (!cr || !engine) return
    const tf  = pairTfRef.current[pair] || 'H1'
    const agg = engine.getAggregated(tf)
    if (!agg.length) return

    const prev = cr.prevCount, curr = agg.length
    if (full || (curr !== prev && curr !== prev+1)) {
      cr.series.setData(agg)
      cr.chart.timeScale().scrollToPosition(5, false)
    } else {
      cr.series.update(agg[agg.length-1])
      cr.chart.timeScale().scrollToPosition(5, false)
    }
    cr.prevCount = curr

    if (pair === activePairRef.current) {
      setCurrentPrice(agg[agg.length-1].close)
    }
  }, [])

  // Re-render on TF change
  useEffect(() => {
    pairTfRef.current = pairTf
    if (activePair) {
      const ps = pairState.current[activePair]
      const cr = chartMap.current[activePair]
      if (ps?.engine && cr) { cr.prevCount = 0; updateChart(activePair, ps.engine, true) }
    }
  }, [pairTf, activePair, updateChart])

  // ── Sync UI when switching pair tabs ────────────────────────────────────────

  useEffect(() => {
    if (!activePair) return
    const ps = pairState.current[activePair]
    if (ps?.engine) {
      setIsPlaying(ps.engine.isPlaying)
      setCurrentTime(ps.engine.currentTime)
      setProgress(Math.round(ps.engine.progress*100))
      const agg = ps.engine.getAggregated(pairTfRef.current[activePair]||'H1')
      setCurrentPrice(agg.slice(-1)[0]?.close ?? null)
      setDataReady(true)
    } else {
      setDataReady(false)
      if (sessionRef.current) loadPair(activePair)
    }
    setTick(t => t+1)
  }, [activePair, loadPair])

  // Trigger load when session arrives
  useEffect(() => {
    if (session && activePair) loadPair(activePair)
  }, [session, activePair, loadPair])

  // ── Replay controls ──────────────────────────────────────────────────────────

  const eng = () => pairState.current[activePair]?.engine

  const handlePlayPause = useCallback(() => {
    const e = eng(); if (!e) return
    if (e.isPlaying) { e.pause(); setIsPlaying(false) }
    else             { e.play();  setIsPlaying(true)  }
  }, [activePair])

  const handleStep = useCallback(() => {
    const e = eng(); if (!e || e.isPlaying) return
    e.nextCandle(1)
    const cr = chartMap.current[activePair]
    if (cr) cr.prevCount = 0
    updateChart(activePair, e, true)
    setCurrentTime(e.currentTime)
    setProgress(Math.round(e.progress*100))
  }, [activePair, updateChart])

  const handleSpeed = useCallback((v) => {
    speedRef.current = v; setSpeed(v)
    Object.values(pairState.current).forEach(ps => ps?.engine?.setSpeed(v))
  }, [])

  // ── Trading ──────────────────────────────────────────────────────────────────

  const tpPips = slPips * rr

  const openPosition = useCallback((side) => {
    if (!currentPrice || !activePair) return
    const ps = pairState.current[activePair]; if (!ps) return
    const mult  = pipMult(activePair)
    const pipSz = 1/mult
    const sl = side==='BUY' ? currentPrice - slPips*pipSz : currentPrice + slPips*pipSz
    const tp = side==='BUY' ? currentPrice + tpPips*pipSz : currentPrice - tpPips*pipSz
    ps.positions = [...ps.positions, { id:`${Date.now()}`, pair:activePair, side, entry:currentPrice, sl, tp, lots, slPips, tpPips, rr, openTime:currentTime }]
    setLastTrade(side); setTimeout(()=>setLastTrade(null),700)
    setTick(t=>t+1)
  }, [currentPrice, activePair, lots, slPips, tpPips, rr, currentTime])

  const closePosition = useCallback(async (posId, reason='MANUAL') => {
    const ps = pairState.current[activePair]; if (!ps || !currentPrice) return
    const pos = ps.positions.find(p=>p.id===posId); if (!pos) return
    const pnl    = calcPnl(pos.side, pos.entry, currentPrice, pos.lots, activePair)
    const result = pnl>0?'WIN':pnl<0?'LOSS':'BREAKEVEN'
    const rrReal = pos.slPips>0 ? pnl/(pos.slPips*pos.lots*10) : 0
    const trade  = { ...pos, exit:currentPrice, closeTime:currentTime, pnl, result, rrReal:parseFloat(rrReal.toFixed(2)), reason }
    ps.positions = ps.positions.filter(p=>p.id!==posId)
    ps.trades    = [...ps.trades, trade]
    setBalance(b=>b+pnl)
    setTick(t=>t+1)
    if (userIdRef.current) {
      try {
        await supabase.from('sim_trades').insert({
          user_id:id, session_id:id, pair:pos.pair, side:pos.side, lots:pos.lots,
          entry_price:pos.entry, exit_price:currentPrice, sl:pos.sl, tp:pos.tp,
          sl_pips:pos.slPips, tp_pips:pos.tpPips, rr:pos.rr, rr_real:trade.rrReal,
          pnl, result, exit_reason:reason,
          opened_at: pos.openTime ? new Date(pos.openTime*1000).toISOString() : null,
          closed_at: currentTime  ? new Date(currentTime*1000).toISOString()  : null,
        })
      } catch(e) { console.error('save trade', e) }
    }
  }, [activePair, currentPrice, currentTime, id])

  const checkSLTP = useCallback((pair, engine) => {
    const ps = pairState.current[pair]; if (!ps?.positions?.length) return
    const agg   = engine.getAggregated(pairTfRef.current[pair]||'H1')
    const price = agg.slice(-1)[0]?.close; if (!price) return
    ps.positions.forEach(pos => {
      const hitTp = pos.side==='BUY' ? price>=pos.tp : price<=pos.tp
      const hitSl = pos.side==='BUY' ? price<=pos.sl : price>=pos.sl
      if (hitTp) closePosition(pos.id,'TP')
      else if (hitSl) closePosition(pos.id,'SL')
    })
  }, [closePosition])

  // ── Multi-pair tabs ───────────────────────────────────────────────────────────

  const addPair = useCallback((pair) => {
    setAddingPair(false)
    if (activePairs.includes(pair)) { setActivePair(pair); return }
    const newTf = { ...pairTfRef.current, [pair]:'H1' }
    pairTfRef.current = newTf
    setPairTf(newTf)
    setActivePairs(prev => [...prev, pair])
    setActivePair(pair)
  }, [activePairs])

  const removePair = useCallback((pair) => {
    if (activePairs.length===1) return
    const cr = chartMap.current[pair]
    if (cr) { try { cr.chart.remove() } catch{} ; delete chartMap.current[pair] }
    delete pairState.current[pair]
    const next = activePairs.filter(p=>p!==pair)
    setActivePairs(next)
    if (activePair===pair) setActivePair(next[0])
  }, [activePairs, activePair])

  // ── Keyboard ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    const onKey = e => {
      if (e.target.tagName==='INPUT') return
      if (e.code==='Space')      { e.preventDefault(); handlePlayPause() }
      if (e.code==='ArrowRight') handleStep()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handlePlayPause, handleStep])

  // ── Cleanup ───────────────────────────────────────────────────────────────────

  useEffect(() => () => {
    Object.values(pairState.current).forEach(ps => ps?.engine?.pause())
    Object.values(chartMap.current).forEach(cr => { try { cr.chart.remove() } catch{} })
  }, [])

  // ── Computed ──────────────────────────────────────────────────────────────────

  const activePs       = pairState.current[activePair]
  const openPositions  = activePs?.positions ?? []
  const allTrades      = Object.values(pairState.current).flatMap(ps=>ps?.trades??[])
  const unrealized     = openPositions.reduce((s,p)=>s+calcPnl(p.side,p.entry,currentPrice??p.entry,p.lots,activePair),0)
  const realized       = allTrades.reduce((s,t)=>s+(t.pnl??0),0)
  const activeTf       = pairTf[activePair] || 'H1'

  // ── Loading ───────────────────────────────────────────────────────────────────

  if (loading) return <div style={s.splash}><Spin/></div>

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div style={s.root}>

      {/* TOP BAR */}
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
          {activePairs.map(pair => (
            <div key={pair} style={{...s.tab, ...(pair===activePair?s.tabActive:{})}}>
              <span style={s.tabLabel} onClick={()=>setActivePair(pair)}>
                {pair}
                {(pairState.current[pair]?.positions?.length>0) && <span style={s.tabDot}/>}
              </span>
              {activePairs.length>1 && (
                <button style={s.tabClose} onClick={()=>removePair(pair)}>✕</button>
              )}
            </div>
          ))}
          <div style={{position:'relative'}}>
            <button style={s.addBtn} onClick={()=>setAddingPair(v=>!v)}>＋</button>
            {addingPair && (
              <div style={s.dropdown}>
                {ALL_PAIRS.filter(p=>!activePairs.includes(p)).map(p=>(
                  <button key={p} style={s.ddItem} onClick={()=>addPair(p)}>{p}</button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* STATS */}
        <div style={s.stats}>
          <Pill label="BALANCE"   val={`$${balance.toFixed(2)}`}  color="#fff"/>
          <Pill label="REALIZADO" val={fmtPnl(realized)}           color={pnlColor(realized)}/>
          <Pill label="FLOTANTE"  val={fmtPnl(unrealized)}         color={pnlColor(unrealized)}/>
          <Pill label="TRADES"    val={allTrades.length}            color="#B2B5BE"/>
        </div>
      </div>

      {/* TF BAR */}
      <div style={s.tfBar}>
        {TF_LIST.map(tf=>(
          <button key={tf}
            style={{...s.tfBtn,...(activeTf===tf?s.tfActive:{})}}
            onClick={()=>{
              const nxt={...pairTfRef.current,[activePair]:tf}
              pairTfRef.current=nxt; setPairTf(nxt)
            }}
          >{tf}</button>
        ))}
        <div style={{flex:1}}/>
        {currentTime  && <span style={s.tsBadge}>{fmtTs(currentTime)}</span>}
        {currentPrice && <span style={s.pxBadge}>{fmtPx(currentPrice,activePair)}</span>}
      </div>

      {/* CHARTS — one div per pair, show/hide */}
      <div style={s.chartWrap}>
        {activePairs.map(pair=>(
          <div
            key={pair}
            ref={el=>{
              if(el && !chartMap.current[pair]) {
                divMap.current[pair]=el
                mountPair(pair,el)
              }
            }}
            style={{...s.chart, display:pair===activePair?'block':'none'}}
          />
        ))}
        {!dataReady && (
          <div style={s.overlay}>
            <Spin/>
            <span style={s.overlayTxt}>Cargando {activePair}…</span>
          </div>
        )}
      </div>

      {/* BOTTOM BAR */}
      <div style={s.btmBar}>
        {/* Replay */}
        <div style={s.replayRow}>
          <button
            style={{...s.ctrlBtn,...s.playBtn,...(isPlaying?s.pauseBtn:{})}}
            onClick={handlePlayPause} disabled={!dataReady}
          >
            {isPlaying
              ? <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
              : <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
            }
          </button>
          <button style={s.ctrlBtn} onClick={handleStep} disabled={!dataReady} title="+1 M1 (→)">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polygon points="5,4 15,12 5,20"/><line x1="19" y1="5" x2="19" y2="19"/>
            </svg>
          </button>
          <div style={s.speedRow}>
            {SPEED_OPTS.map(o=>(
              <button key={o.v} style={{...s.speedBtn,...(speed===o.v?s.speedActive:{})}} onClick={()=>handleSpeed(o.v)}>{o.l}</button>
            ))}
          </div>
        </div>

        {/* Progress */}
        <div style={s.progWrap}>
          <div style={s.progTrack}><div style={{...s.progFill,width:`${progress}%`}}/></div>
          <span style={s.progLabel}>{progress}%</span>
        </div>

        {/* Trade panel */}
        <div style={s.tradeRow}>
          <div style={s.paramCol}>
            <span style={s.paramLbl}>LOTS</span>
            <div style={s.presetRow}>
              {LOT_PRESETS.map(l=>(
                <button key={l} style={{...s.preset,...(lots===l?s.presetOn:{})}} onClick={()=>setLots(l)}>{l}</button>
              ))}
              <input style={s.numIn} type="number" step="0.01" min="0.01" value={lots}
                onChange={e=>setLots(Math.max(0.01,parseFloat(e.target.value)||0.01))}/>
            </div>
          </div>
          <div style={s.paramCol}>
            <span style={s.paramLbl}>SL pips</span>
            <div style={s.presetRow}>
              {[10,20,30,50].map(p=>(
                <button key={p} style={{...s.preset,...(slPips===p?s.presetOn:{})}} onClick={()=>setSlPips(p)}>{p}</button>
              ))}
              <input style={s.numIn} type="number" step="1" min="1" value={slPips}
                onChange={e=>setSlPips(Math.max(1,parseInt(e.target.value)||1))}/>
            </div>
          </div>
          <div style={s.paramCol}>
            <span style={s.paramLbl}>R:R</span>
            <div style={s.presetRow}>
              {RR_PRESETS.map(r=>(
                <button key={r} style={{...s.preset,...(rr===r?s.presetOn:{})}} onClick={()=>setRr(r)}>{r}</button>
              ))}
            </div>
          </div>
          <div style={s.rrHint}>
            <span style={s.paramLbl}>TP</span>
            <span style={{fontSize:10,color:'#1E90FF',fontWeight:700}}>{tpPips}p</span>
          </div>
          <button style={{...s.tradeBtn,background:'#2962FF',...(lastTrade==='BUY'?s.flash:{})}}
            onClick={()=>openPosition('BUY')} disabled={!dataReady||!currentPrice}>
            ▲ BUY
            {currentPrice&&<span style={s.tradePx}>{fmtPx(currentPrice,activePair)}</span>}
          </button>
          <button style={{...s.tradeBtn,background:'#ef5350',...(lastTrade==='SELL'?s.flash:{})}}
            onClick={()=>openPosition('SELL')} disabled={!dataReady||!currentPrice}>
            ▼ SELL
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
          <table style={s.tbl}>
            <thead><tr style={s.tblHdr}>{['PAR','DIR','ENTRADA','ACTUAL','SL','TP','LOTS','P&L',''].map(h=><th key={h} style={s.th}>{h}</th>)}</tr></thead>
            <tbody>
              {openPositions.map(pos=>{
                const pnl = calcPnl(pos.side,pos.entry,currentPrice??pos.entry,pos.lots,activePair)
                return (
                  <tr key={pos.id} style={s.tblRow}>
                    <td style={s.td}>{pos.pair}</td>
                    <td style={{...s.td,color:pos.side==='BUY'?'#2962FF':'#ef5350',fontWeight:800}}>{pos.side}</td>
                    <td style={s.td}>{fmtPx(pos.entry,pos.pair)}</td>
                    <td style={s.td}>{fmtPx(currentPrice,pos.pair)}</td>
                    <td style={{...s.td,color:'#ef535088'}}>{fmtPx(pos.sl,pos.pair)}</td>
                    <td style={{...s.td,color:'#2962FF88'}}>{fmtPx(pos.tp,pos.pair)}</td>
                    <td style={s.td}>{pos.lots}</td>
                    <td style={{...s.td,color:pnlColor(pnl),fontWeight:700}}>{fmtPnl(pnl)}</td>
                    <td style={s.td}><button style={s.closeBtn} onClick={()=>closePosition(pos.id)}>✕</button></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* TRADES JOURNAL */}
      {showTrades&&allTrades.length>0&&(
        <div style={s.panel}>
          <div style={s.panelHdr}>
            <span style={s.panelTitle}>JOURNAL</span>
            <button style={s.iconBtn} onClick={()=>setShowTrades(false)}>✕</button>
          </div>
          <table style={s.tbl}>
            <thead><tr style={s.tblHdr}>{['PAR','DIR','ENTRY','EXIT','LOTS','SL','TP','R:R','P&L','RESULTADO','RAZÓN'].map(h=><th key={h} style={s.th}>{h}</th>)}</tr></thead>
            <tbody>
              {allTrades.map((t,i)=>(
                <tr key={i} style={s.tblRow}>
                  <td style={s.td}>{t.pair}</td>
                  <td style={{...s.td,color:t.side==='BUY'?'#2962FF':'#ef5350',fontWeight:800}}>{t.side}</td>
                  <td style={s.td}>{fmtPx(t.entry,t.pair)}</td>
                  <td style={s.td}>{fmtPx(t.exit,t.pair)}</td>
                  <td style={s.td}>{t.lots}</td>
                  <td style={s.td}>{t.slPips}</td>
                  <td style={s.td}>{t.tpPips}</td>
                  <td style={s.td}>{t.rrReal}R</td>
                  <td style={{...s.td,color:pnlColor(t.pnl),fontWeight:700}}>{fmtPnl(t.pnl)}</td>
                  <td style={{...s.td,color:t.result==='WIN'?'#2962FF':t.result==='LOSS'?'#ef5350':'#B2B5BE',fontWeight:700}}>{t.result}</td>
                  <td style={{...s.td,color:'#3d4455'}}>{t.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <style>{css}</style>
    </div>
  )
}

function Pill({label,val,color}){
  return <div style={s.pill}><span style={s.pillLbl}>{label}</span><span style={{...s.pillVal,color}}>{val}</span></div>
}
function Spin(){
  return <><div className="sp"/><style>{`.sp{width:22px;height:22px;border:2px solid #111;border-top-color:#1E90FF;border-radius:50%;animation:sp .6s linear infinite}@keyframes sp{to{transform:rotate(360deg)}}`}</style></>
}

const s = {
  root:       {display:'flex',flexDirection:'column',height:'100vh',background:'#000',fontFamily:"'Montserrat',sans-serif",overflow:'hidden',color:'#B2B5BE'},
  splash:     {display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',background:'#000'},
  topBar:     {height:40,background:'#070a0f',borderBottom:'1px solid #141820',display:'flex',alignItems:'center',padding:'0 8px',gap:8,flexShrink:0},
  topLeft:    {display:'flex',alignItems:'center',gap:8,flexShrink:0},
  vDiv:       {width:1,height:18,background:'#1a1e27'},
  sessName:   {fontSize:10,fontWeight:800,color:'#fff',letterSpacing:0.4},
  sessDates:  {fontSize:8,color:'#2d3548',letterSpacing:0.2},
  tabRow:     {display:'flex',alignItems:'center',gap:3,flex:1,overflow:'hidden'},
  tab:        {display:'flex',alignItems:'center',gap:4,padding:'3px 8px',borderRadius:'3px 3px 0 0',border:'1px solid #1a1e27',borderBottom:'none',background:'#0a0d13',flexShrink:0},
  tabActive:  {background:'#111418',borderColor:'#1E90FF55'},
  tabLabel:   {fontSize:10,fontWeight:700,color:'#B2B5BE',letterSpacing:0.3,cursor:'pointer',display:'flex',alignItems:'center',gap:4},
  tabDot:     {width:5,height:5,borderRadius:'50%',background:'#1E90FF',display:'inline-block'},
  tabClose:   {background:'none',border:'none',color:'#3d4455',cursor:'pointer',fontSize:9,padding:'0 1px',fontFamily:"'Montserrat',sans-serif"},
  addBtn:     {background:'#0a0d13',border:'1px solid #1a1e27',color:'#3d4455',width:22,height:22,borderRadius:3,cursor:'pointer',fontSize:14,display:'flex',alignItems:'center',justifyContent:'center',fontFamily:"'Montserrat',sans-serif"},
  dropdown:   {position:'absolute',top:26,left:0,background:'#0d1017',border:'1px solid #1a1e27',borderRadius:4,zIndex:200,minWidth:110,padding:'4px 0',boxShadow:'0 8px 24px #00000099'},
  ddItem:     {display:'block',width:'100%',background:'none',border:'none',color:'#B2B5BE',fontSize:10,fontWeight:700,padding:'6px 12px',cursor:'pointer',textAlign:'left',fontFamily:"'Montserrat',sans-serif"},
  stats:      {display:'flex',alignItems:'center',flexShrink:0},
  pill:       {display:'flex',flexDirection:'column',gap:0,padding:'0 8px',borderLeft:'1px solid #1a1e27'},
  pillLbl:    {fontSize:7,fontWeight:700,color:'#2d3548',letterSpacing:1},
  pillVal:    {fontSize:10,fontWeight:800},
  tfBar:      {height:28,background:'#070a0f',borderBottom:'1px solid #141820',display:'flex',alignItems:'center',padding:'0 8px',gap:2,flexShrink:0},
  tfBtn:      {background:'none',border:'none',color:'#3d4455',fontSize:10,fontWeight:700,padding:'3px 7px',borderRadius:3,cursor:'pointer',fontFamily:"'Montserrat',sans-serif"},
  tfActive:   {background:'#1E90FF18',color:'#1E90FF'},
  tsBadge:    {fontSize:9,color:'#3d4455',fontWeight:600,padding:'2px 8px',background:'#0d1017',borderRadius:3,border:'1px solid #1a1e27'},
  pxBadge:    {fontSize:11,color:'#1E90FF',fontWeight:800,padding:'2px 8px',background:'#1E90FF10',borderRadius:3,border:'1px solid #1E90FF30',marginLeft:4},
  chartWrap:  {flex:1,position:'relative',overflow:'hidden'},
  chart:      {width:'100%',height:'100%'},
  overlay:    {position:'absolute',inset:0,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:10,background:'#000000BB',zIndex:10},
  overlayTxt: {fontSize:10,color:'#3d4455',fontWeight:700},
  btmBar:     {height:52,background:'#070a0f',borderTop:'1px solid #141820',display:'flex',alignItems:'center',padding:'0 8px',gap:10,flexShrink:0},
  replayRow:  {display:'flex',alignItems:'center',gap:4,flexShrink:0},
  ctrlBtn:    {background:'#0d1017',border:'1px solid #1a1e27',color:'#B2B5BE',width:25,height:25,borderRadius:4,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'},
  playBtn:    {background:'#1E90FF',border:'none',color:'#fff',width:30,height:30,borderRadius:'50%'},
  pauseBtn:   {background:'#1E90FFAA'},
  speedRow:   {display:'flex',gap:1,marginLeft:3},
  speedBtn:   {background:'none',border:'none',color:'#2d3548',fontSize:9,fontWeight:700,padding:'3px 5px',cursor:'pointer',borderRadius:3,fontFamily:"'Montserrat',sans-serif"},
  speedActive:{background:'#1E90FF18',color:'#1E90FF'},
  progWrap:   {flex:1,display:'flex',alignItems:'center',gap:6,minWidth:60},
  progTrack:  {flex:1,height:3,background:'#1a1e27',borderRadius:2,overflow:'hidden'},
  progFill:   {height:'100%',background:'#1E90FF',borderRadius:2,transition:'width .3s linear'},
  progLabel:  {fontSize:8,color:'#2d3548',fontWeight:700,width:28,textAlign:'right',flexShrink:0},
  tradeRow:   {display:'flex',alignItems:'center',gap:8,flexShrink:0},
  paramCol:   {display:'flex',flexDirection:'column',gap:2},
  paramLbl:   {fontSize:7,fontWeight:700,color:'#2d3548',letterSpacing:1},
  presetRow:  {display:'flex',gap:2,alignItems:'center'},
  preset:     {background:'none',border:'1px solid #1a1e27',color:'#3d4455',fontSize:9,fontWeight:700,padding:'2px 4px',borderRadius:3,cursor:'pointer',fontFamily:"'Montserrat',sans-serif"},
  presetOn:   {background:'#1E90FF14',borderColor:'#1E90FF44',color:'#1E90FF'},
  numIn:      {background:'#0d1017',border:'1px solid #1a1e27',color:'#fff',width:46,height:22,textAlign:'center',fontSize:10,fontWeight:700,borderRadius:3,outline:'none',fontFamily:"'Montserrat',sans-serif"},
  rrHint:     {display:'flex',flexDirection:'column',gap:2,alignItems:'center'},
  tradeBtn:   {border:'none',color:'#fff',borderRadius:4,padding:'5px 11px',fontSize:10,fontWeight:800,cursor:'pointer',display:'flex',flexDirection:'column',alignItems:'center',gap:1,fontFamily:"'Montserrat',sans-serif",lineHeight:1},
  tradePx:    {fontSize:7,fontWeight:600,opacity:0.7},
  flash:      {transform:'scale(0.92)',opacity:0.75},
  toggleRow:  {display:'flex',gap:4},
  togBtn:     {background:'#0d1017',border:'1px solid #1a1e27',color:'#B2B5BE',borderRadius:4,padding:'4px 8px',fontSize:9,fontWeight:700,cursor:'pointer',fontFamily:"'Montserrat',sans-serif",whiteSpace:'nowrap'},
  togOn:      {background:'#1E90FF14',borderColor:'#1E90FF44',color:'#1E90FF'},
  panel:      {position:'fixed',bottom:52,left:0,right:0,background:'#070a0f',borderTop:'1px solid #1a1e27',zIndex:100,maxHeight:260,overflowY:'auto'},
  panelHdr:   {display:'flex',alignItems:'center',justifyContent:'space-between',padding:'6px 12px',borderBottom:'1px solid #141820',position:'sticky',top:0,background:'#070a0f'},
  panelTitle: {fontSize:9,fontWeight:800,color:'#fff',letterSpacing:1.2},
  dangerBtn:  {background:'#ef535012',border:'1px solid #ef535040',color:'#ef5350',borderRadius:3,padding:'2px 9px',fontSize:9,fontWeight:700,cursor:'pointer',fontFamily:"'Montserrat',sans-serif"},
  tbl:        {width:'100%',borderCollapse:'collapse',fontSize:10},
  tblHdr:     {borderBottom:'1px solid #141820'},
  tblRow:     {borderBottom:'1px solid #0a0d13'},
  th:         {padding:'4px 10px',textAlign:'left',color:'#2d3548',fontWeight:700,fontSize:8,letterSpacing:0.8,whiteSpace:'nowrap'},
  td:         {padding:'6px 10px',color:'#B2B5BE',whiteSpace:'nowrap'},
  closeBtn:   {background:'none',border:'none',color:'#3d4455',cursor:'pointer',fontSize:11,padding:'0 2px',fontFamily:"'Montserrat',sans-serif"},
  iconBtn:    {background:'none',border:'none',color:'#3d4455',cursor:'pointer',display:'flex',alignItems:'center',padding:3,borderRadius:3,fontFamily:"'Montserrat',sans-serif"},
}

const css = `
  *{box-sizing:border-box;margin:0;padding:0}
  body{overflow:hidden;background:#000}
  input[type=number]::-webkit-inner-spin-button,
  input[type=number]::-webkit-outer-spin-button{opacity:0}
  button:not(:disabled):hover{opacity:0.82}
  button:disabled{opacity:0.3;cursor:not-allowed!important}
`
