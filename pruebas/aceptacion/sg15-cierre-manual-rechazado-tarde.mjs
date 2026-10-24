/**
 * SG15 · CIERRE MANUAL RECHAZADO TARDE Y BREACH INTRAVELA (SIMGOTO4-01, Astra; orden 1-093 del CTO)
 * Reproduccion de Astra (2026-10-22-simgoto4-astra-evidencias/copia/pruebas/astra-manual-breach.mjs), con su
 * oraculo escrito a mano. Reto 2F, EUR/USD 7-ene-2025 11:55, una posicion de 10 lotes a 1,1000 (SL y TP a
 * 200 pips). La vela de las 11:57 llega a 1,0940 (BUY) o a 1,1060 (SELL): no toca SL ni TP, pero el flotante
 * (-6000) quema el reto diario. El alumno cierra a mano a las 11:55; la base retiene el cierre y lo RECHAZA
 * (23514) antes o despues de que se pulse Go to / Step x5 / Play.
 * Antes (b47bc6d), con el rechazo tardio, Step y Play recorrian las 11:57 con la posicion fuera y el breach
 * intravela no se miraba nunca: reto activo, 1 abierta, saldo 100.000. Ahora los tres esperan a la cola ANTES de
 * cada vela con un cierre en vuelo (lib/sim/salto.js, frontera.antes).
 * ORACULO, a mano: en los tres modos y en los dos momentos, breach a las 11:57 con el cierre a 1,0940 o 1,1060:
 * -5050 (el precio de la regla del reto), saldo 94.950, failed_dd_daily, 0 abiertas, reloj 11:57.
 * r6 (SIMGOTO5-01, orden 1-095): el banco hace la PAUSA REAL de la pagina (pausaPorBloqueo) al rechazarse el cierre.
 * Con el rechazo TARDE, los tres modos se paran en la vela del cierre: reloj 11:55, la posicion de vuelta, reto activo,
 * sin filas (en b47bc6d.. 6a68763 el Go to seguia desde su espera inicial y quemaba el reto). El alumno REPITE la orden
 * y entonces, en los tres, el breach de las 11:57. Sin Step de mas: el bucle de Step para cuando un Step no avanza.
 */
import {ver,oraculo,fin,escenario,sesionSim,vela,importa,A,asienta,db,puerta} from '../lib.mjs'
import {banco,velasEnStorage} from '../banco-motor.mjs'
const CI=await importa('lib/sim/cierre.js').catch(()=>null),SV=await importa('lib/sim/servicio.js').catch(()=>null),SAL=await importa('lib/sim/salto.js').catch(()=>null)
// el codigo auditado (c470c8f, historicas.sh) no tiene la cola ni la frontera: ahi, rojo
if(!CI||!SV||!SAL?.creaFrontera){for(let i=0;i<24;i++)oraculo('SG15',`caso ${i}: sin la cola ni la frontera no se puede`,false,'no estan');fin()}
const COLA=await importa('lib/sim/cola.js')
const ESPERADO=JSON.stringify({saldo:94950,reloj:120,estado:'failed_dd_daily',abiertas:0,trades:[[-5050,'2025-01-07T11:57:00.000Z']]})
const PARADO=JSON.stringify({saldo:100000,reloj:0,estado:'active',abiertas:1,trades:[]})
for(const side of ['BUY','SELL'])for(const cierreTarde of [false,true])for(const modo of ['salto','paso','play']){
  const T=Date.parse('2025-01-07T11:55:00Z')/1000
  const ses=sesionSim({pair:'EUR/USD',date_from:'2025-01-07',date_to:'2025-01-10',last_timestamp:T,capital:100000,balance:100000,challenge_type:'2F',challenge_phase:1});escenario({sim_sessions:[ses]})
  if(globalThis.window)globalThis.window.__algSuiteCurrentTime=null
  const vs=Array.from({length:12},(_,i)=>vela(T+i*60,1.1,i===2&&side==='SELL'?1.106:1.1001,i===2&&side==='BUY'?1.094:1.0999,1.1))
  velasEnStorage('EUR/USD',vs,[2024],{tramoAbierto:true})
  const b=await banco({sesion:ses,userId:A});CI.fijaSaldoConfirmado(ses.id,100000);await SV.leeServicio();await b.repinta()
  const pos=b.abreMercado({side,entry:1.1,sl:side==='BUY'?1.08:1.12,tp:side==='BUY'?1.12:1.08,lots:10});await b.repinta()
  const e=b.motor(),params={engine:e,sid:ses.id,pairState:b.refs.pairState,esReto:true,refresca:b.caja.valor.reto.refreshChallengeStatus}
  const gate=puerta();let primero=null,retenida=false
  db.pausa=c=>{if(c.tabla==='rpc:sim_cierre_v0'){retenida=true;primero??=c.payload?.p_trade?.id;return gate.p}}
  db.falla=c=>c.tabla==='rpc:sim_cierre_v0'&&c.payload?.p_trade?.id===primero?{code:'23514',message:'rechazo sintetico'}:null
  const cerrando=b.caja.valor.trading.closePosition(pos.id,'MANUAL','EUR/USD',1.1);await asienta(50)
  ver(`control (${side}, ${cierreTarde?'tarde':'antes'}, ${modo}): el cierre manual esta retenido y la posicion, provisionalmente fuera`,retenida&&b.ps().positions.length===0)
  if(!cierreTarde){gate.abrir();await cerrando;await b.repinta()}
  const avanza=async()=>{
    if(modo==='salto')return SAL.saltaA({...params,hasta:T+300})
    if(modo==='paso'){for(let i=0;i<5;i++){const antes=e.currentTime;await b.paso();if(e.currentTime===antes)break}return}
    e._loop=()=>{};e.frontera=SAL.creaFrontera(params);e.speed=4;e.play();let k=0
    while((e.isPlaying||e._esperando)&&e.currentTime<T+300&&k<30){e._tickFrame(k++*250);if(e._esperando)await e._esperando;await b.repinta()}
    e.pause()
  }
  const run=avanza();await asienta(100)
  // con el rechazo tardio, mientras el cierre esta en vuelo nadie pasa de la vela del cierre (las 11:55)
  if(cierreTarde)oraculo('SG15',`${side}, ${modo}: con el cierre en vuelo, el reloj no pasa de las 11:55`,e.currentTime===T,String(e.currentTime-T))
  gate.abrir();await cerrando;await run;db.pausa=null;db.falla=null
  await COLA.esperaCola(ses.id);await asienta(100);await b.repinta()
  const foto=()=>JSON.stringify({saldo:b.estado.saldo,reloj:e.currentTime-T,estado:b.caja.valor.reto.challengeStatus?.evaluation?.status,abiertas:b.ps().positions.length,trades:db.tablas.sim_trades.map(t=>[+t.pnl,t.closed_at])})
  if(cierreTarde){
    const r0=foto()
    oraculo('SG15',`${side}, rechazo TARDE, ${modo}: la pausa del rechazo lo para en las 11:55, con la posicion de vuelta y el reto activo`,r0===PARADO,r0)
    // el alumno repite la orden
    await avanza();await COLA.esperaCola(ses.id);await asienta(100);await b.repinta()
  }
  const r=foto()
  oraculo('SG15',`${side}, rechazo ${cierreTarde?'TARDE (repetida la orden)':'antes de avanzar'}, ${modo}: breach intravela a las 11:57, -5050, saldo 94.950`,r===ESPERADO,r)
  b.caja.raiz.desmonta?.()
}
fin()
