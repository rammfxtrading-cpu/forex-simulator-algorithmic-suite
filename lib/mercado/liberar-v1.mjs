// lib/mercado/liberar-v1.mjs — LIBERAR A MANO el cerrojo del bucket «mercado»
// (v1/_cerrojo.json, de lib/mercado/publica-v1.mjs). Etapa 2; CTO 13-oct
// (decision 3) y 14-oct: el patron del de forex-data (scripts/liberar-cerrojo.js)
// y SIN caducidad automatica, como cerro Astra en BD-01: un publicador lento que
// perdiera el cerrojo por tiempo podria seguir publicando encima de otro.
//
//   (sin argumentos)       SIMULACRO: enseña el cerrojo (id = UUID de la ejecucion,
//                          dueño, fecha y antigüedad segun la ficha), la congelacion
//                          si la hay, y como confirmar
//   --confirmo <clave>     lo libera si <clave> es la que enseña: el id; si la ficha
//                          no tiene un id valido, los 16 primeros hex del sha256 de
//                          sus bytes
//   --descongela <id>      retira una congelacion que quedo de una liberacion
//                          muerta (el id que enseña el simulacro)
//
// E2R2-03 (Astra, CTO 14-oct): Storage no tiene borrado condicional; el DELETE
// del cerrojo es por ruta y puede llevarse otro cerrojo puesto despues de la
// ultima lectura. Por eso, con --confirmo:
//   1. CONGELA: sube v1/_congelado (sin upsert) con el UUID de esta liberacion.
//      Si ya existe, otra liberacion esta en marcha (o murio): no arranca. Es la
//      exclusion entre liberadores.
//   2. lee el cerrojo DOS veces: las dos tienen que ser el que se enseño;
//   3. deja CONSTANCIA en v1/_liberados/<cuando>.<clave>.json (sin upsert; si no
//      se puede escribir, no borra);
//   4. borra el cerrojo y comprueba que ya no esta (si hay otro, es de un
//      publicador que lo tomo despues: vera la congelacion y no escribira);
//   5. retira SU congelacion (la relee: solo si es la suya), tambien si algo
//      fallo por el camino.
// El publicador, justo despues de tomar su cerrojo y antes de escribir nada,
// mira la congelacion: si existe, suelta su cerrojo y no publica. Asi, aunque el
// DELETE del paso 4 se lleve un cerrojo puesto durante la liberacion, quien lo
// puso no ha escrito ni escribira nada. Lo que NO cubre: liberar el cerrojo de
// un publicador que sigue VIVO y ya paso esa comprobacion (por eso, la
// confirmacion humana de que el dueño murio).
// Con CI o GITHUB_ACTIONS definidos no hace nada (BE-01): liberar exige que una
// persona compruebe que el proceso dueño ya no existe.
// deps: { almacen(), ahora(), entorno, id() (opcional: UUID de la liberacion) }
// Codigos: 0 no habia cerrojo, liberado o descongelado · 1 no liberado · 3 error · 4 uso.
// E2-04: en el log, solo mensajes propios o «clase codigo» de lo ajeno; el dueño,
// solo si es un valor propio conocido (E2R2-04).
import { createHash, randomUUID } from 'crypto'
import { CERROJO, CONGELADO, fichaCerrojo, describeCerrojo } from './publica-v1.mjs'
import { texto } from './errores.mjs'

export const LIBERADOS = 'v1/_liberados/'
const POR = 'mercado-v1-liberar-cerrojo'
const sha = b => createHash('sha256').update(b).digest('hex')
const claveDe = (f, b) => f.id ?? sha(b).slice(0, 16)
function antiguedad(desde, ahora) {
  if (!desde) return '(sin fecha valida: no se sabe)'
  const min = Math.floor((Date.parse(ahora) - Date.parse(desde)) / 60000)
  if (!Number.isFinite(min) || min < 0) return '(la fecha de la ficha es posterior a ahora)'
  const d = Math.floor(min / 1440), h = Math.floor((min % 1440) / 60), m = min % 60
  return d ? `${d} d ${h} h ${m} min` : h ? `${h} h ${m} min` : `${m} min`
}

export async function ordenLibera(args, deps) {
  const lineas = [], log = l => lineas.push(l)
  const fin = (codigo, l) => { log(l); return { codigo, lineas } }
  const automatizado = ['CI', 'GITHUB_ACTIONS'].filter(v => Object.hasOwn(deps.entorno ?? {}, v))
  if (automatizado.length) {
    log(`Ejecucion automatizada (${automatizado.join(', ')} definido): liberar el cerrojo exige comprobacion humana. No se hace nada.`)
    return fin(1, '=== ⚠️ ATENCION: no se ha liberado nada (entorno CI/automatizado) (codigo 1) ===')
  }
  const clave = /^[0-9a-f-]{16,36}$/
  const confirma = args.length === 2 && args[0] === '--confirmo' && clave.test(args[1]) ? args[1] : null
  const descongela = args.length === 2 && args[0] === '--descongela' && clave.test(args[1]) ? args[1] : null
  if (!(args.length === 0 || confirma || descongela)) {
    log('Uso: node scripts/mercado-v1-liberar-cerrojo.mjs                       → enseña el cerrojo y la congelacion; NO borra')
    log('     node scripts/mercado-v1-liberar-cerrojo.mjs --confirmo <clave>     → libera el cerrojo (la clave que enseña)')
    log('     node scripts/mercado-v1-liberar-cerrojo.mjs --descongela <id>      → retira una congelacion que quedo (el id que enseña)')
    return fin(4, '=== ⚠️ ATENCION: no se ha liberado nada (codigo 4) ===')
  }
  const ahora = deps.ahora()
  log(`=== MERCADO V1 · CERROJO ${CERROJO} · ${confirma ? 'LIBERAR' : descongela ? 'DESCONGELAR' : 'SIMULACRO (no se borra nada)'} · ${ahora} ===`)
  try {
    const alm = deps.almacen()
    if (descongela) return await retiraCongelacion(alm, descongela, log, fin)
    let b, c
    try { b = await alm.lee(CERROJO) } catch (e) { return fin(3, `=== ⚠️ ATENCION: no se pudo leer el cerrojo (${texto(e)}) (codigo 3) ===`) }
    try { c = await alm.lee(CONGELADO) } catch (e) { return fin(3, `=== ⚠️ ATENCION: no se pudo leer ${CONGELADO} (${texto(e)}) (codigo 3) ===`) }
    if (c != null) {
      const fc = fichaCerrojo(c)
      log(`congelacion: ${CONGELADO} · ${describeCerrojo(fc)}: hay una liberacion en marcha o una que murio; mientras exista, los publicadores no publican`)
      log(`Si esa liberacion murio: node scripts/mercado-v1-liberar-cerrojo.mjs --descongela ${claveDe(fc, c)}`)
    }
    if (b == null) return fin(c == null ? 0 : 1, c == null ? '=== ✓ No hay cerrojo: nada que liberar (codigo 0) ===' : '=== ⚠️ ATENCION: no hay cerrojo, pero queda una congelacion (codigo 1) ===')
    const f = fichaCerrojo(b), k = claveDe(f, b)
    log(`cerrojo: ${describeCerrojo(f)}`)
    log(`antigüedad segun la ficha: ${antiguedad(f.desde, ahora)} · sha256 de sus bytes ${sha(b)}`)
    if (!confirma) {
      log('No caduca. Comprueba que el proceso dueño ya no existe (y, si quedo INCIERTO, reconcilia antes el puntero con node scripts/mercado-v1-verifica.mjs).')
      log(`Para liberarlo: node scripts/mercado-v1-liberar-cerrojo.mjs --confirmo ${k}`)
      return fin(1, '=== ⚠️ ATENCION: no se ha liberado nada (falta --confirmo) (codigo 1) ===')
    }
    if (confirma !== k) return fin(1, `=== ⚠️ ATENCION: la clave dada no es la de este cerrojo (${k}): no se ha liberado nada (codigo 1) ===`)
    if (c != null) return fin(1, '=== ⚠️ ATENCION: hay una congelacion: otra liberacion en marcha (o muerta). No se ha liberado nada (codigo 1) ===')

    // 1 · congelar (exclusion entre liberadores y freno de los publicadores)
    const id = deps.id ? deps.id() : randomUUID()
    const congelacion = Buffer.from(JSON.stringify({ id, dueno: POR, desde: ahora, cerrojo: k }))
    let puesto
    try { puesto = await alm.sube(CONGELADO, congelacion, { upsert: false }) } catch (e) {
      const ya = await alm.lee(CONGELADO).catch(() => null)
      if (!(ya != null && ya.equals(congelacion))) return fin(3, `=== ⚠️ ATENCION: no se pudo congelar (${texto(e)}); mirar ${CONGELADO} con el simulacro. No se ha liberado nada (codigo 3) ===`)
      puesto = 'ok'
    }
    if (puesto === 'existe') return fin(1, `=== ⚠️ ATENCION: ${CONGELADO} ya existe: otra liberacion en marcha. No se ha liberado nada (codigo 1) ===`)
    log(`congelado: ${CONGELADO} con id ${id} (los publicadores no escriben mientras exista)`)
    let r
    try { r = await libera(alm, { b, f, k, ahora }, log) } catch (e) { r = { codigo: 3, ultima: `=== ⚠️ ATENCION: no terminado (${texto(e)}) (codigo 3) ===` } }
    // 5 · retirar la congelacion, pase lo que pase
    const retirada = await retiraSuya(alm, congelacion)
    if (retirada !== 'ok') {
      log(`la congelacion ${CONGELADO} (id ${id}) ${retirada}: los publicadores no publicaran hasta retirarla: node scripts/mercado-v1-liberar-cerrojo.mjs --descongela ${id}`)
      return fin(3, r.codigo === 0 ? `=== ⚠️ ATENCION: cerrojo liberado (${k}), pero la congelacion sigue (codigo 3) ===` : r.ultima.replace(/\(codigo \d\) ===$/, '; y la congelacion sigue (codigo 3) ==='))
    }
    log(`congelacion retirada: ${CONGELADO}`)
    return fin(r.codigo, r.ultima)
  } catch (e) {
    return fin(3, `=== ⚠️ ATENCION: no terminado (${texto(e)}) (codigo 3) ===`)
  }
}

// pasos 2 a 4, con la congelacion puesta → { codigo, ultima }
async function libera(alm, { b, f, k, ahora }, log) {
  const sale = (codigo, ultima) => ({ codigo, ultima })
  // 2 · dos lecturas: tiene que seguir siendo el que se enseño
  for (const n of [1, 2]) {
    let x
    try { x = await alm.lee(CERROJO) } catch (e) { return sale(3, `=== ⚠️ ATENCION: no se pudo releer el cerrojo (${texto(e)}): no se ha liberado nada (codigo 3) ===`) }
    if (x == null || !x.equals(b)) return sale(1, `=== ⚠️ ATENCION: el cerrojo ha cambiado (o ya no esta) desde que se enseño (lectura ${n} con la congelacion puesta): no se ha liberado nada; repetir sin --confirmo (codigo 1) ===`)
  }
  // 3 · constancia, ANTES de borrar
  const ruta = `${LIBERADOS}${ahora.replace(/[-:]/g, '').replace(/\.\d{3}/, '')}.${k}.json`
  const constancia = { esquema: 'mercado-liberacion@1', cerrojo: f.legible ? { id: f.id, dueno: f.dueno, desde: f.desde } : { ilegible: true }, sha256: sha(b), cuando: ahora, por: `scripts/${POR}.mjs --confirmo` }
  let r
  try { r = await alm.sube(ruta, Buffer.from(JSON.stringify(constancia)), { upsert: false }) } catch (e) { return sale(3, `=== ⚠️ ATENCION: no se pudo dejar constancia en ${ruta} (${texto(e)}): no se ha liberado nada (codigo 3) ===`) }
  if (r === 'existe') return sale(3, `=== ⚠️ ATENCION: ya existe ${ruta}: no se ha liberado nada (codigo 3) ===`)
  log(`constancia: ${ruta}`)
  // 4 · borrar y comprobar
  try { await alm.borra(CERROJO) } catch (e) { return sale(3, `=== ⚠️ ATENCION: no se pudo borrar el cerrojo (${texto(e)}); la constancia ${ruta} queda: repetir (codigo 3) ===`) }
  let x
  try { x = await alm.lee(CERROJO) } catch (e) { return sale(3, `=== ⚠️ ATENCION: borrado sin confirmar (${texto(e)}): repetir sin --confirmo para mirarlo (codigo 3) ===`) }
  if (x != null && x.equals(b)) return sale(3, '=== ⚠️ ATENCION: tras borrarlo sigue el mismo cerrojo: repetir sin --confirmo para mirarlo (codigo 3) ===')
  if (x != null) log(`tras borrarlo hay ya otro cerrojo (${describeCerrojo(fichaCerrojo(x))}): lo tomo un publicador despues; con la congelacion puesta no escribe nada. No se toca.`)
  return sale(0, `=== ✓ Cerrojo liberado (${k}); constancia en ${ruta} (codigo 0) ===`)
}

// retira la congelacion propia: solo si sus bytes son los nuestros → 'ok' | por que no
async function retiraSuya(alm, congelacion) {
  try {
    const x = await alm.lee(CONGELADO)
    if (x == null) return 'ya no estaba (alguien la retiro)'
    if (!x.equals(congelacion)) return 'ya no es la nuestra: no se toca'
    await alm.borra(CONGELADO)
    return (await alm.lee(CONGELADO)) == null ? 'ok' : 'sigue tras borrarla'
  } catch (e) { return `no se pudo retirar (${texto(e)})` }
}

// --descongela <id>: una congelacion que quedo (su liberacion murio)
async function retiraCongelacion(alm, id, log, fin) {
  let c
  try { c = await alm.lee(CONGELADO) } catch (e) { return fin(3, `=== ⚠️ ATENCION: no se pudo leer ${CONGELADO} (${texto(e)}) (codigo 3) ===`) }
  if (c == null) return fin(0, `=== ✓ No hay congelacion (${CONGELADO}): nada que retirar (codigo 0) ===`)
  const fc = fichaCerrojo(c), k = claveDe(fc, c)
  log(`congelacion: ${describeCerrojo(fc)}`)
  if (k !== id) return fin(1, `=== ⚠️ ATENCION: el id dado no es el de esta congelacion (${k}): no se retira nada (codigo 1) ===`)
  try { await alm.borra(CONGELADO) } catch (e) { return fin(3, `=== ⚠️ ATENCION: no se pudo retirar (${texto(e)}) (codigo 3) ===`) }
  let x
  try { x = await alm.lee(CONGELADO) } catch (e) { return fin(3, `=== ⚠️ ATENCION: retirada sin confirmar (${texto(e)}) (codigo 3) ===`) }
  return x == null ? fin(0, `=== ✓ Congelacion retirada (${k}) (codigo 0) ===`) : fin(3, '=== ⚠️ ATENCION: sigue habiendo una congelacion: repetir sin argumentos para mirarla (codigo 3) ===')
}
