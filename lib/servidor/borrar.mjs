// lib/servidor/borrar.mjs — BORRAR una sesion (etapa 3; diseño sim-004 b.2, d3, o.8).
// Un solo endpoint para v1 y legado; elige la RPC por motor_version de la fila leida
// (fuera de bloqueo): v1 → sim_borrar_sesion (lapida, con sus fases: S003-01); v0 →
// sim_borrar_legacy. La RPC vuelve a mirarlo todo bajo sus bloqueos: si la fila
// cambio entre la lectura y el bloqueo, contesta no_es_v1 / no_es_legado y no borra.
// Sin fila: sim_borrar_sesion, que contesta 410. La respuesta, la de la RPC (la que
// interpreta lib/sim/respuestas.js en la pantalla).
// ordenBorrar({ actor, cuerpo: { session_id }, puertos: { rpc, leeSesion } }) → { http, cuerpo }
import { llamaRpc } from './rpc.mjs'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
export function validaBorrar(c) {
  if (!c || typeof c !== 'object' || Array.isArray(c)) return { ok: false, http: 422, motivo: 'carga_invalida', en: 'cuerpo' }
  const extra = Object.keys(c).find(k => k !== 'session_id')
  if (extra !== undefined) return { ok: false, http: 422, motivo: 'carga_invalida', en: extra }
  if (!UUID.test(c.session_id ?? '')) return { ok: false, http: 422, motivo: 'carga_invalida', en: 'session_id' }
  return { ok: true, intencion: { session_id: c.session_id } }
}

export async function ordenBorrar({ actor, cuerpo, puertos }) {
  const v = validaBorrar(cuerpo)
  if (!v.ok) return { http: v.http, cuerpo: { ok: false, http: v.http, motivo: v.motivo, en: v.en } }
  const id = v.intencion.session_id
  const f = await puertos.leeSesion(id)
  const datos = f && f.motor_version === 0
    ? await llamaRpc(puertos.rpc, 'sim_borrar_legacy', { p_user_id: actor, p_session_id: id }, puertos.rpcOpciones)
    : await llamaRpc(puertos.rpc, 'sim_borrar_sesion', { p_actor: actor, p_session_id: id }, puertos.rpcOpciones)
  return { http: datos.http, cuerpo: datos }
}
