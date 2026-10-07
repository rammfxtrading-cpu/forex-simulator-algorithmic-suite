// lib/motor/reto.mjs — el reto FTMO 2-Step sobre UN instrumento (especificacion
// v2.1, § 5, § 3.5; A13, A14). Puro: no toca la base, ni la red, ni el reloj.
// Vive en lib/motor/ y no en lib/reglas/ como decia § 5 (CTO, 7-oct-2026).
// Multipar, fase 2 enlazada y persistencia: fuera.
//
// Envuelve el estado del motor:
//   · los dos limites del reto son los limites del motor (breach estricto,
//     liquidacion e irreversibilidad son del motor);
//   · reset_diario: evento del reloj a las 00:00 de Praga, aunque no llegue
//     vela, ANTES de cualquier vela con time ≥ esa medianoche (un evento
//     exactamente a medianoche va despues). Fija saldo_medianoche = saldo
//     cerrado, recalcula el limite diario y valora la equity al ultimo precio
//     (fin de semana incluido: mercado cerrado no es dato obsoleto, § 3.5);
//   · dias de trading: dias de Praga con algun fill (abrir), no con cierres;
//   · objetivo: saldo cerrado ≥ capital × (1 + objetivo), sin posiciones, con
//     4 dias y sin breach. Solo puede cumplirse en un cierre; se mira tras
//     cada vela y cada comando, asi que paso y salto dan lo mismo.
// Las velas se pasan de una en una al motor (avanzar hasta su time), para
// poder intercalar los resets y parar en la vela exacta del veredicto.
import * as M from './motor.mjs'

// ── reglas versionadas: una version nunca se edita; otra es otra constante ──
export const FTMO_2STEP = Object.freeze({
  version: 'ftmo-2step@2026-10-05',
  fuente: 'https://ftmo.com/en/trading-objectives/ (consultada el 5-oct-2026; especificacion v2.1, § 5)',
  objetivo: Object.freeze({ 1: 10, 2: 5 }),     // % del capital inicial, con posiciones cerradas
  perdida_diaria: 5,                             // % del capital inicial, restado al balance de las 00:00
  perdida_maxima: 10,                            // % del capital inicial, estatico
  dias_minimos: 4,
  zona: 'Europe/Prague',
  citas: Object.freeze({
    objetivo: '«The Profit Target is calculated as a percentage of your Initial Simulated Capital: 10% for the FTMO Challenge … 5% for the Verification»',
    perdida_diaria: '«The Maximum Daily Loss Limit is recalculated daily at 00:00 CE(S)T as the difference between: the account balance recorded at 00:00 CE(S)T of the current day and the Maximum Daily Loss Amount, which is 5% of the Initial Simulated Capital.»',
    equity: '«Balance + Open Positions P/L ± Swaps – Commissions»',
    perdida_maxima: '«The Maximum Loss rule establishes a static limit (the Maximum Loss Limit) below which your account equity cannot drop … the Initial Simulated Capital and the Maximum Loss Amount, which is 10% of the Initial Simulated Capital.»',
    dias: '«at least 4 Trading Days. A Trading Day is defined as any day – measured from 00:00:00 to 23:59:59 CE(S)T – during which at least one position is opened.»',
  }),
})
export const ESQUEMA = 'reto@1'

// ── calendario de Praga ─────────────────────────────────────────────────────
// Regla de la UE (Directiva 2000/84/CE): horario de verano desde el ultimo
// domingo de marzo a la 01:00 UTC hasta el ultimo domingo de octubre a la
// 01:00 UTC; CET = UTC+1, CEST = UTC+2. Escrita aqui y no con Intl para no
// depender de la tzdata del runtime (las pruebas la contrastan con Intl).
const DIA = 86400
const ultimoDomingo = (anio, mes) => { const d = new Date(Date.UTC(anio, mes, 0)); return Date.UTC(anio, mes - 1, d.getUTCDate() - d.getUTCDay()) / 1000 }
function desfase(t) {
  const anio = new Date(t * 1000).getUTCFullYear()
  return t >= ultimoDomingo(anio, 3) + 3600 && t < ultimoDomingo(anio, 10) + 3600 ? 7200 : 3600
}
// 00:00 de Praga del dia local que empieza en diaLocal (segundos, 00:00 «UTC» de esa fecha)
function medianocheDe(diaLocal) {
  const m = diaLocal - 3600
  return desfase(m) === 7200 ? diaLocal - 7200 : m      // los cambios son a la 01:00 UTC: nunca entre 22:00 y 23:00
}
const diaLocalDe = t => Math.floor((t + desfase(t)) / DIA) * DIA
export const diaPraga = t => new Date(diaLocalDe(t) * 1000).toISOString().slice(0, 10)
export const medianocheAnterior = t => medianocheDe(diaLocalDe(t))           // ≤ t
export const medianocheSiguiente = t => medianocheDe(diaLocalDe(t) + DIA)    // > t

// ── estado ─────────────────────────────────────────────────────────────────
const pct = (x, p) => (x * BigInt(p)) / 100n
function conLimites(motor, saldoMedianoche_µ, reglas) {
  const cap = motor.capital_inicial_µ
  const diaria = { regla: 'perdida_diaria', limite_µ: saldoMedianoche_µ - pct(cap, reglas.perdida_diaria) }
  const maxima = { regla: 'perdida_maxima', limite_µ: cap - pct(cap, reglas.perdida_maxima) }
  // si una equity rompe los dos a la vez (un salto), cuenta el mas alto: es el
  // que se cruza primero bajando; a igualdad, la diaria
  return { ...motor, limites: maxima.limite_µ > diaria.limite_µ ? [maxima, diaria] : [diaria, maxima] }
}

export function creaReto({ motor, fase = 1, inicio, reglas = FTMO_2STEP }) {
  if (reglas !== FTMO_2STEP) throw new RangeError(`reglas desconocidas: ${reglas?.version}`)
  if (fase !== 1 && fase !== 2) throw new RangeError(`fase no valida: ${fase}`)
  if (!Number.isInteger(inicio) || inicio % 60 !== 0) throw new RangeError(`inicio no valido: ${inicio}`)
  if (motor.reloj.cursor != null || motor.posiciones.length || motor.ordenes.length || motor.limites.length) throw new RangeError('el reto empieza con un motor nuevo, sin limites propios')
  const cap = motor.capital_inicial_µ
  if (cap <= 0n || cap % 100n !== 0n) throw new RangeError('capital: los porcentajes tienen que ser exactos en µUSD')
  return {
    esquema: ESQUEMA,
    reglas: reglas.version,
    fase,
    inicio,
    capital_inicial_µ: cap,
    objetivo_µ: cap + pct(cap, reglas.objetivo[fase]),
    saldo_medianoche_µ: motor.saldo_µ,
    ultimo_reset: medianocheAnterior(inicio),     // la medianoche del dia de inicio no se emite: es el arranque
    dias_con_apertura: [],
    estado: 'en_curso',                            // en_curso | breach | superada
    breach: null,
    superada: null,
    motor: conLimites(motor, motor.saldo_µ, reglas),
  }
}
export const serializaReto = M.serializa
export const deserializaReto = M.deserializa

// ── lo que pasa en el reto con los eventos del motor ────────────────────────
const momento = en => en.t ?? en.vela
function absorbe(r, ev) {
  for (const x of ev) {
    if (x.tipo !== 'fill') continue
    const d = diaPraga(momento(x.en))
    if (!r.dias_con_apertura.includes(d)) r.dias_con_apertura = [...r.dias_con_apertura, d].sort()
  }
  if (r.motor.estado === 'breach') { r.estado = 'breach'; r.breach = r.motor.breach; return [] }
  const ultimoCierre = ev.findLast(x => x.tipo === 'cierre')
  if (!ultimoCierre || r.motor.posiciones.length || r.motor.saldo_µ < r.objetivo_µ || r.dias_con_apertura.length < FTMO_2STEP.dias_minimos) return []
  r.estado = 'superada'
  r.superada = { saldo_µ: r.motor.saldo_µ, dias: r.dias_con_apertura.length, en: ultimoCierre.en }
  return [{ tipo: 'fase_superada', fase: r.fase, saldo_µ: r.motor.saldo_µ, objetivo_µ: r.objetivo_µ, dias: r.dias_con_apertura.length, en: ultimoCierre.en }]
}

// los resets con medianoche ≤ hasta todavia no emitidos; para si hay breach
function resets(r, hasta, ev) {
  for (let m = medianocheSiguiente(r.ultimo_reset); m <= hasta && r.estado === 'en_curso'; m = medianocheSiguiente(m)) {
    const mo = r.motor
    r.ultimo_reset = m
    r.saldo_medianoche_µ = mo.saldo_µ
    r.motor = conLimites(mo, mo.saldo_µ, FTMO_2STEP)
    const bid = mo.cotizacion?.bid ?? null
    ev.push({ tipo: 'reset_diario', dia: diaPraga(m), saldo_medianoche_µ: mo.saldo_µ, limite_diario_µ: r.motor.limites.find(l => l.regla === 'perdida_diaria').limite_µ, equity_µ: bid == null ? mo.saldo_µ : M.equity_µ(mo, bid), precio: bid, en: { t: m } })
    const x = M.evaluaLimites(r.motor, { t: m })
    r.motor = x.estado
    ev.push(...x.eventos)
    ev.push(...absorbe(r, x.eventos))
  }
}

// avanzar hasta «hasta» con las velas del instrumento (ordenadas; puede
// acabar en el centinela de fuente.mjs). → { reto, eventos }
export function avanzaReto(reto, hasta, velas) {
  if (reto.estado !== 'en_curso') return { reto, eventos: [] }
  const r = structuredClone(reto)
  const ev = []
  const desde = r.motor.reloj.cursor ?? r.inicio - 60
  let i = 0
  while (i < velas.length && velas[i].time <= desde) i++
  for (; i < velas.length && velas[i].time <= hasta && r.estado === 'en_curso'; i++) {
    resets(r, velas[i].time, ev)
    if (r.estado !== 'en_curso') break
    // la vela sola, con la siguiente detras para que fin_de_datos salga solo en la ultima
    const x = M.aplica(r.motor, { tipo: 'avanzar', hasta: velas[i].time }, velas.slice(i, i + 2))
    r.motor = x.estado
    ev.push(...x.eventos)
    ev.push(...absorbe(r, x.eventos))
  }
  if (r.estado === 'en_curso') resets(r, hasta, ev)
  return { reto: r, eventos: ev }
}

// un comando del alumno, a la hora del motor (cursor + 60). Antes, los resets
// que tocan a esa hora o antes; una hora anterior a un reset ya emitido iria
// hacia atras en el tiempo: se rechaza. → { reto, eventos, resultado }
export function aplicaReto(reto, comando) {
  if (reto.estado !== 'en_curso') return { reto, eventos: [], resultado: { rechazado: 'reto_terminado' } }
  const cursor = reto.motor.reloj.cursor
  if (cursor == null) return { reto, eventos: [], resultado: { rechazado: 'sin_cotizacion' } }
  const t = cursor + 60
  if (t < reto.ultimo_reset) return { reto, eventos: [], resultado: { rechazado: 'reset_posterior', ultimo_reset: reto.ultimo_reset, hora: t } }
  const r = structuredClone(reto)
  const ev = []
  resets(r, t, ev)
  if (r.estado !== 'en_curso') return { reto: r, eventos: ev, resultado: { rechazado: 'sesion_en_breach' } }
  const x = M.aplica(r.motor, comando)
  if (x.resultado !== 'aceptado') return ev.length ? { reto: r, eventos: ev, resultado: x.resultado } : { reto, eventos: [], resultado: x.resultado }
  r.motor = x.estado
  ev.push(...x.eventos)
  ev.push(...absorbe(r, x.eventos))
  return { reto: r, eventos: ev, resultado: 'aceptado' }
}
