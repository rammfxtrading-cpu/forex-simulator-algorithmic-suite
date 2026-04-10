import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabase'

export const getServerSideProps = () => ({ props: {} })

export default function Dashboard() {
  const router = useRouter()
  const bgRef = useRef(null)
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [sessions, setSessions] = useState([])
  const [showNew, setShowNew] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const [sessions, setSessions] = useState([])
  const [showNew, setShowNew] = useState(false)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({
    name: '', pair: 'EUR/USD', dateFrom: '', dateTo: '', capital: 10000
  })
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({
    name: '', pair: 'EUR/USD', timeframe: 'H1',
    dateFrom: '', dateTo: '', capital: 10000
  })

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.replace('/'); return }
      setUser(session.user)
      loadSessions(session.user.id)
      setLoading(false)
    })
  }, [])

  // Constellation canvas
  useEffect(() => {
    const canvas = bgRef.current
    if (!canvas || loading) return
    const ctx = canvas.getContext('2d')
    canvas.width = window.innerWidth
    canvas.height = window.innerHeight
    const nodes = []
    for (let i = 0; i < 60; i++) {
      nodes.push({ x: Math.random()*canvas.width, y: Math.random()*canvas.height,
        vx:(Math.random()-.5)*.3, vy:(Math.random()-.5)*.3, r:Math.random()*1.5+.8 })
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

  async function loadSessions(userId) {
    const { data } = await supabase.from('sim_sessions').select('*').eq('user_id', userId).order('created_at', { ascending: false })
    if (data) setSessions(data)
  }

  async function createSession() {
    if (!form.name || !form.dateFrom || !form.dateTo) return
    setCreating(true)
    const { data, error } = await supabase.from('sim_sessions').insert({
      user_id: user.id,
      name: form.name,
      pair: form.pair,
      timeframe: form.timeframe,
      date_from: form.dateFrom,
      date_to: form.dateTo,
      capital: parseFloat(form.capital),
      balance: parseFloat(form.capital),
      status: 'active'
    }).select().single()
    setCreating(false)
    if (!error && data) {
      setShowNew(false)
      setForm({ name: '', pair: 'EUR/USD', timeframe: 'H1', dateFrom: '', dateTo: '', capital: 10000 })
      router.push(`/session/${data.id}`)
    }
  }

  async function deleteSession(id) {
    if (!confirm('¿Eliminar esta sesión?')) return
    await supabase.from('sim_sessions').delete().eq('id', id)
    setSessions(prev => prev.filter(s => s.id !== id))
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/')
  }

  async function loadSessions(userId) {
    const { data } = await supabase.from('sim_sessions').select('*').eq('user_id', userId).order('created_at', { ascending: false })
    if (data) setSessions(data)
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
      router.push(`/session/${data.id}`)
    }
  }

  if (loading) return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',background:'#000'}}>
      <div className="spinner"/>
      {/* NEW SESSION MODAL */}
      {showNew && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.8)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',backdropFilter:'blur(4px)'}} onClick={()=>setShowNew(false)}>
          <div style={{background:'#030f20',border:'1px solid #0d2040',borderRadius:16,padding:'28px',width:'100%',maxWidth:520,boxShadow:'0 0 60px #1E90FF10',fontFamily:'Montserrat,sans-serif'}} onClick={e=>e.stopPropagation()}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:24}}>
              <div style={{fontSize:18,fontWeight:800,color:'#ffffff'}}>New Session</div>
              <button style={{background:'none',border:'none',color:'#4a6080',cursor:'pointer',fontSize:16}} onClick={()=>setShowNew(false)}>✕</button>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginBottom:16}}>
              <div style={{gridColumn:'1/-1',display:'flex',flexDirection:'column',gap:7}}>
                <label style={{fontSize:10,fontWeight:700,color:'#1E90FF',letterSpacing:1.5}}>SESSION NAME</label>
                <input style={{background:'#03080f',border:'1px solid #0d1f3c',borderRadius:8,padding:'11px 14px',fontSize:13,color:'#fff',outline:'none',fontFamily:'Montserrat,sans-serif'}} placeholder="e.g. EUR/USD Jan 2023" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} onFocus={e=>e.target.style.borderColor='#1E90FF'} onBlur={e=>e.target.style.borderColor='#0d1f3c'}/>
              </div>
              <div style={{display:'flex',flexDirection:'column',gap:7}}>
                <label style={{fontSize:10,fontWeight:700,color:'#1E90FF',letterSpacing:1.5}}>PAIR</label>
                <select style={{background:'#03080f',border:'1px solid #0d1f3c',borderRadius:8,padding:'11px 14px',fontSize:13,color:'#fff',outline:'none',fontFamily:'Montserrat,sans-serif',cursor:'pointer'}} value={form.pair} onChange={e=>setForm({...form,pair:e.target.value})}>
                  {['EUR/USD','GBP/USD','USD/JPY','USD/CHF','AUD/USD','USD/CAD','NZD/USD','EUR/GBP','EUR/JPY','GBP/JPY','XAU/USD'].map(p=><option key={p}>{p}</option>)}
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
      <style>{`.spinner{width:32px;height:32px;border:2px solid #0a1628;border-top-color:#1E90FF;border-radius:50%;animation:spin .7s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  const initials = user?.email?.slice(0,2).toUpperCase()||'FX'
  const username = user?.email?.split('@')[0]||''

  const PAIRS = ['EUR/USD','GBP/USD','USD/JPY','USD/CHF','AUD/USD','USD/CAD','NZD/USD','EUR/GBP','EUR/JPY','GBP/JPY','XAU/USD']
  const TFS = ['M1','M5','M15','M30','H1','H4','D1']

  return (
    <div style={s.root}>
      <canvas ref={bgRef} style={s.canvas}/>

      {/* SIDEBAR */}
      <div style={s.sidebar}>
        <div style={s.logoWrap}>
          <div style={s.logoForex}>FOREX</div>
          <div style={s.logoSim}>SIMULATOR</div>
          <div style={s.logoBy}>by Algorithmic Suite</div>
        </div>
        <div style={s.divider}/>
        <nav style={s.nav}>
          <div style={{...s.navItem,...s.navActive}}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
            Dashboard
          </div>
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

      {/* MAIN */}
      <div style={s.main}>
        <div style={s.header}>
          <div>
            <h1 style={s.headerTitle}>Sessions</h1>
            <p style={s.headerSub}>Your backtesting sessions</p>
          </div>
          <button style={s.newBtn} onClick={()=>setShowNew(true)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            New Session
          </button>
        </div>

        {/* Sessions grid */}
        {sessions.length === 0 ? (
          <div style={s.empty}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#1a3a5c" strokeWidth="1" style={{marginBottom:16}}><rect x="3" y="3" width="18" height="18" rx="2"/><polyline points="3,9 21,9"/><polyline points="9,21 9,9"/></svg>
            <div style={s.emptyTitle}>No sessions yet</div>
            <div style={s.emptySub}>Create your first backtesting session to start practicing</div>
            <button style={{...s.newBtn,marginTop:20}} onClick={()=>setShowNew(true)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              New Session
            </button>
          </div>
        ) : (
          <div style={s.grid}>
            {sessions.map(session => (
              <div key={session.id} style={s.card}>
                <div style={s.cardHeader}>
                  <div style={s.cardName}>{session.name}</div>
                  <button onClick={()=>deleteSession(session.id)} style={s.deleteBtn} title="Delete">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3,6 5,6 21,6"/><path d="M19,6l-1,14a2,2,0,0,1-2,2H8a2,2,0,0,1-2-2L5,6"/><path d="M10,11v6"/><path d="M14,11v6"/></svg>
                  </button>
                </div>
                <div style={s.cardMeta}>
                  <span style={s.badge}>{session.pair}</span>
                  <span style={s.badge}>{session.timeframe}</span>
                </div>
                <div style={s.cardDates}>{session.date_from} → {session.date_to}</div>
                <div style={s.cardStats}>
                  <div style={s.stat}>
                    <div style={s.statLabel}>CAPITAL</div>
                    <div style={s.statVal}>${Number(session.capital).toLocaleString()}</div>
                  </div>
                  <div style={s.stat}>
                    <div style={s.statLabel}>BALANCE</div>
                    <div style={{...s.statVal, color: session.balance >= session.capital ? '#22c55e' : '#ef4444'}}>
                      ${Number(session.balance).toLocaleString()}
                    </div>
                  </div>
                  <div style={s.stat}>
                    <div style={s.statLabel}>P&L</div>
                    <div style={{...s.statVal, color: (session.balance - session.capital) >= 0 ? '#22c55e' : '#ef4444'}}>
                      {(session.balance - session.capital) >= 0 ? '+' : ''}${(session.balance - session.capital).toFixed(2)}
                    </div>
                  </div>
                </div>
                <button style={s.openBtn} onClick={()=>router.push(`/session/${session.id}`)}>
                  Open Session →
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* NEW SESSION MODAL */}
      {showNew && (
        <div style={s.overlay} onClick={()=>setShowNew(false)}>
          <div style={s.modal} onClick={e=>e.stopPropagation()}>
            <div style={s.modalHeader}>
              <div style={s.modalTitle}>New Session</div>
              <button style={s.closeBtn} onClick={()=>setShowNew(false)}>✕</button>
            </div>

            <div style={s.formGrid}>
              <div style={s.formGroup}>
                <label style={s.label}>SESSION NAME</label>
                <input style={s.input} placeholder="e.g. EUR/USD Jan 2023" value={form.name}
                  onChange={e=>setForm({...form,name:e.target.value})}
                  onFocus={e=>e.target.style.borderColor='#1E90FF'}
                  onBlur={e=>e.target.style.borderColor='#0d1f3c'}/>
              </div>
              <div style={s.formGroup}>
                <label style={s.label}>INITIAL CAPITAL ($)</label>
                <input style={s.input} type="number" value={form.capital}
                  onChange={e=>setForm({...form,capital:e.target.value})}
                  onFocus={e=>e.target.style.borderColor='#1E90FF'}
                  onBlur={e=>e.target.style.borderColor='#0d1f3c'}/>
              </div>
              <div style={s.formGroup}>
                <label style={s.label}>PAIR</label>
                <select style={s.select} value={form.pair} onChange={e=>setForm({...form,pair:e.target.value})}>
                  {PAIRS.map(p=><option key={p}>{p}</option>)}
                </select>
              </div>
              <div style={s.formGroup}>
                <label style={s.label}>TIMEFRAME</label>
                <select style={s.select} value={form.timeframe} onChange={e=>setForm({...form,timeframe:e.target.value})}>
                  {TFS.map(t=><option key={t}>{t}</option>)}
                </select>
              </div>
              <div style={s.formGroup}>
                <label style={s.label}>DATE FROM</label>
                <input style={s.input} type="date" value={form.dateFrom}
                  onChange={e=>setForm({...form,dateFrom:e.target.value})}
                  onFocus={e=>e.target.style.borderColor='#1E90FF'}
                  onBlur={e=>e.target.style.borderColor='#0d1f3c'}/>
              </div>
              <div style={s.formGroup}>
                <label style={s.label}>DATE TO</label>
                <input style={s.input} type="date" value={form.dateTo}
                  onChange={e=>setForm({...form,dateTo:e.target.value})}
                  onFocus={e=>e.target.style.borderColor='#1E90FF'}
                  onBlur={e=>e.target.style.borderColor='#0d1f3c'}/>
              </div>
            </div>

            <button style={{...s.newBtn,width:'100%',justifyContent:'center',marginTop:8,opacity:creating?0.7:1}}
              onClick={createSession} disabled={creating}>
              {creating ? 'Creating...' : 'Create Session →'}
            </button>
          </div>
        </div>
      )}

      <style>{`
        *{box-sizing:border-box}
        input[type=date]::-webkit-calendar-picker-indicator{filter:invert(1);opacity:0.5}
        .spinner{width:32px;height:32px;border:2px solid #0a1628;border-top-color:#1E90FF;border-radius:50%;animation:spin .7s linear infinite}
        @keyframes spin{to{transform:rotate(360deg)}}
      `}</style>
    </div>
  )
}

const s = {
  root:{display:'flex',height:'100vh',overflow:'hidden',background:'#000',position:'relative',fontFamily:"'Montserrat',sans-serif"},
  canvas:{position:'fixed',inset:0,width:'100%',height:'100%',pointerEvents:'none',zIndex:0},
  sidebar:{position:'relative',zIndex:1,width:220,flexShrink:0,background:'rgba(2,8,16,0.5)',borderRight:'1px solid #0d2040',display:'flex',flexDirection:'column',backdropFilter:'blur(4px)'},
  logoWrap:{padding:'20px 16px 16px',borderBottom:'1px solid #0d2040',textAlign:'center'},
  logoForex:{fontSize:24,fontWeight:800,color:'#ffffff',letterSpacing:2,lineHeight:1.1},
  logoSim:{fontSize:10,fontWeight:600,color:'#ffffff',letterSpacing:7,marginBottom:6},
  logoBy:{fontSize:8,color:'rgba(255,255,255,0.5)',fontStyle:'italic'},
  divider:{height:1,background:'linear-gradient(90deg,transparent,#1E90FF40,transparent)',margin:'0 0 12px'},
  nav:{flex:1,padding:'0 8px',display:'flex',flexDirection:'column',gap:2},
  navItem:{display:'flex',alignItems:'center',gap:10,padding:'9px 12px',borderRadius:7,fontSize:12,fontWeight:600,color:'#c0d0e8',cursor:'pointer'},
  navActive:{background:'linear-gradient(135deg,#1E90FF20,#1E90FF08)',color:'#1E90FF',borderLeft:'2px solid #1E90FF'},
  userWrap:{position:'relative',display:'flex',alignItems:'center',gap:10,padding:12,margin:'8px',borderRadius:8,background:'rgba(3,15,32,0.8)',border:'1px solid #0d2040',cursor:'pointer'},
  avatar:{width:32,height:32,borderRadius:'50%',background:'linear-gradient(135deg,#1E90FF,#0060cc)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:800,color:'#fff',flexShrink:0,boxShadow:'0 0 12px #1E90FF50'},
  userInfo:{flex:1,overflow:'hidden'},
  userName:{fontSize:11,fontWeight:600,color:'#ffffff',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'},
  userPlan:{fontSize:9,color:'#2a5070',fontWeight:600,letterSpacing:.5},
  menu:{position:'absolute',bottom:'110%',left:0,right:0,background:'#030f20',border:'1px solid #0d2040',borderRadius:8,overflow:'hidden',zIndex:100},
  menuEmail:{padding:'10px 14px',fontSize:10,color:'#2a5070',fontWeight:500},
  menuDivider:{height:1,background:'#0d2040'},
  menuItem:{padding:'10px 14px',fontSize:12,fontWeight:600,cursor:'pointer'},
  main:{position:'relative',zIndex:1,flex:1,overflowY:'auto',padding:'32px 40px'},
  header:{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:32},
  headerTitle:{fontSize:26,fontWeight:800,color:'#ffffff',marginBottom:4},
  headerSub:{fontSize:13,color:'#a0b0c8'},
  newBtn:{display:'flex',alignItems:'center',gap:8,background:'linear-gradient(135deg,#1E90FF,#0060cc)',color:'#fff',border:'none',borderRadius:8,padding:'10px 20px',fontSize:12,fontWeight:700,cursor:'pointer',boxShadow:'0 4px 20px #1E90FF30',fontFamily:"'Montserrat',sans-serif"},
  empty:{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'80px 40px',textAlign:'center'},
  emptyTitle:{fontSize:16,fontWeight:700,color:'#ffffff',marginBottom:8},
  emptySub:{fontSize:12,color:'#a0b8d0',lineHeight:1.6,maxWidth:380},
  grid:{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))',gap:16},
  card:{background:'rgba(3,8,16,0.8)',border:'1px solid #0d2040',borderRadius:12,padding:20,backdropFilter:'blur(8px)',display:'flex',flexDirection:'column',gap:10},
  cardHeader:{display:'flex',alignItems:'center',justifyContent:'space-between'},
  cardName:{fontSize:14,fontWeight:700,color:'#ffffff'},
  deleteBtn:{background:'none',border:'none',color:'#3a5070',cursor:'pointer',padding:4,display:'flex',alignItems:'center'},
  cardMeta:{display:'flex',gap:6},
  badge:{background:'#1E90FF15',border:'1px solid #1E90FF30',color:'#1E90FF',fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:4,letterSpacing:0.5},
  cardDates:{fontSize:11,color:'#4a6080'},
  cardStats:{display:'flex',gap:0,borderTop:'1px solid #0d2040',paddingTop:10},
  stat:{flex:1,textAlign:'center'},
  statLabel:{fontSize:9,fontWeight:700,color:'#4a6080',letterSpacing:1,marginBottom:3},
  statVal:{fontSize:13,fontWeight:700,color:'#ffffff'},
  openBtn:{background:'none',border:'1px solid #1E90FF40',color:'#1E90FF',borderRadius:8,padding:'8px',fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:"'Montserrat',sans-serif",transition:'all .15s'},
  overlay:{position:'fixed',inset:0,background:'rgba(0,0,0,0.7)',zIndex:100,display:'flex',alignItems:'center',justifyContent:'center',backdropFilter:'blur(4px)'},
  modal:{background:'#030f20',border:'1px solid #0d2040',borderRadius:16,padding:'28px',width:'100%',maxWidth:560,boxShadow:'0 0 60px #1E90FF10'},
  modalHeader:{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:24},
  modalTitle:{fontSize:18,fontWeight:800,color:'#ffffff'},
  closeBtn:{background:'none',border:'none',color:'#4a6080',cursor:'pointer',fontSize:16,fontFamily:"'Montserrat',sans-serif"},
  formGrid:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginBottom:16},
  formGroup:{display:'flex',flexDirection:'column',gap:7},
  label:{fontSize:10,fontWeight:700,color:'#1E90FF',letterSpacing:1.5},
  input:{background:'#03080f',border:'1px solid #0d1f3c',borderRadius:8,padding:'11px 14px',fontSize:13,color:'#ffffff',outline:'none',transition:'border-color .2s',fontFamily:"'Montserrat',sans-serif"},
  select:{background:'#03080f',border:'1px solid #0d1f3c',borderRadius:8,padding:'11px 14px',fontSize:13,color:'#ffffff',outline:'none',fontFamily:"'Montserrat',sans-serif",cursor:'pointer'},
}
