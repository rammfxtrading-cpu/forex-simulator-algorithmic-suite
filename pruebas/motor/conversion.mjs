/**
 * LA CONVERSION EN EL EVENTO cierre (decision del CTO, 14-oct; diseño q.4; spec § 2.4,
 * persistencia § 2.4). Escrito ANTES que el codigo (contra 63be57d: en rojo).
 *
 * El evento cierre lleva conversion: { par, minuto, fase, valor } — o null con USD
 * cotizado. valor = EXACTAMENTE el precio (ticks, bid) con que el motor paso ese
 * cierre a USD (convDe en la cartera, conversion() en el motor de un par), sin
 * recalcular. minuto y fase: el punto del cierre (en.vela y su fase 1–4; un comando
 * entre minutos: en.t y fase null).
 *
 * Cifras a mano (aislado: sin spread ni comision), minuto 1 = T0 + 60:
 *   AUDCAD (conversion USDCAD), USDCAD en el minuto 1: O 1,37000 … C 1,30000
 *     fase 1  BUY SL 0,89800, AUDCAD abre en hueco a 0,89700      → USDCAD 137000 (apertura)
 *     fase 2  BUY SL 0,89950, vela O,90000 H,90100 L,89900 C,90050 → B (empate) → 137000
 *     fase 3  BUY TP 0,90080, misma vela                          → B (peor minimo) → 137000
 *     fase 4  BUY 10 a 0,90000, AUDCAD plano en 0,89000, limite 92.500:
 *             equity fase 1 = 100.000 − 10.000/1,37 = 92.700,73 (sigue)
 *             fase 4 (s = 0, conversion con el cierre) = 100.000 − 10.000/1,30 = 92.307,69 → breach
 *             → cierre con USDCAD 130000 (cierre del minuto)
 *   USDJPY (su propio bid): BUY SL 149,500, vela O 150 H 150 L 149 C 149,5 → B, fase 2, valor 149500
 *   GBPJPY (conversion USDJPY): BUY SL 189,500, vela GBPJPY O 190 H 190 L 189 C 189,5, USDJPY
 *     O 150,000 C 151,000 → fase 2, valor 150000
 *   EURUSD: conversion null
 *   cierre parcial (comando cerrar 0,25 de AUDCAD tras el minuto 1): { USDCAD, minuto: cursor + 60,
 *     fase: null, valor: el bid de USDCAD en el cursor, 130000 }
 * A37 byte a byte: el motor de un par y la cartera de ese par dan la MISMA conversion
 * (USDJPY fase 2, USDJPY parcial, EURUSD null).
 */
import { titulo, oraculo, ver, fin, importa } from '../lib.mjs'
const M = await importa('lib/motor/motor.mjs')
const CA = await importa('lib/motor/cartera.mjs')
const T0 = Date.parse('2026-03-03T10:00:00Z') / 1000, T1 = T0 + 60
const PARES9 = ['AUDCAD', 'AUDUSD', 'EURUSD', 'GBPJPY', 'GBPUSD', 'NZDUSD', 'USDCAD', 'USDCHF', 'USDJPY']
const aislado = Object.freeze({ version: 'prueba:0', spread_pips: Object.freeze(Object.fromEntries(PARES9.map(p => [p, 0]))), comision_lote_µ: 0n, swap_µ: 0n })
const plana = p => [p, p, p, p]
const mercado = mins => Object.fromEntries(Object.entries(mins).map(([par, vs]) => [par, M.velas(par, vs.map((v, i) => v && { time: T0 + 60 * i, open: v[0], high: v[1], low: v[2], close: v[3] }).filter(Boolean))]))
const tx = x => JSON.stringify(x, (k, v) => (typeof v === 'bigint' ? `${v}n` : v))
const corre = f => { try { return f() } catch (e) { return { error: String(e?.message ?? e) } } }

function cartera({ pares, mins, limites = [], pasos }) {
  const velas = mercado(mins)
  let e = CA.crea({ pares, costes: aislado, capital: '100000', limites })
  e = CA.aplica(e, { tipo: 'avanzar', hasta: T0 }, velas).estado
  const ev = []
  for (const c of pasos) { const r = CA.aplica(e, typeof c === 'function' ? c(e) : c, velas); e = r.estado; ev.push(...r.eventos) }
  return ev.filter(x => x.tipo === 'cierre')
}
function uno({ par, filas, pasos }) {
  const velas = M.velas(par, filas.map(([o, h, l, c], i) => ({ time: T0 + 60 * i, open: o, high: h, low: l, close: c })))
  let e = M.crea({ par, costes: aislado, capital: '100000' })
  e = M.aplica(e, { tipo: 'avanzar', hasta: T0 }, velas).estado
  const ev = []
  for (const c of pasos) { const r = M.aplica(e, typeof c === 'function' ? c(e) : c, velas); e = r.estado; ev.push(...r.eventos) }
  return ev.filter(x => x.tipo === 'cierre')
}
const abrir = (par, lado, lotes, extra = {}) => e => ({ tipo: 'abrir', par, lado, orden: 'mercado', lotes, cotizadoEn: e.reloj.cursor, ...extra })
const abrir1 = (lado, lotes, extra = {}) => e => ({ tipo: 'abrir', lado, orden: 'mercado', lotes, cotizadoEn: e.reloj.cursor, ...extra })
const hasta1 = { tipo: 'avanzar', hasta: T1 }
const conv = (par, minuto, fase, valor) => ({ par, minuto, fase, valor })
const igual = (a, b) => tx(a) === tx(b)

titulo('1 · un cruce: la tasa de apertura en las fases 1–3 y la de cierre en la 4')
const CRUCE = ['AUDCAD', 'AUDUSD', 'USDCAD']
const base = { AUDUSD: [plana('0.65000'), plana('0.65000')], USDCAD: [plana('1.37000'), ['1.37000', '1.37000', '1.30000', '1.30000']] }
const VELA = ['0.90000', '0.90100', '0.89900', '0.90050']
const casos = [
  { fase: 1, valor: 137000n, c: () => cartera({ pares: CRUCE, mins: { ...base, AUDCAD: [plana('0.90000'), plana('0.89700')] }, pasos: [abrir('AUDCAD', 'BUY', '1', { sl: '0.89800' }), hasta1] }) },
  { fase: 2, valor: 137000n, c: () => cartera({ pares: CRUCE, mins: { ...base, AUDCAD: [plana('0.90000'), VELA] }, pasos: [abrir('AUDCAD', 'BUY', '1', { sl: '0.89950' }), hasta1] }) },
  { fase: 3, valor: 137000n, c: () => cartera({ pares: CRUCE, mins: { ...base, AUDCAD: [plana('0.90000'), VELA] }, pasos: [abrir('AUDCAD', 'BUY', '1', { tp: '0.90080' }), hasta1] }) },
  { fase: 4, valor: 130000n, c: () => cartera({ pares: CRUCE, limites: [{ regla: 'perdida_diaria', limite: '92500' }], mins: { ...base, AUDCAD: [plana('0.90000'), plana('0.89000')] }, pasos: [abrir('AUDCAD', 'BUY', '10'), hasta1] }) },
]
for (const k of casos) {
  const ev = corre(k.c)
  ver(`control: el escenario de la fase ${k.fase} cierra una vez, en el minuto 1 y en esa fase`, Array.isArray(ev) && ev.length === 1 && ev[0].en?.vela === T1 && ev[0].en?.fase === k.fase, tx(ev).slice(0, 300))
  oraculo('CONV', `AUDCAD, cierre en la fase ${k.fase}: conversion { USDCAD, ${T1}, ${k.fase}, ${k.valor} }`, Array.isArray(ev) && ev.length === 1 && igual(ev[0].conversion, conv('USDCAD', T1, k.fase, k.valor)), tx(ev?.[0]?.conversion ?? ev))
}

titulo('2 · USDJPY, GBPJPY y EURUSD')
const jpy = corre(() => cartera({ pares: ['USDJPY'], mins: { USDJPY: [plana('150.000'), ['150.000', '150.000', '149.000', '149.500']] }, pasos: [abrir('USDJPY', 'BUY', '1', { sl: '149.500' }), hasta1] }))
oraculo('CONV', 'USDJPY: su propio bid en el cierre (SL, fase 2): { USDJPY, T1, 2, 149500 }', igual(jpy?.[0]?.conversion, conv('USDJPY', T1, 2, 149500n)), tx(jpy))
const gj = corre(() => cartera({ pares: ['GBPJPY', 'GBPUSD', 'USDJPY'], mins: { GBPUSD: [plana('1.30000'), plana('1.30000')], USDJPY: [plana('150.000'), ['150.000', '151.000', '150.000', '151.000']], GBPJPY: [plana('190.000'), ['190.000', '190.000', '189.000', '189.500']] }, pasos: [abrir('GBPJPY', 'BUY', '1', { sl: '189.500' }), hasta1] }))
oraculo('CONV', 'GBPJPY: USDJPY a la apertura del minuto (fase 2): { USDJPY, T1, 2, 150000 }', gj?.length === 1 && igual(gj[0].conversion, conv('USDJPY', T1, 2, 150000n)), tx(gj))
const eu = corre(() => cartera({ pares: ['EURUSD'], mins: { EURUSD: [plana('1.10000'), ['1.10000', '1.10000', '1.09000', '1.09500']] }, pasos: [abrir('EURUSD', 'BUY', '1', { sl: '1.09500' }), hasta1] }))
oraculo('CONV', 'EURUSD (USD cotizado): conversion null (presente, no ausente)', eu?.length === 1 && 'conversion' in eu[0] && eu[0].conversion === null, tx(eu))

titulo('3 · un cierre parcial, por comando')
const par = corre(() => cartera({ pares: CRUCE, mins: { ...base, AUDCAD: [plana('0.90000'), plana('0.90200')] }, pasos: [abrir('AUDCAD', 'BUY', '1'), hasta1, { tipo: 'cerrar', id: 'p1', lotes: '0.25' }] }))
oraculo('CONV', 'cerrar 0,25 de AUDCAD tras el minuto 1: { USDCAD, cursor + 60, null, 130000 } (el bid de USDCAD en el cursor) y lotes_c 25', par?.length === 1 && par[0].lotes_c === 25n && igual(par[0].conversion, conv('USDCAD', T1 + 60, null, 130000n)), tx(par))
const valorUsado = corre(() => {
  // el valor ES el del P&L: bruto = (0,90200 − 0,90000) × 25.000 CAD / 1,30 = 38,461538… → 38.461.538 µ
  return par?.[0]?.bruto_µ
})
oraculo('CONV', 'y es la tasa del P&L: bruto 50 CAD / 1,30000 = 38.461.538 µUSD', valorUsado === 38_461_538n, tx(valorUsado))

titulo('4 · A37: el motor de un par y la cartera de ese par, la misma conversion byte a byte')
const filasJ = [plana('150.000'), ['150.000', '150.000', '149.000', '149.500']]
const mJ = corre(() => uno({ par: 'USDJPY', filas: filasJ, pasos: [abrir1('BUY', '1', { sl: '149.500' }), hasta1] }))
oraculo('CONV', 'USDJPY SL en la fase 2: misma conversion en los dos motores', mJ?.length === 1 && jpy?.length === 1 && 'conversion' in mJ[0] && igual(mJ[0].conversion, jpy[0].conversion), tx({ uno: mJ?.[0]?.conversion, cartera: jpy?.[0]?.conversion }))
const filasP = [plana('150.000'), plana('151.000')]
const mP = corre(() => uno({ par: 'USDJPY', filas: filasP, pasos: [abrir1('BUY', '1'), hasta1, { tipo: 'cerrar', id: 'p1', lotes: '0.25' }] }))
const cP = corre(() => cartera({ pares: ['USDJPY'], mins: { USDJPY: filasP }, pasos: [abrir('USDJPY', 'BUY', '1'), hasta1, { tipo: 'cerrar', id: 'p1', lotes: '0.25' }] }))
oraculo('CONV', 'USDJPY parcial por comando: { USDJPY, cursor + 60, null, 151000 } en los dos', mP?.length === 1 && cP?.length === 1 && igual(mP[0].conversion, conv('USDJPY', T1 + 60, null, 151000n)) && igual(mP[0].conversion, cP[0].conversion), tx({ uno: mP?.[0]?.conversion, cartera: cP?.[0]?.conversion }))
const mE = corre(() => uno({ par: 'EURUSD', filas: [plana('1.10000'), ['1.10000', '1.10000', '1.09000', '1.09500']], pasos: [abrir1('BUY', '1', { sl: '1.09500' }), hasta1] }))
oraculo('CONV', 'EURUSD: null en los dos', mE?.length === 1 && 'conversion' in mE[0] && mE[0].conversion === null && eu?.[0]?.conversion === null, tx(mE))
const rt = corre(() => CA.deserializa(CA.serializa({ x: jpy[0].conversion })).x)
const ordena = o => (o && typeof o === 'object' ? Object.fromEntries(Object.keys(o).sort().map(k => [k, o[k]])) : o)
oraculo('CONV', 'la conversion sobrevive a serializar (valor bigint; las claves, en el orden canonico)', igual(ordena(rt), ordena(jpy?.[0]?.conversion)) && typeof rt?.valor === 'bigint', tx(rt))
fin()
