/**
 * ETAPA 3 · EL ADAPTADOR motor → sim_comando: la posicion de cada cierre (autorrevision
 * de la etapa 3, diseño q.9, AR3-01). Escrito ANTES que el arreglo (en rojo contra el
 * commit de sim-004b).
 *
 * Un `modificar` que hace ejecutable una pendiente la llena con el SL/TP NUEVOS del
 * comando (cartera.mjs, rama ejecutable: abrePosicion con sl, tp del comando; no hay
 * evento orden_modificada). Si esa posicion se cierra en el mismo comando (un breach
 * inmediato), su trade tiene que llevar el SL/TP del comando, no los viejos de la orden.
 * Y el caso normal: una pendiente llenada en un avance lleva los de la orden.
 */
import { titulo, oraculo, fin, importa } from './lib.mjs'
const CA = await importa('lib/motor/cartera.mjs')
const CO = await importa('lib/servidor/comando.mjs')
const { COSTES_1 } = await importa('lib/motor/costes.mjs')
const T = Date.parse('2025-01-06T10:00:00Z') / 1000
let e = CA.crea({ pares: ['EURUSD'], costes: COSTES_1, capital: '100000' })
e = structuredClone(e)
e.ordenes = [{ id: 'o1', seq: 1, par: 'EURUSD', lado: 'BUY', tipo: 'limit', precio: 109000n, sl: 108000n, tp: 112000n, lotes_c: 100n, creada_en: { t: T } }]
e.siguiente_seq = 2
const fill = { tipo: 'fill', posicion: 'p2', par: 'EURUSD', orden: 'o1', lado: 'BUY', precio: 110003n, lotes_c: 100n, comision_µ: 3_000_000n, hueco: false, en: { t: T + 60 } }
const cierre = { tipo: 'cierre', posicion: 'p2', par: 'EURUSD', motivo: 'breach', lado: 'BUY', precio: 110000n, lotes_c: 100n, bruto_µ: -30_000_000n, comision_µ: 3_000_000n, neto_µ: -33_000_000n, conversion: null, hueco: false, en: { t: T + 60 } }
const trade = c => CO.resultadoDe({ tipo: c.tipo, comando: c, antes: e, despues: e, eventos: [fill, cierre] }).trades[0]

titulo('la posicion de un cierre en el mismo comando que la lleno')
const t1 = trade({ tipo: 'modificar', id: 'o1', precio: '1.1001', sl: '1.095', tp: '1.12' })
oraculo('ADAP', 'modificar que ejecuta la pendiente con SL 1,095: el trade lleva SL 1.09500 (el del comando), TP 1.12000', t1?.sl_price === '1.09500' && t1.tp_price === '1.12000', JSON.stringify(t1))
const t2 = trade({ tipo: 'modificar', id: 'o1', precio: '1.1001' })
oraculo('ADAP', 'modificar sin sl ni tp: el trade lleva los de la orden (1.08000 y 1.12000)', t2?.sl_price === '1.08000' && t2.tp_price === '1.12000', JSON.stringify(t2))
const t3 = trade({ tipo: 'modificar', id: 'o1', precio: '1.1001', sl: null })
oraculo('ADAP', 'modificar que quita el SL (null): el trade sin SL', t3?.sl_price === null && t3.tp_price === '1.12000', JSON.stringify(t3))
const t4 = trade({ tipo: 'avanzar', hasta: T + 60 })
oraculo('ADAP', 'la pendiente llenada en un avance: los de la orden', t4?.sl_price === '1.08000' && t4.tp_price === '1.12000', JSON.stringify(t4))
oraculo('ADAP', 'la cache de trozos por defecto tiene un tope acotado para una funcion (≤ 300 trozos)', (await importa('lib/servidor/mercado.mjs')).TOPE_CACHE <= 300, String((await importa('lib/servidor/mercado.mjs')).TOPE_CACHE))
fin()
