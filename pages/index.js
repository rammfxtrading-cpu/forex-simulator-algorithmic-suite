import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabase'

export default function Login() {
  const router = useRouter()
  const canvasRef = useRef(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) router.replace('/dashboard')
      else setChecking(false)
    })
  }, [])

  // Canvas web/network animation
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
      // Draw connections
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
      // Draw nodes
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
  }, [checking])

  async function handleLogin(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setError('Email o contrasena incorrectos.'); setLoading(false) }
    else router.push('/dashboard')
  }

  if (checking) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#000' }}>
      <div className="spinner" />
      <style>{`.spinner{width:32px;height:32px;border:2px solid #0a1628;border-top-color:#1E90FF;border-radius:50%;animation:spin .7s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  return (
    <div style={s.page}>
      <canvas ref={canvasRef} style={s.canvas} />

      <div style={s.card}>
        {/* Logo RAMMFX */}
        <div style={s.logoWrap}>
          <img src="/logo-algorithmic.png" alt="Algorithmic Suite" style={s.logoRamm} />
        </div>

        {/* Title */}
        <div style={s.titleWrap}>
          <div style={s.titleMain}>FOREX SIMULATOR</div>
          <div style={s.titleSub}><em>by Algorithmic Suite</em></div>
        </div>

        <div style={s.divider} />

        {/* Form */}
        <form onSubmit={handleLogin} style={s.form}>
          <div style={s.field}>
            <label style={s.label}>EMAIL</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com" required style={s.input}
              onFocus={e => e.target.style.borderColor = '#1E90FF'}
              onBlur={e => e.target.style.borderColor = '#0d1f3c'} />
          </div>
          <div style={s.field}>
            <label style={s.label}>PASSWORD</label>
            <div style={{ position: 'relative' }}>
              <input type={showPass ? 'text' : 'password'} value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••" required
                style={{ ...s.input, paddingRight: 42 }}
                onFocus={e => e.target.style.borderColor = '#1E90FF'}
                onBlur={e => e.target.style.borderColor = '#0d1f3c'} />
              <button type="button" onClick={() => setShowPass(!showPass)} style={s.eyeBtn}>
                {showPass ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4a6080" strokeWidth="2">
                    <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/>
                    <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/>
                    <line x1="1" y1="1" x2="23" y2="23"/>
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4a6080" strokeWidth="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                    <circle cx="12" cy="12" r="3"/>
                  </svg>
                )}
              </button>
            </div>
          </div>
          {error && <div style={s.errorBox}>{error}</div>}
          <button type="submit" disabled={loading} style={{ ...s.btn, opacity: loading ? 0.7 : 1 }}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>

      <style>{`
        *{box-sizing:border-box;margin:0;padding:0}
        body{background:#000;overflow:hidden}
        input,button{font-family:'Montserrat',sans-serif}
        input::placeholder{color:#1a3050}
        @keyframes spin{to{transform:rotate(360deg)}}
      `}</style>
    </div>
  )
}

const s = {
  page: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000000', position: 'relative', overflow: 'hidden' },
  canvas: { position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 0 },
  card: { position: 'relative', zIndex: 1, background: 'rgba(3,8,16,0.85)', border: '1px solid #0d1f3c', borderRadius: 16, padding: '36px 44px', width: '100%', maxWidth: 420, backdropFilter: 'blur(12px)', boxShadow: '0 0 60px #1E90FF10, 0 0 1px #1E90FF30, 0 30px 80px #00000090' },
  logoWrap: { display: 'flex', justifyContent: 'center', marginBottom: 20 },
  logoRamm: { width: 110, height: 'auto' },
  titleWrap: { textAlign: 'center', marginBottom: 20 },
  titleMain: { fontSize: 20, fontWeight: 800, color: '#ffffff', letterSpacing: 3, marginBottom: 6 },
  titleSub: { fontSize: 11, color: '#c8d0e0', fontStyle: 'italic', letterSpacing: 0.5 },
  divider: { height: 1, background: 'linear-gradient(90deg, transparent, #1E90FF50, transparent)', marginBottom: 24 },
  form: { display: 'flex', flexDirection: 'column', gap: 16 },
  field: { display: 'flex', flexDirection: 'column', gap: 7 },
  label: { fontSize: 10, fontWeight: 700, color: '#1E90FF', letterSpacing: 1.5 },
  input: { width: '100%', background: '#03080f', border: '1px solid #0d1f3c', borderRadius: 8, padding: '12px 14px', fontSize: 13, color: '#ffffff', outline: 'none', transition: 'border-color .2s' },
  eyeBtn: { position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center' },
  errorBox: { background: '#ef444410', border: '1px solid #ef444430', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#ef4444', fontWeight: 500 },
  btn: { background: 'linear-gradient(135deg, #1E90FF, #0060cc)', color: '#fff', border: 'none', borderRadius: 8, padding: '14px', fontSize: 13, fontWeight: 700, cursor: 'pointer', letterSpacing: 0.5, boxShadow: '0 4px 30px #1E90FF40', transition: 'opacity .15s' },
}
