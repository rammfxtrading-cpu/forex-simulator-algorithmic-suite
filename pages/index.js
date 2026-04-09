import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabase'

export const getServerSideProps = () => ({ props: {} })

export default function Login() {
  const router = useRouter()
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
      <div style={s.blob1} />
      <div style={s.blob2} />
      <div style={s.card}>
        <div style={s.logoWrap}>
          <img src="/logo-algorithmic.png" alt="Algorithmic Suite" style={s.logo} />
        </div>
        <div style={s.divider} />
        <h1 style={s.title}>Welcome back</h1>
        <p style={s.sub}>Sign in to your Algorithmic Suite account</p>
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
                placeholder="••••••••" required style={{ ...s.input, paddingRight: 42 }}
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
        <p style={s.footer}>R.A.M.M.FX TRADING — Algorithmic Suite</p>
      </div>
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0}
        body{background:#000}
        input,button{font-family:'Montserrat',sans-serif}
        input::placeholder{color:#1a3050}
      `}</style>
    </div>
  )
}

const s = {
  page: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000000', position: 'relative', overflow: 'hidden' },
  blob1: { position: 'absolute', top: '-10%', left: '30%', width: 600, height: 600, background: 'radial-gradient(circle, #1E90FF18 0%, transparent 65%)', pointerEvents: 'none' },
  blob2: { position: 'absolute', bottom: '-20%', right: '20%', width: 500, height: 500, background: 'radial-gradient(circle, #1E90FF10 0%, transparent 65%)', pointerEvents: 'none' },
  grid: { display: 'none' },
  card: { position: 'relative', zIndex: 1, background: 'linear-gradient(145deg, #030810, #060d1a)', border: '1px solid #0d1f3c', borderRadius: 16, padding: '40px 44px', width: '100%', maxWidth: 420, boxShadow: '0 0 80px #1E90FF15, 0 0 1px #1E90FF40, 0 30px 80px #00000080' },
  logoWrap: { display: 'flex', justifyContent: 'center', marginBottom: 24 },
  logo: { width: 140, height: 'auto', filter: 'drop-shadow(0 0 16px #1E90FF70)', mixBlendMode: 'screen' },
  divider: { height: 1, background: 'linear-gradient(90deg, transparent, #1E90FF40, transparent)', marginBottom: 28 },
  title: { fontSize: 22, fontWeight: 800, color: '#ffffff', marginBottom: 6, textAlign: 'center' },
  sub: { fontSize: 12, color: '#2a4060', textAlign: 'center', marginBottom: 28 },
  form: { display: 'flex', flexDirection: 'column', gap: 16 },
  field: { display: 'flex', flexDirection: 'column', gap: 7 },
  label: { fontSize: 10, fontWeight: 700, color: '#1E90FF', letterSpacing: 1.5 },
  input: { width: '100%', background: '#030810', border: '1px solid #0d1f3c', borderRadius: 8, padding: '12px 14px', fontSize: 13, color: '#ffffff', outline: 'none', transition: 'border-color .2s' },
  eyeBtn: { position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center' },
  errorBox: { background: '#ef444410', border: '1px solid #ef444430', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#ef4444', fontWeight: 500 },
  btn: { background: 'linear-gradient(135deg, #1E90FF, #0060cc)', color: '#fff', border: 'none', borderRadius: 8, padding: '14px', fontSize: 13, fontWeight: 700, cursor: 'pointer', letterSpacing: 0.5, marginTop: 4, boxShadow: '0 4px 30px #1E90FF40', transition: 'opacity .15s' },
  footer: { marginTop: 28, fontSize: 9, color: '#0d1f3c', textAlign: 'center', letterSpacing: 1.5, fontWeight: 700 },
}
