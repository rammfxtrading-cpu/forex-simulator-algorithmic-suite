/**
 * MD04 · ARRANQUE DEL FORMATO UNICO: LOS .json DE 2026 → .json.gz, UNA VEZ,
 * DESDE EL MAC (CTO 9-oct-2026, punto 5; preparado, NO ejecutado)
 *
 * scripts/arranque-gzip.js:
 *   sin --subir (SECO): solo info() de cada par (sin descargar): dice que haria;
 *   --subir: por par, si ya hay .json.gz, nada; si no, baja el .json (una vez)
 *   y publica el .json.gz con el publicador comun (publicarAnio: cerrojo,
 *   relectura si cambio, validacion, subida con sha256 en los metadatos y
 *   verificacion). Comprueba ademas que lo publicado son exactamente las velas
 *   del .json. No borra nada. --pares A,B limita los pares.
 *   Codigo: 0 todo migrado o ya en .gz; 1 algun par sin migrar; 4 uso.
 *
 * Para que publicarAnio suba aunque el contenido sea el mismo: «sin cambios»
 * solo si lo vigente ya esta en la ruta que se escribe (el .gz).
 *
 * ORACULOS con Storage falso (sin proveedor): seco sin descargas ni subidas;
 * con --subir, dos pares migrados: .json.gz application/gzip, sha256 del
 * cuerpo en metadatos, contenido = el .json, el .json intacto, una descarga
 * por par y la transferencia exacta; un par ya en .gz se salta sin descargar;
 * un par sin fichero, cerrojo puesto o verificacion fallida → codigo 1.
 */
import { gunzipSync, gzipSync } from 'node:zlib'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { titulo, ver, oraculo, fin, escenario, db, REPO } from '../lib.mjs'
import { createClient } from '../supabase-falso.mjs'
import { diaM1 } from '../proveedor-falso.mjs'
import { correScript, ejecucionesScripts } from '../script-falso.mjs'
const DIA = 86400000
const ENV = { NEXT_PUBLIC_SUPABASE_URL: 'https://falso.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'falsa' }
const hay = existsSync(REPO + 'scripts/arranque-gzip.js')
const velasDe = (dia, n = 1440) => diaM1(dia, n).map(c => ({ time: c.timestamp / 1000, open: c.open, high: c.high, low: c.low, close: c.close, volume: 1 }))
const historial = (hasta, desfase = 0) => { const v = []; for (let t = Date.parse('2026-01-02T00:00:00Z'); t <= Date.parse(hasta + 'T00:00:00Z'); t += DIA) { const w = new Date(t).getUTCDay(), d = new Date(t).toISOString().slice(0, 10); if (w >= 1 && w <= 5) v.push(...velasDe(d, 1440 - desfase)); else if (w === 0) v.push(...velasDe(d).slice(22 * 60)) } return v }
const corre = (argv = []) => hay ? correScript('scripts/arranque-gzip.js', { ahora: '2026-10-10T08:00:00Z', argv, env: ENV }) : Promise.resolve({ salida: ['(sin scripts/arranque-gzip.js)'], codigo: null })
const datos = op => db.log.filter(l => l.op === op && !String(l.payload?.ruta ?? l.payload).includes('_cerrojos/'))
const reales = () => datos('download').filter(l => l.encontrado !== false)
const lineas = (r, re) => r.salida.filter(l => re.test(l)).join(' | ')
const J = { EURUSD: JSON.stringify(historial('2026-02-20')), GBPUSD: JSON.stringify(historial('2026-02-13')) }

titulo('1 · seco: solo info(), nada descargado ni subido')
escenario({ storage: { 'forex-data': { 'EURUSD/M1/2026.json': J.EURUSD, 'GBPUSD/M1/2026.json': J.GBPUSD } } })
const s = await corre(['--pares', 'EURUSD,GBPUSD'])
oraculo('MD04', 'sin --subir: 0 descargas y 0 subidas, y dice por par que migraria (con el tamaño del .json)', reales().length === 0 && datos('upload').length === 0 && s.codigo === 0 && /EURUSD.*migraria/i.test(s.salida.join('\n')) && /GBPUSD.*migraria/i.test(s.salida.join('\n')), `codigo ${s.codigo} · ${reales().length} descargas · ${lineas(s, /EURUSD|GBPUSD/)}`)

titulo('2 · --subir: dos pares migrados y verificados')
escenario({ storage: { 'forex-data': { 'EURUSD/M1/2026.json': J.EURUSD, 'GBPUSD/M1/2026.json': J.GBPUSD } } })
const a = await corre(['--subir', '--pares', 'EURUSD,GBPUSD'])
const ups = datos('upload')
const meta = r => db.metadatos?.['forex-data']?.[r]
const okPar = par => { const r = `${par}/M1/2026.json.gz`, b = db.storage['forex-data'][r]; if (!b) return false; const buf = Buffer.from(b); return buf[0] === 0x1f && meta(r)?.sha256 === createHash('sha256').update(buf).digest('hex') && gunzipSync(buf).toString('utf8') === J[par] }
oraculo('MD04', 'sube EURUSD y GBPUSD como {PAR}/M1/2026.json.gz (application/gzip), una vez cada uno', ups.length === 2 && ups.every(l => /^(EURUSD|GBPUSD)\/M1\/2026\.json\.gz$/.test(l.payload.ruta) && l.payload.contentType === 'application/gzip'), ups.map(l => `${l.payload.ruta} ${l.payload.contentType}`).join(' · '))
oraculo('MD04', 'cada .json.gz es gzip, lleva el sha256 de su cuerpo en los metadatos y descomprimido es EXACTAMENTE el .json', okPar('EURUSD') && okPar('GBPUSD'), `EURUSD ${okPar('EURUSD')} · GBPUSD ${okPar('GBPUSD')}`)
oraculo('MD04', 'los .json siguen intactos y no se borra nada', db.storage['forex-data']['EURUSD/M1/2026.json'] === J.EURUSD && db.storage['forex-data']['GBPUSD/M1/2026.json'] === J.GBPUSD && datos('remove').length === 0, `${datos('remove').length} remove`)
const bytesJ = Buffer.byteLength(J.EURUSD) + Buffer.byteLength(J.GBPUSD)
oraculo('MD04', 'una descarga real por par (el .json) y la transferencia exacta en el log', reales().length === 2 && a.salida.some(l => new RegExp(`Transferencia.*2 descarga\\(s\\), ${bytesJ} bytes`).test(l)), `${reales().length} descargas · ${lineas(a, /Transferencia/)} (esperados ${bytesJ})`)
oraculo('MD04', 'codigo 0, cada par «verificado» con sus velas, y sin cerrojos puestos', a.codigo === 0 && /EURUSD.*verificado/.test(a.salida.join('\n')) && /GBPUSD.*verificado/.test(a.salida.join('\n')) && !Object.keys(db.storage['forex-data']).some(k => k.startsWith('_cerrojos/')), `codigo ${a.codigo} · ${lineas(a, /EURUSD|GBPUSD/)}`)

titulo('3 · un par que ya tiene .json.gz se salta sin descargar')
escenario({ storage: { 'forex-data': { 'EURUSD/M1/2026.json': J.EURUSD, 'EURUSD/M1/2026.json.gz': gzipSync(Buffer.from(J.EURUSD)), 'GBPUSD/M1/2026.json': J.GBPUSD } } })
const b = await corre(['--subir', '--pares', 'EURUSD,GBPUSD'])
// Astra MD-04 (CTO 9-oct): un .gz existente ya no se salta sin mirarlo: se descarga y se certifica contra el .json
oraculo('MD04', 'EURUSD ya en .json.gz: se certifica (se bajan su .gz y su .json, no se sube nada); GBPUSD se migra; codigo 0', reales().filter(l => String(l.payload).startsWith('EURUSD/')).map(l => l.payload).sort().join() === 'EURUSD/M1/2026.json,EURUSD/M1/2026.json.gz' && datos('upload').map(l => l.payload.ruta).join() === 'GBPUSD/M1/2026.json.gz' && b.codigo === 0 && /EURUSD ✓.*certificad/i.test(b.salida.join('\n')), `codigo ${b.codigo} · ${datos('upload').map(l => l.payload.ruta).join(' ')} · ${lineas(b, /EURUSD/)}`)

titulo('4 · lo que no se puede migrar sale con 1')
escenario({ storage: { 'forex-data': { 'EURUSD/M1/2026.json': J.EURUSD } } })
const c = await corre(['--subir', '--pares', 'EURUSD,GBPUSD'])
oraculo('MD04', 'GBPUSD sin ningun fichero de 2026: ✗ y codigo 1 (EURUSD se migra igual)', c.codigo === 1 && /GBPUSD.*✗/.test(c.salida.join('\n')) && datos('upload').map(l => l.payload.ruta).join() === 'EURUSD/M1/2026.json.gz', `codigo ${c.codigo} · ${lineas(c, /GBPUSD/)}`)
escenario({ storage: { 'forex-data': { 'EURUSD/M1/2026.json': J.EURUSD, '_cerrojos/EURUSD_2026.json': JSON.stringify({ dueno: 'otro', desde: '2026-10-10T07:00:00Z' }) } } })
const d = await corre(['--subir', '--pares', 'EURUSD'])
// Astra MD-04: un cerrojo para el arranque con su propio codigo (5), no 1
oraculo('MD04', 'cerrojo puesto por otro: no sube nada, lo dice y codigo 5 (el cerrojo no se toca)', d.codigo === 5 && datos('upload').length === 0 && /cerrojo/.test(d.salida.join('\n')) && Object.hasOwn(db.storage['forex-data'], '_cerrojos/EURUSD_2026.json'), `codigo ${d.codigo} · ${lineas(d, /EURUSD/)}`)
escenario({ storage: { 'forex-data': { 'EURUSD/M1/2026.json': J.EURUSD } } })
const otro = createClient('https://falso.supabase.co', 'falsa')
let pisa = false
db.trasAplicar = async x => { if (x.payload === 'EURUSD/M1/2026.json.gz' && !pisa) { pisa = true; await otro.storage.from('forex-data').upload('EURUSD/M1/2026.json.gz', gzipSync(Buffer.from(JSON.stringify(historial('2026-01-30')))), { upsert: true }) } }
const e = await corre(['--subir', '--pares', 'EURUSD'])
db.trasAplicar = null
oraculo('MD04', 'otro escritor pisa justo despues de subir: «no verificado» y codigo 1', e.codigo === 1 && /no verificado/.test(e.salida.join('\n')), `codigo ${e.codigo} · ${lineas(e, /EURUSD/)}`)
const n0 = db.log.length
const f = await corre(['--subir', '--pares', 'EURUSD,XXXYYY'])
oraculo('MD04', 'un par que no existe: no se toca Storage y codigo 4', f.codigo === 4 && !db.log.slice(n0).some(l => String(l.tabla).startsWith('storage')), `codigo ${f.codigo} · ${db.log.length - n0} operaciones`)
ver('control (H06): ningun script por timeout', ejecucionesScripts.every(x => x.terminoPor !== 'timeout'))
fin()
