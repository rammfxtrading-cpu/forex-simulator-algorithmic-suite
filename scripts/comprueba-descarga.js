// COMPROBACION DEL CONTRATO DE LA DESCARGA LIMITADA (paso 6 del despliegue de
// mercado diario, revisiones/2026-10-09-mercado-diario-despliegue.md; CTO
// 10-oct-2026). SOLO LECTURA, para UN par y el año en curso: una consulta de
// informacion y UNA descarga atada por el mismo camino que el diario
// (fetchConTope sobre fetchConLimite), sin publicar, sin cerrojos, sin
// proveedor. La logica y el informe: lib/mercado/comprueba.mjs.
//
//   node scripts/comprueba-descarga.js EURUSD
//
// Salida: 0 el diario funcionaria · 3 el diario saldria con 3 (etag, tamaño,
// objeto) · 1 el sha256 del cuerpo no es el de los metadatos · 4 uso.
// Gasto: un fichero anual (un .json.gz, unos 4 MB). Ninguna URL ni clave en el log.
// ⛔ Lo ejecuta una persona autorizada, una vez, en el paso 6; ningun workflow.
const { createClient } = require('@supabase/supabase-js')
const fs = require('fs'), path = require('path')

const PARES = ['AUDCAD', 'AUDUSD', 'EURUSD', 'GBPJPY', 'GBPUSD', 'NZDUSD', 'USDCAD', 'USDCHF', 'USDJPY']

function getEnv() {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) return { url: process.env.NEXT_PUBLIC_SUPABASE_URL.trim(), key: process.env.SUPABASE_SERVICE_ROLE_KEY.trim() }
  const env = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8')
    .split('\n').filter(l => l && !l.startsWith('#'))
    .reduce((a, l) => { const eq = l.indexOf('='); if (eq > 0) a[l.slice(0, eq).trim()] = l.slice(eq + 1).trim().replace(/^["']|["']$/g, ''); return a }, {})
  return { url: env.NEXT_PUBLIC_SUPABASE_URL, key: env.SUPABASE_SERVICE_ROLE_KEY }
}

async function main() {
  const par = String(process.argv[2] ?? '').toUpperCase()
  if (!PARES.includes(par) || process.argv.length !== 3) {
    console.log(`Uso: node scripts/comprueba-descarga.js PAR (uno de: ${PARES.join(', ')})`)
    console.log('\n=== ⚠️ ATENCION: no se ha pedido nada (codigo 4) ===')
    process.exitCode = 4
    return
  }
  const F = await import('../lib/mercado/ficheros.mjs')
  const L = await import('../lib/mercado/limites.mjs')
  const K = await import('../lib/mercado/comprueba.mjs')
  const { url, key } = getEnv()
  // el mismo cliente que el diario: tope en la recepcion por fuera del plazo
  const sb = createClient(url, key, { global: { fetch: L.fetchConTope(L.fetchConLimite((...a) => globalThis.fetch(...a), F.LIMITES.grandeMs)) } })
  const anio = new Date().getUTCFullYear()
  console.log(`\n=== CONTRATO DE LA DESCARGA LIMITADA — ${par} ${anio} — ${new Date().toISOString()} (solo lectura) ===\n`)
  const r = await K.compruebaDescarga(sb, par, anio, { ...F.LIMITES, tiempos: [] })
  r.lineas.forEach(l => console.log(`  ${l}`))
  process.exitCode = r.codigo
  if (r.codigo === 0) console.log('\n=== ✓ TODO OK — el contrato de la descarga limitada se cumple (codigo 0) ===')
  else console.log(`\n=== ⚠️ ATENCION: ${r.codigo === 1 ? 'el sha256 del cuerpo no es el de los metadatos' : 'el diario saldria con 3 (etag, tamaño u objeto)'} (codigo ${r.codigo}) ===`)
}

main().catch(e => { console.error('Fatal:', e?.name ?? 'Error'); process.exit(4) })
