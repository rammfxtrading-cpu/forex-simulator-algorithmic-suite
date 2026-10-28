/**
 * PL01 · CON LA BANDERA V1 APAGADA, EL PLAY NO ESPERA NI SE PARA POR LA RELECTURA DEL RETO (orden 1-153, fallos 02 y 05)
 * PESADA: Chrome y `next dev`. SIEMPRE con el turno:  revisiones-suite/con-turno node pruebas/navegador/pl01-play-sin-esperas-del-servidor.mjs
 * La pagina real (sesion-comun.mjs: Supabase y /api/* interceptados, nada sale de la maquina; sin doble de /api/sim: la
 * bandera v1 apagada, la pantalla de siempre), reto 2F de 100.000, M15, Play a 60× con clics de verdad. /api/challenge/status
 * (la relectura del reto) tarda 3 s. En produccion (f5b713b) el Play no espera a nada del servidor: el reto se relee en
 * segundo plano (al cambiar el dia de Madrid y tras cada cierre, useChallengeFlow y closePosition).
 *   A (fallo 02) · BUY limit nacida del dibujo de posicion que se llena durante el Play (lunes 07:15): desde que se llena,
 *       el reloj del Play no se queda quieto mas de 1 s (en 2835261: ~3 s, lo que tarda la relectura)
 *   B (fallo 05) · SELL limit pendiente (algo abierto) y el Play cruza la medianoche de Madrid (23:00 UTC), con el plazo de
 *       lib/sim/plazo.js a 1,5 s (window.__simPlazo; el real, 12 s) y la relectura a 3 s: sin el aviso «Un cierre está
 *       tardando en confirmarse» y el reloj sigue pasada la medianoche (en 2835261: parado con el aviso, sin ningun cierre)
 * Lo pactado no cambia (sg20 en el banco): un CIERRE que no se confirma en el plazo sigue parando el Play con su aviso.
 * Contra 2835261 sale en ROJO, codigo 1.
 */
import { setTimeout as espera } from 'node:timers/promises'
import { montaPagina } from './sesion-comun.mjs'
let rojos = 0, verdes = 0, rotos = 0
const oraculo = (d, ok, extra = '') => { ok ? verdes++ : rojos++; console.log(`  ${ok ? '🟢 VERDE' : '🔴 ROJO '} [PL01] ${d}${extra ? '  · ' + extra : ''}`) }
const control = (d, ok, extra = '') => { if (!ok) rotos++; console.log(`  ${ok ? '✓' : '✗ CONTROL ROTO'} ${d}${extra ? '  · ' + extra : ''}`) }
const U = s => Date.parse(s) / 1000
const hm = t => new Date(t * 1000).toISOString().slice(11, 16)
const RETO = { challenge_type: '2F', challenge_phase: 1, capital: 100000, balance: 100000 }
const AVISO = /tardando en confirmarse/

let app = null
const errores = [], fuera = []
async function pagina(sesion) {
  const g = await montaPagina({ app, sesion: { ...RETO, ...sesion }, latApi: 3000 }); app = g.app
  control('pagina real montada con el grafico', await g.E(`!!${g.CR}?.plugin`))
  await espera(4000)   // la carga termina (velas, configuracion, dibujos y el primer status del reto, que tarda 3 s)
  return g
}
const clicBoton = async (g, f) => { const p = await g.E(`(()=>{const x=[...document.querySelectorAll('button')].find(b=>${f});if(!x||x.disabled)return null;const r=x.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()`); if (p) await g.b.clic(p.x, p.y); return !!p }
const clicPlay = async g => { const p = await g.E(`(()=>{const all=[...document.querySelectorAll('button')];const st=all.find(t=>t.title==='Avanzar vela');const x=all[all.indexOf(st)-1];const r=x.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()`); await g.b.clic(p.x, p.y) }
const aviso = g => g.E(`[...document.querySelectorAll('div')].some(x=>/tardando en confirmarse/.test(x.innerText||''))`)
// el reloj del Play cada 100 ms durante `ms`: [{ms, t, lim, pos, aviso}]
async function muestras(g, ms, extra = async () => ({})) {
  const r = [], t0 = Date.now()
  while (Date.now() - t0 < ms) { const d = await g.datos(); r.push({ ms: Date.now() - t0, t: d.ultima, ...(await extra()) }); await espera(100) }
  return r
}
// lo mas largo que el reloj se queda quieto (ms) desde la muestra i0
const quieto = (m, i0 = 0) => { let max = 0, desde = m[i0]?.ms; for (let i = i0 + 1; i < m.length; i++) { if (m[i].t !== m[i - 1].t) desde = m[i].ms; else max = Math.max(max, m[i].ms - desde) } return max }

// A · la BUY limit que se llena con el Play
{
  const g = await pagina({})
  await g.goTo('Londres'); await g.E(`${g.CR}.chart.timeScale().scrollToRealTime()`); await espera(300)
  const d = await g.datos()
  control('A: el replay esta el lunes 06:00 UTC (M15)', hm(d.ultima) === '06:00' && d.iv === 900, hm(d.ultima))
  const ENT = Number((d.close - 0.0045).toFixed(5))
  await g.dibuja(await g.px(d.ultima - 8 * d.iv, ENT), await g.px(d.ultima + 4 * d.iv, ENT - 0.0030), { suelta: false })
  const r = await g.limitDesdeDibujo()
  control('A: BUY limit colocada desde el dibujo (se llena hacia las 07:15)', /Buy Limit/.test(r.colocar || '') && (await g.limites()) === 1, JSON.stringify(r))
  await clicBoton(g, `b.innerText.trim()==='60×'`); await clicPlay(g)
  const m = await muestras(g, 4500, async () => ({ lim: await g.limites() }))
  await clicPlay(g)
  const i0 = m.findIndex(x => x.lim === 0)
  control('A: la limit se ha llenado durante el Play', i0 > 0, JSON.stringify(m.map(x => [x.ms, hm(x.t), x.lim])))
  const q = quieto(m, i0)
  oraculo('A: desde que se llena la limit, el reloj del Play no se queda quieto mas de 1 s (produccion no espera)', i0 > 0 && q <= 1000, `quieto ${q} ms · ${JSON.stringify(m.slice(Math.max(0, i0 - 2), i0 + 12).map(x => [x.ms, hm(x.t), x.lim]))}`)
  errores.push(...g.b.errores); fuera.push(...g.fuera); g.cierraPagina()
}

// B · algo abierto y la medianoche de Madrid, con la relectura mas lenta que el plazo
{
  const g = await pagina({ last_timestamp: U('2026-03-09T22:30:00Z') })
  await g.E(`${g.CR}.chart.timeScale().scrollToRealTime()`); await espera(300)
  const d = await g.datos()
  control('B: el replay esta el lunes 22:30 UTC (23:30 en Madrid)', hm(d.ultima) === '22:30', hm(d.ultima))
  const ENT = Number((d.close + 0.0025).toFixed(5))   // por encima del maximo hasta las 01:30 (1,17067)
  await g.dibuja(await g.px(d.ultima - 8 * d.iv, ENT), await g.px(d.ultima + 4 * d.iv, ENT + 0.0010), { suelta: false })
  const r = await g.limitDesdeDibujo()
  control('B: SELL limit pendiente colocada desde el dibujo (lejos: no se llena)', /Sell Limit/.test(r.colocar || '') && (await g.limites()) === 1, JSON.stringify(r))
  await g.E(`(globalThis.__simPlazo??={}).ms=1500`)
  await clicBoton(g, `b.innerText.trim()==='60×'`); await clicPlay(g)
  const m = await muestras(g, 5000, async () => ({ aviso: await aviso(g) }))
  await clicPlay(g)
  const ult = m.at(-1).t, conAviso = m.find(x => x.aviso)
  oraculo('B: al cruzar la medianoche de Madrid con algo abierto, sin el aviso «Un cierre está tardando en confirmarse» (no hay ningun cierre)', !conAviso, conAviso ? `aviso a los ${conAviso.ms} ms, reloj ${hm(conAviso.t)}` : '')
  oraculo('B: el reloj del Play pasa la medianoche de Madrid (23:00 UTC) y sigue (no se queda quieto mas de 1 s)', ult > U('2026-03-09T23:15:00Z') && quieto(m) <= 1000, `ultimo ${hm(ult)} · quieto ${quieto(m)} ms`)
  control('B: la SELL limit sigue pendiente', (await g.limites()) === 1)
  errores.push(...g.b.errores); fuera.push(...g.fuera); g.cierraPagina()
}
control('la pagina no ha pedido nada fuera de la maquina salvo la fuente de Google (bloqueada)', fuera.every(u => u.startsWith('https://fonts.googleapis.com/')), JSON.stringify(fuera))
control('sin errores en la consola de la pagina', errores.length === 0, JSON.stringify(errores.slice(0, 5)))
console.log(`\n${rojos} en rojo · ${verdes} en verde · ${rotos} controles rotos`)
app?.mata(); process.exit(rotos ? 2 : rojos ? 1 : 0)
