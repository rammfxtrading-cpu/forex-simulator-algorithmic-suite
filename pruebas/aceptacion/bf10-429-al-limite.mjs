/**
 * BF10 · UN 429 QUE LLEGA AL VENCER EL PRESUPUESTO SIGUE CORTANDO TODO
 * (Astra M-02, 7-oct-2026, sobre d5297e7)
 *
 * lib/mercado/descarga.mjs comprobaba «termino despues del limite» ANTES de
 * mirar el estado: un 429 recibido justo al vencer el presupuesto del par se
 * convertia en «presupuesto», no se activaba el corte global, el job pedia y
 * publicaba otros pares y salia con 3. Decision del CTO: un 429 recibido se
 * conserva y activa el corte global aunque el presupuesto haya vencido; no se
 * piden mas dias ni mas pares; no se publica la descarga tardia. Prioridad de
 * codigos intacta (429 → 2; con una publicacion fallida → 1).
 *
 * ORACULOS, a mano (hoy 4-feb-2026; pares hasta el domingo 1-feb; presupuesto
 * por par 240 s; el reloj salta a 240,001 s al recibir el 429 del 2-feb de
 * AUDUSD):
 *   ni el 3-feb de AUDUSD ni GBPUSD se piden; nada nuevo de AUDUSD se publica;
 *   el log dice 429 y el corte; codigo 2.
 *   Con AUDCAD (antes) fallando al subir (403): codigo 1.
 *   Un 200 que llega tarde (sin 429) sigue descartandose como «presupuesto».
 */
import { titulo, oraculo, fin, escenario, proveedor, guardado, db, importa } from '../lib.mjs'
import { diaM1 } from '../proveedor-falso.mjs'
import { correScript, ejecucionesScripts } from '../script-falso.mjs'
const DIA = 86400000
const ENV = { NEXT_PUBLIC_SUPABASE_URL: 'https://falso.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'falsa', PRESUPUESTO_PAR_S: '240' }
const velasDe = (dia, n = 1440, desde = 0) => diaM1(dia, 1440).slice(desde, desde + n).map(c => ({ time: c.timestamp / 1000, open: c.open, high: c.high, low: c.low, close: c.close, volume: 1 }))
const historial = hasta => { const v = [...velasDe('2026-01-01', 120, 22 * 60)]; for (let t = Date.parse('2026-01-02T00:00:00Z'); t <= Date.parse(hasta + 'T00:00:00Z'); t += DIA) { const w = new Date(t).getUTCDay(), d = new Date(t).toISOString().slice(0, 10); if (w >= 1 && w <= 5) v.push(...velasDe(d)); else if (w === 0) v.push(...velasDe(d, 120, 22 * 60)) } return v }
const storage = pares => Object.fromEntries(pares.map(p => [`${p}/M1/2026.json`, JSON.stringify(historial('2026-02-01'))]))
const en = (arr, d) => (arr || []).filter(v => new Date(v.time * 1000).toISOString().startsWith(d)).length
const pedidas = () => proveedor.llamadas.map(l => `${l.instrumento.toUpperCase()} ${l.desde.slice(0, 10)}`)
const ok = dia => ({ status: 200, body: JSON.stringify(diaM1(dia)) })
const corre = (pares, reloj) => correScript('scripts/actualizar-diario.js', { ahora: '2026-02-04T06:00:00Z', argv: ['--subir', '--pares', pares], env: ENV, reloj })

titulo('1 · el 429 del 2-feb de AUDUSD llega cuando el presupuesto del par ya vencio')
escenario({ storage: { 'forex-data': storage(['AUDUSD', 'GBPUSD']) } })
let reloj = {}
proveedor.http = (url, n, { instrumento, dia }) => { if (instrumento === 'audusd' && dia === '2026-02-02') { reloj.ms += 240001; return { status: 429, body: '' } } return ok(dia) }
const r1 = await corre('AUDUSD,GBPUSD', reloj)
const p1 = pedidas()
oraculo('BF10', 'ni el 3-feb de AUDUSD ni GBPUSD se piden', !p1.includes('AUDUSD 2026-02-03') && !p1.some(x => x.startsWith('GBPUSD')), p1.join(' | '))
oraculo('BF10', 'no se publica nada nuevo de AUDUSD ni de GBPUSD', en(guardado('AUDUSD/M1/2026').velas, '2026-02-02') === 0 && en(guardado('GBPUSD/M1/2026').velas, '2026-02-02') === 0, `AUDUSD 2-feb ${en(guardado('AUDUSD/M1/2026').velas, '2026-02-02')} · GBPUSD 2-feb ${en(guardado('GBPUSD/M1/2026').velas, '2026-02-02')}`)
oraculo('BF10', 'el log dice el corte por 429 y sale con 2 (no 3)', r1.codigo === 2 && r1.salida.some(l => /PROVEEDOR LIMITA \(HTTP 429\)/.test(l)), `codigo ${r1.codigo}`)

titulo('2 · prioridad: con una publicacion fallida antes, gana el 1')
escenario({ storage: { 'forex-data': storage(['AUDCAD', 'AUDUSD', 'GBPUSD']) } })
reloj = {}
proveedor.http = (url, n, { instrumento, dia }) => { if (instrumento === 'audusd' && dia === '2026-02-02') { reloj.ms += 240001; return { status: 429, body: '' } } return ok(dia) }
db.falla = c => c.op === 'upload' && c.payload?.ruta === 'AUDCAD/M1/2026.json' ? { message: 'denegado', statusCode: '403' } : null
const r2 = await corre('AUDCAD,AUDUSD,GBPUSD', reloj)
db.falla = null
oraculo('BF10', 'AUDCAD falla al subir y AUDUSD recibe el 429 al limite: codigo 1, y GBPUSD no se pide', r2.codigo === 1 && !pedidas().some(x => x.startsWith('GBPUSD')) && r2.salida.some(l => /PROVEEDOR LIMITA/.test(l)), `codigo ${r2.codigo} · ${pedidas().filter(x => x.startsWith('GBPUSD')).length} de GBPUSD`)

titulo('2b · MER-R1 (Astra, 7-oct): 429 con Retry-After que cabe, pero el temporizador despierta tarde')
// pideUrl aislado: 429 a los 230 s con Retry-After 7; la espera dura 10,001 s
{
  const D = await importa('lib/mercado/descarga.mjs').catch(() => null)
  let t = 0, n = 0
  const r = D ? await D.pideUrl('https://x.invalid/a', { fetch: async () => { n++; t += n === 1 ? 230000 : 0; return { status: n === 1 ? 429 : 200, headers: { get: k => (String(k).toLowerCase() === 'retry-after' ? '7' : null) }, arrayBuffer: async () => new TextEncoder().encode('[1]').buffer } }, espera: async ms => { t += ms + 3001 }, etiqueta: 'X', ahora: () => t, limite: 240000, intentos: 3 }).then(() => 'ok', e => e?.tipo) : 'sin modulo'
  oraculo('BF10', 'pideUrl: si la espera del Retry-After acaba fuera del presupuesto, se propaga «limite» (no «presupuesto»), sin reintentar', r === 'limite' && n === 1, `${r} · ${n} peticion(es)`)
}
escenario({ storage: { 'forex-data': storage(['AUDUSD', 'GBPUSD']) } })
reloj = { alEsperar: ms => (ms === 7000 ? ms + 3001 : 0) }
proveedor.http = (url, n, { instrumento, dia }) => { if (instrumento === 'audusd' && dia === '2026-02-02' && n === 1) { reloj.ms += 230000; return { status: 429, headers: { 'Retry-After': '7' }, body: '' } } return ok(dia) }
const r2b = await corre('AUDUSD,GBPUSD', reloj)
oraculo('BF10', 'el script: corte global (codigo 2), GBPUSD nunca se pide y nada nuevo se publica', r2b.codigo === 2 && !pedidas().some(x => x.startsWith('GBPUSD')) && en(guardado('GBPUSD/M1/2026').velas, '2026-02-02') === 0 && r2b.salida.some(l => /PROVEEDOR LIMITA/.test(l)), `codigo ${r2b.codigo} · ${pedidas().join(' | ')}`)

titulo('3 · control: un 200 que llega tarde sigue descartandose')
escenario({ storage: { 'forex-data': storage(['AUDUSD']) } })
reloj = {}
proveedor.http = (url, n, { instrumento, dia }) => { if (instrumento === 'audusd' && dia === '2026-02-02') reloj.ms += 240001; return ok(dia) }
const r3 = await corre('AUDUSD', reloj)
oraculo('BF10', 'un 200 tardio (sin 429): «presupuesto», no se publica y no hay corte por 429', en(guardado('AUDUSD/M1/2026').velas, '2026-02-02') === 0 && r3.salida.some(l => /sin descargar: 2026-02-02 \(presupuesto/.test(l)) && !r3.salida.some(l => /PROVEEDOR LIMITA/.test(l)), r3.salida.find(l => l.includes('AUDUSD/M1')) ?? '')
proveedor.http = null
oraculo('BF10', 'ningun script por timeout', ejecucionesScripts.every(e => e.terminoPor !== 'timeout'))
fin()
