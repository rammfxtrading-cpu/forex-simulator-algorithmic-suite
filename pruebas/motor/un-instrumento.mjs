/**
 * MOTOR · PIEZA 2: MOTOR DE UN INSTRUMENTO (especificacion v2.1)
 * A01–A06, A08, A11, A12, A16 y A17, con cifras exactas (fracciones), escritas
 * ANTES que el codigo.
 *
 * Modelo (§ 2.1, § 3.2–3.4, § 3.7, § 12.3, § 12.5):
 *   · velas BID; ask = bid + spread; BUY abre a ask y sale a bid; SELL al reves
 *   · cada vela: apertura (los huecos se ejecutan ahi) y tres tramos
 *     monotonos, por dos caminos: A = O→H→L→C, B = O→L→H→C; se elige el peor
 *     para la cartera del par (equity minima; luego al cierre; luego B) y, si
 *     dan eventos distintos, la vela es ambigua (marca + causa)
 *   · el precio recorre cada tramo tick a tick: los niveles se tocan exactos
 *   · comision entera al abrir; equity = saldo + flotante redondeado al µ
 *     (residuo por posicion); breach = primer tick con equity < limite
 *   · comandos en cursor + 60, con la cotizacion del cursor (cierre)
 * Casos "sin spread" / "spread 1 pip": costes de prueba AISLADOS (spec § 10);
 * el resto, costes@1.
 */
import { titulo, ver, oraculo, fin, importa } from '../lib.mjs'
const M = await importa('lib/motor/motor.mjs')
const { COSTES_1 } = await importa('lib/motor/costes.mjs')
const aislado = (par, pips) => Object.freeze({ version: `prueba:${par}:${pips}`, spread_pips: Object.freeze({ [par]: pips }), comision_lote_µ: 3_000_000n, swap_µ: 0n })
const T0 = Date.parse('2025-03-03T10:00:00Z') / 1000
// velas [O, H, L, C] en texto, un minuto cada una desde T0
const serie = (par, filas) => M.velas(par, filas.map(([o, h, l, c], i) => ({ time: T0 + 60 * i, open: o, high: h, low: l, close: c })))
const plana = p => [p, p, p, p]
// una sesion con la primera vela ya consumida (su cierre es la cotizacion)
function sesion({ par = 'EURUSD', costes = COSTES_1, capital = '100000', limites = [], filas }) {
  const v = serie(par, filas)
  let e = M.crea({ par, costes, capital, limites })
  e = M.aplica(e, { tipo: 'avanzar', hasta: v[0].time }, v).estado
  return { v, e }
}
const ap = (s, comando) => { const r = M.aplica(s.e, comando, s.v); s.e = r.estado; return r }
const avanza = (s, i) => ap(s, { tipo: 'avanzar', hasta: s.v[i].time })
const fills = r => r.eventos.filter(x => x.tipo === 'fill')
const cierres = r => r.eventos.filter(x => x.tipo === 'cierre')
const tx = (par, t) => M.precioTexto(par, t)

titulo('A01 · (a) a mercado, costes@1 (EURUSD 0,3 pips = 3 ticks); cotizacion bid 1,10000')
{
  const s = sesion({ filas: [plana('1.10000'), plana('1.10000')] })
  const b = ap(s, { tipo: 'abrir', orden: 'mercado', lado: 'BUY', lotes: '1', cotizadoEn: s.e.reloj.cursor })
  const s2 = sesion({ filas: [plana('1.10000'), plana('1.10000')] })
  const v = ap(s2, { tipo: 'abrir', orden: 'mercado', lado: 'SELL', lotes: '1', cotizadoEn: s2.e.reloj.cursor })
  oraculo('A01', 'BUY a mercado entra a ask 1,10003; SELL a bid 1,10000', tx('EURUSD', fills(b)[0]?.precio) === '1.10003' && tx('EURUSD', fills(v)[0]?.precio) === '1.10000', `${tx('EURUSD', fills(b)[0]?.precio)} · ${tx('EURUSD', fills(v)[0]?.precio)}`)
  oraculo('A01', 'la comision (3.000.000 µ) se cobra al abrir', s.e.saldo_µ === 99_997_000_000n, String(s.e.saldo_µ))
}
const pendiente = (lado, orden, precio, filaSiguiente, extra = {}) => {
  const s = sesion({ filas: [plana('1.10000'), filaSiguiente] })
  const c = ap(s, { tipo: 'abrir', orden, lado, lotes: '1', precio, ...extra })
  const r = avanza(s, 1)
  return { s, c, r, fill: tx('EURUSD', [...fills(c), ...fills(r)][0]?.precio) }
}
titulo('A01 · (b)–(e) limit y stop, normales y con hueco')
const casos01 = [
  ['BUY LIMIT 1,09900, la vela baja a 1,09880', pendiente('BUY', 'limit', '1.09900', ['1.09950', '1.09960', '1.09880', '1.09900']), '1.09900'],
  ['BUY LIMIT 1,09900, hueco favorable (abre bid 1,09800)', pendiente('BUY', 'limit', '1.09900', ['1.09800', '1.09850', '1.09790', '1.09800']), '1.09803'],
  ['SELL LIMIT 1,10100, la vela sube a 1,10120', pendiente('SELL', 'limit', '1.10100', ['1.10050', '1.10120', '1.10040', '1.10100']), '1.10100'],
  ['SELL LIMIT 1,10100, hueco (abre 1,10200)', pendiente('SELL', 'limit', '1.10100', ['1.10200', '1.10250', '1.10190', '1.10200']), '1.10200'],
  ['BUY STOP 1,10100, la vela sube a 1,10120', pendiente('BUY', 'stop', '1.10100', ['1.10050', '1.10120', '1.10040', '1.10100']), '1.10100'],
  ['BUY STOP 1,10100, hueco adverso (abre bid 1,10200)', pendiente('BUY', 'stop', '1.10100', ['1.10200', '1.10250', '1.10190', '1.10200']), '1.10203'],
  ['SELL STOP 1,09900, la vela baja a 1,09880', pendiente('SELL', 'stop', '1.09900', ['1.09950', '1.09960', '1.09880', '1.09900']), '1.09900'],
  ['SELL STOP 1,09900, hueco (abre 1,09800)', pendiente('SELL', 'stop', '1.09900', ['1.09800', '1.09850', '1.09790', '1.09800']), '1.09800'],
]
for (const [desc, x, esperado] of casos01) oraculo('A01', `${desc} → ${esperado}`, x.fill === esperado, x.fill ?? 'sin fill')
titulo('A01 · (f) ya ejecutables al crearse')
{
  const bl = pendiente('BUY', 'limit', '1.10100', plana('1.10000')), sl = pendiente('SELL', 'limit', '1.09900', plana('1.10000'))
  oraculo('A01', 'BUY LIMIT 1,10100 con ask 1,10003: se llena ya, a 1,10003; SELL LIMIT 1,09900 con bid 1,10000: a 1,10000', tx('EURUSD', fills(bl.c)[0]?.precio) === '1.10003' && tx('EURUSD', fills(sl.c)[0]?.precio) === '1.10000')
  const bs = pendiente('BUY', 'stop', '1.09900', plana('1.10000')), ss = pendiente('SELL', 'stop', '1.10100', plana('1.10000'))
  oraculo('A01', 'BUY STOP 1,09900 y SELL STOP 1,10100 ya ejecutables: rechazados stop_ejecutable, sin orden', bs.c.resultado?.rechazado === 'stop_ejecutable' && ss.c.resultado?.rechazado === 'stop_ejecutable' && bs.s.e.ordenes.length === 0 && bs.s.e.posiciones.length === 0, `${bs.c.resultado?.rechazado} · ${ss.c.resultado?.rechazado}`)
}
titulo('A01 · (g) hueco con proteccion inmediata (Astra, V2-03)')
{
  const x = pendiente('BUY', 'limit', '1.10000', ['1.09000', '1.09050', '1.08950', '1.09000'], { sl: '1.09900' })
  const c = cierres(x.r)[0]
  oraculo('A01', 'fill a ask 1,09003 y proteccion en el acto a bid 1,09000', x.fill === '1.09003' && tx('EURUSD', c?.precio) === '1.09000' && c?.motivo === 'SL', `${x.fill} → ${tx('EURUSD', c?.precio)} ${c?.motivo}`)
  oraculo('A01', 'bruto −3.000.000 µ, neto −6.000.000 µ, marcado como hueco', c?.bruto_µ === -3_000_000n && c?.neto_µ === -6_000_000n && c?.hueco === true, `${c?.bruto_µ} / ${c?.neto_µ} · hueco ${c?.hueco}`)
}

titulo('A02 · spread 1 pip aislado, a mercado y cierre manual sin movimiento')
for (const lado of ['BUY', 'SELL']) {
  const s = sesion({ costes: aislado('EURUSD', '1.0'), filas: [plana('1.10000'), plana('1.10000')] })
  ap(s, { tipo: 'abrir', orden: 'mercado', lado, lotes: '1', cotizadoEn: s.e.reloj.cursor })
  const c = cierres(ap(s, { tipo: 'cerrar', id: s.e.posiciones[0].id }))[0]
  oraculo('A02', `${lado}: bruto −10.000.000 µ, neto −13.000.000 µ`, c?.bruto_µ === -10_000_000n && c?.neto_µ === -13_000_000n, `${c?.bruto_µ} / ${c?.neto_µ}`)
}

titulo('A03 · sin spread (aislado)')
const sin = aislado('EURUSD', '0.0')
{ // (a) la limit de M04
  const s = sesion({ costes: sin, filas: [plana('1.10100'), ['1.10100', '1.10150', '1.09800', '1.09900'], plana('1.09900')] })
  ap(s, { tipo: 'abrir', orden: 'limit', lado: 'BUY', lotes: '1', precio: '1.10000', sl: '1.09900', tp: '1.10500' })
  const r = avanza(s, 1), c = cierres(r)[0]
  oraculo('A03', '(a) llena en 1,10000 y cierra en el SL tras UN paso: −100.000.000 bruto, −103.000.000 neto', tx('EURUSD', fills(r)[0]?.precio) === '1.10000' && c?.motivo === 'SL' && c?.bruto_µ === -100_000_000n && c?.neto_µ === -103_000_000n, `${c?.motivo} ${c?.bruto_µ} ${c?.neto_µ}`)
  oraculo('A03', '(a) los dos caminos coinciden: no ambigua', c && c.ambigua !== true)
  const r2 = avanza(s, 2)
  oraculo('A03', '(a) el segundo paso no duplica nada', r2.eventos.filter(x => x.tipo !== 'fin_de_datos').length === 0 && s.e.posiciones.length === 0, JSON.stringify(r2.eventos.map(x => x.tipo)))
}
{ // (b) extremo anterior al fill
  const s = sesion({ costes: sin, filas: [plana('1.10000'), ['1.10000', '1.10150', '1.09850', '1.10050']] })
  ap(s, { tipo: 'abrir', orden: 'stop', lado: 'BUY', lotes: '1', precio: '1.10100', sl: '1.09900' })
  const r = avanza(s, 1), c = cierres(r)[0]
  oraculo('A03', '(b) ambigua: se elige A (fill y SL), bruto −200.000.000, neto −203.000.000', c?.motivo === 'SL' && c?.bruto_µ === -200_000_000n && c?.neto_µ === -203_000_000n, `${c?.motivo} ${c?.bruto_µ} ${c?.neto_µ}`)
  // fin_de_datos es del avance (la vela es la ultima), no de la vela: no lleva la marca
  const deLaVela = r.eventos.filter(x => x.tipo !== 'fin_de_datos')
  oraculo('A03', '(b) marcada: todos los eventos de la vela con ambigua === true y causa', deLaVela.length > 0 && deLaVela.every(x => x.ambigua === true && typeof x.causa_ambiguedad === 'string' && x.causa_ambiguedad.length > 10), deLaVela[0]?.causa_ambiguedad ?? '')
}
{ // (b') en el camino B solo: el minimo anterior al fill no dispara el SL
  const s = sesion({ costes: sin, filas: [plana('1.10000'), ['1.10000', '1.10150', '1.09850', '1.10050']] })
  ap(s, { tipo: 'abrir', orden: 'stop', lado: 'BUY', lotes: '1', precio: '1.10100', sl: '1.09900' })
  const b = M.recorre(s.e, s.v[1], 'B')
  oraculo('A03', "(b) camino B: el minimo previo al fill no dispara: posicion abierta, flotante −50.000.000 µ al cierre", cierres(b).length === 0 && b.estado.posiciones.length === 1 && M.flotante_µ(b.estado) === -50_000_000n, `${cierres(b).length} cierres · flotante ${M.flotante_µ(b.estado)}`)
}
{ // (c) SELL STOP
  const s = sesion({ costes: sin, filas: [plana('1.09950'), ['1.09950', '1.09980', '1.09850', '1.09870']] })
  ap(s, { tipo: 'abrir', orden: 'stop', lado: 'SELL', lotes: '1', precio: '1.09900', sl: '1.10000' })
  const r = avanza(s, 1)
  oraculo('A03', '(c) SELL STOP llena en 1,09900, sin SL; flotante +30.000.000 µ al cierre (ask 1,09870)', tx('EURUSD', fills(r)[0]?.precio) === '1.09900' && cierres(r).length === 0 && M.flotante_µ(s.e) === 30_000_000n && r.eventos.every(x => x.ambigua !== true), `flotante ${M.flotante_µ(s.e)}`)
}

titulo('A04 · cobertura BUY y SELL, SL y TP a 10 pips, vela que toca los dos lados')
const a04 = (orden, hasta = 1) => {
  const s = sesion({ costes: sin, filas: [plana('1.10000'), ['1.10000', '1.10100', '1.09900', '1.10000'], plana('1.10000')] })
  for (const lado of orden) ap(s, { tipo: 'abrir', orden: 'mercado', lado, lotes: '1', cotizadoEn: s.e.reloj.cursor, sl: lado === 'BUY' ? '1.09900' : '1.10100', tp: lado === 'BUY' ? '1.10100' : '1.09900' })
  const r = avanza(s, hasta)
  return { s, r }
}
{
  const x = a04(['BUY', 'SELL']), y = a04(['SELL', 'BUY'])
  const motivos = z => cierres(z.r).map(c => c.motivo).sort().join('+')
  const bruto = z => cierres(z.r).reduce((a, c) => a + c.bruto_µ, 0n)
  oraculo('A04', 'un SL y un TP: bruto 0, neto −6.000.000 µ (dos comisiones); saldo 99.994.000.000', motivos(x) === 'SL+TP' && bruto(x) === 0n && x.s.e.saldo_µ === 99_994_000_000n, `${motivos(x)} · ${bruto(x)} · ${x.s.e.saldo_µ}`)
  oraculo('A04', 'abrir en el otro orden no cambia el resultado economico', motivos(y) === 'SL+TP' && y.s.e.saldo_µ === x.s.e.saldo_µ)
  const z = a04(['BUY', 'SELL'], 1), w = a04(['BUY', 'SELL'], 2)        // z: dos avances; w: uno solo
  ap(z.s, { tipo: 'avanzar', hasta: z.s.v[2].time })
  oraculo('A04', 'trocear el avance (1 + 1 velas frente a 2 de golpe): el mismo estado economico', M.equivalentes(z.s.e, w.s.e) && z.s.e.reloj.cursor === w.s.e.reloj.cursor)
  ver('control del comparador: un estado con otro saldo NO es equivalente', !M.equivalentes(z.s.e, { ...z.s.e, saldo_µ: z.s.e.saldo_µ + 1n }))
}

titulo('A05 · vela que toca el SL y el TP')
{
  const s = sesion({ costes: sin, filas: [plana('1.10000'), ['1.10000', '1.10200', '1.09800', '1.10000']] })
  ap(s, { tipo: 'abrir', orden: 'mercado', lado: 'BUY', lotes: '1', cotizadoEn: s.e.reloj.cursor, sl: '1.09900', tp: '1.10100' })
  const c = cierres(avanza(s, 1))[0]
  oraculo('A05', 'politica conservadora: SL (−100.000.000), ambigua === true con causa', c?.motivo === 'SL' && c?.bruto_µ === -100_000_000n && c?.ambigua === true && typeof c?.causa_ambiguedad === 'string' && c.causa_ambiguedad.length > 10, `${c?.motivo} · ${c?.causa_ambiguedad}`)
  const s2 = sesion({ costes: sin, filas: [plana('1.10000'), ['1.10000', '1.10200', '1.09950', '1.10150']] })
  ap(s2, { tipo: 'abrir', orden: 'mercado', lado: 'BUY', lotes: '1', cotizadoEn: s2.e.reloj.cursor, sl: '1.09900', tp: '1.10100' })
  const c2 = cierres(avanza(s2, 1))[0]
  oraculo('A05', 'control: si solo toca el TP, +100.000.000 y sin marca', c2?.motivo === 'TP' && c2?.bruto_µ === 100_000_000n && c2?.ambigua !== true)
}

titulo('A06 · breach diario con la comision ya cobrada')
{
  const s = sesion({ costes: aislado('EURUSD', '0.0'), limites: [{ regla: 'diaria', limite: '95000' }], filas: [plana('1.20000'), ['1.20000', '1.26000', '1.14000', '1.20000'], plana('1.20000')] })
  ap(s, { tipo: 'abrir', orden: 'mercado', lado: 'BUY', lotes: '1', cotizadoEn: s.e.reloj.cursor, sl: '1.10000', tp: '1.25000' })
  ap(s, { tipo: 'abrir', orden: 'limit', lado: 'SELL', lotes: '1', precio: '1.30000' })
  ver('control: saldo 99.997 tras la comision y una pendiente viva', s.e.saldo_µ === 99_997_000_000n && s.e.ordenes.length === 1)
  const r = avanza(s, 1), br = r.eventos.find(x => x.tipo === 'breach'), c = cierres(r)[0]
  oraculo('A06', 'breach en el primer tick que incumple, 1,15002 (en 1,15003 la equity es 95.000 exacta: no incumple)', tx('EURUSD', br?.precio) === '1.15002' && br?.equity_µ === 94_999_000_000n, `${tx('EURUSD', br?.precio)} · ${br?.equity_µ}`)
  oraculo('A06', 'liquidacion ahi: saldo 94.999.000.000 µ; el TP nunca se alcanza', c?.motivo === 'breach' && tx('EURUSD', c?.precio) === '1.15002' && s.e.saldo_µ === 94_999_000_000n && !cierres(r).some(x => x.motivo === 'TP'), `${c?.motivo} · ${s.e.saldo_µ}`)
  oraculo('A06', 'la pendiente se cancela y la sesion queda en breach (no procesa mas velas)', s.e.ordenes.length === 0 && r.eventos.some(x => x.tipo === 'orden_cancelada') && s.e.estado === 'breach' && avanza(s, 2).eventos.length === 0)
}

titulo('A08 · USDJPY, umbral neto con conversion racional')
{
  const s = sesion({ par: 'USDJPY', costes: aislado('USDJPY', '0.0'), limites: [{ regla: 'diaria', limite: '95000' }], filas: [plana('150.000'), ['150.000', '150.100', '142.500', '143.000']] })
  ap(s, { tipo: 'abrir', orden: 'mercado', lado: 'BUY', lotes: '1', cotizadoEn: s.e.reloj.cursor })
  const br = avanza(s, 1).eventos.find(x => x.tipo === 'breach')
  oraculo('A08', 'primer tick con neto < −5.000: 142,861; saldo final 94.999.834.923 µ', tx('USDJPY', br?.precio) === '142.861' && s.e.saldo_µ === 94_999_834_923n, `${tx('USDJPY', br?.precio)} · ${s.e.saldo_µ}`)
}

titulo('A11 · parciales: comision asignada y residuo')
{
  const a11 = cortes => {
    const s = sesion({ filas: [plana('1.10007'), ['1.10007', '1.10200', '1.10007', '1.10200']] })
    ap(s, { tipo: 'abrir', orden: 'mercado', lado: 'BUY', lotes: '1', cotizadoEn: s.e.reloj.cursor })
    avanza(s, 1)
    const cs = cortes.map(l => cierres(ap(s, { tipo: 'cerrar', id: s.e.posiciones[0]?.id, lotes: l }))[0])
    return { s, cs }
  }
  const p = a11(['0.25', '0.75']), t = a11(['1'])
  ver('control: entra a ask 1,10010 (bid 1,10007 + 3 ticks)', true)
  oraculo('A11', '(a) 0,25 + 0,75: bruto 47.500.000 + 142.500.000; comision 750.000 + 2.250.000; neto 46.750.000 + 140.250.000',
    p.cs[0]?.bruto_µ === 47_500_000n && p.cs[1]?.bruto_µ === 142_500_000n && p.cs[0]?.comision_µ === 750_000n && p.cs[1]?.comision_µ === 2_250_000n && p.cs[0]?.neto_µ === 46_750_000n && p.cs[1]?.neto_µ === 140_250_000n,
    p.cs.map(c => `${c?.bruto_µ}/${c?.comision_µ}/${c?.neto_µ}`).join(' · '))
  oraculo('A11', '(a) completo: 190.000.000 bruto, 187.000.000 neto; los dos acaban en saldo 100.187.000.000', t.cs[0]?.bruto_µ === 190_000_000n && t.cs[0]?.neto_µ === 187_000_000n && t.s.e.saldo_µ === 100_187_000_000n && p.s.e.saldo_µ === 100_187_000_000n, `${t.s.e.saldo_µ} · ${p.s.e.saldo_µ}`)
  const s = sesion({ par: 'USDJPY', costes: aislado('USDJPY', '0.0'), filas: [plana('150.000'), plana('150.001')] })
  ap(s, { tipo: 'abrir', orden: 'mercado', lado: 'BUY', lotes: '1', cotizadoEn: s.e.reloj.cursor })
  avanza(s, 1)
  const b = ['0.25', '0.75'].map(l => cierres(ap(s, { tipo: 'cerrar', id: s.e.posiciones[0]?.id, lotes: l }))[0]?.bruto_µ)
  oraculo('A11', '(b) residuo: 166.666 + 499.996 = 666.662 µ (sin residuo seria 666.663)', b[0] === 166_666n && b[1] === 499_996n, b.join(' + '))
}

titulo('A12 · 0,01 lote y remanente al serializar')
{
  const mk = () => { const s = sesion({ filas: [plana('1.10000'), plana('1.10000')] }); ap(s, { tipo: 'abrir', orden: 'mercado', lado: 'BUY', lotes: '0.03', cotizadoEn: s.e.reloj.cursor }); return s }
  const s1 = mk()
  oraculo('A12', '0,03 lotes: comision 90.000 µ (0,01 lote = 30.000)', s1.e.saldo_µ === 100_000_000_000n - 90_000n, String(s1.e.saldo_µ))
  const c1 = cierres(ap(s1, { tipo: 'cerrar', id: s1.e.posiciones[0].id, lotes: '0.01' }))[0]
  const s2 = mk()
  ap(s2, { tipo: 'cerrar', id: s2.e.posiciones[0].id, lotes: '0.01' })
  s2.e = M.deserializa(M.serializa(s2.e))
  const c2 = cierres(ap(s2, { tipo: 'cerrar', id: s2.e.posiciones[0].id, lotes: '0.02' }))[0]
  const c1b = cierres(ap(s1, { tipo: 'cerrar', id: s1.e.posiciones[0].id, lotes: '0.02' }))[0]
  oraculo('A12', 'cierres 0,01 + 0,02: comision 30.000 + 60.000, igual con y sin serializar en medio', c1?.comision_µ === 30_000n && c1b?.comision_µ === 60_000n && c2?.comision_µ === 60_000n && M.equivalentes(s1.e, s2.e), `${c1?.comision_µ} + ${c1b?.comision_µ} · ${c2?.comision_µ}`)
  oraculo('A12', 'serializar y leer da un estado equivalente y el mismo texto', M.serializa(M.deserializa(M.serializa(s1.e))) === M.serializa(s1.e))
}

titulo('A16 · SL en la ultima M1, fin de datos, pausa entre minutos')
{
  const s = sesion({ costes: sin, filas: [plana('1.10000'), plana('1.10000'), ['1.10000', '1.10010', '1.09850', '1.09900']] })
  ap(s, { tipo: 'abrir', orden: 'mercado', lado: 'BUY', lotes: '1', cotizadoEn: s.e.reloj.cursor, sl: '1.09900' })
  const r0 = ap(s, { tipo: 'avanzar', hasta: s.v[1].time + 30 })
  oraculo('A16', 'avanzar hasta mitad de un minuto solo consume minutos completos (no la ultima)', s.e.reloj.cursor === s.v[1].time && cierres(r0).length === 0)
  const r1 = ap(s, { tipo: 'avanzar', hasta: s.v[2].time + 600 })
  oraculo('A16', 'el SL de la ultima M1 se ejecuta y fin_de_datos se emite una vez', cierres(r1).length === 1 && r1.eventos.filter(x => x.tipo === 'fin_de_datos').length === 1)
  const r2 = ap(s, { tipo: 'avanzar', hasta: s.v[2].time + 6000 })
  oraculo('A16', 'un avance posterior no cambia nada (ni otro fin_de_datos)', r2.eventos.length === 0 && M.equivalentes(r2.estado, r1.estado))
}

titulo('A17 · cotizacion vieja: precio_cambiado, nunca un fill al precio viejo')
{
  const s = sesion({ filas: [plana('1.10000'), plana('1.10500')] })
  const viejo = s.e.reloj.cursor
  avanza(s, 1)
  const r = ap(s, { tipo: 'abrir', orden: 'mercado', lado: 'BUY', lotes: '1', cotizadoEn: viejo })
  oraculo('A17', 'abrir con el cursor viejo: rechazado precio_cambiado, con la cotizacion nueva, y sin posicion', r.resultado?.rechazado === 'precio_cambiado' && tx('EURUSD', r.resultado?.cotizacion?.ask) === '1.10503' && s.e.posiciones.length === 0, JSON.stringify(r.resultado, (k, v) => typeof v === 'bigint' ? String(v) : v))
  const r2 = ap(s, { tipo: 'abrir', orden: 'mercado', lado: 'BUY', lotes: '1', cotizadoEn: s.e.reloj.cursor })
  oraculo('A17', 'recotizado (cursor vigente): entra a 1,10503', tx('EURUSD', fills(r2)[0]?.precio) === '1.10503')
}
fin()
