/**
 * D03 · UN HISTORICO PARCIAL SE PUBLICA Y SE SIRVE COMO COMPLETO
 *
 * Astra (4-oct): detectGaps solo revisa los dias entre la primera y la ultima
 * vela recibidas (pages/api/candles.js:59-80): un año de un solo lunes de 1.440
 * velas da cero agujeros y se sube al bucket. Y el cliente no mira el estado
 * HTTP de cada año (lib/sessionData.js:54-56): si un año da 500, la sesion se
 * arma con lo que haya y no avisa.
 * Decision del CTO (4-oct, bloque B): validar cobertura, orden, unicidad y
 * OHLC antes de publicar y antes de operar; el cliente comprueba r.ok; un año
 * fallido no da una sesion «valida».
 *
 * Se ejecuta: el handler REAL con el proveedor FALSO, y fetchSessionCandles
 * REAL sobre /api/candles REAL (Storage falso) con fallos inventados.
 *
 * ORACULOS, a mano (cobertura: cada dia laborable UTC con al menos 1.200
 * velas de lunes a jueves y 1.000 el viernes; 1-ene y 25-dic no se exigen):
 *   Publicar (servidor):
 *   · 2025 es un año cerrado: ~260 dias laborables; un solo lunes no se
 *     publica ni se sirve como el año
 *   · un año completo con UNA vela de high < low no se publica
 *   · un año completo con un minuto repetido con otro precio no se publica
 *   Operar (cliente):
 *   · sesion de marzo de 2025 con contexto desde septiembre de 2024: si 2025
 *     da 500, no hay sesion valida (error)
 *   · sesion lun 3 – vie 7 de marzo de 2025 sin velas el miercoles 5: error
 *   Controles (valen antes y despues): un año completo SI se publica; una
 *   sesion completa SI opera; un año de CONTEXTO caido no invalida la sesion;
 *   datos que acaban antes del final de la sesion no son un hueco.
 */
import { titulo, ver, oraculo, fin, escenario, perfil, A, tok, proveedor, importa, db, retenApi, api } from '../lib.mjs'
import { llama } from '../supabase-falso.mjs'
import { diaM1 } from '../proveedor-falso.mjs'
import { respuesta } from '../entorno.mjs'
const candles = (await importa('pages/api/candles.js')).default
const { fetchSessionCandles } = await importa('lib/sessionData.js')
const DIA = 86400000
const laborable = t => { const d = new Date(t).getUTCDay(); return d >= 1 && d <= 5 }
// el proveedor: 1.200 velas por dia laborable entre dos fechas (ms), formato dukascopy
const anioProveedor = (desdeMs, hastaMs) => {
  const out = []
  for (let t = desdeMs; t < hastaMs; t += DIA) if (laborable(t)) out.push(...diaM1(new Date(t).toISOString().slice(0, 10), 1200))
  return out
}
const hoy0 = Math.floor(Date.now() / DIA) * DIA
const ANIO = new Date().getUTCFullYear()
const pideAnio = (par, anio) => llama(candles, { method: 'GET', token: tok(A), query: { pair: par, timeframe: 'M1', from: String(Date.UTC(anio, 0, 1) / 1000), to: String(Date.UTC(anio, 11, 31) / 1000), year: String(anio) } })

titulo('1 · el proveedor devuelve un solo lunes para todo 2025')
escenario({ perfiles: [perfil(A)] })
proveedor.responde = () => diaM1('2025-01-06')
const r = await pideAnio('NZDUSD', 2025)
ver('control: el proveedor fue llamado para 2025', proveedor.llamadas.length >= 1 && proveedor.llamadas[0].desde.startsWith('2025-01-01'), JSON.stringify(proveedor.llamadas[0]))
const subido = db.storage['forex-data']['NZDUSD/M1/2025.json']
oraculo('D03', 'un año de un solo dia no se sube al bucket como 2025', !subido, subido ? `subido con ${JSON.parse(subido).length} velas` : '')
oraculo('D03', 'ni se sirve como el año completo', r.estado !== 200, `estado ${r.estado}, ${r.cuerpo?.count} velas, source=${r.cuerpo?.source}`)

titulo(`2 · control: ${ANIO} completo hasta ayer SI se publica`)
escenario({ perfiles: [perfil(A)] })
const completo = anioProveedor(Date.UTC(ANIO, 0, 1), hoy0)
proveedor.responde = () => completo
const r2 = await pideAnio('AUDUSD', ANIO)
ver(`control: un año completo (${completo.length} velas) se publica y se sirve`, r2.estado === 200 && !!db.storage['forex-data'][`AUDUSD/M1/${ANIO}.json`], `estado ${r2.estado}`)

titulo('3 · completo, pero con una vela de high < low')
escenario({ perfiles: [perfil(A)] })
const malo = completo.map((c, i) => i === 5000 ? { ...c, high: 1.0, low: 1.2 } : c)
proveedor.responde = () => malo
const r3 = await pideAnio('USDCAD', ANIO)
oraculo('D03', 'un año con OHLC incoherente no se publica', !db.storage['forex-data'][`USDCAD/M1/${ANIO}.json`], `estado ${r3.estado}`)

titulo('4 · completo, pero con un minuto repetido con otro precio')
escenario({ perfiles: [perfil(A)] })
const dup = [...completo.slice(0, 5001), { ...completo[5000], close: 1.3, high: 1.3 }, ...completo.slice(5001)]
proveedor.responde = () => dup
const r4 = await pideAnio('GBPUSD', ANIO)
oraculo('D03', 'un año con un minuto repetido no se publica', !db.storage['forex-data'][`GBPUSD/M1/${ANIO}.json`], `estado ${r4.estado}`)

// ── el cliente ──────────────────────────────────────────────────────────────
const semana = (par, quitar = [], hastaDia = 7) => {
  const v = []
  for (let d = 3; d <= hastaDia; d++) { const dia = `2025-03-0${d}`; if (!quitar.includes(dia)) v.push(...diaM1(dia, 1200).map(c => ({ time: c.timestamp / 1000, open: 1.1, high: 1.1, low: 1.1, close: 1.1, volume: 1 }))) }
  return { [`${par}/M1/2025.json`]: JSON.stringify(v), [`${par}/M1/2024.json`]: JSON.stringify([{ time: Date.parse('2024-10-01T10:00:00Z') / 1000, open: 1.1, high: 1.1, low: 1.1, close: 1.1, volume: 1 }]) }
}
const sesion = par => fetchSessionCandles({ pair: par, dateFrom: '2025-03-03', dateTo: '2025-03-07' })
const valida = res => !!res && !res.error && Array.isArray(res.candles) && res.candles.length > 0

titulo('5 · el cliente con un 500 en el año de la sesion')
escenario({ perfiles: [perfil(A)], storage: { 'forex-data': semana('AUDUSD') } })
retenApi.responde = u => /year=2025/.test(u) ? respuesta(500, { error: 'Storage timeout' }) : null
const res5 = await sesion('AUD/USD')
ver('control: se pidieron 2024 (contexto, 200) y 2025 (sesion, 500)', api.llamadas.length === 2 && api.llamadas[0].estado === 200 && api.llamadas[1].estado === 500, JSON.stringify(api.llamadas.map(l => [l.ruta, l.estado])))
oraculo('D03', 'sin el año de la sesion no hay sesion valida', !valida(res5), `devuelve ${res5?.candles?.length ?? 0} velas${res5?.error ? ', error: ' + res5.error : ' sin aviso'}`)

titulo('6 · sesion lun 3 – vie 7 de marzo de 2025 sin el miercoles 5')
escenario({ perfiles: [perfil(A)], storage: { 'forex-data': semana('USDCHF', ['2025-03-05']) } })
const res6 = await sesion('USD/CHF')
oraculo('D03', 'con un dia laborable vacio dentro de la sesion no se opera', !valida(res6), res6?.error ?? `devuelve ${res6?.candles?.length} velas sin aviso`)

titulo('7 · controles del cliente')
escenario({ perfiles: [perfil(A)], storage: { 'forex-data': semana('GBPJPY') } })
const res7 = await sesion('GBP/JPY')
ver('control: una sesion completa opera (5 dias × 1.200 + 1 de contexto)', valida(res7) && res7.candles.length === 6001, res7?.error ?? res7?.candles?.length)
escenario({ perfiles: [perfil(A)], storage: { 'forex-data': semana('USDJPY') } })
retenApi.responde = u => /year=2024/.test(u) ? respuesta(500, { error: 'Storage timeout' }) : null
const res8 = await sesion('USD/JPY')
ver('control: el año de CONTEXTO caido no invalida la sesion', valida(res8) && res8.candles.length === 6000, res8?.error ?? `${res8?.candles?.length} velas, contexto ${res8?.contextoIncompleto}`)
escenario({ perfiles: [perfil(A)], storage: { 'forex-data': semana('EURUSD', [], 5) } })
const res9 = await sesion('EUR/USD')
ver('control: datos que acaban el miercoles 5 en una sesion hasta el viernes no son un hueco', valida(res9), res9?.error ?? res9?.candles?.length)
fin()
