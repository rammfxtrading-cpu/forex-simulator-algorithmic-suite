import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const TIMEFRAMES = {
  M1: 1, M3: 3, M5: 5, M15: 15, M30: 30,
  H1: 60, H2: 120, H3: 180, H4: 240, D1: 1440
}

const cache = {}

async function getM1Data(pair, year) {
  const key = `${pair}_${year}`
  if (cache[key]) return cache[key]
  const { data, error } = await supabase.storage
    .from('forex-data')
    .download(`${pair}/M1/${year}.json`)
  if (error || !data) return []
  const text = await data.text()
  const candles = JSON.parse(text)
  cache[key] = candles
  return candles
}

export default async function handler(req, res) {
  const { pair, timeframe, from, to, year } = req.query
  if (!pair || !timeframe || !from) return res.status(400).json({ error: 'Missing params' })
  const tf = TIMEFRAMES[timeframe] || 1
  const fromTs = parseInt(from)
  const toTs = to ? parseInt(to) : fromTs
  const dataYear = year || '2023'
  try {
    const m1 = await getM1Data(pair.toUpperCase(), dataYear)
    if (!m1.length) return res.status(404).json({ error: 'No data' })
    const filtered = m1.filter(c => c.time >= fromTs && c.time <= toTs)
    const aggregated = []
    let bucket = null
    for (const c of filtered) {
      const bucketTime = Math.floor(c.time / (tf * 60)) * (tf * 60)
      if (!bucket || bucket.time !== bucketTime) {
        if (bucket) aggregated.push(bucket)
        bucket = { time: bucketTime, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume }
      } else {
        bucket.high = Math.max(bucket.high, c.high)
        bucket.low = Math.min(bucket.low, c.low)
        bucket.close = c.close
        bucket.volume += c.volume
      }
    }
    if (bucket) aggregated.push(bucket)
    res.status(200).json({ candles: aggregated, count: aggregated.length })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
}
