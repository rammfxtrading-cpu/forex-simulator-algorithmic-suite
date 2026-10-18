/**
 * MERCADO V1 · EL CERROJO EN LA BASE (E2R3-01, Astra; CTO 14-oct). Sustituye a
 * la congelacion de Storage (E2R2-03), que sobra con el borrado condicional.
 *
 * El publicador (lib/mercado/publica-v1.mjs) con el cerrojo de public.mercado_
 * cerrojo (aqui pruebas/cerrojo-falso.mjs, su semantica; la base, en
 * pruebas/mercado-000-cerrojo.mjs):
 *   · justo antes de escribir el puntero comprueba que el cerrojo sigue siendo
 *     suyo (SELECT): si no lo es, NO escribe el puntero, se para y no toca el
 *     cerrojo de otro;
 *   · el residual aceptado, con su efecto acotado: una persona libera por error
 *     a un publicador VIVO y otro toma el cerrojo ANTES de que el vivo haga su
 *     comprobacion previa al puntero; entonces el vivo no escribe el puntero.
 *     Si lo pierde entre esa comprobacion y el PUT, si puede escribirlo: esa
 *     ventana es el residual aceptado (p.14.1 corregido en p.15.4; Astra r4);
 *   · dos publicadores a la vez: uno toma el cerrojo, el otro no escribe nada;
 *   · soltar es condicional: aunque el DELETE llegue tarde, no borra al siguiente.
 */
import { titulo, ver, oraculo, fin, importa, puerta, asienta } from './lib.mjs'
import { cerrojoEnMemoria } from './cerrojo-falso.mjs'
const P = await importa('lib/mercado/publicador-v1.mjs')
const PV = await importa('lib/mercado/publica-v1.mjs')
const L = await importa('lib/mercado/liberar-v1.mjs')
const { minutoCerrado } = await importa('lib/mercado/calidad.mjs')
const CER = PV.RECURSO
const idA = '0b7c2f4e-1a2b-4c3d-8e9f-a0b1c2d3e4f5', idB = '9d8c7b6a-5f4e-4d3c-8b2a-1f0e9d8c7b6a'
const ahora = '2026-10-14T10:05:00.000Z'
const S = d => Date.parse(d + 'T00:00:00Z') / 1000
const velas = (desde, hasta, px = 1.1) => { const o = []; for (let t = S(desde); t < S(hasta); t += 60) if (!minutoCerrado(t)) o.push({ time: t, open: px, high: px, low: px, close: px, volume: 1 }); return o }
const planEU = P.planificaPar({ par: 'EURUSD', velas: velas('2026-03-01', '2026-03-06'), texto: '', anterior: null, diasAceptados: new Map() })
const planGB = P.planificaPar({ par: 'GBPUSD', velas: velas('2026-03-01', '2026-03-06', 1.3), texto: '', anterior: null, diasAceptados: new Map() })
ver('control: los planes publican', planEU.estado === 'publica' && planGB.estado === 'publica')
// almacen con ganchos: antes(op, ruta) se espera antes de cada operacion; apunta quien tenia el cerrojo en cada escritura
function monta(antes = async () => {}) {
  const cer = cerrojoEnMemoria(), o = new Map(), escrituras = []
  const alm = {
    o,
    async lee(r) { await antes('lee', r); return o.has(r) ? Buffer.from(o.get(r)) : null },
    async sube(r, b, { upsert = false } = {}) { await antes('sube', r); if (!upsert && o.has(r)) return 'existe'; o.set(r, Buffer.from(b)); escrituras.push([r, cer.filas.get(CER)?.dueno ?? null]); return 'ok' },
    async borra(r) { o.delete(r) },
    async lista(p) { return [...o].filter(([k]) => k.startsWith(p)).map(([ruta, b]) => ({ ruta, bytes: b.length })) },
  }
  return { cer, alm, escrituras }
}
const publicaCon = async (m, plan, id) => { try { return await PV.publica({ almacen: m.alm, cerrojo: m.cer, planes: [plan], dueno: 'mercado-v1-publica', ahora, id }) } catch (e) { return { error: e.message } } }
const puntero = m => (m.alm.o.has(PV.PUNTERO) ? JSON.parse(m.alm.o.get(PV.PUNTERO)) : null)

titulo('1 · antes del puntero, el publicador comprueba que el cerrojo sigue siendo suyo')
{
  // A se para al subir su manifiesto; mientras, alguien le quita el cerrojo y lo toma B
  const g = puerta(); let para = true
  const m = monta(async (op, r) => { if (para && op === 'sube' && /manifiestos/.test(r)) { para = false; await g.p } })
  const pa = publicaCon(m, planEU, idA)
  await asienta()
  ver('control: A tiene el cerrojo y esta parado en su manifiesto', m.cer.filas.get(CER)?.dueno === idA && !m.alm.o.has(PV.PUNTERO))
  m.cer.filas.delete(CER); m.cer.pon(CER, { dueno: idB, descripcion: 'mercado-v1-publica' })
  g.abrir()
  const ra = await pa
  oraculo('CER', 'A ya no es el dueño: NO escribe el puntero, lo dice y no toca el cerrojo de B', /NO se escribe el puntero/.test(ra.error ?? '') && !m.alm.o.has(PV.PUNTERO) && m.cer.filas.get(CER)?.dueno === idB, JSON.stringify(ra))
  oraculo('CER', 'y al soltar, su DELETE condicional no borra el de B', m.cer.registro.some(x => x[0] === 'suelta' && x[2] === idA) && m.cer.filas.get(CER)?.dueno === idB)
}

titulo('2 · residual aceptado: una persona libera por error a un publicador VIVO, que lo pierde antes de su comprobacion previa al puntero')
{
  // A publica EURUSD y se para en su primer trozo; la persona confirma A (error humano); B toma el cerrojo y publica GBPUSD
  const g = puerta(); let para = true
  const m = monta(async (op, r) => { if (para && op === 'sube' && r.endsWith('.bin.br') && r.includes('EURUSD')) { para = false; await g.p } })
  const pa = publicaCon(m, planEU, idA)
  await asienta()
  const rl = await L.ordenLibera(['--confirmo', idA], { cerrojo: () => m.cer, almacen: () => m.alm, ahora: () => ahora, entorno: {} })
  ver('control: la liberacion por error se hace (codigo 0)', rl.codigo === 0 && !m.cer.filas.has(CER), rl.lineas.at(-1))
  const rb = await publicaCon(m, planGB, idB)
  ver('control: B publica con su cerrojo', rb.estado === 'publicado', JSON.stringify(rb))
  g.abrir()
  const ra = await pa
  oraculo('CER', 'A, vivo y sin cerrojo, no escribe el puntero: el puntero es el de B y no se pierde GBPUSD', /NO se escribe el puntero/.test(ra.error ?? '') && Object.keys(puntero(m)?.pares ?? {}).join() === 'GBPUSD', JSON.stringify({ ra, puntero: puntero(m) }))
  const deA = m.escrituras.filter(([r]) => r.includes('/EURUSD/'))
  oraculo('CER', 'lo que A escribio sin cerrojo son solo trozos y manifiestos de EURUSD (inmutables, por sha), nunca el puntero', deA.length > 0 && deA.every(([r]) => /\.bin\.br$|\/manifiestos\//.test(r)) && m.escrituras.filter(([r]) => r === PV.PUNTERO).every(([, o]) => o === idB), JSON.stringify(m.escrituras.map(([r, o]) => `${r.split('/').slice(1, 2)} ${r.split('/').pop().slice(0, 14)} ${o?.slice(0, 8)}`)))
}

titulo('3 · dos publicadores a la vez')
{
  const g = puerta(); let para = true
  const m = monta(async (op, r) => { if (para && op === 'sube' && r.endsWith('.bin.br')) { para = false; await g.p } })
  const pa = publicaCon(m, planEU, idA)
  await asienta()
  const rb = await publicaCon(m, planGB, idB)
  g.abrir()
  const ra = await pa
  oraculo('CER', 'el segundo encuentra el cerrojo puesto y no escribe nada; el primero publica', /cerrojo puesto/.test(rb.error ?? '') && ra.estado === 'publicado' && !m.escrituras.some(([r]) => r.includes('GBPUSD')) && !m.cer.filas.has(CER), JSON.stringify({ ra: ra.estado, rb }))
}

titulo('4 · soltar es condicional')
{
  // el DELETE de A al soltar se queda en el servidor; B toma el cerrojo; llega el DELETE de A
  const m = monta()
  let primero = true
  m.cer = cerrojoEnMemoria({ fallos: { suelta: () => { if (primero) { primero = false; return 'tarde' } } } })
  const ra = await publicaCon(m, planEU, idA)
  ver('control: A publica y su DELETE queda incierto (cerrojoSuelto false); su fila sigue', ra.estado === 'publicado' && ra.cerrojoSuelto === false && m.cer.filas.get(CER)?.dueno === idA, JSON.stringify(ra))
  m.cer.filas.delete(CER)   // una persona lo libera (o el propio DELETE llego); B lo toma
  m.cer.pon(CER, { dueno: idB, descripcion: 'mercado-v1-publica' })
  const tarde = m.cer.terminaTardias()
  oraculo('CER', 'el DELETE tardio de A (WHERE dueno = A) no borra el cerrojo de B', tarde.join() === '0' && m.cer.filas.get(CER)?.dueno === idB, JSON.stringify(tarde))
}

titulo('5 · el puerto real (scripts/mercado-v1-dependencias.mjs cerrojoDe): lo que pide a PostgREST')
{
  const { cerrojoDe } = await import('../scripts/mercado-v1-dependencias.mjs')
  // un cliente minimo de supabase-js: apunta la cadena de cada orden y devuelve lo que se le diga
  const llamadas = []
  let respuesta = () => ({ data: null, error: null })
  const cliente = () => ({ from(tabla) {
    const c = { tabla, pasos: [] }
    const q = new Proxy({}, { get: (_, k) => (k === 'then' ? (res, rej) => Promise.resolve(respuesta(c)).then(res, rej) : (...a) => { c.pasos.push([k, ...a]); return q }) })
    llamadas.push(c); return q
  } })
  const cer = cerrojoDe(cliente)
  const ult = () => llamadas.at(-1)
  respuesta = () => ({ data: null, error: null })
  const a1 = await cer.adquiere(CER, idA, 'mercado-v1-publica')
  oraculo('CER', 'adquirir: INSERT en mercado_cerrojo con recurso, dueno y descripcion (sin desde: lo pone la base)', a1 === 'ok' && ult().tabla === 'mercado_cerrojo' && JSON.stringify(ult().pasos) === JSON.stringify([['insert', { recurso: CER, dueno: idA, descripcion: 'mercado-v1-publica' }]]), JSON.stringify(ult()))
  respuesta = () => ({ data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "mercado_cerrojo_pkey"' } })
  oraculo('CER', 'adquirir con la clave repetida (23505): «existe»', (await cer.adquiere(CER, idB, 'mercado-v1-publica')) === 'existe')
  respuesta = () => ({ data: null, error: { code: '42501', message: 'permission denied https://x.supabase.co/?apikey=FUGA123' } })
  let e1; try { await cer.adquiere(CER, idB, 'mercado-v1-publica') } catch (e) { e1 = e }
  oraculo('CER', 'otro error al adquirir: lanza propio y saneado (su codigo, sin el texto)', e1?.propio === true && /42501/.test(e1.message) && !/FUGA123|supabase\.co/.test(e1.message), e1?.message)
  respuesta = c => ({ data: c.pasos.some(p => p[0] === 'delete') ? [{ dueno: idA }] : { dueno: idA, desde: '2026-10-14T10:00:00+00:00', descripcion: 'mercado-v1-publica' }, error: null })
  const l1 = await cer.lee(CER)
  oraculo('CER', 'leer: SELECT dueno, desde, descripcion WHERE recurso, una fila como mucho', l1?.dueno === idA && JSON.stringify(ult().pasos) === JSON.stringify([['select', 'dueno,desde,descripcion'], ['eq', 'recurso', CER], ['maybeSingle']]), JSON.stringify(ult()))
  const s1 = await cer.suelta(CER, idA)
  oraculo('CER', 'soltar: DELETE WHERE recurso AND dueno (condicional), y devuelve las filas borradas', s1 === 1 && JSON.stringify(ult().pasos) === JSON.stringify([['delete'], ['eq', 'recurso', CER], ['eq', 'dueno', idA], ['select', 'dueno']]), JSON.stringify(ult()))
}
fin()
