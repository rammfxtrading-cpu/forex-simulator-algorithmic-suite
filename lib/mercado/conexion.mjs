// lib/mercado/conexion.mjs — la conexion con el proveedor de velas (CTO,
// 7-oct-2026, tras los 429 desde casa y desde Actions).
//
// Un UNICO agente HTTP keep-alive por job para todas las peticiones al
// proveedor, con un User-Agent propio e identificable del proyecto. El fetch
// global de Node abriria y cerraria conexiones a su criterio; aqui:
//   · node:http(s) con un Agent keepAlive y UNA conexion (maxSockets 1): las
//     peticiones de un job van en serie por la misma conexion mientras el
//     servidor la mantenga;
//   · el cuerpo se lee SIEMPRE entero (tambien de un 404 o un 429): si no, la
//     conexion no queda libre para la siguiente;
//   · Accept-Encoding: identity (los .bi5 ya vienen comprimidos);
//   · la señal de cancelacion (BF-03) corta la peticion y su cuerpo.
// Devuelve un fetch minimo con el contrato que usa lib/mercado/descarga.mjs:
// status, ok, headers.get/entries, arrayBuffer(), descarta(señal). cierra()
// suelta el agente.
// Los scripts lo crean con fetchDelJob() al empezar y lo cierran al terminar.
import http from 'node:http'
import https from 'node:https'
import net from 'node:net'

export const USER_AGENT = 'AlgorithmicSuite-Simulador/1.0 (actualizador de velas; +https://simulator.algorithmicsuite.com)'

const abortado = () => Object.assign(new Error('This operation was aborted'), { name: 'AbortError', code: 'ABORT_ERR' })

// socketPath (opcional, para probar contra un servidor LOCAL en un socket Unix):
// el agente http conecta por ese socket; el agrupamiento keep-alive es el mismo.
class AgenteUnix extends http.Agent {
  constructor(ruta, o) { super(o); this.ruta = ruta }
  createConnection(o, cb) { return new net.Socket().connect(this.ruta, cb) }
}
export function creaFetchProveedor({ userAgent = USER_AGENT, socketPath = null } = {}) {
  const agentes = {
    'http:': socketPath ? new AgenteUnix(socketPath, { keepAlive: true, maxSockets: 1 }) : new http.Agent({ keepAlive: true, maxSockets: 1 }),
    'https:': new https.Agent({ keepAlive: true, maxSockets: 1 }),
  }
  const f = (url, { signal } = {}) => new Promise((ok, mal) => {
    const u = new URL(url)
    if (signal?.aborted) return mal(abortado())
    // ClientRequest con el agente del job (http o https: el agente hace el TLS)
    const req = new http.ClientRequest(u, { method: 'GET', agent: agentes[u.protocol], headers: { 'User-Agent': userAgent, Accept: '*/*', 'Accept-Encoding': 'identity' } }, res => {
      // el cuerpo, SIEMPRE entero: libera la conexion para la siguiente peticion
      const trozos = []
      const cuerpo = new Promise((fin, falla) => {
        res.on('data', c => trozos.push(c))
        res.on('end', () => fin(Buffer.concat(trozos)))
        res.on('error', falla)
        res.on('aborted', () => falla(abortado()))
      })
      cuerpo.catch(() => {})            // si nadie lo lee (404, 429...), que no quede un rechazo suelto
      // CON-01 (Astra, cierres-5): drenar un cuerpo que no se va a usar (429,
      // 404, 5xx) ANTES de que el job cierre la conexion, con tope: la señal.
      // → true si llego entero; false si fallo o vencio el tope (y entonces se
      // corta esa respuesta). Nunca lanza: el estado HTTP ya se conoce.
      const descarta = senal => new Promise(fin => {
        if (senal?.aborted) { res.destroy(); return fin(false) }
        const corta = () => { res.destroy(); fin(false) }
        senal?.addEventListener('abort', corta, { once: true })
        cuerpo.then(() => fin(true), () => fin(false)).finally(() => senal?.removeEventListener('abort', corta))
      })
      const cab = res.headers
      ok({
        status: res.statusCode,
        ok: res.statusCode >= 200 && res.statusCode < 300,
        headers: {
          get: k => { const v = cab[String(k).toLowerCase()]; return v == null ? null : String(v) },
          entries: () => Object.entries(cab).map(([k, v]) => [k, String(v)])[Symbol.iterator](),
        },
        arrayBuffer: async () => { const b = await cuerpo; return b.buffer.slice(b.byteOffset, b.byteOffset + b.length) },
        descarta,
      })
    })
    req.on('error', e => mal(signal?.aborted ? abortado() : e))
    signal?.addEventListener('abort', () => req.destroy(abortado()), { once: true })
    req.end()
  })
  f.cierra = () => { for (const a of Object.values(agentes)) a.destroy() }
  return f
}

// El fetch del proveedor para UN job. En las pruebas de los scripts, el arnes
// pone su doble en globalThis.__dobleProveedor (pruebas/script-falso.mjs).
export function fetchDelJob() {
  return globalThis.__dobleProveedor ?? creaFetchProveedor()
}
