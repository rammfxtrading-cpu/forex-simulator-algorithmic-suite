// MERCADO V1 · CONFIRMAR LA COPIA LOCAL DE LOS ANUALES 2024–2025 SIN DESCARGARLOS
// (etapa 2; CTO 14-oct, decision 1, opcion a). SOLO LECTURA: info() de Storage
// (metadatos; ninguna descarga) y la copia local con su .sha256.
//
//   node scripts/mercado-v1-confirma-copia.mjs --consulta-autorizada \
//        --listado <storage-forex-data.json del 4-oct> --copia <carpeta de la copia del 5-oct>
// Por cada par y año (2024, 2025): info() del .json.gz (no tiene que existir: lo
// vigente es el .json) y del .json; tamaño = listado = copia; alguna fecha de
// info() del 20-jul; la copia cuadra con su .sha256. Codigos: 0 todo cuadra ·
// 1 algo no cuadra (para y avisa) · 4 uso. La logica: lib/mercado/copia-v1.mjs.
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { createHash } from 'crypto'
import path from 'path'
import * as F from '../lib/mercado/ficheros.mjs'
import * as L from '../lib/mercado/limites.mjs'
import { texto } from '../lib/mercado/errores.mjs'
import { confirmaCopia } from '../lib/mercado/copia-v1.mjs'
import { PARES } from '../lib/mercado/orden-v1.mjs'
import { claves } from './mercado-v1-dependencias.mjs'

const a = process.argv.slice(2)
const val = k => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : null }
if (a.length !== 5 || a[0] !== '--consulta-autorizada' || !val('--listado') || !val('--copia')) {
  console.log('Uso: node scripts/mercado-v1-confirma-copia.mjs --consulta-autorizada --listado <json> --copia <carpeta>')
  console.log('=== ⚠️ ATENCION: no se ha consultado nada (codigo 4) ===')
  process.exit(4)
}
const listado = JSON.parse(readFileSync(val('--listado'), 'utf8'))
const dir = val('--copia')
const { url, key } = claves()
const sb = createClient(url, key, { global: { fetch: L.fetchConLimite((...x) => globalThis.fetch(...x), F.LIMITES.pequenaMs) } })
const consulta = async ruta => {
  let r
  try { r = await sb.storage.from(F.BUCKET).info(ruta) } catch (e) { return { estado: 'error', motivo: texto(e) } }
  if (r.error) return F.noExiste(r.error) ? { estado: 'no-existe' } : { estado: 'error', motivo: texto(r.error) }
  return { estado: 'ok', data: r.data }
}
console.log(`=== MERCADO V1 · CONFIRMAR LA COPIA (solo info(), sin descargas) · ${new Date().toISOString()} ===`)
const r = await confirmaCopia({
  pares: PARES, anios: [2024, 2025], listado, dia: '2026-07-20',
  info: async (par, anio) => {
    const gz = await consulta(`${par}/M1/${anio}.json.gz`)
    if (gz.estado === 'ok') return { estado: 'ok', ruta: `${par}/M1/${anio}.json.gz`, size: gz.data?.size, fechas: {} }
    if (gz.estado === 'error') return gz
    const j = await consulta(`${par}/M1/${anio}.json`)
    if (j.estado !== 'ok') return j
    const d = j.data ?? {}
    const fechas = Object.fromEntries(Object.entries(d).filter(([k, v]) => k !== 'metadata' && typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)))
    return { estado: 'ok', ruta: `${par}/M1/${anio}.json`, size: d.size, fechas }
  },
  copia: async nombre => {
    const f = path.join(dir, nombre)
    if (!existsSync(f) || !existsSync(f + '.sha256')) return null
    const b = readFileSync(f)
    return { bytes: b.length, shaOk: createHash('sha256').update(b).digest('hex') === readFileSync(f + '.sha256', 'utf8').trim().split(/\s+/)[0] }
  },
})
for (const l of r.lineas) console.log(l)
if (r.fallos.length) { console.log(`=== ⚠️ ATENCION: ${r.fallos.length} anual(es) no cuadran: PARAR Y AVISAR (codigo 1) ===`); process.exitCode = 1 }
else console.log(`=== ✓ ${r.confirmados.length} anuales confirmados: la copia es lo vigente (codigo 0) ===`)
