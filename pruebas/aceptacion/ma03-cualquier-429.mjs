/**
 * MA03 · CUALQUIER 429 CORTA TODO EN ESE MOMENTO (Astra MD-03; CTO 9-oct-2026)
 *
 * Antes: un 429 con Retry-After que cabia se esperaba y se reintentaba (CTO
 * 6-oct, BF08). Decision del CTO del 9-oct, que sustituye a esa excepcion:
 * cualquier 429, tambien con Retry-After, corta todo en ese momento, en el
 * diario y en el manual (el mismo actualizador); se publica lo contiguo ya
 * conseguido. El log lleva la marca «PROVEEDOR LIMITA (HTTP 429)» con la que
 * el orquestador diario corta los pares siguientes.
 *
 * ORACULOS: la contraprueba de Astra (AUDUSD hasta el 1-feb; el 2-feb da 429
 * con Retry-After: 1 y despues 200; el 3-feb, 200): una sola peticion, la
 * del 2-feb; ninguna espera; marca de corte; codigo 2; nada publicado de
 * AUDUSD (no habia nada contiguo). Igual con el entorno del diario
 * (MERCADO_CACHE y tope) y sin el (manual). pideUrl: un 429 con Retry-After
 * que cabe lanza «limite» sin llamar a espera.
 */
import { titulo, oraculo, fin, escenario, proveedor, guardado, importa, ver } from '../lib.mjs'
import { diaM1 } from '../proveedor-falso.mjs'
import { correScript, ejecucionesScripts } from '../script-falso.mjs'
import { gzipSync } from 'node:zlib'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
const DIA = 86400000
const ENV = { NEXT_PUBLIC_SUPABASE_URL: 'https://falso.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'falsa' }
const velasDe = (dia, n = 1440) => diaM1(dia, n).map(c => ({ time: c.timestamp / 1000, open: c.open, high: c.high, low: c.low, close: c.close, volume: 1 }))
const historial = hasta => { const v = [...velasDe('2026-01-01')]; for (let t = Date.parse('2026-01-02T00:00:00Z'); t <= Date.parse(hasta + 'T00:00:00Z'); t += DIA) { const w = new Date(t).getUTCDay(), d = new Date(t).toISOString().slice(0, 10); if (w >= 1 && w <= 5) v.push(...velasDe(d)); else if (w === 0) v.push(...velasDe(d).slice(22 * 60)) } return v }
const GZ = 'AUDUSD/M1/2026.json.gz'
const en = (arr, d) => (arr || []).filter(v => new Date(v.time * 1000).toISOString().startsWith(d)).length
const pedidas = () => proveedor.llamadas.map(l => `${l.instrumento.toUpperCase()} ${l.desde.slice(0, 10)}`)
const filas = dia => JSON.stringify(new Date(dia + 'T00:00:00Z').getUTCDay() === 0 ? diaM1(dia).slice(22 * 60) : diaM1(dia))

for (const [nombre, env] of [['diario (MERCADO_CACHE y tope)', { MERCADO_CACHE: fs.mkdtempSync(path.join(os.tmpdir(), 'ma03-')), MERCADO_TOPE_BYTES: '45000000' }], ['manual (sin variables)', {}]]) {
  titulo(`${nombre}: 429 con Retry-After: 1 y despues 200`)
  escenario({ storage: { 'forex-data': { [GZ]: gzipSync(Buffer.from(JSON.stringify(historial('2026-02-01')))) } } })
  proveedor.http = (url, n, { dia }) => (dia === '2026-02-02' && n === 1 ? { status: 429, headers: { 'Retry-After': '1' }, body: '' } : { status: 200, body: filas(dia) })
  const r = await correScript('scripts/actualizar-diario.js', { ahora: '2026-02-04T06:00:00Z', argv: ['--subir', '--pares', 'AUDUSD'], env: { ...ENV, ...env } })
  oraculo('MD-03', `${nombre}: una sola peticion (2-feb), sin esperar el Retry-After ni pedir el 3-feb`, pedidas().join() === 'AUDUSD 2026-02-02' && !r.esperas.includes(1000), `${pedidas().join(', ')} · esperas ${[...new Set(r.esperas)].join(',')}`)
  oraculo('MD-03', `${nombre}: marca «PROVEEDOR LIMITA (HTTP 429)», codigo 2 y nada nuevo publicado`, r.salida.some(l => /PROVEEDOR LIMITA \(HTTP 429\)/.test(l)) && r.codigo === 2 && en(guardado('AUDUSD/M1/2026').velas, '2026-02-02') === 0, `codigo ${r.codigo} · ${r.salida.filter(l => /429/.test(l)).slice(-1).join('')}`)
}

titulo('pideUrl: un 429 con Retry-After que cabe lanza «limite» sin esperar')
{
  const D = await importa('lib/mercado/descarga.mjs').catch(() => null)
  let esperas = 0, pedidas2 = 0
  const fetch = async () => { pedidas2++; return { status: pedidas2 === 1 ? 429 : 200, ok: pedidas2 !== 1, headers: { get: k => (k.toLowerCase() === 'retry-after' ? '1' : null) }, arrayBuffer: async () => new ArrayBuffer(8) } }
  const r = !D ? 'sin modulo' : await D.pideUrl('http://x/dia', { fetch, espera: async () => { esperas++ }, etiqueta: 'X', intentos: 3, limite: Date.now() + 600000 }).then(() => 'ok', e => `${e?.tipo} ${e?.estado ?? ''}`.trim())
  oraculo('MD-03', 'pideUrl: «limite 429» al primer 429, con una sola peticion y ninguna espera', r === 'limite 429' && pedidas2 === 1 && esperas === 0, `${r} · ${pedidas2} peticiones · ${esperas} esperas`)
}
proveedor.http = null
ver('control (H06): ningun script por timeout', ejecucionesScripts.every(e => e.terminoPor !== 'timeout'))
fin()
