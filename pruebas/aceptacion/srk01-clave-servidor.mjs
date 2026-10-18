/**
 * SRK01 · LA CLAVE DE SERVIDOR: primero SUPABASE_SECRET_KEY, si no la vieja (orden 2-018 del CTO)
 *
 * lib/claveServidor.cjs, el UNICO sitio del repo que lee las dos variables, en las tres situaciones de la orden
 * (solo la nueva, solo la vieja, ninguna → error claro sin imprimir nada) y sus bordes (las dos, vacias —un
 * secreto de Actions que no existe llega como ''—, con salto de linea, una que no es secret key). Y que la usan
 * de verdad: la app (lib/authApi.js), los scripts (actualizar-diario.js REAL con su entorno, con el .env.local y
 * con DIAG_CREDS) y los dos workflows (pasan la nueva junto a la vieja, en el mismo env).
 * Claves ficticias; sin red; Storage y proveedor falsos.
 */
import { createRequire } from 'node:module'
import { readdirSync } from 'node:fs'
import { titulo, ver, oraculo, fin, fuente, importa, escenario, proveedor, REPO } from '../lib.mjs'
import { diaM1 } from '../proveedor-falso.mjs'
import { correScript, ejecucionesScripts } from '../script-falso.mjs'
const YAML = createRequire(REPO + 'package.json')('yaml')

// contra el codigo de antes (historicas.sh) el helper no existe: sus oraculos salen en ROJO, no como excepcion
let helper
try { helper = createRequire(import.meta.url)('../../lib/claveServidor.cjs') } catch {
  const falta = () => { throw new Error('lib/claveServidor.cjs no existe') }
  helper = { getClaveServidor: falta, hayClaveServidor: falta, variableClaveServidor: falta }
}
const { getClaveServidor, hayClaveServidor, variableClaveServidor } = helper
const prueba = (f) => { try { return f() } catch { return undefined } }
const NUEVA = 'sb_secret_ficticia_NUEVA_0123456789'
const VIEJA = 'eyJficticia.VIEJA.firma'
const URL = 'https://falso.supabase.co'

// lo que se escribe en la consola mientras corre f (tiene que ser nada)
function callado(f) {
  const escrito = []
  const orig = { log: console.log, error: console.error, warn: console.warn, info: console.info, out: process.stdout.write, err: process.stderr.write }
  console.log = console.error = console.warn = console.info = (...a) => { escrito.push(a.join(' ')) }
  process.stdout.write = process.stderr.write = (t) => { escrito.push(String(t)); return true }
  let valor, error
  try { valor = f() } catch (e) { error = e } finally {
    Object.assign(console, { log: orig.log, error: orig.error, warn: orig.warn, info: orig.info })
    process.stdout.write = orig.out; process.stderr.write = orig.err
  }
  return { valor, error, escrito }
}
const sinClave = (m, ...claves) => claves.every((c) => !m.includes(c) && !m.includes(c.slice(0, 12)) && !m.includes(c.slice(-8)))

titulo('1 · las tres situaciones de la orden')
{
  const r = callado(() => getClaveServidor({ SUPABASE_SECRET_KEY: NUEVA }))
  oraculo('SRK01', 'solo la nueva: la usa', r.valor === NUEVA && !r.error)
  const v = callado(() => getClaveServidor({ SUPABASE_SERVICE_ROLE_KEY: VIEJA }))
  oraculo('SRK01', 'solo la vieja: la usa', v.valor === VIEJA && !v.error)
  const n = callado(() => getClaveServidor({}))
  oraculo('SRK01', 'ninguna: error claro (nombra las dos variables)', n.error instanceof Error && /Falta la clave de servidor/.test(n.error.message)
    && /SUPABASE_SECRET_KEY/.test(n.error.message) && /SUPABASE_SERVICE_ROLE_KEY/.test(n.error.message), n.error?.message)
  oraculo('SRK01', '…y no escribe nada en la consola', r.escrito.length + v.escrito.length + n.escrito.length === 0, JSON.stringify([...r.escrito, ...v.escrito, ...n.escrito]).slice(0, 200))
}

titulo('2 · los bordes')
{
  oraculo('SRK01', 'las dos: gana la nueva', prueba(() => getClaveServidor({ SUPABASE_SECRET_KEY: NUEVA, SUPABASE_SERVICE_ROLE_KEY: VIEJA }) === NUEVA))
  oraculo('SRK01', 'la nueva VACIA (un secreto de Actions que no existe): usa la vieja', prueba(() => getClaveServidor({ SUPABASE_SECRET_KEY: '', SUPABASE_SERVICE_ROLE_KEY: VIEJA }) === VIEJA))
  oraculo('SRK01', 'la nueva de solo espacios: usa la vieja', prueba(() => getClaveServidor({ SUPABASE_SECRET_KEY: '  \n', SUPABASE_SERVICE_ROLE_KEY: VIEJA }) === VIEJA))
  oraculo('SRK01', 'las dos vacias: el error de ninguna, y hayClaveServidor dice que no', /Falta la clave de servidor/.test(callado(() => getClaveServidor({ SUPABASE_SECRET_KEY: ' ', SUPABASE_SERVICE_ROLE_KEY: '' })).error?.message ?? '')
    && prueba(() => hayClaveServidor({ SUPABASE_SECRET_KEY: ' ', SUPABASE_SERVICE_ROLE_KEY: '' })) === false && prueba(() => hayClaveServidor({ SUPABASE_SECRET_KEY: NUEVA })) === true && prueba(() => hayClaveServidor({ SUPABASE_SERVICE_ROLE_KEY: VIEJA })) === true)
  oraculo('SRK01', 'con un salto de linea al final (pegada en GitHub o Vercel): la nueva, sin el', prueba(() => getClaveServidor({ SUPABASE_SECRET_KEY: NUEVA + '\n' }) === NUEVA))
  // SRK-REV-02: la VIEJA tambien se recorta (los scripts ya lo hacian: «Invalid Compact JWS»)
  oraculo('SRK01', 'solo la vieja con un salto de linea al final: la vieja, sin el', prueba(() => getClaveServidor({ SUPABASE_SERVICE_ROLE_KEY: VIEJA + '\n' }) === VIEJA))
  oraculo('SRK01', 'variableClaveServidor da el NOMBRE de la que se usa', prueba(() => variableClaveServidor({ SUPABASE_SECRET_KEY: NUEVA, SUPABASE_SERVICE_ROLE_KEY: VIEJA })) === 'SUPABASE_SECRET_KEY'
    && prueba(() => variableClaveServidor({ SUPABASE_SECRET_KEY: '', SUPABASE_SERVICE_ROLE_KEY: VIEJA })) === 'SUPABASE_SERVICE_ROLE_KEY')
  for (const [d, mala] of [['una publishable', 'sb_publishable_ficticia_0123456789'], ['la service_role vieja (un JWT)', VIEJA], ['otra cosa', 'clave-cualquiera-ficticia']]) {
    const r = callado(() => getClaveServidor({ SUPABASE_SECRET_KEY: mala, SUPABASE_SERVICE_ROLE_KEY: VIEJA }))
    oraculo('SRK01', `en la nueva, ${d}: error (no cae a la vieja en silencio), sin el valor ni un trozo y sin escribir nada`,
      r.error instanceof Error && /no tiene forma de secret key/.test(r.error.message) && sinClave(r.error.message + (r.error.stack ?? ''), mala, VIEJA) && r.escrito.length === 0, r.error?.message)
  }
  const n = callado(() => getClaveServidor({}))
  oraculo('SRK01', 'el error de ninguna no lleva nada del entorno', /Falta la clave de servidor/.test(n.error?.message ?? '') && sinClave(n.error.message + (n.error.stack ?? ''), NUEVA, VIEJA))
}

titulo('2b · SRK-01: caracteres que no valen en una cabecera HTTP (Astra; CTO, 2-036)')
{
  // tras recortar, solo ASCII visible (0x21–0x7E): lo demás, error fijo y sin valor; si la nueva está y es inválida, NO cae a la vieja
  const MALOS = [['un LF interior', '\nFICTICIA_COLA'], ['un CR', '\rFICTICIA_COLA'], ['un NUL', '\u0000FICTICIA_COLA'], ['un TAB', '\tFICTICIA_COLA'], ['un espacio interior', ' FICTICIA_COLA'], ['una «ñ»', 'ñ'], ['un emoji', '\u{1F511}']]
  for (const [d, cola] of MALOS) {
    const mala = NUEVA + cola
    const r = callado(() => getClaveServidor({ SUPABASE_SECRET_KEY: mala, SUPABASE_SERVICE_ROLE_KEY: VIEJA }))
    oraculo('SRK01', `la nueva con ${d}: error fijo, no cae a la vieja, sin el valor ni un trozo y sin escribir nada`,
      r.error instanceof Error && /SUPABASE_SECRET_KEY tiene caracteres no v[aá]lidos para una cabecera HTTP/.test(r.error.message) && sinClave(r.error.message + (r.error.stack ?? ''), mala, VIEJA) && r.escrito.length === 0, r.error?.message)
    const malaV = VIEJA + cola
    const v = callado(() => getClaveServidor({ SUPABASE_SERVICE_ROLE_KEY: malaV }))
    oraculo('SRK01', `la vieja con ${d}: error fijo, sin el valor ni un trozo y sin escribir nada`,
      v.error instanceof Error && /SUPABASE_SERVICE_ROLE_KEY tiene caracteres no v[aá]lidos para una cabecera HTTP/.test(v.error.message) && sinClave(v.error.message + (v.error.stack ?? ''), malaV) && v.escrito.length === 0, v.error?.message)
  }
  oraculo('SRK01', 'CONTROL: la nueva y la vieja de forma normal siguen pasando',
    callado(() => getClaveServidor({ SUPABASE_SECRET_KEY: NUEVA })).valor === NUEVA && callado(() => getClaveServidor({ SUPABASE_SERVICE_ROLE_KEY: VIEJA })).valor === VIEJA, '')
  // la CONSOLA de la ruta real, como la midió Astra: un proceso aparte con el módulo real y el SDK real; el transporte es
  // un doble que construye el Request nativo (y no manda nada). Con el LF interior: ni rastro de la clave en la consola
  {
    const { spawnSync } = await import('node:child_process')
    const { fileURLToPath: aRuta } = await import('node:url')
    const R = aRuta(new globalThis.URL('../../', import.meta.url))
    const marca = 'sb_secret_' + 'FICTICIA_CONSOLA_12345'
    const ACCION = "const m = await import(pathToFileURL(R + 'lib/authApi.js').href); await m.requireUser({ headers: { authorization: 'Bearer TOKEN_FICTICIO' } }, { status() { return this }, json() { return this } })"
    const CODIGO = [
      "import fs from 'node:fs'; import { registerHooks } from 'node:module'; import { pathToFileURL, fileURLToPath } from 'node:url'",
      "registerHooks({ resolve(s, c, next) { if (s.startsWith('.') && c.parentURL && !c.parentURL.includes('/node_modules/')) { const u = new URL(s, c.parentURL); if (!/\\.(c|m)?js$/.test(u.pathname) && fs.existsSync(fileURLToPath(u) + '.js')) return next(u.href + '.js', c) } return next(s, c) } })",
      'const R = ' + JSON.stringify(R) + '; const M = process.env.MARCA',
      "let llegadas = 0; globalThis.fetch = async (u, i) => { llegadas++; new Request(u, i); throw new Error('el doble del transporte no manda nada') }",
      "const logs = []; for (const k of ['log', 'error', 'warn', 'info', 'debug']) console[k] = (...v) => logs.push(v.map((x) => x?.stack || String(x)).join(' '))",
      "let error = ''",
      'try { ' + ACCION + ' } catch (e) { error = String(e?.stack ?? e) }',
      "process.stdout.write(JSON.stringify({ fuga: logs.some((l) => l.includes(M)) || error.includes(M), escritos: logs.length, error: error.split('\\n')[0].split(M).join('«MARCA»'), llegadas }))",
    ].join('\n')
    const hijo = (clave) => {
      const h = spawnSync(process.execPath, ['--input-type=module', '-e', CODIGO], { cwd: R, encoding: 'utf8',
        env: { PATH: process.env.PATH, HOME: process.env.HOME ?? '/tmp', NEXT_PUBLIC_SUPABASE_URL: 'https://ficticio.invalid', SUPABASE_SECRET_KEY: clave, MARCA: marca } })
      try { return JSON.parse(h.stdout) } catch { return { roto: (h.stderr || h.stdout).split(marca).join('«MARCA»').slice(0, 300) } }
    }
    const mal = hijo(marca + '\nFICTICIA_COLA')
    oraculo('SRK01', 'consola de lib/authApi.js real (su cliente y requireUser, con el SDK) con el LF interior (el caso de Astra): ni rastro de la clave, error fijo y sin llegar al transporte',
      mal.fuga === false && mal.llegadas === 0 && /SUPABASE_SECRET_KEY tiene caracteres no v[aá]lidos/.test(mal.error ?? ''), JSON.stringify(mal))
    const bien = hijo(marca)
    oraculo('SRK01', 'CONTROL de la medida: con una clave de forma normal, la misma ruta SÍ llega al transporte (el doble) y sin fuga',
      bien.llegadas >= 1 && bien.fuga === false, JSON.stringify(bien))
  }
}

titulo('3 · los scripts REALES: actualizar-diario.js (en seco) con el entorno de Actions, y restore-2026.js con el .env.local')
{
  const usada = async (env, script = 'scripts/actualizar-diario.js') => {
    escenario({ storage: { 'forex-data': {} } })
    proveedor.responde = a => diaM1(a.dates.from.toISOString().slice(0, 10))
    globalThis.__clavesUsadas = []
    const r = await correScript(script, { ahora: '2026-01-07T06:00:00Z', argv: [], env })
    return { r, claves: globalThis.__clavesUsadas.slice() }
  }
  // el codigo de antes no conoce la nueva: con solo ella iria a leer el .env.local del repo, que la guarda de
  // script-falso deniega con una excepcion; contra ese codigo, los oraculos de aqui salen en ROJO sin correrlo
  const usaHelper = ['scripts/actualizar-diario.js', 'scripts/restore-2026.js'].every((f) => fuente(f).includes("require('../lib/claveServidor.cjs')"))
  if (!usaHelper) for (const d of ['solo la nueva', 'Actions sin el secreto nuevo', 'restore-2026.js del .env.local', 'DIAG_CREDS con la nueva']) oraculo('SRK01', `${d}: los scripts no usan lib/claveServidor.cjs`, false)
  else {
  const a = await usada({ NEXT_PUBLIC_SUPABASE_URL: URL, SUPABASE_SECRET_KEY: NUEVA })
  oraculo('SRK01', 'solo la nueva en el entorno: el cliente se crea con ella', a.claves.length > 0 && a.claves.every((k) => k === NUEVA), `${a.claves.length} clientes · ${a.r.terminoPor}`)
  const b = await usada({ NEXT_PUBLIC_SUPABASE_URL: URL, SUPABASE_SECRET_KEY: '', SUPABASE_SERVICE_ROLE_KEY: 'falsa' })
  oraculo('SRK01', 'Actions sin el secreto nuevo (llega como ""): el cliente se crea con la vieja', b.claves.length > 0 && b.claves.every((k) => k === 'falsa'), `${b.claves.length} clientes`)
  // restore-2026.js lee el .env.local de la carpeta actual (el ficticio de script-falso, con la vieja)
  const c = await usada({}, 'scripts/restore-2026.js')
  oraculo('SRK01', 'restore-2026.js, del .env.local: la vieja del fichero ficticio', c.claves.length > 0 && c.claves.every((k) => k === 'falsa'), `${c.claves.length} clientes`)
  const d = await usada({ NEXT_PUBLIC_SUPABASE_URL: URL, SUPABASE_SECRET_KEY: NUEVA + '\n', DIAG_CREDS: '1' })
  const diag = d.r.salida.filter((l) => /\[DIAG\]/.test(l))
  oraculo('SRK01', 'DIAG_CREDS con la nueva: dice el NOMBRE de la variable y ningun trozo de la clave', diag.some((l) => /variable: SUPABASE_SECRET_KEY/.test(l)) && sinClave(d.r.salida.join('\n'), NUEVA), diag.join(' | '))
  ver('control (H06): los scripts terminaron (veredicto o exit), ninguno por timeout', ejecucionesScripts.length >= 4 && ejecucionesScripts.every((e) => e.terminoPor !== 'timeout'), JSON.stringify(ejecucionesScripts.map((e) => e.terminoPor + ':' + e.codigo)))
  }
}

titulo('4 · los workflows: la nueva junto a la vieja, en el mismo env')
for (const f of ['mercado-diario.yml', 'actualizar-velas.yml']) {
  // contra el codigo auditado (historicas.sh) la copia no trae .github: sin el fichero, ROJO, no excepcion
  let texto = ''
  try { texto = fuente('.github/workflows/' + f) } catch { texto = '' }
  let wf = null
  try { wf = YAML.parse(texto) } catch { wf = null }
  const envs = [...Object.values(wf?.jobs ?? {}).map((j) => j.env ?? {}), ...Object.values(wf?.jobs ?? {}).flatMap((j) => (j.steps ?? []).map((p) => p.env ?? {}))]
  const conVieja = envs.filter((e) => 'SUPABASE_SERVICE_ROLE_KEY' in e)
  oraculo('SRK01', `${f}: YAML valido; cada env con la vieja lleva tambien SUPABASE_SECRET_KEY = secrets.SUPABASE_SECRET_KEY`, !!wf && conVieja.length > 0
    && conVieja.every((e) => String(e.SUPABASE_SECRET_KEY).replace(/\s/g, '') === '${{secrets.SUPABASE_SECRET_KEY}}'), `${conVieja.length} env`)
}

titulo('5 · la app y el sitio unico')
{
  process.env.SUPABASE_SECRET_KEY = NUEVA
  globalThis.__clavesUsadas = []
  await importa('lib/authApi.js')
  delete process.env.SUPABASE_SECRET_KEY
  oraculo('SRK01', 'lib/authApi.js crea su cliente con la clave de getClaveServidor (la real, con la nueva)', globalThis.__claveServidor === 'real' && globalThis.__clavesUsadas.includes(NUEVA), `${globalThis.__claveServidor} · ${globalThis.__clavesUsadas.length}`)
  const app = fuente('lib/authApi.js')
  oraculo('SRK01', 'lib/authApi.js: createClient(url, getClaveServidor(), …) y no lee las variables', /createClient\(\s*process\.env\.NEXT_PUBLIC_SUPABASE_URL,\s*getClaveServidor\(\),/.test(app)
    && !/SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY/.test(app.replace(/^\s*\/\/.*$/gm, '')))
  // fuera de pruebas/, revisiones/ y los .md, y sin contar comentarios: SOLO el helper nombra las variables (los
  // workflows las pasan: se miran en el bloque 4)
  // recorrido del disco (no git grep: historicas.sh corre en una copia que no es un checkout)
  const FUERA = new Set(['node_modules', 'pruebas', 'revisiones', '.pruebas', '.next', '.git', '.github'])
  const todos = (dir) => readdirSync(REPO + dir, { withFileTypes: true }).flatMap((e) => FUERA.has(e.name) ? []
    : e.isDirectory() ? todos(dir + e.name + '/') : /\.(js|mjs|cjs|ts)$/.test(e.name) ? [dir + e.name] : [])
  const lee = todos('').filter((f) => /SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY/.test(fuente(f).replace(/^\s*(\/\/|\*).*$/gm, '')))
  oraculo('SRK01', 'solo lib/claveServidor.cjs lee las variables (recorrido del disco, sin comentarios)', lee.join() === 'lib/claveServidor.cjs', lee.join(', '))
}

fin()
