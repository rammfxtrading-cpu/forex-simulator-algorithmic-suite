// lib/killzonesDomain.js — Fase 5g
// Helpers de dominio puro para sesiones de mercado (Killzones).
//
// Extraídos verbatim al carácter desde components/KillzonesOverlay.js L5-L68
// (sesión 38, PASO 1 migración Opción C). Cero dependencias React — funciones
// puras + constantes consumibles tanto desde el wrapper React (KillzonesOverlay)
// como desde el primitive LWC (KillzonesPrimitive).

// NY offset: EDT = UTC-4 (Mar-Nov), EST = UTC-5 (Nov-Mar)
export function getNYOffset(utcTs) {
  const d = new Date(utcTs * 1000)
  const yr = d.getUTCFullYear()
  const dstStart = new Date(Date.UTC(yr, 2, 8 - new Date(Date.UTC(yr,2,1)).getUTCDay(), 7))
  const dstEnd   = new Date(Date.UTC(yr, 10, 1 - new Date(Date.UTC(yr,10,1)).getUTCDay(), 6))
  return d >= dstStart && d < dstEnd ? -4 : -5
}

export function toNYHM(utcTs) {
  const off = getNYOffset(utcTs)
  const d = new Date((utcTs + off * 3600) * 1000)
  return { h: d.getUTCHours(), m: d.getUTCMinutes() }
}

export function toMinutes(h, m) { return h * 60 + m }

export const SESSIONS = [
  { key: 'asia',   label: 'Asia KZ',    hStart: 20, mStart: 0, hEnd: 0,  mEnd: 0,  bg: 'rgba(30,144,255,0.10)', border: 'rgba(30,144,255,0.55)', text: '#1E90FF', crossesMidnight: true },
  { key: 'london', label: 'Londres KZ', hStart: 2,  mStart: 0, hEnd: 5,  mEnd: 0,  bg: 'rgba(255,255,255,0.06)', border: 'rgba(220,220,220,0.4)', text: '#ffffff', crossesMidnight: false },
  { key: 'nyam',   label: 'NY AM KZ',   hStart: 7,  mStart: 0, hEnd: 10, mEnd: 0,  bg: 'rgba(255,255,255,0.06)', border: 'rgba(220,220,220,0.4)', text: '#ffffff', crossesMidnight: false },
  { key: 'nypm',   label: 'NY PM KZ',   hStart: 13, mStart: 30,hEnd: 16, mEnd: 0,  bg: 'rgba(255,255,255,0.06)', border: 'rgba(220,220,220,0.4)', text: '#ffffff', crossesMidnight: false },
]

export const TF_LIST = ['M1','M3','M5','M15','M30','H1','H4','D1']

export function inSession(nyH, nyM, sess) {
  const cur = toMinutes(nyH, nyM)
  if (sess.crossesMidnight) return cur >= toMinutes(sess.hStart, sess.mStart)
  return cur >= toMinutes(sess.hStart, sess.mStart) && cur < toMinutes(sess.hEnd, sess.mEnd)
}

export function calcSessions(candles, cfg) {
  const boxes = []
  const active = {}

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i]
    const { h, m } = toNYHM(c.time)

    for (const sess of SESSIONS) {
      if (!cfg[sess.key]) continue
      const inside = inSession(h, m, sess)
      if (inside) {
        if (!active[sess.key]) {
          active[sess.key] = { startTime: c.time, endTime: c.time, high: c.high, low: c.low }
        } else {
          active[sess.key].endTime = c.time
          active[sess.key].high = Math.max(active[sess.key].high, c.high)
          active[sess.key].low  = Math.min(active[sess.key].low,  c.low)
        }
      } else {
        if (active[sess.key]) {
          boxes.push({ ...sess, ...active[sess.key] })
          delete active[sess.key]
        }
      }
    }
  }
  for (const sess of SESSIONS) {
    if (active[sess.key]) boxes.push({ ...sess, ...active[sess.key] })
  }

  return boxes
}

// ── Go-to session (s56, feature Bloque 3) ────────────────────────────────────
// Próxima APERTURA de una killzone a partir de fromIdx (estrictamente futuro, D2).
// Apertura = flanco de subida de inSession sobre las velas del dataset: primera
// vela i > fromIdx dentro de la sesión cuya vela anterior NO lo está. Escanear
// velas reales (no reloj de pared) esquiva findes/festivos/huecos y el destino
// es siempre el time de una vela existente → seek exacto. Devuelve { idx, time }
// o null si no hay ocurrencia antes del fin del dataset (D3).
export function nextSessionOpen(candles, fromIdx, sessKey) {
  const sess = SESSIONS.find(s => s.key === sessKey)
  if (!sess || !candles || !candles.length) return null
  const inAt = (i) => { const { h, m } = toNYHM(candles[i].time); return inSession(h, m, sess) }
  const start = Math.min(Math.max(0, fromIdx + 1), candles.length)
  let prevIn = start > 0 ? inAt(start - 1) : false
  for (let i = start; i < candles.length; i++) {
    const curIn = inAt(i)
    if (curIn && !prevIn) return { idx: i, time: candles[i].time }
    prevIn = curIn
  }
  return null
}

// ── Session tagging (s57, feature Bloque 3) ──────────────────────────────────
// Killzone a la que pertenece un instante: key de la sesión cuya ventana NY
// contiene utcTs, o null si está fuera de toda killzone. Las ventanas de
// SESSIONS no se solapan → primera coincidencia. Misma semántica de bordes que
// el chart ([start, end) en no-cruzadas; asia 20:00→medianoche, predicado
// crossesMidnight de inSession). utcTs en segundos unix, como toNYHM (D1: se
// invoca con el openTime del trade).
export function sessionKeyAt(utcTs) {
  if (!Number.isFinite(utcTs)) return null
  const { h, m } = toNYHM(utcTs)
  for (const sess of SESSIONS) {
    if (inSession(h, m, sess)) return sess.key
  }
  return null
}
