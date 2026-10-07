// SONDA DEL PROVEEDOR (CTO, 6-oct-2026, tras la etapa 1 de la recuperacion).
// Para una lista de par y dia, pide al proveedor SOLO ese dia con la MISMA
// funcion de descarga que el actualizador (lib/mercado/descarga.mjs: plazo por
// peticion; aqui con un solo intento) y dice por cada uno: disponible con cuantas
// velas, sin datos, o error con su clase y codigo (lib/mercado/errores.mjs).
// ⛔ No lee ni escribe Storage, no publica y no usa la clave de servicio: no
//    crea cliente de Supabase ni lee .env.
//
//   node scripts/sonda-proveedor.js [--pausa S] [--cabeceras] PAR:AAAA-MM-DD[..AAAA-MM-DD] [...]
//   --cabeceras (CTO 7-oct): imprime de cada respuesta SOLO las cabeceras de
//   limite: Retry-After, X-RateLimit-*, Server, Via y CF-*. Nunca la URL.
//   p. ej. node scripts/sonda-proveedor.js AUDUSD:2026-07-20 AUDUSD:2026-09-27 EURUSD:2026-07-20
// EDUCADA (CTO, 6-oct, tras la sonda 1: 69 de 75 peticiones con HTTP 429):
//   · UN solo intento por dia, sin reintentos;
//   · pausa entre peticiones: --pausa S segundos (por defecto 30);
//   · se detiene entera al PRIMER 429, SIEMPRE: aunque traiga un Retry-After
//     corto no espera ni reintenta (el actualizador si, si cabe: CTO 7-oct);
//     enseña el Retry-After si viene. Tambien se detiene al
//     segundo fallo de conexion seguido. Lo que queda sale «no pedido».
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

// --cabeceras: solo las de limite, y sin nada que parezca una URL
const DE_LIMITE = /^(retry-after|x-ratelimit-[a-z0-9-]+|server|via|cf-[a-z0-9-]+)$/i
const fetchConCabeceras = ver => async (...a) => {
  const r = await globalThis.fetch(...a)
  if (ver) {
    const vistas = []
    for (const [k, v] of (r.headers?.entries?.() ?? [])) if (DE_LIMITE.test(k)) vistas.push(`${k.toLowerCase()}: ${String(v).replace(/[a-z]+:\/\/\S+/gi, '[url]')}`)
    console.log(`    cabeceras: ${vistas.join(' · ') || '(ninguna de limite)'}`)
  }
  return r
}

async function main() {
  const args = process.argv.slice(2)
  const ic = args.indexOf('--cabeceras'), verCabeceras = ic >= 0
  if (verCabeceras) args.splice(ic, 1)
  let pausaS = 30
  const ip = args.indexOf('--pausa')
  if (ip >= 0) { pausaS = Number(args[ip + 1]); args.splice(ip, 2) }
  const lista = Number.isFinite(pausaS) && pausaS >= 0 ? pedidos(args) : null
  if (!lista) {
    console.log('Uso: node scripts/sonda-proveedor.js [--pausa S] PAR:AAAA-MM-DD[..AAAA-MM-DD] [...]   (pares: ' + PARES.join(', ') + ')')
    console.log('\n=== ⚠️ ATENCION: no se ha pedido nada (entrada no valida) (codigo 4) ===')
    process.exitCode = 4
    return
  }
  const DESC = await import('../lib/mercado/descarga.mjs')
  const E = await import('../lib/mercado/errores.mjs')
  console.log(`\n=== SONDA DEL PROVEEDOR (educada: 1 intento por dia, pausa ${pausaS} s) — ${new Date().toISOString()} — ${lista.length} dia(s) ===\n`)
  const filas = []
  let parada = null, redSeguidas = 0
  for (const [k, { par, dia }] of lista.entries()) {
    if (parada) { filas.push({ par, dia, res: 'no pedido (sonda detenida)', ms: 0, hora: '-' }); continue }
    const t0 = Date.now(), p0 = performance.now()
    let res
    try {
      const r = await DESC.bajaDia({ sdk: dukascopy, fetch: fetchConCabeceras(verCabeceras), espera: sleep, log: l => console.log('    ' + l), par, dia, intentos: 1 })
      res = r.velas.length ? `disponible ${r.velas.length} velas` : 'sin datos'
      redSeguidas = 0
    } catch (e) {
      res = e?.tipo ? `error ${e.tipo} ${String(e.message).replace(/^[^:]*:\s*/, '')}` : `error ${E.texto(e)}`
      if (e?.estado === 429) {
        parada = `el proveedor limita (HTTP 429)${e.retryAfterMs != null ? `; Retry-After ${Math.round(e.retryAfterMs / 1000)} s` : '; sin Retry-After'}`
      } else if (e?.tipo === 'red') {
        if (++redSeguidas >= 2) parada = 'dos fallos de conexion seguidos'
      } else redSeguidas = 0
    }
    filas.push({ par, dia, res, ms: Math.round(performance.now() - p0), hora: new Date(t0).toISOString().slice(11, 19) })
    if (parada) console.log(`    SONDA DETENIDA: ${parada}`)
    else if (k < lista.length - 1) { console.log(`    (pausa ${pausaS} s)`); await sleep(pausaS * 1000) }
  }
  console.log('\n  PAR      DIA          RESULTADO                               TOTAL     HORA (UTC)')
  for (const f of filas) console.log(`  ${f.par.padEnd(8)} ${f.dia}   ${f.res.padEnd(38)}  ${String(f.ms).padStart(6)} ms  ${f.hora}`)
  if (parada) console.log(`\n  Detenida: ${parada}`)
  const no = filas.filter(f => !f.res.startsWith('disponible'))
  if (!no.length) console.log(`\n=== ✓ TODO OK — los ${filas.length} dia(s) disponibles ===`)
  else { console.log(`\n=== ⚠️ ATENCION: ${no.length} de ${filas.length} dia(s) no disponibles (codigo 2) ===`); process.exitCode = 2 }
}

main().catch(async e => { const E = await import('../lib/mercado/errores.mjs').catch(() => null); console.error('Fatal:', E ? E.texto(e) : 'Error'); process.exit(4) })
