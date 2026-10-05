/**
 * D03 · UN HISTORICO PARCIAL SE PUBLICA Y SE SIRVE COMO COMPLETO
 *
 * Astra (4-oct): detectGaps solo revisa los dias entre la primera y la ultima
 * vela recibidas (pages/api/candles.js:59-80): un año de un solo lunes de 1.440
 * velas da cero agujeros y se sube al bucket. Y el cliente no mira el estado
 * HTTP de cada año (lib/sessionData.js:54-56): si un año da 500, la sesion se
 * arma con lo que haya y no avisa.
 *
 * Se ejecuta: el handler REAL con el proveedor FALSO, y fetchSessionCandles
 * REAL con un 500 inventado para el año de la sesion.
 *
 * ORACULOS, a mano:
 *   · 2025 es un año cerrado: tiene ~260 dias de mercado; un solo lunes es
 *     1/260 de cobertura. No se publica ni se sirve como el año 2025.
 *   · sesion de marzo de 2025 con contexto desde septiembre de 2024: si 2025 da
 *     500, la sesion NO tiene sus velas → fetchSessionCandles no devuelve una
 *     sesion «normal» (devuelve error o la marca incompleta).
 */
import { titulo, ver, oraculo, fin, escenario, perfil, A, tok, proveedor, importa, db, retenApi, api } from '../lib.mjs'
import { llama } from '../supabase-falso.mjs'
import { diaM1 } from '../proveedor-falso.mjs'
import { respuesta } from '../entorno.mjs'
const candles = (await importa('pages/api/candles.js')).default
const { fetchSessionCandles } = await importa('lib/sessionData.js')

titulo('1 · el proveedor devuelve un solo lunes para todo 2025')
escenario({ perfiles: [perfil(A)] })
proveedor.responde = () => diaM1('2025-01-06')
const r = await llama(candles, { method: 'GET', token: tok(A), query: { pair: 'NZDUSD', timeframe: 'M1', from: '1735689600', to: '1767225599', year: '2025' } })
ver('control: el proveedor fue llamado una vez para 2025', proveedor.llamadas.length === 1 && proveedor.llamadas[0].desde.startsWith('2025-01-01'), JSON.stringify(proveedor.llamadas[0]))
const subido = db.storage['forex-data']['NZDUSD/M1/2025.json']
oraculo('D03', 'un año de un solo dia no se sube al bucket como 2025', !subido, subido ? `subido con ${JSON.parse(subido).length} velas` : '')
oraculo('D03', 'ni se sirve como el año completo', r.estado !== 200, `estado ${r.estado}, ${r.cuerpo?.count} velas, source=${r.cuerpo?.source}`)

titulo('2 · el cliente con un 500 en el año de la sesion')
escenario({ perfiles: [perfil(A)], storage: { 'forex-data': { 'AUDUSD/M1/2024.json': JSON.stringify(
  [0, 1, 2].map(i => ({ time: Date.parse('2024-10-01T10:00:00Z') / 1000 + i * 60, open: 0.7, high: 0.7, low: 0.7, close: 0.7, volume: 1 }))) } } })
retenApi.responde = u => /year=2025/.test(u) ? respuesta(500, { error: 'Storage timeout' }) : null
const res = await fetchSessionCandles({ pair: 'AUD/USD', dateFrom: '2025-03-03', dateTo: '2025-03-07' })
ver('control: se pidieron 2024 (contexto, 200) y 2025 (sesion, 500)', api.llamadas.length === 2 && api.llamadas[0].estado === 200 && api.llamadas[1].estado === 500 && api.llamadas[1].inventada, JSON.stringify(api.llamadas.map(l => [l.ruta, l.estado])))
ver('control: llegaron las 3 velas de contexto de 2024', res?.candles?.length === 3, res?.candles?.length)
const deSesion = (res?.candles || []).filter(c => c.time >= res.replayTs).length
oraculo('D03', 'sin el año de la sesion no se arma una sesion normal', !res || res.incompleta === true || res.error != null, `devuelve ${res?.candles?.length} velas (${deSesion} dentro de la sesion) sin aviso`)
fin()
