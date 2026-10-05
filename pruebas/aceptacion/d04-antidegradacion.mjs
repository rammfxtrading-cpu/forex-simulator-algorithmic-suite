/**
 * D04 · LA PROTECCION ANTIDEGRADACION NO PROTEGE LO QUE SE SIRVE
 *
 * Astra (4-oct): si el fichero del año no se puede leer, /api/candles va al
 * proveedor; si el bucket tenia 10.000 velas y el proveedor da 1.440, no las
 * sube, pero SIRVE y CACHEA las 1.440 (pages/api/candles.js:212-215). Y un
 * upload fallido se registra como «Saved» (:203-208: el error se devuelve, no
 * se lanza). Añadido en la fase 1: si la lectura de comprobacion TAMBIEN
 * falla, el codigo no compara (:184, `if (!dlError && existingBlob)`) y
 * SOBRESCRIBE.
 * Decision del CTO (4-oct, bloque A): un error de lectura no es «fichero
 * inexistente»; nunca se sirve, cachea ni sube una version con menos velas que
 * la existente; se comprueba upload.error.
 *
 * Se ejecuta: el handler REAL con Storage falso (fallos programados, con la
 * forma de error de storage-js 2.102: «no existe» = StorageApiError con
 * statusCode '404'; un fallo de red no lo es) y el proveedor FALSO.
 *
 * ORACULOS, a mano (bucket con 10.000 velas; el proveedor da 1.440):
 *   1. la lectura falla (no es «no existe»): no se sirve una version peor que
 *      la guardada (ni ahora ni desde la cache), y el bucket conserva 10.000
 *   1b. el fichero «no existia» al leer pero si al comprobar (carrera): se
 *      sirve la de 10.000 y no se sube la de 1.440
 *   2. Storage no deja leer: no se pisa
 *   2b. no existia al leer y la comprobacion falla: no se pisa (no se sabe si
 *      la nueva es peor)
 *   3. un upload con error no se registra como guardado
 */
import { titulo, ver, oraculo, fin, escenario, perfil, A, tok, proveedor, importa, db, guardado } from '../lib.mjs'
import { llama } from '../supabase-falso.mjs'
import { diaM1 } from '../proveedor-falso.mjs'
const candles = (await importa('pages/api/candles.js')).default
const t0 = Date.parse('2025-01-06T00:00:00Z') / 1000
const DIEZMIL = JSON.stringify(Array.from({ length: 10000 }, (_, i) => ({ time: t0 + i * 60, open: 1, high: 1, low: 1, close: 1, volume: 1 })))
const q = par => ({ pair: par, timeframe: 'M1', from: String(t0), to: String(t0 + 20000 * 60), year: '2025' })
const RED = { name: 'StorageUnknownError', message: 'fetch failed: upstream timeout' }
const NO_EXISTE = { name: 'StorageApiError', message: 'Object not found', status: 400, statusCode: '404' }
const logs = []
const log0 = console.log, err0 = console.error, warn0 = console.warn
console.log = (...a) => { logs.push(a.join(' ')); log0(...a) }
console.error = (...a) => { logs.push(a.join(' ')); err0(...a) }
console.warn = (...a) => { logs.push(a.join(' ')); warn0(...a) }
// lo vigente, como lo leen los lectores: el .json.gz si esta; si no, el .json
const velasEn = ruta => guardado(ruta.replace(/\.json$/, '')).velas?.length ?? 0
// programa los resultados de las sucesivas descargas: un error, o null = la de verdad
const descargas = (...errores) => { let i = 0; db.falla = c => c.op === 'download' ? (errores[i++] ?? null) : null; return () => i }

titulo('1 · la lectura del año falla una vez (red); el bucket tiene 10.000 velas')
escenario({ perfiles: [perfil(A)], storage: { 'forex-data': { 'GBPJPY/M1/2025.json': DIEZMIL } } })
const hechas1 = descargas(RED)
proveedor.responde = () => diaM1('2025-01-06')
const r1 = await llama(candles, { method: 'GET', token: tok(A), query: q('GBPJPY') })
ver('control: la primera lectura de Storage fallo (fallo programado consumido)', hechas1() >= 1)
oraculo('D04', 'no se sirve una version peor que la guardada', r1.estado !== 200 || r1.cuerpo.count >= 10000, `estado ${r1.estado}, sirve ${r1.cuerpo?.count ?? '-'} velas`)
db.falla = null
const r1b = await llama(candles, { method: 'GET', token: tok(A), query: q('GBPJPY') })
oraculo('D04', 'y la siguiente peticion (cache) tampoco', r1b.cuerpo?.count >= 10000, `sirve ${r1b.cuerpo?.count}`)
oraculo('D04', 'el bucket conserva las 10.000', velasEn('GBPJPY/M1/2025.json') === 10000, velasEn('GBPJPY/M1/2025.json'))

titulo('1b · «no existe» al leer, existe al comprobar (carrera)')
escenario({ perfiles: [perfil(A)], storage: { 'forex-data': { 'USDJPY/M1/2025.json': DIEZMIL } } })
descargas(NO_EXISTE)
proveedor.responde = () => diaM1('2025-01-06')
const rc = await llama(candles, { method: 'GET', token: tok(A), query: q('USDJPY') })
ver('control: se fue al proveedor (la primera lectura dijo «no existe»)', proveedor.llamadas.length === 1)
oraculo('D04', 'sirve la existente de 10.000, no la nueva de 1.440', rc.estado === 200 && rc.cuerpo.count === 10000, `estado ${rc.estado}, sirve ${rc.cuerpo?.count}`)
oraculo('D04', 'y no la sube', !db.log.some(l => l.op === 'upload') && velasEn('USDJPY/M1/2025.json') === 10000, `${db.log.filter(l => l.op === 'upload').length} uploads`)

titulo('2 · Storage no deja leer (todas las lecturas fallan)')
escenario({ perfiles: [perfil(A)], storage: { 'forex-data': { 'USDCHF/M1/2025.json': DIEZMIL } } })
db.falla = c => c.op === 'download' ? RED : null
proveedor.responde = () => diaM1('2025-01-06')
const r2 = await llama(candles, { method: 'GET', token: tok(A), query: q('USDCHF') })
ver('control: las lecturas fallaron', db.log.some(l => l.op === 'download'))
oraculo('D04', 'sin poder leer lo guardado, no se pisa', velasEn('USDCHF/M1/2025.json') === 10000, `el bucket pasa de 10000 a ${velasEn('USDCHF/M1/2025.json')} velas`)
oraculo('D04', 'ni se sirve la de 1.440 como si fuera el año', r2.estado !== 200 || r2.cuerpo.count >= 10000, `estado ${r2.estado}, ${r2.cuerpo?.count ?? '-'} velas`)

titulo('2b · «no existe» al leer y la comprobacion falla')
escenario({ perfiles: [perfil(A)], storage: { 'forex-data': { 'NZDUSD/M1/2025.json': DIEZMIL } } })
descargas(NO_EXISTE, RED)
proveedor.responde = () => diaM1('2025-01-06')
await llama(candles, { method: 'GET', token: tok(A), query: q('NZDUSD') })
ver('control: se fue al proveedor', proveedor.llamadas.length === 1)
oraculo('D04', 'sin poder comprobar lo guardado, no se pisa', velasEn('NZDUSD/M1/2025.json') === 10000, `el bucket pasa de 10000 a ${velasEn('NZDUSD/M1/2025.json')} velas`)

titulo('3 · el upload falla')
// una descarga VALIDA (D03: cobertura del año entero): el año en curso hasta ayer
const ANIO = new Date().getUTCFullYear(), DIA = 86400000, HOY0 = Math.floor(Date.now() / DIA) * DIA
const anioValido = []
for (let t = Date.UTC(ANIO, 0, 1); t < HOY0; t += DIA) { const d = new Date(t).getUTCDay(); if (d >= 1 && d <= 5) anioValido.push(...diaM1(new Date(t).toISOString().slice(0, 10), 1200)) }
escenario({ perfiles: [perfil(A)] })
db.falla = c => c.op === 'upload' ? { name: 'StorageApiError', message: 'Payload too large', status: 413, statusCode: '413' } : null
proveedor.responde = () => anioValido
logs.length = 0
await llama(candles, { method: 'GET', token: tok(A), query: { pair: 'AUDCAD', timeframe: 'M1', from: String(Date.UTC(ANIO, 0, 1) / 1000), to: String(Date.UTC(ANIO, 0, 31) / 1000), year: String(ANIO) } })
ver('control: el upload se intento y fallo (no hay fichero)', db.log.some(l => l.op === 'upload') && !guardado(`AUDCAD/M1/${ANIO}`).velas)
const delHandler = () => logs.filter(l => l.startsWith('[candles]'))
const dice = delHandler().find(l => /Saved/.test(l))
oraculo('D04', 'un upload fallido no se registra como «Saved»', !dice, dice ?? '')
oraculo('D04', 'y se registra el error', delHandler().some(l => /upload|subir/i.test(l) && /413|Payload too large/.test(l)), delHandler().filter(l => /upload|Saved/i.test(l)).join(' | '))
fin()
