import { useEffect, useState, useRef } from 'react'
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

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.replace('/'); return }
      setUser(session.user)
      setLoading(false)
    })
  }, [])

  // Background full-page constellation
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

  // Sidebar logo constellation
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

  if (loading) return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',background:'#000'}}>
      <div className="spinner"/>
      <style>{`.spinner{width:32px;height:32px;border:2px solid #0a1628;border-top-color:#1E90FF;border-radius:50%;animation:spin .7s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  const initials = user?.email?.slice(0,2).toUpperCase()||'FX'
  const username = user?.email?.split('@')[0]||''

  return (
    <div style={s.root}>
      <canvas ref={bgCanvasRef} style={s.bgCanvas}/>

      <div style={s.sidebar}>
        {/* Logo area with constellation canvas */}
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
          <div style={{...s.navItem,...s.navActive}}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
            Dashboard
          </div>
          <div style={s.navItem} onClick={()=>router.push('/simulator')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5,3 19,12 5,21"/></svg>
            New Session
          </div>
          <div style={{...s.navItem,...s.navDisabled}}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22,12 18,12 15,21 9,3 6,12 2,12"/></svg>
            Sessions <span style={s.soon}>Soon</span>
          </div>
          <div style={{...s.navItem,...s.navDisabled}}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
            Analytics <span style={s.soon}>Soon</span>
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

      <div style={s.main}>
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
            <button style={s.startBtn} onClick={()=>router.push('/simulator')}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="white"><polygon points="5,3 19,12 5,21"/></svg>
              Start Session
            </button>
          </div>
        </div>

        <div style={s.ctaRow}>
          <div style={{...s.ctaCard,borderColor:'#1E90FF60',background:'linear-gradient(135deg,#030f20,#041a30)'}} onClick={()=>router.push('/simulator')}>
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
            {label:'SESSIONS',value:'0',color:'#1E90FF',icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1E90FF" strokeWidth="1.5"><polygon points="5,3 19,12 5,21"/></svg>},
            {label:'TRADES TAKEN',value:'0',color:'#22c55e',icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="1.5"><polyline points="22,12 18,12 15,21 9,3 6,12 2,12"/></svg>},
            {label:'WIN RATE',value:'—',color:'#f59e0b',icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="1.5"><circle cx="12" cy="8" r="6"/><path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11"/></svg>},
            {label:'TOTAL P&L',value:'$0.00',color:'#1E90FF',icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1E90FF" strokeWidth="1.5"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>},
          ].map(stat=>(
            <div key={stat.label} style={s.statCard}>
              <div style={{...s.statIcon,borderColor:stat.color+'40',background:stat.color+'15'}}>{stat.icon}</div>
              <div style={{...s.statValue,color:stat.color}}>{stat.value}</div>
              <div style={s.statLabel}>{stat.label}</div>
            </div>
          ))}
        </div>

        <div style={s.emptyCard}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#1a3a5c" strokeWidth="1" style={{marginBottom:14}}><polygon points="5,3 19,12 5,21"/></svg>
          <div style={s.emptyTitle}>No sessions yet</div>
          <div style={s.emptySub}>Start your first practice session to begin tracking your performance</div>
          <button onClick={()=>router.push('/simulator')} style={{marginTop:20,background:'linear-gradient(135deg,#1E90FF,#0060cc)',color:'#fff',border:'none',borderRadius:8,padding:'12px 28px',fontSize:13,fontWeight:700,cursor:'pointer',boxShadow:'0 4px 20px #1E90FF30',fontFamily:'Montserrat,sans-serif'}}>
            Start first session
          </button>
        </div>
      </div>

      <style>{`.spinner{width:32px;height:32px;border:2px solid #0a1628;border-top-color:#1E90FF;border-radius:50%;animation:spin .7s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
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
  navDisabled:{opacity:.35,cursor:'default'},
  soon:{marginLeft:'auto',fontSize:8,fontWeight:700,letterSpacing:1,background:'#0d1f3c',color:'#2a4060',padding:'2px 5px',borderRadius:3},
  userWrap:{position:'relative',display:'flex',alignItems:'center',gap:10,padding:12,margin:'8px 8px 8px',borderRadius:8,background:'rgba(3,15,32,0.8)',border:'1px solid #0d2040',cursor:'pointer'},
  avatar:{width:32,height:32,borderRadius:'50%',background:'linear-gradient(135deg,#1E90FF,#0060cc)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:800,color:'#fff',flexShrink:0,boxShadow:'0 0 12px #1E90FF50'},
  userInfo:{flex:1,overflow:'hidden'},
  userName:{fontSize:11,fontWeight:600,color:'#ffffff',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'},
  userPlan:{fontSize:9,color:'#2a5070',fontWeight:600,letterSpacing:.5},
  menu:{position:'absolute',bottom:'110%',left:0,right:0,background:'#030f20',border:'1px solid #0d2040',borderRadius:8,overflow:'hidden',zIndex:100},
  menuEmail:{padding:'10px 14px',fontSize:10,color:'#2a5070',fontWeight:500},
  menuDivider:{height:1,background:'#0d2040'},
  menuItem:{padding:'10px 14px',fontSize:12,fontWeight:600,cursor:'pointer'},
  main:{position:'relative',zIndex:1,flex:1,overflowY:'auto',padding:'32px 40px'},
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
  statCard:{flex:1,background:'rgba(3,8,16,0.8)',border:'1px solid #0d2040',borderRadius:10,padding:20,display:'flex',flexDirection:'column',gap:6,backdropFilter:'blur(8px)'},
  statIcon:{width:36,height:36,borderRadius:8,border:'1px solid',display:'flex',alignItems:'center',justifyContent:'center',marginBottom:4},
  statValue:{fontSize:24,fontWeight:800},
  statLabel:{fontSize:9,fontWeight:700,color:'#c0d0e8',letterSpacing:1.5},
  emptyCard:{background:'rgba(3,8,16,0.8)',border:'1px solid #0d2040',borderRadius:12,padding:'60px 40px',textAlign:'center',display:'flex',flexDirection:'column',alignItems:'center',backdropFilter:'blur(8px)'},
  emptyTitle:{fontSize:16,fontWeight:700,color:'#ffffff',marginBottom:8},
  emptySub:{fontSize:12,color:'#a0b8d0',lineHeight:1.6,maxWidth:380},
}
