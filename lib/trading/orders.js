// lib/trading/orders.js
// Fase 6 · Corte 3 — matemática pura del subsistema de órdenes/posiciones.
// Extraído verbatim de components/_SessionInner.js, conducta-neutral. Encadena pricing.js.
//   realizePnl    : núcleo de cierre, L1352-1358 (total) ≡ L2521-2525 (parcial); lots libre.
//   priceFromPips : aritmética SL/TP por pips; L1337-1338/1440-1441/1525/1534 (6 legs, 1 pierna).
//   isFilled      : predicado de fill LIMIT, L1580 (colapsado a isLong).
//   isLongSide    : normalización side→isLong en la frontera (BUY|BUY_LIMIT → largo).
// raw: realizePnl NO redondea; el parseFloat(toFixed) se queda en la frontera impura del componente.

import { calcPnl, pipSize } from './pricing'

export const isLongSide = side => side === 'BUY' || side === 'BUY_LIMIT'

export function realizePnl({ side, entry, exit, lots, pair, initialSlPips, slPips }) {
  const pnl = calcPnl(side, entry, exit, lots, pair)
  const result = pnl > 0 ? 'WIN' : pnl < 0 ? 'LOSS' : 'BREAKEVEN'
  const slPipsForRr = initialSlPips ?? slPips
  const rrReal = slPipsForRr > 0 ? pnl / (slPipsForRr * lots * 10) : 0
  return { pnl, rrReal, result }
}

export function priceFromPips({ isLong, entry, pips, pair, leg }) {
  const pipSz = pipSize(pair)
  if (leg === 'SL') return isLong ? entry - pips * pipSz : entry + pips * pipSz
  if (leg === 'TP') return isLong ? entry + pips * pipSz : entry - pips * pipSz
}

export function isFilled({ isLong, entry, high, low }) {
  return isLong ? low <= entry : high >= entry
}
