// lib/servidor/estado.mjs — LEER el estado confirmado de una sesion v1 en el servidor
// (etapa 3; diseño sim-004 i.2 S4-07, h.11: el cliente no lee `estado` por RLS).
// Sin RPC: una lectura con service_role de la fila (leeSesion), con el acceso ya
// comprobado por el guard (http.mjs). Devuelve el snapshot confirmado con su version,
// epoca, terminal, legado y quien escribe (cliente_id y hasta; el testigo no esta en
// la fila, solo su hash en sim_arrendamientos, que esto no lee). El ACK de un comando
// y este snapshot van separados (persistencia § 6): el cliente instala el snapshot
// solo si su version es mayor que la que tiene.
//   de otro alumno: 404 sesion_no_encontrada (sin decir que existe)
//   no existe o lapida: 410 sesion_borrada
//   motor_version 0 (legado o anterior al corte): 409 no_es_v1 (su lectura es la de hoy)
// ordenEstado({ actor, cuerpo: { session_id }, puertos: { leeSesion } }) → { http, cuerpo }
//
// VALORACION (etapa 2 del motor v1, pieza 5): la calcula aqui el motor sobre el estado confirmado, con los
// ultimos precios de TODOS los pares de la sesion (tambien los que la pantalla no ve), para que la pantalla
// no convierta ni sume nada. Dinero en µUSD como texto entero:
//   equity_µ, flotante_µ { id: … } (flotante de cada posicion; equity = saldo + Σ flotantes, exacto),
//   margen_usado_µ, limites [{ regla, limite_µ }] (los del reto: el motor los aplica) y, en un reto, sus
//   reglas { version, fases, objetivo { fase: % }, perdida_diaria, perdida_maxima, dias_minimos, zona },
//   saldo_medianoche_µ y dias_con_apertura. Si el motor no puede valorar (p. ej. sin cotizacion de un par
//   de conversion), valoracion null: la pantalla no inventa una cifra.
import * as CA from '../motor/cartera.mjs'
import { reglasDe, fasesDe } from '../motor/reto.mjs'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const no = (http, motivo, extra = {}) => ({ http, cuerpo: { ok: false, http, motivo, ...extra } })

export function validaEstado(c) {
  if (!c || typeof c !== 'object' || Array.isArray(c)) return { ok: false, http: 422, motivo: 'carga_invalida', en: 'cuerpo' }
  const extra = Object.keys(c).find(k => k !== 'session_id')
  if (extra !== undefined) return { ok: false, http: 422, motivo: 'carga_invalida', en: extra }
  if (!UUID.test(c.session_id ?? '')) return { ok: false, http: 422, motivo: 'carga_invalida', en: 'session_id' }
  return { ok: true, intencion: { session_id: c.session_id } }
}

const texto = µ => String(µ)
export function valoracionDe(estadoGuardado) {
  try {
    const raiz = CA.deserializa(JSON.stringify(estadoGuardado))
    const reto = raiz?.esquema === 'reto@1' ? raiz : null
    const mo = reto ? raiz.motor : raiz
    if (mo?.esquema !== CA.ESQUEMA) return null
    // el flotante de cada posicion con la MISMA funcion de equity del motor, sobre esa posicion sola
    const flotante_µ = {}
    for (const p of mo.posiciones) flotante_µ[p.id] = texto(CA.equity_µ({ ...mo, posiciones: [p] }) - mo.saldo_µ)
    const v = {
      equity_µ: texto(CA.equity_µ(mo)),
      flotante_µ,
      margen_usado_µ: texto(CA.margenUsado_µ(mo)),
      limites: mo.limites.map(l => ({ regla: l.regla, limite_µ: texto(l.limite_µ) })),
    }
    if (reto) {
      const r = reglasDe(reto)
      v.reglas = r ? { version: r.version, fases: fasesDe(r), objetivo: { ...r.objetivo }, perdida_diaria: r.perdida_diaria, perdida_maxima: r.perdida_maxima, dias_minimos: r.dias_minimos, zona: r.zona } : null
      v.saldo_medianoche_µ = texto(reto.saldo_medianoche_µ)
      v.dias_con_apertura = [...reto.dias_con_apertura]
    }
    return v
  } catch { return null }
}

export async function ordenEstado({ actor, cuerpo, puertos }) {
  const v = validaEstado(cuerpo)
  if (!v.ok) return no(v.http, v.motivo, { en: v.en })
  const f = await puertos.leeSesion(v.intencion.session_id)
  if (!f) return no(410, 'sesion_borrada')
  if (f.user_id !== actor) return no(404, 'sesion_no_encontrada')
  if (f.terminal === 'borrada') return no(410, 'sesion_borrada')
  if (f.motor_version !== 1) return no(409, 'no_es_v1')
  return {
    http: 200,
    cuerpo: {
      ok: true, http: 200, session_id: f.id, motor_version: 1, version: Number(f.version), epoca: f.epoca, terminal: f.terminal ?? null,
      legado: f.legado === true, escritor: f.escritor ? { cliente_id: f.escritor.cliente_id ?? null, hasta: f.escritor.hasta ?? null } : null,
      estado: f.estado,
      valoracion: valoracionDe(f.estado),
    },
  }
}
