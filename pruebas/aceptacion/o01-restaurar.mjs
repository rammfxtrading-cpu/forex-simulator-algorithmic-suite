/**
 * O01 (restaurar) · RESTAURAR PUEDE EMPEORAR EL HISTORICO Y BORRA OTRO AÑO
 *
 * Astra (4-oct): scripts/restore-2026.js sube lo que devuelva el proveedor sin
 * comprobar cobertura (:44-52), despues borra los 2023 sin mirar el resultado
 * (:58-62) y acaba en «Done.». En la fase 1, ejecutado con el proveedor vacio:
 * EURUSD 2026 pasa de 100 a 0 velas, borra los dos 2023, codigo 0. (La otra
 * mitad de O01, el año nuevo del actualizador, esta en o01-anio-nuevo.)
 * Decision del CTO (4-oct, bloque A): no borra nada; falla con codigo
 * distinto de cero si el proveedor devuelve vacio o parcial; modo en seco por
 * defecto.
 *
 * Se ejecuta: el script REAL (pruebas/script-falso.mjs: proveedor y Supabase
 * falsos, reloj fijo, .env.local FALSO en una carpeta temporal; un espia de fs
 * comprueba que no se abre ningun .env de verdad).
 *
 * ORACULOS, a mano. Reloj: viernes 16-ene-2026 12:00 UTC. Dias laborables del
 * 1 al 15 de enero: 1, 2, 5, 6, 7, 8, 9, 12, 13, 14, 15 = 11. Bucket: EURUSD 2026
 * con 100 velas y dos ficheros 2023.
 *   A. sin argumentos (en seco), datos completos: no escribe ni borra nada; 0
 *   B. --subir, proveedor vacio: no sube, no borra; codigo ≠ 0
 *   C. --subir, solo el lunes 5 (1 de 11 dias): no sube; codigo ≠ 0
 *   D. --subir, los 11 dias completos: sube los 6 pares (control) y NO borra
 *      los 2023; codigo 0
 */
import { titulo, ver, oraculo, fin, escenario, proveedor, db, guardado } from '../lib.mjs'
import { diaM1 } from '../proveedor-falso.mjs'
import { correScript, ejecucionesScripts } from '../script-falso.mjs'
const AHORA = '2026-01-16T12:00:00Z'
const cien = JSON.stringify(diaM1('2026-01-05', 100).map(c => ({ time: c.timestamp / 1000, open: 1, high: 1, low: 1, close: 1, volume: 1 })))
const BUCKET = () => ({ 'forex-data': { 'EURUSD/M1/2026.json': cien, 'EURUSD/M1/2023.json': '[]', 'GBPUSD/M1/2023.json': '[]' } })
// el proveedor: 1.440 velas por cada dia laborable del rango pedido
const completo = ({ dates }) => {
  const out = []
  for (let t = Date.UTC(2026, 0, 1); t < dates.to.getTime(); t += 86400000) { const d = new Date(t); if (d.getUTCDay() % 6) out.push(...diaM1(d.toISOString().slice(0, 10))) }
  return out
}
// los cerrojos de publicacion (_cerrojos/, lib/mercado/ficheros.mjs) no son datos de mercado
const deDatos = l => !String(l.payload?.ruta ?? l.payload).includes('_cerrojos/')
const escrituras = () => db.log.filter(l => (l.op === 'upload' || l.op === 'remove') && deDatos(l))
const quedan2023 = () => Object.keys(db.storage['forex-data']).filter(k => k.includes('2023')).length
const corre = argv => correScript('scripts/restore-2026.js', { ahora: AHORA, argv })

titulo('0 · el oraculo')
ver('control: el proveedor completo da 11 dias laborables del 1 al 15 de enero', new Set(completo({ dates: { to: new Date('2026-01-16T00:00:00Z') } }).map(c => new Date(c.timestamp).toISOString().slice(0, 10))).size === 11)

titulo('A · sin argumentos, datos completos')
escenario({ storage: BUCKET() }); proveedor.responde = completo
const a = await corre([])
ver('control positivo del espia: vio la lectura del .env.local FALSO', a.envTodos.length === 1 && a.envTodos[0].endsWith('.env.local'), a.envTodos.length)
ver('control: no abrio ningun .env real', a.envLeidos.length === 0)
ver('control: pidio las velas al proveedor', proveedor.llamadas.length >= 1)
oraculo('O01', 'A: en seco por defecto: ni sube ni borra', escrituras().length === 0, escrituras().map(l => `${l.op} ${JSON.stringify(l.payload).slice(0, 40)}`).join(' · '))
oraculo('O01', 'A: y acaba bien (codigo 0)', (a.exitCode ?? 0) === 0, `codigo ${a.exitCode ?? 0}`)

titulo('B · --subir con el proveedor vacio')
escenario({ storage: BUCKET() }); proveedor.responde = () => []
const b = await corre(['--subir'])
oraculo('O01', 'B: con el proveedor vacio, el 2026 guardado no se sustituye', guardado('EURUSD/M1/2026').velas.length === 100,
  `EURUSD 2026 pasa de 100 a ${guardado('EURUSD/M1/2026').velas.length} velas`)
oraculo('O01', 'B: no borra los 2023', quedan2023() === 2, `quedan ${quedan2023()} de 2`)
oraculo('O01', 'B: falla con codigo distinto de cero', (b.exitCode ?? 0) !== 0, `codigo ${b.exitCode ?? 0}; ultima linea: ${b.salida.at(-1)}`)

titulo('C · --subir con solo el lunes 5 (1 de 11 dias)')
escenario({ storage: BUCKET() }); proveedor.responde = () => diaM1('2026-01-05')
const c = await corre(['--subir'])
oraculo('O01', 'C: no sube un 2026 parcial', !db.log.some(l => l.op === 'upload' && deDatos(l)), db.log.filter(l => l.op === 'upload' && deDatos(l)).map(l => l.payload.ruta).join(' ') || '0 uploads')
oraculo('O01', 'C: falla con codigo distinto de cero', (c.exitCode ?? 0) !== 0, `codigo ${c.exitCode ?? 0}`)

titulo('D · --subir con los 11 dias completos')
escenario({ storage: BUCKET() }); proveedor.responde = completo
const d = await corre(['--subir'])
const subidos = db.log.filter(l => l.op === 'upload' && deDatos(l)).map(l => l.payload.ruta)
ver('control: subio los 6 pares de 2026', subidos.length === 6 && subidos.every(r => /\/M1\/2026\.json(\.gz)?$/.test(r)), subidos.join(' '))
oraculo('O01', 'D: no borra nada (los dos 2023 siguen)', quedan2023() === 2 && !db.log.some(l => l.op === 'remove' && deDatos(l)), `quedan ${quedan2023()} de 2`)
oraculo('O01', 'D: acaba bien (codigo 0)', (d.exitCode ?? 0) === 0, `codigo ${d.exitCode ?? 0}`)
ver('control (H06): todos los scripts terminaron (veredicto o exit), ninguno por timeout', ejecucionesScripts.length > 0 && ejecucionesScripts.every(e => e.terminoPor !== 'timeout'), JSON.stringify(ejecucionesScripts.map(e => e.terminoPor + ':' + e.codigo)))
fin()
