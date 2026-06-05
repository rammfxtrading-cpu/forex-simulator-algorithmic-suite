/**
 * components/SessionPanels.js — paneles de posiciones, órdenes límite y journal (Fase 7, Corte C, s59).
 * Extraídos 1:1 de components/_SessionInner.js (baseline 2511, md5 b3433273) en un fragment.
 */

import { s } from './sessionStyles'
import { fmtPx, pnlColor, fmtPnl, fmtTs } from '../lib/sessionUi'
import { calcPnl } from '../lib/trading/pricing'

export default function SessionPanels({showPos,setShowPos,openPositions,closePosition,currentPrice,activePair,setCloseModal,showOrders,setShowOrders,pendingOrders,cancelLimitOrder,showTrades,setShowTrades,allTrades}){
  return(<>
      {/* POSITIONS PANEL */}
      {showPos&&openPositions.length>0&&(
        <div style={s.panel}>
          <div style={s.panelHdr}>
            <span style={s.panelTitle}>POSICIONES ABIERTAS</span>
            <div style={{display:'flex',gap:8}}>
              <button style={s.dangerBtn} onClick={()=>{openPositions.forEach(p=>closePosition(p.id));setShowPos(false)}}>Cerrar todas</button>
              <button style={s.iconBtn} onClick={()=>setShowPos(false)}>✕</button>
            </div>
          </div>
          <div style={{overflowX:'auto'}}>
            <table style={s.tbl}>
              <thead><tr>{['PAR','DIR','ENTRADA','ACTUAL','SL','TP','LOTS','P&L',''].map(h=><th key={h} style={s.th}>{h}</th>)}</tr></thead>
              <tbody>
                {openPositions.map(pos=>{
                  const pnl=calcPnl(pos.side,pos.entry,currentPrice??pos.entry,pos.lots,activePair)
                  return(
                    <tr key={pos.id} style={s.tblRow}>
                      <td style={s.td}>{pos.pair}</td>
                      <td style={{...s.td,color:pos.side==='BUY'?'#1E90FF':'#ef5350',fontWeight:800}}>{pos.side}</td>
                      <td style={s.td}>{fmtPx(pos.entry,pos.pair)}</td>
                      <td style={s.td}>{fmtPx(currentPrice,pos.pair)}</td>
                      <td style={{...s.td,color:'rgba(239,83,80,0.7)'}}>{fmtPx(pos.sl,pos.pair)}</td>
                      <td style={{...s.td,color:'rgba(30,144,255,0.7)'}}>{fmtPx(pos.tp,pos.pair)}</td>
                      <td style={s.td}>{pos.lots}</td>
                      <td style={{...s.td,color:pnlColor(pnl),fontWeight:700}}>{fmtPnl(pnl)}</td>
                      <td style={s.td}><button style={s.closeBtn} onClick={()=>setCloseModal({posId:pos.id,pair:activePair,pos})}>✕</button></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* PENDING ORDERS */}
      {showOrders&&pendingOrders.length>0&&(
        <div style={s.panel}>
          <div style={s.panelHdr}>
            <span style={s.panelTitle}>ÓRDENES LÍMITE</span>
            <button style={s.iconBtn} onClick={()=>setShowOrders(false)}>✕</button>
          </div>
          <div style={{overflowX:'auto'}}>
            <table style={s.tbl}>
              <thead><tr>{['PAR','TIPO','ENTRADA','SL','TP','LOTS',''].map(h=><th key={h} style={s.th}>{h}</th>)}</tr></thead>
              <tbody>
                {pendingOrders.map(o=>(
                  <tr key={o.id} style={s.tblRow}>
                    <td style={s.td}>{o.pair}</td>
                    <td style={{...s.td,color:o.side==='BUY_LIMIT'?'#1E90FF':'#ef5350',fontWeight:700}}>{o.side==='BUY_LIMIT'?'Buy Limit':'Sell Limit'}</td>
                    <td style={s.td}>{fmtPx(o.entry,o.pair)}</td>
                    <td style={{...s.td,color:'rgba(239,83,80,0.6)'}}>{fmtPx(o.sl,o.pair)}</td>
                    <td style={{...s.td,color:'rgba(30,144,255,0.6)'}}>{fmtPx(o.tp,o.pair)}</td>
                    <td style={s.td}>{o.lots}</td>
                    <td style={s.td}><button style={s.closeBtn} onClick={()=>cancelLimitOrder(o.id,o.pair)}>✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TRADES JOURNAL */}
      {showTrades&&allTrades.length>0&&(
        <div style={s.panel}>
          <div style={s.panelHdr}>
            <span style={s.panelTitle}>JOURNAL</span>
            <button style={s.iconBtn} onClick={()=>setShowTrades(false)}>✕</button>
          </div>
          <div style={{overflowX:'auto'}}>
            <table style={s.tbl}>
              <thead><tr>{['PAR','DIR','ENTRY','EXIT','LOTS','R:R','P&L','RESULT','ABIERTO','CERRADO','NOTA'].map(h=><th key={h} style={s.th}>{h}</th>)}</tr></thead>
              <tbody>
                {allTrades.map((t,i)=>(
                  <tr key={i} style={s.tblRow}>
                    <td style={s.td}>{t.pair}</td>
                    <td style={{...s.td,color:t.side==='BUY'?'#1E90FF':'#ef5350',fontWeight:800}}>{t.side}</td>
                    <td style={s.td}>{fmtPx(t.entry,t.pair)}</td>
                    <td style={s.td}>{fmtPx(t.exit,t.pair)}</td>
                    <td style={s.td}>{t.lots}</td>
                    <td style={s.td}>{t.rrReal}R</td>
                    <td style={{...s.td,color:pnlColor(t.pnl),fontWeight:700}}>{fmtPnl(t.pnl)}</td>
                    <td style={{...s.td,color:t.result==='WIN'?'#1E90FF':t.result==='LOSS'?'#ef5350':'#a0b8d0',fontWeight:700}}>{t.result}</td>
                    <td style={{...s.td,color:'rgba(255,255,255,0.5)',fontSize:9}}>{fmtTs(t.openTime)}</td>
                    <td style={{...s.td,color:'rgba(255,255,255,0.5)',fontSize:9}}>{fmtTs(t.closeTime)}</td>
                    <td style={{...s.td,color:'rgba(255,255,255,0.6)',fontSize:9,maxWidth:120,overflow:'hidden',textOverflow:'ellipsis'}}>{t.note||'—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
  </>)
}
