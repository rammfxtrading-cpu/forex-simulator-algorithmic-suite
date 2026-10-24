/**
 * KZ02 · LA KILLZONE DEL FIN DE SEMANA EN CHROME, PAGINA REAL (ordenes 1-104 y 1-105; el caso de Ramon)
 * PESADA: Chrome y `next dev`. SIEMPRE con el turno:  revisiones-suite/con-turno node pruebas/navegador/kz02-killzone-fin-de-semana.mjs
 * Las velas de kz01 (EUR/USD jue 16-abr 21:00 UTC → vie 17-abr 20:59; hueco; dom 19-abr 21:00 → lun 20-abr 20:59), la
 * sesion parada el domingo 19-abr 02:00 (Madrid; 00:00 UTC) en M15, como la de Ramon. Se leen las cajas que PINTA el
 * primitive de las killzones (sus coordenadas, pasadas a horas con la escala de tiempo del grafico real):
 *   1 · ninguna caja de mas de 6 h; la Asia del viernes acaba a las 03:45 UTC, no a las 20:45
 *   2 · Go to → London (el boton de la pildora): ninguna caja estirada y estan la Asia y la London del lunes
 * Captura de pantalla de cada paso en .pruebas/ (para la evidencia).
 */
import fs from 'node:fs'
import path from 'node:path'
import { arrancaNext, abreSesion, dobleSupabase } from './app.mjs'
import { REPO } from './cdp.mjs'
let rojos = 0, verdes = 0, rotos = 0
const oraculo = (d, ok, extra = '') => { ok ? verdes++ : rojos++; console.log(`  ${ok ? '🟢 VERDE' : '🔴 ROJO '} [KZ02] ${d}${extra ? '  · ' + extra : ''}`) }
const control = (d, ok, extra = '') => { if (!ok) rotos++; console.log(`  ${ok ? '✓' : '✗ CONTROL ROTO'} ${d}${extra ? '  · ' + extra : ''}`) }

const U = s => Date.parse(s) / 1000
const precio = t => { const asiaFin = U('2026-04-17T04:00:00Z'); if (t < asiaFin) return 1.1 + ((t / 60) % 10) * 0.0001; if (t < U('2026-04-17T21:00:00Z')) return 1.101 + (t - asiaFin) / 300 * 0.0001; return 1.13 + ((t / 60) % 10) * 0.0001 }
const velas = []
for (let t = U('2026-04-16T21:00:00Z'); t < U('2026-04-17T21:00:00Z'); t += 60) { const p = precio(t); velas.push({ time: t, open: p, high: p + 0.00005, low: p - 0.00005, close: p, volume: 1 }) }
for (let t = U('2026-04-19T21:00:00Z'); t < U('2026-04-20T21:00:00Z'); t += 60) { const p = precio(t); velas.push({ time: t, open: p, high: p + 0.00005, low: p - 0.00005, close: p, volume: 1 }) }

const app = await arrancaNext()
const doble = dobleSupabase({ sesion: { date_from: '2026-04-17', date_to: '2026-04-24', last_timestamp: U('2026-04-19T00:00:00Z'), timeframe: 'M15' } })
const { b, fuera } = await abreSesion(app, { doble, velas })
const E = x => b.evalua(x)
const sale = async c => { if (rotos) { await foto('fallo'); console.log(String(await E('document.body.innerText.slice(0,400)')).replace(/\n/g,' | ')) } console.log(`\n${rojos} en rojo · ${verdes} en verde · ${rotos} controles rotos`); b.cierra(); app.mata(); process.exit(c) }
const foto = async n => { const sc = await b.cdp('Page.captureScreenshot', { format: 'png' }); fs.mkdirSync(path.join(REPO, '.pruebas'), { recursive: true }); fs.writeFileSync(path.join(REPO, '.pruebas', `kz02-${n}.png`), Buffer.from(sc.result.data, 'base64')) }
const iso = t => t == null ? null : new Date(t * 1000).toISOString().slice(5, 16).replace('T', ' ')
// las cajas pintadas: el primitive de killzones de la serie (interno de LWC 5.1: la lista de primitives adjuntos)
const cajas = async () => E(`(()=>{const cr=window.__chartMap.current['EUR/USD'];const s=cr.series;
  // los nombres internos de LWC van ofuscados: se busca, por anchura y con limite, el objeto con la forma del primitive
  let k=null;const vistos=new Set(),cola=[[s,0]];while(cola.length&&!k){const [o,d]=cola.shift();if(!o||typeof o!=='object'||vistos.has(o)||d>6)continue;vistos.add(o);
    if(o._paneViewsArray&&Array.isArray(o._sessions)){k=o;break}
    for(const v of Object.values(o)){if(v&&typeof v==='object'&&!(v instanceof Node))cola.push([v,d+1])}}if(!k)return null;k.updateAllViews();
  const ts=cr.chart.timeScale();const t=x=>{const l=ts.coordinateToLogical(x);const d=window.__algSuiteSeriesData;const i=Math.round(l);return d[Math.max(0,Math.min(i,d.length-1))]?.time??null};
  return {ct:k._currentTime,cajas:k._paneViewsArray[0]._data.map((b,i)=>({k:k._sessions[i]?.key,x1:b.x1,x2:b.x2,ini:t(b.x1),fin:t(b.x2)}))}})()`)
const lee = async () => { const r = await cajas(); return r && { ct: iso(r.ct), cajas: r.cajas.map(c => ({ k: c.k, ini: iso(c.ini), fin: iso(c.fin), horas: c.fin != null && c.ini != null ? (c.fin - c.ini) / 3600 : null })) } }

await new Promise(r => setTimeout(r, 1500))
let r = await lee(); await foto('domingo')
control('pagina real montada con la sesion del domingo 02:00 Madrid (00:00 UTC) en M15', r?.ct === '04-19 00:00', JSON.stringify(r?.ct))
control('se leen las cajas pintadas de las killzones', !!r && r.cajas.length > 0, JSON.stringify(r))
if (!r) await sale(2)
oraculo('cursor el domingo 02:00 (M15): ninguna caja de mas de 6 h', r.cajas.every(c => c.horas != null && c.horas <= 6), JSON.stringify(r))
oraculo('cursor el domingo 02:00 (M15): la Asia del viernes acaba a las 03:45 UTC, como un dia normal', r.cajas.some(c => c.k === 'asia' && c.ini === '04-17 00:00' && c.fin === '04-17 03:45'), JSON.stringify(r.cajas))

// Go to → London con la pildora (como Ramon)
await E(`(()=>{[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='Go to').click();return true})()`)
await new Promise(r => setTimeout(r, 300))
const ok = await E(`(()=>{const b=[...document.querySelectorAll('button,div')].find(x=>/^(London|Londres)( KZ)?$/i.test(x.textContent.trim())&&x.children.length===0);if(!b)return [...document.querySelectorAll('button')].map(x=>x.textContent.trim()).filter(Boolean).slice(-20);b.click();return true})()`)
control('menu del Go to con London', ok === true, JSON.stringify(ok))
await new Promise(r => setTimeout(r, 2500))
r = await lee(); await foto('tras-goto')
control('el Go to ha llegado al lunes 06:00 UTC', r?.ct === '04-20 06:00', JSON.stringify(r?.ct))
oraculo('tras Go to London: ninguna caja de mas de 6 h', !!r && r.cajas.every(c => c.horas != null && c.horas <= 6), JSON.stringify(r))
oraculo('tras Go to London: estan la Asia y la London del lunes (las velas de ahora)', !!r && r.cajas.some(c => c.k === 'asia' && c.ini === '04-20 00:00') && r.cajas.some(c => c.k === 'london' && c.ini === '04-20 06:00'), JSON.stringify(r?.cajas))
control('la pagina no ha pedido nada fuera de la maquina salvo la fuente de Google (bloqueada)', fuera.every(u => u.startsWith('https://fonts.googleapis.com/')), JSON.stringify(fuera))
control('sin errores en la consola de la pagina', b.errores.length === 0, JSON.stringify(b.errores.slice(0, 5)))
await sale(rotos ? 2 : rojos ? 1 : 0)
