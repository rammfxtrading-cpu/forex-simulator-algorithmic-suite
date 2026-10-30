// LAS VELAS DEL GRAFICO EN MODO V1 (orden 1-179 (d) del CTO): del MISMO mercado v1 que valora el motor — el manifiesto y la
// version que fija la sesion —, por GET /api/sim/velas (lib/servidor/velas.mjs). Nunca /api/candles.
//   cargaVelasV1({ llama, sessionId, pair, dateFrom, dateTo }) → lo mismo que fetchSessionCandles (lib/sessionData.js):
//     { candles, replayTs, toTs, contextoIncompleto, datosHasta, tramoAbierto, diasIncompletos, mercado } | { error } | null
//   1. el rango publicado de la version fijada (primer y ultimo dia) y su identidad (PAR@version:huella);
//   2. las ventanas (≤ VENTANA_DIAS dias) del contexto previo y de la sesion, SOLO dentro de ese rango: el contexto que no
//      esta publicado se omite sin pedirlo y sin error; lo de la sesion despues del ultimo dia publicado, tambien (alli el
//      motor llega al fin de datos: «datos hasta …», como el tramo abierto de hoy);
//   3. cada ventana tiene que traer la MISMA identidad fijada; si no, error (nunca se mezclan dos versiones);
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
export async function cargaVelasV1({ llama: llamaSinPlazo, sessionId, pair, dateFrom, dateTo }) {
  const par = pair.replace('/', '')
  const llama = async (ruta, o) => { const r = await conPlazo(llamaSinPlazo(ruta, o), PLAZO_VELAS.ms); return r === VENCIDO ? { http: null, cuerpo: { motivo: 'sin_respuesta' } } : r }
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
  let k = 0, error = null
  const uno = async () => {
    while (k < tramos.length && !error) {
      const j = k++
      const [desde, hasta] = tramos[j]
      const r = await llama('/api/sim/velas', { metodo: 'GET', cuerpo: { session_id: sessionId, par, desde, hasta } })
      if (r?.http !== 200 || !r.cuerpo?.ok || !Array.isArray(r.cuerpo.velas)) { error ??= `Las velas de ${par} del ${desde} al ${hasta} no estan disponibles (HTTP ${r?.http ?? '—'}${motivoTexto(r?.cuerpo)}).`; return }
      if (r.cuerpo.fijado !== fijado) { error ??= `El mercado de ${par} ha cambiado de version mientras se cargaba (${fijado} → ${r.cuerpo.fijado}). Reintenta.`; return }
      respuestas[j] = r.cuerpo
    }
  }
  await Promise.all(Array.from({ length: Math.min(A_LA_VEZ, tramos.length) }, uno))
  if (error) return { error, problemas: [] }

  const candles = [], dias = [], faltanSesion = []
  for (let j = 0; j < tramos.length; j++) {
    const c = respuestas[j]
    dias.push(...c.dias)
    if (tramos[j][2] === 'sesion') faltanSesion.push(...c.faltan.map(f => f.dia))
    for (const [time, o, h, l, cl, v] of c.velas) if (time >= ctxTs && time <= toTs) candles.push({ time, open: o / escala, high: h / escala, low: l / escala, close: cl / escala, volume: v })
  }
  candles.sort((a, b) => a.time - b.time)
  if (!candles.some(c => c.time >= replayTs)) return null
  const ultimaVela = candles.at(-1).time
  const tramoAbierto = ultimo < diaFin
  return {
    candles, replayTs, toTs, contextoIncompleto: false,
    datosHasta: tramoAbierto ? ultimaVela : null, tramoAbierto,
    diasIncompletos: [...new Set(faltanSesion)].sort(),
    mercado: { fijado, primero, ultimo, dias },
  }
}
