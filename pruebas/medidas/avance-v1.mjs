/**
 * MEDIDA DEL AVANCE V1 (etapa 2 del motor, pieza 4; orden 1-122; plan-etapa2.md, «Riesgos: fluidez y coste en Vercel»).
 * Step pulsado rapido y Play a velocidad maxima con lib/sim/v1/avance.js y el cliente de comandos, midiendo cada
 * peticion: el p50/p99 del servidor por endpoint (comando y estado), los 429 y las velas por segundo que se consiguen.
 * Con eso, el coste por HORA de practica en Vercel segun el tamaño de lote: invocaciones y segundos de funcion.
 *
 * DOS MODOS:
 *   local    (por defecto) el servidor de lib/servidor en este proceso y sim_comando en PostgreSQL desechable
 *            (montaje-v1 + sim-004b + sim-006), mercado inventado de los nueve pares en memoria. Mide el calculo y la
 *            RPC LOCAL (cada llamada a la base es un psql: no es la latencia de Supabase ni la de Vercel). Las cifras
 *            salen marcadas «LOCAL».
 *   preview  --url https://<preview>.vercel.app --cookie '<cookie de sesion de un alumno de PRUEBA>' --sesion <uuid>
 *            el mismo guion contra los endpoints de un preview con SIM_V1_ENDPOINTS=encendido. ⛔ PREPARADO, NO
 *            EJECUTADO: solo con la orden del CTO, contra una sesion de prueba, nunca produccion; sin
 *            --import ./pruebas/sin-red.mjs (necesita red) y con el turno de maquina. El p99 del servidor sale del
 *            tiempo de respuesta visto desde aqui (incluye la red); el de la funcion, de los logs de Vercel.
 *
 *   /Users/principal/Desktop/revisiones-suite/con-turno node --import ./pruebas/sin-red.mjs --import ./pruebas/registro.mjs \
 *     pruebas/medidas/avance-v1.mjs [--pasos 100] [--velas 600] [--lotes 10,50,100,250]
 * No esta en la tanda.
 *
 * MODELO DE COSTE (por hora de Play continuo a V velas M1 por segundo, lote L): comandos/h = 3600·V/L; cada lote son
 * DOS invocaciones (POST /api/sim/comando y el GET /api/sim/estado que el cliente hace al confirmarse); segundos de
 * funcion/h = comandos/h × (t_comando + t_estado) medios. Con el tope de sim-006 (10 avances paso/play por segundo),
 * V ≤ 10·L: a la velocidad «∞» de hoy (500 velas/s, lib/sessionUi.js SPEED_OPTS) el lote tiene que ser ≥ 50. El
 * precio en euros no se calcula aqui: depende del plan de Vercel (se multiplica fuera, con la tarifa vigente).
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { importa, REPO } from '../lib.mjs'

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d }
const MODO = arg('url', null) ? 'preview' : 'local'
const PASOS = Number(arg('pasos', 100)), VELAS = Number(arg('velas', 600)), LOTES = String(arg('lotes', '10,50,100,250')).split(',').map(Number)
const VELOCIDADES = [1, 5, 15, 60, 500]
const pct = (xs, p) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)] }
const r1 = x => (x == null ? null : Math.round(x * 10) / 10)
const AV = await importa('lib/sim/v1/avance.js'), C = await importa('lib/sim/v1/cliente.js')
const u = k => `00000000-0000-4000-8000-${String(k).padStart(12, '0')}`
let nId = 700000
const web = () => { const o = new Map(); return { getItem: k => (o.has(k) ? o.get(k) : null), setItem: (k, v) => o.set(k, String(v)), removeItem: k => o.delete(k) } }

// el transporte que mide: cada peticion con su ruta, su http, su motivo y su tiempo
function midiendo(llama) {
  const vistas = []
  return {
    vistas,
    async llama(ruta, o) {
      const t0 = performance.now()
      const r = await llama(ruta, o)
      vistas.push({ ruta, ms: performance.now() - t0, http: r?.http ?? null, motivo: r?.cuerpo?.motivo ?? null, avance: o?.cuerpo?.motivo ?? null })
      return r
    },
  }
}

// ── el entorno: local (montaje) o preview (fetch) ─────────────────────────────
async function entornoLocal() {
  const { montajeV1, L, conUidDelMontaje } = await import('../montaje-v1.mjs')
  const { cerrojoEnMemoria } = await import('../cerrojo-falso.mjs')
  const P = await importa('lib/mercado/publicador-v1.mjs'), PV = await importa('lib/mercado/publica-v1.mjs')
  const { minutoCerrado } = await importa('lib/mercado/calidad.mjs')
  const CR = await importa('lib/servidor/crear.mjs'), TO = await importa('lib/servidor/tomar.mjs'), SO = await importa('lib/servidor/sobre.mjs')
  const CO = await importa('lib/servidor/comando.mjs'), ES = await importa('lib/servidor/estado.mjs')
  const lee = p => readFileSync(path.join(REPO, p), 'utf8')
  const HUECO = "v_guarda pg_catalog.text := '⟦HUECO guarda canonica⟧';"
  const S6 = lee('sql/sim-006-tope-de-pasos.sql').replace(HUECO, "v_guarda pg_catalog.text := 'montaje de medida';")
  const U = iso => Date.parse(iso) / 1000
  const M0 = U('2025-01-06T00:00:00Z')
  // paseo con semilla fija en los nueve pares (todos los minutos se mueven)
  let semilla = 7
  const azar = () => ((semilla = (semilla * 1103515245 + 12345) % 2147483648) / 2147483648)
  const BASE = { AUDCAD: 0.9, AUDUSD: 0.65, EURUSD: 1.1, GBPJPY: 190.5, GBPUSD: 1.3, NZDUSD: 0.6, USDCAD: 1.37, USDCHF: 0.88, USDJPY: 150.2 }
  const velasDe = par => { const o = []; let p = BASE[par]; for (let t = M0; t < U('2025-01-11T00:00:00Z'); t += 60) if (!minutoCerrado(t)) { const a = p; p = p * (1 + (azar() - 0.5) * 0.0004); const d = par.endsWith('JPY') ? 3 : 5, f = x => Number(x.toFixed(d)); o.push({ time: t, open: f(a), high: f(Math.max(a, p) * 1.0001), low: f(Math.min(a, p) * 0.9999), close: f(p), volume: 1 }) } return o }
  const velas = Object.fromEntries(SO.PARES.map(par => [par, velasDe(par)]))
  const mercado = (() => { const o = new Map(); return { async lee(r) { return o.has(r) ? Buffer.from(o.get(r)) : null }, async sube(r, b, { upsert = false } = {}) { if (!upsert && o.has(r)) return 'existe'; o.set(r, Buffer.from(b)); return 'ok' }, async borra(r) { o.delete(r) }, async lista() { return [] } } })()
  await PV.publica({ cerrojo: cerrojoEnMemoria(), almacen: mercado, planes: SO.PARES.map(par => P.planificaPar({ par, velas: velas[par], texto: '', anterior: null, diasAceptados: new Map() })), dueno: 'mercado-v1-publica', ahora: '2026-10-14T09:00:00.000Z' })
  const pg = montajeV1()
  pg.arranca()
  const AL = u(1)
  let nb = 0
  async function sesion() {
    const d = `med${++nb}`
    pg.base(d)
    for (const t of [conUidDelMontaje(lee('sql/sim-004b-contrato-v1.sql')), S6]) { const r = pg.comoEjecutor(d, t); if (!r.ok) throw new Error(r.err) }
    pg.alumno(d, AL)
    const leeSesion = async id => { const t = pg.uno(d, `select row_to_json(s)::text from public.sim_sessions s where id = ${L(id)}`); return t ? JSON.parse(t) : null }
    const puertos = { almacen: mercado, rpc: pg.rpc(d), leeSesion, ahora: () => Date.now() }
    const orden = { '/api/sim/tomar': TO.ordenTomar, '/api/sim/comando': CO.ordenComando, '/api/sim/estado': ES.ordenEstado }
    const sid = u(5000 + nb)
    const c0 = await CR.ordenCrear({ actor: AL, cuerpo: { session_id: sid, command_id: u(++nId), epoca: 1, name: 'M', pair: 'EUR/USD', timeframe: 'M1', date_from: '2025-01-06', date_to: '2025-12-31', capital: '100000', challenge_type: null }, puertos })
    if (c0.http !== 201) throw new Error('crear: ' + JSON.stringify(c0.cuerpo))
    const llama = async (ruta, { cuerpo }) => { const r = await orden[ruta]({ actor: AL, cuerpo, puertos }); return { http: r.http, cuerpo: r.cuerpo } }
    return { sid, llama, tiempos: velas.EURUSD.map(v => v.time) }
  }
  return { sesion, cierra: () => pg.cierra(), etiqueta: 'LOCAL (PostgreSQL desechable via psql, mercado en memoria; no es Supabase ni Vercel)' }
}

async function entornoPreview() {
  // ⛔ preparado, no ejecutado (ver la cabecera)
  const base = arg('url'), cookie = arg('cookie', ''), sid = arg('sesion')
  if (!sid || !cookie) throw new Error('preview: hacen falta --sesion y --cookie (de un alumno de PRUEBA)')
  const llama = async (ruta, { metodo = 'POST', cuerpo }) => {
    const url = metodo === 'GET' ? `${base}${ruta}?${new URLSearchParams(cuerpo)}` : `${base}${ruta}`
    const r = await fetch(url, { method: metodo, headers: { 'content-type': 'application/json', cookie }, body: metodo === 'GET' ? undefined : JSON.stringify(cuerpo) })
    return { http: r.status, cuerpo: await r.json().catch(() => null) }
  }
  // las velas del par visible: las de /api/candles de la sesion (la pantalla las tiene; aqui se piden una vez)
  const tiempos = JSON.parse(arg('tiempos', '[]'))
  return { sesion: async () => ({ sid, llama, tiempos }), cierra: () => {}, etiqueta: `PREVIEW ${base}` }
}

// ── el guion ──────────────────────────────────────────────────────────────────
const E = MODO === 'local' ? await entornoLocal() : await entornoPreview()
const informe = { modo: E.etiqueta, pasos: null, play: [] }
const resumen = (vistas, ruta) => { const ms = vistas.filter(v => v.ruta === ruta && v.http === 200).map(v => v.ms); return { n: ms.length, p50: r1(pct(ms, 50)), p99: r1(pct(ms, 99)), media: r1(ms.reduce((a, b) => a + b, 0) / (ms.length || 1)) } }
try {
  // 1 · Step pulsado rapido: PASOS pulsaciones a la vez (en serie en el cliente)
  {
    const s = await E.sesion(), m = midiendo(s.llama)
    const c = C.creaCliente({ sessionId: s.sid, usuario: 'medida', epoca: 1, llama: m.llama, local: web(), sesion: web(), nuevoId: () => u(++nId), plazoMs: 12000 })
    await c.toma(); await c.leeEstado()
    const av = AV.creaAvance({ cliente: c, tiempos: () => s.tiempos })
    const t0 = performance.now()
    const rs = await Promise.all(Array.from({ length: PASOS }, () => av.paso()))
    const seg = (performance.now() - t0) / 1000
    informe.pasos = { pulsaciones: PASOS, confirmados: rs.filter(r => r.conclusion === 'confirmado').length, segundos: r1(seg), pasos_por_s: r1(PASOS / seg),
      tope_429: m.vistas.filter(v => v.http === 429 && v.motivo === 'demasiados_pasos').length, comando: resumen(m.vistas, '/api/sim/comando'), estado: resumen(m.vistas, '/api/sim/estado') }
  }
  // 2 · Play a velocidad maxima (sin esperar a la animacion), por tamaño de lote
  for (const lote of LOTES) {
    const s = await E.sesion(), m = midiendo(s.llama)
    const c = C.creaCliente({ sessionId: s.sid, usuario: 'medida', epoca: 1, llama: m.llama, local: web(), sesion: web(), nuevoId: () => u(++nId), plazoMs: 12000 })
    await c.toma(); await c.leeEstado()
    const av = AV.creaAvance({ cliente: c, tiempos: () => s.tiempos })
    const hasta = s.tiempos[Math.min(s.tiempos.length - 1, VELAS)]
    const t0 = performance.now()
    let r
    for (let k = 0; k < 1000; k++) { r = await av.play({ lote, hasta }); if (r.conclusion !== 'parado') break }
    const seg = (performance.now() - t0) / 1000
    const cmd = resumen(m.vistas, '/api/sim/comando'), est = resumen(m.vistas, '/api/sim/estado')
    const velasPorS = VELAS / seg
    const coste = VELOCIDADES.map(v => {
      const posible = Math.min(v, velasPorS, 10 * lote)
      const comandosH = (3600 * posible) / lote
      return { velas_por_s: v, alcanzable: r1(posible), comandos_h: Math.round(comandosH), invocaciones_h: Math.round(2 * comandosH), segundos_funcion_h: Math.round((comandosH * ((cmd.media ?? 0) + (est.media ?? 0))) / 1000) }
    })
    informe.play.push({ lote, conclusion: r?.conclusion, velas: VELAS, segundos: r1(seg), velas_por_s: r1(velasPorS), tope_429: m.vistas.filter(v => v.http === 429).length, comando: cmd, estado: est, coste_por_hora: coste })
  }
} finally { E.cierra() }
console.log(JSON.stringify(informe, null, 2))
console.log(`\n${informe.modo}`)
console.log(`Step rapido: ${informe.pasos.pulsaciones} pulsaciones, ${informe.pasos.pasos_por_s}/s, 429 de tope ${informe.pasos.tope_429}; comando p50 ${informe.pasos.comando.p50} ms p99 ${informe.pasos.comando.p99} ms; estado p99 ${informe.pasos.estado.p99} ms`)
for (const p of informe.play) {
  console.log(`Play lote ${p.lote}: ${p.velas_por_s} velas/s; comando p50 ${p.comando.p50} p99 ${p.comando.p99} ms; estado p99 ${p.estado.p99} ms; 429 ${p.tope_429}`)
  for (const c of p.coste_por_hora) console.log(`   a ${c.velas_por_s} velas/s (alcanzable ${c.alcanzable}): ${c.invocaciones_h} invocaciones/h, ${c.segundos_funcion_h} s de funcion/h`)
}
