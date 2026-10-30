// lib/servidor/crear.mjs — CREAR una sesion v1: practica o reto (etapa 3; diseño
// sim-004 b.2, e.1; persistencia § 4.3.2, § 5). Puro salvo los puertos.
//
// ordenCrear({ actor, cuerpo, puertos: { almacen, rpc, ahora } }) → { http, cuerpo }
//   1. la intencion, validada cerrada (sobre.mjs): 422 carga_invalida;
//   2. el mercado vigente de los NUEVE pares (mercado.mjs; A26: la sesion fija
//      todos los pares, y hoy el alumno cambia de par dentro de una sesion; h.10
//      mide «avanzar 7 dias con 9 pares»). Sin mercado: 503
//      mercado_no_disponible, sin llamar a la RPC (falla cerrado);
//   3. el estado inicial FUERA de bloqueo: practica = cartera.crea; reto =
//      creaReto(fase 1) sobre la cartera con sus reglas: 2F FTMO_2STEP, 1F
//      SUITE_1F, 3F SUITE_3F (j.7.3; CTO 14-oct, q.10);
//   4. sim_crear_sesion (sim-003) con el sobre canonico: la respuesta, tal cual,
//      con su http (201 creada, 200 repetido, 409, 403, 410, 426…).
// El actor sale del guard (el endpoint), nunca del cuerpo.
import * as CA from '../motor/cartera.mjs'
import { creaReto, FTMO_2STEP, SUITE_1F, SUITE_3F } from '../motor/reto.mjs'
import { COSTES_1 } from '../motor/costes.mjs'
import { validaCrear, sobreCrear, PARES } from './sobre.mjs'
import { manifiestosVigentes, rangoPublicado } from './mercado.mjs'
import { llamaRpc } from './rpc.mjs'

const responde = (http, cuerpo) => ({ http, cuerpo })
const rechazo = (http, motivo, extra = {}) => responde(http, { ok: false, http, motivo, ...extra })
const D = d => Date.parse(d + 'T00:00:00Z') / 1000
// las reglas de cada reto v1 (j.7.3): la constante y su id van en el estado y en el resumen
export const REGLAS = Object.freeze({ '1F': SUITE_1F, '2F': FTMO_2STEP, '3F': SUITE_3F })

export function estadoInicial(i, fijados) {
  const cartera = CA.crea({ pares: PARES, costes: COSTES_1, capital: i.capital, mercado: fijados })
  if (i.challenge_type === null) return { estado: cartera, reglas: null }
  const reglas = REGLAS[i.challenge_type]
  return { estado: creaReto({ motor: cartera, fase: 1, inicio: D(i.date_from), reglas }), reglas: reglas.version }
}

// 'AAAA-MM-DD' → 'DD/MM/AAAA'
const fecha = d => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`
// → null (dentro) | el cuerpo del 409 fuera_de_mercado
export function fueraDelMercado({ date_from, date_to }, rango) {
  if (rango && date_from >= rango.primer_dia && date_to <= rango.ultimo_dia) return null
  const texto = rango
    ? `Las fechas de la sesión tienen que estar dentro del mercado publicado: del ${fecha(rango.primer_dia)} al ${fecha(rango.ultimo_dia)}.`
    : 'No hay mercado publicado para crear la sesión. Inténtalo más tarde.'
  return { ok: false, http: 409, motivo: 'fuera_de_mercado', texto, primer_dia: rango?.primer_dia ?? null, ultimo_dia: rango?.ultimo_dia ?? null }
}

// orden 1-179 (a): GET /api/sim/mercado → { ok, primer_dia, ultimo_dia }: el rango en que se puede crear (los valores por
// defecto del modal del reto y del formulario de nueva sesion). Sin mercado: 503 mercado_no_disponible
export async function ordenMercado({ cuerpo, puertos }) {
  const extra = Object.keys(cuerpo ?? {})[0]
  if (extra !== undefined) return rechazo(422, 'carga_invalida', { en: extra })
  let mercado
  try { mercado = await manifiestosVigentes(puertos.almacen, PARES) } catch (e) {
    if (e?.propio && e.codigo) return rechazo(503, 'mercado_no_disponible', { codigo: e.codigo })
    throw e
  }
  const r = rangoPublicado(mercado.manifiestos)
  if (!r) return rechazo(503, 'mercado_no_disponible', { codigo: 'sin_rango_comun' })
  return responde(200, { ok: true, http: 200, ...r })
}

export async function ordenCrear({ actor, cuerpo, puertos }) {
  const v = validaCrear(cuerpo, { ahora: puertos.ahora() })
  if (!v.ok) return rechazo(v.http, v.motivo, { en: v.en })
  const i = v.intencion
  if (i.challenge_type !== null && !REGLAS[i.challenge_type]) return rechazo(422, 'reto_no_disponible', { en: 'challenge_type' })
  let mercado
  try { mercado = await manifiestosVigentes(puertos.almacen, PARES) } catch (e) {
    if (e?.propio && e.codigo) return rechazo(503, 'mercado_no_disponible', { codigo: e.codigo })
    throw e
  }
  // orden 1-179 (a): las fechas, dentro del rango publicado del mercado vigente (el que la sesion va a fijar). Fuera: 409
  // con texto claro, sin llamar a la RPC. (Antes se aceptaba cualquier dia desde el 1-jul-2024 y el motor se detenia
  // despues en el primer dia sin trozo: «no_valorable».)
  const fuera = fueraDelMercado(i, rangoPublicado(mercado.manifiestos))
  if (fuera) return responde(409, fuera)
  const { estado, reglas } = estadoInicial(i, mercado.fijados)
  const datos = await llamaRpc(puertos.rpc, 'sim_crear_sesion', {
    p_actor: actor, p_session_id: i.session_id, p_command_id: i.command_id, p_sobre: sobreCrear(i), p_epoca: i.epoca,
    p_sesion: { name: i.name, pair: i.pair, timeframe: i.timeframe, date_from: i.date_from, date_to: i.date_to, capital: i.capital, challenge_type: i.challenge_type },
    p_estado: JSON.parse(CA.serializa(estado)),
    p_mercado: mercado.fijados,
    p_resumen: { producto: i.challenge_type === null ? 'practica' : 'reto', challenge_type: i.challenge_type, reglas, capital: i.capital },
  }, puertos.rpcOpciones)
  return responde(datos.http, datos)
}
