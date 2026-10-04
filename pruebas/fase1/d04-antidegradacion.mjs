/**
 * D04 · LA PROTECCION ANTIDEGRADACION NO PROTEGE LO QUE SE SIRVE
 *
 * Astra (4-oct): si el fichero del año no se puede leer, /api/candles va al
 * proveedor; si el bucket tenia 10.000 velas y el proveedor da 1.440, no las
 * sube, pero SIRVE y CACHEA las 1.440 (pages/api/candles.js:212-215). Y un
 * upload fallido se registra como «Saved» (:203-208: el error se devuelve, no
 * se lanza).
 *
 * Se ejecuta: el handler REAL con Storage falso (con fallos programados) y el
 * proveedor FALSO. Variante que añado: si la lectura de comprobacion TAMBIEN
 * falla, el codigo no compara (:184, `if (!dlError && existingBlob)`) y SOBRESCRIBE.
 *
 * ORACULOS, a mano:
 *   · bucket 10.000 velas, nueva 1.440: ratio 0,144 < 0,95 → la buena es la de
 *     10.000; lo que se sirve (y se cachea) no puede ser peor que lo guardado:
 *     o las 10.000, o un error.
 *   · si no se pudo leer lo guardado, no se sabe si la nueva es peor: no se pisa.
 *   · un upload con error no se registra como guardado.
 */
import { titulo, ver, oraculo, fin, escenario, perfil, A, tok, proveedor, importa, db } from '../lib.mjs'
import { llama } from '../supabase-falso.mjs'
import { diaM1 } from '../proveedor-falso.mjs'
const candles = (await importa('pages/api/candles.js')).default
const t0 = Date.parse('2025-01-06T00:00:00Z') / 1000
const DIEZMIL = JSON.stringify(Array.from({ length: 10000 }, (_, i) => ({ time: t0 + i * 60, open: 1, high: 1, low: 1, close: 1, volume: 1 })))
const q = par => ({ pair: par, timeframe: 'M1', from: String(t0), to: String(t0 + 20000 * 60), year: '2025' })
const logs = []
const log0 = console.log
console.log = (...a) => { logs.push(a.join(' ')); log0(...a) }

titulo('1 · la lectura del año falla una vez; el bucket tiene 10.000 velas')
escenario({ perfiles: [perfil(A)], storage: { 'forex-data': { 'GBPJPY/M1/2025.json': DIEZMIL } } })
let fallos = 1
db.falla = c => c.op === 'download' && fallos-- > 0 ? { message: 'upstream timeout', statusCode: '504' } : null
proveedor.responde = () => diaM1('2025-01-06')
const r1 = await llama(candles, { method: 'GET', token: tok(A), query: q('GBPJPY') })
ver('control: se fue al proveedor y la comprobacion leyo las 10.000', proveedor.llamadas.length === 1 && db.log.filter(l => l.op === 'download').length === 2)
ver('control: el bucket conserva las 10.000', JSON.parse(db.storage['forex-data']['GBPJPY/M1/2025.json']).length === 10000)
oraculo('D04', 'no se sirve una version peor que la guardada', r1.estado !== 200 || r1.cuerpo.count >= 10000, `estado ${r1.estado}, sirve ${r1.cuerpo?.count} velas`)
db.falla = null
const r1b = await llama(candles, { method: 'GET', token: tok(A), query: q('GBPJPY') })
oraculo('D04', 'y la siguiente peticion (cache caliente) tampoco', r1b.cuerpo?.count >= 10000, `sirve ${r1b.cuerpo?.count} sin volver a leer Storage (${db.log.filter(l => l.op === 'download').length - 2} lecturas nuevas)`)

titulo('2 · Storage no deja leer el fichero (las dos lecturas fallan)')
escenario({ perfiles: [perfil(A)], storage: { 'forex-data': { 'USDCHF/M1/2025.json': DIEZMIL } } })
db.falla = c => c.op === 'download' ? { message: 'upstream timeout', statusCode: '504' } : null
proveedor.responde = () => diaM1('2025-01-06')
await llama(candles, { method: 'GET', token: tok(A), query: q('USDCHF') })
const queda = JSON.parse(db.storage['forex-data']['USDCHF/M1/2025.json']).length
ver('control: hubo un upload', db.log.some(l => l.op === 'upload'))
oraculo('D04', 'sin poder leer lo guardado, no se pisa', queda === 10000, `el bucket pasa de 10000 a ${queda} velas`)

titulo('3 · el upload falla')
escenario({ perfiles: [perfil(A)] })
db.falla = c => c.op === 'upload' ? { message: 'Payload too large', statusCode: '413' } : null
proveedor.responde = () => diaM1('2025-01-06')
logs.length = 0
await llama(candles, { method: 'GET', token: tok(A), query: q('AUDCAD') })
ver('control: el upload se intento y fallo (no hay fichero)', db.log.some(l => l.op === 'upload') && !db.storage['forex-data']['AUDCAD/M1/2025.json'])
const dice = logs.find(l => /Saved/.test(l))
oraculo('D04', 'un upload fallido no se registra como «Saved»', !dice, dice ?? '')
fin()
