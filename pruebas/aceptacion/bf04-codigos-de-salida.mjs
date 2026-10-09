/**
 * BF04 · CODIGOS DE SALIDA DISTINTOS Y UN HUECO INTERIOR IMPIDE «TODO OK»
 * (Astra, cierres-3, añadido F; bloque G, punto 10; CTO 6-oct-2026)
 *
 * Astra: el codigo de salida no distinguia proveedor caido de exito (0 los
 * dos), ni descolgado solo de descolgado con proveedor caido (1 los dos); con
 * el presupuesto a cero y ninguna llamada se imprimia «proveedor no
 * disponible»; y un corto interior de 900 velas sin reparar acababa en 0 con
 * TODO OK: el veredicto miraba la ultima fecha, no los dias interiores.
 * Decision del CTO: codigos distintos para todo bien, par descolgado o
 * publicacion fallida, proveedor no disponible y presupuesto agotado. Un dia
 * corto interior sin reparar impide «TODO OK».
 *
 * Codigos (scripts/actualizar-diario.js): 0 todo bien · 1 descolgado, dia
 * interior incompleto o publicacion fallida/incierta · 2 proveedor no
 * disponible · 3 presupuesto agotado · 4 error inesperado. Si coinciden,
 * manda el primero de 1, 3, 2.
 *
 * Fixture: nueve pares completos (domingos reales) hasta el domingo 1-feb;
 * hoy martes 3-feb 06:00 UTC: falta el lunes 2-feb. Proveedor y Storage
 * FALSOS; script REAL; sin red.
 */
import { titulo, ver, oraculo, fin, escenario, proveedor, db } from '../lib.mjs'
import { diaM1 } from '../proveedor-falso.mjs'
import { correScript, ejecucionesScripts } from '../script-falso.mjs'
const DIA = 86400000
const ENV = { NEXT_PUBLIC_SUPABASE_URL: 'https://falso.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'falsa' }
const NUEVE = ['EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'AUDUSD', 'USDCAD', 'NZDUSD', 'AUDCAD', 'GBPJPY']
const velasDe = (dia, n = 1440) => diaM1(dia, n).map(c => ({ time: c.timestamp / 1000, open: c.open, high: c.high, low: c.low, close: c.close, volume: 1 }))
// 1-ene: mercado reducido (CTO 6-oct): velas de 22:00 a 23:59, como las medidas
const historial = (hasta, cortos = {}) => { const v = [...velasDe('2026-01-01').slice(22 * 60)]; for (let t = Date.parse('2026-01-02T00:00:00Z'); t <= Date.parse(hasta + 'T00:00:00Z'); t += DIA) { const w = new Date(t).getUTCDay(), d = new Date(t).toISOString().slice(0, 10); if (w >= 1 && w <= 5) v.push(...velasDe(d, cortos[d] ?? 1440)); else if (w === 0) v.push(...velasDe(d).slice(22 * 60)) } return v }
const todos = (extra = {}) => ({ ...Object.fromEntries(NUEVE.map(p => [`${p}/M1/2026.json`, JSON.stringify(historial('2026-02-01'))])), ...extra })
const filas = (dia, n = 1440) => JSON.stringify(dow(dia) === 0 ? diaM1(dia).slice(22 * 60) : diaM1(dia, n))
const dow = d => new Date(d + 'T00:00:00Z').getUTCDay()
const corre = (env = {}) => correScript('scripts/actualizar-diario.js', { ahora: '2026-02-03T06:00:00Z', argv: ['--subir'], env: { ...ENV, ...env } })
const seccion = (r, t) => { const i = r.salida.findIndex(l => l.includes(t)); if (i < 0) return []; const out = []; for (let k = i + 1; k < r.salida.length && !/^\s*===/.test(r.salida[k]) && r.salida[k].trim() !== ''; k++) out.push(r.salida[k]); return out }
const todoOk = r => r.salida.some(l => /TODO OK/.test(l))
const bien = () => { proveedor.http = (url, n, { dia }) => ({ status: 200, body: filas(dia) }) }
const codigos = {}

titulo('1 · todo bien')
escenario({ storage: { 'forex-data': todos() } }); bien()
const r1 = await corre(); codigos.bien = r1.codigo
// la precondicion (los nueve publican) va dentro: depende de la descarga propia
oraculo('BF04', 'todo bien (los nueve pares publican el 2-feb): codigo 0 y TODO OK', r1.salida.filter(l => /SUBIDO/.test(l)).length === 9 && r1.codigo === 0 && todoOk(r1), `codigo ${r1.codigo} · ${r1.salida.filter(l => /SUBIDO/.test(l)).length} subidos`)

titulo('2 · proveedor no disponible para AUDUSD, datos dentro del margen')
escenario({ storage: { 'forex-data': todos() } })
proveedor.http = (url, n, { instrumento, dia }) => { if (instrumento === 'audusd') throw new TypeError('fetch failed'); return { status: 200, body: filas(dia) } }
const r2 = await corre(); codigos.proveedor = r2.codigo
oraculo('BF04', 'proveedor no disponible: codigo 2, sin TODO OK, y AUDUSD en su seccion', r2.codigo === 2 && !todoOk(r2) && seccion(r2, 'PROVEEDOR NO DISPONIBLE').some(l => /AUDUSD/.test(l)), `codigo ${r2.codigo} · ${seccion(r2, 'PROVEEDOR NO DISPONIBLE').join(' | ')}`)

titulo('3 · descolgado: AUDUSD hasta el 23-ene y el proveedor sin datos')
escenario({ storage: { 'forex-data': todos({ 'AUDUSD/M1/2026.json': JSON.stringify(historial('2026-01-23')) }) } })
proveedor.http = (url, n, { instrumento, dia }) => instrumento === 'audusd' ? { status: 404, body: '' } : { status: 200, body: filas(dia) }
const r3 = await corre(); codigos.descolgado = r3.codigo
oraculo('BF04', 'descolgado: codigo 1 y sin TODO OK', r3.codigo === 1 && !todoOk(r3) && seccion(r3, 'DESCOLGADO').some(l => /AUDUSD/.test(l)), `codigo ${r3.codigo}`)

titulo('4 · publicacion fallida: Storage rechaza la subida de AUDUSD (403)')
escenario({ storage: { 'forex-data': todos() } }); bien()
db.falla = c => c.op === 'upload' && String(c.payload?.ruta).startsWith('AUDUSD/M1/2026.json') ? { message: 'denegado', statusCode: '403' } : null
const r4 = await corre(); db.falla = null; codigos.publicacion = r4.codigo
oraculo('BF04', 'publicacion fallida: codigo 1 (como descolgado) y sin TODO OK', r4.codigo === 1 && !todoOk(r4) && r4.salida.some(l => /✗ PUBLICACION/.test(l)), `codigo ${r4.codigo}`)

titulo('5 · presupuesto agotado')
escenario({ storage: { 'forex-data': todos() } }); bien()
const r5 = await corre({ PRESUPUESTO_JOB_S: '0' }); codigos.presupuesto = r5.codigo
oraculo('BF04', 'presupuesto del job a cero: codigo 3, sin TODO OK, en su propia seccion', r5.codigo === 3 && !todoOk(r5) && seccion(r5, 'PRESUPUESTO AGOTADO').length === 9, `codigo ${r5.codigo} · ${seccion(r5, 'PRESUPUESTO AGOTADO').length} pares en la seccion`)
oraculo('BF04', 'sin ninguna llamada, nadie sale como «proveedor no disponible»', proveedor.llamadas.length === 0 && seccion(r5, 'PROVEEDOR NO DISPONIBLE').length === 0, `${proveedor.llamadas.length} llamadas · ${seccion(r5, 'PROVEEDOR NO DISPONIBLE').join(' | ')}`)

titulo('6 · un dia corto interior que no se repara')
escenario({ storage: { 'forex-data': todos({ 'AUDUSD/M1/2026.json': JSON.stringify(historial('2026-02-01', { '2026-01-14': 900 })) }) } })
proveedor.http = (url, n, { instrumento, dia }) => ({ status: 200, body: filas(dia, instrumento === 'audusd' && dia === '2026-01-14' ? 900 : 1440) })
const r6 = await corre(); codigos.interior = r6.codigo
oraculo('BF04', 'el 14-ene se pide, el proveedor solo tiene 900 y sigue en 900: sin TODO OK, codigo 1, y el estado de los datos lo nombra', proveedor.llamadas.some(l => l.instrumento === 'audusd' && l.desde.startsWith('2026-01-14')) && r6.codigo === 1 && !todoOk(r6) && seccion(r6, 'ESTADO DE LOS DATOS').some(l => /AUDUSD/.test(l) && /2026-01-14/.test(l)), `codigo ${r6.codigo} · ${seccion(r6, 'ESTADO DE LOS DATOS').find(l => /AUDUSD/.test(l))}`)

titulo('7 · los cuatro codigos son distintos')
oraculo('BF04', 'todo bien, descolgado/publicacion, proveedor y presupuesto: cuatro codigos distintos', new Set([codigos.bien, codigos.descolgado, codigos.proveedor, codigos.presupuesto]).size === 4 && codigos.descolgado === codigos.publicacion, JSON.stringify(codigos))
proveedor.http = null
ver('control (H06): ningun script por timeout', ejecucionesScripts.every(e => e.terminoPor !== 'timeout'))
fin()
