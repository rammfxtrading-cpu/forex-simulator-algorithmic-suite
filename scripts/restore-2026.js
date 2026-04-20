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
const PAIRS = ['eurusd', 'gbpusd', 'audusd', 'nzdusd', 'usdchf', 'usdcad']

async function downloadWithRetry(pair, attempt = 1) {
  const now = new Date()
  const from = new Date('2026-01-01T00:00:00Z')
  try {
    const data = await getHistoricalRates({
      instrument: pair,
      dates: { from, to: now },
      timeframe: 'm1',
      format: 'json',
      volumes: true,
    })
    return data
  } catch(e) {
    if(attempt < 3) {
      console.log(`  ⚠ Retry ${attempt+1}/3 for ${pair}: ${e.message}`)
      await new Promise(r => setTimeout(r, 5000))
      return downloadWithRetry(pair, attempt+1)
    }
    throw e
  }
}

async function main() {
  console.log('Restoring 2026 data for all pairs...\n')
  for(const pair of PAIRS) {
    try {
      console.log(`↓ ${pair.toUpperCase()}...`)
      const data = await downloadWithRetry(pair)
      const candles = data.map(c => ({
        time: Math.floor(c.timestamp / 1000),
        open: c.open, high: c.high, low: c.low, close: c.close,
        volume: c.volume ?? 0,
      }))
      const body = JSON.stringify(candles)
      const { error } = await sb.storage.from('forex-data')
        .upload(`${pair.toUpperCase()}/M1/2026.json`, body, { contentType: 'application/json', upsert: true })
      if(error) throw error
      console.log(`  ✓ ${candles.length} candles, ${(body.length/1024/1024).toFixed(1)}MB`)
    } catch(e) {
      console.log(`  ✗ FAIL: ${e.message}`)
    }
  }
  console.log('\nAlso deleting orphan 2023.json files...')
  const pairs = ['EURUSD','GBPUSD','AUDUSD','NZDUSD','USDCHF','USDCAD']
  for(const p of pairs) {
    await sb.storage.from('forex-data').remove([`${p}/M1/2023.json`])
  }
  console.log('Done.')
}

main().catch(e => { console.error('Fatal:', e); process.exit(1) })
