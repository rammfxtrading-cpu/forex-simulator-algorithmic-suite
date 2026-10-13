// Lapidas y legado en el cliente de la etapa 1 (diseño sim-004, d1–d3, h.9, o.8).
// Hoy no hay ninguna: llegan con el corte (sim-004) y las RPC de sim-003.
//   lapida  terminal = 'borrada' → fuera de listados, contadores y metricas (d1).
//           Solo 'borrada': 'revocada' y, despues, 'superado' siguen visibles.
//   legado  legado = true → «Simulador anterior», solo lectura, borrar por
//           POST /api/sim/borrar (d2, d3)
export const esLapida = s => s?.terminal === 'borrada'
export const sinLapidas = lista => (lista || []).filter(s => !esLapida(s))
export const esLegado = s => s?.legado === true
export const ETIQUETA_LEGADO = 'Simulador anterior'
