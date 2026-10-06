// SONDA DEL PROVEEDOR (CTO, 6-oct-2026, tras la etapa 1 de la recuperacion).
// Para una lista de par y dia, pide al proveedor SOLO ese dia con la MISMA
// funcion de descarga que el actualizador (lib/mercado/descarga.mjs: reintentos,
// esperas, plazo por peticion) y dice por cada uno: disponible con cuantas
// velas, sin datos, o error con su clase y codigo (lib/mercado/errores.mjs).
// ⛔ No lee ni escribe Storage, no publica y no usa la clave de servicio: no
//    crea cliente de Supabase ni lee .env.
//
//   node scripts/sonda-proveedor.js PAR:AAAA-MM-DD[..AAAA-MM-DD] [...]
//   p. ej. node scripts/sonda-proveedor.js AUDUSD:2026-09-27..2026-10-02 EURUSD:2026-07-20
// Salida: el log de cada intento (con lo que tardo) y una tabla. Codigo 0 si
// todos los dias estan disponibles, 2 si alguno no, 4 si la entrada no vale.
const dukascopy = require('dukascopy-node')

const PARES = ['AUDCAD', 'AUDUSD', 'EURUSD', 'GBPJPY', 'GBPUSD', 'NZDUSD', 'USDCAD', 'USDCHF', 'USDJPY']
const sleep = ms => new Promise(r => setTimeout(r, ms))
const fecha = s => /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s

// 'PAR:desde[..hasta]' → [{ par, dia }] | null
function pedidos(argv) {
  const out = []
  for (const a of argv) {
    const m = /^([A-Z]{6}):(\d{4}-\d{2}-\d{2})(?:\.\.(\d{4}-\d{2}-\d{2}))?$/.exec(a)
    if (!m || !PARES.includes(m[1]) || !fecha(m[2]) || (m[3] && (!fecha(m[3]) || m[3] < m[2]))) return null
    for (let t = Date.parse(m[2] + 'T00:00:00Z'); t <= Date.parse((m[3] || m[2]) + 'T00:00:00Z'); t += 86400000) out.push({ par: m[1], dia: new Date(t).toISOString().slice(0, 10) })
  }
  return out.length ? out : null
}

async function main() {
  const lista = pedidos(process.argv.slice(2))
  if (!lista) {
    console.log('Uso: node scripts/sonda-proveedor.js PAR:AAAA-MM-DD[..AAAA-MM-DD] [...]   (pares: ' + PARES.join(', ') + ')')
    console.log('\n=== ⚠️ ATENCION: no se ha pedido nada (entrada no valida) (codigo 4) ===')
    process.exitCode = 4
    return
  }
  const DESC = await import('../lib/mercado/descarga.mjs')
  const E = await import('../lib/mercado/errores.mjs')
  console.log(`\n=== SONDA DEL PROVEEDOR — ${new Date().toISOString()} — ${lista.length} dia(s) ===\n`)
  const filas = []
  for (const { par, dia } of lista) {
    const t0 = Date.now(), p0 = performance.now()
    let res
    try {
      const r = await DESC.bajaDia({ sdk: dukascopy, fetch: (...a) => globalThis.fetch(...a), espera: sleep, log: l => console.log('    ' + l), par, dia })
      res = r.velas.length ? `disponible ${r.velas.length} velas` : 'sin datos'
    } catch (e) {
      res = e?.tipo ? `error ${e.tipo} ${String(e.message).replace(/^[^:]*:\s*/, '')}` : `error ${E.texto(e)}`
    }
    filas.push({ par, dia, res, ms: Math.round(performance.now() - p0), hora: new Date(t0).toISOString().slice(11, 19) })
    await sleep(400)
  }
  console.log('\n  PAR      DIA          RESULTADO                               TOTAL     HORA (UTC)')
  for (const f of filas) console.log(`  ${f.par.padEnd(8)} ${f.dia}   ${f.res.padEnd(38)}  ${String(f.ms).padStart(6)} ms  ${f.hora}`)
  const no = filas.filter(f => !f.res.startsWith('disponible'))
  if (!no.length) console.log(`\n=== ✓ TODO OK — los ${filas.length} dia(s) disponibles ===`)
  else { console.log(`\n=== ⚠️ ATENCION: ${no.length} de ${filas.length} dia(s) no disponibles (codigo 2) ===`); process.exitCode = 2 }
}

main().catch(async e => { const E = await import('../lib/mercado/errores.mjs').catch(() => null); console.error('Fatal:', E ? E.texto(e) : 'Error'); process.exit(4) })
