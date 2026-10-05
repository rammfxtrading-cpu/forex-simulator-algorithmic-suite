/**
 * S03 · /api/candles PERMITE TRABAJO CARO SIN CUOTA, SIN DEDUPLICAR Y POR POST
 *
 * Astra (4-oct): con la cache fria, doce peticiones simultaneas del mismo año
 * lanzan doce descargas anuales al proveedor; el metodo no se comprueba (POST
 * se acepta). pages/api/candles.js:247-283.
 *
 * Se ejecuta: el handler REAL con Storage FALSO retenido hasta que llegan las
 * doce (asi se ve cuantas descargas arrancan a la vez).
 *
 * ORACULOS: doce peticiones simultaneas del mismo par y año → como mucho UNA
 * descarga (las demas esperan esa), y ninguna al proveedor. POST → 405.
 * Bloque D (CTO, 5-oct): /api/candles ya no va nunca al proveedor; la descarga
 * cara que queda es la del objeto anual de Storage.
 * Decision del CTO (4-oct, bloque A): lista cerrada de pares y años. Un par
 * que la interfaz no ofrece, o un año fuera de 2024..año en curso → 400, sin
 * tocar Storage ni el proveedor. Control: TODOS los pares que ofrece la
 * interfaz (lib/sessionUi.js ALL_PAIRS y la lista de pages/dashboard.js) se
 * siguen aceptando.
 * Decision del CTO (4-oct, tras el bloque A): EUR/GBP, EUR/JPY y XAU/USD se
 * ocultan de la interfaz y salen de la lista cerrada hasta nuevo aviso (no
 * estan en el bucket y el almacenamiento esta al 95 %: no se suben datos
 * nuevos). Ninguna sesion existente los usa (copia del 4-oct 12:27).
 */
import { titulo, ver, oraculo, fin, escenario, perfil, A, tok, proveedor, puerta, asienta, importa, fuente, db } from '../lib.mjs'
import { llama } from '../supabase-falso.mjs'
import { diaM1 } from '../proveedor-falso.mjs'
const candles = (await importa('pages/api/candles.js')).default
const q = { pair: 'USDCAD', timeframe: 'M1', from: '1736121600', to: '1736207999', year: '2025' }
// El año publicado en Storage: una semana de enero de 2025, 1.200 velas por dia
const SEMANA = JSON.stringify([6, 7, 8, 9, 10].flatMap(d => diaM1(`2025-01-${String(d).padStart(2, '0')}`, 1200).map(c => ({ time: c.timestamp / 1000, open: 1, high: 1, low: 1, close: 1, volume: 1 }))))

titulo('1 · doce peticiones simultaneas con la cache fria')
escenario({ perfiles: [perfil(A)], storage: { 'forex-data': { 'USDCAD/M1/2025.json': SEMANA } } })
const suelta = puerta()
db.pausa = c => c.op === 'download' ? suelta.p : null    // la descarga del año, retenida hasta que llegan las doce
proveedor.responde = () => []
const vuelo = Array.from({ length: 12 }, () => llama(candles, { method: 'GET', token: tok(A), query: q }))
await asienta(200)
const enVuelo = db.log.filter(l => l.op === 'download').length
suelta.abrir()
const rs = await Promise.all(vuelo)
db.pausa = null
ver('control: las doce respondieron 200 con las mismas velas', rs.every(r => r.estado === 200 && r.cuerpo.count === rs[0].cuerpo.count && r.cuerpo.count > 0), rs.map(r => r.estado).join(','))
oraculo('S03', 'doce peticiones del mismo año → una sola descarga', enVuelo <= 1 && db.log.filter(l => l.op === 'download').length <= 1, `${enVuelo} descargas simultaneas, ${db.log.filter(l => l.op === 'download').length} en total`)
oraculo('S03', 'y ninguna al proveedor', proveedor.llamadas.length === 0, `${proveedor.llamadas.length} descargas anuales al proveedor`)

titulo('2 · metodo')
escenario({ perfiles: [perfil(A)], storage: { 'forex-data': { 'USDCAD/M1/2025.json': JSON.stringify([{ time: 1736150400, open: 1, high: 1, low: 1, close: 1, volume: 1 }]) } } })
const get = await llama(candles, { method: 'GET', token: tok(A), query: q })
ver('control: GET → 200', get.estado === 200)
const post = await llama(candles, { method: 'POST', token: tok(A), query: q })
oraculo('S03', 'POST → 405', post.estado === 405, `estado ${post.estado}`)

titulo('3 · lista cerrada de pares y años')
const { ALL_PAIRS } = await importa('lib/sessionUi.js')
const delDashboard = JSON.parse(/const PAIRS = (\[[^\]]+\])/.exec(fuente('pages/dashboard.js'))[1].replace(/'/g, '"'))
const ofrecidos = [...new Set([...ALL_PAIRS, ...delDashboard].map(p => p.replace('/', '')))]
const UNA = JSON.stringify([{ time: 1736150400, open: 1, high: 1, low: 1, close: 1, volume: 1 }])
escenario({ perfiles: [perfil(A)], storage: { 'forex-data': Object.fromEntries(ofrecidos.map(p => [`${p}/M1/2025.json`, UNA])) } })
const pide = (pair, year) => llama(candles, { method: 'GET', token: tok(A), query: { pair, timeframe: 'M1', from: '1736121600', to: '1736207999', year } })
const rechazados = []
for (const p of ofrecidos) { const r = await pide(p, '2025'); if (r.estado !== 200) rechazados.push(`${p}:${r.estado}`) }
ver(`control: los ${ofrecidos.length} pares que ofrece la interfaz (y estan en el bucket) se aceptan`, rechazados.length === 0, rechazados.join(', ') || ofrecidos.join(' '))
const RETIRADOS = ['EURGBP', 'EURJPY', 'XAUUSD']
const retiradosOfrecidos = RETIRADOS.filter(p => ofrecidos.includes(p))
const retiradosAceptados = []
for (const p of RETIRADOS) { const r = await pide(p, '2025'); if (r.estado !== 400) retiradosAceptados.push(`${p}:${r.estado}`) }
oraculo('S03', 'EUR/GBP, EUR/JPY y XAU/USD: ni se ofrecen en la interfaz ni los acepta la API (400)', retiradosOfrecidos.length === 0 && retiradosAceptados.length === 0,
  `ofrecidos: ${retiradosOfrecidos.join(',') || 'ninguno'}; aceptados: ${retiradosAceptados.join(',') || 'ninguno'}`)
proveedor.llamadas.length = 0; db.log.length = 0
const raros = [['BTCUSD', '2025'], ['../../etc', '2025'], ['EURUSD', '2019'], ['EURUSD', '2099'], ['EURUSD', '2025abc']]
const res = []
for (const [pp, y] of raros) res.push(`${pp}/${y}:${(await pide(pp, y)).estado}`)
oraculo('S03', 'par no ofrecido o año fuera de 2024..año en curso → 400', res.every(x => x.endsWith(':400')), res.join(' · '))
oraculo('S03', 'y sin tocar Storage ni el proveedor', proveedor.llamadas.length === 0 && !db.log.some(l => l.tabla === 'storage:forex-data'),
  `${proveedor.llamadas.length} descargas, ${db.log.filter(l => l.tabla === 'storage:forex-data').length} lecturas de Storage`)
fin()
