// CREAR UNA SESION V1 DESDE EL DASHBOARD (etapa 2 del motor, pieza 7; orden 1-125 del CTO). Con la bandera de cliente
// encendida (bandera.js), «Nueva sesion» manda POST /api/sim/crear en lugar del insert directo; apagada, el dashboard
// hace lo de hoy. La sesion nace desde CERO (saldo = capital). Las validaciones de fechas del formulario son las de hoy y
// coinciden con las del servidor (sobre.mjs: desde el 1-jul-2024, hasta ayer, 180 dias; date_to puede ser hoy: orden 1-127
// i); ademas, orden 1-179 (a), el servidor exige que caigan en el rango publicado del mercado (409 fuera_de_mercado, con
// su texto). Los textos de error, los de hoy.
//   → { ok: true, id } | { ok: false, error }   (el dashboard pinta error tal cual, como hoy)
import { getChallengeConfig } from '../../challengeRules'

const TEXTO_FALLO = 'No se pudo crear la sesion. Intentalo de nuevo.'
export function textoLimite(plan) {
  const isExtra = plan === 'extra'
  return `Tu plan ${isExtra ? 'Extra' : 'Basic'} permite ${isExtra ? 12 : 6} sesiones. Has alcanzado el limite. Borra una sesion${isExtra ? '' : ' o pasa a Extra'} para crear mas.`
}

// ORDEN 1-179 (a): el servidor solo crea con las fechas DENTRO del rango publicado del mercado vigente (GET /api/sim/mercado:
// { primer_dia, ultimo_dia }); fuera, 409 fuera_de_mercado con su texto, que se enseña tal cual. Los valores por defecto
// salen de ese rango: hasta = el ultimo dia publicado; desde = 6 meses antes (meses de calendario, como hasta ahora con
// «hoy»), sin pasar del primer dia publicado.
export async function rangoMercado(llama) {
  let r = null
  try { r = await llama('/api/sim/mercado', { metodo: 'GET', cuerpo: {} }) } catch {}
  const c = r?.cuerpo
  return r?.http === 200 && c?.ok && /^\d{4}-\d{2}-\d{2}$/.test(c.primer_dia ?? '') && /^\d{4}-\d{2}-\d{2}$/.test(c.ultimo_dia ?? '') ? { primer_dia: c.primer_dia, ultimo_dia: c.ultimo_dia } : null
}
export function fechasPorDefecto({ primer_dia, ultimo_dia }) {
  const desde = new Date(ultimo_dia + 'T00:00:00Z')
  desde.setUTCMonth(desde.getUTCMonth() - 6)
  const d = desde.toISOString().slice(0, 10)
  return { dateFrom: d < primer_dia ? primer_dia : d, dateTo: ultimo_dia }
}
const errorFuera = r => (r?.http === 409 && r.cuerpo?.motivo === 'fuera_de_mercado' && typeof r.cuerpo.texto === 'string' ? r.cuerpo.texto : null)

// EL RETO V1 DESDE EL MODAL (orden 1-127 i). Con la bandera encendida, ChallengeSetupModal crea el reto por /api/sim/crear
// con: EURUSD, M15, las fechas por defecto del rango publicado (orden 1-179 (a); antes, desde hace 6 meses hasta HOY) y el
// nombre automatico de /api/challenge/create. Los errores, los textos de hoy; fuera del mercado, el del servidor.
const capitalCorto = n => (n >= 1000 ? `$${(n / 1000).toFixed(0)}K` : `$${n}`)
export async function creaRetoV1({ llama, nuevoId, tipo, capital, plan = null }) {
  const rango = await rangoMercado(llama)
  if (!rango) return { ok: false, error: 'No se pudo crear el challenge: el mercado no está disponible. Inténtalo más tarde.' }
  const f = fechasPorDefecto(rango)
  const cfg = getChallengeConfig(tipo)
  const id = nuevoId()
  const cuerpo = { session_id: id, command_id: nuevoId(), epoca: 1, name: `Challenge ${cfg?.name ?? tipo} · ${capitalCorto(Number(capital))} · EURUSD`, pair: 'EURUSD', timeframe: 'M15',
    date_from: f.dateFrom, date_to: f.dateTo, capital: String(capital), challenge_type: tipo }
  let r = null
  try { r = await llama('/api/sim/crear', { cuerpo }) } catch {}
  if (r && (r.http === 201 || r.http === 200) && r.cuerpo?.ok) return { ok: true, id }
  if (r?.http === 409 && r.cuerpo?.motivo === 'limite_sesiones') return { ok: false, error: textoLimite(r.cuerpo.plan ?? plan) }
  if (errorFuera(r)) return { ok: false, error: errorFuera(r) }
  return { ok: false, error: 'No se pudo crear el challenge' }
}

export async function creaSesionV1({ llama, nuevoId, form, plan = null }) {
  const id = nuevoId()
  const cuerpo = { session_id: id, command_id: nuevoId(), epoca: 1, name: form.name, pair: form.pair, timeframe: 'H1',
    date_from: form.dateFrom, date_to: form.dateTo, capital: String(parseFloat(form.capital)), challenge_type: null }
  let r = null
  try { r = await llama('/api/sim/crear', { cuerpo }) } catch {}
  if (r && (r.http === 201 || r.http === 200) && r.cuerpo?.ok) return { ok: true, id }
  if (r?.http === 409 && r.cuerpo?.motivo === 'limite_sesiones') return { ok: false, error: textoLimite(r.cuerpo.plan ?? plan) }
  if (errorFuera(r)) return { ok: false, error: errorFuera(r) }
  return { ok: false, error: TEXTO_FALLO }
}
