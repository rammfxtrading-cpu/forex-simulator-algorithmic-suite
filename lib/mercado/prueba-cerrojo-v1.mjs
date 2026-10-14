// lib/mercado/prueba-cerrojo-v1.mjs — EL CICLO DE PRUEBA del cerrojo del
// mercado v1 contra PostgREST real (public.mercado_cerrojo, sql/mercado-000-
// cerrojo.sql). Etapa 2; CTO 14-oct (ronda 5): tras mercado-001 y s14, antes
// de publicar nada (runbook, paso 3-bis). Comprueba con el puerto real
// (scripts/mercado-v1-dependencias.mjs cerrojoDe) lo que p.14.4.2 suponia sin
// haberlo visto: el 23505 de PostgREST, el maybeSingle, el DELETE condicional
// que devuelve sus filas, y que service_role ve la tabla.
//
//   (sin argumentos)   SIMULACRO: dice el ciclo; no llama a nada
//   --ejecuta          lo hace, con dos UUID de prueba P y Q nuevos:
//     0 SELECT                      → no hay cerrojo (si lo hay, no se prueba ni se toca)
//     1 INSERT P                    → ok
//     2 INSERT Q                    → «existe» (23505)
//     3 SELECT                      → dueño P
//     4 DELETE ... AND dueno = Q    → 0 filas
//       SELECT                      → sigue P
//     5 DELETE ... AND dueno = P    → 1 fila
//     6 SELECT                      → no hay cerrojo
// Si algo no cuadra, PARA en ese paso, sin seguir ni «arreglar»: relee una vez
// (medido, no deducido) y dice que fila queda. Si es de la prueba, dice como
// se libera, pero NO la libera: mientras quede, nadie publica (falla cerrado).
// Con CI o GITHUB_ACTIONS definidos no hace nada: es una comprobacion humana.
// deps: { cerrojo(), uuid(), entorno }
// Codigos: 0 ciclo correcto · 1 no ejecutado · 2 no cuadra (PARAR) · 3 error (PARAR) · 4 uso.
// E2-04: en el log, solo mensajes propios o «clase codigo» de lo ajeno.
import { RECURSO, CERROJO } from './publica-v1.mjs'
import { texto } from './errores.mjs'

export const DESCRIPCION = 'mercado-v1-prueba'

export async function ordenPruebaCerrojo(args, deps) {
  const lineas = [], log = l => lineas.push(l)
  const fin = (codigo, l) => { log(l); return { codigo, lineas } }
  const automatizado = ['CI', 'GITHUB_ACTIONS'].filter(v => Object.hasOwn(deps.entorno ?? {}, v))
  if (automatizado.length) {
    log(`Ejecucion automatizada (${automatizado.join(', ')} definido): el ciclo de prueba del cerrojo es una comprobacion humana. No se hace nada.`)
    return fin(1, '=== ⚠️ ATENCION: no se ha probado nada (entorno CI/automatizado) (codigo 1) ===')
  }
  const ejecuta = args.length === 1 && args[0] === '--ejecuta'
  if (!(args.length === 0 || ejecuta)) {
    log('Uso: node scripts/mercado-v1-prueba-cerrojo.mjs              → SIMULACRO: dice el ciclo; no llama a nada')
    log('     node scripts/mercado-v1-prueba-cerrojo.mjs --ejecuta    → hace el ciclo contra la base')
    return fin(4, '=== ⚠️ ATENCION: no se ha probado nada (codigo 4) ===')
  }
  log(`=== MERCADO V1 · CICLO DE PRUEBA DEL CERROJO ${CERROJO} · ${ejecuta ? 'EJECUTA' : 'SIMULACRO (no se llama a nada)'} ===`)
  if (!ejecuta) {
    log('Con --ejecuta, y solo si no hay cerrojo puesto, con dos UUID de prueba P y Q:')
    log('  1 INSERT P → ok · 2 INSERT Q → existe (23505) · 3 SELECT → P · 4 DELETE con Q → 0 filas (y P sigue) · 5 DELETE con P → 1 fila · 6 SELECT → no hay')
    log('Si algo no cuadra, para en ese paso y dice que queda; no libera nada.')
    return fin(1, '=== ⚠️ ATENCION: no se ha probado nada (falta --ejecuta) (codigo 1) ===')
  }
  const cer = deps.cerrojo()
  const P = deps.uuid(), Q = deps.uuid()
  log(`uuid de prueba: P ${P} · Q ${Q} · descripcion ${DESCRIPCION}`)
  const nuestro = new Set([P, Q])
  let intentado = false
  // al parar: relee una vez y dice que queda (no lo libera)
  const para = async (codigo, l) => {
    log(l)
    if (intentado) {
      let x
      try { x = await cer.lee(RECURSO) } catch (e) { x = undefined; log(`no se pudo releer el cerrojo (${texto(e)}): no se sabe que queda; se mira con node scripts/mercado-v1-liberar-cerrojo.mjs`) }
      if (x === null) log('no queda ningun cerrojo')
      else if (x !== undefined && nuestro.has(x?.dueno)) {
        log(`queda el cerrojo de prueba ${x.dueno}: mientras este, no se publica nada (falla cerrado)`)
        log(`para liberarlo, cuando lo diga el CTO: node scripts/mercado-v1-liberar-cerrojo.mjs --confirmo ${x.dueno}`)
      } else if (x !== undefined) log(ajeno(x))
    }
    return fin(codigo, `=== ⚠️ ATENCION: el ciclo NO cuadra: PARAR y pasar esta salida al CTO; no publicar (codigo ${codigo}) ===`)
  }
  const ajeno = x => `queda el cerrojo de ${typeof x?.dueno === 'string' ? x.dueno : '(sin dueño legible)'}, que no es de esta prueba: no se toca; decide el CTO`
  // un paso: lo que se espera y lo que se obtiene
  const paso = (n, que, esperado, obtenido, bien) => { log(`paso ${n}: ${que} → esperado ${esperado} · obtenido ${obtenido} ${bien ? '✓' : '✗'}`); return bien }
  const duenoDe = x => (x === null ? 'no hay' : typeof x?.dueno === 'string' ? x.dueno : 'ilegible')
  const NO = 'no cuadra: se para aqui'
  try {
    const x0 = await cer.lee(RECURSO)
    if (x0 !== null) { log(ajeno(x0)); return await para(2, `hay un cerrojo puesto (${duenoDe(x0)}): no se prueba ni se toca nada`) }
    intentado = true
    const a1 = await cer.adquiere(RECURSO, P, DESCRIPCION)
    if (!paso(1, `INSERT ${P}`, 'ok', a1, a1 === 'ok')) return await para(2, NO)
    const a2 = await cer.adquiere(RECURSO, Q, DESCRIPCION)
    if (!paso(2, `INSERT ${Q} con el cerrojo puesto`, 'existe (23505)', a2, a2 === 'existe')) return await para(2, NO)
    const x3 = await cer.lee(RECURSO)
    if (!paso(3, 'SELECT', `dueño ${P}`, duenoDe(x3), x3?.dueno === P && x3?.descripcion === DESCRIPCION && Number.isFinite(Date.parse(x3?.desde)))) return await para(2, NO)
    const n4 = await cer.suelta(RECURSO, Q)
    const x4 = n4 === 0 ? await cer.lee(RECURSO) : undefined
    if (!paso(4, `DELETE ... AND dueno = ${Q}`, '0 filas, y sigue P', n4 === 0 ? `0 filas, y ${duenoDe(x4)}` : n4, n4 === 0 && x4?.dueno === P)) return await para(2, NO)
    const n5 = await cer.suelta(RECURSO, P)
    if (!paso(5, `DELETE ... AND dueno = ${P}`, '1 fila', n5, n5 === 1)) return await para(2, NO)
    const x6 = await cer.lee(RECURSO)
    if (!paso(6, 'SELECT', 'no hay', duenoDe(x6), x6 === null)) { intentado = false; return await para(2, `${NO} (queda ${duenoDe(x6)})`) }
  } catch (e) {
    return await para(3, `error (${texto(e)})`)
  }
  return fin(0, '=== ✓ ciclo correcto: el cerrojo se comporta contra PostgREST como en el ensayo; no queda ninguno (codigo 0) ===')
}
