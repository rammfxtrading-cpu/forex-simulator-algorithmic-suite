/**
 * MERCADO V1 · EL FICHERO DE ACEPTACIONES DE HUECOS (etapa 2; CTO 13-oct, Q1;
 * diseño sim-004 p.6). Escrito ANTES que el codigo.
 *
 * lib/mercado/huecos-aceptados.jsonl: de SOLO AÑADIR, una linea JSON por
 * registro:
 *   · aceptacion: { tipo, par, inicio, minutos, motivo, fecha, nota } (la
 *     decide el CTO; la ultima del mismo par e inicio manda mientras no se
 *     publique);
 *   · publicacion: { tipo, par, manifiesto, lineas, prefijo, trozos: [{ inicio,
 *     dia, sha256 }] } (se añade despues de publicar: el ancla = sha256 de los
 *     primeros «lineas» renglones, y el sha del trozo resultante de cada
 *     aceptacion).
 * Una aceptacion NO se puede borrar ni editar despues de publicar: el prefijo
 * de cada publicacion deja de cuadrar y validaAceptaciones lo rechaza. Y el
 * fichero real del repositorio se valida aqui en cada tanda.
 */
import { readFileSync } from 'fs'
import { createHash } from 'crypto'
import { titulo, oraculo, ver, fin, importa } from './lib.mjs'
const A = await importa('lib/mercado/aceptaciones.mjs')
const lanza = f => { try { f(); return false } catch { return true } }
const sha = t => createHash('sha256').update(t).digest('hex')
const linea = o => JSON.stringify(o) + '\n'
const ac = (o = {}) => ({ tipo: 'aceptacion', par: 'EURUSD', inicio: '2026-03-03T10:01Z', minutos: 20, motivo: 'corte_del_proveedor', fecha: '2026-10-14', nota: 'el proveedor no tiene esos minutos en ningun par', ...o })

titulo('1 · aceptaciones validas')
const t1 = linea(ac()) + linea(ac({ par: 'GBPUSD', inicio: '2026-03-04T21:00Z', minutos: 65, motivo: 'cambio_de_sesion' }))
const v1 = A.validaAceptaciones(t1)
oraculo('ACE', 'dos aceptaciones: lineas 2, mapa por par e inicio con su linea (1-based)', v1.lineas === 2 && v1.aceptaciones.get('EURUSD|2026-03-03T10:01Z')?.minutos === 20 && v1.aceptaciones.get('EURUSD|2026-03-03T10:01Z')?.linea === 1 && v1.aceptaciones.get('GBPUSD|2026-03-04T21:00Z')?.linea === 2)
oraculo('ACE', 'aceptacionesDe(par): solo las del par, por inicio', A.aceptacionesDe(v1, 'EURUSD').size === 1 && A.aceptacionesDe(v1, 'GBPUSD').get('2026-03-04T21:00Z')?.motivo === 'cambio_de_sesion')
oraculo('ACE', 'fichero vacio: valido, 0 lineas', A.validaAceptaciones('').lineas === 0)
const t2 = t1 + linea(ac({ minutos: 21, nota: 'corregida: eran 21' }))
oraculo('ACE', 'antes de publicar, una linea posterior del mismo par e inicio corrige (la ultima manda)', A.validaAceptaciones(t2).aceptaciones.get('EURUSD|2026-03-03T10:01Z')?.minutos === 21 && A.validaAceptaciones(t2).aceptaciones.get('EURUSD|2026-03-03T10:01Z')?.linea === 3)
oraculo('ACE', 'ancla(texto, n): sha256 de los n primeros renglones (con su salto de linea)', A.ancla(t1, 1) === sha(linea(ac())) && A.ancla(t1, 2) === sha(t1) && A.ancla(t1, 0) === sha(''))

titulo('2 · lineas que no valen')
const malas = {
  'un par desconocido': ac({ par: 'EURGBP' }),
  'un inicio mal escrito': ac({ inicio: '2026-03-03 10:01' }),
  'un inicio que no existe (31-feb)': ac({ inicio: '2026-02-31T10:01Z' }),
  '15 minutos (no es un hueco a aceptar)': ac({ minutos: 15 }),
  'mas de 2.879 minutos': ac({ minutos: 2880 }),
  'un motivo fuera de la lista': ac({ motivo: 'festivo nacional' }),
  'una fecha mal escrita': ac({ fecha: '14-10-2026' }),
  'sin nota': ac({ nota: '  ' }),
  'una clave de mas (errata)': { ...ac(), minuto: 20 },
  'un tipo desconocido': { ...ac(), tipo: 'rechazo' },
}
for (const [que, o] of Object.entries(malas)) oraculo('ACE', `rechaza ${que}`, lanza(() => A.validaAceptaciones(linea(o))))
oraculo('ACE', 'rechaza una linea vacia, un JSON roto y un fichero sin salto de linea final', lanza(() => A.validaAceptaciones(linea(ac()) + '\n')) && lanza(() => A.validaAceptaciones('{"tipo":\n')) && lanza(() => A.validaAceptaciones(JSON.stringify(ac()))))

titulo('3 · publicar y despues: inmutable (Q1)')
const T = 'a'.repeat(64)
const pub = (texto, o = {}) => linea({ tipo: 'publicacion', par: 'EURUSD', manifiesto: `EURUSD@v1.1:${'b'.repeat(64)}`, lineas: 2, prefijo: A.ancla(texto, 2), trozos: [{ inicio: '2026-03-03T10:01Z', dia: '2026-03-03', sha256: T }], ...o })
const pub1 = t1 + pub(t1)
const vp = A.validaAceptaciones(pub1)
oraculo('ACE', 'una publicacion valida: guarda manifiesto, ancla y el sha del trozo de su aceptacion', vp.publicaciones.length === 1 && vp.publicaciones[0].trozos[0].sha256 === T && vp.publicadas.has('EURUSD|2026-03-03T10:01Z'))
oraculo('ACE', 'anota(texto, registro) añade la linea de publicacion al final y el resultado valida', (() => { const r = A.anota(t1, { tipo: 'publicacion', par: 'EURUSD', manifiesto: `EURUSD@v1.1:${'b'.repeat(64)}`, lineas: 2, prefijo: A.ancla(t1, 2), trozos: [{ inicio: '2026-03-03T10:01Z', dia: '2026-03-03', sha256: T }] }); return r === pub1 && A.validaAceptaciones(r).publicaciones.length === 1 })())
// los intentos del CTO: borrar o editar una aceptacion ya publicada → ROJO
const lineas = pub1.split('\n')
const sinPrimera = lineas.slice(1).join('\n')
const editada = [JSON.stringify(ac({ minutos: 22 })), ...lineas.slice(1)].join('\n')
const notaEditada = [JSON.stringify(ac({ nota: 'otra nota' })), ...lineas.slice(1)].join('\n')
const reordenada = [lineas[1], lineas[0], ...lineas.slice(2)].join('\n')
for (const [que, texto] of [['borrar la aceptacion publicada', sinPrimera], ['editar sus minutos', editada], ['editar solo su nota', notaEditada], ['reordenar las lineas', reordenada]]) {
  oraculo('ACE', `despues de publicar, ${que}: se rechaza`, lanza(() => A.validaAceptaciones(texto)), '')
}
oraculo('ACE', 'despues de publicar, corregirla con una linea nueva del mismo par e inicio: se rechaza', lanza(() => A.validaAceptaciones(pub1 + linea(ac({ minutos: 22 })))))
oraculo('ACE', 'despues de publicar, añadir aceptaciones nuevas (otro inicio) sigue valiendo', !lanza(() => A.validaAceptaciones(pub1 + linea(ac({ inicio: '2026-03-05T11:00Z' })))))
oraculo('ACE', 'una publicacion con un prefijo que no cuadra, con mas lineas de las que la preceden, o con un trozo de una aceptacion que no existe: se rechaza',
  lanza(() => A.validaAceptaciones(t1 + pub(t1, { prefijo: 'c'.repeat(64) })))
  && lanza(() => A.validaAceptaciones(t1 + pub(t1, { lineas: 3 })))
  && lanza(() => A.validaAceptaciones(t1 + pub(t1, { trozos: [{ inicio: '2026-03-03T11:00Z', dia: '2026-03-03', sha256: T }] })))
  && lanza(() => A.validaAceptaciones(t1 + pub(t1, { trozos: [{ inicio: '2026-03-03T10:01Z', dia: '2026-03-04', sha256: T }] }))))
oraculo('ACE', 'anclaVigente: el fichero empieza por el ancla de un manifiesto publicado (lineas y sha); si no, error', A.compruebaAncla(pub1, { lineas: 2, sha256: A.ancla(t1, 2) }) === true && lanza(() => A.compruebaAncla(editada, { lineas: 2, sha256: A.ancla(t1, 2) })) && lanza(() => A.compruebaAncla(linea(ac()), { lineas: 2, sha256: A.ancla(t1, 2) })))

titulo('5 · festivos cortos: un registro «corto» por par y dia (CTO 14-oct, decision 2)')
const MOTIVO = 'mercado reducido (regla de Ramón del 6-oct)'
const co = (o = {}) => ({ tipo: 'corto', par: 'EURUSD', dia: '2025-12-25', velas: 120, motivo: MOTIVO, fecha: '2026-10-14', nota: 'medido en la copia: 22:00 a 23:59 UTC', ...o })
const tc = linea(co()) + linea(co({ par: 'GBPUSD', dia: '2026-01-01', velas: 95 }))
const vale = x => { try { return A.validaAceptaciones(x) } catch { return null } }
const cdes = (v, par) => (v && A.cortosDe ? A.cortosDe(v, par) : new Map())
const vc = vale(tc)
oraculo('ACE', 'dos cortos validos: cortosDe(par) los da por dia, con su linea', vc?.lineas === 2 && cdes(vc, 'EURUSD').get('2025-12-25')?.velas === 120 && cdes(vc, 'EURUSD').get('2025-12-25')?.linea === 1 && cdes(vc, 'GBPUSD').get('2026-01-01')?.velas === 95 && cdes(vc, 'EURUSD').size === 1)
oraculo('ACE', 'el motivo exigido es el de la regla de Ramón (MOTIVO_CORTO)', A.MOTIVO_CORTO === MOTIVO)
oraculo('ACE', 'conviven con las aceptaciones de huecos y no cuentan como ellas', (() => { const v = vale(linea(ac()) + linea(co())); return v?.aceptaciones.size === 1 && cdes(v, 'EURUSD').size === 1 })())
oraculo('ACE', 'antes de publicar, una linea posterior del mismo par y dia corrige (la ultima manda)', cdes(vale(tc + linea(co({ velas: 119, nota: 'corregido' }))), 'EURUSD').get('2025-12-25')?.velas === 119)
const malosC = {
  'un dia que no es 25-dic ni 1-ene': co({ dia: '2026-03-03' }),
  'un dia que no existe': co({ dia: '2025-12-32' }),
  'velas 0': co({ velas: 0 }),
  'velas 1.440 (dia entero: no es corto)': co({ velas: 1440 }),
  'velas no entero': co({ velas: 120.5 }),
  'otro motivo': co({ motivo: 'mercado reducido' }),
  'un par desconocido': co({ par: 'EURGBP' }),
  'una fecha mal escrita': co({ fecha: '14-10-2026' }),
  'sin nota': co({ nota: '' }),
  'una clave de mas': { ...co(), minutos: 20 },
}
for (const [que, o] of Object.entries(malosC)) oraculo('ACE', `corto: rechaza ${que}`, lanza(() => A.validaAceptaciones(linea(o))))

titulo('4 · el fichero real del repositorio (permanente)')
const real = readFileSync(new URL('../lib/mercado/huecos-aceptados.jsonl', import.meta.url), 'utf8')
ver('control: el fichero real existe y se lee', typeof real === 'string')
oraculo('ACE', 'lib/mercado/huecos-aceptados.jsonl valida: ninguna aceptacion publicada borrada ni editada', !lanza(() => A.validaAceptaciones(real)), (() => { try { A.validaAceptaciones(real); return '' } catch (e) { return e.message } })())
fin()
