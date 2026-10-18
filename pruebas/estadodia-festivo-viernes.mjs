/**
 * EL FESTIVO EN VIERNES (CTO 14-oct, sobre cd99f06). Escrito ANTES que el codigo.
 *
 * calidad.estadoDia daba a los festivos (25-dic, 1-ene) la regla del domingo:
 * completo si tiene velas desde las 23:00 UTC. El viernes el mercado cierra a
 * las 17:00 de Nueva York (21:00 UTC en verano, 22:00 en invierno): un festivo
 * en viernes no salia nunca completo, y el 25-dic-2026 y el 1-ene-2027 son
 * viernes. Retenian todo lo posterior en el publicador del mercado v1 y
 * cortaban la cola del diario.
 *
 * Lo medido (base 2026-10-14-mercado-v1-base-b52730, 14-oct): los 1.305
 * viernes de los 9 pares acaban en la ultima hora con mercado (20:53–20:59 UTC
 * en verano, 21:58–21:59 en invierno), tambien los tres Viernes Santos.
 *
 * La regla: un festivo esta completo si tiene velas en su ULTIMA HORA CON
 * MERCADO segun el horario (la de calidad.minutoCerrado): las 23:00 UTC de
 * domingo a jueves (la de antes) y la del cierre el viernes.
 *
 * Que no cambie ningun dia que hoy sea correcto: estadoDia contra la regla de
 * antes, copiada aqui («hoy»), en todos los dias de 2024 a 2028 y con varios
 * perfiles de velas; solo pueden cambiar los festivos en viernes.
 * Los dos usos: el diario (scripts/actualizar-diario.js, con su arnes) y el
 * publicador del mercado v1 (planificaPar).
 */
import { titulo, ver, oraculo, fin, escenario, proveedor, importa, guardado } from './lib.mjs'
import { diaM1 } from './proveedor-falso.mjs'
import { correScript, ejecucionesScripts } from './script-falso.mjs'
const C = await importa('lib/mercado/calidad.mjs')
const P = await importa('lib/mercado/publicador-v1.mjs')
const A = await importa('lib/mercado/aceptaciones.mjs')
const DIA = 86400
const S = d => Date.parse(d + 'T00:00:00Z') / 1000
const U = iso => Date.parse(iso) / 1000
const ymd = s => new Date(s * 1000).toISOString().slice(0, 10)
const vela = t => ({ time: t, open: 1.1, high: 1.1, low: 1.1, close: 1.1, volume: 1 })
// los minutos con mercado del dia (horario de Nueva York), salvo los tramos «faltan» [ini, fin); cada «cada» minutos
const mercado = (dia, { faltan = [], cada = 1 } = {}) => {
  const out = []
  for (let t = S(dia); t < S(dia) + DIA; t += 60 * cada) if (!C.minutoCerrado(t) && !faltan.some(([a, b]) => t >= U(a) && t < U(b))) out.push(vela(t))
  return out
}
const hasta = (vs, hhmm) => vs.filter(v => (v.time % DIA) <= Number(hhmm.slice(0, 2)) * 3600 + Number(hhmm.slice(3)) * 60)

// la regla de ANTES (calidad.mjs en cd99f06), para la regresion
function estadoHoy(dia, velasDia, minimoAceptado = null) {
  const sinLista = (() => {
    if (!C.diaConMercado(dia, C.CIERRES_CONFIRMADOS)) return 'sin-mercado'
    const n = velasDia?.length || 0
    const umbral = C.FESTIVOS_MMDD.has(dia.slice(5)) ? null : C.UMBRAL_LABORABLE[new Date(dia + 'T00:00:00Z').getUTCDay()]
    if (umbral) return n >= umbral ? 'completo' : 'pendiente'
    return n && (velasDia[n - 1].time % DIA) >= 23 * 3600 ? 'completo' : 'pendiente'
  })()
  return sinLista === 'pendiente' && Number.isInteger(minimoAceptado) && (velasDia?.length || 0) >= minimoAceptado ? 'completo' : sinLista
}

titulo('1 · estadoDia: el festivo en viernes')
const nav = hasta(mercado('2026-12-25', { cada: 9 }), '21:59'), ano = mercado('2027-01-01', { faltan: [['2027-01-01T00:00Z', '2027-01-01T20:00Z']] })
ver('control: el 25-dic-2026 y el 1-ene-2027 son viernes', new Date(S('2026-12-25') * 1000).getUTCDay() === 5 && new Date(S('2027-01-01') * 1000).getUTCDay() === 5)
ver('control: sus velas acaban a las 21:5x UTC (el cierre de invierno)', ymd(nav.at(-1).time) === '2026-12-25' && (nav.at(-1).time % DIA) >= 21 * 3600 && (ano.at(-1).time % DIA) === 21 * 3600 + 59 * 60, `${nav.length} y ${ano.length} velas`)
oraculo('FV', 'el 25-dic-2026 (viernes) con velas hasta el cierre (21:5x UTC): completo', C.estadoDia('2026-12-25', nav) === 'completo', C.estadoDia('2026-12-25', nav))
oraculo('FV', 'el 1-ene-2027 (viernes) con velas solo en su ultima hora (21:00–21:59 UTC): completo', C.estadoDia('2027-01-01', ano) === 'completo', C.estadoDia('2027-01-01', ano))
oraculo('FV', 'el festivo en viernes cortado antes de su ultima hora (14:59), o vacio: pendiente', C.estadoDia('2026-12-25', hasta(nav, '14:59')) === 'pendiente' && C.estadoDia('2026-12-25', hasta(nav, '20:59')) === 'pendiente' && C.estadoDia('2027-01-01', []) === 'pendiente')
oraculo('FV', 'cortado antes, pero ACEPTADO con al menos esas velas (minimoAceptado, la lista de dias cortos): completo, como hoy', C.estadoDia('2026-12-25', hasta(nav, '07:59'), hasta(nav, '07:59').length) === 'completo' && C.estadoDia('2026-12-25', hasta(nav, '07:59'), hasta(nav, '07:59').length + 1) === 'pendiente')

titulo('2 · regresion: estadoDia contra la regla de antes, todos los dias de 2024 a 2028')
// perfiles: vacio, una vela a las 00:00, todo el dia, todo hasta HH:59 (16..23), velas solo desde las 22:00 o 23:00, umbral y umbral − 1
const perfiles = d => {
  const todo = Array.from({ length: 1440 }, (_, i) => vela(S(d) + 60 * i))
  const p = { vacio: [], una: [todo[0]], todo, desde22: todo.slice(22 * 60), desde23: todo.slice(23 * 60), sola2330: [todo[23 * 60 + 30]] }
  for (let h = 16; h <= 23; h++) p[`hasta${h}`] = todo.slice(0, h * 60 + 60)
  for (const n of [999, 1000, 1199, 1200]) p[`n${n}`] = todo.slice(0, n)
  return p
}
const cambios = [], viernesFestivos = new Set()
let casos = 0
for (let t = S('2024-01-01'); t <= S('2028-12-31'); t += DIA) {
  const d = ymd(t), fv = C.FESTIVOS_MMDD.has(d.slice(5)) && new Date(t * 1000).getUTCDay() === 5
  if (fv) viernesFestivos.add(d)
  for (const [nombre, vs] of Object.entries(perfiles(d))) for (const min of [null, 1, vs.length, vs.length + 1]) {
    casos++
    const antes = estadoHoy(d, vs, min), ahora = C.estadoDia(d, vs, min)
    if (antes !== ahora) cambios.push({ d, nombre, min, antes, ahora, fv })
  }
}
ver('control: en 2024–2028 los festivos en viernes son el 25-dic-2026 y el 1-ene-2027', [...viernesFestivos].join() === '2026-12-25,2027-01-01', [...viernesFestivos].join())
oraculo('FV', `ningun dia que no sea festivo en viernes cambia (laborables, viernes normales, sabados, domingos y festivos entre semana; ${casos} casos)`, cambios.every(c => c.fv), JSON.stringify(cambios.filter(c => !c.fv).slice(0, 3)))
oraculo('FV', 'y en los festivos en viernes solo cambia pendiente → completo, con la ultima vela en la hora del cierre (21:00–21:59 UTC)', cambios.length > 0 && cambios.every(c => c.antes === 'pendiente' && c.ahora === 'completo' && ['hasta21', 'hasta22', 'desde22', 'todo', 'desde23', 'sola2330', 'hasta23'].includes(c.nombre)), JSON.stringify([...new Set(cambios.map(c => `${c.d} ${c.nombre}`))]))
// los perfiles «todo», «desde22», «desde23» y «sola2330» tienen velas DESPUES del cierre: ya eran completos
oraculo('FV', 'lo que cambia en un festivo en viernes son exactamente los perfiles que acaban en la hora del cierre (hasta21, hasta22); los demas ya eran completos o siguen pendientes', [...new Set(cambios.map(c => c.nombre))].sort().join() === 'hasta21,hasta22', [...new Set(cambios.map(c => c.nombre))].sort().join())

titulo('3 · el diario (scripts/actualizar-diario.js): el festivo en viernes no corta la cola')
const ENV = { NEXT_PUBLIC_SUPABASE_URL: 'https://falso.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'falsa' }
const velasDe = (dia, n = 1440) => diaM1(dia, n).map(c => ({ time: c.timestamp / 1000, open: c.open, high: c.high, low: c.low, close: c.close, volume: 1 }))
// el año hasta «hasta» con dias reales: 1-ene de 112 velas (22:08–23:59), laborables enteros, domingos desde las 22:00
const historial = (anio, ult) => {
  const v = [...velasDe(`${anio}-01-01`).slice(1440 - 112)]
  for (let t = S(`${anio}-01-02`); t <= S(ult); t += DIA) { const w = new Date(t * 1000).getUTCDay(), d = ymd(t); if (w >= 1 && w <= 5) v.push(...velasDe(d)); else if (w === 0) v.push(...velasDe(d).slice(22 * 60)) }
  return v
}
const enDia = (arr, d) => (arr || []).filter(v => ymd(v.time) === d).length
const filasMs = vs => JSON.stringify(vs.map(v => ({ timestamp: v.time * 1000, open: v.open, high: v.high, low: v.low, close: v.close, volume: 1 })))
// el proveedor: los dias de «especiales» con esas velas; el domingo desde las 22:00; los demas, enteros
const responde = especiales => { proveedor.http = (url, n, { dia }) => {
  if (Object.hasOwn(especiales, dia)) return { status: 200, body: filasMs(especiales[dia]) }
  const w = new Date(dia + 'T00:00:00Z').getUTCDay()
  return { status: 200, body: JSON.stringify(w === 0 ? diaM1(dia).slice(22 * 60) : diaM1(dia)) }
} }
async function diario({ anio, ult, ahora, especiales }) {
  escenario({ storage: { 'forex-data': { [`EURUSD/M1/${anio}.json`]: JSON.stringify(historial(anio, ult)) } } }); responde(especiales)
  const r = await correScript('scripts/actualizar-diario.js', { ahora, argv: ['--subir', '--pares', 'EURUSD'], env: ENV })
  proveedor.http = null
  const g = guardado(`EURUSD/M1/${anio}`).velas
  return { g, linea: r.salida.find(l => l.includes('EURUSD/M1')) ?? '', codigo: r.codigo }
}
// 2026: guardado hasta el jueves 24-dic; hoy, martes 29-dic. El viernes 25 trae velas hasta el cierre (21:5x UTC)
const d1 = await diario({ anio: 2026, ult: '2026-12-24', ahora: '2026-12-29T06:00:00Z', especiales: { '2026-12-25': nav } })
oraculo('FV', 'diario · el viernes 25-dic-2026 con velas hasta el cierre: se publica y la cola llega al lunes 28', enDia(d1.g, '2026-12-25') === nav.length && enDia(d1.g, '2026-12-27') === 120 && enDia(d1.g, '2026-12-28') === 1440, `25: ${enDia(d1.g, '2026-12-25')} · 27: ${enDia(d1.g, '2026-12-27')} · 28: ${enDia(d1.g, '2026-12-28')} · ${d1.linea}`)
const d2 = await diario({ anio: 2026, ult: '2026-12-24', ahora: '2026-12-29T06:00:00Z', especiales: { '2026-12-25': hasta(nav, '14:59') } })
oraculo('FV', 'diario · el viernes 25-dic-2026 cortado a las 14:59: sigue cortando la cola (el lunes 28 no se publica)', enDia(d2.g, '2026-12-28') === 0, `25: ${enDia(d2.g, '2026-12-25')} · 28: ${enDia(d2.g, '2026-12-28')} · ${d2.linea}`)
// 2025: guardado hasta el miercoles 24-dic; hoy, martes 30-dic. Jueves 25 festivo; viernes 26 normal; fin de semana; lunes 29
const n25 = mercado('2025-12-25', { cada: 9 }), v26 = hasta(mercado('2025-12-26'), '21:59')
ver('control: el 25-dic-2025 es jueves y sus velas llegan a las 23:5x', new Date(S('2025-12-25') * 1000).getUTCDay() === 4 && (n25.at(-1).time % DIA) >= 23 * 3600)
const d3 = await diario({ anio: 2025, ult: '2025-12-24', ahora: '2025-12-30T06:00:00Z', especiales: { '2025-12-25': n25, '2025-12-26': v26 } })
oraculo('FV', 'diario · regresion: festivo entre semana hasta las 23:5x, viernes normal hasta el cierre, sabado sin pedir y domingo desde las 22:00: la cola llega al lunes 29', enDia(d3.g, '2025-12-25') === n25.length && enDia(d3.g, '2025-12-26') === v26.length && enDia(d3.g, '2025-12-27') === 0 && enDia(d3.g, '2025-12-28') === 120 && enDia(d3.g, '2025-12-29') === 1440, `25: ${enDia(d3.g, '2025-12-25')} · 26: ${enDia(d3.g, '2025-12-26')} · 28: ${enDia(d3.g, '2025-12-28')} · 29: ${enDia(d3.g, '2025-12-29')} · ${d3.linea}`)
const d4 = await diario({ anio: 2025, ult: '2025-12-24', ahora: '2025-12-30T06:00:00Z', especiales: { '2025-12-25': hasta(n25, '21:59') } })
oraculo('FV', 'diario · regresion: el festivo ENTRE SEMANA que acaba a las 21:59 sigue pendiente (su ultima hora con mercado es la de las 23:00) y corta la cola', enDia(d4.g, '2025-12-26') === 0 && enDia(d4.g, '2025-12-29') === 0, `25: ${enDia(d4.g, '2025-12-25')} · 26: ${enDia(d4.g, '2025-12-26')} · 29: ${enDia(d4.g, '2025-12-29')} · ${d4.linea}`)
const d5 = await diario({ anio: 2025, ult: '2025-12-24', ahora: '2025-12-30T06:00:00Z', especiales: { '2025-12-25': n25, '2025-12-26': v26.slice(0, 999) } })
oraculo('FV', 'diario · regresion: un viernes NORMAL con 999 velas (umbral 1.000) sigue cortando la cola', enDia(d5.g, '2025-12-29') === 0 && enDia(d5.g, '2025-12-28') === 0, `26: ${enDia(d5.g, '2025-12-26')} · 29: ${enDia(d5.g, '2025-12-29')} · ${d5.linea}`)
const d6 = await diario({ anio: 2025, ult: '2025-12-24', ahora: '2025-12-30T06:00:00Z', especiales: { '2025-12-25': n25, '2025-12-26': v26, '2025-12-28': hasta(velasDe('2025-12-28').slice(22 * 60), '22:30') } })
oraculo('FV', 'diario · regresion: un domingo cortado a las 22:30 sigue pendiente y corta la cola', enDia(d6.g, '2025-12-29') === 0, `28: ${enDia(d6.g, '2025-12-28')} · 29: ${enDia(d6.g, '2025-12-29')} · ${d6.linea}`)
ver('control (H06): ningun script por timeout', ejecucionesScripts.every(e => e.terminoPor !== 'timeout'))

titulo('4 · el publicador del mercado v1 (planificaPar)')
const linea = o => JSON.stringify(o) + '\n'
const corto = (dia, velas) => linea({ tipo: 'corto', par: 'EURUSD', dia, velas, motivo: A.MOTIVO_CORTO, fecha: '2026-10-14', nota: 'prueba' })
const acepta = (inicio, minutos) => linea({ tipo: 'aceptacion', par: 'EURUSD', inicio, minutos, motivo: 'festivo', fecha: '2026-10-14', nota: 'prueba' })
const serie = (desde, hastaDia, especiales = {}) => { const v = []; for (let t = S(desde); t < S(hastaDia); t += DIA) v.push(...(especiales[ymd(t)] ?? mercado(ymd(t)))); return v }
const plan = (velas, texto) => P.planificaPar({ par: 'EURUSD', velas, texto, anterior: null, diasAceptados: new Map() })
const dias = p => p.manifiesto?.dias.map(x => x.dia) ?? []
// viernes 25-dic-2026 de mercado reducido: de 00:00 a 07:59 y de 21:00 a 21:59 UTC (780 min de hueco, aceptado) y su linea «corto»
const r25 = mercado('2026-12-25', { faltan: [['2026-12-25T08:00Z', '2026-12-25T21:00Z']] })
const texto25 = acepta('2026-12-25T08:00Z', 780) + corto('2026-12-25', r25.length)
const p1 = plan(serie('2026-12-21', '2026-12-30', { '2026-12-25': r25 }), texto25)
oraculo('FV', 'publicador · el viernes 25-dic-2026 reducido, con su hueco y su linea «corto»: se publica, y el domingo 27 y el lunes 28 tambien', dias(p1).includes('2026-12-25') && dias(p1).includes('2026-12-27') && dias(p1).includes('2026-12-28') && p1.retenido?.dia === '2026-12-29', P.resumen?.(p1))
const p2 = plan(serie('2026-12-21', '2026-12-30', { '2026-12-25': r25 }), acepta('2026-12-25T08:00Z', 780))
oraculo('FV', 'publicador · el mismo viernes SIN su linea «corto»: se retiene «festivo_sin_aceptar» (decision 2, intacta)', p2.retenido?.dia === '2026-12-25' && p2.retenido.motivo === 'festivo_sin_aceptar', P.resumen?.(p2))
const p3 = plan(serie('2026-12-28', '2027-01-06'), '')
oraculo('FV', 'publicador · el viernes 1-ene-2027 entero hasta el cierre (no corto): se publica sin linea, y el lunes 4 tambien', dias(p3).includes('2027-01-01') && dias(p3).includes('2027-01-04'), P.resumen?.(p3))
const p4 = plan(serie('2026-12-21', '2026-12-30', { '2026-12-25': mercado('2026-12-25', { faltan: [['2026-12-25T08:00Z', '2026-12-26T00:00Z']] }) }), corto('2026-12-25', 480))
// (el dia retenido es el 24: su vela siguiente cae en el 25, incompleto)
const sigInc = (p, dia, sig) => p.retenido?.dia === dia && p.retenido.motivo === 'siguiente_incompleto' && p.retenido.detalle.includes(sig) && !dias(p).includes(sig)
oraculo('FV', 'publicador · el viernes 25-dic-2026 que acaba a las 07:59 (sin su ultima hora): incompleto, aunque tenga su linea «corto» (y el 24 espera por el)', sigInc(p4, '2026-12-24', '2026-12-25'), P.resumen?.(p4))
const p5 = plan(serie('2025-12-22', '2025-12-31', { '2025-12-25': hasta(mercado('2025-12-25'), '21:59') }), corto('2025-12-25', 1))
oraculo('FV', 'publicador · regresion: el festivo ENTRE SEMANA (jueves 25-dic-2025) que acaba a las 21:59 sigue incompleto (y el 24 espera por el)', sigInc(p5, '2025-12-24', '2025-12-25'), P.resumen?.(p5))
const p6 = plan(serie('2026-03-01', '2026-03-10'), '')
oraculo('FV', 'publicador · regresion: una semana normal (viernes hasta el cierre, sabado sin trozo, domingo desde la apertura) se publica hasta el lunes 9 retenido', dias(p6).join() === '2026-03-01,2026-03-02,2026-03-03,2026-03-04,2026-03-05,2026-03-06,2026-03-08' && p6.retenido?.dia === '2026-03-09', P.resumen?.(p6))
fin()
