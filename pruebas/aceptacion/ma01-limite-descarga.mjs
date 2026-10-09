/**
 * MA01 · EL TOPE ES UN LIMITE DE VERDAD (Astra MD-01 sobre 55781cb; CTO 9-oct-2026)
 *
 * Antes, el tope de MERCADO_TOPE_BYTES era una comprobacion previa con el
 * tamaño de info(): si el objeto cambiaba entre info() y la descarga, si info()
 * decia «no existe» y despues aparecia, o si la relectura bajo el cerrojo
 * servia mas bytes de los autorizados, se descargaba entero (codigo 0).
 * Decision del CTO:
 *   · la descarga se corta al recibir mas bytes que los autorizados
 *     (lib/mercado/limites.mjs fetchConTope: el cuerpo se cuenta al llegar);
 *   · se ata a la identidad (etag) y al tamaño de info(): un tamaño nulo o
 *     ausente, un «no existe», o una identidad cambiada, no se descargan
 *     (codigo 3);
 *   · un intento fallido cuenta los bytes recibidos y, si no se saben, el
 *     tamaño esperado;
 *   · igual en la lectura inicial, la relectura bajo el cerrojo y la
 *     verificacion.
 *
 * ORACULOS: (1) el envoltorio corta un flujo en memoria al pasar del maximo,
 * con control positivo; rechaza etag distinto o Content-Length mayor sin leer
 * el cuerpo. (2) los intercalados de Astra con Storage falso: objeto
 * sustituido por otro mayor entre info() y la descarga; objeto que aparece
 * tras el 404; relectura que sirve mas de lo autorizado; info() sin tamaño;
 * descarga fallida que cuenta el tamaño esperado.
 */
import { titulo, ver, oraculo, fin, escenario, proveedor, db, importa } from '../lib.mjs'
import { createClient } from '../supabase-falso.mjs'
import { diaM1 } from '../proveedor-falso.mjs'
import { correScript, ejecucionesScripts } from '../script-falso.mjs'
import { gzipSync } from 'node:zlib'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
const L = await importa('lib/mercado/limites.mjs').catch(() => ({}))
const DIA = 86400000
const ENV = { NEXT_PUBLIC_SUPABASE_URL: 'https://falso.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'falsa' }

titulo('1 · el envoltorio de fetch corta al recibir mas de lo autorizado')
const TROZO = 64 * 1024
// un servidor en memoria: un cuerpo de n trozos que cuenta cuantos le piden
function respuesta(n, cab = {}) {
  const fuente = { servidos: 0 }
  const body = new ReadableStream({ pull(c) { if (fuente.servidos >= n) return c.close(); fuente.servidos++; c.enqueue(new Uint8Array(TROZO)) } }, { highWaterMark: 0 })
  return { fuente, res: new Response(body, { status: 200, headers: { etag: '"abc"', ...cab } }) }
}
async function prueba(n, cfg, cab) {
  if (!L.fetchConTope) return { error: 'sin fetchConTope', fuente: { servidos: null } }
  const { fuente, res } = respuesta(n, cab)
  const f = L.fetchConTope(async () => res)
  const senal = new AbortController().signal
  const c = L.atarDescarga(senal, cfg)
  try { const r = await f('http://x/objeto', { signal: senal }); const b = await r.arrayBuffer(); return { bytes: b.byteLength, fuente, c } }
  catch (e) { return { error: String(e?.message ?? e), fuente, c } }
}
const a = await prueba(10, { max: 100 * 1024, etag: 'abc' })
oraculo('MD-01', 'cuerpo de 10 trozos de 64 KiB con maximo 100 KiB: error de tope, y la fuente solo sirve 2 trozos (no los 10)', !!a.error && /tope/i.test(a.error) && a.fuente.servidos === 2 && a.c?.recibidos === 2 * TROZO, `${a.error ?? a.bytes} · servidos ${a.fuente.servidos} · recibidos ${a.c?.recibidos}`)
const a2 = await prueba(10, { max: 10 * TROZO, etag: 'abc' })
oraculo('MD-01', 'control positivo: con el maximo justo en el tamaño, llega entero (655.360 bytes) y cuenta lo recibido', a2.bytes === 10 * TROZO && a2.c?.recibidos === 10 * TROZO, `${a2.error ?? a2.bytes} · recibidos ${a2.c?.recibidos}`)
const a3 = await prueba(10, { max: 10 * TROZO, etag: 'otro' })
oraculo('MD-01', 'etag de la respuesta distinto del de info(): error de identidad sin leer el cuerpo', !!a3.error && /identidad/i.test(a3.error) && a3.fuente.servidos === 0, `${a3.error ?? a3.bytes} · servidos ${a3.fuente.servidos}`)
const a4 = await prueba(10, { max: TROZO, etag: 'abc' }, { 'content-length': String(10 * TROZO) })
oraculo('MD-01', 'Content-Length mayor que el maximo: error de tope sin leer el cuerpo', !!a4.error && /tope/i.test(a4.error) && a4.fuente.servidos === 0, `${a4.error ?? a4.bytes} · servidos ${a4.fuente.servidos}`)

titulo('2 · el actualizador: los intercalados de Astra (Storage falso, sin proveedor real)')
const velasDe = (dia, n = 1440) => diaM1(dia, n).map(c => ({ time: c.timestamp / 1000, open: c.open, high: c.high, low: c.low, close: c.close, volume: 1 }))
const historial = hasta => { const v = [...velasDe('2026-01-01')]; for (let t = Date.parse('2026-01-02T00:00:00Z'); t <= Date.parse(hasta + 'T00:00:00Z'); t += DIA) { const w = new Date(t).getUTCDay(), d = new Date(t).toISOString().slice(0, 10); if (w >= 1 && w <= 5) v.push(...velasDe(d)); else if (w === 0) v.push(...velasDe(d).slice(22 * 60)) } return v }
const GZ = 'AUDUSD/M1/2026.json.gz'
const gzDe = v => gzipSync(Buffer.from(JSON.stringify(v)))
const filas = dia => JSON.stringify(new Date(dia + 'T00:00:00Z').getUTCDay() === 0 ? diaM1(dia).slice(22 * 60) : diaM1(dia))
const bien = () => { proveedor.http = (url, n, { dia }) => ({ status: 200, body: filas(dia) }) }
const corre = env => correScript('scripts/actualizar-diario.js', { ahora: '2026-02-03T06:00:00Z', argv: ['--subir', '--pares', 'AUDUSD'], env: { ...ENV, MERCADO_CACHE: fs.mkdtempSync(path.join(os.tmpdir(), 'ma01-')), ...env } })
const reales = () => db.log.filter(l => l.op === 'download' && String(l.payload).startsWith('AUDUSD/M1/2026') && l.encontrado !== false)
// las del actualizador (application/gzip); las del «otro escritor» de la prueba van sin contentType
const subidas = () => db.log.filter(l => l.op === 'upload' && String(l.payload?.ruta).startsWith('AUDUSD/M1/2026') && l.payload?.contentType === 'application/gzip')
const transf = r => r.salida.find(l => /Transferencia/.test(l)) ?? '(sin linea)'
const otro = () => createClient('https://falso.supabase.co', 'falsa')
const base = historial('2026-01-30')
const mayor = historial('2026-02-01')

{ // 2a · entre info() y la descarga, otro escritor pone un objeto mayor
  escenario({ storage: { 'forex-data': { [GZ]: gzDe(base) } } }); bien()
  const tam = Buffer.byteLength(db.storage['forex-data'][GZ])
  let hecho = false
  db.pausa = async c => { if (c.op === 'download' && c.payload === GZ && !hecho) { hecho = true; db.storage['forex-data'][GZ] = gzDe(mayor) } }
  const r = await corre({ MERCADO_TOPE_BYTES: String(tam) })
  db.pausa = null
  const nuevo = Buffer.byteLength(db.storage['forex-data'][GZ])
  oraculo('MD-01', 'objeto sustituido por otro mayor tras info(): no se acepta (codigo 3), no se pide nada al proveedor ni se sube nada', nuevo > tam && r.codigo === 3 && proveedor.llamadas.length === 0 && subidas().length === 0, `codigo ${r.codigo} · ${proveedor.llamadas.length} llamadas · ${subidas().length} subidas · ${r.salida.find(l => /AUDUSD\/M1/.test(l)) ?? ''}`)
  oraculo('MD-01', 'y la transferencia cuenta lo recibido de verdad (en el doble, el cuerpo entero), no 0', new RegExp(`: 1 descarga\\(s\\), ${nuevo} bytes`).test(transf(r)), transf(r))
}
{ // 2b · info() dice «no existe» y el objeto aparece antes del GET
  escenario({ storage: { 'forex-data': {} } }); bien()
  let puesto = false
  db.pausa = async c => { if (c.op === 'info' && String(c.payload).endsWith('2026.json') && !puesto) { puesto = true; setTimeout(() => { db.storage['forex-data'][GZ] = gzDe(mayor) }, 0) } }
  const r = await corre({ MERCADO_TOPE_BYTES: '0' })
  db.pausa = null
  oraculo('MD-01', 'tope 0 y el año aparece tras el 404 de info(): ninguna descarga real y codigo 3', reales().length === 0 && r.codigo === 3, `${reales().length} descargas · codigo ${r.codigo} · ${r.salida.find(l => /AUDUSD\/M1/.test(l)) ?? ''}`)
}
{ // 2c · bajo el cerrojo, la relectura sirve mas bytes de los que info() autorizo
  escenario({ storage: { 'forex-data': { [GZ]: gzDe(base) } } })
  const tam = Buffer.byteLength(db.storage['forex-data'][GZ])
  let fase = 0
  proveedor.http = async (url, n, { dia }) => {
    if (fase === 0) { fase = 1; const v = [...base]; v.pop(); await otro().storage.from('forex-data').upload(GZ, gzDe(v), { upsert: true }) }   // cambia la firma: habra relectura
    return { status: 200, body: filas(dia) }
  }
  db.pausa = async c => { if (c.op === 'download' && c.payload === GZ && fase === 1 && db.log.some(l => l.op === 'upload' && String(l.payload?.ruta).startsWith('_cerrojos/'))) { fase = 2; db.storage['forex-data'][GZ] = gzDe(mayor) } }
  const r = await corre({ MERCADO_TOPE_BYTES: String(3 * tam) })
  db.pausa = null
  oraculo('MD-01', 'la relectura (bajo el cerrojo) que sirve mas de lo que info() autorizo no se acepta: nada subido por el actualizador y codigo 3', fase === 2 && subidas().length === 0 && r.codigo === 3, `fase ${fase} · codigo ${r.codigo} · ${subidas().length} subidas · ${r.salida.find(l => /AUDUSD\/M1/.test(l)) ?? ''}`)
}
{ // 2d · info() sin tamaño
  escenario({ storage: { 'forex-data': { [GZ]: gzDe(base) } } }); bien()
  db.infoSinTamano = true
  const r = await corre({ MERCADO_TOPE_BYTES: '100000000' })
  db.infoSinTamano = false
  oraculo('MD-01', 'info() sin tamaño: no se descarga y codigo 3', reales().length === 0 && r.codigo === 3, `${reales().length} descargas · codigo ${r.codigo} · ${r.salida.find(l => /AUDUSD\/M1/.test(l)) ?? ''}`)
}
{ // 2e · la descarga falla: cuenta el tamaño esperado
  escenario({ storage: { 'forex-data': { [GZ]: gzDe(base) } } }); bien()
  const tam = Buffer.byteLength(db.storage['forex-data'][GZ])
  db.falla = c => (c.op === 'download' && c.payload === GZ ? { name: 'StorageUnknownError', message: 'fetch failed' } : null)
  const r = await corre({ MERCADO_TOPE_BYTES: '100000000' })
  db.falla = null
  oraculo('MD-01', 'descarga fallida sin bytes conocidos: la transferencia cuenta el tamaño esperado de info()', new RegExp(`: 1 descarga\\(s\\), ${tam} bytes`).test(transf(r)), `${transf(r)} (esperados ${tam})`)
}
proveedor.http = null
ver('control (H06): ningun script por timeout', ejecucionesScripts.every(e => e.terminoPor !== 'timeout'))
fin()
