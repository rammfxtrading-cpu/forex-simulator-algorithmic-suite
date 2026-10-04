/**
 * P02 · UN DIBUJO FUTURO PUEDE FORZAR MAS DE MEDIO MILLON DE BARRAS ARTIFICIALES
 *
 * Astra (4-oct): computePhantomsNeeded (lib/sessionUi.js:99) calcula una barra
 * fantasma por cada intervalo del TF hasta el punto mas lejano de los dibujos,
 * sin cota: un ancla a un año en D1 son 375 barras, y al pasar a M1, 525.610.
 * Decision del CTO (4-oct, bloque B): cota a las barras fantasma.
 *
 * Se ejecuta: computePhantomsNeeded REAL (la usan usePairData.js:130 y
 * _SessionInner.js:1037), sin asignar ningun array.
 *
 * ORACULOS, a mano. Ultima vela real: lunes 3-mar-2025 00:00 UTC. Barras
 * necesarias = ceil(distancia / TF) + 10 de colchon:
 *   · ancla a +1 dia en M1: 1.440 + 10 = 1.450 (por debajo de la cota: exacta)
 *   · ancla a +1 año en D1: 365 + 10 = 375 (exacta)
 *   · ancla a +30 dias en M1: 43.200 + 10 = 43.210 → acotada
 *   · ancla a +365 dias en M1: 525.600 + 10 = 525.610 → acotada
 * Cota elegida: 5.000 barras (M1 ≈ 3,5 dias; H1 ≈ 208 dias). Un dibujo mas
 * lejos no tiene sitio en el eje en ese TF: limite visual declarado, no un
 * crecimiento de memoria.
 */
import { titulo, ver, oraculo, fin, importa, escenario } from '../lib.mjs'
const { computePhantomsNeeded } = await importa('lib/sessionUi.js')
escenario()
const COTA = 5000
const T = Date.parse('2025-03-03T00:00:00Z') / 1000
const DIA = 86400
const dibujo = dias => [{ points: [{ timestamp: T - DIA, price: 1.1 }, { timestamp: T + dias * DIA, price: 1.2 }] }]

titulo('1 · controles: lo que cabe sigue siendo exacto')
ver('sin dibujos: 10', computePhantomsNeeded([], T, 60) === 10)
ver('ancla a +1 dia en M1: 1.450', computePhantomsNeeded(dibujo(1), T, 60) === 1450, computePhantomsNeeded(dibujo(1), T, 60))
ver('ancla a +1 año en D1: 375', computePhantomsNeeded(dibujo(365), T, DIA) === 375, computePhantomsNeeded(dibujo(365), T, DIA))

titulo('2 · lo que no cabe, acotado')
const mes = computePhantomsNeeded(dibujo(30), T, 60), anio = computePhantomsNeeded(dibujo(365), T, 60)
oraculo('P02', 'ancla a +30 dias en M1: como mucho 5.000 barras', mes <= COTA, `codigo ${mes}`)
oraculo('P02', 'ancla a +365 dias en M1: como mucho 5.000 barras', anio <= COTA, `codigo ${anio}`)
ver('control: un timestamp no numerico no cuenta', computePhantomsNeeded([{ points: [{ timestamp: 'x' }, null] }], T, 60) === 10)
fin()
