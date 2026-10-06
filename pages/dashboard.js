import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabase'
import ChallengeSetupModal from '../components/ChallengeSetupModal'
import NetworkBg from '../components/NetworkBg'
import AppSidebar from '../components/AppSidebar'
import Estrellas from '../components/Estrellas'
import { metricas } from '../lib/metricas'
import NoAccess from '../components/NoAccess'
import ErrorCarga from '../components/ErrorCarga'
import { leerTodo, porColumnas } from '../lib/paginado'
import { tradesDeUsuario } from '../lib/tradesEstables'

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
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [sessions, setSessions] = useState([])
  const [trades, setTrades] = useState([])
  const [showNew, setShowNew] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newErr, setNewErr] = useState('')
  const [activeView, setActiveView] = useState('dashboard')
  const [form, setForm] = useState({ name: '', pair: 'EUR/USD', dateFrom: '', dateTo: '', capital: 10000 })
  const [profile, setProfile] = useState(null)
  const [acceso, setAcceso] = useState(null)   // null comprobando · 'si' · 'no' · 'error'
  const [errorDatos, setErrorDatos] = useState('')
  const [borrando, setBorrando] = useState(null)        // id de la sesion que se esta borrando
  const [errorBorrado, setErrorBorrado] = useState('')
  const [showChallenge, setShowChallenge] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.replace('/'); return }
      setUser(session.user)
      // Cargar perfil para saber si es admin
      const { data: prof, error: profErr } = await supabase
        .from('profiles')
        .select('id, email, nombre, rol_global, journal_activo, simulador_activo, plan')
        .eq('id', session.user.id)
        .maybeSingle()
      // Permiso de producto (auditoria S01, 4-oct-2026): sin simulador_activo
      // (o admin) no se carga nada del simulador. Si el perfil no se puede leer,
      // no se sabe: se dice, y tampoco se carga.
      if (profErr) { setAcceso('error'); setLoading(false); return }
      if (prof) setProfile(prof)
      if (!prof || !(prof.rol_global === 'admin' || prof.simulador_activo === true)) { setAcceso('no'); setLoading(false); return }
      setAcceso('si')
      // C04 (4-oct-2026): el cargador no se quita hasta tener los datos, y un
      // fallo se dice (antes: «No sessions yet» mientras cargaba o si fallaba)
      const [rs, rt] = await Promise.all([loadSessions(session.user.id), loadTrades(session.user.id)])
      if (rs.error || rt.error) setErrorDatos('No se han podido cargar tus sesiones u operaciones. Comprueba tu conexión y vuelve a intentarlo.')
      setLoading(false)
    })
  }, [])


  // Lecturas completas, paginadas y con el total comprobado (C04). Devuelven
  // { error } para que quien llama lo diga.
  async function loadSessions(userId) {
    // bloque D, punto 5: por clave (created_at, id); el orden de siempre, despues
    const r = await leerTodo(() => supabase.from('sim_sessions').select('*', { count: 'exact' }).eq('user_id', userId),
      { ordena: porColumnas([['created_at', 'desc'], ['id', 'asc']]) })
    if (!r.error) setSessions(r.data)
    return r
  }

  async function loadTrades(userId) {
    // bloque G, punto 1 (Astra BD-04): en UNA sentencia (sql/sim-002); paginando,
    // el TOTAL P&L visible podia ser de un conjunto que nunca existio
    const r = await tradesDeUsuario(supabase, userId, { ordena: porColumnas([['opened_at', 'asc'], ['id', 'asc']]) })
    if (!r.error) setTrades(r.data)
    return r
  }

  // Borrar una sesion (auditoria D06, 4-oct-2026; bloque D, punto 6, 5-oct-2026).
  // UN SOLO DELETE de sim_sessions: es una sentencia, o se borra todo o nada.
  // Los hijos caen por las FKs ON DELETE CASCADE: sim_trades y session_drawings
  // (las que el CTO leyo en produccion, sql/APLICADOS.md) y session_chart_config
  // (la FK de sim-001b). Antes, cuatro deletes en orden: borrar los trades y
  // fallar en los dibujos dejaba una sesion operable sin su libro (Astra).
  // La pantalla solo cambia cuando la base confirma UNA fila borrada.
  async function borrarSesion(session) {
    if (!confirm('¿Eliminar sesión y todos sus datos?')) return
    const sid = session.id
    setBorrando(sid); setErrorBorrado('')
    const { error, count } = await supabase.from('sim_sessions').delete({ count: 'exact' }).eq('id', sid)
    if (error || count !== 1) {
      // Bloque E, punto 4 (Astra BD-05): un error puede ser la RESPUESTA perdida
      // de un DELETE que si se aplico. Nunca se dice «no se ha borrado» sin
      // comprobarlo: se reconcilia por id y se dice lo que de verdad paso.
      const r = await supabase.from('sim_sessions').select('id').eq('id', sid)
      if (!r.error && Array.isArray(r.data) && r.data.length === 0) {
        quitaDeLaPantalla(sid)
        setErrorBorrado(`«${session.name}» se ha borrado (la confirmación se perdió por el camino; comprobado después).`)
      } else if (!r.error && Array.isArray(r.data) && r.data.length === 1) {
        setErrorBorrado(`No se ha podido borrar «${session.name}»: comprobado, la sesión sigue entera. Vuelve a intentarlo.`)
      } else {
        setErrorBorrado(`No se sabe si «${session.name}» se ha borrado: no se ha podido comprobar. Recarga la página para verlo.`)
      }
      setBorrando(null)
      if (user) { loadSessions(user.id); loadTrades(user.id) }
      return
    }
    quitaDeLaPantalla(sid)
    setBorrando(null)
  }
  function quitaDeLaPantalla(sid) {
    setSessions(p => p.filter(s => s.id !== sid))
    setTrades(p => p.filter(t => t.session_id !== sid))
  }

  async function createSession() {
    if (!form.name || !form.dateFrom || !form.dateTo) return
    setNewErr('')
    // Suelo: la data empieza en enero 2024; se exigen 6 meses de contexto previo → minimo 1-jul-2024.
    const FLOOR = '2024-07-01'
    if (form.dateFrom < FLOOR || form.dateTo < FLOOR) {
      setNewErr('La fecha mas temprana disponible es el 1 de julio de 2024. Ajusta el inicio del backtest a esa fecha o posterior.')
      return
    }
    // Tope: la data del dia actual aun no esta descargada. Maximo permitido = ayer.
    const _y = new Date(); _y.setDate(_y.getDate() - 1)
    const YESTERDAY = _y.toISOString().slice(0, 10)
    if (form.dateFrom > YESTERDAY || form.dateTo > YESTERDAY) {
      setNewErr('No se puede crear una sesion hasta el dia de hoy ni con fechas futuras: los datos del dia aun no estan disponibles. Elige como maximo la fecha de ayer.')
      return
    }
    const rangeDays = (new Date(form.dateTo) - new Date(form.dateFrom)) / (1000 * 60 * 60 * 24)
    if (rangeDays < 180) {
      setNewErr('Rango demasiado corto para un backtest fiable. Amplialo a un minimo de 6 meses para tener muestra suficiente.')
      return
    }
    setCreating(true)
    const { data, error } = await supabase.from('sim_sessions').insert({
      user_id: user.id, name: form.name, pair: form.pair,
      timeframe: 'H1', date_from: form.dateFrom, date_to: form.dateTo,
      capital: parseFloat(form.capital), balance: parseFloat(form.capital), status: 'active'
    }).select().maybeSingle()
    setCreating(false)
    if (error) {
      const m = (error.message || '').toLowerCase()
      if (m.includes('limite de sesiones') || m.includes('max ')) {
        const isExtra = profile && profile.plan === 'extra'
        const planLabel = isExtra ? 'Extra' : 'Basic'
        const planMax = isExtra ? 12 : 6
        const extraHint = isExtra ? '' : ' o pasa a Extra'
        setNewErr(`Tu plan ${planLabel} permite ${planMax} sesiones. Has alcanzado el limite. Borra una sesion${extraHint} para crear mas.`)
      } else {
        setNewErr('No se pudo crear la sesion. Intentalo de nuevo.')
      }
      return
    }
    if (!error && data) {
      setShowNew(false)
      setForm({ name: '', pair: 'EUR/USD', dateFrom: '', dateTo: '', capital: 10000 })
      setSessions(prev => [data, ...prev])
      router.push(`/session/${data.id}`)
    }
  }

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
  // Mismas definiciones que Analytics y el admin (lib/metricas.js, auditoria C02)
  const metrics = useMemo(() => {
    const m = metricas(trades, sessions)
    return { closedTrades: m.cerrados, wins: m.ganadoras, totalPnl: m.totalPnl }
  }, [trades, sessions])

  const { closedTrades, wins, totalPnl } = metrics

  if (loading) return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',background:'#000'}}>
      <div className="spinner"/>
      <style>{`.spinner{width:32px;height:32px;border:2px solid #0a1628;border-top-color:#1E90FF;border-radius:50%;animation:spin .7s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  if (acceso === 'no') return <NoAccess profile={profile} producto="Simulador" />
  if (errorDatos) return <ErrorCarga mensaje={errorDatos} />
  if (acceso === 'error') return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',background:'#000',color:'#fff',fontFamily:'Montserrat,sans-serif',padding:24,textAlign:'center'}}>
      No se ha podido comprobar tu acceso al simulador. Recarga la página en unos segundos.
    </div>
  )

  // Username de la tabla profiles (nombre asignado al invitar al alumno).
  // Fallback al email split si no hay perfil cargado todavía o falta el nombre.
  const username = profile?.nombre || user?.email?.split('@')[0] || ''
  // EUR/GBP, EUR/JPY y XAU/USD retirados hasta nuevo aviso (CTO, 4-oct-2026): no hay datos en el bucket
  const PAIRS = ['EUR/USD','GBP/USD','USD/JPY','USD/CHF','AUD/USD','USD/CAD','NZD/USD','GBP/JPY']

  const _yMax = new Date(); _yMax.setDate(_yMax.getDate() - 1)
  const MAX_DATE = _yMax.toISOString().slice(0, 10)

  return (
    <div style={s.root}>
      <NetworkBg />
          {/* Las estrellas del hub, justo despues del cielo */}
          <Estrellas />

      <AppSidebar
        active={activeView}
        user={user}
        profile={profile}
        onNavigate={(key) => {
          if (key === 'new') { setShowNew(true); return true }
          if (key === 'dashboard' || key === 'sessions') { setActiveView(key); return true }
          return false
        }}
      />

      <div style={s.main} className="appMain">

        {/* ── DASHBOARD VIEW ── */}
        {activeView === 'dashboard' && <>
          <div style={s.header} className="dashHeader">
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

          <div style={s.ctaRow} className="dashCtaRow">
            <div className="ctaCardHover vidrio" style={s.ctaCard} onClick={()=>setShowNew(true)}>
              <div style={{...s.ctaIcon,background:'#1E90FF20',borderColor:'#1E90FF50'}}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1E90FF" strokeWidth="1.5"><polygon points="5,3 19,12 5,21"/></svg>
              </div>
              <div style={s.ctaTitle}>Practice Session</div>
              <div style={s.ctaSub}>Replay historical candles and train your entries candle by candle</div>
              <div style={s.ctaLink}>Start now →</div>
            </div>
            <div className="ctaCardHover vidrio" style={s.ctaCard} onClick={()=>setShowChallenge(true)}>
              <div style={{...s.ctaIcon,background:'#1E90FF20',borderColor:'#1E90FF50'}}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1E90FF" strokeWidth="1.5"><path d="M12 2L4 6v6c0 5 3.5 9.5 8 10 4.5-.5 8-5 8-10V6l-8-4z"/></svg>
              </div>
              <div style={s.ctaTitle}>Propfirms Challenge</div>
              <div style={s.ctaSub}>Challenge tipo FTMO: supera las fases respetando las reglas de drawdown</div>
              <div style={s.ctaLink}>Start now →</div>
            </div>
            <div className="ctaCardHover vidrio" style={s.ctaCard} onClick={()=>router.push('/operativas')}>
              <div style={{...s.ctaIcon,background:'#1E90FF20',borderColor:'#1E90FF50'}}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1E90FF" strokeWidth="1.5"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
              </div>
              <div style={s.ctaTitle}><span style={{color:'#fff'}}>Operativa </span><span style={{color:'#1E90FF'}}>R.A.M.M.FX TRADING™</span></div>
              <div style={s.ctaSub}>Vídeos y flujos de trabajo para el recap diario</div>
              <div style={s.ctaLink}>Start now →</div>
            </div>
          </div>

          <div style={s.statsRow} className="dashStatsRow">
            {[
              {label:'SESSIONS',value:String(sessions.length),color:'#1E90FF',icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1E90FF" strokeWidth="1.5"><polygon points="5,3 19,12 5,21"/></svg>},
              {label:'TRADES TAKEN',value:String(trades.length),color:'#22c55e',icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="1.5"><polyline points="22,12 18,12 15,21 9,3 6,12 2,12"/></svg>},
              {label:'WIN RATE',value:trades.length>0?`${(wins.length/closedTrades.length*100||0).toFixed(0)}%`:'—',color:'#f59e0b',icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="1.5"><circle cx="12" cy="8" r="6"/><path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11"/></svg>},
              {label:'TOTAL P&L',value:`${totalPnl>=0?'+':''}$${totalPnl.toFixed(2)}`,color:totalPnl>=0?'#22c55e':'#ef4444',icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1E90FF" strokeWidth="1.5"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>},
            ].map(stat=>(
              <div key={stat.label} className="vidrio" style={s.statCard}>
                <div style={{...s.statIcon,borderColor:stat.color+'40',background:stat.color+'15'}}>{stat.icon}</div>
                <div style={{...s.statValue,color:stat.color}}>{stat.value}</div>
                <div style={s.statLabel}>{stat.label}</div>
              </div>
            ))}
          </div>

          {errorBorrado && <div role="alert" style={{background:'rgba(239,68,68,0.12)',border:'1px solid rgba(239,68,68,0.4)',color:'#fca5a5',borderRadius:8,padding:'10px 14px',fontSize:13,marginBottom:12}}>{errorBorrado}</div>}
          {sessions.length === 0 ? (
            <div className="vidrio" style={s.emptyCard}>
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
                    <button onClick={()=>borrarSesion(session)} disabled={borrando===session.id} style={{background:'none',border:'none',color:'#3a5070',cursor:'pointer',fontSize:14}}>✕</button>
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
          <div style={s.header} className="dashHeader">
            <div>
              <h1 style={s.headerTitle}>Sessions</h1>
              <p style={s.headerSub}>All your backtesting sessions</p>
            </div>
            <button style={s.startBtn} onClick={()=>setShowNew(true)}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="white"><polygon points="5,3 19,12 5,21"/></svg>
              New Session
            </button>
          </div>
          {errorBorrado && <div role="alert" style={{background:'rgba(239,68,68,0.12)',border:'1px solid rgba(239,68,68,0.4)',color:'#fca5a5',borderRadius:8,padding:'10px 14px',fontSize:13,marginBottom:12}}>{errorBorrado}</div>}
          {sessions.length === 0 ? (
            <div className="vidrio" style={s.emptyCard}>
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
                    <button onClick={()=>borrarSesion(session)} disabled={borrando===session.id} style={{background:'none',border:'none',color:'#3a5070',cursor:'pointer',fontSize:14}}>✕</button>
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
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.8)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',backdropFilter:'blur(4px)'}} className="dashModalOverlay" onClick={()=>setShowNew(false)}>
          <div style={{background:'#030f20',border:'1px solid #0d2040',borderRadius:16,padding:'28px',width:'100%',maxWidth:520,boxShadow:'0 0 60px #1E90FF10',fontFamily:'Montserrat,sans-serif'}} onClick={e=>e.stopPropagation()}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:24}}>
              <div style={{fontSize:18,fontWeight:800,color:'#ffffff'}}>New Session</div>
              <button style={{background:'none',border:'none',color:'rgba(255,255,255,0.85)',cursor:'pointer',fontSize:18,fontFamily:'Montserrat,sans-serif'}} onClick={()=>setShowNew(false)}>✕</button>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginBottom:20}} className="dashModalGrid">
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
                <input style={{background:'#03080f',border:'1px solid #0d1f3c',borderRadius:8,padding:'11px 14px',fontSize:13,color:'#fff',outline:'none',fontFamily:'Montserrat,sans-serif'}} type="date" min="2024-07-01" max={MAX_DATE} value={form.dateFrom} onChange={e=>setForm({...form,dateFrom:e.target.value})} onFocus={e=>e.target.style.borderColor='#1E90FF'} onBlur={e=>e.target.style.borderColor='#0d1f3c'}/>
              </div>
              <div style={{display:'flex',flexDirection:'column',gap:7}}>
                <label style={{fontSize:10,fontWeight:700,color:'#1E90FF',letterSpacing:1.5}}>DATE TO</label>
                <input style={{background:'#03080f',border:'1px solid #0d1f3c',borderRadius:8,padding:'11px 14px',fontSize:13,color:'#fff',outline:'none',fontFamily:'Montserrat,sans-serif'}} type="date" min="2024-07-01" max={MAX_DATE} value={form.dateTo} onChange={e=>setForm({...form,dateTo:e.target.value})} onFocus={e=>e.target.style.borderColor='#1E90FF'} onBlur={e=>e.target.style.borderColor='#0d1f3c'}/>
              </div>
            </div>
            {newErr && (
              <div style={{background:'rgba(240,62,62,0.12)',border:'1px solid rgba(240,62,62,0.4)',borderRadius:8,padding:'10px 14px',marginBottom:12,fontSize:12,color:'#ff8585',fontFamily:'Montserrat,sans-serif',lineHeight:1.4}}>{newErr}</div>
            )}
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
        .ctaCardHover{transition:transform .18s ease,border-color .18s ease,box-shadow .18s ease}
        .ctaCardHover:hover{transform:translateY(-4px);border-color:rgba(30,144,255,.75);box-shadow:0 12px 38px rgba(30,144,255,.22)}
        input[type=date]::-webkit-calendar-picker-indicator{filter:invert(1);opacity:0.5}
        select option{background:#030f20;color:#fff}
        @media(max-width:767px){
          .appMain{padding:76px 16px 24px !important}
          /* Header: título + botonera en varias líneas si no caben */
          .dashHeader{flex-wrap:wrap;gap:12px}
          /* CTA cards (Practice/Challenge/Operativa): apiladas a 1 columna */
          .dashCtaRow{flex-direction:column}
          /* Stats cards: de fila única a rejilla 2x2 */
          .dashStatsRow{flex-wrap:wrap}
          .dashStatsRow>div{flex:1 1 40% !important}
          /* Modal New Session: margen lateral y formulario a 1 columna */
          .dashModalOverlay{padding:16px}
          .dashModalGrid{grid-template-columns:1fr !important}
        }
      `}</style>
      <ChallengeSetupModal open={showChallenge} onClose={()=>setShowChallenge(false)} />
    </div>
  )
}

const s = {
  root:{display:'flex',height:'100vh',overflow:'hidden',background:'#000',position:'relative'},
  bgCanvas:{position:'fixed',inset:0,width:'100%',height:'100%',pointerEvents:'none',zIndex:0},
  main:{position:'relative',zIndex:1,flex:1,overflowY:'auto',padding:'32px 40px'},
  header:{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:32},
  headerTitle:{fontSize:26,fontWeight:800,color:'#ffffff',marginBottom:4},
  headerSub:{fontSize:13,color:'#ffffff'},
  iconBtn:{background:'rgba(3,8,16,0.8)',border:'1px solid #0d2040',borderRadius:8,padding:'8px',cursor:'pointer',color:'#a0b0c8',display:'flex',alignItems:'center',justifyContent:'center'},
  startBtn:{display:'flex',alignItems:'center',gap:8,background:'linear-gradient(135deg,#1E90FF,#0060cc)',color:'#fff',border:'none',borderRadius:8,padding:'10px 20px',fontSize:12,fontWeight:700,cursor:'pointer',boxShadow:'0 4px 20px #1E90FF30',fontFamily:'Montserrat,sans-serif'},
  ctaRow:{display:'flex',gap:16,marginBottom:28},
  ctaCard:{flex:1,borderRadius:14,padding:'24px 20px',cursor:'pointer',transition:'all .2s',animation:'ctaRise .5s ease both'},
  ctaOff:{opacity:.7,cursor:'default'},
  ctaIcon:{width:44,height:44,borderRadius:10,border:'1px solid',display:'flex',alignItems:'center',justifyContent:'center',marginBottom:14},
  ctaTitle:{fontSize:14,fontWeight:700,color:'#ffffff',marginBottom:6},
  ctaSub:{fontSize:11,color:'#ffffff',lineHeight:1.5,marginBottom:16},
  ctaLink:{fontSize:12,fontWeight:700,color:'#1E90FF'},
  statsRow:{display:'flex',gap:16,marginBottom:28},
  statCard:{flex:1,display:'flex',flexDirection:'column',gap:6,borderRadius:12,padding:'16px 20px'},
  statIcon:{width:36,height:36,borderRadius:8,border:'1px solid',display:'flex',alignItems:'center',justifyContent:'center',marginBottom:4},
  statValue:{fontSize:24,fontWeight:800},
  statLabel:{fontSize:9,fontWeight:700,color:'#ffffff',letterSpacing:1.5},
  emptyCard:{borderRadius:12,padding:'60px 40px',textAlign:'center',display:'flex',flexDirection:'column',alignItems:'center',},
  emptyTitle:{fontSize:16,fontWeight:700,color:'#ffffff',marginBottom:8},
  emptySub:{fontSize:12,color:'#ffffff',lineHeight:1.6,maxWidth:380},
}
