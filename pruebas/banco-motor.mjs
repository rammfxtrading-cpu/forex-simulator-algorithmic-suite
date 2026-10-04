// EL BANCO DEL MOTOR: la pagina de sesion sin grafico, con su cableado REAL.
//   · usePairData (REAL): loadPair pide las velas por fetchSessionCandles →
//     /api/candles REAL (sobre el Storage falso), crea el ReplayEngine REAL y le
//     pone el onTick REAL (checkSLTP, checkLimitOrders, checkChallengeBreach por
//     sus refs, en ese orden: components/usePairData.js:51-58)
//   · useTradingActions (REAL): closePosition, checkSLTP, checkLimitOrders,
//     confirmLimitOrder
//   · useChallengeFlow (REAL), si la sesion es un challenge
// Las refs puente se rellenan como en components/_SessionInner.js:1141-1146.
// Lo unico copiado de _SessionInner (no se puede montar sin grafico): el alta
// de una orden a mercado del OrderModal (_SessionInner.js:1877-1880), en
// abreMercado(), y el reset de cursores del Go to (_SessionInner.js:1110-1111),
// en irA(); las pruebas que los usan comprueban antes que esas lineas siguen ahi.
import { importa, sonda, db, asienta, fuente } from './lib.mjs'
const usePairData = (await importa('components/usePairData.js')).default
const useTradingActions = (await importa('components/useTradingActions.js')).default
const useChallengeFlow = (await importa('components/useChallengeFlow.js')).default
const { nextSessionOpen } = await importa('lib/killzonesDomain.js')
const { router } = await import('./next-falso.mjs')

// Pone las velas M1 (segundos) en forex-data/<PAR>/M1/<año>.json y un [] en los
// años de contexto que pida la sesion, para que nadie llame al proveedor.
export function velasEnStorage(par, velas, anios = []) {
  const p = par.replace('/', '')
  const porAnio = {}
  for (const v of velas) (porAnio[new Date(v.time * 1000).getUTCFullYear()] ??= []).push(v)
  for (const a of anios) porAnio[a] ??= []
  for (const [a, vs] of Object.entries(porAnio)) db.storage['forex-data'][`${p}/M1/${a}.json`] = JSON.stringify(vs)
}

export async function banco({ sesion, par = sesion.pair, balance = Number(sesion.balance), userId = null }) {
  const refs = {
    pairState: { current: {} }, chartMap: { current: {} }, sessionRef: { current: sesion }, activePairRef: { current: par },
    pairTfRef: { current: { [par]: 'M1' } }, speedRef: { current: 1 },
    checkSLTPRef: { current: null }, checkLimitOrdersRef: { current: null }, checkChallengeBreachRef: { current: null },
    balanceRef: { current: balance }, userIdRef: { current: userId }, closePositionRef: { current: null },
  }
  const estado = { saldo: balance, isPlaying: false, currentTime: null }
  const nada = () => {}
  const caja = sonda(() => {
    const datos = usePairData({ id: sesion.id, session: estado.sesionVisible ?? null, activePair: estado.activa ?? null, ...refs,
      setIsPlaying: v => { estado.isPlaying = typeof v === 'function' ? v(estado.isPlaying) : v },
      setCurrentTime: v => { estado.currentTime = v }, setProgress: nada, setCurrentPrice: v => { estado.precio = v }, setDataReady: nada, setTick: nada,
      exportTools: () => '[]' })
    const reto = useChallengeFlow({ id: sesion.id, router, session: estado.sesionVisible ?? null, setSession: nada, sessionRef: refs.sessionRef,
      currentTime: estado.currentTime, pairState: refs.pairState, balanceRef: refs.balanceRef, closePositionRef: refs.closePositionRef,
      setIsPlaying: v => { estado.isPlaying = v } })
    const trading = useTradingActions({ id: sesion.id, activePair: par, currentPrice: estado.precio ?? null, currentTime: estado.currentTime,
      lots: 1, preview: estado.preview ?? null, ...refs, setBalance: v => { estado.saldo = v }, setTick: nada, setPreview: nada, setCtxMenu: nada,
      refreshChallengeStatus: reto.refreshChallengeStatus })
    return { datos, reto, trading }
  })
  const puentes = () => {
    refs.closePositionRef.current = caja.valor.trading.closePosition
    refs.checkSLTPRef.current = caja.valor.trading.checkSLTP
    refs.checkLimitOrdersRef.current = caja.valor.trading.checkLimitOrders
    refs.checkChallengeBreachRef.current = caja.valor.reto.checkChallengeBreach
  }
  const repinta = async () => { caja.repinta(); puentes(); await asienta() }
  puentes()
  // carga como la pagina: la sesion y el par activo llegan, y los efectos de usePairData cargan
  estado.sesionVisible = sesion; estado.activa = par
  await repinta(); await asienta(80); await repinta()
  const ps = () => refs.pairState.current[par]
  const motor = () => ps()?.engine
  return {
    refs, estado, caja, ps, motor, repinta,
    // _SessionInner.js:1877-1880, tal cual: la entrada es la del modal y openTime el currentTime de la pagina
    abreMercado({ side, entry, sl, tp, lots, slPips = 10, tpPips = 20 }) {
      const posId = `${Date.now()}-${Math.random().toString(36).slice(2, 5)}`
      const newPos = { id: posId, pair: par, side, entry, lots, sl, tp, slPips, tpPips, openTime: estado.currentTime, initialSlPips: slPips }
      ps().positions = [...ps().positions, newPos]
      return newPos
    },
    // la limit por la funcion REAL confirmLimitOrder (useTradingActions.js:82)
    async pendiente({ side, entry, sl, tp, lots, slPips = 10, tpPips = 30 }) {
      estado.preview = { pair: par, side, entry, sl, tp, lots, slPips, tpPips, rr: tpPips / slPips }
      await repinta()
      caja.valor.trading.confirmLimitOrder()
      estado.preview = null; await repinta()
      return ps().orders.at(-1)
    },
    // un paso de vela como handleStep (_SessionInner.js:1100): nextCandle(1)
    async paso(n = 1) { for (let i = 0; i < n; i++) { motor().nextCandle(1); await repinta() } },
    // Go to como handleGoTo (_SessionInner.js:1103-1116)
    async irA(sessKey) {
      const e = motor()
      const target = nextSessionOpen(e.candles, e.currentIndex, sessKey)
      if (!target) return null
      e.seekToTime(target.time)
      ps().lastSLTPIdx = e.currentIndex; ps().lastLimitIdx = e.currentIndex
      await repinta()
      return target
    },
  }
}

// Las lineas copiadas tienen que seguir en _SessionInner: si cambian, el banco miente.
export function copiasVigentes() {
  const s = fuente('components/_SessionInner.js')
  return {
    mercado: s.includes("const newPos={id:posId,pair:orderModal.pair,side:orderModal.side,entry:orderModal.entry,...posData,openTime:currentTime,initialSlPips:posData.slPips}"),
    irA: /e\.seekToTime\(target\.time\)[\s\S]{0,200}if\(ps\)\{ps\.lastSLTPIdx=e\.currentIndex;ps\.lastLimitIdx=e\.currentIndex\}/.test(s),
  }
}
