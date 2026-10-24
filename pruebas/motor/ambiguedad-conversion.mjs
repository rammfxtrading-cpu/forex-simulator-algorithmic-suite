/**
 * MCV-01 (Astra, revision de 7d4939e: revisiones-suite/2026-10-14-astra-sim-motor-conversion.md):
 * la conversion del evento cierre NO cambia que cierres son ambiguos. Decision del CTO (14-oct):
 * la firma de ambiguedad de cartera.mjs y de motor.mjs normaliza los metadatos temporales de la
 * conversion (minuto y fase) igual que `en`; par y valor siguen dentro.
 * Escrita ANTES que el arreglo: en rojo contra 7d4939e (y contra a8e40a4, que lo hereda).
 *
 *   1 contraste con la base 63be57d (antes de la conversion), sacada con `git show`: BUY/SELL ×
 *     manual/SL/TP × USDJPY/USDCAD/USDCHF × los dos motores (el de un par y la cartera de ese
 *     par), costes@1. Quitando SOLO `conversion`, cada evento es igual al de la base, marcas de
 *     ambiguedad incluidas, y el estado tambien;
 *   2 el caso de Astra: USDJPY, BUY con SL 149.500 en la vela O 150 H 151 L 149 C 150.5: el
 *     mismo SL en los dos caminos → NO ambiguo (en los dos motores);
 *   3 control positivo: una vela que toca el TP por un camino y el SL por el otro (cierres con
 *     tasas de verdad distintas, el bid de cada cierre) → SI ambiguo.
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { titulo, oraculo, ver, fin, importa, REPO } from '../lib.mjs'
const BASE = '63be57d'
// el motor de un commit, sacado con `git show` a una carpeta temporal (solo lectura del repo)
function extrae(ref) {
  const dir = mkdtempSync(path.join(tmpdir(), 'mcv01-'))
  for (const f of execFileSync('git', ['-C', REPO, 'ls-tree', '--name-only', ref, 'lib/motor/', 'lib/mercado/'], { encoding: 'utf8' }).split('\n').filter(f => f.endsWith('.mjs'))) {
    mkdirSync(path.join(dir, path.dirname(f)), { recursive: true }); writeFileSync(path.join(dir, f), execFileSync('git', ['-C', REPO, 'show', `${ref}:${f}`]))
  }
  return dir
}
const de = (d, f) => import(pathToFileURL(path.join(d, f)).href)
const dir = extrae(BASE)
const VIEJO = { M: await de(dir, 'lib/motor/motor.mjs'), CA: await de(dir, 'lib/motor/cartera.mjs') }
// MCV01_NUEVO=<commit>: el motor «nuevo» de ese commit (el rojo contra 7d4939e); si no, la copia de trabajo
const refNuevo = process.env.MCV01_NUEVO
const dirN = refNuevo ? extrae(refNuevo) : null
const NUEVO = dirN ? { M: await de(dirN, 'lib/motor/motor.mjs'), CA: await de(dirN, 'lib/motor/cartera.mjs') } : { M: await importa('lib/motor/motor.mjs'), CA: await importa('lib/motor/cartera.mjs') }
const { COSTES_1 } = await importa('lib/motor/costes.mjs')
rmSync(dir, { recursive: true, force: true })
if (dirN) rmSync(dirN, { recursive: true, force: true })
const T = Date.parse('2026-03-03T10:00:00Z') / 1000
const tx = x => JSON.stringify(x, (k, v) => (typeof v === 'bigint' ? `${v}n` : v))

// un escenario: abrir en T y, o cerrar a mano (parcial y total) o avanzar con SL/TP
function corre(MO, cartera, par, lado, tipo, vela, nivel = null) {
  const { M, CA } = MO
  const j = /JPY/.test(par), fmt = x => x.toFixed(j ? 3 : 5)
  const v = M.velas(par, [{ time: T, open: fmt(vela.p), high: fmt(vela.p), low: fmt(vela.p), close: fmt(vela.p) }, { time: T + 60, open: fmt(vela.o), high: fmt(vela.h), low: fmt(vela.l), close: fmt(vela.c) }])
  const vs = cartera ? { [par]: v } : v
  let e = cartera ? CA.crea({ pares: [par], capital: '100000', costes: COSTES_1 }) : M.crea({ par, capital: '100000', costes: COSTES_1 })
  const motor = cartera ? CA : M
  const extra = tipo === 'manual' ? {} : nivel ?? { [tipo.toLowerCase()]: fmt(vela.p + (tipo === 'TP' ? 1 : -1) * (lado === 'BUY' ? 1 : -1) * vela.paso / 2) }
  const cmds = [{ tipo: 'avanzar', hasta: T }, { tipo: 'abrir', ...(cartera ? { par } : {}), lado, orden: 'mercado', lotes: '1', cotizadoEn: T, ...extra },
    ...(tipo === 'manual' ? [{ tipo: 'avanzar', hasta: T + 60 }, { tipo: 'cerrar', id: 'p1', lotes: '0.25' }, { tipo: 'cerrar', id: 'p1' }] : [{ tipo: 'avanzar', hasta: T + 60 }])]
  return cmds.map(c => { const r = motor.aplica(e, c, vs); e = r.estado; return r })
}
const sinConversion = rs => rs.map(r => ({ ...r, eventos: r.eventos.map(({ conversion, ...resto }) => resto) }))

titulo('1 · contraste con la base 63be57d, quitando solo la conversion')
const VELAS = { USDJPY: { p: 150, o: 150, h: 151, l: 149, c: 150.5, paso: 1 }, USDCAD: { p: 1.37, o: 1.37, h: 1.38, l: 1.36, c: 1.375, paso: 0.01 }, USDCHF: { p: 0.88, o: 0.88, h: 0.89, l: 0.87, c: 0.885, paso: 0.01 } }
// REHECHO (sim-motor-e1, regla de la vela). Las tres velas son ALCISTAS (C > O): la regla da B (O→L→H→C). La base elegia
// el peor para la cartera; difiere SOLO en la SELL con TP (TP por debajo, a medio paso): por A sube primero (pierde) y
// toca el TP bajando en la fase 3; por B lo toca en la fase 2. Los dos caminos dan el mismo TP: no es ambigua, y el
// precio, el P&L y el estado son los de la base; cambia el momento (en: fase 2 en vez de 3). En los otros 30 (manual;
// SL; BUY con TP), la base ya elegia B (empate en los dos minimos → B, o B peor): todo igual a la base
const CAMBIA = new Set(['USDJPY SELL TP', 'USDCAD SELL TP', 'USDCHF SELL TP'])
const sinEn = rs => rs.map(r => ({ ...r, eventos: r.eventos.map(({ en, ...resto }) => resto) }))
let n = 0, distintos = [], cambiados = [], malCambiados = []
for (const par of ['USDJPY', 'USDCAD', 'USDCHF']) for (const lado of ['BUY', 'SELL']) for (const tipo of ['manual', 'SL', 'TP']) for (const cartera of [false, true]) {
  const a = sinConversion(corre(NUEVO, cartera, par, lado, tipo, VELAS[par])), b = corre(VIEJO, cartera, par, lado, tipo, VELAS[par])
  const nombre = `${par} ${lado} ${tipo}`, donde = `${nombre} ${cartera ? 'cartera' : 'un par'}`
  n++
  if (!CAMBIA.has(nombre)) { if (tx(a) !== tx(b)) distintos.push(donde); continue }
  cambiados.push(donde)
  const ca = a.flatMap(x => x.eventos).filter(x => x.tipo === 'cierre'), cb = b.flatMap(x => x.eventos).filter(x => x.tipo === 'cierre')
  const fase = x => x?.en?.fase ?? (x?.en?.tramo != null ? x.en.tramo + 1 : null)
  const ok = tx(sinEn(a)) === tx(sinEn(b)) && ca.length === 1 && cb.length === 1 && ca[0].motivo === 'TP' && !ca[0].ambigua && fase(ca[0]) === 2 && fase(cb[0]) === 3
  if (!ok) malCambiados.push(`${donde}: ${tx([ca.map(x => [x.motivo, x.en, x.ambigua ?? false]), cb.map(x => [x.motivo, x.en])])}`)
}
ver('control: 36 escenarios con cierres, 6 de ellos SELL con TP', n === 36 && cambiados.length === 6, cambiados.join(' · '))
oraculo('MCV1', `los 30 escenarios en que la base ya seguia la regla: sin la conversion, eventos (ambiguedad incluida) y estados iguales a la base`, distintos.length === 0, distintos.join(' · '))
oraculo('MCV1', `los 6 SELL con TP (vela alcista: la regla da B): el mismo TP, no ambiguo, mismo estado y P&L que la base; solo el momento cambia (fase 2 en vez de 3)`, malCambiados.length === 0, malCambiados.join(' · '))

titulo('2 · el caso de Astra')
for (const cartera of [false, true]) {
  const r = corre(NUEVO, cartera, 'USDJPY', 'BUY', 'SL', VELAS.USDJPY, { sl: '149.500' })
  const c = r.flatMap(x => x.eventos).filter(x => x.tipo === 'cierre')
  oraculo('MCV1', `USDJPY BUY con SL 149.500 (${cartera ? 'cartera' : 'motor de un par'}): el mismo SL por los dos caminos → no ambiguo`, c.length === 1 && c[0].precio === 149500n && !c[0].ambigua && !c[0].causa_ambiguedad, tx(c))
}

titulo('3 · control positivo: tasas de verdad distintas')
for (const cartera of [false, true]) {
  const r = corre(NUEVO, cartera, 'USDJPY', 'BUY', 'SL', VELAS.USDJPY, { sl: '149.500', tp: '150.900' })
  const c = r.flatMap(x => x.eventos).filter(x => x.tipo === 'cierre')
  oraculo('MCV1', `TP por un camino y SL por el otro (${cartera ? 'cartera' : 'motor de un par'}): ambiguo`, c.length === 1 && c[0].ambigua === true, tx(c))
}
fin()
