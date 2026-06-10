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

import { useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { realizePnl, priceFromPips, isFilled, isLongSide } from '../lib/trading/orders'
import { pipMult } from '../lib/trading/pricing'
import { sessionKeyAt } from '../lib/killzonesDomain'

export default function useTradingActions({ id, activePair, currentPrice, currentTime, lots, preview, pairState, chartMap, sessionRef, balanceRef, userIdRef, closePositionRef, setBalance, setTick, setPreview, setCtxMenu, refreshChallengeStatus }){
  function createPositionLines(posId,pair,pos){
    // Lines are rendered by HTML overlay — no LWC price lines needed
  }

  function removePositionLines(posId,pair){
    // Lines are rendered by HTML overlay — nothing to remove from LWC
  }

  // closePosition accepts optional pair+exitPrice for use from engine.onTick
  const closePosition=useCallback(async(posId,reason='MANUAL',pairOverride,exitPriceOverride,note=null)=>{
    const usePair=pairOverride||activePair
    const usePrice=exitPriceOverride||currentPrice
    const ps=pairState.current[usePair];if(!ps||!usePrice) return
    const pos=ps.positions.find(p=>p.id===posId);if(!pos) return
    const { pnl, rrReal, result } = realizePnl({ side: pos.side, entry: pos.entry, exit: usePrice, lots: pos.lots, pair: usePair, initialSlPips: pos.initialSlPips, slPips: pos.slPips })
    ps.positions=ps.positions.filter(p=>p.id!==posId)
    ps.trades=[...ps.trades,{...pos,exit:usePrice,closeTime:currentTime,pnl,result,rrReal:parseFloat(rrReal.toFixed(2)),reason}]
    removePositionLines(posId,usePair)
    const newBalance = parseFloat((balanceRef.current+pnl).toFixed(2))
    balanceRef.current=newBalance // sync inmediato: si 2 posiciones cierran en la misma vela, la 2a debe leer el balance ya actualizado
    setBalance(newBalance);setTick(t=>t+1)
    if(userIdRef.current){
      try{
        // Convert ordinal timestamps → real unix timestamps for DB storage
        const ps2=pairState.current[usePair]
        const realOpenTime = pos.openTime??null
        const realCloseTime = currentTime>1000000000?currentTime:null
        await supabase.from('sim_trades').insert({
          user_id:userIdRef.current,
          session_id:id,
          pair:pos.pair,
          side:pos.side,
          lots:parseFloat(pos.lots)||0.01,
          entry_price:parseFloat(pos.entry)||0,
          exit_price:parseFloat(usePrice)||0,
          sl_price:parseFloat(pos.sl)||0,
          tp_price:parseFloat(pos.tp)||0,
          rr:parseFloat(rrReal.toFixed(2)),
          pnl:parseFloat(pnl.toFixed(2)),
          result,
          notes: note||null,
          session_type:(realOpenTime&&realOpenTime>1000000000)?sessionKeyAt(realOpenTime):null,
          opened_at:realOpenTime?new Date(realOpenTime*1000).toISOString():new Date().toISOString(),
          closed_at:realCloseTime?new Date(realCloseTime*1000).toISOString():new Date().toISOString(),
        })
        await supabase.from('sim_sessions').update({balance:newBalance,last_timestamp:currentTime}).eq('id',id)
      }catch(e){console.error(e)}
    }
    // Si es un challenge, refrescar HUD con nuevo balance/DD/target
    if(sessionRef.current?.challenge_type) refreshChallengeStatus()
  },[activePair,currentPrice,currentTime,id,refreshChallengeStatus])

  const previewOrder=useCallback((side, price, pair)=>{
    setCtxMenu(null)
    const defaultSl=10, defaultTp=30
    const sl=priceFromPips({isLong:isLongSide(side),entry:price,pips:defaultSl,pair,leg:'SL'})
    const tp=priceFromPips({isLong:isLongSide(side),entry:price,pips:defaultTp,pair,leg:'TP'})
    setPreview({pair,side,entry:price,sl,tp,lots,slPips:defaultSl,tpPips:defaultTp,rr:3})
  },[lots])

  const confirmLimitOrder=useCallback(()=>{
    if(!preview) return
    const ps=pairState.current[preview.pair]; if(!ps) return
    if(!ps.orders) ps.orders=[]
    const order={...preview, id:`L${Date.now()}`, createdTime:currentTime}
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
  const handlePositionDragEnd=useCallback((posId, type, newPrice)=>{
    const ps=pairState.current[activePair]; if(!ps) return
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

  const checkSLTP=useCallback((pair,engine)=>{
    const ps=pairState.current[pair];if(!ps?.positions?.length) return
    const curIdx=engine.currentIndex
    // Determine range to check — from last checked index+1 to current
    // This ensures no M1 candle is skipped at any speed (1x, 5x, 15x, 60x, ∞)
    const fromIdx = ps.lastSLTPIdx != null ? ps.lastSLTPIdx + 1 : curIdx
    ps.lastSLTPIdx = curIdx

    const toClose=[]
    for(let i=fromIdx; i<=curIdx; i++){
      const candle=engine.candles[i];if(!candle) continue
      const{high,low}=candle
      ps.positions.forEach(pos=>{
        if(toClose.find(x=>x.id===pos.id)) return // already queued
        // FIX BUG A: Skip candles before this position was opened.
        // Without this guard, past candles could trigger SL/TP retroactively
        // (e.g. when a LIMIT activated incorrectly on a past candle).
        if(pos.openTime != null && candle.time < pos.openTime) return
        const hitTp=pos.side==='BUY'?high>=pos.tp:low<=pos.tp
        const hitSl=pos.side==='BUY'?low<=pos.sl:high>=pos.sl
        if(hitTp) toClose.push({id:pos.id,reason:'TP',price:pos.tp})
        else if(hitSl) toClose.push({id:pos.id,reason:'SL',price:pos.sl})
      })
    }
    toClose.forEach(({id,reason,price})=>closePositionRef.current(id,reason,pair,price))
  },[])

  const checkLimitOrders=useCallback((pair,engine)=>{
    const ps=pairState.current[pair]; if(!ps?.orders?.length) return
    const curIdx=engine.currentIndex
    const fromIdx = ps.lastLimitIdx != null ? ps.lastLimitIdx + 1 : curIdx
    ps.lastLimitIdx = curIdx

    const executed=[]
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
        const newPos={id:posId,pair,side,entry:order.entry,sl:order.sl,tp:order.tp,lots:order.lots,slPips:order.slPips,tpPips:order.tpPips,rr:order.rr,openTime:candle.time,initialSlPips:order.slPips}
        ps.positions=[...ps.positions,newPos]
        setTimeout(()=>createPositionLines(posId,pair,newPos),50)
      })
    }
    if(executed.length){
      ps.orders=ps.orders.filter(o=>!executed.includes(o.id))
      setTick(t=>t+1)
    }
  },[])

  return {
    closePosition, createPositionLines,
    previewOrder, confirmLimitOrder, cancelPreview, handlePositionDragEnd,
    cancelLimitOrder, updatePreviewSl, updatePreviewTp,
    checkSLTP, checkLimitOrders,
  }
}
