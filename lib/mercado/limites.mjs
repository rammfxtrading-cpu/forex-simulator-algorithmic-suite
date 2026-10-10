// lib/mercado/limites.mjs — plazos con cancelacion real (bloque G, punto 9;
// Astra BF-03; CTO 6-oct-2026).
//
// plazoReal(ms) → una AbortSignal que se aborta a los ms (AbortSignal.timeout:
//   su temporizador es interno, no el setTimeout global). Se inyecta `plazo`
//   en las pruebas para adelantar el tiempo a mano.
// fetchConLimite(base, ms) → un fetch que aborta cada peticion a los ms (y su
//   cuerpo: con undici, abortar la señal corta tambien la lectura del cuerpo).
//   Es el fetch del cliente de Storage de los scripts (createClient global.fetch):
//   storage-js 2.102 solo acepta señal en download; asi upload, info y remove
//   tambien se cancelan de verdad.
// hastaSenal(promesa, señal, que) → la promesa, o un error de tiempo si la
//   señal se aborta antes. NO cancela la operacion: eso lo hace quien recibe
//   la señal (download) o el fetch con plazo. Por eso una SUBIDA que vence aqui
//   tiene resultado incierto y se reconcilia (lib/mercado/ficheros.mjs).

export const plazoReal = ms => AbortSignal.timeout(Math.max(0, Math.floor(ms)))

export function fetchConLimite(base, ms, plazo = plazoReal) {
  const f = (url, init = {}) => {
    const limite = plazo(ms)
    const signal = init?.signal ? AbortSignal.any([init.signal, limite]) : limite
    return base(url, { ...init, signal })
  }
  f.conLimite = ms
  return f
}

export class ErrorTiempo extends Error {
  constructor(que, ms) { super(`${que}: sin respuesta en ${Math.round(ms / 1000)} s (tiempo agotado)`); this.name = 'TimeoutError'; this.propio = true }
}

export function hastaSenal(promesa, senal, que, ms) {
  if (senal.aborted) return Promise.reject(new ErrorTiempo(que, ms))
  return new Promise((ok, mal) => {
    const fuera = () => mal(new ErrorTiempo(que, ms))
    senal.addEventListener('abort', fuera, { once: true })
    Promise.resolve(promesa).then(v => { senal.removeEventListener('abort', fuera); ok(v) }, e => { senal.removeEventListener('abort', fuera); mal(e) })
  })
}

// ── Tope de bytes en la recepcion (Astra MD-01; CTO 9-oct-2026) ──────────────
// atarDescarga(señal, { max, etag }) → la ficha de esa descarga, con
//   recibidos (bytes que han llegado de verdad) y corte (motivo, si se corto).
// fetchConTope(base) → un fetch que, para una peticion con señal atada:
//   · apunta en la ficha que la respuesta llego (vista) y su estado HTTP;
//   · si es 2xx, rechaza la respuesta SIN leer el cuerpo si su etag no es el
//     de info() (identidad cambiada); si no trae etag y se esperaba una, lo
//     apunta (sinEtag): leerRuta solo la acepta certificada por el sha256 de
//     los metadatos (CTO 10-oct);
//   · a TODA respuesta con cuerpo, tambien a los errores 4xx/5xx (Astra
//     MDC-01: el SDK lee entero el cuerpo de un error): rechaza un
//     Content-Length mayor que el maximo, cuenta el cuerpo al llegar y lo
//     corta en cuanto lo recibido pasa del maximo. El estado HTTP se conserva.
// storage-js 2.102.1 pasa los parametros de un GET (la señal incluida) tal cual
// al fetch del cliente (_getRequestParams), y download acepta { signal }: por
// eso la ficha se ata a la señal de cada descarga. Va POR FUERA de
// fetchConLimite (que sustituye la señal por AbortSignal.any).
// MARGEN EN TRANSITO: el corte se produce al llegar el trozo que pasa del
// maximo; ese trozo ya se ha recibido (en la prueba, en memoria, un trozo de
// 64 KiB) y lo que la red tenga en vuelo en ese momento tambien se factura.
// El margen real con Storage NO esta medido: el contador cuenta lo recibido,
// pero el proveedor puede facturar algo mas de lo que el contador ve.
const ATADAS = new WeakMap()
export class ErrorTope extends Error {
  constructor(motivo) { super(motivo); this.name = 'ErrorTope'; this.tope = true }
}
export function atarDescarga(senal, { max, etag = null }) {
  const ficha = { max, etag, recibidos: 0, corte: null }
  ATADAS.set(senal, ficha)
  return ficha
}
export const sinComillas = s => String(s ?? '').replace(/^W\//, '').replace(/"/g, '')
// lo que se mira de una respuesta atada antes de leer su cuerpo → motivo de corte | null
function observa(ficha, { status, etag, largo }) {
  const ok = status >= 200 && status < 300
  ficha.vista = true
  ficha.estadoHttp = status
  ficha.etagRecibida = etag ?? null
  const http = ok ? '' : `respuesta HTTP ${status}: `
  if (ok && ficha.etag && etag && sinComillas(etag) !== sinComillas(ficha.etag)) return `identidad cambiada: etag ${sinComillas(etag)} y no ${sinComillas(ficha.etag)} (el de info())`
  if (ok && ficha.etag && !etag) ficha.sinEtag = true
  if (largo != null && Number(largo) > ficha.max) return `${http}tope de descarga: Content-Length ${largo} > ${ficha.max} autorizados`
  return null
}
// Para los DOBLES de Storage de las pruebas (que no pasan por fetch): apunta en
// la ficha de una descarga atada lo que habria visto fetchConTope (estado,
// etag, bytes recibidos) con las mismas reglas. En produccion lo hace fetchConTope.
export function apuntaRespuesta(senal, { status = 200, etag = null, bytes = 0 }) {
  const ficha = senal ? ATADAS.get(senal) : null
  if (!ficha) return
  const corte = observa(ficha, { status, etag, largo: null })
  ficha.recibidos = bytes
  if (corte) ficha.corte = corte
  else if (bytes > ficha.max) ficha.corte = `${status >= 200 && status < 300 ? '' : `respuesta HTTP ${status}: `}tope de descarga: recibidos ${bytes} > ${ficha.max} autorizados`
}
export function fetchConTope(base) {
  const f = async (url, init = {}) => {
    const ficha = init?.signal ? ATADAS.get(init.signal) : null
    const res = await base(url, init)
    if (!ficha) return res
    const motivo = observa(ficha, { status: res.status, etag: res.headers.get('etag'), largo: res.headers.get('content-length') })
    if (!res.body) return res
    const http = res.ok ? '' : `respuesta HTTP ${res.status}: `
    const corta = m => { ficha.corte = m; res.body.cancel().catch(() => {}); throw new ErrorTope(m) }
    if (motivo) corta(motivo)
    const lector = res.body.getReader()
    const cuerpo = new ReadableStream({
      async pull(c) {
        const { done, value } = await lector.read()
        if (done) return c.close()
        ficha.recibidos += value.byteLength
        if (ficha.recibidos > ficha.max) {
          ficha.corte = `${http}tope de descarga: recibidos ${ficha.recibidos} > ${ficha.max} autorizados`
          lector.cancel().catch(() => {})
          return c.error(new ErrorTope(ficha.corte))
        }
        c.enqueue(value)
      },
      cancel(r) { return lector.cancel(r) },
    }, { highWaterMark: 0 })
    return new Response(cuerpo, { status: res.status, statusText: res.statusText, headers: res.headers })
  }
  if (base.conLimite) f.conLimite = base.conLimite
  return f
}
