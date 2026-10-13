// Las dependencias REALES de las ordenes del mercado v1 (lib/mercado/orden-v1.mjs):
// copia local, descarga de forex-data, el almacen del bucket privado «mercado»
// (supabase-js con service_role), el fichero de aceptaciones y el informe.
// BF-02 (bloque G, punto 8): todo error ajeno sale de aqui SANEADO («clase
// codigo», lib/mercado/errores.mjs): ni URL, ni clave, ni contenido. Las
// claves se toman del entorno o de .env.local, como los demas scripts; nunca
// se escriben.
import { createClient } from '@supabase/supabase-js'
import { readFileSync, readdirSync, writeFileSync } from 'fs'
import { createHash } from 'crypto'
import path from 'path'
import { fileURLToPath } from 'url'
import * as F from '../lib/mercado/ficheros.mjs'
import * as L from '../lib/mercado/limites.mjs'
import { texto, errorPropio } from '../lib/mercado/errores.mjs'
import { cargaAceptados } from '../lib/mercado/aceptados.mjs'
import { BUCKET } from '../lib/mercado/publica-v1.mjs'

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
export const FICHERO_ACEPTACIONES = path.join(RAIZ, 'lib/mercado/huecos-aceptados.jsonl')
// el primer año del mercado (spec § 7.3: 2,75 años desde 2024)
const ANIO_INICIAL = 2024
const saneado = (que, e) => errorPropio(`${que}: ${e?.propio ? e.message : texto(e)}`)

function claves() {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) return { url: process.env.NEXT_PUBLIC_SUPABASE_URL.trim(), key: process.env.SUPABASE_SERVICE_ROLE_KEY.trim() }
  const env = readFileSync(path.join(RAIZ, '.env.local'), 'utf8')
    .split('\n').filter(l => l && !l.startsWith('#'))
    .reduce((a, l) => { const eq = l.indexOf('='); if (eq > 0) a[l.slice(0, eq).trim()] = l.slice(eq + 1).trim().replace(/^["']|["']$/g, ''); return a }, {})
  return { url: env.NEXT_PUBLIC_SUPABASE_URL, key: env.SUPABASE_SERVICE_ROLE_KEY }
}
let cliente = null
function sb() {
  if (cliente) return cliente
  let c
  try { c = claves() } catch (e) { throw saneado('claves de Supabase', e) }
  if (!c.url || !c.key) throw errorPropio('faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY')
  cliente = createClient(c.url, c.key, { global: { fetch: L.fetchConLimite((...a) => globalThis.fetch(...a), F.LIMITES.grandeMs) } })
  return cliente
}

// el almacen del bucket privado «mercado»
function almacen() {
  const b = () => sb().storage.from(BUCKET)
  return {
    async lee(ruta) {
      let r
      try { r = await b().download(ruta) } catch (e) { throw saneado(`leer ${ruta}`, e) }
      if (r.error) { if (F.noExiste(r.error)) return null; throw saneado(`leer ${ruta}`, r.error) }
      return Buffer.from(await r.data.arrayBuffer())
    },
    async sube(ruta, bytes, { upsert = false } = {}) {
      let r
      try { r = await b().upload(ruta, bytes, { upsert, contentType: ruta.endsWith('.json') ? 'application/json' : 'application/octet-stream' }) } catch (e) { throw saneado(`subir ${ruta}`, e) }
      if (!r.error) return 'ok'
      if (String(r.error.statusCode) === '409') return 'existe'
      throw saneado(`subir ${ruta}`, r.error)
    },
    async borra(ruta) {
      let r
      try { r = await b().remove([ruta]) } catch (e) { throw saneado(`borrar ${ruta}`, e) }
      if (r.error) throw saneado(`borrar ${ruta}`, r.error)
    },
    async lista(prefijo) {
      const out = []
      const recorre = async carpeta => {
        for (let offset = 0; ; offset += 1000) {
          let r
          try { r = await b().list(carpeta, { limit: 1000, offset, sortBy: { column: 'name', order: 'asc' } }) } catch (e) { throw saneado(`listar ${carpeta}`, e) }
          if (r.error) throw saneado(`listar ${carpeta}`, r.error)
          for (const x of r.data) {
            const ruta = `${carpeta}/${x.name}`
            if (x.id == null) await recorre(ruta)
            else out.push({ ruta, bytes: Number(x.metadata?.size ?? -1) })
          }
          if (r.data.length < 1000) break
        }
      }
      await recorre(prefijo.replace(/\/$/, ''))
      return out
    },
  }
}

// la copia local verificada: PAR_AAAA.json(.gz) con su .sha256 al lado (obligatorio)
async function leeCopia(base, par) {
  let nombres
  try { nombres = readdirSync(base) } catch (e) { throw saneado(`copia ${base}`, e) }
  const anuales = nombres.filter(n => new RegExp(`^${par}_\\d{4}\\.json(\\.gz)?$`).test(n)).sort()
  if (!anuales.length) throw errorPropio(`copia ${base}: no hay ficheros de ${par}`)
  let velas = []
  for (const n of anuales) {
    const ruta = path.join(base, n)
    let bytes, esperado
    try { bytes = readFileSync(ruta); esperado = readFileSync(ruta + '.sha256', 'utf8').trim().split(/\s+/)[0] } catch (e) { throw saneado(`copia ${n} (o su .sha256)`, e) }
    if (createHash('sha256').update(bytes).digest('hex') !== esperado) throw errorPropio(`copia ${n}: el sha256 no es el de su .sha256`)
    const r = F.decodifica(bytes, ruta)
    if (r.estado !== 'ok') throw errorPropio(`copia ${n}: ${r.motivo}`)
    velas = velas.concat(r.velas)
  }
  return velas
}
// los anuales del bucket forex-data (solo con --descarga-autorizada)
async function descarga(par) {
  let velas = []
  for (let anio = ANIO_INICIAL; anio <= new Date().getUTCFullYear(); anio++) {
    let r
    try { r = await F.leerVigente(sb(), par, anio, F.LIMITES) } catch (e) { throw saneado(`descargar ${par} ${anio}`, e) }
    if (r.estado === 'no-existe') continue
    if (r.estado !== 'ok') throw errorPropio(`descargar ${par} ${anio}: ${r.motivo ?? r.estado}`)
    velas = velas.concat(r.velas)
  }
  return velas
}

export function dependencias() {
  const aceptados = cargaAceptados()
  return {
    leeCopia, descarga, almacen,
    leeTexto: async () => readFileSync(FICHERO_ACEPTACIONES, 'utf8'),
    escribeTexto: async t => writeFileSync(FICHERO_ACEPTACIONES, t),
    escribeInforme: async (ruta, t) => writeFileSync(ruta, t),
    diasAceptadosDe: par => new Map([...aceptados].filter(([k]) => k.startsWith(par + '|')).map(([k, v]) => [k.slice(par.length + 1), v])),
    ahora: () => new Date().toISOString(),
  }
}
