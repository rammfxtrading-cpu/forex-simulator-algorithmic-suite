/**
 * SG16 · CON UN CIERRE INCIERTO NADIE AVANZA Y NADA SE CUELGA (revision adversarial de r5; orden 1-093 del CTO)
 * Un cierre incierto (lib/sim/cierre.js: la base no contesta si se guardo) deja la posicion OCUPADA sin nada en
 * la cola hasta que servicio.js lo resuelve (>= 20 s). En 6ee1055, frontera.antes esperaba a esa cola vacia y
 * avanzaHasta repetia sin ceder el hilo: Step y Go to colgaban la pestana para siempre (y el Play quedaba
 * «reproduciendo» sin avanzar). Ahora, con una posicion ocupada sin cierre en cola, ninguno de los tres avanza: el
 * Step y el Go to vuelven sin mover el reloj y el Play se para y lo dice (onPausa). Al resolverse, se avanza.
 * ORACULOS, a mano: EUR/USD 11:55; con el incierto, Step, Go to y Play dejan el reloj en 11:55 y el Play parado;
 * resuelto, un Step lleva a 11:56.
 * ⚠️ Contra 6ee1055 esta prueba no da rojo: CUELGA (verificado aparte con un limite externo; ver el encargo r5).
 */
import {ver,oraculo,fin,escenario,sesionSim,vela,importa,A,asienta} from '../lib.mjs'
import {banco,velasEnStorage} from '../banco-motor.mjs'
const CI=await importa('lib/sim/cierre.js').catch(()=>null),SV=await importa('lib/sim/servicio.js').catch(()=>null),SAL=await importa('lib/sim/salto.js').catch(()=>null),COLA=await importa('lib/sim/cola.js').catch(()=>null)
if(!CI||!SV||!SAL?.creaFrontera||!COLA?.ocupa){for(let i=0;i<5;i++)oraculo('SG16',`caso ${i}: sin la cola ni la frontera no se puede`,false,'no estan');fin()}
const T=Date.parse('2025-01-07T11:55:00Z')/1000
const ses=sesionSim({pair:'EUR/USD',date_from:'2025-01-07',date_to:'2025-01-10',last_timestamp:T,capital:100000,balance:100000,challenge_type:'2F',challenge_phase:1});escenario({sim_sessions:[ses]})
velasEnStorage('EUR/USD',Array.from({length:12},(_,i)=>vela(T+i*60,1.1,1.1001,1.0999,1.1)),[2024],{tramoAbierto:true})
const b=await banco({sesion:ses,userId:A});CI.fijaSaldoConfirmado(ses.id,100000);await SV.leeServicio();await b.repinta()
const pos=b.abreMercado({side:'BUY',entry:1.1,sl:1.08,tp:1.12,lots:1});await b.repinta()
const e=b.motor(),params={engine:e,sid:ses.id,pairState:b.refs.pairState,esReto:true,refresca:b.caja.valor.reto.refreshChallengeStatus}
// el incierto, como lo deja cierre.js: la posicion ocupada y nada en la cola
COLA.ocupa(ses.id,pos.id)
ver('control: posicion ocupada y ningun cierre en la cola',COLA.cierresPendientes(ses.id)===0&&COLA.posicionOcupada(ses.id,pos.id))
await b.paso(1);await asienta(20)
oraculo('SG16','con el incierto, el Step no avanza (y vuelve)',e.currentTime===T,String(e.currentTime-T))
await SAL.saltaA({...params,hasta:T+300});await asienta(20)
oraculo('SG16','con el incierto, el Go to no avanza (y vuelve)',e.currentTime===T,String(e.currentTime-T))
let avisado=false;const prev=e.onPausa;e.onPausa=()=>{avisado=true;prev?.()}
e._loop=()=>{};e.frontera=SAL.creaFrontera(params);e.speed=4;e.play()
for(let k=0;k<10;k++){e._tickFrame(k*250);if(e._esperando)await e._esperando}
oraculo('SG16','con el incierto, el Play no avanza, se para y lo dice (onPausa)',e.currentTime===T&&!e.isPlaying&&avisado,JSON.stringify({reloj:e.currentTime-T,isPlaying:e.isPlaying,avisado}))
// resuelto el incierto (servicio.js suelta la posicion): se vuelve a avanzar
COLA.libera(ses.id,pos.id)
await b.paso(1);await asienta(20)
oraculo('SG16','resuelto, un Step lleva a las 11:56',e.currentTime===T+60,String(e.currentTime-T))
oraculo('SG16','resuelto, la posicion sigue abierta (nada se cerro por el camino)',b.ps().positions.length===1,String(b.ps().positions.length))
b.caja.raiz.desmonta?.()
fin()
