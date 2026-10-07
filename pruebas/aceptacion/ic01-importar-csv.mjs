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
 * --subir exige ademas --subida-autorizada (CTO, cierres-5): sin ella, 4 y nada.
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
 *   CSV-01: 23:60, 24:00 y 50.06 (Date.UTC los lleva al 20-jul 00:00): 4, nada;
 *   CSV-02: un maximo de 10⁹, el dia entero +3 %, una mecha de −4,5 % y una
 *   deriva por escalones de 1,5 % hasta +16 % (mediana intacta): 4, nada;
 *   CSV-03: solo un dia interior con velas o el ultimo guardado: el lunes 27
 *   detras del viernes 24 (domingo vacio), o con el 24 a medias: 4; reparar el
 *   ultimo (24-jul 600 → 1440): 0; si bajo el cerrojo el dia ya no es
 *   interior: 1, nada;
 *   CSV-04: --objetivo ',' (con 900 guardadas y un CSV de 1.000), vacio, con
 *   elementos vacios o sin valor: 4, nada leido ni subido;
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
// CTO 7-oct (cierres-5): --subir solo con la opcion explicita, hasta que Astra verifique el importador
const SUBIR = ['--subir', '--subida-autorizada']

titulo('1 · en seco')
base()
const r0 = await corre(ARGS(BUENO))
oraculo('IC01', 'seco: valida, dice que publicaria el 20-jul 900 → 1440 y no sube nada', r0.codigo === 0 && r0.salida.some(l => /SECO/.test(l) && /900 → 1440/.test(l)) && subidasDatos() === 0, `codigo ${r0.codigo} · ${r0.salida.filter(l => /SECO|→/.test(l)).join(' | ')}`)

titulo('1b · --subir sin la opcion explicita (CTO, cierres-5)')
base()
const rg = await corre([...ARGS(BUENO), '--subir'])
oraculo('IC01', '--subir sin --subida-autorizada: 4, nada leido ni subido, y lo dice', rg.codigo === 4 && !db.log.some(l => String(l.tabla).startsWith('storage')) && rg.salida.some(l => /--subida-autorizada/.test(l)), `codigo ${rg.codigo} · ${rg.salida.slice(-2).join(' | ')}`)

titulo('2 · --subir')
base()
const antes = JSON.parse(db.storage['forex-data'][RUTA])
const r1 = await corre([...ARGS(BUENO), ...SUBIR])
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
  const r = await corre([...ARGS(fichero(`malo-${que.replace(/ /g, '-')}.csv`, texto)), ...SUBIR])
  oraculo('IC01', `${que}: rechazado con 4 y cero subidas`, r.codigo === 4 && subidasDatos() === 0, `codigo ${r.codigo} · ${r.salida.slice(-2).join(' | ')}`)
}
base()
const rObj = await corre([...ARGS(BUENO), '--objetivo', 'GBPUSD:2026-07-20'])
oraculo('IC01', 'un objetivo de otro par: 4 y nada leido ni subido', rObj.codigo === 4 && !db.log.some(l => String(l.tabla).startsWith('storage')), `codigo ${rObj.codigo}`)

titulo('3b · CSV-01 (Astra, cierres-5): fechas y horas por rangos y por ida y vuelta')
// la primera fila (20-jul 00:00) escrita de otra forma que Date.UTC normaliza al 20-jul 00:00
for (const fecha of ['19.07.2026 23:60:00.000', '19.07.2026 24:00:00.000', '50.06.2026 00:00:00.000']) {
  base()
  const texto = csv(velasDe('2026-07-20')).replace('20.07.2026 00:00:00.000', fecha)
  const r = await corre([...ARGS(fichero(`fecha-${fecha.replace(/[ :.]/g, '_')}.csv`, texto)), ...SUBIR])
  oraculo('IC01', `CSV-01: «${fecha}» en una fila: 4 y cero subidas`, texto.includes(fecha) && r.codigo === 4 && subidasDatos() === 0, `codigo ${r.codigo} · ${r.salida.slice(-2).join(' | ')}`)
}

titulo('3c · CSV-02 (Astra, cierres-5): cada extremo y cada salto, plausibles')
// lo guardado cierra en 1,1; umbrales: salto ≤ 2 % del cierre anterior (la primera vela, del ultimo guardado); extremos a ≤ 10 % del ultimo guardado
const deriva = velasDe('2026-07-20').map((v, i) => { if (i < 1430) return v; const px = +(1.1 * 1.015 ** (i - 1429)).toFixed(5); return { ...v, open: px, high: px, low: px, close: px } })
const anomalos = {
  'un maximo de mil millones': csv(velasDe('2026-07-20').map((v, i) => (i === 10 ? { ...v, high: 1000000000 } : v))),
  'todo el dia un 3 % por encima de lo guardado': csv(velasDe('2026-07-20', 1440, 0, 1.133)),
  'una mecha suelta del −4,5 %': csv(velasDe('2026-07-20').map((v, i) => (i === 600 ? { ...v, low: 1.05 } : v))),
  'escalones del 1,5 % que acaban un 16 % arriba': csv(deriva),
}
for (const [que, texto] of Object.entries(anomalos)) {
  base()
  const r = await corre([...ARGS(fichero(`anomalo-${que.replace(/[^a-z0-9]+/gi, '-')}.csv`, texto)), ...SUBIR])
  oraculo('IC01', `CSV-02: ${que}: rechazado entero (4) y cero subidas`, r.codigo === 4 && subidasDatos() === 0, `codigo ${r.codigo} · ${r.salida.slice(-2).join(' | ')}`)
}

titulo('3d · CSV-03 (Astra, cierres-5): solo dias interiores existentes o el ultimo; nunca extender')
// lo guardado acaba el viernes 24-jul (el domingo 26 no esta); hasta(fin, n): el ultimo dia con n velas
const hasta = (fin, n = 1440) => { const fin0 = Date.parse(fin + 'T00:00:00Z') / 1000; return historial().filter(v => v.time < fin0 || (v.time < fin0 + 86400 && v.time < fin0 + n * 60)) }
const conHistoria = velas => escenario({ storage: { 'forex-data': { [RUTA]: JSON.stringify(velas) } } })
const ARGS27 = f => ['--par', 'EURUSD', '--dia', '2026-07-27', '--csv', f]
const LUNES = fichero('lunes-27.csv', csv(velasDe('2026-07-27')))
conHistoria(hasta('2026-07-24'))
const e1 = await corre([...ARGS27(LUNES), ...SUBIR])
oraculo('IC01', 'CSV-03: lunes 27 detras del viernes 24 con el domingo 26 vacio: 4, nada subido', e1.codigo === 4 && subidasDatos() === 0, `codigo ${e1.codigo} · ${e1.salida.slice(-2).join(' | ')}`)
conHistoria(hasta('2026-07-24', 600))
const e2 = await corre([...ARGS27(LUNES), ...SUBIR])
oraculo('IC01', 'CSV-03: con el ultimo dia (24-jul) a medias, importar el 27: 4, nada subido', e2.codigo === 4 && subidasDatos() === 0, `codigo ${e2.codigo} · ${e2.salida.slice(-2).join(' | ')}`)
conHistoria(hasta('2026-07-24', 600))
const e3 = await corre(['--par', 'EURUSD', '--dia', '2026-07-24', '--csv', fichero('viernes-24.csv', csv(velasDe('2026-07-24'))), ...SUBIR])
oraculo('IC01', 'CSV-03 control: reparar el ultimo dia guardado (24-jul, 600 → 1440) si se publica, con 0', e3.codigo === 0 && en(guardado('EURUSD/M1/2026').velas, '2026-07-24') === 1440, `codigo ${e3.codigo} · 24-jul ${en(guardado('EURUSD/M1/2026').velas, '2026-07-24')}`)
// bajo el cerrojo: al tomarlo, lo guardado ya no llega al 20-jul (acaba el 17): componer no extiende
base()
db.pausa = async c => { if (c.op === 'upload' && String(c.payload?.ruta).startsWith('_cerrojos/') && !db.cambiado) { db.cambiado = true; db.storage['forex-data'][RUTA] = JSON.stringify(hasta('2026-07-17')) } }
const e4 = await corre([...ARGS(BUENO), ...SUBIR])
db.pausa = null; delete db.cambiado
oraculo('IC01', 'CSV-03 bajo el cerrojo: si al releer el 20-jul ya no es interior, no se publica (1) y lo dice', db.log.some(l => l.op === 'upload' && String(l.payload?.ruta).startsWith('_cerrojos/')) && e4.codigo === 1 && subidasDatos() === 0 && e4.salida.some(l => /bajo el cerrojo.*no extiende el historico/.test(l)), `codigo ${e4.codigo} · ${e4.salida.filter(l => /✗|✓/.test(l)).join(' | ')}`)

titulo('3e · CSV-04 (Astra, cierres-5): --objetivo con al menos un elemento valido y sin vacios')
// el caso de Astra: 900 guardadas, CSV de 1.000 (aun corto) y --objetivo ','
const MIL = fichero('mil.csv', csv(velasDe('2026-07-20', 1000)))
for (const extra of [['--objetivo', ','], ['--objetivo', ''], ['--objetivo', 'EURUSD:2026-07-20,'], ['--objetivo', ',EURUSD:2026-07-20'], ['--objetivo', 'EURUSD:2026-07-20,,EURUSD:2026-07-21'], ['--objetivo']]) {
  base()
  const r = await corre([...ARGS(MIL), ...SUBIR, ...extra])
  oraculo('IC01', `CSV-04: ${extra.map(x => (x === '' ? "''" : x)).join(' ')}: 4, nada leido ni subido`, r.codigo === 4 && !db.log.some(l => String(l.tabla).startsWith('storage')) && !r.salida.some(l => /TODO OK/.test(l)), `codigo ${r.codigo} · ${r.salida.slice(-2).join(' | ')}`)
}

titulo('4 · nada mejor, cerrojo y velas planas')
base()
const r4 = await corre([...ARGS(fichero('menos.csv', csv(velasDe('2026-07-20', 800)))), ...SUBIR])
oraculo('IC01', 'un CSV con menos velas que lo guardado (800 < 900): no publica y sale con 1', r4.codigo === 1 && subidasDatos() === 0 && en(guardado('EURUSD/M1/2026').velas, '2026-07-20') === 900, `codigo ${r4.codigo} · ${r4.salida.slice(-2).join(' | ')}`)
escenario({ storage: { 'forex-data': { [RUTA]: JSON.stringify(historial()), '_cerrojos/EURUSD_2026.json': JSON.stringify({ dueno: 'otro', desde: '2026-10-07T11:00:00Z' }) } } })
const r5 = await corre([...ARGS(BUENO), ...SUBIR])
oraculo('IC01', 'cerrojo puesto: «ocupado», cero subidas de datos y codigo 1', r5.codigo === 1 && subidasDatos() === 0 && r5.salida.some(l => /ocupado|cerrojo/.test(l)), `codigo ${r5.codigo}`)
base()
const conPlanas = velasDe('2026-07-20', 1440).map((v, i) => i >= 1380 ? { ...v, volume: 0 } : v)
const r6 = await corre([...ARGS(fichero('planas.csv', csv(conPlanas))), ...SUBIR])
oraculo('IC01', '60 velas planas con volumen 0: se quitan y se publican 1.380', r6.codigo === 0 && en(guardado('EURUSD/M1/2026').velas, '2026-07-20') === 1380, `codigo ${r6.codigo} · 20-jul ${en(guardado('EURUSD/M1/2026').velas, '2026-07-20')}`)
// MER-R2: fechas imposibles en --dia y en --objetivo: 4 controlado, sin RangeError ni Storage
for (const extra of [['--par', 'EURUSD', '--dia', '2026-99-99', '--csv', BUENO], [...ARGS(BUENO), '--objetivo', 'EURUSD:2026-13-01']]) { base(); const r = await corre(extra); oraculo('IC01', `${extra.join(' ').replace(/ --csv \S+/, '')}: 4 controlado`, r.codigo === 4 && !db.log.some(l => String(l.tabla).startsWith('storage')) && !r.salida.some(l => /RangeError|Invalid time/.test(l)), `codigo ${r.codigo} · ${r.salida.slice(-2).join(' | ')}`) }
oraculo('IC01', 'ningun script por timeout', hay && ejecucionesScripts.every(e => e.terminoPor !== 'timeout'))
fin()
