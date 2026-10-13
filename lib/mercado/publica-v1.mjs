// lib/mercado/publica-v1.mjs — subir a Storage lo que planifica el publicador
// del mercado v1 (etapa 2; diseño sim-004 p.7; S4-11: publicacion atomica del
// manifiesto despues de verificar todos sus trozos; si el publicador falla, el
// manifiesto anterior sigue valido).
//
// Bucket PRIVADO «mercado» (lo crea sql/mercado-001-bucket.sql; sin politicas:
// solo service_role). El almacen es un puerto (lee, sube, borra, lista): el
// script construye el real con supabase-js y las pruebas uno en memoria.
//   lee(ruta)                    → Buffer | null (no existe)
//   sube(ruta, bytes, { upsert }) → 'ok' | 'existe' (sin upsert y ya estaba); lanza si falla
//   borra(ruta)                  → void
//   lista(prefijo)               → [{ ruta, bytes }]
// Rutas:
//   v1/<PAR>/<AAAA>/<MM>/<DD>.<sha>.bin.br     los trozos (brotli; sha del binario)
//   v1/<PAR>/manifiestos/<version>.<huella>.json los manifiestos (inmutables)
//   v1/actual.json                              EL PUNTERO: el unico que se reescribe
//   v1/_cerrojo.json                            el cerrojo (subida sin upsert)
// Orden: cerrojo → trozos nuevos (sin upsert; si ya estan, se comprueba el sha)
// → relectura y sha de cada uno → manifiestos (sin upsert) → relectura → el
// PUNTERO, el ultimo → relectura → se suelta el cerrojo. Si la subida del
// puntero falla, el resultado es INCIERTO y el cerrojo se conserva: lo libera
// una persona despues de mirar el puntero (como _cerrojos/ de forex-data).
import { brotliCompressSync, brotliDecompressSync, constants } from 'zlib'
import { huella, decodifica } from '../motor/binario.mjs'
import * as MF from '../motor/manifiesto.mjs'

export const BUCKET = 'mercado'
export const PUNTERO = 'v1/actual.json'
export const CERROJO = 'v1/_cerrojo.json'
export const ESQUEMA_PUNTERO = 'mercado-puntero@1'
const PARES = new Set(['AUDCAD', 'AUDUSD', 'EURUSD', 'GBPJPY', 'GBPUSD', 'NZDUSD', 'USDCAD', 'USDCHF', 'USDJPY'])

export const rutaTrozo = (par, dia, sha) => `v1/${par}/${dia.slice(0, 4)}/${dia.slice(5, 7)}/${dia.slice(8, 10)}.${sha}.bin.br`
export const rutaManifiesto = m => `v1/${m.par}/manifiestos/${m.version}.${m.huella}.json`
export const comprime = buf => brotliCompressSync(buf, { params: { [constants.BROTLI_PARAM_QUALITY]: 11, [constants.BROTLI_PARAM_SIZE_HINT]: buf.length } })
export const descomprime = bytes => brotliDecompressSync(bytes)

export function validaPuntero(p) {
  if (p?.esquema !== ESQUEMA_PUNTERO || !p.pares || typeof p.pares !== 'object') throw new Error('puntero: no es un mercado-puntero@1')
  for (const [par, e] of Object.entries(p.pares)) {
    if (!PARES.has(par)) throw new Error(`puntero: par desconocido ${par}`)
    if (!/^v1\.[1-9]\d*$/.test(e?.version ?? '') || !/^[0-9a-f]{64}$/.test(e?.huella ?? '') || e.ruta !== rutaManifiesto({ par, version: e.version, huella: e.huella })) throw new Error(`puntero: entrada de ${par} no valida`)
  }
  return p
}
export async function leePuntero(almacen) {
  const b = await almacen.lee(PUNTERO)
  return b == null ? null : validaPuntero(JSON.parse(b.toString('utf8')))
}
// un manifiesto por su ruta: valido y con la huella esperada (si se da)
export async function leeManifiesto(almacen, ruta, huellaEsperada = null) {
  const b = await almacen.lee(ruta)
  if (b == null) throw new Error(`no existe ${ruta}`)
  const m = JSON.parse(b.toString('utf8'))
  MF.validaManifiesto(m)
  if (huellaEsperada && m.huella !== huellaEsperada) throw new Error(`${ruta}: huella distinta de la esperada`)
  if (rutaManifiesto(m) !== ruta) throw new Error(`${ruta}: no es la ruta de su contenido`)
  return m
}
export async function manifiestoVigente(almacen, par) {
  const p = await leePuntero(almacen)
  const e = p?.pares?.[par]
  return e ? leeManifiesto(almacen, e.ruta, e.huella) : null
}

// un trozo subido o que ya estaba: tiene que decodificar al sha de su nombre
async function compruebaTrozo(almacen, ruta, sha) {
  const b = await almacen.lee(ruta)
  if (b == null) throw new Error(`relectura: no existe ${ruta}`)
  let crudo
  try { crudo = descomprime(b) } catch { throw new Error(`relectura: ${ruta} no es brotli (contenido distinto)`) }
  if (huella(crudo) !== sha) throw new Error(`relectura: ${ruta} tiene otro sha (contenido distinto)`)
  decodifica(crudo)
}

// planes: los de planificaPar (todos los pares). → { estado: 'publicado' | 'nada', pares, puntero }; lanza si falla
export async function publica({ almacen, planes, dueno, ahora }) {
  const malos = planes.filter(p => p.estado === 'incidente')
  if (malos.length) throw new Error(`incidente: ${malos.map(p => `${p.par}: ${p.incidente}`).join(' · ')}`)
  const aPublicar = planes.filter(p => p.estado === 'publica')
  if (!aPublicar.length) return { estado: 'nada', pares: [] }
  const cerrojo = Buffer.from(JSON.stringify({ dueno, desde: ahora }))
  if (await almacen.sube(CERROJO, cerrojo, { upsert: false }) === 'existe') {
    const b = await almacen.lee(CERROJO)
    let quien = '?'
    try { const c = JSON.parse(b.toString('utf8')); quien = `${c.dueno} desde ${c.desde}` } catch { /* ilegible */ }
    throw new Error(`cerrojo puesto (${CERROJO}) por ${quien}: otro publicador en marcha o muerto; lo libera una persona`)
  }
  let incierto = false
  try {
    const anterior = await leePuntero(almacen)
    for (const p of aPublicar) {
      const vigente = anterior?.pares?.[p.par]?.huella ?? null
      if ((p.manifiesto.anterior ?? null) !== vigente) throw new Error(`el puntero cambio desde la planificacion de ${p.par} (vigente ${vigente ?? 'ninguno'}, el plan parte de ${p.manifiesto.anterior ?? 'ninguno'}): se vuelve a planificar`)
    }
    // trozos nuevos (y relectura de cada uno)
    for (const p of aPublicar) for (const t of p.nuevos) {
      const sha = huella(t.buffer), ruta = rutaTrozo(p.par, t.dia, sha)
      await almacen.sube(ruta, comprime(t.buffer), { upsert: false })
      await compruebaTrozo(almacen, ruta, sha)
    }
    // manifiestos (y relectura)
    for (const p of aPublicar) {
      const ruta = rutaManifiesto(p.manifiesto), texto = JSON.stringify(p.manifiesto)
      if (await almacen.sube(ruta, Buffer.from(texto), { upsert: false }) === 'existe') {
        const ya = await almacen.lee(ruta)
        if (ya?.toString('utf8') !== texto) throw new Error(`${ruta} ya existe con otro contenido`)
      }
      await leeManifiesto(almacen, ruta, p.manifiesto.huella)
    }
    // EL PUNTERO, el ultimo
    const puntero = { esquema: ESQUEMA_PUNTERO, pares: { ...(anterior?.pares ?? {}) } }
    for (const p of aPublicar) puntero.pares[p.par] = { version: p.manifiesto.version, huella: p.manifiesto.huella, ruta: rutaManifiesto(p.manifiesto) }
    puntero.pares = Object.fromEntries(Object.entries(puntero.pares).sort(([a], [b]) => (a < b ? -1 : 1)))
    const texto = JSON.stringify(puntero)
    try { await almacen.sube(PUNTERO, Buffer.from(texto), { upsert: true }) } catch (e) {
      incierto = true
      throw new Error(`incierto: la subida del puntero fallo (${e?.message}); el cerrojo se conserva: mirar ${PUNTERO} y liberarlo a mano`)
    }
    const releido = await almacen.lee(PUNTERO)
    if (releido?.toString('utf8') !== texto) { incierto = true; throw new Error(`incierto: el puntero releido no es el subido; el cerrojo se conserva`) }
    return { estado: 'publicado', pares: aPublicar.map(p => ({ par: p.par, version: p.manifiesto.version, huella: p.manifiesto.huella, nuevos: p.nuevos.length })), puntero }
  } finally {
    if (!incierto) {
      const b = await almacen.lee(CERROJO)
      if (b != null && b.equals(cerrojo)) await almacen.borra(CERROJO)
    }
  }
}
