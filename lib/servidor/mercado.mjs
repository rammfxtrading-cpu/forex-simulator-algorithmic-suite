// lib/servidor/mercado.mjs — el lector del mercado v1 para los endpoints
// /api/sim/* (etapa 3; diseño sim-004 e.1, e.2 y q.1). Puro salvo el almacen
// que se le pasa (el puerto de lib/mercado/publica-v1.mjs: lee, y nada mas).
//
//   manifiestosVigentes(almacen, pares)   para CREAR: el puntero v1/actual.json
//       y el manifiesto vigente de cada par → { fijados: { PAR: 'PAR@v1.k:huella' },
//       manifiestos: { PAR: m } }. Sin puntero o sin algun par: error propio.
//   manifiestosFijados(almacen, versiones, pares)   para un COMANDO: los
//       manifiestos que fija el estado (la version efectiva registrada, o la
//       raiz: fuente.mercadoEfectivo), por su ruta y con su huella (A26).
//   creaLector({ almacen, cache }).fuentes(manifiestos, { desde, hasta })
//       las fuentes de lib/motor/fuente.mjs de cada par, con los trozos del
//       tramo leidos DE ANTEMANO (la fuente los pide de forma sincrona): los
//       dias del manifiesto en [desde − 7 d, hasta + 7 d] (la fuente mira hasta
//       una semana atras y adelante para los huecos interiores), con cache por
//       sha (un trozo con sha en el nombre no cambia nunca).
// FALLA CERRADO:
//   · sin mercado publicado, sin un par o con una identidad que no esta: error
//     propio con codigo (mercado_no_publicado, mercado_incompleto,
//     mercado_no_fijado, mercado_no_disponible); el endpoint no llama a la RPC;
//   · un trozo que no esta o que no es el del manifiesto: la FUENTE lo detiene
//     (trozo_no_disponible, trozo_alterado), y el motor no pasa de ese dia;
//   · un error del almacen al leer: error propio, con solo «clase codigo» de lo
//     ajeno (BF-02, lib/mercado/errores.mjs).
import * as MF from '../motor/manifiesto.mjs'
import { creaFuente, mercadoEfectivo } from '../motor/fuente.mjs'
import { leePuntero, leeManifiesto, rutaManifiesto, rutaTrozo, descomprime } from '../mercado/publica-v1.mjs'
import { errorPropio, texto } from '../mercado/errores.mjs'

export const PARES = Object.freeze(['AUDCAD', 'AUDUSD', 'EURUSD', 'GBPJPY', 'GBPUSD', 'NZDUSD', 'USDCAD', 'USDCHF', 'USDJPY'])
const DIA = 86400
const ymd = s => new Date(s * 1000).toISOString().slice(0, 10)
const conCodigo = (codigo, mensaje) => Object.assign(errorPropio(`${codigo}: ${mensaje}`), { codigo })
const FIJADO = /^([A-Z]{6})@(v1\.[1-9]\d*):([0-9a-f]{64})$/

// un error de la lectura (ya propio, de publica-v1) con codigo
async function lectura(codigo, f) {
  try { return await f() } catch (e) { throw conCodigo(codigo, e?.propio ? e.message : texto(e)) }
}

export async function manifiestosVigentes(almacen, pares = PARES) {
  const p = await lectura('mercado_no_disponible', () => leePuntero(almacen))
  if (!p) throw conCodigo('mercado_no_publicado', 'no hay puntero v1/actual.json en el bucket mercado')
  const sin = pares.filter(par => !p.pares[par])
  if (sin.length) throw conCodigo('mercado_incompleto', `el puntero no tiene ${sin.join(', ')}`)
  const manifiestos = {}, fijados = {}
  for (const par of pares) {
    const e = p.pares[par]
    manifiestos[par] = await lectura('mercado_no_disponible', () => leeManifiesto(almacen, e.ruta, e.huella))
    fijados[par] = MF.fija(manifiestos[par])
  }
  return { fijados, manifiestos }
}

export async function manifiestosFijados(almacen, versiones, pares) {
  const out = {}
  for (const par of pares) {
    const fijado = mercadoEfectivo(versiones, par)
    if (fijado == null) throw conCodigo('mercado_no_fijado', `el estado no fija mercado para ${par}`)
    const m = FIJADO.exec(fijado)
    if (!m || m[1] !== par) throw conCodigo('mercado_no_fijado', `identidad fijada de ${par} no valida`)
    const ruta = rutaManifiesto({ par, version: m[2], huella: m[3] })
    out[par] = await lectura('mercado_no_disponible', () => leeManifiesto(almacen, ruta, m[3]))
    if (!MF.coincide(fijado, out[par])) throw conCodigo('mercado_no_disponible', `${ruta} no es ${fijado}`)
  }
  return out
}

// cache por sha con tope (sale el menos usado): Map conserva el orden de insercion
export function creaCache(tope = 2000) {
  const m = new Map()
  return {
    toma(k) { if (!m.has(k)) return null; const v = m.get(k); m.delete(k); m.set(k, v); return v },
    pon(k, v) { m.delete(k); m.set(k, v); while (m.size > tope) m.delete(m.keys().next().value) },
    get tamano() { return m.size },
  }
}
const CACHE = creaCache()

export function creaLector({ almacen, cache = CACHE }) {
  async function trozo(par, d) {
    const k = d.sha256
    const ya = cache.toma(k)
    if (ya) return ya
    const ruta = rutaTrozo(par, d.dia, d.sha256)
    let b
    try { b = await almacen.lee(ruta) } catch (e) { throw conCodigo('mercado_no_disponible', `leer ${ruta}: ${e?.propio ? e.message : texto(e)}`) }
    if (b == null) return null                       // la fuente lo detiene (trozo_no_disponible)
    let crudo
    try { crudo = descomprime(b) } catch { return Buffer.alloc(0) }   // no es brotli: la fuente lo detiene (trozo_alterado)
    // solo se guarda en la cache lo que es el trozo del manifiesto
    try { MF.leeTrozo({ par, version: '', dias: [d] }, d.dia, crudo); cache.pon(k, crudo) } catch { /* alterado: no se guarda */ }
    return crudo
  }
  // → { PAR: fuente }
  async function fuentes(manifiestos, { desde, hasta }) {
    const ini = ymd(Math.min(desde, hasta) - 7 * DIA), fin = ymd(hasta + 7 * DIA)
    const out = {}
    for (const [par, m] of Object.entries(manifiestos)) {
      const buffers = new Map()
      for (const d of m.dias) if (d.dia >= ini && d.dia <= fin) buffers.set(d.dia, await trozo(par, d))
      out[par] = creaFuente({ manifiesto: m, fijado: MF.fija(m), leeTrozo: dia => buffers.get(dia) ?? null })
    }
    return out
  }
  return { fuentes }
}
