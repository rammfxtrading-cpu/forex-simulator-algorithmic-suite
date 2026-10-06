// lib/mercado/aceptados.mjs — DIAS CORTOS ACEPTADOS (CTO, 6-oct-2026).
//
// Un dia laborable que el proveedor no tiene entero nunca dejaria su año en
// codigo 1 para siempre (bloque G, punto 10). La lista explicita de los que
// se aceptan vive en lib/mercado/dias-aceptados.json: { par, fecha, velas,
// motivo }. Es un fichero versionado y SOLO CAMBIA POR COMMIT: no hay variable
// de entorno ni opcion que lo sustituya. Un dia de la lista con AL MENOS esas
// velas cuenta como completo para ese par (no se repide ni deja el año en 1).
// Un dia que se puede recuperar (el 20-jul-2026) no entra: se recupera.
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'

const PARES = new Set(['AUDCAD', 'AUDUSD', 'EURUSD', 'GBPJPY', 'GBPUSD', 'NZDUSD', 'USDCAD', 'USDCHF', 'USDJPY'])
const RUTA = fileURLToPath(new URL('./dias-aceptados.json', import.meta.url))

// texto JSON → Map('PAR|AAAA-MM-DD' → { velas, motivo }); lanza si algo no vale
export function validaAceptados(texto) {
  const lista = JSON.parse(texto)
  if (!Array.isArray(lista)) throw new Error('dias-aceptados.json: no es una lista')
  const m = new Map()
  lista.forEach((e, i) => {
    const donde = `dias-aceptados.json, entrada ${i + 1}`
    if (!PARES.has(e?.par)) throw new Error(`${donde}: par desconocido`)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(e.fecha ?? '') || new Date(e.fecha + 'T00:00:00Z').toISOString().slice(0, 10) !== e.fecha) throw new Error(`${donde}: fecha no es AAAA-MM-DD`)
    if (!Number.isInteger(e.velas) || e.velas <= 0) throw new Error(`${donde}: velas no es un entero positivo`)
    if (typeof e.motivo !== 'string' || !e.motivo.trim()) throw new Error(`${donde}: falta el motivo`)
    const k = `${e.par}|${e.fecha}`
    if (m.has(k)) throw new Error(`${donde}: ${k} repetido`)
    m.set(k, { velas: e.velas, motivo: e.motivo })
  })
  return m
}
export const cargaAceptados = () => validaAceptados(readFileSync(RUTA, 'utf8'))
