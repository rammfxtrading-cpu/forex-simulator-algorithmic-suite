import { useEffect, useState } from 'react'

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

export default function FvgOverlay({chartMap,activePair,tick,dataReady}){
  const [boxes,setBoxes]=useState([])
  useEffect(()=>{
    if(!dataReady||!activePair) return
    const cr=chartMap.current[activePair]
    if(!cr?.chart||!cr?.series) return
    const allData=window.__algSuiteSeriesData
    const realLen=window.__algSuiteRealDataLen
    if(!allData||!realLen) return
    const candles=allData.slice(0,realLen)
    const fvgs=calcFVGs(candles,6)
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
  },[tick,dataReady,activePair])
  if(!boxes.length) return null
  return(
    <div style={{position:'absolute',inset:0,pointerEvents:'none',zIndex:5,overflow:'hidden'}}>
      {boxes.map(b=>(
        <div key={b.id} style={{position:'absolute',left:b.left,top:b.top,width:b.width,height:Math.max(b.height,1),background:b.type==='bull'?'rgba(78,125,255,0.18)':'rgba(213,211,211,0.15)',border:'1px solid '+(b.type==='bull'?'rgba(78,125,255,0.5)':'rgba(213,211,211,0.4)'),boxSizing:'border-box'}}>
          <span style={{position:'absolute',right:2,top:0,fontSize:7,fontWeight:700,color:b.type==='bull'?'rgba(78,125,255,0.9)':'rgba(200,200,200,0.7)',fontFamily:"'Montserrat',sans-serif",lineHeight:1}}>FVG</span>
        </div>
      ))}
    </div>
  )
}
