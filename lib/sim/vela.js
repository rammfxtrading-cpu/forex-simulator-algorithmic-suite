// La regla de la vela (decision de Ramon, orden 1-085 del CTO): por donde pasa el precio dentro de
// una vela M1, para saber que toca antes cuando la vela alcanza a la vez el SL y el TP, o cuando una
// pendiente se llena y en esa misma vela toca su SL o su TP (M04).
//   · alcista (cierre > apertura): apertura → minimo → maximo → cierre
//   · bajista (cierre < apertura): apertura → maximo → minimo → cierre
//   · doji (cierre = apertura): primero el extremo mas cercano a la apertura; si estan a la misma
//     distancia, primero lo que perjudica a la posicion (el SL)
// Igual en Step, Play y Go to (todos pasan por checkSLTP).
//
// EN ENTEROS, A UNA ESCALA COMUN (SIMVELA2-01, Astra; ordenes 1-108 y 1-117 del CTO, opcion c). Para cada vela y
// posicion, la apertura, el maximo, el minimo, el cierre, el SL, el TP y la entrada se escalan DESDE SU TEXTO decimal
// (String: el decimal mas corto que representa el numero, el mismo que llega en el JSON) a la escala comun del MAYOR
// numero de decimales que aparezca entre ellos (y nunca menos que los del par: 5 sin JPY, 3 con JPY), como enteros
// BigInt. Todas las comparaciones (que vela es, que nivel toca el recorrido) son exactas entre esos enteros.
// El doji: las dos distancias de la apertura a los extremos, exactas, se pasan a DECIMAS DE PIP del par (orden 1-100)
// redondeando la mitad hacia arriba, con aritmetica entera; gana el extremo mas cercano y, si empatan, el SL. Con
// precios de 5 y 3 decimales la escala es la del par y no hay nada que redondear. Ninguna resta en coma flotante.

import { isJpy } from '../trading/pricing'

export const decimalesDe = par => (isJpy(par) ? 3 : 5)

// el texto decimal de un precio: [signo, digitos enteros, digitos decimales]
function texto(x) {
  let s = typeof x === 'string' ? x.trim() : String(x)
  // notacion exponencial (no pasa con precios de mercado): su desarrollo decimal exacto del Number
  if (/e/i.test(s)) s = Number(s).toFixed(20).replace(/0+$/, '')
  const m = /^(-?)(\d*)(?:\.(\d*))?$/.exec(s)
  if (!m) throw new Error(`precio ilegible: ${x}`)
  return [m[1], m[2] || '0', (m[3] ?? '').replace(/0+$/, '')]
}
// precios → BigInt a la escala comun (null se queda null); devuelve { enteros, escala }
export function aEscalaComun(precios, minimo = 0) {
  const t = precios.map(x => (x == null || x === '' ? null : texto(x)))
  const escala = Math.max(minimo, ...t.filter(Boolean).map(([, , f]) => f.length))
  const enteros = t.map(v => (v ? (v[0] === '-' ? -1n : 1n) * BigInt(v[1] + v[2].padEnd(escala, '0')) : null))
  return { enteros, escala }
}
// una distancia exacta (BigInt a `escala`) en decimas de pip del par, redondeando la mitad hacia arriba
const enDecimas = (d, escala, dec) => {
  if (escala <= dec) return d * 10n ** BigInt(dec - escala)
  const u = 10n ** BigInt(escala - dec)
  return (2n * d + u) / (2n * u)
}

const BAJO_PRIMERO = v => [v.open, v.low, v.high, v.close]
const ALTO_PRIMERO = v => [v.open, v.high, v.low, v.close]

// los recorridos de una vela YA ESCALADA (BigInt): uno, o los dos si es un doji equidistante en decimas de pip
function recorridosEscalados(v, escala, dec) {
  if (v.close > v.open) return [BAJO_PRIMERO(v)]
  if (v.close < v.open) return [ALTO_PRIMERO(v)]
  const abajo = enDecimas(v.open - v.low, escala, dec), arriba = enDecimas(v.high - v.open, escala, dec)
  if (abajo < arriba) return [BAJO_PRIMERO(v)]
  if (arriba < abajo) return [ALTO_PRIMERO(v)]
  return [BAJO_PRIMERO(v), ALTO_PRIMERO(v)]
}

// los recorridos de una vela de `par`, en enteros a la escala comun de sus cuatro precios
export function recorridos(v, par) {
  const dec = decimalesDe(par)
  const { enteros: [open, high, low, close], escala } = aEscalaComun([v.open, v.high, v.low, v.close], dec)
  return recorridosEscalados({ open, high, low, close }, escala, dec)
}

// el primero de `niveles` ({ nombre, precio }, en enteros a la escala comun) que toca el recorrido `pts`, empezando en el
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
      const cmp = (x, y) => (x < y ? -1 : x > y ? 1 : 0)
      dentro.sort((x, y) => (b >= a ? cmp(x.precio, y.precio) : cmp(y.precio, x.precio)))
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
  // los siete precios a la escala comun del que mas decimales tenga (desde su texto)
  const { enteros: [open, high, low, close, sl, tp, entry], escala } = aEscalaComun([v.open, v.high, v.low, v.close, pos.sl, pos.tp, pos.entry], dec)
  // el SL y el TP como niveles; los tocados a partir de la apertura cuentan aunque el hueco los salte
  const niveles = [{ nombre: 'SL', precio: sl }, { nombre: 'TP', precio: tp }]
  const resultados = recorridosEscalados({ open, high, low, close }, escala, dec).map(pts => {
    let tramo = 0, desde = pts[0]
    const huecoEntrada = entry != null && (largo ? pts[0] <= entry : pts[0] >= entry)
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
