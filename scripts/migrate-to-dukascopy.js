const fs = require('fs')
const { getHistoricalRates } = require('dukascopy-node')
const { createClient } = require('@supabase/supabase-js')

const env = fs.readFileSync('.env.local', 'utf8')
  .split('\n')
  .filter(l => l && !l.startsWith('#'))
  .reduce((a, l) => {
    const eq = l.indexOf('=')
    if(eq > 0) a[l.slice(0, eq).trim()] = l.slice(eq+1).trim().replace(/^["']|["']$/g, '')
    return a
  }, {})

if(!env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY missing in .env.local')
  process.exit(1)
}

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

const PAIRS  = ['eurusd', 'gbpusd', 'audusd', 'nzdusd', 'usdchf', 'usdcad']
const YEARS  = [2024, 2025, 2026]
const BUCKET = 'forex-data'

// ── STEP 1: Clean old Massive data ────────────────────────────────────────────
async function listAllFiles(prefix = '') {
  const { data, error } = await sb.storage.from(BUCKET).list(prefix, { limit: 1000 })
  if(error) throw error
  const files = []
  for(const item of (data || [])) {
    const full = prefix ? `${prefix}/${item.name}` : item.name
    if(item.id) files.push(full)
    else files.push(...await listAllFiles(full))
  }
  return files
}

async function cleanBucket() {
  console.log('\n🧹 STEP 1: Cleaning old Massive data...\n')
  const files = await listAllFiles()
  if(!files.length) { console.log('  (bucket already empty)'); return }
  console.log(`  Found ${files.length} files to delete`)
  const { error } = await sb.storage.from(BUCKET).remove(files)
  if(error) throw error
  console.log(`  ✓ Deleted ${files.length} files\n`)
}

// ── STEP 2: Download + upload Dukascopy ───────────────────────────────────────
async function downloadYear(pair, year) {
  const now = new Date()
  const from = new Date(`${year}-01-01T00:00:00Z`)
  let to     = new Date(`${year+1}-01-01T00:00:00Z`)
  if(to > now) to = now

  const data = await getHistoricalRates({
    instrument: pair,
    dates: { from, to },
    timeframe: 'm1',
    format: 'json',
    volumes: true,
  })

  return data.map(c => ({
    time:   Math.floor(c.timestamp / 1000),
    open:   c.open,
    high:   c.high,
    low:    c.low,
    close:  c.close,
    volume: c.volume,
  }))
}

async function uploadToSupabase(pair, year, candles) {
  const key = `${pair.toUpperCase()}/M1/${year}.json`
  const body = JSON.stringify(candles)
  const sizeMB = (body.length / 1024 / 1024).toFixed(1)

  const { error } = await sb.storage
    .from(BUCKET)
    .upload(key, body, { contentType: 'application/json', upsert: true })

  if(error) throw error
  return { key, count: candles.length, sizeMB }
}

async function backfill() {
  console.log(`📥 STEP 2: Dukascopy backfill (${PAIRS.length} pairs × ${YEARS.length} years = ${PAIRS.length * YEARS.length} files)\n`)

  let ok = 0, fail = 0, totalMB = 0
  for(const pair of PAIRS) {
    console.log(`📊 ${pair.toUpperCase()}:`)
    for(const year of YEARS) {
      try {
        process.stdout.write(`  ↓ ${year}... `)
        const candles = await downloadYear(pair, year)
        const r = await uploadToSupabase(pair, year, candles)
        console.log(`✓ ${r.count} candles, ${r.sizeMB}MB`)
        ok++
        totalMB += parseFloat(r.sizeMB)
      } catch(e) {
        console.log(`✗ FAIL: ${e.message}`)
        fail++
      }
    }
  }

  console.log(`\n📊 Summary:`)
  console.log(`  ✓ OK:   ${ok}`)
  console.log(`  ✗ FAIL: ${fail}`)
  console.log(`  📦 Total: ${totalMB.toFixed(0)}MB`)
}

async function main() {
  const startTime = Date.now()
  await cleanBucket()
  await backfill()
  const mins = Math.round((Date.now() - startTime) / 60000)
  console.log(`\n✅ Migration done in ${mins}m`)
}

main().catch(e => { console.error('Fatal:', e); process.exit(1) })
