/**
 * components/SessionBottomBar.js — barra inferior de la página de sesión (Fase 7, Corte C, s59).
 * Extraída 1:1 de components/_SessionInner.js (baseline 2511, md5 b3433273): Buy/Sell,
 * balance/PnL/Float + W-L, ChallengeHUD y toggles de paneles.
 */

import { s } from './sessionStyles'
import { pnlColor, fmtPnl } from '../lib/sessionUi'
import ChallengeHUD from './ChallengeHUD'

export default function SessionBottomBar({lastTrade,challengeLocked,setOrderModal,currentPrice,activePair,dataReady,balance,realized,unrealized,allTrades,challengeStatus,openPositions,pendingOrders,showPos,setShowPos,showOrders,setShowOrders,showTrades,setShowTrades}){
  return(
      <div style={s.btmBar}>
        {/* BUY / SELL */}
        <div style={s.tradeActions}>
          <button
            style={{
              ...s.buyBtn,
              ...(lastTrade==='BUY'?s.flash:{}),
              ...(challengeLocked ? {opacity:0.35, cursor:'not-allowed'} : {}),
            }}
            title={challengeLocked ? 'Challenge terminado — no se pueden abrir nuevas operaciones' : undefined}
            onClick={()=>setOrderModal({side:'BUY',entry:currentPrice,pair:activePair,isLimit:false})}
            disabled={!dataReady||!currentPrice||challengeLocked}>
            ▲ Buy
          </button>
          <button
            style={{
              ...s.sellBtn,
              ...(lastTrade==='SELL'?s.flash:{}),
              ...(challengeLocked ? {opacity:0.35, cursor:'not-allowed'} : {}),
            }}
            title={challengeLocked ? 'Challenge terminado — no se pueden abrir nuevas operaciones' : undefined}
            onClick={()=>setOrderModal({side:'SELL',entry:currentPrice,pair:activePair,isLimit:false})}
            disabled={!dataReady||!currentPrice||challengeLocked}>
            ▼ Sell
          </button>
        </div>

        <div style={{flex:1}}/>

        {/* Balance info — right side like FX Replay */}
        <div style={s.balanceRow}>
          <span style={s.balLbl}>Balance: <span style={s.balVal}>${balance.toFixed(2)}</span></span>
          <span style={s.balLbl}>PnL: <span style={{...s.balVal,color:pnlColor(realized)}}>{fmtPnl(realized)}</span></span>
          <span style={s.balLbl}>Float: <span style={{...s.balVal,color:pnlColor(unrealized)}}>{fmtPnl(unrealized)}</span></span>
          {allTrades.length>0&&(()=>{
            const wins=allTrades.filter(t=>t.result==='WIN').length
            const losses=allTrades.filter(t=>t.result==='LOSS').length
            const wr=allTrades.length>0?Math.round(wins/allTrades.length*100):0
            return(
              <>
                <div style={{width:1,height:16,background:'rgba(255,255,255,0.1)'}}/>
                <span style={s.balLbl}><span style={{color:wins>0?'#1E90FF':'rgba(255,255,255,0.4)',fontWeight:700}}>{wins}W</span> <span style={{color:'rgba(255,255,255,0.3)'}}>·</span> <span style={{color:losses>0?'#ef5350':'rgba(255,255,255,0.4)',fontWeight:700}}>{losses}L</span></span>
                <span style={{...s.balLbl,color:wr>=50?'#1E90FF':'#ef5350',fontWeight:700}}>{wr}%</span>
              </>
            )
          })()}
          <ChallengeHUD status={challengeStatus} />
        </div>

        <div style={s.pillDivider}/>

        {/* Panels toggle */}
        <div style={s.toggleRow}>
          {openPositions.length>0&&(
            <button style={{...s.togBtn,...(showPos?s.togOn:{})}} onClick={()=>{setShowPos(v=>!v);setShowTrades(false);setShowOrders(false)}}>
              {openPositions.length} POS
            </button>
          )}
          {pendingOrders.length>0&&(
            <button style={{...s.togBtn,...(showOrders?s.togOn:{})}} onClick={()=>{setShowOrders(v=>!v);setShowPos(false);setShowTrades(false)}}>
              {pendingOrders.length} LIMIT
            </button>
          )}
          {allTrades.length>0&&(
            <button style={{...s.togBtn,...(showTrades?s.togOn:{})}} onClick={()=>{setShowTrades(v=>!v);setShowPos(false);setShowOrders(false)}}>
              {allTrades.length} TRADES
            </button>
          )}
        </div>
      </div>
  )
}
