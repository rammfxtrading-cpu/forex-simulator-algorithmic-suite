/**
 * ChallengePassedPhaseModal.js
 *
 * Se muestra cuando el alumno alcanza el target de una fase intermedia
 * (no la última). Al pulsar "Continue to Phase 2 →" llama a /api/challenge/advance
 * con outcome='pass' y redirige a la nueva sesión creada.
 *
 * Props:
 *   - status: el objeto challengeStatus completo del API.
 *   - onClose(): callback para cerrar el modal sin avanzar (vuelve al dashboard).
 *   - onAdvance(): callback que dispara la llamada a /api/challenge/advance.
 *                  El padre se encarga del fetch, redirect y manejo de errores.
 *   - onReview(): callback "Revisar mis trades" — solo cierra el modal sin redirigir,
 *                 deja al alumno en el chart con bloqueos del Paso 3 aplicados.
 *   - advancing: boolean true mientras la petición /advance está en vuelo.
 */
import { useEffect } from 'react'

const FONT = "'Montserrat', sans-serif"

export default function ChallengePassedPhaseModal({ status, onClose, onAdvance, onReview, advancing }) {
  // Cerrar con ESC
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !advancing) onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, advancing])

  // Handler "Revisar mis trades": persiste passed_phase en BD y cierra modal
  // sin redirigir. El alumno queda en el chart con bloqueos del Paso 3 aplicados.
  const handleReview = async () => {
    if (advancing) return
    if (onAdvance) await onAdvance()
    if (onReview) onReview()
  }

  if (!status) return null

  const session = status.session || {}
  const evaluation = status.evaluation || {}
  const config = status.config || {}
  const currentPhase = session.challenge_phase || 1
  const totalPhases = config.phases || 2
  const nextPhase = currentPhase + 1

  const balanceNow = Number(evaluation.balanceNow ?? session.balance ?? 0)
  const capital = Number(session.capital ?? 0)
  const profitPct = capital > 0 ? ((balanceNow - capital) / capital) * 100 : 0
  const worstDdPct = Number(evaluation.ddTotalWorstPct ?? 0)

  const fmt$ = (n) => '$' + Number(n).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const fmtPct = (n) => (n >= 0 ? '+' : '') + n.toFixed(2) + '%'

  return (
    <div style={s.backdrop}>
      <div style={s.modal}>
        <div style={s.hero}/>
        <div style={s.body}>
          {/* Phase progress */}
          <div style={s.phaseProgress}>
            <div style={{...s.phaseCircle, ...s.phaseCirclePassed}}>{currentPhase}</div>
            <div style={{...s.phaseLine, ...s.phaseLinePassed}}/>
            <div style={{...s.phaseCircle, ...s.phaseCircleCurrent}}>{nextPhase}</div>
            {nextPhase < totalPhases && (
              <>
                <div style={s.phaseLine}/>
                <div style={s.phaseCircle}>{totalPhases}</div>
              </>
            )}
          </div>

          <div style={s.badge}>Phase {currentPhase} · Cleared</div>
          <h1 style={s.title}>Has pasado la fase {currentPhase}</h1>
          <p style={s.subtitle}>
            Has alcanzado el target respetando todas las reglas.
            Disciplina, paciencia, ejecución. <strong style={s.strong}>Lo estás haciendo tú</strong>.
          </p>

          <div style={s.sloganMini}>Vamos pa&apos;encima</div>
          <div style={s.signatureMini}>R.A.M.M.FX TRADING</div>

          <div style={s.stats}>
            <div style={s.stat}>
              <div style={s.statLabel}>Final Balance</div>
              <div style={{...s.statValue, color:'#1E90FF'}}>{fmt$(balanceNow)}</div>
            </div>
            <div style={s.stat}>
              <div style={s.statLabel}>Profit</div>
              <div style={{...s.statValue, color:'#1E90FF'}}>{fmtPct(profitPct)}</div>
            </div>
            <div style={s.stat}>
              <div style={s.statLabel}>Worst DD</div>
              <div style={s.statValue}>{fmtPct(-Math.abs(worstDdPct))}</div>
            </div>
          </div>

          <div style={s.motivational}>
            <strong style={{color:'#1E90FF', fontWeight:700}}>Tip:</strong>{' '}
            en Fase {nextPhase} las reglas de DD son las mismas. Mantén la mentalidad que te trajo aquí.
          </div>

          <div style={s.actions}>
            <button
              style={{
                ...s.btn, ...s.btnPrimary,
                ...(advancing ? {opacity:0.6, cursor:'wait'} : {}),
              }}
              onClick={onAdvance}
              disabled={advancing}>
              {advancing ? 'Procesando…' : `Continue to Phase ${nextPhase} →`}
            </button>
            <button
              style={{...s.btn, ...s.btnSecondary, ...(advancing ? {opacity:0.5, cursor:'not-allowed'} : {})}}
              onClick={onClose}
              disabled={advancing}>
              Volver al Dashboard
            </button>
            <button
              style={{...s.btnLink, ...(advancing ? {opacity:0.4, cursor:'not-allowed'} : {})}}
              onClick={handleReview}
              disabled={advancing}>
              Revisar mis trades de esta fase
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
  hero: {
    height:6,
    background:'linear-gradient(90deg, transparent, #1E90FF, transparent)',
  },
  body: {
    padding:'40px 36px 28px',
    textAlign:'center',
    position:'relative',
    zIndex:1,
  },
  phaseProgress: {
    display:'flex', alignItems:'center', justifyContent:'center',
    gap:6, marginBottom:18,
  },
  phaseCircle: {
    width:28, height:28, borderRadius:'50%',
    display:'flex', alignItems:'center', justifyContent:'center',
    fontSize:12, fontWeight:800,
    border:'1.5px solid rgba(255,255,255,0.15)',
    background:'rgba(255,255,255,0.04)',
    color:'rgba(255,255,255,0.5)',
  },
  phaseCirclePassed: {
    background:'rgba(30,144,255,0.2)',
    borderColor:'#1E90FF',
    color:'#1E90FF',
  },
  phaseCircleCurrent: {
    background:'rgba(30,144,255,0.35)',
    borderColor:'#1E90FF',
    color:'#fff',
    boxShadow:'0 0 16px rgba(30,144,255,0.4)',
  },
  phaseLine: { width:24, height:1.5, background:'rgba(255,255,255,0.15)' },
  phaseLinePassed: { background:'#1E90FF' },
  badge: {
    display:'inline-block',
    fontSize:10, fontWeight:700, letterSpacing:2,
    padding:'5px 12px', borderRadius:20,
    marginBottom:14, textTransform:'uppercase',
    background:'rgba(30,144,255,0.12)',
    border:'1px solid rgba(30,144,255,0.3)',
    color:'#1E90FF',
  },
  title: {
    fontSize:26, fontWeight:800, letterSpacing:'-0.5px',
    marginBottom:12, lineHeight:1.2, color:'#fff',
  },
  subtitle: {
    fontSize:14, lineHeight:1.65,
    color:'rgba(255,255,255,0.7)',
    marginBottom:18, fontWeight:400,
  },
  strong: { color:'#fff', fontWeight:700 },
  sloganMini: {
    fontSize:14, fontWeight:700, letterSpacing:3,
    color:'#ffffff', textTransform:'uppercase',
    margin:'8px 0 4px',
  },
  signatureMini: {
    display:'inline-block',
    fontSize:9, fontWeight:700, letterSpacing:2.5,
    color:'rgba(255,255,255,0.45)',
    textTransform:'uppercase',
    marginBottom:22,
  },
  stats: {
    display:'grid', gridTemplateColumns:'1fr 1fr 1fr',
    gap:8, marginBottom:24, padding:16,
    background:'rgba(255,255,255,0.03)',
    border:'1px solid rgba(255,255,255,0.06)',
    borderRadius:10,
  },
  stat: { textAlign:'center' },
  statLabel: {
    fontSize:9, fontWeight:600, letterSpacing:1.5,
    color:'rgba(255,255,255,0.4)',
    textTransform:'uppercase', marginBottom:6,
  },
  statValue: {
    fontSize:16, fontWeight:800, color:'#fff',
  },
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
  actions: {
    display:'flex', flexDirection:'column', gap:10,
  },
  btn: {
    width:'100%', padding:'14px 20px',
    borderRadius:10, border:'none',
    fontFamily:FONT,
    fontSize:13, fontWeight:700, letterSpacing:0.5,
    cursor:'pointer', transition:'all 0.15s',
    display:'inline-flex', alignItems:'center', justifyContent:'center',
    gap:8,
  },
  btnPrimary: {
    background:'linear-gradient(180deg, #1E90FF, #1a7ad4)',
    color:'#fff',
    boxShadow:'0 4px 14px rgba(30,144,255,0.35)',
  },
  btnSecondary: {
    background:'rgba(255,255,255,0.04)',
    border:'1px solid rgba(255,255,255,0.1)',
    color:'rgba(255,255,255,0.8)',
  },
  btnLink: {
    width:'100%', padding:'8px 20px',
    background:'transparent',
    border:'none',
    color:'rgba(255,255,255,0.45)',
    fontFamily:FONT,
    fontSize:11, fontWeight:600, letterSpacing:0.3,
    cursor:'pointer',
    textDecoration:'underline',
    textUnderlineOffset:3,
    textDecorationColor:'rgba(255,255,255,0.2)',
    transition:'color 0.15s',
  },
  techFooter: {
    borderTop:'1px solid rgba(255,255,255,0.05)',
    padding:'12px 36px', textAlign:'center',
    fontSize:9, letterSpacing:1.5,
    color:'rgba(255,255,255,0.3)',
    textTransform:'uppercase', fontWeight:600,
  },
}
