/**
 * MERCADO V1 · LIBERAR A MANO EL CERROJO DEL PUBLICADOR (etapa 2; CTO 13-oct,
 * decision 3, y 14-oct: SIN caducidad automatica, como cerro Astra en BD-01;
 * E2R3-01: el cerrojo es la fila 'mercado/v1' de public.mercado_cerrojo y el
 * borrado es CONDICIONAL al dueño). Reescrita con E2R3-01 antes que el codigo.
 *
 * lib/mercado/liberar-v1.mjs ordenLibera(args, deps) con un cerrojo en memoria
 * (pruebas/cerrojo-falso.mjs, la semantica de la base) y un almacen en memoria
 * para la constancia:
 *   · SIMULACRO POR DEFECTO: enseña el cerrojo (id = UUID de la ejecucion,
 *     descripcion, desde y antigüedad) y como confirmarlo; no escribe ni borra;
 *   · solo libera con --confirmo <uuid del dueño>; otro uuid: nada;
 *   · sin caducidad: un cerrojo de hace 30 dias tampoco se libera sin confirmacion;
 *   · deja constancia ANTES de borrar: v1/_liberados/<cuando>.<uuid>.json (sin
 *     upsert); si no se puede escribir, no borra;
 *   · el DELETE es condicional: si entre enseñarlo y borrarlo el cerrojo es de
 *     otro, no lo toca; si la respuesta del DELETE se pierde y la fila sigue,
 *     codigo 3 y repetir (inocuo);
 *   · con CI o GITHUB_ACTIONS definidos no libera nada (BE-01);
 *   · lo ajeno no sale en el log (E2-04, E2R2-04).
 * Codigos: 0 no habia cerrojo o liberado · 1 no liberado · 3 error · 4 uso.
 */
import { titulo, oraculo, fin, importa } from './lib.mjs'
import { cerrojoEnMemoria } from './cerrojo-falso.mjs'
const L = await importa('lib/mercado/liberar-v1.mjs')
const CER = 'mercado/v1'
const ID = '0b7c2f4e-1a2b-4c3d-8e9f-a0b1c2d3e4f5', OTRO = '22222222-3333-4444-8555-666666666666'
const fila = (o = {}) => ({ dueno: ID, descripcion: 'mercado-v1-publica', desde: '2026-10-14T08:00:00.000Z', ...o })
const FUGA = /FUGA123|supabase\.co|apikey/
function almacen(fallos = {}, registro = []) {
  const o = new Map()
  return {
    o, registro,
    async lee(r) { return o.has(r) ? Buffer.from(o.get(r)) : null },
    async sube(r, b, { upsert = false } = {}) { registro.push(['sube', r]); const e = fallos.sube?.(r); if (e) throw e; if (!upsert && o.has(r)) return 'existe'; o.set(r, Buffer.from(b)); return 'ok' },
    async borra(r) { registro.push(['borra', r]); o.delete(r) },
    async lista(p) { return [...o].filter(([k]) => k.startsWith(p)).map(([ruta, b]) => ({ ruta, bytes: b.length })) },
  }
}
// un registro comun: el orden entre la constancia (almacen) y el DELETE (cerrojo)
function monta({ inicial = fila(), fallosCerrojo = {}, fallosAlmacen = {} } = {}) {
  const cer = cerrojoEnMemoria({ fallos: fallosCerrojo })
  if (inicial) cer.pon(CER, inicial)
  const alm = almacen(fallosAlmacen, cer.registro)
  return { cer, alm, registro: cer.registro }
}
const corre = (args, m, entorno = {}) => L.ordenLibera(args, { cerrojo: () => m.cer, almacen: () => m.alm, ahora: () => '2026-10-14T10:05:00.000Z', entorno })
const escribe = m => m.registro.filter(x => x[0] !== 'lee')
const texto = r => r.lineas.join('\n')

titulo('1 · uso y sin cerrojo')
for (const args of [['--confirmo'], ['--borrar'], ['--confirmo', ID, 'otro'], ['--confirmo', 'no-es-uuid-0123456789']]) {
  const m = monta(); const r = await corre(args, m)
  oraculo('LIB', `uso (${args.join(' ')}): codigo 4 y ni lee`, r.codigo === 4 && m.registro.length === 0, texto(r))
}
const m0 = monta({ inicial: null }); const r0 = await corre([], m0)
oraculo('LIB', 'sin cerrojo: lo dice, codigo 0, nada escrito', r0.codigo === 0 && /no hay cerrojo/i.test(texto(r0)) && escribe(m0).length === 0, texto(r0))

titulo('2 · simulacro por defecto: enseña y no toca')
const m1 = monta(); const r1 = await corre([], m1)
oraculo('LIB', 'enseña el id (UUID), la descripcion, la fecha y la antigüedad (2 h 5 min)', r1.codigo === 1 && texto(r1).includes(ID) && /mercado-v1-publica/.test(texto(r1)) && /2026-10-14T08:00:00.000Z/.test(texto(r1)) && /2 h 5 min/.test(texto(r1)), texto(r1))
oraculo('LIB', 'dice como confirmarlo (--confirmo <uuid>) y que antes hay que comprobar que el proceso no vive; no escribe ni borra', texto(r1).includes(`--confirmo ${ID}`) && /comprueba/i.test(texto(r1)) && escribe(m1).length === 0 && m1.cer.filas.has(CER), texto(r1))
const mV = monta({ inicial: fila({ desde: '2026-09-14T10:05:00.000Z' }) }); const rV = await corre([], mV)
oraculo('LIB', 'sin caducidad: un cerrojo de hace 30 dias tampoco se libera sin confirmacion', rV.codigo === 1 && mV.cer.filas.has(CER) && escribe(mV).length === 0 && /30 d/.test(texto(rV)), texto(rV))

titulo('3 · confirmacion explicita y borrado condicional')
const m2 = monta(); const r2 = await corre(['--confirmo', OTRO], m2)
oraculo('LIB', '--confirmo con otro uuid: no libera (codigo 1) y dice cual es', r2.codigo === 1 && m2.cer.filas.has(CER) && escribe(m2).length === 0 && texto(r2).includes(ID), texto(r2))
const m3 = monta(); const r3 = await corre(['--confirmo', ID], m3)
const reg3 = [...m3.alm.o.keys()].find(k => k.startsWith('v1/_liberados/'))
const c3 = reg3 ? JSON.parse(m3.alm.o.get(reg3)) : null
oraculo('LIB', '--confirmo <uuid>: libera (codigo 0), el cerrojo ya no esta y lo dice con la ruta de la constancia', r3.codigo === 0 && !m3.cer.filas.has(CER) && !!reg3 && texto(r3).includes(reg3), texto(r3))
oraculo('LIB', 'la constancia: v1/_liberados/<cuando>.<uuid>.json con el recurso, el dueño, la descripcion, desde, cuando y por que script', /^v1\/_liberados\/20261014T100500Z\.0b7c2f4e-1a2b-4c3d-8e9f-a0b1c2d3e4f5\.json$/.test(reg3 ?? '') && c3?.esquema === 'mercado-liberacion@2' && c3.cerrojo?.recurso === CER && c3.cerrojo.id === ID && c3.cerrojo.dueno === 'mercado-v1-publica' && c3.cerrojo.desde === '2026-10-14T08:00:00.000Z' && /^[0-9a-f]{64}$/.test(c3.sha256) && c3.cuando === '2026-10-14T10:05:00.000Z' && /liberar-cerrojo/.test(c3.por), JSON.stringify(c3))
const orden3 = escribe(m3).map(x => `${x[0]}${x[0] === 'suelta' ? ' ' + x[2] : ''}`)
oraculo('LIB', 'orden: la constancia (sin upsert) ANTES del DELETE, y el DELETE es condicional a ese dueño', orden3.join(' · ') === `sube · suelta ${ID}`, orden3.join(' · '))
// el cerrojo cambia de dueño entre enseñarlo y borrarlo: el DELETE condicional no lo toca
const m4 = monta()
const sube4 = m4.alm.sube.bind(m4.alm)
m4.alm.sube = async (r, b, o) => { const x = await sube4(r, b, o); if (r.startsWith('v1/_liberados/')) { m4.cer.filas.delete(CER); m4.cer.pon(CER, fila({ dueno: OTRO })) } return x }
const r4 = await corre(['--confirmo', ID], m4)
oraculo('LIB', 'el cerrojo pasa a otro dueño durante la constancia: el DELETE condicional NO lo toca (sigue el de OTRO) y se dice', r4.codigo === 0 && m4.cer.filas.get(CER)?.dueno === OTRO && /ya no estaba/.test(texto(r4)), texto(r4))
const mS = monta({ fallosAlmacen: { sube: r => (r.startsWith('v1/_liberados/') ? new Error('503 https://proyecto.supabase.co/?apikey=FUGA123') : null) } })
const rS = await corre(['--confirmo', ID], mS)
oraculo('LIB', 'no se puede dejar constancia: no borra (codigo 3) y el error sale saneado', rS.codigo === 3 && mS.cer.filas.has(CER) && !mS.registro.some(x => x[0] === 'suelta') && !FUGA.test(texto(rS)), texto(rS))
const mB = monta({ fallosCerrojo: { suelta: () => Object.assign(new Error('fallo https://x.supabase.co/?apikey=FUGA123'), { statusCode: '500' }) } })
const rB = await corre(['--confirmo', ID], mB)
oraculo('LIB', 'falla el DELETE y la fila sigue: codigo 3, lo dice (la constancia queda; repetir es inocuo) y sin lo ajeno', rB.codigo === 3 && mB.cer.filas.has(CER) && [...mB.alm.o.keys()].some(k => k.startsWith('v1/_liberados/')) && /no se pudo borrar/.test(texto(rB)) && /HTTP 500/.test(texto(rB)) && /inocuo/.test(texto(rB)) && !FUGA.test(texto(rB)), texto(rB))
const mP = monta({ fallosCerrojo: { suelta: () => 'perdida' } })
const rP = await corre(['--confirmo', ID], mP)
oraculo('LIB', 'el DELETE se hace pero su respuesta se pierde: relee, ya no esta, codigo 0', rP.codigo === 0 && !mP.cer.filas.has(CER), texto(rP))

titulo('4 · lo que lo para, y lo ajeno')
const mC = monta(); const rC = await corre(['--confirmo', ID], mC, { CI: 'true' })
oraculo('LIB', 'con CI definido: no libera ni con la confirmacion buena (codigo 1) y ni lee', rC.codigo === 1 && mC.cer.filas.has(CER) && mC.registro.length === 0 && /automatizad/.test(texto(rC)), texto(rC))
const mG = monta(); const rG = await corre(['--confirmo', ID], mG, { GITHUB_ACTIONS: '' })
oraculo('LIB', 'con GITHUB_ACTIONS definido (aunque vacio): igual', rG.codigo === 1 && mG.cer.filas.has(CER), texto(rG))
const mF = monta({ inicial: fila({ descripcion: 'https://proyecto.supabase.co/?apikey=FUGA123' }) }); const rF = await corre([], mF)
oraculo('LIB', 'una descripcion ajena no sale en el log: «(ajeno)» y su hash', !FUGA.test(texto(rF)) && texto(rF).includes(ID) && /\(ajeno\) [0-9a-f]{16}/.test(texto(rF)), texto(rF))
const mI = monta({ inicial: fila({ dueno: 'FUGA123' }) }); const rI = await corre([], mI)
oraculo('LIB', 'un dueño que no es UUID: no se puede liberar condicionalmente (codigo 3), sin enseñarlo', rI.codigo === 3 && !FUGA.test(texto(rI)) && mI.cer.filas.has(CER), texto(rI))

titulo('5 · el script real, sin red (humo): uso y CI')
const { spawnSync } = await import('child_process')
const nodo = (args, env = {}) => spawnSync(process.execPath, ['--import', './pruebas/sin-red.mjs', 'scripts/mercado-v1-liberar-cerrojo.mjs', ...args], { encoding: 'utf8', env: { PATH: process.env.PATH, HOME: process.env.HOME, TZ: 'Europe/Madrid', ...env } })
const u = nodo(['--borrar'], { CI: '1' })
oraculo('LIB', 'el script con CI: codigo 1 antes de leer claves o Storage', u.status === 1 && /automatizad/.test(u.stdout) && !/Fatal/.test(u.stdout + u.stderr), u.stdout + u.stderr)
const u2 = nodo(['--confirmo'], { GITHUB_ACTIONS: 'true' })
oraculo('LIB', 'ni con GITHUB_ACTIONS', u2.status === 1, u2.stdout + u2.stderr)
fin()
