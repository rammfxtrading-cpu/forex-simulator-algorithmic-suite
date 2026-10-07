/**
 * IC01 · PLAN B: IMPORTAR UN DIA DESDE UN CSV DESCARGADO A MANO
 * (CTO, 7-oct-2026: el proveedor responde 429 desde casa y desde Actions)
 *
 * scripts/importar-csv.js --par PAR --dia AAAA-MM-DD --csv FICHERO [--subir]
 *   [--objetivo PAR:AAAA-MM-DD,...]: valida el CSV de velas M1 bid de UN dia y
 * UN par (fecha, como mucho 1.440 minutos, OHLC coherente, zona horaria UTC,
 * precio plausible para el par frente a lo guardado) y lo publica por la
 * funcion comun (publicarAnio: cerrojo, relectura, validacion, verificacion).
 * Solo sustituye el dia si trae MAS velas que lo guardado. Sin --subir, en seco.
 * Formatos aceptados (el del export web, sin comprobar contra un fichero real):
 *   «Gmt time,Open,High,Low,Close,Volume» con «dd.mm.aaaa HH:MM:SS.mmm», o
 *   «timestamp,open,high,low,close,volume» con milisegundos. «Local time» y
 *   cualquier otra cabecera: rechazados. Velas planas con volumen 0: fuera
 *   (como ignoreFlats del actualizador).
 * Codigos: 0 bien · 1 no publicado / objetivo incompleto / cerrojo · 4 entrada.
 *
 * ORACULOS (Storage falso; EURUSD 2026 con el 20-jul en 900 velas):
 *   seco: valida y dice que publicaria 900 → 1440, sin subir nada;
 *   --subir: el 20-jul queda con 1.440, el resto igual, cerrojo suelto,
 *   objetivo «completo» y codigo 0;
 *   rechazos con codigo 4 y cero subidas: una fila de otro dia, un minuto
 *   repetido, OHLC incoherente, «Local time», precio de otro par (157,4 en
 *   EURUSD), un objetivo de otro par;
 *   un CSV con menos velas que lo guardado: no publica, codigo 1;
 *   cerrojo puesto: «ocupado», cero subidas de datos, codigo 1;
 *   60 velas planas con volumen 0: se quitan (1.380 publicadas).
 */
import { titulo, oraculo, fin, escenario, db, guardado, REPO } from '../lib.mjs'
import { diaM1 } from '../proveedor-falso.mjs'
import { correScript, ejecucionesScripts } from '../script-falso.mjs'
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const hay = existsSync(REPO + 'scripts/importar-csv.js')
const ENV = { NEXT_PUBLIC_SUPABASE_URL: 'https://falso.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'falsa' }
const DIR = mkdtempSync(path.join(os.tmpdir(), 'ic01-'))
const DIA = 86400000
const velasDe = (dia, n = 1440, desde = 0, px = 1.1) => diaM1(dia, 1440, px).slice(desde, desde + n).map(c => ({ time: c.timestamp / 1000, open: c.open, high: c.high, low: c.low, close: c.close, volume: 1 }))
const historial = () => { const v = [...velasDe('2026-01-01', 120, 22 * 60)]; for (let t = Date.parse('2026-01-02T00:00:00Z'); t <= Date.parse('2026-07-24T00:00:00Z'); t += DIA) { const w = new Date(t).getUTCDay(), d = new Date(t).toISOString().slice(0, 10); if (w >= 1 && w <= 5) v.push(...velasDe(d, d === '2026-07-20' ? 900 : 1440)); else if (w === 0) v.push(...velasDe(d, 120, 22 * 60)) } return v }
const RUTA = 'EURUSD/M1/2026.json'
const base = () => escenario({ storage: { 'forex-data': { [RUTA]: JSON.stringify(historial()) } } })
// CSV del export web: «Gmt time,...» con dd.mm.aaaa HH:MM:SS.mmm
const dd = n => String(n).padStart(2, '0')
const gmt = t => { const d = new Date(t * 1000); return `${dd(d.getUTCDate())}.${dd(d.getUTCMonth() + 1)}.${d.getUTCFullYear()} ${dd(d.getUTCHours())}:${dd(d.getUTCMinutes())}:00.000` }
const csv = (filas, cab = 'Gmt time,Open,High,Low,Close,Volume') => [cab, ...filas.map(v => `${gmt(v.time)},${v.open},${v.high},${v.low},${v.close},${v.volume}`)].join('\n') + '\n'
const fichero = (nombre, texto) => { const p = path.join(DIR, nombre); writeFileSync(p, texto); return p }
const corre = (argv) => hay ? correScript('scripts/importar-csv.js', { ahora: '2026-10-07T12:00:00Z', argv, env: ENV }) : Promise.resolve({ salida: [], codigo: null })
const subidasDatos = () => db.log.filter(l => l.op === 'upload' && l.payload?.ruta === RUTA).length
const en = (arr, d) => (arr || []).filter(v => new Date(v.time * 1000).toISOString().startsWith(d)).length
const BUENO = fichero('EURUSD_Candlestick_1_M_BID_20.07.2026-20.07.2026.csv', csv(velasDe('2026-07-20', 1440, 0, 1.1)))
const ARGS = f => ['--par', 'EURUSD', '--dia', '2026-07-20', '--csv', f]

titulo('1 · en seco')
base()
const r0 = await corre(ARGS(BUENO))
oraculo('IC01', 'seco: valida, dice que publicaria el 20-jul 900 → 1440 y no sube nada', r0.codigo === 0 && r0.salida.some(l => /SECO/.test(l) && /900 → 1440/.test(l)) && subidasDatos() === 0, `codigo ${r0.codigo} · ${r0.salida.filter(l => /SECO|→/.test(l)).join(' | ')}`)

titulo('2 · --subir')
base()
const antes = JSON.parse(db.storage['forex-data'][RUTA])
const r1 = await corre([...ARGS(BUENO), '--subir'])
const g1 = guardado('EURUSD/M1/2026').velas
const otrosIguales = g1 && en(g1, '2026-07-17') === 1440 && en(g1, '2026-07-21') === 1440 && g1.length === antes.length - 900 + 1440
oraculo('IC01', '--subir: el 20-jul queda con 1.440, el resto igual y el cerrojo suelto', en(g1, '2026-07-20') === 1440 && otrosIguales && !Object.keys(db.storage['forex-data']).some(k => k.startsWith('_cerrojos/')), `20-jul ${en(g1, '2026-07-20')} · total ${g1?.length} (antes ${antes.length})`)
oraculo('IC01', 'el objetivo (el dia importado) sale «completo» y el codigo es 0', r1.codigo === 0 && r1.salida.some(l => /EURUSD 2026-07-20: ✓ completo · 1440 velas · ultima 23:59/.test(l)), `codigo ${r1.codigo} · ${r1.salida.filter(l => /completo/.test(l)).join(' | ')}`)

titulo('3 · rechazos (codigo 4, nada subido)')
const malos = {
  'fila de otro dia': csv([...velasDe('2026-07-20', 1439), ...velasDe('2026-07-21', 1)]),
  'minuto repetido': csv([...velasDe('2026-07-20', 1440), velasDe('2026-07-20', 1)[0]]),
  'OHLC incoherente': csv(velasDe('2026-07-20', 1440).map((v, i) => i === 10 ? { ...v, high: 1.0, low: 1.2 } : v)),
  'hora local': csv(velasDe('2026-07-20', 1440), 'Local time,Open,High,Low,Close,Volume'),
  'precio de otro par': csv(velasDe('2026-07-20', 1440, 0, 157.4)),
}
for (const [que, texto] of Object.entries(malos)) {
  base()
  const r = await corre([...ARGS(fichero(`malo-${que.replace(/ /g, '-')}.csv`, texto)), '--subir'])
  oraculo('IC01', `${que}: rechazado con 4 y cero subidas`, r.codigo === 4 && subidasDatos() === 0, `codigo ${r.codigo} · ${r.salida.slice(-2).join(' | ')}`)
}
base()
const rObj = await corre([...ARGS(BUENO), '--objetivo', 'GBPUSD:2026-07-20'])
oraculo('IC01', 'un objetivo de otro par: 4 y nada leido ni subido', rObj.codigo === 4 && !db.log.some(l => String(l.tabla).startsWith('storage')), `codigo ${rObj.codigo}`)

titulo('4 · nada mejor, cerrojo y velas planas')
base()
const r4 = await corre([...ARGS(fichero('menos.csv', csv(velasDe('2026-07-20', 800)))), '--subir'])
oraculo('IC01', 'un CSV con menos velas que lo guardado (800 < 900): no publica y sale con 1', r4.codigo === 1 && subidasDatos() === 0 && en(guardado('EURUSD/M1/2026').velas, '2026-07-20') === 900, `codigo ${r4.codigo} · ${r4.salida.slice(-2).join(' | ')}`)
escenario({ storage: { 'forex-data': { [RUTA]: JSON.stringify(historial()), '_cerrojos/EURUSD_2026.json': JSON.stringify({ dueno: 'otro', desde: '2026-10-07T11:00:00Z' }) } } })
const r5 = await corre([...ARGS(BUENO), '--subir'])
oraculo('IC01', 'cerrojo puesto: «ocupado», cero subidas de datos y codigo 1', r5.codigo === 1 && subidasDatos() === 0 && r5.salida.some(l => /ocupado|cerrojo/.test(l)), `codigo ${r5.codigo}`)
base()
const conPlanas = velasDe('2026-07-20', 1440).map((v, i) => i >= 1380 ? { ...v, volume: 0 } : v)
const r6 = await corre([...ARGS(fichero('planas.csv', csv(conPlanas))), '--subir'])
oraculo('IC01', '60 velas planas con volumen 0: se quitan y se publican 1.380', r6.codigo === 0 && en(guardado('EURUSD/M1/2026').velas, '2026-07-20') === 1380, `codigo ${r6.codigo} · 20-jul ${en(guardado('EURUSD/M1/2026').velas, '2026-07-20')}`)
oraculo('IC01', 'ningun script por timeout', hay && ejecucionesScripts.every(e => e.terminoPor !== 'timeout'))
fin()
