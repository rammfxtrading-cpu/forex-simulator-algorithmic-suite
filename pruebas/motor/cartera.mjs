/**
 * MOTOR · PIEZA 7: LA CARTERA MULTIPAR (especificacion v2.3.1, § 13; Astra
 * diseño-4). Escrito ANTES que el codigo (lib/motor/cartera.mjs).
 *
 * API que se prueba:
 *   crea({ pares, costes, capital, limites, apalancamiento, mercado })
 *   aplica(estado, comando, velasPorPar, { alto })   comandos: avanzar, abrir
 *     (con «par»), modificar, cancelar, cerrar
 *   eligeCaminos(estado, t, velasPorPar) → { PAR: { camino, minimo_µ:{A,B},
 *     cierre_µ:{A,B}, ambigua } }   (§ 13.4, simulacion aislada)
 *   equity_µ(estado), margenUsado_µ(estado), serializa, deserializa
 * Eventos: en de un punto = { vela, fase (1..4), fraccion 'n/d', modelado }.
 *
 * Cifras a mano (§ 13.6 y § 13.8 de la especificacion): A36, A38–A45. A37
 * compara la cartera de un solo par con el motor de un par ajustado (motor@2)
 * en el subconjunto de un par, escenario a escenario.
 * Nota (para Astra): A43 c dice «fase 4», pero una pendiente no puede
 * llenarse por primera vez en la fase 4 (todo precio de ese tramo ya se cruzo
 * en la fase 3); aqui se llena en la fase 3 y se comprueba lo mismo: el
 * margen con la APERTURA del par base→USD. Por lo mismo, en A42 b el nivel de
 * la fase 4 es el SL de una posicion abierta en la fase 3, no un TP previo.
 */
import { titulo, ver, oraculo, fin, importa } from '../lib.mjs'
const M = await importa('lib/motor/motor.mjs')
const { COSTES_1 } = await importa('lib/motor/costes.mjs')
let CA = null
try { CA = await importa('lib/motor/cartera.mjs') } catch { CA = null }
const T0 = Date.parse('2026-03-03T10:00:00Z') / 1000
const PARES9 = ['AUDCAD', 'AUDUSD', 'EURUSD', 'GBPJPY', 'GBPUSD', 'NZDUSD', 'USDCAD', 'USDCHF', 'USDJPY']
const aislado = (comision = 0n) => Object.freeze({ version: `prueba:0:${comision}`, spread_pips: Object.freeze(Object.fromEntries(PARES9.map(p => [p, 0]))), comision_lote_µ: comision, swap_µ: 0n })
const plana = p => [p, p, p, p]
// mercado: { PAR: [[o,h,l,c] | null, ...] } → velas por par, un minuto por indice desde T0
const mercado = mins => Object.fromEntries(Object.entries(mins).map(([par, vs]) => [par, M.velas(par, vs.map((v, i) => v && { time: T0 + 60 * i, open: v[0], high: v[1], low: v[2], close: v[3] }).filter(Boolean))]))
const µ = txt => { const [e, d = ''] = String(txt).split('.'); return BigInt(e) * 1_000_000n + (e.startsWith('-') ? -1n : 1n) * BigInt((d + '000000').slice(0, 6)) }
const enTexto = x => JSON.stringify(x, (k, v) => (typeof v === 'bigint' ? `${v}n` : v))
const de = (ev, tipo) => ev.filter(x => x.tipo === tipo)
// una sesion ya en el minuto 0
function sesion({ pares, costes = aislado(), capital = '100000', limites = [], mins }) {
  const velas = mercado(mins)
  let e = CA.crea({ pares, costes, capital, limites })
  e = CA.aplica(e, { tipo: 'avanzar', hasta: T0 }, velas).estado
  return { e, velas, ev: [] }
}
const ap = (s, c, op) => { const r = CA.aplica(s.e, c, s.velas, op); s.e = r.estado; s.ev.push(...r.eventos); return r }
const abre = (s, par, lado, lotes, extra = {}) => ap(s, { tipo: 'abrir', par, lado, orden: 'mercado', lotes, cotizadoEn: s.e.reloj.cursor, ...extra })
const pend = (s, par, lado, orden, precio, lotes, extra = {}) => ap(s, { tipo: 'abrir', par, lado, orden, precio, lotes, ...extra })
const avanza = (s, i, op) => ap(s, { tipo: 'avanzar', hasta: T0 + 60 * i }, op)
const tx = (par, t) => M.precioTexto(par, t)
const altoObjetivo = obj => (e, ev) => e.posiciones.length === 0 && e.saldo_µ >= µ(obj)
const corre = f => { if (!CA) return null; try { return f() } catch (e) { return { error: String(e?.stack || e).slice(0, 300) } } }

titulo('A29–A33 · el camino sincronizado (v2.2), cifras a mano')
const a29 = corre(() => {
  const s = sesion({ pares: ['EURUSD', 'GBPUSD'], costes: aislado(3_000_000n), limites: [{ regla: 'perdida_diaria', limite: '95000' }], mins: { EURUSD: [plana('1.20000'), ['1.20000', '1.26000', '1.14000', '1.20000']], GBPUSD: [plana('1.30000'), ['1.30000', '1.30000', '1.29000', '1.29000']] } })
  abre(s, 'EURUSD', 'BUY', '1', { sl: '1.10000', tp: '1.25000' }); pend(s, 'GBPUSD', 'BUY', 'limit', '1.20000', '1')
  const r = avanza(s, 1); return { s, r }
})
const b29 = a29?.r ? de(a29.r.eventos, 'breach')[0] : null
oraculo('A29', 'A06 en multipar: breach en fase 2, s = 833/1000, EURUSD 1,15002, GBPUSD 1,29167, equity 94.999; la orden de GBPUSD, cancelada por breach', !!b29 && b29.en?.fase === 2 && b29.en?.fraccion === '833/1000' && tx('EURUSD', b29.precios?.EURUSD) === '1.15002' && tx('GBPUSD', b29.precios?.GBPUSD) === '1.29167' && b29.equity_µ === µ('94999') && de(a29.r.eventos, 'orden_cancelada')[0]?.motivo === 'breach', a29?.error ?? enTexto(b29))
const a30 = (suelo, nombres) => corre(() => {
  // nombres: [perdedor, ganador]; el que pierde, BUY 1 que baja 6.000 ticks; el que gana, SELL 1 que baja 4.000 ticks
  const [pp, pg] = nombres
  const px = { AUDUSD: ['0.70000', '0.64000', '0.66000'], EURUSD: ['1.10000', '1.04000', '1.06000'] }
  const mins = { [pp]: [plana(px[pp][0]), [px[pp][0], px[pp][0], px[pp][1], px[pp][1]]], [pg]: [plana(px[pg][0]), [px[pg][0], px[pg][0], px[pg][2], px[pg][2]]] }
  const s = sesion({ pares: nombres, limites: [{ regla: 'perdida_diaria', limite: suelo }], mins })
  abre(s, pp, 'BUY', '1'); abre(s, pg, 'SELL', '1')
  const r = avanza(s, 1); return { s, r }
})
const x30 = a30('95000', ['AUDUSD', 'EURUSD']), y30 = a30('95000', ['EURUSD', 'AUDUSD'])
oraculo('A30', 'A07 en multipar: AUDUSD −6.000 y EURUSD +4.000 en la fase 2: equity final 98.000, sin breach', !!x30?.s && x30.s.e.estado === 'activo' && CA.equity_µ(x30.s.e) === µ('98000'), x30?.error ?? enTexto(x30?.r?.eventos))
oraculo('A31', 'intercambiar los nombres (EURUSD pierde, AUDUSD gana): tambien 98.000 y sin breach; el orden secuencial habria roto el suelo', !!y30?.s && y30.s.e.estado === 'activo' && CA.equity_µ(y30.s.e) === µ('98000'), y30?.error ?? enTexto(y30?.r?.eventos))
const x32 = a30('98500', ['AUDUSD', 'EURUSD']), b32 = x32?.r ? de(x32.r.eventos, 'breach')[0] : null
oraculo('A32', 'suelo 98.500: breach en fase 2, s = 4501/6000; AUDUSD 0,65499, EURUSD 1,07000; equity y saldo 98.499', !!b32 && b32.en?.fase === 2 && b32.en?.fraccion === '4501/6000' && tx('AUDUSD', b32.precios?.AUDUSD) === '0.65499' && tx('EURUSD', b32.precios?.EURUSD) === '1.07000' && b32.equity_µ === µ('98499') && x32.s.e.saldo_µ === µ('98499'), x32?.error ?? enTexto(b32))
const a33 = corre(() => {
  const s = sesion({ pares: ['EURUSD', 'GBPUSD'], capital: '120000', limites: [{ regla: 'perdida_diaria', limite: '115000' }], mins: { GBPUSD: [plana('1.30000'), ['1.30000', '1.30000', '1.18000', '1.18000']], EURUSD: [plana('1.10000'), ['1.10000', '1.10000', '1.02000', '1.02000']] } })
  abre(s, 'GBPUSD', 'BUY', '2', { sl: '1.26000' }); abre(s, 'EURUSD', 'SELL', '1', { tp: '1.06000' })
  const r = avanza(s, 1, { alto: altoObjetivo('110000') }); return { s, r }
})
const b33 = a33?.r ? de(a33.r.eventos, 'breach')[0] : null
oraculo('A33', 'breach frente a objetivo: breach en fase 2, s = 3751/12000 (antes del SL y del TP); GBPUSD 1,26249, EURUSD 1,07500; equity 114.998; sin objetivo', !!b33 && b33.en?.fraccion === '3751/12000' && tx('GBPUSD', b33.precios?.GBPUSD) === '1.26249' && tx('EURUSD', b33.precios?.EURUSD) === '1.07500' && b33.equity_µ === µ('114998') && a33.s.e.estado === 'breach' && !a33.r.eventos.some(x => x.tipo === 'cierre' && (x.motivo === 'SL' || x.motivo === 'TP')), a33?.error ?? enTexto(b33))

titulo('A36 · eleccion del camino aislada y ejecucion conjunta (fixture completo, V4-04)')
const a36 = conGbp => corre(() => {
  const s = sesion({ pares: ['EURUSD', 'GBPUSD'], costes: aislado(3_000_000n), capital: conGbp ? '100003' : '100000', mins: { EURUSD: [plana('1.10000'), ['1.10000', '1.10150', '1.09850', '1.10050']], GBPUSD: [plana('1.30000'), ['1.30000', '1.30500', '1.29800', '1.30200']] } })
  if (conGbp) abre(s, 'GBPUSD', 'BUY', '1')
  pend(s, 'EURUSD', 'BUY', 'stop', '1.10100', '1', { sl: '1.09900' })
  const eleccion = CA.eligeCaminos(s.e, T0 + 60, s.velas)
  const r = avanza(s, 1)
  return { s, eleccion, r }
})
const x36 = a36(true), y36 = a36(false)
const el = x36?.eleccion?.EURUSD
oraculo('A36', 'EURUSD elige A: minimos aislados 99.797 (A, variacion −203) y 99.947 (B, −53), netos de la comision del fill; ambigua', el?.camino === 'A' && el?.minimo_µ?.A === µ('99797') && el?.minimo_µ?.B === µ('99947') && el?.ambigua === true, enTexto(el ?? x36?.error))
oraculo('A36', 'GBPUSD elige B (empate en minimo −200 y cierre +200)', x36?.eleccion?.GBPUSD?.camino === 'B', enTexto(x36?.eleccion?.GBPUSD))
oraculo('A36', 'la eleccion de EURUSD es la misma sin la posicion de GBPUSD (los demas pares, quietos en la apertura)', y36?.eleccion?.EURUSD?.camino === 'A' && y36?.eleccion?.EURUSD?.minimo_µ?.A === µ('99797') && y36?.eleccion?.EURUSD?.minimo_µ?.B === µ('99947'), enTexto(y36?.eleccion?.EURUSD ?? y36?.error))
const f36 = x36 && !x36.error ? de(x36.r.eventos, 'fill')[0] : null, c36 = x36 && !x36.error ? de(x36.r.eventos, 'cierre')[0] : null
oraculo('A36', 'conjunta: fill de EURUSD en 1,10100 en la fase 2, s = 2/3; SL en 1,09900 en la fase 3, s = 5/6; bruto −200, neto −203', !!f36 && tx('EURUSD', f36.precio) === '1.10100' && f36.en?.fase === 2 && f36.en?.fraccion === '2/3' && !!c36 && c36.motivo === 'SL' && tx('EURUSD', c36.precio) === '1.09900' && c36.en?.fase === 3 && c36.en?.fraccion === '5/6' && c36.bruto_µ === µ('-200') && c36.neto_µ === µ('-203'), enTexto([f36?.en, c36?.en, c36?.neto_µ]))
oraculo('A36', 'al cierre: saldo 99.797, flotante de GBPUSD +200, equity 99.997', !!x36?.s && x36.s.e.saldo_µ === µ('99797') && CA.equity_µ(x36.s.e) === µ('99997'), x36?.s ? `${x36.s.e.saldo_µ} · ${CA.equity_µ(x36.s.e)}` : '')

titulo('A37 · una cartera de un solo par = el motor de un par ajustado (motor@2)')
// escenarios del subconjunto de un par (A01–A06, A08, A11, A12, A16, A17, C6-07): mismos comandos a los dos motores
const ESC = [
  { id: 'A01 a', par: 'EURUSD', costes: COSTES_1, filas: [plana('1.10000'), plana('1.10000')], pasos: [['abrir', 'BUY', 'mercado', '1'], ['abrir', 'SELL', 'mercado', '1'], ['avanza', 1]] },
  { id: 'A01 b', par: 'EURUSD', costes: COSTES_1, filas: [plana('1.10000'), ['1.09950', '1.09960', '1.09880', '1.09900']], pasos: [['abrir', 'BUY', 'limit', '1', '1.09900'], ['avanza', 1]] },
  { id: 'A01 b hueco', par: 'EURUSD', costes: COSTES_1, filas: [plana('1.10000'), ['1.09800', '1.09850', '1.09790', '1.09820']], pasos: [['abrir', 'BUY', 'limit', '1', '1.09900'], ['avanza', 1]] },
  { id: 'A01 d', par: 'EURUSD', costes: COSTES_1, filas: [plana('1.10000'), ['1.10200', '1.10250', '1.10150', '1.10200']], pasos: [['abrir', 'BUY', 'stop', '1', '1.10100'], ['avanza', 1]] },
  { id: 'A01 f', par: 'EURUSD', costes: COSTES_1, filas: [plana('1.10000'), plana('1.10000')], pasos: [['abrir', 'BUY', 'limit', '1', '1.10100'], ['abrir', 'BUY', 'stop', '1', '1.09900'], ['avanza', 1]] },
  { id: 'A01 g', par: 'EURUSD', costes: COSTES_1, filas: [plana('1.10000'), ['1.09000', '1.09100', '1.08900', '1.09000']], pasos: [['abrir', 'BUY', 'limit', '1', '1.10000', { sl: '1.09900' }], ['avanza', 1]] },
  { id: 'A02', par: 'EURUSD', costes: { ...COSTES_1, version: 'prueba:1pip', spread_pips: { ...COSTES_1.spread_pips, EURUSD: '1' } }, filas: [plana('1.10000'), plana('1.10000')], pasos: [['abrir', 'BUY', 'mercado', '1'], ['avanza', 1], ['cerrar', 'p1']] },
  { id: 'A03 b', par: 'EURUSD', costes: aislado(3_000_000n), filas: [plana('1.10000'), ['1.10000', '1.10150', '1.09850', '1.10050']], pasos: [['abrir', 'BUY', 'stop', '1', '1.10100', { sl: '1.09900' }], ['avanza', 1]] },
  { id: 'A04', par: 'EURUSD', costes: aislado(3_000_000n), filas: [plana('1.10000'), ['1.10000', '1.10100', '1.09900', '1.10000']], pasos: [['abrir', 'BUY', 'mercado', '1', null, { sl: '1.09900', tp: '1.10100' }], ['abrir', 'SELL', 'mercado', '1', null, { sl: '1.10100', tp: '1.09900' }], ['avanza', 1]] },
  { id: 'A05', par: 'EURUSD', costes: aislado(0n), filas: [plana('1.10000'), ['1.10000', '1.10100', '1.09900', '1.10000']], pasos: [['abrir', 'BUY', 'mercado', '1', null, { sl: '1.09900', tp: '1.10100' }], ['avanza', 1]] },
  { id: 'A06', par: 'EURUSD', costes: aislado(3_000_000n), limites: [{ regla: 'perdida_diaria', limite: '95000' }], filas: [plana('1.20000'), ['1.20000', '1.26000', '1.14000', '1.20000']], pasos: [['abrir', 'BUY', 'mercado', '1', null, { sl: '1.10000', tp: '1.25000' }], ['abrir', 'SELL', 'limit', '1', '1.30000'], ['avanza', 1]] },
  { id: 'A08', par: 'USDJPY', costes: aislado(3_000_000n), limites: [{ regla: 'perdida_diaria', limite: '95000' }], filas: [plana('150.000'), ['150.000', '150.000', '142.000', '142.500']], pasos: [['abrir', 'BUY', 'mercado', '1'], ['avanza', 1]] },
  { id: 'A11', par: 'EURUSD', costes: COSTES_1, filas: [plana('1.10007'), plana('1.10200')], pasos: [['abrir', 'BUY', 'mercado', '1'], ['avanza', 1], ['cerrar', 'p1', '0.25'], ['cerrar', 'p1']] },
  { id: 'A12', par: 'EURUSD', costes: COSTES_1, filas: [plana('1.10000'), plana('1.10050')], pasos: [['abrir', 'BUY', 'mercado', '0.03'], ['avanza', 1], ['cerrar', 'p1', '0.01'], ['serializa'], ['cerrar', 'p1']] },
  { id: 'A16', par: 'EURUSD', costes: aislado(0n), filas: [plana('1.10000'), plana('1.10000'), ['1.10000', '1.10000', '1.09800', '1.09800']], pasos: [['abrir', 'BUY', 'mercado', '1', null, { sl: '1.09900' }], ['avanza', 1], ['avanza', 2], ['avanza', 3]] },
  { id: 'A17', par: 'EURUSD', costes: COSTES_1, filas: [plana('1.10000'), plana('1.10500')], pasos: [['avanza', 1], ['abrir-viejo', 'BUY', '1'], ['abrir', 'BUY', 'mercado', '1']] },
  { id: 'C6-07', par: 'EURUSD', costes: COSTES_1, filas: [plana('1.10000'), plana('1.10000')], pasos: [['abrir', 'BUY', 'limit', '1', '1.09000'], ['modificar', 'o1', { precio: '1.11000' }], ['avanza', 1]] },
  { id: '§ 13.9', par: 'EURUSD', costes: COSTES_1, limites: [{ regla: 'perdida_diaria', limite: '95000' }], filas: [plana('1.10000'), plana('1.05000')], pasos: [['abrir', 'BUY', 'mercado', '1', null, { sl: '1.05000' }], ['abrir', 'BUY', 'limit', '1', '1.05003'], ['avanza', 1]] },
  { id: 'dos SL', par: 'EURUSD', costes: COSTES_1, limites: [{ regla: 'perdida_diaria', limite: '95000' }], filas: [plana('1.10000'), plana('1.05000')], pasos: [['abrir', 'BUY', 'mercado', '1', null, { sl: '1.05000' }], ['abrir', 'BUY', 'mercado', '1', null, { sl: '1.05000' }], ['avanza', 1]] },
  { id: 'P-23a', par: 'EURUSD', costes: COSTES_1, limites: [{ regla: 'perdida_diaria', limite: '95000' }], filas: [plana('1.10000'), plana('1.05000')], pasos: [['abrir', 'BUY', 'mercado', '1'], ['abrir', 'BUY', 'limit', '1', '1.05003'], ['avanza', 1]] },
  { id: 'tras fill', par: 'EURUSD', costes: COSTES_1, capital: '95005', limites: [{ regla: 'perdida_diaria', limite: '95000' }], filas: [plana('1.10010'), plana('1.10000')], pasos: [['abrir', 'BUY', 'limit', '1', '1.10003', { sl: '1.10000' }], ['abrir', 'BUY', 'limit', '1', '1.10003'], ['avanza', 1]] },
]
// proyeccion economica comun (§ 12.4): eventos sin ids de transporte y con el momento como (minuto, fase)
const fase = en => en?.t != null ? 'cmd' : en?.fase ?? (en?.tramo != null ? en.tramo + 1 : null)
// el breach de la cartera guarda los precios de todos sus pares (precios); con un solo par, es el precio del motor de un par
const precioDe = x => x.precio ?? (x.precios && Object.values(x.precios).length === 1 ? Object.values(x.precios)[0] : null)
const proyEv = ev => ev.map(x => [x.tipo, x.posicion ?? null, x.orden ?? null, x.motivo ?? x.regla ?? null, precioDe(x), x.lotes_c ?? null, x.bruto_µ ?? null, x.comision_µ ?? null, x.equity_µ ?? null, x.en?.vela ?? x.en?.t ?? null, fase(x.en), !!x.ambigua])
const proyPos = p => [p.id, p.lado, p.lotes_c, p.entrada, p.sl, p.tp, p.margen_fijado_µ ?? null, p.comision_devengada_µ]
const proyEst = e => enTexto({ saldo: e.saldo_µ, estado: e.estado, cursor: e.reloj.cursor, pos: e.posiciones.map(proyPos), ord: e.ordenes.map(o => [o.id, o.lado, o.tipo, o.precio, o.lotes_c]), cot: e.cotizacion?.bid ?? e.cotizaciones?.[Object.keys(e.cotizaciones ?? {})[0]]?.bid ?? null })
function correEsc(esc, motor) {
  const v = M.velas(esc.par, esc.filas.map(([o, h, l, c], i) => ({ time: T0 + 60 * i, open: o, high: h, low: l, close: c })))
  const multi = motor === 'cartera'
  let e = multi ? CA.crea({ pares: [esc.par], costes: esc.costes, capital: esc.capital ?? '100000', limites: esc.limites ?? [] }) : M.crea({ par: esc.par, costes: esc.costes, capital: esc.capital ?? '100000', limites: esc.limites ?? [] })
  const ap1 = c => { const r = multi ? CA.aplica(e, c, { [esc.par]: v }) : M.aplica(e, c, v); e = r.estado; return r }
  const ev = [], res = []
  const cursor0 = e => e.reloj.cursor
  ap1({ tipo: 'avanzar', hasta: T0 })
  for (const p of esc.pasos) {
    let r
    if (p[0] === 'avanza') r = ap1({ tipo: 'avanzar', hasta: T0 + 60 * p[1] })
    else if (p[0] === 'abrir') r = ap1({ tipo: 'abrir', ...(multi ? { par: esc.par } : {}), lado: p[1], orden: p[2], lotes: p[3], ...(p[2] === 'mercado' ? { cotizadoEn: cursor0(e) } : { precio: p[4] }), ...(p[5] || {}) })
    else if (p[0] === 'abrir-viejo') r = ap1({ tipo: 'abrir', ...(multi ? { par: esc.par } : {}), lado: p[1], orden: 'mercado', lotes: p[2], cotizadoEn: T0 })
    else if (p[0] === 'cerrar') r = ap1({ tipo: 'cerrar', id: p[1], ...(p[2] ? { lotes: p[2] } : {}) })
    else if (p[0] === 'modificar') r = ap1({ tipo: 'modificar', id: p[1], ...p[2] })
    else if (p[0] === 'serializa') { e = (multi ? CA : M).deserializa((multi ? CA : M).serializa(e)); continue }
    ev.push(...r.eventos); res.push(enTexto(r.resultado))
  }
  return { proyeccion: proyEst(e), eventos: enTexto(proyEv(ev)), resultados: res.join(' ') }
}
for (const esc of ESC) {
  const uno = corre(() => correEsc(esc, 'motor')), multi = corre(() => correEsc(esc, 'cartera'))
  const igual = !!uno && !!multi && !uno.error && !multi.error && uno.proyeccion === multi.proyeccion && uno.eventos === multi.eventos && uno.resultados === multi.resultados
  oraculo('A37', `${esc.id}: misma proyeccion economica, eventos y resultados que el motor de un par`, igual, igual ? '' : enTexto({ uno: uno?.error ?? uno?.proyeccion, multi: multi?.error ?? multi?.proyeccion }).slice(0, 400))
}

titulo('A37 · el reto sobre la cartera de un par = el reto sobre el motor de un par (A13, A14, C6-02, C6-05, C7-01)')
const RT = await importa('lib/motor/reto.mjs')
const U = iso => Date.parse(iso) / 1000
// velas: [iso, p] (plana) o [iso, o, h, l, c]; guion: ['avanza', iso] | ['abrir', lado, lotes, extra] | ['cerrar', id] | ['tarde', iso, p, hastaIso]
const RESC = [
  { id: 'A13', inicio: '2026-02-10T07:00:00Z', velas: [['2026-02-10T08:00:00Z', '1.10000'], ['2026-02-10T09:00:00Z', '1.13000'], ['2026-02-10T22:59:00Z', '1.07000'], ['2026-02-11T08:00:00Z', '1.07000']], guion: [['avanza', '2026-02-10T08:00:00Z'], ['abrir', 'BUY', '1'], ['avanza', '2026-02-10T09:00:00Z'], ['cerrar', 'p1'], ['abrir', 'BUY', '1'], ['avanza', '2026-02-11T09:00:00Z']] },
  { id: 'A13 igual', inicio: '2026-02-10T07:00:00Z', velas: [['2026-02-10T08:00:00Z', '1.10000'], ['2026-02-10T09:00:00Z', '1.13000'], ['2026-02-10T22:59:00Z', '1.08000'], ['2026-02-11T08:00:00Z', '1.08000']], guion: [['avanza', '2026-02-10T08:00:00Z'], ['abrir', 'BUY', '1'], ['avanza', '2026-02-10T09:00:00Z'], ['cerrar', 'p1'], ['abrir', 'BUY', '1'], ['avanza', '2026-02-11T09:00:00Z']] },
  { id: 'A14 marzo', inicio: '2026-03-27T19:00:00Z', velas: [['2026-03-27T20:00:00Z', '1.10000'], ['2026-03-27T20:59:00Z', '1.10500'], ['2026-03-29T21:00:00Z', '1.10600'], ['2026-03-30T01:00:00Z', '1.10600']], guion: [['avanza', '2026-03-27T20:00:00Z'], ['abrir', 'BUY', '1'], ['avanza', '2026-03-30T01:00:00Z']] },
  { id: 'A14 octubre', inicio: '2026-10-23T19:00:00Z', velas: [['2026-10-23T20:00:00Z', '1.10000'], ['2026-10-26T08:00:00Z', '1.10000']], guion: [['avanza', '2026-10-26T08:00:00Z']] },
  { id: 'C6-02', inicio: '2026-10-05T07:00:00Z', velas: [['2026-10-05T08:00:00Z', '1.10000'], ['2026-10-06T08:00:00Z', '1.10000'], ['2026-10-07T08:00:00Z', '1.10000'], ['2026-10-08T08:00:00Z', '1.10000'], ['2026-10-08T08:01:00Z', '1.10000', '1.22000', '1.10000', '1.10000'], ['2026-10-08T09:00:00Z', '1.10000']],
    guion: [['avanza', '2026-10-05T08:00:00Z'], ['abrir', 'BUY', '1'], ['cerrar', 'p1'], ['avanza', '2026-10-06T08:00:00Z'], ['abrir', 'BUY', '1'], ['cerrar', 'p2'], ['avanza', '2026-10-07T08:00:00Z'], ['abrir', 'BUY', '1'], ['cerrar', 'p3'], ['avanza', '2026-10-08T08:00:00Z'], ['abrir', 'BUY', '1', { tp: '1.20000' }], ['abrir', 'BUY', '1', { orden: 'stop', precio: '1.21000', sl: '1.15000' }], ['avanza', '2026-10-08T09:00:00Z']] },
  { id: 'C6-05', inicio: '2026-10-05T12:00:00Z', velas: [['2026-10-05T12:00:00Z', '1.10000']], guion: [['avanza', '2026-10-05T12:00:00Z'], ['abrir', 'BUY', '1'], ['avanza', '2026-10-06T00:00:00Z'], ['tarde', '2026-10-05T13:00:00Z', '1.11000', '2026-10-06T06:00:00Z'], ['tarde', '2026-10-06T00:01:00Z', '1.11000', '2026-10-06T06:00:00Z']] },
  { id: 'C7-01 costes@1', costes: COSTES_1, inicio: '2026-10-05T07:00:00Z', velas: [['2026-10-05T08:00:00Z', '1.10000'], ['2026-10-06T08:00:00Z', '1.10000'], ['2026-10-07T08:00:00Z', '1.10000'], ['2026-10-07T09:00:00Z', '1.20050'], ['2026-10-08T08:00:00Z', '1.10000'], ['2026-10-08T08:01:00Z', '1.08000'], ['2026-10-08T09:00:00Z', '1.08000']],
    guion: [['avanza', '2026-10-05T08:00:00Z'], ['abrir', 'BUY', '1'], ['cerrar', 'p1'], ['avanza', '2026-10-06T08:00:00Z'], ['abrir', 'BUY', '1'], ['cerrar', 'p2'], ['avanza', '2026-10-07T08:00:00Z'], ['abrir', 'BUY', '2'], ['avanza', '2026-10-07T09:00:00Z'], ['cerrar', 'p3'], ['avanza', '2026-10-08T08:00:00Z'], ['abrir', 'BUY', '5', { sl: '1.09000' }], ['avanza', '2026-10-08T09:00:00Z']] },
  { id: 'C7-01 integracion', inicio: '2026-10-05T07:00:00Z', velas: [['2026-10-05T08:00:00Z', '1.10000'], ['2026-10-06T08:00:00Z', '1.10000'], ['2026-10-07T08:00:00Z', '1.10000'], ['2026-10-07T09:00:00Z', '1.20000'], ['2026-10-07T21:58:00Z', '1.10000'], ['2026-10-07T21:59:00Z', '1.08000'], ['2026-10-08T08:00:00Z', '1.08000']],
    guion: [['avanza', '2026-10-05T08:00:00Z'], ['abrir', 'BUY', '1'], ['cerrar', 'p1'], ['avanza', '2026-10-06T08:00:00Z'], ['abrir', 'BUY', '1'], ['cerrar', 'p2'], ['avanza', '2026-10-07T08:00:00Z'], ['abrir', 'BUY', '2'], ['avanza', '2026-10-07T09:00:00Z'], ['cerrar', 'p3'], ['avanza', '2026-10-07T21:58:00Z'], ['abrir', 'BUY', '5'], ['avanza', '2026-10-07T21:59:00Z'], ['cerrar', 'p4']] },
]
const velasDe = filas => M.velas('EURUSD', filas.map(([iso, ...px]) => { const [o, h = o, l = o, c = o] = px; return { time: U(iso), open: o, high: h, low: l, close: c } }))
function retoEsc(esc, motor) {
  const multi = motor === 'cartera', v = velasDe(esc.velas)
  const base = multi ? CA.crea({ pares: ['EURUSD'], costes: esc.costes ?? aislado(), capital: '100000' }) : M.crea({ par: 'EURUSD', costes: esc.costes ?? aislado(), capital: '100000' })
  let r = RT.creaReto({ motor: base, inicio: U(esc.inicio) })
  const conVelas = vs => (multi ? { EURUSD: vs } : vs)
  const ev = [], res = []
  for (const p of esc.guion) {
    let x
    if (p[0] === 'avanza') x = RT.avanzaReto(RT.deserializaReto(RT.serializaReto(r)), U(p[1]), conVelas(v))
    else if (p[0] === 'tarde') x = RT.avanzaReto(r, U(p[3]), conVelas(velasDe([[p[1], p[2]]])))
    else x = RT.aplicaReto(r, p[0] === 'abrir' ? { tipo: 'abrir', ...(multi ? { par: 'EURUSD' } : {}), lado: p[1], orden: 'mercado', lotes: p[2], cotizadoEn: r.motor.reloj.cursor, ...(p[3] || {}) } : { tipo: 'cerrar', id: p[1] })
    r = x.reto; ev.push(...x.eventos); res.push(enTexto(x.resultado ?? x.detencion))
  }
  return { proy: enTexto({ estado: r.estado, dias: r.dias_con_apertura, reset: r.ultimo_reset, horizonte: r.horizonte, smn: r.saldo_medianoche_µ, motor: proyEst(r.motor) }), ev: enTexto(proyEv(ev)), res: res.join(' ') }
}
for (const esc of RESC) {
  const uno = corre(() => retoEsc(esc, 'motor')), multi = corre(() => retoEsc(esc, 'cartera'))
  const igual = !!uno && !!multi && !uno.error && !multi.error && uno.proy === multi.proy && uno.ev === multi.ev && uno.res === multi.res
  oraculo('A37', `reto ${esc.id}: mismo reto, eventos y resultados con la cartera de un par que con el motor de un par`, igual, igual ? '' : enTexto({ uno: uno?.error ?? [uno?.proy, uno?.res], multi: multi?.error ?? [multi?.proy, multi?.res] }).slice(0, 500))
}

titulo('A38 · objetivo y pendiente en la misma fraccion; breach que prevalece (V3-02)')
const a38a = corre(() => {
  const s = sesion({ pares: ['EURUSD'], limites: [{ regla: 'perdida_diaria', limite: '95000' }], mins: { EURUSD: [plana('1.10000'), ['1.10000', '1.20000', '1.10000', '1.20000']] } })
  abre(s, 'EURUSD', 'BUY', '1', { tp: '1.20000' }); pend(s, 'EURUSD', 'BUY', 'stop', '1.20000', '1')
  const r = avanza(s, 1, { alto: altoObjetivo('110000') }); return { s, r }
})
oraculo('A38', '(a) un par: el TP deja 110.000 sin posiciones → objetivo; el stop se anula («objetivo»); ningun fill', !!a38a?.s && a38a.s.e.estado === 'objetivo' && a38a.s.e.saldo_µ === µ('110000') && de(a38a.r.eventos, 'fill').length === 0 && de(a38a.r.eventos, 'orden_cancelada')[0]?.motivo === 'objetivo', a38a?.error ?? enTexto(a38a?.r.eventos.map(x => x.tipo + ' ' + (x.motivo ?? ''))))
const a38b = corre(() => {
  const s = sesion({ pares: ['EURUSD', 'GBPUSD'], mins: { EURUSD: [plana('1.10000'), ['1.10000', '1.30000', '1.10000', '1.30000']], GBPUSD: [plana('1.30000'), ['1.30000', '1.31000', '1.30000', '1.30000']] } })
  abre(s, 'EURUSD', 'BUY', '1', { tp: '1.20000' }); pend(s, 'GBPUSD', 'BUY', 'stop', '1.30500', '1')
  const r = avanza(s, 1, { alto: altoObjetivo('110000') }); return { s, r }
})
const c38b = a38b?.r ? de(a38b.r.eventos, 'cierre')[0] : null
oraculo('A38', '(b) dos pares: TP de EURUSD y stop de GBPUSD en la misma fraccion (fase 3, s = 1/2): primero la proteccion → objetivo; el stop se anula; ningun fill', !!a38b?.s && a38b.s.e.estado === 'objetivo' && c38b?.motivo === 'TP' && c38b?.en?.fase === 3 && c38b?.en?.fraccion === '1/2' && de(a38b.r.eventos, 'fill').length === 0 && de(a38b.r.eventos, 'orden_cancelada')[0]?.motivo === 'objetivo', a38b?.error ?? enTexto(a38b?.r.eventos.map(x => [x.tipo, x.motivo, x.en])))
const a38c = corre(() => {
  const s = sesion({ pares: ['EURUSD', 'GBPUSD'], capital: '120000', limites: [{ regla: 'perdida_diaria', limite: '115000' }], mins: { EURUSD: [plana('1.10000'), plana('1.12000')], GBPUSD: [plana('1.30000'), plana('1.26499')] } })
  abre(s, 'EURUSD', 'BUY', '1', { tp: '1.12000' }); abre(s, 'GBPUSD', 'BUY', '2', { sl: '1.26500' })
  const r = avanza(s, 1, { alto: altoObjetivo('110000') }); return { s, r }
})
const t38c = a38c?.r ? a38c.r.eventos.map(x => x.tipo + (x.motivo ? ' ' + x.motivo : '') + (x.regla ? ' ' + x.regla : '') + (x.par ? ' ' + x.par : '')) : []
oraculo('A38', '(c) hueco: TP de EURUSD (+2.000) → limites con GBPUSD ya en 1,26499: 114.998 < 115.000 → breach; GBPUSD se cierra por breach (no por SL); saldo 114.998; sin objetivo', !!a38c?.s && a38c.s.e.estado === 'breach' && a38c.s.e.saldo_µ === µ('114998') && JSON.stringify(t38c) === JSON.stringify(['cierre TP EURUSD', 'breach perdida_diaria', 'cierre breach GBPUSD']), a38c?.error ?? t38c.join(', '))

titulo('A39 · frontera de fase 3→4 sin ticks: cambia la conversion y rompe el limite (V3-03)')
// alcanzable con limites fijos (el saldo de medianoche de Astra, 105.480): capital 105.480 y suelo 100.480; minuto 1: el
// GBPJPY salta a 190,700 (+500 con USDJPY a 140) y un EURUSD cierra por SL con −5.480 → saldo 100.000, equity 100.500;
// minuto 2: GBPJPY plano, USDJPY abre en 140 y cierra en 155
const a39 = extra => corre(() => {
  const mins = { GBPJPY: [plana('190.000'), plana('190.700'), plana('190.700')], USDJPY: [plana('140.000'), plana('140.000'), ['140.000', '155.000', '140.000', '155.000']], GBPUSD: [plana('1.25000'), plana('1.25000'), plana('1.25000')], EURUSD: [plana('1.10000'), plana('1.04520'), plana('1.04520')] }
  if (extra) mins.USDCHF = [plana('0.90000'), plana('0.90000'), plana('0.90000')]
  const s = sesion({ pares: Object.keys(mins), capital: '105480', limites: [{ regla: 'perdida_diaria', limite: '100480' }], mins })
  abre(s, 'GBPJPY', 'BUY', '1'); abre(s, 'EURUSD', 'BUY', '1', { sl: '1.04520' })
  const r1 = avanza(s, 1), tras1 = { saldo: s.e.saldo_µ, equity: CA.equity_µ(s.e), estado: s.e.estado }
  const r = avanza(s, 2); return { s, r, tras1 }
})
for (const [que, x] of [['', a39(false)], [' (con un USDCHF plano añadido)', a39(true)]]) {
  ver(`control A39${que}: tras el minuto 1, saldo 100.000 y equity 100.500 (fases 1–3 con la apertura, 140), sin breach`, !CA || x?.error != null || (x?.tras1?.saldo === µ('100000') && x?.tras1?.equity === µ('100500') && x?.tras1?.estado === 'activo'), enTexto(x?.tras1))
  const br = x?.r ? de(x.r.eventos, 'breach')[0] : null
  oraculo('A39', `breach en la fase 4, s = 0 (equity 100.451,612903 < 100.480), sin ticks; saldo 100.451,612903${que}`, !!br && br.en?.fase === 4 && br.en?.fraccion === '0/1' && br.equity_µ === µ('100451.612903') && x.s.e.saldo_µ === µ('100451.612903'), x?.error ?? enTexto(br))
}

titulo('A40 · fracciones iguales escritas distinto (1/2 = 2/4), margen justo y seq')
const a40 = gbpPrimero => corre(() => {
  const s = sesion({ pares: ['EURUSD', 'GBPUSD'], capital: '2400', mins: { EURUSD: [plana('1.10002'), ['1.10002', '1.10002', '1.10000', '1.10000']], GBPUSD: [plana('1.30004'), ['1.30004', '1.30004', '1.30000', '1.30000']] } })
  const ords = [['GBPUSD', '1.30002'], ['EURUSD', '1.10001']]
  for (const [par, p] of gbpPrimero ? ords : ords.reverse()) pend(s, par, 'BUY', 'limit', p, '1')
  const r = avanza(s, 1); return { s, r }
})
for (const [gbp, x] of [[true, a40(true)], [false, a40(false)]]) {
  const fills = x?.r ? de(x.r.eventos, 'fill') : [], canc = x?.r ? de(x.r.eventos, 'orden_cancelada') : []
  const llena = gbp ? 'GBPUSD' : 'EURUSD', margen = gbp ? '1300.04' : '1100.02'
  oraculo('A40', `${gbp ? 'GBPUSD' : 'EURUSD'} con seq menor: se llena en s = 1/2 con margen ${margen}; la otra, margen_insuficiente`, fills.length === 1 && fills[0].par === llena && fills[0].en?.fraccion === '1/2' && x.s.e.posiciones[0]?.margen_fijado_µ === µ(margen) && canc.length === 1 && canc[0].motivo === 'margen_insuficiente', x?.error ?? enTexto([fills.map(f => [f.par, f.en]), canc.map(c => c.motivo)]))
}

titulo('A41 · n = 0, fracciones que no coinciden y precio que baja (redondeo hacia el inicio)')
const a41 = corre(() => {
  const s = sesion({ pares: ['EURUSD', 'GBPUSD', 'USDCHF'], mins: { EURUSD: [plana('1.10003'), ['1.10003', '1.10003', '1.10000', '1.10000']], GBPUSD: [plana('1.30000'), ['1.30000', '1.30002', '1.30000', '1.30002']], USDCHF: [plana('0.90000'), plana('0.90000')] } })
  pend(s, 'EURUSD', 'SELL', 'stop', '1.10001', '1'); pend(s, 'GBPUSD', 'BUY', 'stop', '1.30001', '1'); pend(s, 'USDCHF', 'BUY', 'limit', '0.80000', '1')
  const r = avanza(s, 1); return { s, r }
})
const f41 = a41?.r ? Object.fromEntries(de(a41.r.eventos, 'fill').map(f => [f.par, f.en])) : {}
oraculo('A41', 'GBPUSD llena en fase 2, s = 1/2; EURUSD (SELL STOP 1,10001) en s = 2/3, no en 1/2 (en 1/2 esta en 1,10002)', f41.GBPUSD?.fase === 2 && f41.GBPUSD?.fraccion === '1/2' && f41.EURUSD?.fase === 2 && f41.EURUSD?.fraccion === '2/3', a41?.error ?? enTexto(f41))

titulo('A42 · ejecucion y conversion separadas (V3-03)')
const a42a = corre(() => {
  const s = sesion({ pares: ['USDJPY'], costes: COSTES_1, mins: { USDJPY: [plana('150.000'), plana('151.000')] } })
  abre(s, 'USDJPY', 'SELL', '1'); avanza(s, 1); const r = ap(s, { tipo: 'cerrar', id: s.e.posiciones[0].id }); return { s, r }
})
const c42 = a42a?.r ? de(a42a.r.eventos, 'cierre')[0] : null
oraculo('A42', '(a) USDJPY SELL: sale al ask 151,004; bruto −100.400 JPY / bid 151,000 = −664,900662; neto −667,900662', !!c42 && tx('USDJPY', c42.precio) === '151.004' && c42.bruto_µ === µ('-664.900662') && c42.neto_µ === µ('-667.900662'), a42a?.error ?? enTexto(c42))
// fase 3: TP de +70.000 JPY (con la apertura de USDJPY, 140). Fase 4: un nivel no puede alcanzarse POR PRIMERA VEZ en la
// fase 4 (todo su tramo ya se cruzo antes), salvo el de una posicion abierta despues: un BUY STOP 190,500 se llena en la
// fase 3 (camino B) y su SL 189,800 salta en la fase 4, con −70.000 JPY convertidos con el CIERRE (155)
const a42b = (velaGj, orden) => corre(() => {
  const s = sesion({ pares: ['GBPJPY', 'USDJPY', 'GBPUSD'], mins: { GBPJPY: [plana('190.000'), velaGj], USDJPY: [plana('140.000'), ['140.000', '155.000', '140.000', '155.000']], GBPUSD: [plana('1.25000'), plana('1.25000')] } })
  orden(s); const r = avanza(s, 1); return { s, r }
})
const c42b3 = a42b(['190.000', '190.700', '190.000', '190.700'], s => abre(s, 'GBPJPY', 'BUY', '1', { tp: '190.700' }))
const c42b4 = a42b(['190.000', '191.000', '189.000', '189.300'], s => pend(s, 'GBPJPY', 'BUY', 'stop', '190.500', '1', { sl: '189.800' }))
const cb3 = c42b3?.r ? de(c42b3.r.eventos, 'cierre')[0] : null, cb4 = c42b4?.r ? de(c42b4.r.eventos, 'cierre')[0] : null, fb4 = c42b4?.r ? de(c42b4.r.eventos, 'fill')[0] : null
oraculo('A42', '(b) GBPJPY: TP de +70.000 JPY en la fase 3 → +500,000000 (apertura de USDJPY, 140); SL de −70.000 JPY en la fase 4 (posicion llenada en la fase 3) → −451,612903 (cierre, 155)', cb3?.en?.fase === 3 && cb3?.bruto_µ === µ('500') && fb4?.en?.fase === 3 && cb4?.motivo === 'SL' && cb4?.en?.fase === 4 && cb4?.bruto_µ === µ('-451.612903'), enTexto([c42b3?.error ?? [cb3?.en, cb3?.bruto_µ], c42b4?.error ?? [fb4?.en, cb4?.en, cb4?.bruto_µ]]))

titulo('A43 · margen@2 a los dos lados; pendiente con la apertura; parciales (V3-08)')
const a43a = corre(() => { const s = sesion({ pares: ['EURUSD'], costes: COSTES_1, capital: '1100.01', mins: { EURUSD: [plana('1.10000')] } }); const r = abre(s, 'EURUSD', 'BUY', '1'); return { s, r } })
oraculo('A43', '(a) libre 1.100,01: BUY a mercado con margen 1.100,00 (bid) se admite', a43a?.r?.resultado === 'aceptado' && a43a.s.e.posiciones[0]?.margen_fijado_µ === µ('1100'), a43a?.error ?? enTexto(a43a?.r?.resultado))
const a43b = corre(() => { const s = sesion({ pares: ['EURUSD'], costes: COSTES_1, capital: '1099.25', mins: { EURUSD: [plana('1.10000'), ['1.09950', '1.09960', '1.09880', '1.09900']] } }); pend(s, 'EURUSD', 'BUY', 'limit', '1.09900', '1'); const r = avanza(s, 1); return { s, r } })
oraculo('A43', '(b) libre 1.099,25: la BUY LIMIT de A01 b necesita 1.099,50 (bid de apertura 1,09950): margen_insuficiente', !!a43b?.r && de(a43b.r.eventos, 'fill').length === 0 && de(a43b.r.eventos, 'orden_cancelada')[0]?.motivo === 'margen_insuficiente', a43b?.error ?? enTexto(a43b?.r?.eventos))
const a43c = corre(() => {
  const s = sesion({ pares: ['AUDCAD', 'USDCAD', 'AUDUSD'], mins: { AUDCAD: [plana('0.90000'), ['0.90000', '0.90100', '0.90000', '0.90000']], USDCAD: [plana('1.36000'), ['1.36000', '1.37000', '1.36000', '1.37000']], AUDUSD: [plana('0.65000'), ['0.65000', '0.66000', '0.65000', '0.66000']] } })
  abre(s, 'AUDUSD', 'BUY', '0.01')                     // AUDUSD con exposicion: recorre su camino en el minuto
  pend(s, 'AUDCAD', 'BUY', 'stop', '0.90050', '1'); const r = avanza(s, 1); return { s, r }
})
const f43 = a43c?.r ? de(a43c.r.eventos, 'fill').find(f => f.par === 'AUDCAD') : null
const p43 = a43c?.s?.e.posiciones.find(p => p.par === 'AUDCAD')
oraculo('A43', '(c) pendiente de AUDCAD llenada en la fase 3, s = 1/2, con AUDUSD (con exposicion) ya en 0,65500 en ese punto: margen 650,00 (apertura del minuto), no 655,00', !!f43 && f43.en?.fase === 3 && f43.en?.fraccion === '1/2' && p43?.margen_fijado_µ === µ('650'), a43c?.error ?? enTexto([f43?.en, p43?.margen_fijado_µ]))
const a43d = serializa => corre(() => {
  const s = sesion({ pares: ['AUDCAD', 'USDCAD', 'AUDUSD'], mins: { AUDCAD: [plana('0.90000'), plana('0.90000')], USDCAD: [plana('1.36000'), plana('1.36000')], AUDUSD: [plana('0.65000'), plana('0.67000')] } })
  abre(s, 'AUDCAD', 'BUY', '1'); avanza(s, 1)
  ap(s, { tipo: 'cerrar', id: 'p1', lotes: '0.25' }); const tras25 = CA.margenUsado_µ(s.e)
  if (serializa) s.e = CA.deserializa(CA.serializa(s.e))
  ap(s, { tipo: 'cerrar', id: 'p1' }); return { tras25, final: CA.margenUsado_µ(s.e) }
})
for (const ser of [false, true]) { const x = a43d(ser); oraculo('A43', `(d) margen 650,00; cerrar 0,25 deja 487,50 (con AUDUSD ya en 0,67000: sale de la base, no del FX nuevo); cerrar el resto deja 0${ser ? ' (serializando en medio)' : ''}`, x?.tras25 === µ('487.5') && x?.final === 0n, x?.error ?? enTexto(x)) }

titulo('A44 · tope de 50 en varios pares (§ 13.5)')
const a44 = corre(() => {
  const pares = ['EURUSD', 'GBPUSD', 'AUDUSD']
  const s = sesion({ pares, mins: { EURUSD: [plana('1.10000'), ['1.10000', '1.10000', '1.09000', '1.09000']], GBPUSD: [plana('1.30000'), plana('1.30000')], AUDUSD: [plana('0.65000'), plana('0.65000')] } })
  for (let i = 0; i < 30; i++) abre(s, pares[i % 3], 'BUY', '0.01')
  pend(s, 'EURUSD', 'BUY', 'limit', '1.09500', '0.01')
  for (let i = 0; i < 18; i++) pend(s, pares[i % 3], 'BUY', 'limit', pares[i % 3] === 'EURUSD' ? '1.00000' : pares[i % 3] === 'GBPUSD' ? '1.20000' : '0.60000', '0.01')
  const cuenta = () => s.e.posiciones.length + s.e.ordenes.length
  const c49 = cuenta()
  const r50 = abre(s, 'GBPUSD', 'BUY', '0.01'), c50 = cuenta()
  const antes = CA.serializa(s.e), r51 = abre(s, 'GBPUSD', 'BUY', '0.01'), igual = CA.serializa(s.e) === antes
  avanza(s, 1); const cFill = cuenta()
  return { c49, r50: r50.resultado, c50, r51: r51.resultado, igual, cFill, s }
})
oraculo('A44', '49 → abrir → 50; otro → tope_alcanzado sin cambiar el estado; el fill de una pendiente deja 50', a44?.c49 === 49 && a44?.r50 === 'aceptado' && a44?.c50 === 50 && a44?.r51?.rechazado === 'tope_alcanzado' && a44?.igual === true && a44?.cFill === 50, a44?.error ?? enTexto({ c49: a44?.c49, c50: a44?.c50, r51: a44?.r51, igual: a44?.igual, cFill: a44?.cFill }))
const a44b = corre(() => {
  const s = sesion({ pares: ['EURUSD'], mins: { EURUSD: [plana('1.10000')] } })
  for (let i = 0; i < 49; i++) abre(s, 'EURUSD', 'BUY', i === 0 ? '0.02' : '0.01')
  abre(s, 'EURUSD', 'BUY', '0.01')
  const parcial = ap(s, { tipo: 'cerrar', id: 'p1', lotes: '0.01' }), tras = s.e.posiciones.length + s.e.ordenes.length
  const rech = abre(s, 'EURUSD', 'BUY', '0.01')
  ap(s, { tipo: 'cerrar', id: 'p1' }); const r49 = s.e.posiciones.length + s.e.ordenes.length
  const otra = abre(s, 'EURUSD', 'BUY', '0.01')
  return { tras, rech: rech.resultado, r49, otra: otra.resultado, seq: s.e.posiciones.at(-1)?.id }
})
oraculo('A44', 'un cierre parcial deja 50 y el siguiente abrir se rechaza; un cierre total deja 49 y se admite (con el seq siguiente: el rechazo no consumio ninguno)', a44b?.tras === 50 && a44b?.rech?.rechazado === 'tope_alcanzado' && a44b?.r49 === 49 && a44b?.otra === 'aceptado' && a44b?.seq === 'p51', a44b?.error ?? enTexto(a44b))

titulo('A45 · B/B: la sincronizacion compensa exactamente (V3-09)')
// la eleccion con el suelo de la especificacion (95.000); la ejecucion conjunta con el suelo en 100.000 exactos, para que
// un solo tick de desfase entre los dos pares sea breach (la eleccion con ese suelo sigue siendo B/B: empate)
const a45 = suelo => corre(() => {
  const s = sesion({ pares: ['EURUSD', 'GBPUSD'], limites: [{ regla: 'perdida_diaria', limite: suelo }], mins: { EURUSD: [plana('1.10000'), ['1.10000', '1.13000', '1.07000', '1.10000']], GBPUSD: [plana('1.30000'), ['1.30000', '1.33000', '1.27000', '1.30000']] } })
  abre(s, 'EURUSD', 'BUY', '1'); abre(s, 'GBPUSD', 'SELL', '1')
  const eleccion = CA.eligeCaminos(s.e, T0 + 60, s.velas)
  const r = avanza(s, 1); return { s, r, eleccion }
})
const a45e = a45('95000'), a45x = a45('100000')
oraculo('A45', 'aislados (suelo 95.000): los dos eligen B (minimo 97.000 y cierre 100.000 por los dos caminos)', a45e?.eleccion?.EURUSD?.camino === 'B' && a45e?.eleccion?.GBPUSD?.camino === 'B' && a45e.eleccion.EURUSD.minimo_µ.A === µ('97000') && a45e.eleccion.EURUSD.minimo_µ.B === µ('97000') && a45e.eleccion.EURUSD.cierre_µ.B === µ('100000'), a45e?.error ?? enTexto(a45e?.eleccion))
oraculo('A45', 'sincronizados B/B con el suelo en 100.000 exactos: ningun punto por debajo (sin breach); equity final 100.000', a45x?.eleccion?.EURUSD?.camino === 'B' && a45x?.eleccion?.GBPUSD?.camino === 'B' && !!a45x?.s && a45x.s.e.estado === 'activo' && de(a45x.r.eventos, 'breach').length === 0 && CA.equity_µ(a45x.s.e) === µ('100000'), a45x?.error ?? enTexto([a45x?.eleccion, a45x?.r?.eventos]))

titulo('no_valorable: el minuto entero sin consumir en todos los pares (§ 3.5, § 12.2)')
const B = await importa('lib/motor/binario.mjs'), MF = await importa('lib/motor/manifiesto.mjs'), FU = await importa('lib/motor/fuente.mjs')
const S0 = d => Date.parse(d + 'T00:00:00Z') / 1000
const trozo = (par, d, p) => ({ dia: d, buffer: B.codifica(par, S0(d), M.velas(par, Array.from({ length: 1440 }, (_, i) => ({ time: S0(d) + 60 * i, open: p, high: p, low: p, close: p }))).map(v => ({ ...v, volume: 1 }))) })
const nv = corre(() => {
  const eu = [trozo('EURUSD', '2026-03-02', '1.10000'), trozo('EURUSD', '2026-03-03', '1.11000'), trozo('EURUSD', '2026-03-04', '1.12000')]
  const gb = [trozo('GBPUSD', '2026-03-02', '1.30000'), trozo('GBPUSD', '2026-03-04', '1.30000')]          // el martes 3 falta en GBPUSD
  const mEu = MF.creaManifiesto({ par: 'EURUSD', version: 'v1', trozos: eu }), mGb = MF.creaManifiesto({ par: 'GBPUSD', version: 'v1', trozos: gb })
  const lect = ts => d => ts.find(t => t.dia === d)?.buffer ?? null
  const fuentes = { EURUSD: FU.creaFuente({ manifiesto: mEu, fijado: MF.fija(mEu), leeTrozo: lect(eu) }), GBPUSD: FU.creaFuente({ manifiesto: mGb, fijado: MF.fija(mGb), leeTrozo: lect(gb) }) }
  let e = CA.crea({ pares: ['EURUSD', 'GBPUSD'], costes: aislado(), capital: '100000', mercado: { EURUSD: MF.fija(mEu), GBPUSD: MF.fija(mGb) } })
  let r = CA.avanza(e, S0('2026-03-02') + 600, fuentes, { desde: S0('2026-03-02') }); e = r.estado
  e = CA.aplica(e, { tipo: 'abrir', par: 'EURUSD', lado: 'BUY', orden: 'mercado', lotes: '1', cotizadoEn: e.reloj.cursor }).estado
  const antes = CA.serializa(e)
  r = CA.avanza(e, S0('2026-03-04') + 3600, fuentes)
  const otra = CA.avanza(r.estado, S0('2026-03-04') + 3600, fuentes)
  return { r, otra, antes, fuentes, mEu, mGb }
})
oraculo('NV', 'GBPUSD sin el martes: detencion «no_valorable» de GBPUSD el 2026-03-03; EURUSD tampoco consume el martes (cursor y cotizacion al final del lunes)', nv?.r?.detencion?.motivo === 'no_valorable' && nv.r.detencion.par === 'GBPUSD' && nv.r.detencion.dia === '2026-03-03' && nv.r.estado.reloj.cursor === S0('2026-03-03') - 60 && tx('EURUSD', nv.r.estado.cotizaciones.EURUSD.bid) === '1.10000', nv?.error ?? enTexto([nv?.r?.detencion, nv?.r?.estado.reloj.cursor]))
oraculo('NV', 'repetir el avance: la misma detencion, sin eventos y el estado igual', nv?.otra?.detencion?.dia === '2026-03-03' && nv.otra.eventos.length === 0 && CA.serializa(nv.otra.estado) === CA.serializa(nv.r.estado))
const ajena = corre(() => { const e = CA.crea({ pares: ['EURUSD', 'GBPUSD'], costes: aislado(), capital: '100000', mercado: { EURUSD: MF.fija(nv.mEu), GBPUSD: 'GBPUSD@v1:otra' } }); return CA.avanza(e, S0('2026-03-02') + 600, nv.fuentes, { desde: S0('2026-03-02') }) })
oraculo('NV', 'una fuente con otra huella que la fijada para su par: detencion «fuente_de_otra_version», sin tocar el estado', ajena?.detencion?.motivo === 'fuente_de_otra_version' && ajena.detencion.par === 'GBPUSD' && ajena.eventos.length === 0, enTexto(ajena?.detencion ?? ajena?.error))
fin()
