import { useState } from 'react'

// ─── Order Modal — Fintech / Algorithmic Suite ────────────────────────────────
// Risk base: en sesiones de challenge (isChallenge=true) usamos `initialBalance`
// (capital inicial FIJO). Esto garantiza FTMO-style: 1% del riesgo SIEMPRE
// equivale a la misma cantidad de USD, independientemente de cómo evolucione
// el balance. Así, 5 pérdidas de 1% suman exactamente 5% del capital, lo que
// se alinea con el cap del DD diario (típicamente 5%) y evita el problema de
// "1% del balance vivo" que produce pérdidas de $999.50 → $989.50 → … y nunca
// llega exacto al cap.
// En sesiones libres (no-challenge), conservamos el comportamiento clásico
// (MT4-style): el riesgo se calcula sobre el balance actual.
export default function OrderModal({modal,balance,initialBalance,isChallenge,currentPrice,onClose,onConfirm}){
  const {side,entry,pair,isLimit,sl:initSl,tp:initTp,lots:initLots,slPips:initSlPips,tpPips:initTpPips,rr:initRr}=modal
  const isBuy=side==='BUY'
  const isJpy=pair?.includes('JPY')
  const mult=isJpy?100:10000
  const RISK_PRESETS=[0.3,0.5,0.7,1,2,3]
  const [riskPct,setRiskPct]=useState(1)
  const [slPips,setSlPips]=useState(initSlPips||10)
  const [tpPips,setTpPips]=useState(initTpPips||20)
  const [autoBE,setAutoBE]=useState(false)
  // Si OrderModal nace de LongShortModal, recibimos sl/tp EXACTOS del dibujo.
  // Mientras el usuario no edite pips, respetamos esos precios al pie de la
  // letra. En cuanto edite pips, recalculamos a partir de entry ± pips
  // (comportamiento clásico). Esto evita el desfase visual entre el
  // dibujo del long/short (precios decimales puros) y las líneas SL/TP
  // de la limit (que antes se recalculaban con pips redondeados a entero).
  const [pipsEdited,setPipsEdited]=useState(false)

  // Risk base mode (FTMO-style):
  // - 'initial' (DEFAULT, siempre activo en challenges): capital inicial fijo.
  //   1% siempre = misma cantidad USD, sin importar el balance vivo. Así 5
  //   pérdidas de 1% suman exactamente 5% (cap diario FTMO).
  // - 'live' (solo disponible en sesiones libres): balance vivo (MT4-style).
  // En challenge el toggle queda OCULTO y se fuerza 'initial' siempre.
  const [riskBaseMode,setRiskBaseMode]=useState('initial')
  const riskBase = (isChallenge || riskBaseMode === 'initial')
    ? (initialBalance || balance)
    : balance
  const riskAmt=parseFloat((riskBase*riskPct/100).toFixed(2))
  const pipVal=10
  const lots=slPips>0?parseFloat((riskAmt/(slPips*pipVal)).toFixed(2)):0.01
  const estLoss=(slPips*lots*pipVal).toFixed(2)
  const estProfit=(tpPips*lots*pipVal).toFixed(2)
  const rrRatio=slPips>0?(tpPips/slPips).toFixed(1):0
  const pipSz=1/mult
  // Si el usuario NO ha tocado los pips y vino con sl/tp del long/short,
  // usamos esos precios sin recalcular. Si los tocó, recalculamos.
  const sl = (!pipsEdited && initSl != null)
    ? initSl
    : (isBuy ? entry - slPips*pipSz : entry + slPips*pipSz)
  const tp = (!pipsEdited && initTp != null)
    ? initTp
    : (isBuy ? entry + tpPips*pipSz : entry - tpPips*pipSz)
  const fmtP=p=>p?.toFixed(isJpy?3:5)??'—'
  const accentColor=isBuy?'#1E90FF':'#ef5350'
  const accentRgb=isBuy?'30,144,255':'239,83,80'

  return(
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',zIndex:500,display:'flex',alignItems:'center',justifyContent:'center',backdropFilter:'blur(8px)',WebkitBackdropFilter:'blur(8px)',fontFamily:"'Montserrat',sans-serif"}} onClick={onClose}>
      <div style={{
        background:'rgba(0,20,60,0.55)',
        border:'1px solid rgba(0,120,255,0.5)',
        borderRadius:24,width:420,
        backdropFilter:'blur(32px)',WebkitBackdropFilter:'blur(32px)',
        boxShadow:`0 32px 80px rgba(0,0,0,0.6),0 0 0 1px rgba(${accentRgb},0.15),inset 0 1px 0 rgba(255,255,255,0.25)`,
        backdropFilter:'blur(40px) saturate(220%) brightness(1.08)',
        WebkitBackdropFilter:'blur(40px) saturate(220%) brightness(1.08)',
        overflow:'hidden',
      }} onClick={e=>e.stopPropagation()}>

        {/* Header */}
        <div style={{padding:'18px 22px 14px',borderBottom:'1px solid rgba(0,120,255,0.2)',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            <div style={{width:8,height:8,borderRadius:'50%',background:accentColor,boxShadow:`0 0 10px ${accentColor}`}}/>
            <span style={{fontSize:14,fontWeight:900,color:'#fff',letterSpacing:0.5}}>{isLimit?(isBuy?'BUY LIMIT':'SELL LIMIT'):(isBuy?'BUY MARKET':'SELL MARKET')}</span>
            <span style={{fontSize:11,color:'rgba(255,255,255,0.75)',fontWeight:600}}>{pair}</span>
          </div>
          <button onClick={onClose} style={{background:'rgba(0,40,100,0.4)',border:'1px solid rgba(0,120,255,0.3)',borderRadius:8,color:'rgba(255,255,255,0.9)',cursor:'pointer',width:28,height:28,display:'flex',alignItems:'center',justifyContent:'center',fontSize:13}}>✕</button>
        </div>

        <div style={{padding:'16px 22px 20px'}}>

          {/* P&L estimado — big numbers */}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:16}}>
            <div style={{background:'rgba(239,83,80,0.08)',border:'1px solid rgba(239,83,80,0.2)',borderRadius:14,padding:'12px 14px',position:'relative',overflow:'hidden'}}>
              <div style={{position:'absolute',inset:0,background:'linear-gradient(135deg,rgba(239,83,80,0.05),transparent)',borderRadius:14}}/>
              <div style={{fontSize:8,fontWeight:700,color:'rgba(239,83,80,0.6)',letterSpacing:1.5,marginBottom:4}}>PÉRDIDA MÁX</div>
              <div style={{fontSize:20,fontWeight:900,color:'rgba(239,83,80,0.95)',letterSpacing:-0.5}}>-${estLoss}</div>
            </div>
            <div style={{background:'rgba(30,144,255,0.08)',border:'1px solid rgba(30,144,255,0.2)',borderRadius:14,padding:'12px 14px',position:'relative',overflow:'hidden'}}>
              <div style={{position:'absolute',inset:0,background:'linear-gradient(135deg,rgba(30,144,255,0.05),transparent)',borderRadius:14}}/>
              <div style={{fontSize:8,fontWeight:700,color:'rgba(30,144,255,0.6)',letterSpacing:1.5,marginBottom:4}}>GANANCIA MÁX</div>
              <div style={{fontSize:20,fontWeight:900,color:'rgba(30,144,255,0.95)',letterSpacing:-0.5}}>+${estProfit}</div>
            </div>
          </div>

          {/* Risk % presets */}
          <div style={{marginBottom:14}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
              <div style={{fontSize:8,fontWeight:700,color:'rgba(255,255,255,0.7)',letterSpacing:1.5}}>RIESGO DEL BALANCE</div>
              {/* Toggle Inicial/Vivo solo visible fuera de challenges. En
                  challenges el riesgo siempre se calcula sobre capital inicial. */}
              {!isChallenge && (
                <button
                  type="button"
                  onClick={()=>setRiskBaseMode(m=>m==='initial'?'live':'initial')}
                  title={riskBaseMode==='initial'
                    ? 'Riesgo sobre capital inicial (FTMO). Click para cambiar a balance vivo.'
                    : 'Riesgo sobre balance vivo (MT4). Click para cambiar a capital inicial.'}
                  style={{
                    background:'rgba(30,144,255,0.1)',
                    border:'1px solid rgba(30,144,255,0.3)',
                    borderRadius:6,
                    padding:'2px 8px',
                    fontSize:9,
                    fontWeight:700,
                    color:'#1E90FF',
                    cursor:'pointer',
                    fontFamily:"'Montserrat',sans-serif",
                    letterSpacing:0.3,
                    textTransform:'uppercase',
                  }}>
                  {riskBaseMode==='initial'?'Inicial':'Vivo'}
                </button>
              )}
            </div>
            <div style={{display:'flex',gap:4,marginBottom:10,background:'rgba(0,20,60,0.4)',borderRadius:12,padding:4,border:'1px solid rgba(0,120,255,0.2)'}}>
              {RISK_PRESETS.map(r=>(
                <button key={r} onClick={()=>setRiskPct(r)} style={{
                  flex:1,padding:'6px 0',borderRadius:9,border:'none',
                  background:riskPct===r?accentColor:'transparent',
                  color:riskPct===r?'#fff':'rgba(255,255,255,0.4)',
                  fontSize:10,fontWeight:800,cursor:'pointer',
                  fontFamily:"'Montserrat',sans-serif",
                  boxShadow:riskPct===r?`0 2px 12px rgba(${accentRgb},0.4)`:'none',
                  transition:'all .15s',
                }}>{r}%</button>
              ))}
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
              <Field label="RIESGO %" value={riskPct} onChange={v=>setRiskPct(Math.max(0.01,parseFloat(v)||1))} step="0.1" accent={accentColor}/>
              <Field label="RIESGO $" value={riskAmt} readOnly accent={accentColor}/>
            </div>
          </div>

          {/* Size & Entry */}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:14}}>
            <Field label="LOTS" value={lots} readOnly accent={accentColor}/>
            <Field label="ENTRADA" value={fmtP(entry)} readOnly accent={accentColor}/>
          </div>

          {/* TP */}
          <div style={{background:'rgba(30,144,255,0.06)',border:'1px solid rgba(30,144,255,0.15)',borderRadius:14,padding:'12px 14px',marginBottom:8}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
              <div style={{display:'flex',alignItems:'center',gap:6}}>
                <div style={{width:6,height:6,borderRadius:'50%',background:'rgba(30,144,255,0.8)'}}/>
                <span style={{fontSize:9,fontWeight:800,color:'rgba(30,144,255,0.9)',letterSpacing:1}}>TAKE PROFIT</span>
              </div>
              <span style={{fontSize:9,fontWeight:700,color:'rgba(255,255,255,0.7)'}}>R:R {rrRatio}</span>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
              <Field label="PRECIO" value={fmtP(tp)} readOnly accent="rgba(30,144,255,0.8)"/>
              <Field label="PIPS" value={tpPips} onChange={v=>{setTpPips(Math.max(1,parseInt(v)||1));setPipsEdited(true)}} step="1" accent="rgba(30,144,255,0.8)"/>
            </div>
          </div>

          {/* SL */}
          <div style={{background:'rgba(239,83,80,0.06)',border:'1px solid rgba(239,83,80,0.15)',borderRadius:14,padding:'12px 14px',marginBottom:12}}>
            <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:8}}>
              <div style={{width:6,height:6,borderRadius:'50%',background:'rgba(239,83,80,0.8)'}}/>
              <span style={{fontSize:9,fontWeight:800,color:'rgba(239,83,80,0.9)',letterSpacing:1}}>STOP LOSS</span>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
              <Field label="PRECIO" value={fmtP(sl)} readOnly accent="rgba(239,83,80,0.8)"/>
              <Field label="PIPS" value={slPips} onChange={v=>{setSlPips(Math.max(1,parseInt(v)||1));setPipsEdited(true)}} step="1" accent="rgba(239,83,80,0.8)"/>
            </div>
          </div>

          {/* Auto BE */}
          <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:16,cursor:'pointer'}} onClick={()=>setAutoBE(v=>!v)}>
            <div style={{width:36,height:20,borderRadius:10,background:autoBE?accentColor:'rgba(255,255,255,0.1)',border:'1px solid rgba(255,255,255,0.15)',position:'relative',transition:'all .2s'}}>
              <div style={{position:'absolute',top:2,left:autoBE?18:2,width:14,height:14,borderRadius:'50%',background:'#fff',transition:'left .2s',boxShadow:'0 1px 4px rgba(0,0,0,0.3)'}}/>
            </div>
            <span style={{fontSize:9,fontWeight:700,color:'rgba(255,255,255,0.8)',letterSpacing:0.5}}>AUTO BREAK-EVEN</span>
          </div>

          {/* Confirm */}
          <button onClick={()=>onConfirm({lots,sl,tp,slPips,tpPips,rr:parseFloat(rrRatio),estLoss,estProfit,riskPct,riskAmt})} style={{
            width:'100%',
            background:`linear-gradient(135deg,${accentColor},${isBuy?'#0050aa':'#aa1010'})`,
            border:'none',borderRadius:14,padding:'14px',
            fontSize:13,fontWeight:900,color:'#fff',cursor:'pointer',
            fontFamily:"'Montserrat',sans-serif",letterSpacing:0.5,
            boxShadow:`0 4px 24px rgba(${accentRgb},0.4),inset 0 1px 0 rgba(255,255,255,0.2)`,
          }}>
            {isLimit?(isBuy?'▲  Colocar Buy Limit':'▼  Colocar Sell Limit'):(isBuy?'▲  Ejecutar Buy':'▼  Ejecutar Sell')}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({label,value,onChange,readOnly,step,accent}){
  return(
    <div style={{minWidth:0}}>
      <div style={{fontSize:7,fontWeight:700,color:'rgba(255,255,255,0.8)',letterSpacing:1.5,marginBottom:5}}>{label}</div>
      <div style={{
        display:'flex',alignItems:'center',
        background:'rgba(255,255,255,0.06)',
        border:`1px solid ${readOnly?'rgba(255,255,255,0.08)':accent||'rgba(255,255,255,0.15)'}`,
        borderRadius:10,padding:'0 12px',height:36,
      }}>
        <input type="number" step={step||'any'} value={value} readOnly={readOnly}
          onChange={e=>onChange&&onChange(e.target.value)}
          style={{flex:1,minWidth:0,width:0,background:'none',border:'none',color:'rgba(255,255,255,0.92)',fontSize:12,fontWeight:700,outline:'none',fontFamily:"'Montserrat',sans-serif",cursor:readOnly?'default':'text'}}
        />
      </div>
    </div>
  )
}
