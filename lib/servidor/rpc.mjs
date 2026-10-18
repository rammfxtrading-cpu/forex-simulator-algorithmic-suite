// lib/servidor/rpc.mjs — la llamada a una RPC del simulador v1 con service_role
// (etapa 3; diseño sim-004 b.1, e.1; persistencia § 6.1).
//
// rpc(nombre, args) es el puerto: el de supabase-js ({ data, error }), o el del
// ensayo (pruebas/montaje-v1.mjs). Las RPC contestan SIEMPRE un jsonb
// { ok, http, motivo, ... }; lo que no es del protocolo sale como error de SQL:
//   · 40P01 (interbloqueo): como mucho 3 reintentos con los MISMOS argumentos
//     (el mismo command_id: la idempotencia de la RPC hace el resto) y una espera
//     corta aleatoria;
//   · cualquier otro error (y una respuesta sin la forma del protocolo): error
//     PROPIO con su codigo y sin su texto (BF-02). El endpoint responde 500
//     generico; una respuesta perdida se recupera repitiendo con la misma clave.
import { errorPropio, codigo } from '../mercado/errores.mjs'

export const REINTENTOS_40P01 = 3
const esperaPorDefecto = ms => new Promise(r => setTimeout(r, ms))

export async function llamaRpc(rpc, nombre, args, { espera = esperaPorDefecto, azar = Math.random } = {}) {
  for (let intento = 0; ; intento++) {
    let r
    try { r = await rpc(nombre, args) } catch (e) { throw Object.assign(errorPropio(`${nombre}: sin respuesta (${codigo(e)})`), { codigo: 'rpc_sin_respuesta' }) }
    if (r?.error) {
      if (r.error.code === '40P01' && intento < REINTENTOS_40P01) { await espera(20 + Math.floor(azar() * 80)); continue }
      throw Object.assign(errorPropio(`${nombre}: error de SQL ${codigo(r.error)}${r.error.code === '40P01' ? ` tras ${REINTENTOS_40P01} reintentos` : ''}`), { codigo: 'rpc_error' })
    }
    const d = r?.data
    if (!d || typeof d !== 'object' || typeof d.ok !== 'boolean' || !Number.isInteger(d.http)) throw Object.assign(errorPropio(`${nombre}: respuesta sin la forma del protocolo`), { codigo: 'rpc_error' })
    return d
  }
}
