import { requireSimulador, supabaseAdmin } from '../../lib/authApi'
import { leerRuta, leerVigente, versionVigente } from '../../lib/mercado/ficheros.mjs'

const TIMEFRAMES = {
  M1: 1, M3: 3, M5: 5, M15: 15, M30: 30,
  H1: 60, H2: 120, H3: 180, H4: 240, D1: 1440
}

// Cache en memoria por par y año, VALIDADA POR VERSION (decision del CTO,
// 5-oct-2026). Antes de releer un año se consulta la version del objeto con una
// llamada de metadatos (info: etag), sin descargarlo; solo se descarga si
// cambio. La cache solo se sirve si su version ES la vigente (bloque D, punto 2). Sin caducidad por tiempo: la de 5 minutos (D05) hacia bajar ~28 MB
// cada 5 minutos por instancia y agotaba la transferencia. (Por instancia.)
const cacheVelas = new Map()   // 'PAR_AÑO' → { velas, version }
const cache = {
  get: key => cacheVelas.get(key) ?? null,
  // version null = Storage no dio etag: la proxima consulta no coincidira y se
  // releera (nunca se da por buena una version desconocida)
  set: (key, velas, version = null) => { cacheVelas.set(key, { velas, version }) },
  quita: key => { cacheVelas.delete(key) },
}

// ── Lista cerrada (auditoria S03, 4-oct-2026) ───────────────────────────────
// Los 9 pares que hay en el bucket forex-data, que son los que ofrece la
// interfaz (lib/sessionUi.js ALL_PAIRS y la lista de nueva sesion de
// pages/dashboard.js). EUR/GBP, EUR/JPY y XAU/USD, retirados hasta nuevo aviso
// (CTO, 4-oct-2026: no estan en el bucket y no se suben datos nuevos).
// pruebas/fase1/s03-coste-de-velas comprueba que las listas coinciden.
const PARES = new Set(['EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'AUDUSD', 'USDCAD', 'NZDUSD',
  'AUDCAD', 'GBPJPY'])
// Años: desde 2024 (el primero con datos) hasta el año UTC en curso.
const PRIMER_ANIO = 2024
const anioValido = y => /^\d{4}$/.test(String(y)) && Number(y) >= PRIMER_ANIO && Number(y) <= new Date().getUTCFullYear()

// Una sola DESCARGA en curso por ruta + version (bloque E, punto 2): las
// peticiones de esa misma version esperan la misma promesa.
// (Por instancia del servidor: dos instancias pueden coincidir.)
const enCurso = new Map()
function unaVez(clave, trabajo) {
  if (!enCurso.has(clave)) enCurso.set(clave, Promise.resolve().then(trabajo).finally(() => enCurso.delete(clave)))
  return enCurso.get(clave)
}

// ── Lectura de Storage (solo lectura: bloque D, punto 1) ─────────────────────
// Esta ruta NO escribe ni reconstruye desde el proveedor (CTO, 5-oct-2026):
// escriben solo scripts/actualizar-diario.js y scripts/restore-2026.js por la
// funcion comun de lib/mercado/ficheros.mjs. Si el año no esta publicado, 503
// con mensaje. Formato (.json.gz o .json) y «no existe» frente a «no se pudo
// leer» (D04): lib/mercado/ficheros.mjs.
async function loadFromSupabase(pair, year) {
  const key = `${pair}_${year}`
  const enCache = cache.get(key)
  const v = await versionVigente(supabaseAdmin, pair, year)
  // Bloque D, punto 2: NUNCA se sirve menos que lo vigente. Si no se puede
  // consultar la version, la cache puede ser vieja: se lee lo vigente entero
  // (una descarga) y, si tampoco se puede, 503. La cache nunca se sirve a ciegas.
  if (v.estado === 'error') {
    const r = await leerVigente(supabaseAdmin, pair, year)
    if (r.estado === 'ok') cache.set(key, r.velas, null)
    else if (r.estado === 'no-existe') cache.quita(key)
    return r.estado === 'error' ? { estado: 'error', motivo: `${v.motivo}; ${r.motivo}` } : r
  }
  if (v.estado === 'no-existe') { cache.quita(key); return { estado: 'no-existe' } }
  // la version identifica fichero Y contenido: pasar de .json a .json.gz tambien relee
  const version = v.version == null ? null : `${v.ruta}#${v.version}`
  if (enCache && version != null && enCache.version === version) return { estado: 'ok', velas: enCache.velas }
  // Bloque E, punto 2 (Astra BD-03): la version se comprueba POR PETICION (arriba,
  // nunca compartida) y lo unico que se comparte es la DESCARGA de esa ruta en
  // esa version. Una peticion que llega despues de publicarse v2 ve v2 y baja v2;
  // no se une a una lectura de v1 en curso. Sin version (sin etag), no se comparte.
  const r = version == null ? await leerRuta(supabaseAdmin, v.ruta) : await unaVez(`bajar:${version}`, () => descargaVersion(v.ruta, version))
  if (r.estado === 'ok') cache.set(key, r.velas, r.confirmada === false ? null : version)
  return r.estado === 'ok' ? { estado: 'ok', velas: r.velas } : r
}

// Descarga de una ruta en una version. La descarga empieza despues de leer la
// version, asi que su contenido es esa version o una posterior (nunca anterior).
// Revalidacion: si al terminar la version ya no es esa, se sirve igual pero no
// se guarda en cache con la etiqueta vieja (la proxima peticion relee).
async function descargaVersion(ruta, version) {
  const r = await leerRuta(supabaseAdmin, ruta)
  if (r.estado !== 'ok') return r
  const { data, error } = await supabaseAdmin.storage.from('forex-data').info(ruta)
  const ahora = error ? null : (data?.etag ?? data?.version ?? data?.lastModified ?? null)
  return { ...r, confirmada: ahora != null && `${ruta}#${ahora}` === version }
}

// ── Aggregator (M1 → any TF) ──────────────────────────────────────────────────

function aggregate(m1Candles, tf, fromTs, toTs) {
  const filtered = m1Candles.filter(c => c.time >= fromTs && c.time <= toTs)
  if (!filtered.length) return []

  const buckets = []
  let bucket = null

  for (const c of filtered) {
    const bucketTime = Math.floor(c.time / (tf * 60)) * (tf * 60)
    if (!bucket || bucket.time !== bucketTime) {
      if (bucket) buckets.push(bucket)
      bucket = { time: bucketTime, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume }
    } else {
      bucket.high = Math.max(bucket.high, c.high)
      bucket.low = Math.min(bucket.low, c.low)
      bucket.close = c.close
      bucket.volume += c.volume
    }
  }
  if (bucket) buckets.push(bucket)
  return buckets
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  // Solo lectura (auditoria S03): cualquier otro metodo, fuera antes del guard.
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Seguridad: solo usuarios con el simulador activo (o admin) pueden pedir
  // velas (auditoria S01, 4-oct-2026). Evita scraping y uso abusivo.
  const auth = await requireSimulador(req, res)
  if (!auth) return

  const { pair, timeframe, from, to, year } = req.query
  if (!pair || !timeframe || !from) {
    return res.status(400).json({ error: 'Missing params: pair, timeframe, from' })
  }

  // Lista cerrada (S03): nada fuera de ella llega a Storage ni al proveedor.
  const cleanPair = String(pair).toUpperCase().replace('/', '')
  if (!PARES.has(cleanPair)) return res.status(400).json({ error: `Par no disponible: ${cleanPair}` })
  // Bloque D, punto 3 (Astra): solo marcos PROPIOS de la lista (TIMEFRAMES
  // ['constructor'] existe por herencia y daba 200 con time:null)
  if (!Object.hasOwn(TIMEFRAMES, String(timeframe))) return res.status(400).json({ error: `Timeframe no valido: ${timeframe}` })
  if (!/^\d+$/.test(String(from)) || (to != null && !/^\d+$/.test(String(to)))) return res.status(400).json({ error: 'from/to deben ser enteros (segundos)' })
  const tf = TIMEFRAMES[timeframe]
  const fromTs = Number(from)
  const toTs = to != null ? Number(to) : fromTs + 86400
  // rango finito (enteros exactos) y ordenado
  if (!Number.isSafeInteger(fromTs) || !Number.isSafeInteger(toTs) || toTs < fromTs) return res.status(400).json({ error: 'Rango no valido: from y to enteros, from <= to' })
  const yr = year || new Date(fromTs * 1000).getUTCFullYear().toString()
  if (!anioValido(yr)) return res.status(400).json({ error: `Año no disponible: ${yr}` })

  try {
    const lectura = await loadFromSupabase(cleanPair, yr)    // bloque E: version por peticion
    // D04: si no se pudo leer, NO es «no hay fichero»: ni proveedor ni nada
    if (lectura.estado === 'error') {
      console.error(`[candles] No se pudo leer ${cleanPair}/${yr}: ${lectura.motivo}`)
      return res.status(503).json({ error: 'No se ha podido leer el historico. Prueba de nuevo en unos segundos.' })
    }
    // Bloque D: si el año no esta publicado, 503 con mensaje; nada se reconstruye aqui
    if (lectura.estado === 'no-existe' || !lectura.velas?.length) {
      return res.status(503).json({ error: `El historico de ${cleanPair} ${yr} todavia no esta disponible. Se publica con la actualizacion diaria; prueba mas tarde.` })
    }
    const m1 = lectura.velas

    const candles = aggregate(m1, tf, fromTs, toTs)
    return res.status(200).json({ candles, count: candles.length, source: 'ok' })

  } catch (e) {
    console.error('[candles] handler error:', e)
    return res.status(500).json({ error: e.message })
  }
}