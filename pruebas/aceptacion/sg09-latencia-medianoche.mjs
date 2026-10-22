/**
 * SG09 · CON EL STATUS DE MEDIANOCHE RETENIDO, STEP = GO TO
 * Reproduccion de Astra (SIMGOTO2-01, 2026-10-22-simgoto2-astra-evidencias/copia/pruebas/), adaptada al Step
 * con la frontera economica (orden 1-087): un Step es un clic; mientras su vela espera a los cierres y al
 * reto, los clics siguientes no hacen nada (e.saltando), igual que en la pantalla. Antes (d90bdea) cada Step
 * avanzaba sin esperar y el breach se perdia: Step ≠ Go to.
 */
// Datos inventados. Igual mercado y status retenido: el alumno pulsa Step mientras llega la respuesta.
import {ver,oraculo,fin,escenario,sesionSim,vela,importa,A,retenApi,puerta,asienta,db} from '../lib.mjs'
import {banco,velasEnStorage} from '../banco-motor.mjs'
const CI=await importa('lib/sim/cierre.js'), SV=await importa('lib/sim/servicio.js');
const T=Date.parse('2025-01-07T22:59:00Z')/1000;
async function corre(modo, retenida) {
 const ses=sesionSim({pair:'EUR/USD',date_from:'2025-01-07',date_to:'2025-01-10',last_timestamp:T,capital:100000,balance:100000,challenge_type:'2F',challenge_phase:1});
 escenario({sim_sessions:[ses]});
 const vs=Array.from({length:500},(_,i)=>vela(T+i*60,1.1,i===2?1.1011:i===3?1.1041:1.1002,1.0999,1.1));
 velasEnStorage('EUR/USD',vs,[2024],{tramoAbierto:true});
 const b=await banco({sesion:ses,userId:A});CI.fijaSaldoConfirmado(ses.id,100000);await SV.leeServicio();await b.repinta();
 b.abreMercado({side:'SELL',entry:1.1,sl:1.101,tp:1.09,lots:10});
 b.abreMercado({side:'SELL',entry:1.1,sl:1.12,tp:1.09,lots:10});
 const ent=puerta(),sal=puerta();let usado=false, pend;
 if(retenida){retenApi.antes=async u=>{if(!usado&&u.includes('challenge/status')){usado=true;ent.abrir();await sal.p}};}
 if(modo==='salto'){
  const run=b.irA('london');await asienta(100);
  if(retenida){ver('salto espera al status automático de medianoche',b.motor().currentTime===T+60);sal.abrir();}
  await run;
 } else {
  // clics de Step: el primero espera (frontera), los siguientes no hacen nada mientras tanto
  const clic0=b.paso(1);if(retenida)await ent.p;const clic=b.paso(1);b.paso(1);b.paso(1);await asienta(100);
  if(retenida){sal.abrir();}
  await clic0;await clic;
  await asienta(200);await b.repinta();
  while(b.motor().currentTime<T+300&&!b.ps().trades.some(x=>/BREACH/.test(x.reason)))await b.paso(1);
 }
 retenApi.antes=null;await asienta(300);await b.repinta();
 const res={saldo:b.estado.saldo,trades:b.ps().trades.map(t=>[t.reason,+t.pnl.toFixed(2),t.closeTime-T]),abiertas:b.ps().positions.length,estado:b.caja.valor.reto.challengeStatus?.evaluation?.status,filas:db.tablas.sim_trades.map(f=>[+Number(f.pnl),f.closed_at])};
 b.caja.raiz.desmonta?.();return res;
}
for(const retraso of [false,true]){
 const s=await corre('salto',retraso),p=await corre('paso',retraso);
 console.log('CASO',JSON.stringify({retraso,salto:s,paso:p}));
 oraculo('ASTRA-LATENCIA','saldo, trades y estado iguales con status retenido='+retraso,JSON.stringify(s)===JSON.stringify(p));
}
fin();
