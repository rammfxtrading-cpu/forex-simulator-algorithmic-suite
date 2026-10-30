/**
 * PS03 · LA PENDIENTE HUERFANA SE VE Y SE CANCELA EN LA PAGINA REAL (orden 1-177 del CTO: la condicion de R2-8 y de la
 * recarga con la apertura en cola). La prueba de nodo es pruebas/aceptacion/v1c14-huerfana-visible.mjs.
 * PESADA: Chrome, `next dev` y PostgreSQL. SIEMPRE con el turno:
 *   revisiones-suite/con-turno node pruebas/navegador/ps03-huerfana-visible.mjs
 * La pagina real con la bandera v1 ENCENDIDA y /api/sim/* en lib/servidor REAL + PostgreSQL desechable (motor-v1-real.mjs),
 * practica v1 EUR/USD M15, cursor el 3-mar-2026 10:00 UTC. Clics de verdad.
 *   A · R2-8: en la pagina A, la limit del dibujo D1 (Colocar Sell Limit). Su escritor caduca y se abre la pagina B (otra
 *       pestaña: coge el escritor al abrir; la pagina v1 no tiene boton «Usar aqui»). En la A, Supr sobre D1: el cancelar
 *       no sale adelante (aviso de otra pestaña) y la pendiente queda HUERFANA. ORACULOS: en la B se ve su linea S.LIM; su
 *       ✕ la deja cancelada en el servidor y la linea desaparece
 *   B · recarga: la limit del dibujo D2 llega al servidor y a la pagina un 500 (en la cola, sin pintar); se recarga la
 *       pagina (Page.reload: la misma pestaña). ORACULOS: tras recargar se ve su linea S.LIM; su ✕ la deja cancelada en el
 *       servidor. (El dibujo se guarda y vuelve al recargar; lo que se pierde es su ENLACE con la orden, en memoria)
 * Capturas: CAPTURAS (por defecto .pruebas/) ps03-A1-pagina-A-huerfana.png, ps03-A2-pagina-B-se-ve.png,
 * ps03-A3-pagina-B-cancelada.png, ps03-B1-recargada-se-ve.png, ps03-B2-recargada-cancelada.png.
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
const oraculo = (d, ok, extra = '') => { ok ? verdes++ : rojos++; console.log(`  ${ok ? '🟢 VERDE' : '🔴 ROJO '} [PS03] ${d}${extra ? '  · ' + extra : ''}`) }
const control = (d, ok, extra = '') => { if (!ok) rotos++; console.log(`  ${ok ? '✓' : '✗ CONTROL ROTO'} ${d}${extra ? '  · ' + extra : ''}`) }
const CAPTURAS = process.env.CAPTURAS || path.join(REPO, '.pruebas')
fs.mkdirSync(CAPTURAS, { recursive: true })
const HASTA = Date.parse('2026-03-03T10:00:00Z') / 1000
const OTRA = 'Esta sesión está abierta en otra pestaña.'

const m = await motorV1Real()
let app = null
const paginas = []
const sale = () => {
  console.log(`\n${rojos} en rojo · ${verdes} en verde · ${rotos} controles rotos`)
  for (const g of paginas) { try { g.cierraPagina() } catch {} }
  app?.mata(); m.cierra(); process.exit(rotos ? 2 : rojos ? 1 : 0)
}
// lo de ps02/od02 sobre una pagina g
function utiles(g) {
  const E = x => g.E(x), CR = g.CR
  const u = {
    captura: async nombre => { const r = await g.b.cdp('Page.captureScreenshot', { format: 'png' }); const f = path.join(CAPTURAS, nombre); fs.writeFileSync(f, Buffer.from(r.result.data, 'base64')); console.log(`    captura: ${f}`) },
    slim: async () => (await g.lineas()).filter(l => /^(B\.LIM|S\.LIM)\b/.test(l.txt)),
    texto: () => E(`document.body.innerText`),
    nDibujos: () => E(`[...${CR}.plugin._interactionManager._tools.values()].filter(x=>x.toolType==='LongShortPosition').length`),
    async limitDesdeDibujo(ent, sl = 0.0010) {
      const d = await g.datos()
      await g.dibuja(await g.px(d.ultima - 8 * d.iv, ent), await g.px(d.ultima + 4 * d.iv, ent + sl), { suelta: false })
      return g.limitDesdeDibujo()
    },
    async selecciona() {
      const d = await g.dibujo(); if (!d) return false
      for (const [t, pr] of [[d.t0, (d.entry + d.tp) / 2], [d.t1, (d.entry + d.tp) / 2], [d.t0, (d.entry + d.sl) / 2], [d.t1, (d.entry + d.sl) / 2]]) {
        const p = await g.pxPunto(t, pr)
        const v = await E(`(()=>{const cr=${CR};const r=cr.chart.chartElement().getBoundingClientRect();const h=cr.plugin._interactionManager._hitTest({x:${p.x}-r.left,y:${p.y}-r.top});const e=document.elementFromPoint(${p.x},${p.y});return {hit:h?h.tool.toolType:null,el:e?e.tagName:null}})()`)
        if (v.hit !== 'LongShortPosition' || v.el !== 'CANVAS') continue
        await g.b.cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y, button: 'none', buttons: 0 }); await espera(300)
        await g.b.cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', buttons: 1, clickCount: 1 }); await espera(80)
        await g.b.cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', buttons: 0, clickCount: 1 }); await espera(600)
        if (await E(`!![...document.querySelectorAll('button')].find(b=>b.title==='Configurar posición')`)) return true
      }
      return false
    },
    supr: async () => { for (const type of ['keyDown', 'keyUp']) await g.b.cdp('Input.dispatchKeyEvent', { type, key: 'Delete', code: 'Delete', windowsVirtualKeyCode: 46, nativeVirtualKeyCode: 46 }); await espera(600) },
    // la ✕ de la linea S.LIM (PositionOverlay: onCancelOrder), con un clic de verdad
    async cancelaLinea() {
      const p = await E(`(()=>{const ls=[...document.querySelectorAll('div')].filter(d=>d.style.zIndex==='5'&&d.style.position==='absolute').flatMap(c=>[...c.children]);const l=ls.find(x=>/^(B|S)\\.LIM\\b/.test(x.innerText.trim()));if(!l)return null;const b=[...l.querySelectorAll('button')].find(b=>b.innerText.trim()==='✕');if(!b)return null;const r=b.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()`)
      if (!p) return false
      await g.b.cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y, button: 'none', buttons: 0 }); await espera(200)
      await g.b.clic(p.x, p.y); return true
    },
  }
  return u
}
const ordenesSrv = async () => (await m.fila()).estado.ordenes.map(o => ({ id: o.id, precio: Number(o.precio?.$b ?? o.precio) }))
async function pagina() {
  const g = await montaPagina({ app, sesion: sesionDelDoble(await m.fila()), api: m.api })
  paginas.push(g)
  await espera(4000)
  await g.E(`${g.CR}.chart.timeScale().scrollToRealTime()`); await espera(300)
  return g
}
try {
  const f0 = await m.prepara({ hasta: HASTA })
  control('la practica v1 creada en el servidor real con el cursor el 3-mar 10:00 UTC', f0?.estado?.reloj?.cursor === HASTA)
  app = await arrancaNext({ env: { NEXT_PUBLIC_SIM_V1_PANTALLA: 'encendido' } })

  // A · R2-8
  const gA = await pagina(), A = utiles(gA)
  control('A · pagina A montada (modo v1, escritor tomado)', await gA.E(`!!${gA.CR}?.plugin`) && m.llamadas.at(-2)?.ruta === '/api/sim/tomar' || m.llamadas.some(l => l.ruta === '/api/sim/tomar' && l.http === 200))
  const dA = await gA.datos()
  const rA = await A.limitDesdeDibujo(dA.close + 0.0040)
  await espera(1500)
  control('A · la limit de D1 confirmada (1 pendiente, una S.LIM en la A)', /Colocar Sell Limit/.test(rA.colocar || '') && (await ordenesSrv()).length === 1 && (await A.slim()).length === 1, JSON.stringify({ rA, srv: await ordenesSrv() }))
  await m.caducaEscritor()
  const nT = m.llamadas.length
  const gB = await pagina(), B = utiles(gB)
  control('A · la pagina B abre y coge el escritor (tomar 200)', m.llamadas.slice(nT).some(l => l.ruta === '/api/sim/tomar' && l.http === 200), JSON.stringify(m.llamadas.slice(nT).map(l => [l.ruta.slice(9), l.http])))
  control('A · en la A, Supr sobre D1', await A.selecciona())
  const nS = m.llamadas.length
  await A.supr(); await espera(2000)
  const cA = m.llamadas.slice(nS).filter(l => l.tipo === 'cancelar').map(l => l.http)
  control('A · en la A el cancelar no sale adelante (409, aviso de otra pestaña) y la pendiente sigue en el servidor: huerfana', (await ordenesSrv()).length === 1 && cA.every(h => h === 409) && (await A.texto()).includes(OTRA), JSON.stringify({ cA, srv: await ordenesSrv() }))
  await A.captura('ps03-A1-pagina-A-huerfana.png')
  const lB = await B.slim()
  oraculo('A · en la pagina B (la que cogio el escritor) la pendiente huerfana se ve: una linea S.LIM', lB.length === 1, JSON.stringify(lB))
  await B.captura('ps03-A2-pagina-B-se-ve.png')
  const nC = m.llamadas.length
  control('A · en la B, la ✕ de la linea S.LIM', await B.cancelaLinea())
  await espera(2000)
  const cB = m.llamadas.slice(nC).filter(l => l.tipo === 'cancelar').map(l => [l.id, l.http])
  oraculo('A · su ✕ la deja cancelada en el servidor y la linea desaparece', (await ordenesSrv()).length === 0 && (await B.slim()).length === 0 && cB.some(x => x[1] === 200), JSON.stringify({ cB, srv: await ordenesSrv() }))
  await B.captura('ps03-A3-pagina-B-cancelada.png')
  gA.cierraPagina(); gB.cierraPagina()

  // B · recarga con la apertura en la cola
  await m.caducaEscritor()
  const gC = await pagina(), C = utiles(gC)
  const dC = await gC.datos()
  m.trampas.pierdeAbrir = true
  const rC = await C.limitDesdeDibujo(dC.close + 0.0040)
  await espera(1500)
  control('B · la limit de D2 llego al servidor y a la pagina un 500: en la cola, sin pintar', /Colocar Sell Limit/.test(rC.colocar || '') && (await ordenesSrv()).length === 1 && (await C.slim()).length === 0, JSON.stringify({ rC, srv: await ordenesSrv() }))
  await gC.b.cdp('Page.reload', { ignoreCache: false })
  for (let k = 0; k < 600 && !(await gC.E(`!!(window.__chartMap?.current?.['EUR/USD']?.plugin && window.__chartMap.current['EUR/USD'].series)`).catch(() => false)); k++) await espera(200)
  await espera(4000)
  await gC.E(`${gC.CR}.chart.timeScale().scrollToRealTime()`); await espera(300)
  const lC = await C.slim()
  // el dibujo se guarda (session_drawings) y vuelve al recargar; lo que se pierde es su enlace con la orden (en memoria)
  oraculo('B · tras recargar se ve la pendiente: una linea S.LIM', lC.length === 1, JSON.stringify({ lC, dibujos: await C.nDibujos() }))
  await C.captura('ps03-B1-recargada-se-ve.png')
  const nR = m.llamadas.length
  control('B · la ✕ de la linea S.LIM', await C.cancelaLinea())
  await espera(2500)
  const tras = m.llamadas.slice(nR).filter(l => l.ruta === '/api/sim/comando').map(l => [l.tipo, l.http])
  oraculo('B · su ✕ resuelve la cola (abrir repetido) y la deja cancelada en el servidor; la linea desaparece', (await ordenesSrv()).length === 0 && (await C.slim()).length === 0 && tras.some(x => x[0] === 'cancelar' && x[1] === 200), JSON.stringify({ tras, srv: await ordenesSrv() }))
  await C.captura('ps03-B2-recargada-cancelada.png')
  const fuera = paginas.flatMap(g => g.fuera)
  control('las paginas no han pedido nada fuera de la maquina salvo la fuente de Google (bloqueada)', fuera.every(u => u.startsWith('https://fonts.googleapis.com/')), JSON.stringify(fuera))
  console.log(`    (informativo) errores de consola: ${JSON.stringify(paginas.flatMap(g => g.b.errores).slice(0, 5))}`)
  console.log(`    (informativo) /api/sim/*: ${JSON.stringify(m.llamadas.map(l => [l.ruta.slice(9), l.tipo, l.id, l.http]))}`)
} catch (e) { control('la prueba corrio entera', false, e.stack) }
sale()
