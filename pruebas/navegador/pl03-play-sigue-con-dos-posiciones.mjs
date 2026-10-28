/**
 * PL03 · CON DOS POSICIONES LEJOS DEL LIMITE, EL PLAY NO SE PARA AL CERRARSE UNA (orden 1-158 del CTO, decision 1)
 * PESADA: Chrome y `next dev`. SIEMPRE con el turno:  revisiones-suite/con-turno node pruebas/navegador/pl03-play-sigue-con-dos-posiciones.mjs
 * La pagina real (sesion-comun.mjs: Supabase y /api/* interceptados, nada sale de la maquina; la bandera v1 apagada), reto 2F
 * de 100.000, M15, el lunes 06:00 UTC (Go to Londres), Play a 60× con clics de verdad. /api/challenge/status (la relectura del
 * reto) tarda 3 s, como una red lenta. DOS ordenes a mercado del boton de abajo con lo que trae el modal (10 lotes, SL 10
 * pips, TP 20): una BUY y una SELL. El precio baja: salta el SL de la BUY (−1.000) hacia las 06:15 y, con la SELL aun abierta,
 * su TP (+2.000) a las 06:23. Lejos de los limites (diario 5.000, total 10.000). /api/challenge/status responde con el reto
 * evaluado por lib/challengeEngine.js sobre los trades del doble (app.mjs, reto: true). Con la relectura lenta, el cierre de la
 * SELL va en la cola detras de dos relecturas (la del cierre de la BUY y la de la frontera): se guarda hacia los 6,5 s, y se
 * muestrea 10 s.
 * En 224b028 (orden 1-157), tras el cierre de la BUY queda la SELL abierta y el Play espera la confirmacion (~3 s, la
 * relectura del reto): la vela siguiente podria quemar el reto. Ahora (lib/sim/peorCaso.js) el peor caso de esa vela
 * (el reto confirmado, el cierre como la perdida de su SL, la SELL en el maximo de la vela) queda lejos y no se espera.
 * ORACULOS:
 *   1 · desde que se cierra la primera, el reloj del Play no se queda quieto mas de 1 s y el boton sigue en pausa
 *   2 · las dos filas guardadas (−1.000 y +2.000) y el reto sigue activo (sin breach)
 * CONTROL (que la comprobacion es la que decide): la misma prueba con el margen forzado a 1 (el 100 % del capital:
 * globalThis.__simMargenPeorCaso, ninguna vela es segura) vuelve a esperar (quieto mas de 2 s tras el primer cierre)
 */
import { setTimeout as espera } from 'node:timers/promises'
import { montaPagina } from './sesion-comun.mjs'
let rojos = 0, verdes = 0, rotos = 0
const oraculo = (d, ok, extra = '') => { ok ? verdes++ : rojos++; console.log(`  ${ok ? '🟢 VERDE' : '🔴 ROJO '} [PL03] ${d}${extra ? '  · ' + extra : ''}`) }
const control = (d, ok, extra = '') => { if (!ok) rotos++; console.log(`  ${ok ? '✓' : '✗ CONTROL ROTO'} ${d}${extra ? '  · ' + extra : ''}`) }
const hm = t => new Date(t * 1000).toISOString().slice(11, 16)
const RETO = { challenge_type: '2F', challenge_phase: 1, capital: 100000, balance: 100000 }

let app = null
const errores = [], fuera = []
const clicBoton = async (g, f) => { const p = await g.E(`(()=>{const x=[...document.querySelectorAll('button')].find(b=>${f});if(!x||x.disabled)return null;const r=x.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()`); if (p) await g.b.clic(p.x, p.y); return !!p }
const clicPlay = async g => { const p = await g.E(`(()=>{const all=[...document.querySelectorAll('button')];const st=all.find(t=>t.title==='Avanzar vela');const x=all[all.indexOf(st)-1];const r=x.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()`); await g.b.clic(p.x, p.y) }
// la ultima vela pintada, si el boton dice pausa (reproduciendo) y cuantas posiciones tienen su linea
const foto = g => g.E(`(()=>{const cr=window.__chartMap.current['EUR/USD'];const d=cr.series.data(),n=window.__algSuiteRealDataLen
  const all=[...document.querySelectorAll('button')];const st=all.find(t=>t.title==='Avanzar vela');const pb=all[all.indexOf(st)-1]
  const lin=[...document.querySelectorAll('div')].filter(x=>x.style.zIndex==='5'&&x.style.position==='absolute').flatMap(x=>[...x.children].map(l=>l.innerText.replace(/\\s+/g,' ').trim()))
  return {t:d[n-1].time,boton:pb?.innerHTML||'',pos:lin.filter(l=>/^(BUY|SELL)\\b/.test(l)).length}})()`)
const quieto = (m, i0 = 0) => { let max = 0, desde = m[i0]?.ms; for (let i = i0 + 1; i < m.length; i++) { if (m[i].t !== m[i - 1].t) desde = m[i].ms; else max = Math.max(max, m[i].ms - desde) } return max }
const abre = async (g, lado) => {
  await clicBoton(g, `b.innerText.trim()==='▲ Buy'||b.innerText.trim()==='▼ Sell'?b.innerText.includes(${JSON.stringify(lado)}):false`); await espera(500)
  const ej = await clicBoton(g, `/Ejecutar ${lado}/.test(b.innerText)`); await espera(800)
  return ej
}

for (const caso of [{ nombre: 'lejos del limite', margen: null }, { nombre: 'CONTROL margen 1', margen: 1 }]) {
  const g = await montaPagina({ app, sesion: RETO, latApi: 3000, reto: true }); app = g.app
  control(`${caso.nombre}: pagina real montada con el grafico`, await g.E(`!!${g.CR}?.plugin`))
  await espera(4000)   // la carga termina (velas, configuracion, dibujos y el primer status del reto, que tarda 3 s)
  await g.goTo('Londres'); await g.E(`${g.CR}.chart.timeScale().scrollToRealTime()`); await espera(300)
  const d = await g.datos()
  control(`${caso.nombre}: el replay esta el lunes 06:00 UTC (M15)`, hm(d.ultima) === '06:00' && d.iv === 900, hm(d.ultima))
  const b1 = await abre(g, 'Buy'), b2 = await abre(g, 'Sell')
  console.log(`    (informativo) las lineas: ${JSON.stringify((await g.lineas()).map(l => l.txt))}`)
  control(`${caso.nombre}: BUY y SELL a mercado abiertas (sus dos lineas en el grafico)`, b1 && b2 && (await foto(g)).pos === 2, JSON.stringify((await foto(g)).pos))
  if (caso.margen != null) await g.E(`globalThis.__simMargenPeorCaso=${caso.margen}`)
  await espera(3500)   // la relectura del reto tras abrir (3 s) ya ha respondido
  await clicBoton(g, `b.innerText.trim()==='60×'`); await clicPlay(g)
  const m = [], t0 = Date.now()
  while (Date.now() - t0 < 10000) { const f = await foto(g); m.push({ ms: Date.now() - t0, ...f }); await espera(100) }
  const i0 = m.findIndex(x => x.pos < 2), i1 = m.findIndex(x => x.pos === 0)
  control(`${caso.nombre}: durante el Play se cierra una y despues la otra`, i0 > 0 && i1 >= i0 && m[i0].pos === 1, JSON.stringify(m.map(x => [x.ms, hm(x.t), x.pos])))
  const trades = g.doble.tablas.sim_trades
  const filas = JSON.stringify(trades.map(t => [Math.round(Number(t.pnl)), t.side]))
  const q = quieto(m, Math.max(0, i0))
  const tras = i0 > 0 ? m.slice(i0) : []
  const sinPlay = tras.filter(x => !/<rect/.test(x.boton)).length
  const detalle = `quieto ${q} ms · ${sinPlay} muestras con el boton en «play» · ${JSON.stringify(tras.slice(0, 14).map(x => [x.ms, hm(x.t), x.pos]))}`
  if (caso.margen == null) {
    oraculo(`${caso.nombre}: desde que se cierra la primera (la otra sigue abierta), el reloj del Play no se queda quieto mas de 1 s y el boton sigue en «pausa»`, i0 > 0 && q <= 1000 && sinPlay === 0, detalle)
    // un breach cerraria la SELL con su motivo y otro pnl: las dos filas exactas lo descartan
    oraculo(`${caso.nombre}: las dos filas guardadas (la BUY en su SL, −1.000; la SELL en su TP, +2.000): sin breach`, trades.length === 2 && filas === JSON.stringify([[-1000, 'BUY'], [2000, 'SELL']]), filas)
  } else {
    control(`${caso.nombre}: con el margen forzado al 100 % del capital, el Play vuelve a esperar la confirmacion (quieto mas de 2 s tras el primer cierre)`, i0 > 0 && q > 2000, detalle)
  }
  await clicPlay(g); await espera(500)
  await g.E(`delete globalThis.__simMargenPeorCaso`)
  errores.push(...g.b.errores); fuera.push(...g.fuera); g.cierraPagina()
}
control('la pagina no ha pedido nada fuera de la maquina salvo la fuente de Google (bloqueada)', fuera.every(u => u.startsWith('https://fonts.googleapis.com/')), JSON.stringify(fuera))
control('sin errores en la consola de la pagina', errores.length === 0, JSON.stringify(errores.slice(0, 5)))
console.log(`\n${rojos} en rojo · ${verdes} en verde · ${rotos} controles rotos`)
app?.mata(); process.exit(rotos ? 2 : rojos ? 1 : 0)
