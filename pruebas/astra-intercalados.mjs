/**
 * LOS CUATRO INTERCALADOS DE ASTRA (revision de codigo de la etapa 1, 13-oct:
 * revisiones-suite/2026-10-13-astra-sim-etapa1.md, E1-01..E1-04), llevados a pruebas/ como
 * permanentes por orden del CTO (13-oct). Original, sin tocar:
 * revisiones-suite/2026-10-13-sim-etapa1-evidencias/copia/pruebas/astra-intercalados.mjs
 *
 * Los cuatro oraculos conservan su CONDICION tal cual. Lo que cambia respecto al original
 * (solo disparadores y controles, cada uno con su motivo):
 *   E1-01  la pausa ya no manda saldo: la puerta retiene CUALQUIER UPDATE de sim_sessions de
 *          la pausa (antes, solo el que llevaba balance) y el control comprueba que la pausa
 *          salio con el cierre pendiente (antes, que llevaba el saldo 10000 capturado)
 */
import { escenario,sesionSim,tradeSim,tok,importa,monta,router,vela,nav,db,A,asienta,puerta,ver,oraculo,fin } from './lib.mjs'
import { llama } from './supabase-falso.mjs'
import { velasEnStorage,banco } from './banco-motor.mjs'
const CI=await importa('lib/sim/cierre.js'), SV=await importa('lib/sim/servicio.js')
const Sesion=(await importa('components/_SessionInner.js')).default
const T=Date.parse('2025-03-03T10:00:00Z')/1000
const VS=Array.from({length:30},(_,i)=>vela(T+i*60,1.1+i*.001,1.1+i*.001,1.1+i*.001,1.1+i*.001))
const tecla=code=>{for(const f of [...(nav.oyentes.keydown||[])])f({code,key:code,target:{tagName:'DIV'},preventDefault(){}})}
const chart=()=>{const ts={getVisibleLogicalRange:()=>({from:0,to:50}),setVisibleLogicalRange(){},scrollToPosition(){}};window.__chartMap.current['EUR/USD']={series:{setData(){},update(){},priceToCoordinate:()=>0,createPriceLine:()=>({}),removePriceLine(){}},chart:{timeScale:()=>ts,priceScale:()=>({applyOptions(){}})},prevCount:0}}
// Real page pause and real close queue: only response ordering is simulated.
escenario({sim_sessions:[sesionSim({id:'pausa',balance:10000})]});velasEnStorage('EUR/USD',VS,[2024],{tramoAbierto:true});router.query={id:'pausa'}
const p=monta(Sesion,{});await p.asienta(300);chart();tecla('ArrowRight');await p.asienta(40);tecla('Space');await p.asienta(20)
const rpcGate=puerta(),pauseGate=puerta();db.log.length=0
db.pausa=c=>c.tabla==='rpc:sim_cierre_v0'?rpcGate.p:(c.tabla==='sim_sessions'&&c.op==='update'?pauseGate.p:null)
const close=CI.persisteCierre({sessionId:'pausa',delta:100,lastTimestamp:T+60,trade:{id:'10000000-0000-4000-8000-000000000001',user_id:A,pair:'EUR/USD',side:'BUY',lots:1,pnl:100}})
await asienta(30);tecla('Space');await p.asienta(40)
const pending=db.log.find(c=>c.tabla==='sim_sessions'&&c.op==='update')
ver('real pause submitted while the close is pending',pending?.payload?.last_timestamp!=null,JSON.stringify(pending?.payload))
rpcGate.abrir();const cr=await close;ver('atomic close committed +100',cr.estado==='guardado'&&db.tablas.sim_sessions[0].balance===10100)
pauseGate.abrir();await p.asienta(60)
console.log('PAUSA',JSON.stringify({balance:db.tablas.sim_sessions[0].balance,trades:db.tablas.sim_trades,confirmado:CI.saldoConfirmado('pausa')}))
oraculo('ASTRA-pausa','pause cannot overwrite committed pnl',db.tablas.sim_sessions[0].balance===10100,'observado '+db.tablas.sim_sessions[0].balance)
db.pausa=null;p.desmonta();await asienta(30)
async function setup(){const ses=sesionSim({id:'bank',balance:10000});escenario({sim_sessions:[ses]});velasEnStorage('EUR/USD',VS,[2024],{tramoAbierto:true});const b=await banco({sesion:ses,userId:A});await b.paso(2);CI.fijaSaldoConfirmado('bank',10000);await SV.leeServicio();return b}
let b=await setup(),pos=b.abreMercado({side:'BUY',entry:1.1,sl:1.09,tp:1.2,lots:2})
db.falla=c=>c.tabla==='rpc:sim_cierre_v0'?{code:'P0001',message:'inventado'}:null
const partial=b.caja.valor.trading.closePartial(pos.id,'EUR/USD',.5)
const full=b.caja.valor.trading.closePosition(pos.id,'MANUAL','EUR/USD',1.102)
await Promise.all([partial,full]);await asienta(50);db.falla=null
const lots=b.ps().positions.reduce((n,x)=>n+x.lots,0)
ver('both atomic calls failed and neither trade saved',db.tablas.sim_trades.length===0&&db.tablas.sim_sessions[0].balance===10000)
console.log('PARCIAL_TOTAL',JSON.stringify({lots,positions:b.ps().positions,balance:b.estado.saldo}))
oraculo('ASTRA-parcial-total','failed partial then failed remainder restore all 2 lots',lots===2,'observado '+lots)
b.caja.raiz.desmonta()
b=await setup();pos=b.abreMercado({side:'BUY',entry:1.1,sl:1.09,tp:1.2,lots:2})
db.falla=c=>c.tabla==='rpc:sim_cierre_v0'?{code:'',message:'transporte inventado'}:null
await b.caja.valor.trading.closePartial(pos.id,'EUR/USD',.5);await asienta(30);db.falla=null
ver('uncertain partial pending',SV.motivoBloqueo()==='incierto'&&b.ps().positions[0].lots===1.5)
const now=Date.now;Date.now=()=>now()+21000
await Promise.all([SV.leeServicio(),SV.leeServicio()]);await asienta(30);Date.now=now
const lots2=b.ps().positions.reduce((n,x)=>n+x.lots,0)
console.log('INCIERTO_DOBLE',JSON.stringify({lots:lots2,positions:b.ps().positions,balance:b.estado.saldo,base:db.tablas.sim_sessions[0].balance,inciertos:SV.estadoServicio().inciertos}))
oraculo('ASTRA-incierto','two concurrent reconciliation reads settle once only',lots2===2&&b.estado.saldo===10000,'lotes '+lots2+' saldo '+b.estado.saldo)
b.caja.raiz.desmonta();
// A phase must not be awarded from a prefix of the real close queue.
escenario({sim_sessions:[sesionSim({id:'fase',challenge_type:'2F',challenge_phase:1,capital:100000,balance:100000})]});CI.fijaSaldoConfirmado('fase',100000);
const advance=(await importa('pages/api/challenge/advance.js')).default;
const neg=puerta();db.pausa=c=>c.tabla==='rpc:sim_cierre_v0'&&c.payload?.p_trade?.pnl===-3000?neg.p:null;
const t1=tradeSim({id:'10000000-0000-4000-8000-000000000031',session_id:'fase',pnl:11000,entry_price:1.1,exit_price:1.21,sl_price:1.0,tp_price:1.3,result:'WIN',opened_at:'2025-03-03T10:00:00Z',closed_at:'2025-03-03T11:00:00Z'});
const t2=tradeSim({id:'10000000-0000-4000-8000-000000000032',session_id:'fase',pnl:-3000,entry_price:1.24,exit_price:1.21,sl_price:1.2,tp_price:1.3,result:'LOSS',opened_at:'2025-03-03T10:00:00Z',closed_at:'2025-03-03T11:01:00Z'});
for(const t of [t1,t2]){delete t.session_id;delete t.created_at}
ver('trade fields permitted by real RPC',Object.keys(t1).every(k=>['id','user_id','pair','side','lots','entry_price','exit_price','sl_price','tp_price','rr','pnl','result','notes','session_type','opened_at','closed_at'].includes(k)));
const positive=CI.persisteCierre({sessionId:'fase',delta:11000,lastTimestamp:T+60,trade:t1});
const negative=CI.persisteCierre({sessionId:'fase',delta:-3000,lastTimestamp:T+120,trade:t2});
await positive;await asienta(30);
ver('negative close is pending',db.tablas.sim_trades.length===1);
const adv=await llama(advance,{method:'POST',token:tok(A),body:{session_id:'fase',outcome:'pass',end_timestamp:T+120,open_positions:[]}});
neg.abrir();const nr=await negative;db.pausa=null;
const root=db.tablas.sim_sessions.find(s=>s.id==='fase');
console.log('RETO_COLA',JSON.stringify({http:adv.estado,accion:adv.cuerpo?.action,root,negative:nr,children:db.tablas.sim_sessions.filter(s=>s.challenge_parent_id==='fase'),pnl:db.tablas.sim_trades.reduce((n,t)=>n+Number(t.pnl),0)}));
const evaluator=await importa('lib/challengeEngine.js');
const ev=evaluator.evaluateChallenge({challengeType:'2F',currentPhase:1,capital:100000,trades:db.tablas.sim_trades});
ver('complete history does not pass',ev.status==='active',JSON.stringify(ev));
ver('both real queue closes committed',nr.estado==='guardado'&&db.tablas.sim_trades.length===2);
oraculo('ASTRA-reto-cola','cannot grant phase on incomplete close queue',root.status!=='passed_phase'&&db.tablas.sim_sessions.length===1,'status '+root.status+' balance '+root.balance+' HTTP '+adv.estado);
fin()
