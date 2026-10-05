// lib/motor/costes.mjs — tabla de costes versionada (especificacion v2.1,
// § 2.4, § 12.10). costes@1: aprobada por Ramon el 5-oct-2026 tal como se
// propuso. Spread fijo por par en pips (1 pip = 10 ticks en los 9 pares),
// comision 3 USD por lote cobrada al abrir, swap 0. Una version nueva es otra
// constante: esta no se edita (sesiones fijadas a costes@1).
import { instrumento } from './instrumentos.mjs'

export const COSTES_1 = Object.freeze({
  version: 'costes@1',
  spread_pips: Object.freeze({ EURUSD: '0.3', USDJPY: '0.4', AUDUSD: '0.5', GBPUSD: '0.6', USDCHF: '0.7', USDCAD: '0.7', NZDUSD: '0.8', AUDCAD: '1.2', GBPJPY: '1.4' }),
  comision_lote_µ: 3_000_000n,
  swap_µ: 0n,
})

// spread en ticks: pips × 10 (exacto: los pips de la tabla tienen un decimal)
export function spreadTicks(costes, par) {
  const { pipTicks } = instrumento(par)
  const p = costes.spread_pips[par]
  if (!Object.hasOwn(costes.spread_pips, par) || p == null) throw new RangeError(`${costes.version}: sin spread para ${par}`)
  const m = /^(\d+)(?:\.(\d))?$/.exec(p)
  if (!m) throw new RangeError(`${costes.version}: spread no valido para ${par}: ${p}`)
  return (BigInt(m[1]) * 10n + BigInt(m[2] ?? '0')) * pipTicks / 10n
}
