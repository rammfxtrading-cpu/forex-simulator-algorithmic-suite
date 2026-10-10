// ARRANQUE DEL FORMATO UNICO (CTO 9-oct-2026, mercado diario, punto 5): los
// nueve {PAR}/M1/2026.json pasan a {PAR}/M1/2026.json.gz, UNA SOLA VEZ, desde
// el Mac, cuando el CTO autorice el despliegue (ver revisiones/
// 2026-10-09-mercado-diario-despliegue.md: lectores en main y comprobados
// ANTES; el cron, despues). Asi la primera ejecucion diaria solo baja los .gz
// (≈ 38 MB) y no gasta el tope en los .json (≈ 264 MB, autorizados aqui).
//
//   node scripts/arranque-gzip.js                    SECO: solo info() (sin descargar)
//   node scripts/arranque-gzip.js --subir --copia DIR   publica de verdad y borra cada .json
//   ... --pares EURUSD,GBPUSD                        solo esos pares
//   --copia DIR: la carpeta de UNA ejecucion de scripts/copia-mercado.js con
//   ANIO=2026 ({PAR}_2026.json + .sha256). Obligatoria con --subir.
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
// BORRADO PAR A PAR (CTO 10-oct: el Storage del plan esta al limite, 0,963 de
// 1 GB, y los nueve .gz encima de los .json lo pasarian). Por par, en serie,
// nunca mas de uno en vuelo:
//   1. la COPIA LOCAL de ese par (--copia) tiene que existir y coincidir: el
//      fichero, su .sha256 y el sha256 de las velas leidas del .json. Si no,
//      el par no se toca (ni se sube) y el arranque PARA;
//   2. se publica (o se certifica) el .json.gz como arriba;
//   3. se VERIFICA bajandolo: sha256 del cuerpo = el de sus metadatos y
//      descomprimido = exactamente las velas del .json;
//   4. el .json sigue siendo el que se leyo (misma firma en info()) y se borra;
//   5. info() del .json tiene que decir que ya no existe.
// Cualquier fallo en 1-5: el arranque PARA ahi, sin borrar el .json de ese par.
// Codigo: 0 todos migrados (o certificados) y su .json borrado · 1 algo fallo
// (para ahi) · 5 un cerrojo puesto (para ahi) · 4 uso (tambien --subir sin --copia).
const { createClient } = require('@supabase/supabase-js')
const fs = require('fs'), path = require('path')

const ANIO = 2026
const TODOS = ['EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'AUDUSD', 'USDCAD', 'NZDUSD', 'AUDCAD', 'GBPJPY']
const SUBIR = process.argv.includes('--subir')
const crypto = require('crypto')

function getEnv() {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) return { url: process.env.NEXT_PUBLIC_SUPABASE_URL.trim(), key: process.env.SUPABASE_SERVICE_ROLE_KEY.trim() }
  const env = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8')
    .split('\n').filter(l => l && !l.startsWith('#'))
    .reduce((a, l) => { const eq = l.indexOf('='); if (eq > 0) a[l.slice(0, eq).trim()] = l.slice(eq + 1).trim().replace(/^["']|["']$/g, ''); return a }, {})
  return { url: env.NEXT_PUBLIC_SUPABASE_URL, key: env.SUPABASE_SERVICE_ROLE_KEY }
}
function copiaPedida(argv) {
  const i = argv.findIndex(a => a === '--copia' || a.startsWith('--copia='))
  if (i < 0) return null
  return argv[i].includes('=') ? argv[i].split('=').slice(1).join('=') : (argv[i + 1] ?? '')
}
// la copia local de un par: → { ok: true, sha, fichero } | { ok: false, motivo }
function miraCopia(dir, par, huellaLeida = null) {
  const fichero = path.join(dir, `${par}_${ANIO}.json`)
  if (!fs.existsSync(fichero) || !fs.existsSync(fichero + '.sha256')) return { ok: false, motivo: `no hay copia local de ${par} (${fichero} y su .sha256)` }
  const anotado = fs.readFileSync(fichero + '.sha256', 'utf8').trim().split(/\s+/)[0]
  const sha = crypto.createHash('sha256').update(fs.readFileSync(fichero)).digest('hex')
  if (sha !== anotado) return { ok: false, motivo: `la copia local de ${par} no coincide con su .sha256 (${sha.slice(0, 12)}… frente a ${anotado.slice(0, 12)}…)` }
  if (huellaLeida && huellaLeida !== sha) return { ok: false, motivo: `la copia local de ${par} no es lo que hay ahora en el .json (copia ${sha.slice(0, 12)}…, bucket ${huellaLeida.slice(0, 12)}…)` }
  return { ok: true, sha, fichero }
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
  const COPIA = copiaPedida(process.argv)
  if (SUBIR && !COPIA) {
    console.log('--subir exige --copia DIR (la copia local de los .json de 2026, de scripts/copia-mercado.js): sin copia no se borra ningun .json')
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
  // info() de UNA ruta (no lo vigente): → { estado: 'ok', firma, size, metadata } | { estado: 'no-existe' } | { estado: 'error', motivo }
  const infoRuta = async ruta => {
    let r
    try { r = await sb.storage.from(F.BUCKET).info(ruta) } catch (e) { return { estado: 'error', motivo: e?.name ?? 'Error' } }
    if (r.error) return F.noExiste(r.error) ? { estado: 'no-existe' } : { estado: 'error', motivo: r.error.message ?? String(r.error.statusCode ?? 'error') }
    const d = r.data ?? {}
    return { estado: 'ok', firma: d.version || d.etag ? `${d.version ?? ''}|${d.etag ?? ''}|${d.size ?? ''}` : null, size: d.size ?? null, metadata: d.metadata ?? null }
  }
  // pasos 3-5: verificar el .gz bajandolo, y borrar el .json si sigue siendo el leido.
  // MA-GZ-04 (Astra): TRES estados, porque un DELETE remoto no se puede deshacer ni su respuesta perdida se puede leer:
  //   · rechazado  → no se llego a enviar el DELETE: el .json sigue (lo que se leyo);
  //   · confirmado → DELETE con respuesta correcta y una info() posterior que dice que ya no existe;
  //   · incierto   → DELETE enviado y su respuesta perdida o con error, o la comprobacion posterior fallida o
  //                  contradictoria: NO se sabe si el .json existe. Se para; la reconciliacion es releer.
  // → { estado, motivo }
  const verificaYBorra = async (par, gz, json, velas, firmaJson) => {
    const rechazado = motivo => ({ estado: 'rechazado', motivo })
    const ig = await infoRuta(gz)
    if (ig.estado !== 'ok') return rechazado(`no se pudo consultar ${gz} para verificarlo (${ig.motivo ?? ig.estado})`)
    if (!ig.metadata?.sha256) return rechazado(`${gz} no trae sha256 en sus metadatos: no se puede verificar`)
    const g = await F.leerRuta(sb, gz, LIM, { sha256: ig.metadata.sha256 })
    T.n++; T.bytes += g.bytes || 0
    if (g.estado !== 'ok') return rechazado(`la verificacion de ${gz} bajandolo fallo: ${g.motivo ?? g.estado}`)
    if (F.huella(g.velas) !== F.huella(velas)) return rechazado(`${gz} bajado no son las velas del .json (${g.velas.length} frente a ${velas.length})`)
    if (!firmaJson) return rechazado(`${json} sin firma (version/etag) en info(): no se puede comprobar que sigue siendo el leido`)
    const ij = await infoRuta(json)
    if (ij.estado !== 'ok') return rechazado(`no se pudo consultar ${json} antes de borrarlo (${ij.motivo ?? ij.estado})`)
    if (ij.firma !== firmaJson) return rechazado(`${json} cambio desde que se leyo`)
    // desde aqui el DELETE puede haberse aplicado: cualquier duda es INCIERTO
    const incierto = motivo => ({ estado: 'incierto', motivo: `${motivo}: el resultado del DELETE de ${json} es INCIERTO (no se sabe si existe). Reconciliar releyendo: info() o el listado del bucket` })
    let rm
    try { rm = await sb.storage.from(F.BUCKET).remove([json]) } catch (e) { return incierto(`el DELETE no devolvio respuesta (${e?.name ?? 'Error'})`) }
    if (rm.error) return incierto(`el DELETE respondio error (${rm.error.message ?? rm.error.statusCode})`)
    const tras = await infoRuta(json)
    if (tras.estado === 'no-existe') return { estado: 'confirmado', motivo: null }
    return incierto(tras.estado === 'ok' ? 'tras un DELETE correcto, info() todavia da el objeto' : `la comprobacion posterior fallo (${tras.motivo ?? tras.estado})`)
  }
  const inciertos = []
  // el resultado de verificaYBorra, dicho tal cual; → true si hay que parar
  const informaBorrado = (par, json, b) => {
    if (b.estado === 'confirmado') return false
    if (b.estado === 'incierto') { console.log(`  ${par} ⚠️ ${b.motivo}. El arranque PARA`); inciertos.push(par) }
    else console.log(`  ${par} ✗ ${b.motivo}. ${json} no se ha intentado borrar. El arranque PARA`)
    mal.push(par)
    return true
  }
  console.log(`\n=== ARRANQUE .json → .json.gz ${ANIO} ${SUBIR ? '⚠️ REAL' : '🔍 SECO'} — ${new Date().toISOString()} — ${P.lista.join(', ')}${COPIA ? ` — copia ${COPIA}` : ''} ===\n`)
  for (const par of P.lista) {
    const { gz, json } = F.rutasAnio(par, ANIO)
    if (await miraCerrojo(par, 'antes de empezar')) break
    const i = await F.infoVigente(sb, par, ANIO, LIM)
    // MA-GZ-02 (Astra): en real, un estado inicial fallido PARA (error o ningun objeto); en seco se sigue mirando
    if (i.estado === 'error') { console.log(`  ${par} ✗ no se pudo consultar (${i.motivo})${SUBIR ? '. El arranque PARA' : ''}`); mal.push(par); if (SUBIR) break; continue }
    if (i.estado === 'no-existe') { console.log(`  ${par} ✗ no hay ${json} ni ${gz}: nada que migrar${SUBIR ? '. El arranque PARA' : ''}`); mal.push(par); if (SUBIR) break; continue }
    if (i.ruta === gz) {
      if (!SUBIR) { const cp = COPIA ? miraCopia(COPIA, par) : null; console.log(`  ${par} [SECO] ya hay ${gz} (${i.size} bytes): con --subir se certificaria (sha256 de sus metadatos, contra el .json si lo hay y contra la copia local) y, si hay .json, se borraria${cp ? ` · copia: ${cp.ok ? 'ok' : cp.motivo}` : ''}`); continue }
      // MA-GZ-03 (Astra): el sha256 del .gz se certifica SIEMPRE, haya .json o no; sin el, el par queda pendiente
      const ig = await infoRuta(gz)
      if (ig.estado !== 'ok') { console.log(`  ${par} ✗ no se pudo consultar ${gz} (${ig.motivo ?? ig.estado}): pendiente de reconciliar. El arranque PARA`); mal.push(par); break }
      if (!ig.metadata?.sha256) { console.log(`  ${par} ✗ ${gz} sin sha256 en sus metadatos: no se puede certificar su identidad: pendiente de reconciliar. El arranque PARA`); mal.push(par); break }
      const ij = await infoRuta(json)
      const g = await F.leerRuta(sb, gz, LIM, { sha256: ig.metadata.sha256 }), j = await F.leerRuta(sb, json, LIM)
      T.n += 2; T.bytes += (g.bytes || 0) + (j.bytes || 0)
      if (g.estado !== 'ok') { console.log(`  ${par} ✗ ${gz} no se puede certificar (${g.motivo ?? g.estado}): pendiente de reconciliar. El arranque PARA`); mal.push(par); break }
      if (j.estado === 'error') { console.log(`  ${par} ✗ no se pudo leer ${json} para comparar: ${j.motivo}. El arranque PARA`); mal.push(par); break }
      const v = C.validaParaPublicar(g.velas, j.estado === 'ok' ? j.velas : null, { anio: ANIO })
      if (!v.ok) { console.log(`  ${par} ✗ ${gz} no pasa la validacion frente a ${json}: ${v.problemas.join(' · ')}. El arranque PARA`); mal.push(par); break }
      if (j.estado !== 'ok') {
        // par YA CONVERTIDO (solo .gz, p. ej. tras un arranque interrumpido): su copia local tiene que ser lo que hay en el .gz
        const cpg = miraCopia(COPIA, par, F.huella(g.velas))
        if (!cpg.ok) { console.log(`  ${par} ✗ ${gz} con su sha256 correcto, pero ${cpg.motivo}: pendiente de reconciliar. El arranque PARA`); mal.push(par); break }
        console.log(`  ${par} ✓ ${gz} ya convertido y certificado: sha256 ${ig.metadata.sha256}, ${g.velas.length} velas = copia local ${cpg.fichero} (sha256 ${cpg.sha})`)
        continue
      }
      console.log(`  ${par} ✓ ${gz} certificado: sha256 ${ig.metadata.sha256}, ${g.velas.length} velas, validado y sin ningun dia con menos velas que ${json} (${j.velas.length} velas)${v.avisos.length ? ` (aviso: ${v.avisos.join(' · ')})` : ''}`)
      // el .json de un par certificado tambien se borra, con su copia y con el .gz ya verificado
      const cp = miraCopia(COPIA, par, F.huella(j.velas))
      if (!cp.ok) { console.log(`  ${par} ✗ ${cp.motivo}: no se borra ${json}. El arranque PARA`); mal.push(par); break }
      if (informaBorrado(par, json, await verificaYBorra(par, gz, json, j.velas, ij.estado === 'ok' ? ij.firma : null))) break
      console.log(`  ${par} ✓ ${json} borrado y confirmado (copia local ${cp.fichero}, sha256 ${cp.sha})`)
      continue
    }
    if (!SUBIR) { const cp = COPIA ? miraCopia(COPIA, par) : null; console.log(`  ${par} [SECO] migraria ${json} (${i.size} bytes) a ${gz} y despues borraria el .json${cp ? ` · copia: ${cp.ok ? 'ok' : cp.motivo}` : ''}`); continue }
    const x = await F.leerConFirma(sb, par, ANIO, LIM)
    T.n++; T.bytes += x.bytes || 0
    if (x.estado !== 'ok' || x.ruta !== json) { console.log(`  ${par} ✗ no se pudo leer ${json}: ${x.motivo ?? x.estado}`); mal.push(par); break }
    // 1 · la copia local, ANTES de subir nada: si falta o no es lo leido, el par no se toca
    const cp = miraCopia(COPIA, par, F.huella(x.velas))
    if (!cp.ok) { console.log(`  ${par} ✗ ${cp.motivo}: no se sube ni se borra nada de ${par}. El arranque PARA`); mal.push(par); break }
    const r = await F.publicarAnio(sb, { pair: par, year: ANIO, componer: g => g, dueno: 'arranque-gzip', previo: x, limites: LIM })
    T.n += r.descargado?.n || 0; T.bytes += r.descargado?.bytes || 0
    const avisos = (r.avisos || []).length ? ` (aviso: ${r.avisos.join(' · ')})` : ''
    if (r.estado !== 'publicado') { console.log(`  ${par} ✗ ${r.estado}: ${(r.problemas || []).join(' · ')}${avisos}. ${json} no se ha intentado borrar. El arranque PARA`); mal.push(par); break }
    // lo publicado tiene que ser EXACTAMENTE lo del .json: si el .json cambio durante el arranque, no se borra nada
    if (F.huella(r.final) !== F.huella(x.velas)) { console.log(`  ${par} ✗ lo publicado no es lo leido del .json (${r.velas} velas frente a ${x.velas.length}): el .json cambio durante el arranque. ${json} no se ha intentado borrar. El arranque PARA${avisos}`); mal.push(par); break }
    console.log(`  ${par} ✓ ${gz}: ${r.velas} velas, ${r.bytes} bytes (el .json, ${x.bytes} bytes), publicado${avisos}`)
    if (await miraCerrojo(par, 'despues de publicar')) break
    if (informaBorrado(par, json, await verificaYBorra(par, gz, json, x.velas, x.firma))) break
    console.log(`  ${par} ✓ ${gz} verificado bajandolo (sha256 y velas) · ${json} borrado y confirmado (copia local ${cp.fichero}, sha256 ${cp.sha})`)
  }
  console.log(`\n  Transferencia (objetos anuales leidos del bucket): ${T.n} descarga(s), ${T.bytes} bytes`)
  console.log(`  Tiempos de Storage (ms): ${F.resumenTiempos(LIM.tiempos)}`)
  if (cerrojo) { console.log(`\n=== ⚠️ ATENCION: arranque parado por un cerrojo: ${cerrojo}${mal.length ? `; ademas, fallo en ${mal.join(', ')}` : ''} (codigo 5) ===`); process.exitCode = 5 }
  else if (inciertos.length) { console.log(`\n=== ⚠️ ATENCION: arranque PARADO en ${mal.join(', ')}: el resultado del DELETE de su .json es INCIERTO; reconciliar releyendo antes de nada; los pares siguientes no se han tocado (codigo 1) ===`); process.exitCode = 1 }
  else if (mal.length) { console.log(`\n=== ⚠️ ATENCION: arranque PARADO en ${mal.join(', ')}: su .json no se ha intentado borrar; los pares siguientes no se han tocado (codigo 1) ===`); process.exitCode = 1 }
  else console.log(`\n=== ✓ TODO OK — ${SUBIR ? 'migrados (o certificados), verificados y sus .json borrados' : 'seco: nada tocado'} ===`)
}

main().catch(e => { console.error('Fatal:', e?.name ?? 'Error'); process.exit(4) })
