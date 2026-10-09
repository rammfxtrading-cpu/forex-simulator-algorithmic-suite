// COPIA LOCAL Y DIAGNOSTICO DE SOLO LECTURA del bucket forex-data (5-oct-2026).
// Para la recuperacion de los pares retrasados: ANTES de publicar nada, guarda
// una copia de cada {PAR}/M1/{AÑO} tal como esta y dice, por par, la ultima
// vela real y los dias laborables que faltan o estan cortos hasta ayer.
// ⛔ No escribe en el bucket, no llama al proveedor, no borra nada.
//
//   node scripts/copia-mercado.js EURUSD AUDUSD AUDCAD GBPJPY
//      → ~/copias-suite/<fecha-hora>-mercado-<AÑO>-<aleatorio>/<PAR>_<AÑO>.json (+ .sha256)
//        y resumen-<AÑO>.txt. BE-03 (Astra, cierres-3; bloque G, punto 4): UNA
//        CARPETA NUEVA POR EJECUCION, creada en exclusiva, y ficheros escritos
//        con 'wx': una copia anterior nunca se sobrescribe.
//   COPIA_DIR=/otra/carpeta  cambia la BASE (dentro, la carpeta de la ejecucion;
//                            fuera de los repositorios y de iCloud)
//   ANIO=2025                el año (por defecto, el UTC en curso). ASCII: una
//                            variable «AÑO» no llega al proceso (5-oct: se copio 2026 dos veces)
// Lee lo vigente con las mismas reglas que /api/candles (lib/mercado/ficheros.mjs:
// el .json.gz y, si no existe, el .json; un solo formato, CTO 9-oct).
// Transferencia: un fichero anual por par (≈ 29 MB en .json, ≈ 4,1-4,5 MB en
// .json.gz, medidos el 9-oct sobre la copia del 5-oct).
const { createClient } = require('@supabase/supabase-js')
const fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto')

function getEnv() {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) return { url: process.env.NEXT_PUBLIC_SUPABASE_URL.trim(), key: process.env.SUPABASE_SERVICE_ROLE_KEY.trim() }
  const env = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8')
    .split('\n').filter(l => l && !l.startsWith('#'))
    .reduce((a, l) => { const eq = l.indexOf('='); if (eq > 0) a[l.slice(0, eq).trim()] = l.slice(eq + 1).trim().replace(/^["']|["']$/g, ''); return a }, {})
  return { url: env.NEXT_PUBLIC_SUPABASE_URL, key: env.SUPABASE_SERVICE_ROLE_KEY }
}
const ymd = t => new Date(t * 1000).toISOString().slice(0, 10)

async function main() {
  const pares = process.argv.slice(2).map(p => p.toUpperCase().replace('/', ''))
  if (!pares.length || pares.some(p => !/^[A-Z]{6}$/.test(p))) { console.log('Uso: node scripts/copia-mercado.js PAR [PAR...]'); console.log('\n=== ⚠️ ATENCION: nada copiado ==='); process.exitCode = 1; return }
  const F = await import('../lib/mercado/ficheros.mjs')
  const C = await import('../lib/mercado/calidad.mjs')
  const hoy = new Date()
  const anio = Number(process.env.ANIO || hoy.getUTCFullYear())
  if (!Number.isInteger(anio) || anio < 2000 || anio > hoy.getUTCFullYear()) { console.log(`ANIO no valido: ${process.env.ANIO}`); console.log('\n=== ⚠️ ATENCION: nada copiado ==='); process.exitCode = 1; return }
  console.log(`Año ${anio}${process.env.ANIO ? '' : ' (por defecto: el UTC en curso)'}`)
  const ayer = Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate() - 1) / 1000
  const hasta = Math.min(ayer, Date.UTC(anio, 11, 31) / 1000)
  const base = process.env.COPIA_DIR || path.join(os.homedir(), 'copias-suite')
  fs.mkdirSync(base, { recursive: true })
  const ejecucion = `${hoy.toISOString().replace(/[:.]/g, '-')}-mercado-${anio}-${crypto.randomBytes(3).toString('hex')}`
  const dir = path.join(fs.realpathSync(base), ejecucion)
  fs.mkdirSync(dir)                      // exclusiva: si existiera, falla (nunca se reutiliza)
  const { url, key } = getEnv()
  const sb = createClient(url, key)
  const resumen = [], fallos = []
  for (const par of pares) {
    const l = await F.leerVigente(sb, par, anio)
    if (l.estado !== 'ok') { const m = `${par} ${anio}: ✗ ${l.estado === 'no-existe' ? 'no existe' : 'no se pudo leer: ' + l.motivo}`; console.log(m); resumen.push(m); fallos.push(par); continue }
    const texto = JSON.stringify(l.velas)
    const sha = crypto.createHash('sha256').update(texto).digest('hex')
    const fichero = path.join(dir, `${par}_${anio}.json`)
    fs.writeFileSync(fichero, texto, { flag: 'wx' })
    fs.writeFileSync(fichero + '.sha256', `${sha}  ${path.basename(fichero)}\n`, { flag: 'wx' })
    // comprobacion de la copia: se relee del disco y se compara la huella
    const releida = crypto.createHash('sha256').update(fs.readFileSync(fichero)).digest('hex')
    const ultima = l.velas.length ? l.velas[l.velas.length - 1].time : null
    const cortos = C.diasCortos(l.velas, Date.UTC(anio, 0, 1) / 1000, hasta)
    const m = [
      `${par} ${anio}: ${l.ruta} · ${l.velas.length} velas · ${fs.statSync(fichero).size} bytes · sha256 ${sha}${releida === sha ? ' (copia verificada)' : ' ✗ LA COPIA NO COINCIDE'}`,
      `  ultima vela real: ${ultima ? new Date(ultima * 1000).toISOString() : '-'}`,
      `  dias laborables cortos o sin datos hasta ${ymd(hasta)}: ${cortos.length}${cortos.length ? ' → ' + cortos.join(', ') : ''}`,
    ].join('\n')
    console.log(m); resumen.push(m)
    if (releida !== sha) fallos.push(par)
  }
  fs.writeFileSync(path.join(dir, `resumen-${anio}.txt`), `Ejecucion ${ejecucion}\n` + resumen.join('\n') + '\n', { flag: 'wx' })
  console.log('')
  console.log(`Copia en ${dir}`)
  if (fallos.length) { console.log(`\n=== ⚠️ ATENCION: ${fallos.join(', ')} sin copia valida ===`); process.exitCode = 1 }
  else console.log(`\n=== ✓ TODO OK — ${pares.length} copia(s) verificada(s) ===`)
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1) })
