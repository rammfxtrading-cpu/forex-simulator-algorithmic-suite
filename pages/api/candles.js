import { requireUser, supabaseAdmin } from '../../lib/authApi'
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

// ── Supabase Storage loader ───────────────────────────────────────────────────

async function loadFromSupabase(pair, year) {
  const key = `${pair}_${year}`
  if (cache[key]) return cache[key]
  const { data, error } = await supabaseAdmin.storage
    .from('forex-data')
    .download(`${pair}/M1/${year}.json`)
  if (error || !data) return null
  const candles = JSON.parse(await data.text())
  cache[key] = candles
  return candles
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

async function fetchFromDukascopy(pair, year) {
  let result
  try {
    result = await fetchFromDukascopyWithRetry(pair, year)
  } catch (e) {
    console.error('[candles] Dukascopy fatal error:', e.message)
    return null
  }

  if (!result) return null

  // result puede ser: array directo (limpio) o { data, gaps, partial: true }
  const isPartial = result.partial === true
  const rawData = isPartial ? result.data : result
  const gapsInfo = isPartial ? result.gaps : []

  if (!rawData?.length) return null

  const allCandles = rawData.map(c => ({
    time: Math.floor(c.timestamp / 1000),
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    volume: c.volume ?? 0,
  }))

  // Proteccion anti-degradacion: si ya existe version en bucket,
  // solo sobreescribir si la nueva tiene >= 95% velas que la actual.
  let shouldUpload = true
  let existingCount = 0
  try {
    const { data: existingBlob, error: dlError } = await supabaseAdmin.storage
      .from('forex-data')
      .download(`${pair}/M1/${year}.json`)

    if (!dlError && existingBlob) {
      const existing = JSON.parse(await existingBlob.text())
      existingCount = existing.length
      const ratio = allCandles.length / existingCount
      if (ratio < 0.95) {
        shouldUpload = false
        console.warn(`[candles] PROTECCION ANTI-DEGRADACION activada para ${pair}/${year}: nueva=${allCandles.length} velas, existente=${existingCount}, ratio=${(ratio * 100).toFixed(1)}%. NO se sobreescribe.`)
      }
    }
  } catch (e) {
    // Sin version previa o error de lectura: continuamos con upload normal.
    console.log(`[candles] Sin version previa de ${pair}/${year} en bucket o error de lectura. Procediendo con upload.`)
  }

  if (shouldUpload) {
    try {
      const json = JSON.stringify(allCandles)
      const blob = new Blob([json], { type: 'application/json' })
      const path = `${pair}/M1/${year}.json`
      await supabaseAdmin.storage
        .from('forex-data')
        .upload(path, blob, { upsert: true, contentType: 'application/json' })
      cache[`${pair}_${year}`] = allCandles
      const partialTag = isPartial ? ` (PARCIAL: ${gapsInfo.length} agujeros tras ${3} intentos)` : ''
      console.log(`[candles] Saved ${allCandles.length} M1 candles -> forex-data/${path}${partialTag}`)
    } catch (e) {
      console.error('[candles] Supabase upload error:', e)
    }
  } else {
    // No subimos pero atendemos la peticion actual con los datos en memoria.
    cache[`${pair}_${year}`] = allCandles
  }

  return allCandles
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
  // Seguridad: solo usuarios autenticados pueden pedir velas.
  // Evita scraping anonimo y uso abusivo del endpoint.
  const auth = await requireUser(req, res)
  if (!auth) return

  const { pair, timeframe, from, to, year } = req.query
  if (!pair || !timeframe || !from) {
    return res.status(400).json({ error: 'Missing params: pair, timeframe, from' })
  }

  const tf = TIMEFRAMES[timeframe] || 1
  const fromTs = parseInt(from)
  const toTs = to ? parseInt(to) : fromTs + 86400
  const yr = year || new Date(fromTs * 1000).getFullYear().toString()
  const cleanPair = pair.toUpperCase().replace('/', '')

  try {
    let m1 = await loadFromSupabase(cleanPair, yr)

    if (!m1) {
      console.log(`[candles] No Supabase data for ${cleanPair}/${yr} — fetching from Dukascopy with retry+validation`)
      m1 = await fetchFromDukascopy(cleanPair, yr)
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