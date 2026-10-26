// lib/trading/orders.js
// Fase 6 · Corte 3 — matemática pura del subsistema de órdenes/posiciones.
// Extraído verbatim de components/_SessionInner.js, conducta-neutral. Encadena pricing.js.
//   realizePnl    : núcleo de cierre, L1352-1358 (total) ≡ L2521-2525 (parcial); lots libre.
//   priceFromPips : aritmética SL/TP por pips; L1337-1338/1440-1441/1525/1534 (6 legs, 1 pierna).
//   isFilled      : predicado de fill LIMIT, L1580 (colapsado a isLong).
//   isLongSide    : normalización side→isLong en la frontera (BUY|BUY_LIMIT → largo).
// raw: realizePnl NO redondea; el parseFloat(toFixed) se queda en la frontera impura del componente.

import { calcPnl, pipSize, pipValue } from './pricing'
import { alTick, alTickConPips } from '../sim/vela'

export const isLongSide = side => side === 'BUY' || side === 'BUY_LIMIT'

export function realizePnl({ side, entry, exit, lots, pair, initialSlPips, slPips }) {
  const pnl = calcPnl(side, entry, exit, lots, pair)
  const result = pnl > 0 ? 'WIN' : pnl < 0 ? 'LOSS' : 'BREAKEVEN'
  const slPipsForRr = initialSlPips ?? slPips
  const rrReal = slPipsForRr > 0 ? pnl / (slPipsForRr * lots * pipValue(pair)) : 0
  return { pnl, rrReal, result }
}

// orden 1-119: el precio sale ajustado al tick del par (1,1 − 10 pips = 1,099, no 1,0990000000000002)
// orden 1-121 (SIMMOTOR1-02): la suma o resta se hace desde el texto de la entrada y de los pips, en enteros, y se ajusta
// una sola vez (alTickConPips): 1,100005 + 30 pips = 1,10301. Una entrada o unos pips que no son numeros finitos siguen
// dando lo de antes (la cuenta en coma flotante, sin ajustar: NaN)
export function priceFromPips({ isLong, entry, pips, pair, leg }) {
  if (leg !== 'SL' && leg !== 'TP') return undefined
  const signo = (leg === 'TP') === isLong ? 1 : -1
  if (typeof entry !== 'number' || !Number.isFinite(entry) || !Number.isFinite(Number(pips)) || pips === '' || pips == null) {
    const pipSz = pipSize(pair)
    return alTick(signo > 0 ? entry + pips * pipSz : entry - pips * pipSz, pair)
  }
  return alTickConPips(entry, pips, signo, pair)
}

export function isFilled({ isLong, entry, high, low }) {
  return isLong ? low <= entry : high >= entry
}
