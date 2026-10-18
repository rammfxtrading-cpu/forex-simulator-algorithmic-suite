// lib/mercado/aceptaciones.mjs — el fichero de ACEPTACIONES DE HUECOS del
// mercado v1 (etapa 2; CTO 13-oct, Q1; diseño sim-004 p.6).
//
// lib/mercado/huecos-aceptados.jsonl es de SOLO AÑADIR: una linea JSON por
// registro, cada una terminada en salto de linea.
//   · aceptacion  { tipo, par, inicio: 'AAAA-MM-DDTHH:MMZ' (primer minuto
//                 ausente), minutos (16..2.879), motivo (festivo |
//                 cambio_de_sesion | corte_del_proveedor), fecha (el dia en
//                 que el CTO la acepta), nota (el porque) }. Mientras no se
//                 publique, una linea posterior del mismo par e inicio la
//                 corrige (la ultima manda).
//   · publicacion { tipo, par, manifiesto (PAR@v1.k:huella), lineas, prefijo
//                 (sha256 de los primeros «lineas» renglones), trozos: [{
//                 inicio, dia, sha256 }] (el trozo resultante de cada
//                 aceptacion) }. Se añade DESPUES de publicar (el publicador la
//                 escribe en local con --anota; entra por commit).
//   · corto       { tipo, par, dia (un 25-dic o un 1-ene), velas (1..1.439:
//                 las que tiene, como minimo), motivo (MOTIVO_CORTO, la regla
//                 de Ramón del 6-oct), fecha, nota } (CTO 14-oct, decision 2):
//                 un festivo CORTO solo se publica si tiene su linea (el
//                 publicador lo retiene si no). Mientras no se publique, una
//                 linea posterior del mismo par y dia la corrige; despues, el
//                 manifiesto publicado fija sus cortos hasta la frontera y una
//                 correccion da incidente (esContinuacion).
// INMUTABLE TRAS PUBLICAR: borrar, editar o reordenar un renglon anterior a una
// publicacion cambia su prefijo y validaAceptaciones lo rechaza (la tanda lo
// comprueba sobre el fichero real); corregir una aceptacion publicada con otra
// linea, tambien. Y el manifiesto publicado lleva el ancla: el publicador y el
// verificador exigen que el fichero empiece por esos renglones (compruebaAncla).
// Puro: el texto se pasa.
import { createHash } from 'crypto'
import { errorPropio } from './errores.mjs'
import { FESTIVOS_MMDD } from './calidad.mjs'

const PARES = new Set(['AUDCAD', 'AUDUSD', 'EURUSD', 'GBPJPY', 'GBPUSD', 'NZDUSD', 'USDCAD', 'USDCHF', 'USDJPY'])
export const MOTIVOS = Object.freeze(['festivo', 'cambio_de_sesion', 'corte_del_proveedor'])
const CLAVES_AC = 'fecha,inicio,minutos,motivo,nota,par,tipo'
const CLAVES_PUB = 'lineas,manifiesto,par,prefijo,tipo,trozos'
const CLAVES_CORTO = 'dia,fecha,motivo,nota,par,tipo,velas'
export const MOTIVO_CORTO = 'mercado reducido (regla de Ramón del 6-oct)'
const CLAVES_TROZO = 'dia,inicio,sha256'
const HEX64 = /^[0-9a-f]{64}$/
const sha = t => createHash('sha256').update(t, 'utf8').digest('hex')
const claves = o => Object.keys(o).sort().join()
const esDia = d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d + 'T00:00:00Z')) && new Date(d + 'T00:00:00Z').toISOString().slice(0, 10) === d
const esInicio = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}Z$/.test(s) && !Number.isNaN(Date.parse(s)) && new Date(Date.parse(s)).toISOString().slice(0, 16) + 'Z' === s

// el texto → sus renglones (sin el salto final); '' → []
function renglones(texto) {
  if (typeof texto !== 'string') throw errorPropio('aceptaciones: el fichero no es texto')
  if (texto === '') return []
  if (!texto.endsWith('\n')) throw errorPropio('aceptaciones: el fichero no termina en salto de linea')
  return texto.slice(0, -1).split('\n')
}
// sha256 de los n primeros renglones, con sus saltos de linea
export function ancla(texto, n) {
  const r = renglones(texto)
  if (!Number.isInteger(n) || n < 0 || n > r.length) throw errorPropio(`aceptaciones: no hay ${n} renglones`)
  return sha(n ? r.slice(0, n).join('\n') + '\n' : '')
}

// → { lineas, aceptaciones: Map('PAR|inicio' → { …, linea }), publicaciones, publicadas: Map('PAR|inicio' → { linea, dia, sha256 }) }
export function validaAceptaciones(texto) {
  const r = renglones(texto)
  const aceptaciones = new Map(), publicaciones = [], publicadas = new Map(), cortos = new Map()
  const historia = []          // por renglon: la clave que define (para resolver «la ultima dentro de las n primeras»)
  r.forEach((txt, i) => {
    const n = i + 1, donde = `aceptaciones, renglon ${n}`
    if (!txt.trim()) throw errorPropio(`${donde}: vacio`)
    let o
    try { o = JSON.parse(txt) } catch { throw errorPropio(`${donde}: no es JSON`) }
    if (!o || typeof o !== 'object' || Array.isArray(o)) throw errorPropio(`${donde}: no es un objeto`)
    if (o.tipo === 'aceptacion') {
      if (claves(o) !== CLAVES_AC) throw errorPropio(`${donde}: claves distintas de ${CLAVES_AC}`)
      if (!PARES.has(o.par)) throw errorPropio(`${donde}: par desconocido`)
      if (!esInicio(o.inicio)) throw errorPropio(`${donde}: inicio no es AAAA-MM-DDTHH:MMZ`)
      if (!Number.isInteger(o.minutos) || o.minutos < 16 || o.minutos > 2879) throw errorPropio(`${donde}: minutos fuera de 16..2.879`)
      if (!MOTIVOS.includes(o.motivo)) throw errorPropio(`${donde}: motivo no valido (${MOTIVOS.join(', ')})`)
      if (!esDia(o.fecha)) throw errorPropio(`${donde}: fecha no es AAAA-MM-DD`)
      if (typeof o.nota !== 'string' || !o.nota.trim()) throw errorPropio(`${donde}: falta la nota`)
      const k = `${o.par}|${o.inicio}`
      if (publicadas.has(k)) throw errorPropio(`${donde}: ${k} ya esta publicada (renglon ${publicadas.get(k).linea}): no se puede corregir`)
      const rec = { par: o.par, inicio: o.inicio, minutos: o.minutos, motivo: o.motivo, fecha: o.fecha, nota: o.nota, linea: n }
      aceptaciones.set(k, rec)
      historia.push({ k, rec })
    } else if (o.tipo === 'publicacion') {
      if (claves(o) !== CLAVES_PUB) throw errorPropio(`${donde}: claves distintas de ${CLAVES_PUB}`)
      if (!PARES.has(o.par)) throw errorPropio(`${donde}: par desconocido`)
      if (typeof o.manifiesto !== 'string' || !new RegExp(`^${o.par}@v1\\.[1-9]\\d*:[0-9a-f]{64}$`).test(o.manifiesto)) throw errorPropio(`${donde}: manifiesto no es ${o.par}@v1.k:huella`)
      if (!Number.isInteger(o.lineas) || o.lineas < 0 || o.lineas > i) throw errorPropio(`${donde}: lineas tiene que estar entre 0 y ${i} (los renglones anteriores)`)
      if (o.prefijo !== ancla(texto, o.lineas)) throw errorPropio(`${donde}: el prefijo no cuadra: se ha borrado, editado o movido un renglon anterior a esta publicacion`)
      if (!Array.isArray(o.trozos)) throw errorPropio(`${donde}: trozos no es una lista`)
      const vigentes = new Map()
      for (const h of historia.slice(0, o.lineas)) if (h) vigentes.set(h.k, h.rec)
      for (const t of o.trozos) {
        if (!t || typeof t !== 'object' || claves(t) !== CLAVES_TROZO) throw errorPropio(`${donde}: un trozo sin ${CLAVES_TROZO}`)
        const k = `${o.par}|${t.inicio}`
        if (!vigentes.has(k)) throw errorPropio(`${donde}: ${k} no es una aceptacion de los ${o.lineas} renglones anteriores`)
        if (t.dia !== t.inicio.slice(0, 10)) throw errorPropio(`${donde}: ${k} va en el trozo de su primer minuto, no en el ${t.dia}`)
        if (!HEX64.test(t.sha256)) throw errorPropio(`${donde}: sha256 del trozo no valido`)
        if (!publicadas.has(k)) publicadas.set(k, { linea: vigentes.get(k).linea, dia: t.dia, sha256: t.sha256 })
      }
      publicaciones.push({ par: o.par, manifiesto: o.manifiesto, lineas: o.lineas, prefijo: o.prefijo, trozos: o.trozos.map(t => ({ ...t })), linea: n })
      historia.push(null)
    } else if (o.tipo === 'corto') {
      if (claves(o) !== CLAVES_CORTO) throw errorPropio(`${donde}: claves distintas de ${CLAVES_CORTO}`)
      if (!PARES.has(o.par)) throw errorPropio(`${donde}: par desconocido`)
      if (!esDia(o.dia) || !FESTIVOS_MMDD.has(o.dia.slice(5))) throw errorPropio(`${donde}: dia no es un 25-dic ni un 1-ene (AAAA-MM-DD)`)
      if (!Number.isInteger(o.velas) || o.velas < 1 || o.velas > 1439) throw errorPropio(`${donde}: velas fuera de 1..1.439`)
      if (o.motivo !== MOTIVO_CORTO) throw errorPropio(`${donde}: el motivo tiene que ser «${MOTIVO_CORTO}»`)
      if (!esDia(o.fecha)) throw errorPropio(`${donde}: fecha no es AAAA-MM-DD`)
      if (typeof o.nota !== 'string' || !o.nota.trim()) throw errorPropio(`${donde}: falta la nota`)
      cortos.set(`${o.par}|${o.dia}`, { par: o.par, dia: o.dia, velas: o.velas, motivo: o.motivo, fecha: o.fecha, nota: o.nota, linea: n })
      historia.push(null)
    } else throw errorPropio(`${donde}: tipo desconocido`)
  })
  return { lineas: r.length, aceptaciones, publicaciones, publicadas, cortos }
}
// los festivos cortos aceptados de un par: Map(dia → { …, linea })
export function cortosDe(v, par) {
  const m = new Map()
  for (const rec of v.cortos.values()) if (rec.par === par) m.set(rec.dia, rec)
  return m
}

// las aceptaciones vigentes de un par: Map(inicio → { …, linea })
export function aceptacionesDe(v, par) {
  const m = new Map()
  for (const [k, rec] of v.aceptaciones) if (rec.par === par) m.set(rec.inicio, rec)
  return m
}
// el ancla de un manifiesto publicado ({ lineas, sha256 }) tiene que ser el principio del fichero
export function compruebaAncla(texto, a) {
  if (a == null) return true
  const n = renglones(texto).length
  if (n < a.lineas) throw errorPropio(`aceptaciones: el manifiesto publicado se hizo con ${a.lineas} renglones y el fichero tiene ${n}: se han borrado aceptaciones publicadas`)
  if (ancla(texto, a.lineas) !== a.sha256) throw errorPropio(`aceptaciones: los ${a.lineas} primeros renglones no son los publicados: se han borrado, editado o movido`)
  return true
}
// añade un registro al final y valida el resultado → el texto nuevo
export function anota(texto, registro) {
  const nuevo = texto + JSON.stringify(registro) + '\n'
  validaAceptaciones(nuevo)
  return nuevo
}
