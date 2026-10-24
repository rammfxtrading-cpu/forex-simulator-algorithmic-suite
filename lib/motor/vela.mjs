// lib/motor/vela.mjs — la regla de la vela en el motor v1 (decision de Ramon, orden 1-085; doji en decimas
// de pip redondeando la mitad hacia arriba, ordenes 1-100, 1-117 y 1-118 del CTO). La MISMA regla que la
// pantalla (lib/sim/vela.js, `recorridos`), en enteros:
//   · alcista (cierre > apertura): camino B = O→L→H→C
//   · bajista (cierre < apertura): camino A = O→H→L→C
//   · doji (cierre = apertura): el extremo mas cercano a la apertura primero; las dos distancias, exactas en
//     ticks, se pasan a DECIMAS DE PIP del par redondeando la mitad hacia arriba (aritmetica entera)
//   · doji equidistante en decimas de pip: null, y decide `desempate` (el SL)
// En el motor los precios ya son TICKS enteros (instrumentos.mjs: el ultimo digito cotizado; aTicks rechaza lo
// que cae fuera de la rejilla), asi que la «escala comun» de la pantalla es siempre la del par y, con pipTicks =
// 10 en los 9 pares, un tick es una decima de pip: no hay nada que redondear. La conversion se escribe igual para
// que la regla no dependa de esa casualidad. Ninguna coma flotante.
// Lo demas de la regla sale del recorrido tick a tick del motor (motor.mjs `recorre`, cartera.mjs `minuto`):
// el hueco de apertura se ejecuta en la apertura, y una pendiente llenada dentro de la vela mira su SL y su TP
// desde el tick de su entrada, no antes.
import { instrumento } from './instrumentos.mjs'

// una distancia en ticks (BigInt, ≥ 0) en decimas de pip de `par`, redondeando la mitad hacia arriba
export function enDecimasDePip(par, ticks) {
  const p = instrumento(par).pipTicks              // ticks por pip; una decima de pip = p / 10 ticks
  return (2n * ticks * 10n + p) / (2n * p)
}

// el camino de una vela M1 (ticks): 'A' = O→H→L→C, 'B' = O→L→H→C; null = doji equidistante
export function caminoDeLaVela(v, par) {
  if (v.close > v.open) return 'B'
  if (v.close < v.open) return 'A'
  const abajo = enDecimasDePip(par, v.open - v.low), arriba = enDecimasDePip(par, v.high - v.open)
  return abajo < arriba ? 'B' : arriba < abajo ? 'A' : null
}

// el doji equidistante: «si estan a la misma distancia, primero lo que perjudica a la posicion (el SL)». Con un
// solo camino por par, gana el camino en el que salta un SL de `par`; si salta en los dos o en ninguno, el peor
// para la cartera (equity minima; a igualdad, equity al cierre; a igualdad, B), que con una posicion es tambien el
// de la pantalla: SL si algun recorrido da SL, TP solo si los dos dan TP. a, b: { eventos, minimo_µ, cierre_µ }
const saltaSL = (evs, par) => evs.some(x => x.tipo === 'cierre' && x.motivo === 'SL' && (x.par == null || x.par === par))
export function desempate(a, b, par) {
  const sa = saltaSL(a.eventos, par), sb = saltaSL(b.eventos, par)
  if (sa !== sb) return sa ? 'A' : 'B'
  return a.minimo_µ < b.minimo_µ ? 'A' : b.minimo_µ < a.minimo_µ ? 'B' : a.cierre_µ < b.cierre_µ ? 'A' : 'B'
}

// el texto del camino aplicado, para la causa de una vela ambigua
export const textoCamino = (camino, regla) => `${camino === 'A' ? 'O→H→L→C' : 'O→L→H→C'}, ${regla ? 'la regla de la vela' : 'doji equidistante: el del SL'}`
