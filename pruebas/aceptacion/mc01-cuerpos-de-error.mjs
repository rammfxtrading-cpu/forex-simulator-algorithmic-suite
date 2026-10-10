/**
 * MC01 · EL LIMITE Y EL CONTADOR VALEN PARA TODA RESPUESTA
 * (Astra MDC-01 sobre b989071; CTO 10-oct; el GET sin etag: mc02)
 *
 * Astra, con storage-js 2.102.1 real y un transporte en memoria: fetchConTope
 * devolvia sin envolver cualquier respuesta no-2xx; el SDK leia entero un 503
 * de 1.294 bytes con 100 autorizados, y leerRuta contaba 100 (el esperado).
 * Decision del CTO:
 *   · el limite y el contador se aplican a toda respuesta con cuerpo de una
 *     descarga atada, tambien a los errores (4xx, 5xx), conservando el estado
 *     HTTP para el diagnostico; se cuentan los bytes recibidos de verdad;
 *
 * ORACULOS, con el SDK REAL (StorageClient de @supabase/storage-js) y un
 * transporte en memoria (ninguna peticion sale del proceso): 503 con cuerpo
 * grande → cortado, estado HTTP en el motivo y recibidos contados; 503 con
 * cuerpo pequeño → error con su estado y sus bytes reales (no el esperado);
 * control positivo 200.
 */
import { titulo, ver, oraculo, fin, importa, REPO } from '../lib.mjs'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { gzipSync } from 'node:zlib'
const L = await importa('lib/mercado/limites.mjs').catch(() => ({}))
const F = await importa('lib/mercado/ficheros.mjs').catch(() => ({}))
const { StorageClient } = await import(createRequire(REPO + 'package.json').resolve('@supabase/storage-js'))
const sha = b => createHash('sha256').update(b).digest('hex')
const LIM = { pequenaMs: 20000, grandeMs: 120000, plazo: ms => AbortSignal.timeout(ms) }

// transporte en memoria: responde con el estado, cabeceras y cuerpo dados, en trozos, y cuenta lo servido
function transporte({ status, cuerpo, cab = {}, trozo = 64 }) {
  const fuente = { servidos: 0, cancelado: false }
  const f = async () => {
    let i = 0
    const body = new ReadableStream({
      pull(c) { if (i >= cuerpo.length) return c.close(); const t = cuerpo.subarray(i, i + trozo); i += t.length; fuente.servidos += t.length; c.enqueue(t) },
      cancel() { fuente.cancelado = true },
    }, { highWaterMark: 0 })
    return new Response(body, { status, headers: cab })
  }
  return { f, fuente }
}
async function lee({ status = 200, cuerpo, cab = {}, tope, sha256 = null }) {
  if (!L.fetchConTope || !F.leerRuta) return { r: { estado: 'sin modulo' }, fuente: {} }
  const t = transporte({ status, cuerpo, cab })
  const sb = { storage: new StorageClient('http://storage.local/storage/v1', {}, L.fetchConTope(t.f)) }
  const r = await F.leerRuta(sb, 'EURUSD/M1/2026.json.gz', { ...LIM, tiempos: [] }, { tope, sha256 })
  return { r, fuente: t.fuente }
}
const ERROR = Buffer.from(JSON.stringify({ statusCode: '503', error: 'Service Unavailable', message: 'x'.repeat(1200) }))
ver('control: el cuerpo de error mide mas de 1.000 bytes', ERROR.length > 1000, ERROR.length)

titulo('1 · cuerpos de error')
const a = await lee({ status: 503, cuerpo: ERROR, cab: { 'content-type': 'application/json' }, tope: { max: 100, etag: 'abc', size: 100 } })
oraculo('MDC-01', '503 con un cuerpo de 1.2xx bytes y 100 autorizados: se corta (estado tope), la fuente deja de servir y se cuentan los bytes recibidos (≤ 100 + un trozo de 64), no el esperado', a.r.estado === 'tope' && a.fuente.servidos <= 164 && a.r.bytes === a.fuente.servidos && a.r.bytes > 100, `${a.r.estado} · ${a.r.bytes} contados · ${a.fuente.servidos} servidos · ${a.r.motivo ?? ''}`)
oraculo('MDC-01', 'y el motivo conserva el estado HTTP (503) para el diagnostico', /503/.test(a.r.motivo ?? ''), a.r.motivo ?? '')
const pequeno = Buffer.from(JSON.stringify({ statusCode: '503', error: 'Service Unavailable', message: 'temporal' }))
const b = await lee({ status: 503, cuerpo: pequeno, cab: { 'content-type': 'application/json' }, tope: { max: 5000, etag: 'abc', size: 5000 } })
oraculo('MDC-01', '503 con cuerpo pequeño (dentro del limite): error con su estado HTTP y los bytes recibidos de verdad, no los 5.000 esperados', b.r.estado === 'error' && b.r.bytes === pequeno.length && /503/.test(b.r.motivo ?? ''), `${b.r.estado} · ${b.r.bytes} contados (cuerpo ${pequeno.length}) · ${b.r.motivo ?? ''}`)
const datos = gzipSync(Buffer.from(JSON.stringify([{ time: 1767312000, open: 1.1, high: 1.1, low: 1.1, close: 1.1, volume: 1 }])))
const c = await lee({ status: 200, cuerpo: datos, cab: { etag: '"abc"' }, tope: { max: datos.length, etag: 'abc', size: datos.length } })
oraculo('MDC-01', 'control positivo: 200 con la etag y el tamaño de info() → ok, contados los bytes del cuerpo', c.r.estado === 'ok' && c.r.bytes === datos.length, `${c.r.estado} · ${c.r.bytes} · ${c.r.motivo ?? ''}`)

fin()
