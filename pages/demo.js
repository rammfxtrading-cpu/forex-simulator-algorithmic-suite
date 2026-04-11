// pages/demo.js — Lightweight Charts v5 compatible
import { useEffect, useRef, useState, useCallback } from 'react';
import Head from 'next/head';

const PAIRS = ['EURUSD','GBPUSD','AUDUSD','NZDUSD','USDCHF','USDCAD','USDJPY','AUDCAD'];
const TIMEFRAMES = ['M5','M15','M30','H1','H4','D1'];
const YEARS = ['2023'];
const REPLAY_SPEEDS = [1, 2, 5, 10, 20];

export default function Demo() {
  const chartContainerRef = useRef(null);
  const chartRef          = useRef(null);
  const seriesRef         = useRef(null);
  const allCandlesRef     = useRef([]);
  const replayIndexRef    = useRef(0);
  const intervalRef       = useRef(null);

  const [pair, setPair]           = useState('EURUSD');
  const [timeframe, setTimeframe] = useState('H1');
  const [year, setYear]           = useState('2023');
  const [speed, setSpeed]         = useState(1);
  const [playing, setPlaying]     = useState(false);
  const [loading, setLoading]     = useState(false);
  const [progress, setProgress]   = useState(0);
  const [currentCandle, setCurrentCandle] = useState(null);
  const [error, setError]         = useState(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    import('lightweight-charts').then((LW) => {
      if (!chartContainerRef.current) return;
      const chart = LW.createChart(chartContainerRef.current, {
        width:  chartContainerRef.current.clientWidth,
        height: chartContainerRef.current.clientHeight,
        layout: {
          background: { type: 'solid', color: '#0a0a0a' },
          textColor:  '#c8c8c8',
        },
        grid: {
          vertLines: { color: '#1a1a2e' },
          horzLines: { color: '#1a1a2e' },
        },
        crosshair: { mode: 1 },
        rightPriceScale: { borderColor: '#1E90FF' },
        timeScale: {
          borderColor:    '#1E90FF',
          timeVisible:    true,
          secondsVisible: false,
        },
      });

      const series = chart.addSeries(LW.CandlestickSeries, {
        upColor:         '#00d4aa',
        downColor:       '#ff4757',
        borderUpColor:   '#00d4aa',
        borderDownColor: '#ff4757',
        wickUpColor:     '#00d4aa',
        wickDownColor:   '#ff4757',
      });

      chartRef.current  = chart;
      seriesRef.current = series;

      const handleResize = () => {
        if (chartContainerRef.current) {
          chart.applyOptions({
            width:  chartContainerRef.current.clientWidth,
            height: chartContainerRef.current.clientHeight,
          });
        }
      };
      window.addEventListener('resize', handleResize);
      return () => {
        window.removeEventListener('resize', handleResize);
        chart.remove();
      };
    });
  }, []);

  const stopReplay = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setPlaying(false);
  }, []);

  const loadData = useCallback(async () => {
    if (!seriesRef.current) return;
    setLoading(true);
    setError(null);
    stopReplay();
    try {
      const res = await fetch('/api/dukascopy?pair=' + pair + '&timeframe=' + timeframe + '&year=' + year);
      if (!res.ok) throw new Error('Datos no disponibles aún');
      const candles = await res.json();
      if (!candles.length) throw new Error('Sin velas para este par/timeframe');
      allCandlesRef.current  = candles;
      replayIndexRef.current = 50;
      const initial = candles.slice(0, 50);
      seriesRef.current.setData(initial);
      chartRef.current.timeScale().fitContent();
      setProgress(Math.round((50 / candles.length) * 100));
      setCurrentCandle(initial[initial.length - 1]);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [pair, timeframe, year, stopReplay]);

  useEffect(() => {
    const timer = setTimeout(() => loadData(), 600);
    return () => clearTimeout(timer);
  }, [loadData]);

  const startReplay = useCallback(() => {
    if (!allCandlesRef.current.length) return;
    setPlaying(true);
    intervalRef.current = setInterval(() => {
      const idx = replayIndexRef.current;
      const all = allCandlesRef.current;
      if (idx >= all.length) { stopReplay(); return; }
      seriesRef.current.update(all[idx]);
      replayIndexRef.current = idx + 1;
      setProgress(Math.round((idx / all.length) * 100));
      setCurrentCandle(all[idx]);
    }, Math.max(50, 500 / speed));
  }, [speed, stopReplay]);

  const stepForward = useCallback(() => {
    const idx = replayIndexRef.current;
    const all = allCandlesRef.current;
    if (idx >= all.length) return;
    seriesRef.current.update(all[idx]);
    replayIndexRef.current = idx + 1;
    setProgress(Math.round((idx / all.length) * 100));
    setCurrentCandle(all[idx]);
  }, []);

  const togglePlay = () => playing ? stopReplay() : startReplay();

  return (
    <>
      <Head>
        <title>Forex Simulator — Algorithmic Suite</title>
      </Head>
      <div style={{ display:'flex', flexDirection:'column', height:'100vh', background:'#000', color:'#fff', fontFamily:'Montserrat, sans-serif' }}>
        <div style={{ display:'flex', alignItems:'center', gap:12, padding:'8px 16px', background:'#0a0a0a', borderBottom:'1px solid #1E90FF33', flexWrap:'wrap' }}>
          <span style={{ color:'#1E90FF', fontWeight:700, fontSize:14, marginRight:8 }}>⚡ Algorithmic Suite</span>
          <select value={pair} onChange={e => { stopReplay(); setPair(e.target.value); }} style={selectStyle}>
            {PAIRS.map(p => <option key={p}>{p}</option>)}
          </select>
          <div style={{ display:'flex', gap:4 }}>
            {TIMEFRAMES.map(tf => (
              <button key={tf} onClick={() => { stopReplay(); setTimeframe(tf); }}
                style={{ ...btnStyle, background: timeframe===tf ? '#1E90FF' : '#111', color: timeframe===tf ? '#fff' : '#888' }}>
                {tf}
              </button>
            ))}
          </div>
          <select value={year} onChange={e => { stopReplay(); setYear(e.target.value); }} style={selectStyle}>
            {YEARS.map(y => <option key={y}>{y}</option>)}
          </select>
          <div style={{ flex:1 }} />
          {currentCandle && (
            <div style={{ fontSize:12, color:'#888', display:'flex', gap:12 }}>
              <span>O <b style={{ color:'#fff' }}>{currentCandle.open}</b></span>
              <span>H <b style={{ color:'#00d4aa' }}>{currentCandle.high}</b></span>
              <span>L <b style={{ color:'#ff4757' }}>{currentCandle.low}</b></span>
              <span>C <b style={{ color:'#fff' }}>{currentCandle.close}</b></span>
            </div>
          )}
        </div>
        <div style={{ flex:1, position:'relative' }}>
          <div ref={chartContainerRef} style={{ width:'100%', height:'100%' }} />
          {loading && (
            <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', background:'#000a', fontSize:16, color:'#1E90FF' }}>
              Loading {pair} {timeframe}...
            </div>
          )}
          {error && (
            <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', background:'#000a', fontSize:14, color:'#ff4757', textAlign:'center', padding:24, flexDirection:'column', gap:8 }}>
              <span>⚠️ {error}</span>
              <span style={{ color:'#888', fontSize:12 }}>Los datos se están descargando. Inténtalo en unos minutos.</span>
            </div>
          )}
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 16px', background:'#0a0a0a', borderTop:'1px solid #1E90FF33' }}>
          <button onClick={togglePlay} style={{ ...btnStyle, background: playing ? '#ff4757' : '#1E90FF', color:'#fff', padding:'8px 20px', fontSize:16 }}>
            {playing ? '⏸' : '▶'}
          </button>
          <button onClick={stepForward} style={{ ...btnStyle, background:'#111', color:'#fff', padding:'8px 14px' }}>⏭</button>
          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
            <span style={{ fontSize:11, color:'#666' }}>Speed</span>
            {REPLAY_SPEEDS.map(s => (
              <button key={s} onClick={() => setSpeed(s)} style={{ ...btnStyle, background: speed===s ? '#1E90FF33' : '#111', color: speed===s ? '#1E90FF' : '#666', fontSize:11 }}>
                {s}x
              </button>
            ))}
          </div>
          <div style={{ flex:1, height:4, background:'#1a1a1a', borderRadius:2 }}>
            <div style={{ height:'100%', borderRadius:2, background:'#1E90FF', width: progress+'%', transition:'width 0.1s' }} />
          </div>
          <span style={{ fontSize:11, color:'#555' }}>{progress}%</span>
        </div>
      </div>
    </>
  );
}

const selectStyle = { background:'#111', color:'#fff', border:'1px solid #1E90FF44', borderRadius:4, padding:'4px 8px', fontSize:13, cursor:'pointer' };
const btnStyle = { border:'none', borderRadius:4, padding:'4px 10px', fontSize:12, cursor:'pointer', transition:'all 0.15s' };
