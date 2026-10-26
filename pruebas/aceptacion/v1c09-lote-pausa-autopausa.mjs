/**
 * V1C09 · EL PLAY V1: LOTE POR VELOCIDAD, PAUSA EN LO CONFIRMADO Y AUTOPAUSA DE LAS ORDENES (orden 1-135 del CTO; SI de
 * Ramon, opcion (2)). Escrita ANTES que el codigo (en abcbc00: en rojo).
 *   A · el lote del Play ≈ velocidad × 0,2 s: 1, 1, 3, 12 y 100 velas a 1×, 5×, 15×, 60× e ∞ (500 velas/s), nunca mas
 *       que LOTE_PLAY_MAX (100, el tope de sim-006, que no cambia); _SessionInner lo usa en el Play v1
 *   B · a cada velocidad, pausar con el Play en marcha (a mitad de un lote): el Play acaba solo con lo que tiene en vuelo y
 *       la grafica SALTA a la vela confirmada (sin seguir animando: ninguna espera de la animacion despues de pausar);
 *       la vela visible = el cursor confirmado del servidor. Durante el Play, nunca una vela por delante de lo confirmado.
 *       A 1× y 5× (lote 1) la pausa es exacta: no hay nada por animar al pausar
 *   C · a cada velocidad, una orden a mercado (el OrderModal: la entrada y el cursor de cuando se pulso) con el Play en
 *       marcha: primero el Play se pausa solo, la grafica se coloca en lo confirmado y la orden entra en ESA vela (la
 *       visible): confirmada (no «precio_cambiado»), abierta en la vela visible = el cursor, con la entrada del motor en
 *       esa vela (su close + el spread, BUY al ask). Y una limit (confirmLimitOrder, el dibujo) durante el Play a 60×:
 *       tambien pausa y nace en la vela visible
 *   S · en todo: checkSLTP, checkLimitOrders, checkChallengeBreach, rutaComun y cierreEnVela no se llaman
 * El ritmo es el de la pagina (_SessionInner avanceV1: speed velas por segundo, una espera cada ~16 ms de velas), con
 * temporizadores reales. Contra lib/servidor REAL y PostgreSQL desechable (montaje-v1 + sim-004b + sim-006). Datos
 * inventados: EURUSD sube 0,1 pip cada minuto (cada vela se reconoce por su precio); el resto de pares, constante.
 */
import { register } from 'node:module'
register('../espias-vela.mjs', import.meta.url)
const { titulo, ver, oraculo, fin, importa, fuente, asienta, escenario } = await import('../lib.mjs')
const { hayPostgres } = await import('../pg-ensayo.mjs')
const { montajeV1, L, conUidDelMontaje } = await import('../montaje-v1.mjs')
const { cerrojoEnMemoria } = await import('../cerrojo-falso.mjs')
const N = 15
const HOOK = await importa('components/useSesionV1.js').catch(() => null)
if (!HOOK?.default) { for (let i = 0; i < N; i++) oraculo('V1C09', `caso ${i}: sin components/useSesionV1.js no se puede`, false, 'no esta'); fin() }
const AVA = await importa('lib/sim/v1/avance.js'), TO6 = await importa('lib/sim/v1/topes.mjs'), OR = await importa('lib/sim/v1/ordenes.js')
const VEL = [1, 5, 15, 60, 500]

titulo('A · el lote del Play por velocidad')
{
  const lotes = VEL.map(v => AVA.loteDelPlay?.(v) ?? null)
  oraculo('V1C09', 'A · loteDelPlay: 1, 1, 3, 12 y 100 velas a 1×, 5×, 15×, 60× e ∞ (velocidad × 0,2 s)', JSON.stringify(lotes) === JSON.stringify([1, 1, 3, 12, 100]), JSON.stringify(lotes))
  const extremos = [0, null, 1000, 5000].map(v => AVA.loteDelPlay?.(v) ?? null)
  oraculo('V1C09', 'A · nunca menos de 1 ni mas que LOTE_PLAY_MAX (100, el tope de sim-006, sin cambiar)', TO6.LOTE_PLAY_MAX === 100 && extremos.every(l => l >= 1 && l <= TO6.LOTE_PLAY_MAX), JSON.stringify({ extremos, max: TO6.LOTE_PLAY_MAX }))
  const SI = fuente('components/_SessionInner.js')
  oraculo('V1C09', 'A · _SessionInner: el Play v1 pide loteDelPlay(speedRef.current)', SI.includes('await av.play({lote:loteDelPlay(speedRef.current)})'))
}
if (!hayPostgres()) { ver('PostgreSQL 17 local: NO hay', false); fin() }
const { banco, velasEnStorage } = await import('../banco-motor.mjs')
const P = await importa('lib/mercado/publicador-v1.mjs'), PV = await importa('lib/mercado/publica-v1.mjs')
const { minutoCerrado } = await importa('lib/mercado/calidad.mjs')
const CR = await importa('lib/servidor/crear.mjs'), TO = await importa('lib/servidor/tomar.mjs'), SO = await importa('lib/servidor/sobre.mjs')
const CO = await importa('lib/servidor/comando.mjs'), ES = await importa('lib/servidor/estado.mjs')
const HUECO = "v_guarda pg_catalog.text := '⟦HUECO guarda canonica⟧';"
const deEnsayo = t => { if (t.split(HUECO).length !== 2) throw new Error('el hueco no esta una vez'); return t.replace(HUECO, "v_guarda pg_catalog.text := 'montaje de ensayo (v1c09)';") }
const S4B = conUidDelMontaje(fuente('sql/sim-004b-contrato-v1.sql')), S6 = deEnsayo(fuente('sql/sim-006-tope-de-pasos.sql'))

const u = k => `00000000-0000-4000-8000-${String(k).padStart(12, '0')}`
const U = iso => Date.parse(iso) / 1000
const M0 = U('2025-01-06T00:00:00Z'), m = k => M0 + 60 * k
const tx = x => JSON.stringify(x, (k, v) => (typeof v === 'bigint' ? `${v}n` : v))
const PX = { AUDCAD: 0.9, AUDUSD: 0.65, EURUSD: 1.1, GBPJPY: 190.5, GBPUSD: 1.3, NZDUSD: 0.6, USDCAD: 1.37, USDCHF: 0.88, USDJPY: 150.2 }
// EURUSD: 1,1 + 0,1 pip por minuto desde el lunes 00:00 (cada vela tiene su precio); vuelve a 1,1 cada 1.000 minutos
const precioEn = (par, t) => (par === 'EURUSD' ? Number((1.1 + (((t - M0) / 60) % 1000) * 0.00001).toFixed(5)) : PX[par])
function velasDe(par) { const o = []; for (let t = M0; t < U('2025-01-11T00:00:00Z'); t += 60) if (!minutoCerrado(t)) { const p = precioEn(par, t); o.push({ time: t, open: p, high: p, low: p, close: p, volume: 1 }) } return o }
function almacen() { const o = new Map(); return { o, async lee(r) { return o.has(r) ? Buffer.from(o.get(r)) : null }, async sube(r, b, { upsert = false } = {}) { if (!upsert && o.has(r)) return 'existe'; o.set(r, Buffer.from(b)); return 'ok' }, async borra(r) { o.delete(r) }, async lista() { return [] } } }
const mercado = almacen()
await PV.publica({ cerrojo: cerrojoEnMemoria(), almacen: mercado, planes: SO.PARES.map(par => P.planificaPar({ par, velas: velasDe(par), texto: '', anterior: null, diasAceptados: new Map() })), dueno: 'mercado-v1-publica', ahora: '2026-10-14T09:00:00.000Z' })
const web = () => { const o = new Map(); return { getItem: k => (o.has(k) ? o.get(k) : null), setItem: (k, v) => o.set(k, String(v)), removeItem: k => o.delete(k) } }
const AL = u(1)
let nId = 97000
const nuevoId = () => u(++nId)
const cuenta = {}
const espia = (n, f) => (typeof f !== 'function' ? f : (...a) => { cuenta[n] = (cuenta[n] ?? 0) + 1; return f(...a) })
const espias = () => ({ ...cuenta, ...(globalThis.__espiasVela ?? {}) })
const cero = () => { for (const k of Object.keys(cuenta)) delete cuenta[k]; globalThis.__espiasVela = {} }
const sinCierres = () => { const e = espias(); return ['checkSLTP', 'checkLimitOrders', 'checkChallengeBreach', 'rutaComun', 'cierreEnVela'].every(k => !e[k]) }
escenario({})
velasEnStorage('EUR/USD', velasDe('EURUSD'), [2024], { tramoAbierto: true })
const lote = v => AVA.loteDelPlay?.(v) ?? Math.max(10, Math.min(TO6.LOTE_PLAY_MAX, Math.ceil(v / 5)))

const pg = montajeV1()
try {
  pg.arranca()
  const d = 'x9'
  pg.base(d)
  const a4 = pg.comoEjecutor(d, S4B), a6 = pg.comoEjecutor(d, S6)
  ver('control: sim-004b y sim-006 aplicadas', a4.ok && a6.ok, (a4.err + a6.err).slice(0, 200))
  pg.alumno(d, AL)
  const uno = q => pg.uno(d, q)
  const leeSesion = async id => { const t = uno(`select row_to_json(s)::text from public.sim_sessions s where id = ${L(id)}`); return t ? JSON.parse(t) : null }
  const puertos = { almacen: mercado, rpc: pg.rpc(d), parDeId: pg.parDeId(d), leeSesion, ahora: () => Date.parse('2026-10-14T10:00:00Z') }
  const orden = { '/api/sim/crear': CR.ordenCrear, '/api/sim/tomar': TO.ordenTomar, '/api/sim/comando': CO.ordenComando, '/api/sim/estado': ES.ordenEstado }
  const llamadas = []
  async function llama(ruta, { cuerpo }) {
    const r = await orden[ruta]({ actor: AL, cuerpo, puertos })
    llamadas.push({ tipo: cuerpo?.tipo ?? null, http: r.http, motivo: r.cuerpo?.motivo ?? null })
    if (r.http === 429 && r.cuerpo?.motivo === 'demasiados_avances') uno('update public.sim_alumnos set siguiente_avance_desde = null')
    return { http: r.http, cuerpo: r.cuerpo }
  }
  let ultimaCreacion = null
  const crea = async sid => (ultimaCreacion = await llama('/api/sim/crear', { cuerpo: { session_id: sid, command_id: nuevoId(), epoca: 1, name: 'S', pair: 'EUR/USD', timeframe: 'M1', date_from: '2025-01-06', date_to: '2025-12-31', capital: '100000', challenge_type: null } })).http === 201
  const cierraPestanas = () => uno("update public.sim_arrendamientos set hasta = now() - interval '1 minute'")
  let nS = 9100
  async function pagina() {
    const sid = u(++nS)
    const creada = await crea(sid)
    ver(`control: practica creada (${sid.slice(-4)})`, creada, tx(ultimaCreacion))
    if (!creada) fin()
    cierraPestanas()
    process.env.NEXT_PUBLIC_SIM_V1_PANTALLA = 'encendido'
    const b = await banco({ sesion: await leeSesion(sid), userId: AL, espia, v1: { puertos: { llama, nuevoId, local: web(), almacenSesion: web(), plazoMs: 5000, leeTrades: async () => [], buscaHija: async () => null } } })
    for (let k = 0; k < 50 && !b.ps()?.ready; k++) { await asienta(20); await b.repinta() }
    await b.refs.v1Ref.current?.arranca()
    await b.repinta()
    return b
  }
  // el Play de la pagina (_SessionInner avanceV1) a la velocidad v: speed velas por segundo, una espera cada ~16 ms de velas.
  // trasEspera(k) se llama en la espera k-esima (la vela k ya se ve) para pausar o poner una orden en ese momento
  function playDePagina(b, v, trasEspera) {
    const pv = b.refs.v1Ref.current
    let acc = 0, n = 0
    const traza = { esperas: 0, esperasTrasPausa: 0, pausado: false, porDelante: [] }
    const espera = () => {
      n++; traza.esperas++
      if (traza.pausado) traza.esperasTrasPausa++
      const vis = b.motor().currentTime, cur = pv.cursor()
      if (cur != null && vis > cur) traza.porDelante.push([vis, cur])
      trasEspera?.(n, traza)
      acc += 1000 / Math.max(1, v); if (acc < 16) return; const ms = acc; acc = 0
      return new Promise(r => setTimeout(r, ms))
    }
    const av = pv.avance({ engine: () => b.motor(), par: () => b.estado.activa, espera })
    return { av, traza, corre: () => av.play({ lote: lote(v) }) }
  }

  cero()
  // una practica por velocidad (B y luego C en ella: el plan basico admite 6 sesiones) y una sexta para la limit
  for (const v of VEL) {
    titulo(`B y C · ${v}×: pausar con el Play en marcha; y una orden a mercado con el Play en marcha`)
    const b = await pagina()
    // la pausa llega a mitad de un lote (o en la 3.ª vela a 1× y 5×); la orden, igual
    const K = { 1: 3, 5: 4, 15: 5, 60: 17, 500: 230 }[v]
    {
    const { av, traza, corre } = playDePagina(b, v, (n, t) => { if (n === K && !t.pausado) { t.pausado = true; t.visAlPausar = b.motor().currentTime; t.curAlPausar = b.refs.v1Ref.current.cursor(); av.pausa() } })
    const t0 = Date.now()
    const r = await corre()
    await b.repinta()
    const vis = b.motor().currentTime, cur = b.refs.v1Ref.current.cursor()
    const datos = { v, lote: lote(v), c: r.conclusion, vis: (vis - M0) / 60, cur: (cur - M0) / 60, alPausar: traza.visAlPausar != null ? [(traza.visAlPausar - M0) / 60, (traza.curAlPausar - M0) / 60] : null, esperasTrasPausa: traza.esperasTrasPausa, porDelante: traza.porDelante.length, ms: Date.now() - t0 }
    oraculo('V1C09', `B · ${v}×: pausado a mitad del Play, la vela visible es la confirmada (cursor), sin ninguna espera de animacion despues de pausar${v <= 5 ? ' (exacta: lote 1)' : ' (salto)'}`,
      r.conclusion === 'pausado' && vis === cur && traza.pausado && traza.esperasTrasPausa === 0 && traza.porDelante.length === 0 && (v > 5 || (traza.visAlPausar === traza.curAlPausar && vis === traza.visAlPausar)), tx(datos))
    }
    {
    const pv = b.refs.v1Ref.current
    let orden = null, tope = false
    const pl = playDePagina(b, v, n => {
      // salvaguarda de la prueba: si el Play no se para solo, se para a mano 20 esperas despues (el oraculo lo ve)
      if (n > K + 20 && !tope) { tope = true; pl.av.pausa() }
      if (n !== K || orden) return
      // el onConfirm del OrderModal en v1 (_SessionInner): la entrada que enseñaba (el close visible) y el cursor de ESE momento
      const e = b.motor(), close = e.candles[e.currentIndex]?.close
      orden = pv.envia(OR.comandoAbrir({ pair: 'EUR/USD', side: 'BUY', lots: 1, cursor: pv.cursor() }), { entry: close, openTime: e.currentTime })
    })
    const n0 = llamadas.length
    const r = await pl.corre()
    const ro = await orden
    await pv.cliente.recupera(); await asienta(40); await b.repinta()
    const e = b.motor(), vis = e.currentTime, cur = pv.cursor(), pos = b.ps().positions[0]
    const esperada = Number((precioEn('EURUSD', vis) + 0.00003).toFixed(5))
    const datos = { v, c: r.conclusion, paradoAMano: tope, orden: ro?.conclusion, motivo: ro?.motivo ?? null, vis: (vis - M0) / 60, cur: (cur - M0) / 60, pos: pos && { entry: pos.entry, open: (pos.openTime - M0) / 60 }, esperada, rechazos: llamadas.slice(n0).filter(x => x.tipo === 'abrir' && x.http !== 200).map(x => x.motivo) }
    oraculo('V1C09', `C · ${v}×: BUY a mercado con el Play en marcha: el Play se pausa solo y la orden entra confirmada en la vela visible = el cursor (abierta al cierre de esa vela, + 60 s como el motor, y al ask de esa vela)`,
      !tope && r.conclusion === 'pausado' && ro?.conclusion === 'confirmado' && vis === cur && !!pos && pos.openTime === vis + 60 && pos.entry === esperada && b.ps().positions.length === 1, tx(datos))
    }
  }
  titulo('C · 60×: una limit con el Play en marcha')
  {
    const b = await pagina()
    let lim = null, tope = false
    const pl = playDePagina(b, 60, n => {
      if (n > 37 && !tope) { tope = true; pl.av.pausa() }
      if (n !== 17 || lim) return
      // el dibujo LongShort → confirmLimitOrder (useTradingActions) durante el Play
      lim = b.pendiente({ side: 'BUY_LIMIT', entry: 1.09, sl: 1.08, tp: 1.12, lots: 1 })
    })
    const r = await pl.corre()
    await lim
    await b.refs.v1Ref.current.cliente.recupera(); await asienta(40); await b.repinta()
    const vis = b.motor().currentTime, cur = b.refs.v1Ref.current.cursor(), o = b.ps().orders[0]
    oraculo('V1C09', 'C · 60×: una limit (confirmLimitOrder, el dibujo) con el Play en marcha: el Play se pausa solo y la pendiente nace en la vela visible = el cursor (al cierre de esa vela, + 60 s como el motor)',
      !tope && r.conclusion === 'pausado' && !!o && vis === cur && o.createdTime === vis + 60, tx({ c: r.conclusion, paradoAMano: tope, vis: (vis - M0) / 60, cur: (cur - M0) / 60, o: o && { entry: o.entry, creada: (o.createdTime - M0) / 60 } }))
  }
  oraculo('V1C09', 'S · en B y C: checkSLTP, checkLimitOrders, checkChallengeBreach, rutaComun y cierreEnVela no se llaman', sinCierres(), tx(espias()))
} finally { pg.cierra() }
fin()
