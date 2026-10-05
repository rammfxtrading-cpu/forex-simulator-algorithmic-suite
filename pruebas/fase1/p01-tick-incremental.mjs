/**
 * P01 · EL CAMINO INCREMENTAL ACABA RECONSTRUYENDO LA SERIE EN CADA TICK
 *
 * Astra (4-oct): updateChart deja 10 velas fantasma futuras tras la ultima
 * real; dentro de la misma vela del TF, applyTickUpdate hace
 * series.update(ultimaReal) (lib/chartRender.js:96). Lightweight Charts 5.1.0
 * rechaza un update con tiempo anterior al ultimo punto de la serie —la ultima
 * fantasma— (node_modules/lightweight-charts/dist/lightweight-charts.development.mjs:11364-11367:
 * «Cannot update oldest data») y el catch cae a setData de toda la historia (:110-111).
 * Una vela TF nueva tambien es rechazada (applyNewBarUpdate → catch de
 * restoreOnNewBar → applyFullRender).
 *
 * Se ejecuta: updateChart REAL de usePairData sobre el ReplayEngine REAL, con
 * un doble de serie que reproduce ESE guard de la libreria (mismo mensaje, misma
 * condicion: sin historicalUpdate, tiempo < ultimo tiempo de la serie → lanza).
 * ⚠️ El doble modela una sola regla de la libreria; no es la libreria. Lo que
 * se mide es el numero de setData, no FPS ni latencia.
 *
 * ⚠️ LIMITES (H08, revision de Astra): el grafico es un doble con UNA regla de
 *    lightweight-charts; no es la libreria, ni FPS, ni latencia. La aceptacion
 *    del render se hara contra la libreria real en navegador.
 * ORACULO: carga inicial = 1 setData; tres ticks dentro de la misma vela H1 y
 * una vela H1 nueva = 0 setData mas (solo update).
 */
import { titulo, ver, oraculo, fin, escenario, sesionSim, vela, importa, sonda, asienta } from '../lib.mjs'
const usePairData = (await importa('components/usePairData.js')).default
const ReplayEngine = (await importa('lib/replayEngine.js')).default
escenario()

// el guard de lightweight-charts 5.1.0 (_internal_updateSeriesData), y nada mas
function serieFalsa() {
  const s = { setData: 0, update: 0, rechazos: 0, ultimo: undefined,
    setDataFn(d) { s.setData++; s.ultimo = d.length ? d[d.length - 1].time : undefined },
    updateFn(bar, historicalUpdate) {
      s.update++
      if (!historicalUpdate && s.ultimo !== undefined && bar.time < s.ultimo) { s.rechazos++; throw new Error(`Cannot update oldest data, last time=${s.ultimo}, new time=${bar.time}`) }
      if (s.ultimo === undefined || bar.time > s.ultimo) s.ultimo = bar.time
    } }
  return { cuenta: s, series: { setData: d => s.setDataFn(d), update: (b, h) => s.updateFn(b, h), priceToCoordinate: () => 0 } }
}
const ts = { getVisibleLogicalRange: () => ({ from: 0, to: 50 }), setVisibleLogicalRange() {}, scrollToPosition() {} }
const { cuenta, series } = serieFalsa()
const cr = { series, chart: { timeScale: () => ts }, prevCount: 0 }

const T = Date.parse('2025-03-03T10:00:00Z') / 1000
const e = new ReplayEngine()
e.load(Array.from({ length: 70 }, (_, i) => vela(T + i * 60, 1.1 + i * 0.0001, 1.1 + i * 0.0001 + 0.0002, 1.1 + i * 0.0001 - 0.0002, 1.1 + i * 0.0001)))
const refs = { pairState: { current: {} }, chartMap: { current: { 'EUR/USD': cr } }, sessionRef: { current: sesionSim() }, activePairRef: { current: 'EUR/USD' },
  pairTfRef: { current: { 'EUR/USD': 'H1' } }, speedRef: { current: 1 }, checkSLTPRef: { current: null }, checkLimitOrdersRef: { current: null }, checkChallengeBreachRef: { current: null } }
const nada = () => {}
const caja = sonda(() => usePairData({ id: 'x', session: null, activePair: null, ...refs, setIsPlaying: nada, setCurrentTime: nada, setProgress: nada,
  setCurrentPrice: nada, setDataReady: nada, setTick: nada, exportTools: () => '[]' }))
const { updateChart } = caja.valor

titulo('1 · carga inicial en H1 (10:00–10:05)')
e.seekToTime(T + 5 * 60)
updateChart('EUR/USD', e, true)
await asienta()
ver('control: un setData inicial con la vela H1 y 10 fantasmas', cuenta.setData === 1 && cr.phantom?.length === 10, `setData ${cuenta.setData}, fantasmas ${cr.phantom?.length}`)

titulo('2 · tres ticks M1 dentro de la misma vela H1')
const antes = cuenta.setData
for (let i = 0; i < 3; i++) { e.nextCandle(1); updateChart('EUR/USD', e, false) }
ver('control: los tres ticks fueron por el camino «misma vela» (prevCount = 1 vela H1)', cr.prevCount === 1)
oraculo('P01', 'tres ticks en la misma vela: cero setData', cuenta.setData === antes, `${cuenta.setData - antes} setData de toda la serie; ${cuenta.rechazos} rechazos «Cannot update oldest data»`)

titulo('3 · una vela H1 nueva (11:00)')
e.seekToTime(T + 60 * 60 - 60); updateChart('EUR/USD', e, false)
const antes3 = cuenta.setData, rech3 = cuenta.rechazos
e.nextCandle(1); updateChart('EUR/USD', e, false)
ver('control: ahora hay dos velas H1', cr.prevCount === 2, cr.prevCount)
oraculo('P01', 'una vela nueva: cero setData', cuenta.setData === antes3, `${cuenta.setData - antes3} setData; rechazos ${cuenta.rechazos - rech3}`)
fin()
