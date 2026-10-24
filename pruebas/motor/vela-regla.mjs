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
 *   C · el barrido ENTERO de Astra (sv03 A), con los precios fuera de la rejilla AJUSTADOS al tick del par al entrar
 *       (orden 1-119: como TradingView; desde el texto, en enteros, al tick mas cercano y la mitad hacia arriba):
 *       motor = cartera = pantalla = oraculo sobre el precio ajustado. Antes (a54aea3) el motor los rechazaba
 *   D · casos a mano (motivo escrito a mano, con su porque)
 *   E · las 68 familias de sv03 B (centesimas de pip, JPY con 4 decimales), ajustadas: motor = pantalla = oraculo
 *   F · COBERTURAS (orden 1-119): BUY y SELL del mismo par, a mercado y con pendientes, con lotes distintos. Un solo
 *       camino por vela y par para todas las posiciones, el del motor: la regla; doji equidistante → el camino en que
 *       salta un SL; si salta en los dos o en ninguno, el peor para la cartera (equity minima desde el cierre previo; a
 *       igualdad, al cierre; a igualdad, B). La pantalla (cierresEnVela) tiene que dar lo mismo que el motor y que el
 *       oraculo de cartera, vela a vela y posicion a posicion. Antes, la pantalla decidia por posicion (SL a las dos)
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
function motorUnPar(par, filas, com) { try { return motorUnPar0(par, filas, com) } catch (e) { return { rechazo: { excepcion: String(e.message) } } } }
function motorUnPar0(par, filas, com) {
  const velas = M.velas(par, filas)
  let e = M.crea({ par, costes: aislado, capital: '100000' })
  e = M.aplica(e, { tipo: 'avanzar', hasta: T }, velas).estado
  const r = M.aplica(e, { tipo: 'abrir', lotes: '1', ...com, cotizadoEn: e.reloj.cursor }, velas)
  if (r.resultado !== 'aceptado') return { rechazo: r.resultado }
  const s = M.aplica(r.estado, { tipo: 'avanzar', hasta: T + 60 }, velas)
  return { motivo: motivoDe(s.eventos, T + 60), fill: s.eventos.some(x => x.tipo === 'fill') }
}
function motorCartera(par, filas, com) { try { return motorCartera0(par, filas, com) } catch (e) { return { rechazo: { excepcion: String(e.message) } } } }
function motorCartera0(par, filas, com) {
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

// el ajuste al tick, en el oraculo: unidades enteras (10 por tick) → ticks, la mitad hacia arriba (precios positivos)
const aj = u => BigInt(Math.floor((u + 5) / 10))
const txtU = (u, f) => String(u / f)
// la pantalla con precios en texto (sin pasar por ticks: el ajuste es suyo)
const pantallaTxt = (par, v, pos) => V.cierreEnVela({ pair: pantallaPar(par), side: pos.lado, sl: pos.sl, tp: pos.tp, entry: pos.entrada }, v, { par: pantallaPar(par) })

// ── C · el barrido entero de Astra (sv03 A), ajustado al tick ──────────────────
titulo('C · sv03 A entero (9 pares × 4 aperturas × 23 × 23 × BUY/SELL), precios ajustados al tick del par al entrar')
for (const par of PARES9) {
  const j = par.includes('JPY'), f = j ? 10000 : 1000000, orig = j ? [1500000, 1512345, 1400000, 999995] : [1100000, 1234567, 999995, 700000]
  const malos = []; let n = 0, fuera = 0
  for (const oi of orig) for (let up = 94; up <= 116; up++) for (let down = 94; down <= 116; down++) for (const side of ['BUY', 'SELL']) {
    const u = [oi, oi + up, oi - down, oi + (side === 'BUY' ? -50 : 50), oi + (side === 'BUY' ? 50 : -50)]
    if (u.some(x => x % 10 !== 0)) fuera++
    const [o, h, l, sl, tp] = u.map(aj)
    const e = oraculoDe({ open: o, high: h, low: l, close: o }, { lado: side, sl, tp })
    const [to, th, tl, tsl, ttp] = u.map(x => txtU(x, f))
    // el cursor cierra en la apertura (en texto: tambien se ajusta); la posicion a mercado entra ahi
    const filas = [fila(T, to, to, to, to), fila(T + 60, to, th, tl, to)]
    const com = { lado: side, orden: 'mercado', sl: tsl, tp: ttp }
    const r = sinCruce(par) ? motorUnPar(par, filas, com) : null, rc = motorCartera(par, filas, com)
    const rp = pantallaTxt(par, { open: to, high: th, low: tl, close: to }, { lado: side, sl: tsl, tp: ttp, entrada: to })
    n++
    if ((r && (r.rechazo || r.motivo !== e)) || rc.rechazo || rc.motivo !== e || rp !== e) malos.push({ o: to, up, down, side, e, un: r ? (r.motivo ?? r.rechazo) : '-', cartera: rc.motivo ?? rc.rechazo, pantalla: rp })
  }
  oraculo('MV-C', `${par}: ${n} casos de sv03 A (${fuera} con algun precio fuera de la rejilla, ajustado): motor = cartera = pantalla = oraculo`, n === 4232 && malos.length === 0, JSON.stringify({ n, fuera, malos: malos.length, ejemplos: malos.slice(0, 3) }))
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
  ['EURUSD', ['1.10010', '1.10020', '1.09998', '1.09999'], { lado: 'BUY', orden: 'limit', precio: '1.10000', sl: '1.09990', tp: '1.10012' }, null, 'pendiente BUY LIMIT, vela bajista O→H→L→C: sube a 1,10020 pasando por 1,10012 (el TP aun no existe), baja, se llena en 1,10000 y no llega ni al SL ni vuelve al TP: nada. ANTES (el peor): igual, nada'],
  // orden 1-119: los precios fuera de la rejilla se AJUSTAN al tick al entrar (la mitad hacia arriba, desde el texto)
  ['EURUSD', ['1.100004', '1.100104', '1.099905', '1.100049'], { lado: 'BUY', orden: 'mercado', sl: '1.0999549', tp: '1.1000950' }, 'SL', 'fuera de la rejilla, ajustado: O 1,10000 H 1,10010 L 1,09991 C 1,10005 (alcista, B), SL 1,09995 y TP 1,10010: baja a 1,09991 y pasa por el SL'],
  ['USDJPY', ['150.0004', '150.0055', '149.9945', '150.0004'], { lado: 'SELL', orden: 'mercado', sl: '150.0045', tp: '149.9955' }, 'TP', 'JPY fuera de la rejilla, ajustado: O = C 150,000, H 150,0055 → 150,006 (6 ticks), L 149,9945 → 149,995 (5 ticks): doji, el minimo mas cerca: B; la SELL (SL 150,0045 → 150,005, TP 149,9955 → 149,996) baja primero a su TP'],
]
// el ajuste del oraculo, propio de la prueba: el texto decimal al tick del par, la mitad hacia arriba
const ajTxt = (par, x) => { const d = I.instrumento(par).digitos, [e, f = ''] = String(x).split('.'); return BigInt(e + f.padEnd(d, '0').slice(0, d)) + (f.length > d && f[d] >= '5' ? 1n : 0n) }
for (const [par, [o, h, l, c], com, motivo, porque] of MANO) {
  const ticks = [o, h, l, c].map(x => ajTxt(par, x))
  const previo = com.orden === 'limit' ? (com.lado === 'BUY' ? ajTxt(par, com.precio) + 2n : ajTxt(par, com.precio) - 2n) : ticks[0]
  const filas = [fila(T, tx(par, previo), tx(par, previo), tx(par, previo), tx(par, previo)), fila(T + 60, o, h, l, c)]
  const pos = { lado: com.lado, pendiente: com.orden === 'limit', entrada: com.precio ? ajTxt(par, com.precio) : ticks[0], sl: ajTxt(par, com.sl), tp: ajTxt(par, com.tp) }
  const v = { open: ticks[0], high: ticks[1], low: ticks[2], close: ticks[3] }
  const rpTxt = V.cierreEnVela({ pair: pantallaPar(par), side: com.lado, sl: com.sl, tp: com.tp, entry: com.precio ?? o }, { open: o, high: h, low: l, close: c }, { llenadaAqui: com.orden === 'limit', par: pantallaPar(par) })
  const r = sinCruce(par) ? motorUnPar(par, filas, com) : null, rc = motorCartera(par, filas, com), ro = oraculoDe(v, pos)
  oraculo('MV-D', `${par} ${o}/${h}/${l}/${c} ${com.lado} ${com.orden}: ${motivo} — ${porque}`, (r == null || r.motivo === motivo) && rc.motivo === motivo && rpTxt === motivo && ro === motivo, JSON.stringify({ un: r?.motivo ?? r?.rechazo ?? '-', cartera: rc.motivo ?? rc.rechazo ?? null, pantalla: rpTxt, oraculo: ro }))
}

// ── E · sv03 B: las 68 familias, ajustadas ───────────────────────────────────────
titulo('E · las 68 familias de sv03 B (fuera de la rejilla), ajustadas al tick: motor = pantalla = oraculo')
const FAM = []
for (const par of PARES9) for (const side of ['BUY', 'SELL']) for (const d of [94, 95, 96]) {
  const j = par.includes('JPY'), oset = j ? [1512345, 1512340] : [1100000]
  for (const o of oset) FAM.push({ id: `${par}-${side}-simetrico-${d}${j ? (o === 1512345 ? '-apertura-fuera-de-rejilla' : '-en-rejilla') : ''}`, par, side, u: { o, h: o + d, l: o - d, sl: o + (side === 'BUY' ? -50 : 50), tp: o + (side === 'BUY' ? 50 : -50) } })
}
for (const par of ['USDJPY', 'GBPJPY']) FAM.push({ id: par + '-mitades-desiguales-fuera-de-rejilla', par, side: 'BUY', u: { o: 1512345, h: 1512450, l: 1512230, sl: 1512295, tp: 1512395 } })
ver('sv03 B son 68 familias', FAM.length === 68, String(FAM.length))
{
  const malos = []; let fuera = 0
  for (const { id, par, side, u } of FAM) {
    const f = par.includes('JPY') ? 10000 : 1000000
    if ([u.o, u.h, u.l, u.sl, u.tp].some(x => x % 10 !== 0)) fuera++
    const e = oraculoDe({ open: aj(u.o), high: aj(u.h), low: aj(u.l), close: aj(u.o) }, { lado: side, sl: aj(u.sl), tp: aj(u.tp) })
    const t = k => txtU(u[k], f)
    const filas = [fila(T, t('o'), t('o'), t('o'), t('o')), fila(T + 60, t('o'), t('h'), t('l'), t('o'))]
    const com = { lado: side, orden: 'mercado', sl: t('sl'), tp: t('tp') }
    const r = sinCruce(par) ? motorUnPar(par, filas, com) : null, rc = motorCartera(par, filas, com)
    const rp = pantallaTxt(par, { open: t('o'), high: t('h'), low: t('l'), close: t('o') }, { lado: side, sl: t('sl'), tp: t('tp'), entrada: t('o') })
    if ((r && (r.rechazo || r.motivo !== e)) || rc.rechazo || rc.motivo !== e || rp !== e) malos.push({ id, e, un: r ? (r.motivo ?? r.rechazo) : '-', cartera: rc.motivo ?? rc.rechazo, pantalla: rp })
  }
  oraculo('MV-E', `las 68 familias de sv03 B (${fuera} con precios fuera de la rejilla), ajustadas: motor = cartera = pantalla = oraculo`, malos.length === 0, JSON.stringify({ malos: malos.length, ejemplos: malos.slice(0, 4) }))
}
// un SL fuera de la rejilla ya no da entrada_invalida: se ajusta (151,2295 → 151,230)
{
  const r = motorUnPar('USDJPY', [fila(T, '151.234', '151.234', '151.234', '151.234'), fila(T + 60, '151.234', '151.330', '151.140', '151.234')], { lado: 'BUY', orden: 'mercado', sl: '151.2295', tp: '151.2395' })
  oraculo('MV-E', 'USDJPY con SL 151,2295 y TP 151,2395: aceptado y ajustado (SL 151,230, TP 151,240); la vela (doji 96/94) baja primero: SL', !r.rechazo && r.motivo === 'SL', JSON.stringify(r))
  const x = motorUnPar('USDJPY', [fila(T, '151.234', '151.234', '151.234', '151.234'), fila(T + 60, '151.234', '151.330', '151.140', '151.234')], { lado: 'BUY', orden: 'mercado', sl: 'abc' })
  oraculo('MV-E', 'lo que no es un precio sigue dando entrada_invalida', x.rechazo?.rechazado === 'entrada_invalida', JSON.stringify(x))
}

// ── F · coberturas: un camino por vela y par ────────────────────────────────────
titulo('F · coberturas (BUY y SELL del mismo par, a mercado y con pendientes): motor = pantalla = oraculo de cartera')
// el oraculo de cartera: recorre cada camino tick a tick con TODAS las posiciones; elige el camino como el motor
function caminaCartera(pts, previo, poss) {
  const st = poss.map(p => ({ ...p, abierta: !p.pendiente, cerrada: false, motivo: null, precioEntrada: p.pendiente ? null : p.entrada, salida: null }))
  const sg = p => (p.lado === 'BUY' ? 1n : -1n)
  const eq = precio => st.reduce((a, p) => a + (p.cerrada ? sg(p) * (p.salida - p.precioEntrada) * p.lotes : p.abierta ? sg(p) * (precio - p.precioEntrada) * p.lotes : 0n), 0n)
  let minimo = eq(previo)
  const toca = (p, x) => { const l = p.lado === 'BUY'; if (p.sl != null && (l ? x <= p.sl : x >= p.sl)) return 'SL'; if (p.tp != null && (l ? x >= p.tp : x <= p.tp)) return 'TP'; return null }
  const en = x => {
    for (const p of st) if (p.abierta && !p.cerrada) { const m = toca(p, x); if (m) { p.cerrada = true; p.motivo = m; p.salida = x } }
    for (const p of st) if (!p.abierta && (p.lado === 'BUY' ? x <= p.entrada : x >= p.entrada)) { p.abierta = true; p.precioEntrada = x; const m = toca(p, x); if (m) { p.cerrada = true; p.motivo = m; p.salida = x } }
    const q = eq(x); if (q < minimo) minimo = q
  }
  en(pts[0])
  for (let k = 1; k < 4; k++) { const a = pts[k - 1], b = pts[k], s = b > a ? 1n : -1n; for (let x = a; x !== b; ) { x += s; en(x) } }
  return { motivos: st.map(p => p.motivo), minimo, cierre: eq(pts[3]), sl: st.some(p => p.motivo === 'SL') }
}
function oraculoCartera(v, previo, poss) {
  const B = [v.open, v.low, v.high, v.close], A = [v.open, v.high, v.low, v.close]
  const rs = recorridosOraculo(v)
  if (rs.length === 1) return caminaCartera(rs[0], previo, poss).motivos
  const a = caminaCartera(A, previo, poss), b = caminaCartera(B, previo, poss)
  const elige = a.sl !== b.sl ? (a.sl ? a : b) : a.minimo < b.minimo ? a : b.minimo < a.minimo ? b : a.cierre < b.cierre ? a : b
  return elige.motivos
}
// el motor con varias ordenes; devuelve el motivo de cada una (en el orden de las ordenes)
function motorVarias(cartera, par, filas, ordenes) { try { return motorVarias0(cartera, par, filas, ordenes) } catch (e) { return { rechazo: { excepcion: String(e.message) } } } }
function motorVarias0(cartera, par, filas, ordenes) {
  const vs = M.velas(par, filas)
  const velas = cartera ? { [par]: vs } : vs
  if (cartera) for (const a of auxDe(par)) velas[a] = M.velas(a, filas.map(f => fila(f.time, AUX[a], AUX[a], AUX[a], AUX[a])))
  const MO = cartera ? CA : M
  let e = cartera ? CA.crea({ pares: [par, ...auxDe(par)], costes: aislado, capital: '1000000' }) : M.crea({ par, costes: aislado, capital: '1000000' })
  e = MO.aplica(e, { tipo: 'avanzar', hasta: T }, velas).estado
  const ids = []
  for (const o of ordenes) {
    const r = MO.aplica(e, { tipo: 'abrir', ...(cartera ? { par } : {}), ...o, cotizadoEn: o.orden === 'mercado' ? e.reloj.cursor : undefined }, velas)
    if (r.resultado !== 'aceptado') return { rechazo: r.resultado }
    ids.push(o.orden === 'mercado' ? r.estado.posiciones.at(-1).id : r.estado.ordenes.at(-1).id)
    e = r.estado
  }
  const s = MO.aplica(e, { tipo: 'avanzar', hasta: T + 60 }, velas)
  const deOrden = new Map(s.eventos.filter(x => x.tipo === 'fill' && x.orden).map(x => [x.orden, x.posicion]))
  return { motivos: ids.map(id => { const pid = id.startsWith('o') ? deOrden.get(id) : id; return s.eventos.find(x => x.tipo === 'cierre' && x.posicion === pid)?.motivo ?? null }) }
}
const varias = V.cierresEnVela ?? ((poss, v, op) => poss.map(p => V.cierreEnVela(p, v, { llenadaAqui: p.llenadaAqui, par: op.par })))
oraculo('MV-F', 'la pantalla expone cierresEnVela (un camino por vela y par para todas las posiciones)', typeof V.cierresEnVela === 'function')
for (const par of ['EURUSD', 'USDJPY', 'GBPJPY']) {
  const o = BASES[par][0]
  const malos = { un: [], cartera: [], pantalla: [] }; let n = 0, eqd = 0, conSL = 0, distintosPorPosicion = 0
  for (let d = 1n; d <= 6n; d++) for (const dc of [0n, 1n, -1n]) for (const tipo of ['mm', 'mp', 'pm', 'pp']) for (const [la, lb] of [[1n, 1n], [1n, 2n], [2n, 1n]]) for (const [s1, t1, s2, t2] of [[1n, 1n, 1n, 1n], [1n, 3n, 3n, 1n], [3n, 1n, 1n, 3n], [2n, 2n, 1n, 4n], [4n, 1n, 2n, 2n]]) {
    const up = d, dn = dc === 0n ? d : d + 1n
    const v = { open: o, high: o + up, low: o - dn, close: o + dc }
    if (v.close > v.high || v.close < v.low) continue
    // posicion 1: BUY (a mercado en o, o BUY LIMIT en o − 1); posicion 2: SELL (a mercado, o SELL LIMIT en o + 1)
    const e1 = tipo[0] === 'm' ? o : o - 1n, e2 = tipo[1] === 'm' ? o : o + 1n
    const poss = [
      { lado: 'BUY', pendiente: tipo[0] === 'p', entrada: e1, sl: e1 - s1, tp: e1 + t1, lotes: la },
      { lado: 'SELL', pendiente: tipo[1] === 'p', entrada: e2, sl: e2 + s2, tp: e2 - t2, lotes: lb },
    ]
    const esperado = oraculoCartera(v, o, poss)
    const filas = [fila(T, tx(par, o), tx(par, o), tx(par, o), tx(par, o)), fila(T + 60, tx(par, v.open), tx(par, v.high), tx(par, v.low), tx(par, v.close))]
    const ords = poss.map(p => ({ lado: p.lado, lotes: String(p.lotes), sl: tx(par, p.sl), tp: tx(par, p.tp), ...(p.pendiente ? { orden: 'limit', precio: tx(par, p.entrada) } : { orden: 'mercado' }) }))
    const pan = varias(poss.map((p, k) => ({ id: 'x' + k, pair: pantallaPar(par), side: p.lado, entry: tx(par, p.entrada), sl: tx(par, p.sl), tp: tx(par, p.tp), lots: Number(p.lotes), llenadaAqui: p.pendiente })),
      { open: tx(par, v.open), high: tx(par, v.high), low: tx(par, v.low), close: tx(par, v.close) }, { par: pantallaPar(par), previo: tx(par, o) })
    const porPosicion = poss.map(p => V.cierreEnVela({ pair: pantallaPar(par), side: p.lado, entry: tx(par, p.entrada), sl: tx(par, p.sl), tp: tx(par, p.tp) }, { open: tx(par, v.open), high: tx(par, v.high), low: tx(par, v.low), close: tx(par, v.close) }, { llenadaAqui: p.pendiente, par: pantallaPar(par) }))
    n++; if (dc === 0n) eqd++; if (esperado.includes('SL')) conSL++; if (JSON.stringify(porPosicion) !== JSON.stringify(esperado)) distintosPorPosicion++
    const caso = `${tx(par, v.open)} H+${up} L-${dn} C${dc} ${tipo} lotes ${la}/${lb} sl/tp ${s1}/${t1} ${s2}/${t2}: esperado ${JSON.stringify(esperado)}`
    if (sinCruce(par)) { const r = motorVarias(false, par, filas, ords); if (r.rechazo || JSON.stringify(r.motivos) !== JSON.stringify(esperado)) malos.un.push(`${caso}, motor ${JSON.stringify(r.motivos ?? r.rechazo)}`) }
    const rc = motorVarias(true, par, filas, ords); if (rc.rechazo || JSON.stringify(rc.motivos) !== JSON.stringify(esperado)) malos.cartera.push(`${caso}, cartera ${JSON.stringify(rc.motivos ?? rc.rechazo)}`)
    if (JSON.stringify(pan) !== JSON.stringify(esperado)) malos.pantalla.push(`${caso}, pantalla ${JSON.stringify(pan)}`)
  }
  ver(`${par}: la familia tiene dojis equidistantes, SL, y casos en que decidir por posicion daria otra cosa`, eqd > 0 && conSL > 0 && distintosPorPosicion > 0, JSON.stringify({ n, eqd, conSL, distintosPorPosicion }))
  if (sinCruce(par)) oraculo('MV-F', `${par}: motor de un par = oraculo de cartera en ${n} coberturas`, malos.un.length === 0, JSON.stringify({ n, malos: malos.un.length, ejemplos: malos.un.slice(0, 2) }))
  oraculo('MV-F', `${par}: cartera = oraculo de cartera en ${n} coberturas`, malos.cartera.length === 0, JSON.stringify({ n, malos: malos.cartera.length, ejemplos: malos.cartera.slice(0, 2) }))
  oraculo('MV-F', `${par}: PANTALLA = oraculo de cartera (= motor) en ${n} coberturas`, malos.pantalla.length === 0, JSON.stringify({ n, malos: malos.pantalla.length, ejemplos: malos.pantalla.slice(0, 2) }))
}
// el caso medido el 24-oct (1-119), a mano: EURUSD BUY y SELL de 1 lote, doji 5 y 5, SL y TP a 4 ticks. Por A sube: la
// BUY toca su TP y la SELL su SL en 1,10004; por B, al reves. Los dos caminos tienen un SL; la equity de la cobertura es
// constante (+x −x) en los dos: empate en el minimo y en el cierre → B: BUY SL y SELL TP (antes, la pantalla: SL y SL)
{
  const v = { open: '1.10000', high: '1.10005', low: '1.09995', close: '1.10000' }
  const pan = varias([{ id: 'b', pair: 'EUR/USD', side: 'BUY', entry: '1.10000', sl: '1.09996', tp: '1.10004', lots: 1 }, { id: 's', pair: 'EUR/USD', side: 'SELL', entry: '1.10000', sl: '1.10004', tp: '1.09996', lots: 1 }], v, { par: 'EUR/USD', previo: '1.10000' })
  oraculo('MV-F', 'a mano: cobertura EURUSD, doji 5/5, SL y TP a 4: BUY SL y SELL TP (el camino B), en la pantalla como en el motor', JSON.stringify(pan) === '["SL","TP"]', JSON.stringify(pan))
}
fin()
