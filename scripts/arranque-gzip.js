// ARRANQUE DEL FORMATO UNICO (CTO 9-oct-2026, mercado diario, punto 5): los
// nueve {PAR}/M1/2026.json pasan a {PAR}/M1/2026.json.gz, UNA SOLA VEZ, desde
// el Mac, cuando el CTO autorice el despliegue (ver revisiones/
// 2026-10-09-mercado-diario-despliegue.md: lectores en main y comprobados
// ANTES; el cron, despues). Asi la primera ejecucion diaria solo baja los .gz
// (≈ 38 MB) y no gasta el tope en los .json (≈ 264 MB, autorizados aqui).
//
//   node scripts/arranque-gzip.js                    SECO: solo info() (sin descargar)
//   node scripts/arranque-gzip.js --subir            publica de verdad
//   ... --pares EURUSD,GBPUSD                        solo esos pares
//
// Por par: si ya hay .json.gz, nada (no se descarga). Si no, baja el .json una
// vez y publica el .json.gz con el publicador comun (publicarAnio: cerrojo,
// relectura solo si cambio, validacion, sha256 del cuerpo en los metadatos y
// verificacion por info()). Comprueba ademas que lo publicado son exactamente
// las velas del .json. NO borra nada (el .json se borrara en otro paso).
// Codigo: 0 todo migrado o ya en .gz · 1 algun par sin migrar · 4 uso.
const { createClient } = require('@supabase/supabase-js')
const fs = require('fs'), path = require('path')

const ANIO = 2026
const TODOS = ['EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'AUDUSD', 'USDCAD', 'NZDUSD', 'AUDCAD', 'GBPJPY']
const SUBIR = process.argv.includes('--subir')

function getEnv() {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) return { url: process.env.NEXT_PUBLIC_SUPABASE_URL.trim(), key: process.env.SUPABASE_SERVICE_ROLE_KEY.trim() }
  const env = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8')
    .split('\n').filter(l => l && !l.startsWith('#'))
    .reduce((a, l) => { const eq = l.indexOf('='); if (eq > 0) a[l.slice(0, eq).trim()] = l.slice(eq + 1).trim().replace(/^["']|["']$/g, ''); return a }, {})
  return { url: env.NEXT_PUBLIC_SUPABASE_URL, key: env.SUPABASE_SERVICE_ROLE_KEY }
}
function paresPedidos(argv) {
  const i = argv.findIndex(a => a === '--pares' || a.startsWith('--pares='))
  if (i < 0) return { lista: TODOS }
  const v = argv[i].includes('=') ? argv[i].split('=')[1] : argv[i + 1]
  const lista = String(v ?? '').split(',').map(p => p.trim().toUpperCase())
  const malos = lista.filter(p => !TODOS.includes(p))
  return malos.length || !lista.length ? { error: `--pares no valido: ${malos.join(', ') || '(vacio)'} (validos: ${TODOS.join(', ')})` } : { lista }
}

async function main() {
  const P = paresPedidos(process.argv)
  if (P.error) {
    console.log(P.error)
    console.log('\n=== ⚠️ ATENCION: no se ha hecho nada (codigo 4) ===')
    process.exitCode = 4
    return
  }
  const F = await import('../lib/mercado/ficheros.mjs')
  const L = await import('../lib/mercado/limites.mjs')
  const { url, key } = getEnv()
  const sb = createClient(url, key, { global: { fetch: L.fetchConLimite((...a) => globalThis.fetch(...a), F.LIMITES.grandeMs) } })
  const LIM = { ...F.LIMITES, tiempos: [] }
  const T = { n: 0, bytes: 0 }
  const mal = []
  console.log(`\n=== ARRANQUE .json → .json.gz ${ANIO} ${SUBIR ? '⚠️ REAL' : '🔍 SECO'} — ${new Date().toISOString()} — ${P.lista.join(', ')} ===\n`)
  for (const par of P.lista) {
    const { gz, json } = F.rutasAnio(par, ANIO)
    const i = await F.infoVigente(sb, par, ANIO, LIM)
    if (i.estado === 'error') { console.log(`  ${par} ✗ no se pudo consultar (${i.motivo})`); mal.push(par); continue }
    if (i.estado === 'no-existe') { console.log(`  ${par} ✗ no hay ${json} ni ${gz}: nada que migrar`); mal.push(par); continue }
    if (i.ruta === gz) { console.log(`  ${par} ✓ ya esta en ${gz} (${i.size} bytes): nada que hacer`); continue }
    if (!SUBIR) { console.log(`  ${par} [SECO] migraria ${json} (${i.size} bytes) a ${gz}`); continue }
    const x = await F.leerConFirma(sb, par, ANIO, LIM)
    T.n++; T.bytes += x.bytes || 0
    if (x.estado !== 'ok' || x.ruta !== json) { console.log(`  ${par} ✗ no se pudo leer ${json}: ${x.motivo ?? x.estado}`); mal.push(par); continue }
    const r = await F.publicarAnio(sb, { pair: par, year: ANIO, componer: g => g, dueno: 'arranque-gzip', previo: x, limites: LIM })
    T.n += r.descargado?.n || 0; T.bytes += r.descargado?.bytes || 0
    const avisos = (r.avisos || []).length ? ` (aviso: ${r.avisos.join(' · ')})` : ''
    if (r.estado !== 'publicado') { console.log(`  ${par} ✗ ${r.estado}: ${(r.problemas || []).join(' · ')}${avisos}`); mal.push(par); continue }
    // lo publicado tiene que ser EXACTAMENTE lo del .json (salvo que el .json cambiase y se releyera)
    const igual = F.huella(r.final) === F.huella(x.velas)
    if (!igual && !r.descargado?.n) { console.log(`  ${par} ✗ lo publicado no es lo leido del .json (${r.velas} velas frente a ${x.velas.length})${avisos}`); mal.push(par); continue }
    console.log(`  ${par} ✓ ${gz}: ${r.velas} velas, ${r.bytes} bytes (el .json, ${x.bytes} bytes), verificado${igual ? '' : ' (el .json cambio durante el arranque: se publico lo releido)'}${avisos}`)
  }
  console.log(`\n  Transferencia (objetos anuales leidos del bucket): ${T.n} descarga(s), ${T.bytes} bytes`)
  console.log(`  Tiempos de Storage (ms): ${F.resumenTiempos(LIM.tiempos)}`)
  if (mal.length) { console.log(`\n=== ⚠️ ATENCION: ${mal.length} par(es) sin migrar: ${mal.join(', ')} (codigo 1) ===`); process.exitCode = 1 }
  else console.log(`\n=== ✓ TODO OK — ${SUBIR ? 'migrados o ya en .json.gz' : 'seco: nada tocado'} ===`)
}

main().catch(e => { console.error('Fatal:', e?.name ?? 'Error'); process.exit(4) })
