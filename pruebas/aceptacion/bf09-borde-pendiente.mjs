/**
 * BF09 · EL ULTIMO DIA GUARDADO INCOMPLETO ES BARRERA DE LA COLA
 * (Astra M-01, 7-oct-2026, sobre d5297e7)
 *
 * El fallo del dia IGUAL a la ultima guardada no cortaba la cola (enCola era
 * d > ultimaGuardada): con el domingo 1-feb guardado con 30 velas (22:00–22:29)
 * y el proveedor sin datos para el, se pedia y publicaba el lunes 2-feb y el
 * domingo quedaba como hueco INTERIOR. Decision del CTO: el ultimo dia guardado,
 * si sigue incompleto tras combinar lo guardado y lo descargado, es barrera: no
 * se pide ni se publica nada posterior. La misma regla en el calculo previo y
 * bajo el cerrojo.
 *
 * ORACULOS, a mano:
 *   A (Astra): guardado hasta el viernes 30-ene y el domingo 1-feb con 30;
 *     hoy 3-feb; 1-feb da 404, 2-feb 1.440 → el 2-feb ni se pide ni se
 *     publica; el fichero sigue acabando el 1-feb con 30.
 *   A' el mismo borde, pero el proveedor ya tiene el 1-feb entero → se publican
 *     el 1-feb (120) y el 2-feb (la barrera se levanta al completarse).
 *   R (AUDUSD, el caso real): guardado hasta el viernes 25-sep y el domingo
 *     27-sep con 30; hoy 2-oct; 27-sep sin datos, 28-sep a 1-oct disponibles →
 *     nada posterior al 27-sep se pide ni se publica. En seco (calculo previo)
 *     tampoco se anuncia nada posterior.
 *   C (bajo el cerrojo): guardado hasta el lunes 2-feb completo; hoy 4-feb;
 *     mientras se descarga el 3-feb, otro escritor deja el 2-feb en 30 velas →
 *     bajo el cerrojo el 2-feb es el ultimo y esta incompleto: no se publica el
 *     3-feb detras.
 */
import { titulo, oraculo, fin, escenario, proveedor, guardado, db } from '../lib.mjs'
import { diaM1 } from '../proveedor-falso.mjs'
import { correScript, ejecucionesScripts } from '../script-falso.mjs'
const DIA = 86400000
const ENV = { NEXT_PUBLIC_SUPABASE_URL: 'https://falso.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'falsa' }
const velasDe = (dia, n = 1440, desde = 0) => diaM1(dia, 1440).slice(desde, desde + n).map(c => ({ time: c.timestamp / 1000, open: c.open, high: c.high, low: c.low, close: c.close, volume: 1 }))
// del 1-ene del año a `hasta`, con dias reales (1-ene y domingos de 22:00 a 23:59); `ultimo`: { dia, n } un ultimo dia con n velas desde las 22:00
const historial = (anio, hasta, ultimo = null) => {
  const v = [...velasDe(`${anio}-01-01`, 120, 22 * 60)]
  for (let t = Date.parse(`${anio}-01-02T00:00:00Z`); t <= Date.parse(hasta + 'T00:00:00Z'); t += DIA) { const w = new Date(t).getUTCDay(), d = new Date(t).toISOString().slice(0, 10); if (w >= 1 && w <= 5) v.push(...velasDe(d)); else if (w === 0) v.push(...velasDe(d, 120, 22 * 60)) }
  if (ultimo) v.push(...velasDe(ultimo.dia, ultimo.n, 22 * 60))
  return v
}
const filas = (dia, n) => JSON.stringify(diaM1(dia, 1440).slice(new Date(dia + 'T00:00:00Z').getUTCDay() === 0 ? 22 * 60 : 0).slice(0, n ?? 1440))
const en = (arr, d) => (arr || []).filter(v => new Date(v.time * 1000).toISOString().startsWith(d)).length
const ultimoDia = arr => arr?.length ? new Date(arr.at(-1).time * 1000).toISOString().slice(0, 10) : ''
const pedidos = par => proveedor.llamadas.filter(l => l.instrumento === par).map(l => l.desde.slice(0, 10))
const corre = (ahora, par, extra = []) => correScript('scripts/actualizar-diario.js', { ahora, argv: [...extra, '--pares', par], env: ENV })

titulo('A · el caso de Astra: domingo 1-feb guardado con 30 velas')
escenario({ storage: { 'forex-data': { 'AUDUSD/M1/2026.json': JSON.stringify(historial(2026, '2026-01-30', { dia: '2026-02-01', n: 30 })) } } })
proveedor.http = (url, n, { dia }) => dia === '2026-02-01' ? { status: 404, body: '' } : { status: 200, body: filas(dia) }
await corre('2026-02-03T06:00:00Z', 'AUDUSD', ['--subir'])
const gA = guardado('AUDUSD/M1/2026').velas
oraculo('BF09', 'el lunes 2-feb ni se pide ni se publica; el fichero sigue acabando el 1-feb con 30', !pedidos('audusd').includes('2026-02-02') && en(gA, '2026-02-02') === 0 && ultimoDia(gA) === '2026-02-01' && en(gA, '2026-02-01') === 30, `pedidos ${pedidos('audusd').join(' ')} · 2-feb ${en(gA, '2026-02-02')} · ultimo ${ultimoDia(gA)} (${en(gA, ultimoDia(gA))})`)

titulo("A' · el mismo borde, y el proveedor ya tiene el domingo entero")
escenario({ storage: { 'forex-data': { 'AUDUSD/M1/2026.json': JSON.stringify(historial(2026, '2026-01-30', { dia: '2026-02-01', n: 30 })) } } })
proveedor.http = (url, n, { dia }) => ({ status: 200, body: filas(dia) })
await corre('2026-02-03T06:00:00Z', 'AUDUSD', ['--subir'])
const gA2 = guardado('AUDUSD/M1/2026').velas
oraculo('BF09', 'completado el borde (120), la barrera se levanta: se publican el 1-feb y el 2-feb', en(gA2, '2026-02-01') === 120 && en(gA2, '2026-02-02') === 1440, `1-feb ${en(gA2, '2026-02-01')} · 2-feb ${en(gA2, '2026-02-02')}`)

titulo('R · el caso real de AUDUSD: domingo 27-sep cortado detras del viernes 25-sep')
const realAud = () => escenario({ storage: { 'forex-data': { 'AUDUSD/M1/2026.json': JSON.stringify(historial(2026, '2026-09-25', { dia: '2026-09-27', n: 30 })) } } })
realAud()
proveedor.http = (url, n, { dia }) => dia === '2026-09-27' ? { status: 404, body: '' } : { status: 200, body: filas(dia) }
const rR = await corre('2026-10-02T06:00:00Z', 'AUDUSD', ['--subir'])
const gR = guardado('AUDUSD/M1/2026').velas
const despues = pedidos('audusd').filter(d => d > '2026-09-27')
oraculo('BF09', 'nada posterior al 27-sep se pide ni se publica', despues.length === 0 && ultimoDia(gR) === '2026-09-27' && en(gR, '2026-09-28') === 0, `pedidos despues: ${despues.join(' ') || 'ninguno'} · ultimo ${ultimoDia(gR)} · ${rR.salida.find(l => l.includes('AUDUSD/M1')) ?? ''}`)
realAud()
// escenario() limpia el doble: se vuelve a programar
proveedor.http = (url, n, { dia }) => dia === '2026-09-27' ? { status: 404, body: '' } : { status: 200, body: filas(dia) }
const rS = await corre('2026-10-02T06:00:00Z', 'AUDUSD')
const seco = rS.salida.find(l => /\[SECO\]|AUDUSD\/M1/.test(l)) ?? ''
oraculo('BF09', 'en seco (el calculo previo) tampoco: no anuncia publicar nada posterior al 27-sep', !/sin descargar/.test(seco) && !/ultima 2026-(09-(2[89]|30)|10-)/.test(seco) && !pedidos('audusd').some(d => d > '2026-09-27'), seco)

titulo('C · bajo el cerrojo: otro escritor deja el ultimo dia incompleto mientras descargamos')
escenario({ storage: { 'forex-data': { 'AUDUSD/M1/2026.json': JSON.stringify(historial(2026, '2026-02-02')) } } })
let recortado = false
proveedor.http = (url, n, { dia }) => {
  if (dia === '2026-02-03' && !recortado) {
    recortado = true
    const v = JSON.parse(db.storage['forex-data']['AUDUSD/M1/2026.json'])
    const corte = Date.parse('2026-02-02T00:30:00Z') / 1000
    db.storage['forex-data']['AUDUSD/M1/2026.json'] = JSON.stringify(v.filter(x => x.time < corte))   // el 2-feb queda con 30
  }
  return { status: 200, body: filas(dia) }
}
await corre('2026-02-04T06:00:00Z', 'AUDUSD', ['--subir'])
const gC = guardado('AUDUSD/M1/2026').velas
oraculo('BF09', 'bajo el cerrojo el 2-feb (30) es barrera: el 3-feb no se publica detras', recortado && en(gC, '2026-02-03') === 0 && ultimoDia(gC) === '2026-02-02', `recortado ${recortado} · 2-feb ${en(gC, '2026-02-02')} · 3-feb ${en(gC, '2026-02-03')} · ultimo ${ultimoDia(gC)}`)
proveedor.http = null
oraculo('BF09', 'ningun script por timeout', ejecucionesScripts.every(e => e.terminoPor !== 'timeout'))
fin()
