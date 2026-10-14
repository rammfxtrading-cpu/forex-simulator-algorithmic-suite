/**
 * LAS REGLAS DE 1F Y 3F EN EL MOTOR (diseño sim-004 j.6–j.8; decisiones del CTO del 14-oct,
 * q.10: quema con varios pares y comparacion inclusiva). Escrito ANTES que el codigo (contra
 * a7d4da8: en rojo).
 *
 * SUITE_1F (suite-1f@2026-10-12) y SUITE_3F (suite-3f@2026-10-12), sobre la CARTERA:
 *   objetivo 15 (1F) · 5·5·5 (3F), sobre cerrados; DD diario 5 % del saldo al empezar el dia
 *   (Madrid: la misma regla de la UE que Praga); DD total 10 % del capital; dias minimos 0;
 *   tocar el limite es fallar (≤); al quemar, cada posicion se cierra a su precio del punto
 *   empujado 5 ticks hacia el lado peor y recortado a la vela de SU par en ese minuto; sin
 *   vela de ese par (comando, reset, par sin vela), sin empuje: su ultimo precio.
 * FTMO_2STEP no cambia (estricto, sin empuje): sus oraculos siguen en pruebas/motor/reto.mjs.
 *
 * Cifras a mano (aislado: sin spread; comision por lote c, cobrada al abrir), capital 100.000,
 * base del dia 100.000 → limite diario 95.000 (el total, 90.000, no manda):
 *   1 · el limite exacto, con un par: BUY 1 EURUSD a 1,10000 (c), vela hasta 1,05001:
 *       equity minima = 100.000 − c − 4.999 → c = 0,999999 → 95.000,000001 (no falla);
 *       c = 1 → 95.000 exacto (FALLA); c = 1,000001 → 94.999,999999 (falla). En 1F y en 3F.
 *   2 · el limite exacto, con dos pares: BUY 1 EURUSD (−4.999 ticks) y BUY 0,01 GBPUSD (−2
 *       ticks, 0,02 USD), los dos en la fase 2 del mismo minuto (camino B): comision total
 *       T = c + ⌊c/100⌋; equity = 100.000 − T − 4.999 − 0,02:
 *       c = 970.297 µ → T = 979.999 → +1 µ (no falla); 970.298 → 980.000 → exacto (falla);
 *       970.299 → 980.001 → −1 µ (falla). En 1F y en 3F.
 *   3 · el empuje (j.6, el caso del CTO): BUY 10 EURUSD a 1,10000; velas de minimo 1,09900 y
 *       1,09400: quema en 1,09500 (equity 95.000: ≤), empujada a 1,09495: bruto −5.050,00;
 *       estricto (<) seria 1,09499 → 1,09494 → −5.060. Recortado: con minimo 1,09498, sale en
 *       1,09498 (−5.020).
 *   4 · con varios pares: EURUSD BUY 10 (vela hasta 1,09400), GBPUSD SELL 1 (vela O 1,30000
 *       H 1,30002, camino B: sube en la fase 3) y USDCHF BUY 1 sin vela en ese minuto. La quema
 *       en la fase 2 (EURUSD en 1,09500): EURUSD a 1,09495 (−5.050), GBPUSD de 1,30000 + 5 →
 *       recortado a su maximo 1,30002 (−2), USDCHF a su ultimo precio (0, sin empuje).
 *   5 · sin vela (tras un comando): comision 5.000 por lote; abrir 1 EURUSD deja la equity en
 *       95.000 → quema en el comando, al bid del cursor, sin empuje: bruto 0.
 *   6 · dias minimos 0 (j.8.1): 1F supera el primer dia con un cierre sin posiciones.
 */
import { titulo, oraculo, ver, fin, importa } from '../lib.mjs'
const M = await importa('lib/motor/motor.mjs')
const CA = await importa('lib/motor/cartera.mjs')
const RT = await importa('lib/motor/reto.mjs')
const T0 = Date.parse('2026-03-03T10:00:00Z') / 1000
const PARES9 = ['AUDCAD', 'AUDUSD', 'EURUSD', 'GBPJPY', 'GBPUSD', 'NZDUSD', 'USDCAD', 'USDCHF', 'USDJPY']
const costes = c => Object.freeze({ version: `prueba:0:${c}`, spread_pips: Object.freeze(Object.fromEntries(PARES9.map(p => [p, 0]))), comision_lote_µ: BigInt(c), swap_µ: 0n })
const plana = p => [p, p, p, p]
const mercado = mins => Object.fromEntries(Object.entries(mins).map(([par, vs]) => [par, M.velas(par, vs.map((v, i) => v && { time: T0 + 60 * i, open: v[0], high: v[1], low: v[2], close: v[3] }).filter(Boolean))]))
const tx = x => JSON.stringify(x, (k, v) => (typeof v === 'bigint' ? `${v}n` : v))
const corre = f => { try { return f() } catch (e) { return { error: String(e?.message ?? e) } } }
const REGLAS = { '1F': RT.SUITE_1F, '3F': RT.SUITE_3F }

// un reto de la suite sobre la cartera, ya en el minuto 0; pasos: comandos o { hasta: i }
function reto(tipo, { pares, c = 0, mins, pasos, fase = 1 }) {
  const velas = mercado(mins)
  let r = RT.creaReto({ motor: CA.crea({ pares, costes: costes(c), capital: '100000' }), fase, inicio: T0, reglas: REGLAS[tipo] ?? (() => { throw new Error(`sin las reglas ${tipo}`) })() })
  r = RT.avanzaReto(r, T0, velas).reto
  const ev = []
  for (const p of pasos) {
    const x = p.hasta != null ? RT.avanzaReto(r, T0 + 60 * p.hasta, velas) : RT.aplicaReto(r, typeof p === 'function' ? p(r) : p)
    r = x.reto; ev.push(...x.eventos)
  }
  return { r, ev }
}
const abre = (par, lado, lotes) => r => ({ tipo: 'abrir', par, lado, orden: 'mercado', lotes, cotizadoEn: r.motor.reloj.cursor })
const cierres = ev => ev.filter(x => x.tipo === 'cierre')

titulo('0 · las constantes')
oraculo('SUIT', 'SUITE_1F y SUITE_3F: ids congelados, objetivos 15 y 5·5·5, 5 % diario del saldo, 10 % total, 0 dias, Europe/Madrid', RT.SUITE_1F?.version === 'suite-1f@2026-10-12' && RT.SUITE_3F?.version === 'suite-3f@2026-10-12' && RT.SUITE_1F.objetivo[1] === 15 && RT.SUITE_3F.objetivo[3] === 5 && RT.SUITE_1F.fases === 1 && RT.SUITE_3F.fases === 3 && RT.SUITE_1F.dias_minimos === 0 && RT.SUITE_1F.zona === 'Europe/Madrid' && Object.isFrozen(RT.SUITE_1F), tx(RT.SUITE_1F))
oraculo('SUIT', 'FTMO_2STEP no cambia (ni inclusivo ni empuje)', RT.FTMO_2STEP.version === 'ftmo-2step@2026-10-05' && !('limite_inclusivo' in RT.FTMO_2STEP) && !('empuje_ticks' in RT.FTMO_2STEP))
const conUno = corre(() => RT.creaReto({ motor: M.crea({ par: 'EURUSD', costes: costes(0), capital: '100000' }), fase: 1, inicio: T0, reglas: RT.SUITE_1F }))
oraculo('SUIT', 'el motor de un par no acepta la suite (la quema por par es de la cartera)', /cartera/.test(conUno?.error ?? ''), tx(conUno))

titulo('1 · el limite exacto, con un par')
const vela1 = { EURUSD: [plana('1.10000'), ['1.10000', '1.10000', '1.05001', '1.05001']] }
for (const tipo of ['1F', '3F']) {
  for (const [c, falla, que] of [[999_999, false, '1 µUSD por encima: no falla'], [1_000_000, true, 'exactamente en el limite: FALLA'], [1_000_001, true, '1 µUSD por debajo: falla']]) {
    const x = corre(() => reto(tipo, { pares: ['EURUSD'], c, mins: vela1, pasos: [abre('EURUSD', 'BUY', '1'), { hasta: 1 }] }))
    const b = x.ev?.find(e => e.tipo === 'breach')
    oraculo('SUIT', `${tipo}, un par, ${que}`, !x.error && (falla ? x.r.estado === 'breach' && b?.regla === 'perdida_diaria' && b.equity_µ === 95_001_000_000n - BigInt(c) : x.r.estado === 'en_curso' && !b), tx({ estado: x.r?.estado, b, err: x.error }))
  }
}

titulo('2 · el limite exacto, con dos pares')
const vela2 = { EURUSD: [plana('1.10000'), ['1.10000', '1.10000', '1.05001', '1.05001']], GBPUSD: [plana('1.30000'), ['1.30000', '1.30000', '1.29998', '1.29998']] }
for (const tipo of ['1F', '3F']) {
  for (const [c, falla, que] of [[970_297, false, '1 µUSD por encima: no falla'], [970_298, true, 'exacto: FALLA'], [970_299, true, '1 µUSD por debajo: falla']]) {
    const x = corre(() => reto(tipo, { pares: ['EURUSD', 'GBPUSD'], c, mins: vela2, pasos: [abre('EURUSD', 'BUY', '1'), abre('GBPUSD', 'BUY', '0.01'), { hasta: 1 }] }))
    const b = x.ev?.find(e => e.tipo === 'breach')
    const T = BigInt(c) + BigInt(c) / 100n
    oraculo('SUIT', `${tipo}, dos pares, ${que} (equity minima ${100_000_000_000n - T - 4_999_000_000n - 20_000n} µ)`, !x.error && (falla ? x.r.estado === 'breach' && b?.equity_µ === 100_000_000_000n - T - 4_999_000_000n - 20_000n : x.r.estado === 'en_curso' && !b), tx({ estado: x.r?.estado, b, err: x.error }))
  }
}

titulo('3 · el empuje de 5 ticks, recortado a la vela')
const j6 = minimo => ({ EURUSD: [plana('1.10000'), ['1.10000', '1.10000', '1.09900', '1.09900'], ['1.09900', '1.09900', minimo, minimo], ['1.08800', '1.10050', '1.08800', '1.10050']] })
const q = corre(() => reto('1F', { pares: ['EURUSD'], mins: j6('1.09400'), pasos: [abre('EURUSD', 'BUY', '10'), { hasta: 3 }] }))
const qc = cierres(q.ev ?? [])
oraculo('SUIT', 'j.6 (el caso del CTO): quema en 1,09500 (≤), cierre empujado a 1,09495, bruto −5.050,00, en el mismo comando; las velas siguientes no ocurren', qc.length === 1 && qc[0].motivo === 'breach' && qc[0].precio === 109495n && qc[0].bruto_µ === -5_050_000_000n && q.r.estado === 'breach' && q.r.motor.reloj.cursor === T0 + 120, tx({ qc, e: q.r?.estado, err: q.error }))
const qr = corre(() => reto('1F', { pares: ['EURUSD'], mins: j6('1.09498'), pasos: [abre('EURUSD', 'BUY', '10'), { hasta: 3 }] }))
const qrc = cierres(qr.ev ?? [])
oraculo('SUIT', 'recortado: con minimo 1,09498 el cierre sale en 1,09498 (−5.020,00), no por debajo de la vela', qrc.length === 1 && qrc[0].precio === 109498n && qrc[0].bruto_µ === -5_020_000_000n, tx({ qrc, err: qr.error }))
const ft = corre(() => { const velas = mercado(j6('1.09400')); let r = RT.creaReto({ motor: CA.crea({ pares: ['EURUSD'], costes: costes(0), capital: '100000' }), fase: 1, inicio: T0 }); r = RT.avanzaReto(r, T0, velas).reto; const a = RT.aplicaReto(r, { tipo: 'abrir', par: 'EURUSD', lado: 'BUY', orden: 'mercado', lotes: '10', cotizadoEn: T0 }); const b = RT.avanzaReto(a.reto, T0 + 180, velas); return cierres(b.eventos) })
oraculo('SUIT', 'control FTMO_2STEP: estricto y sin empuje (limite diario 95.000 sobre el capital): sale en 1,09499', ft?.length === 1 && ft[0].precio === 109499n, tx(ft))

titulo('4 · con varios pares, cada uno con su vela')
const m4 = { EURUSD: [plana('1.10000'), ['1.10000', '1.10000', '1.09400', '1.09400']], GBPUSD: [plana('1.30000'), ['1.30000', '1.30002', '1.30000', '1.30000']], USDCHF: [plana('0.88000'), null] }
const v = corre(() => reto('3F', { pares: ['EURUSD', 'GBPUSD', 'USDCHF'], mins: m4, pasos: [abre('EURUSD', 'BUY', '10'), abre('GBPUSD', 'SELL', '1'), abre('USDCHF', 'BUY', '1'), { hasta: 1 }] }))
const vc = Object.fromEntries(cierres(v.ev ?? []).map(x => [x.par, x]))
oraculo('SUIT', 'EURUSD empujado a 1,09495 (−5.050), GBPUSD de 1,30000 + 5 recortado a su maximo 1,30002 (−2), USDCHF sin vela: a su ultimo precio 0,88000 (0)', vc.EURUSD?.precio === 109495n && vc.EURUSD.bruto_µ === -5_050_000_000n && vc.GBPUSD?.precio === 130002n && vc.GBPUSD.bruto_µ === -2_000_000n && vc.USDCHF?.precio === 88000n && vc.USDCHF.bruto_µ === 0n, tx({ vc, err: v.error }))

titulo('5 · sin vela: la quema de un comando, sin empuje')
const s = corre(() => reto('1F', { pares: ['EURUSD'], c: 5_000_000_000, mins: { EURUSD: [plana('1.10000')] }, pasos: [abre('EURUSD', 'BUY', '1')] }))
const sc = cierres(s.ev ?? [])
oraculo('SUIT', 'abrir deja la equity en 95.000 exacto: quema en el comando, al bid del cursor (1,10000), bruto 0', s.r?.estado === 'breach' && sc.length === 1 && sc[0].precio === 110000n && sc[0].bruto_µ === 0n, tx({ sc, e: s.r?.estado, err: s.error }))

titulo('6 · dias minimos 0')
const d = corre(() => reto('1F', { pares: ['EURUSD'], mins: { EURUSD: [plana('1.10000'), ['1.10000', '1.25000', '1.10000', '1.25000']] }, pasos: [r => ({ tipo: 'abrir', par: 'EURUSD', lado: 'BUY', orden: 'mercado', lotes: '1', cotizadoEn: r.motor.reloj.cursor, tp: '1.25000' }), { hasta: 1 }] }))
oraculo('SUIT', '1F: +15.000 con un TP el primer dia y sin posiciones → superada (0 dias minimos; con el 4 fijo de FTMO no)', d.r?.estado === 'superada', tx({ e: d.r?.estado, err: d.error, ev: d.ev?.map(x => x.tipo) }))
fin()
