// LAS VELAS DEL GRAFICO EN MODO V1 (orden 1-179 (d) del CTO): del MISMO mercado v1 que valora el motor — el manifiesto y la
// version que fija la sesion —, por GET /api/sim/velas (lib/servidor/velas.mjs). Nunca /api/candles.
//   cargaVelasV1({ llama, sessionId, pair, dateFrom, dateTo }) → lo mismo que fetchSessionCandles (lib/sessionData.js):
//     { candles, replayTs, toTs, contextoIncompleto, datosHasta, tramoAbierto, diasIncompletos, mercado } | { error } | null
//   1. el rango publicado de la version fijada (primer y ultimo dia) y su identidad (PAR@version:huella);
//   2. las ventanas (≤ VENTANA_DIAS dias) del contexto previo y de la sesion, SOLO dentro de ese rango: el contexto que no
//      esta publicado se omite sin pedirlo y sin error; lo de la sesion despues del ultimo dia publicado, tambien (alli el
//      motor llega al fin de datos: «datos hasta …», como el tramo abierto de hoy);
//   3. cada ventana tiene que traer la MISMA identidad fijada; si no, error (nunca se mezclan dos versiones); orden 1-183 (3):
//      una ventana del CONTEXTO que falla (por lo que sea) se omite con el aviso del historico, como en v0;
//   4. los dias que el servidor no pudo leer o que el motor no valora (faltan) dentro de la sesion: el aviso de dias
//      incompletos de hoy. Fuera de la sesion (contexto) no se avisa.
// replayTs, toTs y el contexto de 180 dias, calculados COMO fetchSessionCandles (las mismas lineas), para que el motor del
// replay arranque igual que en v0.
import { conPlazo, VENCIDO } from '../plazo'
export const VENTANA_DIAS = 31          // = lib/servidor/velas.mjs
// el mismo plazo que las velas v0 (lib/sessionData.js PLAZO_VELAS, 60 s; el mismo objeto global): ninguna espera sin final
const PLAZO_VELAS = globalThis.__simPlazoVelas ??= { ms: 60000 }
const A_LA_VEZ = 3                       // ventanas pedidas a la vez
const DIA = 86400
const ymd = s => new Date(s * 1000).toISOString().slice(0, 10)
const D = d => Date.parse(d + 'T00:00:00Z') / 1000
const masDias = (d, n) => ymd(D(d) + n * DIA)

// [desde, hasta] (dias) en trozos de VENTANA_DIAS
export function ventanas(desde, hasta) {
  const out = []
  for (let d = desde; d <= hasta; d = masDias(d, VENTANA_DIAS)) { const h = masDias(d, VENTANA_DIAS - 1); out.push([d, h < hasta ? h : hasta]) }
  return out
}

const motivoTexto = c => (c?.motivo ? ` (${c.motivo})` : '')
const DIA_RE = /^\d{4}-\d{2}-\d{2}$/
const esObj = x => x != null && typeof x === 'object' && !Array.isArray(x)
// orden 1-185: una ventana de GET /api/sim/velas completa y usable: dias [{dia, sha256 (texto no vacio; no se recalcula aqui)}], faltan [{dia}], velas [[t,o,h,l,c,v]] con t
// entero en [desde, hasta + 1 dia), en orden estricto, y o, h, l, c, v finitos
export function ventanaValida(c, desde, hasta) {
  if (!esObj(c) || !Array.isArray(c.dias) || !Array.isArray(c.faltan) || !Array.isArray(c.velas)) return false
  if (!c.dias.every(d => esObj(d) && typeof d.dia === 'string' && DIA_RE.test(d.dia) && typeof d.sha256 === 'string' && d.sha256.length > 0)) return false
  if (!c.faltan.every(f => esObj(f) && typeof f.dia === 'string' && DIA_RE.test(f.dia))) return false
  const t0 = D(desde), t1 = D(hasta) + DIA
  return c.velas.every((v, i) => Array.isArray(v) && v.length >= 6 && Number.isSafeInteger(v[0]) && v[0] >= t0 && v[0] < t1 && v.slice(1, 6).every(Number.isFinite) && (i === 0 || c.velas[i - 1][0] < v[0]))
}
export async function cargaVelasV1({ llama: llamaSinPlazo, sessionId, pair, dateFrom, dateTo }) {
  const par = pair.replace('/', '')
  // orden 1-183 (3): el rechazo de transporte (la red), como el plazo, es una respuesta fallida de ESA peticion (nunca lanza)
  const llama = async (ruta, o) => {
    let r
    try { r = await conPlazo(Promise.resolve().then(() => llamaSinPlazo(ruta, o)), PLAZO_VELAS.ms) } catch (e) { return { http: null, cuerpo: { motivo: `red: ${e?.message ?? e}` } } }
    return r === VENCIDO ? { http: null, cuerpo: { motivo: 'sin_respuesta' } } : r
  }
  // como fetchSessionCandles (lib/sessionData.js)
  const replayTs = dateFrom ? Math.floor(new Date(dateFrom).getTime() / 1000) : Math.floor(new Date('2023-01-01').getTime() / 1000)
  const toTs = dateTo ? Math.floor(new Date(dateTo + 'T23:59:59').getTime() / 1000) : Math.floor(new Date('2023-12-31T23:59:59').getTime() / 1000)
  const ctxTs = replayTs - 6 * 30 * 24 * 60 * 60

  const r0 = await llama('/api/sim/velas', { metodo: 'GET', cuerpo: { session_id: sessionId, par } })
  if (r0?.http !== 200 || !r0.cuerpo?.ok) return { error: `No se ha podido leer el mercado de ${par} de esta sesion (HTTP ${r0?.http ?? '—'}${motivoTexto(r0?.cuerpo)}).`, problemas: [] }
  const { fijado, digitos, primer_dia: primero, ultimo_dia: ultimo } = r0.cuerpo
  if (!primero || !ultimo) return null
  const escala = 10 ** digitos

  const diaIni = dateFrom ?? ymd(replayTs), diaFin = dateTo ?? ymd(toTs), diaCtx = ymd(ctxTs)
  const tramos = []
  // contexto: [diaCtx, diaIni − 1] ∩ publicado
  const cIni = diaCtx > primero ? diaCtx : primero, cFin = masDias(diaIni, -1) < ultimo ? masDias(diaIni, -1) : ultimo
  if (cIni <= cFin) tramos.push(...ventanas(cIni, cFin).map(w => [...w, 'contexto']))
  // sesion: [diaIni, diaFin] ∩ publicado
  const sIni = diaIni > primero ? diaIni : primero, sFin = diaFin < ultimo ? diaFin : ultimo
  if (sIni <= sFin) tramos.push(...ventanas(sIni, sFin).map(w => [...w, 'sesion']))
  if (!tramos.some(t => t[2] === 'sesion')) return null

  const respuestas = new Array(tramos.length)
  // orden 1-183 (3), como v0 (lib/sessionData.js): una ventana de CONTEXTO que falla (cualquier forma: HTTP, red, plazo, sin
  // velas u otra identidad) se omite y se avisa; solo una de la SESION es el error del par (con su «Reintentar»)
  let k = 0, error = null
  const contextoQueFalta = []
  const uno = async () => {
    while (k < tramos.length && !error) {
      const j = k++
      const [desde, hasta, que] = tramos[j]
      const r = await llama('/api/sim/velas', { metodo: 'GET', cuerpo: { session_id: sessionId, par, desde, hasta } })
      let fallo = null
      if (r?.http !== 200 || !r.cuerpo?.ok || !Array.isArray(r.cuerpo.velas)) fallo = `Las velas de ${par} del ${desde} al ${hasta} no estan disponibles (HTTP ${r?.http ?? '—'}${motivoTexto(r?.cuerpo)}).`
      else if (r.cuerpo.fijado !== fijado) fallo = `El mercado de ${par} ha cambiado de version mientras se cargaba (${fijado} → ${r.cuerpo.fijado}). Reintenta.`
      // orden 1-185 (PSIMM4-01): la ventana ENTERA se verifica aqui, dentro de su frontera de fallo, antes de usarla: dias,
      // faltan y cada vela (tiempo entero dentro de la ventana, precios y volumen finitos). Asi un 200 incompleto o no
      // verificable del contexto es su aviso, nunca una excepcion despues (que el hook convertia en error del par)
      else if (!ventanaValida(r.cuerpo, desde, hasta)) fallo = `Las velas de ${par} del ${desde} al ${hasta} no son validas (respuesta incompleta).`
      if (fallo && que === 'contexto') { contextoQueFalta.push(`${desde} a ${hasta}`); continue }
      if (fallo) { error ??= fallo; return }
      respuestas[j] = r.cuerpo
    }
  }
  await Promise.all(Array.from({ length: Math.min(A_LA_VEZ, tramos.length) }, uno))
  if (error) return { error, problemas: [] }

  const candles = [], dias = [], faltanSesion = []
  for (let j = 0; j < tramos.length; j++) {
    const c = respuestas[j]
    if (!c) continue
    dias.push(...c.dias)
    if (tramos[j][2] === 'sesion') faltanSesion.push(...c.faltan.map(f => f.dia))
    for (const [time, o, h, l, cl, v] of c.velas) if (time >= ctxTs && time <= toTs) candles.push({ time, open: o / escala, high: h / escala, low: l / escala, close: cl / escala, volume: v })
  }
  candles.sort((a, b) => a.time - b.time)
  if (!candles.some(c => c.time >= replayTs)) return null
  const ultimaVela = candles.at(-1).time
  const tramoAbierto = ultimo < diaFin
  return {
    candles, replayTs, toTs, contextoIncompleto: contextoQueFalta.length > 0, contextoQueFalta: contextoQueFalta.sort(),
    datosHasta: tramoAbierto ? ultimaVela : null, tramoAbierto,
    diasIncompletos: [...new Set(faltanSesion)].sort(),
    mercado: { fijado, primero, ultimo, dias },
  }
}
