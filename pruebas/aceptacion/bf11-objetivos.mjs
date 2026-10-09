/**
 * BF11 · --objetivo: EL JOB DICE SI CADA DIA PEDIDO QUEDO COMPLETO
 * (Astra M-03, 7-oct-2026, sobre d5297e7)
 *
 * El estado diario tolera el tramo final abierto: con el ultimo dia guardado
 * (3-feb) en 30 velas y el proveedor devolviendo las mismas 30, el job sale con
 * 0 y «TODO OK». Para declarar recuperado un dia concreto eso no sirve.
 * Decision del CTO: opcion --objetivo con una lista de PAR:FECHA. Al terminar,
 * el job dice por cada objetivo si quedo completo (velas y ultimo minuto) y
 * sale distinto de 0 si alguno no lo esta, aunque el estado diario sea «todo
 * bien» (codigo 1: datos que no estan bien). Completo = calidad.estadoDia, con
 * la lista de dias cortos aceptados.
 *
 * ORACULOS, a mano (hoy 4-feb-2026; AUDUSD hasta el 2-feb completo y el 3-feb
 * con 30 velas, 00:00–00:29; el proveedor vuelve a dar esas 30):
 *   sin --objetivo: 0 y TODO OK (el contrato diario no cambia);
 *   con --objetivo AUDUSD:2026-02-03: sale con 1 y la linea dice «incompleto
 *   · 30 velas · ultima 00:29»;
 *   con --objetivo AUDUSD:2026-02-02: «completo · 1440 velas · ultima 23:59»
 *   y sale con 0;
 *   mal escrito, o un par que no esta en --pares: no se hace nada y sale con 4;
 *   con elementos vacios («AUDUSD:2026-02-03,», «,AUDUSD:…», dobles comas): 4.
 */
import { titulo, oraculo, fin, escenario, proveedor } from '../lib.mjs'
import { diaM1 } from '../proveedor-falso.mjs'
import { correScript, ejecucionesScripts } from '../script-falso.mjs'
const DIA = 86400000
const ENV = { NEXT_PUBLIC_SUPABASE_URL: 'https://falso.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'falsa' }
const velasDe = (dia, n = 1440, desde = 0) => diaM1(dia, 1440).slice(desde, desde + n).map(c => ({ time: c.timestamp / 1000, open: c.open, high: c.high, low: c.low, close: c.close, volume: 1 }))
const historial = () => { const v = [...velasDe('2026-01-01', 120, 22 * 60)]; for (let t = Date.parse('2026-01-02T00:00:00Z'); t <= Date.parse('2026-02-02T00:00:00Z'); t += DIA) { const w = new Date(t).getUTCDay(), d = new Date(t).toISOString().slice(0, 10); if (w >= 1 && w <= 5) v.push(...velasDe(d)); else if (w === 0) v.push(...velasDe(d, 120, 22 * 60)) } v.push(...velasDe('2026-02-03', 30)); return v }
const prepara = () => { escenario({ storage: { 'forex-data': { 'AUDUSD/M1/2026.json': JSON.stringify(historial()) } } }); proveedor.http = (url, n, { dia }) => ({ status: 200, body: JSON.stringify(diaM1(dia, dia === '2026-02-03' ? 30 : 1440)) }) }
const corre = (extra = []) => correScript('scripts/actualizar-diario.js', { ahora: '2026-02-04T06:00:00Z', argv: ['--subir', '--pares', 'AUDUSD', ...extra], env: ENV })
const lineaObj = (r, que) => r.salida.find(l => l.includes(que) && /completo|incompleto|sin velas|no comprobado/.test(l) && !/intento/.test(l)) ?? ''

titulo('1 · el contrato diario no cambia')
prepara()
const r0 = await corre()
oraculo('BF11', 'sin --objetivo: 0 y TODO OK (tramo final abierto tolerado)', r0.codigo === 0 && r0.salida.some(l => /TODO OK/.test(l)), `codigo ${r0.codigo}`)

titulo('2 · un objetivo que no queda completo')
prepara()
const r1 = await corre(['--objetivo', 'AUDUSD:2026-02-03'])
oraculo('BF11', '--objetivo AUDUSD:2026-02-03: dice «incompleto · 30 velas · ultima 00:29» y sale con 1', r1.codigo === 1 && /AUDUSD 2026-02-03.*incompleto.*30 velas.*ultima 00:29/.test(lineaObj(r1, 'AUDUSD 2026-02-03')) && !r1.salida.some(l => /TODO OK/.test(l)), `codigo ${r1.codigo} · ${lineaObj(r1, 'AUDUSD 2026-02-03')}`)

titulo('3 · un objetivo completo')
prepara()
const r2 = await corre(['--objetivo', 'AUDUSD:2026-02-02'])
oraculo('BF11', '--objetivo AUDUSD:2026-02-02: «completo · 1440 velas · ultima 23:59» y sale con 0', r2.codigo === 0 && /AUDUSD 2026-02-02.*completo.*1440 velas.*ultima 23:59/.test(lineaObj(r2, 'AUDUSD 2026-02-02')) && !/incompleto/.test(lineaObj(r2, 'AUDUSD 2026-02-02')), `codigo ${r2.codigo} · ${lineaObj(r2, 'AUDUSD 2026-02-02')}`)

titulo('4 · entrada que no vale')
// MER-R2 (Astra, 7-oct): fechas imposibles (mes 13, 99-99) daban RangeError sin capturar
// CTO 7-oct (como CSV-04 del importador): elementos vacios en la lista, tambien 4
for (const mal of ['AUDUSD-2026-02-03', 'GBPUSD:2026-02-03', 'AUDUSD:2026-02-30', 'AUDUSD:2026-99-99', 'AUDUSD:2026-13-01', ',', 'AUDUSD:2026-02-03,', ',AUDUSD:2026-02-03', 'AUDUSD:2026-02-02,,AUDUSD:2026-02-03', 'AUDUSD:2026-02-03, ']) {
  prepara(); proveedor.llamadas.length = 0
  const r = await corre(['--objetivo', mal])
  oraculo('BF11', `--objetivo ${mal}: no se hace nada y sale con 4 (error controlado)`, r.codigo === 4 && proveedor.llamadas.length === 0 && !r.salida.some(l => /RangeError|Invalid time/.test(l)) && r.terminoPor !== 'timeout', `codigo ${r.codigo} · ${proveedor.llamadas.length} peticiones · ${r.salida.slice(-2).join(' | ')}`)
}
proveedor.http = null
oraculo('BF11', 'ningun script por timeout', ejecucionesScripts.every(e => e.terminoPor !== 'timeout'))
fin()
