// scripts/audit-pares-2026.js
// Diagnostico INOCUO: descarga 6 pares anyo 2026 de Dukascopy a /tmp/,
// cuenta velas por dia y reporta agujeros. NO toca Supabase. NO toca produccion.
// Adaptado de scripts/test-redownload-2026.js (sesion 15).

const fs = require('fs')
const { getHistoricalRates } = require('dukascopy-node')

const PAIRS = ['eurusd', 'gbpusd', 'audusd', 'nzdusd', 'usdcad', 'usdchf']
const YEAR = 2026
const OUTPUT_DIR = '/tmp'
const SUMMARY_PATH = `${OUTPUT_DIR}/audit-pares-${YEAR}-summary.json`

const THRESHOLD_BY_WEEKDAY = {
  0: 50,
  1: 1200,
  2: 1200,
  3: 1200,
  4: 1200,
  5: 1000,
  6: 0,
}

const WEEKDAY_NAMES = ['dom', 'lun', 'mar', 'mie', 'jue', 'vie', 'sab']

async function downloadWithRetry(pair, attempt = 1) {
  const now = new Date()
  const from = new Date(`${YEAR}-01-01T00:00:00Z`)
  let to = new Date(`${YEAR + 1}-01-01T00:00:00Z`)
  if (to > now) to = now

  console.log(`  Intento ${attempt}/3: descargando ${pair.toUpperCase()} de ${from.toISOString().slice(0,10)} a ${to.toISOString().slice(0,10)}...`)
  const t0 = Date.now()
  try {
    const data = await getHistoricalRates({
      instrument: pair,
      dates: { from, to },
      timeframe: 'm1',
      format: 'json',
      volumes: true,
    })
    const secs = ((Date.now() - t0) / 1000).toFixed(1)
    console.log(`  OK: ${data.length} velas recibidas en ${secs}s`)
    return data
  } catch (e) {
    console.log(`  ERROR intento ${attempt}: ${e.message}`)
    if (attempt < 3) {
      console.log(`  Esperando 5s antes de reintentar...`)
      await new Promise(r => setTimeout(r, 5000))
      return downloadWithRetry(pair, attempt + 1)
    }
    throw e
  }
}

function countCandlesPerDay(data) {
  const byDay = {}
  for (const c of data) {
    const d = new Date(c.timestamp).toISOString().slice(0, 10)
    byDay[d] = (byDay[d] || 0) + 1
  }
  return byDay
}

function detectGaps(byDay) {
  const allDates = Object.keys(byDay).sort()
  if (!allDates.length) return { gaps: [], totalDays: 0 }

  const first = new Date(allDates[0] + 'T00:00:00Z')
  const last = new Date(allDates[allDates.length - 1] + 'T00:00:00Z')
  const allRange = []
  for (let d = new Date(first); d <= last; d.setUTCDate(d.getUTCDate() + 1)) {
    allRange.push(d.toISOString().slice(0, 10))
  }

  const gaps = []
  for (const date of allRange) {
    const count = byDay[date] || 0
    const weekday = new Date(date + 'T00:00:00Z').getUTCDay()
    const threshold = THRESHOLD_BY_WEEKDAY[weekday]
    if (count < threshold) {
      gaps.push({ date, weekday, weekdayName: WEEKDAY_NAMES[weekday], count, threshold })
    }
  }
  return { gaps, totalDays: allRange.length }
}

async function auditPair(pair) {
  console.log(`\n--- ${pair.toUpperCase()} ${YEAR} ---`)
  const outputPath = `${OUTPUT_DIR}/${pair}-${YEAR}-test.json`

  const data = await downloadWithRetry(pair)

  const candles = data.map(c => ({
    time: Math.floor(c.timestamp / 1000),
    open: c.open, high: c.high, low: c.low, close: c.close,
    volume: c.volume ?? 0,
  }))

  fs.writeFileSync(outputPath, JSON.stringify(candles))
  const sizeMB = (fs.statSync(outputPath).size / 1024 / 1024).toFixed(1)
  console.log(`  Guardado: ${outputPath} (${sizeMB} MB, ${candles.length} velas)`)

  const byDay = countCandlesPerDay(data)
  const { gaps, totalDays } = detectGaps(byDay)

  return {
    pair: pair.toUpperCase(),
    totalCandles: candles.length,
    firstCandle: new Date(data[0].timestamp).toISOString(),
    lastCandle: new Date(data[data.length - 1].timestamp).toISOString(),
    totalDays,
    daysWithData: Object.keys(byDay).length,
    gaps,
    outputPath,
    sizeMB: parseFloat(sizeMB),
  }
}

async function main() {
  console.log(`\n=== AUDIT INOCUO: 6 pares x ${YEAR} desde Dukascopy ===`)
  console.log(`Salida individual: ${OUTPUT_DIR}/<pair>-${YEAR}-test.json (NO se toca Supabase)`)
  console.log(`Resumen JSON: ${SUMMARY_PATH}`)

  const results = []
  for (const pair of PAIRS) {
    try {
      const r = await auditPair(pair)
      results.push(r)
    } catch (e) {
      console.log(`  FALLO TOTAL ${pair.toUpperCase()}: ${e.message}`)
      results.push({ pair: pair.toUpperCase(), error: e.message })
    }
  }

  console.log(`\n=== RESUMEN CONSOLIDADO ===\n`)
  console.log(`  par      velas    dias  agujeros  estado`)
  console.log(`  -------  -------  ----  --------  ---------------`)
  for (const r of results) {
    if (r.error) {
      console.log(`  ${r.pair.padEnd(7)}  -        -     -         FALLO: ${r.error}`)
      continue
    }
    const estado = r.gaps.length === 0 ? 'LIMPIO' : `${r.gaps.length} AGUJEROS`
    console.log(`  ${r.pair.padEnd(7)}  ${String(r.totalCandles).padStart(7)}  ${String(r.totalDays).padStart(4)}  ${String(r.gaps.length).padStart(8)}  ${estado}`)
  }

  const conAgujeros = results.filter(r => r.gaps && r.gaps.length > 0)
  if (conAgujeros.length > 0) {
    console.log(`\n=== DETALLE AGUJEROS ===`)
    for (const r of conAgujeros) {
      console.log(`\n  ${r.pair}:`)
      console.log(`    fecha       dia  velas / umbral`)
      console.log(`    ----------  ---  --------------`)
      for (const g of r.gaps) {
        console.log(`    ${g.date}  ${g.weekdayName}  ${String(g.count).padStart(5)} / ${g.threshold}`)
      }
    }
  } else {
    console.log(`\n=== TODOS LOS PARES LIMPIOS ===`)
  }

  fs.writeFileSync(SUMMARY_PATH, JSON.stringify({
    timestamp: new Date().toISOString(),
    year: YEAR,
    pairs: results,
  }, null, 2))
  console.log(`\nResumen JSON guardado en: ${SUMMARY_PATH}`)
}

main().catch(e => {
  console.error('\nFatal:', e)
  process.exit(1)
})
