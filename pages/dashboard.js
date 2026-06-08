import { useEffect, useState, useRef, useMemo } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabase'
import ChallengeSetupModal from '../components/ChallengeSetupModal'
import NetworkBg from '../components/NetworkBg'

/**
 * Deriva el estado visual de una sesión a partir de su `status` y `challenge_phase`.
 * Devuelve textos, colores y CTAs coherentes para el card del dashboard.
 * Sesiones que NO son challenge (challenge_type=null) caen en el caso por defecto.
 */
function getSessionVisualState(session) {
  const status = session?.status || 'active'
  const phase = session?.challenge_phase || 1

  // Sesiones challenge cerradas ───────────────────────────────────────
  if (status === 'passed_all') {
    return {
      badge: 'Passed',
      badgeColor: '#22c55e',
      borderColor: 'rgba(34,197,94,0.35)',
      cta: 'Review Session →',
      ctaColor: '#22c55e',
    }
  }
  if (status === 'passed_phase') {
    return {
      badge: `Phase ${phase} · Cleared`,
      badgeColor: '#1E90FF',
      borderColor: 'rgba(30,144,255,0.35)',
      cta: 'Review Session →',
      ctaColor: '#1E90FF',
    }
  }
  if (status === 'failed_dd_daily' || status === 'failed_dd_total') {
    return {
      badge: status === 'failed_dd_daily' ? 'Failed · Daily DD' : 'Failed · Max DD',
      badgeColor: '#ef5350',
      borderColor: 'rgba(239,83,80,0.32)',
      cta: 'Review Session →',
      ctaColor: '#ef5350',
    }
  }

  // Default: active (challenge o practice) ────────────────────────────
  return {
    badge: null,
    badgeColor: '#1E90FF',
    borderColor: 'rgba(30,144,255,0.18)',
    cta: 'Open Session →',
    ctaColor: '#1E90FF',
  }
}

export default function Dashboard() {
  const router = useRouter()
  const logoCanvasRef = useRef(null)
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showMenu, setShowMenu] = useState(false)
  const [sessions, setSessions] = useState([])
  const [trades, setTrades] = useState([])
  const [showNew, setShowNew] = useState(false)
  const [creating, setCreating] = useState(false)
  const [activeView, setActiveView] = useState('dashboard')
  const [hoveredNav, setHoveredNav] = useState(null)
  const [form, setForm] = useState({ name: '', pair: 'EUR/USD', dateFrom: '', dateTo: '', capital: 10000 })
  const [profile, setProfile] = useState(null)
  const [showChallenge, setShowChallenge] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.replace('/'); return }
      setUser(session.user)
      // Cargar perfil para saber si es admin
      const { data: prof } = await supabase
        .from('profiles')
        .select('id, email, nombre, rol_global, journal_activo, simulador_activo')
        .eq('id', session.user.id)
        .single()
      if (prof) setProfile(prof)
      loadSessions(session.user.id)
      loadTrades(session.user.id)
      setLoading(false)
    })
  }, [])


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
    let lastT2 = 0
    function drawLogo(ts) {
      id2 = requestAnimationFrame(drawLogo)
      if (document.hidden) return
      if (ts - lastT2 < 66) return  // cap at 15fps — logo is decorative
      lastT2 = ts
      ctx.clearRect(0,0,W,H)
      for (let i=0;i<nodes.length;i++) for (let j=i+1;j<nodes.length;j++) {
        const dx=nodes[i].x-nodes[j].x, dy=nodes[i].y-nodes[j].y, d=Math.sqrt(dx*dx+dy*dy)
        if(d<60){ctx.strokeStyle=`rgba(30,144,255,${(1-d/60)*.8})`;ctx.lineWidth=.8;ctx.beginPath();ctx.moveTo(nodes[i].x,nodes[i].y);ctx.lineTo(nodes[j].x,nodes[j].y);ctx.stroke()}
      }
      nodes.forEach(n=>{
        ctx.beginPath();ctx.arc(n.x,n.y,n.r,0,Math.PI*2);ctx.fillStyle='rgba(120,200,255,0.9)';ctx.fill()
        n.x+=n.vx;n.y+=n.vy
        if(n.x<0||n.x>W)n.vx*=-1
        if(n.y<0||n.y>H)n.vy*=-1
      })
    }
    drawLogo(0)
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
    }).select().maybeSingle()
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
    const closed = trades.filter(t => t.result && t.result !== 'OPEN')
    const w = closed.filter(t => t.result === 'WIN')
    const totalPnl = closed.reduce((s, t) => s + (t.pnl || 0), 0)
    return { closedTrades:closed, wins:w, totalPnl }
  }, [trades])

  const { closedTrades, wins, totalPnl } = metrics

  if (loading) return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',background:'#000'}}>
      <div className="spinner"/>
      <style>{`.spinner{width:32px;height:32px;border:2px solid #0a1628;border-top-color:#1E90FF;border-radius:50%;animation:spin .7s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  const initials = user?.email?.slice(0,2).toUpperCase()||'FX'
  // Username de la tabla profiles (nombre asignado al invitar al alumno).
  // Fallback al email split si no hay perfil cargado todavía o falta el nombre.
  const username = profile?.nombre || user?.email?.split('@')[0] || ''
  const PAIRS = ['EUR/USD','GBP/USD','USD/JPY','USD/CHF','AUD/USD','USD/CAD','NZD/USD','EUR/GBP','EUR/JPY','GBP/JPY','XAU/USD']

  const navItems = [
    { key: 'dashboard', label: 'Dashboard', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg> },
    { key: 'new', label: 'New Session', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5,3 19,12 5,21"/></svg>, action: () => setShowNew(true) },
    { key: 'sessions', label: 'Sessions', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22,12 18,12 15,21 9,3 6,12 2,12"/></svg> },
    { key: 'analytics', label: 'Analytics', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>, action: () => router.push('/analytics') },
    ...(profile?.rol_global === 'admin' ? [{
      key: 'admin',
      label: 'Admin',
      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2L4 6v6c0 5 3.5 9.5 8 10 4.5-.5 8-5 8-10V6l-8-4z"/></svg>,
      action: () => router.push('/admin')
    }] : []),
  ]

  return (
    <div style={s.root}>
      <NetworkBg />

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
            <div style={s.userPlan}>VIP Member</div>
          </div>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#4a90d9" strokeWidth="2"><polyline points="6,9 12,15 18,9"/></svg>
          {showMenu && (
            <div style={s.menu}>
              <div style={s.menuEmail}>{user?.email}</div>
              <div style={s.menuDivider}/>
              <div style={{...s.menuItem,color:'#1E90FF'}} onClick={e=>{e.stopPropagation();window.location.href='https://algorithmicsuite.com/dashboard'}}>← Volver al hub</div>
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
            <div style={{...s.ctaCard,borderColor:'#1E90FF60',background:'rgba(0,20,60,0.35)'}} onClick={()=>setShowNew(true)}>
              <div style={{...s.ctaIcon,background:'#1E90FF20',borderColor:'#1E90FF50'}}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1E90FF" strokeWidth="1.5"><polygon points="5,3 19,12 5,21"/></svg>
              </div>
              <div style={s.ctaTitle}>Practice Session</div>
              <div style={s.ctaSub}>Replay historical candles and train your entries candle by candle</div>
              <div style={s.ctaLink}>Start now →</div>
            </div>
            <div style={{...s.ctaCard,borderColor:'#1E90FF60',background:'rgba(0,20,60,0.35)'}} onClick={()=>setShowChallenge(true)}>
              <div style={{...s.ctaIcon,background:'#1E90FF20',borderColor:'#1E90FF50'}}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1E90FF" strokeWidth="1.5"><path d="M12 2L4 6v6c0 5 3.5 9.5 8 10 4.5-.5 8-5 8-10V6l-8-4z"/></svg>
              </div>
              <div style={s.ctaTitle}>Propfirms Challenge</div>
              <div style={s.ctaSub}>Challenge tipo FTMO: supera las fases respetando las reglas de drawdown</div>
              <div style={s.ctaLink}>Start now →</div>
            </div>
            <div style={{...s.ctaCard,borderColor:'#1E90FF60',background:'rgba(0,20,60,0.35)'}} onClick={()=>router.push('/operativas')}>
              <div style={{...s.ctaIcon,background:'#1E90FF20',borderColor:'#1E90FF50'}}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1E90FF" strokeWidth="1.5"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
              </div>
              <div style={s.ctaTitle}><span style={{color:'#fff'}}>Operativa </span><span style={{color:'#1E90FF'}}>R.A.M.M.FX TRADING™</span></div>
              <div style={s.ctaSub}>Vídeos y flujos de trabajo para el recap diario</div>
              <div style={s.ctaLink}>Start now →</div>
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
              {sessions.map(session => {
                const vs = getSessionVisualState(session)
                return (
                <div key={session.id} style={{background:'rgba(4,10,24,0.7)',border:`1px solid ${vs.borderColor}`,borderRadius:12,padding:20,display:'flex',flexDirection:'column',gap:10}}>
                  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                    <div style={{fontSize:14,fontWeight:700,color:'#ffffff'}}>{session.name}</div>
                    <button onClick={async()=>{if(!confirm('¿Eliminar sesión y todos sus datos?'))return
                      const sid=session.id
                      await Promise.all([
                        supabase.from('sim_trades').delete().eq('session_id',sid),
                        supabase.from('session_drawings').delete().eq('session_id',sid),
                        supabase.from('session_chart_config').delete().eq('session_id',sid),
                        supabase.from('sim_sessions').delete().eq('id',sid),
                      ])
                      setSessions(p=>p.filter(s=>s.id!==sid))}} style={{background:'none',border:'none',color:'#3a5070',cursor:'pointer',fontSize:14}}>✕</button>
                  </div>
                  <div style={{display:'flex',gap:6,flexWrap:'wrap',alignItems:'center'}}>
                    <span style={{background:'#1E90FF15',border:'1px solid #1E90FF30',color:'#1E90FF',fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:4}}>{session.pair}</span>
                    {vs.badge && (
                      <span style={{background:vs.badgeColor+'18',border:`1px solid ${vs.badgeColor}55`,color:vs.badgeColor,fontSize:9,fontWeight:800,padding:'2px 8px',borderRadius:4,letterSpacing:1,textTransform:'uppercase'}}>{vs.badge}</span>
                    )}
                  </div>
                  <div style={{fontSize:11,color:'rgba(255,255,255,0.85)'}}>{session.date_from} → {session.date_to}</div>
                  <div style={{display:'flex',borderTop:'1px solid rgba(30,144,255,0.12)',paddingTop:10}}>
                    <div style={{flex:1,textAlign:'center'}}>
                      <div style={{fontSize:9,fontWeight:700,color:'rgba(255,255,255,0.85)',letterSpacing:1,marginBottom:3}}>CAPITAL</div>
                      <div style={{fontSize:13,fontWeight:700,color:'#fff'}}>${Number(session.capital).toLocaleString()}</div>
                    </div>
                    <div style={{flex:1,textAlign:'center'}}>
                      <div style={{fontSize:9,fontWeight:700,color:'rgba(255,255,255,0.85)',letterSpacing:1,marginBottom:3}}>P&L</div>
                      <div style={{fontSize:13,fontWeight:700,color:(session.balance-session.capital)>=0?'#22c55e':'#ef4444'}}>
                        {(session.balance-session.capital)>=0?'+':''}${(session.balance-session.capital).toFixed(2)}
                      </div>
                    </div>
                  </div>
                  <button onClick={()=>router.push(`/session/${session.id}`)} style={{background:'none',border:`1px solid ${vs.ctaColor}40`,color:vs.ctaColor,borderRadius:8,padding:'8px',fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:'Montserrat,sans-serif'}}>
                    {vs.cta}
                  </button>
                </div>
                )
              })}
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
              {sessions.map(session => {
                const vs = getSessionVisualState(session)
                return (
                <div key={session.id} style={{background:'rgba(4,10,24,0.7)',border:`1px solid ${vs.borderColor}`,borderRadius:12,padding:20,display:'flex',flexDirection:'column',gap:10}}>
                  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                    <div style={{fontSize:14,fontWeight:700,color:'#ffffff'}}>{session.name}</div>
                    <button onClick={async()=>{if(!confirm('¿Eliminar sesión y todos sus datos?'))return
                      const sid=session.id
                      await Promise.all([
                        supabase.from('sim_trades').delete().eq('session_id',sid),
                        supabase.from('session_drawings').delete().eq('session_id',sid),
                        supabase.from('session_chart_config').delete().eq('session_id',sid),
                        supabase.from('sim_sessions').delete().eq('id',sid),
                      ])
                      setSessions(p=>p.filter(s=>s.id!==sid))}} style={{background:'none',border:'none',color:'#3a5070',cursor:'pointer',fontSize:14}}>✕</button>
                  </div>
                  <div style={{display:'flex',gap:6,flexWrap:'wrap',alignItems:'center'}}>
                    <span style={{background:'#1E90FF15',border:'1px solid #1E90FF30',color:'#1E90FF',fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:4}}>{session.pair}</span>
                    {vs.badge && (
                      <span style={{background:vs.badgeColor+'18',border:`1px solid ${vs.badgeColor}55`,color:vs.badgeColor,fontSize:9,fontWeight:800,padding:'2px 8px',borderRadius:4,letterSpacing:1,textTransform:'uppercase'}}>{vs.badge}</span>
                    )}
                  </div>
                  <div style={{fontSize:11,color:'rgba(255,255,255,0.85)'}}>{session.date_from} → {session.date_to}</div>
                  <div style={{display:'flex',borderTop:'1px solid rgba(30,144,255,0.12)',paddingTop:10}}>
                    <div style={{flex:1,textAlign:'center'}}>
                      <div style={{fontSize:9,fontWeight:700,color:'rgba(255,255,255,0.85)',letterSpacing:1,marginBottom:3}}>CAPITAL</div>
                      <div style={{fontSize:13,fontWeight:700,color:'#fff'}}>${Number(session.capital).toLocaleString()}</div>
                    </div>
                    <div style={{flex:1,textAlign:'center'}}>
                      <div style={{fontSize:9,fontWeight:700,color:'rgba(255,255,255,0.85)',letterSpacing:1,marginBottom:3}}>P&L</div>
                      <div style={{fontSize:13,fontWeight:700,color:(session.balance-session.capital)>=0?'#22c55e':'#ef4444'}}>
                        {(session.balance-session.capital)>=0?'+':''}${(session.balance-session.capital).toFixed(2)}
                      </div>
                    </div>
                  </div>
                  <button onClick={()=>router.push(`/session/${session.id}`)} style={{background:'none',border:`1px solid ${vs.ctaColor}40`,color:vs.ctaColor,borderRadius:8,padding:'8px',fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:'Montserrat,sans-serif'}}>
                    {vs.cta}
                  </button>
                </div>
                )
              })}
            </div>
          )}
        </>}

      </div>

      {/* NEW SESSION MODAL */}
      {showNew && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.8)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',backdropFilter:'blur(4px)'}} onClick={()=>setShowNew(false)}>
          <div style={{background:'#030f20',border:'1px solid #0d2040',borderRadius:16,padding:'28px',width:'100%',maxWidth:520,boxShadow:'0 0 60px #1E90FF10',fontFamily:'Montserrat,sans-serif'}} onClick={e=>e.stopPropagation()}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:24}}>
              <div style={{fontSize:18,fontWeight:800,color:'#ffffff'}}>New Session</div>
              <button style={{background:'none',border:'none',color:'rgba(255,255,255,0.85)',cursor:'pointer',fontSize:18,fontFamily:'Montserrat,sans-serif'}} onClick={()=>setShowNew(false)}>✕</button>
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
                <input style={{background:'#03080f',border:'1px solid #0d1f3c',borderRadius:8,padding:'11px 14px',fontSize:13,color:'#fff',outline:'none',fontFamily:'Montserrat,sans-serif'}} type="date" min="2024-07-01" value={form.dateFrom} onChange={e=>setForm({...form,dateFrom:e.target.value})} onFocus={e=>e.target.style.borderColor='#1E90FF'} onBlur={e=>e.target.style.borderColor='#0d1f3c'}/>
              </div>
              <div style={{display:'flex',flexDirection:'column',gap:7}}>
                <label style={{fontSize:10,fontWeight:700,color:'#1E90FF',letterSpacing:1.5}}>DATE TO</label>
                <input style={{background:'#03080f',border:'1px solid #0d1f3c',borderRadius:8,padding:'11px 14px',fontSize:13,color:'#fff',outline:'none',fontFamily:'Montserrat,sans-serif'}} type="date" min="2024-07-01" value={form.dateTo} onChange={e=>setForm({...form,dateTo:e.target.value})} onFocus={e=>e.target.style.borderColor='#1E90FF'} onBlur={e=>e.target.style.borderColor='#0d1f3c'}/>
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
        @keyframes ctaRise{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
        input[type=date]::-webkit-calendar-picker-indicator{filter:invert(1);opacity:0.5}
        select option{background:#030f20;color:#fff}
      `}</style>
      <ChallengeSetupModal open={showChallenge} onClose={()=>setShowChallenge(false)} />
    </div>
  )
}

const s = {
  root:{display:'flex',height:'100vh',overflow:'hidden',background:'#000',position:'relative'},
  bgCanvas:{position:'fixed',inset:0,width:'100%',height:'100%',pointerEvents:'none',zIndex:0},
  sidebar:{position:'relative',zIndex:1,width:230,flexShrink:0,background:'rgba(0,20,60,0.35)',borderRight:'1px solid #0d2040',display:'flex',flexDirection:'column',backdropFilter:'blur(4px)'},
  logoWrap:{position:'relative',width:'100%',height:160,flexShrink:0},
  logoCanvas:{position:'absolute',top:0,left:0,width:'100%',height:'100%'},
  logoText:{position:'absolute',inset:0,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',zIndex:1},
  logoForex:{fontSize:32,fontWeight:800,color:'#ffffff',letterSpacing:2,lineHeight:1.1},
  logoSim:{fontSize:11,fontWeight:600,color:'#ffffff',letterSpacing:7,marginBottom:6},
  logoBy:{fontSize:8,color:'rgba(255,255,255,0.6)',fontStyle:'italic'},
  sidebarDivider:{height:1,background:'linear-gradient(90deg,transparent,#1E90FF50,transparent)',margin:'0 0 12px'},
  nav:{flex:1,padding:'0 8px',display:'flex',flexDirection:'column',gap:2},
  navItem:{display:'flex',alignItems:'center',gap:10,padding:'9px 12px',borderRadius:7,fontSize:12,fontWeight:600,color:'#ffffff',cursor:'pointer',transition:'all .15s'},
  navActive:{background:'linear-gradient(135deg,#1E90FF20,#1E90FF08)',color:'#1E90FF',borderLeft:'2px solid #1E90FF'},
  navHover:{background:'rgba(30,144,255,0.06)',color:'#d0e4ff',boxShadow:'inset 0 0 12px rgba(30,144,255,0.08)',backdropFilter:'blur(2px)'},
  userWrap:{position:'relative',display:'flex',alignItems:'center',gap:10,padding:12,margin:'8px',borderRadius:8,background:'rgba(3,15,32,0.8)',border:'1px solid #0d2040',cursor:'pointer'},
  avatar:{width:32,height:32,borderRadius:'50%',background:'linear-gradient(135deg,#1E90FF,#0060cc)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:800,color:'#fff',flexShrink:0,boxShadow:'0 0 12px #1E90FF50'},
  userInfo:{flex:1,overflow:'hidden'},
  userName:{fontSize:11,fontWeight:600,color:'#ffffff',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'},
  userPlan:{fontSize:9,color:'rgba(255,255,255,0.85)',fontWeight:600,letterSpacing:.5},
  menu:{position:'absolute',bottom:'110%',left:0,right:0,background:'#030f20',border:'1px solid #0d2040',borderRadius:8,overflow:'hidden',zIndex:100},
  menuEmail:{padding:'10px 14px',fontSize:10,color:'rgba(255,255,255,0.85)',fontWeight:500},
  menuDivider:{height:1,background:'#0d2040'},
  menuItem:{padding:'10px 14px',fontSize:12,fontWeight:600,cursor:'pointer'},
  main:{position:'relative',zIndex:1,flex:1,overflowY:'auto',padding:'32px 40px'},
  header:{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:32},
  headerTitle:{fontSize:26,fontWeight:800,color:'#ffffff',marginBottom:4},
  headerSub:{fontSize:13,color:'#ffffff'},
  iconBtn:{background:'rgba(3,8,16,0.8)',border:'1px solid #0d2040',borderRadius:8,padding:'8px',cursor:'pointer',color:'#a0b0c8',display:'flex',alignItems:'center',justifyContent:'center'},
  startBtn:{display:'flex',alignItems:'center',gap:8,background:'linear-gradient(135deg,#1E90FF,#0060cc)',color:'#fff',border:'none',borderRadius:8,padding:'10px 20px',fontSize:12,fontWeight:700,cursor:'pointer',boxShadow:'0 4px 20px #1E90FF30',fontFamily:'Montserrat,sans-serif'},
  ctaRow:{display:'flex',gap:16,marginBottom:28},
  ctaCard:{flex:1,background:'linear-gradient(165deg,rgba(30,144,255,0.10),rgba(255,255,255,0.03) 55%),rgba(13,18,28,0.55)',WebkitBackdropFilter:'blur(18px) saturate(160%)',backdropFilter:'blur(18px) saturate(160%)',border:'1px solid rgba(255,255,255,0.15)',borderRadius:14,padding:'24px 20px',cursor:'pointer',transition:'all .2s',boxShadow:'0 4px 22px rgba(0,0,0,0.35)',animation:'ctaRise .5s ease both'},
  ctaOff:{opacity:.7,cursor:'default'},
  ctaIcon:{width:44,height:44,borderRadius:10,border:'1px solid',display:'flex',alignItems:'center',justifyContent:'center',marginBottom:14},
  ctaTitle:{fontSize:14,fontWeight:700,color:'#ffffff',marginBottom:6},
  ctaSub:{fontSize:11,color:'#ffffff',lineHeight:1.5,marginBottom:16},
  ctaLink:{fontSize:12,fontWeight:700,color:'#1E90FF'},
  statsRow:{display:'flex',gap:16,marginBottom:28},
  statCard:{flex:1,display:'flex',flexDirection:'column',gap:6,background:'rgba(4,10,24,0.7)',border:'1px solid rgba(30,144,255,0.15)',borderRadius:12,padding:'16px 20px'},
  statIcon:{width:36,height:36,borderRadius:8,border:'1px solid',display:'flex',alignItems:'center',justifyContent:'center',marginBottom:4},
  statValue:{fontSize:24,fontWeight:800},
  statLabel:{fontSize:9,fontWeight:700,color:'#ffffff',letterSpacing:1.5},
  emptyCard:{borderRadius:12,padding:'60px 40px',textAlign:'center',display:'flex',flexDirection:'column',alignItems:'center',background:'rgba(4,10,24,0.7)',border:'1px solid rgba(30,144,255,0.18)'},
  emptyTitle:{fontSize:16,fontWeight:700,color:'#ffffff',marginBottom:8},
  emptySub:{fontSize:12,color:'#ffffff',lineHeight:1.6,maxWidth:380},
}
