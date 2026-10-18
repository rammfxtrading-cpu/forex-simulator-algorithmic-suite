// EL DOBLE DEL CERROJO del mercado v1 (public.mercado_cerrojo, sql/mercado-000-
// cerrojo.sql; E2R3-01): la misma semantica que la base, en memoria.
//   adquiere(recurso, dueno, descripcion) → 'ok' | 'existe' (INSERT con clave recurso)
//   lee(recurso)                          → { dueno, desde, descripcion } | null
//   suelta(recurso, dueno)                → filas borradas: DELETE ... WHERE recurso AND dueno
// fallos: { adquiere, lee, suelta }: (args) => Error para lanzar, 'tarde' (la
// operacion NO se hace ahora: se guarda en tardias para hacerla despues, y se
// lanza ETIMEDOUT, como una respuesta agotada con la peticion aun en el
// servidor), 'perdida' (se hace, y se lanza ETIMEDOUT: la respuesta se pierde),
// o nada. registro (opcional): un array comun con el del almacen, para ver el
// orden de todo. La semantica de la base se ensaya aparte, en PostgreSQL
// (pruebas/mercado-000-cerrojo.mjs).
export function cerrojoEnMemoria({ fallos = {}, reloj = () => '2026-10-14T10:00:00.000Z', registro = [] } = {}) {
  const filas = new Map(), tardias = []
  const agotado = () => Object.assign(new Error('respuesta agotada; peticion aun en el servidor'), { code: 'ETIMEDOUT' })
  const op = (nombre, args, hacer) => {
    registro.push([nombre, ...args])
    const f = fallos[nombre]?.(...args)
    if (f === 'tarde') { tardias.push(hacer); throw agotado() }
    if (f === 'perdida') { hacer(); throw agotado() }
    if (f instanceof Error) throw f
    return hacer()
  }
  const adquiere = (recurso, dueno, descripcion) => { if (filas.has(recurso)) return 'existe'; filas.set(recurso, { dueno, desde: reloj(), descripcion }); return 'ok' }
  const suelta = (recurso, dueno) => { const x = filas.get(recurso); if (x && x.dueno === dueno) { filas.delete(recurso); return 1 } return 0 }
  return {
    filas, registro, tardias,
    async adquiere(r, d, desc) { return op('adquiere', [r, d, desc], () => adquiere(r, d, desc)) },
    async lee(r) { return op('lee', [r], () => (filas.has(r) ? { ...filas.get(r) } : null)) },
    async suelta(r, d) { return op('suelta', [r, d], () => suelta(r, d)) },
    // pone una fila a mano (otro proceso, o una ficha rara)
    pon(recurso, fila) { filas.set(recurso, { desde: reloj(), ...fila }) },
    // termina las operaciones que llegaron tarde
    terminaTardias() { const l = tardias.splice(0); return l.map(f => f()) },
  }
}
