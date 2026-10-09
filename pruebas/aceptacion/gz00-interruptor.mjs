/**
 * GZ00 · UN SOLO FORMATO: EL INTERRUPTOR YA NO DECIDE (CTO 9-oct-2026; antes:
 * bloque E, punto 6, 5-oct, compresion apagada por defecto)
 *
 * CAMBIO DE CONTRATO (marcado para Astra): el 5-oct los escritores publicaban
 * solo .json y /api/candles, con .json y .json.gz a la vez, servia el .json.
 * Decision del CTO del 9-oct: todos los escritores publican .json.gz y todos
 * los lectores leen el .json.gz y, si no existe, el .json, sea cual sea
 * MERCADO_GZIP. El riesgo del bloque D (un escritor viejo deja su mejora
 * oculta bajo un .gz) se cierra con la guarda de publicarAnio (MD03) y con el
 * orden de despliegue (lectores y escritores juntos en main antes del arranque).
 * G3 sigue: bytes gzip bajo un nombre .json son un error visible.
 *
 * ORACULOS: con .json y .json.gz, /api/candles sirve el .json.gz; gzip bajo
 * .json, error (API y actualizador); el actualizador y restore publican
 * {AÑO}.json.gz (application/gzip) sin tocar el .json; con MERCADO_GZIP=1 y
 * con MERCADO_GZIP=0, lo mismo. (c470c8f solo conocia JSON: sale en rojo.)
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

titulo('1 · el lector: primero el .json.gz, sin interruptor')
escenario({ perfiles: [perfil(A)], storage: { 'forex-data': { 'EURUSD/M1/2025.json': JSON.stringify(velasDe('2025-01-06', 1200)), 'EURUSD/M1/2025.json.gz': gzipSync(Buffer.from(JSON.stringify(velasDe('2025-01-06', 1440)))) } } })
const r1 = await llama(candles, { method: 'GET', token: tok(A), query: { pair: 'EURUSD', timeframe: 'M1', from: String(Date.parse('2025-01-06T00:00:00Z') / 1000), to: String(Date.parse('2025-01-07T00:00:00Z') / 1000), year: '2025' } })
oraculo('GZ00', 'con .json (1.200) y .json.gz (1.440), sirve el .json.gz', r1.estado === 200 && r1.cuerpo.count === 1440, `estado ${r1.estado}; ${r1.cuerpo?.count} velas`)

titulo('1b · bytes gzip bajo un nombre .json → error visible (Astra, cierres-3; bloque G, punto 3; sigue el 9-oct)')
escenario({ perfiles: [perfil(A)], storage: { 'forex-data': { 'EURUSD/M1/2025.json': gzipSync(Buffer.from(JSON.stringify(velasDe('2025-01-06', 1300)))) } } })
const r1b = await llama(candles, { method: 'GET', token: tok(A), query: { pair: 'EURUSD', timeframe: 'M1', from: String(Date.parse('2025-01-06T00:00:00Z') / 1000), to: String(Date.parse('2025-01-07T00:00:00Z') / 1000), year: '2025' } })
oraculo('GZ00', 'la API no sirve el contenido comprimido: error (503 con mensaje), no 200 con 1.300 velas', r1b.estado === 503 && typeof r1b.cuerpo?.error === 'string', `estado ${r1b.estado}; ${r1b.cuerpo?.count ?? r1b.cuerpo?.error}`)
escenario({ storage: { 'forex-data': { 'EURUSD/M1/2026.json': gzipSync(Buffer.from(JSON.stringify(laborables('2026-01-02', '2026-01-30').flatMap(d => velasDe(d))))) } } })
proveedor.responde = a => diaM1(a.dates.from.toISOString().slice(0, 10))
const s1b = await correScript('scripts/actualizar-diario.js', { ahora: '2026-02-04T06:00:00Z', argv: ['--subir'], env: ENV })
oraculo('GZ00', 'el actualizador tampoco lo lee: «✗ no se pudo leer» con la causa (gzip) y sin publicar EURUSD', s1b.salida.some(l => /✗ no se pudo leer EURUSD\/M1\/2026\.json: .*gzip/i.test(l)) && !subidas('EURUSD/').length, s1b.salida.find(l => /EURUSD\/M1/.test(l)) ?? '')

titulo('2 · los escritores publican .json.gz y no tocan el .json')
const JSON2 = JSON.stringify(laborables('2026-01-02', '2026-01-30').flatMap(d => velasDe(d)))
escenario({ storage: { 'forex-data': { 'EURUSD/M1/2026.json': JSON2 } } })
proveedor.responde = a => diaM1(a.dates.from.toISOString().slice(0, 10))
await correScript('scripts/actualizar-diario.js', { ahora: '2026-02-04T06:00:00Z', argv: ['--subir'], env: ENV })
const up2 = subidas('EURUSD/')
oraculo('GZ00', 'el actualizador sube EURUSD/M1/2026.json.gz como application/gzip y el .json queda igual', up2.length >= 1 && up2.every(l => l.payload.ruta === 'EURUSD/M1/2026.json.gz' && l.payload.contentType === 'application/gzip') && db.storage['forex-data']['EURUSD/M1/2026.json'] === JSON2, up2.map(l => `${l.payload.ruta} ${l.payload.contentType}`).join(' · '))
oraculo('GZ00', 'lo publicado es el .json.gz y se lee con el 2-feb', guardado('EURUSD/M1/2026').formato === 'gz' && guardado('EURUSD/M1/2026').velas.some(v => new Date(v.time * 1000).toISOString().startsWith('2026-02-02')))
escenario({ storage: { 'forex-data': {} } })
proveedor.responde = ({ dates }) => { const out = []; for (let t = Date.UTC(2026, 0, 1); t < dates.to.getTime(); t += DIA) { const d = new Date(t); if (d.getUTCDay() % 6) out.push(...diaM1(d.toISOString().slice(0, 10))) } return out }
await correScript('scripts/restore-2026.js', { ahora: '2026-01-16T12:00:00Z', argv: ['--subir'] })
const up3 = db.log.filter(l => l.op === 'upload' && /^[A-Z]{6}\/M1\//.test(String(l.payload?.ruta)))
oraculo('GZ00', 'restore sube {PAR}/M1/2026.json.gz como application/gzip', up3.length === 6 && up3.every(l => /\/M1\/2026\.json\.gz$/.test(l.payload.ruta) && l.payload.contentType === 'application/gzip'), up3.map(l => l.payload.ruta).join(' '))

titulo('3 · MERCADO_GZIP=1 o =0: lo mismo')
const up4 = []
for (const v of ['1', '0']) {
  escenario({ storage: { 'forex-data': { 'EURUSD/M1/2026.json': JSON.stringify(laborables('2026-01-02', '2026-01-30').flatMap(d => velasDe(d))) } } })
  proveedor.responde = a => diaM1(a.dates.from.toISOString().slice(0, 10))
  await correScript('scripts/actualizar-diario.js', { ahora: '2026-02-04T06:00:00Z', argv: ['--subir'], env: { ...ENV, MERCADO_GZIP: v } })
  up4.push(...subidas('EURUSD/').map(l => `${v}:${l.payload.ruta} ${l.payload.contentType}`))
}
oraculo('GZ00', 'con MERCADO_GZIP=1 y con MERCADO_GZIP=0, el actualizador sube EURUSD/M1/2026.json.gz (application/gzip)', up4.join() === '1:EURUSD/M1/2026.json.gz application/gzip,0:EURUSD/M1/2026.json.gz application/gzip', up4.join(' · '))
ver('control (H06): ningun script por timeout', ejecucionesScripts.every(e => e.terminoPor !== 'timeout'))
fin()
