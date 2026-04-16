import { useEffect, useState, useRef } from 'react'

function calcFVGs(candles, maxCount=6) {
  const fvgs = []
  if(!candles||candles.length<3) return fvgs
  for(let i=2;i<candles.length;i++){
    const c0=candles[i],c2=candles[i-2]
    if(c2.high < c0.low){
      const fvg={id:'b_'+c0.time,type:'bull',top:c0.low,bottom:c2.high,startTime:c2.time,endTime:c0.time,mitigated:false}
      for(let j=i+1;j<candles.length;j++){
        const c=candles[j];fvg.endTime=c.time
        if(c.low<=fvg.bottom){fvg.mitigated=true;break}
        if(c.low<fvg.top) fvg.top=c.low
      }
      fvgs.push(fvg)
    }
    if(c2.low > c0.high){
      const fvg={id:'s_'+c0.time,type:'bear',top:c2.low,bottom:c0.high,startTime:c2.time,endTime:c0.time,mitigated:false}
      for(let j=i+1;j<candles.length;j++){
        const c=candles[j];fvg.endTime=c.time
        if(c.high>=fvg.top){fvg.mitigated=true;break}
        if(c.high>fvg.bottom) fvg.bottom=c.high
      }
      fvgs.push(fvg)
    }
  }
  return fvgs.filter(f=>!f.mitigated).slice(-maxCount)
}

const DEF={visible:true,maxFvgs:6,bullColor:'#4e7dff',bearColor:'#d5d3d3',showLabel:true}

export default function FvgOverlay({chartMap,activePair,tick,dataReady}){
  const [boxes,setBoxes]=useState([])
  const [cfg,setCfg]=useState(DEF)
  const [hovered,setHovered]=useState(false)
  const [showPanel,setShowPanel]=useState(false)
  const panelRef=useRef(null)

  useEffect(()=>{
    if(!showPanel) return
    const fn=e=>{ if(panelRef.current&&!panelRef.current.contains(e.target)) setShowPanel(false) }
    document.addEventListener('mousedown',fn)
    return()=>document.removeEventListener('mousedown',fn)
  },[showPanel])

  useEffect(()=>{
    if(!cfg.visible||!dataReady||!activePair) return setBoxes([])
    const cr=chartMap.current[activePair]
    if(!cr?.chart||!cr?.series) return
    const allData=window.__algSuiteSeriesData
    const realLen=window.__algSuiteRealDataLen
    if(!allData||!realLen) return
    const fvgs=calcFVGs(allData.slice(0,realLen),cfg.maxFvgs)
    const ts=cr.chart.timeScale()
    const nb=[]
    for(const fvg of fvgs){
      try{
        const x1=ts.timeToCoordinate(fvg.startTime)
        const x2=ts.timeToCoordinate(fvg.endTime)
        const y1=cr.series.priceToCoordinate(fvg.top)
        const y2=cr.series.priceToCoordinate(fvg.bottom)
        if(x1==null||x2==null||y1==null||y2==null) continue
        const left=Math.min(x1,x2),width=Math.abs(x2-x1)
        const top=Math.min(y1,y2),height=Math.abs(y2-y1)
        if(width<1||height<0.5) continue
        nb.push({...fvg,left,top,width,height})
      }catch{}
    }
    setBoxes(nb)
  },[tick,dataReady,activePair,cfg])

  const bullRgba=cfg.bullColor+'38'
  const bearRgba=cfg.bearColor+'2e'

  return(
    <div style={{position:'absolute',inset:0,pointerEvents:'none',zIndex:5,overflow:'hidden'}}>

      {/* FVG boxes */}
      {cfg.visible&&boxes.map(b=>(
        <div key={b.id} style={{
          position:'absolute',left:b.left,top:b.top,
          width:b.width,height:Math.max(b.height,1),
          background:b.type==='bull'?bullRgba:bearRgba,
          border:'1px solid '+(b.type==='bull'?cfg.bullColor+'88':cfg.bearColor+'66'),
          boxSizing:'border-box',pointerEvents:'none'
        }}>
          {cfg.showLabel&&b.height>10&&(
            <span style={{position:'absolute',right:2,top:0,fontSize:7,fontWeight:700,
              color:b.type==='bull'?cfg.bullColor+'dd':cfg.bearColor+'aa',
              fontFamily:"'Montserrat',sans-serif",lineHeight:1}}>FVG</span>
          )}
        </div>
      ))}

      {/* Indicator label row — TradingView style */}
      <div
        style={{position:'absolute',top:4,left:6,pointerEvents:'all',
          display:'flex',alignItems:'center',gap:4,
          fontFamily:"'Montserrat',sans-serif",fontSize:11,
          color:cfg.visible?'rgba(255,255,255,0.82)':'rgba(255,255,255,0.35)',
          cursor:'default',userSelect:'none',lineHeight:1.4,
          whiteSpace:'nowrap'}}
        onMouseEnter={()=>setHovered(true)}
        onMouseLeave={()=>{ if(!showPanel) setHovered(false) }}
      >
        <span style={{fontWeight:500,letterSpacing:0.1}}>
          FVG &nbsp;{cfg.maxFvgs}
        </span>

        {/* Icons — visible on hover */}
        <span style={{display:'flex',alignItems:'center',gap:1,
          opacity:hovered||showPanel?1:0,transition:'opacity .12s',marginLeft:2}}>

          {/* Eye */}
          <button title={cfg.visible?'Ocultar':'Mostrar'}
            onClick={()=>setCfg(p=>({...p,visible:!p.visible}))}
            style={{background:'none',border:'none',cursor:'pointer',padding:'1px 3px',
              color:'rgba(255,255,255,0.55)',display:'flex',alignItems:'center',lineHeight:1}}>
            {cfg.visible
              ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
            }
          </button>

          {/* Settings */}
          <button title="Configuración" onClick={()=>setShowPanel(p=>!p)}
            style={{background:'none',border:'none',cursor:'pointer',padding:'1px 3px',
              color:'rgba(255,255,255,0.55)',display:'flex',alignItems:'center',lineHeight:1}}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
            </svg>
          </button>
        </span>

        {/* Settings panel */}
        {showPanel&&(
          <div ref={panelRef} style={{
            position:'absolute',top:'100%',left:0,marginTop:4,
            background:'rgba(10,14,26,0.97)',border:'1px solid rgba(255,255,255,0.1)',
            borderRadius:8,padding:'12px 14px',minWidth:210,
            boxShadow:'0 8px 32px rgba(0,0,0,0.7)',
            backdropFilter:'blur(20px)',zIndex:200,pointerEvents:'all'
          }}>
            <div style={{fontSize:10,fontWeight:700,color:'rgba(255,255,255,0.4)',
              letterSpacing:1,marginBottom:10,textTransform:'uppercase'}}>Fair Value Gap</div>

            {/* Nº FVGs */}
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
              <span style={{fontSize:11,color:'rgba(255,255,255,0.65)'}}>Nº de FVGs</span>
              <input type="number" min={1} max={20} value={cfg.maxFvgs}
                style={{width:52,background:'rgba(255,255,255,0.06)',border:'1px solid rgba(255,255,255,0.1)',
                  borderRadius:4,color:'#fff',fontSize:11,padding:'3px 6px',
                  fontFamily:"'Montserrat',sans-serif",outline:'none',textAlign:'right'}}
                onChange={e=>setCfg(p=>({...p,maxFvgs:Math.max(1,Math.min(20,+e.target.value||1))}))}/>
            </div>

            {/* Bull color */}
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
              <span style={{fontSize:11,color:'rgba(255,255,255,0.65)'}}>Alcista</span>
              <label style={{width:24,height:24,borderRadius:4,cursor:'pointer',
                border:'1px solid rgba(255,255,255,0.15)',overflow:'hidden',
                background:cfg.bullColor,display:'block'}}>
                <input type="color" value={cfg.bullColor}
                  style={{opacity:0,width:'100%',height:'100%',cursor:'pointer'}}
                  onChange={e=>setCfg(p=>({...p,bullColor:e.target.value}))}/>
              </label>
            </div>

            {/* Bear color */}
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
              <span style={{fontSize:11,color:'rgba(255,255,255,0.65)'}}>Bajista</span>
              <label style={{width:24,height:24,borderRadius:4,cursor:'pointer',
                border:'1px solid rgba(255,255,255,0.15)',overflow:'hidden',
                background:cfg.bearColor,display:'block'}}>
                <input type="color" value={cfg.bearColor}
                  style={{opacity:0,width:'100%',height:'100%',cursor:'pointer'}}
                  onChange={e=>setCfg(p=>({...p,bearColor:e.target.value}))}/>
              </label>
            </div>

            {/* Label toggle */}
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
              <span style={{fontSize:11,color:'rgba(255,255,255,0.65)'}}>Etiqueta FVG</span>
              <div onClick={()=>setCfg(p=>({...p,showLabel:!p.showLabel}))}
                style={{width:30,height:17,borderRadius:9,cursor:'pointer',position:'relative',
                  background:cfg.showLabel?'#2962FF':'rgba(255,255,255,0.15)',transition:'background .2s'}}>
                <div style={{position:'absolute',top:2.5,
                  left:cfg.showLabel?14:3,width:12,height:12,
                  borderRadius:'50%',background:'#fff',transition:'left .2s'}}/>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
