/**
 * SG10 · LAST_TIMESTAMP NUNCA RETROCEDE (SIMGOTO2-02, Astra; orden 1-087 del CTO; lib/sim/progreso.js)
 * Reproduccion de Astra (2026-10-22-simgoto2-astra-evidencias/copia/pruebas/astra-final-con-dos-cierres.mjs):
 * el cierre de un par cuyo historico acaba antes (09:39) no baja el progreso guardado (11:20); al reabrir, la
 * sesion no vuelve a un momento anterior a un trade ya contado.
 */
// SG06 con una posición real del banco y la RPC final retenida, sin datos reales.
import {ver,oraculo,fin,escenario,sesionSim,vela,importa,A,asienta,db,puerta} from '../lib.mjs'
import {banco,velasEnStorage} from '../banco-motor.mjs'
const CI=await importa('lib/sim/cierre.js').catch(()=>null), SV=await importa('lib/sim/servicio.js').catch(()=>null);
// el codigo auditado (c470c8f, historicas.sh) no tiene la cola ni el cierre atomico de la etapa 1: ahi, rojo
if(!CI||!SV){for(let i=0;i<4;i++)oraculo('SG10',`caso ${i}: sin lib/sim/cierre.js ni servicio.js no se puede`,false,'no estan');fin()}
const T=Date.parse('2025-01-07T08:00:00Z')/1000;
for(const retiene of [false,true]){
 const ses=sesionSim({pair:'EUR/USD',date_from:'2025-01-07',date_to:'2025-01-10',last_timestamp:T,capital:100000,balance:100000});escenario({sim_sessions:[ses]});
 const eur=Array.from({length:400},(_,i)=>vela(T+i*60,1.05,i===150?1.0531:1.0501,1.0499,1.05));
 const gbp=Array.from({length:100},(_,i)=>vela(T+i*60,1.25,i===99?1.2531:1.2501,1.2499,1.25));
 velasEnStorage('EUR/USD',eur,[2024],{tramoAbierto:true});velasEnStorage('GBP/USD',gbp,[2024]);
 const b=await banco({sesion:ses,userId:A});CI.fijaSaldoConfirmado(ses.id,100000);await SV.leeServicio();await b.repinta();
 await b.cambiaPar('GBP/USD');b.abreMercado({side:'BUY',entry:1.25,sl:1.24,tp:1.253,lots:1});await b.cambiaPar('EUR/USD');b.abreMercado({side:'BUY',entry:1.05,sl:1.04,tp:1.053,lots:1});await b.paso(200);
 const ent=puerta(),sal=puerta();let usado=false;
 if(retiene)db.pausa=async ctx=>{if(!usado&&ctx.tabla==='rpc:sim_cierre_v0'){usado=true;ent.abrir();await sal.p}};
 await b.cambiaPar('GBP/USD');
 if(retiene){await ent.p;await asienta(100);console.log('MIENTRAS',JSON.stringify({last:db.tablas.sim_sessions[0].last_timestamp-T,master:window.__algSuiteCurrentTime-T}));sal.abrir();}
 await asienta(300);await b.repinta();db.pausa=null;
 const f=db.tablas.sim_sessions[0],r={retiene,last:f.last_timestamp-T,master:window.__algSuiteCurrentTime-T,trades:db.tablas.sim_trades.map(t=>[+t.pnl,t.closed_at]),motor:b.motor().currentTime-T};console.log('FINAL',JSON.stringify(r));
 ver('control: TP +300 en última GBP, reloj maestro EUR T+200',r.trades.length===2&&r.trades.every(t=>t[0]===300)&&r.master===12000);
 oraculo('ASTRA-FINAL',`cierre en última vela atrasada no rebaja last_timestamp (retiene=${retiene})`,r.last>=12000,JSON.stringify(r));
 b.caja.raiz.desmonta?.();window.__algSuiteCurrentTime=null;const b2=await banco({sesion:{...f},userId:A});console.log('REANUDAR',JSON.stringify({motor:b2.motor().currentTime-T,ultimoTrade:Math.max(...db.tablas.sim_trades.map(t=>Date.parse(t.closed_at)/1000))-T,saldo:b2.estado.saldo}));oraculo('ASTRA-REANUDAR','no reanuda antes del último trade confirmado',b2.motor().currentTime>=Math.max(...db.tablas.sim_trades.map(t=>Date.parse(t.closed_at)/1000)));b2.caja.raiz.desmonta?.();
}
fin();
