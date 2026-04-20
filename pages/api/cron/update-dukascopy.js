import { createClient } from '@supabase/supabase-js'
import { getHistoricalRates } from 'dukascopy-node'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const PAIRS = ['eurusd', 'gbpusd', 'audusd', 'nzdusd', 'usdchf', 'usdcad']

async function updatePair(pair) {
  const now  = new Date()
  const year = now.getUTCFullYear()
  const path = `${pair.toUpperCase()}/M1/${year}.json`

  // 1. Read existing data from Supabase
  const { data: existing, error: downErr } = await supabase.storage
    .from('forex-data')
    .download(path)

  if (downErr || !existing) {
    return { pair, status: 'no-existing-file', error: downErr?.message }
  }

  const existingCandles = JSON.parse(await existing.text())
  if (!existingCandles.length) {
    return { pair, status: 'empty-file' }
  }

  // 2. Find last timestamp and fetch only new data
  const lastTs = existingCandles[existingCandles.length - 1].time
  const fromDate = new Date((lastTs + 60) * 1000) // next minute after last candle
  const toDate   = now

  if (toDate <= fromDate) {
    return { pair, status: 'already-up-to-date', lastCandle: new Date(lastTs * 1000).toISOString() }
  }

  // 3. Download only new data from Dukascopy
  const newData = await getHistoricalRates({
    instrument: pair,
    dates: { from: fromDate, to: toDate },
    timeframe: 'm1',
    format: 'json',
    volumes: true,
  })

  if (!newData?.length) {
    return { pair, status: 'no-new-data', since: fromDate.toISOString() }
  }

  // 4. Deduplicate (in case of overlap) + merge
  const existingTimes = new Set(existingCandles.map(c => c.time))
  const newCandles = newData
    .map(c => ({
      time:   Math.floor(c.timestamp / 1000),
      open:   c.open,
      high:   c.high,
      low:    c.low,
      close:  c.close,
      volume: c.volume ?? 0,
    }))
    .filter(c => !existingTimes.has(c.time))

  if (!newCandles.length) {
    return { pair, status: 'no-new-unique-candles' }
  }

  const merged = [...existingCandles, ...newCandles]

  // 5. Upload merged file
  const body = JSON.stringify(merged)
  const { error: upErr } = await supabase.storage
    .from('forex-data')
    .upload(path, body, { contentType: 'application/json', upsert: true })

  if (upErr) return { pair, status: 'upload-error', error: upErr.message }

  return {
    pair,
    status: 'ok',
    added: newCandles.length,
    total: merged.length,
    lastCandle: new Date(merged[merged.length - 1].time * 1000).toISOString(),
  }
}

export default async function handler(req, res) {
  const authHeader = req.headers['authorization']
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const startTime = Date.now()
  const results = []
  for(const p of PAIRS) {
    try { results.push({ status: "fulfilled", value: await updatePair(p) }) }
    catch(e) { results.push({ status: "rejected", reason: e }) }
  }

  const summary = results.map((r, i) =>
    r.status === 'fulfilled' ? r.value : { pair: PAIRS[i], status: 'rejected', error: r.reason?.message }
  )
  const ok = summary.filter(s => s.status === 'ok' || s.status === 'already-up-to-date').length
  const elapsed = Math.round((Date.now() - startTime) / 1000)

  return res.status(200).json({
    mode: 'incremental',
    ok,
    total: PAIRS.length,
    elapsed: `${elapsed}s`,
    results: summary,
  })
}
