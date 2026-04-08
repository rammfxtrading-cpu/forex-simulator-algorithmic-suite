import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabase'

export default function Login() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [checkingSession, setCheckingSession] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) router.replace('/simulator')
      else setCheckingSession(false)
    })
  }, [])

  async function handleLogin(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError('Invalid credentials. Check your email and password.')
      setLoading(false)
    } else {
      router.push('/simulator')
    }
  }

  if (checkingSession) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      <div className="spinner" />
    </div>
  )

  return (
    <div style={styles.page}>
      {/* Background grid */}
      <div style={styles.grid} />

      {/* Glow orb */}
      <div style={styles.orb} />

      <div style={styles.card}>
        {/* Logo / brand */}
        <div style={styles.logoWrap}>
          <div style={styles.logoIcon}>
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <polygon points="14,2 26,9 26,19 14,26 2,19 2,9" stroke="#1E90FF" strokeWidth="1.5" fill="#1E90FF11" />
              <polygon points="14,7 21,11 21,17 14,21 7,17 7,11" stroke="#1E90FF" strokeWidth="1" fill="#1E90FF22" />
              <circle cx="14" cy="14" r="3" fill="#1E90FF" />
            </svg>
          </div>
          <div>
            <div style={styles.logoTitle}>ALGORITHMIC SUITE</div>
            <div style={styles.logoSub}>Forex Simulator</div>
          </div>
        </div>

        {/* Divider */}
        <div style={styles.divider} />

        {/* Headline */}
        <h1 style={styles.headline}>Welcome back</h1>
        <p style={styles.subheadline}>Sign in to access your simulator</p>

        {/* Form */}
        <form onSubmit={handleLogin} style={styles.form}>
          <div style={styles.fieldWrap}>
            <label style={styles.label}>Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              style={styles.input}
              onFocus={e => e.target.style.borderColor = '#1E90FF'}
              onBlur={e => e.target.style.borderColor = '#1a2035'}
            />
          </div>

          <div style={styles.fieldWrap}>
            <label style={styles.label}>Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              style={styles.input}
              onFocus={e => e.target.style.borderColor = '#1E90FF'}
              onBlur={e => e.target.style.borderColor = '#1a2035'}
            />
          </div>

          {error && (
            <div style={styles.errorBox}>
              <span style={{ marginRight: 6 }}>⚠</span>{error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{ ...styles.submitBtn, opacity: loading ? 0.7 : 1 }}
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        {/* Footer */}
        <p style={styles.footer}>
          R.A.M.M.FX TRADING™ · Algorithmic Suite
        </p>
      </div>

      <style>{`
        .spinner {
          width: 32px; height: 32px;
          border: 2px solid #1a2035;
          border-top-color: #1E90FF;
          border-radius: 50%;
          animation: spin .7s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}

const styles = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#080c14',
    position: 'relative',
    overflow: 'hidden',
  },
  grid: {
    position: 'absolute', inset: 0,
    backgroundImage: `
      linear-gradient(#1a203520 1px, transparent 1px),
      linear-gradient(90deg, #1a203520 1px, transparent 1px)
    `,
    backgroundSize: '40px 40px',
    pointerEvents: 'none',
  },
  orb: {
    position: 'absolute',
    top: '20%', left: '50%',
    transform: 'translateX(-50%)',
    width: 500, height: 500,
    background: 'radial-gradient(circle, #1E90FF12 0%, transparent 70%)',
    pointerEvents: 'none',
  },
  card: {
    position: 'relative',
    background: '#0a0f1a',
    border: '1px solid #1a2035',
    borderRadius: 16,
    padding: '40px 44px',
    width: '100%',
    maxWidth: 420,
    boxShadow: '0 0 60px #1E90FF0a, 0 20px 60px #00000060',
  },
  logoWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    marginBottom: 28,
  },
  logoIcon: {
    width: 48, height: 48,
    background: '#1E90FF0d',
    border: '1px solid #1E90FF30',
    borderRadius: 10,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  logoTitle: {
    fontSize: 11, fontWeight: 800, letterSpacing: 2,
    color: '#1E90FF', lineHeight: 1.2,
  },
  logoSub: {
    fontSize: 13, fontWeight: 500,
    color: '#c8d0e0', letterSpacing: 0.5,
  },
  divider: {
    height: 1, background: 'linear-gradient(90deg, #1E90FF40, #1a2035, transparent)',
    marginBottom: 28,
  },
  headline: {
    fontSize: 22, fontWeight: 700, color: '#ffffff',
    marginBottom: 6,
  },
  subheadline: {
    fontSize: 13, color: '#4a5568', marginBottom: 28,
  },
  form: { display: 'flex', flexDirection: 'column', gap: 18 },
  fieldWrap: { display: 'flex', flexDirection: 'column', gap: 7 },
  label: { fontSize: 11, fontWeight: 600, color: '#c8d0e0', letterSpacing: 0.5 },
  input: {
    background: '#0d1220',
    border: '1px solid #1a2035',
    borderRadius: 8,
    padding: '11px 14px',
    fontSize: 13,
    color: '#ffffff',
    outline: 'none',
    transition: 'border-color .15s',
  },
  errorBox: {
    background: '#ef444415',
    border: '1px solid #ef444430',
    borderRadius: 8,
    padding: '10px 14px',
    fontSize: 12,
    color: '#ef4444',
    fontWeight: 500,
  },
  submitBtn: {
    background: 'linear-gradient(135deg, #1E90FF, #1060cc)',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    padding: '13px',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
    letterSpacing: 0.5,
    marginTop: 4,
    transition: 'opacity .15s',
    boxShadow: '0 4px 20px #1E90FF30',
  },
  footer: {
    marginTop: 28,
    fontSize: 10,
    color: '#2a3448',
    textAlign: 'center',
    letterSpacing: 1,
    fontWeight: 600,
  },
}
