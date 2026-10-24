/**
 * ETAPA 1 · EL CLIENTE (diseño sim-004: k.1 b, i.1 b, m.2, n.5, d1–d3, d6, o.5–o.10)
 *
 * Codigo REAL del repo sobre los dobles (supabase-falso, react-falso, entorno): sin red y sin
 * base. Lo de PostgreSQL (la funcion atomica de verdad, RLS, la puerta) esta en sim-004a.mjs.
 * Los modulos nuevos se importan sin romper: contra el codigo anterior a la etapa 1 la prueba
 * sale en ROJO (codigo 1), no en excepcion.
 *
 *   1 la cabecera global x-sim-cliente: etapa1-<version>
 *   2 cierre total: UNA llamada atomica, servicio antes, saldo confirmado + delta
 *   3 {error}: no queda nada, la pantalla vuelve atras, avisa y pausa (m.2)
 *   4 respuesta perdida con el cierre guardado: se relee y NO se revierte (n.5)
 *   5 resultado incierto: bloquea; un COMMIT tardio se acepta; pasado el plazo, se revierte
 *   6 dos cierres en cola: el que falla no contamina el saldo del siguiente
 *   7 cierre parcial: atomico, sin last_timestamp; con {error}, los lotes vuelven
 *   8 mantenimiento con una pestaña ya cargada: sondeo de 30 s, pantalla, nada se manda
 *   9 version superada: recarga sin posiciones; con una abierta, aviso fijo y boton (o.6)
 *  10 servicio ilegible: lo economico, bloqueado (o.5)
 *  11 la salida no escribe (o.10); la pausa solo guarda last_timestamp y timeframe (E1-01) y avisa del {error}
 *  12 legado (d2) y lapidas (d1): sesion, dashboard, Analytics y las dos APIs de admin
 *  13 borrar legado por /api/sim/borrar → 503 (d3, d6); /api/sim/* apagados
 *  14 el v0 sigue igual: crear y borrar desde el dashboard
 *  15 mutantes de lib/sim/cierre.js y servicio.js (copias en .pruebas/): cada oraculo los ve
 */
import { mkdirSync, cpSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { titulo, ver, oraculo, fin, escenario, sesionSim, tradeSim, importa, monta, router, vela, nav, db, A, ADM, perfil, tok, asienta, REPO } from './lib.mjs'
import { velasEnStorage, banco } from './banco-motor.mjs'
import { llama } from './supabase-falso.mjs'
const opcional = async p => { try { return await importa(p) } catch { return null } }
// los clientes creados al cargar los modulos (escenario() los borra: se leen ya)
await importa('lib/supabase.js')
const clientes = [...db.clientes]
const V = await opcional('lib/sim/version.js')
const SV = await opcional('lib/sim/servicio.js')
const CI = await opcional('lib/sim/cierre.js')
const AV = await opcional('lib/sim/avisos.js')
const Sesion = (await importa('components/_SessionInner.js')).default
const Dashboard = (await importa('pages/dashboard.js')).default
const Analytics = (await importa('pages/analytics.js')).default
const listaAlumnos = (await importa('pages/api/admin/list-alumnos-sim.js')).default
const detalleAlumno = (await importa('pages/api/admin/alumno-sim/[id].js')).default

const T0 = Date.parse('2025-03-03T10:00:00Z') / 1000
const VELAS = Array.from({ length: 30 }, (_, i) => { const px = +(1.1 + i * 0.001).toFixed(4); return vela(T0 + i * 60, px, px, px, px) })
const ops = (pred = () => true) => db.log.filter(pred)
const rpcCierre = () => ops(c => c.tabla === 'rpc:sim_cierre_v0')
const escriturasSesion = () => ops(c => c.tabla === 'sim_sessions' && c.op !== 'select')
const avisos = () => AV?.avisos?.() ?? []
const fijaConfirmado = (sid, v) => CI?.fijaSaldoConfirmado?.(sid, v)
const motivo = () => SV ? SV.motivoBloqueo() : 'sin modulo'
const ahoraReal = Date.now
// pulsar un boton que puede no estar (contra el codigo anterior: rojo, no excepcion)
const pulsa = (r, n) => { if (n) r.pulsa(n) }

// un banco con la sesion en la base y el saldo confirmado, como lo deja la pagina al cargar
async function montaBanco(extra = {}) {
  const ses = sesionSim({ id: 'ses-b', capital: 10000, balance: 10000, ...extra })
  escenario({ sim_sessions: [ses] })
  velasEnStorage('EUR/USD', VELAS, [2024], { tramoAbierto: true })
  const b = await banco({ sesion: ses, userId: A })
  await b.paso(2)
  fijaConfirmado(ses.id, 10000)
  await SV?.leeServicio?.()
  db.log.length = 0
  return b
}
const abre = (b, lots = 1) => b.abreMercado({ side: 'BUY', entry: 1.1, sl: 1.09, tp: 1.2, lots })
const cierra = async (b, pos, precio = 1.101) => { await b.caja.valor.trading.closePosition(pos.id, 'MANUAL', 'EUR/USD', precio); await asienta(40) }
const saldoBase = () => Number(db.tablas.sim_sessions[0].balance)
const tradesBase = () => (db.tablas.sim_trades || []).filter(t => t.session_id === 'ses-b')

try {
  // ═══════════════════════════════════════════════════════════════════════
  titulo('1 · la cabecera global (k.1 b, o.9)')
  const nav1 = clientes.find(o => o?.auth?.flowType === 'pkce')
  ver('control: el cliente del navegador (lib/supabase.js) se ha creado con sus opciones', !!nav1)
  oraculo('K1-cabecera', 'createClient lleva global.headers x-sim-cliente = etapa1-<VERSION_CLIENTE> (cubre REST, RPC, auth y storage)',
    !!V && Number.isInteger(V.VERSION_CLIENTE) && nav1?.global?.headers?.['x-sim-cliente'] === `etapa1-${V.VERSION_CLIENTE}` && V.CABECERA_CLIENTE === `etapa1-${V.VERSION_CLIENTE}`,
    JSON.stringify(nav1?.global ?? null))

  // ═══════════════════════════════════════════════════════════════════════
  titulo('2 · cierre total: una llamada atomica (i.1 S4-01a)')
  let b = await montaBanco()
  let pos = abre(b)
  await cierra(b, pos)
  const r1 = rpcCierre()
  const idx = (pred) => db.log.findIndex(pred)
  const pnl1 = tradesBase()[0]?.pnl
  oraculo('C-total-una-llamada', 'una sola llamada a sim_cierre_v0; ni INSERT de sim_trades ni UPDATE de sim_sessions sueltos',
    r1.length === 1 && ops(c => c.tabla === 'sim_trades' && c.op === 'insert').length === 0 && escriturasSesion().length === 0, `${r1.length} rpc · ${db.log.map(c => c.tabla + ':' + c.op).join(',')}`)
  oraculo('C-total-servicio-antes', 'el estado del servicio se lee ANTES de la llamada', idx(c => c.tabla === 'sim_servicio') > -1 && idx(c => c.tabla === 'sim_servicio') < idx(c => c.tabla === 'rpc:sim_cierre_v0'))
  oraculo('C-total-carga', 'trade con id generado (uuid), saldo = confirmado + pnl, last_timestamp del replay; base y pantalla iguales',
    /^[0-9a-f-]{36}$/.test(r1[0]?.payload?.p_trade?.id ?? '') && r1[0]?.payload?.p_balance === +(10000 + pnl1).toFixed(2) && r1[0]?.payload?.p_last_timestamp === b.estado.currentTime
    && saldoBase() === r1[0]?.payload?.p_balance && b.estado.saldo === saldoBase() && tradesBase().length === 1 && b.ps().positions.length === 0,
    `pnl ${pnl1} · p_balance ${r1[0]?.payload?.p_balance} · base ${saldoBase()} · pantalla ${b.estado.saldo}`)

  // ═══════════════════════════════════════════════════════════════════════
  titulo('3 · {error}: no queda nada y la pantalla vuelve atras (m.2, o.7)')
  b = await montaBanco()
  pos = abre(b)
  db.falla = c => c.tabla === 'rpc:sim_cierre_v0' ? { code: 'P0001', message: 'sim_cierre_v0: la sesion no existe o no es tuya' } : null
  await cierra(b, pos)
  db.falla = null
  oraculo('E-error-base', '{error}: en la base ni trade ni saldo cambiado', tradesBase().length === 0 && saldoBase() === 10000, `${tradesBase().length} trades · saldo ${saldoBase()}`)
  oraculo('E-error-pantalla', '{error}: la posicion vuelve a estar abierta, el trade sale de la lista y el saldo vuelve a 10000',
    b.ps().positions.some(p => p.id === pos.id) && !b.ps().trades.some(t => t.id === pos.id && t.reason === 'MANUAL') && b.estado.saldo === 10000,
    `${b.ps().positions.length} posiciones · saldo ${b.estado.saldo}`)
  oraculo('E-error-avisa', '{error}: avisa y pausa el replay', avisos().some(a => /No se ha podido guardar el cierre/.test(a.texto)) && b.estado.bloqueos.includes('fallido'), avisos().map(a => a.texto).join(' | '))

  // ═══════════════════════════════════════════════════════════════════════
  titulo('4 · respuesta perdida con el cierre guardado: se relee (n.5)')
  b = await montaBanco()
  pos = abre(b)
  db.pierde = c => c.tabla === 'rpc:sim_cierre_v0'
  await cierra(b, pos)
  db.pierde = null
  oraculo('P-perdida-guardada', 'la base confirmo y la respuesta se perdio: se relee el trade por su id y la pantalla ENSEÑA lo guardado (no revierte)',
    tradesBase().length === 1 && b.ps().positions.length === 0 && b.estado.saldo === saldoBase() && saldoBase() !== 10000
    && ops(c => c.tabla === 'sim_trades' && c.op === 'select').length >= 1 && motivo() === null && !avisos().some(a => /cierre/.test(a.texto)),
    `base ${saldoBase()} · pantalla ${b.estado.saldo} · motivo ${motivo()}`)

  // ═══════════════════════════════════════════════════════════════════════
  titulo('5 · resultado incierto (n.5, o.7)')
  b = await montaBanco()
  pos = abre(b)
  db.falla = c => c.tabla === 'rpc:sim_cierre_v0' ? { message: 'TypeError: Failed to fetch', code: '' } : null   // transporte: no se ejecuto
  await cierra(b, pos)
  db.falla = null
  const pagina = b.estado.saldo
  oraculo('I-no-revierte-enseguida', 'transporte roto y relectura sin el trade: NO se revierte aun (puede confirmarse despues); queda «incierto» y lo economico, bloqueado',
    motivo() === 'incierto' && b.ps().positions.length === 0 && b.estado.bloqueos.includes('incierto'), `motivo ${motivo()} · ${b.ps().positions.length} posiciones`)
  const pos2 = abre(b)
  await cierra(b, pos2)
  oraculo('I-bloquea', 'con el incierto pendiente, otro cierre no se manda y se revierte; el guardado periodico tampoco sale',
    rpcCierre().length === 1 && b.ps().positions.some(p => p.id === pos2.id) && b.estado.saldo === pagina
    && (await b.caja.valor.datos.saveProgress(T0 + 500), escriturasSesion().length === 0), `${rpcCierre().length} rpc · ${escriturasSesion().length} escrituras`)
  // el COMMIT tardio: la transaccion termina despues en el servidor
  const p0 = rpcCierre()[0]?.payload ?? { p_trade: {}, p_balance: null }
  ;(db.tablas.sim_trades ??= []).push({ ...p0.p_trade, session_id: 'ses-b' }); db.tablas.sim_sessions[0].balance = p0.p_balance
  await SV?.leeServicio?.()
  oraculo('I-commit-tardio', 'si el trade aparece despues (COMMIT tardio), se da por guardado: sin revertir y desbloqueado',
    motivo() === null && !b.ps().positions.some(p => p.id === pos.id) && CI?.saldoConfirmado?.('ses-b') === p0.p_balance, `motivo ${motivo()}`)
  // y el que de verdad no llego: pasado el plazo, se revierte
  b = await montaBanco()
  pos = abre(b)
  db.falla = c => c.tabla === 'rpc:sim_cierre_v0' ? { message: 'TypeError: Failed to fetch', code: '' } : null
  await cierra(b, pos)
  db.falla = null
  await SV?.leeServicio?.()
  const antesDelPlazo = motivo() === 'incierto' && b.ps().positions.length === 0
  Date.now = () => ahoraReal() + (SV?.ESPERA_INCIERTO_MS ?? 0) + 1000
  await SV?.leeServicio?.()
  Date.now = ahoraReal
  oraculo('I-plazo', 'antes del plazo sigue incierto; pasado ESPERA_INCIERTO_MS sin el trade, se revierte, avisa y se desbloquea',
    antesDelPlazo && (SV?.ESPERA_INCIERTO_MS ?? 0) >= 20000 && b.ps().positions.some(p => p.id === pos.id) && b.estado.saldo === 10000 && motivo() === null
    && avisos().some(a => /no llegó a guardarse/.test(a.texto)), `antes ${antesDelPlazo} · motivo ${motivo()} · saldo ${b.estado.saldo}`)

  // ═══════════════════════════════════════════════════════════════════════
  titulo('6 · dos cierres en cola: el que falla no contamina al siguiente')
  b = await montaBanco()
  const pa = abre(b), pb = abre(b, 2)
  let primera = true
  db.falla = c => (c.tabla === 'rpc:sim_cierre_v0' && primera) ? (primera = false, { code: 'P0001', message: 'x' }) : null
  b.caja.valor.trading.closePosition(pa.id, 'MANUAL', 'EUR/USD', 1.101)
  b.caja.valor.trading.closePosition(pb.id, 'MANUAL', 'EUR/USD', 1.101)
  await asienta(80)
  db.falla = null
  const r6 = rpcCierre(), t6 = tradesBase()
  oraculo('Q-cola', 'el segundo se manda DESPUES del primero y con saldo confirmado + su pnl (sin el del que fallo); base = pantalla',
    r6.length === 2 && t6.length === 1 && r6[1].payload.p_balance === +(10000 + t6[0].pnl).toFixed(2) && saldoBase() === r6[1].payload.p_balance
    && b.estado.saldo === saldoBase() && b.ps().positions.some(p => p.id === pa.id), `p_balance ${r6.map(x => x.payload.p_balance)} · base ${saldoBase()} · pantalla ${b.estado.saldo}`)

  // ═══════════════════════════════════════════════════════════════════════
  titulo('7 · cierre parcial')
  b = await montaBanco()
  pos = abre(b, 2)
  await b.caja.valor.trading.closePartial?.(pos.id, 'EUR/USD', 0.5, 'nota'); await asienta(40)
  const r7 = rpcCierre()
  oraculo('C-parcial', 'parcial: una llamada, sin last_timestamp, trade de 0,5 lotes; la posicion se queda con 1,5',
    r7.length === 1 && r7[0].payload.p_last_timestamp === null && r7[0].payload.p_trade.lots === 0.5 && b.ps().positions[0]?.lots === 1.5 && tradesBase().length === 1
    && saldoBase() === b.estado.saldo, `${r7.length} rpc · lotes ${b.ps().positions[0]?.lots}`)
  db.log.length = 0
  db.falla = c => c.tabla === 'rpc:sim_cierre_v0' ? { code: '23514', message: 'x' } : null
  await b.caja.valor.trading.closePartial?.(pos.id, 'EUR/USD', 0.5, null); await asienta(40)
  db.falla = null
  oraculo('E-parcial-error', 'parcial con {error}: los lotes vuelven a 1,5 y el saldo al de antes; la base no cambia',
    b.ps().positions[0]?.lots === 1.5 && b.estado.saldo === saldoBase() && tradesBase().length === 1, `lotes ${b.ps().positions[0]?.lots} · pantalla ${b.estado.saldo} · base ${saldoBase()}`)

  // ═══════════════════════════════════════════════════════════════════════
  titulo('8 · mantenimiento con una pestaña ya cargada (i.1 b, o.5)')
  const intervalos = []
  const siOrig = globalThis.setInterval
  globalThis.setInterval = (f, ms, ...r) => { intervalos.push(ms); return siOrig(f, ms, ...r) }
  escenario({ sim_sessions: [sesionSim({ id: 'ses-m', capital: 10000, balance: 10000 })] })
  velasEnStorage('EUR/USD', VELAS, [2024], { tramoAbierto: true })
  router.query = { id: 'ses-m' }
  let p = monta(Sesion, {}); await p.asienta(300)
  globalThis.setInterval = siOrig
  oraculo('S-sondeo-30s', 'la pagina de sesion lee sim_servicio al montar y programa el sondeo cada 30 s', ops(c => c.tabla === 'sim_servicio').length >= 1 && intervalos.includes(30000), `${intervalos}`)
  ver('control: sin mantenimiento, no hay pantalla de mantenimiento', !/Simulador en mantenimiento/.test(p.texto()))
  db.tablas.sim_servicio[0].mantenimiento = true
  await SV?.leeServicio?.()   // el tick de los 30 s
  await p.asienta(60)
  oraculo('S-pantalla', 'la pestaña ya cargada pasa a la pantalla de mantenimiento en el siguiente sondeo', /Simulador en mantenimiento/.test(p.texto()))
  p.desmonta()
  b = await montaBanco()
  db.tablas.sim_servicio[0].mantenimiento = true
  pos = abre(b)
  await cierra(b, pos)
  await b.caja.valor.datos.saveProgress(T0 + 600)
  oraculo('S-nada-sale', 'en mantenimiento: el cierre no se manda (se revierte y avisa) y el guardado periodico tampoco',
    rpcCierre().length === 0 && escriturasSesion().length === 0 && b.ps().positions.some(x => x.id === pos.id) && b.estado.bloqueos.includes('mantenimiento')
    && avisos().some(a => /mantenimiento/.test(a.texto)), `${rpcCierre().length} rpc · ${escriturasSesion().length} escrituras`)

  // ═══════════════════════════════════════════════════════════════════════
  titulo('9 · version superada (o.6)')
  let recargas = 0
  window.location.reload = () => { recargas++ }
  escenario({ sim_sessions: [sesionSim({ id: 'ses-v', capital: 10000, balance: 10000 })] })
  velasEnStorage('EUR/USD', VELAS, [2024], { tramoAbierto: true })
  router.query = { id: 'ses-v' }
  p = monta(Sesion, {}); await p.asienta(300)
  db.tablas.sim_servicio[0].version_minima = String((V?.VERSION_CLIENTE ?? 1) + 1)
  await SV?.leeServicio?.(); await p.asienta(60)
  oraculo('V-recarga', 'sin posiciones ni ordenes: recarga sola', recargas === 1, `${recargas} recargas`)
  p.desmonta()
  recargas = 0
  escenario({ sim_sessions: [sesionSim({ id: 'ses-v2', capital: 10000, balance: 10000 })] })
  velasEnStorage('EUR/USD', VELAS, [2024], { tramoAbierto: true })
  router.query = { id: 'ses-v2' }
  p = monta(Sesion, {}); await p.asienta(300)
  const tsP = { getVisibleLogicalRange: () => ({ from: 0, to: 50 }), setVisibleLogicalRange() {}, scrollToPosition() {} }
  window.__chartMap.current['EUR/USD'] = { series: { setData() {}, update() {}, priceToCoordinate: () => 0, createPriceLine: () => ({}), removePriceLine() {} },
    chart: { timeScale: () => tsP, priceScale: () => ({ applyOptions() {} }) }, prevCount: 0 }
  const pasoP = async () => { for (const f of [...(nav.oyentes.keydown || [])]) f({ code: 'ArrowRight', key: 'ArrowRight', target: { tagName: 'DIV' }, preventDefault() {} }); await p.asienta(20) }
  await pasoP()
  pulsa(p, p.boton('▲ Buy')); await p.asienta(100); pulsa(p, p.boton('Ejecutar Buy')); await p.asienta(100)
  ver('control: hay una posicion abierta (1 POS)', !!p.busca(x => x.tipo === 'button' && /^1 POS$/.test(p.texto(x).trim())))
  db.tablas.sim_servicio[0].version_minima = String((V?.VERSION_CLIENTE ?? 1) + 1)
  await SV?.leeServicio?.(); await p.asienta(60)
  oraculo('V-aviso-fijo', 'con una posicion abierta: NO recarga; aviso fijo con «Recargar ya»', recargas === 0 && /versión nueva/.test(p.texto()) && !!p.boton('Recargar ya'), `${recargas} recargas`)
  pulsa(p, p.boton('Recargar ya')); await p.asienta(20)
  oraculo('V-boton', 'el boton recarga', recargas === 1)
  p.desmonta()

  // ═══════════════════════════════════════════════════════════════════════
  titulo('10 · servicio ilegible (o.5)')
  b = await montaBanco()
  db.falla = c => c.tabla === 'sim_servicio' ? { message: 'upstream timeout', code: '57014' } : null
  pos = abre(b)
  await cierra(b, pos)
  db.falla = null
  oraculo('S-ilegible', 'si sim_servicio no se puede leer: el cierre no se manda, se revierte y avisa', rpcCierre().length === 0 && b.ps().positions.some(x => x.id === pos.id) && b.estado.bloqueos.includes('sin_estado'))

  // ═══════════════════════════════════════════════════════════════════════
  titulo('11 · la salida no escribe (o.10); la pausa (o.7)')
  escenario({ sim_sessions: [sesionSim({ id: 'ses-s', capital: 10000, balance: 10000 })] })
  velasEnStorage('EUR/USD', VELAS, [2024], { tramoAbierto: true })
  router.query = { id: 'ses-s' }
  p = monta(Sesion, {}); await p.asienta(300)
  window.__chartMap.current['EUR/USD'] = { series: { setData() {}, update() {}, priceToCoordinate: () => 0, createPriceLine: () => ({}), removePriceLine() {} },
    chart: { timeScale: () => tsP, priceScale: () => ({ applyOptions() {} }) }, prevCount: 0 }
  await pasoP(); await p.asienta(40)
  ver('control: el instrumento ve escrituras de la sesion (el paso guarda el avance)', escriturasSesion().some(c => c.op === 'update' && c.payload?.last_timestamp))
  const tecla = code => { for (const f of [...(nav.oyentes.keydown || [])]) f({ code, key: code, target: { tagName: 'DIV' }, preventDefault() {} }) }
  db.log.length = 0
  fijaConfirmado('ses-s', 9999.5)   // lo confirmado distinto de la pantalla (10000): ninguno de los dos debe salir
  tecla('Space'); await p.asienta(20); tecla('Space'); await p.asienta(60)
  // E1-01 (CTO 13-oct): la pausa solo guarda last_timestamp y timeframe; el saldo lo persiste el cierre atomico
  const pausas = escriturasSesion().filter(c => c.op === 'update')
  const pausa = pausas.find(c => c.payload?.last_timestamp != null)
  oraculo('X-pausa', 'la pausa: el servicio antes y SOLO last_timestamp y timeframe (ningun saldo, ni el confirmado ni el de la pantalla)',
    !!pausa && pausas.every(c => !('balance' in (c.payload || {}))) && Object.keys(pausa.payload).sort().join(',') === 'last_timestamp,timeframe'
    && db.log.findIndex(c => c.tabla === 'sim_servicio') > -1 && db.log.findIndex(c => c.tabla === 'sim_servicio') < db.log.indexOf(pausa), JSON.stringify(pausas.map(c => c.payload)))
  db.falla = c => c.tabla === 'sim_sessions' && c.op === 'update' ? { code: '42501', message: 'x' } : null
  tecla('Space'); await p.asienta(20); tecla('Space'); await p.asienta(60)
  db.falla = null
  oraculo('X-pausa-error', 'la pausa con {error}: solo avisa', avisos().some(a => /el avance de la sesión/.test(a.texto)))
  const n0 = db.log.length
  p.desmonta(); await asienta(60)
  // (garantia de NO REGRESION: tambien es verde en el codigo anterior, que ya no escribia; su
  // pareja con rojo es X-salida-codigo)
  oraculo('X-salida', 'al desmontar la sesion no sale ninguna escritura a sim_sessions (o.10)', !db.log.slice(n0).some(c => c.tabla === 'sim_sessions' && c.op !== 'select'),
    db.log.slice(n0).map(c => c.tabla + ':' + c.op).join(','))
  oraculo('X-salida-codigo', 'y la linea muerta de la salida ya no esta en _SessionInner', !/supabase\.from\('sim_sessions'\)\.update\(\{last_timestamp:e\.currentTime,balance:balanceRef\.current/.test(readFileSync(REPO + 'components/_SessionInner.js', 'utf8')))

  // ═══════════════════════════════════════════════════════════════════════
  titulo('12 · legado (d2) y lapidas (d1)')
  escenario({ sim_sessions: [sesionSim({ id: 'ses-l', name: 'Vieja', legado: true, terminal: null })] })
  velasEnStorage('EUR/USD', VELAS, [2024], { tramoAbierto: true })
  router.query = { id: 'ses-l' }
  p = monta(Sesion, {}); await p.asienta(300)
  window.__chartMap.current['EUR/USD'] = { series: { setData() {}, update() {}, priceToCoordinate: () => 0, createPriceLine: () => ({}), removePriceLine() {} },
    chart: { timeScale: () => tsP, priceScale: () => ({ applyOptions() {} }) }, prevCount: 0 }
  db.log.length = 0
  await pasoP()
  pulsa(p, p.boton('▲ Buy')); await p.asienta(100); if (p.boton('Ejecutar Buy')) { pulsa(p, p.boton('Ejecutar Buy')); await p.asienta(100) }
  oraculo('L-sesion', 'sesion legado: etiqueta «Simulador anterior · solo lectura», no abre posiciones y no guarda avance (last_timestamp)',
    /Simulador anterior · solo lectura/.test(p.texto()) && !p.busca(x => x.tipo === 'button' && /^1 POS$/.test(p.texto(x).trim())) && !escriturasSesion().some(c => c.payload && 'last_timestamp' in c.payload),
    `${escriturasSesion().length} escrituras`)
  p.desmonta()
  b = await montaBanco({ legado: true })
  pos = abre(b)
  await cierra(b, pos)
  oraculo('L-cierre', 'legado: un cierre no se manda y avisa', rpcCierre().length === 0 && avisos().some(a => /Simulador anterior/.test(a.texto)))
  escenario({ sim_sessions: [sesionSim({ id: 'd-v0', name: 'Normal' }), sesionSim({ id: 'd-lap', name: 'Lapida', terminal: 'borrada' }), sesionSim({ id: 'd-leg', name: 'Antigua', legado: true })] })
  let d = monta(Dashboard, {}); await d.asienta(120)
  oraculo('D-lapida-dashboard', 'dashboard: la lapida no se ve ni cuenta (SESSIONS 2)', !d.texto().includes('Lapida') && d.texto().includes('Normal') && /SESSIONS\s*2|2\s*SESSIONS/.test(d.texto().replace(/\s+/g, ' ')), d.texto().slice(0, 0))
  oraculo('D-etiqueta-legado', 'dashboard: la legado lleva «Simulador anterior»', !!d.busca(x => x.props?.['data-etiqueta'] === 'legado'))
  d.desmonta()
  escenario({ sim_sessions: [sesionSim({ id: 'a-v0', name: 'Normal' }), sesionSim({ id: 'a-lap', name: 'Lapida', terminal: 'borrada' })] })
  const an = monta(Analytics, {}); await an.asienta(120)
  oraculo('D-lapida-analytics', 'Analytics: la lapida no aparece', !an.texto().includes('Lapida') && an.texto().includes('Normal'))
  an.desmonta()
  escenario({ perfiles: [perfil(A), perfil(ADM, { rol_global: 'admin' })], sesion: ADM,
    sim_sessions: [sesionSim({ id: 'x-v0', user_id: A }), sesionSim({ id: 'x-lap', user_id: A, terminal: 'borrada' })] })
  const la = await llama(listaAlumnos, { token: tok(ADM), method: 'GET' })
  const da = await llama(detalleAlumno, { token: tok(ADM), method: 'GET', query: { id: A } })
  const filaA = (la.cuerpo?.usuarios || la.cuerpo || []).find?.(u => u.id === A)
  oraculo('D-lapida-admin', 'admin: la lista y el detalle del alumno no cuentan la lapida', la.estado === 200 && da.estado === 200
    && da.cuerpo.sessions.length === 1 && JSON.stringify(filaA ?? {}).match(/"(sesiones|sessions|num_sesiones|totalSesiones|sessionsCount)":\s*1\b/) != null,
    `lista ${la.estado} ${JSON.stringify(filaA ?? null).slice(0, 160)} · detalle ${da.cuerpo?.sessions?.length}`)

  // ═══════════════════════════════════════════════════════════════════════
  titulo('13 · borrar legado (d3, d6) y /api/sim/* apagados')
  escenario({ sim_sessions: [sesionSim({ id: 'b-leg', name: 'Antigua', legado: true }), sesionSim({ id: 'b-v0', name: 'Normal' })] })
  d = monta(Dashboard, {}); await d.asienta(120)
  db.log.length = 0
  const borra = nombre => d.todos(x => x.tipo === 'button' && d.texto(x) === '✕').find(x => d.texto(x.padre).includes(nombre))
  pulsa(d, borra('Antigua')); await d.asienta(80)
  oraculo('B-legado-503', 'borrar una legado va a POST /api/sim/borrar; con 503 dice mantenimiento, no la quita y no toca la base',
    /mantenimiento: no se puede borrar/.test(d.texto()) && d.texto().includes('Antigua') && db.tablas.sim_sessions.some(s => s.id === 'b-leg')
    && !ops(c => c.tabla === 'sim_sessions' && c.op === 'delete').length, d.texto().match(/[^.]*mantenimiento[^.]*/)?.[0] ?? '')
  d.desmonta()
  const RUTAS = ['crear', 'tomar', 'comando', 'avanzar-fase', 'borrar']
  const resp = []
  for (const rt of RUTAS) {
    const h = (await opcional(`pages/api/sim/${rt}.js`))?.default
    if (!h) { resp.push(rt + ': no existe'); continue }
    db.log.length = 0; db.auth.length = 0
    const r = await llama(h, { method: 'POST', body: { session_id: 'x' }, token: tok(A) })
    const g = await llama(h, { method: 'GET' })
    resp.push(`${rt}: ${r.estado} ${JSON.stringify(r.cuerpo)} / ${g.estado} · ${db.log.length + db.auth.length} ops`)
  }
  // CTO 16-oct: apagado (sin el interruptor) es motivo "apagado", distinto de "mantenimiento"
  oraculo('API-503', 'los 5 /api/sim/* responden 503 { ok:false, http:503, motivo:"apagado" } a todo, sin tocar la base ni la autenticacion',
    resp.every(x => /: 503 \{"ok":false,"http":503,"motivo":"apagado"\} \/ 503 · 0 ops$/.test(x)), resp.join(' | '))
  const res = (await opcional('lib/sim/respuestas.js'))?.interpretaBorrado
  oraculo('D6-respuestas', 'd6: 200→quitar, 410→quitar y lo dice, 403→solo lectura, 426→recargar, 503→mantenimiento, otro→error',
    !!res && res(200, { ok: true }).accion === 'quitar' && res(410, {}).accion === 'quitar' && /ya estaba borrada/.test(res(410, {}).texto) && res(403, {}).accion === 'solo_lectura'
    && res(426, {}).accion === 'recargar' && res(503, {}).accion === 'mantenimiento' && res(500, {}).accion === 'error' && res(0, null).accion === 'error')

  // ═══════════════════════════════════════════════════════════════════════
  titulo('14 · el v0 sigue igual: crear y borrar desde el dashboard')
  escenario({ sim_sessions: [sesionSim({ id: 'n-v0', name: 'Normal' })] })
  d = monta(Dashboard, {}); await d.asienta(120)
  pulsa(d, d.boton('✕')); await d.asienta(80)
  oraculo('V0-borrar', 'borrar una sesion v0: el DELETE de hoy, despues de leer el servicio', !db.tablas.sim_sessions.some(s => s.id === 'n-v0')
    && db.log.findIndex(c => c.tabla === 'sim_servicio') > -1 && db.log.findIndex(c => c.tabla === 'sim_servicio') < db.log.findIndex(c => c.tabla === 'sim_sessions' && c.op === 'delete'))
  // el formulario: cada campo con los nodos del ULTIMO pintado (el onChange lleva el form de ese pintado)
  const rellena = async (nombre) => {
    pulsa(d, d.boton('New Session')); await d.asienta(40)
    const campo = pred => d.todos(x => x.tipo === 'input').filter(pred)
    d.escribe(campo(x => x.props.placeholder)[0], nombre); await d.asienta(10)
    d.escribe(campo(x => x.props.type === 'date')[0], '2024-08-01'); await d.asienta(10)
    d.escribe(campo(x => x.props.type === 'date')[1], '2025-03-01'); await d.asienta(10)
    pulsa(d, d.boton('Create Session')); await d.asienta(80)
  }
  db.log.length = 0
  await rellena('Nueva')
  oraculo('V0-crear', 'crear una sesion: el INSERT de hoy (balance = capital), despues de leer el servicio', db.tablas.sim_sessions.some(s => s.name === 'Nueva' && Number(s.balance) === Number(s.capital))
    && db.log.findIndex(c => c.tabla === 'sim_servicio') > -1 && db.log.findIndex(c => c.tabla === 'sim_servicio') < db.log.findIndex(c => c.tabla === 'sim_sessions' && c.op === 'insert'))
  d.desmonta()
  escenario({})
  db.tablas.sim_servicio[0].mantenimiento = true
  d = monta(Dashboard, {}); await d.asienta(120)
  await rellena('Bloqueada')
  oraculo('D-mantenimiento', 'dashboard en mantenimiento: pantalla de mantenimiento y crear no inserta', /Simulador en mantenimiento/.test(d.texto()) && !db.tablas.sim_sessions.some(s => s.name === 'Bloqueada'))
  d.desmonta()

  // ═══════════════════════════════════════════════════════════════════════
  titulo('15 · mutantes (copias de lib/ en .pruebas/mutantes): los oraculos los ven')
  const MUTANTES = [
    ['solo excepciones (m.2): el {error} se ignora', 'lib/sim/cierre.js', "  if (!r.error) { st.confirmado[sessionId] = balance; return { estado: 'guardado', balance } }", "  { st.confirmado[sessionId] = balance; return { estado: 'guardado', balance } }", 'error'],
    ['incierto = fallido sin releer', 'lib/sim/cierre.js', '  if (errorCierto(r.error, r.status)) return', '  if (true) return', 'perdida'],
    ['sin comprobar el servicio', 'lib/sim/cierre.js', '  if (!permiso.permitido) return', '  if (false) return', 'mantenimiento'],
    ['saldo confirmado antes de saber el resultado', 'lib/sim/cierre.js', '  let r\n  try {\n    r = await conPlazo(supabase.rpc(', '  st.confirmado[sessionId] = balance\n  let r\n  try {\n    r = await conPlazo(supabase.rpc(', 'cola'],   // orden 1-117: la llamada va con plazo
    ['revertir el incierto sin esperar', 'lib/sim/servicio.js', 'export const ESPERA_INCIERTO_MS = 20000', 'export const ESPERA_INCIERTO_MS = 0', 'tardio'],
  ]
  for (const [desc, fichero, de, a, caso] of MUTANTES) {
    const dir = path.join(REPO, '.pruebas', 'mutantes', caso)
    if (!existsSync(path.join(REPO, 'lib', 'sim'))) { oraculo('MUT-' + caso, `mutante «${desc}»: no hay lib/sim que mutar`, false); continue }
    mkdirSync(path.join(dir, 'lib'), { recursive: true })
    cpSync(path.join(REPO, 'lib', 'sim'), path.join(dir, 'lib', 'sim'), { recursive: true })
    cpSync(path.join(REPO, 'lib', 'supabase.js'), path.join(dir, 'lib', 'supabase.js'))
    const f = path.join(dir, fichero), txt = readFileSync(f, 'utf8')
    if (!txt.includes(de)) { oraculo('MUT-' + caso, `mutante «${desc}»: el texto a cambiar existe`, false); continue }
    writeFileSync(f, txt.replace(de, a))
    const M = await import(pathToFileURL(path.join(dir, 'lib/sim/cierre.js')).href)
    const MS = await import(pathToFileURL(path.join(dir, 'lib/sim/servicio.js')).href)
    escenario({ sim_sessions: [sesionSim({ id: 'm', balance: 10000 })] })
    M.fijaSaldoConfirmado('m', 10000)
    const trade = (id) => ({ id, user_id: A, pair: 'EURUSD', side: 'BUY', lots: 1, pnl: 10 })
    let visto = false
    if (caso === 'error') {
      db.falla = c => c.tabla === 'rpc:sim_cierre_v0' ? { code: 'P0001', message: 'x' } : null
      const r = await M.persisteCierre({ sessionId: 'm', delta: 10, trade: trade('11111111-1111-4111-8111-111111111111') }); db.falla = null
      visto = r.estado !== 'fallido'    // E-error-*: el real dice fallido y revierte
    } else if (caso === 'perdida') {
      db.pierde = c => c.tabla === 'rpc:sim_cierre_v0'
      const r = await M.persisteCierre({ sessionId: 'm', delta: 10, trade: trade('22222222-2222-4222-8222-222222222222') }); db.pierde = null
      visto = r.estado !== 'guardado'   // P-perdida-guardada
    } else if (caso === 'mantenimiento') {
      db.tablas.sim_servicio[0].mantenimiento = true
      await M.persisteCierre({ sessionId: 'm', delta: 10, trade: trade('33333333-3333-4333-8333-333333333333') })
      visto = db.log.some(c => c.tabla === 'rpc:sim_cierre_v0')   // S-nada-sale
    } else if (caso === 'cola') {
      let una = true
      db.falla = c => (c.tabla === 'rpc:sim_cierre_v0' && una) ? (una = false, { code: 'P0001', message: 'x' }) : null
      await Promise.all([M.persisteCierre({ sessionId: 'm', delta: 10, trade: trade('44444444-4444-4444-8444-444444444444') }),
        M.persisteCierre({ sessionId: 'm', delta: 20, trade: trade('55555555-5555-4555-8555-555555555555') })]); db.falla = null
      visto = db.tablas.sim_sessions[0].balance !== 10020   // Q-cola: el real deja 10020
    } else if (caso === 'tardio') {
      db.falla = c => c.tabla === 'rpc:sim_cierre_v0' ? { message: 'TypeError: Failed to fetch', code: '' } : null
      const r = await M.persisteCierre({ sessionId: 'm', delta: 10, trade: trade('66666666-6666-4666-8666-666666666666') }); db.falla = null
      let revertido = false
      MS.registraIncierto({ tradeId: r.tradeId, revierte: () => { revertido = true } })
      await MS.leeServicio()
      visto = revertido   // I-commit-tardio: el real espera; el mutante revierte antes de que llegue el COMMIT
    }
    oraculo('MUT-' + caso, `mutante «${desc}» → su oraculo lo ve`, visto)
  }
  oraculo('E-clase-08', 'un error de conexion (SQLSTATE 08xxx) no es cierto: el COMMIT pudo ocurrir; 23505, P0001, 57014, PGRST202 y HTTP 4xx si',
    !!CI && CI.errorCierto({ code: '08006' }, 500) === false && CI.errorCierto({ code: '08003' }) === false && ['23505', 'P0001', '57014', 'PGRST202'].every(c => CI.errorCierto({ code: c }))
    && CI.errorCierto({ code: '' }, 409) === true && CI.errorCierto({ code: '' }, 0) === false && CI.errorCierto({ code: '' }, 502) === false)
} finally {
  Date.now = ahoraReal
}
fin()
