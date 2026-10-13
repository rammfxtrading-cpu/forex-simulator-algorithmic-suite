import { escenario,sesionSim,tradeSim,tok,importa,db,A,asienta,puerta,ver,oraculo,fin } from './lib.mjs'
import { llama } from './supabase-falso.mjs'
const adv=(await importa('pages/api/challenge/advance.js')).default
const CI=await importa('lib/sim/cierre.js'),EV=await importa('lib/challengeEngine.js')
const sid='cas-aba';
const initial=()=>escenario({sim_sessions:[sesionSim({id:sid,challenge_type:'2F',challenge_phase:1,capital:100000,balance:111000})],sim_trades:[tradeSim({id:'10000000-0000-4000-8000-000000000001',session_id:sid,pnl:11000,result:'WIN',closed_at:'2025-03-04T12:00:00Z'})]})
const request=()=>llama(adv,{method:'POST',token:tok(A),body:{session_id:sid,outcome:'pass',end_timestamp:1741266000}})
initial();CI.fijaSaldoConfirmado(sid,111000)
const gate=puerta();let retenido=false
db.pausa=c=>c.tabla==='sim_sessions'&&c.op==='update'&&!retenido?(retenido=true,gate.p):null
const r=request();await asienta(50);ver('advance detenido antes de UPDATE',retenido)
let i=0;const result=[]
for (const [pnl,time] of [[-7000,'2025-03-05T12:00:00Z'],[7000,'2025-03-05T13:00:00Z']]) {
 const t=tradeSim({id:`10000000-0000-4000-8000-00000000000${++i+1}`,session_id:sid,pnl,result:pnl<0?'LOSS':'WIN',closed_at:time});delete t.session_id;delete t.created_at
 result.push(await CI.persisteCierre({sessionId:sid,delta:pnl,lastTimestamp:Date.parse(time)/1000,trade:t}))
}
const full=EV.evaluateChallenge({challengeType:'2F',currentPhase:1,capital:100000,trades:db.tablas.sim_trades})
ver('dos cierres guardados por cola/RPC real sobre doble y saldo vuelve a 111000',result.every(x=>x.estado==='guardado')&&db.tablas.sim_trades.length===3&&db.tablas.sim_sessions[0].balance===111000)
ver('evaluador real completo da failed_dd_daily',full.status==='failed_dd_daily',JSON.stringify(full))
gate.abrir();const res=await r;db.pausa=null
console.log('ABA',JSON.stringify({http:res.estado,action:res.cuerpo?.action,session:db.tablas.sim_sessions[0],hijas:db.tablas.sim_sessions.filter(x=>x.challenge_parent_id===sid).length,resultadoCompleto:full.status,dd:full.ddDailyWorstUSD,cierres:result}))
oraculo('ASTRA-R2-ABA','no conceder fase con historial cambiado aunque saldo vuelva al mismo numero',res.estado!==200&&db.tablas.sim_sessions[0].status==='active','HTTP '+res.estado+' status '+db.tablas.sim_sessions[0].status)
initial();db.tablas.sim_sessions[0].status=null
const nul=await request();console.log('STATUS_NULL',JSON.stringify({http:nul.estado,cuerpo:nul.cuerpo}))
oraculo('ASTRA-R2-NULL','status NULL tratado como active permite fase valida (o.14.2)',nul.estado===200,'HTTP '+nul.estado)
fin()
