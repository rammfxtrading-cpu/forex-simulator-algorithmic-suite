// CREAR UNA SESION V1 DESDE EL DASHBOARD (etapa 2 del motor, pieza 7; orden 1-125 del CTO). Con la bandera de cliente
// encendida (bandera.js), «Nueva sesion» manda POST /api/sim/crear en lugar del insert directo; apagada, el dashboard
// hace lo de hoy. La sesion nace desde CERO (saldo = capital). Las validaciones de fechas del formulario son las de hoy y
// coinciden con las del servidor (sobre.mjs: desde el 1-jul-2024, hasta ayer, 180 dias). Los textos de error, los de hoy.
//   → { ok: true, id } | { ok: false, error }   (el dashboard pinta error tal cual, como hoy)
const TEXTO_FALLO = 'No se pudo crear la sesion. Intentalo de nuevo.'
export function textoLimite(plan) {
  const isExtra = plan === 'extra'
  return `Tu plan ${isExtra ? 'Extra' : 'Basic'} permite ${isExtra ? 12 : 6} sesiones. Has alcanzado el limite. Borra una sesion${isExtra ? '' : ' o pasa a Extra'} para crear mas.`
}

export async function creaSesionV1({ llama, nuevoId, form, plan = null }) {
  const id = nuevoId()
  const cuerpo = { session_id: id, command_id: nuevoId(), epoca: 1, name: form.name, pair: form.pair, timeframe: 'H1',
    date_from: form.dateFrom, date_to: form.dateTo, capital: String(parseFloat(form.capital)), challenge_type: null }
  let r = null
  try { r = await llama('/api/sim/crear', { cuerpo }) } catch {}
  if (r && (r.http === 201 || r.http === 200) && r.cuerpo?.ok) return { ok: true, id }
  if (r?.http === 409 && r.cuerpo?.motivo === 'limite_sesiones') return { ok: false, error: textoLimite(r.cuerpo.plan ?? plan) }
  return { ok: false, error: TEXTO_FALLO }
}
