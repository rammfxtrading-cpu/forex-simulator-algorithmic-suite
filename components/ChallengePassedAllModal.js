/**
 * ChallengePassedAllModal.js
 *
 * Se muestra cuando el alumno completa la última fase del challenge.
 * Es el clímax emocional. Aplica peak-end rule + asociación de marca.
 *
 * Props:
 *   - status: el objeto challengeStatus completo del API.
 *   - onClose(): callback para cerrar (vuelve al dashboard / performance).
 *   - onAdvance(): callback que llama /api/challenge/advance con outcome='pass'.
 *   - onCtaReal(): callback al pulsar "Comenzar Challenge Real" (afiliado FTMO).
 *   - advancing: boolean true mientras /advance está en vuelo.
 */
import { useEffect } from 'react'

const FONT = "'Montserrat', sans-serif"

export default function ChallengePassedAllModal({ status, onClose, onAdvance, onCtaReal, advancing }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !advancing) onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, advancing])

  if (!status) return null

  const session = status.session || {}
  const evaluation = status.evaluation || {}

  const balanceNow = Number(evaluation.balanceNow ?? session.balance ?? 0)
  const capital = Number(session.capital ?? 0)
  const profitPct = capital > 0 ? ((balanceNow - capital) / capital) * 100 : 0

  // Win rate calculado de stats si está disponible
  const wins = Number(evaluation.winningTrades ?? 0)
  const total = Number(evaluation.totalTrades ?? 0)
  const winRate = total > 0 ? Math.round((wins / total) * 100) : 0

  const fmt$ = (n) => '$' + Number(n).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const fmtPct = (n) => (n >= 0 ? '+' : '') + n.toFixed(2) + '%'

  // Cuando el alumno pulsa "Comenzar Challenge Real", primero llamamos /advance
  // para persistir 'passed_all' en BD, y luego abrimos el afiliado FTMO.
  const handleCtaReal = async () => {
    if (advancing) return
    if (onAdvance) await onAdvance()    // marca como passed_all en BD
    if (onCtaReal) onCtaReal()           // abre afiliado FTMO
  }

  const handleViewPerformance = async () => {
    if (advancing) return
    if (onAdvance) await onAdvance()
    onClose?.()
  }

  return (
    <div style={s.backdrop}>
      <div style={s.modal}>
        {/* Glow orb posterior */}
        <div style={s.glowOrb}/>
        <div style={s.heroBig}/>
        <div style={s.body}>
          {/* Check geométrico SVG */}
          <div style={s.iconWrap}>
            <svg viewBox="0 0 64 64" width={44} height={44} fill="none"
                 stroke="#ffffff" strokeWidth={5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 33 L27 46 L50 20" />
            </svg>
          </div>

          <div style={s.badge}>Challenge Completed</div>
          <h1 style={s.titleBig}>Lo has conseguido</h1>
          <div style={s.slogan}>Vamos pa&apos;encima</div>
          <div style={s.signature}>R.A.M.M.FX TRADING</div>

          <p style={s.subtitle}>
            Has superado todas las fases respetando cada regla de gestión de riesgo.
            <br/><br/>
            <strong style={s.strong}>Si lo has hecho aquí, lo puedes hacer en un challenge real.</strong>
          </p>

          <div style={s.stats}>
            <div style={s.stat}>
              <div style={s.statLabel}>Final Balance</div>
              <div style={{...s.statValue, color:'#1E90FF'}}>{fmt$(balanceNow)}</div>
            </div>
            <div style={s.stat}>
              <div style={s.statLabel}>Total Return</div>
              <div style={{...s.statValue, color:'#1E90FF'}}>{fmtPct(profitPct)}</div>
            </div>
            <div style={s.stat}>
              <div style={s.statLabel}>Win Rate</div>
              <div style={s.statValue}>{winRate}%</div>
            </div>
          </div>

          <div style={s.motivational}>
            Las reglas de FTMO son las mismas que acabas de respetar aquí.
            El siguiente paso es real — <strong style={{color:'#1E90FF', fontWeight:700}}>y estás listo</strong>.
          </div>

          <div style={s.actions}>
            <button
              style={{
                ...s.btn, ...s.btnPrimaryBig,
                ...(advancing ? {opacity:0.6, cursor:'wait'} : {}),
              }}
              onClick={handleCtaReal}
              disabled={advancing}>
              Comenzar Challenge Real <span style={s.extIcon}>↗</span>
            </button>
            <button
              style={{...s.btn, ...s.btnSecondary, ...(advancing ? {opacity:0.5, cursor:'not-allowed'} : {})}}
              onClick={handleViewPerformance}
              disabled={advancing}>
              Ver mi Performance Completo
            </button>
          </div>
        </div>
        <div style={s.techFooter}>Algorithmic Suite</div>
      </div>
    </div>
  )
}

const s = {
  backdrop: {
    position:'fixed', inset:0,
    background:'rgba(0,0,0,0.78)',
    backdropFilter:'blur(10px)',
    WebkitBackdropFilter:'blur(10px)',
    display:'flex', alignItems:'center', justifyContent:'center',
    zIndex:9999, padding:20,
    fontFamily:FONT,
  },
  modal: {
    background:'rgba(4,10,24,0.97)',
    border:'1px solid rgba(255,255,255,0.08)',
    borderRadius:16,
    width:'100%', maxWidth:540,
    overflow:'hidden',
    boxShadow:'0 24px 80px rgba(0,0,0,0.75)',
    position:'relative',
  },
  glowOrb: {
    position:'absolute',
    top:-120, left:'50%',
    transform:'translateX(-50%)',
    width:320, height:320,
    background:'radial-gradient(circle, rgba(30,144,255,0.15) 0%, transparent 60%)',
    pointerEvents:'none', zIndex:0,
  },
  heroBig: {
    height:8,
    background:'linear-gradient(90deg, #1E90FF 0%, #4da6ff 50%, #1E90FF 100%)',
    boxShadow:'0 0 32px rgba(30,144,255,0.5)',
    position:'relative', zIndex:1,
  },
  body: {
    padding:'48px 36px 28px',
    textAlign:'center', position:'relative', zIndex:1,
  },
  iconWrap: {
    width:88, height:88, borderRadius:'50%',
    margin:'0 auto 20px',
    display:'flex', alignItems:'center', justifyContent:'center',
    background:'radial-gradient(circle, rgba(30,144,255,0.25) 0%, rgba(30,144,255,0.08) 70%)',
    border:'1.5px solid rgba(30,144,255,0.5)',
    color:'#fff',
    boxShadow:'0 0 48px rgba(30,144,255,0.4), inset 0 0 20px rgba(30,144,255,0.15)',
  },
  badge: {
    display:'inline-block',
    fontSize:10, fontWeight:700, letterSpacing:2,
    padding:'5px 12px', borderRadius:20,
    marginBottom:14, textTransform:'uppercase',
    background:'rgba(30,144,255,0.12)',
    border:'1px solid rgba(30,144,255,0.3)',
    color:'#1E90FF',
  },
  titleBig: {
    fontSize:36, fontWeight:900, letterSpacing:'-1px',
    lineHeight:1.1, marginBottom:4,
    background:'linear-gradient(135deg, #ffffff 0%, #4da6ff 100%)',
    WebkitBackgroundClip:'text',
    WebkitTextFillColor:'transparent',
    backgroundClip:'text',
  },
  slogan: {
    fontSize:20, fontWeight:800, letterSpacing:4,
    color:'#ffffff', textTransform:'uppercase',
    margin:'14px 0 4px',
  },
  signature: {
    display:'inline-block',
    fontSize:11, fontWeight:700, letterSpacing:3,
    color:'rgba(255,255,255,0.55)',
    textTransform:'uppercase',
    marginBottom:24,
    position:'relative',
    paddingTop:8,
    // Línea separadora encima
    borderTop:'1px solid rgba(255,255,255,0.25)',
    paddingLeft:32, paddingRight:32,
  },
  subtitle: {
    fontSize:14, lineHeight:1.65,
    color:'rgba(255,255,255,0.7)',
    marginBottom:24, fontWeight:400,
  },
  strong: { color:'#fff', fontWeight:700 },
  stats: {
    display:'grid', gridTemplateColumns:'1fr 1fr 1fr',
    gap:8, marginBottom:24, padding:16,
    background:'linear-gradient(180deg, rgba(30,144,255,0.06), rgba(30,144,255,0.02))',
    border:'1px solid rgba(30,144,255,0.2)',
    borderRadius:10,
  },
  stat: { textAlign:'center' },
  statLabel: {
    fontSize:9, fontWeight:600, letterSpacing:1.5,
    color:'rgba(255,255,255,0.4)',
    textTransform:'uppercase', marginBottom:6,
  },
  statValue: { fontSize:16, fontWeight:800, color:'#fff' },
  motivational: {
    background:'rgba(30,144,255,0.04)',
    border:'1px solid rgba(30,144,255,0.15)',
    borderRadius:10,
    padding:'14px 16px',
    marginBottom:22,
    textAlign:'left',
    fontSize:12, lineHeight:1.65,
    color:'rgba(255,255,255,0.78)',
  },
  actions: { display:'flex', flexDirection:'column', gap:10 },
  btn: {
    width:'100%', padding:'14px 20px',
    borderRadius:10, border:'none',
    fontFamily:FONT,
    fontSize:13, fontWeight:700, letterSpacing:0.5,
    cursor:'pointer', transition:'all 0.15s',
    display:'inline-flex', alignItems:'center', justifyContent:'center',
    gap:8,
  },
  btnPrimaryBig: {
    background:'linear-gradient(180deg, #2196F3, #1565C0)',
    color:'#fff',
    boxShadow:'0 8px 28px rgba(30,144,255,0.55), 0 0 40px rgba(30,144,255,0.25)',
    fontSize:14, padding:'16px 20px', letterSpacing:1,
  },
  btnSecondary: {
    background:'rgba(255,255,255,0.04)',
    border:'1px solid rgba(255,255,255,0.1)',
    color:'rgba(255,255,255,0.8)',
  },
  extIcon: { fontSize:11, opacity:0.7 },
  techFooter: {
    borderTop:'1px solid rgba(255,255,255,0.05)',
    padding:'12px 36px', textAlign:'center',
    fontSize:9, letterSpacing:1.5,
    color:'rgba(255,255,255,0.3)',
    textTransform:'uppercase', fontWeight:600,
  },
}
