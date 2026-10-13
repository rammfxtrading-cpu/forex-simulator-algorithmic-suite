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
// valorable, salvo que este ACEPTADO: { inicio: 'AAAA-MM-DDTHH:MMZ' (primer
// minuto ausente), minutos, motivo }, motivo: festivo | cambio_de_sesion |
// corte_del_proveedor.
//
// MANIFIESTO@2 (etapa 2; diseño sim-004 p.2–p.3, CTO 13-oct):
//   · los huecos aceptados van DENTRO de cada trozo (binario v2), en el trozo
//     del dia de su primer minuto ausente; el manifiesto los fija por el sha
//     del trozo y no lleva una segunda lista. creaManifiesto comprueba que cada
//     uno existe TAL CUAL en las velas (salvo el que empieza tras la ultima vela
//     del ultimo dia: falta la vela siguiente; lo comprueba la version siguiente).
//   · cortos_aceptados: [{ dia, velas (minimas), motivo }], los dias cortos que
//     valen (dias-aceptados del par y mercado reducido; p.2). cobertura() los usa.
//   · aceptaciones: { lineas, sha256 } | null, el ancla del fichero de
//     aceptaciones con el que se publico (p.6).
//   · anterior: la huella del manifiesto anterior del par, o null (la raiz).
//   · CONTINUACION (esContinuacion): solo añadir, con prefijo identico; una
//     adicion interior o un cambio de lo publicado es un incidente.
// Como antes, NO exige que todo hueco de mas de 15 este aceptado ni que la
// cobertura sea contigua: eso lo exige el publicador (p.4) y lo comprueba el
// verificador; la fuente detiene igual si llega un manifiesto asi.
import { createHash } from 'crypto'
import { decodifica, huella as huellaTrozo } from './binario.mjs'
import { instrumento } from './instrumentos.mjs'
import { UMBRAL_LABORABLE, diaConMercado, minutoCerrado } from '../mercado/calidad.mjs'

export const ESQUEMA = 'mercado-manifiesto@2'
const DIA = 86400
const ymd = s => new Date(s * 1000).toISOString().slice(0, 10)
const sha = texto => createHash('sha256').update(texto).digest('hex')
const contenido = m => JSON.stringify({ esquema: m.esquema, par: m.par, version: m.version, digitos: m.digitos, anterior: m.anterior, dias: m.dias, cerrados: m.cerrados, cortos_aceptados: m.cortos_aceptados, aceptaciones: m.aceptaciones })
export const huellaDe = m => sha(contenido(m))
const HEX64 = /^[0-9a-f]{64}$/
const esDia = d => /^\d{4}-\d{2}-\d{2}$/.test(d ?? '') && ymd(Date.parse(d + 'T00:00:00Z') / 1000) === d

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
function validaCortos(lista) {
  if (!Array.isArray(lista)) throw new RangeError('cortos_aceptados no es una lista')
  for (let k = 0; k < lista.length; k++) {
    const c = lista[k]
    if (!esDia(c?.dia)) throw new RangeError(`corto aceptado: dia no es AAAA-MM-DD (${c?.dia})`)
    if (!Number.isInteger(c.velas) || c.velas <= 0) throw new RangeError(`corto aceptado ${c.dia}: velas tiene que ser un entero positivo`)
    if (typeof c.motivo !== 'string' || !c.motivo.trim()) throw new RangeError(`corto aceptado ${c.dia}: falta el motivo`)
    if (k && !(lista[k - 1].dia < c.dia)) throw new RangeError(`corto aceptado ${c.dia}: desordenado o repetido`)
  }
}
function validaAncla(a) {
  if (a === null) return
  if (!Number.isInteger(a?.lineas) || a.lineas < 0 || !HEX64.test(a?.sha256 ?? '')) throw new RangeError('aceptaciones: { lineas (entero ≥ 0), sha256 } o null')
}

export function creaManifiesto({ par, version, trozos, cerrados = [], cortosAceptados = [], aceptaciones = null, anterior = null, ...resto }) {
  if ('huecosAceptados' in resto) throw new RangeError('huecosAceptados: en el manifiesto@2 los huecos aceptados van en el trozo (diseño p.1)')
  const { digitos } = instrumento(par)
  const vistos = new Set()
  const leidos = new Map()
  const dias = trozos.map(({ dia, buffer }) => {
    if (vistos.has(dia)) throw new RangeError(`dia repetido: ${dia}`)
    vistos.add(dia)
    const t = decodifica(buffer)
    leidos.set(dia, t)
    if (ymd(t.dia) !== dia) throw new RangeError(`el trozo de ${dia} trae en su cabecera el ${ymd(t.dia)}`)
    if (t.digitos !== digitos) throw new RangeError(`el trozo de ${dia} tiene ${t.digitos} digitos; ${par} tiene ${digitos}`)
    const h = huellaTrozo(buffer)
    const primera = t.velas.length ? t.velas[0].time : null, ultima = t.velas.length ? t.velas.at(-1).time : null
    return { dia, sha256: h, nombre: `${dia}.${h}.bin`, velas: t.velas.length, primera, ultima, availableAt: ultima == null ? null : ultima + 60 }
  }).sort((a, b) => (a.dia < b.dia ? -1 : 1))
  const cortos = [...cortosAceptados].map(c => ({ dia: c?.dia, velas: c?.velas, motivo: c?.motivo })).sort((a, b) => (a.dia < b.dia ? -1 : a.dia > b.dia ? 1 : 0))
  validaCortos(cortos)
  const porDia = new Map(dias.map(d => [d.dia, d]))
  for (const c of cortos) {
    if (!porDia.has(c.dia)) throw new RangeError(`corto aceptado ${c.dia}: no hay trozo de ese dia`)
    if (porDia.get(c.dia).velas < c.velas) throw new RangeError(`corto aceptado ${c.dia}: el trozo tiene ${porDia.get(c.dia).velas} velas, menos que ${c.velas}`)
  }
  validaAncla(aceptaciones)
  const m = { esquema: ESQUEMA, par, version: String(version), digitos, anterior: anterior ? anterior.huella : null, dias, cerrados: [...new Set(cerrados)].sort(), cortos_aceptados: cortos, aceptaciones: aceptaciones ? { lineas: aceptaciones.lineas, sha256: aceptaciones.sha256 } : null }
  // cada hueco de cada trozo tiene que existir TAL CUAL en las velas (inicio y minutos), salvo el que
  // empieza tras la ultima vela del ultimo dia (su vela siguiente aun no esta: p.1)
  const orden = [...leidos.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))
  const tiempos = orden.flatMap(([, t]) => t.velas.map(v => v.time))
  const reales = new Map(huecosInteriores(tiempos, new Set(m.cerrados)).map(h => [hhmmZ(h.ini), h.minutos]))
  const finDatos = tiempos.length ? tiempos.at(-1) + 60 : null
  for (const [d, t] of orden) for (const h of t.huecos) {
    if (Date.parse(h.inicio) / 1000 === finDatos && d === orden.at(-1)[0]) continue
    if (reales.get(h.inicio) !== h.minutos) throw new RangeError(`hueco aceptado ${h.inicio} de ${h.minutos} min (trozo ${d}): no existe asi en las velas de ${par}${reales.has(h.inicio) ? ` (alli es de ${reales.get(h.inicio)} min)` : ''}`)
  }
  const r = { ...m, huella: sha(contenido(m)) }
  if (anterior) { const inc = esContinuacion(anterior, r); if (inc) throw new RangeError(`no es continuacion de ${fija(anterior)}: ${inc}`) }
  return r
}

export function validaManifiesto(m) {
  if (m?.esquema !== ESQUEMA) throw new RangeError('no es un manifiesto de mercado')
  if ('huecos_aceptados' in m) throw new RangeError('manifiesto@2: los huecos aceptados van en los trozos, no en una lista')
  if (sha(contenido(m)) !== m.huella) throw new RangeError('la huella del manifiesto no coincide con su contenido')
  validaCortos(m.cortos_aceptados)
  validaAncla(m.aceptaciones)
  if (m.anterior !== null && !HEX64.test(m.anterior ?? '')) throw new RangeError('anterior: una huella o null')
  for (let i = 1; i < m.dias.length; i++) if (!(m.dias[i - 1].dia < m.dias[i].dia)) throw new RangeError('dias desordenados o repetidos')
  return true
}

// un trozo, solo si su sha256 es el del manifiesto. → { dia, velas, huecos }
export function leeTrozo(m, dia, buffer) {
  const e = m.dias.find(d => d.dia === dia)
  if (!e) throw new RangeError(`${m.par} ${m.version}: no hay trozo del ${dia}`)
  if (huellaTrozo(buffer) !== e.sha256) throw new RangeError(`${m.par} ${dia}: el trozo no es el del manifiesto (sha256 distinto)`)
  const t = decodifica(buffer)
  if (ymd(t.dia) !== dia || t.velas.length !== e.velas) throw new RangeError(`${m.par} ${dia}: trozo incoherente con el manifiesto`)
  return { dia, velas: t.velas, huecos: t.huecos }
}

// Dias con mercado (horario v2.1; sin los cerrados del manifiesto) en
// [desde, hasta] sin trozo o con menos velas que el umbral.
// → ['AAAA-MM-DD (sin trozo)' | 'AAAA-MM-DD (n/umbral)', ...]
export function cobertura(m, desde, hasta) {
  const cerrados = new Set(m.cerrados)
  const porDia = new Map(m.dias.map(d => [d.dia, d]))
  const cortos = new Map((m.cortos_aceptados ?? []).map(c => [c.dia, c.velas]))
  const faltan = []
  for (let t = Date.parse(desde + 'T00:00:00Z') / 1000; t <= Date.parse(hasta + 'T00:00:00Z') / 1000; t += DIA) {
    const d = ymd(t)
    if (!diaConMercado(d, cerrados)) continue
    const e = porDia.get(d)
    if (!e) { faltan.push(`${d} (sin trozo)`); continue }
    const umbral = UMBRAL_LABORABLE[new Date(t * 1000).getUTCDay()]
    // C6-04 (Astra, cierres-6; § 12.10): sin tabla de festivos; un 25-dic o un
    // 1-ene corto falta igual, salvo que el manifiesto lo declare cerrado
    if (umbral && e.velas < umbral && !(cortos.has(d) && e.velas >= cortos.get(d))) faltan.push(`${d} (${e.velas}/${umbral})`)
  }
  return faltan
}

// A26: la sesion fija par, version y huella; solo ese manifiesto le vale
export const fija = m => `${m.par}@${m.version}:${m.huella}`
export const coincide = (fijado, m) => fijado === fija(m)

// ── continuacion (decision 2 de h; S4-03; diseño p.3) ─────────────────────────
// ¿es «nuevo» una continuacion de «anterior»? → null, o el motivo del INCIDENTE.
// Prefijo identico (dias, y cerrados y cortos hasta la frontera), dias nuevos
// estrictamente despues de la frontera, y el ancla de aceptaciones que crece.
// La cadena (cada «anterior» es la huella del previo) la recorre el
// verificador eslabon a eslabon; aqui basta el prefijo, que es transitivo.
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b)
export const frontera = m => m.dias.at(-1)?.dia ?? null
export function esContinuacion(anterior, nuevo) {
  try { validaManifiesto(anterior); validaManifiesto(nuevo) } catch (e) { return `manifiesto no valido: ${e.message}` }
  if (nuevo.par !== anterior.par || nuevo.digitos !== anterior.digitos) return `otro par o escala (${anterior.par} → ${nuevo.par})`
  if (nuevo.huella === anterior.huella) return null
  const f = frontera(anterior)
  for (let i = 0; i < anterior.dias.length; i++) if (!igual(anterior.dias[i], nuevo.dias[i])) return `el dia ${anterior.dias[i].dia} ya publicado cambia o desaparece`
  const extra = nuevo.dias.slice(anterior.dias.length)
  if (f && extra.some(d => d.dia <= f)) return `adicion interior: ${extra.find(d => d.dia <= f).dia} no va despues de la frontera ${f}`
  const hasta = (l, k) => l.filter(x => f && k(x) <= f)
  if (!igual(hasta(anterior.cerrados, x => x), hasta(nuevo.cerrados, x => x))) return `los cerrados hasta la frontera ${f} cambian`
  if (!igual(hasta(anterior.cortos_aceptados, x => x.dia), hasta(nuevo.cortos_aceptados, x => x.dia))) return `los cortos aceptados hasta la frontera ${f} cambian`
  if (anterior.aceptaciones && !(nuevo.aceptaciones && nuevo.aceptaciones.lineas >= anterior.aceptaciones.lineas)) return 'el ancla de aceptaciones no crece (menos lineas o ninguna)'
  return null
}
