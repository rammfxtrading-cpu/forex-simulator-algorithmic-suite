/**
 * S03 · /api/candles PERMITE TRABAJO CARO SIN CUOTA, SIN DEDUPLICAR Y POR POST
 *
 * Astra (4-oct): con la cache fria, doce peticiones simultaneas del mismo año
 * lanzan doce descargas anuales al proveedor; el metodo no se comprueba (POST
 * se acepta). pages/api/candles.js:247-283.
 *
 * Se ejecuta: el handler REAL con el proveedor FALSO retenido hasta que llegan
 * las doce (asi se ve cuantas descargas arrancan a la vez).
 *
 * ORACULOS: doce peticiones simultaneas del mismo par y año → como mucho UNA
 * descarga al proveedor (las demas esperan esa). POST → 405.
 */
import { titulo, ver, oraculo, fin, escenario, perfil, A, tok, proveedor, puerta, asienta, importa } from '../lib.mjs'
import { llama } from '../supabase-falso.mjs'
import { diaM1 } from '../proveedor-falso.mjs'
const candles = (await importa('pages/api/candles.js')).default
const q = { pair: 'USDCAD', timeframe: 'M1', from: '1736121600', to: '1736207999', year: '2025' }

titulo('1 · doce peticiones simultaneas con la cache fria')
escenario({ perfiles: [perfil(A)] })
const suelta = puerta()
proveedor.pausa = () => suelta.p
proveedor.responde = () => diaM1('2025-01-06')       // un lunes completo: sin reintentos
const vuelo = Array.from({ length: 12 }, () => llama(candles, { method: 'GET', token: tok(A), query: q }))
await asienta(200)
const enVuelo = proveedor.llamadas.length
suelta.abrir()
const rs = await Promise.all(vuelo)
ver('control: las doce respondieron 200 con las velas del lunes', rs.every(r => r.estado === 200 && r.cuerpo.count === 1440), rs.map(r => r.estado).join(','))
oraculo('S03', 'doce peticiones del mismo año → una sola descarga', enVuelo <= 1, `${enVuelo} descargas anuales simultaneas`)

titulo('2 · metodo')
escenario({ perfiles: [perfil(A)], storage: { 'forex-data': { 'USDCAD/M1/2025.json': JSON.stringify([{ time: 1736150400, open: 1, high: 1, low: 1, close: 1, volume: 1 }]) } } })
const get = await llama(candles, { method: 'GET', token: tok(A), query: q })
ver('control: GET → 200', get.estado === 200)
const post = await llama(candles, { method: 'POST', token: tok(A), query: q })
oraculo('S03', 'POST → 405', post.estado === 405, `estado ${post.estado}`)
fin()
