import { useEffect, useState, useRef, useMemo } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabase'

export const getServerSideProps = () => ({ props: {} })

export default function Dashboard() {
  const router = useRouter()
  const bgCanvasRef = useRef(null)
  const logoCanvasRef = useRef(null)
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showMenu, setShowMenu] = useState(false)
  const [sessions, setSessions] = useState([])
  const [trades, setTrades] = useState([])
  const [showNew, setShowNew] = useState(false)
  const [creating, setCreating] = useState(false)
  const [activeView, setActiveView] = useState('dashboard')
  const [selectedSession, setSelectedSession] = useState('all')
  const [hoveredNav, setHoveredNav] = useState(null)
  const [form, setForm] = useState({ name: '', pair: 'EUR/USD', dateFrom: '', dateTo: '', capital: 10000 })

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.replace('/'); return }
      setUser(session.user)
      loadSessions(session.user.id)
      loadTrades(session.user.id)
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    const canvas = bgCanvasRef.current
    if (!canvas || loading) return
    const ctx = canvas.getContext('2d')
    canvas.width = window.innerWidth
    canvas.height = window.innerHeight
    const nodes = []
    for (let i = 0; i < 60; i++) {
      nodes.push({ x: Math.random()*canvas.width, y: Math.random()*canvas.height, vx:(Math.random()-.5)*.35, vy:(Math.random()-.5)*.35, r:Math.random()*1.5+.8 })
    }
    let id
    function draw() {
      ctx.clearRect(0,0,canvas.width,canvas.height)
      for (let i=0;i<nodes.length;i++) for (let j=i+1;j<nodes.length;j++) {
        const dx=nodes[i].x-nodes[j].x, dy=nodes[i].y-nodes[j].y, d=Math.sqrt(dx*dx+dy*dy)
        if(d<150){ctx.strokeStyle=`rgba(30,144,255,${(1-d/150)*.5})`;ctx.lineWidth=.7;ctx.beginPath();ctx.moveTo(nodes[i].x,nodes[i].y);ctx.lineTo(nodes[j].x,nodes[j].y);ctx.stroke()}
      }
      nodes.forEach(n=>{
        ctx.beginPath();ctx.arc(n.x,n.y,n.r*1.8,0,Math.PI*2);ctx.fillStyle='rgba(30,144,255,1)';ctx.fill()
        n.x+=n.vx;n.y+=n.vy
        if(n.x<0||n.x>canvas.width)n.vx*=-1
        if(n.y<0||n.y>canvas.height)n.vy*=-1
      })
      id=requestAnimationFrame(draw)
    }
    draw()
    const onResize=()=>{canvas.width=window.innerWidth;canvas.height=window.innerHeight}
    window.addEventListener('resize',onResize)
    return ()=>{cancelAnimationFrame(id);window.removeEventListener('resize',onResize)}
  }, [loading])

  useEffect(() => {
    const canvas = logoCanvasRef.current
    if (!canvas || loading) return
    const ctx = canvas.getContext('2d')
    const W = canvas.width, H = canvas.height
    const nodes = []
    for (let i = 0; i < 25; i++) {
      nodes.push({ x: Math.random()*W, y: Math.random()*H, vx:(Math.random()-.5)*.4, vy:(Math.random()-.5)*.4, r:Math.random()*1.8+.8, pulse:Math.random()*Math.PI*2 })
    }
    let id2
    function drawLogo() {
      ctx.clearRect(0,0,W,H)
      const t = Date.now()/1000
      for (let i=0;i<nodes.length;i++) for (let j=i+1;j<nodes.length;j++) {
        const dx=nodes[i].x-nodes[j].x, dy=nodes[i].y-nodes[j].y, d=Math.sqrt(dx*dx+dy*dy)
        if(d<60){ctx.strokeStyle=`rgba(30,144,255,${(1-d/60)*.8})`;ctx.lineWidth=.8;ctx.beginPath();ctx.moveTo(nodes[i].x,nodes[i].y);ctx.lineTo(nodes[j].x,nodes[j].y);ctx.stroke()}
      }
      nodes.forEach(n=>{
        const pulse=0.5+0.5*Math.sin(t*2+n.pulse)
        const glow=ctx.createRadialGradient(n.x,n.y,0,n.x,n.y,n.r*5)
        glow.addColorStop(0,`rgba(30,144,255,${0.8*pulse})`)
        glow.addColorStop(1,'rgba(30,144,255,0)')
        ctx.beginPath();ctx.arc(n.x,n.y,n.r*4,0,Math.PI*2);ctx.fillStyle=glow;ctx.fill()
        ctx.beginPath();ctx.arc(n.x,n.y,n.r,0,Math.PI*2);ctx.fillStyle=`rgba(120,200,255,${0.9+0.1*pulse})`;ctx.fill()
        n.x+=n.vx;n.y+=n.vy
        if(n.x<0||n.x>W)n.vx*=-1
        if(n.y<0||n.y>H)n.vy*=-1
      })
      id2=requestAnimationFrame(drawLogo)
    }
    drawLogo()
    return ()=>cancelAnimationFrame(id2)
  }, [loading])

  async function loadSessions(userId) {
    const { data } = await supabase.from('sim_sessions').select('*').eq('user_id', userId).order('created_at', { ascending: false })
    if (data) setSessions(data)
  }

  async function loadTrades(userId) {
    const { data } = await supabase.from('sim_trades').select('*').eq('user_id', userId).order('opened_at', { ascending: true })
    if (data) setTrades(data)
  }

  async function createSession() {
    if (!form.name || !form.dateFrom || !form.dateTo) return
    setCreating(true)
    const { data, error } = await supabase.from('sim_sessions').insert({
      user_id: user.id, name: form.name, pair: form.pair,
      timeframe: 'H1', date_from: form.dateFrom, date_to: form.dateTo,
      capital: parseFloat(form.capital), balance: parseFloat(form.capital), status: 'active'
    }).select().single()
    setCreating(false)
    if (!error && data) {
      setShowNew(false)
      setForm({ name: '', pair: 'EUR/USD', dateFrom: '', dateTo: '', capital: 10000 })
      setSessions(prev => [data, ...prev])
      router.push(`/session/${data.id}`)
    }
  }

  async function handleSignOut() { await supabase.auth.signOut(); router.push('/') }

  function handleFullscreen() {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen()
    else document.exitFullscreen()
  }

  async function handleScreenshot() {
    try {
      const html2canvas = (await import('html2canvas')).default
      const canvas = await html2canvas(document.body, { backgroundColor: '#000000', scale: 2 })
      const link = document.createElement('a')
      link.download = `dashboard-${Date.now()}.png`
      link.href = canvas.toDataURL(); link.click()
    } catch { window.print() }
  }

  // ── ANALYTICS CALCULATIONS ──
  const metrics = useMemo(() => {
    const filtered = selectedSession === 'all' ? trades : trades.filter(t => t.session_id === selectedSession)
    const closed = filtered.filter(t => t.result && t.result !== 'OPEN')
    const w = closed.filter(t => t.result === 'WIN')
    const l = closed.filter(t => t.result === 'LOSS')
    const be = closed.filter(t => t.result === 'BREAKEVEN')
    const totalPnl = closed.reduce((s, t) => s + (t.pnl || 0), 0)
    const winRate = closed.length > 0 ? (w.length / closed.length * 100) : 0
    const avgRR = closed.length > 0 ? closed.reduce((s, t) => s + (t.rr || 0), 0) / closed.length : 0
    const bestWin = w.length > 0 ? Math.max(...w.map(t => t.pnl || 0)) : 0
    const worstLoss = l.length > 0 ? Math.min(...l.map(t => t.pnl || 0)) : 0
    const avgWin = w.length > 0 ? w.reduce((s, t) => s + (t.pnl || 0), 0) / w.length : 0
    const avgLoss = l.length > 0 ? l.reduce((s, t) => s + (t.pnl || 0), 0) / l.length : 0
    const grossProfit = w.reduce((s, t) => s + (t.pnl || 0), 0)
    const grossLoss = Math.abs(l.reduce((s, t) => s + (t.pnl || 0), 0))
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 999 : 0
    const expectancy = closed.length > 0 ? (winRate/100 * avgWin) + ((1 - winRate/100) * avgLoss) : 0
    const selSess = sessions.find(s => s.id === selectedSession)
    const initialBalance = selectedSession === 'all'
      ? (sessions.length > 0 ? parseFloat(sessions[0]?.capital || 0) : 0)
      : parseFloat(selSess?.capital || 0)
    // Drawdown
    let ddPeak = initialBalance, maxDD = 0, ddRun = initialBalance
    closed.forEach(t => { ddRun += (t.pnl||0); if(ddRun>ddPeak)ddPeak=ddRun; const dd=ddPeak-ddRun; if(dd>maxDD)maxDD=dd })
    // Streaks
    let maxW=0,maxL=0,curW=0,curL=0
    closed.forEach(t => { if(t.result==='WIN'){curW++;curL=0;if(curW>maxW)maxW=curW}else if(t.result==='LOSS'){curL++;curW=0;if(curL>maxL)maxL=curL} })
    // Equity curve
    let eqRun = initialBalance
    const eqPoints = [{ x:0, y:eqRun }, ...closed.map((t,i) => { eqRun+=(t.pnl||0); return {x:i+1,y:eqRun} })]
    const buildPath = (pts) => {
      if(pts.length<2) return ''
      const maxY=Math.max(...pts.map(p=>p.y)), minY=Math.min(...pts.map(p=>p.y)), rng=maxY-minY||1
      return pts.map((p,i)=>{const x=(p.x/(pts.length-1))*800;const y=160-((p.y-minY)/rng)*140-10;return`${i===0?'M':'L'}${x},${y}`}).join(' ')
    }
    return {
      filteredTrades:filtered, closedTrades:closed, wins:w, losses:l, breakevens:be,
      totalPnl, winRate, avgRR, bestWin, worstLoss, avgWin, avgLoss,
      profitFactor, expectancy, maxDrawdown:maxDD, maxWinStreak:maxW, maxLossStreak:maxL,
      initialBalance, equityPath:buildPath(eqPoints),
      sessionStats:{
        london:filtered.filter(t=>t.session_type==='london'),
        new_york:filtered.filter(t=>t.session_type==='new_york'),
        asia:filtered.filter(t=>t.session_type==='asia'),
        out:filtered.filter(t=>t.session_type==='out_of_session'),
      }
    }
  }, [trades, sessions, selectedSession])

  const { filteredTrades, closedTrades, wins, losses, breakevens, totalPnl, winRate, avgRR,
    bestWin, worstLoss, avgWin, avgLoss, profitFactor, expectancy, maxDrawdown,
    maxWinStreak, maxLossStreak, initialBalance, equityPath, sessionStats } = metrics

  if (loading) return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',background:'#000'}}>
      <div className="spinner"/>
      <style>{`.spinner{width:32px;height:32px;border:2px solid #0a1628;border-top-color:#1E90FF;border-radius:50%;animation:spin .7s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  const initials = user?.email?.slice(0,2).toUpperCase()||'FX'
  const username = user?.email?.split('@')[0]||''
  const PAIRS = ['EUR/USD','GBP/USD','USD/JPY','USD/CHF','AUD/USD','USD/CAD','NZD/USD','EUR/GBP','EUR/JPY','GBP/JPY','XAU/USD']

  const navItems = [
    { key: 'dashboard', label: 'Dashboard', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg> },
    { key: 'new', label: 'New Session', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5,3 19,12 5,21"/></svg>, action: () => setShowNew(true) },
    { key: 'sessions', label: 'Sessions', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22,12 18,12 15,21 9,3 6,12 2,12"/></svg> },
    { key: 'analytics', label: 'Analytics', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg> },
  ]

  return (
    <div style={s.root}>
      <canvas ref={bgCanvasRef} style={s.bgCanvas}/>

      <div style={s.sidebar}>
        <div style={s.logoWrap}>
          <canvas ref={logoCanvasRef} width="220" height="160" style={s.logoCanvas}/>
          <div style={s.logoText}>
            <div style={s.logoForex}>FOREX</div>
            <div style={s.logoSim}>SIMULATOR</div>
            <div style={s.logoBy}>by Algorithmic Suite</div>
          </div>
        </div>
        <div style={s.sidebarDivider}/>
        <nav style={s.nav}>
          {navItems.map(item => {
            const isActive = activeView === item.key
            const isHovered = hoveredNav === item.key
            return (
              <div
                key={item.key}
                style={{
                  ...s.navItem,
                  ...(isActive ? s.navActive : {}),
                  ...(isHovered && !isActive ? s.navHover : {}),
                }}
                onClick={() => item.action ? item.action() : setActiveView(item.key)}
                onMouseEnter={() => setHoveredNav(item.key)}
                onMouseLeave={() => setHoveredNav(null)}
              >
                {item.icon}
                {item.label}
              </div>
            )
          })}
        </nav>
        <div style={s.userWrap} onClick={()=>setShowMenu(!showMenu)}>
          <div style={s.avatar}>{initials}</div>
          <div style={s.userInfo}>
            <div style={s.userName}>{username}</div>
            <div style={s.userPlan}>Free Plan</div>
          </div>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#4a90d9" strokeWidth="2"><polyline points="6,9 12,15 18,9"/></svg>
          {showMenu && (
            <div style={s.menu}>
              <div style={s.menuEmail}>{user?.email}</div>
              <div style={s.menuDivider}/>
              <div style={{...s.menuItem,color:'#ef4444'}} onClick={e=>{e.stopPropagation();handleSignOut()}}>Sign out</div>
            </div>
          )}
        </div>
      </div>

      <div style={s.main}>

        {/* ── DASHBOARD VIEW ── */}
        {activeView === 'dashboard' && <>
          <div style={s.header}>
            <div>
              <h1 style={s.headerTitle}>Dashboard</h1>
              <p style={s.headerSub}>Welcome back, <span style={{color:'#1E90FF',fontWeight:700}}>{username}</span></p>
            </div>
            <div style={{display:'flex',gap:8,alignItems:'center'}}>
              <button onClick={handleScreenshot} title="Screenshot" style={s.iconBtn}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>
              </button>
              <button onClick={handleFullscreen} title="Fullscreen" style={s.iconBtn}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3"/></svg>
              </button>
              <button style={s.startBtn} onClick={()=>setShowNew(true)}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="white"><polygon points="5,3 19,12 5,21"/></svg>
                New Session
              </button>
            </div>
          </div>

          <div style={s.ctaRow}>
            <div style={{...s.ctaCard,borderColor:'#1E90FF60',background:'linear-gradient(135deg,#030f20,#041a30)'}} onClick={()=>setShowNew(true)}>
              <div style={{...s.ctaIcon,background:'#1E90FF20',borderColor:'#1E90FF50'}}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1E90FF" strokeWidth="1.5"><polygon points="5,3 19,12 5,21"/></svg>
              </div>
              <div style={s.ctaTitle}>Practice Session</div>
              <div style={s.ctaSub}>Replay historical candles and train your entries candle by candle</div>
              <div style={s.ctaLink}>Start now →</div>
            </div>
            <div style={{...s.ctaCard,...s.ctaOff}}>
              <div style={{...s.ctaIcon,background:'#ffffff05',borderColor:'#1a3050'}}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#4a7aaa" strokeWidth="1.5"><polyline points="1,4 1,10 7,10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg>
              </div>
              <div style={{...s.ctaTitle,color:'#4a6a8a'}}>Backtesting</div>
              <div style={{...s.ctaSub,color:'#3a5570'}}>Test your strategy on historical data automatically</div>
              <div style={{fontSize:11,fontWeight:700,color:'#4a6a8a'}}>Coming soon</div>
            </div>
            <div style={{...s.ctaCard,...s.ctaOff}}>
              <div style={{...s.ctaIcon,background:'#ffffff05',borderColor:'#1a3050'}}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#4a7aaa" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><polyline points="12,6 12,12 16,14"/></svg>
              </div>
              <div style={{...s.ctaTitle,color:'#4a6a8a'}}>Live Mode</div>
              <div style={{...s.ctaSub,color:'#3a5570'}}>Trade on live market data in real time</div>
              <div style={{fontSize:11,fontWeight:700,color:'#4a6a8a'}}>Coming soon</div>
            </div>
          </div>

          <div style={s.statsRow}>
            {[
              {label:'SESSIONS',value:String(sessions.length),color:'#1E90FF',icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1E90FF" strokeWidth="1.5"><polygon points="5,3 19,12 5,21"/></svg>},
              {label:'TRADES TAKEN',value:String(trades.length),color:'#22c55e',icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="1.5"><polyline points="22,12 18,12 15,21 9,3 6,12 2,12"/></svg>},
              {label:'WIN RATE',value:trades.length>0?`${(wins.length/closedTrades.length*100||0).toFixed(0)}%`:'—',color:'#f59e0b',icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="1.5"><circle cx="12" cy="8" r="6"/><path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11"/></svg>},
              {label:'TOTAL P&L',value:`${totalPnl>=0?'+':''}$${totalPnl.toFixed(2)}`,color:totalPnl>=0?'#22c55e':'#ef4444',icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1E90FF" strokeWidth="1.5"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>},
            ].map(stat=>(
              <div key={stat.label} style={s.statCard}>
                <div style={{...s.statIcon,borderColor:stat.color+'40',background:stat.color+'15'}}>{stat.icon}</div>
                <div style={{...s.statValue,color:stat.color}}>{stat.value}</div>
                <div style={s.statLabel}>{stat.label}</div>
              </div>
            ))}
          </div>

          {sessions.length === 0 ? (
            <div style={s.emptyCard}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#1a3a5c" strokeWidth="1" style={{marginBottom:14}}><polygon points="5,3 19,12 5,21"/></svg>
              <div style={s.emptyTitle}>No sessions yet</div>
              <div style={s.emptySub}>Start your first backtesting session to begin tracking your performance</div>
              <button onClick={()=>setShowNew(true)} style={{marginTop:20,background:'linear-gradient(135deg,#1E90FF,#0060cc)',color:'#fff',border:'none',borderRadius:8,padding:'12px 28px',fontSize:13,fontWeight:700,cursor:'pointer',boxShadow:'0 4px 20px #1E90FF30',fontFamily:'Montserrat,sans-serif'}}>
                Start first session
              </button>
            </div>
          ) : (
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))',gap:16}}>
              {sessions.map(session => (
                <div key={session.id} style={{background:'rgba(3,8,16,0.8)',border:'1px solid #0d2040',borderRadius:12,padding:20,backdropFilter:'blur(8px)',display:'flex',flexDirection:'column',gap:10}}>
                  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                    <div style={{fontSize:14,fontWeight:700,color:'#ffffff'}}>{session.name}</div>
                    <button onClick={async()=>{if(!confirm('Delete?'))return;await supabase.from('sim_sessions').delete().eq('id',session.id);setSessions(p=>p.filter(s=>s.id!==session.id))}} style={{background:'none',border:'none',color:'#3a5070',cursor:'pointer',fontSize:14}}>✕</button>
                  </div>
                  <div style={{display:'flex',gap:6}}>
                    <span style={{background:'#1E90FF15',border:'1px solid #1E90FF30',color:'#1E90FF',fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:4}}>{session.pair}</span>
                  </div>
                  <div style={{fontSize:11,color:'#4a6080'}}>{session.date_from} → {session.date_to}</div>
                  <div style={{display:'flex',borderTop:'1px solid #0d2040',paddingTop:10}}>
                    <div style={{flex:1,textAlign:'center'}}>
                      <div style={{fontSize:9,fontWeight:700,color:'#4a6080',letterSpacing:1,marginBottom:3}}>CAPITAL</div>
                      <div style={{fontSize:13,fontWeight:700,color:'#fff'}}>${Number(session.capital).toLocaleString()}</div>
                    </div>
                    <div style={{flex:1,textAlign:'center'}}>
                      <div style={{fontSize:9,fontWeight:700,color:'#4a6080',letterSpacing:1,marginBottom:3}}>P&L</div>
                      <div style={{fontSize:13,fontWeight:700,color:(session.balance-session.capital)>=0?'#22c55e':'#ef4444'}}>
                        {(session.balance-session.capital)>=0?'+':''}${(session.balance-session.capital).toFixed(2)}
                      </div>
                    </div>
                  </div>
                  <button onClick={()=>router.push(`/session/${session.id}`)} style={{background:'none',border:'1px solid #1E90FF40',color:'#1E90FF',borderRadius:8,padding:'8px',fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:'Montserrat,sans-serif'}}>
                    Open Session →
                  </button>
                </div>
              ))}
            </div>
          )}
        </>}

        {/* ── SESSIONS VIEW ── */}
        {activeView === 'sessions' && <>
          <div style={s.header}>
            <div>
              <h1 style={s.headerTitle}>Sessions</h1>
              <p style={s.headerSub}>All your backtesting sessions</p>
            </div>
            <button style={s.startBtn} onClick={()=>setShowNew(true)}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="white"><polygon points="5,3 19,12 5,21"/></svg>
              New Session
            </button>
          </div>
          {sessions.length === 0 ? (
            <div style={s.emptyCard}>
              <div style={s.emptyTitle}>No sessions yet</div>
              <div style={s.emptySub}>Start your first backtesting session</div>
              <button onClick={()=>setShowNew(true)} style={{marginTop:20,background:'linear-gradient(135deg,#1E90FF,#0060cc)',color:'#fff',border:'none',borderRadius:8,padding:'12px 28px',fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:'Montserrat,sans-serif'}}>
                Start first session
              </button>
            </div>
          ) : (
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))',gap:16}}>
              {sessions.map(session => (
                <div key={session.id} style={{background:'rgba(3,8,16,0.8)',border:'1px solid #0d2040',borderRadius:12,padding:20,backdropFilter:'blur(8px)',display:'flex',flexDirection:'column',gap:10}}>
                  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                    <div style={{fontSize:14,fontWeight:700,color:'#ffffff'}}>{session.name}</div>
                    <button onClick={async()=>{if(!confirm('Delete?'))return;await supabase.from('sim_sessions').delete().eq('id',session.id);setSessions(p=>p.filter(s=>s.id!==session.id))}} style={{background:'none',border:'none',color:'#3a5070',cursor:'pointer',fontSize:14}}>✕</button>
                  </div>
                  <div style={{display:'flex',gap:6}}>
                    <span style={{background:'#1E90FF15',border:'1px solid #1E90FF30',color:'#1E90FF',fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:4}}>{session.pair}</span>
                  </div>
                  <div style={{fontSize:11,color:'#4a6080'}}>{session.date_from} → {session.date_to}</div>
                  <div style={{display:'flex',borderTop:'1px solid #0d2040',paddingTop:10}}>
                    <div style={{flex:1,textAlign:'center'}}>
                      <div style={{fontSize:9,fontWeight:700,color:'#4a6080',letterSpacing:1,marginBottom:3}}>CAPITAL</div>
                      <div style={{fontSize:13,fontWeight:700,color:'#fff'}}>${Number(session.capital).toLocaleString()}</div>
                    </div>
                    <div style={{flex:1,textAlign:'center'}}>
                      <div style={{fontSize:9,fontWeight:700,color:'#4a6080',letterSpacing:1,marginBottom:3}}>P&L</div>
                      <div style={{fontSize:13,fontWeight:700,color:(session.balance-session.capital)>=0?'#22c55e':'#ef4444'}}>
                        {(session.balance-session.capital)>=0?'+':''}${(session.balance-session.capital).toFixed(2)}
                      </div>
                    </div>
                  </div>
                  <button onClick={()=>router.push(`/session/${session.id}`)} style={{background:'none',border:'1px solid #1E90FF40',color:'#1E90FF',borderRadius:8,padding:'8px',fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:'Montserrat,sans-serif'}}>
                    Open Session →
                  </button>
                </div>
              ))}
            </div>
          )}
        </>}

        {/* ── ANALYTICS VIEW ── */}
        {activeView === 'analytics' && <div style={{position:'relative',zIndex:1}}>
          <div style={s.header}>
            <div>
              <h1 style={s.headerTitle}>Analytics</h1>
              <p style={s.headerSub}>Track your backtesting performance</p>
            </div>
            <select
              style={{background:'#030f20',border:'1px solid #0d2040',borderRadius:8,padding:'10px 16px',fontSize:12,color:'#fff',outline:'none',fontFamily:'Montserrat,sans-serif',cursor:'pointer',minWidth:200}}
              value={selectedSession}
              onChange={e=>setSelectedSession(e.target.value)}
            >
              <option value="all">All Sessions</option>
              {sessions.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>

          {closedTrades.length === 0 ? (
            <div style={s.emptyCard}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#1a3a5c" strokeWidth="1" style={{marginBottom:14}}><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
              <div style={s.emptyTitle}>No trades yet</div>
              <div style={s.emptySub}>Complete backtesting sessions to see your analytics here.</div>
              <button onClick={()=>setActiveView('dashboard')} style={{marginTop:20,background:'linear-gradient(135deg,#1E90FF,#0060cc)',color:'#fff',border:'none',borderRadius:8,padding:'12px 28px',fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:'Montserrat,sans-serif'}}>
                Start a Session
              </button>
            </div>
          ) : <>
            {/* TOP STATS — 8 cards */}
            <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10,marginBottom:20}}>
              {[
                {label:'TOTAL P&L',     value:`${totalPnl>=0?'+':''}$${totalPnl.toFixed(2)}`,  color:totalPnl>=0?'#22c55e':'#ef4444'},
                {label:'WIN RATE',      value:`${winRate.toFixed(1)}%`,                          color:winRate>=50?'#22c55e':'#ef4444'},
                {label:'PROFIT FACTOR', value:profitFactor===Infinity?'∞':profitFactor.toFixed(2), color:profitFactor>=1?'#22c55e':'#ef4444'},
                {label:'EXPECTATIVA',   value:`${expectancy>=0?'+':''}$${expectancy.toFixed(2)}`,color:expectancy>=0?'#22c55e':'#ef4444'},
                {label:'TOTAL TRADES',  value:closedTrades.length,                               color:'#1E90FF'},
                {label:'R:R PROMEDIO',  value:avgRR.toFixed(2)+'R',                              color:'#f59e0b'},
                {label:'MAX DRAWDOWN',  value:`-$${maxDrawdown.toFixed(2)}`,                     color:'#ef4444'},
                {label:'RACHA MAX',     value:`${maxWinStreak}W / ${maxLossStreak}L`,            color:'#a0b8d0'},
              ].map(stat=>(
                <div key={stat.label} style={{...s.statCard}}>
                  <div style={{fontSize:8,fontWeight:700,color:'#4a6080',letterSpacing:1.5,marginBottom:6}}>{stat.label}</div>
                  <div style={{fontSize:20,fontWeight:800,color:stat.color}}>{stat.value}</div>
                </div>
              ))}
            </div>

            {/* EQUITY CURVE */}
            <div style={{borderRadius:16,padding:'20px 24px',marginBottom:20,background:'rgba(10,20,50,0.45)',border:'1px solid rgba(30,144,255,0.4)',backdropFilter:'blur(16px)',WebkitBackdropFilter:'blur(16px)',boxShadow:'0 0 0 1px rgba(30,144,255,0.1),inset 0 1px 0 rgba(30,144,255,0.2),0 4px 24px rgba(0,0,10,0.4)'}}>
              <div style={{fontSize:11,fontWeight:700,color:'#a0b8d0',letterSpacing:1,marginBottom:12,textTransform:'uppercase'}}>Equity Curve</div>
              <svg viewBox="0 0 800 160" style={{width:'100%',height:160}} preserveAspectRatio="none">
                <defs>
                  <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#1E90FF" stopOpacity="0.4"/>
                    <stop offset="100%" stopColor="#1E90FF" stopOpacity="0"/>
                  </linearGradient>
                </defs>
                {equityPath && <>
                  <path d={`${equityPath} L800,160 L0,160 Z`} fill="url(#eqGrad)"/>
                  <path d={equityPath} fill="none" stroke="#1E90FF" strokeWidth="2.5" filter="drop-shadow(0 0 6px rgba(30,144,255,0.6))"/>
                </>}
              </svg>
            </div>

            {/* SUMMARY CARDS */}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginBottom:20}}>
              <div style={{borderRadius:16,padding:'20px 24px',background:'rgba(10,20,50,0.45)',border:'1px solid rgba(30,144,255,0.4)',backdropFilter:'blur(16px)',WebkitBackdropFilter:'blur(16px)',boxShadow:'0 0 0 1px rgba(30,144,255,0.1),inset 0 1px 0 rgba(30,144,255,0.2),0 4px 24px rgba(0,0,10,0.4)'}}>
                <div style={{fontSize:11,fontWeight:700,color:'rgba(30,220,120,0.9)',letterSpacing:1,marginBottom:16,textTransform:'uppercase'}}>Winning Trades</div>
                {[['Total Winners',wins.length],['Best Win',`$${bestWin.toFixed(2)}`],['Average Win',`$${avgWin.toFixed(2)}`]].map(([label,value])=>(
                  <div key={label} style={{display:'flex',justifyContent:'space-between',alignItems:'center',borderBottom:'1px solid rgba(30,144,255,0.12)',paddingBottom:10,marginBottom:10}}>
                    <span style={{fontSize:12,color:'rgba(255,255,255,0.85)'}}>{label}</span>
                    <span style={{fontSize:13,fontWeight:700,color:'#22c55e'}}>{value}</span>
                  </div>
                ))}
              </div>
              <div style={{borderRadius:16,padding:'20px 24px',background:'rgba(10,20,50,0.45)',border:'1px solid rgba(30,144,255,0.4)',backdropFilter:'blur(16px)',WebkitBackdropFilter:'blur(16px)',boxShadow:'0 0 0 1px rgba(30,144,255,0.1),inset 0 1px 0 rgba(30,144,255,0.2),0 4px 24px rgba(0,0,10,0.4)'}}>
                <div style={{fontSize:11,fontWeight:700,color:'rgba(239,83,80,0.9)',letterSpacing:1,marginBottom:16,textTransform:'uppercase'}}>Losing Trades</div>
                {[['Total Losers',losses.length],['Worst Loss',`$${worstLoss.toFixed(2)}`],['Average Loss',`$${avgLoss.toFixed(2)}`]].map(([label,value])=>(
                  <div key={label} style={{display:'flex',justifyContent:'space-between',alignItems:'center',borderBottom:'1px solid rgba(30,144,255,0.12)',paddingBottom:10,marginBottom:10}}>
                    <span style={{fontSize:12,color:'rgba(255,255,255,0.85)'}}>{label}</span>
                    <span style={{fontSize:13,fontWeight:700,color:'#ef4444'}}>{value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* DONUT + SESSIONS */}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
              <div style={{borderRadius:16,padding:'20px 24px',background:'rgba(10,20,50,0.45)',border:'1px solid rgba(30,144,255,0.4)',backdropFilter:'blur(16px)',WebkitBackdropFilter:'blur(16px)',boxShadow:'0 0 0 1px rgba(30,144,255,0.1),inset 0 1px 0 rgba(30,144,255,0.2),0 4px 24px rgba(0,0,10,0.4)'}}>
                <div style={{fontSize:11,fontWeight:700,color:'rgba(30,144,255,0.9)',letterSpacing:1,marginBottom:16,textTransform:'uppercase'}}>Distribution</div>
                <div style={{display:'flex',alignItems:'center',gap:32}}>
                  <svg viewBox="0 0 120 120" style={{width:120,height:120,flexShrink:0}}>
                    {(()=>{
                      const total=wins.length+losses.length+breakevens.length||1
                      const segs=[{val:wins.length/total,color:'#22c55e'},{val:losses.length/total,color:'#ef4444'},{val:breakevens.length/total,color:'#f59e0b'}]
                      let offset=0
                      const r=45,cx=60,cy=60,stroke=18,circ=2*Math.PI*r
                      return segs.map((seg,i)=>{
                        const dash=seg.val*circ,gap=circ-dash
                        const el=<circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={seg.color} strokeWidth={stroke} strokeDasharray={`${dash} ${gap}`} strokeDashoffset={-offset*circ} style={{transform:'rotate(-90deg)',transformOrigin:'60px 60px'}}/>
                        offset+=seg.val
                        return el
                      })
                    })()}
                  </svg>
                  <div style={{display:'flex',flexDirection:'column',gap:10}}>
                    {[{label:'Wins',count:wins.length,color:'#22c55e'},{label:'Losses',count:losses.length,color:'#ef4444'},{label:'Breakeven',count:breakevens.length,color:'#f59e0b'}].map(item=>(
                      <div key={item.label} style={{display:'flex',alignItems:'center',gap:8}}>
                        <div style={{width:10,height:10,borderRadius:'50%',background:item.color}}/>
                        <span style={{fontSize:12,color:'#a0b8d0'}}>{item.label}</span>
                        <span style={{fontSize:12,fontWeight:700,color:'#fff',marginLeft:'auto',paddingLeft:16}}>{item.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div style={{borderRadius:16,padding:'20px 24px',background:'rgba(10,20,50,0.45)',border:'1px solid rgba(30,144,255,0.4)',backdropFilter:'blur(16px)',WebkitBackdropFilter:'blur(16px)',boxShadow:'0 0 0 1px rgba(30,144,255,0.1),inset 0 1px 0 rgba(30,144,255,0.2),0 4px 24px rgba(0,0,10,0.4)'}}>
                <div style={{fontSize:11,fontWeight:700,color:'rgba(30,144,255,0.9)',letterSpacing:1,marginBottom:16,textTransform:'uppercase'}}>Trades by Session</div>
                {[['London',sessionStats.london.length,'#1E90FF'],['New York',sessionStats.new_york.length,'#f59e0b'],['Asia',sessionStats.asia.length,'#a855f7'],['Out of Session',sessionStats.out.length,'#6b7280']].map(([label,count,color])=>(
                  <div key={label} style={{display:'flex',justifyContent:'space-between',alignItems:'center',borderBottom:'1px solid rgba(30,144,255,0.12)',paddingBottom:10,marginBottom:10}}>
                    <div style={{display:'flex',alignItems:'center',gap:8}}>
                      <div style={{width:8,height:8,borderRadius:'50%',background:color}}/>
                      <span style={{fontSize:12,color:'rgba(255,255,255,0.85)'}}>{label}</span>
                    </div>
                    <span style={{fontSize:13,fontWeight:700,color}}>{count}</span>
                  </div>
                ))}
              </div>
            </div>
            {/* JOURNAL TABLE */}
            <div style={{borderRadius:16,padding:'20px 24px',marginTop:16,background:'rgba(10,20,50,0.45)',border:'1px solid rgba(30,144,255,0.4)',backdropFilter:'blur(16px)',WebkitBackdropFilter:'blur(16px)',boxShadow:'0 0 0 1px rgba(30,144,255,0.1),inset 0 1px 0 rgba(30,144,255,0.2),0 4px 24px rgba(0,0,10,0.4)'}}>
              <div style={{fontSize:11,fontWeight:700,color:'rgba(30,144,255,0.9)',letterSpacing:1,marginBottom:16,textTransform:'uppercase'}}>Journal de Operaciones</div>
              <div style={{overflowX:'auto'}}>
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:11}}>
                  <thead>
                    <tr>
                      {['SESIÓN','PAR','DIR','ENTRADA','SALIDA','LOTS','SL','TP','R:R','P&L','RESULTADO'].map(h=>(
                        <th key={h} style={{padding:'6px 12px',textAlign:'left',color:'rgba(30,144,255,0.9)',fontWeight:700,fontSize:8,letterSpacing:1,borderBottom:'1px solid rgba(30,144,255,0.12)',whiteSpace:'nowrap'}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {closedTrades.slice().reverse().map((t,i)=>{
                      const sess=sessions.find(s=>s.id===t.session_id)
                      const pnlColor=t.pnl>0?'#22c55e':t.pnl<0?'#ef4444':'#a0b8d0'
                      const resColor=t.result==='WIN'?'#22c55e':t.result==='LOSS'?'#ef4444':'#a0b8d0'
                      return(
                        <tr key={i} style={{borderBottom:'1px solid rgba(30,144,255,0.08)'}}>
                          <td style={{padding:'7px 12px',color:'#4a6080',whiteSpace:'nowrap',fontSize:10}}>{sess?.name||'—'}</td>
                          <td style={{padding:'7px 12px',color:'#c0d0e8',fontWeight:700}}>{t.pair}</td>
                          <td style={{padding:'7px 12px',color:t.side==='BUY'?'#1E90FF':'#ef4444',fontWeight:800}}>{t.side}</td>
                          <td style={{padding:'7px 12px',color:'#c0d0e8',fontFamily:'monospace'}}>{parseFloat(t.entry_price||0).toFixed(5)}</td>
                          <td style={{padding:'7px 12px',color:'#c0d0e8',fontFamily:'monospace'}}>{parseFloat(t.exit_price||0).toFixed(5)}</td>
                          <td style={{padding:'7px 12px',color:'#c0d0e8'}}>{t.lots}</td>
                          <td style={{padding:'7px 12px',color:'rgba(239,83,80,0.7)'}}>{t.sl_price?.toFixed(5)||'—'}</td>
                          <td style={{padding:'7px 12px',color:'rgba(30,144,255,0.7)'}}>{t.tp_price?.toFixed(5)||'—'}</td>
                          <td style={{padding:'7px 12px',color:'#f59e0b',fontWeight:700}}>{parseFloat(t.rr||0).toFixed(1)}R</td>
                          <td style={{padding:'7px 12px',color:pnlColor,fontWeight:700}}>{t.pnl>=0?'+':''}{parseFloat(t.pnl||0).toFixed(2)}</td>
                          <td style={{padding:'7px 12px',fontWeight:700}}>
                            <span style={{color:resColor,background:t.result==='WIN'?'rgba(34,197,94,0.1)':t.result==='LOSS'?'rgba(239,68,68,0.1)':'rgba(160,184,208,0.1)',padding:'2px 8px',borderRadius:4,fontSize:9,letterSpacing:0.5}}>{t.result}</span>
                          </td>
                          <td style={{padding:'7px 12px',color:'#4a6080',fontSize:9}}>{t.notes||'—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>}
        </div>}

      </div>

      {/* NEW SESSION MODAL */}
      {showNew && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.8)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',backdropFilter:'blur(4px)'}} onClick={()=>setShowNew(false)}>
          <div style={{background:'#030f20',border:'1px solid #0d2040',borderRadius:16,padding:'28px',width:'100%',maxWidth:520,boxShadow:'0 0 60px #1E90FF10',fontFamily:'Montserrat,sans-serif'}} onClick={e=>e.stopPropagation()}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:24}}>
              <div style={{fontSize:18,fontWeight:800,color:'#ffffff'}}>New Session</div>
              <button style={{background:'none',border:'none',color:'#4a6080',cursor:'pointer',fontSize:18,fontFamily:'Montserrat,sans-serif'}} onClick={()=>setShowNew(false)}>✕</button>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginBottom:20}}>
              <div style={{gridColumn:'1/-1',display:'flex',flexDirection:'column',gap:7}}>
                <label style={{fontSize:10,fontWeight:700,color:'#1E90FF',letterSpacing:1.5}}>SESSION NAME</label>
                <input style={{background:'#03080f',border:'1px solid #0d1f3c',borderRadius:8,padding:'11px 14px',fontSize:13,color:'#fff',outline:'none',fontFamily:'Montserrat,sans-serif'}} placeholder="e.g. EUR/USD Jan 2023" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} onFocus={e=>e.target.style.borderColor='#1E90FF'} onBlur={e=>e.target.style.borderColor='#0d1f3c'}/>
              </div>
              <div style={{display:'flex',flexDirection:'column',gap:7}}>
                <label style={{fontSize:10,fontWeight:700,color:'#1E90FF',letterSpacing:1.5}}>PAIR</label>
                <select style={{background:'#03080f',border:'1px solid #0d1f3c',borderRadius:8,padding:'11px 14px',fontSize:13,color:'#fff',outline:'none',fontFamily:'Montserrat,sans-serif',cursor:'pointer'}} value={form.pair} onChange={e=>setForm({...form,pair:e.target.value})}>
                  {PAIRS.map(p=><option key={p}>{p}</option>)}
                </select>
              </div>
              <div style={{display:'flex',flexDirection:'column',gap:7}}>
                <label style={{fontSize:10,fontWeight:700,color:'#1E90FF',letterSpacing:1.5}}>INITIAL CAPITAL ($)</label>
                <input style={{background:'#03080f',border:'1px solid #0d1f3c',borderRadius:8,padding:'11px 14px',fontSize:13,color:'#fff',outline:'none',fontFamily:'Montserrat,sans-serif'}} type="number" value={form.capital} onChange={e=>setForm({...form,capital:e.target.value})} onFocus={e=>e.target.style.borderColor='#1E90FF'} onBlur={e=>e.target.style.borderColor='#0d1f3c'}/>
              </div>
              <div style={{display:'flex',flexDirection:'column',gap:7}}>
                <label style={{fontSize:10,fontWeight:700,color:'#1E90FF',letterSpacing:1.5}}>DATE FROM</label>
                <input style={{background:'#03080f',border:'1px solid #0d1f3c',borderRadius:8,padding:'11px 14px',fontSize:13,color:'#fff',outline:'none',fontFamily:'Montserrat,sans-serif'}} type="date" value={form.dateFrom} onChange={e=>setForm({...form,dateFrom:e.target.value})} onFocus={e=>e.target.style.borderColor='#1E90FF'} onBlur={e=>e.target.style.borderColor='#0d1f3c'}/>
              </div>
              <div style={{display:'flex',flexDirection:'column',gap:7}}>
                <label style={{fontSize:10,fontWeight:700,color:'#1E90FF',letterSpacing:1.5}}>DATE TO</label>
                <input style={{background:'#03080f',border:'1px solid #0d1f3c',borderRadius:8,padding:'11px 14px',fontSize:13,color:'#fff',outline:'none',fontFamily:'Montserrat,sans-serif'}} type="date" value={form.dateTo} onChange={e=>setForm({...form,dateTo:e.target.value})} onFocus={e=>e.target.style.borderColor='#1E90FF'} onBlur={e=>e.target.style.borderColor='#0d1f3c'}/>
              </div>
            </div>
            <button onClick={createSession} disabled={creating} style={{width:'100%',display:'flex',alignItems:'center',justifyContent:'center',gap:8,background:'linear-gradient(135deg,#1E90FF,#0060cc)',color:'#fff',border:'none',borderRadius:8,padding:'13px',fontSize:13,fontWeight:700,cursor:'pointer',boxShadow:'0 4px 20px #1E90FF30',fontFamily:'Montserrat,sans-serif',opacity:creating?0.7:1}}>
              {creating ? 'Creating...' : 'Create Session →'}
            </button>
          </div>
        </div>
      )}

      <style>{`
        *{box-sizing:border-box;margin:0;padding:0}
        body{background:#000;overflow:hidden}
        .spinner{width:32px;height:32px;border:2px solid #0a1628;border-top-color:#1E90FF;border-radius:50%;animation:spin .7s linear infinite}
        @keyframes spin{to{transform:rotate(360deg)}}
        input[type=date]::-webkit-calendar-picker-indicator{filter:invert(1);opacity:0.5}
        select option{background:#030f20;color:#fff}
      `}</style>
    </div>
  )
}

const s = {
  root:{display:'flex',height:'100vh',overflow:'hidden',background:'#000',position:'relative'},
  bgCanvas:{position:'fixed',inset:0,width:'100%',height:'100%',pointerEvents:'none',zIndex:0},
  sidebar:{position:'relative',zIndex:1,width:230,flexShrink:0,background:'rgba(2,8,16,0.5)',borderRight:'1px solid #0d2040',display:'flex',flexDirection:'column',backdropFilter:'blur(4px)'},
  logoWrap:{position:'relative',width:'100%',height:160,flexShrink:0},
  logoCanvas:{position:'absolute',top:0,left:0,width:'100%',height:'100%'},
  logoText:{position:'absolute',inset:0,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',zIndex:1},
  logoForex:{fontSize:32,fontWeight:800,color:'#ffffff',letterSpacing:2,lineHeight:1.1},
  logoSim:{fontSize:11,fontWeight:600,color:'#ffffff',letterSpacing:7,marginBottom:6},
  logoBy:{fontSize:8,color:'rgba(255,255,255,0.6)',fontStyle:'italic'},
  sidebarDivider:{height:1,background:'linear-gradient(90deg,transparent,#1E90FF50,transparent)',margin:'0 0 12px'},
  nav:{flex:1,padding:'0 8px',display:'flex',flexDirection:'column',gap:2},
  navItem:{display:'flex',alignItems:'center',gap:10,padding:'9px 12px',borderRadius:7,fontSize:12,fontWeight:600,color:'#c0d0e8',cursor:'pointer',transition:'all .15s'},
  navActive:{background:'linear-gradient(135deg,#1E90FF20,#1E90FF08)',color:'#1E90FF',borderLeft:'2px solid #1E90FF'},
  navHover:{background:'rgba(30,144,255,0.06)',color:'#d0e4ff',boxShadow:'inset 0 0 12px rgba(30,144,255,0.08)',backdropFilter:'blur(2px)'},
  userWrap:{position:'relative',display:'flex',alignItems:'center',gap:10,padding:12,margin:'8px',borderRadius:8,background:'rgba(3,15,32,0.8)',border:'1px solid #0d2040',cursor:'pointer'},
  avatar:{width:32,height:32,borderRadius:'50%',background:'linear-gradient(135deg,#1E90FF,#0060cc)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:800,color:'#fff',flexShrink:0,boxShadow:'0 0 12px #1E90FF50'},
  userInfo:{flex:1,overflow:'hidden'},
  userName:{fontSize:11,fontWeight:600,color:'#ffffff',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'},
  userPlan:{fontSize:9,color:'#2a5070',fontWeight:600,letterSpacing:.5},
  menu:{position:'absolute',bottom:'110%',left:0,right:0,background:'#030f20',border:'1px solid #0d2040',borderRadius:8,overflow:'hidden',zIndex:100},
  menuEmail:{padding:'10px 14px',fontSize:10,color:'#2a5070',fontWeight:500},
  menuDivider:{height:1,background:'#0d2040'},
  menuItem:{padding:'10px 14px',fontSize:12,fontWeight:600,cursor:'pointer'},
  main:{position:'relative',zIndex:1,flex:1,overflowY:'auto',padding:'32px 40px',background:'transparent'},
  header:{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:32},
  headerTitle:{fontSize:26,fontWeight:800,color:'#ffffff',marginBottom:4},
  headerSub:{fontSize:13,color:'#c0d0e8'},
  iconBtn:{background:'rgba(3,8,16,0.8)',border:'1px solid #0d2040',borderRadius:8,padding:'8px',cursor:'pointer',color:'#a0b0c8',display:'flex',alignItems:'center',justifyContent:'center'},
  startBtn:{display:'flex',alignItems:'center',gap:8,background:'linear-gradient(135deg,#1E90FF,#0060cc)',color:'#fff',border:'none',borderRadius:8,padding:'10px 20px',fontSize:12,fontWeight:700,cursor:'pointer',boxShadow:'0 4px 20px #1E90FF30',fontFamily:'Montserrat,sans-serif'},
  ctaRow:{display:'flex',gap:16,marginBottom:28},
  ctaCard:{flex:1,background:'#030810',border:'1px solid #0d2040',borderRadius:12,padding:'24px 20px',cursor:'pointer',transition:'all .2s'},
  ctaOff:{opacity:.7,cursor:'default'},
  ctaIcon:{width:44,height:44,borderRadius:10,border:'1px solid',display:'flex',alignItems:'center',justifyContent:'center',marginBottom:14},
  ctaTitle:{fontSize:14,fontWeight:700,color:'#ffffff',marginBottom:6},
  ctaSub:{fontSize:11,color:'#a0b8d0',lineHeight:1.5,marginBottom:16},
  ctaLink:{fontSize:12,fontWeight:700,color:'#1E90FF'},
  statsRow:{display:'flex',gap:16,marginBottom:28},
  statCard:{flex:1,background:'transparent',border:'none',borderRadius:14,padding:20,display:'flex',flexDirection:'column',gap:6},
  statIcon:{width:36,height:36,borderRadius:8,border:'1px solid',display:'flex',alignItems:'center',justifyContent:'center',marginBottom:4},
  statValue:{fontSize:24,fontWeight:800},
  statLabel:{fontSize:9,fontWeight:700,color:'#c0d0e8',letterSpacing:1.5},
  emptyCard:{borderRadius:16,padding:'60px 40px',textAlign:'center',display:'flex',flexDirection:'column',alignItems:'center',background:'rgba(10,20,50,0.45)',border:'1px solid rgba(30,144,255,0.4)',backdropFilter:'blur(16px)',WebkitBackdropFilter:'blur(16px)',boxShadow:'0 0 0 1px rgba(30,144,255,0.1),inset 0 1px 0 rgba(30,144,255,0.2),0 4px 24px rgba(0,0,10,0.4)'},
  emptyTitle:{fontSize:16,fontWeight:700,color:'#ffffff',marginBottom:8},
  emptySub:{fontSize:12,color:'#a0b8d0',lineHeight:1.6,maxWidth:380},
}
