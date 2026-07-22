// ACTUALIZACIÓN INCREMENTAL DIARIA. Para cada par: lee el {año}.json de Supabase,
// baja DÍA A DÍA desde su última vela hasta AYER, añade sin duplicar, valida y resube.
// NUNCA borra el bucket. Pensado para correr en GitHub Actions cada noche.
// Uso:
//   node scripts/actualizar-diario.js          -> SECO (no sube, dice qué haría)
//   node scripts/actualizar-diario.js --subir   -> SUBE de verdad
const { getHistoricalRates } = require('dukascopy-node')
const { createClient } = require('@supabase/supabase-js')
const fs = require('fs'), path = require('path')

const SUBIR = process.argv.includes('--subir')

// Credenciales: de variables de entorno (GitHub Actions) o de .env.local (local)
function getEnv() {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    // .trim() defensivo: al pegar secretos en GitHub es facil colar un espacio
    // o salto de linea final, y Supabase rechaza el token ("Invalid Compact JWS").
    const u = process.env.NEXT_PUBLIC_SUPABASE_URL.trim()
    const k = process.env.SUPABASE_SERVICE_ROLE_KEY.trim()
    if (process.env.DIAG_CREDS === '1') {
      const crudo = process.env.SUPABASE_SERVICE_ROLE_KEY
      console.log('[DIAG] url  -> largo:', u.length, '| empieza por https:', u.startsWith('https://'))
      console.log('[DIAG] key  -> largo crudo:', crudo.length, '| largo tras trim:', k.length)
      console.log('[DIAG] key  -> tenia espacios/saltos sobrantes:', crudo.length !== k.length)
      console.log('[DIAG] key  -> prefijo:', k.slice(0, 10) + '...')
    }
    return { url: u, key: k }
  }
  const env = fs.readFileSync(path.join(__dirname,'..','.env.local'),'utf8')
    .split('\n').filter(l => l && !l.startsWith('#'))
    .reduce((a,l)=>{ const eq=l.indexOf('='); if(eq>0) a[l.slice(0,eq).trim()]=l.slice(eq+1).trim().replace(/^["']|["']$/g,''); return a },{})
  return { url: env.NEXT_PUBLIC_SUPABASE_URL, key: env.SUPABASE_SERVICE_ROLE_KEY }
}

const { url, key } = getEnv()
const sb = createClient(url, key)
const BUCKET = 'forex-data'
const PAIRS = ['audcad','audusd','eurusd','gbpjpy','gbpusd','nzdusd','usdcad','usdchf','usdjpy']

const sleep = ms => new Promise(r => setTimeout(r, ms))

// Baja UN día (petición pequeña = fiable) con reintentos
async function bajarDia(pair, y, m, d) {
  const from = new Date(Date.UTC(y, m, d))
  const to = new Date(Date.UTC(y, m, d+1))
  for (let i=1;i<=5;i++) {
    try {
      const data = await getHistoricalRates({
        instrument: pair, dates:{from,to}, timeframe:'m1', format:'json', volumes:true,
        retryCount: 4, retryOnEmpty: true, pauseBetweenRetriesMs: 2000,
      })
      return data.map(c=>({time:Math.floor(c.timestamp/1000),open:c.open,high:c.high,low:c.low,close:c.close,volume:c.volume}))
    } catch(e) { if (i<5) await sleep(3000); else throw e }
  }
}

async function procesarPar(pair) {
  const year = new Date().getUTCFullYear()
  const keyFile = `${pair.toUpperCase()}/M1/${year}.json`

  // 1) Descargar el archivo actual de Supabase
  const { data, error } = await sb.storage.from(BUCKET).download(keyFile)
  if (error) return { pair, estado:`✗ no se pudo leer ${keyFile}: ${error.message}` }
  const velas = JSON.parse(await data.text())
  if (!velas.length) return { pair, estado:`✗ archivo vacío` }

  // 2) Última fecha que ya tiene (día UTC de la última vela)
  const ultTime = velas[velas.length-1].time
  const ultDia = new Date(ultTime*1000)
  const ultYMD = ultDia.toISOString().slice(0,10)

  // 3) Rango a bajar: desde el día SIGUIENTE al último, hasta AYER (hoy no ha cerrado)
  const hoy = new Date()
  const ayer = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate()-1))
  const desde = new Date(Date.UTC(ultDia.getUTCFullYear(), ultDia.getUTCMonth(), ultDia.getUTCDate()+1))

  if (desde > ayer) return { pair, estado:`✓ al día (última: ${ultYMD}, nada que añadir)` }

  // 4) Bajar día a día en ese rango
  const nuevas = []
  let diasBajados = 0, diasConDatos = 0
  for (let t = new Date(desde); t <= ayer; t.setUTCDate(t.getUTCDate()+1)) {
    const dv = await bajarDia(pair, t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate())
    diasBajados++
    if (dv && dv.length) { nuevas.push(...dv); diasConDatos++ }
    await sleep(400)
  }

  if (!nuevas.length) return { pair, estado:`✓ sin velas nuevas (${diasBajados} días revisados, eran findes/festivos)` }

  // 5) Añadir sin duplicar (por time) y ordenar
  const vistos = new Set(velas.map(v=>v.time))
  const añadir = nuevas.filter(v=>!vistos.has(v.time))
  if (!añadir.length) return { pair, estado:`✓ nada nuevo real (ya estaban)` }
  const combinado = velas.concat(añadir).sort((a,b)=>a.time-b.time)

  const nuevoUlt = new Date(combinado[combinado.length-1].time*1000).toISOString().slice(0,10)

  if (!SUBIR) return { pair, estado:`[SECO] añadiría ${añadir.length} velas (${diasConDatos} días). Última pasaría de ${ultYMD} a ${nuevoUlt}` }

  // 6) Resubir con upsert
  const body = JSON.stringify(combinado)
  const up = await sb.storage.from(BUCKET).upload(keyFile, body, { contentType:'application/json', upsert:true })
  if (up.error) return { pair, estado:`✗ fallo subida: ${up.error.message}` }
  return { pair, estado:`✓ SUBIDO: +${añadir.length} velas. Última ${ultYMD} -> ${nuevoUlt}` }
}

async function main() {
  console.log(`\n=== ACTUALIZACIÓN DIARIA ${SUBIR?'⚠️ REAL':'🔍 SECO'} — ${new Date().toISOString()} ===\n`)
  const resultados = []
  for (const pair of PAIRS) {
    process.stdout.write(`  ${pair.toUpperCase()}... `)
    try { const r = await procesarPar(pair); console.log(r.estado); resultados.push(r) }
    catch(e) { console.log(`✗ ERROR: ${e.message}`); resultados.push({pair, estado:`✗ ${e.message}`}) }
  }
  const fallos = resultados.filter(r=>r.estado.startsWith('✗'))
  console.log(`\n=== ${fallos.length? '⚠️ '+fallos.length+' PAR(ES) CON FALLO':'✓ TODO OK'} ===`)
  if (fallos.length) { fallos.forEach(f=>console.log(`  ${f.pair}: ${f.estado}`)); process.exitCode = 1 }
  if (!SUBIR) console.log(`\n  (SECO — no se tocó nada. Para subir: --subir)`)
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1) })
