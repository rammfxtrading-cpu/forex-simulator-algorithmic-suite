// lib/motor/fuente.mjs — la fuente de mercado de UN instrumento (especificacion
// v2.1, § 1.7, § 3.8, § 12.2, § 12.10; A15, A16, A26). Pura salvo el lector de
// trozos que se le pasa; nada en uso la importa.
//
// Une el manifiesto y los trozos diarios (piezas 3 y 4) con el motor (pieza 2):
//   · A26: solo acepta el manifiesto que la sesion tiene fijado (PAR@version:huella).
//   · tramo(cursor, hasta): las velas en (cursor, hasta] recorriendo los dias
//     por calendario:
//       - sin mercado (horario de Nueva York, sabado) o CERRADO en el
//         manifiesto: se salta;
//       - despues del ultimo dia del manifiesto: fin de datos (tramo abierto),
//         no un fallo;
//       - con mercado y sin trozo, o corto (umbral de calidad.mjs) y no
//         aceptado, o con el trozo alterado o no disponible: DETENCION; nada de
//         ese dia ni de despues (§ 12.2: no_valorable, cursor sin consumir).
//   · avanza(estado, hasta, fuente, { desde }): el comando «avanzar» del motor
//     con esas velas. Si el tramo no es el final de los datos, se añade un
//     centinela despues de «hasta» para que el motor no emita fin_de_datos
//     (el motor lo emite cuando el cursor llega a la ultima vela que recibe).
import * as MF from './manifiesto.mjs'
import { aplica } from './motor.mjs'
import { diaConMercado } from '../mercado/calidad.mjs'

const DIA = 86400
const ymd = s => new Date(s * 1000).toISOString().slice(0, 10)
const CENTINELA = Object.freeze({ time: Infinity })

// aceptados: Map('AAAA-MM-DD' → velas minimas) de los dias cortos aceptados del par
export function creaFuente({ manifiesto, fijado, leeTrozo, aceptados = new Map() }) {
  MF.validaManifiesto(manifiesto)
  if (!MF.coincide(fijado, manifiesto)) throw new RangeError(`version_distinta: la sesion tiene fijado ${fijado}, no ${MF.fija(manifiesto)}`)
  const cerrados = new Set(manifiesto.cerrados)
  const porDia = new Map(manifiesto.dias.map(d => [d.dia, d]))
  const primero = manifiesto.dias[0]?.dia ?? null, ultimo = manifiesto.dias.at(-1)?.dia ?? null
  const ultimaVela = ultimo ? porDia.get(ultimo).ultima : null
  const cache = new Map()            // dia → velas ya comprobadas contra el manifiesto

  // → { velas } | { detencion: { motivo, dia, detalle } }
  function velasDelDia(d) {
    if (cache.has(d)) return { velas: cache.get(d) }
    const e = porDia.get(d)
    if (!e) return { detencion: { motivo: 'no_valorable', dia: d, detalle: 'sin trozo' } }
    const falta = MF.cobertura(manifiesto, d, d)
    if (falta.length && !(aceptados.has(d) && e.velas >= aceptados.get(d))) return { detencion: { motivo: 'no_valorable', dia: d, detalle: falta[0] } }
    const buffer = leeTrozo(d)
    if (buffer == null) return { detencion: { motivo: 'trozo_no_disponible', dia: d } }
    let t
    try { t = MF.leeTrozo(manifiesto, d, buffer) } catch (err) { return { detencion: { motivo: 'trozo_alterado', dia: d, detalle: err.message } } }
    cache.set(d, t.velas)
    return { velas: t.velas }
  }

  // velas en (cursor, hasta]; cursor null = desde el principio (o desde «desde»)
  function tramo(cursor, hasta, { desde = null } = {}) {
    const inicio = cursor != null ? cursor + 60 : (desde ?? (primero ? Date.parse(primero + 'T00:00:00Z') / 1000 : hasta + 60))
    const velas = []
    let detencion = null
    for (let t = Math.floor(inicio / DIA) * DIA; t <= hasta && ultimo && ymd(t) <= ultimo; t += DIA) {
      const d = ymd(t)
      if (!diaConMercado(d, cerrados)) continue
      const r = velasDelDia(d)
      if (r.detencion) { detencion = r.detencion; break }
      for (const v of r.velas) if (v.time >= inicio && v.time <= hasta) velas.push(v)
    }
    // ¿llega este tramo al final de los datos? (sin detencion y pasada la ultima vela)
    const finDeDatos = !detencion && ultimaVela != null && hasta >= ultimaVela
    return { velas, detencion, finDeDatos }
  }

  return { manifiesto: MF.fija(manifiesto), tramo }
}

// → { estado, eventos, detencion | null }
export function avanza(estado, hasta, fuente, { desde = null } = {}) {
  const { velas, detencion, finDeDatos } = fuente.tramo(estado.reloj.cursor, hasta, { desde })
  const r = aplica(estado, { tipo: 'avanzar', hasta }, finDeDatos ? velas : [...velas, CENTINELA])
  return { estado: r.estado, eventos: r.eventos, detencion }
}
