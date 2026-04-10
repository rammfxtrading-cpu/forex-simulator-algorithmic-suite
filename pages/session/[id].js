import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../../lib/supabase'

export const getServerSideProps = () => ({ props: {} })

// ─── TOOL GROUPS (TradingView style) ────────────────────────────────────────
const TOOL_GROUPS = [
  {
    id: 'cursor', icon: `<svg viewBox="0 0 18 18" fill="currentColor"><path d="M3 2l12 7-5.5 1.5L8 16z"/></svg>`,
    tools: [
      { id: 'cursor', label: 'Cursor', shortcut: '' },
      { id: 'crosshair', label: 'Crosshair', shortcut: '' },
    ]
  },
  {
    id: 'trendline', icon: `<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5"><line x1="3" y1="15" x2="15" y2="3"/></svg>`,
    section: 'LÍNEAS',
    tools: [
      { id: 'trendline', label: 'Línea de tendencia', shortcut: '⌥T' },
      { id: 'ray', label: 'Rayo', shortcut: '' },
      { id: 'infoline', label: 'Línea de información', shortcut: '' },
      { id: 'extended', label: 'Línea extendida', shortcut: '' },
      { id: 'angle', label: 'Ángulo de tendencia', shortcut: '' },
      { id: 'horizontal', label: 'Línea horizontal', shortcut: '⌥H' },
      { id: 'hray', label: 'Rayo horizontal', shortcut: '⌥J' },
      { id: 'vertical', label: 'Línea vertical', shortcut: '⌥V' },
      { id: 'crossline', label: 'Línea de cruce', shortcut: '⌥C' },
    ]
  },
  {
    id: 'channel', icon: `<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5"><line x1="2" y1="13" x2="16" y2="5"/><line x1="2" y1="16" x2="16" y2="8"/></svg>`,
    section: 'CANALES',
    tools: [
      { id: 'parallel', label: 'Canal paralelo', shortcut: '' },
      { id: 'regression', label: 'Tendencia de regresión', shortcut: '' },
      { id: 'flatcap', label: 'Plano superior/inferior', shortcut: '' },
      { id: 'disjoint', label: 'Canal desconectado', shortcut: '' },
    ]
  },
  {
    id: 'pitchfork', icon: `<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M9 14V4M5 14V8l4-4 4 4v6"/></svg>`,
    section: 'TRIDENTE',
    tools: [
      { id: 'pitchfork', label: 'Herramienta tridente', shortcut: '' },
      { id: 'schiff', label: 'Tridente de Schiff', shortcut: '' },
      { id: 'modschiff', label: 'Tridente de Schiff modificado', shortcut: '' },
      { id: 'inside', label: 'Tridente interno', shortcut: '' },
    ]
  },
  {
    id: 'fib', icon: `<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5"><line x1="2" y1="4" x2="16" y2="4"/><line x1="2" y1="9" x2="16" y2="9"/><line x1="2" y1="14" x2="16" y2="14"/></svg>`,
    section: 'GANN Y FIBONACCI',
    tools: [
      { id: 'fibretracement', label: 'Retroceso de Fibonacci', shortcut: '' },
      { id: 'fibextension', label: 'Extensión de Fibonacci', shortcut: '' },
      { id: 'fibchannel', label: 'Canal de Fibonacci', shortcut: '' },
      { id: 'fibspiral', label: 'Espiral de Fibonacci', shortcut: '' },
      { id: 'ganfan', label: 'Abanico de Gann', shortcut: '' },
      { id: 'gannbox', label: 'Caja de Gann', shortcut: '' },
    ]
  },
  {
    id: 'brush', icon: `<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 15 Q9 3 15 3"/></svg>`,
    section: 'PINCELES',
    tools: [
      { id: 'brush', label: 'Pincel', shortcut: '' },
      { id: 'highlighter', label: 'Marcador', shortcut: '' },
    ]
  },
  {
    id: 'rect', icon: `<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="5" width="12" height="8"/></svg>`,
    section: 'FORMAS',
    tools: [
      { id: 'rect', label: 'Rectángulo', shortcut: '' },
      { id: 'rotatedrect', label: 'Rectángulo rotado', shortcut: '' },
      { id: 'ellipse', label: 'Elipse', shortcut: '' },
      { id: 'triangle', label: 'Triángulo', shortcut: '' },
      { id: 'arc', label: 'Arco', shortcut: '' },
    ]
  },
  {
    id: 'text', icon: `<svg viewBox="0 0 18 18" fill="currentColor"><text x="3" y="14" fontSize="13" fontWeight="bold">T</text></svg>`,
    section: 'ANOTACIONES',
    tools: [
      { id: 'text', label: 'Texto', shortcut: '' },
      { id: 'callout', label: 'Llamada', shortcut: '' },
      { id: 'note', label: 'Nota', shortcut: '' },
      { id: 'signpost', label: 'Señal', shortcut: '' },
      { id: 'arrow', label: 'Flecha', shortcut: '' },
    ]
  },
  {
    id: 'measure', icon: `<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 15l12-12M3 15l3-1-1 3M15 3l-3 1 1-3"/></svg>`,
    section: 'HERRAMIENTAS',
    tools: [
      { id: 'measure', label: 'Medida', shortcut: '' },
      { id: 'zoom', label: 'Zoom', shortcut: '' },
    ]
  },
  {
    id: 'forecast', icon: `<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 12l4-4 3 3 5-7"/><line x1="3" y1="15" x2="15" y2="15"/></svg>`,
    section: 'PREDICCIÓN Y MEDICIÓN',
    tools: [
      { id: 'longshort', label: 'Posición larga/corta', shortcut: '' },
      { id: 'forecast', label: 'Previsión de precios', shortcut: '' },
      { id: 'daterange', label: 'Rango de fechas y precios', shortcut: '' },
    ]
  },
  {
    id: 'eraser', icon: `<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 15l4-4L15 3l3 3-8 8-4 4z"/></svg>`,
    tools: [
      { id: 'eraser', label: 'Borrar', shortcut: '' },
    ]
  },
]

const TIMEFRAMES = ['1m','5m','15m','30m','1h','4h','1D','1W']
const TF_MAP = { '1m':'M1','5m':'M5','15m':'M15','30m':'M30','1h':'H1','4h':'H4','1D':'D1','1W':'W1' }
const PAIRS = ['EUR/USD','GBP/USD','USD/JPY','USD/CHF','AUD/USD','USD/CAD','NZD/USD','EUR/GBP','EUR/JPY','GBP/JPY','XAU/USD']

export default function SessionPage() {
  const router = useRouter()
  const { id } = router.query
  const chartContainerRef = useRef(null)
  const chartRef = useRef(null)
  const seriesRef = useRef(null)
  const drawingCanvasRef = useRef(null)

  const [session, setSession] = useState(null)
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [candles, setCandles] = useState([])
  const [visibleCount, setVisibleCount] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [speed, setSpeed] = useState(500)
  const [currentTF, setCurrentTF] = useState('1h')
  const [currentPair, setCurrentPair] = useState('EUR/USD')
  const [ohlc, setOhlc] = useState({ o:0, h:0, l:0, c:0 })
  const [activeTool, setActiveTool] = useState('cursor')
  const [openGroup, setOpenGroup] = useState(null)
  const [drawings, setDrawings] = useState([])
  const [drawing, setDrawing] = useState(null)
  const [showPairDropdown, setShowPairDropdown] = useState(false)
  const [loadError, setLoadError] = useState(null)
  const playRef = useRef(null)
  const [balance, setBalance] = useState(10000)
  const [positions, setPositions] = useState([])
  const [lots, setLots] = useState(0.01)
  const [realizedPnl, setRealizedPnl] = useState(0)
  const [currentPrice, setCurrentPrice] = useState(0)
  const [showPositions, setShowPositions] = useState(false)

  // ── Auth + session load ─────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (!s) { router.replace('/'); return }
      setUser(s.user)
    })
  }, [])

  useEffect(() => {
    if (!id) return
    supabase.from('sim_sessions').select('*').eq('id', id).single()
      .then(({ data }) => {
        if (data) {
          setSession(data)
          setCurrentPair(data.pair)
          setBalance(parseFloat(data.balance))
        }
        setLoading(false)
      })
  }, [id])

  // ── Load candles ────────────────────────────────────────────────────────
  const loadCandles = useCallback(async (pair, tf, dateFrom, dateTo) => {
    setLoadError(null)
    const apiTf = TF_MAP[tf] || 'H1'
    const from = new Date(dateFrom)
    const to = new Date(dateTo)
    const allCandles = []

    let cur = new Date(from)
    while (cur <= to) {
      const y = cur.getFullYear()
      const m = cur.getMonth() + 1
      try {
        const res = await fetch(`/api/candles?pair=${encodeURIComponent(pair)}&timeframe=${apiTf}&year=${y}&month=${m}`)
        const data = await res.json()
        if (Array.isArray(data)) allCandles.push(...data)
      } catch(e) {}
      cur.setMonth(cur.getMonth() + 1)
    }

    if (allCandles.length === 0) {
      setLoadError('No data available for this period')
      return
    }

    const sorted = allCandles.sort((a,b) => a.time - b.time)
    setCandles(sorted)
    setVisibleCount(Math.min(100, sorted.length))
  }, [])

  useEffect(() => {
    if (session) {
      loadCandles(session.pair, '1h', session.date_from, session.date_to)
    }
  }, [session])

  // ── Init chart ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!chartContainerRef.current || candles.length === 0) return
    let chart, series

    import('lightweight-charts').then(lc => {
      if (chartRef.current) { chartRef.current.remove(); chartRef.current = null }
      const container = chartContainerRef.current
      chart = lc.createChart(container, {
        width: container.clientWidth,
        height: container.clientHeight,
        layout: { background: { color: '#131722' }, textColor: '#B2B5BE' },
        grid: { vertLines: { color: '#1e222d' }, horzLines: { color: '#1e222d' } },
        crosshair: { mode: 1, vertLine: { color: '#758696', width: 1, style: 3 }, horzLine: { color: '#758696', width: 1, style: 3 } },
        rightPriceScale: { borderColor: '#1e222d', scaleMargins: { top: 0.1, bottom: 0.1 } },
        timeScale: { borderColor: '#1e222d', timeVisible: true, secondsVisible: false },
        handleScroll: true,
        handleScale: true,
      })

      const addCandle = typeof chart.addCandlestickSeries === 'function'
        ? (opts) => chart.addCandlestickSeries(opts)
        : (opts) => chart.addSeries(lc.CandlestickSeries, opts)

      series = addCandle({
        upColor: '#26a69a', downColor: '#ef5350',
        borderUpColor: '#26a69a', borderDownColor: '#ef5350',
        wickUpColor: '#26a69a', wickDownColor: '#ef5350',
      })

      const visible = candles.slice(0, visibleCount)
      series.setData(visible)

      if (visible.length > 0) {
        const last = visible[visible.length - 1]
        setOhlc({ o: last.open, h: last.high, l: last.low, c: last.close })
        setCurrentPrice(last.close)
      }

      chart.subscribeCrosshairMove(p => {
        if (p.seriesData?.size > 0) {
          const d = p.seriesData.values().next().value
          if (d) setOhlc({ o: d.open, h: d.high, l: d.low, c: d.close })
        }
      })

      chartRef.current = chart
      seriesRef.current = series

      const ro = new ResizeObserver(() => {
        if (chartRef.current && container) {
          chartRef.current.applyOptions({ width: container.clientWidth, height: container.clientHeight })
        }
      })
      ro.observe(container)
    })

    return () => { if (chartRef.current) { chartRef.current.remove(); chartRef.current = null } }
  }, [candles])

  // ── Update visible candles ──────────────────────────────────────────────
  useEffect(() => {
    if (!seriesRef.current || candles.length === 0) return
    const visible = candles.slice(0, visibleCount)
    seriesRef.current.setData(visible)
    if (visible.length > 0) {
      const last = visible[visible.length - 1]
      setCurrentPrice(last.close)
    }
  }, [visibleCount, candles])

  // ── Replay ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (isPlaying) {
      playRef.current = setInterval(() => {
        setVisibleCount(prev => {
          if (prev >= candles.length) { setIsPlaying(false); return prev }
          return prev + 1
        })
      }, speed)
    } else {
      clearInterval(playRef.current)
    }
    return () => clearInterval(playRef.current)
  }, [isPlaying, speed, candles.length])

  // ── Timeframe change ────────────────────────────────────────────────────
  const changeTF = (tf) => {
    setCurrentTF(tf)
    setIsPlaying(false)
    if (session) loadCandles(session.pair, tf, session.date_from, session.date_to)
  }

  // ── Trading ─────────────────────────────────────────────────────────────
  const openPosition = (side) => {
    const price = currentPrice
    if (!price) return
    const pos = { id: Date.now(), side, price, lots, openTime: new Date().toISOString() }
    setPositions(prev => [...prev, pos])
  }

  const closePosition = (posId) => {
    const pos = positions.find(p => p.id === posId)
    if (!pos) return
    const pips = pos.side === 'BUY'
      ? (currentPrice - pos.price) * (currentPair.includes('JPY') ? 100 : 10000)
      : (pos.price - currentPrice) * (currentPair.includes('JPY') ? 100 : 10000)
    const pnl = pips * pos.lots * 10
    setRealizedPnl(prev => prev + pnl)
    setBalance(prev => prev + pnl)
    setPositions(prev => prev.filter(p => p.id !== posId))
  }

  const unrealizedPnl = positions.reduce((sum, pos) => {
    const pips = pos.side === 'BUY'
      ? (currentPrice - pos.price) * (currentPair.includes('JPY') ? 100 : 10000)
      : (pos.price - currentPrice) * (currentPair.includes('JPY') ? 100 : 10000)
    return sum + pips * pos.lots * 10
  }, 0)

  const pnlColor = (v) => v > 0 ? '#26a69a' : v < 0 ? '#ef5350' : '#B2B5BE'

  if (loading) return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',background:'#131722'}}>
      <div style={{textAlign:'center'}}>
        <div className="spinner"/>
        <div style={{color:'#B2B5BE',fontSize:12,marginTop:12,fontFamily:'Montserrat,sans-serif'}}>Loading session...</div>
      </div>
      <style>{`.spinner{width:28px;height:28px;border:2px solid #1e222d;border-top-color:#26a69a;border-radius:50%;animation:spin .7s linear infinite;margin:0 auto}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  const lastCandle = candles[visibleCount - 1]
  const candleColor = lastCandle && lastCandle.close >= lastCandle.open ? '#26a69a' : '#ef5350'

  return (
    <div style={s.root}>
      {/* ── TOP BAR ─────────────────────────────────────────────── */}
      <div style={s.topBar}>
        {/* Left: logo + pair + OHLC */}
        <div style={s.topLeft}>
          <div style={s.tvLogo} onClick={()=>router.push('/dashboard')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#26a69a" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
          </div>
          <div style={s.pairBtn} onClick={()=>setShowPairDropdown(!showPairDropdown)}>
            <span style={s.pairText}>{currentPair}</span>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#B2B5BE" strokeWidth="2"><polyline points="6,9 12,15 18,9"/></svg>
            {showPairDropdown && (
              <div style={s.pairDropdown}>
                {PAIRS.map(p => (
                  <div key={p} style={{...s.pairOption, color: p===currentPair?'#26a69a':'#B2B5BE'}} onClick={e=>{e.stopPropagation();setCurrentPair(p);setShowPairDropdown(false);if(session)loadCandles(p,currentTF,session.date_from,session.date_to)}}>
                    {p}
                  </div>
                ))}
              </div>
            )}
          </div>
          {/* Timeframes */}
          <div style={s.tfRow}>
            {TIMEFRAMES.map(tf => (
              <button key={tf} style={{...s.tfBtn, ...(tf===currentTF?s.tfActive:{})}} onClick={()=>changeTF(tf)}>{tf}</button>
            ))}
          </div>
          {/* OHLC */}
          <div style={s.ohlcRow}>
            <span style={{color:'#B2B5BE',fontSize:11}}>O</span><span style={{color:candleColor,fontSize:11,fontWeight:600}}>{ohlc.o?.toFixed(5)}</span>
            <span style={{color:'#B2B5BE',fontSize:11}}>H</span><span style={{color:candleColor,fontSize:11,fontWeight:600}}>{ohlc.h?.toFixed(5)}</span>
            <span style={{color:'#B2B5BE',fontSize:11}}>L</span><span style={{color:candleColor,fontSize:11,fontWeight:600}}>{ohlc.l?.toFixed(5)}</span>
            <span style={{color:'#B2B5BE',fontSize:11}}>C</span><span style={{color:candleColor,fontSize:11,fontWeight:600}}>{ohlc.c?.toFixed(5)}</span>
          </div>
        </div>

        {/* Right: replay controls */}
        <div style={s.topRight}>
          {/* Candle counter */}
          <span style={s.candleCount}>{visibleCount}/{candles.length}</span>
          {/* Prev candle */}
          <button style={s.replayBtn} onClick={()=>setVisibleCount(v=>Math.max(1,v-1))} title="Vela anterior">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="19,5 9,12 19,19"/><line x1="5" y1="5" x2="5" y2="19" stroke="currentColor" strokeWidth="2"/></svg>
          </button>
          {/* Play/Pause */}
          <button style={{...s.replayBtn,...s.replayPlay}} onClick={()=>setIsPlaying(p=>!p)} title={isPlaying?'Pause':'Play'}>
            {isPlaying
              ? <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
              : <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
            }
          </button>
          {/* Next candle */}
          <button style={s.replayBtn} onClick={()=>setVisibleCount(v=>Math.min(candles.length,v+1))} title="Siguiente vela">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,5 15,12 5,19"/><line x1="19" y1="5" x2="19" y2="19" stroke="currentColor" strokeWidth="2"/></svg>
          </button>
          {/* Speed */}
          <select style={s.speedSelect} value={speed} onChange={e=>setSpeed(Number(e.target.value))}>
            <option value={1000}>0.5x</option>
            <option value={500}>1x</option>
            <option value={250}>2x</option>
            <option value={100}>5x</option>
            <option value={50}>10x</option>
          </select>
          <div style={s.topDivider}/>
          <span style={s.sessionName}>{session?.name}</span>
        </div>
      </div>

      {/* ── BODY ────────────────────────────────────────────────── */}
      <div style={s.body}>
        {/* ── LEFT TOOLBAR ──────────────────────────────────────── */}
        <div style={s.leftBar}>
          {TOOL_GROUPS.map(group => (
            <div key={group.id} style={s.toolGroupWrap}>
              <button
                style={{...s.toolBtn, ...(activeTool===group.id||group.tools.some(t=>t.id===activeTool)&&group.id!=='cursor'?s.toolBtnActive:{})}}
                onClick={()=>{
                  if(group.tools.length===1){setActiveTool(group.tools[0].id);setOpenGroup(null)}
                  else setOpenGroup(openGroup===group.id?null:group.id)
                }}
                title={group.tools[0].label}
                dangerouslySetInnerHTML={{__html: group.icon}}
              />
              {/* Dropdown */}
              {openGroup===group.id && group.tools.length > 1 && (
                <div style={s.toolDropdown}>
                  {group.section && <div style={s.toolSection}>{group.section}</div>}
                  {group.tools.map(tool => (
                    <div key={tool.id} style={{...s.toolOption,...(activeTool===tool.id?s.toolOptionActive:{})}}
                      onClick={()=>{setActiveTool(tool.id);setOpenGroup(null)}}>
                      <span>{tool.label}</span>
                      {tool.shortcut && <span style={s.shortcut}>{tool.shortcut}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
          <div style={s.leftSep}/>
          {/* Trash */}
          <button style={s.toolBtn} onClick={()=>setDrawings([])} title="Eliminar todos los dibujos">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="3,6 5,6 21,6"/><path d="M19,6l-1,14a2,2,0,0,1-2,2H8a2,2,0,0,1-2-2L5,6"/><path d="M10,11v6M14,11v6"/><path d="M9,6V4h6v2"/></svg>
          </button>
        </div>

        {/* ── CHART AREA ────────────────────────────────────────── */}
        <div style={s.chartWrap} onClick={()=>{setOpenGroup(null);setShowPairDropdown(false)}}>
          {loadError && (
            <div style={s.errorOverlay}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ef5350" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              <div style={{color:'#ef5350',fontSize:13,marginTop:8}}>{loadError}</div>
              <button style={s.retryBtn} onClick={()=>session&&loadCandles(currentPair,currentTF,session.date_from,session.date_to)}>Retry</button>
            </div>
          )}
          {!loadError && candles.length === 0 && !loading && (
            <div style={s.loadingOverlay}>
              <div className="spinner"/>
              <div style={{color:'#B2B5BE',fontSize:12,marginTop:12}}>Loading candles...</div>
            </div>
          )}
          <div ref={chartContainerRef} style={s.chart}/>
        </div>
      </div>

      {/* ── BOTTOM BAR (FX Replay style) ────────────────────────── */}
      <div style={s.bottomBar}>
        <div style={s.bottomLeft}>
          <div style={s.lotWrap}>
            <span style={s.bottomLabel}>LOTS</span>
            <div style={s.lotControls}>
              <button style={s.lotBtn} onClick={()=>setLots(l=>Math.max(0.01,parseFloat((l-0.01).toFixed(2))))}>−</button>
              <input style={s.lotInput} type="number" step="0.01" min="0.01" value={lots}
                onChange={e=>setLots(Math.max(0.01,parseFloat(e.target.value)||0.01))}/>
              <button style={s.lotBtn} onClick={()=>setLots(l=>parseFloat((l+0.01).toFixed(2)))}>+</button>
            </div>
          </div>
          <button style={s.buyBtn} onClick={()=>openPosition('BUY')}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="white"><polygon points="12,3 22,21 2,21"/></svg>
            BUY
          </button>
          <button style={s.sellBtn} onClick={()=>openPosition('SELL')}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="white"><polygon points="12,21 22,3 2,3"/></svg>
            SELL
          </button>
          {positions.length > 0 && (
            <button style={s.positionsBtn} onClick={()=>setShowPositions(!showPositions)}>
              {positions.length} pos {showPositions ? '▲' : '▼'}
            </button>
          )}
        </div>
        <div style={s.bottomRight}>
          <div style={s.bottomStat}>
            <span style={s.bottomLabel}>ACCOUNT BALANCE</span>
            <span style={{...s.bottomVal,color:'#B2B5BE'}}>${balance.toFixed(2)}</span>
          </div>
          <div style={s.bottomDivider}/>
          <div style={s.bottomStat}>
            <span style={s.bottomLabel}>REALIZED P&L</span>
            <span style={{...s.bottomVal,color:pnlColor(realizedPnl)}}>{realizedPnl>=0?'+':''}{realizedPnl.toFixed(2)}</span>
          </div>
          <div style={s.bottomDivider}/>
          <div style={s.bottomStat}>
            <span style={s.bottomLabel}>UNREALIZED P&L</span>
            <span style={{...s.bottomVal,color:pnlColor(unrealizedPnl)}}>{unrealizedPnl>=0?'+':''}{unrealizedPnl.toFixed(2)}</span>
          </div>
          <div style={s.bottomDivider}/>
          <div style={s.bottomStat}>
            <span style={s.bottomLabel}>PRICE</span>
            <span style={{...s.bottomVal,color:'#B2B5BE'}}>{currentPrice?.toFixed(5)}</span>
          </div>
        </div>
      </div>

      {/* ── POSITIONS PANEL ─────────────────────────────────────── */}
      {showPositions && positions.length > 0 && (
        <div style={s.posPanel}>
          <div style={s.posPanelHeader}>
            <span style={{fontSize:11,fontWeight:700,color:'#B2B5BE',letterSpacing:1}}>OPEN POSITIONS</span>
            <button style={{background:'none',border:'none',color:'#B2B5BE',cursor:'pointer',fontSize:14}} onClick={()=>setShowPositions(false)}>✕</button>
          </div>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:11}}>
            <thead>
              <tr style={{borderBottom:'1px solid #1e222d'}}>
                {['Side','Entry','Current','Lots','P&L',''].map(h=>(
                  <th key={h} style={{padding:'6px 10px',textAlign:'left',color:'#5d6673',fontWeight:600,fontSize:10}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {positions.map(pos => {
                const pips = pos.side==='BUY'
                  ? (currentPrice-pos.price)*(currentPair.includes('JPY')?100:10000)
                  : (pos.price-currentPrice)*(currentPair.includes('JPY')?100:10000)
                const pnl = pips * pos.lots * 10
                return (
                  <tr key={pos.id} style={{borderBottom:'1px solid #1e222d'}}>
                    <td style={{padding:'7px 10px',color:pos.side==='BUY'?'#26a69a':'#ef5350',fontWeight:700}}>{pos.side}</td>
                    <td style={{padding:'7px 10px',color:'#B2B5BE'}}>{pos.price.toFixed(5)}</td>
                    <td style={{padding:'7px 10px',color:'#B2B5BE'}}>{currentPrice?.toFixed(5)}</td>
                    <td style={{padding:'7px 10px',color:'#B2B5BE'}}>{pos.lots}</td>
                    <td style={{padding:'7px 10px',color:pnlColor(pnl),fontWeight:600}}>{pnl>=0?'+':''}{pnl.toFixed(2)}</td>
                    <td style={{padding:'7px 10px'}}><button onClick={()=>closePosition(pos.id)} style={{background:'#ef535020',border:'1px solid #ef535040',color:'#ef5350',borderRadius:4,padding:'3px 8px',fontSize:10,cursor:'pointer',fontFamily:'Montserrat,sans-serif'}}>Close</button></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <style>{`
        *{box-sizing:border-box;margin:0;padding:0}
        body{overflow:hidden;background:#131722}
        .spinner{width:28px;height:28px;border:2px solid #1e222d;border-top-color:#26a69a;border-radius:50%;animation:spin .7s linear infinite}
        @keyframes spin{to{transform:rotate(360deg)}}
        select option{background:#1e222d;color:#B2B5BE}
        input[type=number]::-webkit-inner-spin-button{opacity:0}
      `}</style>
    </div>
  )
}

const s = {
  root:{display:'flex',flexDirection:'column',height:'100vh',background:'#131722',fontFamily:"'Montserrat',sans-serif",overflow:'hidden',position:'relative'},
  // TOP BAR
  topBar:{height:38,background:'#1e222d',borderBottom:'1px solid #2a2e39',display:'flex',alignItems:'center',justifyContent:'space-between',padding:'0 8px',flexShrink:0,zIndex:10},
  topLeft:{display:'flex',alignItems:'center',gap:4},
  topRight:{display:'flex',alignItems:'center',gap:6},
  tvLogo:{width:28,height:28,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',borderRadius:4,flexShrink:0},
  pairBtn:{position:'relative',display:'flex',alignItems:'center',gap:6,padding:'4px 10px',borderRadius:4,background:'#2a2e39',cursor:'pointer',minWidth:100,userSelect:'none'},
  pairText:{fontSize:13,fontWeight:700,color:'#ffffff'},
  pairDropdown:{position:'absolute',top:'110%',left:0,background:'#1e222d',border:'1px solid #2a2e39',borderRadius:6,zIndex:100,minWidth:120,boxShadow:'0 8px 24px #00000080'},
  pairOption:{padding:'8px 14px',fontSize:12,cursor:'pointer',color:'#B2B5BE',whiteSpace:'nowrap'},
  tfRow:{display:'flex',gap:1},
  tfBtn:{background:'none',border:'none',color:'#787b86',fontSize:12,fontWeight:600,padding:'4px 7px',cursor:'pointer',borderRadius:3,fontFamily:"'Montserrat',sans-serif"},
  tfActive:{background:'#2a2e39',color:'#ffffff'},
  ohlcRow:{display:'flex',gap:6,marginLeft:8,alignItems:'center'},
  candleCount:{fontSize:11,color:'#5d6673',minWidth:60,textAlign:'right'},
  replayBtn:{background:'#2a2e39',border:'none',color:'#B2B5BE',borderRadius:4,width:26,height:26,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer'},
  replayPlay:{background:'#26a69a20',color:'#26a69a',border:'1px solid #26a69a40'},
  speedSelect:{background:'#2a2e39',border:'none',color:'#B2B5BE',borderRadius:4,padding:'2px 6px',fontSize:11,cursor:'pointer',fontFamily:"'Montserrat',sans-serif",outline:'none'},
  topDivider:{width:1,height:20,background:'#2a2e39'},
  sessionName:{fontSize:11,color:'#5d6673',maxWidth:160,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'},
  // BODY
  body:{flex:1,display:'flex',overflow:'hidden'},
  // LEFT TOOLBAR
  leftBar:{width:36,background:'#1e222d',borderRight:'1px solid #2a2e39',display:'flex',flexDirection:'column',alignItems:'center',padding:'4px 0',gap:1,zIndex:10,flexShrink:0,overflowY:'auto',overflowX:'visible'},
  toolGroupWrap:{position:'relative'},
  toolBtn:{width:28,height:28,background:'none',border:'none',color:'#787b86',cursor:'pointer',borderRadius:4,display:'flex',alignItems:'center',justifyContent:'center',padding:0},
  toolBtnActive:{background:'#2962ff20',color:'#2962ff'},
  toolDropdown:{position:'absolute',left:'100%',top:0,background:'#1e222d',border:'1px solid #2a2e39',borderRadius:6,zIndex:200,minWidth:220,boxShadow:'0 8px 32px #00000090',marginLeft:4},
  toolSection:{padding:'8px 14px 4px',fontSize:9,fontWeight:700,color:'#5d6673',letterSpacing:1.5},
  toolOption:{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'7px 14px',fontSize:12,color:'#B2B5BE',cursor:'pointer',whiteSpace:'nowrap'},
  toolOptionActive:{background:'#2962ff15',color:'#2962ff'},
  shortcut:{fontSize:10,color:'#5d6673',marginLeft:12},
  leftSep:{width:20,height:1,background:'#2a2e39',margin:'4px 0'},
  // CHART
  chartWrap:{flex:1,position:'relative',background:'#131722'},
  chart:{width:'100%',height:'100%'},
  errorOverlay:{position:'absolute',inset:0,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',background:'#131722',zIndex:10},
  loadingOverlay:{position:'absolute',inset:0,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',background:'#131722',zIndex:10},
  retryBtn:{marginTop:12,background:'#2a2e39',border:'none',color:'#B2B5BE',borderRadius:6,padding:'8px 20px',fontSize:12,cursor:'pointer',fontFamily:"'Montserrat',sans-serif"},
  // BOTTOM BAR
  bottomBar:{height:44,background:'#1e222d',borderTop:'1px solid #2a2e39',display:'flex',alignItems:'center',justifyContent:'space-between',padding:'0 12px',flexShrink:0,zIndex:10},
  bottomLeft:{display:'flex',alignItems:'center',gap:10},
  bottomRight:{display:'flex',alignItems:'center',gap:0},
  lotWrap:{display:'flex',flexDirection:'column',gap:1},
  bottomLabel:{fontSize:9,fontWeight:700,color:'#5d6673',letterSpacing:1},
  lotControls:{display:'flex',alignItems:'center',gap:0},
  lotBtn:{background:'#2a2e39',border:'none',color:'#B2B5BE',width:18,height:20,cursor:'pointer',fontSize:14,display:'flex',alignItems:'center',justifyContent:'center',fontFamily:"'Montserrat',sans-serif"},
  lotInput:{background:'#131722',border:'none',color:'#ffffff',width:52,height:20,textAlign:'center',fontSize:11,fontWeight:700,outline:'none',fontFamily:"'Montserrat',sans-serif"},
  buyBtn:{background:'#26a69a',border:'none',color:'#fff',borderRadius:4,padding:'6px 18px',fontSize:12,fontWeight:800,cursor:'pointer',display:'flex',alignItems:'center',gap:6,fontFamily:"'Montserrat',sans-serif",letterSpacing:.5},
  sellBtn:{background:'#ef5350',border:'none',color:'#fff',borderRadius:4,padding:'6px 18px',fontSize:12,fontWeight:800,cursor:'pointer',display:'flex',alignItems:'center',gap:6,fontFamily:"'Montserrat',sans-serif",letterSpacing:.5},
  positionsBtn:{background:'#2a2e39',border:'none',color:'#B2B5BE',borderRadius:4,padding:'5px 10px',fontSize:11,cursor:'pointer',fontFamily:"'Montserrat',sans-serif"},
  bottomStat:{display:'flex',flexDirection:'column',padding:'0 16px',gap:2},
  bottomVal:{fontSize:12,fontWeight:700},
  bottomDivider:{width:1,height:28,background:'#2a2e39'},
  // POSITIONS PANEL
  posPanel:{position:'absolute',bottom:44,left:36,right:0,background:'#1e222d',borderTop:'1px solid #2a2e39',zIndex:20,maxHeight:200,overflowY:'auto'},
  posPanelHeader:{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'8px 12px',borderBottom:'1px solid #2a2e39'},
}
