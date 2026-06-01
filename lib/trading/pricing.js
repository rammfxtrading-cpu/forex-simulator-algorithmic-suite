// lib/trading/pricing.js
// Fase 6 · Corte 1a — fuente única del dominio de pricing/P&L.
// Extraído de components/_SessionInner.js (L107/L108/L116), conducta-neutral.
// pipSize: nuevo (§4.2), derivado de pipMult (1/pipMult); bit-idéntico a 0.0001/0.01.

export const isJpy   = p => p?.includes('JPY')
export const pipMult = p => isJpy(p) ? 100 : 10000
export const pipSize = p => 1 / pipMult(p)

export function calcPnl(side, entry, exit, lots, pair) {
  const pips = side === 'BUY'
    ? (exit - entry) * pipMult(pair)
    : (entry - exit) * pipMult(pair)
  return pips * lots * 10
}
