// lib/mercado/liberar-v1.mjs — LIBERAR A MANO el cerrojo del publicador del
// mercado v1 (la fila 'mercado/v1' de public.mercado_cerrojo, de
// sql/mercado-000-cerrojo.sql; lib/mercado/publica-v1.mjs). Etapa 2; CTO 13-oct
// (decision 3) y 14-oct: SIN caducidad automatica, como cerro Astra en BD-01:
// un publicador lento que perdiera el cerrojo por tiempo podria seguir
// publicando encima de otro.
//
//   (sin argumentos)       SIMULACRO: enseña el cerrojo (id = UUID de la ejecucion,
//                          descripcion, desde y antigüedad) y como confirmar
//   --confirmo <uuid>      lo libera si <uuid> es su dueño
//
// E2R3-01 (Astra, CTO 14-oct): el borrado es CONDICIONAL Y ATOMICO en la base:
// DELETE ... WHERE recurso = 'mercado/v1' AND dueno = <uuid confirmado>. Un
// DELETE incierto que llegue tarde solo puede borrar la fila de ese dueño,
// nunca la de otro publicador que haya tomado el cerrojo despues; por eso ya
// no hay congelacion (E2R2-03) ni --descongela. Con --confirmo:
//   1. relee el cerrojo: tiene que tener ese dueño (si no, no hace nada);
//   2. deja CONSTANCIA en v1/_liberados/<cuando>.<uuid>.json de Storage (sin
//      upsert; si no se puede escribir, no borra);
//   3. DELETE condicional; si la respuesta se pierde, relee: si sigue esa
//      fila, codigo 3 y repetir (repetir es inocuo: solo puede borrar esa).
// Lo que NO cubre (residual aceptado): liberar por error el cerrojo de un
// publicador que sigue VIVO; lo protege la confirmacion humana.
// Con CI o GITHUB_ACTIONS definidos no hace nada (BE-01): liberar exige que una
// persona compruebe que el proceso dueño ya no existe.
// deps: { cerrojo(), almacen(), ahora(), entorno }   (los puertos de publica-v1)
// Codigos: 0 no habia cerrojo o liberado · 1 no liberado · 3 error · 4 uso.
// E2-04: en el log, solo mensajes propios o «clase codigo» de lo ajeno; la
// descripcion, solo si es un valor propio conocido (E2R2-04).
import { createHash } from 'crypto'
import { RECURSO, CERROJO, fichaCerrojo, describeCerrojo } from './publica-v1.mjs'
import { texto } from './errores.mjs'

export const LIBERADOS = 'v1/_liberados/'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const sha = t => createHash('sha256').update(t).digest('hex')
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
  const confirma = args.length === 2 && args[0] === '--confirmo' && UUID.test(args[1]) ? args[1] : null
  if (!(args.length === 0 || confirma)) {
    log('Uso: node scripts/mercado-v1-liberar-cerrojo.mjs                     → enseña el cerrojo; NO borra')
    log('     node scripts/mercado-v1-liberar-cerrojo.mjs --confirmo <uuid>    → lo libera (el id que enseña)')
    return fin(4, '=== ⚠️ ATENCION: no se ha liberado nada (codigo 4) ===')
  }
  const ahora = deps.ahora()
  log(`=== MERCADO V1 · CERROJO ${CERROJO} · ${confirma ? 'LIBERAR' : 'SIMULACRO (no se borra nada)'} · ${ahora} ===`)
  try {
    const cer = deps.cerrojo()
    let fila
    try { fila = await cer.lee(RECURSO) } catch (e) { return fin(3, `=== ⚠️ ATENCION: no se pudo leer el cerrojo (${texto(e)}) (codigo 3) ===`) }
    if (fila == null) return fin(0, '=== ✓ No hay cerrojo: nada que liberar (codigo 0) ===')
    const f = fichaCerrojo(fila)
    log(`cerrojo: ${describeCerrojo(f)}`)
    log(`antigüedad: ${antiguedad(f.desde, ahora)}`)
    if (!f.id) return fin(3, '=== ⚠️ ATENCION: el cerrojo no tiene un dueño UUID valido: no se puede liberar condicionalmente; decide el CTO (codigo 3) ===')
    if (!confirma) {
      log('No caduca. Comprueba que el proceso dueño ya no existe (y, si quedo INCIERTO, reconcilia antes el puntero con node scripts/mercado-v1-verifica.mjs).')
      log(`Para liberarlo: node scripts/mercado-v1-liberar-cerrojo.mjs --confirmo ${f.id}`)
      return fin(1, '=== ⚠️ ATENCION: no se ha liberado nada (falta --confirmo) (codigo 1) ===')
    }
    if (confirma !== f.id) return fin(1, `=== ⚠️ ATENCION: el uuid dado no es el dueño de este cerrojo (${f.id}): no se ha liberado nada (codigo 1) ===`)
    // constancia, ANTES de borrar
    const ruta = `${LIBERADOS}${ahora.replace(/[-:]/g, '').replace(/\.\d{3}/, '')}.${confirma}.json`
    const constancia = { esquema: 'mercado-liberacion@2', cerrojo: { recurso: RECURSO, id: f.id, dueno: f.dueno, desde: f.desde }, sha256: sha(JSON.stringify({ dueno: f.id, desde: f.desde, descripcion: f.dueno })), cuando: ahora, por: 'scripts/mercado-v1-liberar-cerrojo.mjs --confirmo' }
    let r
    try { r = await deps.almacen().sube(ruta, Buffer.from(JSON.stringify(constancia)), { upsert: false }) } catch (e) { return fin(3, `=== ⚠️ ATENCION: no se pudo dejar constancia en ${ruta} (${texto(e)}): no se ha liberado nada (codigo 3) ===`) }
    if (r === 'existe') return fin(3, `=== ⚠️ ATENCION: ya existe ${ruta}: no se ha liberado nada (codigo 3) ===`)
    log(`constancia: ${ruta}`)
    // DELETE condicional: solo la fila de ESE dueño
    let n
    try { n = await cer.suelta(RECURSO, confirma) } catch (e) {
      let x
      try { x = await cer.lee(RECURSO) } catch (e2) { return fin(3, `=== ⚠️ ATENCION: borrado sin confirmar (${texto(e)}; ${texto(e2)}): repetir es inocuo (solo puede borrar ese dueño) (codigo 3) ===`) }
      if (x?.dueno === confirma) return fin(3, `=== ⚠️ ATENCION: no se pudo borrar el cerrojo (${texto(e)}); la constancia ${ruta} queda: repetir es inocuo (solo puede borrar ese dueño) (codigo 3) ===`)
      n = 1
    }
    if (n === 0) log('el cerrojo de ese dueño ya no estaba al borrar (lo solto su dueño u otra liberacion): no se ha tocado nada mas')
    return fin(0, `=== ✓ Cerrojo de ${confirma} liberado; constancia en ${ruta} (codigo 0) ===`)
  } catch (e) {
    return fin(3, `=== ⚠️ ATENCION: no terminado (${texto(e)}) (codigo 3) ===`)
  }
}
