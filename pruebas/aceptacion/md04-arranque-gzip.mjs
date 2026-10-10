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
 *   del .json. --pares A,B limita los pares.
 *   CTO 10-oct (Storage al limite): con --subir exige --copia DIR (copia local
 *   de cada .json con su sha256) y, por par y en serie, verifica el .gz
 *   bajandolo y BORRA el .json; cualquier fallo PARA sin borrar ese .json.
 *   Codigo: 0 todo migrado y su .json borrado; 1 algo fallo (para); 4 uso.
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
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { titulo, ver, oraculo, fin, escenario, db, REPO } from '../lib.mjs'
import { createClient } from '../supabase-falso.mjs'
import { diaM1 } from '../proveedor-falso.mjs'
import { correScript, ejecucionesScripts } from '../script-falso.mjs'
const DIA = 86400000
const ENV = { NEXT_PUBLIC_SUPABASE_URL: 'https://falso.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'falsa' }
const hay = existsSync(REPO + 'scripts/arranque-gzip.js')
const velasDe = (dia, n = 1440) => diaM1(dia, n).map(c => ({ time: c.timestamp / 1000, open: c.open, high: c.high, low: c.low, close: c.close, volume: 1 }))
const historial = (hasta, desfase = 0) => { const v = []; for (let t = Date.parse('2026-01-02T00:00:00Z'); t <= Date.parse(hasta + 'T00:00:00Z'); t += DIA) { const w = new Date(t).getUTCDay(), d = new Date(t).toISOString().slice(0, 10); if (w >= 1 && w <= 5) v.push(...velasDe(d, 1440 - desfase)); else if (w === 0) v.push(...velasDe(d).slice(22 * 60)) } return v }
// la copia local (scripts/copia-mercado.js): {PAR}_2026.json = JSON.stringify(velas) y su .sha256
let nCopia = 0
const copia = (contenidos, { malSha = [] } = {}) => {
  const dir = path.join(REPO, '.pruebas', `copia-md04-${process.pid}-${++nCopia}`)
  mkdirSync(dir, { recursive: true })
  for (const [par, texto] of Object.entries(contenidos)) {
    writeFileSync(path.join(dir, `${par}_2026.json`), texto)
    writeFileSync(path.join(dir, `${par}_2026.json.sha256`), `${malSha.includes(par) ? '0'.repeat(64) : createHash('sha256').update(texto).digest('hex')}  ${par}_2026.json\n`)
  }
  return dir
}
const corre = (argv = []) => hay ? correScript('scripts/arranque-gzip.js', { ahora: '2026-10-10T08:00:00Z', argv, env: ENV }) : Promise.resolve({ salida: ['(sin scripts/arranque-gzip.js)'], codigo: null })
const datos = op => db.log.filter(l => l.op === op && !String(l.payload?.ruta ?? l.payload).includes('_cerrojos/'))
const reales = () => datos('download').filter(l => l.encontrado !== false)
const lineas = (r, re) => r.salida.filter(l => re.test(l)).join(' | ')
const J = { EURUSD: JSON.stringify(historial('2026-02-20')), GBPUSD: JSON.stringify(historial('2026-02-13')) }
const CP = copia(J)

titulo('1 · seco: solo info(), nada descargado ni subido')
escenario({ storage: { 'forex-data': { 'EURUSD/M1/2026.json': J.EURUSD, 'GBPUSD/M1/2026.json': J.GBPUSD } } })
const s = await corre(['--pares', 'EURUSD,GBPUSD'])
oraculo('MD04', 'sin --subir: 0 descargas y 0 subidas, y dice por par que migraria (con el tamaño del .json)', reales().length === 0 && datos('upload').length === 0 && s.codigo === 0 && /EURUSD.*migraria/i.test(s.salida.join('\n')) && /GBPUSD.*migraria/i.test(s.salida.join('\n')), `codigo ${s.codigo} · ${reales().length} descargas · ${lineas(s, /EURUSD|GBPUSD/)}`)

titulo('2 · --subir: dos pares migrados y verificados')
escenario({ storage: { 'forex-data': { 'EURUSD/M1/2026.json': J.EURUSD, 'GBPUSD/M1/2026.json': J.GBPUSD } } })
const a = await corre(['--subir', '--copia', CP, '--pares', 'EURUSD,GBPUSD'])
const ups = datos('upload')
const meta = r => db.metadatos?.['forex-data']?.[r]
const okPar = par => { const r = `${par}/M1/2026.json.gz`, b = db.storage['forex-data'][r]; if (!b) return false; const buf = Buffer.from(b); return buf[0] === 0x1f && meta(r)?.sha256 === createHash('sha256').update(buf).digest('hex') && gunzipSync(buf).toString('utf8') === J[par] }
oraculo('MD04', 'sube EURUSD y GBPUSD como {PAR}/M1/2026.json.gz (application/gzip), una vez cada uno', ups.length === 2 && ups.every(l => /^(EURUSD|GBPUSD)\/M1\/2026\.json\.gz$/.test(l.payload.ruta) && l.payload.contentType === 'application/gzip'), ups.map(l => `${l.payload.ruta} ${l.payload.contentType}`).join(' · '))
oraculo('MD04', 'cada .json.gz es gzip, lleva el sha256 de su cuerpo en los metadatos y descomprimido es EXACTAMENTE el .json', okPar('EURUSD') && okPar('GBPUSD'), `EURUSD ${okPar('EURUSD')} · GBPUSD ${okPar('GBPUSD')}`)
// CTO 10-oct (cambia el contrato: antes «los .json siguen intactos y no se borra nada»)
oraculo('MD04', 'cada .json se borra (un remove por par, solo su .json) despues de publicar su .gz, y ya no existe', datos('remove').map(l => JSON.stringify(l.payload)).join() === '["EURUSD/M1/2026.json"],["GBPUSD/M1/2026.json"]' && !Object.hasOwn(db.storage['forex-data'], 'EURUSD/M1/2026.json') && !Object.hasOwn(db.storage['forex-data'], 'GBPUSD/M1/2026.json'), `${datos('remove').map(l => JSON.stringify(l.payload)).join(' ')}`)
oraculo('MD04', 'en serie: el .json de EURUSD se borra ANTES de tocar GBPUSD (nunca dos pares en vuelo)', (() => { const ops = db.log.filter(l => String(l.tabla).startsWith('storage')); const rmE = ops.findIndex(l => l.op === 'remove' && JSON.stringify(l.payload) === '["EURUSD/M1/2026.json"]'); const g1 = ops.findIndex(l => String(l.payload?.ruta ?? l.payload).includes('GBPUSD')); return rmE >= 0 && g1 > rmE })(), '')
const bytesJ = Buffer.byteLength(J.EURUSD) + Buffer.byteLength(J.GBPUSD)
const bytesG = ['EURUSD', 'GBPUSD'].reduce((n, p) => n + Buffer.from(db.storage['forex-data'][`${p}/M1/2026.json.gz`] ?? '').length, 0)
oraculo('MD04', 'dos descargas reales por par (el .json y la verificacion del .gz) y la transferencia exacta en el log', reales().length === 4 && reales().filter(l => /\.json\.gz$/.test(l.payload)).length === 2 && a.salida.some(l => new RegExp(`Transferencia.*4 descarga\\(s\\), ${bytesJ + bytesG} bytes`).test(l)), `${reales().length} descargas · ${lineas(a, /Transferencia/)} (esperados ${bytesJ + bytesG})`)
oraculo('MD04', 'codigo 0, cada par «verificado» bajandolo y con su .json borrado, y sin cerrojos puestos', a.codigo === 0 && /EURUSD.*verificado bajandolo.*borrado/.test(a.salida.join('\n')) && /EURUSD.*verificado/.test(a.salida.join('\n')) && /GBPUSD.*verificado/.test(a.salida.join('\n')) && !Object.keys(db.storage['forex-data']).some(k => k.startsWith('_cerrojos/')), `codigo ${a.codigo} · ${lineas(a, /EURUSD|GBPUSD/)}`)

titulo('3 · un par que ya tiene .json.gz se salta sin descargar')
const GZ_E = gzipSync(Buffer.from(J.EURUSD))
escenario({ storage: { 'forex-data': { 'EURUSD/M1/2026.json': J.EURUSD, 'EURUSD/M1/2026.json.gz': GZ_E, 'GBPUSD/M1/2026.json': J.GBPUSD } } })
// un .gz de un escritor actual lleva el sha256 de su cuerpo en los metadatos (sin el, no se puede verificar: ma04)
;(db.metadatos['forex-data'] ??= {})['EURUSD/M1/2026.json.gz'] = { sha256: createHash('sha256').update(GZ_E).digest('hex') }
const b = await corre(['--subir', '--copia', CP, '--pares', 'EURUSD,GBPUSD'])
// Astra MD-04 (CTO 9-oct): un .gz existente ya no se salta sin mirarlo: se descarga y se certifica contra el .json
// (CTO 10-oct: y despues, con su copia, se verifica y se borra su .json)
oraculo('MD04', 'EURUSD ya en .json.gz: se certifica (se bajan su .gz y su .json, no se sube nada), se verifica y se borra su .json; GBPUSD se migra; codigo 0', reales().filter(l => String(l.payload).startsWith('EURUSD/')).map(l => l.payload).sort().join() === 'EURUSD/M1/2026.json,EURUSD/M1/2026.json.gz,EURUSD/M1/2026.json.gz' && !Object.hasOwn(db.storage['forex-data'], 'EURUSD/M1/2026.json') && datos('upload').map(l => l.payload.ruta).join() === 'GBPUSD/M1/2026.json.gz' && b.codigo === 0 && /EURUSD ✓.*certificad/i.test(b.salida.join('\n')), `codigo ${b.codigo} · ${datos('upload').map(l => l.payload.ruta).join(' ')} · ${lineas(b, /EURUSD/)}`)

titulo('4 · lo que no se puede migrar sale con 1')
escenario({ storage: { 'forex-data': { 'EURUSD/M1/2026.json': J.EURUSD } } })
const c = await corre(['--subir', '--copia', CP, '--pares', 'EURUSD,GBPUSD'])
oraculo('MD04', 'GBPUSD sin ningun fichero de 2026: ✗ y codigo 1 (EURUSD, antes, se migra igual)', c.codigo === 1 && /GBPUSD.*✗/.test(c.salida.join('\n')) && datos('upload').map(l => l.payload.ruta).join() === 'EURUSD/M1/2026.json.gz', `codigo ${c.codigo} · ${lineas(c, /GBPUSD/)}`)
escenario({ storage: { 'forex-data': { 'EURUSD/M1/2026.json': J.EURUSD, '_cerrojos/EURUSD_2026.json': JSON.stringify({ dueno: 'otro', desde: '2026-10-10T07:00:00Z' }) } } })
const d = await corre(['--subir', '--copia', CP, '--pares', 'EURUSD'])
// Astra MD-04: un cerrojo para el arranque con su propio codigo (5), no 1
oraculo('MD04', 'cerrojo puesto por otro: no sube nada, lo dice y codigo 5 (el cerrojo no se toca)', d.codigo === 5 && datos('upload').length === 0 && /cerrojo/.test(d.salida.join('\n')) && Object.hasOwn(db.storage['forex-data'], '_cerrojos/EURUSD_2026.json'), `codigo ${d.codigo} · ${lineas(d, /EURUSD/)}`)
escenario({ storage: { 'forex-data': { 'EURUSD/M1/2026.json': J.EURUSD } } })
const otro = createClient('https://falso.supabase.co', 'falsa')
let pisa = false
db.trasAplicar = async x => { if (x.payload === 'EURUSD/M1/2026.json.gz' && !pisa) { pisa = true; await otro.storage.from('forex-data').upload('EURUSD/M1/2026.json.gz', gzipSync(Buffer.from(JSON.stringify(historial('2026-01-30')))), { upsert: true }) } }
const e = await corre(['--subir', '--copia', CP, '--pares', 'EURUSD'])
db.trasAplicar = null
oraculo('MD04', 'otro escritor pisa justo despues de subir: «no verificado», codigo 1 y el .json NO se borra', e.codigo === 1 && /no verificado/.test(e.salida.join('\n')) && db.storage['forex-data']['EURUSD/M1/2026.json'] === J.EURUSD && datos('remove').length === 0, `codigo ${e.codigo} · ${lineas(e, /EURUSD/)}`)
const n0 = db.log.length
const f = await corre(['--subir', '--copia', CP, '--pares', 'EURUSD,XXXYYY'])
oraculo('MD04', 'un par que no existe: no se toca Storage y codigo 4', f.codigo === 4 && !db.log.slice(n0).some(l => String(l.tabla).startsWith('storage')), `codigo ${f.codigo} · ${db.log.length - n0} operaciones`)

titulo('5 · CTO 10-oct: copia local obligatoria, verificacion bajando el .gz y nada se borra si algo falla')
const intacto = par => db.storage['forex-data'][`${par}/M1/2026.json`] === J[par]
escenario({ storage: { 'forex-data': { 'EURUSD/M1/2026.json': J.EURUSD } } })
const k0 = db.log.length
const k = await corre(['--subir', '--pares', 'EURUSD'])
oraculo('MD04', '--subir sin --copia: codigo 4 y no se toca Storage', k.codigo === 4 && !db.log.slice(k0).some(l => String(l.tabla).startsWith('storage')) && intacto('EURUSD'), `codigo ${k.codigo} · ${lineas(k, /copia/)}`)
escenario({ storage: { 'forex-data': { 'EURUSD/M1/2026.json': J.EURUSD, 'GBPUSD/M1/2026.json': J.GBPUSD } } })
const g = await corre(['--subir', '--copia', copia({ EURUSD: J.EURUSD }), '--pares', 'GBPUSD,EURUSD'])
oraculo('MD04', 'sin copia local de GBPUSD (el primero): no se sube ni se borra nada de GBPUSD, PARA (EURUSD ni se toca) y codigo 1', g.codigo === 1 && datos('upload').length === 0 && datos('remove').length === 0 && intacto('GBPUSD') && intacto('EURUSD') && !db.log.some(l => String(l.payload?.ruta ?? l.payload).startsWith('EURUSD/')) && /GBPUSD.*no hay copia local/.test(g.salida.join('\n')), `codigo ${g.codigo} · ${lineas(g, /GBPUSD|EURUSD/)}`)
escenario({ storage: { 'forex-data': { 'EURUSD/M1/2026.json': J.EURUSD } } })
const h = await corre(['--subir', '--copia', copia({ EURUSD: J.EURUSD }, { malSha: ['EURUSD'] }), '--pares', 'EURUSD'])
oraculo('MD04', 'copia que no coincide con su .sha256: nada subido ni borrado, codigo 1', h.codigo === 1 && datos('upload').length === 0 && datos('remove').length === 0 && intacto('EURUSD') && /no coincide con su \.sha256/.test(h.salida.join('\n')), `codigo ${h.codigo} · ${lineas(h, /EURUSD/)}`)
escenario({ storage: { 'forex-data': { 'EURUSD/M1/2026.json': J.EURUSD } } })
const i2 = await corre(['--subir', '--copia', copia({ EURUSD: J.GBPUSD }), '--pares', 'EURUSD'])
oraculo('MD04', 'copia valida pero de OTRO contenido que el .json del bucket: nada subido ni borrado, codigo 1', i2.codigo === 1 && datos('upload').length === 0 && datos('remove').length === 0 && intacto('EURUSD') && /no es lo que hay ahora en el \.json/.test(i2.salida.join('\n')), `codigo ${i2.codigo} · ${lineas(i2, /EURUSD/)}`)
escenario({ storage: { 'forex-data': { 'EURUSD/M1/2026.json': J.EURUSD, 'GBPUSD/M1/2026.json': J.GBPUSD } } })
// solo la descarga de verificacion: la del .gz DESPUES de subirlo (antes, la lectura prueba el .gz y cae al .json)
db.falla = ctx => (ctx.op === 'download' && ctx.payload === 'EURUSD/M1/2026.json.gz' && db.log.some(l => l.op === 'upload' && l.payload?.ruta === 'EURUSD/M1/2026.json.gz') ? { message: 'Service Unavailable', statusCode: '503' } : null)
const v = await corre(['--subir', '--copia', CP, '--pares', 'EURUSD,GBPUSD'])
db.falla = null
oraculo('MD04', 'falla la verificacion bajando el .gz (503): el .json SIGUE, PARA antes de GBPUSD y codigo 1', v.codigo === 1 && intacto('EURUSD') && intacto('GBPUSD') && datos('remove').length === 0 && datos('upload').map(l => l.payload.ruta).join() === 'EURUSD/M1/2026.json.gz' && /EURUSD.*verificacion.*no se ha intentado borrar/.test(v.salida.join('\n')), `codigo ${v.codigo} · ${lineas(v, /EURUSD|GBPUSD/)}`)
escenario({ storage: { 'forex-data': { 'EURUSD/M1/2026.json': J.EURUSD } } })
// solo el borrado del .json (el cerrojo tambien se suelta con remove: ese no falla)
db.falla = ctx => (ctx.op === 'remove' && JSON.stringify(ctx.payload) === '["EURUSD/M1/2026.json"]' ? { message: 'Internal Server Error', statusCode: '500' } : null)
const w = await corre(['--subir', '--copia', CP, '--pares', 'EURUSD'])
db.falla = null
// MA-GZ-04: un DELETE que responde error puede haberse aplicado: INCIERTO, sin afirmar que el .json sigue
oraculo('MD04', 'el DELETE del .json responde error: INCIERTO (sin afirmar que sigue), codigo 1 y sin cerrojo puesto', w.codigo === 1 && /INCIERTO/.test(w.salida.join('\n')) && !/NO se borra|no se ha borrado|sigue existiendo/.test(w.salida.join('\n')) && !Object.keys(db.storage['forex-data']).some(x => x.startsWith('_cerrojos/')), `codigo ${w.codigo} · ${lineas(w, /EURUSD/)}`)
escenario({ storage: { 'forex-data': { 'EURUSD/M1/2026.json': J.EURUSD } } })
const z = await corre(['--copia', copia({ EURUSD: J.EURUSD }), '--pares', 'EURUSD'])
oraculo('MD04', 'en seco con --copia: dice que borraria el .json y el estado de la copia, sin tocar nada', z.codigo === 0 && /EURUSD \[SECO\] migraria.*borraria el \.json · copia: ok/.test(z.salida.join('\n')) && datos('upload').length === 0 && datos('remove').length === 0 && reales().length === 0, `codigo ${z.codigo} · ${lineas(z, /EURUSD/)}`)

titulo('6 · MA-GZ-02 (Astra): un fallo en el estado inicial de un par PARA el arranque real')
const J3 = { ...J, USDJPY: JSON.stringify(historial('2026-02-06')) }
const CP3 = copia(J3)
const tocados = (par, desde) => db.log.slice(desde).filter(l => String(l.tabla).startsWith('storage') && JSON.stringify(l.payload ?? '').includes(par)).map(l => l.op)
const falla503 = par => ctx => (ctx.op === 'info' && String(ctx.payload).startsWith(`${par}/`) ? { message: 'Service Unavailable', statusCode: '503' } : null)
escenario({ storage: { 'forex-data': { 'EURUSD/M1/2026.json': J.EURUSD, 'GBPUSD/M1/2026.json': J.GBPUSD } } })
db.falla = falla503('EURUSD')
const m1 = await corre(['--subir', '--copia', CP3, '--pares', 'EURUSD,GBPUSD'])
db.falla = null
oraculo('MA-GZ-02', 'info() del PRIMER par con 503: PARA con codigo 1 y GBPUSD no se toca (cero operaciones, su .json intacto)', m1.codigo === 1 && tocados('GBPUSD', 0).length === 0 && intacto('GBPUSD') && datos('upload').length === 0 && datos('remove').length === 0, `codigo ${m1.codigo} · GBPUSD: ${tocados('GBPUSD', 0).join(',') || 'nada'} · ${lineas(m1, /EURUSD|GBPUSD/)}`)
escenario({ storage: { 'forex-data': { 'GBPUSD/M1/2026.json': J.GBPUSD } } })
const m2 = await corre(['--subir', '--copia', CP3, '--pares', 'EURUSD,GBPUSD'])
oraculo('MA-GZ-02', 'el PRIMER par sin ninguno de sus dos objetos: PARA con codigo 1 y GBPUSD no se toca', m2.codigo === 1 && tocados('GBPUSD', 0).length === 0 && intacto('GBPUSD') && datos('remove').length === 0, `codigo ${m2.codigo} · GBPUSD: ${tocados('GBPUSD', 0).join(',') || 'nada'}`)
escenario({ storage: { 'forex-data': { 'EURUSD/M1/2026.json': J.EURUSD, 'GBPUSD/M1/2026.json': J.GBPUSD, 'USDJPY/M1/2026.json': J3.USDJPY } } })
db.falla = falla503('GBPUSD')
const m3 = await corre(['--subir', '--copia', CP3, '--pares', 'EURUSD,GBPUSD,USDJPY'])
db.falla = null
oraculo('MA-GZ-02', 'fallo en el par INTERMEDIO (GBPUSD): EURUSD migrado antes, PARA en GBPUSD y USDJPY no se toca', m3.codigo === 1 && !Object.hasOwn(db.storage['forex-data'], 'EURUSD/M1/2026.json') && intacto('GBPUSD') && tocados('USDJPY', 0).length === 0 && db.storage['forex-data']['USDJPY/M1/2026.json'] === J3.USDJPY, `codigo ${m3.codigo} · USDJPY: ${tocados('USDJPY', 0).join(',') || 'nada'}`)

titulo('7 · MA-GZ-04 (Astra): tres estados del DELETE; en el incierto, ni presencia ni ausencia')
const incierto = (r, par) => r.codigo === 1 && new RegExp(`${par}.*INCIERTO`).test(r.salida.join('\n')) && /reconciliar/.test(r.salida.join('\n')) && !/NO se borra|no se ha borrado|sigue existiendo|ya no existe/.test(r.salida.join('\n'))
escenario({ storage: { 'forex-data': { 'EURUSD/M1/2026.json': J.EURUSD, 'GBPUSD/M1/2026.json': J.GBPUSD } } })
// la respuesta se pierde: el DELETE SI se aplica, pero vuelve un 500
db.falla = ctx => { if (ctx.op === 'remove' && JSON.stringify(ctx.payload) === '["EURUSD/M1/2026.json"]') { delete db.storage['forex-data']['EURUSD/M1/2026.json']; return { message: 'Internal Server Error', statusCode: '500' } } return null }
const p1 = await corre(['--subir', '--copia', CP3, '--pares', 'EURUSD,GBPUSD'])
db.falla = null
oraculo('MA-GZ-04', 'respuesta perdida tras un DELETE aplicado: INCIERTO, PARA, no dice que el .json siga (ya no esta) y GBPUSD no se toca', incierto(p1, 'EURUSD') && !Object.hasOwn(db.storage['forex-data'], 'EURUSD/M1/2026.json') && tocados('GBPUSD', 0).length === 0, `codigo ${p1.codigo} · ${lineas(p1, /EURUSD|ATENCION/)}`)
escenario({ storage: { 'forex-data': { 'EURUSD/M1/2026.json': J.EURUSD, 'GBPUSD/M1/2026.json': J.GBPUSD } } })
// el DELETE va bien, pero la comprobacion posterior (info del .json) da 503
db.falla = ctx => (ctx.op === 'info' && ctx.payload === 'EURUSD/M1/2026.json' && db.log.some(l => l.op === 'remove' && JSON.stringify(l.payload) === '["EURUSD/M1/2026.json"]') ? { message: 'Service Unavailable', statusCode: '503' } : null)
const p2 = await corre(['--subir', '--copia', CP3, '--pares', 'EURUSD,GBPUSD'])
db.falla = null
oraculo('MA-GZ-04', '503 en la comprobacion tras un DELETE correcto: INCIERTO, PARA, sin afirmar presencia ni ausencia, y GBPUSD no se toca', incierto(p2, 'EURUSD') && tocados('GBPUSD', 0).length === 0, `codigo ${p2.codigo} · ${lineas(p2, /EURUSD|ATENCION/)}`)
escenario({ storage: { 'forex-data': { 'EURUSD/M1/2026.json': J.EURUSD } } })
db.falla = ctx => (ctx.op === 'download' && ctx.payload === 'EURUSD/M1/2026.json.gz' && db.log.some(l => l.op === 'upload' && l.payload?.ruta === 'EURUSD/M1/2026.json.gz') ? { message: 'Service Unavailable', statusCode: '503' } : null)
const p3 = await corre(['--subir', '--copia', CP3, '--pares', 'EURUSD'])
db.falla = null
oraculo('MA-GZ-04', 'rechazado ANTES del DELETE (verificacion fallida): «no se ha intentado borrar», el .json sigue, sin «INCIERTO»', p3.codigo === 1 && /no se ha intentado borrar/.test(p3.salida.join('\n')) && !/INCIERTO/.test(p3.salida.join('\n')) && intacto('EURUSD') && datos('remove').length === 0, `codigo ${p3.codigo} · ${lineas(p3, /EURUSD/)}`)

titulo('8 · MA-GZ-01 (Astra): la fase final de cada par, con el cerrojo del par tomado')
const CE = '_cerrojos/EURUSD_2026.json'
const conCerrojoAlBorrar = []
const mira = ctx => { if (ctx.op === 'remove' && JSON.stringify(ctx.payload) === '["EURUSD/M1/2026.json"]') conCerrojoAlBorrar.push(Object.hasOwn(db.storage['forex-data'], CE) ? JSON.parse(String(db.storage['forex-data'][CE])).dueno : null); return null }
escenario({ storage: { 'forex-data': { 'EURUSD/M1/2026.json': J.EURUSD } } })
db.falla = mira
const q1 = await corre(['--subir', '--copia', CP3, '--pares', 'EURUSD'])
db.falla = null
oraculo('MA-GZ-01', 'migracion: al borrar el .json, el cerrojo del par esta puesto y es del arranque; al acabar, suelto; codigo 0', q1.codigo === 0 && conCerrojoAlBorrar.length === 1 && /arranque-gzip/.test(String(conCerrojoAlBorrar[0])) && !Object.hasOwn(db.storage['forex-data'], CE), `codigo ${q1.codigo} · al borrar: ${conCerrojoAlBorrar.join(',') || 'sin cerrojo'}`)
conCerrojoAlBorrar.length = 0
const GZ_E2 = gzipSync(Buffer.from(J.EURUSD))
escenario({ storage: { 'forex-data': { 'EURUSD/M1/2026.json': J.EURUSD, 'EURUSD/M1/2026.json.gz': GZ_E2 } } })
;(db.metadatos['forex-data'] ??= {})['EURUSD/M1/2026.json.gz'] = { sha256: createHash('sha256').update(GZ_E2).digest('hex') }
db.falla = mira
const q2 = await corre(['--subir', '--copia', CP3, '--pares', 'EURUSD'])
db.falla = null
oraculo('MA-GZ-01', '.gz previo con .json: tambien con el cerrojo del arranque puesto al borrar, y suelto al acabar', q2.codigo === 0 && conCerrojoAlBorrar.length === 1 && /arranque-gzip/.test(String(conCerrojoAlBorrar[0])) && !Object.hasOwn(db.storage['forex-data'], CE), `codigo ${q2.codigo} · al borrar: ${conCerrojoAlBorrar.join(',') || 'sin cerrojo'}`)
escenario({ storage: { 'forex-data': { 'EURUSD/M1/2026.json': J.EURUSD, 'GBPUSD/M1/2026.json': J.GBPUSD } } })
// otro proceso toma el cerrojo de EURUSD justo cuando el arranque va a tomarlo para la fase final (despues de publicar)
db.falla = ctx => {
  if (ctx.op === 'upload' && ctx.payload?.ruta === CE && db.log.some(l => l.op === 'upload' && l.payload?.ruta === 'EURUSD/M1/2026.json.gz') && !Object.hasOwn(db.storage['forex-data'], CE))
    db.storage['forex-data'][CE] = JSON.stringify({ dueno: 'otro-proceso', desde: '2026-10-10T08:00:00Z' })
  return null
}
const n8 = db.log.length
const q3 = await corre(['--subir', '--copia', CP3, '--pares', 'EURUSD,GBPUSD'])
db.falla = null
const trasTomar = db.log.slice(n8).filter(l => String(l.tabla).startsWith('storage'))
const iTomar = trasTomar.findLastIndex(l => l.op === 'upload' && l.payload?.ruta === CE)
oraculo('MA-GZ-01', 'cerrojo puesto por otro al ir a la fase final: codigo 5, el .json sigue, nada mas sobre EURUSD (ni verificacion ni DELETE), GBPUSD sin tocar y el cerrojo ajeno intacto', q3.codigo === 5 && intacto('EURUSD') && datos('remove').length === 0 && iTomar >= 0 && !trasTomar.slice(iTomar + 1).some(l => /EURUSD\/M1/.test(JSON.stringify(l.payload ?? ''))) && tocados('GBPUSD', n8).length === 0 && JSON.parse(String(db.storage['forex-data'][CE] ?? '{}')).dueno === 'otro-proceso', `codigo ${q3.codigo} · ${lineas(q3, /EURUSD|cerrojo/i)}`)
ver('control (H06): ningun script por timeout', ejecucionesScripts.every(x => x.terminoPor !== 'timeout'))
fin()
