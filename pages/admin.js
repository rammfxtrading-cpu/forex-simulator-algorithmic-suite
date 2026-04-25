import { useEffect, useState, useRef, useMemo } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/useAuth'
import NoAccess from '../components/NoAccess'

export default function Admin() {
  const router = useRouter()
  const { user, profile, loading: authLoading, hasAccess } = useAuth('simulador_activo')
  const bgCanvasRef = useRef(null)
  const logoCanvasRef = useRef(null)

  const [usuarios, setUsuarios] = useState([])
  const [aggregates, setAggregates] = useState({ con_acceso: 0, total_usuarios: 0, total_sessions: 0, total_trades: 0, activos_7d: 0 })
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('with')

  // Detalle
  const [detailId, setDetailId] = useState(null)
  const [detail, setDetail] = useState(null)      // { profile, sessions, trades }
  const [detailLoading, setDetailLoading] = useState(false)
  const [selectedSession, setSelectedSession] = useState('all')

  // Modales
  const [modal, setModal] = useState(null)  // 'activate' | 'disable' | 'message' | null
  const [modalTarget, setModalTarget] = useState(null)  // user obj
  const [msgSubject, setMsgSubject] = useState('')
  const [msgBody, setMsgBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const [hoveredNav, setHoveredNav] = useState(null)
  const [showMenu, setShowMenu] = useState(false)

  // Solo admin entra. Mientras useAuth carga, blindamos.
  const isAdmin = profile?.rol_global === 'admin'

  useEffect(() => {
    if (authLoading) return
    if (!isAdmin) return
    refresh()
  }, [authLoading, isAdmin])

  async function refresh() {
    setLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      const res = await fetch('/api/admin/list-alumnos-sim', {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      })
      if (!res.ok) throw new Error('No se pudo cargar')
      const json = await res.json()
      setUsuarios(json.usuarios || [])
      setAggregates(json.aggregates || {})
    } catch (e) {
      setErr(e.message || 'Error cargando')
    } finally {
      setLoading(false)
    }
  }

  async function openDetail(userId) {
    setDetailId(userId)
    setDetail(null)
    setDetailLoading(true)
    setSelectedSession('all')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      const res = await fetch(`/api/admin/alumno-sim/${userId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      })
      if (!res.ok) throw new Error('No se pudo cargar detalle')
      const json = await res.json()
      setDetail(json)
    } catch (e) {
      setErr(e.message || 'Error cargando detalle')
      setDetailId(null)
    } finally {
      setDetailLoading(false)
    }
  }

  function closeDetail() {
    setDetailId(null)
    setDetail(null)
  }

  async function toggleAcceso(userId, activar) {
    setBusy(true)
    setErr('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      const res = await fetch('/api/admin/toggle-acceso-sim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ user_id: userId, simulador_activo: activar })
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Error')
      closeModal()
      await refresh()
    } catch (e) {
      setErr(e.message || 'Error')
    } finally {
      setBusy(false)
    }
  }

  async function enviarMensaje() {
    if (!msgSubject.trim() || !msgBody.trim() || !modalTarget) return
    setBusy(true)
    setErr('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      const res = await fetch('/api/admin/enviar-mensaje', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ to_user_id: modalTarget.id, subject: msgSubject, body: msgBody })
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Error')
      closeModal()
    } catch (e) {
      setErr(e.message || 'Error')
    } finally {
      setBusy(false)
    }
  }

  function openModal(kind, target) {
    setModal(kind)
    setModalTarget(target)
    setErr('')
    if (kind === 'message') { setMsgSubject(''); setMsgBody('') }
  }
  function closeModal() {
    setModal(null)
    setModalTarget(null)
    setErr('')
  }

  async function handleSignOut() { await supabase.auth.signOut(); router.push('/') }

  // ── Canvas de fondo (red cósmica) ──
  useEffect(() => {
    if (authLoading || !hasAccess || !isAdmin) return
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
  }, [authLoading, hasAccess, isAdmin])

  // ── Canvas del logo ──
  useEffect(() => {
    const canvas = logoCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const W = canvas.width, H = canvas.height
    const nodes = []
    for (let i = 0; i < 25; i++) {
      nodes.push({ x: Math.random()*W, y: Math.random()*H, vx:(Math.random()-.5)*.4, vy:(Math.random()-.5)*.4, r:Math.random()*1.8+0.8 })
    }
    let id
    function draw() {
      id = requestAnimationFrame(draw)
      ctx.clearRect(0, 0, W, H)
      for (let i=0;i<nodes.length;i++) for (let j=i+1;j<nodes.length;j++) {
        const dx=nodes[i].x-nodes[j].x, dy=nodes[i].y-nodes[j].y, d=Math.sqrt(dx*dx+dy*dy)
        if (d<90) { ctx.strokeStyle=`rgba(30,144,255,${(1-d/90)*.35})`; ctx.lineWidth=.5; ctx.beginPath(); ctx.moveTo(nodes[i].x,nodes[i].y); ctx.lineTo(nodes[j].x,nodes[j].y); ctx.stroke() }
      }
      nodes.forEach(n => { ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, Math.PI*2); ctx.fillStyle='rgba(30,144,255,0.7)'; ctx.fill(); n.x+=n.vx; n.y+=n.vy; if(n.x<0||n.x>W)n.vx*=-1; if(n.y<0||n.y>H)n.vy*=-1 })
    }
    draw()
    return () => cancelAnimationFrame(id)
  }, [authLoading, hasAccess, isAdmin])

  // ── Métricas del detalle (misma lógica que /analytics + profitFactor + expectancy + drawdown + streaks) ──
  const metrics = useMemo(() => {
    if (!detail) return null
    const { trades, sessions } = detail
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
    let ddPeak = initialBalance, maxDD = 0, ddRun = initialBalance
    closed.forEach(t => { ddRun += (t.pnl||0); if(ddRun>ddPeak)ddPeak=ddRun; const dd=ddPeak-ddRun; if(dd>maxDD)maxDD=dd })
    let maxW=0, maxL=0, curW=0, curL=0
    closed.forEach(t => { if(t.result==='WIN'){curW++;curL=0;if(curW>maxW)maxW=curW}else if(t.result==='LOSS'){curL++;curW=0;if(curL>maxL)maxL=curL} })
    let eqRun = initialBalance
    const eqPoints = [{ x:0, y:eqRun }, ...closed.map((t,i) => { eqRun+=(t.pnl||0); return {x:i+1,y:eqRun} })]
    const buildPath = (pts) => {
      if (pts.length < 2) return ''
      const maxY = Math.max(...pts.map(p => p.y)), minY = Math.min(...pts.map(p => p.y)), rng = maxY - minY || 1
      return pts.map((p,i) => { const x=(p.x/(pts.length-1))*800; const y=200-((p.y-minY)/rng)*170-15; return `${i===0?'M':'L'}${x},${y}` }).join(' ')
    }
    const buildArea = (pts) => {
      const path = buildPath(pts)
      if (!path) return ''
      return `${path} L800,220 L0,220 Z`
    }
    return {
      totalPnl, winRate, avgRR, bestWin, worstLoss, avgWin, avgLoss,
      profitFactor, expectancy, maxDrawdown: maxDD, maxWinStreak: maxW, maxLossStreak: maxL,
      tradesCount: closed.length, winsCount: w.length, lossesCount: l.length, breakevensCount: be.length,
      equityPath: buildPath(eqPoints), equityArea: buildArea(eqPoints),
      sessionStats: {
        london: filtered.filter(t => t.session_type === 'london').length,
        new_york: filtered.filter(t => t.session_type === 'new_york').length,
        asia: filtered.filter(t => t.session_type === 'asia').length,
        out: filtered.filter(t => t.session_type === 'out_of_session').length,
      }
    }
  }, [detail, selectedSession])

  // Guards
  if (authLoading) {
    return <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', background:'#000' }}>
      <div style={{ width:32, height:32, border:'2px solid #0a1628', borderTopColor:'#1E90FF', borderRadius:'50%', animation:'spin .7s linear infinite' }}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  }
  if (!hasAccess) return <NoAccess profile={profile} producto="Simulador" />
  if (!isAdmin) return <NoAccess profile={profile} producto="Admin del Simulador" />

  // ── Partition ──
  const conAcceso = usuarios.filter(u => u.simulador_activo)
  const sinAcceso = usuarios.filter(u => !u.simulador_activo)

  // ── Helpers UI ──
  const initials = (nameOrEmail) => {
    if (!nameOrEmail) return '?'
    const src = nameOrEmail.includes('@') ? nameOrEmail.split('@')[0] : nameOrEmail
    const parts = src.split(/[\s._-]+/).filter(Boolean)
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
    return src.slice(0, 2).toUpperCase()
  }
  const fmtMoney = (n) => {
    if (n == null || isNaN(n)) return '$0'
    const sign = n > 0 ? '+' : ''
    return `${sign}$${Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 0 })}${n < 0 ? '' : ''}`.replace('$', n < 0 ? '-$' : '$')
  }
  const fmtMoney2 = (n) => {
    if (n == null || isNaN(n)) return '$0.00'
    const sign = n > 0 ? '+' : n < 0 ? '-' : ''
    return `${sign}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }
  const fmtPct = (n) => `${(n || 0).toFixed(1)}%`
  const fmtRelative = (iso) => {
    if (!iso) return '—'
    const d = new Date(iso)
    const diffMs = Date.now() - d.getTime()
    const diffH = Math.floor(diffMs / (1000 * 60 * 60))
    if (diffH < 1) return 'hace <1h'
    if (diffH < 24) return `hace ${diffH}h`
    const diffD = Math.floor(diffH / 24)
    if (diffD === 1) return 'ayer'
    if (diffD < 30) return `hace ${diffD}d`
    return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
  }
  const fmtDate = (iso) => {
    if (!iso) return '—'
    return new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
  }

  const userBadges = (u) => {
    if (u.rol_global === 'admin' && u.id === user.id) {
      return <>
        <span style={s.badgeAdmin}>ADMIN</span>
        <span style={s.badgeYou}>TÚ</span>
      </>
    }
    if (u.rol_global === 'admin') return <span style={s.badgeAdmin}>ADMIN</span>
    return null
  }

  // ── Render ──
  return (
    <div style={s.root}>
      <canvas ref={bgCanvasRef} style={s.bgCanvas}/>

      {/* Sidebar */}
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
          <div
            style={{ ...s.navItem, ...(hoveredNav === 'dashboard' ? s.navHover : {}) }}
            onClick={() => router.push('/dashboard')}
            onMouseEnter={() => setHoveredNav('dashboard')}
            onMouseLeave={() => setHoveredNav(null)}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
            Dashboard
          </div>
          <div
            style={{ ...s.navItem, ...(hoveredNav === 'new' ? s.navHover : {}) }}
            onClick={() => router.push('/dashboard')}
            onMouseEnter={() => setHoveredNav('new')}
            onMouseLeave={() => setHoveredNav(null)}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5,3 19,12 5,21"/></svg>
            New Session
          </div>
          <div
            style={{ ...s.navItem, ...(hoveredNav === 'sessions' ? s.navHover : {}) }}
            onClick={() => router.push('/dashboard')}
            onMouseEnter={() => setHoveredNav('sessions')}
            onMouseLeave={() => setHoveredNav(null)}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22,12 18,12 15,21 9,3 6,12 2,12"/></svg>
            Sessions
          </div>
          <div
            style={{ ...s.navItem, ...(hoveredNav === 'analytics' ? s.navHover : {}) }}
            onClick={() => router.push('/analytics')}
            onMouseEnter={() => setHoveredNav('analytics')}
            onMouseLeave={() => setHoveredNav(null)}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
            Analytics
          </div>
          <div style={{ ...s.navItem, ...s.navActive }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2L4 6v6c0 5 3.5 9.5 8 10 4.5-.5 8-5 8-10V6l-8-4z"/></svg>
            Admin
          </div>
        </nav>
        <div style={s.userWrap} onClick={() => setShowMenu(!showMenu)}>
          <div style={s.avatar}>{initials(profile?.nombre || profile?.email)}</div>
          <div style={s.userInfo}>
            <div style={s.userName}>{profile?.nombre || profile?.email?.split('@')[0]}</div>
            <div style={s.userPlan}>VIP Member</div>
          </div>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#4a90d9" strokeWidth="2"><polyline points="6,9 12,15 18,9"/></svg>
          {showMenu && (
            <div style={s.menu}>
              <div style={s.menuEmail}>{user?.email}</div>
              <div style={s.menuDivider}/>
              <div style={{...s.menuItem, color:'#1E90FF'}} onClick={e => { e.stopPropagation(); window.location.href = 'https://algorithmicsuite.com/dashboard' }}>← Volver al hub</div>
              <div style={{...s.menuItem, color:'#f03e3e'}} onClick={e => { e.stopPropagation(); handleSignOut() }}>Cerrar sesión</div>
            </div>
          )}
        </div>
      </div>

      {/* Main */}
      <div style={s.main}>

        {/* === LISTA === */}
        {!detailId && <>
          <div style={s.header}>
            <div>
              <h1 style={s.headerTitle}>Administración</h1>
              <p style={s.headerSub}>Métricas de alumnos y gestión de acceso al simulador</p>
            </div>
            <a href="https://algorithmicsuite.com/admin" target="_blank" rel="noreferrer" style={s.linkHub}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
              Panel del hub
            </a>
          </div>

          <div style={s.scopeHelper}>
            Aquí gestionas el <strong style={{color:'#c8d0e0'}}>acceso al simulador</strong> y revisas el rendimiento de tus alumnos. Para invitar alumnos nuevos, editar capital o gestionar el journal, usa el{' '}
            <a href="https://algorithmicsuite.com/admin" target="_blank" rel="noreferrer" style={{color:'#1E90FF', textDecoration:'none'}}>panel del hub</a>.
          </div>

          {/* Stats cards */}
          <div style={s.statsRow}>
            <StatCard label="CON ACCESO" value={aggregates.con_acceso} sub={`de ${aggregates.total_usuarios} usuarios`} iconColor="#1E90FF" icon={<path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 110-8 4 4 0 010 8z"/>}/>
            <StatCard label="SESIONES" value={aggregates.total_sessions} sub="creadas por alumnos" iconColor="#1E90FF" icon={<><path d="M3 3v18h18"/><path d="M7 14l4-4 4 4 5-5"/></>}/>
            <StatCard label="TRADES" value={aggregates.total_trades} sub="ejecutados en total" iconColor="#16c95d" icon={<><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></>}/>
            <StatCard label="ACTIVOS 7D" value={aggregates.activos_7d} sub="con actividad reciente" iconColor="#f59e0b" icon={<><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></>}/>
          </div>

          {/* Tabs */}
          <div style={s.tabs}>
            <button
              onClick={() => setTab('with')}
              style={{ ...s.tab, ...(tab === 'with' ? s.tabActive : {}) }}
            >
              CON ACCESO <span style={{ ...s.tabCount, ...(tab === 'with' ? s.tabCountActive : {}) }}>{conAcceso.length}</span>
            </button>
            <button
              onClick={() => setTab('without')}
              style={{ ...s.tab, ...(tab === 'without' ? s.tabActive : {}) }}
            >
              SIN ACCESO <span style={{ ...s.tabCount, ...(tab === 'without' ? s.tabCountActive : {}) }}>{sinAcceso.length}</span>
            </button>
          </div>

          {loading && <div style={s.emptyState}>Cargando...</div>}
          {err && <div style={s.errorBox}>{err}</div>}

          {!loading && tab === 'with' && (
            <div style={s.tableBox}>
              <div style={s.tableHeaderWith}>
                <div>ALUMNO</div>
                <div style={{textAlign:'right'}}>SESIONES</div>
                <div style={{textAlign:'right'}}>TRADES</div>
                <div style={{textAlign:'right'}}>WIN RATE</div>
                <div style={{textAlign:'right'}}>P&L TOTAL</div>
                <div style={{textAlign:'right'}}>ÚLTIMA ACTIVIDAD</div>
                <div style={{textAlign:'right'}}>ACCIONES</div>
              </div>
              {conAcceso.length === 0 && <div style={s.emptyState}>Ningún alumno con acceso al simulador todavía.</div>}
              {conAcceso.map(u => {
                const isSelf = u.id === user.id
                const pnlColor = u.metrics.total_pnl > 0 ? '#16c95d' : u.metrics.total_pnl < 0 ? '#f03e3e' : '#c8d0e0'
                const wrColor = u.metrics.win_rate >= 50 ? '#16c95d' : u.metrics.trades > 0 ? '#f03e3e' : '#c8d0e0'
                return (
                  <div key={u.id} style={s.rowWith}>
                    <div style={s.cellUser}>
                      <div style={{ ...s.rowAvatar, background: isSelf ? 'linear-gradient(135deg,#1E90FF,#0060cc)' : 'linear-gradient(135deg,#5a9eff,#3872cc)', boxShadow: isSelf ? '0 0 12px rgba(30,144,255,0.5)' : 'none' }}>
                        {initials(u.nombre || u.email)}
                      </div>
                      <div style={{ minWidth:0, flex:1 }}>
                        <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap', marginBottom:2 }}>
                          <div style={s.cellName}>{u.nombre || u.email?.split('@')[0]}</div>
                          {userBadges(u)}
                        </div>
                        <div style={s.cellEmail}>{u.email}</div>
                      </div>
                    </div>
                    <div style={{...s.cellNum, color:'#fff'}}>{u.metrics.sessions}</div>
                    <div style={{...s.cellNum, color:'#fff'}}>{u.metrics.trades}</div>
                    <div style={{...s.cellNum, color:wrColor, fontWeight:600}}>{u.metrics.trades > 0 ? fmtPct(u.metrics.win_rate) : '—'}</div>
                    <div style={{...s.cellNum, color:pnlColor, fontWeight:600}}>{u.metrics.trades > 0 ? fmtMoney(u.metrics.total_pnl) : '—'}</div>
                    <div style={{...s.cellNum, color:'#c8d0e0', fontSize:12}}>{fmtRelative(u.metrics.last_activity)}</div>
                    <div style={s.cellActions}>
                      <IconBtn title="Ver analytics" onClick={() => openDetail(u.id)}>
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                      </IconBtn>
                      <IconBtn title={isSelf ? 'No puedes enviarte mensajes a ti mismo' : 'Enviar mensaje'} disabled={isSelf} onClick={() => openModal('message', u)}>
                        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>
                      </IconBtn>
                      <IconBtn danger title={isSelf ? 'El admin no puede desactivarse a sí mismo' : 'Desactivar acceso'} disabled={isSelf} onClick={() => openModal('disable', u)}>
                        <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>
                      </IconBtn>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {!loading && tab === 'without' && (
            <div style={s.tableBox}>
              <div style={s.tableHeaderWithout}>
                <div>ALUMNO</div>
                <div>JOURNAL</div>
                <div style={{textAlign:'right'}}>ALTA EN HUB</div>
                <div style={{textAlign:'right'}}>ACCIÓN</div>
              </div>
              {sinAcceso.length === 0 && <div style={s.emptyState}>Todos los usuarios tienen acceso al simulador.</div>}
              {sinAcceso.map(u => (
                <div key={u.id} style={s.rowWithout}>
                  <div style={s.cellUser}>
                    <div style={{ ...s.rowAvatar, background:'linear-gradient(135deg,#8faacb,#5f7a9b)' }}>{initials(u.nombre || u.email)}</div>
                    <div style={{ minWidth:0, flex:1 }}>
                      <div style={s.cellName}>{u.nombre || u.email?.split('@')[0]}</div>
                      <div style={s.cellEmail}>{u.email}</div>
                    </div>
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, color: u.journal_activo ? '#16c95d' : '#8faacb' }}>
                    <span style={{ width:7, height:7, borderRadius:'50%', background: u.journal_activo ? '#16c95d' : '#3d4555', boxShadow: u.journal_activo ? '0 0 6px #16c95d' : 'none' }}/>
                    {u.journal_activo ? 'Activo' : 'Inactivo'}
                  </div>
                  <div style={{...s.cellNum, color:'#c8d0e0', fontSize:12}}>{fmtDate(u.created_at)}</div>
                  <div style={{textAlign:'right'}}>
                    <button
                      onClick={() => openModal('activate', u)}
                      style={s.btnSuccess}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                      ACTIVAR
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>}

        {/* === DETALLE === */}
        {detailId && <>
          <div style={{ marginBottom:20 }}>
            <button onClick={closeDetail} style={s.btnBack}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
              Volver a listado
            </button>
          </div>

          {detailLoading && <div style={s.emptyState}>Cargando detalle...</div>}

          {detail && <>
            <div style={s.detailHeader}>
              <div style={{ display:'flex', alignItems:'center', gap:16 }}>
                <div style={{ ...s.detailAvatar, background: detail.profile.id === user.id ? 'linear-gradient(135deg,#1E90FF,#0060cc)' : 'linear-gradient(135deg,#5a9eff,#3872cc)' }}>
                  {initials(detail.profile.nombre || detail.profile.email)}
                </div>
                <div>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:2 }}>
                    <div style={s.detailName}>{detail.profile.nombre || detail.profile.email?.split('@')[0]}</div>
                    {detail.profile.rol_global === 'admin' && <span style={s.badgeAdmin}>ADMIN</span>}
                    {detail.profile.id === user.id && <span style={s.badgeYou}>TÚ</span>}
                  </div>
                  <div style={s.detailEmail}>{detail.profile.email}</div>
                </div>
              </div>
              <select
                value={selectedSession}
                onChange={e => setSelectedSession(e.target.value)}
                style={s.selectSession}
              >
                <option value="all">Todas las sesiones</option>
                {detail.sessions.map(sess => (
                  <option key={sess.id} value={sess.id}>{sess.name || `${sess.pair} · ${sess.timeframe}`}</option>
                ))}
              </select>
            </div>

            {metrics && metrics.tradesCount === 0 && (
              <div style={s.emptyCard}>
                <div style={{ fontSize:16, fontWeight:700, color:'#fff', marginBottom:8 }}>Sin trades cerrados</div>
                <div style={{ fontSize:12, color:'#8faacb', maxWidth:380 }}>Este alumno aún no tiene operaciones cerradas. Las métricas aparecerán cuando empiece a tradear.</div>
              </div>
            )}

            {metrics && metrics.tradesCount > 0 && <>
              {/* Fila 1 */}
              <div style={s.statsRowDetail}>
                <DetailStat label="TOTAL P&L" value={fmtMoney2(metrics.totalPnl)} color={metrics.totalPnl >= 0 ? '#16c95d' : '#f03e3e'}/>
                <DetailStat label="WIN RATE" value={fmtPct(metrics.winRate)} color={metrics.winRate >= 50 ? '#16c95d' : '#f03e3e'}/>
                <DetailStat label="PROFIT FACTOR" value={metrics.profitFactor === 999 ? '∞' : metrics.profitFactor.toFixed(2)} color={metrics.profitFactor >= 1 ? '#16c95d' : '#f03e3e'}/>
                <DetailStat label="EXPECTATIVA" value={fmtMoney2(metrics.expectancy)} color={metrics.expectancy >= 0 ? '#16c95d' : '#f03e3e'}/>
              </div>
              {/* Fila 2 */}
              <div style={s.statsRowDetail}>
                <DetailStat label="TOTAL TRADES" value={metrics.tradesCount} color="#1E90FF"/>
                <DetailStat label="R:R PROMEDIO" value={`${metrics.avgRR.toFixed(2)}R`} color="#f59e0b"/>
                <DetailStat label="MAX DRAWDOWN" value={`-$${Math.round(metrics.maxDrawdown).toLocaleString('en-US')}`} color="#f03e3e"/>
                <DetailStat label="RACHA MAX" value={`${metrics.maxWinStreak}W / ${metrics.maxLossStreak}L`} color="#fff"/>
              </div>

              {/* Equity curve */}
              <div style={s.chartBox}>
                <div style={s.chartTitle}>EQUITY CURVE</div>
                <svg viewBox="0 0 800 220" style={{ width:'100%', height:220, display:'block' }}>
                  <defs>
                    <linearGradient id="adminAreaGrad" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor="#1E90FF" stopOpacity="0.25"/>
                      <stop offset="100%" stopColor="#1E90FF" stopOpacity="0"/>
                    </linearGradient>
                  </defs>
                  {metrics.equityArea && <path d={metrics.equityArea} fill="url(#adminAreaGrad)"/>}
                  {metrics.equityPath && <path d={metrics.equityPath} stroke="#1E90FF" strokeWidth="2" fill="none"/>}
                </svg>
              </div>

              {/* Winning / Losing */}
              <div style={s.twoCol}>
                <div style={s.chartBox}>
                  <div style={{ ...s.chartTitle, color:'#16c95d' }}>WINNING TRADES</div>
                  <StatRow label="Total Winners" value={metrics.winsCount}/>
                  <StatRow label="Best Win" value={fmtMoney2(metrics.bestWin)} valueColor="#16c95d"/>
                  <StatRow label="Average Win" value={fmtMoney2(metrics.avgWin)} valueColor="#16c95d" last/>
                </div>
                <div style={s.chartBox}>
                  <div style={{ ...s.chartTitle, color:'#f03e3e' }}>LOSING TRADES</div>
                  <StatRow label="Total Losers" value={metrics.lossesCount}/>
                  <StatRow label="Worst Loss" value={fmtMoney2(metrics.worstLoss)} valueColor="#f03e3e"/>
                  <StatRow label="Average Loss" value={fmtMoney2(metrics.avgLoss)} valueColor="#f03e3e" last/>
                </div>
              </div>

              {/* Distribution + Sessions */}
              <div style={s.twoCol}>
                <div style={s.chartBox}>
                  <div style={s.chartTitle}>DISTRIBUTION</div>
                  <div style={{ display:'flex', alignItems:'center', gap:24 }}>
                    <Donut wins={metrics.winsCount} losses={metrics.lossesCount} be={metrics.breakevensCount}/>
                    <div style={{ flex:1 }}>
                      <LegendRow color="#16c95d" label="Wins" value={metrics.winsCount}/>
                      <LegendRow color="#f03e3e" label="Losses" value={metrics.lossesCount}/>
                      <LegendRow color="#f59e0b" label="Breakeven" value={metrics.breakevensCount} last/>
                    </div>
                  </div>
                </div>
                <div style={s.chartBox}>
                  <div style={s.chartTitle}>TRADES BY SESSION</div>
                  <StatRow label={<><span style={{ ...s.dotInline, background:'#1E90FF' }}/>London</>} value={metrics.sessionStats.london}/>
                  <StatRow label={<><span style={{ ...s.dotInline, background:'#f59e0b' }}/>New York</>} value={metrics.sessionStats.new_york}/>
                  <StatRow label={<><span style={{ ...s.dotInline, background:'#a78bfa' }}/>Asia</>} value={metrics.sessionStats.asia}/>
                  <StatRow label={<><span style={{ ...s.dotInline, background:'#8faacb' }}/>Out of Session</>} value={metrics.sessionStats.out} last/>
                </div>
              </div>
            </>}

            {detail.profile.id !== user.id && (
              <div style={s.detailActions}>
                <button onClick={() => openModal('message', detail.profile)} style={s.btnGhost}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                  Enviar mensaje
                </button>
                {detail.profile.simulador_activo ? (
                  <button onClick={() => openModal('disable', detail.profile)} style={s.btnDanger}>Desactivar acceso</button>
                ) : (
                  <button onClick={() => openModal('activate', detail.profile)} style={s.btnPrimary}>Activar acceso</button>
                )}
              </div>
            )}
          </>}
        </>}

      </div>

      {/* Modales */}
      {modal && (
        <div style={s.modalOverlay} onClick={(e) => { if (e.target === e.currentTarget) closeModal() }}>
          <div style={s.modal}>

            {modal === 'activate' && <>
              <div style={s.modalTitle}>ACTIVAR ACCESO</div>
              <div style={s.modalSub}>Al simulador para {modalTarget?.nombre || modalTarget?.email?.split('@')[0]}</div>
              <div style={s.modalDivider}/>
              <div style={s.modalText}>
                Vas a activar el acceso al simulador. Podrá entrar inmediatamente en <code style={s.code}>simulator.algorithmicsuite.com</code>.
              </div>
              <div style={s.modalNote}>Solo se modifica <code style={{color:'#1E90FF'}}>simulador_activo = true</code>. Su cuenta del hub y su journal no se tocan.</div>
              {err && <div style={s.errorBox}>{err}</div>}
              <div style={s.modalActions}>
                <button onClick={closeModal} style={s.btnGhost} disabled={busy}>Cancelar</button>
                <button onClick={() => toggleAcceso(modalTarget.id, true)} style={s.btnPrimary} disabled={busy}>{busy ? 'Activando...' : 'Activar'}</button>
              </div>
            </>}

            {modal === 'disable' && <>
              <div style={{ ...s.modalTitle, color:'#f03e3e' }}>DESACTIVAR ACCESO</div>
              <div style={s.modalSub}>¿Seguro que quieres hacer esto?</div>
              <div style={s.modalDivider}/>
              <div style={s.modalText}>
                Vas a desactivar el acceso al simulador para <strong style={{color:'#fff'}}>{modalTarget?.nombre || modalTarget?.email?.split('@')[0]}</strong>. No podrá entrar hasta que lo reactives.
              </div>
              <div style={{ ...s.modalNote, background:'rgba(240,62,62,0.06)', borderColor:'rgba(240,62,62,0.15)' }}>
                Esto <strong style={{color:'#fff'}}>no borra</strong> sus sesiones, trades ni dibujos. Solo pone <code style={{color:'#f03e3e'}}>simulador_activo = false</code>. Sus datos quedan intactos.
              </div>
              {err && <div style={s.errorBox}>{err}</div>}
              <div style={s.modalActions}>
                <button onClick={closeModal} style={s.btnGhost} disabled={busy}>Cancelar</button>
                <button onClick={() => toggleAcceso(modalTarget.id, false)} style={s.btnDanger} disabled={busy}>{busy ? 'Desactivando...' : 'Desactivar'}</button>
              </div>
            </>}

            {modal === 'message' && <>
              <div style={s.modalTitle}>ENVIAR MENSAJE</div>
              <div style={s.modalSub}>Para: {modalTarget?.nombre || modalTarget?.email?.split('@')[0]}</div>
              <div style={s.modalDivider}/>
              <label style={s.modalLabel}>ASUNTO</label>
              <input type="text" value={msgSubject} onChange={e => setMsgSubject(e.target.value)} placeholder="Ej: Feedback sobre tu última sesión" style={s.modalInput}/>
              <label style={s.modalLabel}>MENSAJE</label>
              <textarea value={msgBody} onChange={e => setMsgBody(e.target.value)} placeholder="Escribe el mensaje..." style={s.modalTextarea}/>
              <div style={s.modalNote}>El alumno lo verá en su buzón del hub (<code style={{color:'#1E90FF'}}>algorithmicsuite.com</code>).</div>
              {err && <div style={s.errorBox}>{err}</div>}
              <div style={s.modalActions}>
                <button onClick={closeModal} style={s.btnGhost} disabled={busy}>Cancelar</button>
                <button onClick={enviarMensaje} style={s.btnPrimary} disabled={busy || !msgSubject.trim() || !msgBody.trim()}>{busy ? 'Enviando...' : 'Enviar'}</button>
              </div>
            </>}

          </div>
        </div>
      )}

      <style>{`
        *{box-sizing:border-box;margin:0;padding:0}
        body{background:#000;overflow:hidden;color:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
        input,button,select,textarea{font-family:inherit}
        input::placeholder,textarea::placeholder{color:#1a3050}
        button{cursor:pointer}
        button:disabled{cursor:not-allowed;opacity:0.5}
      `}</style>
    </div>
  )
}

// ── Subcomponentes ──────────────────────────────────────────────────────────

function StatCard({ label, value, sub, icon, iconColor }) {
  return (
    <div style={s.statCard}>
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
        <div style={{ ...s.statIcon, borderColor: `${iconColor}4d`, background: `${iconColor}1a` }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">{icon}</svg>
        </div>
        <div style={s.statLabel}>{label}</div>
      </div>
      <div style={s.statValue}>{value}</div>
      <div style={s.statSub}>{sub}</div>
    </div>
  )
}

function DetailStat({ label, value, color }) {
  return (
    <div style={s.detailStatCard}>
      <div style={s.detailStatLabel}>{label}</div>
      <div style={{ ...s.detailStatValue, color }}>{value}</div>
    </div>
  )
}

function StatRow({ label, value, valueColor, last }) {
  return (
    <div style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', borderBottom: last ? 'none' : '1px solid #0a1a32', fontSize:13 }}>
      <span style={{ color:'#c8d0e0', display:'flex', alignItems:'center', gap:8 }}>{label}</span>
      <span style={{ color: valueColor || '#fff', fontWeight:600 }}>{value}</span>
    </div>
  )
}

function LegendRow({ color, label, value, last }) {
  return (
    <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, padding:'6px 0', borderBottom: last ? 'none' : '1px solid #0a1a32' }}>
      <span style={{ display:'flex', alignItems:'center', gap:8, color:'#c8d0e0' }}>
        <span style={{ width:8, height:8, borderRadius:'50%', background:color }}/>{label}
      </span>
      <span style={{ color:'#fff', fontWeight:600 }}>{value}</span>
    </div>
  )
}

function Donut({ wins, losses, be }) {
  const total = wins + losses + be
  if (total === 0) {
    return (
      <svg viewBox="0 0 100 100" style={{ width:100, height:100, flexShrink:0 }}>
        <circle cx="50" cy="50" r="35" fill="none" stroke="#0d2040" strokeWidth="14"/>
      </svg>
    )
  }
  const circ = 2 * Math.PI * 35
  const wLen = (wins / total) * circ
  const lLen = (losses / total) * circ
  const bLen = (be / total) * circ
  return (
    <svg viewBox="0 0 100 100" style={{ width:100, height:100, flexShrink:0 }}>
      <circle cx="50" cy="50" r="35" fill="none" stroke="#0d2040" strokeWidth="14"/>
      <circle cx="50" cy="50" r="35" fill="none" stroke="#16c95d" strokeWidth="14" strokeDasharray={`${wLen} ${circ}`} transform="rotate(-90 50 50)"/>
      <circle cx="50" cy="50" r="35" fill="none" stroke="#f03e3e" strokeWidth="14" strokeDasharray={`${lLen} ${circ}`} strokeDashoffset={-wLen} transform="rotate(-90 50 50)"/>
      <circle cx="50" cy="50" r="35" fill="none" stroke="#f59e0b" strokeWidth="14" strokeDasharray={`${bLen} ${circ}`} strokeDashoffset={-(wLen + lLen)} transform="rotate(-90 50 50)"/>
    </svg>
  )
}

function IconBtn({ children, title, onClick, disabled, danger }) {
  const [hover, setHover] = useState(false)
  const base = {
    background: 'transparent',
    border: '1px solid transparent',
    borderRadius: 6,
    padding: 6,
    color: '#8faacb',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all .15s',
    opacity: disabled ? 0.3 : 1,
  }
  const hoverStyle = !disabled && hover ? (danger ? {
    borderColor: 'rgba(240,62,62,0.3)',
    background: 'rgba(240,62,62,0.08)',
    color: '#f03e3e'
  } : {
    borderColor: '#0d2040',
    background: 'rgba(30,144,255,0.08)',
    color: '#1E90FF'
  }) : {}
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ ...base, ...hoverStyle }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">{children}</svg>
    </button>
  )
}

// ── Estilos ─────────────────────────────────────────────────────────────────

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
  navDivider:{height:1,background:'#0d2040',margin:'10px 12px'},
  navItem:{display:'flex',alignItems:'center',gap:10,padding:'9px 12px',borderRadius:7,fontSize:12,fontWeight:600,color:'#ffffff',cursor:'pointer',transition:'all .15s'},
  navActive:{background:'linear-gradient(135deg,#1E90FF20,#1E90FF08)',color:'#1E90FF',borderLeft:'2px solid #1E90FF'},
  navHover:{background:'rgba(30,144,255,0.06)',color:'#d0e4ff'},
  userWrap:{position:'relative',display:'flex',alignItems:'center',gap:10,padding:12,margin:'8px',borderRadius:8,background:'rgba(3,15,32,0.8)',border:'1px solid #0d2040',cursor:'pointer'},
  avatar:{width:32,height:32,borderRadius:'50%',background:'linear-gradient(135deg,#1E90FF,#0060cc)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:800,color:'#fff',flexShrink:0,boxShadow:'0 0 12px #1E90FF50'},
  userInfo:{flex:1,overflow:'hidden'},
  userName:{fontSize:11,fontWeight:600,color:'#fff',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'},
  userPlan:{fontSize:9,color:'#1E90FF',fontWeight:700,letterSpacing:0.5},
  menu:{position:'absolute',bottom:'110%',left:0,right:0,background:'#030f20',border:'1px solid #0d2040',borderRadius:8,overflow:'hidden',zIndex:100},
  menuEmail:{padding:'10px 14px',fontSize:10,color:'rgba(255,255,255,0.85)',fontWeight:500},
  menuDivider:{height:1,background:'#0d2040'},
  menuItem:{padding:'10px 14px',fontSize:12,fontWeight:600,cursor:'pointer'},

  main:{position:'relative',zIndex:1,flex:1,overflowY:'auto',padding:'32px 40px'},

  header:{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:12},
  headerTitle:{fontSize:26,fontWeight:800,color:'#fff',marginBottom:4},
  headerSub:{fontSize:13,color:'#8faacb'},
  linkHub:{color:'#8faacb',fontSize:11,textDecoration:'none',display:'inline-flex',alignItems:'center',gap:6,padding:'6px 10px',borderRadius:6,transition:'all .15s'},

  scopeHelper:{marginBottom:24,padding:'10px 14px',background:'rgba(30,144,255,0.05)',border:'1px solid rgba(30,144,255,0.12)',borderRadius:8,fontSize:11,color:'#8faacb',lineHeight:1.5},

  statsRow:{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:14,marginBottom:24},
  statCard:{background:'rgba(4,10,24,0.7)',border:'1px solid rgba(30,144,255,0.15)',borderRadius:12,padding:'16px 20px'},
  statIcon:{width:30,height:30,borderRadius:7,border:'1px solid',display:'flex',alignItems:'center',justifyContent:'center'},
  statLabel:{fontSize:9,fontWeight:700,color:'#8faacb',letterSpacing:1.5},
  statValue:{fontSize:28,fontWeight:800,color:'#fff'},
  statSub:{fontSize:10,color:'#8faacb',marginTop:2},

  tabs:{display:'flex',gap:4,borderBottom:'1px solid #0d2040',marginBottom:20},
  tab:{background:'transparent',border:'none',color:'#8faacb',fontSize:12,fontWeight:700,letterSpacing:1.5,padding:'12px 20px',borderBottom:'2px solid transparent',transition:'all .15s',display:'flex',alignItems:'center',gap:8},
  tabActive:{color:'#1E90FF',borderBottomColor:'#1E90FF'},
  tabCount:{background:'#0d2040',color:'#8faacb',fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:10,letterSpacing:0},
  tabCountActive:{background:'rgba(30,144,255,0.15)',color:'#1E90FF'},

  tableBox:{background:'rgba(4,10,24,0.5)',border:'1px solid rgba(30,144,255,0.12)',borderRadius:12,overflow:'hidden'},
  tableHeaderWith:{display:'grid',gridTemplateColumns:'minmax(220px,2fr) 90px 90px 100px 110px 130px 130px',gap:16,padding:'12px 20px',background:'rgba(0,20,60,0.3)',borderBottom:'1px solid #0d2040',fontSize:9,fontWeight:700,color:'#8faacb',letterSpacing:1.5},
  tableHeaderWithout:{display:'grid',gridTemplateColumns:'minmax(240px,2fr) 120px 130px 140px',gap:16,padding:'12px 20px',background:'rgba(0,20,60,0.3)',borderBottom:'1px solid #0d2040',fontSize:9,fontWeight:700,color:'#8faacb',letterSpacing:1.5},
  rowWith:{display:'grid',gridTemplateColumns:'minmax(220px,2fr) 90px 90px 100px 110px 130px 130px',gap:16,padding:'16px 20px',borderBottom:'1px solid #0a1a32',alignItems:'center',transition:'background .15s'},
  rowWithout:{display:'grid',gridTemplateColumns:'minmax(240px,2fr) 120px 130px 140px',gap:16,padding:'16px 20px',borderBottom:'1px solid #0a1a32',alignItems:'center',transition:'background .15s'},

  cellUser:{display:'flex',alignItems:'center',gap:12,minWidth:0},
  rowAvatar:{width:36,height:36,borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:800,color:'#fff',flexShrink:0},
  cellName:{fontSize:13,fontWeight:600,color:'#fff',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'},
  cellEmail:{fontSize:11,color:'#8faacb',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'},
  cellNum:{textAlign:'right',fontSize:13,fontVariantNumeric:'tabular-nums'},
  cellActions:{textAlign:'right',display:'flex',gap:4,justifyContent:'flex-end'},

  badgeAdmin:{fontSize:9,fontWeight:800,letterSpacing:1,padding:'3px 8px',borderRadius:4,background:'linear-gradient(135deg,#1E90FF,#0060cc)',color:'#fff',boxShadow:'0 0 10px rgba(30,144,255,0.4)',textTransform:'uppercase'},
  badgeYou:{fontSize:9,fontWeight:800,letterSpacing:1,padding:'3px 8px',borderRadius:4,background:'rgba(30,144,255,0.15)',color:'#1E90FF',border:'1px solid rgba(30,144,255,0.3)',textTransform:'uppercase'},

  btnSuccess:{background:'linear-gradient(135deg,#16c95d,#0fa048)',color:'#fff',border:'none',borderRadius:8,padding:'8px 14px',fontSize:11,fontWeight:700,letterSpacing:0.3,display:'inline-flex',alignItems:'center',gap:6,transition:'opacity .15s'},
  btnPrimary:{background:'linear-gradient(135deg,#1E90FF,#0060cc)',color:'#fff',border:'none',borderRadius:8,padding:'10px 18px',fontSize:12,fontWeight:700,letterSpacing:0.5,boxShadow:'0 4px 20px rgba(30,144,255,0.3)',display:'inline-flex',alignItems:'center',gap:8,transition:'opacity .15s'},
  btnGhost:{background:'rgba(3,8,16,0.8)',color:'#c8d0e0',border:'1px solid #0d2040',borderRadius:8,padding:'10px 18px',fontSize:12,fontWeight:700,letterSpacing:0.5,display:'inline-flex',alignItems:'center',gap:8,transition:'all .15s'},
  btnDanger:{background:'linear-gradient(135deg,#f03e3e,#c02020)',color:'#fff',border:'none',borderRadius:8,padding:'10px 18px',fontSize:12,fontWeight:700,letterSpacing:0.5,transition:'opacity .15s'},
  btnBack:{color:'#8faacb',fontSize:11,padding:'8px 12px',border:'1px solid #0d2040',background:'rgba(3,8,16,0.6)',borderRadius:8,display:'inline-flex',alignItems:'center',gap:6,transition:'all .15s'},

  emptyState:{padding:'40px',textAlign:'center',color:'#8faacb',fontSize:13},
  emptyCard:{background:'rgba(4,10,24,0.7)',border:'1px solid rgba(30,144,255,0.18)',borderRadius:12,padding:'60px 40px',textAlign:'center',display:'flex',flexDirection:'column',alignItems:'center',marginBottom:24},

  errorBox:{background:'rgba(240,62,62,0.06)',border:'1px solid rgba(240,62,62,0.3)',borderRadius:8,padding:'10px 14px',fontSize:12,color:'#f03e3e',marginBottom:12},

  // Detalle
  detailHeader:{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:24,paddingBottom:20,borderBottom:'1px solid #0d2040'},
  detailAvatar:{width:52,height:52,borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,fontWeight:800,color:'#fff',boxShadow:'0 0 16px rgba(30,144,255,0.3)'},
  detailName:{fontSize:22,fontWeight:800,color:'#fff'},
  detailEmail:{fontSize:12,color:'#8faacb'},
  selectSession:{background:'rgba(3,8,16,0.8)',border:'1px solid #0d2040',borderRadius:8,padding:'10px 14px',color:'#fff',fontSize:12,fontWeight:600,cursor:'pointer'},

  statsRowDetail:{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:14,marginBottom:14},
  detailStatCard:{background:'rgba(4,10,24,0.7)',border:'1px solid rgba(30,144,255,0.15)',borderRadius:12,padding:'18px 22px'},
  detailStatLabel:{fontSize:10,fontWeight:700,color:'#1E90FF',letterSpacing:1.5,marginBottom:10},
  detailStatValue:{fontSize:28,fontWeight:800},

  chartBox:{background:'rgba(4,10,24,0.5)',border:'1px solid rgba(30,144,255,0.12)',borderRadius:12,padding:22,marginBottom:24},
  chartTitle:{fontSize:11,fontWeight:700,color:'#1E90FF',letterSpacing:2,marginBottom:16},

  twoCol:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16},
  dotInline:{display:'inline-block',width:8,height:8,borderRadius:'50%'},

  detailActions:{display:'flex',gap:10,justifyContent:'flex-end',paddingTop:20,borderTop:'1px solid #0d2040'},

  // Modal
  modalOverlay:{position:'fixed',inset:0,background:'rgba(0,0,0,0.75)',backdropFilter:'blur(4px)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000},
  modal:{background:'rgba(3,8,16,0.95)',border:'1px solid #0d2040',borderRadius:16,padding:32,width:'100%',maxWidth:480,boxShadow:'0 30px 80px rgba(0,0,0,0.9),0 0 60px rgba(30,144,255,0.1)'},
  modalTitle:{fontSize:14,fontWeight:800,letterSpacing:2,color:'#fff',marginBottom:4},
  modalSub:{fontSize:11,color:'#8faacb',fontStyle:'italic',marginBottom:20},
  modalDivider:{height:1,background:'linear-gradient(90deg,transparent,rgba(30,144,255,0.5),transparent)',marginBottom:20},
  modalText:{fontSize:13,color:'#c8d0e0',lineHeight:1.6,marginBottom:16},
  modalNote:{padding:'12px 14px',background:'rgba(30,144,255,0.06)',border:'1px solid rgba(30,144,255,0.15)',borderRadius:8,fontSize:11,color:'#8faacb',lineHeight:1.5,marginBottom:20},
  modalLabel:{fontSize:10,fontWeight:700,color:'#1E90FF',letterSpacing:1.5,marginBottom:6,display:'block'},
  modalInput:{width:'100%',background:'#03080f',border:'1px solid #0d1f3c',borderRadius:8,padding:'11px 14px',fontSize:13,color:'#fff',outline:'none',transition:'border-color .2s',marginBottom:16},
  modalTextarea:{width:'100%',background:'#03080f',border:'1px solid #0d1f3c',borderRadius:8,padding:'11px 14px',fontSize:13,color:'#fff',outline:'none',transition:'border-color .2s',marginBottom:16,resize:'vertical',minHeight:90,fontFamily:'inherit'},
  modalActions:{display:'flex',gap:10,justifyContent:'flex-end',marginTop:8},

  code:{color:'#1E90FF',background:'#0d2040',padding:'1px 6px',borderRadius:4,fontSize:12,fontFamily:'monospace'},
}
