// lib/mercado/calidad.js — el contrato de calidad de las velas M1 (auditoria D03,
// 4-oct-2026). Un solo sitio para lo que /api/candles comprueba ANTES DE PUBLICAR
// (subir al bucket) y lo que el cliente comprueba ANTES DE OPERAR (crear el motor).
// Funciones puras: sin red, sin reloj implicito (el «hoy» se pasa).
//
// Velas: { time (segundos UTC, apertura del minuto), open, high, low, close }.
//
// Lo que se exige:
//   · orden y unicidad: tiempos estrictamente crecientes, sin repetidos
//   · OHLC: numeros finitos y positivos, low <= min(open, close),
//     high >= max(open, close)
//   · cobertura: cada dia laborable UTC del tramo pedido con al menos el umbral
//     de velas (el mismo de pages/api/candles.js); sabados y domingos no se
//     exigen; el 1-ene y el 25-dic tampoco (el mercado de divisas apenas
//     cotiza: son dias cortos de verdad)
//
// ⚠️ scripts/restore-2026.js (CommonJS, Node 20 en Actions) lleva su propia copia
//    del umbral y una tolerancia distinta (aprobada por el CTO para restaurar).

export const UMBRAL_LABORABLE = { 1: 1200, 2: 1200, 3: 1200, 4: 1200, 5: 1000 }
export const FESTIVOS_MMDD = new Set(['01-01', '12-25'])
const DIA = 86400
const ymd = t => new Date(t * 1000).toISOString().slice(0, 10)

// Dias laborables UTC en [desde, hasta] (segundos, ambos incluidos, por dia
// completo) con menos velas que el umbral. → ['AAAA-MM-DD (n/umbral)', ...]
export function diasCortos(velas, desde, hasta) {
  const porDia = new Map()
  for (const v of velas) {
    if (v.time < desde || v.time > hasta + DIA - 1) continue
    const d = ymd(v.time); porDia.set(d, (porDia.get(d) || 0) + 1)
  }
  const cortos = []
  for (let t = Math.floor(desde / DIA) * DIA; t <= hasta; t += DIA) {
    const umbral = UMBRAL_LABORABLE[new Date(t * 1000).getUTCDay()]
    if (!umbral) continue
    const d = ymd(t)
    if (FESTIVOS_MMDD.has(d.slice(5))) continue
    const n = porDia.get(d) || 0
    if (n < umbral) cortos.push(`${d} (${n}/${umbral})`)
  }
  return cortos
}

// Orden, unicidad y OHLC. → lista de problemas (vacia = bien), como mucho `max`.
export function problemasDeForma(velas, max = 5) {
  const p = []
  let previo = -Infinity
  for (let i = 0; i < velas.length && p.length < max; i++) {
    const v = velas[i]
    if (!Number.isFinite(v?.time)) { p.push(`vela ${i}: time no numerico`); continue }
    if (v.time === previo) p.push(`vela ${i}: time ${v.time} repetido`)
    else if (v.time < previo) p.push(`vela ${i}: time ${v.time} desordenado`)
    previo = Math.max(previo, v.time)
    const { open: o, high: h, low: l, close: c } = v
    if (![o, h, l, c].every(x => Number.isFinite(x) && x > 0)) p.push(`vela ${i} (${v.time}): OHLC no numerico o no positivo`)
    else if (l > Math.min(o, c) || h < Math.max(o, c) || l > h) p.push(`vela ${i} (${v.time}): OHLC incoherente (o ${o} h ${h} l ${l} c ${c})`)
  }
  return p
}

// ANTES DE PUBLICAR un año descargado: forma + cobertura del año entero, hasta
// el 31-dic o, si es el año en curso, hasta AYER (hoy no ha cerrado).
// → { ok, problemas: [...], diasCortos: [...] }
export function validaAnioParaPublicar(velas, anio, ahoraSeg) {
  const problemas = problemasDeForma(velas)
  const desde = Date.UTC(anio, 0, 1) / 1000
  const ayer = Math.floor(ahoraSeg / DIA) * DIA - DIA
  const hasta = Math.min(Date.UTC(anio, 11, 31) / 1000, ayer)
  const cortos = velas.length ? diasCortos(velas, desde, hasta) : ['sin velas']
  if (!velas.length) problemas.push('el año no tiene velas')
  if (cortos.length) problemas.push(`${cortos.length} dia(s) laborable(s) incompleto(s): ${cortos.slice(0, 5).join(', ')}${cortos.length > 5 ? '…' : ''}`)
  return { ok: problemas.length === 0, problemas, diasCortos: cortos }
}

// ANTES DE OPERAR una sesion: forma + cobertura del tramo de la sesion
// [desde, hasta] hasta el ultimo dia CON DATOS, sin exigir ese ultimo dia (puede
// estar a medias mientras el actualizador lo completa). Lo posterior al ultimo
// dato no es un hueco: el replay acaba ahi (se informa en datosHasta).
// → { ok, problemas, diasCortos, datosHasta (segundos de la ultima vela del tramo) | null }
export function validaSesionParaOperar(velas, desde, hasta) {
  const problemas = problemasDeForma(velas)
  const enTramo = velas.filter(v => v.time >= desde && v.time <= hasta)
  if (!enTramo.length) {
    problemas.push('no hay ninguna vela dentro de las fechas de la sesion')
    return { ok: false, problemas, diasCortos: [], datosHasta: null }
  }
  const ultima = enTramo[enTramo.length - 1].time
  const hastaCompleto = Math.floor(ultima / DIA) * DIA - DIA   // el dia anterior al ultimo con datos
  const cortos = hastaCompleto >= desde ? diasCortos(velas, desde, hastaCompleto) : []
  if (cortos.length) problemas.push(`${cortos.length} dia(s) laborable(s) incompleto(s) dentro de la sesion: ${cortos.slice(0, 5).join(', ')}${cortos.length > 5 ? '…' : ''}`)
  return { ok: problemas.length === 0, problemas, diasCortos: cortos, datosHasta: ultima }
}
