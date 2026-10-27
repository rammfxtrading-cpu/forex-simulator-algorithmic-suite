/**
 * DP01 · LOS TIRADORES DEL DIBUJO DE POSICION, COMO TRADINGVIEW, EN LA PAGINA REAL (ordenes 1-105 y 1-110 del CTO)
 * PESADA: Chrome y `next dev`. SIEMPRE con el turno:  revisiones-suite/con-turno node pruebas/navegador/dp01-tiradores-posicion.mjs
 * La pagina de sesion real (pruebas/navegador/app.mjs: Supabase y /api/candles interceptados, nada sale de la maquina),
 * la herramienta «Long / Short» de la barra y el raton de verdad (CDP). En largo y en corto, DESPUES de crear el dibujo
 * y soltarlo (clic fuera), se arrastra cada tirador:
 *   SL izquierdo       30 px alejandose de la entrada, la mano yendose 30 px a la derecha → cambia SOLO el SL
 *   TP izquierdo       igual                                        → cambia SOLO el TP
 *   entrada, circulo (derecha)   a la derecha y arriba              → cambia SOLO el borde derecho; el precio, igual
 *   entrada, cuadrado (izquierda) a la izquierda con la mano temblando ±15 px y acabando 25 px mas abajo
 *                                                                  → cambia el precio de entrada Y el borde izquierdo
 * (la linea de entrada, dada la vuelta por la orden 1-139, punto 4: hasta 2e4dbd7 era al reves)
 * y, al final, los pips del SL y el RR que pinta el dibujo son los de sus precios nuevos.
 * Contra 785d9a8 (el plugin con sus tres tiradores) sale en ROJO, codigo 1; contra 2e4dbd7 (la entrada sin dar la vuelta), tambien.
 */
import { arrancaNext, abreSesion } from './app.mjs'
let rojos = 0, verdes = 0, rotos = 0, TOL = 0
const oraculo = (d, ok, extra = '') => { ok ? verdes++ : rojos++; console.log(`  ${ok ? '🟢 VERDE' : '🔴 ROJO '} [DP01] ${d}${extra ? '  · ' + extra : ''}`) }
const control = (d, ok, extra = '') => { if (!ok) rotos++; console.log(`  ${ok ? '✓' : '✗ CONTROL ROTO'} ${d}${extra ? '  · ' + extra : ''}`) }

const app = await arrancaNext()
const { b, fuera } = await abreSesion(app)
const E = x => b.evalua(x)
const sale = c => { console.log(`\n${rojos} en rojo · ${verdes} en verde · ${rotos} controles rotos`); b.cierra(); app.mata(); process.exit(c) }
control('pagina real montada con el grafico y el plugin de dibujo', await E(`!!window.__chartMap?.current?.['EUR/USD']?.plugin`))
if (rotos) sale(2)
TOL = Math.abs((await E(`window.__chartMap.current['EUR/USD'].series.coordinateToPrice(300)`)) - (await E(`window.__chartMap.current['EUR/USD'].series.coordinateToPrice(303)`)))
console.log('  margen de precio (3 px):', TOL.toFixed(6))

const CR = `window.__chartMap.current['EUR/USD']`
const herramienta = `[...${CR}.plugin._interactionManager._tools.values()].filter(x=>x.toolType==='LongShortPosition').at(-1)`
const estado = () => E(`(()=>{const t=${herramienta};if(!t)return null;const [e,s,p]=t.points();return {entry:e.price,sl:s.price,tp:p.price,t0:Number(e.timestamp),t1:Number(s.timestamp)}})()`)
// la pantalla: x de un instante (indice logico de los datos de la serie, extrapolado tras la ultima vela) y y de un precio
const px = (t, p) => E(`(()=>{const cr=${CR};const r=cr.chart.chartElement().getBoundingClientRect();const ts=cr.chart.timeScale();const d=window.__algSuiteSeriesData;let i=d.findIndex(v=>v.time>=${t});if(i<0)i=d.length-1+(${t}-d[d.length-1].time)/(d[d.length-1].time-d[d.length-2].time);return {x:r.left+ts.logicalToCoordinate(i),y:r.top+cr.series.priceToCoordinate(${p})}})()`)
const precioEn = y => E(`(()=>{const cr=${CR};const r=cr.chart.chartElement().getBoundingClientRect();return Math.round(cr.series.coordinateToPrice(${y}-r.top)*1e5)/1e5})()`)
const textos = () => E(`(()=>{const t=${herramienta};t.updateAllViews();const v=t._paneViews[0];v._updateImpl(0,0);return {sl:v._slCanvas?._data?.text??null,rr:v._rrCanvas?._data?.text??null}})()`)
// el precio donde se suelta, con 3 px de margen (el raton va por pixeles: el plugin lee su propio evento)
const igual = (a, b) => Math.abs(a - b) <= TOL

for (const lado of ['largo', 'corto']) {
  console.log(`\n── ${lado}`)
  await E(`${CR}.plugin.removeAllLineTools()`)
  const d = await E(`(()=>{const d=window.__algSuiteSeriesData,n=window.__algSuiteRealDataLen;return {ta:d[n-11].time,tb:d[n-1].time+5*(d[n-1].time-d[n-2].time),p:d[n-1].close}})()`)
  // la herramienta de la barra (nace debajo de la pildora del replay: el clic va al boton por el DOM) y dos clics en el grafico
  await E(`[...document.querySelectorAll('button')].find(x=>x.title==='Long / Short').click()`)
  const a = await px(d.ta, d.p), c = await px(d.tb, d.p + (lado === 'largo' ? -0.0015 : 0.0015))
  await b.clic(a.x, a.y); await b.clic(c.x, c.y)
  await b.clic(150, 760)   // soltarlo: un clic en vacio (deselecciona)
  const e0 = await estado()
  control(`${lado}: dibujo creado (${e0 ? (e0.entry > e0.sl ? 'largo' : 'corto') : 'no'}) y soltado`, !!e0 && (lado === 'largo') === (e0.entry > e0.sl) && !(await E(`${herramienta}.isSelected()`)), JSON.stringify(e0))
  if (!e0) continue

  // 1) SL izquierdo
  // alejandolo de la entrada (sin cruzarla: cruzarla es el giro largo/corto del plugin, que no cambia)
  let s = await estado(), de = await px(s.t0, s.sl), a1 = { x: de.x + 30, y: de.y + (lado === 'largo' ? 30 : -30) }
  await b.arrastra(de, a1); let n = await estado(), esperado = await precioEn(a1.y)
  oraculo(`${lado}: el tirador IZQUIERDO del SL mueve solo el SL, en vertical`, igual(n.sl, esperado) && n.entry === s.entry && n.tp === s.tp && n.t0 === s.t0 && n.t1 === s.t1, JSON.stringify({ antes: s, despues: n, esperado }))

  // 2) TP izquierdo
  s = await estado(); de = await px(s.t0, s.tp); a1 = { x: de.x + 30, y: de.y + (lado === 'largo' ? -30 : 30) }
  await b.arrastra(de, a1); n = await estado(); esperado = await precioEn(a1.y)
  oraculo(`${lado}: el tirador IZQUIERDO del TP mueve solo el TP, en vertical`, igual(n.tp, esperado) && n.entry === s.entry && n.sl === s.sl && n.t0 === s.t0 && n.t1 === s.t1, JSON.stringify({ antes: s, despues: n, esperado }))

  // 3) entrada, circulo (derecha): solo ensancha por la derecha, aunque la mano suba
  s = await estado(); de = await px(s.t1, s.entry); a1 = { x: de.x + 60, y: de.y + (lado === 'largo' ? -12 : 12) }
  await b.arrastra(de, a1); n = await estado()
  oraculo(`${lado}: el CIRCULO (derecha) de la entrada solo ensancha por la derecha; el precio no se mueve aunque la mano si`, n.t1 > s.t1 && n.entry === s.entry && n.t0 === s.t0 && n.sl === s.sl && n.tp === s.tp, JSON.stringify({ antes: s, despues: n }))

  // 4) entrada, cuadrado (izquierda): precio y ancho a la vez, con la mano temblando y acabando mas abajo
  s = await estado(); de = await px(s.t0, s.entry); a1 = { x: de.x - 60, y: de.y + 25 }
  await b.arrastra(de, a1, { temblor: 15 }); n = await estado(); esperado = await precioEn(a1.y)
  oraculo(`${lado}: el CUADRADO (izquierda) de la entrada mueve el precio de entrada y ensancha por la izquierda`, igual(n.entry, esperado) && n.t0 < s.t0 && n.t1 === s.t1 && n.sl === s.sl && n.tp === s.tp, JSON.stringify({ antes: s, despues: n, esperado }))

  // 5) pips y RR recalculados con los precios de ahora (la formula del dibujo: vendor long-short, etiquetas de lienzo)
  const f = await estado(), tx = await textos()
  const pips = (Math.abs(f.entry - f.sl) * 10000).toFixed(1), rr = (Math.abs(f.entry - f.tp) / Math.abs(f.entry - f.sl)).toFixed(2)
  oraculo(`${lado}: los pips del SL y el RR del dibujo son los de sus precios nuevos`, String(tx.sl).startsWith(pips + ' pips') && tx.rr === 'RR ' + rr, JSON.stringify({ textos: tx, pips, rr }))
}
control('la pagina no ha pedido nada fuera de la maquina salvo la fuente de Google (bloqueada)', fuera.every(u => u.startsWith('https://fonts.googleapis.com/')), JSON.stringify(fuera))
control('sin errores en la consola de la pagina', b.errores.length === 0, JSON.stringify(b.errores.slice(0, 5)))
sale(rotos ? 2 : rojos ? 1 : 0)
