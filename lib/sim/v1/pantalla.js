// LA PANTALLA V1 SIN REACT (etapa 2 del motor, pieza 6; orden 1-125 del CTO). Une el cliente de comandos (cliente.js),
// la vista (vista.js), el reto (hud.js) y el avance (avance.js) con lo que la pagina de hoy ya pinta: pairState (las
// posiciones, pendientes y trades de cada par), el saldo y el estado del reto. components/useSesionV1.js la monta.
// SIMMOTOR1-01 (Astra): todo lo pintado sale del estado CONFIRMADO del servidor. Nada se cierra, se llena ni se quema en
// el navegador: checkSLTP, checkLimitOrders, rutaComun y cierreEnVela no corren (las guardas estan en los hooks).
//   arranca()          toma el escritor y lee el estado; con 503 apagado (o solo lectura), solo lectura con aviso:
//                      nunca vuelve al calculo local
//   vuelca()           del estado confirmado a pairState, el saldo y el reto (con los trades releidos)
//   envia({tipo,carga}) una orden del alumno; despues relee los trades y vuelca
//   avance(engine)     Step, Play y Go to (avance.js) sobre las velas del par visible; alAnimar mueve el motor de la
//                      grafica vela a vela (su onTick solo pinta) y alParada vuelca (las paradas solo pintan: 1-125 e)
//   pasaFase()         /api/sim/avanzar-fase; la hija (si la hay) para navegar a ella
import { creaCliente } from './cliente'
import { vistaDe, delPar } from './vista'
import { estadoRetoV1 } from './hud'
import { creaAvance, cursorDe } from './avance'

const MENSAJE = {
  apagado: 'El simulador nuevo está apagado: esta sesión es de solo lectura por ahora.',
  solo_lectura: 'Esta sesión es de solo lectura.',
  usar_aqui: 'Esta sesión está abierta en otra pestaña.',
  mantenimiento: 'Las operaciones están en pausa: el simulador no acepta operaciones ahora.',
  incierto: 'No se ha podido confirmar la operación. Comprueba tu conexión.',
}
export const avisoDe = r => (r?.motivo === 'apagado' ? MENSAJE.apagado : MENSAJE[r?.conclusion] ?? null)

export function creaPantallaV1({ sessionId, sesion, usuario, llama, local = null, almacenSesion = null, nuevoId, pairState,
  alSaldo = () => {}, alCambio = () => {}, alReto = () => {}, avisa = () => {}, leeTrades = async () => [], buscaHija = async () => null, plazoMs = null }) {
  const cliente = creaCliente({ sessionId, usuario, epoca: sesion?.epoca ?? 1, llama, local, sesion: almacenSesion, nuevoId, plazoMs })
  let trades = [], hija = null, soloLectura = false, aviso = null, reto = null, yaTerminado = null
  const marca = r => { const a = avisoDe(r); if (a) { aviso = a; avisa(a) } if (r?.conclusion === 'solo_lectura' || r?.motivo === 'apagado') soloLectura = true }

  function vuelca() {
    const s = cliente.estado
    if (!s) return null
    const v = vistaDe(s, { pendientes: cliente.pendientes() })
    const pares = new Set([...Object.keys(pairState.current), ...v.posiciones.map(p => p.pair), ...v.ordenes.map(o => o.pair)])
    for (const par of pares) {
      const ps = pairState.current[par] ??= { engine: null, ready: false, positions: [], trades: [], orders: [] }
      const d = delPar(v, par)
      ps.positions = d.posiciones
      ps.orders = d.ordenes
      ps.trades = trades.filter(t => t.pair === par)
    }
    alSaldo(v.saldo)
    // el reto ya terminado al abrir la pagina (el primer estado leido): sus modales no se vuelven a abrir
    if (yaTerminado == null) yaTerminado = v.reto != null && v.reto.estado === 'breach'
    reto = v.reto ? estadoRetoV1({ vista: v, sesion, trades, yaTerminado, pasada: hija != null || (v.reto.estado === 'superada' && s.terminal != null) }) : null
    if (reto) alReto(reto)
    alCambio(v)
    return v
  }
  const releeTrades = async () => { try { trades = (await leeTrades()) ?? trades } catch {} }

  // una sola vez (la pagina y la carga de velas la esperan)
  let arrancada = null
  const arranca = () => (arrancada ??= arrancaYa())
  async function arrancaYa() {
    const t = await cliente.toma()
    if (!t.ok) marca({ conclusion: t.http === 409 ? 'usar_aqui' : t.http === 503 ? 'mantenimiento' : 'incierto', motivo: t.motivo })
    const e = await cliente.leeEstado()
    if (e && e.http !== 200) marca({ conclusion: e.http === 409 ? 'solo_lectura' : e.http === 503 ? 'mantenimiento' : 'incierto', motivo: e.cuerpo?.motivo })
    try { hija = await buscaHija() } catch {}
    await releeTrades()
    return vuelca()
  }

  async function envia({ tipo, carga }) {
    if (soloLectura) { avisa(aviso ?? MENSAJE.solo_lectura); return { conclusion: 'solo_lectura' } }
    const r = await cliente.envia(tipo, carga)
    marca(r)
    if (r.conclusion === 'rechazado') avisa('El simulador ha rechazado la operación.')
    await releeTrades()
    vuelca()
    return r
  }

  function avance({ engine, espera = async () => {} }) {
    return creaAvance({
      cliente,
      tiempos: () => engine()?.candles?.map(c => c.time) ?? [],
      alAnimar: async ts => { for (const t of ts) { const e = engine(); if (!e) return; e.seekToTime(t); await espera() } },
      alParada: async () => { await releeTrades(); vuelca() },
    })
  }

  async function pasaFase() {
    if (soloLectura) return { conclusion: 'solo_lectura' }
    const ultima = (reto?.evaluation?.phase ?? 1) >= (reto?.config?.phases ?? 1)
    const hijaId = ultima ? null : nuevoId()
    const r = await cliente.pasaFase({ hijaId })
    marca(r)
    if (r.conclusion === 'confirmado') hija = hijaId ?? 'completado'
    await releeTrades()
    vuelca()
    return { ...r, hija: r.conclusion === 'confirmado' ? hijaId : null }
  }

  return {
    cliente, arranca, vuelca, envia, avance, pasaFase,
    estadoReto: () => reto,
    cursor: () => cursorDe(cliente.estado),
    get soloLectura() { return soloLectura },
    get aviso() { return aviso },
    get hija() { return hija },
  }
}

// el transporte del navegador: fetch con el token de Supabase (como ChallengeSetupModal); el GET lleva el cuerpo en la query
export function llamaConFetch(supabase) {
  return async (ruta, { metodo = 'POST', cuerpo = {} } = {}) => {
    const { data } = await supabase.auth.getSession()
    const token = data?.session?.access_token
    const cabeceras = { Authorization: `Bearer ${token}` }
    const r = metodo === 'GET'
      ? await fetch(`${ruta}?${new URLSearchParams(cuerpo)}`, { method: 'GET', headers: cabeceras })
      : await fetch(ruta, { method: metodo, headers: { ...cabeceras, 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) })
    let c = null
    try { c = await r.json() } catch {}
    return { http: r.status, cuerpo: c }
  }
}
