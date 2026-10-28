/**
 * DP05 · EL DIBUJO DE POSICION SE ARRASTRA CONTINUO AL CRUZAR LAS LINEAS DE UNA ORDEN (orden 1-153, fallo 04 de Ramon)
 * PESADA: Chrome y `next dev`. SIEMPRE con el turno:  revisiones-suite/con-turno node pruebas/navegador/dp05-arrastre-continuo-junto-a-ordenes.mjs
 * La pagina real (sesion-comun.mjs: Supabase y /api/* interceptados, nada sale de la maquina), M15, viernes 20:30 UTC. Una
 * BUY limit nacida de un dibujo de posicion (engranaje → Ejecutar → Colocar: sus lineas HTML de entrada, SL y TP) y otro
 * dibujo de posicion a la izquierda, por encima. Como en TradingView, el segundo dibujo se agarra por su linea de entrada
 * (entre los tiradores) y se arrastra hacia abajo, en pasos de 3 px, hasta pasar las tres lineas de la orden; tras CADA
 * paso se lee su entrada:
 *   1 · el dibujo sigue al puntero en todos los pasos (lo que baja el puntero, en precio, ±1 px): sin pasos quietos al
 *       cruzar una linea de la orden ni saltos al salir de ella
 *   2 · al soltar, el dibujo queda donde se solto (±1 px)
 * Y lo que esta bien no cambia (Ramon: las lineas de orden se siguen agarrando):
 *   3 · la linea del SL de la orden se arrastra desde su banda (lejos de los dibujos): el SL de la orden cambia
 * En 2835261 la banda HTML de 20 px de cada linea de orden (PositionOverlay) tapa el grafico: el plugin de dibujo no recibe
 * el mousemove mientras el puntero esta en ella. Contra 2835261 sale en ROJO, codigo 1.
 */
import { setTimeout as espera } from 'node:timers/promises'
import { montaPagina } from './sesion-comun.mjs'
let rojos = 0, verdes = 0, rotos = 0
const oraculo = (d, ok, extra = '') => { ok ? verdes++ : rojos++; console.log(`  ${ok ? '🟢 VERDE' : '🔴 ROJO '} [DP05] ${d}${extra ? '  · ' + extra : ''}`) }
const control = (d, ok, extra = '') => { if (!ok) rotos++; console.log(`  ${ok ? '✓' : '✗ CONTROL ROTO'} ${d}${extra ? '  · ' + extra : ''}`) }

const g = await montaPagina()
const { E, CR, b } = g
const sale = () => g.sale(rotos ? 2 : rojos ? 1 : 0, `${rojos} en rojo · ${verdes} en verde · ${rotos} controles rotos`)
control('pagina real montada con el grafico y el plugin de dibujo', await E(`!!${CR}?.plugin`))
if (rotos) sale()
const d = await g.datos()
control('el replay esta en M15', d.iv === 900, JSON.stringify(d))

// la orden: BUY limit 30 pips por debajo, desde su dibujo
const E1 = Number((d.close - 0.0030).toFixed(5))
await g.dibuja(await g.px(d.ultima - 8 * d.iv, E1), await g.px(d.ultima + 4 * d.iv, E1 - 0.0010), { suelta: false })
const r = await g.limitDesdeDibujo()
// las lineas HTML de la orden (PositionOverlay), con su y en la ventana (el centro de su banda de 20 px)
const ordenes = () => E(`(()=>[...document.querySelectorAll('div')].filter(d=>d.style.zIndex==='5'&&d.style.position==='absolute').flatMap(c=>[...c.children]).map(l=>{const r=l.getBoundingClientRect();return {y:r.top+r.height/2,txt:l.innerText.replace(/\\s+/g,' ').trim()}}).filter(l=>/^(B\\.LIM|S\\.LIM)\\b/.test(l.txt)||/^(SL|TP)\\b/.test(l.txt)))()`)
const lo = await ordenes()
control('BUY limit colocada desde el dibujo, con sus lineas de entrada, SL y TP', /Buy Limit/.test(r.colocar || '') && (await g.limites()) === 1 && lo.length >= 3, JSON.stringify({ r, lo }))

// el segundo dibujo, a la izquierda y por encima de toda la orden
const E2 = Number((E1 + 0.0025).toFixed(5))
await g.dibuja(await g.px(d.ultima - 40 * d.iv, E2), await g.px(d.ultima - 28 * d.iv, E2 - 0.0006))
const d2 = await g.dibujo()
control('segundo dibujo creado a la izquierda, por encima de la orden', !!d2 && Math.abs(d2.entry - E2) < 0.00005, JSON.stringify(d2))

// agarrar su linea de entrada entre los tiradores (no es un tirador: mueve el dibujo entero)
const de = await g.pxPunto((d2.t0 + d2.t1) / 2, d2.entry)
const hit = await E(`(()=>{const cr=${CR};const r=cr.chart.chartElement().getBoundingClientRect();const h=cr.plugin._interactionManager._hitTest({x:${de.x}-r.left,y:${de.y}-r.top});const e=document.elementFromPoint(${de.x},${de.y});return {hit:h?h.tool.toolType:null,punto:h?h.pointIndex:null,el:e?e.tagName:null}})()`)
control('el puntero, sobre la linea de entrada del dibujo (no un tirador) y sobre el lienzo', hit.hit === 'LongShortPosition' && hit.punto == null && hit.el === 'CANVAS', JSON.stringify(hit))
const yMax = Math.max(...lo.map(l => l.y)) + 25
const precioEn = y => E(`${CR}.series.coordinateToPrice(${y}-${CR}.chart.chartElement().getBoundingClientRect().top)`)
const p0 = await precioEn(de.y)
await b.cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: de.x, y: de.y, button: 'none', buttons: 0 }); await espera(40)
await b.cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: de.x, y: de.y, button: 'left', buttons: 1, clickCount: 1 }); await espera(40)
const pasos = [], PX = 3
for (let y = de.y + PX; y <= yMax; y += PX) {
  await b.cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: de.x, y, button: 'left', buttons: 1 }); await espera(25)
  const n = await g.dibujo(), py = await precioEn(y)
  const el = await E(`(()=>{const e=document.elementFromPoint(${de.x},${y});return e?(e.tagName+(e.style?.cursor?':'+e.style.cursor:'')):null})()`)
  pasos.push({ y: Math.round(y), mueve: n.entry - d2.entry, puntero: py - p0, tol: Math.abs(await precioEn(y + 1) - py), el })
}
await b.cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: de.x, y: pasos.at(-1).y, button: 'left', buttons: 0, clickCount: 1 }); await espera(300)
// los primeros 10 px no cuentan: el plugin de dibujo no empieza a arrastrar hasta pasar su DRAG_THRESHOLD (10 px, el mismo en
// f5b713b); lo que se mide es lo que pasa despues, al cruzar las lineas de la orden
const malos = pasos.filter(p => p.y - de.y > 10 && Math.abs((p.mueve - p.puntero) - (pasos.find(q => q.y - de.y > 10).mueve - pasos.find(q => q.y - de.y > 10).puntero)) > p.tol * 1.5)
const lineasY = lo.map(l => Math.round(l.y))
oraculo(`el dibujo sigue al puntero en los ${pasos.length} pasos de ${PX} px al cruzar las lineas de la orden (y ${JSON.stringify(lineasY)})`, pasos.length > 10 && malos.length === 0,
  `${malos.length} pasos fuera: ${JSON.stringify(malos.slice(0, 8).map(p => ({ y: p.y, mueve: +(p.mueve * 1e5).toFixed(1), puntero: +(p.puntero * 1e5).toFixed(1), el: p.el })))} (decimas de pip)`)
const fin = await g.dibujo(), pf = await precioEn(pasos.at(-1).y)
oraculo('al soltar, el dibujo queda donde se solto (±1 px, descontado el umbral de 10 px del plugin)', Math.abs((fin.entry - d2.entry) - (pf - p0) - (pasos.at(-1).mueve - pasos.at(-1).puntero)) <= pasos.at(-1).tol * 1.5, JSON.stringify({ entrada: fin.entry, esperado: +(d2.entry + pf - p0).toFixed(5) }))

// lo que esta bien: la linea del SL de la orden se agarra desde su banda, lejos de los dibujos
await b.clic(150, 760); await espera(200)
const sl = (await ordenes()).find(l => /^SL\b/.test(l.txt))
const orden0 = await E(`(()=>{const x=[...document.querySelectorAll('*')].filter(e=>/^SL\\b/.test(e.innerText?.trim()||''));return x.length})()`)
const ancho = await E(`(()=>{const r=${CR}.chart.chartElement().getBoundingClientRect();return {left:r.left,width:r.width}})()`)
const xBanda = ancho.left + ancho.width * 0.55
const enBanda = await E(`(()=>{const e=document.elementFromPoint(${xBanda},${sl.y});return !!e&&(e.style.cursor==='ns-resize'||e.parentElement?.style.cursor==='ns-resize')})()`)
control('el puntero sobre la banda del SL de la orden (lejos de los dibujos)', enBanda, JSON.stringify({ sl, xBanda, orden0 }))
await b.arrastra({ x: xBanda, y: sl.y }, { x: xBanda, y: sl.y + 18 }, { pasos: 8 }); await espera(300)
const sl2 = (await ordenes()).find(l => /^SL\b/.test(l.txt))
oraculo('la linea del SL de la orden se sigue arrastrando desde su banda (baja ~18 px)', !!sl2 && Math.abs(sl2.y - (sl.y + 18)) <= 3, JSON.stringify({ antes: sl.y, despues: sl2?.y }))

control('la pagina no ha pedido nada fuera de la maquina salvo la fuente de Google (bloqueada)', g.fuera.every(u => u.startsWith('https://fonts.googleapis.com/')), JSON.stringify(g.fuera))
control('sin errores en la consola de la pagina', b.errores.length === 0, JSON.stringify(b.errores.slice(0, 5)))
sale()
