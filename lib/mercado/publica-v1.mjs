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
//   v1/_congelado                               la CONGELACION del liberador (sin upsert)
// Orden: cerrojo → la congelacion (si existe: se suelta el cerrojo y no se
// publica nada) → el cerrojo sigue siendo el nuestro → trozos nuevos (sin upsert; si ya estan, se comprueba el sha)
// → relectura y sha de cada uno → manifiestos (sin upsert) → relectura → el
// PUNTERO, el ultimo → relectura → se suelta el cerrojo.
// E2-02 (Astra, CTO 14-oct): desde el INTENTO de escribir el puntero hasta
// confirmar que su relectura es exacta, el resultado es INCIERTO: cualquier
// excepcion en ese tramo (tambien un 503 al releer tras una subida correcta)
// conserva el cerrojo y da la instruccion de reconciliar; lo libera una persona
// despues de mirar el puntero (scripts/mercado-v1-liberar-cerrojo.mjs).
// E2-03: el dueño del cerrojo es un UUID aleatorio por ejecucion (id), el mismo
// al ponerlo, al releerlo y al soltarlo; descripcion y fecha son metadatos.
// E2R2-03 (Astra, CTO 14-oct): Storage no borra condicionalmente, asi que el
// liberador (lib/mercado/liberar-v1.mjs) no puede borrar «el cerrojo de A» y
// solo ese. Mientras libera, CONGELA: v1/_congelado, de solo insercion. El
// publicador, justo despues de tomar su cerrojo y antes de escribir nada, mira
// si hay congelacion; si la hay (o no se puede leer), suelta su cerrojo y no
// publica; despues relee su cerrojo y exige que siga siendo el suyo (si una
// liberacion lo borro y ya retiro su congelacion, la lectura de la congelacion
// pudo llegar tarde). Un cerrojo tomado durante la liberacion no protege nada
// que se escriba: quien lo toma no escribe.
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
export const CERROJO = 'v1/_cerrojo.json'
export const CONGELADO = 'v1/_congelado'
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
// la ficha del cerrojo (o de la congelacion), para enseñarla: solo lo que tiene
// la forma esperada. E2R2-04: la descripcion (dueno) sale solo si es un valor
// PROPIO conocido; si no, «(ajeno)» y los 16 primeros hex de su sha256.
export const DUENOS = new Set(['mercado-v1-publica', 'mercado-v1-liberar-cerrojo'])
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const FECHA = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/
export function fichaCerrojo(b) {
  let c
  try { c = JSON.parse(b.toString('utf8')) } catch { return { legible: false } }
  if (!c || typeof c !== 'object') return { legible: false }
  return {
    legible: true,
    id: typeof c.id === 'string' && UUID.test(c.id) ? c.id : null,
    dueno: c.dueno == null ? null : DUENOS.has(c.dueno) ? c.dueno : `(ajeno) ${createHash('sha256').update(typeof c.dueno === 'string' ? c.dueno : JSON.stringify(c.dueno)).digest('hex').slice(0, 16)}`,
    desde: typeof c.desde === 'string' && FECHA.test(c.desde) ? c.desde : null,
  }
}
export const describeCerrojo = f => !f.legible ? 'ilegible (no es JSON)' : `id ${f.id ?? '(sin id valido)'} · ${f.dueno ?? '(sin descripcion valida)'} · desde ${f.desde ?? '(sin fecha valida)'}`
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

// planes: los de planificaPar (todos los pares). dueno: descripcion; ahora:
// fecha (metadatos); id: el UUID de esta ejecucion (por defecto, uno nuevo).
// → { estado: 'publicado' | 'nada', pares, puntero, id, cerrojoSuelto }; lanza
// (errorPropio) si falla; con e.incierto = true si el puntero quedo sin
// confirmar (cerrojo puesto). Si al acabar el cerrojo no se puede soltar
// (releerlo o borrarlo falla), no tapa el resultado: cerrojoSuelto false, o el
// error original con el aviso de que el cerrojo sigue puesto.
export async function publica({ almacen, planes, dueno, ahora, id = randomUUID() }) {
  const malos = planes.filter(p => p.estado === 'incidente')
  if (malos.length) throw errorPropio(`incidente: ${malos.map(p => `${p.par}: ${p.incidente}`).join(' · ')}`)
  const aPublicar = planes.filter(p => p.estado === 'publica')
  if (!aPublicar.length) return { estado: 'nada', pares: [], id }
  if (!UUID.test(id)) throw errorPropio('el id de la ejecucion no es un UUID')
  const cerrojo = Buffer.from(JSON.stringify({ id, dueno, desde: ahora }))
  const esNuestro = b => b != null && b.equals(cerrojo)
  let puesto
  try { puesto = await almacen.sube(CERROJO, cerrojo, { upsert: false }) } catch (e) {
    // BF-03 (como el diario): sin respuesta no se sabe si quedo puesto; se mira.
    // Solo es nuestro si es byte a byte el nuestro, con NUESTRO id (E2-03).
    const b = await almacen.lee(CERROJO).catch(() => null)
    if (!esNuestro(b)) throw errorPropio(`no se pudo poner el cerrojo ${CERROJO} (${texto(e)}); si quedo puesto con otro dueño, mirarlo antes de liberarlo (scripts/mercado-v1-liberar-cerrojo.mjs)`)
    puesto = 'ok'
  }
  if (puesto === 'existe') {
    const b = await almacen.lee(CERROJO).catch(() => null)
    throw errorPropio(`cerrojo puesto (${CERROJO}): ${b == null ? 'no se pudo leer' : describeCerrojo(fichaCerrojo(b))}: otro publicador en marcha o muerto; lo libera una persona (scripts/mercado-v1-liberar-cerrojo.mjs)`)
  }
  let incierto = false, resultado, fallo = null
  try {
    resultado = await (async () => {
    // E2R2-03: con una liberacion en marcha no se escribe nada
    if (await enAlmacen(`leer ${CONGELADO}`, () => almacen.lee(CONGELADO)) != null) throw errorPropio(`congelado: hay una liberacion del cerrojo en marcha (${CONGELADO}); no se publica nada, se suelta el cerrojo y se repite despues (si quedo de una liberacion muerta: scripts/mercado-v1-liberar-cerrojo.mjs)`)
    // y el cerrojo sigue siendo el nuestro DESPUES de esa lectura: si una
    // liberacion lo borro y retiro su congelacion antes de que la lectura
    // llegara, aqui se ve (autorrevision E2R2-03)
    if (!esNuestro(await enAlmacen(`releer ${CERROJO}`, () => almacen.lee(CERROJO)))) throw errorPropio(`el cerrojo ${CERROJO} ya no es el de esta ejecucion (id ${id}) tras mirar la congelacion: una liberacion se lo llevo; no se publica nada`)
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
  // soltar el cerrojo: solo el nuestro (mismo id); si no se puede, se dice
  let suelto = false
  try {
    const b = await almacen.lee(CERROJO)
    if (esNuestro(b)) { await almacen.borra(CERROJO); suelto = true } else suelto = b == null || null   // null: hay otro (no es nuestro): no se toca
  } catch { suelto = false }
  if (fallo) {
    if (suelto === false) throw Object.assign(errorPropio(`${fallo?.propio ? fallo.message : texto(fallo)}; ademas el cerrojo ${CERROJO} (id ${id}) sigue puesto: no se pudo soltar (liberarlo con scripts/mercado-v1-liberar-cerrojo.mjs)`), { incidente: fallo?.incidente })
    throw fallo
  }
  return { ...resultado, cerrojoSuelto: suelto !== false }
}
const reconciliar = id => `el cerrojo ${CERROJO} (id ${id}) se CONSERVA. Reconciliar: mirar el puntero con node scripts/mercado-v1-verifica.mjs; si es el nuevo, anotar las publicaciones (abajo) por commit; despues, liberar el cerrojo con node scripts/mercado-v1-liberar-cerrojo.mjs`
