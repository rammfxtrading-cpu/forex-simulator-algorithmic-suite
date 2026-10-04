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
//   · Por par, antes de subir: el proveedor no puede venir vacio ni PARCIAL
//     (dias laborables del 1-ene a ayer con menos velas que el umbral de
//     pages/api/candles.js, con una pequeña tolerancia para festivos), y lo
//     nuevo no puede tener menos velas que lo guardado. Si lo guardado no se
//     puede leer, no se sube (no se sabe si lo nuevo es peor).
//   · Se comprueba el { error } del upload.
//   · Si algun par falla, acaba con codigo 1.
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

// Umbral de «dia completo» por dia de la semana (UTC): el mismo que
// pages/api/candles.js (THRESHOLD_BY_WEEKDAY) para lunes a viernes.
const UMBRAL_LABORABLE = { 1: 1200, 2: 1200, 3: 1200, 4: 1200, 5: 1000 }
// Festivos (1-ene, 25-dic...) dan dias cortos de verdad: se toleran unos pocos.
const toleranciaDias = laborables => Math.max(2, Math.ceil(laborables * 0.03))

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
      console.log(`  ⚠ Retry ${attempt+1}/3 for ${pair}: ${e.message}`)
      await new Promise(r => setTimeout(r, 5000))
      return downloadWithRetry(pair, attempt+1)
    }
    throw e
  }
}

// Dias laborables del 1-ene a AYER (UTC) por debajo del umbral.
function diasCortos(candles) {
  const porDia = {}
  for (const c of candles) { const d = new Date(c.time * 1000).toISOString().slice(0, 10); porDia[d] = (porDia[d] || 0) + 1 }
  const hoy = new Date()
  const ayer = Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate() - 1)
  const cortos = []
  let laborables = 0
  for (let t = Date.UTC(YEAR, 0, 1); t <= ayer && new Date(t).getUTCFullYear() === YEAR; t += 86400000) {
    const umbral = UMBRAL_LABORABLE[new Date(t).getUTCDay()]
    if (!umbral) continue
    laborables++
    const d = new Date(t).toISOString().slice(0, 10)
    if ((porDia[d] || 0) < umbral) cortos.push(`${d}(${porDia[d] || 0}/${umbral})`)
  }
  return { laborables, cortos }
}

// Lo guardado: { estado: 'ok', velas } | { estado: 'no-existe' } | { estado: 'error', motivo }
// «No existe» = el 404 de storage-js (statusCode '404'); cualquier otro error, no se pudo leer.
async function leerGuardado(path) {
  const { data, error } = await sb.storage.from('forex-data').download(path)
  if (error) return (String(error.statusCode) === '404' || error.status === 404) ? { estado: 'no-existe' } : { estado: 'error', motivo: error.message || String(error) }
  try { return { estado: 'ok', velas: JSON.parse(await data.text()) } } catch (e) { return { estado: 'error', motivo: 'JSON ilegible' } }
}

async function main() {
  console.log(`Restaurando ${YEAR} (${SUBIR ? '⚠️ REAL: sube' : '🔍 SECO: no escribe nada; para subir, --subir'})...\n`)
  const fallos = []
  for(const pair of PAIRS) {
    const path = `${pair.toUpperCase()}/M1/${YEAR}.json`
    try {
      console.log(`↓ ${pair.toUpperCase()}...`)
      const data = await downloadWithRetry(pair)
      const candles = (data || []).map(c => ({
        time: Math.floor(c.timestamp / 1000),
        open: c.open, high: c.high, low: c.low, close: c.close,
        volume: c.volume ?? 0,
      }))
      if (!candles.length) throw new Error('el proveedor devolvio 0 velas')
      const { laborables, cortos } = diasCortos(candles)
      if (cortos.length > toleranciaDias(laborables)) {
        throw new Error(`PARCIAL: ${cortos.length} de ${laborables} dias laborables por debajo del umbral (tolerancia ${toleranciaDias(laborables)}): ${cortos.slice(0, 5).join(', ')}${cortos.length > 5 ? '…' : ''}`)
      }
      const guardado = await leerGuardado(path)
      if (guardado.estado === 'error') throw new Error(`no se pudo leer lo guardado (${guardado.motivo}): no se sabe si lo nuevo es peor`)
      if (guardado.estado === 'ok' && candles.length < guardado.velas.length) {
        throw new Error(`lo nuevo tiene ${candles.length} velas y lo guardado ${guardado.velas.length}: no se empeora`)
      }
      const body = JSON.stringify(candles)
      if (!SUBIR) { console.log(`  [SECO] subiria ${candles.length} velas (${(body.length/1024/1024).toFixed(1)}MB; ${cortos.length} dias cortos tolerados)`); continue }
      const { error } = await sb.storage.from('forex-data')
        .upload(path, body, { contentType: 'application/json', upsert: true })
      if(error) throw new Error(`fallo al subir: ${error.message || error}`)
      console.log(`  ✓ ${candles.length} candles, ${(body.length/1024/1024).toFixed(1)}MB`)
    } catch(e) {
      console.log(`  ✗ ${pair.toUpperCase()}: ${e.message}`)
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

main().catch(e => { console.error('Fatal:', e.message); process.exit(1) })
