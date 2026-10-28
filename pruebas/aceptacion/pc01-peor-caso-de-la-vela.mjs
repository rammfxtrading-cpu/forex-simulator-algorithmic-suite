/**
 * PC01 · EL PEOR CASO DE LA VELA (orden 1-158 del CTO, decision 1; lib/sim/peorCaso.js)
 * Funcion pura: con el ultimo reto confirmado, los cierres sin confirmar (perdida maxima: la del SL), lo abierto en el
 * extremo adverso de la vela y las pendientes que llena, ¿queda lejos de los dos limites (con un margen de 0,1 % del
 * capital)? Si si, el Play no espera la confirmacion. Reglas de lib/challengeRules.js: diario 5 % del inicio del dia,
 * total 10 % del capital.
 * ORACULOS, a mano. Reto de 100.000, EUR/USD (10 USD por pip y lote). Reto confirmado: balance 100.000, limite diario
 * 5.000 (inicio del dia 100.000), caida del dia 0, limite total 10.000. Margen 100.
 *   lejos: cierre BUY 1 lote en su SL (−100; cuenta 100,01) + SELL 1 lote abierta, vela 1,098–1,102 (−200)
 *          → diario 300,01 < 0,05 × 99.899,99 − 100; seguro
 *   cierre SELL 10 lotes en su SL (−1.000; 1.000,01) + SELL 10 lotes abierta; limite diario 0,05 × 98.999,99 = 4.949,9995,
 *   con el margen 4.849,9995:
 *     maximo 1,1038 (−3.800) → 4.800,01: seguro (fuera del margen)
 *     maximo 1,1039 (−3.900) → 4.900,01: NO (dentro del margen, aun sin llegar al limite)
 *     maximo 1,1040 (−4.000) → 5.000,01: NO (pasado el limite)
 *   sin SL: el cierre no tiene cota → NO (se espera, como antes)
 *   largo y corto: BUY 1 lote vela 1,099–1,2 cuenta el minimo (−100, no +1.000); SELL 1 lote vela 1,0–1,101 el maximo (−100)
 *   pendiente: BUY_LIMIT 10 lotes a 1,098 con la vela 1,095–1,1 se llena: −3.000; a 1,09 no se llena: 0.
 *              SELL_LIMIT 1 lote a 1,102 con maximo 1,105: −300
 *   ganancia y hueco: un cierre en su TP (+200, SL a −100) cuenta 100,01; uno pasado su SL (−150) cuenta 150,01
 *   total: balance 91.000 (limite diario 4.550): −500 → total 9.500 seguro; −950 → total 9.950, NO (diario 950, lejos)
 *   dia cambiado: inicio del ultimo dia 100.000 pero balance 97.000 → el limite de hoy 0,05 × 97.000 = 4.850:
 *                 −4.800 → NO (con el margen, 4.750; con el del ultimo dia pasaria); −4.600 → seguro
 *   costes: SELL 1 lote −200 con 7 de costes → 207
 *   sin reto confirmado → NO; margen 0 → 4.900,01 seguro; margen 1 (el control de la prueba de Chrome) → lejos, NO
 * Y lo apuntado: un cierre apuntado tras tomar la foto de la relectura sigue sin contar cuando ella responde.
 */
import { ver, oraculo, fin, importa } from '../lib.mjs'
const PC = await importa('lib/sim/peorCaso.js').catch(() => null)
if (!PC?.peorCasoDeLaVela) { oraculo('PC01', 'la funcion del peor caso', false, 'no esta'); fin() }
const { peorCasoDeLaVela: pc } = PC
const P = 'EUR/USD'
const EV = { balanceNow: 100000, ddDailyCapUSD: 5000, ddDailyCapPct: 5, ddDailyCurrentUSD: 0, ddTotalCapUSD: 10000, status: 'active' }
const base = { capital: 100000, evaluacion: EV }
const cerca = r => Math.abs(r) < 1e-6
const caso = (desc, args, seguro, campo, valor) => {
  const r = pc({ ...base, ...args })
  const okV = campo == null || cerca(r[campo] - valor)
  oraculo('PC01', desc, r.seguro === seguro && okV, JSON.stringify(r))
}
const cierreSl10 = { side: 'SELL', entry: 1.1, sl: 1.101, lots: 10, pair: P, pnl: -1000 }
const corta10 = high => ({ side: 'SELL', entry: 1.1, lots: 10, pair: P, high, low: 1.099 })

caso('lejos: cierre en su SL y otra posicion abierta, seguro', { cierres: [{ side: 'BUY', entry: 1.1, sl: 1.099, lots: 1, pair: P, pnl: -100 }], abiertas: [{ side: 'SELL', entry: 1.1, lots: 1, pair: P, high: 1.102, low: 1.098 }] }, true, 'ddDiario', 300.01)
caso('justo fuera del margen (4.800,01 frente a 4.849,9995): seguro', { cierres: [cierreSl10], abiertas: [corta10(1.1038)] }, true, 'ddDiario', 4800.01)
caso('dentro del margen (4.900,01): se espera', { cierres: [cierreSl10], abiertas: [corta10(1.1039)] }, false, 'capDiario', 4949.9995)
caso('justo pasado el limite (5.000,01): se espera', { cierres: [cierreSl10], abiertas: [corta10(1.104)] }, false, 'ddDiario', 5000.01)
caso('cierre sin SL: se espera (sin cota)', { cierres: [{ ...cierreSl10, sl: 0 }], abiertas: [corta10(1.1001)] }, false, null)
{ const r = pc({ ...base, cierres: [{ ...cierreSl10, sl: null }], abiertas: [] }); oraculo('PC01', 'cierre sin SL: el motivo', r.seguro === false && r.motivo === 'cierre sin SL', JSON.stringify(r)) }
caso('largo: cuenta el minimo de la vela', { abiertas: [{ side: 'BUY', entry: 1.1, lots: 1, pair: P, high: 1.2, low: 1.099 }] }, true, 'ddDiario', 100)
caso('corto: cuenta el maximo de la vela', { abiertas: [{ side: 'SELL', entry: 1.1, lots: 1, pair: P, high: 1.101, low: 1.0 }] }, true, 'ddDiario', 100)
caso('pendiente que la vela llena: desde su entrada hasta su peor precio', { pendientes: [{ side: 'BUY_LIMIT', entry: 1.098, lots: 10, pair: P, high: 1.1, low: 1.095 }] }, true, 'ddDiario', 3000)
caso('pendiente que la vela no llena: no cuenta', { pendientes: [{ side: 'BUY_LIMIT', entry: 1.09, lots: 10, pair: P, high: 1.1, low: 1.095 }] }, true, 'ddDiario', 0)
caso('pendiente corta que se llena: su maximo', { pendientes: [{ side: 'SELL_LIMIT', entry: 1.102, lots: 1, pair: P, high: 1.105, low: 1.1 }] }, true, 'ddDiario', 300)
caso('pendiente que se llena y lleva al limite: se espera', { cierres: [cierreSl10], pendientes: [{ side: 'BUY_LIMIT', entry: 1.098, lots: 10, pair: P, high: 1.1, low: 1.094 }] }, false, 'ddDiario', 5000.01)
caso('cierre con ganancia: cuenta como la perdida de su SL', { cierres: [{ side: 'BUY', entry: 1.1, sl: 1.099, lots: 1, pair: P, pnl: 200 }] }, true, 'ddDiario', 100.01)
caso('cierre pasado su SL (hueco): cuenta su pnl', { cierres: [{ side: 'BUY', entry: 1.1, sl: 1.099, lots: 1, pair: P, pnl: -150 }] }, true, 'ddDiario', 150.01)
const EV91 = { ...EV, balanceNow: 91000, ddDailyCapUSD: 4550 }
caso('limite total: 9.500, seguro', { evaluacion: EV91, abiertas: [{ side: 'SELL', entry: 1.1, lots: 1, pair: P, high: 1.105, low: 1.1 }] }, true, 'ddTotal', 9500)
caso('limite total: 9.950 (diario 950, lejos), se espera', { evaluacion: EV91, abiertas: [{ side: 'SELL', entry: 1.1, lots: 1, pair: P, high: 1.1095, low: 1.1 }] }, false, 'ddTotal', 9950)
const EV97 = { ...EV, balanceNow: 97000, ddDailyCapUSD: 5000 }
caso('dia cambiado: el inicio de hoy es el balance (4.850, con el margen 4.750); −4.800 se espera (con el limite del ultimo dia, 4.900, pasaria)', { evaluacion: EV97, abiertas: [{ side: 'SELL', entry: 1.1, lots: 1, pair: P, high: 1.148, low: 1.1 }] }, false, 'capDiario', 4850)
caso('dia cambiado: −4.600 seguro', { evaluacion: EV97, abiertas: [{ side: 'SELL', entry: 1.1, lots: 1, pair: P, high: 1.146, low: 1.1 }] }, true, 'ddDiario', 4600)
caso('caida del dia ya confirmada: se suma', { evaluacion: { ...EV, ddDailyCurrentUSD: 1234 }, abiertas: [{ side: 'SELL', entry: 1.1, lots: 1, pair: P, high: 1.101, low: 1.1 }] }, true, 'ddDiario', 1334)
caso('costes: se restan', { abiertas: [{ side: 'SELL', entry: 1.1, lots: 1, pair: P, high: 1.102, low: 1.1, costes: 7 }] }, true, 'ddDiario', 207)
caso('sin reto confirmado: se espera', { evaluacion: null }, false, null)
caso('margen 0: 4.900,01 ya es seguro', { cierres: [cierreSl10], abiertas: [corta10(1.1039)], margen: 0 }, true, 'margenUSD', 0)
caso('margen 1 (el control de Chrome): ni lo lejano es seguro', { cierres: [{ side: 'BUY', entry: 1.1, sl: 1.099, lots: 1, pair: P, pnl: -100 }], abiertas: [{ side: 'SELL', entry: 1.1, lots: 1, pair: P, high: 1.102, low: 1.098 }], margen: 1 }, false, 'margenUSD', 100000)
{ globalThis.__simMargenPeorCaso = 1
  const r = pc({ ...base, abiertas: [{ side: 'SELL', entry: 1.1, lots: 1, pair: P, high: 1.101, low: 1.1 }] })
  delete globalThis.__simMargenPeorCaso
  const r2 = pc({ ...base, abiertas: [{ side: 'SELL', entry: 1.1, lots: 1, pair: P, high: 1.101, low: 1.1 }] })
  oraculo('PC01', 'el margen de la pagina (globalThis.__simMargenPeorCaso = 1) manda; quitado, vuelve el 0,1 %', r.seguro === false && r2.seguro === true && r2.margenUSD === 100, JSON.stringify([r.seguro, r2.seguro, r2.margenUSD])) }

// lo apuntado: la relectura toma los de antes de encolarse; uno apuntado despues sigue sin contar
PC.reiniciaPeorCaso()
const S = 'ses-pc01', a = PC.apuntaCierre(S, { posId: 1 }), tomados = PC.tomaCierres(S), b = PC.apuntaCierre(S, { posId: 2 })
PC.retoLeido(S, { evaluation: EV, capital: 100000 }, tomados)
oraculo('PC01', 'al responder la relectura, solo quedan los cierres apuntados despues de encolarla', JSON.stringify(PC.cierresSinReto(S)) === JSON.stringify([b]) && PC.retoConfirmado(S)?.capital === 100000, JSON.stringify(PC.cierresSinReto(S)))
ver('control: el primero era el apuntado antes', tomados.length === 1 && tomados[0] === a)
fin()
