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
 * Capturas: CAPTURAS (por defecto .pruebas/) ps02-1-dos-limit.png, ps02-2-borrado-D2.png, ps02-3-borrado-D1.png.
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
  const E = g.E, CR = g.CR
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
  control('la pagina no ha pedido nada fuera de la maquina salvo la fuente de Google (bloqueada)', g.fuera.every(u => u.startsWith('https://fonts.googleapis.com/')), JSON.stringify(g.fuera))
  console.log(`    (informativo) errores de consola: ${JSON.stringify(g.b.errores.slice(0, 5))}`)
  console.log(`    (informativo) /api/sim/*: ${JSON.stringify(m.llamadas.map(l => [l.ruta.slice(9), l.tipo, l.id, l.http]))}`)
} catch (e) { control('la prueba corrio entera', false, e.stack) }
sale()
