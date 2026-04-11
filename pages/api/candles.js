import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const TIMEFRAMES = {
  M1: 1, M3: 3, M5: 5, M15: 15, M30: 30,
  H1: 60, H2: 120, H3: 180, H4: 240, D1: 1440
}

// In-memory cache per pair+year
const cache = {}

// ── Supabase Storage loader ───────────────────────────────────────────────────

async function loadFromSupabase(pair, year) {
  const key = `${pair}_${year}`
  if (cache[key]) return cache[key]
  const { data, error } = await supabase.storage
    .from('forex-data')
    .download(`${pair}/M1/${year}.json`)
  if (error || !data) return null
  const candles = JSON.parse(await data.text())
  cache[key] = candles
  return candles
}

// ── Massive (Polygon-compatible) fetcher ──────────────────────────────────────
// Fetches M1 data for a full year and caches it in Supabase Storage for reuse.

async function fetchFromMassive(pair, year) {
  const apiKey = process.env.MASSIVE_API_KEY
  if (!apiKey) return null

  // Massive forex ticker format: C:EURUSD
  const ticker   = `C:${pair}`
  const dateFrom = `${year}-01-01`
  const dateTo   = `${year}-12-31`
  const limit    = 50000

  let allCandles = []
  let url = `https://api.massive.com/v2/aggs/ticker/${ticker}/range/1/minute/${dateFrom}/${dateTo}?adjusted=true&sort=asc&limit=${limit}&apiKey=${apiKey}`

  // Paginate through all results
  while (url) {
    const res = await fetch(url)
    if (!res.ok) {
      console.error('Massive error:', res.status, await res.text())
      break
    }
    const json = await res.json()
    if (!json.results?.length) break

    // Normalize to our format: { time (unix seconds), open, high, low, close, volume }
    const candles = json.results.map(r => ({
      time:   Math.floor(r.t / 1000),  // ms → seconds
      open:   r.o,
      high:   r.h,
      low:    r.l,
      close:  r.c,
      volume: r.v ?? 0,
    }))
    allCandles = allCandles.concat(candles)

    // next_url for pagination
    url = json.next_url ? json.next_url + `&apiKey=${apiKey}` : null
  }

  if (!allCandles.length) return null

  // Save to Supabase Storage so next time we load from cache
  try {
    const json    = JSON.stringify(allCandles)
    const blob    = new Blob([json], { type: 'application/json' })
    const path    = `${pair}/M1/${year}.json`
    await supabase.storage
      .from('forex-data')
      .upload(path, blob, { upsert: true, contentType: 'application/json' })
    cache[`${pair}_${year}`] = allCandles
    console.log(`Saved ${allCandles.length} M1 candles → forex-data/${path}`)
  } catch (e) {
    console.error('Supabase upload error:', e)
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
      bucket.high   = Math.max(bucket.high, c.high)
      bucket.low    = Math.min(bucket.low, c.low)
      bucket.close  = c.close
      bucket.volume += c.volume
    }
  }
  if (bucket) buckets.push(bucket)
  return buckets
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  const { pair, timeframe, from, to, year } = req.query
  if (!pair || !timeframe || !from) {
    return res.status(400).json({ error: 'Missing params: pair, timeframe, from' })
  }

  const tf     = TIMEFRAMES[timeframe] || 1
  const fromTs = parseInt(from)
  const toTs   = to ? parseInt(to) : fromTs + 86400
  const yr     = year || new Date(fromTs * 1000).getFullYear().toString()
  const cleanPair = pair.toUpperCase().replace('/', '')

  try {
    // 1. Try Supabase Storage first
    let m1 = await loadFromSupabase(cleanPair, yr)

    // 2. Fall back to Massive API (fetches + saves to Supabase for next time)
    if (!m1) {
      console.log(`No Supabase data for ${cleanPair}/${yr} — fetching from Massive…`)
      m1 = await fetchFromMassive(cleanPair, yr)
    }

    if (!m1?.length) {
      return res.status(404).json({ error: `No data for ${cleanPair} ${yr}` })
    }

    const candles = aggregate(m1, tf, fromTs, toTs)
    return res.status(200).json({ candles, count: candles.length, source: 'ok' })

  } catch (e) {
    console.error('candles handler error:', e)
    return res.status(500).json({ error: e.message })
  }
}
