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
ver('control (H06): ningun script por timeout', ejecucionesScripts.every(e => e.terminoPor !== 'timeout'))
fin()
