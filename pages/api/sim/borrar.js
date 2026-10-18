// POST /api/sim/borrar — borrar una sesion: v1 (lapida) o legado (diseño sim-004 b.2,
// d3, q.1). Fino: lo comun en lib/servidor/http.mjs. APAGADO sin
// SIM_V1_ENDPOINTS=encendido (503 'apagado', CTO 16-oct; la pantalla lo interpreta con
// lib/sim/respuestas.js).
import { requireSimulador } from '../../../lib/authApi'
import { atiende } from '../../../lib/servidor/http.mjs'
import { ordenBorrar } from '../../../lib/servidor/borrar.mjs'

export default function handler(req, res) {
  return atiende(req, res, { donde: 'api/sim/borrar', orden: ordenBorrar, requireSimulador })
}
