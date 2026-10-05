// lib/tradesEstables.js — los trades de una sesion o de un usuario como UN
// conjunto (bloque E, punto 3; Astra BD-04). Leen por las funciones de
// sql/sim-002-lectura-estable.sql: una sola sentencia → una sola instantanea.
// Paginar, aunque sea por clave y dos veces (lib/paginado.js), podia reunir
// filas de estados distintos (+800 con un conjunto que siempre sumo −400).
// La RLS es la de quien llama (SECURITY INVOKER): el servidor (service_role)
// ve todo; un alumno, lo suyo. Sin sim-002 aplicado, devuelven { error }.
// → { data: [...] , error: null } | { data: null, error }
async function llama(cliente, funcion, args, ordena) {
  const { data, error } = await cliente.rpc(funcion, args)
  if (error) return { data: null, error }
  if (!Array.isArray(data)) return { data: null, error: { message: `${funcion} no devolvio una lista` } }
  return { data: ordena ? data.slice().sort(ordena) : data, error: null }
}
export const tradesDeSesion = (cliente, sessionId, { ordena } = {}) => llama(cliente, 'sim_trades_de_sesion', { p_session_id: sessionId }, ordena)
export const tradesDeUsuario = (cliente, userId, { ordena } = {}) => llama(cliente, 'sim_trades_de_usuario', { p_user_id: userId }, ordena)
