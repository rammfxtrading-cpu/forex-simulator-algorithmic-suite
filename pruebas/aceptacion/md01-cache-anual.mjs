/**
 * MD01 · CACHE DE LOS FICHEROS ANUALES Y TOPE DE DESCARGA
 * (mercado diario, parte 1; CTO 9-oct-2026)
 *
 * Diseño decidido por el CTO: la actualizacion diaria desde Actions no
 * descarga el año entero cada dia. Guarda una copia del fichero anual (cache
 * de Actions; aqui, la carpeta de MERCADO_CACHE) y, antes de usarla, comprueba
 * con info() (sin descargar) que su huella coincide con la del objeto en
 * Storage; solo si no coincide, descarga. El log dice los bytes descargados.
 * Tope de descarga por ejecucion (MERCADO_TOPE_BYTES): una descarga que lo
 * pasaria no se hace.
 *
 * Huella de la copia: ruta, firma de info() (version|etag|tamaño) y sha256
 * de sus bytes; si info() trae metadata.sha256, tambien tiene que coincidir.
 * La copia se escribe al descargar y despues de publicar (el cuerpo subido y
 * la firma de la verificacion), asi el dia siguiente no descarga nada.
 *
 * ORACULOS, a mano (hoy martes 3-feb-2026; AUDUSD hasta el domingo 1-feb):
 *   1. primera pasada con la cache vacia: 1 descarga (los bytes exactos del
 *      objeto) y publica el 2-feb; segunda pasada el mismo dia: 0 descargas,
 *      al dia; tercera, el miercoles 4-feb: 0 descargas y publica el 3-feb.
 *   2. otro escritor cambia el objeto: firma distinta → 1 descarga, y lo del
 *      otro escritor (25-ene con 180 velas) se conserva.
 *   3. copia local estropeada con la firma buena: no se usa (1 descarga).
 *   4. tope por debajo del tamaño del objeto: 0 descargas, nada al proveedor,
 *      nada subido, codigo 3, «tope de descarga» en el log; con el tope justo
 *      en el tamaño, descarga (control positivo). La relectura bajo el
 *      cerrojo tambien respeta el tope.
 *   5. sin MERCADO_CACHE ni tope: como siempre (1 descarga, sin copia).
 */
import { titulo, ver, oraculo, fin, escenario, proveedor, db, guardado } from '../lib.mjs'
import { createClient } from '../supabase-falso.mjs'
import { diaM1 } from '../proveedor-falso.mjs'
import { correScript, ejecucionesScripts } from '../script-falso.mjs'
import fs from 'node:fs'
import { gzipSync, gunzipSync } from 'node:zlib'
import os from 'node:os'
import path from 'node:path'
const DIA = 86400000
const ENV = { NEXT_PUBLIC_SUPABASE_URL: 'https://falso.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'falsa' }
const velasDe = (dia, n = 1440) => diaM1(dia, n).map(c => ({ time: c.timestamp / 1000, open: c.open, high: c.high, low: c.low, close: c.close, volume: 1 }))
const historial = hasta => { const v = []; for (let t = Date.parse('2026-01-02T00:00:00Z'); t <= Date.parse(hasta + 'T00:00:00Z'); t += DIA) { const w = new Date(t).getUTCDay(), d = new Date(t).toISOString().slice(0, 10); if (w >= 1 && w <= 5) v.push(...velasDe(d)); else if (w === 0) v.push(...velasDe(d).slice(22 * 60)) } return v }
const AUD = 'AUDUSD/M1/2026.json'
const inicial = () => ({ [AUD]: JSON.stringify(historial('2026-02-01')) })
const filas = dia => JSON.stringify(new Date(dia + 'T00:00:00Z').getUTCDay() === 0 ? diaM1(dia).slice(22 * 60) : diaM1(dia))
const bien = () => { proveedor.http = (url, n, { dia }) => ({ status: 200, body: filas(dia) }) }
const corre = (env = {}, ahora = '2026-02-03T06:00:00Z') => correScript('scripts/actualizar-diario.js', { ahora, argv: ['--subir', '--pares', 'AUDUSD'], env: { ...ENV, ...env } })
// el año en cualquiera de los dos formatos (desde el 9-oct se publica .json.gz); un 404 no es descarga
const esAUD = r => r === AUD || r === AUD + '.gz'
const descargas = () => db.log.filter(l => l.op === 'download' && esAUD(l.payload) && l.encontrado !== false).length
const subidas = () => db.log.filter(l => l.op === 'upload' && esAUD(l.payload?.ruta)).length
const vigente = () => (Object.hasOwn(db.storage['forex-data'], AUD + '.gz') ? AUD + '.gz' : AUD)
const linea = r => r.salida.find(l => l.includes('AUDUSD/M1')) ?? ''
const transf = r => r.salida.find(l => /Transferencia/.test(l)) ?? '(sin linea de transferencia)'
const en = (arr, d) => arr.filter(v => new Date(v.time * 1000).toISOString().startsWith(d)).length
const nuevaCache = () => fs.mkdtempSync(path.join(os.tmpdir(), 'md01-cache-'))
const ficheros = dir => fs.readdirSync(dir).filter(f => !f.startsWith('.')).sort()

titulo('0 · control del contador: una descarga que da 404 no cuenta')
escenario({ storage: { 'forex-data': inicial() } })
await createClient('https://falso.supabase.co', 'falsa').storage.from('forex-data').download('AUDUSD/M1/1999.json')
await createClient('https://falso.supabase.co', 'falsa').storage.from('forex-data').download(AUD)
ver('control: el doble marca el 404 (encontrado: false) y no la descarga real', db.log.filter(l => l.op === 'download').map(l => l.encontrado !== false).join() === 'false,true', JSON.stringify(db.log.filter(l => l.op === 'download').map(l => [l.payload, l.encontrado])))

titulo('1 · copia valida: no se descarga')
const C1 = nuevaCache()
escenario({ storage: { 'forex-data': inicial() } }); bien()
const tam1 = Buffer.byteLength(db.storage['forex-data'][AUD])
const a = await corre({ MERCADO_CACHE: C1 })
oraculo('MD01', 'cache vacia: el año se descarga una vez, el log dice sus bytes exactos y publica el 2-feb', descargas() === 1 && /SUBIDO.*verificado/.test(linea(a)) && new RegExp(`: 1 descarga\\(s\\), ${tam1} bytes`).test(transf(a)), `${descargas()} descargas · ${transf(a)} · ${linea(a)}`)
oraculo('MD01', 'tras publicar queda la copia del año en la carpeta de la cache', ficheros(C1).some(f => /AUDUSD_2026/.test(f)), ficheros(C1).join(', ') || '(vacia)')
db.log.length = 0; bien()
const b = await corre({ MERCADO_CACHE: C1 })
oraculo('MD01', 'misma huella (info, sin descargar): 0 descargas y al dia; el log dice 0 bytes', descargas() === 0 && /al dia/.test(linea(b)) && /: 0 descarga\(s\), 0 bytes/.test(transf(b)) && b.codigo === 0, `${descargas()} descargas · codigo ${b.codigo} · ${transf(b)} · ${linea(b)}`)
oraculo('MD01', 'el log dice que el año salio de la cache, con 0 bytes', b.salida.some(l => /AUDUSD 2026.*cache valida.*0 bytes/i.test(l)), b.salida.filter(l => /cache/i.test(l)).join(' | ') || '(sin linea de cache)')
db.log.length = 0; bien()
const c = await corre({ MERCADO_CACHE: C1 }, '2026-02-04T06:00:00Z')
const g1 = guardado('AUDUSD/M1/2026').velas ?? []
oraculo('MD01', 'dia siguiente: 0 descargas y publica el 3-feb sobre la copia (el 2-feb sigue entero)', descargas() === 0 && subidas() === 1 && en(g1, '2026-02-03') === 1440 && en(g1, '2026-02-02') === 1440, `${descargas()} descargas · ${subidas()} subidas · 2-feb ${en(g1, '2026-02-02')} · 3-feb ${en(g1, '2026-02-03')} · ${linea(c)}`)

titulo('2 · otro escritor cambia el objeto: huella distinta, se descarga')
{
  const otro = createClient('https://falso.supabase.co', 'falsa')
  // el otro escritor cambia lo VIGENTE (tras la seccion 1, el .json.gz)
  const R = vigente(), crudo = Buffer.from(db.storage['forex-data'][R]), gz = crudo[0] === 0x1f && crudo[1] === 0x8b
  const v = JSON.parse((gz ? gunzipSync(crudo) : crudo).toString('utf8')).filter(x => !new Date(x.time * 1000).toISOString().startsWith('2026-01-25'))
  v.push(...velasDe('2026-01-25').slice(21 * 60)); v.sort((p, q) => p.time - q.time)
  await otro.storage.from('forex-data').upload(R, gz ? gzipSync(Buffer.from(JSON.stringify(v))) : JSON.stringify(v), { upsert: true })
  const tam = Buffer.byteLength(db.storage['forex-data'][R])
  db.log.length = 0; bien()
  const d = await corre({ MERCADO_CACHE: C1 }, '2026-02-05T06:00:00Z')
  const g = guardado('AUDUSD/M1/2026').velas ?? []
  oraculo('MD01', 'firma distinta: 1 descarga con los bytes del objeto nuevo, y lo del otro escritor se conserva al publicar el 4-feb', descargas() === 1 && new RegExp(`: 1 descarga\\(s\\), ${tam} bytes`).test(transf(d)) && en(g, '2026-01-25') === 180 && en(g, '2026-02-04') === 1440, `${descargas()} descargas · ${transf(d)} · 25-ene ${en(g, '2026-01-25')} · 4-feb ${en(g, '2026-02-04')}`)
  oraculo('MD01', 'el log dice que la huella no coincidia y cuantos bytes se descargaron', d.salida.some(l => new RegExp(`AUDUSD 2026.*huella distinta.*${tam} bytes`, 'i').test(l)), d.salida.filter(l => /cache/i.test(l)).join(' | ') || '(sin linea de cache)')
}

titulo('3 · copia estropeada con la firma buena: no se usa')
{
  const datos = ficheros(C1).filter(f => /AUDUSD_2026/.test(f) && !/firma|meta/.test(f))
  if (datos.length === 1) { const p = path.join(C1, datos[0]); const x = fs.readFileSync(p); x[x.length - 2] ^= 0xff; fs.writeFileSync(p, x) }
  db.log.length = 0; bien()
  const e = await corre({ MERCADO_CACHE: C1 }, '2026-02-05T06:00:00Z')
  oraculo('MD01', 'los bytes de la copia (estropeada a proposito) no dan su sha256: se descarga (1) y se sigue bien', datos.length === 1 && descargas() === 1 && /al dia/.test(linea(e)) && e.codigo === 0, `copia: ${ficheros(C1).join(', ') || '(vacia)'} · ${descargas()} descargas · codigo ${e.codigo} · ${linea(e)}`)
}

titulo('4 · tope de descarga')
{
  escenario({ storage: { 'forex-data': inicial() } }); bien()
  const tam = Buffer.byteLength(db.storage['forex-data'][AUD])
  const f = await corre({ MERCADO_CACHE: nuevaCache(), MERCADO_TOPE_BYTES: String(tam - 1) })
  oraculo('MD01', 'tope 1 byte por debajo del objeto: 0 descargas, nada al proveedor, nada subido, codigo 3 y «tope de descarga» en el log', descargas() === 0 && proveedor.llamadas.length === 0 && subidas() === 0 && f.codigo === 3 && f.salida.some(l => /tope de descarga/i.test(l)), `${descargas()} descargas · ${proveedor.llamadas.length} llamadas · ${subidas()} subidas · codigo ${f.codigo} · ${linea(f)}`)
  oraculo('MD01', 'con el tope, el estado de los datos no lo da por «no legible» (sin comprobar)', !f.salida.some(l => /no legible/.test(l)) && f.salida.some(l => /AUDUSD.*sin comprobar.*tope/i.test(l)), f.salida.filter(l => /AUDUSD/.test(l)).join(' | '))
  escenario({ storage: { 'forex-data': inicial() } }); bien()
  const g = await corre({ MERCADO_CACHE: nuevaCache(), MERCADO_TOPE_BYTES: String(tam) })
  oraculo('MD01', 'control positivo: con el tope justo en el tamaño, descarga y publica', descargas() === 1 && /SUBIDO/.test(linea(g)) && g.codigo === 0, `${descargas()} descargas · codigo ${g.codigo} · ${linea(g)}`)
  // relectura bajo el cerrojo: otro escritor cambia el objeto mientras se baja el 2-feb. Con el 1-ene
  // guardado (si no, ese dia interior pendiente sin reparar daria el codigo 1, que manda sobre el 3)
  escenario({ storage: { 'forex-data': { [AUD]: JSON.stringify([...velasDe('2026-01-01'), ...historial('2026-02-01')]) } } })
  const otro = createClient('https://falso.supabase.co', 'falsa')
  let pisado = false
  proveedor.http = async (url, n, { dia }) => {
    if (!pisado) { pisado = true; const v = JSON.parse(db.storage['forex-data'][AUD]); v.pop(); await otro.storage.from('forex-data').upload(AUD, JSON.stringify(v), { upsert: true }) }
    return { status: 200, body: filas(dia) }
  }
  const h = await corre({ MERCADO_CACHE: nuevaCache(), MERCADO_TOPE_BYTES: String(Buffer.byteLength(db.storage['forex-data'][AUD]) + 1000) })
  // (la unica subida es la del otro escritor)
  oraculo('MD01', 'la relectura bajo el cerrojo tambien respeta el tope: 1 descarga, nada subido por el actualizador, codigo 3', descargas() === 1 && subidas() === 1 && h.codigo === 3 && h.salida.some(l => /tope de descarga/i.test(l)), `${descargas()} descargas · ${subidas()} subidas · codigo ${h.codigo} · ${linea(h)}`)
}

titulo('5 · sin cache ni tope: como siempre')
{
  escenario({ storage: { 'forex-data': inicial() } }); bien()
  const k = await corre()
  db.log.length = 0; bien()
  const k2 = await corre()
  oraculo('MD01', 'sin MERCADO_CACHE la segunda pasada vuelve a descargar (1): el modo manual no cambia', descargas() === 1 && /al dia/.test(linea(k2)) && k.codigo === 0 && k2.codigo === 0, `${descargas()} descargas · ${linea(k2)}`)
}
proveedor.http = null
ver('control (H06): ningun script por timeout', ejecucionesScripts.every(e => e.terminoPor !== 'timeout'))
fin()
