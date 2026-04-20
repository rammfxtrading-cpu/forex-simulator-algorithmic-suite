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

async function test() {
  const testData = JSON.stringify([{ time: 1, o: 1, h: 1, l: 1, c: 1 }])
  const { data, error } = await sb.storage
    .from('forex-data')
    .upload('test-upload.json', testData, { contentType: 'application/json', upsert: true })

  if(error) console.log('❌ UPLOAD FAILED:', error.message)
  else console.log('✅ UPLOAD OK:', data.path)

  // Clean up
  await sb.storage.from('forex-data').remove(['test-upload.json'])
}

test()
