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
 * Se ejecuta: el escritor REAL scripts/restore-2026.js con el proveedor FALSO
 * (bloque D, 5-oct: /api/candles ya no publica; los escritores publican por
 * lib/mercado/ficheros.mjs), /api/candles REAL para ver que sirve, y
 * fetchSessionCandles REAL sobre /api/candles REAL con fallos inventados.
 *
 * ORACULOS, a mano (cobertura: cada dia laborable UTC con al menos 1.200
 * velas de lunes a jueves y 1.000 el viernes; 1-ene y 25-dic no se exigen):
 *   Publicar (restore de 2026, hoy 16-ene: exige del 1 al 15 de enero):
 *   · un solo lunes no se publica ni /api/candles lo sirve como el año
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
import { titulo, ver, oraculo, fin, escenario, perfil, A, tok, proveedor, importa, db, retenApi, api, guardado } from '../lib.mjs'
import { llama } from '../supabase-falso.mjs'
import { diaM1 } from '../proveedor-falso.mjs'
import { respuesta } from '../entorno.mjs'
import { correScript } from '../script-falso.mjs'
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
// restore-2026 publica 2026 de seis pares; hoy 16-ene-2026 exige del 1 al 15
const AHORA = '2026-01-16T12:00:00Z'
const completo = anioProveedor(Date.UTC(2026, 0, 1), Date.UTC(2026, 0, 16))
const malo = completo.map((c, i) => i === 5000 ? { ...c, high: 1.0, low: 1.2 } : c)
const dup = [...completo.slice(0, 5001), { ...completo[5000], close: 1.3, high: 1.3 }, ...completo.slice(5001)]
const POR_PAR = { nzdusd: diaM1('2026-01-05'), audusd: completo, usdcad: malo, gbpusd: dup, eurusd: completo, usdchf: completo }
escenario({ perfiles: [perfil(A)] })
proveedor.responde = a => POR_PAR[a.instrument]
const sr = await correScript('scripts/restore-2026.js', { ahora: AHORA, argv: ['--subir'] })
ver('control: restore pidio los seis pares desde el 1-ene', ['nzdusd', 'audusd', 'usdcad', 'gbpusd'].every(p => proveedor.llamadas.some(l => l.instrumento === p && l.desde.startsWith('2026-01-01'))), proveedor.llamadas.map(l => l.instrumento).join(' '))
const pide = par => llama(candles, { method: 'GET', token: tok(A), query: { pair: par, timeframe: 'M1', from: String(Date.UTC(2026, 0, 5) / 1000), to: String(Date.UTC(2026, 0, 6) / 1000), year: '2026' } })

titulo('1 · el proveedor devuelve un solo lunes para todo el año')
const subido = guardado('NZDUSD/M1/2026').velas   // .json.gz o .json (compresion, 5-oct)
oraculo('D03', 'un año de un solo dia no se sube al bucket como 2026', !subido, subido ? `subido con ${subido.length} velas` : '')
const r = await pide('NZDUSD')
oraculo('D03', 'ni se sirve como el año completo', r.estado !== 200, `estado ${r.estado}, ${r.cuerpo?.count} velas`)

titulo('2 · control: el año completo hasta ayer SI se publica y se sirve')
const r2 = await pide('AUDUSD')
ver(`control: un año completo (${completo.length} velas) se publica y se sirve`, r2.estado === 200 && guardado('AUDUSD/M1/2026').velas?.length === completo.length, `estado ${r2.estado}`)

titulo('3 · completo, pero con una vela de high < low')
oraculo('D03', 'un año con OHLC incoherente no se publica', !guardado('USDCAD/M1/2026').velas)

titulo('4 · completo, pero con un minuto repetido con otro precio')
oraculo('D03', 'un año con un minuto repetido no se publica', !guardado('GBPUSD/M1/2026').velas)
oraculo('D03', 'restore acaba con codigo 1 (hay pares sin publicar)', (sr.exitCode ?? 0) === 1, `codigo ${sr.exitCode}`)

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
