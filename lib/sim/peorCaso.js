// El PEOR CASO de la vela siguiente a un cierre sin confirmar (orden 1-158 del CTO, decision 1).
//
// Desde la orden 1-157 la confirmacion de un cierre (cola y relectura del reto) va por detras y el Play sigue, salvo
// con algo abierto: esa vela puede quemar el reto y el detector de breach (components/useChallengeFlow.js,
// lib/trading/breach.js) necesita el DD del dia con ese cierre. Para no esperar en el caso normal con varias posiciones,
// antes de cada vela con la confirmacion pendiente se calcula aqui el peor caso; si aun asi queda lejos de los dos
// limites, el Play sigue y la confirmacion llega por detras. Si no, se espera como antes.
//
// Las reglas son las de la app (lib/challengeRules.js y lib/challengeEngine.js, lo que devuelve /api/challenge/status):
//   DD total: suelo fijo, capital × dd_total_pct (ddTotalCapUSD); la caida se mide desde el capital inicial
//   DD diario: balance de INICIO DEL DIA de Madrid × dd_daily_pct (ddDailyCapUSD es el del ultimo dia con cierres:
//   lastDayStartBalance × pct); la caida del dia (ddDailyCurrentUSD) es inicio del dia − el minimo del dia
// Con el ULTIMO RETO CONFIRMADO (balanceNow, ddDailyCapUSD, ddDailyCurrentUSD, ddTotalCapUSD) y lo que el no cuenta:
//   L = Σ perdida de cada cierre sin confirmar, tomada como la MAXIMA posible: min(su pnl, su pnl en el SL) (una ganancia
//       cuenta 0), mas 0,01 por el redondeo a centimos de la fila. SIN SL no hay cota: no es seguro (se espera, como antes)
//   F = Σ pnl de cada posicion abierta en el extremo ADVERSO de la vela (el minimo para los largos, el maximo para los
//       cortos) + Σ pnl de cada pendiente que esa vela puede llenar, desde su entrada hasta su peor precio; P = max(0, −F)
//   costes: la comision y el spread de cada uno (con la bandera v1 apagada la app no aplica ninguno: realizePnl = calcPnl)
//   DD diario peor = ddDailyCurrentUSD + L + P, contra pct × min(inicio del ultimo dia, balanceNow − L) (si el dia ha
//       cambiado, el inicio de hoy es el balance de entonces, con los cierres sin confirmar)
//   DD total peor = capital − (balanceNow − L − P), contra ddTotalCapUSD
// Seguro si los dos quedan por debajo de su limite MENOS el margen (0,1 % del capital inicial)
import { calcPnl } from '../trading/pricing'
import { isFilled, isLongSide } from '../trading/orders'

export const MARGEN_PEOR_CASO = 0.001
// el control de las pruebas (orden 1-158): globalThis.__simMargenPeorCaso, una fraccion del capital, sustituye al margen
const margenDe = m => (Number.isFinite(m) ? m : Number.isFinite(globalThis.__simMargenPeorCaso) ? globalThis.__simMargenPeorCaso : MARGEN_PEOR_CASO)
const perdida = x => Math.max(0, -x)
const num = x => Number(x)

// Funcion pura. evaluacion: la del ultimo reto confirmado. cierres: [{ side, entry, sl, lots, pair, pnl, costes }];
// abiertas y pendientes: [{ side, entry, lots, pair, high, low, costes }] con el maximo y el minimo de SU vela.
// → { seguro, motivo, ddDiario, capDiario, ddTotal, capTotal, margenUSD }
export function peorCasoDeLaVela({ capital, evaluacion, cierres = [], abiertas = [], pendientes = [], margen }) {
  const no = motivo => ({ seguro: false, motivo })
  capital = num(capital)
  const ev = evaluacion || {}
  const B = num(ev.balanceNow), capDiaPct = num(ev.ddDailyCapPct), capTotal = num(ev.ddTotalCapUSD)
  if (!(capital > 0) || !Number.isFinite(B) || !(capDiaPct > 0) || !(capTotal > 0)) return no('sin reto confirmado')
  const ratio = capDiaPct / 100
  let L = 0
  for (const c of cierres) {
    const sl = num(c.sl)
    if (!(sl > 0)) return no('cierre sin SL')
    const enSl = calcPnl(c.side, num(c.entry), sl, num(c.lots), c.pair)
    const pnl = num(c.pnl)
    L += perdida((Number.isFinite(pnl) ? Math.min(pnl, enSl) : enSl) - (num(c.costes) || 0)) + 0.01
  }
  let F = 0
  for (const p of abiertas) {
    const peor = Math.min(calcPnl(p.side, num(p.entry), num(p.low), num(p.lots), p.pair), calcPnl(p.side, num(p.entry), num(p.high), num(p.lots), p.pair))
    if (!Number.isFinite(peor)) return no('posicion sin precio')
    F += peor - (num(p.costes) || 0)
  }
  for (const o of pendientes) {
    const largo = isLongSide(o.side), entry = num(o.entry)
    if (!isFilled({ isLong: largo, entry, high: num(o.high), low: num(o.low) })) continue
    const peor = largo ? calcPnl('BUY', entry, num(o.low), num(o.lots), o.pair) : calcPnl('SELL', entry, num(o.high), num(o.lots), o.pair)
    if (!Number.isFinite(peor)) return no('pendiente sin precio')
    F += peor - (num(o.costes) || 0)
  }
  const P = perdida(F)
  const inicioUltimo = num(ev.ddDailyCapUSD) / ratio
  const inicioDia = Number.isFinite(inicioUltimo) && inicioUltimo > 0 ? Math.min(inicioUltimo, B - L) : B - L
  const capDiario = ratio * inicioDia
  const ddDiario = (num(ev.ddDailyCurrentUSD) || 0) + L + P
  const ddTotal = Math.max(0, capital - (B - L - P))
  const margenUSD = margenDe(margen) * capital
  const seguro = ddDiario < capDiario - margenUSD && ddTotal < capTotal - margenUSD
  return { seguro, motivo: seguro ? null : 'cerca del limite', ddDiario, capDiario, ddTotal, capTotal, margenUSD }
}

// ── lo que el ultimo reto confirmado aun no cuenta, por sesion ─────────────────────────────────────────────────────────
// Cada cierre se apunta AL PEDIRLO (useTradingActions: closePosition y closePartial, con su precio de salida y su pnl, el
// mismo que guardara la fila). La relectura del reto (useChallengeFlow, refreshChallengeStatus) toma los apuntados al
// encolarse: van delante de ella en la cola, asi que cuando responde ya los cuenta y se quitan; los de despues siguen
const st = globalThis.__simPeorCaso ??= { s: {} }
const de = sid => st.s[sid] ??= { reto: null, sin: new Set() }
export function apuntaCierre(sid, c) { de(sid).sin.add(c); return c }
export const tomaCierres = sid => [...de(sid).sin]
export function retoLeido(sid, reto, tomados = []) {
  const s = de(sid)
  s.reto = reto
  for (const c of tomados) s.sin.delete(c)
}
export const retoConfirmado = sid => de(sid).reto
export const cierresSinReto = sid => [...de(sid).sin]
export function reiniciaPeorCaso() { st.s = {} }
