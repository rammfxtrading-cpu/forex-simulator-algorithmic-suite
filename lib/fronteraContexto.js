// LA FRONTERA UNICA DEL CONTEXTO (orden 1-189 del CTO; PSIMM6-01 de Astra; la familia PSIMM3-03 → PSIMM4-01 → PSIMM5-01 → PSIMM6-01).
// Por principio, UN SOLO PUNTO: todo lo que llega de una carga de velas (v0: lib/sessionData.js fetchSessionCandles; v1:
// lib/sim/v1/velas.js cargaVelasV1) pasa por fronteraContexto ANTES de que nada lo use (components/usePairData.js cargaPar; la
// prueba pruebas/aceptacion/cv07 comprueba en el codigo que no hay otra lectura). Aqui:
//   1. cada vela se re-crea canonica { time, open, high, low, close, volume } (nunca se pasa un objeto recibido): tiempo entero de
//      minuto; OHLC numeros finitos > 0 y coherentes (high ≥ open, close, low; low ≤ open, close); volumen numero finito en
//      [0, VOLUMEN_MAX] (null/ausente → 0, compatible); en orden estricto (sin duplicados);
//   2. se hacen DE VERDAD los calculos derivados sobre el resultado: el motor del replay (lib/replayEngine.js) con getAggregated
//      de TODOS los timeframes (OHLC y volumen finitos, volumen ≥ 0) y las killzones (lib/killzonesDomain.js calcSessions);
//   3. si falla algo SOLO del contexto (velas anteriores al inicio de la sesion), en cualquier fase, el contexto entero se
//      descarta con el aviso del historico y la sesion sigue; si falla la sesion, el error del par (con «Reintentar»).
// Nunca lanza: una excepcion en cualquier fase es un fallo de esa fase.
import ReplayEngine, { TIMEFRAMES } from './replayEngine.js'
import { calcSessions } from './killzonesDomain.js'

// el volumen de una vela M1, como mucho (los mayores reales son de miles): la suma de una semana (10.080 velas) sigue siendo finita
export const VOLUMEN_MAX = 1e12
const KZ_TODAS = Object.freeze({ asia: true, london: true, nyam: true, nypm: true })
const num = x => typeof x === 'number' && Number.isFinite(x)

// la vela canonica, o null si no es valida
export function velaCanonica(c) {
  if (c == null || typeof c !== 'object' || Array.isArray(c)) return null
  const { time, open, high, low, close } = c
  const volume = c.volume == null ? 0 : c.volume
  if (!Number.isSafeInteger(time) || time % 60 !== 0) return null
  if (![open, high, low, close].every(num) || !(open > 0 && high > 0 && low > 0 && close > 0)) return null
  if (high < open || high < close || high < low || low > open || low > close) return null
  if (!num(volume) || volume < 0 || volume > VOLUMEN_MAX) return null
  return { time, open, high, low, close, volume }
}
// ¿los calculos derivados salen bien (finitos) sobre estas velas? null si si; el motivo si no. Nunca lanza
export function derivadosBien(candles) {
  try {
    if (!candles.length) return null
    const e = new ReplayEngine()
    e.load(candles); e.seekToTime(candles[candles.length - 1].time)
    for (const tf of Object.keys(TIMEFRAMES)) {
      e._aggCache = null
      const agg = e.getAggregated(tf)
      for (let i = 0; i < agg.length; i++) {
        const b = agg[i]
        if (!Number.isSafeInteger(b.time) || (i && agg[i - 1].time >= b.time) || ![b.open, b.high, b.low, b.close, b.volume].every(num) || b.volume < 0) return `agregado ${tf}`
      }
      for (const k of calcSessions(agg, KZ_TODAS)) if (!num(k.high) || !num(k.low)) return `killzones ${tf}`
    }
    return null
  } catch { return 'calculo derivado' }
}
const enOrden = l => { for (let i = 1; i < l.length; i++) if (l[i - 1].time >= l[i].time) return false; return true }
const errorSesion = { error: 'Las velas de la sesion no son validas (valores). Reintenta.', problemas: [] }

export function fronteraContexto(r) {
  try {
    if (r == null || typeof r !== 'object' || r.error || !Array.isArray(r.candles)) return r
    const desde = r.replayTs
    if (!Number.isSafeInteger(desde)) return errorSesion
    const ctx = [], ses = []
    let ctxMal = false
    for (const c of r.candles) {
      const esCtx = c != null && typeof c === 'object' && typeof c.time === 'number' && c.time < desde
      const v = velaCanonica(c)
      if (esCtx) { if (v) ctx.push(v); else ctxMal = true } else { if (!v) return errorSesion; ses.push(v) }
    }
    if (!ses.length || !enOrden(ses)) return errorSesion
    if (!enOrden(ctx) || (ctx.length && ctx[ctx.length - 1].time >= ses[0].time)) ctxMal = true
    let candles = ses, descartado = ctxMal
    if (!ctxMal && ctx.length) {
      candles = [...ctx, ...ses]
      // los derivados con el contexto; si fallan, el contexto se descarta (y se prueban sin el, abajo)
      if (derivadosBien(candles)) { candles = ses; descartado = true }
    }
    if (derivadosBien(candles)) return errorSesion
    return {
      ...r, candles,
      contextoIncompleto: r.contextoIncompleto === true || descartado,
      contextoQueFalta: [...(Array.isArray(r.contextoQueFalta) ? r.contextoQueFalta : []), ...(descartado ? ['valores no validos'] : [])],
    }
  } catch { return errorSesion }
}
