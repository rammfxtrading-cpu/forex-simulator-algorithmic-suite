// Estado del servicio del simulador (etapa 1; diseño sim-004, i.1 b, o.5–o.7).
//
// Vive en Supabase: public.sim_servicio, una fila (mantenimiento, version_minima),
// que solo escribe el dueño por SQL. El cliente la lee ANTES de cada escritura
// economica y cada 30 s. Bloquea las escrituras economicas cuando:
//   mantenimiento   la fila dice mantenimiento = true
//   version         VERSION_CLIENTE < version_minima (o.6: recargar)
//   sin_estado      la lectura fallo: la escritura iria al mismo Supabase (o.5)
//   incierto        un cierre cuyo resultado no se sabe (respuesta perdida y
//                   relectura fallida, o.7): hasta que una relectura responda
// Las escrituras economicas son las # 1–9 de a.1 salvo timeframe (b.3).
import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { VERSION_CLIENTE } from './version'
import { encola } from './cola'
import { conPlazo, VENCIDO } from './plazo'

export const SONDEO_MS = 30000
const st = globalThis.__simServicio ??= { leido: false, mantenimiento: false, versionMinima: null, falloLectura: false, inciertos: [], oyentes: new Set() }
st.vuelo ??= {}
const avisaOyentes = () => { const e = estadoServicio(); for (const f of [...st.oyentes]) f(e) }

export function motivoBloqueo() {
  if (st.inciertos.length) return 'incierto'
  if (st.falloLectura || !st.leido) return 'sin_estado'
  if (st.mantenimiento) return 'mantenimiento'
  if (st.versionMinima != null && VERSION_CLIENTE < st.versionMinima) return 'version'
  return null
}
export function estadoServicio() {
  return { leido: st.leido, mantenimiento: st.mantenimiento, versionMinima: st.versionMinima, falloLectura: st.falloLectura,
    inciertos: st.inciertos.length, motivo: motivoBloqueo() }
}
export function suscribeServicio(f) { st.oyentes.add(f); return () => st.oyentes.delete(f) }
export function reiniciaServicio() { Object.assign(st, { leido: false, mantenimiento: false, versionMinima: null, falloLectura: false, inciertos: [], vuelo: {} }); avisaOyentes() }
// los inciertos de una sesion (E1-04: con alguno no se ofrece ni se manda el paso de fase)
export const inciertosDe = sid => st.inciertos.filter(p => p.sessionId === sid && !p.consumido).length

// Lee la fila. Cualquier error, o no haber fila, o una version ilegible, es
// sin_estado (nunca «todo bien»). { resolver: false } no intenta resolver los
// inciertos: es lo que hace puedeEscribir, porque la llaman las operaciones de la
// cola de la sesion y la resolucion se encola en esa misma cola (esperarla desde
// dentro la bloquearia). Los resuelven el sondeo, el temporizador del plazo y el
// resto de lecturas.
export async function leeServicio({ resolver = true } = {}) {
  let r
  try { r = await conPlazo(supabase.from('sim_servicio').select('mantenimiento, version_minima').eq('id', true).maybeSingle()); if (r === VENCIDO) r = { error: 'plazo' } } catch (e) { r = { error: e } }
  const v = r?.data ? Number.parseInt(r.data.version_minima, 10) : NaN
  if (r?.error || !r?.data || typeof r.data.mantenimiento !== 'boolean' || !Number.isInteger(v)) {
    st.falloLectura = true
  } else {
    Object.assign(st, { leido: true, falloLectura: false, mantenimiento: r.data.mantenimiento, versionMinima: v })
  }
  if (resolver) await resuelveInciertos()
  avisaOyentes()
  return estadoServicio()
}

// Antes de cada escritura economica: lee y decide.
export async function puedeEscribir() {
  const e = await leeServicio({ resolver: false })
  return { permitido: e.motivo === null, motivo: e.motivo }
}

// ── cierres de resultado incierto (o.7) ──────────────────────────────────────
// { tradeId, sessionId, revierte, guardado }: mientras haya alguno, todo lo
// economico queda bloqueado. Cada lectura del servicio (salvo la de
// puedeEscribir) intenta resolverlos releyendo el
// trade por su id (lo genera el cliente): si esta, se guardo. Si no esta, solo
// se revierte pasado ESPERA_INCIERTO_MS desde la llamada: antes, la transaccion
// podria seguir en el servidor (la corta su statement_timeout). 20 s cubre
// 2 × statement_timeout si este es ≤ 10 s: el runbook lo contrasta con lo que
// mida s10 (seccion timeout) y, si es mayor, se sube esta constante.
export const ESPERA_INCIERTO_MS = 20000
// E1-03 (ronda 2): cada incierto se resuelve UNA sola vez. Una promesa compartida por
// tradeId (single-flight): dos lecturas a la vez esperan la misma. La decision y su
// callback corren en la COLA DE SU SESION, cuando les toca; se marca consumido y se quita
// de la lista ACTUAL (no de una foto: otro incierto pudo darse de alta durante la espera)
// ANTES de invocar el callback.
export function registraIncierto(p) {
  st.inciertos = [...st.inciertos, { desde: Date.now(), consumido: false, ...p }]
  avisaOyentes()
  setTimeout(() => { leeServicio() }, ESPERA_INCIERTO_MS + 100)
}
export async function resuelveInciertos() {
  const vivos = st.inciertos.filter(p => !p.consumido)
  if (!vivos.length) return
  await Promise.all(vivos.map(resuelveUno))
}
function resuelveUno(p) {
  if (st.vuelo[p.tradeId]) return st.vuelo[p.tradeId]
  const decide = async () => {
    if (p.consumido) return
    let r
    try { r = await conPlazo(supabase.from('sim_trades').select('id').eq('id', p.tradeId).maybeSingle()); if (r === VENCIDO) r = { error: 'plazo' } } catch (e) { r = { error: e } }
    if (r?.error) return
    let cb
    if (r.data) cb = p.guardado
    else if (Date.now() - p.desde >= ESPERA_INCIERTO_MS) cb = p.revierte
    else return
    p.consumido = true
    st.inciertos = st.inciertos.filter(x => x !== p)
    try { cb?.() } catch (e) { console.error('[incierto]', e) }
    avisaOyentes()
  }
  const v = (async () => {
    try { await (p.sessionId ? encola(p.sessionId, decide) : decide()) } finally { delete st.vuelo[p.tradeId] }
  })()
  st.vuelo[p.tradeId] = v
  return v
}

export function recarga() { window.location.reload() }

// Hook: lee al montar y cada 30 s; devuelve el estado y se repinta al cambiar.
export function useServicio() {
  const [e, setE] = useState(estadoServicio())
  useEffect(() => {
    const quita = suscribeServicio(setE)
    leeServicio()
    const iv = setInterval(() => { leeServicio() }, SONDEO_MS)
    return () => { quita(); clearInterval(iv) }
  }, [])
  return e
}

export const TEXTO_BLOQUEO = {
  mantenimiento: 'El simulador está en mantenimiento. Tus sesiones están a salvo; las operaciones están en pausa hasta que termine.',
  version: 'Hay una versión nueva del simulador. Cierra tus posiciones y órdenes y recarga la página para seguir operando.',
  sin_estado: 'No se puede comprobar el estado del simulador. Las operaciones están en pausa; comprueba tu conexión.',
  incierto: 'No se sabe si tu último cierre se guardó. Las operaciones están en pausa; recarga la página para ver lo guardado.',
}
