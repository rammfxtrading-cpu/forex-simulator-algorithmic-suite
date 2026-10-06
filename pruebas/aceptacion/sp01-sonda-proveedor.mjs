/**
 * SP01 · SONDA DEL PROVEEDOR: QUE DIAS RESPONDE, SIN TOCAR EL BUCKET
 * (CTO, 6-oct-2026, tras la etapa 1 de la recuperacion)
 *
 * Etapa 1: 25 fallos UND_ERR_CONNECT_TIMEOUT al pedir el 20-jul y el 27-sep,
 * mientras el 2, 4 y 5-oct si respondian. Para saber si depende de la fecha,
 * del par, de la hora o es aleatorio, el CTO pide scripts/sonda-proveedor.js:
 * para una lista de par y dia, pide al proveedor SOLO ese dia con la MISMA
 * funcion de descarga (lib/mercado/descarga.mjs) y dice por cada uno:
 * disponible con cuantas velas, sin datos, o error con su clase y codigo. No
 * lee ni escribe Storage, no publica, no usa la clave de servicio. El log de
 * cada intento lleva el tiempo que tardo.
 *
 *   node scripts/sonda-proveedor.js AUDUSD:2026-09-27..2026-10-02 EURUSD:2026-07-20
 *
 * ORACULOS, a mano (proveedor falso):
 *   AUDUSD 28-sep con 1.440 → «disponible 1440 velas»; AUDUSD 27-sep 404 →
 *   «sin datos»; EURUSD 20-jul red con cause.code ECONNRESET → «error red
 *   ECONNRESET»; GBPUSD 20-jul 503 en los cinco intentos → «error servidor
 *   HTTP 503»; el rango 27-sep..30-sep pide cuatro dias.
 *   Ninguna operacion de Storage, ningun cliente de Supabase, ningun .env.
 *   Cada linea de intento lleva « · N ms».
 *   Entrada mal escrita → no pide nada y acaba con 4.
 */
import { titulo, oraculo, fin, escenario, proveedor, db, REPO } from '../lib.mjs'
import { diaM1 } from '../proveedor-falso.mjs'
import { correScript, ejecucionesScripts } from '../script-falso.mjs'
import { existsSync } from 'node:fs'

const hay = existsSync(REPO + 'scripts/sonda-proveedor.js')
const corre = argv => hay ? correScript('scripts/sonda-proveedor.js', { ahora: '2026-10-06T21:00:00Z', argv, env: {} }) : Promise.resolve({ salida: [], codigo: null, envLeidos: [] })
const fila = (r, par, dia) => r.salida.find(l => l.includes(par) && l.includes(dia) && !/intento/.test(l)) ?? ''

titulo('1 · cuatro casos')
escenario({})
proveedor.http = (url, n, { instrumento, dia }) => {
  if (instrumento === 'audusd' && dia === '2026-09-27') return { status: 404, body: '' }
  if (instrumento === 'eurusd') throw Object.assign(new TypeError('fetch failed https://x.invalid/?k=SECRETO'), { cause: { code: 'ECONNRESET' } })
  if (instrumento === 'gbpusd') return { status: 503, body: '' }
  return { status: 200, body: JSON.stringify(diaM1(dia)) }
}
const r = await corre(['AUDUSD:2026-09-27..2026-09-30', 'EURUSD:2026-07-20', 'GBPUSD:2026-07-20'])
oraculo('SP01', 'AUDUSD 28-sep: disponible con 1440 velas', /disponible\s+1440 velas/.test(fila(r, 'AUDUSD', '2026-09-28')), fila(r, 'AUDUSD', '2026-09-28') || r.salida.slice(-3).join(' | '))
oraculo('SP01', 'AUDUSD 27-sep (404): sin datos', /sin datos/.test(fila(r, 'AUDUSD', '2026-09-27')), fila(r, 'AUDUSD', '2026-09-27'))
oraculo('SP01', 'EURUSD 20-jul: error de red con su codigo (ECONNRESET), sin el mensaje', /error\s+red\s+ECONNRESET/.test(fila(r, 'EURUSD', '2026-07-20')) && !r.salida.some(l => /SECRETO|x\.invalid/.test(l)), fila(r, 'EURUSD', '2026-07-20'))
oraculo('SP01', 'GBPUSD 20-jul (503 sostenido): error de servidor HTTP 503', /error\s+servidor\s+HTTP 503/.test(fila(r, 'GBPUSD', '2026-07-20')), fila(r, 'GBPUSD', '2026-07-20'))
const audusd = [...new Set(proveedor.llamadas.filter(l => l.instrumento === 'audusd').map(l => l.desde.slice(0, 10)))]
oraculo('SP01', 'el rango 27-sep..30-sep pide esos cuatro dias y nada mas', JSON.stringify(audusd) === '["2026-09-27","2026-09-28","2026-09-29","2026-09-30"]', audusd.join(' '))
oraculo('SP01', 'no toca Storage, no crea cliente de Supabase ni lee .env', hay && db.log.filter(l => String(l.tabla).startsWith('storage')).length === 0 && db.clientes.length === 0 && r.envLeidos.length === 0, `${db.log.length} operaciones · ${db.clientes.length} clientes · ${r.envLeidos.length} .env`)
const intentos = r.salida.filter(l => /intento \d\/\d/.test(l))
oraculo('SP01', 'cada intento lleva su tiempo en el log (« · N ms»)', intentos.length > 0 && intentos.every(l => /· \d+ ms/.test(l)), intentos.slice(0, 2).join(' | '))

titulo('2 · entrada mal escrita')
escenario({}); proveedor.http = () => ({ status: 200, body: '[]' })
const r2 = await corre(['AUDUSD-2026-09-27'])
oraculo('SP01', 'no pide nada y acaba con 4', hay && proveedor.llamadas.length === 0 && r2.codigo === 4, `codigo ${r2.codigo} · ${proveedor.llamadas.length} llamadas`)
proveedor.http = null
oraculo('SP01', 'ningun script por timeout', hay && ejecucionesScripts.every(e => e.terminoPor !== 'timeout'))
fin()
