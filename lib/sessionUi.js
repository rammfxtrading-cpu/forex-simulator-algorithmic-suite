/**
 * lib/sessionUi.js — constantes y helpers de UI de la página de sesión (Fase 7, Corte A, s59).
 *
 * Extraído 1:1 de components/_SessionInner.js (baseline 3063 líneas, md5 4c628d05):
 * constantes TF/velocidades/pares, normPair, chartOpts (opciones del chart LWC),
 * formatters fmtPx/fmtPnl/pnlColor/fmtTs y computePhantomsNeeded.
 * Módulo puro: sin React ni Supabase. Única dependencia interna: isJpy (pricing).
 */

import { isJpy } from './trading/pricing'

export const TF_LIST     = ['M1','M3','M5','M15','M30','H1','H4','D1']
export const SPEED_OPTS  = [{l:'1×',v:1},{l:'5×',v:5},{l:'15×',v:15},{l:'60×',v:60},{l:'∞',v:500}]
export const ALL_PAIRS   = ['EUR/USD','GBP/USD','USD/JPY','USD/CHF','AUD/USD','USD/CAD','NZD/USD','AUD/CAD','EUR/GBP','EUR/JPY','GBP/JPY']

// Normaliza el simbolo de par a forma sin barra ('EUR/USD' -> 'EURUSD').
// Unifica capa challenge (ya sin barra) y capa dashboard/sim (con barra)
// en una sola convencion de clave para session_drawings.pair. Helper puro.
export const normPair = (p) => (p || '').replace(/\//g, '')

export function chartOpts(w,h){return{
  width:w,height:h,
  layout:{
    background:{color:'#000000'},
    textColor:'#ffffff',
    fontFamily:"'Montserrat',sans-serif",
    // FontSize 11 (antes 13). LWC calcula la densidad de ticks del eje Y
    // según el espacio que ocupan los labels. Con fontSize más pequeño caben
    // más ticks → resolución más fina (cada 25-10-5 pips según zoom),
    // similar a TradingView. Si subes a 13 vuelven los ticks de 50 en 50.
    fontSize:11,
  },
  grid:{
    vertLines:{color:'rgba(255,255,255,0.03)',style:0,visible:false},
    horzLines:{color:'rgba(255,255,255,0.06)',style:0,visible:false},
  },
  crosshair:{
    mode:0,
    vertLine:{color:'#ffffff',labelBackgroundColor:'#1a1a2e',width:1,style:2},
    horzLine:{color:'#ffffff',labelBackgroundColor:'#1a1a2e',width:1,style:2},
  },
  rightPriceScale:{
    borderColor:'rgba(255,255,255,0.1)',
    textColor:'#ffffff',
    scaleMargins:{top:0.02,bottom:0.02},
    autoScale:true,
    mode:0,
    ticksVisible:true,
    minimumWidth:60,
    entireTextOnly:false,
  },
  timeScale:{
    borderColor:'rgba(255,255,255,0.1)',
    textColor:'rgba(255,255,255,0.85)',
    timeVisible:true,
    secondsVisible:false,
    rightOffset:8,
    barSpacing:12,
    rightBarStaysOnScroll:true,
    minBarSpacing:3,
    shiftVisibleRangeOnNewBar:false,
    fixLeftEdge:false,
    fixRightEdge:false,
    ticksVisible:true,
    lockVisibleTimeRangeOnResize:true,
    tickMarkFormatter:(time,tickMarkType,locale)=>{
      const d=new Date(time*1000)
      const days=['Dom','Lun','Mar','Mie','Jue','Vie','Sab']
      const months=['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
      const day=days[d.getUTCDay()]
      const date=d.getUTCDate()
      const mon=months[d.getUTCMonth()]
      const h=d.getUTCHours().toString().padStart(2,'0')
      const m=d.getUTCMinutes().toString().padStart(2,'0')
      // tickMarkType: 0=Year, 1=Month, 2=DayOfMonth, 3=Time, 4=TimeWithSeconds
      if(tickMarkType<=1) return mon+' '+d.getUTCFullYear()
      if(tickMarkType===2) return day+' '+date+' '+mon
      return day+' '+h+':'+m
    },
  },
  handleScroll:{mouseWheel:true,pressedMouseMove:true,horzTouchDrag:true,vertTouchDrag:false},
  handleScale:{axisPressedMouseMove:{time:true,price:true},mouseWheel:true,pinch:true},
}}

export const fmtPx    = (px,p)=>px?.toFixed(isJpy(p)?3:5)??'—'
export const fmtPnl   = v=>(!v&&v!==0)||isNaN(v)?'+$0.00':(v>=0?'+':'')+v.toFixed(2)
export const pnlColor = v=>v>0?'#1E90FF':v<0?'#ef5350':'#a0b8d0'
export const fmtTs = (ts) => {
  if(!ts || ts < 1000000000) return '—'
  return new Date(ts*1000).toLocaleString('es-ES',{month:'short',day:'2-digit',hour:'2-digit',minute:'2-digit'})
}

// Default 10 phantoms (mínimo visual). Si algún drawing tiene un point.timestamp
// más allá de lastT, añade ceil((maxTs - lastT) / tfSecs) + 10 de colchón
// para que el plugin LWC pueda mapear ese timestamp a logical index.
export function computePhantomsNeeded(tools, lastT, tfSecs){
  let maxTs = lastT
  tools.forEach(tool => {
    (tool.points || []).forEach(p => {
      if (typeof p?.timestamp === 'number' && p.timestamp > maxTs) {
        maxTs = p.timestamp
      }
    })
  })
  if (maxTs > lastT) return Math.ceil((maxTs - lastT) / tfSecs) + 10
  return 10
}
