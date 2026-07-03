import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/useAuth'
import NoAccess from '../components/NoAccess'
import AppSidebar from '../components/AppSidebar'
import { MC_MAX_SIMS, MC_MAX_TRADES, deriveParams, runMontecarlo } from '../lib/metrics/montecarlo'

const SESSIONS_LABEL = 'All Sessions'

export default function Analytics() {
  const router = useRouter()
  const { user, profile, loading: authLoading, hasAccess } = useAuth('simulador_activo')
  const bgCanvasRef = useRef(null)
  const [sessions, setSessions] = useState([])
  const [trades, setTrades] = useState([])
  const [selectedSession, setSelectedSession] = useState(SESSIONS_LABEL)
  const [loading, setLoading] = useState(true)
  const [mcFields, setMcFields] = useState(null)
  const [mcResult, setMcResult] = useState(null)

  useEffect(() => {
    if (authLoading || !user || !hasAccess) return
    loadData(user.id)
  }, [authLoading, user, hasAccess])

  // Red cósmica de fondo — mismo patrón que dashboard y admin
  useEffect(() => {
    const canvas = bgCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    canvas.width = window.innerWidth
    canvas.height = window.innerHeight
    const nodes = []
    for (let i = 0; i < 60; i++) {
      nodes.push({ x: Math.random()*canvas.width, y: Math.random()*canvas.height, vx:(Math.random()-.5)*.3, vy:(Math.random()-.5)*.3, r:Math.random()*1.8+0.5 })
    }
    let id, lastT = 0
    function draw(ts) {
      id = requestAnimationFrame(draw)
      if (document.hidden) return
      if (ts - lastT < 33) return
      lastT = ts
      ctx.clearRect(0,0,canvas.width,canvas.height)
      for (let i=0;i<nodes.length;i++) for (let j=i+1;j<nodes.length;j++) {
        const dx=nodes[i].x-nodes[j].x, dy=nodes[i].y-nodes[j].y, d=Math.sqrt(dx*dx+dy*dy)
        if (d<180) { ctx.strokeStyle=`rgba(0,100,255,${(1-d/180)*.4})`; ctx.lineWidth=.6; ctx.beginPath(); ctx.moveTo(nodes[i].x,nodes[i].y); ctx.lineTo(nodes[j].x,nodes[j].y); ctx.stroke() }
      }
      nodes.forEach(n => { ctx.beginPath(); ctx.arc(n.x, n.y, n.r*1.2, 0, Math.PI*2); ctx.fillStyle='rgba(255,255,255,0.85)'; ctx.fill(); n.x+=n.vx; n.y+=n.vy; if(n.x<0||n.x>canvas.width)n.vx*=-1; if(n.y<0||n.y>canvas.height)n.vy*=-1 })
    }
    draw(0)
    const onResize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight }
    window.addEventListener('resize', onResize)
    return () => { cancelAnimationFrame(id); window.removeEventListener('resize', onResize) }
  }, [authLoading, hasAccess, loading])

  // Si el usuario está autenticado pero no tiene acceso al simulador, mostrar pantalla de bloqueo.
  if (!authLoading && !hasAccess) {
    return <NoAccess profile={profile} producto="Simulador" />
  }

  async function loadData(userId) {
    const [{ data: sess }, { data: tr }] = await Promise.all([
      supabase.from('sim_sessions').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
      supabase.from('sim_trades').select('*').eq('user_id', userId).order('opened_at', { ascending: true })
    ])
    setSessions(sess || [])
    setTrades(tr || [])
    setLoading(false)
  }

  // Filter trades by selected session
  const filteredTrades = selectedSession === SESSIONS_LABEL
    ? trades
    : trades.filter(t => t.session_id === sessions.find(s => s.name === selectedSession)?.id)

  // Stats calculations
  const closedTrades = filteredTrades.filter(t => t.result && t.result !== 'OPEN')
  const wins = closedTrades.filter(t => t.result === 'WIN')
  const losses = closedTrades.filter(t => t.result === 'LOSS')
  const breakevens = closedTrades.filter(t => t.result === 'BREAKEVEN')
  const totalPnl = closedTrades.reduce((s, t) => s + (t.pnl || 0), 0)
  const winRate = closedTrades.length > 0 ? (wins.length / closedTrades.length * 100) : 0
  const avgRR = wins.length > 0 ? wins.reduce((s, t) => s + (t.rr || 0), 0) / wins.length : 0
  const bestWin = wins.length > 0 ? Math.max(...wins.map(t => t.pnl || 0)) : 0
  const worstLoss = losses.length > 0 ? Math.min(...losses.map(t => t.pnl || 0)) : 0
  const avgWin = wins.length > 0 ? wins.reduce((s, t) => s + (t.pnl || 0), 0) / wins.length : 0
  const avgLoss = losses.length > 0 ? losses.reduce((s, t) => s + (t.pnl || 0), 0) / losses.length : 0

  // Session balance for selected
  const selectedSessionData = sessions.find(s => s.name === selectedSession)
  const initialBalance = selectedSession === SESSIONS_LABEL
    ? sessions.reduce((s, sess) => s + (parseFloat(sess.capital) || 0), 0)
    : parseFloat(selectedSessionData?.capital || 0)
  const currentBalance = initialBalance + totalPnl

  // Equity curve data points
  const equityPoints = (() => {
    let running = initialBalance
    return [{ x: 0, y: running }, ...closedTrades.map((t, i) => {
      running += (t.pnl || 0)
      return { x: i + 1, y: running }
    })]
  })()

  // Sessions by type
  const sessionStats = {
    london: filteredTrades.filter(t => t.session_type === 'london'),
    nyam: filteredTrades.filter(t => t.session_type === 'nyam'),
    nypm: filteredTrades.filter(t => t.session_type === 'nypm'),
    asia: filteredTrades.filter(t => t.session_type === 'asia'),
    out: filteredTrades.filter(t => !t.session_type),
  }

  // Monte Carlo — precargas desde la estadística real bajo el filtro vigente (montecarlo-plan.md §2.2)
  const mcDerived = deriveParams(closedTrades)
  const mcFmt = v => String(Math.round(v * 100) / 100)
  const mcDefaults = {
    nSims: String(MC_MAX_SIMS),
    nTrades: String(MC_MAX_TRADES),
    startBalance: mcFmt(initialBalance),
    winRate: mcFmt(mcDerived.winRate),
    avgGain: mcFmt(mcDerived.avgGain),
    avgLoss: mcFmt(mcDerived.avgLoss),
  }
  const mcVals = mcFields || mcDefaults
  const runMc = () => {
    setMcResult(runMontecarlo({
      nSims: Number(mcVals.nSims),
      nTrades: Number(mcVals.nTrades),
      startBalance: Number(mcVals.startBalance),
      winRate: Number(mcVals.winRate),
      avgGain: Number(mcVals.avgGain),
      avgLoss: Number(mcVals.avgLoss),
      seed: Date.now() % 2147483647,
    }))
  }

  // Equity curve SVG path
  const buildPath = (points) => {
    if (points.length < 2) return ''
    const maxY = Math.max(...points.map(p => p.y))
    const minY = Math.min(...points.map(p => p.y))
    const rangeY = maxY - minY || 1
    const W = 800, H = 160
    return points.map((p, i) => {
      const x = (p.x / (points.length - 1)) * W
      const y = H - ((p.y - minY) / rangeY) * (H - 20) - 10
      return `${i === 0 ? 'M' : 'L'}${x},${y}`
    }).join(' ')
  }

  const equityPath = buildPath(equityPoints)
  const hasTrades = closedTrades.length > 0

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#000' }}>
      <div className="spinner" />
      <style>{`.spinner{width:32px;height:32px;border:2px solid #0a1628;border-top-color:#1E90FF;border-radius:50%;animation:spin .7s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  return (
    <div style={s.root}>
      <canvas ref={bgCanvasRef} style={s.bgCanvas}/>
      {/* SIDEBAR */}
      <AppSidebar active="analytics" user={user} profile={profile} />

      {/* MAIN */}
      <div style={s.main} className="appMain">
        {/* HEADER */}
        <div style={s.header}>
          <div>
            <div style={s.headerTitle}>Analytics</div>
            <div style={s.headerSub}>Track your backtesting performance</div>
          </div>
          {/* Session Filter */}
          <select style={s.sessionFilter} value={selectedSession} onChange={e => { setSelectedSession(e.target.value); setMcFields(null); setMcResult(null) }}>
            <option>{SESSIONS_LABEL}</option>
            {sessions.map(s => <option key={s.id}>{s.name}</option>)}
          </select>
        </div>

        {!hasTrades ? (
          <div style={s.emptyCard}>
            <div style={{ fontSize: 40, marginBottom: 16, opacity: 0.3 }}>⟨∿⟩</div>
            <div style={s.emptyTitle}>No trades yet</div>
            <div style={s.emptySub}>Complete backtesting sessions to see your analytics here.</div>
            <button onClick={() => router.push('/dashboard')} style={s.startBtn}>Start a Session →</button>
          </div>
        ) : (
          <>
            {/* TOP STATS */}
            <div style={s.statsRow}>
              {[
                { label: 'TOTAL P&L', value: `${totalPnl >= 0 ? '+' : ''}$${totalPnl.toFixed(2)}`, color: totalPnl >= 0 ? '#22c55e' : '#ef4444' },
                { label: 'ACCOUNT BALANCE', value: `$${currentBalance.toFixed(2)}`, color: '#fff' },
                { label: 'WIN RATE', value: `${winRate.toFixed(1)}%`, color: winRate >= 50 ? '#22c55e' : '#ef4444' },
                { label: 'TOTAL TRADES', value: closedTrades.length, color: '#1E90FF' },
                { label: 'AVG R:R', value: avgRR.toFixed(2), color: '#f59e0b' },
              ].map(stat => (
                <div key={stat.label} style={s.statCard}>
                  <div style={s.statLabel}>{stat.label}</div>
                  <div style={{ ...s.statValue, color: stat.color }}>{stat.value}</div>
                </div>
              ))}
            </div>

            {/* EQUITY CURVE */}
            <div style={s.chartCard}>
              <div style={s.cardTitle}>Equity Curve</div>
              <svg viewBox="0 0 800 160" style={{ width: '100%', height: 160 }} preserveAspectRatio="none">
                <defs>
                  <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#1E90FF" stopOpacity="0.3" />
                    <stop offset="100%" stopColor="#1E90FF" stopOpacity="0" />
                  </linearGradient>
                </defs>
                {equityPath && <>
                  <path d={`${equityPath} L800,160 L0,160 Z`} fill="url(#eqGrad)" />
                  <path d={equityPath} fill="none" stroke="#1E90FF" strokeWidth="2" />
                </>}
              </svg>
            </div>

            {/* SUMMARY CARDS */}
            <div style={s.twoCol}>
              {/* Winning Trades */}
              <div style={s.summaryCard}>
                <div style={{ ...s.cardTitle, color: '#22c55e' }}>Winning Trades</div>
                <div style={s.summaryGrid}>
                  {[
                    ['Total Winners', wins.length],
                    ['Best Win', `$${bestWin.toFixed(2)}`],
                    ['Average Win', `$${avgWin.toFixed(2)}`],
                  ].map(([label, value]) => (
                    <div key={label} style={s.summaryRow}>
                      <span style={s.summaryLabel}>{label}</span>
                      <span style={{ ...s.summaryValue, color: '#22c55e' }}>{value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Losing Trades */}
              <div style={s.summaryCard}>
                <div style={{ ...s.cardTitle, color: '#ef4444' }}>Losing Trades</div>
                <div style={s.summaryGrid}>
                  {[
                    ['Total Losers', losses.length],
                    ['Worst Loss', `$${worstLoss.toFixed(2)}`],
                    ['Average Loss', `$${avgLoss.toFixed(2)}`],
                  ].map(([label, value]) => (
                    <div key={label} style={s.summaryRow}>
                      <span style={s.summaryLabel}>{label}</span>
                      <span style={{ ...s.summaryValue, color: '#ef4444' }}>{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* W/L/BE DONUT + SESSIONS */}
            <div style={s.twoCol}>
              {/* Donut */}
              <div style={s.summaryCard}>
                <div style={s.cardTitle}>Distribution</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 32, marginTop: 16 }}>
                  <svg viewBox="0 0 120 120" style={{ width: 120, height: 120, flexShrink: 0 }}>
                    {(() => {
                      const total = wins.length + losses.length + breakevens.length || 1
                      const segments = [
                        { val: wins.length / total, color: '#22c55e' },
                        { val: losses.length / total, color: '#ef4444' },
                        { val: breakevens.length / total, color: '#f59e0b' },
                      ]
                      let offset = 0
                      const r = 45, cx = 60, cy = 60, stroke = 18
                      const circ = 2 * Math.PI * r
                      return segments.map((seg, i) => {
                        const dash = seg.val * circ
                        const gap = circ - dash
                        const el = (
                          <circle key={i} cx={cx} cy={cy} r={r}
                            fill="none" stroke={seg.color} strokeWidth={stroke}
                            strokeDasharray={`${dash} ${gap}`}
                            strokeDashoffset={-offset * circ}
                            style={{ transform: 'rotate(-90deg)', transformOrigin: '60px 60px' }} />
                        )
                        offset += seg.val
                        return el
                      })
                    })()}
                  </svg>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {[
                      { label: 'Wins', count: wins.length, color: '#22c55e' },
                      { label: 'Losses', count: losses.length, color: '#ef4444' },
                      { label: 'Breakeven', count: breakevens.length, color: '#f59e0b' },
                    ].map(item => (
                      <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 10, height: 10, borderRadius: '50%', background: item.color }} />
                        <span style={{ fontSize: 12, color: '#a0b8d0' }}>{item.label}</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: '#fff', marginLeft: 'auto' }}>{item.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Sessions breakdown */}
              <div style={s.summaryCard}>
                <div style={s.cardTitle}>Trades by Session</div>
                <div style={s.summaryGrid}>
                  {[
                    ['London', sessionStats.london.length, '#1E90FF'],
                    ['NY AM', sessionStats.nyam.length, '#f59e0b'],
                    ['NY PM', sessionStats.nypm.length, '#2dd4bf'],
                    ['Asia', sessionStats.asia.length, '#a855f7'],
                    ['Out of Session', sessionStats.out.length, '#6b7280'],
                  ].map(([label, count, color]) => (
                    <div key={label} style={s.summaryRow}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
                        <span style={s.summaryLabel}>{label}</span>
                      </div>
                      <span style={{ ...s.summaryValue, color }}>{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* MONTE CARLO SIMULATION */}
            <div style={s.chartCard}>
              <div style={s.cardTitle}>Monte Carlo Simulation</div>
              <div style={s.mcControls}>
                {[
                  ['nSims', 'N° Simulations (max 100)'],
                  ['nTrades', 'Trades per sim. (max 100)'],
                  ['startBalance', 'Start balance ($)'],
                  ['winRate', 'Win rate (%)'],
                  ['avgGain', 'Avg. Gain ($)'],
                  ['avgLoss', 'Avg. Loss ($)'],
                ].map(([key, label]) => (
                  <div key={key} style={s.mcField}>
                    <div style={s.mcFieldLabel}>{label}</div>
                    <input style={s.mcInput} type="number" value={mcVals[key]}
                      onChange={e => setMcFields({ ...mcVals, [key]: e.target.value })} />
                  </div>
                ))}
              </div>
              <div style={s.mcBtnRow}>
                <button style={s.mcResetBtn} onClick={() => setMcFields(null)}>Reset values</button>
                <button style={s.mcStartBtn} onClick={runMc}>Start simulation</button>
              </div>
              {mcResult && (() => {
                const curves = mcResult.curves
                const n = curves[0].length - 1
                let lo = Infinity, hi = -Infinity
                for (const c of curves) for (const v of c) { if (v < lo) lo = v; if (v > hi) hi = v }
                const range = hi - lo || 1
                const W = 800, H = 220
                const colors = ['#1E90FF', '#22c55e', '#ef4444', '#f59e0b', '#a855f7', '#2dd4bf', '#e879f9', '#facc15']
                return (
                  <>
                    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 220, marginTop: 8 }} preserveAspectRatio="none">
                      {curves.map((c, i) => (
                        <path key={i}
                          d={c.map((v, j) => `${j === 0 ? 'M' : 'L'}${(j / n) * W},${H - ((v - lo) / range) * (H - 20) - 10}`).join(' ')}
                          fill="none" stroke={colors[i % colors.length]} strokeWidth="1" opacity="0.7" />
                      ))}
                    </svg>
                    <div style={s.mcStatsGrid}>
                      {[
                        ['Average balance', `$${mcResult.stats.avgBalance.toFixed(2)}`],
                        ['Max balance', `$${mcResult.stats.maxBalance.toFixed(2)}`],
                        ['Min balance', `$${mcResult.stats.minBalance.toFixed(2)}`],
                        ['Average profit factor', mcResult.stats.avgProfitFactor === null ? '—' : mcResult.stats.avgProfitFactor.toFixed(2)],
                        ['Max consecutive wins', mcResult.stats.maxConsecWins],
                        ['Max consecutive losses', mcResult.stats.maxConsecLosses],
                        ['Total wins', mcResult.stats.totalWins],
                        ['Total losses', mcResult.stats.totalLosses],
                      ].map(([label, value]) => (
                        <div key={label} style={s.mcStat}>
                          <div style={s.mcStatLabel}>{label}</div>
                          <div style={s.mcStatValue}>{value}</div>
                        </div>
                      ))}
                    </div>
                  </>
                )
              })()}
            </div>

            {/* JOURNAL DE OPERACIONES — réplica del dashboard, mismos datos del filtro vigente */}
            {closedTrades.length > 0 && (
              <div style={{borderRadius:12,padding:'20px 24px',marginBottom:20,background:'rgba(4,10,24,0.7)',border:'1px solid rgba(30,144,255,0.18)'}}>
                <div style={{fontSize:11,fontWeight:700,color:'rgba(30,144,255,0.9)',letterSpacing:1,marginBottom:16,textTransform:'uppercase'}}>Journal de Operaciones</div>
                <div style={{overflowX:'auto'}}>
                  <table style={{width:'100%',borderCollapse:'collapse',fontSize:11}}>
                    <thead>
                      <tr>
                        {['SESIÓN','PAR','DIR','ENTRADA','SALIDA','LOTS','SL','TP','R:R','P&L','RESULTADO'].map(h=>(
                          <th key={h} style={{padding:'6px 12px',textAlign:'left',color:'rgba(30,144,255,0.9)',fontWeight:700,fontSize:8,letterSpacing:1,borderBottom:'1px solid rgba(30,144,255,0.2)',whiteSpace:'nowrap'}}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {closedTrades.slice().reverse().map((t,i)=>{
                        const sess=sessions.find(s=>s.id===t.session_id)
                        const pnlColor=t.pnl>0?'#22c55e':t.pnl<0?'#ef4444':'#a0b8d0'
                        const resColor=t.result==='WIN'?'#22c55e':t.result==='LOSS'?'#ef4444':'#a0b8d0'
                        return(
                          <tr key={i} style={{borderBottom:'1px solid rgba(30,144,255,0.15)'}}>
                            <td style={{padding:'7px 12px',color:'rgba(255,255,255,0.85)',whiteSpace:'nowrap',fontSize:10}}>{sess?.name||'—'}</td>
                            <td style={{padding:'7px 12px',color:'#ffffff',fontWeight:700}}>{t.pair}</td>
                            <td style={{padding:'7px 12px',color:t.side==='BUY'?'#1E90FF':'#ef4444',fontWeight:800}}>{t.side}</td>
                            <td style={{padding:'7px 12px',color:'#ffffff',fontFamily:'monospace'}}>{parseFloat(t.entry_price||0).toFixed(5)}</td>
                            <td style={{padding:'7px 12px',color:'#ffffff',fontFamily:'monospace'}}>{parseFloat(t.exit_price||0).toFixed(5)}</td>
                            <td style={{padding:'7px 12px',color:'#ffffff'}}>{t.lots}</td>
                            <td style={{padding:'7px 12px',color:'rgba(239,83,80,0.7)'}}>{t.sl_price?.toFixed(5)||'—'}</td>
                            <td style={{padding:'7px 12px',color:'rgba(30,144,255,0.7)'}}>{t.tp_price?.toFixed(5)||'—'}</td>
                            <td style={{padding:'7px 12px',color:'#f59e0b',fontWeight:700}}>{parseFloat(t.rr||0).toFixed(1)}R</td>
                            <td style={{padding:'7px 12px',color:pnlColor,fontWeight:700}}>{t.pnl>=0?'+':''}{parseFloat(t.pnl||0).toFixed(2)}</td>
                            <td style={{padding:'7px 12px',fontWeight:700}}>
                              <span style={{color:resColor,background:t.result==='WIN'?'rgba(34,197,94,0.1)':t.result==='LOSS'?'rgba(239,68,68,0.1)':'rgba(160,184,208,0.1)',padding:'2px 8px',borderRadius:4,fontSize:9,letterSpacing:0.5}}>{t.result}</span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <style>{`
        *{box-sizing:border-box;margin:0;padding:0}
        body{background:#000;overflow:hidden}
        select option{background:#030f20;color:#fff}
        @keyframes spin{to{transform:rotate(360deg)}}
        @media(max-width:767px){
          .appMain{padding:76px 16px 24px !important}
        }
      `}</style>
    </div>
  )
}

const s = {
  root: { display: 'flex', height: '100vh', overflow: 'hidden', background: '#000', fontFamily: "'Montserrat',sans-serif", position: 'relative' },
  bgCanvas: { position: 'fixed', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 0 },
  main: { position: 'relative', zIndex: 1, flex: 1, overflowY: 'auto', padding: '32px 40px' },
  header: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28 },
  headerTitle: { fontSize: 26, fontWeight: 800, color: '#ffffff', marginBottom: 4 },
  headerSub: { fontSize: 13, color: '#c0d0e8' },
  sessionFilter: { background: '#030f20', border: '1px solid #0d2040', borderRadius: 8, padding: '10px 16px', fontSize: 12, color: '#fff', outline: 'none', fontFamily: 'Montserrat,sans-serif', cursor: 'pointer', minWidth: 180 },
  statsRow: { display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' },
  statCard: { flex: 1, minWidth: 140, background: 'rgba(3,8,16,0.8)', border: '1px solid #0d2040', borderRadius: 10, padding: '16px 20px', backdropFilter: 'blur(8px)' },
  statLabel: { fontSize: 9, fontWeight: 700, color: '#4a6080', letterSpacing: 1.5, marginBottom: 6 },
  statValue: { fontSize: 22, fontWeight: 800 },
  chartCard: { background: 'rgba(3,8,16,0.8)', border: '1px solid #0d2040', borderRadius: 12, padding: '20px 24px', marginBottom: 20, backdropFilter: 'blur(8px)' },
  cardTitle: { fontSize: 11, fontWeight: 700, color: '#a0b8d0', letterSpacing: 1, marginBottom: 12, textTransform: 'uppercase' },
  twoCol: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 },
  summaryCard: { background: 'rgba(3,8,16,0.8)', border: '1px solid #0d2040', borderRadius: 12, padding: '20px 24px', backdropFilter: 'blur(8px)' },
  summaryGrid: { display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 },
  summaryRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #0d2040', paddingBottom: 10 },
  summaryLabel: { fontSize: 12, color: '#4a6080' },
  summaryValue: { fontSize: 13, fontWeight: 700 },
  emptyCard: { background: 'rgba(3,8,16,0.8)', border: '1px solid #0d2040', borderRadius: 12, padding: '80px 40px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', backdropFilter: 'blur(8px)' },
  emptyTitle: { fontSize: 16, fontWeight: 700, color: '#ffffff', marginBottom: 8 },
  emptySub: { fontSize: 12, color: '#a0b8d0', lineHeight: 1.6, maxWidth: 380, marginBottom: 24 },
  startBtn: { display: 'flex', alignItems: 'center', gap: 8, background: 'linear-gradient(135deg,#1E90FF,#0060cc)', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'Montserrat,sans-serif' },
  mcControls: { display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 4 },
  mcField: { flex: 1, minWidth: 130 },
  mcFieldLabel: { fontSize: 9, fontWeight: 700, color: '#4a6080', letterSpacing: 1, marginBottom: 6 },
  mcInput: { width: '100%', background: '#030f20', border: '1px solid #0d2040', borderRadius: 8, padding: '9px 12px', fontSize: 12, color: '#fff', outline: 'none', fontFamily: 'Montserrat,sans-serif', boxSizing: 'border-box' },
  mcBtnRow: { display: 'flex', justifyContent: 'center', gap: 12, margin: '16px 0 4px' },
  mcResetBtn: { background: 'transparent', border: '1px solid #0d2040', color: '#a0b8d0', borderRadius: 8, padding: '10px 20px', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'Montserrat,sans-serif' },
  mcStartBtn: { background: 'linear-gradient(135deg,#1E90FF,#0060cc)', border: 'none', color: '#fff', borderRadius: 8, padding: '10px 20px', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'Montserrat,sans-serif' },
  mcStatsGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginTop: 20 },
  mcStat: { textAlign: 'center' },
  mcStatLabel: { fontSize: 10, color: '#4a6080', fontWeight: 600, marginBottom: 4 },
  mcStatValue: { fontSize: 16, fontWeight: 800, color: '#fff' },
}
