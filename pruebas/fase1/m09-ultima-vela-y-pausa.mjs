/**
 * M09 · LA ULTIMA VELA NO SE EJECUTA, Y PAUSAR DENTRO DE UN LOTE NO PARA EL LOTE
 *
 * Astra (4-oct): ReplayEngine.nextCandle, al llegar a la ultima vela, fija el
 * tiempo y llama a onEnd SIN onTick (lib/replayEngine.js:163-168): un SL que
 * solo se toca en la ultima vela no cierra. Y _tickFrame avanza el lote entero
 * aunque un onTick pause (lib/replayEngine.js:236-238): 20 M1/s, frame de
 * 250 ms → 5 pasos; pausar en el primero acaba en el indice 5.
 *
 * Se ejecuta con el banco del motor (cableado REAL, pruebas/banco-motor.mjs) y
 * con el ReplayEngine REAL.
 *
 * ORACULOS, a mano:
 *   · 3 velas, BUY 1,1000 con SL 1,0990 tocado solo en la 3.ª: al avanzar hasta
 *     el final, la posicion cierra en el SL: −100.
 *   · 20 velas M1 por segundo × 0,25 s = 5 pasos en ese frame. Si el onTick del
 *     primer paso pausa (como el breach de un challenge), el motor se queda en
 *     el indice 1 (0 + 1 paso), no en el 5.
 */
import { titulo, ver, oraculo, fin, escenario, sesionSim, vela, importa } from '../lib.mjs'
import { banco, velasEnStorage } from '../banco-motor.mjs'
const ReplayEngine = (await importa('lib/replayEngine.js')).default
const T = Date.parse('2025-03-03T10:00:00Z') / 1000

titulo('1 · el SL solo en la ultima de tres velas')
const ses = sesionSim()
escenario({ sim_sessions: [ses] })
velasEnStorage('EUR/USD', [
  vela(T, 1.1000, 1.1002, 1.0998, 1.1000),
  vela(T + 60, 1.1000, 1.1003, 1.0995, 1.1001),
  vela(T + 120, 1.1001, 1.1002, 1.0985, 1.0988),      // solo esta toca el SL (1,0990)
], [2024], { tramoAbierto: true })
const b = await banco({ sesion: ses })
b.abreMercado({ side: 'BUY', entry: 1.1000, sl: 1.0990, tp: 1.1100, lots: 1 })
let finales = 0
const onEnd = b.motor().onEnd
b.motor().onEnd = () => { finales++; onEnd() }
await b.paso(2)
ver('control: el motor llego al final (ultima vela, onEnd)', b.motor().currentIndex === 2 && finales === 1, `indice ${b.motor().currentIndex}, onEnd ${finales}`)
const t = b.ps().trades[0]
oraculo('M09', 'la ultima vela se ejecuta: cierra en el SL, −100', t?.reason === 'SL' && Math.abs(t.pnl + 100) < 1e-6, t ? `${t.reason} ${t.pnl}` : `sigue ABIERTA (${b.ps().positions.length} posicion)`)

titulo('2 · pausar dentro de un lote de 5 pasos')
const e = new ReplayEngine()
e.load(Array.from({ length: 20 }, (_, i) => vela(T + i * 60, 1.1, 1.1, 1.1, 1.1)))
e.speed = 20
const indices = []
e.onTick = () => { indices.push(e.currentIndex); if (indices.length === 1) e.pause() }   // el breach pausa en el primer paso
e.isPlaying = true; e._lastFrameTs = null; e._fracAcc = 0
e._tickFrame(1000)          // primer frame: solo toma la hora
e._tickFrame(1250)          // 250 ms despues: 20 × 0,25 = 5 pasos
ver('control: el onTick pauso en el primer paso', indices[0] === 1 && e.isPlaying === false, JSON.stringify(indices))
oraculo('M09', 'tras pausar en el primer paso, el motor se queda en el indice 1', e.currentIndex === 1, `indice ${e.currentIndex}, onTick en ${JSON.stringify(indices)}`)
fin()
