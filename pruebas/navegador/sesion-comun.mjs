// Lo comun de bt01, dp03 y dp04 (ordenes 1-130, 1-131 y 1-132): la pagina real con DOS semanas de velas (la del fixture y
// la misma +7 dias: entre medias, el fin de semana), el replay en M15 el viernes a las 20:30 UTC, y los gestos de Ramon.
import fs from 'node:fs'
import path from 'node:path'
import { setTimeout as espera } from 'node:timers/promises'
import { arrancaNext, abreSesion, dobleSupabase } from './app.mjs'
import { REPO } from './cdp.mjs'

export const VIERNES_2030 = 1772829000

export function velasDosSemanas() {
  const fx = JSON.parse(fs.readFileSync(path.join(REPO, 'pruebas/fixtures/velas/eurusd-2026-03-02-semana.json'), 'utf8'))
  const s1 = fx.velas.map(([time, open, high, low, close]) => ({ time, open, high, low, close, volume: 1 }))
  return [...s1, ...s1.map(v => ({ ...v, time: v.time + 7 * 86400 }))]
}

// app (opcional): el `next dev` ya arrancado de otra pagina (od02: una pagina nueva por caso, el mismo servidor)
export async function montaPagina({ sesion = {}, tope = 25 * 60000, app: deAntes = null } = {}) {
  const doble = dobleSupabase({ sesion: { timeframe: 'M15', date_to: '2026-03-13', last_timestamp: VIERNES_2030, ...sesion } })
  const app = deAntes ?? await arrancaNext()
  const { b, fuera } = await abreSesion(app, { doble, velas: velasDosSemanas(), tope })
  const E = x => b.evalua(x)
  const CR = `window.__chartMap.current['EUR/USD']`
  const HER = `[...${CR}.plugin._interactionManager._tools.values()].filter(x=>x.toolType==='LongShortPosition').at(-1)`
  const g = {
    app, b, fuera, doble, E, CR, HER,
    // el dibujo de posicion: precios, instantes y su ancho en pantalla (lo que pinta el plugin)
    dibujo: () => E(`(()=>{const t=${HER};if(!t||t.points().length<3)return null;const [e,s,p]=t.points();const a=t.pointToScreenPoint(e),c=t.pointToScreenPoint(s);return {cls:t.constructor.name,entry:e.price,sl:s.price,tp:p.price,t0:Number(e.timestamp),t1:Number(s.timestamp),x0:a?.x??null,x1:c?.x??null,ancho:a&&c?Math.abs(c.x-a.x):null}})()`),
    // la pantalla de un instante (indice logico de los datos, extrapolado tras la ultima vela) y de un precio
    px: (t, p) => E(`(()=>{const cr=${CR};const r=cr.chart.chartElement().getBoundingClientRect();const ts=cr.chart.timeScale();const d=window.__algSuiteSeriesData;let i=d.findIndex(v=>v.time>=${t});if(i<0)i=d.length-1+(${t}-d[d.length-1].time)/(d[d.length-1].time-d[d.length-2].time);return {x:r.left+ts.logicalToCoordinate(i),y:r.top+cr.series.priceToCoordinate(${p})}})()`),
    // la pantalla de un punto del dibujo, como lo pinta el plugin
    pxPunto: (t, p) => E(`(()=>{const tl=${HER};const cr=${CR};const r=cr.chart.chartElement().getBoundingClientRect();const q=tl.pointToScreenPoint({timestamp:${t},price:${p}});return {x:r.left+q.x,y:r.top+q.y}})()`),
    // las lineas HTML de posiciones y ordenes (PositionOverlay) y el contador de la barra de abajo
    lineas: () => E(`(()=>{const ls=[...document.querySelectorAll('div')].filter(d=>d.style.zIndex==='5'&&d.style.position==='absolute').flatMap(c=>[...c.children].map(l=>({y:parseFloat(l.style.top)+10,txt:l.innerText.replace(/\\s+/g,' ').trim()})));return ls})()`),
    limites: () => E(`(()=>{const x=[...document.querySelectorAll('*')].filter(x=>/^\\d+ LIMIT$/.test(x.innerText?.trim()||'')).at(-1);return x?Number(x.innerText.trim().split(' ')[0]):0})()`),
    datos: () => E(`(()=>{const d=window.__algSuiteSeriesData,n=window.__algSuiteRealDataLen;return {n,ultima:d[n-1].time,close:d[n-1].close,iv:d[n-1].time-d[n-2].time}})()`),
    boton: txt => E(`(()=>{const x=[...document.querySelectorAll('button')].find(b=>(b.title===${JSON.stringify(txt)})||b.innerText.trim().startsWith(${JSON.stringify(txt)}));if(!x||x.disabled)return false;x.click();return true})()`),
    play: () => E(`(()=>{const all=[...document.querySelectorAll('button')];const st=all.find(t=>t.title==='Avanzar vela');all[all.indexOf(st)-1].click();return true})()`),
    async goTo(sesionKz) { await g.boton('Saltar a la próxima apertura de sesión'); await espera(300); const ok = await g.boton(sesionKz); await espera(1500); return ok },
    // dos clics con la herramienta «Long / Short» de la barra; un clic en vacio lo suelta
    async dibuja(a, c, { suelta = true } = {}) {
      await E(`[...document.querySelectorAll('button')].find(x=>x.title==='Long / Short').click()`); await espera(200)
      await b.clic(a.x, a.y); await espera(150); await b.clic(c.x, c.y); await espera(300)
      if (suelta) { await b.clic(150, 760); await espera(200) }
      return g.dibujo()
    },
    // la orden desde el dibujo, como Ramon: seleccionarlo, el engranaje, «Ejecutar» y «Colocar … Limit»
    async limitDesdeDibujo() {
      // recien creado sigue seleccionado (su pildora con el engranaje); si no, un clic en su caja lo selecciona
      let engranaje = await g.boton('Configurar posición')
      if (!engranaje) { const d = await g.dibujo(); const m = await g.pxPunto((d.t0 + d.t1) / 2, (d.entry + d.tp) / 2); await b.clic(m.x, m.y); await espera(500); engranaje = await g.boton('Configurar posición') }
      await espera(400)
      const ejecutar = await g.boton('Ejecutar'); await espera(400)
      const colocar = await E(`(()=>{const x=[...document.querySelectorAll('button')].find(b=>/Colocar/.test(b.innerText));if(!x)return null;const t=x.innerText;x.click();return t})()`); await espera(500)
      await b.clic(150, 760); await espera(200)
      return { engranaje, ejecutar, colocar }
    },
    // Play hasta que aparezca la linea de la posicion y pausa (el replay pausado tras un Play)
    async playHasta(re, tope = 600) {
      await g.play(); let n = 0
      for (; n < tope; n++) { if ((await g.lineas()).some(l => re.test(l.txt))) break; await espera(50) }
      await g.play(); await espera(400); return n < tope
    },
    async sale(codigo, extra = '') { console.log(`\n${extra}`); b.cierra(); app.mata(); process.exit(codigo) },
    // cierra solo el Chrome de esta pagina (el servidor sigue para la siguiente)
    cierraPagina() { b.cierra() },
  }
  return g
}
