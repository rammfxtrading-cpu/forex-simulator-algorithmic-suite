/**
 * MERCADO V1 · EL PUBLICADOR, NUCLEO PURO (etapa 2; diseño sim-004 p.2–p.5;
 * CTO 13-oct, Q1 = retener). Escrito ANTES que el codigo.
 *
 * planificaPar({ par, velas, aceptaciones, anterior, diasAceptados }) decide,
 * sin red ni reloj, que dias se publican:
 *   · por calendario desde el dia siguiente a la frontera (o el primero de
 *     datos), y PARA en el primer dia con mercado que no se puede publicar
 *     (incompleto, sin vela siguiente o con su dia incompleto, hueco de mas de
 *     15 min sin aceptar, aceptacion que no coincide, velas sin mercado,
 *     precio fuera de rejilla). Nada despues de un dia retenido;
 *   · regenera lo ya publicado y exige el mismo sha (si no: INCIDENTE, nada);
 *   · exige que el fichero de aceptaciones empiece por el ancla publicada;
 *   · los cortos aceptados (dias-aceptados y mercado reducido) van al manifiesto;
 *   · el informe de huecos lista TODOS los de mas de 15 min, con estado y
 *     vecinos, y los solapes con otros pares.
 * Velas sinteticas (minutos con el mercado abierto segun Nueva York); ni red
 * ni datos de alumnos.
 */
import { titulo, oraculo, ver, fin, importa } from './lib.mjs'
const P = await importa('lib/mercado/publicador-v1.mjs')
const MF = await importa('lib/motor/manifiesto.mjs')
const B = await importa('lib/motor/binario.mjs')
const A = await importa('lib/mercado/aceptaciones.mjs')
const { minutoCerrado } = await importa('lib/mercado/calidad.mjs')
const S = d => Date.parse(d + 'T00:00:00Z') / 1000
const U = iso => Date.parse(iso) / 1000
const corre = f => { try { return f() } catch (e) { return { error: `${e?.name}: ${e?.message}` } } }
const linea = o => JSON.stringify(o) + '\n'
const ac = (o = {}) => ({ tipo: 'aceptacion', par: 'EURUSD', inicio: '2026-03-03T10:01Z', minutos: 20, motivo: 'corte_del_proveedor', fecha: '2026-10-14', nota: 'prueba', ...o })

// velas de [desde, hasta) (dias), un minuto por vela con el mercado abierto, salvo los tramos «faltan» [ini, fin)
function velas(desde, hasta, { faltan = [], px = () => 1.1, extra = [] } = {}) {
  const out = []
  for (let t = S(desde); t < S(hasta); t += 60) {
    if (minutoCerrado(t)) continue
    if (faltan.some(([a, b]) => t >= U(a) && t < U(b))) continue
    const p = px(t)
    out.push({ time: t, open: p, high: p, low: p, close: p, volume: 1 })
  }
  return [...out, ...extra].sort((a, b) => a.time - b.time)
}
const sinAc = A.validaAceptaciones('')
const plan = (o = {}) => P.planificaPar({ par: 'EURUSD', velas: velas('2026-03-01', '2026-03-06'), texto: '', anterior: null, diasAceptados: new Map(), ...o })

titulo('1 · primera publicacion: dias completos con su vela siguiente')
// domingo 1 (abre 22:00 UTC) a jueves 5 completos; no hay viernes: el jueves no tiene vela siguiente
const p1 = plan()
oraculo('PUB', 'publica domingo 1 a miercoles 4; el jueves 5 se retiene «sin_vela_siguiente»', p1.estado === 'publica' && p1.manifiesto?.dias.map(d => d.dia).join() === '2026-03-01,2026-03-02,2026-03-03,2026-03-04' && p1.retenido?.dia === '2026-03-05' && p1.retenido.motivo === 'sin_vela_siguiente', P.resumen?.(p1) ?? p1.error)
oraculo('PUB', 'version v1.1, sin anterior, ancla de un fichero vacio (0 renglones), los trozos nuevos = todos', p1.manifiesto?.version === 'v1.1' && p1.manifiesto.anterior === null && p1.manifiesto.aceptaciones?.lineas === 0 && p1.nuevos?.length === 4 && p1.todos.length === 4)
oraculo('PUB', 'los trozos decodifican a las mismas velas (en ticks) y el manifiesto los fija por sha', p1.nuevos?.every(t => p1.manifiesto.dias.find(d => d.dia === t.dia).sha256 === B.huella(t.buffer)) && B.decodifica(p1.nuevos[2].buffer).velas.length === 1440 && B.decodifica(p1.nuevos[2].buffer).velas[0].open === 110000n)
oraculo('PUB', 'determinista: dos pasadas, la misma huella', plan().manifiesto?.huella === p1.manifiesto?.huella)
const p1b = plan({ velas: velas('2026-03-01', '2026-03-05') })
oraculo('PUB', 'el ultimo dia de datos (miercoles) nunca se publica: espera la vela siguiente', p1b.manifiesto?.dias.at(-1).dia === '2026-03-03' && p1b.retenido?.dia === '2026-03-04' && p1b.retenido.motivo === 'sin_vela_siguiente')
// el jueves 5 solo con su primera hora: el miercoles tiene vela siguiente, pero en un dia incompleto
const p1c = plan({ velas: velas('2026-03-01', '2026-03-05', { extra: velas('2026-03-05', '2026-03-06').slice(0, 60) }) })
oraculo('PUB', 'vela siguiente en un dia incompleto: el miercoles se retiene «siguiente_incompleto»', p1c.manifiesto?.dias.at(-1).dia === '2026-03-03' && p1c.retenido?.dia === '2026-03-04' && p1c.retenido.motivo === 'siguiente_incompleto')

titulo('2 · Q1: un hueco de mas de 15 min sin aceptar retiene su dia y todo lo de despues')
const conHueco = velas('2026-03-01', '2026-03-06', { faltan: [['2026-03-03T10:01Z', '2026-03-03T10:21Z']] })
const p2 = plan({ velas: conHueco })
oraculo('PUB', 'el martes 3 (hueco de 20 min desde 10:01) se retiene «hueco_pendiente»; se publica hasta el lunes; el miercoles, completo, tampoco', p2.manifiesto?.dias.at(-1).dia === '2026-03-02' && p2.retenido?.dia === '2026-03-03' && p2.retenido.motivo === 'hueco_pendiente', P.resumen?.(p2))
const h2 = p2.huecos?.find(h => h.inicio === '2026-03-03T10:01Z')
oraculo('PUB', 'el informe lo lista: pendiente, 20 min, con la vela de antes (10:00) y la de despues (10:21)', h2?.estado === 'pendiente' && h2.minutos === 20 && h2.antes.time === U('2026-03-03T10:00Z') && h2.despues.time === U('2026-03-03T10:21Z') && h2.antes.precio === '1.1', JSON.stringify(h2))
const t3 = linea(ac())
const p3 = plan({ velas: conHueco, texto: t3 })
oraculo('PUB', 'aceptado en el fichero: se publica hasta el miercoles; el trozo del martes lleva el hueco', p3.manifiesto?.dias.at(-1).dia === '2026-03-04' && JSON.stringify(B.decodifica(p3.todos.find(t => t.dia === '2026-03-03').buffer).huecos) === JSON.stringify([{ inicio: '2026-03-03T10:01Z', minutos: 20, motivo: 'corte_del_proveedor' }]), P.resumen?.(p3))
oraculo('PUB', 'el ancla del manifiesto es el fichero entero (1 renglon) y la publicacion a anotar trae el sha del trozo del martes', p3.manifiesto?.aceptaciones?.lineas === 1 && p3.manifiesto.aceptaciones.sha256 === A.ancla(t3, 1) && JSON.stringify(p3.publicacion?.trozos) === JSON.stringify([{ inicio: '2026-03-03T10:01Z', dia: '2026-03-03', sha256: p3.manifiesto.dias.find(d => d.dia === '2026-03-03').sha256 }]) && p3.huecos.find(h => h.inicio === '2026-03-03T10:01Z')?.estado === 'aceptado')
oraculo('PUB', 'la publicacion se puede anotar y el fichero resultante valida', (() => { const t = A.anota(t3, p3.publicacion); return A.validaAceptaciones(t).publicadas.has('EURUSD|2026-03-03T10:01Z') })())
const p4 = plan({ velas: conHueco, texto: linea(ac({ minutos: 21 })) })
oraculo('PUB', 'una aceptacion con otros minutos (21 frente a 20): se retiene «aceptacion_no_coincide» y el informe da los minutos reales', p4.retenido?.dia === '2026-03-03' && p4.retenido.motivo === 'aceptacion_no_coincide' && p4.huecos.find(h => h.inicio === '2026-03-03T10:01Z')?.estado === 'no_coincide')
const p4b = plan({ texto: linea(ac({ inicio: '2026-03-03T12:00Z' })) })
oraculo('PUB', 'una aceptacion sin hueco real: no bloquea, y el informe la avisa', p4b.manifiesto?.dias.at(-1).dia === '2026-03-04' && p4b.avisos?.some(x => /2026-03-03T12:00Z/.test(x)), JSON.stringify(p4b.avisos))
// el hueco que cruza la medianoche: el martes acaba a las 23:50 y el miercoles empieza a las 00:10
const cruza = velas('2026-03-01', '2026-03-06', { faltan: [['2026-03-03T23:51Z', '2026-03-04T00:10Z']] })
const p5 = plan({ velas: cruza })
oraculo('PUB', 'hueco de 19 min que cruza la medianoche: va en el trozo del martes (su primer minuto); sin aceptar, se retiene el martes', p5.retenido?.dia === '2026-03-03' && p5.huecos.find(h => h.inicio === '2026-03-03T23:51Z')?.minutos === 19)
const p5b = plan({ velas: cruza, texto: linea(ac({ inicio: '2026-03-03T23:51Z', minutos: 19 })) })
oraculo('PUB', 'aceptado: el trozo del martes lo lleva y el miercoles (que empieza a las 00:10) se publica', p5b.manifiesto?.dias.at(-1).dia === '2026-03-04' && B.decodifica(p5b.todos.find(t => t.dia === '2026-03-03').buffer).huecos[0]?.minutos === 19 && B.decodifica(p5b.todos.find(t => t.dia === '2026-03-04').buffer).huecos.length === 0)

titulo('3 · dias cortos, festivos, fin de semana y datos que no valen')
const corto = velas('2026-03-01', '2026-03-06', { faltan: [['2026-03-03T00:00Z', '2026-03-03T10:00Z']] })   // martes desde las 10:00: 840 velas
const p6 = plan({ velas: corto })
oraculo('PUB', 'martes corto (840/1200) sin aceptar: el lunes, cuya vela siguiente cae en el, se retiene «siguiente_incompleto»', p6.retenido?.dia === '2026-03-02' && p6.retenido.motivo === 'siguiente_incompleto' && /2026-03-03/.test(p6.retenido.detalle), P.resumen?.(p6))
// aceptado como dia corto (lista dias-aceptados): su hueco (lunes 23:59 → martes 10:00) sigue haciendo falta
const p6b = plan({ velas: corto, diasAceptados: new Map([['2026-03-03', { velas: 840, motivo: 'prueba: el proveedor no tiene la mañana' }]]), texto: linea(ac({ inicio: '2026-03-03T00:00Z', minutos: 600, motivo: 'corte_del_proveedor' })) })
oraculo('PUB', 'aceptado el dia corto (y su hueco, en el trozo del martes): se publica y el manifiesto lo declara en cortos_aceptados', p6b.manifiesto?.dias.at(-1).dia === '2026-03-04' && JSON.stringify(p6b.manifiesto.cortos_aceptados) === JSON.stringify([{ dia: '2026-03-03', velas: 840, motivo: 'prueba: el proveedor no tiene la mañana' }]) && MF.cobertura(p6b.manifiesto, '2026-03-01', '2026-03-04').length === 0, P.resumen?.(p6b))
// Navidad de 2025: el miercoles 24-dic hasta las 21:59; el jueves 25-dic (mercado reducido) solo de 22:00 a 22:59
const nav = velas('2025-12-21', '2025-12-30', { faltan: [['2025-12-24T22:00Z', '2025-12-25T22:00Z'], ['2025-12-25T23:00Z', '2025-12-26T00:00Z']] })
ver('control: el 25-dic tiene 60 velas (22:00 a 22:59)', nav.filter(v => v.time >= S('2025-12-25') && v.time < S('2025-12-26')).length === 60)
const p7 = P.planificaPar({ par: 'EURUSD', velas: nav, texto: linea(ac({ inicio: '2025-12-24T22:00Z', minutos: 1440, motivo: 'festivo' })), anterior: null, diasAceptados: new Map() })
// el 25-dic sigue la regla del domingo (velas en su ultima hora) y aqui no las tiene: el 24, cuya vela siguiente cae en el, se retiene
oraculo('PUB', '25-dic (mercado reducido) sin velas en su ultima hora: incompleto; el 24-dic se retiene «siguiente_incompleto»', p7.retenido?.dia === '2025-12-24' && p7.retenido.motivo === 'siguiente_incompleto' && /2025-12-25/.test(p7.retenido.detalle), P.resumen?.(p7))
const nav2 = velas('2025-12-21', '2025-12-30', { faltan: [['2025-12-24T22:00Z', '2025-12-25T22:00Z']] })
// CTO 14-oct (decision 2): un festivo corto se acepta SOLO con su linea «corto» en el fichero de aceptaciones
const huecoNav = linea(ac({ inicio: '2025-12-24T22:00Z', minutos: 1440, motivo: 'festivo' }))
const co = (o = {}) => ({ tipo: 'corto', par: 'EURUSD', dia: '2025-12-25', velas: 120, motivo: A.MOTIVO_CORTO, fecha: '2026-10-14', nota: 'prueba', ...o })
const p7s = P.planificaPar({ par: 'EURUSD', velas: nav2, texto: huecoNav, anterior: null, diasAceptados: new Map() })
oraculo('FES', '25-dic corto SIN su linea «corto»: se retiene «festivo_sin_aceptar» (y lo de despues); el 24 se publica', p7s.retenido?.dia === '2025-12-25' && p7s.retenido.motivo === 'festivo_sin_aceptar' && /corto/.test(p7s.retenido.detalle) && p7s.manifiesto?.dias.at(-1).dia === '2025-12-24', P.resumen?.(p7s))
const p7b = P.planificaPar({ par: 'EURUSD', velas: nav2, texto: huecoNav + linea(co()), anterior: null, diasAceptados: new Map() })
const c25 = p7b.manifiesto?.cortos_aceptados.find(c => c.dia === '2025-12-25')
oraculo('FES', '25-dic con su linea (120 velas) y el hueco de Nochebuena aceptado: se publica y entra en cortos_aceptados con las velas y el motivo de la linea', p7b.manifiesto?.dias.some(d => d.dia === '2025-12-25') && c25?.velas === 120 && c25.motivo === A.MOTIVO_CORTO && MF.cobertura(p7b.manifiesto, '2025-12-25', '2025-12-25').length === 0, P.resumen?.(p7b))
const p7c = P.planificaPar({ par: 'EURUSD', velas: nav2, texto: huecoNav + linea(co({ velas: 121 })), anterior: null, diasAceptados: new Map() })
oraculo('FES', 'la linea pide 121 velas y el dia tiene 120: se retiene', p7c.retenido?.dia === '2025-12-25' && p7c.retenido.motivo === 'festivo_sin_aceptar', P.resumen?.(p7c))
const p7d = P.planificaPar({ par: 'EURUSD', velas: nav2, texto: huecoNav + linea(co({ par: 'GBPUSD' })), anterior: null, diasAceptados: new Map() })
oraculo('FES', 'la linea es de otro par: se retiene', p7d.retenido?.dia === '2025-12-25' && p7d.retenido.motivo === 'festivo_sin_aceptar', P.resumen?.(p7d))
const p7e = P.planificaPar({ par: 'EURUSD', velas: nav2, texto: huecoNav + linea(co({ velas: 100 })), anterior: null, diasAceptados: new Map() })
const p7f = P.planificaPar({ par: 'EURUSD', velas: velas('2025-12-21', '2026-01-02', { faltan: [['2025-12-24T22:00Z', '2025-12-25T22:00Z']] }), texto: huecoNav + linea(co()) + linea(co({ velas: 100, nota: 'corregido despues de publicar' })), anterior: p7b.manifiesto, diasAceptados: new Map() })
oraculo('FES', 'corregir con otra linea el corto de un festivo YA publicado: incidente (los cortos hasta la frontera no pueden cambiar)', p7e.estado === 'publica' && p7f.estado === 'incidente' && /cortos aceptados/.test(p7f.incidente ?? ''), P.resumen?.(p7f))
// (en miercoles; el festivo en viernes, en pruebas/estadodia-festivo-viernes.mjs)
const full = velas('2024-12-30', '2025-01-04')
ver('control: el miercoles 1-ene-2025 tiene 1.440 velas', full.filter(v => v.time >= S('2025-01-01') && v.time < S('2025-01-02')).length === 1440)
const qFull = P.planificaPar({ par: 'EURUSD', velas: full, texto: '', anterior: null, diasAceptados: new Map() })
oraculo('FES', 'un festivo que NO es corto (dia entero de datos) no necesita linea', qFull.manifiesto?.dias.some(d => d.dia === '2025-01-01') && !qFull.manifiesto.cortos_aceptados.some(c => c.dia === '2025-01-01'), P.resumen?.(qFull))
// fin de semana: el viernes 6 se publica cuando el domingo 8 esta completo (el sabado no lleva trozo)
const finde = velas('2026-03-01', '2026-03-10')
const p8 = plan({ velas: finde })
oraculo('PUB', 'el sabado 7 no lleva trozo; el viernes 6 y el domingo 8 si; el lunes 9 se retiene (sin vela siguiente)', p8.manifiesto?.dias.map(d => d.dia).join() === '2026-03-01,2026-03-02,2026-03-03,2026-03-04,2026-03-05,2026-03-06,2026-03-08' && p8.retenido?.dia === '2026-03-09', P.resumen?.(p8))
const sab = velas('2026-03-01', '2026-03-10', { extra: [{ time: U('2026-03-07T12:00Z'), open: 1.1, high: 1.1, low: 1.1, close: 1.1, volume: 1 }] })
oraculo('PUB', 'una vela un sabado: el viernes, cuya vela siguiente cae en el, se retiene «velas_sin_mercado» (2026-03-07)', plan({ velas: sab }).retenido?.dia === '2026-03-06' && plan({ velas: sab }).retenido.motivo === 'velas_sin_mercado' && /2026-03-07/.test(plan({ velas: sab }).retenido.detalle), P.resumen?.(plan({ velas: sab })))
const rejilla = velas('2026-03-01', '2026-03-06', { px: t => (t === U('2026-03-03T05:00Z') ? 1.100005 : 1.1) })
oraculo('PUB', 'un precio fuera de la rejilla de ticks (1,100005 en EURUSD): «no_codificable»', plan({ velas: rejilla }).retenido?.dia === '2026-03-03' && plan({ velas: rejilla }).retenido.motivo === 'no_codificable')

titulo('4 · continuacion e incidentes')
const v11 = p1.manifiesto
const p9 = plan({ velas: velas('2026-03-01', '2026-03-10'), anterior: v11 })
oraculo('PUB', 'con mas datos: v1.2 con anterior = v1.1, prefijo identico y solo los dias nuevos en «nuevos»', p9.estado === 'publica' && p9.manifiesto?.version === 'v1.2' && p9.manifiesto.anterior === v11.huella && MF.esContinuacion(v11, p9.manifiesto) === null && p9.nuevos.map(t => t.dia).join() === '2026-03-05,2026-03-06,2026-03-08', P.resumen?.(p9))
oraculo('PUB', 'sin datos nuevos publicables: «sin_cambios», sin manifiesto nuevo', plan({ anterior: v11 }).estado === 'sin_cambios' && plan({ anterior: v11 }).manifiesto === null)
const cambiado = velas('2026-03-01', '2026-03-10', { px: t => (t === U('2026-03-03T05:00Z') ? 1.10001 : 1.1) })
const p10 = plan({ velas: cambiado, anterior: v11 })
oraculo('PUB', 'un dia ya publicado cambia en el .json.gz (martes 05:00): INCIDENTE, nada que publicar', p10.estado === 'incidente' && p10.manifiesto === null && /2026-03-03/.test(p10.incidente), p10.incidente)
oraculo('PUB', 'un dia publicado que ya no se puede publicar (le falta media mañana): INCIDENTE', plan({ velas: velas('2026-03-01', '2026-03-10', { faltan: [['2026-03-02T00:00Z', '2026-03-02T09:00Z']] }), anterior: v11 }).estado === 'incidente')
// el ancla: publicado con un fichero; despues se edita la aceptacion publicada
const v3 = p3.manifiesto
const editado = linea(ac({ nota: 'otra nota' }))
const p11 = plan({ velas: conHueco, texto: editado, anterior: v3 })
oraculo('PUB', 'el fichero de aceptaciones ya no empieza por el ancla publicada (aceptacion editada): INCIDENTE', p11.estado === 'incidente' && /aceptaciones/.test(p11.incidente), p11.incidente)
oraculo('PUB', 'con el mismo fichero y una aceptacion nueva al final: no es incidente', plan({ velas: conHueco, texto: t3 + linea(ac({ inicio: '2026-03-04T11:00Z' })), anterior: v3 }).estado !== 'incidente')

titulo('5 · el informe de huecos de varios pares (Q1: revisable, sin datos de alumnos)')
const eu = plan({ velas: conHueco })
const gb = P.planificaPar({ par: 'GBPUSD', velas: velas('2026-03-01', '2026-03-06', { faltan: [['2026-03-03T10:05Z', '2026-03-03T10:30Z']], px: () => 1.3 }), texto: '', anterior: null, diasAceptados: new Map() })
const inf = P.informe([eu, gb], { generado: 'prueba' })
oraculo('INF', 'cada hueco con par, dia, inicio UTC y Nueva York, duracion, estado y vecinos', /EURUSD/.test(inf) && /2026-03-03T10:01Z/.test(inf) && /05:01 Nueva York/.test(inf) && /20 min/.test(inf) && /pendiente/.test(inf) && /1\.3/.test(inf), inf.slice(0, 400))
oraculo('INF', 'los solapes: el hueco de EURUSD nombra a GBPUSD y al reves', (() => { const l = inf.split('\n'); return l.some(x => /2026-03-03T10:01Z/.test(x) && /GBPUSD/.test(x)) && l.some(x => /2026-03-03T10:05Z/.test(x) && /EURUSD/.test(x)) })())
oraculo('INF', 'por par: frontera, dias que se publicarian y el primer retenido con su motivo', /frontera/.test(inf) && /hueco_pendiente/.test(inf))
fin()
