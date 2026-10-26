/**
 * V1C02 · DEL ESTADO DEL SERVIDOR A LA VISTA Y LAS ORDENES COMO COMANDOS (etapa 2 del motor, piezas 2 y 3). Escrita
 * ANTES que el codigo (lib/sim/v1/vista.js y lib/sim/v1/ordenes.js no existen: en rojo).
 *   A · vistaDe(snapshot): el estado del motor (BigInt en {$b}, ticks, centesimas, µUSD) en la forma que pinta la
 *       pantalla de hoy (SessionPanels, posicionTradingView): par 'EUR/USD', side, entry/sl/tp en numero, lots, pips;
 *       las pendientes como BUY_LIMIT/SELL_LIMIT/BUY_STOP/SELL_STOP; saldo en USD; cursor; reto. Cifras a mano.
 *   B · las ordenes de la pantalla como comandos (ordenes.js): abrir a mercado, limit y stop, el tirador (modificar),
 *       cancelar y cerrar total y parcial; precios ajustados al tick y en texto; lotes en texto
 *   C · ida y vuelta contra el SERVIDOR REAL (montaje-v1) con el cliente de la pieza 1: lo que la pantalla manda es lo
 *       que vuelve en la vista confirmada (y nada se pinta antes de la confirmacion)
 *
 * ORDEN 1-125 (f): un avanzar «paso» llega como mucho a 1 minuto de mercado y uno «play» a 100 (lib/sim/v1/topes.mjs; el servidor corta mas alla). Los avances GRANDES de esta prueba van con motivo «goto», el de los avances grandes: fuera del tope de tamaño, el motivo no cambia el calculo del servidor y esta prueba no aplica sim-006 (con sim-004b los tres comparten los 5 s), asi que lo probado no cambia.
 */
import { titulo, ver, oraculo, fin, importa } from '../lib.mjs'
import { hayPostgres } from '../pg-ensayo.mjs'
import { montajeV1, L } from '../montaje-v1.mjs'
import { cerrojoEnMemoria } from '../cerrojo-falso.mjs'
const VI = await importa('lib/sim/v1/vista.js').catch(() => null), OR = await importa('lib/sim/v1/ordenes.js').catch(() => null)
const N = 23
if (!VI?.vistaDe || !OR?.comandoAbrir) { for (let i = 0; i < N; i++) oraculo('V1C02', `caso ${i}: sin lib/sim/v1/vista.js ni ordenes.js no se puede`, false, 'no estan'); fin() }
const C = await importa('lib/sim/v1/cliente.js')
const M = await importa('lib/motor/motor.mjs'), CA = await importa('lib/motor/cartera.mjs'), RE = await importa('lib/motor/reto.mjs')
const { COSTES_1 } = await importa('lib/motor/costes.mjs')
const tx = x => JSON.stringify(x, (k, v) => (typeof v === 'bigint' ? `${v}n` : v))
const T = Date.parse('2026-03-03T10:00:00Z') / 1000
const comoBase = e => JSON.parse(CA.serializa(e))      // lo que guarda la fila (jsonb) y devuelve /api/sim/estado

titulo('A · vistaDe, cifras a mano')
{
  const velas = { EURUSD: M.velas('EURUSD', [{ time: T, open: '1.09997', high: '1.09997', low: '1.09997', close: '1.09997' }]), USDJPY: M.velas('USDJPY', [{ time: T, open: '150.000', high: '150.000', low: '150.000', close: '150.000' }]) }
  let e = CA.crea({ pares: ['EURUSD', 'USDJPY'], costes: COSTES_1, capital: '100000' })
  e = CA.aplica(e, { tipo: 'avanzar', hasta: T }, velas).estado
  e = CA.aplica(e, { tipo: 'abrir', par: 'EURUSD', lado: 'BUY', orden: 'mercado', lotes: '1', sl: '1.09900', tp: '1.10200', cotizadoEn: T }, velas).estado
  e = CA.aplica(e, { tipo: 'abrir', par: 'USDJPY', lado: 'SELL', orden: 'limit', precio: '150.500', lotes: '0.5', sl: '150.800', tp: '150.000' }, velas).estado
  e = CA.aplica(e, { tipo: 'abrir', par: 'EURUSD', lado: 'BUY', orden: 'stop', precio: '1.10100', lotes: '0.01' }, velas).estado
  const v = VI.vistaDe({ version: 7, epoca: 1, estado: comoBase(e) })
  const p = v.posiciones[0], o = v.ordenes[0], s = v.ordenes[1]
  // BUY a mercado: ask = bid 1,09997 + spread 0,3 pip (3 ticks) = 1,10000; SL a 10 pips, TP a 20
  oraculo('V1C02', 'A · la posicion: p1, EUR/USD, BUY, entrada 1,1 (ask), SL 1,099, TP 1,102, 1 lote, 10 y 20 pips, abierta en cursor + 60', p?.id === 'p1' && p.pair === 'EUR/USD' && p.side === 'BUY' && p.entry === 1.1 && p.sl === 1.099 && p.tp === 1.102 && p.lots === 1 && p.slPips === 10 && p.tpPips === 20 && p.openTime === T + 60, tx(p))
  oraculo('V1C02', 'A · la limit: o2, USD/JPY, SELL_LIMIT 150,5, SL 150,8 (30 pips), TP 150 (50 pips), 0,5 lotes', o?.id === 'o2' && o.pair === 'USD/JPY' && o.side === 'SELL_LIMIT' && o.entry === 150.5 && o.sl === 150.8 && o.tp === 150 && o.lots === 0.5 && o.slPips === 30 && o.tpPips === 50 && o.createdTime === T + 60, tx(o))
  oraculo('V1C02', 'A · el stop sin SL ni TP: BUY_STOP 1,101, 0,01 lotes, sl y tp null', s?.id === 'o3' && s.side === 'BUY_STOP' && s.entry === 1.101 && s.lots === 0.01 && s.sl === null && s.tp === null, tx(s))
  oraculo('V1C02', 'A · saldo 99.997 (comision de 3 USD del lote abierto; las pendientes no pagan hasta llenarse), cursor, version, activo', v.saldo === 99997 && v.cursor === T && v.version === 7 && v.estado === 'activo' && v.reto === null, tx({ saldo: v.saldo, cursor: v.cursor, estado: v.estado }))
  oraculo('V1C02', 'A · la cotizacion por par: EUR/USD bid 1,09997 / ask 1,1; USD/JPY bid 150 / ask 150,004', v.cotizaciones['EUR/USD']?.bid === 1.09997 && v.cotizaciones['EUR/USD']?.ask === 1.1 && v.cotizaciones['USD/JPY']?.ask === 150.004, tx(v.cotizaciones))
  // un reto FTMO 2-Step: fase 1, objetivo +10 % del capital
  const r = RE.creaReto({ motor: CA.crea({ pares: ['EURUSD'], costes: COSTES_1, capital: '100000' }), inicio: T })
  const vr = VI.vistaDe({ version: 0, epoca: 1, estado: JSON.parse(RE.serializaReto(r)) })
  oraculo('V1C02', 'A · un reto: fase 1, en curso, capital 100.000, objetivo 110.000; la cartera de dentro da posiciones y saldo', vr.reto?.fase === 1 && vr.reto.estado === 'en_curso' && vr.reto.capital === 100000 && vr.reto.objetivo === 110000 && vr.saldo === 100000 && vr.posiciones.length === 0, tx(vr.reto))
}

titulo('B · las ordenes de la pantalla como comandos')
{
  const m1 = OR.comandoAbrir({ pair: 'EUR/USD', side: 'BUY', lots: 0.1, sl: 1.10000 - 10 * 0.0001, tp: 1.1020000000000001, cursor: T })
  oraculo('V1C02', 'B · a mercado: abrir EURUSD BUY mercado, lotes «0.1», SL y TP ajustados al tick en texto («1.09900», «1.10200»), cotizadoEn el cursor', tx(m1) === tx({ tipo: 'abrir', carga: { par: 'EURUSD', lado: 'BUY', orden: 'mercado', lotes: '0.1', sl: '1.09900', tp: '1.10200', cotizadoEn: T } }), tx(m1))
  const m2 = OR.comandoAbrir({ pair: 'USD/JPY', side: 'SELL_LIMIT', entry: 150.5004, lots: 2, sl: 150.8, tp: null })
  oraculo('V1C02', 'B · limit: orden limit, precio ajustado (150,5004 → «150.500»), sin TP (no se manda), sin cotizadoEn', tx(m2) === tx({ tipo: 'abrir', carga: { par: 'USDJPY', lado: 'SELL', orden: 'limit', lotes: '2', precio: '150.500', sl: '150.800' } }), tx(m2))
  const m3 = OR.comandoAbrir({ pair: 'EUR/USD', side: 'BUY_STOP', entry: 1.10105, lots: 0.01 })
  oraculo('V1C02', 'B · stop: orden stop, 1,10105 → «1.10105», lotes «0.01»', tx(m3) === tx({ tipo: 'abrir', carga: { par: 'EURUSD', lado: 'BUY', orden: 'stop', lotes: '0.01', precio: '1.10105' } }), tx(m3))
  const t1 = OR.comandoTirador({ id: 'p1', type: 'sl', price: 1.0999549, pair: 'EUR/USD' }), t2 = OR.comandoTirador({ id: 'o2', type: 'lim_e', price: 150.4996, pair: 'USD/JPY' }), t3 = OR.comandoTirador({ id: 'o2', type: 'lim_tp', price: 150.1, pair: 'USD/JPY' })
  oraculo('V1C02', 'B · tiradores: modificar sl de p1 (1,0999549 → «1.09995»), precio de o2 (150,4996 → «150.500»), tp de o2', tx([t1, t2, t3]) === tx([{ tipo: 'modificar', carga: { id: 'p1', sl: '1.09995' } }, { tipo: 'modificar', carga: { id: 'o2', precio: '150.500' } }, { tipo: 'modificar', carga: { id: 'o2', tp: '150.100' } }]), tx([t1, t2, t3]))
  oraculo('V1C02', 'B · quitar el SL de una posicion: sl null', tx(OR.comandoQuita({ id: 'p1', que: 'sl' })) === tx({ tipo: 'modificar', carga: { id: 'p1', sl: null } }))
  oraculo('V1C02', 'B · cancelar y cerrar (total y parcial «0.25»)', tx([OR.comandoCancelar('o2'), OR.comandoCerrar('p1'), OR.comandoCerrar('p1', 0.25)]) === tx([{ tipo: 'cancelar', carga: { id: 'o2' } }, { tipo: 'cerrar', carga: { id: 'p1' } }, { tipo: 'cerrar', carga: { id: 'p1', lotes: '0.25' } }]))
  oraculo('V1C02', 'B · lotes que no son de 0,01 o no positivos: error en el cliente (no se manda)', ['0', -1, 0.001, NaN].every(l => { try { OR.comandoAbrir({ pair: 'EUR/USD', side: 'BUY', lots: l, cursor: T }); return false } catch { return true } }))
}

titulo('C · ida y vuelta contra el servidor real')
if (!hayPostgres()) { ver('PostgreSQL 17 local: NO hay', false); fin() }
const P = await importa('lib/mercado/publicador-v1.mjs'), PV = await importa('lib/mercado/publica-v1.mjs')
const { minutoCerrado } = await importa('lib/mercado/calidad.mjs')
const CR = await importa('lib/servidor/crear.mjs'), TO = await importa('lib/servidor/tomar.mjs'), SO = await importa('lib/servidor/sobre.mjs')
const CO = await importa('lib/servidor/comando.mjs'), ES = await importa('lib/servidor/estado.mjs')
const u = k => `00000000-0000-4000-8000-${String(k).padStart(12, '0')}`
const U = iso => Date.parse(iso) / 1000
const m = k => U('2025-01-06T00:00:00Z') + 60 * k
const PX = { AUDCAD: 0.9, AUDUSD: 0.65, EURUSD: 1.1, GBPJPY: 190.5, GBPUSD: 1.3, NZDUSD: 0.6, USDCAD: 1.37, USDCHF: 0.88, USDJPY: 150.2 }
function velasDe(par) { const o = []; for (let t = U('2025-01-06T00:00:00Z'); t < U('2025-01-11T00:00:00Z'); t += 60) if (!minutoCerrado(t)) { const p = PX[par]; o.push({ time: t, open: p, high: p, low: p, close: p, volume: 1 }) } return o }
function almacen() { const o = new Map(); return { o, async lee(r) { return o.has(r) ? Buffer.from(o.get(r)) : null }, async sube(r, b, { upsert = false } = {}) { if (!upsert && o.has(r)) return 'existe'; o.set(r, Buffer.from(b)); return 'ok' }, async borra(r) { o.delete(r) }, async lista() { return [] } } }
const mercado = almacen()
await PV.publica({ cerrojo: cerrojoEnMemoria(), almacen: mercado, planes: SO.PARES.map(par => P.planificaPar({ par, velas: velasDe(par), texto: '', anterior: null, diasAceptados: new Map() })), dueno: 'mercado-v1-publica', ahora: '2026-10-14T09:00:00.000Z' })
const web = () => { const o = new Map(); return { getItem: k => (o.has(k) ? o.get(k) : null), setItem: (k, v) => o.set(k, String(v)), removeItem: k => o.delete(k) } }
const AL = u(1), SID = u(1001)
let nId = 60000
const pg = montajeV1()
try {
  pg.arranca(); pg.base('v2'); pg.alumno('v2', AL)
  const leeSesion = async id => { const t = pg.uno('v2', `select row_to_json(s)::text from public.sim_sessions s where id = ${L(id)}`); return t ? JSON.parse(t) : null }
  const puertos = { almacen: mercado, rpc: pg.rpc('v2'), leeSesion, ahora: () => Date.parse('2026-10-14T10:00:00Z') }
  const orden = { '/api/sim/tomar': TO.ordenTomar, '/api/sim/comando': CO.ordenComando, '/api/sim/estado': ES.ordenEstado }
  const llama = async (ruta, { cuerpo }) => { const r = await orden[ruta]({ actor: AL, cuerpo, puertos }); return { http: r.http, cuerpo: r.cuerpo } }
  const sinTasa = () => pg.uno('v2', 'update public.sim_alumnos set siguiente_avance_desde = null')
  ver('control: sesion creada', (await CR.ordenCrear({ actor: AL, cuerpo: { session_id: SID, command_id: u(2001), epoca: 1, name: 'S', pair: 'EUR/USD', timeframe: 'H1', date_from: '2025-01-06', date_to: '2025-12-31', capital: '100000', challenge_type: null }, puertos })).http === 201)
  const c = C.creaCliente({ sessionId: SID, usuario: AL, epoca: 1, llama, local: web(), sesion: web(), nuevoId: () => u(++nId), plazoMs: 3000, espera429Ms: 5 })
  await c.toma(); await c.leeEstado(); sinTasa()
  const va = (cmd) => c.envia(cmd.tipo, cmd.carga)
  await va({ tipo: 'avanzar', carga: { hasta: m(5), motivo: 'goto' } })
  const vista = () => VI.vistaDe(c.estado)
  const v0 = vista()
  ver('control: el cursor esta en 00:05 y la cotizacion de EUR/USD es 1,1 / 1,10003', v0.cursor === m(5) && v0.cotizaciones['EUR/USD']?.ask === 1.10003, tx({ cursor: v0.cursor, cot: v0.cotizaciones['EUR/USD'] }))
  const r1 = await va(OR.comandoAbrir({ pair: 'EUR/USD', side: 'BUY', lots: 1, sl: 1.10000 - 10 * 0.0001, tp: 1.1020000000000001, cursor: v0.cursor }))
  const p = vista().posiciones[0]
  oraculo('V1C02', 'C · abrir a mercado con SL/TP de coma flotante: confirmado; la vista trae la posicion con entrada 1,10003 (ask), SL 1,099 y TP 1,102', r1.conclusion === 'confirmado' && p?.entry === 1.10003 && p.sl === 1.099 && p.tp === 1.102 && p.lots === 1, tx({ r1: r1.conclusion, p }))
  const r2 = await va(OR.comandoAbrir({ pair: 'EUR/USD', side: 'BUY_LIMIT', entry: 1.0950000000000002, lots: 0.5, sl: 1.094, tp: 1.097 }))
  const o = vista().ordenes[0]
  oraculo('V1C02', 'C · limit: confirmada; en la vista BUY_LIMIT 1,095, 0,5 lotes', r2.conclusion === 'confirmado' && o?.side === 'BUY_LIMIT' && o.entry === 1.095 && o.lots === 0.5, tx({ r2: r2.conclusion, o }))
  const r3 = await va(OR.comandoTirador({ id: p.id, type: 'sl', price: 1.0989549, pair: 'EUR/USD' }))
  oraculo('V1C02', 'C · tirador del SL: confirmado; la vista trae 1,09895', r3.conclusion === 'confirmado' && vista().posiciones[0].sl === 1.09895, tx({ r3: r3.conclusion, sl: vista().posiciones[0].sl }))
  const r4 = await va(OR.comandoTirador({ id: o.id, type: 'lim_e', price: 1.0961249, pair: 'EUR/USD' }))
  oraculo('V1C02', 'C · tirador de la entrada de la limit: 1,09612', r4.conclusion === 'confirmado' && vista().ordenes[0].entry === 1.09612, tx({ r4: r4.conclusion, e: vista().ordenes[0].entry }))
  const r5 = await va(OR.comandoCancelar(o.id))
  oraculo('V1C02', 'C · cancelar: sin pendientes', r5.conclusion === 'confirmado' && vista().ordenes.length === 0, tx(r5.conclusion))
  const r6 = await va(OR.comandoCerrar(p.id, 0.25))
  oraculo('V1C02', 'C · cerrar 0,25: quedan 0,75 lotes', r6.conclusion === 'confirmado' && vista().posiciones[0].lots === 0.75, tx({ r6: r6.conclusion, lots: vista().posiciones[0]?.lots }))
  const r7 = await va(OR.comandoCerrar(p.id))
  const fila = JSON.parse(pg.uno('v2', `select row_to_json(s)::text from public.sim_sessions s where id = ${L(SID)}`))
  // saldo: 100.000 − 3 (comision) − 0,3 pip de spread al salir (bid 1,1 frente a la entrada 1,10003): −3 USD por lote
  oraculo('V1C02', 'C · cerrar el resto: sin posiciones; saldo de la vista = el de la base = 100.000 − 3 − 3 = 99.994', r7.conclusion === 'confirmado' && vista().posiciones.length === 0 && vista().saldo === 99994 && Number(fila.balance) === 99994, tx({ saldo: vista().saldo, balance: fila.balance }))
  const r8 = await va(OR.comandoAbrir({ pair: 'EUR/USD', side: 'BUY', lots: 1, cursor: m(1) }))
  oraculo('V1C02', 'C · a mercado con un cursor viejo: el motor lo rechaza (precio_cambiado) y la vista no cambia', r8.conclusion === 'rechazado' && vista().posiciones.length === 0, tx(r8))
  // nada se pinta antes de confirmar: con la respuesta perdida, la vista sigue sin la posicion hasta recuperar
  const cPerdida = C.creaCliente({ sessionId: SID, usuario: AL, epoca: 1, llama: async (ruta, op) => { const r = await llama(ruta, op); if (op.cuerpo?.tipo === 'abrir') throw new Error('perdida'); return r }, local: web(), sesion: web(), nuevoId: () => u(++nId), plazoMs: 3000, espera429Ms: 5 })
  await cPerdida.toma({ forzar: true }); await cPerdida.leeEstado()
  const r9 = await cPerdida.envia(...Object.values(OR.comandoAbrir({ pair: 'EUR/USD', side: 'SELL', lots: 1, cursor: VI.vistaDe(cPerdida.estado).cursor })))
  oraculo('V1C02', 'C · respuesta perdida: incierto y la vista confirmada sigue sin la posicion (no se pinta lo que no consta)', r9.conclusion === 'incierto' && VI.vistaDe(cPerdida.estado).posiciones.length === 0, tx(r9))
  oraculo('V1C02', 'C · la vista dice la version y si hay ordenes sin confirmar', VI.vistaDe(cPerdida.estado, { pendientes: cPerdida.pendientes() }).sinConfirmar === 1 && VI.vistaDe(c.estado, { pendientes: c.pendientes() }).sinConfirmar === 0)
} finally { pg.cierra() }
fin()
