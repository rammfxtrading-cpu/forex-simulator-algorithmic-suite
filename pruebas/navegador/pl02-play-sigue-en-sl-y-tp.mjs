/**
 * PL02 · EL PLAY NO SE PARA AL SALTAR EL SL O EL TP, Y PRECIO, LINEA Y ULTIMA VELA VAN A LA PAR (orden 1-157, el 02 de la prueba 4)
 * PESADA: Chrome y `next dev`. SIEMPRE con el turno:  revisiones-suite/con-turno node pruebas/navegador/pl02-play-sigue-en-sl-y-tp.mjs
 * La pagina real (sesion-comun.mjs: Supabase y /api/* interceptados, nada sale de la maquina; la bandera v1 apagada), reto 2F
 * de 100.000, M15, el lunes 06:00 UTC (Go to Londres), Play a 60× con clics de verdad. /api/challenge/status (la relectura del
 * reto) tarda 3 s, como una red lenta. Una orden a mercado del boton de abajo con lo que trae el modal (SL 10 pips, TP 20):
 *   SL · BUY: el precio baja y salta su SL hacia las 06:15
 *   TP · SELL: el precio baja y salta su TP hacia las 06:30
 * ORACULOS, en cada caso:
 *   1 · desde que salta (la posicion desaparece) el reloj del Play no se queda quieto mas de 1 s y el boton sigue en pausa
 *       (reproduciendo): la confirmacion del cierre va por detras. En e8326d5 se queda ~3 s quieto (la relectura del reto)
 *   2 · en cada muestra mientras reproduce: la linea del precio (el ultimo valor de la serie, el que pinta el grafico) y el
 *       cierre de la ultima vela pintada son el mismo; en pausa, tambien el precio de arriba a la derecha (reproduciendo, el
 *       precio de arriba va un render de React por detras del grafico: informativo). En e8326d5 la linea se
 *       queda en el cierre del primer minuto de la vela de M15 (las fantasmas de applyTickUpdate no se refrescan)
 *   3 · en pausa, con el raton sobre la ultima vela: la cabecera (C) dice ese mismo cierre
 * Lo pactado no cambia (sg20 en el banco): un CIERRE que no se confirma en el plazo sigue parando el Play con su aviso.
 */
import { setTimeout as espera } from 'node:timers/promises'
import { montaPagina } from './sesion-comun.mjs'
let rojos = 0, verdes = 0, rotos = 0
const oraculo = (d, ok, extra = '') => { ok ? verdes++ : rojos++; console.log(`  ${ok ? '🟢 VERDE' : '🔴 ROJO '} [PL02] ${d}${extra ? '  · ' + extra : ''}`) }
const control = (d, ok, extra = '') => { if (!ok) rotos++; console.log(`  ${ok ? '✓' : '✗ CONTROL ROTO'} ${d}${extra ? '  · ' + extra : ''}`) }
const hm = t => new Date(t * 1000).toISOString().slice(11, 16)
const RETO = { challenge_type: '2F', challenge_phase: 1, capital: 100000, balance: 100000 }

let app = null
const errores = [], fuera = []
const clicBoton = async (g, f) => { const p = await g.E(`(()=>{const x=[...document.querySelectorAll('button')].find(b=>${f});if(!x||x.disabled)return null;const r=x.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()`); if (p) await g.b.clic(p.x, p.y); return !!p }
const clicPlay = async g => { const p = await g.E(`(()=>{const all=[...document.querySelectorAll('button')];const st=all.find(t=>t.title==='Avanzar vela');const x=all[all.indexOf(st)-1];const r=x.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()`); await g.b.clic(p.x, p.y) }
// lo que se ve: la ultima vela pintada, la linea del precio (el ultimo valor de la serie: las fantasmas), el precio de arriba,
// la cabecera (C), si el boton dice pausa (reproduciendo) y si la posicion sigue
const foto = g => g.E(`(()=>{const cr=window.__chartMap.current['EUR/USD'];const d=cr.series.data(),n=window.__algSuiteRealDataLen
  const sp=[...document.querySelectorAll('span')]
  const badge=sp.find(s=>s.style.fontWeight==='800'&&/^\\d\\.\\d{5}$/.test(s.innerText.trim()))
  const c=sp.find(s=>s.innerText.trim()==='C'&&s.nextElementSibling&&/^\\d\\.\\d{5}$/.test(s.nextElementSibling.innerText.trim()))
  const all=[...document.querySelectorAll('button')];const st=all.find(t=>t.title==='Avanzar vela');const pb=all[all.indexOf(st)-1]
  const lin=[...document.querySelectorAll('div')].filter(x=>x.style.zIndex==='5'&&x.style.position==='absolute').flatMap(x=>[...x.children].map(l=>l.innerText.replace(/\\s+/g,' ').trim()))
  return {t:d[n-1].time,vela:d[n-1].close,linea:d.at(-1).close,precio:badge?Number(badge.innerText.trim()):null,cabecera:c?Number(c.nextElementSibling.innerText.trim()):null,
    boton:pb?.innerHTML||'',pos:lin.some(l=>/^(BUY|SELL)\\b/.test(l))}})()`)
const r5 = x => x == null ? null : Number(Number(x).toFixed(5))
const coherente = f => r5(f.linea) === r5(f.vela) && r5(f.precio) === r5(f.vela)
// reproduciendo, el grafico se pinta en el fotograma (lightweight-charts, a mano) y el precio de arriba en el render de React
// que le sigue: una muestra puede caer entre los dos. La linea y la vela, del mismo grafico, siempre a la par
const grafico = f => r5(f.linea) === r5(f.vela)
const quieto = (m, i0 = 0) => { let max = 0, desde = m[i0]?.ms; for (let i = i0 + 1; i < m.length; i++) { if (m[i].t !== m[i - 1].t) desde = m[i].ms; else max = Math.max(max, m[i].ms - desde) } return max }

for (const caso of [{ nombre: 'SL', lado: 'Buy' }, { nombre: 'TP', lado: 'Sell' }]) {
  const g = await montaPagina({ app, sesion: RETO, latApi: 3000 }); app = g.app
  control(`${caso.nombre}: pagina real montada con el grafico`, await g.E(`!!${g.CR}?.plugin`))
  await espera(4000)   // la carga termina (velas, configuracion, dibujos y el primer status del reto, que tarda 3 s)
  await g.goTo('Londres'); await g.E(`${g.CR}.chart.timeScale().scrollToRealTime()`); await espera(300)
  const d = await g.datos()
  control(`${caso.nombre}: el replay esta el lunes 06:00 UTC (M15)`, hm(d.ultima) === '06:00' && d.iv === 900, hm(d.ultima))
  // la orden a mercado del boton de abajo, con lo que trae el modal (SL 10 pips, TP 20)
  await clicBoton(g, `b.innerText.trim()==='▲ Buy'||b.innerText.trim()==='▼ Sell'?b.innerText.includes(${JSON.stringify(caso.lado)}):false`); await espera(500)
  const ej = await clicBoton(g, `/Ejecutar ${caso.lado}/.test(b.innerText)`); await espera(800)
  control(`${caso.nombre}: ${caso.lado.toUpperCase()} a mercado abierta (su linea en el grafico)`, ej && (await foto(g)).pos)
  await clicBoton(g, `b.innerText.trim()==='60×'`); await clicPlay(g)
  const m = [], t0 = Date.now()
  while (Date.now() - t0 < 5000) { const f = await foto(g); m.push({ ms: Date.now() - t0, ...f }); await espera(100) }
  const i0 = m.findIndex(x => !x.pos)
  control(`${caso.nombre}: la posicion se ha cerrado durante el Play`, i0 > 0, JSON.stringify(m.map(x => [x.ms, hm(x.t), x.pos])))
  const trades = g.doble.tablas.sim_trades
  control(`${caso.nombre}: el cierre es el de su ${caso.nombre} (la fila guardada)`, trades.length === 1 && (caso.nombre === 'SL' ? Number(trades[0].pnl) < 0 : Number(trades[0].pnl) > 0), JSON.stringify(trades.map(t => [t.pnl, t.exit_price ?? t.exit])))
  const tras = i0 > 0 ? m.slice(i0) : []
  const q = quieto(m, Math.max(0, i0))
  const sinPlay = tras.filter(x => !/<rect/.test(x.boton)).length
  oraculo(`${caso.nombre}: desde que salta, el reloj del Play no se queda quieto mas de 1 s y el boton sigue en «pausa» (produccion no espera)`, i0 > 0 && q <= 1000 && sinPlay === 0, `quieto ${q} ms · ${sinPlay} muestras con el boton en «play» · ${JSON.stringify(tras.slice(0, 14).map(x => [x.ms, hm(x.t)]))}`)
  const malas = m.filter(x => !grafico(x)), tarde = m.filter(x => grafico(x) && !coherente(x))
  oraculo(`${caso.nombre}: reproduciendo, en cada muestra la linea del precio y la ultima vela coinciden`, malas.length === 0, `${malas.length}/${m.length} distintas · ${JSON.stringify(malas.slice(0, 4).map(x => [x.ms, hm(x.t), x.vela, x.linea, x.precio]))}`)
  console.log(`    (informativo) muestras con el precio de arriba aun en el render anterior: ${tarde.length}/${m.length} ${JSON.stringify(tarde.slice(0, 3).map(x => [x.ms, hm(x.t), x.vela, x.precio]))}`)
  await clicPlay(g); await espera(1500)
  const p = await foto(g)
  oraculo(`${caso.nombre}: en pausa, la linea del precio, la ultima vela y el precio de arriba coinciden`, coherente(p), JSON.stringify([hm(p.t), p.vela, p.linea, p.precio]))
  // el raton sobre la ultima vela (el grafico, al final: el Play puede haberla sacado de la vista): la cabecera
  await g.E(`${g.CR}.chart.timeScale().scrollToRealTime()`); await espera(500)
  const xy = await g.E(`(()=>{const cr=${g.CR};const r=cr.chart.chartElement().getBoundingClientRect();const n=window.__algSuiteRealDataLen;const d=cr.series.data()[n-1];return {x:r.left+cr.chart.timeScale().logicalToCoordinate(n-1),y:r.top+cr.series.priceToCoordinate(d.close)}})()`)
  await g.b.cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: xy.x, y: xy.y, button: 'none', buttons: 0 }); await espera(400)
  const h = await foto(g)
  oraculo(`${caso.nombre}: en pausa, con el raton sobre la ultima vela, la cabecera (C) dice su cierre`, r5(h.cabecera) === r5(h.vela) && coherente(h), JSON.stringify([h.cabecera, h.vela, h.linea, h.precio]))
  errores.push(...g.b.errores); fuera.push(...g.fuera); g.cierraPagina()
}
control('la pagina no ha pedido nada fuera de la maquina salvo la fuente de Google (bloqueada)', fuera.every(u => u.startsWith('https://fonts.googleapis.com/')), JSON.stringify(fuera))
control('sin errores en la consola de la pagina', errores.length === 0, JSON.stringify(errores.slice(0, 5)))
console.log(`\n${rojos} en rojo · ${verdes} en verde · ${rotos} controles rotos`)
app?.mata(); process.exit(rotos ? 2 : rojos ? 1 : 0)
