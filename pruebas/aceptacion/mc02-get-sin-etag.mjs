/**
 * MC02 · UN GET SIN LA ETAG QUE DIO INFO() SOLO SE ACEPTA CERTIFICADO POR EL
 * SHA256 DE LOS METADATOS (Astra, variante de identidad de MDC-01; CTO 10-oct)
 *
 * Los tres casos: sin etag con sha256 que coincide → se acepta; sin etag y sin
 * sha256 → codigo 3 (estado tope); sin etag y sha256 distinto → codigo 3.
 * Contexto comun con MC01 (SDK real, transporte en memoria):
 *
 * Astra, con storage-js 2.102.1 real y un transporte en memoria: fetchConTope
 * devolvia sin envolver cualquier respuesta no-2xx; el SDK leia entero un 503
 * de 1.294 bytes con 100 autorizados, y leerRuta contaba 100 (el esperado).
 * Y una respuesta sin etag pasaba aunque info() hubiera dado una.
 * Decision del CTO:
 *   · el limite y el contador se aplican a toda respuesta con cuerpo de una
 *     descarga atada, tambien a los errores (4xx, 5xx), conservando el estado
 *     HTTP para el diagnostico; se cuentan los bytes recibidos de verdad;
 *   · si info() trajo etag y el GET no la trae: solo se acepta si los
 *     metadatos traen sha256 y el cuerpo coincide; si no, codigo 3 sin publicar.
 *
 * ORACULOS, con el SDK REAL (StorageClient de @supabase/storage-js) y un
 * transporte en memoria (ninguna peticion sale del proceso): 503 con cuerpo
 * grande → cortado, estado HTTP en el motivo y recibidos contados; 503 con
 * cuerpo pequeño → error con su estado y sus bytes reales (no el esperado);
 * control positivo 200; y los tres casos de etag ausente.
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
const datos = gzipSync(Buffer.from(JSON.stringify([{ time: 1767312000, open: 1.1, high: 1.1, low: 1.1, close: 1.1, volume: 1 }])))
titulo('2 · el GET no trae la etag que dio info()')
const d = await lee({ cuerpo: datos, tope: { max: datos.length, etag: 'abc', size: datos.length }, sha256: sha(datos) })
oraculo('Etag', 'sin etag, con sha256 en los metadatos y el cuerpo coincide: se acepta', d.r.estado === 'ok', `${d.r.estado} · ${d.r.motivo ?? ''}`)
const e = await lee({ cuerpo: datos, tope: { max: datos.length, etag: 'abc', size: datos.length } })
oraculo('Etag', 'sin etag y sin sha256 en los metadatos: no se acepta (estado tope → codigo 3)', e.r.estado === 'tope' && /etag/i.test(e.r.motivo ?? ''), `${e.r.estado} · ${e.r.motivo ?? ''}`)
const f = await lee({ cuerpo: datos, tope: { max: datos.length, etag: 'abc', size: datos.length }, sha256: sha(Buffer.from('otro')) })
oraculo('Etag', 'sin etag y con un sha256 que no coincide: no se acepta (estado tope → codigo 3)', f.r.estado === 'tope' && /etag/i.test(f.r.motivo ?? ''), `${f.r.estado} · ${f.r.motivo ?? ''}`)
fin()
