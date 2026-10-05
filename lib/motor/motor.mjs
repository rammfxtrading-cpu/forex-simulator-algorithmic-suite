// lib/motor/motor.mjs — el motor de UN instrumento (especificacion v2.1).
// Puro: (estado, comando, velas) → { estado, eventos, resultado }. No toca la
// base, ni la red, ni el reloj, ni nada en uso. Multipar, reto completo,
// conversion de cruces y persistencia: fuera (CTO, 5-oct-2026).
//
// Mercado (§ 2.1): velas BID; ask = bid + spread de la tabla de costes.
//   BUY abre a ask y sale a bid; SELL abre a bid y sale a ask.
//   BUY LIMIT: ask ≤ limite · SELL LIMIT: bid ≥ limite
//   BUY STOP:  ask ≥ stop   · SELL STOP:  bid ≤ stop
//   SL/TP de un largo, en bid; de un corto, en ask.
// Una vela (§ 3.2–3.4, § 12.3): la APERTURA (lo atravesado en el hueco se
// ejecuta ahi: fill al lado ejecutable y proteccion en el acto al de salida),
// y tres tramos monotonos por dos caminos, A = O→H→L→C y B = O→L→H→C,
// recorridos TICK A TICK (los niveles, que estan en la rejilla, se tocan
// exactos). En cada precio: primero las protecciones (por seq), luego las
// ordenes (por seq); despues la equity contra los limites. Se elige el camino
// peor para la cartera del par: equity minima; a igualdad, equity al cierre; a
// igualdad, B. Si los dos dan eventos distintos, la vela es AMBIGUA: todos sus
// eventos llevan ambigua: true y causa_ambiguedad.
// Dinero (§ 3.7, § 12.5): µUSD enteros; comision entera al abrir y asignada en
// los cierres; P&L con residuo por posicion; equity = saldo + flotante
// redondeado como si se cerrase ahi; breach = primer tick con equity < limite
// (estricto), liquidacion ahi, ordenes canceladas e irreversible.
// Comandos (§ 2.2): en cursor + 60, con la cotizacion del cierre del cursor.
import * as Q from './racional.mjs'
import { usdAMicro, comisionApertura, asignaComision, cierreConResiduo, redondeaAlPar } from './dinero.mjs'
import { instrumento, aTicks, deTicks, aCentesimas, pnlUSD, precio as precioR, VERSION as VERSION_INSTR } from './instrumentos.mjs'
import { spreadTicks } from './costes.mjs'

export const VERSION = 'motor@1'
export const ESQUEMA = 'sim-estado@1'

// ── velas y textos ─────────────────────────────────────────────────────────
// filas con precios en texto o numero → velas en ticks (BigInt), validadas
export function velas(par, filas) {
  const { digitos } = instrumento(par)
  const t = x => aTicks(par, typeof x === 'number' ? x.toFixed(digitos) : String(x))
  let previo = -Infinity
  return filas.map((f, i) => {
    if (!Number.isInteger(f.time) || f.time % 60 !== 0 || f.time <= previo) throw new RangeError(`vela ${i}: time no valido o desordenado (${f.time})`)
    previo = f.time
    const v = { time: f.time, open: t(f.open), high: t(f.high), low: t(f.low), close: t(f.close) }
    const max = v.open > v.close ? v.open : v.close, min = v.open < v.close ? v.open : v.close
    if (v.high < max || v.low > min) throw new RangeError(`vela ${i}: OHLC incoherente`)
    return Object.freeze(v)
  })
}
export const precioTexto = (par, ticks) => (ticks == null ? undefined : deTicks(par, ticks))

// ── estado ─────────────────────────────────────────────────────────────────
export function crea({ par, costes, capital, limites = [], apalancamiento = 100 }) {
  const i = instrumento(par)
  if (i.conversion !== null && i.conversion !== par) throw new RangeError(`${par}: un cruce necesita otro par para convertir (motor multipar, no este)`)
  const µ = txt => usdAMicro(Q.deDecimal(txt))
  const capital_µ = µ(capital)
  return {
    esquema: ESQUEMA,
    versiones: { motor: VERSION, instrumentos: VERSION_INSTR, costes: costes.version },
    par,
    costes: { version: costes.version, spread_ticks: spreadTicks(costes, par), comision_lote_µ: costes.comision_lote_µ, swap_µ: costes.swap_µ },
    apalancamiento: BigInt(apalancamiento),
    capital_inicial_µ: capital_µ,
    saldo_µ: capital_µ,
    limites: limites.map(l => ({ regla: String(l.regla), limite_µ: µ(l.limite) })),
    reloj: { cursor: null, fin_de_datos_emitido: false },
    cotizacion: null,
    siguiente_seq: 1,
    posiciones: [],
    ordenes: [],
    estado: 'activo',
    breach: null,
  }
}

// ── serializacion y comparador ─────────────────────────────────────────────
// JSON canonico (claves ordenadas); BigInt como { "$b": "…" }
function canonico(x) {
  if (typeof x === 'bigint') return { $b: String(x) }
  if (Array.isArray(x)) return x.map(canonico)
  if (x && typeof x === 'object') return Object.fromEntries(Object.keys(x).sort().map(k => [k, canonico(x[k])]))
  return x
}
export const serializa = estado => JSON.stringify(canonico(estado))
export const deserializa = texto => JSON.parse(texto, (k, v) => (v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 1 && typeof v.$b === 'string') ? BigInt(v.$b) : v)
// equivalencia sobre la proyeccion ECONOMICA (§ 12.4): el estado del motor no
// lleva ids de transporte (los de comando viven en el recibo), asi que la
// proyeccion es el estado entero en forma canonica
export const proyeccion = estado => serializa(estado)
export const equivalentes = (a, b) => proyeccion(a) === proyeccion(b)

// ── precios y dinero de una posicion ─────────────────────────────────────────
const askDe = (e, bid) => bid + e.costes.spread_ticks
const salidaDe = (e, pos, bid) => (pos.lado === 'BUY' ? bid : askDe(e, bid))
const conversion = (e, bid) => (instrumento(e.par).conversion === e.par ? bid : null)
const pnlExacto = (e, pos, lotesC, salida, bid) => pnlUSD(e.par, pos.lado, lotesC, pos.entrada, salida, conversion(e, bid))
const R = o => Q.R(BigInt(o.n), BigInt(o.d))       // tras deserializar o clonar

// flotante de una posicion en µ, como si se cerrase entera ahora (residuo)
function flotantePos_µ(e, pos, bid) {
  const exacto = Q.suma(R(pos.pnl_exacto_cerrado), pnlExacto(e, pos, pos.lotes_c, salidaDe(e, pos, bid), bid))
  return usdAMicro(exacto) - pos.pnl_redondeado_cerrado_µ
}
export const equity_µ = (e, bid) => e.posiciones.reduce((a, p) => a + flotantePos_µ(e, p, bid), e.saldo_µ)
export function flotante_µ(e) { return e.cotizacion ? equity_µ(e, e.cotizacion.bid) - e.saldo_µ : 0n }

// margen requerido (1:100) en µ: nocional en USD / apalancamiento
function margen_µ(e, lotesC, entrada) {
  const { contrato, conversion: conv } = instrumento(e.par)
  const unidades = Q.R(lotesC * contrato, 100n)
  const nocional = conv === e.par ? unidades : Q.por(unidades, precioR(e.par, entrada))   // USD base: ya en USD
  return redondeaAlPar(Q.entre(Q.por(nocional, Q.R(1_000_000n)), Q.R(e.apalancamiento)))
}
const margenUsado_µ = e => e.posiciones.reduce((a, p) => a + margen_µ(e, p.lotes_c, p.entrada), 0n)

// ── operaciones sobre un estado de trabajo (mutable, ya clonado) ────────────
function abrePosicion(e, ev, { lado, lotesC, entrada, sl, tp, en, hueco, orden = null }) {
  const seq = e.siguiente_seq++
  const com = comisionApertura(e.costes, lotesC)
  e.saldo_µ -= com
  const pos = { id: `p${seq}`, seq, lado, lotes_iniciales_c: lotesC, lotes_c: lotesC, entrada, sl, tp, abierta_en: en,
    comision_devengada_µ: com, comision_asignada_µ: 0n, cerrados_c: 0n, pnl_exacto_cerrado: { n: 0n, d: 1n }, pnl_redondeado_cerrado_µ: 0n }
  e.posiciones.push(pos)
  ev.push({ tipo: 'fill', posicion: pos.id, orden, lado, precio: entrada, lotes_c: lotesC, comision_µ: com, hueco: !!hueco, en })
  return pos
}
function cierraPosicion(e, ev, pos, { lotesC, salida, bid, motivo, en, hueco = false }) {
  const exacto = pnlExacto(e, pos, lotesC, salida, bid)
  const r = cierreConResiduo({ exactoPrevio: R(pos.pnl_exacto_cerrado), redondeadoPrevio_µ: pos.pnl_redondeado_cerrado_µ, exactoCierre: exacto })
  const com = asignaComision({ devengada_µ: pos.comision_devengada_µ, asignada_µ: pos.comision_asignada_µ, lotesIniciales: pos.lotes_iniciales_c, cerradosAntes: pos.cerrados_c, lotesCierre: lotesC })
  pos.pnl_exacto_cerrado = { n: r.exactoTotal.n, d: r.exactoTotal.d }
  pos.pnl_redondeado_cerrado_µ = r.redondeadoTotal_µ
  pos.comision_asignada_µ += com
  pos.cerrados_c += lotesC
  pos.lotes_c -= lotesC
  e.saldo_µ += r.pnl_µ                          // la comision ya se cobro al abrir
  if (pos.lotes_c === 0n) e.posiciones = e.posiciones.filter(p => p !== pos)
  ev.push({ tipo: 'cierre', posicion: pos.id, motivo, lado: pos.lado, precio: salida, lotes_c: lotesC, bruto_µ: r.pnl_µ, comision_µ: com, neto_µ: r.pnl_µ - com, hueco: !!hueco, en })
}
function cancelaOrden(e, ev, o, motivo, en) {
  e.ordenes = e.ordenes.filter(x => x !== o)
  ev.push({ tipo: 'orden_cancelada', orden: o.id, motivo, en })
}
const ejecutable = (e, o, bid) => {
  const ask = askDe(e, bid)
  if (o.tipo === 'limit') return o.lado === 'BUY' ? ask <= o.precio : bid >= o.precio
  return o.lado === 'BUY' ? ask >= o.precio : bid <= o.precio
}
const precioEjecucion = (e, lado, bid) => (lado === 'BUY' ? askDe(e, bid) : bid)

// protecciones de las posiciones vivas al precio bid (por seq)
function protecciones(e, ev, bid, en, hueco) {
  for (const pos of [...e.posiciones].sort((a, b) => a.seq - b.seq)) {
    const s = salidaDe(e, pos, bid)
    const largo = pos.lado === 'BUY'
    const sl = pos.sl != null && (largo ? s <= pos.sl : s >= pos.sl)
    const tp = pos.tp != null && (largo ? s >= pos.tp : s <= pos.tp)
    if (sl || tp) cierraPosicion(e, ev, pos, { lotesC: pos.lotes_c, salida: s, bid, motivo: sl ? 'SL' : 'TP', en, hueco })
  }
}
// un precio: protecciones, ordenes (con su proteccion inmediata), limites
function enPrecio(e, ev, bid, en, hueco) {
  protecciones(e, ev, bid, en, hueco)
  for (const o of [...e.ordenes].sort((a, b) => a.seq - b.seq)) {
    if (!ejecutable(e, o, bid)) continue
    const entrada = precioEjecucion(e, o.lado, bid)
    e.ordenes = e.ordenes.filter(x => x !== o)
    // § 12.3: margen revalidado en el fill, por orden de creacion, sin reserva
    if (equity_µ(e, bid) - margenUsado_µ(e) < margen_µ(e, o.lotes_c, entrada)) { ev.push({ tipo: 'orden_cancelada', orden: o.id, motivo: 'margen_insuficiente', en }); continue }
    abrePosicion(e, ev, { lado: o.lado, lotesC: o.lotes_c, entrada, sl: o.sl, tp: o.tp, en, hueco, orden: o.id })
    protecciones(e, ev, bid, en, hueco)       // proteccion activa desde el fill
  }
  return compruebaLimites(e, ev, bid, en)
}
// breach: primer precio con equity < limite (estricto, en µ)
function compruebaLimites(e, ev, bid, en) {
  if (!e.limites.length || e.estado === 'breach') return null
  const eq = equity_µ(e, bid)
  const roto = e.limites.find(l => eq < l.limite_µ)
  if (!roto) return eq
  e.estado = 'breach'
  e.breach = { regla: roto.regla, limite_µ: roto.limite_µ, equity_µ: eq, precio: bid, en }
  ev.push({ tipo: 'breach', regla: roto.regla, limite_µ: roto.limite_µ, equity_µ: eq, precio: bid, en })
  for (const pos of [...e.posiciones].sort((a, b) => a.seq - b.seq)) cierraPosicion(e, ev, pos, { lotesC: pos.lotes_c, salida: salidaDe(e, pos, bid), bid, motivo: 'breach', en })
  for (const o of [...e.ordenes]) cancelaOrden(e, ev, o, 'breach', en)
  return eq
}

// ── una vela por un camino ─────────────────────────────────────────────────
// → { estado, eventos, minimo_µ, cierre_µ }
export function recorre(estado, vela, camino) {
  const e = structuredClone(estado)
  const ev = []
  const vivo = () => e.posiciones.length || e.ordenes.length
  let minimo = equity_µ(e, e.cotizacion?.bid ?? vela.open)
  const mira = bid => { const q = equity_µ(e, bid); if (q < minimo) minimo = q }
  const huecoAbre = e.cotizacion != null && vela.open !== e.cotizacion.bid
  if (vivo()) { enPrecio(e, ev, vela.open, { vela: vela.time, tramo: 0, paso: 0, modelado: true }, huecoAbre); mira(vela.open) }
  const puntos = camino === 'A' ? [vela.open, vela.high, vela.low, vela.close] : [vela.open, vela.low, vela.high, vela.close]
  for (let k = 1; k <= 3 && e.estado !== 'breach'; k++) {
    const desde = puntos[k - 1], hasta = puntos[k]
    if (!vivo() || desde === hasta) continue
    const paso = hasta > desde ? 1n : -1n
    let n = 0
    for (let bid = desde + paso; ; bid += paso) {
      n++
      enPrecio(e, ev, bid, { vela: vela.time, tramo: k, paso: n, modelado: true }, false)
      mira(e.estado === 'breach' ? bid : bid)
      if (e.estado === 'breach' || !vivo() || bid === hasta) break
    }
  }
  if (e.estado === 'breach') minimo = minimo < e.breach.equity_µ ? minimo : e.breach.equity_µ
  e.cotizacion = { bid: e.estado === 'breach' ? e.breach.precio : vela.close, en: vela.time }
  e.reloj.cursor = vela.time
  return { estado: e, eventos: ev, minimo_µ: minimo, cierre_µ: equity_µ(e, e.cotizacion.bid) }
}

const firma = ev => JSON.stringify(canonico(ev.map(x => { const { en, ...resto } = x; return resto })))
const resumen = (par, ev) => ev.filter(x => x.tipo === 'cierre' || x.tipo === 'fill' || x.tipo === 'breach').map(x => `${x.tipo === 'cierre' ? x.motivo : x.tipo} ${x.posicion ?? ''} a ${deTicks(par, x.precio)}`.replace('  ', ' ')).join(', ') || 'nada'

function vela1(estado, vela) {
  if (!estado.posiciones.length && !estado.ordenes.length) {
    const e = structuredClone(estado)
    e.cotizacion = { bid: vela.close, en: vela.time }
    e.reloj.cursor = vela.time
    return { estado: e, eventos: [] }
  }
  const a = recorre(estado, vela, 'A'), b = recorre(estado, vela, 'B')
  const elige = a.minimo_µ < b.minimo_µ ? a : b.minimo_µ < a.minimo_µ ? b : a.cierre_µ < b.cierre_µ ? a : b
  if (firma(a.eventos) !== firma(b.eventos)) {
    const cual = elige === a ? 'O→H→L→C' : 'O→L→H→C'
    const hora = new Date(vela.time * 1000).toISOString().slice(0, 16).replace('T', ' ')
    const causa = `la vela ${hora} UTC da eventos distintos segun el orden (O→H→L→C: ${resumen(estado.par, a.eventos)}; O→L→H→C: ${resumen(estado.par, b.eventos)}); se aplica ${cual}, el peor para la cartera de ${estado.par}`
    for (const x of elige.eventos) { x.ambigua = true; x.causa_ambiguedad = causa; x.politica = 'recorrido@1' }
  }
  return { estado: elige.estado, eventos: elige.eventos }
}

// ── comandos ───────────────────────────────────────────────────────────────
const rechazo = (estado, motivo, extra = {}) => ({ estado, eventos: [], resultado: { rechazado: motivo, ...extra } })
const cotizacionDe = e => (e.cotizacion ? { bid: e.cotizacion.bid, ask: askDe(e, e.cotizacion.bid), en: e.cotizacion.en } : null)
function ladoCorrecto(lado, ref, sl, tp) {
  if (lado === 'BUY') return (sl == null || sl < ref) && (tp == null || tp > ref)
  return (sl == null || sl > ref) && (tp == null || tp < ref)
}

export function aplica(estado, comando, velasMercado = []) {
  const par = estado.par
  const leePrecio = x => (x == null || x === '' ? null : aTicks(par, x))
  if (comando.tipo === 'avanzar') {
    if (estado.estado === 'breach') return { estado, eventos: [], resultado: 'aceptado' }
    let e = estado
    const ev = []
    for (const v of velasMercado) {
      if (e.reloj.cursor != null && v.time <= e.reloj.cursor) continue
      if (v.time > comando.hasta) break
      const r = vela1(e, v)
      e = r.estado; ev.push(...r.eventos)
      if (e.estado === 'breach') break
    }
    const ultima = velasMercado.at(-1)
    if (e.estado !== 'breach' && ultima && e.reloj.cursor === ultima.time && !e.reloj.fin_de_datos_emitido) {
      if (e === estado) e = structuredClone(estado)
      e.reloj.fin_de_datos_emitido = true
      ev.push({ tipo: 'fin_de_datos', en: { t: ultima.time + 60 } })
    }
    return { estado: e, eventos: ev, resultado: 'aceptado' }
  }

  if (estado.estado === 'breach') return rechazo(estado, 'sesion_en_breach')
  if (!estado.cotizacion) return rechazo(estado, 'sin_cotizacion')
  const bid = estado.cotizacion.bid
  const en = { t: estado.reloj.cursor + 60 }
  const e = structuredClone(estado)
  const ev = []
  try {
    if (comando.tipo === 'abrir') {
      const lado = comando.lado
      if (lado !== 'BUY' && lado !== 'SELL') return rechazo(estado, 'lado_invalido')
      const lotesC = aCentesimas(comando.lotes)
      const sl = leePrecio(comando.sl), tp = leePrecio(comando.tp)
      if (comando.orden === 'mercado') {
        // A17 / § 2.2: la orden a mercado se cotizo con un cursor; si ya no es
        // el vigente, se recotiza: nunca un fill al precio viejo
        if (comando.cotizadoEn !== estado.reloj.cursor) return rechazo(estado, 'precio_cambiado', { cotizacion: cotizacionDe(estado) })
        const entrada = precioEjecucion(e, lado, bid)
        if (!ladoCorrecto(lado, entrada, sl, tp)) return rechazo(estado, 'precio_invalido')
        if (equity_µ(e, bid) - margenUsado_µ(e) < margen_µ(e, lotesC, entrada)) return rechazo(estado, 'margen_insuficiente')
        abrePosicion(e, ev, { lado, lotesC, entrada, sl, tp, en, hueco: false })
        compruebaLimites(e, ev, bid, en)
        return { estado: e, eventos: ev, resultado: 'aceptado' }
      }
      if (comando.orden !== 'limit' && comando.orden !== 'stop') return rechazo(estado, 'tipo_invalido')
      const p = leePrecio(comando.precio)
      if (p == null) return rechazo(estado, 'precio_invalido')
      const o = { id: null, seq: 0, lado, tipo: comando.orden, precio: p, sl, tp, lotes_c: lotesC, creada_en: en }
      if (ejecutable(e, o, bid)) {
        // § 3.3.7 / § 12.3: un stop de entrada ya ejecutable se rechaza; un
        // limit ya ejecutable se llena al precio vigente (igual o mejor)
        if (o.tipo === 'stop') return rechazo(estado, 'stop_ejecutable', { cotizacion: cotizacionDe(estado) })
        const entrada = precioEjecucion(e, lado, bid)
        if (!ladoCorrecto(lado, entrada, sl, tp)) return rechazo(estado, 'precio_invalido')
        if (equity_µ(e, bid) - margenUsado_µ(e) < margen_µ(e, lotesC, entrada)) return rechazo(estado, 'margen_insuficiente')
        abrePosicion(e, ev, { lado, lotesC, entrada, sl, tp, en, hueco: false })
        compruebaLimites(e, ev, bid, en)
        return { estado: e, eventos: ev, resultado: 'aceptado' }
      }
      if (!ladoCorrecto(lado, p, sl, tp)) return rechazo(estado, 'precio_invalido')
      o.seq = e.siguiente_seq++
      o.id = `o${o.seq}`
      e.ordenes.push(o)
      ev.push({ tipo: 'orden_creada', orden: o.id, lado, tipo_orden: o.tipo, precio: p, lotes_c: lotesC, sl, tp, en })
      return { estado: e, eventos: ev, resultado: 'aceptado' }
    }
    if (comando.tipo === 'cancelar') {
      const o = e.ordenes.find(x => x.id === comando.id)
      if (!o) return rechazo(estado, 'no_existe')
      cancelaOrden(e, ev, o, 'alumno', en)
      return { estado: e, eventos: ev, resultado: 'aceptado' }
    }
    if (comando.tipo === 'modificar') {
      const pos = e.posiciones.find(x => x.id === comando.id), o = e.ordenes.find(x => x.id === comando.id)
      if (!pos && !o) return rechazo(estado, 'no_existe')
      const sl = 'sl' in comando ? leePrecio(comando.sl) : (pos ?? o).sl
      const tp = 'tp' in comando ? leePrecio(comando.tp) : (pos ?? o).tp
      if (pos) {
        // la intencion se valida al modificar: del lado correcto del precio de salida
        if (!ladoCorrecto(pos.lado, salidaDe(e, pos, bid), sl, tp)) return rechazo(estado, 'precio_invalido')
        pos.sl = sl; pos.tp = tp
        ev.push({ tipo: 'posicion_modificada', posicion: pos.id, sl, tp, en })
      } else {
        const p = 'precio' in comando ? leePrecio(comando.precio) : o.precio
        const nueva = { ...o, precio: p, sl, tp }
        if (ejecutable(e, nueva, bid) && nueva.tipo === 'stop') return rechazo(estado, 'stop_ejecutable')
        if (!ladoCorrecto(o.lado, p, sl, tp)) return rechazo(estado, 'precio_invalido')
        Object.assign(o, { precio: p, sl, tp })
        ev.push({ tipo: 'orden_modificada', orden: o.id, precio: p, sl, tp, en })
      }
      return { estado: e, eventos: ev, resultado: 'aceptado' }
    }
    if (comando.tipo === 'cerrar') {
      const pos = e.posiciones.find(x => x.id === comando.id)
      if (!pos) return rechazo(estado, 'no_existe')
      const lotesC = comando.lotes == null ? pos.lotes_c : aCentesimas(comando.lotes)
      if (lotesC > pos.lotes_c) return rechazo(estado, 'lotes_invalidos')
      cierraPosicion(e, ev, pos, { lotesC, salida: salidaDe(e, pos, bid), bid, motivo: 'manual', en })
      compruebaLimites(e, ev, bid, en)
      return { estado: e, eventos: ev, resultado: 'aceptado' }
    }
    return rechazo(estado, 'comando_desconocido')
  } catch (err) {
    if (err instanceof RangeError) return rechazo(estado, 'entrada_invalida', { motivo: err.message })
    throw err
  }
}
