// lib/motor/cartera.mjs — el motor de CARTERA multipar (especificacion v2.3.1,
// § 13; Astra diseño-4). Puro: (estado, comando, velasPorPar) → { estado,
// eventos, resultado }. No toca la base, ni la red, ni el reloj. Nada en uso
// lo importa (la web no importa lib/motor/).
//
// Es una implementacion INDEPENDIENTE del motor de un par (motor.mjs, motor@2):
// A37 compara las dos con un solo par.
//
// Un minuto (§ 13.1–13.2):
//   · cada par con exposicion (posiciones u ordenes) y vela elige su camino A
//     o B en una simulacion AISLADA, con los demas pares quietos en la
//     apertura del minuto (§ 13.4, aproximacion declarada);
//   · fase 1: todos los pares a su apertura a la vez; fases 2–4: los tramos
//     del camino elegido, SINCRONIZADOS: el par i da su tick j en la fraccion
//     j/nᵢ y su precio en s es aᵢ + σᵢ·⌊nᵢ·s⌋; los puntos son la union de esas
//     fracciones (comparadas en enteros), mas el s = 0 obligatorio de cada fase;
//   · en cada punto, el orden de § 13.2 (motor@2): protecciones por seq con
//     limites (y objetivo) tras cada cierre; limites antes de la primera
//     apertura (P-23a); cada orden por seq: margen, fill, limites y, sin
//     breach, su proteccion inmediata; limites al final;
//   · conversion a USD siempre con el BID: la apertura del par de conversion
//     en las fases 1–3 y su cierre en la fase 4; el que se convierte con su
//     propio precio, con su bid en el punto (§ 13.2, V3-03);
//   · margen@2: nocional con el bid del par base→USD (en el cursor a mercado,
//     en la apertura del minuto en una pendiente), fijado y proporcional;
//   · V4-02: un minuto en que mas de un par con exposicion se mueve es
//     «modelado»: la marca se acumula en el estado (sesion y cada posicion u
//     orden con exposicion) y llega a sus cierres y al resultado, aunque ese
//     minuto no tenga eventos.
import * as Q from './racional.mjs'
import { usdAMicro, comisionApertura, asignaComision, cierreConResiduo, redondeaAlPar } from './dinero.mjs'
import { instrumento, INSTRUMENTOS, aTicks, deTicks, aCentesimas, pnlUSD, precio as precioR, VERSION as VERSION_INSTR } from './instrumentos.mjs'
import { spreadTicks } from './costes.mjs'
import { serializa, deserializa, velas, precioTexto } from './motor.mjs'
import * as MF from './manifiesto.mjs'
import { marcaHuecos } from './fuente.mjs'

export const ESQUEMA = 'sim-cartera@1'
export const VERSION = 'motor@2'
export const VERSION_MARGEN = 'margen@2'
export const POLITICA = 'camino-sincronizado@1'
export const TOPE = 50
export { serializa, deserializa, velas, precioTexto }

// ── pares de la sesion ──────────────────────────────────────────────────────
// el par base→USD que fija el margen: null con USD como base; el propio par
// con USD cotizado; para un cruce, BASE + 'USD' (AUDCAD → AUDUSD, GBPJPY → GBPUSD)
export function parBaseUsd(par) {
  const i = instrumento(par)
  if (i.conversion === par) return null
  if (i.conversion === null) return par
  const p = par.slice(0, 3) + 'USD'
  if (!INSTRUMENTOS[p]) throw new RangeError(`${par}: no hay par ${p} para el margen`)
  return p
}
const parConversion = par => { const c = instrumento(par).conversion; return c === null || c === par ? null : c }

export function crea({ pares, costes, capital, limites = [], apalancamiento = 100, mercado = null }) {
  const lista = [...new Set(pares)].sort()
  if (!lista.length) throw new RangeError('una cartera necesita al menos un par')
  for (const par of lista) {
    instrumento(par)
    const c = parConversion(par), b = parBaseUsd(par)
    if (c && !lista.includes(c)) throw new RangeError(`${par} se convierte con ${c}: tiene que estar en la sesion`)
    if (b && !lista.includes(b)) throw new RangeError(`${par} fija su margen con ${b}: tiene que estar en la sesion`)
  }
  const µ = txt => usdAMicro(Q.deDecimal(txt))
  const capital_µ = µ(capital)
  return {
    esquema: ESQUEMA,
    versiones: { motor: VERSION, margen: VERSION_MARGEN, politica: POLITICA, instrumentos: VERSION_INSTR, costes: costes.version, ...(mercado ? { mercado: { ...mercado } } : {}) },
    pares: lista,
    costes: { version: costes.version, spread_ticks: Object.fromEntries(lista.map(p => [p, spreadTicks(costes, p)])), comision_lote_µ: costes.comision_lote_µ, swap_µ: costes.swap_µ },
    apalancamiento: BigInt(apalancamiento),
    capital_inicial_µ: capital_µ,
    saldo_µ: capital_µ,
    limites: limites.map(l => ({ regla: String(l.regla), limite_µ: µ(l.limite) })),
    reloj: { cursor: null, fin_de_datos_emitido: false },
    cotizaciones: {},
    siguiente_seq: 1,
    posiciones: [],
    ordenes: [],
    estado: 'activo',
    breach: null,
    objetivo: null,
    sincronizacion: { politica: POLITICA, minutos: 0, primero: null, ultimo: null },
  }
}
// el resumen de la marca, si la sesion tuvo algun minuto modelado (V4-02)
// (con las claves siempre en el mismo orden: el evento no puede depender de si el estado se deserializo)
export const resumenSincronizacion = e => (e.sincronizacion?.minutos > 0 ? { politica: e.sincronizacion.politica, minutos: e.sincronizacion.minutos, primero: e.sincronizacion.primero, ultimo: e.sincronizacion.ultimo } : null)

// ── precios, conversion y dinero ────────────────────────────────────────────
// ctx: { precio: { PAR: bid }, conv: { PAR: bid del par de conversion }, base: { PAR: bid base→USD de apertura } }
const askDe = (e, par, bid) => bid + e.costes.spread_ticks[par]
const salidaDe = (e, pos, bid) => (pos.lado === 'BUY' ? bid : askDe(e, pos.par, bid))
const precioEjecucion = (e, par, lado, bid) => (lado === 'BUY' ? askDe(e, par, bid) : bid)
function convDe(par, ctx) {
  const i = instrumento(par)
  if (i.conversion === null) return null
  if (i.conversion === par) return ctx.precio[par]                    // su propio bid
  const c = ctx.conv[i.conversion]
  if (c == null) throw new RangeError(`${par}: sin cotizacion de ${i.conversion} para convertir`)
  return c
}
const R = o => Q.R(BigInt(o.n), BigInt(o.d))
const pnlExacto = (pos, lotesC, salida, ctx) => pnlUSD(pos.par, pos.lado, lotesC, pos.entrada, salida, convDe(pos.par, ctx))
function flotantePos_µ(e, pos, ctx) {
  const exacto = Q.suma(R(pos.pnl_exacto_cerrado), pnlExacto(pos, pos.lotes_c, salidaDe(e, pos, ctx.precio[pos.par]), ctx))
  return usdAMicro(exacto) - pos.pnl_redondeado_cerrado_µ
}
const equidad = (e, ctx) => e.posiciones.reduce((a, p) => a + flotantePos_µ(e, p, ctx), e.saldo_µ)
// contexto entre minutos (comandos, valoracion): los ultimos bids
function ctxCotizado(e) {
  const precio = Object.fromEntries(Object.entries(e.cotizaciones).map(([p, c]) => [p, c.bid]))
  return { precio, conv: precio, base: precio }
}
export const equity_µ = e => equidad(e, ctxCotizado(e))
export const margenUsado_µ = e => e.posiciones.reduce((a, p) => a + p.margen_fijado_µ - p.margen_liberado_µ, 0n)
function margen_µ(e, par, lotesC, bidBase) {
  const { contrato } = instrumento(par)
  const unidades = Q.R(lotesC * contrato, 100n)
  const b = parBaseUsd(par)
  const nocional = b === null ? unidades : Q.por(unidades, precioR(b, bidBase))
  return redondeaAlPar(Q.entre(Q.por(nocional, Q.R(1_000_000n)), Q.R(e.apalancamiento)))
}

// ── operaciones sobre un estado de trabajo (mutable, ya clonado) ────────────
function abrePosicion(e, ev, { par, lado, lotesC, entrada, sl, tp, en, hueco, orden = null, margen, modelada = false }) {
  const seq = e.siguiente_seq++
  const com = comisionApertura(e.costes, lotesC)
  e.saldo_µ -= com
  const pos = { id: `p${seq}`, seq, par, lado, lotes_iniciales_c: lotesC, lotes_c: lotesC, entrada, sl, tp, abierta_en: en,
    comision_devengada_µ: com, comision_asignada_µ: 0n, cerrados_c: 0n, pnl_exacto_cerrado: { n: 0n, d: 1n }, pnl_redondeado_cerrado_µ: 0n,
    margen_fijado_µ: margen, margen_liberado_µ: 0n, ...(modelada ? { sincronizacion_modelada: true } : {}) }
  e.posiciones.push(pos)
  ev.push({ tipo: 'fill', posicion: pos.id, par, orden, lado, precio: entrada, lotes_c: lotesC, comision_µ: com, hueco: !!hueco, en })
  return pos
}
// P7-02: lo que hereda la posicion de la pendiente que la llena, en TODAS las
// rutas de fill (el avance y el modificar ejecutable): su id y la marca V4-02
const desdePendiente = o => ({ orden: o.id, modelada: !!o.sincronizacion_modelada })
function cierraPosicion(e, ev, pos, { lotesC, salida, ctx, motivo, en, hueco = false }) {
  const exacto = pnlExacto(pos, lotesC, salida, ctx)
  const r = cierreConResiduo({ exactoPrevio: R(pos.pnl_exacto_cerrado), redondeadoPrevio_µ: pos.pnl_redondeado_cerrado_µ, exactoCierre: exacto })
  const com = asignaComision({ devengada_µ: pos.comision_devengada_µ, asignada_µ: pos.comision_asignada_µ, lotesIniciales: pos.lotes_iniciales_c, cerradosAntes: pos.cerrados_c, lotesCierre: lotesC })
  pos.pnl_exacto_cerrado = { n: r.exactoTotal.n, d: r.exactoTotal.d }
  pos.pnl_redondeado_cerrado_µ = r.redondeadoTotal_µ
  pos.comision_asignada_µ += com
  pos.margen_liberado_µ = lotesC === pos.lotes_c ? pos.margen_fijado_µ : pos.margen_liberado_µ + (pos.margen_fijado_µ * lotesC) / pos.lotes_iniciales_c
  pos.cerrados_c += lotesC
  pos.lotes_c -= lotesC
  e.saldo_µ += r.pnl_µ
  if (pos.lotes_c === 0n) e.posiciones = e.posiciones.filter(p => p !== pos)
  ev.push({ tipo: 'cierre', posicion: pos.id, par: pos.par, motivo, lado: pos.lado, precio: salida, lotes_c: lotesC, bruto_µ: r.pnl_µ, comision_µ: com, neto_µ: r.pnl_µ - com, hueco: !!hueco, en, ...(pos.sincronizacion_modelada ? { sincronizacion: 'modelada' } : {}) })
}
function cancelaOrden(e, ev, o, motivo, en) {
  e.ordenes = e.ordenes.filter(x => x !== o)
  ev.push({ tipo: 'orden_cancelada', orden: o.id, par: o.par, motivo, en })
}
const ejecutable = (e, o, bid) => {
  const ask = askDe(e, o.par, bid)
  if (o.tipo === 'limit') return o.lado === 'BUY' ? ask <= o.precio : bid >= o.precio
  return o.lado === 'BUY' ? ask >= o.precio : bid <= o.precio
}
function compruebaLimites(e, ev, ctx, en) {
  if (!e.limites.length || e.estado !== 'activo') return null
  const eq = equidad(e, ctx)
  const roto = e.limites.find(l => eq < l.limite_µ)
  if (!roto) return eq
  const precios = Object.fromEntries(Object.entries(ctx.precio).sort())
  e.estado = 'breach'
  e.breach = { regla: roto.regla, limite_µ: roto.limite_µ, equity_µ: eq, precios, en }
  const resumen = resumenSincronizacion(e)
  ev.push({ tipo: 'breach', regla: roto.regla, limite_µ: roto.limite_µ, equity_µ: eq, precios, en, ...(resumen ? { sincronizacion: resumen } : {}) })
  for (const pos of [...e.posiciones].sort((a, b) => a.seq - b.seq)) cierraPosicion(e, ev, pos, { lotesC: pos.lotes_c, salida: salidaDe(e, pos, ctx.precio[pos.par]), ctx, motivo: 'breach', en })
  for (const o of [...e.ordenes].sort((a, b) => a.seq - b.seq)) cancelaOrden(e, ev, o, 'breach', en)
  return eq
}
function proteccionDe(e, ev, pos, ctx, en, hueco) {
  const s = salidaDe(e, pos, ctx.precio[pos.par])
  const largo = pos.lado === 'BUY'
  const sl = pos.sl != null && (largo ? s <= pos.sl : s >= pos.sl)
  const tp = pos.tp != null && (largo ? s >= pos.tp : s <= pos.tp)
  if (!sl && !tp) return false
  cierraPosicion(e, ev, pos, { lotesC: pos.lotes_c, salida: s, ctx, motivo: sl ? 'SL' : 'TP', en, hueco })
  return true
}
function detiene(e, ev, ctx, en) {
  for (const o of [...e.ordenes].sort((a, b) => a.seq - b.seq)) cancelaOrden(e, ev, o, 'objetivo', en)
  e.estado = 'objetivo'
  e.objetivo = { precios: Object.fromEntries(Object.entries(ctx.precio).sort()), en }
}
// tras un cierre: limites; si la cuenta sigue viva, objetivo → true si hay que parar
function trasCierre(e, ev, ctx, en, alto) {
  compruebaLimites(e, ev, ctx, en)
  if (e.estado !== 'activo') return true
  if (alto && alto(e, ev)) { detiene(e, ev, ctx, en); return true }
  return false
}
// un punto (§ 13.2). huecos: { PAR: true } en la fase 1 si el par abrio en hueco
function punto(e, ev, ctx, en, alto, huecos = {}) {
  for (const pos of [...e.posiciones].sort((a, b) => a.seq - b.seq)) {
    if (!e.posiciones.includes(pos)) continue
    if (proteccionDe(e, ev, pos, ctx, en, !!huecos[pos.par]) && trasCierre(e, ev, ctx, en, alto)) return
  }
  compruebaLimites(e, ev, ctx, en)                     // P-23a
  if (e.estado !== 'activo') return
  for (const o of [...e.ordenes].sort((a, b) => a.seq - b.seq)) {
    if (!e.ordenes.includes(o) || !ejecutable(e, o, ctx.precio[o.par])) continue
    const bid = ctx.precio[o.par]
    const entrada = precioEjecucion(e, o.par, o.lado, bid)
    e.ordenes = e.ordenes.filter(x => x !== o)
    const b = parBaseUsd(o.par)
    const margen = margen_µ(e, o.par, o.lotes_c, b === null ? null : ctx.base[b])
    if (equidad(e, ctx) - margenUsado_µ(e) < margen) { ev.push({ tipo: 'orden_cancelada', orden: o.id, par: o.par, motivo: 'margen_insuficiente', en }); continue }
    const pos = abrePosicion(e, ev, { par: o.par, lado: o.lado, lotesC: o.lotes_c, entrada, sl: o.sl, tp: o.tp, en, hueco: !!huecos[o.par], margen, ...desdePendiente(o) })
    compruebaLimites(e, ev, ctx, en)
    if (e.estado !== 'activo') return
    if (proteccionDe(e, ev, pos, ctx, en, !!huecos[o.par]) && trasCierre(e, ev, ctx, en, alto)) return
  }
  compruebaLimites(e, ev, ctx, en)
}

// ── un minuto ───────────────────────────────────────────────────────────────
const expuestos = e => new Set([...e.posiciones.map(p => p.par), ...e.ordenes.map(o => o.par)])
const vivo = e => e.posiciones.length > 0 || e.ordenes.length > 0
const puntosDe = (v, camino) => (camino === 'A' ? [v.open, v.high, v.low, v.close] : [v.open, v.low, v.high, v.close])
const mcd = (a, b) => (b ? mcd(b, a % b) : a)
const fraccion = (j, n) => { const g = mcd(j, n) || 1; return `${j / g}/${n / g}` }
// el minuto t con los caminos dados; opciones.aislado = par: solo ese par se
// mueve y los demas (precios y conversion) quedan en la apertura del minuto
// → { estado, eventos, minimo_µ, cierre_µ }
function minuto(estado, t, velasMin, caminos, alto, { aislado = null } = {}) {
  const e = structuredClone(estado)
  const ev = []
  const previo = ctxCotizado(e)
  let minimo = equidad(e, previo)
  const mira = ctx => { const q = equidad(e, ctx); if (q < minimo) minimo = q }
  // fase 1: aperturas de todos (o, aislado, de todos: los demas quedan ahi)
  const precio = { ...previo.precio }, huecos = {}
  for (const [par, v] of Object.entries(velasMin)) {
    if (e.cotizaciones[par] != null && v.open !== e.cotizaciones[par].bid) huecos[par] = true
    precio[par] = v.open
  }
  const convAp = { ...previo.conv }, convCi = { ...previo.conv }, base = { ...previo.precio }
  for (const [par, v] of Object.entries(velasMin)) { convAp[par] = v.open; convCi[par] = aislado ? v.open : v.close; base[par] = v.open }
  const ctx = { precio, conv: convAp, base }
  const enDe = (fase, j, n) => ({ vela: t, fase, fraccion: n ? fraccion(j, n) : '0/1', modelado: true })
  const mueven = Object.keys(velasMin).filter(p => (aislado ? p === aislado : true) && caminos[p])
  // V4-02: mas de un par con exposicion que se mueve en el minuto → modelado
  const exp0 = expuestos(e)
  const movidos = aislado ? [] : Object.entries(velasMin).filter(([p, v]) => exp0.has(p) && (v.open !== previo.precio[p] || v.high !== v.open || v.low !== v.open || v.close !== v.open)).map(([p]) => p).sort()
  const modelado = movidos.length > 1
  if (modelado) {
    e.sincronizacion = { ...e.sincronizacion, minutos: e.sincronizacion.minutos + 1, primero: e.sincronizacion.primero ?? t, ultimo: t }
    for (const x of [...e.posiciones, ...e.ordenes]) x.sincronizacion_modelada = true
  }
  if (vivo(e)) { punto(e, ev, ctx, enDe(1, 0, 0), alto, huecos); mira(ctx) }
  for (let k = 1; k <= 3 && e.estado === 'activo'; k++) {
    if (k === 3) ctx.conv = convCi                       // fase 4: conversion con el cierre
    if (!vivo(e)) continue
    compruebaLimites(e, ev, ctx, enDe(k + 1, 0, 0))     // s = 0 obligatorio (V3-03)
    if (e.estado !== 'activo') break
    const exp = expuestos(e)
    const tramos = mueven.filter(p => exp.has(p)).map(p => { const pts = puntosDe(velasMin[p], caminos[p]); const a = pts[k - 1], b = pts[k]; const n = Number(b > a ? b - a : a - b); return { par: p, a, sig: b > a ? 1n : -1n, n, j: 0 } }).filter(x => x.n > 0)
    while (tramos.some(x => x.j < x.n) && e.estado === 'activo' && vivo(e)) {
      // la siguiente fraccion: el minimo de (j+1)/n, comparado en enteros
      let mejor = null
      for (const x of tramos) if (x.j < x.n && (mejor === null || (x.j + 1) * mejor.n < (mejor.j + 1) * x.n)) mejor = x
      const jm = mejor.j + 1, nm = mejor.n
      for (const x of tramos) if (x.j < x.n && (x.j + 1) * nm === jm * x.n) { x.j++; ctx.precio[x.par] = x.a + x.sig * BigInt(x.j) }
      punto(e, ev, ctx, enDe(k + 1, jm, nm), alto)
      mira(ctx)
    }
  }
  if (e.estado === 'breach') minimo = minimo < e.breach.equity_µ ? minimo : e.breach.equity_µ
  if (modelado) {
    for (const p of e.posiciones) p.sincronizacion_modelada = true                    // las abiertas dentro del minuto
    for (const x of ev) if (typeof x.sincronizacion !== 'object') { x.sincronizacion = 'modelada'; x.politica_sincronizacion = POLITICA; x.pares_sincronizados = movidos }
  }
  const fin = e.estado === 'activo'
  for (const [par, v] of Object.entries(velasMin)) e.cotizaciones[par] = { bid: fin ? (aislado && par !== aislado ? v.open : v.close) : ctx.precio[par], en: t }
  e.reloj.cursor = t
  if (fin) { for (const [par, v] of Object.entries(velasMin)) ctx.precio[par] = e.cotizaciones[par].bid }
  return { estado: e, eventos: ev, minimo_µ: minimo, cierre_µ: equidad(e, ctx) }
}

const firma = ev => JSON.stringify(ev.map(x => { const { en, ...resto } = x; return resto }), (k, v) => (typeof v === 'bigint' ? `${v}n` : v))
const resumen = (par, ev) => ev.filter(x => x.tipo === 'cierre' || x.tipo === 'fill' || x.tipo === 'breach').map(x => `${x.tipo === 'cierre' ? x.motivo : x.tipo} ${x.posicion ?? ''}${x.precio != null ? ' a ' + deTicks(x.par ?? par, x.precio) : ''}`.replace('  ', ' ')).join(', ') || 'nada'

// § 13.4: el camino de cada par con exposicion y vela, en simulacion aislada
export function eligeCaminos(estado, t, velasPorPar, { alto = null } = {}) {
  const velasMin = velasDelMinuto(velasPorPar, t)
  const exp = expuestos(estado), r = {}
  for (const par of Object.keys(velasMin).filter(p => exp.has(p)).sort()) {
    const a = minuto(estado, t, velasMin, { [par]: 'A' }, alto, { aislado: par })
    const b = minuto(estado, t, velasMin, { [par]: 'B' }, alto, { aislado: par })
    const camino = a.minimo_µ < b.minimo_µ ? 'A' : b.minimo_µ < a.minimo_µ ? 'B' : a.cierre_µ < b.cierre_µ ? 'A' : 'B'
    r[par] = { camino, minimo_µ: { A: a.minimo_µ, B: b.minimo_µ }, cierre_µ: { A: a.cierre_µ, B: b.cierre_µ }, ambigua: firma(a.eventos) !== firma(b.eventos), eventos: { A: a.eventos, B: b.eventos } }
  }
  return r
}
const velasDelMinuto = (velasPorPar, t) => {
  const r = {}
  for (const [par, vs] of Object.entries(velasPorPar)) { const v = vs.find(x => x.time === t); if (v) r[par] = v }
  return r
}

function avanzaMinuto(e, t, velasPorPar, alto) {
  const velasMin = velasDelMinuto(velasPorPar, t)
  if (!vivo(e)) {
    const x = structuredClone(e)
    for (const [par, v] of Object.entries(velasMin)) x.cotizaciones[par] = { bid: v.close, en: t }
    x.reloj.cursor = t
    return { estado: x, eventos: [] }
  }
  const eleccion = eligeCaminos(e, t, velasPorPar, { alto })
  const caminos = Object.fromEntries(Object.entries(eleccion).map(([p, x]) => [p, x.camino]))
  const r = minuto(e, t, velasMin, caminos, alto)
  const ambiguos = Object.entries(eleccion).filter(([, x]) => x.ambigua)
  if (ambiguos.length) {
    const hora = new Date(t * 1000).toISOString().slice(0, 16).replace('T', ' ')
    const causas = ambiguos.map(([par, x]) => `la vela ${hora} UTC de ${par} da eventos distintos segun el orden (O→H→L→C: ${resumen(par, x.eventos.A)}; O→L→H→C: ${resumen(par, x.eventos.B)}); se aplica ${x.camino === 'A' ? 'O→H→L→C' : 'O→L→H→C'}, el peor para la cartera de ${par}`)
    const pares = new Set(ambiguos.map(([p]) => p))
    for (const x of r.eventos) if (pares.has(x.par) || x.tipo === 'breach') { x.ambigua = true; x.causa_ambiguedad = causas.join('; '); x.politica = 'recorrido@1' }
  }
  explicaDiferencias(eleccion, r)
  return { estado: r.estado, eventos: r.eventos }
}

// P7-05 (§ 13.4): si la ejecucion conjunta difiere de la simulacion aislada del
// camino elegido de un par, causa_ambiguedad lo dice: que evento aislado no
// ocurrio (o cual nuevo aparecio) y por que (margen, breach, objetivo). Es
// independiente de la marca A/B intrapar: no toca «ambigua» y se AÑADE al texto.
// Se comparan fills, cierres y cancelaciones del par, por orden (los ids de
// posicion pueden cambiar entre la aislada y la conjunta) y motivo.
function claves(evs) {
  const deOrden = new Map(evs.filter(x => x.tipo === 'fill' && x.orden).map(x => [x.posicion, x.orden]))
  return evs.filter(x => x.tipo === 'fill' || x.tipo === 'cierre' || x.tipo === 'orden_cancelada').map(x =>
    x.tipo === 'fill' ? `el fill de ${x.orden ?? x.posicion}`
      : x.tipo === 'orden_cancelada' ? `la cancelacion de ${x.orden} (${x.motivo})`
        : `el cierre ${x.motivo} de ${deOrden.has(x.posicion) ? `la posicion de ${deOrden.get(x.posicion)}` : x.posicion}`)
}
function explicaDiferencias(eleccion, r) {
  for (const [par, x] of Object.entries(eleccion)) {
    const aislada = claves(x.eventos[x.camino].filter(y => y.par === par))
    const conjunta = claves(r.eventos.filter(y => y.par === par))
    const falta = aislada.filter(k => !conjunta.includes(k)), nuevo = conjunta.filter(k => !aislada.includes(k))
    if (!falta.length && !nuevo.length) continue
    const porque = r.eventos.some(y => y.par === par && y.motivo === 'margen_insuficiente') ? 'margen insuficiente en la ejecucion conjunta (otro par se lleno antes, con seq menor)'
      : r.eventos.some(y => y.tipo === 'breach') ? 'el breach de la cuenta en la ejecucion conjunta'
        : r.estado.estado === 'objetivo' ? 'el objetivo alcanzado en la ejecucion conjunta'
          : 'los movimientos sincronizados de los otros pares'
    const texto = `la ejecucion conjunta difiere de la simulacion aislada de ${par} (camino ${x.camino === 'A' ? 'O→H→L→C' : 'O→L→H→C'}): ${[falta.length ? `no ocurrio ${falta.join(', ')}` : '', nuevo.length ? `aparecio ${nuevo.join(', ')}` : ''].filter(Boolean).join('; ')}; por ${porque}`
    const destino = r.eventos.filter(y => y.par === par)
    for (const y of destino.length ? destino : r.eventos.filter(y => y.tipo === 'breach')) y.causa_ambiguedad = y.causa_ambiguedad ? `${y.causa_ambiguedad}; ${texto}` : texto
  }
}

// ── comandos ───────────────────────────────────────────────────────────────
const rechazo = (estado, motivo, extra = {}) => ({ estado, eventos: [], resultado: { rechazado: motivo, ...extra } })
const cotizacionDe = (e, par) => (e.cotizaciones[par] ? { bid: e.cotizaciones[par].bid, ask: askDe(e, par, e.cotizaciones[par].bid), en: e.cotizaciones[par].en } : null)
function ladoCorrecto(lado, ref, sl, tp) {
  if (lado === 'BUY') return (sl == null || sl < ref) && (tp == null || tp > ref)
  return (sl == null || sl > ref) && (tp == null || tp < ref)
}

// opciones.alto: condicion terminal de quien envuelve al motor, en cada cierre
export function aplica(estado, comando, velasPorPar = {}, { alto = null } = {}) {
  if (comando.tipo === 'avanzar') {
    if (estado.estado !== 'activo') return { estado, eventos: [], resultado: 'aceptado' }
    const desde = estado.reloj.cursor ?? -Infinity
    const tiempos = [...new Set(Object.values(velasPorPar).flatMap(vs => vs.map(v => v.time)))].filter(t => Number.isFinite(t) && t > desde && t <= comando.hasta).sort((a, b) => a - b)
    let e = estado
    const ev = []
    for (const t of tiempos) {
      const r = avanzaMinuto(e, t, velasPorPar, alto)
      e = r.estado; ev.push(...r.eventos)
      if (e.estado !== 'activo') break
    }
    // fin de datos: cuando el cursor llega a la ultima vela de todos los pares (sin centinela)
    const ultimos = Object.values(velasPorPar).map(vs => vs.at(-1)?.time).filter(x => x != null)
    const ultima = ultimos.length && ultimos.every(Number.isFinite) ? Math.max(...ultimos) : null
    if (e.estado === 'activo' && ultima != null && e.reloj.cursor === ultima && !e.reloj.fin_de_datos_emitido) {
      if (e === estado) e = structuredClone(estado)
      e.reloj.fin_de_datos_emitido = true
      ev.push({ tipo: 'fin_de_datos', en: { t: ultima + 60 } })
    }
    return { estado: e, eventos: ev, resultado: 'aceptado' }
  }

  if (estado.estado === 'breach') return rechazo(estado, 'sesion_en_breach')
  if (estado.estado === 'objetivo') return rechazo(estado, 'objetivo_alcanzado')
  if (estado.reloj.cursor == null) return rechazo(estado, 'sin_cotizacion')
  const en = { t: estado.reloj.cursor + 60 }
  const e = structuredClone(estado)
  const ev = []
  const ctx = ctxCotizado(e)
  try {
    if (comando.tipo === 'abrir') {
      const par = comando.par
      if (!e.pares.includes(par)) return rechazo(estado, 'par_no_valido')
      if (!e.cotizaciones[par]) return rechazo(estado, 'sin_cotizacion')
      const bid = e.cotizaciones[par].bid
      const leePrecio = x => (x == null || x === '' ? null : aTicks(par, x))
      const lado = comando.lado
      if (lado !== 'BUY' && lado !== 'SELL') return rechazo(estado, 'lado_invalido')
      const lotesC = aCentesimas(comando.lotes)
      const sl = leePrecio(comando.sl), tp = leePrecio(comando.tp)
      if (e.posiciones.length + e.ordenes.length >= TOPE) return rechazo(estado, 'tope_alcanzado')
      const b = parBaseUsd(par)
      const margenAhora = () => { if (b !== null && e.cotizaciones[b] == null) return null; return margen_µ(e, par, lotesC, b === null ? null : e.cotizaciones[b].bid) }
      const llenaYa = (entrada, orden = null) => {
        const margen = margenAhora()
        if (margen == null) return rechazo(estado, 'margen_sin_cotizacion')
        if (equidad(e, ctx) - margenUsado_µ(e) < margen) return rechazo(estado, 'margen_insuficiente')
        abrePosicion(e, ev, { par, lado, lotesC, entrada, sl, tp, en, hueco: false, orden, margen })
        compruebaLimites(e, ev, ctx, en)
        return { estado: e, eventos: ev, resultado: 'aceptado' }
      }
      if (comando.orden === 'mercado') {
        if (comando.cotizadoEn !== estado.reloj.cursor) return rechazo(estado, 'precio_cambiado', { cotizacion: cotizacionDe(estado, par) })
        const entrada = precioEjecucion(e, par, lado, bid)
        if (!ladoCorrecto(lado, entrada, sl, tp)) return rechazo(estado, 'precio_invalido')
        return llenaYa(entrada)
      }
      if (comando.orden !== 'limit' && comando.orden !== 'stop') return rechazo(estado, 'tipo_invalido')
      const p = leePrecio(comando.precio)
      if (p == null) return rechazo(estado, 'precio_invalido')
      const o = { id: null, seq: 0, par, lado, tipo: comando.orden, precio: p, sl, tp, lotes_c: lotesC, creada_en: en }
      if (ejecutable(e, o, bid)) {
        if (o.tipo === 'stop') return rechazo(estado, 'stop_ejecutable', { cotizacion: cotizacionDe(estado, par) })
        const entrada = precioEjecucion(e, par, lado, bid)
        if (!ladoCorrecto(lado, entrada, sl, tp)) return rechazo(estado, 'precio_invalido')
        return llenaYa(entrada)
      }
      if (!ladoCorrecto(lado, p, sl, tp)) return rechazo(estado, 'precio_invalido')
      o.seq = e.siguiente_seq++
      o.id = `o${o.seq}`
      e.ordenes.push(o)
      ev.push({ tipo: 'orden_creada', orden: o.id, par, lado, tipo_orden: o.tipo, precio: p, lotes_c: lotesC, sl, tp, en })
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
      const par = (pos ?? o).par, bid = e.cotizaciones[par].bid
      const leePrecio = x => (x == null || x === '' ? null : aTicks(par, x))
      const sl = 'sl' in comando ? leePrecio(comando.sl) : (pos ?? o).sl
      const tp = 'tp' in comando ? leePrecio(comando.tp) : (pos ?? o).tp
      if (pos) {
        if (!ladoCorrecto(pos.lado, salidaDe(e, pos, bid), sl, tp)) return rechazo(estado, 'precio_invalido')
        pos.sl = sl; pos.tp = tp
        ev.push({ tipo: 'posicion_modificada', posicion: pos.id, par, sl, tp, en })
      } else {
        const p = 'precio' in comando ? leePrecio(comando.precio) : o.precio
        const nueva = { ...o, precio: p, sl, tp }
        if (ejecutable(e, nueva, bid) && nueva.tipo === 'stop') return rechazo(estado, 'stop_ejecutable')
        if (ejecutable(e, nueva, bid)) {
          const entrada = precioEjecucion(e, par, o.lado, bid)
          if (!ladoCorrecto(o.lado, entrada, sl, tp)) return rechazo(estado, 'precio_invalido')
          const b = parBaseUsd(par)
          if (b !== null && e.cotizaciones[b] == null) return rechazo(estado, 'margen_sin_cotizacion')
          const margen = margen_µ(e, par, o.lotes_c, b === null ? null : e.cotizaciones[b].bid)
          if (equidad(e, ctx) - margenUsado_µ(e) < margen) return rechazo(estado, 'margen_insuficiente')
          e.ordenes = e.ordenes.filter(x => x !== o)
          abrePosicion(e, ev, { par, lado: o.lado, lotesC: o.lotes_c, entrada, sl, tp, en, hueco: false, margen, ...desdePendiente(o) })
          compruebaLimites(e, ev, ctx, en)
          return { estado: e, eventos: ev, resultado: 'aceptado' }
        }
        if (!ladoCorrecto(o.lado, p, sl, tp)) return rechazo(estado, 'precio_invalido')
        Object.assign(o, { precio: p, sl, tp })
        ev.push({ tipo: 'orden_modificada', orden: o.id, par, precio: p, sl, tp, en })
      }
      return { estado: e, eventos: ev, resultado: 'aceptado' }
    }
    if (comando.tipo === 'cerrar') {
      const pos = e.posiciones.find(x => x.id === comando.id)
      if (!pos) return rechazo(estado, 'no_existe')
      const lotesC = comando.lotes == null ? pos.lotes_c : aCentesimas(comando.lotes)
      if (lotesC > pos.lotes_c) return rechazo(estado, 'lotes_invalidos')
      cierraPosicion(e, ev, pos, { lotesC, salida: salidaDe(e, pos, ctx.precio[pos.par]), ctx, motivo: 'manual', en })
      trasCierre(e, ev, ctx, en, alto)
      return { estado: e, eventos: ev, resultado: 'aceptado' }
    }
    return rechazo(estado, 'comando_desconocido')
  } catch (err) {
    if (err instanceof RangeError) return rechazo(estado, 'entrada_invalida', { motivo: err.message })
    throw err
  }
}

// los limites en un instante sin vela (reset de medianoche), a los ultimos bids
export function evaluaLimites(estado, en) {
  if (estado.reloj.cursor == null || estado.estado !== 'activo') return { estado, eventos: [] }
  const e = structuredClone(estado)
  const ev = []
  compruebaLimites(e, ev, ctxCotizado(e), en)
  return ev.length ? { estado: e, eventos: ev } : { estado, eventos: [] }
}

// ── la fuente de mercado por par (fuente.mjs), con detencion del minuto entero ─
// fuentes: { PAR: fuente }. Cada par tiene que traer la fuente fijada en el
// estado (versiones.mercado). Si alguna detiene (dato que falta en horario de
// mercado, o un hueco interior de mas de 15 minutos: P7-01), se confirma solo
// hasta el minuto anterior a su FRONTERA, para TODOS los pares: ni precio ni
// eventos de ese minuto en ninguno (§ 3.5). Los huecos aceptados que se cruzan
// dejan su marca (huecos_aceptados y el evento hueco_aceptado).
export function avanza(estado, hasta, fuentes, { desde = null, alto = null } = {}) {
  for (const par of estado.pares) {
    const f = fuentes[par]
    const fijado = estado.versiones?.mercado?.[par]
    if (!f) return { estado, eventos: [], detencion: { motivo: 'fuente_que_falta', par } }
    if (f.par !== par) return { estado, eventos: [], detencion: { motivo: 'fuente_de_otro_par', par } }
    if (fijado == null) return { estado, eventos: [], detencion: { motivo: 'mercado_no_fijado', par } }
    if (fijado !== f.manifiesto) return { estado, eventos: [], detencion: { motivo: 'fuente_de_otra_version', par } }
  }
  const tramos = Object.fromEntries(estado.pares.map(par => [par, fuentes[par].tramo(estado.reloj.cursor, hasta, { desde })]))
  let confirmado = hasta, detencion = null
  for (const par of estado.pares) {
    const d = tramos[par].detencion
    if (!d) continue
    const limite = d.frontera - 1          // hasta el ultimo segundo antes de la frontera (paso = salto)
    if (limite < confirmado || (limite === confirmado && detencion && par < detencion.par)) { confirmado = Math.min(hasta, limite); detencion = { ...d, par } }
  }
  const todosFin = !detencion && estado.pares.every(par => tramos[par].finDeDatos)
  const velasPorPar = Object.fromEntries(estado.pares.map(par => {
    const vs = tramos[par].velas.filter(v => v.time <= confirmado)
    return [par, todosFin ? vs : [...vs, { time: Infinity }]]
  }))
  const r = aplica(estado, { tipo: 'avanzar', hasta: confirmado }, velasPorPar, { alto })
  const m = marcaHuecos(r.estado, estado.pares.flatMap(par => tramos[par].huecos ?? []), Math.min(confirmado, r.estado.reloj.cursor ?? -Infinity))
  return { estado: m.estado, eventos: [...m.eventos, ...r.eventos], detencion }
}
