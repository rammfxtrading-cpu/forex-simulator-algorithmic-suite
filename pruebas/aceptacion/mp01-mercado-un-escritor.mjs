/**
 * MP01 · MERCADO: UN SOLO CAMINO DE ESCRITURA (bloque D, punto 1; CTO 5-oct-2026)
 *
 * Astra (revision de cierres, 5-oct) reprodujo tres carreras entre escritores
 * del bucket forex-data:
 *   D04  /api/candles lee «no existe», reconstruye desde el proveedor y, justo
 *        antes de subir, otro escritor publica una version MEJOR: la pisa.
 *   D05  el actualizador lee lo guardado, baja dias y, antes de subir, otro
 *        escritor publica algo mejor: sube su composicion vieja y lo pierde.
 *   O01  restore lee 100 velas, prepara el año y otro escritor publica una
 *        version mejor antes del upsert: acaba en «exito» con menos velas.
 * Y dos fronteras: restore tolera dias laborables ausentes por CANTIDAD (2) y
 * acepta un JSON guardado que no es una lista; el actualizador publica OHLC
 * imposible.
 *
 * Decision del CTO (el contrato que se comprueba):
 *   · /api/candles NO escribe ni reconstruye desde el proveedor: solo lee
 *     Storage; si falta el objeto, 503 con mensaje.
 *   · escriben solo scripts/actualizar-diario.js y scripts/restore-2026.js,
 *     con UNA funcion comun de publicacion: valida forma (lista, OHLC,
 *     unicidad) y cobertura; RELEE justo antes de subir y compone sobre lo
 *     releido; nunca publica menos velas que las guardadas (por dia);
 *     VERIFICA despues de subir.
 *   · el workflow lleva grupo de concurrencia.
 * Ademas (añadido, ver cierres): un cerrojo por par y año creado con
 * «crear si no existe» (upload sin upsert: 409 si existe), porque storage-js no
 * tiene escritura condicional y releer + verificar deja una ventana entre dos
 * escritores. La seccion 4 lo prueba con dos publicaciones simultaneas.
 *
 * Las carreras se reproducen con un «otro escritor» que publica ENTRE la
 * lectura y la subida (durante la descarga del proveedor). Contra c470c8f y
 * contra e07b849/7342403 sale en rojo.
 */
import { titulo, ver, oraculo, fin, escenario, perfil, A, tok, proveedor, importa, db, guardado, fuente } from '../lib.mjs'
import { llama, createClient } from '../supabase-falso.mjs'
import { diaM1 } from '../proveedor-falso.mjs'
import { correScript, ejecucionesScripts } from '../script-falso.mjs'

const DIA = 86400000
const ENV = { NEXT_PUBLIC_SUPABASE_URL: 'https://falso.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'falsa' }
const velasDe = (dia, n = 1440) => diaM1(dia, n).map(c => ({ time: c.timestamp / 1000, open: c.open, high: c.high, low: c.low, close: c.close, volume: 1 }))
const laborables = (desde, hasta) => { const d = []; for (let t = Date.parse(desde + 'T00:00:00Z'); t <= Date.parse(hasta + 'T00:00:00Z'); t += DIA) { const w = new Date(t).getUTCDay(); if (w >= 1 && w <= 5) d.push(new Date(t).toISOString().slice(0, 10)) } return d }
const enDia = (arr, dia) => (arr || []).filter(v => new Date(v.time * 1000).toISOString().startsWith(dia)).length
const ops = op => db.log.filter(l => l.op === op)
const subidasDe = prefijo => ops('upload').filter(l => l.payload.ruta.startsWith(prefijo))
const diaDe = args => args.dates.from.toISOString().slice(0, 10)
// el otro escritor publica en el formato que lea el codigo probado: el .json
// (todos los lectores lo leen si no hay .json.gz)
const publicaOtro = (ruta, velas) => { db.storage['forex-data'][ruta] = JSON.stringify(velas) }

titulo('1 · D04: /api/candles con el objeto ausente')
escenario({ perfiles: [perfil(A)] })
proveedor.responde = () => diaM1('2026-01-05')
const candles = (await importa('pages/api/candles.js')).default
const r1 = await llama(candles, { method: 'GET', token: tok(A), query: { pair: 'GBPJPY', timeframe: 'M1', from: String(Date.UTC(2025, 0, 6) / 1000), to: String(Date.UTC(2025, 0, 7) / 1000), year: '2025' } })
ver('control: el handler respondio', typeof r1.estado === 'number', r1.estado)
oraculo('MP01', 'falta el objeto: 503 con mensaje', r1.estado === 503 && typeof r1.cuerpo?.error === 'string' && r1.cuerpo.error.length > 10, `estado ${r1.estado}: ${r1.cuerpo?.error ?? '-'}`)
oraculo('MP01', 'sin ir al proveedor ni escribir en Storage', proveedor.llamadas.length === 0 && ops('upload').length === 0, `${proveedor.llamadas.length} llamadas al proveedor, ${ops('upload').length} subidas`)
oraculo('MP01', 'y su fuente no tiene ninguna escritura ni proveedor', !/\.upload\(|getHistoricalRates/.test(fuente('pages/api/candles.js')))

titulo('2 · D05: el actualizador y otro escritor que publica entre su lectura y su subida')
// guardado: 2-ene a 30-ene completo salvo el 30 (720). Hoy 4-feb: pide 30-ene, 2-feb y 3-feb.
const base2 = laborables('2026-01-02', '2026-01-29').flatMap(d => velasDe(d))
escenario({ storage: { 'forex-data': { 'EURUSD/M1/2026.json': JSON.stringify([...base2, ...velasDe('2026-01-30', 720)]) } } })
// el proveedor da el 3-feb a medias (500); el otro escritor ya lo tenia completo
proveedor.responde = args => {
  const d = diaDe(args)
  if (args.instrument === 'eurusd' && d === '2026-02-02') publicaOtro('EURUSD/M1/2026.json', [...base2, ...velasDe('2026-01-30'), ...velasDe('2026-02-02'), ...velasDe('2026-02-03')])
  return diaM1(d, d === '2026-02-03' ? 500 : 1440)
}
const s2 = await correScript('scripts/actualizar-diario.js', { ahora: '2026-02-04T06:00:00Z', argv: ['--subir'], env: ENV })
ver('control: el script no abrio ningun .env real', s2.envLeidos.length === 0)
ver('control: el actualizador subio EURUSD (en el formato que sea)', subidasDe('EURUSD/M1/2026.json').length >= 1, subidasDe('EURUSD/').map(l => l.payload.ruta).join(' '))
const g2 = guardado('EURUSD/M1/2026').velas
oraculo('MP01', 'no pierde el 3-feb completo del otro escritor (1.440, no 500)', enDia(g2, '2026-02-03') === 1440, `3-feb queda con ${enDia(g2, '2026-02-03')} velas`)
oraculo('MP01', 'y conserva lo suyo (30-ene completo)', enDia(g2, '2026-01-30') === 1440, `30-ene: ${enDia(g2, '2026-01-30')}`)

titulo('3 · O01: restore y otro escritor que publica antes del upsert')
const enero = (hasta, n = d => 1440) => laborables('2026-01-01', hasta).filter(d => d !== '2026-01-01').flatMap(d => velasDe(d, n(d)))
escenario({ storage: { 'forex-data': { 'EURUSD/M1/2026.json': JSON.stringify(velasDe('2026-01-05', 100)) } } })
proveedor.responde = args => {
  if (args.instrument === 'eurusd') publicaOtro('EURUSD/M1/2026.json', enero('2026-01-15'))                // 15.840 velas, el 14 completo
  return diaM1Rango(args, d => args.instrument === 'eurusd' && d === '2026-01-14' ? 1300 : 1440)        // restore: el 14 con 1.300
}
function diaM1Rango({ dates }, n) { const out = []; for (let t = Date.UTC(2026, 0, 2); t < dates.to.getTime(); t += DIA) { const d = new Date(t); if (d.getUTCDay() % 6) out.push(...diaM1(d.toISOString().slice(0, 10), n(d.toISOString().slice(0, 10)))) } return out }
const s3 = await correScript('scripts/restore-2026.js', { ahora: '2026-01-16T12:00:00Z', argv: ['--subir'] })
ver('control: restore pidio EURUSD al proveedor', proveedor.llamadas.some(l => l.instrumento === 'eurusd'))
const g3 = guardado('EURUSD/M1/2026').velas
oraculo('MP01', 'restore no deja el 14-ene con menos velas que el otro escritor (1.440)', enDia(g3, '2026-01-14') === 1440, `14-ene queda con ${enDia(g3, '2026-01-14')}; ${g3?.length} velas en total`)
oraculo('MP01', 'y no acaba en exito: codigo distinto de cero', (s3.exitCode ?? 0) !== 0, `codigo ${s3.exitCode ?? 0}`)

titulo('4 · dos publicaciones a la vez, las dos por la funcion comun')
// La ventana que releer + verificar no cierra: B relee antes de que A suba y
// sube despues. Sin exclusion, la segunda pisa a la primera.
let mod = null
try { mod = await importa('lib/mercado/ficheros.mjs') } catch { mod = null }
escenario({ storage: { 'forex-data': { 'USDJPY/M1/2026.json': JSON.stringify(laborables('2026-01-02', '2026-01-29').flatMap(d => velasDe(d))) } } })
const masDia = dia => g => [...(g || []), ...velasDe(dia)].sort((a, b) => a.time - b.time)
let resA = null, resB = null
if (mod?.publicarAnio) {
  const sb = createClient(ENV.NEXT_PUBLIC_SUPABASE_URL, ENV.SUPABASE_SERVICE_ROLE_KEY)
  // El orden peligroso: A va a subir; ANTES de que su subida llegue, arranca B.
  // Sin exclusion, B releeria y subiria encima. Con el cerrojo (bloque E: sin
  // espera ni caducidad), B no relee: termina «ocupado», visible, sin subir.
  let lanzadaB = null, releyoB = false, aSubio = false
  const ahoraMs = Date.parse('2026-02-04T06:00:00Z')
  const tic = () => new Promise(r => setImmediate(r))
  db.pausa = async c => {
    if (c.op !== 'upload' || !/^USDJPY\/M1\/2026\.json(\.gz)?$/.test(c.payload.ruta)) return     // .json (por defecto) o .json.gz (MERCADO_GZIP=1)
    if (!lanzadaB) {
      lanzadaB = mod.publicarAnio(sb, { pair: 'USDJPY', year: 2026, dueno: 'B', ahoraMs,
        componer: g => { releyoB = true; return masDia('2026-02-02')(g) } }).then(r => { resB = r })
      for (let i = 0; i < 300 && !releyoB; i++) await tic()
      aSubio = true
    } else if (!aSubio) {
      for (let i = 0; i < 300 && !aSubio; i++) await tic()          // B no sube antes que A
    }
  }
  resA = await mod.publicarAnio(sb, { pair: 'USDJPY', year: 2026, dueno: 'A', ahoraMs, componer: masDia('2026-01-30') })
  await lanzadaB
  db.pausa = null
  ver('control: B se lanzo mientras A subia', !!lanzadaB && resB != null)
} else {
  // sin funcion comun: dos escritores que leen y suben por su cuenta
  const leido = JSON.parse(db.storage['forex-data']['USDJPY/M1/2026.json'])
  publicaOtro('USDJPY/M1/2026.json', masDia('2026-01-30')(leido))
  publicaOtro('USDJPY/M1/2026.json', masDia('2026-02-02')(leido))
}
const g4 = guardado('USDJPY/M1/2026').velas
// nada se pierde EN SILENCIO: o quedan las dos, o la que no publica lo dice
// (ocupado, con dueño) y no ha pisado a la otra
const ambas = enDia(g4, '2026-01-30') === 1440 && enDia(g4, '2026-02-02') === 1440
const bVisible = resB?.estado === 'ocupado' && resB.problemas?.some(p => /A:/.test(p)) && enDia(g4, '2026-01-30') === 1440 && resA?.estado === 'publicado'
oraculo('MP01', 'ninguna se pierde en silencio: quedan las dos, o B falla «ocupado» (dueño A) sin pisar el 30-ene de A', ambas || bVisible,
  `30-ene ${enDia(g4, '2026-01-30')}, 2-feb ${enDia(g4, '2026-02-02')}; A: ${resA?.estado ?? '-'}, B: ${resB?.estado ?? '-'}`)

titulo('5 · verificacion despues de subir: lo que queda no es lo subido')
const base5 = laborables('2026-01-02', '2026-01-30').flatMap(d => velasDe(d))
escenario({ storage: { 'forex-data': { 'AUDUSD/M1/2026.json': JSON.stringify(base5) } } })
proveedor.responde = args => diaM1(diaDe(args))
// justo despues de la subida de AUDUSD, alguien que no usa la funcion comun lo pisa
let pisado = false
db.pausa = async c => {
  if (!pisado && c.op === 'download' && String(c.payload).startsWith('AUDUSD/') && ops('upload').some(l => l.payload.ruta.startsWith('AUDUSD/M1/2026.json'))) {
    pisado = true
    for (const r of Object.keys(db.storage['forex-data'])) if (r.startsWith('AUDUSD/M1/2026.json')) delete db.storage['forex-data'][r]
    publicaOtro('AUDUSD/M1/2026.json', base5.slice(0, 1000))
  }
}
const s5 = await correScript('scripts/actualizar-diario.js', { ahora: '2026-02-04T06:00:00Z', argv: ['--subir'], env: ENV })
db.pausa = null
ver('control: hubo subida de AUDUSD y despues se piso', pisado, s5.salida.find(l => /AUDUSD/.test(l)) ?? '')
oraculo('MP01', 'el actualizador lo detecta: AUDUSD sale con ✗ (no verificado)', s5.salida.some(l => /AUDUSD/.test(l) && /✗/.test(l)) || s5.salida.some(l => /✗.*AUDUSD/.test(l)), s5.salida.filter(l => /AUDUSD/.test(l)).join(' | '))
oraculo('MP01', 'y acaba con codigo distinto de cero', (s5.exitCode ?? 0) !== 0, `codigo ${s5.exitCode ?? 0}`)

titulo('6 · D03 en el actualizador: un dia con OHLC imposible no se publica')
escenario({ storage: { 'forex-data': { 'NZDUSD/M1/2026.json': JSON.stringify(laborables('2026-01-02', '2026-02-02').flatMap(d => velasDe(d))) } } })
proveedor.responde = args => { const d = diaDe(args); const v = diaM1(d); if (args.instrument === 'nzdusd' && d === '2026-02-03') v[10] = { ...v[10], high: 0.5 }; return v }
await correScript('scripts/actualizar-diario.js', { ahora: '2026-02-04T06:00:00Z', argv: ['--subir'], env: ENV })
const g6 = guardado('NZDUSD/M1/2026').velas
ver('control: el proveedor dio el 3-feb de NZDUSD', proveedor.llamadas.some(l => l.instrumento === 'nzdusd' && l.desde.startsWith('2026-02-03')))
oraculo('MP01', 'no queda publicada ninguna vela con high < max(open, close)', g6.every(v => v.high >= Math.max(v.open, v.close) && v.low <= Math.min(v.open, v.close)), `${g6.filter(v => v.high < Math.max(v.open, v.close)).length} velas imposibles publicadas`)

titulo('7 · O01: restore con dias laborables ausentes y con un JSON que no es lista')
escenario({ storage: { 'forex-data': {} } })
// el fixture de Astra: 1, 2 y 5 de enero completos; faltan el 6 y el 7
proveedor.responde = args => args.instrument === 'eurusd' ? [...diaM1('2026-01-01'), ...diaM1('2026-01-02'), ...diaM1('2026-01-05')] : diaM1Rango(args, () => 1440)
const s7 = await correScript('scripts/restore-2026.js', { ahora: '2026-01-08T12:00:00Z', argv: ['--subir'] })
oraculo('MP01', 'con el 6 y el 7 de enero ausentes, EURUSD no se publica', !guardado('EURUSD/M1/2026').velas, `EURUSD: ${guardado('EURUSD/M1/2026').velas?.length ?? 'sin fichero'}`)
oraculo('MP01', 'y restore acaba con codigo distinto de cero', (s7.exitCode ?? 0) !== 0, `codigo ${s7.exitCode ?? 0}`)
escenario({ storage: { 'forex-data': { 'GBPUSD/M1/2026.json': '{"velas":[]}' } } })
proveedor.responde = args => diaM1Rango(args, () => 1440)
await correScript('scripts/restore-2026.js', { ahora: '2026-01-08T12:00:00Z', argv: ['--subir'] })
oraculo('MP01', 'un guardado que no es una lista no se sobrescribe a ciegas', db.storage['forex-data']['GBPUSD/M1/2026.json'] === '{"velas":[]}' && !subidasDe('GBPUSD/').length, `${subidasDe('GBPUSD/').length} subidas de GBPUSD`)

titulo('8 · quien puede escribir')
const yml = fuente('.github/workflows/actualizar-velas.yml')
ver('control: el workflow tiene grupo de concurrencia sin cancelar la ejecucion en curso', /concurrency:\s*\n\s*group:\s*\S+/.test(yml) && /cancel-in-progress:\s*false/.test(yml))
const escritores = ['scripts/actualizar-diario.js', 'scripts/restore-2026.js', 'scripts/subir-a-supabase.js', 'scripts/listar-bucket.js', 'pages/api/candles.js']
  .filter(f => { try { return /\.upload\(/.test(fuente(f)) } catch { return false } })
oraculo('MP01', 'ningun script ni la API sube por su cuenta (solo la funcion comun)', escritores.length === 0, escritores.join(', '))

ver('control (H06): todos los scripts terminaron (veredicto o exit), ninguno por timeout', ejecucionesScripts.length > 0 && ejecucionesScripts.every(e => e.terminoPor !== 'timeout'), JSON.stringify(ejecucionesScripts.map(e => e.terminoPor + ':' + e.codigo)))
fin()
