/**
 * SG19 · QUITAR UN PAR CON UN CIERRE EN VUELO, Y EL PROGRESO QUE LLEGA TARDE (GOTODESP1-01/02, Astra; orden 1-099 del CTO)
 * GOTODESP1-01 · reproduccion de Astra (2026-10-23-gotodesp1-astra-evidencias/copia/pruebas/astra-quitar-par.mjs) con la
 *   PAGINA montada: GBP/USD y EUR/USD; una posicion de GBP/USD, cierre manual retenido (la posicion sale provisionalmente
 *   de la lista). En 401c0ae la ✕ reaparecia y, quitado el par, un rechazo no tenia donde devolver la posicion: se
 *   perdia. Ahora, con un cierre en vuelo, ni la ✕ ni removePair quitan el par (lib/sim/quitarPar.js).
 *   ORACULO, a mano: con el rechazo, la posicion vuelve (1 abierta); aceptado, su fila (1); y la ✕ no se ve en vuelo.
 * GOTODESP1-02 · el guardado del progreso retenido (T+60) y despues otro (T+120) o un cierre (T+120): en 401c0ae el
 *   antiguo llegaba el ultimo y dejaba T+60. Ahora el guardado va por la cola de la sesion: el nuevo no sale hasta que
 *   termina el antiguo. ORACULO: queda T+120. (Otra pestaña u otro navegador: lo cierra la sim-005 en la base; limite.)
 */
import {ver,oraculo,fin,escenario,sesionSim,vela,importa,asienta,db,puerta,monta,router,A} from '../lib.mjs';
import {banco,velasEnStorage} from '../banco-motor.mjs';
const CI=await importa('lib/sim/cierre.js').catch(()=>null),SV=await importa('lib/sim/servicio.js').catch(()=>null),COLA=await importa('lib/sim/cola.js').catch(()=>null);
// el codigo auditado (c470c8f, historicas.sh) no tiene la cola: ahi, rojo
if(!CI||!SV||!COLA){for(let i=0;i<8;i++)oraculo('SG19',`caso ${i}: sin la cola de la etapa 1 no se puede`,false,'no estan');fin()}
const Sesion=(await importa('components/_SessionInner.js')).default;
const T=Date.parse('2025-01-07T11:55:00Z')/1000;
const props=(p,n)=>[...p.insts.values()].find(i=>i.tipo.name===n)?.el.props;
async function mesa(){
 const ses=sesionSim({pair:'GBP/USD',date_from:'2025-01-07',date_to:'2025-01-10',last_timestamp:T,capital:100000,balance:100000});escenario({sim_sessions:[ses]});window.__algSuiteCurrentTime=null;
 for(const [par,v] of [['GBP/USD',1.25],['EUR/USD',1.05]])velasEnStorage(par,Array.from({length:12},(_,i)=>vela(T+i*60,v,v+.0001,v-.0001,v)),[2024],{tramoAbierto:true});
 router.query={id:ses.id};const p=monta(Sesion,{});await p.asienta(200);const top=()=>props(p,'SessionTopBar'),ui=()=>props(p,'ReplayPill');
 await top().addPair('EUR/USD');await p.asienta(200);top().setActivePair('GBP/USD');await p.asienta(100);
 const ref=top().pairState;ver('control motores reales y cero errores',!!ref.current['GBP/USD']?.engine&&!!ref.current['EUR/USD']?.engine&&p.errores.length===0);
 const ts={getVisibleLogicalRange:()=>({from:0,to:50}),setVisibleLogicalRange(){},scrollToPosition(){},subscribeVisibleLogicalRangeChange(){},unsubscribeVisibleLogicalRangeChange(){}};
 for(const par of ['GBP/USD','EUR/USD']){window.__chartMap.current[par]={series:{setData(){},update(){},priceToCoordinate:()=>0,createPriceLine:()=>({}),removePriceLine(){}},chart:{subscribeClick(){},unsubscribeClick(){},remove(){},timeScale:()=>ts,priceScale:()=>({applyOptions(){}})},prevCount:0};ref.current[par].engine._loop=()=>{};}
 CI.fijaSaldoConfirmado(ses.id,100000);await SV.leeServicio();
 return {ses,p,ref,top,ui,e:par=>ref.current[par].engine};
}
async function retiene(b,rechazo){
 const pos={id:'pos-sintetica',pair:'GBP/USD',side:'BUY',entry:1.25,sl:1.2,tp:1.3,lots:1,slPips:500,tpPips:500,initialSlPips:500,openTime:T};b.ref.current['GBP/USD'].positions=[pos];b.p.render({forzar:true});await asienta();
 const gate=puerta();let first=null;db.pausa=c=>{if(c.tabla==='rpc:sim_cierre_v0'){first??=c.payload.p_trade.id;if(c.payload.p_trade.id===first)return gate.p}};
 db.falla=c=>rechazo&&c.tabla==='rpc:sim_cierre_v0'&&c.payload.p_trade.id===first?{code:'23514',message:'rechazo sintetico'}:null;
 const closing=props(b.p,'SessionPanels').closePosition(pos.id,'MANUAL','GBP/USD',1.25);await asienta(40);ver('control RPC retenida',!!first&&COLA.cierresPendientes(b.ses.id)===1);return {gate,closing};
}

for(const rechazo of [false,true]) for(const via of ['boton','callback','conservar']) {
 const b=await mesa(), {gate,closing}=await retiene(b,rechazo);
 await b.p.asienta(50);
 const TB=(await importa('components/SessionTopBar.js')).default;
 const el=TB(b.top()); let botones=[];let callbacks={};
 function walk(n,k){if(!n||typeof n!=='object')return;if(Array.isArray(n)){n.forEach(x=>walk(x,k));return}const pp=n.props||{},kk=n.key??k;if(n.type==='button'&&[].concat(pp.children).includes('✕')){botones.push(kk);callbacks[kk]=pp.onClick}walk(pp.children,kk)}walk(el,null);
 const visible=botones.includes('GBP/USD');
 if(via==='callback')b.top().removePair('GBP/USD');else if(via==='boton'&&visible)callbacks['GBP/USD']();await b.p.asienta(50);
 const durante=!!b.ref.current['GBP/USD'];gate.abrir();await closing;await COLA.esperaCola(b.ses.id);await b.p.asienta(100);db.pausa=null;db.falla=null;
 const result={rechazo,via,visible,durante,pares:b.top().activePairs,abiertas:b.ref.current['GBP/USD']?.positions?.length??0,filas:db.tablas.sim_trades.length,errores:b.p.errores.map(x=>x.message)};
 oraculo('SG19',`GOTODESP1-01 · cierre retenido ${rechazo?'y RECHAZADO':'y aceptado'}, via ${via}: ${rechazo?'la posicion vuelve':'queda su fila'}${via==='boton'?' (y la ✕ no se ve en vuelo)':''}`,(rechazo?result.abiertas===1:result.filas===1)&&!result.errores.length&&(via!=='boton'||!result.visible),JSON.stringify(result));
 b.p.desmonta();await asienta();
}

// GOTODESP1-02 · el guardado retenido y otro despues (el camino real: saveProgress y closePosition)
{
 const T2=Date.parse('2025-01-07T08:00:00Z')/1000;
 for(const despues of ['guardado','cierre']){
  const ses=sesionSim({pair:'EUR/USD',date_from:'2025-01-07',date_to:'2025-01-10',last_timestamp:T2,capital:100000,balance:100000});escenario({sim_sessions:[ses]});
  velasEnStorage('EUR/USD',Array.from({length:400},(_,i)=>vela(T2+i*60,1.1,1.1001,1.0999,1.1)),[2024],{tramoAbierto:true});
  const b=await banco({sesion:ses,userId:A});CI.fijaSaldoConfirmado(ses.id,100000);await SV.leeServicio();await b.repinta();
  const pos=b.abreMercado({side:'BUY',entry:1.1,sl:1.0,tp:1.2,lots:1});await b.repinta();
  const gate=puerta();let retenida=false;db.pausa=c=>{if(c.tabla==='sim_sessions'&&c.op==='update'&&c.payload.last_timestamp===T2+60){retenida=true;return gate.p}};
  window.__algSuiteCurrentTime=T2+60;const antiguo=b.caja.valor.datos.saveProgress(T2+60);await asienta(50);ver(`control (${despues}): el guardado de T+60 retenido`,retenida);
  window.__algSuiteCurrentTime=T2+120;
  const nuevo=despues==='guardado'?b.caja.valor.datos.saveProgress(T2+120):b.caja.valor.trading.closePosition(pos.id,'MANUAL','EUR/USD',1.1,null,T2+120);
  await asienta(80);const durante=db.tablas.sim_sessions[0].last_timestamp-T2;
  gate.abrir();await antiguo;await nuevo;await COLA.esperaCola(ses.id);await asienta(50);db.pausa=null;
  const fin2=db.tablas.sim_sessions[0].last_timestamp-T2;
  oraculo('SG19',`GOTODESP1-02 · un ${despues} de T+120 tras el guardado retenido de T+60: espera su turno y queda T+120`,fin2===120,JSON.stringify({durante,final:fin2}));
  b.caja.raiz.desmonta?.();
 }
}
fin();
