/**
 * SG17 · LA PAGINA REAL: UN CIERRE MANUAL RECHAZADO TARDE PARA LOS TRES MODOS (SIMGOTO5-01, Astra; orden 1-095 del CTO)
 * Reproduccion de Astra (2026-10-23-simgoto5-astra-evidencias/copia/pruebas/astra-pagina-pausa.mjs) con la PAGINA
 * montada (_SessionInner, sus SessionPanels.closePosition y ReplayPill.handleGoTo/handleStep/handlePlayPause reales;
 * grafico, React y base, dobles). Reto 2F, EUR/USD 11:55, BUY/SELL 10 lotes a 1,1000 (SL/TP a 200 pips); la vela de
 * las 11:57 llega a 1,0940 (BUY) o 1,1060 (SELL). Cierre manual a 1,1000 retenido; se acepta o se RECHAZA (23514)
 * con el Go to, el Step o el Play ya pedidos. En 6a68763, con el rechazo, el Go to seguia desde su espera inicial y
 * quemaba el reto (11:57, -5050) mientras Step y Play se paraban.
 * ORACULOS, a mano, iguales en los tres modos:
 *   aceptado  cerrada a mano a 1,1000 (0, a las 11:55), saldo 100.000, activo, sin posiciones, reloj 12:00 (Go to NY)
 *   rechazo   la pausa de la pagina lo para a las 11:55 (el Play, donde le llega el rechazo: 11:56; orden 1-157): la posicion de vuelta, saldo 100.000, activo, sin filas, Play apagado
 */
import {ver,oraculo,fin,escenario,sesionSim,vela,importa,A,asienta,db,puerta,monta,router} from '../lib.mjs'
import {velasEnStorage} from '../banco-motor.mjs'
const CI=await importa('lib/sim/cierre.js').catch(()=>null),SV=await importa('lib/sim/servicio.js').catch(()=>null),COLA=await importa('lib/sim/cola.js').catch(()=>null);
// el codigo auditado (c470c8f, historicas.sh) no tiene la cola: ahi, rojo
if(!CI||!SV||!COLA){for(let i=0;i<12;i++)oraculo('SG17',`caso ${i}: sin la cola de la etapa 1 no se puede`,false,'no estan');fin()}
const Sesion=(await importa('components/_SessionInner.js')).default;
const T=Date.parse('2025-01-07T11:55:00Z')/1000;
const props=(p,name)=>[...p.insts.values()].find(i=>i.tipo.name===name)?.el.props;
for(const side of ['BUY','SELL'])for(const rechazo of [false,true]){
 const rr=[];
 for(const modo of ['salto','paso','play']){
  const ses=sesionSim({pair:'EUR/USD',date_from:'2025-01-07',date_to:'2025-01-10',last_timestamp:T,capital:100000,balance:100000,challenge_type:'2F',challenge_phase:1});escenario({sim_sessions:[ses]});
  velasEnStorage('EUR/USD',Array.from({length:12},(_,i)=>vela(T+i*60,1.1,i===2&&side==='SELL'?1.106:1.1001,i===2&&side==='BUY'?1.094:1.0999,1.1)),[2024],{tramoAbierto:true});router.query={id:ses.id};
  const p=monta(Sesion,{});await p.asienta(300);
  const h=[...p.insts.values()].flatMap(i=>i.hooks), ref=h.find(x=>x?.current?.['EUR/USD']?.engine),ps=ref?.current['EUR/USD'],e=ps?.engine;
  ver('control: pagina real montada, motor a las 11:55 y props de UI',!!e&&e.currentTime===T&&!!props(p,'ReplayPill')&&!!props(p,'SessionPanels')&&p.errores.length===0,JSON.stringify(p.errores.map(e=>e.message)));
  if(!e||!props(p,'ReplayPill')){console.log([...p.insts.values()].map(i=>i.tipo.name));fin()}
  const ts={getVisibleLogicalRange:()=>({from:0,to:50}),setVisibleLogicalRange(){},scrollToPosition(){}};
  window.__chartMap.current['EUR/USD']={series:{setData(){},update(){},priceToCoordinate:()=>0,createPriceLine:()=>({}),removePriceLine(){}},chart:{timeScale:()=>ts,priceScale:()=>({applyOptions(){}})},prevCount:0};
  CI.fijaSaldoConfirmado(ses.id,100000);await SV.leeServicio();
  const pos={id:'inventada',pair:'EUR/USD',side,entry:1.1,sl:side==='BUY'?1.08:1.12,tp:side==='BUY'?1.12:1.08,lots:10,slPips:200,tpPips:200,initialSlPips:200,openTime:T};ps.positions=[pos];p.render({forzar:true});await asienta();
  const gate=puerta();let primero=null;
  db.pausa=c=>{if(c.tabla==='rpc:sim_cierre_v0'){primero??=c.payload.p_trade.id;if(c.payload.p_trade.id===primero)return gate.p}};
  db.falla=c=>rechazo&&c.tabla==='rpc:sim_cierre_v0'&&c.payload.p_trade.id===primero?{code:'23514',message:'rechazo sintetico'}:null;
  const closing=props(p,'SessionPanels').closePosition(pos.id,'MANUAL','EUR/USD',1.1);await asienta(60);
  ver('control: RPC retenida y posicion provisionalmente retirada',!!primero&&ps.positions.length===0&&COLA.cierresPendientes(ses.id)===1);
  e._loop=()=>{};
  const avanza=async()=>{
   if(modo==='salto')return props(p,'ReplayPill').handleGoTo('nyam');
   if(modo==='paso'){for(let i=0;i<5;i++){let antes=e.currentTime;await props(p,'ReplayPill').handleStep();await asienta();if(e.currentTime===antes)break}return}
   props(p,'ReplayPill').handleSpeed(4);await props(p,'ReplayPill').handlePlayPause();let k=0;
   while((e.isPlaying||e._esperando)&&e.currentTime<T+300&&k<30){e._tickFrame(k++*250);if(e._esperando)await e._esperando;await asienta()}
   ver('control: Play no agota fotogramas',k<30);e.pause();
  };
  // orden 1-157: el Play no espera a la confirmacion del cierre (va por detras, como en produccion): su reloj sigue
  const run=avanza();await asienta(80);ver(modo==='play'?'control: el Play sigue sin esperar la respuesta (orden 1-157)':'control: reloj inmovil hasta responder',modo==='play'?e.currentTime>T:e.currentTime===T);
  const relojRespuesta=e.currentTime-T;gate.abrir();await closing;await run;await COLA.esperaCola(ses.id);await p.asienta(60);db.pausa=null;db.falla=null;
  ver('control: pagina sin errores tras el escenario',p.errores.length===0,JSON.stringify(p.errores.map(e=>e.message)));
  const bottom=props(p,'SessionBottomBar');rr.push({modo,reloj:e.currentTime-T,relojRespuesta,saldo:bottom.balance,estado:bottom.challengeStatus?.evaluation?.status,abiertas:ps.positions.length,trades:db.tablas.sim_trades.map(t=>[+t.pnl,t.closed_at]),uiPlay:props(p,'ReplayPill').isPlaying});p.desmonta();await asienta();
 }
 // el Play apagado se exige con el rechazo (la pausa de la pagina); con el cierre aceptado, el guion para el motor a
 // mano al llegar a las 12:00 y el boton sigue en «reproduciendo» (como en la pagina, que no se detiene sola)
 // orden 1-157: con el rechazo, el Play se para donde le llega la respuesta (aqui, la vela siguiente: 11:56, antes de la de
 // 1,0940/1,1060), no a las 11:55; lo economico, igual que el salto y el Step
 const esperado=x=>JSON.stringify(rechazo?[x.modo==='play'?x.relojRespuesta:0,100000,'active',1,[]]:[300,100000,'active',0,[[0,'2025-01-07T11:55:00.000Z']]]);
 for(const x of rr)oraculo('SG17',`${side}, cierre ${rechazo?'RECHAZADO tarde':'aceptado'}, ${x.modo}: ${rechazo?(x.modo==='play'?'parado donde llega el rechazo (11:56), con la posicion de vuelta y el Play apagado':'parado a las 11:55 con la posicion de vuelta y el Play apagado'):'cerrada a mano y Go to NY'}`,JSON.stringify([x.reloj,x.saldo,x.estado,x.abiertas,x.trades])===esperado(x)&&(!rechazo||x.uiPlay===false)&&(x.modo!=='play'||!rechazo||x.relojRespuesta===60),JSON.stringify(x));
}
fin()
