/**
 * C01 · DOS CARGAS DEL MISMO PAR SUSTITUYEN LA CARTERA VIVA
 *
 * Astra (4-oct): al llegar la sesion y el par activo, los dos efectos de
 * usePairData llaman a loadPair antes de que haya `ready`
 * (components/usePairData.js:150-167); cada carga crea un motor nuevo y
 * escribe pairState[par] con posiciones vacias (:66-70). Si la segunda
 * respuesta llega despues de abrir una posicion, la posicion desaparece.
 *
 * Se ejecuta con el banco del motor (cableado REAL, pruebas/banco-motor.mjs):
 * se retiene la PRIMERA peticion de la segunda carga en el fetch del entorno.
 *
 * ORACULO: una sola instancia de motor por par y la posicion abierta sigue
 * despues de que llegue cualquier respuesta atrasada.
 */
import { titulo, ver, oraculo, fin, escenario, sesionSim, vela, retenApi, puerta, asienta, api } from '../lib.mjs'
import { banco, velasEnStorage } from '../banco-motor.mjs'
const T = Date.parse('2025-03-03T10:00:00Z') / 1000
const ses = sesionSim()
escenario({ sim_sessions: [ses] })
velasEnStorage('EUR/USD', Array.from({ length: 5 }, (_, i) => vela(T + i * 60, 1.1, 1.1, 1.1, 1.1)), [2024], { tramoAbierto: true })

titulo('1 · la segunda carga se retrasa')
let n = 0
const suelta = puerta()
retenApi.antes = async u => { if (u.startsWith('/api/candles') && ++n === 2) await suelta.p }   // la 2.ª peticion es la primera de la 2.ª carga
const b = await banco({ sesion: ses })
const motor1 = b.motor()
ver('control: la primera carga termino (motor y par listos) y hay otra peticion retenida', !!motor1 && b.ps().ready === true && n >= 2, `${n} peticiones`)
b.abreMercado({ side: 'BUY', entry: 1.1, sl: 1.09, tp: 1.11, lots: 1 })
ver('control: una posicion abierta en el par', b.ps().positions.length === 1)
suelta.abrir(); await asienta(120); await b.repinta()
ver('control: la carga retenida tambien termino', api.llamadas.filter(l => l.ruta === '/api/candles').length >= 4, api.llamadas.length)
oraculo('C01', 'un solo motor por par', b.motor() === motor1, b.motor() === motor1 ? '' : 'el motor 1 fue sustituido por el 2')
oraculo('C01', 'la posicion abierta sigue', b.ps().positions.length === 1, `posiciones ${b.ps().positions.length}`)
fin()
