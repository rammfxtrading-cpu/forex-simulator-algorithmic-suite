/**
 * SV02 · LA REGLA DE LA VELA EN LOS TRES MODOS, CON LA TOLERANCIA DEL DOJI EN DECIMAS DE PIP DE CADA PAR (SIMVELA1-01,
 * Astra; orden 1-100 del CTO). Las familias de Astra (2026-10-23-simvela1-astra-evidencias/copia/pruebas/astra-vela-
 * familias.mjs): alcista, bajista, doji con un extremo mas cerca, doji equidistante, huecos de apertura y pendientes
 * llenadas en la vela, BUY y SELL, en Step, Play y Go to, con el motivo y la hora escritos a mano.
 * SIMVELA1-01: los dos espejos de precision (10,01 y 10,02 pips: a decima de pip EMPATAN → SL) y, nuevos, los mismos en
 * pares con JPY (pip 0,01): en 5aed940 la escala fija de 0,0000001 los desempataba y ganaba el TP. Un control JPY no
 * ambiguo (10,04 frente a 10,09 pips) comprueba que la decima de pip no es mas gruesa de la cuenta.
 */
import {ver,oraculo,fin,escenario,sesionSim,vela,importa,A,asienta,db} from '../lib.mjs';
import {banco,velasEnStorage} from '../banco-motor.mjs';
const V=await importa('lib/sim/vela.js').catch(()=>null),SAL=await importa('lib/sim/salto.js').catch(()=>null),CI=await importa('lib/sim/cierre.js').catch(()=>null),SV=await importa('lib/sim/servicio.js').catch(()=>null),COLA=await importa('lib/sim/cola.js').catch(()=>null);
// sin la regla ni la cola (el codigo auditado, historicas.sh): rojo
if(!V||!SAL?.creaFrontera||!CI||!SV||!COLA){for(let i=0;i<10;i++)oraculo('SV02',`caso ${i}: sin lib/sim/vela.js ni la cola no se puede`,false,'no estan');fin()}
const casos=[];
for(const [id,v,buy,sell] of [
 ['alza',[1.1,1.1012,1.0988,1.1006],'SL','TP'],
 ['baja',[1.1,1.1012,1.0988,1.0994],'TP','SL'],
 ['doji-min',[1.1,1.1015,1.0989,1.1],'SL','TP'],
 ['doji-max',[1.1,1.1011,1.0985,1.1],'TP','SL'],
 ['doji-igual',[1.1,1.1012,1.0988,1.1],'SL','SL'],
 ['abre-alto',[1.102,1.103,1.098,1.1025],'TP','SL'],
 ['abre-bajo',[1.098,1.102,1.097,1.0975],'SL','TP']])for(const side of ['BUY','SELL'])casos.push({id:id+'-'+side,side,v,entry:1.1,sl:side==='BUY'?1.099:1.101,tp:side==='BUY'?1.101:1.099,motivo:side==='BUY'?buy:sell,pendiente:false});
for(const [id,v,sl,tp,motivo] of [
 ['llena-baja',[1.101,1.104,1.098,1.1005],1.099,1.103,'SL'],
 ['llena-alza',[1.101,1.104,1.0995,1.102],1.099,1.103,'TP'],
 ['llena-alza-sl',[1.101,1.104,1.098,1.102],1.099,1.103,'SL'],
 ['llena-no-cierre',[1.101,1.102,1.0995,1.1015],1.099,1.103,null],
 ['gap-entrada',[1.0995,1.1035,1.0993,1.103],1.099,1.103,'TP']])for(const side of ['BUY','SELL']){
 const flip=x=>+(2.2-x).toFixed(7);const vv=side==='BUY'?v:[flip(v[0]),flip(v[2]),flip(v[1]),flip(v[3])];
 casos.push({id:id+'-'+side,side,v:vv,entry:1.1,sl:side==='BUY'?sl:flip(sl),tp:side==='BUY'?tp:flip(tp),motivo,pendiente:true,gap:id==='gap-entrada'});
}
casos.push({id:'precision-decima-BUY',side:'BUY',v:[1.1,1.101001,1.098998,1.1],entry:1.1,sl:1.099,tp:1.101,motivo:'SL',pendiente:false});
casos.push({id:'precision-decima-SELL',side:'SELL',v:[1.1,1.101002,1.098999,1.1],entry:1.1,sl:1.101,tp:1.099,motivo:'SL',pendiente:false});
// SIMVELA1-01 en pares con JPY (pip 0,01): los mismos espejos a la escala del yen, y un control no ambiguo
casos.push({id:'jpy-decima-BUY',par:'USD/JPY',side:'BUY',v:[150,150.1001,149.8998,150],entry:150,sl:149.9,tp:150.1,motivo:'SL',pendiente:false});
casos.push({id:'jpy-decima-SELL',par:'GBP/JPY',side:'SELL',v:[150,150.1002,149.8999,150],entry:150,sl:150.1,tp:149.9,motivo:'SL',pendiente:false});
casos.push({id:'jpy-no-ambiguo-BUY',par:'USD/JPY',side:'BUY',v:[150,150.1004,149.8991,150],entry:150,sl:149.89,tp:150.1,motivo:'TP',pendiente:false});
for(const [ix,c] of casos.entries()){
 const par=c.par??['EUR/USD','GBP/USD','AUD/USD','NZD/USD'][ix%4],anio=2025;let date=new Date(Date.UTC(anio,0,7+7*ix));while(date.getUTCDay()!==2)date=new Date(+date+86400000);const dia=date.toISOString().slice(0,10),ny12=Number(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hour:'2-digit',hourCycle:'h23'}).format(new Date(+date+12*3600000))),T=+date/1000+(ny12===8?11:12)*3600-60;
 const resultados=[];
 for(const modo of ['paso','play','salto']){
  const ses=sesionSim({pair:par,date_from:dia,date_to:new Date(+date+86400000*3).toISOString().slice(0,10),last_timestamp:T,capital:100000,balance:100000});escenario({sim_sessions:[ses]});window.__algSuiteCurrentTime=null;
  const inicio=c.pendiente?(c.side==='BUY'?1.101:1.099):c.entry;
  velasEnStorage(par,[vela(T,inicio,inicio+.0001,inicio-.0001,inicio),vela(T+60,...c.v),vela(T+120,c.v[3],c.v[3],c.v[3],c.v[3])],[anio-1],{tramoAbierto:true});
  const b=await banco({sesion:ses,userId:A});CI.fijaSaldoConfirmado(ses.id,100000);await SV.leeServicio();await b.repinta();
  ver(c.id+': motor usa fixture propio',b.motor()?.candles.some(x=>x.time===T+60&&x.high===c.v[1]));
  const ord={side:c.pendiente?c.side+'_LIMIT':c.side,entry:c.entry,sl:c.sl,tp:c.tp,lots:1};if(c.pendiente)await b.pendiente(ord);else b.abreMercado(ord);await b.repinta();
  const e=b.motor(),params={engine:e,sid:ses.id,pairState:b.refs.pairState,esReto:false};
  if(modo==='paso')await b.paso(1);
  else if(modo==='salto'){const dest=await b.irA('nyam');ver('Go to tiene destino NY en la vela probada',dest?.time===T+60,JSON.stringify(dest));}
  else {e._loop=()=>{};e.frontera=SAL.creaFrontera(params);e.speed=4;e.play();let k=0;while(e.isPlaying&&e.currentTime<T+60&&k<12){e._tickFrame(k++*250);if(e._esperando)await e._esperando;await b.repinta();}e.pause();ver('Play alcanza una vela',e.currentTime===T+60);}
  await COLA.esperaCola(ses.id);await asienta(50);await b.repinta();
  const rr={modo,reloj:e.currentTime-T,saldo:b.estado.saldo,trades:b.ps().trades.map(t=>({motivo:t.reason,entrada:t.entry,salida:t.exit,pnl:Math.round(t.pnl*100)/100,hora:t.closeTime-T})),abiertas:b.ps().positions.map(x=>({entrada:x.entry})),filas:db.tablas.sim_trades.map(x=>({entrada:x.entry_price,pnl:+x.pnl}))};resultados.push(rr);
  oraculo('SV02',c.id+' '+modo+': motivo y hora a mano',rr.reloj===60&&(c.motivo?rr.trades.length===1&&rr.trades[0].motivo===c.motivo&&rr.trades[0].hora===60:rr.trades.length===0&&rr.abiertas.length===1),JSON.stringify(rr));
  // el precio de entrada con hueco (la pendiente se llena al precio limite, no a la apertura: +300 y no +350) es un
  // LIMITE preexistente declarado en el encargo (punto 5) y en SIMVELA1: no se comprueba aqui
  b.caja.raiz.desmonta();await asienta();
 }
const sig=r=>JSON.stringify({...r,modo:null});oraculo('SV02',c.id+': igualdad de los tres modos',resultados.every(r=>sig(r)===sig(resultados[0])));
}
fin();
