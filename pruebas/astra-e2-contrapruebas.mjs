/**
 * LAS CONTRAPRUEBAS DE ASTRA DE LA ETAPA 2 (revision de 99df01e, 14-oct:
 * revisiones-suite/2026-10-14-astra-mercado-v1-etapa2.md, E2-02..E2-05), llevadas a
 * pruebas/ como permanentes por orden del CTO (14-oct). Original, sin tocar:
 * revisiones-suite/2026-10-14-astra-mercado-v1-etapa2-evidencias/contrapruebas.mjs
 *
 * Las condiciones de los oraculos son las de Astra. Lo que cambia (solo disparadores
 * y controles):
 *   · las rutas: ../lib/ en vez de ./copia/lib/;
 *   · sus comprobaciones de control (plan valido, puntero previo, reintento, Q1, ancla
 *     que detecta la edicion, dia siguiente incompleto, reservado del binario, raiz
 *     rechazada tras la efectiva) son ver(); las cuatro carencias, oraculo();
 *   · E2R3-01 (14-oct): el cerrojo pasa a la base (public.mercado_cerrojo); los
 *     disparadores de E2-02 y E2-03 van sobre su puerto (pruebas/cerrojo-falso.mjs).
 *     La ficha ajena de Astra sin id no cabe en la tabla (dueno uuid NOT NULL): va
 *     como la fila ajena con la misma descripcion y el mismo reloj;
 *   · E2-03: el disparador de Astra (el cerrojo ajeno con lo que B
 *     escribia antes: misma descripcion y mismo reloj) y, ademas, el negativo del CTO
 *     (14-oct): el cerrojo de A con SU id (UUID), B con la misma descripcion, el mismo
 *     reloj y otro id, y la subida de B pierde la respuesta;
 *   · el control nuevo E2-03-propio: con la respuesta perdida y el cerrojo que SI es
 *     el suyo (mismo id), B publica (la adquisicion incierta sigue funcionando).
 */
import { titulo, ver, oraculo, fin, importa } from './lib.mjs'
import { cerrojoEnMemoria } from './cerrojo-falso.mjs'
const P = await importa('lib/mercado/publicador-v1.mjs')
const PV = await importa('lib/mercado/publica-v1.mjs')
const MF = await importa('lib/motor/manifiesto.mjs')
const F = await importa('lib/motor/fuente.mjs')
const A = await importa('lib/mercado/aceptaciones.mjs')
const B = await importa('lib/motor/binario.mjs')
const { ordenPublica } = await importa('lib/mercado/orden-v1.mjs')
const S = d => Date.parse(d + 'T00:00:00Z') / 1000
function velas(hasta = '2026-03-06', omit = () => false) { const a = []; for (let t = S('2026-03-02'); t < S(hasta); t += 60) if (!omit(t)) a.push({ time: t, open: 1.1, high: 1.1, low: 1.1, close: 1.1, volume: 1 }); return a }
const plan = (vs = velas(), anterior = null, texto = '') => P.planificaPar({ par: 'EURUSD', velas: vs, anterior, texto })
function store() { const o = new Map(); return { o, cer: cerrojoEnMemoria(), async lee(k) { return o.get(k) ?? null }, async sube(k, b, { upsert = false } = {}) { if (o.has(k) && !upsert) return 'existe'; o.set(k, Buffer.from(b)); return 'ok' }, async borra(k) { o.delete(k) }, async lista() { return [...o].map(([ruta, b]) => ({ ruta, bytes: b.length })) } } }

titulo('controles de Astra (verdes en 99df01e)')
const p = plan(); ver('control plan valido', p.estado === 'publica', p.estado)
const st = store(); await PV.publica({ almacen: st, cerrojo: st.cer, planes: [plan(velas('2026-03-04'))], dueno: 'A', ahora: 'A' })
const previo = Buffer.from(st.o.get(PV.PUNTERO)); const m0 = await PV.manifiestoVigente(st, 'EURUSD'); const p2 = plan(velas(), m0)
const sub = st.sube; st.sube = async (k, b, o) => { if (k.includes('/manifiestos/')) throw Error('fallo sintetico'); return sub(k, b, o) }
try { await PV.publica({ almacen: st, cerrojo: st.cer, planes: [p2], dueno: 'B', ahora: 'B' }) } catch { /* esperado */ }
ver('puntero previo preservado', st.o.get(PV.PUNTERO).equals(previo), 'fallo manifiesto'); st.sube = sub
await PV.publica({ almacen: st, cerrojo: st.cer, planes: [p2], dueno: 'C', ahora: 'C' }); ver('reintento tras fallo', JSON.parse(st.o.get(PV.PUNTERO)).pares.EURUSD.version === 'v1.2', 'objetos parciales verificados')
const inicio = Date.parse('2026-03-03T10:01Z') / 1000
const ph = plan(velas('2026-03-06', t => t >= inicio && t < inicio + 1200)); ver('Q1 retiene hueco y posteriores', ph.retenido?.dia === '2026-03-03' && ph.manifiesto.dias.at(-1).dia === '2026-03-02', JSON.stringify(ph.retenido))
const ac = { tipo: 'aceptacion', par: 'EURUSD', inicio: '2026-03-03T10:01Z', minutos: 20, motivo: 'corte_del_proveedor', fecha: '2026-10-14', nota: 'inventada' }
const txt = JSON.stringify(ac) + '\n'; const pac = plan(velas('2026-03-06', t => t >= inicio && t < inicio + 1200), null, txt)
let rechaza = false; try { A.compruebaAncla(txt.replace('inventada', 'editada'), pac.manifiesto.aceptaciones) } catch { rechaza = true } ver('ancla detecta edicion', rechaza, 'nota editada')
const pn = plan([...velas('2026-03-04'), { ...velas()[0], time: S('2026-03-04') }]); ver('dia siguiente incompleto retiene', pn.retenido?.dia === '2026-03-03', JSON.stringify(pn.retenido))
const bad = Buffer.from(p.nuevos[0].buffer); bad[19] = 1; let invalid = false; try { B.decodifica(bad) } catch { invalid = true } ver('binario reservado hash correcto', invalid)
const mnext = plan(velas(), m0).manifiesto
const reg = F.continuaVersiones({ mercado: { EURUSD: MF.fija(m0) } }, 'EURUSD', { raiz: m0, actual: m0, nuevo: mnext })
const f0 = F.creaFuente({ manifiesto: m0, fijado: MF.fija(m0), leeTrozo: d => p.nuevos.find(t => t.dia === d)?.buffer })
ver('raiz rechazada tras efectiva', F.fuenteDelEstado({ par: 'EURUSD', versiones: reg.versiones }, f0)?.motivo === 'fuente_de_otra_version', 'registrada v1.2')

titulo('E2-02 · relectura del puntero que LANZA despues de una subida correcta')
const a = store(); let escrito = false; const lee = a.lee, sube = a.sube
a.sube = async (k, b, o) => { const r = await sube(k, b, o); if (k === PV.PUNTERO) escrito = true; return r }
a.lee = async k => { if (k === PV.PUNTERO && escrito) throw Error('Storage 503 sintetico'); return lee(k) }
let error = ''; try { await PV.publica({ almacen: a, cerrojo: a.cer, planes: [p], dueno: 'A', ahora: 'A' }) } catch (e) { error = e.message }
oraculo('E2-02', 'relectura fallida conserva cerrojo y dice incierto', a.cer.filas.has(PV.RECURSO) && /incierto/.test(error), JSON.stringify({ error, cerrojo: a.cer.filas.has(PV.RECURSO), puntero: a.o.has(PV.PUNTERO) }))

titulo('E2-05 · continuacion con el mismo numero de lineas y otro SHA')
const raiz = structuredClone(p.manifiesto); raiz.aceptaciones = { lineas: 1, sha256: 'a'.repeat(64) }; raiz.huella = MF.huellaDe(raiz)
const nn = structuredClone(raiz); nn.version = 'v1.2'; nn.anterior = raiz.huella; nn.aceptaciones.sha256 = 'b'.repeat(64); nn.huella = MF.huellaDe(nn)
const cv = F.continuaVersiones({ mercado: { EURUSD: MF.fija(raiz) } }, 'EURUSD', { raiz, actual: raiz, nuevo: nn })
oraculo('E2-05', 'ancla mismo largo otro SHA', !!cv.incidente, JSON.stringify({ esContinuacion: MF.esContinuacion(raiz, nn), aceptada: !!cv.versiones }))

titulo('E2-04 · JSON ajeno malformado fuera del log')
const mala = store(); mala.o.set(PV.PUNTERO, Buffer.from('FUGA123'))
const deps = { ahora: () => '', almacen: () => mala, leeTexto: async () => '', leeCopia: async () => velas(), diasAceptadosDe: () => new Map() }
const rr = await ordenPublica(['--base', 'inventado', '--vigente', '--pares', 'EURUSD'], deps)
oraculo('E2-04', 'BF02 contenido ajeno fuera del log', !rr.lineas.join(' ').includes('FUGA123'), rr.lineas.join(' / '))

titulo('E2-03 · un cerrojo AJENO con la misma descripcion y el mismo reloj')
const marca = '2026-10-14T10:00:00.000Z', dueño = 'mercado-v1-publica ' + marca
const idA = '0b7c2f4e-1a2b-4c3d-8e9f-a0b1c2d3e4f5', idB = '9d8c7b6a-5f4e-4d3c-8b2a-1f0e9d8c7b6a'
// E2R3-01: el cerrojo es una fila de public.mercado_cerrojo (dueno uuid NOT NULL). La ficha de Astra sin
// id no se puede guardar ahi: su equivalente es la fila AJENA con la misma descripcion y el mismo reloj
// (y otro dueño, uno cualquiera). La adquisicion de B pierde la respuesta (el INSERT no entra: ya hay fila).
const conCerrojo = fila => { const s = store(); s.cer = cerrojoEnMemoria({ fallos: { adquiere: () => Error('respuesta perdida') } }); s.cer.pon(PV.RECURSO, fila); return s }
const intenta = async (s, extra = {}) => { try { return await PV.publica({ almacen: s, cerrojo: s.cer, planes: [p], dueno: 'mercado-v1-publica', ahora: marca, ...extra }) } catch (e) { return { error: e.message } } }
const ajena = { dueno: '44444444-5555-4666-8777-888888888888', descripcion: 'mercado-v1-publica', desde: marca }
const co = conCerrojo({ ...ajena })   // el de Astra: misma descripcion y mismo reloj
const resultado = await intenta(co)
oraculo('E2-03', 'identidad repetida no toma cerrojo ajeno', resultado.estado !== 'publicado' && co.cer.filas.get(PV.RECURSO)?.dueno === ajena.dueno, JSON.stringify({ resultado: resultado.estado ?? resultado.error, cerrojo: co.cer.filas.get(PV.RECURSO) }))
const cu = conCerrojo({ dueno: idA, descripcion: 'mercado-v1-publica', desde: marca })   // el negativo del CTO
const ru = await intenta(cu, { id: idB })
oraculo('E2-03', 'mismo reloj, distinto UUID y respuesta perdida: no publica y el cerrojo de A sigue', ru.estado !== 'publicado' && JSON.stringify(cu.cer.filas.get(PV.RECURSO)) === JSON.stringify({ desde: marca, dueno: idA, descripcion: 'mercado-v1-publica' }), JSON.stringify({ resultado: ru.estado ?? ru.error }))
// control: la respuesta perdida con el cerrojo que SI es suyo sigue publicando
const cp = store(); cp.cer = cerrojoEnMemoria({ fallos: { adquiere: () => 'perdida' } })
let r2; try { r2 = await PV.publica({ almacen: cp, cerrojo: cp.cer, planes: [p], dueno: 'mercado-v1-publica', ahora: marca, id: idB }) } catch (e) { r2 = { error: e.message } }
ver('E2-03-propio: respuesta perdida con el cerrojo propio (mismo id): publica y lo suelta', r2.estado === 'publicado' && !cp.cer.filas.has(PV.RECURSO), JSON.stringify(r2.estado ?? r2.error))
fin()
