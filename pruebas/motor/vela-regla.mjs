/**
 * MOTOR · LA REGLA DE LA VELA EN EL MOTOR V1 (sim-motor-e1; ordenes 1-085, 1-100, 1-117 y 1-118 del CTO).
 * Escrita ANTES que el codigo: contra 43d01b4 (el motor elige el camino peor para la cartera) tiene que salir en rojo.
 *
 * La regla (la de la pantalla, lib/sim/vela.js): alcista O→L→H→C, bajista O→H→L→C, doji el extremo mas cercano a la
 * apertura en decimas de pip (mitad hacia arriba), equidistante → el SL; una pendiente llenada en la vela mira su SL y
 * su TP desde su entrada. En el motor los precios son ticks de la rejilla del par (un tick = una decima de pip en los
 * 9 pares): la regla se compara en enteros, sin nada que redondear.
 *
 * EL ORACULO es independiente del motor y de lib/sim/vela.js: recorre el precio TICK A TICK, en enteros, por los
 * recorridos que da la regla (el de Astra, astra-bordes-r2: decimas floor((d+5)/10) en centesimas de pip, que con
 * ticks enteros es la identidad), y con un doji equidistante: SL si algun recorrido da SL, TP solo si los dos dan TP.
 *   A · barrido en la rejilla: 9 pares, posicion a mercado BUY/SELL, velas alcistas, bajistas y doji de 1 a 12 ticks
 *       por cada lado, SL y TP a 1–4 ticks; motor de un par (los 7 sin cruce) y cartera (los 9), y la PANTALLA
 *       (cierreEnVela) con los mismos precios en texto: los tres iguales al oraculo, vela a vela
 *   B · pendientes LIMIT llenadas en la vela (tambien por hueco de apertura): motivo del motor = oraculo = pantalla
 *   C · el subconjunto en la rejilla del barrido de Astra (sv03 A: dojis de 10 y 11 ticks, SL/TP a 5 ticks)
 *   D · casos a mano (motivo escrito a mano, con su porque)
 *   E · las familias de sv03 B (fuera de la rejilla: centesimas de pip, JPY con 4 decimales): MEDIDA, no oraculo.
 *       El motor no las admite (aTicks: «fuera de la rejilla»), ni en la vela (publicador-v1) ni en el SL/TP del
 *       comando. Que eso valga como contrato lo decide el CTO (choque declarado en el encargo sim-motor-e1-r1).
 */
import { titulo, ver, oraculo, fin, importa } from '../lib.mjs'
const M = await importa('lib/motor/motor.mjs')
const CA = await importa('lib/motor/cartera.mjs')
const I = await importa('lib/motor/instrumentos.mjs')
const V = await importa('lib/sim/vela.js')
ver('la pantalla expone cierreEnVela', typeof V.cierreEnVela === 'function')

const PARES9 = ['AUDCAD', 'AUDUSD', 'EURUSD', 'GBPJPY', 'GBPUSD', 'NZDUSD', 'USDCAD', 'USDCHF', 'USDJPY']
const aislado = Object.freeze({ version: 'prueba:vela', spread_pips: Object.freeze(Object.fromEntries(PARES9.map(p => [p, 0]))), comision_lote_µ: 0n, swap_µ: 0n })
const pantallaPar = p => `${p.slice(0, 3)}/${p.slice(3)}`
const T = Date.parse('2026-03-03T10:00:00Z') / 1000
// los pares auxiliares de la cartera (conversion y margen), quietos
const AUX = { USDJPY: '150.000', USDCAD: '1.35000', GBPUSD: '1.30000', AUDUSD: '0.65000' }
const auxDe = par => [CA.parBaseUsd(par), I.instrumento(par).conversion].filter(p => p && p !== par)
const tx = (par, t) => I.deTicks(par, t)

// ── el oraculo: tick a tick ─────────────────────────────────────────────────────
// v en ticks (BigInt); pos: { lado, sl, tp, entrada (solo pendiente), pendiente }
function recorridosOraculo(v) {
  const dec = d => (d * 10n + 5n) / 10n                 // Astra: floor((d+5)/10) en centesimas; un tick = 10 centesimas
  const B = [v.open, v.low, v.high, v.close], A = [v.open, v.high, v.low, v.close]
  if (v.close > v.open) return [B]
  if (v.close < v.open) return [A]
  const ab = dec(v.open - v.low), ar = dec(v.high - v.open)
  return ab < ar ? [B] : ar < ab ? [A] : [B, A]
}
function caminaOraculo(pts, pos) {
  const largo = pos.lado === 'BUY'
  let lleno = !pos.pendiente
  const mira = p => {
    if (!lleno && (largo ? p <= pos.entrada : p >= pos.entrada)) lleno = true
    if (!lleno) return null
    if (pos.sl != null && (largo ? p <= pos.sl : p >= pos.sl)) return 'SL'
    if (pos.tp != null && (largo ? p >= pos.tp : p <= pos.tp)) return 'TP'
    return null
  }
  let r = mira(pts[0]); if (r) return r
  for (let k = 1; k < 4; k++) {
    const a = pts[k - 1], b = pts[k], s = b > a ? 1n : -1n
    for (let p = a; p !== b; ) { p += s; r = mira(p); if (r) return r }
  }
  return null
}
function oraculoDe(v, pos) {
  const rs = recorridosOraculo(v).map(pts => caminaOraculo(pts, pos))
  return rs.includes('SL') ? 'SL' : rs.length && rs.every(x => x === 'TP') ? 'TP' : null
}

// ── el motor ────────────────────────────────────────────────────────────────────
// filas: [previa (cursor), la vela probada]; com: el comando abrir sin cotizadoEn
const fila = (time, o, h, l, c) => ({ time, open: o, high: h, low: l, close: c })
const motivoDe = (ev, t) => { const x = ev.find(e => e.tipo === 'cierre' && e.en?.vela === t); return x ? x.motivo : null }
function motorUnPar(par, filas, com) {
  const velas = M.velas(par, filas)
  let e = M.crea({ par, costes: aislado, capital: '100000' })
  e = M.aplica(e, { tipo: 'avanzar', hasta: T }, velas).estado
  const r = M.aplica(e, { tipo: 'abrir', lotes: '1', ...com, cotizadoEn: e.reloj.cursor }, velas)
  if (r.resultado !== 'aceptado') return { rechazo: r.resultado }
  const s = M.aplica(r.estado, { tipo: 'avanzar', hasta: T + 60 }, velas)
  return { motivo: motivoDe(s.eventos, T + 60), fill: s.eventos.some(x => x.tipo === 'fill') }
}
function motorCartera(par, filas, com) {
  const pares = [par, ...auxDe(par)]
  const velas = { [par]: M.velas(par, filas) }
  for (const a of auxDe(par)) velas[a] = M.velas(a, filas.map(f => fila(f.time, AUX[a], AUX[a], AUX[a], AUX[a])))
  let e = CA.crea({ pares, costes: aislado, capital: '100000' })
  e = CA.aplica(e, { tipo: 'avanzar', hasta: T }, velas).estado
  const r = CA.aplica(e, { tipo: 'abrir', par, lotes: '1', ...com, cotizadoEn: e.reloj.cursor }, velas)
  if (r.resultado !== 'aceptado') return { rechazo: r.resultado }
  const s = CA.aplica(r.estado, { tipo: 'avanzar', hasta: T + 60 }, velas)
  return { motivo: motivoDe(s.eventos, T + 60), fill: s.eventos.some(x => x.tipo === 'fill') }
}
// la pantalla, con los mismos precios en texto
const pantalla = (par, v, pos) => V.cierreEnVela({ pair: pantallaPar(par), side: pos.lado, sl: tx(par, pos.sl), tp: tx(par, pos.tp), entry: tx(par, pos.entrada ?? v.open) },
  { open: tx(par, v.open), high: tx(par, v.high), low: tx(par, v.low), close: tx(par, v.close) }, { llenadaAqui: !!pos.pendiente, par: pantallaPar(par) })

const BASES = { EURUSD: [110000n, 70000n], GBPUSD: [130000n, 125431n], AUDUSD: [65000n, 99999n], NZDUSD: [59000n, 61234n], USDCAD: [135000n, 137777n], USDCHF: [90000n, 88001n], AUDCAD: [90000n, 91234n], USDJPY: [150000n, 151234n], GBPJPY: [190000n, 151234n] }
const sinCruce = par => I.instrumento(par).conversion === null || I.instrumento(par).conversion === par

// ── A · barrido en la rejilla, posicion a mercado ───────────────────────────────
titulo('A · barrido en la rejilla: motor de un par, cartera y pantalla contra el oraculo')
const CUENTA = { casos: 0, equidistantes: 0, conSL: 0, conTP: 0, nada: 0 }
for (const par of PARES9) {
  const malos = { un: [], cartera: [], pantalla: [] }; let n = 0
  for (const o of BASES[par]) for (let up = 1n; up <= 12n; up++) for (let dn = 1n; dn <= 12n; dn++) for (const dc of [-1n, 0n, 1n]) for (const lado of ['BUY', 'SELL']) for (const [ds, dt] of [[1n, 4n], [4n, 1n], [3n, 3n], [2n, 5n]]) {
    const c = o + dc
    if (c > o + up || c < o - dn) continue
    const v = { open: o, high: o + up, low: o - dn, close: c }
    const largo = lado === 'BUY'
    const pos = { lado, sl: largo ? o - ds : o + ds, tp: largo ? o + dt : o - dt }
    const e = oraculoDe(v, pos)
    const filas = [fila(T, tx(par, o), tx(par, o), tx(par, o), tx(par, o)), fila(T + 60, tx(par, v.open), tx(par, v.high), tx(par, v.low), tx(par, v.close))]
    const com = { lado, orden: 'mercado', sl: tx(par, pos.sl), tp: tx(par, pos.tp) }
    n++; CUENTA.casos++; if (dc === 0n && up === dn) CUENTA.equidistantes++; CUENTA[e === 'SL' ? 'conSL' : e === 'TP' ? 'conTP' : 'nada']++
    const caso = `${tx(par, o)} H+${up} L-${dn} C${dc >= 0n ? '+' : ''}${dc} ${lado} sl${ds} tp${dt}: esperado ${e}`
    if (sinCruce(par)) { const r = motorUnPar(par, filas, com); if (r.rechazo || r.motivo !== e) malos.un.push(`${caso}, motor ${r.rechazo ? JSON.stringify(r.rechazo) : r.motivo}`) }
    const rc = motorCartera(par, filas, com); if (rc.rechazo || rc.motivo !== e) malos.cartera.push(`${caso}, cartera ${rc.rechazo ? JSON.stringify(rc.rechazo) : rc.motivo}`)
    const rp = pantalla(par, v, pos); if (rp !== e) malos.pantalla.push(`${caso}, pantalla ${rp}`)
  }
  if (sinCruce(par)) oraculo('MV-A', `${par}: motor de un par = oraculo en ${n} velas a mercado`, malos.un.length === 0, JSON.stringify({ n, malos: malos.un.length, ejemplos: malos.un.slice(0, 3) }))
  oraculo('MV-A', `${par}: cartera = oraculo en ${n} velas a mercado`, malos.cartera.length === 0, JSON.stringify({ n, malos: malos.cartera.length, ejemplos: malos.cartera.slice(0, 3) }))
  oraculo('MV-A', `${par}: pantalla = oraculo (luego motor = pantalla) en las mismas ${n} velas`, malos.pantalla.length === 0, JSON.stringify({ n, malos: malos.pantalla.length, ejemplos: malos.pantalla.slice(0, 3) }))
}
ver('el barrido tiene dojis equidistantes y los tres motivos', CUENTA.equidistantes > 0 && CUENTA.conSL > 0 && CUENTA.conTP > 0 && CUENTA.nada > 0, JSON.stringify(CUENTA))

// ── B · pendientes LIMIT llenadas en la vela ────────────────────────────────────
titulo('B · pendientes LIMIT llenadas en la vela (tambien por hueco): su SL y su TP desde su entrada')
const CB = { casos: 0, llenadas: 0, hueco: 0, conSL: 0, conTP: 0 }
for (const par of PARES9) {
  const malos = { un: [], cartera: [], pantalla: [] }; let n = 0
  const o = BASES[par][0]
  for (let up = 1n; up <= 8n; up++) for (let dn = 1n; dn <= 8n; dn++) for (const dc of [-1n, 0n, 1n]) for (const lado of ['BUY', 'SELL']) for (const de of [-1n, 1n, 2n]) for (const [ds, dt] of [[1n, 3n], [3n, 1n], [2n, 2n]]) {
    const c = o + dc
    if (c > o + up || c < o - dn) continue
    const largo = lado === 'BUY'
    // la entrada a «de» ticks de la apertura, del lado de la orden (de = -1: la apertura ya la cruzo: hueco)
    const entrada = largo ? o - de : o + de
    const previo = largo ? entrada + 2n : entrada - 2n              // el cursor, del lado no ejecutable
    const v = { open: o, high: o + up, low: o - dn, close: c }
    const pos = { lado, pendiente: true, entrada, sl: largo ? entrada - ds : entrada + ds, tp: largo ? entrada + dt : entrada - dt }
    const e = oraculoDe(v, pos)
    const filas = [fila(T, tx(par, previo), tx(par, previo), tx(par, previo), tx(par, previo)), fila(T + 60, tx(par, v.open), tx(par, v.high), tx(par, v.low), tx(par, v.close))]
    const com = { lado, orden: 'limit', precio: tx(par, entrada), sl: tx(par, pos.sl), tp: tx(par, pos.tp) }
    n++; CB.casos++; if (de < 0n) CB.hueco++; if (e === 'SL') CB.conSL++; if (e === 'TP') CB.conTP++
    const caso = `${tx(par, o)} H+${up} L-${dn} C${dc >= 0n ? '+' : ''}${dc} ${lado} LIMIT ${tx(par, entrada)} sl${ds} tp${dt}: esperado ${e}`
    if (sinCruce(par)) { const r = motorUnPar(par, filas, com); if (r.fill) CB.llenadas++; if (r.rechazo || r.motivo !== e) malos.un.push(`${caso}, motor ${r.rechazo ? JSON.stringify(r.rechazo) : r.motivo}`) }
    const rc = motorCartera(par, filas, com); if (rc.rechazo || rc.motivo !== e) malos.cartera.push(`${caso}, cartera ${rc.rechazo ? JSON.stringify(rc.rechazo) : rc.motivo}`)
    const rp = pantalla(par, v, pos); if (rp !== e) malos.pantalla.push(`${caso}, pantalla ${rp}`)
  }
  if (sinCruce(par)) oraculo('MV-B', `${par}: motor de un par = oraculo en ${n} pendientes`, malos.un.length === 0, JSON.stringify({ n, malos: malos.un.length, ejemplos: malos.un.slice(0, 3) }))
  oraculo('MV-B', `${par}: cartera = oraculo en ${n} pendientes`, malos.cartera.length === 0, JSON.stringify({ n, malos: malos.cartera.length, ejemplos: malos.cartera.slice(0, 3) }))
  oraculo('MV-B', `${par}: pantalla = oraculo en las mismas ${n} pendientes`, malos.pantalla.length === 0, JSON.stringify({ n, malos: malos.pantalla.length, ejemplos: malos.pantalla.slice(0, 3) }))
}
ver('el barrido B llena, salta por hueco y da SL y TP', CB.llenadas > 0 && CB.hueco > 0 && CB.conSL > 0 && CB.conTP > 0, JSON.stringify(CB))

// ── C · el subconjunto en la rejilla del barrido de Astra (sv03 A) ──────────────
titulo('C · sv03 A en la rejilla: aperturas de la rejilla, dojis de 100 y 110 centesimas (10 y 11 ticks), SL/TP a 50 (5 ticks)')
for (const par of PARES9) {
  const j = par.includes('JPY'), orig = j ? [1500000, 1512345, 1400000, 999995] : [1100000, 1234567, 999995, 700000]
  const malos = []; let n = 0, fuera = 0
  for (const oi of orig) for (let up = 94; up <= 116; up++) for (let down = 94; down <= 116; down++) for (const side of ['BUY', 'SELL']) {
    const precios = [oi, oi + up, oi - down, oi + (side === 'BUY' ? -50 : 50), oi + (side === 'BUY' ? 50 : -50)]
    if (precios.some(x => x % 10 !== 0)) { fuera++; continue }           // fuera de la rejilla: seccion E
    const [o, h, l, sl, tp] = precios.map(x => BigInt(x / 10))
    const v = { open: o, high: h, low: l, close: o }, pos = { lado: side, sl, tp }
    const e = oraculoDe(v, pos)
    const filas = [fila(T, tx(par, o), tx(par, o), tx(par, o), tx(par, o)), fila(T + 60, tx(par, o), tx(par, h), tx(par, l), tx(par, o))]
    const com = { lado: side, orden: 'mercado', sl: tx(par, sl), tp: tx(par, tp) }
    const r = sinCruce(par) ? motorUnPar(par, filas, com) : null, rc = motorCartera(par, filas, com), rp = pantalla(par, v, pos)
    n++
    if ((r && r.motivo !== e) || rc.motivo !== e || rp !== e) malos.push({ o: tx(par, o), up, down, side, e, un: r?.motivo ?? r?.rechazo, cartera: rc.motivo ?? rc.rechazo, pantalla: rp })
  }
  oraculo('MV-C', `${par}: ${n} casos de sv03 A en la rejilla (${fuera} fuera, a la E): motor = cartera = pantalla = oraculo`, n > 0 && malos.length === 0, JSON.stringify({ n, fuera, malos: malos.length, ejemplos: malos.slice(0, 3) }))
}

// ── D · casos a mano ────────────────────────────────────────────────────────────
titulo('D · casos a mano (motivo escrito a mano)')
// cada caso: par, vela [o,h,l,c], orden, motivo a mano y por que
const MANO = [
  ['EURUSD', ['1.10000', '1.10010', '1.09990', '1.10005'], { lado: 'BUY', orden: 'mercado', sl: '1.09995', tp: '1.10005' }, 'SL', 'alcista: O→L→H→C, baja a 1,09990 y toca el SL 1,09995 antes de subir al TP (antes: el peor para la cartera, tambien SL)'],
  ['EURUSD', ['1.10000', '1.10010', '1.09990', '1.10005'], { lado: 'SELL', orden: 'mercado', sl: '1.10005', tp: '1.09995' }, 'TP', 'alcista: O→L→H→C, baja primero al TP 1,09995 de la SELL. ANTES la cartera elegia O→H→L→C (el SL, peor) y daba SL'],
  ['EURUSD', ['1.10000', '1.10010', '1.09990', '1.09995'], { lado: 'BUY', orden: 'mercado', sl: '1.09995', tp: '1.10005' }, 'TP', 'bajista: O→H→L→C, sube al TP 1,10005 antes de bajar al SL. ANTES: SL (el peor)'],
  ['EURUSD', ['1.10000', '1.10010', '1.09990', '1.09995'], { lado: 'SELL', orden: 'mercado', sl: '1.10005', tp: '1.09995' }, 'SL', 'bajista: O→H→L→C, sube al SL 1,10005 de la SELL primero'],
  ['EURUSD', ['1.10000', '1.10003', '1.09990', '1.10000'], { lado: 'BUY', orden: 'mercado', sl: '1.09995', tp: '1.10002' }, 'TP', 'doji: maximo a 3 ticks (0,3 pip), minimo a 10: primero el maximo, TP 1,10002. ANTES: SL (el peor)'],
  ['EURUSD', ['1.10000', '1.10010', '1.09997', '1.10000'], { lado: 'SELL', orden: 'mercado', sl: '1.10005', tp: '1.09998' }, 'TP', 'doji: minimo a 3 ticks, maximo a 10: primero el minimo, TP 1,09998 de la SELL. ANTES: SL'],
  ['EURUSD', ['1.10000', '1.10005', '1.09995', '1.10000'], { lado: 'BUY', orden: 'mercado', sl: '1.09996', tp: '1.10004' }, 'SL', 'doji equidistante (5 y 5 ticks): el SL'],
  ['EURUSD', ['1.10000', '1.10005', '1.09995', '1.10000'], { lado: 'SELL', orden: 'mercado', sl: '1.10004', tp: '1.09996' }, 'SL', 'doji equidistante, SELL: el SL 1,10004'],
  ['USDJPY', ['150.000', '150.010', '149.990', '150.008'], { lado: 'SELL', orden: 'mercado', sl: '150.005', tp: '149.995' }, 'TP', 'JPY alcista: O→L→H→C, el TP 149,995 de la SELL antes que su SL. ANTES: SL'],
  ['USDJPY', ['150.000', '150.004', '149.995', '150.000'], { lado: 'SELL', orden: 'mercado', sl: '150.003', tp: '149.996' }, 'SL', 'JPY doji: maximo a 4 ticks (0,4 pip), minimo a 5: primero el maximo, SL 150,003'],
  ['GBPJPY', ['190.000', '190.006', '189.994', '190.000'], { lado: 'BUY', orden: 'mercado', sl: '189.995', tp: '190.005' }, 'SL', 'cruce JPY, doji equidistante (6 y 6): el SL (solo la cartera)'],
  ['EURUSD', ['1.10010', '1.10020', '1.09990', '1.10015'], { lado: 'BUY', orden: 'limit', precio: '1.10000', sl: '1.09995', tp: '1.10012' }, 'SL', 'pendiente BUY LIMIT 1,10000, vela alcista O→L→H→C: se llena bajando en 1,10000, sigue a 1,09990 y pasa por su SL 1,09995 antes de subir al TP: SL. El TP 1,10012 por encima de la apertura no cuenta antes de la entrada'],
]
MANO.push(['EURUSD', ['1.10010', '1.10020', '1.09998', '1.09999'], { lado: 'BUY', orden: 'limit', precio: '1.10000', sl: '1.09990', tp: '1.10012' }, null, 'pendiente BUY LIMIT, vela bajista O→H→L→C: sube a 1,10020 pasando por 1,10012 (el TP aun no existe), baja, se llena en 1,10000 y no llega ni al SL ni vuelve al TP: nada. ANTES (el peor): igual, nada'])
for (const [par, [o, h, l, c], com, motivo, porque] of MANO) {
  const ticks = [o, h, l, c].map(x => I.aTicks(par, x))
  const previo = com.orden === 'limit' ? (com.lado === 'BUY' ? I.aTicks(par, com.precio) + 2n : I.aTicks(par, com.precio) - 2n) : ticks[0]
  const filas = [fila(T, tx(par, previo), tx(par, previo), tx(par, previo), tx(par, previo)), fila(T + 60, o, h, l, c)]
  const pos = { lado: com.lado, pendiente: com.orden === 'limit', entrada: com.precio ? I.aTicks(par, com.precio) : ticks[0], sl: I.aTicks(par, com.sl), tp: I.aTicks(par, com.tp) }
  const v = { open: ticks[0], high: ticks[1], low: ticks[2], close: ticks[3] }
  const r = sinCruce(par) ? motorUnPar(par, filas, com) : null, rc = motorCartera(par, filas, com), rp = pantalla(par, v, pos), ro = oraculoDe(v, pos)
  oraculo('MV-D', `${par} ${o}/${h}/${l}/${c} ${com.lado} ${com.orden}: ${motivo} — ${porque}`, (r == null || r.motivo === motivo) && rc.motivo === motivo && rp === motivo && ro === motivo, JSON.stringify({ un: r?.motivo ?? r?.rechazo ?? '-', cartera: rc.motivo ?? rc.rechazo ?? null, pantalla: rp, oraculo: ro }))
}

// ── E · sv03 B fuera de la rejilla: MEDIDA ─────────────────────────────────────
titulo('E · las familias de sv03 B (fuera de la rejilla): lo que hace el motor (medida, sin oraculo)')
const E = { familias: 0, velaRechazada: 0, slRechazado: 0, admitidas: 0 }
for (const par of PARES9) for (const side of ['BUY', 'SELL']) for (const d of [94, 95, 96]) {
  const j = par.includes('JPY'), f = j ? 10000 : 1000000, oset = j ? [1512345, 1512340] : [1100000]
  for (const o of oset) {
    const u = { o, h: o + d, l: o - d, sl: o + (side === 'BUY' ? -50 : 50), tp: o + (side === 'BUY' ? 50 : -50) }
    E.familias++
    const txt = x => String(x / f)
    let vela = true, sl = true
    try { for (const x of [u.o, u.h, u.l]) I.aTicks(par, txt(x)) } catch { vela = false }
    try { I.aTicks(par, txt(u.sl)); I.aTicks(par, txt(u.tp)) } catch { sl = false }
    if (!vela) E.velaRechazada++; if (!sl) E.slRechazado++; if (vela && sl) E.admitidas++
  }
}
for (const par of ['USDJPY', 'GBPJPY']) { E.familias++; try { I.aTicks(par, '151.2345'); E.admitidas++ } catch { E.velaRechazada++ } }
console.log(`  · MEDIDA (sin oraculo): ${JSON.stringify(E)} — el motor rechaza en la admision (aTicks) cada familia de sv03 B: la vela no se publica (publicador-v1) y el SL/TP del comando da entrada_invalida`)
const rechazoCom = motorUnPar('USDJPY', [fila(T, '151.234', '151.234', '151.234', '151.234'), fila(T + 60, '151.234', '151.330', '151.140', '151.234')], { lado: 'BUY', orden: 'mercado', sl: '151.2295', tp: '151.2395' })
console.log(`  · MEDIDA: un comando USDJPY con SL 151,2295 → ${JSON.stringify(rechazoCom.rechazo ?? rechazoCom)}`)
fin()
