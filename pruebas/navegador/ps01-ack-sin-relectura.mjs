/**
 * PS01 · PSIMM1-01 EN LA PAGINA REAL: LO CONFIRMADO SE VE AUNQUE FALLE LA RELECTURA (orden 1-175 del CTO; Astra no pudo ver
 * la parte visual en su entorno). La prueba de nodo es pruebas/aceptacion/v1c11-ack-sin-relectura.mjs.
 * PESADA: Chrome, `next dev` y PostgreSQL. SIEMPRE con el turno:
 *   revisiones-suite/con-turno node pruebas/navegador/ps01-ack-sin-relectura.mjs
 * La pagina real con la bandera v1 ENCENDIDA (NEXT_PUBLIC_SIM_V1_PANTALLA=encendido en `next dev`; Supabase interceptado como
 * siempre) y /api/sim/* atendido por lib/servidor REAL contra un PostgreSQL desechable (motor-v1-real.mjs). Practica v1 en
 * EUR/USD M15, el cursor confirmado el martes 3-mar-2026 10:00 UTC. Con clics de verdad:
 *   0 · (control) ▲ Buy → Ejecutar Buy con la lectura bien: una linea BUY, la del servidor
 *   1 · la segunda Buy: el ACK llega (200) y TODOS los GET de estado siguientes dan 503. ORACULOS: las dos posiciones vivas
 *       del servidor se ven (dos lineas BUY); sale el aviso «Hay una operación confirmada que no se ha podido mostrar:
 *       recarga.»; la relectura se reintento (mas de un GET tras el ACK)
 *   2 · Play con la lectura aun caida: no sale ningun avanzar, el Play no se queda en marcha y la vela no se mueve
 *   3 · la lectura vuelve: Play a 60× (2,5 s) y pausa: el avanzar sale, la vela avanza y la pagina enseña las posiciones del
 *       servidor, ni mas ni menos (en ese tramo el motor puede cerrarlas por SL/TP)
 * Capturas: CAPTURAS (por defecto .pruebas/) ps01-0-control.png, ps01-1-ack-sin-relectura.png, ps01-2-play-bloqueado.png,
 * ps01-3-reconciliada.png. Codigo 0 verde, 1 rojo, 2 control roto.
 */
import fs from 'node:fs'
import path from 'node:path'
import { setTimeout as espera } from 'node:timers/promises'
import { montaPagina } from './sesion-comun.mjs'
import { arrancaNext } from './app.mjs'
import { REPO } from './cdp.mjs'
import { motorV1Real, sesionDelDoble } from './motor-v1-real.mjs'

let rojos = 0, verdes = 0, rotos = 0
const oraculo = (d, ok, extra = '') => { ok ? verdes++ : rojos++; console.log(`  ${ok ? '🟢 VERDE' : '🔴 ROJO '} [PS01] ${d}${extra ? '  · ' + extra : ''}`) }
const control = (d, ok, extra = '') => { if (!ok) rotos++; console.log(`  ${ok ? '✓' : '✗ CONTROL ROTO'} ${d}${extra ? '  · ' + extra : ''}`) }
const CAPTURAS = process.env.CAPTURAS || path.join(REPO, '.pruebas')
fs.mkdirSync(CAPTURAS, { recursive: true })
const HASTA = Date.parse('2026-03-03T10:00:00Z') / 1000
const AVISO = 'operación confirmada que no se ha podido mostrar: recarga'

const m = await motorV1Real()
let app = null, g = null
const sale = () => {
  console.log(`\n${rojos} en rojo · ${verdes} en verde · ${rotos} controles rotos`)
  try { g?.cierraPagina() } catch {}
  app?.mata(); m.cierra(); process.exit(rotos ? 2 : rojos ? 1 : 0)
}
try {
  const f0 = await m.prepara({ hasta: HASTA })
  control('la practica v1 creada en el servidor real con el cursor el 3-mar 10:00 UTC', f0?.estado?.reloj?.cursor === HASTA, JSON.stringify({ cursor: f0?.estado?.reloj?.cursor, version: f0?.version }))
  app = await arrancaNext({ env: { NEXT_PUBLIC_SIM_V1_PANTALLA: 'encendido' } })
  g = await montaPagina({ app, sesion: sesionDelDoble(f0), api: m.api })
  await espera(4000)
  const E = g.E
  const captura = async nombre => { const r = await g.b.cdp('Page.captureScreenshot', { format: 'png' }); const f = path.join(CAPTURAS, nombre); fs.writeFileSync(f, Buffer.from(r.result.data, 'base64')); console.log(`    captura: ${f}`) }
  const clicBoton = async f => { const p = await E(`(()=>{const x=[...document.querySelectorAll('button')].find(b=>${f});if(!x||x.disabled)return null;const r=x.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()`); if (p) await g.b.clic(p.x, p.y); return !!p }
  const clicPlay = async () => { const p = await E(`(()=>{const all=[...document.querySelectorAll('button')];const st=all.find(t=>t.title==='Avanzar vela');const x=all[all.indexOf(st)-1];const r=x.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()`); await g.b.clic(p.x, p.y) }
  const foto = () => E(`(()=>{const cr=window.__chartMap.current['EUR/USD'];const d=cr.series.data(),n=window.__algSuiteRealDataLen
    const all=[...document.querySelectorAll('button')];const st=all.find(t=>t.title==='Avanzar vela');const pb=all[all.indexOf(st)-1]
    const lin=[...document.querySelectorAll('div')].filter(x=>x.style.zIndex==='5'&&x.style.position==='absolute').flatMap(x=>[...x.children].map(l=>l.innerText.replace(/\\s+/g,' ').trim()))
    return {t:d[n-1].time,sonando:/<rect/.test(pb?.innerHTML||''),pos:lin.filter(l=>/^(BUY|SELL)\\b/.test(l)),aviso:document.body.innerText.includes(${JSON.stringify(AVISO)})}})()`)
  const abreBuy = async () => { const a = await clicBoton(`b.innerText.trim()==='▲ Buy'`); await espera(600); const e = await clicBoton(`/Ejecutar Buy/.test(b.innerText)`); return a && e }
  const sim = (ruta, tipo = null) => m.llamadas.filter(l => l.ruta === ruta && (tipo == null || l.tipo === tipo))

  control('la pagina real montada con el grafico', await E(`!!${g.CR}?.plugin`))
  const ini = await foto()
  control('modo v1: la pagina tomo el escritor y leyo el estado del servidor real (200)', sim('/api/sim/tomar').some(l => l.http === 200) && sim('/api/sim/estado').some(l => l.http === 200), JSON.stringify(m.llamadas.slice(0, 4)))
  control('la grafica empieza en el cursor confirmado (10:00 UTC)', ini.t === HASTA, JSON.stringify(ini))

  // 0 · control
  control('0 · ▲ Buy → Ejecutar Buy', await abreBuy())
  await espera(2000)
  const f1 = await m.fila(), c0 = await foto()
  control('0 · con la lectura bien: el servidor tiene 1 posicion y la pagina 1 linea BUY, sin aviso', f1.estado.posiciones.length === 1 && c0.pos.length === 1 && !c0.aviso, JSON.stringify({ srv: f1.estado.posiciones.length, c0 }))
  await captura('ps01-0-control.png')

  // 1 · ACK y relectura caida
  m.trampas.caeTrasAbrir = true
  const n0 = m.llamadas.length
  control('1 · segunda ▲ Buy → Ejecutar Buy', await abreBuy())
  await espera(4000)
  const f2 = await m.fila(), c1 = await foto()
  const tras = m.llamadas.slice(n0)
  const ack = tras.findIndex(l => l.tipo === 'abrir' && l.http === 200)
  const gets503 = tras.slice(ack + 1).filter(l => l.ruta === '/api/sim/estado' && l.http === 503).length
  control('1 · el servidor confirmo la apertura (ACK 200) y tiene 2 posiciones vivas', ack >= 0 && f2.estado.posiciones.length === 2, JSON.stringify({ tras, srv: f2.estado.posiciones.map(p => p.id) }))
  oraculo('1 · las dos posiciones vivas del servidor se ven en el grafico (dos lineas BUY): ninguna invisible', c1.pos.length === 2, JSON.stringify(c1.pos))
  oraculo('1 · sale el aviso «Hay una operación confirmada que no se ha podido mostrar: recarga.»', c1.aviso, JSON.stringify(await E(`document.body.innerText.slice(-400)`)))
  oraculo('1 · la relectura se reintento (mas de un GET de estado tras el ACK, todos 503)', gets503 >= 2, JSON.stringify({ gets503 }))
  await captura('ps01-1-ack-sin-relectura.png')

  // 2 · Play sin lectura
  const avz0 = sim('/api/sim/comando', 'avanzar').length
  await clicPlay(); await espera(3000)
  const c2 = await foto()
  oraculo('2 · Play con la lectura caida: no sale ningun avanzar, el Play no queda en marcha y la vela no se mueve', sim('/api/sim/comando', 'avanzar').length === avz0 && !c2.sonando && c2.t === ini.t && c2.pos.length === 2, JSON.stringify({ avanzar: sim('/api/sim/comando', 'avanzar').length - avz0, c2 }))
  await captura('ps01-2-play-bloqueado.png')
  if (c2.sonando) { await clicPlay(); await espera(800) }

  // 3 · la lectura vuelve
  m.trampas.estadoCaido = false
  // a 60× (lote de 12 velas M1): en 2,5 s pasa de la vela M15 de las 10:00
  control('3 · velocidad 60×', await clicBoton(`b.innerText.trim()==='60×'`))
  await clicPlay(); await espera(2500)
  const durante = await foto()
  if (durante.sonando) { await clicPlay() }
  await espera(2000)
  const f3 = await m.fila(), c3 = await foto()
  // (lo que pase con las posiciones en ese tramo lo decide el motor: SL/TP; la pagina tiene que enseñar lo mismo que el servidor)
  oraculo('3 · con la lectura de vuelta, el Play reconcilia y avanza (avanzar 200, la vela pasa de las 10:00) y la pagina enseña las posiciones del servidor, ni mas ni menos',
    sim('/api/sim/comando', 'avanzar').some(l => l.http === 200) && f3.estado.reloj.cursor > HASTA && c3.t > ini.t && c3.pos.length === f3.estado.posiciones.length,
    JSON.stringify({ avanzar: sim('/api/sim/comando', 'avanzar').map(l => l.http), t: [ini.t, c3.t], cursorServidor: f3.estado.reloj.cursor, srv: f3.estado.posiciones.length, pos: c3.pos }))
  await captura('ps01-3-reconciliada.png')
  control('la pagina no ha pedido nada fuera de la maquina salvo la fuente de Google (bloqueada)', g.fuera.every(u => u.startsWith('https://fonts.googleapis.com/')), JSON.stringify(g.fuera))
  console.log(`    (informativo) errores de consola: ${JSON.stringify(g.b.errores.slice(0, 5))}`)
  console.log(`    (informativo) /api/sim/*: ${JSON.stringify(m.llamadas.map(l => [l.ruta.slice(9), l.tipo, l.http]))}`)
} catch (e) { control('la prueba corrio entera', false, e.stack) }
sale()
