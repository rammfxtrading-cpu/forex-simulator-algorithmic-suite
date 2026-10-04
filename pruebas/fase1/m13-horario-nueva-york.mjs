/**
 * M13 · EL HORARIO DE NUEVA YORK CAMBIA UNA SEMANA ANTES DE LO DEBIDO
 *
 * Astra (4-oct): getNYOffset localiza mal el domingo del cambio cuando el dia
 * 1 no cae en domingo (lib/killzonesDomain.js:13). 2025-03-03 12:00 UTC da
 * 08:00 (debe 07:00) y 2025-10-28 12:00 UTC da 07:00 (debe 08:00). Killzones,
 * Go to y la sesion de cada trade (sessionKeyAt) pasan por toNYHM.
 * Decision del CTO (4-oct, bloque A): la zona IANA.
 *
 * Se ejecuta: toNYHM y sessionKeyAt REALES.
 *
 * ORACULO, a mano y SIN Intl (para no comprobar la zona con la zona): la regla
 * de EE. UU. desde 2007 —horario de verano (UTC−4) desde el SEGUNDO domingo de
 * marzo a las 2:00 locales (= 07:00 UTC) hasta el PRIMER domingo de noviembre
 * a las 2:00 locales de verano (= 06:00 UTC); el resto, UTC−5. Se recorren
 * 2020–2030 (el dia 1 de marzo cae en los siete dias de la semana), el minuto
 * de antes y el de despues de cada cambio, y cada hora de las dos semanas que
 * rodean a cada cambio.
 */
import { titulo, ver, oraculo, fin, importa, escenario } from '../lib.mjs'
const { toNYHM, sessionKeyAt } = await importa('lib/killzonesDomain.js')
escenario()
const H = 3600
const t = iso => Date.parse(iso) / 1000
// n-esimo domingo (1 = primero) de un mes, en UTC (dia del mes)
const domingo = (y, mes, n) => { const d1 = new Date(Date.UTC(y, mes, 1)).getUTCDay(); return 1 + ((7 - d1) % 7) + 7 * (n - 1) }
const inicioVerano = y => Date.UTC(y, 2, domingo(y, 2, 2), 7) / 1000
const finVerano = y => Date.UTC(y, 10, domingo(y, 10, 1), 6) / 1000
const offsetEsperado = ts => { const y = new Date(ts * 1000).getUTCFullYear(); return ts >= inicioVerano(y) && ts < finVerano(y) ? -4 : -5 }
const horaEsperada = ts => { const d = new Date((ts + offsetEsperado(ts) * H) * 1000); return { h: d.getUTCHours(), m: d.getUTCMinutes() } }
const igual = (a, b) => a.h === b.h && a.m === b.m
const fmt = x => `${String(x.h).padStart(2, '0')}:${String(x.m).padStart(2, '0')}`

titulo('0 · el oraculo')
ver('control del oraculo: 2025 → 9-mar 07:00Z y 2-nov 06:00Z; 2026 → 8-mar y 1-nov', inicioVerano(2025) === t('2025-03-09T07:00:00Z') && finVerano(2025) === t('2025-11-02T06:00:00Z')
  && inicioVerano(2026) === t('2026-03-08T07:00:00Z') && finVerano(2026) === t('2026-11-01T06:00:00Z'))
ver('control del oraculo: los dias 1 de marzo de 2020–2030 caen en los siete dias de la semana', new Set(Array.from({ length: 11 }, (_, i) => new Date(Date.UTC(2020 + i, 2, 1)).getUTCDay())).size === 7)

titulo('1 · los casos de Astra')
ver('control: enero y julio coinciden (09:00 y 08:00 NY a las 14:00 y 12:00 UTC)', fmt(toNYHM(t('2025-01-15T14:00:00Z'))) === '09:00' && fmt(toNYHM(t('2025-07-15T12:00:00Z'))) === '08:00')
oraculo('M13', '2025-03-03 12:00 UTC = 07:00 en Nueva York', fmt(toNYHM(t('2025-03-03T12:00:00Z'))) === '07:00', `codigo ${fmt(toNYHM(t('2025-03-03T12:00:00Z')))}`)
oraculo('M13', '2025-10-28 12:00 UTC = 08:00 en Nueva York', fmt(toNYHM(t('2025-10-28T12:00:00Z'))) === '08:00', `codigo ${fmt(toNYHM(t('2025-10-28T12:00:00Z')))}`)
oraculo('M13', 'un trade a las 11:30 UTC del 3-mar-2025 (06:30 NY) no es de NY AM', sessionKeyAt(t('2025-03-03T11:30:00Z')) !== 'nyam', `codigo ${sessionKeyAt(t('2025-03-03T11:30:00Z'))}`)

titulo('2 · 2020–2030: cada cambio y sus dos semanas')
const fallos = []
for (let y = 2020; y <= 2030; y++) {
  for (const cambio of [inicioVerano(y), finVerano(y)]) {
    for (const ts of [cambio - 60, cambio, cambio + 60]) if (!igual(toNYHM(ts), horaEsperada(ts))) fallos.push(`${new Date(ts * 1000).toISOString().slice(0, 16)}Z: ${fmt(toNYHM(ts))} (debe ${fmt(horaEsperada(ts))})`)
    for (let ts = cambio - 7 * 24 * H; ts <= cambio + 7 * 24 * H; ts += H) if (!igual(toNYHM(ts), horaEsperada(ts))) fallos.push(`${new Date(ts * 1000).toISOString().slice(0, 16)}Z`)
  }
}
oraculo('M13', '2020–2030: la hora de NY coincide en todos los minutos frontera y todas las horas de las semanas de cambio', fallos.length === 0, `${fallos.length} discrepancias; p. ej. ${fallos.slice(0, 2).join(' · ')}`)
fin()
