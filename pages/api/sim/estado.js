// GET /api/sim/estado?session_id=… — el estado confirmado de una sesion v1, leido en el
// servidor (diseño sim-004 S4-07, h.11). Fino: lo comun en lib/servidor/http.mjs.
// APAGADO sin SIM_V1_ENDPOINTS=encendido (503 'apagado', como los demas /api/sim/*).
import { requireSimulador } from '../../../lib/authApi'
import { atiende } from '../../../lib/servidor/http.mjs'
import { ordenEstado } from '../../../lib/servidor/estado.mjs'

export default function handler(req, res) {
  return atiende(req, res, { donde: 'api/sim/estado', orden: ordenEstado, requireSimulador, metodo: 'GET' })
}
