/**
 * ChallengeFailedModal.js
 *
 * Se muestra cuando el alumno quema el challenge (DD diario o DD total).
 * Disociación total de marca: NI eslogan, NI firma, NI footer.
 * El alumno asocia el dolor al evento, no a la marca.
 *
 * Props:
 *   - status: el objeto challengeStatus completo del API.
 *   - onClose(): callback para cerrar (sigue revisando trades).
 *   - onAdvance(): callback que llama /api/challenge/advance con outcome='fail'.
 *   - onNewChallenge(): callback al pulsar "Empezar nuevo Challenge".
 *   - advancing: boolean true mientras /advance está en vuelo.
 */
import { useEffect } from 'react'

const FONT = "'Montserrat', sans-serif"

export default function ChallengeFailedModal({ status, onClose, onAdvance, onNewChallenge, advancing }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !advancing) onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, advancing])

  if (!status) return null

  const session = status.session || {}
  const evaluation = status.evaluation || {}
  const config = status.config || {}
  const currentPhase = session.challenge_phase || 1
  // failureReason puede venir del motor en evaluation o derivado del status de la sesión
  const failureReason = evaluation.failureReason
    || (session.status === 'failed_dd_daily' ? 'dd_daily' : 'dd_total')
  const isDaily = failureReason === 'dd_daily'

  const limitPct = isDaily
    ? Number(config.ddDailyPct ?? 5)
    : Number(config.ddTotalPct ?? 10)

  const hitPct = isDaily
    ? Math.abs(Number(evaluation.ddDailyWorstPct ?? limitPct))
    : Math.abs(Number(evaluation.ddTotalWorstPct ?? limitPct))

  // Caps y caída actual en USD para mostrar la cifra concreta junto al porcentaje.
  // El motor backend devuelve ddDailyWorstUSD / ddTotalWorstUSD (magnitud positiva).
  const hitUSD = isDaily
    ? Math.abs(Number(evaluation.ddDailyWorstUSD ?? 0))
    : Math.abs(Number(evaluation.ddTotalWorstUSD ?? 0))
  const limitUSD = isDaily
    ? Math.abs(Number(evaluation.ddDailyCapUSD ?? 0))
    : Math.abs(Number(evaluation.ddTotalCapUSD ?? 0))
  // Format español: $5.290 / -$5.000
  const fmtUsd = (n) => '$' + Math.round(n).toLocaleString('es-ES')

  const handleNewChallenge = async () => {
    if (advancing) return
    if (onAdvance) await onAdvance()
    if (onNewChallenge) onNewChallenge()
  }

  const handleReview = async () => {
    if (advancing) return
    // Marcar el fail en BD aunque el alumno solo quiera revisar trades.
    // Si no, el bloqueo de botones dependería solo de evaluation.status,
    // y al hacer F5 perdería el estado.
    if (onAdvance) await onAdvance()
    onClose?.()
  }

  return (
    <div style={s.backdrop}>
      <div style={s.modal}>
        <div style={s.hero}/>
        <div style={s.body}>
          <div style={s.iconWrap}>
            <svg viewBox="0 0 64 64" width={28} height={28} fill="none"
                 stroke="#ef5350" strokeWidth={5} strokeLinecap="round">
              <path d="M20 20 L44 44 M44 20 L20 44" />
            </svg>
          </div>

          <div style={s.badge}>
            {isDaily ? 'Daily Drawdown Hit' : 'Max Drawdown Hit'}
          </div>

          <h1 style={s.title}>
            {isDaily
              ? `Fase ${currentPhase} cerrada por DD diario`
              : 'Challenge cerrado por DD total'}
          </h1>

          <p style={s.subtitle}>
            {isDaily
              ? `Has cruzado el límite de pérdida diaria del ${limitPct}%. La fase queda cerrada — pero esto es parte normal del proceso de cualquier trader.`
              : `Has cruzado el límite de pérdida total del ${limitPct}%. Quemar un challenge no define a un trader — lo define cómo vuelve después.`}
          </p>

          <div style={s.reason}>
            <div style={s.reasonLabel}>Razón</div>
            <div style={s.reasonText}>
              DD {isDaily ? 'diario' : 'total'} alcanzado: -{fmtUsd(hitUSD)} ({hitPct.toFixed(2)}%)
            </div>
            <div style={{...s.reasonText, fontSize:11, opacity:0.6, marginTop:4}}>
              Límite: -{fmtUsd(limitUSD)} ({limitPct}%)
            </div>
          </div>

          <div style={s.motivational}>
            {isDaily ? (
              <>
                <strong style={s.motStrong}>Lo importante:</strong>{' '}
                identificar qué patrón te llevó hasta aquí. Revisa los trades del día,
                busca el momento donde la disciplina cedió, y vuelve con un plan más sólido.
              </>
            ) : (
              <>
                <strong style={s.motStrong}>Antes de volver:</strong>{' '}
                revisa la curva de balance, identifica el rango de fechas donde se torció,
                y entiende qué pasaba en tu cabeza ahí. La información está en tus trades.
              </>
            )}
          </div>

          <div style={s.actions}>
            <button
              style={{
                ...s.btn, ...s.btnPrimary,
                ...(advancing ? {opacity:0.6, cursor:'wait'} : {}),
              }}
              onClick={handleNewChallenge}
              disabled={advancing}>
              {advancing ? 'Procesando…' : 'Empezar nuevo Challenge'}
            </button>
            <button
              style={{...s.btn, ...s.btnSecondary, ...(advancing ? {opacity:0.5, cursor:'not-allowed'} : {})}}
              onClick={handleReview}
              disabled={advancing}>
              Revisar mis trades
            </button>
          </div>
        </div>
        {/* SIN footer. La marca no firma fracasos. */}
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
  },
  hero: {
    height:6,
    background:'linear-gradient(90deg, transparent, #ef5350, transparent)',
  },
  body: {
    padding:'40px 36px 28px',
    textAlign:'center',
  },
  iconWrap: {
    width:64, height:64, borderRadius:'50%',
    margin:'0 auto 20px',
    display:'flex', alignItems:'center', justifyContent:'center',
    background:'rgba(239,83,80,0.10)',
    border:'1px solid rgba(239,83,80,0.3)',
  },
  badge: {
    display:'inline-block',
    fontSize:10, fontWeight:700, letterSpacing:2,
    padding:'5px 12px', borderRadius:20,
    marginBottom:14, textTransform:'uppercase',
    background:'rgba(239,83,80,0.10)',
    border:'1px solid rgba(239,83,80,0.3)',
    color:'#ef5350',
  },
  title: {
    fontSize:26, fontWeight:800, letterSpacing:'-0.5px',
    marginBottom:12, lineHeight:1.2, color:'#fff',
  },
  subtitle: {
    fontSize:14, lineHeight:1.65,
    color:'rgba(255,255,255,0.7)',
    marginBottom:24, fontWeight:400,
  },
  reason: {
    background:'rgba(239,83,80,0.06)',
    border:'1px solid rgba(239,83,80,0.2)',
    borderRadius:10,
    padding:'14px 16px',
    marginBottom:22,
    textAlign:'left',
  },
  reasonLabel: {
    fontSize:9, fontWeight:700, letterSpacing:1.5,
    color:'rgba(239,83,80,0.85)',
    textTransform:'uppercase', marginBottom:4,
  },
  reasonText: {
    fontSize:13, color:'rgba(255,255,255,0.85)', fontWeight:500,
  },
  motivational: {
    background:'rgba(255,255,255,0.03)',
    border:'1px solid rgba(255,255,255,0.08)',
    borderRadius:10,
    padding:'14px 16px',
    marginBottom:22,
    textAlign:'left',
    fontSize:12, lineHeight:1.65,
    color:'rgba(255,255,255,0.78)',
  },
  motStrong: { color:'rgba(255,255,255,0.95)', fontWeight:700 },
  actions: { display:'flex', flexDirection:'column', gap:10 },
  btn: {
    width:'100%', padding:'14px 20px',
    borderRadius:10, border:'none',
    fontFamily:FONT,
    fontSize:13, fontWeight:700, letterSpacing:0.5,
    cursor:'pointer', transition:'all 0.15s',
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
}
