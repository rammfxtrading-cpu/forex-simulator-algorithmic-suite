/**
 * MD03 · UN SOLO FORMATO: GZIP EN TODOS LOS ESCRITORES, LECTORES .gz → .json
 * (CTO 9-oct-2026, decision tras el choque gzip / recuperar)
 *
 *   1. Lectores (/api/candles, actualizador, diario, recuperar, restore,
 *      importar-csv): primero {AÑO}.json.gz y, si no existe, {AÑO}.json, sea
 *      cual sea MERCADO_GZIP. Bytes gzip solo bajo un nombre .gz (G3 se
 *      mantiene para .json). Cambia GZ00 (marcado para Astra).
 *   2. Escritores: todos publican .json.gz, tambien recuperar (el workflow
 *      manual ya no hace «unset MERCADO_GZIP»; el resto, igual). Guarda: un
 *      escritor que fuese a escribir .json en un par y año que ya tienen
 *      .json.gz se niega (en el script, codigo 1).
 *   3. El .json antiguo se queda: nada se borra.
 *
 * ORACULOS, sin MERCADO_GZIP en el entorno (y con MERCADO_GZIP=0, que ya no
 * cambia nada): con los dos ficheros manda el .gz; sin .gz, el .json; gzip
 * bajo .json, error; actualizar-diario (lo que corre recuperar), restore e
 * importar-csv publican .json.gz application/gzip y no tocan el .json; la
 * guarda; el workflow manual sin el unset.
 */
import { gzipSync } from 'node:zlib'
import { titulo, ver, oraculo, fin, escenario, perfil, A, tok, proveedor, importa, db, guardado, fuente, REPO } from '../lib.mjs'
import { llama, createClient } from '../supabase-falso.mjs'
import { diaM1 } from '../proveedor-falso.mjs'
import { correScript, ejecucionesScripts } from '../script-falso.mjs'
import { createRequire } from 'node:module'
import { mkdtempSync, writeFileSync, existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
const YAML = createRequire(REPO + 'package.json')('yaml')
delete process.env.MERCADO_GZIP
const DIA = 86400000
const ENV = { NEXT_PUBLIC_SUPABASE_URL: 'https://falso.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'falsa' }
const velasDe = (dia, n = 1440) => diaM1(dia, n).map(c => ({ time: c.timestamp / 1000, open: c.open, high: c.high, low: c.low, close: c.close, volume: 1 }))
const gz = v => gzipSync(Buffer.from(JSON.stringify(v)))
const enDia = (arr, d) => (arr || []).filter(v => new Date(v.time * 1000).toISOString().startsWith(d)).length
const datos = op => db.log.filter(l => l.op === op && !String(l.payload?.ruta ?? l.payload).includes('_cerrojos/'))
const candles = (await importa('pages/api/candles.js')).default
const pide = (par, dia = '2025-01-06') => llama(candles, { method: 'GET', token: tok(A), query: { pair: par, timeframe: 'M1', from: String(Date.parse(dia + 'T00:00:00Z') / 1000), to: String(Date.parse(dia + 'T00:00:00Z') / 1000 + 86400), year: dia.slice(0, 4) } })
const historial = antesDe => { const v = []; for (let t = Date.UTC(2026, 0, 1); t < Date.parse(antesDe + 'T00:00:00Z'); t += DIA) { const d = new Date(t).getUTCDay(), dia = new Date(t).toISOString().slice(0, 10); if (d >= 1 && d <= 5) v.push(...velasDe(dia)); else if (d === 0) v.push(...velasDe(dia).slice(22 * 60)) } return v }

titulo('1 · /api/candles: primero el .gz, sea cual sea el interruptor')
// cada seccion, un par distinto (la cache del handler vive en el modulo)
escenario({ perfiles: [perfil(A)], storage: { 'forex-data': { 'EURUSD/M1/2025.json': JSON.stringify(velasDe('2025-01-06', 1200)), 'EURUSD/M1/2025.json.gz': gz(velasDe('2025-01-06', 1440)) } } })
const r1 = await pide('EURUSD')
oraculo('MD03', 'sin MERCADO_GZIP, con .json (1.200) y .json.gz (1.440): sirve el .json.gz', r1.estado === 200 && r1.cuerpo?.count === 1440, `estado ${r1.estado}; ${r1.cuerpo?.count ?? r1.cuerpo?.error}`)
process.env.MERCADO_GZIP = '0'
escenario({ perfiles: [perfil(A)], storage: { 'forex-data': { 'GBPUSD/M1/2025.json': JSON.stringify(velasDe('2025-01-06', 1200)), 'GBPUSD/M1/2025.json.gz': gz(velasDe('2025-01-06', 1440)) } } })
const r1b = await pide('GBPUSD')
delete process.env.MERCADO_GZIP
oraculo('MD03', 'con MERCADO_GZIP=0 tambien: el interruptor ya no decide nada', r1b.estado === 200 && r1b.cuerpo?.count === 1440, `estado ${r1b.estado}; ${r1b.cuerpo?.count ?? r1b.cuerpo?.error}`)
escenario({ perfiles: [perfil(A)], storage: { 'forex-data': { 'USDJPY/M1/2025.json': JSON.stringify(velasDe('2025-01-06', 1200)) } } })
const r2 = await pide('USDJPY')
oraculo('MD03', 'sin .json.gz (404 real), cae al .json (1.200)', r2.estado === 200 && r2.cuerpo?.count === 1200, `estado ${r2.estado}; ${r2.cuerpo?.count ?? r2.cuerpo?.error}`)
escenario({ perfiles: [perfil(A)], storage: { 'forex-data': { 'USDCHF/M1/2025.json': gz(velasDe('2025-01-06', 1300)) } } })
const r3 = await pide('USDCHF')
oraculo('MD03', 'G3 sigue para .json: bytes gzip bajo un nombre .json → 503 con mensaje, no 200', r3.estado === 503 && typeof r3.cuerpo?.error === 'string', `estado ${r3.estado}; ${r3.cuerpo?.count ?? r3.cuerpo?.error}`)

titulo('2 · actualizar-diario (lo que corre «recuperar»): lee el .gz y publica .json.gz')
const JSON_VIEJO = JSON.stringify([...historial('2026-09-29'), ...velasDe('2026-09-29')])
escenario({ storage: { 'forex-data': { 'EURUSD/M1/2026.json': JSON_VIEJO } } })
proveedor.responde = ({ dates }) => diaM1(dates.from.toISOString().slice(0, 10))
await correScript('scripts/actualizar-diario.js', { ahora: '2026-10-02T06:00:00Z', argv: ['--subir', '--pares', 'EURUSD'], env: ENV })
const up4 = datos('upload')
oraculo('MD03', 'sin MERCADO_GZIP, solo con .json: publica EURUSD/M1/2026.json.gz (application/gzip), con el 1-oct', up4.length === 1 && up4[0].payload.ruta === 'EURUSD/M1/2026.json.gz' && up4[0].payload.contentType === 'application/gzip' && guardado('EURUSD/M1/2026').formato === 'gz' && enDia(guardado('EURUSD/M1/2026').velas, '2026-10-01') === 1440, up4.map(l => `${l.payload.ruta} ${l.payload.contentType}`).join(' · '))
oraculo('MD03', 'el .json antiguo no se toca ni se borra', db.storage['forex-data']['EURUSD/M1/2026.json'] === JSON_VIEJO && datos('remove').length === 0, `${datos('remove').length} remove`)
escenario({ storage: { 'forex-data': { 'EURUSD/M1/2026.json': JSON.stringify(historial('2026-09-20')), 'EURUSD/M1/2026.json.gz': gz([...historial('2026-10-01'), ...velasDe('2026-10-01')]) } } })
proveedor.responde = ({ dates }) => diaM1(dates.from.toISOString().slice(0, 10))
await correScript('scripts/actualizar-diario.js', { ahora: '2026-10-03T06:00:00Z', argv: ['--subir', '--pares', 'EURUSD'], env: ENV })
const pidio = proveedor.llamadas.filter(l => l.instrumento === 'eurusd').map(l => l.desde.slice(0, 10))
oraculo('MD03', 'con los dos, parte del .gz (al dia hasta el 1-oct): solo pide el 2-oct', pidio.join() === '2026-10-02', `pidio ${pidio.join(', ') || 'nada'}`)

titulo('3 · restore-2026 e importar-csv publican .json.gz')
escenario({ storage: { 'forex-data': {} } })
proveedor.responde = ({ dates }) => { const out = []; for (let t = Date.UTC(2026, 0, 1); t < dates.to.getTime(); t += DIA) { const d = new Date(t); if (d.getUTCDay() % 6) out.push(...diaM1(d.toISOString().slice(0, 10))) } return out }
await correScript('scripts/restore-2026.js', { ahora: '2026-01-16T12:00:00Z', argv: ['--subir'] })
const up5 = datos('upload')
oraculo('MD03', 'restore sube los 6 como {PAR}/M1/2026.json.gz (application/gzip)', up5.length === 6 && up5.every(l => /^[A-Z]{6}\/M1\/2026\.json\.gz$/.test(l.payload.ruta) && l.payload.contentType === 'application/gzip'), up5.map(l => l.payload.ruta).join(' '))
{
  const dd = n => String(n).padStart(2, '0')
  const gmt = t => { const d = new Date(t * 1000); return `${dd(d.getUTCDate())}.${dd(d.getUTCMonth() + 1)}.${d.getUTCFullYear()} ${dd(d.getUTCHours())}:${dd(d.getUTCMinutes())}:00.000` }
  const hist = historial('2026-07-25').filter(v => !(enDia([v], '2026-07-20') && (v.time / 60) % 1440 >= 900))
  escenario({ storage: { 'forex-data': { 'EURUSD/M1/2026.json': JSON.stringify(hist) } } })
  const dir = mkdtempSync(path.join(os.tmpdir(), 'md03-'))
  const f = path.join(dir, 'EURUSD_Candlestick_1_M_BID_20.07.2026-20.07.2026.csv')
  writeFileSync(f, ['Gmt time,Open,High,Low,Close,Volume', ...velasDe('2026-07-20').map(v => `${gmt(v.time)},${v.open},${v.high},${v.low},${v.close},${v.volume}`)].join('\n') + '\n')
  ver('control: el historial tiene el 20-jul a medias (900) para que el importador tenga algo que publicar', enDia(hist, '2026-07-20') === 900, enDia(hist, '2026-07-20'))
  const ri = !existsSync(REPO + 'scripts/importar-csv.js') ? { codigo: null, salida: ['(sin scripts/importar-csv.js)'] } : await correScript('scripts/importar-csv.js', { ahora: '2026-10-07T12:00:00Z', argv: ['--par', 'EURUSD', '--dia', '2026-07-20', '--csv', f, '--subir', '--subida-autorizada'], env: ENV })
  const up6 = datos('upload')
  oraculo('MD03', 'importar-csv publica EURUSD/M1/2026.json.gz con el 20-jul entero, sin tocar el .json', up6.length === 1 && up6[0].payload.ruta === 'EURUSD/M1/2026.json.gz' && enDia(guardado('EURUSD/M1/2026').velas, '2026-07-20') === 1440 && db.storage['forex-data']['EURUSD/M1/2026.json'] === JSON.stringify(hist), `codigo ${ri.codigo} · ${up6.map(l => l.payload.ruta).join(' ')} · ${ri.salida.filter(l => /✓|✗/.test(l)).slice(0, 2).join(' | ')}`)
}

titulo('4 · guarda: un escritor que fuese a escribir .json donde ya hay .json.gz se niega')
const F = await importa('lib/mercado/ficheros.mjs').catch(() => ({ publicarAnio: async () => ({ estado: '(sin lib/mercado/ficheros.mjs)', problemas: [] }) }))
{
  escenario({ storage: { 'forex-data': { 'AUDUSD/M1/2026.json': JSON.stringify(velasDe('2026-01-05')), 'AUDUSD/M1/2026.json.gz': gz(velasDe('2026-01-05')) } } })
  const sb = createClient('https://falso.supabase.co', 'falsa')
  const r = await F.publicarAnio(sb, { pair: 'AUDUSD', year: 2026, componer: g => [...(g || []), ...velasDe('2026-01-06')], dueno: 'prueba', formato: 'json' })
  oraculo('MD03', 'formato .json con .json.gz presente: no sube nada, rechazado con el motivo y el cerrojo suelto', datos('upload').length === 0 && r.estado !== 'publicado' && /json\.gz/.test((r.problemas || []).join(' ')) && !Object.keys(db.storage['forex-data']).some(k => k.startsWith('_cerrojos/')), `${r.estado} · ${(r.problemas || []).join(' · ')}`)
  escenario({ storage: { 'forex-data': { 'AUDUSD/M1/2026.json': JSON.stringify(velasDe('2026-01-05')) } } })
  const sb2 = createClient('https://falso.supabase.co', 'falsa')
  const r2 = await F.publicarAnio(sb2, { pair: 'AUDUSD', year: 2026, componer: g => [...(g || []), ...velasDe('2026-01-06')], dueno: 'prueba', formato: 'json' })
  oraculo('MD03', 'control positivo de la guarda: sin .json.gz, el formato .json si publica', r2.estado === 'publicado' && datos('upload').some(l => l.payload.ruta === 'AUDUSD/M1/2026.json'), `${r2.estado} · ${(r2.problemas || []).join(' · ')}`)
  const usos = ['scripts/actualizar-diario.js', 'scripts/restore-2026.js', 'scripts/importar-csv.js', 'pages/api/candles.js'].filter(p => existsSync(REPO + p) && /formato\s*:\s*['"]json/.test(fuente(p)))
  oraculo('MD03', 'ningun escritor del repo pide el formato .json', usos.length === 0, usos.join(', '))
}

titulo('5 · el workflow manual: recuperar sin «unset MERCADO_GZIP»; el resto igual')
{
  const texto = fuente('.github/workflows/actualizar-velas.yml')
  const wf = YAML.parse(texto)
  const recup = (Object.values(wf.jobs)[0].steps || []).find(p => /recuperar/.test(String(p.if ?? '')))
  oraculo('MD03', 'el paso recuperar no hace unset de MERCADO_GZIP y nadie lo define en el workflow (escribe .json.gz por defecto)', !!recup && !/MERCADO_GZIP/.test(String(recup.run)) && !/MERCADO_GZIP\s*:/.test(texto), String(recup?.run ?? '').split('\n').filter(l => /GZIP|node /.test(l)).join(' | '))
  oraculo('MD03', 'recuperar sigue llamando igual: actualizar-diario --subir --pares "$PARES" con objetivo opcional', !!recup && /node scripts\/actualizar-diario\.js --subir --pares "\$PARES" \$\{OBJETIVO:\+--objetivo "\$OBJETIVO"\}/.test(String(recup.run)), '')
}
proveedor.responde = null
ver('control (H06): ningun script por timeout', ejecucionesScripts.every(e => e.terminoPor !== 'timeout'))
fin()
