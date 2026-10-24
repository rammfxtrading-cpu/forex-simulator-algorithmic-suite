// LAS ORDENES DE LA PANTALLA COMO COMANDOS V1 (etapa 2 del motor, pieza 3). Puro: traduce lo que hace el alumno (abrir a
// mercado, limit o stop; mover un tirador; quitar un SL/TP; cancelar; cerrar total o parcial) a { tipo, carga } para el
// cliente de comandos (cliente.js envia(tipo, carga)). Los precios se ajustan al tick del par (orden 1-119, la misma
// regla que la pantalla y el motor) y van en TEXTO; los lotes, en texto de paso 0,01. La pantalla no cambia nada hasta
// que el estado confirmado vuelve (vista.js).
import { aTickDelPar, decimalesDe } from '../vela'

const sinBarra = pair => String(pair).replace('/', '')
export function precioTexto(x, pair) {
  if (x == null || x === '') return null
  const d = decimalesDe(pair), t = aTickDelPar(x, pair)
  if (t <= 0n) throw new RangeError(`precio no positivo: ${x}`)
  const s = t.toString().padStart(d + 1, '0')
  return `${s.slice(0, -d)}.${s.slice(-d)}`
}
export function lotesTexto(l) {
  const n = Number(l), c = Math.round(n * 100)
  if (!Number.isFinite(n) || c <= 0 || Math.abs(n * 100 - c) > 1e-6) throw new RangeError(`lotes no validos (paso 0,01): ${l}`)
  return String(c / 100)
}
const LADOS = { BUY: ['BUY', 'mercado'], SELL: ['SELL', 'mercado'], BUY_LIMIT: ['BUY', 'limit'], SELL_LIMIT: ['SELL', 'limit'], BUY_STOP: ['BUY', 'stop'], SELL_STOP: ['SELL', 'stop'] }

export function comandoAbrir({ pair, side, entry = null, lots, sl = null, tp = null, cursor = null }) {
  const ls = LADOS[side]
  if (!ls) throw new RangeError(`lado no valido: ${side}`)
  const [lado, orden] = ls
  const carga = { par: sinBarra(pair), lado, orden, lotes: lotesTexto(lots) }
  if (orden !== 'mercado') carga.precio = precioTexto(entry, pair)
  if (sl != null) carga.sl = precioTexto(sl, pair)
  if (tp != null) carga.tp = precioTexto(tp, pair)
  if (orden === 'mercado') carga.cotizadoEn = cursor
  return { tipo: 'abrir', carga }
}
const TIRADOR = { sl: 'sl', tp: 'tp', lim_sl: 'sl', lim_tp: 'tp', lim_e: 'precio' }
export function comandoTirador({ id, type, price, pair }) {
  const k = TIRADOR[type]
  if (!k) throw new RangeError(`tirador no valido: ${type}`)
  return { tipo: 'modificar', carga: { id, [k]: precioTexto(price, pair) } }
}
export const comandoQuita = ({ id, que }) => ({ tipo: 'modificar', carga: { id, [que === 'tp' ? 'tp' : 'sl']: null } })
export const comandoCancelar = id => ({ tipo: 'cancelar', carga: { id } })
export const comandoCerrar = (id, lots = null) => ({ tipo: 'cerrar', carga: lots == null ? { id } : { id, lotes: lotesTexto(lots) } })
