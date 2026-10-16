// POST /api/sim/avanzar-fase — pasar de fase un reto v1, o completarlo en la ultima fase
// (diseño sim-004 b.2, j.7, j.8, q.10). Fino: lo comun en lib/servidor/http.mjs. APAGADO sin
// SIM_V1_ENDPOINTS=encendido (503 'apagado', CTO 16-oct).
import { requireSimulador } from '../../../lib/authApi'
import { atiende } from '../../../lib/servidor/http.mjs'
import { ordenFase } from '../../../lib/servidor/fase.mjs'

export default function handler(req, res) {
  return atiende(req, res, { donde: 'api/sim/avanzar-fase', orden: ordenFase, requireSimulador })
}
