// EL DIA ANCLA DE LOS MERCADOS DE PRUEBA (orden 1-179 (a)). Crear exige ahora date_from/date_to DENTRO del rango publicado
// del mercado vigente (primer–ultimo dia de los manifiestos, lib/servidor/crear.mjs fueraDelMercado), y sigue exigiendo 180
// dias (sobre.mjs). Los mercados de las pruebas son de una o dos semanas: con ellos, ninguna sesion de 180 dias cabe. Este
// ayudante añade a cada plan del publicador (planificaPar) UN TROZO MAS, el dia `dia` (velas planas al ultimo cierre en
// los minutos con mercado de ese dia), y rehace su manifiesto con MF.creaManifiesto (el mismo que usa el publicador; el
// manifiesto no exige cobertura contigua: lo exige el publicador real, que aqui no se usa para ese dia).
// LO QUE CAMBIA EN LA PRUEBA: el rango publicado llega hasta `dia`. Entre el final de las velas de la prueba y `dia` hay
// dias con mercado sin trozo: el motor que avance mas alla de sus velas se DETIENE ahi (no_valorable, «sin trozo») en vez
// de llegar al fin de datos. Solo para la primera publicacion (sin manifiesto anterior). Datos inventados.
import { codifica, decodifica } from '../lib/motor/binario.mjs'
import * as MF from '../lib/motor/manifiesto.mjs'
import { minutoCerrado } from '../lib/mercado/calidad.mjs'

const DIA = 86400
const S = d => Date.parse(d + 'T00:00:00Z') / 1000

export function conAncla(plan, dia) {
  if (plan.estado !== 'publica' || !plan.manifiesto) throw new Error(`conAncla: el plan de ${plan.par} no se publica (${plan.estado})`)
  if (plan.manifiesto.anterior !== null) throw new Error('conAncla: solo para la primera publicacion')
  const ultimo = plan.todos.at(-1)
  if (!(ultimo.dia < dia)) throw new Error(`conAncla: ${dia} no es posterior a ${ultimo.dia}`)
  const cierre = decodifica(ultimo.buffer).velas.at(-1).close
  const velas = []
  for (let t = S(dia); t < S(dia) + DIA; t += 60) if (!minutoCerrado(t, new Set(plan.manifiesto.cerrados))) velas.push({ time: t, open: cierre, high: cierre, low: cierre, close: cierre, volume: 1 })
  if (!velas.length) throw new Error(`conAncla: ${dia} no tiene minutos con mercado`)
  const ancla = { dia, buffer: codifica(plan.par, S(dia), velas, []) }
  const m = plan.manifiesto
  const todos = [...plan.todos, ancla]
  const manifiesto = MF.creaManifiesto({ par: plan.par, version: m.version, trozos: todos, cerrados: m.cerrados, cortosAceptados: m.cortos_aceptados, aceptaciones: m.aceptaciones, anterior: null })
  return { ...plan, manifiesto, todos, nuevos: [...plan.nuevos, ancla] }
}
// los planes de todos los pares, con el mismo dia ancla
export const anclados = (planes, dia) => planes.map(p => conAncla(p, dia))

// la version SIGUIENTE de un plan anclado (servidor-fase: el mercado vigente cambia tras crear): lo publicado, identico, y
// un dia plano mas, `dia`, despues del ancla (una continuacion: solo añadir al final)
export function siguiente(plan, dia) {
  const ultimo = plan.todos.at(-1)
  if (!(ultimo.dia < dia)) throw new Error(`siguiente: ${dia} no es posterior a ${ultimo.dia}`)
  const cierre = decodifica(ultimo.buffer).velas.at(-1).close
  const velas = []
  for (let t = S(dia); t < S(dia) + DIA; t += 60) if (!minutoCerrado(t, new Set(plan.manifiesto.cerrados))) velas.push({ time: t, open: cierre, high: cierre, low: cierre, close: cierre, volume: 1 })
  const nuevo = { dia, buffer: codifica(plan.par, S(dia), velas, []) }
  const m = plan.manifiesto
  const version = `v1.${Number(m.version.slice(3)) + 1}`
  const todos = [...plan.todos, nuevo]
  const manifiesto = MF.creaManifiesto({ par: plan.par, version, trozos: todos, cerrados: m.cerrados, cortosAceptados: m.cortos_aceptados, aceptaciones: m.aceptaciones, anterior: m })
  return { ...plan, estado: 'publica', manifiesto, todos, nuevos: [nuevo] }
}
