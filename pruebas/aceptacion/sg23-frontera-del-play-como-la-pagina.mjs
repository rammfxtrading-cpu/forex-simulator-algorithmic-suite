/**
 * SG23 · SG14 CON LA FRONTERA DEL PLAY DE LA PAGINA (play: true, components/_SessionInner.js handlePlayPause; orden 1-157)
 * Copia literal de sg14 salvo esa linea: el Play monta su frontera como la pagina. Con la orden 1-157 la confirmacion
 * de un cierre va por detras y el Play solo la espera con algo abierto: aqui queda la otra posicion, asi que el breach
 * diario de la vela siguiente se ve igual que en el salto y el Step (lib/sim/salto.js). Mismos oraculos que sg14.
 */
/**
 * SG14 · STEP O GO TO CON LA FRONTERA DEL PLAY PENDIENTE (SGR4-01, revision adversarial de r4; orden 1-090 del CTO)
 * Reto 2F, EUR/USD 11:55, dos SELL de 10 lotes: la primera con SL 1,1010 (tocado a las 11:56, -1000); la segunda con
 * SL 1,12, y a las 11:57 la vela llega a 1,1041 (-4100 flotante + 1000 del dia = breach diario de 5000).
 * El alumno da a Play; a las 11:56 salta el SL y la frontera del Play espera (challenge/status tarda 300 ms). En esa
 * ventana pausa y pulsa Step (o Go to). Antes (e03c81b) el Step/salto creaba una frontera nueva con el cierre ya en su
 * huella, no esperaba y miraba la vela de las 11:57 con el dia sin refrescar: reto «active» y una posicion abierta
 * (Go to: hasta las 12:00). Ahora espera a la frontera pendiente (lib/sim/salto.js saltaA) y los tres dan lo mismo.
 * ORACULO, a mano: failed_dd_daily, reloj y progreso 11:57, 0 abiertas, filas [-1000 11:56, -4050 11:57].
 */
import {ver,oraculo,fin,escenario,sesionSim,vela,importa,A,asienta,db,retenApi} from '../lib.mjs'
import {banco,velasEnStorage} from '../banco-motor.mjs'
const CI=await importa('lib/sim/cierre.js').catch(()=>null),SV=await importa('lib/sim/servicio.js').catch(()=>null),SAL=await importa('lib/sim/salto.js').catch(()=>null)
// el codigo auditado (c470c8f, historicas.sh) no tiene la cola ni la frontera: ahi, rojo
if(!CI||!SV||!SAL?.creaFrontera){for(const m of ['play','paso','salto'])oraculo('SG14',`${m}: sin la cola ni la frontera no se puede`,false,'no estan');fin()}
const COLA=await importa('lib/sim/cola.js')
const ESPERADO=JSON.stringify({reloj:2,estado:'failed_dd_daily',last:2,abiertas:0,trades:[[-1000,'2025-01-07T11:56:00.000Z'],[-4050,'2025-01-07T11:57:00.000Z']]})
for(const segundo of ['play','paso','salto']){
  const T=Date.parse('2025-01-07T11:55:00Z')/1000
  const ses=sesionSim({pair:'EUR/USD',date_from:'2025-01-07',date_to:'2025-01-10',last_timestamp:T,capital:100000,balance:100000,challenge_type:'2F',challenge_phase:1});escenario({sim_sessions:[ses]})
  const vs=Array.from({length:10},(_,i)=>vela(T+i*60,1.1,i===1?1.1011:i===2?1.1041:1.1002,1.0999,1.1))
  velasEnStorage('EUR/USD',vs,[2024],{tramoAbierto:true});const b=await banco({sesion:ses,userId:A});CI.fijaSaldoConfirmado(ses.id,100000);await SV.leeServicio();await b.repinta()
  b.abreMercado({side:'SELL',entry:1.1,sl:1.101,tp:1.099,lots:10});b.abreMercado({side:'SELL',entry:1.1,sl:1.12,tp:1.089,lots:10});await b.repinta()
  retenApi.antes=async url=>{if(url.includes('challenge/status'))await new Promise(r=>setTimeout(r,300))}
  const e=b.motor(),params={engine:e,sid:ses.id,pairState:b.refs.pairState,esReto:true,refresca:b.caja.valor.reto.refreshChallengeStatus}
  e._loop=()=>{};e.frontera=SAL.creaFrontera({...params,play:true});e.speed=4;e.play();let k=0,durante=null
  while(k<30){ if(!e.isPlaying&&!e._esperando)break; e._tickFrame(k++*250)
    if(e._esperando&&durante===null&&segundo!=='play'){ e.pause(); durante=e.currentTime-T
      // el alumno pausa (Space) y pulsa Step / Go to mientras la frontera del Play sigue pendiente
      if(segundo==='paso') await b.paso(); else await SAL.saltaA({...params,hasta:T+300}) }
    if(e._esperando)await e._esperando; await b.repinta() }
  e.pause()
  await new Promise(r=>setTimeout(r,80));await COLA.esperaCola(ses.id);await asienta(100);await b.repinta();await b.caja.valor.datos.saveProgress(e.currentTime);retenApi.antes=null
  const r=JSON.stringify({reloj:(e.currentTime-T)/60,estado:b.caja.valor.reto.challengeStatus?.evaluation?.status,last:(db.tablas.sim_sessions[0].last_timestamp-T)/60,abiertas:b.ps().positions.length,trades:db.tablas.sim_trades.map(t=>[+t.pnl,t.closed_at])})
  if(segundo!=='play')ver(`control (${segundo}): se pulso con la frontera del Play pendiente, a las 11:56`,durante===60,String(durante))
  oraculo('SG14',`${segundo}: breach diario a las 11:57, sin posiciones, las dos filas, reloj y progreso 11:57`,r===ESPERADO,r)
  b.caja.raiz.desmonta?.()
}
fin()
