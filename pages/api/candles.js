import { requireSimulador, supabaseAdmin } from '../../lib/authApi'
import { validaAnioParaPublicar } from '../../lib/mercado/calidad'
import { getHistoricalRates } from 'dukascopy-node'

const TIMEFRAMES = {
  M1: 1, M3: 3, M5: 5, M15: 15, M30: 30,
  H1: 60, H2: 120, H3: 180, H4: 240, D1: 1440
}

// ── Umbrales de "dia completo" segun dia de la semana (UTC) ─────────────────
// Calibrados contra datos historicos reales de Dukascopy EUR/USD.
// Domingo: apertura sesion ~21-22 UTC -> ~60-180 velas reales.
// Lun-Jue: dias completos, ~1438-1440 velas teoricas.
// Viernes: cierre ~21 UTC -> ~1260 velas reales.
// Sabado: mercado cerrado.
const THRESHOLD_BY_WEEKDAY = {
  0: 50,    // Domingo
  1: 1200,  // Lunes
  2: 1200,  // Martes
  3: 1200,  // Miercoles
  4: 1200,  // Jueves
  5: 1000,  // Viernes
  6: 0,     // Sabado
}

// In-memory cache per pair+year
const cache = {}

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

// Una sola carga/reconstruccion en curso por par y año: las peticiones que
// llegan mientras tanto esperan la misma promesa en vez de repetir el trabajo.
// (Por instancia del servidor: dos instancias pueden coincidir.)
const enCurso = new Map()
function unaVez(clave, trabajo) {
  if (!enCurso.has(clave)) enCurso.set(clave, Promise.resolve().then(trabajo).finally(() => enCurso.delete(clave)))
  return enCurso.get(clave)
}

// ── Supabase Storage loader ───────────────────────────────────────────────────
// Auditoria D04 (4-oct-2026): un error de lectura NO es «fichero inexistente».
// «No existe» segun storage-js 2.102: StorageApiError con statusCode '404' (la
// API responde 400 con cuerpo { statusCode: '404', error: 'not_found' }).
// Cualquier otro error (red, 5xx, JSON ilegible) es «no se pudo leer».
const noExiste = e => String(e?.statusCode) === '404' || e?.status === 404

// → { estado: 'ok', velas } | { estado: 'no-existe' } | { estado: 'error', motivo }
async function leerAnio(pair, year) {
  const { data, error } = await supabaseAdmin.storage
    .from('forex-data')
    .download(`${pair}/M1/${year}.json`)
  if (error) return noExiste(error) ? { estado: 'no-existe' } : { estado: 'error', motivo: error.message || String(error) }
  try {
    const velas = JSON.parse(await data.text())
    return Array.isArray(velas) ? { estado: 'ok', velas } : { estado: 'error', motivo: 'el fichero no es una lista de velas' }
  } catch (e) {
    return { estado: 'error', motivo: 'JSON ilegible: ' + e.message }
  }
}

async function loadFromSupabase(pair, year) {
  const key = `${pair}_${year}`
  if (cache[key]) return { estado: 'ok', velas: cache[key] }
  const r = await leerAnio(pair, year)
  if (r.estado === 'ok') cache[key] = r.velas
  return r
}

// ── Helpers de validacion (deuda 5.2) ────────────────────────────────────────

// Cuenta velas por dia (clave: 'YYYY-MM-DD' UTC).
// Acepta tanto candles del simulador (time en segundos) como respuesta cruda
// de dukascopy-node (timestamp en milisegundos).
function countCandlesPerDay(items, timeField = 'time', timeUnit = 's') {
  const byDay = {}
  for (const c of items) {
    const ms = timeUnit === 'ms' ? c[timeField] : c[timeField] * 1000
    const d = new Date(ms).toISOString().slice(0, 10)
    byDay[d] = (byDay[d] || 0) + 1
  }
  return byDay
}

// Detecta dias laborables con menos velas que el umbral. Excluye el dia "hoy"
// si la descarga llega hasta el momento actual (ese dia no esta cerrado todavia).
function detectGaps(byDay, isLastDayOpen) {
  const allDates = Object.keys(byDay).sort()
  if (!allDates.length) return []

  const first = new Date(allDates[0] + 'T00:00:00Z')
  const last = new Date(allDates[allDates.length - 1] + 'T00:00:00Z')
  const todayStr = new Date().toISOString().slice(0, 10)

  const gaps = []
  for (let d = new Date(first); d <= last; d.setUTCDate(d.getUTCDate() + 1)) {
    const date = d.toISOString().slice(0, 10)
    // Si la descarga llega hasta hoy, ignoramos el dia de hoy (sesion abierta).
    if (isLastDayOpen && date === todayStr) continue
    const count = byDay[date] || 0
    const weekday = d.getUTCDay()
    const threshold = THRESHOLD_BY_WEEKDAY[weekday]
    if (count < threshold) {
      gaps.push({ date, weekday, count, threshold })
    }
  }
  return gaps
}

// ── Dukascopy fetcher con retry + validacion + proteccion anti-degradacion ──

async function fetchFromDukascopyWithRetry(pair, year, maxRetries = 3) {
  const now = new Date()
  const from = new Date(`${year}-01-01T00:00:00Z`)
  let to = new Date(`${Number(year) + 1}-01-01T00:00:00Z`)
  const isLastDayOpen = to > now
  if (isLastDayOpen) to = now

  let lastError = null
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[candles] Dukascopy fetch ${pair}/${year} intento ${attempt}/${maxRetries}`)
      const t0 = Date.now()
      const data = await getHistoricalRates({
        instrument: pair.toLowerCase(),
        dates: { from, to },
        timeframe: 'm1',
        format: 'json',
        volumes: true,
      })
      const secs = ((Date.now() - t0) / 1000).toFixed(1)

      if (!data?.length) {
        console.warn(`[candles] Dukascopy devolvio 0 velas en intento ${attempt}`)
        if (attempt < maxRetries) {
          await new Promise(r => setTimeout(r, 5000))
          continue
        }
        return null
      }

      // Validar completitud
      const byDay = countCandlesPerDay(data, 'timestamp', 'ms')
      const gaps = detectGaps(byDay, isLastDayOpen)

      console.log(`[candles] ${pair}/${year} intento ${attempt}: ${data.length} velas en ${secs}s, ${gaps.length} agujeros`)

      if (gaps.length === 0) {
        return data  // Limpio. Listo para subir.
      }

      // Hay agujeros. Reintentar si quedan intentos.
      console.warn(`[candles] Agujeros detectados en intento ${attempt}:`, gaps.map(g => `${g.date}(${g.count}/${g.threshold})`).join(', '))
      if (attempt < maxRetries) {
        console.log(`[candles] Esperando 5s antes de reintentar...`)
        await new Promise(r => setTimeout(r, 5000))
        continue
      }
      // Ultimo intento con agujeros: devolvemos data + warning.
      // El caller decide si subir o no segun la proteccion anti-degradacion.
      return { data, gaps, partial: true }

    } catch (e) {
      lastError = e
      console.error(`[candles] Dukascopy error intento ${attempt}: ${e.message}`)
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 5000))
      }
    }
  }

  if (lastError) throw lastError
  return null
}

// → { velas } | { velas: null } (el proveedor no dio nada) | { error: 'incompleto',
// problemas } (no pasa la calidad: D03) | { error: 'no-comprobable' } (no se pudo
// leer lo guardado: ni se sube ni se sirve la descargada, D04)
async function fetchFromDukascopy(pair, year) {
  let result
  try {
    result = await fetchFromDukascopyWithRetry(pair, year)
  } catch (e) {
    console.error('[candles] Dukascopy fatal error:', e.message)
    return { velas: null }
  }

  if (!result) return { velas: null }

  // result puede ser: array directo (limpio) o { data, gaps, partial: true }
  const isPartial = result.partial === true
  const rawData = isPartial ? result.data : result
  const gapsInfo = isPartial ? result.gaps : []

  if (!rawData?.length) return { velas: null }

  const allCandles = rawData.map(c => ({
    time: Math.floor(c.timestamp / 1000),
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    volume: c.volume ?? 0,
  }))
  const key = `${pair}_${year}`
  const path = `${pair}/M1/${year}.json`

  // Proteccion anti-degradacion (D04): nunca se sirve, cachea ni sube una
  // version con MENOS velas que la guardada; y si lo guardado no se puede
  // leer, no se sabe si la nueva es peor: no se toca nada.
  const existente = await leerAnio(pair, year)
  if (existente.estado === 'error') {
    console.error(`[candles] No se pudo comprobar la version guardada de ${path} (${existente.motivo}): no se sube ni se sirve la descargada.`)
    return { error: 'no-comprobable' }
  }

  // Calidad ANTES DE PUBLICAR (D03): orden, unicidad, OHLC y cobertura del año
  // entero hasta ayer (lib/mercado/calidad.js). Si no pasa, ni se sube ni se
  // cachea: un año a medias no puede pasar por el año. Si hay una version
  // guardada, se sigue sirviendo esa; si no, error.
  const calidad = validaAnioParaPublicar(allCandles, Number(year), Date.now() / 1000)
  if (!calidad.ok) {
    console.error(`[candles] ${path} descargado NO valido, no se publica: ${calidad.problemas.join(' · ')}`)
    if (existente.estado === 'ok') { cache[key] = existente.velas; return { velas: existente.velas } }
    return { error: 'incompleto', problemas: calidad.problemas }
  }

  if (existente.estado === 'ok' && allCandles.length < existente.velas.length) {
    console.warn(`[candles] PROTECCION ANTI-DEGRADACION ${path}: descargada=${allCandles.length} velas, guardada=${existente.velas.length}. No se sube; se sirve la guardada.`)
    cache[key] = existente.velas
    return { velas: existente.velas }
  }

  let up
  try {
    const blob = new Blob([JSON.stringify(allCandles)], { type: 'application/json' })
    up = await supabaseAdmin.storage
      .from('forex-data')
      .upload(path, blob, { upsert: true, contentType: 'application/json' })
  } catch (e) {
    up = { error: e }
  }
  if (up?.error) {
    console.error(`[candles] Fallo al subir ${path}: ${up.error.message || up.error} (statusCode ${up.error.statusCode ?? '-'}). NO guardado; se sirve la descargada.`)
  } else {
    const partialTag = isPartial ? ` (PARCIAL: ${gapsInfo.length} agujeros tras ${3} intentos)` : ''
    console.log(`[candles] Saved ${allCandles.length} M1 candles -> forex-data/${path}${partialTag}`)
  }
  // la descargada tiene al menos tantas velas como la guardada (o no habia)
  cache[key] = allCandles
  return { velas: allCandles }
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
  if (!TIMEFRAMES[timeframe]) return res.status(400).json({ error: `Timeframe no valido: ${timeframe}` })
  if (!/^\d+$/.test(String(from)) || (to != null && !/^\d+$/.test(String(to)))) return res.status(400).json({ error: 'from/to deben ser enteros (segundos)' })
  const tf = TIMEFRAMES[timeframe]
  const fromTs = parseInt(from)
  const toTs = to ? parseInt(to) : fromTs + 86400
  const yr = year || new Date(fromTs * 1000).getUTCFullYear().toString()
  if (!anioValido(yr)) return res.status(400).json({ error: `Año no disponible: ${yr}` })

  try {
    const lectura = await unaVez(`leer:${cleanPair}_${yr}`, () => loadFromSupabase(cleanPair, yr))
    // D04: si no se pudo leer, NO es «no hay fichero»: ni proveedor ni nada
    if (lectura.estado === 'error') {
      console.error(`[candles] No se pudo leer ${cleanPair}/${yr}: ${lectura.motivo}`)
      return res.status(503).json({ error: 'No se ha podido leer el historico. Prueba de nuevo en unos segundos.' })
    }
    let m1 = lectura.estado === 'ok' ? lectura.velas : null

    if (!m1) {
      console.log(`[candles] No Supabase data for ${cleanPair}/${yr} — fetching from Dukascopy with retry+validation`)
      const r = await unaVez(`reconstruir:${cleanPair}_${yr}`, () => fetchFromDukascopy(cleanPair, yr))
      if (r.error === 'incompleto') return res.status(502).json({ error: `Historico de ${cleanPair} ${yr} incompleto o invalido: no se puede usar`, problemas: r.problemas })
      if (r.error) return res.status(503).json({ error: 'No se ha podido comprobar el historico guardado. Prueba de nuevo en unos segundos.' })
      m1 = r.velas
    }

    if (!m1?.length) {
      return res.status(404).json({ error: `No data for ${cleanPair} ${yr}` })
    }

    const candles = aggregate(m1, tf, fromTs, toTs)
    return res.status(200).json({ candles, count: candles.length, source: 'ok' })

  } catch (e) {
    console.error('[candles] handler error:', e)
    return res.status(500).json({ error: e.message })
  }
}