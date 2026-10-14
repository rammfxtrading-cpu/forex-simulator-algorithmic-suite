// POST /api/sim/crear — crear una sesion v1, practica o reto (diseño sim-004 b.2,
// q.1). Fino: el interruptor, el guard, sim_servicio y la orden van en
// lib/servidor/. APAGADO sin SIM_V1_ENDPOINTS=encendido (503, como en la etapa 1).
import { requireSimulador } from '../../../lib/authApi'
import { atiende } from '../../../lib/servidor/http.mjs'
import { ordenCrear } from '../../../lib/servidor/crear.mjs'

export default function handler(req, res) {
  return atiende(req, res, { donde: 'api/sim/crear', orden: ordenCrear, requireSimulador })
}
