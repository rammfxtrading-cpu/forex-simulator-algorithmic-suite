/**
 * MOTOR · PIEZA 4: EL MANIFIESTO DEL MERCADO (especificacion v2.1, § 7.3,
 * § 12.10; A26). Escrito ANTES que el codigo.
 *
 * Un manifiesto por par y version: la lista de sus trozos diarios (binario de
 * la pieza 3) con su sha256, velas, primera y ultima vela y availableAt (ultima
 * + 60), los dias marcados como cerrados (festivos: el manifiesto es la unica
 * fuente, CTO 5-oct) y su propia huella. La sesion fija la huella; un trozo
 * cuyo sha no coincide, o una cobertura insuficiente, paran el avance.
 * ORACULOS: construccion y orden; huella estable y distinta si cambia un
 * trozo; trozo alterado → error; manifiesto incoherente (dia de cabecera,
 * duplicado, desordenado, digitos de otro par) → error; cobertura: dias con
 * mercado sin trozo o cortos, sin el sabado ni los cerrados; A26: la version
 * fijada no cambia aunque se publique otra. C6-04: el 25-dic y el 1-ene no
 * tienen excepcion propia: cortos y sin declarar, falta; declarados, cerrados.
 * ETAPA 2 (diseño sim-004, p.2–p.3; CTO 13-oct): manifiesto@2. Sin lista de
 * huecos propia (van en el trozo y se comprueban contra las velas), con los
 * dias cortos aceptados dentro, el ancla del fichero de aceptaciones, la
 * huella del anterior y la regla de continuacion (solo añadir; lo demas,
 * incidente).
 */
import { titulo, oraculo, fin, importa } from '../lib.mjs'
const MF = await importa('lib/motor/manifiesto.mjs')
const B = await importa('lib/motor/binario.mjs')
const M = await importa('lib/motor/motor.mjs')
const lanza = f => { try { f(); return false } catch { return true } }
const S = d => Date.parse(d + 'T00:00:00Z') / 1000
const dia = (par, d, n, px = '1.10000') => {
  const filas = Array.from({ length: n }, (_, i) => ({ time: S(d) + 60 * i, open: px, high: px, low: px, close: px }))
  const velas = n ? M.velas(par, filas).map(v => ({ ...v, volume: 1 })) : []
  return { dia: d, buffer: B.codifica(par, S(d), velas) }
}
const LUN = dia('EURUSD', '2026-03-02', 1440), MAR = dia('EURUSD', '2026-03-03', 1440)

titulo('1 · construccion')
const m1 = MF.creaManifiesto({ par: 'EURUSD', version: 'v1', trozos: [MAR, LUN] })
oraculo('MAN', 'dias ordenados, con sha256 del trozo, velas, primera, ultima y availableAt = ultima + 60', m1.dias.map(d => d.dia).join() === '2026-03-02,2026-03-03' && m1.dias[0].sha256 === B.huella(LUN.buffer) && m1.dias[0].velas === 1440 && m1.dias[0].primera === S('2026-03-02') && m1.dias[0].ultima === S('2026-03-02') + 1439 * 60 && m1.dias[0].availableAt === S('2026-03-03'), JSON.stringify(m1.dias[0]))
oraculo('MAN', 'nombre del trozo con su hash; esquema, par, version y digitos', m1.dias[0].nombre === `2026-03-02.${m1.dias[0].sha256}.bin` && m1.esquema === 'mercado-manifiesto@2' && m1.anterior === null && m1.aceptaciones === null && JSON.stringify(m1.cortos_aceptados) === '[]' && m1.par === 'EURUSD' && m1.version === 'v1' && m1.digitos === 5)
const m1b = MF.creaManifiesto({ par: 'EURUSD', version: 'v1', trozos: [LUN, MAR] })
const m2 = MF.creaManifiesto({ par: 'EURUSD', version: 'v2', trozos: [LUN, dia('EURUSD', '2026-03-03', 1440, '1.10010')] })
oraculo('MAN', 'huella estable (mismo contenido, otro orden de entrada) y distinta si cambia un trozo', m1.huella === m1b.huella && m1.huella !== m2.huella && /^[0-9a-f]{64}$/.test(m1.huella))
oraculo('MAN', 'validaManifiesto acepta el bueno y rechaza uno retocado (velas cambiadas sin rehacer la huella)', MF.validaManifiesto(m1) === true && lanza(() => MF.validaManifiesto({ ...m1, dias: m1.dias.map((d, i) => i ? d : { ...d, velas: 1439 }) })))

titulo('2 · leer un trozo')
oraculo('MAN', 'el trozo correcto se lee (1.440 velas del 2-mar)', MF.leeTrozo(m1, '2026-03-02', LUN.buffer).velas.length === 1440)
const alterado = Buffer.from(LUN.buffer); alterado[30] ^= 1
oraculo('MAN', 'un trozo alterado (un bit) o de otro dia → error, no se lee', lanza(() => MF.leeTrozo(m1, '2026-03-02', alterado)) && lanza(() => MF.leeTrozo(m1, '2026-03-02', MAR.buffer)) && lanza(() => MF.leeTrozo(m1, '2026-03-04', LUN.buffer)))

titulo('3 · manifiestos incoherentes')
oraculo('MAN', 'rechaza: cabecera de otro dia, dia duplicado y trozo de otro par (USDJPY en EURUSD)',
  lanza(() => MF.creaManifiesto({ par: 'EURUSD', version: 'v1', trozos: [{ dia: '2026-03-04', buffer: LUN.buffer }] }))
  && lanza(() => MF.creaManifiesto({ par: 'EURUSD', version: 'v1', trozos: [LUN, LUN] }))
  && lanza(() => MF.creaManifiesto({ par: 'EURUSD', version: 'v1', trozos: [dia('USDJPY', '2026-03-02', 10, '150.000')] })))

titulo('4 · cobertura (horario v2.1; festivos solo si el manifiesto los marca)')
// semana del lunes 2 al domingo 8 de marzo: hay trozos del 2 y el 3 (completos),
// el 4 corto (600), nada del 5 ni del 6; el 6 marcado cerrado; el 7 es sabado
const m3 = MF.creaManifiesto({ par: 'EURUSD', version: 'v1', trozos: [LUN, MAR, dia('EURUSD', '2026-03-04', 600)], cerrados: ['2026-03-06'] })
const falta = MF.cobertura(m3, '2026-03-02', '2026-03-07')
oraculo('MAN', 'faltan o estan cortos el 4 (600/1200) y el 5 (sin trozo); no el 6 (cerrado) ni el 7 (sabado)', JSON.stringify(falta) === JSON.stringify(['2026-03-04 (600/1200)', '2026-03-05 (sin trozo)']), JSON.stringify(falta))

titulo('4b · C6-04 (Astra, cierres-6): sin tabla de festivos; solo decide el manifiesto (§ 12.10)')
// 25-dic-2026 y 1-ene-2027 (viernes, umbral 1.000): un trozo de UNA vela a las 00:00
for (const d of ['2026-12-25', '2027-01-01']) {
  const uno = dia('EURUSD', d, 1)
  const sin = MF.creaManifiesto({ par: 'EURUSD', version: 'v1', trozos: [uno] })
  const con = MF.creaManifiesto({ par: 'EURUSD', version: 'v1', trozos: [uno], cerrados: [d] })
  oraculo('MAN', `C6-04: ${d} con 1 vela y SIN declararlo cerrado: falta cobertura (1/1000)`, JSON.stringify(MF.cobertura(sin, d, d)) === JSON.stringify([`${d} (1/1000)`]), JSON.stringify(MF.cobertura(sin, d, d)))
  oraculo('MAN', `C6-04: ${d} declarado cerrado en el manifiesto: sin falta`, JSON.stringify(MF.cobertura(con, d, d)) === '[]', JSON.stringify(MF.cobertura(con, d, d)))
  const corto = MF.creaManifiesto({ par: 'EURUSD', version: 'v1', trozos: [uno], cortosAceptados: [{ dia: d, velas: 1, motivo: 'mercado reducido' }] })
  oraculo('MAN', `p.2: ${d} declarado corto aceptado (1 vela) en el manifiesto: sin falta`, JSON.stringify(MF.cobertura(corto, d, d)) === '[]', JSON.stringify(MF.cobertura(corto, d, d)))
}

titulo('6 · manifiesto@2: los huecos van en el trozo y se comprueban contra las velas (p.1, p.2)')
// martes 3: sin velas de 10:01 a 10:20 (20 minutos); lunes 2 y miercoles 4 completos
const conHueco = (d, desde, n, huecos = [], px = '1.10000') => {
  const filas = []
  for (let i = 0; i < 1440; i++) if (!(i >= desde && i < desde + n)) filas.push({ time: S(d) + 60 * i, open: px, high: px, low: px, close: px })
  return { dia: d, buffer: B.codifica('EURUSD', S(d), M.velas('EURUSD', filas).map(v => ({ ...v, volume: 1 })), huecos) }
}
const MIE = dia('EURUSD', '2026-03-04', 1440)
const H20 = { inicio: '2026-03-03T10:01Z', minutos: 20, motivo: 'corte_del_proveedor' }
const mH = MF.creaManifiesto({ par: 'EURUSD', version: 'v1', trozos: [LUN, conHueco('2026-03-03', 601, 20, [H20]), MIE] })
oraculo('MAN2', 'un hueco real en su trozo: el manifiesto se crea y leeTrozo lo devuelve', JSON.stringify(MF.leeTrozo(mH, '2026-03-03', conHueco('2026-03-03', 601, 20, [H20]).buffer).huecos) === JSON.stringify([H20]))
oraculo('MAN2', 'un hueco del trozo que no existe asi en las velas (10:02, 16 min, dentro del de 20): no se crea',
  lanza(() => MF.creaManifiesto({ par: 'EURUSD', version: 'v1', trozos: [LUN, conHueco('2026-03-03', 601, 20, [{ ...H20, inicio: '2026-03-03T10:02Z', minutos: 16 }]), MIE] })))
oraculo('MAN2', 'un hueco de 16 al principio del de 20 (10:01, 16 min, sin tapar velas): no se crea',
  lanza(() => MF.creaManifiesto({ par: 'EURUSD', version: 'v1', trozos: [LUN, conHueco('2026-03-03', 601, 20, [{ ...H20, minutos: 16 }]), MIE] })))
// el hueco tras la ultima vela del ULTIMO dia no se puede comprobar todavia (falta la vela siguiente): se admite
const ultimo = conHueco('2026-03-04', 1400, 40, [{ inicio: '2026-03-04T23:20Z', minutos: 60, motivo: 'corte_del_proveedor' }])
oraculo('MAN2', 'el hueco que empieza tras la ultima vela del ultimo dia (pendiente de la vela siguiente): se admite', !lanza(() => MF.creaManifiesto({ par: 'EURUSD', version: 'v1', trozos: [LUN, ultimo] })))
oraculo('MAN2', 'el mismo trozo en medio (con el jueves detras, que empieza a las 00:00): el hueco real es de 40, no de 60: no se crea', lanza(() => MF.creaManifiesto({ par: 'EURUSD', version: 'v1', trozos: [LUN, ultimo, dia('EURUSD', '2026-03-05', 1440)] })))
oraculo('MAN2', 'pasar huecosAceptados aparte (formato @1): se rechaza', lanza(() => MF.creaManifiesto({ par: 'EURUSD', version: 'v1', trozos: [LUN], huecosAceptados: [] })))
const sinH = MF.creaManifiesto({ par: 'EURUSD', version: 'v1', trozos: [LUN, conHueco('2026-03-03', 601, 20), MIE] })
oraculo('MAN2', 'el mismo dia con y sin el hueco aceptado: otro sha del trozo y otra huella del manifiesto', sinH.dias[1].sha256 !== mH.dias[1].sha256 && sinH.huella !== mH.huella)

titulo('7 · manifiesto@2: dias cortos aceptados, ancla de aceptaciones y validacion')
const C4 = dia('EURUSD', '2026-03-04', 600)
const mC = MF.creaManifiesto({ par: 'EURUSD', version: 'v1', trozos: [LUN, MAR, C4], cortosAceptados: [{ dia: '2026-03-04', velas: 600, motivo: 'prueba' }] })
oraculo('MAN2', 'cortos_aceptados en el manifiesto: el 4 (600/600) no falta; sin declararlo, falta', JSON.stringify(MF.cobertura(mC, '2026-03-02', '2026-03-04')) === '[]' && MF.cobertura(MF.creaManifiesto({ par: 'EURUSD', version: 'v1', trozos: [LUN, MAR, C4] }), '2026-03-04', '2026-03-04').length === 1)
oraculo('MAN2', 'cortos_aceptados: rechaza mas velas minimas que las del trozo, un dia sin trozo, un motivo vacio y un dia repetido',
  lanza(() => MF.creaManifiesto({ par: 'EURUSD', version: 'v1', trozos: [LUN, MAR, C4], cortosAceptados: [{ dia: '2026-03-04', velas: 601, motivo: 'x' }] }))
  && lanza(() => MF.creaManifiesto({ par: 'EURUSD', version: 'v1', trozos: [LUN, MAR, C4], cortosAceptados: [{ dia: '2026-03-05', velas: 1, motivo: 'x' }] }))
  && lanza(() => MF.creaManifiesto({ par: 'EURUSD', version: 'v1', trozos: [LUN, MAR, C4], cortosAceptados: [{ dia: '2026-03-04', velas: 600, motivo: ' ' }] }))
  && lanza(() => MF.creaManifiesto({ par: 'EURUSD', version: 'v1', trozos: [LUN, MAR, C4], cortosAceptados: [{ dia: '2026-03-04', velas: 600, motivo: 'x' }, { dia: '2026-03-04', velas: 600, motivo: 'x' }] })))
const ancla = { lineas: 3, sha256: 'a'.repeat(64) }
const mA = MF.creaManifiesto({ par: 'EURUSD', version: 'v1', trozos: [LUN, MAR], aceptaciones: ancla })
oraculo('MAN2', 'el ancla de aceptaciones se guarda y entra en la huella', JSON.stringify(mA.aceptaciones) === JSON.stringify(ancla) && mA.huella !== m1.huella && lanza(() => MF.creaManifiesto({ par: 'EURUSD', version: 'v1', trozos: [LUN], aceptaciones: { lineas: -1, sha256: 'a'.repeat(64) } })) && lanza(() => MF.creaManifiesto({ par: 'EURUSD', version: 'v1', trozos: [LUN], aceptaciones: { lineas: 1, sha256: 'x' } })))
oraculo('MAN2', 'validaManifiesto: rechaza el esquema @1, una lista huecos_aceptados y cortos retocados sin rehacer la huella',
  lanza(() => MF.validaManifiesto({ ...m1, esquema: 'mercado-manifiesto@1' })) && lanza(() => MF.validaManifiesto({ ...m1, huecos_aceptados: [] })) && lanza(() => MF.validaManifiesto({ ...mC, cortos_aceptados: [] })) && MF.validaManifiesto(mC) === true)
oraculo('MAN2', 'huellaDe(m) = la huella de su contenido canonico', MF.huellaDe(mC) === mC.huella && MF.huellaDe({ ...mC, version: 'otra' }) !== mC.huella)

titulo('8 · continuacion: solo añadir; lo demas es incidente (h, nota 2; S4-03; p.3)')
const JUE = dia('EURUSD', '2026-03-05', 1440)
const v1 = MF.creaManifiesto({ par: 'EURUSD', version: 'v1.1', trozos: [LUN, MAR], aceptaciones: { lineas: 2, sha256: 'b'.repeat(64) } })
const v2 = MF.creaManifiesto({ par: 'EURUSD', version: 'v1.2', trozos: [LUN, MAR, MIE, JUE], anterior: v1, aceptaciones: { lineas: 4, sha256: 'c'.repeat(64) } })
oraculo('CONT', 'añadir dias despues de la frontera: es continuacion, con anterior = huella de la previa', MF.esContinuacion(v1, v2) === null && v2.anterior === v1.huella, MF.esContinuacion(v1, v2))
oraculo('CONT', 'una cadena: v1 → v2 → v3 es continuacion eslabon a eslabon y v1 → v3 tambien (prefijo)', (() => { const v3 = MF.creaManifiesto({ par: 'EURUSD', version: 'v1.3', trozos: [LUN, MAR, MIE, JUE, dia('EURUSD', '2026-03-06', 1440)], anterior: v2, aceptaciones: v2.aceptaciones }); return MF.esContinuacion(v2, v3) === null && MF.esContinuacion(v1, v3) === null })())
const sinAnterior = (o = {}) => MF.creaManifiesto({ par: 'EURUSD', version: 'v1.2', trozos: [LUN, MAR, MIE], aceptaciones: v1.aceptaciones, ...o })
const casos = [
  ['un dia ya publicado cambia (otro trozo del martes)', MF.creaManifiesto({ par: 'EURUSD', version: 'v1.2', trozos: [LUN, dia('EURUSD', '2026-03-03', 1440, '1.10010'), MIE], aceptaciones: v1.aceptaciones })],
  ['un dia ya publicado desaparece', MF.creaManifiesto({ par: 'EURUSD', version: 'v1.2', trozos: [LUN, MIE], aceptaciones: v1.aceptaciones })],
  ['otro par', MF.creaManifiesto({ par: 'GBPUSD', version: 'v1.2', trozos: [], aceptaciones: v1.aceptaciones })],
  ['un cerrado nuevo antes de la frontera', sinAnterior({ cerrados: ['2026-03-02'] })],
  ['un corto aceptado nuevo antes de la frontera', MF.creaManifiesto({ par: 'EURUSD', version: 'v1.2', trozos: [LUN, MAR, MIE], cortosAceptados: [{ dia: '2026-03-03', velas: 1440, motivo: 'x' }], aceptaciones: v1.aceptaciones })],
  ['menos lineas de aceptaciones que la previa', MF.creaManifiesto({ par: 'EURUSD', version: 'v1.2', trozos: [LUN, MAR, MIE], aceptaciones: { lineas: 1, sha256: 'b'.repeat(64) } })],
  ['sin ancla de aceptaciones habiendola en la previa', MF.creaManifiesto({ par: 'EURUSD', version: 'v1.2', trozos: [LUN, MAR, MIE] })],
]
for (const [que, nuevo] of casos) oraculo('CONT', `incidente: ${que}`, typeof MF.esContinuacion(v1, nuevo) === 'string', String(MF.esContinuacion(v1, nuevo)))
// adicion INTERIOR: la previa tiene lunes y miercoles (sin martes); la nueva añade el martes
const hueca = MF.creaManifiesto({ par: 'EURUSD', version: 'v1.1', trozos: [LUN, MIE] })
oraculo('CONT', 'incidente: una adicion interior (el martes, antes de la frontera del miercoles)', typeof MF.esContinuacion(hueca, MF.creaManifiesto({ par: 'EURUSD', version: 'v1.2', trozos: [LUN, MAR, MIE, JUE] })) === 'string')
oraculo('CONT', 'un cerrado o un corto aceptado DESPUES de la frontera: continuacion valida', MF.esContinuacion(v1, MF.creaManifiesto({ par: 'EURUSD', version: 'v1.2', trozos: [LUN, MAR, C4], cerrados: ['2026-03-06'], cortosAceptados: [{ dia: '2026-03-04', velas: 600, motivo: 'x' }], aceptaciones: v1.aceptaciones })) === null)
oraculo('CONT', 'anterior: creaManifiesto con una previa de la que no es continuacion: no se crea; anterior ajeno en esContinuacion: incidente',
  lanza(() => MF.creaManifiesto({ par: 'EURUSD', version: 'v1.2', trozos: [LUN, MIE], anterior: v1, aceptaciones: v1.aceptaciones }))
  && typeof MF.esContinuacion(hueca, v2) === 'string')

titulo('5 · A26: la version fijada no cambia')
const fijada = MF.fija(m1)
oraculo('A26', 'una sesion fija par y huella; se publica v2 (otra huella): la fijada no coincide y no se usa', fijada === `EURUSD@v1:${m1.huella}` && MF.coincide(fijada, m1) === true && MF.coincide(fijada, m2) === false)
fin()
