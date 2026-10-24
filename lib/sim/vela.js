// La regla de la vela (decision de Ramon, orden 1-085 del CTO): por donde pasa el precio dentro de
// una vela M1, para saber que toca antes cuando la vela alcanza a la vez el SL y el TP, o cuando una
// pendiente se llena y en esa misma vela toca su SL o su TP (M04).
//   · alcista (cierre > apertura): apertura → minimo → maximo → cierre
//   · bajista (cierre < apertura): apertura → maximo → minimo → cierre
//   · doji (cierre = apertura): primero el extremo mas cercano a la apertura; si estan a la misma
//     distancia, primero lo que perjudica a la posicion (el SL)
// Igual en Step, Play y Go to (todos pasan por checkSLTP).
//
// ORDEN 1-119 DEL CTO (lo mismo que el motor v1, lib/motor/vela.mjs):
//   · AJUSTE AL TICK: un precio fuera de la rejilla del par (5 decimales sin JPY, 3 con JPY) no se rechaza: se ajusta
//     al tick mas cercano, como TradingView, desde su texto y en enteros, la mitad hacia arriba (aTickDelPar). Todas las
//     comparaciones son entre ticks enteros: una decima de pip = un tick, no hay nada mas que redondear.
//   · UN CAMINO POR VELA Y PAR para todas las posiciones (rutaComun). Con un doji equidistante: el camino en que salta
//     un SL de alguna; si salta en los dos o en ninguno, el peor para la cartera del par (equity minima desde el cierre
//     previo; a igualdad, la del cierre; a igualdad, O→L→H→C). Con una posicion es lo de antes (SL si algun recorrido da
//     SL); con coberturas, ya no salen las dos en SL (CAMBIO VISIBLE, solo en ese caso).
//
// EN ENTEROS (SIMVELA2-01, Astra; ordenes 1-108 y 1-117, opcion c; desde la 1-119, sobre el precio AJUSTADO al tick):
// los precios se pasan desde su texto decimal a ticks enteros BigInt; el doji compara las distancias en decimas de pip
// (enDecimas, con la escala del par es la identidad); ninguna resta en coma flotante. aEscalaComun queda para quien
// quiera la escala comun sin ajustar (ya no lo usa la regla).

import { isJpy } from '../trading/pricing'

export const decimalesDe = par => (isJpy(par) ? 3 : 5)

// un precio (numero o texto) → ticks enteros del par, al tick mas cercano, la mitad hacia arriba (orden 1-119)
export function aTickDelPar(x, par) {
  const dec = decimalesDe(par)
  const [sg, e, f] = texto(x)
  const t = BigInt(e + f.padEnd(dec, '0').slice(0, dec)) + (f.length > dec && f[dec] >= '5' ? 1n : 0n)
  return sg === '-' ? -t : t
}
// el mismo precio, ajustado, como numero (para guardar lo que entra por la interfaz: tiradores, ordenes, preview)
export function alTick(x, par) {
  if (x == null || x === '' || !Number.isFinite(Number(x))) return x
  const dec = decimalesDe(par), t = aTickDelPar(x, par), neg = t < 0n
  const s = (neg ? -t : t).toString().padStart(dec + 1, '0')
  return Number(`${neg ? '-' : ''}${s.slice(0, -dec)}.${s.slice(-dec)}`)
}

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

const enTicks = (v, par) => ({ open: aTickDelPar(v.open, par), high: aTickDelPar(v.high, par), low: aTickDelPar(v.low, par), close: aTickDelPar(v.close, par) })
// los recorridos de una vela de `par`, en ticks del par (ajustados)
export function recorridos(v, par) {
  const dec = decimalesDe(par)
  return recorridosEscalados(enTicks(v, par), dec, dec)
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
// ruta (orden 1-119): 'A' (O→H→L→C) o 'B' (O→L→H→C) fuerza el camino de un doji equidistante (el de rutaComun)
export function cierreEnVela(pos, v, { llenadaAqui = false, par = pos.pair, ruta = null } = {}) {
  const dec = decimalesDe(par)
  const largo = pos.side === 'BUY'
  // los siete precios ajustados al tick del par (desde su texto)
  const aj = x => (x == null || x === '' ? null : aTickDelPar(x, par))
  const { open, high, low, close } = enTicks(v, par), sl = aj(pos.sl), tp = aj(pos.tp), entry = aj(pos.entry)
  // el SL y el TP como niveles; los tocados a partir de la apertura cuentan aunque el hueco los salte
  const niveles = [{ nombre: 'SL', precio: sl }, { nombre: 'TP', precio: tp }]
  let rutas = recorridosEscalados({ open, high, low, close }, dec, dec)
  if (ruta && rutas.length === 2) rutas = [ruta === 'A' ? ALTO_PRIMERO({ open, high, low, close }) : BAJO_PRIMERO({ open, high, low, close })]
  const resultados = rutas.map(pts => {
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

// ── un camino por vela y par (orden 1-119) ────────────────────────────────────────
// la equity del par por un camino, tick a tick, con todas las posiciones (las pendientes, desde su llenado), en ticks ×
// centesimas de lote (lineal, sin conversion ni comision): → { minimo, cierre }
function caminaEquity(pts, previo, poss) {
  const st = poss.map(p => ({ ...p, abierta: !p.pendiente, cerrada: false, ent: p.pendiente ? null : p.entry, sal: null }))
  const sg = p => (p.largo ? 1n : -1n)
  const eq = x => st.reduce((a, p) => a + (p.cerrada ? sg(p) * (p.sal - p.ent) * p.lotes : p.abierta ? sg(p) * (x - p.ent) * p.lotes : 0n), 0n)
  const toca = (p, x) => (p.sl != null && (p.largo ? x <= p.sl : x >= p.sl)) || (p.tp != null && (p.largo ? x >= p.tp : x <= p.tp))
  let minimo = eq(previo)
  const en = x => {
    for (const p of st) if (p.abierta && !p.cerrada && toca(p, x)) { p.cerrada = true; p.sal = x }
    for (const p of st) if (!p.abierta && (p.largo ? x <= p.entry : x >= p.entry)) { p.abierta = true; p.ent = x; if (toca(p, x)) { p.cerrada = true; p.sal = x } }
    const q = eq(x); if (q < minimo) minimo = q
  }
  en(pts[0])
  for (let k = 1; k < 4; k++) { const a = pts[k - 1], b = pts[k], s = b > a ? 1n : -1n; for (let x = a; x !== b;) { x += s; en(x) } }
  return { minimo, cierre: eq(pts[3]) }
}
// el camino comun de una vela de `par` para TODAS sus posiciones: null si la vela lo decide sola (no es un doji
// equidistante); 'A' o 'B' si lo es. posiciones: { side, entry, sl, tp, lots, llenadaAqui }; previo: el cierre anterior
export function rutaComun(posiciones, v, { par, previo = null } = {}) {
  const dec = decimalesDe(par), t = enTicks(v, par)
  if (recorridosEscalados(t, dec, dec).length === 1 || !posiciones.length) return null
  const conSL = r => posiciones.some(p => cierreEnVela(p, v, { llenadaAqui: !!p.llenadaAqui, par, ruta: r }) === 'SL')
  const a = conSL('A'), b = conSL('B')
  if (a !== b) return a ? 'A' : 'B'
  const aj = x => (x == null || x === '' ? null : aTickDelPar(x, par))
  const poss = posiciones.map(p => ({ largo: p.side === 'BUY', pendiente: !!p.llenadaAqui, entry: aj(p.entry), sl: aj(p.sl), tp: aj(p.tp), lotes: BigInt(Math.round(Number(p.lots) * 100)) }))
  const pv = previo == null ? t.open : aj(previo)
  const A = caminaEquity(ALTO_PRIMERO(t), pv, poss), B = caminaEquity(BAJO_PRIMERO(t), pv, poss)
  return A.minimo < B.minimo ? 'A' : B.minimo < A.minimo ? 'B' : A.cierre < B.cierre ? 'A' : 'B'
}
// SL, TP o null de cada posicion, con el camino comun
export function cierresEnVela(posiciones, v, { par, previo = null } = {}) {
  const ruta = rutaComun(posiciones, v, { par, previo })
  return posiciones.map(p => cierreEnVela(p, v, { llenadaAqui: !!p.llenadaAqui, par, ruta }))
}
