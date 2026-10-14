/**
 * MERCADO V1 · PUBLICAR EN STORAGE Y VERIFICAR (etapa 2; diseño sim-004 p.7,
 * p.9; S4-11). Escrito ANTES que el codigo.
 *
 * publica({ almacen, planes, dueno, ahora }) con un almacen en memoria (el
 * puerto: lee, sube, borra, lista), que puede fallar a proposito:
 *   · orden: cerrojo → trozos nuevos (sin upsert) → relectura y sha de cada
 *     uno → manifiestos (sin upsert) → relectura → EL PUNTERO, EL ULTIMO →
 *     relectura → se suelta el cerrojo;
 *   · si algo falla antes del puntero, el puntero anterior sigue valiendo; un
 *     reintento es idempotente (lo ya subido se comprueba por sha);
 *   · cerrojo puesto: no sube nada; puntero cambiado desde la planificacion:
 *     no publica; subida del puntero incierta: se conserva el cerrojo.
 *   · E2R3-01: el cerrojo es una fila de public.mercado_cerrojo (puerto cerrojo,
 *     aqui pruebas/cerrojo-falso.mjs, con el registro comun al del almacen); justo
 *     antes del puntero se comprueba que sigue siendo nuestro.
 * verifica({ almacen, texto, velasDe, diasAceptadosDe }): solo lectura; cada
 * trozo con su sha, la cadena de manifiestos, la cobertura, ningun hueco de
 * mas de 15 min sin aceptar, el ancla de aceptaciones, los datos dia a dia y
 * los tamaños del listado.
 */
import { brotliDecompressSync } from 'zlib'
import { titulo, oraculo, fin, importa } from './lib.mjs'
import { cerrojoEnMemoria } from './cerrojo-falso.mjs'
const PV = await importa('lib/mercado/publica-v1.mjs')
const VV = await importa('lib/mercado/verifica-v1.mjs')
const A = await importa('lib/mercado/aceptaciones.mjs')
const P = await importa('lib/mercado/publicador-v1.mjs')
const MF = await importa('lib/motor/manifiesto.mjs')
const B = await importa('lib/motor/binario.mjs')
const { minutoCerrado } = await importa('lib/mercado/calidad.mjs')
const S = d => Date.parse(d + 'T00:00:00Z') / 1000
const U = iso => Date.parse(iso) / 1000
const linea = o => JSON.stringify(o) + '\n'
const ac = (o = {}) => ({ tipo: 'aceptacion', par: 'EURUSD', inicio: '2026-03-03T10:01Z', minutos: 20, motivo: 'corte_del_proveedor', fecha: '2026-10-14', nota: 'prueba', ...o })
function velas(desde, hasta, { faltan = [], px = () => 1.1 } = {}) {
  const out = []
  for (let t = S(desde); t < S(hasta); t += 60) {
    if (minutoCerrado(t) || faltan.some(([a, b]) => t >= U(a) && t < U(b))) continue
    const p = px(t); out.push({ time: t, open: p, high: p, low: p, close: p, volume: 1 })
  }
  return out
}
// el almacen en memoria; fallos: { sube: (ruta, n) => Error | null, lee: (ruta, bytes) => bytes };
// cer: su cerrojo (public.mercado_cerrojo en memoria), con el mismo registro
function almacen(fallos = {}, fallosCerrojo = {}) {
  const o = new Map(), registro = []
  let n = 0
  return {
    o, registro, cer: cerrojoEnMemoria({ fallos: fallosCerrojo, registro }),
    async lee(ruta) { registro.push(['lee', ruta]); const b = o.get(ruta); return b == null ? null : (fallos.lee ? fallos.lee(ruta, Buffer.from(b)) : Buffer.from(b)) },
    async sube(ruta, bytes, { upsert = false } = {}) {
      n++; const e = fallos.sube?.(ruta, n); if (e) throw e
      registro.push(['sube', ruta])
      if (!upsert && o.has(ruta)) return 'existe'
      o.set(ruta, Buffer.from(bytes)); return 'ok'
    },
    async borra(ruta) { registro.push(['borra', ruta]); o.delete(ruta) },
    async lista(prefijo) { return [...o].filter(([k]) => k.startsWith(prefijo)).map(([ruta, b]) => ({ ruta, bytes: b.length })) },
  }
}
const datos1 = velas('2026-03-01', '2026-03-06', { faltan: [['2026-03-03T10:01Z', '2026-03-03T10:21Z']] })
const texto1 = linea(ac())
const planEU = (vs = datos1, anterior = null, texto = texto1) => P.planificaPar({ par: 'EURUSD', velas: vs, texto, anterior, diasAceptados: new Map() })
const planGB = (vs = velas('2026-03-01', '2026-03-06', { px: () => 1.3 }), anterior = null) => P.planificaPar({ par: 'GBPUSD', velas: vs, texto: texto1, anterior, diasAceptados: new Map() })
const corre = async f => { try { return await f() } catch (e) { return { error: `${e?.name}: ${e?.message}` } } }
const CER = 'mercado/v1'
const sinCerrojo = a => !a.cer.filas.has(CER)
const conCerrojo = a => ({ almacen: a, cerrojo: a.cer })

titulo('1 · primera publicacion de dos pares')
const a1 = almacen()
const r1 = await corre(() => PV.publica({ cerrojo: a1.cer, almacen: a1, planes: [planEU(), planGB()], dueno: 'prueba', ahora: '2026-10-14T10:00:00Z' }))
const pun1 = a1.o.has('v1/actual.json') ? JSON.parse(a1.o.get('v1/actual.json')) : null
oraculo('PUBS', 'publicado: el puntero apunta a v1.1 de los dos pares con su huella y la ruta de su manifiesto', r1.estado === 'publicado' && pun1?.esquema === 'mercado-puntero@1' && pun1.pares.EURUSD?.version === 'v1.1' && pun1.pares.GBPUSD?.huella === planGB().manifiesto.huella && pun1.pares.EURUSD.ruta === `v1/EURUSD/manifiestos/v1.1.${pun1.pares.EURUSD.huella}.json`, JSON.stringify(r1).slice(0, 300))
const rutaMar = PV.rutaTrozo('EURUSD', '2026-03-03', planEU().manifiesto.dias.find(d => d.dia === '2026-03-03').sha256)
oraculo('PUBS', 'los trozos en v1/<PAR>/<AAAA>/<MM>/<DD>.<sha>.bin.br, en brotli, y su sha es el del binario', /^v1\/EURUSD\/2026\/03\/03\.[0-9a-f]{64}\.bin\.br$/.test(rutaMar) && a1.o.has(rutaMar) && B.huella(brotliDecompressSync(a1.o.get(rutaMar))) === rutaMar.split('.')[1])
const subidas = a1.registro.filter(x => x[0] === 'sube').map(x => x[1])
const iP = subidas.indexOf('v1/actual.json'), iM = subidas.map((x, i) => (/manifiestos/.test(x) ? i : -1)).filter(i => i >= 0)
oraculo('PUBS', 'orden: el cerrojo el primero, los trozos antes que los manifiestos y el puntero el ultimo de todos', a1.registro[0]?.[0] === 'adquiere' && iP === subidas.length - 1 && iM.length === 2 && Math.min(...iM) > subidas.findLastIndex(x => /\.bin\.br$/.test(x)), subidas.join(' · ').slice(0, 300))
oraculo('PUBS', 'cada trozo y cada manifiesto se relee despues de subirlo, y el puntero tambien; el cerrojo se suelta', a1.registro.filter(x => x[0] === 'lee' && /\.bin\.br$/.test(x[1])).length >= 8 && a1.registro.at(-1)[0] === 'suelta' && sinCerrojo(a1))
const r1b = await PV.publica({ cerrojo: a1.cer, almacen: a1, planes: [planEU(datos1, await PV.manifiestoVigente(a1, 'EURUSD')), planGB(undefined, await PV.manifiestoVigente(a1, 'GBPUSD'))], dueno: 'prueba', ahora: '2026-10-14T10:05:00Z' })
oraculo('PUBS', 'sin datos nuevos: «nada», sin tocar el puntero ni poner el cerrojo', r1b.estado === 'nada' && JSON.stringify(JSON.parse(a1.o.get('v1/actual.json'))) === JSON.stringify(pun1) && sinCerrojo(a1))

titulo('2 · continuacion: solo lo nuevo; el manifiesto anterior queda')
const datos2 = velas('2026-03-01', '2026-03-10', { faltan: [['2026-03-03T10:01Z', '2026-03-03T10:21Z']] })
const v11 = await PV.manifiestoVigente(a1, 'EURUSD')
const antes2 = new Set(a1.o.keys())
const r2 = await PV.publica({ cerrojo: a1.cer, almacen: a1, planes: [planEU(datos2, v11)], dueno: 'prueba', ahora: '2026-10-15T10:00:00Z' })
const pun2 = JSON.parse(a1.o.get('v1/actual.json'))
const nuevas = [...a1.o.keys()].filter(k => !antes2.has(k))
oraculo('PUBS', 'v1.2 de EURUSD en el puntero; GBPUSD sigue en v1.1; suben solo los 3 trozos nuevos y su manifiesto', r2.estado === 'publicado' && pun2.pares.EURUSD.version === 'v1.2' && pun2.pares.GBPUSD.version === 'v1.1' && nuevas.filter(k => /\.bin\.br$/.test(k)).length === 3 && nuevas.filter(k => /manifiestos/.test(k)).length === 1 && a1.o.has(pun1.pares.EURUSD.ruta), nuevas.join(' · '))
oraculo('PUBS', 'el manifiesto nuevo continua al anterior (anterior = su huella)', MF.esContinuacion(v11, await PV.manifiestoVigente(a1, 'EURUSD')) === null && (await PV.manifiestoVigente(a1, 'EURUSD')).anterior === v11.huella)

titulo('3 · fallos: el puntero anterior sigue valiendo')
const aC = almacen(); aC.cer.pon(CER, { dueno: '0f0e0d0c-0b0a-4908-8706-050403020100', descripcion: 'mercado-v1-publica', desde: '2026-10-14T09:00:00Z' })
const rC = await corre(() => PV.publica({ cerrojo: aC.cer, almacen: aC, planes: [planEU()], dueno: 'prueba', ahora: '2026-10-14T10:00:00Z' }))
oraculo('PUBS', 'cerrojo puesto por otro: error que dice quien y desde cuando; no sube nada y no toca su cerrojo', /0f0e0d0c-0b0a-4908-8706-050403020100/.test(rC.error ?? '') && /2026-10-14T09:00/.test(rC.error) && aC.o.size === 0 && aC.cer.filas.get(CER)?.dueno === '0f0e0d0c-0b0a-4908-8706-050403020100', JSON.stringify(rC))
const aF = almacen({ sube: (ruta, n) => (n === 4 ? new Error('red caida') : null) })
const rF = await corre(() => PV.publica({ cerrojo: aF.cer, almacen: aF, planes: [planEU()], dueno: 'prueba', ahora: '2026-10-14T10:00:00Z' }))
oraculo('PUBS', 'falla la subida del 3.er trozo: error, sin puntero ni manifiesto, y el cerrojo suelto', !!rF.error && !aF.o.has('v1/actual.json') && ![...aF.o.keys()].some(k => /manifiestos/.test(k)) && sinCerrojo(aF), JSON.stringify(rF))
const aOk = almacen(); for (const [k, v] of aF.o) aOk.o.set(k, v)
const rF2 = await PV.publica({ cerrojo: aOk.cer, almacen: aOk, planes: [planEU()], dueno: 'prueba', ahora: '2026-10-14T10:10:00Z' })
// el reintento, con un almacen que ya no falla y lo que dejo el intento fallido
oraculo('PUBS', 'el reintento es idempotente: los trozos que ya estaban se comprueban por sha y se publica', rF2.estado === 'publicado' && JSON.parse(aOk.o.get('v1/actual.json')).pares.EURUSD.version === 'v1.1')
const aD = almacen(); aD.o.set(rutaMar, Buffer.from('basura'))
const rD = await corre(() => PV.publica({ cerrojo: aD.cer, almacen: aD, planes: [planEU()], dueno: 'prueba', ahora: '2026-10-14T10:00:00Z' }))
oraculo('PUBS', 'un objeto con el nombre de un trozo y otro contenido: error, sin puntero', /distinto|sha/.test(rD.error ?? '') && !aD.o.has('v1/actual.json') && sinCerrojo(aD), JSON.stringify(rD))
const aL = almacen({ lee: (ruta, b) => (/03\.[0-9a-f]+\.bin\.br$/.test(ruta) ? Buffer.from('cambiado') : b) })
const rL = await corre(() => PV.publica({ cerrojo: aL.cer, almacen: aL, planes: [planEU()], dueno: 'prueba', ahora: '2026-10-14T10:00:00Z' }))
oraculo('PUBS', 'la relectura de un trozo no da su sha: error antes del puntero', !!rL.error && !aL.o.has('v1/actual.json'), JSON.stringify(rL))
const aP = almacen(); await PV.publica({ cerrojo: aP.cer, almacen: aP, planes: [planEU()], dueno: 'prueba', ahora: '2026-10-14T10:00:00Z' })
const viejo = planEU(datos2, null)
const rP = await corre(() => PV.publica({ cerrojo: aP.cer, almacen: aP, planes: [viejo], dueno: 'prueba', ahora: '2026-10-14T11:00:00Z' }))
oraculo('PUBS', 'el puntero cambio desde la planificacion (el plan no parte del vigente): no publica', /puntero/.test(rP.error ?? '') && JSON.parse(aP.o.get('v1/actual.json')).pares.EURUSD.version === 'v1.1' && sinCerrojo(aP), JSON.stringify(rP))
const aI = almacen({ sube: ruta => (ruta === 'v1/actual.json' ? new Error('sin respuesta') : null) })
const rI = await corre(() => PV.publica({ cerrojo: aI.cer, almacen: aI, planes: [planEU()], dueno: 'prueba', ahora: '2026-10-14T10:00:00Z' }))
oraculo('PUBS', 'la subida del puntero falla sin respuesta: «incierto» y el cerrojo se CONSERVA (lo suelta una persona)', /incierto/.test(rI.error ?? '') && aI.cer.filas.has(CER), JSON.stringify(rI))
// BF-03 del diario: la subida del cerrojo sin respuesta. Si quedo puesto y es el nuestro, se sigue; si no se puede saber, no
const aK = almacen({}, { adquiere: () => 'perdida' })
const rK = await corre(() => PV.publica({ cerrojo: aK.cer, almacen: aK, planes: [planEU()], dueno: 'prueba', ahora: '2026-10-14T10:00:00Z' }))
oraculo('PUBS', 'cerrojo subido pero sin respuesta: se mira, es el nuestro y se publica', rK.estado === 'publicado' && sinCerrojo(aK), JSON.stringify(rK))
let nK2 = 0
const aK2 = almacen({}, { adquiere: () => (nK2++ === 0 ? 'tarde' : undefined) })
const rK2 = await corre(() => PV.publica({ cerrojo: aK2.cer, almacen: aK2, planes: [planEU()], dueno: 'prueba', ahora: '2026-10-14T10:00:00Z' }))
oraculo('PUBS', 'cerrojo sin respuesta y sin quedar puesto: error «no se pudo poner el cerrojo», nada subido', /no se pudo poner el cerrojo/.test(rK2.error ?? '') && aK2.o.size === 0, JSON.stringify(rK2))
aK2.cer.terminaTardias()
oraculo('E2R3-01', 'y si ese INSERT llega tarde: queda un cerrojo de una ejecucion que se rindio; el siguiente publicador no publica (falla cerrado: lo libera una persona)', aK2.cer.filas.has(CER) && /cerrojo puesto/.test((await corre(() => PV.publica({ cerrojo: aK2.cer, almacen: aK2, planes: [planEU()], dueno: 'prueba', ahora: 'x' }))).error ?? '') && aK2.o.size === 0)
oraculo('PUBS', 'un plan en incidente no se publica: error con el incidente', /incidente/.test((await corre(() => PV.publica({ ...conCerrojo(almacen()), planes: [{ ...planEU(), estado: 'incidente', incidente: 'x' }], dueno: 'prueba', ahora: 'x' }))).error ?? ''))

titulo('4 · el verificador (solo lectura)')
const datosDe = { EURUSD: datos2, GBPUSD: velas('2026-03-01', '2026-03-06', { px: () => 1.3 }) }
const ver1 = await VV.verifica({ almacen: a1, texto: texto1, velasDe: async par => datosDe[par], diasAceptadosDe: () => new Map() })
oraculo('VER', 'lo publicado verifica (salvo la anotacion, abajo): los dos pares, la cadena de EURUSD (v1.2 → v1.1) y los bytes del listado', ver1.problemas.every(p => /sin anotar/.test(p)) && ver1.pares.EURUSD?.cadena === 2 && ver1.pares.GBPUSD?.cadena === 1 && ver1.bytes > 0, JSON.stringify(ver1.problemas))
const lecturas = a1.registro.length
await VV.verifica({ almacen: a1, texto: texto1, velasDe: async par => datosDe[par], diasAceptadosDe: () => new Map() })
oraculo('VER', 'el verificador no sube ni borra nada', a1.registro.slice(lecturas).every(x => x[0] === 'lee'))
const copia = () => { const a = almacen(); for (const [k, v] of a1.o) a.o.set(k, Buffer.from(v)); return a }
const vErr = async (a, o = {}) => (await VV.verifica({ almacen: a, texto: texto1, velasDe: async par => datosDe[par], diasAceptadosDe: () => new Map(), ...o })).problemas
const t1 = copia(); t1.o.set(rutaMar, Buffer.from('x'))
oraculo('VER', 'un trozo cambiado en Storage: problema', (await vErr(t1)).some(p => /2026-03-03/.test(p)), JSON.stringify(await vErr(t1)))
const t2 = copia(); t2.o.delete(rutaMar)
oraculo('VER', 'un trozo que falta: problema', (await vErr(t2)).some(p => /2026-03-03/.test(p)))
const t3 = copia(); t3.o.delete(pun1.pares.EURUSD.ruta)
oraculo('VER', 'falta un eslabon de la cadena (el manifiesto v1.1): problema', (await vErr(t3)).some(p => /v1\.1/.test(p)), JSON.stringify(await vErr(t3)))
oraculo('VER', 'el fichero de aceptaciones editado despues de publicar: problema', (await vErr(copia(), { texto: linea(ac({ nota: 'otra' })) })).some(p => /aceptaciones/.test(p)))
oraculo('VER', 'los datos del .json.gz (o la copia) cambian un dia publicado: problema', (await vErr(copia(), { velasDe: async par => (par === 'EURUSD' ? velas('2026-03-01', '2026-03-10', { faltan: [['2026-03-03T10:01Z', '2026-03-03T10:21Z']], px: t => (t === U('2026-03-02T05:00Z') ? 1.10001 : 1.1) }) : datosDe[par]) })).some(p => /2026-03-02/.test(p)))
// un manifiesto publicado POR OTRA VIA con un hueco sin aceptar y una cobertura con agujero
const aX = almacen()
const conH = velas('2026-03-01', '2026-03-06', { faltan: [['2026-03-03T10:01Z', '2026-03-03T10:21Z']] })
const trozo = d => { const vs = conH.filter(v => v.time >= S(d) && v.time < S(d) + 86400).map(v => ({ ...v, open: 110000n, high: 110000n, low: 110000n, close: 110000n })); return { dia: d, buffer: B.codifica('EURUSD', S(d), vs) } }
const ajenos = [trozo('2026-03-02'), trozo('2026-03-03')]
const mX = MF.creaManifiesto({ par: 'EURUSD', version: 'v1.1', trozos: ajenos, aceptaciones: { lineas: 0, sha256: (await import('crypto')).createHash('sha256').update('').digest('hex') } })
for (const t of ajenos) await aX.sube(PV.rutaTrozo('EURUSD', t.dia, B.huella(t.buffer)), PV.comprime(t.buffer))
await aX.sube(PV.rutaManifiesto(mX), Buffer.from(JSON.stringify(mX)))
await aX.sube('v1/actual.json', Buffer.from(JSON.stringify({ esquema: 'mercado-puntero@1', pares: { EURUSD: { version: 'v1.1', huella: mX.huella, ruta: PV.rutaManifiesto(mX) } } })))
const pX = (await VV.verifica({ almacen: aX, texto: '', velasDe: async () => null, diasAceptadosDe: () => new Map() })).problemas
oraculo('VER', 'publicado por otra via con un hueco de 20 min sin aceptar: problema (Q1)', pX.some(p => /hueco/.test(p) && /2026-03-03T10:01Z/.test(p)), JSON.stringify(pX))
const mY = MF.creaManifiesto({ par: 'EURUSD', version: 'v1.1', trozos: [trozo('2026-03-02'), trozo('2026-03-04')] })
const aY = almacen()
for (const t of [trozo('2026-03-02'), trozo('2026-03-04')]) await aY.sube(PV.rutaTrozo('EURUSD', t.dia, B.huella(t.buffer)), PV.comprime(t.buffer))
await aY.sube(PV.rutaManifiesto(mY), Buffer.from(JSON.stringify(mY)))
await aY.sube('v1/actual.json', Buffer.from(JSON.stringify({ esquema: 'mercado-puntero@1', pares: { EURUSD: { version: 'v1.1', huella: mY.huella, ruta: PV.rutaManifiesto(mY) } } })))
const pY = (await VV.verifica({ almacen: aY, texto: '', velasDe: async () => null, diasAceptadosDe: () => new Map() })).problemas
oraculo('VER', 'una cobertura con agujero (falta el martes entre lunes y miercoles): problema', pY.some(p => /cobertura/.test(p) && /2026-03-03/.test(p)), JSON.stringify(pY))
oraculo('VER', 'sin datos con que comparar: se dice como aviso, no se da por comprobado', (await VV.verifica({ almacen: aY, texto: '', velasDe: async () => null, diasAceptadosDe: () => new Map() })).avisos.some(a => /sin datos/.test(a)))
// la inmutabilidad en el repositorio depende de que la publicacion este ANOTADA en el fichero (--anota + commit)
const anotado = A.anota(texto1, planEU().publicacion)
const vAn = await VV.verifica({ almacen: a1, texto: anotado, velasDe: async par => datosDe[par], diasAceptadosDe: () => new Map() })
oraculo('VER', 'un hueco aceptado publicado SIN su publicacion anotada en el fichero: problema que lo dice', ver1.problemas.length === 0 ? false : ver1.problemas.some(p => /sin anotar/.test(p) && /2026-03-03T10:01Z/.test(p)), JSON.stringify(ver1.problemas))
oraculo('VER', 'anotada (con el sha del trozo publicado): sin problemas', vAn.problemas.length === 0, JSON.stringify(vAn.problemas))
oraculo('VER', 'sin puntero: problema', (await VV.verifica({ almacen: almacen(), texto: '', velasDe: async () => null, diasAceptadosDe: () => new Map() })).problemas.some(p => /puntero/.test(p)))

titulo('5 · E2-02, E2-03 y E2-04 (Astra, CTO 14-oct)')
const atrapa = async f => { try { return { r: await f() } } catch (e) { return { e } } }
const FUGA = /FUGA123|supabase\.co|apikey/
// E2-02: desde el intento de escribir el puntero hasta su relectura exacta, INCIERTO
for (const [que, lee] of [
  ['la relectura lanza un 503 tras un PUT correcto', () => { throw Object.assign(new Error('Storage 503 https://proyecto.supabase.co/storage?apikey=FUGA123'), { statusCode: '503' }) }],
  ['la relectura dice que no existe', () => null],
  ['la relectura da otros bytes', () => Buffer.from('{"esquema":"otro"}')],
]) {
  let escrito = false
  const aE = almacen({ lee: (ruta, b) => b })
  const subeE = aE.sube.bind(aE), leeE = aE.lee.bind(aE)
  aE.sube = async (ruta, bytes, o) => { const r = await subeE(ruta, bytes, o); if (ruta === 'v1/actual.json') escrito = true; return r }
  aE.lee = async ruta => (ruta === 'v1/actual.json' && escrito ? lee() : leeE(ruta))
  const { e } = await atrapa(() => PV.publica({ cerrojo: aE.cer, almacen: aE, planes: [planEU()], dueno: 'prueba', ahora: '2026-10-14T10:00:00Z' }))
  oraculo('E2-02', `${que}: «incierto», e.incierto, el cerrojo se CONSERVA y el mensaje dice como reconciliar, con el id`,
    /^incierto/.test(e?.message ?? '') && e.incierto === true && aE.cer.filas.has(CER) && /Reconciliar/.test(e.message) && /liberar-cerrojo/.test(e.message) && e.message.includes(e.id) && aE.cer.filas.get(CER).dueno === e.id && !FUGA.test(e.message), e?.message)
}
const aAntes = almacen({ lee: (ruta, b) => (/manifiestos/.test(ruta) ? (() => { throw new Error('503 antes del puntero') })() : b) })
const { e: eAntes } = await atrapa(() => PV.publica({ cerrojo: aAntes.cer, almacen: aAntes, planes: [planEU()], dueno: 'prueba', ahora: '2026-10-14T10:00:00Z' }))
oraculo('E2-02', 'un fallo ANTES del intento del puntero no es incierto: el cerrojo se suelta y no hay puntero', !!eAntes && !eAntes.incierto && sinCerrojo(aAntes) && !aAntes.o.has('v1/actual.json'), eAntes?.message)
// E2-03: un UUID aleatorio por ejecucion, el mismo al ponerlo, releerlo y soltarlo
const ids = []
for (let i = 0; i < 2; i++) {
  const aU = almacen()
  const r = await PV.publica({ cerrojo: aU.cer, almacen: aU, planes: [planEU()], dueno: 'prueba', ahora: '2026-10-14T10:00:00Z' })
  ids.push(aU.registro.find(x => x[0] === 'adquiere')?.[2], r.id)
}
oraculo('E2-03', 'sin id dado: cada ejecucion pone un UUID v4 distinto y lo devuelve; la ficha lleva id, dueno (descripcion) y desde', ids.length === 4 && ids[0] === ids[1] && ids[2] === ids[3] && ids[0] !== ids[2] && ids.every(x => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(x)), ids.join(' '))
const aZ = almacen(); const subeZ = aZ.sube.bind(aZ)
const OTRO = { dueno: '11111111-2222-4333-8444-555555555555', descripcion: 'mercado-v1-publica', desde: '2026-10-14T10:00:00Z' }
aZ.sube = async (ruta, bytes, o) => { const r = await subeZ(ruta, bytes, o); if (ruta === 'v1/actual.json') aZ.cer.filas.set(CER, { ...OTRO }); return r }
const rZ = await PV.publica({ cerrojo: aZ.cer, almacen: aZ, planes: [planEU()], dueno: 'mercado-v1-publica', ahora: '2026-10-14T10:00:00Z' })
oraculo('E2-03', 'al soltar, solo se borra el cerrojo con NUESTRO id: si al final hay otro (mismo dueño y fecha), se deja', rZ.estado === 'publicado' && JSON.stringify(aZ.cer.filas.get(CER)) === JSON.stringify(OTRO))
oraculo('E2-03', 'un id que no es un UUID: error, nada subido', /UUID/.test((await atrapa(() => PV.publica({ ...conCerrojo(almacen()), planes: [planEU()], dueno: 'prueba', ahora: 'x', id: 'mercado-v1-publica 2026' }))).e?.message ?? ''))
// al soltar el cerrojo tras publicar bien: si no se puede (leerlo o borrarlo falla), se dice; no se tapa el resultado
// (E2R3-01: soltar es el DELETE condicional; que falle, o que su respuesta se agote)
for (const [que, falla] of [['el DELETE falla', () => new Error('500 https://proyecto.supabase.co/?apikey=FUGA123')], ['la respuesta del DELETE se agota', () => 'tarde']]) {
  const aS = almacen({}, { suelta: falla })
  const { r, e } = await atrapa(() => PV.publica({ cerrojo: aS.cer, almacen: aS, planes: [planEU()], dueno: 'prueba', ahora: '2026-10-14T10:00:00Z' }))
  oraculo('E2-03', `publicado y no se pudo soltar el cerrojo (${que}): «publicado» con cerrojoSuelto false; el puntero esta`, !e && r?.estado === 'publicado' && r.cerrojoSuelto === false && aS.o.has('v1/actual.json'), e?.message ?? JSON.stringify({ estado: r?.estado, cerrojoSuelto: r?.cerrojoSuelto }))
}
const aN = almacen(); const rN = await PV.publica({ cerrojo: aN.cer, almacen: aN, planes: [planEU()], dueno: 'prueba', ahora: '2026-10-14T10:00:00Z' })
oraculo('E2-03', 'publicado y soltado: cerrojoSuelto true', rN.cerrojoSuelto === true && sinCerrojo(aN))
const aE2 = almacen({ sube: (ruta, n) => (n === 4 ? new Error('red caida') : null) }, { suelta: () => new Error('500 al borrar') })
const { e: eE2 } = await atrapa(() => PV.publica({ cerrojo: aE2.cer, almacen: aE2, planes: [planEU()], dueno: 'prueba', ahora: '2026-10-14T10:00:00Z' }))
oraculo('E2-03', 'un fallo antes del puntero y ademas el cerrojo no se puede borrar: sale el error ORIGINAL y dice que el cerrojo sigue', /subir/.test(eE2?.message ?? '') && /cerrojo .*sigue puesto/.test(eE2.message), eE2?.message)
// E2-04: lo ajeno no llega a los mensajes
const conPuntero = cuerpo => { const a = almacen(); a.o.set('v1/actual.json', Buffer.from(cuerpo)); return a }
const eP = (await atrapa(() => PV.leePuntero(conPuntero('FUGA123')))).e
oraculo('E2-04', 'puntero que no es JSON: «json_ilegible», sin el mensaje del parser ni el contenido', /json_ilegible/.test(eP?.message) && eP.propio === true && !FUGA.test(eP.message) && !/Unexpected|token/.test(eP.message), eP?.message)
const eP2 = (await atrapa(() => PV.leePuntero(conPuntero(JSON.stringify({ esquema: 'mercado-puntero@1', pares: { FUGA123: {} } }))))).e
oraculo('E2-04', 'puntero con un par desconocido: no repite el par', /puntero_invalido/.test(eP2?.message) && !FUGA.test(eP2.message), eP2?.message)
const rutaM = `v1/EURUSD/manifiestos/v1.1.${'a'.repeat(64)}.json`
for (const [que, cuerpo] of [['no es JSON', 'FUGA123'], ['JSON con campos ajenos', JSON.stringify({ esquema: 'FUGA123', par: 'FUGA123' })]]) {
  const aM = almacen(); aM.o.set(rutaM, Buffer.from(cuerpo))
  const eM = (await atrapa(() => PV.leeManifiesto(aM, rutaM))).e
  oraculo('E2-04', `manifiesto que ${que}: codigo propio y sin el contenido`, /json_ilegible|manifiesto_invalido/.test(eM?.message) && !FUGA.test(eM.message), eM?.message)
}
for (const [que, fila] of [['con una descripcion ajena', { dueno: '0f0e0d0c-0b0a-4908-8706-050403020100', descripcion: 'FUGA123', desde: '2026-10-14T09:00:00Z' }], ['con campos ajenos', { dueno: 'FUGA123', descripcion: 'https://proyecto.supabase.co/?apikey=FUGA123', desde: 'FUGA123' }]]) {
  const aC2 = almacen(); aC2.cer.pon(CER, fila)
  const eC = (await atrapa(() => PV.publica({ cerrojo: aC2.cer, almacen: aC2, planes: [planEU()], dueno: 'prueba', ahora: 'x' }))).e
  oraculo('E2-04', `cerrojo ajeno que ${que}: lo dice sin enseñar su contenido`, /cerrojo puesto/.test(eC?.message) && !FUGA.test(eC.message), eC?.message)
}
const aX2 = almacen({ lee: (ruta, b) => (/\.bin\.br$/.test(ruta) ? (() => { throw Object.assign(new Error('fallo https://proyecto.supabase.co/storage/v1?apikey=FUGA123'), { name: 'StorageUnknownError' }) })() : b) })
const eX2 = (await atrapa(() => PV.publica({ cerrojo: aX2.cer, almacen: aX2, planes: [planEU()], dueno: 'prueba', ahora: 'x' }))).e
oraculo('E2-04', 'un error ajeno del almacen (con URL y clave en su texto): sale solo su clase y codigo', /StorageUnknownError otro/.test(eX2?.message) && eX2.propio === true && !FUGA.test(eX2.message), eX2?.message)
const vF = await VV.verifica({ almacen: conPuntero('FUGA123'), texto: '', velasDe: async () => null, diasAceptadosDe: () => new Map() })
oraculo('E2-04', 'el verificador con un puntero que no es JSON: problema sin el contenido', vF.problemas.some(p => /json_ilegible/.test(p)) && !vF.problemas.some(p => FUGA.test(p)), JSON.stringify(vF.problemas))
fin()
