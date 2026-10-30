/**
 * PS04 · EN LA PAGINA REAL CON LA BANDERA V1, EL GRAFICO PINTA DEL MERCADO V1 (EL DEL MOTOR), SIN /api/candles (orden 1-179
 * (d) del CTO). La prueba de nodo es pruebas/aceptacion/v1c16-grafico-del-mercado-v1.mjs (identidad, sha de cada trozo,
 * vela a vela). PESADA: Chrome, `next dev` y PostgreSQL. SIEMPRE con el turno:
 *   revisiones-suite/con-turno node pruebas/navegador/ps04-grafico-del-mercado-v1.mjs
 * La pagina real con la bandera v1 ENCENDIDA y /api/sim/* en lib/servidor REAL + PostgreSQL desechable (motor-v1-real.mjs).
 * Para que se vea de que fuente pinta, el mercado v1 de EURUSD va DESPLAZADO 5 pips respecto a las velas que el arnes da
 * por /api/candles (que ademas responde 503 para 2025, como la rama). Practica v1 EUR/USD M15, cursor el 3-mar-2026 10:00.
 *   ORACULOS: (1) la pagina no pide nada a /api/candles y si a /api/sim/velas; (2) la vela de M15 en curso (la del cursor) y
 *   (3) la vela entera de las 09:00 son las que salen de las velas que lee el MOTOR de la sesion (m.velasMotor: su
 *   manifiesto fijado, su lector y su fuente), al precio exacto.
 * Captura: CAPTURAS (por defecto .pruebas/) ps04-grafico-v1.png. Codigo 0 verde, 1 rojo, 2 control roto.
 */
import fs from 'node:fs'
import path from 'node:path'
import { setTimeout as espera } from 'node:timers/promises'
import { montaPagina } from './sesion-comun.mjs'
import { arrancaNext } from './app.mjs'
import { REPO } from './cdp.mjs'
import { motorV1Real, sesionDelDoble } from './motor-v1-real.mjs'

let rojos = 0, verdes = 0, rotos = 0
const oraculo = (d, ok, extra = '') => { ok ? verdes++ : rojos++; console.log(`  ${ok ? '🟢 VERDE' : '🔴 ROJO '} [PS04] ${d}${extra ? '  · ' + extra : ''}`) }
const control = (d, ok, extra = '') => { if (!ok) rotos++; console.log(`  ${ok ? '✓' : '✗ CONTROL ROTO'} ${d}${extra ? '  · ' + extra : ''}`) }
const CAPTURAS = process.env.CAPTURAS || path.join(REPO, '.pruebas')
fs.mkdirSync(CAPTURAS, { recursive: true })
const HASTA = Date.parse('2026-03-03T10:00:00Z') / 1000
const M15 = 900
// la vela de M15 que empieza en `ini`, con las velas M1 hasta `hasta` (como engine.getAggregated)
function vela15(vs, ini, hasta) {
  const d = vs.filter(v => v.time >= ini && v.time < ini + M15 && v.time <= hasta)
  if (!d.length) return null
  return { time: ini, open: d[0].open, high: Math.max(...d.map(v => v.high)), low: Math.min(...d.map(v => v.low)), close: d.at(-1).close }
}

const m = await motorV1Real({ desplazaPips: 5 })
let app = null, g = null
const sale = () => { console.log(`\n${rojos} en rojo · ${verdes} en verde · ${rotos} controles rotos`); try { g?.cierraPagina() } catch {} ; app?.mata(); m.cierra(); process.exit(rotos ? 2 : rojos ? 1 : 0) }
try {
  const f0 = await m.prepara({ hasta: HASTA })
  control('la practica v1 creada en el servidor real con el cursor el 3-mar 10:00 UTC', f0?.estado?.reloj?.cursor === HASTA)
  app = await arrancaNext({ env: { NEXT_PUBLIC_SIM_V1_PANTALLA: 'encendido' } })
  const candles = []
  g = await montaPagina({ app, sesion: sesionDelDoble(await m.fila()), api: m.api, velasCaidas: [2025],
    red: async (cdp, on) => on('Network.requestWillBeSent', p => { if (/\/api\/candles\?/.test(p.request.url)) candles.push(p.request.url) }) })
  await espera(5000)
  control('la pagina v1 monto el grafico de EUR/USD y tomo el escritor', !!(await g.E(`!!${g.CR}?.series`)) && m.llamadas.some(l => l.ruta === '/api/sim/tomar' && l.http === 200))
  const velasSim = m.llamadas.filter(l => l.ruta === '/api/sim/velas')
  oraculo('la pagina no pide NADA a /api/candles; sus velas salen de /api/sim/velas', candles.length === 0 && velasSim.length > 0 && velasSim.every(l => l.http === 200), JSON.stringify({ candles: candles.length, velas: velasSim.length }))
  const mot = await m.velasMotor({ desde: Date.parse('2026-03-02T00:00:00Z') / 1000, hasta: HASTA })
  control('el motor lee su mercado fijado (EURUSD@v1.1)', /^EURUSD@v1\.1:/.test(mot.fijado) && mot.velas.length > 0 && mot.cursor === HASTA, mot.fijado)
  const pag = await g.E(`(()=>{const d=window.__algSuiteSeriesData,n=window.__algSuiteRealDataLen;return d.slice(0,n).map(v=>({time:v.time,open:v.open,high:v.high,low:v.low,close:v.close}))})()`)
  const ini = Math.floor(HASTA / M15) * M15
  const enCurso = pag.find(v => v.time === ini), esperada = vela15(mot.velas, ini, HASTA)
  oraculo('la vela de M15 del cursor (10:00) en el grafico es la del motor (OHLC exactos)', !!enCurso && !!esperada && ['open', 'high', 'low', 'close'].every(k => enCurso[k] === esperada[k]), JSON.stringify({ pagina: enCurso, motor: esperada }))
  const nueve = pag.find(v => v.time === ini - 4 * M15), esp9 = vela15(mot.velas, ini - 4 * M15, HASTA)
  oraculo('la vela de M15 de las 09:00 (entera) en el grafico es la del motor', !!nueve && !!esp9 && ['open', 'high', 'low', 'close'].every(k => nueve[k] === esp9[k]), JSON.stringify({ pagina: nueve, motor: esp9 }))
  await g.E(`${g.CR}.chart.timeScale().scrollToRealTime()`); await espera(400)
  const r = await g.b.cdp('Page.captureScreenshot', { format: 'png' }); const f = path.join(CAPTURAS, 'ps04-grafico-v1.png'); fs.writeFileSync(f, Buffer.from(r.result.data, 'base64')); console.log(`    captura: ${f}`)
  control('la pagina no ha pedido nada fuera de la maquina salvo la fuente de Google (bloqueada)', g.fuera.every(u => u.startsWith('https://fonts.googleapis.com/')), JSON.stringify(g.fuera))
  console.log(`    (informativo) errores de consola: ${JSON.stringify(g.b.errores.slice(0, 5))}`)
  console.log(`    (informativo) /api/sim/*: ${JSON.stringify(m.llamadas.map(l => [l.ruta.slice(9), l.tipo, l.http]))}`)
} catch (e) { control('la prueba corrio entera', false, e.stack) }
sale()
