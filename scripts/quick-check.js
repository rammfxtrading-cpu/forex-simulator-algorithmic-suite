const fs = require('fs')
const { createClient } = require('@supabase/supabase-js')

const env = fs.readFileSync('.env.local', 'utf8')
  .split('\n').filter(l => l && !l.startsWith('#'))
  .reduce((a, l) => {
    const eq = l.indexOf('=')
    if(eq > 0) a[l.slice(0, eq).trim()] = l.slice(eq+1).trim().replace(/^["']|["']$/g, '')
    return a
  }, {})

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

async function check() {
  const { data } = await sb.storage.from('forex-data').list('EURUSD/M1', { limit: 10 })
  if(!data || !data.length) {
    console.log('EURUSD/M1: empty (nothing uploaded yet)')
  } else {
    data.forEach(f => {
      if(f.id) console.log(`  ${f.name} (${(f.metadata?.size/1024/1024).toFixed(1)}MB)`)
    })
  }
}

check()
