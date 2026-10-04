// lib/metricas.js — UNA definicion de cada metrica para el alumno (Analytics,
// Dashboard) y para el mentor (panel admin y su lista de alumnos).
// Auditoria C02 (4-oct-2026): alumno y mentor veian numeros distintos de las
// mismas operaciones (expectativa, R:R, capital de partida) y la actividad se
// medía con fechas del mercado simulado. Decisiones del CTO (4-oct):
//   · expectativa = suma de P&L / numero de trades cerrados
//   · R:R con una sola definicion: la R MEDIA POR OPERACION CERRADA (incluidas
//     perdidas y breakevens); es la expectativa medida en R
//   · todo lo que depende de la secuencia (drawdown, rachas, curva) va en el
//     ORDEN DE CIERRE (closed_at; a igualdad, created_at y luego id)
//   · capital de partida = suma de los capitales de las sesiones incluidas
//   · actividad = fecha REAL en que se registro la operacion (created_at), no
//     la fecha del mercado que se estaba practicando
// Funciones puras.

const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0 }
const cmp = (a, b) => a < b ? -1 : a > b ? 1 : 0

export const estaCerrado = t => !!t && !!t.result && t.result !== 'OPEN'

// Cerrados en orden de cierre (estable)
export function enOrdenDeCierre(trades) {
  return (trades || []).filter(estaCerrado).slice().sort((a, b) =>
    cmp(a.closed_at ?? '', b.closed_at ?? '') || cmp(a.created_at ?? '', b.created_at ?? '') || cmp(String(a.id ?? ''), String(b.id ?? '')))
}

// sesiones: las INCLUIDAS en lo que se mira (todas, o la elegida)
export function metricas(trades, sesiones = []) {
  const cerrados = enOrdenDeCierre(trades)
  const n = cerrados.length
  const ganadoras = cerrados.filter(t => t.result === 'WIN')
  const perdedoras = cerrados.filter(t => t.result === 'LOSS')
  const breakevens = cerrados.filter(t => t.result === 'BREAKEVEN')
  const suma = arr => arr.reduce((s, t) => s + num(t.pnl), 0)
  const totalPnl = suma(cerrados)
  const brutoGanado = suma(ganadoras)
  const brutoPerdido = Math.abs(suma(perdedoras))
  const conR = cerrados.filter(t => t.rr != null && Number.isFinite(Number(t.rr)))
  const capitalInicial = (sesiones || []).reduce((s, x) => s + num(x.capital), 0)

  let equity = capitalInicial, pico = capitalInicial, maxDrawdown = 0
  let rachaG = 0, rachaP = 0, maxRachaG = 0, maxRachaP = 0
  const curva = [{ x: 0, y: capitalInicial }]
  cerrados.forEach((t, i) => {
    equity += num(t.pnl)
    if (equity > pico) pico = equity
    if (pico - equity > maxDrawdown) maxDrawdown = pico - equity
    if (t.result === 'WIN') { rachaG++; rachaP = 0; if (rachaG > maxRachaG) maxRachaG = rachaG }
    else if (t.result === 'LOSS') { rachaP++; rachaG = 0; if (rachaP > maxRachaP) maxRachaP = rachaP }
    curva.push({ x: i + 1, y: equity })
  })

  return {
    cerrados, ganadoras, perdedoras, breakevens,
    numTrades: n,
    totalPnl,
    winRate: n ? ganadoras.length / n * 100 : 0,
    expectativa: n ? totalPnl / n : 0,
    rrMedio: conR.length ? conR.reduce((s, t) => s + Number(t.rr), 0) / conR.length : 0,
    mejorGanadora: ganadoras.length ? Math.max(...ganadoras.map(t => num(t.pnl))) : 0,
    peorPerdedora: perdedoras.length ? Math.min(...perdedoras.map(t => num(t.pnl))) : 0,
    mediaGanadora: ganadoras.length ? brutoGanado / ganadoras.length : 0,
    mediaPerdedora: perdedoras.length ? -brutoPerdido / perdedoras.length : 0,
    profitFactor: brutoPerdido > 0 ? brutoGanado / brutoPerdido : null,
    capitalInicial,
    saldoFinal: capitalInicial + totalPnl,
    maxDrawdown,
    maxRachaGanadora: maxRachaG,
    maxRachaPerdedora: maxRachaP,
    curva,
  }
}

// La ultima actividad REAL de un alumno: la operacion registrada mas reciente
// (created_at de sim_trades) o, si no hay, la sesion creada mas reciente.
export function ultimaActividad(trades = [], sesiones = []) {
  let ultima = null
  for (const x of [...trades, ...sesiones]) {
    const d = x?.created_at
    if (d && (!ultima || new Date(d) > new Date(ultima))) ultima = d
  }
  return ultima
}

export const activoEnLosUltimos = (fecha, dias, ahoraMs = Date.now()) =>
  !!fecha && new Date(fecha).getTime() > ahoraMs - dias * 86400000
