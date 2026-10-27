/**
 * HD01 · TODAS LAS HERRAMIENTAS DE DIBUJO, COMO EN PRODUCCION (f5b713b), Y EL TIEMPO DEL GO TO (orden 1-139 del CTO)
 * PESADA: Chrome y `next dev`. SIEMPRE con el turno:  revisiones-suite/con-turno node pruebas/navegador/hd01-herramientas.mjs [dibujos|goto]
 * (sin argumento: las dos partes). La pagina real (pruebas/navegador/app.mjs: Supabase y /api/candles interceptados, nada
 * sale de la maquina), dos semanas de velas, el replay en M15 el viernes a las 20:30 UTC, y el raton de verdad (CDP).
 *
 * DIBUJOS. Linea de tendencia, path, rayo horizontal, rectangulo, Fibonacci, posicion larga y posicion corta, sobre velas
 * ya pintadas. Cada una se crea (la barra y clics; el rayo horizontal no tiene boton en la barra: por el plugin), y:
 *   · cada tirador (los que pinta el plugin para ella) se arrastra en DIAGONAL (+35 px, +25 px); se apunta, por punto
 *     guardado, si cambia su instante (t+ / t-) y su precio (p+ / p-): la «firma» del tirador
 *   · el cuerpo se arrastra igual: todo el dibujo se mueve en los dos ejes
 *   · se borra (seleccion y tecla Supr)
 * y, con una de cada a la vez, se guardan y se recarga la pagina: vuelven las mismas, con los mismos puntos.
 * Oraculo: las firmas son LAS DE PRODUCCION (f5b713b, medidas en Chrome el 27-oct, abajo en PRODUCCION). Unica excepcion,
 * el dibujo de posicion: el de la 1-110 (tiradores tipo TradingView) con la linea de entrada dada la vuelta (1-139 punto 4):
 * el tirador IZQUIERDO de la entrada mueve el precio de entrada y el borde izquierdo; el DERECHO solo el borde derecho.
 * Contra f5b713b, la posicion larga y la corta salen en ROJO (es el cambio aprobado); el resto, en verde.
 *
 * GO TO. Por temporalidad (M1, M15 y H1), desde el lunes a las 12:00 UTC, seis «Go to → Londres» seguidos (uno cruza el
 * fin de semana): del clic en «Londres» al ultimo cambio de los datos del grafico (estable 400 ms), en una sesion de practica
 * y en un RETO con el /api del servidor a 300 ms. La mediana no puede pasar del TOPE (la de f5b713b, abajo, + 100 ms).
 * Medido el 27-oct (mediana, ms): f5b713b practica 23/13/12,5 y reto 29/13,5/13 (M1/M15/H1); f0ed9ff reto 333/326,5/321:
 * en un reto, el salto esperaba a releer el reto en el servidor en cada medianoche de Madrid aunque no hubiera nada abierto.
 */
import { setTimeout as espera } from 'node:timers/promises'
import { montaPagina } from './sesion-comun.mjs'
import { arrancaNext } from './app.mjs'
let rojos = 0, verdes = 0, rotos = 0
const oraculo = (d, ok, extra = '') => { ok ? verdes++ : rojos++; console.log(`  ${ok ? '🟢 VERDE' : '🔴 ROJO '} [HD01] ${d}${extra ? '  · ' + extra : ''}`) }
const control = (d, ok, extra = '') => { if (!ok) rotos++; console.log(`  ${ok ? '✓' : '✗ CONTROL ROTO'} ${d}${extra ? '  · ' + extra : ''}`) }
const PARTES = process.argv[2] ? [process.argv[2]] : ['dibujos', 'goto']
const MIDE = process.env.HD01_MIDE === '1'   // solo imprime las firmas (para medir produccion), sin oraculos de firma

// las firmas de PRODUCCION (f5b713b), tirador → por punto guardado: t+/t-/t· y p+/p-/p·; medidas en f5b713b (hd01 con HD01_MIDE=1, 27-oct; iguales en 2e4dbd7/f0ed9ff para estas cinco)
const PRODUCCION = {
  TrendLine: {"borrar": "borrado", "tirador 0 @0": "0:t+p- 1:t·p·", "tirador 1 @1": "0:t·p· 1:t+p-", "cuerpo": "0:t+p- 1:t+p-"},
  Rectangle: {"borrar": "borrado", "tirador 0 @0": "0:t+p- 1:t·p·", "tirador 6 (cuadrado) @1": "0:t·p- 1:t·p·", "tirador 3 @2": "0:t·p- 1:t+p·", "tirador 5 (cuadrado) @3": "0:t·p· 1:t+p·", "tirador 1 @4": "0:t·p· 1:t+p-", "tirador 7 (cuadrado) @5": "0:t·p· 1:t·p-", "tirador 2 @6": "0:t+p· 1:t·p-", "tirador 4 (cuadrado) @7": "0:t+p· 1:t·p·", "cuerpo": "0:t+p- 1:t+p-"},
  FibRetracement: {"borrar": "borrado", "tirador 0 @0": "0:t+p- 1:t·p·", "tirador 1 @1": "0:t·p· 1:t+p-", "cuerpo": "0:t+p- 1:t+p-"},
  Path: {"borrar": "borrado", "tirador 0 @0": "0:t+p- 1:t·p· 2:t·p·", "tirador 1 @1": "0:t·p· 1:t+p- 2:t·p·", "tirador 2 @2": "0:t·p· 1:t·p· 2:t+p-", "cuerpo": "0:t+p- 1:t+p- 2:t+p-"},
  HorizontalRay: {"borrar": "borrado", "tirador 0 @0": "0:t+p-", "cuerpo": "0:t+p-"},
}
// el dibujo de posicion aprobado: 1-110 (SL y TP a la izquierda, solo verticales) con la entrada dada la vuelta (1-139 punto 4):
// tirador 0 (cuadrado, izquierda) = precio de entrada y borde izquierdo; tirador 3 (circulo, derecha) = solo borde derecho
const POSICION = {
  Largo: {"borrar": "borrado", "tirador 0 (cuadrado) @0": "0:t+p- 1:t·p· 2:t·p·", "tirador 1 @1": "0:t·p· 1:t·p- 2:t·p·", "tirador 2 @2": "0:t·p· 1:t·p· 2:t·p-", "tirador 3 @3": "0:t·p· 1:t+p· 2:t+p·", "cuerpo": "0:t+p- 1:t+p- 2:t+p-"},
  Corto: {"borrar": "borrado", "tirador 0 (cuadrado) @0": "0:t+p- 1:t·p· 2:t·p·", "tirador 1 @1": "0:t·p· 1:t·p- 2:t·p·", "tirador 2 @2": "0:t·p· 1:t·p· 2:t·p-", "tirador 3 @3": "0:t·p· 1:t+p· 2:t+p·", "cuerpo": "0:t+p- 1:t+p- 2:t+p-"},
}
// mediana del Go to en f5b713b (ms, 6 repeticiones, medida el 27-oct) y el tope: + 100 ms (la maquina mete ±10 ms de ruido
// en medianas de 15-30 ms; la ida y vuelta al servidor de un reto, la regresion de la 1-139, son 300 ms en el doble)
const GOTO_F5 = { 'M1 practica': 23, 'M15 practica': 13, 'H1 practica': 12.5, 'M1 reto': 29, 'M15 reto': 13.5, 'H1 reto': 13 }
const TOPE = tf => GOTO_F5[tf] == null ? Infinity : GOTO_F5[tf] + 100

const app = await arrancaNext()
const salir = c => { console.log(`\n${rojos} en rojo · ${verdes} en verde · ${rotos} controles rotos`); app.mata(); process.exit(c) }

if (PARTES.includes('dibujos')) await dibujos()
if (PARTES.includes('goto')) await goto()
salir(rotos ? 2 : rojos ? 1 : 0)

async function dibujos() {
  console.log('\n── DIBUJOS')
  const g = await montaPagina({ app })
  const { E, CR, b } = g
  control('pagina real montada con el grafico y el plugin de dibujo', await E(`!!${CR}?.plugin`))
  if (rotos) return g.cierraPagina()
  const TOOLS = `[...${CR}.plugin._interactionManager._tools.values()]`
  const RECT = `${CR}.chart.chartElement().getBoundingClientRect()`
  const n = await E(`window.__algSuiteRealDataLen`)
  // la zona: velas ya pintadas (n-45 … n-12), precios alrededor del cierre
  const z = await E(`(()=>{const d=window.__algSuiteSeriesData,n=window.__algSuiteRealDataLen;let lo=1e9,hi=-1e9;for(let i=n-45;i<n-12;i++){lo=Math.min(lo,d[i].low);hi=Math.max(hi,d[i].high)}return {t:[d[n-45].time,d[n-35].time,d[n-25].time,d[n-12].time],lo,hi,c:d[n-1].close}})()`)
  const px = (t, p) => g.px(t, p)
  // la escala de precio: que el alto de la zona sea de verdad alto en pantalla (si no, los dibujos son una raya)
  const mid = (z.lo + z.hi) / 2, alto = Math.max(z.hi - z.lo, 0.0012)
  const P = { arriba: mid + alto * 0.45, abajo: mid - alto * 0.45, mid }
  const pt = id => E(`(()=>{const t=${TOOLS}.find(x=>x.id()===${JSON.stringify(id)});return t?t.points().map(p=>({t:Number(p.timestamp),p:p.price})):null})()`)
  const anclas = id => E(`(()=>{const t=${TOOLS}.find(x=>x.id()===${JSON.stringify(id)});if(!t)return null;const r=${RECT};const v=t._paneViews[0];t.updateAllViews();v.update?.();v.renderer();
    const a=(v._lineAnchorRenderers||[]).flatMap(x=>x._data?.points||[]);return a.map(p=>({x:r.left+p.x,y:r.top+p.y,i:p.data,sq:!!p.square}))})()`)
  const ids = () => E(`${TOOLS}.map(t=>t.id())`)
  const tipo = id => E(`${TOOLS}.find(x=>x.id()===${JSON.stringify(id)})?.toolType??null`)
  const exporta = () => E(`${CR}.plugin.exportLineTools()`)
  const importa = json => E(`(()=>{${CR}.plugin.removeAllLineTools();${CR}.plugin.importLineTools(${JSON.stringify(json)});return true})()`)
  const vacio = async () => { await b.clic(150, 760); await espera(200) }
  const barra = titulo => E(`(()=>{const x=[...document.querySelectorAll('button')].find(x=>x.title===${JSON.stringify(titulo)});if(!x)return false;x.click();return true})()`)

  const crea = {
    async TrendLine() { await barra('Línea de tendencia'); await espera(200); const a = await px(z.t[0], P.abajo), c = await px(z.t[3], P.arriba); await b.clic(a.x, a.y); await b.clic(c.x, c.y) },
    async Rectangle() { await barra('Rectángulo'); await espera(200); const a = await px(z.t[0], P.arriba), c = await px(z.t[3], P.abajo); await b.clic(a.x, a.y); await b.clic(c.x, c.y) },
    async FibRetracement() { await barra('Fibonacci'); await espera(200); const a = await px(z.t[0], P.abajo), c = await px(z.t[3], P.arriba); await b.clic(a.x, a.y); await b.clic(c.x, c.y) },
    async Path() { await barra('Path'); await espera(200); const a = await px(z.t[0], P.abajo), c = await px(z.t[1], P.arriba), d = await px(z.t[3], P.mid)
      await b.clic(a.x, a.y); await b.clic(c.x, c.y)
      // el ultimo, doble clic (Click → Click → Double-Click: el plugin del path)
      await b.cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: d.x, y: d.y, button: 'none', buttons: 0 }); await espera(20)
      for (const cc of [1, 2]) { await b.cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: d.x, y: d.y, button: 'left', buttons: 1, clickCount: cc }); await b.cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: d.x, y: d.y, button: 'left', buttons: 0, clickCount: cc }); await espera(40) }
      await espera(150) },
    // sin boton en la barra (DrawingToolbarV2): por el plugin, como lo crea la copia de dibujos (_SessionInner)
    async HorizontalRay() { await E(`${CR}.plugin.addLineTool('HorizontalRay',[{timestamp:${z.t[1]},price:${P.mid}}],{})`) },
    async Largo() { await barra('Long / Short'); await espera(200); const a = await px(z.t[0], P.mid), c = await px(z.t[3], P.mid - alto * 0.12); await b.clic(a.x, a.y); await b.clic(c.x, c.y) },
    async Corto() { await barra('Long / Short'); await espera(200); const a = await px(z.t[0], P.mid), c = await px(z.t[3], P.mid + alto * 0.12); await b.clic(a.x, a.y); await b.clic(c.x, c.y) },
  }
  const TIPO = { TrendLine: 'TrendLine', Rectangle: 'Rectangle', FibRetracement: 'FibRetracement', Path: 'Path', HorizontalRay: 'HorizontalRay', Largo: 'LongShortPosition', Corto: 'LongShortPosition' }
  const signo = (x, y, eps) => Math.abs(y - x) <= eps ? '·' : (y > x ? '+' : '-')
  const firma = (antes, despues) => {
    if (!antes || !despues || antes.length !== despues.length) return 'roto'
    const eps = Math.abs(P.arriba - P.abajo) / 500
    return antes.map((a, i) => `${i}:t${signo(a.t, despues[i].t, 0)}p${signo(a.p, despues[i].p, eps)}`).join(' ')
  }
  const DX = 35, DY = 25
  // un punto del CUERPO (no un tirador) donde el plugin lo da por tocado: la linea a un cuarto de su largo; el
  // rectangulo y el Fibonacci, su borde de arriba a un cuarto (por dentro no se toca: hitTestBackground false); la
  // posicion, su linea de entrada a un cuarto; el rayo, 80 px a la derecha de su origen
  const cuerpo = async (id, nombre) => {
    const q = await pt(id), s0 = await g.px(q[0].t, q[0].p), s1 = q[1] ? await g.px(q[1].t, q[1].p) : null
    if (nombre === 'HorizontalRay') return { x: s0.x + 80, y: s0.y }
    if (nombre === 'Largo' || nombre === 'Corto') return g.px(q[0].t + (q[1].t - q[0].t) / 4, q[0].p)
    if (nombre === 'Rectangle' || nombre === 'FibRetracement') return { x: s0.x + (s1.x - s0.x) / 4, y: Math.min(s0.y, s1.y) }
    return { x: s0.x + (s1.x - s0.x) / 4, y: s0.y + (s1.y - s0.y) / 4 }
  }
  const medidas = {}

  for (const nombre of Object.keys(crea)) {
    console.log(`\n── ${nombre}`)
    await E(`${CR}.plugin.removeAllLineTools()`); await espera(200)
    await crea[nombre](); await vacio()
    const todos = await ids()
    const id = todos.at(-1)
    control(`${nombre}: creado (${await tipo(id)})`, todos.length === 1 && (await tipo(id)) === TIPO[nombre], JSON.stringify(await pt(id)))
    if (todos.length !== 1) continue
    const inicial = await exporta()
    const p0 = await pt(id)
    if (nombre === 'Largo' || nombre === 'Corto') control(`${nombre}: es ${nombre === 'Largo' ? 'largo (entrada > SL)' : 'corto (entrada < SL)'}`, nombre === 'Largo' ? p0[0].p > p0[1].p : p0[0].p < p0[1].p, JSON.stringify(p0))
    const lista = await anclas(id)
    control(`${nombre}: el plugin pinta ${lista?.length ?? 0} tiradores`, !!lista?.length, JSON.stringify(lista?.map(a => a.i)))
    medidas[nombre] = {}
    // borrar, lo primero (seleccion con un clic en el cuerpo y Supr): sobre el dibujo ya recargado (import), como al abrir la sesion.
    // Recien creado, ni produccion ni el paquete lo borran con Supr tras soltarlo y volver a pulsarlo (medido el 27-oct: igual en los dos)
    await importa(inicial); await espera(150)
    {
      const de = await cuerpo(id, nombre)
      await b.clic(de.x, de.y); await espera(200)
      const sel = await E(`!!${TOOLS}.find(x=>x.id()===${JSON.stringify(id)})?.isSelected()`)
      for (const type of ['keyDown', 'keyUp']) await b.cdp('Input.dispatchKeyEvent', { type, key: 'Delete', code: 'Delete', windowsVirtualKeyCode: 46 })
      await espera(300)
      medidas[nombre].borrar = (await ids()).length === 0 ? 'borrado' : sel ? 'sigue' : 'sigue (el clic no lo selecciona)'
    }
    // cada tirador, en diagonal, desde el dibujo recien creado
    for (let k = 0; k < (lista?.length ?? 0); k++) {
      await importa(inicial); await espera(150)
      const ls = await anclas(id), a = ls[k]
      const antes = await pt(id)
      await b.arrastra({ x: a.x, y: a.y }, { x: a.x + DX, y: a.y + DY }); await vacio()
      const f = firma(antes, await pt(id))
      const clave = `tirador ${a.i}${a.sq ? ' (cuadrado)' : ''} @${k}`
      medidas[nombre][clave] = f
    }
    // el cuerpo
    await importa(inicial); await espera(150)
    {
      const de = await cuerpo(id, nombre)
      const antes = await pt(id)
      await b.arrastra(de, { x: de.x + DX, y: de.y + DY }); await vacio()
      medidas[nombre].cuerpo = firma(antes, await pt(id))
    }
    for (const [k, v] of Object.entries(medidas[nombre])) console.log(`    ${nombre} · ${k}: ${v}`)
  }

  // guardar y recargar: una de cada a la vez
  console.log('\n── guardar y recargar')
  await E(`${CR}.plugin.removeAllLineTools()`); await espera(300)
  for (const nombre of Object.keys(crea)) { await crea[nombre](); await vacio() }
  await espera(2500)
  const norm = j => JSON.parse(j || '[]').map(t => ({ id: t.id, tipo: t.toolType, pts: t.points.map(p => [Number(p.timestamp), Math.round(p.price * 1e5)]) })).sort((x, y) => x.id < y.id ? -1 : 1)
  const antes = norm(await exporta())
  control('las siete en el grafico antes de recargar', antes.length === 7, JSON.stringify(antes.map(x => x.tipo)))
  await b.cdp('Page.reload', {})
  for (let t = Date.now(); Date.now() - t < 180000;) { if (await E(`!!(window.__chartMap?.current?.['EUR/USD']?.plugin && ${TOOLS}.length>=${antes.length})`).catch(() => false)) break; await espera(200) }
  await espera(1500)
  const despues = norm(await exporta())
  medidas.guardado = JSON.stringify(despues) === JSON.stringify(antes) ? 'igual tras recargar' : 'distinto'
  if (medidas.guardado !== 'igual tras recargar') console.log('    antes  ', JSON.stringify(antes), '\n    despues', JSON.stringify(despues))
  console.log(`    guardado: ${medidas.guardado}`)

  console.log('\nMEDIDA ' + JSON.stringify(medidas))
  if (!MIDE) {
    for (const nombre of Object.keys(crea)) {
      const esperado = (nombre === 'Largo' || nombre === 'Corto') ? POSICION[nombre] : PRODUCCION[nombre]
      const m = medidas[nombre] || {}
      for (const k of Object.keys(esperado || {})) oraculo(`${nombre} · ${k}: ${esperado[k]}`, m[k] === esperado[k], `medido ${m[k]}`)
      for (const k of Object.keys(m)) if (!(k in (esperado || {}))) oraculo(`${nombre} · ${k}: no lo tiene la referencia`, false, `medido ${m[k]}`)
    }
    oraculo('las siete se guardan y vuelven iguales tras recargar', medidas.guardado === 'igual tras recargar')
  }
  control('la pagina no ha pedido nada fuera de la maquina salvo la fuente de Google (bloqueada)', g.fuera.every(u => u.startsWith('https://fonts.googleapis.com/')), JSON.stringify(g.fuera))
  control('sin errores en la consola de la pagina', b.errores.length === 0, JSON.stringify(b.errores.slice(0, 5)))
  g.cierraPagina()
}

async function goto() {
  console.log('\n── GO TO')
  const LUNES_12 = 1772452800
  const REPS = Number(process.env.HD01_REPS ?? 6)
  const res = {}
  // dos casos: una sesion de practica y un RETO (2F, fase 1) con el /api del servidor a 300 ms, como la red de Vercel
  // (en un reto, el Go to de 1-080 relee el reto en el servidor en cada cambio de dia de Madrid)
  const CASOS = { practica: { sesion: {}, latApi: 0 }, reto: { sesion: { challenge_type: '2F', challenge_phase: 1 }, latApi: 300 } }
  for (const caso of (process.env.HD01_CASO ? process.env.HD01_CASO.split(',') : Object.keys(CASOS)))
  for (const tfp of (process.env.HD01_TF ? process.env.HD01_TF.split(',') : ['M1', 'M15', 'H1'])) {
    const tf = `${tfp} ${caso}`
    const g = await montaPagina({ app, sesion: { timeframe: tfp, last_timestamp: LUNES_12, ...CASOS[caso].sesion }, latApi: CASOS[caso].latApi })
    const { E, CR } = g
    control(`${tf}: pagina montada`, await E(`!!${CR}?.plugin`))
    // la carga termina (velas, configuracion y dibujos) antes del primer Go to
    await espera(5000)
    const ms = []
    for (let r = 0; r < REPS; r++) {
      const m = await E(`new Promise(res=>{const ult=()=>{const d=window.__algSuiteSeriesData,n=window.__algSuiteRealDataLen;return d&&n?d[n-1].time:null};const l0=ult();
        const bt=[...document.querySelectorAll('button')].find(b=>b.title==='Saltar a la próxima apertura de sesión');if(!bt||bt.disabled)return res({error:'sin boton'});bt.click();
        setTimeout(()=>{const it=[...document.querySelectorAll('button')].find(b=>b.innerText.trim()==='Londres');if(!it)return res({error:'sin Londres'});const t0=performance.now();it.click();
          let sig=null,tc=t0;const cambios=[];const mira=()=>{const d=window.__algSuiteSeriesData,n=window.__algSuiteRealDataLen;const s=n+':'+(d&&n?d[n-1].time:'');const ahora=performance.now();
            if(s!==sig){sig=s;tc=ahora;cambios.push(Math.round(ahora-t0)+'·'+s)}
            if(ult()!==l0&&ahora-tc>400)return res({ms:Math.round(tc-t0),de:l0,a:ult(),cambios});
            if(ahora-t0>60000)return res({error:'60 s sin llegar',de:l0,a:ult()});
            requestAnimationFrame(mira)};requestAnimationFrame(mira)},300)})`)
      const iso = t => t ? new Date(t * 1000).toISOString().slice(5, 16) : t
      console.log(`    ${tf} #${r + 1}: ${m.ms ?? m.error} ms  (${iso(m.de)} → ${iso(m.a)})${process.env.HD01_CAMBIOS ? '  ' + JSON.stringify(m.cambios) : ''}`)
      if (m.ms != null) ms.push(m.ms)
      await espera(600)
    }
    const s = [...ms].sort((a, b) => a - b), med = s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null
    res[tf] = { mediana: med, ms }
    control(`${tf}: los ${REPS} Go to llegan`, ms.length === REPS, JSON.stringify(ms))
    if (!MIDE) oraculo(`${tf}: la mediana del Go to (${med} ms) no pasa del tope (${TOPE(tf)} ms: f5b713b ${GOTO_F5[tf]} ms + 100 ms)`, med != null && med <= TOPE(tf))
    control(`${tf}: sin errores en la consola`, g.b.errores.length === 0, JSON.stringify(g.b.errores.slice(0, 3)))
    g.cierraPagina()
  }
  console.log('\nGOTO ' + JSON.stringify(res))
}
