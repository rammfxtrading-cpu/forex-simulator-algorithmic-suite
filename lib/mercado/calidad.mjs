// lib/mercado/calidad.mjs — el contrato de calidad de las velas M1 (auditoria D03,
// 4-oct-2026; bloque D, 5-oct-2026). Un solo sitio para lo que los escritores
// comprueban ANTES DE PUBLICAR (lib/mercado/ficheros.mjs, que usan
// scripts/actualizar-diario.js y scripts/restore-2026.js) y lo que el cliente
// comprueba ANTES DE OPERAR (crear el motor). Funciones puras: sin red, sin
// reloj implicito (el «hoy» se pasa). Es .mjs para que lo carguen tambien los
// scripts CommonJS de Node 20 (con import()).
//
// Velas: { time (segundos UTC, apertura del minuto), open, high, low, close }.
//
// Lo que se exige:
//   · forma: una lista; tiempos enteros, multiplos de 60, estrictamente
//     crecientes (orden y unicidad)
//   · OHLC: numeros finitos y positivos, low <= min(open, close),
//     high >= max(open, close)
//   · cobertura: cada dia laborable UTC del tramo con al menos el umbral de
//     velas; sabados y domingos no se exigen. Las EXCEPCIONES son por FECHA
//     (FESTIVOS_MMDD), nunca una cantidad tolerada de dias (Astra, O01, 5-oct).
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
    if (!Number.isInteger(v?.time) || v.time % 60 !== 0) { p.push(`vela ${i}: time no es un minuto entero (${v?.time})`); continue }
    if (v.time === previo) p.push(`vela ${i}: time ${v.time} repetido`)
    else if (v.time < previo) p.push(`vela ${i}: time ${v.time} desordenado`)
    previo = Math.max(previo, v.time)
    const { open: o, high: h, low: l, close: c } = v
    if (![o, h, l, c].every(x => Number.isFinite(x) && x > 0)) p.push(`vela ${i} (${v.time}): OHLC no numerico o no positivo`)
    else if (l > Math.min(o, c) || h < Math.max(o, c) || l > h) p.push(`vela ${i} (${v.time}): OHLC incoherente (o ${o} h ${h} l ${l} c ${c})`)
  }
  return p
}

// ANTES DE PUBLICAR un año (bloque D, punto 1). `guardadas` es lo releido justo
// antes de subir (null si el año no existe). Se exige:
//   · forma y OHLC de todo el año, y que todo caiga dentro del año;
//   · ningun dia con MENOS velas que en lo guardado (nunca se empeora un dia);
//   · cobertura de cada dia laborable desde el 1-ene:
//     - con `exigeHasta` (segundos; restore, que reconstruye el año entero):
//       hasta esa fecha y sin excepciones salvo los festivos por fecha;
//     - sin el (el actualizador, que solo añade dias): hasta el dia anterior al
//       ultimo con datos (el ultimo puede estar a medias: tramo abierto), y un
//       dia corto se admite tambien si YA estaba corto en lo guardado (no se
//       puede exigir que arregle lo que no ha tocado; se avisa).
// → { ok, problemas: [...], avisos: [...] }
export function validaParaPublicar(nuevas, guardadas, { anio, exigeHasta = null } = {}) {
  if (!Array.isArray(nuevas)) return { ok: false, problemas: ['no es una lista de velas'], avisos: [] }
  if (guardadas != null && !Array.isArray(guardadas)) return { ok: false, problemas: ['lo guardado no es una lista de velas: no se puede comparar'], avisos: [] }
  const problemas = problemasDeForma(nuevas), avisos = []
  if (!nuevas.length) problemas.push('el año no tiene velas')
  const desde = Date.UTC(anio, 0, 1) / 1000, finAnio = Date.UTC(anio + 1, 0, 1) / 1000
  const fuera = nuevas.filter(v => !(v?.time >= desde && v?.time < finAnio)).length
  if (fuera) problemas.push(`${fuera} vela(s) fuera de ${anio}`)
  const porDia = arr => { const m = new Map(); for (const v of arr || []) { const d = ymd(v.time); m.set(d, (m.get(d) || 0) + 1) } return m }
  const n = porDia(nuevas), g = porDia(guardadas)
  const peores = [...g].filter(([d, c]) => (n.get(d) || 0) < c).map(([d, c]) => `${d} (${c} → ${n.get(d) || 0})`)
  if (peores.length) problemas.push(`${peores.length} dia(s) con menos velas que lo guardado: ${peores.slice(0, 5).join(', ')}${peores.length > 5 ? '…' : ''}`)
  if (nuevas.length && !problemas.some(p => /time/.test(p))) {
    const ultima = nuevas[nuevas.length - 1].time
    const hasta = Math.min(exigeHasta ?? (Math.floor(ultima / DIA) * DIA - DIA), finAnio - DIA)
    if (hasta >= desde) {
      const cortosG = new Set(guardadas && exigeHasta == null ? diasCortos(guardadas, desde, hasta).map(x => x.slice(0, 10)) : [])
      const cortos = diasCortos(nuevas, desde, hasta)
      const nuevos = cortos.filter(x => !cortosG.has(x.slice(0, 10)))
      const viejos = cortos.filter(x => cortosG.has(x.slice(0, 10)))
      if (nuevos.length) problemas.push(`${nuevos.length} dia(s) laborable(s) incompleto(s): ${nuevos.slice(0, 5).join(', ')}${nuevos.length > 5 ? '…' : ''}`)
      if (viejos.length) avisos.push(`${viejos.length} dia(s) laborable(s) que ya estaban incompletos en lo guardado: ${viejos.slice(0, 5).join(', ')}${viejos.length > 5 ? '…' : ''}`)
    }
  }
  return { ok: problemas.length === 0, problemas, avisos }
}

// Bloque D, punto 4 (CTO, 5-oct-2026): TRAMO ACTUAL ABIERTO frente a HISTORICO
// CERRADO INCOMPLETO. La ventana abierta son los ultimos VENTANA_ABIERTA dias
// de mercado antes de hoy (el margen del actualizador, que publica a diario):
// ahi el dato puede faltar todavia. Antes de la ventana todo esta cerrado y
// tiene que estar completo, tambien el ultimo dia con datos.
export const VENTANA_ABIERTA = 2
const laborable = t => { const w = new Date(t * 1000).getUTCDay(); return w >= 1 && w <= 5 }
// → segundos del primer dia (00:00 UTC) de la ventana abierta
export function inicioVentanaAbierta(ahoraSeg) {
  let t = Math.floor(ahoraSeg / DIA) * DIA, n = 0
  while (n < VENTANA_ABIERTA) { t -= DIA; if (laborable(t)) n++ }
  return t
}
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
// 3-mar-2025 14:07 UTC
export function fechaCorta(seg) {
  const d = new Date(seg * 1000), dd = n => String(n).padStart(2, '0')
  return `${d.getUTCDate()}-${MESES[d.getUTCMonth()]}-${d.getUTCFullYear()} ${dd(d.getUTCHours())}:${dd(d.getUTCMinutes())} UTC`
}

// ANTES DE OPERAR una sesion [desde, hasta] (segundos), con el «ahora» pasado:
//   · forma y OHLC;
//   · cobertura de cada dia laborable CERRADO de la sesion: los anteriores a la
//     ventana abierta, incluido el ultimo con datos (Astra, 5-oct: una sola
//     vela del 3-mar en una sesion del 3 al 7 daba ok);
//   · en la ventana abierta no se exige nada: es el tramo actual.
// → { ok, problemas, diasCortos, datosHasta (segundos de la ultima vela del
//     tramo) | null, tramoAbierto (la sesion llega a la ventana abierta y los
//     datos acaban antes que ella), forma (los problemas de forma y OHLC: con
//     ellos la sesion no abre en ningun modo; bloque G, punto 5) }
export function validaSesionParaOperar(velas, desde, hasta, ahoraSeg) {
  const problemas = problemasDeForma(velas)
  const forma = [...problemas]
  const enTramo = velas.filter(v => v.time >= desde && v.time <= hasta)
  if (!enTramo.length) {
    problemas.push('no hay ninguna vela dentro de las fechas de la sesion')
    return { ok: false, problemas, diasCortos: [], datosHasta: null, tramoAbierto: false, forma }
  }
  const datosHasta = enTramo[enTramo.length - 1].time
  const ventana = inicioVentanaAbierta(ahoraSeg)
  const hastaCerrado = Math.min(hasta, ventana - 1)
  const cortos = hastaCerrado >= desde ? diasCortos(velas, desde, hastaCerrado) : []
  if (cortos.length) problemas.push(`${cortos.length} dia(s) laborable(s) incompleto(s) dentro de la sesion: ${cortos.slice(0, 5).join(', ')}${cortos.length > 5 ? '…' : ''} — datos hasta ${fechaCorta(datosHasta)}`)
  const tramoAbierto = hasta >= ventana && datosHasta < hasta
  return { ok: problemas.length === 0, problemas, diasCortos: cortos, datosHasta, tramoAbierto, forma }
}

// Los dias cortos ('AAAA-MM-DD (n/umbral)') para el alumno:
// '20-jul-2026 (900 de 1200 velas)', como mucho `max` y «y N mas».
export function listaDiasCortos(cortos, max = 8) {
  const uno = x => {
    const m = /^(\d{4})-(\d{2})-(\d{2}) \((\d+)\/(\d+)\)/.exec(x)
    if (!m) return x
    return `${Number(m[3])}-${MESES[Number(m[2]) - 1]}-${m[1]} (${m[4] === '0' ? 'sin velas' : `${m[4]} de ${m[5]} velas`})`
  }
  const vistos = cortos.slice(0, max).map(uno)
  return vistos.join(', ') + (cortos.length > max ? ` y ${cortos.length - max} mas` : '')
}

// ── Horario de mercado (CTO, 5-oct-2026; especificacion v2.1 § 12.10) ────────
// Igual para los 9 pares: abre el DOMINGO a las 17:00 y cierra el VIERNES a las
// 17:00, hora de America/New_York (con su horario de verano). Festivos: no hay
// tabla; un dia es «cierre esperado» solo si el manifiesto del mercado lo marca
// (cerrados: conjunto de 'AAAA-MM-DD', vacio hasta que exista el manifiesto).
const NY = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: '2-digit', hourCycle: 'h23' })
function abiertoEn(ms) {
  const p = Object.fromEntries(NY.formatToParts(new Date(ms)).map(x => [x.type, x.value]))
  const h = Number(p.hour)
  if (p.weekday === 'Sat') return false
  if (p.weekday === 'Fri' && h >= 17) return false
  if (p.weekday === 'Sun' && h < 17) return false
  return true
}
// ¿Tiene el dia UTC 'AAAA-MM-DD' algun minuto con el mercado abierto? (los
// cambios de 17:00 de Nueva York caen siempre en hora entera UTC)
export function diaConMercado(dia, cerrados = new Set()) {
  if (cerrados.has(dia)) return false
  const t0 = Date.parse(dia + 'T00:00:00Z')
  for (let h = 0; h < 24; h++) if (abiertoEn(t0 + h * 3600000)) return true
  return false
}

// ── Estado de un dia para el actualizador (bloque G, punto 7; Astra BF-01) ───
// CTO, 6-oct-2026: un dia con mercado previsto y respuesta vacia queda
// PENDIENTE y corta la cola; nunca cuenta como completo. Los domingos
// interiores con menos datos que los disponibles se vuelven a pedir.
//   · 'sin-mercado': ningun minuto abierto por horario (el sabado UTC).
//   · 'exento': FESTIVOS_MMDD (25-dic, 1-ene), como hasta ahora: no se exige
//     nada. ⚠️ Pendiente de decision del CTO: en la copia del bucket esos dias
//     SI tienen velas (ver revisiones/2026-10-04-cierres.md § 7f).
//   · laborable: completo con el umbral (UMBRAL_LABORABLE).
//   · domingo: completo si tiene velas en su ultima hora UTC (desde las
//     DOMINGO_HASTA_H). Medido el 6-oct en la copia local (27 ficheros): los
//     1.286 domingos interiores acaban a las 23:59 UTC, con 97 a 180 velas.
//     Vacio o cortado antes: pendiente.
export const DOMINGO_HASTA_H = 23
// velasDia: las del dia (en orden). → 'sin-mercado' | 'exento' | 'completo' | 'pendiente'
export function estadoDia(dia, velasDia) {
  if (!diaConMercado(dia)) return 'sin-mercado'
  if (FESTIVOS_MMDD.has(dia.slice(5))) return 'exento'
  const n = velasDia?.length || 0
  const umbral = UMBRAL_LABORABLE[new Date(dia + 'T00:00:00Z').getUTCDay()]
  if (umbral) return n >= umbral ? 'completo' : 'pendiente'
  return n && (velasDia[n - 1].time % DIA) >= DOMINGO_HASTA_H * 3600 ? 'completo' : 'pendiente'
}
