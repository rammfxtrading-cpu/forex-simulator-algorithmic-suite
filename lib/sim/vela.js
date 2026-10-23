// La regla de la vela (decision de Ramon, orden 1-085 del CTO): por donde pasa el precio dentro de
// una vela M1, para saber que toca antes cuando la vela alcanza a la vez el SL y el TP, o cuando una
// pendiente se llena y en esa misma vela toca su SL o su TP (M04).
//   · alcista (cierre > apertura): apertura → minimo → maximo → cierre
//   · bajista (cierre < apertura): apertura → maximo → minimo → cierre
//   · doji (cierre = apertura): primero el extremo mas cercano a la apertura; si estan a la misma
//     distancia (comparada en DECIMAS DE PIP del par: SIMVELA1-01, orden 1-100), primero lo que perjudica a la
//     posicion (el SL)
// Igual en Step, Play y Go to (todos pasan por checkSLTP), y en el motor v1 (lib/motor/cartera.mjs).

import { pipSize } from '../trading/pricing'

const BAJO_PRIMERO = v => [v.open, v.low, v.high, v.close]
const ALTO_PRIMERO = v => [v.open, v.high, v.low, v.close]

// los recorridos posibles de la vela de `par`: uno, o los dos si es un doji equidistante
export function recorridos(v, par) {
  if (v.close > v.open) return [BAJO_PRIMERO(v)]
  if (v.close < v.open) return [ALTO_PRIMERO(v)]
  // SIMVELA1-01 (Astra; orden 1-100): las distancias, en DECIMAS DE PIP de ESTE par (0,00001 en EUR/USD, 0,001 en
  // los pares con JPY: lib/trading/pricing.js pipSize; un par sin pip propio, el de 0,0001). Antes, una escala fija
  // de 0,0000001 que en EUR/USD era una milesima de pip: 10,01 y 10,02 pips no empataban y ganaba el TP
  const u = pipSize(par) / 10
  const abajo = Math.round((v.open - v.low) / u), arriba = Math.round((v.high - v.open) / u)
  if (abajo < arriba) return [BAJO_PRIMERO(v)]
  if (arriba < abajo) return [ALTO_PRIMERO(v)]
  return [BAJO_PRIMERO(v), ALTO_PRIMERO(v)]
}

// el primero de `niveles` ({ nombre, precio }) que toca el recorrido `pts`, empezando en el precio
// `desde` del tramo `tramo` (por defecto, la apertura); null si ninguno. Un nivel en el punto de
// partida cuenta como tocado ahi (hueco de apertura).
function primerToque(pts, niveles, tramo = 0, desde = pts[0]) {
  const vivos = niveles.filter(n => n.precio != null)
  const enInicio = vivos.find(n => n.precio === desde)
  if (enInicio) return { nivel: enInicio, tramo, punto: desde }
  for (let k = tramo; k < pts.length - 1; k++) {
    const a = k === tramo ? desde : pts[k], b = pts[k + 1]
    const dentro = vivos.filter(n => (b >= a ? n.precio >= a && n.precio <= b : n.precio <= a && n.precio >= b))
    if (dentro.length) {
      dentro.sort((x, y) => (b >= a ? x.precio - y.precio : y.precio - x.precio))
      return { nivel: dentro[0], tramo: k, punto: dentro[0].precio }
    }
  }
  return null
}

// SL o TP de una posicion en esta vela con la regla: 'SL', 'TP' o null.
//   pos: { side: 'BUY'|'SELL', sl, tp, entry, pair }; llenadaAqui: la abrio una pendiente en ESTA vela, y el
//   recorrido empieza donde el precio toca su entrada (antes de eso no existia). par: el de la vela (si no, pos.pair)
// Con un hueco de apertura ya mas alla del SL o del TP, ese es el tocado (en la apertura).
export function cierreEnVela(pos, v, { llenadaAqui = false, par = pos.pair } = {}) {
  const largo = pos.side === 'BUY'
  // el SL y el TP como niveles; los tocados a partir de la apertura cuentan aunque el hueco los salte
  const niveles = [{ nombre: 'SL', precio: pos.sl }, { nombre: 'TP', precio: pos.tp }]
  const resultados = recorridos(v, par).map(pts => {
    let tramo = 0, desde = pts[0]
    const huecoEntrada = largo ? pts[0] <= pos.entry : pts[0] >= pos.entry
    if (llenadaAqui && !huecoEntrada) {
      const lleno = primerToque(pts, [{ nombre: 'ENTRADA', precio: pos.entry }])
      if (!lleno) return null
      tramo = lleno.tramo; desde = lleno.punto
    } else {
      // hueco: la apertura ya esta mas alla de un nivel
      if (pos.sl != null && (largo ? pts[0] <= pos.sl : pts[0] >= pos.sl)) return 'SL'
      if (pos.tp != null && (largo ? pts[0] >= pos.tp : pts[0] <= pos.tp)) return 'TP'
    }
    return primerToque(pts, niveles, tramo, desde)?.nivel.nombre ?? null
  })
  // doji equidistante: lo que perjudica a la posicion (SL; si no hay SL en ningun recorrido, el TP
  // solo si lo dan todos)
  if (resultados.includes('SL')) return 'SL'
  return resultados.every(r => r === 'TP') ? 'TP' : null
}
