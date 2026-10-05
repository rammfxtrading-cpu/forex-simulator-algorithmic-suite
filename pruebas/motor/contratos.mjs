/**
 * MOTOR · PIEZA 1: CONTRATOS PUROS DE DINERO, INSTRUMENTOS Y COSTES
 * (especificacion v2.1, § 2.3, § 2.4, § 3.7, § 12.5, § 12.10; CTO 5-oct-2026)
 *
 * Oraculos escritos ANTES que el codigo, con cifras calculadas con fracciones
 * exactas (Python fractions), nunca con coma flotante:
 *   · redondeo al µUSD: al mas cercano, mitades exactas AL PAR
 *   · precios en ticks (enteros), lotes en centesimas (enteros)
 *   · costes@1 (aprobados por Ramon): spreads en pips, 3 USD/lote, swap 0
 *   · A02 (spread 1 pip aislado): −10 bruto, −13 neto
 *   · A08 USDJPY: 150→151 = 662.251.656 µ; neto en 142,861 = −5.000.165.077 µ
 *     (incumple −5.000), en 142,862 = −4.999.430.121 µ (no incumple)
 *   · A11 (a): 190 bruto / 187 neto; 47,50 + 142,50. (b) residuo por
 *     posicion: 166.666 + 499.996 = 666.662 µ (sin residuo, 666.663)
 *   · A12: 0,01 lote = 30.000 µ; asignacion con remanente al ultimo cierre
 */
import { titulo, ver, oraculo, fin, importa } from '../lib.mjs'
const Q = await importa('lib/motor/racional.mjs')
const D = await importa('lib/motor/dinero.mjs')
const I = await importa('lib/motor/instrumentos.mjs')
const C = await importa('lib/motor/costes.mjs')
const lanza = f => { try { f(); return false } catch { return true } }

titulo('1 · racionales exactos')
oraculo('M1', '1/3 + 1/6 = 1/2 y 1,10010 se lee sin coma flotante', Q.compara(Q.suma(Q.R(1n, 3n), Q.R(1n, 6n)), Q.R(1n, 2n)) === 0 && Q.compara(Q.deDecimal('1.10010'), Q.R(110010n, 100000n)) === 0)
oraculo('M1', '0,1 + 0,2 = 0,3 exacto (en coma flotante no)', Q.compara(Q.suma(Q.deDecimal('0.1'), Q.deDecimal('0.2')), Q.deDecimal('0.3')) === 0)

titulo('2 · redondeo al µ: al mas cercano, mitades al par')
const casos = [[5n, 2n, 2n], [7n, 2n, 4n], [-5n, 2n, -2n], [-7n, 2n, -4n], [12n, 5n, 2n], [13n, 5n, 3n], [-13n, 5n, -3n], [1n, 2n, 0n], [3n, 2n, 2n]]
const mal = casos.filter(([n, d, e]) => D.redondeaAlPar(Q.R(n, d)) !== e).map(([n, d, e]) => `${n}/${d}→${D.redondeaAlPar(Q.R(n, d))} (≠${e})`)
oraculo('M1', '5/2→2, 7/2→4, −5/2→−2, −7/2→−4, 2,4→2, 2,6→3, −2,6→−3, 1/2→0, 3/2→2', mal.length === 0, mal.join(' '))

titulo('3 · instrumentos: ticks y centesimas')
oraculo('M1', 'los 9 pares, ni uno mas', JSON.stringify(Object.keys(I.INSTRUMENTOS).sort()) === JSON.stringify(['AUDCAD', 'AUDUSD', 'EURUSD', 'GBPJPY', 'GBPUSD', 'NZDUSD', 'USDCAD', 'USDCHF', 'USDJPY']))
oraculo('M1', 'EURUSD 1,10010 = 110.010 ticks; USDJPY 150,001 = 150.001 ticks; ida y vuelta', I.aTicks('EURUSD', '1.10010') === 110010n && I.aTicks('USDJPY', '150.001') === 150001n && I.deTicks('EURUSD', 110010n) === '1.10010' && I.deTicks('GBPJPY', 190000n) === '190.000')
oraculo('M1', 'un precio fuera de la rejilla (1,100105) o no numerico se rechaza', lanza(() => I.aTicks('EURUSD', '1.100105')) && lanza(() => I.aTicks('EURUSD', 'abc')) && lanza(() => I.aTicks('EURUSD', '-1.1')))
oraculo('M1', 'lotes en centesimas: 1 → 100, 0,25 → 25, 0,01 → 1; 0,005 y 0 se rechazan', I.aCentesimas('1') === 100n && I.aCentesimas('0.25') === 25n && I.aCentesimas('0.01') === 1n && lanza(() => I.aCentesimas('0.005')) && lanza(() => I.aCentesimas('0')))
oraculo('M1', 'conversion: USD cotizada directa; USD base, entre su precio; cruces por su par (AUDCAD÷USDCAD, GBPJPY÷USDJPY)',
  I.INSTRUMENTOS.EURUSD.conversion === null && I.INSTRUMENTOS.USDJPY.conversion === 'USDJPY' && I.INSTRUMENTOS.AUDCAD.conversion === 'USDCAD' && I.INSTRUMENTOS.GBPJPY.conversion === 'USDJPY')

titulo('4 · costes@1 (aprobados por Ramon, 5-oct)')
const esperados = { EURUSD: 3n, USDJPY: 4n, AUDUSD: 5n, GBPUSD: 6n, USDCHF: 7n, USDCAD: 7n, NZDUSD: 8n, AUDCAD: 12n, GBPJPY: 14n }
const spreads = Object.fromEntries(Object.keys(esperados).map(p => [p, C.spreadTicks(C.COSTES_1, p)]))
oraculo('M1', 'spreads en ticks (pip = 10 ticks): 0,3 → 3 … 1,4 → 14', Object.entries(esperados).every(([p, t]) => spreads[p] === t), JSON.stringify(spreads, (k, v) => typeof v === 'bigint' ? String(v) : v))
oraculo('M1', 'version costes@1, 3.000.000 µ por lote, swap 0, y la tabla no se puede editar', C.COSTES_1.version === 'costes@1' && C.COSTES_1.comision_lote_µ === 3_000_000n && C.COSTES_1.swap_µ === 0n && Object.isFrozen(C.COSTES_1) && Object.isFrozen(C.COSTES_1.spread_pips))

titulo('5 · A12: comision')
oraculo('A12', '0,01 lote = 30.000 µ (0,03 USD), no 0,04', D.comisionApertura(C.COSTES_1, 1n) === 30_000n)
const asig = (lotesIniciales, cierres) => { let asignada = 0n, cerrados = 0n; return cierres.map(l => { const a = D.asignaComision({ devengada_µ: D.comisionApertura(C.COSTES_1, lotesIniciales), asignada_µ: asignada, lotesIniciales, cerradosAntes: cerrados, lotesCierre: l }); asignada += a; cerrados += l; return a }) }
const a1 = asig(100n, [25n, 75n]), a2 = asig(100n, [33n, 33n, 34n])
oraculo('A12', '1 lote cerrado 0,25 + 0,75: 750.000 + 2.250.000', a1[0] === 750_000n && a1[1] === 2_250_000n, a1.join(' + '))
oraculo('A12', '0,33 + 0,33 + 0,34: 990.000 + 990.000 + 1.020.000 (remanente al ultimo; suma 3.000.000)', a2[0] === 990_000n && a2[1] === 990_000n && a2[2] === 1_020_000n, a2.join(' + '))

titulo('6 · A02: spread de 1 pip aislado')
const brutoA02 = D.usdAMicro(I.pnlUSD('EURUSD', 'BUY', 100n, I.aTicks('EURUSD', '1.10010'), I.aTicks('EURUSD', '1.10000')))
oraculo('A02', 'BUY entra 1,10010 (ask), sale 1,10000: bruto −10.000.000 µ, neto −13.000.000 µ', brutoA02 === -10_000_000n && brutoA02 - D.comisionApertura(C.COSTES_1, 100n) === -13_000_000n, String(brutoA02))
const brutoA02s = D.usdAMicro(I.pnlUSD('EURUSD', 'SELL', 100n, I.aTicks('EURUSD', '1.10000'), I.aTicks('EURUSD', '1.10010')))
oraculo('A02', 'SELL entra 1,10000, sale 1,10010: bruto −10.000.000 µ', brutoA02s === -10_000_000n, String(brutoA02s))

titulo('7 · A08: USDJPY, conversion racional entre su propio precio')
const jpy = x => I.pnlUSD('USDJPY', 'BUY', 100n, I.aTicks('USDJPY', '150.000'), I.aTicks('USDJPY', x))
oraculo('A08', '150 → 151: +662.251.656 µ (662,251655629… redondeado al µ)', D.usdAMicro(jpy('151.000')) === 662_251_656n, String(D.usdAMicro(jpy('151.000'))))
const neto = x => D.usdAMicro(jpy(x)) - 3_000_000n
oraculo('A08', 'neto en 142,861 = −5.000.165.077 µ (incumple −5.000); en 142,862 = −4.999.430.121 µ (no)', neto('142.861') === -5_000_165_077n && neto('142.862') === -4_999_430_121n, `${neto('142.861')} · ${neto('142.862')}`)

titulo('8 · A11: cierres parciales y residuo por posicion')
const eur = l => I.pnlUSD('EURUSD', 'BUY', l, I.aTicks('EURUSD', '1.10010'), I.aTicks('EURUSD', '1.10200'))
oraculo('A11', '(a) completo: 190.000.000 µ bruto, 187.000.000 neto', D.usdAMicro(eur(100n)) === 190_000_000n && D.usdAMicro(eur(100n)) - 3_000_000n === 187_000_000n)
const parciales = (fn, cortes) => { let exacto = Q.R(0n), red = 0n; return cortes.map(l => { const r = D.cierreConResiduo({ exactoPrevio: exacto, redondeadoPrevio_µ: red, exactoCierre: fn(l) }); exacto = r.exactoTotal; red = r.redondeadoTotal_µ; return r.pnl_µ }) }
const pa = parciales(eur, [25n, 75n])
oraculo('A11', '(a) 0,25 + 0,75: 47.500.000 + 142.500.000 = 190.000.000', pa[0] === 47_500_000n && pa[1] === 142_500_000n, pa.join(' + '))
const jp = l => I.pnlUSD('USDJPY', 'BUY', l, I.aTicks('USDJPY', '150.000'), I.aTicks('USDJPY', '150.001'))
const pb = parciales(jp, [25n, 75n])
ver('control: sin residuo, los parciales sumarian 666.663 µ (166.666 + 499.997)', D.usdAMicro(jp(25n)) + D.usdAMicro(jp(75n)) === 666_663n)
oraculo('A11', '(b) con residuo: 166.666 + 499.996 = 666.662 µ, igual que el cierre completo', pb[0] === 166_666n && pb[1] === 499_996n && D.usdAMicro(jp(100n)) === 666_662n, `${pb.join(' + ')} · completo ${D.usdAMicro(jp(100n))}`)
fin()
