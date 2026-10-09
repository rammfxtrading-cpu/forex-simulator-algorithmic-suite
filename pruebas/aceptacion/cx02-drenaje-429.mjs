/**
 * CX02 · EL CUERPO DE UN 429 SE LEE ENTERO ANTES DE CERRAR LA CONEXION
 * (Astra CON-01, cierres-5 sobre 251d7e2)
 *
 * creaFetchProveedor resolvia al recibir las cabeceras; pideUrl lanzaba el
 * limite sin esperar el cuerpo del 429 y el cierre del job destruia el agente
 * con el cuerpo a medias. Decision del CTO: el cuerpo de un 429 se drena, con
 * tope de tiempo, antes de cerrar la conexion; el estado 429 se conserva
 * aunque el drenaje falle.
 *
 * Servidor HTTP LOCAL en un socket Unix (como CX01; ninguna peticion sale del
 * equipo). Un «job» = creaFetchProveedor + pideUrl (un intento) + cierra() en
 * cuanto pideUrl termina.
 *
 * ORACULOS:
 *   429 cuyo cuerpo llega en dos trozos, el ultimo 300 ms despues de las
 *   cabeceras: pideUrl da «limite» 429 DESPUES de recibir el ultimo trozo, y
 *   el servidor termina de enviarlo antes de que se cierre la conexion;
 *   429 cuyo cuerpo no termina nunca: «limite» 429 al vencer el tope (300 ms
 *   en la prueba), sin quedarse colgado;
 *   429 cuya conexion se rompe a mitad del cuerpo: «limite» 429 igual.
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

const visto = {}
const srv = http.createServer((q, r) => {
  const ruta = q.url
  const v = visto[ruta] = { finish: null, close: null }
  const t0 = performance.now()
  r.on('finish', () => { v.finish ??= performance.now() - t0 })
  q.socket.on('close', () => { v.close ??= performance.now() - t0 })
  r.writeHead(429, { 'Content-Type': 'text/plain' })
  r.write('demasiadas ')
  if (ruta === '/lento') setTimeout(() => { if (!r.destroyed) r.end('peticiones') }, 300)
  if (ruta === '/roto') setTimeout(() => q.socket.destroy(), 100)
  // '/eterno': el cuerpo no termina nunca
})
srv.keepAliveTimeout = 60000
const SOCKET = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cx02-')), 'srv.sock')
await new Promise(r => srv.listen(SOCKET, r))
const BASE = 'http://proveedor.local'

// un job: pide, y cierra la conexion en cuanto pideUrl termina
async function job(ruta) {
  if (!C?.creaFetchProveedor || !D) return { r: 'sin modulo', ms: 0 }
  const f = C.creaFetchProveedor({ socketPath: SOCKET })
  const t0 = performance.now()
  const r = await Promise.race([
    D.pideUrl(BASE + ruta, { fetch: f, espera: async () => {}, etiqueta: 'X', intentos: 1, drenajeMs: 300 }).then(() => 'ok', e => `${e?.tipo}${e?.estado ? ' ' + e.estado : ''}`),
    espera(5000).then(() => 'colgado'),
  ])
  const ms = performance.now() - t0
  f.cierra()
  await espera(400)
  return { r, ms }
}

titulo('1 · el cuerpo llega 300 ms despues de las cabeceras')
const a = await job('/lento')
ver('control: el servidor llego a escribir el ultimo trozo o vio cerrarse la conexion', a.r === 'sin modulo' || visto['/lento']?.finish != null || visto['/lento']?.close != null, JSON.stringify(visto['/lento']))
oraculo('CON-01', '«limite» 429, y pideUrl no termina antes de recibir el ultimo trozo (≥ 290 ms)', a.r === 'limite 429' && a.ms >= 290, `${a.r} · ${Math.round(a.ms)} ms`)
oraculo('CON-01', 'el servidor termina de enviar el cuerpo ANTES de que el job cierre la conexion', visto['/lento']?.finish != null && (visto['/lento'].close == null || visto['/lento'].finish <= visto['/lento'].close), JSON.stringify(visto['/lento']))

titulo('2 · el drenaje falla: el 429 se conserva')
const b = await job('/eterno')
oraculo('CON-01', 'cuerpo que no termina: «limite» 429 al vencer el tope, sin quedarse colgado (< 2 s)', b.r === 'limite 429' && b.ms >= 290 && b.ms < 2000, `${b.r} · ${Math.round(b.ms)} ms`)
const c = await job('/roto')
oraculo('CON-01', 'conexion rota a mitad del cuerpo: «limite» 429', c.r === 'limite 429', `${c.r} · ${Math.round(c.ms)} ms`)

srv.closeAllConnections?.(); srv.close()
fin()
