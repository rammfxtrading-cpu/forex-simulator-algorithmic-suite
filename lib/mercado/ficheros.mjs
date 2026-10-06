// lib/mercado/ficheros.mjs — los ficheros del bucket forex-data: como se leen y
// el UNICO camino para publicarlos (bloque D, punto 1; CTO, 5-oct-2026).
// Lo usan /api/candles (solo lectura) y los dos unicos escritores:
// scripts/actualizar-diario.js y scripts/restore-2026.js (con import(): es
// .mjs para que lo cargue Node 20 desde CommonJS). El cliente `sb` se pasa.
//
// INTERRUPTOR DE COMPRESION (bloque E, punto 6; CTO 5-oct-2026): APAGADO por
// defecto. Apagado: los escritores publican solo {AÑO}.json (application/json)
// y los lectores leen solo el .json (no prefieren gzip). Encendido
// (MERCADO_GZIP=1 en el entorno del servidor y de los scripts): lo de abajo.
// La migracion a gzip es un paso aparte: el interruptor no se enciende en este
// despliegue (Astra: un escritor viejo podria dejar su mejora oculta bajo un .gz).
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
//      una ventana: B relee antes de que A suba y sube despues.
//      SIN CADUCIDAD NI RECUPERACION AUTOMATICA (bloque E, punto 1; Astra
//      BD-01/BD-02: recuperarlo por tiempo dejaba publicar a un dueño lento
//      despues de perderlo, y dos recuperadores se borraban el cerrojo el uno
//      al otro). Si esta puesto, se termina con error: quien lo tiene y desde
//      cuando. Un proceso muerto deja el cerrojo puesto y todo lo siguiente de
//      ese par y año falla, visible, hasta que una persona lo libere con
//      scripts/liberar-cerrojo.js (manual, con confirmacion; ningun workflow
//      lo llama). Liberarlo mientras su dueño sigue vivo reabre la ventana:
//      por eso es una decision humana.
//   2. RELEE lo vigente justo antes de subir; si no se puede leer, no publica.
//   3. compone sobre lo releido (componer(guardadas)); si no cambia nada, no
//      sube.
//   4. valida (lib/mercado/calidad.mjs validaParaPublicar): forma, OHLC,
//      unicidad, cobertura por fecha y NINGUN dia con menos velas que lo
//      releido.
//   5. sube el .json.gz y 6. VERIFICA: relee y compara la huella (sha256 del
//      JSON) con lo subido.
//   7. suelta el cerrojo (solo si sigue siendo suyo), SALVO si la subida tuvo
//      resultado incierto (bloque G, punto 9; BF-03): sin respuesta a tiempo,
//      error de red o 5xx. Entonces se RECONCILIA (paso 6): si lo vigente es
//      lo subido, publicado; si no, estado «incierto» y el cerrojo se CONSERVA
//      (la subida puede seguir en curso): lo libera una persona.
//   Cada operacion de Storage tiene plazo (LIMITES, mas abajo).
// Limites: excluye a los escritores que pasan por aqui. Quien escriba en el
// bucket por otra via (el panel de Supabase, codigo viejo) no respeta el
// cerrojo; la verificacion del paso 6 detecta si pisa justo despues de subir,
// no antes ni mas tarde.
import { gzipSync, gunzipSync } from 'zlib'
import { createHash } from 'crypto'
import { validaParaPublicar } from './calidad.mjs'
import { texto } from './errores.mjs'
import { plazoReal, hastaSenal } from './limites.mjs'

export const BUCKET = 'forex-data'

export const gzipActivo = () => process.env.MERCADO_GZIP === '1'
// la ruta que se ESCRIBE y las que se LEEN, segun el interruptor
export const rutaEscritura = (pair, year) => (gzipActivo() ? rutasAnio(pair, year).gz : rutasAnio(pair, year).json)
const rutasLectura = (pair, year) => { const r = rutasAnio(pair, year); return gzipActivo() ? [r.gz, r.json] : [r.json] }
export const rutasAnio = (pair, year) => {
  const json = `${String(pair).toUpperCase().replace('/', '')}/M1/${year}.json`
  return { gz: json + '.gz', json }
}
export const rutaCerrojo = (pair, year) => `_cerrojos/${String(pair).toUpperCase().replace('/', '')}_${year}.json`
const esGzip = b => b.length >= 2 && b[0] === 0x1f && b[1] === 0x8b
export const noExiste = e => String(e?.statusCode) === '404' || e?.status === 404
// Bloque G, punto 8 (BF-02): de un error ajeno, solo clase y codigo (errores.mjs)
const motivo = e => texto(e)
export const huella = velas => createHash('sha256').update(JSON.stringify(velas)).digest('hex')
export const empaqueta = velas => gzipSync(Buffer.from(JSON.stringify(velas), 'utf8'))

// ── Limites de tiempo en Storage (bloque G, punto 9; Astra BF-03) ─────────────
// Cada operacion de Storage de un escritor tiene un plazo: pequenaMs para el
// cerrojo (fichas de bytes), grandeMs para leer o subir un año (~30 MB). La
// descarga recibe la señal (se cancela de verdad); upload, info y remove no la
// aceptan en storage-js 2.102: en los scripts el cliente se crea con
// fetchConLimite (lib/mercado/limites.mjs), que corta la peticion HTTP. Aqui,
// ademas, se deja de esperar al vencer el plazo (hastaSenal).
// ⚠️ Valores sin medir (no hay medidas de Storage desde Actions): 20 s y 120 s;
//    120 s para ~30 MB exige al menos ~2 Mbit/s. Se cambian con
//    STORAGE_PEQUENA_S y STORAGE_GRANDE_S.
const segs = (v, def) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n * 1000 : def }
export const LIMITES = { pequenaMs: segs(process.env.STORAGE_PEQUENA_S, 20000), grandeMs: segs(process.env.STORAGE_GRANDE_S, 120000), plazo: plazoReal }
const conPlazo = (lim, ms, que, f) => { const senal = lim.plazo(ms); return hastaSenal(f(senal), senal, que, ms) }
// El peor caso de publicarAnio con esos plazos: tomar el cerrojo (subir la ficha
// y, si hace falta, leerla), releer lo vigente (cada ruta de lectura), subir,
// verificar o reconciliar (otra lectura) y soltar (leer la ficha y borrarla).
// Es la RESERVA que el actualizador deja antes de publicar.
export function tiempoMaximoPublicar(lim = LIMITES) {
  const n = rutasLectura('X', 2000).length
  return 4 * lim.pequenaMs + (2 * n + 1) * lim.grandeMs
}

// Una ruta concreta. → { estado: 'ok', velas } | { estado: 'no-existe' } | { estado: 'error', motivo }
// Con `lim` (los escritores), la lectura tiene plazo grandeMs y se cancela.
export async function leerRuta(sb, ruta, lim = null) {
  let r
  try {
    r = lim ? await conPlazo(lim, lim.grandeMs, `lectura de ${ruta}`, senal => sb.storage.from(BUCKET).download(ruta, {}, { signal: senal }))
      : await sb.storage.from(BUCKET).download(ruta)
  } catch (e) { return { estado: 'error', motivo: texto(e) } }
  const { data, error } = r
  if (error) return noExiste(error) ? { estado: 'no-existe' } : { estado: 'error', motivo: motivo(error) }
  try {
    let b = Buffer.from(await data.arrayBuffer())
    // Bloque G, punto 3 (Astra, cierres-3): con la compresion APAGADA no se lee
    // gzip por ningun camino, tampoco bytes gzip guardados bajo un nombre .json:
    // error visible (nadie deberia haberlos escrito asi; si estan, se investiga)
    if (esGzip(b) && !gzipActivo()) return { estado: 'error', motivo: `contenido gzip en ${ruta} con la compresion apagada (MERCADO_GZIP): no se lee` }
    if (esGzip(b)) b = gunzipSync(b)
    const velas = JSON.parse(b.toString('utf8'))
    return Array.isArray(velas) ? { estado: 'ok', velas } : { estado: 'error', motivo: 'el fichero no es una lista de velas' }
  } catch (e) {
    return { estado: 'error', motivo: `fichero ilegible (${texto(e)})` }
  }
}

// Lo vigente del año: el .json.gz o, si no existe, el .json.
// → { estado: 'ok', velas, ruta } | { estado: 'no-existe' } | { estado: 'error', ruta, motivo }
export async function leerVigente(sb, pair, year, lim = null) {
  for (const ruta of rutasLectura(pair, year)) {
    const x = await leerRuta(sb, ruta, lim)
    if (x.estado !== 'no-existe') return { ...x, ruta }
  }
  return { estado: 'no-existe' }
}

// La version (etag) de lo vigente, sin descargarlo.
// → { estado: 'ok', ruta, version } | { estado: 'no-existe' } | { estado: 'error', motivo }
export async function versionVigente(sb, pair, year) {
  for (const ruta of rutasLectura(pair, year)) {
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
// → { ok: true } | { ok: false, motivo } (motivo: quien lo tiene y desde cuando)
async function tomaCerrojo(sb, pair, year, dueno, ahoraMs, lim = LIMITES) {
  const ruta = rutaCerrojo(pair, year)
  const ficha = JSON.stringify({ dueno, desde: new Date(ahoraMs()).toISOString() })
  let error
  try { ({ error } = await conPlazo(lim, lim.pequenaMs, `cerrojo ${ruta}`, () => sb.storage.from(BUCKET).upload(ruta, ficha, { upsert: false, contentType: 'application/json' }))) }
  catch (e) {
    // BF-03: sin respuesta a tiempo no se sabe si el cerrojo quedo creado: se mira
    const c = await leeCerrojo(sb, pair, year, lim)
    if (c.estado === 'ok' && c.ficha.dueno === dueno) return { ok: true }
    if (c.estado === 'no-existe') return { ok: false, estado: 'error', motivo: `no se pudo crear el cerrojo ${ruta}: ${texto(e)}` }
    if (c.estado === 'error') return { ok: false, estado: 'error', motivo: `no se sabe si el cerrojo ${ruta} quedo creado (${texto(e)}; al mirarlo: ${c.motivo}). Comprobarlo con node scripts/liberar-cerrojo.js ${String(pair).toUpperCase().replace('/', '')}_${year}` }
    error = { statusCode: '409' }
  }
  if (!error) return { ok: true }
  if (String(error.statusCode) !== '409') return { ok: false, estado: 'error', motivo: `no se pudo crear el cerrojo ${ruta}: ${motivo(error)}` }
  const otro = await leeCerrojo(sb, pair, year, lim)
  const quien = otro.estado === 'ok' ? `lo tiene ${otro.ficha.dueno ?? '(sin dueño)'} desde ${otro.ficha.desde ?? '(sin fecha)'}` : `no se pudo leer quien lo tiene (${otro.motivo ?? otro.estado})`
  const clave = `${String(pair).toUpperCase().replace('/', '')}_${year}`
  return { ok: false, motivo: `cerrojo ${ruta} puesto: ${quien}. No se publica nada. Si ese proceso ya no existe, liberarlo a mano: node scripts/liberar-cerrojo.js ${clave} --confirmo` }
}
// → { estado: 'ok', ficha } | { estado: 'no-existe' } | { estado: 'error', motivo }
export async function leeCerrojo(sb, pair, year, lim = LIMITES) {
  let r
  try { r = await conPlazo(lim, lim.pequenaMs, 'lectura del cerrojo', senal => sb.storage.from(BUCKET).download(rutaCerrojo(pair, year), {}, { signal: senal })) }
  catch (e) { return { estado: 'error', motivo: texto(e) } }
  const { data, error } = r
  if (error) return noExiste(error) ? { estado: 'no-existe' } : { estado: 'error', motivo: motivo(error) }
  try { return { estado: 'ok', ficha: JSON.parse(await data.text()) } } catch (e) { return { estado: 'error', motivo: `ficha ilegible (${texto(e)})` } }
}
// liberacion MANUAL (scripts/liberar-cerrojo.js): borra el cerrojo, sea de quien sea
export async function liberaCerrojo(sb, pair, year) {
  const { error } = await sb.storage.from(BUCKET).remove([rutaCerrojo(pair, year)])
  return error ? { ok: false, motivo: motivo(error) } : { ok: true }
}
// → { ok: true } | { ok: false, motivo } (no se pudo confirmar que se soltara)
async function sueltaCerrojo(sb, pair, year, dueno, lim = LIMITES) {
  const ruta = rutaCerrojo(pair, year)
  const c = await leeCerrojo(sb, pair, year, lim)
  if (c.estado === 'no-existe') return { ok: true }
  if (c.estado === 'error') return { ok: false, motivo: `no se pudo leer el cerrojo ${ruta} para soltarlo (${c.motivo})` }
  if (c.ficha?.dueno !== dueno) return { ok: true }
  try {
    const { error } = await conPlazo(lim, lim.pequenaMs, `borrado del cerrojo ${ruta}`, () => sb.storage.from(BUCKET).remove([ruta]))
    return error ? { ok: false, motivo: `no se pudo borrar el cerrojo ${ruta} (${motivo(error)})` } : { ok: true }
  } catch (e) { return { ok: false, motivo: `no se pudo confirmar el borrado del cerrojo ${ruta} (${texto(e)})` } }
}

// ── Publicacion ──────────────────────────────────────────────────────────────
// componer(guardadas | null) → velas a publicar | null (nada que publicar).
// → { estado: 'publicado' | 'sin-cambios' | 'rechazado' | 'ocupado' | 'error',
//     ruta, velas (n), problemas: [...], avisos: [...], bytes }
export async function publicarAnio(sb, { pair, year, componer, exigeHasta = null, dueno = 'escritor', ahoraMs = () => Date.now(), limites = {} }) {
  const lim = { ...LIMITES, ...limites }
  const ruta = rutaEscritura(pair, year)
  const gz = ruta.endsWith('.gz')
  const anio = Number(year)
  const clave = `${String(pair).toUpperCase().replace('/', '')}_${anio}`
  const yo = `${dueno}:${Math.random().toString(36).slice(2, 10)}`
  const cerrojo = await tomaCerrojo(sb, pair, anio, yo, typeof ahoraMs === 'function' ? ahoraMs : () => ahoraMs, lim)
  if (!cerrojo.ok) return { estado: cerrojo.estado ?? 'ocupado', ruta, problemas: [cerrojo.motivo], avisos: [] }
  // BF-03: una subida de resultado incierto CONSERVA el cerrojo (no se suelta)
  let conservar = false
  const r = await (async () => {
    const leido = await leerVigente(sb, pair, anio, lim)
    if (leido.estado === 'error') return { estado: 'error', ruta, problemas: [`no se pudo releer ${leido.ruta}: ${leido.motivo}`], avisos: [] }
    const guardadas = leido.estado === 'ok' ? leido.velas : null
    const nuevas = await componer(guardadas)
    if (nuevas == null || (guardadas && huella(nuevas) === huella(guardadas))) return { estado: 'sin-cambios', ruta, velas: guardadas?.length ?? 0, problemas: [], avisos: [] }
    const v = validaParaPublicar(nuevas, guardadas, { anio, exigeHasta })
    if (!v.ok) return { estado: 'rechazado', ruta, velas: nuevas.length, problemas: v.problemas, avisos: v.avisos }
    const cuerpo = gz ? empaqueta(nuevas) : Buffer.from(JSON.stringify(nuevas), 'utf8')
    let up, incierto = false
    try { up = await conPlazo(lim, lim.grandeMs, `subida de ${ruta}`, () => sb.storage.from(BUCKET).upload(ruta, cuerpo, { upsert: true, contentType: gz ? 'application/gzip' : 'application/json' })) }
    catch (e) { up = { error: e }; incierto = true }
    // un 4xx es un rechazo cierto (no se aplico); sin respuesta, red o 5xx: incierto
    if (up.error && !incierto && /^4\d\d$/.test(String(up.error.statusCode ?? up.error.status ?? ''))) return { estado: 'error', ruta, problemas: [`fallo al subir: ${motivo(up.error)}`], avisos: v.avisos }
    const despues = await leerVigente(sb, pair, anio, lim)
    const esLoSubido = despues.estado === 'ok' && despues.ruta === ruta && huella(despues.velas) === huella(nuevas)
    const visto = despues.estado === 'ok' ? `${despues.ruta} con ${despues.velas.length} velas` : `${despues.estado}${despues.motivo ? ' (' + despues.motivo + ')' : ''}`
    if (up.error) {
      // RECONCILIACION: la subida no dio respuesta cierta; se mira lo vigente
      if (esLoSubido) return { estado: 'publicado', ruta, velas: nuevas.length, bytes: cuerpo.length, problemas: [], avisos: [...v.avisos, `la subida no respondio (${motivo(up.error)}); reconciliado: lo vigente es lo subido`] }
      conservar = true
      return { estado: 'incierto', ruta, velas: nuevas.length, problemas: [`subida de resultado incierto (${motivo(up.error)}): lo vigente es ${visto}, no lo subido, y la subida puede seguir en curso. El cerrojo ${rutaCerrojo(pair, anio)} SE CONSERVA para que nadie publique encima: comprobar lo vigente y, cuando no quede ninguna subida en curso, liberarlo a mano (node scripts/liberar-cerrojo.js ${clave} --confirmo)`], avisos: v.avisos }
    }
    if (!esLoSubido) return { estado: 'error', ruta, problemas: [`no verificado: despues de subir ${nuevas.length} velas, lo vigente es ${visto}`], avisos: v.avisos }
    return { estado: 'publicado', ruta, velas: nuevas.length, bytes: cuerpo.length, problemas: [], avisos: v.avisos }
  })().catch(e => ({ estado: 'error', ruta, problemas: [`error inesperado al publicar (${texto(e)})`], avisos: [] }))
  if (!conservar) {
    const s = await sueltaCerrojo(sb, pair, anio, yo, lim)
    if (!s.ok) r.avisos = [...(r.avisos || []), `${s.motivo}: si sigue puesto, liberarlo a mano (node scripts/liberar-cerrojo.js ${clave} --confirmo)`]
  }
  return r
}
