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
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#000' }}>
      <div className="spinner" />
      <style>{`.spinner{width:32px;height:32px;border:2px solid #0a1628;border-top-color:#1E90FF;border-radius:50%;animation:spin .7s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  const initials = user?.email?.slice(0, 2).toUpperCase() || 'FX'
  const username = user?.email?.split('@')[0] || ''

  return (
    <div style={s.root}>
      <div style={s.sidebar}>
        <div style={s.logoWrap}>
          <img src="/logo-algorithmic.png" alt="Algorithmic Suite" style={s.logo} />
        </div>
        <div style={s.sidebarDivider} />
        <nav style={s.nav}>
          <div style={{ ...s.navItem, ...s.navActive }}>
            <span style={s.navIcon}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
            </span>
            Dashboard
          </div>
          <div style={s.navItem} onClick={() => router.push('/simulator')}>
            <span style={s.navIcon}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5,3 19,12 5,21"/></svg>
            </span>
            New Session
          </div>
          <div style={{ ...s.navItem, ...s.navDisabled }}>
            <span style={s.navIcon}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22,12 18,12 15,21 9,3 6,12 2,12"/></svg>
            </span>
            Sessions <span style={s.soon}>Soon</span>
          </div>
          <div style={{ ...s.navItem, ...s.navDisabled }}>
            <span style={s.navIcon}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
            </span>
            Analytics <span style={s.soon}>Soon</span>
          </div>
        </nav>
        <div style={s.userWrap} onClick={() => setShowMenu(!showMenu)}>
          <div style={s.avatar}>{initials}</div>
          <div style={s.userInfo}>
            <div style={s.userName}>{username}</div>
            <div style={s.userPlan}>Free Plan</div>
          </div>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#2a4060" strokeWidth="2"><polyline points="6,9 12,15 18,9"/></svg>
          {showMenu && (
            <div style={s.menu}>
              <div style={s.menuEmail}>{user?.email}</div>
              <div style={s.menuDivider} />
              <div style={{ ...s.menuItem, color: '#ef4444' }} onClick={e => { e.stopPropagation(); handleSignOut() }}>Sign out</div>
            </div>
          )}
        </div>
      </div>

      <div style={s.main}>
        <div style={s.header}>
          <div>
            <h1 style={s.headerTitle}>Dashboard</h1>
            <p style={s.headerSub}>Welcome back, <span style={{ color: '#1E90FF' }}>{username}</span></p>
          </div>
          <button style={s.startBtn} onClick={() => router.push('/simulator')}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="white"><polygon points="5,3 19,12 5,21"/></svg>
            Start Session
          </button>
        </div>

        <div style={s.ctaRow}>
          <div style={{ ...s.ctaCard, borderColor: '#1E90FF50', background: 'linear-gradient(135deg, #030f20, #041628)' }}
            onClick={() => router.push('/simulator')}>
            <div style={s.ctaIconWrap}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1E90FF" strokeWidth="1.5"><polygon points="5,3 19,12 5,21"/></svg>
            </div>
            <div style={s.ctaTitle}>Practice Session</div>
            <div style={s.ctaSub}>Replay historical candles and train your entries candle by candle</div>
            <div style={s.ctaLink}>Start now →</div>
          </div>
          <div style={{ ...s.ctaCard, ...s.ctaDisabled }}>
            <div style={{ ...s.ctaIconWrap, background: '#0d1f3c20', borderColor: '#0d1f3c' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1a3050" strokeWidth="1.5"><polyline points="1,4 1,10 7,10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg>
            </div>
            <div style={{ ...s.ctaTitle, color: '#1a3050' }}>Backtesting</div>
            <div style={{ ...s.ctaSub, color: '#0d1f3c' }}>Test your strategy on historical data automatically</div>
            <div style={{ ...s.ctaLink, color: '#0d1f3c' }}>Coming soon</div>
          </div>
          <div style={{ ...s.ctaCard, ...s.ctaDisabled }}>
            <div style={{ ...s.ctaIconWrap, background: '#0d1f3c20', borderColor: '#0d1f3c' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1a3050" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><polyline points="12,6 12,12 16,14"/></svg>
            </div>
            <div style={{ ...s.ctaTitle, color: '#1a3050' }}>Live Mode</div>
            <div style={{ ...s.ctaSub, color: '#0d1f3c' }}>Trade on live market data in real time</div>
            <div style={{ ...s.ctaLink, color: '#0d1f3c' }}>Coming soon</div>
          </div>
        </div>

        <div style={s.statsRow}>
          {[
            { label: 'SESSIONS', value: '0', color: '#1E90FF', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1E90FF" strokeWidth="1.5"><polygon points="5,3 19,12 5,21"/></svg> },
            { label: 'TRADES TAKEN', value: '0', color: '#22c55e', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="1.5"><polyline points="22,12 18,12 15,21 9,3 6,12 2,12"/></svg> },
            { label: 'WIN RATE', value: '—', color: '#f59e0b', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="1.5"><circle cx="12" cy="8" r="6"/><path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11"/></svg> },
            { label: 'TOTAL P&L', value: '$0.00', color: '#1E90FF', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1E90FF" strokeWidth="1.5"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg> },
          ].map(stat => (
            <div key={stat.label} style={s.statCard}>
              <div style={{ ...s.statIconWrap, borderColor: stat.color + '30', background: stat.color + '10' }}>{stat.icon}</div>
              <div style={{ ...s.statValue, color: stat.color }}>{stat.value}</div>
              <div style={s.statLabel}>{stat.label}</div>
            </div>
          ))}
        </div>

        <div style={s.emptyCard}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#0d1f3c" strokeWidth="1" style={{ marginBottom: 16 }}>
            <polygon points="5,3 19,12 5,21"/>
          </svg>
          <div style={s.emptyTitle}>No sessions yet</div>
          <div style={s.emptySub}>Start your first practice session to begin tracking your performance</div>
          <button style={s.startBtn} onClick={() => router.push('/simulator')} style={{ marginTop: 20, background: 'linear-gradient(135deg, #1E90FF, #0060cc)', color: '#fff', border: 'none', borderRadius: 8, padding: '12px 28px', fontSize: 13, fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 20px #1E90FF30' }}>
            Start first session
          </button>
        </div>
      </div>

      <style>{`.spinner{width:32px;height:32px;border:2px solid #0a1628;border-top-color:#1E90FF;border-radius:50%;animation:spin .7s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}

const s = {
  root: { display: 'flex', height: '100vh', overflow: 'hidden', background: '#000000' },
  sidebar: { width: 220, flexShrink: 0, background: '#020810', borderRight: '1px solid #0d1f3c', display: 'flex', flexDirection: 'column', padding: '24px 0' },
  logoWrap: { display: 'flex', justifyContent: 'center', padding: '0 16px', marginBottom: 24 },
  logo: { width: 140, height: 'auto', filter: 'drop-shadow(0 0 8px #1E90FF50)' },
  sidebarDivider: { height: 1, background: 'linear-gradient(90deg, transparent, #0d1f3c, transparent)', marginBottom: 16 },
  nav: { flex: 1, padding: '0 8px', display: 'flex', flexDirection: 'column', gap: 2 },
  navItem: { display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 7, fontSize: 12, fontWeight: 600, color: '#2a4060', cursor: 'pointer', transition: 'all .15s' },
  navActive: { background: 'linear-gradient(135deg, #1E90FF15, #1E90FF08)', color: '#1E90FF', borderLeft: '2px solid #1E90FF' },
  navDisabled: { opacity: 0.35, cursor: 'default' },
  navIcon: { width: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  soon: { marginLeft: 'auto', fontSize: 8, fontWeight: 700, letterSpacing: 1, background: '#0d1f3c', color: '#2a4060', padding: '2px 5px', borderRadius: 3 },
  userWrap: { position: 'relative', display: 'flex', alignItems: 'center', gap: 10, padding: '12px', margin: '8px 8px 0', borderRadius: 8, background: '#030f20', border: '1px solid #0d1f3c', cursor: 'pointer' },
  avatar: { width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg, #1E90FF, #0060cc)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: '#fff', flexShrink: 0, boxShadow: '0 0 12px #1E90FF40' },
  userInfo: { flex: 1, overflow: 'hidden' },
  userName: { fontSize: 11, fontWeight: 600, color: '#c8d0e0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  userPlan: { fontSize: 9, color: '#2a4060', fontWeight: 600, letterSpacing: 0.5 },
  menu: { position: 'absolute', bottom: '110%', left: 0, right: 0, background: '#030f20', border: '1px solid #0d1f3c', borderRadius: 8, overflow: 'hidden', zIndex: 100 },
  menuEmail: { padding: '10px 14px', fontSize: 10, color: '#2a4060', fontWeight: 500 },
  menuDivider: { height: 1, background: '#0d1f3c' },
  menuItem: { padding: '10px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' },
  main: { flex: 1, overflowY: 'auto', padding: '32px 40px', background: '#000' },
  header: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 32 },
  headerTitle: { fontSize: 26, fontWeight: 800, color: '#ffffff', marginBottom: 4 },
  headerSub: { fontSize: 13, color: '#2a4060' },
  startBtn: { display: 'flex', alignItems: 'center', gap: 8, background: 'linear-gradient(135deg, #1E90FF, #0060cc)', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', fontSize: 12, fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 20px #1E90FF30' },
  ctaRow: { display: 'flex', gap: 16, marginBottom: 28 },
  ctaCard: { flex: 1, background: '#030810', border: '1px solid #0d1f3c', borderRadius: 12, padding: '24px 20px', cursor: 'pointer', transition: 'all .2s' },
  ctaDisabled: { opacity: 0.4, cursor: 'default' },
  ctaIconWrap: { width: 44, height: 44, borderRadius: 10, background: '#1E90FF15', border: '1px solid #1E90FF30', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  ctaTitle: { fontSize: 14, fontWeight: 700, color: '#ffffff', marginBottom: 6 },
  ctaSub: { fontSize: 11, color: '#2a4060', lineHeight: 1.5, marginBottom: 16 },
  ctaLink: { fontSize: 12, fontWeight: 700, color: '#1E90FF' },
  statsRow: { display: 'flex', gap: 16, marginBottom: 28 },
  statCard: { flex: 1, background: '#030810', border: '1px solid #0d1f3c', borderRadius: 10, padding: '20px', display: 'flex', flexDirection: 'column', gap: 6 },
  statIconWrap: { width: 36, height: 36, borderRadius: 8, border: '1px solid', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  statValue: { fontSize: 24, fontWeight: 800 },
  statLabel: { fontSize: 9, fontWeight: 700, color: '#2a4060', letterSpacing: 1.5 },
  emptyCard: { background: '#030810', border: '1px solid #0d1f3c', borderRadius: 12, padding: '60px 40px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' },
  emptyTitle: { fontSize: 16, fontWeight: 700, color: '#c8d0e0', marginBottom: 8 },
  emptySub: { fontSize: 12, color: '#2a4060', lineHeight: 1.6, maxWidth: 380 },
}
