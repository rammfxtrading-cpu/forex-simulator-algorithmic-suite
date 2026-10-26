// EL AVANCE DE LA PANTALLA V1: STEP, PLAY Y GO TO COMO EL COMANDO AVANZAR (etapa 2 del motor, pieza 4; plan-etapa2.md;
// orden 1-122). Sin React y sin lib/motor: manda avanzar por el cliente de comandos (cliente.js) y solo anima lo que
// el servidor ya confirmo. Una vela es una vela M1 del par visible (las que la pantalla tiene cargadas, como el Step de
// lib/replayEngine.js); el resto de pares los resuelve el servidor sin sus velas.
//   · paso()                Step: la siguiente vela (orden 1-127 g: con datos, del par visible, par(); salta huecos y
//                           festivos en un solo avance). Si ya esta confirmada (quedo por animar de un lote del Play), se
//                           enseña sin pedir nada; si no, avanzar hasta ella (motivo paso).
//   · irA(hasta)            Go to: avanzar con motivo goto; el servidor corta en tramos (LIMITES de lib/servidor/
//                           comando.mjs: 2.400 minutos y 6 s) y se repite hasta llegar. Entre tramos, los 5 s del goto
//                           (429 demasiados_avances) los espera el cliente con la misma clave. No para en los eventos.
//   · play({ lote, hasta }) Play por lotes: avanzar hasta N velas por delante (motivo play; N ≤ LOTE_PLAY_MAX, el tope
//                           del servidor: lib/sim/v1/topes.mjs) y animarlas; sigue con el siguiente lote hasta pausa(),
//                           hasta `hasta` o el final. ORDEN 1-125 (e): el Play NO se para en un fill, un cierre ni un
//                           breach. El recibo del lote trae paradas [{ tipo, t, … }] y sirven SOLO para pintar cada evento
//                           en su vela exacta: alParada({ t, tipo, tipos, eventos }) justo despues de animar esa vela (la
//                           linea que se cierra, el saldo, el modal del reto; eventos: las paradas de esa vela con sus
//                           datos, orden 1-127), y la animacion sigue. alMostrado(visto) al acabar cada tramo animado. Solo lo para el alumno
//                           (pausa) o el aviso del plazo de 12 s del cliente (incierto). Tras un breach el Play acaba
//                           porque la sesion termino (terminada): el servidor no confirma nada despues.
//   · pausa()               el Play acaba lo que tiene en vuelo y se para.
//   · mostrado              hasta que vela se ha animado (≤ el cursor confirmado).
// Todo va en serie (un avance detras de otro) y cada avance calcula su vela con el estado CONFIRMADO de ese momento:
// antes, lo pendiente de la cola se resuelve con su misma clave (cliente.recupera). Asi un Step pulsado rapido, un 429
// demasiados_pasos (sim-006: 10 por segundo; el cliente espera reintentar_en_ms) o una respuesta perdida no pierden ni
// duplican velas. La animacion es alAnimar(tiempos) con las velas confirmadas, en orden y una vez cada una (tambien las
// de un avance recuperado tras perder su respuesta, con sus paradas).
// Conclusiones: confirmado (paso) · llegado · pausado · terminada (sesion terminada) · fin_de_datos · sin_avance · y las
// del cliente (incierto, conflicto, usar_aqui…), tal cual. Ya no hay «parado» (orden 1-125 e).
import { LOTE_PLAY_MAX } from './topes.mjs'
export const LOTE_PLAY = 10

// el tiempo de la n-esima vela despues de `cursor` (null: antes de la primera), o null si no hay tantas
export function velaTras(tiempos, cursor, n = 1) {
  let i = 0
  if (cursor != null) { let a = 0, b = tiempos.length; while (a < b) { const h = (a + b) >> 1; if (tiempos[h] <= cursor) a = h + 1; else b = h } i = a }
  return tiempos[i + n - 1] ?? null
}
export const cursorDe = s => (s?.estado?.esquema === 'reto@1' ? s.estado.horizonte : s?.estado?.reloj?.cursor) ?? null
const terminada = s => (s?.estado?.esquema === 'reto@1' ? s.estado.estado !== 'en_curso' : s?.estado != null && s.estado.estado !== 'activo')

// la identidad de una parada (un recibo repetido trae las mismas: no se pintan dos veces)
const clave = p => `${p.t}|${p.tipo}|${p.posicion ?? ''}|${p.orden ?? ''}|${p.lotes ?? ''}`

export function creaAvance({ cliente, tiempos, alAnimar = null, alParada = null, alMostrado = null, par = () => null }) {
  // visto: hasta donde se ha animado (undefined: aun nada); paradas: las de lo confirmado que aun no se ha animado
  let cadena = Promise.resolve(), sonando = false, visto, paradas = []
  const enSerie = op => { const r = cadena.then(op); cadena = r.catch(() => {}); return r }
  const cursor = () => cursorDe(cliente.estado)
  const anota = lista => {
    for (const p of lista ?? []) if ((visto == null || p.t > visto) && !paradas.some(q => clave(q) === clave(p))) paradas.push({ ...p })
    // estable: las de una misma vela, en el orden del recibo
    paradas.sort((a, b) => a.t - b.t)
  }
  // anima lo confirmado desde visto hasta `limite` (como mucho el cursor). Cada parada se PINTA en su vela exacta: se
  // anima hasta esa vela (o la ultima del par visible que no la pasa), alParada, y se sigue (orden 1-125 e: nunca para)
  async function muestra(limite) {
    const c = cursor()
    if (c == null || (visto != null && visto >= c)) return
    const h = Math.min(limite ?? c, c)
    const ts = tiempos().filter(t => (visto == null || t > visto) && t <= h)
    const aqui = paradas.filter(q => q.t > (visto ?? -Infinity) && q.t <= h)
    visto = h
    paradas = paradas.filter(q => q.t > visto)
    let i = 0
    for (const t of [...new Set(aqui.map(q => q.t))]) {
      let j = i
      while (j < ts.length && ts[j] <= t) j++
      if (j > i && alAnimar) await alAnimar(ts.slice(i, j))
      i = j
      const eventos = aqui.filter(q => q.t === t)
      const tipos = [...new Set(eventos.map(q => q.tipo))]
      if (alParada) await alParada({ t, tipo: tipos.includes('breach') ? 'breach' : tipos[0], tipos, eventos })
    }
    if (i < ts.length && alAnimar) await alAnimar(ts.slice(i))
    if (alMostrado) await alMostrado(visto)
  }
  const pendiente = () => { const c = cursor(); return c != null && visto != null && visto < c }
  // lo pendiente de la cola resuelto (con sus paradas) y un estado confirmado; si no, el resultado del cliente
  // Un avance recuperado (su respuesta se perdio) es el de una pulsacion anterior: se anima ya, antes del siguiente (con
  // sus paradas pintadas)
  async function listo() {
    if (visto === undefined && cliente.estado) visto = cursor()
    const p = await cliente.recupera()
    let recuperado = false
    for (const h of p.hechas ?? []) if (h.conclusion === 'confirmado') { anota(h.paradas); recuperado = true }
    if (!p.resuelto) return { conclusion: 'incierto', motivo: 'pendiente_sin_resolver' }
    if (!cliente.estado) await cliente.leeEstado()
    if (!cliente.estado) return { conclusion: 'incierto', motivo: 'sin_estado' }
    if (visto === undefined) visto = cursor()
    if (recuperado) await muestra(null)
    return null
  }
  // un avanzar: anota sus paradas; c0 y c1, el cursor antes y despues
  async function avanza(hasta, motivo) {
    const c0 = cursor()
    // orden 1-127 (g): el paso lleva el par visible (sin barra): el servidor lo corta en SU siguiente vela con datos
    const p = motivo === 'paso' ? par()?.replace('/', '') ?? null : null
    const r = await cliente.envia('avanzar', p ? { hasta, motivo, par: p } : { hasta, motivo })
    if (r.conclusion !== 'confirmado') return { ...r, c0 }
    anota(r.paradas)
    return { ...r, c0, c1: cursor() ?? r.alcanzado }
  }
  const sinAvance = r => ({ ...r, conclusion: terminada(cliente.estado) ? 'terminada' : 'sin_avance' })

  const paso = () => enSerie(async () => {
    const no = await listo(); if (no) return no
    if (pendiente()) { await muestra(velaTras(tiempos(), visto)); return { conclusion: 'confirmado', sinComando: true } }
    if (terminada(cliente.estado)) return { conclusion: 'terminada' }
    const hasta = velaTras(tiempos(), cursor())
    if (hasta == null) return { conclusion: 'fin_de_datos' }
    const r = await avanza(hasta, 'paso')
    if (r.conclusion === 'confirmado') await muestra(r.c1)
    return r
  })

  const irA = hasta => enSerie(async () => {
    for (;;) {
      const no = await listo(); if (no) return no
      const c = cursor()
      if (c != null && c >= hasta) { await muestra(hasta); return { conclusion: 'llegado' } }
      if (terminada(cliente.estado)) { await muestra(c); return { conclusion: 'terminada' } }
      const r = await avanza(hasta, 'goto')
      if (r.conclusion !== 'confirmado') return r
      await muestra(r.c1)
      if (r.c1 != null && r.c1 >= hasta) return { ...r, conclusion: 'llegado' }
      if (r.c1 == null || (r.c0 != null && r.c1 <= r.c0)) return sinAvance(r)
    }
  })

  const play = ({ lote = LOTE_PLAY, hasta = null } = {}) => enSerie(async () => {
    sonando = true
    try {
      for (;;) {
        if (!sonando) return { conclusion: 'pausado' }
        const no = await listo(); if (no) return no
        // primero lo confirmado que quedo sin animar (un lote de antes de una pausa, o uno recuperado)
        if (pendiente()) {
          await muestra(hasta)
          if (hasta != null && visto >= hasta) return { conclusion: 'llegado' }
          continue
        }
        const c = cursor()
        if (hasta != null && c != null && c >= hasta) return { conclusion: 'llegado' }
        if (terminada(cliente.estado)) return { conclusion: 'terminada' }
        // nunca mas que el tope del servidor (orden 1-125 f)
        let h = velaTras(tiempos(), c, Math.max(1, Math.min(lote, LOTE_PLAY_MAX))) ?? tiempos().at(-1)
        if (h == null || (c != null && h <= c)) return { conclusion: 'fin_de_datos' }
        if (hasta != null && h > hasta) h = hasta
        const r = await avanza(h, 'play')
        if (r.conclusion !== 'confirmado') return r
        await muestra(hasta)
        if (r.c1 == null || (r.c0 != null && r.c1 <= r.c0)) return sinAvance(r)
        if (hasta != null && r.c1 >= hasta) return { ...r, conclusion: 'llegado' }
      }
    } finally { sonando = false }
  })

  return {
    paso,
    irA,
    play,
    pausa: () => { sonando = false },
    get reproduciendo() { return sonando },
    get mostrado() { return visto ?? null },
  }
}
