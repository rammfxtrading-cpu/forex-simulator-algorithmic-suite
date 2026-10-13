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
 *
 * Modulos, hooks y pagina REALES sobre los dobles (supabase-falso, react-falso); datos
 * inventados; el orden de entrega lo deciden las puertas del doble (db.pausa). Sin red.
 */
import { titulo, ver, oraculo, fin, escenario, sesionSim, importa, monta, router, vela, nav, db, A, asienta, puerta } from './lib.mjs'
import { velasEnStorage } from './banco-motor.mjs'

const CI = await importa('lib/sim/cierre.js')
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

fin()
