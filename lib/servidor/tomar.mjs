// lib/servidor/tomar.mjs — TOMAR EL ESCRITOR de una sesion v1 («Usar aqui»; etapa 3;
// diseño sim-004 b.2; persistencia § 4.2, D-16, D-18). No calcula nada: valida la
// intencion y llama a sim_tomar_escritor (sim-003). El testigo vuelve SOLO en
// esta respuesta (la base guarda su hash); un reintento con la misma clave
// devuelve el recibo sin testigo, y la pestaña toma otra vez con otra clave.
// ordenTomar({ actor, cuerpo, puertos: { rpc } }) → { http, cuerpo }
import { validaTomar, sobreTomar } from './sobre.mjs'
import { llamaRpc } from './rpc.mjs'
export { validaTomar }

export async function ordenTomar({ actor, cuerpo, puertos }) {
  const v = validaTomar(cuerpo)
  if (!v.ok) return { http: v.http, cuerpo: { ok: false, http: v.http, motivo: v.motivo, en: v.en } }
  const i = v.intencion
  const datos = await llamaRpc(puertos.rpc, 'sim_tomar_escritor', {
    p_actor: actor, p_session_id: i.session_id, p_command_id: i.command_id, p_sobre: sobreTomar(i), p_epoca: i.epoca,
    p_cliente_id: i.cliente_id, p_forzar: i.forzar,
  }, puertos.rpcOpciones)
  return { http: datos.http, cuerpo: datos }
}
