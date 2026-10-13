/**
 * ETAPA 1 · RONDA 2 DE CODIGO: LA COLA ECONOMICA DE LA SESION (CTO 13-oct, sobre la revision de
 * Astra E1-01..E1-04; diseño sim-004, o.13)
 *
 * Principio (CTO): en el cliente, TODA operacion economica de una sesion (cierres total y
 * parcial, SL/TP, resolucion de inciertos, refresco del reto y paso de fase) pasa por UNA cola
 * serial por sesion, y lo que cambia en la pantalla y sus compensaciones se calcula DENTRO de
 * la cola, cuando le toca, nunca al pulsar. Cada caso afirma la BASE y la PANTALLA, no solo
 * cuantas llamadas salen.
 *
 *   1 E1-01 · la pausa no escribe saldo: pausa antes, durante y despues de un cierre, en los
 *     dos ordenes de entrega, con respuesta perdida (del cierre y de la pausa) → saldo de la
 *     base = capital + suma de los cierres guardados
 *   2 E1-02 · una posicion con un cierre pendiente no acepta otro (manual, parcial ni SL/TP);
 *     la compensacion la devuelve a su ultimo estado CONFIRMADO: el caso de Astra (2 lotes →
 *     parcial 0,5 → total 1,5, los dos con error), varios parciales, exito y error
 *     combinados, SL/TP reevaluado al liberarse, y el ✕ deshabilitado
 *   3 E1-03 · cada incierto se resuelve UNA vez: dos leeServicio() a la vez (el caso de
 *     Astra), alta de otro incierto durante la espera, confirmacion tardia; y su callback
 *     corre en la cola de su sesion
 *
 * Modulos, hooks y pagina REALES sobre los dobles (supabase-falso, react-falso); datos
 * inventados; el orden de entrega lo deciden las puertas del doble (db.pausa). Sin red.
 */
import { titulo, ver, oraculo, fin, escenario, sesionSim, importa, monta, router, vela, nav, db, A, asienta, puerta } from './lib.mjs'
import { velasEnStorage, banco } from './banco-motor.mjs'

const CI = await importa('lib/sim/cierre.js')
const SV = await importa('lib/sim/servicio.js')
const AV = await importa('lib/sim/avisos.js')
const Sesion = (await importa('components/_SessionInner.js')).default
const T = Date.parse('2025-03-03T10:00:00Z') / 1000
const VS = Array.from({ length: 30 }, (_, i) => vela(T + i * 60, 1.1 + i * .001, 1.1 + i * .001, 1.1 + i * .001, 1.1 + i * .001))
const tecla = code => { for (const f of [...(nav.oyentes.keydown || [])]) f({ code, key: code, target: { tagName: 'DIV' }, preventDefault() {} }) }
const grafico = () => {
  const ts = { getVisibleLogicalRange: () => ({ from: 0, to: 50 }), setVisibleLogicalRange() {}, scrollToPosition() {} }
  window.__chartMap.current['EUR/USD'] = { series: { setData() {}, update() {}, priceToCoordinate: () => 0, createPriceLine: () => ({}), removePriceLine() {} },
    chart: { timeScale: () => ts, priceScale: () => ({ applyOptions() {} }) }, prevCount: 0 }
}
let nTrade = 0
const idTrade = () => `20000000-0000-4000-8000-${String(++nTrade).padStart(12, '0')}`
const cierre = (sid, pnl) => CI.persisteCierre({ sessionId: sid, delta: pnl, lastTimestamp: T + 60, trade: { id: idTrade(), user_id: A, pair: 'EUR/USD', side: 'BUY', lots: 1, pnl } })
const base = sid => db.tablas.sim_sessions.find(s => s.id === sid)
const suma = sid => db.tablas.sim_trades.filter(t => t.session_id === sid).reduce((n, t) => n + Number(t.pnl), 0)

// ═══════════════════════════════════════════════════════════════════════
titulo('1 · E1-01: la pausa no escribe saldo')
// la pagina real; la pausa por su manejador de teclado (Space dos veces: play y pausa)
async function pagina(sid) {
  escenario({ sim_sessions: [sesionSim({ id: sid, capital: 10000, balance: 10000 })] })
  velasEnStorage('EUR/USD', VS, [2024], { tramoAbierto: true }); router.query = { id: sid }
  const p = monta(Sesion, {}); await p.asienta(300); grafico()
  tecla('ArrowRight'); await p.asienta(40)
  return p
}
const pausa = async p => { tecla('Space'); await p.asienta(20); tecla('Space'); await p.asienta(40) }
const pausasSalidas = () => db.log.filter(c => c.tabla === 'sim_sessions' && c.op === 'update')

// cada caso: ¿que se retiene y en que orden se suelta? Termina con todo entregado.
const CASOS = [
  { id: 'antes', desc: 'pausa entregada ANTES del cierre', corre: async (p, sid) => { await pausa(p); await cierre(sid, 100) } },
  { id: 'despues', desc: 'pausa DESPUES del cierre confirmado', corre: async (p, sid) => { await cierre(sid, 100); await pausa(p) } },
  { id: 'durante-cierre-primero', desc: 'pausa DURANTE el cierre; llega primero el cierre (el orden de Astra)', corre: async (p, sid) => {
    const rpc = puerta(), pa = puerta()
    db.pausa = c => c.tabla === 'rpc:sim_cierre_v0' ? rpc.p : (c.tabla === 'sim_sessions' && c.op === 'update' ? pa.p : null)
    const c1 = cierre(sid, 100); await asienta(30); await pausa(p)
    rpc.abrir(); await c1; pa.abrir(); await p.asienta(60); db.pausa = null } },
  { id: 'durante-pausa-primero', desc: 'pausa DURANTE el cierre; llega primero la pausa', corre: async (p, sid) => {
    const rpc = puerta(), pa = puerta()
    db.pausa = c => c.tabla === 'rpc:sim_cierre_v0' ? rpc.p : (c.tabla === 'sim_sessions' && c.op === 'update' ? pa.p : null)
    const c1 = cierre(sid, 100); await asienta(30); await pausa(p)
    pa.abrir(); await p.asienta(60); rpc.abrir(); await c1; db.pausa = null } },
  { id: 'cierre-perdido', desc: 'pausa DURANTE un cierre cuya respuesta se pierde (COMMIT hecho: se relee)', corre: async (p, sid) => {
    const rpc = puerta()
    db.pausa = c => c.tabla === 'rpc:sim_cierre_v0' ? rpc.p : null
    db.pierde = c => c.tabla === 'rpc:sim_cierre_v0'
    const c1 = cierre(sid, 100); await asienta(30); await pausa(p)
    rpc.abrir(); const r = await c1; db.pausa = null; db.pierde = null
    ver('cierre-perdido: el cierre se da por guardado al releerlo', r.estado === 'guardado' && r.releido === true, JSON.stringify(r)) } },
  { id: 'pausa-perdida', desc: 'la respuesta de la PAUSA se pierde, entre dos cierres', corre: async (p, sid) => {
    await cierre(sid, 100)
    db.pierde = c => c.tabla === 'sim_sessions' && c.op === 'update'
    await pausa(p); db.pierde = null
    await cierre(sid, -30) } },
]
for (const c of CASOS) {
  const sid = 'pausa-' + c.id
  const p = await pagina(sid)
  db.log.length = 0
  await c.corre(p, sid); await p.asienta(60)
  const s = base(sid), salidas = pausasSalidas()
  ver(`${c.id}: la pausa ha salido (y el cierre se ha guardado)`, salidas.some(x => x.payload?.last_timestamp != null) && db.tablas.sim_trades.length >= 1, JSON.stringify(salidas.map(x => x.payload)))
  oraculo(`E101-${c.id}`, `${c.desc}: saldo de la base = 10000 + suma de los cierres guardados; la pausa no lleva saldo`,
    Number(s.balance) === 10000 + suma(sid) && suma(sid) !== 0 && salidas.every(x => !('balance' in (x.payload || {}))),
    `base ${s.balance} · cierres ${suma(sid)} · pausas ${JSON.stringify(salidas.map(x => x.payload))}`)
  p.desmonta(); await asienta(30)
}

// ═══════════════════════════════════════════════════════════════════════
titulo('2 · E1-02: bloqueo por posicion y compensacion desde lo confirmado')
const ERR = { code: 'P0001', message: 'inventado' }
const rpcs = () => db.log.filter(c => c.tabla === 'rpc:sim_cierre_v0')
async function mesa(sid) {
  const ses = sesionSim({ id: sid, capital: 10000, balance: 10000 })
  escenario({ sim_sessions: [ses] }); velasEnStorage('EUR/USD', VS, [2024], { tramoAbierto: true })
  const b = await banco({ sesion: ses, userId: A }); await b.paso(2)
  CI.fijaSaldoConfirmado(sid, 10000); await SV.leeServicio(); db.log.length = 0
  return b
}
const lotes = b => Number(b.ps().positions.reduce((n, x) => n + x.lots, 0).toFixed(2))
const coherente = (b, sid) => {
  const s = base(sid), tr = db.tablas.sim_trades.filter(t => t.session_id === sid)
  return Number(s.balance) === Number((10000 + suma(sid)).toFixed(2)) && b.estado.saldo === Number(s.balance)
}
const cuenta = (b, sid) => `lotes ${lotes(b)} · base ${base(sid).balance} · pantalla ${b.estado.saldo} · trades ${db.tablas.sim_trades.map(t => t.lots + '@' + t.pnl).join(',')} · rpc ${rpcs().length}`
const tr = () => b0.caja.valor.trading
let b0

{ // el caso de Astra: 2 lotes → parcial 0,5 → total (1,5) sin esperar; los dos con error
  const sid = 'e102-astra'; b0 = await mesa(sid)
  const pos = b0.abreMercado({ side: 'BUY', entry: 1.097, sl: 1.09, tp: 1.2, lots: 2 })
  db.falla = c => c.tabla === 'rpc:sim_cierre_v0' ? ERR : null
  const parcial = tr().closePartial(pos.id, 'EUR/USD', .5)
  const total = tr().closePosition(pos.id, 'MANUAL', 'EUR/USD', 1.102)
  await Promise.all([parcial, total]); await asienta(50); db.falla = null
  ver('astra: ningun trade guardado y la base en 10000', db.tablas.sim_trades.length === 0 && base(sid).balance === 10000)
  oraculo('E102-astra', 'parcial 0,5 y total sin esperar, los dos con error: el total no se acepta (posicion ocupada) y la posicion vuelve a 2 lotes; base y pantalla en 10000',
    lotes(b0) === 2 && rpcs().length === 1 && coherente(b0, sid) && AV.avisos().some(a => /cierre en curso/.test(a.texto)), cuenta(b0, sid))
  b0.caja.raiz.desmonta()
}
{ // varios parciales: el segundo, con el primero pendiente, no se acepta; el que falla vuelve a lo CONFIRMADO
  const sid = 'e102-parciales'; b0 = await mesa(sid)
  const pos = b0.abreMercado({ side: 'BUY', entry: 1.097, sl: 1.09, tp: 1.2, lots: 2 })
  const g = puerta(); db.pausa = c => c.tabla === 'rpc:sim_cierre_v0' ? g.p : null
  const p1 = tr().closePartial(pos.id, 'EUR/USD', .5)
  const p2 = tr().closePartial(pos.id, 'EUR/USD', .5)
  await asienta(30); const enCurso = rpcs().length
  g.abrir(); await p1; await p2; db.pausa = null; await asienta(20)
  const trasPrimero = lotes(b0)
  db.falla = c => c.tabla === 'rpc:sim_cierre_v0' ? ERR : null
  await tr().closePartial(pos.id, 'EUR/USD', .5); db.falla = null; await asienta(20)
  const trasError = lotes(b0)
  await tr().closePartial(pos.id, 'EUR/USD', .5); await asienta(20)
  oraculo('E102-parciales', 'varios parciales: con uno pendiente no se acepta otro; el que falla vuelve a 1,5 (lo confirmado), no a 2; al final 1,0 y dos trades; base = pantalla',
    enCurso === 1 && trasPrimero === 1.5 && trasError === 1.5 && lotes(b0) === 1 && db.tablas.sim_trades.length === 2 && coherente(b0, sid),
    `en curso ${enCurso} · ${trasPrimero} → ${trasError} → ${cuenta(b0, sid)}`)
  b0.caja.raiz.desmonta()
}
{ // parcial bien y total con error; parcial con error y total bien
  const sid = 'e102-mezcla'; b0 = await mesa(sid)
  const pos = b0.abreMercado({ side: 'BUY', entry: 1.097, sl: 1.09, tp: 1.2, lots: 2 })
  await tr().closePartial(pos.id, 'EUR/USD', .5); await asienta(20)
  db.falla = c => c.tabla === 'rpc:sim_cierre_v0' ? ERR : null
  await tr().closePosition(pos.id, 'MANUAL', 'EUR/USD', 1.102); db.falla = null; await asienta(20)
  oraculo('E102-parcial-bien-total-mal', 'parcial guardado y total con error: la posicion vuelve a 1,5 (lo confirmado tras el parcial); un trade; base = pantalla',
    lotes(b0) === 1.5 && db.tablas.sim_trades.length === 1 && coherente(b0, sid), cuenta(b0, sid))
  b0.caja.raiz.desmonta()
  const sid2 = 'e102-mezcla2'; b0 = await mesa(sid2)
  const pos2 = b0.abreMercado({ side: 'BUY', entry: 1.097, sl: 1.09, tp: 1.2, lots: 2 })
  db.falla = c => c.tabla === 'rpc:sim_cierre_v0' ? ERR : null
  await tr().closePartial(pos2.id, 'EUR/USD', .5); db.falla = null; await asienta(20)
  await tr().closePosition(pos2.id, 'MANUAL', 'EUR/USD', 1.102); await asienta(20)
  oraculo('E102-parcial-mal-total-bien', 'parcial con error y total guardado: el total cierra los 2 lotes; ninguna posicion; base = pantalla',
    b0.ps().positions.length === 0 && db.tablas.sim_trades.length === 1 && Number(db.tablas.sim_trades[0].lots) === 2 && coherente(b0, sid2), cuenta(b0, sid2))
  b0.caja.raiz.desmonta()
}
{ // SL/TP con la posicion ocupada: no manda otro cierre; al liberarse (el parcial falla) se reevalua
  const sid = 'e102-sltp'; b0 = await mesa(sid)
  const px = b0.estado.precio
  const pos = b0.abreMercado({ side: 'BUY', entry: px, sl: px - .01, tp: Number((px + .0025).toFixed(5)), lots: 2 })
  const g = puerta(); db.pausa = c => c.tabla === 'rpc:sim_cierre_v0' && c.payload?.p_trade?.lots === .5 ? g.p : null
  db.falla = c => c.tabla === 'rpc:sim_cierre_v0' && c.payload?.p_trade?.lots === .5 ? ERR : null
  const p1 = tr().closePartial(pos.id, 'EUR/USD', .5)
  await asienta(20); await b0.paso(5); await asienta(20)
  const conOcupada = rpcs().length
  g.abrir(); await p1; db.pausa = null; db.falla = null; await asienta(80)
  const t = db.tablas.sim_trades[0]
  oraculo('E102-sltp', 'el TP llega con la posicion ocupada: no sale otro cierre; al fallar el parcial y liberarse, el TP se reevalua y cierra los 2 lotes (lo confirmado)',
    conOcupada === 1 && b0.ps().positions.length === 0 && db.tablas.sim_trades.length === 1 && Number(t?.lots) === 2 && t?.result === 'WIN' && coherente(b0, sid),
    `rpc con la posicion ocupada ${conOcupada} · ${cuenta(b0, sid)}`)
  b0.caja.raiz.desmonta()
}
{ // el ✕ deshabilitado mientras la posicion esta ocupada (tabla de posiciones y grafico)
  const Paneles = (await importa('components/SessionPanels.js')).default
  const Overlay = (await importa('components/PositionOverlay.js')).default
  const pos = { id: 'P-ocupada', pair: 'EUR/USD', side: 'BUY', entry: 1.1, sl: 1.09, tp: 1.2, lots: 1, slPips: 10, tpPips: 100 }
  const libre = { ...pos, id: 'P-libre' }
  const cerradas = [], modales = []
  const pa = monta(Paneles, { showPos: true, setShowPos() {}, openPositions: [pos, libre], closePosition: id => cerradas.push(id), currentPrice: 1.1, activePair: 'EUR/USD',
    setCloseModal: m => modales.push(m.posId), showOrders: false, setShowOrders() {}, pendingOrders: [], cancelLimitOrder() {}, showTrades: false, setShowTrades() {}, allTrades: [], ocupadas: new Set(['P-ocupada']) })
  await pa.asienta(20)
  const xs = pa.todos(x => x.tipo === 'button' && pa.texto(x) === '✕' && x.props?.disabled !== undefined)
  for (const x of pa.todos(x => x.tipo === 'button' && pa.texto(x) === '✕')) x.props.onClick?.({ stopPropagation() {} })
  pa.boton('Cerrar todas')?.props.onClick()
  const cm = { current: { 'EUR/USD': { series: { priceToCoordinate: v => Math.round(1000 - v * 100) }, chart: { chartElement: () => null } } } }
  const ov = monta(Overlay, { positions: [pos], pendingOrders: [], chartMap: cm, activePair: 'EUR/USD', dataReady: true, chartTick: 1, ocupadas: new Set(['P-ocupada']),
    onClosePos: id => cerradas.push('ov:' + id), onCancelOrder() {}, onDragEnd() {} })
  await ov.asienta(40)
  const bOv = ov.busca(x => x.tipo === 'button' && ov.texto(x) === '✕')
  bOv?.props.onClick?.({ stopPropagation() {} })
  oraculo('E102-boton', 'el ✕ de una posicion ocupada esta deshabilitado (tabla y grafico) y no abre el cierre; «Cerrar todas» la salta',
    !!bOv && bOv.props.disabled === true && xs.some(x => x.props.disabled === true) && !modales.includes('P-ocupada') && modales.includes('P-libre')
    && !cerradas.includes('P-ocupada') && !cerradas.includes('ov:P-ocupada') && cerradas.includes('P-libre'),
    `modales ${modales} · cerradas ${cerradas} · overlay ${bOv ? 'disabled=' + bOv.props.disabled : 'sin boton'}`)
  pa.desmonta(); ov.desmonta()
}

// ═══════════════════════════════════════════════════════════════════════
titulo('3 · E1-03: cada incierto se resuelve una sola vez')
const ahora = Date.now
const adelanta = ms => { const base0 = ahora(); Date.now = () => base0 + ms }
const devuelve = () => { Date.now = ahora }
{ // dos leeServicio() simultaneos pasado el plazo: un solo revierte
  escenario({ sim_sessions: [sesionSim({ id: 'e103-a', balance: 10000 })] })
  const n = { g: 0, r: 0 }
  SV.registraIncierto({ tradeId: 'inc-1', sessionId: 'e103-a', guardado: () => n.g++, revierte: () => n.r++ })
  adelanta(21000)
  await Promise.all([SV.leeServicio(), SV.leeServicio()]); await asienta(30)
  devuelve()
  oraculo('E103-doble-lectura', 'dos leeServicio() a la vez pasado el plazo: revierte UNA vez, ningun guardado, y el incierto sale de la lista',
    n.r === 1 && n.g === 0 && SV.estadoServicio().inciertos === 0, `revierte ${n.r} · guardado ${n.g} · inciertos ${SV.estadoServicio().inciertos}`)
}
{ // alta de otro incierto mientras se resuelve el primero: no se pierde
  escenario({ sim_sessions: [sesionSim({ id: 'e103-b', balance: 10000 })] })
  const n = { r1: 0, r2: 0 }
  SV.registraIncierto({ tradeId: 'inc-1', sessionId: 'e103-b', guardado() {}, revierte: () => n.r1++ })
  adelanta(21000)
  const g = puerta(); db.pausa = c => c.tabla === 'sim_trades' && JSON.stringify(c.filtros).includes('inc-1') ? g.p : null
  const l = SV.leeServicio(); await asienta(20)
  SV.registraIncierto({ tradeId: 'inc-2', sessionId: 'e103-b', guardado() {}, revierte: () => n.r2++ })
  g.abrir(); await l; db.pausa = null; await asienta(20)
  const quedan = SV.estadoServicio().inciertos, motivo = SV.motivoBloqueo()
  devuelve()
  oraculo('E103-alta-durante', 'otro incierto dado de alta mientras se resuelve el primero sigue en la lista (y lo economico, bloqueado): no se sustituye la lista por una foto antigua',
    n.r1 === 1 && n.r2 === 0 && quedan === 1 && motivo === 'incierto', `r1 ${n.r1} · r2 ${n.r2} · quedan ${quedan} · motivo ${motivo}`)
}
{ // confirmacion tardia: el trade aparece antes del plazo → guardado una vez, con dos lecturas a la vez
  escenario({ sim_sessions: [sesionSim({ id: 'e103-c', balance: 10000 })] })
  const n = { g: 0, r: 0 }
  SV.registraIncierto({ tradeId: 'inc-3', sessionId: 'e103-c', guardado: () => n.g++, revierte: () => n.r++ })
  await SV.leeServicio(); await asienta(10)
  const antes = { ...n, inciertos: SV.estadoServicio().inciertos }
  db.tablas.sim_trades.push({ id: 'inc-3', session_id: 'e103-c', user_id: A, pnl: 5 })
  await Promise.all([SV.leeServicio(), SV.leeServicio()]); await asienta(30)
  adelanta(21000); await SV.leeServicio(); await asienta(20); devuelve()
  oraculo('E103-tardio', 'el trade aparece antes del plazo (COMMIT tardio): guardado UNA vez aunque lean dos a la vez; despues, ni revierte ni otra llamada',
    antes.g === 0 && antes.r === 0 && antes.inciertos === 1 && n.g === 1 && n.r === 0 && SV.estadoServicio().inciertos === 0, `antes ${JSON.stringify(antes)} · despues guardado ${n.g} revierte ${n.r}`)
}
{ // el callback corre en la COLA de su sesion: detras de lo que ya estaba encolado
  escenario({ sim_sessions: [sesionSim({ id: 'e103-d', balance: 10000 })] })
  const CO = await importa('lib/sim/cola.js')
  const orden = []
  SV.registraIncierto({ tradeId: 'inc-4', sessionId: 'e103-d', guardado() {}, revierte: () => orden.push('revierte') })
  const g = puerta()
  const op = CO.encola('e103-d', async () => { orden.push('op-empieza'); await g.p; orden.push('op-termina') })
  await asienta(5)
  adelanta(21000)
  const l = SV.leeServicio(); await asienta(20)
  const mientras = [...orden]
  g.abrir(); await op; await l; await asienta(20); devuelve()
  oraculo('E103-en-la-cola', 'la resolucion del incierto espera su turno en la cola de su sesion: no revierte en mitad de otra operacion',
    mientras.join(',') === 'op-empieza' && orden.join(',') === 'op-empieza,op-termina,revierte', `mientras ${mientras} · al final ${orden}`)
}
{ // el caso de Astra con los hooks reales: parcial incierto y dos lecturas a la vez → 2 lotes, un aviso de revertido
  const sid = 'e103-astra'; b0 = await mesa(sid)
  const pos = b0.abreMercado({ side: 'BUY', entry: 1.097, sl: 1.09, tp: 1.2, lots: 2 })
  db.falla = c => c.tabla === 'rpc:sim_cierre_v0' ? { code: '', message: 'transporte inventado' } : null
  await tr().closePartial(pos.id, 'EUR/USD', .5); await asienta(30); db.falla = null
  ver('astra: el parcial queda incierto', SV.motivoBloqueo() === 'incierto' && lotes(b0) === 1.5)
  db.log.length = 0
  adelanta(21000)
  await Promise.all([SV.leeServicio(), SV.leeServicio()]); await asienta(30); devuelve()
  oraculo('E103-astra', 'el parcial incierto y dos lecturas a la vez: una sola relectura del trade, la posicion en 2 lotes, el saldo en 10000 y desbloqueado',
    db.log.filter(c => c.tabla === 'sim_trades' && c.op === 'select').length === 1 && lotes(b0) === 2 && b0.estado.saldo === 10000 && SV.motivoBloqueo() === null,
    `relecturas ${db.log.filter(c => c.tabla === 'sim_trades').length} · ${cuenta(b0, sid)} · motivo ${SV.motivoBloqueo()}`)
  b0.caja.raiz.desmonta()
}

fin()
