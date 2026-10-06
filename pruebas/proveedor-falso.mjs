// dukascopy-node FALSO: el proveedor de velas. Ninguna prueba llama al real.
// Estado en globalThis.__proveedor:
//   proveedor.responde(args) → lo que devolveria getHistoricalRates (un array de
//                             {timestamp(ms), open, high, low, close, volume}),
//                             o lanza; sin programar, lanza
//   proveedor.pausa(args)    → una promesa que retiene esa descarga (carreras)
//   proveedor.llamadas       → cada llamada: { instrumento, desde, hasta }
export const proveedor = globalThis.__proveedor ??= { responde: null, pausa: null, llamadas: [] }
export function resetProveedor() { proveedor.responde = null; proveedor.pausa = null; proveedor.cuerpoPausa = null; proveedor.abortadas = 0; proveedor.vacioComoSDK = false; proveedor.http = null; proveedor.llamadas.length = 0; intentosPorUrl.clear() }
export async function getHistoricalRates(args) {
  proveedor.llamadas.push({ instrumento: args.instrument, desde: args.dates?.from?.toISOString?.(), hasta: args.dates?.to?.toISOString?.() })
  await new Promise(r => setImmediate(r))
  if (proveedor.pausa) await proveedor.pausa(args)
  if (!proveedor.responde) throw new Error('proveedor-falso: ninguna respuesta programada')
  const r = await proveedor.responde(args)
  // proveedor.vacioComoSDK (OPCIONAL, lo declara la prueba): como dukascopy-node
  // 1.46.4 (dist/index.js:16643-16666), con retryOnEmpty y reintentos una
  // respuesta VACIA agota los reintentos y lanza «Unknown error». Sin
  // declararlo, el doble devuelve [] (las reproducciones historicas cuentan con eso).
  if (proveedor.vacioComoSDK && args.retryOnEmpty && (args.retryCount ?? 0) > 0 && Array.isArray(r) && r.length === 0) throw new Error('Unknown error')
  return r
}
export default { getHistoricalRates }

// ── Las piezas de la libreria para la DESCARGA PROPIA (bloque F, punto 4) ────
// Mismas firmas que dukascopy-node 1.46.4 (normaliseDates, generateUrls,
// processData, formatOutput); una URL por dia, con el formato de la real (mes
// 0-based). El cuerpo «.bi5» del doble es JSON de las filas, no LZMA.
const intentosPorUrl = globalThis.__intentosPorUrl ??= new Map()
export function normaliseDates({ startDate, endDate }) { return [startDate, endDate] }
export function generateUrls({ instrument, startDate, endDate }) {
  const urls = []
  for (let t = startDate.getTime(); t < endDate.getTime(); t += 86400000) {
    const d = new Date(t)
    urls.push(`https://datafeed.dukascopy.com/datafeed/${instrument.toUpperCase()}/${d.getUTCFullYear()}/${String(d.getUTCMonth()).padStart(2, '0')}/${String(d.getUTCDate()).padStart(2, '0')}/BID_candles_min_1.bi5`)
  }
  return urls
}
export function processData({ bufferObjects }) {
  return bufferObjects.flatMap(({ buffer }) => buffer.length ? JSON.parse(buffer.toString('utf8')).map(c => [c.timestamp, c.open, c.high, c.low, c.close, c.volume]) : [])
}
export function formatOutput({ processedData }) {
  return processedData.map(([timestamp, open, high, low, close, volume]) => ({ timestamp, open, high, low, close, volume }))
}
// El fetch del doble (el ejecutor de scripts lo pone en globalThis.fetch mientras
// corre el script; fuera, la red sigue bloqueada). Cada peticion se apunta en
// proveedor.llamadas como antes. Respuesta:
//   proveedor.http(url, intento, { instrumento, dia }) → { status, headers, body }
//     o lanza (error de red) — OPCIONAL, para programar estados HTTP;
//   si no, proveedor.responde({ instrument, dates }) → filas (200; [] = cuerpo
//     vacio) o lanza (error de red).
// Bloque G, punto 9 (BF-03): respeta init.signal como el fetch real (undici):
// abortar rechaza la peticion pendiente (tambien la retenida por pausa/http) y la
// LECTURA DEL CUERPO (proveedor.cuerpoPausa la retiene). proveedor.abortadas cuenta.
const abortable = (p, signal) => !signal ? p : new Promise((ok, mal) => {
  const fuera = () => { proveedor.abortadas = (proveedor.abortadas || 0) + 1; mal(Object.assign(new Error('This operation was aborted'), { name: 'AbortError', code: 'ABORT_ERR' })) }
  if (signal.aborted) return fuera()
  signal.addEventListener('abort', fuera, { once: true })
  Promise.resolve(p).then(ok, mal)
})
export async function fetchFalso(url, init = {}) {
  return abortable(fetchFalsoSinSenal(url, init.signal), init.signal)
}
async function fetchFalsoSinSenal(url, signal) {
  const m = /datafeed\/([A-Z]+)\/(\d{4})\/(\d{2})\/(\d{2})\//.exec(String(url))
  if (!m) throw new TypeError('fetch failed: URL no reconocida por el doble')
  const desde = new Date(Date.UTC(+m[2], +m[3], +m[4])), hasta = new Date(desde.getTime() + 86400000)
  const instrumento = m[1].toLowerCase(), dia = desde.toISOString().slice(0, 10)
  proveedor.llamadas.push({ instrumento, desde: desde.toISOString(), hasta: hasta.toISOString() })
  const intento = (intentosPorUrl.get(url) || 0) + 1
  intentosPorUrl.set(url, intento)
  await new Promise(r => setImmediate(r))
  if (proveedor.pausa) await proveedor.pausa({ instrument: instrumento, dates: { from: desde, to: hasta } })
  let r
  if (proveedor.http) r = await proveedor.http(url, intento, { instrumento, dia })
  else {
    if (!proveedor.responde) throw new Error('proveedor-falso: ninguna respuesta programada')
    const filas = await proveedor.responde({ instrument: instrumento, dates: { from: desde, to: hasta } })
    r = { status: 200, body: filas.length ? JSON.stringify(filas) : '' }
  }
  const cab = Object.fromEntries(Object.entries(r.headers || {}).map(([k, v]) => [k.toLowerCase(), String(v)]))
  const cuerpo = Buffer.from(r.body ?? '')
  const leer = async () => { if (proveedor.cuerpoPausa) await proveedor.cuerpoPausa({ instrumento, dia }); return cuerpo.buffer.slice(cuerpo.byteOffset, cuerpo.byteOffset + cuerpo.length) }
  return { status: r.status, ok: r.status >= 200 && r.status < 300, headers: { get: k => cab[String(k).toLowerCase()] ?? null }, arrayBuffer: () => abortable(leer(), signal) }
}

// Velas M1 de un dia UTC (para programar respuestas): `n` velas desde las 00:00
// de `dia` ('AAAA-MM-DD'), precio plano `px`, timestamp en ms como dukascopy-node.
export function diaM1(dia, n = 1440, px = 1.1) {
  const t0 = Date.parse(dia + 'T00:00:00Z')
  return Array.from({ length: n }, (_, i) => ({ timestamp: t0 + i * 60000, open: px, high: px, low: px, close: px, volume: 1 }))
}
