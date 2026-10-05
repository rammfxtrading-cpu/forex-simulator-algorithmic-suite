// lib/motor/racional.mjs — racionales exactos con BigInt (especificacion v2.1,
// § 12.5). El motor no usa coma flotante para dinero ni precios: P&L,
// conversiones y umbrales se calculan como fracciones y solo se redondean al
// final, al µUSD (lib/motor/dinero.mjs). Puro, sin dependencias.
//
// Un racional es { n, d } con d > 0 y gcd(n, d) = 1, congelado.

const abs = x => (x < 0n ? -x : x)
function mcd(a, b) { a = abs(a); b = abs(b); while (b) [a, b] = [b, a % b]; return a }

export function R(n, d = 1n) {
  if (typeof n !== 'bigint' || typeof d !== 'bigint') throw new TypeError('racional: numerador y denominador BigInt')
  if (d === 0n) throw new RangeError('racional: denominador 0')
  if (d < 0n) { n = -n; d = -d }
  const g = mcd(n, d) || 1n
  return Object.freeze({ n: n / g, d: d / g })
}
export const CERO = R(0n)
export const UNO = R(1n)

// '1.10010', '-0.25', '150' → racional exacto. Nada de notacion cientifica.
export function deDecimal(texto) {
  const t = String(texto).trim()
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(t)
  if (!m) throw new RangeError(`racional: decimal no valido: ${texto}`)
  const frac = m[3] ?? ''
  const n = BigInt(m[2] + frac) * (m[1] ? -1n : 1n)
  return R(n, 10n ** BigInt(frac.length))
}

export const suma = (a, b) => R(a.n * b.d + b.n * a.d, a.d * b.d)
export const resta = (a, b) => R(a.n * b.d - b.n * a.d, a.d * b.d)
export const por = (a, b) => R(a.n * b.n, a.d * b.d)
export const entre = (a, b) => { if (b.n === 0n) throw new RangeError('racional: division por 0'); return R(a.n * b.d, a.d * b.n) }
export const neg = a => R(-a.n, a.d)
export const compara = (a, b) => { const x = a.n * b.d - b.n * a.d; return x < 0n ? -1 : x > 0n ? 1 : 0 }
export const signo = a => (a.n < 0n ? -1 : a.n > 0n ? 1 : 0)
export const deEntero = n => R(BigInt(n))
export const aTexto = a => (a.d === 1n ? String(a.n) : `${a.n}/${a.d}`)
