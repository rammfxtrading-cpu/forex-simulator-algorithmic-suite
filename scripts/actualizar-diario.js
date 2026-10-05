// ACTUALIZACIÓN INCREMENTAL DIARIA. Para cada par: lee el año de Supabase ({año}.json.gz
// o, si no hay, {año}.json; se publica SIEMPRE .json.gz por la funcion comun
// publicarAnio de lib/mercado/ficheros.mjs y no se borra el .json),
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
      // S05 (auditoria 4-oct-2026): ni un caracter de la clave en el log; solo
      // cuantas partes separadas por punto tiene (un JWT tiene 3)
      console.log('[DIAG] key  -> partes separadas por punto:', k.split('.').length)
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
    } catch(e) { if (i<5) await sleep(10000); else throw e }
  }
}

// ── Reconciliacion (auditoria D05, 4-oct-2026) ─────────────────────────────
// Antes solo se bajaba desde el dia SIGUIENTE a la ultima vela: un ultimo dia a
// medias o un dia interior vacio no se volvian a pedir nunca, y el 1 de enero no
// habia fichero del año nuevo y el par se quedaba en error. Ahora, por par:
//   · se piden la COLA (del ultimo dia guardado a ayer, todos los dias, como
//     antes: el domingo abre a las 21:00) y los dias LABORABLES CORTOS del
//     interior (umbral y festivos de lib/mercado/calidad.js, copiados aqui
//     porque este script es CommonJS en Node 20);
//   · un dia vuelto a bajar solo sustituye al guardado si trae MAS velas;
//   · si el fichero del año no existe (404 real), se arranca el año desde el
//     1-ene; en enero se repasa tambien el año anterior (su 31-dic);
//   · como mucho MAX_DIAS_POR_PASADA dias por par y año en cada pasada, los mas
//     recientes primero: un hueco que el proveedor nunca rellena no dispara el
//     coste (se reintenta en la pasada siguiente).
//
// Bloque D, punto 1 (CTO, 5-oct-2026): este script y restore-2026.js son los
// UNICOS escritores del bucket, y solo publican por publicarAnio (cerrojo por
// par y año; RELEE justo antes de subir y compone sobre lo releido; valida
// forma, OHLC, unicidad y cobertura con lib/mercado/calidad.mjs; ningun dia
// con menos velas que lo releido; VERIFICA despues). Un dia bajado solo entra
// en la cola publicada si los anteriores de la cola estan completos: el
// primero a medias es el ultimo que se publica (tramo abierto) y lo demas
// espera a la pasada siguiente. Umbrales y festivos: los de calidad.mjs.
// Los modulos comunes son ESM (.mjs): se cargan con import() en main().
let F, C   // lib/mercado/ficheros.mjs, lib/mercado/calidad.mjs
const MAX_DIAS_POR_PASADA = 40
const DIA_MS = 86400000
const ymd = ms => new Date(ms).toISOString().slice(0, 10)

// → { estado: 'ok', velas, ruta } | { estado: 'no-existe' } | { estado: 'error', ruta, motivo }
// «No existe» = el 404 de storage-js en los dos formatos; cualquier otro error, no
// se pudo leer (lib/mercado/ficheros.mjs).
const leerAnio = (pair, year) => F.leerVigente(sb, pair, year)

// Dias a pedir de `year` hasta `ayerMs` (incluido): la cola y los laborables cortos.
function diasPendientes(velas, year, ayerMs) {
  const porDia = {}
  for (const v of velas) { const d = ymd(v.time * 1000); porDia[d] = (porDia[d] || 0) + 1 }
  const inicio = Date.UTC(year, 0, 1)
  const fin = Math.min(Date.UTC(year, 11, 31), ayerMs)
  const ultDiaMs = velas.length ? Date.UTC(...ymd(velas[velas.length - 1].time * 1000).split('-').map((x, i) => i === 1 ? x - 1 : +x)) : inicio - DIA_MS
  const cola = [], cortos = []
  for (let t = inicio; t <= fin; t += DIA_MS) {
    const d = ymd(t)
    if (t > ultDiaMs) { cola.push(d); continue }          // cola: todos los dias
    const umbral = C.UMBRAL_LABORABLE[new Date(t).getUTCDay()]
    if (umbral && !C.FESTIVOS_MMDD.has(d.slice(5)) && (porDia[d] || 0) < umbral) cortos.push(d)
  }
  // el ultimo dia guardado, si esta a medias, entra en los cortos (es laborable) o en la cola
  return [...cola.reverse(), ...cortos.reverse()].slice(0, MAX_DIAS_POR_PASADA)
}

// ¿Dia completo? (laborable con el umbral; fin de semana y festivos, siempre)
const completo = (d, n) => { const u = C.UMBRAL_LABORABLE[new Date(d + 'T00:00:00Z').getUTCDay()]; return !u || C.FESTIVOS_MMDD.has(d.slice(5)) || n >= u }

// Compone lo publicado sobre `guardadas` (lo RELEIDO justo antes de subir):
//   · un dia solo se sustituye si el bajado trae MAS velas;
//   · la cola (dias posteriores a la ultima vela guardada) entra en orden y se
//     corta tras el primer dia laborable a medias, que es el ultimo publicado.
// → velas | null (nada mejora lo guardado)
function componer(guardadas, bajados) {
  const porDia = {}
  for (const v of guardadas || []) (porDia[ymd(v.time * 1000)] ??= []).push(v)
  const ultima = guardadas?.length ? ymd(guardadas[guardadas.length - 1].time * 1000) : ''
  let cambia = false, cortada = false
  for (const d of Object.keys(bajados).sort()) {
    const dv = bajados[d]
    if (d > ultima) {                       // cola
      if (cortada) continue
      if (dv.length > (porDia[d] || []).length) { porDia[d] = dv; cambia = true }
      if (!completo(d, (porDia[d] || []).length)) cortada = true
    } else if (dv.length > (porDia[d] || []).length) { porDia[d] = dv; cambia = true }
  }
  return cambia ? Object.keys(porDia).sort().flatMap(d => porDia[d]).sort((a, b) => a.time - b.time) : null
}

// Baja los dias pendientes y los publica por la funcion comun.
async function reconciliaAnio(pair, year, ayerMs) {
  const keyFile = F.rutasAnio(pair, year).gz
  const leido = await leerAnio(pair, year)
  if (leido.estado === 'error') return { keyFile, estado: `✗ no se pudo leer ${leido.ruta}: ${leido.motivo}` }
  const nuevoAnio = leido.estado === 'no-existe'
  const velas = nuevoAnio ? [] : leido.velas
  const pendientes = diasPendientes(velas, year, ayerMs)
  if (!pendientes.length) return { keyFile, estado: `✓ al dia (${keyFile})` }

  const bajados = {}
  for (const d of pendientes) {
    const [y, m, dd] = d.split('-').map(Number)
    bajados[d] = (await bajarDia(pair, y, m - 1, dd)) || []
    await sleep(400)
  }
  const previsto = componer(nuevoAnio ? null : velas, bajados)
  if (!previsto) return { keyFile, estado: `✓ ${keyFile}: ${pendientes.length} dia(s) revisado(s), nada mejor que lo guardado` }
  const resumen = n => `${nuevoAnio ? 'año NUEVO, ' : ''}${n} velas (antes ${velas.length}); ultima ${ymd(previsto[previsto.length - 1].time * 1000)}`
  if (!SUBIR) {
    const v = C.validaParaPublicar(previsto, nuevoAnio ? null : velas, { anio: year })
    return { keyFile, estado: `[SECO] ${keyFile}: ${resumen(previsto.length)}${v.ok ? '' : ` — NO se publicaria: ${v.problemas.join(' · ')}`}` }
  }
  const r = await F.publicarAnio(sb, { pair, year, componer: g => componer(g, bajados), dueno: 'actualizar-diario' })
  const avisos = (r.avisos || []).length ? ` (aviso: ${r.avisos.join(' · ')})` : ''
  if (r.estado === 'publicado') return { keyFile, estado: `✓ SUBIDO ${keyFile}: ${resumen(r.velas)}, verificado${avisos}` }
  if (r.estado === 'sin-cambios') return { keyFile, estado: `✓ ${keyFile}: lo releido ya tenia lo bajado, nada que subir` }
  return { keyFile, publicacion: true, estado: `✗ PUBLICACION ${r.estado} ${keyFile}: ${r.problemas.join(' · ')}${avisos}` }
}

async function procesarPar(pair) {
  const hoy = new Date()
  const ayerMs = Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate() - 1)
  const year = hoy.getUTCFullYear()
  const anios = hoy.getUTCMonth() === 0 ? [year - 1, year] : [year]   // en enero, tambien el 31-dic anterior
  const partes = []
  for (const y of anios) {
    if (Date.UTC(y, 0, 1) > ayerMs) continue           // el 1-ene aun no ha cerrado: nada que pedir de ese año
    partes.push((await reconciliaAnio(pair, y, ayerMs)).estado)
  }
  const fallo = partes.find(p => p.startsWith('✗'))
  return { pair, estado: fallo ? fallo + (partes.length > 1 ? ` | ${partes.filter(p => p !== fallo).join(' | ')}` : '') : partes.join(' | ') || '✓ nada que hacer hoy' }
}

async function main() {
  F = await import('../lib/mercado/ficheros.mjs')
  C = await import('../lib/mercado/calidad.mjs')
  console.log(`\n=== ACTUALIZACIÓN DIARIA ${SUBIR?'⚠️ REAL':'🔍 SECO'} — ${new Date().toISOString()} ===\n`)
  const resultados = []
  let primero = true
  for (const pair of PAIRS) {
    if (!primero) await sleep(8000)  // pausa anti-rafaga entre pares
    primero = false
    process.stdout.write(`  ${pair.toUpperCase()}... `)
    try { const r = await procesarPar(pair); console.log(r.estado); resultados.push(r) }
    catch(e) { console.log(`✗ ERROR: ${e.message}`); resultados.push({pair, estado:`✗ ${e.message}`}) }
  }
  const fallos = resultados.filter(r=>r.estado.startsWith('✗'))
  if (fallos.length) {
    console.log(`\n  (${fallos.length} par(es) con fallo de descarga: ${fallos.map(f=>f.pair).join(', ')})`)
  }

  // ── VERDICTO por ESTADO REAL de los datos, no por fallos de descarga ──────
  // Dukascopy falla de forma intermitente: un fallo de descarga NO es un problema
  // si ese par ya tenia los datos al dia. Lo que importa es cuantos DIAS DE MERCADO
  // lleva cada par sin actualizar. Solo alertamos si algun par se queda descolgado.
  const MAX_DIAS_MERCADO_RETRASO = 2

  function diasMercadoEntre(desde, hasta) {   // cuenta lun-vie entre dos fechas
    let n = 0
    const d = new Date(Date.UTC(desde.getUTCFullYear(), desde.getUTCMonth(), desde.getUTCDate()))
    d.setUTCDate(d.getUTCDate() + 1)
    while (d <= hasta) {
      const dow = d.getUTCDay()
      if (dow !== 0 && dow !== 6) n++
      d.setUTCDate(d.getUTCDate() + 1)
    }
    return n
  }

  console.log(`\n=== ESTADO DE LOS DATOS ===`)
  const year = new Date().getUTCFullYear()
  const hoy = new Date()
  // "ayer" es el ultimo dia que deberia estar disponible
  const ayer = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate()-1))
  const descolgados = []

  for (const pair of PAIRS) {
    try {
      // el año en curso; si aun no tiene fichero (1-ene festivo sin datos), el anterior
      let leido = await leerAnio(pair, year)
      if (leido.estado === 'no-existe') leido = await leerAnio(pair, year - 1)
      if (leido.estado !== 'ok' || !leido.velas.length) { console.log(`  ${pair.toUpperCase().padEnd(8)} ✗ no legible`); descolgados.push(`${pair}: archivo no legible`); continue }
      const arr = leido.velas
      const ult = new Date(arr[arr.length-1].time*1000)
      const retraso = diasMercadoEntre(ult, ayer)
      const ok = retraso <= MAX_DIAS_MERCADO_RETRASO
      console.log(`  ${pair.toUpperCase().padEnd(8)} ${ok?'✓':'⚠️'} ultima ${ult.toISOString().slice(0,10)} (retraso: ${retraso} dia(s) de mercado)`)
      if (!ok) descolgados.push(`${pair}: ultima ${ult.toISOString().slice(0,10)}, ${retraso} dias de mercado de retraso`)
    } catch(e) { console.log(`  ${pair.toUpperCase().padEnd(8)} ✗ ${e.message}`); descolgados.push(`${pair}: ${e.message}`) }
  }

  // una publicacion rechazada, sin verificar o sin cerrojo NO es un fallo de
  // descarga puntual: siempre se avisa y el job acaba con codigo 1
  const publicaciones = resultados.filter(r => r.estado.includes('✗ PUBLICACION'))
  if (publicaciones.length) {
    console.log(`\n  ✗ ${publicaciones.length} publicacion(es) sin completar: ${publicaciones.map(r => r.pair).join(', ')}`)
    process.exitCode = 1
  }
  if (descolgados.length) {
    console.log(`\n=== ⚠️ ATENCION: ${descolgados.length} PAR(ES) DESCOLGADO(S) (>${MAX_DIAS_MERCADO_RETRASO} dias de mercado) ===`)
    descolgados.forEach(d=>console.log(`  ${d}`))
    console.log(`\n  Los fallos de descarga puntuales son normales (Dukascopy es intermitente),`)
    console.log(`  pero estos pares llevan varias pasadas sin recuperarse. Revisar.`)
    process.exitCode = 1
  } else if (publicaciones.length) {
    console.log(`\n=== ⚠️ ATENCION: ${publicaciones.length} publicacion(es) sin completar (ver ✗ PUBLICACION arriba) ===`)
  } else {
    console.log(`\n=== ✓ TODO OK — todos los pares dentro del margen (<=${MAX_DIAS_MERCADO_RETRASO} dias de mercado) ===`)
    if (fallos.length) console.log(`  (los fallos de descarga de arriba no afectan: esos pares ya estaban al dia)`)
  }

  if (!SUBIR) console.log(`\n  (SECO — no se tocó nada. Para subir: --subir)`)
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1) })
