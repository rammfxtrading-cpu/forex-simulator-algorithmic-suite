/**
 * CX01 · UNA SOLA CONEXION POR JOB HACIA EL PROVEEDOR, CON USER-AGENT PROPIO
 * (CTO, 7-oct-2026, tras los 429 desde casa y desde Actions)
 *
 * Decision del CTO: un unico agente HTTP keep-alive por job para todas las
 * peticiones al proveedor, un User-Agent propio e identificable del proyecto y
 * la pausa entre dias que ya existe. lib/mercado/conexion.mjs:
 * creaFetchProveedor() → un fetch minimo (el contrato que usa descarga.mjs:
 * status, headers.get/entries, arrayBuffer, signal) sobre node:http(s) con un
 * Agent keepAlive de UNA conexion; lee siempre el cuerpo entero (tambien de un
 * 429) para que la conexion quede libre; Accept-Encoding: identity.
 *
 * Se ejecuta contra un servidor HTTP LOCAL en un socket Unix (el aislamiento de
 * la tanda corta toda la red TCP, tambien 127.0.0.1) que cuenta conexiones;
 * ninguna peticion sale del equipo. El fetch se crea con socketPath. El servidor guarda las conexiones
 * inactivas 60 s; entre peticiones se espera 4,5 s (como la pausa entre dias).
 *
 * ORACULOS:
 *   tres peticiones (200, 429 sin leer el cuerpo desde fuera, 200), con 4,5 s
 *   entre ellas, por la funcion de descarga real (pideUrl): UNA conexion;
 *   cada peticion lleva el User-Agent del proyecto y Accept-Encoding identity;
 *   la señal de cancelacion corta una peticion colgada;
 *   los dos scripts (actualizador y sonda) crean el fetch del proveedor UNA
 *   vez por job y lo cierran al terminar.
 */
import { titulo, ver, oraculo, fin, importa, fuente } from '../lib.mjs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'

let C = null
try { C = await importa('lib/mercado/conexion.mjs') } catch { C = null }
const D = await importa('lib/mercado/descarga.mjs').catch(() => null)
const espera = ms => new Promise(r => setTimeout(r, ms))

// servidor local: /ok → 200 con 3 bytes; /limite → 429; /cuelga → no responde
let conexiones = 0
const vistas = []
const srv = http.createServer((q, r) => {
  vistas.push({ ua: q.headers['user-agent'], ae: q.headers['accept-encoding'], url: q.url })
  if (q.url === '/cuelga') return
  if (q.url === '/limite') { r.writeHead(429, { 'Content-Type': 'text/plain' }); return r.end('demasiadas peticiones') }
  r.writeHead(200, { 'Content-Type': 'application/octet-stream' }); r.end(Buffer.from([1, 2, 3]))
})
srv.keepAliveTimeout = 60000
srv.on('connection', () => { conexiones++ })
const SOCKET = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cx01-')), 'srv.sock')
await new Promise(r => srv.listen(SOCKET, r))
const BASE = 'http://proveedor.local'

titulo('1 · un job: tres peticiones con pausas, por la funcion de descarga real')
const f = C?.creaFetchProveedor ? C.creaFetchProveedor({ socketPath: SOCKET }) : null
const resultados = []
if (f && D) {
  for (const ruta of ['/ok', '/limite', '/ok']) {
    try { const r = await D.pideUrl(BASE + ruta, { fetch: f, espera: async () => {}, etiqueta: 'X', intentos: 1, limite: Infinity }); resultados.push(r.tipo) } catch (e) { resultados.push(e?.tipo ?? e?.name) }
    await espera(4500)
  }
}
ver('control: las tres peticiones llegaron (ok, limite, ok)', !f || JSON.stringify(resultados) === '["ok","limite","ok"]', JSON.stringify(resultados))
oraculo('CX01', 'las tres peticiones del job comparten UNA conexion, con 4,5 s de pausa entre ellas', !!f && conexiones === 1, `${conexiones} conexion(es)`)
oraculo('CX01', 'cada peticion lleva el User-Agent del proyecto y Accept-Encoding: identity', !!f && vistas.length === 3 && vistas.every(v => v.ua === C.USER_AGENT && /AlgorithmicSuite/.test(v.ua) && v.ae === 'identity'), JSON.stringify(vistas.map(v => [v.ua, v.ae])))

titulo('2 · cancelacion')
let h = null
if (f) {
  const ctl = new AbortController()
  const p = f(BASE + '/cuelga', { signal: ctl.signal }).then(() => 'respondio', e => e?.name ?? 'error')
  await espera(200); ctl.abort()
  h = await Promise.race([p, espera(2000).then(() => 'sigue colgada')])
}
oraculo('CX01', 'la señal de cancelacion corta una peticion colgada', h === 'AbortError', String(h))
f?.cierra?.()
// control del contador: otro job (otro fetch) abre OTRA conexion
if (C?.creaFetchProveedor) { const g = C.creaFetchProveedor({ socketPath: SOCKET }); const antes = conexiones; await (await g(BASE + '/ok')).arrayBuffer(); ver('control: otro job abre otra conexion (el contador distingue)', conexiones === antes + 1, `${conexiones - antes}`); g.cierra() }

titulo('3 · los scripts: un fetch del proveedor por job, cerrado al terminar')
for (const s of ['scripts/actualizar-diario.js', 'scripts/sonda-proveedor.js']) {
  let t = ''
  try { t = fuente(s) } catch { t = '' }   // en el codigo auditado la sonda no existe: rojo, no fallo
  oraculo('CX01', `${s}: crea el fetch del proveedor una vez y lo cierra al terminar`, (t.match(/fetchDelJob\(\)/g) || []).length === 1 && /cierra\?\.\(\)/.test(t) && !/bajaDia\(\{[^}]*globalThis\.fetch/.test(t) && !/fetchConCabeceras[^\n]*globalThis\.fetch/.test(t), '')
}

srv.closeAllConnections?.(); srv.close()
fin()
