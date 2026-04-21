import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/useAuth'
import NoAccess from '../components/NoAccess'

export const getServerSideProps = () => ({ props: {} })

const SESSIONS_LABEL = 'All Sessions'

export default function Analytics() {
  const router = useRouter()
  const { user, profile, loading: authLoading, hasAccess } = useAuth('simulador_activo')
  const [sessions, setSessions] = useState([])
  const [trades, setTrades] = useState([])
  const [selectedSession, setSelectedSession] = useState(SESSIONS_LABEL)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (authLoading || !user || !hasAccess) return
    loadData(user.id)
  }, [authLoading, user, hasAccess])

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
    new_york: filteredTrades.filter(t => t.session_type === 'new_york'),
    asia: filteredTrades.filter(t => t.session_type === 'asia'),
    out: filteredTrades.filter(t => t.session_type === 'out_of_session'),
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
      {/* SIDEBAR */}
      <div style={s.sidebar}>
        <div style={s.logoWrap}>
          <div style={s.logoText}>
            <div style={s.logoForex}>FOREX</div>
            <div style={s.logoSim}>SIMULATOR</div>
            <div style={s.logoBy}>by Algorithmic Suite</div>
          </div>
        </div>
        <div style={s.sidebarDivider} />
        <nav style={s.nav}>
          {[
            { label: 'Dashboard', icon: '⊞', path: '/dashboard' },
            { label: 'New Session', icon: '▷', path: null, action: () => router.push('/dashboard') },
            { label: 'Sessions', icon: '◫', path: '/dashboard' },
            { label: 'Analytics', icon: '⟨∿⟩', path: '/analytics', active: true },
          ].map(item => (
            <div key={item.label}
              style={{ ...s.navItem, ...(item.active ? s.navActive : {}) }}
              onClick={() => item.path ? router.push(item.path) : item.action?.()}>
              <span style={{ fontSize: 14 }}>{item.icon}</span>
              <span>{item.label}</span>
            </div>
          ))}
        </nav>
        <div style={{ flex: 1 }} />
        {user && (
          <div style={s.userWrap} onClick={() => router.push('/dashboard')}>
            <div style={s.avatar}>{user.email?.[0]?.toUpperCase()}</div>
            <div style={s.userInfo}>
              <div style={s.userName}>{user.email?.split('@')[0]}</div>
              <div style={s.userPlan}>Algorithmic Suite</div>
            </div>
          </div>
        )}
      </div>

      {/* MAIN */}
      <div style={s.main}>
        {/* HEADER */}
        <div style={s.header}>
          <div>
            <div style={s.headerTitle}>Analytics</div>
            <div style={s.headerSub}>Track your backtesting performance</div>
          </div>
          {/* Session Filter */}
          <select style={s.sessionFilter} value={selectedSession} onChange={e => setSelectedSession(e.target.value)}>
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
                    ['New York', sessionStats.new_york.length, '#f59e0b'],
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
          </>
        )}
      </div>

      <style>{`
        *{box-sizing:border-box;margin:0;padding:0}
        body{background:#000;overflow:hidden}
        select option{background:#030f20;color:#fff}
        @keyframes spin{to{transform:rotate(360deg)}}
      `}</style>
    </div>
  )
}

const s = {
  root: { display: 'flex', height: '100vh', overflow: 'hidden', background: '#000', fontFamily: "'Montserrat',sans-serif" },
  sidebar: { width: 230, flexShrink: 0, background: 'rgba(2,8,16,0.95)', borderRight: '1px solid #0d2040', display: 'flex', flexDirection: 'column' },
  logoWrap: { height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  logoText: { textAlign: 'center' },
  logoForex: { fontSize: 32, fontWeight: 800, color: '#ffffff', letterSpacing: 2, lineHeight: 1.1 },
  logoSim: { fontSize: 11, fontWeight: 600, color: '#ffffff', letterSpacing: 7, marginBottom: 6 },
  logoBy: { fontSize: 8, color: 'rgba(255,255,255,0.6)', fontStyle: 'italic' },
  sidebarDivider: { height: 1, background: 'linear-gradient(90deg,transparent,#1E90FF50,transparent)', margin: '0 0 12px' },
  nav: { flex: 1, padding: '0 8px', display: 'flex', flexDirection: 'column', gap: 2 },
  navItem: { display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 7, fontSize: 12, fontWeight: 600, color: '#c0d0e8', cursor: 'pointer', transition: 'all .15s' },
  navActive: { background: 'linear-gradient(135deg,#1E90FF20,#1E90FF08)', color: '#1E90FF', borderLeft: '2px solid #1E90FF' },
  userWrap: { display: 'flex', alignItems: 'center', gap: 10, padding: 12, margin: '8px', borderRadius: 8, background: 'rgba(3,15,32,0.8)', border: '1px solid #0d2040', cursor: 'pointer' },
  avatar: { width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg,#1E90FF,#0060cc)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: '#fff', flexShrink: 0 },
  userInfo: { flex: 1, overflow: 'hidden' },
  userName: { fontSize: 11, fontWeight: 600, color: '#ffffff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  userPlan: { fontSize: 9, color: '#2a5070', fontWeight: 600 },
  main: { flex: 1, overflowY: 'auto', padding: '32px 40px' },
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
}
