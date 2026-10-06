/**
 * BD-01 / BD-02 · EL CERROJO DE PUBLICACION NO CADUCA NI SE RECUPERA SOLO
 *
 * Astra (verificacion del bloque D, 5-oct): el cerrojo de lib/mercado/ficheros.mjs
 * caducaba a los 10 minutos y se recuperaba solo:
 *   BD-01  A toma el cerrojo y tarda; caduca; B lo recupera y publica 1.440; A
 *          termina y publica 1.300 encima. Los dos «publicado»; se pierden 140.
 *   BD-02  cerrojo caducado; A y B leen la ficha vieja; A la borra y pone el
 *          suyo; B borra el de A y pone el suyo. Los dos publican; se pierden 140.
 * Decision del CTO (bloque E, punto 1): sin caducidad ni recuperacion
 * automatica. Se crea con una escritura que falla si ya existe; si esta puesto,
 * el publicador termina con error visible que dice QUIEN lo tiene y DESDE
 * CUANDO. Liberarlo es un comando manual aparte (scripts/liberar-cerrojo.js),
 * con confirmacion, que no llama ningun workflow.
 *
 * ORACULOS: con cerrojo puesto (fresco, viejo o de un proceso muerto) nadie
 * publica, el error nombra dueño y fecha, y el fichero no cambia; el dueño
 * legitimo, cuando acaba, publica y suelta; el comando manual sin confirmacion
 * no borra y con ella si. Contra el codigo viejo: rojo (sin modulo, o publica).
 */
import { titulo, ver, oraculo, fin, escenario, importa, db, guardado, fuente, REPO } from '../lib.mjs'
import { createClient } from '../supabase-falso.mjs'
import { diaM1 } from '../proveedor-falso.mjs'
import { correScript, ejecucionesScripts } from '../script-falso.mjs'
import { existsSync } from 'node:fs'

let F = null
try { F = await importa('lib/mercado/ficheros.mjs') } catch { F = null }
ver('control: el modulo comun existe en este codigo (si no, los oraculos salen en rojo)', true, F ? 'si' : 'no (codigo viejo)')
const sb = createClient('https://falso.supabase.co', 'falsa')
const velasDe = (dia, n) => diaM1(dia, n).map(c => ({ time: c.timestamp / 1000, open: c.open, high: c.high, low: c.low, close: c.close, volume: 1 }))
const BASE = velasDe('2026-01-02', 1200)
const deN = n => () => velasDe('2026-01-02', n)
const RUTA_CERROJO = '_cerrojos/EURUSD_2026.json'
const ficha = (dueno, desde, extra = {}) => JSON.stringify({ dueno, desde, ...extra })
const datos = () => db.log.filter(l => l.op === 'upload' && String(l.payload?.ruta).startsWith('EURUSD/'))
const publica = (dueno, componer, ahoraMs) => F ? F.publicarAnio(sb, { pair: 'EURUSD', year: 2026, dueno, componer, ahoraMs }) : Promise.resolve({ estado: 'sin-modulo', problemas: [] })

titulo('BD-02 · un cerrojo viejo (de hace horas) y dos publicadores a la vez')
escenario({ storage: { 'forex-data': { 'EURUSD/M1/2026.json': JSON.stringify(BASE), [RUTA_CERROJO]: ficha('actualizar-diario:muerto', '2026-01-02T10:00:00.000Z', { caduca: Date.parse('2026-01-02T10:10:00Z') }) } } })
const luego = () => Date.parse('2026-01-02T15:00:00Z')
const [a2, b2] = await Promise.all([publica('A', deN(1440), luego), publica('B', deN(1300), luego)])
oraculo('BD02', 'ninguno de los dos publica sobre el cerrojo puesto (aunque sea viejo)', a2.estado !== 'publicado' && b2.estado !== 'publicado' && datos().length === 0, `A ${a2.estado} · B ${b2.estado} · ${datos().length} subidas de datos`)
oraculo('BD02', 'el error dice quien lo tiene y desde cuando', [a2, b2].every(r => r.problemas?.some(p => p.includes('actualizar-diario:muerto') && p.includes('2026-01-02T10:00:00'))), a2.problemas?.join(' | '))
oraculo('BD02', 'el fichero sigue con sus 1.200 y el cerrojo sigue puesto (nadie lo retira solo)', guardado('EURUSD/M1/2026').velas?.length === 1200 && Object.hasOwn(db.storage['forex-data'], RUTA_CERROJO))

titulo('BD-01 · A tiene el cerrojo y tarda mas de 10 minutos; llega B')
escenario({ storage: { 'forex-data': { 'EURUSD/M1/2026.json': JSON.stringify(BASE) } } })
let suelta, retenida = new Promise(r => { suelta = r }), aRetenido = false
db.pausa = async c => { if (c.op === 'upload' && String(c.payload?.ruta).startsWith('EURUSD/M1/') && !aRetenido) { aRetenido = true; await retenida } }
const t0 = Date.parse('2026-01-02T12:00:00Z')
const pa = publica('A', deN(1300), () => t0)
for (let i = 0; i < 200 && !aRetenido; i++) await new Promise(r => setImmediate(r))
ver('control: A tiene el cerrojo y esta subiendo (retenido)', !F || aRetenido)
const b1 = await publica('B', deN(1440), () => t0 + 600_001)
suelta()
const a1 = await pa
db.pausa = null
oraculo('BD01', 'B no publica mientras A tenga el cerrojo, aunque pasen 10 minutos: error con dueño y fecha', b1.estado !== 'publicado' && b1.problemas?.some(p => /A:/.test(p) && p.includes('2026-01-02T12:00:00')), `B ${b1.estado}: ${b1.problemas?.join(' | ')}`)
oraculo('BD01', 'A termina, publica sus 1.300 y suelta el cerrojo: nadie pisa a nadie', a1.estado === 'publicado' && guardado('EURUSD/M1/2026').velas?.length === 1300 && !Object.hasOwn(db.storage['forex-data'], RUTA_CERROJO), `A ${a1.estado} · quedan ${guardado('EURUSD/M1/2026').velas?.length}`)

titulo('un proceso muerto deja el cerrojo: el siguiente falla sin publicar')
escenario({ storage: { 'forex-data': { 'EURUSD/M1/2026.json': JSON.stringify(BASE), [RUTA_CERROJO]: ficha('restore-2026:x7', '2026-01-03T09:00:00.000Z') } } })
const c = await publica('actualizar-diario', deN(1440), () => Date.parse('2026-01-09T09:00:00Z'))
oraculo('BD01', 'seis dias despues sigue fallando: ocupado, con dueño y fecha, cero subidas de datos', c.estado === 'ocupado' && c.problemas?.some(p => p.includes('restore-2026:x7') && p.includes('2026-01-03T09:00:00')) && datos().length === 0 && guardado('EURUSD/M1/2026').velas?.length === 1200, `${c.estado}: ${c.problemas?.join(' | ')}`)
oraculo('BD01', 'y el error dice como liberarlo a mano', c.problemas?.some(p => /liberar-cerrojo/.test(p)))

titulo('liberar el cerrojo: comando manual, con confirmacion, fuera de los workflows')
const hayScript = existsSync(REPO + 'scripts/liberar-cerrojo.js')
const ENV = { NEXT_PUBLIC_SUPABASE_URL: 'https://falso.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'falsa' }
if (hayScript) {
  escenario({ storage: { 'forex-data': { [RUTA_CERROJO]: ficha('restore-2026:x7', '2026-01-03T09:00:00.000Z') } } })
  const sinConf = await correScript('scripts/liberar-cerrojo.js', { ahora: '2026-01-09T09:00:00Z', argv: ['EURUSD_2026'], env: ENV })
  oraculo('BD01', 'sin --confirmo: enseña quien lo tiene y desde cuando, no borra y acaba con codigo 1', Object.hasOwn(db.storage['forex-data'], RUTA_CERROJO) && sinConf.salida.some(l => l.includes('restore-2026:x7')) && (sinConf.codigo ?? 0) !== 0 && !db.log.some(l => l.op === 'remove'), sinConf.salida.slice(-2).join(' | '))
  const conConf = await correScript('scripts/liberar-cerrojo.js', { ahora: '2026-01-09T09:00:00Z', argv: ['EURUSD_2026', '--confirmo'], env: ENV })
  oraculo('BD01', 'con --confirmo: lo borra y lo dice', !Object.hasOwn(db.storage['forex-data'], RUTA_CERROJO) && (conConf.codigo ?? 0) === 0, conConf.salida.slice(-2).join(' | '))
} else {
  oraculo('BD01', 'sin --confirmo: enseña quien lo tiene y desde cuando, no borra y acaba con codigo 1', false, 'no existe scripts/liberar-cerrojo.js')
  oraculo('BD01', 'con --confirmo: lo borra y lo dice', false, 'no existe scripts/liberar-cerrojo.js')
}
// BE-01 (Astra, cierres-3; bloque G, punto 2): ni con --confirmo se ejecuta en
// CI ni en GitHub Actions (variables definidas, con cualquier valor)
for (const [nombre, valor] of [['CI', 'true'], ['GITHUB_ACTIONS', 'true'], ['CI', '']]) {
  escenario({ storage: { 'forex-data': { [RUTA_CERROJO]: ficha('restore-2026:x7', '2026-01-03T09:00:00.000Z') } } })
  const enCI = hayScript ? await correScript('scripts/liberar-cerrojo.js', { ahora: '2026-01-09T09:00:00Z', argv: ['EURUSD_2026', '--confirmo'], env: { ...ENV, [nombre]: valor } }) : null
  oraculo('BE01', `con ${nombre}=${JSON.stringify(valor)} y --confirmo: no borra, lo dice y acaba con codigo 1`, !!enCI && Object.hasOwn(db.storage['forex-data'], RUTA_CERROJO) && !db.log.some(l => l.op === 'remove') && enCI.codigo === 1 && enCI.salida.some(l => /CI|automatizado/i.test(l)), enCI ? enCI.salida.slice(-2).join(' | ') : 'sin script')
}
const yml = fuente('.github/workflows/actualizar-velas.yml')
oraculo('BD01', 'ningun workflow llama a liberar-cerrojo', hayScript && !/liberar-cerrojo/.test(yml))
ver('control (H06): ningun script por timeout', ejecucionesScripts.every(e => e.terminoPor !== 'timeout'), JSON.stringify(ejecucionesScripts.map(e => e.terminoPor + ':' + e.codigo)))
fin()
