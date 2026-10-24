// El progreso guardado de una sesion (last_timestamp) nunca retrocede (SIMGOTO2-02, Astra; orden 1-087 del
// CTO). Lo escriben dos caminos, el guardado (usePairData.saveProgress: pausa, Step, onEnd, cambio de par) y
// el cierre atomico (lib/sim/cierre.js, sim_cierre_v0); los dos pasan por aqui. El valor es el mayor de: lo
// ya escrito o cargado de esta sesion, el que se pide y el reloj maestro (el progreso en memoria). Un cierre
// de un par atrasado (su vela es de antes) ya no baja lo guardado.

const g = globalThis.__simProgreso ??= { s: {} }

// al cargar la sesion: lo guardado es el suelo
export function siembraProgreso(sid, ts) {
  if (!sid || !Number.isFinite(ts)) return
  g.s[sid] = Math.max(g.s[sid] ?? 0, ts)
}

// el valor a escribir (y queda anotado); null si no hay nada que escribir
export function progresoMonotono(sid, ts) {
  if (!sid) return ts ?? null
  // el reloj maestro (lib/sessionData.js getMasterTime: el mismo global; sin importarlo, lib/sim no depende de lib)
  const m = typeof window === 'undefined' ? null : window.__algSuiteCurrentTime
  const v = Math.max(g.s[sid] ?? 0, Number.isFinite(ts) ? ts : 0, Number.isFinite(m) ? m : 0)
  if (!v) return ts ?? null
  g.s[sid] = v
  return v
}
