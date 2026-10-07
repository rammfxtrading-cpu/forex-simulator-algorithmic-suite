/**
 * BF08 · UN 429 ES DEL PROVEEDOR ENTERO, NO DEL DIA
 * (CTO, 6-oct-2026, tras la sonda 1: 69 de 75 peticiones con HTTP 429)
 *
 * El actualizador trataba un 429 como un fallo del dia: reintentaba hasta 5
 * veces y seguia con el dia siguiente y el par siguiente, alimentando el
 * limite. Decision del CTO: al recibir un 429 se respeta el Retry-After si
 * cabe en el presupuesto; si no, se corta el job COMPLETO (ni otros dias ni
 * otros pares) y sale con el codigo de «proveedor no disponible» (2). Lo
 * contiguo ya descargado se publica igual. Pausa configurable entre dias
 * (PAUSA_DIA_S, por defecto 5 s) y 3 intentos por dia.
 *
 * Fixture: nueve pares hasta el domingo 1-feb-2026; hoy miercoles 4-feb 06:00
 * UTC: pendientes el 2 y el 3-feb. Orden de pares: AUDCAD, AUDUSD, EURUSD…
 *
 * ORACULOS, a mano:
 *   AUDUSD 3-feb con 429 sin Retry-After: AUDCAD (antes) publica; AUDUSD
 *   publica su 2-feb y no su 3-feb; ninguna peticion despues (ni EURUSD ni
 *   los demas); codigo 2; el log dice 429. Si ademas falla una publicacion
 *   (AUDCAD, 403), gana el 1 (CTO 7-oct): no queda oculta tras el 2.
 *   429 con Retry-After 7 que cabe: espera 7 s, reintenta y sigue; codigo 0.
 *   429 con Retry-After 3600 (no cabe en los 4 min del par): se corta; 2.
 *   503 sostenido: 3 peticiones para ese dia (no 5).
 *   Entre dias, una espera de 5 s (5000 ms); con PAUSA_DIA_S=2, de 2000 ms.
 */
import { titulo, oraculo, fin, escenario, proveedor, guardado, db } from '../lib.mjs'
import { diaM1 } from '../proveedor-falso.mjs'
import { correScript, ejecucionesScripts } from '../script-falso.mjs'
const DIA = 86400000
const ENV = { NEXT_PUBLIC_SUPABASE_URL: 'https://falso.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'falsa' }
const NUEVE = ['EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'AUDUSD', 'USDCAD', 'NZDUSD', 'AUDCAD', 'GBPJPY']
const velasDe = (dia, n = 1440) => diaM1(dia, n).map(c => ({ time: c.timestamp / 1000, open: c.open, high: c.high, low: c.low, close: c.close, volume: 1 }))
const historial = hasta => { const v = [...velasDe('2026-01-01').slice(22 * 60)]; for (let t = Date.parse('2026-01-02T00:00:00Z'); t <= Date.parse(hasta + 'T00:00:00Z'); t += DIA) { const w = new Date(t).getUTCDay(), d = new Date(t).toISOString().slice(0, 10); if (w >= 1 && w <= 5) v.push(...velasDe(d)); else if (w === 0) v.push(...velasDe(d).slice(22 * 60)) } return v }
const todos = () => Object.fromEntries(NUEVE.map(p => [`${p}/M1/2026.json`, JSON.stringify(historial('2026-02-01'))]))
const ok = dia => ({ status: 200, body: JSON.stringify(diaM1(dia)) })
const corre = (env = {}) => correScript('scripts/actualizar-diario.js', { ahora: '2026-02-04T06:00:00Z', argv: ['--subir'], env: { ...ENV, ...env } })
const en = (arr, d) => (arr || []).filter(v => new Date(v.time * 1000).toISOString().startsWith(d)).length
const pedidas = () => proveedor.llamadas.map(l => `${l.instrumento.toUpperCase()} ${l.desde.slice(0, 10)}`)

titulo('1 · 429 sin Retry-After en AUDUSD 3-feb: se corta el job entero')
escenario({ storage: { 'forex-data': todos() } })
proveedor.http = (url, n, { instrumento, dia }) => instrumento === 'audusd' && dia === '2026-02-03' ? { status: 429, body: '' } : ok(dia)
const r1 = await corre()
const p1 = pedidas()
oraculo('BF08', 'despues del 429 no se pide nada mas: ni otro dia ni otro par', p1.at(-1) === 'AUDUSD 2026-02-03' && p1.filter(x => x === 'AUDUSD 2026-02-03').length === 1 && !p1.some(x => /^(EURUSD|GBPJPY|GBPUSD|NZDUSD|USDCAD|USDCHF|USDJPY)/.test(x)), p1.join(' | '))
oraculo('BF08', 'lo contiguo ya descargado se publica: AUDCAD entero y el 2-feb de AUDUSD (no su 3-feb)', en(guardado('AUDCAD/M1/2026').velas, '2026-02-03') === 1440 && en(guardado('AUDUSD/M1/2026').velas, '2026-02-02') === 1440 && en(guardado('AUDUSD/M1/2026').velas, '2026-02-03') === 0, `AUDCAD 3-feb ${en(guardado('AUDCAD/M1/2026').velas, '2026-02-03')} · AUDUSD 2-feb ${en(guardado('AUDUSD/M1/2026').velas, '2026-02-02')} · 3-feb ${en(guardado('AUDUSD/M1/2026').velas, '2026-02-03')}`)
oraculo('BF08', 'sale con el codigo de «proveedor no disponible» (2) y el log dice 429', r1.codigo === 2 && r1.salida.some(l => /429/.test(l) && /corta|cortado/i.test(l)), `codigo ${r1.codigo} · ${r1.salida.filter(l => /429/.test(l)).slice(-2).join(' | ')}`)

// CTO 7-oct: si ademas falla una publicacion en la misma ejecucion, gana el 1
escenario({ storage: { 'forex-data': todos() } })
proveedor.http = (url, n, { instrumento, dia }) => instrumento === 'audusd' && dia === '2026-02-03' ? { status: 429, body: '' } : ok(dia)
db.falla = c => c.op === 'upload' && c.payload?.ruta === 'AUDCAD/M1/2026.json' ? { message: 'denegado', statusCode: '403' } : null
const r1b = await corre()
db.falla = null
oraculo('BF08', '429 y ademas una publicacion fallida (AUDCAD): gana el 1, y el log dice las dos cosas', r1b.codigo === 1 && r1b.salida.some(l => /✗ PUBLICACION/.test(l) && /AUDCAD/.test(l)) && r1b.salida.some(l => /429/.test(l) && /cortado/i.test(l)), `codigo ${r1b.codigo}`)

titulo('2 · 429 con Retry-After que cabe: se espera y se sigue')
escenario({ storage: { 'forex-data': todos() } })
proveedor.http = (url, n, { instrumento, dia }) => instrumento === 'audusd' && dia === '2026-02-03' && n === 1 ? { status: 429, headers: { 'Retry-After': '7' }, body: '' } : ok(dia)
const r2 = await corre()
oraculo('BF08', 'espera los 7 s del Retry-After, reintenta y el job acaba bien (0)', r2.esperas.includes(7000) && pedidas().filter(x => x === 'AUDUSD 2026-02-03').length === 2 && en(guardado('AUDUSD/M1/2026').velas, '2026-02-03') === 1440 && r2.codigo === 0, `codigo ${r2.codigo} · esperas ${[...new Set(r2.esperas)].join(',')}`)

titulo('3 · 429 con Retry-After que no cabe: se corta')
escenario({ storage: { 'forex-data': todos() } })
proveedor.http = (url, n, { instrumento, dia }) => instrumento === 'audusd' && dia === '2026-02-03' ? { status: 429, headers: { 'Retry-After': '3600' }, body: '' } : ok(dia)
const r3 = await corre()
oraculo('BF08', 'Retry-After de 3.600 s (no cabe en el par): no espera, se corta y sale con 2', !r3.esperas.includes(3600000) && !pedidas().some(x => /^EURUSD/.test(x)) && r3.codigo === 2, `codigo ${r3.codigo} · ${pedidas().slice(-2).join(' | ')}`)

titulo('4 · tres intentos por dia y pausa entre dias')
escenario({ storage: { 'forex-data': todos() } })
proveedor.http = (url, n, { instrumento, dia }) => instrumento === 'audusd' && dia === '2026-02-02' ? { status: 503, body: '' } : ok(dia)
const r4 = await corre()
oraculo('BF08', '503 sostenido: 3 peticiones para ese dia', pedidas().filter(x => x === 'AUDUSD 2026-02-02').length === 3, pedidas().filter(x => x === 'AUDUSD 2026-02-02').length + ' peticiones')
oraculo('BF08', 'entre dias, una espera de 5 s por defecto', r4.esperas.filter(ms => ms === 5000).length >= 9, `${r4.esperas.filter(ms => ms === 5000).length} esperas de 5000 ms`)
escenario({ storage: { 'forex-data': todos() } }); proveedor.http = (url, n, { dia }) => ok(dia)
const r5 = await corre({ PAUSA_DIA_S: '2' })
oraculo('BF08', 'con PAUSA_DIA_S=2, de 2000 ms', r5.esperas.filter(ms => ms === 2000).length >= 9 && !r5.esperas.includes(5000), `${r5.esperas.filter(ms => ms === 2000).length} de 2000 · ${r5.esperas.filter(ms => ms === 5000).length} de 5000`)
proveedor.http = null
oraculo('BF08', 'ningun script por timeout', ejecucionesScripts.every(e => e.terminoPor !== 'timeout'))
fin()
