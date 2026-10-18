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
// EL CERROJO no esta en Storage sino en la base (E2R3-01, Astra; CTO 14-oct):
// public.mercado_cerrojo (sql/mercado-000-cerrojo.sql), una fila por recurso
// ('mercado/v1'), con el puerto cerrojo:
//   adquiere(recurso, dueno, descripcion) → 'ok' | 'existe' (INSERT; ya habia fila); lanza si falla
//   lee(recurso)                          → { dueno, desde, descripcion } | null
//   suelta(recurso, dueno)                → filas borradas (0 | 1): DELETE ... WHERE recurso AND dueno
// Storage borraba por ruta: un DELETE incierto que llegaba tarde podia quitar
// el cerrojo de otro publicador (delete-tardio.mjs de Astra). El DELETE
// condicional solo puede borrar la fila de SU dueño (el UUID de una ejecucion):
// uno tardio no toca a otro. Por eso ya no hay congelacion (E2R2-03): sobra.
// Orden: cerrojo → trozos nuevos (sin upsert; si ya estan, se comprueba el sha)
// → relectura y sha de cada uno → manifiestos (sin upsert) → relectura → el
// cerrojo sigue siendo nuestro (SELECT por recurso; si no, no se escribe el
// puntero) → el PUNTERO, el ultimo → relectura → se suelta el cerrojo.
// E2-02 (Astra, CTO 14-oct): desde el INTENTO de escribir el puntero hasta
// confirmar que su relectura es exacta, el resultado es INCIERTO: cualquier
// excepcion en ese tramo (tambien un 503 al releer tras una subida correcta)
// conserva el cerrojo y da la instruccion de reconciliar; lo libera una persona
// despues de mirar el puntero (scripts/mercado-v1-liberar-cerrojo.mjs).
// E2-03: el dueño del cerrojo es un UUID aleatorio por ejecucion (id), el mismo
// al ponerlo, al releerlo y al soltarlo; descripcion y fecha son metadatos.
// Lo que el cerrojo condicional NO cubre (residual aceptado, CTO 14-oct): que
// una persona libere por error el cerrojo de un publicador VIVO (--confirmo):
// entre su comprobacion y el puntero no hay exclusion. Y un INSERT incierto
// que llega tarde deja un cerrojo con el UUID de una ejecucion que ya se
// rindio: nadie publica hasta liberarlo a mano (falla cerrado).
// E2-04 (BF-02): los errores que salen de aqui son PROPIOS (errorPropio); lo
// ajeno (el almacen, el parser) entra solo como «clase codigo» (texto()), y un
// JSON ilegible es un codigo propio, sin el mensaje del parser.
import { brotliCompressSync, brotliDecompressSync, constants } from 'zlib'
import { randomUUID, createHash } from 'crypto'
import { huella, decodifica } from '../motor/binario.mjs'
import * as MF from '../motor/manifiesto.mjs'
import { errorPropio, texto } from './errores.mjs'

export const BUCKET = 'mercado'
export const PUNTERO = 'v1/actual.json'
export const RECURSO = 'mercado/v1'
export const CERROJO = `public.mercado_cerrojo (${RECURSO})`   // para los mensajes
export const ESQUEMA_PUNTERO = 'mercado-puntero@1'
const PARES = new Set(['AUDCAD', 'AUDUSD', 'EURUSD', 'GBPJPY', 'GBPUSD', 'NZDUSD', 'USDCAD', 'USDCHF', 'USDJPY'])

export const rutaTrozo = (par, dia, sha) => `v1/${par}/${dia.slice(0, 4)}/${dia.slice(5, 7)}/${dia.slice(8, 10)}.${sha}.bin.br`
export const rutaManifiesto = m => `v1/${m.par}/manifiestos/${m.version}.${m.huella}.json`
export const comprime = buf => brotliCompressSync(buf, { params: { [constants.BROTLI_PARAM_QUALITY]: 11, [constants.BROTLI_PARAM_SIZE_HINT]: buf.length } })
export const descomprime = bytes => brotliDecompressSync(bytes)

// JSON leido de Storage: si no se puede leer, un codigo propio (sin el mensaje del parser)
const json = (b, que) => { try { return JSON.parse(b.toString('utf8')) } catch { throw errorPropio(`${que}: no es JSON (json_ilegible)`) } }
// lo que hace el almacen, con su error ajeno reducido a «clase codigo»
const enAlmacen = async (que, f) => { try { return await f() } catch (e) { throw errorPropio(`${que}: ${texto(e)}`) } }
const enCerrojo = enAlmacen

export function validaPuntero(p) {
  if (p?.esquema !== ESQUEMA_PUNTERO || !p.pares || typeof p.pares !== 'object' || Array.isArray(p.pares)) throw errorPropio('puntero: no es un mercado-puntero@1 (puntero_invalido)')
  for (const [par, e] of Object.entries(p.pares)) {
    if (!PARES.has(par)) throw errorPropio('puntero: un par desconocido (puntero_invalido)')
    if (!/^v1\.[1-9]\d*$/.test(e?.version ?? '') || !/^[0-9a-f]{64}$/.test(e?.huella ?? '') || e.ruta !== rutaManifiesto({ par, version: e.version, huella: e.huella })) throw errorPropio(`puntero: entrada de ${par} no valida (puntero_invalido)`)
  }
  return p
}
export async function leePuntero(almacen) {
  const b = await enAlmacen(`leer ${PUNTERO}`, () => almacen.lee(PUNTERO))
  return b == null ? null : validaPuntero(json(b, PUNTERO))
}
// un manifiesto por su ruta: valido y con la huella esperada (si se da)
export async function leeManifiesto(almacen, ruta, huellaEsperada = null) {
  const b = await enAlmacen(`leer ${ruta}`, () => almacen.lee(ruta))
  if (b == null) throw errorPropio(`no existe ${ruta}`)
  const m = json(b, ruta)
  try { MF.validaManifiesto(m) } catch (e) { throw errorPropio(`${ruta}: no es un manifiesto valido (manifiesto_invalido, ${texto(e)})`) }
  if (huellaEsperada && m.huella !== huellaEsperada) throw errorPropio(`${ruta}: huella distinta de la esperada`)
  if (rutaManifiesto(m) !== ruta) throw errorPropio(`${ruta}: no es la ruta de su contenido`)
  return m
}
// la ficha del cerrojo (la fila de la base), para enseñarla: solo lo que tiene
// la forma esperada. E2R2-04: la descripcion sale solo si es un valor PROPIO
// conocido; si no, «(ajeno)» y los 16 primeros hex de su sha256.
export const DUENOS = new Set(['mercado-v1-publica', 'mercado-v1-prueba'])   // el publicador y el ciclo de prueba (scripts/mercado-v1-prueba-cerrojo.mjs)
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
export function fichaCerrojo(fila) {
  if (!fila || typeof fila !== 'object') return { legible: false }
  const d = typeof fila.desde === 'string' ? Date.parse(fila.desde) : NaN
  return {
    legible: true,
    id: typeof fila.dueno === 'string' && UUID.test(fila.dueno) ? fila.dueno : null,
    dueno: fila.descripcion == null ? null : DUENOS.has(fila.descripcion) ? fila.descripcion : `(ajeno) ${createHash('sha256').update(String(fila.descripcion)).digest('hex').slice(0, 16)}`,
    desde: Number.isFinite(d) ? new Date(d).toISOString() : null,
  }
}
export const describeCerrojo = f => !f.legible ? 'ilegible' : `id ${f.id ?? '(sin id valido)'} · ${f.dueno ?? '(sin descripcion valida)'} · desde ${f.desde ?? '(sin fecha valida)'}`
export async function manifiestoVigente(almacen, par) {
  const p = await leePuntero(almacen)
  const e = p?.pares?.[par]
  return e ? leeManifiesto(almacen, e.ruta, e.huella) : null
}

// un trozo subido o que ya estaba: tiene que decodificar al sha de su nombre
async function compruebaTrozo(almacen, ruta, sha) {
  const b = await enAlmacen(`relectura de ${ruta}`, () => almacen.lee(ruta))
  if (b == null) throw errorPropio(`relectura: no existe ${ruta}`)
  let crudo
  try { crudo = descomprime(b) } catch { throw errorPropio(`relectura: ${ruta} no es brotli (contenido distinto)`) }
  if (huella(crudo) !== sha) throw errorPropio(`relectura: ${ruta} tiene otro sha (contenido distinto)`)
  try { decodifica(crudo) } catch (e) { throw errorPropio(`relectura: ${ruta} no decodifica (trozo_invalido, ${texto(e)})`) }
}

// planes: los de planificaPar (todos los pares). cerrojo: el puerto de arriba.
// dueno: descripcion (DUENOS); ahora: fecha (metadatos: el «desde» lo pone la
// base); id: el UUID de esta ejecucion (por defecto, uno nuevo).
// → { estado: 'publicado' | 'nada', pares, puntero, id, cerrojoSuelto }; lanza
// (errorPropio) si falla; con e.incierto = true si el puntero quedo sin
// confirmar (cerrojo puesto). Si al acabar el cerrojo no se puede soltar
// (el DELETE falla), no tapa el resultado: cerrojoSuelto false, o el error
// original con el aviso de que el cerrojo sigue puesto.
export async function publica({ almacen, cerrojo, planes, dueno, ahora, id = randomUUID() }) {
  const malos = planes.filter(p => p.estado === 'incidente')
  if (malos.length) throw errorPropio(`incidente: ${malos.map(p => `${p.par}: ${p.incidente}`).join(' · ')}`)
  const aPublicar = planes.filter(p => p.estado === 'publica')
  if (!aPublicar.length) return { estado: 'nada', pares: [], id }
  if (!UUID.test(id)) throw errorPropio('el id de la ejecucion no es un UUID')
  if (!cerrojo) throw errorPropio('falta el puerto del cerrojo (public.mercado_cerrojo)')
  const esNuestro = f => f != null && f.dueno === id
  let puesto
  try { puesto = await cerrojo.adquiere(RECURSO, id, dueno) } catch (e) {
    // BF-03 (como el diario): sin respuesta no se sabe si quedo puesto; se mira.
    // Solo es nuestro si su dueño es NUESTRO id (E2-03).
    const f = await cerrojo.lee(RECURSO).catch(() => null)
    if (!esNuestro(f)) throw errorPropio(`no se pudo poner el cerrojo ${CERROJO} (${texto(e)}); si quedo puesto con otro dueño, mirarlo antes de liberarlo (scripts/mercado-v1-liberar-cerrojo.mjs)`)
    puesto = 'ok'
  }
  if (puesto === 'existe') {
    const f = await cerrojo.lee(RECURSO).catch(() => null)
    throw errorPropio(`cerrojo puesto (${CERROJO}): ${f == null ? 'no se pudo leer' : describeCerrojo(fichaCerrojo(f))}: otro publicador en marcha o muerto; lo libera una persona (scripts/mercado-v1-liberar-cerrojo.mjs)`)
  }
  let incierto = false, resultado, fallo = null
  try {
    resultado = await (async () => {
    const anterior = await leePuntero(almacen)
    for (const p of aPublicar) {
      const vigente = anterior?.pares?.[p.par]?.huella ?? null
      if ((p.manifiesto.anterior ?? null) !== vigente) throw errorPropio(`el puntero cambio desde la planificacion de ${p.par} (vigente ${vigente ?? 'ninguno'}, el plan parte de ${p.manifiesto.anterior ?? 'ninguno'}): se vuelve a planificar`)
    }
    // trozos nuevos (y relectura de cada uno)
    for (const p of aPublicar) for (const t of p.nuevos) {
      const sha = huella(t.buffer), ruta = rutaTrozo(p.par, t.dia, sha)
      await enAlmacen(`subir ${ruta}`, () => almacen.sube(ruta, comprime(t.buffer), { upsert: false }))
      await compruebaTrozo(almacen, ruta, sha)
    }
    // manifiestos (y relectura)
    for (const p of aPublicar) {
      const ruta = rutaManifiesto(p.manifiesto), contenido = JSON.stringify(p.manifiesto)
      if (await enAlmacen(`subir ${ruta}`, () => almacen.sube(ruta, Buffer.from(contenido), { upsert: false })) === 'existe') {
        const ya = await enAlmacen(`leer ${ruta}`, () => almacen.lee(ruta))
        if (ya?.toString('utf8') !== contenido) throw errorPropio(`${ruta} ya existe con otro contenido`)
      }
      await leeManifiesto(almacen, ruta, p.manifiesto.huella)
    }
    // EL PUNTERO, el ultimo: INCIERTO desde el intento hasta la relectura exacta
    const puntero = { esquema: ESQUEMA_PUNTERO, pares: { ...(anterior?.pares ?? {}) } }
    for (const p of aPublicar) puntero.pares[p.par] = { version: p.manifiesto.version, huella: p.manifiesto.huella, ruta: rutaManifiesto(p.manifiesto) }
    puntero.pares = Object.fromEntries(Object.entries(puntero.pares).sort(([a], [b]) => (a < b ? -1 : 1)))
    const textoPuntero = JSON.stringify(puntero)
    // E2R3-01: justo antes del puntero, el cerrojo sigue siendo nuestro; si no, no se escribe
    const f = await enCerrojo('comprobar el cerrojo antes del puntero', () => cerrojo.lee(RECURSO))
    if (!esNuestro(f)) throw errorPropio(`el cerrojo ${CERROJO} ya no es de esta ejecucion (id ${id}): NO se escribe el puntero (los trozos y manifiestos subidos son inmutables y no cambian nada publicado); se repite despues`)
    incierto = true
    let releido
    try {
      await almacen.sube(PUNTERO, Buffer.from(textoPuntero), { upsert: true })
      releido = await almacen.lee(PUNTERO)
    } catch (e) {
      throw Object.assign(errorPropio(`incierto: el puntero ${PUNTERO} no se pudo confirmar (${texto(e)}); ${reconciliar(id)}`), { incierto: true, id, puntero })
    }
    if (releido?.toString('utf8') !== textoPuntero) throw Object.assign(errorPropio(`incierto: el puntero releido no es el subido; ${reconciliar(id)}`), { incierto: true, id, puntero })
    incierto = false
    return { estado: 'publicado', pares: aPublicar.map(p => ({ par: p.par, version: p.manifiesto.version, huella: p.manifiesto.huella, nuevos: p.nuevos.length })), puntero, id }
    })()
  } catch (e) { fallo = e }
  if (incierto) throw fallo
  // soltar el cerrojo: DELETE condicional a nuestro id (0 filas: ya no estaba;
  // otro cerrojo no se puede tocar). Si falla, se dice; un DELETE tardio solo
  // puede borrar el nuestro
  let suelto = false
  try { await cerrojo.suelta(RECURSO, id); suelto = true } catch { suelto = false }
  if (fallo) {
    if (suelto === false) throw Object.assign(errorPropio(`${fallo?.propio ? fallo.message : texto(fallo)}; ademas el cerrojo ${CERROJO} (id ${id}) sigue puesto: no se pudo soltar (liberarlo con scripts/mercado-v1-liberar-cerrojo.mjs)`), { incidente: fallo?.incidente })
    throw fallo
  }
  return { ...resultado, cerrojoSuelto: suelto !== false }
}
const reconciliar = id => `el cerrojo ${CERROJO} (id ${id}) se CONSERVA. Reconciliar: mirar el puntero con node scripts/mercado-v1-verifica.mjs; si es el nuevo, anotar las publicaciones (abajo) por commit; despues, liberar el cerrojo con node scripts/mercado-v1-liberar-cerrojo.mjs`
