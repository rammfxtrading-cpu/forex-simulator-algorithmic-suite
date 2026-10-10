/**
 * MOTOR · P7-01: HUECOS INTERIORES (Astra pieza 7 sobre 3f7ceb0; CTO 10-oct-2026;
 * especificacion v2.4)
 *
 * Astra: un minuto ausente en GBPUSD dentro de un dia admitido dejaba que
 * EURUSD consumiera ese minuto (TP) y el reto confirmara el horizonte, sin
 * detencion. Decision del CTO (cambia el contrato):
 *   · un minuto ausente dentro de un dia admitido por el manifiesto es un
 *     minuto sin negociacion: el par conserva el cierre anterior (vela plana
 *     implicita) y el minuto se valora. Un hueco de hasta N = 15 minutos
 *     seguidos, igual;
 *   · un hueco interior de MAS de 15 minutos seguidos en cualquier par
 *     necesario (conversores incluidos) es no valorable: detencion exacta antes
 *     del primer minuto del hueco, para todos los pares, en cartera y en reto,
 *     sin TP, sin horizonte y sin eventos;
 *   · salvo que el manifiesto lo declare ACEPTADO (lista explicita y versionada:
 *     inicio, minutos, motivo: festivo, cambio_de_sesion o corte_del_proveedor):
 *     se valora plano y lleva marca visible en el estado y en los eventos;
 *   · un hueco que toca el mercado cerrado (fin de semana, dia cerrado) no es
 *     interior.
 *
 * Fuentes, manifiestos y huellas REALES (binario, manifiesto, fuente) con
 * precios inventados. Martes 3-mar-2026; lunes 2 y miercoles 4 completos.
 */
import { titulo, ver, oraculo, fin, importa } from '../lib.mjs'
const M = await importa('lib/motor/motor.mjs')
const CA = await importa('lib/motor/cartera.mjs')
const RT = await importa('lib/motor/reto.mjs')
const B = await importa('lib/motor/binario.mjs')
const MF = await importa('lib/motor/manifiesto.mjs')
const FU = await importa('lib/motor/fuente.mjs')
const S0 = d => Date.parse(d + 'T00:00:00Z') / 1000
const U = iso => Date.parse(iso) / 1000
const PARES9 = ['AUDCAD', 'AUDUSD', 'EURUSD', 'GBPJPY', 'GBPUSD', 'NZDUSD', 'USDCAD', 'USDCHF', 'USDJPY']
const cero = Object.freeze({ version: 'prueba:0', spread_pips: Object.freeze(Object.fromEntries(PARES9.map(p => [p, 0]))), comision_lote_µ: 0n, swap_µ: 0n })
const enTexto = x => JSON.stringify(x, (k, v) => (typeof v === 'bigint' ? `${v}n` : v))
const µ = txt => BigInt(txt) * 1_000_000n
const lanza = f => { try { f(); return false } catch { return true } }
const corre = f => { try { return f() } catch (e) { return { error: `${e?.name}: ${e?.message}` } } }
const de = (ev, tipo) => (ev || []).filter(x => x.tipo === tipo)
const tx = (par, t) => M.precioTexto(par, t)

// un trozo diario: precio(minuto) → texto, o null si ese minuto falta
function trozo(par, d, precio) {
  const filas = []
  for (let i = 0; i < 1440; i++) { const p = precio(i); if (p != null) filas.push({ time: S0(d) + 60 * i, open: p, high: p, low: p, close: p }) }
  return { dia: d, buffer: B.codifica(par, S0(d), M.velas(par, filas).map(v => ({ ...v, volume: 1 }))) }
}
const plano = p => () => p
const sinMin = (p, desde, n) => i => (i >= desde && i < desde + n ? null : p)   // n minutos ausentes desde el minuto «desde»
function fuentes(def, huecosAceptados = {}) {   // def: { PAR: [trozos] }
  const out = {}, mercado = {}
  for (const [par, ts] of Object.entries(def)) {
    const m = MF.creaManifiesto({ par, version: 'v1', trozos: ts, ...(huecosAceptados[par] ? { huecosAceptados: huecosAceptados[par] } : {}) })
    out[par] = FU.creaFuente({ manifiesto: m, fijado: MF.fija(m), leeTrozo: d => ts.find(t => t.dia === d)?.buffer ?? null })
    mercado[par] = MF.fija(m)
  }
  return { fuentes: out, mercado }
}
const L = '2026-03-02', MA = '2026-03-03', X = '2026-03-04'
const EU = (martes = plano('1.10000')) => [trozo('EURUSD', L, plano('1.10000')), trozo('EURUSD', MA, martes), trozo('EURUSD', X, plano('1.11000'))]
const GB = (martes = plano('1.30000')) => [trozo('GBPUSD', L, plano('1.30000')), trozo('GBPUSD', MA, martes), trozo('GBPUSD', X, plano('1.30000'))]
const sube = i => (i <= 600 ? '1.10000' : '1.11000')               // EURUSD: 1,10000 hasta las 10:00 y 1,11000 desde las 10:01
const T1000 = U(`${MA}T10:00:00Z`), T1001 = T1000 + 60

// cartera con EURUSD BUY 1 (TP 1,11000) y GBPUSD BUY 1 a las 10:00 del martes
function abreAmbos({ fuentes, mercado }, limites = []) {
  let e = CA.crea({ pares: ['EURUSD', 'GBPUSD'], costes: cero, capital: '100000', mercado, limites })
  e = CA.avanza(e, T1000, fuentes, { desde: S0(L) }).estado
  e = CA.aplica(e, { tipo: 'abrir', par: 'EURUSD', lado: 'BUY', orden: 'mercado', lotes: '1', tp: '1.11000', cotizadoEn: e.reloj.cursor }).estado
  e = CA.aplica(e, { tipo: 'abrir', par: 'GBPUSD', lado: 'BUY', orden: 'mercado', lotes: '1', cotizadoEn: e.reloj.cursor }).estado
  return e
}
// el reto sobre la cartera, con las mismas posiciones
function retoAmbos({ fuentes, mercado }) {
  let r = RT.creaReto({ motor: CA.crea({ pares: ['EURUSD', 'GBPUSD'], costes: cero, capital: '100000', mercado }), inicio: S0(L) })
  r = RT.avanzaReto(r, T1000, fuentes).reto
  r = RT.aplicaReto(r, { tipo: 'abrir', par: 'EURUSD', lado: 'BUY', orden: 'mercado', lotes: '1', tp: '1.11000', cotizadoEn: r.motor.reloj.cursor }).reto
  r = RT.aplicaReto(r, { tipo: 'abrir', par: 'GBPUSD', lado: 'BUY', orden: 'mercado', lotes: '1', cotizadoEn: r.motor.reloj.cursor }).reto
  return r
}

titulo('1 · la prueba de Astra (GBPUSD sin las 10:01): un minuto plano que se valora')
const a = corre(() => {
  const f = fuentes({ EURUSD: EU(sube), GBPUSD: GB(sinMin('1.30000', 601, 1)) })
  const e = abreAmbos(f)
  const r = CA.avanza(e, T1001, f.fuentes)
  const rr = RT.avanzaReto(retoAmbos(f), T1001, f.fuentes)
  return { r, rr }
})
oraculo('P7-01', 'cartera: sin detencion; EURUSD hace TP a las 10:01 (+1.000) y GBPUSD se valora con su cierre de las 10:00 (vela plana implicita)', !!a.r && a.r.detencion === null && a.r.estado.reloj.cursor === T1001 && a.r.estado.saldo_µ === µ('101000') && tx('GBPUSD', a.r.estado.cotizaciones.GBPUSD.bid) === '1.30000' && de(a.r.eventos, 'cierre')[0]?.motivo === 'TP', a.error ?? enTexto([a.r?.detencion, a.r?.estado?.saldo_µ, de(a.r?.eventos, 'cierre')]))
oraculo('P7-01', 'reto: sin detencion y horizonte 10:01', !!a.rr && a.rr.detencion === null && a.rr.reto.horizonte === T1001, a.error ?? enTexto([a.rr?.detencion, a.rr?.reto?.horizonte]))
const q = corre(() => {
  const f = fuentes({ EURUSD: EU(sube), GBPUSD: GB(sinMin('1.30000', 601, 15)) })
  return CA.avanza(abreAmbos(f), T1000 + 30 * 60, f.fuentes)
})
oraculo('P7-01', 'frontera N = 15: un hueco de 15 minutos seguidos tambien se valora plano (sin detencion; TP a las 10:01)', !!q && q.detencion === null && q.estado.saldo_µ === µ('101000'), q.error ?? enTexto([q?.detencion, q?.estado?.saldo_µ]))

titulo('2 · un hueco de 16 minutos en GBPUSD: detencion exacta para todos')
const f16 = () => fuentes({ EURUSD: EU(sube), GBPUSD: GB(sinMin('1.30000', 601, 16)) })
const b = corre(() => {
  const f = f16()
  const e = abreAmbos(f)
  const antes = CA.serializa(e)
  const r = CA.avanza(e, T1000 + 30 * 60, f.fuentes)
  const otra = CA.avanza(r.estado, T1000 + 30 * 60, f.fuentes)
  return { r, otra, antes }
})
oraculo('P7-01', 'cartera: detencion no_valorable de GBPUSD con frontera 10:01; cursor 10:00, sin TP ni eventos, y EURUSD sigue a 1,10000', b.r?.detencion?.motivo === 'no_valorable' && b.r.detencion.par === 'GBPUSD' && b.r.detencion.frontera === T1001 && b.r.estado.reloj.cursor === T1000 && b.r.eventos.length === 0 && b.r.estado.saldo_µ === µ('100000') && tx('EURUSD', b.r.estado.cotizaciones.EURUSD.bid) === '1.10000', b.error ?? enTexto([b.r?.detencion, b.r?.estado?.reloj, b.r?.eventos]))
oraculo('P7-01', 'el estado no cambia (posiciones vivas en los dos pares intactas) y repetir da la misma detencion', !!b.r && CA.serializa(b.r.estado) === b.antes && b.r.estado.posiciones.length === 2 && b.otra.detencion?.frontera === T1001 && CA.serializa(b.otra.estado) === b.antes, b.error ?? '')
const c = corre(() => {
  const f = f16()
  const r0 = retoAmbos(f)
  const r = RT.avanzaReto(r0, T1000 + 30 * 60, f.fuentes)
  return { r, h0: r0.horizonte, s0: RT.serializaReto(r0) }
})
// el horizonte confirma hasta el ultimo segundo antes de la frontera (10:00:59): sin vela en ese tramo, y es lo que
// confirma tambien un avance a mitad de minuto; el hueco (10:01) nunca queda confirmado
oraculo('P7-01', 'reto: la misma detencion, sin eventos, el motor sin cambios y el horizonte sin llegar al hueco (10:00:59 < 10:01)', c.r?.detencion?.frontera === T1001 && c.r.eventos.length === 0 && c.r.reto.horizonte === T1001 - 1 && CA.serializa(c.r.reto.motor) === CA.serializa(RT.deserializaReto(c.s0).motor), c.error ?? enTexto([c.r?.detencion, c.r?.reto?.horizonte, c.h0]))
const d = corre(() => {
  // paso a paso cada 30 s (con cortes a mitad de minuto), serializando y reanudando en cada corte, frente al salto
  const f = f16()
  let e = abreAmbos(f), ultima = null
  const salto = CA.avanza(e, T1000 + 30 * 60, f.fuentes)
  for (let t = T1000 + 30; t <= T1000 + 30 * 60; t += 30) { const r = CA.avanza(CA.deserializa(CA.serializa(e)), t, f.fuentes); e = r.estado; ultima = r.detencion }
  let r2 = RT.deserializaReto(RT.serializaReto(retoAmbos(f)))
  let ultimaR = null
  for (let t = T1000 + 30; t <= T1000 + 30 * 60; t += 30) { const x = RT.avanzaReto(RT.deserializaReto(RT.serializaReto(r2)), t, f.fuentes); r2 = x.reto; ultimaR = x.detencion }
  const saltoR = RT.avanzaReto(retoAmbos(f), T1000 + 30 * 60, f.fuentes)
  const pa = RT.serializaReto(r2), sa = RT.serializaReto(saltoR.reto)
  const k = [...pa].findIndex((ch, i) => ch !== sa[i])
  return { igual: CA.serializa(e) === CA.serializa(salto.estado), ultima, igualR: pa === sa, ultimaR, ...(pa !== sa ? { difiere: [pa.slice(Math.max(0, k - 120), k + 80), sa.slice(Math.max(0, k - 120), k + 80)] } : {}) }
})
oraculo('P7-01', 'paso, salto y reanudacion: cada 30 s serializando = de un salto, en cartera y en reto, con la misma detencion final', d.igual === true && d.igualR === true && d.ultima?.frontera === T1001 && d.ultimaR?.frontera === T1001, d.error ?? enTexto(d))

titulo('3 · un conversor necesario tambien detiene')
const e3 = corre(() => {
  const P = { AUDCAD: '0.90000', AUDUSD: '0.65000', USDCAD: '1.37000' }
  const def = Object.fromEntries(Object.entries(P).map(([par, p]) => [par, [trozo(par, L, plano(p)), trozo(par, MA, par === 'USDCAD' ? sinMin(p, 601, 20) : plano(p)), trozo(par, X, plano(p))]]))
  const { fuentes: fs, mercado } = fuentes(def)
  let e = CA.crea({ pares: Object.keys(P), costes: cero, capital: '100000', mercado })
  e = CA.avanza(e, T1000, fs, { desde: S0(L) }).estado
  e = CA.aplica(e, { tipo: 'abrir', par: 'AUDCAD', lado: 'BUY', orden: 'mercado', lotes: '1', cotizadoEn: e.reloj.cursor }).estado
  return CA.avanza(e, T1000 + 30 * 60, fs)
})
oraculo('P7-01', 'AUDCAD con posicion y USDCAD (su conversor) sin 20 minutos: detencion de USDCAD con frontera 10:01', e3?.detencion?.par === 'USDCAD' && e3.detencion.frontera === T1001 && e3.estado.reloj.cursor === T1000, e3?.error ?? enTexto(e3?.detencion))

titulo('4 · un hueco que el manifiesto declara aceptado: plano y con marca')
const acept = [{ inicio: `${MA}T10:01Z`, minutos: 16, motivo: 'corte_del_proveedor' }]
const g = corre(() => {
  const f = fuentes({ EURUSD: EU(sube), GBPUSD: GB(sinMin('1.30000', 601, 16)) }, { GBPUSD: acept })
  const e = abreAmbos(f)
  const r = CA.avanza(e, T1000 + 30 * 60, f.fuentes)
  const otra = CA.avanza(CA.deserializa(CA.serializa(r.estado)), T1000 + 40 * 60, f.fuentes)
  const rr = RT.avanzaReto(retoAmbos(f), T1000 + 30 * 60, f.fuentes)
  return { r, otra, rr }
})
oraculo('P7-01', 'aceptado: sin detencion, TP a las 10:01 y GBPUSD plano', g.r?.detencion === null && g.r.estado.saldo_µ === µ('101000') && tx('GBPUSD', g.r.estado.cotizaciones.GBPUSD.bid) === '1.30000', g.error ?? enTexto([g.r?.detencion, g.r?.estado?.saldo_µ]))
oraculo('P7-01', 'marca en el estado (par, inicio, minutos, motivo) y un evento hueco_aceptado; tras serializar y avanzar mas, ni se pierde ni se repite', enTexto(g.r?.estado?.huecos_aceptados) === enTexto([{ inicio: `${MA}T10:01Z`, minutos: 16, motivo: 'corte_del_proveedor', par: 'GBPUSD' }]) && de(g.r.eventos, 'hueco_aceptado').length === 1 && de(g.r.eventos, 'hueco_aceptado')[0].par === 'GBPUSD' && de(g.otra.eventos, 'hueco_aceptado').length === 0 && enTexto(g.otra.estado.huecos_aceptados) === enTexto(g.r.estado.huecos_aceptados), g.error ?? enTexto([g.r?.estado?.huecos_aceptados, de(g.r?.eventos, 'hueco_aceptado'), g.otra?.estado?.huecos_aceptados]))
oraculo('P7-01', 'en el reto tambien: sin detencion, horizonte en el destino y la marca en el estado del motor', g.rr?.detencion === null && g.rr.reto.horizonte === T1000 + 30 * 60 && g.rr.reto.motor.huecos_aceptados?.length === 1 && de(g.rr.eventos, 'hueco_aceptado').length === 1, g.error ?? enTexto([g.rr?.detencion, g.rr?.reto?.motor?.huecos_aceptados]))

titulo('5 · la lista del manifiesto: explicita, validada y versionada')
const ts16 = GB(sinMin('1.30000', 601, 16))
oraculo('P7-01', 'un hueco aceptado que no existe en los trozos (inicio o minutos distintos): el manifiesto no se crea', lanza(() => MF.creaManifiesto({ par: 'GBPUSD', version: 'v1', trozos: ts16, huecosAceptados: [{ inicio: `${MA}T10:02Z`, minutos: 16, motivo: 'festivo' }] })) && lanza(() => MF.creaManifiesto({ par: 'GBPUSD', version: 'v1', trozos: ts16, huecosAceptados: [{ inicio: `${MA}T10:01Z`, minutos: 17, motivo: 'festivo' }] })))
oraculo('P7-01', 'motivo fuera de la lista (festivo, cambio_de_sesion, corte_del_proveedor) o de 15 minutos o menos: no se crea', lanza(() => MF.creaManifiesto({ par: 'GBPUSD', version: 'v1', trozos: ts16, huecosAceptados: [{ inicio: `${MA}T10:01Z`, minutos: 16, motivo: 'porque si' }] })) && lanza(() => MF.creaManifiesto({ par: 'GBPUSD', version: 'v1', trozos: GB(sinMin('1.30000', 601, 10)), huecosAceptados: [{ inicio: `${MA}T10:01Z`, minutos: 10, motivo: 'festivo' }] })))
const m0 = corre(() => MF.creaManifiesto({ par: 'GBPUSD', version: 'v1', trozos: ts16 })), m1 = corre(() => MF.creaManifiesto({ par: 'GBPUSD', version: 'v1', trozos: ts16, huecosAceptados: acept })), mv = corre(() => MF.creaManifiesto({ par: 'GBPUSD', version: 'v1', trozos: ts16, huecosAceptados: [] }))
oraculo('P7-01', 'la lista entra en la huella (otra lista, otra version fijada); vacia, la huella es la de siempre', !!m0?.huella && !!m1?.huella && m0.huella !== m1.huella && mv.huella === m0.huella && enTexto(m1.huecos_aceptados) === enTexto(acept) && !lanza(() => MF.validaManifiesto(m1)), enTexto([m0?.huella?.slice(0, 8), m1?.huella?.slice(0, 8), mv?.huella?.slice(0, 8), m1?.error]))

titulo('6 · motor de un par, medianoche y fin de semana')
const h = corre(() => {
  const ts = EU(sinMin('1.10000', 601, 16))
  const m = MF.creaManifiesto({ par: 'EURUSD', version: 'v1', trozos: ts })
  const fu = FU.creaFuente({ manifiesto: m, fijado: MF.fija(m), leeTrozo: dd => ts.find(t => t.dia === dd)?.buffer ?? null })
  let e = M.crea({ par: 'EURUSD', costes: cero, capital: '100000', mercado: MF.fija(m) })
  e = FU.avanza(e, T1000, fu, { desde: S0(L) }).estado
  return FU.avanza(e, T1000 + 30 * 60, fu)
})
oraculo('P7-01', 'un par (fuente.avanza): hueco de 16 min → detencion con frontera 10:01 y cursor 10:00', h?.detencion?.frontera === T1001 && h.estado.reloj.cursor === T1000, h?.error ?? enTexto([h?.detencion, h?.estado?.reloj]))
const n = corre(() => {
  // EURUSD: el lunes acaba a las 23:50 y el martes empieza a las 00:10 (19 minutos ausentes con el mercado abierto)
  const ts = [trozo('EURUSD', L, i => (i <= 23 * 60 + 50 ? '1.10000' : null)), trozo('EURUSD', MA, i => (i >= 10 ? '1.10000' : null)), trozo('EURUSD', X, plano('1.10000'))]
  const m = MF.creaManifiesto({ par: 'EURUSD', version: 'v1', trozos: ts })
  const fu = FU.creaFuente({ manifiesto: m, fijado: MF.fija(m), leeTrozo: dd => ts.find(t => t.dia === dd)?.buffer ?? null })
  return fu.tramo(U(`${L}T23:00:00Z`), U(`${MA}T01:00:00Z`))
})
oraculo('P7-01', 'el hueco que cruza la medianoche (lunes 23:51 → martes 00:09) es interior: detencion con frontera el lunes 23:51', n?.detencion?.frontera === U(`${L}T23:51:00Z`) && n.velas.every(v => v.time < U(`${L}T23:51:00Z`)), n?.error ?? enTexto(n?.detencion))
const w = corre(() => {
  // viernes 6 hasta las 20:59 y domingo 8 desde las 21:05: el cierre de fin de semana no es un hueco interior
  const ts = [trozo('EURUSD', '2026-03-06', i => (i < 21 * 60 ? '1.10000' : null)), trozo('EURUSD', '2026-03-08', i => (i >= 21 * 60 + 5 ? '1.10000' : null)), trozo('EURUSD', '2026-03-09', plano('1.10000'))]
  const m = MF.creaManifiesto({ par: 'EURUSD', version: 'v1', trozos: ts })
  const fu = FU.creaFuente({ manifiesto: m, fijado: MF.fija(m), leeTrozo: dd => ts.find(t => t.dia === dd)?.buffer ?? null })
  return fu.tramo(U('2026-03-06T20:00:00Z'), U('2026-03-09T01:00:00Z'))
})
ver('control: el tramo del fin de semana trae velas del viernes y del domingo', !!w?.velas && w.velas.some(v => v.time < U('2026-03-07T00:00:00Z')) && w.velas.some(v => v.time > U('2026-03-08T21:00:00Z')), w?.error ?? '')
oraculo('P7-01', 'el fin de semana (viernes 20:59 → domingo 21:05) no detiene', w?.detencion === null, w?.error ?? enTexto(w?.detencion))
fin()
