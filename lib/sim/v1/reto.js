// EL RETO DE LA PANTALLA V1 EN EL HUD (etapa 2 del motor, pieza 5). Puro, sin React y sin lib/motor: de la vista
// confirmada (vista.js, con la valoracion que calcula el motor en el servidor) a la forma de /api/challenge/status que
// ya pintan el HUD y los modales (lib/challengeEngine.js: status, balanceNow, targetUSD, ddDailyCapUSD…). Nada se
// recalcula aqui con reglas propias: el estado del reto (en_curso, breach, superada), el breach y su regla, los limites
// y los dias son los del motor; esto solo resta cifras ya confirmadas para enseñarlas.
//   status          en_curso → active · superada → target_reached · breach → failed_dd_daily / failed_dd_total
//   failureReason   la regla del breach del motor (perdida_diaria, perdida_maxima) o null
//   ddDailyCapUSD   saldo de la medianoche − limite diario; ddTotalCapUSD: capital − limite total
//   ddDaily/TotalCurrentUSD   lo que la equity esta por debajo del saldo de la medianoche / del capital (≥ 0)
//   puedePasarFase  superada: el modal de fase manda /api/sim/avanzar-fase (cliente.pasaFase)
// Sin valoracion (el servidor no pudo valorar): las cifras que dependen de la equity, null.
const STATUS = { en_curso: 'active', superada: 'target_reached' }
const FALLO = { perdida_diaria: 'failed_dd_daily', perdida_maxima: 'failed_dd_total' }
// las cifras ya vienen en µUSD exactos pasados a numero: el redondeo a 6 decimales solo quita el ruido de la resta
const r6 = x => (x == null || !Number.isFinite(x) ? null : Math.round(x * 1e6) / 1e6)
const pct = (x, base) => (x == null || !base ? null : r6((x / base) * 100))

export function evaluacionV1(vista) {
  const r = vista?.reto
  if (!r) return null
  const capital = r.capital, saldo = vista.saldo, equity = vista.equity ?? null
  const limite = regla => r.limites?.find(l => l.regla === regla)?.limite ?? null
  const lDia = limite('perdida_diaria'), lTotal = limite('perdida_maxima')
  const status = r.estado === 'breach' ? FALLO[r.breach?.regla] ?? 'failed_dd_total' : STATUS[r.estado] ?? null
  const targetUSD = r6(r.objetivo - capital)
  const ddDailyCapUSD = lDia == null ? null : r6(r.saldoMedianoche - lDia)
  const ddTotalCapUSD = lTotal == null ? null : r6(capital - lTotal)
  const ddDailyCurrentUSD = equity == null ? null : r6(Math.max(0, r.saldoMedianoche - equity))
  const ddTotalCurrentUSD = equity == null ? null : r6(Math.max(0, capital - equity))
  const pnlTotal = r6(saldo - capital)
  return {
    status,
    phase: r.fase,
    fases: r.normas?.fases ?? null,
    balanceNow: saldo,
    equity,
    pnlTotal,
    pnlPct: pct(pnlTotal, capital),
    targetUSD,
    targetPct: r.normas?.objetivo?.[r.fase] ?? pct(targetUSD, capital),
    targetRemainingUSD: r6(Math.max(0, r.objetivo - saldo)),
    ddDailyCapUSD,
    ddDailyCapPct: r.normas?.perdida_diaria ?? null,
    ddTotalCapUSD,
    ddTotalCapPct: r.normas?.perdida_maxima ?? null,
    ddDailyCurrentUSD,
    ddDailyCurrentPct: pct(ddDailyCurrentUSD, r.saldoMedianoche),
    ddTotalCurrentUSD,
    ddTotalCurrentPct: pct(ddTotalCurrentUSD, capital),
    diasTrading: r.diasConApertura.length,
    diasMinimos: r.normas?.dias_minimos ?? null,
    failureReason: r.estado === 'breach' ? r.breach?.regla ?? null : null,
    puedePasarFase: r.estado === 'superada',
  }
}
