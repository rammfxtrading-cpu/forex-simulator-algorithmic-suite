// Avisos al alumno de la etapa 1 (diseño sim-004, o.7): una lista con oyentes.
// Los pinta components/AvisoServicio.js. Un aviso igual al ultimo no se repite
// (el guardado periodico fallando cada 5 s seria una lluvia).
const estado = globalThis.__simAvisos ??= { lista: [], oyentes: new Set() }
export function avisa(texto, tipo = 'error') {
  const ultimo = estado.lista[estado.lista.length - 1]
  if (ultimo && ultimo.texto === texto) return
  estado.lista = [...estado.lista.slice(-4), { id: Date.now() + Math.random(), texto, tipo }]
  for (const f of [...estado.oyentes]) f(estado.lista)
}
export function quitaAviso(id) {
  estado.lista = estado.lista.filter(a => a.id !== id)
  for (const f of [...estado.oyentes]) f(estado.lista)
}
export const avisos = () => estado.lista
export function suscribeAvisos(f) { estado.oyentes.add(f); return () => estado.oyentes.delete(f) }
export function vaciaAvisos() { estado.lista = []; for (const f of [...estado.oyentes]) f(estado.lista) }
// Comprueba el {error} de una escritura no economica (o.7: solo avisa, no revierte)
export function avisaSiError(que) {
  return r => { if (r && r.error) avisa(`No se ha podido guardar ${que}. Comprueba tu conexión.`); return r }
}
