/**
 * MEDIDA S4-08 (diseño sim-004 i.2 S4-08, h.10): cuanto tarda y cuanto pesa un
 * `avanzar` de 1, 3 y 7 dias naturales con los NUEVE pares, en el peor caso:
 * una posicion abierta y una orden pendiente lejana en cada par (cada minuto
 * elige camino en los nueve: dos simulaciones aisladas por par) y velas con
 * movimiento en todos los minutos (paseo aleatorio con semilla fija).
 *
 * Mide, por separado (S4-08: «los 10 s desglosados»; «los 4 MB separados»):
 *   lectura   creaLector().fuentes: trozos de Storage (aqui, un almacen en memoria:
 *             NO mide la red de Supabase), brotli y comprobacion de sha
 *   calculo   el motor (CA.avanza)
 *   adaptar   resultadoDe (eventos, trades, estado serializado)
 *   bytes     el resultado en UTF-8 (lo que va a la RPC) y la respuesta tipica
 * NO mide: autenticacion, la RPC en Supabase, la red de Vercel. Es local, en esta
 * maquina: los umbrales de produccion se miden en el ensayo de la etapa 4.
 *
 *   node --import ./pruebas/sin-red.mjs --import ./pruebas/registro.mjs pruebas/medidas/tramos.mjs [repeticiones]
 * No esta en la tanda (tarda minutos).
 */
import { performance } from 'node:perf_hooks'
import { createHash } from 'node:crypto'
import { importa } from '../lib.mjs'
import { cerrojoEnMemoria } from '../cerrojo-falso.mjs'
const P = await importa('lib/mercado/publicador-v1.mjs')
const PV = await importa('lib/mercado/publica-v1.mjs')
const CA = await importa('lib/motor/cartera.mjs')
const { COSTES_1 } = await importa('lib/motor/costes.mjs')
const { minutoCerrado } = await importa('lib/mercado/calidad.mjs')
const { manifiestosVigentes, creaLector, creaCache } = await importa('lib/servidor/mercado.mjs')
const { resultadoDe } = await importa('lib/servidor/comando.mjs')
const { PARES } = await importa('lib/servidor/sobre.mjs')
// argumentos: [repeticiones] [dias…] (fracciones permitidas: 0.0833 ≈ 2 h). Por defecto: 3 · 1, 3, 7
const REP = Number(process.argv[2] ?? 3)
const DIAS = process.argv.slice(3).map(Number).filter(x => x > 0)
const U = iso => Date.parse(iso) / 1000
const BASE = { AUDCAD: 0.9, AUDUSD: 0.65, EURUSD: 1.1, GBPJPY: 190.5, GBPUSD: 1.3, NZDUSD: 0.6, USDCAD: 1.37, USDCHF: 0.88, USDJPY: 150.2 }
const DIG = p => (/JPY/.test(p) ? 3 : 5)
let semilla = 12345
const azar = () => { semilla = (semilla * 1103515245 + 12345) % 2147483648; return semilla / 2147483648 }
function velas(par) {
  const o = [], paso = 10 ** -DIG(par), r = x => Number(x.toFixed(DIG(par)))
  let p = BASE[par]
  for (let t = U('2025-01-06T00:00:00Z'); t < U('2025-01-25T00:00:00Z'); t += 60) {
    if (minutoCerrado(t)) continue
    const a = p, c = r(a + (azar() - 0.5) * 20 * paso), h = r(Math.max(a, c) + azar() * 8 * paso), l = r(Math.min(a, c) - azar() * 8 * paso)
    o.push({ time: t, open: r(a), high: h, low: l, close: c, volume: 1 }); p = c
  }
  return o
}
function almacen() { const o = new Map(); return { async lee(r) { return o.has(r) ? Buffer.from(o.get(r)) : null }, async sube(r, b, { upsert = false } = {}) { if (!upsert && o.has(r)) return 'existe'; o.set(r, Buffer.from(b)); return 'ok' }, async borra(r) { o.delete(r) }, async lista() { return [] } } }
const alm = almacen()
await PV.publica({ cerrojo: cerrojoEnMemoria(), almacen: alm, planes: PARES.map(par => P.planificaPar({ par, velas: velas(par), texto: '', anterior: null, diasAceptados: new Map() })), dueno: 'mercado-v1-publica', ahora: '2026-10-14T09:00:00.000Z' })
const { fijados, manifiestos } = await manifiestosVigentes(alm, PARES)
const T0 = U('2025-01-06T01:00:00Z')

// el estado de partida: los nueve pares cotizados en T0, una posicion y una pendiente lejana en cada uno
async function partida() {
  const f = await creaLector({ almacen: alm, cache: creaCache() }).fuentes(manifiestos, { desde: U('2025-01-06T00:00:00Z'), hasta: T0 })
  let e = CA.crea({ pares: PARES, costes: COSTES_1, capital: '1000000', mercado: fijados })
  e = CA.avanza(e, T0, f, { desde: U('2025-01-06T00:00:00Z') }).estado
  for (const par of PARES) {
    const bid = e.cotizaciones[par].bid
    e = CA.aplica(e, { tipo: 'abrir', par, lado: 'BUY', orden: 'mercado', lotes: '0.1', cotizadoEn: e.reloj.cursor }, {}).estado
    e = CA.aplica(e, { tipo: 'abrir', par, lado: 'BUY', orden: 'limit', lotes: '0.1', precio: CA.precioTexto(par, bid / 2n) }, {}).estado
  }
  if (e.posiciones.length !== 9 || e.ordenes.length !== 9) throw new Error(`partida: ${e.posiciones.length} posiciones, ${e.ordenes.length} ordenes`)
  return e
}
const e0 = await partida()
console.log(`partida: 9 posiciones y 9 pendientes en ${e0.reloj.cursor} (${new Date(e0.reloj.cursor * 1000).toISOString()})`)
for (const dias of DIAS.length ? DIAS : [1, 3, 7]) {
  const hasta = T0 + Math.round(dias * 1440) * 60
  const filas = []
  for (let k = 0; k < REP; k++) {
    const t0 = performance.now()
    const fu = await creaLector({ almacen: alm, cache: creaCache() }).fuentes(manifiestos, { desde: e0.reloj.cursor, hasta })
    const t1 = performance.now()
    const r = CA.avanza(e0, hasta, fu, { desde: T0 })
    const t2 = performance.now()
    const res = resultadoDe({ tipo: 'avanzar', comando: {}, antes: e0, despues: r.estado, eventos: r.eventos, detencion: r.detencion })
    const t3 = performance.now()
    const bytes = Buffer.byteLength(JSON.stringify(res), 'utf8')
    // la huella del resultado: estado serializado y eventos (el mismo escenario antes y despues de optimizar: identicos)
    const huella = createHash('sha256').update(CA.serializa(r.estado)).update(CA.serializa(r.eventos)).digest('hex')
    filas.push({ huella, lectura: t1 - t0, calculo: t2 - t1, adaptar: t3 - t2, bytes, eventos: r.eventos.length, minutos: r.estado.sincronizacion?.minutos ?? 0, cursor: r.estado.reloj.cursor, detencion: r.detencion?.motivo ?? null })
  }
  const max = k => Math.max(...filas.map(f => f[k]))
  console.log(`${dias} dia(s) naturales: lectura max ${max('lectura').toFixed(0)} ms · calculo max ${max('calculo').toFixed(0)} ms · adaptar max ${max('adaptar').toFixed(0)} ms · resultado ${(max('bytes') / 1048576).toFixed(2)} MB · ${filas[0].eventos} eventos · cursor ${new Date(filas[0].cursor * 1000).toISOString()} · detencion ${filas[0].detencion} · huella ${filas[0].huella.slice(0, 16)}${filas.every(f => f.huella === filas[0].huella) ? '' : ' (¡distinta entre repeticiones!)'}`)
}
