/**
 * OD02 · BORRAR EL DIBUJO DE POSICION CANCELA SU ORDEN PENDIENTE; NO CIERRA SU POSICION (orden 1-136 del CTO; la queja de
 * Ramon: «eliminé el trade… solo se ha borrado el punto de entrada»). Y la etiqueta del SL con un solo signo.
 * PESADA: Chrome y `next dev`. SIEMPRE con el turno:  revisiones-suite/con-turno node pruebas/navegador/od02-borrar-dibujo-cancela-orden.mjs
 * La pagina real (Supabase y /api/candles interceptados, nada sale de la maquina; la bandera v1 apagada: el arnes no tiene
 * doble de /api/sim), M15, Go to → Londres. En LARGO y en CORTO, la limit creada como Ramon desde el dibujo de posicion
 * (engranaje → Ejecutar → Colocar):
 *   · PENDIENTE (lejos del precio): se selecciona el dibujo y se borra con la tecla Supr → la orden se cancela: ni entrada,
 *     ni SL, ni TP, ni etiquetas en el grafico (lineas HTML y price lines), el contador «N LIMIT» a 0, y 20 velas despues
 *     no se ha abierto nada
 *   · PENDIENTE: lo mismo borrando con la papelera de la pildora del dibujo («Borrar (Del)»)
 *   · LLENADA (vela a vela hasta que se llena): la etiqueta del SL de la posicion es «SL -$<cifra>» (un solo signo); se
 *     borra el dibujo con Supr → la posicion SIGUE (entrada, SL y TP), sin trade cerrado
 * Cada caso en una pagina nueva (Chrome nuevo, el mismo `next dev`).
 * Contra f5b713b sale en ROJO, codigo 1 (la orden sigue viva tras borrar el dibujo; «SL -$-…»).
 */
import { setTimeout as espera } from 'node:timers/promises'
import { montaPagina } from './sesion-comun.mjs'
let rojos = 0, verdes = 0, rotos = 0
const oraculo = (d, ok, extra = '') => { ok ? verdes++ : rojos++; console.log(`  ${ok ? '🟢 VERDE' : '🔴 ROJO '} [OD02] ${d}${extra ? '  · ' + extra : ''}`) }
const control = (d, ok, extra = '') => { if (!ok) rotos++; console.log(`  ${ok ? '✓' : '✗ CONTROL ROTO'} ${d}${extra ? '  · ' + extra : ''}`) }

// cada caso en una pagina nueva (Chrome nuevo, el mismo `next dev`): medido, tras el primer caso el dibujo siguiente ya no se
// dejaba seleccionar con el arnes; asi cada caso empieza como el primero. Go to → Londres en cada una
let g = null, E = null, CR = null, app = null
const fuera = [], errores = []
const recoge = () => { if (g) { fuera.push(...g.fuera); errores.push(...g.b.errores); g.cierraPagina() } }
const sale = () => { recoge(); console.log(`\n${rojos} en rojo · ${verdes} en verde · ${rotos} controles rotos`); app?.mata(); process.exit(rotos ? 2 : rojos ? 1 : 0) }
async function nueva() {
  recoge()
  g = await montaPagina({ app }); app = g.app; E = g.E; CR = g.CR
  const ok = await E(`!!${CR}?.plugin`)
  control('pagina real montada con el grafico y el plugin de dibujo', ok)
  if (!ok) sale()
  control('Go to → Londres', await g.goTo('Londres'))
  await E(`${CR}.chart.timeScale().scrollToRealTime()`); await espera(300)
}

const ordenes = async () => {
  const ls = (await g.lineas()).filter(l => /^(B\.LIM|S\.LIM)\b/.test(l.txt) || /^(SL|TP)$/.test(l.txt))
  const pl = await E(`Object.keys(${CR}.priceLines||{}).length`)
  return { ls, pl, lim: await g.limites() }
}
const sinOrden = n => n.ls.length === 0 && n.pl === 0 && n.lim === 0
const nDibujos = () => E(`[...${CR}.plugin._interactionManager._tools.values()].filter(x=>x.toolType==='LongShortPosition').length`)
// seleccionar el dibujo de posicion como la mano: el puntero encima y un clic en un borde vertical de su caja
// (medido: el interior de la caja no es del dibujo, y la entrada, el SL y el TP los tapan las lineas de la orden); con un
// clic sin pausa previa el grafico no lo cuenta como clic. La pildora sale con el engranaje
const engranaje = () => E(`!![...document.querySelectorAll('button')].find(b=>b.title==='Configurar posición')`)
let diag = null
const selecciona = async () => {
  const d = await g.dibujo(); if (!d) return false
  diag = []
  // los bordes izquierdo y derecho, a media altura de la parte del TP y de la del SL: el primero que es del dibujo y no lo
  // tapa nada de la pagina (el lienzo del grafico es lo de encima)
  for (const [t, pr] of [[d.t0, (d.entry + d.tp) / 2], [d.t1, (d.entry + d.tp) / 2], [d.t0, (d.entry + d.sl) / 2], [d.t1, (d.entry + d.sl) / 2]]) {
    const p = await g.pxPunto(t, pr)
    const v = await E(`(()=>{const cr=${CR};const r=cr.chart.chartElement().getBoundingClientRect();const h=cr.plugin._interactionManager._hitTest({x:${p.x}-r.left,y:${p.y}-r.top});const e=document.elementFromPoint(${p.x},${p.y});return {x:${Math.round(p.x)},y:${Math.round(p.y)},hit:h?h.tool.toolType:null,el:e?e.tagName:null}})()`)
    diag.push(v)
    if (v.hit !== 'LongShortPosition' || v.el !== 'CANVAS') continue
    await g.b.cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y, button: 'none', buttons: 0 }); await espera(300)
    await g.b.cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', buttons: 1, clickCount: 1 }); await espera(80)
    await g.b.cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', buttons: 0, clickCount: 1 }); await espera(600)
    if (await engranaje()) return true
  }
  return false
}
const supr = async () => {
  for (const type of ['keyDown', 'keyUp']) await g.b.cdp('Input.dispatchKeyEvent', { type, key: 'Delete', code: 'Delete', windowsVirtualKeyCode: 46, nativeVirtualKeyCode: 46 })
  await espera(600)
}
const limitDesdeDibujo = async (ent, sg, sl = 0.0010) => {
  const d = await g.datos()
  await g.dibuja(await g.px(d.ultima - 8 * d.iv, ent), await g.px(d.ultima + 4 * d.iv, ent - sg * sl), { suelta: false })
  return g.limitDesdeDibujo()
}

for (const lado of ['largo', 'corto']) {
  const sg = lado === 'largo' ? 1 : -1, L = lado === 'largo' ? 'BUY' : 'SELL'
  console.log(`\n── ${lado}`)
  for (const como of ['Supr', 'papelera']) {
    await nueva()
    const d = await g.datos()
    const r = await limitDesdeDibujo(d.close - sg * 0.0040, sg)
    control(`${lado}, ${como}: limit pendiente colocada desde el dibujo`, /Colocar (Buy|Sell) Limit/.test(r.colocar || '') && (await g.limites()) === 1, JSON.stringify(r))
    control(`${lado}, ${como}: el dibujo seleccionado (pildora con el engranaje)`, await selecciona(), JSON.stringify(diag))
    if (como === 'Supr') await supr(); else { await g.boton('Borrar (Del)'); await espera(600) }
    control(`${lado}, ${como}: el dibujo se ha borrado`, (await nDibujos()) === 0)
    let n = await ordenes()
    oraculo(`${lado}, pendiente, borrar el dibujo (${como}): la orden se cancela (ni entrada, ni SL, ni TP, ni etiquetas, ni «LIMIT»)`, sinOrden(n), JSON.stringify(n))
    // 20 velas con «Avanzar vela» (sin el Play, que alterna con su mismo boton)
    for (let i = 0; i < 20; i++) { await g.boton('Avanzar vela'); await espera(120) }
    await espera(400)
    const pos = (await g.lineas()).filter(l => new RegExp('^' + L + ' ').test(l.txt))
    oraculo(`${lado}, pendiente, borrar el dibujo (${como}): 20 velas despues no se abre nada (no quedo ninguna orden viva)`, pos.length === 0 && sinOrden(await ordenes()), JSON.stringify(pos))
  }
  // llenada
  await nueva()
  const d = await g.datos()
  // la entrada 10 pips del lado que se llena ya (el dibujo cae a unos pips de donde se apunta) y el SL a 30: se llena en la
  // primera vela sin tocar su SL
  const rl = await limitDesdeDibujo(d.close + sg * 0.0010, sg, 0.0030)
  // vela a vela («Avanzar vela») hasta que se llena: con el Play, la posicion podia cerrarse antes de la pausa
  let llena = false
  const antes = { lim: await g.limites(), ls: await g.lineas(), dib: await g.dibujo(), close: d.close }
  for (let i = 0; i < 40 && !llena; i++) { await g.boton('Avanzar vela'); await espera(200); llena = (await g.lineas()).some(l => new RegExp('^' + L + ' ').test(l.txt)) }
  control(`${lado}, llenada: vela a vela hasta que se llena`, llena, JSON.stringify({ rl, antes, ls: await g.lineas(), trades: g.doble.tablas.sim_trades.map(t => [t.side, t.entry_price, t.exit_price, t.pnl]) }))
  const ls = await g.lineas(), sl = ls.find(l => /^SL\b/.test(l.txt))
  oraculo(`${lado}, llenada: la etiqueta del SL de la posicion lleva un solo signo («SL -$<cifra>»)`, !!sl && /^SL -\$\d+\.\d\d\b/.test(sl.txt) && !/-\$-/.test(sl.txt), JSON.stringify(sl))
  const trades0 = g.doble.tablas.sim_trades.length
  control(`${lado}, llenada: el dibujo seleccionado`, await selecciona(), JSON.stringify(diag))
  await supr()
  control(`${lado}, llenada: el dibujo se ha borrado`, (await nDibujos()) === 0)
  const ls2 = await g.lineas()
  oraculo(`${lado}, llenada: borrar el dibujo NO cierra la posicion (siguen su entrada, su SL y su TP)`, ls2.some(l => l.txt.startsWith(L + ' ')) && ls2.some(l => /^SL /.test(l.txt)) && ls2.some(l => /^TP /.test(l.txt)) && g.doble.tablas.sim_trades.length === trades0, JSON.stringify(ls2))
}
recoge(); g = null
control('las paginas no han pedido nada fuera de la maquina salvo la fuente de Google (bloqueada)', fuera.every(u => u.startsWith('https://fonts.googleapis.com/')), JSON.stringify(fuera))
control('sin errores en la consola de las paginas', errores.length === 0, JSON.stringify(errores.slice(0, 5)))
sale()
