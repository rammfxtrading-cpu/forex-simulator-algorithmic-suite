// Ejecuta un script CommonJS de scripts/ (actualizar-diario.js, restore-2026.js)
// con sus dependencias FALSAS, sin red y sin secretos:
//   require('dukascopy-node')        → proveedor-falso.mjs
//   require('@supabase/supabase-js') → supabase-falso.mjs (la misma base en memoria)
//   reloj                            → fijo en `ahora` (Date sin argumentos y Date.now)
//   setTimeout                       → inmediato (los sleep de 400 ms a 10 s)
//   cwd                              → un directorio temporal con un .env.local FALSO
//                                      (restore-2026.js lo lee de la carpeta actual)
// ⛔ Vigila fs: si el script abre CUALQUIER .env fuera de ese directorio temporal,
//    lo apunta en `envLeidos` y la prueba tiene que fallar. Nunca se imprime su
//    contenido (el falso no tiene nada que imprimir).
import Module, { createRequire } from 'node:module'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import * as proveedorFalso from './proveedor-falso.mjs'
import * as supabaseFalso from './supabase-falso.mjs'
import { REPO } from './lib.mjs'

// Termina cuando el script imprime su veredicto final (actualizar-diario: «=== ✓
// TODO OK» o «=== ⚠️ ATENCION»; restore-2026: «Done.»), un Fatal o un process.exit.
const FINAL = /=== ✓ TODO OK|=== ⚠️ ATENCION|^Done\.$|^Fatal/
export async function correScript(rel, { ahora, argv = [], env = {} } = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'simscript-'))
  fs.writeFileSync(path.join(tmp, '.env.local'), 'NEXT_PUBLIC_SUPABASE_URL=https://falso.supabase.co\nSUPABASE_SERVICE_ROLE_KEY=falsa\n')
  const salida = [], envLeidos = [], envTodos = []
  const orig = { load: Module._load, read: fs.readFileSync, st: globalThis.setTimeout, Date: globalThis.Date, log: console.log, err: console.error,
    write: process.stdout.write, cwd: process.cwd(), argv: process.argv, env: { ...process.env }, exitCode: process.exitCode, exit: process.exit }
  const fijo = new orig.Date(ahora).getTime()
  class FechaFija extends orig.Date { constructor(...a) { a.length ? super(...a) : super(fijo) } static now() { return fijo } }
  let terminado, final = new Promise(r => { terminado = r })
  try {
    Module._load = function (spec, ...resto) {
      if (spec === 'dukascopy-node') return proveedorFalso
      if (spec === '@supabase/supabase-js') return supabaseFalso
      return orig.load.call(this, spec, ...resto)
    }
    fs.readFileSync = function (p, ...resto) {
      const ruta = path.resolve(String(p))
      if (/\.env/.test(path.basename(ruta))) { envTodos.push(ruta); if (!ruta.startsWith(fs.realpathSync(tmp)) && !ruta.startsWith(tmp)) envLeidos.push(ruta) }
      return orig.read.call(this, p, ...resto)
    }
    globalThis.setTimeout = (f, ms, ...a) => orig.st(f, 0, ...a)
    globalThis.Date = FechaFija
    const apunta = (...a) => { const l = a.join(' '); salida.push(l); if (FINAL.test(l.trim())) orig.st(terminado, 30) }
    console.log = apunta; console.error = apunta
    process.stdout.write = s => { salida.push(String(s)); return true }
    process.exit = c => { salida.push(`[process.exit(${c})]`); terminado(); }
    process.chdir(tmp)
    process.argv = [process.argv[0], path.join(REPO, rel), ...argv]
    Object.assign(process.env, env)
    process.exitCode = undefined
    const req = createRequire(path.join(REPO, 'package.json'))
    delete req.cache[req.resolve(path.join(REPO, rel))]
    req(path.join(REPO, rel))
    await Promise.race([final, new Promise(r => orig.st(r, 20000))])
    return { salida, envLeidos, envTodos, exitCode: process.exitCode, tmp }
  } finally {
    Module._load = orig.load; fs.readFileSync = orig.read; globalThis.setTimeout = orig.st; globalThis.Date = orig.Date
    console.log = orig.log; console.error = orig.err; process.stdout.write = orig.write; process.exit = orig.exit
    process.chdir(orig.cwd); process.argv = orig.argv
    for (const k of Object.keys(process.env)) if (!(k in orig.env)) delete process.env[k]
    process.exitCode = orig.exitCode
    fs.rmSync(tmp, { recursive: true, force: true })
  }
}
