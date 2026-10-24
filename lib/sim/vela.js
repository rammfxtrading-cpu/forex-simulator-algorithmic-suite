// La regla de la vela (decision de Ramon, orden 1-085 del CTO): por donde pasa el precio dentro de
// una vela M1, para saber que toca antes cuando la vela alcanza a la vez el SL y el TP, o cuando una
// pendiente se llena y en esa misma vela toca su SL o su TP (M04).
//   · alcista (cierre > apertura): apertura → minimo → maximo → cierre
//   · bajista (cierre < apertura): apertura → maximo → minimo → cierre
//   · doji (cierre = apertura): primero el extremo mas cercano a la apertura; si estan a la misma
//     distancia, primero lo que perjudica a la posicion (el SL)
// Igual en Step, Play y Go to (todos pasan por checkSLTP).
//
// EN ENTEROS (SIMVELA2-01, Astra; orden 1-108 del CTO). Cada precio (apertura, maximo, minimo, cierre, SL, TP y
// entrada) se convierte UNA vez a PUNTOS enteros del par: 5 decimales (×10^5) sin JPY y 3 (×10^3) con JPY, es decir,
// en decimas de pip (la unidad de la orden 1-100). Despues, TODAS las comparaciones (que vela es, que nivel toca, que
// extremo esta mas cerca) son entre enteros: ninguna resta de coma flotante decide un empate. Antes, las distancias se
// restaban en Number y se redondeaban despues: 0,95 pip arriba y abajo podian caer a lados distintos del redondeo.
// La conversion sale del TEXTO decimal del numero (String: el decimal mas corto que lo representa, el mismo que llega
// en el JSON de las velas), no de multiplicar en binario. Un precio con MAS decimales que el par se redondea en esa
// unica conversion a la mitad PAR (0,5 punto va al punto par): asi dos extremos a la misma distancia decimal de la
// apertura siguen a la misma distancia en puntos, por arriba y por abajo.

import { isJpy } from '../trading/pricing'

export const decimalesDe = par => (isJpy(par) ? 3 : 5)

// precio → puntos enteros del par (una sola vez); null si no hay precio
export function aPuntos(x, dec) {
  if (x == null || x === '') return null
  let s = typeof x === 'string' ? x.trim() : String(x)
  // notacion exponencial (no pasa con precios de mercado): su desarrollo con margen y el mismo redondeo
  if (/e/i.test(s)) s = Number(s).toFixed(dec + 12)
  const m = /^(-?)(\d*)(?:\.(\d*))?$/.exec(s)
  if (!m) return NaN
  const frac = m[3] ?? ''
  let n = Number((m[2] || '0') + frac.slice(0, dec).padEnd(dec, '0'))
  const resto = frac.slice(dec).replace(/0+$/, '')
  if (resto) {
    const cmp = resto[0] > '5' ? 1 : resto[0] < '5' ? -1 : resto.length > 1 ? 1 : 0
    if (cmp > 0 || (cmp === 0 && n % 2 === 1)) n += 1
  }
  return m[1] === '-' ? -n : n
}

const velaEnPuntos = (v, dec) => ({ open: aPuntos(v.open, dec), high: aPuntos(v.high, dec), low: aPuntos(v.low, dec), close: aPuntos(v.close, dec) })

const BAJO_PRIMERO = v => [v.open, v.low, v.high, v.close]
const ALTO_PRIMERO = v => [v.open, v.high, v.low, v.close]

// los recorridos posibles de la vela (YA EN PUNTOS): uno, o los dos si es un doji equidistante
function recorridosPuntos(v) {
  if (v.close > v.open) return [BAJO_PRIMERO(v)]
  if (v.close < v.open) return [ALTO_PRIMERO(v)]
  const abajo = v.open - v.low, arriba = v.high - v.open
  if (abajo < arriba) return [BAJO_PRIMERO(v)]
  if (arriba < abajo) return [ALTO_PRIMERO(v)]
  return [BAJO_PRIMERO(v), ALTO_PRIMERO(v)]
}

// los recorridos de una vela en precios de `par`, en PUNTOS enteros
export function recorridos(v, par) {
  return recorridosPuntos(velaEnPuntos(v, decimalesDe(par)))
}

// el primero de `niveles` ({ nombre, precio }, en puntos) que toca el recorrido `pts`, empezando en el
// punto `desde` del tramo `tramo` (por defecto, la apertura); null si ninguno. Un nivel en el punto de
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
  const dec = decimalesDe(par)
  const largo = pos.side === 'BUY'
  const sl = aPuntos(pos.sl, dec), tp = aPuntos(pos.tp, dec), entry = aPuntos(pos.entry, dec)
  // el SL y el TP como niveles; los tocados a partir de la apertura cuentan aunque el hueco los salte
  const niveles = [{ nombre: 'SL', precio: sl }, { nombre: 'TP', precio: tp }]
  const resultados = recorridosPuntos(velaEnPuntos(v, dec)).map(pts => {
    let tramo = 0, desde = pts[0]
    const huecoEntrada = largo ? pts[0] <= entry : pts[0] >= entry
    if (llenadaAqui && !huecoEntrada) {
      const lleno = primerToque(pts, [{ nombre: 'ENTRADA', precio: entry }])
      if (!lleno) return null
      tramo = lleno.tramo; desde = lleno.punto
    } else {
      // hueco: la apertura ya esta mas alla de un nivel
      if (sl != null && (largo ? pts[0] <= sl : pts[0] >= sl)) return 'SL'
      if (tp != null && (largo ? pts[0] >= tp : pts[0] <= tp)) return 'TP'
    }
    return primerToque(pts, niveles, tramo, desde)?.nivel.nombre ?? null
  })
  // doji equidistante: lo que perjudica a la posicion (SL; si no hay SL en ningun recorrido, el TP
  // solo si lo dan todos)
  if (resultados.includes('SL')) return 'SL'
  return resultados.every(r => r === 'TP') ? 'TP' : null
}
