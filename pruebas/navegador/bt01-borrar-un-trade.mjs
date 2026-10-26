/**
 * BT01 · BORRAR UN TRADE (regresion de uso normal; orden 1-130 del CTO)
 * PESADA: Chrome y `next dev`. SIEMPRE con el turno:  revisiones-suite/con-turno node pruebas/navegador/bt01-borrar-un-trade.mjs
 * La pagina real (Supabase y /api/candles interceptados, nada sale de la maquina), dos semanas de velas, M15. Tras un Go to
 * a Londres (lunes), en LARGO y en CORTO:
 *   · a mercado (Buy/Sell de la barra → Ejecutar), y se borra con la ✕ de su linea de entrada → «Cerrar posición»
 *   · limit LLENADA, creada como Ramon desde el dibujo de posicion (engranaje → Ejecutar → Colocar), Play hasta que se
 *     llena y pausa; se borra igual
 *   · limit PENDIENTE (lejos del precio), y se borra con la ✕ de su linea
 * Tras cada borrado: ni entrada ni SL ni TP ni etiquetas en el grafico (lineas HTML y price lines del grafico), el
 * contador «N LIMIT» a 0 y ninguna orden viva que pueda llenarse despues (Play otra vez y nada aparece).
 * Y la navegacion: salir al panel con router.push con el replay en marcha, dos veces, sin «Object is disposed».
 * Lo que da ROJO en f5b713b es la navegacion («Object is disposed»); el borrado de posiciones y ordenes sale verde
 * tambien alli (medido: la limit llenada sale de la lista de ordenes y su posicion se borra entera).
 */
import { setTimeout as espera } from 'node:timers/promises'
import { montaPagina } from './sesion-comun.mjs'
let rojos = 0, verdes = 0, rotos = 0
const oraculo = (d, ok, extra = '') => { ok ? verdes++ : rojos++; console.log(`  ${ok ? '🟢 VERDE' : '🔴 ROJO '} [BT01] ${d}${extra ? '  · ' + extra : ''}`) }
const control = (d, ok, extra = '') => { if (!ok) rotos++; console.log(`  ${ok ? '✓' : '✗ CONTROL ROTO'} ${d}${extra ? '  · ' + extra : ''}`) }

const g = await montaPagina()
const { E, CR } = g
const sale = () => g.sale(rotos ? 2 : rojos ? 1 : 0, `${rojos} en rojo · ${verdes} en verde · ${rotos} controles rotos`)
control('pagina real montada con el grafico y el plugin de dibujo', await E(`!!${CR}?.plugin`))
if (rotos) sale()
control('Go to → Londres', await g.goTo('Londres'))
await E(`${CR}.chart.timeScale().scrollToRealTime()`); await espera(300)

const nada = async () => {
  const ls = (await g.lineas()).filter(l => /^(BUY|SELL|B\.LIM|S\.LIM|SL|TP)\b/.test(l.txt))
  const pl = await E(`Object.keys(${CR}.priceLines||{}).length`)
  return { ls, pl, lim: await g.limites() }
}
const vacio = n => n.ls.length === 0 && n.pl === 0 && n.lim === 0
const borraPosicion = async lado => {
  const ok = await E(`(()=>{const c=[...document.querySelectorAll('div')].filter(d=>d.style.zIndex==='5'&&d.style.position==='absolute').flatMap(c=>[...c.children]).find(l=>/^${lado} /.test(l.innerText.trim()));if(!c)return false;[...c.querySelectorAll('button')].at(-1).click();return true})()`)
  await espera(400); const c = await g.boton('Cerrar posición'); await espera(1500); return ok && c
}

for (const lado of ['largo', 'corto']) {
  const L = lado === 'largo' ? 'BUY' : 'SELL'
  console.log(`\n── ${lado}`)
  // a mercado
  await g.boton(lado === 'largo' ? '▲ Buy' : '▼ Sell'); await espera(400)
  await E(`(()=>{const x=[...document.querySelectorAll('button')].find(b=>/Ejecutar (Buy|Sell)/.test(b.innerText));x&&x.click()})()`); await espera(600)
  let ls = await g.lineas()
  control(`${lado}: a mercado abierta (entrada, SL y TP en el grafico)`, ls.some(l => l.txt.startsWith(L + ' ')) && ls.some(l => /^SL /.test(l.txt)) && ls.some(l => /^TP /.test(l.txt)), JSON.stringify(ls))
  control(`${lado}: borrada con su ✕`, await borraPosicion(L))
  let n = await nada()
  oraculo(`${lado}, a mercado: borrar el trade quita entrada, SL, TP y etiquetas, y no queda orden`, vacio(n), JSON.stringify(n))

  // limit llenada, desde el dibujo
  let d = await g.datos()
  const s = lado === 'largo' ? 1 : -1, ent = d.close + s * 0.0001
  await g.dibuja(await g.px(d.ultima - 8 * d.iv, ent), await g.px(d.ultima + 4 * d.iv, ent - s * 0.0010), { suelta: false })
  const r = await g.limitDesdeDibujo()
  ls = await g.lineas()
  control(`${lado}: limit colocada desde el dibujo`, /Colocar (Buy|Sell) Limit/.test(r.colocar || '') && (await g.limites()) === 1, JSON.stringify({ r, ls }))
  control(`${lado}: Play hasta que se llena, y pausa`, await g.playHasta(new RegExp('^' + L + ' ')))
  n = await nada()
  oraculo(`${lado}, limit llenada: la orden sale de la lista (sin S.LIM/B.LIM ni contador)`, n.lim === 0 && !n.ls.some(l => /LIM/.test(l.txt)), JSON.stringify(n))
  control(`${lado}: la posicion de la limit, borrada con su ✕`, await borraPosicion(L))
  n = await nada()
  oraculo(`${lado}, limit llenada: borrar el trade quita entrada, SL, TP y etiquetas`, vacio(n), JSON.stringify(n))
  await g.play(); await espera(1500); await g.play(); await espera(400)
  n = await nada()
  oraculo(`${lado}, limit llenada: tras otro Play no se abre nada (no quedo ninguna orden viva)`, vacio(n), JSON.stringify(n))
  await E(`${CR}.plugin.removeAllLineTools()`)

  // limit pendiente (lejos) y cancelada con su ✕
  d = await g.datos()
  const lejos = d.close - s * 0.0040
  await g.dibuja(await g.px(d.ultima - 8 * d.iv, lejos), await g.px(d.ultima + 4 * d.iv, lejos - s * 0.0010), { suelta: false })
  await g.limitDesdeDibujo()
  control(`${lado}: limit pendiente colocada`, (await g.limites()) === 1)
  await E(`(()=>{const c=[...document.querySelectorAll('div')].filter(d=>d.style.zIndex==='5'&&d.style.position==='absolute').flatMap(c=>[...c.children]).find(l=>/^(B|S)\\.LIM /.test(l.innerText.trim()));[...c.querySelectorAll('button')].at(-1).click()})()`); await espera(500)
  n = await nada()
  oraculo(`${lado}, pendiente: borrarla quita entrada, SL, TP y etiquetas y no queda orden`, vacio(n), JSON.stringify(n))
  await E(`${CR}.plugin.removeAllLineTools()`)
}

// salir al panel con el replay en marcha (router.push), dos veces
console.log('\n── navegacion')
g.b.errores.length = 0
for (let i = 0; i < 2; i++) {
  await g.play(); await espera(600)
  await E(`window.next.router.push('/dashboard')`); await espera(3000)
  await E(`window.next.router.push('/session/5e5e5e5e-0000-4000-8000-000000000001')`)
  for (let t = 0; t < 120 && !(await E(`!!window.__chartMap?.current?.['EUR/USD']?.plugin`).catch(() => false)); t++) await espera(250)
}
const disp = g.b.errores.filter(e => /Object is disposed/.test(e))
oraculo('salir al panel (router.push) con el replay en marcha no deja «Object is disposed»', disp.length === 0, JSON.stringify({ n: disp.length, primero: (disp[0] || '').slice(0, 300) }))
control('la pagina no ha pedido nada fuera de la maquina salvo la fuente de Google (bloqueada)', g.fuera.every(u => u.startsWith('https://fonts.googleapis.com/')), JSON.stringify(g.fuera))
control('ningun otro error en la consola de la pagina', g.b.errores.filter(e => !/Object is disposed/.test(e)).length === 0, JSON.stringify(g.b.errores.filter(e => !/Object is disposed/.test(e)).slice(0, 3)))
sale()
