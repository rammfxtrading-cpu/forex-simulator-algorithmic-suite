/**
 * MERCADO V1 · LIBERAR A MANO EL CERROJO DEL BUCKET «mercado» (etapa 2; CTO 13-oct,
 * decision 3, y 14-oct: SIN caducidad automatica, como cerro Astra en BD-01).
 * Escrito ANTES que el codigo.
 *
 * lib/mercado/liberar-v1.mjs ordenLibera(args, deps) con un almacen en memoria:
 *   · SIMULACRO POR DEFECTO: enseña el cerrojo (id = UUID de la ejecucion, dueño,
 *     fecha y antigüedad) y como confirmarlo; no escribe ni borra nada;
 *   · solo libera con --confirmo <id> (el id que enseña; si la ficha no tiene un id
 *     valido, los 16 primeros hex del sha256 de sus bytes); un id que no es el del
 *     cerrojo: nada;
 *   · sin caducidad: un cerrojo de hace 30 dias tampoco se libera sin confirmacion;
 *   · deja constancia ANTES de borrar: v1/_liberados/<cuando>.<id>.json (sin upsert)
 *     con la ficha, el sha256 de sus bytes y cuando; si no se puede escribir, no borra;
 *   · relee el cerrojo antes de borrarlo: si ha cambiado desde que se enseño, no borra;
 *   · con CI o GITHUB_ACTIONS definidos no libera nada (BE-01);
 *   · lo ajeno no sale en el log (E2-04).
 * Codigos: 0 no habia cerrojo o liberado · 1 no liberado (simulacro, confirmacion
 * que no cuadra, CI, cerrojo cambiado) · 3 error al leer o escribir · 4 uso.
 */
import { createHash } from 'crypto'
import { titulo, oraculo, fin, importa } from './lib.mjs'
const L = await importa('lib/mercado/liberar-v1.mjs')
const CERROJO = 'v1/_cerrojo.json'
const ID = '0b7c2f4e-1a2b-4c3d-8e9f-a0b1c2d3e4f5'
const ficha = (o = {}) => Buffer.from(JSON.stringify({ id: ID, dueno: 'mercado-v1-publica', desde: '2026-10-14T08:00:00.000Z', ...o }))
const FUGA = /FUGA123|supabase\.co|apikey/
function almacen(inicial = null, fallos = {}) {
  const o = new Map(), registro = []
  if (inicial) o.set(CERROJO, inicial)
  return {
    o, registro,
    async lee(r) { registro.push(['lee', r]); if (fallos.lee) { const x = fallos.lee(r, o.get(r)); if (x !== undefined) return x } const b = o.get(r); return b == null ? null : Buffer.from(b) },
    async sube(r, b, { upsert = false } = {}) { registro.push(['sube', r]); if (fallos.sube?.(r)) throw fallos.sube(r); if (!upsert && o.has(r)) return 'existe'; o.set(r, Buffer.from(b)); return 'ok' },
    async borra(r) { registro.push(['borra', r]); if (fallos.borra?.(r)) throw fallos.borra(r); o.delete(r) },
    async lista(p) { return [...o].filter(([k]) => k.startsWith(p)).map(([ruta, b]) => ({ ruta, bytes: b.length })) },
  }
}
const deps = (alm, entorno = {}) => ({ almacen: () => alm, ahora: () => '2026-10-14T10:05:00.000Z', entorno })
const corre = (args, alm, entorno) => L.ordenLibera(args, deps(alm, entorno))
const escribe = a => a.registro.filter(x => x[0] !== 'lee')
// lo que escribe sobre el cerrojo y la constancia (la congelacion, E2R2-03, aparte: pruebas/mercado-v1-congelacion.mjs)
const escribeSinCongelar = a => escribe(a).filter(x => x[1] !== 'v1/_congelado')
const texto = r => r.lineas.join('\n')

titulo('1 · uso y sin cerrojo')
for (const args of [['--confirmo'], ['--borrar'], ['--confirmo', ID, 'otro']]) {
  const a = almacen(ficha()); const r = await corre(args, a)
  oraculo('LIB', `uso (${args.join(' ')}): codigo 4 y ni lee`, r.codigo === 4 && a.registro.length === 0, texto(r))
}
const a0 = almacen(); const r0 = await corre([], a0)
oraculo('LIB', 'sin cerrojo: lo dice, codigo 0, nada escrito', r0.codigo === 0 && /no hay cerrojo/i.test(texto(r0)) && escribe(a0).length === 0, texto(r0))

titulo('2 · simulacro por defecto: enseña y no toca')
const a1 = almacen(ficha()); const r1 = await corre([], a1)
oraculo('LIB', 'enseña el id (UUID), el dueño, la fecha y la antigüedad (2 h 5 min)', r1.codigo === 1 && texto(r1).includes(ID) && /mercado-v1-publica/.test(texto(r1)) && /2026-10-14T08:00:00.000Z/.test(texto(r1)) && /2 h 5 min/.test(texto(r1)), texto(r1))
oraculo('LIB', 'dice como confirmarlo (--confirmo <id>) y que antes hay que comprobar que el proceso no vive; no escribe ni borra', texto(r1).includes(`--confirmo ${ID}`) && /comprueba/i.test(texto(r1)) && escribe(a1).length === 0 && a1.o.has(CERROJO), texto(r1))
const aV = almacen(ficha({ desde: '2026-09-14T10:05:00.000Z' })); const rV = await corre([], aV)
oraculo('LIB', 'sin caducidad: un cerrojo de hace 30 dias tampoco se libera sin confirmacion', rV.codigo === 1 && aV.o.has(CERROJO) && escribe(aV).length === 0 && /30 d/.test(texto(rV)), texto(rV))

titulo('3 · confirmacion explicita')
const a2 = almacen(ficha()); const r2 = await corre(['--confirmo', '11111111-2222-4333-8444-555555555555'], a2)
oraculo('LIB', '--confirmo con otro id: no libera (codigo 1) y dice cual es', r2.codigo === 1 && a2.o.has(CERROJO) && escribe(a2).length === 0 && texto(r2).includes(ID), texto(r2))
const a3 = almacen(ficha()); const r3 = await corre(['--confirmo', ID], a3)
const reg3 = [...a3.o.keys()].find(k => k.startsWith('v1/_liberados/'))
const c3 = reg3 ? JSON.parse(a3.o.get(reg3)) : null
oraculo('LIB', '--confirmo <id>: libera (codigo 0), el cerrojo ya no esta y lo dice con la ruta de la constancia', r3.codigo === 0 && !a3.o.has(CERROJO) && !!reg3 && texto(r3).includes(reg3), texto(r3))
oraculo('LIB', 'la constancia: v1/_liberados/<cuando>.<id>.json con la ficha, el sha256 de sus bytes, cuando y por que script', /^v1\/_liberados\/20261014T100500Z\.0b7c2f4e-1a2b-4c3d-8e9f-a0b1c2d3e4f5\.json$/.test(reg3 ?? '') && c3?.esquema === 'mercado-liberacion@1' && c3.cerrojo?.id === ID && c3.cerrojo.desde === '2026-10-14T08:00:00.000Z' && c3.sha256 === createHash('sha256').update(ficha()).digest('hex') && c3.cuando === '2026-10-14T10:05:00.000Z' && /liberar-cerrojo/.test(c3.por), JSON.stringify(c3))
const orden3 = escribeSinCongelar(a3).map(x => x[0] + ' ' + x[1])
const tras3 = a3.registro.slice(a3.registro.findIndex(x => x[0] === 'borra' && x[1] === CERROJO) + 1)
oraculo('LIB', 'orden: la constancia se sube (sin upsert) ANTES de borrar el cerrojo, y despues se comprueba que ya no esta', orden3.length === 2 && /^sube v1\/_liberados\//.test(orden3[0]) && orden3[1] === `borra ${CERROJO}` && tras3[0]?.[0] === 'lee' && tras3[0]?.[1] === CERROJO, orden3.join(' · '))
const aI = almacen(Buffer.from('FUGA123 no es JSON')); const rI = await corre([], aI)
const sha16 = createHash('sha256').update(Buffer.from('FUGA123 no es JSON')).digest('hex').slice(0, 16)
oraculo('LIB', 'ficha ilegible: dice «ilegible», da como clave los 16 hex del sha256 de sus bytes y no enseña su contenido', rI.codigo === 1 && /ilegible/.test(texto(rI)) && texto(rI).includes(`--confirmo ${sha16}`) && !FUGA.test(texto(rI)), texto(rI))
const rI2 = await corre(['--confirmo', sha16], aI)
oraculo('LIB', 'y con esa clave se libera', rI2.codigo === 0 && !aI.o.has(CERROJO), texto(rI2))
const aF = almacen(ficha({ dueno: 'https://proyecto.supabase.co/?apikey=FUGA123' })); const rF = await corre([], aF)
oraculo('LIB', 'un dueño con forma ajena no sale en el log', !FUGA.test(texto(rF)) && texto(rF).includes(ID), texto(rF))

titulo('4 · lo que lo para')
const aC = almacen(ficha()); const rC = await corre(['--confirmo', ID], aC, { CI: 'true' })
oraculo('LIB', 'con CI definido: no libera ni con la confirmacion buena (codigo 1) y ni lee', rC.codigo === 1 && aC.o.has(CERROJO) && aC.registro.length === 0 && /automatizad/.test(texto(rC)), texto(rC))
const aG = almacen(ficha()); const rG = await corre(['--confirmo', ID], aG, { GITHUB_ACTIONS: '' })
oraculo('LIB', 'con GITHUB_ACTIONS definido (aunque vacio): igual', rG.codigo === 1 && aG.o.has(CERROJO), texto(rG))
let lecturas = 0
const aX = almacen(ficha(), { lee: r => { if (r === CERROJO && ++lecturas === 2) return ficha({ id: '22222222-3333-4444-8555-666666666666' }) } })
const rX = await corre(['--confirmo', ID], aX)
oraculo('LIB', 'el cerrojo cambia entre enseñarlo y borrarlo: no borra ni deja constancia (codigo 1)', rX.codigo === 1 && aX.o.has(CERROJO) && escribeSinCongelar(aX).length === 0 && /cambiado/.test(texto(rX)), texto(rX))
const aS = almacen(ficha(), { sube: r => (r.startsWith('v1/_liberados/') ? new Error('503 https://proyecto.supabase.co/?apikey=FUGA123') : null) })
const rS = await corre(['--confirmo', ID], aS)
oraculo('LIB', 'no se puede dejar constancia: no borra (codigo 3) y el error sale saneado', rS.codigo === 3 && aS.o.has(CERROJO) && !aS.registro.some(x => x[0] === 'borra' && x[1] === CERROJO) && !FUGA.test(texto(rS)), texto(rS))
const aB = almacen(ficha(), { borra: () => Object.assign(new Error('fallo https://x.supabase.co/?apikey=FUGA123'), { statusCode: '500' }) })
const rB = await corre(['--confirmo', ID], aB)
oraculo('LIB', 'falla el borrado tras dejar constancia: codigo 3, lo dice (la constancia queda) y sin lo ajeno', rB.codigo === 3 && aB.o.has(CERROJO) && [...aB.o.keys()].some(k => k.startsWith('v1/_liberados/')) && /no se pudo borrar/.test(texto(rB)) && /HTTP 500/.test(texto(rB)) && !FUGA.test(texto(rB)), texto(rB))

titulo('5 · el script real, sin red (humo): uso y CI')
const { spawnSync } = await import('child_process')
const nodo = (args, env = {}) => spawnSync(process.execPath, ['--import', './pruebas/sin-red.mjs', 'scripts/mercado-v1-liberar-cerrojo.mjs', ...args], { encoding: 'utf8', env: { PATH: process.env.PATH, HOME: process.env.HOME, TZ: 'Europe/Madrid', ...env } })
const u = nodo(['--borrar'], { CI: '1' })
oraculo('LIB', 'el script con CI: codigo 1 antes de leer claves o Storage', u.status === 1 && /automatizad/.test(u.stdout) && !/Fatal/.test(u.stdout + u.stderr), u.stdout + u.stderr)
const u2 = nodo(['--confirmo'], { GITHUB_ACTIONS: 'true' })
oraculo('LIB', 'ni con GITHUB_ACTIONS', u2.status === 1, u2.stdout + u2.stderr)
fin()
