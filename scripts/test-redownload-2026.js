// scripts/test-redownload-2026.js
// Diagnostico INOCUO: descarga EUR/USD 2026 de Dukascopy, guarda a /tmp,
// cuenta velas por dia y reporta agujeros. NO toca Supabase. NO toca produccion.

const fs = require('fs')
const { getHistoricalRates } = require('dukascopy-node')

const PAIR = 'eurusd'
const YEAR = 2026
const OUTPUT_PATH = `/tmp/eurusd-2026-test.json`

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

  console.log(`\n  Intento ${attempt}/3: descargando ${pair.toUpperCase()} de ${from.toISOString().slice(0,10)} a ${to.toISOString().slice(0,10)}...`)
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

async function main() {
  console.log(`\n=== DIAGNOSTICO INOCUO: re-descarga ${PAIR.toUpperCase()} ${YEAR} ===\n`)
  console.log(`Salida: ${OUTPUT_PATH} (NO se toca Supabase)\n`)

  const data = await downloadWithRetry(PAIR)

  const candles = data.map(c => ({
    time: Math.floor(c.timestamp / 1000),
    open: c.open, high: c.high, low: c.low, close: c.close,
    volume: c.volume ?? 0,
  }))

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(candles))
  const sizeMB = (fs.statSync(OUTPUT_PATH).size / 1024 / 1024).toFixed(1)
  console.log(`\nGuardado: ${OUTPUT_PATH} (${sizeMB} MB, ${candles.length} velas)`)

  const byDay = countCandlesPerDay(data)
  const { gaps, totalDays } = detectGaps(byDay)

  console.log(`\n=== RESUMEN ===`)
  console.log(`  Total velas:     ${candles.length}`)
  console.log(`  Primera vela:    ${new Date(data[0].timestamp).toISOString()}`)
  console.log(`  Ultima vela:     ${new Date(data[data.length-1].timestamp).toISOString()}`)
  console.log(`  Dias cubiertos:  ${totalDays}`)
  console.log(`  Dias con datos:  ${Object.keys(byDay).length}`)
  console.log(`  Agujeros:        ${gaps.length}`)

  if (gaps.length === 0) {
    console.log(`\nSIN AGUJEROS. Datos completos.`)
  } else {
    console.log(`\nAGUJEROS DETECTADOS:\n`)
    console.log(`  fecha       dia  velas / umbral`)
    console.log(`  ----------  ---  --------------`)
    for (const g of gaps) {
      console.log(`  ${g.date}  ${g.weekdayName}  ${String(g.count).padStart(5)} / ${g.threshold}`)
    }
  }

  console.log(`\n=== DIAS CRITICOS (los que faltan en Supabase) ===`)
  const criticos = ['2026-01-01', '2026-01-02', '2026-01-08', '2026-01-09']
  for (const date of criticos) {
    const count = byDay[date] || 0
    const weekday = new Date(date + 'T00:00:00Z').getUTCDay()
    const status = count >= THRESHOLD_BY_WEEKDAY[weekday] ? 'COMPLETO' : 'AGUJERO'
    console.log(`  ${date} (${WEEKDAY_NAMES[weekday]}): ${count} velas  ${status}`)
  }
}

main().catch(e => {
  console.error('\nFatal:', e)
  process.exit(1)
})