// VERIFICACION DEL DIARIO (CTO 11-oct-2026). SOLO LECTURA: info, descargas
// atadas de los .json.gz (por el mismo camino que el diario) y list del
// bucket. No publica, no toma ni libera cerrojos, no pide nada al proveedor.
// La logica y el informe: lib/mercado/verifica.mjs.
//
//   node scripts/verifica-diario.js DESDE [--pares EURUSD,NZDUSD]
//     DESDE: AAAA-MM-DD, el primer dia que tiene que estar completo; el año
//     verificado es el de DESDE (nunca el del reloj).
//
// Por par: cerrojo, .json del año, sha256 y velas del .gz frente a sus
// metadatos, ultima vela y estado de cada dia desde DESDE. Del bucket: objetos,
// bytes y fichas en _cerrojos/.
// Salida: 0 todo bien · 1 algun hallazgo · 3 algo no se pudo comprobar · 4 uso.
// Gasto: un .json.gz por par (unos 4,3 MB; los nueve, unos 39 MB).
// Ninguna URL ni clave en la salida.
const { createClient } = require('@supabase/supabase-js')
// la clave: SUPABASE_SECRET_KEY y, si no está, la vieja (lib/claveServidor.cjs, orden 2-018)
const { getClaveServidor, hayClaveServidor } = require('../lib/claveServidor.cjs')
const fs = require('fs'), path = require('path')

function getEnv() {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && hayClaveServidor(process.env)) return { url: process.env.NEXT_PUBLIC_SUPABASE_URL.trim(), key: getClaveServidor(process.env) }
  const env = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8')
    .split('\n').filter(l => l && !l.startsWith('#'))
    .reduce((a, l) => { const eq = l.indexOf('='); if (eq > 0) a[l.slice(0, eq).trim()] = l.slice(eq + 1).trim().replace(/^["']|["']$/g, ''); return a }, {})
  return { url: env.NEXT_PUBLIC_SUPABASE_URL, key: getClaveServidor(env) }
}

async function main() {
  const V = await import('../lib/mercado/verifica.mjs')
  const args = process.argv.slice(2)
  const desde = V.fechaValida(args[0])
  const iP = args.indexOf('--pares')
  const pares = iP >= 0 ? String(args[iP + 1] ?? '').toUpperCase().split(',').filter(Boolean) : V.PARES
  const sobran = args.slice(1).filter((a, k) => !(iP >= 0 && (k + 1 === iP || k + 1 === iP + 1)))
  if (!desde || !pares.length || pares.some(p => !V.PARES.includes(p)) || sobran.length) {
    console.log(`Uso: node scripts/verifica-diario.js AAAA-MM-DD [--pares ${V.PARES.slice(0, 2).join(',')}]   (pares: ${V.PARES.join(', ')})`)
    console.log('\n=== ⚠️ ATENCION: no se ha pedido nada (codigo 4) ===')
    process.exitCode = 4
    return
  }
  const F = await import('../lib/mercado/ficheros.mjs')
  const L = await import('../lib/mercado/limites.mjs')
  const { url, key } = getEnv()
  // el mismo cliente que el diario: corte por plazo y tope en la recepcion
  const sb = createClient(url, key, { global: { fetch: L.fetchConTope(L.fetchConLimite((...a) => globalThis.fetch(...a), F.LIMITES.grandeMs)) } })
  console.log(`\n=== VERIFICACION DEL DIARIO — desde ${desde} — ${pares.length} par(es) — ${new Date().toISOString()} (solo lectura) ===\n`)
  const r = await V.verificaDiario(sb, { desde, pares, lim: { ...F.LIMITES, tiempos: [] } })
  r.lineas.forEach(l => console.log(l))
  process.exitCode = r.codigo
  if (r.codigo === 0) console.log('\n=== ✓ TODO OK — nada que señalar (codigo 0) ===')
  else console.log(`\n=== ⚠️ ATENCION: ${r.codigo === 1 ? 'hay hallazgos (✗)' : 'algo no se pudo comprobar (⚠️)'} (codigo ${r.codigo}) ===`)
}

// BF-02: solo clase y codigo (lib/mercado/errores.mjs), nunca el message
main().catch(async e => { const E = await import('../lib/mercado/errores.mjs').catch(() => null); console.error('Fatal:', E ? E.texto(e) : 'Error'); process.exit(3) })
