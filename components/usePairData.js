/**
 * components/usePairData.js — núcleo de datos y chart del par (Fase 7, Corte E, s59).
 *
 * Extraído 1:1 de components/_SessionInner.js (baseline 1848, md5 d064177b): saveProgress
 * (persistencia de last_timestamp), loadPair (fetch de velas, ReplayEngine, onTick/onEnd,
 * resume por masterTime con doble protección), updateChart (render full / new-bar / tick
 * con phantoms) y los 2 efectos consumidores (sync al cambiar de par activo + carga inicial).
 * API devuelta con los MISMOS nombres que usaba SessionPage: ningún call-site cambia.
 * El montaje del chart (mountPairRef) y el efecto de cambio de TF se quedan en SessionPage:
 * están entrelazados con el dominio de dibujos/SL-TP y van a su propio corte (decisión s59).
 */

import { useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import ReplayEngine from '../lib/replayEngine'
import { saltaA } from '../lib/sim/salto'
import { puedeEscribir } from '../lib/sim/servicio'
import { avisa, avisaSiError } from '../lib/sim/avisos'
import { fetchSessionCandles, setSeriesData, setMasterTime, getMasterTime } from '../lib/sessionData'
import { captureSavedRange, initVisibleRange, restoreSavedRange, restoreOnNewBar } from '../lib/chartViewport'
import { applyFullRender, applyTickUpdate, applyNewBarUpdate } from '../lib/chartRender'
import { computePhantomsNeeded } from '../lib/sessionUi'
import { fechaCorta, listaDiasCortos } from '../lib/mercado/calidad.mjs'

export default function usePairData({ id, session, activePair, pairState, chartMap, sessionRef, activePairRef, pairTfRef, speedRef, checkSLTPRef, checkLimitOrdersRef, checkChallengeBreachRef, setIsPlaying, setCurrentTime, setProgress, setCurrentPrice, setDataReady, setTick, exportTools, refrescaReto }){
  // el refresco del reto con hora (useChallengeFlow), para el salto al volver a un par (orden 1-081)
  const refrescaRetoRef=useRef(refrescaReto); refrescaRetoRef.current=refrescaReto
  const saveProgress=useCallback(async(ts)=>{
    if(!id||!ts) return
    // Etapa 1 (diseño sim-004, d2, o.5, o.7): una sesion legado no escribe; el
    // guardado es una escritura economica (last_timestamp): antes, el estado del
    // servicio; despues, el {error}, que solo avisa
    if(sessionRef.current?.legado===true) return
    try{
      const p=await puedeEscribir()
      if(!p.permitido) return
      const r=await supabase.from('sim_sessions').update({last_timestamp:ts,timeframe:pairTfRef.current[activePairRef.current]||"H1"}).eq('id',id)
      avisaSiError('el avance de la sesión')(r)
    }catch(e){ avisa('No se ha podido guardar el avance de la sesión. Comprueba tu conexión.') }
  },[id])

  // Bloque D, punto 5 (CTO, 5-oct; Astra, regresion de C04): el fallo de un par
  // se queda EN ESE PAR. Antes iba a setErrorDatos y la pagina entera se
  // sustituia por un error sin pausar el motor del otro par, que seguia
  // operando sin controles. Ahora: se pausan todos los motores, el par guarda
  // su error (lo que ya tuviera, p. ej. trades previos, se conserva) y
  // _SessionInner lo pinta en su grafico con un reintento.
  const falloPar=useCallback((pair,mensaje)=>{
    Object.values(pairState.current).forEach(st=>st?.engine?.pause?.())
    setIsPlaying(false)
    const previo=pairState.current[pair]||{engine:null,positions:[],trades:[],orders:[]}
    pairState.current[pair]={...previo,ready:false,error:mensaje}
    setTick(t=>t+1)
  },[])

  // ── Load pair data ────────────────────────────────────────────────────────────
  const loadPair=useCallback(async(pair)=>{
    const sess=sessionRef.current
    if(!sess||pairState.current[pair]?.ready) return
    try{
      const result = await fetchSessionCandles({
        pair, dateFrom: sess.date_from, dateTo: sess.date_to
      })
      // C04/D5: una respuesta sin velas no es silencio: error visible en el par
      if (!result) { falloPar(pair, `No hay velas de ${pair} para las fechas de esta sesion.`); return }
      // D03: sin velas validas no se crea el motor (no hay sesion «valida»)
      if (result.error) { console.error('[loadPair]', pair, result.error); falloPar(pair, result.error); return }
      const { candles: ordinalCandles, replayTs, toTs } = result

      const engine=new ReplayEngine()
      // If there's a master time (another pair already advanced), use that. Otherwise resume saved position.
      // Doble protección: además de limpiarla al cambiar id, validamos que
      // masterTime caiga dentro del rango temporal de ESTA sesión. Si está fuera
      // (por race condition entre montajes), la ignoramos y caemos al fallback.
      const rawMaster = getMasterTime()
      const masterTime = (rawMaster && rawMaster >= replayTs && rawMaster <= toTs) ? rawMaster : null
      // Convert real masterTime/resumeTs to ordinal if needed
      const toOrdinal = (t) => t ?? null  // real timestamps — no conversion needed
      const isOrdinal = (t) => t && t < 1000000000
      const resumeReal = masterTime || (isOrdinal(sess.last_timestamp)?null:sess.last_timestamp) || replayTs
      const resumeTs = toOrdinal(resumeReal) ?? 0
      engine.load(ordinalCandles); engine.seekToTime(resumeTs); engine.speed=speedRef.current
      engine.onTick=()=>{
        // en el salto del Go to (avanzaHasta) el grafico se pinta una vez, al llegar
        if(!engine.saltando) updateChart(pair,engine,false)
        checkSLTPRef.current?.(pair,engine)
        // M04 (orden 1-081): una pendiente llenada en esta vela mira su SL/TP en ella, con la misma
        // regla de la misma vela que checkSLTP (si toca los dos, gana el TP)
        const llenadas=checkLimitOrdersRef.current?.(pair,engine)
        if(llenadas) checkSLTPRef.current?.(pair,engine,llenadas.desdeIdx,llenadas.ids)
        // Challenge breach intra-vela: si el floating PnL + cerrado supera
        // el cap diario o total, fuerza cierre de TODAS las posiciones al
        // precio exacto donde se cruzó el cap. Estilo FTMO real.
        checkChallengeBreachRef.current?.(pair,engine)
        if(pair===activePairRef.current){
          setCurrentTime(engine.currentTime)
          setProgress(Math.round(engine.progress*100))
          // el reloj maestro nunca retrocede (SIMGOTO-03): un par cuyo historico acaba antes no lo baja
          const m=getMasterTime(); if(!m||engine.currentTime>m) setMasterTime(engine.currentTime)
        }
      }
      engine.onEnd=()=>{if(pair===activePairRef.current){setIsPlaying(false);saveProgress(Math.max(engine.currentTime,getMasterTime()||0))}}
      const ps={engine,ready:true,positions:[],trades:[],
        lastSLTPIdx: engine.currentIndex,   // start from current — don't re-check history
        lastLimitIdx: engine.currentIndex,
        // Bloque D, punto 4: la sesion llega al tramo actual y los datos acaban
        // antes. Se opera hasta ahi y _SessionInner lo enseña para el par activo.
        // Bloque G, punto 5: con COBERTURA_ESTRICTA apagado la sesion abre con
        // dias incompletos y el aviso los nombra.
        avisoDatos: [
          result.diasIncompletos?.length ? `${pair}: ${result.diasIncompletos.length===1?'dia incompleto':result.diasIncompletos.length+' dias incompletos'} en esta sesion: ${listaDiasCortos(result.diasIncompletos)}. Ahi faltan velas.` : '',
          // CTO 6-oct: sin prometer actualizacion ni fecha de arreglo
          result.tramoAbierto ? `${pair}: datos hasta ${fechaCorta(result.datosHasta)}; despues no hay velas.` : '',
        ].filter(Boolean).join(' '),
      }
      pairState.current[pair]=ps
      updateChart(pair,engine,true)
      if(pair===activePairRef.current){
        setDataReady(true);setCurrentTime(engine.currentTime);setProgress(Math.round(engine.progress*100))
        const agg=engine.getAggregated(pairTfRef.current[pair]||'H1')
        setCurrentPrice(agg.slice(-1)[0]?.close??null)
      }
      setTick(t=>t+1)
    }catch(e){
      // C04/D5: fetch rechazado (red) o respuesta ilegible: visible en el par
      console.error('loadPair',pair,e)
      falloPar(pair,`No se han podido cargar las velas de ${pair} (${e?.message||e}). Comprueba tu conexion y reintenta.`)
    }
  },[])

  // ── Update chart ──────────────────────────────────────────────────────────────
  const updateChart=useCallback((pair,engine,full)=>{
    const cr=chartMap.current[pair]; if(!cr||!engine) return
    const tf=pairTfRef.current[pair]||'H1'
    const agg=engine.getAggregated(tf); if(!agg.length) return
    const prev=cr.prevCount,curr=agg.length
    const _tfMap2={'M1':60,'M3':180,'M5':300,'M15':900,'M30':1800,'H1':3600,'H4':14400,'D1':86400}
    const _tfS2 = _tfMap2[tf]||3600
    const _lastT = agg[agg.length-1].time
    const _lastC = agg[agg.length-1].close
    // Phantoms = velas "futuras" sin movimiento que reservan espacio a la
    // derecha del último precio. CRÍTICO: deben tener OHLC definidos, no
    // sólo `time`. Si sólo tienen time, lightweight-charts intenta hacer
    // autoscale del eje Y leyendo minValue/maxValue de cada bucket y
    // crashea con `Cannot read properties of undefined (reading 'minValue')`.
    // Con OHLC = lastClose se ven como velas plana (línea horizontal) y el
    // autoscale las ignora correctamente.
    const _mkPhantom = (t) => ({ time: t, open: _lastC, high: _lastC, low: _lastC, close: _lastC })

if(full||(curr!==prev&&curr!==prev+1)){
      // Cantidad de phantoms: por defecto 10. Si hay drawings cuyos puntos
      // caen más allá, el effect de cambio de TF setea cr._phantomsNeeded para
      // que el array sea suficientemente largo para renderizarlos correctamente.
      const _phN = cr._phantomsNeeded || 10
      cr._phantomsNeeded = null  // consumir, vuelve a default en próxima llamada
      cr.phantom=Array.from({length:_phN},(_,i)=>_mkPhantom(_lastT+_tfS2*(i+1)))
      const _savedRange = captureSavedRange(cr)
      applyFullRender(cr, agg, cr.phantom)
      if(!cr.hasLoaded){
        initVisibleRange(cr, tf, agg.length)
      } else {
        restoreSavedRange(cr, _savedRange, {full})
      }
    } else if(curr===prev+1){
      // Una vela TF nueva se ha cerrado. Regeneramos las phantoms ANTES de
      // escribir __algSuiteSeriesData para evitar dos cosas críticas:
      //   1. Timestamps DUPLICADOS: si no se regenera, phantom[0].time
      //      coincide con agg[last].time (ambos = _oldLastT + _tfS2). Eso
      //      rompe la búsqueda binaria de interpolateLogicalIndexFromTime
      //      en el plugin de drawings → al arrastrar un rectángulo cerca
      //      de la vela actual, se "estira" hacia el infinito porque el
      //      logical index resuelve a posiciones ambiguas.
      //   2. OHLC desfasado: las phantoms quedarían ancladas al close de
      //      la vela TF anterior → cola plana visible a la derecha.
      let _phN
      try {
        const tools = JSON.parse(exportTools() || '[]')
        _phN = computePhantomsNeeded(tools, _lastT, _tfS2)
      } catch {
        _phN = cr.phantom?.length || 10
      }
      cr.phantom = Array.from({length:_phN},(_,i)=>_mkPhantom(_lastT+_tfS2*(i+1)))
      setSeriesData([...agg, ...cr.phantom], agg.length)
      restoreOnNewBar(cr, () => {
        applyNewBarUpdate(cr, agg, cr.phantom)
      }, {
        agg,
        mkPhantom: _mkPhantom,
        lastT: _lastT,
        tfS2: _tfS2,
      })
    } else {
      // Within-bucket: actualiza última vela + phantoms in-place (ver applyTickUpdate JSDoc).
      applyTickUpdate(cr, agg, cr.phantom, _lastC)
    }
    cr.prevCount=curr
    if(pair===activePairRef.current) setCurrentPrice(agg[agg.length-1].close)
  },[])

  useEffect(()=>{
    if(!activePair) return
    // SIMGOTO-01 (orden 1-083): un salto de otro par que siga en curso se corta en la vela en que
    // va (como si se hubiera avanzado hasta ahi y despues cambiado de par): nunca dos relojes a la vez
    Object.entries(pairState.current).forEach(([k,o])=>{ if(k!==activePair&&o?.engine?.saltando) o.engine.pause() })
    const ps=pairState.current[activePair]
    if(ps?.engine){
      // Sync this pair's engine to the current master time (from whichever pair was active before)
      const masterTime = getMasterTime()
      const e=ps.engine, par=activePair
      const sincroniza=()=>{
        setIsPlaying(e.isPlaying);setCurrentTime(e.currentTime)
        setProgress(Math.round(e.progress*100))
        const agg=e.getAggregated(pairTfRef.current[par]||'H1')
        setCurrentPrice(agg.slice(-1)[0]?.close??null);setDataReady(true)
        // el reloj maestro nunca retrocede (SIMGOTO-03): si este par tiene un hueco, se queda en su
        // ultima vela <= maestro y el maestro sigue donde estaba
        const m=getMasterTime(); if(!m||e.currentTime>m) setMasterTime(e.currentTime)
      }
      // SIMGOTO-03 (orden 1-083): cualquier retraso, tambien de una sola vela (antes, > 60 s)
      if(masterTime && masterTime > e.currentTime) {
        // Orden 1-081: ponerse al dia es un salto como el Go to: vela a vela (lib/sim/salto.js), no un
        // seekToTime de un solo onTick (una pendiente de este par no miraria su SL/TP: M04)
        saltaA({engine:e,hasta:masterTime,sid:id,pairState,esReto:!!sessionRef.current?.challenge_type,refresca:(ct)=>refrescaRetoRef.current?.(ct)})
          .then(()=>{
            if(activePairRef.current!==par) return
            const cr=chartMap.current[par]; if(cr) cr.prevCount=0
            updateChart(par,e,true); sincroniza(); setTick(t=>t+1)
          })
      } else {
        // por delante del maestro (no deberia ocurrir: el par quieto siempre va por detras) NO se
        // rebobina: sus cierres ya ocurrieron; el maestro sube hasta el (SIMGOTO-03)
        sincroniza()
      }
    }else{setDataReady(false);if(sessionRef.current)loadPair(activePair)}
    setTick(t=>t+1)
  },[activePair,loadPair])

  useEffect(()=>{if(session&&activePair)loadPair(activePair)},[session,activePair,loadPair])

  return { saveProgress, loadPair, updateChart }
}
