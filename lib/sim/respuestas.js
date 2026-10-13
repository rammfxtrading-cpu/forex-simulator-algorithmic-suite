// d6, la parte de la etapa 1 (diseño sim-004, o.8): que hace la pantalla con la
// respuesta de POST /api/sim/borrar (borrar una sesion legado). El cuerpo es el
// jsonb de la RPC: { ok, http, motivo }.
export function interpretaBorrado(status, cuerpo) {
  const motivo = cuerpo?.motivo ?? null
  if (status === 200 && cuerpo?.ok === true) return { accion: 'quitar', texto: null }
  if (status === 410) return { accion: 'quitar', texto: 'Esa sesión ya estaba borrada.' }
  if (status === 403) return { accion: 'solo_lectura', texto: 'No tienes acceso al simulador ahora mismo: tus sesiones se ven en solo lectura.' }
  if (status === 426) return { accion: 'recargar', texto: 'Hay una versión nueva del simulador: actualiza la página.' }
  if (status === 503) return { accion: 'mantenimiento', texto: 'El simulador está en mantenimiento: no se puede borrar ahora. Inténtalo más tarde.' }
  return { accion: 'error', texto: `No se ha podido borrar la sesión${motivo ? ` (${motivo})` : ''}. Inténtalo de nuevo.` }
}
