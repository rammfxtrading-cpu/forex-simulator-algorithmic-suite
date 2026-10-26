/**
 * MOTOR · EL PEOR CAMINO DE LA PANTALLA (cuenta lineal) FRENTE AL DEL MOTOR, CON CONVERSION Y COMISION REALES (orden 1-120 b).
 * La pantalla (lib/sim/vela.js rutaComun) elige el camino de un doji equidistante con SL en los dos caminos o en ninguno
 * por la equity LINEAL en la divisa cotizada (ticks × centesimas de lote, sin conversion ni comision). El motor
 * (cartera.mjs eligeCaminos) la mide en µUSD: conversion real (USDJPY con su propio bid; GBPJPY con USDJPY; AUDCAD con
 * USDCAD) y la comision de costes@1 (3 USD por lote al abrir, tambien la del fill de una pendiente). Spread 0: el spread
 * es otro limite declarado (cambia que nivel se toca, no el orden de los caminos).
 * Familia: dojis equidistantes de 1 a 8 ticks; BUY+SELL a mercado y con pendientes de los dos lados; lotes 1/2, 2/1, 3/1,
 * 1/3, 0,01/2; SL y TP a 1–4 ticks. Oraculo: el camino del motor = el de la pantalla, en TODOS los casos que llegan al
 * desempate por la equity (los demas los decide el SL y ya estan en vela-regla F).
 */
import { titulo, ver, oraculo, fin, importa } from '../lib.mjs'
// EN fase1/ (lo que sigue roto, en rojo a proposito): contra c3b49cb la pantalla elige OTRO camino que el motor cuando
// una pendiente se llena en los dos caminos en momentos distintos: la comision del fill (3 USD/lote) cae antes o despues
// del minimo, y la cuenta lineal no la ve. Pendiente de decision del CTO (1-120 b)
// DECIDIDO (orden 1-121 del CTO, opcion 3, SIMMOTOR1-01): NO es un requisito. Queda en fase1/ como MEDIDA documentada del
// limite de la pantalla vieja (lib/sim/vela.js, que decide cierres por su cuenta hasta el corte). El paquete se despliega
// una sola vez con el corte a la pantalla v1, y desde entonces decide el servidor (el motor): la igualdad motor = pantalla
// solo se exige en lo que la pantalla v1 PINTA desde el servidor (lo confirmado), no en esta cuenta lineal
const M = await importa('lib/motor/motor.mjs'), CA = await importa('lib/motor/cartera.mjs'), I = await importa('lib/motor/instrumentos.mjs')
const { COSTES_1 } = await importa('lib/motor/costes.mjs')
const V = await importa('lib/sim/vela.js')
const PARES9 = ['AUDCAD', 'AUDUSD', 'EURUSD', 'GBPJPY', 'GBPUSD', 'NZDUSD', 'USDCAD', 'USDCHF', 'USDJPY']
const costes = Object.freeze({ version: 'prueba:comision-real', spread_pips: Object.freeze(Object.fromEntries(PARES9.map(p => [p, 0]))), comision_lote_µ: COSTES_1.comision_lote_µ, swap_µ: 0n })
ver('la comision es la de costes@1 (3 USD por lote)', costes.comision_lote_µ === 3_000_000n)
const T = Date.parse('2026-03-03T10:00:00Z') / 1000
const tx = (par, t) => I.deTicks(par, t)
const pant = p => `${p.slice(0, 3)}/${p.slice(3)}`
// los pares auxiliares de conversion y margen, con su vela del minuto (la conversion real se mueve)
const AUX = { USDJPY: ['150.000', '150.400', '149.700', '150.200'], USDCAD: ['1.35000', '1.35300', '1.34800', '1.35100'], GBPUSD: ['1.30000', '1.30100', '1.29900', '1.30050'], AUDUSD: ['0.65000', '0.65100', '0.64900', '0.65050'] }
const auxDe = par => [CA.parBaseUsd(par), I.instrumento(par).conversion].filter(p => p && p !== par)
const BASE = { USDJPY: 150000n, GBPJPY: 190000n, AUDCAD: 90000n }

for (const par of ['USDJPY', 'GBPJPY', 'AUDCAD']) {
  titulo(`${par}: conversion real y comision de costes@1`)
  const o = BASE[par], auxs = auxDe(par)
  let n = 0, desempate = 0, malos = [], porSL = 0, porTipo = {}
  for (let d = 1n; d <= 8n; d++) for (const tipo of ['mm', 'mp', 'pm', 'pp']) for (const [la, lb] of [['1', '2'], ['2', '1'], ['3', '1'], ['1', '3'], ['0.01', '2']]) for (const [s1, t1, s2, t2] of [[1n, 1n, 1n, 1n], [2n, 4n, 4n, 2n], [4n, 2n, 2n, 4n], [3n, 3n, 1n, 4n], [4n, 4n, 4n, 4n]]) {
    const v = { open: o, high: o + d, low: o - d, close: o }
    const e1 = tipo[0] === 'm' ? o : o - 1n, e2 = tipo[1] === 'm' ? o : o + 1n
    const poss = [{ side: 'BUY', pend: tipo[0] === 'p', entry: e1, sl: e1 - s1, tp: e1 + t1, lots: la }, { side: 'SELL', pend: tipo[1] === 'p', entry: e2, sl: e2 + s2, tp: e2 - t2, lots: lb }]
    // el motor: la cartera con sus auxiliares; su eleccion del minuto T + 60
    const velas = { [par]: M.velas(par, [{ time: T, open: tx(par, o), high: tx(par, o), low: tx(par, o), close: tx(par, o) }, { time: T + 60, open: tx(par, v.open), high: tx(par, v.high), low: tx(par, v.low), close: tx(par, v.close) }]) }
    for (const a of auxs) velas[a] = M.velas(a, [{ time: T, open: AUX[a][0], high: AUX[a][0], low: AUX[a][0], close: AUX[a][0] }, { time: T + 60, open: AUX[a][0], high: AUX[a][1], low: AUX[a][2], close: AUX[a][3] }])
    let e = CA.crea({ pares: [par, ...auxs], costes, capital: '1000000' })
    e = CA.aplica(e, { tipo: 'avanzar', hasta: T }, velas).estado
    let rechazo = null
    for (const p of poss) {
      const r = CA.aplica(e, { tipo: 'abrir', par, lado: p.side, lotes: p.lots, sl: tx(par, p.sl), tp: tx(par, p.tp), ...(p.pend ? { orden: 'limit', precio: tx(par, p.entry) } : { orden: 'mercado', cotizadoEn: e.reloj.cursor }) }, velas)
      if (r.resultado !== 'aceptado') { rechazo = r.resultado; break }
      e = r.estado
    }
    if (rechazo) { malos.push(`rechazo ${JSON.stringify(rechazo)}`); continue }
    const motor = CA.eligeCaminos(e, T + 60, velas)[par]?.camino
    // la pantalla, con los mismos precios en texto
    const vp = { open: tx(par, v.open), high: tx(par, v.high), low: tx(par, v.low), close: tx(par, v.close) }
    const pp = poss.map(p => ({ side: p.side, entry: tx(par, p.entry), sl: tx(par, p.sl), tp: tx(par, p.tp), lots: Number(p.lots), llenadaAqui: p.pend }))
    const pantalla = V.rutaComun(pp, vp, { par: pant(par), previo: tx(par, o) })
    const conSL = r => pp.some(p => V.cierreEnVela(p, vp, { llenadaAqui: p.llenadaAqui, par: pant(par), ruta: r }) === 'SL')
    n++
    if (conSL('A') !== conSL('B')) porSL++; else desempate++
    if (motor !== pantalla) { malos.push(`d ${d} ${tipo} lotes ${la}/${lb} sl/tp ${s1}/${t1} ${s2}/${t2}: motor ${motor}, pantalla ${pantalla}`); porTipo[tipo] = (porTipo[tipo] ?? 0) + 1 }
  }
  ver(`${par}: la familia llega al desempate por la equity (no solo al del SL)`, desempate > 0 && porSL > 0, JSON.stringify({ n, desempate, porSL }))
  oraculo('MV-CONV', `${par}: el camino de la pantalla (cuenta lineal) = el del motor (µUSD, conversion y comision reales) en ${n} dojis equidistantes con coberturas (${desempate} por la equity)`, malos.length === 0, JSON.stringify({ n, desempate, malos: malos.length, porTipo, ejemplos: malos.slice(0, 3) }))
}
fin()
