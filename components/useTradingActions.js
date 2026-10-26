/**
 * components/useTradingActions.js — acciones de trading de la página de sesión (Fase 7, Corte F, s59).
 *
 * Extraído 1:1 de components/_SessionInner.js (baseline 1712, md5 57a29c59): closePosition
 * (realizePnl + persistencia en sim_trades/sim_sessions + refresh del challenge), stubs de
 * líneas de posición (createPositionLines se devuelve: lo usa el OrderModal), preview de
 * órdenes límite (previewOrder/confirm/cancel/updateSl/updateTp), drag-end de SL/TP y de
 * límites (handlePositionDragEnd), cancelLimitOrder, y los detectores por vela checkSLTP
 * y checkLimitOrders (consumidos por el engine vía refs puente que se quedan en SessionPage).
 * API devuelta con los MISMOS nombres que usaba SessionPage: ningún call-site cambia.
 * NOTA: openPosition y tpPips eran código muerto (cero call-sites; el OrderModal construye
 * la posición por su cuenta) y se ELIMINAN en este corte en vez de mudarse.
 */

import { useCallback, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { realizePnl, priceFromPips, isFilled, isLongSide } from '../lib/trading/orders'
import { pipMult } from '../lib/trading/pricing'
import { sessionKeyAt } from '../lib/killzonesDomain'
import { cierraPosicion, saldoConfirmado, nuevoIdTrade } from '../lib/sim/cierre'
import { encola, posicionOcupada, hayBarrera, suscribeCola } from '../lib/sim/cola'
import { cierreEnVela, rutaComun, alTick } from '../lib/sim/vela'
import { avisa } from '../lib/sim/avisos'
import { comandoCerrar, comandoCancelar, comandoTirador, comandoAbrir } from '../lib/sim/v1/ordenes'

// La fila de sim_trades de un cierre (total o parcial), con su id generado aqui:
// si la respuesta se pierde, se relee por ese id (diseño sim-004, n.5, o.7)
export function filaTrade({ userId, pos, lots, exit, rrReal, pnl, result, note, currentTime }) {
  const realOpen = pos.openTime ?? null
  const realClose = currentTime > 1000000000 ? currentTime : null
  return {
    id: nuevoIdTrade(),
    user_id: userId,
    pair: pos.pair,
    side: pos.side,
    lots: parseFloat(lots) || 0.01,
    entry_price: parseFloat(pos.entry) || 0,
    exit_price: parseFloat(exit) || 0,
    sl_price: parseFloat(pos.sl) || 0,
    tp_price: parseFloat(pos.tp) || 0,
    rr: parseFloat(rrReal.toFixed(2)),
    pnl: parseFloat(pnl.toFixed(2)),
    result,
    notes: note || null,
    session_type: (realOpen && realOpen > 1000000000) ? sessionKeyAt(realOpen) : null,
    opened_at: realOpen ? new Date(realOpen * 1000).toISOString() : new Date().toISOString(),
    closed_at: realClose ? new Date(realClose * 1000).toISOString() : new Date().toISOString(),
  }
}

export default function useTradingActions({ id, activePair, currentPrice, currentTime, lots, preview, pairState, chartMap, sessionRef, balanceRef, userIdRef, closePositionRef, checkSLTPRef, setBalance, setTick, setPreview, setCtxMenu, refreshChallengeStatus, soloLecturaRef, alBloqueo, v1Ref }){
  function createPositionLines(posId,pair,pos){
    // Lines are rendered by HTML overlay — no LWC price lines needed
  }

  function removePositionLines(posId,pair){
    // Lines are rendered by HTML overlay — nothing to remove from LWC
  }

  // Etapa 1, ronda 2 (CTO 13-oct; Astra E1-02): el cierre va a la cola de la sesion
  // (lib/sim/cierre.js, cierraPosicion) y la posicion queda OCUPADA hasta que se
  // resuelve. Lo que cambia en la pantalla se calcula EN SU TURNO (prepara), con la
  // posicion de ese momento, no al pulsar. Si no se guarda, la posicion vuelve a su
  // ultimo estado CONFIRMADO (la copia de antes de aplicarlo), nunca sumando lotes, y el
  // saldo de la pantalla al confirmado por la base.
  const dos=x=>parseFloat(Number(x).toFixed(2))
  const reponSaldo=(delta)=>{
    const c=saldoConfirmado(id)
    balanceRef.current = c!=null ? c : dos(balanceRef.current-delta)
    setBalance(balanceRef.current);setTick(t=>t+1)
  }
  const restaura=(pair,confirmada,enMemoria)=>{
    const ps3=pairState.current[pair]; if(!ps3) return
    ps3.trades=ps3.trades.filter(t=>t!==enMemoria)
    ps3.positions = ps3.positions.some(p=>p.id===confirmada.id)
      ? ps3.positions.map(p=>p.id===confirmada.id?{...confirmada}:p)
      : [...ps3.positions,{...confirmada}]
    // GOTOG1-01 (orden 1-089): mientras su cierre estuvo en vuelo, la posicion no estaba en la lista y
    // checkSLTP no la miro; vuelve con las velas DESPUES de la del cierre apuntadas (reevaluaSLTP, al
    // liberarse). La del cierre no: un cierre que falla de verdad no se reintenta solo
    const cs=ps3.engine?.candles, ct=enMemoria?.closeTime
    if(cs&&Number.isFinite(ct)){
      const i=cs.findIndex(c=>c.time>ct)
      if(i>=0&&i<=ps3.engine.currentIndex) ps3.sltpDesde=Math.min(ps3.sltpDesde??i,i)
    }
  }
  // SL/TP de las velas que pasaron con la posicion ocupada (o con la barrera del reto): al
  // liberarse, se vuelven a mirar (checkSLTP las apunta en ps.sltpDesde)
  const reevaluaSLTP=(pair)=>{
    const ps=pairState.current[pair]
    if(ps?.sltpDesde==null||!ps.engine) return
    const desde=ps.sltpDesde; ps.sltpDesde=null
    checkSLTPRef.current?.(pair,ps.engine,desde)
  }

  // al bajar la barrera del reto (E1-04), SL/TP de las velas que pasaron con ella
  useEffect(()=>id?suscribeCola(id,()=>{ if(!hayBarrera(id)) Object.keys(pairState.current).forEach(reevaluaSLTP) }):undefined,[id])

  // al liberarse la posicion: repintar, SL/TP de las velas apuntadas y, si se resolvio un
  // incierto en un reto, refrescarlo (E1-04: con el incierto no se ofrecia la fase)
  const alResolver=pair=>motivo=>{
    setTick(t=>t+1); reevaluaSLTP(pair)
    if(motivo==='incierto'&&sessionRef.current?.challenge_type) refreshChallengeStatus()
  }

  // closePosition accepts optional pair+exitPrice for use from engine.onTick
  // horaCierre (opcional): la hora de la vela que origina el cierre (SIMGOTO-01, orden 1-083)
  const closePosition=useCallback(async(posId,reason='MANUAL',pairOverride,exitPriceOverride,note=null,horaCierre=null)=>{
    // modo v1 (pieza 6): el cierre es un comando; la pantalla lo pinta ya (optimista, orden 1-127) y queda lo confirmado
    if(v1Ref?.current){ if(!pairState.current[pairOverride||activePair]?.positions?.some(p=>p.id===posId)) return; return v1Ref.current.envia(comandoCerrar(posId),{exit:exitPriceOverride||currentPrice,closeTime:currentTime,reason}) }
    const usePair=pairOverride||activePair
    const usePrice=exitPriceOverride||currentPrice
    const ps=pairState.current[usePair];if(!ps||!usePrice) return
    if(!ps.positions.some(p=>p.id===posId)) return
    // d2: una sesion del simulador anterior es de solo lectura
    if(soloLecturaRef?.current){ avisa('Esta sesión es del Simulador anterior: solo lectura.'); return }
    // la hora de la vela que lo origina, en SU par: en el salto del Go to (orden 1-080) el cierre es
    // de la vela del salto donde ocurre, no de la hora de la pagina de antes del salto; y nunca la
    // del par que se este mirando si es otro (SIMGOTO-01, orden 1-083)
    const ct=Number.isFinite(horaCierre) ? horaCierre : (pairState.current[usePair]?.engine?.currentTime ?? currentTime)
    // en su turno: la posicion de ese momento; aplica el cierre a la pantalla
    const prepara=()=>{
      const ps2=pairState.current[usePair]
      const pos=ps2?.positions?.find(p=>p.id===posId); if(!pos) return null
      const confirmada={...pos}
      const { pnl, rrReal, result } = realizePnl({ side: pos.side, entry: pos.entry, exit: usePrice, lots: pos.lots, pair: usePair, initialSlPips: pos.initialSlPips, slPips: pos.slPips })
      const delta=dos(pnl)
      ps2.positions=ps2.positions.filter(p=>p.id!==posId)
      const enMemoria={...pos,exit:usePrice,closeTime:ct,pnl,result,rrReal:parseFloat(rrReal.toFixed(2)),reason}
      ps2.trades=[...ps2.trades,enMemoria]
      removePositionLines(posId,usePair)
      balanceRef.current=dos(balanceRef.current+delta) // sync inmediato: el motor y el reto lo leen en la misma vela
      setBalance(balanceRef.current);setTick(t=>t+1)
      const trade=userIdRef.current ? filaTrade({ userId:userIdRef.current, pos, lots:pos.lots, exit:usePrice, rrReal, pnl, result, note, currentTime:ct }) : null
      return { delta, trade, lastTimestamp:ct??null, revierte:()=>{ restaura(usePair,confirmada,enMemoria); reponSaldo(delta) } }
    }
    if(!userIdRef.current){
      // sin usuario no se guarda nada (como antes); tambien en la cola
      if(hayBarrera(id)) return
      await encola(id,()=>{ prepara() },{ cierre:true })
    } else {
      const r=cierraPosicion({ sessionId:id, posId, prepara, alBloqueo, alResolver:alResolver(usePair) })
      if(!r) return
      await r
    }
    // Si es un challenge, refrescar HUD con nuevo balance/DD/target (en la cola, detras del cierre)
    if(sessionRef.current?.challenge_type) refreshChallengeStatus()
  },[activePair,currentPrice,currentTime,id,refreshChallengeStatus])

  // Cierre PARCIAL (antes en el onConfirm del CloseModal de _SessionInner). Etapa 1
  // (diseño sim-004, i.1 S4-01a, o.7): en UNA llamada atomica. Sin last_timestamp, como
  // hoy. Ronda 2 (E1-02): en la cola y con la posicion ocupada, como el total; si no se
  // guarda, la posicion vuelve a sus lotes CONFIRMADOS.
  const closePartial=useCallback((posId,pair,lotsToClose,note=null)=>{
    if(v1Ref?.current) return v1Ref.current.envia(comandoCerrar(posId,lotsToClose),{exit:currentPrice,closeTime:currentTime})
    const ps=pairState.current[pair]
    if(!ps?.positions?.some(p=>p.id===posId)||!currentPrice) return
    if(soloLecturaRef?.current){ avisa('Esta sesión es del Simulador anterior: solo lectura.'); return }
    if(!userIdRef.current) return
    const precio=currentPrice, ct=currentTime
    const prepara=()=>{
      const ps2=pairState.current[pair]
      const pos=ps2?.positions?.find(p=>p.id===posId); if(!pos) return null
      const confirmada={...pos}
      const { pnl, rrReal, result } = realizePnl({ side: pos.side, entry: pos.entry, exit: precio, lots: lotsToClose, pair, initialSlPips: pos.initialSlPips, slPips: pos.slPips })
      const delta=dos(pnl)
      const enMemoria={...pos,lots:lotsToClose,exit:precio,closeTime:ct,pnl,result,rrReal:parseFloat(rrReal.toFixed(2)),reason:'PARTIAL',note}
      ps2.trades=[...ps2.trades,enMemoria]
      ps2.positions=ps2.positions.map(p=>p.id===posId?{...p,lots:parseFloat((p.lots-lotsToClose).toFixed(2))}:p)
      balanceRef.current=dos(balanceRef.current+delta)
      setBalance(balanceRef.current);setTick(t=>t+1)
      const trade=filaTrade({ userId:userIdRef.current, pos, lots:lotsToClose, exit:precio, rrReal, pnl, result, note, currentTime:ct })
      return { delta, trade, lastTimestamp:null, revierte:()=>{ restaura(pair,confirmada,enMemoria); reponSaldo(delta) } }
    }
    return cierraPosicion({ sessionId:id, posId, prepara, alBloqueo, alResolver:alResolver(pair) })
  },[currentPrice,currentTime,id])

  const previewOrder=useCallback((side, price, pair)=>{
    setCtxMenu(null)
    const defaultSl=10, defaultTp=30
    const sl=priceFromPips({isLong:isLongSide(side),entry:price,pips:defaultSl,pair,leg:'SL'})
    const tp=priceFromPips({isLong:isLongSide(side),entry:price,pips:defaultTp,pair,leg:'TP'})
    setPreview({pair,side,entry:price,sl,tp,lots,slPips:defaultSl,tpPips:defaultTp,rr:3})
  },[lots])

  const confirmLimitOrder=useCallback(()=>{
    if(!preview) return
    if(soloLecturaRef?.current){ avisa('Esta sesión es del Simulador anterior: solo lectura.'); setPreview(null); return }
    if(v1Ref?.current){ const pv=preview; setPreview(null); return v1Ref.current.envia(comandoAbrir({pair:pv.pair,side:pv.side,entry:pv.entry,lots:pv.lots,sl:pv.sl,tp:pv.tp}),{createdTime:currentTime}) }
    const ps=pairState.current[preview.pair]; if(!ps) return
    if(!ps.orders) ps.orders=[]
    // orden 1-119: lo que entra se ajusta al tick del par (el dibujo y el preview pueden traer cualquier decimal)
    const order={...preview, entry:alTick(preview.entry,preview.pair), sl:alTick(preview.sl,preview.pair), tp:alTick(preview.tp,preview.pair), id:`L${Date.now()}`, createdTime:currentTime}
    ps.orders=[...ps.orders, order]
    // Price lines — subtle colors
    const cr=chartMap.current[preview.pair]
    if(cr?.series){
      if(!cr.priceLines) cr.priceLines={}
      cr.priceLines[order.id+'_entry']=cr.series.createPriceLine({price:order.entry,color:'rgba(180,180,180,0.5)',lineWidth:1,lineStyle:0,axisLabelVisible:true,title:`${order.side==='BUY_LIMIT'?'B':'S'}.LIM ${order.lots}L`})
      cr.priceLines[order.id+'_sl']=cr.series.createPriceLine({price:order.sl,color:'rgba(239,83,80,0.4)',lineWidth:1,lineStyle:2,axisLabelVisible:true,title:`SL`})
      cr.priceLines[order.id+'_tp']=cr.series.createPriceLine({price:order.tp,color:'rgba(30,144,255,0.4)',lineWidth:1,lineStyle:2,axisLabelVisible:true,title:`TP`})
    }
    setPreview(null)
    setTick(t=>t+1)
  },[preview,currentTime])

  const cancelPreview=useCallback(()=>setPreview(null),[])

  // Called by PositionOverlay when user finishes dragging a SL/TP line
  const handlePositionDragEnd=useCallback((posId, type, precioSoltado)=>{
    const ps=pairState.current[activePair]; if(!ps) return
    // modo v1: el tirador manda modificar; se pinta ya (optimista) y la linea queda donde diga el estado confirmado
    if(v1Ref?.current) return v1Ref.current.envia(comandoTirador({id:posId,type,price:precioSoltado,pair:activePair}))
    // orden 1-119: coordinateToPrice da cualquier decimal: se guarda el tick del par mas cercano (la mitad, arriba)
    const newPrice=alTick(precioSoltado,activePair)
    // Handle open positions
    const pos=ps.positions?.find(x=>x.id===posId)
    if(pos){
      const pips=parseFloat((Math.abs((newPrice-pos.entry)*pipMult(activePair))).toFixed(1))
      if(type==='sl'){pos.sl=newPrice;pos.slPips=pips}
      else if(type==='tp'){pos.tp=newPrice;pos.tpPips=pips}
      ps.positions=[...ps.positions]
      setTick(t=>t+1)
      return
    }
    // Handle limit orders
    const ord=ps.orders?.find(x=>x.id===posId)
    if(ord){
      const pips=parseFloat((Math.abs((newPrice-ord.entry)*pipMult(activePair))).toFixed(1))
      if(type==='lim_sl'){ord.sl=newPrice;ord.slPips=pips}
      else if(type==='lim_tp'){ord.tp=newPrice;ord.tpPips=pips}
      else if(type==='lim_e'){ord.entry=newPrice}
      // Update price lines on chart
      const cr=chartMap.current[activePair]
      if(cr?.series&&cr?.priceLines){
        const keyMap={lim_e:'_entry',lim_sl:'_sl',lim_tp:'_tp'}
        const k=keyMap[type]
        if(k&&cr.priceLines[ord.id+k]){
          try{cr.series.removePriceLine(cr.priceLines[ord.id+k])}catch{}
          cr.priceLines[ord.id+k]=cr.series.createPriceLine({
            price:newPrice,
            color:k==='_entry'?'rgba(180,180,180,0.5)':k==='_sl'?'rgba(239,83,80,0.4)':'rgba(30,144,255,0.4)',
            lineWidth:1,lineStyle:k==='_entry'?0:2,axisLabelVisible:true,
            title:k==='_entry'?`${ord.side==='BUY_LIMIT'?'B':'S'}.LIM ${ord.lots}L`:k==='_sl'?'SL':'TP'
          })
        }
      }
      ps.orders=[...ps.orders]
      setTick(t=>t+1)
    }
  },[activePair])

  const cancelLimitOrder=useCallback((orderId,pair)=>{
    if(v1Ref?.current) return v1Ref.current.envia(comandoCancelar(orderId))
    const ps=pairState.current[pair]; if(!ps?.orders) return
    ps.orders=ps.orders.filter(o=>o.id!==orderId)
    const cr=chartMap.current[pair]
    if(cr?.priceLines){
      ['_entry','_sl','_tp'].forEach(k=>{
        if(cr.priceLines[orderId+k]){
          try{cr.series.removePriceLine(cr.priceLines[orderId+k])}catch{}
          delete cr.priceLines[orderId+k]
        }
      })
    }
    setTick(t=>t+1)
  },[])

  // Update preview SL/TP pips when dragged
  const updatePreviewSl=useCallback((pips)=>{
    setPreview(prev=>{
      if(!prev) return prev
      const sl=priceFromPips({isLong:isLongSide(prev.side),entry:prev.entry,pips,pair:prev.pair,leg:'SL'})
      return{...prev,sl,slPips:pips}
    })
  },[])

  const updatePreviewTp=useCallback((pips)=>{
    setPreview(prev=>{
      if(!prev) return prev
      const tp=priceFromPips({isLong:isLongSide(prev.side),entry:prev.entry,pips,pair:prev.pair,leg:'TP'})
      return{...prev,tp,tpPips:pips,rr:parseFloat((pips/prev.slPips).toFixed(1))}
    })
  },[])

  // desdeIdx (opcional): reevaluar desde esa vela (reevaluaSLTP, al liberarse una posicion)
  // soloIds (opcional): solo esas posiciones (las que una pendiente acaba de abrir: M04, orden 1-081)
  const checkSLTP=useCallback((pair,engine,desdeIdx,soloIds)=>{
    if(v1Ref?.current) return
    const ps=pairState.current[pair];if(!ps?.positions?.length) return
    const curIdx=engine.currentIndex
    // Determine range to check — from last checked index+1 to current
    // This ensures no M1 candle is skipped at any speed (1x, 5x, 15x, 60x, ∞)
    const fromIdx = desdeIdx != null ? desdeIdx : ps.lastSLTPIdx != null ? ps.lastSLTPIdx + 1 : curIdx
    ps.lastSLTPIdx = curIdx
    // E1-02 / E1-04: una posicion ocupada (cierre pendiente o incierto) o la barrera del
    // reto no aceptan cierres: esas velas se apuntan y se reevaluan al liberarse
    const espera=pos=>hayBarrera(id)||posicionOcupada(id,pos.id)

    const toClose=[]
    // orden 1-119: UN camino por vela y par para todas las posiciones (las del par vivas en esa vela y las pendientes
    // que se llenan en ella), el del motor v1; solo cuenta en un doji equidistante. Se guarda por vela: la llamada de las
    // recien llenadas (soloIds) y las reevaluaciones usan el mismo
    const rutaDe=(candle,i)=>{
      const cache=ps.rutasVela??(ps.rutasVela=new Map())
      if(cache.has(candle.time)) return cache.get(candle.time)
      const vivas=ps.positions.filter(p=>(p.openTime==null||candle.time>=p.openTime)&&!toClose.find(x=>x.id===p.id))
        .map(p=>({side:p.side,entry:p.entry,sl:p.sl,tp:p.tp,lots:p.lots,llenadaAqui:!!(p.porLimite&&candle.time===p.openTime)}))
      const llenan=(ps.orders||[]).filter(o=>(o.createdTime==null||candle.time>=o.createdTime)&&isFilled({isLong:isLongSide(o.side),entry:o.entry,high:candle.high,low:candle.low}))
        .map(o=>({side:isLongSide(o.side)?'BUY':'SELL',entry:o.entry,sl:o.sl,tp:o.tp,lots:o.lots,llenadaAqui:true}))
      const ruta=rutaComun([...vivas,...llenan],candle,{par:pair,previo:engine.candles[i-1]?.close??null})
      if(ruta){ cache.set(candle.time,ruta); if(cache.size>500) cache.delete(cache.keys().next().value) }
      return ruta
    }
    for(let i=fromIdx; i<=curIdx; i++){
      const candle=engine.candles[i];if(!candle) continue
      let ruta
      ps.positions.forEach(pos=>{
        if(soloIds && !soloIds.includes(pos.id)) return
        if(toClose.find(x=>x.id===pos.id)) return // already queued
        // FIX BUG A: Skip candles before this position was opened.
        // Without this guard, past candles could trigger SL/TP retroactively
        // (e.g. when a LIMIT activated incorrectly on a past candle).
        if(pos.openTime != null && candle.time < pos.openTime) return
        if(espera(pos)){ ps.sltpDesde=Math.min(ps.sltpDesde??i,i); return }
        // la regla de la vela (Ramon, orden 1-085; lib/sim/vela.js): si toca el SL y el TP, el que el
        // recorrido de la vela alcanza antes; una pendiente llenada en esta vela, desde su entrada
        if(ruta===undefined) ruta=rutaDe(candle,i)
        const toca=cierreEnVela(pos,candle,{llenadaAqui:pos.porLimite&&candle.time===pos.openTime,par:pair,ruta})
        // la hora, la de la vela que lo toca: en una reevaluacion (reevaluaSLTP) es anterior al motor (GOTOG1-01)
        if(toca==='TP') toClose.push({id:pos.id,reason:'TP',price:pos.tp,hora:candle.time})
        else if(toca==='SL') toClose.push({id:pos.id,reason:'SL',price:pos.sl,hora:candle.time})
      })
    }
    toClose.forEach(({id,reason,price,hora})=>closePositionRef.current(id,reason,pair,price,null,hora))
  },[id])

  // Devuelve las posiciones que abre ({ids, desdeIdx}: la primera vela de llenado) o null; el onTick
  // les mira SL/TP desde esa vela, la del llenado incluida (M04, orden 1-081)
  const checkLimitOrders=useCallback((pair,engine)=>{
    if(v1Ref?.current) return null
    const ps=pairState.current[pair]; if(!ps?.orders?.length) return null
    const curIdx=engine.currentIndex
    const fromIdx = ps.lastLimitIdx != null ? ps.lastLimitIdx + 1 : curIdx
    ps.lastLimitIdx = curIdx

    const executed=[], abiertas=[]
    let desdeIdx=null
    for(let i=fromIdx; i<=curIdx; i++){
      const candle=engine.candles[i]; if(!candle) continue
      ps.orders.forEach(order=>{
        if(executed.includes(order.id)) return
        // FIX BUG A: Skip candles before this LIMIT was placed.
        // Without this guard, a past candle that already crossed the entry would activate the LIMIT retroactively.
        if(order.createdTime != null && candle.time < order.createdTime) return
        const hit=isFilled({isLong:isLongSide(order.side),entry:order.entry,high:candle.high,low:candle.low})
        if(!hit) return
        executed.push(order.id)
        const cr=chartMap.current[pair]
        if(cr?.priceLines){
          ['_entry','_sl','_tp'].forEach(k=>{
            if(cr.priceLines[order.id+k]){try{cr.series.removePriceLine(cr.priceLines[order.id+k])}catch{};delete cr.priceLines[order.id+k]}
          })
        }
        const side=order.side==='BUY_LIMIT'?'BUY':'SELL'
        if(!ps.positions) ps.positions=[]
        const posId=`P${Date.now()}-${Math.random().toString(36).slice(2,5)}`
        // openTime = timestamp of the candle that triggered the LIMIT, not engine.currentTime.
        // This ensures checkSLTP only checks candles AFTER this position was actually opened.
        const newPos={id:posId,pair,side,entry:order.entry,sl:order.sl,tp:order.tp,lots:order.lots,slPips:order.slPips,tpPips:order.tpPips,rr:order.rr,openTime:candle.time,initialSlPips:order.slPips,porLimite:true}
        ps.positions=[...ps.positions,newPos]
        abiertas.push(posId); if(desdeIdx==null) desdeIdx=i
        setTimeout(()=>createPositionLines(posId,pair,newPos),50)
      })
    }
    if(executed.length){
      ps.orders=ps.orders.filter(o=>!executed.includes(o.id))
      setTick(t=>t+1)
    }
    return abiertas.length ? { ids:abiertas, desdeIdx } : null
  },[])

  return {
    closePosition, closePartial, createPositionLines,
    previewOrder, confirmLimitOrder, cancelPreview, handlePositionDragEnd,
    cancelLimitOrder, updatePreviewSl, updatePreviewTp,
    checkSLTP, checkLimitOrders,
  }
}
