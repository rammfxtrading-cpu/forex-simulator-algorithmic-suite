/**
 * ChallengeHUD — mini-HUD que se inserta en la barra inferior del simulador
 * cuando la sesion es un challenge (FTMO-style).
 *
 * Props:
 *   status: objeto devuelto por /api/challenge/status (o null si aun no cargo)
 *     {
 *       session: { challenge_type, challenge_phase, capital, ... },
 *       config:  { code, name, phases, targets_pct, dd_daily_pct, dd_total_pct },
 *       evaluation: {
 *         status, balanceNow, pnlTotal, pnlPct,
 *         targetUSD, targetPct, targetRemainingUSD,
 *         ddDailyWorstUSD, ddDailyWorstPct, ddDailyCapUSD, ddDailyCapPct,
 *         ddTotalWorstUSD, ddTotalWorstPct, ddTotalCapUSD, ddTotalCapPct,
 *       }
 *     }
 *
 * Si status es null → no renderiza nada (la barra queda igual que antes).
 */

export default function ChallengeHUD({ status }) {
  if (!status || !status.evaluation || !status.config || !status.session) return null

  const { evaluation, config, session } = status
  const phase = session.challenge_phase || 1
  const totalPhases = config.phases || 1

  // % de progreso hacia target (cap a 100 para la barra)
  const targetCap = evaluation.targetPct || 0
  const targetNow = evaluation.pnlPct || 0
  const targetProgress = targetCap > 0 ? Math.max(0, Math.min(100, (targetNow / targetCap) * 100)) : 0
  const targetReached = targetNow >= targetCap && targetCap > 0

  // % de DD usado (vs cap). Usamos los valores LIVE (actuales), no el worst histórico.
  // - ddDailyCurrent: lo que llevas perdido HOY (día Madrid). Reset automático al cambiar de día.
  // - ddTotalCurrent: caída actual desde el equity peak. Baja a 0 cuando haces nuevo peak.
  // El motor sigue calculando worst para evaluación fail/pass (campo aparte: ddDailyWorstPct).
  const ddDailyUsedPct = Math.max(0, evaluation.ddDailyCurrentPct || 0)
  const ddDailyCapPct = evaluation.ddDailyCapPct || 5
  const ddDailyProgress = ddDailyCapPct > 0 ? Math.max(0, Math.min(100, (ddDailyUsedPct / ddDailyCapPct) * 100)) : 0

  const ddTotalUsedPct = Math.max(0, evaluation.ddTotalCurrentPct || 0)
  const ddTotalCapPct = evaluation.ddTotalCapPct || 10
  const ddTotalProgress = ddTotalCapPct > 0 ? Math.max(0, Math.min(100, (ddTotalUsedPct / ddTotalCapPct) * 100)) : 0

  // Formato del % usado: cuando estamos a <0.1% del cap pero NO lo hemos tocado,
  // 2 decimales redondean engañosamente (4.998% → "5.00%" igual que el cap, pero
  // sin haber fallado). En ese caso mostramos 3 decimales para que se vea la verdad.
  // Una vez tocado, volvemos a 2 decimales (4.998 → 5.00 → fallaste).
  const fmtUsedPct = (used, cap) => {
    if (used < cap && cap - used < 0.1) return used.toFixed(3) + '%'
    return used.toFixed(2) + '%'
  }

  // Colores dinamicos para DDs: gris normal, naranja si >70% del cap, rojo si >=100%
  const ddDailyColor = ddDailyProgress >= 100 ? '#ef5350' : ddDailyProgress >= 70 ? '#fb923c' : '#a0b8d0'
  const ddTotalColor = ddTotalProgress >= 100 ? '#ef5350' : ddTotalProgress >= 70 ? '#fb923c' : '#a0b8d0'

  // Target bar: azul normal, verde cuando ya alcanzado
  const targetBarBg = targetReached ? 'linear-gradient(90deg,#1E90FF,#22c55e)' : '#1E90FF'
  const targetTextColor = targetReached ? '#22c55e' : '#fff'

  // Challenge type label corto
  const typeLabel = config.code || 'CHL' // '1F', '2F', '3F'
  const capitalK = Math.round((session.capital || 0) / 1000) + 'K'

  return (
    <>
      <div style={sep}/>

      {/* Badge del challenge */}
      <div style={badge}>
        <span style={badgeText}>{typeLabel} · FASE {phase}/{totalPhases} · ${capitalK}</span>
      </div>

      {/* Target */}
      <div style={metric}>
        <span style={metricLabel}>TARGET</span>
        <div style={barTrack}>
          <div style={{...barFill, width:`${targetProgress}%`, background:targetBarBg}}/>
        </div>
        <span style={{...metricValue, color:targetTextColor}}>{targetNow >= 0 ? '+' : ''}{targetNow.toFixed(2)}%</span>
        <span style={metricCap}>/ {targetCap.toFixed(0)}%</span>
      </div>

      {/* DD Diario */}
      <div style={metric}>
        <span style={metricLabel}>DD DIA</span>
        <div style={barTrack}>
          <div style={{...barFill, width:`${ddDailyProgress}%`, background:ddDailyColor}}/>
        </div>
        <span style={{...metricValue, color:ddDailyColor}}>{fmtUsedPct(ddDailyUsedPct, ddDailyCapPct)}</span>
        <span style={metricCap}>/ {ddDailyCapPct.toFixed(0)}%</span>
      </div>

      {/* DD Total */}
      <div style={metric}>
        <span style={metricLabel}>DD TOT</span>
        <div style={barTrack}>
          <div style={{...barFill, width:`${ddTotalProgress}%`, background:ddTotalColor}}/>
        </div>
        <span style={{...metricValue, color:ddTotalColor}}>{fmtUsedPct(ddTotalUsedPct, ddTotalCapPct)}</span>
        <span style={metricCap}>/ {ddTotalCapPct.toFixed(0)}%</span>
      </div>
    </>
  )
}

const sep = { width:1, height:18, background:'rgba(255,255,255,0.1)' }

const badge = {
  display:'flex', alignItems:'center', gap:6,
  background:'rgba(30,144,255,0.08)',
  border:'1px solid rgba(30,144,255,0.3)',
  padding:'4px 9px', borderRadius:6,
}
const badgeText = {
  fontSize:9, color:'#60a5fa', fontWeight:700, letterSpacing:0.5,
}

const metric = {
  display:'flex', alignItems:'center', gap:5,
}
const metricLabel = {
  fontSize:9, color:'rgba(255,255,255,0.45)',
  letterSpacing:0.5, fontWeight:600,
}
const metricValue = {
  fontSize:10, color:'#fff', fontWeight:700,
}
const metricCap = {
  fontSize:9, color:'rgba(255,255,255,0.4)',
}
const barTrack = {
  width:60, height:5, background:'rgba(255,255,255,0.08)',
  borderRadius:3, overflow:'hidden',
}
const barFill = {
  height:'100%', borderRadius:3, transition:'width .3s ease',
}
