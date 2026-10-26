/**
 * SG11 · EL PLAY ESPERA A LA FRONTERA ECONOMICA COMO EL STEP Y EL SALTO (SIMGOTO2-01; orden 1-087 del CTO)
 *
 * lib/replayEngine.js, _tickFrame: tras cada vela, si engine.frontera() devuelve una promesa (la vela trajo
 * algo: lib/sim/salto.js creaFrontera), el Play no consume la siguiente hasta que se resuelve; false (el reto
 * ya no esta activo) deja el motor bloqueado pero NO pausa el Play (orden 1-124, cambia el contrato de SIMGOTO2-01:
 * el Play solo lo para el alumno o el aviso del plazo; en f5b713b, produccion, el objetivo no lo paraba). requestAnimationFrame no corre en las pruebas (entorno.mjs): los fotogramas se
 * dan a mano con _tickFrame. ORACULOS, a mano: 20 velas, velocidad 60 (15 velas por fotograma de 250 ms); la
 * vela 3 trae algo.
 */
import { titulo, ver, oraculo, fin, importa } from '../lib.mjs'
const { default: ReplayEngine } = await importa('lib/replayEngine.js')
const velas = Array.from({ length: 20 }, (_, i) => ({ time: 1000 + i * 60, open: 1, high: 1, low: 1, close: 1 }))
function motor(fronteraEn, resultado) {
  const e = new ReplayEngine(); e.load(velas); e.speed = 60
  let abrir; const gate = new Promise(r => { abrir = r })
  e.frontera = () => (e.currentIndex === fronteraEn ? gate.then(() => resultado) : null)
  return { e, abrir }
}
const espera = () => new Promise(r => setTimeout(r, 5))
titulo('la vela 3 trae algo: el Play se para ahi hasta que la frontera se resuelve')
{
  const { e, abrir } = motor(3, true)
  e.play(); e._tickFrame(0); e._tickFrame(250)
  oraculo('SG11', 'el fotograma de 15 velas se detiene en la vela 3 (la de la frontera)', e.currentIndex === 3, String(e.currentIndex))
  e._tickFrame(500); e._tickFrame(750)
  oraculo('SG11', 'mientras la frontera esta pendiente, mas fotogramas no avanzan', e.currentIndex === 3, String(e.currentIndex))
  abrir(); await espera()
  e._tickFrame(1000); e._tickFrame(1250)
  oraculo('SG11', 'resuelta (true), el Play sigue', e.currentIndex > 3 && e.isPlaying, `${e.currentIndex} · ${e.isPlaying}`)
}
titulo('la frontera dice que el reto ya no esta activo (false): el Play NO se pausa (orden 1-124); el motor queda bloqueado')
{
  const { e, abrir } = motor(3, false)
  e.play(); e._tickFrame(0); e._tickFrame(250); abrir(); await espera()
  e._tickFrame(500); e._tickFrame(750)
  oraculo('SG11', 'sigue reproduciendo tras la vela 3 (no se pausa) y el motor queda bloqueado para el Step y el Go to', e.isPlaying && e.currentIndex > 3 && e.bloqueado === true, `${e.currentIndex} · ${e.isPlaying} · ${e.bloqueado}`)
}
ver('control: sin frontera, un fotograma avanza 15 velas', (() => { const e = new ReplayEngine(); e.load(velas); e.speed = 60; e.play(); e._tickFrame(0); e._tickFrame(250); return e.currentIndex === 15 })())
fin()
