/**
 * components/useChallengeFlow.js — dominio challenge de la página de sesión (Fase 7, Corte D, s59).
 *
 * Extraído 1:1 de components/_SessionInner.js (baseline 2243, md5 5b5db504): estado y refs del
 * challenge, lockout derivado, fetch de status (con reset de DD por día Madrid), detector de
 * eventos que abre modales, collectOpenPositions, advance pass/fail, CTA FTMO y navegación,
 * y checkChallengeBreach (detector intra-vela estilo FTMO sobre resolveBreach).
 * API devuelta con los MISMOS nombres que usaba SessionPage: ningún call-site cambia.
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import { getMasterTime } from '../lib/sessionData'
import { calcPnl } from '../lib/trading/pricing'
import { resolveBreach } from '../lib/trading/breach'
import { encola, esperaCola, cierresPendientes, levantaBarrera, bajaBarrera, posicionOcupada } from '../lib/sim/cola'
import { inciertosDe } from '../lib/sim/servicio'
import { avisa } from '../lib/sim/avisos'
import { conPlazo, VENCIDO } from '../lib/sim/plazo'

// CAS de challenge/advance: cuantas veces se vuelve a pasar por la barrera tras un 409, y
// la espera antes de cada reintento: corta y creciente (ESPERA_FASE_MS, luego el doble)
export const INTENTOS_FASE = 3
export const ESPERA_FASE_MS = 250

export default function useChallengeFlow({ id, router, session, setSession, sessionRef, currentTime, pairState, balanceRef, closePositionRef, setIsPlaying, v1Ref }){
  const currentTimeRef = useRef(null) // timestamp de la vela actual del simulador (unix segundos). Se usa en refreshChallengeStatus.
  const lastMadridDayRef = useRef(null) // ultimo dia Madrid detectado para evitar refetch en cada tick
  const [challengeStatus, setChallengeStatus] = useState(null) // FTMO-style: {session,config,evaluation} o null si no es challenge
  // Ref espejo del state — el detector de breach intra-vela necesita leerlo
  // dentro del onTick del engine (que NO se re-suscribe a cada cambio de state).
  const challengeStatusRef = useRef(null)
  // Flag que indica que YA se está procesando un breach en este tick para
  // evitar disparos duplicados (el modal solo se debe abrir una vez).
  const challengeBreachFiringRef = useRef(false)
  // Challenge modal state — qué modal mostrar (null = ninguno)
  // 'passed_phase' = pasaste fase intermedia, 'passed_all' = clímax, 'failed' = quemado
  const [challengeModal, setChallengeModal] = useState(null)
  const [challengeAdvancing, setChallengeAdvancing] = useState(false)
  // Para evitar mostrar el modal cada vez que se refresca status mientras el alumno
  // todavía no ha cerrado el modal — solo mostrar la primera vez que detectamos el evento.
  const challengeModalShownRef = useRef(false)

  // Challenge lockout: derivado calculado lo más arriba posible para que esté disponible
  // en TODOS los hooks (useEffect del keydown, useCallback, etc.) sin problemas TDZ.
  // No permite abrir nuevas operaciones, dibujar, ni avanzar el replay si:
  //   - La sesión ya está cerrada en BD (passed_phase / passed_all / failed_dd_*)
  //   - El motor detectó un evento terminal en runtime (target_reached / failed_dd_*)
  // Posiciones abiertas pueden seguir cerrándose normalmente (SL/TP o manual).
  const sessionStatus = session?.status || 'active'
  const evalStatus = challengeStatus?.evaluation?.status
  const challengeLocked = (
    sessionStatus === 'failed_dd_daily' ||
    sessionStatus === 'failed_dd_total' ||
    sessionStatus === 'passed_phase' ||
    sessionStatus === 'passed_all' ||
    evalStatus === 'target_reached' ||
    evalStatus === 'failed_dd_daily' ||
    evalStatus === 'failed_dd_total'
  )

  // Sincronización por render — espejos que el onTick del engine lee sin re-suscribirse.
  currentTimeRef.current = currentTime
  challengeStatusRef.current = challengeStatus

  // Reset del flag breach al cambiar de sesión (por si se reabre).
  useEffect(() => {
    challengeBreachFiringRef.current = false
  }, [id])

  // ── Challenge: fetch status helper ───────────────────────────────────────────
  // Se llama al cargar sesion y despues de cada trade cerrado.
  // Si la sesion no es un challenge (session.challenge_type == null), no hace nada.
  // Etapa 1, ronda 2 (CTO 13-oct, Astra E1-04): el refresco es una operacion de la
  // COLA de la sesion (lib/sim/cola.js): va detras de los cierres ya pedidos.
  // refrescaAhora es el cuerpo, para usarlo DENTRO de una operacion de la cola.
  // ct (opcional): la hora con la que se evalua; el salto del Go to (lib/sim/salto.js) pasa la
  // de la vela en curso, que el estado de React aun no tiene (orden 1-080)
  const refrescaAhora = useCallback(async (ctSalto) => {
    if (!id || !sessionRef.current?.challenge_type) return null
    // modo v1 (pieza 6): el reto es el del estado confirmado del servidor (lib/sim/v1/hud.js), sin /api/challenge/status
    if (v1Ref?.current) {
      const data = v1Ref.current.estadoReto()
      if (!data) return null
      setChallengeStatus(data)
      challengeStatusRef.current = data
      const s = data.session
      setSession(prev => prev ? { ...prev, status: s.status, balance: s.balance, challenge_phase: s.challenge_phase } : prev)
      if (sessionRef.current) sessionRef.current = { ...sessionRef.current, status: s.status, balance: s.balance, challenge_phase: s.challenge_phase }
      return data
    }
    try {
      // Pasamos currentTime del simulador: así el motor sabe qué día es HOY en el backtest.
      // El DD diario se resetea en el día Madrid de esta vela, no de la fecha real del ordenador.
      // Leemos currentTimeRef (state de React, se inicializa al cargar el engine).
      // Fallback adicional a getMasterTime() por si acaso.
      const ct = (Number.isFinite(ctSalto) ? ctSalto : null)
        || currentTimeRef.current
        || getMasterTime()
        || null
      const qs = ct ? `?session_id=${id}&current_time=${ct}` : `?session_id=${id}`
      // orden 1-117: con plazo (lib/sim/plazo.js); sin respuesta, como un fallo: null
      const res = await conPlazo(fetch(`/api/challenge/status${qs}`))
      if (res === VENCIDO || !res.ok) return null
      const data = await conPlazo(res.json())
      if (data === VENCIDO) return null
      setChallengeStatus(data)
      // el espejo, ya: el breach de la vela siguiente del salto lo lee sin esperar al render
      challengeStatusRef.current = data
      // Actualizamos también el state `session` con el status vivo de BD.
      // Sin esto, sessionStatus quedaba congelado en 'active' aunque el motor
      // hubiera persistido 'failed_dd_daily' — y challengeLocked solo se
      // activaba parcialmente (vía evalStatus). Tras cualquier breach o pase
      // de fase, esto garantiza que session.status refleje el estado real.
      if (data?.session?.status) {
        setSession(prev => prev ? { ...prev, status: data.session.status, balance: data.session.balance, challenge_phase: data.session.challenge_phase } : prev)
        if (sessionRef.current) {
          sessionRef.current = { ...sessionRef.current, status: data.session.status, balance: data.session.balance, challenge_phase: data.session.challenge_phase }
        }
      }
      return data
    } catch (e) {
      console.error('[challenge/status] error', e)
      return null
    }
  }, [id])
  const refreshChallengeStatus = useCallback((ct) => {
    if (!id || !sessionRef.current?.challenge_type) return Promise.resolve(null)
    return encola(id, () => refrescaAhora(ct))
  }, [id, refrescaAhora])

  // La confirmacion explicita del reto (E1-04): se cierra la cola a cierres nuevos
  // (barrera), se espera a que se vacie, y sin inciertos se REEVALUA con
  // challenge/status en la cola. Dentro de esa misma operacion, dentro(data) decide
  // (p. ej. manda el paso de fase). Devuelve { data, valor } o null si quedan inciertos.
  const confirmaReto = useCallback(async (dentro) => {
    if (!id) return null
    levantaBarrera(id)
    try {
      await esperaCola(id)
      if (inciertosDe(id) > 0) {
        avisa('Hay un cierre sin confirmar: el reto no se decide hasta saber si se guardó.')
        return null
      }
      return await encola(id, async () => {
        const data = await refrescaAhora()
        return { data, valor: dentro ? await dentro(data) : null }
      })
    } finally {
      bajaBarrera(id)
    }
  }, [id, refrescaAhora])

  // Fetch inicial cuando la sesion ya cargo y es un challenge
  useEffect(() => {
    if (session?.challenge_type) refreshChallengeStatus()
  }, [session?.id, session?.challenge_type, refreshChallengeStatus])

  // Refrescar el HUD cuando cambia el DIA MADRID del simulador.
  // Sin esto, si avanzas velas sin cerrar trades, el HUD se queda en el ultimo valor
  // y no muestra el reset del DD diario al cambiar de dia.
  useEffect(() => {
    if (!session?.challenge_type || !currentTime) return
    // Solo refresca al cruzar frontera de día Madrid, no en cada tick (seria spam)
    try {
      const madridFmt = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/Madrid',
        year: 'numeric', month: '2-digit', day: '2-digit',
      })
      const currentDay = madridFmt.format(new Date(currentTime * 1000))
      if (currentDay !== lastMadridDayRef.current) {
        lastMadridDayRef.current = currentDay
        refreshChallengeStatus()
      }
    } catch {}
  }, [currentTime, session?.challenge_type, refreshChallengeStatus])

  // Detector de eventos challenge — abre el modal correspondiente cuando el motor
  // detecta target_reached, failed_dd_daily o failed_dd_total.
  // Solo abre la PRIMERA vez para no spamear si el alumno ignora el modal.
  // Se resetea al avanzar/fallar (cambia session.id) o al desmontar.
  //
  // GUARD CRÍTICO: tras un transition (passed_phase → nueva sesión Fase 2),
  // challengeStatus puede contener datos residuales de la sesión anterior durante
  // un instante mientras refreshChallengeStatus() aún no terminó. Si actuamos
  // sobre esos datos, abrimos un modal "Has pasado" en una sesión que no ha pasado.
  // Por eso exigimos que challengeStatus.session.id === id (id de la URL actual).

  // Reset del estado de modal al cambiar de sesión (Next.js puede reutilizar el
  // componente entre rutas /session/[id], lo que mantendría refs vivos).
  useEffect(() => {
    challengeModalShownRef.current = false
    setChallengeModal(null)
  }, [id])

  useEffect(() => {
    if (!challengeStatus?.evaluation) return
    if (challengeModalShownRef.current) return
    if (challengeModal) return // ya hay modal abierto

    // Guard race condition: el status debe corresponder a la sesión que estamos viendo.
    // Si no, ignoramos hasta que llegue el refresh con los datos correctos.
    if (challengeStatus.session?.id && challengeStatus.session.id !== id) return

    const evalStatus = challengeStatus.evaluation.status
    const sessStatus = challengeStatus.session?.status

    // Si la sesión ya está CERRADA en BD (passed_phase, passed_all, failed_*),
    // el alumno ya vio el modal cuando ocurrió el evento. Al re-entrar para revisar
    // el chart histórico, NO le interrumpimos con el modal otra vez. Los bloqueos
    // del Paso 3 (botones, replay, dibujos) ya impiden cualquier acción que pueda
    // alterar el resultado. El alumno solo viene a leer el pasado.
    if (sessStatus === 'passed_all'
        || sessStatus === 'passed_phase'
        || sessStatus === 'failed_dd_daily'
        || sessStatus === 'failed_dd_total') {
      return
    }

    // E1-04: con cierres pendientes o inciertos no se ofrece nada: el refresco que
    // vaya detras del ultimo cierre lo volvera a mirar con todos
    if (cierresPendientes(id) > 0 || inciertosDe(id) > 0) return

    // Si la sesión está active pero el motor detectó evento EN RUNTIME, abrir modal.
    // Este es el momento clímax — el alumno acaba de cerrar el trade que cruzó target,
    // o el SL que quemó el challenge. La primera vez que ocurre sí merece celebración
    // (o disociación, si es fail).
    if (evalStatus === 'target_reached') {
      const isLastPhase = (challengeStatus.session?.challenge_phase || 1)
                          >= (challengeStatus.config?.phases || 1)
      setChallengeModal(isLastPhase ? 'passed_all' : 'passed_phase')
      challengeModalShownRef.current = true
      return
    }
    if (evalStatus === 'failed_dd_daily' || evalStatus === 'failed_dd_total') {
      setChallengeModal('failed')
      challengeModalShownRef.current = true
      return
    }
  }, [challengeStatus, challengeModal, id])

  // B1: recolecta posiciones vivas de todos los pares para enviarlas al backend
  // en el momento del cierre de fase. El servidor las descarta sin persistir
  // (doctrina "fase nueva = virgen"). Se envían solo para trazabilidad/logs.
  const collectOpenPositions = () => {
    const out = []
    Object.entries(pairState.current).forEach(([pair, ps]) => {
      if (!ps?.positions?.length) return
      ps.positions.forEach(p => {
        out.push({
          position_id: p.id,
          pair,
          side: p.side,
          entry_price: p.entry,
          lots: p.lots,
          opened_at: p.openTime
            ? new Date(p.openTime * 1000).toISOString()
            : null,
        })
      })
    })
    return out
  }

  // Llamada al endpoint /api/challenge/advance.
  // outcome='pass' o 'fail' según contexto. Devuelve el nextSession (si aplica).
  const callChallengeAdvance = useCallback(async (outcome) => {
    if (!id) return null
    try {
      const res = await fetch('/api/challenge/advance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: id,
          outcome,
          end_timestamp: getMasterTime(),   // B4: endTime real del cierre, fuente de verdad cliente
          open_positions: collectOpenPositions(),   // B1: flotantes vivos en el momento del cierre, servidor los descarta
        }),
      })
      const data = await res.json()
      // CAS del servidor (CTO 13-oct): el saldo cambio entre su lectura y su escritura
      if (res.status === 409 && data?.code === 'saldo_cambiado') return { saldoCambiado: true }
      if (!res.ok) {
        console.error('[challenge/advance] error:', data?.error || res.statusText)
        return null
      }
      return data
    } catch (e) {
      console.error('[challenge/advance] fetch failed', e)
      return null
    }
  }, [id])

  // E1-04: el paso de fase (pass o fail) solo se manda tras la confirmacion
  // explicita: cola cerrada a cierres nuevos, vacia, sin inciertos y el reto
  // REEVALUADO con todos los cierres guardados. Si ya no esta en ese punto, no se
  // manda, se cierra el modal y se avisa.
  // Si el servidor responde 409 «saldo_cambiado» (CAS: otra pestaña guardo un
  // cierre entre su lectura y su escritura), se espera un poco (creciente) y se
  // vuelve a pasar por la barrera: vaciar la cola y RELEER el reto (y su saldo)
  // con challenge/status antes de reintentar; el servidor relee la sesion en cada
  // llamada. Como mucho INTENTOS_FASE veces, y despues se avisa (CTO 13-oct).
  const decideFase = useCallback(async (outcome) => {
    if (!id) return null
    setChallengeAdvancing(true)
    try {
      for (let intento = 0; intento < INTENTOS_FASE; intento++) {
        if (intento > 0) await new Promise(r => setTimeout(r, ESPERA_FASE_MS * 2 ** (intento - 1)))
        const r = await confirmaReto(async (st) => {
          const ev = st?.evaluation?.status
          const vale = outcome === 'pass' ? ev === 'target_reached' : (ev === 'failed_dd_daily' || ev === 'failed_dd_total')
          if (!vale) {
            challengeModalShownRef.current = false
            setChallengeModal(null)
            avisa(st ? 'Con todos tus cierres guardados, el reto ya no está en ese punto: sigue operando.' : 'No se ha podido comprobar el reto. Inténtalo de nuevo.')
            return null
          }
          return await callChallengeAdvance(outcome)
        })
        if (r?.valor?.saldoCambiado) continue
        return r?.valor ?? null
      }
      avisa('El saldo de la sesión ha cambiado mientras se decidía la fase. Inténtalo de nuevo.')
      return null
    } finally {
      setChallengeAdvancing(false)
    }
  }, [id, confirmaReto, callChallengeAdvance])

  // Handlers compartidos por los modales
  const handleChallengePass = useCallback(async () => {
    // modo v1: /api/sim/avanzar-fase (el servidor decide si la fase esta superada); a la hija, si la hay
    if (v1Ref?.current) {
      setChallengeAdvancing(true)
      try {
        const r = await v1Ref.current.pasaFase()
        if (r?.hija) { router.push(`/session/${r.hija}`); return }
        if (r?.conclusion !== 'confirmado') { challengeModalShownRef.current = false; setChallengeModal(null); avisa('No se ha podido pasar de fase. Inténtalo de nuevo.') }
        await refreshChallengeStatus()
      } finally { setChallengeAdvancing(false) }
      return
    }
    const data = await decideFase('pass')
    if (!data) return
    if (data.action === 'phase_passed' && data.next_session?.id) {
      // Redirect a la nueva sesión de la siguiente fase
      router.push(`/session/${data.next_session.id}`)
    } else if (data.action === 'challenge_completed') {
      // Solo persistimos en BD. El modal handler decide qué hacer luego.
      // Refrescar status local para reflejar passed_all
      await refreshChallengeStatus()
    }
  }, [decideFase, router, refreshChallengeStatus])

  const handleChallengeFail = useCallback(async () => {
    // modo v1: el breach ya lo confirmo el servidor; no hay nada que mandar
    if (v1Ref?.current) { await refreshChallengeStatus(); return }
    const data = await decideFase('fail')
    if (!data) return
    await refreshChallengeStatus()
  }, [decideFase, refreshChallengeStatus])

  // CTA "Comenzar Challenge Real" — abre afiliado FTMO en pestaña nueva
  const handleCtaRealChallenge = useCallback(() => {
    const ftmoAffiliateUrl = 'https://trader.ftmo.com/?affiliates=VQiFmiFmoBxymSRKPBtl'
    if (typeof window !== 'undefined') {
      window.open(ftmoAffiliateUrl, '_blank', 'noopener,noreferrer')
    }
  }, [])

  // Volver al dashboard / empezar nuevo challenge
  const handleGoToDashboard = useCallback(() => {
    router.push('/dashboard')
  }, [router])

  const handleGoToNewChallenge = useCallback(() => {
    router.push('/dashboard') // El dashboard tiene el botón para empezar challenge nuevo
  }, [router])

  // ── Challenge breach detector (FTMO-style) ─────────────────────────────────
  // Para cada vela en el rango [fromIdx, curIdx]:
  //   1. Calcula el peor floating PnL posible en la vela usando high/low por posición.
  //   2. Suma con el realizado total + floating de OTROS pares.
  //   3. Si esa suma cruza el cap diario o total, el alumno ha quemado el challenge.
  //   4. Calcula el PRECIO EXACTO donde se cruza el cap (fórmula lineal).
  //   5. Cierra todas las posiciones a ese precio. Reason = 'DD_BREACH'.
  //   6. Setea un flag para abrir el modal de fail tras el render.
  //
  // Notas:
  // - Solo opera sobre posiciones del pair actual (las del tick). Posiciones de
  //   otros pares se cuentan a su PnL "actual" (último precio cerrado), porque
  //   sus propios ticks ya cerrarán por su lado si su vela las quema.
  // - Si hay múltiples posiciones del mismo par, la fórmula combinada sigue
  //   siendo lineal (suma de pnl-por-precio de cada una), así que la solución
  //   sigue siendo cerrada — no necesita búsqueda binaria.
  const checkChallengeBreach = useCallback((pair, engine) => {
    const sess = sessionRef.current
    if (v1Ref?.current) return
    if (!sess?.challenge_type) return
    // Si el challenge ya está terminado (failed/passed), no recheckar.
    const cs = challengeStatusRef.current
    if (cs?.evaluation?.status && cs.evaluation.status !== 'active' && cs.evaluation.status !== 'target_reached') return
    // Si ya se disparó un breach en este tick previo, no recalcular.
    if (challengeBreachFiringRef.current) return

    const ps = pairState.current[pair]
    if (!ps?.positions?.length) return

    const cfg = cs?.config
    if (!cfg) return
    const capital = Number(sess.capital)
    if (!(capital > 0)) return

    // Cap total absoluto (suelo fijo desde capital inicial).
    const ddTotalCapUSD = capital * (cfg.dd_total_pct / 100)
    // Cap diario relativo (startOfDayBalance × dd_daily_pct).
    // Como aproximación segura usamos lo que el HUD ya calculó (ddDailyCapUSD).
    // Si no está disponible, usamos capital × pct como conservador.
    const ddDailyCapUSD = cs?.evaluation?.ddDailyCapUSD || (capital * (cfg.dd_daily_pct / 100))
    // PnL realizado del DÍA actual: lo que el HUD ya calculó (ddDailyCurrentUSD
    // representa la caída ya producida hoy).
    const ddDailyAlreadyUSD = cs?.evaluation?.ddDailyCurrentUSD || 0
    // PnL realizado total desde capital inicial: balance actual - capital.
    const realizedDelta = balanceRef.current - capital
    // Floating de OTROS pares (no el del tick): suma de su unrealized actual
    // usando el último close del candle actual del engine. No el high/low —
    // esos pares tienen sus propios ticks que detectarán su breach localmente.
    let floatingOtherPairs = 0
    Object.entries(pairState.current).forEach(([k, ps2]) => {
      if (k === pair || !ps2?.positions?.length || !ps2.engine) return
      const candles = ps2.engine.candles || []
      const idx2 = ps2.engine.currentIndex
      const lastCandle = candles[idx2]
      const lastPrice = lastCandle?.close ?? ps2.positions[0].entry
      ps2.positions.forEach(p => {
        if (posicionOcupada(id, p.id)) return   // con su cierre en curso, como arriba
        floatingOtherPairs += calcPnl(p.side, p.entry, lastPrice, p.lots, k)
      })
    })

    // Itera velas como hace checkSLTP, desde la última registrada.
    const curIdx = engine.currentIndex
    const fromIdx = ps.lastBreachIdx != null ? ps.lastBreachIdx + 1 : curIdx
    ps.lastBreachIdx = curIdx

    // Para cada vela, calculamos el WORST floating en esa vela:
    // - BUY pierde más cuando el precio baja: peor PnL al low.
    // - SELL pierde más cuando el precio sube: peor PnL al high.
    // Como múltiples posiciones del mismo par pueden tener distinto side,
    // y el precio se mueve por toda la vela, evaluamos el peor caso EN AMBOS
    // EXTREMOS y nos quedamos con el peor de los dos.
    for (let i = fromIdx; i <= curIdx; i++) {
      const candle = engine.candles[i]
      if (!candle) continue
      const { high, low } = candle
      // Filtramos posiciones que ya estaban abiertas en esta vela, y las que ya tienen su cierre en
      // curso (p. ej. el SL de esta misma vela, pendiente en la cola): su perdida es la de ese cierre,
      // no la mecha; contarlas daba un breach fantasma que paraba el Go to y no el Step (revisor
      // adversario de sim-goto-r2). Su resultado entra en el saldo cuando la cola lo aplica.
      const livePositions = ps.positions.filter(p => (p.openTime == null || candle.time >= p.openTime) && !posicionOcupada(id, p.id))
      if (!livePositions.length) continue

      // Nucleo de breach extraido a lib/trading/breach.js (Corte 2, vela-a-vela).
      const r = resolveBreach({
        livePositions,
        high,
        low,
        pair,
        capital,
        realizedDelta,
        floatingOtherPairs,
        ddTotalCapUSD,
        ddDailyCapUSD,
        ddDailyAlreadyUSD,
      })
      if (!r.breach) continue
      const breachPrice = r.breachPrice
      const reasonStr = r.reason

      // Disparar cierre forzado de TODAS las posiciones de TODOS los pares al
      // mejor precio disponible (en pair actual = breachPrice; en otros pares
      // = su último precio conocido). Reason marca el motivo.
      challengeBreachFiringRef.current = true
      const reasonLabel = reasonStr === 'DD_DAILY_BREACH' ? 'dd_daily' : 'dd_total'

      // Cierre en pair actual al breachPrice
      const positionsToClose = [...livePositions]
      positionsToClose.forEach(p => {
        try { closePositionRef.current(p.id, reasonStr, pair, breachPrice, null, engine.currentTime) } catch(e) { console.error('[breach close]', e) }
      })
      // Cierre en otros pares al último precio conocido (close del candle actual), con la hora de
      // la vela del breach, no la del motor de ese par, que puede ir atrasado (SIMGOTO-01)
      Object.entries(pairState.current).forEach(([k, ps2]) => {
        if (k === pair || !ps2?.positions?.length || !ps2.engine) return
        const candles = ps2.engine.candles || []
        const idx2 = ps2.engine.currentIndex
        const lastCandle = candles[idx2]
        const lastPrice = lastCandle?.close ?? ps2.positions[0].entry
        const otherPositions = [...ps2.positions]
        otherPositions.forEach(p => {
          try { closePositionRef.current(p.id, reasonStr, k, lastPrice, null, engine.currentTime) } catch(e) { console.error('[breach close other]', e) }
        })
      })

      // Pausar el motor — el alumno ha quemado el challenge.
      try { engine.pause() } catch {}
      try { setIsPlaying(false) } catch {}

      // Disparar modal de fail DESPUÉS de que el backend confirme el nuevo
      // estado. Etapa 1, ronda 2 (CTO 13-oct, Astra E1-04): fuera la espera de
      // 300 ms y los tres reintentos. La misma confirmacion explicita que el paso
      // de fase: la cola cerrada a cierres nuevos, vacia (los cierres del breach
      // ya estan en ella), sin inciertos, y el reto reevaluado con challenge/status.
      // Solo si dice quemado se abre el modal; si no (p. ej. los cierres no se
      // guardaron), no se abre y el detector puede volver a dispararse.
      ;(async () => {
        const r = await confirmaReto()
        const st = r?.data?.evaluation?.status
        if (st === 'failed_dd_daily' || st === 'failed_dd_total') setChallengeModal('failed')
        else challengeBreachFiringRef.current = false
      })()

      // Salimos del bucle de velas: ya quemado, no procesamos más.
      break
    }
  }, [confirmaReto])

  return {
    challengeStatus, challengeLocked, challengeModal, setChallengeModal,
    challengeAdvancing, refreshChallengeStatus, checkChallengeBreach,
    handleChallengePass, handleChallengeFail, handleCtaRealChallenge,
    handleGoToDashboard, handleGoToNewChallenge,
  }
}
