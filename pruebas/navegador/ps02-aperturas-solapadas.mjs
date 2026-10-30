/**
 * PS02 · PSIMM1-02 EN LA PAGINA REAL: DOS LIMIT DE DOS DIBUJOS, SOLAPADAS; BORRAR EL SEGUNDO DIBUJO CANCELA SU ORDEN (orden
 * 1-175 del CTO; Astra no pudo ver la parte visual). La prueba de nodo es pruebas/aceptacion/v1c12-aperturas-solapadas.mjs.
 * PESADA: Chrome, `next dev` y PostgreSQL. SIEMPRE con el turno:
 *   revisiones-suite/con-turno node pruebas/navegador/ps02-aperturas-solapadas.mjs
 * La pagina real con la bandera v1 ENCENDIDA y /api/sim/* en lib/servidor REAL + PostgreSQL desechable (motor-v1-real.mjs),
 * practica v1 EUR/USD M15 con el cursor el 3-mar-2026 10:00 UTC. Con clics de verdad, como Ramon (od02): dibujo de posicion
 * CORTO (el precio viene de caer: arriba hay sitio en la grafica) → engranaje → Ejecutar → Colocar Sell Limit.
 *   1 · la limit del dibujo D1 (40 pips por encima) con su abrir RETENIDO en el transporte; sin esperarla, la del dibujo D2
 *       (70 pips por encima); se suelta. ORACULO: el servidor tiene las dos pendientes y la pagina enseña dos S.LIM
 *   2 · se selecciona el dibujo D2 y se borra con Supr. ORACULOS: sale UN cancelar, con el id de la pendiente de D2; en el
 *       servidor queda solo la de D1 (la de mas abajo); en la pagina, una S.LIM
 *   3 · se borra tambien D1: ninguna orden viva en el servidor ni en la pagina
 *   (4 y 5, cada uno en una pagina nueva sobre la misma sesion del servidor: como od02, tras el primer caso el dibujo
 *   siguiente ya no se deja seleccionar con el arnes; el escritor de la pagina cerrada caduca antes)
 *   4 · R2-6 (orden 1-176): la limit de D3 llega al servidor pero a la pagina le llega un 500 (incierta: no se pinta); se
 *       borra D3; «Avanzar vela» resuelve la cola (el servidor la confirma) y se cancela sola: ninguna viva
 *   5 · R2-6: la limit de D4 confirmada; se borra D4 y los dos primeros cancelar dan 409: se reintenta solo hasta cancelarla
 * Capturas: CAPTURAS (por defecto .pruebas/) ps02-1-dos-limit.png, ps02-2-borrado-D2.png, ps02-3-borrado-D1.png,
 * ps02-4-incierta-borrada.png, ps02-5-cancelar-reintentado.png.
 * Codigo 0 verde, 1 rojo, 2 control roto.
 */
import fs from 'node:fs'
import path from 'node:path'
import { setTimeout as espera } from 'node:timers/promises'
import { montaPagina } from './sesion-comun.mjs'
import { arrancaNext } from './app.mjs'
import { REPO } from './cdp.mjs'
import { motorV1Real, sesionDelDoble } from './motor-v1-real.mjs'

let rojos = 0, verdes = 0, rotos = 0
const oraculo = (d, ok, extra = '') => { ok ? verdes++ : rojos++; console.log(`  ${ok ? '🟢 VERDE' : '🔴 ROJO '} [PS02] ${d}${extra ? '  · ' + extra : ''}`) }
const control = (d, ok, extra = '') => { if (!ok) rotos++; console.log(`  ${ok ? '✓' : '✗ CONTROL ROTO'} ${d}${extra ? '  · ' + extra : ''}`) }
const CAPTURAS = process.env.CAPTURAS || path.join(REPO, '.pruebas')
fs.mkdirSync(CAPTURAS, { recursive: true })
const HASTA = Date.parse('2026-03-03T10:00:00Z') / 1000

const m = await motorV1Real()
let app = null, g = null
const sale = () => {
  console.log(`\n${rojos} en rojo · ${verdes} en verde · ${rotos} controles rotos`)
  try { g?.cierraPagina() } catch {}
  app?.mata(); m.cierra(); process.exit(rotos ? 2 : rojos ? 1 : 0)
}
try {
  const f0 = await m.prepara({ hasta: HASTA })
  control('la practica v1 creada en el servidor real con el cursor el 3-mar 10:00 UTC', f0?.estado?.reloj?.cursor === HASTA)
  app = await arrancaNext({ env: { NEXT_PUBLIC_SIM_V1_PANTALLA: 'encendido' } })
  g = await montaPagina({ app, sesion: sesionDelDoble(f0), api: m.api })
  await espera(4000)
  const E = x => g.E(x), CR = g.CR
  const errores = [], fuera = []
  const nuevaPagina = async () => {
    errores.push(...g.b.errores); fuera.push(...g.fuera); g.cierraPagina()
    await m.caducaEscritor()
    g = await montaPagina({ app, sesion: sesionDelDoble(await m.fila()), api: m.api })
    await espera(4000)
    control('pagina nueva montada (modo v1, el escritor tomado)', await E(`!!${CR}?.plugin`) && m.llamadas.filter(l => l.ruta === '/api/sim/tomar').at(-1)?.http === 200)
    await E(`${CR}.chart.timeScale().scrollToRealTime()`); await espera(300)
  }
  const captura = async nombre => { const r = await g.b.cdp('Page.captureScreenshot', { format: 'png' }); const f = path.join(CAPTURAS, nombre); fs.writeFileSync(f, Buffer.from(r.result.data, 'base64')); console.log(`    captura: ${f}`) }
  // lo de od02: las ordenes pintadas (lineas HTML B.LIM/S.LIM), los dibujos de posicion, seleccionar el ultimo y Supr
  const blim = async () => (await g.lineas()).filter(l => /^(B\.LIM|S\.LIM)\b/.test(l.txt))
  const nDibujos = () => E(`[...${CR}.plugin._interactionManager._tools.values()].filter(x=>x.toolType==='LongShortPosition').length`)
  const engranaje = () => E(`!![...document.querySelectorAll('button')].find(b=>b.title==='Configurar posición')`)
  let diag = null
  const selecciona = async () => {
    const d = await g.dibujo(); if (!d) return false
    diag = []
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
  const supr = async () => { for (const type of ['keyDown', 'keyUp']) await g.b.cdp('Input.dispatchKeyEvent', { type, key: 'Delete', code: 'Delete', windowsVirtualKeyCode: 46, nativeVirtualKeyCode: 46 }); await espera(600) }
  const limitDesdeDibujo = async (ent, sl = 0.0010) => {
    const d = await g.datos()
    // corto: el segundo punto (el SL) por encima de la entrada
    await g.dibuja(await g.px(d.ultima - 8 * d.iv, ent), await g.px(d.ultima + 4 * d.iv, ent + sl), { suelta: false })
    return g.limitDesdeDibujo()
  }
  const ordenesSrv = async () => (await m.fila()).estado.ordenes.map(o => ({ id: o.id, precio: Number(o.precio?.$b ?? o.precio) }))

  control('la pagina real montada con el grafico y el plugin de dibujo', await E(`!!${CR}?.plugin`))
  control('modo v1: tomo el escritor y leyo el estado del servidor real', m.llamadas.some(l => l.ruta === '/api/sim/tomar' && l.http === 200) && m.llamadas.some(l => l.ruta === '/api/sim/estado' && l.http === 200))
  await E(`${CR}.chart.timeScale().scrollToRealTime()`); await espera(300)
  const d = await g.datos()

  // 1 · dos limit solapadas
  m.trampas.retenerAbrir = true
  const r1 = await limitDesdeDibujo(d.close + 0.0040)
  await espera(300)
  control('1 · la limit de D1 colocada y su abrir RETENIDO en el transporte', /Colocar Sell Limit/.test(r1.colocar || '') && m.retenidas.length === 1, JSON.stringify({ r1, retenidas: m.retenidas.length }))
  const r2 = await limitDesdeDibujo(d.close + 0.0070)
  await espera(300)
  control('1 · la limit de D2 colocada sin esperar la de D1 (dos dibujos de posicion)', /Colocar Sell Limit/.test(r2.colocar || '') && (await nDibujos()) === 2, JSON.stringify({ r2, dibujos: await nDibujos() }))
  m.suelta()
  await espera(2500)
  const srv1 = await ordenesSrv(), p1 = await blim()
  oraculo('1 · el servidor tiene las dos pendientes y la pagina enseña dos S.LIM', srv1.length === 2 && p1.length === 2, JSON.stringify({ srv1, p1 }))
  await captura('ps02-1-dos-limit.png')
  // la de D2 es la de mas arriba (70 pips por encima)
  const deD2 = [...srv1].sort((a, b) => b.precio - a.precio)[0], deD1 = [...srv1].sort((a, b) => a.precio - b.precio)[0]

  // 2 · borrar D2
  const n0 = m.llamadas.length
  control('2 · el dibujo D2 seleccionado (pildora con el engranaje)', await selecciona(), JSON.stringify(diag))
  await supr()
  control('2 · el dibujo D2 se ha borrado (queda uno)', (await nDibujos()) === 1)
  await espera(2000)
  const cancelar = m.llamadas.slice(n0).filter(l => l.tipo === 'cancelar')
  const srv2 = await ordenesSrv(), p2 = await blim()
  oraculo('2 · borrar D2 manda UN cancelar con el id de la pendiente de D2 (confirmado)', cancelar.length === 1 && cancelar[0].id === deD2?.id && cancelar[0].http === 200, JSON.stringify({ cancelar, deD2 }))
  oraculo('2 · en el servidor queda solo la pendiente de D1 (la de abajo) y la pagina enseña una S.LIM', srv2.length === 1 && srv2[0].id === deD1?.id && p2.length === 1, JSON.stringify({ srv2, p2 }))
  await captura('ps02-2-borrado-D2.png')

  // 3 · borrar D1
  control('3 · el dibujo D1 seleccionado', await selecciona(), JSON.stringify(diag))
  await supr(); await espera(2000)
  const srv3 = await ordenesSrv(), p3 = await blim()
  oraculo('3 · borrado tambien D1: ninguna orden viva en el servidor ni en la pagina', srv3.length === 0 && p3.length === 0 && (await nDibujos()) === 0, JSON.stringify({ srv3, p3 }))
  await captura('ps02-3-borrado-D1.png')

  // 4 · R2-6: apertura incierta y su dibujo borrado
  await nuevaPagina()
  m.trampas.pierdeAbrir = true
  const r4 = await limitDesdeDibujo(d.close + 0.0040)
  await espera(1500)
  const srv4a = await ordenesSrv()
  control('4 · la limit de D3 llego al servidor (1 pendiente) y a la pagina le llego un 500: no la pinta', /Colocar Sell Limit/.test(r4.colocar || '') && srv4a.length === 1 && (await blim()).length === 0 && m.llamadas.some(l => l.tipo === 'abrir' && l.http === 500 && l.real === 200), JSON.stringify({ r4, srv4a, blim: await blim() }))
  control('4 · el dibujo D3 seleccionado', await selecciona(), JSON.stringify(diag))
  await supr()
  control('4 · el dibujo D3 se ha borrado', (await nDibujos()) === 0)
  const n4 = m.llamadas.length
  control('4 · «Avanzar vela» (resuelve la cola)', await g.boton('Avanzar vela'))
  await espera(3000)
  const srv4 = await ordenesSrv(), p4 = await blim()
  oraculo('4 · confirmada en el servidor al resolver la cola, la pendiente del dibujo borrado se cancela sola: ninguna viva (servidor y pagina)', srv4.length === 0 && p4.length === 0 && m.llamadas.slice(n4).some(l => l.tipo === 'cancelar' && l.http === 200), JSON.stringify({ srv4, p4, llamadas: m.llamadas.slice(n4).map(l => [l.ruta.slice(9), l.tipo, l.id, l.http]) }))
  await captura('ps02-4-incierta-borrada.png')

  // 5 · R2-6: el cancelar falla y se reintenta
  await nuevaPagina()
  // otro precio que el de D3 (en un arbol con el hueco, su pendiente sigue viva ahi y su linea taparia el dibujo)
  const r5 = await limitDesdeDibujo(d.close + 0.0060)
  await espera(1500)
  const vivas5 = (await ordenesSrv()).length
  control('5 · la limit de D4 confirmada (una pendiente mas en el servidor y en la pagina)', /Colocar Sell Limit/.test(r5.colocar || '') && vivas5 >= 1 && (await blim()).length === vivas5, JSON.stringify({ r5, srv: await ordenesSrv() }))
  control('5 · el dibujo D4 seleccionado', await selecciona(), JSON.stringify(diag))
  m.trampas.conflictosCancelar = 2
  const n5 = m.llamadas.length
  await supr()
  await espera(6000)
  const srv5 = await ordenesSrv(), p5 = await blim(), c5 = m.llamadas.slice(n5).filter(l => l.tipo === 'cancelar').map(l => l.http)
  oraculo('5 · tras dos cancelar rechazados (409) se reintenta solo hasta cancelarla: la de D4 ya no esta (servidor y pagina, una menos)', srv5.length === vivas5 - 1 && p5.length === vivas5 - 1 && c5.length >= 3 && c5.at(-1) === 200, JSON.stringify({ srv5, p5, c5 }))
  await captura('ps02-5-cancelar-reintentado.png')
  fuera.push(...g.fuera); errores.push(...g.b.errores)
  control('las paginas no han pedido nada fuera de la maquina salvo la fuente de Google (bloqueada)', fuera.every(u => u.startsWith('https://fonts.googleapis.com/')), JSON.stringify(fuera))
  console.log(`    (informativo) errores de consola: ${JSON.stringify(errores.slice(0, 5))}`)
  console.log(`    (informativo) /api/sim/*: ${JSON.stringify(m.llamadas.map(l => [l.ruta.slice(9), l.tipo, l.id, l.http]))}`)
} catch (e) { control('la prueba corrio entera', false, e.stack) }
sale()
