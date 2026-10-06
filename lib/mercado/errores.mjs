// lib/mercado/errores.mjs — como se escribe un error en el log y en los
// mensajes del mercado (bloque G, punto 8; Astra BF-02; CTO 6-oct-2026).
//
// Solo la CLASE y un CODIGO de una lista permitida; nunca message ni cause.
// El texto de una excepcion lo escribe quien la lanza (fetch, storage-js,
// JSON.parse, dukascopy-node) y puede llevar una URL, una clave o un trozo del
// contenido: recortarlo no es sanearlo. Un codigo que no esta en la lista sale
// como «otro».
//
// Los mensajes que escribimos nosotros (con datos controlados: fechas, rutas,
// numeros) se marcan con errorPropio() y pasan tal cual.

// Clases (name del error) que se pueden escribir
const CLASES = new Set(['Error', 'TypeError', 'RangeError', 'SyntaxError', 'AbortError', 'TimeoutError',
  'StorageError', 'StorageApiError', 'StorageUnknownError', 'ErrorDescarga'])
// Codigos de red de Node y de undici que se pueden escribir
export const CODIGOS = new Set(['ECONNRESET', 'ECONNREFUSED', 'ECONNABORTED', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN',
  'EPIPE', 'EHOSTUNREACH', 'ENETUNREACH', 'ENETDOWN', 'ABORT_ERR',
  'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT', 'UND_ERR_SOCKET',
  'UND_ERR_CLOSED', 'UND_ERR_ABORTED', 'UND_ERR_RESPONSE_STATUS_CODE'])

// El codigo de un error: de la lista (en e.cause.code o e.code), o el estado
// HTTP si es un numero de tres cifras (statusCode/status de storage-js), o «otro».
export function codigo(e) {
  for (const c of [e?.cause?.code, e?.code]) if (typeof c === 'string' && CODIGOS.has(c)) return c
  for (const s of [e?.statusCode, e?.status]) if (/^\d{3}$/.test(String(s ?? ''))) return `HTTP ${s}`
  return 'otro'
}
export const clase = e => (typeof e?.name === 'string' && CLASES.has(e.name) ? e.name : 'Error')

// Lo que se escribe: «clase codigo», o el mensaje si es propio
export function texto(e) {
  if (e?.propio === true) return String(e.message)
  return `${clase(e)} ${codigo(e)}`
}

// Un error con un mensaje NUESTRO (datos controlados): pasa tal cual
export function errorPropio(mensaje) {
  return Object.assign(new Error(mensaje), { propio: true })
}
