// lib/servidor/fase.mjs — PASAR DE FASE un reto v1 (etapa 3; diseño sim-004 b.2, j.7, j.8;
// decisiones del CTO del 14-oct, q.10 d y e). Puro salvo los puertos.
//
// ordenFase({ actor, cuerpo: { padre_id, hija_id, command_id, epoca, version_esperada },
//             puertos: { rpc, almacen, leeSesion } }) → { http, cuerpo }
//   1. la intencion, cerrada (hija_id null = la ultima fase: el completado);
//   2. la fila CONFIRMADA de la madre. Se calcula solo si su version es la esperada (como en
//      comando.mjs): si es mayor, sim_avanzar_fase con todo vacio (no puede escribir nada:
//      da el recibo de una respuesta perdida, o su rechazo); si es menor, 409 conflicto aqui;
//   3. j.7, sin RPC y sin tocar nada: si el reto no esta superado, 409 posiciones_abiertas
//      (saldo cerrado ≥ objetivo con posiciones abiertas) o 409 fase_no_superada;
//   4. la fase k superada de n (1F 1, 2F 2, 3F 3):
//        k < n → la hija k+1: las mismas reglas y el mismo capital, una cartera nueva de los
//                nueve pares, inicio en el minuto SIGUIENTE al del cierre que supero la fase
//                (d: ese minuto es de la madre) y el mercado VIGENTE al pasar (e: como crear),
//                anotado en el resumen del recibo; la madre no se toca;
//        k = n → el completado (sim-004b): sin hija.
//   5. sim_avanzar_fase; su respuesta, tal cual. Sin mercado vigente: 503 sin RPC.
// ⚠️ El completado y las fases de 3F necesitan sim-004b; con sim-003 solo, 2F 1→2.
import * as CA from '../motor/cartera.mjs'
import { creaReto, reglasDe, fasesDe } from '../motor/reto.mjs'
import { COSTES_1 } from '../motor/costes.mjs'
import { canonico, PARES } from './sobre.mjs'
import { manifiestosVigentes } from './mercado.mjs'
import { microADecimal } from './comando.mjs'
import { llamaRpc } from './rpc.mjs'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const no = en => ({ ok: false, http: 422, motivo: 'carga_invalida', en })
const CLAVES = ['padre_id', 'hija_id', 'command_id', 'epoca', 'version_esperada']
const rechazo = (http, motivo, extra = {}) => ({ http, cuerpo: { ok: false, http, motivo, ...extra } })

export function validaFase(c) {
  if (!c || typeof c !== 'object' || Array.isArray(c)) return no('cuerpo')
  const extra = Object.keys(c).find(k => !CLAVES.includes(k))
  if (extra !== undefined) return no(extra)
  if (!UUID.test(c.padre_id ?? '')) return no('padre_id')
  if (c.hija_id != null && (!UUID.test(c.hija_id) || c.hija_id === c.padre_id)) return no('hija_id')
  if (!UUID.test(c.command_id ?? '')) return no('command_id')
  if (!Number.isInteger(c.epoca)) return no('epoca')
  if (!Number.isInteger(c.version_esperada) || c.version_esperada < 0) return no('version_esperada')
  return { ok: true, intencion: { padre_id: c.padre_id, hija_id: c.hija_id ?? null, command_id: c.command_id, epoca: c.epoca, version_esperada: c.version_esperada } }
}
export const sobreFase = i => canonico({ tipo: 'avanzar_fase', payload: { padre_id: i.padre_id, hija_id: i.hija_id } })

export async function ordenFase({ actor, cuerpo, puertos }) {
  const v = validaFase(cuerpo)
  if (!v.ok) return rechazo(v.http, v.motivo, { en: v.en })
  const i = v.intencion
  const f = await puertos.leeSesion(i.padre_id)
  const calculable = !!f && f.user_id === actor && f.motor_version === 1 && !f.legado && f.terminal == null && f.estado?.esquema === 'reto@1'
  let carga = { p_sesion: null, p_estado: null, p_mercado: null, p_resumen: {} }
  if (calculable && Number(f.version) < i.version_esperada) return rechazo(409, 'conflicto', { version: Number(f.version) })
  if (calculable && Number(f.version) === i.version_esperada) {
    const r = CA.deserializa(JSON.stringify(f.estado))
    if (r.estado !== 'superada') {
      return r.motor.saldo_µ >= r.objetivo_µ && r.motor.posiciones.length ? rechazo(409, 'posiciones_abiertas') : rechazo(409, 'fase_no_superada')
    }
    const reglas = reglasDe(r), n = fasesDe(reglas), k = r.fase
    if (k >= n) {
      if (i.hija_id != null) return rechazo(422, 'carga_invalida', { en: 'hija_id' })
      carga = { p_sesion: null, p_estado: null, p_mercado: null, p_resumen: { producto: 'reto', reglas: reglas.version, fase: k, completado: true } }
    } else {
      if (i.hija_id == null) return rechazo(422, 'carga_invalida', { en: 'hija_id' })
      let mercado
      try { mercado = await manifiestosVigentes(puertos.almacen, PARES) } catch (e) {
        if (e?.propio && e.codigo) return rechazo(503, 'mercado_no_disponible', { codigo: e.codigo })
        throw e
      }
      // d) el minuto del cierre que supero la fase es de la madre: la hija empieza en el siguiente
      const t = r.superada.en.vela ?? r.superada.en.t
      const inicio = Math.floor(t / 60) * 60 + 60
      const capital = microADecimal(r.capital_inicial_µ)
      const hija = creaReto({ motor: CA.crea({ pares: PARES, costes: COSTES_1, capital, mercado: mercado.fijados }), fase: k + 1, inicio, reglas })
      carga = {
        p_sesion: {}, p_estado: JSON.parse(CA.serializa(hija)), p_mercado: mercado.fijados,
        // e) el mercado vigente al pasar, anotado
        p_resumen: { producto: 'reto', reglas: reglas.version, fase: k + 1, inicio, capital, mercado: mercado.fijados },
      }
    }
  }
  const datos = await llamaRpc(puertos.rpc, 'sim_avanzar_fase', {
    p_actor: actor, p_padre_id: i.padre_id, p_hija_id: i.hija_id, p_command_id: i.command_id, p_sobre: sobreFase(i),
    p_epoca: i.epoca, p_version_esperada: i.version_esperada, ...carga,
  }, puertos.rpcOpciones)
  return { http: datos.http, cuerpo: datos }
}
