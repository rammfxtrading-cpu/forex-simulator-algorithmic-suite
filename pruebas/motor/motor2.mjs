/**
 * MOTOR · motor@2 / margen@2 DEL MOTOR DE UN PAR (especificacion v2.3.1,
 * § 13.2 y § 13.9; P-23a; Astra diseño-4 § C y § D). Escrito ANTES que el codigo.
 *
 * Cambios sobre el motor aprobado (motor@1):
 *   · limites tras CADA cierre y tras CADA fill; con breach no se ejecuta nada
 *     mas en ese precio; la posicion recien abierta se cierra por breach;
 *   · P-23a: limites antes de la primera apertura de cada precio;
 *   · margen@2: nocional con el BID (a mercado, el del cursor; una pendiente,
 *     el de la apertura del minuto); margen fijado en la posicion y liberado
 *     en proporcion a los lotes cerrados.
 * ORACULOS, a mano (costes@1: EURUSD 0,3 pips = 3 ticks; comision 3 USD/lote):
 *   § 13.9: BUY 1 a ask 1,10003 con SL 1,05000 y una BUY LIMIT 1,05003; la vela
 *   abre plana en 1,05000: cierre SL (−5.003), equity 94.994 < 95.000 → breach;
 *   la pendiente se cancela; saldo 94.994 (motor@1: 94.988).
 *   P-23a: lo mismo SIN SL: en 1,05000 la equity ya es 94.994 < 95.000 antes de
 *   ninguna apertura → breach, la pendiente no se llena; saldo 94.994. Control:
 *   con el suelo en 94.994 (igualdad) se sigue: la pendiente se llena y, tras el
 *   fill (−3 de comision, −3 de spread), 94.988 < 94.994 → breach; la posicion
 *   nueva se cierra por breach.
 *   Tras el fill: capital 95.005 sin posiciones y dos BUY LIMIT 1,10003; la vela
 *   abre en 1,10000: el primer fill deja 94.999 < 95.000 → breach, la posicion
 *   nueva se cierra por breach y la segunda orden no se llena. Igual con un SL
 *   ya alcanzado en el fill: el cierre es por breach, no por SL.
 *   margen@2: con libre 1.100,01, un BUY a mercado (bid 1,10000, ask 1,10003)
 *   necesita 1.100,00 y se admite; con libre 1.099,25, la BUY LIMIT 1,09900 de
 *   A01 b necesita 1.099,50 (apertura 1,09950) y se cancela.
 *   Versiones: motor@2 y margen@2 en el estado.
 */
import { titulo, oraculo, fin, importa } from '../lib.mjs'
const M = await importa('lib/motor/motor.mjs')
const { COSTES_1 } = await importa('lib/motor/costes.mjs')
const T0 = Date.parse('2026-03-03T10:00:00Z') / 1000
const plana = p => [p, p, p, p]
const serie = filas => M.velas('EURUSD', filas.map(([o, h, l, c], i) => ({ time: T0 + 60 * i, open: o, high: h, low: l, close: c })))
const µ = txt => { const [e, d = ''] = String(txt).split('.'); return BigInt(e) * 1_000_000n + (e.startsWith('-') ? -1n : 1n) * BigInt((d + '000000').slice(0, 6)) }
const enTexto = x => JSON.stringify(x, (k, v) => (typeof v === 'bigint' ? `${v}n` : v))
function sesion({ capital = '100000', limites = [], filas }) {
  const v = serie(filas)
  let e = M.crea({ par: 'EURUSD', costes: COSTES_1, capital, limites })
  e = M.aplica(e, { tipo: 'avanzar', hasta: T0 }, v).estado
  return { e, v }
}
const ap = (s, c) => { const r = M.aplica(s.e, c, s.v); s.e = r.estado; return r }
const tipos = r => r.eventos.map(x => x.tipo + (x.motivo ? ' ' + x.motivo : ''))
const suelo = n => [{ regla: 'perdida_diaria', limite: n }]

titulo('§ 13.9 · limites tras cada cierre (motor@2)')
{
  const s = sesion({ limites: suelo('95000'), filas: [plana('1.10000'), plana('1.05000')] })
  ap(s, { tipo: 'abrir', orden: 'mercado', lado: 'BUY', lotes: '1', sl: '1.05000', cotizadoEn: s.e.reloj.cursor })
  ap(s, { tipo: 'abrir', orden: 'limit', lado: 'BUY', lotes: '1', precio: '1.05003' })
  const r = ap(s, { tipo: 'avanzar', hasta: T0 + 60 })
  oraculo('§13.9', 'cierre SL → breach; la pendiente se cancela (breach); ningun fill; saldo 94.994 (motor@1 daba 94.988)', JSON.stringify(tipos(r)) === JSON.stringify(['cierre SL', 'breach', 'orden_cancelada breach']) && s.e.saldo_µ === µ('94994'), `${tipos(r).join(', ')} · ${s.e.saldo_µ}`)
}

{
  // dos protecciones en el mismo precio: tras el PRIMER cierre ya hay breach; la segunda posicion se cierra por breach, no por su SL
  const s = sesion({ limites: suelo('95000'), filas: [plana('1.10000'), plana('1.05000')] })
  for (let i = 0; i < 2; i++) ap(s, { tipo: 'abrir', orden: 'mercado', lado: 'BUY', lotes: '1', sl: '1.05000', cotizadoEn: s.e.reloj.cursor })
  const r = ap(s, { tipo: 'avanzar', hasta: T0 + 60 })
  oraculo('§13.9', 'dos SL en el mismo precio: cierre SL de p1 → breach (89.988 < 95.000) → p2 se cierra por breach, no por SL', JSON.stringify(tipos(r)) === JSON.stringify(['cierre SL', 'breach', 'cierre breach']) && r.eventos[2].posicion === 'p2' && s.e.saldo_µ === µ('89988'), `${tipos(r).join(', ')} · ${s.e.saldo_µ}`)
}

titulo('P-23a · limites antes de la primera apertura')
{
  const s = sesion({ limites: suelo('95000'), filas: [plana('1.10000'), plana('1.05000')] })
  ap(s, { tipo: 'abrir', orden: 'mercado', lado: 'BUY', lotes: '1', cotizadoEn: s.e.reloj.cursor })
  ap(s, { tipo: 'abrir', orden: 'limit', lado: 'BUY', lotes: '1', precio: '1.05003' })
  const r = ap(s, { tipo: 'avanzar', hasta: T0 + 60 })
  oraculo('P-23a', 'hueco sin SL/TP con la cuenta ya rota: breach antes de abrir; cero fills; saldo 94.994', JSON.stringify(tipos(r)) === JSON.stringify(['breach', 'cierre breach', 'orden_cancelada breach']) && s.e.saldo_µ === µ('94994'), `${tipos(r).join(', ')} · ${s.e.saldo_µ}`)
  const c = sesion({ limites: suelo('94994'), filas: [plana('1.10000'), plana('1.05000')] })
  ap(c, { tipo: 'abrir', orden: 'mercado', lado: 'BUY', lotes: '1', cotizadoEn: c.e.reloj.cursor })
  ap(c, { tipo: 'abrir', orden: 'limit', lado: 'BUY', lotes: '1', precio: '1.05003' })
  const rc = ap(c, { tipo: 'avanzar', hasta: T0 + 60 })
  oraculo('P-23a', 'control: con el suelo en 94.994 (igualdad) se sigue: la pendiente se llena; tras el fill, 94.988 < 94.994 → breach; la posicion nueva se cierra por breach', JSON.stringify(tipos(rc)) === JSON.stringify(['fill', 'breach', 'cierre breach', 'cierre breach']) && rc.eventos[0].orden === 'o2' && c.e.saldo_µ === µ('94988'), `${tipos(rc).join(', ')} · ${c.e.saldo_µ}`)
}

titulo('Limites tras el fill (Astra, diseño-4 § D, prueba 2)')
for (const conSL of [false, true]) {
  const s = sesion({ capital: '95005', limites: suelo('95000'), filas: [plana('1.10010'), plana('1.10000')] })
  ap(s, { tipo: 'abrir', orden: 'limit', lado: 'BUY', lotes: '1', precio: '1.10003', ...(conSL ? { sl: '1.10000' } : {}) })
  ap(s, { tipo: 'abrir', orden: 'limit', lado: 'BUY', lotes: '1', precio: '1.10003' })
  const r = ap(s, { tipo: 'avanzar', hasta: T0 + 60 })
  oraculo('FILL', `primer fill: 95.005 − 3 − 3 = 94.999 < 95.000 → breach; la posicion nueva se cierra por breach${conSL ? ' (no por su SL, ya alcanzado)' : ''}; la segunda orden no se llena`, JSON.stringify(tipos(r)) === JSON.stringify(['fill', 'breach', 'cierre breach', 'orden_cancelada breach']) && r.eventos[0].orden === 'o1' && s.e.saldo_µ === µ('94999'), `${tipos(r).join(', ')} · ${s.e.saldo_µ}`)
}

titulo('margen@2 · el bid, fijado y proporcional')
{
  const a = sesion({ capital: '1100.01', filas: [plana('1.10000')] })
  const ra = ap(a, { tipo: 'abrir', orden: 'mercado', lado: 'BUY', lotes: '1', cotizadoEn: a.e.reloj.cursor })
  oraculo('MARGEN', 'libre 1.100,01: BUY a mercado con margen 1.100,00 (bid, no el ask 1,10003) se admite y lo fija', ra.resultado === 'aceptado' && a.e.posiciones[0]?.margen_fijado_µ === µ('1100'), `${enTexto(ra.resultado)} · ${a.e.posiciones[0]?.margen_fijado_µ}`)
  const b = sesion({ capital: '1099.25', filas: [plana('1.10000'), ['1.09950', '1.09960', '1.09880', '1.09900']] })
  ap(b, { tipo: 'abrir', orden: 'limit', lado: 'BUY', lotes: '1', precio: '1.09900' })
  const rb = ap(b, { tipo: 'avanzar', hasta: T0 + 60 })
  oraculo('MARGEN', 'libre 1.099,25: la BUY LIMIT 1,09900 necesita 1.099,50 (bid de apertura del minuto, 1,09950): margen_insuficiente', JSON.stringify(tipos(rb)) === JSON.stringify(['orden_cancelada margen_insuficiente', 'fin_de_datos']), tipos(rb).join(', '))
  const c = sesion({ filas: [plana('1.10000'), plana('1.20000')] })
  ap(c, { tipo: 'abrir', orden: 'mercado', lado: 'BUY', lotes: '1', cotizadoEn: c.e.reloj.cursor })
  ap(c, { tipo: 'avanzar', hasta: T0 + 60 })
  ap(c, { tipo: 'cerrar', id: 'p1', lotes: '0.25' })
  const usado = c.e.posiciones[0] ? c.e.posiciones[0].margen_fijado_µ - c.e.posiciones[0].margen_liberado_µ : null
  oraculo('MARGEN', 'margen fijado 1.100,00; cerrar 0,25 con el precio ya en 1,20000 libera 275,00 de la base (no recalcula): queda 825,00', usado === µ('825'), String(usado))
  oraculo('VERSION', 'el estado dice motor@2 y margen@2', a.e.versiones?.motor === 'motor@2' && a.e.versiones?.margen === 'margen@2', enTexto(a.e.versiones))
}
fin()
