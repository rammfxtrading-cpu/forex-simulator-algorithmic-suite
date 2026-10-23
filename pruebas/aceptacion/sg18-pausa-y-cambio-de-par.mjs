/**
 * SG18 · LA PAUSA Y EL CAMBIO DE PAR EN LA ESPERA INICIAL (SGR6-01/02, revision adversarial de r6; orden 1-095 del CTO)
 * Dos pares (EUR/USD y GBP/USD), velas planas desde el 7-ene-2025 11:55; un cierre manual de GBP/USD retenido.
 * SGR6-01 · GBP avanza 3 velas (maestro 11:58) y se cambia a EUR (11:55): su puesta al dia espera al cierre. Si se
 *   RECHAZA, la pausa de la pagina corta la puesta al dia (EUR se queda en 11:55). En 50aa6ec un Step en EUR avanzaba
 *   desde el pasado (11:56: dos relojes). Ahora toda orden pone primero el par al dia: el Step lleva a 11:59, lo mismo
 *   que si el cierre se acepta.
 * SGR6-02 · con el cierre de GBP retenido se pide Go to (o un Step) y, en la espera inicial, se cambia a EUR. En
 *   50aa6ec el Go to, aun no «saltando», no se pausaba y saltaba en segundo plano (12:00) mientras el Step se cortaba.
 *   Ahora el motor esta «ocupado» desde que pide (la pagina no arranca Play encima) y el cambio de par corta a los dos.
 * ORACULOS, a mano: SGR6-01, EUR tras el Step a las 11:59 (aceptado y rechazado); SGR6-02, GBP sigue a las 11:55
 *   con Go to y con Step, y el Go to no llega.
 */
import {ver,oraculo,fin,escenario,sesionSim,vela,importa,A,asienta,db,puerta} from '../lib.mjs'
import {banco,velasEnStorage} from '../banco-motor.mjs'
const CI=await importa('lib/sim/cierre.js').catch(()=>null),SV=await importa('lib/sim/servicio.js').catch(()=>null),COLA=await importa('lib/sim/cola.js').catch(()=>null)
// el codigo auditado (c470c8f, historicas.sh) no tiene la cola: ahi, rojo
if(!CI||!SV||!COLA){for(let i=0;i<5;i++)oraculo('SG18',`caso ${i}: sin la cola de la etapa 1 no se puede`,false,'no estan');fin()}
const T=Date.parse('2025-01-07T11:55:00Z')/1000
async function mesa(){
  const ses=sesionSim({pair:'GBP/USD',date_from:'2025-01-07',date_to:'2025-01-10',last_timestamp:T,capital:100000,balance:100000});escenario({sim_sessions:[ses]})
  if(globalThis.window)globalThis.window.__algSuiteCurrentTime=null
  velasEnStorage('EUR/USD',Array.from({length:12},(_,i)=>vela(T+i*60,1.05,1.0501,1.0499,1.05)),[2024],{tramoAbierto:true})
  velasEnStorage('GBP/USD',Array.from({length:12},(_,i)=>vela(T+i*60,1.25,1.2501,1.2499,1.25)),[2024],{tramoAbierto:true})
  const b=await banco({sesion:ses,userId:A});CI.fijaSaldoConfirmado(ses.id,100000);await SV.leeServicio();await b.repinta()
  await b.cambiaPar('EUR/USD');await b.cambiaPar('GBP/USD')
  return {b,ses}
}
// el cierre manual de GBP, retenido; se suelta con gate.abrir() y se rechaza (23514) o se acepta
function retiene(b,rechazo){
  const pos=b.abreMercado({side:'BUY',entry:1.25,sl:1.2,tp:1.3,lots:1})
  const gate=puerta();let primero=null
  db.pausa=c=>{if(c.tabla==='rpc:sim_cierre_v0'){primero??=c.payload?.p_trade?.id;if(c.payload?.p_trade?.id===primero)return gate.p}}
  db.falla=c=>rechazo&&c.tabla==='rpc:sim_cierre_v0'&&c.payload?.p_trade?.id===primero?{code:'23514',message:'rechazo sintetico'}:null
  return {gate,cerrando:b.caja.valor.trading.closePosition(pos.id,'MANUAL','GBP/USD',1.25)}
}

for(const rechazo of [false,true]){
  const {b,ses}=await mesa()
  await b.paso(3)
  ver(`control SGR6-01 (${rechazo?'rechazo':'aceptado'}): GBP y el maestro a las 11:58, EUR a las 11:55`,b.motor('GBP/USD').currentTime===T+180&&b.motor('EUR/USD').currentTime===T)
  const {gate,cerrando}=retiene(b,rechazo);await asienta(30)
  await b.cambiaPar('EUR/USD')
  gate.abrir();await cerrando;await COLA.esperaCola(ses.id);await asienta(80);db.pausa=null;db.falla=null
  const tras=b.motor('EUR/USD').currentTime-T
  if(rechazo)ver('control SGR6-01: la pausa del rechazo corto la puesta al dia de EUR (11:55)',tras===0,String(tras))
  await b.paso(1);await asienta(40)
  const eur=b.motor('EUR/USD').currentTime-T
  oraculo('SG18',`SGR6-01 (${rechazo?'rechazado':'aceptado'}): un Step en EUR lo pone al dia y avanza: 11:59`,eur===240,JSON.stringify({tras,eur,gbp:b.motor('GBP/USD').currentTime-T}))
  b.caja.raiz.desmonta?.()
}

for(const modo of ['salto','paso']){
  const {b,ses}=await mesa()
  const {gate,cerrando}=retiene(b,false);await asienta(30)
  const e=b.motor('GBP/USD')
  const orden=modo==='salto'?b.irA('nyam'):b.paso(1);await asienta(30)
  if(modo==='salto')oraculo('SG18','SGR6-02: en la espera inicial del Go to el motor esta ocupado (la pagina no arranca Play ni Step encima)',e.ocupado===true&&!e.saltando,JSON.stringify({ocupado:e.ocupado,saltando:e.saltando}))
  await b.cambiaPar('EUR/USD')
  gate.abrir();await cerrando;const r=await orden;await COLA.esperaCola(ses.id);await asienta(80);db.pausa=null;db.falla=null
  const gbp=e.currentTime-T
  oraculo('SG18',`SGR6-02 (${modo}): cambiar de par en la espera inicial lo corta: GBP sigue a las 11:55${modo==='salto'?' y el Go to no llega':''}`,gbp===0&&(modo!=='salto'||r?.llego===false),JSON.stringify({gbp,r}))
  b.caja.raiz.desmonta?.()
}
fin()
