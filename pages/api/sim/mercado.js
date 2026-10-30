// GET /api/sim/mercado — el rango publicado del mercado v1 vigente en que se puede crear una sesion (orden 1-179 (a)):
// { ok, primer_dia, ultimo_dia }. Fino: lo comun en lib/servidor/http.mjs. APAGADO sin SIM_V1_ENDPOINTS=encendido.
import { requireSimulador } from '../../../lib/authApi'
import { atiende } from '../../../lib/servidor/http.mjs'
import { ordenMercado } from '../../../lib/servidor/crear.mjs'

export default function handler(req, res) {
  return atiende(req, res, { donde: 'api/sim/mercado', orden: ordenMercado, requireSimulador, metodo: 'GET' })
}
