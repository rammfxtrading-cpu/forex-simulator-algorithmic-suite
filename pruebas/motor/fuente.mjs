/**
 * MOTOR · PIEZA 5: LA FUENTE DE MERCADO DE UN INSTRUMENTO (especificacion v2.1,
 * § 1.7, § 3.8, § 12.2, § 12.10; A15, A16, A26). Escrito ANTES que el codigo.
 *
 * Une las piezas 3 y 4 (trozo binario y manifiesto) con el motor de la pieza 2,
 * sin base ni interfaz: creaFuente({ manifiesto, fijado, leeTrozo })
 * (ETAPA 2, S4-03 y diseño p.2: los dias cortos aceptados y los huecos
 * aceptados vienen del manifiesto y de sus trozos, no de un parametro)
 * y avanza(estado, hasta, fuente, { desde }).
 *   · A26: la fuente se niega si el manifiesto no es el fijado por la sesion.
 *   · Entrega al motor las velas del tramo (cursor, hasta]; si el tramo no es el
 *     final de los datos, el motor no emite fin_de_datos.
 *   · Mercado cerrado (sabado, dia que el manifiesto marca cerrado): se salta.
 *   · Falta de dato en horario de mercado (dia sin trozo, dia corto que no esta
 *     en la lista de aceptados, trozo alterado o no disponible): DETENCION, con
 *     el cursor SIN CONSUMIR ese dia (§ 12.2: no_valorable).
 *   · Despues del ultimo dia del manifiesto: fin de datos, no un fallo.
 *   · C6-03: el estado fija su mercado (versiones.mercado, § 3.1); una fuente de
 *     otro par, de otra huella o un estado sin fijar: detencion, estado intacto.
 *   · C6-06: un manifiesto externo con hash correcto y un trozo invalido (OHLC,
 *     escala, reservado): trozo_alterado, sin eventos, estado identico.
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
// C6-03: la sesion fija su mercado (versiones.mercado) y la fuente tiene que ser esa
const sesion = (m = m3) => M.crea({ par: 'EURUSD', costes: sinCostes, capital: '100000', mercado: MF.fija(m) })
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
const rC = FU ? FU.avanza(sesion(conCierre), S('2026-03-09') + 3600, fC, { desde: S('2026-03-02') }) : null
oraculo('FUE', 'viernes cerrado por el manifiesto y sabado: se saltan; llega al lunes 9 sin detencion', !!rC && !rC.detencion && rC.estado.reloj.cursor === S('2026-03-09') + 3600, rC ? enTexto(rC.detencion) : '')
// sin el trozo del miercoles (dia con mercado): detencion no_valorable, cursor al final del martes
const hueco = mercado([LUN, MAR, JUE])
const fH = FU?.creaFuente({ manifiesto: hueco, fijado: MF.fija(hueco), leeTrozo: lector([LUN, MAR, JUE]) })
const rH = FU ? FU.avanza(sesion(hueco), S('2026-03-05') + 3600, fH, { desde: S('2026-03-02') }) : null
oraculo('FUE', 'un dia con mercado sin trozo: detencion «no_valorable» del 2026-03-04, cursor sin consumir ese dia', !!rH && rH.detencion?.motivo === 'no_valorable' && rH.detencion?.dia === '2026-03-04' && rH.estado.reloj.cursor === S('2026-03-03') + 86400 - 60, rH ? `${enTexto(rH.detencion)} · cursor ${rH.estado.reloj.cursor}` : '')
const rH2 = FU ? FU.avanza(rH.estado, S('2026-03-05') + 3600, fH) : null
oraculo('FUE', 'repetir el avance: la misma detencion, el cursor no se mueve y sin eventos', !!rH2 && rH2.detencion?.dia === '2026-03-04' && rH2.estado.reloj.cursor === rH.estado.reloj.cursor && rH2.eventos.length === 0)
// miercoles corto (600 velas): no_valorable; con 600 en la lista de aceptados: valorable
const corto = dia('2026-03-04', 600)
const mCorto = mercado([LUN, MAR, corto, JUE])
const fK = FU?.creaFuente({ manifiesto: mCorto, fijado: MF.fija(mCorto), leeTrozo: lector([LUN, MAR, corto, JUE]) })
const rK = FU ? FU.avanza(sesion(mCorto), S('2026-03-05') + 3600, fK, { desde: S('2026-03-02') }) : null
const cortoA = [{ dia: '2026-03-04', velas: 600, motivo: 'prueba' }]
const mCortoA = MF.creaManifiesto({ par: 'EURUSD', version: 'v1', trozos: [LUN, MAR, corto, JUE], cortosAceptados: cortoA })
const fKa = FU?.creaFuente({ manifiesto: mCortoA, fijado: MF.fija(mCortoA), leeTrozo: lector([LUN, MAR, corto, JUE]) })
const rKa = FU ? FU.avanza(sesion(mCortoA), S('2026-03-05') + 3600, fKa, { desde: S('2026-03-02') }) : null
// P7-01 (CTO 10-oct; cambio de contrato, marcado para Astra): aceptar el DIA corto ya no basta; sus 840 minutos
// sin velas (miercoles 10:00 → jueves 00:00, mercado abierto) son un hueco interior que detiene salvo que el
// manifiesto lo declare aceptado (etapa 2: el hueco va en el trozo del miercoles y el dia corto en el manifiesto)
const cortoH = { dia: '2026-03-04', buffer: B.codifica('EURUSD', S('2026-03-04'), corto.velas, [{ inicio: '2026-03-04T10:00Z', minutos: 840, motivo: 'festivo' }]) }
const mCortoH = MF.creaManifiesto({ par: 'EURUSD', version: 'v1', trozos: [LUN, MAR, cortoH, JUE], cortosAceptados: cortoA })
const fKh = FU?.creaFuente({ manifiesto: mCortoH, fijado: MF.fija(mCortoH), leeTrozo: lector([LUN, MAR, cortoH, JUE]) })
const rKh = FU ? FU.avanza(sesion(mCortoH), S('2026-03-05') + 3600, fKh, { desde: S('2026-03-02') }) : null
oraculo('FUE', 'dia corto (600/1200): no_valorable; aceptado con 600 velas: detiene en su hueco interior (miercoles 10:00, 840 min); con el hueco declarado en el manifiesto: se avanza hasta el jueves', rK?.detencion?.motivo === 'no_valorable' && rK?.detencion?.dia === '2026-03-04' && rKa?.detencion?.frontera === S('2026-03-04') + 600 * 60 && rKa.detencion.minutos === 840 && !rKh?.detencion && rKh?.estado.reloj.cursor === S('2026-03-05') + 3600, `${enTexto(rK?.detencion)} · ${enTexto(rKa?.detencion)} · ${enTexto(rKh?.detencion)}`)

oraculo('FUE', 'S4-03: creaFuente ya no admite «aceptados» aparte (vienen del manifiesto)', !!FU && lanza(() => FU.creaFuente({ manifiesto: mCortoA, fijado: MF.fija(mCortoA), leeTrozo: lector([LUN, MAR, corto, JUE]), aceptados: new Map([['2026-03-04', 600]]) })))
// el hueco aceptado en el trozo, con el dia corto SIN declarar en el manifiesto: el dia sigue faltando (un hueco no acepta el dia)
const mSoloH = MF.creaManifiesto({ par: 'EURUSD', version: 'v1', trozos: [LUN, MAR, cortoH, JUE] })
const rSoloH = FU ? FU.avanza(sesion(mSoloH), S('2026-03-05') + 3600, FU.creaFuente({ manifiesto: mSoloH, fijado: MF.fija(mSoloH), leeTrozo: lector([LUN, MAR, cortoH, JUE]) }), { desde: S('2026-03-02') }) : null
oraculo('FUE', 'p.2: el hueco aceptado en el trozo no acepta el dia corto: sin declararlo en el manifiesto, no_valorable del miercoles', rSoloH?.detencion?.motivo === 'no_valorable' && rSoloH.detencion.dia === '2026-03-04' && rSoloH.detencion.frontera === S('2026-03-04'), enTexto(rSoloH?.detencion))

titulo('5 · trozos que no se pueden leer')
const alterado = Buffer.from(MAR.buffer); alterado[40] ^= 1
const fA = FU?.creaFuente({ manifiesto: m3, fijado: MF.fija(m3), leeTrozo: d => (d === '2026-03-03' ? alterado : lector([LUN, MAR, MIE])(d)) })
const rA = FU ? FU.avanza(sesion(), finMie, fA, { desde: S('2026-03-02') }) : null
oraculo('A26', 'un trozo alterado (sha distinto): detencion «trozo_alterado» del martes, cursor al final del lunes', rA?.detencion?.motivo === 'trozo_alterado' && rA?.detencion?.dia === '2026-03-03' && rA?.estado.reloj.cursor === S('2026-03-02') + 86400 - 60, enTexto(rA?.detencion))
const fN = FU?.creaFuente({ manifiesto: m3, fijado: MF.fija(m3), leeTrozo: d => (d === '2026-03-03' ? null : lector([LUN, MAR, MIE])(d)) })
const rN = FU ? FU.avanza(sesion(), finMie, fN, { desde: S('2026-03-02') }) : null
oraculo('FUE', 'un trozo que no llega: detencion «trozo_no_disponible»', rN?.detencion?.motivo === 'trozo_no_disponible' && rN?.detencion?.dia === '2026-03-03', enTexto(rN?.detencion))

titulo('6 · C6-03 (Astra, cierres-6): la fuente tiene que ser la del estado (par y huella)')
// una fuente VALIDA y fijada de GBPUSD a 1,25000, conectada a una sesion EURUSD
const gbFilas = Array.from({ length: 1440 }, (_, i) => ({ time: S('2026-03-02') + 60 * i, open: '1.25000', high: '1.25000', low: '1.25000', close: '1.25000' }))
const gb = { dia: '2026-03-02', buffer: B.codifica('GBPUSD', S('2026-03-02'), M.velas('GBPUSD', gbFilas).map(v => ({ ...v, volume: 1 }))) }
const mGb = MF.creaManifiesto({ par: 'GBPUSD', version: 'v1', trozos: [gb] })
const fGb = FU?.creaFuente({ manifiesto: mGb, fijado: MF.fija(mGb), leeTrozo: lector([gb]) })
const quieto = (r, antes) => !!r && r.eventos.length === 0 && M.serializa(r.estado) === antes
const s0 = sesion(), t0 = M.serializa(s0)
const rGb = FU ? FU.avanza(s0, S('2026-03-02') + 3600, fGb, { desde: S('2026-03-02') }) : null
oraculo('FUE', 'C6-03: fuente de GBPUSD con una sesion EURUSD: detencion «fuente_de_otro_par», estado intacto (sin cotizacion de otro par)', rGb?.detencion?.motivo === 'fuente_de_otro_par' && quieto(rGb, t0), rGb ? `${enTexto(rGb.detencion)} · ${enTexto(rGb.estado.cotizacion)}` : '')
const fOtro = FU?.creaFuente({ manifiesto: otro, fijado: MF.fija(otro), leeTrozo: lector([LUN, MAR, dia('2026-03-04', 1440, () => '1.10010')]) })
const rOtro = FU ? FU.avanza(s0, S('2026-03-02') + 3600, fOtro, { desde: S('2026-03-02') }) : null
oraculo('FUE', 'C6-03: fuente de EURUSD con otra huella que la fijada en el estado: detencion «fuente_de_otra_version», estado intacto', rOtro?.detencion?.motivo === 'fuente_de_otra_version' && quieto(rOtro, t0), enTexto(rOtro?.detencion))
const libre = M.crea({ par: 'EURUSD', costes: sinCostes, capital: '100000' }), tl = M.serializa(libre)
const rLibre = FU ? FU.avanza(libre, S('2026-03-02') + 3600, FU.creaFuente({ manifiesto: m3, fijado: MF.fija(m3), leeTrozo: lector([LUN, MAR, MIE]) }), { desde: S('2026-03-02') }) : null
oraculo('FUE', 'C6-03: un estado sin mercado fijado: detencion «mercado_no_fijado», estado intacto', rLibre?.detencion?.motivo === 'mercado_no_fijado' && quieto(rLibre, tl), enTexto(rLibre?.detencion))
const rBien = FU ? FU.avanza(s0, S('2026-03-02') + 3600, fFin, { desde: S('2026-03-02') }) : null
oraculo('FUE', 'C6-03 control: la fuente fijada en el estado avanza sin detencion', !!rBien && !rBien.detencion && rBien.estado.reloj.cursor === S('2026-03-02') + 3600 && rBien.estado.versiones.mercado?.EURUSD === MF.fija(m3), enTexto(rBien?.estado.versiones))

titulo('7 · C6-04: el festivo lo decide solo el manifiesto')
// viernes 25-dic-2026 con UNA vela a las 00:00 (el caso de Astra)
const nav = { dia: '2026-12-25', buffer: B.codifica('EURUSD', S('2026-12-25'), M.velas('EURUSD', [{ time: S('2026-12-25'), open: '1.10000', high: '1.10000', low: '1.10000', close: '1.10000' }]).map(v => ({ ...v, volume: 1 }))) }
for (const [que, cerrados, detiene] of [['sin declarar', [], true], ['declarado cerrado', ['2026-12-25'], false]]) {
  const mN = mercado([nav], cerrados)
  const fN2 = FU?.creaFuente({ manifiesto: mN, fijado: MF.fija(mN), leeTrozo: lector([nav]) })
  const r = FU ? FU.avanza(sesion(mN), S('2026-12-25') + 3600, fN2, { desde: S('2026-12-25') }) : null
  oraculo('FUE', `C6-04: 25-dic con 1 vela ${que}: ${detiene ? 'detencion «no_valorable», sin fin_de_datos' : 'sin detencion (cerrado: se salta)'}`, !!r && (detiene ? r.detencion?.motivo === 'no_valorable' && r.detencion?.dia === '2026-12-25' && !r.eventos.some(x => x.tipo === 'fin_de_datos') : !r.detencion), r ? `${enTexto(r.detencion)} · ${r.eventos.map(x => x.tipo).join(',')}` : '')
}

titulo('8 · C6-06 (Astra, cierres-6/7): manifiesto externo con hash correcto y trozo invalido → trozo_alterado')
// un artefacto de otro productor: bytes integros (sha256 correcto) y contenido financiero invalido. No pasa por
// creaManifiesto (que ya lo rechaza): se rehace aqui su sha, su nombre y la huella del contenido canonico
const bueno = MF.creaManifiesto({ par: 'EURUSD', version: 'externo', trozos: [LUN] })
const externo = buf => {
  const m = structuredClone(bueno)
  m.dias[0].sha256 = B.huella(buf); m.dias[0].nombre = `${m.dias[0].dia}.${m.dias[0].sha256}.bin`
  m.huella = MF.huellaDe(m)
  return m
}
for (const [que, f] of [['OHLC (high − open = −1)', x => x.writeInt32LE(-1, 20 + 6)], ['escala 4', x => x.writeUInt8(4, 5)], ['reservado 1', x => x.writeUInt16LE(1, 6)]]) {
  const malo = Buffer.from(LUN.buffer); f(malo)
  const m = externo(malo)
  ver(`control ${que}: el manifiesto externo pasa su huella, el sha del trozo coincide y creaManifiesto lo rechazaria`, MF.validaManifiesto(m) === true && B.huella(malo) === m.dias[0].sha256 && lanza(() => MF.creaManifiesto({ par: 'EURUSD', version: 'externo', trozos: [{ dia: LUN.dia, buffer: malo }] })))
  const fx = FU?.creaFuente({ manifiesto: m, fijado: MF.fija(m), leeTrozo: lector([{ dia: LUN.dia, buffer: malo }]) })
  const s0 = sesion(m), t0 = M.serializa(s0)
  const r = FU ? FU.avanza(s0, S('2026-03-02') + 3600, fx, { desde: S('2026-03-02') }) : null
  oraculo('FUE', `C6-06: ${que} con hash correcto: detencion «trozo_alterado», cero eventos y estado identico`, r?.detencion?.motivo === 'trozo_alterado' && r.detencion.dia === '2026-03-02' && r.eventos.length === 0 && M.serializa(r.estado) === t0, r ? `${enTexto(r.detencion)} · ${r.eventos.length} eventos` : '')
}

titulo('9 · S4-03 (etapa 2, diseño p.3): la version efectiva registrada')
// la sesion fija la raiz (lunes y martes); se publica v1.2 (añade el miercoles). La fuente solo vale si es la
// version REGISTRADA en el estado: la raiz mientras no haya efectiva; despues, solo la efectiva
const CA = await importa('lib/motor/cartera.mjs')
const RT = await importa('lib/motor/reto.mjs')
{
const raiz = MF.creaManifiesto({ par: 'EURUSD', version: 'v1.1', trozos: [LUN, MAR] })
const v12 = MF.creaManifiesto({ par: 'EURUSD', version: 'v1.2', trozos: [LUN, MAR, MIE], anterior: raiz })
const fRaiz = FU.creaFuente({ manifiesto: raiz, fijado: MF.fija(raiz), leeTrozo: lector([LUN, MAR]) })
const f12 = FU.creaFuente({ manifiesto: v12, fijado: MF.fija(v12), leeTrozo: lector([LUN, MAR, MIE]) })
const s0 = M.crea({ par: 'EURUSD', costes: sinCostes, capital: '100000', mercado: MF.fija(raiz) })
oraculo('EFEC', 'sin efectiva: vale la raiz y no la v1.2 (aun no registrada: «nunca el ultimo»)', FU.fuenteDelEstado(s0, fRaiz) === null && FU.fuenteDelEstado(s0, f12)?.motivo === 'fuente_de_otra_version')
const cv = FU.continuaVersiones(s0.versiones, 'EURUSD', { raiz, actual: raiz, nuevo: v12 })
const s1 = cv.versiones ? { ...s0, versiones: cv.versiones } : s0
oraculo('EFEC', 'continuaVersiones registra la efectiva (mercado_efectivo) y deja la raiz', cv.versiones?.mercado?.EURUSD === MF.fija(raiz) && cv.versiones?.mercado_efectivo?.EURUSD === MF.fija(v12) && s0.versiones.mercado_efectivo === undefined, enTexto(cv))
oraculo('EFEC', 'con la efectiva registrada: vale la v1.2 y ya no la raiz', FU.fuenteDelEstado(s1, f12) === null && FU.fuenteDelEstado(s1, fRaiz)?.motivo === 'fuente_de_otra_version')
const r1 = FU.avanza(s1, S('2026-03-04') + 3600, f12, { desde: S('2026-03-02') })
oraculo('EFEC', 'avanzar con la efectiva cruza la antigua frontera (martes) y llega al miercoles; serializar y deserializar la conserva', !r1.detencion && r1.estado.reloj.cursor === S('2026-03-04') + 3600 && M.deserializa(M.serializa(r1.estado)).versiones.mercado_efectivo.EURUSD === MF.fija(v12), enTexto(r1.detencion))
oraculo('EFEC', 'sin efectiva, el estado serializado no cambia (ni una clave nueva)', !M.serializa(s0).includes('mercado_efectivo'))
const mal = MF.creaManifiesto({ par: 'EURUSD', version: 'v1.2', trozos: [LUN, dia('2026-03-03', 1440, () => '1.10010'), MIE] })
const otraRaiz = MF.creaManifiesto({ par: 'EURUSD', version: 'v1.1', trozos: [LUN] })
const inc = [
  ['un martes distinto (no es continuacion)', FU.continuaVersiones(s0.versiones, 'EURUSD', { raiz, actual: raiz, nuevo: mal })],
  ['una raiz que no es la fijada', FU.continuaVersiones(s0.versiones, 'EURUSD', { raiz: otraRaiz, actual: otraRaiz, nuevo: v12 })],
  ['un «actual» que no es la efectiva registrada', FU.continuaVersiones(s1.versiones, 'EURUSD', { raiz, actual: raiz, nuevo: v12 })],
  ['otro par', FU.continuaVersiones(s0.versiones, 'GBPUSD', { raiz, actual: raiz, nuevo: v12 })],
]
for (const [que, r] of inc) oraculo('EFEC', `incidente: ${que} → sin versiones nuevas`, typeof r?.incidente === 'string' && r.versiones === undefined, enTexto(r))
// cartera y reto comprueban lo mismo que fuenteDelEstado
const c1 = CA.crea({ pares: ['EURUSD'], costes: sinCostes, capital: '100000', mercado: { EURUSD: MF.fija(raiz) } })
const c1e = { ...c1, versiones: FU.continuaVersiones(c1.versiones, 'EURUSD', { raiz, actual: raiz, nuevo: v12 }).versiones }
oraculo('EFEC', 'cartera: con la efectiva, la fuente v1.2 avanza y la raiz se rechaza', !CA.avanza(c1e, S('2026-03-04') + 3600, { EURUSD: f12 }, { desde: S('2026-03-02') }).detencion && CA.avanza(c1e, S('2026-03-04') + 3600, { EURUSD: fRaiz }, { desde: S('2026-03-02') }).detencion?.motivo === 'fuente_de_otra_version')
const re = RT.creaReto({ motor: s1, inicio: S('2026-03-02') })
oraculo('EFEC', 'reto: con la efectiva, la fuente v1.2 avanza y la raiz se rechaza', !RT.avanzaReto(re, S('2026-03-04') + 3600, f12).detencion && RT.avanzaReto(re, S('2026-03-04') + 3600, fRaiz).detencion?.motivo === 'fuente_de_otra_version')
}

fin()
