/**
 * RC01 · EL RECTANGULO CON SHIFT EN UNA ESQUINA SE QUEDA CUADRADO, COMO TRADINGVIEW (orden 1-164, punto 9)
 * PESADA: Chrome y `next dev`. SIEMPRE con el turno:  revisiones-suite/con-turno node pruebas/navegador/rc01-rectangulo-cuadrado-shift.mjs
 * La pagina real (pruebas/navegador/app.mjs: Supabase y /api/candles interceptados, nada sale de la maquina), dos semanas
 * de velas (sesion-comun.mjs), el rectangulo de la barra con dos clics y el raton de verdad (CDP). Para cada esquina
 * (tiradores 0-3), con el rectangulo de partida NO cuadrado, se arrastra la esquina hacia fuera +70 px en horizontal y
 * +20 px en vertical (lejos de la esquina opuesta), y se mide en PIXELES DE PANTALLA (pointToScreenPoint, lo que pinta el
 * plugin) el ancho y el alto del rectangulo al soltar:
 *   · con Shift (pulsado a mitad del arrastre, como hd01 «a mitad»: Shift pulsado ANTES de pulsar el raton es la regla,
 *     _SessionInner, y el dibujo no se mueve; medido en hd01 «de verdad», sin cambios): |ancho - alto| <= 2 px, el lado
 *     es el mayor de |dx| y |dy| desde la esquina opuesta (± media vela + 1 px: la hora va a velas, el ancho solo puede
 *     ser un numero entero de velas), y la esquina opuesta no se mueve (±1 px)
 *   · control, el mismo arrastre SIN Shift: no queda cuadrado (|ancho - alto| > 10 px)
 * Contra 19b8858 (el Shift del plugin bloquea la Y de la esquina: solo ensancha) sale en ROJO, codigo 1.
 */
import { setTimeout as espera } from 'node:timers/promises'
import { montaPagina } from './sesion-comun.mjs'
let rojos = 0, verdes = 0, rotos = 0
const oraculo = (d, ok, extra = '') => { ok ? verdes++ : rojos++; console.log(`  ${ok ? '🟢 VERDE' : '🔴 ROJO '} [RC01] ${d}${extra ? '  · ' + extra : ''}`) }
const control = (d, ok, extra = '') => { if (!ok) rotos++; console.log(`  ${ok ? '✓' : '✗ CONTROL ROTO'} ${d}${extra ? '  · ' + extra : ''}`) }

const g = await montaPagina()
const { E, CR, b } = g
const sale = c => { console.log(`\n${rojos} en rojo · ${verdes} en verde · ${rotos} controles rotos`); b.cierra(); g.app.mata(); process.exit(c) }
control('pagina real montada con el grafico y el plugin de dibujo', await E(`!!${CR}?.plugin`))
if (rotos) sale(2)

const TOOLS = `[...${CR}.plugin._interactionManager._tools.values()]`
const RECT = `${CR}.chart.chartElement().getBoundingClientRect()`
const HER = `${TOOLS}.filter(x=>x.toolType==='Rectangle').at(-1)`
// el rectangulo en pantalla (coordenadas de la pagina): sus dos puntos guardados, ancho y alto
const medida = () => E(`(()=>{const t=${HER};if(!t)return null;const r=${RECT};const [p,q]=t.points();const a=t.pointToScreenPoint(p),c=t.pointToScreenPoint(q);if(!a||!c)return null;
  return {a:{x:r.left+a.x,y:r.top+a.y},c:{x:r.left+c.x,y:r.top+c.y},ancho:Math.abs(c.x-a.x),alto:Math.abs(c.y-a.y)}})()`)
// los tiradores que pinta el plugin (indice y pantalla)
const anclas = () => E(`(()=>{const t=${HER};if(!t)return null;const r=${RECT};const v=t._paneViews[0];t.updateAllViews();v.update?.();v.renderer();
  return (v._lineAnchorRenderers||[]).flatMap(x=>x._data?.points||[]).map(p=>({x:r.left+p.x,y:r.top+p.y,i:p.data}))})()`)
const exporta = () => E(`${CR}.plugin.exportLineTools()`)
const importa = json => E(`(()=>{${CR}.plugin.removeAllLineTools();${CR}.plugin.importLineTools(${JSON.stringify(json)});return true})()`)
const vacio = async () => { await b.clic(150, 760); await espera(200) }
const SHIFT = 8
const tecla = (type, mod) => b.cdp('Input.dispatchKeyEvent', { type, key: 'Shift', code: 'ShiftLeft', windowsVirtualKeyCode: 16, modifiers: mod })
// pulsa sin Shift, a mitad pulsa Shift (keydown y el raton con Shift) y suelta con Shift; luego suelta la tecla
const arrastra = async (de, a, { shift = false, pasos = 12 } = {}) => {
  const r = (type, x, y, mod, extra = {}) => b.cdp('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, modifiers: mod, ...extra })
  await r('mouseMoved', de.x, de.y, 0, { button: 'none', buttons: 0 }); await espera(30)
  await r('mousePressed', de.x, de.y, 0); await espera(30)
  for (let i = 1; i <= pasos; i++) { const f = i / pasos, m = shift && i >= pasos / 2 ? SHIFT : 0
    if (shift && i === pasos / 2) { await tecla('keyDown', SHIFT); await espera(30) }
    await r('mouseMoved', de.x + (a.x - de.x) * f, de.y + (a.y - de.y) * f, m); await espera(16) }
  await r('mouseReleased', a.x, a.y, shift ? SHIFT : 0); await espera(60)
  if (shift) { await tecla('keyUp', 0); await espera(30) }
}

// el rectangulo: la barra y dos clics sobre velas ya pintadas (n-32 … n-20), mas alto que ancho en pantalla: con el
// arrastre (+70, +20) gana |dy| desde la esquina opuesta (el lado sale del alto) y el cuadrado cabe en el grafico
const z = await E(`(()=>{const d=window.__algSuiteSeriesData,n=window.__algSuiteRealDataLen;let lo=1e9,hi=-1e9;for(let i=n-40;i<n-15;i++){lo=Math.min(lo,d[i].low);hi=Math.max(hi,d[i].high)}return {t0:d[n-32].time,t1:d[n-20].time,lo,hi}})()`)
await E(`[...document.querySelectorAll('button')].find(x=>x.title==='Rectángulo').click()`); await espera(200)
const mid = (z.lo + z.hi) / 2, alto = Math.max(z.hi - z.lo, 0.0012)
const p0 = await g.px(z.t0, mid + alto * 0.3), p1 = await g.px(z.t1, mid - alto * 0.3)
await b.clic(p0.x, p0.y); await espera(150); await b.clic(p1.x, p1.y); await espera(300); await vacio()
const m0 = await medida()
control('rectangulo creado y soltado', !!m0 && (await E(`${TOOLS}.length`)) === 1, JSON.stringify(m0))
if (!m0) sale(2)
control(`el rectangulo de partida no es cuadrado (ancho ${m0.ancho.toFixed(1)} px, alto ${m0.alto.toFixed(1)} px)`, Math.abs(m0.ancho - m0.alto) > 20)
control('el rectangulo de partida cabe holgado en el grafico (las esquinas se pueden sacar 70 px)', m0.ancho > 60 && m0.alto > 60)
// la separacion entre velas en pantalla (px): el lado con Shift va a la vela mas cercana
const VELA = await E(`${CR}.chart.timeScale().options().barSpacing`)
control(`separacion entre velas medida (${VELA} px)`, VELA > 0 && VELA < 60)
const inicial = await exporta()
const lista = (await anclas()) || []
control(`el plugin pinta las cuatro esquinas (0-3) entre sus ${lista.length} tiradores`, [0, 1, 2, 3].every(i => lista.some(a => a.i === i)), JSON.stringify(lista.map(a => a.i)))
if (rotos) sale(2)

const medidas = {}
for (const i of [0, 1, 2, 3]) {
  for (const shift of [false, true]) {
    await importa(inicial); await espera(150)
    const a = (await anclas()).find(x => x.i === i)
    // la esquina opuesta, en pantalla: la de las cuatro esquinas mas lejos de esta
    const esq = (await anclas()).filter(x => x.i <= 3)
    const op = esq.reduce((m, x) => Math.hypot(x.x - a.x, x.y - a.y) > Math.hypot(m.x - a.x, m.y - a.y) ? x : m, esq[0])
    const sx = Math.sign(a.x - op.x), sy = Math.sign(a.y - op.y)
    const fin = { x: a.x + sx * 70, y: a.y + sy * 20 }
    await arrastra({ x: a.x, y: a.y }, fin, { shift }); await vacio()
    const m = await medida()
    const caso = `esquina ${i} ${shift ? 'con Shift' : 'sin Shift'}`
    if (!m) { control(`${caso}: el rectangulo sigue ahi`, false); continue }
    const esqDespues = [m.a, m.c, { x: m.a.x, y: m.c.y }, { x: m.c.x, y: m.a.y }]
    const opQueda = esqDespues.some(e => Math.abs(e.x - op.x) <= 1 && Math.abs(e.y - op.y) <= 1)
    const lado = Math.max(Math.abs(fin.x - op.x), Math.abs(fin.y - op.y))
    medidas[caso] = { ancho: +m.ancho.toFixed(1), alto: +m.alto.toFixed(1), lado: +lado.toFixed(1), opuestaFija: opQueda }
    console.log(`    ${caso}: ancho ${m.ancho.toFixed(1)} px, alto ${m.alto.toFixed(1)} px (lado esperado con Shift ${lado.toFixed(1)} px), opuesta fija ${opQueda}`)
    if (shift) {
      oraculo(`${caso}: queda cuadrado en pantalla (|ancho - alto| <= 2 px)`, Math.abs(m.ancho - m.alto) <= 2, `ancho ${m.ancho.toFixed(1)}, alto ${m.alto.toFixed(1)}`)
      oraculo(`${caso}: el lado es el mayor de |dx| y |dy| desde la esquina opuesta (± media vela + 1 px)`, Math.abs(m.ancho - lado) <= VELA / 2 + 1 && Math.abs(m.alto - lado) <= VELA / 2 + 1, `lado ${lado.toFixed(1)}, vela ${VELA} px`)
      oraculo(`${caso}: la esquina opuesta no se mueve (±1 px)`, opQueda)
    } else {
      control(`${caso}: sin Shift NO queda cuadrado (|ancho - alto| > 10 px)`, Math.abs(m.ancho - m.alto) > 10, `ancho ${m.ancho.toFixed(1)}, alto ${m.alto.toFixed(1)}`)
    }
  }
}
console.log('\nRC01 ' + JSON.stringify(medidas))
control('la pagina no ha pedido nada fuera de la maquina salvo la fuente de Google (bloqueada)', g.fuera.every(u => u.startsWith('https://fonts.googleapis.com/')), JSON.stringify(g.fuera))
control('sin errores en la consola de la pagina', b.errores.length === 0, JSON.stringify(b.errores.slice(0, 5)))
sale(rotos ? 2 : rojos ? 1 : 0)
