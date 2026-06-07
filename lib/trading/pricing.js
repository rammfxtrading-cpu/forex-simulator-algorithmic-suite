// lib/trading/pricing.js
// Fase 6 · Corte 1a — fuente única del dominio de pricing/P&L.
// Extraído de components/_SessionInner.js (L107/L108/L116), conducta-neutral.
// pipSize: nuevo (§4.2), derivado de pipMult (1/pipMult); bit-idéntico a 0.0001/0.01.
// pipValue (s63): $/pip/lote estándar por divisa cotizada; cierre 5-jun-2026.
// USD exacto; resto constante razonable (Opción A). Par desconocido -> 10 (conducta previa).

export const isJpy   = p => p?.includes('JPY')
export const pipMult = p => isJpy(p) ? 100 : 10000
export const pipSize = p => 1 / pipMult(p)

const PIP_VALUE_BY_QUOTE = { USD: 10, JPY: 6.25, CHF: 12.65, CAD: 7.20, GBP: 13.35 }
export const pipValue = p => PIP_VALUE_BY_QUOTE[(p || '').replace(/\//g, '').slice(-3)] ?? 10

export function calcPnl(side, entry, exit, lots, pair) {
  const pips = side === 'BUY'
    ? (exit - entry) * pipMult(pair)
    : (entry - exit) * pipMult(pair)
  return pips * lots * pipValue(pair)
}
