// GET /api/sim/velas?session_id=…&par=…[&desde=…&hasta=…] — las velas del grafico de una sesion v1, del MISMO mercado v1
// (manifiesto y version fijados en la sesion) que valora el motor (orden 1-179 (d)). Fino: lo comun en lib/servidor/http.mjs.
// APAGADO sin SIM_V1_ENDPOINTS=encendido (503 'apagado', como los demas /api/sim/*).
import { requireSimulador } from '../../../lib/authApi'
import { atiende } from '../../../lib/servidor/http.mjs'
import { ordenVelas } from '../../../lib/servidor/velas.mjs'

export default function handler(req, res) {
  return atiende(req, res, { donde: 'api/sim/velas', orden: ordenVelas, requireSimulador, metodo: 'GET' })
}
