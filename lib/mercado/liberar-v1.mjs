// lib/mercado/liberar-v1.mjs — LIBERAR A MANO el cerrojo del bucket «mercado»
// (v1/_cerrojo.json, de lib/mercado/publica-v1.mjs). Etapa 2; CTO 13-oct
// (decision 3) y 14-oct: el patron del de forex-data (scripts/liberar-cerrojo.js)
// y SIN caducidad automatica, como cerro Astra en BD-01: un publicador lento que
// perdiera el cerrojo por tiempo podria seguir publicando encima de otro.
//
//   (sin argumentos)      SIMULACRO: enseña el cerrojo (id = UUID de la ejecucion,
//                         dueño, fecha y antigüedad segun la ficha) y como confirmar
//   --confirmo <clave>    lo libera si <clave> es la que enseña: el id; si la ficha
//                         no tiene un id valido, los 16 primeros hex del sha256 de
//                         sus bytes
// Antes de borrar: relee el cerrojo (si ha cambiado desde que se enseño, no borra)
// y deja CONSTANCIA en v1/_liberados/<cuando>.<clave>.json (sin upsert; si no se
// puede escribir, no borra). Despues, comprueba que ya no esta.
// Con CI o GITHUB_ACTIONS definidos no hace nada (BE-01): liberar exige que una
// persona compruebe que el proceso dueño ya no existe.
// deps: { almacen(), ahora(), entorno }   (almacen: el puerto de publica-v1)
// Codigos: 0 no habia cerrojo o liberado · 1 no liberado · 3 error · 4 uso.
// E2-04: en el log, solo mensajes propios o «clase codigo» de lo ajeno.
import { createHash } from 'crypto'
import { CERROJO, fichaCerrojo, describeCerrojo } from './publica-v1.mjs'
import { texto } from './errores.mjs'

export const LIBERADOS = 'v1/_liberados/'
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
  const confirma = args.length === 2 && args[0] === '--confirmo' && /^[0-9a-f-]{16,36}$/.test(args[1]) ? args[1] : null
  if (!(args.length === 0 || confirma)) {
    log('Uso: node scripts/mercado-v1-liberar-cerrojo.mjs                     → enseña el cerrojo; NO borra')
    log('     node scripts/mercado-v1-liberar-cerrojo.mjs --confirmo <clave>   → lo libera (la clave que enseña)')
    return fin(4, '=== ⚠️ ATENCION: no se ha liberado nada (codigo 4) ===')
  }
  const ahora = deps.ahora()
  log(`=== MERCADO V1 · CERROJO ${CERROJO} · ${confirma ? 'LIBERAR' : 'SIMULACRO (no se borra nada)'} · ${ahora} ===`)
  try {
    const alm = deps.almacen()
    let b
    try { b = await alm.lee(CERROJO) } catch (e) { return fin(3, `=== ⚠️ ATENCION: no se pudo leer el cerrojo (${texto(e)}) (codigo 3) ===`) }
    if (b == null) return fin(0, '=== ✓ No hay cerrojo: nada que liberar (codigo 0) ===')
    const f = fichaCerrojo(b), clave = claveDe(f, b)
    log(`cerrojo: ${describeCerrojo(f)}`)
    log(`antigüedad segun la ficha: ${antiguedad(f.desde, ahora)} · sha256 de sus bytes ${sha(b)}`)
    if (!confirma) {
      log('No caduca. Comprueba que el proceso dueño ya no existe (y, si quedo INCIERTO, reconcilia antes el puntero con node scripts/mercado-v1-verifica.mjs).')
      log(`Para liberarlo: node scripts/mercado-v1-liberar-cerrojo.mjs --confirmo ${clave}`)
      return fin(1, '=== ⚠️ ATENCION: no se ha liberado nada (falta --confirmo) (codigo 1) ===')
    }
    if (confirma !== clave) return fin(1, `=== ⚠️ ATENCION: la clave dada no es la de este cerrojo (${clave}): no se ha liberado nada (codigo 1) ===`)
    // el cerrojo no ha cambiado desde que se enseño
    let b2
    try { b2 = await alm.lee(CERROJO) } catch (e) { return fin(3, `=== ⚠️ ATENCION: no se pudo releer el cerrojo (${texto(e)}): no se ha liberado nada (codigo 3) ===`) }
    if (b2 == null || !b2.equals(b)) return fin(1, '=== ⚠️ ATENCION: el cerrojo ha cambiado (o ya no esta) desde que se enseño: no se ha liberado nada; repetir sin --confirmo (codigo 1) ===')
    // constancia, ANTES de borrar
    const ruta = `${LIBERADOS}${ahora.replace(/[-:]/g, '').replace(/\.\d{3}/, '')}.${clave}.json`
    const constancia = { esquema: 'mercado-liberacion@1', cerrojo: f.legible ? { id: f.id, dueno: f.dueno, desde: f.desde } : { ilegible: true }, sha256: sha(b), cuando: ahora, por: 'scripts/mercado-v1-liberar-cerrojo.mjs --confirmo' }
    let r
    try { r = await alm.sube(ruta, Buffer.from(JSON.stringify(constancia)), { upsert: false }) } catch (e) { return fin(3, `=== ⚠️ ATENCION: no se pudo dejar constancia en ${ruta} (${texto(e)}): no se ha liberado nada (codigo 3) ===`) }
    if (r === 'existe') return fin(3, `=== ⚠️ ATENCION: ya existe ${ruta}: no se ha liberado nada (codigo 3) ===`)
    log(`constancia: ${ruta}`)
    try { await alm.borra(CERROJO) } catch (e) { return fin(3, `=== ⚠️ ATENCION: no se pudo borrar el cerrojo (${texto(e)}); la constancia ${ruta} queda: repetir (codigo 3) ===`) }
    let b3
    try { b3 = await alm.lee(CERROJO) } catch (e) { return fin(3, `=== ⚠️ ATENCION: borrado sin confirmar (${texto(e)}): repetir sin --confirmo para mirarlo (codigo 3) ===`) }
    if (b3 != null) return fin(3, '=== ⚠️ ATENCION: tras borrarlo sigue habiendo un cerrojo: repetir sin --confirmo para mirarlo (codigo 3) ===')
    return fin(0, `=== ✓ Cerrojo liberado (${clave}); constancia en ${ruta} (codigo 0) ===`)
  } catch (e) {
    return fin(3, `=== ⚠️ ATENCION: no terminado (${texto(e)}) (codigo 3) ===`)
  }
}
