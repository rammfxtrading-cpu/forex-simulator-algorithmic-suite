/**
 * BF05 · --pares Y COMO MUCHO DOS DESCARGAS DEL AÑO POR PAR
 * (bloque G, punto 11; CTO 6-oct-2026)
 *
 * Presupuesto de transferencia (CTO, 5-oct: hasta el 2-nov ningun objeto
 * anual sin autorizacion expresa). Astra (cierres-3): una pasada con algo que
 * publicar descargaba cada año CUATRO veces (lectura, relectura bajo cerrojo,
 * verificacion y estado final), y no habia forma de limitar los pares.
 * Decision del CTO: opcion --pares y verificacion de la publicacion por
 * metadatos mas hash local, de modo que cada par descargue su año como mucho
 * dos veces.
 *
 * Como (lib/mercado/ficheros.mjs, scripts/actualizar-diario.js):
 *   · lectura inicial: info() (firma: version, etag, tamaño) y la descarga (1)
 *   · bajo el cerrojo: info(); si la firma no cambio, se usa lo leido (sin
 *     descargar); si cambio, se relee (2)
 *   · la subida lleva en sus metadatos el sha256 del cuerpo (hash local)
 *   · verificacion: info(); sha256 de los metadatos = el local y tamaño = el
 *     subido. Si info no trae metadatos, se descarga SOLO si quedan descargas
 *     (como mucho 2); si no, «no verificado», visible.
 *   · el estado final no descarga (bloque G, punto 10).
 *
 * ORACULOS, a mano (hoy martes 3-feb-2026; nueve pares hasta el domingo 1-feb):
 *   --pares AUDUSD,GBPUSD: solo esos dos piden al proveedor y leen el bucket;
 *   un par que no existe → no se ejecuta nada. Con publicacion: el año de
 *   AUDUSD se descarga UNA vez y se verifica por metadatos (la subida lleva el
 *   sha256 del cuerpo). Si otro escritor cambia el año tras la lectura: se
 *   relee (2) y no se pierde lo suyo. El job imprime la transferencia que hizo
 *   (descargas y bytes de objetos anuales). Si otro escritor pisa justo despues de
 *   subir: no verificado. Si info no trae metadatos: se verifica descargando,
 *   y sigue en 2 como mucho.
 */
import { titulo, ver, oraculo, fin, escenario, proveedor, db, guardado } from '../lib.mjs'
import { createClient } from '../supabase-falso.mjs'
import { diaM1 } from '../proveedor-falso.mjs'
import { correScript, ejecucionesScripts } from '../script-falso.mjs'
import { createHash } from 'node:crypto'
const DIA = 86400000
const ENV = { NEXT_PUBLIC_SUPABASE_URL: 'https://falso.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'falsa' }
const NUEVE = ['EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'AUDUSD', 'USDCAD', 'NZDUSD', 'AUDCAD', 'GBPJPY']
const velasDe = (dia, n = 1440) => diaM1(dia, n).map(c => ({ time: c.timestamp / 1000, open: c.open, high: c.high, low: c.low, close: c.close, volume: 1 }))
const historial = hasta => { const v = []; for (let t = Date.parse('2026-01-02T00:00:00Z'); t <= Date.parse(hasta + 'T00:00:00Z'); t += DIA) { const w = new Date(t).getUTCDay(), d = new Date(t).toISOString().slice(0, 10); if (w >= 1 && w <= 5) v.push(...velasDe(d)); else if (w === 0) v.push(...velasDe(d).slice(22 * 60)) } return v }
const todos = () => Object.fromEntries(NUEVE.map(p => [`${p}/M1/2026.json`, JSON.stringify(historial('2026-02-01'))]))
const filas = dia => JSON.stringify(new Date(dia + 'T00:00:00Z').getUTCDay() === 0 ? diaM1(dia).slice(22 * 60) : diaM1(dia))
const corre = (argv = [], env = {}) => correScript('scripts/actualizar-diario.js', { ahora: '2026-02-03T06:00:00Z', argv: ['--subir', ...argv], env: { ...ENV, ...env } })
// descargas del año de un par, en cualquiera de los dos formatos (un 404 no es descarga)
const descargas = ruta => db.log.filter(l => l.op === 'download' && (l.payload === ruta || l.payload === ruta + '.gz') && l.encontrado !== false).length
const linea = (r, par) => r.salida.find(l => l.includes(`${par}/M1`)) ?? ''
const bien = () => { proveedor.http = (url, n, { dia }) => ({ status: 200, body: filas(dia) }) }
const AUD = 'AUDUSD/M1/2026.json'
// lo que publica el actualizador: desde el 9-oct (un solo formato) el .json.gz
const AUD_GZ = AUD + '.gz'
const esAUD = r => r === AUD || r === AUD_GZ

titulo('1 · --pares AUDUSD,GBPUSD')
escenario({ storage: { 'forex-data': todos() } }); bien()
const r1 = await corre(['--pares', 'AUDUSD,GBPUSD'])
const pares1 = [...new Set(proveedor.llamadas.map(l => l.instrumento.toUpperCase()))].sort()
const leidos1 = [...new Set(db.log.filter(l => l.op === 'download' && /\/M1\//.test(l.payload)).map(l => l.payload.slice(0, 6)))].sort()
oraculo('BF05', 'solo AUDUSD y GBPUSD piden al proveedor y leen su año', JSON.stringify(pares1) === '["AUDUSD","GBPUSD"]' && JSON.stringify(leidos1) === '["AUDUSD","GBPUSD"]', `proveedor: ${pares1.join(',')} · bucket: ${leidos1.join(',')}`)
oraculo('BF05', 'publican los dos y el veredicto habla solo de ellos', r1.salida.filter(l => /SUBIDO/.test(l)).length === 2 && !r1.salida.some(l => /^\s+EURUSD\s/.test(l)), r1.salida.filter(l => /SUBIDO|^\s+[A-Z]{6}\s/.test(l)).join(' | '))
escenario({ storage: { 'forex-data': todos() } }); bien()
const r1b = await corre(['--pares', 'AUDUSD,XXXYYY'])
oraculo('BF05', 'un par que no existe: no se ejecuta nada (ni proveedor ni bucket) y acaba con error', proveedor.llamadas.length === 0 && !db.log.some(l => l.op === 'download' || l.op === 'upload') && r1b.codigo !== 0 && r1b.salida.some(l => /XXXYYY/.test(l)), `codigo ${r1b.codigo} · ${proveedor.llamadas.length} llamadas · ${r1b.salida.slice(-2).join(' | ')}`)

titulo('2 · una publicacion: el año se descarga una vez y se verifica por metadatos')
escenario({ storage: { 'forex-data': todos() } }); bien()
const bytesAntes = Buffer.byteLength(db.storage['forex-data'][AUD])
const r2 = await corre(['--pares', 'AUDUSD'])
const sub2 = db.log.find(l => l.op === 'upload' && esAUD(l.payload?.ruta))
const RUTA2 = sub2?.payload?.ruta ?? AUD
const sha2 = createHash('sha256').update(db.storage['forex-data'][RUTA2] ?? '').digest('hex')
oraculo('BF05', 'AUDUSD publica el 2-feb y su año se descargo UNA sola vez en toda la pasada', /SUBIDO.*verificado/.test(linea(r2, 'AUDUSD')) && descargas(AUD) === 1, `${descargas(AUD)} descargas · ${linea(r2, 'AUDUSD')}`)
oraculo('BF05', 'el job dice la transferencia que hizo: 1 descarga y sus bytes exactos', r2.salida.some(l => new RegExp(`Transferencia.*: 1 descarga\\(s\\), ${bytesAntes} bytes`).test(l)), r2.salida.find(l => /Transferencia/.test(l)) ?? `(sin linea; esperados ${bytesAntes} bytes)`)
// CTO 6-oct: el job imprime los tiempos reales de Storage para ajustar los plazos
const tiempos2 = r2.salida.find(l => /Tiempos de Storage/.test(l)) ?? ''
oraculo('BF05', 'el job imprime los tiempos reales de Storage por tipo (lectura, subida, info, cerrojo) con sus plazos', /plazos 20000\/120000/.test(tiempos2) && /lectura \d+× max \d+/.test(tiempos2) && /subida 1× max \d+/.test(tiempos2) && /info \d+× max \d+/.test(tiempos2) && /cerrojo \d+× max \d+/.test(tiempos2), tiempos2 || '(sin linea)')
oraculo('BF05', 'la subida lleva el sha256 del cuerpo en sus metadatos (hash local)', db.metadatos?.['forex-data']?.[RUTA2]?.sha256 === sha2, JSON.stringify(db.metadatos?.['forex-data']?.[RUTA2] ?? null))

titulo('3 · otro escritor cambia el año despues de la lectura inicial')
escenario({ storage: { 'forex-data': todos() } })
const otro = createClient('https://falso.supabase.co', 'falsa')
let pisado = false
proveedor.http = async (url, n, { instrumento, dia }) => {
  // mientras AUDUSD baja el 2-feb, otro escritor añade un domingo 25-ene distinto (mas velas que las guardadas)
  if (instrumento === 'audusd' && !pisado) { pisado = true; const v = JSON.parse(db.storage['forex-data'][AUD]).filter(x => !new Date(x.time * 1000).toISOString().startsWith('2026-01-25')); v.push(...velasDe('2026-01-25').slice(21 * 60)); v.sort((a, b) => a.time - b.time); await otro.storage.from('forex-data').upload(AUD, JSON.stringify(v), { upsert: true }) }
  return { status: 200, body: filas(dia) }
}
const r3 = await corre(['--pares', 'AUDUSD'])
const g3 = guardado('AUDUSD/M1/2026').velas ?? []
const en = (arr, d) => arr.filter(v => new Date(v.time * 1000).toISOString().startsWith(d)).length
oraculo('BF05', 'firma distinta bajo el cerrojo: se relee (2 descargas) y se publica sin perder lo del otro escritor', descargas(AUD) === 2 && en(g3, '2026-01-25') === 180 && en(g3, '2026-02-02') === 1440, `${descargas(AUD)} descargas · 25-ene ${en(g3, '2026-01-25')} · 2-feb ${en(g3, '2026-02-02')} · ${linea(r3, 'AUDUSD')}`)

titulo('4 · otro escritor pisa justo despues de la subida')
escenario({ storage: { 'forex-data': todos() } }); bien()
let pisa = false
db.trasAplicar = async c => { if (esAUD(c.payload) && !pisa) { pisa = true; await otro.storage.from('forex-data').upload(c.payload, JSON.stringify(historial('2026-01-30')), { upsert: true }) } }
const r4 = await corre(['--pares', 'AUDUSD'])
db.trasAplicar = null
oraculo('BF05', 'la verificacion por metadatos lo detecta: «no verificado» (codigo 1), y sin descargar mas de dos veces', /PUBLICACION/.test(linea(r4, 'AUDUSD')) && /no verificado/.test(linea(r4, 'AUDUSD')) && r4.codigo === 1 && descargas(AUD) <= 2, `${descargas(AUD)} descargas · codigo ${r4.codigo} · ${linea(r4, 'AUDUSD')}`)

titulo('5 · info() sin metadatos')
escenario({ storage: { 'forex-data': todos() } }); bien()
db.infoSinMetadatos = true
const r5 = await corre(['--pares', 'AUDUSD'])
db.infoSinMetadatos = false
oraculo('BF05', 'sin metadatos en info se verifica descargando, y el año sigue en 2 descargas como mucho', /SUBIDO.*verificado/.test(linea(r5, 'AUDUSD')) && descargas(AUD) === 2, `${descargas(AUD)} descargas · ${linea(r5, 'AUDUSD')}`)
proveedor.http = null
ver('control (H06): ningun script por timeout', ejecucionesScripts.every(e => e.terminoPor !== 'timeout'))
fin()
