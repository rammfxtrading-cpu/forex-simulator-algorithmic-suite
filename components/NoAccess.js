import { useEffect, useRef } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabase'

/**
 * Pantalla mostrada cuando el usuario está autenticado pero no tiene acceso al producto.
 * Estéticamente consistente con la pantalla de login (fondo negro + red animada + card cristal).
 */
export default function NoAccess({ profile, producto = 'Simulador' }) {
  const router = useRouter()
  const canvasRef = useRef(null)

  // Canvas de red animada — mismo efecto que login
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    canvas.width = window.innerWidth
    canvas.height = window.innerHeight

    const nodes = []
    const count = 60
    for (let i = 0; i < count; i++) {
      nodes.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        r: Math.random() * 2 + 1,
      })
    }

    let animId
    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x
          const dy = nodes[i].y - nodes[j].y
          const dist = Math.sqrt(dx*dx + dy*dy)
          if (dist < 160) {
            const alpha = (1 - dist/160) * 0.25
            ctx.strokeStyle = `rgba(30,144,255,${alpha})`
            ctx.lineWidth = 0.8
            ctx.beginPath()
            ctx.moveTo(nodes[i].x, nodes[i].y)
            ctx.lineTo(nodes[j].x, nodes[j].y)
            ctx.stroke()
          }
        }
      }
      nodes.forEach(n => {
        ctx.beginPath()
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(30,144,255,0.6)'
        ctx.fill()
        n.x += n.vx
        n.y += n.vy
        if (n.x < 0 || n.x > canvas.width) n.vx *= -1
        if (n.y < 0 || n.y > canvas.height) n.vy *= -1
      })
      animId = requestAnimationFrame(draw)
    }
    draw()

    const handleResize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    window.addEventListener('resize', handleResize)
    return () => { cancelAnimationFrame(animId); window.removeEventListener('resize', handleResize) }
  }, [])

  async function handleLogout() {
    await supabase.auth.signOut()
    router.replace('/')
  }

  const nombre = profile?.nombre || profile?.email?.split('@')[0] || ''

  return (
    <div style={s.page}>
      <canvas ref={canvasRef} style={s.canvas} />

      <div style={s.card}>
        <div style={s.logoWrap}>
          <img src="/logo-algorithmic.png" alt="Algorithmic Suite" style={s.logoRamm} />
        </div>

        <div style={s.titleWrap}>
          <div style={s.titleMain}>ACCESO RESTRINGIDO</div>
          <div style={s.titleSub}><em>by Algorithmic Suite</em></div>
        </div>

        <div style={s.divider} />

        <div style={s.iconWrap}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#1E90FF" strokeWidth="1.5">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0110 0v4"/>
          </svg>
        </div>

        <div style={s.message}>
          {nombre && <div style={s.hello}>Hola {nombre},</div>}
          <div style={s.mainText}>
            No tienes acceso al <strong>{producto}</strong>.
          </div>
          <div style={s.subText}>
            Si crees que deberías tenerlo, contacta con el administrador en{' '}
            <a href="mailto:rammfxtrading@gmail.com" style={s.email}>rammfxtrading@gmail.com</a>
          </div>
        </div>

        <button onClick={handleLogout} style={s.btn}>
          Cerrar sesión
        </button>
      </div>

      <style>{`
        *{box-sizing:border-box;margin:0;padding:0}
        body{background:#000;overflow:hidden}
        button{font-family:'Montserrat',sans-serif}
      `}</style>
    </div>
  )
}

const s = {
  page: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000000', position: 'relative', overflow: 'hidden' },
  canvas: { position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 0 },
  card: { position: 'relative', zIndex: 1, background: 'rgba(3,8,16,0.85)', border: '1px solid #0d1f3c', borderRadius: 16, padding: '36px 44px', width: '100%', maxWidth: 460, backdropFilter: 'blur(12px)', boxShadow: '0 0 60px #1E90FF10, 0 0 1px #1E90FF30, 0 30px 80px #00000090', textAlign: 'center' },
  logoWrap: { display: 'flex', justifyContent: 'center', marginBottom: 20 },
  logoRamm: { width: 110, height: 'auto' },
  titleWrap: { textAlign: 'center', marginBottom: 20 },
  titleMain: { fontSize: 18, fontWeight: 800, color: '#ffffff', letterSpacing: 3, marginBottom: 6 },
  titleSub: { fontSize: 11, color: '#c8d0e0', fontStyle: 'italic', letterSpacing: 0.5 },
  divider: { height: 1, background: 'linear-gradient(90deg, transparent, #1E90FF50, transparent)', marginBottom: 24 },
  iconWrap: { display: 'flex', justifyContent: 'center', marginBottom: 20, opacity: 0.8 },
  message: { marginBottom: 28 },
  hello: { fontSize: 14, color: '#c8d0e0', marginBottom: 12, fontWeight: 500 },
  mainText: { fontSize: 15, color: '#ffffff', marginBottom: 14, lineHeight: 1.5 },
  subText: { fontSize: 12, color: '#8090a8', lineHeight: 1.6 },
  email: { color: '#1E90FF', textDecoration: 'none', fontWeight: 600 },
  btn: { background: 'linear-gradient(135deg, #1E90FF, #0060cc)', color: '#fff', border: 'none', borderRadius: 8, padding: '12px 28px', fontSize: 13, fontWeight: 700, cursor: 'pointer', letterSpacing: 0.5, boxShadow: '0 4px 30px #1E90FF40', transition: 'opacity .15s' },
}
