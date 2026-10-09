// RESTAURA el año 2026 de cada par desde Dukascopy al bucket forex-data.
//
//   node scripts/restore-2026.js           -> SECO (por defecto): descarga, comprueba
//                                             y dice que subiria; no escribe nada
//   node scripts/restore-2026.js --subir   -> SUBE de verdad lo que pase las comprobaciones
//
// Auditoria O01 (4-oct-2026): antes subia lo que devolviera el proveedor (vacio
// incluido), borraba los 2023 sin mirar el resultado y acababa en «Done.» con
// codigo 0. Ahora:
//   · NO borra nada, nunca.
//   · Por par, antes de subir: el proveedor no puede venir vacio ni PARCIAL, y
//     lo nuevo no puede tener menos velas que lo guardado. Si lo guardado no se
//     puede leer, no se sube (no se sabe si lo nuevo es peor).
//   · Se comprueba el { error } del upload.
//   · Si algun par falla, acaba con codigo 1.
// Bloque D, punto 1 (CTO, 5-oct-2026): publica SOLO por la funcion comun
// publicarAnio de lib/mercado/ficheros.mjs (cerrojo por par y año, relee justo
// antes de subir, valida con lib/mercado/calidad.mjs, ningun dia con menos
// velas que lo releido, verifica despues). Cobertura exigida: cada dia
// laborable del 1-ene a AYER; las excepciones son por FECHA (festivos), ya no
// una cantidad tolerada de dias. Sube .json.gz (un solo formato, CTO 9-oct).
const fs = require('fs')
const { getHistoricalRates } = require('dukascopy-node')
const { createClient } = require('@supabase/supabase-js')

const SUBIR = process.argv.includes('--subir')

const env = fs.readFileSync('.env.local', 'utf8')
  .split('\n').filter(l => l && !l.startsWith('#'))
  .reduce((a, l) => {
    const eq = l.indexOf('=')
    if(eq > 0) a[l.slice(0, eq).trim()] = l.slice(eq+1).trim().replace(/^["']|["']$/g, '')
    return a
  }, {})

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const PAIRS = ['eurusd', 'gbpusd', 'audusd', 'nzdusd', 'usdchf', 'usdcad']
const YEAR = 2026

// Bloque G, punto 8 (BF-02): de un error ajeno solo clase y codigo (errores.mjs)
let E
async function downloadWithRetry(pair, attempt = 1) {
  const now = new Date()
  const from = new Date(`${YEAR}-01-01T00:00:00Z`)
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
      console.log(`  ⚠ Retry ${attempt+1}/3 for ${pair}: ${E.texto(e)}`)
      await new Promise(r => setTimeout(r, 5000))
      return downloadWithRetry(pair, attempt+1)
    }
    throw e
  }
}

async function main() {
  // los modulos comunes son ESM (.mjs): import() desde este script CommonJS
  const F = await import('../lib/mercado/ficheros.mjs')
  const C = await import('../lib/mercado/calidad.mjs')
  E = await import('../lib/mercado/errores.mjs')
  console.log(`Restaurando ${YEAR} (${SUBIR ? '⚠️ REAL: sube' : '🔍 SECO: no escribe nada; para subir, --subir'})...\n`)
  const hoy = new Date()
  const ayerSeg = Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate() - 1) / 1000
  const fallos = []
  for(const pair of PAIRS) {
    const path = F.rutaEscritura(pair, YEAR)     // .json.gz (un solo formato, CTO 9-oct)
    try {
      console.log(`↓ ${pair.toUpperCase()}...`)
      const data = await downloadWithRetry(pair)
      const candles = (data || []).map(c => ({
        time: Math.floor(c.timestamp / 1000),
        open: c.open, high: c.high, low: c.low, close: c.close,
        volume: c.volume ?? 0,
      }))
      if (!candles.length) throw E.errorPropio('el proveedor devolvio 0 velas')
      if (!SUBIR) {
        // en seco: la misma validacion contra lo guardado ahora (sin cerrojo)
        const g = await F.leerVigente(sb, pair, YEAR)
        if (g.estado === 'error') throw E.errorPropio(`no se pudo leer lo guardado (${g.motivo}): no se sabe si lo nuevo es peor`)
        const v = C.validaParaPublicar(candles, g.estado === 'ok' ? g.velas : null, { anio: YEAR, exigeHasta: ayerSeg })
        if (!v.ok) throw E.errorPropio(`no se publicaria: ${v.problemas.join(' · ')}`)
        console.log(`  [SECO] subiria ${path}: ${candles.length} velas`)
        continue
      }
      // se publica el año del proveedor; la funcion comun relee lo vigente justo
      // antes y lo rechaza si algun dia quedaria con menos velas
      const r = await F.publicarAnio(sb, { pair, year: YEAR, componer: () => candles, exigeHasta: ayerSeg, dueno: 'restore-2026' })
      for (const a of r.avisos || []) console.log(`  aviso: ${a}`)
      if (r.estado === 'sin-cambios') { console.log(`  ✓ ${path}: igual que lo guardado, nada que subir`); continue }
      if (r.estado !== 'publicado') throw E.errorPropio(`${r.estado}: ${r.problemas.join(' · ')}`)
      console.log(`  ✓ ${path}: ${r.velas} candles, ${(r.bytes/1024/1024).toFixed(1)}MB (verificado)`)
    } catch(e) {
      console.log(`  ✗ ${pair.toUpperCase()}: ${E.texto(e)}`)
      fallos.push(pair.toUpperCase())
    }
  }
  if (fallos.length) {
    console.log(`\n=== ⚠️ ATENCION: ${fallos.length} par(es) sin restaurar: ${fallos.join(', ')}. No se ha subido nada de ellos. ===`)
    process.exitCode = 1
  } else {
    console.log(`\n=== ✓ TODO OK — ${PAIRS.length} pares ${SUBIR ? 'subidos' : 'comprobados (SECO, nada subido)'} ===`)
  }
}

main().catch(e => { console.error('Fatal:', E ? E.texto(e) : 'Error'); process.exit(1) })
