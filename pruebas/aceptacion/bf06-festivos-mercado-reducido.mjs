/**
 * BF06 · 25-DIC Y 1-ENE: MERCADO REDUCIDO, NO CIERRES
 * (CTO, 6-oct-2026, sobre 4030318)
 *
 * La instruccion de G7 los daba por «cierres completos confirmados»; medido en
 * la copia del bucket (5-oct, nueve pares): el 1-ene (2024, 2025, 2026) tiene
 * 94 a 119 velas desde ~22:00 hasta las 23:59 UTC; el 25-dic (2024, 2025),
 * 157 a 510 velas de 00:00 a 23:59. Decision del CTO: mercado reducido con la
 * regla del domingo (completo si tiene velas en su ultima hora UTC); la lista
 * de cierres confirmados queda vacia. Sin umbral de laborable (no lo alcanzan).
 *
 * ORACULOS, a mano, con los recuentos reales:
 *   calidad.estadoDia: 1-ene con 94 velas (22:04–23:59) y con 119 → completo;
 *   25-dic con 157 velas repartidas hasta las 23:59 → completo; vacio →
 *   pendiente; cortado a las 14:59 → pendiente. CIERRES_CONFIRMADOS vacio.
 *   Actualizador (hoy martes 29-dic-2026, guardado hasta el 24-dic): el 25-dic
 *   sin datos queda pendiente y corta la cola (el lunes 28 no se publica);
 *   cuando llegan sus 157 velas, se publica hasta el 28.
 */
import { titulo, ver, oraculo, fin, escenario, proveedor, importa, guardado } from '../lib.mjs'
import { diaM1 } from '../proveedor-falso.mjs'
import { correScript, ejecucionesScripts } from '../script-falso.mjs'
let C = null
try { C = await importa('lib/mercado/calidad.mjs') } catch { C = null }
const DIA = 86400000
const S = iso => Date.parse(iso) / 1000
const vela = t => ({ time: t, open: 1.1, high: 1.1, low: 1.1, close: 1.1, volume: 1 })
// n velas seguidas que acaban a las 23:59 UTC del dia
const hastaElFinal = (dia, n) => Array.from({ length: n }, (_, i) => vela(S(dia + 'T00:00:00Z') + 86400 - 60 * (n - i)))
// n velas repartidas por el dia (cada 9 minutos) desde las 00:00 y la ultima a las 23:59
const repartidas = (dia, n) => [...Array.from({ length: n - 1 }, (_, i) => vela(S(dia + 'T00:00:00Z') + 540 * i)), vela(S(dia + 'T23:59:00Z'))]
const estado = (d, v) => C?.estadoDia ? C.estadoDia(d, v) : 'sin-modulo'

titulo('1 · calidad.estadoDia con los recuentos medidos')
oraculo('BF06', '1-ene con 94 y con 119 velas hasta las 23:59 → completo', estado('2026-01-01', hastaElFinal('2026-01-01', 94)) === 'completo' && estado('2025-01-01', hastaElFinal('2025-01-01', 119)) === 'completo', `${estado('2026-01-01', hastaElFinal('2026-01-01', 94))} / ${estado('2025-01-01', hastaElFinal('2025-01-01', 119))}`)
oraculo('BF06', '25-dic con 157 velas repartidas hasta las 23:59 → completo', estado('2025-12-25', repartidas('2025-12-25', 157)) === 'completo', estado('2025-12-25', repartidas('2025-12-25', 157)))
oraculo('BF06', '25-dic y 1-ene vacios → pendiente (no se dan por cerrados)', estado('2026-12-25', []) === 'pendiente' && estado('2027-01-01', []) === 'pendiente', `${estado('2026-12-25', [])} / ${estado('2027-01-01', [])}`)
const cortado = repartidas('2025-12-25', 157).filter(v => v.time < S('2025-12-25T15:00:00Z'))
oraculo('BF06', '25-dic cortado a las 14:59 → pendiente', estado('2025-12-25', cortado) === 'pendiente', `${cortado.length} velas · ${estado('2025-12-25', cortado)}`)
oraculo('BF06', 'la lista de cierres confirmados existe y esta vacia', C?.CIERRES_CONFIRMADOS instanceof Set && C.CIERRES_CONFIRMADOS.size === 0, C?.CIERRES_CONFIRMADOS ? `${C.CIERRES_CONFIRMADOS.size} entrada(s)` : 'no existe')

titulo('2 · el actualizador: el 25-dic sin datos corta la cola')
const ENV = { NEXT_PUBLIC_SUPABASE_URL: 'https://falso.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'falsa' }
const velasDe = (dia, n = 1440) => diaM1(dia, n).map(c => ({ time: c.timestamp / 1000, open: c.open, high: c.high, low: c.low, close: c.close, volume: 1 }))
// 2026 hasta el 24-dic con dias reales: 1-ene de 112 velas (22:08–23:59), laborables enteros, domingos de 120
const historial = hasta => { const v = [...hastaElFinal('2026-01-01', 112)]; for (let t = Date.parse('2026-01-02T00:00:00Z'); t <= Date.parse(hasta + 'T00:00:00Z'); t += DIA) { const w = new Date(t).getUTCDay(), d = new Date(t).toISOString().slice(0, 10); if (w >= 1 && w <= 5) v.push(...velasDe(d)); else if (w === 0) v.push(...velasDe(d).slice(22 * 60)) } return v }
const enDia = (arr, d) => (arr || []).filter(v => new Date(v.time * 1000).toISOString().startsWith(d)).length
const filasMs = vs => JSON.stringify(vs.map(v => ({ timestamp: v.time * 1000, open: v.open, high: v.high, low: v.low, close: v.close, volume: 1 })))
let navidad = false
const responde = () => { proveedor.http = (url, n, { instrumento, dia }) => {
  if (dia === '2026-12-25') return navidad ? { status: 200, body: filasMs(repartidas('2026-12-25', 157)) } : { status: 404, body: '' }
  const w = new Date(dia + 'T00:00:00Z').getUTCDay()
  return { status: 200, body: JSON.stringify(w === 0 ? diaM1(dia).slice(22 * 60) : diaM1(dia)) }
} }
escenario({ storage: { 'forex-data': { 'EURUSD/M1/2026.json': JSON.stringify(historial('2026-12-24')) } } }); responde()
const r1 = await correScript('scripts/actualizar-diario.js', { ahora: '2026-12-29T06:00:00Z', argv: ['--subir', '--pares', 'EURUSD'], env: ENV })
const g1 = guardado('EURUSD/M1/2026').velas
const lin1 = r1.salida.find(l => l.includes('EURUSD/M1')) ?? ''
oraculo('BF06', 'el 25-dic sin datos queda pendiente y el lunes 28 no se publica', enDia(g1, '2026-12-28') === 0 && /pendiente \(sin datos del proveedor\): 2026-12-25/.test(lin1), `28-dic: ${enDia(g1, '2026-12-28')} · ${lin1}`)
navidad = true
const r2 = await correScript('scripts/actualizar-diario.js', { ahora: '2026-12-29T07:00:00Z', argv: ['--subir', '--pares', 'EURUSD'], env: ENV })
const g2 = guardado('EURUSD/M1/2026').velas
oraculo('BF06', 'con sus 157 velas, el 25-dic se publica y la cola llega al lunes 28', enDia(g2, '2026-12-25') === 157 && enDia(g2, '2026-12-28') === 1440, `25-dic ${enDia(g2, '2026-12-25')} · 28-dic ${enDia(g2, '2026-12-28')} · ${r2.salida.find(l => l.includes('EURUSD/M1')) ?? ''}`)
proveedor.http = null
ver('control (H06): ningun script por timeout', ejecucionesScripts.every(e => e.terminoPor !== 'timeout'))
fin()
