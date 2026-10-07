/**
 * MOTOR · PIEZA 5: LA FUENTE DE MERCADO DE UN INSTRUMENTO (especificacion v2.1,
 * § 1.7, § 3.8, § 12.2, § 12.10; A15, A16, A26). Escrito ANTES que el codigo.
 *
 * Une las piezas 3 y 4 (trozo binario y manifiesto) con el motor de la pieza 2,
 * sin base ni interfaz: creaFuente({ manifiesto, fijado, leeTrozo, aceptados })
 * y avanza(estado, hasta, fuente, { desde }).
 *   · A26: la fuente se niega si el manifiesto no es el fijado por la sesion.
 *   · Entrega al motor las velas del tramo (cursor, hasta]; si el tramo no es el
 *     final de los datos, el motor no emite fin_de_datos.
 *   · Mercado cerrado (sabado, dia que el manifiesto marca cerrado): se salta.
 *   · Falta de dato en horario de mercado (dia sin trozo, dia corto que no esta
 *     en la lista de aceptados, trozo alterado o no disponible): DETENCION, con
 *     el cursor SIN CONSUMIR ese dia (§ 12.2: no_valorable).
 *   · Despues del ultimo dia del manifiesto: fin de datos, no un fallo.
 *   · A15: paso a paso (serializando en cada frontera), salto, cortes por dia y
 *     el motor con todas las velas dan el mismo estado y los mismos eventos.
 */
import { titulo, ver, oraculo, fin, importa } from '../lib.mjs'
const M = await importa('lib/motor/motor.mjs')
const B = await importa('lib/motor/binario.mjs')
const MF = await importa('lib/motor/manifiesto.mjs')
let FU = null
try { FU = await importa('lib/motor/fuente.mjs') } catch { FU = null }
const lanza = f => { try { f(); return false } catch { return true } }
const S = d => Date.parse(d + 'T00:00:00Z') / 1000
const sinCostes = Object.freeze({ version: 'prueba:EURUSD:0', spread_pips: Object.freeze({ EURUSD: 0 }), comision_lote_µ: 3_000_000n, swap_µ: 0n })
// un dia de n velas desde las 00:00; precios por minuto con una funcion
const dia = (d, n = 1440, px = () => '1.10000') => {
  const filas = Array.from({ length: n }, (_, i) => { const p = px(i); return { time: S(d) + 60 * i, open: p, high: p, low: p, close: p } })
  const velas = n ? M.velas('EURUSD', filas).map(v => ({ ...v, volume: 1 })) : []
  return { dia: d, buffer: B.codifica('EURUSD', S(d), velas), velas }
}
// lunes 2: plano · martes 3: a las 10:00 baja a 1,09900 (llena el BUY LIMIT 1,09950)
// · miercoles 4: a las 05:00 baja a 1,09800 (salta el SL 1,09850)
// un domingo: n velas desde la hora h UTC (abre a las 17:00 de Nueva York)
const domingo = (d, h, n) => { const filas = Array.from({ length: n }, (_, i) => ({ time: S(d) + 3600 * h + 60 * i, open: '1.10000', high: '1.10000', low: '1.10000', close: '1.10000' })); const velas = M.velas('EURUSD', filas).map(v => ({ ...v, volume: 1 })); return { dia: d, buffer: B.codifica('EURUSD', S(d), velas), velas } }
const LUN = dia('2026-03-02'), MAR = dia('2026-03-03', 1440, i => (i === 600 ? '1.09900' : '1.10000')), MIE = dia('2026-03-04', 1440, i => (i >= 300 ? '1.09800' : '1.10000'))
const mercado = (trozos, cerrados = []) => MF.creaManifiesto({ par: 'EURUSD', version: 'v1', trozos, cerrados })
const lector = trozos => d => trozos.find(t => t.dia === d)?.buffer ?? null
const enTexto = x => JSON.stringify(x, (k, v) => (typeof v === 'bigint' ? `${v}n` : v))
const sesion = () => M.crea({ par: 'EURUSD', costes: sinCostes, capital: '100000' })
const economicos = evs => evs.filter(e => e.tipo !== 'fin_de_datos')

titulo('1 · A26: la fuente solo acepta el manifiesto fijado')
const m3 = mercado([LUN, MAR, MIE])
const otro = mercado([LUN, MAR, dia('2026-03-04', 1440, () => '1.10010')])
oraculo('FUE', 'con el manifiesto fijado se crea; con otro (otra huella) se niega', !!FU && !lanza(() => FU.creaFuente({ manifiesto: m3, fijado: MF.fija(m3), leeTrozo: lector([LUN, MAR, MIE]) })) && lanza(() => FU.creaFuente({ manifiesto: otro, fijado: MF.fija(m3), leeTrozo: lector([LUN, MAR, MIE]) })))

titulo('2 · A15: paso, salto, cortes y el motor con todas las velas dan lo mismo')
// referencia: el motor con TODAS las velas (pieza 2), en dos avances
const todas = [...LUN.velas, ...MAR.velas, ...MIE.velas]
const ref = (() => {
  let e = sesion(), ev = []
  const ap = (c, v = todas) => { const r = M.aplica(e, c, v); e = r.estado; ev.push(...r.eventos); return r }
  ap({ tipo: 'avanzar', hasta: S('2026-03-02') })
  ap({ tipo: 'abrir', lado: 'BUY', orden: 'limit', precio: '1.09950', lotes: '1', sl: '1.09850' })
  ap({ tipo: 'avanzar', hasta: S('2026-03-04') + 86400 - 60 })
  return { e, ev }
})()
ver('control: la referencia llena la orden el martes y salta el SL el miercoles', ref.ev.some(x => x.tipo === 'fill') && ref.ev.some(x => x.tipo === 'cierre'), ref.ev.map(x => x.tipo).join(','))
const conFuente = cortes => {
  const f = FU.creaFuente({ manifiesto: m3, fijado: MF.fija(m3), leeTrozo: lector([LUN, MAR, MIE]) })
  let e = sesion(), ev = []
  const av = h => { const r = FU.avanza(M.deserializa(M.serializa(e)), h, f, { desde: S('2026-03-02') }); e = r.estado; ev.push(...r.eventos); return r }
  av(S('2026-03-02'))
  const r = M.aplica(e, { tipo: 'abrir', lado: 'BUY', orden: 'limit', precio: '1.09950', lotes: '1', sl: '1.09850' }); e = r.estado; ev.push(...r.eventos)
  for (const h of cortes) av(h)
  return { e, ev }
}
const finMie = S('2026-03-04') + 86400 - 60
const salto = FU ? conFuente([finMie]) : null
const porDia = FU ? conFuente([S('2026-03-02') + 86400 - 60, S('2026-03-03') + 86400 - 60, finMie]) : null
const pasoAPaso = FU ? conFuente(Array.from({ length: (finMie - S('2026-03-02')) / 60 }, (_, i) => S('2026-03-02') + 60 * (i + 1))) : null
const igual = x => !!x && M.equivalentes(x.e, ref.e) && enTexto(economicos(x.ev)) === enTexto(economicos(ref.ev))
oraculo('A15', 'un salto hasta el final del miercoles = la referencia (estado y eventos economicos)', igual(salto))
oraculo('A15', 'cortes en cada dia = la referencia', igual(porDia))
oraculo('A15', 'paso a paso, serializando en cada minuto = la referencia', igual(pasoAPaso), pasoAPaso ? `${pasoAPaso.ev.length} eventos` : '')

titulo('3 · fin de datos (A16) solo al final de verdad')
const fFin = FU?.creaFuente({ manifiesto: m3, fijado: MF.fija(m3), leeTrozo: lector([LUN, MAR, MIE]) })
const parcial = FU ? FU.avanza(sesion(), S('2026-03-03'), fFin, { desde: S('2026-03-02') }) : { eventos: [] }
oraculo('A16', 'un avance que no llega al final de los datos no emite fin_de_datos', !!FU && !parcial.eventos.some(x => x.tipo === 'fin_de_datos') && parcial.estado.reloj.cursor === S('2026-03-03'), FU ? String(parcial.estado.reloj.cursor) : '')
const total = FU ? FU.avanza(parcial.estado, S('2026-03-09'), fFin) : { eventos: [] }
const otraVez = FU ? FU.avanza(total.estado, S('2026-03-10'), fFin) : { eventos: [] }
oraculo('A16', 'pasado el ultimo dia del manifiesto: fin_de_datos una vez, sin detencion, y no se repite', !!FU && total.eventos.filter(x => x.tipo === 'fin_de_datos').length === 1 && !total.detencion && otraVez.eventos.length === 0 && !otraVez.detencion && total.estado.reloj.cursor === finMie)

titulo('4 · mercado cerrado frente a dato que falta (§ 12.2)')
// jueves 5 completo; viernes 6 marcado CERRADO en el manifiesto; sabado 7 sin
// mercado; domingo 8 abre a las 21:00 UTC (17:00 de Nueva York, ya en verano); lunes 9 completo
const JUE = dia('2026-03-05'), DOM8 = domingo('2026-03-08', 21, 180), LUN9 = dia('2026-03-09')
const conCierre = mercado([LUN, MAR, MIE, JUE, DOM8, LUN9], ['2026-03-06'])
const fC = FU?.creaFuente({ manifiesto: conCierre, fijado: MF.fija(conCierre), leeTrozo: lector([LUN, MAR, MIE, JUE, DOM8, LUN9]) })
const rC = FU ? FU.avanza(sesion(), S('2026-03-09') + 3600, fC, { desde: S('2026-03-02') }) : null
oraculo('FUE', 'viernes cerrado por el manifiesto y sabado: se saltan; llega al lunes 9 sin detencion', !!rC && !rC.detencion && rC.estado.reloj.cursor === S('2026-03-09') + 3600, rC ? enTexto(rC.detencion) : '')
// sin el trozo del miercoles (dia con mercado): detencion no_valorable, cursor al final del martes
const hueco = mercado([LUN, MAR, JUE])
const fH = FU?.creaFuente({ manifiesto: hueco, fijado: MF.fija(hueco), leeTrozo: lector([LUN, MAR, JUE]) })
const rH = FU ? FU.avanza(sesion(), S('2026-03-05') + 3600, fH, { desde: S('2026-03-02') }) : null
oraculo('FUE', 'un dia con mercado sin trozo: detencion «no_valorable» del 2026-03-04, cursor sin consumir ese dia', !!rH && rH.detencion?.motivo === 'no_valorable' && rH.detencion?.dia === '2026-03-04' && rH.estado.reloj.cursor === S('2026-03-03') + 86400 - 60, rH ? `${enTexto(rH.detencion)} · cursor ${rH.estado.reloj.cursor}` : '')
const rH2 = FU ? FU.avanza(rH.estado, S('2026-03-05') + 3600, fH) : null
oraculo('FUE', 'repetir el avance: la misma detencion, el cursor no se mueve y sin eventos', !!rH2 && rH2.detencion?.dia === '2026-03-04' && rH2.estado.reloj.cursor === rH.estado.reloj.cursor && rH2.eventos.length === 0)
// miercoles corto (600 velas): no_valorable; con 600 en la lista de aceptados: valorable
const corto = dia('2026-03-04', 600)
const mCorto = mercado([LUN, MAR, corto, JUE])
const fK = FU?.creaFuente({ manifiesto: mCorto, fijado: MF.fija(mCorto), leeTrozo: lector([LUN, MAR, corto, JUE]) })
const rK = FU ? FU.avanza(sesion(), S('2026-03-05') + 3600, fK, { desde: S('2026-03-02') }) : null
const fKa = FU?.creaFuente({ manifiesto: mCorto, fijado: MF.fija(mCorto), leeTrozo: lector([LUN, MAR, corto, JUE]), aceptados: new Map([['2026-03-04', 600]]) })
const rKa = FU ? FU.avanza(sesion(), S('2026-03-05') + 3600, fKa, { desde: S('2026-03-02') }) : null
oraculo('FUE', 'dia corto (600/1200): no_valorable; aceptado con 600 velas: se avanza hasta el jueves', rK?.detencion?.motivo === 'no_valorable' && rK?.detencion?.dia === '2026-03-04' && !rKa?.detencion && rKa?.estado.reloj.cursor === S('2026-03-05') + 3600, `${enTexto(rK?.detencion)} · ${enTexto(rKa?.detencion)}`)

titulo('5 · trozos que no se pueden leer')
const alterado = Buffer.from(MAR.buffer); alterado[40] ^= 1
const fA = FU?.creaFuente({ manifiesto: m3, fijado: MF.fija(m3), leeTrozo: d => (d === '2026-03-03' ? alterado : lector([LUN, MAR, MIE])(d)) })
const rA = FU ? FU.avanza(sesion(), finMie, fA, { desde: S('2026-03-02') }) : null
oraculo('A26', 'un trozo alterado (sha distinto): detencion «trozo_alterado» del martes, cursor al final del lunes', rA?.detencion?.motivo === 'trozo_alterado' && rA?.detencion?.dia === '2026-03-03' && rA?.estado.reloj.cursor === S('2026-03-02') + 86400 - 60, enTexto(rA?.detencion))
const fN = FU?.creaFuente({ manifiesto: m3, fijado: MF.fija(m3), leeTrozo: d => (d === '2026-03-03' ? null : lector([LUN, MAR, MIE])(d)) })
const rN = FU ? FU.avanza(sesion(), finMie, fN, { desde: S('2026-03-02') }) : null
oraculo('FUE', 'un trozo que no llega: detencion «trozo_no_disponible»', rN?.detencion?.motivo === 'trozo_no_disponible' && rN?.detencion?.dia === '2026-03-03', enTexto(rN?.detencion))
fin()
