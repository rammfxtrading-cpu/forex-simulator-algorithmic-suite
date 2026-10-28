/**
 * KZ03 · LAS KILLZONES DEL DIA, CALCULADAS AL TERMINAR EL GO TO, SIN AVANZAR (orden 1-153, fallo 01 de Ramon)
 * PESADA: Chrome y `next dev`. SIEMPRE con el turno:  revisiones-suite/con-turno node pruebas/navegador/kz03-killzones-tras-goto.mjs
 * La pagina real (pruebas/navegador/app.mjs: Supabase y /api/* interceptados, nada sale de la maquina) con dos semanas de
 * velas en M15 (sesion-comun.mjs). En produccion (f5b713b) el Go to es sincrono: las killzones se recalculan despues de
 * pintar las velas nuevas. Desde la 1-080 el salto es asincrono (vela a vela, con la frontera economica): si algo del salto
 * espera a la red en su ULTIMA vela (en un reto, una limit que se llena justo ahi: la cola y el estado del reto), React
 * pinta con la hora nueva y las velas viejas, las killzones se calculan con esas y nada las vuelve a calcular hasta el
 * primer avance. Se leen las sesiones que tiene el primitive de las killzones (lo que pinta), SIN Play ni Step:
 *   A · practica y reto, desde el viernes 20:30 UTC, «Go to → Asia» y «Go to → Londres»: estan la Asia del lunes y, en
 *       Londres, la London del lunes (medido igual en f5b713b y 2835261: no cambia)
 *   B · reto (el status del reto a 300 ms, como hd01), desde el lunes 05:00 UTC, una BUY limit a 1,17641 nacida del dibujo
 *       de posicion (se llena en la vela de las 06:00: el minimo de 05:01-05:59 es 1,17659 y el de las 06:00, 1,17623),
 *       «Go to → Londres»: la London del lunes (06:00) tiene que estar, como en f5b713b
 * La caja de la sesion de destino tiene una sola vela (ancho 0 en pantalla) al llegar, en produccion y aqui: no se mide.
 * Contra 2835261 sale en ROJO (B), codigo 1.
 */
import { setTimeout as espera } from 'node:timers/promises'
import { montaPagina } from './sesion-comun.mjs'
import { arrancaNext } from './app.mjs'
let rojos = 0, verdes = 0, rotos = 0
const oraculo = (d, ok, extra = '') => { ok ? verdes++ : rojos++; console.log(`  ${ok ? '🟢 VERDE' : '🔴 ROJO '} [KZ03] ${d}${extra ? '  · ' + extra : ''}`) }
const control = (d, ok, extra = '') => { if (!ok) rotos++; console.log(`  ${ok ? '✓' : '✗ CONTROL ROTO'} ${d}${extra ? '  · ' + extra : ''}`) }
const iso = t => t == null ? null : new Date(t * 1000).toISOString().slice(5, 16).replace('T', ' ')
const U = s => Date.parse(s) / 1000

// las sesiones que tiene el primitive (lo que pinta): el objeto con su forma, buscado por anchura (LWC ofusca los nombres)
const SESIONES = `(()=>{const cr=window.__chartMap.current['EUR/USD'];const s=cr.series;
  let k=null;const vistos=new Set(),cola=[[s,0]];while(cola.length&&!k){const [o,d]=cola.shift();if(!o||typeof o!=='object'||vistos.has(o)||d>6)continue;vistos.add(o);
    if(o._paneViewsArray&&Array.isArray(o._sessions)){k=o;break}
    for(const v of Object.values(o)){if(v&&typeof v==='object'&&!(v instanceof Node))cola.push([v,d+1])}}if(!k)return null;
  return {ct:k._currentTime,s:k._sessions.map(x=>({k:x.key,ini:x.startTime}))}})()`
const delLunes = r => (r?.s || []).filter(x => x.ini >= U('2026-03-09T00:00:00Z')).map(x => `${x.k} ${iso(x.ini)}`)

const app = await arrancaNext()
const errores = [], fuera = []
// el Go to como Ramon (la pildora y la sesion); se espera a que el replay llegue y un poco mas, sin avanzar
async function goTo(g, boton, llegada) {
  await g.boton('Saltar a la próxima apertura de sesión'); await espera(300)
  const ok = await g.boton(boton)
  let d
  for (let i = 0; i < 100; i++) { d = await g.datos(); if (iso(d.ultima) === llegada) break; await espera(50) }
  await espera(800)
  return { ok, d }
}

// A · desde el viernes, nada abierto
const RETO = { challenge_type: '2F', challenge_phase: 1 }
for (const [caso, sesion, latApi] of [['practica', {}, 0], ['reto', RETO, 300]]) for (const [boton, clave, llegada] of [['Asia', 'asia', '03-09 00:00'], ['Londres', 'london', '03-09 06:00']]) {
  const g = await montaPagina({ app, sesion, latApi })
  control(`A ${caso} ${boton}: pagina real montada con el grafico`, await g.E(`!!${g.CR}?.plugin`))
  await espera(2500)   // la carga termina (velas, configuracion, dibujos y el reto) antes del Go to
  const { ok, d } = await goTo(g, boton, llegada)
  control(`A ${caso} ${boton}: Go to → ${boton} llega al lunes ${llegada}`, ok && iso(d.ultima) === llegada, iso(d.ultima))
  const lunes = delLunes(await g.E(SESIONES))
  oraculo(`A ${caso} ${boton}: al terminar el Go to, sin avanzar, estan la Asia del lunes${clave === 'london' ? ' y la London' : ''}`, lunes.includes('asia 03-09 00:00') && lunes.includes(`${clave} ${llegada}`), JSON.stringify(lunes))
  errores.push(...g.b.errores); fuera.push(...g.fuera); g.cierraPagina()
}

// B · reto, desde el lunes 05:00, una BUY limit que se llena en la vela de llegada
{
  const g = await montaPagina({ app, sesion: { ...RETO, last_timestamp: U('2026-03-09T05:00:00Z') }, latApi: 300 })
  control('B: pagina real montada con el grafico', await g.E(`!!${g.CR}?.plugin`))
  await espera(2500)
  const d0 = await g.datos()
  control('B: el replay esta el lunes 05:00 UTC (M15)', iso(d0.ultima) === '03-09 05:00' && d0.iv === 900, JSON.stringify({ ultima: iso(d0.ultima), iv: d0.iv }))
  const ENT = 1.17641
  await g.dibuja(await g.px(d0.ultima - 8 * d0.iv, ENT), await g.px(d0.ultima + 4 * d0.iv, ENT - 0.0010), { suelta: false })
  const r = await g.limitDesdeDibujo()
  const orden = await g.E(`(()=>{const o=[...${g.CR}.plugin._interactionManager._tools.values()].length;return o})()`)
  const ent = (await g.dibujo())?.entry
  control('B: BUY limit colocada desde el dibujo, con la entrada entre 1,17623 y 1,17659 (se llena en la vela de las 06:00 y no antes)', /Buy Limit/.test(r.colocar || '') && (await g.limites()) === 1 && ent > 1.17625 && ent < 1.17657, JSON.stringify({ r, ent, orden }))
  const antes = delLunes(await g.E(SESIONES))
  control('B: antes del Go to, la London del lunes aun no existe (el replay esta a las 05:00)', !antes.includes('london 03-09 06:00'), JSON.stringify(antes))
  const { ok, d } = await goTo(g, 'Londres', '03-09 06:00')
  control('B: Go to → Londres llega al lunes 06:00', ok && iso(d.ultima) === '03-09 06:00', iso(d.ultima))
  const ls = await g.lineas()
  control('B: la limit se ha llenado en la vela de llegada (ya no queda limit y hay linea de posicion)', (await g.limites()) === 0 && ls.some(l => /^BUY\b/.test(l.txt)), JSON.stringify(ls))
  const lunes = delLunes(await g.E(SESIONES))
  oraculo('B: al terminar el Go to, sin avanzar, el primitive tiene la London del lunes (06:00), como en f5b713b', lunes.includes('london 03-09 06:00'), JSON.stringify(lunes))
  errores.push(...g.b.errores); fuera.push(...g.fuera); g.cierraPagina()
}
control('la pagina no ha pedido nada fuera de la maquina salvo la fuente de Google (bloqueada)', fuera.every(u => u.startsWith('https://fonts.googleapis.com/')), JSON.stringify(fuera))
control('sin errores en la consola de la pagina', errores.length === 0, JSON.stringify(errores.slice(0, 5)))
console.log(`\n${rojos} en rojo · ${verdes} en verde · ${rotos} controles rotos`)
app.mata(); process.exit(rotos ? 2 : rojos ? 1 : 0)
