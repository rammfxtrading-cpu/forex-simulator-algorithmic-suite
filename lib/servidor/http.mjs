// lib/servidor/http.mjs — lo comun de los endpoints /api/sim/* (etapa 3; diseño
// sim-004 b.1, o.8, o.12, q.1). Los handlers de pages/api/sim/ son finos: le
// pasan su orden (crear, comando…) y el guard.
//
// En este orden, y cada paso sin llamar a la RPC si no pasa:
//   1. EL INTERRUPTOR: sin SIM_V1_ENDPOINTS=encendido en el entorno, 503
//      apagado (CTO 16-oct: distinto de mantenimiento, para no confundirlos en
//      los logs ni en el cliente): sin autenticar, sin leer el cuerpo.
//      Se despliegan apagados; se encienden en la etapa 5 (c.7, paso 5);
//   2. el metodo del endpoint: POST, o GET en /api/sim/estado (405 si no; el
//      cuerpo de un GET es su query);
//   3. el guard (requireSimulador: 401/403/503 a su manera) y h.4: un admin sin
//      simulador_activo exactamente true no opera en v1 → 403 sin_acceso;
//   4. sim_servicio (o.12): mantenimiento, o la fila ilegible → 503 mantenimiento;
//   5. la orden, con los puertos reales (almacen del bucket mercado y la RPC con
//      service_role). Su respuesta {http, cuerpo}, tal cual.
// Un error que no es del protocolo: 500 generico; el detalle, a registra()
// (solo «clase codigo»), nunca al cliente (H4).
import { registra, errorPropio, texto } from '../mercado/errores.mjs'
import { almacenMercado } from './almacen.mjs'

// los puertos reales, con el cliente service_role del guard. leeSesion: la fila
// CONFIRMADA (fuera de bloqueo; la RPC vuelve a mirar todo bajo sus bloqueos)
export function puertosReales(sb) {
  return {
    almacen: almacenMercado(sb),
    rpc: (n, a) => sb.rpc(n, a),
    ahora: () => Date.now(),
    async leeSesion(id) {
      const r = await sb.from('sim_sessions').select('*').eq('id', id).maybeSingle()
      if (r.error) throw errorPropio(`leer la sesion: ${texto(r.error)}`)
      return r.data ?? null
    },
  }
}
export const encendido = (entorno = process.env) => entorno.SIM_V1_ENDPOINTS === 'encendido'
const mantenimiento = res => res.status(503).json({ ok: false, http: 503, motivo: 'mantenimiento' })
const apagado = res => res.status(503).json({ ok: false, http: 503, motivo: 'apagado' })

export async function atiende(req, res, { donde, orden, requireSimulador, metodo = 'POST' }) {
  res.setHeader('Cache-Control', 'no-store')
  if (!encendido()) return apagado(res)
  if (req.method !== metodo) return res.status(405).json({ ok: false, http: 405, motivo: 'metodo_no_permitido' })
  const auth = await requireSimulador(req, res)
  if (!auth) return
  const { user, profile, supabaseAdmin } = auth
  if (profile?.simulador_activo !== true) return res.status(403).json({ ok: false, http: 403, motivo: 'sin_acceso' })
  let s
  try { s = await supabaseAdmin.from('sim_servicio').select('mantenimiento').eq('id', true).maybeSingle() } catch (e) { s = { error: e } }
  if (s?.error || typeof s?.data?.mantenimiento !== 'boolean') { registra(donde, s?.error ?? new Error('sim_servicio sin fila legible')); return mantenimiento(res) }
  if (s.data.mantenimiento) return mantenimiento(res)
  try {
    const r = await orden({ actor: user.id, cuerpo: metodo === 'GET' ? { ...req.query } : req.body, puertos: puertosReales(supabaseAdmin) })
    return res.status(r.http).json(r.cuerpo)
  } catch (e) {
    registra(donde, e)
    return res.status(500).json({ ok: false, http: 500, motivo: 'error_interno' })
  }
}
