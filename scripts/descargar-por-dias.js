// DESCARGA DÍA A DÍA (peticiones mínimas = máxima fiabilidad con Dukascopy).
// Reutiliza años ya completos. Para cada par/año pendiente, baja día por día,
// cachea cada día en ./descarga-2026/dias/ y ensambla el año al terminar.
const fs = require('fs')
const path = require('path')
const { getHistoricalRates } = require('dukascopy-node')

const OUT_DIR = path.join(__dirname, '..', 'descarga-2026')
const DIAS_DIR = path.join(OUT_DIR, 'dias')
const PAIRS = ['audcad','audusd','eurusd','gbpjpy','gbpusd','nzdusd','usdcad','usdchf','usdjpy']
const YEARS = [2024, 2025, 2026]

const MIN_VELAS_MES = 20000
const PAUSA_DIA_MS = 400
const REINT_DIA = 5
const PAUSA_REINT_MS = 2500

const sleep = ms => new Promise(r => setTimeout(r, ms))
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true })
if (!fs.existsSync(DIAS_DIR)) fs.mkdirSync(DIAS_DIR, { recursive: true })

const rutaAnio = (pair, year) => path.join(OUT_DIR, `${pair.toUpperCase()}_${year}.json`)
const rutaDia = (pair, ymd) => path.join(DIAS_DIR, `${pair.toUpperCase()}_${ymd}.json`)

function anioHecho(pair, year) {
  const p = rutaAnio(pair, year)
  if (!fs.existsSync(p)) return false
  try { const d = JSON.parse(fs.readFileSync(p,'utf8')); return Array.isArray(d) && d.length>0 } catch { return false }
}

// baja UN día (petición mínima), con caché en disco y reintentos
async function bajarDia(pair, year, mes, dia) {
  const ymd = `${year}-${String(mes+1).padStart(2,'0')}-${String(dia).padStart(2,'0')}`
  const cache = rutaDia(pair, ymd)
  if (fs.existsSync(cache)) { try { return JSON.parse(fs.readFileSync(cache,'utf8')) } catch {} }

  const now = new Date()
  const from = new Date(Date.UTC(year, mes, dia))
  let to = new Date(Date.UTC(year, mes, dia+1))
  if (from > now) return []
  if (to > now) to = now
  // sábados sin datos: los intentamos igual, devolverán 0 y ya

  for (let i=1;i<=REINT_DIA;i++) {
    try {
      const data = await getHistoricalRates({
        instrument: pair, dates:{from,to}, timeframe:'m1', format:'json', volumes:true,
        retryCount: 3, retryOnEmpty: true, pauseBetweenRetriesMs: 1500,
      })
      const mapped = data.map(c=>({time:Math.floor(c.timestamp/1000),open:c.open,high:c.high,low:c.low,close:c.close,volume:c.volume}))
      fs.writeFileSync(cache, JSON.stringify(mapped))
      return mapped
    } catch(e) {
      if (i<REINT_DIA) { await sleep(PAUSA_REINT_MS) } else throw e
    }
  }
}

function validar(candles, year) {
  if (!candles.length) return { ok:false, motivo:'0 velas' }
  const mesActual = new Date().toISOString().slice(0,7)
  const porMes = {}
  for (const c of candles) { const m=new Date(c.time*1000).toISOString().slice(0,7); porMes[m]=(porMes[m]||0)+1 }
  for (let mm=1; mm<=12; mm++) {
    const clave = `${year}-${String(mm).padStart(2,'0')}`
    if (clave>mesActual) break
    if (clave===mesActual) continue
    const n = porMes[clave]||0
    if (n<MIN_VELAS_MES) return { ok:false, motivo:`mes ${clave} ${n} velas` }
  }
  return { ok:true }
}

async function bajarAnioPorDias(pair, year) {
  const now = new Date()
  let todo = []
  let faltasDia = 0
  for (let mes=0; mes<12; mes++) {
    const diasEnMes = new Date(Date.UTC(year, mes+1, 0)).getUTCDate()
    for (let dia=1; dia<=diasEnMes; dia++) {
      const primer = new Date(Date.UTC(year, mes, dia))
      if (primer > now) { process.stdout.write('\n'); return { candles: todo.map(m=>m), faltasDia } }
      try {
        const v = await bajarDia(pair, year, mes, dia)
        todo = todo.concat(v)
      } catch(e) { faltasDia++; process.stdout.write('x') }
      await sleep(PAUSA_DIA_MS)
    }
    process.stdout.write(`[${String(mes+1).padStart(2,'0')}]`)  // marca fin de mes
  }
  process.stdout.write('\n')
  return { candles: todo, faltasDia }
}

async function main() {
  const pendientes = []
  for (const pair of PAIRS) for (const year of YEARS) if (!anioHecho(pair, year)) pendientes.push([pair, year])
  const total = PAIRS.length*YEARS.length

  console.log(`\n=== DESCARGA DÍA A DÍA (máxima fiabilidad) ===`)
  console.log(`Ya completos: ${total-pendientes.length}/${total}`)
  console.log(`Pendientes: ${pendientes.map(([p,y])=>p.toUpperCase()+' '+y).join(', ') || 'ninguno'}\n`)

  if (!pendientes.length) { console.log(`✓✓✓ COMPLETO. Siguiente: subir a Supabase.`); return }

  const okList=[], failList=[]
  for (const [pair, year] of pendientes) {
    console.log(`  ${pair.toUpperCase()} ${year} (día a día, un momento)...`)
    process.stdout.write('    ')
    try {
      const { candles, faltasDia } = await bajarAnioPorDias(pair, year)
      const v = validar(candles, year)
      if (v.ok) {
        fs.writeFileSync(rutaAnio(pair, year), JSON.stringify(candles))
        console.log(`    ✓ ${candles.length} velas${faltasDia?` (${faltasDia} días con fallo)`:''} — guardado`)
        okList.push(`${pair} ${year}`)
      } else {
        console.log(`    ✗ ${v.motivo}${faltasDia?` (${faltasDia} días fallaron)`:''} — NO guardado`)
        failList.push(`${pair.toUpperCase()} ${year}`)
      }
    } catch(e) { console.log(`    ✗ ${e.message}`); failList.push(`${pair.toUpperCase()} ${year}`) }
  }

  console.log(`\n=== RESUMEN ===`)
  console.log(`  Conseguidos: ${okList.length}/${pendientes.length}`)
  console.log(`  Total completos: ${total-failList.length}/${total}`)
  if (failList.length) { console.log(`  Faltan: ${failList.join(', ')}`); console.log(`  → Ejecuta de nuevo (reaprovecha los días ya cacheados, será más rápido).`) }
  else console.log(`  ✓✓✓ COMPLETO. Siguiente: subir a Supabase.`)
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1) })
