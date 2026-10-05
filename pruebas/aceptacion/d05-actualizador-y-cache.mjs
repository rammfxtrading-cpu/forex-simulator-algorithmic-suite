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
 *   · cache (decision del CTO, 5-oct): antes de releer se consulta la version
 *     del objeto (info: etag) y solo se descarga si cambio; dos peticiones
 *     seguidas sin cambio = cero descargas en la segunda; tras añadir el 1-oct,
 *     la siguiente peticion lo sirve. Si la consulta falla: la version ya
 *     verificada en cache, o 503 si no hay.
 * Decision del CTO (4-oct, bloque B): el actualizador reconcilia desde el
 * ultimo dia incompleto y arranca el año nuevo (eso lo mide o01-anio-nuevo);
 * cache de velas con version o caducidad.
 * Control añadido: volver a bajar un dia corto nunca lo EMPEORA (si el
 * proveedor da menos velas que las guardadas, se quedan las guardadas).
 */
import { titulo, ver, oraculo, fin, escenario, perfil, A, tok, proveedor, importa, db } from '../lib.mjs'
import { llama } from '../supabase-falso.mjs'
import { diaM1 } from '../proveedor-falso.mjs'
import { correScript, ejecucionesScripts } from '../script-falso.mjs'
const DIA = 86400
const velasDe = (dia, n = 1440) => diaM1(dia, n).map(c => ({ time: c.timestamp / 1000, open: c.open, high: c.high, low: c.low, close: c.close, volume: 1 }))
const enDia = (arr, dia) => arr.filter(v => new Date(v.time * 1000).toISOString().startsWith(dia)).length
const ENV = { NEXT_PUBLIC_SUPABASE_URL: 'https://falso.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'falsa' }
const pedidos = () => proveedor.llamadas.filter(l => l.instrumento === 'eurusd').map(l => l.desde.slice(0, 10))
// el historial previo del fichero: cada dia laborable completo desde el 1-ene hasta `antesDe` (excluido)
const historial = antesDe => { const v = []; for (let t = Date.UTC(2026, 0, 1); t < Date.parse(antesDe + 'T00:00:00Z'); t += DIA * 1000) { const d = new Date(t).getUTCDay(); if (d >= 1 && d <= 5) v.push(...velasDe(new Date(t).toISOString().slice(0, 10))) } return v }

titulo('1 · el ultimo dia guardado esta a medias')
escenario({ storage: { 'forex-data': { 'EURUSD/M1/2026.json': JSON.stringify([...historial('2026-09-29'), ...velasDe('2026-09-29'), ...velasDe('2026-09-30', 720)]) } } })
proveedor.responde = ({ dates }) => diaM1(dates.from.toISOString().slice(0, 10))
const r1 = await correScript('scripts/actualizar-diario.js', { ahora: '2026-10-02T06:00:00Z', argv: ['--subir'], env: ENV })
ver('control: el script no abrio ningun .env real', r1.envLeidos.length === 0, r1.envLeidos.length)
ver('control: el script corrio y subio EURUSD', r1.salida.some(l => /SUBIDO/.test(l)), r1.salida.find(l => /EURUSD/.test(l)) ?? r1.salida.slice(0, 3).join(' | '))
const f1 = JSON.parse(db.storage['forex-data']['EURUSD/M1/2026.json'])
oraculo('D05', 'el 30-sep a medias se vuelve a pedir y queda completo (1.440)', enDia(f1, '2026-09-30') === 1440, `pidio ${pedidos().join(', ')}; el 30-sep queda con ${enDia(f1, '2026-09-30')} velas`)

titulo('2 · un dia interior vacio')
escenario({ storage: { 'forex-data': { 'EURUSD/M1/2026.json': JSON.stringify([...historial('2026-09-30'), ...velasDe('2026-09-30')]) } } })
proveedor.responde = ({ dates }) => { const d = dates.from.toISOString().slice(0, 10); return d === '2026-10-01' ? [] : diaM1(d) }
await correScript('scripts/actualizar-diario.js', { ahora: '2026-10-03T06:00:00Z', argv: ['--subir'], env: ENV })
ver('control: primera pasada pidio el 1-oct (vacio) y el 2-oct', [...pedidos()].sort().join() === '2026-10-01,2026-10-02', pedidos().join())
proveedor.llamadas.length = 0
proveedor.responde = ({ dates }) => diaM1(dates.from.toISOString().slice(0, 10))
await correScript('scripts/actualizar-diario.js', { ahora: '2026-10-06T06:00:00Z', argv: ['--subir'], env: ENV })
const f2 = JSON.parse(db.storage['forex-data']['EURUSD/M1/2026.json'])
oraculo('D05', 'la pasada siguiente vuelve a pedir el 1-oct', pedidos().includes('2026-10-01') && enDia(f2, '2026-10-01') === 1440, `pidio ${pedidos().join(', ')}; el 1-oct tiene ${enDia(f2, '2026-10-01')} velas`)

titulo('2b · control: volver a bajar un dia corto no lo empeora')
escenario({ storage: { 'forex-data': { 'EURUSD/M1/2026.json': JSON.stringify([...historial('2026-09-29'), ...velasDe('2026-09-29', 1000), ...velasDe('2026-09-30')]) } } })
proveedor.responde = ({ dates }) => { const d = dates.from.toISOString().slice(0, 10); return d === '2026-09-29' ? diaM1(d, 500) : diaM1(d) }
await correScript('scripts/actualizar-diario.js', { ahora: '2026-10-02T06:00:00Z', argv: ['--subir'], env: ENV })
const f3 = JSON.parse(db.storage['forex-data']['EURUSD/M1/2026.json'])
ver('control: el martes 29 (1.000 guardadas, el proveedor da 500) se queda con 1.000', enDia(f3, '2026-09-29') === 1000, `${enDia(f3, '2026-09-29')} velas; pidio ${pedidos().join(', ')}`)

titulo('3 · la cache de /api/candles comprueba la version (decision del CTO, 5-oct)')
// Antes de releer, una llamada de metadatos (info: etag); solo se descarga si
// cambio. Sin caducidad corta: la de 5 minutos agotaba la transferencia.
const candles = (await importa('pages/api/candles.js')).default
escenario({ perfiles: [perfil(A)], storage: { 'forex-data': { 'NZDUSD/M1/2026.json': JSON.stringify(velasDe('2026-09-30')) } } })
const q = { pair: 'NZDUSD', timeframe: 'M1', from: String(Date.parse('2026-09-30T00:00:00Z') / 1000), to: String(Date.parse('2026-10-02T00:00:00Z') / 1000), year: '2026' }
const cuenta = op => db.log.filter(l => l.op === op).length
const a = await llama(candles, { method: 'GET', token: tok(A), query: q })
ver('control: primera peticion, 1.440 velas del 30-sep y una descarga', a.cuerpo?.count === 1440 && cuenta('download') === 1, `${a.cuerpo?.count} velas, ${cuenta('download')} descargas`)
const d0 = cuenta('download'), i0 = cuenta('info')
const a2 = await llama(candles, { method: 'GET', token: tok(A), query: q })
oraculo('D05', 'dos peticiones seguidas sin cambio: la segunda hace CERO descargas', a2.cuerpo?.count === 1440 && cuenta('download') === d0, `${cuenta('download') - d0} descargas`)
oraculo('D05', 'y lo sabe consultando la version (una llamada info, sin descargar)', cuenta('info') === i0 + 1, `${cuenta('info') - i0} info`)
db.storage['forex-data']['NZDUSD/M1/2026.json'] = JSON.stringify([...velasDe('2026-09-30'), ...velasDe('2026-10-01')])   // el cron añade el 1-oct
const d1 = cuenta('download')
const b = await llama(candles, { method: 'GET', token: tok(A), query: q })
oraculo('D05', 'el fichero cambia: la siguiente peticion lo descarga y sirve el 1-oct, sin esperar a ninguna caducidad', b.cuerpo?.count === 2880 && cuenta('download') === d1 + 1, `sirve ${b.cuerpo?.count} velas; ${cuenta('download') - d1} descargas`)

titulo('3b · la consulta de version falla')
db.falla = c => c.op === 'info' ? { name: 'StorageUnknownError', message: 'fetch failed' } : null
const d2 = cuenta('download')
const c3 = await llama(candles, { method: 'GET', token: tok(A), query: q })
oraculo('D05', 'con una version ya verificada en cache: se sirve esa, sin descargar', c3.estado === 200 && c3.cuerpo?.count === 2880 && cuenta('download') === d2, `estado ${c3.estado}; ${c3.cuerpo?.count} velas; ${cuenta('download') - d2} descargas`)
escenario({ perfiles: [perfil(A)], storage: { 'forex-data': { 'AUDUSD/M1/2026.json': JSON.stringify(velasDe('2026-09-30')) } } })
db.falla = c => c.op === 'info' ? { name: 'StorageUnknownError', message: 'fetch failed' } : null
const c4 = await llama(candles, { method: 'GET', token: tok(A), query: { ...q, pair: 'AUDUSD' } })
oraculo('D05', 'sin version en cache: 503 (no se sabe que hay), no se va al proveedor', c4.estado === 503 && proveedor.llamadas.length === 0, `estado ${c4.estado}; ${proveedor.llamadas.length} descargas al proveedor`)
db.falla = null

ver('control (H06): todos los scripts terminaron (veredicto o exit), ninguno por timeout', ejecucionesScripts.length > 0 && ejecucionesScripts.every(e => e.terminoPor !== 'timeout'), JSON.stringify(ejecucionesScripts.map(e => e.terminoPor + ':' + e.codigo)))
fin()
