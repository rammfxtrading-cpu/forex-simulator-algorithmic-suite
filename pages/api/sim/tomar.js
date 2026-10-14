// POST /api/sim/tomar — tomar el escritor de una sesion v1 («Usar aqui»; diseño
// sim-004 b.2, q.1). Fino: lo comun en lib/servidor/http.mjs. APAGADO sin
// SIM_V1_ENDPOINTS=encendido (503, como en la etapa 1).
import { requireSimulador } from '../../../lib/authApi'
import { atiende } from '../../../lib/servidor/http.mjs'
import { ordenTomar } from '../../../lib/servidor/tomar.mjs'

export default function handler(req, res) {
  return atiende(req, res, { donde: 'api/sim/tomar', orden: ordenTomar, requireSimulador })
}
