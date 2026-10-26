// LA PANTALLA V1 SIN REACT (etapa 2 del motor, pieza 6; ordenes 1-125 y 1-127 del CTO). Une el cliente de comandos
// (cliente.js), la vista (vista.js), el reto (hud.js) y el avance (avance.js) con lo que la pagina de hoy ya pinta:
// pairState (las posiciones, pendientes y trades de cada par), el saldo y el estado del reto. components/useSesionV1.js
// la monta.
// SIMMOTOR1-01 (Astra): nada se cierra, se llena ni se quema en el navegador: checkSLTP, checkLimitOrders, rutaComun y
// cierreEnVela no corren (las guardas estan en los hooks). Lo que se pinta sale del estado CONFIRMADO del servidor, con
// dos excepciones de la orden 1-127, que solo PINTAN lo que el servidor ya dijo o lo que acaba de hacer el alumno:
//   · OPTIMISTA (1): la accion del alumno (abrir, la limit, el tirador, el parcial, el cierre, cancelar) se pinta al
//     instante, encima de lo confirmado, mientras su comando esta en vuelo; al resolverse se quita y queda lo confirmado.
//     Un rechazo vuelve asi a lo confirmado, con «El simulador ha rechazado la operación.». Nunca SL/TP, fills ni breach.
//     Un id provisional (v1-N) se cambia por el del servidor antes de mandar un comando que lo use.
//   · EL PLAY POR VELAS (3): mientras la animacion va por detras del cursor confirmado, la base pintada es la de antes del
//     tramo, y cada parada del recibo (fill, cierre, breach, con sus datos y el saldo del motor: lib/servidor/comando.mjs
//     paradasDe) se aplica en SU vela; al alcanzar el cursor, lo confirmado.
//   arranca()          toma el escritor y lee el estado; con 503 apagado (o solo lectura), solo lectura con aviso:
//                      nunca vuelve al calculo local
//   vuelca()           de lo pintado (confirmado o el punto de la animacion) a pairState, el saldo y el reto
//   envia({tipo,carga}, extra)  una orden del alumno; extra: lo que el servidor no sabe aun para pintarla (la entrada que
//                      enseña el modal y la hora: { entry, openTime, createdTime })
//   avance({ engine, espera, par })  Step, Play y Go to (avance.js) sobre las velas del par visible; el Play anima a su ritmo
//                      (espera); el Step y el Go to, sin esperas (como hoy)
//   pasaFase()         /api/sim/avanzar-fase; la hija (si la hay) para navegar a ella
import { creaCliente } from './cliente'
import { vistaDe, delPar } from './vista'
import { estadoRetoV1 } from './hud'
import { creaAvance, cursorDe } from './avance'

// ORDEN 1-127 (2): los avisos nuevos, cortos (mantenimiento es el texto de hoy)
export const MENSAJE = Object.freeze({
  apagado: 'El simulador está en pausa: sesión en solo lectura.',
  solo_lectura: 'Sesión en solo lectura.',
  usar_aqui: 'Esta sesión está abierta en otra pestaña.',
  mantenimiento: 'Las operaciones están en pausa: el simulador no acepta operaciones ahora.',
  rechazado: 'El simulador ha rechazado la operación.',
  incierto: 'No se ha podido confirmar la operación.',
  avance: 'No se ha podido confirmar el avance.',
})
const RECHAZOS = new Set(['rechazado', 'conflicto', 'caducado', 'invalido'])
export const avisoDe = r => (r?.motivo === 'apagado' ? MENSAJE.apagado
  : ['solo_lectura', 'usar_aqui', 'mantenimiento', 'incierto'].includes(r?.conclusion) ? MENSAJE[r.conclusion]
    : RECHAZOS.has(r?.conclusion) ? MENSAJE.rechazado : null)

const conBarra = par => (par.includes('/') ? par : `${par.slice(0, 3)}/${par.slice(3)}`)
const digitos = pair => (pair.endsWith('JPY') ? 3 : 5)
const pipsEntre = (a, b, pair) => (a == null || b == null ? null : Math.round(Math.abs(a - b) * 10 ** digitos(pair)) / 10)
const num = x => (x == null ? null : Number(x))
const lotesN = x => Math.round(Number(x) * 100) / 100
const µaUsd = t => { const v = BigInt(t), neg = v < 0n, a = neg ? -v : v; return Number(`${neg ? '-' : ''}${a / 1000000n}.${(a % 1000000n).toString().padStart(6, '0')}`) }
const r6 = x => Math.round(x * 1e6) / 1e6
// orden 1-129 B4: un precio del motor sin el spread (lo que enseña la pantalla de hoy), redondeado a los decimales del par
const sinSpread = (x, sp, pair) => (x == null || !sp ? x : Number((Number(x) - sp).toFixed(digitos(pair))))
const idsDe = s => { const c = s?.estado?.esquema === 'reto@1' ? s.estado.motor : s?.estado; return new Set([...(c?.posiciones ?? []).map(p => p.id), ...(c?.ordenes ?? []).map(o => o.id)]) }

// (3) las paradas de una vela sobre la vista pintada: el fill quita su pendiente y abre su posicion (con el SL/TP de la
// pendiente, el precio y los lotes del recibo); el cierre quita (o reduce) su posicion; el saldo, el del motor tras ellas
export function aplicaParadas(v, eventos) {
  let posiciones = v.posiciones.map(p => ({ ...p })), ordenes = v.ordenes.map(o => ({ ...o })), saldo = v.saldo
  for (const e of eventos ?? []) {
    if (e.tipo === 'fill') {
      const o = ordenes.find(x => x.id === e.orden)
      if (o) {
        ordenes = ordenes.filter(x => x !== o)
        // orden 1-129 B4: el BUY llena al ask; se enseña sin spread (como la posicion confirmada, vista.js)
        const entry = e.precio != null ? (o.side.startsWith('BUY') ? sinSpread(e.precio, v.spreads?.[o.pair], o.pair) : Number(e.precio)) : o.entry
        posiciones.push({ id: e.posicion, pair: o.pair, side: o.side.split('_')[0], entry, sl: o.sl, tp: o.tp, lots: e.lotes != null ? Number(e.lotes) : o.lots,
          slPips: pipsEntre(entry, o.sl, o.pair), tpPips: pipsEntre(entry, o.tp, o.pair), openTime: e.t, initialSlPips: pipsEntre(entry, o.sl, o.pair), flotante: null })
      }
    } else if (e.tipo === 'cierre') {
      const p = posiciones.find(x => x.id === e.posicion)
      if (p) {
        const quedan = lotesN(p.lots - Number(e.lotes ?? p.lots))
        posiciones = quedan > 0 ? posiciones.map(x => (x === p ? { ...p, lots: quedan } : x)) : posiciones.filter(x => x !== p)
      }
    }
    if (e.saldo_µ != null) saldo = µaUsd(e.saldo_µ)
  }
  return { ...v, posiciones, ordenes, saldo }
}

// (4) las lineas de las pendientes en el grafico, como confirmLimitOrder de hoy (useTradingActions.js): entrada, SL y TP
// con createPriceLine y la etiqueta en el eje, los mismos colores, estilos y titulos. Sincroniza las que pinta la pantalla
// v1 (cr.lineasV1: clave → firma) con las pendientes del par: crea, mueve (quita y crea) y quita.
const ESTILO = { _entry: ['rgba(180,180,180,0.5)', 0], _sl: ['rgba(239,83,80,0.4)', 2], _tp: ['rgba(30,144,255,0.4)', 2] }
export function lineasDeOrdenes(cr, ordenes) {
  if (!cr?.series) return
  cr.priceLines ??= {}
  const firmas = (cr.lineasV1 ??= {})
  const quiero = {}
  for (const o of ordenes ?? []) {
    quiero[o.id + '_entry'] = { price: o.entry, title: `${String(o.side).startsWith('BUY') ? 'B' : 'S'}.LIM ${o.lots}L` }
    if (o.sl != null) quiero[o.id + '_sl'] = { price: o.sl, title: 'SL' }
    if (o.tp != null) quiero[o.id + '_tp'] = { price: o.tp, title: 'TP' }
  }
  const firma = q => `${q.price}|${q.title}`
  for (const k of Object.keys(firmas)) {
    if (quiero[k] && firmas[k] === firma(quiero[k])) continue
    try { cr.series.removePriceLine(cr.priceLines[k]) } catch {}
    delete cr.priceLines[k]; delete firmas[k]
  }
  for (const [k, q] of Object.entries(quiero)) {
    if (k in firmas) continue
    const [color, lineStyle] = ESTILO[k.slice(k.lastIndexOf('_'))]
    try { cr.priceLines[k] = cr.series.createPriceLine({ price: q.price, color, lineWidth: 1, lineStyle, axisLabelVisible: true, title: q.title }); firmas[k] = firma(q) } catch {}
  }
}

export function creaPantallaV1({ sessionId, sesion, usuario, llama, local = null, almacenSesion = null, nuevoId, pairState,
  alSaldo = () => {}, alCambio = () => {}, alReto = () => {}, avisa = () => {}, leeTrades = async () => [], buscaHija = async () => null, plazoMs = null }) {
  const cliente = creaCliente({ sessionId, usuario, epoca: sesion?.epoca ?? 1, llama, local, sesion: almacenSesion, nuevoId, plazoMs })
  let trades = [], hija = null, soloLectura = false, aviso = null, reto = null
  // orden 1-129 B1: el status de la fila (como hoy, el reconocimiento del reto quemado lo deja en failed_dd_*)
  let statusFila = sesion?.status ?? null
  // orden 1-129 B3: las pendientes que dibujan lineas de precio (las de confirmLimitOrder, como hoy; no las del OrderModal)
  const conLineas = new Set()
  // opt: las acciones del alumno en vuelo (optimistas); mapa: id provisional → id del servidor; creadores: el abrir de
  // cada id provisional; inter: lo pintado mientras la animacion va por detras del cursor ({ v, t }); pintada: la ultima
  // base pintada (sin lo optimista)
  let opt = [], nOp = 0, inter = null, pintada = null
  const mapa = new Map(), creadores = new Map()
  const marca = r => { const a = avisoDe(r); if (a) { aviso = a; avisa(a) } if (r?.conclusion === 'solo_lectura' || r?.motivo === 'apagado') soloLectura = true }

  // una accion optimista sobre pairState; devuelve lo que mueve el saldo (solo el cierre total: el flotante que el
  // servidor ya valoro de esa posicion)
  function aplicaOp(op, v = null) {
    const { tipo, carga } = op.cmd, x = op.extra ?? {}
    const P = pairState.current
    const de = par => (P[par] ??= { engine: null, ready: false, positions: [], trades: [], orders: [] })
    if (tipo === 'abrir') {
      const pair = conBarra(carga.par), sl = num(carga.sl), tp = num(carga.tp), lots = lotesN(carga.lotes)
      if (carga.orden === 'mercado') {
        if (x.entry == null) return 0
        const entry = Number(x.entry), ps = de(pair)
        ps.positions = [...(ps.positions ?? []), { id: op.id, pair, side: carga.lado, entry, sl, tp, lots, slPips: pipsEntre(entry, sl, pair), tpPips: pipsEntre(entry, tp, pair),
          openTime: x.openTime ?? null, initialSlPips: pipsEntre(entry, sl, pair), flotante: null }]
      } else {
        const entry = Number(carga.precio), ps = de(pair)
        ps.orders = [...(ps.orders ?? []), { id: op.id, pair, side: `${carga.lado}_${carga.orden === 'stop' ? 'STOP' : 'LIMIT'}`, entry, sl, tp, lots,
          slPips: pipsEntre(entry, sl, pair), tpPips: pipsEntre(entry, tp, pair), createdTime: x.createdTime ?? x.openTime ?? null }]
      }
      return 0
    }
    const ids = [carga.id, mapa.get(carga.id)].filter(Boolean)
    for (const ps of Object.values(P)) {
      const pos = ps?.positions?.find(p => ids.includes(p.id)), ord = pos ? null : ps?.orders?.find(o => ids.includes(o.id))
      if (!pos && !ord) continue
      if (tipo === 'modificar') {
        const n = { ...(pos ?? ord) }
        if ('precio' in carga && ord) n.entry = Number(carga.precio)
        for (const k of ['sl', 'tp']) if (k in carga) n[k] = num(carga[k])
        n.slPips = pipsEntre(n.entry, n.sl, n.pair); n.tpPips = pipsEntre(n.entry, n.tp, n.pair)
        if (pos) ps.positions = ps.positions.map(p => (p === pos ? n : p))
        else ps.orders = ps.orders.map(o => (o === ord ? n : o))
      } else if (tipo === 'cancelar' && ord) ps.orders = ps.orders.filter(o => o !== ord)
      else if (tipo === 'cerrar' && pos) {
        // orden 1-129 B2: la fila del trade, al instante, como closePosition/closePartial de hoy (el trade en memoria antes
        // de guardar): la salida y la hora que manda la pagina (extra.exit, extra.closeTime; si no, el bid confirmado y el
        // cursor) y el pnl que el SERVIDOR ya valoro (el flotante; proporcional en un parcial). Nada se calcula aqui
        const parcial = carga.lotes != null, l = parcial ? lotesN(carga.lotes) : pos.lots
        const pnl = Number.isFinite(pos.flotante) ? r6(pos.flotante * (parcial ? l / pos.lots : 1)) : null
        const fila = { ...pos, id: op.id, lots: l, exit: x.exit ?? v?.cotizaciones?.[pos.pair]?.bid ?? null, closeTime: x.closeTime ?? v?.cursor ?? null,
          pnl, result: pnl == null ? null : pnl > 0 ? 'WIN' : pnl < 0 ? 'LOSS' : 'BREAKEVEN', reason: parcial ? 'PARTIAL' : (x.reason ?? 'MANUAL'), optimista: true }
        ps.trades = [...(ps.trades ?? []), fila]
        if (parcial) {
          const quedan = lotesN(pos.lots - Number(carga.lotes))
          ps.positions = quedan > 0 ? ps.positions.map(p => (p === pos ? { ...pos, lots: quedan } : p)) : ps.positions.filter(p => p !== pos)
          return 0
        }
        ps.positions = ps.positions.filter(p => p !== pos)
        return Number.isFinite(pos.flotante) ? pos.flotante : 0
      }
      return 0
    }
    return 0
  }

  // pinta una vista (la confirmada o la de la animacion, hasta la vela t) y, encima, lo optimista
  function pinta(v, t = null) {
    pintada = v
    // orden 1-129 B4: la fila del trade con la entrada sin spread (el motor guarda el ask del BUY en sim_trades)
    const tr = (t == null ? trades : trades.filter(x => x.closeTime == null || x.closeTime <= t))
      .map(x => (x.side === 'BUY' && v.spreads?.[x.pair] ? { ...x, entry: sinSpread(x.entry, v.spreads[x.pair], x.pair) } : x))
    const pares = new Set([...Object.keys(pairState.current), ...v.posiciones.map(p => p.pair), ...v.ordenes.map(o => o.pair)])
    for (const par of pares) {
      const ps = pairState.current[par] ??= { engine: null, ready: false, positions: [], trades: [], orders: [] }
      const d = delPar(v, par)
      ps.positions = d.posiciones.map(p => ({ ...p }))
      ps.orders = d.ordenes.map(o => ({ ...o }))
      ps.trades = tr.filter(x => x.pair === par)
    }
    let delta = 0
    for (const op of opt) delta += aplicaOp(op, v) || 0
    alSaldo(v.saldo == null ? null : r6(v.saldo + delta))
    const s = cliente.estado
    reto = v.reto ? estadoRetoV1({ vista: v, sesion, trades: tr, pasada: hija != null || (v.reto.estado === 'superada' && s?.terminal != null), statusFila }) : null
    if (reto) alReto(reto)
    alCambio(v)
    return v
  }
  const confirmada = () => (cliente.estado ? vistaDe(cliente.estado, { pendientes: cliente.pendientes() }) : null)
  function vuelca() {
    if (inter) return pinta(inter.v, inter.t)
    const v = confirmada()
    return v ? pinta(v) : null
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

  async function envia({ tipo, carga }, extra = {}) {
    if (soloLectura) { avisa(aviso ?? MENSAJE.solo_lectura); return { conclusion: 'solo_lectura' } }
    const op = { id: `v1-${++nOp}`, cmd: { tipo, carga: { ...carga } }, extra }
    opt.push(op)
    vuelca()
    const corre = async () => {
      const id = op.cmd.carga.id
      // un id provisional: se espera a su abrir y se manda con el del servidor (si no llego, no hay nada que mandar)
      if (typeof id === 'string' && id.startsWith('v1-')) {
        await creadores.get(id)?.catch(() => {})
        if (!mapa.has(id)) return { conclusion: 'rechazado', motivo: 'sin_confirmar' }
        op.cmd.carga = { ...op.cmd.carga, id: mapa.get(id) }
      }
      const antes = tipo === 'abrir' ? idsDe(cliente.estado) : null
      const r = await cliente.envia(tipo, op.cmd.carga)
      if (antes && r.conclusion === 'confirmado') { const nuevos = [...idsDe(cliente.estado)].filter(i => !antes.has(i)); if (nuevos.length === 1) mapa.set(op.id, nuevos[0]) }
      return r
    }
    if (extra.lineas) conLineas.add(op.id)
    const prom = corre()
    if (tipo === 'abrir') creadores.set(op.id, prom)
    let r
    try { r = await prom } finally { opt = opt.filter(o => o !== op); if (conLineas.delete(op.id) && mapa.has(op.id)) conLineas.add(mapa.get(op.id)) }
    marca(r)
    // una orden confirmada ocurre en el cursor confirmado: lo pintado pasa a ser lo confirmado
    if (r.conclusion === 'confirmado') inter = null
    await releeTrades()
    vuelca()
    return r
  }

  function avance({ engine, espera = async () => {}, par = () => null }) {
    // el Play anima a su ritmo; el Step y el Go to, sin esperas (el Go to pinta al llegar, como hoy)
    let modo = null
    // antes de que el servidor confirme un tramo nuevo, lo pintado se queda como base hasta que la animacion lo alcance
    const fija = () => { if (!inter && pintada) inter = { v: pintada, t: cursorDe(cliente.estado) } }
    const cli = {
      get estado() { return cliente.estado },
      leeEstado: (...a) => cliente.leeEstado(...a),
      recupera: async () => { fija(); return cliente.recupera() },
      envia: async (tipo, carga) => { fija(); return cliente.envia(tipo, carga) },
    }
    const av = creaAvance({
      cliente: cli,
      par,
      tiempos: () => engine()?.candles?.map(c => c.time) ?? [],
      alAnimar: async ts => {
        const e = engine(); if (!e || !ts.length) return
        if (modo === 'goto') { e.seekToTime(ts.at(-1)); return }
        for (const t of ts) { const e2 = engine(); if (!e2) return; e2.seekToTime(t); if (modo === 'play') await espera() }
      },
      alParada: async ({ t, eventos }) => {
        await releeTrades()
        if (inter) inter = { v: aplicaParadas(inter.v, eventos), t }
        vuelca()
      },
      alMostrado: async visto => {
        const c = cursorDe(cliente.estado)
        if (inter && c != null && visto != null && visto >= c) { inter = null; vuelca() }
      },
    })
    const con = (m, f) => async (...a) => { modo = m; try { return await f(...a) } finally { if (modo === m) modo = null } }
    return {
      paso: con('paso', av.paso), irA: con('goto', av.irA), play: con('play', av.play),
      pausa: () => av.pausa(),
      get reproduciendo() { return av.reproduciendo },
      get mostrado() { return av.mostrado },
    }
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
    // orden 1-129 B3: ¿dibuja lineas de precio esta pendiente? (solo las de confirmLimitOrder, como hoy)
    conLineas: id => conLineas.has(id),
    // orden 1-129 B1: el servidor marco la fila (el reto quemado reconocido); el reto lo enseña ya cerrado
    marcaFila: status => { statusFila = status ?? statusFila; vuelca() },
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
