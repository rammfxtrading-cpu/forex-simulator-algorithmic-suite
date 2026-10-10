// lib/mercado/ficheros.mjs — los ficheros del bucket forex-data: como se leen y
// el UNICO camino para publicarlos (bloque D, punto 1; CTO, 5-oct-2026).
// Lo usan /api/candles (solo lectura) y los dos unicos escritores:
// scripts/actualizar-diario.js y scripts/restore-2026.js (con import(): es
// .mjs para que lo cargue Node 20 desde CommonJS). El cliente `sb` se pasa.
//
// UN SOLO FORMATO (CTO 9-oct-2026; sustituye al interruptor MERCADO_GZIP del
// bloque E, punto 6, que ya no decide nada): todos los escritores publican
// {PAR}/M1/{AÑO}.json.gz y todos los lectores leen el .json.gz y, si no existe,
// el .json de siempre.
//   Lectura: el .json.gz si existe; si no existe (404 real), el .json. Un
//   error que no es 404 en el .json.gz es «no se pudo leer»: no se cae al
//   .json, que puede ser una version vieja. Se descomprime por los bytes
//   magicos de gzip; pero bytes gzip solo se aceptan bajo un nombre .gz (bajo
//   un .json son un error visible: bloque G, punto 3, G3).
//   Escritura: solo .json.gz. El .json no se toca ni se borra aqui (borrarlo
//   sera un paso aparte, revisado, con la copia local verificada).
//   Guarda: un escritor que fuese a escribir .json (formato: 'json') en un par
//   y año que ya tienen .json.gz se niega: su mejora quedaria oculta.
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
import { plazoReal, hastaSenal, atarDescarga } from './limites.mjs'

export const BUCKET = 'forex-data'

// la ruta que se ESCRIBE y las que se LEEN (un solo formato, CTO 9-oct)
export const rutaEscritura = (pair, year) => rutasAnio(pair, year).gz
const rutasLectura = (pair, year) => { const r = rutasAnio(pair, year); return [r.gz, r.json] }
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
// Tiempos REALES (CTO, 6-oct: para ajustar los plazos): con lim.tiempos (una
// lista), cada operacion apunta { tipo, ms, agotado }. tipo: lectura (de un
// año), subida, info, cerrojo (crear, leer o borrar la ficha).
const tipoDe = que => /cerrojo/.test(que) ? 'cerrojo' : que.split(' ')[0]
async function conPlazo(lim, ms, que, f) {
  const senal = lim.plazo(ms), t0 = performance.now()
  const apunta = agotado => lim.tiempos?.push({ tipo: tipoDe(que), ms: Math.round(performance.now() - t0), agotado })
  try { const r = await hastaSenal(f(senal), senal, que, ms); apunta(false); return r }
  catch (e) { apunta(senal.aborted); throw e }
}
// resumen para el log: «lectura 2× max 1234 · subida 1× max 900 · …»
export function resumenTiempos(tiempos = []) {
  const por = {}
  for (const t of tiempos) { const x = (por[t.tipo] ??= { n: 0, max: 0, agotados: 0 }); x.n++; x.max = Math.max(x.max, t.ms); if (t.agotado) x.agotados++ }
  return ['lectura', 'subida', 'info', 'cerrojo'].filter(k => por[k]).map(k => `${k} ${por[k].n}× max ${por[k].max}${por[k].agotados ? ` (${por[k].agotados} plazo(s) agotado(s))` : ''}`).join(' · ') || 'ninguna operacion'
}
// El peor caso de publicarAnio con esos plazos: tomar el cerrojo (subir la ficha
// y, si hace falta, leerla), info() de la firma, releer lo vigente (cada ruta
// de lectura), subir, info() de la verificacion, una lectura de respaldo y
// soltar (leer la ficha y borrarla): 6 pequeñas y 2n+1 grandes. Con las dos
// rutas de lectura (.json.gz y .json, un solo formato desde el 9-oct), n = 2:
// 6 × 20 + 5 × 120 = 720 s con los plazos por defecto (antes, con una sola
// ruta, eran 3 grandes). Con el tope atado (MD-01) la relectura es de UNA ruta y su
// reintento por sha256 (MD-05) cabe en esas 5 grandes. Es la RESERVA que el
// actualizador deja antes de publicar.
export function tiempoMaximoPublicar(lim = LIMITES) {
  const n = rutasLectura('X', 2000).length
  return 6 * lim.pequenaMs + (2 * n + 1) * lim.grandeMs
}

// Los bytes de un fichero anual (los descargados o los de una copia local) →
// { estado: 'ok', velas } | { estado: 'error', motivo }. Misma regla en los dos
// caminos (bloque G, punto 3; CTO 9-oct): bytes gzip solo bajo un nombre .gz.
export function decodifica(crudo, ruta) {
  let b = crudo
  try {
    if (esGzip(b) && !String(ruta).endsWith('.gz')) return { estado: 'error', motivo: `contenido gzip en ${ruta}, que no es un .gz: no se lee` }
    if (esGzip(b)) b = gunzipSync(b)
    const velas = JSON.parse(b.toString('utf8'))
    return Array.isArray(velas) ? { estado: 'ok', velas } : { estado: 'error', motivo: 'el fichero no es una lista de velas' }
  } catch (e) {
    return { estado: 'error', motivo: `fichero ilegible (${texto(e)})` }
  }
}

// Una ruta concreta. → { estado: 'ok', velas } | { estado: 'no-existe' } | { estado: 'error', motivo }
// Con `lim` (los escritores), la lectura tiene plazo grandeMs y se cancela.
// Con { crudo: true }, devuelve tambien los bytes descargados (para la cache del
// actualizador diario, lib/mercado/cache-anual.mjs).
// Con { tope: { max, etag, size } } (Astra MD-01): la descarga va ATADA a lo que
// dijo info(): se corta al recibir mas de max bytes o si la respuesta es de otra
// identidad (lib/mercado/limites.mjs fetchConTope, en el cliente de los
// scripts); y, recibida, se rechaza si pasa de max o no mide size. Entonces
// estado 'tope' (no se usa). Un intento fallido cuenta lo recibido y, si no se
// sabe, el tamaño esperado (size).
// Con { sha256 } (Astra MD-05): el sha256 del cuerpo descargado tiene que ser
// ese (el de los metadatos); si no, estado 'error', shaDistinto: true y
// «no verificado» (quien llama decide si reintenta una vez).
export async function leerRuta(sb, ruta, lim = null, { crudo = false, tope = null, sha256: shaEsperado = null } = {}) {
  let r, ficha = null
  // MDC-01: lo recibido de verdad si la respuesta llego (tambien un error); si no llego, el tamaño esperado
  const contados = () => (ficha?.vista ? ficha.recibidos : tope?.size ?? 0)
  const conHttp = m => (ficha?.estadoHttp && !(ficha.estadoHttp >= 200 && ficha.estadoHttp < 300) && !String(m).includes(String(ficha.estadoHttp)) ? `HTTP ${ficha.estadoHttp}: ${m}` : m)
  try {
    r = lim ? await conPlazo(lim, lim.grandeMs, `lectura de ${ruta}`, senal => { if (tope) ficha = atarDescarga(senal, { max: tope.max, etag: tope.etag }); return sb.storage.from(BUCKET).download(ruta, {}, { signal: senal }) })
      : await sb.storage.from(BUCKET).download(ruta)
  } catch (e) { return ficha?.corte ? { estado: 'tope', bytes: ficha.recibidos, motivo: ficha.corte } : { estado: 'error', ...(tope ? { bytes: contados() } : {}), motivo: conHttp(texto(e)) } }
  const { data, error } = r
  if (error) return ficha?.corte ? { estado: 'tope', bytes: ficha.recibidos, motivo: ficha.corte } : noExiste(error) ? { estado: 'no-existe', ...(tope ? { bytes: contados() } : {}) } : { estado: 'error', ...(tope ? { bytes: contados() } : {}), motivo: conHttp(motivo(error)) }
  let b
  try { b = Buffer.from(await data.arrayBuffer()) }
  catch (e) { return ficha?.corte ? { estado: 'tope', bytes: ficha.recibidos, motivo: ficha.corte } : { estado: 'error', bytes: tope ? contados() : 0, motivo: `fichero ilegible (${texto(e)})` } }
  if (tope && b.length > tope.max) return { estado: 'tope', bytes: b.length, motivo: `tope de descarga: recibidos ${b.length} > ${tope.max} autorizados` }
  if (tope && tope.size != null && b.length !== tope.size) return { estado: 'tope', bytes: b.length, motivo: `identidad cambiada: ${ruta} mide ${b.length} y info() dijo ${tope.size}` }
  // CTO 10-oct: info() dio etag y el GET no la trae → solo con el sha256 de los metadatos y coincidiendo
  if (tope?.etag && ficha?.sinEtag && (!shaEsperado || sha256(b) !== shaEsperado)) return { estado: 'tope', bytes: b.length, motivo: `identidad sin confirmar: el GET de ${ruta} no trae la etag que dio info() y ${shaEsperado ? 'el sha256 del cuerpo no es el de los metadatos' : 'no hay sha256 en los metadatos'}` }
  if (shaEsperado && sha256(b) !== shaEsperado) return { estado: 'error', shaDistinto: true, bytes: b.length, motivo: `no verificado: el sha256 del cuerpo de ${ruta} no es el de sus metadatos` }
  // lo descargado (bloque G, punto 11: se cuenta). Bloque G, punto 3 (Astra,
  // cierres-3): bytes gzip guardados bajo un nombre .json: error visible
  return { ...decodifica(b, ruta), bytes: b.length, ...(crudo ? { crudo: b } : {}) }
}

// Lo vigente del año: el .json.gz o, si no existe, el .json.
// → { estado: 'ok', velas, ruta } | { estado: 'no-existe' } | { estado: 'error', ruta, motivo }
export async function leerVigente(sb, pair, year, lim = null, opciones = {}) {
  for (const ruta of rutasLectura(pair, year)) {
    const x = await leerRuta(sb, ruta, lim, opciones)
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

// ── Firma y metadatos (bloque G, punto 11; CTO 6-oct-2026) ───────────────────
// Para que un escritor descargue cada año COMO MUCHO DOS VECES:
//   · firma de lo vigente con info() (version, etag y tamaño; sin descargar):
//     si bajo el cerrojo la firma es la de la lectura inicial, se usa lo leido;
//   · la subida lleva en sus metadatos el sha256 del cuerpo (calculado aqui) y
//     se verifica con info(): ese sha256 y el tamaño.
// ⚠️ Segun los tipos de storage-js 2.102 (FileObjectV2: version, etag, size,
//    metadata); NO comprobado contra produccion (la llamada a info() de
//    prueba sigue sin autorizar). Si info() no trae version ni etag, no hay
//    firma (se relee); si no trae los metadatos, se verifica descargando solo
//    si quedan descargas; si no quedan, «no verificado» (visible).
export const sha256 = b => createHash('sha256').update(b).digest('hex')
const firmaDe = d => (d && (d.version || d.etag) ? `${d.version ?? ''}|${d.etag ?? ''}|${d.size ?? ''}` : null)
// → { estado: 'ok', ruta, firma, size, metadata } | { estado: 'no-existe' } | { estado: 'error', motivo }
export async function infoVigente(sb, pair, year, lim = LIMITES) {
  for (const ruta of rutasLectura(pair, year)) {
    let r
    try { r = await conPlazo(lim, lim.pequenaMs, `info de ${ruta}`, () => sb.storage.from(BUCKET).info(ruta)) }
    catch (e) { return { estado: 'error', motivo: texto(e) } }
    if (r.error) { if (noExiste(r.error)) continue; return { estado: 'error', motivo: motivo(r.error) } }
    const size = r.data?.size
    return { estado: 'ok', ruta, firma: firmaDe(r.data), etag: r.data?.etag ?? null, size: Number.isFinite(size) && size >= 0 ? size : null, metadata: r.data?.metadata ?? null }
  }
  return { estado: 'no-existe' }
}
// La lectura inicial de un escritor: lo vigente y su firma (info ANTES de
// descargar: si cambia entre medias, la firma no coincidira bajo el cerrojo y
// se releera). → lo de leerVigente + { firma | null }
export async function leerConFirma(sb, pair, year, lim = LIMITES) {
  const i = await infoVigente(sb, pair, year, lim)
  const x = await leerVigente(sb, pair, year, lim)
  return { ...x, firma: i.estado === 'ok' && x.estado === 'ok' && i.ruta === x.ruta ? i.firma : null }
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
// → { estado: 'publicado' | 'sin-cambios' | 'rechazado' | 'ocupado' | 'error' | 'incierto',
//     ruta, velas (n), final (el contenido verificado, si publicado o sin-cambios),
//     problemas: [...], avisos: [...], bytes }
// previo (opcional): la lectura inicial del escritor (leerConFirma). Con ella,
// si la firma no cambio, no se relee (bloque G, punto 11): el año se descarga
// como mucho dos veces en total, contando esa lectura.
// topeRestante (opcional; tope de descarga del actualizador diario, Astra
// MD-01): (bytes ya descargados por esta publicacion) → bytes que aun se
// pueden descargar. Con el, cada descarga (relectura, verificacion) va ATADA a
// la info() que la precede: la ruta y el tamaño de esa info(), cortada al
// pasar de el (leerRuta con tope). Sin tamaño, sin objeto, o si no cabe: no se
// descarga; la relectura termina con estado 'tope' (sin subir) y la
// verificacion sin metadatos, «no verificable».
// Si publica y lo verifica por metadatos, devuelve tambien el cuerpo subido y
// la firma de lo vigente (cuerpo, firma): la copia de la cache del dia siguiente.
// formato: 'gz' (todos los escritores). 'json' solo existe por la guarda (CTO
// 9-oct): con .json.gz presente, no se publica (estado 'rechazado').
export async function publicarAnio(sb, { pair, year, componer, exigeHasta = null, dueno = 'escritor', ahoraMs = () => Date.now(), limites = {}, previo = null, topeRestante = null, formato = 'gz' }) {
  const lim = { ...LIMITES, ...limites }
  const ruta = formato === 'json' ? rutasAnio(pair, year).json : rutaEscritura(pair, year)
  const gz = ruta.endsWith('.gz')
  const anio = Number(year)
  const clave = `${String(pair).toUpperCase().replace('/', '')}_${anio}`
  const yo = `${dueno}:${Math.random().toString(36).slice(2, 10)}`
  const cerrojo = await tomaCerrojo(sb, pair, anio, yo, typeof ahoraMs === 'function' ? ahoraMs : () => ahoraMs, lim)
  if (!cerrojo.ok) return { estado: cerrojo.estado ?? 'ocupado', ruta, problemas: [cerrojo.motivo], avisos: [] }
  // BF-03: una subida de resultado incierto CONSERVA el cerrojo (no se suelta)
  let conservar = false
  // descargas que le quedan a esta publicacion: 2 en total, contando la del previo
  let quedan = previo ? 1 : 2
  const descargado = { n: 0, bytes: 0 }      // lo que esta publicacion descarga (se suma al del escritor)
  const leeSiQueda = async (info = null) => {
    if (quedan <= 0) return null
    if (topeRestante) {
      if (info?.estado === 'no-existe') return { estado: 'no-existe' }
      if (info?.estado !== 'ok' || info.size == null) return { estado: 'tope', motivo: `tope de descarga: sin el tamaño de info() (${info?.estado === 'ok' ? 'tamaño nulo' : info?.motivo ?? 'sin info'}) no se descarga` }
      const queda = topeRestante(descargado.bytes)
      if (info.size > queda) return { estado: 'tope', motivo: `tope de descarga: el año (${info.size} bytes) no cabe en lo que queda (${queda})` }
      quedan--
      const lee = () => leerRuta(sb, info.ruta, lim, { tope: { max: info.size, etag: info.etag, size: info.size }, sha256: info.metadata?.sha256 ?? null })
      let x = await lee()
      descargado.n++; descargado.bytes += x.bytes || 0
      // MD-05: si el cuerpo no da el sha256 de los metadatos, UN reintento dentro del tope
      if (x.shaDistinto && info.size <= topeRestante(descargado.bytes)) { x = await lee(); descargado.n++; descargado.bytes += x.bytes || 0 }
      return { ...x, ruta: info.ruta }
    }
    quedan--; const x = await leerVigente(sb, pair, anio, lim); descargado.n++; descargado.bytes += x.bytes || 0; return x
  }
  const r = await (async () => {
    // RELEE bajo el cerrojo, salvo que la firma sea la de la lectura previa
    // guarda (CTO 9-oct): .json donde ya hay .json.gz → no (bajo el cerrojo)
    if (!gz) {
      let g
      try { g = await conPlazo(lim, lim.pequenaMs, `info de ${rutasAnio(pair, anio).gz}`, () => sb.storage.from(BUCKET).info(rutasAnio(pair, anio).gz)) }
      catch (e) { return { estado: 'error', ruta, problemas: [`no se pudo comprobar si existe ${rutasAnio(pair, anio).gz} (${texto(e)}): no se escribe .json`], avisos: [] } }
      if (!g.error) return { estado: 'rechazado', ruta, problemas: [`${rutasAnio(pair, anio).gz} ya existe: un .json quedaria oculto detras; no se escribe .json`], avisos: [] }
      if (!noExiste(g.error)) return { estado: 'error', ruta, problemas: [`no se pudo comprobar si existe ${rutasAnio(pair, anio).gz} (${motivo(g.error)}): no se escribe .json`], avisos: [] }
    }
    const iL = previo ? await infoVigente(sb, pair, anio, lim) : null
    let leido
    if (previo?.estado === 'ok' && previo.firma && iL?.estado === 'ok' && iL.ruta === previo.ruta && iL.firma === previo.firma) leido = previo
    else if (previo?.estado === 'no-existe' && iL?.estado === 'no-existe') leido = previo
    else leido = await leeSiQueda(iL)
    if (leido.estado === 'tope') return { estado: 'tope', ruta, problemas: [leido.motivo], avisos: [] }
    if (leido.estado === 'error') return { estado: 'error', ruta, problemas: [`no se pudo releer ${leido.ruta}: ${leido.motivo}`], avisos: [] }
    const guardadas = leido.estado === 'ok' ? leido.velas : null
    const nuevas = await componer(guardadas)
    // «sin cambios» solo si lo vigente ya esta en la ruta que se escribe: el mismo
    // contenido leido del .json se publica como .json.gz (arranque, CTO 9-oct)
    if (nuevas == null || (guardadas && leido.ruta === ruta && huella(nuevas) === huella(guardadas))) return { estado: 'sin-cambios', ruta, velas: guardadas?.length ?? 0, final: guardadas, problemas: [], avisos: [] }
    const v = validaParaPublicar(nuevas, guardadas, { anio, exigeHasta })
    if (!v.ok) return { estado: 'rechazado', ruta, velas: nuevas.length, problemas: v.problemas, avisos: v.avisos }
    const cuerpo = gz ? empaqueta(nuevas) : Buffer.from(JSON.stringify(nuevas), 'utf8')
    const shaCuerpo = sha256(cuerpo)          // el hash LOCAL, que viaja en los metadatos
    let up, incierto = false
    try { up = await conPlazo(lim, lim.grandeMs, `subida de ${ruta}`, () => sb.storage.from(BUCKET).upload(ruta, cuerpo, { upsert: true, contentType: gz ? 'application/gzip' : 'application/json', metadata: { sha256: shaCuerpo, velas: String(nuevas.length) } })) }
    catch (e) { up = { error: e }; incierto = true }
    // un 4xx es un rechazo cierto (no se aplico); sin respuesta, red o 5xx: incierto
    if (up.error && !incierto && /^4\d\d$/.test(String(up.error.statusCode ?? up.error.status ?? ''))) return { estado: 'error', ruta, problemas: [`fallo al subir: ${motivo(up.error)}`], avisos: v.avisos }
    // VERIFICA (y reconcilia): por metadatos; descargando solo si no hay metadatos y quedan descargas
    let esLoSubido, visto, firma = null
    const iV = await infoVigente(sb, pair, anio, lim)
    if (iV.estado === 'ok' && iV.metadata?.sha256) {
      firma = iV.firma
      esLoSubido = iV.ruta === ruta && iV.metadata.sha256 === shaCuerpo && Number(iV.size) === cuerpo.length
      visto = esLoSubido ? 'lo subido' : `${iV.ruta} con otra huella (otro contenido)`
    } else {
      const despues = await leeSiQueda(iV)
      if (despues?.estado === 'tope') { esLoSubido = false; visto = `no verificable: info() ${iV.estado === 'ok' ? 'no trae metadatos' : `fallo (${iV.motivo ?? iV.estado})`} y ${despues.motivo}` }
      else if (!despues) { esLoSubido = false; visto = `no verificable: info() ${iV.estado === 'ok' ? 'no trae metadatos' : `fallo (${iV.motivo ?? iV.estado})`} y ya se descargo el año dos veces` }
      else {
        esLoSubido = despues.estado === 'ok' && despues.ruta === ruta && huella(despues.velas) === huella(nuevas)
        visto = despues.estado === 'ok' ? `${despues.ruta} con ${despues.velas.length} velas` : `${despues.estado}${despues.motivo ? ' (' + despues.motivo + ')' : ''}`
      }
    }
    if (up.error) {
      // RECONCILIACION: la subida no dio respuesta cierta; se mira lo vigente
      if (esLoSubido) return { estado: 'publicado', ruta, velas: nuevas.length, bytes: cuerpo.length, final: nuevas, cuerpo, firma, problemas: [], avisos: [...v.avisos, `la subida no respondio (${motivo(up.error)}); reconciliado: lo vigente es lo subido`] }
      conservar = true
      return { estado: 'incierto', ruta, velas: nuevas.length, problemas: [`subida de resultado incierto (${motivo(up.error)}): lo vigente es ${visto}, no lo subido, y la subida puede seguir en curso. El cerrojo ${rutaCerrojo(pair, anio)} SE CONSERVA para que nadie publique encima: comprobar lo vigente y, cuando no quede ninguna subida en curso, liberarlo a mano (node scripts/liberar-cerrojo.js ${clave} --confirmo)`], avisos: v.avisos }
    }
    if (!esLoSubido) return { estado: 'error', ruta, problemas: [`no verificado: despues de subir ${nuevas.length} velas, lo vigente es ${visto}`], avisos: v.avisos }
    return { estado: 'publicado', ruta, velas: nuevas.length, bytes: cuerpo.length, final: nuevas, cuerpo, firma, problemas: [], avisos: v.avisos }
  })().catch(e => ({ estado: 'error', ruta, problemas: [`error inesperado al publicar (${texto(e)})`], avisos: [] }))
  r.descargado = descargado
  if (!conservar) {
    const s = await sueltaCerrojo(sb, pair, anio, yo, lim)
    if (!s.ok) r.avisos = [...(r.avisos || []), `${s.motivo}: si sigue puesto, liberarlo a mano (node scripts/liberar-cerrojo.js ${clave} --confirmo)`]
  }
  return r
}
