/**
 * components/PositionOverlay.js — líneas HTML de posiciones/órdenes sobre el chart con drag
 * fiable de SL/TP (Fase 7, Corte B, s59). Extraído 1:1 de components/_SessionInner.js
 * (baseline 2942, md5 3a975a14). Deps: solo hooks de React; el chart llega por props (chartMap).
 */

import { useEffect, useRef, useState, useCallback } from 'react'

// ─── Position Overlay — HTML lines with reliable drag ────────────────────────
export default function PositionOverlay({positions,pendingOrders,chartMap,activePair,dataReady,onClosePos,onCancelOrder,onDragEnd,chartTick}){
  const [lines,    setLines]    = useState([])
  const dragState = useRef(null) // {posId, type, active:bool}
  const chartElRef = useRef(null)

  // Get chart DOM element once
  useEffect(()=>{
    const cr = chartMap.current[activePair]
    if(cr?.chart) {
      try{ chartElRef.current = cr.chart.chartElement() }catch{}
    }
  },[activePair, dataReady])

  // update — computa Y posiciones de cada línea visible (entry/SL/TP).
  // Extraído como useCallback estable (sub-fase 5d.6) para dispararlo desde 2 sitios:
  //  (a) polling 150ms — defensa contra zoom Y u otros eventos sin contrato formal.
  //  (b) bump de chartTick — cambio TF / dataset (contrato 5d.1, ataja latencia ~150ms→~16ms).
  const update=useCallback(()=>{
    if(!dataReady) return
    // Skip if nothing to show — saves CPU when no trades are open
    if(!positions.length && !pendingOrders?.length){ setLines([]); return }
    const cr=chartMap.current[activePair]; if(!cr?.series) return
    const all=[]
    positions.forEach(pos=>{
      let eY=null,slY=null,tpY=null
      try{eY =cr.series.priceToCoordinate(pos.entry)}catch{}
      try{slY=cr.series.priceToCoordinate(pos.sl)}catch{}
      try{tpY=cr.series.priceToCoordinate(pos.tp)}catch{}
      const slPnl=(-(pos.slPips*pos.lots*10)).toFixed(2)
      const tpPnl='+'+(pos.tpPips*pos.lots*10).toFixed(2)
      if(eY!=null)  all.push({id:pos.id+'_e', posId:pos.id,type:'entry',y:Math.round(eY),label:`${pos.side} ${pos.lots}L`,  color:'rgba(200,200,200,0.55)',drag:false,close:true})
      if(slY!=null) all.push({id:pos.id+'_sl',posId:pos.id,type:'sl',   y:Math.round(slY),label:`SL  -$${slPnl}`,            color:'rgba(239,83,80,0.65)',  drag:true, close:false})
      if(tpY!=null) all.push({id:pos.id+'_tp',posId:pos.id,type:'tp',   y:Math.round(tpY),label:`TP  ${tpPnl}`,              color:'rgba(30,144,255,0.65)', drag:true, close:false})
    })
    ;(pendingOrders||[]).forEach(ord=>{
      const cr2=chartMap.current[activePair]
      let eY=null,slY=null,tpY=null
      try{eY =cr2?.series?.priceToCoordinate(ord.entry)}catch{}
      try{slY=cr2?.series?.priceToCoordinate(ord.sl)}catch{}
      try{tpY=cr2?.series?.priceToCoordinate(ord.tp)}catch{}
      const lbl=ord.side==='BUY_LIMIT'?'B.LIM':'S.LIM'
      if(eY!=null)  all.push({id:ord.id+'_e', ordId:ord.id,type:'lim_e', y:Math.round(eY), label:`${lbl} ${ord.lots}L`,color:'rgba(180,180,180,0.55)',drag:true, cancel:true})
      if(slY!=null) all.push({id:ord.id+'_sl',ordId:ord.id,type:'lim_sl',y:Math.round(slY),label:'SL', color:'rgba(239,83,80,0.5)',  drag:true, cancel:true})
      if(tpY!=null) all.push({id:ord.id+'_tp',ordId:ord.id,type:'lim_tp',y:Math.round(tpY),label:'TP', color:'rgba(30,144,255,0.5)', drag:true, cancel:true})
    })
    if(!dragState.current?.active) setLines(all)
  },[positions,pendingOrders,chartMap,activePair,dataReady])

  // Polling 150ms — defensa contra zoom Y u otros eventos sin contrato formal.
  useEffect(()=>{
    if(!dataReady) return
    update()
    const iv=setInterval(update,150)
    return()=>clearInterval(iv)
  },[update,dataReady])

  // Recálculo inmediato cuando bumpea chartTick (cambio TF / dataset — sub-fase 5d.6).
  useEffect(()=>{ update() },[chartTick,update])

  // Drag handlers
  const onLineMouseDown=(e,line)=>{
    if(!line.drag) return
    e.stopPropagation()
    e.preventDefault()
    // Use ordId for limit orders, posId for open positions
    dragState.current={posId:line.ordId||line.posId,type:line.type,active:true}
  }

  useEffect(()=>{
    const onMove=e=>{
      if(!dragState.current?.active) return
      const cr=chartMap.current[activePair]; if(!cr?.series) return
      const el=chartElRef.current||cr.chart.chartElement?.()
      if(!el) return
      const rect=el.getBoundingClientRect()
      const y=e.clientY-rect.top
      let price=null
      try{price=cr.series.coordinateToPrice(y)}catch{}
      if(price==null||isNaN(price)) return
      // Move line visually during drag
      const ds=dragState.current; if(!ds) return
      setLines(prev=>prev.map(l=>{
        const id=l.ordId||l.posId
        return id===ds.posId&&l.type===ds.type
          ? {...l,y:Math.round(y)}
          : l
      }))
    }
    const onUp=e=>{
      if(!dragState.current?.active) return
      const cr=chartMap.current[activePair]; if(!cr?.series) return
      const el=chartElRef.current||cr.chart.chartElement?.()
      if(el){
        const rect=el.getBoundingClientRect()
        const y=e.clientY-rect.top
        let price=null
        try{price=cr.series.coordinateToPrice(y)}catch{}
        if(price!=null&&!isNaN(price)){
          onDragEnd(dragState.current.posId,dragState.current.type,price)
        }
      }
      dragState.current=null
    }
    window.addEventListener('mousemove',onMove)
    window.addEventListener('mouseup',onUp)
    return()=>{
      window.removeEventListener('mousemove',onMove)
      window.removeEventListener('mouseup',onUp)
    }
  },[activePair,onDragEnd])

  if(!dataReady||lines.length===0) return null

  return(
    <div style={{position:'absolute',inset:0,pointerEvents:'none',zIndex:5,overflow:'hidden'}}>
      {lines.map(line=>(
        <div key={line.id} style={{
          position:'absolute',
          left:0,right:0,
          top:line.y-10,
          height:20,
          pointerEvents:'auto',
          cursor:line.drag?'ns-resize':'default',
          userSelect:'none',
        }}
          onMouseDown={e=>onLineMouseDown(e,line)}
        >
          {/* Visible line */}
          <div style={{
            position:'absolute',left:0,right:0,
            top:'50%',transform:'translateY(-50%)',
            height:1,background:line.color,
          }}/>
          {/* Label + buttons */}
          <div style={{
            position:'absolute',right:56,top:'50%',transform:'translateY(-50%)',
            display:'flex',gap:4,alignItems:'center',
          }}>
            <div style={{
              background:'rgba(3,8,16,0.88)',
              border:`1px solid ${line.color}`,
              borderRadius:3,padding:'2px 7px',
              fontSize:8,fontWeight:700,color:'#ffffff',
              whiteSpace:'nowrap',
            }}>{line.label}</div>
            {line.drag&&(
              <div style={{
                background:'rgba(3,8,16,0.7)',
                border:`1px solid ${line.color}`,
                borderRadius:3,padding:'1px 4px',
                fontSize:9,color:'rgba(255,255,255,0.6)',
                cursor:'ns-resize',
              }}
                onMouseDown={e=>onLineMouseDown(e,line)}
              >⠿</div>
            )}
            {line.close&&(
              <button
                style={{background:'rgba(239,83,80,0.12)',border:'1px solid rgba(239,83,80,0.35)',borderRadius:3,color:'#ef5350',width:18,height:18,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',padding:0,fontSize:11,fontFamily:"'Montserrat',sans-serif"}}
                onMouseDown={e=>e.stopPropagation()}
                onClick={e=>{e.stopPropagation();onClosePos(line.posId)}}
              >✕</button>
            )}
            {line.cancel&&(
              <button
                style={{background:'rgba(239,83,80,0.1)',border:'1px solid rgba(239,83,80,0.3)',borderRadius:3,color:'#ef5350',width:18,height:18,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',padding:0,fontSize:11,fontFamily:"'Montserrat',sans-serif"}}
                onMouseDown={e=>e.stopPropagation()}
                onClick={e=>{e.stopPropagation();onCancelOrder(line.ordId)}}
              >✕</button>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
