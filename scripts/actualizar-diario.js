// ACTUALIZACIÓN INCREMENTAL DIARIA. Para cada par: lee el año de Supabase ({año}.json.gz
// o, si no hay, {año}.json; se publica SIEMPRE .json.gz por la funcion comun
// publicarAnio de lib/mercado/ficheros.mjs y no se borra el .json),
// baja DÍA A DÍA desde su última vela hasta AYER, añade sin duplicar, valida y resube.
// NUNCA borra el bucket. Pensado para correr en GitHub Actions cada noche.
// Uso:
//   node scripts/actualizar-diario.js          -> SECO (no sube, dice qué haría)
//   node scripts/actualizar-diario.js --subir   -> SUBE de verdad
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
// el cliente se crea en main(), con el fetch con plazo de lib/mercado/limites.mjs (BF-03)
let sb
const BUCKET = 'forex-data'
const PAIRS = ['audcad','audusd','eurusd','gbpjpy','gbpusd','nzdusd','usdcad','usdchf','usdjpy']

const sleep = ms => new Promise(r => setTimeout(r, ms))

// Bloque F, punto 5: presupuesto de tiempo. El workflow corta a los 30 minutos:
// el job se da 24 y cada par 4 como mucho (lo que quede del job si es menos).
// Pasado el limite, la descarga para («presupuesto») y lo que falte espera a la
// pasada siguiente; los pares que no llegan a empezar dicen «SIN TIEMPO».
const segs = (v, def) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : def }
const PRESUPUESTO_JOB_MS = segs(process.env.PRESUPUESTO_JOB_S, 24 * 60) * 1000
const PRESUPUESTO_PAR_MS = segs(process.env.PRESUPUESTO_PAR_S, 4 * 60) * 1000
// Bloque G, punto 9 (BF-03): el presupuesto es un TIEMPO MAXIMO. Las descargas
// se cancelan de verdad al llegar al limite (lib/mercado/descarga.mjs) y cada
// operacion de Storage tiene su plazo (lib/mercado/ficheros.mjs). Antes de cada
// par y antes de publicar se exige la RESERVA: el peor caso de publicar,
// verificar y soltar el cerrojo (F.tiempoMaximoPublicar, 440 s con los plazos
// por defecto; RESERVA_PUBLICAR_S la cambia). Las descargas de un par acaban
// como tarde en fin del job − reserva. Con 24 min de job y 30 de workflow
// (checkout y npm ci dentro) quedan ~6 min para el estado final.
let RESERVA_MS

// Baja UN dia por la DESCARGA PROPIA (bloque F, punto 4: lib/mercado/descarga.mjs):
// estado HTTP, bytes e intento de cada peticion en el log; esperas crecientes
// con azar y Retry-After; «sin datos» (no se reintenta) frente a «servidor» y
// «red». Lanza ErrorDescarga si no se pudo. → velas del dia ([] si no hay datos)
const dukascopy = require('dukascopy-node')
let DESC   // lib/mercado/descarga.mjs (ESM, se carga en main)
async function bajarDia(pair, y, m, d, limite = Infinity) {
  const dia = new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10)
  const r = await DESC.bajaDia({ sdk: dukascopy, fetch: (...a) => globalThis.fetch(...a), espera: sleep, log: l => console.log('    ' + l), par: pair, dia, limite })
  return r.velas
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
let F, C, E   // lib/mercado/ficheros.mjs, calidad.mjs, errores.mjs (BF-02: solo clase y codigo)
const MAX_DIAS_POR_PASADA = 40
const DIA_MS = 86400000
const ymd = ms => new Date(ms).toISOString().slice(0, 10)

// → { estado: 'ok', velas, ruta } | { estado: 'no-existe' } | { estado: 'error', ruta, motivo }
// «No existe» = el 404 de storage-js en los dos formatos; cualquier otro error, no
// se pudo leer (lib/mercado/ficheros.mjs).
const leerAnio = (pair, year) => F.leerVigente(sb, pair, year, F.LIMITES)   // con plazo (BF-03)

// Dias a pedir de `year` hasta `ayerMs` (incluido): la cola y los dias del
// interior PENDIENTES (bloque G, punto 7: laborables cortos y, desde BF-01,
// tambien domingos vacios o cortados; C.estadoDia).
function diasPendientes(velas, year, ayerMs) {
  const porDia = {}
  for (const v of velas) (porDia[ymd(v.time * 1000)] ??= []).push(v)
  const inicio = Date.UTC(year, 0, 1)
  const fin = Math.min(Date.UTC(year, 11, 31), ayerMs)
  const ultDiaMs = velas.length ? Date.UTC(...ymd(velas[velas.length - 1].time * 1000).split('-').map((x, i) => i === 1 ? x - 1 : +x)) : inicio - DIA_MS
  const cola = [], cortos = []
  for (let t = inicio; t <= fin; t += DIA_MS) {
    const d = ymd(t)
    if (t > ultDiaMs) { if (C.diaConMercado(d)) cola.push(d); continue }   // cola: los dias con mercado (F3: el sabado no)
    if (C.estadoDia(d, porDia[d]) === 'pendiente') cortos.push(d)
  }
  // el ultimo dia guardado, si esta a medias, entra en los cortos (es laborable) o en la cola.
  // Bloque F, punto 2: del MAS ANTIGUO al mas reciente, cortos del interior
  // incluidos; si hay mas de MAX_DIAS_POR_PASADA, los recientes esperan.
  return [...cortos, ...cola].sort().slice(0, MAX_DIAS_POR_PASADA)
}

// ¿Dia completo? (bloque G, punto 7: C.estadoDia; un dia con mercado y sin
// datos NUNCA lo es, tampoco el domingo)
const completo = (d, velasDia) => C.estadoDia(d, velasDia) !== 'pendiente'

// Compone lo publicado sobre `guardadas` (lo RELEIDO justo antes de subir):
//   · un dia solo se sustituye si el bajado trae MAS velas;
//   · la cola (dias posteriores a la ultima vela guardada) se recorre POR
//     CALENDARIO, en orden: un dia laborable que no se pudo bajar (bloque F,
//     punto 1) o que llega a medias corta la cola ahi (el a medias es el
//     ultimo publicado; el que falta, ni eso). Asi nunca queda un hueco
//     interior nuevo, se bajen los dias en el orden que se bajen.
// → velas | null (nada mejora lo guardado)
function componer(guardadas, bajados) {
  const porDia = {}
  for (const v of guardadas || []) (porDia[ymd(v.time * 1000)] ??= []).push(v)
  const ultima = guardadas?.length ? ymd(guardadas[guardadas.length - 1].time * 1000) : ''
  let cambia = false
  const dias = Object.keys(bajados).sort()
  for (const d of dias.filter(d => d <= ultima)) {            // interior: solo mejora
    if (bajados[d].length > (porDia[d] || []).length) { porDia[d] = bajados[d]; cambia = true }
  }
  const cola = dias.filter(d => d > ultima)
  if (cola.length) {
    const desde = ultima ? Date.parse(ultima + 'T00:00:00Z') + DIA_MS : Date.parse(cola[0].slice(0, 4) + '-01-01T00:00:00Z')
    for (let t = desde; t <= Date.parse(cola.at(-1) + 'T00:00:00Z'); t += DIA_MS) {
      const d = ymd(t)
      if (!Object.hasOwn(bajados, d)) { if (!completo(d, [])) break; continue }   // falta un dia con mercado: corta
      if (bajados[d].length > (porDia[d] || []).length) { porDia[d] = bajados[d]; cambia = true }
      if (!completo(d, porDia[d])) break                                          // vacio o a medias: ultimo (y si vacio, ni eso)
    }
  }
  return cambia ? Object.keys(porDia).sort().flatMap(d => porDia[d]).sort((a, b) => a.time - b.time) : null
}

// Baja los dias pendientes y los publica por la funcion comun.
async function reconciliaAnio(pair, year, ayerMs, limite = Infinity, finJob = Infinity) {
  const keyFile = F.rutaEscritura(pair, year)     // .json; .json.gz solo con MERCADO_GZIP=1
  const leido = await leerAnio(pair, year)
  if (leido.estado === 'error') return { keyFile, estado: `✗ no se pudo leer ${leido.ruta}: ${leido.motivo}` }
  const nuevoAnio = leido.estado === 'no-existe'
  const velas = nuevoAnio ? [] : leido.velas
  const pendientes = diasPendientes(velas, year, ayerMs)
  if (!pendientes.length) return { keyFile, estado: `✓ al dia (${keyFile})` }

  // Bloque F, punto 1: el fallo de un dia NO tira el par. Se apunta y se sigue;
  // componer corta la cola en el primer dia que falte.
  const bajados = {}, fallidos = [], vacios = []
  const ultimaGuardada = velas.length ? ymd(velas[velas.length - 1].time * 1000) : ''
  let colaCortada = false
  for (const d of pendientes) {
    const enCola = d > ultimaGuardada
    if (enCola && colaCortada) continue              // punto 2: cortada la cola, lo de despues no se publicaria
    const [y, m, dd] = d.split('-').map(Number)
    try { bajados[d] = (await bajarDia(pair, y, m - 1, dd, limite)) || [] }
    catch (e) { fallidos.push(`${d} (${E.texto(e)})`); if (enCola) colaCortada = true }
    // BF-01: un dia con mercado que llega vacio sigue PENDIENTE (y en la cola, la corta)
    if (bajados[d] && !bajados[d].length && !completo(d, [])) vacios.push(d)
    if (enCola && bajados[d] && !completo(d, bajados[d])) colaCortada = true
    await sleep(400)
  }
  const nota = (fallidos.length ? ` · sin descargar: ${fallidos.join(', ')}` : '') + (vacios.length ? ` · pendiente (sin datos del proveedor): ${vacios.join(', ')}` : '')
  const previsto = componer(nuevoAnio ? null : velas, bajados)
  if (!previsto) {
    if (fallidos.length) return { keyFile, fallidos, vacios, estado: `✗ DESCARGA ${keyFile}: nada nuevo publicable${nota}` }
    return { keyFile, vacios, estado: `${vacios.length ? '⚠️' : '✓'} ${keyFile}: ${pendientes.length} dia(s) revisado(s), nada mejor que lo guardado${nota}` }
  }
  const resumen = n => `${nuevoAnio ? 'año NUEVO, ' : ''}${n} velas (antes ${velas.length}); ultima ${ymd(previsto[previsto.length - 1].time * 1000)}`
  if (!SUBIR) {
    const v = C.validaParaPublicar(previsto, nuevoAnio ? null : velas, { anio: year })
    return { keyFile, fallidos, vacios, estado: `[SECO] ${keyFile}: ${resumen(previsto.length)}${v.ok ? '' : ` — NO se publicaria: ${v.problemas.join(' · ')}`}` }
  }
  // BF-03: no se empieza a publicar sin la reserva para terminar (ni se toma el cerrojo)
  if (Date.now() + RESERVA_MS > finJob) return { keyFile, fallidos, vacios, sinTiempo: true, estado: `✗ SIN TIEMPO PARA PUBLICAR ${keyFile}: no queda la reserva (${RESERVA_MS / 1000} s); lo bajado se descarta y se repite en la pasada siguiente${nota}` }
  const r = await F.publicarAnio(sb, { pair, year, componer: g => componer(g, bajados), dueno: 'actualizar-diario' })
  const avisos = (r.avisos || []).length ? ` (aviso: ${r.avisos.join(' · ')})` : ''
  if (r.estado === 'publicado') return { keyFile, fallidos, vacios, estado: `✓ SUBIDO ${keyFile}: ${resumen(r.velas)}, verificado${avisos}${nota}` }
  if (r.estado === 'sin-cambios') return { keyFile, fallidos, vacios, estado: `✓ ${keyFile}: lo releido ya tenia lo bajado, nada que subir${nota}` }
  return { keyFile, fallidos, vacios, publicacion: true, estado: `✗ PUBLICACION ${r.estado} ${keyFile}: ${r.problemas.join(' · ')}${avisos}${nota}` }
}

async function procesarPar(pair, finJob = Infinity) {
  if (Date.now() + RESERVA_MS >= finJob) return { pair, sinTiempo: true, estado: `✗ SIN TIEMPO: no queda presupuesto del job (${PRESUPUESTO_JOB_MS / 1000} s) con la reserva para publicar (${RESERVA_MS / 1000} s) para este par` }
  const limite = Math.min(finJob - RESERVA_MS, Date.now() + PRESUPUESTO_PAR_MS)
  const hoy = new Date()
  const ayerMs = Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate() - 1)
  const year = hoy.getUTCFullYear()
  const anios = hoy.getUTCMonth() === 0 ? [year - 1, year] : [year]   // en enero, tambien el 31-dic anterior
  const partes = [], fallidos = []
  let sinTiempoPublicar = false
  for (const y of anios) {
    if (Date.UTC(y, 0, 1) > ayerMs) continue           // el 1-ene aun no ha cerrado: nada que pedir de ese año
    const r = await reconciliaAnio(pair, y, ayerMs, limite, finJob)
    partes.push(r.estado); fallidos.push(...(r.fallidos || [])); if (r.sinTiempo) sinTiempoPublicar = true
  }
  const fallo = partes.find(p => p.startsWith('✗'))
  return { pair, fallidos, sinTiempo: sinTiempoPublicar, estado: fallo ? fallo + (partes.length > 1 ? ` | ${partes.filter(p => p !== fallo).join(' | ')}` : '') : partes.join(' | ') || '✓ nada que hacer hoy' }
}

async function main() {
  F = await import('../lib/mercado/ficheros.mjs')
  DESC = await import('../lib/mercado/descarga.mjs')
  C = await import('../lib/mercado/calidad.mjs')
  E = await import('../lib/mercado/errores.mjs')
  const L = await import('../lib/mercado/limites.mjs')
  // BF-03: cada peticion HTTP a Storage se corta a su plazo (storage-js solo
  // acepta señal en download; asi tambien upload, info y remove)
  sb = createClient(url, key, { global: { fetch: L.fetchConLimite((...a) => globalThis.fetch(...a), F.LIMITES.grandeMs) } })
  RESERVA_MS = segs(process.env.RESERVA_PUBLICAR_S, F.tiempoMaximoPublicar() / 1000) * 1000
  console.log(`\n=== ACTUALIZACIÓN DIARIA ${SUBIR?'⚠️ REAL':'🔍 SECO'} — ${new Date().toISOString()} ===\n`)
  const resultados = []
  const finJob = Date.now() + PRESUPUESTO_JOB_MS
  let primero = true
  for (const pair of PAIRS) {
    if (!primero) await sleep(8000)  // pausa anti-rafaga entre pares
    primero = false
    process.stdout.write(`  ${pair.toUpperCase()}... `)
    try { const r = await procesarPar(pair, finJob); console.log(r.estado); resultados.push(r) }
    catch(e) { console.log(`✗ ERROR: ${E.texto(e)}`); resultados.push({pair, estado:`✗ ${E.texto(e)}`}) }
  }
  // Bloque F, punto 6: veredicto SEPARADO. «Proveedor no disponible» = hoy no se
  // pudo descargar algun dia que hacia falta (servidor, red o sin tiempo): dice
  // de que par, que dia y por que. «Descolgado» = el par lleva mas de N dias de
  // mercado sin datos, sea cual sea la causa; cada uno dice si hoy el proveedor
  // estuvo disponible para el.
  const sinProveedor = resultados.filter(r => r.fallidos?.length || r.sinTiempo)
  if (sinProveedor.length) {
    console.log(`\n=== PROVEEDOR NO DISPONIBLE (hoy) — ${sinProveedor.length} par(es) ===`)
    sinProveedor.forEach(r => console.log(`  ${r.pair.toUpperCase()}: ${[r.sinTiempo ? 'sin tiempo (presupuesto del job, con su reserva para publicar)' : '', ...(r.fallidos || [])].filter(Boolean).join(', ')}`))
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
      const hoyNo = sinProveedor.find(r => r.pair === pair)
      if (!ok) descolgados.push(`${pair.toUpperCase()}: ultima ${ult.toISOString().slice(0,10)}, ${retraso} dias de mercado de retraso — ${hoyNo ? 'hoy, ademas, proveedor no disponible para este par' : 'el proveedor SI respondio hoy: revisar los datos'}`)
    } catch(e) { console.log(`  ${pair.toUpperCase().padEnd(8)} ✗ ${E.texto(e)}`); descolgados.push(`${pair}: ${E.texto(e)}`) }
  }

  // una publicacion rechazada, sin verificar o sin cerrojo NO es un fallo de
  // descarga puntual: siempre se avisa y el job acaba con codigo 1
  const publicaciones = resultados.filter(r => r.estado.includes('✗ PUBLICACION'))
  if (publicaciones.length) {
    console.log(`\n  ✗ ${publicaciones.length} publicacion(es) sin completar: ${publicaciones.map(r => r.pair).join(', ')}`)
    process.exitCode = 1
  }
  if (descolgados.length) {
    console.log(`\n=== DESCOLGADO(S) (>${MAX_DIAS_MERCADO_RETRASO} dias de mercado) — ${descolgados.length} par(es) ===`)
    descolgados.forEach(d=>console.log(`  ${d}`))
    console.log(`\n=== ⚠️ ATENCION: ${descolgados.length} PAR(ES) DESCOLGADO(S) ===`)
    process.exitCode = 1
  } else if (publicaciones.length) {
    console.log(`\n=== ⚠️ ATENCION: ${publicaciones.length} publicacion(es) sin completar (ver ✗ PUBLICACION arriba) ===`)
  } else {
    console.log(`\n=== ✓ TODO OK — todos los pares dentro del margen (<=${MAX_DIAS_MERCADO_RETRASO} dias de mercado) ===`)
    if (sinProveedor.length) console.log(`  (proveedor no disponible hoy para: ${sinProveedor.map(r => r.pair.toUpperCase()).join(', ')}; dentro del margen, se reintenta en la proxima pasada)`)
  }

  if (!SUBIR) console.log(`\n  (SECO — no se tocó nada. Para subir: --subir)`)
}

main().catch(e => { console.error('Fatal:', E ? E.texto(e) : (e?.name === 'TypeError' ? 'TypeError' : 'Error')); process.exit(1) })
