// ACTUALIZACIÓN INCREMENTAL DIARIA. Para cada par: lee el año de Supabase ({año}.json.gz
// o, si no hay, {año}.json; se publica SIEMPRE .json.gz por la funcion comun
// publicarAnio de lib/mercado/ficheros.mjs y no se borra el .json),
// baja DÍA A DÍA desde su última vela hasta AYER, añade sin duplicar, valida y resube.
// NUNCA borra el bucket. Pensado para correr en GitHub Actions cada noche.
// Uso:
//   node scripts/actualizar-diario.js          -> SECO (no sube, dice qué haría)
//   node scripts/actualizar-diario.js --subir   -> SUBE de verdad
//   ... --pares AUDUSD,GBPUSD                   -> solo esos pares (bloque G, punto 11)
// Transferencia (bloque G, punto 11): cada par descarga su año como mucho DOS
// veces por pasada (lectura inicial; relectura solo si cambio bajo el cerrojo;
// verificacion por metadatos). El estado final no descarga nada.
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
const TODOS = ['audcad','audusd','eurusd','gbpjpy','gbpusd','nzdusd','usdcad','usdchf','usdjpy']
// --pares A,B (o --pares=A,B): solo esos; uno que no existe → no se ejecuta nada
function paresPedidos(argv) {
  const i = argv.findIndex(a => a === '--pares' || a.startsWith('--pares='))
  if (i < 0) return { pares: TODOS }
  const valor = argv[i].includes('=') ? argv[i].slice(8) : argv[i + 1]
  const lista = String(valor ?? '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean)
  const malos = lista.filter(x => !TODOS.includes(x))
  if (!lista.length || malos.length) return { error: `--pares: ${malos.length ? `par(es) desconocido(s): ${malos.map(x => x.toUpperCase()).join(', ')}` : 'lista vacia'}. Validos: ${TODOS.map(x => x.toUpperCase()).join(', ')}` }
  return { pares: TODOS.filter(x => lista.includes(x)) }
}
const PEDIDOS = paresPedidos(process.argv)
const PAIRS = PEDIDOS.pares || []
// --objetivo PAR:AAAA-MM-DD[,PAR:AAAA-MM-DD...] (Astra M-03, CTO 7-oct): al
// terminar, el job dice por cada objetivo si quedo completo (velas y ultimo
// minuto) y sale distinto de 0 (1) si alguno no, aunque el estado diario sea
// «todo bien». Cada par tiene que estar entre los que se procesan.
function objetivosPedidos(argv) {
  const i = argv.findIndex(a => a === '--objetivo' || a.startsWith('--objetivo='))
  if (i < 0) return { lista: [] }
  const valor = argv[i].includes('=') ? argv[i].slice(11) : argv[i + 1]
  // CTO 7-oct (como CSV-04 del importador): un elemento vacio no se descarta en silencio
  const crudos = String(valor ?? '').split(',').map(x => x.trim())
  if (crudos.some(x => !x)) return { error: `--objetivo: ${crudos.every(x => !x) ? 'lista vacia' : 'lista con elementos vacios'}` }
  const lista = crudos
  const fechaOk = f => { if (!/^\d{4}-\d{2}-\d{2}$/.test(f || '')) return false; const t = Date.parse(f + 'T00:00:00Z'); return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === f }   // MER-R2: 2026-13-01 o 99-99 sin RangeError
  const malos = lista.filter(x => { const m = /^([A-Z]{6}):(.+)$/.exec(x); return !m || !PAIRS.includes(m[1].toLowerCase()) || !fechaOk(m[2]) })
  if (!lista.length || malos.length) return { error: `--objetivo: ${malos.length ? `no valido(s): ${malos.join(', ')} (PAR:AAAA-MM-DD, con el par entre los que se procesan)` : 'lista vacia'}` }
  return { lista: lista.map(x => ({ par: x.slice(0, 6), dia: x.slice(7) })) }
}
const OBJETIVOS = objetivosPedidos(process.argv)

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
// verificar y soltar el cerrojo (F.tiempoMaximoPublicar, 480 s con los plazos
// por defecto; RESERVA_PUBLICAR_S la cambia). Las descargas de un par acaban
// como tarde en fin del job − reserva. Con 24 min de job y 30 de workflow
// (checkout y npm ci dentro) quedan ~6 min para el estado final.
let RESERVA_MS
// CTO 6-oct (tras la sonda 1: 69 de 75 peticiones con HTTP 429): 3 intentos por
// dia y una pausa entre dias (PAUSA_DIA_S, 5 s por defecto). Un 429 que no se
// puede esperar (sin Retry-After o sin presupuesto) CORTA EL JOB ENTERO: ni otros
// dias ni otros pares; lo contiguo ya descargado se publica y el job sale con
// el codigo de «proveedor no disponible» (2).
const INTENTOS_DIA = 3
const PAUSA_DIA_MS = segs(process.env.PAUSA_DIA_S, 5) * 1000
let CORTE_429 = null      // 'PAR dia: motivo' cuando el proveedor limita

// Baja UN dia por la DESCARGA PROPIA (bloque F, punto 4: lib/mercado/descarga.mjs):
// estado HTTP, bytes e intento de cada peticion en el log; esperas crecientes
// con azar y Retry-After; «sin datos» (no se reintenta) frente a «servidor» y
// «red». Lanza ErrorDescarga si no se pudo. → velas del dia ([] si no hay datos)
const dukascopy = require('dukascopy-node')
let DESC   // lib/mercado/descarga.mjs (ESM, se carga en main)
// CTO 7-oct: UNA conexion keep-alive por job hacia el proveedor, con User-Agent
// del proyecto (lib/mercado/conexion.mjs); se crea en main y se cierra al acabar
let FETCH_PROV
async function bajarDia(pair, y, m, d, limite = Infinity) {
  const dia = new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10)
  const r = await DESC.bajaDia({ sdk: dukascopy, fetch: FETCH_PROV, espera: sleep, log: l => console.log('    ' + l), par: pair, dia, limite, intentos: INTENTOS_DIA })
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
// Dias cortos aceptados (CTO 6-oct; lib/mercado/aceptados.mjs): 'PAR|fecha' → { velas, motivo }
let ACEPTADOS = new Map()
const estadoDe = (pair, d, velasDia) => C.estadoDia(d, velasDia, ACEPTADOS.get(`${pair.toUpperCase()}|${d}`)?.velas ?? null)
const MAX_DIAS_POR_PASADA = 40
const DIA_MS = 86400000
const ymd = ms => new Date(ms).toISOString().slice(0, 10)

// → { estado: 'ok', velas, ruta } | { estado: 'no-existe' } | { estado: 'error', ruta, motivo }
// «No existe» = el 404 de storage-js en los dos formatos; cualquier otro error, no
// se pudo leer (lib/mercado/ficheros.mjs).
// con plazo (BF-03) y con su firma (bloque G, punto 11: no releer si no cambio).
// TRANSFERENCIA: descargas y bytes de objetos anuales de esta pasada (se imprime)
const TRANSFERENCIA = { n: 0, bytes: 0 }
// LIM: los plazos de Storage y la lista de tiempos reales de esta pasada (se imprime)
let LIM
// CACHE y TOPE (mercado diario, CTO 9-oct-2026; lib/mercado/cache-anual.mjs):
//   MERCADO_CACHE=carpeta  copia local de cada año; antes de usarla, info() (sin
//                          descargar) tiene que dar la misma huella; si no, se
//                          descarga y se reescribe. Tras publicar se guarda lo
//                          subido: el dia siguiente no descarga nada.
//   MERCADO_TOPE_BYTES=N   tope de bytes de objetos anuales descargados en esta
//                          ejecucion: una descarga que lo pasaria no se hace
//                          (el par queda sin comprobar, codigo 3).
// Sin ninguna de las dos (el modo manual), se lee como siempre.
let CACHE = null, TOPE = null
const CACHE_LOG = []   // una linea por año leido con la cache: valida (0 bytes) o por que se descargo y cuanto
const cabe = (size, extra = 0) => TOPE == null || (Number.isFinite(size) && TRANSFERENCIA.bytes + extra + size <= TOPE)
const leerAnio = async (pair, year) => {
  if (!CACHE && TOPE == null) { const x = await F.leerConFirma(sb, pair, year, LIM); if (x.estado !== 'no-existe') { TRANSFERENCIA.n++; TRANSFERENCIA.bytes += x.bytes || 0 } return x }
  const P = `${pair.toUpperCase()} ${year}`
  const i = await F.infoVigente(sb, pair, year, LIM)
  let porque = 'sin copia'
  if (CACHE && i.estado === 'ok') {
    const c = CACHE.lee(pair, year, i)
    if (c.crudo) {
      const d = F.decodifica(c.crudo, i.ruta)
      if (d.estado === 'ok') { CACHE_LOG.push(`${P}: cache valida (misma huella que ${i.ruta}), 0 bytes descargados`); return { ...d, ruta: i.ruta, firma: i.firma, bytes: 0 } }
      porque = 'copia ilegible'; CACHE.olvida(pair, year)
    } else porque = c.motivo
  }
  if (i.estado === 'ok' && !cabe(Number(i.size))) { CACHE_LOG.push(`${P}: ${porque}; NO se descarga: tope de descarga (${i.size} bytes; ya ${TRANSFERENCIA.bytes} de ${TOPE})`); return { estado: 'tope', ruta: i.ruta, motivo: `tope de descarga: ${i.ruta} (${i.size} bytes) no cabe (ya descargados ${TRANSFERENCIA.bytes} de ${TOPE})` } }
  if (i.estado === 'error' && TOPE != null) return { estado: 'tope', ruta: F.rutaEscritura(pair, year), motivo: `tope de descarga: info() fallo (${i.motivo}) y sin el tamaño no se descarga` }
  const x = await F.leerVigente(sb, pair, year, LIM, { crudo: true })
  if (x.estado !== 'no-existe') { TRANSFERENCIA.n++; TRANSFERENCIA.bytes += x.bytes || 0 }
  const firma = i.estado === 'ok' && x.estado === 'ok' && i.ruta === x.ruta ? i.firma : null
  if (x.estado !== 'no-existe') CACHE_LOG.push(`${P}: ${porque}, descargados ${x.bytes || 0} bytes de ${x.ruta}`)
  if (CACHE && x.estado === 'ok' && !CACHE.guarda(pair, year, { ruta: x.ruta, firma, crudo: x.crudo, shaRemoto: i.metadata?.sha256 ?? null })) CACHE_LOG.push(`${P}: la copia no se guarda (sin firma, o el objeto cambio durante la descarga)`)
  delete x.crudo
  return { ...x, firma }
}

// Dias a pedir de `year` hasta `ayerMs` (incluido): la cola y los dias del
// interior PENDIENTES (bloque G, punto 7: laborables cortos y, desde BF-01,
// tambien domingos vacios o cortados; C.estadoDia).
function diasPendientes(pair, velas, year, ayerMs) {
  const porDia = {}
  for (const v of velas) (porDia[ymd(v.time * 1000)] ??= []).push(v)
  const inicio = Date.UTC(year, 0, 1)
  const fin = Math.min(Date.UTC(year, 11, 31), ayerMs)
  const ultDiaMs = velas.length ? Date.UTC(...ymd(velas[velas.length - 1].time * 1000).split('-').map((x, i) => i === 1 ? x - 1 : +x)) : inicio - DIA_MS
  const cola = [], cortos = []
  for (let t = inicio; t <= fin; t += DIA_MS) {
    const d = ymd(t)
    if (t > ultDiaMs) { if (C.diaConMercado(d)) cola.push(d); continue }   // cola: los dias con mercado (F3: el sabado no)
    if (estadoDe(pair, d, porDia[d]) === 'pendiente') cortos.push(d)
  }
  // el ultimo dia guardado, si esta a medias, entra en los cortos (es laborable) o en la cola.
  // Bloque F, punto 2: del MAS ANTIGUO al mas reciente, cortos del interior
  // incluidos; si hay mas de MAX_DIAS_POR_PASADA, los recientes esperan.
  return [...cortos, ...cola].sort().slice(0, MAX_DIAS_POR_PASADA)
}

// ¿Dia completo? (bloque G, punto 7: C.estadoDia; un dia con mercado y sin
// datos NUNCA lo es, tampoco el domingo)
const completo = (pair, d, velasDia) => estadoDe(pair, d, velasDia) !== 'pendiente'

// Compone lo publicado sobre `guardadas` (lo RELEIDO justo antes de subir):
//   · un dia solo se sustituye si el bajado trae MAS velas;
//   · la cola (dias posteriores a la ultima vela guardada) se recorre POR
//     CALENDARIO, en orden: un dia laborable que no se pudo bajar (bloque F,
//     punto 1) o que llega a medias corta la cola ahi (el a medias es el
//     ultimo publicado; el que falta, ni eso). Asi nunca queda un hueco
//     interior nuevo, se bajen los dias en el orden que se bajen.
// → velas | null (nada mejora lo guardado)
function componer(pair, guardadas, bajados) {
  const porDia = {}
  for (const v of guardadas || []) (porDia[ymd(v.time * 1000)] ??= []).push(v)
  const ultima = guardadas?.length ? ymd(guardadas[guardadas.length - 1].time * 1000) : ''
  let cambia = false
  const dias = Object.keys(bajados).sort()
  for (const d of dias.filter(d => d <= ultima)) {            // interior: solo mejora
    if (bajados[d].length > (porDia[d] || []).length) { porDia[d] = bajados[d]; cambia = true }
  }
  const cola = dias.filter(d => d > ultima)
  // M-01 (Astra, 7-oct): el ultimo dia guardado, si tras combinar lo guardado y
  // lo bajado sigue incompleto, es BARRERA: no se añade nada detras (si no, se
  // convertiria en un hueco interior). Vale para el calculo previo y bajo el
  // cerrojo, que componen con esta misma funcion.
  if (cola.length && !(ultima && !completo(pair, ultima, porDia[ultima]))) {
    const desde = ultima ? Date.parse(ultima + 'T00:00:00Z') + DIA_MS : Date.parse(cola[0].slice(0, 4) + '-01-01T00:00:00Z')
    for (let t = desde; t <= Date.parse(cola.at(-1) + 'T00:00:00Z'); t += DIA_MS) {
      const d = ymd(t)
      if (!Object.hasOwn(bajados, d)) { if (!completo(pair, d, [])) break; continue }   // falta un dia con mercado: corta
      if (bajados[d].length > (porDia[d] || []).length) { porDia[d] = bajados[d]; cambia = true }
      if (!completo(pair, d, porDia[d])) break                                          // vacio o a medias: ultimo (y si vacio, ni eso)
    }
  }
  return cambia ? Object.keys(porDia).sort().flatMap(d => porDia[d]).sort((a, b) => a.time - b.time) : null
}

// Baja los dias pendientes y los publica por la funcion comun.
async function reconciliaAnio(pair, year, ayerMs, limite = Infinity, finJob = Infinity) {
  const keyFile = F.rutaEscritura(pair, year)     // .json; .json.gz solo con MERCADO_GZIP=1
  const leido = await leerAnio(pair, year)
  // Bloque G, punto 10: cada resultado lleva el año y su contenido FINAL
  // conocido (lo verificado al publicar o, si no se publico, lo leido): el
  // veredicto se calcula con el, sin volver a descargar el año.
  if (leido.estado === 'error') return { keyFile, anio: year, final: null, estado: `✗ no se pudo leer ${leido.ruta}: ${leido.motivo}` }
  if (leido.estado === 'tope') return { keyFile, anio: year, final: null, tope: true, presupuesto: [`${leido.ruta} sin leer (${leido.motivo})`], estado: `✗ TOPE DE DESCARGA ${keyFile}: no se lee el año ni se pide nada al proveedor (${leido.motivo})` }
  const nuevoAnio = leido.estado === 'no-existe'
  const velas = nuevoAnio ? [] : leido.velas
  const pendientes = diasPendientes(pair, velas, year, ayerMs)
  if (!pendientes.length) return { keyFile, anio: year, final: velas, estado: `✓ al dia (${keyFile})` }

  // Bloque F, punto 1: el fallo de un dia NO tira el par. Se apunta y se sigue;
  // componer corta la cola en el primer dia que falte.
  // fallidos: el proveedor no respondio (servidor, red); presupuesto: se acabo
  // el tiempo (bloque G, punto 10: no se atribuye al proveedor)
  const bajados = {}, fallidos = [], vacios = [], presupuesto = []
  const ultimaGuardada = velas.length ? ymd(velas[velas.length - 1].time * 1000) : ''
  const guardadasDe = d => velas.filter(v => ymd(v.time * 1000) === d)
  // M-01: el ultimo dia guardado a medias cuenta como cola: si no se completa
  // (combinando lo guardado y lo bajado), corta y no se pide nada posterior
  const bordePendiente = !!ultimaGuardada && !completo(pair, ultimaGuardada, guardadasDe(ultimaGuardada))
  let colaCortada = false
  for (const d of pendientes) {
    const enCola = d > ultimaGuardada || (bordePendiente && d === ultimaGuardada)
    if (enCola && colaCortada) continue              // punto 2: cortada la cola, lo de despues no se publicaria
    const [y, m, dd] = d.split('-').map(Number)
    try { bajados[d] = (await bajarDia(pair, y, m - 1, dd, limite)) || [] }
    catch (e) {
      (e?.tipo === 'presupuesto' ? presupuesto : fallidos).push(`${d} (${E.texto(e)})`); if (enCola) colaCortada = true
      if (e?.tipo === 'limite') { CORTE_429 = `${pair.toUpperCase()} ${d}: ${E.texto(e)}`; break }   // el proveedor limita: ni un dia mas
    }
    // BF-01: un dia con mercado que llega vacio sigue PENDIENTE (y en la cola, la corta)
    if (bajados[d] && !bajados[d].length && !completo(pair, d, [])) vacios.push(d)
    if (enCola && bajados[d]) {
      const mejor = d === ultimaGuardada && guardadasDe(d).length >= bajados[d].length ? guardadasDe(d) : bajados[d]
      if (!completo(pair, d, mejor)) colaCortada = true
    }
    await sleep(PAUSA_DIA_MS)
  }
  const sinBajar = [...fallidos, ...presupuesto].sort()
  const nota = (sinBajar.length ? ` · sin descargar: ${sinBajar.join(', ')}` : '') + (vacios.length ? ` · pendiente (sin datos del proveedor): ${vacios.join(', ')}` : '')
  const base = { keyFile, anio: year, fallidos, vacios, presupuesto, final: velas }
  const previsto = componer(pair, nuevoAnio ? null : velas, bajados)
  if (!previsto) {
    if (sinBajar.length) return { ...base, estado: `✗ DESCARGA ${keyFile}: nada nuevo publicable${nota}` }
    return { ...base, estado: `${vacios.length ? '⚠️' : '✓'} ${keyFile}: ${pendientes.length} dia(s) revisado(s), nada mejor que lo guardado${nota}` }
  }
  const resumen = n => `${nuevoAnio ? 'año NUEVO, ' : ''}${n} velas (antes ${velas.length}); ultima ${ymd(previsto[previsto.length - 1].time * 1000)}`
  if (!SUBIR) {
    const v = C.validaParaPublicar(previsto, nuevoAnio ? null : velas, { anio: year })
    return { ...base, estado: `[SECO] ${keyFile}: ${resumen(previsto.length)}${v.ok ? '' : ` — NO se publicaria: ${v.problemas.join(' · ')}`}` }
  }
  // BF-03: no se empieza a publicar sin la reserva para terminar (ni se toma el cerrojo)
  if (Date.now() + RESERVA_MS > finJob) return { ...base, sinTiempo: true, estado: `✗ SIN TIEMPO PARA PUBLICAR ${keyFile}: no queda la reserva (${RESERVA_MS / 1000} s); lo bajado se descarta y se repite en la pasada siguiente${nota}` }
  const r = await F.publicarAnio(sb, { pair, year, componer: g => componer(pair, g, bajados), dueno: 'actualizar-diario', previo: leido, limites: LIM, ...(TOPE != null ? { permiteDescarga: (size, ya) => cabe(size, ya) } : {}) })
  TRANSFERENCIA.n += r.descargado?.n || 0; TRANSFERENCIA.bytes += r.descargado?.bytes || 0
  if (r.descargado?.n) CACHE_LOG.push(`${pair.toUpperCase()} ${year}: al publicar, descargados ${r.descargado.bytes} bytes (relectura o verificacion)`)
  // la copia del dia siguiente: el cuerpo subido y la firma de la verificacion (por metadatos)
  if (CACHE && r.estado === 'publicado') {
    if (r.cuerpo && r.firma && CACHE.guarda(pair, year, { ruta: r.ruta, firma: r.firma, crudo: r.cuerpo })) CACHE_LOG.push(`${pair.toUpperCase()} ${year}: copia actualizada con lo publicado (${r.cuerpo.length} bytes)`)
    else { CACHE.olvida(pair, year); CACHE_LOG.push(`${pair.toUpperCase()} ${year}: publicado sin firma verificada por metadatos: la copia se borra`) }
  }
  if (r.estado === 'tope') return { ...base, tope: true, presupuesto: [...presupuesto, `${keyFile}: ${r.problemas.join(' · ')}`], estado: `✗ TOPE DE DESCARGA ${keyFile}: el año cambio bajo el cerrojo y releerlo pasaria el tope; lo bajado se descarta y se repite en la pasada siguiente${nota}` }
  const avisos = (r.avisos || []).length ? ` (aviso: ${r.avisos.join(' · ')})` : ''
  if (r.estado === 'publicado') return { ...base, final: r.final, estado: `✓ SUBIDO ${keyFile}: ${resumen(r.velas)}, verificado${avisos}${nota}` }
  if (r.estado === 'sin-cambios') return { ...base, final: r.final ?? velas, estado: `✓ ${keyFile}: lo releido ya tenia lo bajado, nada que subir${nota}` }
  return { ...base, publicacion: true, estado: `✗ PUBLICACION ${r.estado} ${keyFile}: ${r.problemas.join(' · ')}${avisos}${nota}` }
}

async function procesarPar(pair, finJob = Infinity) {
  if (Date.now() + RESERVA_MS >= finJob) return { pair, sinTiempo: true, estado: `✗ SIN TIEMPO: no queda presupuesto del job (${PRESUPUESTO_JOB_MS / 1000} s) con la reserva para publicar (${RESERVA_MS / 1000} s) para este par` }
  const limite = Math.min(finJob - RESERVA_MS, Date.now() + PRESUPUESTO_PAR_MS)
  const hoy = new Date()
  const ayerMs = Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate() - 1)
  const year = hoy.getUTCFullYear()
  const anios = hoy.getUTCMonth() === 0 ? [year - 1, year] : [year]   // en enero, tambien el 31-dic anterior
  const partes = [], fallidos = [], presupuesto = [], finales = []
  let sinTiempoPublicar = false, publicacion = false, tope = false
  for (const y of anios) {
    if (CORTE_429) break
    if (Date.UTC(y, 0, 1) > ayerMs) continue           // el 1-ene aun no ha cerrado: nada que pedir de ese año
    const r = await reconciliaAnio(pair, y, ayerMs, limite, finJob)
    partes.push(r.estado); fallidos.push(...(r.fallidos || [])); presupuesto.push(...(r.presupuesto || []))
    if (r.sinTiempo) sinTiempoPublicar = true
    if (r.publicacion) publicacion = true
    if (r.tope) tope = true
    finales.push({ anio: y, velas: r.final })
  }
  const fallo = partes.find(p => p.startsWith('✗'))
  return { pair, fallidos, presupuesto, publicacion, finales, tope, sinTiempo: sinTiempoPublicar, estado: fallo ? fallo + (partes.length > 1 ? ` | ${partes.filter(p => p !== fallo).join(' | ')}` : '') : partes.join(' | ') || '✓ nada que hacer hoy' }
}

async function main() {
  if (PEDIDOS.error || OBJETIVOS.error) {
    console.log(PEDIDOS.error || OBJETIVOS.error)
    console.log(`\n=== ⚠️ ATENCION: no se ha hecho nada (opcion ${PEDIDOS.error ? '--pares' : '--objetivo'} no valida) (codigo 4) ===`)
    process.exitCode = 4
    return
  }
  F = await import('../lib/mercado/ficheros.mjs')
  DESC = await import('../lib/mercado/descarga.mjs')
  FETCH_PROV = (await import('../lib/mercado/conexion.mjs')).fetchDelJob()
  C = await import('../lib/mercado/calidad.mjs')
  E = await import('../lib/mercado/errores.mjs')
  try { ACEPTADOS = (await import('../lib/mercado/aceptados.mjs')).cargaAceptados() }
  catch (e) {
    console.log(`Lista de dias aceptados no valida: ${E.texto(e)}`)
    console.log('\n=== ⚠️ ATENCION: no se ha hecho nada (lib/mercado/dias-aceptados.mjs no valido) (codigo 4) ===')
    process.exitCode = 4
    return
  }
  const L = await import('../lib/mercado/limites.mjs')
  // BF-03: cada peticion HTTP a Storage se corta a su plazo (storage-js solo
  // acepta señal en download; asi tambien upload, info y remove)
  sb = createClient(url, key, { global: { fetch: L.fetchConLimite((...a) => globalThis.fetch(...a), F.LIMITES.grandeMs) } })
  LIM = { ...F.LIMITES, tiempos: [] }
  RESERVA_MS = segs(process.env.RESERVA_PUBLICAR_S, F.tiempoMaximoPublicar() / 1000) * 1000
  if (process.env.MERCADO_TOPE_BYTES != null && process.env.MERCADO_TOPE_BYTES !== '') {
    if (!/^\d+$/.test(process.env.MERCADO_TOPE_BYTES)) {
      console.log('MERCADO_TOPE_BYTES no valido: tiene que ser un entero de bytes (0 o mas)')
      console.log('\n=== ⚠️ ATENCION: no se ha hecho nada (MERCADO_TOPE_BYTES no valido) (codigo 4) ===')
      process.exitCode = 4
      return
    }
    TOPE = Number(process.env.MERCADO_TOPE_BYTES)
  }
  if (process.env.MERCADO_CACHE) CACHE = (await import('../lib/mercado/cache-anual.mjs')).creaCache(process.env.MERCADO_CACHE)
  console.log(`\n=== ACTUALIZACIÓN DIARIA ${SUBIR?'⚠️ REAL':'🔍 SECO'} — ${new Date().toISOString()}${PAIRS.length < TODOS.length ? ` — solo ${PAIRS.map(p => p.toUpperCase()).join(', ')}` : ''} ===\n`)
  const resultados = []
  const finJob = Date.now() + PRESUPUESTO_JOB_MS
  let primero = true
  for (const pair of PAIRS) {
    if (CORTE_429) { resultados.push({ pair, cortado429: true, estado: '✗ NO EMPEZADO: el proveedor limita (HTTP 429), job cortado' }); console.log(`  ${pair.toUpperCase()}... ✗ NO EMPEZADO: el proveedor limita (HTTP 429), job cortado`); continue }
    if (!primero) await sleep(8000)  // pausa anti-rafaga entre pares
    primero = false
    process.stdout.write(`  ${pair.toUpperCase()}... `)
    try { const r = await procesarPar(pair, finJob); console.log(r.estado); resultados.push(r) }
    catch(e) { console.log(`✗ ERROR: ${E.texto(e)}`); resultados.push({pair, error: true, estado:`✗ ${E.texto(e)}`}) }
  }
  // ── VEREDICTO (bloque F, punto 6; bloque G, punto 10: Astra BF-04) ─────────
  // Secciones separadas y un CODIGO DE SALIDA por situacion:
  //   0  todo bien: todos los pares al dia (<= MAX_DIAS_MERCADO_RETRASO), sin
  //      dias interiores incompletos, sin fallos de descarga ni de tiempo
  //   1  datos que no estan bien: par descolgado, no legible, con un dia
  //      INTERIOR incompleto sin reparar, o publicacion fallida o incierta
  //   2  proveedor no disponible: algun dia que hacia falta no se pudo bajar
  //      (servidor o red), aunque los datos sigan dentro del margen
  //   3  presupuesto agotado: un par sin tiempo, o una descarga cortada por
  //      el limite (ya no se cuenta como «proveedor no disponible»)
  //   4  error inesperado (Fatal)
  // Si coinciden varias, manda la primera de 1, 3, 2. Un corte por HTTP 429 sale
  // con 2 (CTO 6-oct) salvo que ademas falle una publicacion: entonces 1 (CTO
  // 7-oct: la publicacion fallida no puede quedar oculta). «TODO OK» solo con 0.
  // El estado de los datos sale de lo que cada par ya leyo o verifico al
  // publicar (finales): no se vuelve a descargar ningun año.
  const MAX_DIAS_MERCADO_RETRASO = 2
  const sinProveedor = resultados.filter(r => r.fallidos?.length)
  const sinPresupuesto = resultados.filter(r => r.sinTiempo || r.presupuesto?.length)
  if (sinProveedor.length) {
    console.log(`\n=== PROVEEDOR NO DISPONIBLE (hoy) — ${sinProveedor.length} par(es) ===`)
    sinProveedor.forEach(r => console.log(`  ${r.pair.toUpperCase()}: ${r.fallidos.join(', ')}`))
  }
  if (sinPresupuesto.length) {
    console.log(`\n=== PRESUPUESTO AGOTADO — ${sinPresupuesto.length} par(es) ===`)
    sinPresupuesto.forEach(r => console.log(`  ${r.pair.toUpperCase()}: ${[r.sinTiempo ? 'sin tiempo (presupuesto del job, con su reserva para publicar)' : '', ...(r.presupuesto || [])].filter(Boolean).join(', ')}`))
  }

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
  // dias INTERIORES (del 1-ene al dia anterior al ultimo con datos) pendientes
  // segun C.estadoDia: laborables cortos, domingos vacios o cortados
  function interioresIncompletos(pair, velas, anio) {
    const porDia = {}
    for (const v of velas) (porDia[ymd(v.time * 1000)] ??= []).push(v)
    const ultimo = ymd(velas[velas.length - 1].time * 1000)
    const out = []
    for (let t = Date.UTC(anio, 0, 1); ymd(t) < ultimo; t += DIA_MS) {
      const d = ymd(t), e = estadoDe(pair, d, porDia[d])
      if (e === 'pendiente') out.push(`${d} (${(porDia[d] || []).length})`)
    }
    return out
  }

  console.log(`\n=== ESTADO DE LOS DATOS ===`)
  const hoy = new Date()
  const ayer = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate()-1))
  const descolgados = []
  for (const pair of PAIRS) {
    const r = resultados.find(x => x.pair === pair) || {}
    const P = pair.toUpperCase().padEnd(8)
    // el año mas reciente con datos de los que proceso el par
    const fin = [...(r.finales || [])].reverse().find(f => f.velas?.length)
    if (!fin) {
      if (r.tope) { console.log(`  ${P} — sin comprobar (tope de descarga)`); continue }
      if (r.sinTiempo && !(r.finales || []).length) { console.log(`  ${P} — sin comprobar (sin tiempo)`); continue }
      if (r.cortado429) { console.log(`  ${P} — sin comprobar (job cortado por HTTP 429)`); continue }
      console.log(`  ${P} ✗ no legible`); descolgados.push(`${pair.toUpperCase()}: archivo no legible${r.error ? ' (error)' : ''}`); continue
    }
    const ult = new Date(fin.velas[fin.velas.length - 1].time * 1000)
    const retraso = diasMercadoEntre(ult, ayer)
    const interiores = interioresIncompletos(pair, fin.velas, fin.anio)
    const ok = retraso <= MAX_DIAS_MERCADO_RETRASO && !interiores.length
    console.log(`  ${P} ${ok ? '✓' : '⚠️'} ultima ${ult.toISOString().slice(0,10)} (retraso: ${retraso} dia(s) de mercado)${interiores.length ? ` · ${interiores.length} dia(s) interior(es) incompleto(s): ${interiores.slice(0, 8).join(', ')}${interiores.length > 8 ? '…' : ''}` : ''}`)
    const hoyNo = sinProveedor.includes(r)
    if (retraso > MAX_DIAS_MERCADO_RETRASO) descolgados.push(`${pair.toUpperCase()}: ultima ${ult.toISOString().slice(0,10)}, ${retraso} dias de mercado de retraso — ${hoyNo ? 'hoy, ademas, proveedor no disponible para este par' : 'el proveedor SI respondio hoy: revisar los datos'}`)
    if (interiores.length) descolgados.push(`${pair.toUpperCase()}: ${interiores.length} dia(s) interior(es) incompleto(s) sin reparar: ${interiores.slice(0, 8).join(', ')}${interiores.length > 8 ? '…' : ''}`)
  }

  // una publicacion rechazada, sin verificar, incierta o sin cerrojo NO es un
  // fallo de descarga puntual: siempre se avisa (codigo 1)
  const publicaciones = resultados.filter(r => r.publicacion)
  if (publicaciones.length) console.log(`\n  ✗ ${publicaciones.length} publicacion(es) sin completar: ${publicaciones.map(r => r.pair.toUpperCase()).join(', ')}`)
  if (descolgados.length) {
    console.log(`\n=== DESCOLGADO(S) O INCOMPLETO(S) — ${descolgados.length} ===`)
    descolgados.forEach(d=>console.log(`  ${d}`))
  }
  console.log(`\n  Transferencia (objetos anuales leidos del bucket): ${TRANSFERENCIA.n} descarga(s), ${TRANSFERENCIA.bytes} bytes${TOPE != null ? ` (tope ${TOPE})` : ''}`)
  if (CACHE || TOPE != null) { console.log(`  Cache de años (${CACHE ? 'MERCADO_CACHE' : 'sin cache'}):`); CACHE_LOG.forEach(l => console.log(`    ${l}`)) }
  console.log(`  Tiempos de Storage (ms; plazos ${LIM.pequenaMs}/${LIM.grandeMs}): ${F.resumenTiempos(LIM.tiempos)}`)
  // M-03: los objetivos, con lo que cada par ya leyo o verifico (sin descargar)
  const objetivosMal = []
  if (OBJETIVOS.lista.length) {
    console.log(`\n=== OBJETIVOS — ${OBJETIVOS.lista.length} ===`)
    const hm = t => new Date(t * 1000).toISOString().slice(11, 16)
    for (const { par, dia } of OBJETIVOS.lista) {
      const r = resultados.find(x => x.pair === par.toLowerCase()) || {}
      const fin = (r.finales || []).find(f => f.anio === Number(dia.slice(0, 4)))
      let linea, ok = false
      if (!fin || !Array.isArray(fin.velas)) linea = `✗ no comprobado (${r.cortado429 ? 'job cortado por HTTP 429' : r.tope ? 'tope de descarga' : r.sinTiempo ? 'sin tiempo' : 'año no leido'})`
      else {
        const vd = fin.velas.filter(v => ymd(v.time * 1000) === dia)
        const e = estadoDe(par.toLowerCase(), dia, vd)
        ok = e !== 'pendiente'
        linea = !vd.length ? (ok ? '✓ sin mercado (no se exige)' : '✗ incompleto · 0 velas (sin velas)') : `${ok ? '✓ completo' : '✗ incompleto'} · ${vd.length} velas · ultima ${hm(vd[vd.length - 1].time)}`
      }
      console.log(`  ${par} ${dia}: ${linea}`)
      if (!ok) objetivosMal.push(`${par} ${dia}`)
    }
  }
  // CTO 6-oct: un corte por 429 sale con el codigo de «proveedor no disponible»;
  // CTO 7-oct: pero una publicacion fallida en la misma ejecucion gana (1)
  if (CORTE_429) console.log(`\n=== PROVEEDOR LIMITA (HTTP 429) — job cortado en ${CORTE_429}; no se ha pedido nada mas ===`)
  let codigo = CORTE_429 ? (publicaciones.length ? 1 : 2) : descolgados.length || publicaciones.length ? 1 : sinPresupuesto.length ? 3 : sinProveedor.length ? 2 : 0
  if (codigo === 0 && objetivosMal.length) codigo = 1   // M-03: un objetivo sin completar no es «todo bien»
  const motivos = [
    CORTE_429 ? 'job cortado: el proveedor limita (HTTP 429)' : '',
    objetivosMal.length ? `${objetivosMal.length} objetivo(s) sin completar: ${objetivosMal.join(', ')}` : '',
    descolgados.length ? `${descolgados.length} par(es) descolgado(s) o con dias incompletos` : '',
    publicaciones.length ? `${publicaciones.length} publicacion(es) sin completar` : '',
    sinPresupuesto.length ? `presupuesto agotado en ${sinPresupuesto.length} par(es)` : '',
    sinProveedor.length ? `proveedor no disponible para ${sinProveedor.length} par(es)` : '',
  ].filter(Boolean)
  if (codigo === 0) console.log(`\n=== ✓ TODO OK — todos los pares al dia (<=${MAX_DIAS_MERCADO_RETRASO} dias de mercado) y sin dias interiores incompletos ===`)
  else console.log(`\n=== ⚠️ ATENCION: ${motivos.join(' · ')} (codigo ${codigo}) ===`)
  process.exitCode = codigo

  if (!SUBIR) console.log(`\n  (SECO — no se tocó nada. Para subir: --subir)`)
}

// codigo 4: error inesperado (bloque G, punto 10)
main().finally(() => FETCH_PROV?.cierra?.()).catch(e => { console.error('Fatal:', E ? E.texto(e) : (e?.name === 'TypeError' ? 'TypeError' : 'Error')); process.exit(4) })
