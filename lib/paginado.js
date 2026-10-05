// lib/paginado.js — leer TODAS las filas de una consulta como UN conjunto
// coherente (auditoria C04, 4-oct-2026; bloque D, punto 5, 5-oct-2026).
// PostgREST corta cada respuesta en su max-rows sin avisar, y paginar por
// offset mezcla conjuntos si las filas cambian entre paginas (Astra: pagina 1
// [b,c], entre paginas se borra e y entra a, que ordena antes; la pagina 2 por
// offset es [c,d] y se evaluaba [b,c,c,d] = +800 con un conjunto vigente de −400).
//
// Uso (cliente o servidor, el mismo):
//   const { data, error } = await leerTodo(
//     () => supabase.from('sim_trades').select('*', { count: 'exact' }).eq('session_id', id),
//     { ordena: (a, b) => ... })
//
// · `base()` devuelve la consulta SIN orden ni rango: con count 'exact' y con
//   las columnas created_at e id en lo seleccionado.
// · Pagina POR CLAVE (created_at, id) ascendente: cada pagina pide lo
//   posterior a la ultima fila leida (created_at nunca es null; id es unico).
// · En cada pagina: ids repetidos, o leidas + restantes ≠ total → la lectura
//   no vale.
// · Una sola pagina es una sola sentencia: coherente por si misma. Con varias
//   paginas se lee otra vez entera y se exige que DOS lecturas seguidas
//   coincidan; como mucho `intentos` lecturas. Si no converge: { error }.
// · `ordena` (opcional) ordena el resultado final como lo quiera el consumidor.
// Limite: dos lecturas iguales no son una instantanea transaccional; un cambio
// que se deshace exactamente entre ellas no se ve. Para evaluar un reto con
// garantias, la lectura tiene que ser de una sola sentencia o de una RPC
// (cartera durable, especificacion v2).
const PAGINA = 1000
const INTENTOS = 3

// valor de PostgREST entre comillas (fechas con : . +)
const q = v => `"${String(v).replace(/"/g, '\\"')}"`

async function unaLectura(base, pagina) {
  const filas = [], vistos = new Set()
  let total = null, ultima = null, paginas = 0
  for (let vuelta = 0; vuelta < 100000; vuelta++) {
    let consulta = base()
    if (ultima) consulta = consulta.or(`created_at.gt.${q(ultima.created_at)},and(created_at.eq.${q(ultima.created_at)},id.gt.${q(ultima.id)})`)
    const { data, error, count } = await consulta.order('created_at', { ascending: true }).order('id', { ascending: true }).limit(pagina)
    paginas++
    if (error) return { error }
    if (!Number.isFinite(count)) return { error: { message: 'la consulta no devolvio el total (falta count: exact)' } }
    // count es lo que casa con el filtro de ESTA pagina: el total al empezar,
    // lo que queda despues
    if (total === null) total = count
    else if (filas.length + count !== total) return { invalida: `el conjunto cambio durante la lectura (${filas.length} leidas + ${count} restantes ≠ ${total})` }
    for (const f of data || []) {
      if (f?.id == null || f?.created_at == null) return { error: { message: 'cada fila necesita id y created_at para paginar por clave' } }
      if (vistos.has(f.id)) return { invalida: `fila repetida: ${f.id}` }
      vistos.add(f.id); filas.push(f)
    }
    if (filas.length >= total) break
    if (!data || data.length === 0) return { invalida: `la lectura se detuvo en ${filas.length} de ${total}` }
    ultima = filas[filas.length - 1]
  }
  if (filas.length !== total) return { invalida: `llegaron ${filas.length} filas de ${total}` }
  return { filas, paginas }
}

export async function leerTodo(base, { pagina = PAGINA, ordena = null, intentos = INTENTOS } = {}) {
  let previa = null, motivo = 'sin lecturas'
  for (let i = 0; i < intentos; i++) {
    const r = await unaLectura(base, pagina)
    if (r.error) return { data: null, error: r.error }
    if (r.invalida) { motivo = r.invalida; previa = null; continue }
    // una sola pagina: una sola sentencia, coherente por si misma
    if (r.paginas === 1) return { data: ordena ? r.filas.slice().sort(ordena) : r.filas, error: null }
    const huella = JSON.stringify(r.filas)
    if (previa !== null && previa === huella) return { data: ordena ? r.filas.slice().sort(ordena) : r.filas, error: null }
    motivo = previa === null ? motivo : 'dos lecturas seguidas no coinciden'
    previa = huella
  }
  return { data: null, error: { message: `no se pudo leer un conjunto estable tras ${intentos} lecturas (${motivo})` } }
}

// Comparador por columnas, como ORDER BY de Postgres: [['created_at', 'desc'],
// ['id', 'asc']]; ASC deja los null al final y DESC al principio.
export const porColumnas = cols => (a, b) => {
  for (const [c, dir] of cols) {
    const x = a?.[c], y = b?.[c]
    if (x == null || y == null) {
      if (x == null && y == null) continue
      return (x == null) === (dir === 'desc') ? -1 : 1
    }
    const r = String(x) < String(y) ? -1 : String(x) > String(y) ? 1 : 0
    if (r) return dir === 'desc' ? -r : r
  }
  return 0
}
