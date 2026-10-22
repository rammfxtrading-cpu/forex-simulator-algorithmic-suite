// La cola economica de cada sesion (etapa 1, ronda 2; CTO 13-oct sobre la revision de
// Astra E1-01..E1-04; diseño sim-004, o.13).
//
// TODA operacion economica de una sesion pasa por UNA cola serial: los cierres total y
// parcial (manual, SL/TP y los del breach), la resolucion de los inciertos, el refresco
// del reto y el paso de fase. Cada operacion es una funcion que se ejecuta CUANDO LE TOCA:
// lo que cambia en la pantalla y sus compensaciones se calculan ahi dentro, nunca al pulsar.
//
// Ademas de la cola, por sesion:
//   ocupadas   las posiciones con un cierre pendiente o incierto (E1-02): no se acepta
//              otro cierre sobre ellas (ni manual, ni SL/TP, ni parcial) hasta liberarlas
//   cierres    cuantos cierres estan en la cola o en curso (E1-04: con alguno, no se
//              ofrece ni se manda el paso de fase)
//   barrera    la cola cerrada a cierres nuevos mientras se decide la fase (E1-04)
// Los cambios se avisan a los oyentes (la pagina se repinta: botones deshabilitados).
import { useEffect, useState } from 'react'

const st = globalThis.__simCola ??= { s: {} }
const de = sid => st.s[sid] ??= { cola: Promise.resolve(), cierres: 0, ocupadas: new Set(), barrera: false, oyentes: new Set() }
const avisa = s => { for (const f of [...s.oyentes]) f() }

// Encola op (async) en la cola de la sesion; devuelve su resultado. { cierre: true } la
// cuenta como cierre pendiente desde que se encola hasta que termina.
export function encola(sid, op, { cierre = false } = {}) {
  const s = de(sid)
  if (cierre) { s.cierres++; avisa(s) }
  const r = s.cola.then(() => op())
  const fin = () => { if (cierre) { s.cierres--; avisa(s) } }
  s.cola = r.then(fin, fin)
  return r
}
// Espera a que termine todo lo que ya esta en la cola.
export const esperaCola = sid => encola(sid, () => {})

export const cierresPendientes = sid => de(sid).cierres
export const posicionOcupada = (sid, posId) => de(sid).ocupadas.has(posId)
export const ocupadas = sid => new Set(de(sid).ocupadas)
export const hayOcupadas = sid => de(sid).ocupadas.size > 0
export function ocupa(sid, posId) { const s = de(sid); s.ocupadas.add(posId); avisa(s) }
export function libera(sid, posId) { const s = de(sid); if (s.ocupadas.delete(posId)) avisa(s) }

export const hayBarrera = sid => de(sid).barrera
export function levantaBarrera(sid) { const s = de(sid); s.barrera = true; avisa(s) }
export function bajaBarrera(sid) { const s = de(sid); s.barrera = false; avisa(s) }

export function suscribeCola(sid, f) { const s = de(sid); s.oyentes.add(f); return () => s.oyentes.delete(f) }
export function reiniciaCola() { st.s = {} }

// Hook: repinta al cambiar las posiciones ocupadas, los cierres pendientes o la barrera.
export function useCola(sid) {
  const [, setN] = useState(0)
  useEffect(() => (sid ? suscribeCola(sid, () => setN(n => n + 1)) : undefined), [sid])
  return { ocupadas: sid ? ocupadas(sid) : new Set(), cierres: sid ? cierresPendientes(sid) : 0, barrera: sid ? hayBarrera(sid) : false }
}
