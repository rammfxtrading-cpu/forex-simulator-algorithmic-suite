import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import dynamic from 'next/dynamic'

const SessionInner = dynamic(
  () => import('../../components/_SessionInner'),
  { ssr: false, loading: () => null }
)

const MOBILE_BREAKPOINT = 768

/**
 * Aviso a pantalla completa para móvil — el simulador no está pensado para
 * pantallas táctiles estrechas. Mismo estilo visual que NoAccess (fondo negro
 * + card cristal), sin el canvas animado.
 */
function MobileNotice() {
  const router = useRouter()

  return (
    <div style={m.page}>
      <div style={m.card}>
        <div style={m.logoWrap}>
          <img src="/logo-algorithmic.png" alt="Algorithmic Suite" style={m.logoRamm} />
        </div>

        <div style={m.titleWrap}>
          <div style={m.titleMain}>SOLO ESCRITORIO</div>
          <div style={m.titleSub}><em>by Algorithmic Suite</em></div>
        </div>

        <div style={m.divider} />

        <div style={m.iconWrap}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#1E90FF" strokeWidth="1.5">
            <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
            <line x1="8" y1="21" x2="16" y2="21"/>
            <line x1="12" y1="17" x2="12" y2="21"/>
          </svg>
        </div>

        <div style={m.message}>
          <div style={m.mainText}>
            El simulador requiere pantalla de escritorio
          </div>
          <div style={m.subText}>
            Para operar y usar las herramientas de análisis, entra desde un ordenador.
            El resto de secciones sí están disponibles en el móvil.
          </div>
        </div>

        <button onClick={() => router.push('/dashboard')} style={m.btn}>
          Volver al dashboard
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

const m = {
  page: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000000', padding: 16 },
  card: { background: 'rgba(3,8,16,0.85)', border: '1px solid #0d1f3c', borderRadius: 16, padding: '36px 28px', width: '100%', maxWidth: 460, backdropFilter: 'blur(12px)', boxShadow: '0 0 60px #1E90FF10, 0 0 1px #1E90FF30, 0 30px 80px #00000090', textAlign: 'center' },
  logoWrap: { display: 'flex', justifyContent: 'center', marginBottom: 20 },
  logoRamm: { width: 110, height: 'auto' },
  titleWrap: { textAlign: 'center', marginBottom: 20 },
  titleMain: { fontSize: 18, fontWeight: 800, color: '#ffffff', letterSpacing: 3, marginBottom: 6 },
  titleSub: { fontSize: 11, color: '#c8d0e0', fontStyle: 'italic', letterSpacing: 0.5 },
  divider: { height: 1, background: 'linear-gradient(90deg, transparent, #1E90FF50, transparent)', marginBottom: 24 },
  iconWrap: { display: 'flex', justifyContent: 'center', marginBottom: 20, opacity: 0.8 },
  message: { marginBottom: 28 },
  mainText: { fontSize: 15, color: '#ffffff', marginBottom: 14, lineHeight: 1.5, fontWeight: 600 },
  subText: { fontSize: 12, color: '#8090a8', lineHeight: 1.6 },
  btn: { background: 'linear-gradient(135deg, #1E90FF, #0060cc)', color: '#fff', border: 'none', borderRadius: 8, padding: '12px 28px', fontSize: 13, fontWeight: 700, cursor: 'pointer', letterSpacing: 0.5, boxShadow: '0 4px 30px #1E90FF40', transition: 'opacity .15s' },
}

export default function SessionPage() {
  // null = ancho aún desconocido (primer render / SSR) → no renderizar nada
  // para evitar que el simulador parpadee en móvil.
  const [isMobile, setIsMobile] = useState(null)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  if (isMobile === null) return null
  if (isMobile) return <MobileNotice />
  return <SessionInner />
}

export async function getServerSideProps(context) {
  return { props: { id: context.params.id } }
}
