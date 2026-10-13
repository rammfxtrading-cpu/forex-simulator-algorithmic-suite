// /api/sim/* desplegados APAGADOS (etapa 1; diseño sim-004, § f y o.8): todo
// responde 503 mantenimiento, sin autenticar, sin leer el cuerpo y sin llamar a
// ninguna RPC. El interruptor por variable de entorno (b.1) llega con la
// implementacion (etapa 3).
export default function apagado(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  return res.status(503).json({ ok: false, http: 503, motivo: 'mantenimiento' })
}
