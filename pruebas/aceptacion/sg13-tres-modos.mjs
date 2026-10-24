/**
 * SG13 · SALTO = STEP = PLAY CON BREACH, OBJETIVO Y LATENCIA (SIMGOTO3-02, Astra; orden 1-090 del CTO)
 * Reproduccion de Astra (2026-10-22-simgoto3-astra-evidencias/copia/pruebas/astra-tres-modos.mjs): 16 escenarios × 3
 * modos. Antes (06e053c), en la vela de un breach el Step devolvia el control antes de confirmar el reto y admitia mas
 * pasos (reloj y progreso a las 12:00; salto y Play, 11:57). Ahora la frontera se resuelve tambien en esa vela y, si el
 * reto ya no esta activo, el motor queda bloqueado para los tres (lib/replayEngine.js, bloqueado).
 */
import {ver,oraculo,fin,escenario,sesionSim,vela,importa,A,asienta,db,retenApi} from '../lib.mjs'
import {banco,velasEnStorage} from '../banco-motor.mjs'
const CI=await importa('lib/sim/cierre.js').catch(()=>null),SV=await importa('lib/sim/servicio.js').catch(()=>null),SAL=await importa('lib/sim/salto.js').catch(()=>null);
// el codigo auditado (c470c8f, historicas.sh) no tiene la cola ni el salto de la etapa 1: ahi, rojo
if(!CI||!SV||!SAL?.creaFrontera){for(let i=0;i<16;i++)oraculo('SG13',`escenario ${i}: sin la cola ni la frontera no se puede`,false,'no estan');fin()}
const COLA=await importa('lib/sim/cola.js');
const resumen=[];
for(const side of ['SELL','BUY'])for(const win of [false,true])for(const medianoche of [false,true])for(const delay of [0,8]){
 const resultados=[];
 for(const modo of ['salto','paso','play']){
  const T=Date.parse('2025-01-07T'+(medianoche?'22:59':'11:55')+':00Z')/1000,sign=side==='SELL'?1:-1;
  const ses=sesionSim({pair:'EUR/USD',date_from:'2025-01-07',date_to:'2025-01-10',last_timestamp:T,capital:100000,balance:100000,challenge_type:'2F',challenge_phase:1});escenario({sim_sessions:[ses]});
  const vs=Array.from({length:10},(_,i)=>{let h=i===1?(win?1.1002:1.1011):i===2?(win?1.1002:1.1041):1.1002,l=win&&i===1?1.0989:win&&i===2?1.0889:1.0999;return sign===1?vela(T+i*60,1.1,h,l,1.1):vela(T+i*60,1.1,2.2-l,2.2-h,1.1)});
  velasEnStorage('EUR/USD',vs,[2024],{tramoAbierto:true});const b=await banco({sesion:ses,userId:A});CI.fijaSaldoConfirmado(ses.id,100000);await SV.leeServicio();await b.repinta();
  b.abreMercado({side,entry:1.1,sl:1.1+sign*.001,tp:1.1-sign*.001,lots:10});
  b.abreMercado({side,entry:1.1,sl:1.1+sign*.02,tp:1.1-sign*.011,lots:10});await b.repinta();
  if(delay)retenApi.antes=async url=>{if(url.includes('challenge/status'))await new Promise(r=>setTimeout(r,delay))};
  const e=b.motor(),params={engine:e,sid:ses.id,pairState:b.refs.pairState,esReto:true,refresca:b.caja.valor.reto.refreshChallengeStatus};
  const terminal=()=>['target_reached','failed_dd_daily','failed_dd_total'].includes(b.caja.valor.reto.challengeStatus?.evaluation?.status);
  if(modo==='salto')await SAL.saltaA({...params,hasta:T+300});
  else if(modo==='paso')for(let k=0;k<5&&!terminal();k++)await b.paso();
  else{
   e._loop=()=>{};e.frontera=SAL.creaFrontera?.(params)??null;e.speed=4;e.play();let k=0;
   while(e.isPlaying&&e.currentTime<T+300&&k<30){e._tickFrame(k++*250);if(e._esperando)await e._esperando;await b.repinta()};e.pause();ver('Play acotado sin atascarse',k<30);
  }
  await new Promise(r=>setTimeout(r,80));await COLA.esperaCola(ses.id);await asienta(100);await COLA.esperaCola(ses.id);await b.repinta();await b.caja.valor.datos.saveProgress(e.currentTime);retenApi.antes=null;
  resultados.push({modo,r:{saldo:b.estado.saldo,reloj:e.currentTime-T,estado:b.caja.valor.reto.challengeStatus?.evaluation?.status,last:db.tablas.sim_sessions[0].last_timestamp-T,abiertas:b.ps().positions.length,trades:db.tablas.sim_trades.map(t=>[+t.pnl,t.closed_at])}});b.caja.raiz.desmonta?.();
 }
 console.log('FAMILIA',JSON.stringify({side,win,medianoche,delay,resultados}));
 oraculo('ASTRA-3',`${side} win=${win} medianoche=${medianoche} delay=${delay}: salto=Step=Play`,resultados.every(x=>JSON.stringify(x.r)===JSON.stringify(resultados[0].r)));resumen.push(resultados);
}
fin()
