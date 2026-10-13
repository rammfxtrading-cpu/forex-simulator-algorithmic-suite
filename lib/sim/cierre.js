// El cierre total o parcial de la etapa 1 (diseño sim-004, i.1 S4-01a, m.2, n.5,
// o.7): UNA llamada a public.sim_cierre_v0 (sql/sim-004a-preparatoria.sql), que
// inserta el trade y actualiza el saldo en la misma transaccion.
//
// EL SALDO QUE SE MANDA. La base guarda un saldo absoluto. La pantalla aplica
// cada cierre al momento (el motor y el reto leen balanceRef en la misma vela),
// pero a la base se manda «saldo CONFIRMADO + delta de este cierre», calculado
// al enviarlo, y los cierres van EN COLA, uno detras de otro. Asi un cierre que
// falla y se revierte no deja su delta dentro del saldo que manda el siguiente
// (con el saldo de la pantalla, el segundo cierre guardaria un saldo con el pnl
// de un trade que no existe).
//
// Devuelve { estado }:
//   bloqueado   no se mando: el servicio lo impide (o.5); trae motivo
//   guardado    confirmado por la base (o comprobado al releer)
//   fallido     no se guardo NADA: un {error} de la base (la funcion es una
//               transaccion: se deshizo entera)
//   incierto    la respuesta se perdio y la relectura inmediata no encuentra el
//               trade (o fallo): el llamante lo registra (registraIncierto) y lo
//               economico queda bloqueado. NO se revierte enseguida: la
//               transaccion puede seguir en marcha en el servidor y confirmarse
//               despues. «No esta» solo vale pasado ESPERA_INCIERTO_MS
//               (servicio.js), por encima de 2 × statement_timeout.
//
// Un {error} es CIERTO (rollback garantizado) cuando trae un codigo de la base
// (SQLSTATE de 5 caracteres, salvo la clase 08, o PGRSTnnn) o un HTTP 4xx. Lo demas (status 0 =
// fetch roto, 5xx sin codigo de la pasarela, una excepcion) es INCIERTO: la
// base pudo confirmar y la respuesta no llegar (n.5).
import { supabase } from '../supabase'
import { puedeEscribir, registraIncierto, TEXTO_BLOQUEO } from './servicio'
import { avisa } from './avisos'

// Excepcion: la clase 08 (conexion) no es cierta: si la conexion se cae a mitad, el
// COMMIT pudo ocurrir o no.
export const errorCierto = (error, status) => {
  const code = String(error?.code ?? '')
  if (/^08/.test(code)) return false
  return (typeof status === 'number' && status >= 400 && status < 500) || /^([0-9A-Z]{5}|PGRST\d+)$/.test(code)
}
const dos = x => parseFloat(Number(x).toFixed(2))

const st = globalThis.__simCierre ??= { confirmado: {}, cola: Promise.resolve() }
// el saldo que la base tiene confirmado para la sesion (al cargarla, y tras cada cierre guardado)
export const fijaSaldoConfirmado = (sessionId, v) => { st.confirmado[sessionId] = dos(v) }
export const saldoConfirmado = sessionId => st.confirmado[sessionId] ?? null

async function unCierre({ sessionId, delta, lastTimestamp, trade }) {
  const permiso = await puedeEscribir()
  if (!permiso.permitido) return { estado: 'bloqueado', motivo: permiso.motivo }
  const base = st.confirmado[sessionId]
  if (base == null) return { estado: 'bloqueado', motivo: 'sin_estado' }
  const balance = dos(base + delta)
  let r
  try {
    r = await supabase.rpc('sim_cierre_v0', { p_session_id: sessionId, p_balance: balance, p_last_timestamp: lastTimestamp, p_trade: trade })
  } catch (e) { r = { error: { message: String(e?.message ?? e), code: '' }, status: 0 } }
  if (!r.error) { st.confirmado[sessionId] = balance; return { estado: 'guardado', balance } }
  if (errorCierto(r.error, r.status)) return { estado: 'fallido', error: r.error }
  // resultado incierto: releer el trade por su id antes de decidir (n.5)
  let t
  try { t = await supabase.from('sim_trades').select('id').eq('id', trade.id).maybeSingle() } catch (e) { t = { error: e } }
  if (!t?.error && t.data) { st.confirmado[sessionId] = balance; return { estado: 'guardado', balance, releido: true } }
  // ni se sabe: hasta resolverlo no se puede calcular otro saldo
  delete st.confirmado[sessionId]
  return { estado: 'incierto', balance, base, tradeId: trade.id, error: r.error }
}

export function persisteCierre(p) {
  const r = st.cola.then(() => unCierre(p))
  st.cola = r.catch(() => {})
  return r
}

export const nuevoIdTrade = () => globalThis.crypto.randomUUID()

// Lo que hace la pantalla con el resultado, igual para el cierre total y el
// parcial (o.7). `revierte` deshace en memoria lo que el cierre aplico.
// alBloqueo(motivo) pausa el replay (el motor no debe volver a cerrar lo
// revertido en la vela siguiente mientras dura el bloqueo).
export function trasCierre(r, { sessionId, revierte, alBloqueo }) {
  if (r.estado === 'guardado') return
  if (r.estado === 'bloqueado') {
    revierte(); alBloqueo?.(r.motivo)
    avisa(`No se ha guardado el cierre: ${TEXTO_BLOQUEO[r.motivo] ?? 'el simulador no acepta operaciones ahora.'} La posición sigue abierta.`)
    return
  }
  if (r.estado === 'fallido') {
    revierte(); alBloqueo?.('fallido')
    avisa('No se ha podido guardar el cierre: no se ha guardado nada y la posición sigue abierta. Inténtalo de nuevo.')
    return
  }
  // incierto
  alBloqueo?.('incierto')
  registraIncierto({ tradeId: r.tradeId,
    guardado: () => fijaSaldoConfirmado(sessionId, r.balance),
    revierte: () => { fijaSaldoConfirmado(sessionId, r.base); revierte(); avisa('El cierre no llegó a guardarse: la posición vuelve a estar abierta.') } })
}
