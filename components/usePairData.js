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

import { useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import ReplayEngine from '../lib/replayEngine'
import { fetchSessionCandles, setSeriesData, setMasterTime, getMasterTime } from '../lib/sessionData'
import { captureSavedRange, initVisibleRange, restoreSavedRange, restoreOnNewBar } from '../lib/chartViewport'
import { applyFullRender, applyTickUpdate, applyNewBarUpdate } from '../lib/chartRender'
import { computePhantomsNeeded } from '../lib/sessionUi'

export default function usePairData({ id, session, activePair, pairState, chartMap, sessionRef, activePairRef, pairTfRef, speedRef, checkSLTPRef, checkLimitOrdersRef, checkChallengeBreachRef, setIsPlaying, setCurrentTime, setProgress, setCurrentPrice, setDataReady, setTick, exportTools }){
  const saveProgress=useCallback(async(ts)=>{
    if(!id||!ts) return
    try{ await supabase.from('sim_sessions').update({last_timestamp:ts,timeframe:pairTfRef.current[activePairRef.current]||"H1"}).eq('id',id) }catch(e){}
  },[id])

  // ── Load pair data ────────────────────────────────────────────────────────────
  const loadPair=useCallback(async(pair)=>{
    const sess=sessionRef.current
    if(!sess||pairState.current[pair]?.ready) return
    try{
      const result = await fetchSessionCandles({
        pair, dateFrom: sess.date_from, dateTo: sess.date_to
      })
      if (!result) return
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
        updateChart(pair,engine,false)
        checkSLTPRef.current?.(pair,engine)
        checkLimitOrdersRef.current?.(pair,engine)
        // Challenge breach intra-vela: si el floating PnL + cerrado supera
        // el cap diario o total, fuerza cierre de TODAS las posiciones al
        // precio exacto donde se cruzó el cap. Estilo FTMO real.
        checkChallengeBreachRef.current?.(pair,engine)
        if(pair===activePairRef.current){
          setCurrentTime(engine.currentTime)
          setProgress(Math.round(engine.progress*100))
          setMasterTime(engine.currentTime)
        }
      }
      engine.onEnd=()=>{if(pair===activePairRef.current){setIsPlaying(false);saveProgress(engine.currentTime)}}
      const ps={engine,ready:true,positions:[],trades:[],
        lastSLTPIdx: engine.currentIndex,   // start from current — don't re-check history
        lastLimitIdx: engine.currentIndex,
      }
      pairState.current[pair]=ps
      updateChart(pair,engine,true)
      if(pair===activePairRef.current){
        setDataReady(true);setCurrentTime(engine.currentTime);setProgress(Math.round(engine.progress*100))
        const agg=engine.getAggregated(pairTfRef.current[pair]||'H1')
        setCurrentPrice(agg.slice(-1)[0]?.close??null)
      }
      setTick(t=>t+1)
    }catch(e){console.error('loadPair',pair,e)}
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
    const ps=pairState.current[activePair]
    if(ps?.engine){
      // Sync this pair's engine to the current master time (from whichever pair was active before)
      const masterTime = getMasterTime()
      if(masterTime && Math.abs(ps.engine.currentTime - masterTime) > 60) {
        ps.engine.seekToTime(masterTime)
      }
      setIsPlaying(ps.engine.isPlaying);setCurrentTime(ps.engine.currentTime)
      setProgress(Math.round(ps.engine.progress*100))
      const agg=ps.engine.getAggregated(pairTfRef.current[activePair]||'H1')
      setCurrentPrice(agg.slice(-1)[0]?.close??null);setDataReady(true);setMasterTime(ps.engine.currentTime)
    }else{setDataReady(false);if(sessionRef.current)loadPair(activePair)}
    setTick(t=>t+1)
  },[activePair,loadPair])

  useEffect(()=>{if(session&&activePair)loadPair(activePair)},[session,activePair,loadPair])

  return { saveProgress, loadPair, updateChart }
}
