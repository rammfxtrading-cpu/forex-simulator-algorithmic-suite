import { createClient } from '@supabase/supabase-js'
import { getHistoricalRates } from 'dukascopy-node'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const PAIRS = ['eurusd', 'gbpusd', 'audusd', 'nzdusd', 'usdchf', 'usdcad']

async function updatePair(pair) {
  const now = new Date()
  const year = now.getUTCFullYear()
  const yearStart = new Date(`${year}-01-01T00:00:00Z`)

  // Download entire year from Dukascopy (Dukascopy caches internally, only new data is fetched)
  const data = await getHistoricalRates({
    instrument: pair,
    dates: { from: yearStart, to: now },
    timeframe: 'm1',
    format: 'json',
    volumes: true,
  })

  if (!data?.length) return { pair, status: 'no-data' }

  const candles = data.map(c => ({
    time:   Math.floor(c.timestamp / 1000),
    open:   c.open,
    high:   c.high,
    low:    c.low,
    close:  c.close,
    volume: c.volume ?? 0,
  }))

  const body = JSON.stringify(candles)
  const path = `${pair.toUpperCase()}/M1/${year}.json`

  const { error } = await supabase.storage
    .from('forex-data')
    .upload(path, body, { contentType: 'application/json', upsert: true })

  if (error) return { pair, status: 'upload-error', error: error.message }

  return { pair, status: 'ok', candles: candles.length, sizeMB: (body.length/1024/1024).toFixed(1) }
}

export default async function handler(req, res) {
  // Vercel sends a special header for cron auth
  const authHeader = req.headers['authorization']
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const startTime = Date.now()
  const results = await Promise.allSettled(PAIRS.map(updatePair))

  const summary = results.map((r, i) => r.status === 'fulfilled' ? r.value : { pair: PAIRS[i], status: 'rejected', error: r.reason?.message })
  const ok = summary.filter(s => s.status === 'ok').length
  const elapsed = Math.round((Date.now() - startTime) / 1000)

  return res.status(200).json({
    ok,
    total: PAIRS.length,
    elapsed: `${elapsed}s`,
    results: summary,
  })
}
