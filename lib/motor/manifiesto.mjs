// lib/motor/manifiesto.mjs — el manifiesto del mercado versionado
// (especificacion v2.1, § 7.3, § 12.10; A26). Puro; nada en uso lo importa.
//
// Un manifiesto por par y version: sus trozos diarios (lib/motor/binario.mjs)
// con sha256, velas, primera y ultima vela y availableAt (ultima + 60: cuando
// la ultima vela del dia ya esta completa), los dias que el mercado tiene
// CERRADOS (festivos: el manifiesto es la unica fuente, CTO 5-oct-2026) y su
// propia huella (sha256 del contenido canonico). La sesion fija «PAR@version:
// huella» y no usa otra; un trozo cuyo sha no coincide no se lee.
//
// HUECOS INTERIORES (P7-01; CTO 10-oct-2026; especificacion v2.4, § 13.1):
// un minuto ausente con el mercado abierto es un minuto sin negociacion (vela
// plana implicita). Un hueco de MAS de HUECO_MAXIMO (15) minutos seguidos no es
// valorable, salvo que el manifiesto lo declare ACEPTADO en huecos_aceptados:
// [{ inicio: 'AAAA-MM-DDTHH:MMZ' (primer minuto ausente), minutos, motivo }],
// motivo: festivo | cambio_de_sesion | corte_del_proveedor. La lista es
// explicita, se comprueba contra los trozos (cada hueco tiene que existir tal
// cual) y entra en la huella (otra lista, otra version fijada); vacia, el
// contenido canonico y la huella son los de siempre.
import { createHash } from 'crypto'
import { decodifica, huella as huellaTrozo } from './binario.mjs'
import { instrumento } from './instrumentos.mjs'
import { UMBRAL_LABORABLE, diaConMercado, minutoCerrado } from '../mercado/calidad.mjs'

export const ESQUEMA = 'mercado-manifiesto@1'
const DIA = 86400
const ymd = s => new Date(s * 1000).toISOString().slice(0, 10)
const sha = texto => createHash('sha256').update(texto).digest('hex')
const contenido = m => JSON.stringify({ esquema: m.esquema, par: m.par, version: m.version, digitos: m.digitos, dias: m.dias, cerrados: m.cerrados, ...(m.huecos_aceptados?.length ? { huecos_aceptados: m.huecos_aceptados } : {}) })

export const HUECO_MAXIMO = 15
export const MOTIVOS_HUECO = Object.freeze(['festivo', 'cambio_de_sesion', 'corte_del_proveedor'])
const hhmmZ = s => new Date(s * 1000).toISOString().slice(0, 16) + 'Z'
// ¿toca el hueco [ini, fin] (segundos, primer y ultimo minuto ausente) algun
// minuto con el mercado cerrado? Los cierres empiezan y acaban en hora entera
// UTC (17:00 de Nueva York) o en dias enteros: basta mirar los extremos y cada
// hora entera de dentro.
export function tocaCierre(ini, fin, cerrados = new Set()) {
  if (minutoCerrado(ini, cerrados) || minutoCerrado(fin, cerrados)) return true
  for (let t = Math.ceil(ini / 3600) * 3600; t <= fin; t += 3600) if (minutoCerrado(t, cerrados)) return true
  return false
}
// los huecos interiores entre tiempos de vela consecutivos (ordenados):
// → [{ ini, minutos }] con el mercado abierto en todo el hueco
export function huecosInteriores(tiempos, cerrados = new Set()) {
  const out = []
  for (let k = 1; k < tiempos.length; k++) {
    const a = tiempos[k - 1], b = tiempos[k], n = (b - a) / 60 - 1
    if (n > 0 && !tocaCierre(a + 60, b - 60, cerrados)) out.push({ ini: a + 60, minutos: n })
  }
  return out
}
function validaHuecos(lista) {
  if (!Array.isArray(lista)) throw new RangeError('huecos_aceptados no es una lista')
  const vistos = new Set()
  for (const h of lista) {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}Z$/.test(h?.inicio ?? '') || hhmmZ(Date.parse(h.inicio) / 1000) !== h.inicio) throw new RangeError(`hueco aceptado: inicio no es AAAA-MM-DDTHH:MMZ (${h?.inicio})`)
    if (!Number.isInteger(h.minutos) || h.minutos <= HUECO_MAXIMO) throw new RangeError(`hueco aceptado ${h.inicio}: minutos tiene que ser un entero mayor que ${HUECO_MAXIMO}`)
    if (!MOTIVOS_HUECO.includes(h.motivo)) throw new RangeError(`hueco aceptado ${h.inicio}: motivo no valido (${MOTIVOS_HUECO.join(', ')})`)
    if (vistos.has(h.inicio)) throw new RangeError(`hueco aceptado ${h.inicio}: repetido`)
    vistos.add(h.inicio)
  }
}

export function creaManifiesto({ par, version, trozos, cerrados = [], huecosAceptados = [] }) {
  const { digitos } = instrumento(par)
  const vistos = new Set()
  const dias = trozos.map(({ dia, buffer }) => {
    if (vistos.has(dia)) throw new RangeError(`dia repetido: ${dia}`)
    vistos.add(dia)
    const t = decodifica(buffer)
    if (ymd(t.dia) !== dia) throw new RangeError(`el trozo de ${dia} trae en su cabecera el ${ymd(t.dia)}`)
    if (t.digitos !== digitos) throw new RangeError(`el trozo de ${dia} tiene ${t.digitos} digitos; ${par} tiene ${digitos}`)
    const h = huellaTrozo(buffer)
    const primera = t.velas.length ? t.velas[0].time : null, ultima = t.velas.length ? t.velas.at(-1).time : null
    return { dia, sha256: h, nombre: `${dia}.${h}.bin`, velas: t.velas.length, primera, ultima, availableAt: ultima == null ? null : ultima + 60 }
  }).sort((a, b) => (a.dia < b.dia ? -1 : 1))
  const m = { esquema: ESQUEMA, par, version: String(version), digitos, dias, cerrados: [...new Set(cerrados)].sort() }
  validaHuecos(huecosAceptados)
  if (huecosAceptados.length) {
    // cada hueco aceptado tiene que existir TAL CUAL en los trozos (inicio y minutos)
    const tiempos = trozos.map(t => ({ dia: t.dia, velas: decodifica(t.buffer).velas })).sort((a, b) => (a.dia < b.dia ? -1 : 1)).flatMap(t => t.velas.map(v => v.time))
    const reales = new Map(huecosInteriores(tiempos, new Set(m.cerrados)).map(h => [hhmmZ(h.ini), h.minutos]))
    for (const h of huecosAceptados) if (reales.get(h.inicio) !== h.minutos) throw new RangeError(`hueco aceptado ${h.inicio} de ${h.minutos} min: no existe asi en los trozos de ${par}${reales.has(h.inicio) ? ` (alli es de ${reales.get(h.inicio)} min)` : ''}`)
    m.huecos_aceptados = [...huecosAceptados].map(h => ({ inicio: h.inicio, minutos: h.minutos, motivo: h.motivo })).sort((a, b) => (a.inicio < b.inicio ? -1 : 1))
  }
  return { ...m, huella: sha(contenido(m)) }
}

export function validaManifiesto(m) {
  if (m?.esquema !== ESQUEMA) throw new RangeError('no es un manifiesto de mercado')
  if (sha(contenido(m)) !== m.huella) throw new RangeError('la huella del manifiesto no coincide con su contenido')
  if (m.huecos_aceptados != null) validaHuecos(m.huecos_aceptados)
  for (let i = 1; i < m.dias.length; i++) if (!(m.dias[i - 1].dia < m.dias[i].dia)) throw new RangeError('dias desordenados o repetidos')
  return true
}

// un trozo, solo si su sha256 es el del manifiesto. → { dia, velas }
export function leeTrozo(m, dia, buffer) {
  const e = m.dias.find(d => d.dia === dia)
  if (!e) throw new RangeError(`${m.par} ${m.version}: no hay trozo del ${dia}`)
  if (huellaTrozo(buffer) !== e.sha256) throw new RangeError(`${m.par} ${dia}: el trozo no es el del manifiesto (sha256 distinto)`)
  const t = decodifica(buffer)
  if (ymd(t.dia) !== dia || t.velas.length !== e.velas) throw new RangeError(`${m.par} ${dia}: trozo incoherente con el manifiesto`)
  return { dia, velas: t.velas }
}

// Dias con mercado (horario v2.1; sin los cerrados del manifiesto) en
// [desde, hasta] sin trozo o con menos velas que el umbral.
// → ['AAAA-MM-DD (sin trozo)' | 'AAAA-MM-DD (n/umbral)', ...]
export function cobertura(m, desde, hasta) {
  const cerrados = new Set(m.cerrados)
  const porDia = new Map(m.dias.map(d => [d.dia, d]))
  const faltan = []
  for (let t = Date.parse(desde + 'T00:00:00Z') / 1000; t <= Date.parse(hasta + 'T00:00:00Z') / 1000; t += DIA) {
    const d = ymd(t)
    if (!diaConMercado(d, cerrados)) continue
    const e = porDia.get(d)
    if (!e) { faltan.push(`${d} (sin trozo)`); continue }
    const umbral = UMBRAL_LABORABLE[new Date(t * 1000).getUTCDay()]
    // C6-04 (Astra, cierres-6; § 12.10): sin tabla de festivos; un 25-dic o un
    // 1-ene corto falta igual, salvo que el manifiesto lo declare cerrado
    if (umbral && e.velas < umbral) faltan.push(`${d} (${e.velas}/${umbral})`)
  }
  return faltan
}

// A26: la sesion fija par, version y huella; solo ese manifiesto le vale
export const fija = m => `${m.par}@${m.version}:${m.huella}`
export const coincide = (fijado, m) => fijado === fija(m)
