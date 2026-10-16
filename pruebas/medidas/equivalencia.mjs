/**
 * EQUIVALENCIA BYTE A BYTE DEL MOTOR (diseño q.11 y q.16; CTO 14-oct: «resultados identicos byte a
 * byte»; MCV2-01, Astra 15-oct: dos contratos separados). Escenarios aleatorios con semilla fija:
 * cartera de 1 a 9 pares (cruces incluidos), posiciones con SL/TP, pendientes, limites estrictos e
 * inclusivos (practica, FTMO, 1F, 3F), cierres parciales por comando y avances de varios minutos.
 * Compara, tras cada paso, el estado serializado y los eventos. Dos CONTRATOS, cada uno con su
 * referencia sacada con `git show` a una carpeta temporal:
 *   · optimizacion: contra 4235196 (el ultimo sin optimizar) con la MISMA politica de ambiguedad:
 *     a la referencia se le aplican los cambios funcionales posteriores del motor que no son la
 *     optimizacion (36794dd MCV-01, e58536d E3-02 y 5b348cd, el rechazo sesion_terminada). Sin eso
 *     se mezcla el arreglo de MCV-01 con la referencia que aun tenia el fallo (el 164/200 de Astra);
 *   · mcv01: la regresion de MCV-01 contra 63be57d (antes del campo conversion del evento cierre)
 *     con 5b348cd aplicado tambien a la referencia (CTO 16-oct: nada de traducir codigos):
 *     identico quitando SOLO ese campo, en los tipos que 63be57d conoce (practica y FTMO).
 * Una EXCEPCION en un escenario es rojo (se cuenta aparte), nunca igualdad.
 *   node --import ./pruebas/sin-red.mjs --import ./pruebas/registro.mjs pruebas/medidas/equivalencia.mjs [escenarios]
 *        [--contrato optimizacion|mcv01] [--sin-parches] [--control-excepcion]
 * --sin-parches: la referencia de «optimizacion» sin MCV-01 ni E3-02 (control: el rojo mezclado); el
 *   rechazo 5b348cd sigue aplicado, para que las diferencias sean solo las de MCV-01.
 * --sin-rechazo: las dos referencias sin 5b348cd (control: los comandos sobre una sesion terminada
 *   dan el codigo viejo en la referencia y el nuevo en la copia; tiene que salir rojo).
 * --control-excepcion: las dos versiones lanzan en el escenario 0 (control: tiene que salir rojo).
 * --copia COMMIT: en lugar de la copia de trabajo, el motor de ese commit con 5b348cd encima (control:
 *   con a8e40a4, que aun tiene el fallo de MCV-01, el contrato mcv01 tiene que ver diferencias).
 * Codigo 0 solo si todos los contratos pedidos salen identicos, sin excepciones y con eventos.
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { REPO, importa } from '../lib.mjs'
const args = process.argv.slice(2)
const opcion = k => { const i = args.indexOf(k); return i < 0 ? null : args[i + 1] }
const N = Number(args.find(x => /^\d+$/.test(x)) ?? 60)
const SIN_PARCHES = args.includes('--sin-parches'), CONTROL_EXC = args.includes('--control-excepcion'), SIN_RECHAZO = args.includes('--sin-rechazo')
// 5b348cd (CTO 15-oct): un comando sobre una sesion terminada → { rechazado: 'sesion_terminada', motivo }.
// Es un cambio funcional posterior a las dos referencias: va a sus parches (CTO 16-oct), nunca como
// una traduccion de codigos en la comparacion.
const RECHAZO = '5b348cd'
const R = SIN_RECHAZO ? [] : [RECHAZO]
const CONTRATOS = {
  optimizacion: { ref: '4235196', parches: SIN_PARCHES ? R : ['36794dd', 'e58536d', ...R], tipos: null, quita: [] },
  mcv01: { ref: '63be57d', parches: R, tipos: ['practica', 'FTMO'], quita: ['conversion'] },
}
const pedidos = opcion('--contrato') ? [opcion('--contrato')] : Object.keys(CONTRATOS)
if (!pedidos.every(c => CONTRATOS[c])) { console.log(`contrato desconocido: ${pedidos}`); process.exit(2) }
// la referencia: lib/motor y lib/mercado de «ref», con los parches de cada commit aplicados encima
async function referencia({ ref, parches }) {
  const dir = mkdtempSync(path.join(tmpdir(), 'motor-ref-'))
  const ficheros = execFileSync('git', ['-C', REPO, 'ls-tree', '-r', '--name-only', ref, 'lib/motor/', 'lib/mercado/'], { encoding: 'utf8' }).split('\n').filter(f => f.endsWith('.mjs'))
  for (const f of ficheros) { mkdirSync(path.join(dir, path.dirname(f)), { recursive: true }); writeFileSync(path.join(dir, f), execFileSync('git', ['-C', REPO, 'show', `${ref}:${f}`])) }
  for (const c of parches) {
    const diff = execFileSync('git', ['-C', REPO, 'diff', `${c}^`, c, '--', 'lib/motor/', 'lib/mercado/'])
    execFileSync('git', ['apply', '--whitespace=nowarn', '-'], { cwd: dir, input: diff })   // falla si no aplica limpio
  }
  const de = f => import(pathToFileURL(path.join(dir, f)).href)
  return { dir, MO: { CA: await de('lib/motor/cartera.mjs'), RT: await de('lib/motor/reto.mjs'), M: await de('lib/motor/motor.mjs') } }
}
// la copia de trabajo, o (--copia COMMIT, para los controles) el motor de ese commit con el rechazo encima
const COPIA = opcion('--copia')
const copia = COPIA ? await referencia({ ref: COPIA, parches: [RECHAZO] }) : null
const NUEVO = copia ? copia.MO : { CA: await importa('lib/motor/cartera.mjs'), RT: await importa('lib/motor/reto.mjs'), M: await importa('lib/motor/motor.mjs') }
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
function corre(MO, esc, { quita = [], lanza = false } = {}) {
  if (lanza) throw new Error('excepcion plantada (--control-excepcion)')
  const { CA, RT, M } = MO
  // quita: campos de los eventos que la referencia no tiene (mcv01: conversion); solo en los eventos
  // (en las listas de eventos, tambien la de [eventos, resultado] de un comando; el estado no se toca)
  const limpia = v => (!quita.length ? v : Array.isArray(v) ? v.map(limpia)
    : v && typeof v === 'object' && typeof v.tipo === 'string' ? Object.fromEntries(Object.entries(v).filter(([k]) => !quita.includes(k))) : v)
  const velas = Object.fromEntries(Object.entries(esc.velas).map(([p, vs]) => [p, M.velas(p, vs)]))
  const reglas = { FTMO: RT.FTMO_2STEP, '1F': RT.SUITE_1F, '3F': RT.SUITE_3F }[esc.tipo]
  let cartera = CA.crea({ pares: esc.pares, costes: esc.costes, capital: '100000', limites: esc.tipo === 'practica' ? [{ regla: 'p', limite: '99950' }] : [] })
  let r = reglas ? RT.creaReto({ motor: cartera, fase: 1, inicio: T0, reglas }) : null
  const salida = []
  const av = h => { if (r) { const x = RT.avanzaReto(r, h, velas); r = x.reto; return x.eventos } const x = CA.aplica(cartera, { tipo: 'avanzar', hasta: h }, velas); cartera = x.estado; return x.eventos }
  const ap = c => { if (r) { const x = RT.aplicaReto(r, c); r = x.reto; return [x.eventos, x.resultado] } const x = CA.aplica(cartera, c, {}); cartera = x.estado; return [x.eventos, x.resultado] }
  const mo = () => (r ? r.motor : cartera)
  salida.push(CA.serializa(limpia(av(T0))))
  for (const p of esc.pasos) {
    let ev
    if (p.avanza) ev = av(Math.min((mo().reloj.cursor ?? T0) + 60 * p.avanza, T0 + 60 * 30))
    else if (p.abre) ev = ap({ tipo: 'abrir', par: p.abre.par, lado: p.abre.lado, orden: 'mercado', lotes: p.abre.lotes, cotizadoEn: mo().reloj.cursor, ...(p.abre.sl ? { sl: p.abre.sl } : {}), ...(p.abre.tp ? { tp: p.abre.tp } : {}) })
    else if (p.pendiente) { const b = mo().cotizaciones[p.pendiente.par]?.bid; if (b == null) continue; ev = ap({ tipo: 'abrir', par: p.pendiente.par, lado: p.pendiente.lado, orden: p.pendiente.orden, lotes: p.pendiente.lotes, precio: M.precioTexto(p.pendiente.par, b + BigInt(p.pendiente.d)) }) }
    else if (p.parcial) { const pos = mo().posiciones[0]; if (!pos || pos.lotes_c < 2n) continue; ev = ap({ tipo: 'cerrar', id: pos.id, lotes: (Number(pos.lotes_c / 2n) / 100).toFixed(2) }) }
    salida.push(CA.serializa(limpia(ev)), CA.serializa(r ?? cartera))
  }
  return salida
}
let fallo = false
for (const nombre of pedidos) {
  const C = CONTRATOS[nombre]
  const { dir, MO: VIEJO } = await referencia(C)
  let escenarios = 0, iguales = 0, excepciones = 0, eventos = 0, cierres = 0, quemas = 0
  const malos = []
  for (let k = 0; k < N; k++) {
    const esc = escenario(k)
    if (C.tipos && !C.tipos.includes(esc.tipo)) continue
    escenarios++
    const lanza = CONTROL_EXC && k === 0
    let a, b, err = null
    try { a = corre(VIEJO, esc, { lanza }) } catch (e) { err = `referencia: ${e.message}` }
    try { b = corre(NUEVO, esc, { quita: C.quita, lanza }) } catch (e) { err = (err ? err + ' · ' : '') + `copia: ${e.message}` }
    if (err) { excepciones++; malos.push(`escenario ${k} (${esc.tipo}, ${esc.pares.join('+')}): excepcion (${err})`); continue }
    const j = a.findIndex((x, i) => x !== b[i])
    if (j === -1 && a.length === b.length) iguales++
    else malos.push(`escenario ${k} (${esc.tipo}, ${esc.pares.join('+')}): difiere en la salida ${j}`)
    const todo = a.join('')
    eventos += (todo.match(/"tipo":"(fill|cierre|breach|orden_creada|orden_cancelada)"/g) ?? []).length
    cierres += (todo.match(/"tipo":"cierre"/g) ?? []).length
    quemas += (todo.match(/"tipo":"breach"/g) ?? []).length
  }
  rmSync(dir, { recursive: true, force: true })
  console.log(`contrato ${nombre} · referencia ${C.ref}${C.parches.length ? ' + ' + C.parches.join(' + ') : ''}${C.quita.length ? ' (sin ' + C.quita.join(', ') + ')' : ''} · escenarios ${escenarios} · identicos ${iguales} · excepciones ${excepciones} · eventos economicos ${eventos} (cierres ${cierres}, breaches ${quemas})`)
  for (const x of malos) console.log('  ✗ ' + x)
  if (malos.length || excepciones || eventos === 0 || iguales !== escenarios) fallo = true
}
if (copia) rmSync(copia.dir, { recursive: true, force: true })
process.exit(fallo ? 1 : 0)
