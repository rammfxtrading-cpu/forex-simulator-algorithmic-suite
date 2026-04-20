const fs = require('fs')
const { createClient } = require('@supabase/supabase-js')

const env = fs.readFileSync('.env.local', 'utf8')
  .split('\n')
  .filter(l => l && !l.startsWith('#'))
  .reduce((a, l) => {
    const eq = l.indexOf('=')
    if(eq > 0) a[l.slice(0, eq).trim()] = l.slice(eq+1).trim().replace(/^["']|["']$/g, '')
    return a
  }, {})

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

async function listRecursive(bucket, prefix = '', depth = 0) {
  const { data, error } = await sb.storage.from(bucket).list(prefix, { limit: 1000 })
  if(error) { console.error(`  ERR: ${error.message}`); return {files:0, bytes:0} }

  let files = 0, bytes = 0
  for(const item of (data || [])) {
    const fullPath = prefix ? `${prefix}/${item.name}` : item.name
    if(item.id) {
      files++
      bytes += item.metadata?.size || 0
      console.log(`${'  '.repeat(depth+1)}📄 ${fullPath} (${((item.metadata?.size||0)/1024/1024).toFixed(1)}MB)`)
    } else {
      console.log(`${'  '.repeat(depth+1)}📁 ${item.name}/`)
      const sub = await listRecursive(bucket, fullPath, depth+1)
      files += sub.files
      bytes += sub.bytes
    }
  }
  return {files, bytes}
}

async function main() {
  // List all buckets
  const { data: buckets } = await sb.storage.listBuckets()
  console.log('\n=== BUCKETS ===\n')
  for(const b of (buckets || [])) {
    console.log(`📦 ${b.name} (${b.public ? 'public' : 'private'})`)
    const {files, bytes} = await listRecursive(b.name)
    console.log(`   TOTAL: ${files} files, ${(bytes/1024/1024).toFixed(1)}MB\n`)
  }
}

main().catch(e => { console.error('Fatal:', e); process.exit(1) })
