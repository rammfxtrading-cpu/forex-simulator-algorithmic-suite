/**
 * GZ00 · LA COMPRESION, FUERA DE ESTE DESPLIEGUE (bloque E, punto 6; CTO 5-oct-2026)
 *
 * Decision del CTO: los escritores publican SOLO JSON y los lectores NO
 * prefieren gzip, tras un interruptor APAGADO por defecto (MERCADO_GZIP=1 lo
 * enciende). La migracion a gzip sera un paso aparte. Motivo (Astra, cierres
 * del bloque D, condicion 2): con lectores que prefieren .gz, un escritor viejo
 * puede mejorar el .json y dejarlo oculto bajo un .gz anterior.
 *
 * ORACULOS (apagado): con .json y .json.gz a la vez, /api/candles sirve el
 * .json; el actualizador y restore publican {AÑO}.json (application/json) y no
 * crean .json.gz. (Encendido): publican .json.gz. El encendido es lo que
 * distingue este codigo del auditado (c470c8f solo conocia JSON).
 */
import { gzipSync } from 'node:zlib'
import { titulo, ver, oraculo, fin, escenario, perfil, A, tok, proveedor, importa, db, guardado } from '../lib.mjs'
import { llama } from '../supabase-falso.mjs'
import { diaM1 } from '../proveedor-falso.mjs'
import { correScript, ejecucionesScripts } from '../script-falso.mjs'
delete process.env.MERCADO_GZIP
const DIA = 86400000
const velasDe = (dia, n = 1440) => diaM1(dia, n).map(c => ({ time: c.timestamp / 1000, open: c.open, high: c.high, low: c.low, close: c.close, volume: 1 }))
const laborables = (desde, hasta) => { const d = []; for (let t = Date.parse(desde + 'T00:00:00Z'); t <= Date.parse(hasta + 'T00:00:00Z'); t += DIA) { const w = new Date(t).getUTCDay(); if (w >= 1 && w <= 5) d.push(new Date(t).toISOString().slice(0, 10)) } return d }
const ENV = { NEXT_PUBLIC_SUPABASE_URL: 'https://falso.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'falsa' }
const subidas = pref => db.log.filter(l => l.op === 'upload' && String(l.payload?.ruta).startsWith(pref))
const candles = (await importa('pages/api/candles.js')).default

titulo('1 · apagado (por defecto): el lector no prefiere gzip')
escenario({ perfiles: [perfil(A)], storage: { 'forex-data': { 'EURUSD/M1/2025.json': JSON.stringify(velasDe('2025-01-06', 1200)), 'EURUSD/M1/2025.json.gz': gzipSync(Buffer.from(JSON.stringify(velasDe('2025-01-06', 1440)))) } } })
const r1 = await llama(candles, { method: 'GET', token: tok(A), query: { pair: 'EURUSD', timeframe: 'M1', from: String(Date.parse('2025-01-06T00:00:00Z') / 1000), to: String(Date.parse('2025-01-07T00:00:00Z') / 1000), year: '2025' } })
oraculo('GZ00', 'con .json (1.200) y .json.gz (1.440), sirve el .json', r1.estado === 200 && r1.cuerpo.count === 1200, `estado ${r1.estado}; ${r1.cuerpo?.count} velas`)

titulo('2 · apagado: los escritores publican solo JSON')
escenario({ storage: { 'forex-data': { 'EURUSD/M1/2026.json': JSON.stringify(laborables('2026-01-02', '2026-01-30').flatMap(d => velasDe(d))) } } })
proveedor.responde = a => diaM1(a.dates.from.toISOString().slice(0, 10))
await correScript('scripts/actualizar-diario.js', { ahora: '2026-02-04T06:00:00Z', argv: ['--subir'], env: ENV })
const up2 = subidas('EURUSD/')
oraculo('GZ00', 'el actualizador sube EURUSD/M1/2026.json como application/json y no crea .json.gz', up2.length >= 1 && up2.every(l => l.payload.ruta === 'EURUSD/M1/2026.json' && l.payload.contentType === 'application/json') && !Object.hasOwn(db.storage['forex-data'], 'EURUSD/M1/2026.json.gz'), up2.map(l => `${l.payload.ruta} ${l.payload.contentType}`).join(' · '))
oraculo('GZ00', 'lo publicado es el .json y se lee con el 2-feb', guardado('EURUSD/M1/2026').formato === 'json' && guardado('EURUSD/M1/2026').velas.some(v => new Date(v.time * 1000).toISOString().startsWith('2026-02-02')))
escenario({ storage: { 'forex-data': {} } })
proveedor.responde = ({ dates }) => { const out = []; for (let t = Date.UTC(2026, 0, 1); t < dates.to.getTime(); t += DIA) { const d = new Date(t); if (d.getUTCDay() % 6) out.push(...diaM1(d.toISOString().slice(0, 10))) } return out }
await correScript('scripts/restore-2026.js', { ahora: '2026-01-16T12:00:00Z', argv: ['--subir'] })
const up3 = db.log.filter(l => l.op === 'upload' && /^[A-Z]{6}\/M1\//.test(String(l.payload?.ruta)))
oraculo('GZ00', 'restore sube {PAR}/M1/2026.json como application/json', up3.length === 6 && up3.every(l => /\/M1\/2026\.json$/.test(l.payload.ruta) && l.payload.contentType === 'application/json'), up3.map(l => l.payload.ruta).join(' '))

titulo('3 · encendido (MERCADO_GZIP=1): gzip')
escenario({ storage: { 'forex-data': { 'EURUSD/M1/2026.json': JSON.stringify(laborables('2026-01-02', '2026-01-30').flatMap(d => velasDe(d))) } } })
proveedor.responde = a => diaM1(a.dates.from.toISOString().slice(0, 10))
await correScript('scripts/actualizar-diario.js', { ahora: '2026-02-04T06:00:00Z', argv: ['--subir'], env: { ...ENV, MERCADO_GZIP: '1' } })
const up4 = subidas('EURUSD/')
oraculo('GZ00', 'con el interruptor encendido, el actualizador sube EURUSD/M1/2026.json.gz (application/gzip)', up4.length >= 1 && up4.every(l => l.payload.ruta === 'EURUSD/M1/2026.json.gz' && l.payload.contentType === 'application/gzip'), up4.map(l => `${l.payload.ruta} ${l.payload.contentType}`).join(' · '))
ver('control (H06): ningun script por timeout', ejecucionesScripts.every(e => e.terminoPor !== 'timeout'))
fin()
