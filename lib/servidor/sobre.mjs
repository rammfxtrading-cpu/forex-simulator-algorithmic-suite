// lib/servidor/sobre.mjs — la INTENCION que acepta cada endpoint /api/sim/* y su
// sobre canonico (etapa 3; diseño sim-004 b.1, b.2; persistencia § 4.1).
//
// b.1: el cuerpo es SOLO intencion. Se valida cerrado: claves conocidas, tipos y
// rangos; lo que sobra o no cuadra es 422 carga_invalida, con «en» = la clave.
// Nunca se acepta estado, saldo, eventos, version resultante ni dueño.
// El sobre canonico es {tipo, payload} con las claves ordenadas a todos los
// niveles: la RPC calcula su digest (sha256 del texto) y con el decide la
// idempotencia (mismo command_id y mismo sobre → el mismo recibo).
import { ACCOUNT_SIZES } from '../challengeRules.js'

export const PARES = Object.freeze(['AUDCAD', 'AUDUSD', 'EURUSD', 'GBPJPY', 'GBPUSD', 'NZDUSD', 'USDCAD', 'USDCHF', 'USDJPY'])
// el par como lo guarda y lo enseña la web hoy (lib/sessionUi.js, ALL_PAIRS)
const CON_BARRA = Object.fromEntries(PARES.map(p => [p, `${p.slice(0, 3)}/${p.slice(3)}`]))
export const TIMEFRAMES = Object.freeze(['M1', 'M3', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1'])   // lib/sessionUi.js, TF_LIST
export const RETOS = Object.freeze(['1F', '2F', '3F'])                                      // lib/challengeRules.js
// las reglas de fechas de hoy (pages/dashboard.js, createSession), ahora en el servidor
export const PRIMER_DIA = '2024-07-01'
export const DIAS_MINIMOS = 180

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const esDia = d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && new Date(d + 'T00:00:00Z').toISOString().slice(0, 10) === d
const DIA_MS = 86400000

// ── canonico ────────────────────────────────────────────────────────────────
const ordena = v => (Array.isArray(v) ? v.map(ordena) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, ordena(v[k])])) : v)
export const canonico = v => JSON.stringify(ordena(v))

// ── rechazo ─────────────────────────────────────────────────────────────────
const no = en => ({ ok: false, http: 422, motivo: 'carga_invalida', en })
// el objeto tiene solo estas claves (y las obligatorias)
function claves(c, permitidas) {
  if (!c || typeof c !== 'object' || Array.isArray(c)) return no('cuerpo')
  const extra = Object.keys(c).find(k => !permitidas.includes(k))
  return extra === undefined ? null : no(extra)
}
// el par: 'EURUSD' o 'EUR/USD' → { par (el del motor), pair (el de la tabla) } | null
export function par(texto) {
  const p = typeof texto === 'string' ? texto.replace('/', '') : null
  return p && PARES.includes(p) && (texto === p || texto === CON_BARRA[p]) ? { par: p, pair: CON_BARRA[p] } : null
}
// capital: practica, un decimal positivo con como mucho dos decimales (centimos:
// la economia es exacta en µUSD); reto, uno de ACCOUNT_SIZES
function capital(v, reto) {
  const t = typeof v === 'number' && Number.isFinite(v) ? String(v) : v
  if (typeof t !== 'string' || !/^(0|[1-9]\d{0,11})(\.\d{1,2})?$/.test(t) || !(Number(t) > 0)) return null
  if (reto && !ACCOUNT_SIZES.includes(Number(t))) return null
  return reto ? String(Number(t)) : t
}

// ── crear ───────────────────────────────────────────────────────────────────
const CLAVES_CREAR = ['session_id', 'command_id', 'epoca', 'name', 'pair', 'timeframe', 'date_from', 'date_to', 'capital', 'challenge_type']
// → { ok: true, intencion } | { ok: false, http, motivo, en }. ahora: ms (el «ayer» es UTC)
export function validaCrear(c, { ahora }) {
  const e = claves(c, CLAVES_CREAR); if (e) return e
  if (!UUID.test(c.session_id ?? '')) return no('session_id')
  if (!UUID.test(c.command_id ?? '')) return no('command_id')
  if (!Number.isInteger(c.epoca)) return no('epoca')
  if (typeof c.name !== 'string' || c.name.length < 1 || c.name.length > 100) return no('name')
  const p = par(c.pair); if (!p) return no('pair')
  if (!TIMEFRAMES.includes(c.timeframe)) return no('timeframe')
  const tipo = c.challenge_type ?? null
  if (tipo !== null && !RETOS.includes(tipo)) return no('challenge_type')
  const ayer = new Date(ahora - DIA_MS).toISOString().slice(0, 10)
  if (!esDia(c.date_from) || c.date_from < PRIMER_DIA || c.date_from > ayer) return no('date_from')
  if (!esDia(c.date_to) || c.date_to > ayer || c.date_to < PRIMER_DIA) return no('date_to')
  if ((Date.parse(c.date_to) - Date.parse(c.date_from)) / DIA_MS < DIAS_MINIMOS) return no('date_to')
  const cap = capital(c.capital, tipo !== null); if (cap == null) return no('capital')
  return {
    ok: true,
    intencion: { session_id: c.session_id, command_id: c.command_id, epoca: c.epoca, name: c.name, par: p.par, pair: p.pair, timeframe: c.timeframe, date_from: c.date_from, date_to: c.date_to, capital: cap, challenge_type: tipo },
  }
}
// el sobre de crear: la intencion sin la clave (command_id) ni la epoca, que van aparte
// ── tomar el escritor («Usar aqui»; persistencia § 4.2, D-16, D-18) ────────────
const CLAVES_TOMAR = ['session_id', 'command_id', 'epoca', 'cliente_id', 'forzar']
export function validaTomar(c) {
  const e = claves(c, CLAVES_TOMAR); if (e) return e
  if (!UUID.test(c.session_id ?? '')) return no('session_id')
  if (!UUID.test(c.command_id ?? '')) return no('command_id')
  if (!Number.isInteger(c.epoca)) return no('epoca')
  if (typeof c.cliente_id !== 'string' || c.cliente_id.length < 1 || c.cliente_id.length > 100) return no('cliente_id')
  if (c.forzar !== undefined && typeof c.forzar !== 'boolean') return no('forzar')
  return { ok: true, intencion: { session_id: c.session_id, command_id: c.command_id, epoca: c.epoca, cliente_id: c.cliente_id, forzar: c.forzar === true } }
}
export const sobreTomar = i => canonico({ tipo: 'tomar_escritor', payload: { session_id: i.session_id, cliente_id: i.cliente_id, forzar: i.forzar } })

export const sobreCrear = i => canonico({ tipo: 'crear', payload: { session_id: i.session_id, name: i.name, pair: i.pair, timeframe: i.timeframe, date_from: i.date_from, date_to: i.date_to, capital: i.capital, challenge_type: i.challenge_type } })
