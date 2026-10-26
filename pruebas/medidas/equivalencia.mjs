/**
 * EQUIVALENCIA BYTE A BYTE DEL MOTOR (diseño q.11 y q.16; CTO 14-oct: «resultados identicos byte a
 * byte»; MCV2-01, Astra 15-oct: dos contratos separados; orden 1-127: referencias rehechas con la
 * regla de la vela de la 1-119). Escenarios aleatorios con semilla fija: cartera de 1 a 9 pares
 * (cruces incluidos), posiciones con SL/TP, pendientes, limites estrictos e inclusivos (practica,
 * FTMO, 1F, 3F), cierres parciales por comando y avances de varios minutos. Compara, tras cada paso,
 * el estado serializado y los eventos.
 *
 * CONTRATO (orden 1-127). Cada contrato aisla UN cambio del motor y comprueba que no cambia nada mas.
 * Su referencia se CONSTRUYE de nuevo, en una carpeta temporal, desde commits aprobados: lib/motor y
 * lib/mercado del commit base y, encima, cada commit aprobado posterior que toca lib/motor, en su
 * orden, aplicado como fusion a tres bandas por fichero (git merge-file; un conflicto es error, nunca
 * se resuelve a mano). La cadena es TODA la historia de lib/motor entre la base y la copia de trabajo
 * salvo lo que el contrato examina; el instrumento lo comprueba contra `git log --no-merges` y para
 * (codigo 1) si aparece un commit de motor que no esta declarado, para que nadie lo meta en la
 * referencia sin aprobarlo:
 *   · «optimizacion» (a8e40a4, el rendimiento): base 4235196 (el ultimo sin optimizar) + 36794dd
 *     (MCV-01) + e58536d (E3-02) + ee766b8 (detencion) + 5b348cd (sesion_terminada) + f252152 (causa)
 *     + ed36936 (la regla de la vela) + f67facd (motor@3/recorrido@2 y ajuste al tick, orden 1-119).
 *     La referencia es la copia de trabajo SIN a8e40a4: los 200 escenarios tienen que ser identicos.
 *   · «mcv01» (7d4939e, el campo conversion del evento cierre, y su arreglo 36794dd): base 63be57d (antes
 *     de conversion) + 4235196 + e58536d + ee766b8 + 5b348cd + f252152 + ed36936 + f67facd. Es la copia
 *     de trabajo SIN conversion, SIN MCV-01 y SIN la optimizacion (que ya cubre el otro contrato): los
 *     200 escenarios (ahora tambien 1F y 3F, porque 4235196 va en la cadena) tienen que ser identicos
 *     quitando SOLO el campo conversion de los eventos.
 * Por que: hasta la 1-119 las referencias eran la base con unos parches sueltos; la regla de la vela
 * (ed36936 + f67facd) no estaba y la prueba dio rojo sin fallo del motor. Construida desde la cadena
 * completa, una referencia nunca se queda atras sin avisar, y lo unico que difiere es lo que se mide.
 * Una EXCEPCION en un escenario es rojo (se cuenta aparte), nunca igualdad.
 *   node --import ./pruebas/sin-red.mjs --import ./pruebas/registro.mjs pruebas/medidas/equivalencia.mjs [escenarios]
 *        [--contrato optimizacion|mcv01] [--sin COMMIT]… [--mutante regla-vela|mcv01] [--control-excepcion]
 * --sin COMMIT: la cadena de las referencias sin ese commit (control: tiene que salir rojo; con
 *   --sin ed36936 --sin f67facd, la referencia vieja de antes de la 1-119).
 * --olvida COMMIT: como --sin, y ademas el commit sale de la cadena DECLARADA (control: la guarda de la historia
 *   tiene que decir que hay un commit de motor sin declarar).
 * --mutante NOMBRE: en lugar de la copia de trabajo, una copia temporal suya con un fallo CONOCIDO
 *   (control: tiene que salir rojo). regla-vela: caminoDeLaVela no decide nunca (el motor sin la regla
 *   de la 1-119); mcv01: la firma de ambiguedad vuelve a llevar el minuto y la fase de la conversion
 *   (el fallo MCV-01 de Astra).
 * --control-excepcion: las dos versiones lanzan en el escenario 0 (control: tiene que salir rojo).
 * Codigo 0 solo si todos los contratos pedidos salen identicos, sin excepciones, con eventos y con la
 * cadena declarada igual a la historia.
 */
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, cpSync } from 'node:fs'
import { execFileSync, spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { REPO, importa } from '../lib.mjs'
const args = process.argv.slice(2)
const opcion = k => { const i = args.indexOf(k); return i < 0 ? null : args[i + 1] }
const todas = k => args.flatMap((x, i) => (x === k ? [args[i + 1]] : []))
const N = Number(args.find(x => /^\d+$/.test(x) && ![...todas('--sin'), ...todas('--olvida')].includes(x)) ?? 60)
const CONTROL_EXC = args.includes('--control-excepcion'), SIN = todas('--sin'), OLVIDA = todas('--olvida'), MUTANTE = opcion('--mutante')
const CONTRATOS = {
  optimizacion: { ref: '4235196', cadena: ['36794dd', 'e58536d', 'ee766b8', '5b348cd', 'f252152', 'ed36936', 'f67facd'], fuera: ['a8e40a4'], quita: [] },
  mcv01: { ref: '63be57d', cadena: ['4235196', 'e58536d', 'ee766b8', '5b348cd', 'f252152', 'ed36936', 'f67facd'], fuera: ['7d4939e', '36794dd', 'a8e40a4'], quita: ['conversion'] },
}
const pedidos = opcion('--contrato') ? [opcion('--contrato')] : Object.keys(CONTRATOS)
if (!pedidos.every(c => CONTRATOS[c])) { console.log(`contrato desconocido: ${pedidos}`); process.exit(2) }
const git = (...a) => execFileSync('git', ['-C', REPO, ...a], { encoding: 'utf8', maxBuffer: 64 * 1048576 })
const existe = (c, f) => spawnSync('git', ['-C', REPO, 'cat-file', '-e', `${c}:${f}`]).status === 0
const corto = c => git('rev-parse', '--short=7', c).trim()
// la historia de lib/motor entre la base y la copia de trabajo, sin fusiones (af6bbea solo junta lo que ya esta)
const historia = ref => git('log', '--reverse', '--no-merges', '--format=%h', '--abbrev=7', `${ref}..HEAD`, '--', 'lib/motor/').split('\n').filter(Boolean)
// la referencia: lib/motor y lib/mercado de «ref» y la cadena encima, fichero a fichero a tres bandas
async function referencia({ ref, cadena }) {
  const dir = mkdtempSync(path.join(tmpdir(), 'motor-ref-'))
  for (const f of git('ls-tree', '-r', '--name-only', ref, 'lib/motor/', 'lib/mercado/').split('\n').filter(f => f.endsWith('.mjs'))) {
    mkdirSync(path.join(dir, path.dirname(f)), { recursive: true }); writeFileSync(path.join(dir, f), git('show', `${ref}:${f}`))
  }
  const b = path.join(dir, '.base'), t = path.join(dir, '.suyo')
  for (const c of cadena) {
    for (const f of git('diff', '--name-only', `${c}^`, c, '--', 'lib/motor/').split('\n').filter(Boolean)) {
      const p = path.join(dir, f)
      if (!existe(c, f)) { rmSync(p, { force: true }); continue }
      if (!existe(`${c}^`, f) || !existsSync(p)) { mkdirSync(path.dirname(p), { recursive: true }); writeFileSync(p, git('show', `${c}:${f}`)); continue }
      writeFileSync(b, git('show', `${c}^:${f}`)); writeFileSync(t, git('show', `${c}:${f}`))
      const r = spawnSync('git', ['merge-file', '-p', p, b, t], { encoding: 'utf8', maxBuffer: 64 * 1048576 })
      if (r.status !== 0) throw new Error(`la cadena no aplica: ${c} en ${f} (${r.status} conflictos)`)
      writeFileSync(p, r.stdout)
    }
  }
  rmSync(b, { force: true }); rmSync(t, { force: true })
  return { dir, MO: await modulos(dir) }
}
const modulos = async dir => { const de = f => import(pathToFileURL(path.join(dir, f)).href); return { CA: await de('lib/motor/cartera.mjs'), RT: await de('lib/motor/reto.mjs'), M: await de('lib/motor/motor.mjs') } }
// los mutantes conocidos (controles): la copia de trabajo con UN fallo; si el texto no esta, error (el control no vale)
const MUTANTES = {
  'regla-vela': ['lib/motor/vela.mjs', 'export function caminoDeLaVela(v, par) {', 'export function caminoDeLaVela(v, par) {\n  return null'],
  mcv01: ['lib/motor/motor.mjs', 'export const sinMomento = x => { const { en, ...resto } = x; return resto.conversion ? { ...resto, conversion: { par: resto.conversion.par, valor: resto.conversion.valor } } : resto }', 'export const sinMomento = x => { const { en, ...resto } = x; return resto }'],
}
async function mutante(nombre) {
  const m = MUTANTES[nombre]; if (!m) { console.log(`mutante desconocido: ${nombre}`); process.exit(2) }
  const dir = mkdtempSync(path.join(tmpdir(), 'motor-mut-'))
  for (const d of ['lib/motor', 'lib/mercado']) cpSync(path.join(REPO, d), path.join(dir, d), { recursive: true })
  const p = path.join(dir, m[0]), texto = readFileSync(p, 'utf8')
  if (texto.split(m[1]).length !== 2) throw new Error(`el mutante ${nombre} no encuentra su texto una vez en ${m[0]}`)
  writeFileSync(p, texto.replace(m[1], m[2]))
  return { dir, MO: await modulos(dir) }
}
const copia = MUTANTE ? await mutante(MUTANTE) : null
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
  const C0 = CONTRATOS[nombre], C = { ...C0, cadena: C0.cadena.filter(c => !OLVIDA.includes(c)) }
  const cadena = C.cadena.filter(c => !SIN.includes(c))
  // la cadena declarada (con lo que el contrato deja fuera) tiene que ser la historia de lib/motor; y lib/mercado/calidad.mjs
  // (lo unico de lib/mercado que importa el motor) el de la copia de trabajo
  const h = historia(C.ref), declarada = [...C.cadena, ...C.fuera].map(corto)
  const sobra = h.filter(c => !declarada.includes(c)), falta = declarada.filter(c => !h.includes(c))
  const calidad = git('show', `${C.ref}:lib/mercado/calidad.mjs`) === readFileSync(path.join(REPO, 'lib/mercado/calidad.mjs'), 'utf8')
  if (sobra.length || falta.length || !calidad) {
    fallo = true
    console.log(`contrato ${nombre} · la cadena declarada no es la historia de lib/motor desde ${C.ref}: sin declarar [${sobra.join(' ')}] · declarados que no estan [${falta.join(' ')}]${calidad ? '' : ' · lib/mercado/calidad.mjs cambio'}`)
  }
  let VIEJO, dir
  try { ({ dir, MO: VIEJO } = await referencia({ ref: C.ref, cadena })) } catch (e) {
    fallo = true; console.log(`contrato ${nombre} · referencia ${C.ref} + ${cadena.join(' + ')} · NO SE CONSTRUYE: ${e.message}`); continue
  }
  let escenarios = 0, iguales = 0, excepciones = 0, eventos = 0, cierres = 0, quemas = 0
  const malos = []
  for (let k = 0; k < N; k++) {
    const esc = escenario(k)
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
  console.log(`contrato ${nombre} · referencia ${C.ref} + ${cadena.join(' + ')}${C.quita.length ? ' (sin ' + C.quita.join(', ') + ')' : ''} · copia ${MUTANTE ? 'mutante ' + MUTANTE : 'de trabajo'} · escenarios ${escenarios} · identicos ${iguales} · excepciones ${excepciones} · eventos economicos ${eventos} (cierres ${cierres}, breaches ${quemas})`)
  for (const x of malos.slice(0, 20)) console.log('  ✗ ' + x)
  if (malos.length > 20) console.log(`  … y ${malos.length - 20} mas`)
  if (malos.length || excepciones || eventos === 0 || iguales !== escenarios) fallo = true
}
if (copia) rmSync(copia.dir, { recursive: true, force: true })
process.exit(fallo ? 1 : 0)
