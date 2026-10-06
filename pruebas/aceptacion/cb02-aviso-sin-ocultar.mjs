/**
 * CB02 · EL AVISO DE COBERTURA NO OCULTA DIAS NI PROMETE ARREGLOS
 * (Astra, verificacion parcial de G-APP sobre 4030318; CTO 6-oct-2026)
 *
 * Decision del CTO sobre el modo aviso (G5): nombra todos los dias incompletos
 * del rango o, si son muchos, los primeros y «y N mas», sin ocultar ninguno en
 * silencio; el texto no promete actualizacion diaria ni fecha de arreglo; y
 * usa la lista de dias cortos aceptados (no nombra NZDUSD 2024-03-29).
 *
 * Se ejecuta: el motor real (banco-motor) sobre fetchSessionCandles real y el
 * bucket falso; el aviso es el texto que la sesion pinta para el par activo.
 *
 * ORACULOS, a mano:
 *   12 dias laborables vacios en una sesion cerrada: «12 dias incompletos»,
 *   los 8 primeros por fecha y «y 4 mas».
 *   Tramo abierto (reloj: miercoles 7-oct-2026 12:00 UTC; la ventana abierta
 *   empieza el lunes 5): datos hasta el martes 6 y el lunes 5 vacio → el
 *   aviso nombra el 5-oct (antes quedaba oculto), dice «datos hasta 6-oct» y no
 *   promete nada (ni «actualizacion», ni «se publica», ni fechas futuras).
 *   NZDUSD semana del Viernes Santo de 2024 con el 29-mar en 973 → el aviso no
 *   lo nombra; con 972 si; AUDUSD con 973 si (la lista es por par).
 */
import { titulo, oraculo, fin, escenario, perfil, A } from '../lib.mjs'
import { diaM1 } from '../proveedor-falso.mjs'
const { banco } = await import('../banco-motor.mjs')
const DIA = 86400000
const velas = (dia, n = 1440, desde = 0) => diaM1(dia, 1440).slice(desde, desde + n).map(c => ({ time: c.timestamp / 1000, open: 1.1, high: 1.1, low: 1.1, close: 1.1, volume: 1 }))
const dias = (a, b) => { const o = []; for (let t = Date.parse(a + 'T00:00:00Z'); t <= Date.parse(b + 'T00:00:00Z'); t += DIA) o.push(new Date(t).toISOString().slice(0, 10)); return o }
const dow = d => new Date(d + 'T00:00:00Z').getUTCDay()
const ahoraReal = Date.now.bind(Date)
async function aviso(par, desde, hasta, storage, ahoraIso = null) {
  escenario({ perfiles: [perfil(A)], storage: { 'forex-data': storage } })
  if (ahoraIso) { const d = Date.parse(ahoraIso) - ahoraReal(); Date.now = () => ahoraReal() + d }
  try {
    const b = await banco({ sesion: { id: 's-' + par + desde, user_id: A, name: 'x', pair: par, timeframe: 'M1', balance: 10000, capital_inicial: 10000, date_from: desde, date_to: hasta, last_timestamp: null, challenge_type: null, status: 'active' } })
    return { motor: !!b.motor(), texto: b.ps()?.avisoDatos ?? '', error: b.ps()?.error ?? '' }
  } finally { Date.now = ahoraReal }
}
const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const corta = d => `${Number(d.slice(8))}-${MES[Number(d.slice(5, 7)) - 1]}-${d.slice(0, 4)}`

titulo('1 · muchos dias incompletos: los primeros y «y N mas»')
// 2-mar a 27-mar-2026 (4 semanas); vacios los 12 laborables del 9 al 24 salvo fines de semana
const rango = dias('2026-03-02', '2026-03-27').filter(d => dow(d) >= 1 && dow(d) <= 5)
const vacios = rango.filter(d => d >= '2026-03-09' && d <= '2026-03-24')
const st1 = { 'EURUSD/M1/2026.json': JSON.stringify(dias('2026-01-01', '2026-03-27').filter(d => dow(d) >= 1 && dow(d) <= 5 && !vacios.includes(d)).flatMap(d => velas(d))) }
const a1 = await aviso('EUR/USD', '2026-03-02', '2026-03-27', st1)
const primeros = vacios.slice(0, 8).map(corta)
oraculo('CB02', `${vacios.length} incompletos: lo dice, nombra los 8 primeros en orden y «y ${vacios.length - 8} mas»`, a1.motor && new RegExp(`${vacios.length} dias incompletos`).test(a1.texto) && primeros.every(d => a1.texto.includes(d)) && new RegExp(`y ${vacios.length - 8} mas`).test(a1.texto) && !a1.texto.includes(corta(vacios[8])), a1.texto || a1.error)

titulo('2 · tramo abierto: ningun dia oculto y ninguna promesa')
const hasta6 = dias('2026-01-01', '2026-10-06').filter(d => dow(d) >= 1 && dow(d) <= 5 && d !== '2026-10-05')
const st2 = { 'AUDUSD/M1/2026.json': JSON.stringify(hasta6.flatMap(d => velas(d))) }
const a2 = await aviso('AUD/USD', '2026-09-28', '2026-10-09', st2, '2026-10-07T12:00:00Z')
oraculo('CB02', 'el lunes 5-oct vacio, dentro de la ventana y antes del ultimo dia con datos, se nombra', a2.motor && a2.texto.includes('5-oct-2026'), a2.texto || a2.error)
oraculo('CB02', 'dice «datos hasta 6-oct» y no promete actualizacion ni fecha de arreglo', /datos hasta 6-oct-2026/.test(a2.texto) && !/actualizaci|se publica|se publicara|mañana|pronto|se arreglar|se recuperar/i.test(a2.texto), a2.texto)

titulo('3 · la lista de dias cortos aceptados')
const semana = (n29, par) => ({ [`${par}/M1/2024.json`]: JSON.stringify(dias('2024-01-02', '2024-04-05').filter(d => dow(d) >= 1 && dow(d) <= 5).flatMap(d => d === '2024-03-29' ? velas(d, n29, 1) : velas(d))) })
const a3 = await aviso('NZD/USD', '2024-03-25', '2024-04-05', semana(973, 'NZDUSD'))
const a4 = await aviso('NZD/USD', '2024-03-25', '2024-04-05', semana(972, 'NZDUSD'))
const a5 = await aviso('AUD/USD', '2024-03-25', '2024-04-05', semana(973, 'AUDUSD'))
oraculo('CB02', 'NZDUSD 29-mar-2024 con 973 (aceptado): el aviso no lo nombra', a3.motor && !a3.texto.includes('29-mar-2024'), a3.texto || '(sin aviso)')
oraculo('CB02', 'con 972 si lo nombra, y AUDUSD con 973 tambien (la lista es por par)', a4.texto.includes('29-mar-2024') && a5.texto.includes('29-mar-2024'), `${a4.texto} | ${a5.texto}`)
fin()
