// Ejecuta un script CommonJS de scripts/ (actualizar-diario.js, restore-2026.js)
// con sus dependencias FALSAS, sin red y sin secretos:
//   require('dukascopy-node')        → proveedor-falso.mjs
//   require('@supabase/supabase-js') → supabase-falso.mjs (la misma base en memoria)
//   reloj                            → fijo en `ahora` (Date sin argumentos y Date.now);
//                                      con `reloj: { ms }` (opcional, bloque G punto 9)
//                                      marca reloj.ms, que la prueba puede adelantar
//   setTimeout                       → inmediato (los sleep de 400 ms a 10 s)
//   cwd                              → un directorio temporal con un .env.local FALSO
//                                      (restore-2026.js lo lee de la carpeta actual)
// ⛔ Guarda de fs (H05): un .env fuera de ese directorio temporal se DENIEGA
//    ANTES DE ABRIRLO (error «LECTURA DE .env DENEGADA») y se apunta en
//    `envLeidos`; `envTodos` lista todos los intentos, tambien el sintetico.
import Module, { createRequire } from 'node:module'
import fs from 'node:fs'
import os from 'node:os'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as proveedorFalso from './proveedor-falso.mjs'
import * as supabaseFalso from './supabase-falso.mjs'
import { REPO } from './lib.mjs'

// Termina cuando el script imprime su veredicto final (actualizar-diario: «=== ✓
// TODO OK» o «=== ⚠️ ATENCION»; restore-2026: «Done.»), un Fatal o un process.exit.
const FINAL = /=== ✓ TODO OK|=== ⚠️ ATENCION|^Done\.$|^Fatal/
// H06 (revision de Astra, 4-oct): se devuelve COMO termino el script.
//   terminoPor 'final'   imprimio su veredicto final (codigo = process.exitCode ?? 0)
//   terminoPor 'exit'    llamo a process.exit(c) (codigo = c): gana la primera
//                        llamada, se corta el codigo sincrono que la sigue (como un
//                        exit real) y lo que imprima despues ya no cuenta
//   terminoPor 'timeout' no termino en limiteMs (codigo null): la prueba que lo
//                        use tiene que fallar (control «termino, no por timeout»)
// Cada ejecucion, para el control final de las pruebas: ninguna por timeout.
export const ejecucionesScripts = []
// H06, la repeticion por carga (CTO 15-oct). El control vigila TIEMPO DE RELOJ: un script que no termina
// (p. ej. esperando una promesa que nunca se resuelve) no gasta CPU, asi que con process.cpuUsage el
// limite no saltaria nunca y el control no cazaria el cuelgue. Por eso no se mide CPU. Con la maquina
// cargada, un script sano puede pasar de los 20 s: controlH06 repite la prueba ENTERA una sola vez, en un
// proceso nuevo, SOLO si la carga media de 1 minuto supera el numero de nucleos, y lo dice en la salida.
// El limite no cambia. Solo para la prueba del control (pruebas/h06-repeticion.mjs), y siempre con aviso:
//   H06_ESPERA_PLANTADA=1  ningun script termina: el d05 «lento de verdad»
//   H06_LIMITE_MS=<ms>     un limite mas corto (solo mas corto), para que esa prueba no tarde minutos
//   H06_CARGA_FORZADA=<n>  la carga que ve controlH06, en vez de os.loadavg()
const LIMITE_MS = 20000
const ARGV_INICIAL = [...process.argv], CWD_INICIAL = process.cwd()
const limitePorDefecto = () => {
  const x = Number(process.env.H06_LIMITE_MS)
  return Number.isFinite(x) && x > 0 && x < LIMITE_MS ? x : LIMITE_MS
}
let avisado = false
const avisaH06 = () => {
  if (avisado) return; avisado = true
  if (process.env.H06_ESPERA_PLANTADA === '1') console.log('H06: ESPERA PLANTADA (prueba del control): ningun script termina')
  if (limitePorDefecto() !== LIMITE_MS) console.log(`H06: limite de la prueba del control: ${limitePorDefecto()} ms (el normal, ${LIMITE_MS} ms)`)
}
export function controlH06(ver) {
  const porTimeout = ejecucionesScripts.filter(e => e.terminoPor === 'timeout')
  const repeticion = process.env.H06_REPETICION === '1'
  if (porTimeout.length && !repeticion) {
    const forzada = Number(process.env.H06_CARGA_FORZADA)
    const carga = process.env.H06_CARGA_FORZADA && Number.isFinite(forzada) ? forzada : os.loadavg()[0]
    const nucleos = os.cpus().length
    if (carga > nucleos) {
      console.log(`H06: ${porTimeout.length} script(s) por timeout con la carga media de 1 min ${carga.toFixed(2)} > ${nucleos} nucleos: se repite la prueba entera UNA vez, en un proceso nuevo, y vale la repeticion`)
      const r = spawnSync(process.execPath, [...process.execArgv, ...ARGV_INICIAL.slice(1)], { cwd: CWD_INICIAL, stdio: 'inherit', env: { ...process.env, H06_REPETICION: '1' } })
      process.exit(r.status ?? 1)
    }
    console.log(`H06: ${porTimeout.length} script(s) por timeout con la carga media de 1 min ${carga.toFixed(2)} <= ${nucleos} nucleos: no se repite`)
  }
  if (repeticion) console.log('H06: esta es la REPETICION por carga (la unica): su resultado es el que vale')
  ver('control (H06): todos los scripts terminaron (veredicto o exit), ninguno por timeout', ejecucionesScripts.length > 0 && porTimeout.length === 0, JSON.stringify(ejecucionesScripts.map(e => e.terminoPor + ':' + e.codigo)))
}
export class SalidaDeScript extends Error { constructor(c) { super(`process.exit(${c})`); this.salidaDeScript = true; this.codigo = c } }
export async function correScript(rel, { ahora, argv = [], env = {}, limiteMs = limitePorDefecto(), reloj = null } = {}) {
  avisaH06()
  const plantada = process.env.H06_ESPERA_PLANTADA === '1'
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'simscript-'))
  fs.writeFileSync(path.join(tmp, '.env.local'), 'NEXT_PUBLIC_SUPABASE_URL=https://falso.supabase.co\nSUPABASE_SERVICE_ROLE_KEY=falsa\n')
  const salida = [], envLeidos = [], envTodos = [], esperas = []
  const orig = { load: Module._load, read: fs.readFileSync,
    fs: { readFileSync: fs.readFileSync, openSync: fs.openSync, createReadStream: fs.createReadStream, readFile: fs.readFile, open: fs.open,
      promisesReadFile: fs.promises.readFile, promisesOpen: fs.promises.open }, st: globalThis.setTimeout, fetch: globalThis.fetch, Date: globalThis.Date, log: console.log, err: console.error,
    write: process.stdout.write, cwd: process.cwd(), argv: process.argv, env: { ...process.env }, exitCode: process.exitCode, exit: process.exit }
  const fijo = new orig.Date(ahora).getTime()
  if (reloj && !Number.isFinite(reloj.ms)) reloj.ms = fijo
  const marca = () => (reloj ? reloj.ms : fijo)
  class FechaFija extends orig.Date { constructor(...a) { a.length ? super(...a) : super(marca()) } static now() { return marca() } }
  let terminado, final = new Promise(r => { terminado = r })
  let terminoPor = null, codigo = null
  try {
    Module._load = function (spec, ...resto) {
      if (spec === 'dukascopy-node') return proveedorFalso
      if (spec === '@supabase/supabase-js') return supabaseFalso
      return orig.load.call(this, spec, ...resto)
    }
    // H05 (revision de Astra, 4-oct): cualquier .env que NO sea el sintetico de
    // la carpeta temporal se DENIEGA ANTES DE ABRIRLO (antes solo se anotaba, y
    // despues se leia igual). Se cubren las vias de lectura de fs.
    // H05 (bloque D, punto 8; Astra, cierres 5-oct): se admite SOLO el fixture
    // exacto, comparando RUTAS CANONICAS (enlaces resueltos). Antes valia
    // cualquier ruta con el prefijo de la carpeta temporal, sin resolver
    // enlaces: «temporal/enlace-a-ajena/.env.local» llegaba a un .env ajeno. Se
    // mira tambien el nombre del DESTINO real (un enlace «datos.txt» → .env).
    // BD-06 (Astra, verificacion del bloque D; bloque E, punto 5): una URL file:
    // se convierte con fileURLToPath ANTES de resolver (URL.pathname dejaba
    // «%2eenv.local» sin decodificar y pasaba). Si la ruta no se puede comprobar
    // (URL no file:, host remoto, error que no es «no existe»), se DENIEGA.
    const fixtureReal = fs.realpathSync(path.join(tmp, '.env.local'))
    const aRuta = p => {
      if (p instanceof URL) { if (p.protocol !== 'file:') throw new Error('URL que no es file:'); return fileURLToPath(p) }
      return Buffer.isBuffer(p) ? p.toString('utf8') : String(p)
    }
    // ruta canonica; si no existe, la de su carpeta (resuelta) + el nombre
    const canonica = r => {
      try { return fs.realpathSync(r) } catch (e) {
        if (e?.code !== 'ENOENT') throw e
        const padre = path.dirname(r)
        return padre === r ? r : path.join(canonica(padre), path.basename(r))
      }
    }
    const guarda = (p, via) => {
      if (typeof p !== 'string' && !(p instanceof URL) && !Buffer.isBuffer(p)) return     // un descriptor: ya abierto por otra via guardada
      let ruta, real
      try { ruta = path.resolve(aRuta(p)); real = canonica(ruta) } catch (e) {
        envLeidos.push(String(p))
        throw new Error(`LECTURA DE .env DENEGADA (${via}): no se puede comprobar ${String(p)} (${e?.message ?? e})`)
      }
      if (!/\.env/.test(path.basename(ruta)) && !/\.env/.test(path.basename(real))) return
      envTodos.push(ruta)
      if (real === fixtureReal) return
      envLeidos.push(ruta)
      throw new Error(`LECTURA DE .env DENEGADA (${via}): ${ruta}${real !== ruta ? ' → ' + real : ''}`)
    }
    for (const via of ['readFileSync', 'openSync', 'createReadStream']) fs[via] = function (p, ...resto) { guarda(p, via); return orig.fs[via].call(this, p, ...resto) }
    for (const via of ['readFile', 'open']) fs[via] = function (p, ...resto) { guarda(p, via); return orig.fs[via].call(this, p, ...resto) }
    fs.promises.readFile = function (p, ...resto) { guarda(p, 'promises.readFile'); return orig.fs.promisesReadFile.call(this, p, ...resto) }
    fs.promises.open = function (p, ...resto) { guarda(p, 'promises.open'); return orig.fs.promisesOpen.call(this, p, ...resto) }
    // bloque N, punto 2: se apunta lo que PIDE cada espera (esperas, en ms) aunque corra al instante
    // con reloj.alEsperar(ms) (opcional; Astra MER-R1): cada espera adelanta el reloj
    // lo que devuelva (p. ej. un despertar TARDIO del temporizador)
    globalThis.setTimeout = (f, ms, ...a) => { esperas.push(ms ?? 0); if (reloj?.alEsperar) reloj.ms += reloj.alEsperar(ms ?? 0); return orig.st(f, 0, ...a) }
    // el fetch del proveedor de los scripts (lib/mercado/conexion.mjs fetchDelJob): el doble
    globalThis.__dobleProveedor = proveedorFalso.fetchFalso
    // bloque F, punto 4: el fetch del script es el del proveedor falso (fuera, bloqueado)
    globalThis.fetch = proveedorFalso.fetchFalso
    globalThis.Date = FechaFija
    const apunta = (...a) => { if (terminoPor === 'exit') return; const l = a.join(' '); salida.push(l); if (!terminoPor && FINAL.test(l.trim())) { terminoPor = 'final'; orig.st(terminado, 30) } }
    console.log = apunta; console.error = apunta
    process.stdout.write = s => { if (terminoPor !== 'exit') salida.push(String(s)); return true }
    process.exit = c => {
      if (terminoPor !== 'exit') { terminoPor = 'exit'; codigo = c ?? process.exitCode ?? 0; salida.push(`[process.exit(${codigo})]`); terminado() }
      throw new SalidaDeScript(codigo)
    }
    process.chdir(tmp)
    process.argv = [process.argv[0], path.join(REPO, rel), ...argv]
    Object.assign(process.env, env)
    process.exitCode = undefined
    const req = createRequire(path.join(REPO, 'package.json'))
    delete req.cache[req.resolve(path.join(REPO, rel))]
    try { req(path.join(REPO, rel)) } catch (e) { if (!e?.salidaDeScript) throw e }
    await Promise.race([plantada ? new Promise(() => {}) : final, new Promise(r => orig.st(r, limiteMs))])
    if (!terminoPor || plantada) { terminoPor = 'timeout'; codigo = null }
    else if (terminoPor === 'final') codigo = process.exitCode ?? 0
    ejecucionesScripts.push({ rel, terminoPor, codigo })
    return { salida, envLeidos, envTodos, codigo, terminoPor, exitCode: codigo, tmp, esperas }
  } finally {
    Module._load = orig.load
    for (const via of ['readFileSync', 'openSync', 'createReadStream', 'readFile', 'open']) fs[via] = orig.fs[via]
    fs.promises.readFile = orig.fs.promisesReadFile; fs.promises.open = orig.fs.promisesOpen; globalThis.setTimeout = orig.st; globalThis.Date = orig.Date; globalThis.fetch = orig.fetch; delete globalThis.__dobleProveedor
    console.log = orig.log; console.error = orig.err; process.stdout.write = orig.write; process.exit = orig.exit
    process.chdir(orig.cwd); process.argv = orig.argv
    for (const k of Object.keys(process.env)) if (!(k in orig.env)) delete process.env[k]
    process.exitCode = orig.exitCode
    fs.rmSync(tmp, { recursive: true, force: true })
  }
}
