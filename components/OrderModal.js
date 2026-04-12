import { useState } from 'react'

// ─── Order Modal (FX Replay style) ───────────────────────────────────────────
function OrderModal({modal,balance,currentPrice,onClose,onConfirm}){
  const {side,entry,pair,isLimit}=modal
  const isBuy=side==='BUY'
  const isJpyPair=pair?.includes('JPY')
  const mult=isJpyPair?100:10000

  const RISK_PRESETS=[0.3,0.5,0.7,1,2,3]
  const [riskPct,   setRiskPct]   = useState(1)
  const [slPips,    setSlPips]    = useState(10)
  const [tpPips,    setTpPips]    = useState(20)
  const [autoBE,    setAutoBE]    = useState(false)

  // Calculations
  const riskAmt   = parseFloat((balance * riskPct / 100).toFixed(2))
  const pipVal    = 10  // $10 per pip per standard lot
  const lots      = slPips>0 ? parseFloat((riskAmt/(slPips*pipVal)).toFixed(2)) : 0.01
  const estLoss   = (slPips*lots*pipVal).toFixed(2)
  const estProfit = (tpPips*lots*pipVal).toFixed(2)
  const rrRatio   = slPips>0 ? (tpPips/slPips).toFixed(1) : 0

  const pipSz=1/mult
  const sl=isBuy ? entry-slPips*pipSz : entry+slPips*pipSz
  const tp=isBuy ? entry+tpPips*pipSz : entry-tpPips*pipSz

  const fmtP=(p)=>p?.toFixed(isJpyPair?3:5)??'—'

  const handleConfirm=()=>{
    onConfirm({lots,sl,tp,slPips,tpPips,rr:parseFloat(rrRatio),estLoss,estProfit,riskPct,riskAmt})
  }

  return(
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.75)',zIndex:500,display:'flex',alignItems:'center',justifyContent:'center',backdropFilter:'blur(4px)',fontFamily:"'Montserrat',sans-serif"}}
      onClick={onClose}>
      <div style={{background:'#030f20',border:'1px solid #0d2040',borderRadius:14,width:440,boxShadow:'0 20px 60px #000000CC',overflow:'hidden'}}
        onClick={e=>e.stopPropagation()}>

        {/* Header */}
        <div style={{background:isBuy?'rgba(30,144,255,0.12)':'rgba(239,83,80,0.12)',borderBottom:'1px solid #0d2040',padding:'14px 20px',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <span style={{fontSize:13,fontWeight:800,color:isBuy?'#1E90FF':'#ef5350',letterSpacing:0.5}}>
            {isLimit?(isBuy?'Buy Limit':'Sell Limit'):(isBuy?'Buy Market':'Sell Market')}
          </span>
          <button onClick={onClose} style={{background:'none',border:'none',color:'#4a6080',cursor:'pointer',fontSize:16,fontFamily:"'Montserrat',sans-serif"}}>✕</button>
        </div>

        <div style={{padding:'20px'}}>

          {/* Estimated P&L */}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:18}}>
            <div style={{background:'rgba(239,83,80,0.07)',border:'1px solid rgba(239,83,80,0.2)',borderRadius:8,padding:'10px 14px',textAlign:'center'}}>
              <div style={{fontSize:8,fontWeight:700,color:'rgba(239,83,80,0.6)',letterSpacing:1,marginBottom:3}}>PÉRDIDA ESTIMADA</div>
              <div style={{fontSize:16,fontWeight:800,color:'rgba(239,83,80,0.9)'}}>-${estLoss}</div>
            </div>
            <div style={{background:'rgba(38,166,154,0.07)',border:'1px solid rgba(38,166,154,0.2)',borderRadius:8,padding:'10px 14px',textAlign:'center'}}>
              <div style={{fontSize:8,fontWeight:700,color:'rgba(38,166,154,0.6)',letterSpacing:1,marginBottom:3}}>GANANCIA ESTIMADA</div>
              <div style={{fontSize:16,fontWeight:800,color:'rgba(38,166,154,0.9)'}}>+${estProfit}</div>
            </div>
          </div>

          {/* Risk % presets */}
          <div style={{marginBottom:16}}>
            <div style={{fontSize:8,fontWeight:700,color:'#2a5070',letterSpacing:1,marginBottom:6}}>RIESGO % DEL BALANCE</div>
            <div style={{display:'flex',gap:4,marginBottom:8}}>
              {RISK_PRESETS.map(r=>(
                <button key={r}
                  style={{flex:1,padding:'5px 0',borderRadius:5,border:riskPct===r?'1px solid rgba(30,144,255,0.5)':'1px solid #0d2040',background:riskPct===r?'rgba(30,144,255,0.12)':'rgba(3,8,16,0.6)',color:riskPct===r?'#1E90FF':'#4a6080',fontSize:9,fontWeight:700,cursor:'pointer',fontFamily:"'Montserrat',sans-serif"}}
                  onClick={()=>setRiskPct(r)}>{r}%</button>
              ))}
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
              <Field label="RIESGO %" icon="%" value={riskPct} onChange={v=>setRiskPct(Math.max(0.01,Math.min(100,parseFloat(v)||1)))} step="0.1"/>
              <Field label="RIESGO $" icon="$" value={riskAmt} readOnly/>
            </div>
          </div>

          {/* Position size & Entry */}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:16}}>
            <Field label="TAMAÑO (LOTS)" icon="⬡" value={lots} readOnly/>
            <Field label="ENTRADA" icon="⊙" value={fmtP(entry)} readOnly/>
          </div>

          {/* TP */}
          <div style={{marginBottom:12}}>
            <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:6}}>
              <div style={{width:12,height:12,borderRadius:2,background:'rgba(38,166,154,0.5)',border:'1px solid rgba(38,166,154,0.6)',display:'flex',alignItems:'center',justifyContent:'center'}}>
                <div style={{width:6,height:6,background:'rgba(38,166,154,0.9)',borderRadius:1}}/>
              </div>
              <span style={{fontSize:9,fontWeight:700,color:'rgba(38,166,154,0.8)',letterSpacing:0.5}}>TAKE PROFIT</span>
              <span style={{fontSize:8,color:'rgba(38,166,154,0.5)',marginLeft:'auto'}}>R:R {rrRatio}</span>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
              <Field label="PRECIO" icon="⊙" value={fmtP(tp)} readOnly color="rgba(38,166,154,0.7)"/>
              <Field label="PIPS" icon="≡" value={tpPips} onChange={v=>setTpPips(Math.max(1,parseInt(v)||1))} step="1"/>
            </div>
          </div>

          {/* SL */}
          <div style={{marginBottom:16}}>
            <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:6}}>
              <div style={{width:12,height:12,borderRadius:2,background:'rgba(239,83,80,0.5)',border:'1px solid rgba(239,83,80,0.6)',display:'flex',alignItems:'center',justifyContent:'center'}}>
                <div style={{width:6,height:6,background:'rgba(239,83,80,0.9)',borderRadius:1}}/>
              </div>
              <span style={{fontSize:9,fontWeight:700,color:'rgba(239,83,80,0.8)',letterSpacing:0.5}}>STOP LOSS</span>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
              <Field label="PRECIO" icon="⊙" value={fmtP(sl)} readOnly color="rgba(239,83,80,0.7)"/>
              <Field label="PIPS" icon="≡" value={slPips} onChange={v=>setSlPips(Math.max(1,parseInt(v)||1))} step="1"/>
            </div>
          </div>

          {/* Auto BE */}
          <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:18,cursor:'pointer'}} onClick={()=>setAutoBE(v=>!v)}>
            <div style={{width:14,height:14,borderRadius:3,border:'1px solid #0d2040',background:autoBE?'rgba(30,144,255,0.3)':'transparent',display:'flex',alignItems:'center',justifyContent:'center'}}>
              {autoBE&&<span style={{color:'#1E90FF',fontSize:10,lineHeight:1}}>✓</span>}
            </div>
            <span style={{fontSize:9,fontWeight:600,color:'#4a6080'}}>Auto Break-Even</span>
          </div>

          {/* Confirm button */}
          <button onClick={handleConfirm}
            style={{width:'100%',background:isBuy?'linear-gradient(135deg,#1E90FF,#0060cc)':'linear-gradient(135deg,#ef5350,#b71c1c)',border:'none',borderRadius:8,padding:'12px',fontSize:12,fontWeight:800,color:'#fff',cursor:'pointer',fontFamily:"'Montserrat',sans-serif",boxShadow:isBuy?'0 4px 20px rgba(30,144,255,0.3)':'0 4px 20px rgba(239,83,80,0.3)',letterSpacing:0.5}}>
            {isLimit?(isBuy?'Colocar Buy Limit':'Colocar Sell Limit'):(isBuy?'Ejecutar Buy':'Ejecutar Sell')}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({label,icon,value,onChange,readOnly,step,color}){
  return(
    <div>
      <div style={{fontSize:7,fontWeight:700,color:'#2a5070',letterSpacing:1,marginBottom:4}}>{label}</div>
      <div style={{display:'flex',alignItems:'center',background:'rgba(3,8,16,0.8)',border:'1px solid #0d2040',borderRadius:6,padding:'0 10px',height:34}}>
        <span style={{fontSize:10,color:'#2a5070',marginRight:6,flexShrink:0}}>{icon}</span>
        <input
          type="number" step={step||"any"} value={value} readOnly={readOnly}
          onChange={e=>onChange&&onChange(e.target.value)}
          style={{flex:1,background:'none',border:'none',color:color||'#c0d0e8',fontSize:11,fontWeight:700,outline:'none',fontFamily:"'Montserrat',sans-serif",cursor:readOnly?'default':'text'}}
        />
      </div>
    </div>
  )
}

export default OrderModal
