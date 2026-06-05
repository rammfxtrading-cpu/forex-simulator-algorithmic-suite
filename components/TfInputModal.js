/**
 * components/TfInputModal.js — mini-modal de entrada de timeframe por teclado (Fase 7, Corte A, s59).
 *
 * Extraído 1:1 de components/_SessionInner.js (baseline 3063 líneas, md5 4c628d05).
 * Presentacional puro, sin hooks. TF_VALID/TF_OPTS solo se usan aquí (privados del módulo).
 */

const TF_VALID={'1m':'M1','3m':'M3','5m':'M5','15m':'M15','30m':'M30','1h':'H1','4h':'H4','1d':'D1'}
const TF_OPTS=[{l:'1m',tf:'M1'},{l:'3m',tf:'M3'},{l:'5m',tf:'M5'},{l:'15m',tf:'M15'},{l:'30m',tf:'M30'},{l:'1h',tf:'H1'},{l:'4h',tf:'H4'},{l:'1d',tf:'D1'}]

export default function TfInputModal({tfInput,activeTf}){
  const match=TF_VALID[tfInput.toLowerCase().trim()]
  const ok=!!match
  return(
    <div style={{position:'fixed',inset:0,zIndex:9000,display:'flex',alignItems:'center',justifyContent:'center',pointerEvents:'none',fontFamily:"'Montserrat',sans-serif"}}>
      <div style={{background:'rgba(255,255,255,0.10)',border:'1px solid '+(ok?'rgba(41,98,255,0.7)':'rgba(255,255,255,0.22)'),borderRadius:20,backdropFilter:'blur(40px) saturate(200%) brightness(1.1)',WebkitBackdropFilter:'blur(40px) saturate(200%) brightness(1.1)',boxShadow:'0 24px 80px rgba(0,0,0,0.5),inset 0 1px 0 rgba(255,255,255,0.25)',padding:'20px 28px 18px',minWidth:240,textAlign:'center'}}>
        <div style={{fontSize:38,fontWeight:900,color:ok?'#2962FF':'#ffffff',letterSpacing:2,marginBottom:8,lineHeight:1}}>
          {tfInput}<span style={{display:'inline-block',width:2,height:38,background:ok?'#2962FF':'rgba(255,255,255,0.6)',marginLeft:3,verticalAlign:'middle',animation:'blink 1s step-end infinite'}}/>
        </div>
        <div style={{fontSize:11,fontWeight:700,color:ok?'rgba(41,98,255,0.9)':'rgba(255,255,255,0.3)',letterSpacing:1.5,marginBottom:16}}>
          {ok?('-> '+match):'1m  5m  15m  30m  1h  4h  1d'}
        </div>
        <div style={{display:'flex',gap:5,justifyContent:'center',flexWrap:'wrap'}}>
          {TF_OPTS.map(o=>(
            <div key={o.l} style={{padding:'3px 10px',borderRadius:6,fontSize:10,fontWeight:700,background:match===o.tf?'rgba(41,98,255,0.35)':activeTf===o.tf?'rgba(255,255,255,0.1)':'rgba(255,255,255,0.05)',border:'1px solid '+(match===o.tf?'rgba(41,98,255,0.7)':activeTf===o.tf?'rgba(255,255,255,0.2)':'rgba(255,255,255,0.08)'),color:match===o.tf?'#fff':activeTf===o.tf?'#fff':'rgba(255,255,255,0.4)'}}>{o.l}</div>
          ))}
        </div>
        {ok&&<div style={{marginTop:12,fontSize:9,color:'rgba(255,255,255,0.35)',fontWeight:600,letterSpacing:1}}>ENTER confirma  ESC cancela</div>}
      </div>
    </div>
  )
}
