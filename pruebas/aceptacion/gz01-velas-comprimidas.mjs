/**
 * GZ01 · LECTORES Y ESCRITORES DE VELAS COMPRIMIDAS
 *
 * Decision del CTO (5-oct-2026): forex-data pasa a gzip. Plan aprobado:
 * lectores que aceptan los dos formatos → copia local verificada → subir →
 * comprobar hash → borrar el original → escritores. Ahora SOLO el codigo de
 * lectores y escritores; ningun fichero se migra.
 *
 * El contrato (pages/api/candles.js y scripts/ficheros-velas.js):
 *   LECTURA   el {AÑO}.json.gz si existe; si no existe (404 real), el {AÑO}.json.
 *             Un error que NO es 404 en el .json.gz es «no se pudo leer»: no se
 *             cae al .json (puede ser una version vieja). Se descomprime por los
 *             bytes magicos de gzip, no por la extension.
 *   ESCRITURA solo {AÑO}.json.gz, contentType application/gzip. El .json no se
 *             toca ni se borra (borrar es un paso de la migracion, aparte).
 *   CACHE     la version es la del fichero vigente: si aparece el .json.gz de un
 *             año que estaba en cache como .json, se relee.
 *
 * Se ejecuta el handler REAL (lectura) y los escritores REALES
 * actualizar-diario.js y restore-2026.js (pruebas/script-falso.mjs: proveedor
 * y Supabase falsos, reloj fijo, sin .env real). Bloque D (5-oct): son los
 * unicos escritores (lib/mercado/ficheros.mjs); subir-a-supabase.js se retiro.
 * NO se ejecuta listar-bucket.js (no imprime veredicto final y su filtro f.id
 * no lo cumple el list del doble).
 *
 * Contra c470c8f (pruebas/historicas.sh) tiene que salir en rojo: aquel codigo
 * solo conoce el .json.
 */
import { gzipSync, gunzipSync } from 'node:zlib'
import { titulo, ver, oraculo, fin, escenario, perfil, A, tok, proveedor, importa, db, guardado } from '../lib.mjs'
import { llama } from '../supabase-falso.mjs'
import { diaM1 } from '../proveedor-falso.mjs'
import { correScript, ejecucionesScripts } from '../script-falso.mjs'

// esta prueba es del modo COMPRIMIDO: interruptor encendido (bloque E, punto 6;
// apagado por defecto: ver gz00). Lo ven el handler y los scripts (mismo proceso).
process.env.MERCADO_GZIP = '1'
const DIA = 86400000
const velasDe = (dia, n = 1440) => diaM1(dia, n).map(c => ({ time: c.timestamp / 1000, open: c.open, high: c.high, low: c.low, close: c.close, volume: 1 }))
const enDia = (arr, dia) => (arr || []).filter(v => new Date(v.time * 1000).toISOString().startsWith(dia)).length
const gz = v => gzipSync(Buffer.from(JSON.stringify(v)))
// Buffer o Uint8Array (escenario() clona con structuredClone, que da Uint8Array)
const esGzip = b => b instanceof Uint8Array && b[0] === 0x1f && b[1] === 0x8b
const ENV = { NEXT_PUBLIC_SUPABASE_URL: 'https://falso.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'falsa' }
const RED = { name: 'StorageUnknownError', message: 'fetch failed' }
const DOS = [...velasDe('2026-09-30'), ...velasDe('2026-10-01')]     // 2.880
const UNO = velasDe('2026-09-30')                                     // 1.440
const candles = (await importa('pages/api/candles.js')).default
const pide = par => llama(candles, { method: 'GET', token: tok(A), query: { pair: par, timeframe: 'M1', from: String(Date.parse('2026-09-30T00:00:00Z') / 1000), to: String(Date.parse('2026-10-02T00:00:00Z') / 1000), year: '2026' } })
// los cerrojos de publicacion (_cerrojos/, lib/mercado/ficheros.mjs) no son datos de mercado
const ops = op => db.log.filter(l => l.op === op && !String(l.payload?.ruta ?? l.payload).includes('_cerrojos/'))
// cada seccion usa un par distinto: la cache del handler vive en el modulo
const bucket = objetos => { escenario({ perfiles: [perfil(A)], storage: { 'forex-data': objetos } }); proveedor.responde = () => [] }

titulo('1 · LECTOR: solo hay .json.gz')
bucket({ 'EURUSD/M1/2026.json.gz': gz(UNO) })
ver('control: el fichero del bucket es gzip de verdad', esGzip(db.storage['forex-data']['EURUSD/M1/2026.json.gz']))
const r1 = await pide('EURUSD')
oraculo('GZ01', 'se lee el .json.gz y se sirven sus 1.440 velas, sin ir al proveedor', r1.estado === 200 && r1.cuerpo?.count === 1440 && proveedor.llamadas.length === 0, `estado ${r1.estado}; ${r1.cuerpo?.count ?? '-'} velas; ${proveedor.llamadas.length} llamadas al proveedor`)

titulo('2 · control: solo hay .json (el formato de siempre sigue sirviendo)')
bucket({ 'USDJPY/M1/2026.json': JSON.stringify(UNO) })
const r2 = await pide('USDJPY')
ver('control: el .json se sirve igual que antes', r2.estado === 200 && r2.cuerpo?.count === 1440 && proveedor.llamadas.length === 0, `estado ${r2.estado}; ${r2.cuerpo?.count ?? '-'} velas`)

titulo('3 · LECTOR: estan los dos (migracion a medias): manda el .json.gz')
bucket({ 'AUDUSD/M1/2026.json.gz': gz(DOS), 'AUDUSD/M1/2026.json': JSON.stringify(UNO) })
const r3 = await pide('AUDUSD')
oraculo('GZ01', 'con los dos, se sirve el .json.gz (2.880), no el .json (1.440)', r3.estado === 200 && r3.cuerpo?.count === 2880, `estado ${r3.estado}; ${r3.cuerpo?.count ?? '-'} velas`)

titulo('4 · LECTOR: el .json.gz existe pero no se puede leer (red), y hay un .json viejo')
bucket({ 'GBPUSD/M1/2026.json.gz': gz(DOS), 'GBPUSD/M1/2026.json': JSON.stringify(UNO) })
db.falla = c => c.op === 'download' && String(c.payload).endsWith('.json.gz') ? RED : null
const r4 = await pide('GBPUSD')
db.falla = null
oraculo('GZ01', 'un error que no es 404 no hace caer al .json viejo: no se sirven sus 1.440', r4.cuerpo?.count !== 1440, `estado ${r4.estado}; ${r4.cuerpo?.count ?? '-'} velas`)
oraculo('GZ01', 'y responde 503 (no se pudo leer), sin ir al proveedor', r4.estado === 503 && proveedor.llamadas.length === 0, `estado ${r4.estado}; ${proveedor.llamadas.length} llamadas al proveedor`)

titulo('5 · LECTOR: el .json.gz llega ya descomprimido (bytes de JSON plano)')
bucket({ 'USDCHF/M1/2026.json.gz': JSON.stringify(UNO) })
const r5 = await pide('USDCHF')
oraculo('GZ01', 'se reconoce por el contenido, no por la extension: 1.440 velas', r5.estado === 200 && r5.cuerpo?.count === 1440, `estado ${r5.estado}; ${r5.cuerpo?.count ?? '-'} velas`)

titulo('6 · CACHE: el año estaba en cache como .json y aparece su .json.gz')
bucket({ 'USDCAD/M1/2026.json': JSON.stringify(UNO) })
const r6a = await pide('USDCAD')
ver('control: primero se sirve el .json (1.440)', r6a.estado === 200 && r6a.cuerpo?.count === 1440, `${r6a.cuerpo?.count ?? '-'} velas`)
db.storage['forex-data']['USDCAD/M1/2026.json.gz'] = gz(DOS)     // la migracion sube el .gz; el .json sigue
const r6b = await pide('USDCAD')
oraculo('GZ01', 'la siguiente peticion sirve el .json.gz (2.880), no la cache del .json', r6b.estado === 200 && r6b.cuerpo?.count === 2880, `${r6b.cuerpo?.count ?? '-'} velas`)

// (La seccion 7 publicaba por /api/candles: desde el bloque D, 5-oct, la API no
// escribe; lo prueban mp01 y d04. La escritura .json.gz: secciones 8 y 10.)

titulo('8 · ESCRITOR actualizar-diario: solo habia .json')
// bloque G, punto 7 (BF-01): un domingo sin velas esta PENDIENTE; el historial
// lleva domingos reales: 120 velas de 22:00 a 23:59 UTC (como los medidos)
const historial = antesDe => { const v = []; for (let t = Date.UTC(2026, 0, 1); t < Date.parse(antesDe + 'T00:00:00Z'); t += DIA) { const d = new Date(t).getUTCDay(), dia = new Date(t).toISOString().slice(0, 10); if (d >= 1 && d <= 5) v.push(...velasDe(dia)); else if (d === 0) v.push(...velasDe(dia).slice(22 * 60)) } return v }
const JSON8 = JSON.stringify([...historial('2026-09-29'), ...velasDe('2026-09-29')])
bucket({ 'EURUSD/M1/2026.json': JSON8 })
proveedor.responde = ({ dates }) => diaM1(dates.from.toISOString().slice(0, 10))
const s8 = await correScript('scripts/actualizar-diario.js', { ahora: '2026-10-02T06:00:00Z', argv: ['--subir'], env: ENV })
ver('control: el script no abrio ningun .env real', s8.envLeidos.length === 0, s8.envLeidos.length)
ver('control: el script corrio y subio EURUSD (en el formato que sea)', ops('upload').some(l => l.payload.ruta.startsWith('EURUSD/M1/2026.json')), ops('upload').map(l => l.payload.ruta).join(' '))
const up8 = ops('upload').filter(l => l.payload.ruta.startsWith('EURUSD/'))
oraculo('GZ01', 'sube EURUSD/M1/2026.json.gz con contentType application/gzip', up8.length === 1 && up8[0].payload.ruta === 'EURUSD/M1/2026.json.gz' && up8[0].payload.contentType === 'application/gzip', up8.map(l => `${l.payload.ruta} ${l.payload.contentType}`).join(' · '))
const g8 = guardado('EURUSD/M1/2026')
oraculo('GZ01', 'lo vigente es el .json.gz, con lo de antes y el 30-sep y 1-oct', g8.formato === 'gz' && enDia(g8.velas, '2026-09-29') === 1440 && enDia(g8.velas, '2026-10-01') === 1440, `${g8.formato}; 29-sep ${enDia(g8.velas, '2026-09-29')}, 1-oct ${enDia(g8.velas, '2026-10-01')}`)
oraculo('GZ01', 'el .json no se toca (mismo contenido) ni se borra nada', db.storage['forex-data']['EURUSD/M1/2026.json'] === JSON8 && ops('remove').length === 0, `${ops('remove').length} remove`)

titulo('9 · LECTOR actualizar-diario: hay .json.gz al dia y un .json viejo')
bucket({ 'EURUSD/M1/2026.json.gz': gz([...historial('2026-10-01'), ...velasDe('2026-10-01')]), 'EURUSD/M1/2026.json': JSON.stringify([...historial('2026-09-29'), ...velasDe('2026-09-29')]) })
proveedor.responde = ({ dates }) => diaM1(dates.from.toISOString().slice(0, 10))
const s9 = await correScript('scripts/actualizar-diario.js', { ahora: '2026-10-03T06:00:00Z', argv: ['--subir'], env: ENV })
const pidio9 = proveedor.llamadas.filter(l => l.instrumento === 'eurusd').map(l => l.desde.slice(0, 10))
ver('control: el script termino', s9.salida.some(l => /EURUSD/.test(l)), s9.salida.slice(0, 2).join(' | '))
oraculo('GZ01', 'parte del .json.gz: solo pide el 2-oct (no el 30-sep ni el 1-oct)', pidio9.join() === '2026-10-02', `pidio ${pidio9.join(', ') || 'nada'}`)

titulo('10 · ESCRITOR restore-2026 --subir: sube .json.gz y no toca el .json')
const cien = JSON.stringify(diaM1('2026-01-05', 100).map(c => ({ time: c.timestamp / 1000, open: 1, high: 1, low: 1, close: 1, volume: 1 })))
bucket({ 'EURUSD/M1/2026.json': cien })
proveedor.responde = ({ dates }) => { const out = []; for (let t = Date.UTC(2026, 0, 1); t < dates.to.getTime(); t += DIA) { const d = new Date(t); if (d.getUTCDay() % 6) out.push(...diaM1(d.toISOString().slice(0, 10))) } return out }
const s10 = await correScript('scripts/restore-2026.js', { ahora: '2026-01-16T12:00:00Z', argv: ['--subir'] })
const up10 = ops('upload')
ver('control: subio los 6 pares y acabo bien', up10.length === 6 && (s10.exitCode ?? 0) === 0, `${up10.length} uploads; codigo ${s10.exitCode ?? 0}`)
oraculo('GZ01', 'los 6 son {PAR}/M1/2026.json.gz con contentType application/gzip', up10.length === 6 && up10.every(l => /^[A-Z]{6}\/M1\/2026\.json\.gz$/.test(l.payload.ruta) && l.payload.contentType === 'application/gzip'), up10.map(l => `${l.payload.ruta} ${l.payload.contentType}`).join(' · '))
oraculo('GZ01', 'el EURUSD/M1/2026.json de antes sigue igual y no se borra nada', db.storage['forex-data']['EURUSD/M1/2026.json'] === cien && ops('remove').length === 0, `${ops('remove').length} remove`)

ver('control (H06): todos los scripts terminaron (veredicto o exit), ninguno por timeout', ejecucionesScripts.length > 0 && ejecucionesScripts.every(e => e.terminoPor !== 'timeout'), JSON.stringify(ejecucionesScripts.map(e => e.terminoPor + ':' + e.codigo)))
fin()
