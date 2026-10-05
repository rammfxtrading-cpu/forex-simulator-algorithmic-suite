/**
 * C04 · UNA AVERIA PARECE CERO ACTIVIDAD, AUSENCIA DE SESIONES O CARGA INFINITA
 *
 * Astra (4-oct): con sesiones/trades en error, el admin responde 200 con ceros
 * (pages/api/admin/list-alumnos-sim.js:36); Analytics convierte errores en
 * listas vacias (pages/analytics.js:64); el dashboard deja de cargar antes de
 * tener sus datos (pages/dashboard.js:82); una sesion inexistente deja el
 * cargador para siempre (components/_SessionInner.js:701); un fallo transitorio
 * del primer SELECT de perfil cierra la sesion (lib/useAuth.js:47-50). Y las
 * lecturas completas de trades no paginan: por encima del maximo de filas del
 * servidor se evalua una fraccion sin aviso (status.js:85, advance.js:122,
 * alumno-sim/[id].js:41).
 * Decision del CTO (4-oct, bloque B): estados de carga, error y vacio
 * honestos; sin signOut por un fallo transitorio; consultas paginadas con
 * comprobacion de total.
 *
 * Se ejecuta: useAuth, las paginas (dashboard, Analytics, sesion) y las APIs
 * REALES sobre la base falsa, con fallos y un tope de filas por respuesta
 * (db.maxFilas, el max-rows de PostgREST).
 *
 * ORACULOS:
 *   1. perfil ilegible un momento (no «no existe»): no se cierra la sesion
 *   2. dashboard: mientras carga no dice «No sessions yet»; con las sesiones
 *      en error, lo dice (error), no «No sessions yet»
 *   3. Analytics con los trades en error: lo dice, no «0 trades»
 *   4. lista de alumnos del admin con los trades en error: no 200 con ceros
 *   5. sesion inexistente: lo dice; sesion sin velas validas (D03): lo dice
 *   6. paginacion, tope 2 filas: status evalua las 3 operaciones (P&L 300);
 *      el detalle del admin devuelve 3; Analytics y el dashboard cuentan 3
 *   7. el total cambia a mitad de la lectura: error, no un resultado parcial
 */
import { titulo, ver, oraculo, fin, escenario, importa, sonda, monta, router, db, A, ADM, tok, perfil, sesionSim, tradeSim, asienta, puerta, vela, retenApi, fuente } from '../lib.mjs'
import { respuesta } from '../entorno.mjs'
import { llama } from '../supabase-falso.mjs'
import { velasEnStorage } from '../banco-motor.mjs'
const { useAuth } = await importa('lib/useAuth.js')
const Dashboard = (await importa('pages/dashboard.js')).default
const Analytics = (await importa('pages/analytics.js')).default
const Sesion = (await importa('components/_SessionInner.js')).default
const status = (await importa('pages/api/challenge/status.js')).default
const listaAlumnos = (await importa('pages/api/admin/list-alumnos-sim.js')).default
const detalleAlumno = (await importa('pages/api/admin/alumno-sim/[id].js')).default
const signOuts = () => db.auth.filter(x => x.op === 'signOut').length
const valorDe = (p, etiqueta) => { const n = p.busca(x => x.tipo && p.texto(x) === etiqueta); return n ? p.texto(n.padre).replace(etiqueta, '').trim() : null }
const avisaError = t => /no se ha podido|error|no se han podido/i.test(t)

titulo('1 · useAuth: perfil ilegible un momento')
escenario()
let una = 1
db.falla = c => c.tabla === 'profiles' && una-- > 0 ? { message: 'upstream timeout', code: '57014' } : null
const c1 = sonda(() => useAuth('simulador_activo')); await asienta(60)
ver('control: el fallo programado se consumio (la primera lectura del perfil fallo)', una <= 0, una)
oraculo('C04', 'un fallo transitorio del perfil no cierra la sesion', signOuts() === 0 && db.sesion !== null, `${signOuts()} signOut`)
oraculo('C04', 'y lo dice (error), sin fingir «sin acceso» ni dejar el cargador', !!c1.valor.error && c1.valor.loading === false, JSON.stringify({ error: c1.valor.error ?? null, loading: c1.valor.loading }))
c1.raiz.desmonta()
escenario({ perfiles: [perfil(ADM, { rol_global: 'admin' })], sesion: A })   // A tiene sesion pero NO perfil
const c1b = sonda(() => useAuth('simulador_activo')); await asienta(60)
ver('control: sin perfil de verdad (no existe), si se cierra la sesion', signOuts() === 1, signOuts())
c1b.raiz.desmonta()

titulo('2 · dashboard')
escenario({ sim_sessions: [sesionSim({ name: 'Sesion-uno' })] })
const suelta = puerta()
db.pausa = async c => { if (c.tabla === 'sim_sessions' && c.op === 'select') await suelta.p }
let d = monta(Dashboard, {}); await asienta(60)
oraculo('C04', 'dashboard cargando: no dice «No sessions yet»', !/No sessions yet/.test(d.texto()), /No sessions yet/.test(d.texto()) ? 'dice «No sessions yet» con la lectura en curso' : '')
suelta.abrir(); db.pausa = null; await d.asienta(60)
ver('control: al llegar, la sesion aparece', d.texto().includes('Sesion-uno'))
d.desmonta()
escenario({ sim_sessions: [sesionSim({ name: 'Sesion-uno' })] })
db.falla = c => c.tabla === 'sim_sessions' && c.op === 'select' ? { message: 'upstream timeout', code: '57014' } : null
d = monta(Dashboard, {}); await d.asienta(60)
oraculo('C04', 'dashboard con las sesiones en error: lo dice, no «No sessions yet»', avisaError(d.texto()) && !/No sessions yet/.test(d.texto()), /No sessions yet/.test(d.texto()) ? 'dice «No sessions yet»' : avisaError(d.texto()) ? '' : 'sin aviso')
d.desmonta()

titulo('3 · Analytics con los trades en error')
escenario({ sim_sessions: [sesionSim({ name: 'Sesion-uno' })], sim_trades: [tradeSim({})] })
db.falla = c => (c.tabla === 'sim_trades' && c.op === 'select') || String(c.tabla).startsWith('rpc:sim_trades') ? { message: 'upstream timeout', code: '57014' } : null   // bloque E: tambien por la rpc
const an = monta(Analytics, {}); await an.asienta(80)
oraculo('C04', 'Analytics: lo dice, no enseña 0 trades', avisaError(an.texto()) && valorDe(an, 'TOTAL TRADES') !== '0', `TOTAL TRADES ${valorDe(an, 'TOTAL TRADES')}; aviso ${avisaError(an.texto())}`)
an.desmonta()

titulo('4 · lista de alumnos del admin con los trades en error')
escenario({ sesion: ADM, sim_sessions: [sesionSim({})], sim_trades: [tradeSim({})] })
db.falla = c => (c.tabla === 'sim_trades' && c.op === 'select') || String(c.tabla).startsWith('rpc:sim_trades') ? { message: 'upstream timeout', code: '57014' } : null   // bloque E: tambien por la rpc
const la = await llama(listaAlumnos, { method: 'GET', token: tok(ADM) })
oraculo('C04', 'no responde 200 con ceros', la.estado !== 200, `estado ${la.estado}; trades de A: ${la.cuerpo?.usuarios?.find(u => u.id === A)?.metrics?.trades}`)

titulo('5 · la pagina de sesion')
escenario({ sim_sessions: [] })
router.query = { id: 'no-existe' }
let ps = monta(Sesion, {}); await ps.asienta(200)
oraculo('C04', 'sesion inexistente: lo dice', /no existe|no encontrada|no se ha encontrado/i.test(ps.texto()), ps.texto().replace(/\s+/g, ' ').slice(0, 80))
ps.desmonta()
const sv = sesionSim({ id: 'sin-velas', date_from: '2025-03-03', date_to: '2025-03-07' })
escenario({ sim_sessions: [sv] })
velasEnStorage('EUR/USD', [vela(Date.parse('2025-03-03T10:00:00Z') / 1000, 1.1, 1.1, 1.1, 1.1), vela(Date.parse('2025-03-06T10:00:00Z') / 1000, 1.1, 1.1, 1.1, 1.1)], [2024])
router.query = { id: 'sin-velas' }
ps = monta(Sesion, {}); await ps.asienta(250)
oraculo('C04', 'sesion sin velas validas (D03): lo dice', /incompleto|no estan disponibles|invalido/i.test(ps.texto()), ps.texto().replace(/\s+/g, ' ').slice(0, 80))
ps.desmonta()

titulo('6 · paginacion con un tope de 2 filas por respuesta')
const reto = sesionSim({ id: 'reto-pag', challenge_type: '2F', challenge_phase: 1, capital: 100000, balance: 100300 })
const TRES = [1, 2, 3].map(i => tradeSim({ session_id: 'reto-pag', pnl: 100, result: 'WIN', closed_at: `2025-03-0${i + 2}T12:00:00Z`, opened_at: `2025-03-0${i + 2}T11:00:00Z` }))
escenario({ sim_sessions: [reto], sim_trades: TRES })
db.maxFilas = 2
const st = await llama(status, { method: 'GET', token: tok(A), query: { session_id: 'reto-pag' } })
ver('control: el tope de filas actua (una lectura directa devuelve 2 de 3)', (await (await importa('lib/supabase.js')).supabase.from('sim_trades').select('*')).data.length === 2)
oraculo('C04', 'status evalua las 3 operaciones: P&L 300', st.cuerpo?.evaluation?.pnlTotal === 300 && st.cuerpo?.trades_count === 3, `estado ${st.estado}; pnlTotal ${st.cuerpo?.evaluation?.pnlTotal}; trades ${st.cuerpo?.trades_count}`)
db.sesion = { user: { id: ADM, email: 'd@ejemplo.test' }, access_token: tok(ADM) }
const det = await llama(detalleAlumno, { method: 'GET', token: tok(ADM), query: { id: A } })
oraculo('C04', 'el detalle del admin devuelve las 3', det.cuerpo?.trades?.length === 3, `estado ${det.estado}; ${det.cuerpo?.trades?.length} trades`)
escenario({ sim_sessions: [reto], sim_trades: TRES }); db.maxFilas = 2
const an2 = monta(Analytics, {}); await an2.asienta(80)
oraculo('C04', 'Analytics cuenta 3', valorDe(an2, 'TOTAL TRADES') === '3', valorDe(an2, 'TOTAL TRADES'))
an2.desmonta()
const d2 = monta(Dashboard, {}); await d2.asienta(80)
oraculo('C04', 'el dashboard cuenta 3', /(^|\D)3TRADES TAKEN/.test(d2.texto()), /(\d+)TRADES TAKEN/.exec(d2.texto())?.[1])
d2.desmonta()

titulo('7 · el total cambia a mitad de la lectura')
escenario({ sim_sessions: [reto], sim_trades: TRES }); db.maxFilas = 2
let leidas = 0
db.pausa = async c => { if (((c.tabla === 'sim_trades' && c.op === 'select') || c.op === 'rpc') && ++leidas === 2) db.tablas.sim_trades.push(tradeSim({ session_id: 'reto-pag', pnl: -5000, result: 'LOSS', closed_at: '2025-03-06T12:00:00Z' })) }
const st2 = await llama(status, { method: 'GET', token: tok(A), query: { session_id: 'reto-pag' } })
// bloque D, punto 5: con reintento, tambien vale evaluar el conjunto NUEVO
// entero (4 trades, 300 − 5.000); nunca uno a medias
// bloque E: con UNA sentencia la lectura ve el conjunto de un instante: el de antes (3, +300) o el de despues (4, −4.700)
oraculo('C04', 'status no evalua un conjunto a medias: error o un conjunto que existio entero', st2.estado >= 500 || (st2.cuerpo?.trades_count === 4 && st2.cuerpo?.evaluation?.pnlTotal === -4700) || (st2.cuerpo?.trades_count === 3 && st2.cuerpo?.evaluation?.pnlTotal === 300), `estado ${st2.estado}; trades ${st2.cuerpo?.trades_count}; pnl ${st2.cuerpo?.evaluation?.pnlTotal}`)

titulo('8 · bloque D, punto 5: el conjunto cambia entre paginas sin cambiar el total (Astra)')
// Astra (cierres, 5-oct): pagina 1 de 2 sobre 4 = [b:+100, c:+200]; quedan d:+300
// y e:+400. Entre paginas se borra e y entra a:−1000, que ordena antes que b. El
// total sigue en 4; por offset la pagina 2 es [c, d] y se evaluaba
// [b, c, c, d] = +800 cuando el conjunto vigente suma −400.
const t8 = (letra, pnl, dia) => tradeSim({ id: 't8-' + letra, session_id: 'reto-pag', pnl, result: pnl > 0 ? 'WIN' : 'LOSS', closed_at: `2025-03-${dia}T12:00:00Z`, opened_at: `2025-03-${dia}T11:00:00Z`, created_at: `2025-03-${dia}T12:00:01Z` })
escenario({ sim_sessions: [reto], sim_trades: [t8('b', 100, '04'), t8('c', 200, '05'), t8('d', 300, '06'), t8('e', 400, '07')] }); db.maxFilas = 2
let leidas8 = 0
db.pausa = async c => {
  if (c.tabla === 'sim_trades' && c.op === 'select' && ++leidas8 === 2) {
    db.tablas.sim_trades = db.tablas.sim_trades.filter(t => t.id !== 't8-e')
    db.tablas.sim_trades.push(t8('a', -1000, '03'))
  }
}
const st8 = await llama(status, { method: 'GET', token: tok(A), query: { session_id: 'reto-pag' } })
db.pausa = null
// bloque E, punto 3: status ya no pagina: lee en UNA sentencia (rpc de sql/sim-002)
oraculo('C04', 'status lee los trades en una sola sentencia (rpc), no por paginas', leidas8 === 0 && db.log.some(l => l.op === 'rpc' && l.tabla === 'rpc:sim_trades_de_sesion'), `${leidas8} lecturas por paginas`)
oraculo('C04', 'nunca evalua un conjunto mezclado: error, el de antes (+1.000) o el de despues (−400)', st8.estado >= 500 || (st8.cuerpo?.trades_count === 4 && [1000, -400].includes(st8.cuerpo?.evaluation?.pnlTotal)), `estado ${st8.estado}; pnl ${st8.cuerpo?.evaluation?.pnlTotal}; trades ${st8.cuerpo?.trades_count}`)

titulo('9 · el conjunto no para de cambiar: no converge → error')
escenario({ sim_sessions: [reto], sim_trades: [t8('b', 100, '04'), t8('c', 200, '05'), t8('d', 300, '06'), t8('e', 400, '07')] }); db.maxFilas = 2
let k9 = 0
db.pausa = async c => { if ((c.tabla === 'sim_trades' && c.op === 'select') || c.op === 'rpc') db.tablas.sim_trades.push(tradeSim({ id: 't9-' + (++k9), session_id: 'reto-pag', pnl: 1, result: 'WIN', closed_at: '2025-03-01T12:00:00Z', created_at: `2025-03-01T00:00:${String(k9).padStart(2, '0')}Z` })) }
const st9 = await llama(status, { method: 'GET', token: tok(A), query: { session_id: 'reto-pag' } })
db.pausa = null
// bloque E: una sentencia ve el conjunto de SU instante (4 + 1 = 5 trades, +1.001): existio entero
oraculo('C04', 'si cada lectura ve otro conjunto: error, o el conjunto entero del instante de la lectura', st9.estado >= 500 || (st9.cuerpo?.trades_count === 5 && st9.cuerpo?.evaluation?.pnlTotal === 1001), `estado ${st9.estado}; trades ${st9.cuerpo?.trades_count}`)

titulo('11 · bloque E, punto 3: UPDATE alterno entre paginas (Astra BD-04)')
// Cuatro trades con los mismos ids. Antes de cada PRIMERA pagina el estado es
// [100, 200, −300, −400]; antes de cada SEGUNDA, [−1100, 200, 300, 200]: los dos
// suman −400. Dos recorridos identicos reunian [100, 200, 300, 200] = +800. Una
// lectura de UNA sentencia (rpc de sql/sim-002) ve un estado entero: −400.
const E1 = [100, 200, -300, -400], E2 = [-1100, 200, 300, 200]
const T11 = ['b', 'c', 'd', 'e'].map((l, i) => tradeSim({ id: 't11-' + l, session_id: 'reto-pag', pnl: E1[i], result: E1[i] > 0 ? 'WIN' : 'LOSS', closed_at: `2025-03-0${i + 3}T12:00:00Z`, opened_at: `2025-03-0${i + 3}T11:00:00Z`, created_at: `2025-03-0${i + 3}T12:00:01Z` }))
const alterna = () => {
  let lecturas = 0
  db.pausa = async c => {
    if (c.tabla === 'sim_trades' && c.op === 'select') { const e = ++lecturas % 2 ? E1 : E2; db.tablas.sim_trades.forEach((t, i) => { t.pnl = e[i] }) }
    if (c.op === 'rpc') { const e = ++lecturas % 2 ? E1 : E2; db.tablas.sim_trades.forEach((t, i) => { t.pnl = e[i] }) }
  }
}
escenario({ sim_sessions: [reto], sim_trades: T11 }); db.maxFilas = 2; alterna()
const st11 = await llama(status, { method: 'GET', token: tok(A), query: { session_id: 'reto-pag' } })
oraculo('C04', 'status: −400 (un estado entero) o error; nunca +800', st11.estado >= 500 || st11.cuerpo?.evaluation?.pnlTotal === -400, `estado ${st11.estado}; pnl ${st11.cuerpo?.evaluation?.pnlTotal}`)
escenario({ sim_sessions: [reto], sim_trades: T11 }); db.maxFilas = 2; alterna()
db.sesion = { user: { id: ADM, email: 'd@ejemplo.test' }, access_token: tok(ADM) }
const det11 = await llama(detalleAlumno, { method: 'GET', token: tok(ADM), query: { id: A } })
const sumaDet = (det11.cuerpo?.trades || []).reduce((x, t) => x + Number(t.pnl), 0)
oraculo('C04', 'detalle del admin: suma −400 o error; nunca +800', det11.estado >= 500 || sumaDet === -400, `estado ${det11.estado}; suma ${sumaDet}`)
escenario({ sim_sessions: [reto], sim_trades: T11 }); db.maxFilas = 2; alterna()
const an11 = monta(Analytics, {}); await an11.asienta(80)
const pnlAn = valorDe(an11, 'TOTAL P&L')
oraculo('C04', 'Analytics: TOTAL P&L $-400.00 (o error); nunca +$800.00', avisaError(an11.texto()) || pnlAn === '$-400.00', `TOTAL P&L «${pnlAn}»`)
an11.desmonta()
db.pausa = null; db.maxFilas = null

titulo('10 · bloque D, punto 5: un par que falla no tapa la sesion ni deja un motor sin controles')
// Astra (cierres, 5-oct): EURUSD con posicion y reproduccion activa; se añade
// GBPUSD y su año da 503. usePairData llamaba a setErrorDatos y _SessionInner
// devolvia la pantalla global de error, sin pausar el motor de EURUSD.
const { banco } = await import('../banco-motor.mjs')
const sp = sesionSim({ id: 'dos-pares' })
escenario({ perfiles: [perfil(A)], sim_sessions: [sp] })
velasEnStorage('EUR/USD', Array.from({ length: 30 }, (_, i) => vela(Date.parse('2025-03-03T10:00:00Z') / 1000 + i * 60, 1.1, 1.1, 1.1, 1.1)), [2024], { tramoAbierto: true })
const b10 = await banco({ sesion: sp })
ver('control: EURUSD cargado', !!b10.motor())
b10.abreMercado({ side: 'BUY', entry: 1.1, sl: 1.09, tp: 1.11, lots: 1 })
b10.motor().isPlaying = true; b10.estado.isPlaying = true          // reproduciendo (sin arrancar el bucle real)
const pares = b10.refs.pairState.current
const cargaPar = async par => { await b10.caja.valor.datos.loadPair(par); await b10.repinta() }
retenApi.responde = u => /pair=GBPUSD/.test(u) ? respuesta(503, { error: 'No se ha podido leer el historico. Prueba de nuevo en unos segundos.' }) : null
await cargaPar('GBP/USD')
retenApi.responde = null
oraculo('C04', 'el 503 de GBPUSD no sustituye la sesion por un error global', !b10.estado.errorDatos, b10.estado.errorDatos ?? '')
oraculo('C04', 'se muestra en ese par (su estado lleva el error)', typeof pares['GBP/USD']?.error === 'string' && pares['GBP/USD'].error.length > 0, JSON.stringify(pares['GBP/USD'] ?? null))
oraculo('C04', 'y el motor de EURUSD queda en pausa (no sigue sin controles)', b10.motor().isPlaying === false && b10.estado.isPlaying === false, `motor ${b10.motor().isPlaying}, pagina ${b10.estado.isPlaying}`)
ver('control: EURUSD conserva su posicion', b10.ps().positions.length === 1)
retenApi.antes = u => { if (/pair=AUDUSD/.test(u)) throw new TypeError('Failed to fetch') }
await cargaPar('AUD/USD')
retenApi.antes = null
oraculo('C04', 'fetch rechazado: error visible en el par, no solo en la consola', typeof pares['AUD/USD']?.error === 'string' && pares['AUD/USD'].error.length > 0, JSON.stringify(pares['AUD/USD'] ?? null))
retenApi.responde = u => /pair=NZDUSD/.test(u) ? respuesta(200, { candles: [], count: 0, source: 'ok' }) : null
await cargaPar('NZD/USD')
retenApi.responde = null
oraculo('C04', 'respuesta vacia: error visible en el par', typeof pares['NZD/USD']?.error === 'string' && pares['NZD/USD'].error.length > 0, JSON.stringify(pares['NZD/USD'] ?? null))
oraculo('C04', 'la sesion pinta el error del par activo con un reintento', /\.error\b/.test(fuente('components/_SessionInner.js')) && /reintentaPar/.test(fuente('components/_SessionInner.js')))
fin()
