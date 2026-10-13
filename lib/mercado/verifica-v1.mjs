// lib/mercado/verifica-v1.mjs — el VERIFICADOR del mercado v1 publicado
// (etapa 2; diseño sim-004 p.9; § f etapa 2: relectura y sha de cada trozo,
// manifiesto contra el .json.gz dia a dia, tamaño frente a Storage). SOLO
// LECTURA: usa lee y lista del almacen, nunca sube ni borra.
//
// verifica({ almacen, texto, velasDe, diasAceptadosDe }):
//   texto            lib/mercado/huecos-aceptados.jsonl
//   velasDe(par)     las velas del .json.gz (o de la copia local) | null
//   diasAceptadosDe(par) Map de dias cortos aceptados del par
// Por cada par del puntero:
//   · el manifiesto (valido, su huella y su ruta) y la CADENA hasta la raiz,
//     eslabon a eslabon (esContinuacion);
//   · cada trozo: existe, es brotli, su sha es el del nombre y el del
//     manifiesto, decodifica y cuadra con el manifiesto (leeTrozo);
//   · cobertura contigua entre el primer dia y la frontera;
//   · ningun hueco interior de mas de 15 minutos sin aceptar en su trozo (Q1);
//   · el fichero de aceptaciones empieza por el ancla publicada;
//   · los datos: replanificar desde el manifiesto vigente no da incidente (los
//     trozos publicados se regeneran con el mismo sha);
// y los bytes de los trozos frente al listado de Storage.
// → { problemas, avisos, pares: { PAR: { version, cadena, dias, bytes } }, bytes }
import * as MF from '../motor/manifiesto.mjs'
import { huella } from '../motor/binario.mjs'
import { compruebaAncla } from './aceptaciones.mjs'
import { planificaPar } from './publicador-v1.mjs'
import { leePuntero, leeManifiesto, rutaManifiesto, rutaTrozo, descomprime } from './publica-v1.mjs'

const hhmmZ = s => new Date(s * 1000).toISOString().slice(0, 16) + 'Z'

export async function verifica({ almacen, texto, velasDe, diasAceptadosDe }) {
  const problemas = [], avisos = [], pares = {}
  let puntero
  try { puntero = await leePuntero(almacen) } catch (e) { return { problemas: [`puntero ilegible: ${e.message}`], avisos, pares, bytes: 0 } }
  if (!puntero) return { problemas: ['no hay puntero (v1/actual.json): nada publicado'], avisos, pares, bytes: 0 }
  const listado = new Map((await almacen.lista('v1/')).map(o => [o.ruta, o.bytes]))
  let total = 0
  for (const [par, e] of Object.entries(puntero.pares)) {
    let m
    try { m = await leeManifiesto(almacen, e.ruta, e.huella) } catch (err) { problemas.push(`${par}: manifiesto del puntero: ${err.message}`); continue }
    // la cadena
    let cadena = 1, actual = m
    while (actual.anterior) {
      const k = Number(/^v1\.(\d+)$/.exec(actual.version)?.[1])
      const ruta = rutaManifiesto({ par, version: `v1.${k - 1}`, huella: actual.anterior })
      let previo
      try { previo = await leeManifiesto(almacen, ruta, actual.anterior) } catch (err) { problemas.push(`${par}: falta o no vale el eslabon v1.${k - 1} (${err.message})`); break }
      const inc = MF.esContinuacion(previo, actual)
      if (inc) problemas.push(`${par}: ${actual.version} no continua ${previo.version}: ${inc}`)
      actual = previo; cadena++
    }
    if (!actual.anterior && actual.version !== 'v1.1') problemas.push(`${par}: la raiz de la cadena es ${actual.version}, no v1.1`)
    // los trozos
    let bytes = 0
    const tiempos = [], huecosDe = new Map()
    for (const d of m.dias) {
      const ruta = rutaTrozo(par, d.dia, d.sha256)
      const b = await almacen.lee(ruta)
      if (b == null) { problemas.push(`${par} ${d.dia}: falta el trozo ${ruta}`); continue }
      if (listado.has(ruta) && listado.get(ruta) !== b.length) problemas.push(`${par} ${d.dia}: el listado dice ${listado.get(ruta)} bytes y se leyeron ${b.length}`)
      bytes += b.length
      try {
        const crudo = descomprime(b)
        if (huella(crudo) !== d.sha256) throw new Error('otro sha')
        const t = MF.leeTrozo(m, d.dia, crudo)
        for (const v of t.velas) tiempos.push(v.time)
        for (const h of t.huecos) huecosDe.set(h.inicio, h.minutos)
      } catch (err) { problemas.push(`${par} ${d.dia}: trozo no valido (${err.message})`) }
    }
    total += bytes
    // cobertura contigua y huecos aceptados (Q1)
    if (m.dias.length) {
      const falta = MF.cobertura(m, m.dias[0].dia, MF.frontera(m))
      if (falta.length) problemas.push(`${par}: cobertura no contigua: ${falta.slice(0, 5).join(', ')}${falta.length > 5 ? '…' : ''}`)
    }
    tiempos.sort((a, b) => a - b)
    for (const h of MF.huecosInteriores(tiempos, new Set(m.cerrados))) {
      if (h.minutos <= MF.HUECO_MAXIMO) continue
      if (huecosDe.get(hhmmZ(h.ini)) !== h.minutos) problemas.push(`${par}: hueco de ${h.minutos} min desde ${hhmmZ(h.ini)} publicado sin aceptar`)
    }
    // el ancla de aceptaciones
    try { compruebaAncla(texto, m.aceptaciones) } catch (err) { problemas.push(`${par}: ${err.message}`) }
    // los datos, dia a dia (los trozos publicados se regeneran con el mismo sha)
    const velas = await velasDe(par)
    if (velas == null) avisos.push(`${par}: sin datos con que comparar (ni .json.gz autorizado ni copia local): no comprobado`)
    else {
      const p = planificaPar({ par, velas, texto, anterior: m, diasAceptados: diasAceptadosDe(par) })
      if (p.estado === 'incidente') problemas.push(`${par}: los datos no reproducen lo publicado: ${p.incidente}`)
    }
    pares[par] = { version: m.version, cadena, dias: m.dias.length, bytes }
  }
  return { problemas, avisos, pares, bytes: total }
}
