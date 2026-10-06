/**
 * BF02 · EN LOG Y ERRORES, SOLO CLASE Y UN CODIGO PERMITIDO
 * (Astra, cierres-3, añadido F; bloque G, punto 8; CTO 6-oct-2026)
 *
 * Astra: el fetch lanza un TypeError cuyo mensaje lleva una URL y un marcador
 * de clave; sin cause.code ni code, lib/mercado/descarga.mjs:53 tomaba el
 * message y lo copiaba (recortado a 60, que no es sanear) al log y al error.
 * Decision del CTO: en log y errores solo la clase y un codigo de una lista
 * permitida; nunca message ni cause.
 *
 * Se ejecuta: scripts/actualizar-diario.js y scripts/restore-2026.js REALES,
 * proveedor y Storage FALSOS, sin red. El marcador es inventado.
 *
 * ORACULOS: con el marcador y una URL dentro del error, ninguna linea de la
 * salida los contiene: (1) red sin codigo (el caso de Astra), en el log por
 * intento y en la linea del par; (2) un cause.code que no esta en la lista;
 * (3) un error de Storage al leer; (4) un fichero ilegible (el JSON.parse cita
 * el contenido); (5) restore-2026 con un error del proveedor.
 * (6) un codigo de la lista (ECONNRESET) si se ve, sin el mensaje.
 */
import { titulo, ver, oraculo, fin, escenario, proveedor, db } from '../lib.mjs'
import { diaM1 } from '../proveedor-falso.mjs'
import { correScript, ejecucionesScripts } from '../script-falso.mjs'
const DIA = 86400000
const ENV = { NEXT_PUBLIC_SUPABASE_URL: 'https://falso.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'falsa' }
const MARCA = 'SECRETO-FICTICIO-9f3a'
const URL_MALA = `https://datafeed.invalid/AUDUSD/2026/00/26/BID_candles_min_1.bi5?key=${MARCA}`
// el prefijo basta: un JSON.parse cita solo los 10 primeros caracteres
const filtra = r => r.salida.filter(l => l.includes('SECRETO') || l.includes('datafeed.invalid'))
const velasDe = (dia, n = 1440) => diaM1(dia, n).map(c => ({ time: c.timestamp / 1000, open: c.open, high: c.high, low: c.low, close: c.close, volume: 1 }))
const historial = hasta => { const v = []; for (let t = Date.parse('2026-01-02T00:00:00Z'); t <= Date.parse(hasta + 'T00:00:00Z'); t += DIA) { const w = new Date(t).getUTCDay(), d = new Date(t).toISOString().slice(0, 10); if (w >= 1 && w <= 5) v.push(...velasDe(d)); else if (w === 0) v.push(...velasDe(d).slice(22 * 60)) } return v }
const linea = (r, par) => r.salida.find(l => l.includes(`${par}/M1`)) ?? ''
const corre = () => correScript('scripts/actualizar-diario.js', { ahora: '2026-01-27T06:00:00Z', argv: ['--subir'], env: ENV })
const ok = dia => ({ status: 200, body: JSON.stringify(diaM1(dia)) })
const base = () => escenario({ storage: { 'forex-data': { 'AUDUSD/M1/2026.json': JSON.stringify(historial('2026-01-25')) } } })

titulo('1 · red sin codigo, con URL y clave en el mensaje (el caso de Astra)')
base()
proveedor.http = (url, n, { instrumento, dia }) => { if (instrumento === 'audusd' && dia === '2026-01-26') throw new TypeError(`fetch failed: ${URL_MALA}`); return ok(dia) }
const r1 = await corre()
const intentos1 = r1.salida.filter(l => /AUDUSD 2026-01-26 · intento/.test(l))
// la precondicion (se intento 5 veces y fallo por red) va DENTRO del oraculo:
// en el codigo viejo no hay descarga propia y un «no aparece» seria vacio
// 3 intentos por dia (CTO 6-oct)
const intentado1 = intentos1.length === 3 && /sin descargar: 2026-01-26 \(red/.test(linea(r1, 'AUDUSD'))
oraculo('BF02', 'tres intentos por red, y su log no lleva ni la URL ni el marcador', intentado1 && !intentos1.some(l => l.includes('SECRETO') || l.includes('datafeed.invalid')), intentos1[0])
oraculo('BF02', 'ninguna linea de la salida (tambien la del par y el veredicto) los lleva', intentado1 && filtra(r1).length === 0, filtra(r1).slice(0, 2).join(' | '))

titulo('2 · cause.code fuera de la lista')
base()
proveedor.http = (url, n, { instrumento, dia }) => { if (instrumento === 'audusd' && dia === '2026-01-26') throw Object.assign(new TypeError('fetch failed'), { cause: { code: MARCA, message: URL_MALA } }); return ok(dia) }
const r2 = await corre()
oraculo('BF02', 'un codigo que no esta en la lista no se imprime', filtra(r2).length === 0 && /sin descargar: 2026-01-26 \(red/.test(linea(r2, 'AUDUSD')), filtra(r2)[0] ?? linea(r2, 'AUDUSD'))
base()
proveedor.http = (url, n, { instrumento, dia }) => { if (instrumento === 'audusd' && dia === '2026-01-26') throw Object.assign(new TypeError(`fetch failed ${URL_MALA}`), { cause: { code: 'ECONNRESET' } }); return ok(dia) }
const r2b = await corre()
oraculo('BF02', 'un codigo de la lista (ECONNRESET) si se ve, sin el mensaje', /sin descargar: 2026-01-26 \(red: ECONNRESET\)/.test(linea(r2b, 'AUDUSD')) && filtra(r2b).length === 0, linea(r2b, 'AUDUSD'))

titulo('3 · error de Storage al leer, con el marcador en el mensaje')
base()
proveedor.http = (url, n, { dia }) => ok(dia)
db.falla = c => c.tabla === 'storage:forex-data' && c.op === 'download' && c.payload === 'AUDUSD/M1/2026.json' ? { message: `upstream ${URL_MALA}`, statusCode: '500' } : null
const r3 = await corre()
db.falla = null
ver('control: AUDUSD no se pudo leer', /no se pudo leer/.test(linea(r3, 'AUDUSD')), linea(r3, 'AUDUSD'))
oraculo('BF02', 'el error de Storage sale como clase y codigo, sin el mensaje', filtra(r3).length === 0, filtra(r3)[0])

titulo('4 · fichero ilegible: el error de JSON cita el contenido')
escenario({ storage: { 'forex-data': { 'AUDUSD/M1/2026.json': `${MARCA}{no es json` } } })
proveedor.http = (url, n, { dia }) => ok(dia)
const r4 = await corre()
oraculo('BF02', 'la linea dice que es ilegible sin citar el contenido', /ilegible/.test(linea(r4, 'AUDUSD')) && filtra(r4).length === 0, filtra(r4)[0] ?? linea(r4, 'AUDUSD'))

titulo('5 · restore-2026 con un error del proveedor')
escenario({})
proveedor.http = null
proveedor.responde = () => { throw new TypeError(`fetch failed: ${URL_MALA}`) }
const r5 = await correScript('scripts/restore-2026.js', { ahora: '2026-01-27T06:00:00Z', argv: [], env: ENV })
oraculo('BF02', 'restore falla por red y ni sus reintentos ni su fallo citan la URL o el marcador', r5.salida.some(l => /✗ AUDUSD/.test(l)) && filtra(r5).length === 0, filtra(r5)[0] ?? r5.salida.slice(-2).join(' | '))
proveedor.responde = null
ver('control (H06): ningun script por timeout', ejecucionesScripts.every(e => e.terminoPor !== 'timeout'))
fin()
