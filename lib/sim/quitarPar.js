// Quitar un par (orden 1-097; GOTODESP1-01, Astra; orden 1-099 del CTO): solo sin operaciones. «Operaciones» son las
// posiciones y las ordenes del par y, ademas, cualquier cierre que no ha terminado en la sesion: pedido y aun en la
// cola, o incierto (la posicion ocupada). Mientras un cierre esta en vuelo, prepara() quita la posicion de la lista;
// si se quitara el par y el cierre fallase, restaura() no tendria donde devolverla y la posicion se perderia. La cola
// no sabe de que par es cada cierre, asi que con uno en vuelo ningun par se quita (son milisegundos). La ✕
// (SessionTopBar.js) y removePair (_SessionInner.js) usan esta misma funcion
import { cierresPendientes, hayOcupadas } from './cola'

export function parConOperaciones(sid, ps) {
  return (ps?.positions?.length || 0) + (ps?.orders?.length || 0) > 0 || (!!sid && (cierresPendientes(sid) > 0 || hayOcupadas(sid)))
}
