/**
 * MA04 · EL ARRANQUE CERTIFICA, NO SUPONE (Astra MD-04; CTO 9-oct-2026)
 *
 * Antes: un par con .json.gz se saltaba «ya esta, nada que hacer» sin mirarlo
 * (un .gz ilegible, uno con menos velas o uno con un cerrojo pendiente daban
 * codigo 0). Decision del CTO:
 *   · un .gz existente se descarga, se descomprime, se valida (forma, OHLC,
 *     unicidad, cobertura) y se comprueba que no tiene menos velas por dia que
 *     el .json; si falla, ✗ y codigo 1 (no se toca nada);
 *   · si hay un cerrojo del par, el arranque PARA con su propio codigo (5) y
 *     dice de quien es y desde cuando. Nunca lo libera: eso es de una persona
 *     (scripts/liberar-cerrojo.js), con los procesos comprobados.
 *
 * ORACULOS con Storage falso: .gz ilegible → 1; .gz con un dia con menos velas
 * que el .json → 1; .gz igual al .json → ✓ certificado (0); .gz valido con
 * cerrojo → 5, el cerrojo intacto y el par siguiente sin tocar; .json sin .gz
 * con cerrojo → 5; en seco, el cerrojo tambien se reporta (5).
 */
import { gzipSync } from 'node:zlib'
import { existsSync } from 'node:fs'
import { titulo, ver, oraculo, fin, escenario, db, REPO } from '../lib.mjs'
import { diaM1 } from '../proveedor-falso.mjs'
import { correScript, ejecucionesScripts } from '../script-falso.mjs'
const DIA = 86400000
const ENV = { NEXT_PUBLIC_SUPABASE_URL: 'https://falso.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'falsa' }
const hay = existsSync(REPO + 'scripts/arranque-gzip.js')
const velasDe = (dia, n = 1440) => diaM1(dia, n).map(c => ({ time: c.timestamp / 1000, open: c.open, high: c.high, low: c.low, close: c.close, volume: 1 }))
const historial = hasta => { const v = []; for (let t = Date.parse('2026-01-02T00:00:00Z'); t <= Date.parse(hasta + 'T00:00:00Z'); t += DIA) { const w = new Date(t).getUTCDay(), d = new Date(t).toISOString().slice(0, 10); if (w >= 1 && w <= 5) v.push(...velasDe(d)); else if (w === 0) v.push(...velasDe(d).slice(22 * 60)) } return v }
const corre = (argv = []) => hay ? correScript('scripts/arranque-gzip.js', { ahora: '2026-10-10T08:00:00Z', argv, env: ENV }) : Promise.resolve({ salida: ['(sin scripts/arranque-gzip.js)'], codigo: null })
const subidas = () => db.log.filter(l => l.op === 'upload' && !String(l.payload?.ruta).includes('_cerrojos/'))
const borrados = () => db.log.filter(l => l.op === 'remove')
const txt = r => r.salida.join('\n')
const V = historial('2026-02-20')
const J = JSON.stringify(V)
const gz = v => gzipSync(Buffer.from(JSON.stringify(v)))
const CERROJO = { dueno: 'actualizar-diario:abc123', desde: '2026-10-10T07:00:00Z' }

titulo('1 · un .gz existente se valida')
escenario({ storage: { 'forex-data': { 'EURUSD/M1/2026.json': J, 'EURUSD/M1/2026.json.gz': Buffer.from('gzip ilegible') } } })
const a = await corre(['--subir', '--pares', 'EURUSD'])
oraculo('MD-04', '.gz ilegible (13 bytes de texto) con un .json valido: ✗ y codigo 1, sin subir nada', a.codigo === 1 && /EURUSD.*✗/.test(txt(a)) && subidas().length === 0, `codigo ${a.codigo} · ${a.salida.filter(l => /EURUSD/.test(l)).join(' | ')}`)
const corto = V.filter(v => !(new Date(v.time * 1000).toISOString().startsWith('2026-02-10') && (v.time / 60) % 1440 >= 1000))
escenario({ storage: { 'forex-data': { 'EURUSD/M1/2026.json': J, 'EURUSD/M1/2026.json.gz': gz(corto) } } })
const b = await corre(['--subir', '--pares', 'EURUSD'])
oraculo('MD-04', '.gz valido pero con el 10-feb con 1.000 velas frente a 1.440 del .json: ✗ y codigo 1', b.codigo === 1 && /EURUSD.*✗/.test(txt(b)) && /2026-02-10/.test(txt(b)) && subidas().length === 0, `codigo ${b.codigo} · ${b.salida.filter(l => /EURUSD/.test(l)).join(' | ')}`)
escenario({ storage: { 'forex-data': { 'EURUSD/M1/2026.json': J, 'EURUSD/M1/2026.json.gz': gz(V) } } })
const c = await corre(['--subir', '--pares', 'EURUSD'])
oraculo('MD-04', 'control positivo: .gz igual al .json → ✓ certificado (validado y con las mismas velas por dia), codigo 0, nada subido', c.codigo === 0 && /EURUSD ✓.*(certificad|validad)/.test(txt(c)) && subidas().length === 0, `codigo ${c.codigo} · ${c.salida.filter(l => /EURUSD/.test(l)).join(' | ')}`)

titulo('2 · un cerrojo para el arranque con su codigo (5) y nunca se libera')
escenario({ storage: { 'forex-data': { 'EURUSD/M1/2026.json': J, 'EURUSD/M1/2026.json.gz': gz(V), 'GBPUSD/M1/2026.json': J, '_cerrojos/EURUSD_2026.json': JSON.stringify(CERROJO) } } })
const d = await corre(['--subir', '--pares', 'EURUSD,GBPUSD'])
oraculo('MD-04', '.gz valido con un cerrojo puesto: codigo 5, dice de quien es y desde cuando, y no lo borra', d.codigo === 5 && /actualizar-diario:abc123/.test(txt(d)) && /2026-10-10T07:00:00Z/.test(txt(d)) && borrados().length === 0 && Object.hasOwn(db.storage['forex-data'], '_cerrojos/EURUSD_2026.json'), `codigo ${d.codigo} · ${d.salida.filter(l => /cerrojo|EURUSD/i.test(l)).join(' | ')}`)
oraculo('MD-04', 'y PARA: el par siguiente (GBPUSD) no se toca', subidas().length === 0 && !db.log.some(l => String(l.payload?.ruta ?? l.payload).startsWith('GBPUSD/')), db.log.filter(l => String(l.payload?.ruta ?? l.payload).startsWith('GBPUSD/')).map(l => l.op).join(',') || 'nada de GBPUSD')
escenario({ storage: { 'forex-data': { 'EURUSD/M1/2026.json': J, '_cerrojos/EURUSD_2026.json': JSON.stringify(CERROJO) } } })
const e = await corre(['--subir', '--pares', 'EURUSD'])
oraculo('MD-04', 'solo .json con cerrojo: codigo 5 (no 1), sin subir ni borrar nada', e.codigo === 5 && subidas().length === 0 && borrados().length === 0, `codigo ${e.codigo} · ${e.salida.filter(l => /cerrojo|EURUSD/i.test(l)).join(' | ')}`)
escenario({ storage: { 'forex-data': { 'EURUSD/M1/2026.json': J, '_cerrojos/EURUSD_2026.json': JSON.stringify(CERROJO) } } })
const f = await corre(['--pares', 'EURUSD'])
oraculo('MD-04', 'en seco, el cerrojo tambien se reporta (codigo 5)', f.codigo === 5 && /actualizar-diario:abc123/.test(txt(f)), `codigo ${f.codigo} · ${f.salida.filter(l => /cerrojo|EURUSD/i.test(l)).join(' | ')}`)
ver('control (H06): ningun script por timeout', ejecucionesScripts.every(x => x.terminoPor !== 'timeout'))
fin()
