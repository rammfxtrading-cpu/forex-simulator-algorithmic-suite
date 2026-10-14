/**
 * EQUIVALENCIA BYTE A BYTE DEL MOTOR OPTIMIZADO (diseño q.11; CTO 14-oct: «resultados
 * identicos byte a byte»). El motor de un commit de referencia (por defecto 4235196, el
 * ultimo sin optimizar), sacado con `git show` a una carpeta temporal, contra el de la
 * copia de trabajo, en escenarios aleatorios con semilla fija: cartera de 1 a 9 pares
 * (cruces incluidos), posiciones con SL/TP, pendientes, limites estrictos e inclusivos
 * (practica, FTMO, 1F, 3F), cierres parciales por comando y avances de varios minutos.
 * Compara, tras cada paso, el estado serializado y los eventos. No esta en la tanda (tarda).
 *   node --import ./pruebas/sin-red.mjs --import ./pruebas/registro.mjs pruebas/medidas/equivalencia.mjs [escenarios] [commit]
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { REPO, importa } from '../lib.mjs'
const N = Number(process.argv[2] ?? 60), REF = process.argv[3] ?? '4235196'
const dir = mkdtempSync(path.join(tmpdir(), 'motor-ref-'))
const ficheros = execFileSync('git', ['-C', REPO, 'ls-tree', '--name-only', REF, 'lib/motor/', 'lib/mercado/'], { encoding: 'utf8' }).split('\n').filter(f => f.endsWith('.mjs'))
for (const f of ficheros) { mkdirSync(path.join(dir, path.dirname(f)), { recursive: true }); writeFileSync(path.join(dir, f), execFileSync('git', ['-C', REPO, 'show', `${REF}:${f}`])) }
const de = async (base, f) => import(pathToFileURL(path.join(base, f)).href)
const VIEJO = { CA: await de(dir, 'lib/motor/cartera.mjs'), RT: await de(dir, 'lib/motor/reto.mjs'), M: await de(dir, 'lib/motor/motor.mjs') }
const NUEVO = { CA: await importa('lib/motor/cartera.mjs'), RT: await importa('lib/motor/reto.mjs'), M: await importa('lib/motor/motor.mjs') }
const PARES = ['AUDCAD', 'AUDUSD', 'EURUSD', 'GBPJPY', 'GBPUSD', 'NZDUSD', 'USDCAD', 'USDCHF', 'USDJPY']
const BASE = { AUDCAD: 0.9, AUDUSD: 0.65, EURUSD: 1.1, GBPJPY: 190.5, GBPUSD: 1.3, NZDUSD: 0.6, USDCAD: 1.37, USDCHF: 0.88, USDJPY: 150.2 }
const DIG = p => (/JPY/.test(p) ? 3 : 5)
let s = 1
const azar = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648 }
const elige = xs => xs[Math.floor(azar() * xs.length)]
const T0 = Date.parse('2026-03-03T10:00:00Z') / 1000
function escenario(k) {
  s = 1000 + k
  // pares: los de conversion y base→USD que hagan falta
  let pares = new Set(Array.from({ length: 1 + Math.floor(azar() * 4) }, () => elige(PARES)))
  for (const p of [...pares]) { if (p === 'AUDCAD') { pares.add('USDCAD'); pares.add('AUDUSD') } if (p === 'GBPJPY') { pares.add('USDJPY'); pares.add('GBPUSD') } }
  pares = [...pares].sort()
  const mins = 30, velas = {}
  for (const p of pares) {
    const t = 10 ** -DIG(p), r = x => Number(x.toFixed(DIG(p))); let x = BASE[p]; velas[p] = []
    for (let i = 0; i <= mins; i++) {
      if (i > 0 && azar() < 0.05) continue                          // un par sin vela en ese minuto
      const a = azar() < 0.1 ? r(x + (azar() - 0.5) * 60 * t) : x     // a veces abre en hueco
      const c = r(a + (azar() - 0.5) * 40 * t), h = r(Math.max(a, c) + azar() * 20 * t), l = r(Math.min(a, c) - azar() * 20 * t)
      velas[p].push({ time: T0 + 60 * i, open: r(a), high: h, low: l, close: c }); x = c
    }
  }
  const tipo = elige(['practica', 'practica', 'FTMO', '1F', '3F'])
  const costes = { version: 'eq:1', spread_pips: Object.freeze(Object.fromEntries(PARES.map(p => [p, elige(['0', '0.3', '1.2'])]))), comision_lote_µ: BigInt(elige([0, 3_000_000, 999_999])), swap_µ: 0n }
  // los comandos: aperturas con SL/TP, pendientes, avances, parciales
  const pasos = []
  for (let i = 0; i < 6; i++) {
    const par = elige(pares), lado = elige(['BUY', 'SELL']), bid = BASE[par], t = 10 ** -DIG(par)
    const px = d => (bid + d * t).toFixed(DIG(par))
    const r = azar()
    if (r < 0.35) pasos.push({ abre: { par, lado, lotes: elige(['0.01', '0.5', '1', '3', '40', '120']), sl: azar() < 0.6 ? px(lado === 'BUY' ? -15 : 15) : undefined, tp: azar() < 0.6 ? px(lado === 'BUY' ? 15 : -15) : undefined } })
    else if (r < 0.55) pasos.push({ pendiente: { par, lado, orden: elige(['limit', 'stop']), lotes: elige(['0.1', '1']), d: Math.floor((azar() - 0.5) * 40) } })
    else if (r < 0.65) pasos.push({ parcial: true })
    else pasos.push({ avanza: 1 + Math.floor(azar() * 6) })
  }
  pasos.push({ avanza: mins })
  return { pares, velas, tipo, costes, pasos }
}
function corre(MO, esc) {
  const { CA, RT, M } = MO
  const velas = Object.fromEntries(Object.entries(esc.velas).map(([p, vs]) => [p, M.velas(p, vs)]))
  const reglas = { FTMO: RT.FTMO_2STEP, '1F': RT.SUITE_1F, '3F': RT.SUITE_3F }[esc.tipo]
  let cartera = CA.crea({ pares: esc.pares, costes: esc.costes, capital: '100000', limites: esc.tipo === 'practica' ? [{ regla: 'p', limite: '99950' }] : [] })
  let r = reglas ? RT.creaReto({ motor: cartera, fase: 1, inicio: T0, reglas }) : null
  const salida = []
  const av = h => { if (r) { const x = RT.avanzaReto(r, h, velas); r = x.reto; return x.eventos } const x = CA.aplica(cartera, { tipo: 'avanzar', hasta: h }, velas); cartera = x.estado; return x.eventos }
  const ap = c => { if (r) { const x = RT.aplicaReto(r, c); r = x.reto; return [x.eventos, x.resultado] } const x = CA.aplica(cartera, c, {}); cartera = x.estado; return [x.eventos, x.resultado] }
  const mo = () => (r ? r.motor : cartera)
  salida.push(CA.serializa(av(T0)))
  for (const p of esc.pasos) {
    let ev
    if (p.avanza) ev = av(Math.min((mo().reloj.cursor ?? T0) + 60 * p.avanza, T0 + 60 * 30))
    else if (p.abre) ev = ap({ tipo: 'abrir', par: p.abre.par, lado: p.abre.lado, orden: 'mercado', lotes: p.abre.lotes, cotizadoEn: mo().reloj.cursor, ...(p.abre.sl ? { sl: p.abre.sl } : {}), ...(p.abre.tp ? { tp: p.abre.tp } : {}) })
    else if (p.pendiente) { const b = mo().cotizaciones[p.pendiente.par]?.bid; if (b == null) continue; ev = ap({ tipo: 'abrir', par: p.pendiente.par, lado: p.pendiente.lado, orden: p.pendiente.orden, lotes: p.pendiente.lotes, precio: M.precioTexto(p.pendiente.par, b + BigInt(p.pendiente.d)) }) }
    else if (p.parcial) { const pos = mo().posiciones[0]; if (!pos || pos.lotes_c < 2n) continue; ev = ap({ tipo: 'cerrar', id: pos.id, lotes: (Number(pos.lotes_c / 2n) / 100).toFixed(2) }) }
    salida.push(CA.serializa(ev), CA.serializa(r ?? cartera))
  }
  return salida
}
let iguales = 0, eventos = 0, cierres = 0, quemas = 0
const malos = []
for (let k = 0; k < N; k++) {
  const esc = escenario(k)
  let a, b
  try { a = corre(VIEJO, esc) } catch (e) { a = ['error ' + e.message] }
  try { b = corre(NUEVO, esc) } catch (e) { b = ['error ' + e.message] }
  const j = a.findIndex((x, i) => x !== b[i])
  if (j === -1 && a.length === b.length) iguales++
  else malos.push(`escenario ${k} (${esc.tipo}, ${esc.pares.join('+')}): difiere en la salida ${j}`)
  const todo = a.join('')
  eventos += (todo.match(/"tipo":"(fill|cierre|breach|orden_creada|orden_cancelada)"/g) ?? []).length
  cierres += (todo.match(/"tipo":"cierre"/g) ?? []).length
  quemas += (todo.match(/"tipo":"breach"/g) ?? []).length
}
rmSync(dir, { recursive: true, force: true })
console.log(`referencia ${REF} · ${N} escenarios · identicos ${iguales} · eventos economicos ${eventos} (cierres ${cierres}, breaches ${quemas})`)
for (const x of malos) console.log('  ✗ ' + x)
process.exit(malos.length || eventos === 0 ? 1 : 0)
