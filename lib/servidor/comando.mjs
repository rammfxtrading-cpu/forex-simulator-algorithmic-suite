// lib/servidor/comando.mjs — EL COMANDO de una sesion v1 (etapa 3; diseño sim-004 b.1,
// b.2, e.1, e.3, S4-04; persistencia § 4, § 4.3.1, § 6; CTO 14-oct: spread_micro y la
// conversion del evento cierre, q.4 y q.5). Puro salvo los puertos.
//
// ordenComando({ actor, cuerpo, puertos: { rpc, almacen, leeSesion, spreadMicro? } })
//   1. la intencion, validada cerrada (422 carga_invalida);
//   2. la fila CONFIRMADA de la sesion (leeSesion, fuera de bloqueo);
//   3. el motor calcula FUERA de bloqueo sobre ESE estado, y solo si su version es
//      la version_esperada del cliente: el CAS de sim_comando garantiza entonces
//      que el estado no cambio entre la lectura y la confirmacion. Si no:
//        · version leida MAYOR que la esperada (o la sesion no es calculable: no
//          existe, es de otro, legado, lapida, no v1): NO se calcula; va a la RPC
//          un resultado neutro que nunca se puede escribir (la version ya no
//          vuelve atras) y la RPC decide: el recibo si existe (respuesta perdida),
//          o su rechazo (404, 410, 409 conflicto / comando_caducado, 426…);
//        · version leida MENOR que la esperada (un cliente que dice una version
//          que aun no existe): 409 conflicto aqui, sin RPC (si la version llegase a
//          la esperada mientras tanto, un resultado neutro SI se escribiria);
//   4. el resultado, en la forma que valida sim_comando (sim-003): eventos con
//      ordinal, tipo, t_mercado y datos; un trade por cierre con sus *_micro,
//      conversion y spread_micro; proyeccion; clase;
//   5. sim_comando (rpc.mjs: 40P01 → reintento con la misma clave).
// Sin mercado fijado legible: 503 mercado_no_disponible, sin RPC (falla cerrado).
import * as CA from '../motor/cartera.mjs'
import * as M from '../motor/motor.mjs'
import { avanzaReto, aplicaReto } from '../motor/reto.mjs'
import { instrumento, aTicks, aCentesimas, precio as precioR, deTicks } from '../motor/instrumentos.mjs'
import { R, entre } from '../motor/racional.mjs'
import { usdAMicro, redondeaAlPar } from '../motor/dinero.mjs'
import { canonico, par as parDe } from './sobre.mjs'
import { manifiestosFijados, creaLector } from './mercado.mjs'
import { llamaRpc } from './rpc.mjs'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const no = en => ({ ok: false, http: 422, motivo: 'carga_invalida', en })
const TIPOS = ['abrir', 'modificar', 'cancelar', 'cerrar', 'avanzar', 'checkpoint']
const COMUNES = ['session_id', 'command_id', 'tipo', 'epoca', 'version_esperada', 'cliente_id', 'testigo']
const PROPIAS = { abrir: ['par', 'lado', 'orden', 'lotes', 'precio', 'sl', 'tp', 'cotizadoEn'], modificar: ['id', 'sl', 'tp', 'precio'], cancelar: ['id'], cerrar: ['id', 'lotes'], avanzar: ['hasta', 'motivo'], checkpoint: [] }
const AVANCES = ['avanzar', 'checkpoint']
// S4-08 (h.10; spec § 1.7): los topes DETERMINISTAS de un comando que se calcula.
//   tramo: hasta − (cursor, o el inicio) ≤ 7 dias naturales (nunca mas de 7 dias de
//          mercado). El umbral MEDIDO para p99 ≤ 10 s esta pendiente (diseño q.6).
//   bytes: la llamada a la RPC, en UTF-8, ≤ 4 MB (el cuerpo de Vercel Hobby)
// Otros, solo por puertos.limites (pruebas y la medida).
export const LIMITES = Object.freeze({ tramo: 7 * 86400, bytes: 4 * 1048576 })
const D = d => Date.parse(d + 'T00:00:00Z') / 1000

// un decimal positivo en texto, canonico (sin ceros de mas): '1.10000' → '1.1'
const DECIMAL = /^(\d+)(?:\.(\d+))?$/
function decimal(x) {
  if (typeof x !== 'string') return null
  const m = DECIMAL.exec(x)
  if (!m) return null
  const e = m[1].replace(/^0+(?=\d)/, ''), f = (m[2] ?? '').replace(/0+$/, '')
  return f ? `${e}.${f}` : e
}
const hay = (c, k) => c[k] !== undefined
// un precio opcional (sl, tp): ausente, null (sin) o un decimal; con par, en su rejilla
function precioOpcional(c, k, par) {
  if (!hay(c, k) || c[k] === null) return { ok: true, v: hay(c, k) ? null : undefined }
  const v = decimal(c[k])
  if (v == null) return { ok: false }
  if (par) { try { aTicks(par, v) } catch { return { ok: false } } }
  return { ok: true, v }
}

export function validaComando(c) {
  if (!c || typeof c !== 'object' || Array.isArray(c)) return no('cuerpo')
  if (!TIPOS.includes(c.tipo)) return no('tipo')
  const permitidas = [...COMUNES, ...PROPIAS[c.tipo]]
  const extra = Object.keys(c).find(k => !permitidas.includes(k))
  if (extra !== undefined) return no(extra)
  if (!UUID.test(c.session_id ?? '')) return no('session_id')
  if (!UUID.test(c.command_id ?? '')) return no('command_id')
  if (!Number.isInteger(c.epoca)) return no('epoca')
  if (!Number.isInteger(c.version_esperada) || c.version_esperada < 0) return no('version_esperada')
  if (typeof c.cliente_id !== 'string' || c.cliente_id.length < 1 || c.cliente_id.length > 100) return no('cliente_id')
  if (typeof c.testigo !== 'string' || !/^[0-9a-f]{64}$/.test(c.testigo)) return no('testigo')
  const i = { session_id: c.session_id, command_id: c.command_id, tipo: c.tipo, epoca: c.epoca, version_esperada: c.version_esperada, cliente_id: c.cliente_id, testigo: c.testigo }
  const p = {}
  if (c.tipo === 'abrir') {
    const pp = parDe(c.par); if (!pp) return no('par')
    p.par = pp.par
    if (c.lado !== 'BUY' && c.lado !== 'SELL') return no('lado')
    p.lado = c.lado
    if (!['mercado', 'limit', 'stop'].includes(c.orden)) return no('orden')
    p.orden = c.orden
    const l = decimal(c.lotes); try { if (l == null) throw 0; aCentesimas(l) } catch { return no('lotes') }
    p.lotes = l
    if (c.orden === 'mercado') {
      if (hay(c, 'precio')) return no('precio')
      if (!Number.isInteger(c.cotizadoEn)) return no('cotizadoEn')
      p.cotizadoEn = c.cotizadoEn
    } else {
      if (hay(c, 'cotizadoEn')) return no('cotizadoEn')
      const x = precioOpcional(c, 'precio', p.par); if (!x.ok || x.v == null) return no('precio')
      p.precio = x.v
    }
    for (const k of ['sl', 'tp']) { const x = precioOpcional(c, k, p.par); if (!x.ok) return no(k); if (x.v !== undefined) p[k] = x.v }
  } else if (c.tipo === 'modificar') {
    if (typeof c.id !== 'string' || !/^[op][1-9]\d*$/.test(c.id)) return no('id')
    p.id = c.id
    if (!['sl', 'tp', 'precio'].some(k => hay(c, k))) return no('id')
    if (hay(c, 'precio') && c.id[0] !== 'o') return no('precio')
    for (const k of ['sl', 'tp', 'precio']) { const x = precioOpcional(c, k, null); if (!x.ok || (k === 'precio' && x.v === null)) return no(k); if (x.v !== undefined) p[k] = x.v }
  } else if (c.tipo === 'cancelar') {
    if (typeof c.id !== 'string' || !/^o[1-9]\d*$/.test(c.id)) return no('id')
    p.id = c.id
  } else if (c.tipo === 'cerrar') {
    if (typeof c.id !== 'string' || !/^p[1-9]\d*$/.test(c.id)) return no('id')
    p.id = c.id
    if (hay(c, 'lotes')) { const l = decimal(c.lotes); try { if (l == null) throw 0; aCentesimas(l) } catch { return no('lotes') } p.lotes = l }
  } else if (c.tipo === 'avanzar') {
    if (!Number.isInteger(c.hasta) || c.hasta < 0) return no('hasta')
    if (!['paso', 'play', 'goto'].includes(c.motivo)) return no('motivo')
    p.hasta = c.hasta; p.motivo = c.motivo
  }
  return { ok: true, intencion: { ...i, carga: p } }
}
export const sobreComando = i => canonico({ tipo: i.tipo, payload: { session_id: i.session_id, ...i.carga } })

// ── spread_micro (CTO 14-oct): informativo, el coste del spread de ESA fila en µUSD.
// spread (ticks de la sesion, costes@1) × tamaño del tick × unidades cerradas, en la
// moneda cotizada; a USD con la MISMA tasa del evento cierre (conversion.valor; null
// = USD cotizado); un solo redondeo al final (dinero.mjs, al µ, mitades al par).
// Nunca entra en el neto, el saldo ni el drawdown: ya esta en los precios.
export function spreadMicro({ par, spreadTicks, lotesC, conversion }) {
  const { contrato, digitos } = instrumento(par)
  let q = R(BigInt(spreadTicks) * BigInt(lotesC) * contrato, 100n * 10n ** BigInt(digitos))
  if (conversion != null) q = entre(q, precioR(conversion.par, BigInt(conversion.valor)))
  const µ = usdAMicro(q)
  if (µ < 0n) throw new RangeError('spread_micro negativo')
  return µ
}

// ── el adaptador motor → sim_comando (S4-04) ───────────────────────────────────
const momento = en => en?.vela ?? en?.t
const iso = s => new Date(s * 1000).toISOString()
const dec = (x, escala) => {                                        // entero escalado → decimal canonico
  const s = (x < 0n ? -x : x).toString().padStart(escala + 1, '0')
  const e = s.slice(0, -escala), f = s.slice(-escala).replace(/0+$/, '')
  return (x < 0n ? '-' : '') + e + (f ? '.' + f : '')
}
export const microADecimal = µ => dec(µ, 6)
// pnl de las pantallas (numeric(10,2)): el neto en centimos, al par (dinero.mjs)
const centimos = µ => dec(redondeaAlPar(R(µ, 10_000n)), 2)
const datosDe = ({ tipo, ...resto }) => JSON.parse(M.serializa(resto))
const ECONOMICOS = new Set(['orden_creada', 'orden_modificada', 'orden_cancelada', 'fill', 'cierre', 'posicion_modificada', 'reset_diario', 'breach', 'fase_superada'])
export const claseDe = (tipo, eventos) => (AVANCES.includes(tipo) && !eventos.some(x => ECONOMICOS.has(x.tipo)) ? 'ultimo_avance' : 'economico')
const ticksOpc = (par, t) => (t == null ? null : deTicks(par, t))

// los trades de los cierres: la posicion de cada cierre sale del estado de partida y de
// los eventos de este mismo comando (fill, orden_creada/modificada, posicion_modificada)
function tradesDe({ antes, eventos, comando, spread_ticks, calculaSpread }) {
  const pos = new Map(antes.posiciones.map(p => [p.id, { par: p.par, lado: p.lado, entrada: p.entrada, sl: p.sl, tp: p.tp, abierta: momento(p.abierta_en) }]))
  const ord = new Map(antes.ordenes.map(o => [o.id, { sl: o.sl, tp: o.tp }]))
  const trades = []
  eventos.forEach((x, ordinal) => {
    if (x.tipo === 'orden_creada' || x.tipo === 'orden_modificada') ord.set(x.orden, { sl: x.sl, tp: x.tp })
    else if (x.tipo === 'posicion_modificada') Object.assign(pos.get(x.posicion), { sl: x.sl, tp: x.tp })
    else if (x.tipo === 'fill') {
      const o = x.orden ? ord.get(x.orden) : { sl: comando.sl == null ? null : aTicks(x.par, comando.sl), tp: comando.tp == null ? null : aTicks(x.par, comando.tp) }
      pos.set(x.posicion, { par: x.par, lado: x.lado, entrada: x.precio, sl: o?.sl ?? null, tp: o?.tp ?? null, abierta: momento(x.en) })
    } else if (x.tipo === 'cierre') {
      const p = pos.get(x.posicion)
      if (!p) throw new Error(`cierre de ${x.posicion} sin su posicion`)
      const neto = x.neto_µ
      trades.push({
        ordinal, pair: parDe(x.par).pair, side: x.lado, entry_price: deTicks(x.par, p.entrada), exit_price: deTicks(x.par, x.precio),
        sl_price: ticksOpc(x.par, p.sl), tp_price: ticksOpc(x.par, p.tp), lots: dec(x.lotes_c, 2), pnl: centimos(neto),
        result: neto > 0n ? 'WIN' : neto < 0n ? 'LOSS' : 'BREAKEVEN', opened_at: iso(p.abierta), closed_at: iso(momento(x.en)),
        bruto_micro: String(x.bruto_µ), neto_micro: String(neto), comision_micro: String(x.comision_µ),
        spread_micro: String(calculaSpread({ par: x.par, spreadTicks: spread_ticks[x.par], lotesC: x.lotes_c, conversion: x.conversion })),
        swap_micro: '0', conversion: x.conversion == null ? null : { ...x.conversion, valor: String(x.conversion.valor) },
        ambigua: !!x.ambigua, causa_ambiguedad: x.causa_ambiguedad ?? null,
      })
    }
  })
  return trades
}

export function resultadoDe({ tipo, comando, antes, despues, eventos, rechazado = null, detencion = null, calculaSpread = spreadMicro }) {
  const motorAntes = antes.esquema === 'reto@1' ? antes.motor : antes
  const motorDespues = despues.esquema === 'reto@1' ? despues.motor : despues
  const ev = eventos.map((x, ordinal) => {
    const t = momento(x.en)
    if (!Number.isInteger(t)) throw new Error(`evento ${x.tipo} sin momento entero`)
    return { ordinal, tipo: x.tipo, t_mercado: t, datos: datosDe(x) }
  })
  const proyeccion = { balance: microADecimal(motorDespues.saldo_µ), ...(motorDespues.reloj.cursor != null ? { last_timestamp: motorDespues.reloj.cursor } : {}) }
  return {
    resultado: rechazado ? 'rechazado' : 'aceptado',
    ...(rechazado ? { motivo: rechazado } : {}),
    clase: claseDe(tipo, eventos),
    estado: JSON.parse(CA.serializa(despues)),
    eventos: ev,
    trades: tradesDe({ antes: motorAntes, eventos, comando, spread_ticks: motorAntes.costes.spread_ticks, calculaSpread }),
    proyeccion,
    resumen: { tipo, resultado: rechazado ? 'rechazado' : 'aceptado', motivo: rechazado, eventos: ev.length, detencion: detencion?.motivo ?? null },
  }
}

// el resultado que no se calcula: no se puede escribir (ver la cabecera)
const neutro = tipo => ({ resultado: 'rechazado', motivo: 'no_calculado', clase: AVANCES.includes(tipo) ? 'ultimo_avance' : 'economico', estado: {}, eventos: [], trades: [], proyeccion: {} })

// el motor sobre el estado confirmado → resultado (lanza un error propio con codigo si falta mercado)
export async function calcula({ fila, intencion, puertos }) {
  const est = CA.deserializa(JSON.stringify(fila.estado))
  const reto = est.esquema === 'reto@1'
  const cartera = reto ? est.motor : est
  const { tipo, carga } = intencion
  const comun = { tipo, comando: carga, antes: est, calculaSpread: puertos.spreadMicro ?? spreadMicro }
  if (tipo === 'checkpoint') return resultadoDe({ ...comun, despues: est, eventos: [] })
  if (tipo === 'avanzar') {
    const inicio = cartera.reloj.cursor ?? (reto ? est.inicio : D(fila.date_from))
    const tope = (puertos.limites?.tramo ?? LIMITES.tramo)
    if (carga.hasta - inicio > tope) return { rechazo: { http: 422, motivo: 'tramo_demasiado_largo', hasta_maximo: inicio + tope } }
    const manifiestos = await manifiestosFijados(puertos.almacen, cartera.versiones, cartera.pares)
    const desde = reto ? est.inicio : D(fila.date_from)
    const fuentes = await creaLector({ almacen: puertos.almacen, cache: puertos.cache }).fuentes(manifiestos, { desde: cartera.reloj.cursor ?? desde, hasta: carga.hasta })
    const r = reto ? avanzaReto(est, carga.hasta, fuentes) : CA.avanza(est, carga.hasta, fuentes, { desde })
    return resultadoDe({ ...comun, despues: reto ? r.reto : r.estado, eventos: r.eventos, detencion: r.detencion })
  }
  const motor = { tipo, ...carga }
  const r = reto ? aplicaReto(est, motor) : CA.aplica(est, motor, {})
  const despues = reto ? r.reto : r.estado
  return resultadoDe({ ...comun, despues, eventos: r.eventos, rechazado: r.resultado === 'aceptado' ? null : r.resultado.rechazado })
}

export async function ordenComando({ actor, cuerpo, puertos }) {
  const v = validaComando(cuerpo)
  if (!v.ok) return { http: v.http, cuerpo: { ok: false, http: v.http, motivo: v.motivo, en: v.en } }
  const i = v.intencion
  const fila = await puertos.leeSesion(i.session_id)
  const calculable = !!fila && fila.user_id === actor && fila.motor_version === 1 && !fila.legado && fila.terminal == null && fila.estado && typeof fila.estado === 'object'
  let resultado = neutro(i.tipo)
  if (calculable && Number(fila.version) < i.version_esperada) {
    return { http: 409, cuerpo: { ok: false, http: 409, motivo: 'conflicto', version: Number(fila.version) } }
  }
  if (calculable && Number(fila.version) === i.version_esperada) {
    try { resultado = await calcula({ fila, intencion: i, puertos }) } catch (e) {
      if (e?.propio && e.codigo) return { http: 503, cuerpo: { ok: false, http: 503, motivo: 'mercado_no_disponible', codigo: e.codigo } }
      throw e
    }
    if (resultado.rechazo) { const { http, ...resto } = resultado.rechazo; return { http, cuerpo: { ok: false, http, ...resto } } }
  }
  const args = {
    p_actor: actor, p_session_id: i.session_id, p_command_id: i.command_id, p_tipo: i.tipo, p_sobre: sobreComando(i), p_epoca: i.epoca,
    p_version_esperada: i.version_esperada, p_cliente_id: i.cliente_id, p_testigo: i.testigo, p_resultado: resultado,
  }
  const bytes = Buffer.byteLength(JSON.stringify(args), 'utf8'), tope = puertos.limites?.bytes ?? LIMITES.bytes
  if (bytes > tope) return { http: 413, cuerpo: { ok: false, http: 413, motivo: 'resultado_demasiado_grande', bytes, maximo: tope } }
  const datos = await llamaRpc(puertos.rpc, 'sim_comando', args, puertos.rpcOpciones)
  return { http: datos.http, cuerpo: datos }
}
