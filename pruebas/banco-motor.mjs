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
// abreMercado(), y la llamada del Go to al salto REAL (lib/sim/salto.js, orden 1-080;
// antes, el reset de cursores), en irA(); las pruebas que los usan comprueban antes
// que esas lineas siguen ahi.
import { importa, sonda, db, asienta, fuente } from './lib.mjs'
const usePairData = (await importa('components/usePairData.js')).default
const useTradingActions = (await importa('components/useTradingActions.js')).default
const useChallengeFlow = (await importa('components/useChallengeFlow.js')).default
// pieza 6 (orden 1-125): la pantalla v1, solo si la prueba la pide (banco({ v1 })); en el codigo de antes no existe
const useSesionV1 = await importa('components/useSesionV1.js').then(m => m.default, () => null)
const { nextSessionOpen } = await importa('lib/killzonesDomain.js')
// antes de la orden 1-080 (historicas.sh, contra c470c8f) no existe: irA es el Go to de entonces
const saltaA = await importa('lib/sim/salto.js').then(m => m.saltaA, () => null)
const pasoConFrontera = await importa('lib/sim/salto.js').then(m => m.pasoConFrontera ?? null, () => null)
const { router } = await import('./next-falso.mjs')
// orden 1-119: la pagina ajusta al tick lo que entra por el modal (alTick); en el codigo de antes no existe
const LINEA_MERCADO_119 = 'const newPos={id:posId,pair:orderModal.pair,side:orderModal.side,entry:entradaTick,...posData,openTime:currentTime,initialSlPips:posData.slPips}'
const alTick = fuente('components/_SessionInner.js').includes(LINEA_MERCADO_119) ? await importa('lib/sim/vela.js').then(m => m.alTick ?? null, () => null) : null

// Pone las velas M1 (segundos) en forex-data/<PAR>/M1/<año>.json y un [] en los
// años de contexto que pida la sesion, para que nadie llame al proveedor.
// { tramoAbierto: true } — RELOJ DE DATOS (bloque D, punto 4, 5-oct): los
// fixtures del motor son unas pocas velas, no un mercado completo, y una sesion
// CERRADA incompleta ya no se opera (lib/mercado/calidad.mjs). Con esta opcion
// el banco publica las velas «recien publicadas»: desplaza Date.now (sin
// pararlo: los ids de ordenes lo usan) al dia siguiente de la primera vela, asi
// la sesion es TRAMO ABIERTO y el motor ve exactamente las velas de la prueba.
// Solo cambia el reloj de pared (la ventana abierta del contrato de datos y los
// ids); el motor avanza por el tiempo de las velas. Es OPCIONAL y explicito: una
// prueba que quiere datos invalidos (c04) no debe volverse valida sin pedirlo.
const ahoraReal = Date.now.bind(Date)
export function velasEnStorage(par, velas, anios = [], { tramoAbierto = false } = {}) {
  const p = par.replace('/', '')
  const porAnio = {}
  for (const v of velas) (porAnio[new Date(v.time * 1000).getUTCFullYear()] ??= []).push(v)
  for (const a of anios) porAnio[a] ??= []
  for (const [a, vs] of Object.entries(porAnio)) db.storage['forex-data'][`${p}/M1/${a}.json`] = JSON.stringify(vs)
  if (tramoAbierto && velas.length) {
    const primera = Math.min(...velas.map(v => v.time))
    const objetivo = (Math.floor(primera / 86400) + 1) * 86400 * 1000 + 12 * 3600 * 1000   // dia siguiente, 12:00 UTC
    const desfase = objetivo - ahoraReal()
    Date.now = () => ahoraReal() + desfase
  }
}

// v1 (pieza 6): { puertos } de components/useSesionV1.js (transporte, trades, hija…): la pagina con la pantalla v1 montada
// como en _SessionInner.js (useSesionV1 con v1Ref, que reciben los tres hooks). Sin v1, v1Ref queda en null: lo de hoy.
// espia(nombre, fn): envuelve las funciones que la pagina pone en las refs puente (checkSLTP, checkLimitOrders,
// checkChallengeBreach, closePosition) para contar sus llamadas (SIMMOTOR1-01)
export async function banco({ sesion, par = sesion.pair, balance = Number(sesion.balance), userId = null, v1 = null, espia = null }) {
  const refs = {
    pairState: { current: {} }, chartMap: { current: {} }, sessionRef: { current: sesion }, activePairRef: { current: par },
    pairTfRef: { current: { [par]: 'M1' } }, speedRef: { current: 1 },
    checkSLTPRef: { current: null }, checkLimitOrdersRef: { current: null }, checkChallengeBreachRef: { current: null },
    balanceRef: { current: balance }, userIdRef: { current: userId }, closePositionRef: { current: null },
    soloLecturaRef: { current: sesion.legado === true },   // etapa 1 (d2)
    v1Ref: { current: null }, refrescaRetoRef: { current: null },
  }
  const estado = { saldo: balance, isPlaying: false, currentTime: null, bloqueos: [] }
  const nada = () => {}
  const caja = sonda(() => {
    if (v1 && useSesionV1) useSesionV1({ id: sesion.id, session: estado.sesionVisible ?? null, pairState: refs.pairState, balanceRef: refs.balanceRef,
      setBalance: v => { estado.saldo = v }, setTick: nada, v1Ref: refs.v1Ref, refrescaRetoRef: refs.refrescaRetoRef, puertos: v1.puertos })
    const datos = usePairData({ id: sesion.id, session: estado.sesionVisible ?? null, activePair: estado.activa ?? null, ...refs,
      setIsPlaying: v => { estado.isPlaying = typeof v === 'function' ? v(estado.isPlaying) : v },
      setCurrentTime: v => { estado.currentTime = v }, setProgress: nada, setCurrentPrice: v => { estado.precio = v }, setDataReady: nada, setTick: nada,
      exportTools: () => '[]', setErrorDatos: v => { estado.errorDatos = v },
      refrescaReto: ct => caja.valor?.reto?.refreshChallengeStatus(ct) })
    const reto = useChallengeFlow({ id: sesion.id, router, session: estado.sesionVisible ?? null, setSession: nada, sessionRef: refs.sessionRef,
      currentTime: estado.currentTime, pairState: refs.pairState, balanceRef: refs.balanceRef, closePositionRef: refs.closePositionRef,
      setIsPlaying: v => { estado.isPlaying = v }, v1Ref: refs.v1Ref })
    const trading = useTradingActions({ id: sesion.id, activePair: estado.activa ?? par, currentPrice: estado.precio ?? null, currentTime: estado.currentTime,
      lots: 1, preview: estado.preview ?? null, ...refs, setBalance: v => { estado.saldo = v }, setTick: nada, setPreview: nada, setCtxMenu: nada,
      // alBloqueo, como la pagina (_SessionInner.js pausaPorBloqueo): pausa TODOS los motores y apaga el Play; antes
      // solo se apuntaba y las pruebas no veian lo que hace la pausa real (SIMGOTO5-01)
      refreshChallengeStatus: reto.refreshChallengeStatus, alBloqueo: m => { estado.bloqueos.push(m); Object.values(refs.pairState.current).forEach(p => { try { p?.engine?.pause() } catch {} }); estado.isPlaying = false } })
    return { datos, reto, trading }
  })
  const es = espia ?? ((n, f) => f)
  const puentes = () => {
    refs.closePositionRef.current = es('closePosition', caja.valor.trading.closePosition)
    refs.checkSLTPRef.current = es('checkSLTP', caja.valor.trading.checkSLTP)
    refs.checkLimitOrdersRef.current = es('checkLimitOrders', caja.valor.trading.checkLimitOrders)
    refs.checkChallengeBreachRef.current = es('checkChallengeBreach', caja.valor.reto.checkChallengeBreach)
    refs.refrescaRetoRef.current = caja.valor.reto.refreshChallengeStatus
  }
  const repinta = async () => { caja.repinta(); puentes(); await asienta() }
  puentes()
  // carga como la pagina: la sesion y el par activo llegan, y los efectos de usePairData cargan
  estado.sesionVisible = sesion; estado.activa = par
  await repinta(); await asienta(80); await repinta()
  // el par activo (cambiaPar lo cambia, como la pagina: el estado y activePairRef)
  const ps = (p = estado.activa ?? par) => refs.pairState.current[p]
  const motor = (p) => ps(p)?.engine
  return {
    refs, estado, caja, ps, motor, repinta,
    // _SessionInner.js (el onConfirm del modal a mercado), tal cual: la entrada es la del modal y openTime el currentTime de
    // la pagina; desde la orden 1-119, la entrada, el SL y el TP ajustados al tick del par (alTick)
    abreMercado({ side, entry, sl, tp, lots, slPips = 10, tpPips = 20 }) {
      if (alTick) { const p = estado.activa ?? par; entry = alTick(entry, p); sl = alTick(sl, p); tp = alTick(tp, p) }
      const posId = `${Date.now()}-${Math.random().toString(36).slice(2, 5)}`
      const newPos = { id: posId, pair: estado.activa ?? par, side, entry, lots, sl, tp, slPips, tpPips, openTime: estado.currentTime, initialSlPips: slPips }
      ps().positions = [...ps().positions, newPos]
      return newPos
    },
    // la limit por la funcion REAL confirmLimitOrder (useTradingActions.js:82)
    async pendiente({ side, entry, sl, tp, lots, slPips = 10, tpPips = 30 }) {
      estado.preview = { pair: estado.activa ?? par, side, entry, sl, tp, lots, slPips, tpPips, rr: tpPips / slPips }
      await repinta()
      caja.valor.trading.confirmLimitOrder()
      estado.preview = null; await repinta()
      return ps().orders.at(-1)
    },
    // cambiar de par activo como la pagina (_SessionInner.js:574 y el efecto de usePairData): el
    // nuevo se carga o, si ya estaba, se pone al dia con el tiempo maestro (orden 1-081)
    async cambiaPar(p) {
      estado.activa = p; refs.activePairRef.current = p; refs.pairTfRef.current[p] ??= 'M1'
      await repinta(); await asienta(80); await repinta()
    },
    // un paso de vela como handleStep (_SessionInner.js:1100): nextCandle(1)
    // un paso de vela como handleStep (orden 1-087): pasoConFrontera (una vela y la frontera economica del
    // salto); sin lib/sim/salto.js (el codigo auditado), el de entonces: nextCandle(1)
    // SGR6-01: como la pagina, primero al dia con el maestro si una pausa corto la puesta al dia (ponAlDia)
    async paso(n = 1) {
      for (let i = 0; i < n; i++) {
        const pon = caja.valor.datos.ponAlDia
        if (pon && !(await pon(estado.activa))) { await repinta(); continue }
        if (pasoConFrontera) await pasoConFrontera({ engine: motor(), sid: sesion.id, pairState: refs.pairState, esReto: !!refs.sessionRef.current?.challenge_type, refresca: caja.valor.reto.refreshChallengeStatus })
        else motor().nextCandle(1)
        await repinta()
      }
    },
    // Go to como handleGoTo (_SessionInner.js): el salto REAL vela a vela (orden 1-080); sin
    // lib/sim/salto.js, el de antes: un seekToTime y el reset de cursores
    async irA(sessKey) {
      const e = motor()
      const pon = caja.valor.datos.ponAlDia
      if (pon && !(await pon(estado.activa))) { await repinta(); return null }
      const target = nextSessionOpen(e.candles, e.currentIndex, sessKey)
      if (!target) return null
      if (!saltaA) {
        e.seekToTime(target.time)
        ps().lastSLTPIdx = e.currentIndex; ps().lastLimitIdx = e.currentIndex
        await repinta()
        return target
      }
      const llego = await saltaA({ engine: e, hasta: target.time, sid: sesion.id, pairState: refs.pairState,
        esReto: !!refs.sessionRef.current?.challenge_type, refresca: caja.valor.reto.refreshChallengeStatus })
      await repinta()
      return { ...target, llego }
    },
  }
}

// Las lineas copiadas tienen que seguir en _SessionInner: si cambian, el banco miente.
export function copiasVigentes() {
  const s = fuente('components/_SessionInner.js')
  return {
    mercado: s.includes(LINEA_MERCADO_119) ? /const posData=\{\.\.\.posDatos, sl:alTick\(posDatos\.sl,orderModal\.pair\), tp:alTick\(posDatos\.tp,orderModal\.pair\)\}\s*const entradaTick=alTick\(orderModal\.entry,orderModal\.pair\)/.test(s) && !!alTick
      : s.includes("const newPos={id:posId,pair:orderModal.pair,side:orderModal.side,entry:orderModal.entry,...posData,openTime:currentTime,initialSlPips:posData.slPips}"),
    paso: pasoConFrontera ? s.includes('await pasoConFrontera({engine:e,sid:id,pairState,esReto:!!sessionRef.current?.challenge_type,refresca:refreshChallengeStatus})') : /e\.nextCandle\(1\)/.test(s),
    irA: saltaA
      ? s.includes('await saltaA({engine:e,hasta:target.time,sid:id,pairState,esReto:!!sessionRef.current?.challenge_type,refresca:refreshChallengeStatus})') && !/lastSLTPIdx=e\.currentIndex/.test(s)
      : /e\.seekToTime\(target\.time\)[\s\S]{0,200}if\(ps\)\{ps\.lastSLTPIdx=e\.currentIndex;ps\.lastLimitIdx=e\.currentIndex\}/.test(s),
  }
}
