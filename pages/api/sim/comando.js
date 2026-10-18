// POST /api/sim/comando — un comando de una sesion v1: abrir, modificar, cancelar,
// cerrar, avanzar o checkpoint (diseño sim-004 b.2, q.1). Fino: lo comun en
// lib/servidor/http.mjs. APAGADO sin SIM_V1_ENDPOINTS=encendido (503 'apagado', CTO 16-oct).
import { requireSimulador } from '../../../lib/authApi'
import { atiende } from '../../../lib/servidor/http.mjs'
import { ordenComando } from '../../../lib/servidor/comando.mjs'

export default function handler(req, res) {
  return atiende(req, res, { donde: 'api/sim/comando', orden: ordenComando, requireSimulador })
}
