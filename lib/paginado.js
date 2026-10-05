// lib/paginado.js — leer TODAS las filas de una consulta, comprobando el total
// (auditoria C04, 4-oct-2026). PostgREST corta cada respuesta en su max-rows
// sin avisar: una lectura «completa» de trades por encima de ese tope evaluaba
// una fraccion como si fuera el todo.
//
// Uso (cliente o servidor, el mismo):
//   const { data, error } = await leerTodo((desde, hasta) =>
//     supabase.from('sim_trades').select('*', { count: 'exact' })
//       .eq('session_id', id).order('closed_at').order('id').range(desde, hasta))
//
// · `construye(desde, hasta)` devuelve la consulta de UNA pagina: con
//   count 'exact' y un ORDEN TOTAL (termina en una columna unica, p. ej. id),
//   o las paginas pueden repetir y saltarse filas.
// · Cada pagina empieza donde acabo la anterior: si el servidor devuelve menos
//   que lo pedido (su max-rows), no se pierde nada.
// · Si el total cambia entre paginas, si una pagina falla o si no llegan
//   exactamente `total` filas: { error }, nunca un conjunto a medias.
const PAGINA = 1000

export async function leerTodo(construye, { pagina = PAGINA } = {}) {
  const filas = []
  let total = null
  for (let vuelta = 0; vuelta < 100000; vuelta++) {
    const { data, error, count } = await construye(filas.length, filas.length + pagina - 1)
    if (error) return { data: null, error }
    if (!Number.isFinite(count)) return { data: null, error: { message: 'la consulta no devolvio el total (falta count: exact)' } }
    if (total === null) total = count
    else if (count !== total) return { data: null, error: { message: `el total cambio durante la lectura (${total} → ${count})` } }
    filas.push(...(data || []))
    if (filas.length >= total) break
    if (!data || data.length === 0) return { data: null, error: { message: `la lectura se detuvo en ${filas.length} de ${total}` } }
  }
  if (filas.length !== total) return { data: null, error: { message: `llegaron ${filas.length} filas de ${total}` } }
  return { data: filas, error: null }
}
