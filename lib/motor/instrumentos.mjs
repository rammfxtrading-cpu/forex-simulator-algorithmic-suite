// lib/motor/instrumentos.mjs — los 9 instrumentos (especificacion v2.1, § 2.3).
// Precios en TICKS enteros (el ultimo digito cotizado) y lotes en CENTESIMAS
// enteras (paso 0,01). Puro y congelado: una version nueva no edita esta.
//
// Conversion a USD del P&L, que nace en la moneda cotizada:
//   · cotizada USD (EURUSD, GBPUSD, AUDUSD, NZDUSD): directo
//   · USD base (USDJPY, USDCHF, USDCAD): entre el precio de ese mismo par
//   · cruces (AUDCAD, GBPJPY): entre el precio de su par de conversion
//     (USDCAD, USDJPY); el motor de un instrumento no los cotiza: se pasa el
//     precio de conversion (§ 3.6: apertura en fases 1–3, cierre en la 4)
import { R, por, entre, resta } from './racional.mjs'

export const VERSION = 'instr@1'
const fx = (cotizada, digitos, conversion) => Object.freeze({ cotizada, digitos, contrato: 100000n, pipTicks: 10n, conversion })
export const INSTRUMENTOS = Object.freeze({
  EURUSD: fx('USD', 5, null), GBPUSD: fx('USD', 5, null), AUDUSD: fx('USD', 5, null), NZDUSD: fx('USD', 5, null),
  USDJPY: fx('JPY', 3, 'USDJPY'), USDCHF: fx('CHF', 5, 'USDCHF'), USDCAD: fx('CAD', 5, 'USDCAD'),
  AUDCAD: fx('CAD', 5, 'USDCAD'), GBPJPY: fx('JPY', 3, 'USDJPY'),
})

export function instrumento(par) {
  const i = INSTRUMENTOS[par]
  if (!Object.hasOwn(INSTRUMENTOS, par) || !i) throw new RangeError(`instrumento no admitido: ${par}`)
  return i
}

// '1.10010' → 110010n (exacto; fuera de la rejilla de ticks, error)
export function aTicks(par, texto) {
  const { digitos } = instrumento(par)
  const m = /^(\d+)(?:\.(\d+))?$/.exec(String(texto).trim())
  if (!m) throw new RangeError(`precio no valido: ${texto}`)
  const frac = m[2] ?? ''
  if (frac.length > digitos && /[^0]/.test(frac.slice(digitos))) throw new RangeError(`precio fuera de la rejilla de ${par}: ${texto}`)
  const t = BigInt(m[1] + frac.slice(0, digitos).padEnd(digitos, '0'))
  if (t <= 0n) throw new RangeError(`precio no positivo: ${texto}`)
  return t
}
export function deTicks(par, ticks) {
  const { digitos } = instrumento(par)
  const s = String(ticks).padStart(digitos + 1, '0')
  return `${s.slice(0, -digitos)}.${s.slice(-digitos)}`
}
// precio en ticks → racional en unidades de precio
export const precio = (par, ticks) => R(ticks, 10n ** BigInt(instrumento(par).digitos))

// '0.25' → 25n; paso 0,01, positivo
export function aCentesimas(texto) {
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(String(texto).trim())
  if (!m) throw new RangeError(`lotes no validos (paso 0,01): ${texto}`)
  const c = BigInt(m[1]) * 100n + BigInt((m[2] ?? '').padEnd(2, '0') || '0')
  if (c <= 0n) throw new RangeError(`lotes no positivos: ${texto}`)
  return c
}

// P&L en la moneda COTIZADA (racional): lado BUY gana si sube
export function pnlCotizada(par, lado, lotesC, entradaTicks, salidaTicks) {
  const { contrato } = instrumento(par)
  const unidades = R(lotesC * contrato, 100n)
  const dif = resta(precio(par, salidaTicks), precio(par, entradaTicks))
  const bruto = por(unidades, dif)
  return lado === 'BUY' ? bruto : R(-bruto.n, bruto.d)
}

// P&L en USD (racional). conversionTicks: el precio del par de conversion
// (si es el propio par y no se da, su precio de salida, como en A08)
export function pnlUSD(par, lado, lotesC, entradaTicks, salidaTicks, conversionTicks = null) {
  const i = instrumento(par)
  const q = pnlCotizada(par, lado, lotesC, entradaTicks, salidaTicks)
  if (i.conversion === null) return q
  const tc = conversionTicks ?? (i.conversion === par ? salidaTicks : null)
  if (tc == null) throw new RangeError(`${par}: falta el precio de ${i.conversion} para convertir a USD`)
  return entre(q, precio(i.conversion, tc))
}
