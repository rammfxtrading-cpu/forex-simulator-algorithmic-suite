/**
 * MOTOR · P7-06: COHERENCIA DE LOS DOCUMENTOS (Astra pieza 7 sobre 3f7ceb0; CTO 10-oct-2026)
 *
 * Comprobacion de TEXTO (los documentos los leera quien escriba el SQL y las
 * pruebas; no hay codigo que ejecutar):
 *   · persistencia: UNA sola regla de reloj. La caducidad del arrendamiento se
 *     decide con t_decision = clock_timestamp() tras los bloqueos (§ 4.2); el
 *     procedimiento (§ 4.3, paso 5) y el inventario (V3-06) no pueden seguir
 *     prescribiendo now() (Astra: con now() = 59 se acepta lo que a las 62 ya
 *     caduco);
 *   · persistencia § 9.3: fuera «≈ 78 MB en el peor caso» (no coincide con el
 *     escenario de 90 MB y no es un peor caso);
 *   · especificacion § 13.8: A42 (b) y A43 (c) como estan en las pruebas: el
 *     TP de la fase 3 y el SL de la fase 4 de una posicion llenada en la fase
 *     3; la pendiente de AUDCAD llenada en la fase 3 con AUDUSD en 0,65500 y
 *     margen 650 (apertura), no 655.
 */
import { titulo, oraculo, fin, fuente } from '../lib.mjs'
const lee = p => { try { return fuente(p) } catch { return '' } }
const PERS = lee('revisiones/2026-10-07-diseno-persistencia.md')
const ESP = lee('revisiones/2026-10-05-especificacion-motor-v2.md')
const fila = (t, id) => (t.split('\n').find(l => l.startsWith(`| **${id}**`)) ?? '')

titulo('persistencia: una sola regla de reloj')
const paso5 = (PERS.split('\n').find(l => /^5\. Verificaciones/.test(l)) ?? '')
oraculo('P7-06', 'el paso 5 de § 4.3 comprueba la caducidad con t_decision (§ 4.2), no con now()', /t_decision/.test(paso5) && !/now\(\)/.test(paso5), paso5.slice(0, 200))
const v306 = PERS.split('\n').find(l => l.startsWith('| V3-06')) ?? ''
oraculo('P7-06', 'el inventario (V3-06) remite a t_decision y no prescribe now()', /t_decision/.test(v306) && !/caducidad con `now\(\)`/.test(v306), v306.slice(0, 200))
oraculo('P7-06', 'en todo el documento no queda ninguna «caducidad con now()»', !!PERS && !/caducidad con `?now\(\)`?/.test(PERS), (PERS.match(/.*caducidad con `?now\(\)`?.*/) ?? [''])[0].slice(0, 160))
titulo('persistencia § 9.3')
oraculo('P7-06', 'fuera «78 MB en el peor caso»', !!PERS && !/78 MB/.test(PERS) && !/peor caso del cupo/.test(PERS), (PERS.match(/.*78 MB.*/) ?? [''])[0])
titulo('especificacion: A42 (b) y A43 (c) como en las pruebas')
const a42 = fila(ESP, 'A42'), a43 = fila(ESP, 'A43')
oraculo('P7-06', 'A42 (b): TP en la fase 3 (+500,000000, apertura 140) y SL en la fase 4 de una posicion llenada en la fase 3 (−451,612903, cierre 155)', /fase 3/.test(a42) && /fase 4/.test(a42) && /llenada en la fase 3/.test(a42) && /\+500,000000/.test(a42) && /−451,612903/.test(a42), a42.slice(0, 300))
oraculo('P7-06', 'A43 (c): la pendiente de AUDCAD se llena en la fase 3 con AUDUSD ya en 0,65500; margen 650,00 (apertura), no 655,00', /fase 3/.test(a43) && /0,65500/.test(a43) && /650,00/.test(a43) && /655,00/.test(a43) && !/llena en la \*\*fase 4\*\*/.test(a43), a43.slice(0, 300))
fin()
