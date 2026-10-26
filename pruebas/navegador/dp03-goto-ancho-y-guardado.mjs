/**
 * DP03 · EL GO TO NO ESTRECHA EL DIBUJO, Y SU GUARDADO NO DA 409 NI PIDE «dashboard» (orden 1-132 del CTO)
 * PESADA: Chrome y `next dev`. SIEMPRE con el turno:  revisiones-suite/con-turno node pruebas/navegador/dp03-goto-ancho-y-guardado.mjs
 * La pagina real (pruebas/navegador/app.mjs: Supabase y /api/candles interceptados, nada sale de la maquina) con dos semanas
 * de velas y el replay en M15 el viernes a las 20:30 UTC, como Ramon: el dibujo de posicion se pone a la derecha de la
 * ultima vela (los instantes caen en el fin de semana) y se pulsa «Go to → Londres» (lunes).
 *   1. el dibujo conserva su ancho en pantalla, sus instantes y sus precios
 *   2. un dibujo que YA tiene ancho 0 se vuelve a estirar hacia la derecha desde su borde
 *   3. crear dibujos en una sesion sin fila de dibujos no da 409 (la clave unica (session_id, pair) del doble, como la
 *      base) y lo guardado es lo que hay en el grafico
 *   4. con la URL ya en /dashboard (un router.push en curso) y la pagina aun repintandose, no se pide
 *      session_chart_config con session_id=dashboard (400)
 * Contra f5b713b sale en ROJO, codigo 1.
 */
import { setTimeout as espera } from 'node:timers/promises'
import { montaPagina, VIERNES_2030 } from './sesion-comun.mjs'
let rojos = 0, verdes = 0, rotos = 0
const oraculo = (d, ok, extra = '') => { ok ? verdes++ : rojos++; console.log(`  ${ok ? '🟢 VERDE' : '🔴 ROJO '} [DP03] ${d}${extra ? '  · ' + extra : ''}`) }
const control = (d, ok, extra = '') => { if (!ok) rotos++; console.log(`  ${ok ? '✓' : '✗ CONTROL ROTO'} ${d}${extra ? '  · ' + extra : ''}`) }

const g = await montaPagina()
const { E, CR, doble } = g
const sale = () => g.sale(rotos ? 2 : rojos ? 1 : 0, `${rojos} en rojo · ${verdes} en verde · ${rotos} controles rotos`)
control('pagina real montada con el grafico y el plugin de dibujo', await E(`!!${CR}?.plugin`))
if (rotos) sale()
let d = await g.datos()
control('el replay esta el viernes a las 20:30 UTC (M15)', d.ultima === VIERNES_2030 && d.iv === 900, JSON.stringify(d))

// 1) el dibujo en el futuro (sabado) y el Go to
const a = await g.px(d.ultima + 2 * d.iv, d.close), c = await g.px(d.ultima + 7 * d.iv, d.close + 0.0015)
const antes = await g.dibuja(a, c)
const sab = t => new Date(t * 1000).getUTCDay() === 6 || (new Date(t * 1000).getUTCDay() === 5 && new Date(t * 1000).getUTCHours() >= 21)
control('dibujo creado a la derecha de la ultima vela, con los instantes en el mercado cerrado', !!antes && antes.ancho > 50 && sab(antes.t0) && sab(antes.t1), JSON.stringify(antes))
control('Go to → Londres', await g.goTo('Londres'))
d = await g.datos()
control('el replay esta ya el lunes', new Date(d.ultima * 1000).getUTCDay() === 1, new Date(d.ultima * 1000).toISOString())
const tras = await g.dibujo()
oraculo('el Go to conserva el ancho del dibujo (en velas: el mismo en pantalla)', Math.abs(tras.ancho - antes.ancho) <= 1, JSON.stringify({ antes: antes.ancho, despues: tras.ancho }))
oraculo('el Go to conserva sus instantes y sus precios', tras.t0 === antes.t0 && tras.t1 === antes.t1 && tras.entry === antes.entry && tras.sl === antes.sl && tras.tp === antes.tp, JSON.stringify({ antes, tras }))

// 2) un dibujo con ancho 0 se vuelve a estirar
await E(`${CR}.plugin.removeAllLineTools()`); await E(`${CR}.chart.timeScale().scrollToRealTime()`); await espera(400)
const ent = d.close - 0.0030
let z = await g.dibuja(await g.px(d.ultima - 20 * d.iv, ent), await g.px(d.ultima - 10 * d.iv, ent + 0.0012))
await E(`(()=>{const t=${HER()};const p=t._points;p[1].timestamp=p[0].timestamp;p[2].timestamp=p[0].timestamp;${CR}.plugin.requestUpdate?.()})()`); await espera(300)
z = await g.dibujo()
control('dibujo forzado a ancho 0 (los tres puntos en el mismo instante)', !!z && z.ancho === 0, JSON.stringify(z))
const de = await g.pxPunto(z.t0, z.entry)
await g.b.arrastra(de, { x: de.x + 120, y: de.y })
const zz = await g.dibujo()
oraculo('desde su borde, el dibujo sin ancho se estira hacia la derecha', zz.ancho > 60 && zz.sl === z.sl && zz.tp === z.tp, JSON.stringify({ antes: z, despues: zz }))

// 3) el guardado: sin 409 y con lo que hay en el grafico
await espera(1500)
const conflictos = doble.log.filter(l => /^409 session_drawings/.test(l))
oraculo('crear dibujos sin fila previa no da 409 (clave unica session_id, pair)', conflictos.length === 0, JSON.stringify({ conflictos: conflictos.length, posts: doble.log.filter(l => /^POST \/rest\/v1\/session_drawings/.test(l)).length }))
const fila = doble.tablas.session_drawings.filter(f => f.pair === 'EURUSD')
const ids = await E(`JSON.parse(${CR}.plugin.exportLineTools()).map(t=>t.id)`)
let guardados = []
try { guardados = JSON.parse(JSON.parse(fila[0].data).v).map(t => t.id) } catch {}
oraculo('lo guardado es lo que hay en el grafico (una fila, los mismos dibujos)', fila.length === 1 && JSON.stringify(guardados) === JSON.stringify(ids), JSON.stringify({ filas: fila.length, guardados, grafico: ids }))

// 4) la URL ya en /dashboard y la pagina repintandose (lo que pasa durante un router.push)
const pide = () => doble.log.filter(l => /session_chart_config/.test(l) && /dashboard/.test(l))
await E(`history.pushState(history.state, '', '/dashboard')`)
await g.boton('Avanzar vela'); await espera(300); await g.boton('Avanzar vela'); await espera(800)
oraculo('con la URL en /dashboard no se pide session_chart_config?session_id=eq.dashboard', pide().length === 0, JSON.stringify(pide()))
await E(`history.pushState(history.state, '', location.pathname.replace('/dashboard', '/session/' + ${JSON.stringify('5e5e5e5e-0000-4000-8000-000000000001')}))`)

control('la pagina no ha pedido nada fuera de la maquina salvo la fuente de Google (bloqueada)', g.fuera.every(u => u.startsWith('https://fonts.googleapis.com/')), JSON.stringify(g.fuera))
control('sin errores en la consola de la pagina (salvo las respuestas 409/400 del doble, que se miden arriba)', g.b.errores.filter(e => !/status of (409|400)/.test(e)).length === 0, JSON.stringify(g.b.errores.slice(0, 5)))
sale()

function HER() { return g.HER }
