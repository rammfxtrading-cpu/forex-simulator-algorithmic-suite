/**
 * DP04 · EL SL DEL DIBUJO DE POSICION SE ESTIRA AUNQUE LA ORDEN CREADA DESDE EL TENGA SU LINEA EN EL MISMO PRECIO
 * (orden 1-131 del CTO). PESADA: Chrome y `next dev`. SIEMPRE con el turno:
 *   revisiones-suite/con-turno node pruebas/navegador/dp04-sl-del-dibujo-con-orden.mjs
 * Las condiciones de Ramon: M15, Go to → Londres, el dibujo de posicion y la limit creada DESDE el (engranaje → Ejecutar →
 * Colocar), con sus lineas HTML (PositionOverlay) en los MISMOS precios que el dibujo. Se arrastra el tirador del SL del
 * dibujo (el que pinta su version: el izquierdo con la 1-110, el derecho sin ella) 30 px en vertical, con el raton de
 * verdad (CDP), en largo y en corto:
 *   · con la limit PENDIENTE
 *   · con la limit LLENADA (Play y pausa): la linea del SL de la posicion encima
 * Se mueve el SL del DIBUJO; la orden (o la posicion) no cambia. En f5b713b la banda de 20 px de la linea de la orden se
 * quedaba el clic: se arrastraba la orden y el dibujo no se movia. Contra f5b713b sale en ROJO, codigo 1.
 */
import { setTimeout as espera } from 'node:timers/promises'
import { montaPagina } from './sesion-comun.mjs'
let rojos = 0, verdes = 0, rotos = 0
const oraculo = (d, ok, extra = '') => { ok ? verdes++ : rojos++; console.log(`  ${ok ? '🟢 VERDE' : '🔴 ROJO '} [DP04] ${d}${extra ? '  · ' + extra : ''}`) }
const control = (d, ok, extra = '') => { if (!ok) rotos++; console.log(`  ${ok ? '✓' : '✗ CONTROL ROTO'} ${d}${extra ? '  · ' + extra : ''}`) }

const g = await montaPagina()
const { E, CR } = g
const sale = () => g.sale(rotos ? 2 : rojos ? 1 : 0, `${rojos} en rojo · ${verdes} en verde · ${rotos} controles rotos`)
control('pagina real montada con el grafico y el plugin de dibujo', await E(`!!${CR}?.plugin`))
if (rotos) sale()
control('Go to → Londres', await g.goTo('Londres'))
await E(`${CR}.chart.timeScale().scrollToRealTime()`); await espera(300)
const TOL = Math.abs((await E(`${CR}.series.coordinateToPrice(300)`)) - (await E(`${CR}.series.coordinateToPrice(303)`)))
const precioEn = y => E(`(()=>{const cr=${CR};const r=cr.chart.chartElement().getBoundingClientRect();return Math.round(cr.series.coordinateToPrice(${y}-r.top)*1e5)/1e5})()`)
const lineaSL = async () => (await g.lineas()).find(l => /^SL\b/.test(l.txt))

const estira = async (lado, caso) => {
  const s = await g.dibujo()
  const izq = s.cls === 'PosicionTradingView'
  const de = await g.pxPunto(izq ? s.t0 : s.t1, s.sl)
  const antes = await lineaSL()
  const r = await E(`${CR}.chart.chartElement().getBoundingClientRect().top`)
  control(`${lado}, ${caso}: la linea SL de la ${caso === 'pendiente' ? 'orden' : 'posicion'} esta sobre el tirador del SL del dibujo`, !!antes && Math.abs(r + antes.y - de.y) <= 3, JSON.stringify({ linea: antes, tirador: de }))
  const a = { x: de.x, y: de.y + (lado === 'largo' ? 30 : -30) }
  await g.b.cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: de.x, y: de.y, button: 'none', buttons: 0 }); await espera(60)
  const bajo = await E(`(()=>{const e=document.elementFromPoint(${de.x},${de.y});const im=${CR}.plugin._interactionManager;const r=${CR}.chart.chartElement().getBoundingClientRect();const h=im._hitTest({x:${de.x}-r.left,y:${de.y}-r.top});return {el:e.tagName+'|'+(e.innerText||'').slice(0,12)+'|pe='+getComputedStyle(e).pointerEvents,hit:h?{i:h.pointIndex,sel:h.tool.isSelected()}:null,drag:!!im._draggedTool,edit:im._isEditing}})()`)
  control(`${lado}, ${caso}: ningun boton de la pagina tapa el tirador (lo de debajo es el grafico o la linea)`, !/^BUTTON/.test(bajo.el), JSON.stringify(bajo))
  await g.b.arrastra(de, a)
  const n = await g.dibujo(), esperado = await precioEn(a.y), despues = await lineaSL()
  oraculo(`${lado}, ${caso}: el tirador del SL estira el SL del DIBUJO (recto, en vertical)`, Math.abs(n.sl - esperado) <= TOL && n.entry === s.entry && n.t0 === s.t0 && n.t1 === s.t1, JSON.stringify({ antes: s, despues: n, esperado }))
  oraculo(`${lado}, ${caso}: la ${caso === 'pendiente' ? 'orden' : 'posicion'} no se mueve`, despues && Math.abs(despues.y - antes.y) <= 1, JSON.stringify({ antes, despues }))
}

for (const lado of ['largo', 'corto']) {
  console.log(`\n── ${lado}`)
  const sg = lado === 'largo' ? 1 : -1
  // pendiente: lejos del precio
  let d = await g.datos(), ent = d.close - sg * 0.0012
  await g.dibuja(await g.px(d.ultima - 8 * d.iv, ent), await g.px(d.ultima + 4 * d.iv, ent - sg * 0.0010), { suelta: false })
  let r = await g.limitDesdeDibujo()
  { const nl = await g.limites(), ls = await g.lineas(); control(`${lado}: limit pendiente colocada desde el dibujo`, nl === 1, JSON.stringify({ r, nl, ls, aviso: await E(`document.body.innerText.match(/.{0,60}(pausa|LIMIT).{0,30}/g)`) })) }
  await estira(lado, 'pendiente')
  await E(`(()=>{const c=[...document.querySelectorAll('div')].filter(d=>d.style.zIndex==='5'&&d.style.position==='absolute').flatMap(c=>[...c.children]).find(l=>/^(B|S)\\.LIM /.test(l.innerText.trim()));c&&[...c.querySelectorAll('button')].at(-1).click()})()`); await espera(400)
  await E(`${CR}.plugin.removeAllLineTools()`)
  // llenada: pegada al precio, Play y pausa
  d = await g.datos(); ent = d.close + sg * 0.0001
  await g.dibuja(await g.px(d.ultima - 8 * d.iv, ent), await g.px(d.ultima + 4 * d.iv, ent - sg * 0.0010), { suelta: false })
  r = await g.limitDesdeDibujo()
  control(`${lado}: limit colocada y llenada (Play y pausa)`, (await g.playHasta(lado === 'largo' ? /^BUY / : /^SELL /)), JSON.stringify(r))
  await estira(lado, 'llenada')
  await E(`(()=>{const c=[...document.querySelectorAll('div')].filter(d=>d.style.zIndex==='5'&&d.style.position==='absolute').flatMap(c=>[...c.children]).find(l=>/^(BUY|SELL) /.test(l.innerText.trim()));c&&[...c.querySelectorAll('button')].at(-1).click()})()`); await espera(400)
  await g.boton('Cerrar posición'); await espera(1500)
  await E(`${CR}.plugin.removeAllLineTools()`)
}
control('la pagina no ha pedido nada fuera de la maquina salvo la fuente de Google (bloqueada)', g.fuera.every(u => u.startsWith('https://fonts.googleapis.com/')), JSON.stringify(g.fuera))
control('sin errores en la consola de la pagina', g.b.errores.length === 0, JSON.stringify(g.b.errores.slice(0, 5)))
sale()
