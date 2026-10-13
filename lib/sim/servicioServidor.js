// El estado del servicio en el SERVIDOR (diseño sim-004, o.12; decisión del CTO del
// 13-oct, sobre o.11.7). /api/challenge/create, /api/challenge/advance y
// /api/admin/wipe-simulador escriben economía con service_role sin pasar por el
// cliente: leen public.sim_servicio justo antes de escribir.
//   mantenimiento = true → 503 «Simulador en mantenimiento», sin escribir nada
//   la lectura falla (o no hay fila) → 503 también: falla cerrado
// Devuelve true si se puede escribir; si no, ya ha respondido.
// service_role tiene SELECT en sim_servicio (sql/sim-004a-preparatoria.sql) y nada más.
import { registra } from '../mercado/errores.mjs'

export async function servicioPermite(supabaseAdmin, res, donde) {
  let r
  try { r = await supabaseAdmin.from('sim_servicio').select('mantenimiento').eq('id', true).maybeSingle() } catch (e) { r = { error: e } }
  if (r?.error || !r?.data || typeof r.data.mantenimiento !== 'boolean') {
    registra(donde, r?.error ?? new Error('sim_servicio sin fila legible'))
    res.status(503).json({ error: 'No se puede comprobar el estado del simulador. Prueba de nuevo en unos minutos.' })
    return false
  }
  if (r.data.mantenimiento) {
    res.status(503).json({ error: 'Simulador en mantenimiento' })
    return false
  }
  return true
}
