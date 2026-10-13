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
 * verifica({ almacen, texto, velasDe, diasAceptadosDe }): solo lectura; cada
 * trozo con su sha, la cadena de manifiestos, la cobertura, ningun hueco de
 * mas de 15 min sin aceptar, el ancla de aceptaciones, los datos dia a dia y
 * los tamaños del listado.
 */
import { brotliDecompressSync } from 'zlib'
import { titulo, oraculo, fin, importa } from './lib.mjs'
const PV = await importa('lib/mercado/publica-v1.mjs')
const VV = await importa('lib/mercado/verifica-v1.mjs')
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
// el almacen en memoria; fallos: { sube: (ruta, n) => Error | null, lee: (ruta, bytes) => bytes }
function almacen(fallos = {}) {
  const o = new Map(), registro = []
  let n = 0
  return {
    o, registro,
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
const sinCerrojo = a => !a.o.has('v1/_cerrojo.json')

titulo('1 · primera publicacion de dos pares')
const a1 = almacen()
const r1 = await corre(() => PV.publica({ almacen: a1, planes: [planEU(), planGB()], dueno: 'prueba', ahora: '2026-10-14T10:00:00Z' }))
const pun1 = a1.o.has('v1/actual.json') ? JSON.parse(a1.o.get('v1/actual.json')) : null
oraculo('PUBS', 'publicado: el puntero apunta a v1.1 de los dos pares con su huella y la ruta de su manifiesto', r1.estado === 'publicado' && pun1?.esquema === 'mercado-puntero@1' && pun1.pares.EURUSD?.version === 'v1.1' && pun1.pares.GBPUSD?.huella === planGB().manifiesto.huella && pun1.pares.EURUSD.ruta === `v1/EURUSD/manifiestos/v1.1.${pun1.pares.EURUSD.huella}.json`, JSON.stringify(r1).slice(0, 300))
const rutaMar = PV.rutaTrozo('EURUSD', '2026-03-03', planEU().manifiesto.dias.find(d => d.dia === '2026-03-03').sha256)
oraculo('PUBS', 'los trozos en v1/<PAR>/<AAAA>/<MM>/<DD>.<sha>.bin.br, en brotli, y su sha es el del binario', /^v1\/EURUSD\/2026\/03\/03\.[0-9a-f]{64}\.bin\.br$/.test(rutaMar) && a1.o.has(rutaMar) && B.huella(brotliDecompressSync(a1.o.get(rutaMar))) === rutaMar.split('.')[1])
const subidas = a1.registro.filter(x => x[0] === 'sube').map(x => x[1])
const iP = subidas.indexOf('v1/actual.json'), iM = subidas.map((x, i) => (/manifiestos/.test(x) ? i : -1)).filter(i => i >= 0)
oraculo('PUBS', 'orden: el cerrojo el primero, los trozos antes que los manifiestos y el puntero el ultimo de todos', subidas[0] === 'v1/_cerrojo.json' && iP === subidas.length - 1 && iM.length === 2 && Math.min(...iM) > subidas.findLastIndex(x => /\.bin\.br$/.test(x)), subidas.join(' · ').slice(0, 300))
oraculo('PUBS', 'cada trozo y cada manifiesto se relee despues de subirlo, y el puntero tambien; el cerrojo se suelta', a1.registro.filter(x => x[0] === 'lee' && /\.bin\.br$/.test(x[1])).length >= 8 && a1.registro.at(-1)[0] === 'borra' && sinCerrojo(a1))
const r1b = await PV.publica({ almacen: a1, planes: [planEU(datos1, await PV.manifiestoVigente(a1, 'EURUSD')), planGB(undefined, await PV.manifiestoVigente(a1, 'GBPUSD'))], dueno: 'prueba', ahora: '2026-10-14T10:05:00Z' })
oraculo('PUBS', 'sin datos nuevos: «nada», sin tocar el puntero ni poner el cerrojo', r1b.estado === 'nada' && JSON.stringify(JSON.parse(a1.o.get('v1/actual.json'))) === JSON.stringify(pun1) && sinCerrojo(a1))

titulo('2 · continuacion: solo lo nuevo; el manifiesto anterior queda')
const datos2 = velas('2026-03-01', '2026-03-10', { faltan: [['2026-03-03T10:01Z', '2026-03-03T10:21Z']] })
const v11 = await PV.manifiestoVigente(a1, 'EURUSD')
const antes2 = new Set(a1.o.keys())
const r2 = await PV.publica({ almacen: a1, planes: [planEU(datos2, v11)], dueno: 'prueba', ahora: '2026-10-15T10:00:00Z' })
const pun2 = JSON.parse(a1.o.get('v1/actual.json'))
const nuevas = [...a1.o.keys()].filter(k => !antes2.has(k))
oraculo('PUBS', 'v1.2 de EURUSD en el puntero; GBPUSD sigue en v1.1; suben solo los 3 trozos nuevos y su manifiesto', r2.estado === 'publicado' && pun2.pares.EURUSD.version === 'v1.2' && pun2.pares.GBPUSD.version === 'v1.1' && nuevas.filter(k => /\.bin\.br$/.test(k)).length === 3 && nuevas.filter(k => /manifiestos/.test(k)).length === 1 && a1.o.has(pun1.pares.EURUSD.ruta), nuevas.join(' · '))
oraculo('PUBS', 'el manifiesto nuevo continua al anterior (anterior = su huella)', MF.esContinuacion(v11, await PV.manifiestoVigente(a1, 'EURUSD')) === null && (await PV.manifiestoVigente(a1, 'EURUSD')).anterior === v11.huella)

titulo('3 · fallos: el puntero anterior sigue valiendo')
const aC = almacen(); aC.o.set('v1/_cerrojo.json', Buffer.from(JSON.stringify({ dueno: 'otro', desde: '2026-10-14T09:00:00Z' })))
const rC = await corre(() => PV.publica({ almacen: aC, planes: [planEU()], dueno: 'prueba', ahora: '2026-10-14T10:00:00Z' }))
oraculo('PUBS', 'cerrojo puesto por otro: error que dice quien y desde cuando; no sube nada y no toca su cerrojo', /otro/.test(rC.error ?? '') && /2026-10-14T09:00/.test(rC.error) && aC.o.size === 1, JSON.stringify(rC))
const aF = almacen({ sube: (ruta, n) => (n === 4 ? new Error('red caida') : null) })
const rF = await corre(() => PV.publica({ almacen: aF, planes: [planEU()], dueno: 'prueba', ahora: '2026-10-14T10:00:00Z' }))
oraculo('PUBS', 'falla la subida del 3.er trozo: error, sin puntero ni manifiesto, y el cerrojo suelto', !!rF.error && !aF.o.has('v1/actual.json') && ![...aF.o.keys()].some(k => /manifiestos/.test(k)) && sinCerrojo(aF), JSON.stringify(rF))
const aOk = almacen(); for (const [k, v] of aF.o) aOk.o.set(k, v)
const rF2 = await PV.publica({ almacen: aOk, planes: [planEU()], dueno: 'prueba', ahora: '2026-10-14T10:10:00Z' })
// el reintento, con un almacen que ya no falla y lo que dejo el intento fallido
oraculo('PUBS', 'el reintento es idempotente: los trozos que ya estaban se comprueban por sha y se publica', rF2.estado === 'publicado' && JSON.parse(aOk.o.get('v1/actual.json')).pares.EURUSD.version === 'v1.1')
const aD = almacen(); aD.o.set(rutaMar, Buffer.from('basura'))
const rD = await corre(() => PV.publica({ almacen: aD, planes: [planEU()], dueno: 'prueba', ahora: '2026-10-14T10:00:00Z' }))
oraculo('PUBS', 'un objeto con el nombre de un trozo y otro contenido: error, sin puntero', /distinto|sha/.test(rD.error ?? '') && !aD.o.has('v1/actual.json') && sinCerrojo(aD), JSON.stringify(rD))
const aL = almacen({ lee: (ruta, b) => (/03\.[0-9a-f]+\.bin\.br$/.test(ruta) ? Buffer.from('cambiado') : b) })
const rL = await corre(() => PV.publica({ almacen: aL, planes: [planEU()], dueno: 'prueba', ahora: '2026-10-14T10:00:00Z' }))
oraculo('PUBS', 'la relectura de un trozo no da su sha: error antes del puntero', !!rL.error && !aL.o.has('v1/actual.json'), JSON.stringify(rL))
const aP = almacen(); await PV.publica({ almacen: aP, planes: [planEU()], dueno: 'prueba', ahora: '2026-10-14T10:00:00Z' })
const viejo = planEU(datos2, null)
const rP = await corre(() => PV.publica({ almacen: aP, planes: [viejo], dueno: 'prueba', ahora: '2026-10-14T11:00:00Z' }))
oraculo('PUBS', 'el puntero cambio desde la planificacion (el plan no parte del vigente): no publica', /puntero/.test(rP.error ?? '') && JSON.parse(aP.o.get('v1/actual.json')).pares.EURUSD.version === 'v1.1' && sinCerrojo(aP), JSON.stringify(rP))
const aI = almacen({ sube: ruta => (ruta === 'v1/actual.json' ? new Error('sin respuesta') : null) })
const rI = await corre(() => PV.publica({ almacen: aI, planes: [planEU()], dueno: 'prueba', ahora: '2026-10-14T10:00:00Z' }))
oraculo('PUBS', 'la subida del puntero falla sin respuesta: «incierto» y el cerrojo se CONSERVA (lo suelta una persona)', /incierto/.test(rI.error ?? '') && aI.o.has('v1/_cerrojo.json'), JSON.stringify(rI))
// BF-03 del diario: la subida del cerrojo sin respuesta. Si quedo puesto y es el nuestro, se sigue; si no se puede saber, no
const aK = almacen()
const subeK = aK.sube.bind(aK)
aK.sube = async (ruta, bytes, o) => { if (ruta === 'v1/_cerrojo.json' && !aK.o.has(ruta)) { aK.o.set(ruta, Buffer.from(bytes)); throw new Error('sin respuesta') } return subeK(ruta, bytes, o) }
const rK = await corre(() => PV.publica({ almacen: aK, planes: [planEU()], dueno: 'prueba', ahora: '2026-10-14T10:00:00Z' }))
oraculo('PUBS', 'cerrojo subido pero sin respuesta: se mira, es el nuestro y se publica', rK.estado === 'publicado' && sinCerrojo(aK), JSON.stringify(rK))
const aK2 = almacen(); aK2.sube = async () => { throw new Error('sin respuesta') }
const rK2 = await corre(() => PV.publica({ almacen: aK2, planes: [planEU()], dueno: 'prueba', ahora: '2026-10-14T10:00:00Z' }))
oraculo('PUBS', 'cerrojo sin respuesta y sin quedar puesto: error «no se pudo poner el cerrojo», nada subido', /cerrojo/.test(rK2.error ?? '') && aK2.o.size === 0, JSON.stringify(rK2))
oraculo('PUBS', 'un plan en incidente no se publica: error con el incidente', /incidente/.test((await corre(() => PV.publica({ almacen: almacen(), planes: [{ ...planEU(), estado: 'incidente', incidente: 'x' }], dueno: 'prueba', ahora: 'x' }))).error ?? ''))

titulo('4 · el verificador (solo lectura)')
const datosDe = { EURUSD: datos2, GBPUSD: velas('2026-03-01', '2026-03-06', { px: () => 1.3 }) }
const ver1 = await VV.verifica({ almacen: a1, texto: texto1, velasDe: async par => datosDe[par], diasAceptadosDe: () => new Map() })
oraculo('VER', 'lo publicado verifica: 0 problemas, los dos pares, la cadena de EURUSD (v1.2 → v1.1) y los bytes del listado', ver1.problemas.length === 0 && ver1.pares.EURUSD?.cadena === 2 && ver1.pares.GBPUSD?.cadena === 1 && ver1.bytes > 0, JSON.stringify(ver1.problemas))
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
oraculo('VER', 'sin puntero: problema', (await VV.verifica({ almacen: almacen(), texto: '', velasDe: async () => null, diasAceptadosDe: () => new Map() })).problemas.some(p => /puntero/.test(p)))
fin()
