/**
 * FP01 · EL PLAY CRUZA EL FIN DE SEMANA SIN DEJAR EL SABADO VACIO EN EL EJE (regresion de Ramon, 26-oct, EURUSD M15; orden 1-138)
 * PESADA: Chrome y `next dev`. SIEMPRE con el turno:  revisiones-suite/con-turno node pruebas/navegador/fp01-play-fin-de-semana.mjs [M15|M1]
 * (sin argumento: M15 y M1). Velas inventadas de EUR/USD en M1: jue 23-abr 21:00 UTC → vie 24-abr 20:59; hueco;
 * dom 26-abr 21:00 UTC (lo primero que deja lib/sessionData.js) → lun 27-abr 20:59. Sin dibujos.
 * Por temporalidad (M15: parada el viernes a las 20:40 UTC; M1: a las 20:55) Play a 1× y a 15× (una pagina nueva por
 * velocidad, el mismo servidor) hasta que hay velas del domingo, y pausa. En CADA frame (requestAnimationFrame de la
 * pagina, despues del pintado del grafico):
 *   · la x de la primera vela del domingo y la de la ultima del viernes en la escala de tiempo del grafico
 *   · los puntos de la escala entre las dos (velas «fantasma» del fin de semana: lo que pone marcas del sabado en el eje)
 * Oraculos, en cada frame con la vela del domingo ya en el grafico, y tras pausar:
 *   1 · la vela del domingo pegada a la del viernes: a una vela de distancia (como al pausar y como en el Step)
 *   2 · ningun punto del fin de semana en la escala (ni visible en el eje)
 * Y el coste: se cuentan las llamadas a series.setData durante el Play (instrumento en la pagina) y las velas M1 que avanza.
 * En 2e4dbd7 cada vela M1 del Play ya acaba en UN setData: series.update de una vela que no es la ultima de la serie (hay
 * fantasmas detras) lanza «Cannot update oldest data» en LWC 5 y el catch rehace con setData. La unica que no: la del
 * domingo, que va DETRAS de los fantasmas (el fallo). Medido en 2e4dbd7 (setData/velas M1): fin de semana M15 64/65 (1×) y
 * 65/66 (15×), M1 24/25 y 24/25; entre semana M15 30/30 y 91/91, M1 20/20 y 60/60. Oraculos:
 *   3 · cruzando el fin de semana: nunca mas setData que velas M1 avanzadas (con el arreglo, la del domingo tambien)
 *   4 · entre semana: exactamente uno por vela M1, como en 2e4dbd7 (el arreglo no añade ni quita ninguno)
 *   5 · tras pausar, el encuadre de PRODUCCION (f5b713b; orden 1-141): rango logico visible y x de la vela del viernes y del
 *       domingo, los de PRODUCCION (abajo) para el mismo encuadre de partida. Control: que la partida sea una medida alli
 */
import fs from 'node:fs'
import path from 'node:path'
import { setTimeout as espera } from 'node:timers/promises'
import { arrancaNext, abreSesion, dobleSupabase } from './app.mjs'
import { REPO } from './cdp.mjs'
let rojos = 0, verdes = 0, rotos = 0
const oraculo = (d, ok, extra = '') => { ok ? verdes++ : rojos++; console.log(`  ${ok ? '🟢 VERDE' : '🔴 ROJO '} [FP01] ${d}${extra ? '  · ' + extra : ''}`) }
const control = (d, ok, extra = '') => { if (!ok) rotos++; console.log(`  ${ok ? '✓' : '✗ CONTROL ROTO'} ${d}${extra ? '  · ' + extra : ''}`) }

const U = s => Date.parse(s) / 1000
const DOM_PRIMERA = U('2026-04-26T21:00:00Z')
const velas = []
const vela = t => { const p = 1.17 + Math.sin(t / 3000) * 0.002; velas.push({ time: t, open: p, high: p + 0.0002, low: p - 0.0002, close: p + 0.00005, volume: 1 }) }
for (let t = U('2026-04-23T21:00:00Z'); t < U('2026-04-24T21:00:00Z'); t += 60) vela(t)
for (let t = DOM_PRIMERA; t < U('2026-04-27T21:00:00Z'); t += 60) vela(t)
const iso = t => t == null ? null : new Date(t * 1000).toISOString().slice(5, 16).replace('T', ' ')

// por temporalidad: la ultima vela del viernes, donde para la sesion, la ultima vela que pinta al abrir y hasta donde se juega
const TFS = {
  M15: { seg: 900, vieUltima: U('2026-04-24T20:45:00Z'), para: U('2026-04-24T20:40:00Z'), abre: U('2026-04-24T20:30:00Z'), objetivo: DOM_PRIMERA + 3 * 900,
    // entre semana: el viernes 24 por la mañana, lejos del fin de semana
    semana: { para: U('2026-04-24T08:00:00Z'), abre: U('2026-04-24T08:00:00Z'), objetivo: { 1: U('2026-04-24T08:30:00Z'), 15: U('2026-04-24T09:30:00Z') } } },
  M1: { seg: 60, vieUltima: U('2026-04-24T20:59:00Z'), para: U('2026-04-24T20:55:00Z'), abre: U('2026-04-24T20:55:00Z'), objetivo: DOM_PRIMERA + 20 * 60,
    semana: { para: U('2026-04-24T08:00:00Z'), abre: U('2026-04-24T08:00:00Z'), objetivo: { 1: U('2026-04-24T08:20:00Z'), 15: U('2026-04-24T09:00:00Z') } } },
}
// EL ENCUADRE TRAS PAUSAR, EL DE PRODUCCION (f5b713b; orden 1-141). Medido en Chrome el 27-oct con esta misma prueba en un
// worktree de f5b713b: rango logico visible y x (px) de la ultima vela del viernes y de la primera del domingo, por encuadre
// de partida (el de antes del Play: en M1 la pagina abre unas veces con las 80 velas de initVisibleRange y otras sin el,
// tambien en f5b713b). En M15 el cruce del fin de semana desplaza el rango 10 puntos (las 10 fantasmas del viernes); en M1
// (la ultima vela real lejos del borde derecho) no lo mueve. f0ed9ff conservaba el rango como en una vela normal (M15: x
// del viernes 1169 en vez de 1289)
const PRODUCCION = {
  M15: [{ antes: { from: -2, to: 112 }, tras: { from: -12, to: 102, xv: 1289, xd: 1301 } }],
  M1: [{ antes: { from: 1361, to: 1441 }, tras: { from: 1361, to: 1441, xv: 1336.4, xd: 1353.4 } },
    { antes: { from: 1339, to: 1453 }, tras: { from: 1339, to: 1453, xv: 1205, xd: 1217 } }],
}
// la tolerancia: la de f5b713b repetida contra si misma (rango identico; x con la misma decima)
const TOL = { rango: 0.001, x: 0.1 }
const cerca = (a, b, t) => typeof a === 'number' && Math.abs(a - b) <= t
const pedidas = (process.argv[2] ? [process.argv[2]] : ['M15', 'M1'])
if (!pedidas.every(t => TFS[t])) { console.log(`temporalidad desconocida: ${process.argv[2]} (M15 o M1)`); process.exit(2) }

const app = await arrancaNext()
const sale = c => { console.log(`\n${rojos} en rojo · ${verdes} en verde · ${rotos} controles rotos`); app.mata(); process.exit(c) }

// el Play de Ramon: el boton de la pildora, a la izquierda del Step (el mismo boton pausa)
const PLAY = `(()=>{const all=[...document.querySelectorAll('button')];const st=all.find(t=>t.title==='Avanzar vela');all[all.indexOf(st)-1].click();return true})()`
// cuenta los setData de la serie desde ya (la serie no se recrea durante el Play: un par, sin cambio de TF)
const CUENTA_SETDATA = `(()=>{const s=window.__chartMap.current['EUR/USD'].series;window.__fp01SetData=[];if(!s.__fp01Orig){s.__fp01Orig=s.setData.bind(s)}
  s.setData=d=>{window.__fp01SetData.push({len:d.length,ultima:window.__algSuiteSeriesData?.[window.__algSuiteRealDataLen-1]?.time??null});return s.__fp01Orig(d)};return true})()`

async function abre(tf, velocidad, para, abreEn, etiqueta) {
  const doble = dobleSupabase({ sesion: { date_from: '2026-04-23', date_to: '2026-04-30', last_timestamp: para, timeframe: tf } })
  const { b, fuera } = await abreSesion(app, { doble, velas })
  const E = x => b.evalua(x)
  await espera(1500)
  const ultima = await E(`window.__algSuiteSeriesData?.[window.__algSuiteRealDataLen-1]?.time`)
  control(`${etiqueta}: pagina real montada en ${tf}, ultima vela ${iso(abreEn)} UTC`, ultima === abreEn, iso(ultima))
  if (ultima !== abreEn) { b.cierra(); return null }
  if (velocidad !== 1) control(`${etiqueta}: boton de la velocidad`, await E(`(()=>{const x=[...document.querySelectorAll('button')].find(b=>b.innerText.trim()==='${velocidad}×');if(!x)return false;x.click();return true})()`))
  await espera(200)
  return { b, fuera, E }
}

// las velas M1 que ha avanzado el Play: desde donde estaba parada la sesion hasta el reloj maestro de la pagina
const avanzadas = async (E, desde) => { const h = await E(`window.__algSuiteCurrentTime`); return velas.filter(v => v.time > desde && v.time <= h).length }

// juega hasta que la ultima vela real llega a `objetivo` (o el tope) y pausa
async function juega(E, objetivo, tope, enDomingo) {
  await E(PLAY)
  let visto = false
  while (Date.now() < tope) {
    const u = await E(`window.__algSuiteSeriesData?.[window.__algSuiteRealDataLen-1]?.time`)
    if (enDomingo && u >= DOM_PRIMERA && !visto) { await espera(150); await enDomingo(); visto = true }
    if (u >= objetivo) break
    await espera(100)
  }
  await E(PLAY)
  await espera(800)
}

async function finde(tf, velocidad) {
  const T = TFS[tf], et = `${tf} ${velocidad}×`, VIE_ULTIMA = T.vieUltima
  const r = await abre(tf, velocidad, T.para, T.abre, et); if (!r) return
  const { b, fuera, E } = r
  const foto = async n => { const sc = await b.cdp('Page.captureScreenshot', { format: 'png' }); fs.mkdirSync(path.join(REPO, '.pruebas'), { recursive: true }); fs.writeFileSync(path.join(REPO, '.pruebas', `fp01-${tf}-${velocidad}x-${n}.png`), Buffer.from(sc.result.data, 'base64')) }
  // lo que pinta el grafico en este momento: la escala de tiempo de LWC (la serie, con sus fantasmas) y el eje visible
  const MIDE = `(()=>{const cr=window.__chartMap.current['EUR/USD'];const ts=cr.chart.timeScale();const d=cr.series.data();
    const n=window.__algSuiteRealDataLen,sd=window.__algSuiteSeriesData;const ultima=sd&&n?sd[n-1].time:null;
    const hueco=d.filter(v=>v.time>${VIE_ULTIMA}&&v.time<${DOM_PRIMERA}).map(v=>v.time);
    const vr=ts.getVisibleRange();const visibles=vr?hueco.filter(t=>t>=vr.from&&t<=vr.to):[];
    const xv=ts.timeToCoordinate(${VIE_ULTIMA}),xd=ts.timeToCoordinate(${DOM_PRIMERA});const lr=ts.getVisibleLogicalRange();
    return {rango:lr?{from:lr.from,to:lr.to}:null,pc:cr.prevCount,len:d.length,ultima,dom:d.some(v=>v.time===${DOM_PRIMERA}),xv,xd,bs:ts.options().barSpacing,hueco:hueco.length,visibles:visibles.length,primeroHueco:hueco[0]??null,ultimoHueco:hueco.at(-1)??null}})()`
  // el muestreo en cada frame, en la pagina (el rAF de la muestra va despues del de LWC del mismo frame: se pide desde dentro de otro)
  await E(`(()=>{window.__fp01=[];const m=()=>{try{window.__fp01.push(${MIDE})}catch(e){window.__fp01.push({error:String(e)})}if(window.__fp01Sigue)requestAnimationFrame(m)};window.__fp01Sigue=true;requestAnimationFrame(m);return true})()`)
  await E(CUENTA_SETDATA)
  const antes = await E(MIDE)
  await juega(E, T.objetivo, Date.now() + (velocidad === 1 ? 240000 : 60000), () => foto('play'))
  await foto('play-fin')
  await E(`window.__fp01Sigue=false`)
  const muestras = await E(`window.__fp01`)
  const setDatas = await E(`window.__fp01SetData`)
  const tras = await E(MIDE); await foto('pausa')
  const nAv = await avanzadas(E, T.para)
  const conDom = muestras.filter(m => m.dom)
  // la traza: los frames en que cambia lo que pinta (para ver cuando aparece y cuando se va el hueco)
  const traza = muestras.filter((m, i) => i === 0 || ['ultima', 'dom', 'hueco', 'len', 'pc'].some(k => m[k] !== muestras[i - 1][k]))
  console.log(`  · ${et}, traza (frame: ultima · velas reales · puntos en la escala · hueco): ` + traza.filter(m => m.ultima >= VIE_ULTIMA - T.seg).slice(0, 12).map(m => `${muestras.indexOf(m)}: ${iso(m.ultima)} · ${m.pc} · ${m.len} · ${m.hueco}`).join(' | '))
  const errores = muestras.filter(m => m.error)
  control(`${et}: el Play ha llegado al domingo (velas del domingo en el grafico)`, conDom.length > 0, JSON.stringify({ frames: muestras.length, conDom: conDom.length, ultima: iso(muestras.at(-1)?.ultima) }))
  control(`${et}: el muestreo por frame no ha fallado`, errores.length === 0, JSON.stringify(errores.slice(0, 2)))
  const pegada = m => m.xv != null && m.xd != null && Math.abs((m.xd - m.xv) - m.bs) <= 1
  const malos = conDom.filter(m => !pegada(m))
  const conHueco = conDom.filter(m => m.hueco > 0)
  const ej = m => m && { xv: m.xv, xd: m.xd, distancia: m.xd != null && m.xv != null ? +(m.xd - m.xv).toFixed(1) : null, barSpacing: m.bs, huecoEnEscala: m.hueco, huecoVisible: m.visibles, de: iso(m.primeroHueco), a: iso(m.ultimoHueco) }
  oraculo(`${et}, durante el Play: en cada frame la vela del domingo esta a una vela de la del viernes`, malos.length === 0, `${malos.length}/${conDom.length} frames lejos · primero: ${JSON.stringify(ej(malos[0] ?? conDom[0]))}`)
  oraculo(`${et}, durante el Play: ningun punto del fin de semana en la escala (sin marcas del sabado)`, conHueco.length === 0, `${conHueco.length}/${conDom.length} frames con hueco · primero: ${JSON.stringify(ej(conHueco[0] ?? conDom[0]))}`)
  oraculo(`${et}, tras pausar: la vela del domingo a una vela de la del viernes y sin puntos del fin de semana`, !!tras?.dom && pegada(tras) && tras.hueco === 0, JSON.stringify(ej(tras)))
  // el encuadre tras pausar, como en produccion (f5b713b): rango logico visible y x de la vela del viernes y del domingo
  const enc = m => m && { from: m.rango?.from, to: m.rango?.to, xv: m.xv, xd: m.xd, bs: m.bs }
  console.log(`  · ${et}, encuadre antes del Play: ${JSON.stringify(enc(antes))} · tras pausar: ${JSON.stringify(enc(tras))}`)
  const P = PRODUCCION[tf].find(p => cerca(antes?.rango?.from, p.antes.from, TOL.rango) && cerca(antes?.rango?.to, p.antes.to, TOL.rango))
  control(`${et}: antes del Play, un encuadre de partida medido en produccion (${PRODUCCION[tf].map(p => p.antes.from + '..' + p.antes.to).join(' o ')})`, !!P, JSON.stringify(enc(antes)))
  if (P) {
    const igual = !!tras && cerca(tras.rango?.from, P.tras.from, TOL.rango) && cerca(tras.rango?.to, P.tras.to, TOL.rango) && cerca(tras.xv, P.tras.xv, TOL.x) && cerca(tras.xd, P.tras.xd, TOL.x)
    oraculo(`${et}, tras pausar: el encuadre de produccion (f5b713b) desde ${P.antes.from}..${P.antes.to}: rango ${P.tras.from}..${P.tras.to}, viernes en x=${P.tras.xv}, domingo en x=${P.tras.xd}`, igual, JSON.stringify(enc(tras)))
  }
  oraculo(`${et}, durante el Play: no mas setData completos que velas M1 avanzadas`, setDatas.length <= nAv, `${setDatas.length} setData · ${nAv} velas M1`)
  control(`${et}: la pagina no ha pedido nada fuera de la maquina salvo la fuente de Google (bloqueada)`, fuera.every(u => u.startsWith('https://fonts.googleapis.com/')), JSON.stringify(fuera))
  control(`${et}: sin errores en la consola de la pagina`, b.errores.length === 0, JSON.stringify(b.errores.slice(0, 5)))
  b.cierra()
}

// el coste entre semana: un Play sin huecos ni fin de semana, los mismos setData que en 2e4dbd7 (uno por vela M1)
async function semana(tf, velocidad) {
  const T = TFS[tf].semana, et = `${tf} ${velocidad}× entre semana`
  const r = await abre(tf, velocidad, T.para, T.abre, et); if (!r) return
  const { b, fuera, E } = r
  await E(CUENTA_SETDATA)
  await juega(E, T.objetivo[velocidad], Date.now() + (velocidad === 1 ? 120000 : 60000))
  const setDatas = await E(`window.__fp01SetData`)
  const ultima = await E(`window.__algSuiteSeriesData?.[window.__algSuiteRealDataLen-1]?.time`)
  control(`${et}: el Play ha avanzado hasta ${iso(T.objetivo[velocidad])}`, ultima >= T.objetivo[velocidad], iso(ultima))
  const nAv = await avanzadas(E, T.para)
  oraculo(`${et}: un setData completo por vela M1 avanzada, como en 2e4dbd7`, setDatas.length === nAv, `${setDatas.length} setData · ${nAv} velas M1`)
  control(`${et}: la pagina no ha pedido nada fuera de la maquina salvo la fuente de Google (bloqueada)`, fuera.every(u => u.startsWith('https://fonts.googleapis.com/')), JSON.stringify(fuera))
  control(`${et}: sin errores en la consola de la pagina`, b.errores.length === 0, JSON.stringify(b.errores.slice(0, 5)))
  b.cierra()
}

for (const tf of pedidas) {
  await finde(tf, 1)
  await finde(tf, 15)
  await semana(tf, 1)
  await semana(tf, 15)
}
sale(rotos ? 2 : rojos ? 1 : 0)
