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
 * fijada no cambia aunque se publique otra.
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
oraculo('MAN', 'nombre del trozo con su hash; esquema, par, version y digitos', m1.dias[0].nombre === `2026-03-02.${m1.dias[0].sha256}.bin` && m1.esquema === 'mercado-manifiesto@1' && m1.par === 'EURUSD' && m1.version === 'v1' && m1.digitos === 5)
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

titulo('5 · A26: la version fijada no cambia')
const fijada = MF.fija(m1)
oraculo('A26', 'una sesion fija par y huella; se publica v2 (otra huella): la fijada no coincide y no se usa', fijada === `EURUSD@v1:${m1.huella}` && MF.coincide(fijada, m1) === true && MF.coincide(fijada, m2) === false)
fin()
