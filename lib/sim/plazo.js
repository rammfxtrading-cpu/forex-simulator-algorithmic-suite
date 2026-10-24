// EL PLAZO de las esperas economicas (orden 1-117 del CTO; el Play que se congelo tras un TP o un SL real, 1-106).
// Ninguna peticion a la base ni ninguna espera de la cola de la sesion (lib/sim/cola.js) es ya indefinida: supabase-js
// no pone plazo a fetch y, desde SIMGOTO4-01, el Play, el Step y el Go to esperan a la cola; una peticion que no
// contestaba dejaba los tres modos congelados para siempre.
// 12 s: un cierre normal tarda menos de 1 s (dos peticiones); el cerrojo de sesion de supabase-js (auth-js
// lockAcquireTimeout) puede esperar hasta 5 s antes de una peticion; y queda por debajo de los 20 s con que se resuelve
// un cierre incierto (servicio.js ESPERA_INCIERTO_MS), que es lo que pasa a ser un cierre sin respuesta.
// Mutable solo para las pruebas (globalThis.__simPlazo.ms).
export const PLAZO = globalThis.__simPlazo ??= { ms: 12000 }
export const VENCIDO = Symbol.for('sim.plazo.vencido')

// el valor de `p`, o VENCIDO si no llega en `ms`; la peticion sigue su curso y lo que traiga despues se ignora
export function conPlazo(p, ms = PLAZO.ms) {
  let t
  return Promise.race([Promise.resolve(p), new Promise(r => { t = setTimeout(() => r(VENCIDO), ms) })]).finally(() => clearTimeout(t))
}
