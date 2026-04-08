import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabase'
import Head from 'next/head'

// ─── Dukascopy candle fetcher ────────────────────────────────────────────────
// Fetches OHLCV from Dukascopy historical data API (bi5 format via proxy workaround)
// We use a public CORS-friendly endpoint pattern
async function fetchDukascopyCandles(pair, timeframe, year, month) {
  // Dukascopy stores data as bi5 (LZMA compressed). We use a known public proxy
  // that decodes and serves JSON: duka-proxy on Vercel (open source, widely used)
  const symbol = pair.replace('/', '')
  const m = String(month).padStart(2, '0')
  // Map our timeframe labels to Dukascopy period codes
  const tfMap = { 'M1': 'M1', 'M5': 'M5', 'M15': 'M15', 'M30': 'M30', 'H1': 'H1', 'H4': 'H4', 'D1': 'D1' }
  const tf = tfMap[timeframe] || 'H1'

  // Use dukas-copy-api (public, no auth needed for historical data)
  const url = `https://freeserv.dukascopy.com/2.0/?path=chart/json&instrument=${symbol}&offer_side=B&interval=${tf}&splits=false&stocks=false&start=${year}-${m}-01T00:00:00&end=${year}-${m}-28T23:59:59&jsonp=false`

  const res = await fetch(url)
  if (!res.ok) throw new Error('Dukascopy fetch failed')
  const raw = await res.json()

  // Dukascopy returns array of [timestamp, open, high, low, close, volume]
  return raw.map(c => ({
    time: Math.floor(c[0] / 1000),
    open: parseFloat(c[1].toFixed(5)),
    high: parseFloat(c[2].toFixed(5)),
    low: parseFloat(c[3].toFixed(5)),
    close: parseFloat(c[4].toFixed(5)),
    volume: c[5] || 0,
  })).filter(c => c.open && c.high && c.low && c.close)
}

// ─── Fallback: generate demo candles if Dukascopy unavailable ────────────────
function generateDemoCandles(pair, count = 300) {
  const prices = { 'EUR/USD': 1.0850, 'GBP/USD': 1.2700, 'USD/JPY': 149.50, 'XAU/USD': 2020.0, 'NAS100': 17500 }
  let price = prices[pair] || 1.1000
  const pip = pair.includes('JPY') || pair.includes('NAS') ? 0.01 : 0.0001
  const now = Math.floor(Date.now() / 1000)
  const tfSec = 3600
  const candles = []
  for (let i = count; i >= 0; i--) {
    const move = (Math.random() - 0.48) * pip * 15
    const open = price
    const close = parseFloat((open + move).toFixed(5))
    const range = Math.random() * pip * 20
    const high = parseFloat((Math.max(open, close) + range * 0.6).toFixed(5))
    const low = parseFloat((Math.min(open, close) - range * 0.4).toFixed(5))
    candles.push({ time: now - i * tfSec, open, high, low, close, volume: Math.floor(Math.random() * 1000) })
    price = close
  }
  return candles
}

// ─── Pairs & timeframes ───────────────────────────────────────────────────────
const PAIRS = ['EUR/USD', 'GBP/USD', 'USD/JPY', 'USD/CHF', 'AUD/USD', 'USD/CAD', 'NZD/USD', 'EUR/GBP', 'EUR/JPY', 'GBP/JPY', 'XAU/USD', 'NAS100']
const TIMEFRAMES = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1']
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const YEARS = [2018, 2019, 2020, 2021, 2022, 2023, 2024]

export default function Simulator() {
  const router = useRouter()
  const chartContainerRef = useRef(null)
  const chartRef = useRef(null)
  const seriesRef = useRef(null)
  const volumeSeriesRef = useRef(null)
  const allCandlesRef = useRef([])
  const replayIndexRef = useRef(0)
  const replayTimerRef = useRef(null)

  const [user, setUser] = useState(null)
  const [loadingAuth, setLoadingAuth] = useState(true)
  const [pair, setPair] = useState('EUR/USD')
  const [timeframe, setTimeframe] = useState('H1')
  const [year, setYear] = useState(2023)
  const [month, setMonth] = useState(1)
  const [loadingData, setLoadingData] = useState(false)
  const [dataError, setDataError] = useState('')
  const [replayMode, setReplayMode] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [replaySpeed, setReplaySpeed] = useState(500) // ms per candle
  const [replayIndex, setReplayIndex] = useState(0)
  const [totalCandles, setTotalCandles] = useState(0)
  const [currentCandle, setCurrentCandle] = useState(null)
  const [balance, setBalance] = useState(10000)
  const [positions, setPositions] = useState([])
  const [closedPnl, setClosedPnl] = useState(0)
  const [lotSize, setLotSize] = useState(0.01)
  const [sidebarTab, setSidebarTab] = useState('trade') // trade | history

  // ── Auth check ──────────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.replace('/'); return }
      setUser(session.user)
      setLoadingAuth(false)
    })
  }, [])

  // ── Init chart once ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (loadingAuth || !chartContainerRef.current) return
    let LightweightCharts
    import('lightweight-charts').then(lc => {
      LightweightCharts = lc
      const chart = LightweightCharts.createChart(chartContainerRef.current, {
        width: chartContainerRef.current.clientWidth,
        height: chartContainerRef.current.clientHeight,
        layout: { background: { color: '#080c14' }, textColor: '#c8d0e0' },
        grid: { vertLines: { color: '#1a2035' }, horzLines: { color: '#1a2035' } },
        crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
        rightPriceScale: { borderColor: '#1a2035' },
        timeScale: { borderColor: '#1a2035', timeVisible: true, secondsVisible: false },
        watermark: { visible: false },
      })

      const candleSeries = chart.addCandlestickSeries({
        upColor: '#22c55e', downColor: '#ef4444',
        borderUpColor: '#22c55e', borderDownColor: '#ef4444',
        wickUpColor: '#22c55e80', wickDownColor: '#ef444480',
      })

      const volSeries = chart.addHistogramSeries({
        priceFormat: { type: 'volume' },
        priceScaleId: 'vol',
        color: '#1E90FF30',
      })
      chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } })

      chartRef.current = chart
      seriesRef.current = candleSeries
      volumeSeriesRef.current = volSeries

      // Resize observer
      const ro = new ResizeObserver(() => {
        if (chartContainerRef.current) {
          chart.applyOptions({
            width: chartContainerRef.current.clientWidth,
            height: chartContainerRef.current.clientHeight,
          })
        }
      })
      ro.observe(chartContainerRef.current)

      // Load initial data
      loadData('EUR/USD', 'H1', 2023, 1, false)

      return () => { ro.disconnect(); chart.remove() }
    })
  }, [loadingAuth])

  // ── Load candle data ─────────────────────────────────────────────────────────
  const loadData = useCallback(async (p, tf, y, m, replay) => {
    if (!seriesRef.current) return
    setLoadingData(true)
    setDataError('')
    stopReplay()

    let candles = []
    try {
      candles = await fetchDukascopyCandles(p, tf, y, m)
      if (!candles.length) throw new Error('empty')
    } catch {
      setDataError('Using demo data (Dukascopy unavailable)')
      candles = generateDemoCandles(p, 300)
    }

    allCandlesRef.current = candles
    setTotalCandles(candles.length)
    replayIndexRef.current = candles.length

    if (replay) {
      // Replay mode: show only first candle
      seriesRef.current.setData([candles[0]])
      volumeSeriesRef.current.setData([{ time: candles[0].time, value: candles[0].volume, color: '#1E90FF30' }])
      replayIndexRef.current = 1
      setReplayIndex(1)
      setCurrentCandle(candles[0])
      setReplayMode(true)
    } else {
      // Normal mode: show all
      seriesRef.current.setData(candles)
      volumeSeriesRef.current.setData(candles.map(c => ({
        time: c.time,
        value: c.volume,
        color: c.close >= c.open ? '#22c55e30' : '#ef444430',
      })))
      setCurrentCandle(candles[candles.length - 1])
      setReplayMode(false)
    }

    chartRef.current?.timeScale().fitContent()
    setLoadingData(false)
  }, [])

  // ── Replay controls ──────────────────────────────────────────────────────────
  function stopReplay() {
    if (replayTimerRef.current) { clearInterval(replayTimerRef.current); replayTimerRef.current = null }
    setIsPlaying(false)
  }

  function stepForward() {
    const candles = allCandlesRef.current
    const idx = replayIndexRef.current
    if (idx >= candles.length) { stopReplay(); return }
    const c = candles[idx]
    seriesRef.current?.update(c)
    volumeSeriesRef.current?.update({ time: c.time, value: c.volume, color: c.close >= c.open ? '#22c55e30' : '#ef444430' })
    replayIndexRef.current = idx + 1
    setReplayIndex(idx + 1)
    setCurrentCandle(c)
  }

  function togglePlay() {
    if (!replayMode) return
    if (isPlaying) { stopReplay(); return }
    setIsPlaying(true)
    replayTimerRef.current = setInterval(() => {
      const candles = allCandlesRef.current
      const idx = replayIndexRef.current
      if (idx >= candles.length) { stopReplay(); return }
      const c = candles[idx]
      seriesRef.current?.update(c)
      volumeSeriesRef.current?.update({ time: c.time, value: c.volume, color: c.close >= c.open ? '#22c55e30' : '#ef444430' })
      replayIndexRef.current = idx + 1
      setReplayIndex(idx + 1)
      setCurrentCandle(c)
    }, replaySpeed)
  }

  function resetReplay() {
    stopReplay()
    const candles = allCandlesRef.current
    if (!candles.length) return
    seriesRef.current?.setData([candles[0]])
    volumeSeriesRef.current?.setData([{ time: candles[0].time, value: candles[0].volume, color: '#1E90FF30' }])
    replayIndexRef.current = 1
    setReplayIndex(1)
    setCurrentCandle(candles[0])
  }

  // ── Simulated trading ────────────────────────────────────────────────────────
  function openPosition(side) {
    if (!currentCandle) return
    const price = currentCandle.close
    const pos = {
      id: Date.now(),
      side,
      entry: price,
      lot: lotSize,
      pair,
      time: currentCandle.time,
      candle: replayIndexRef.current,
    }
    setPositions(prev => [...prev, pos])
  }

  function closePosition(id) {
    if (!currentCandle) return
    const price = currentCandle.close
    setPositions(prev => {
      const pos = prev.find(p => p.id === id)
      if (!pos) return prev
      const pipVal = pair.includes('JPY') ? 0.01 : pair.includes('NAS') ? 1 : 0.0001
      const pipDiff = (price - pos.entry) / pipVal * (pos.side === 'buy' ? 1 : -1)
      const pnl = parseFloat((pipDiff * pos.lot * 10).toFixed(2))
      setClosedPnl(c => parseFloat((c + pnl).toFixed(2)))
      setBalance(b => parseFloat((b + pnl).toFixed(2)))
      return prev.filter(p => p.id !== id)
    })
  }

  function getFloatingPnl(pos) {
    if (!currentCandle) return 0
    const pipVal = pair.includes('JPY') ? 0.01 : pair.includes('NAS') ? 1 : 0.0001
    const pipDiff = (currentCandle.close - pos.entry) / pipVal * (pos.side === 'buy' ? 1 : -1)
    return parseFloat((pipDiff * pos.lot * 10).toFixed(2))
  }

  const floatingTotal = positions.reduce((acc, p) => acc + getFloatingPnl(p), 0)
  const equity = parseFloat((balance + floatingTotal).toFixed(2))

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/')
  }

  if (loadingAuth) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      <div className="spinner" />
      <style>{`.spinner{width:32px;height:32px;border:2px solid #1a2035;border-top-color:#1E90FF;border-radius:50%;animation:spin .7s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  return (
    <>
      <Head><title>{pair} · {timeframe} — Forex Simulator</title></Head>

      <div style={s.root}>
        {/* ── TOP BAR ── */}
        <div style={s.topBar}>
          <div style={s.brand}>
            <svg width="18" height="18" viewBox="0 0 28 28" fill="none" style={{ flexShrink: 0 }}>
              <polygon points="14,2 26,9 26,19 14,26 2,19 2,9" stroke="#1E90FF" strokeWidth="1.5" fill="#1E90FF11" />
              <circle cx="14" cy="14" r="3" fill="#1E90FF" />
            </svg>
            <span style={s.brandText}>ALGORITHMIC SUITE</span>
            <span style={s.brandSep}>·</span>
            <span style={s.brandSub}>Forex Simulator</span>
          </div>

          {/* Controls */}
          <div style={s.controls}>
            <select value={pair} onChange={e => { setPair(e.target.value); loadData(e.target.value, timeframe, year, month, replayMode) }}>
              {PAIRS.map(p => <option key={p}>{p}</option>)}
            </select>
            <select value={timeframe} onChange={e => { setTimeframe(e.target.value); loadData(pair, e.target.value, year, month, replayMode) }}>
              {TIMEFRAMES.map(t => <option key={t}>{t}</option>)}
            </select>
            <select value={year} onChange={e => setYear(+e.target.value)}>
              {YEARS.map(y => <option key={y}>{y}</option>)}
            </select>
            <select value={month} onChange={e => setMonth(+e.target.value)}>
              {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
            </select>
            <button className="btn-primary" style={{ padding: '4px 12px', fontSize: 11 }}
              onClick={() => loadData(pair, timeframe, year, month, false)}>
              Load
            </button>
            <button style={{ ...s.replayBtn, background: replayMode ? '#1E90FF22' : '#0d1220', borderColor: replayMode ? '#1E90FF' : '#1a2035' }}
              onClick={() => loadData(pair, timeframe, year, month, true)}>
              ⏱ Replay
            </button>
          </div>

          {/* Account info */}
          <div style={s.accountBar}>
            <div style={s.acctItem}><span style={s.acctLabel}>Balance</span><span style={s.acctVal}>${balance.toLocaleString()}</span></div>
            <div style={s.acctItem}><span style={s.acctLabel}>Equity</span><span style={{ ...s.acctVal, color: equity >= balance ? '#22c55e' : '#ef4444' }}>${equity.toLocaleString()}</span></div>
            <div style={s.acctItem}><span style={s.acctLabel}>P&L</span><span style={{ ...s.acctVal, color: closedPnl >= 0 ? '#22c55e' : '#ef4444' }}>{closedPnl >= 0 ? '+' : ''}${closedPnl}</span></div>
            <button onClick={handleSignOut} style={s.signOutBtn}>Sign out</button>
          </div>
        </div>

        {/* ── REPLAY BAR (only in replay mode) ── */}
        {replayMode && (
          <div style={s.replayBar}>
            <button onClick={resetReplay} style={s.rBtn} title="Reset">⏮</button>
            <button onClick={() => { stopReplay(); stepForward() }} style={s.rBtn} title="Step +1">⏭</button>
            <button onClick={togglePlay} style={{ ...s.rBtn, color: isPlaying ? '#ef4444' : '#22c55e' }}>
              {isPlaying ? '⏸ Pause' : '▶ Play'}
            </button>
            <div style={s.speedWrap}>
              <span style={s.rLabel}>Speed</span>
              <input type="range" min="50" max="2000" step="50" value={replaySpeed}
                onChange={e => { const v = +e.target.value; setReplaySpeed(v); if (isPlaying) { stopReplay(); setTimeout(togglePlay, 50) } }}
                style={{ width: 80, accentColor: '#1E90FF' }} />
              <span style={s.rLabel}>{replaySpeed}ms</span>
            </div>
            <div style={s.progressWrap}>
              <div style={{ ...s.progressBar, width: `${(replayIndex / totalCandles) * 100}%` }} />
            </div>
            <span style={s.rLabel}>{replayIndex} / {totalCandles}</span>
            {currentCandle && (
              <span style={s.rLabel}>
                O <b style={{ color: '#c8d0e0' }}>{currentCandle.open}</b> &nbsp;
                H <b style={{ color: '#22c55e' }}>{currentCandle.high}</b> &nbsp;
                L <b style={{ color: '#ef4444' }}>{currentCandle.low}</b> &nbsp;
                C <b style={{ color: '#1E90FF' }}>{currentCandle.close}</b>
              </span>
            )}
          </div>
        )}

        {/* ── MAIN AREA ── */}
        <div style={s.main}>
          {/* Chart */}
          <div style={s.chartWrap}>
            {loadingData && (
              <div style={s.chartOverlay}>
                <div className="spinner" />
                <span style={{ color: '#4a5568', fontSize: 12, marginTop: 10 }}>Loading candles…</span>
              </div>
            )}
            {dataError && <div style={s.dataErrorBadge}>⚠ {dataError}</div>}
            <div ref={chartContainerRef} style={{ width: '100%', height: '100%' }} />
          </div>

          {/* Sidebar */}
          <div style={s.sidebar}>
            {/* Tabs */}
            <div style={s.tabs}>
              <button onClick={() => setSidebarTab('trade')}
                style={{ ...s.tab, borderBottom: sidebarTab === 'trade' ? '2px solid #1E90FF' : '2px solid transparent', color: sidebarTab === 'trade' ? '#1E90FF' : '#4a5568' }}>
                Trade
              </button>
              <button onClick={() => setSidebarTab('positions')}
                style={{ ...s.tab, borderBottom: sidebarTab === 'positions' ? '2px solid #1E90FF' : '2px solid transparent', color: sidebarTab === 'positions' ? '#1E90FF' : '#4a5568' }}>
                Positions {positions.length > 0 && <span style={s.badge}>{positions.length}</span>}
              </button>
            </div>

            {sidebarTab === 'trade' && (
              <div style={s.sidebarContent}>
                <div style={s.sectionLabel}>INSTRUMENT</div>
                <div style={s.pairDisplay}>{pair}</div>

                {currentCandle && (
                  <div style={s.priceRow}>
                    <div style={s.priceBlock}>
                      <span style={s.priceLabel}>BID</span>
                      <span style={{ ...s.priceVal, color: '#ef4444' }}>{currentCandle.close}</span>
                    </div>
                    <div style={s.priceBlock}>
                      <span style={s.priceLabel}>ASK</span>
                      <span style={{ ...s.priceVal, color: '#22c55e' }}>{(currentCandle.close + 0.00002).toFixed(5)}</span>
                    </div>
                  </div>
                )}

                <div style={s.sectionLabel} className="mt">LOT SIZE</div>
                <div style={s.lotRow}>
                  <button style={s.lotBtn} onClick={() => setLotSize(l => parseFloat(Math.max(0.01, l - 0.01).toFixed(2)))}>−</button>
                  <input type="number" value={lotSize} min="0.01" step="0.01"
                    onChange={e => setLotSize(parseFloat(e.target.value) || 0.01)}
                    style={s.lotInput} />
                  <button style={s.lotBtn} onClick={() => setLotSize(l => parseFloat((l + 0.01).toFixed(2)))}>+</button>
                </div>
                <div style={s.lotPresets}>
                  {[0.01, 0.05, 0.1, 0.5, 1.0].map(v => (
                    <button key={v} onClick={() => setLotSize(v)}
                      style={{ ...s.presetBtn, borderColor: lotSize === v ? '#1E90FF' : '#1a2035', color: lotSize === v ? '#1E90FF' : '#4a5568' }}>
                      {v}
                    </button>
                  ))}
                </div>

                <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                  <button className="btn-buy" style={{ flex: 1 }} onClick={() => openPosition('buy')}>▲ BUY</button>
                  <button className="btn-sell" style={{ flex: 1 }} onClick={() => openPosition('sell')}>▼ SELL</button>
                </div>

                {!replayMode && (
                  <div style={s.replayHint}>
                    <span>💡 Enable <b>Replay mode</b> to trade candle by candle</span>
                  </div>
                )}
              </div>
            )}

            {sidebarTab === 'positions' && (
              <div style={s.sidebarContent}>
                {positions.length === 0 ? (
                  <div style={s.emptyState}>No open positions</div>
                ) : (
                  positions.map(pos => {
                    const pnl = getFloatingPnl(pos)
                    return (
                      <div key={pos.id} style={s.posCard}>
                        <div style={s.posHeader}>
                          <span style={{ ...s.posTag, background: pos.side === 'buy' ? '#22c55e22' : '#ef444422', color: pos.side === 'buy' ? '#22c55e' : '#ef4444' }}>
                            {pos.side.toUpperCase()}
                          </span>
                          <span style={s.posPair}>{pos.pair}</span>
                          <span style={{ ...s.posPnl, color: pnl >= 0 ? '#22c55e' : '#ef4444' }}>
                            {pnl >= 0 ? '+' : ''}${pnl}
                          </span>
                        </div>
                        <div style={s.posDetail}>
                          <span>Entry: <b>{pos.entry}</b></span>
                          <span>Lot: <b>{pos.lot}</b></span>
                        </div>
                        <button onClick={() => closePosition(pos.id)} style={s.closeBtn}>Close</button>
                      </div>
                    )
                  })
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <style>{`
        .spinner{width:32px;height:32px;border:2px solid #1a2035;border-top-color:#1E90FF;border-radius:50%;animation:spin .7s linear infinite}
        @keyframes spin{to{transform:rotate(360deg)}}
        .mt{margin-top:14px!important}
      `}</style>
    </>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = {
  root: { display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', background: '#080c14' },

  topBar: {
    display: 'flex', alignItems: 'center', gap: 16,
    padding: '0 16px', height: 48, flexShrink: 0,
    background: '#0a0f1a', borderBottom: '1px solid #1a2035',
  },
  brand: { display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 },
  brandText: { fontSize: 10, fontWeight: 800, letterSpacing: 2, color: '#1E90FF' },
  brandSep: { color: '#2a3448', fontSize: 12 },
  brandSub: { fontSize: 11, fontWeight: 500, color: '#4a5568' },
  controls: { display: 'flex', alignItems: 'center', gap: 6, flex: 1 },
  replayBtn: {
    border: '1px solid', borderRadius: 5, padding: '4px 10px',
    fontSize: 11, fontWeight: 600, cursor: 'pointer', color: '#c8d0e0', transition: 'all .15s',
  },
  accountBar: { display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 },
  acctItem: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end' },
  acctLabel: { fontSize: 9, color: '#4a5568', fontWeight: 600, letterSpacing: 0.5 },
  acctVal: { fontSize: 12, fontWeight: 700, color: '#c8d0e0' },
  signOutBtn: {
    background: 'none', border: '1px solid #1a2035', borderRadius: 5,
    color: '#4a5568', fontSize: 10, fontWeight: 600, padding: '3px 8px', cursor: 'pointer',
  },

  replayBar: {
    display: 'flex', alignItems: 'center', gap: 12, padding: '6px 16px', flexShrink: 0,
    background: '#0a0f1a', borderBottom: '1px solid #1E90FF20',
  },
  rBtn: {
    background: '#0d1220', border: '1px solid #1a2035', borderRadius: 5,
    color: '#c8d0e0', fontSize: 12, fontWeight: 600, padding: '3px 10px', cursor: 'pointer',
  },
  speedWrap: { display: 'flex', alignItems: 'center', gap: 6 },
  rLabel: { fontSize: 10, color: '#4a5568', fontWeight: 500 },
  progressWrap: { flex: 1, height: 4, background: '#1a2035', borderRadius: 2, overflow: 'hidden' },
  progressBar: { height: '100%', background: 'linear-gradient(90deg,#1E90FF,#22c55e)', borderRadius: 2, transition: 'width .1s' },

  main: { display: 'flex', flex: 1, overflow: 'hidden' },
  chartWrap: { flex: 1, position: 'relative', overflow: 'hidden' },
  chartOverlay: {
    position: 'absolute', inset: 0, zIndex: 10,
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    background: '#080c14cc',
  },
  dataErrorBadge: {
    position: 'absolute', top: 10, left: 10, zIndex: 5,
    background: '#f59e0b15', border: '1px solid #f59e0b30',
    borderRadius: 5, padding: '4px 10px', fontSize: 10, color: '#f59e0b', fontWeight: 600,
  },

  sidebar: {
    width: 220, flexShrink: 0, background: '#0a0f1a',
    borderLeft: '1px solid #1a2035', display: 'flex', flexDirection: 'column',
  },
  tabs: { display: 'flex', borderBottom: '1px solid #1a2035' },
  tab: {
    flex: 1, padding: '10px 0', fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
    background: 'none', border: 'none', cursor: 'pointer', transition: 'color .15s',
  },
  badge: {
    display: 'inline-block', background: '#1E90FF', color: '#fff',
    borderRadius: 8, fontSize: 9, fontWeight: 700, padding: '1px 5px', marginLeft: 4,
  },
  sidebarContent: { flex: 1, padding: 14, overflowY: 'auto', display: 'flex', flexDirection: 'column' },
  sectionLabel: { fontSize: 9, fontWeight: 700, letterSpacing: 1.5, color: '#4a5568', marginBottom: 6 },
  pairDisplay: { fontSize: 18, fontWeight: 800, color: '#ffffff', marginBottom: 12 },
  priceRow: { display: 'flex', gap: 8, marginBottom: 14 },
  priceBlock: {
    flex: 1, background: '#0d1220', border: '1px solid #1a2035',
    borderRadius: 6, padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 2,
  },
  priceLabel: { fontSize: 9, color: '#4a5568', fontWeight: 700 },
  priceVal: { fontSize: 12, fontWeight: 700 },
  lotRow: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 },
  lotBtn: {
    width: 28, height: 28, background: '#0d1220', border: '1px solid #1a2035',
    borderRadius: 5, color: '#c8d0e0', fontSize: 16, cursor: 'pointer', fontWeight: 700,
  },
  lotInput: {
    flex: 1, background: '#0d1220', border: '1px solid #1a2035',
    borderRadius: 5, color: '#fff', fontSize: 13, fontWeight: 700,
    textAlign: 'center', padding: '4px', outline: 'none',
  },
  lotPresets: { display: 'flex', gap: 4, flexWrap: 'wrap' },
  presetBtn: {
    background: '#0d1220', border: '1px solid', borderRadius: 4,
    fontSize: 10, fontWeight: 600, padding: '3px 7px', cursor: 'pointer', transition: 'all .12s',
  },
  replayHint: {
    marginTop: 'auto', paddingTop: 16, borderTop: '1px solid #1a2035',
    fontSize: 10, color: '#4a5568', lineHeight: 1.5,
  },
  emptyState: { color: '#4a5568', fontSize: 11, textAlign: 'center', paddingTop: 30 },
  posCard: {
    background: '#0d1220', border: '1px solid #1a2035',
    borderRadius: 8, padding: 10, marginBottom: 8,
  },
  posHeader: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 },
  posTag: { fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 3 },
  posPair: { fontSize: 11, fontWeight: 700, color: '#c8d0e0', flex: 1 },
  posPnl: { fontSize: 12, fontWeight: 700 },
  posDetail: { display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#4a5568', marginBottom: 8 },
  closeBtn: {
    width: '100%', background: '#ef444415', border: '1px solid #ef444430',
    borderRadius: 5, color: '#ef4444', fontSize: 10, fontWeight: 700, padding: '5px', cursor: 'pointer',
  },
}
