/**
 * BF01 · UN DIA CON MERCADO Y SIN DATOS NO ES UN DIA COMPLETO
 * (Astra, cierres-3, añadido F; bloque G, punto 7; CTO 6-oct-2026)
 *
 * Astra: un 404 (o un 200 vacio) del domingo 1-feb se convertia en [] y
 * `completo` daba por completo cualquier domingo, tambien con cero velas: se
 * publicaba el lunes 2-feb detras de un domingo vacio. En la pasada siguiente
 * el domingo ya era INTERIOR y solo se volvian a pedir los laborables cortos:
 * se quedaba en 0 para siempre. Igual un domingo cortado.
 * Decision del CTO: un dia con mercado previsto y respuesta vacia queda
 * PENDIENTE y corta la cola; nunca cuenta como completo. Los domingos
 * interiores con menos datos que los disponibles se vuelven a pedir.
 *
 * Criterio de «domingo completo» (medido el 6-oct en la copia local del bucket,
 * los 27 ficheros: los 1.286 domingos interiores acaban a las 23:59 UTC, con 97
 * a 180 velas): tiene velas en su ultima hora (23:00–23:59 UTC). Vacio o
 * cortado antes, esta pendiente. Con los datos reales no añade peticiones.
 *
 * Fixture realista: laborables de 1.440 velas y domingos de 120 (22:00–23:59).
 * Proveedor y Storage FALSOS; script REAL; sin red.
 *
 * ORACULOS, a mano:
 *   A (Astra): guardado hasta el viernes 30-ene, hoy martes 3-feb; el domingo
 *     1-feb da 404 y el lunes 2-feb tiene 1.440. → el lunes NO se publica ni
 *     se pide; la linea del par nombra el 1-feb como pendiente. Pasada
 *     siguiente con el domingo ya disponible (120): domingo y lunes publicados.
 *   B: un domingo interior guardado con 0 velas (lo que dejaba el codigo
 *     anterior) se vuelve a pedir y se repara.
 *   C: un domingo interior cortado a las 22:29 (30 velas) se vuelve a pedir y
 *     se sustituye por el completo.
 *   Control: sin nada pendiente no se pide nada (los domingos completos no se
 *   repiden). Que los sabados no se piden lo mide fd01 §3.
 */
import { titulo, ver, oraculo, fin, escenario, proveedor, guardado } from '../lib.mjs'
import { diaM1 } from '../proveedor-falso.mjs'
import { correScript, ejecucionesScripts } from '../script-falso.mjs'
const DIA = 86400000
const ENV = { NEXT_PUBLIC_SUPABASE_URL: 'https://falso.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'falsa' }
const dias = (desde, hasta) => { const d = []; for (let t = Date.parse(desde + 'T00:00:00Z'); t <= Date.parse(hasta + 'T00:00:00Z'); t += DIA) d.push(new Date(t).toISOString().slice(0, 10)); return d }
const dow = d => new Date(d + 'T00:00:00Z').getUTCDay()
// filas del proveedor (ms): laborable entero; domingo desde las 22:00 (n velas)
const filasDia = (d, n) => dow(d) === 0 ? diaM1(d, 1440).slice(22 * 60, 22 * 60 + (n ?? 120)) : diaM1(d, n ?? 1440)
const aVelas = filas => filas.map(c => ({ time: c.timestamp / 1000, open: c.open, high: c.high, low: c.low, close: c.close, volume: 1 }))
// guardado: del 2-ene a `hasta`, sin sabados; `domingos` cambia el nº de velas de un domingo
const historial = (hasta, domingos = {}) => dias('2026-01-02', hasta).filter(d => dow(d) !== 6).flatMap(d => aVelas(filasDia(d, dow(d) === 0 ? (domingos[d] ?? 120) : 1440)))
const enDia = (arr, dia) => (arr || []).filter(v => new Date(v.time * 1000).toISOString().startsWith(dia)).length
const ultimoDia = arr => arr?.length ? new Date(arr.at(-1).time * 1000).toISOString().slice(0, 10) : ''
const linea = (r, par) => r.salida.find(l => l.includes(`${par}/M1`)) ?? ''
const pedidos = () => proveedor.llamadas.filter(l => l.instrumento === 'audusd').map(l => l.desde.slice(0, 10))
const corre = ahora => correScript('scripts/actualizar-diario.js', { ahora, argv: ['--subir'], env: ENV })
const cuerpo = filas => filas.length ? JSON.stringify(filas) : ''
// escenario() limpia el doble: se vuelve a programar despues de cada uno
const responde = () => { proveedor.http = (url, n, { dia }) => ({ status: 200, body: cuerpo(filasDia(dia)) }) }

titulo('A · el domingo 1-feb da 404 y el lunes 2-feb tiene datos (Astra)')
escenario({ storage: { 'forex-data': { 'AUDUSD/M1/2026.json': JSON.stringify(historial('2026-01-30')) } } })
ver('control del fixture: domingos de 120 velas hasta las 23:59 y sin sabados', enDia(guardado('AUDUSD/M1/2026').velas, '2026-01-25') === 120 && enDia(guardado('AUDUSD/M1/2026').velas, '2026-01-24') === 0)
let domingoDisponible = false
proveedor.http = (url, n, { instrumento, dia }) => {
  if (instrumento !== 'audusd') return { status: 200, body: cuerpo(filasDia(dia)) }
  if (dia === '2026-02-01' && !domingoDisponible) return { status: 404, body: '' }
  return { status: 200, body: cuerpo(filasDia(dia)) }
}
const rA = await corre('2026-02-03T06:00:00Z')
const gA = guardado('AUDUSD/M1/2026').velas
oraculo('BF01', 'el lunes 2-feb NO se publica detras de un domingo sin datos: el fichero sigue acabando el viernes 30', enDia(gA, '2026-02-02') === 0 && ultimoDia(gA) === '2026-01-30', `2-feb: ${enDia(gA, '2026-02-02')} · ultimo dia ${ultimoDia(gA)}`)
oraculo('BF01', 'cortada la cola en el domingo, el lunes ni se pide', pedidos().includes('2026-02-01') && !pedidos().includes('2026-02-02'), pedidos().join(' '))
oraculo('BF01', 'la linea del par nombra el 1-feb como pendiente (sin datos), no como hecho', /2026-02-01/.test(linea(rA, 'AUDUSD')) && /pendiente/i.test(linea(rA, 'AUDUSD')) && !/✓/.test(linea(rA, 'AUDUSD')), linea(rA, 'AUDUSD'))
domingoDisponible = true
proveedor.llamadas.length = 0
const rA2 = await corre('2026-02-03T07:00:00Z')
const gA2 = guardado('AUDUSD/M1/2026').velas
oraculo('BF01', 'pasada siguiente, con el domingo ya disponible: domingo (120) y lunes (1.440) publicados', enDia(gA2, '2026-02-01') === 120 && enDia(gA2, '2026-02-02') === 1440, `1-feb: ${enDia(gA2, '2026-02-01')} · 2-feb: ${enDia(gA2, '2026-02-02')} · ${linea(rA2, 'AUDUSD')}`)

titulo('B · domingo interior guardado con 0 velas (lo que dejaba el codigo anterior)')
escenario({ storage: { 'forex-data': { 'AUDUSD/M1/2026.json': JSON.stringify(historial('2026-02-02', { '2026-02-01': 0 })) } } })
proveedor.llamadas.length = 0
responde()
const rB = await corre('2026-02-03T06:00:00Z')
oraculo('BF01', 'el domingo 1-feb vacio se vuelve a pedir y se repara (0 → 120)', pedidos().includes('2026-02-01') && enDia(guardado('AUDUSD/M1/2026').velas, '2026-02-01') === 120, `pedidos: ${pedidos().join(' ')} · ${linea(rB, 'AUDUSD')}`)

titulo('C · domingo interior cortado a las 22:29 (30 velas)')
escenario({ storage: { 'forex-data': { 'AUDUSD/M1/2026.json': JSON.stringify(historial('2026-02-02', { '2026-01-25': 30 })) } } })
proveedor.llamadas.length = 0
responde()
const rC = await corre('2026-02-03T06:00:00Z')
oraculo('BF01', 'el domingo 25-ene cortado se vuelve a pedir y se sustituye por el completo (30 → 120)', pedidos().includes('2026-01-25') && enDia(guardado('AUDUSD/M1/2026').velas, '2026-01-25') === 120, `pedidos: ${pedidos().join(' ')} · ${linea(rC, 'AUDUSD')}`)

titulo('control · sin nada pendiente no se pide nada')
escenario({ storage: { 'forex-data': { 'AUDUSD/M1/2026.json': JSON.stringify(historial('2026-02-02')) } } })
proveedor.llamadas.length = 0
responde()
await corre('2026-02-03T06:00:00Z')
ver('control: con los domingos completos (hasta las 23:59) y la cola al dia, cero peticiones de AUDUSD', pedidos().length === 0, pedidos().join(' '))
proveedor.http = null
ver('control (H06): ningun script por timeout', ejecucionesScripts.every(e => e.terminoPor !== 'timeout'))
fin()
