/**
 * CB01 · COBERTURA EN MODO AVISO (bloque G, punto 5; CTO, 6-oct-2026)
 *
 * Con el contrato D4 (bloque D, punto 4) una sesion cuyo rango tiene un dia
 * laborable cerrado incompleto no se abre. Casos reales del bucket (diagnostico
 * del 5-oct): el lunes 20-jul-2026 esta corto en los nueve pares (corta a las
 * 14:59, 15:59 o 16:59 UTC segun el par) y AUDUSD acaba el 25-sep (faltan del
 * 28-sep al 2-oct). Con D4 estricto esas sesiones no se pueden usar.
 * Decision del CTO: interruptor COBERTURA_ESTRICTA (en el cliente,
 * NEXT_PUBLIC_COBERTURA_ESTRICTA), apagado por defecto.
 *   · Apagado: la sesion abre y enseña al alumno que dias de su rango estan
 *     incompletos. Lo que no es cobertura sigue rechazandose: OHLC incoherente,
 *     un año de la sesion que no llega, ninguna vela en el rango.
 *   · Encendido: el comportamiento de D4 (no se abre; error con los dias).
 *
 * Se ejecuta: fetchSessionCandles REAL sobre /api/candles REAL y el motor real
 * (banco-motor) con el bucket falso. Reloj fijado en el 6-oct-2026 12:00 UTC
 * para el caso de AUDUSD (la ventana abierta empieza el 2-oct).
 *
 * ORACULOS, a mano:
 *   20-jul-2026 (sesion 13–24 jul; el 20 con 900 velas, 00:00–14:59):
 *   · apagado: los nueve pares abren y marcan SOLO el 20-jul
 *   · encendido: ninguno abre y el error nombra el 2026-07-20
 *   AUDUSD (sesion 21-sep – 2-oct; datos hasta el 25-sep):
 *   · apagado: abre; incompletos 28, 29, 30-sep y 1-oct; el 2-oct es tramo
 *     abierto (datos hasta 25-sep)
 *   · encendido: no abre
 *   Lo que no es cobertura, con el interruptor apagado: OHLC incoherente no
 *   abre; un rango sin velas no abre.
 *   Lo ve el alumno (motor real, interruptor apagado): el par carga y su aviso
 *   dice «20-jul-2026»; encendido: el par queda en error, sin motor.
 */
import { titulo, ver, oraculo, fin, escenario, perfil, A, importa } from '../lib.mjs'
import { diaM1 } from '../proveedor-falso.mjs'
const { fetchSessionCandles } = await importa('lib/sessionData.js')

const PARES = ['EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'USDCAD', 'AUDUSD', 'NZDUSD', 'AUDCAD', 'GBPJPY']
const lab = d => { const w = new Date(d + 'T00:00:00Z').getUTCDay(); return w >= 1 && w <= 5 }
const dias = (desde, hasta) => { const out = []; for (let t = Date.parse(desde + 'T00:00:00Z'); t <= Date.parse(hasta + 'T00:00:00Z'); t += 86400000) out.push(new Date(t).toISOString().slice(0, 10)); return out }
const velas = (dia, n, px = 1.1) => diaM1(dia, n).map(c => ({ time: c.timestamp / 1000, open: px, high: px, low: px, close: px, volume: 1 }))
// 13–24 jul 2026, laborables completos (1.440) salvo el lunes 20 (900: hasta 14:59)
const julio = () => dias('2026-07-13', '2026-07-24').filter(lab).flatMap(d => velas(d, d === '2026-07-20' ? 900 : 1440))
const sesionJulio = par => fetchSessionCandles({ pair: par.slice(0, 3) + '/' + par.slice(3), dateFrom: '2026-07-13', dateTo: '2026-07-24' })
// lo que queda tras el filtro de fin de semana del cliente (viernes desde las 21:00 UTC fuera)
const sinFinde = vs => vs.filter(v => { const d = new Date(v.time * 1000); return !(d.getUTCDay() === 5 && d.getUTCHours() >= 21) })
const abre = r => !!r && !r.error && Array.isArray(r.candles) && r.candles.length > 0
const incompletos = r => (r?.diasIncompletos ?? []).map(x => String(x).slice(0, 10))
const conInterruptor = async (valor, f) => {
  const antes = process.env.NEXT_PUBLIC_COBERTURA_ESTRICTA
  if (valor == null) delete process.env.NEXT_PUBLIC_COBERTURA_ESTRICTA; else process.env.NEXT_PUBLIC_COBERTURA_ESTRICTA = valor
  try { return await f() } finally { if (antes == null) delete process.env.NEXT_PUBLIC_COBERTURA_ESTRICTA; else process.env.NEXT_PUBLIC_COBERTURA_ESTRICTA = antes }
}
const ahoraReal = Date.now.bind(Date)
const conReloj = async (iso, f) => { const d = Date.parse(iso) - ahoraReal(); Date.now = () => ahoraReal() + d; try { return await f() } finally { Date.now = ahoraReal } }

titulo('1 · 20-jul-2026, corto en los nueve pares')
const storageJulio = Object.fromEntries(PARES.map(p => [`${p}/M1/2026.json`, JSON.stringify(julio())]))
escenario({ perfiles: [perfil(A)], storage: { 'forex-data': storageJulio } })
const apagado = await conInterruptor(null, async () => { const o = {}; for (const p of PARES) o[p] = await sesionJulio(p); return o })
const N_JULIO = sinFinde(julio()).length
ver('control: el fixture tiene 10 dias laborables, el 20 con 900 velas', julio().length === 9 * 1440 + 900, julio().length)
oraculo('CB01', 'apagado (por defecto): los nueve pares abren con todas sus velas', PARES.every(p => abre(apagado[p]) && apagado[p].candles.length === N_JULIO), PARES.map(p => `${p}:${apagado[p]?.error ? 'error' : apagado[p]?.candles?.length}`).join(' '))
oraculo('CB01', 'apagado: cada par marca como incompleto solo el 20-jul-2026', PARES.every(p => JSON.stringify(incompletos(apagado[p])) === '["2026-07-20"]'), PARES.map(p => `${p}:${JSON.stringify(incompletos(apagado[p]))}`).join(' '))
for (const valor of ['1', 'true']) {
  const encendido = await conInterruptor(valor, async () => { const o = {}; for (const p of PARES) o[p] = await sesionJulio(p); return o })
  oraculo('CB01', `encendido (${valor}): ningun par abre y el error nombra el 2026-07-20`, PARES.every(p => !abre(encendido[p]) && /2026-07-20/.test(encendido[p]?.error ?? '')), PARES.map(p => `${p}:${encendido[p]?.error ? 'error' : encendido[p]?.candles?.length}`).join(' '))
}
const otro = await conInterruptor('0', () => sesionJulio('EURUSD'))
oraculo('CB01', 'otro valor ("0") cuenta como apagado', abre(otro), otro?.error ?? '')

titulo('2 · AUDUSD sin datos del 28-sep al 2-oct (reloj: 6-oct-2026 12:00 UTC)')
const septiembre = dias('2026-09-21', '2026-09-25').flatMap(d => velas(d, 1440, 0.65))
escenario({ perfiles: [perfil(A)], storage: { 'forex-data': { 'AUDUSD/M1/2026.json': JSON.stringify(septiembre) } } })
const sesionAud = () => conReloj('2026-10-06T12:00:00Z', () => fetchSessionCandles({ pair: 'AUD/USD', dateFrom: '2026-09-21', dateTo: '2026-10-02' }))
const aud0 = await conInterruptor(null, sesionAud)
oraculo('CB01', 'apagado: la sesion de AUDUSD abre con las 5 jornadas que hay', abre(aud0) && aud0.candles.length === sinFinde(septiembre).length, aud0?.error ?? aud0?.candles?.length)
oraculo('CB01', 'apagado: incompletos 28, 29, 30-sep y 1-oct; el 2-oct es tramo abierto con datos hasta el 25-sep', JSON.stringify(incompletos(aud0)) === '["2026-09-28","2026-09-29","2026-09-30","2026-10-01"]' && aud0?.tramoAbierto === true && aud0?.datosHasta === sinFinde(septiembre).at(-1).time, JSON.stringify({ inc: incompletos(aud0), abierto: aud0?.tramoAbierto, hasta: aud0?.datosHasta }))
const aud1 = await conInterruptor('1', sesionAud)
oraculo('CB01', 'encendido: la sesion de AUDUSD no abre y el error nombra el 2026-09-28', !abre(aud1) && /2026-09-28/.test(aud1?.error ?? ''), aud1?.error ?? `${aud1?.candles?.length} velas`)

titulo('3 · apagado no es «todo vale»: lo que no es cobertura sigue sin abrir')
const roto = julio().map((v, i) => i === 3000 ? { ...v, high: 1.0, low: 1.2 } : v)
escenario({ perfiles: [perfil(A)], storage: { 'forex-data': { 'EURUSD/M1/2026.json': JSON.stringify(roto) } } })
const r3 = await conInterruptor(null, () => sesionJulio('EURUSD'))
oraculo('CB01', 'apagado: una vela con high < low no abre', !abre(r3), r3?.error ?? `${r3?.candles?.length} velas sin aviso`)
escenario({ perfiles: [perfil(A)], storage: { 'forex-data': { 'EURUSD/M1/2026.json': JSON.stringify(velas('2026-06-01', 1440)) } } })
const r4 = await conInterruptor(null, () => sesionJulio('EURUSD'))
oraculo('CB01', 'apagado: un rango sin ninguna vela no abre', !abre(r4), r4?.error ?? `${r4?.candles?.length} velas`)

titulo('4 · lo ve el alumno (motor real)')
const { banco } = await import('../banco-motor.mjs')
const ses = { id: 's-julio', user_id: A, name: 'julio', pair: 'EUR/USD', timeframe: 'M1', balance: 10000, capital_inicial: 10000, date_from: '2026-07-13', date_to: '2026-07-24', last_timestamp: null, challenge_type: null, status: 'active' }
escenario({ perfiles: [perfil(A)], storage: { 'forex-data': { 'EURUSD/M1/2026.json': JSON.stringify(julio()) } } })
const b0 = await conInterruptor(null, () => banco({ sesion: ses }))
oraculo('CB01', 'apagado: el par carga en el motor real', !!b0.motor() && !b0.ps()?.error, b0.ps()?.error ?? '')
const aviso = b0.ps()?.avisoDatos ?? ''
oraculo('CB01', 'apagado: el aviso del par (lo pinta la sesion) nombra el 20-jul-2026', /20-jul-2026/.test(aviso), aviso)
escenario({ perfiles: [perfil(A)], storage: { 'forex-data': { 'EURUSD/M1/2026.json': JSON.stringify(julio()) } } })
const b1 = await conInterruptor('1', () => banco({ sesion: { ...ses, id: 's-julio-2' } }))
oraculo('CB01', 'encendido: el par queda en error, sin motor', !b1.motor() && /2026-07-20/.test(b1.ps()?.error ?? ''), b1.ps()?.error ?? 'sin error')
fin()
