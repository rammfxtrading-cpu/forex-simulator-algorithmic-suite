/**
 * MOTOR · PIEZA 6: EL RETO FTMO 2-STEP SOBRE UN INSTRUMENTO (especificacion
 * v2.1, § 5, § 3.4, § 3.5; A13, A14). Escrito ANTES que el codigo.
 *
 * CTO, 7-oct-2026: modulo puro en lib/motor/ (no lib/reglas/ como decia § 5),
 * sin base, sin interfaz, sin multipar. Reglas versionadas en un unico modulo,
 * citadas de la pagina oficial como en § 5 (consultada el 5-oct-2026):
 *   objetivo 10 % (fase 1) y 5 % (fase 2) con posiciones cerradas; perdida
 *   diaria 5 % del capital inicial restada al balance de medianoche; perdida
 *   maxima 10 % estatica; 4 dias con aperturas por fase; equity con flotante
 *   y costes. Calendario Europe/Prague con cambios de hora; el reset de
 *   medianoche es un evento aunque no llegue vela; breach si la equity queda
 *   POR DEBAJO (la igualdad no infringe); irreversible, con el punto guardado.
 *
 * Costes cero (aislado) para las cifras exactas: 1 lote EURUSD = 1 USD por tick
 * (0,00001); 0,01 lote = 0,01 USD por tick. Invierno: Praga = UTC+1.
 *
 * ORACULOS, a mano:
 *   A13: capital 100.000; +3.000 cerrados (saldo 103.000) y BUY 1 lote abierto
 *   a 1,13000 que a las 23:59 de Praga esta en 1,07000 (flotante −6.000;
 *   equity 97.000 sobre el suelo del dia, 95.000). A medianoche (23:00 UTC),
 *   SIN VELA: reset_diario con saldo de medianoche 103.000 y suelo 98.000;
 *   equity 97.000 < 98.000 → breach «perdida_diaria» en ese instante,
 *   liquidado al ultimo precio; despues, ninguna vela ni reset mas.
 *   Suelo exacto: en 1,08000 la equity es 98.000,000000 = suelo → no infringe.
 *   Un centimo por debajo: ademas 0,01 lote abierto a 1,08001 → flotante
 *   −5.000,01, equity 97.999,99 → breach.
 *   Perdida maxima estatica: −4.000 y −4.000 en dos dias (saldo 92.000; suelo
 *   diario del tercer dia 87.000) → el tercer dia, equity 89.999,99 < 90.000 →
 *   breach «perdida_maxima»; el limite total no se recalcula.
 *   A14: marzo (sabado 28 → lunes 30): resets a las 23:00, 23:00 y 22:00 UTC
 *   (00:00 de Praga antes y despues del cambio de hora del 29); octubre: 22:00
 *   del 24 y 23:00 del 25 UTC. Fin de semana sin velas: los resets se emiten
 *   igual, valorados al ultimo precio del viernes, sin velas inventadas.
 *   Dias de trading = dias de Praga con alguna APERTURA (abrir el lunes y
 *   cerrar el martes cuenta el lunes; abrir a las 23:30 UTC del lunes cuenta
 *   el martes de Praga).
 *   Objetivo: saldo 110.000 con la posicion aun abierta → no hay fase
 *   superada; al cerrarla, con 4 dias → «fase_superada» una vez; con 3 dias, no;
 *   cerrar lo que da 110.000 dejando un 0,01 abierto → no; al cerrar el 0,01 → si.
 *   Paso, salto y reanudacion (serializando) → mismo veredicto y eventos.
 */
import { titulo, ver, oraculo, fin, importa } from '../lib.mjs'
const M = await importa('lib/motor/motor.mjs')
let RT = null
try { RT = await importa('lib/motor/reto.mjs') } catch { RT = null }
const U = iso => Date.parse(iso) / 1000
const µ = usd => BigInt(Math.round(usd * 100)) * 10_000n   // USD con centimos → µUSD
const cero = Object.freeze({ version: 'prueba:EURUSD:0:0', spread_pips: Object.freeze({ EURUSD: 0 }), comision_lote_µ: 0n, swap_µ: 0n })
// velas sueltas: [iso, precio]
const vs = filas => M.velas('EURUSD', filas.map(([iso, p]) => ({ time: U(iso), open: p, high: p, low: p, close: p })))
const enTexto = x => JSON.stringify(x, (k, v) => (typeof v === 'bigint' ? `${v}n` : v))

// un guion: [['avanza', iso] | ['abrir', lado, lotes] | ['cerrar', id]]; devuelve { reto, eventos }
function corre(velas, inicioIso, guion, { fase = 1, partir = null } = {}) {
  let r = RT.creaReto({ motor: M.crea({ par: 'EURUSD', costes: cero, capital: '100000' }), fase, inicio: U(inicioIso) })
  const ev = []
  for (const paso of guion) {
    if (paso[0] === 'avanza') {
      const cortes = partir ? partir(r.motor.reloj.cursor ?? U(inicioIso), U(paso[1])) : [U(paso[1])]
      for (const h of cortes) {
        const x = RT.avanzaReto(RT.deserializaReto(RT.serializaReto(r)), h, velas)
        r = x.reto; ev.push(...x.eventos)
      }
    } else {
      const c = paso[0] === 'abrir' ? { tipo: 'abrir', lado: paso[1], orden: 'mercado', lotes: paso[2], cotizadoEn: r.motor.reloj.cursor } : { tipo: 'cerrar', id: paso[1] }
      const x = RT.aplicaReto(r, c)
      r = x.reto; ev.push(...x.eventos)
    }
  }
  return { reto: r, eventos: ev }
}
const de = (ev, tipo) => ev.filter(x => x.tipo === tipo)

titulo('0 · las reglas, versionadas y citadas')
const R0 = RT?.FTMO_2STEP
oraculo('RETO', 'ftmo-2step@2026-10-05: 10 % / 5 %, diaria 5 %, maxima 10 %, 4 dias, Europe/Prague, con las citas de la pagina oficial (§ 5)', !!R0 && R0.version === 'ftmo-2step@2026-10-05' && R0.objetivo[1] === 10 && R0.objetivo[2] === 5 && R0.perdida_diaria === 5 && R0.perdida_maxima === 10 && R0.dias_minimos === 4 && R0.zona === 'Europe/Prague' && /ftmo\.com\/en\/trading-objectives/.test(R0.fuente) && Object.isFrozen(R0) && Object.keys(R0.citas || {}).length >= 4, R0 ? enTexto({ v: R0.version, citas: Object.keys(R0.citas || {}) }) : 'sin modulo')

// calendario propio (regla UE: ultimo domingo de marzo y de octubre a la 01:00 UTC) contra Intl (tzdata del runtime), 2020-2035: control positivo
let difs = 0, n = 0
if (RT) { const f = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Prague', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  for (let t = U('2020-01-01T12:00:00Z'); t < U('2036-01-01T00:00:00Z'); t += 86400) { const m = RT.medianocheSiguiente(t); n++; const p = f.format(new Date(m * 1000)); const q = f.format(new Date((m - 60) * 1000)); if (!/ 00:00$/.test(p) || !/ 23:59$/.test(q) || m <= t || m - t > 86400 + 3600) difs++ } }
oraculo('RETO', 'medianocheSiguiente (regla UE escrita en el modulo) = Intl Europe/Prague en 5.844 dias de 2020 a 2035', !!RT && n === 5844 && difs === 0, `${n} dias · ${difs} distintos`)

titulo('1 · A13: el suelo diario pasa a 98.000 a medianoche, sin vela')
// martes 10-feb-2026: 08:00 UTC abre BUY 1 a 1,10000; 09:00 cierra en 1,13000 (+3.000) y abre otro a 1,13000; 22:59 UTC (23:59 Praga) en X
const dia13 = (x, extra = []) => vs([['2026-02-10T08:00:00Z', '1.10000'], ['2026-02-10T09:00:00Z', '1.13000'], ...extra, ['2026-02-10T22:59:00Z', x], ['2026-02-11T08:00:00Z', x]])
const guion13 = (extra = []) => [['avanza', '2026-02-10T08:00:00Z'], ['abrir', 'BUY', '1'], ['avanza', '2026-02-10T09:00:00Z'], ['cerrar', 'p1'], ['abrir', 'BUY', '1'], ...extra, ['avanza', '2026-02-11T09:00:00Z']]
const a13 = RT ? corre(dia13('1.07000'), '2026-02-10T07:00:00Z', guion13()) : null
const reset13 = a13 && de(a13.eventos, 'reset_diario')[0]
oraculo('A13', 'reset_diario a las 23:00 UTC (00:00 de Praga) con saldo de medianoche 103.000 y suelo 98.000', !!reset13 && reset13.en.t === U('2026-02-10T23:00:00Z') && reset13.saldo_medianoche_µ === µ(103000) && reset13.limite_diario_µ === µ(98000), enTexto(reset13))
const br13 = a13 && de(a13.eventos, 'breach')[0]
oraculo('A13', 'equity 97.000 < 98.000: breach «perdida_diaria» EN el reset (sin vela nueva), al ultimo precio, y el reto queda en breach con el punto guardado', !!br13 && br13.regla === 'perdida_diaria' && br13.equity_µ === µ(97000) && br13.en.t === U('2026-02-10T23:00:00Z') && M.precioTexto('EURUSD', br13.precio) === '1.07000' && a13.reto.estado === 'breach' && a13.reto.breach?.en?.t === U('2026-02-10T23:00:00Z'), enTexto(br13))
oraculo('A13', 'irreversible: despues del breach ninguna vela ni reset mas', !!a13 && de(a13.eventos, 'reset_diario').length === 1 && a13.reto.motor.reloj.cursor === U('2026-02-10T22:59:00Z'), `${a13 ? de(a13.eventos, 'reset_diario').length : '-'} resets · cursor ${a13?.reto.motor.reloj.cursor}`)
const igual13 = RT ? corre(dia13('1.08000'), '2026-02-10T07:00:00Z', guion13()) : null
oraculo('A13', 'suelo exacto: equity 98.000,000000 = suelo → no infringe', !!igual13 && de(igual13.eventos, 'breach').length === 0 && igual13.reto.estado === 'en_curso' && de(igual13.eventos, 'reset_diario')[0]?.equity_µ === µ(98000), enTexto(de(igual13?.eventos ?? [], 'reset_diario')[0]))
const centimo = RT ? corre(dia13('1.08000', [['2026-02-10T22:58:00Z', '1.08001']]), '2026-02-10T07:00:00Z', [...guion13().slice(0, 5), ['avanza', '2026-02-10T22:58:00Z'], ['abrir', 'BUY', '0.01'], ['avanza', '2026-02-11T09:00:00Z']]) : null
oraculo('A13', 'un centimo por debajo (97.999,99): breach', !!centimo && de(centimo.eventos, 'breach')[0]?.equity_µ === µ(97999.99) && centimo.reto.estado === 'breach', enTexto(de(centimo?.eventos ?? [], 'breach')[0]))

titulo('1b · la perdida maxima es estatica (90 % del capital inicial)')
// mie 11: −4.000 cerrados; jue 12: −4.000 cerrados; vie 13: BUY 1 + BUY 0,01 hasta −2.000,01 → equity 89.999,99
const vmax = vs([['2026-02-11T08:00:00Z', '1.10000'], ['2026-02-11T09:00:00Z', '1.06000'], ['2026-02-12T08:00:00Z', '1.10000'], ['2026-02-12T09:00:00Z', '1.06000'], ['2026-02-13T08:00:00Z', '1.10000'], ['2026-02-13T09:00:00Z', '1.08001'], ['2026-02-13T10:00:00Z', '1.08000']])
const amax = RT ? corre(vmax, '2026-02-11T07:00:00Z', [['avanza', '2026-02-11T08:00:00Z'], ['abrir', 'BUY', '1'], ['avanza', '2026-02-11T09:00:00Z'], ['cerrar', 'p1'], ['avanza', '2026-02-12T08:00:00Z'], ['abrir', 'BUY', '1'], ['avanza', '2026-02-12T09:00:00Z'], ['cerrar', 'p2'], ['avanza', '2026-02-13T08:00:00Z'], ['abrir', 'BUY', '1'], ['avanza', '2026-02-13T09:00:00Z'], ['abrir', 'BUY', '0.01'], ['avanza', '2026-02-13T10:00:00Z']]) : null
const brmax = amax && de(amax.eventos, 'breach')[0]
oraculo('RETO', 'tercer dia: suelo diario 87.000 (92.000 − 5.000) pero el total sigue en 90.000: breach «perdida_maxima» con 89.999,99', !!brmax && brmax.regla === 'perdida_maxima' && brmax.equity_µ === µ(89999.99) && brmax.limite_µ === µ(90000) && de(amax.eventos, 'reset_diario').at(-1)?.limite_diario_µ === µ(87000), enTexto(brmax))

titulo('2 · A14: medianoches de Praga con cambio de hora y fin de semana sin velas')
// marzo: viernes 27 abre BUY 1 a 1,10000 (20:00 UTC), ultima vela del viernes 20:59 en 1,10500; domingo 29 abre a las 21:00 UTC
const vmar = vs([['2026-03-27T20:00:00Z', '1.10000'], ['2026-03-27T20:59:00Z', '1.10500'], ['2026-03-29T21:00:00Z', '1.10600'], ['2026-03-30T01:00:00Z', '1.10600']])
const amar = RT ? corre(vmar, '2026-03-27T19:00:00Z', [['avanza', '2026-03-27T20:00:00Z'], ['abrir', 'BUY', '1'], ['avanza', '2026-03-30T01:00:00Z']]) : null
const rmar = amar ? de(amar.eventos, 'reset_diario') : []
oraculo('A14', 'marzo: resets a las 23:00 UTC del 27 y del 28 (CET) y a las 22:00 UTC del 29 (CEST)', JSON.stringify(rmar.map(x => x.en.t)) === JSON.stringify([U('2026-03-27T23:00:00Z'), U('2026-03-28T23:00:00Z'), U('2026-03-29T22:00:00Z')]), rmar.map(x => new Date(x.en.t * 1000).toISOString()).join(' '))
oraculo('A14', 'fin de semana: los resets del sabado y del domingo valoran al ultimo precio del viernes (equity 100.500) y no hay velas inventadas', rmar.length === 3 && rmar[0].equity_µ === µ(100500) && rmar[1].equity_µ === µ(100500) && !amar.eventos.some(x => x.tipo === 'vela') && amar.reto.motor.reloj.cursor === U('2026-03-30T01:00:00Z'), rmar.map(x => enTexto(x.equity_µ)).join(' '))
const voct = vs([['2026-10-23T20:00:00Z', '1.10000'], ['2026-10-26T08:00:00Z', '1.10000']])
const aoct = RT ? corre(voct, '2026-10-23T19:00:00Z', [['avanza', '2026-10-26T08:00:00Z']]) : null
const roct = aoct ? de(aoct.eventos, 'reset_diario').map(x => x.en.t) : []
oraculo('A14', 'octubre: 22:00 UTC del 23 y del 24 (CEST) y 23:00 UTC del 25 (CET)', JSON.stringify(roct) === JSON.stringify([U('2026-10-23T22:00:00Z'), U('2026-10-24T22:00:00Z'), U('2026-10-25T23:00:00Z')]), roct.map(t => new Date(t * 1000).toISOString()).join(' '))
// dias de trading por aperturas: abre el lunes 9 (10:00 UTC) y cierra el martes 10; abre a las 23:30 UTC del martes 10 (= miercoles 11 en Praga)
const vdias = vs([['2026-02-09T10:00:00Z', '1.10000'], ['2026-02-10T10:00:00Z', '1.10000'], ['2026-02-10T23:30:00Z', '1.10000'], ['2026-02-11T10:00:00Z', '1.10000']])
const adias = RT ? corre(vdias, '2026-02-09T09:00:00Z', [['avanza', '2026-02-09T10:00:00Z'], ['abrir', 'BUY', '0.01'], ['avanza', '2026-02-10T10:00:00Z'], ['cerrar', 'p1'], ['avanza', '2026-02-10T23:30:00Z'], ['abrir', 'BUY', '0.01'], ['avanza', '2026-02-11T10:00:00Z']]) : null
oraculo('A14', 'dias de trading por aperturas en hora de Praga: lunes 9 y miercoles 11 (no el martes del cierre)', !!adias && JSON.stringify(adias.reto.dias_con_apertura) === '["2026-02-09","2026-02-11"]', enTexto(adias?.reto.dias_con_apertura))

titulo('3 · objetivo de fase: saldo cerrado, sin posiciones, 4 dias')
// lun 9 – jue 12: un 0,01 abierto y cerrado al mismo precio cada dia; el jueves BUY 1 de 1,10000 a 1,20000 (+10.000)
const diasOk = ['2026-02-09', '2026-02-10', '2026-02-11', '2026-02-12']
const vobj = n => vs([...diasOk.slice(0, n).flatMap(d => [[`${d}T08:00:00Z`, '1.10000'], [`${d}T09:00:00Z`, '1.10000']]), [`${diasOk[n - 1]}T10:00:00Z`, '1.20000'], [`${diasOk[n - 1]}T11:00:00Z`, '1.20000']])
const gobj = (n, cerrarFinal) => {
  const g = []; let id = 1
  for (const d of diasOk.slice(0, n)) { g.push(['avanza', `${d}T08:00:00Z`], ['abrir', 'BUY', '0.01'], ['avanza', `${d}T09:00:00Z`], ['cerrar', `p${id}`]); id++ }
  g.push(['abrir', 'BUY', '1'], ['avanza', `${diasOk[n - 1]}T10:00:00Z`])
  if (cerrarFinal) g.push(['cerrar', `p${id}`], ['avanza', `${diasOk[n - 1]}T11:00:00Z`])
  return g
}
const abierta = RT ? corre(vobj(4), '2026-02-09T07:00:00Z', gobj(4, false)) : null
oraculo('RETO', 'equity 110.000 con la posicion abierta: el objetivo NO se concede', !!abierta && abierta.reto.estado === 'en_curso' && de(abierta.eventos, 'fase_superada').length === 0, abierta ? `${abierta.reto.estado} · ${abierta.reto.dias_con_apertura.length} dias` : '')
const cerrada = RT ? corre(vobj(4), '2026-02-09T07:00:00Z', gobj(4, true)) : null
oraculo('RETO', 'al cerrarla (saldo 110.000) con 4 dias de aperturas: «fase_superada» una vez', !!cerrada && cerrada.reto.estado === 'superada' && de(cerrada.eventos, 'fase_superada').length === 1 && cerrada.reto.motor.saldo_µ === µ(110000), cerrada ? `${cerrada.reto.estado} · ${de(cerrada.eventos, 'fase_superada').length}` : '')
// el objetivo CERRADO con otra posicion aun abierta: dia 4, BUY 1 y BUY 0,01 a 1,10000; a 1,20000 se cierra el lote (saldo 110.000) y queda el 0,01
const gdos = () => { const g = gobj(4, false); g.pop(); g.push(['abrir', 'BUY', '0.01'], ['avanza', '2026-02-12T10:00:00Z'], ['cerrar', 'p5']); return g }
const dos = RT ? corre(vobj(4), '2026-02-09T07:00:00Z', gdos()) : null
oraculo('RETO', 'saldo cerrado 110.000 con un 0,01 aun abierto: no se concede', !!dos && dos.reto.motor.saldo_µ === µ(110000) && dos.reto.motor.posiciones.length === 1 && dos.reto.estado === 'en_curso' && de(dos.eventos, 'fase_superada').length === 0, dos ? `${dos.reto.estado} · saldo ${enTexto(dos.reto.motor.saldo_µ)} · ${dos.reto.motor.posiciones.length} abiertas` : '')
const dosFin = RT ? corre(vobj(4), '2026-02-09T07:00:00Z', [...gdos(), ['cerrar', 'p6']]) : null
oraculo('RETO', 'al cerrar el 0,01 (+100 → 110.100): se concede en ese cierre', !!dosFin && dosFin.reto.estado === 'superada' && de(dosFin.eventos, 'fase_superada')[0]?.saldo_µ === µ(110100), dosFin ? enTexto(de(dosFin.eventos, 'fase_superada')[0]) : '')
const tres = RT ? corre(vobj(3), '2026-02-09T07:00:00Z', gobj(3, true)) : null
oraculo('RETO', 'con 3 dias de aperturas y saldo 110.000: no se concede', !!tres && tres.reto.estado === 'en_curso' && de(tres.eventos, 'fase_superada').length === 0, tres ? `${tres.reto.dias_con_apertura.length} dias` : '')

// una orden cuya hora (cursor + 60) cae antes de un reset ya emitido iria hacia atras en el tiempo: se rechaza
if (RT) {
  const x = corre(vmar, '2026-03-27T19:00:00Z', [['avanza', '2026-03-27T20:00:00Z'], ['avanza', '2026-03-29T12:00:00Z']])
  const r = RT.aplicaReto(x.reto, { tipo: 'abrir', lado: 'BUY', orden: 'mercado', lotes: '1', cotizadoEn: x.reto.motor.reloj.cursor })
  oraculo('A14', 'domingo 12:00 UTC con el cursor en el viernes: abrir se rechaza («reset_posterior»), sin fill ni dia contado', r.resultado?.rechazado === 'reset_posterior' && r.eventos.length === 0 && r.reto.dias_con_apertura.length === 0, enTexto(r.resultado))
} else oraculo('A14', 'domingo 12:00 UTC con el cursor en el viernes: abrir se rechaza («reset_posterior»), sin fill ni dia contado', false, 'sin modulo')

titulo('4 · paso, salto y reanudacion dan lo mismo')
const porMinuto = (a, b) => { const o = []; for (let t = a + 60; t <= b; t += 60) o.push(t); return o.length ? o : [b] }
const porHora = (a, b) => { const o = []; for (let t = a + 3600; t < b; t += 3600) o.push(t); o.push(b); return o }
const mismo = (x, y) => !!x && !!y && enTexto(x.eventos) === enTexto(y.eventos) && RT.serializaReto(x.reto) === RT.serializaReto(y.reto)
const a13m = RT ? corre(dia13('1.07000'), '2026-02-10T07:00:00Z', guion13(), { partir: porMinuto }) : null
oraculo('RETO', 'A13 paso a paso (cada minuto, serializando) = de un salto', mismo(a13, a13m))
const amarH = RT ? corre(vmar, '2026-03-27T19:00:00Z', [['avanza', '2026-03-27T20:00:00Z'], ['abrir', 'BUY', '1'], ['avanza', '2026-03-30T01:00:00Z']], { partir: porHora }) : null
oraculo('RETO', 'marzo por horas (cruzando las tres medianoches) = de un salto', mismo(amar, amarH))
const cerradaH = RT ? corre(vobj(4), '2026-02-09T07:00:00Z', gobj(4, true), { partir: porHora }) : null
oraculo('RETO', 'el objetivo por horas = de un salto (mismo veredicto y eventos)', mismo(cerrada, cerradaH))
fin()
