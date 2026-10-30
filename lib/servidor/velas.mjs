// lib/servidor/velas.mjs — LAS VELAS DEL GRAFICO de una sesion v1, del MISMO mercado v1 que valora el motor (orden 1-179 (d)
// del CTO: «motor ≠ grafico no es aceptable»). Puro salvo los puertos { almacen, leeSesion } (los de http.mjs).
//
// GET /api/sim/velas?session_id=…&par=EURUSD                    → el rango publicado de la version FIJADA de la sesion
//     { ok, par, fijado, digitos, primer_dia, ultimo_dia }      (el cliente decide asi que ventanas pide: nada fuera)
// GET /api/sim/velas?session_id=…&par=EURUSD&desde=AAAA-MM-DD&hasta=AAAA-MM-DD   (≤ VENTANA_DIAS dias)
//     { …lo de arriba, desde, hasta, dias: [{ dia, sha256 }], faltan: [{ dia, motivo }], velas: [[t, o, h, l, c, v], …] }
//     o, h, l, c en TICKS enteros (precio = ticks / 10^digitos); t en segundos.
//
// EL MISMO MERCADO QUE EL MOTOR, por construccion:
//   · el manifiesto es el que fija el ESTADO de la sesion (fuente.mercadoEfectivo: la version efectiva registrada, o la
//     raiz), leido con manifiestosFijados — la misma funcion que usa el comando (comando.mjs) antes de calcular;
//   · cada trozo se lee con el MISMO lector (mercado.mjs creaLector: por su ruta con el sha, la misma cache) y se
//     decodifica con MF.leeTrozo, que solo lo acepta si su sha256 es el del manifiesto (lo mismo que hace la fuente del
//     motor, fuente.mjs velasDelDia). Un trozo que no esta o que no es el suyo NO se pinta: va a «faltan» (el motor se
//     detiene ahi: trozo_no_disponible / trozo_alterado). Un dia con mercado sin trozo en el manifiesto, tambien
//     (cobertura: el motor, no_valorable).
// Acceso como /api/sim/estado: de otro alumno 404, borrada 410, no v1 409 no_es_v1. Sin el manifiesto fijado legible:
// 503 mercado_no_disponible.
import * as CA from '../motor/cartera.mjs'
import * as MF from '../motor/manifiesto.mjs'
import { manifiestosFijados, creaLector } from './mercado.mjs'

export const VENTANA_DIAS = 31
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const PAR = /^[A-Z]{6}$/
const DIA = 86400
const ymd = s => new Date(s * 1000).toISOString().slice(0, 10)
const esDia = d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && ymd(Date.parse(d + 'T00:00:00Z') / 1000) === d
const D = d => Date.parse(d + 'T00:00:00Z') / 1000
const no = (http, motivo, extra = {}) => ({ http, cuerpo: { ok: false, http, motivo, ...extra } })

export function validaVelas(c) {
  const mal = en => ({ ok: false, http: 422, motivo: 'carga_invalida', en })
  if (!c || typeof c !== 'object' || Array.isArray(c)) return mal('cuerpo')
  const extra = Object.keys(c).find(k => !['session_id', 'par', 'desde', 'hasta'].includes(k))
  if (extra !== undefined) return mal(extra)
  if (!UUID.test(c.session_id ?? '')) return mal('session_id')
  if (!PAR.test(c.par ?? '')) return mal('par')
  if ((c.desde === undefined) !== (c.hasta === undefined)) return mal(c.desde === undefined ? 'desde' : 'hasta')
  if (c.desde !== undefined) {
    if (!esDia(c.desde)) return mal('desde')
    if (!esDia(c.hasta) || c.hasta < c.desde || (D(c.hasta) - D(c.desde)) / DIA >= VENTANA_DIAS) return mal('hasta')
  }
  return { ok: true, intencion: { session_id: c.session_id, par: c.par, desde: c.desde ?? null, hasta: c.hasta ?? null } }
}

// el manifiesto que fija el estado de la sesion para «par» (el del motor) → { manifiesto } | { rechazo }
export async function manifiestoDeSesion({ fila, par, almacen }) {
  let est
  try { est = CA.deserializa(JSON.stringify(fila.estado)) } catch { return { rechazo: no(409, 'no_es_v1') } }
  const cartera = est?.esquema === 'reto@1' ? est.motor : est
  if (!cartera?.pares?.includes(par)) return { rechazo: no(422, 'carga_invalida', { en: 'par' }) }
  try {
    const m = await manifiestosFijados(almacen, cartera.versiones, [par])
    return { manifiesto: m[par] }
  } catch (e) {
    if (e?.propio && e.codigo) return { rechazo: no(503, 'mercado_no_disponible', { codigo: e.codigo }) }
    throw e
  }
}

// los trozos de los dias pedidos, leidos como los lee la fuente del motor. → { dias, faltan, velas }
export async function velasDeVentana({ manifiesto: m, desde, hasta, almacen, cache }) {
  const lector = creaLector({ almacen, ...(cache ? { cache } : {}) })
  const enVentana = m.dias.filter(d => d.dia >= desde && d.dia <= hasta)
  const leidos = await lector.trozos(m.par, enVentana)
  const dias = [], faltan = [], velas = []
  for (let k = 0; k < enVentana.length; k++) {
    const d = enVentana[k], b = leidos[k]
    if (b == null) { faltan.push({ dia: d.dia, motivo: 'trozo_no_disponible' }); continue }
    let t
    try { t = MF.leeTrozo(m, d.dia, b) } catch { faltan.push({ dia: d.dia, motivo: 'trozo_alterado' }); continue }
    dias.push({ dia: d.dia, sha256: d.sha256 })
    for (const v of t.velas) velas.push([v.time, Number(v.open), Number(v.high), Number(v.low), Number(v.close), v.volume])
  }
  // dias con mercado en la ventana (dentro de lo publicado) sin trozo o cortos: el motor no los valora
  const ini = desde < m.dias[0]?.dia ? m.dias[0].dia : desde, fin = hasta > (m.dias.at(-1)?.dia ?? '') ? m.dias.at(-1)?.dia : hasta
  if (ini && fin && ini <= fin) for (const x of MF.cobertura(m, ini, fin)) { const dia = x.slice(0, 10); if (!faltan.some(f => f.dia === dia) && !dias.some(f => f.dia === dia)) faltan.push({ dia, motivo: 'no_valorable' }) }
  faltan.sort((a, b) => (a.dia < b.dia ? -1 : 1))
  return { dias, faltan, velas }
}

export async function ordenVelas({ actor, cuerpo, puertos }) {
  const v = validaVelas(cuerpo)
  if (!v.ok) return no(v.http, v.motivo, { en: v.en })
  const i = v.intencion
  const fila = await puertos.leeSesion(i.session_id)
  if (!fila) return no(410, 'sesion_borrada')
  if (fila.user_id !== actor) return no(404, 'sesion_no_encontrada')
  if (fila.terminal === 'borrada') return no(410, 'sesion_borrada')
  if (fila.motor_version !== 1) return no(409, 'no_es_v1')
  const r = await manifiestoDeSesion({ fila, par: i.par, almacen: puertos.almacen })
  if (r.rechazo) return r.rechazo
  const m = r.manifiesto
  const base = { ok: true, http: 200, par: m.par, fijado: MF.fija(m), digitos: m.digitos, primer_dia: m.dias[0]?.dia ?? null, ultimo_dia: m.dias.at(-1)?.dia ?? null }
  if (i.desde === null) return { http: 200, cuerpo: base }
  let w
  try { w = await velasDeVentana({ manifiesto: m, desde: i.desde, hasta: i.hasta, almacen: puertos.almacen, cache: puertos.cache }) } catch (e) {
    if (e?.propio && e.codigo) return no(503, 'mercado_no_disponible', { codigo: e.codigo })
    throw e
  }
  return { http: 200, cuerpo: { ...base, desde: i.desde, hasta: i.hasta, ...w } }
}
