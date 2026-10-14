/**
 * MERCADO V1 · LA CONGELACION DEL LIBERADOR (E2R2-03, Astra; CTO 14-oct).
 * Escrito ANTES que el codigo (contra 1871c43: en rojo).
 *
 * Storage no tiene borrado condicional: el DELETE del cerrojo es por ruta. Por
 * eso el liberador CONGELA (v1/_congelado, sin upsert; tambien es la exclusion
 * entre liberadores), lee el cerrojo dos veces, deja constancia, borra y retira
 * su congelacion. El publicador, justo despues de tomar su cerrojo y antes de
 * escribir nada, mira la congelacion: si existe, suelta su cerrojo y no
 * publica; despues relee su cerrojo (tiene que seguir siendo el suyo).
 * Intercalados con almacenes en memoria y puertas: un publicador vivo que
 * suelta su cerrojo durante la liberacion; otro que lo toma mientras tanto; y
 * uno cuya lectura de la congelacion llega despues de que el liberador borre
 * su cerrojo y retire la congelacion.
 */
import { titulo, ver, oraculo, fin, importa, puerta, asienta } from './lib.mjs'
const P = await importa('lib/mercado/publicador-v1.mjs')
const PV = await importa('lib/mercado/publica-v1.mjs')
const L = await importa('lib/mercado/liberar-v1.mjs')
const { ordenPublica } = await importa('lib/mercado/orden-v1.mjs')
const { minutoCerrado } = await importa('lib/mercado/calidad.mjs')
const CERROJO = 'v1/_cerrojo.json', CONGELADO = 'v1/_congelado'
const idA = '0b7c2f4e-1a2b-4c3d-8e9f-a0b1c2d3e4f5', idB = '9d8c7b6a-5f4e-4d3c-8b2a-1f0e9d8c7b6a', idL = '33333333-4444-4555-8666-777777777777'
const ahora = '2026-10-14T10:05:00.000Z'
const S = d => Date.parse(d + 'T00:00:00Z') / 1000
const velas = (desde, hasta) => { const o = []; for (let t = S(desde); t < S(hasta); t += 60) if (!minutoCerrado(t)) o.push({ time: t, open: 1.1, high: 1.1, low: 1.1, close: 1.1, volume: 1 }); return o }
const plan = P.planificaPar({ par: 'EURUSD', velas: velas('2026-03-01', '2026-03-06'), texto: '', anterior: null, diasAceptados: new Map() })
ver('control: el plan publica', plan.estado === 'publica', plan.estado)
// almacen en memoria con ganchos: antes(op, ruta) se espera antes de cada operacion
function almacen(antes = async () => {}) {
  const o = new Map(), registro = []
  return {
    o, registro,
    async lee(r) { await antes('lee', r); registro.push(['lee', r]); return o.has(r) ? Buffer.from(o.get(r)) : null },
    async sube(r, b, { upsert = false } = {}) { await antes('sube', r); registro.push(['sube', r]); if (!upsert && o.has(r)) return 'existe'; o.set(r, Buffer.from(b)); return 'ok' },
    async borra(r) { await antes('borra', r); registro.push(['borra', r]); o.delete(r) },
    async lista(p) { return [...o].filter(([k]) => k.startsWith(p)).map(([ruta, b]) => ({ ruta, bytes: b.length })) },
  }
}
const libera = (args, a, extra = {}) => L.ordenLibera(args, { almacen: () => a, ahora: () => ahora, entorno: {}, id: () => idL, ...extra })
const publicaB = async (a, id = idB) => { try { return await PV.publica({ almacen: a, planes: [plan], dueno: 'mercado-v1-publica', ahora, id }) } catch (e) { return { error: e.message } } }
const delPublicador = a => [...a.o.keys()].filter(k => !k.startsWith('v1/_'))
const fichaDe = id => Buffer.from(JSON.stringify({ id, dueno: 'mercado-v1-publica', desde: '2026-10-14T08:00:00.000Z' }))
const texto = r => r.lineas.join('\n')

titulo('1 · un publicador VIVO suelta su cerrojo durante la liberacion, y otro lo toma')
{
  // A publica de verdad, pero se para al subir su primer trozo (ya paso la comprobacion de la congelacion)
  const g = puerta(); let parado = true
  const a = almacen(async (op, r) => { if (parado && op === 'sube' && r.endsWith('.bin.br')) await g.p })
  const pa = PV.publica({ almacen: a, planes: [plan], dueno: 'mercado-v1-publica', ahora, id: idA }).catch(e => ({ error: e.message }))
  await asienta()
  ver('control: A tiene el cerrojo y esta parado antes de escribir su primer trozo', a.o.has(CERROJO) && JSON.parse(a.o.get(CERROJO)).id === idA && delPublicador(a).length === 0)
  // el liberador (una persona se equivoco: A vive). Durante la constancia, A termina y suelta; B intenta publicar
  let b = null, escritoB = null
  const sube = a.sube.bind(a)
  a.sube = async (r, by, op) => { const x = await sube(r, by, op); if (r.startsWith('v1/_liberados/')) { parado = false; g.abrir(); const ra = await pa; ver('control: A termina su publicacion y suelta su cerrojo', ra.estado === 'publicado' && ra.cerrojoSuelto === true, JSON.stringify(ra)); const desde = a.registro.length; b = await publicaB(a); escritoB = a.registro.slice(desde).filter(([o2, r2]) => o2 === 'sube' && r2 !== CERROJO) } return x }
  const rl = await libera(['--confirmo', idA], a)
  const punteroA = a.o.has(PV.PUNTERO) ? JSON.parse(a.o.get(PV.PUNTERO)) : null
  oraculo('CONG', 'B, que tomo el cerrojo con la congelacion puesta, no publica: lo suelta y no escribe nada', /congelado/.test(b?.error ?? '') && escritoB?.length === 0, JSON.stringify({ b, escritoB }))
  oraculo('CONG', 'lo publicado es solo lo de A (el puntero es el suyo), y al final no quedan ni cerrojo ni congelacion; el liberador acaba en 0', punteroA?.pares?.EURUSD?.huella === plan.manifiesto.huella && !a.o.has(CERROJO) && !a.o.has(CONGELADO) && rl.codigo === 0, texto(rl))
}

titulo('2 · la lectura de la congelacion de B llega DESPUES de que el liberador borre su cerrojo y la retire')
{
  // A esta muerto (su cerrojo, viejo). Durante la constancia, A desaparece y B toma el cerrojo; la lectura de la congelacion de B se retrasa
  const g = puerta(); let retrasa = false
  const a = almacen(async (op, r) => { if (retrasa && op === 'lee' && r === CONGELADO) { retrasa = false; await g.p } })
  a.o.set(CERROJO, fichaDe(idA))
  let pb = null
  const sube = a.sube.bind(a)
  a.sube = async (r, by, op) => { const x = await sube(r, by, op); if (r.startsWith('v1/_liberados/')) { a.o.delete(CERROJO); retrasa = true; pb = publicaB(a); await asienta() } return x }
  const rl = await libera(['--confirmo', idA], a)
  ver('control: el liberador ya borro (el cerrojo de B) y retiro su congelacion', rl.codigo === 0 && !a.o.has(CERROJO) && !a.o.has(CONGELADO), texto(rl))
  g.abrir()
  const b = await pb
  oraculo('CONG', 'B ve que su cerrojo ya no es el suyo y no publica ni escribe nada', !!b?.error && /ya no es el de esta ejecucion/.test(b.error) && delPublicador(a).length === 0, JSON.stringify(b))
}

titulo('3 · el publicador ante una congelacion')
{
  const a = almacen(); a.o.set(CONGELADO, Buffer.from(JSON.stringify({ id: idL, dueno: 'mercado-v1-liberar-cerrojo', desde: ahora, cerrojo: idA })))
  const b = await publicaB(a)
  oraculo('CONG', 'con v1/_congelado: toma el cerrojo, lo suelta y no escribe nada (error «congelado»)', /congelado/.test(b?.error ?? '') && !a.o.has(CERROJO) && delPublicador(a).length === 0 && a.o.has(CONGELADO), JSON.stringify(b))
  const r = await ordenPublica(['--base', 'x', '--publica', '--pares', 'EURUSD'], { ahora: () => ahora, almacen: () => a, leeTexto: async () => '', leeCopia: async () => velas('2026-03-01', '2026-03-06'), diasAceptadosDe: () => new Map(), id: () => idB })
  oraculo('CONG', 'la orden: codigo 3, lo dice y no queda cerrojo', r.codigo === 3 && /congelado/.test(r.lineas.join(' ')) && !a.o.has(CERROJO), r.lineas.join(' / '))
  const f = almacen(async (op, r) => { if (op === 'lee' && r === CONGELADO) throw Object.assign(new Error('503 https://x.supabase.co/?apikey=FUGA123'), { statusCode: '503' }) })
  const bf = await publicaB(f)
  oraculo('CONG', 'si la congelacion no se puede leer: tampoco publica, suelta el cerrojo y sin lo ajeno', !!bf?.error && !/FUGA123/.test(bf.error) && !f.o.has(CERROJO) && delPublicador(f).length === 0, JSON.stringify(bf))
}

titulo('4 · el liberador: exclusion, orden y congelacion siempre retirada')
{
  const a = almacen(); a.o.set(CERROJO, fichaDe(idA)); a.o.set(CONGELADO, Buffer.from(JSON.stringify({ id: idL, dueno: 'mercado-v1-liberar-cerrojo', desde: ahora, cerrojo: idA })))
  const r0 = await libera([], a)
  oraculo('CONG', 'simulacro con una congelacion: la enseña con su id y como retirarla (--descongela), sin escribir', texto(r0).includes(`--descongela ${idL}`) && !a.registro.some(([op]) => op !== 'lee'), texto(r0))
  const r1 = await libera(['--confirmo', idA], a)
  oraculo('CONG', 'con una congelacion puesta, otro liberador no arranca (codigo 1) y no escribe ni borra', r1.codigo === 1 && !a.registro.some(([op]) => op !== 'lee') && a.o.has(CERROJO), texto(r1))
  const rd = await libera(['--descongela', idA], a)
  oraculo('CONG', '--descongela con otro id: no retira nada', rd.codigo === 1 && a.o.has(CONGELADO), texto(rd))
  const rd2 = await libera(['--descongela', idL], a)
  oraculo('CONG', '--descongela con su id: la retira (codigo 0)', rd2.codigo === 0 && !a.o.has(CONGELADO) && a.o.has(CERROJO), texto(rd2))
  const rc = await L.ordenLibera(['--descongela', idL], { almacen: () => a, ahora: () => ahora, entorno: { CI: '1' } })
  oraculo('CONG', '--descongela con CI: nada', rc.codigo === 1, texto(rc))
}
{
  const a = almacen(); a.o.set(CERROJO, fichaDe(idA))
  const r = await libera(['--confirmo', idA], a)
  const esc = a.registro.filter(([op]) => op !== 'lee').map(([op, x]) => `${op} ${x.startsWith('v1/_liberados/') ? 'constancia' : x}`)
  const lecturasCerrojo = a.registro.slice(a.registro.findIndex(([op, x]) => op === 'sube' && x === CONGELADO), a.registro.findIndex(([op, x]) => op === 'sube' && x.startsWith('v1/_liberados/'))).filter(([op, x]) => op === 'lee' && x === CERROJO).length
  oraculo('CONG', 'orden: congela → (dos lecturas del cerrojo) → constancia → borra el cerrojo → retira la congelacion', r.codigo === 0 && esc.join(' · ') === `sube ${CONGELADO} · sube constancia · borra ${CERROJO} · borra ${CONGELADO}` && lecturasCerrojo === 2, `${esc.join(' · ')} · ${lecturasCerrojo} lecturas`)
}
for (const [que, falla] of [['la constancia', (op, r) => op === 'sube' && r.startsWith('v1/_liberados/')], ['el borrado del cerrojo', (op, r) => op === 'borra' && r === CERROJO]]) {
  const a = almacen(async (op, r) => { if (falla(op, r)) throw Object.assign(new Error('fallo https://x.supabase.co/?apikey=FUGA123'), { statusCode: '500' }) }); a.o.set(CERROJO, fichaDe(idA))
  const r = await libera(['--confirmo', idA], a)
  oraculo('CONG', `si falla ${que}: codigo 3, sin lo ajeno, y la congelacion se retira igual`, r.codigo === 3 && !a.o.has(CONGELADO) && !/FUGA123/.test(texto(r)), texto(r))
}
{
  let n = 0
  const a = almacen(); a.o.set(CERROJO, fichaDe(idA))
  const lee = a.lee.bind(a); a.lee = async r => { if (r === CERROJO && ++n === 3) return fichaDe(idB); return lee(r) }
  const r = await libera(['--confirmo', idA], a)
  oraculo('CONG', 'el cerrojo cambia en la segunda lectura con la congelacion puesta: no borra, no deja constancia, y retira la congelacion', r.codigo === 1 && a.o.has(CERROJO) && !a.registro.some(([op, x]) => x.startsWith('v1/_liberados/') || (op === 'borra' && x === CERROJO)) && !a.o.has(CONGELADO), texto(r))
}
{
  const a = almacen(async (op, r) => { if (op === 'borra' && r === CONGELADO) throw new Error('fallo') }); a.o.set(CERROJO, fichaDe(idA))
  const r = await libera(['--confirmo', idA], a)
  oraculo('CONG', 'si no se puede retirar la congelacion: codigo 3 y dice como retirarla (--descongela <id>); el cerrojo si se libero', r.codigo === 3 && texto(r).includes(`--descongela ${idL}`) && !a.o.has(CERROJO) && a.o.has(CONGELADO), texto(r))
}
fin()
