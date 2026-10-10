/**
 * MOTOR · PIEZA 7, PARTE 4: LA MARCA DE SINCRONIZACION MODELADA, ACUMULADA EN
 * EL ESTADO (especificacion v2.3.1, § 13.4; Astra diseño-4, V4-02).
 *
 * Un minuto en que MAS DE UN par con exposicion se mueve es «modelado»
 * (camino-sincronizado@1). La marca no puede depender de que ese minuto tenga
 * eventos (A45 no tiene ninguno): se guarda en el estado
 *   · por posicion (y por orden pendiente): sincronizacion_modelada: true; su
 *     cierre, cuando sea, lleva sincronizacion: "modelada";
 *   · por sesion: sincronizacion = { politica, minutos, primero, ultimo };
 *     el breach y la fase superada la llevan si minutos > 0;
 * y sobrevive a serializar y reanudar.
 * ORACULOS: A45 sin eventos → minutos = 1 y las dos posiciones marcadas;
 * corte, reanudacion y cierre en un minuto plano posterior → el cierre lleva
 * la marca; igual por paso, salto y reanudacion; una pendiente que existia en
 * el minuto modelado pasa la marca a su posicion; el breach posterior y la
 * fase superada del reto llevan el resumen; control negativo: con un solo par
 * con exposicion moviendose, ninguna marca.
 */
import { titulo, ver, oraculo, fin, importa } from '../lib.mjs'
const M = await importa('lib/motor/motor.mjs')
const CA = await importa('lib/motor/cartera.mjs')
const RT = await importa('lib/motor/reto.mjs')
const T0 = Date.parse('2026-03-03T10:00:00Z') / 1000
const PARES9 = ['AUDCAD', 'AUDUSD', 'EURUSD', 'GBPJPY', 'GBPUSD', 'NZDUSD', 'USDCAD', 'USDCHF', 'USDJPY']
const cero = Object.freeze({ version: 'prueba:0', spread_pips: Object.freeze(Object.fromEntries(PARES9.map(p => [p, 0]))), comision_lote_µ: 0n, swap_µ: 0n })
const plana = p => [p, p, p, p]
const mercado = mins => Object.fromEntries(Object.entries(mins).map(([par, vs]) => [par, M.velas(par, vs.map((v, i) => v && { time: T0 + 60 * i, open: v[0], high: v[1], low: v[2], close: v[3] }).filter(Boolean))]))
const enTexto = x => JSON.stringify(x, (k, v) => (typeof v === 'bigint' ? `${v}n` : v))
const de = (ev, tipo) => ev.filter(x => x.tipo === tipo)
const µ = txt => BigInt(txt) * 1_000_000n
// A45 en el minuto 1; minutos 2 y 3 planos; minuto 4: EURUSD abre en hueco a 1,05000 (para el breach)
const MINS = { EURUSD: [plana('1.10000'), ['1.10000', '1.13000', '1.07000', '1.10000'], plana('1.10000'), plana('1.10000'), plana('1.05000')], GBPUSD: [plana('1.30000'), ['1.30000', '1.33000', '1.27000', '1.30000'], plana('1.30000'), plana('1.30000'), plana('1.30000')] }
const velas = mercado(MINS)
function base({ limites = [], pendiente = false } = {}) {
  let e = CA.crea({ pares: ['EURUSD', 'GBPUSD'], costes: cero, capital: '100000', limites })
  e = CA.aplica(e, { tipo: 'avanzar', hasta: T0 }, velas).estado
  e = CA.aplica(e, { tipo: 'abrir', par: 'EURUSD', lado: 'BUY', orden: 'mercado', lotes: '1', cotizadoEn: e.reloj.cursor }).estado
  e = CA.aplica(e, { tipo: 'abrir', par: 'GBPUSD', lado: 'SELL', orden: 'mercado', lotes: '1', cotizadoEn: e.reloj.cursor }).estado
  if (pendiente) e = CA.aplica(e, { tipo: 'abrir', par: 'EURUSD', lado: 'BUY', orden: 'limit', precio: '1.06000', lotes: '1' }).estado   // por debajo del minimo de A45 (1,07000): no se llena en el minuto modelado
  return e
}
const av = (e, i) => CA.aplica(e, { tipo: 'avanzar', hasta: T0 + 60 * i }, velas)

titulo('A45 sin eventos: la marca queda en el estado')
const r1 = av(base(), 1)
oraculo('V4-02', 'el minuto modelado no tiene eventos, pero la sesion cuenta minutos = 1 (primero = ultimo = ese minuto) y las dos posiciones quedan marcadas', r1.eventos.length === 0 && r1.estado.sincronizacion?.minutos === 1 && r1.estado.sincronizacion?.primero === T0 + 60 && r1.estado.sincronizacion?.politica === 'camino-sincronizado@1' && r1.estado.posiciones.every(p => p.sincronizacion_modelada === true), enTexto([r1.eventos.length, r1.estado.sincronizacion, r1.estado.posiciones.map(p => p.sincronizacion_modelada)]))
const reanudado = CA.deserializa(CA.serializa(r1.estado))
const r2 = av(reanudado, 2)
const cierre = CA.aplica(r2.estado, { tipo: 'cerrar', id: 'p1' })
oraculo('V4-02', 'corte y reanudacion; el cierre de EURUSD en un minuto plano posterior lleva sincronizacion: "modelada"', de(cierre.eventos, 'cierre')[0]?.sincronizacion === 'modelada' && cierre.estado.sincronizacion?.minutos === 1, enTexto(de(cierre.eventos, 'cierre')[0]))
// paso, salto y reanudacion: el mismo estado
const salto = av(base(), 3)
let paso = base(); for (let i = 1; i <= 3; i++) paso = CA.deserializa(CA.serializa(av(paso, i).estado))
oraculo('V4-02', 'paso a paso (serializando) = de un salto, marca incluida', CA.serializa(paso) === CA.serializa(salto.estado) && salto.estado.sincronizacion?.minutos === 1)

titulo('una pendiente que existia en el minuto modelado pasa la marca a su posicion')
{
  let e = av(base({ pendiente: true }), 3).estado
  ver('control: la BUY LIMIT 1,06000 sigue pendiente tras el minuto modelado', e.ordenes.length === 1)
  // minuto 4 (un solo par se mueve: no es modelado): EURUSD a 1,05000 llena la BUY LIMIT 1,06000
  const r = av(e, 4)
  const pos = r.estado.posiciones.find(p => p.par === 'EURUSD' && p.id !== 'p1')
  oraculo('V4-02', 'la BUY LIMIT creada antes del minuto modelado y llenada despues, en un minuto no modelado: su posicion lleva la marca', !!pos && pos.sincronizacion_modelada === true, enTexto(r.estado.posiciones.map(p => [p.id, p.sincronizacion_modelada])))
}

titulo('P7-02: la marca pasa al fill tambien al modificar una pendiente hasta hacerla ejecutable')
{
  // Astra: A45 con la BUY LIMIT 1,06000 (marcada en el minuto modelado); serializar y reanudar; con EURUSD aun a
  // 1,10000, modificarla a 1,11000 (ejecutable al precio vigente): su posicion y su cierre llevan la marca
  let e = CA.deserializa(CA.serializa(av(base({ pendiente: true }), 1).estado))
  ver('control: la pendiente quedo marcada en el minuto modelado y sigue viva', e.ordenes.length === 1 && e.ordenes[0].sincronizacion_modelada === true)
  const m = CA.aplica(e, { tipo: 'modificar', id: e.ordenes[0].id, precio: '1.11000' })
  const fill = de(m.eventos, 'fill')[0]
  const pos = m.estado.posiciones.find(p => p.id === fill?.posicion)
  const c = pos ? CA.aplica(m.estado, { tipo: 'cerrar', id: pos.id }) : null
  oraculo('V4-02', 'modificar la pendiente marcada hasta llenarla: la posicion nueva lleva sincronizacion_modelada', m.resultado === 'aceptado' && !!pos && pos.sincronizacion_modelada === true, enTexto([m.resultado, fill?.posicion, pos?.sincronizacion_modelada]))
  oraculo('V4-02', 'y su cierre posterior lleva sincronizacion: "modelada"; el resumen de la sesion sigue en minutos = 1', !!c && de(c.eventos, 'cierre')[0]?.sincronizacion === 'modelada' && c.estado.sincronizacion?.minutos === 1, enTexto([de(c?.eventos, 'cierre')[0]?.sincronizacion, c?.estado?.sincronizacion]))
}

titulo('el breach posterior lleva el resumen')
{
  const r = av(av(base({ limites: [{ regla: 'perdida_diaria', limite: '96000' }] }), 3).estado, 4)
  const br = de(r.eventos, 'breach')[0]
  oraculo('V4-02', 'breach en el minuto 4 (EURUSD a 1,05000: −5.000): lleva sincronizacion con minutos = 1; los cierres por breach de las dos posiciones, «modelada»', br?.sincronizacion?.minutos === 1 && de(r.eventos, 'cierre').length === 2 && de(r.eventos, 'cierre').every(c => c.sincronizacion === 'modelada'), enTexto([br?.sincronizacion, de(r.eventos, 'cierre').map(c => c.sincronizacion)]))
}

titulo('la fase superada del reto lleva el resumen')
{
  // reto sobre la cartera: cuatro dias con aperturas; el cuarto, A45 modelado y despues EURUSD sube y se cierra todo con +10.000
  const U = iso => Date.parse(iso) / 1000
  const dias = ['2026-03-02', '2026-03-03', '2026-03-04', '2026-03-05']
  const filas = par => {
    const p0 = par === 'EURUSD' ? '1.10000' : '1.30000'
    const r = dias.slice(0, 3).map(d => [`${d}T08:00:00Z`, plana(p0)])
    r.push([`${dias[3]}T08:00:00Z`, plana(p0)], [`${dias[3]}T08:01:00Z`, par === 'EURUSD' ? ['1.10000', '1.13000', '1.07000', '1.10000'] : ['1.30000', '1.33000', '1.27000', '1.30000']], [`${dias[3]}T08:02:00Z`, plana(par === 'EURUSD' ? '1.20000' : '1.30000')])
    return M.velas(par, r.map(([iso, v]) => ({ time: U(iso), open: v[0], high: v[1], low: v[2], close: v[3] })))
  }
  const vp = { EURUSD: filas('EURUSD'), GBPUSD: filas('GBPUSD') }
  let r = RT.creaReto({ motor: CA.crea({ pares: ['EURUSD', 'GBPUSD'], costes: cero, capital: '100000' }), inicio: U('2026-03-02T07:00:00Z') })
  const ev = []
  const paso = c => { const x = RT.aplicaReto(r, c); r = x.reto; ev.push(...x.eventos) }
  const avanzaR = iso => { const x = RT.avanzaReto(r, U(iso), vp); r = x.reto; ev.push(...x.eventos) }
  for (const d of dias.slice(0, 3)) { avanzaR(`${d}T08:00:00Z`); paso({ tipo: 'abrir', par: 'EURUSD', lado: 'BUY', orden: 'mercado', lotes: '0.01', cotizadoEn: r.motor.reloj.cursor }); paso({ tipo: 'cerrar', id: r.motor.posiciones[0].id }) }
  avanzaR(`${dias[3]}T08:00:00Z`)
  paso({ tipo: 'abrir', par: 'EURUSD', lado: 'BUY', orden: 'mercado', lotes: '1', cotizadoEn: r.motor.reloj.cursor })
  paso({ tipo: 'abrir', par: 'GBPUSD', lado: 'SELL', orden: 'mercado', lotes: '1', cotizadoEn: r.motor.reloj.cursor })
  avanzaR(`${dias[3]}T08:02:00Z`)
  for (const p of [...r.motor.posiciones]) paso({ tipo: 'cerrar', id: p.id })
  const fs = de(ev, 'fase_superada')[0]
  oraculo('V4-02', 'reto: la fase superada (110.000 con 4 dias) lleva sincronizacion con minutos = 1', r.estado === 'superada' && fs?.sincronizacion?.minutos === 1 && fs?.sincronizacion?.politica === 'camino-sincronizado@1', enTexto([r.estado, fs]))
}

titulo('control negativo: un solo par con exposicion moviendose no marca nada')
{
  let e = CA.crea({ pares: ['EURUSD', 'GBPUSD'], costes: cero, capital: '100000' })
  e = CA.aplica(e, { tipo: 'avanzar', hasta: T0 }, velas).estado
  e = CA.aplica(e, { tipo: 'abrir', par: 'EURUSD', lado: 'BUY', orden: 'mercado', lotes: '1', cotizadoEn: e.reloj.cursor }).estado
  const r = av(e, 1)                                   // GBPUSD se mueve, pero sin exposicion
  const c = CA.aplica(r.estado, { tipo: 'cerrar', id: 'p1' })
  oraculo('V4-02', 'EURUSD solo (GBPUSD sin exposicion): minutos = 0, posicion sin marca y cierre sin «modelada»', (r.estado.sincronizacion?.minutos ?? 0) === 0 && r.estado.posiciones[0].sincronizacion_modelada !== true && de(c.eventos, 'cierre')[0]?.sincronizacion === undefined, enTexto([r.estado.sincronizacion, de(c.eventos, 'cierre')[0]?.sincronizacion]))
}
fin()
