// INOCUO: solo LISTA el contenido del bucket forex-data. No descarga, no sube, no borra.
const fs = require('fs')
const { createClient } = require('@supabase/supabase-js')

const env = fs.readFileSync('.env.local', 'utf8')
  .split('\n').filter(l => l && !l.startsWith('#'))
  .reduce((a, l) => { const eq = l.indexOf('='); if(eq>0) a[l.slice(0,eq).trim()] = l.slice(eq+1).trim().replace(/^["']|["']$/g,''); return a }, {})

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const BUCKET = 'forex-data'

async function main() {
  console.log('Listando bucket forex-data (solo lectura)...\n')
  const { data: pares, error } = await sb.storage.from(BUCKET).list('', { limit: 1000 })
  if(error) throw error

  const soloPares = (pares || []).filter(p => !p.id) // carpetas, no archivos
  console.log(`Pares encontrados: ${soloPares.length}\n`)

  for(const p of soloPares.sort((a,b)=>a.name.localeCompare(b.name))) {
    const { data: tfs } = await sb.storage.from(BUCKET).list(p.name, { limit: 100 })
    for(const tf of (tfs || []).filter(x=>!x.id)) {
      const { data: files } = await sb.storage.from(BUCKET).list(`${p.name}/${tf.name}`, { limit: 100 })
      const years = (files || []).filter(f=>f.id).map(f=>f.name.replace('.json','')).sort()
      console.log(`  ${p.name}/${tf.name}: ${years.join(', ')}`)
    }
  }
  console.log('\n(No se tocó nada — solo lectura)')
}

main().catch(e => { console.error('FALLO:', e.message); process.exit(1) })
