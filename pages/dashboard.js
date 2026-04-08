import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabase'

export const getServerSideProps = () => ({ props: {} })

export default function Dashboard() {
  const router = useRouter()
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

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/')
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#080c14' }}>
      <div className="spinner" />
      <style>{`.spinner{width:32px;height:32px;border:2px solid #1a2035;border-top-color:#1E90FF;border-radius:50%;animation:spin .7s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  const initials = user?.email?.slice(0, 2).toUpperCase() || 'FX'
  const email = user?.email || ''

  return (
    <div style={s.root}>
      {/* ── SIDEBAR ── */}
      <div style={s.sidebar}>
        {/* Logo */}
        <div style={s.logoWrap}>
          <svg width="22" height="22" viewBox="0 0 28 28" fill="none">
            <polygon points="14,2 26,9 26,19 14,26 2,19 2,9" stroke="#1E90FF" strokeWidth="1.5" fill="#1E90FF11" />
            <polygon points="14,7 21,11 21,17 14,21 7,17 7,11" stroke="#1E90FF" strokeWidth="1" fill="#1E90FF22" />
            <circle cx="14" cy="14" r="3" fill="#1E90FF" />
          </svg>
          <div>
            <div style={s.logoText}>ALGORITHMIC SUITE</div>
            <div style={s.logoSub}>Forex Simulator</div>
          </div>
        </div>

        <div style={s.divider} />

        {/* Nav */}
        <nav style={s.nav}>
          <div style={{ ...s.navItem, ...s.navActive }}>
            <span style={s.navIcon}>▦</span> Dashboard
          </div>
          <div style={s.navItem} onClick={() => router.push('/simulator')}>
            <span style={s.navIcon}>◈</span> New Session
          </div>
          <div style={{ ...s.navItem, opacity: 0.4, cursor: 'default' }}>
            <span style={s.navIcon}>◉</span> Sessions <span style={s.soon}>Soon</span>
          </div>
          <div style={{ ...s.navItem, opacity: 0.4, cursor: 'default' }}>
            <span style={s.navIcon}>◎</span> Analytics <span style={s.soon}>Soon</span>
          </div>
        </nav>

        {/* User */}
        <div style={s.userWrap} onClick={() => setShowMenu(!showMenu)}>
          <div style={s.avatar}>{initials}</div>
          <div style={s.userInfo}>
            <div style={s.userEmail}>{email.split('@')[0]}</div>
            <div style={s.userPlan}>Free Plan</div>
          </div>
          <span style={{ color: '#4a5568', fontSize: 10 }}>▾</span>
          {showMenu && (
            <div style={s.menu}>
              <div style={s.menuEmail}>{email}</div>
              <div style={s.menuDivider} />
              <div style={s.menuItem} onClick={handleSignOut}>Sign out</div>
            </div>
          )}
        </div>
      </div>

      {/* ── MAIN ── */}
      <div style={s.main}>
        {/* Header */}
        <div style={s.header}>
          <div>
            <h1 style={s.headerTitle}>Dashboard</h1>
            <p style={s.headerSub}>Welcome back, {email.split('@')[0]}</p>
          </div>
          <button className="btn-primary" onClick={() => router.push('/simulator')}
            style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>▶</span> Start Session
          </button>
        </div>

        {/* CTA cards */}
        <div style={s.ctaRow}>
          <div style={{ ...s.ctaCard, borderColor: '#1E90FF40', background: '#1E90FF08' }}
            onClick={() => router.push('/simulator')}>
            <div style={s.ctaIcon}>◈</div>
            <div style={s.ctaTitle}>Practice Session</div>
            <div style={s.ctaSub}>Replay historical candles and train your entries</div>
            <div style={s.ctaBtn}>Start →</div>
          </div>
          <div style={{ ...s.ctaCard, opacity: 0.5, cursor: 'default' }}>
            <div style={s.ctaIcon}>⟳</div>
            <div style={s.ctaTitle}>Backtesting</div>
            <div style={s.ctaSub}>Test your strategy on historical data</div>
            <div style={{ ...s.ctaBtn, color: '#4a5568' }}>Coming soon</div>
          </div>
          <div style={{ ...s.ctaCard, opacity: 0.5, cursor: 'default' }}>
            <div style={s.ctaIcon}>◉</div>
            <div style={s.ctaTitle}>Live Mode</div>
            <div style={s.ctaSub}>Trade on live market data in real time</div>
            <div style={{ ...s.ctaBtn, color: '#4a5568' }}>Coming soon</div>
          </div>
        </div>

        {/* Stats */}
        <div style={s.statsRow}>
          {[
            { label: 'Sessions', value: '0', icon: '◈' },
            { label: 'Trades Taken', value: '0', icon: '↕' },
            { label: 'Win Rate', value: '—', icon: '◎' },
            { label: 'Total P&L', value: '$0.00', icon: '$' },
          ].map(stat => (
            <div key={stat.label} style={s.statCard}>
              <div style={s.statIcon}>{stat.icon}</div>
              <div style={s.statValue}>{stat.value}</div>
              <div style={s.statLabel}>{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Empty state */}
        <div style={s.emptyCard}>
          <div style={s.emptyIcon}>◈</div>
          <div style={s.emptyTitle}>No sessions yet</div>
          <div style={s.emptySub}>Start your first practice session to see your performance data here</div>
          <button className="btn-primary" style={{ marginTop: 20 }} onClick={() => router.push('/simulator')}>
            Start first session
          </button>
        </div>
      </div>

      <style>{`
        .spinner{width:32px;height:32px;border:2px solid #1a2035;border-top-color:#1E90FF;border-radius:50%;animation:spin .7s linear infinite}
        @keyframes spin{to{transform:rotate(360deg)}}
      `}</style>
    </div>
  )
}

const s = {
  root: { display: 'flex', height: '100vh', overflow: 'hidden', background: '#080c14' },

  sidebar: {
    width: 220, flexShrink: 0, background: '#0a0f1a',
    borderRight: '1px solid #1a2035', display: 'flex',
    flexDirection: 'column', padding: '20px 0',
  },
  logoWrap: { display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px 0 16px', marginBottom: 20 },
  logoText: { fontSize: 9, fontWeight: 800, letterSpacing: 2, color: '#1E90FF' },
  logoSub: { fontSize: 11, fontWeight: 500, color: '#4a5568' },
  divider: { height: 1, background: '#1a2035', margin: '0 0 16px 0' },

  nav: { flex: 1, padding: '0 8px', display: 'flex', flexDirection: 'column', gap: 2 },
  navItem: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '9px 12px', borderRadius: 7, fontSize: 12, fontWeight: 600,
    color: '#4a5568', cursor: 'pointer', transition: 'all .15s',
  },
  navActive: { background: '#1E90FF15', color: '#1E90FF' },
  navIcon: { fontSize: 14, width: 16, textAlign: 'center' },
  soon: {
    marginLeft: 'auto', fontSize: 8, fontWeight: 700, letterSpacing: 1,
    background: '#1a2035', color: '#4a5568', padding: '2px 5px', borderRadius: 3,
  },

  userWrap: {
    position: 'relative', display: 'flex', alignItems: 'center', gap: 10,
    padding: '12px 16px', margin: '8px 8px 0', borderRadius: 8,
    background: '#0d1220', border: '1px solid #1a2035', cursor: 'pointer',
  },
  avatar: {
    width: 32, height: 32, borderRadius: '50%',
    background: 'linear-gradient(135deg, #1E90FF, #1060cc)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 11, fontWeight: 800, color: '#fff', flexShrink: 0,
  },
  userInfo: { flex: 1, overflow: 'hidden' },
  userEmail: { fontSize: 11, fontWeight: 600, color: '#c8d0e0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  userPlan: { fontSize: 9, color: '#4a5568', fontWeight: 600, letterSpacing: 0.5 },
  menu: {
    position: 'absolute', bottom: '110%', left: 0, right: 0,
    background: '#0d1220', border: '1px solid #1a2035', borderRadius: 8,
    overflow: 'hidden', zIndex: 100,
  },
  menuEmail: { padding: '10px 14px', fontSize: 10, color: '#4a5568', fontWeight: 500 },
  menuDivider: { height: 1, background: '#1a2035' },
  menuItem: { padding: '10px 14px', fontSize: 12, fontWeight: 600, color: '#ef4444', cursor: 'pointer' },

  main: { flex: 1, overflowY: 'auto', padding: '32px 40px' },

  header: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 32 },
  headerTitle: { fontSize: 24, fontWeight: 800, color: '#ffffff', marginBottom: 4 },
  headerSub: { fontSize: 13, color: '#4a5568' },

  ctaRow: { display: 'flex', gap: 16, marginBottom: 32 },
  ctaCard: {
    flex: 1, background: '#0a0f1a', border: '1px solid #1a2035',
    borderRadius: 12, padding: '24px 20px', cursor: 'pointer', transition: 'border-color .15s',
  },
  ctaIcon: { fontSize: 24, color: '#1E90FF', marginBottom: 12 },
  ctaTitle: { fontSize: 14, fontWeight: 700, color: '#ffffff', marginBottom: 6 },
  ctaSub: { fontSize: 11, color: '#4a5568', lineHeight: 1.5, marginBottom: 16 },
  ctaBtn: { fontSize: 12, fontWeight: 700, color: '#1E90FF' },

  statsRow: { display: 'flex', gap: 16, marginBottom: 32 },
  statCard: {
    flex: 1, background: '#0a0f1a', border: '1px solid #1a2035',
    borderRadius: 10, padding: '20px', display: 'flex', flexDirection: 'column', gap: 4,
  },
  statIcon: { fontSize: 16, color: '#1E90FF', marginBottom: 6 },
  statValue: { fontSize: 22, fontWeight: 800, color: '#ffffff' },
  statLabel: { fontSize: 10, fontWeight: 600, color: '#4a5568', letterSpacing: 0.5 },

  emptyCard: {
    background: '#0a0f1a', border: '1px solid #1a2035',
    borderRadius: 12, padding: '60px 40px', textAlign: 'center',
  },
  emptyIcon: { fontSize: 40, color: '#1a2035', marginBottom: 16 },
  emptyTitle: { fontSize: 16, fontWeight: 700, color: '#c8d0e0', marginBottom: 8 },
  emptySub: { fontSize: 12, color: '#4a5568', lineHeight: 1.6, maxWidth: 400, margin: '0 auto' },
}
