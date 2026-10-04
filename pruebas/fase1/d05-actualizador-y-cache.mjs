/**
 * D05 · EL ACTUALIZADOR DIARIO DEJA HUECOS PARA SIEMPRE Y LA CACHE CALIENTE NO SE ENTERA
 *
 * Astra (4-oct): scripts/actualizar-diario.js baja desde el dia SIGUIENTE a la
 * ultima vela (:75): un ultimo dia a medias o un dia interior vacio no se
 * vuelven a pedir nunca. Y /api/candles guarda cada año en memoria sin
 * caducidad (pages/api/candles.js:26-40): tras la actualizacion, una instancia
 * caliente sigue sirviendo lo viejo.
 *
 * Se ejecuta: el script REAL (pruebas/script-falso.mjs: proveedor y Supabase
 * falsos, reloj fijo, sin .env real) y el handler REAL.
 *
 * ORACULOS, a mano:
 *   · ultimo dia a medias: el fichero acaba el martes 30-sep-2026 a las 11:59
 *     (720 velas). Al correr el jueves 2-oct, el 30-sep debe quedar con sus
 *     1.440 velas (se vuelve a pedir).
 *   · dia interior vacio: el jueves 1-oct el proveedor devuelve [] (fallo
 *     transitorio) y el viernes 2-oct si. En la pasada siguiente (martes 6-oct)
 *     el 1-oct se vuelve a pedir.
 *   · cache: tras añadir el 1-oct al fichero, la misma peticion devuelve las
 *     velas del 1-oct.
 */
import { titulo, ver, oraculo, fin, escenario, perfil, A, tok, proveedor, importa, db } from '../lib.mjs'
import { llama } from '../supabase-falso.mjs'
import { diaM1 } from '../proveedor-falso.mjs'
import { correScript } from '../script-falso.mjs'
const DIA = 86400
const velasDe = (dia, n = 1440) => diaM1(dia, n).map(c => ({ time: c.timestamp / 1000, open: c.open, high: c.high, low: c.low, close: c.close, volume: 1 }))
const enDia = (arr, dia) => arr.filter(v => new Date(v.time * 1000).toISOString().startsWith(dia)).length
const ENV = { NEXT_PUBLIC_SUPABASE_URL: 'https://falso.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'falsa' }
const pedidos = () => proveedor.llamadas.filter(l => l.instrumento === 'eurusd').map(l => l.desde.slice(0, 10))

titulo('1 · el ultimo dia guardado esta a medias')
escenario({ storage: { 'forex-data': { 'EURUSD/M1/2026.json': JSON.stringify([...velasDe('2026-09-29'), ...velasDe('2026-09-30', 720)]) } } })
proveedor.responde = ({ dates }) => diaM1(dates.from.toISOString().slice(0, 10))
const r1 = await correScript('scripts/actualizar-diario.js', { ahora: '2026-10-02T06:00:00Z', argv: ['--subir'], env: ENV })
ver('control: el script no abrio ningun .env real', r1.envLeidos.length === 0, r1.envLeidos.length)
ver('control: el script corrio y subio EURUSD', r1.salida.some(l => /SUBIDO/.test(l)), r1.salida.find(l => /EURUSD/.test(l)) ?? r1.salida.slice(0, 3).join(' | '))
const f1 = JSON.parse(db.storage['forex-data']['EURUSD/M1/2026.json'])
oraculo('D05', 'el 30-sep a medias se vuelve a pedir y queda completo (1.440)', enDia(f1, '2026-09-30') === 1440, `pidio ${pedidos().join(', ')}; el 30-sep queda con ${enDia(f1, '2026-09-30')} velas`)

titulo('2 · un dia interior vacio')
escenario({ storage: { 'forex-data': { 'EURUSD/M1/2026.json': JSON.stringify(velasDe('2026-09-30')) } } })
proveedor.responde = ({ dates }) => { const d = dates.from.toISOString().slice(0, 10); return d === '2026-10-01' ? [] : diaM1(d) }
await correScript('scripts/actualizar-diario.js', { ahora: '2026-10-03T06:00:00Z', argv: ['--subir'], env: ENV })
ver('control: primera pasada pidio el 1-oct (vacio) y el 2-oct', pedidos().join() === '2026-10-01,2026-10-02', pedidos().join())
proveedor.llamadas.length = 0
proveedor.responde = ({ dates }) => diaM1(dates.from.toISOString().slice(0, 10))
await correScript('scripts/actualizar-diario.js', { ahora: '2026-10-06T06:00:00Z', argv: ['--subir'], env: ENV })
const f2 = JSON.parse(db.storage['forex-data']['EURUSD/M1/2026.json'])
oraculo('D05', 'la pasada siguiente vuelve a pedir el 1-oct', pedidos().includes('2026-10-01') && enDia(f2, '2026-10-01') === 1440, `pidio ${pedidos().join(', ')}; el 1-oct tiene ${enDia(f2, '2026-10-01')} velas`)

titulo('3 · la cache caliente de /api/candles')
const candles = (await importa('pages/api/candles.js')).default
escenario({ perfiles: [perfil(A)], storage: { 'forex-data': { 'NZDUSD/M1/2026.json': JSON.stringify(velasDe('2026-09-30')) } } })
const q = { pair: 'NZDUSD', timeframe: 'M1', from: String(Date.parse('2026-09-30T00:00:00Z') / 1000), to: String(Date.parse('2026-10-02T00:00:00Z') / 1000), year: '2026' }
const a = await llama(candles, { method: 'GET', token: tok(A), query: q })
ver('control: primera peticion, 1.440 velas del 30-sep', a.cuerpo?.count === 1440)
db.storage['forex-data']['NZDUSD/M1/2026.json'] = JSON.stringify([...velasDe('2026-09-30'), ...velasDe('2026-10-01')])   // el cron añade el 1-oct
const lecturas = db.log.filter(l => l.op === 'download').length
const b = await llama(candles, { method: 'GET', token: tok(A), query: q })
oraculo('D05', 'tras la actualizacion se sirve el 1-oct', b.cuerpo?.count === 2880, `sirve ${b.cuerpo?.count} velas; lecturas de Storage nuevas: ${db.log.filter(l => l.op === 'download').length - lecturas}`)
fin()
