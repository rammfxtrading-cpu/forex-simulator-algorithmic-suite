/**
 * ETAPA 3 · EL LECTOR DE MERCADO DE LOS ENDPOINTS (lib/servidor/mercado.mjs; diseño
 * sim-004 e.1, e.2 y q.1). Escrito ANTES que el codigo (contra d161399: en rojo).
 *
 * Con un almacen en memoria y trozos REALES (los del publicador v1, subidos con
 * publica-v1.mjs, como en la etapa 2):
 *   · manifiestosVigentes: el puntero y el manifiesto vigente de cada par pedido,
 *     con su identidad fijada (PAR@v1.k:huella). Sin puntero, o sin algun par:
 *     error PROPIO con codigo (mercado_no_publicado, mercado_incompleto). Falla
 *     cerrado: nada se crea sin mercado;
 *   · manifiestosFijados: los manifiestos que el ESTADO fija (versiones.mercado,
 *     o la efectiva registrada), por su ruta y su huella; otra huella, error;
 *   · fuentes(manifiestos, desde, hasta): las fuentes de lib/motor/fuente.mjs
 *     con los trozos del tramo (y una semana a cada lado, para los huecos)
 *     leidos de antemano, con cache por sha: la segunda vez no se lee nada;
 *   · un trozo alterado en Storage: la fuente lo detiene (trozo_alterado); un
 *     error del almacen: error propio, sin el texto ajeno (BF-02);
 *   · de punta a punta: la cartera de dos pares avanza con esas fuentes.
 */
import { cerrojoEnMemoria } from './cerrojo-falso.mjs'
import { titulo, ver, oraculo, fin, importa } from './lib.mjs'
const P = await importa('lib/mercado/publicador-v1.mjs')
const PV = await importa('lib/mercado/publica-v1.mjs')
const CA = await importa('lib/motor/cartera.mjs')
const { COSTES_1 } = await importa('lib/motor/costes.mjs')
const { minutoCerrado } = await importa('lib/mercado/calidad.mjs')
let S = null
try { S = await importa('lib/servidor/mercado.mjs') } catch { S = null }
const U = iso => Date.parse(iso) / 1000
const D = d => U(d + 'T00:00:00Z')
function velas(desde, hasta, px = 1.1) {
  const o = []
  for (let t = D(desde); t < D(hasta); t += 60) if (!minutoCerrado(t)) o.push({ time: t, open: px, high: px, low: px, close: px, volume: 1 })
  return o
}
function almacen(fallos = {}) {
  const o = new Map(), registro = []
  return {
    o, registro,
    async lee(r) { registro.push(['lee', r]); if (fallos.lee) { const x = fallos.lee(r); if (x) throw x } return o.has(r) ? Buffer.from(o.get(r)) : null },
    async sube(r, b, { upsert = false } = {}) { registro.push(['sube', r]); if (!upsert && o.has(r)) return 'existe'; o.set(r, Buffer.from(b)); return 'ok' },
    async borra(r) { registro.push(['borra', r]); o.delete(r) },
    async lista(p) { return [...o].filter(([k]) => k.startsWith(p)).map(([ruta, b]) => ({ ruta, bytes: b.length })) },
  }
}
const corre = async f => { try { return await f() } catch (e) { return { error: e } } }
const planDe = (par, px) => P.planificaPar({ par, velas: velas('2026-03-01', '2026-03-10', px), texto: '', anterior: null, diasAceptados: new Map() })
const a = almacen()
const planes = [planDe('EURUSD', 1.1), planDe('GBPUSD', 1.3)]
ver('control: los dos planes publican', planes.every(p => p.estado === 'publica'), planes.map(P.resumen).join(' / '))
await PV.publica({ cerrojo: cerrojoEnMemoria(), almacen: a, planes, dueno: 'mercado-v1-publica', ahora: '2026-10-14T10:00:00.000Z' })
const fijaDe = p => `${p.par}@${p.manifiesto.version}:${p.manifiesto.huella}`

titulo('1 · manifiestos vigentes (crear)')
const v = S ? await corre(() => S.manifiestosVigentes(a, ['EURUSD', 'GBPUSD'])) : { error: new Error('sin modulo') }
oraculo('SMER', 'el puntero da el manifiesto vigente de cada par y su identidad fijada PAR@v1.k:huella', !v.error && v.fijados?.EURUSD === fijaDe(planes[0]) && v.fijados?.GBPUSD === fijaDe(planes[1]) && v.manifiestos?.EURUSD?.huella === planes[0].manifiesto.huella, v.error?.message ?? JSON.stringify(v.fijados))
const vacio = S ? await corre(() => S.manifiestosVigentes(almacen(), ['EURUSD'])) : { error: {} }
oraculo('SMER', 'sin puntero: error propio «mercado_no_publicado» (falla cerrado)', vacio.error?.propio === true && vacio.error.codigo === 'mercado_no_publicado', vacio.error?.message)
const falta = S ? await corre(() => S.manifiestosVigentes(a, ['EURUSD', 'USDJPY'])) : { error: {} }
oraculo('SMER', 'un par sin entrada en el puntero: error propio «mercado_incompleto», que lo nombra', falta.error?.propio === true && falta.error.codigo === 'mercado_incompleto' && /USDJPY/.test(falta.error.message), falta.error?.message)

titulo('2 · manifiestos fijados (comandos)')
const versiones = { mercado: { EURUSD: fijaDe(planes[0]), GBPUSD: fijaDe(planes[1]) } }
const f1 = S ? await corre(() => S.manifiestosFijados(a, versiones, ['EURUSD', 'GBPUSD'])) : { error: {} }
oraculo('SMER', 'los manifiestos que fija el estado, por su ruta y su huella', !f1.error && f1.EURUSD?.huella === planes[0].manifiesto.huella && f1.GBPUSD?.par === 'GBPUSD', f1.error?.message)
const otra = { mercado: { ...versiones.mercado, EURUSD: `EURUSD@v1.1:${'a'.repeat(64)}` } }
const f2 = S ? await corre(() => S.manifiestosFijados(a, otra, ['EURUSD'])) : { error: {} }
oraculo('SMER', 'una identidad fijada que no esta en Storage: error propio (no se usa otra version)', f2.error?.propio === true, f2.error?.message)
const f3 = S ? await corre(() => S.manifiestosFijados(a, { mercado: {} }, ['EURUSD'])) : { error: {} }
oraculo('SMER', 'un par sin identidad fijada en el estado: error propio «mercado_no_fijado»', f3.error?.propio === true && f3.error.codigo === 'mercado_no_fijado', f3.error?.message)

titulo('3 · las fuentes del tramo, con cache por sha')
const L = S ? S.creaLector({ almacen: a, cache: S.creaCache(100) }) : null
const desde = U('2026-03-03T00:00:00Z'), hasta = U('2026-03-03T23:59:00Z')
const fu = L ? await corre(() => L.fuentes(f1, { desde, hasta })) : { error: {} }
const tr = fu.EURUSD?.tramo?.(desde - 60, hasta)
oraculo('SMER', 'la fuente de EURUSD da las velas del dia, en ticks, las mismas que se publicaron', !fu.error && tr?.velas.length === velas('2026-03-03', '2026-03-04').length && tr.velas[0].time === desde && !tr.detencion, fu.error?.message ?? JSON.stringify({ n: tr?.velas.length, d: tr?.detencion }))
const lecturas = a.registro.filter(([op, r]) => op === 'lee' && r.endsWith('.bin.br')).length
const fu2 = L ? await corre(() => L.fuentes(f1, { desde, hasta })) : { error: {} }
const lecturas2 = a.registro.filter(([op, r]) => op === 'lee' && r.endsWith('.bin.br')).length
oraculo('SMER', 'la segunda vez, con la misma cache, no se lee ningun trozo de Storage', !fu2.error && lecturas > 0 && lecturas2 === lecturas, `${lecturas} → ${lecturas2}`)
const e0 = CA.crea({ pares: ['EURUSD', 'GBPUSD'], costes: COSTES_1, capital: '100000', mercado: versiones.mercado })
const r0 = !fu.error ? CA.avanza(e0, hasta, fu, { desde }) : null
oraculo('SMER', 'de punta a punta: la cartera de dos pares avanza con esas fuentes hasta el final del dia, sin detencion', r0 && !r0.detencion && r0.estado.reloj.cursor === hasta && Object.keys(r0.estado.cotizaciones).sort().join() === 'EURUSD,GBPUSD', JSON.stringify(r0?.detencion))

titulo('4 · lo que falla, falla cerrado')
const ruta = PV.rutaTrozo('EURUSD', '2026-03-03', planes[0].manifiesto.dias.find(d => d.dia === '2026-03-03').sha256)
const b = almacen(); for (const [k, x] of a.o) b.o.set(k, x)
b.o.set(ruta, PV.comprime(Buffer.from('trozo cambiado')))
const fb = S ? await corre(() => S.creaLector({ almacen: b, cache: S.creaCache(100) }).fuentes(f1, { desde, hasta })) : { error: {} }
const tb = fb.EURUSD?.tramo?.(desde - 60, hasta)
oraculo('SMER', 'un trozo alterado en Storage: la fuente detiene en ese dia (no se usa)', !fb.error && tb?.detencion?.dia === '2026-03-03' && tb.velas.length === 0, fb.error?.message ?? JSON.stringify(tb?.detencion))
const c = almacen({ lee: r => (r.endsWith('.bin.br') ? Object.assign(new Error('503 https://x.supabase.co/?apikey=FUGA123'), { statusCode: '503' }) : null) })
for (const [k, x] of a.o) c.o.set(k, x)
const fc = S ? await corre(() => S.creaLector({ almacen: c, cache: S.creaCache(100) }).fuentes(f1, { desde, hasta })) : { error: {} }
oraculo('SMER', 'Storage falla al leer un trozo: error propio «mercado_no_disponible», sin el texto ajeno', fc.error?.propio === true && fc.error.codigo === 'mercado_no_disponible' && !/FUGA123|supabase/.test(fc.error.message), fc.error?.message)
const cc = S ? S.creaCache(2) : null
if (cc) { cc.pon('a', Buffer.from('1')); cc.pon('b', Buffer.from('2')); cc.toma('a'); cc.pon('c', Buffer.from('3')) }
oraculo('SMER', 'la cache tiene tope: con 2, al meter el tercero sale el menos usado', cc && cc.toma('a') && !cc.toma('b') && cc.toma('c'), cc ? String(cc.tamano) : 'sin modulo')
fin()
