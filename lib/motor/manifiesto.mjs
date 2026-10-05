// lib/motor/manifiesto.mjs — el manifiesto del mercado versionado
// (especificacion v2.1, § 7.3, § 12.10; A26). Puro; nada en uso lo importa.
//
// Un manifiesto por par y version: sus trozos diarios (lib/motor/binario.mjs)
// con sha256, velas, primera y ultima vela y availableAt (ultima + 60: cuando
// la ultima vela del dia ya esta completa), los dias que el mercado tiene
// CERRADOS (festivos: el manifiesto es la unica fuente, CTO 5-oct-2026) y su
// propia huella (sha256 del contenido canonico). La sesion fija «PAR@version:
// huella» y no usa otra; un trozo cuyo sha no coincide no se lee.
import { createHash } from 'crypto'
import { decodifica, huella as huellaTrozo } from './binario.mjs'
import { instrumento } from './instrumentos.mjs'
import { UMBRAL_LABORABLE, FESTIVOS_MMDD, diaConMercado } from '../mercado/calidad.mjs'

export const ESQUEMA = 'mercado-manifiesto@1'
const DIA = 86400
const ymd = s => new Date(s * 1000).toISOString().slice(0, 10)
const sha = texto => createHash('sha256').update(texto).digest('hex')
const contenido = m => JSON.stringify({ esquema: m.esquema, par: m.par, version: m.version, digitos: m.digitos, dias: m.dias, cerrados: m.cerrados })

export function creaManifiesto({ par, version, trozos, cerrados = [] }) {
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
  return { ...m, huella: sha(contenido(m)) }
}

export function validaManifiesto(m) {
  if (m?.esquema !== ESQUEMA) throw new RangeError('no es un manifiesto de mercado')
  if (sha(contenido(m)) !== m.huella) throw new RangeError('la huella del manifiesto no coincide con su contenido')
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
    if (umbral && !FESTIVOS_MMDD.has(d.slice(5)) && e.velas < umbral) faltan.push(`${d} (${e.velas}/${umbral})`)
  }
  return faltan
}

// A26: la sesion fija par, version y huella; solo ese manifiesto le vale
export const fija = m => `${m.par}@${m.version}:${m.huella}`
export const coincide = (fijado, m) => fijado === fija(m)
