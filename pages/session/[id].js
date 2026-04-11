/**
 * pages/session/[id].js  — v3
 * Forex Simulator · Algorithmic Suite · R.A.M.M.FX TRADING™
 *
 * Arquitectura:
 *  - Multi-par: cada par tiene Engine + Chart + Posiciones propias
 *  - currentTime como source of truth (via ReplayEngine v2)
 *  - SL / TP con R:R automático
 *  - Trades guardados en sim_trades (Supabase)
 *  - Equity line en tiempo real
 *  - Layout fullscreen tipo TradingView
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/router'
import { createChart, CrosshairMode, LineStyle } from 'lightweight-charts'
import { supabase } from '../../lib/supabase'
import ReplayEngine, { TIMEFRAMES } from '../../lib/replayEngine'

// ─── Constants ───────────────────────────────────────────────────────────────

const TF_LIST     = ['M1','M5','M15','M30','H1','H4','D1']
const LOT_PRESETS = [0.01, 0.05, 0.1, 0.25, 0.5, 1.0]
const RR_PRESETS  = [1, 1.5, 2, 3]
const SPEED_OPTS  = [
  { label:'1×',   value:1   },
  { label:'5×',   value:5   },
  { label:'15×',  value:15  },
  { label:'60×',  value:60  },
  { label:'∞',    value:500 },
]

// Pairs available in this simulator
const AVAILABLE_PAIRS = [
  'EUR/USD','GBP/USD','USD/JPY','USD/CHF',
  'AUD/USD','USD/CAD','EUR/GBP','EUR/JPY','GBP/JPY',
]

// ─── Chart factory ────────────────────────────────────────────────────────────

function makeChartOptions(w, h) {
  return {
    width: w, height: h,
    layout: {
      background: { color: '#000000' },
      textColor:  '#B2B5BE',
      fontFamily: "'Montserrat', sans-serif",
      fontSize:   11,
    },
    grid: {
      vertLines: { color: '#0d1017' },
      horzLines: { color: '#0d1017' },
    },
    crosshair: {
      mode: CrosshairMode.Normal,
      vertLine: { color: '#1E90FF44', labelBackgroundColor: '#1E90FF' },
      horzLine: { color: '#1E90FF44', labelBackgroundColor: '#1E90FF' },
    },
    rightPriceScale: {
      borderColor: '#1a1e27',
      scaleMargins: { top: 0.06, bottom: 0.06 },
    },
    timeScale: {
      borderColor:  '#1a1e27',
      timeVisible:  true,
      secondsVisible: false,
      rightOffset:  12,
      barSpacing:   8,
      fixLeftEdge:  true,
      lockVisibleTimeRangeOnResize: true,
    },
    handleScroll: { mouseWheel: true, pressedMouseMove: true },
    handleScale:  { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const isJpy  = (pair) => pair?.includes('JPY')
const pipMult = (pair) => isJpy(pair) ? 100 : 10000
const pipValue = (lots) => lots * 10   // USD per pip per lot (standard)

function calcPnl(side, entry, exit, lots, pair) {
  const mult = pipMult(pair)
  const pips = side === 'BUY' ? (exit - entry) * mult : (entry - exit) * mult
  return pips * pipValue(lots)
}

function fmtPrice(price, pair) {
  return price?.toFixed(isJpy(pair) ? 3 : 5) ?? '—'
}

function fmtPnl(v) {
  return (v >= 0 ? '+' : '') + v.toFixed(2)
}

function fmtTs(ts) {
  if (!ts) return '—'
  return new Date(ts * 1000).toLocaleString('es-ES', {
    month: 'short', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

function pnlColor(v) {
  return v > 0 ? '#1E90FF' : v < 0 ? '#ef5350' : '#B2B5BE'
}

// ─── Main Component ───────────────────────────────────────────────────────────

export const getServerSideProps = () => ({ props: {} })

export default function SessionPage() {
  const router = useRouter()
  const { id } = router.query

  // ── Session / auth ──────────────────────────────────────────────────────
  const [session,   setSession]   = useState(null)
  const [loading,   setLoading]   = useState(true)
  const [userId,    setUserId]    = useState(null)

  // ── Multi-pair state ────────────────────────────────────────────────────
  // activePairs: array of pair strings currently open as tabs
  const [activePairs,  setActivePairs]  = useState([])    // populated from session
  const [activePair,   setActivePair]   = useState(null)  // currently visible tab
  const [addingPair,   setAddingPair]   = useState(false) // dropdown open

  // Per-pair data: Map<pair, { engine, candles, ready, tf, positions, closedTrades }>
  const pairStateRef = useRef({})  // mutable, not reactive
  const chartContainerRef = useRef(null)
  // Per-pair chart refs: Map<pair, { chart, series, prevCount }>
  const chartRefsMap = useRef({})

  // ── Replay state (reflect active pair's engine) ─────────────────────────
  const [isPlaying,   setIsPlaying]   = useState(false)
  const [speed,       setSpeed]       = useState(1)
  const [progress,    setProgress]    = useState(0)
  const [currentTime, setCurrentTime] = useState(null)

  // Per-pair TF selection
  const [pairTf, setPairTf] = useState({})  // { 'EUR/USD': 'H1', ... }

  // ── Trading state (per active pair) ────────────────────────────────────
  const [balance,       setBalance]       = useState(10000)
  const [lots,          setLots]          = useState(0.01)
  const [rr,            setRr]            = useState(2)
  const [slPips,        setSlPips]        = useState(20)
  const [currentPrice,  setCurrentPrice]  = useState(null)

  // positions are stored in pairStateRef per pair, but we track a reactive count
  const [positionsTick, setPositionsTick] = useState(0) // increment to force re-render
  const [showPositions, setShowPositions] = useState(false)
  const [showTrades,    setShowTrades]    = useState(false)
  const [lastTrade,     setLastTrade]     = useState(null)

  // Equity
  const [equityHistory, setEquityHistory] = useState([])  // [{time, value}]
  const equitySeriesRef = useRef(null)  // equity line series on active chart

  // ── Auth + Session load ────────────────────────────────────────────────

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (!s) { router.replace('/'); return }
      setUserId(s.user.id)
    })
  }, [])

  useEffect(() => {
    if (!id) return
    supabase.from('sim_sessions').select('*').eq('id', id).single()
      .then(({ data }) => {
        if (!data) { setLoading(false); return }
        setSession(data)
        setBalance(parseFloat(data.balance))
        const primaryPair = data.pair || 'EUR/USD'
        const initTf = data.timeframe || 'H1'
        setActivePairs([primaryPair])
        setActivePair(primaryPair)
        setPairTf({ [primaryPair]: initTf })
        setLoading(false)
      })
  }, [id])

  // ── Chart lifecycle: mount/unmount on tab switch ───────────────────────

  // We keep ONE chart container div; when pair changes we destroy old chart
  // and create new one (or restore from map if already initialized)

  useEffect(() => {
    if (!activePair || !chartContainerRef.current) return

    const el = chartContainerRef.current

    // If chart already exists for this pair, just re-attach (nothing to do —
    // the div already holds the LWC canvas). But if not, create it.
    if (!chartRefsMap.current[activePair]) {
      const chart  = createChart(el, makeChartOptions(el.clientWidth, el.clientHeight))
      const series = chart.addCandlestickSeries({
        upColor:         '#1E90FF',
        downColor:       '#ef5350',
        borderUpColor:   '#1E90FF',
        borderDownColor: '#ef5350',
        wickUpColor:     '#1E90FFAA',
        wickDownColor:   '#ef5350AA',
      })
      const eqSeries = chart.addLineSeries({
        color:     '#1E90FF66',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        priceScaleId: 'equity',
        visible: false,  // hide until we have data
      })
      chartRefsMap.current[activePair] = { chart, series, eqSeries, prevCount: 0 }

      // Trigger data load for this pair
      loadPairData(activePair)
    } else {
      // Chart existed — just re-render with current engine state
      const ps = pairStateRef.current[activePair]
      if (ps?.engine) renderChart(activePair, ps.engine, true)
    }

    // ResizeObserver
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect
      const cr = chartRefsMap.current[activePair]
      if (cr) cr.chart.resize(width, height)
    })
    ro.observe(el)

    return () => {
      ro.disconnect()
      // Note: we do NOT destroy the chart on unmount here —
      // we preserve it so switching back to a tab is instant.
      // Charts are only destroyed when the pair tab is closed.
    }
  }, [activePair])

  // ── Data load ──────────────────────────────────────────────────────────

  const loadPairData = useCallback(async (pair) => {
    if (!session) return
    if (pairStateRef.current[pair]?.ready) return  // already loaded

    const cleanPair = pair.replace('/', '')
    const year      = session.date_from?.split('-')[0] || '2023'
    const fromTs    = session.date_from
      ? Math.floor(new Date(session.date_from).getTime() / 1000)
      : Math.floor(new Date('2023-01-01').getTime() / 1000)
    const toTs      = session.date_to
      ? Math.floor(new Date(session.date_to + 'T23:59:59').getTime() / 1000)
      : Math.floor(new Date('2023-12-31T23:59:59').getTime() / 1000)

    try {
      const res     = await fetch(`/api/candles?pair=${cleanPair}&timeframe=M1&from=${fromTs}&to=${toTs}&year=${year}`)
      const { candles } = await res.json()
      if (!candles?.length) return

      const engine = new ReplayEngine()
      engine.load(candles)
      engine.speed = speed

      engine.onTick = () => {
        if (activePair === pair) {
          setCurrentTime(engine.currentTime)
          setProgress(Math.round(engine.progress * 100))
          setIsPlaying(engine.isPlaying)
        }
        renderChart(pair, engine, false)
        updateFloatingPnl(pair, engine)
      }
      engine.onEnd = () => {
        if (activePair === pair) setIsPlaying(false)
      }

      pairStateRef.current[pair] = {
        engine,
        ready: true,
        positions: [],    // open positions for this pair
        closedTrades: [], // closed trades this session
      }

      // Initial render
      renderChart(pair, engine, true)

      if (activePair === pair) {
        setCurrentTime(engine.currentTime)
        setProgress(0)
        setCurrentPrice(engine.getAggregated(pairTf[pair] || 'H1').slice(-1)[0]?.close ?? null)
      }
      setPositionsTick(t => t + 1)

    } catch (err) {
      console.error('loadPairData', pair, err)
    }
  }, [session, activePair, speed, pairTf])

  // Reload when session arrives
  useEffect(() => {
    if (session && activePair) loadPairData(activePair)
  }, [session])

  // ── Chart render ───────────────────────────────────────────────────────

  const renderChart = useCallback((pair, engine, forceFullRedraw = false) => {
    const cr = chartRefsMap.current[pair]
    if (!cr || !engine) return

    const tf = pairTf[pair] || 'H1'
    const agg = engine.getAggregated(tf)
    if (!agg.length) return

    const prev = cr.prevCount
    const curr = agg.length

    if (forceFullRedraw || (curr !== prev && curr !== prev + 1)) {
      cr.series.setData(agg)
    } else {
      cr.series.update(agg[agg.length - 1])
    }
    cr.prevCount = curr

    // Update price for active pair
    if (pair === activePair) {
      setCurrentPrice(agg[agg.length - 1].close)
    }
  }, [pairTf, activePair])

  // Re-render on TF change
  useEffect(() => {
    if (activePair) {
      const ps = pairStateRef.current[activePair]
      if (ps?.engine) {
        const cr = chartRefsMap.current[activePair]
        if (cr) cr.prevCount = 0
        renderChart(activePair, ps.engine, true)
      }
    }
  }, [pairTf])

  // ── Replay controls ────────────────────────────────────────────────────

  const getEngine = () => pairStateRef.current[activePair]?.engine ?? null

  const handlePlayPause = useCallback(() => {
    const engine = getEngine()
    if (!engine) return
    if (engine.isPlaying) {
      engine.pause()
      setIsPlaying(false)
    } else {
      engine.play()
      setIsPlaying(true)
    }
  }, [activePair])

  const handleStep = useCallback((steps = 1) => {
    const engine = getEngine()
    if (!engine || engine.isPlaying) return
    engine.nextCandle(steps)
    const cr = chartRefsMap.current[activePair]
    if (cr) cr.prevCount = 0
    renderChart(activePair, engine, true)
    setCurrentTime(engine.currentTime)
    setProgress(Math.round(engine.progress * 100))
  }, [activePair, renderChart])

  const handleStepBack = useCallback(() => {
    const engine = getEngine()
    if (!engine) return
    const target = Math.max(engine.candles[0]?.time, engine.currentTime - 5 * 60)
    engine.seekToTime(target)
    const cr = chartRefsMap.current[activePair]
    if (cr) cr.prevCount = 0
    renderChart(activePair, engine, true)
    setCurrentTime(engine.currentTime)
    setProgress(Math.round(engine.progress * 100))
  }, [activePair, renderChart])

  const handleReset = useCallback(() => {
    const engine = getEngine()
    if (!engine) return
    engine.reset()
    setIsPlaying(false)
    const cr = chartRefsMap.current[activePair]
    if (cr) cr.prevCount = 0
    renderChart(activePair, engine, true)
    setCurrentTime(engine.currentTime)
    setProgress(0)
  }, [activePair, renderChart])

  const handleSpeedChange = useCallback((v) => {
    setSpeed(v)
    // Apply to ALL engines (synchronized replay)
    Object.values(pairStateRef.current).forEach(ps => {
      if (ps?.engine) ps.engine.setSpeed(v)
    })
  }, [])

  const handleScrub = useCallback((e) => {
    const engine = getEngine()
    if (!engine) return
    const fraction = parseFloat(e.target.value) / 100
    engine.pause()
    engine.seekToProgress(fraction)
    setIsPlaying(false)
    const cr = chartRefsMap.current[activePair]
    if (cr) cr.prevCount = 0
    renderChart(activePair, engine, true)
    setCurrentTime(engine.currentTime)
    setProgress(Math.round(engine.progress * 100))
  }, [activePair, renderChart])

  // ── Multi-pair tab management ──────────────────────────────────────────

  const addPair = useCallback((pair) => {
    if (activePairs.includes(pair)) {
      setActivePair(pair)
      setAddingPair(false)
      return
    }
    setActivePairs(prev => [...prev, pair])
    setPairTf(prev => ({ ...prev, [pair]: 'H1' }))
    setActivePair(pair)
    setAddingPair(false)
  }, [activePairs])

  const closePair = useCallback((pair) => {
    if (activePairs.length === 1) return  // always keep at least one
    const cr = chartRefsMap.current[pair]
    if (cr) { cr.chart.remove(); delete chartRefsMap.current[pair] }
    delete pairStateRef.current[pair]
    const next = activePairs.filter(p => p !== pair)
    setActivePairs(next)
    setActivePair(next[0])
  }, [activePairs])

  // When switching pair tabs, sync replay UI state
  useEffect(() => {
    if (!activePair) return
    const ps = pairStateRef.current[activePair]
    if (ps?.engine) {
      setIsPlaying(ps.engine.isPlaying)
      setCurrentTime(ps.engine.currentTime)
      setProgress(Math.round(ps.engine.progress * 100))
      const tf = pairTf[activePair] || 'H1'
      const agg = ps.engine.getAggregated(tf)
      setCurrentPrice(agg.slice(-1)[0]?.close ?? null)
    } else if (session) {
      loadPairData(activePair)
    }
    setPositionsTick(t => t + 1)
  }, [activePair])

  // ── Trading ────────────────────────────────────────────────────────────

  const tpPips = slPips * rr

  const openPosition = useCallback((side) => {
    if (!currentPrice || !activePair) return
    const ps = pairStateRef.current[activePair]
    if (!ps) return

    const mult   = pipMult(activePair)
    const pipSz  = 1 / mult
    const sl     = side === 'BUY'
      ? currentPrice - slPips * pipSz
      : currentPrice + slPips * pipSz
    const tp     = side === 'BUY'
      ? currentPrice + tpPips * pipSz
      : currentPrice - tpPips * pipSz

    const pos = {
      id:        `${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
      pair:      activePair,
      side,
      entry:     currentPrice,
      sl,
      tp,
      lots,
      slPips,
      tpPips,
      rr,
      openTime:  currentTime,
    }
    ps.positions = [...ps.positions, pos]
    setLastTrade(side)
    setTimeout(() => setLastTrade(null), 700)
    setPositionsTick(t => t + 1)
  }, [currentPrice, activePair, lots, rr, slPips, tpPips, currentTime])

  const closePosition = useCallback(async (posId, exitReason = 'MANUAL') => {
    const ps = pairStateRef.current[activePair]
    if (!ps || !currentPrice) return

    const pos = ps.positions.find(p => p.id === posId)
    if (!pos) return

    const pnl    = calcPnl(pos.side, pos.entry, currentPrice, pos.lots, activePair)
    const result = pnl > 0 ? 'WIN' : pnl < 0 ? 'LOSS' : 'BREAKEVEN'
    const rrReal = pos.slPips > 0 ? (pnl / (pos.slPips * pipValue(pos.lots))) : 0

    const trade = {
      ...pos,
      exit:       currentPrice,
      closeTime:  currentTime,
      pnl,
      result,
      rr_real:    parseFloat(rrReal.toFixed(2)),
      exitReason,
    }

    ps.positions    = ps.positions.filter(p => p.id !== posId)
    ps.closedTrades = [...ps.closedTrades, trade]

    setBalance(b => b + pnl)
    setEquityHistory(prev => [...prev, { time: currentTime, value: parseFloat((balance + pnl).toFixed(2)) }])
    setPositionsTick(t => t + 1)

    // Persist to Supabase
    if (userId) {
      try {
        await supabase.from('sim_trades').insert({
          user_id:     userId,
          session_id:  id,
          pair:        pos.pair,
          side:        pos.side,
          lots:        pos.lots,
          entry_price: pos.entry,
          exit_price:  currentPrice,
          sl:          pos.sl,
          tp:          pos.tp,
          sl_pips:     pos.slPips,
          tp_pips:     pos.tpPips,
          rr:          pos.rr,
          rr_real:     trade.rr_real,
          pnl:         pnl,
          result,
          opened_at:   pos.openTime ? new Date(pos.openTime * 1000).toISOString() : null,
          closed_at:   currentTime  ? new Date(currentTime  * 1000).toISOString() : null,
          exit_reason: exitReason,
        })
      } catch (err) {
        console.error('save trade', err)
      }
    }
  }, [activePair, currentPrice, currentTime, balance, userId, id])

  // Auto SL/TP check on every tick
  const updateFloatingPnl = useCallback((pair, engine) => {
    const ps = pairStateRef.current[pair]
    if (!ps?.positions?.length) return
    const tf  = pairTf[pair] || 'H1'
    const agg = engine.getAggregated(tf)
    const price = agg.slice(-1)[0]?.close
    if (!price) return

    // Check SL/TP hits (simplified: check against current close)
    ps.positions.forEach(pos => {
      const hitSl = pos.side === 'BUY' ? price <= pos.sl : price >= pos.sl
      const hitTp = pos.side === 'BUY' ? price >= pos.tp : price <= pos.tp
      if (hitTp) closePosition(pos.id, 'TP')
      else if (hitSl) closePosition(pos.id, 'SL')
    })
  }, [closePosition, pairTf])

  // ── Compute live unrealized P&L for active pair ────────────────────────

  const activePs         = pairStateRef.current[activePair]
  const openPositions    = activePs?.positions ?? []
  const closedTradesAll  = Object.values(pairStateRef.current)
    .flatMap(ps => ps?.closedTrades ?? [])
    .sort((a, b) => (a.closeTime ?? 0) - (b.closeTime ?? 0))

  const unrealizedPnl = openPositions.reduce((sum, pos) => {
    return sum + calcPnl(pos.side, pos.entry, currentPrice ?? pos.entry, pos.lots, activePair)
  }, 0)

  const realizedPnl = closedTradesAll.reduce((s, t) => s + (t.pnl ?? 0), 0)
  const dataReady   = !!(activePs?.ready)

  // ── SL pips setter with auto-TP hint ──────────────────────────────────

  const activeTf = pairTf[activePair] || 'H1'

  // ── Keyboard shortcuts ─────────────────────────────────────────────────

  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT') return
      if (e.code === 'Space') { e.preventDefault(); handlePlayPause() }
      if (e.code === 'ArrowRight') handleStep(1)
      if (e.code === 'ArrowLeft')  handleStepBack()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handlePlayPause, handleStep, handleStepBack])

  // ── Cleanup on unmount ────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      Object.values(pairStateRef.current).forEach(ps => ps?.engine?.pause())
      Object.values(chartRefsMap.current).forEach(cr => { try { cr.chart.remove() } catch {} })
    }
  }, [])

  // ── Loading ────────────────────────────────────────────────────────────

  if (loading) return (
    <div style={s.splash}><Spinner /></div>
  )

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div style={s.root}>

      {/* ── TOP BAR ─────────────────────────────────────────────────── */}
      <div style={s.topBar}>

        {/* Left: back + session name */}
        <div style={s.topLeft}>
          <button style={s.iconBtn} onClick={() => router.push('/dashboard')}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="15,18 9,12 15,6"/>
            </svg>
          </button>
          <div style={s.vDivider}/>
          <div style={s.sessionMeta}>
            <span style={s.sessionName}>{session?.name || 'Sesión'}</span>
            <span style={s.sessionDates}>{session?.date_from} → {session?.date_to}</span>
          </div>
        </div>

        {/* Center: pair tabs */}
        <div style={s.pairTabs}>
          {activePairs.map(pair => (
            <div key={pair} style={{ ...s.pairTab, ...(pair === activePair ? s.pairTabActive : {}) }}>
              <span style={s.pairTabLabel} onClick={() => setActivePair(pair)}>
                {pair}
                {(pairStateRef.current[pair]?.positions?.length > 0) && (
                  <span style={s.pairTabDot}/>
                )}
              </span>
              {activePairs.length > 1 && (
                <button style={s.pairTabClose} onClick={() => closePair(pair)}>✕</button>
              )}
            </div>
          ))}

          {/* Add pair button */}
          <div style={{ position:'relative' }}>
            <button style={s.addPairBtn} onClick={() => setAddingPair(v => !v)} title="Añadir par">
              +
            </button>
            {addingPair && (
              <div style={s.pairDropdown}>
                {AVAILABLE_PAIRS.filter(p => !activePairs.includes(p)).map(p => (
                  <button key={p} style={s.pairDropdownItem} onClick={() => addPair(p)}>{p}</button>
                ))}
                {AVAILABLE_PAIRS.filter(p => !activePairs.includes(p)).length === 0 && (
                  <span style={{ ...s.pairDropdownItem, color:'#3d4455', cursor:'default' }}>
                    Todos los pares abiertos
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right: stats pills */}
        <div style={s.statsRow}>
          <StatPill label="BALANCE"    value={`$${balance.toFixed(2)}`}  color="#fff"/>
          <StatPill label="REALIZADO"  value={fmtPnl(realizedPnl)}        color={pnlColor(realizedPnl)}/>
          <StatPill label="FLOTANTE"   value={fmtPnl(unrealizedPnl)}      color={pnlColor(unrealizedPnl)}/>
          <StatPill label="TRADES"     value={closedTradesAll.length}      color="#B2B5BE"/>
        </div>
      </div>

      {/* ── TF SWITCHER (below topbar, left aligned) ───────────────── */}
      <div style={s.tfBar}>
        {TF_LIST.map(tf => (
          <button key={tf}
            style={{ ...s.tfBtn, ...(activeTf === tf ? s.tfBtnActive : {}) }}
            onClick={() => setPairTf(prev => ({ ...prev, [activePair]: tf }))}
          >{tf}</button>
        ))}
        <div style={{ flex:1 }}/>
        {/* Timestamp badge */}
        {currentTime && (
          <span style={s.tsBadge}>{fmtTs(currentTime)}</span>
        )}
        {/* Price badge */}
        {currentPrice && (
          <span style={s.pxBadge}>{fmtPrice(currentPrice, activePair)}</span>
        )}
      </div>

      {/* ── CHART ──────────────────────────────────────────────────── */}
      <div style={s.chartWrap}>
        <div ref={chartContainerRef} style={s.chart}/>
        {!dataReady && (
          <div style={s.chartOverlay}>
            <Spinner />
            <span style={s.overlayText}>Cargando {activePair}…</span>
          </div>
        )}
      </div>

      {/* ── BOTTOM BAR ─────────────────────────────────────────────── */}
      <div style={s.bottomBar}>

        {/* Replay controls */}
        <div style={s.replayGroup}>
          <button style={s.ctrlBtn} onClick={handleReset} title="Reset (R)">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="1,4 1,10 7,10"/>
              <path d="M3.51,15a9,9 0 1,0,.49-4.5"/>
            </svg>
          </button>
          <button style={s.ctrlBtn} onClick={handleStepBack} title="−5 M1 (←)">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polygon points="19,20 9,12 19,4"/><line x1="5" y1="19" x2="5" y2="5"/>
            </svg>
          </button>
          <button
            style={{ ...s.ctrlBtn, ...s.playBtn, ...(isPlaying ? s.pauseStyle : {}) }}
            onClick={handlePlayPause}
            disabled={!dataReady}
            title="Play/Pause (Space)"
          >
            {isPlaying
              ? <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
              : <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
            }
          </button>
          <button style={s.ctrlBtn} onClick={() => handleStep(1)} title="+1 M1 (→)">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polygon points="5,4 15,12 5,20"/><line x1="19" y1="5" x2="19" y2="19"/>
            </svg>
          </button>

          {/* Speed */}
          <div style={s.speedRow}>
            {SPEED_OPTS.map(o => (
              <button key={o.value}
                style={{ ...s.speedBtn, ...(speed === o.value ? s.speedActive : {}) }}
                onClick={() => handleSpeedChange(o.value)}
              >{o.label}</button>
            ))}
          </div>
        </div>

        {/* Scrubber */}
        <div style={s.scrubWrap}>
          <input type="range" min={0} max={100} value={progress}
            onChange={handleScrub} style={s.scrubber} disabled={!dataReady}/>
          <span style={s.scrubLabel}>{progress}%</span>
        </div>

        {/* Trading panel */}
        <div style={s.tradeGroup}>

          {/* Lots */}
          <div style={s.paramCol}>
            <span style={s.paramLabel}>LOTS</span>
            <div style={s.presetRow}>
              {LOT_PRESETS.map(l => (
                <button key={l}
                  style={{ ...s.presetBtn, ...(lots === l ? s.presetActive : {}) }}
                  onClick={() => setLots(l)}
                >{l}</button>
              ))}
              <input style={s.numInput} type="number" step="0.01" min="0.01"
                value={lots} onChange={e => setLots(Math.max(0.01, parseFloat(e.target.value)||0.01))}/>
            </div>
          </div>

          {/* SL pips */}
          <div style={s.paramCol}>
            <span style={s.paramLabel}>SL (pips)</span>
            <div style={s.presetRow}>
              {[10,20,30,50].map(p => (
                <button key={p}
                  style={{ ...s.presetBtn, ...(slPips === p ? s.presetActive : {}) }}
                  onClick={() => setSlPips(p)}
                >{p}</button>
              ))}
              <input style={s.numInput} type="number" step="1" min="1"
                value={slPips} onChange={e => setSlPips(Math.max(1, parseInt(e.target.value)||1))}/>
            </div>
          </div>

          {/* R:R */}
          <div style={s.paramCol}>
            <span style={s.paramLabel}>R:R</span>
            <div style={s.presetRow}>
              {RR_PRESETS.map(r => (
                <button key={r}
                  style={{ ...s.presetBtn, ...(rr === r ? s.presetActive : {}) }}
                  onClick={() => setRr(r)}
                >{r}</button>
              ))}
            </div>
          </div>

          {/* TP hint */}
          <div style={s.rrHint}>
            <span style={s.paramLabel}>TP</span>
            <span style={{ fontSize:10, color:'#1E90FF', fontWeight:700 }}>{tpPips} pips</span>
          </div>

          {/* BUY / SELL */}
          <button
            style={{ ...s.tradeBtn, ...s.buyBtn, ...(lastTrade==='BUY' ? s.flashBtn : {}) }}
            onClick={() => openPosition('BUY')}
            disabled={!dataReady || !currentPrice}
          >
            <svg width="8" height="8" viewBox="0 0 24 24" fill="white"><polygon points="12,3 22,21 2,21"/></svg>
            BUY
            {currentPrice && <span style={s.tradePx}>{fmtPrice(currentPrice, activePair)}</span>}
          </button>
          <button
            style={{ ...s.tradeBtn, ...s.sellBtn, ...(lastTrade==='SELL' ? s.flashBtn : {}) }}
            onClick={() => openPosition('SELL')}
            disabled={!dataReady || !currentPrice}
          >
            <svg width="8" height="8" viewBox="0 0 24 24" fill="white"><polygon points="12,21 22,3 2,3"/></svg>
            SELL
            {currentPrice && <span style={s.tradePx}>{fmtPrice(currentPrice, activePair)}</span>}
          </button>

          {/* Positions / Trades toggles */}
          <div style={s.toggleGroup}>
            {openPositions.length > 0 && (
              <button style={{ ...s.toggleBtn, ...(showPositions ? s.toggleActive : {}) }}
                onClick={() => { setShowPositions(v => !v); setShowTrades(false) }}>
                {openPositions.length} POS
              </button>
            )}
            {closedTradesAll.length > 0 && (
              <button style={{ ...s.toggleBtn, ...(showTrades ? s.toggleActive : {}) }}
                onClick={() => { setShowTrades(v => !v); setShowPositions(false) }}>
                {closedTradesAll.length} TRADES
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── OPEN POSITIONS PANEL ────────────────────────────────────── */}
      {showPositions && openPositions.length > 0 && (
        <PanelOverlay title="POSICIONES ABIERTAS" onClose={() => setShowPositions(false)}
          extra={<button style={s.dangerBtn} onClick={() => {
            openPositions.forEach(p => closePosition(p.id, 'MANUAL'))
            setShowPositions(false)
          }}>Cerrar todas</button>}
        >
          <table style={s.tbl}>
            <thead><tr style={s.tblHead}>
              {['PAR','DIR','ENTRADA','ACTUAL','SL','TP','LOTS','P&L',''].map(h=>(
                <th key={h} style={s.th}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {openPositions.map(pos => {
                const livePnl = calcPnl(pos.side, pos.entry, currentPrice ?? pos.entry, pos.lots, activePair)
                return (
                  <tr key={pos.id} style={s.tblRow}>
                    <td style={s.td}>{pos.pair}</td>
                    <td style={{ ...s.td, color: pos.side==='BUY'?'#1E90FF':'#ef5350', fontWeight:800 }}>{pos.side}</td>
                    <td style={s.td}>{fmtPrice(pos.entry, pos.pair)}</td>
                    <td style={s.td}>{fmtPrice(currentPrice, pos.pair)}</td>
                    <td style={{ ...s.td, color:'#ef535088' }}>{fmtPrice(pos.sl, pos.pair)}</td>
                    <td style={{ ...s.td, color:'#1E90FF88' }}>{fmtPrice(pos.tp, pos.pair)}</td>
                    <td style={s.td}>{pos.lots}</td>
                    <td style={{ ...s.td, color:pnlColor(livePnl), fontWeight:700 }}>{fmtPnl(livePnl)}</td>
                    <td style={s.td}>
                      <button style={s.closeBtn} onClick={() => closePosition(pos.id, 'MANUAL')}>✕</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </PanelOverlay>
      )}

      {/* ── CLOSED TRADES JOURNAL PANEL ─────────────────────────────── */}
      {showTrades && closedTradesAll.length > 0 && (
        <PanelOverlay title="JOURNAL DE TRADES" onClose={() => setShowTrades(false)}>
          <table style={s.tbl}>
            <thead><tr style={s.tblHead}>
              {['PAR','DIR','ENTRADA','SALIDA','LOTS','SL','TP','R:R','P&L','RESULTADO','RAZÓN'].map(h=>(
                <th key={h} style={s.th}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {closedTradesAll.map((t, i) => (
                <tr key={i} style={s.tblRow}>
                  <td style={s.td}>{t.pair}</td>
                  <td style={{ ...s.td, color: t.side==='BUY'?'#1E90FF':'#ef5350', fontWeight:800 }}>{t.side}</td>
                  <td style={s.td}>{fmtPrice(t.entry, t.pair)}</td>
                  <td style={s.td}>{fmtPrice(t.exit, t.pair)}</td>
                  <td style={s.td}>{t.lots}</td>
                  <td style={s.td}>{t.slPips}</td>
                  <td style={s.td}>{t.tpPips}</td>
                  <td style={{ ...s.td, color:'#B2B5BE' }}>{t.rr_real?.toFixed(2)}R</td>
                  <td style={{ ...s.td, color:pnlColor(t.pnl), fontWeight:700 }}>{fmtPnl(t.pnl)}</td>
                  <td style={{ ...s.td, color: t.result==='WIN'?'#1E90FF':t.result==='LOSS'?'#ef5350':'#B2B5BE', fontWeight:700 }}>
                    {t.result}
                  </td>
                  <td style={{ ...s.td, color:'#3d4455' }}>{t.exitReason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </PanelOverlay>
      )}

      <style>{globalCss}</style>
    </div>
  )
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function StatPill({ label, value, color }) {
  return (
    <div style={s.statPill}>
      <span style={s.statLabel}>{label}</span>
      <span style={{ ...s.statVal, color }}>{value}</span>
    </div>
  )
}

function PanelOverlay({ title, onClose, extra, children }) {
  return (
    <div style={s.panelOverlay}>
      <div style={s.panelHeader}>
        <span style={s.panelTitle}>{title}</span>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          {extra}
          <button style={s.iconBtn} onClick={onClose}>✕</button>
        </div>
      </div>
      <div style={{ overflowX:'auto' }}>{children}</div>
    </div>
  )
}

function Spinner() {
  return (
    <>
      <div className="rammfx-spinner"/>
      <style>{`
        .rammfx-spinner{width:22px;height:22px;border:2px solid #111418;border-top-color:#1E90FF;border-radius:50%;animation:rammfx-spin .6s linear infinite}
        @keyframes rammfx-spin{to{transform:rotate(360deg)}}
      `}</style>
    </>
  )
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const s = {
  root:         { display:'flex', flexDirection:'column', height:'100vh', background:'#000', fontFamily:"'Montserrat',sans-serif", overflow:'hidden', color:'#B2B5BE' },
  splash:       { display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', background:'#000' },

  // Top bar
  topBar:       { height:40, background:'#070a0f', borderBottom:'1px solid #141820', display:'flex', alignItems:'center', padding:'0 8px', gap:10, flexShrink:0 },
  topLeft:      { display:'flex', alignItems:'center', gap:8, minWidth:0, flexShrink:0 },
  vDivider:     { width:1, height:18, background:'#1a1e27', flexShrink:0 },
  sessionMeta:  { display:'flex', flexDirection:'column', gap:0 },
  sessionName:  { fontSize:10, fontWeight:800, color:'#fff', letterSpacing:0.4, whiteSpace:'nowrap' },
  sessionDates: { fontSize:8, color:'#2d3548', letterSpacing:0.2, whiteSpace:'nowrap' },

  // Pair tabs
  pairTabs:     { display:'flex', alignItems:'center', gap:3, flex:1, overflow:'hidden' },
  pairTab:      { display:'flex', alignItems:'center', gap:4, padding:'3px 8px', borderRadius:'3px 3px 0 0', border:'1px solid #1a1e27', borderBottom:'none', background:'#0a0d13', cursor:'pointer', flexShrink:0 },
  pairTabActive:{ background:'#111418', borderColor:'#1E90FF55', borderBottomColor:'#111418' },
  pairTabLabel: { fontSize:10, fontWeight:700, color:'#B2B5BE', letterSpacing:0.3, display:'flex', alignItems:'center', gap:4 },
  pairTabDot:   { width:5, height:5, borderRadius:'50%', background:'#1E90FF', display:'inline-block' },
  pairTabClose: { background:'none', border:'none', color:'#3d4455', cursor:'pointer', fontSize:9, padding:'0 1px', lineHeight:1, fontFamily:"'Montserrat',sans-serif" },
  addPairBtn:   { background:'#0a0d13', border:'1px solid #1a1e27', color:'#3d4455', width:22, height:22, borderRadius:3, cursor:'pointer', fontSize:14, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'Montserrat',sans-serif" },
  pairDropdown: { position:'absolute', top:26, left:0, background:'#0d1017', border:'1px solid #1a1e27', borderRadius:4, zIndex:200, minWidth:100, padding:'4px 0', boxShadow:'0 8px 24px #00000099' },
  pairDropdownItem: { display:'block', width:'100%', background:'none', border:'none', color:'#B2B5BE', fontSize:10, fontWeight:700, padding:'6px 12px', cursor:'pointer', textAlign:'left', fontFamily:"'Montserrat',sans-serif", letterSpacing:0.3 },

  // Stats
  statsRow:     { display:'flex', alignItems:'center', flexShrink:0 },
  statPill:     { display:'flex', flexDirection:'column', gap:0, padding:'0 8px', borderLeft:'1px solid #1a1e27' },
  statLabel:    { fontSize:7, fontWeight:700, color:'#2d3548', letterSpacing:1 },
  statVal:      { fontSize:10, fontWeight:800 },

  // TF bar
  tfBar:        { height:28, background:'#070a0f', borderBottom:'1px solid #141820', display:'flex', alignItems:'center', padding:'0 8px', gap:2, flexShrink:0 },
  tfBtn:        { background:'none', border:'none', color:'#3d4455', fontSize:10, fontWeight:700, padding:'3px 7px', borderRadius:3, cursor:'pointer', fontFamily:"'Montserrat',sans-serif", letterSpacing:0.3 },
  tfBtnActive:  { background:'#1E90FF18', color:'#1E90FF' },
  tsBadge:      { fontSize:9, color:'#3d4455', fontWeight:600, letterSpacing:0.3, padding:'2px 8px', background:'#0d1017', borderRadius:3, border:'1px solid #1a1e27' },
  pxBadge:      { fontSize:11, color:'#1E90FF', fontWeight:800, padding:'2px 8px', background:'#1E90FF10', borderRadius:3, border:'1px solid #1E90FF30', letterSpacing:0.5, marginLeft:4 },

  // Chart
  chartWrap:    { flex:1, position:'relative', overflow:'hidden' },
  chart:        { width:'100%', height:'100%' },
  chartOverlay: { position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:10, background:'#000000BB', zIndex:10 },
  overlayText:  { fontSize:10, color:'#3d4455', fontWeight:700, letterSpacing:0.5 },

  // Bottom bar
  bottomBar:    { height:52, background:'#070a0f', borderTop:'1px solid #141820', display:'flex', alignItems:'center', padding:'0 8px', gap:10, flexShrink:0 },
  replayGroup:  { display:'flex', alignItems:'center', gap:4, flexShrink:0 },
  ctrlBtn:      { background:'#0d1017', border:'1px solid #1a1e27', color:'#B2B5BE', width:25, height:25, borderRadius:4, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' },
  playBtn:      { background:'#1E90FF', border:'none', color:'#fff', width:30, height:30, borderRadius:'50%' },
  pauseStyle:   { background:'#1E90FFAA' },
  speedRow:     { display:'flex', gap:1, marginLeft:3 },
  speedBtn:     { background:'none', border:'none', color:'#2d3548', fontSize:9, fontWeight:700, padding:'3px 5px', cursor:'pointer', borderRadius:3, fontFamily:"'Montserrat',sans-serif" },
  speedActive:  { background:'#1E90FF18', color:'#1E90FF' },

  // Scrubber
  scrubWrap:    { flex:1, display:'flex', alignItems:'center', gap:6, minWidth:60 },
  scrubber:     { flex:1, accentColor:'#1E90FF', cursor:'pointer' },
  scrubLabel:   { fontSize:8, color:'#2d3548', fontWeight:700, width:28, textAlign:'right', flexShrink:0 },

  // Trade group
  tradeGroup:   { display:'flex', alignItems:'center', gap:8, flexShrink:0 },
  paramCol:     { display:'flex', flexDirection:'column', gap:2 },
  paramLabel:   { fontSize:7, fontWeight:700, color:'#2d3548', letterSpacing:1 },
  presetRow:    { display:'flex', gap:2, alignItems:'center' },
  presetBtn:    { background:'none', border:'1px solid #1a1e27', color:'#3d4455', fontSize:9, fontWeight:700, padding:'2px 4px', borderRadius:3, cursor:'pointer', fontFamily:"'Montserrat',sans-serif" },
  presetActive: { background:'#1E90FF14', borderColor:'#1E90FF44', color:'#1E90FF' },
  numInput:     { background:'#0d1017', border:'1px solid #1a1e27', color:'#fff', width:46, height:22, textAlign:'center', fontSize:10, fontWeight:700, borderRadius:3, outline:'none', fontFamily:"'Montserrat',sans-serif" },
  rrHint:       { display:'flex', flexDirection:'column', gap:2 },
  tradeBtn:     { border:'none', color:'#fff', borderRadius:4, padding:'5px 11px', fontSize:10, fontWeight:800, cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center', gap:1, fontFamily:"'Montserrat',sans-serif", lineHeight:1 },
  buyBtn:       { background:'#1E90FF' },
  sellBtn:      { background:'#ef5350' },
  flashBtn:     { transform:'scale(0.92)', opacity:0.75 },
  tradePx:      { fontSize:7, fontWeight:600, opacity:0.7 },
  toggleGroup:  { display:'flex', gap:4 },
  toggleBtn:    { background:'#0d1017', border:'1px solid #1a1e27', color:'#B2B5BE', borderRadius:4, padding:'4px 8px', fontSize:9, fontWeight:700, cursor:'pointer', fontFamily:"'Montserrat',sans-serif", whiteSpace:'nowrap' },
  toggleActive: { background:'#1E90FF14', borderColor:'#1E90FF44', color:'#1E90FF' },

  // Panels
  panelOverlay: { position:'fixed', bottom:52, left:0, right:0, background:'#070a0f', borderTop:'1px solid #1a1e27', zIndex:100, maxHeight:260, overflowY:'auto' },
  panelHeader:  { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'6px 12px', borderBottom:'1px solid #141820', position:'sticky', top:0, background:'#070a0f', zIndex:1 },
  panelTitle:   { fontSize:9, fontWeight:800, color:'#fff', letterSpacing:1.2 },
  dangerBtn:    { background:'#ef535012', border:'1px solid #ef535040', color:'#ef5350', borderRadius:3, padding:'2px 9px', fontSize:9, fontWeight:700, cursor:'pointer', fontFamily:"'Montserrat',sans-serif" },

  // Table
  tbl:          { width:'100%', borderCollapse:'collapse', fontSize:10 },
  tblHead:      { borderBottom:'1px solid #141820' },
  tblRow:       { borderBottom:'1px solid #0a0d13' },
  th:           { padding:'4px 10px', textAlign:'left', color:'#2d3548', fontWeight:700, fontSize:8, letterSpacing:0.8, whiteSpace:'nowrap' },
  td:           { padding:'6px 10px', color:'#B2B5BE', whiteSpace:'nowrap' },
  closeBtn:     { background:'none', border:'none', color:'#3d4455', cursor:'pointer', fontSize:11, padding:'0 2px', fontFamily:"'Montserrat',sans-serif" },

  // Misc
  iconBtn:      { background:'none', border:'none', color:'#3d4455', cursor:'pointer', display:'flex', alignItems:'center', padding:3, borderRadius:3, fontFamily:"'Montserrat',sans-serif" },
}

const globalCss = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { overflow: hidden; background: #000; }
  input[type=number]::-webkit-inner-spin-button,
  input[type=number]::-webkit-outer-spin-button { opacity: 0; }
  input[type=range] { -webkit-appearance: none; appearance: none;
    background: transparent; cursor: pointer; }
  input[type=range]::-webkit-slider-runnable-track {
    height: 3px; background: #141820; border-radius: 2px; }
  input[type=range]::-webkit-slider-thumb {
    -webkit-appearance: none; width: 11px; height: 11px;
    border-radius: 50%; background: #1E90FF;
    margin-top: -4px; cursor: pointer; }
  input[type=range]:disabled { opacity: 0.3; }
  button:disabled { opacity: 0.3; cursor: not-allowed !important; }
  button:not(:disabled):hover { opacity: 0.82; }
`
