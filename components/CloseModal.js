/**
 * components/CloseModal.js — modal de cierre total/parcial de posición (Fase 7, Corte B, s59).
 * Extraído 1:1 de components/_SessionInner.js (baseline 2942, md5 3a975a14). Autocontenido:
 * estilos inline propios; deps useState (React) y calcPnl (pricing). El isJpy local es un
 * boolean del par (no la función de pricing), igual que en el original.
 */

import { useState } from 'react'
import { calcPnl } from '../lib/trading/pricing'

// ─── Close / Partial Close Modal ─────────────────────────────────────────────
export default function CloseModal({modal,currentPrice,onClose,onConfirm}){
  const {pos,pair}=modal
  const isBuy=pos.side==='BUY'
  const isJpy=pair?.includes('JPY')
  const PRESETS=[10,25,50,75,90,100]
  const [pct,setPct]=useState(100)
  const [customPct,setCustomPct]=useState('')   // input libre 1-100
  const [note,setNote]=useState('')
  // pct efectivo: si el usuario escribió un custom válido, se usa; si no, el preset.
  const customNum = parseFloat(customPct)
  const usingCustom = customPct !== '' && !isNaN(customNum) && customNum>0 && customNum<=100
  const effectivePct = usingCustom ? customNum : pct
  const lotsToClose=parseFloat((pos.lots*effectivePct/100).toFixed(2))
  const estPnl=calcPnl(pos.side,pos.entry,currentPrice||pos.entry,lotsToClose,pair)
  const fmtP=p=>p?.toFixed(isJpy?3:5)??'—'
  const isProfit=estPnl>=0
  const pnlColor=isProfit?'rgba(30,144,255,0.95)':'rgba(239,83,80,0.95)'
  const accentColor=isBuy?'#1E90FF':'#ef5350'
  const accentRgb=isBuy?'30,144,255':'239,83,80'

  return(
    <div style={{position:'fixed',inset:0,background:'rgba(0,5,20,0.75)',zIndex:500,display:'flex',alignItems:'center',justifyContent:'center',backdropFilter:'blur(8px)',WebkitBackdropFilter:'blur(8px)',fontFamily:"'Montserrat',sans-serif"}} onClick={onClose}>
      <div style={{
        background:'rgba(255,255,255,0.07)',
        border:'1px solid rgba(255,255,255,0.18)',
        borderRadius:24,width:380,
        boxShadow:'0 32px 80px rgba(0,0,0,0.6),inset 0 1px 0 rgba(255,255,255,0.25)',
        backdropFilter:'blur(40px) saturate(220%) brightness(1.08)',
        WebkitBackdropFilter:'blur(40px) saturate(220%) brightness(1.08)',
        overflow:'hidden',
      }} onClick={e=>e.stopPropagation()}>

        {/* Header */}
        <div style={{padding:'18px 22px 14px',borderBottom:'1px solid rgba(255,255,255,0.08)',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            <div style={{width:8,height:8,borderRadius:'50%',background:accentColor,boxShadow:`0 0 10px ${accentColor}`}}/>
            <span style={{fontSize:14,fontWeight:900,color:'#fff'}}>{pos.side} — {pair}</span>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:6}}>
            <span style={{fontSize:9,color:'#ffffff',fontWeight:600}}>{pos.lots}L @ {fmtP(pos.entry)}</span>
            <button onClick={onClose} style={{background:'rgba(255,255,255,0.08)',border:'1px solid rgba(255,255,255,0.12)',borderRadius:8,color:'#ffffff',cursor:'pointer',width:28,height:28,display:'flex',alignItems:'center',justifyContent:'center',fontSize:13}}>✕</button>
          </div>
        </div>

        <div style={{padding:'16px 22px 20px'}}>

          {/* P&L big */}
          <div style={{
            background:isProfit?'rgba(30,144,255,0.08)':'rgba(239,83,80,0.08)',
            border:`1px solid ${isProfit?'rgba(30,144,255,0.2)':'rgba(239,83,80,0.2)'}`,
            borderRadius:16,padding:'16px',textAlign:'center',marginBottom:16,
          }}>
            <div style={{fontSize:8,fontWeight:700,color:'#ffffff',letterSpacing:1.5,marginBottom:6}}>P&L ESTIMADO</div>
            <div style={{fontSize:28,fontWeight:900,color:pnlColor,letterSpacing:-1}}>{estPnl>=0?'+':''}{estPnl.toFixed(2)}</div>
            <div style={{fontSize:8,color:'#ffffff',marginTop:4}}>precio actual: {fmtP(currentPrice)}</div>
          </div>

          {/* % presets */}
          <div style={{marginBottom:14}}>
            <div style={{fontSize:8,fontWeight:700,color:'#ffffff',letterSpacing:1.5,marginBottom:8}}>PORCENTAJE A CERRAR</div>
            <div style={{display:'flex',gap:6,marginBottom:10}}>
              <div style={{flex:1,display:'flex',gap:3,background:'rgba(255,255,255,0.04)',borderRadius:12,padding:4}}>
                {PRESETS.map(p=>(
                  <button key={p} onClick={()=>{setPct(p);setCustomPct('')}} style={{
                    flex:1,padding:'7px 0',borderRadius:9,border:'none',
                    background:(!usingCustom && pct===p)?accentColor:'transparent',
                    color:(!usingCustom && pct===p)?'#fff':'rgba(255,255,255,0.4)',
                    fontSize:11,fontWeight:800,cursor:'pointer',
                    fontFamily:"'Montserrat',sans-serif",
                    boxShadow:(!usingCustom && pct===p)?`0 2px 12px rgba(${accentRgb},0.4)`:'none',
                  }}>{p}%</button>
                ))}
              </div>
              {/* Input libre — se ilumina sólo cuando hay un valor válido escrito */}
              <div style={{
                display:'flex',alignItems:'center',gap:0,
                background:usingCustom?`rgba(${accentRgb},0.18)`:'rgba(255,255,255,0.04)',
                border:`1px solid ${usingCustom?accentColor:'rgba(255,255,255,0.08)'}`,
                borderRadius:12,padding:'0 8px',width:78,
                boxShadow:usingCustom?`0 2px 12px rgba(${accentRgb},0.25)`:'none',
                transition:'all 0.15s ease',
              }}>
                <input
                  type="number" min="1" max="100" step="1"
                  value={customPct}
                  onChange={e=>setCustomPct(e.target.value)}
                  placeholder="—"
                  style={{
                    width:'100%',background:'transparent',border:'none',outline:'none',
                    color:usingCustom?'#fff':'rgba(255,255,255,0.55)',
                    fontSize:11,fontWeight:800,fontFamily:"'Montserrat',sans-serif",
                    textAlign:'right',padding:'7px 0',
                  }}
                />
                <span style={{fontSize:10,fontWeight:700,color:usingCustom?'#fff':'rgba(255,255,255,0.4)',marginLeft:2}}>%</span>
              </div>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
              <div>
                <div style={{fontSize:7,fontWeight:700,color:'#ffffff',letterSpacing:1.5,marginBottom:5}}>LOTS A CERRAR</div>
                <div style={{display:'flex',alignItems:'center',background:'rgba(255,255,255,0.06)',border:'1px solid rgba(255,255,255,0.1)',borderRadius:10,padding:'0 12px',height:36}}>
                  <span style={{fontSize:13,fontWeight:700,color:'#fff'}}>{lotsToClose}</span>
                </div>
              </div>
              <div>
                <div style={{fontSize:7,fontWeight:700,color:'#ffffff',letterSpacing:1.5,marginBottom:5}}>RESTANTES</div>
                <div style={{display:'flex',alignItems:'center',background:'rgba(255,255,255,0.06)',border:'1px solid rgba(255,255,255,0.1)',borderRadius:10,padding:'0 12px',height:36}}>
                  <span style={{fontSize:13,fontWeight:700,color:'#ffffff'}}>{Math.max(0,parseFloat((pos.lots-lotsToClose).toFixed(2)))}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Note */}
          <div style={{marginBottom:14}}>
            <div style={{fontSize:8,fontWeight:700,color:'rgba(255,255,255,0.4)',letterSpacing:1.5,marginBottom:6}}>NOTA (OPCIONAL)</div>
            <textarea
              value={note} onChange={e=>setNote(e.target.value)}
              placeholder="¿Por qué entraste? ¿Qué salió bien o mal?..."
              rows={2}
              style={{width:'100%',background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.1)',borderRadius:10,padding:'8px 12px',color:'rgba(255,255,255,0.85)',fontSize:11,fontFamily:"'Montserrat',sans-serif",outline:'none',resize:'none',boxSizing:'border-box'}}
            />
          </div>

          {/* Confirm */}
          <button onClick={()=>onConfirm(lotsToClose,note.trim()||null)} style={{
            width:'100%',
            background:isProfit
              ?'linear-gradient(135deg,rgba(30,144,255,0.9),rgba(20,110,100,0.9))'
              :'linear-gradient(135deg,rgba(239,83,80,0.9),rgba(150,30,30,0.9))',
            border:'none',borderRadius:14,padding:'14px',
            fontSize:13,fontWeight:900,color:'#fff',cursor:'pointer',
            fontFamily:"'Montserrat',sans-serif",
            boxShadow:isProfit?'0 4px 24px rgba(30,144,255,0.3)':'0 4px 24px rgba(239,83,80,0.3)',
            inset:'0 1px 0 rgba(255,255,255,0.2)',
          }}>
            {effectivePct===100?'Cerrar posición':`Cerrar ${effectivePct}%`} · {estPnl>=0?'+':''}{estPnl.toFixed(2)}
          </button>
        </div>
      </div>
    </div>
  )
}
