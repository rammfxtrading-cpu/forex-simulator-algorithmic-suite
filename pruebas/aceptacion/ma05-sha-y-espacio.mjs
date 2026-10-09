/**
 * MA05 · LA DESCARGA SE CERTIFICA CON EL SHA256 DE LOS METADATOS; LA CACHE,
 * POR PROYECTO Y BUCKET (Astra MD-05; CTO 9-oct-2026)
 *
 * Antes: con un metadata.sha256 que no cuadraba con el cuerpo descargado, la
 * cache lo rechazaba pero el actualizador usaba ese cuerpo y salia con 0.
 * Decision del CTO:
 *   · tras cada descarga de un año, el sha256 del cuerpo se compara con el de
 *     los metadatos (si existe); si no coincide, UN reintento (dentro del
 *     tope) y, si sigue, «no verificado» (codigo 1);
 *   · la clave de la cache incluye el proyecto (de la URL de Supabase, sin
 *     escribirla) y el bucket: la copia de otro proyecto no se usa;
 *   · el comentario de la reserva dice 720 s (no 480).
 *
 * ORACULOS con Storage falso: hash contradictorio persistente en el camino
 * diario (atado) y en el manual → 2 descargas y codigo 1, sin copia en la
 * cache; contradictorio y bien al reintentar (manual) → codigo 0; la copia
 * del proyecto A no vale para el B y sigue valiendo para el A.
 */
import { titulo, ver, oraculo, fin, escenario, proveedor, db, fuente, REPO } from '../lib.mjs'
import { createRequire } from 'node:module'
import { diaM1 } from '../proveedor-falso.mjs'
import { correScript, ejecucionesScripts } from '../script-falso.mjs'
import { gzipSync } from 'node:zlib'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
const DIA = 86400000
const ENV = { NEXT_PUBLIC_SUPABASE_URL: 'https://proyecto-a.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'falsa' }
const velasDe = (dia, n = 1440) => diaM1(dia, n).map(c => ({ time: c.timestamp / 1000, open: c.open, high: c.high, low: c.low, close: c.close, volume: 1 }))
const historial = hasta => { const v = [...velasDe('2026-01-01')]; for (let t = Date.parse('2026-01-02T00:00:00Z'); t <= Date.parse(hasta + 'T00:00:00Z'); t += DIA) { const w = new Date(t).getUTCDay(), d = new Date(t).toISOString().slice(0, 10); if (w >= 1 && w <= 5) v.push(...velasDe(d)); else if (w === 0) v.push(...velasDe(d).slice(22 * 60)) } return v }
const GZ = 'AUDUSD/M1/2026.json.gz'
const sha = b => createHash('sha256').update(b).digest('hex')
const filas = dia => JSON.stringify(new Date(dia + 'T00:00:00Z').getUTCDay() === 0 ? diaM1(dia).slice(22 * 60) : diaM1(dia))
const bien = () => { proveedor.http = (url, n, { dia }) => ({ status: 200, body: filas(dia) }) }
const reales = () => db.log.filter(l => l.op === 'download' && String(l.payload).startsWith('AUDUSD/M1/2026') && l.encontrado !== false)
const corre = (env, ahora = '2026-02-03T06:00:00Z') => correScript('scripts/actualizar-diario.js', { ahora, argv: ['--subir', '--pares', 'AUDUSD'], env: { ...ENV, ...env } })
const linea = r => r.salida.find(l => /AUDUSD\/M1/.test(l)) ?? ''
const A = gzipSync(Buffer.from(JSON.stringify(historial('2026-02-02'))))
const B = gzipSync(Buffer.from(JSON.stringify(historial('2026-02-01'))))
const metaFalsa = () => { db.metadatos['forex-data'] = { [GZ]: { sha256: sha(B), velas: '1' } } }   // los metadatos dicen B; el cuerpo es A

titulo('1 · hash de los metadatos contradictorio, persistente')
for (const [nombre, env] of [['diario (atado, con tope)', () => ({ MERCADO_CACHE: fs.mkdtempSync(path.join(os.tmpdir(), 'ma05-')), MERCADO_TOPE_BYTES: '45000000' })], ['manual', () => ({})]]) {
  escenario({ storage: { 'forex-data': { [GZ]: A } } }); bien(); metaFalsa()
  const e = env()
  const r = await corre(e)
  const copia = e.MERCADO_CACHE ? fs.readdirSync(e.MERCADO_CACHE, { recursive: true }).filter(f => /AUDUSD_2026/.test(String(f))) : []
  oraculo('MD-05', `${nombre}: el cuerpo no da el sha256 de los metadatos: un reintento (2 descargas) y «no verificado», codigo 1`, reales().length === 2 && r.codigo === 1 && /no verificado/.test(linea(r)), `${reales().length} descargas · codigo ${r.codigo} · ${linea(r)}`)
  if (e.MERCADO_CACHE) oraculo('MD-05', `${nombre}: y no queda copia en la cache`, copia.length === 0, copia.join(', '))
}

titulo('2 · contradictorio en la primera descarga, bien en el reintento (manual)')
{
  const C = gzipSync(Buffer.from(JSON.stringify(historial('2026-02-02'))))
  escenario({ storage: { 'forex-data': { [GZ]: B } } }); bien()
  db.metadatos['forex-data'] = { [GZ]: { sha256: sha(C), velas: '1' } }
  let n = 0
  db.pausa = async c => { if (c.op === 'download' && c.payload === GZ && ++n === 2) db.storage['forex-data'][GZ] = C }
  const r = await corre({})
  db.pausa = null
  oraculo('MD-05', 'el reintento trae el cuerpo que dicen los metadatos: sigue bien (codigo 0) con 2 descargas', reales().length >= 2 && r.codigo === 0, `${reales().length} descargas · codigo ${r.codigo} · ${linea(r)}`)
}

titulo('3 · la cache, por proyecto y bucket')
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ma05-esp-'))
  escenario({ storage: { 'forex-data': { [GZ]: A } } }); bien()
  await corre({ MERCADO_CACHE: dir, MERCADO_TOPE_BYTES: '45000000' })
  const primera = reales().length
  db.log.length = 0
  const rb = await corre({ MERCADO_CACHE: dir, MERCADO_TOPE_BYTES: '45000000', NEXT_PUBLIC_SUPABASE_URL: 'https://proyecto-b.supabase.co' })
  oraculo('MD-05', 'mismo objeto, otro proyecto (B): la copia de A no vale y se descarga (1) (A habia descargado 1)', primera === 1 && reales().length === 1, `${reales().length} descargas · ${rb.salida.filter(l => /AUDUSD 2026:/.test(l)).join(' | ')}`)
  db.log.length = 0
  const ra = await corre({ MERCADO_CACHE: dir, MERCADO_TOPE_BYTES: '45000000' })
  oraculo('MD-05', 'y la copia de A sigue valiendo para A (0 descargas): B no la piso', reales().length === 0 && ra.codigo === 0, `${reales().length} descargas · codigo ${ra.codigo}`)
  oraculo('MD-05', 'la URL del proyecto no aparece en el log ni en los nombres de la cache', ![...rb.salida, ...ra.salida].some(l => /proyecto-[ab]/.test(l)) && !fs.readdirSync(dir, { recursive: true }).some(f => /proyecto/.test(String(f))), fs.readdirSync(dir, { recursive: true }).join(', '))
}

titulo('3b · la clave de la cache de Actions, tambien por proyecto y bucket')
{
  const YAML = createRequire(REPO + 'package.json')('yaml')
  let pasos = []
  try { pasos = Object.values(YAML.parse(fuente('.github/workflows/mercado-diario.yml')).jobs)[0].steps ?? [] } catch { pasos = [] }
  const esp = pasos.find(p => p.id === 'espacio')
  const claves = pasos.filter(p => /actions\/cache\/(restore|save)@/.test(String(p.uses ?? ''))).map(p => [p.with?.key, p.with?.['restore-keys']].filter(Boolean).join(' '))
  oraculo('MD-05', 'un paso calcula la huella del proyecto (sha256 de la URL, sin imprimirla) y las claves de restaurar y guardar llevan esa huella y el bucket', !!esp && /sha256sum/.test(String(esp.run)) && !/echo "\$NEXT_PUBLIC_SUPABASE_URL"/.test(String(esp.run)) && claves.length === 2 && claves.every(k => /steps\.espacio\.outputs\.proyecto/.test(k) && /forex-data/.test(k)), claves.join(' | ') || '(sin pasos de cache)')
}

titulo('4 · el comentario de la reserva')
const FIC = (() => { try { return fuente('lib/mercado/ficheros.mjs') } catch { return '' } })()
oraculo('MD-05', 'lib/mercado/ficheros.mjs ya no dice 480 s para la reserva (son 720 s con dos rutas de lectura)', !!FIC && !/480 s/.test(FIC) && /720 s/.test(FIC), (FIC.match(/.*(480|720) s.*/) ?? ['(sin el fichero)'])[0].trim())
proveedor.http = null
ver('control (H06): ningun script por timeout', ejecucionesScripts.every(e => e.terminoPor !== 'timeout'))
fin()
