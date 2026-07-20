// SUBIDA SEGURA desde archivos locales a Supabase. NUNCA borra el bucket.
// Sube cada {PAR}_{año}.json local a {PAR}/M1/{año}.json con upsert (sobrescribe solo ese archivo).
// Uso:
//   node scripts/subir-a-supabase.js           -> SECO (lista qué subiría, NO sube)
//   node scripts/subir-a-supabase.js --subir    -> SUBE de verdad
const fs = require('fs')
const path = require('path')
const { createClient } = require('@supabase/supabase-js')

const SUBIR = process.argv.includes('--subir')
const OUT_DIR = path.join(__dirname, '..', 'descarga-2026')

const env = fs.readFileSync(path.join(__dirname,'..','.env.local'), 'utf8')
  .split('\n').filter(l => l && !l.startsWith('#'))
  .reduce((a, l) => { const eq = l.indexOf('='); if(eq>0) a[l.slice(0,eq).trim()] = l.slice(eq+1).trim().replace(/^["']|["']$/g,''); return a }, {})

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const BUCKET = 'forex-data'

const PAIRS = ['audcad','audusd','eurusd','gbpjpy','gbpusd','nzdusd','usdcad','usdchf','usdjpy']
const YEARS = [2024, 2025, 2026]

async function main() {
  console.log(`\n=== SUBIDA ${SUBIR ? '⚠️  REAL (sobrescribe con upsert, NO borra bucket)' : '🔍 SECO (no sube)'} ===\n`)
  const okList=[], failList=[]

  for (const pair of PAIRS) {
    for (const year of YEARS) {
      const local = path.join(OUT_DIR, `${pair.toUpperCase()}_${year}.json`)
      const key = `${pair.toUpperCase()}/M1/${year}.json`
      if (!fs.existsSync(local)) { console.log(`  ${key} — ✗ FALTA archivo local`); failList.push(key); continue }

      let candles
      try { candles = JSON.parse(fs.readFileSync(local,'utf8')) } catch(e) { console.log(`  ${key} — ✗ local ilegible`); failList.push(key); continue }
      if (!Array.isArray(candles) || !candles.length) { console.log(`  ${key} — ✗ local vacío`); failList.push(key); continue }

      const mb = (fs.statSync(local).size/1024/1024).toFixed(1)
      if (!SUBIR) { console.log(`  ${key} — listo (${candles.length} velas, ${mb}MB)`); okList.push(key); continue }

      try {
        const body = JSON.stringify(candles)
        const { error } = await sb.storage.from(BUCKET).upload(key, body, { contentType:'application/json', upsert:true })
        if (error) throw error
        console.log(`  ${key} — ✓ SUBIDO (${candles.length} velas, ${mb}MB)`)
        okList.push(key)
      } catch(e) { console.log(`  ${key} — ✗ FALLO subida: ${e.message}`); failList.push(key) }
    }
  }

  console.log(`\n=== RESUMEN ===`)
  console.log(`  OK: ${okList.length}/${PAIRS.length*YEARS.length}`)
  if (failList.length) { console.log(`  FALLIDOS: ${failList.join(', ')}`) }
  else console.log(SUBIR ? `  ✓✓✓ Los 27 archivos subidos a Supabase.` : `  ✓ Los 27 archivos locales están listos para subir.`)
  if (!SUBIR) console.log(`\n  (SECO — no se tocó Supabase. Para subir: node scripts/subir-a-supabase.js --subir)`)
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1) })
