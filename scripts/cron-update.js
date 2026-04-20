const { getHistoricalRates } = require('dukascopy-node')
const { createClient } = require('@supabase/supabase-js')

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const PAIRS = ['eurusd', 'gbpusd', 'audusd', 'nzdusd', 'usdchf', 'usdcad']

async function updatePair(pair) {
  const now  = new Date()
  const year = now.getUTCFullYear()
  const path = `${pair.toUpperCase()}/M1/${year}.json`

  const { data: existing, error: downErr } = await sb.storage.from('forex-data').download(path)
  if (downErr || !existing) return { pair, status: 'no-existing-file' }

  const existingCandles = JSON.parse(await existing.text())
  if (!existingCandles.length) return { pair, status: 'empty-file' }

  const lastTs = existingCandles[existingCandles.length - 1].time
  const fromDate = new Date((lastTs + 60) * 1000)
  const toDate   = now

  if (toDate <= fromDate) {
    return { pair, status: 'up-to-date', lastCandle: new Date(lastTs * 1000).toISOString() }
  }

  const newData = await getHistoricalRates({
    instrument: pair,
    dates: { from: fromDate, to: toDate },
    timeframe: 'm1',
    format: 'json',
    volumes: true,
  })

  if (!newData?.length) return { pair, status: 'no-new-data' }

  const existingTimes = new Set(existingCandles.map(c => c.time))
  const newCandles = newData
    .map(c => ({
      time:   Math.floor(c.timestamp / 1000),
      open:   c.open, high: c.high, low: c.low, close: c.close,
      volume: c.volume ?? 0,
    }))
    .filter(c => !existingTimes.has(c.time))

  if (!newCandles.length) return { pair, status: 'no-new-unique' }

  const merged = existingCandles.concat(newCandles)
  const body = JSON.stringify(merged)

  const { error: upErr } = await sb.storage.from('forex-data')
    .upload(path, body, { contentType: 'application/json', upsert: true })

  if (upErr) return { pair, status: 'upload-error', error: upErr.message }

  return { pair, status: 'ok', added: newCandles.length, total: merged.length }
}

async function main() {
  console.log(`🚀 Incremental update starting at ${new Date().toISOString()}\n`)
  const start = Date.now()
  for (const pair of PAIRS) {
    try {
      const r = await updatePair(pair)
      console.log(`${r.status === 'ok' || r.status === 'up-to-date' ? '✓' : '✗'} ${pair.toUpperCase()}:`, JSON.stringify(r))
    } catch(e) {
      console.log(`✗ ${pair.toUpperCase()}: FAIL ${e.message}`)
    }
  }
  console.log(`\n✅ Done in ${Math.round((Date.now()-start)/1000)}s`)
}

main().catch(e => { console.error('Fatal:', e); process.exit(1) })
