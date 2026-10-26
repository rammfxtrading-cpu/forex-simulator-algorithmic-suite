// EL AVANCE DE LA PANTALLA V1: STEP, PLAY Y GO TO COMO EL COMANDO AVANZAR (etapa 2 del motor, pieza 4; plan-etapa2.md;
// orden 1-122). Sin React y sin lib/motor: manda avanzar por el cliente de comandos (cliente.js) y solo anima lo que
// el servidor ya confirmo. Una vela es una vela M1 del par visible (las que la pantalla tiene cargadas, como el Step de
// lib/replayEngine.js); el resto de pares los resuelve el servidor sin sus velas.
//   · paso()                Step: la siguiente vela. Si ya esta confirmada (quedo por animar de un lote del Play), se
//                           enseña sin pedir nada; si no, avanzar hasta ella (motivo paso).
//   · irA(hasta)            Go to: avanzar con motivo goto; el servidor corta en tramos (LIMITES de lib/servidor/
//                           comando.mjs: 2.400 minutos y 6 s) y se repite hasta llegar. Entre tramos, los 5 s del goto
//                           (429 demasiados_avances) los espera el cliente con la misma clave. No para en los eventos.
//   · play({ lote, hasta }) Play por lotes: avanzar hasta N velas por delante (motivo play) y animarlas; sigue con el
//                           siguiente lote hasta pausa(), hasta `hasta` o el final. Un fill, un cierre o un breach paran
//                           la ANIMACION en su vela: el recibo del lote trae paradas [{ tipo, t }]. El lote ya esta
//                           confirmado entero (el servidor no lo corta: el contrato de S4-08/E3-02 no cambia); lo que
//                           queda por animar se enseña al reanudar (play o paso) antes de pedir mas.
//   · pausa()               el Play acaba lo que tiene en vuelo y se para.
//   · mostrado              hasta que vela se ha animado (≤ el cursor confirmado).
// Todo va en serie (un avance detras de otro) y cada avance calcula su vela con el estado CONFIRMADO de ese momento:
// antes, lo pendiente de la cola se resuelve con su misma clave (cliente.recupera). Asi un Step pulsado rapido, un 429
// demasiados_pasos (sim-006: 10 por segundo; el cliente espera reintentar_en_ms) o una respuesta perdida no pierden ni
// duplican velas. La animacion es alAnimar(tiempos) con las velas confirmadas, en orden y una vez cada una (tambien las
// de un avance recuperado tras perder su respuesta, con sus paradas).
// Conclusiones: confirmado (paso) · llegado · parado (con parada { t, tipo, tipos }) · pausado · terminada (sesion
// terminada) · fin_de_datos · sin_avance · y las del cliente (incierto, conflicto, usar_aqui…), tal cual.
export const LOTE_PLAY = 10

// el tiempo de la n-esima vela despues de `cursor` (null: antes de la primera), o null si no hay tantas
export function velaTras(tiempos, cursor, n = 1) {
  let i = 0
  if (cursor != null) { let a = 0, b = tiempos.length; while (a < b) { const h = (a + b) >> 1; if (tiempos[h] <= cursor) a = h + 1; else b = h } i = a }
  return tiempos[i + n - 1] ?? null
}
export const cursorDe = s => (s?.estado?.esquema === 'reto@1' ? s.estado.horizonte : s?.estado?.reloj?.cursor) ?? null
const terminada = s => (s?.estado?.esquema === 'reto@1' ? s.estado.estado !== 'en_curso' : s?.estado != null && s.estado.estado !== 'activo')

export function creaAvance({ cliente, tiempos, alAnimar = null }) {
  // visto: hasta donde se ha animado (undefined: aun nada); paradas: las de lo confirmado que aun no se ha animado
  let cadena = Promise.resolve(), sonando = false, visto, paradas = []
  const enSerie = op => { const r = cadena.then(op); cadena = r.catch(() => {}); return r }
  const cursor = () => cursorDe(cliente.estado)
  const anota = lista => {
    for (const p of lista ?? []) if ((visto == null || p.t > visto) && !paradas.some(q => q.t === p.t && q.tipo === p.tipo)) paradas.push({ tipo: p.tipo, t: p.t })
    paradas.sort((a, b) => a.t - b.t)
  }
  // anima lo confirmado desde visto hasta `limite` (como mucho el cursor); con parar, hasta la primera parada.
  // Devuelve la parada en la que se quedo, o null
  async function muestra(limite, { parar = false } = {}) {
    const c = cursor()
    if (c == null || (visto != null && visto >= c)) return null
    let h = Math.min(limite ?? c, c)
    const p = parar ? paradas.find(q => q.t > (visto ?? -Infinity) && q.t <= h) : null
    if (p) h = p.t
    const ts = tiempos().filter(t => (visto == null || t > visto) && t <= h)
    const tipos = p ? [...new Set(paradas.filter(q => q.t === p.t).map(q => q.tipo))] : null
    visto = h
    paradas = paradas.filter(q => q.t > visto)
    if (ts.length && alAnimar) await alAnimar(ts)
    return p ? { t: p.t, tipo: tipos.includes('breach') ? 'breach' : tipos[0], tipos } : null
  }
  const pendiente = () => { const c = cursor(); return c != null && visto != null && visto < c }
  // lo pendiente de la cola resuelto (con sus paradas) y un estado confirmado; si no, el resultado del cliente
  // Un avance recuperado (su respuesta se perdio) es el de una pulsacion anterior: se anima ya, antes del siguiente (en
  // el Play, parando en sus paradas)
  async function listo({ parar = false } = {}) {
    if (visto === undefined && cliente.estado) visto = cursor()
    const p = await cliente.recupera()
    let recuperado = false
    for (const h of p.hechas ?? []) if (h.conclusion === 'confirmado') { anota(h.paradas); recuperado = true }
    if (!p.resuelto) return { conclusion: 'incierto', motivo: 'pendiente_sin_resolver' }
    if (!cliente.estado) await cliente.leeEstado()
    if (!cliente.estado) return { conclusion: 'incierto', motivo: 'sin_estado' }
    if (visto === undefined) visto = cursor()
    if (recuperado) { const q = await muestra(null, { parar }); if (q) return { conclusion: 'parado', parada: q } }
    return null
  }
  // un avanzar: anota sus paradas; c0 y c1, el cursor antes y despues
  async function avanza(hasta, motivo) {
    const c0 = cursor()
    const r = await cliente.envia('avanzar', { hasta, motivo })
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
        const no = await listo({ parar: true }); if (no) return no
        // primero lo confirmado que quedo sin animar (un lote parado en un evento, o uno recuperado)
        if (pendiente()) {
          const p = await muestra(hasta, { parar: true })
          if (p) return { conclusion: 'parado', parada: p }
          if (hasta != null && visto >= hasta) return { conclusion: 'llegado' }
          continue
        }
        const c = cursor()
        if (hasta != null && c != null && c >= hasta) return { conclusion: 'llegado' }
        if (terminada(cliente.estado)) return { conclusion: 'terminada' }
        let h = velaTras(tiempos(), c, lote) ?? tiempos().at(-1)
        if (h == null || (c != null && h <= c)) return { conclusion: 'fin_de_datos' }
        if (hasta != null && h > hasta) h = hasta
        const r = await avanza(h, 'play')
        if (r.conclusion !== 'confirmado') return r
        const p = await muestra(hasta, { parar: true })
        if (p) return { ...r, conclusion: 'parado', parada: p }
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
