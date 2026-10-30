/**
 * CV03 · EN EL CAMINO V0 (bandera apagada, /api/candles): NUNCA CARGANDO SIN FINAL (orden 1-179 (b) del CTO). La prueba de
 * nodo es pruebas/aceptacion/cv02-una-carga-sin-espera-infinita.mjs. PESADA: Chrome y `next dev`. SIEMPRE con el turno:
 *   revisiones-suite/con-turno node pruebas/navegador/cv03-velas-que-faltan-v0.mjs
 * Sesion v0 EUR/USD M15 del 2 al 13-mar-2026 (el contexto de 180 dias cae en 2025). Una pagina nueva por caso.
 *   1 · 2025 (contexto, FUERA de la sesion) da 503: el grafico se pinta y se AVISA del historico anterior que falta
 *   2 · 2026 (el año de la sesion) da 503: error en el grafico con «Reintentar» A LA VISTA (antes lo tapaba el cargador
 *       «Cargando sesion» de _SessionInner, que solo se quitaba con el primer par listo); con 2026 de vuelta, el clic lo carga
 *   3 · 2026 no responde NUNCA: con el plazo (en la pagina, 60 s; aqui window.__simPlazoVelas = 3 s, el mismo mecanismo que
 *       lib/sim/plazo.js) error con «Reintentar», no cargando para siempre; con la red de vuelta, el clic lo carga
 * Capturas: CAPTURAS (por defecto .pruebas/) cv03-1-contexto-aviso.png, cv03-2-error-reintentar.png, cv03-2-reintentado.png,
 * cv03-3-plazo-error.png, cv03-3-reintentado.png. Codigo 0 verde, 1 rojo, 2 control roto.
 */
import fs from 'node:fs'
import path from 'node:path'
import { setTimeout as espera } from 'node:timers/promises'
import { montaPagina } from './sesion-comun.mjs'
import { arrancaNext } from './app.mjs'
import { REPO } from './cdp.mjs'

let rojos = 0, verdes = 0, rotos = 0
const oraculo = (d, ok, extra = '') => { ok ? verdes++ : rojos++; console.log(`  ${ok ? '🟢 VERDE' : '🔴 ROJO '} [CV03] ${d}${extra ? '  · ' + extra : ''}`) }
const control = (d, ok, extra = '') => { if (!ok) rotos++; console.log(`  ${ok ? '✓' : '✗ CONTROL ROTO'} ${d}${extra ? '  · ' + extra : ''}`) }
const CAPTURAS = process.env.CAPTURAS || path.join(REPO, '.pruebas')
fs.mkdirSync(CAPTURAS, { recursive: true })
let app = null
const paginas = []
const sale = () => { console.log(`\n${rojos} en rojo · ${verdes} en verde · ${rotos} controles rotos`); for (const g of paginas) { try { g.cierraPagina() } catch {} } ; app?.mata(); process.exit(rotos ? 2 : rojos ? 1 : 0) }
const captura = async (g, nombre) => { const r = await g.b.cdp('Page.captureScreenshot', { format: 'png' }); const f = path.join(CAPTURAS, nombre); fs.writeFileSync(f, Buffer.from(r.result.data, 'base64')); console.log(`    captura: ${f}`) }
const texto = g => g.E('document.body.innerText')
const hayVelas = g => g.E(`(window.__algSuiteRealDataLen ?? 0) > 0`).catch(() => false)
// el boton «Reintentar» del error del par, con un clic de verdad
async function reintentar(g) {
  const p = await g.E(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.innerText.trim()==='Reintentar');if(!b)return null;const r=b.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()`)
  if (!p) return false
  await g.b.clic(p.x, p.y); return true
}
// el boton «Reintentar» A LA VISTA: el elemento de encima en su centro es el boton (no el cargador «Cargando sesion»)
const reintentarVisible = g => g.E(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.innerText.trim()==='Reintentar');if(!b)return false;const r=b.getBoundingClientRect();const e=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return e===b||b.contains(e)})()`)
const plazoCorto = async (cdp) => { await cdp('Page.addScriptToEvaluateOnNewDocument', { source: 'window.__simPlazoVelas = { ms: 3000 }' }) }
try {
  app = await arrancaNext()

  // 1 · contexto
  const g1 = await montaPagina({ app, velasCaidas: [2025] }); paginas.push(g1)
  await espera(2500)
  const t1 = await texto(g1)
  control('1 · el grafico de la sesion se pinto', await hayVelas(g1))
  oraculo('1 · 2025 (contexto) da 503: el grafico se pinta y se avisa del historico anterior que falta (2025)', (await hayVelas(g1)) && /no se ha podido cargar el historico anterior a la sesion \(2025\)/.test(t1), JSON.stringify(t1.match(/EUR\/USD:[^\n]*/g)))
  await captura(g1, 'cv03-1-contexto-aviso.png')
  g1.cierraPagina()

  // 2 · el año de la sesion da 503
  const caidas = [2026]
  const g2 = await montaPagina({ app, velasCaidas: caidas }); paginas.push(g2)
  await espera(2500)
  const t2 = await texto(g2)
  oraculo('2 · 2026 (la sesion) da 503: error en el grafico con su texto y el boton «Reintentar» A LA VISTA (no tapado por «Cargando sesion»)', /Las velas de EURUSD 2026 no estan disponibles \(HTTP 503/.test(t2) && (await reintentarVisible(g2)) && !(await hayVelas(g2)), JSON.stringify({ t: t2.match(/Las velas[^\n]*/g), visible: await reintentarVisible(g2) }))
  await captura(g2, 'cv03-2-error-reintentar.png')
  caidas.splice(0)
  control('2 · clic en «Reintentar»', await reintentar(g2))
  await espera(4000)
  oraculo('2 · con 2026 de vuelta, «Reintentar» carga la sesion (velas y sin el error)', (await hayVelas(g2)) && !/Las velas de EURUSD 2026/.test(await texto(g2)))
  await captura(g2, 'cv03-2-reintentado.png')
  g2.cierraPagina()

  // 3 · el año de la sesion no responde nunca
  const colgadas = [2026]
  const g3 = await montaPagina({ app, velasColgadas: colgadas, red: plazoCorto }); paginas.push(g3)
  control('3 · el plazo de la pagina es el de la prueba (3 s)', (await g3.E('window.__simPlazoVelas?.ms')) === 3000)
  await espera(6000)
  const t3 = await texto(g3)
  oraculo('3 · 2026 no responde: pasado el plazo, error en el grafico («no han llegado a tiempo») con «Reintentar» a la vista, no cargando sin final', /Las velas de EURUSD 2026 no han llegado a tiempo/.test(t3) && (await reintentarVisible(g3)), JSON.stringify({ t: t3.match(/Las velas[^\n]*/g), visible: await reintentarVisible(g3) }))
  await captura(g3, 'cv03-3-plazo-error.png')
  colgadas.splice(0)
  // sin el boton (cargando sin final, el codigo de antes) no hay clic: el oraculo siguiente sale en rojo
  console.log(`    (informativo) 3 · clic en «Reintentar»: ${await reintentar(g3) ? 'si' : 'NO HAY BOTON'}`)
  await espera(4000)
  oraculo('3 · con la red de vuelta, «Reintentar» carga la sesion', (await hayVelas(g3)) && !/Las velas de EURUSD 2026/.test(await texto(g3)))
  await captura(g3, 'cv03-3-reintentado.png')
  const fuera = paginas.flatMap(g => g.fuera)
  control('las paginas no han pedido nada fuera de la maquina salvo la fuente de Google (bloqueada)', fuera.every(u => u.startsWith('https://fonts.googleapis.com/')), JSON.stringify(fuera))
  console.log(`    (informativo) errores de consola: ${JSON.stringify(paginas.flatMap(g => g.b.errores).slice(0, 5))}`)
} catch (e) { control('la prueba corrio entera', false, e.stack) }
sale()
