import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabase'

const MOBILE_BREAKPOINT = 768

// Rutas por defecto de cada item. Una página puede interceptar un item con
// la prop onNavigate (ver abajo) para manejarlo internamente (ej: dashboard
// usa vistas internas para 'dashboard'/'sessions' y abre modal en 'new').
const DEFAULT_ROUTES = {
  dashboard: '/dashboard',
  new: '/dashboard',
  sessions: '/dashboard',
  analytics: '/analytics',
  admin: '/admin',
}

/**
 * Sidebar compartido de la app (dashboard / analytics / admin).
 *
 * Props:
 * - active: 'dashboard' | 'new' | 'sessions' | 'analytics' | 'admin' — item marcado.
 * - user: usuario de supabase (para avatar/email del menú).
 * - profile: fila de profiles (nombre, rol_global para el item Admin).
 * - onNavigate(key): opcional. Si devuelve true, el item queda manejado por la
 *   página y no se navega. Si devuelve false/undefined, se hace router.push
 *   a la ruta por defecto del item.
 *
 * Responsive:
 * - >= 768px: columna fija de 230px (idéntica al sidebar original del dashboard).
 * - < 768px: barra superior fija con logo + botón hamburguesa; el sidebar se
 *   despliega como drawer desde la izquierda sobre un overlay oscuro.
 */
export default function AppSidebar({ active, user, profile, onNavigate }) {
  const router = useRouter()
  const logoCanvasRef = useRef(null)
  const [isMobile, setIsMobile] = useState(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const [hoveredNav, setHoveredNav] = useState(null)

  // Check de ancho — mismo patrón que pages/session/[id].js
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // Canvas animado tras el logo — versión optimizada del dashboard (cap 15fps + pausa si pestaña oculta)
  useEffect(() => {
    const canvas = logoCanvasRef.current
    if (!canvas) return
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
  }, [isMobile])

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/')
  }

  function handleNav(key) {
    if (isMobile) setDrawerOpen(false)
    if (onNavigate && onNavigate(key) === true) return
    router.push(DEFAULT_ROUTES[key])
  }

  const initials = user?.email?.slice(0,2).toUpperCase() || 'FX'
  const username = profile?.nombre || user?.email?.split('@')[0] || ''

  const navItems = [
    { key: 'dashboard', label: 'Dashboard', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg> },
    { key: 'new', label: 'New Session', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5,3 19,12 5,21"/></svg> },
    { key: 'sessions', label: 'Sessions', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22,12 18,12 15,21 9,3 6,12 2,12"/></svg> },
    { key: 'analytics', label: 'Analytics', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg> },
    ...(profile?.rol_global === 'admin' ? [{
      key: 'admin',
      label: 'Admin',
      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2L4 6v6c0 5 3.5 9.5 8 10 4.5-.5 8-5 8-10V6l-8-4z"/></svg>,
    }] : []),
  ]

  // Contenido interno del sidebar — compartido entre la columna de escritorio y el drawer móvil
  const sidebarInner = (
    <>
      <div style={sb.logoWrap}>
        <canvas ref={logoCanvasRef} width="220" height="160" style={sb.logoCanvas}/>
        <div style={sb.logoText}>
          <div style={sb.logoForex}>FOREX</div>
          <div style={sb.logoSim}>SIMULATOR</div>
          <div style={sb.logoBy}>by Algorithmic Suite</div>
        </div>
      </div>
      <div style={sb.sidebarDivider}/>
      <nav style={sb.nav}>
        {navItems.map(item => {
          const isActive = active === item.key
          const isHovered = hoveredNav === item.key
          return (
            <div
              key={item.key}
              style={{
                ...sb.navItem,
                ...(isActive ? sb.navActive : {}),
                ...(isHovered && !isActive ? sb.navHover : {}),
              }}
              onClick={() => handleNav(item.key)}
              onMouseEnter={() => setHoveredNav(item.key)}
              onMouseLeave={() => setHoveredNav(null)}
            >
              {item.icon}
              {item.label}
            </div>
          )
        })}
      </nav>
      <div style={sb.userWrap} onClick={()=>setShowMenu(!showMenu)}>
        <div style={sb.avatar}>{initials}</div>
        <div style={sb.userInfo}>
          <div style={sb.userName}>{username}</div>
          <div style={sb.userPlan}>VIP Member</div>
        </div>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#4a90d9" strokeWidth="2"><polyline points="6,9 12,15 18,9"/></svg>
        {showMenu && (
          <div style={sb.menu}>
            <div style={sb.menuEmail}>{user?.email}</div>
            <div style={sb.menuDivider}/>
            <div style={{...sb.menuItem,color:'#1E90FF'}} onClick={e=>{e.stopPropagation();window.location.href='https://algorithmicsuite.com/dashboard'}}>← Volver al hub</div>
            <div style={{...sb.menuItem,color:'#f03e3e'}} onClick={e=>{e.stopPropagation();handleSignOut()}}>Cerrar sesión</div>
          </div>
        )}
      </div>
    </>
  )

  // Ancho aún desconocido (primer render) → no renderizar nada para no parpadear
  if (isMobile === null) return null

  // ESCRITORIO — columna fija idéntica a la original
  if (!isMobile) {
    return <div style={sb.sidebar}>{sidebarInner}</div>
  }

  // MÓVIL — barra superior + drawer deslizante
  return (
    <>
      <div style={sb.topBar}>
        <div style={sb.topBarLogo}>
          <span style={sb.topBarForex}>FOREX</span>
          <span style={sb.topBarSim}>SIMULATOR</span>
        </div>
        <button style={sb.burger} onClick={()=>setDrawerOpen(true)} aria-label="Abrir menú">☰</button>
      </div>
      {drawerOpen && <div style={sb.overlay} onClick={()=>setDrawerOpen(false)}/>}
      <div style={{...sb.drawer, transform: drawerOpen ? 'translateX(0)' : 'translateX(-100%)'}}>
        {sidebarInner}
      </div>
    </>
  )
}

const sb = {
  // ── Escritorio (estilos copiados 1:1 del sidebar del dashboard) ──
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

  // ── Móvil ──
  topBar:{position:'fixed',top:0,left:0,right:0,height:56,zIndex:150,display:'flex',alignItems:'center',justifyContent:'space-between',padding:'0 14px',background:'rgba(0,20,60,0.85)',borderBottom:'1px solid #0d2040',backdropFilter:'blur(8px)',WebkitBackdropFilter:'blur(8px)'},
  topBarLogo:{display:'flex',alignItems:'baseline',gap:6},
  topBarForex:{fontSize:16,fontWeight:800,color:'#ffffff',letterSpacing:1.5},
  topBarSim:{fontSize:9,fontWeight:600,color:'#ffffff',letterSpacing:3},
  burger:{background:'rgba(3,15,32,0.8)',border:'1px solid #0d2040',borderRadius:8,color:'#fff',fontSize:18,padding:'4px 12px',cursor:'pointer',lineHeight:1.4,fontFamily:'Montserrat,sans-serif'},
  overlay:{position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',zIndex:200,backdropFilter:'blur(2px)',WebkitBackdropFilter:'blur(2px)'},
  drawer:{position:'fixed',top:0,bottom:0,left:0,width:230,zIndex:210,background:'rgba(0,20,60,0.95)',borderRight:'1px solid #0d2040',display:'flex',flexDirection:'column',backdropFilter:'blur(8px)',WebkitBackdropFilter:'blur(8px)',transition:'transform .25s ease'},
}
