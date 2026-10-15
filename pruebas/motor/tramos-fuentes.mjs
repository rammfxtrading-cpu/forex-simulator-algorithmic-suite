/**
 * LOS TRAMOS CON FUENTES REALES (E3-02, Astra 15-oct; decision del CTO del 15-oct; diseño q.16).
 * Escrito ANTES que el codigo (contra 79f39a2: en rojo).
 *
 * La marca de un hueco aceptado (hueco_aceptado) se integra EN SU INSTANTE dentro de la secuencia
 * de eventos, con un desempate estable frente a los eventos economicos del mismo instante (q.16:
 * a igual instante, la marca va ANTES; entre marcas, por par). Hasta 79f39a2 la marca se ponia
 * delante de todos los eventos del avance: de un tiron salia [hueco@10:21, cierre@10:01] y en
 * tramos [cierre@10:01, hueco@10:21].
 *
 * Todo con binarios, manifiestos y fuentes REALES (lib/motor/binario, manifiesto, fuente) y, en el
 * servidor, con el almacen y calcula() de lib/servidor/comando.mjs. Velas inventadas.
 *
 *   1 · el caso de Astra (EURUSD hace TP a las 10:01; GBPUSD sin 16 minutos desde las 10:21,
 *       aceptados): motor de un par, reto de un par, cartera, reto sobre la cartera y calcula()
 *       (cartera y reto), de un tiron y en tramos; el orden por instante; el desempate (marca y
 *       TP en el mismo minuto);
 *   2 · la propiedad de q.15 extendida a fuentes reales: N escenarios con semilla fija, en GRUPOS
 *       obligatorios (base, fase superada, hueco aceptado, falta de trozo, fin de datos y cambio
 *       de hora), con contadores minimos: si un grupo no ejercita lo suyo, control roto. Motor y
 *       servidor (calcula), estado final, eventos y trades byte a byte. Mutantes, incluido el de
 *       79f39a2 (la marca al principio).
 */
import { titulo, oraculo, ver, fin, importa } from '../lib.mjs'
const M = await importa('lib/motor/motor.mjs')
const CA = await importa('lib/motor/cartera.mjs')
const RT = await importa('lib/motor/reto.mjs')
const B = await importa('lib/motor/binario.mjs')
const MF = await importa('lib/motor/manifiesto.mjs')
const FU = await importa('lib/motor/fuente.mjs')
const { COSTES_1 } = await importa('lib/motor/costes.mjs')
const { minutoCerrado } = await importa('lib/mercado/calidad.mjs')
const PV = await importa('lib/mercado/publica-v1.mjs')
const CO = await importa('lib/servidor/comando.mjs')
const ME = await importa('lib/servidor/mercado.mjs')
const S0 = d => Date.parse(d + 'T00:00:00Z') / 1000
const U = iso => Date.parse(iso) / 1000
const ymd = s => new Date(s * 1000).toISOString().slice(0, 10)
const hhmmZ = s => new Date(s * 1000).toISOString().slice(0, 16) + 'Z'
const tx = x => CA.serializa(x)
const momento = en => en?.vela ?? en?.t
const PARES9 = ['AUDCAD', 'AUDUSD', 'EURUSD', 'GBPJPY', 'GBPUSD', 'NZDUSD', 'USDCAD', 'USDCHF', 'USDJPY']
const cero = Object.freeze({ version: 'prueba:0', spread_pips: Object.freeze(Object.fromEntries(PARES9.map(p => [p, 0]))), comision_lote_µ: 0n, swap_µ: 0n })
const de = (ev, tipo) => (ev || []).filter(x => x.tipo === tipo)
const resumen = ev => ev.map(x => `${x.tipo}@${hhmmZ(momento(x.en) ?? x.t_mercado).slice(11, 16)}`).join(' ')

// ── el mercado: trozos, manifiestos, fuentes y el almacen del servidor ─────────
// velas: { PAR: [{ time, open, high, low, close }] } (precios en numero o texto); huecos: { PAR: [{ inicio, minutos, motivo }] }
// sinTrozo: Set de 'PAR|dia' que el almacen NO tiene (el manifiesto si); fueraDelManifiesto: Set de dias que no publica nadie
function mercadoDe(velas, { huecos = {}, sinTrozo = new Set(), fueraDelManifiesto = new Set() } = {}) {
  const fuentes = {}, mercado = {}, objetos = new Map()
  for (const [par, vs] of Object.entries(velas)) {
    const porDia = new Map()
    for (const v of vs) { const d = ymd(v.time); if (!porDia.has(d)) porDia.set(d, []); porDia.get(d).push(v) }
    const trozos = [...porDia.entries()].filter(([d]) => !fueraDelManifiesto.has(d)).map(([d, filas]) => ({ dia: d, n: filas.length, buffer: B.codifica(par, S0(d), M.velas(par, filas).map(v => ({ ...v, volume: 1 })), (huecos[par] ?? []).filter(h => h.inicio.slice(0, 10) === d)) }))
    const m = MF.creaManifiesto({ par, version: 'v1.1', trozos, cortosAceptados: trozos.map(t => ({ dia: t.dia, velas: t.n, motivo: 'prueba: dia parcial' })) })
    const lee = d => (sinTrozo.has(`${par}|${d}`) ? null : trozos.find(t => t.dia === d)?.buffer ?? null)
    fuentes[par] = FU.creaFuente({ manifiesto: m, fijado: MF.fija(m), leeTrozo: lee })
    mercado[par] = MF.fija(m)
    objetos.set(PV.rutaManifiesto(m), Buffer.from(JSON.stringify(m)))
    for (const t of trozos) if (!sinTrozo.has(`${par}|${t.dia}`)) objetos.set(PV.rutaTrozo(par, t.dia, m.dias.find(x => x.dia === t.dia).sha256), PV.comprime(t.buffer))
  }
  return { fuentes, mercado, almacen: { lee: async r => (objetos.has(r) ? Buffer.from(objetos.get(r)) : null) } }
}
// el servidor: calcula() de comando.mjs sobre el estado guardado (JSON, como en la base)
const calcula = (estado, hasta, alm, date_from) => CO.calcula({ fila: { estado, date_from }, intencion: { tipo: 'avanzar', carga: { hasta, motivo: 'play' } }, puertos: { almacen: alm, reloj: () => 0, cache: ME.creaCache() } })
const sinOrdinal = xs => xs.map(({ ordinal, ...x }) => x)

titulo('1 · el caso de Astra: TP a las 10:01 y hueco aceptado a las 10:21')
const L = '2026-03-02', MA = '2026-03-03', X = '2026-03-04'
const T1000 = U(`${MA}T10:00:00Z`)
// un dia entero de velas planas a «precio(i)» (i = minuto del dia), sin los minutos en que da null
const dia = (d, precio) => { const o = []; for (let i = 0; i < 1440; i++) { const p = precio(i); if (p != null) o.push({ time: S0(d) + 60 * i, open: p, high: p, low: p, close: p }) } return o }
const plano = p => () => p
const sinMin = (p, desde, n) => i => (i >= desde && i < desde + n ? null : p)
const sube = i => (i <= 600 ? '1.10000' : '1.11000')                         // EURUSD a 1,11000 desde las 10:01
const EU = (martes = plano('1.10000')) => [...dia(L, plano('1.10000')), ...dia(MA, martes), ...dia(X, plano('1.11000'))]
const GB = (martes = plano('1.30000')) => [...dia(L, plano('1.30000')), ...dia(MA, martes), ...dia(X, plano('1.30000'))]
const mAstra = mercadoDe({ EURUSD: EU(sube), GBPUSD: GB(sinMin('1.30000', 621, 16)) }, { huecos: { GBPUSD: [{ inicio: `${MA}T10:21Z`, minutos: 16, motivo: 'corte_del_proveedor' }] } })
// el mismo minuto: GBPUSD sin 16 minutos desde las 10:01, y EURUSD hace TP a las 10:01 (el desempate)
const mMismo = mercadoDe({ EURUSD: EU(sube), GBPUSD: GB(sinMin('1.30000', 601, 16)) }, { huecos: { GBPUSD: [{ inicio: `${MA}T10:01Z`, minutos: 16, motivo: 'corte_del_proveedor' }] } })
// un par solo: EURUSD con TP a las 10:01 y sin 16 minutos desde las 10:21
const sube1 = i => (i >= 621 && i < 637 ? null : sube(i))
const m1 = mercadoDe({ EURUSD: EU(sube1) }, { huecos: { EURUSD: [{ inicio: `${MA}T10:21Z`, minutos: 16, motivo: 'corte_del_proveedor' }] } })

function abreCartera({ fuentes, mercado }, pares) {
  let e = CA.crea({ pares, costes: cero, capital: '100000', mercado })
  e = CA.avanza(e, T1000, fuentes, { desde: S0(L) }).estado
  e = CA.aplica(e, { tipo: 'abrir', par: 'EURUSD', lado: 'BUY', orden: 'mercado', lotes: '1', tp: '1.11000', cotizadoEn: e.reloj.cursor }).estado
  if (pares.includes('GBPUSD')) e = CA.aplica(e, { tipo: 'abrir', par: 'GBPUSD', lado: 'BUY', orden: 'mercado', lotes: '1', cotizadoEn: e.reloj.cursor }).estado
  return e
}
function abreReto({ fuentes, mercado }, pares) {
  let r = RT.creaReto({ motor: CA.crea({ pares, costes: cero, capital: '100000', mercado }), inicio: S0(L) })
  r = RT.avanzaReto(r, T1000, fuentes).reto
  r = RT.aplicaReto(r, { tipo: 'abrir', par: 'EURUSD', lado: 'BUY', orden: 'mercado', lotes: '1', tp: '1.11000', cotizadoEn: r.motor.reloj.cursor }).reto
  if (pares.includes('GBPUSD')) r = RT.aplicaReto(r, { tipo: 'abrir', par: 'GBPUSD', lado: 'BUY', orden: 'mercado', lotes: '1', cotizadoEn: r.motor.reloj.cursor }).reto
  return r
}
function abreUnPar({ fuentes, mercado }) {
  let e = M.crea({ par: 'EURUSD', costes: cero, capital: '100000', mercado: mercado.EURUSD })
  e = FU.avanza(e, T1000, fuentes.EURUSD, { desde: S0(L) }).estado
  return M.aplica(e, { tipo: 'abrir', lado: 'BUY', orden: 'mercado', lotes: '1', tp: '1.11000', cotizadoEn: e.reloj.cursor }, []).estado
}
function abreRetoUnPar({ fuentes, mercado }) {
  let r = RT.creaReto({ motor: M.crea({ par: 'EURUSD', costes: cero, capital: '100000', mercado: mercado.EURUSD }), inicio: S0(L) })
  r = RT.avanzaReto(r, T1000, fuentes.EURUSD).reto
  return RT.aplicaReto(r, { tipo: 'abrir', lado: 'BUY', orden: 'mercado', lotes: '1', tp: '1.11000', cotizadoEn: r.motor.reloj.cursor }).reto
}
// de un tiron hasta «hasta» y en tramos (cortes), serializando entre tramos
function compara(avanza, e0, cortes, hasta) {
  const uno = avanza(e0, hasta)
  let e = e0, ev = []
  for (const h of [...cortes, hasta]) { const x = avanza(e, h); ev.push(...x.eventos); e = CA.deserializa(CA.serializa(x.estado ?? x.reto)) }
  return { uno, ev, e, igual: tx(uno.estado ?? uno.reto) === tx(e) && tx(uno.eventos) === tx(ev) }
}
const H = T1000 + 40 * 60, C = [T1000 + 10 * 60]
const caminos = [
  ['motor de un par (fuente.avanza)', () => compara((e, h) => FU.avanza(e, h, m1.fuentes.EURUSD), abreUnPar(m1), C, H)],
  ['reto de un par', () => compara((e, h) => RT.avanzaReto(e, h, m1.fuentes.EURUSD), abreRetoUnPar(m1), C, H)],
  ['cartera', () => compara((e, h) => CA.avanza(e, h, mAstra.fuentes), abreCartera(mAstra, ['EURUSD', 'GBPUSD']), C, H)],
  ['reto sobre la cartera', () => compara((e, h) => RT.avanzaReto(e, h, mAstra.fuentes), abreReto(mAstra, ['EURUSD', 'GBPUSD']), C, H)],
]
for (const [que, f] of caminos) {
  const r = f()
  ver(`control (${que}): el avance de un tiron trae el cierre por TP de las 10:01 y la marca de las 10:21`, de(r.uno.eventos, 'cierre')[0]?.motivo === 'TP' && momento(de(r.uno.eventos, 'cierre')[0]?.en) === T1000 + 60 && momento(de(r.uno.eventos, 'hueco_aceptado')[0]?.en) === T1000 + 21 * 60, resumen(r.uno.eventos))
  oraculo('E3-02', `${que}: de un tiron = en tramos (10:10, serializado), estado y eventos byte a byte`, r.igual, `uno: ${resumen(r.uno.eventos)} · tramos: ${resumen(r.ev)}`)
  oraculo('E3-02', `${que}: de un tiron, cada evento en su instante (el cierre de las 10:01 antes de la marca de las 10:21)`, resumen(r.uno.eventos) === 'cierre@10:01 hueco_aceptado@10:21', resumen(r.uno.eventos))
}
for (const [que, e0, date_from] of [['calcula, cartera', abreCartera(mAstra, ['EURUSD', 'GBPUSD']), L], ['calcula, reto', abreReto(mAstra, ['EURUSD', 'GBPUSD']), L]]) {
  const j0 = JSON.parse(CA.serializa(e0))
  const uno = await calcula(j0, H, mAstra.almacen, date_from)
  const a = await calcula(j0, C[0], mAstra.almacen, date_from)
  const b = await calcula(a.estado, H, mAstra.almacen, date_from)
  const t = xs => xs.map(x => `${x.tipo}@${hhmmZ(x.t_mercado).slice(11, 16)}`).join(' ')
  oraculo('E3-02', `${que} (almacen y fuentes reales): de un tiron = en tramos, estado, eventos y trades (sin el ordinal, que es por comando)`, JSON.stringify(uno.estado) === JSON.stringify(b.estado) && JSON.stringify(sinOrdinal(uno.eventos)) === JSON.stringify(sinOrdinal([...a.eventos, ...b.eventos])) && JSON.stringify(sinOrdinal(uno.trades)) === JSON.stringify(sinOrdinal([...a.trades, ...b.trades])), `uno: ${t(uno.eventos)} · tramos: ${t([...a.eventos, ...b.eventos])}`)
  oraculo('E3-02', `${que}: el trade del TP enlaza con su evento cierre (el ordinal del cierre en la secuencia del comando)`, uno.trades.length === 1 && uno.eventos[uno.trades[0].ordinal]?.tipo === 'cierre' && t(uno.eventos) === 'cierre@10:01 hueco_aceptado@10:21', `${t(uno.eventos)} · ordinal ${uno.trades[0]?.ordinal}`)
}
// el desempate: marca y TP en el MISMO minuto (10:01). q.16: la marca va antes que los eventos economicos de su instante
for (const [que, avanza, e0] of [['cartera', (e, h) => CA.avanza(e, h, mMismo.fuentes), abreCartera(mMismo, ['EURUSD', 'GBPUSD'])], ['reto', (e, h) => RT.avanzaReto(e, h, mMismo.fuentes), abreReto(mMismo, ['EURUSD', 'GBPUSD'])]]) {
  const r1 = compara(avanza, e0, [T1000 + 30, T1000 + 60], H)
  const r2 = compara(avanza, e0, [T1000 + 90], H)
  oraculo('E3-02', `desempate (${que}): marca y TP en el mismo minuto → la marca antes; igual de un tiron y con cortes a las 10:00:30 y 10:01 o 10:01:30`, resumen(r1.uno.eventos) === 'hueco_aceptado@10:01 cierre@10:01' && r1.igual && r2.igual, `uno: ${resumen(r1.uno.eventos)} · tramos: ${resumen(r1.ev)} · ${resumen(r2.ev)}`)
}

// ── 2 · la propiedad con fuentes reales ─────────────────────────────────────────
const SEMILLA = 20261015
const N = 180
let s = SEMILLA
const azar = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648 }
const elige = xs => xs[Math.floor(azar() * xs.length)]
const entero = (a, b) => a + Math.floor(azar() * (b - a + 1))
const PARES = ['AUDCAD', 'AUDUSD', 'EURUSD', 'GBPJPY', 'GBPUSD', 'NZDUSD', 'USDCAD', 'USDCHF', 'USDJPY']
const BASE = { AUDCAD: 0.9, AUDUSD: 0.65, EURUSD: 1.1, GBPJPY: 190.5, GBPUSD: 1.3, NZDUSD: 0.6, USDCAD: 1.37, USDCHF: 0.88, USDJPY: 150.2 }
const DIG = p => (/JPY/.test(p) ? 3 : 5)
const TIPOS = [['FTMO', 1], ['FTMO', 2], ['1F', 1], ['3F', 1], ['3F', 2], ['3F', 3], ['practica', 0]]
const REGLAS = { FTMO: RT.FTMO_2STEP, '1F': RT.SUITE_1F, '3F': RT.SUITE_3F }
const GRUPOS = ['base', 'fase', 'hueco', 'trozo', 'fin', 'hora']
// las dos ventanas: marzo (martes 22:00 UTC, cruza la medianoche de Praga a las 23:00 y el dia UTC)
// y el cambio de hora (viernes 27-mar 19:30 UTC → domingo 29-mar 22:45 UTC: el cierre del fin de
// semana y la medianoche de Praga del lunes 30 ya en CEST, a las 22:00 UTC)
const VENTANAS = {
  marzo: { T0: U('2026-03-03T22:00:00Z'), FIN: U('2026-03-04T00:30:00Z'), datos: U('2026-03-04T01:30:00Z') },
  hora: { T0: U('2026-03-27T19:30:00Z'), FIN: U('2026-03-29T22:45:00Z'), datos: U('2026-03-29T23:30:00Z') },
}
for (const v of Object.values(VENTANAS)) { v.minutos = []; for (let t = v.T0; t <= v.datos; t += 60) if (!minutoCerrado(t)) v.minutos.push(t) }
const MEDIANOCHE_CEST = U('2026-03-29T22:00:00Z')
ver('control: la medianoche de Praga del lunes 30-mar es a las 22:00 UTC (CEST) y la del domingo 29, a las 23:00 UTC del sabado (CET)', RT.medianocheSiguiente(U('2026-03-29T12:00:00Z')) === MEDIANOCHE_CEST && RT.medianocheAnterior(U('2026-03-29T12:00:00Z')) === U('2026-03-28T23:00:00Z'))
ver('control: la ventana del cambio de hora tiene mercado el viernes hasta las 21:00 UTC y el domingo desde las 21:00 UTC', VENTANAS.hora.minutos.includes(U('2026-03-27T20:59:00Z')) && !VENTANAS.hora.minutos.includes(U('2026-03-27T21:00:00Z')) && VENTANAS.hora.minutos.includes(U('2026-03-29T21:00:00Z')))
const medianochesEn = (a, b) => { const o = []; for (let m = RT.medianocheSiguiente(a); m < b; m = RT.medianocheSiguiente(m)) o.push(m); return o }

function escenario(k) {
  const grupo = GRUPOS[k % GRUPOS.length]
  const v = grupo === 'hora' ? VENTANAS.hora : VENTANAS.marzo
  let pares = new Set(grupo === 'fase' ? ['EURUSD', ...(azar() < 0.5 ? [elige(PARES)] : [])] : Array.from({ length: 1 + Math.floor(azar() * 4) }, () => elige(PARES)))
  for (const p of [...pares]) { if (p === 'AUDCAD') { pares.add('USDCAD'); pares.add('AUDUSD') } if (p === 'GBPJPY') { pares.add('USDJPY'); pares.add('GBPUSD') } }
  pares = [...pares].sort()
  // fin de datos: todos los pares acaban en el mismo minuto, antes de FIN
  const ultimo = grupo === 'fin' ? v.T0 + 60 * entero(60, 130) : v.datos
  const minutos = v.minutos.filter(t => t <= ultimo)
  // el hueco aceptado: 16 a 40 minutos de un par, con la vela de antes y la de despues
  const huecos = {}, quita = {}
  if (grupo === 'hueco') {
    for (const par of azar() < 0.3 && pares.length > 1 ? [pares[0], pares.at(-1)] : [elige(pares)]) {
      const i = entero(15, 100), n = entero(16, 40)
      quita[par] = { i, n }
      huecos[par] = [{ inicio: hhmmZ(minutos[i]), minutos: n, motivo: 'corte_del_proveedor' }]
    }
  }
  const velas = {}
  const fase = grupo === 'fase'
  for (const p of pares) {
    const t = 10 ** -DIG(p), r = x => Number(x.toFixed(DIG(p))); let x = BASE[p]; const vs = []
    const deriva = fase && p === 'EURUSD' ? 5 : 0, ruido = fase && p === 'EURUSD' ? 20 : 50
    minutos.forEach((tm, i) => {
      const q = quita[p]
      if (q && i >= q.i && i < q.i + q.n) return
      const borde = q && (i === q.i - 1 || i === q.i + q.n)
      if (i > 0 && !borde && azar() < 0.03) return
      const a = azar() < 0.05 ? r(x + (azar() - 0.5) * 60 * t) : x
      const c = r(a + (deriva + (azar() - 0.5) * ruido) * t), h = r(Math.max(a, c) + azar() * 20 * t), l = r(Math.min(a, c) - azar() * 20 * t)
      vs.push({ time: tm, open: r(a), high: h, low: l, close: c }); x = c
    })
    velas[p] = vs
  }
  // la falta de trozo: el del 4-mar no esta en el almacen (trozo_no_disponible) o no esta en el
  // manifiesto, con el 5-mar publicado detras (sin trozo)
  const sinTrozo = new Set(), fuera = new Set()
  let variante = null
  if (grupo === 'trozo') {
    variante = k % 4 < 2 ? 'almacen' : 'manifiesto'
    if (variante === 'almacen') sinTrozo.add(`${elige(pares)}|2026-03-04`)
    else {
      fuera.add('2026-03-04')
      for (const p of pares) for (let i = 0; i < 10; i++) { const c = velas[p].at(-1).close; velas[p].push({ time: U('2026-03-05T00:00:00Z') + 60 * i, open: c, high: c, low: c, close: c }) }
    }
  }
  const [tipo, fase0] = fase ? elige([['3F', 1], ['3F', 2], ['3F', 3], ['1F', 1]]) : elige(TIPOS)
  const ordenes = []
  if (fase) ordenes.push({ tipo: 'abrir', par: 'EURUSD', lado: 'BUY', orden: 'mercado', lotes: tipo === '1F' ? '60' : '40', tp: (BASE.EURUSD + (tipo === '1F' ? 300 : 200) * 1e-5).toFixed(5) })
  else for (let j = 0; j < 2 + Math.floor(azar() * 4); j++) {
    const par = elige(pares), lado = elige(['BUY', 'SELL']), t = 10 ** -DIG(par), sg = lado === 'BUY' ? 1 : -1
    const px = d => (BASE[par] + d * t).toFixed(DIG(par))
    if (azar() < 0.7) ordenes.push({ tipo: 'abrir', par, lado, orden: 'mercado', lotes: elige(['1', '5', '20', '40']), ...(azar() < 0.7 ? { sl: px(-sg * (20 + Math.floor(azar() * 150))) } : {}), ...(azar() < 0.7 ? { tp: px(sg * (20 + Math.floor(azar() * 150))) } : {}) })
    else ordenes.push({ tipo: 'abrir', par, lado, orden: elige(['limit', 'stop']), lotes: elige(['1', '10']), precio: px((elige(['limit', 'stop']) === 'limit' ? -sg : sg) * (5 + Math.floor(azar() * 60))) })
  }
  const span = (v.FIN - v.T0) / 60
  const cortes = Array.from({ length: 2 + Math.floor(azar() * 6) }, () => v.T0 + 60 * (1 + Math.floor(azar() * (span - 1))) + (azar() < 0.3 ? 30 : 0))
  return { k, grupo, variante, v, pares, velas, huecos, sinTrozo, fuera, tipo, fase: fase0, ordenes, cortes, mercado: mercadoDe(velas, { huecos, sinTrozo, fueraDelManifiesto: fuera }) }
}

// la partida: el reto (o la practica) en T0 con sus ordenes
function partida(esc) {
  const { fuentes, mercado } = esc.mercado, T0 = esc.v.T0
  const cartera = CA.crea({ pares: esc.pares, costes: COSTES_1, capital: '100000', mercado, limites: esc.tipo === 'practica' ? [{ regla: 'p', limite: '97000' }] : [] })
  if (esc.tipo === 'practica') {
    let e = CA.avanza(cartera, T0, fuentes, { desde: S0(ymd(T0)) }).estado
    for (const o of esc.ordenes) e = CA.aplica(e, { ...o, ...(o.orden === 'mercado' ? { cotizadoEn: e.reloj.cursor } : {}) }, {}).estado
    return { practica: true, e }
  }
  let r = RT.creaReto({ motor: cartera, fase: esc.fase, inicio: T0, reglas: REGLAS[esc.tipo] })
  r = RT.avanzaReto(r, T0, fuentes).reto
  for (const o of esc.ordenes) r = RT.aplicaReto(r, { ...o, ...(o.orden === 'mercado' ? { cotizadoEn: r.motor.reloj.cursor } : {}) }).reto
  return { practica: false, e: r }
}
// mutantes: 'pierde' (la fuente pierde el minuto siguiente al cursor de un tramo que no es el
// primero), 'reinicia' (el corte reinicia el ultimo reset del reto), 'marcas' (lo de 79f39a2: las
// marcas de cada avance delante de todos sus eventos)
function conPierde(fuentes) {
  return Object.fromEntries(Object.entries(fuentes).map(([p, f]) => [p, { ...f, tramo: (c, h, o) => { const r = f.tramo(c, h, o); return c == null ? r : { ...r, velas: r.velas.filter(x => x.time !== Math.floor(c / 60) * 60 + 60) } } }]))
}
function avanza(p, e, h, esc, { mutante = null, tramoK = 0 } = {}) {
  const fu = mutante === 'pierde' && tramoK > 0 ? conPierde(esc.mercado.fuentes) : esc.mercado.fuentes
  const x = p ? CA.avanza(e, h, fu, { desde: S0(ymd(esc.v.T0)) }) : RT.avanzaReto(e, h, fu)
  let ev = x.eventos
  if (mutante === 'marcas') ev = [...de(ev, 'hueco_aceptado'), ...ev.filter(y => y.tipo !== 'hueco_aceptado')]
  return { e: p ? x.estado : x.reto, ev, det: x.detencion ?? null }
}
function deUnTiron(esc, mutante = null) { const p = partida(esc); return avanza(p.practica, p.e, esc.v.FIN, esc, { mutante }) }
function enTramos(esc, cortes, mutante = null) {
  const p = partida(esc)
  let e = p.e, ev = [], det = null
  for (const [k, h] of [...cortes, esc.v.FIN].entries()) {
    const x = avanza(p.practica, e, h, esc, { mutante, tramoK: k })
    ev.push(...x.ev); det = x.det
    e = CA.deserializa(CA.serializa(x.e))
    if (mutante === 'reinicia' && !p.practica) e = { ...e, ultimo_reset: RT.medianocheAnterior(esc.v.T0) }
  }
  return { e, ev, det }
}
// el contrato de q.15: estado final y eventos byte a byte. La detencion que devuelve el ultimo avance
// NO entra: un reto ya terminado (breach antes de la frontera) la devuelve de un tiron y no en tramos
// (avanzaReto de un reto terminado sale sin mirar el mercado). Es una pregunta abierta (q.16), no
// una regla de esta prueba: se cuenta y se imprime aparte.
const igual = (a, b) => tx(a.e) === tx(b.e) && tx(a.ev) === tx(b.ev)
// el servidor: calcula() de un tiron y en tramos, cada tramo sobre el estado guardado del anterior
async function servidor(esc, cortes) {
  const p = partida(esc), j0 = JSON.parse(CA.serializa(p.e)), df = ymd(esc.v.T0), alm = esc.mercado.almacen
  const uno = await calcula(j0, esc.v.FIN, alm, df)
  let e = j0
  const ev = [], trades = []
  for (const h of [...cortes, esc.v.FIN]) { const r = await calcula(e, h, alm, df); ev.push(...sinOrdinal(r.eventos)); trades.push(...sinOrdinal(r.trades)); e = r.estado }
  return { uno, igual: JSON.stringify(uno.estado) === JSON.stringify(e) && JSON.stringify(sinOrdinal(uno.eventos)) === JSON.stringify(ev) && JSON.stringify(sinOrdinal(uno.trades)) === JSON.stringify(trades) }
}

titulo(`2 · la propiedad con fuentes reales: ${N} escenarios, semilla ${SEMILLA}`)
const MINIMOS = { breach: 10, sltp: 40, medianoche: 40, fase: 8, hueco: 20, huecoTrasEvento: 5, trozoAlmacen: 6, trozoManifiesto: 6, fin: 15, hora: 15 }
const n = Object.fromEntries(Object.keys(MINIMOS).map(k => [k, 0]))
const escenarios = Array.from({ length: N }, (_, k) => escenario(k))
let iguales = 0, igualesServidor = 0, servidorIgualMotor = 0
const distintos = [], distintosServidor = [], detDistinta = []
const cortesDe = [], unos = []
const ECONOMICOS = new Set(['fill', 'cierre', 'breach', 'reset_diario', 'fase_superada', 'orden_cancelada'])
for (const [k, esc] of escenarios.entries()) {
  const uno = deUnTiron(esc)
  unos[k] = uno
  const en = tipo => uno.ev.filter(x => x.tipo === tipo).map(x => momento(x.en))
  const breach = en('breach'), sltp = uno.ev.filter(x => x.tipo === 'cierre' && (x.motivo === 'SL' || x.motivo === 'TP')).map(x => momento(x.en))
  const marcas = en('hueco_aceptado'), fases = en('fase_superada'), finD = en('fin_de_datos')
  const medias = medianochesEn(esc.v.T0, esc.v.FIN)
  const extra = [...marcas.flatMap(t => [t, t - 30]), ...fases, ...(uno.det ? [uno.det.frontera, uno.det.frontera - 1] : [])]
  const cortes = [...new Set([...esc.cortes, ...medias, ...breach, ...sltp, ...extra].filter(t => Number.isFinite(t) && t > esc.v.T0 && t < esc.v.FIN))].sort((a, b) => a - b)
  cortesDe[k] = cortes
  if (breach.length) n.breach++
  if (sltp.length) n.sltp++
  if (uno.ev.some(x => x.tipo === 'reset_diario' && medias.includes(momento(x.en)))) n.medianoche++
  if (fases.length) n.fase++
  if (marcas.length) n.hueco++
  // el caso de Astra: una marca POSTERIOR a un evento economico del mismo avance
  if (uno.ev.some((x, i) => x.tipo === 'hueco_aceptado' && uno.ev.some(y => ECONOMICOS.has(y.tipo) && momento(y.en) < momento(x.en)))) n.huecoTrasEvento++
  if (uno.det?.motivo === 'trozo_no_disponible') n.trozoAlmacen++
  if (uno.det?.detalle === 'sin trozo') n.trozoManifiesto++
  if (finD.length) n.fin++
  if (uno.ev.some(x => x.tipo === 'reset_diario' && momento(x.en) === MEDIANOCHE_CEST)) n.hora++
  const tr = enTramos(esc, cortes)
  if (tx(uno.det) !== tx(tr.det)) detDistinta.push(`#${k} ${esc.grupo} ${esc.tipo}${esc.fase || ''} ${uno.e.estado ?? ''}`)
  if (igual(uno, tr)) iguales++
  else distintos.push(`#${k} ${esc.grupo} ${esc.tipo}${esc.fase || ''} ${esc.pares.join('+')}`)
  const sv = await servidor(esc, cortes)
  if (sv.igual) igualesServidor++
  else distintosServidor.push(`#${k} ${esc.grupo} ${esc.tipo}${esc.fase || ''} ${esc.pares.join('+')}`)
  if (JSON.stringify(sv.uno.estado) === CA.serializa(uno.e) && JSON.stringify(sv.uno.eventos.map(x => x.tipo)) === JSON.stringify(uno.ev.map(x => x.tipo))) servidorIgualMotor++
}
console.log(`  nota (pregunta abierta, q.16): la detencion del ultimo avance difiere en ${detDistinta.length} escenarios: ${detDistinta.join(' · ')}`)
console.log('  ' + Object.entries(n).map(([k, x]) => `${k} ${x} (min ${MINIMOS[k]})`).join(' · '))
for (const [k, x] of Object.entries(n)) ver(`control: grupo «${k}» ejercitado en ${x} escenarios (minimo ${MINIMOS[k]})`, x >= MINIMOS[k])
oraculo('E3-02', `motor con fuentes: de un tiron = en tramos, estado final y eventos byte a byte, en los ${N}`, iguales === N, `${iguales}/${N} · ${distintos.slice(0, 8).join(' · ')}`)
oraculo('E3-02', `servidor (calcula, almacen real): de un tiron = en tramos, estado, eventos y trades byte a byte, en los ${N}`, igualesServidor === N, `${igualesServidor}/${N} · ${distintosServidor.slice(0, 8).join(' · ')}`)
oraculo('E3-02', `el servidor de un tiron = el motor de un tiron (estado y secuencia de eventos), en los ${N}`, servidorIgualMotor === N, `${servidorIgualMotor}/${N}`)

titulo('los mutantes: la propiedad los caza')
for (const [mut, que] of [['pierde', 'un tramo que pierde el minuto siguiente al corte'], ['reinicia', 'un corte que reinicia el ultimo reset'], ['marcas', 'las marcas delante de todos los eventos del avance (79f39a2)']]) {
  let caza = 0
  for (const [k, esc] of escenarios.entries()) {
    let uno, tr
    try { uno = mut === 'marcas' ? deUnTiron(esc, 'marcas') : unos[k]; tr = enTramos(esc, cortesDe[k], mut) } catch { caza++; continue }
    if (!igual(uno, tr)) caza++
  }
  ver(`mutante «${que}»: la propiedad lo ve (${caza} escenarios distintos)`, caza > 0)
}
fin()
