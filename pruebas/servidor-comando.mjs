/**
 * ETAPA 3 · EL COMANDO (diseño sim-004 b.1, b.2, e.1, e.3, S4-04; persistencia § 4, § 6;
 * decisiones del CTO del 14-oct sobre spread_micro y la conversion, q.4 y q.5).
 * Escrito ANTES que el codigo (contra 7d4939e: en rojo).
 *
 *   1 la intencion de cada tipo, cerrada (422 carga_invalida con «en»); el sobre
 *     canonico normaliza los precios a ticks ('1.1' = '1.10000');
 *   2 spread_micro, a mano y aparte del codigo (costes@1: EURUSD 3 ticks, USDJPY 4,
 *     GBPJPY 14, AUDCAD 12; unidades = lotes × 100.000):
 *       EURUSD 1 lote, USD cotizado               3 × 10⁻⁵ × 100.000           = 3          → 3.000.000
 *       USDJPY 1 lote, USDJPY 150,000             4 × 10⁻³ × 100.000 / 150     = 2,6666…    → 2.666.667
 *       GBPJPY 1 lote, USDJPY 150,000             14 × 10⁻³ × 100.000 / 150    = 9,3333…    → 9.333.333
 *       AUDCAD 1 lote, USDCAD 1,37000             12 × 10⁻⁵ × 100.000 / 1,37   = 8,759124…  → 8.759.124
 *       mitad exacta: GBPJPY 0,01, USDJPY 358,400 14 × 10⁻³ × 1.000 / 358,4    = 0,0390625  → 39.062,5 → 39.062 (al par)
 *       parcial: USDJPY 0,25 de 1, USDJPY 150,000 4 × 10⁻³ × 25.000 / 150      = 0,6666…    → 666.667
 *         (redondear por lote y multiplicar daria 2.666.667 × 0,25 = 666.666,75: otro numero)
 *   3 contra sim_comando REAL (montaje-v1): practica de los nueve pares; abrir, cerrar
 *     parcial, avanzar con SL; los trades v1 con *_micro, conversion y spread_micro;
 *     el saldo de la fila = el del estado;
 *     respuesta perdida (A18: el mismo recibo, una sola comision), misma clave con
 *     otro sobre (A21: 409), conflicto, comando_caducado, 429, dos pestañas (A19:
 *     sin_arrendamiento), 40P01 (reintento con la misma clave, un solo recibo),
 *     410 tras borrar (A24), la sesion de otro alumno (A23: 404), estado en el cuerpo
 *     (A23: 422), el mercado fijado que falta (A26: 503 sin llamar a la RPC);
 *   4 neto y saldo IDENTICOS con y sin spread_micro (otro spread_micro → mismo saldo,
 *     mismo neto_micro, mismo pnl);
 *   5 POST /api/sim/comando: apagado sin el interruptor; de punta a punta.
 */
import { cerrojoEnMemoria } from './cerrojo-falso.mjs'
import { titulo, ver, oraculo, fin, importa, escenario, perfil, tok, db } from './lib.mjs'
import { llama } from './supabase-falso.mjs'
import { hayPostgres } from './pg-ensayo.mjs'
import { montajeV1, L } from './montaje-v1.mjs'
const P = await importa('lib/mercado/publicador-v1.mjs')
const PV = await importa('lib/mercado/publica-v1.mjs')
const { minutoCerrado } = await importa('lib/mercado/calidad.mjs')
const CR = await importa('lib/servidor/crear.mjs'), TO = await importa('lib/servidor/tomar.mjs'), SO = await importa('lib/servidor/sobre.mjs')
let CO = null
try { CO = await importa('lib/servidor/comando.mjs') } catch { CO = null }
const u = k => `00000000-0000-4000-8000-${String(k).padStart(12, '0')}`
const AHORA = Date.parse('2026-10-14T10:00:00Z')
const U = iso => Date.parse(iso) / 1000
const M0 = U('2025-01-06T00:00:00Z')
const m = k => M0 + 60 * k
let nCmd = 5000
const cmd = (o = {}) => ({ session_id: u(1001), command_id: u(++nCmd), epoca: 1, cliente_id: 'pestana-1', ...o })
const tx = x => JSON.stringify(x, (k, v) => (typeof v === 'bigint' ? `${v}n` : v))
const canon = o => (o && typeof o === 'object' ? Object.fromEntries(Object.keys(o).sort().map(k => [k, o[k]])) : o)

titulo('1 · la intencion')
const vc = c => (CO ? CO.validaComando(c) : { ok: null })
const T64 = 'a'.repeat(64)
const ab = o => cmd({ tipo: 'abrir', version_esperada: 1, testigo: T64, par: 'EURUSD', lado: 'BUY', orden: 'mercado', lotes: '1', cotizadoEn: m(10), ...o })
oraculo('COMA', 'abrir a mercado valido', vc(ab()).ok === true, tx(vc(ab())))
for (const [que, c, en] of [
  ['saldo en el cuerpo (A23)', ab({ saldo: '1' }), 'saldo'],
  ['estado en el cuerpo (A23)', ab({ estado: {} }), 'estado'],
  ['tipo desconocido', ab({ tipo: 'borrar' }), 'tipo'],
  ['testigo que no es 64 hex', ab({ testigo: 'x' }), 'testigo'],
  ['version_esperada negativa', ab({ version_esperada: -1 }), 'version_esperada'],
  ['par desconocido', ab({ par: 'EURGBP' }), 'par'],
  ['lado desconocido', ab({ lado: 'LONG' }), 'lado'],
  ['lotes con tres decimales', ab({ lotes: '0.001' }), 'lotes'],
  ['mercado sin cotizadoEn', ab({ cotizadoEn: undefined }), 'cotizadoEn'],
  ['mercado con precio', ab({ precio: '1.1' }), 'precio'],
  ['limit sin precio', ab({ orden: 'limit', cotizadoEn: undefined }), 'precio'],
  ['precio fuera de la rejilla', ab({ orden: 'limit', cotizadoEn: undefined, precio: '1.100001' }), 'precio'],
  ['sl que no es un precio', ab({ sl: 'abc' }), 'sl'],
  ['cerrar sin id', cmd({ tipo: 'cerrar', version_esperada: 1, testigo: T64 }), 'id'],
  ['cancelar una posicion', cmd({ tipo: 'cancelar', version_esperada: 1, testigo: T64, id: 'p1' }), 'id'],
  ['modificar sin nada que cambiar', cmd({ tipo: 'modificar', version_esperada: 1, testigo: T64, id: 'p1' }), 'id'],
  ['avanzar sin hasta', cmd({ tipo: 'avanzar', version_esperada: 1, testigo: T64, motivo: 'paso' }), 'hasta'],
  ['avanzar con motivo raro', cmd({ tipo: 'avanzar', version_esperada: 1, testigo: T64, hasta: m(5), motivo: 'salto' }), 'motivo'],
  ['checkpoint con carga', cmd({ tipo: 'checkpoint', version_esperada: 1, testigo: T64, hasta: m(5) }), 'hasta'],
]) {
  const r = vc(c)
  oraculo('COMA', `${que}: 422 carga_invalida en «${en}»`, r.ok === false && r.http === 422 && r.motivo === 'carga_invalida' && r.en === en, tx(r))
}
const s1 = CO ? CO.sobreComando(vc(ab({ orden: 'limit', cotizadoEn: undefined, precio: '1.1', sl: '1.09' })).intencion) : null
const s2 = CO ? CO.sobreComando(vc(ab({ orden: 'limit', cotizadoEn: undefined, precio: '1.10000', sl: '1.09000', par: 'EUR/USD' })).intencion) : null
oraculo('COMA', 'el sobre normaliza par y precios ("EUR/USD" = "EURUSD", "1.1" = "1.10000") y no lleva clave, version, testigo ni pestaña', s1 && s1 === s2 && JSON.parse(s1).tipo === 'abrir' && !/command_id|version|testigo|cliente_id|epoca/.test(s1), s1)

titulo('2 · spread_micro, a mano')
const sp = o => (CO ? CO.spreadMicro(o) : null)
const CASOS = [
  ['EURUSD 1 lote (USD cotizado)', { par: 'EURUSD', spreadTicks: 3n, lotesC: 100n, conversion: null }, 3_000_000n],
  ['USDJPY 1 lote a 150,000', { par: 'USDJPY', spreadTicks: 4n, lotesC: 100n, conversion: { par: 'USDJPY', valor: 150000n } }, 2_666_667n],
  ['GBPJPY 1 lote con USDJPY 150,000', { par: 'GBPJPY', spreadTicks: 14n, lotesC: 100n, conversion: { par: 'USDJPY', valor: 150000n } }, 9_333_333n],
  ['AUDCAD 1 lote con USDCAD 1,37000', { par: 'AUDCAD', spreadTicks: 12n, lotesC: 100n, conversion: { par: 'USDCAD', valor: 137000n } }, 8_759_124n],
  ['mitad exacta: GBPJPY 0,01 con USDJPY 358,400 → 39.062,5 → 39.062 (al par)', { par: 'GBPJPY', spreadTicks: 14n, lotesC: 1n, conversion: { par: 'USDJPY', valor: 358400n } }, 39_062n],
  ['parcial: USDJPY 0,25 a 150,000', { par: 'USDJPY', spreadTicks: 4n, lotesC: 25n, conversion: { par: 'USDJPY', valor: 150000n } }, 666_667n],
]
for (const [que, o, esperado] of CASOS) { const r = sp(o); oraculo('SPRD', `${que}: ${esperado}`, r === esperado, tx(r)) }

// ── el mercado: los nueve pares; EURUSD cae en el minuto 30 ──
const PX = { AUDCAD: '0.90000', AUDUSD: '0.65000', EURUSD: '1.10000', GBPJPY: '190.500', GBPUSD: '1.30000', NZDUSD: '0.60000', USDCAD: '1.37000', USDCHF: '0.88000', USDJPY: '150.200' }
const ovhl = (par, t) => {
  if (par === 'EURUSD' && t === m(30)) return [1.1, 1.1, 1.09, 1.09]
  if (par === 'EURUSD' && t > m(30)) return [1.09, 1.09, 1.09, 1.09]
  const p = Number(PX[par]); return [p, p, p, p]
}
function velas(par) { const o = []; for (let t = U('2025-01-06T00:00:00Z'); t < U('2025-01-11T00:00:00Z'); t += 60) if (!minutoCerrado(t)) { const [a, h, l, c] = ovhl(par, t); o.push({ time: t, open: a, high: h, low: l, close: c, volume: 1 }) } return o }
function almacen() { const o = new Map(), registro = []; return { o, registro, async lee(r) { registro.push(r); return o.has(r) ? Buffer.from(o.get(r)) : null }, async sube(r, b, { upsert = false } = {}) { if (!upsert && o.has(r)) return 'existe'; o.set(r, Buffer.from(b)); return 'ok' }, async borra(r) { o.delete(r) }, async lista() { return [] } } }
const mercado = almacen()
const planes = SO.PARES.map(par => P.planificaPar({ par, velas: velas(par), texto: '', anterior: null, diasAceptados: new Map() }))
ver('control: los nueve pares publican', planes.every(p => p.estado === 'publica'), planes.map(p => p.estado + ' ' + (p.incidente ?? '')).join())
await PV.publica({ cerrojo: cerrojoEnMemoria(), almacen: mercado, planes, dueno: 'mercado-v1-publica', ahora: '2026-10-14T09:00:00.000Z' })

if (!hayPostgres()) { ver('PostgreSQL 17 local: NO hay; la parte contra la RPC real no se ha ejecutado', false); fin() }
const pg = montajeV1()
try {
  pg.arranca()
  const AL = u(1), OT = u(2)
  const leeSesion = d => async id => { const t = pg.uno(d, `select row_to_json(s)::text from public.sim_sessions s where id = ${L(id)}`); return t ? JSON.parse(t) : null }
  const monta = (d, extra = {}) => {
    pg.base(d); pg.alumno(d, AL); pg.alumno(d, OT)
    return { almacen: mercado, rpc: pg.rpc(d), leeSesion: leeSesion(d), ahora: () => AHORA, ...extra }
  }
  const crear = (k, actor, puertos, o = {}) => CR.ordenCrear({ actor, cuerpo: { session_id: u(1000 + k), command_id: u(2000 + k), epoca: 1, name: 'S' + k, pair: 'EUR/USD', timeframe: 'H1', date_from: '2025-01-06', date_to: '2025-12-31', capital: '100000', challenge_type: null, ...o }, puertos })
  const tomaDe = async (puertos, actor = AL, o = {}) => (await TO.ordenTomar({ actor, cuerpo: { session_id: u(1001), command_id: u(++nCmd), epoca: 1, cliente_id: 'pestana-1', forzar: true, ...o }, puertos })).cuerpo?.testigo
  const ordena = (puertos, c, actor = AL) => (CO ? CO.ordenComando({ actor, cuerpo: c, puertos }) : Promise.resolve({ http: null, cuerpo: null }))
  const sinTasa = d => pg.uno(d, 'update public.sim_alumnos set siguiente_avance_desde = null')
  const version = d => Number(pg.uno(d, `select version from public.sim_sessions where id = '${u(1001)}'`))

  // el guion de la practica, sobre una base: devuelve lo que pasa en cada paso
  async function guion(d, puertos) {
    ver(`control (${d}): sesion creada`, (await crear(1, AL, puertos)).http === 201)
    const testigo = await tomaDe(puertos)
    const r = {}
    sinTasa(d)
    r.av1 = await ordena(puertos, cmd({ tipo: 'avanzar', version_esperada: 0, testigo, hasta: m(10), motivo: 'paso' }))
    r.cursor1 = JSON.parse(pg.uno(d, `select estado::text from public.sim_sessions where id = '${u(1001)}'`)).reloj?.cursor
    r.abEU = cmd({ tipo: 'abrir', version_esperada: 1, testigo, par: 'EURUSD', lado: 'BUY', orden: 'mercado', lotes: '1', cotizadoEn: m(10), sl: '1.09500' })
    r.ab1 = await ordena(puertos, r.abEU)
    r.ab2 = await ordena(puertos, cmd({ tipo: 'abrir', version_esperada: 2, testigo, par: 'USDJPY', lado: 'BUY', orden: 'mercado', lotes: '1', cotizadoEn: m(10) }))
    r.ce = await ordena(puertos, cmd({ tipo: 'cerrar', version_esperada: 3, testigo, id: 'p2', lotes: '0.25' }))
    sinTasa(d)
    r.av2 = await ordena(puertos, cmd({ tipo: 'avanzar', version_esperada: 4, testigo, hasta: m(40), motivo: 'play' }))
    r.testigo = testigo
    return r
  }
  titulo('3 · contra sim_comando REAL')
  const d = 'k1', pu = monta(d)
  const g = await guion(d, pu)
  oraculo('COMA', 'avanzar: 200, version 1, recibo ultimo_avance, el cursor del estado en el minuto 10', g.av1.http === 200 && g.av1.cuerpo?.version === 1 && g.av1.cuerpo.recibo?.clase === 'ultimo_avance' && g.cursor1 === m(10), tx({ av1: g.av1, cursor: g.cursor1 }))
  oraculo('COMA', 'abrir EURUSD y USDJPY: 200, versiones 2 y 3, recibos economicos con su fill', g.ab1.http === 200 && g.ab1.cuerpo?.version === 2 && g.ab2.cuerpo?.version === 3 && g.ab1.cuerpo.recibo?.clase === 'economico' && pg.uno(d, `select count(*) from public.sim_eventos where tipo = 'fill'`) === '2', tx({ a: g.ab1, b: g.ab2 }).slice(0, 500))
  const tr = JSON.parse(pg.uno(d, `select coalesce(json_agg(row_to_json(t) order by t.closed_at, t.lots), '[]')::text from (select pair, side, lots::text, entry_price::text, exit_price::text, sl_price::text, pnl::text, result, opened_at, closed_at, motor_version, evento_id is not null as con_evento, bruto_micro, neto_micro, comision_micro, spread_micro, swap_micro, conversion, ambigua from public.sim_trades) t`))
  const jp = tr.find(t => t.pair === 'USD/JPY'), eu = tr.find(t => t.pair === 'EUR/USD')
  oraculo('COMA', 'cerrar 0,25 de USDJPY: un trade v1, 0,25 lotes, entrada 150,204 (el ask), conversion { USDJPY, minuto 11, fase null, 150200 }', g.ce.http === 200 && jp?.lots === '0.25' && jp.entry_price === '150.20400' && jp.motor_version === 1 && jp.con_evento && tx(canon(jp.conversion)) === tx(canon({ par: 'USDJPY', minuto: m(11), fase: null, valor: '150200' })), tx({ ce: g.ce, jp }).slice(0, 700))
  oraculo('SPRD', 'por la RPC real: spread_micro del parcial de USDJPY (0,25 a 150,200) = 100 JPY / 150,2 = 0,665779 → 665.779', jp?.spread_micro === 665779, tx(jp?.spread_micro))
  oraculo('COMA', 'avanzar con el SL de EURUSD dentro: recibo economico; el trade del SL a 1,09500, conversion null, spread_micro 3.000.000, swap 0', g.av2.http === 200 && g.av2.cuerpo?.recibo?.clase === 'economico' && eu?.exit_price === '1.09500' && eu.conversion === null && eu.spread_micro === 3000000 && eu.swap_micro === 0 && eu.result === 'LOSS', tx({ av2: g.av2, eu }).slice(0, 700))
  const est = JSON.parse(pg.uno(d, `select estado::text from public.sim_sessions where id = '${u(1001)}'`))
  const bal = pg.uno(d, `select balance::text from public.sim_sessions where id = '${u(1001)}'`)
  const saldo = BigInt(est.saldo_µ?.$b ?? 'NaN')
  // µUSD → decimal sin ceros de mas (como lo guarda numeric sin escala)
  const dec = x => { const s = (x < 0n ? -x : x).toString().padStart(7, '0'); const e = s.slice(0, -6), f = s.slice(-6).replace(/0+$/, ''); return (x < 0n ? '-' : '') + e + (f ? '.' + f : '') }
  oraculo('COMA', 'el saldo de la fila es el del estado (µUSD exactos) = capital − 6 USD de comision (dos lotes abiertos) + Σ bruto_micro', bal === dec(saldo) && saldo === 100_000_000_000n - 6_000_000n + BigInt(tr.reduce((a, t) => a + t.bruto_micro, 0)), tx({ bal, saldo: String(saldo), brutos: tr.map(t => t.bruto_micro) }))

  const fila = dd => pg.uno(dd, `select string_agg(pair || ' ' || lots || ' ' || neto_micro || ' ' || bruto_micro || ' ' || pnl || ' ' || comision_micro, ' | ' order by closed_at, lots) || ' · ' || (select balance::text from public.sim_sessions where id = '${u(1001)}') from public.sim_trades`)
  const filaGuion = fila(d)   // tras el guion, antes de lo demas (A24 la borra)
  // A18: respuesta perdida → el mismo comando otra vez
  const v0 = version(d)
  const rep = await ordena(pu, g.abEU)
  oraculo('COMA', 'A18 · el mismo comando otra vez (ACK perdido): 200 repetido, el mismo recibo, sin version nueva y una sola comision', rep.http === 200 && rep.cuerpo?.repetido === true && rep.cuerpo.recibo?.id === g.ab1.cuerpo?.recibo?.id && version(d) === v0 && pg.uno(d, `select count(*) from public.sim_eventos where tipo = 'fill' and datos->>'par' = 'EURUSD'`) === '1', tx(rep).slice(0, 300))
  const otro = await ordena(pu, { ...g.abEU, lotes: '2', version_esperada: v0 })
  oraculo('COMA', 'A21 · la misma clave con otro sobre: 409 clave_reutilizada', otro.http === 409 && otro.cuerpo?.motivo === 'clave_reutilizada', tx(otro))
  const conf = await ordena(pu, cmd({ tipo: 'abrir', version_esperada: v0 - 1, testigo: g.testigo, par: 'EURUSD', lado: 'SELL', orden: 'mercado', lotes: '1', cotizadoEn: m(40) }))
  oraculo('COMA', 'una version vieja: 409 conflicto con la vigente, nada escrito', conf.http === 409 && conf.cuerpo?.motivo === 'conflicto' && conf.cuerpo.version === v0 && version(d) === v0, tx(conf))
  const fut = await ordena(pu, cmd({ tipo: 'abrir', version_esperada: v0 + 7, testigo: g.testigo, par: 'EURUSD', lado: 'SELL', orden: 'mercado', lotes: '1', cotizadoEn: m(40) }))
  oraculo('COMA', 'una version del futuro: 409 conflicto con la vigente, sin calcular ni llamar a la RPC', fut.http === 409 && fut.cuerpo?.motivo === 'conflicto' && fut.cuerpo.version === v0 && version(d) === v0, tx(fut))
  sinTasa(d)
  const cad = await ordena(pu, cmd({ tipo: 'avanzar', version_esperada: v0 - 1, testigo: g.testigo, hasta: m(45), motivo: 'paso' }))
  oraculo('COMA', 'un avance desde una version vieja: 409 comando_caducado', cad.http === 409 && cad.cuerpo?.motivo === 'comando_caducado', tx(cad))
  sinTasa(d)
  const a1 = await ordena(pu, cmd({ tipo: 'avanzar', version_esperada: v0, testigo: g.testigo, hasta: m(45), motivo: 'paso' }))
  const a2 = await ordena(pu, cmd({ tipo: 'avanzar', version_esperada: v0 + 1, testigo: g.testigo, hasta: m(50), motivo: 'paso' }))
  oraculo('COMA', 'dos avances seguidos sin esperar 5 s: el segundo, 429 demasiados_avances', a1.http === 200 && a2.http === 429 && a2.cuerpo?.motivo === 'demasiados_avances', tx({ a1: a1.http, a2 }))
  const ck = await ordena(pu, cmd({ tipo: 'checkpoint', version_esperada: v0 + 1, testigo: g.testigo }))
  sinTasa(d)
  const ck2 = await ordena(pu, cmd({ tipo: 'checkpoint', version_esperada: v0 + 1, testigo: g.testigo }))
  oraculo('COMA', 'checkpoint (sin velas nuevas): 200, misma version, recibo ultimo_avance', ck2.http === 200 && ck2.cuerpo?.version === v0 + 1 && ck2.cuerpo.recibo?.clase === 'ultimo_avance', tx({ ck: ck.http, ck2 }))

  // A19: dos pestañas
  const t2 = await tomaDe(pu, AL, { cliente_id: 'pestana-2' })
  const p1 = await ordena(pu, cmd({ tipo: 'cerrar', version_esperada: version(d), testigo: g.testigo, id: 'p2' }))
  const p2 = await ordena(pu, cmd({ tipo: 'cerrar', version_esperada: version(d), testigo: t2, cliente_id: 'pestana-2', id: 'p2' }))
  oraculo('COMA', 'A19 · la pestaña 2 toma el escritor: la 1 recibe 409 sin_arrendamiento; la 2 cierra el resto (0,75) una sola vez', p1.http === 409 && p1.cuerpo?.motivo === 'sin_arrendamiento' && p2.http === 200 && pg.uno(d, `select string_agg(lots::text, ',' order by lots) from public.sim_trades where pair = 'USD/JPY'`) === '0.25,0.75', tx({ p1, p2: p2.http }))

  // 40P01: dos interbloqueos y despues la RPC real; la misma clave
  let n40 = 0
  const pu40 = { ...pu, rpc: async (n, a) => { if (n === 'sim_comando' && n40 < 2) { n40++; return { data: null, error: { code: '40P01', message: 'deadlock' } } } return pu.rpc(n, a) }, rpcOpciones: { espera: async () => {} } }
  const rd = await ordena(pu40, cmd({ tipo: 'abrir', version_esperada: version(d), testigo: t2, cliente_id: 'pestana-2', par: 'GBPUSD', lado: 'SELL', orden: 'limit', precio: '1.40000', lotes: '1' }))
  oraculo('COMA', '40P01 dos veces y despues bien: 200, un solo recibo y una sola orden', rd.http === 200 && n40 === 2 && pg.uno(d, `select count(*) from public.sim_eventos where tipo = 'orden_creada'`) === '1', tx({ rd: rd.http, n40 }))

  // A23: la sesion de otro alumno; el cuerpo con estado
  ver('control: la sesion del otro alumno', (await crear(9, OT, pu)).http === 201)
  const aj = await ordena(pu, cmd({ session_id: u(1009), tipo: 'cancelar', version_esperada: 0, testigo: t2, id: 'o1' }))
  oraculo('COMA', 'A23 · un comando sobre la sesion de otro alumno: 404 sesion_no_encontrada, sin su estado', aj.http === 404 && aj.cuerpo?.motivo === 'sesion_no_encontrada' && !('estado' in (aj.cuerpo ?? {})), tx(aj))
  const fab = await ordena(pu, { ...cmd({ tipo: 'cancelar', version_esperada: version(d), testigo: t2, cliente_id: 'pestana-2', id: 'o1' }), estado: { saldo_µ: 1 } })
  oraculo('COMA', 'A23 · un cuerpo con estado: 422 carga_invalida, sin llamar a la RPC', fab.http === 422 && fab.cuerpo?.en === 'estado', tx(fab))

  // A26: el mercado fijado que falta
  const cojo = almacen(); for (const [k, x] of mercado.o) if (!/USDCHF\/manifiestos/.test(k)) cojo.o.set(k, x)
  let llamadas = 0
  sinTasa(d)
  const sin = await ordena({ ...pu, almacen: cojo, rpc: (n, a) => { llamadas++; return pu.rpc(n, a) } }, cmd({ tipo: 'avanzar', version_esperada: version(d), testigo: t2, cliente_id: 'pestana-2', hasta: m(60), motivo: 'paso' }))
  oraculo('COMA', 'A26 · falta un manifiesto fijado: 503 mercado_no_disponible, sin llamar a la RPC', sin.http === 503 && sin.cuerpo?.motivo === 'mercado_no_disponible' && llamadas === 0, tx({ sin, llamadas }))

  // A24: borrar y reintentar
  const borra = await pu.rpc('sim_borrar_sesion', { p_actor: AL, p_session_id: u(1001) })
  const tras = await ordena(pu, cmd({ tipo: 'cancelar', version_esperada: 9, testigo: t2, cliente_id: 'pestana-2', id: 'o1' }))
  oraculo('COMA', 'A24 · tras borrar la sesion, un comando: 410 sesion_borrada y nada resucita', borra.data?.ok === true && tras.http === 410 && tras.cuerpo?.motivo === 'sesion_borrada' && pg.uno(d, `select terminal from public.sim_sessions where id = '${u(1001)}'`) === 'borrada', tx({ borra: borra.data, tras }))

  titulo('4 · neto y saldo identicos con y sin spread_micro')
  const d2 = 'k2', pu2 = monta(d2, { spreadMicro: () => 123_456_789n })
  const g2 = await guion(d2, pu2)
  const sps = pg.uno(d2, `select string_agg(spread_micro::text, ',') from public.sim_trades`)
  ver('control: el guion con otro spread_micro va igual', g2.av2.http === 200 && g2.ce.http === 200)
  oraculo('SPRD', 'con otro spread_micro (123.456.789): mismos netos, brutos, pnl, comisiones y saldo; solo cambia spread_micro', filaGuion !== '' && fila(d2) === filaGuion && sps === '123456789,123456789', tx({ con: filaGuion, otro: fila(d2), sps }))

  titulo('5 · POST /api/sim/comando')
  const handler = (await importa('pages/api/sim/comando.js')).default
  const d3 = 'k3', pu3 = monta(d3)
  ver('control: sesion creada', (await crear(1, AL, pu3)).http === 201)
  const t3 = await tomaDe(pu3)
  const espejo = () => { escenario({ perfiles: [perfil(AL, { simulador_activo: true })], sim_sessions: [JSON.parse(pg.uno(d3, `select row_to_json(s)::text from public.sim_sessions s where id = '${u(1001)}'`))] }); db.rpcExterno = pg.rpc(d3); db.storage.mercado = Object.fromEntries([...mercado.o].map(([k, v]) => [k, Buffer.from(v)])) }
  delete process.env.SIM_V1_ENDPOINTS
  espejo()
  const off = await llama(handler, { method: 'POST', token: tok(AL), body: cmd({ tipo: 'avanzar', version_esperada: 0, testigo: t3, hasta: m(10), motivo: 'paso' }) })
  oraculo('COMA', 'sin el interruptor: 503 apagado (literal) y nada', off.estado === 503 && JSON.stringify(off.cuerpo) === '{"ok":false,"http":503,"motivo":"apagado"}' && db.log.length === 0, tx(off.cuerpo))
  process.env.SIM_V1_ENDPOINTS = 'encendido'
  espejo(); sinTasa(d3)
  const on = await llama(handler, { method: 'POST', token: tok(AL), body: cmd({ tipo: 'avanzar', version_esperada: 0, testigo: t3, hasta: m(10), motivo: 'paso' }) })
  oraculo('COMA', 'de punta a punta: avanzar → 200 y la version 1 en la base real', on.estado === 200 && on.cuerpo?.version === 1 && version(d3) === 1, tx({ e: on.estado, c: on.cuerpo, x: on.excepcion?.message }).slice(0, 400))
  espejo()
  db.pierde = ctx => ctx.tabla === 'rpc:sim_comando'
  const c1 = cmd({ tipo: 'abrir', version_esperada: 1, testigo: t3, par: 'EURUSD', lado: 'BUY', orden: 'mercado', lotes: '1', cotizadoEn: m(10) })
  const perd = await llama(handler, { method: 'POST', token: tok(AL), body: c1 })
  db.pierde = null
  espejo()
  const otra = await llama(handler, { method: 'POST', token: tok(AL), body: c1 })
  oraculo('COMA', 'A18 por la URL: la respuesta de la RPC se pierde (500); el reintento da 200 repetido y un solo fill', perd.estado === 500 && otra.estado === 200 && otra.cuerpo?.repetido === true && pg.uno(d3, `select count(*) from public.sim_eventos where tipo = 'fill'`) === '1', tx({ perd: perd.estado, otra: otra.cuerpo }).slice(0, 400))
  delete process.env.SIM_V1_ENDPOINTS
  db.rpcExterno = null
} finally { pg.cierra() }
fin()
