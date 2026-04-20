const fs = require('fs')
const { getHistoricalRates } = require('dukascopy-node')
const { createClient } = require('@supabase/supabase-js')

const env = fs.readFileSync('.env.local', 'utf8')
  .split('\n').filter(l => l && !l.startsWith('#'))
  .reduce((a, l) => {
    const eq = l.indexOf('=')
    if(eq > 0) a[l.slice(0, eq).trim()] = l.slice(eq+1).trim().replace(/^["']|["']$/g, '')
    return a
  }, {})

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

async function main() {
  console.log('↓ Downloading NZDUSD 2025...')
  const data = await getHistoricalRates({
    instrument: 'nzdusd',
    dates: { from: new Date('2025-01-01T00:00:00Z'), to: new Date('2026-01-01T00:00:00Z') },
    timeframe: 'm1',
    format: 'json',
    volumes: true,
  })

  const candles = data.map(c => ({
    time:   Math.floor(c.timestamp / 1000),
    open:   c.open, high: c.high, low: c.low, close: c.close,
    volume: c.volume,
  }))

  const body = JSON.stringify(candles)
  const { error } = await sb.storage
    .from('forex-data')
    .upload('NZDUSD/M1/2025.json', body, { contentType: 'application/json', upsert: true })

  if(error) { console.error('❌', error.message); process.exit(1) }
  console.log(`✅ Uploaded: ${candles.length} candles, ${(body.length/1024/1024).toFixed(1)}MB`)
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1) })
