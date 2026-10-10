/**
 * MC03 · LA RELECTURA BAJO EL CERROJO COMPRUEBA SIEMPRE EL SHA256
 * (Astra MDC-02 sobre b989071; CTO 10-oct-2026)
 *
 * Astra: el manual (sin cache ni tope) releia bajo el cerrojo por el camino
 * sin sha256; con un objeto cambiado durante la descarga del dia (mismos
 * minutos, la primera vela +0,5) y los metadatos con el sha256 anterior,
 * publicaba ese cuerpo, salia con 0 y escribia metadatos nuevos que lo
 * certificaban. El diario lo rechazaba.
 * Decision del CTO: la relectura bajo cerrojo comprueba siempre el sha256 y
 * reintenta con la misma politica, haya tope o no; el tope solo decide el saldo.
 *
 * ORACULOS (Storage y proveedor falsos), en manual y en diario: ninguna subida
 * de AUDUSD, el cierre 1,6 no llega a lo publicado, «no verificado» y codigo 1;
 * la relectura con su reintento (3 descargas del año en total).
 */
import { titulo, ver, oraculo, fin, escenario, proveedor, db } from '../lib.mjs'
import { diaM1 } from '../proveedor-falso.mjs'
import { correScript, ejecucionesScripts } from '../script-falso.mjs'
import { gzipSync } from 'node:zlib'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
const DIA = 86400000
const ENV = { NEXT_PUBLIC_SUPABASE_URL: 'https://falso.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'falsa' }
const velasDe = (dia, n = 1440) => diaM1(dia, n).map(c => ({ time: c.timestamp / 1000, open: c.open, high: c.high, low: c.low, close: c.close, volume: 1 }))
const historial = hasta => { const v = [...velasDe('2026-01-01')]; for (let t = Date.parse('2026-01-02T00:00:00Z'); t <= Date.parse(hasta + 'T00:00:00Z'); t += DIA) { const w = new Date(t).getUTCDay(), d = new Date(t).toISOString().slice(0, 10); if (w >= 1 && w <= 5) v.push(...velasDe(d)); else if (w === 0) v.push(...velasDe(d).slice(22 * 60)) } return v }
const GZ = 'AUDUSD/M1/2026.json.gz'
const sha = b => createHash('sha256').update(b).digest('hex')
const filas = dia => JSON.stringify(new Date(dia + 'T00:00:00Z').getUTCDay() === 0 ? diaM1(dia).slice(22 * 60) : diaM1(dia))
const reales = () => db.log.filter(l => l.op === 'download' && String(l.payload).startsWith('AUDUSD/M1/2026') && l.encontrado !== false)
const delActualizador = () => db.log.filter(l => l.op === 'upload' && String(l.payload?.ruta).startsWith('AUDUSD/M1/2026') && l.payload?.contentType === 'application/gzip')

for (const [nombre, env] of [['manual (sin cache ni tope)', () => ({})], ['diario (cache y tope)', () => ({ MERCADO_CACHE: fs.mkdtempSync(path.join(os.tmpdir(), 'mc03-')), MERCADO_TOPE_BYTES: '45000000' })]]) {
  titulo(nombre)
  const v = historial('2026-02-01')
  const bueno = gzipSync(Buffer.from(JSON.stringify(v)))
  escenario({ storage: { 'forex-data': { [GZ]: bueno } } })
  db.metadatos['forex-data'] = { [GZ]: { sha256: sha(bueno), velas: String(v.length) } }
  // durante la descarga del 2-feb, otro proceso cambia el contenido (la primera vela +0,5) y deja los metadatos viejos
  const malo = v.map((x, i) => (i === 0 ? { ...x, open: x.open + 0.5, high: x.high + 0.5, low: x.low + 0.5, close: x.close + 0.5 } : x))
  let hecho = false
  proveedor.http = async (url, n, { dia }) => {
    if (!hecho) { hecho = true; db.storage['forex-data'][GZ] = gzipSync(Buffer.from(JSON.stringify(malo))) }
    return { status: 200, body: filas(dia) }
  }
  const r = await correScript('scripts/actualizar-diario.js', { ahora: '2026-02-03T06:00:00Z', argv: ['--subir', '--pares', 'AUDUSD'], env: { ...ENV, ...env() } })
  const linea = r.salida.find(l => /AUDUSD\/M1/.test(l)) ?? ''
  oraculo('MDC-02', `${nombre}: no se publica el cuerpo contradictorio (ninguna subida de AUDUSD) y sale con 1 «no verificado»`, hecho && delActualizador().length === 0 && r.codigo === 1 && /no verificado/.test(linea), `codigo ${r.codigo} · ${delActualizador().length} subidas · ${linea}`)
  oraculo('MDC-02', `${nombre}: la relectura con su reintento: 3 descargas del año (inicial + 2 bajo el cerrojo)`, reales().length === 3, `${reales().length} descargas`)
}
proveedor.http = null
ver('control (H06): ningun script por timeout', ejecucionesScripts.every(e => e.terminoPor !== 'timeout'))
fin()
