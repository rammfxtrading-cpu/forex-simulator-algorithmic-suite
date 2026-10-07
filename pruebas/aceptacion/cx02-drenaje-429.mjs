/**
 * CX02 · EL CUERPO DE TODA RESPUESTA DISTINTA DE 200 SE LEE ENTERO ANTES DE
 * CERRAR LA CONEXION (Astra CON-01, cierres-5; matriz y tiempos: C6-09, cierres-6)
 *
 * creaFetchProveedor resolvia al recibir las cabeceras; pideUrl lanzaba el
 * limite sin esperar el cuerpo del 429 y el cierre del job destruia el agente
 * con el cuerpo a medias. Decision del CTO: el cuerpo de una respuesta que no
 * se usa (toda la distinta de 200) se drena, con tope de tiempo, antes de
 * cerrar la conexion; el estado se conserva aunque el drenaje falle.
 * C6-09: la matriz 201/302/400/404/429/503 (una regresion que drene solo los
 * 429 sale en rojo) y la demora del cuerpo y el plazo bien separados (sin
 * carrera del arnes en el mismo instante).
 *
 * Servidor HTTP LOCAL en un socket Unix (como CX01; ninguna peticion sale del
 * equipo). Un «job» = creaFetchProveedor + pideUrl (un intento) + cierra() en
 * cuanto pideUrl termina.
 *
 * ORACULOS, por cada estado de la matriz:
 *   cuerpo en dos trozos, el ultimo a los 150 ms (plazo de drenaje 2.000 ms):
 *   pideUrl no termina antes de los 150 ms, el servidor acaba de enviar el
 *   cuerpo antes de que se cierre la conexion, y el resultado es el del estado
 *   (404 → sin-datos; 429 → limite 429; el resto → servidor con su estado);
 *   cuerpo que no termina nunca (plazo 300 ms): el mismo resultado, entre
 *   300 ms y 1.500 ms, sin quedarse colgado.
 *   Ademas, 429 con la conexion rota a mitad del cuerpo: limite 429.
 */
import { titulo, ver, oraculo, fin, importa } from '../lib.mjs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'

let C = null
try { C = await importa('lib/mercado/conexion.mjs') } catch { C = null }
const D = await importa('lib/mercado/descarga.mjs').catch(() => null)
const espera = ms => new Promise(r => setTimeout(r, ms))
const CUERPO_MS = 150, PLAZO_LENTO_MS = 2000, PLAZO_ETERNO_MS = 300
const MATRIZ = [201, 302, 400, 404, 429, 503]
const esperado = st => (st === 404 ? 'sin-datos' : st === 429 ? 'limite 429' : `servidor ${st}`)

// /ESTADO/lento | /ESTADO/eterno | /429/roto
const visto = {}
const srv = http.createServer((q, r) => {
  const [, st, modo] = q.url.split('/')
  const v = visto[q.url] = { finish: null, close: null }
  const t0 = performance.now()
  r.on('finish', () => { v.finish ??= performance.now() - t0 })
  q.socket.on('close', () => { v.close ??= performance.now() - t0 })
  r.writeHead(Number(st), { 'Content-Type': 'text/plain', ...(st === '302' ? { Location: '/otra' } : {}) })
  r.write('primer trozo ')
  if (modo === 'lento') setTimeout(() => { if (!r.destroyed) r.end('ultimo trozo') }, CUERPO_MS)
  if (modo === 'roto') setTimeout(() => q.socket.destroy(), 100)
  // 'eterno': el cuerpo no termina nunca
})
srv.keepAliveTimeout = 60000
const SOCKET = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cx02-')), 'srv.sock')
await new Promise(r => srv.listen(SOCKET, r))
const BASE = 'http://proveedor.local'

// un job: pide, y cierra la conexion en cuanto pideUrl termina
async function job(ruta, drenajeMs) {
  if (!C?.creaFetchProveedor || !D) return { r: 'sin modulo', ms: 0 }
  const f = C.creaFetchProveedor({ socketPath: SOCKET })
  const t0 = performance.now()
  const r = await Promise.race([
    D.pideUrl(BASE + ruta, { fetch: f, espera: async () => {}, etiqueta: 'X', intentos: 1, drenajeMs }).then(x => x.tipo, e => `${e?.tipo}${e?.estado ? ' ' + e.estado : ''}`),
    espera(5000).then(() => 'colgado'),
  ])
  const ms = performance.now() - t0
  f.cierra()
  await espera(300)
  return { r, ms }
}

titulo(`1 · cuerpo lento (ultimo trozo a los ${CUERPO_MS} ms, plazo ${PLAZO_LENTO_MS} ms)`)
for (const st of MATRIZ) {
  const ruta = `/${st}/lento`
  const a = await job(ruta, PLAZO_LENTO_MS)
  const s = visto[ruta]
  ver(`control ${st}: el servidor recibio la peticion`, a.r === 'sin modulo' || !!s, JSON.stringify(s))
  oraculo('CON-01', `${st}: «${esperado(st)}», y pideUrl espera al ultimo trozo (≥ ${CUERPO_MS - 10} ms) sin agotar el plazo (< ${PLAZO_LENTO_MS - 500} ms)`, a.r === esperado(st) && a.ms >= CUERPO_MS - 10 && a.ms < PLAZO_LENTO_MS - 500, `${a.r} · ${Math.round(a.ms)} ms`)
  oraculo('CON-01', `${st}: el servidor termina de enviar el cuerpo ANTES de que el job cierre la conexion`, s?.finish != null && (s.close == null || s.finish <= s.close), JSON.stringify(s))
}

titulo(`2 · cuerpo que no termina (plazo ${PLAZO_ETERNO_MS} ms): el estado se conserva`)
for (const st of MATRIZ) {
  const b = await job(`/${st}/eterno`, PLAZO_ETERNO_MS)
  oraculo('CON-01', `${st}: «${esperado(st)}» al vencer el plazo (${PLAZO_ETERNO_MS}–1.500 ms), sin quedarse colgado`, b.r === esperado(st) && b.ms >= PLAZO_ETERNO_MS - 10 && b.ms < 1500, `${b.r} · ${Math.round(b.ms)} ms`)
}
const c = await job('/429/roto', PLAZO_LENTO_MS)
oraculo('CON-01', '429 con la conexion rota a mitad del cuerpo: «limite 429»', c.r === 'limite 429', `${c.r} · ${Math.round(c.ms)} ms`)

srv.closeAllConnections?.(); srv.close()
fin()
