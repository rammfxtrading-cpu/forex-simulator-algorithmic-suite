/**
 * KZ01 · LA KILLZONE DEL FIN DE SEMANA Y TRAS EL GO TO (ordenes 1-104 y 1-105 del CTO; el caso de Ramon)
 * Pagina real (_SessionInner + KillzonesOverlay + KillzonesPrimitive reales; React, base y grafico dobles; el grafico
 * doble convierte hora→x y precio→y tal cual, asi la caja sale en horas y precios). EUR/USD M15, jueves 16-abr-2026
 * 21:00 UTC → viernes 17-abr 20:59; hueco; domingo 19-abr 21:00 → lunes 20-abr 20:59.
 *   1 · cursor parado en el hueco (domingo 00:00 y 02:00 UTC): ninguna caja se estira; las del viernes, como un dia normal
 *       (en 8d99f6b y 785d9a8 la Asia del viernes se estiraba hasta la ultima vela: 20,75 h)
 *   2 · tras Go to → London desde el domingo: las cajas son las de las velas de ahora (el lunes), sin ninguna estirada
 *       (en 785d9a8 la cache del overlay se quedaba con las del viernes)
 *   3 · control: con el cursor DENTRO de una sesion viva (lunes, Asia en curso), su caja sigue creciendo hasta la ultima
 *       vela (eso no cambia)
 * Sin la regla (8d99f6b, 785d9a8): rojo.
 */
import {ver,oraculo,fin,escenario,sesionSim,vela,importa,asienta,monta,router} from '../lib.mjs'
import {velasEnStorage} from '../banco-motor.mjs'
const Sesion=(await importa('components/_SessionInner.js')).default
const KD=await importa('lib/killzonesDomain.js')
const U=s=>Date.parse(s)/1000
const iso=t=>t==null?null:new Date(t*1000).toISOString().slice(5,16).replace('T',' ')
const velas=[]
const precio=t=>{ // asia del viernes estrecha; luego sube 1 pip cada 5 min
  const asiaFin=U('2026-04-17T04:00:00Z')
  if(t<asiaFin) return 1.1000+((t/60)%10)*0.0001
  if(t<U('2026-04-17T21:00:00Z')) return 1.1010+(t-asiaFin)/300*0.0001
  return 1.1300+((t/60)%10)*0.0001
}
for(let t=U('2026-04-16T21:00:00Z');t<U('2026-04-17T21:00:00Z');t+=60){const p=precio(t);velas.push(vela(t,p,p+0.00005,p-0.00005,p))}
for(let t=U('2026-04-19T21:00:00Z');t<U('2026-04-20T21:00:00Z');t+=60){const p=precio(t);velas.push(vela(t,p,p+0.00005,p-0.00005,p))}
const props=(p,name)=>[...p.insts.values()].find(i=>i.tipo.name===name)?.el.props
const prims=[]
const noop=o=>new Proxy(o,{get:(t,k)=>k in t?t[k]:(typeof k==='string'?()=>({}):undefined)})
function grafico(){
  const ts={getVisibleLogicalRange:()=>({from:0,to:50}),setVisibleLogicalRange(){},scrollToPosition(){},timeToCoordinate:t=>t,subscribeVisibleLogicalRangeChange(){},unsubscribeVisibleLogicalRangeChange(){}}
  const chart=noop({timeScale:()=>ts,priceScale:()=>({applyOptions(){}}),applyOptions(){},remove(){},resize(){}})
  const series=noop({setData(){},update(){},priceToCoordinate:p=>p,createPriceLine:()=>({applyOptions(){}}),removePriceLine(){},applyOptions(){},
    attachPrimitive(k){prims.push(k);k.attached({chart,series,requestUpdate:()=>k.updateAllViews()})},detachPrimitive(k){k.detached?.();const i=prims.indexOf(k);if(i>=0)prims.splice(i,1)}})
  return {series,chart,prevCount:0}
}
function mide(p,e,etiqueta){
  const kz=props(p,'KillzonesOverlay'),k=prims.at(-1),pv=k?._paneViewsArray?.[0]
  k?.updateAllViews()
  const cajas=(pv?._data||[]).map((b,i)=>({k:k._sessions[i]?.key,ini:iso(b.x1),fin:iso(b.x2),alto:+b.y1.toFixed(5),bajo:+b.y2.toFixed(5),horas:+((b.x2-b.x1)/3600).toFixed(2)}))
  const r={caso:etiqueta,motor:iso(e.currentTime),overlayCurrentTime:iso(kz?.currentTime),tf:kz?.currentTf,dataReady:kz?.dataReady,
    realLen:window.__algSuiteRealDataLen,ultimaVelaReal:iso(window.__algSuiteSeriesData?.[window.__algSuiteRealDataLen-1]?.time),
    primitives:prims.length,primCurrentTime:iso(k?._currentTime),sesionesCalc:(k?._sessions||[]).map(s=>`${s.key} ${iso(s.startTime)}..${iso(s.endTime)} [${s.low.toFixed(4)}-${s.high.toFixed(4)}]`),cajas}
  r.calcAhora=KD.calcSessions(window.__algSuiteSeriesData.slice(0,window.__algSuiteRealDataLen),{asia:true,london:true,nyam:true,nypm:false}).map(s=>`${s.key} ${iso(s.startTime)}..${iso(s.endTime)}`)
  const grande=cajas.filter(c=>c.horas>6)
  r.CAJA_ENORME=grande.length?grande:'no'
  if(process.env.KZ_DETALLE)console.log(JSON.stringify(r,null,1))
  return r
}
async function abre(last){
  prims.length=0
  const ses=sesionSim({pair:'EUR/USD',timeframe:'M15',date_from:'2026-04-17',date_to:'2026-04-24',last_timestamp:last,capital:100000,balance:100000})
  escenario({sim_sessions:[ses]})
  velasEnStorage('EUR/USD',velas,[2025])
  router.query={id:ses.id}
  const p=monta(Sesion,{})
  // RENDER=macro: el repintado del doble como una tarea (setImmediate), mas cerca del Scheduler de React 18 que la microtarea del doble
  if(process.env.RENDER==='macro'){const P=Object.getPrototypeOf(p);if(!P.__macro){P.__macro=1;P.programa=function(){if(this.sucio||this.desmontada)return;this.sucio=true;setImmediate(()=>{this.sucio=false;if(!this.desmontada)this.render()})}}}
  window.__chartMap.current['EUR/USD']=grafico()   // antes de que loadPair termine: el overlay engancha su primitive
  await p.asienta(300)
  const h=[...p.insts.values()].flatMap(i=>i.hooks),ref=h.find(x=>x?.current?.['EUR/USD']?.engine),e=ref?.current['EUR/USD']?.engine
  ver('control: pagina montada, motor y overlay',!!e&&!!props(p,'KillzonesOverlay')&&p.errores.length===0,JSON.stringify(p.errores.map(x=>x.message)))
  return {p,e}
}

const normal=r=>JSON.stringify(r.cajas.map(c=>`${c.k} ${c.ini}..${c.fin}`))===JSON.stringify(r.calcAhora)
for(const last of ['2026-04-19T00:00:00Z','2026-04-19T02:00:00Z']){
  const {p,e}=await abre(U(last)); const r=mide(p,e,'reanuda '+last)
  oraculo('KZ01',`cursor en el hueco (${last}): ninguna caja estirada`,r.CAJA_ENORME==='no',JSON.stringify(r.cajas))
  oraculo('KZ01',`cursor en el hueco (${last}): las cajas del viernes, como un dia normal`,normal(r)&&r.cajas.some(c=>c.k==='asia'&&c.ini==='04-17 00:00'&&c.fin==='04-17 03:45'),JSON.stringify({cajas:r.cajas,calc:r.calcAhora}))
  await props(p,'ReplayPill').handleGoTo('london'); await p.asienta(200)
  const g=mide(p,e,'GoTo london desde '+last)
  ver('control: el Go to llega al lunes 06:00 UTC',g.motor==='04-20 06:00',g.motor)
  oraculo('KZ01',`tras Go to London desde ${last}: ninguna caja estirada`,g.CAJA_ENORME==='no',JSON.stringify(g.cajas))
  oraculo('KZ01',`tras Go to London desde ${last}: las cajas son las de las velas de ahora (Asia y London del lunes)`,normal(g)&&g.cajas.some(c=>c.k==='asia'&&c.ini==='04-20 00:00')&&g.cajas.some(c=>c.k==='london'&&c.ini==='04-20 06:00'),JSON.stringify({cajas:g.cajas,calc:g.calcAhora}))
  p.desmonta(); await asienta()
}
{
  const {p,e}=await abre(U('2026-04-20T01:30:00Z')); const r=mide(p,e,'Asia viva lunes 01:30')
  const asia=r.cajas.find(c=>c.k==='asia'&&c.ini==='04-20 00:00')
  oraculo('KZ01','control: con la Asia del lunes en curso, su caja llega a la ultima vela (como antes)',!!asia&&asia.fin===r.ultimaVelaReal&&r.CAJA_ENORME==='no',JSON.stringify(r.cajas))
  p.desmonta(); await asienta()
}
fin()
