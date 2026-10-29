/**
 * BANCO · LA HORA DE LA PAGINA AL LLEGAR DEL GO TO Y DEL STEP (ordenes 1-167 y 1-168 del CTO)
 *
 * Desde 53c2546 el onTick no pone la hora de la pagina durante el salto (engine.saltando): la ponen handleStep y
 * handleGoTo al llegar (setCurrentTime(e.currentTime)). Medido en Chrome con la pagina real (orden 1-167): tras el Go to,
 * p_last_timestamp de sim_cierre_v0 = la vela de llegada (06:00); tras dos Step, 06:02. Si el banco (pruebas/banco-motor.mjs)
 * no lo copia, su hora se queda en la de antes del salto y las pruebas del banco miden otra pagina (C-total-carga lo cazo
 * en el Step). ORACULOS (practica, EUR/USD, la etapa 1 con su cierre atomico en el doble):
 *   1 Go to (irA): la hora del banco = la del motor al llegar; una orden a mercado abierta despues lleva openTime = esa
 *     hora; su cierre manda p_last_timestamp = esa hora
 *   2 Step (paso): lo mismo tras dos Step
 */
import { titulo, ver, oraculo, fin, escenario, sesionSim, vela, importa, asienta, db, A } from './lib.mjs'
import { banco, velasEnStorage, copiasVigentes } from './banco-motor.mjs'
ver('control: las lineas copiadas de _SessionInner siguen ahi', Object.values(copiasVigentes()).every(Boolean), JSON.stringify(copiasVigentes()))
const CI = await importa('lib/sim/cierre.js'), SV = await importa('lib/sim/servicio.js')
const hhmm = t => t == null ? '-' : new Date(t * 1000).toISOString().slice(11, 16)
// de las 22:55 UTC del martes a pasadas las 07:05 del miercoles (la apertura de Londres), precio plano
const DIA = '2025-01-07', T0 = Date.parse(`${DIA}T22:55:00Z`) / 1000
const VELAS = []
for (let t = T0; t <= T0 + 8 * 3600 + 30 * 60; t += 60) VELAS.push(vela(t, 1.2, 1.2002, 1.1998, 1.2))

async function caso(nombre, avanza) {
  const ses = sesionSim({ id: 'ses-h', pair: 'EUR/USD', date_from: DIA, date_to: '2025-01-10', capital: 10000, balance: 10000 })
  escenario({ sim_sessions: [ses] })
  velasEnStorage('EUR/USD', VELAS, [2024], { tramoAbierto: true })
  const b = await banco({ sesion: ses, userId: A }); CI.fijaSaldoConfirmado(ses.id, 10000); await SV.leeServicio(); await b.repinta()
  const antes = b.motor().currentTime
  await avanza(b); await asienta(40); await b.repinta()
  const llegada = b.motor().currentTime
  ver(`control (${nombre}): el motor ha avanzado`, llegada > antes, `${hhmm(antes)} → ${hhmm(llegada)}`)
  db.log.length = 0
  const pos = b.abreMercado({ side: 'BUY', entry: 1.2, sl: 1.19, tp: 1.21, lots: 1 })
  await b.caja.valor.trading.closePosition(pos.id, 'MANUAL', 'EUR/USD', 1.2001); await asienta(40)
  const r = db.log.filter(c => c.tabla === 'rpc:sim_cierre_v0')
  ver(`control (${nombre}): un cierre, por sim_cierre_v0`, r.length === 1, `${r.length} rpc`)
  const lt = r[0]?.payload?.p_last_timestamp
  const detalle = `motor ${hhmm(llegada)} · banco ${hhmm(b.estado.currentTime)} · openTime ${hhmm(pos.openTime)} · p_last_timestamp ${hhmm(lt)}`
  oraculo('HORA', `${nombre}: la hora de la pagina es la de llegada (como setCurrentTime(e.currentTime) de la pagina)`, b.estado.currentTime === llegada, detalle)
  oraculo('HORA', `${nombre}: la orden a mercado abierta al llegar lleva openTime = la hora de llegada`, pos.openTime === llegada, detalle)
  oraculo('HORA', `${nombre}: su cierre manda p_last_timestamp = la hora de llegada, igual que la hora de la pagina (medido en Chrome)`, lt === llegada && lt === b.estado.currentTime, detalle)
}

titulo('1 · Go to (irA) a la apertura de Londres')
await caso('Go to', async b => { const d = await b.irA('london'); ver('control (Go to): hay destino y llega', !!d && d.llego !== false, JSON.stringify(d)) })
titulo('2 · dos Step (paso)')
await caso('Step', b => b.paso(2))
fin()
