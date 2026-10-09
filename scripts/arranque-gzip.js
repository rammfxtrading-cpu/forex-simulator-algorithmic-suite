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
// Por par, primero el CERROJO (Astra MD-04): si el par tiene uno puesto (de
// otro proceso, de un arranque muerto o de una subida incierta), el arranque
// PARA con codigo 5 y dice de quien es y desde cuando. Nunca lo libera: eso lo
// hace una persona (scripts/liberar-cerrojo.js) despues de comprobar que no
// queda ningun proceso ni subida en curso.
// Despues:
//   · si ya hay .json.gz, se CERTIFICA (MD-04: existir no basta): se baja, se
//     descomprime, se valida (forma, OHLC, unicidad, cobertura) y se comprueba
//     que no tiene menos velas por dia que el .json (que tambien se baja). No
//     se toca nada; si falla, ✗;
//   · si no, baja el .json una vez y publica el .json.gz con el publicador
//     comun (publicarAnio: cerrojo, relectura solo si cambio, validacion,
//     sha256 del cuerpo en los metadatos y verificacion por info()), comprueba
//     que lo publicado son exactamente las velas del .json y que el cerrojo
//     quedo suelto.
// NO borra nada (el .json se borrara en otro paso).
// Codigo: 0 todos migrados o certificados · 1 algun par sin migrar o sin
// certificar · 5 un cerrojo puesto (para ahi) · 4 uso.
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
  const C = await import('../lib/mercado/calidad.mjs')
  const L = await import('../lib/mercado/limites.mjs')
  const { url, key } = getEnv()
  const sb = createClient(url, key, { global: { fetch: L.fetchConLimite((...a) => globalThis.fetch(...a), F.LIMITES.grandeMs) } })
  const LIM = { ...F.LIMITES, tiempos: [] }
  const T = { n: 0, bytes: 0 }
  const mal = []
  let cerrojo = null
  // → true si hay que parar (cerrojo puesto o no comprobable)
  const miraCerrojo = async (par, cuando) => {
    const c = await F.leeCerrojo(sb, par, ANIO, LIM)
    if (c.estado === 'no-existe') return false
    const clave = `${par}_${ANIO}`
    cerrojo = c.estado === 'ok'
      ? `${par}: CERROJO _cerrojos/${clave}.json puesto ${cuando}: de ${c.ficha?.dueno ?? '(sin dueño)'} desde ${c.ficha?.desde ?? '(sin fecha)'}`
      : `${par}: no se pudo comprobar el cerrojo _cerrojos/${clave}.json ${cuando} (${c.motivo})`
    console.log(`  ${cerrojo}. El arranque PARA. No se libera solo: una persona comprueba que no queda ningun proceso ni subida en curso y, entonces, node scripts/liberar-cerrojo.js ${clave}`)
    return true
  }
  console.log(`\n=== ARRANQUE .json → .json.gz ${ANIO} ${SUBIR ? '⚠️ REAL' : '🔍 SECO'} — ${new Date().toISOString()} — ${P.lista.join(', ')} ===\n`)
  for (const par of P.lista) {
    const { gz, json } = F.rutasAnio(par, ANIO)
    if (await miraCerrojo(par, 'antes de empezar')) break
    const i = await F.infoVigente(sb, par, ANIO, LIM)
    if (i.estado === 'error') { console.log(`  ${par} ✗ no se pudo consultar (${i.motivo})`); mal.push(par); continue }
    if (i.estado === 'no-existe') { console.log(`  ${par} ✗ no hay ${json} ni ${gz}: nada que migrar`); mal.push(par); continue }
    if (i.ruta === gz) {
      if (!SUBIR) { console.log(`  ${par} [SECO] ya hay ${gz} (${i.size} bytes): con --subir se certificaria contra el .json (se bajan los dos)`); continue }
      const g = await F.leerRuta(sb, gz, LIM), j = await F.leerRuta(sb, json, LIM)
      T.n += 2; T.bytes += (g.bytes || 0) + (j.bytes || 0)
      if (g.estado !== 'ok') { console.log(`  ${par} ✗ ${gz} existe pero no se puede leer: ${g.motivo ?? g.estado}`); mal.push(par); continue }
      if (j.estado === 'error') { console.log(`  ${par} ✗ no se pudo leer ${json} para comparar: ${j.motivo}`); mal.push(par); continue }
      const v = C.validaParaPublicar(g.velas, j.estado === 'ok' ? j.velas : null, { anio: ANIO })
      if (!v.ok) { console.log(`  ${par} ✗ ${gz} no pasa la validacion frente a ${json}: ${v.problemas.join(' · ')}`); mal.push(par); continue }
      console.log(`  ${par} ✓ ${gz} certificado: ${g.velas.length} velas, validado y sin ningun dia con menos velas que ${json} (${j.estado === 'ok' ? j.velas.length : 0} velas)${v.avisos.length ? ` (aviso: ${v.avisos.join(' · ')})` : ''}`)
      continue
    }
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
    if (await miraCerrojo(par, 'despues de publicar')) break
  }
  console.log(`\n  Transferencia (objetos anuales leidos del bucket): ${T.n} descarga(s), ${T.bytes} bytes`)
  console.log(`  Tiempos de Storage (ms): ${F.resumenTiempos(LIM.tiempos)}`)
  if (cerrojo) { console.log(`\n=== ⚠️ ATENCION: arranque parado por un cerrojo: ${cerrojo}${mal.length ? `; ademas, ${mal.length} par(es) sin migrar o sin certificar: ${mal.join(', ')}` : ''} (codigo 5) ===`); process.exitCode = 5 }
  else if (mal.length) { console.log(`\n=== ⚠️ ATENCION: ${mal.length} par(es) sin migrar o sin certificar: ${mal.join(', ')} (codigo 1) ===`); process.exitCode = 1 }
  else console.log(`\n=== ✓ TODO OK — ${SUBIR ? 'migrados o ya en .json.gz' : 'seco: nada tocado'} ===`)
}

main().catch(e => { console.error('Fatal:', e?.name ?? 'Error'); process.exit(4) })
