/**
 * V1C03 · PARES OCULTOS, BREACH Y RETO EN LA PANTALLA V1 (etapa 2 del motor, pieza 5, lo que no depende del Step/Play).
 * Escrita ANTES que el codigo: /api/sim/estado no trae valoracion, vista.js no la lee, no hay lib/sim/v1/reto.js ni
 * cliente.pasaFase (en rojo).
 *   A · /api/sim/estado añade la VALORACION que calcula el motor en el servidor (la pantalla no convierte ni suma
 *       nada): equity, flotante de cada posicion, margen usado, los limites del reto y sus reglas (dias minimos, fases,
 *       objetivo). La vista la enseña: equity y p.flotante
 *   B · pares ocultos: una posicion de GBPUSD en una sesion cuyo par visible es EUR/USD salta su SL en el servidor sin
 *       que la pantalla cargue velas de GBPUSD; la vista confirmada ya no la tiene y el saldo baja (cifras a mano)
 *   C · el reto en el HUD (evaluacionV1, la forma de /api/challenge/status que pintan el HUD y los modales):
 *       activo con su objetivo, DD diario y total en vivo y dias; breach diario → failed_dd_daily
 *   D · pasar de fase por /api/sim/avanzar-fase con el cliente: fase_no_superada en curso; superada → la hija (fase 2)
 * Mercado inventado: EURUSD 1,1 y GBPUSD 1,3 hasta el minuto 10 del 6-ene-2025; desde el 10, 1,09 y 1,29.
 *
 * ORDEN 1-125 (f): un avanzar «paso» llega como mucho a 1 minuto de mercado y uno «play» a 100 (lib/sim/v1/topes.mjs; el servidor corta mas alla). Los avances GRANDES de esta prueba van con motivo «goto», el de los avances grandes: fuera del tope de tamaño, el motivo no cambia el calculo del servidor y esta prueba no aplica sim-006 (con sim-004b los tres comparten los 5 s), asi que lo probado no cambia.
 */
import { titulo, ver, oraculo, fin, importa } from '../lib.mjs'
import { hayPostgres } from '../pg-ensayo.mjs'
import { montajeV1, L } from '../montaje-v1.mjs'
import { cerrojoEnMemoria } from '../cerrojo-falso.mjs'
const VI = await importa('lib/sim/v1/vista.js'), C = await importa('lib/sim/v1/cliente.js'), OR = await importa('lib/sim/v1/ordenes.js')
const RT = await importa('lib/sim/v1/reto.js').catch(() => null)
const N = 14
if (!RT?.evaluacionV1) { for (let i = 0; i < N; i++) oraculo('V1C03', `caso ${i}: sin lib/sim/v1/reto.js no se puede`, false, 'no esta'); fin() }
if (!hayPostgres()) { ver('PostgreSQL 17 local: NO hay', false); fin() }
const P = await importa('lib/mercado/publicador-v1.mjs'), PV = await importa('lib/mercado/publica-v1.mjs')
const { minutoCerrado } = await importa('lib/mercado/calidad.mjs')
const CR = await importa('lib/servidor/crear.mjs'), TO = await importa('lib/servidor/tomar.mjs'), SO = await importa('lib/servidor/sobre.mjs')
const CO = await importa('lib/servidor/comando.mjs'), ES = await importa('lib/servidor/estado.mjs'), FA = await importa('lib/servidor/fase.mjs')
const CA = await importa('lib/motor/cartera.mjs')
const u = k => `00000000-0000-4000-8000-${String(k).padStart(12, '0')}`
const U = iso => Date.parse(iso) / 1000
const M0 = U('2025-01-06T00:00:00Z'), m = k => M0 + 60 * k
const tx = x => JSON.stringify(x, (k, v) => (typeof v === 'bigint' ? `${v}n` : v))
const PX = { AUDCAD: 0.9, AUDUSD: 0.65, EURUSD: 1.1, GBPJPY: 190.5, GBPUSD: 1.3, NZDUSD: 0.6, USDCAD: 1.37, USDCHF: 0.88, USDJPY: 150.2 }
const CAIDA = { EURUSD: 1.09, GBPUSD: 1.29 }
function velasDe(par) { const o = []; for (let t = M0; t < U('2025-01-11T00:00:00Z'); t += 60) if (!minutoCerrado(t)) { const p = t >= m(10) && CAIDA[par] ? CAIDA[par] : PX[par]; o.push({ time: t, open: p, high: p, low: p, close: p, volume: 1 }) } return o }
function almacen() { const o = new Map(); return { o, async lee(r) { return o.has(r) ? Buffer.from(o.get(r)) : null }, async sube(r, b, { upsert = false } = {}) { if (!upsert && o.has(r)) return 'existe'; o.set(r, Buffer.from(b)); return 'ok' }, async borra(r) { o.delete(r) }, async lista() { return [] } } }
const mercado = almacen()
await PV.publica({ cerrojo: cerrojoEnMemoria(), almacen: mercado, planes: SO.PARES.map(par => P.planificaPar({ par, velas: velasDe(par), texto: '', anterior: null, diasAceptados: new Map() })), dueno: 'mercado-v1-publica', ahora: '2026-10-14T09:00:00.000Z' })
const web = () => { const o = new Map(); return { getItem: k => (o.has(k) ? o.get(k) : null), setItem: (k, v) => o.set(k, String(v)), removeItem: k => o.delete(k) } }
const AL = u(1)
let nId = 70000
const pg = montajeV1()
try {
  pg.arranca()
  async function sesion(d, sid, reto = null) {
    pg.base(d); pg.alumno(d, AL)
    const leeSesion = async id => { const t = pg.uno(d, `select row_to_json(s)::text from public.sim_sessions s where id = ${L(id)}`); return t ? JSON.parse(t) : null }
    const puertos = { almacen: mercado, rpc: pg.rpc(d), parDeId: pg.parDeId(d), leeSesion, ahora: () => Date.parse('2026-10-14T10:00:00Z') }
    const orden = { '/api/sim/tomar': TO.ordenTomar, '/api/sim/comando': CO.ordenComando, '/api/sim/estado': ES.ordenEstado, '/api/sim/avanzar-fase': FA.ordenFase }
    const llama = async (ruta, { cuerpo }) => { const r = await orden[ruta]({ actor: AL, cuerpo, puertos }); return { http: r.http, cuerpo: r.cuerpo } }
    ver(`control (${d}): sesion creada`, (await CR.ordenCrear({ actor: AL, cuerpo: { session_id: sid, command_id: u(++nId), epoca: 1, name: 'S', pair: 'EUR/USD', timeframe: 'H1', date_from: '2025-01-06', date_to: '2025-12-31', capital: '100000', challenge_type: reto }, puertos })).http === 201)
    const c = C.creaCliente({ sessionId: sid, usuario: AL, epoca: 1, llama, local: web(), sesion: web(), nuevoId: () => u(++nId), plazoMs: 3000, espera429Ms: 5 })
    await c.toma(); await c.leeEstado()
    const sinTasa = () => pg.uno(d, 'update public.sim_alumnos set siguiente_avance_desde = null')
    const avanza = async hasta => { sinTasa(); return c.envia('avanzar', { hasta, motivo: 'goto' }) }
    const envia = x => c.envia(x.tipo, x.carga)
    return { c, avanza, envia, puertos, fila: id => leeSesion(id ?? sid), uno: q => pg.uno(d, q) }
  }

  titulo('A–B · valoracion del servidor y pares ocultos (practica, par visible EUR/USD)')
  const S1 = u(1001), s = await sesion('o1', S1)
  await s.avanza(m(5))
  ver('control: abre EURUSD y GBPUSD', (await s.envia(OR.comandoAbrir({ pair: 'EUR/USD', side: 'BUY', lots: 1, cursor: m(5) }))).conclusion === 'confirmado' && (await s.envia(OR.comandoAbrir({ pair: 'GBP/USD', side: 'BUY', lots: 1, sl: 1.295, cursor: m(5) }))).conclusion === 'confirmado')
  const e1 = await ES.ordenEstado({ actor: AL, cuerpo: { session_id: S1 }, puertos: s.puertos })
  // a las 00:05: EURUSD bid 1,1 (entrada ask 1,10003: −3), GBPUSD bid 1,3 (entrada 1,30006: −6); saldo 100.000 − 6 de comision
  oraculo('V1C03', 'A · /api/sim/estado trae la valoracion del motor: equity 99.985 (99.994 − 3 − 6), flotantes −3 y −6, margen usado', e1.cuerpo?.valoracion?.equity_µ === String(99985_000000n) && e1.cuerpo.valoracion.flotante_µ?.p1 === String(-3_000000n) && e1.cuerpo.valoracion.flotante_µ?.p2 === String(-6_000000n) && Number(e1.cuerpo.valoracion.margen_usado_µ) > 0, tx(e1.cuerpo?.valoracion))
  await s.c.leeEstado()
  const v1 = VI.vistaDe(s.c.estado)
  oraculo('V1C03', 'A · la vista la enseña: equity 99.985, flotante de cada posicion (−3 y −6)', v1.equity === 99985 && v1.posiciones.find(p => p.id === 'p1')?.flotante === -3 && v1.posiciones.find(p => p.id === 'p2')?.flotante === -6, tx({ equity: v1.equity, f: v1.posiciones.map(p => p.flotante) }))
  oraculo('V1C03', 'B · delPar: la pantalla de EUR/USD pinta solo su posicion; la de GBP/USD esta en la vista', VI.delPar(v1, 'EUR/USD').posiciones.length === 1 && VI.delPar(v1, 'GBP/USD').posiciones.length === 1 && v1.posiciones.length === 2)
  await s.avanza(m(12))
  const v2 = VI.vistaDe(s.c.estado)
  // GBPUSD abre en 1,29 en el minuto 10 (hueco bajo su SL 1,295): salta ahi; −1.006 (1,29 − 1,30006). EURUSD sigue: 1,09 − 1,10003 = −1.003
  oraculo('V1C03', 'B · el SL de GBPUSD salta en el servidor (la pantalla no cargo sus velas): ya no esta; saldo 99.994 − 1.006 = 98.988', !v2.posiciones.some(p => p.pair === 'GBP/USD') && v2.saldo === 98988, tx({ pos: v2.posiciones.map(p => p.pair), saldo: v2.saldo }))
  oraculo('V1C03', 'B · y la de EURUSD sigue con su flotante −1.003; equity 97.985', v2.posiciones[0]?.flotante === -1003 && v2.equity === 97985, tx({ f: v2.posiciones[0]?.flotante, eq: v2.equity }))
  const tr = Number(s.uno(`select count(*) from public.sim_trades where session_id = ${L(S1)} and pair = 'GBP/USD'`))
  oraculo('V1C03', 'B · la base tiene el trade de GBP/USD (lo que pinta la lista de operaciones)', tr === 1, String(tr))

  titulo('C · el reto en el HUD (2F, FTMO)')
  const S2 = u(2002), r = await sesion('o2', S2, '2F')
  await r.avanza(m(5))
  const h0 = RT.evaluacionV1(VI.vistaDe(r.c.estado))
  oraculo('V1C03', 'C · al empezar: active, fase 1, objetivo 10.000 (10 %), DD diario 5.000 y total 10.000 de margen, 0 de 4 dias', h0?.status === 'active' && h0.phase === 1 && h0.targetUSD === 10000 && h0.targetPct === 10 && h0.ddDailyCapUSD === 5000 && h0.ddTotalCapUSD === 10000 && h0.diasTrading === 0 && h0.diasMinimos === 4, tx(h0))
  await r.envia(OR.comandoAbrir({ pair: 'EUR/USD', side: 'BUY', lots: 1, cursor: m(5) }))
  await r.avanza(m(12))
  const h1 = RT.evaluacionV1(VI.vistaDe(r.c.estado))
  // saldo 99.997 (comision); equity 99.997 − 1.003 = 98.994; DD en vivo 100.000 − 98.994 = 1.006; quedan 110.000 − 99.997
  oraculo('V1C03', 'C · con la posicion en −1.003: balance 99.997, equity 98.994, DD diario y total en vivo 1.006, faltan 10.003, 1 dia', h1?.status === 'active' && h1.balanceNow === 99997 && h1.equity === 98994 && h1.ddDailyCurrentUSD === 1006 && h1.ddTotalCurrentUSD === 1006 && h1.targetRemainingUSD === 10003 && h1.diasTrading === 1, tx(h1))
  const S3 = u(3003), b = await sesion('o3', S3, '2F')
  await b.avanza(m(5))
  await b.envia(OR.comandoAbrir({ pair: 'EUR/USD', side: 'BUY', lots: 6, cursor: m(5) }))
  await b.avanza(m(12))
  const hb = RT.evaluacionV1(VI.vistaDe(b.c.estado)), vb = VI.vistaDe(b.c.estado)
  // 6 lotes: comision 18; en el hueco a 1,09: 6 × (1,09 − 1,10003) = −6.018 → equity 93.964 < 95.000 (diario), > 90.000 (total)
  oraculo('V1C03', 'C · breach diario: failed_dd_daily, motivo perdida_diaria, sin posiciones, estado breach', hb?.status === 'failed_dd_daily' && hb.failureReason === 'perdida_diaria' && vb.posiciones.length === 0 && vb.reto?.estado === 'breach', tx({ hb, estado: vb.reto?.estado }))
  oraculo('V1C03', 'C · tras el breach el saldo es 100.000 − 18 − 6.018 = 93.964', hb?.balanceNow === 93964, String(hb?.balanceNow))

  titulo('D · pasar de fase')
  const d0 = await r.c.pasaFase({ hijaId: u(4004) })
  oraculo('V1C03', 'D · en curso: fase_no_superada (sin hija)', d0?.conclusion === 'fase_no_superada' && !(await r.fila(u(4004))), tx(d0))
  // la fase 1 superada, escrita en la base como la dejaria el motor (sin posiciones, saldo ≥ objetivo)
  const S5 = u(5005), f = await sesion('o4', S5, '2F')
  await f.avanza(m(5))
  const fila = await f.fila()
  const est = CA.deserializa(JSON.stringify(fila.estado))
  est.motor.saldo_µ = 110500_000000n; est.estado = 'superada'; est.superada = { saldo_µ: 110500_000000n, dias: 4, en: { t: m(5) } }; est.dias_con_apertura = ['2025-01-01', '2025-01-02', '2025-01-03', '2025-01-06']
  f.uno(`update public.sim_sessions set estado = ${L(JSON.parse(CA.serializa(est)))}::jsonb where id = ${L(S5)}`)
  // la version no cambia con la escritura de la prueba: la vista se lee del endpoint, tal cual
  const es = await ES.ordenEstado({ actor: AL, cuerpo: { session_id: S5 }, puertos: f.puertos })
  ver('control: el endpoint ve la fase superada', es.cuerpo?.estado?.estado === 'superada', tx(es.cuerpo?.estado?.estado))
  const hs = RT.evaluacionV1(VI.vistaDe(es.cuerpo))
  oraculo('V1C03', 'D · superada: el HUD dice target_reached y que se puede pasar de fase', hs?.status === 'target_reached' && hs.puedePasarFase === true, tx(hs))
  const d1 = await f.c.pasaFase({ hijaId: u(6006) })
  const hija = await f.fila(u(6006))
  oraculo('V1C03', 'D · pasar de fase: confirmado; la hija existe, es fase 2 del mismo reto, con su padre', d1?.conclusion === 'confirmado' && hija?.estado?.fase === 2 && hija.challenge_parent_id === S5, tx({ d1, fase: hija?.estado?.fase, padre: hija?.challenge_parent_id }))
  const d2 = await f.c.pasaFase({ hijaId: u(6006) })
  oraculo('V1C03', 'D · repetirlo (misma hija, otra clave): una respuesta (no incierto) y ninguna hija mas', d2?.conclusion && d2.conclusion !== 'incierto' && Number(f.uno(`select count(*) from public.sim_sessions where challenge_parent_id = ${L(S5)}`)) === 1, tx(d2))
} finally { pg.cierra() }
fin()
