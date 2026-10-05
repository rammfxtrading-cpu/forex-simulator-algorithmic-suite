// lib/mercado/ficheros.mjs — los ficheros del bucket forex-data: como se leen y
// el UNICO camino para publicarlos (bloque D, punto 1; CTO, 5-oct-2026).
// Lo usan /api/candles (solo lectura) y los dos unicos escritores:
// scripts/actualizar-diario.js y scripts/restore-2026.js (con import(): es
// .mjs para que lo cargue Node 20 desde CommonJS). El cliente `sb` se pasa.
//
// FORMATO (compresion, CTO 5-oct): un año esta como {PAR}/M1/{AÑO}.json.gz
// (gzip, el formato nuevo) o {PAR}/M1/{AÑO}.json (el de siempre).
//   Lectura: el .json.gz si existe; si no existe (404 real), el .json. Un
//   error que no es 404 en el .json.gz es «no se pudo leer»: no se cae al
//   .json, que puede ser una version vieja. Se descomprime por los bytes
//   magicos de gzip, no por la extension.
//   Escritura: solo .json.gz. El .json no se toca aqui (borrarlo es un paso de
//   la migracion).
//
// PUBLICACION (publicarAnio):
//   1. cerrojo por par y año: _cerrojos/{PAR}_{AÑO}.json creado con upload SIN
//      upsert (Storage responde 409 si ya existe: es la unica operacion
//      atomica que ofrece storage-js 2.102, que no tiene escritura
//      condicional). Sin el, «releer justo antes» y «verificar despues» dejan
//      una ventana: B relee antes de que A suba y sube despues. Caduca a los
//      CADUCA_MS (un escritor que murio con el cerrojo no bloquea para siempre).
//   2. RELEE lo vigente justo antes de subir; si no se puede leer, no publica.
//   3. compone sobre lo releido (componer(guardadas)); si no cambia nada, no
//      sube.
//   4. valida (lib/mercado/calidad.mjs validaParaPublicar): forma, OHLC,
//      unicidad, cobertura por fecha y NINGUN dia con menos velas que lo
//      releido.
//   5. sube el .json.gz y 6. VERIFICA: relee y compara la huella (sha256 del
//      JSON) con lo subido.
//   7. suelta el cerrojo (siempre; solo si sigue siendo suyo).
// Limites: excluye a los escritores que pasan por aqui. Quien escriba en el
// bucket por otra via (el panel de Supabase, codigo viejo) no respeta el
// cerrojo; la verificacion del paso 6 detecta si pisa justo despues de subir,
// no antes ni mas tarde.
import { gzipSync, gunzipSync } from 'zlib'
import { createHash } from 'crypto'
import { validaParaPublicar } from './calidad.mjs'

export const BUCKET = 'forex-data'
export const CADUCA_MS = 10 * 60 * 1000
const INTENTOS_CERROJO = 30

export const rutasAnio = (pair, year) => {
  const json = `${String(pair).toUpperCase().replace('/', '')}/M1/${year}.json`
  return { gz: json + '.gz', json }
}
export const rutaCerrojo = (pair, year) => `_cerrojos/${String(pair).toUpperCase().replace('/', '')}_${year}.json`
const esGzip = b => b.length >= 2 && b[0] === 0x1f && b[1] === 0x8b
export const noExiste = e => String(e?.statusCode) === '404' || e?.status === 404
const motivo = e => e?.message || String(e)
export const huella = velas => createHash('sha256').update(JSON.stringify(velas)).digest('hex')
export const empaqueta = velas => gzipSync(Buffer.from(JSON.stringify(velas), 'utf8'))
const espera = ms => new Promise(r => setTimeout(r, ms))

// Una ruta concreta. → { estado: 'ok', velas } | { estado: 'no-existe' } | { estado: 'error', motivo }
export async function leerRuta(sb, ruta) {
  const { data, error } = await sb.storage.from(BUCKET).download(ruta)
  if (error) return noExiste(error) ? { estado: 'no-existe' } : { estado: 'error', motivo: motivo(error) }
  try {
    let b = Buffer.from(await data.arrayBuffer())
    if (esGzip(b)) b = gunzipSync(b)
    const velas = JSON.parse(b.toString('utf8'))
    return Array.isArray(velas) ? { estado: 'ok', velas } : { estado: 'error', motivo: 'el fichero no es una lista de velas' }
  } catch (e) {
    return { estado: 'error', motivo: 'fichero ilegible: ' + e.message }
  }
}

// Lo vigente del año: el .json.gz o, si no existe, el .json.
// → { estado: 'ok', velas, ruta } | { estado: 'no-existe' } | { estado: 'error', ruta, motivo }
export async function leerVigente(sb, pair, year) {
  const r = rutasAnio(pair, year)
  for (const ruta of [r.gz, r.json]) {
    const x = await leerRuta(sb, ruta)
    if (x.estado !== 'no-existe') return { ...x, ruta }
  }
  return { estado: 'no-existe' }
}

// La version (etag) de lo vigente, sin descargarlo.
// → { estado: 'ok', ruta, version } | { estado: 'no-existe' } | { estado: 'error', motivo }
export async function versionVigente(sb, pair, year) {
  const r = rutasAnio(pair, year)
  for (const ruta of [r.gz, r.json]) {
    const { data, error } = await sb.storage.from(BUCKET).info(ruta)
    if (error) {
      if (noExiste(error)) continue
      return { estado: 'error', motivo: motivo(error) }
    }
    return { estado: 'ok', ruta, version: data?.etag ?? data?.version ?? data?.lastModified ?? null }
  }
  return { estado: 'no-existe' }
}

// ── Cerrojo ──────────────────────────────────────────────────────────────────
async function tomaCerrojo(sb, pair, year, dueno, ahoraMs, esperaMs, intentos) {
  const ruta = rutaCerrojo(pair, year)
  const ficha = JSON.stringify({ dueno, desde: new Date(ahoraMs()).toISOString(), caduca: ahoraMs() + CADUCA_MS })
  for (let i = 0; i < intentos; i++) {
    const { error } = await sb.storage.from(BUCKET).upload(ruta, ficha, { upsert: false, contentType: 'application/json' })
    if (!error) return { ok: true }
    if (String(error.statusCode) !== '409') return { ok: false, motivo: 'no se pudo crear el cerrojo: ' + motivo(error) }
    const otro = await sb.storage.from(BUCKET).download(ruta)
    let caduca = null
    if (!otro.error) { try { caduca = JSON.parse(await otro.data.text()).caduca } catch { caduca = null } }
    if (Number.isFinite(caduca) && caduca < ahoraMs()) {
      // caducado: un escritor murio con el. Se retira y se reintenta.
      await sb.storage.from(BUCKET).remove([ruta])
      continue
    }
    await espera(esperaMs)
  }
  return { ok: false, motivo: `otro escritor tiene el cerrojo ${ruta}` }
}
async function sueltaCerrojo(sb, pair, year, dueno) {
  const ruta = rutaCerrojo(pair, year)
  const { data, error } = await sb.storage.from(BUCKET).download(ruta)
  if (error) return
  try { if (JSON.parse(await data.text()).dueno !== dueno) return } catch { return }
  await sb.storage.from(BUCKET).remove([ruta])
}

// ── Publicacion ──────────────────────────────────────────────────────────────
// componer(guardadas | null) → velas a publicar | null (nada que publicar).
// → { estado: 'publicado' | 'sin-cambios' | 'rechazado' | 'ocupado' | 'error',
//     ruta, velas (n), problemas: [...], avisos: [...], bytes }
export async function publicarAnio(sb, { pair, year, componer, exigeHasta = null, dueno = 'escritor', ahoraMs = () => Date.now(), esperaMs = 2000, intentosCerrojo = INTENTOS_CERROJO }) {
  const ruta = rutasAnio(pair, year).gz
  const anio = Number(year)
  const yo = `${dueno}:${Math.random().toString(36).slice(2, 10)}`
  const cerrojo = await tomaCerrojo(sb, pair, anio, yo, typeof ahoraMs === 'function' ? ahoraMs : () => ahoraMs, esperaMs, intentosCerrojo)
  if (!cerrojo.ok) return { estado: 'ocupado', ruta, problemas: [cerrojo.motivo], avisos: [] }
  try {
    const leido = await leerVigente(sb, pair, anio)
    if (leido.estado === 'error') return { estado: 'error', ruta, problemas: [`no se pudo releer ${leido.ruta}: ${leido.motivo}`], avisos: [] }
    const guardadas = leido.estado === 'ok' ? leido.velas : null
    const nuevas = await componer(guardadas)
    if (nuevas == null || (guardadas && huella(nuevas) === huella(guardadas))) return { estado: 'sin-cambios', ruta, velas: guardadas?.length ?? 0, problemas: [], avisos: [] }
    const v = validaParaPublicar(nuevas, guardadas, { anio, exigeHasta })
    if (!v.ok) return { estado: 'rechazado', ruta, velas: nuevas.length, problemas: v.problemas, avisos: v.avisos }
    const cuerpo = empaqueta(nuevas)
    const up = await sb.storage.from(BUCKET).upload(ruta, cuerpo, { upsert: true, contentType: 'application/gzip' })
    if (up.error) return { estado: 'error', ruta, problemas: [`fallo al subir: ${motivo(up.error)}`], avisos: v.avisos }
    const despues = await leerVigente(sb, pair, anio)
    if (despues.estado !== 'ok' || despues.ruta !== ruta || huella(despues.velas) !== huella(nuevas)) {
      const visto = despues.estado === 'ok' ? `${despues.ruta} con ${despues.velas.length} velas` : despues.estado
      return { estado: 'error', ruta, problemas: [`no verificado: despues de subir ${nuevas.length} velas, lo vigente es ${visto}`], avisos: v.avisos }
    }
    return { estado: 'publicado', ruta, velas: nuevas.length, bytes: cuerpo.length, problemas: [], avisos: v.avisos }
  } finally {
    await sueltaCerrojo(sb, pair, anio, yo)
  }
}
