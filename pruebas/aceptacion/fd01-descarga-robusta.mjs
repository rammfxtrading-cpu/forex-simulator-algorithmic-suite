/**
 * FD01 · DESCARGA ROBUSTA DEL ACTUALIZADOR (bloque F; CTO 5-oct-2026)
 *
 * Log del 5-oct (run 37320885421): 8 de 9 pares con fallo de descarga
 * («Unknown error», «fetch failed»); AUDUSD descolgado desde el 25-sep. El
 * actualizador era de TODO O NADA por par: un dia que fallaba tras sus
 * reintentos tiraba el par entero, y cada fallo alargaba lo pendiente.
 *
 * Un punto por seccion (un commit por punto):
 *   1. fallo aislado por dia: el par publica lo contiguo que tenga y corta en
 *      el primer dia que falte; nunca deja un hueco interior nuevo
 *   (2–6, en sus commits)
 *
 * Escala pequeña del caso AUDUSD: guardado hasta el viernes 23-ene-2026; hoy,
 * lunes 2-feb 06:00 UTC; pendientes del 24-ene al 1-feb.
 * Proveedor y Storage FALSOS; script REAL; sin red.
 */
import { titulo, ver, oraculo, fin, escenario, proveedor, db, guardado } from '../lib.mjs'
import { diaM1 } from '../proveedor-falso.mjs'
import { correScript, ejecucionesScripts } from '../script-falso.mjs'
const DIA = 86400000
const ENV = { NEXT_PUBLIC_SUPABASE_URL: 'https://falso.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'falsa' }
const AHORA = '2026-02-02T06:00:00Z'
const velasDe = (dia, n = 1440) => diaM1(dia, n).map(c => ({ time: c.timestamp / 1000, open: c.open, high: c.high, low: c.low, close: c.close, volume: 1 }))
const laborables = (desde, hasta) => { const d = []; for (let t = Date.parse(desde + 'T00:00:00Z'); t <= Date.parse(hasta + 'T00:00:00Z'); t += DIA) { const w = new Date(t).getUTCDay(); if (w >= 1 && w <= 5) d.push(new Date(t).toISOString().slice(0, 10)) } return d }
const enDia = (arr, dia) => (arr || []).filter(v => new Date(v.time * 1000).toISOString().startsWith(dia)).length
const historial = (hasta, corto = null) => laborables('2026-01-02', hasta).flatMap(d => velasDe(d, d === corto ? 900 : 1440))
const diaDe = a => a.dates.from.toISOString().slice(0, 10)
const RED = () => { throw new TypeError('fetch failed') }
const linea = (r, par) => r.salida.find(l => l.includes(`${par}/M1`)) ?? ''
const corre = () => correScript('scripts/actualizar-diario.js', { ahora: AHORA, argv: ['--subir'], env: ENV })

titulo('1 · un dia de la cola falla (red): se publica lo contiguo y se corta ahi')
escenario({ storage: { 'forex-data': { 'AUDUSD/M1/2026.json': JSON.stringify(historial('2026-01-23')) } } })
proveedor.responde = a => (a.instrument === 'audusd' && diaDe(a) === '2026-01-28') ? RED() : diaM1(diaDe(a))
const r1 = await corre()
const g1 = guardado('AUDUSD/M1/2026').velas
ver('control: el proveedor fallo el 28-ene de AUDUSD', proveedor.llamadas.some(l => l.instrumento === 'audusd' && l.desde.startsWith('2026-01-28')))
oraculo('FD01', 'AUDUSD avanza: publica el 26 y el 27-ene (contiguos)', enDia(g1, '2026-01-26') === 1440 && enDia(g1, '2026-01-27') === 1440, `26: ${enDia(g1, '2026-01-26')}, 27: ${enDia(g1, '2026-01-27')} · ${linea(r1, 'AUDUSD')}`)
oraculo('FD01', 'y corta en el 28: nada del 29 ni del 30 (ningun hueco interior nuevo)', enDia(g1, '2026-01-28') === 0 && enDia(g1, '2026-01-29') === 0 && enDia(g1, '2026-01-30') === 0)
oraculo('FD01', 'la linea del par dice que dia fallo', /2026-01-28/.test(linea(r1, 'AUDUSD')), linea(r1, 'AUDUSD'))

titulo('1b · falla un dia corto del INTERIOR: no frena la cola')
escenario({ storage: { 'forex-data': { 'AUDUSD/M1/2026.json': JSON.stringify(historial('2026-01-23', '2026-01-14')) } } })
proveedor.responde = a => (a.instrument === 'audusd' && diaDe(a) === '2026-01-14') ? RED() : diaM1(diaDe(a))
await corre()
const g2 = guardado('AUDUSD/M1/2026').velas
oraculo('FD01', 'se vuelve a pedir el 14-ene (corto, 900 velas)', proveedor.llamadas.some(l => l.instrumento === 'audusd' && l.desde.startsWith('2026-01-14')))
oraculo('FD01', 'la cola se publica entera (26 al 30-ene) y el 14-ene se queda como estaba (900)', laborables('2026-01-26', '2026-01-30').every(d => enDia(g2, d) === 1440) && enDia(g2, '2026-01-14') === 900, laborables('2026-01-26', '2026-01-30').map(d => enDia(g2, d)).join(',') + ` · 14: ${enDia(g2, '2026-01-14')}`)

titulo('1c · el proveedor no tiene datos de un dia laborable de la cola: no se salta')
escenario({ storage: { 'forex-data': { 'AUDUSD/M1/2026.json': JSON.stringify(historial('2026-01-23')) } } })
proveedor.responde = a => (a.instrument === 'audusd' && diaDe(a) === '2026-01-28') ? [] : diaM1(diaDe(a))
await corre()
const g3 = guardado('AUDUSD/M1/2026').velas
oraculo('FD01', 'sin datos el 28: se publica hasta el 27 y nada despues', enDia(g3, '2026-01-27') === 1440 && enDia(g3, '2026-01-29') === 0 && enDia(g3, '2026-01-30') === 0, `27: ${enDia(g3, '2026-01-27')}, 29: ${enDia(g3, '2026-01-29')}`)

titulo('2 · los dias pendientes, del mas antiguo al mas reciente (con los cortos del interior)')
escenario({ storage: { 'forex-data': { 'AUDUSD/M1/2026.json': JSON.stringify(historial('2026-01-23', '2026-01-14')) } } })
proveedor.responde = a => diaM1(diaDe(a))
await corre()
const orden = proveedor.llamadas.filter(l => l.instrumento === 'audusd').map(l => l.desde.slice(0, 10))
oraculo('FD01', 'AUDUSD pide en orden ascendente, empezando por el 14-ene (corto del interior)', orden.length > 1 && orden[0] === '2026-01-14' && orden.every((d, i) => i === 0 || d > orden[i - 1]), orden.join(' '))
escenario({ storage: { 'forex-data': { 'AUDUSD/M1/2026.json': JSON.stringify(historial('2026-01-23')) } } })
proveedor.responde = a => (a.instrument === 'audusd' && diaDe(a) === '2026-01-27') ? RED() : diaM1(diaDe(a))
await corre()
const tras = proveedor.llamadas.filter(l => l.instrumento === 'audusd' && l.desde.slice(0, 10) > '2026-01-27').length
oraculo('FD01', 'cortada la cola en el 27 (fallo), no se piden los dias de despues (no se publicarian)', tras === 0, `${tras} peticiones despues del 27`)

titulo('3 · no se piden dias de mercado cerrado; un vacio legitimo no es un fallo')
// Horario v2.1 (CTO): abre el domingo 17:00 y cierra el viernes 17:00 de Nueva
// York. El sabado UTC entero esta cerrado; el domingo UTC abre a las 22:00 (en
// invierno). Un domingo vacio (sin velas todavia) es legitimo.
escenario({ storage: { 'forex-data': { 'AUDUSD/M1/2026.json': JSON.stringify(historial('2026-01-23')) } } })
proveedor.vacioComoSDK = true          // el vacio, como lo trata la libreria real con retryOnEmpty
proveedor.responde = a => { const d = diaDe(a); return new Date(d + 'T00:00:00Z').getUTCDay() === 0 ? [] : diaM1(d) }
const r3 = await corre()
const pedidos3 = proveedor.llamadas.filter(l => l.instrumento === 'audusd').map(l => l.desde.slice(0, 10))
oraculo('FD01', 'no se piden los sabados (24 y 31-ene)', !pedidos3.includes('2026-01-24') && !pedidos3.includes('2026-01-31'), pedidos3.join(' '))
oraculo('FD01', 'un domingo vacio no es un fallo: nada «sin descargar» y la cola sigue hasta el viernes 30', !/sin descargar/.test(linea(r3, 'AUDUSD')) && enDia(guardado('AUDUSD/M1/2026').velas, '2026-01-30') === 1440, linea(r3, 'AUDUSD'))

titulo('4 · descarga propia: estado HTTP, bytes e intento en el log; esperas; tres clases de fallo')
const filas = d => JSON.stringify(diaM1(d))
escenario({ storage: { 'forex-data': { 'AUDUSD/M1/2026.json': JSON.stringify(historial('2026-01-23')) } } })
proveedor.responde = a => diaM1(diaDe(a))
proveedor.http = (url, n, { instrumento, dia }) => {
  if (instrumento !== 'audusd') return { status: 200, body: filas(dia) }
  if (dia === '2026-01-26') return n <= 2 ? { status: 503, body: '' } : { status: 200, body: filas(dia) }                        // servidor, se recupera
  if (dia === '2026-01-27') return n === 1 ? { status: 429, headers: { 'Retry-After': '7' }, body: '' } : { status: 200, body: filas(dia) }
  if (dia === '2026-01-28') { throw new TypeError('fetch failed') }                                                            // red, siempre
  return { status: 200, body: filas(dia) }
}
const r4 = await corre()
const log4 = r4.salida.filter(l => /AUDUSD 2026-01-2[678]/.test(l))
oraculo('FD01', 'el 26-ene: dos 503 y un 200, cada intento con estado, bytes y su numero', /AUDUSD 2026-01-26 · intento 1\/5 · HTTP 503 · 0 bytes · servidor · espera \d/.test(log4.join('\n')) && /AUDUSD 2026-01-26 · intento 3\/5 · HTTP 200 · \d+ bytes/.test(log4.join('\n')), log4.filter(l => l.includes('01-26')).join(' | '))
oraculo('FD01', 'el 27-ene: un 429 con Retry-After 7 → espera al menos 7 s', /AUDUSD 2026-01-27 · intento 1\/5 · HTTP 429 · 0 bytes · servidor · espera ([7-9]|\d\d)[,.]\d s/.test(log4.join('\n')), log4.filter(l => l.includes('01-27')).join(' | '))
oraculo('FD01', 'el 28-ene: red en los 5 intentos → «sin descargar: 2026-01-28 (red…)» y se corta ahi', log4.filter(l => /01-28 · intento \d\/5 · red/.test(l)).length === 5 && /sin descargar: 2026-01-28 \(red/.test(linea(r4, 'AUDUSD')) && enDia(guardado('AUDUSD/M1/2026').velas, '2026-01-27') === 1440, linea(r4, 'AUDUSD'))
oraculo('FD01', 'ninguna URL ni clave en el log', !r4.salida.some(l => /https?:|datafeed|\.bi5|falsa/.test(l)))
escenario({ storage: { 'forex-data': { 'AUDUSD/M1/2026.json': JSON.stringify(historial('2026-01-23')) } } })
proveedor.http = (url, n, { instrumento, dia }) => (instrumento === 'audusd' && dia === '2026-01-26') ? { status: 404, body: '' } : { status: 200, body: filas(dia) }
const r5 = await corre()
const l5 = r5.salida.filter(l => /AUDUSD 2026-01-26/.test(l))
oraculo('FD01', 'un 404 es «sin datos»: un solo intento, sin reintentar, y no cuenta como fallo de descarga', l5.length === 1 && /HTTP 404 · 0 bytes · sin datos/.test(l5[0]) && !/sin descargar/.test(linea(r5, 'AUDUSD')), l5.join(' | ') + ' · ' + linea(r5, 'AUDUSD'))
proveedor.http = null

titulo('5 · presupuesto de tiempo por par y por job')
escenario({ storage: { 'forex-data': { 'AUDUSD/M1/2026.json': JSON.stringify(historial('2026-01-23')) } } })
proveedor.http = (url, n, { instrumento, dia }) => (instrumento === 'audusd' && dia === '2026-01-26') ? { status: 503, body: '' } : { status: 200, body: filas(dia) }
const r6 = await correScript('scripts/actualizar-diario.js', { ahora: AHORA, argv: ['--subir'], env: { ...ENV, PRESUPUESTO_PAR_S: '1' } })
const l6 = r6.salida.filter(l => /AUDUSD 2026-01-26 · intento/.test(l))
oraculo('FD01', 'presupuesto por par de 1 s: el 503 no se reintenta mas alla del limite → «presupuesto»', l6.length === 1 && /sin descargar: 2026-01-26 \(presupuesto/.test(linea(r6, 'AUDUSD')), `${l6.length} intento(s) · ${linea(r6, 'AUDUSD')}`)
escenario({ storage: { 'forex-data': { 'AUDUSD/M1/2026.json': JSON.stringify(historial('2026-01-23')) } } })
proveedor.http = null; proveedor.llamadas.length = 0
const r7 = await correScript('scripts/actualizar-diario.js', { ahora: AHORA, argv: ['--subir'], env: { ...ENV, PRESUPUESTO_JOB_S: '0' } })
oraculo('FD01', 'presupuesto del job agotado: ningun par pide nada y cada uno dice «sin tiempo»', proveedor.llamadas.length === 0 && r7.salida.filter(l => /SIN TIEMPO/.test(l)).length === 9, `${proveedor.llamadas.length} peticiones · ${r7.salida.filter(l => /SIN TIEMPO/.test(l)).length} pares sin tiempo`)
ver('control (H06): ningun script por timeout', ejecucionesScripts.every(e => e.terminoPor !== 'timeout'))
fin()
