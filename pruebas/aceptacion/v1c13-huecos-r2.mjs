/**
 * V1C13 · LOS HUECOS DECLARADOS EN r2 (orden 1-176 del CTO): R2-6, R2-5 y R2-7. Escrita ANTES que el arreglo (en 042976f:
 * R2-6 y R2-5 en rojo). lib/servidor REAL + PostgreSQL desechable y los hooks REALES del banco (useTradingActions.
 * cancelaOrdenesDeDibujos, como al borrar en la pagina). La regla: nunca una orden viva sin dibujo.
 *   A · R2-6 (a): la limit del dibujo D1 se aplica en el servidor pero su respuesta se pierde (incierto, en la cola); se
 *       borra D1 con la apertura incierta; al resolverse la cola (el servidor la confirma), se cancela sola. Ninguna
 *       pendiente viva
 *   B · R2-6: borrar D2 con su pendiente confirmada y el cancelar FALLA (409 conflicto, dos veces): se reintenta solo hasta
 *       que queda cancelada (sin otro gesto del alumno)
 *   C · R2-6: con la pantalla DESINCRONIZADA (PSIMM1-01) se borra D3: el cancelar no sale (el aviso de reconciliar
 *       bloquea); al volver la lectura y reconciliar, se cancela sola
 *   D · R2-5: dos pestañas. La A abre la limit de D4 y pierde la respuesta; la B («Usar aqui») abre otra; la A vuelve
 *       («Usar aqui») y resuelve su cola: el recibo es el de antes y el estado ya va una version mas alla. La provisional
 *       de la A tiene que quedar enlazada a SU pendiente: borrar D4 la cancela y deja la de la B
 *   E · R2-7: pasar de fase con el GET de estado caido justo despues del ACK: lo confirmado se ve igual (la pagina va a la
 *       hija; en la ultima fase, el reto completado: passed_all). Si sale en verde en 042976f, R2-7 NO se reproduce y queda
 *       declarado con esta prueba
 *   S · en todo: los espias de cierre a cero
 * Datos inventados. Sin red.
 */
// orden 1-179 (a): el dia ancla del mercado de la prueba (crear exige las fechas dentro de lo publicado)
import { anclados } from '../mercado-ancla.mjs'
import { register } from 'node:module'
register('../espias-vela.mjs', import.meta.url)
const { titulo, ver, oraculo, fin, importa, fuente, asienta, escenario } = await import('../lib.mjs')
const N = 7
const HOOK = await importa('components/useSesionV1.js').catch(() => null)
const PA = await importa('lib/sim/v1/pantalla.js').catch(() => null)
if (!HOOK?.default || !PA?.creaPantallaV1) { for (let i = 0; i < N; i++) oraculo('V1C13', `caso ${i}: sin la pantalla v1 no se puede`, false, 'no esta'); fin() }
const { hayPostgres } = await import('../pg-ensayo.mjs')
if (!hayPostgres()) { ver('PostgreSQL 17 local: NO hay', false); fin() }
const { banco, velasEnStorage } = await import('../banco-motor.mjs')
const { montajeV1, L, conUidDelMontaje } = await import('../montaje-v1.mjs')
const { cerrojoEnMemoria } = await import('../cerrojo-falso.mjs')
const { router } = await import('../next-falso.mjs')
const OR = await importa('lib/sim/v1/ordenes.js'), CL = await importa('lib/sim/v1/cliente.js'), AV = await importa('lib/sim/avisos.js')
const P = await importa('lib/mercado/publicador-v1.mjs'), PV = await importa('lib/mercado/publica-v1.mjs')
const { minutoCerrado } = await importa('lib/mercado/calidad.mjs')
const CR = await importa('lib/servidor/crear.mjs'), TO = await importa('lib/servidor/tomar.mjs'), SO = await importa('lib/servidor/sobre.mjs')
const CO = await importa('lib/servidor/comando.mjs'), ES = await importa('lib/servidor/estado.mjs'), FA = await importa('lib/servidor/fase.mjs')
const VE = await importa('lib/servidor/velas.mjs')   // orden 1-179 (d): el grafico v1 pide sus velas al servidor
const CA = await importa('lib/motor/cartera.mjs')
const tx = x => JSON.stringify(x, (k, v) => (typeof v === 'bigint' ? `${v}n` : v))
const HUECO = "v_guarda pg_catalog.text := '⟦HUECO guarda canonica⟧';"
const deEnsayo = t => { if (t.split(HUECO).length !== 2) throw new Error('el hueco no esta una vez'); return t.replace(HUECO, "v_guarda pg_catalog.text := 'montaje de ensayo (v1c13)';") }
const S4B = conUidDelMontaje(fuente('sql/sim-004b-contrato-v1.sql')), S6 = deEnsayo(fuente('sql/sim-006-tope-de-pasos.sql'))
const u = k => `00000000-0000-4000-8000-${String(k).padStart(12, '0')}`
const M0 = Date.parse('2025-01-06T00:00:00Z') / 1000, m = k => M0 + 60 * k
const PX = { AUDCAD: 0.9, AUDUSD: 0.65, EURUSD: 1.1, GBPJPY: 190.5, GBPUSD: 1.3, NZDUSD: 0.6, USDCAD: 1.37, USDCHF: 0.88, USDJPY: 150.2 }
function velasDe(par) { const o = []; for (let t = M0; t < M0 + 5 * 86400; t += 60) if (!minutoCerrado(t)) o.push({ time: t, open: PX[par], high: PX[par], low: PX[par], close: PX[par], volume: 1 }); return o }
function almacen() { const o = new Map(); return { async lee(r) { return o.has(r) ? Buffer.from(o.get(r)) : null }, async sube(r, b, { upsert = false } = {}) { if (!upsert && o.has(r)) return 'existe'; o.set(r, Buffer.from(b)); return 'ok' }, async borra(r) { o.delete(r) }, async lista() { return [] } } }
const mercado = almacen()
await PV.publica({ cerrojo: cerrojoEnMemoria(), almacen: mercado, planes: anclados(SO.PARES.map(par => P.planificaPar({ par, velas: velasDe(par), texto: '', anterior: null, diasAceptados: new Map() })), '2025-12-31'), dueno: 'mercado-v1-publica', ahora: '2026-10-14T09:00:00.000Z' })
const web = () => { const o = new Map(); return { getItem: k => (o.has(k) ? o.get(k) : null), setItem: (k, v) => o.set(k, String(v)), removeItem: k => o.delete(k) } }
const AL = u(1)
let nId = 95000
const nuevoId = () => u(++nId)
const cuenta = {}
const espia = (n, f) => (typeof f !== 'function' ? f : (...a) => { cuenta[n] = (cuenta[n] ?? 0) + 1; return f(...a) })
const espias = () => ({ ...cuenta, ...(globalThis.__espiasVela ?? {}) })
const sinCierres = () => { const e = espias(); return ['checkSLTP', 'checkLimitOrders', 'checkChallengeBreach', 'rutaComun', 'cierreEnVela'].every(k => !e[k]) }
const textos = () => AV.avisos().map(a => a.texto)
const AVISO = 'Hay una operación confirmada que no se ha podido mostrar: recarga.'
escenario({})
velasEnStorage('EUR/USD', velasDe('EURUSD'), [2024], { tramoAbierto: true })
const espera = ms => new Promise(r => setTimeout(r, ms))

const pg = montajeV1()
try {
  pg.arranca()
  const d = 'v1c13'
  pg.base(d)
  const a4 = pg.comoEjecutor(d, S4B), a6 = pg.comoEjecutor(d, S6)
  ver('control: sim-004b y sim-006 aplicadas', a4.ok && a6.ok, (a4.err + a6.err).slice(0, 200))
  pg.alumno(d, AL)
  const uno = q => pg.uno(d, q)
  const leeSesion = async id => { const t = uno(`select row_to_json(s)::text from public.sim_sessions s where id = ${L(id)}`); return t ? JSON.parse(t) : null }
  const puertos = { almacen: mercado, rpc: pg.rpc(d), parDeId: pg.parDeId(d), leeSesion, ahora: () => Date.parse('2026-10-14T10:00:00Z') }
  const orden = { '/api/sim/crear': CR.ordenCrear, '/api/sim/tomar': TO.ordenTomar, '/api/sim/comando': CO.ordenComando, '/api/sim/estado': ES.ordenEstado, '/api/sim/velas': VE.ordenVelas, '/api/sim/avanzar-fase': FA.ordenFase }
  // las trampas del transporte de la pagina (nunca en el servidor)
  const T = { pierdeAbrir: false, conflictosCancelar: 0, estadoCaido: false, caeTrasAbrir: false, caeTrasFase: false }
  const enviados = []
  async function directo(ruta, cuerpo) {
    const r = await orden[ruta]({ actor: AL, cuerpo, puertos })
    if (r.http === 429 && r.cuerpo?.motivo === 'demasiados_avances') uno('update public.sim_alumnos set siguiente_avance_desde = null')
    return { http: r.http, cuerpo: r.cuerpo }
  }
  async function llama(ruta, { cuerpo }) {
    if (ruta === '/api/sim/estado' && T.estadoCaido) return { http: 503, cuerpo: { ok: false, motivo: 'no_disponible' } }
    if (ruta === '/api/sim/comando' && cuerpo?.tipo !== 'avanzar') enviados.push({ tipo: cuerpo?.tipo, id: cuerpo?.id ?? null })
    if (ruta === '/api/sim/comando' && cuerpo?.tipo === 'cancelar' && T.conflictosCancelar > 0) { T.conflictosCancelar--; return { http: 409, cuerpo: { ok: false, motivo: 'conflicto' } } }
    const r = await directo(ruta, cuerpo)
    if (ruta === '/api/sim/comando' && cuerpo?.tipo === 'abrir' && T.pierdeAbrir) { T.pierdeAbrir = false; throw new Error('respuesta perdida (ficticia)') }
    if (ruta === '/api/sim/comando' && cuerpo?.tipo === 'abrir' && r.http === 200 && T.caeTrasAbrir) { T.caeTrasAbrir = false; T.estadoCaido = true }
    if (ruta === '/api/sim/avanzar-fase' && r.http < 300 && T.caeTrasFase) { T.caeTrasFase = false; T.estadoCaido = true }
    return r
  }
  let nS = 8100
  async function crea(reto = null) {
    const sid = u(++nS)
    const c = await directo('/api/sim/crear', { session_id: sid, command_id: nuevoId(), epoca: 1, name: 'S', pair: 'EUR/USD', timeframe: 'M1', date_from: '2025-01-06', date_to: '2025-12-31', capital: '100000', challenge_type: reto })
    ver(`control: sesion creada (${sid.slice(-4)}${reto ? ', ' + reto : ''})`, c.http === 201, tx(c).slice(0, 300))
    uno("update public.sim_arrendamientos set hasta = now() - interval '1 minute'")
    return sid
  }
  async function pagina(sid, { irA = m(2) } = {}) {
    process.env.NEXT_PUBLIC_SIM_V1_PANTALLA = 'encendido'
    const b = await banco({ sesion: await leeSesion(sid), userId: AL, espia, v1: { puertos: { llama, nuevoId, local: web(), almacenSesion: web(), plazoMs: 5000, leeTrades: async () => [], buscaHija: async () => uno(`select id from public.sim_sessions where challenge_parent_id = ${L(sid)} limit 1`) || null,
      esperasRelectura: [0, 0, 0], esperasCancelar: [20, 40, 80] } } })
    for (let k = 0; k < 50 && !b.ps()?.ready; k++) { await asienta(20); await b.repinta() }
    await b.refs.v1Ref.current?.arranca()
    await b.repinta()
    if (irA != null) await b.refs.v1Ref.current.avance({ engine: () => b.motor(), par: () => b.estado.activa }).irA(irA)
    return b
  }
  const srv = async sid => (await leeSesion(sid)).estado.ordenes.map(o => o.id)
  const asentado = async (b, ms = 0) => { if (ms) await espera(ms); await asienta(60); await b.repinta() }
  const limitDelDibujo = (pv, entry, dibujo) => pv.envia(OR.comandoAbrir({ pair: 'EUR/USD', side: 'BUY_LIMIT', entry, lots: 1, sl: entry - 0.01, tp: entry + 0.02, cursor: pv.cursor() }), { entry, openTime: m(2), dibujo })

  titulo('A · R2-6: borrar el dibujo con su apertura incierta')
  {
    const sid = await crea(), b = await pagina(sid)
    const pv = b.refs.v1Ref.current, TR = b.caja.valor.trading
    T.pierdeAbrir = true
    const r = await limitDelDibujo(pv, 1.095, 'D1')
    await asentado(b)
    ver('control: la limit de D1 se aplico en el servidor y la pagina la tiene por incierta (en la cola), sin pintarla', r.conclusion === 'incierto' && (await srv(sid)).length === 1 && pv.cliente.pendientes().length === 1 && b.ps().orders.length === 0, tx({ r: r.conclusion, srv: await srv(sid), cola: pv.cliente.pendientes().length }))
    enviados.length = 0
    await TR.cancelaOrdenesDeDibujos(['D1'])
    await asentado(b)
    // el alumno sigue: cualquier gesto resuelve la cola (aqui, recupera, como el Step o el Play)
    await pv.cliente.recupera()
    await asentado(b, 300)
    oraculo('V1C13', 'A · al confirmarse en el servidor, la pendiente del dibujo borrado se cancela sola: ninguna viva (servidor y pagina)', (await srv(sid)).length === 0 && b.ps().orders.length === 0 && enviados.some(e => e.tipo === 'cancelar'), tx({ srv: await srv(sid), pagina: b.ps().orders.map(o => [o.id, o.dibujo]), enviados }))
  }

  titulo('B · R2-6: el cancelar del dibujo borrado falla y se reintenta solo')
  {
    const sid = await crea(), b = await pagina(sid)
    const pv = b.refs.v1Ref.current, TR = b.caja.valor.trading
    await limitDelDibujo(pv, 1.095, 'D2'); await asentado(b)
    ver('control: la limit de D2 confirmada, con su dibujo', (await srv(sid)).length === 1 && b.ps().orders[0]?.dibujo === 'D2', tx(b.ps().orders))
    enviados.length = 0
    T.conflictosCancelar = 2
    await TR.cancelaOrdenesDeDibujos(['D2'])
    await asentado(b, 600)
    oraculo('V1C13', 'B · tras dos cancelar rechazados (409), se reintenta sin otro gesto hasta cancelarla: ninguna viva', (await srv(sid)).length === 0 && b.ps().orders.length === 0 && enviados.filter(e => e.tipo === 'cancelar').length >= 3, tx({ srv: await srv(sid), cancelar: enviados.filter(e => e.tipo === 'cancelar').length, quedan: T.conflictosCancelar }))
  }

  titulo('C · R2-6: el aviso de reconciliar bloquea el cancelar; al reconciliar, se cancela')
  {
    AV.vaciaAvisos()
    const sid = await crea(), b = await pagina(sid)
    const pv = b.refs.v1Ref.current, TR = b.caja.valor.trading
    await limitDelDibujo(pv, 1.095, 'D3'); await asentado(b)
    T.caeTrasAbrir = true
    await pv.envia(OR.comandoAbrir({ pair: 'EUR/USD', side: 'BUY', lots: 1, cursor: pv.cursor() }), { entry: 1.1, openTime: m(2) })
    await asentado(b)
    ver('control: la pantalla queda desincronizada (aviso de reconciliar)', textos().includes(AVISO), tx(textos()))
    enviados.length = 0
    await TR.cancelaOrdenesDeDibujos(['D3'])
    await asentado(b, 300)
    const bloqueado = { cancelar: enviados.filter(e => e.tipo === 'cancelar').length, srv: await srv(sid) }
    T.estadoCaido = false
    await pv.cliente.recupera()
    await asentado(b, 300)
    oraculo('V1C13', 'C · desincronizada no sale ningun cancelar; al reconciliar, la pendiente de D3 se cancela sola', bloqueado.cancelar === 0 && bloqueado.srv.length === 1 && (await srv(sid)).length === 0 && b.ps().orders.length === 0, tx({ bloqueado, srv: await srv(sid), pagina: b.ps().orders.map(o => o.id) }))
  }

  titulo('D · R2-5: dos pestañas; el estado salta mas alla de la version de la apertura')
  {
    const sid = await crea(), b = await pagina(sid)
    const pv = b.refs.v1Ref.current, TR = b.caja.valor.trading
    T.pierdeAbrir = true
    const r = await limitDelDibujo(pv, 1.095, 'D4')
    await asentado(b)
    const v1 = Number((await leeSesion(sid)).version)
    // la pestaña B: «Usar aqui» y otra limit
    const B = CL.creaCliente({ sessionId: sid, usuario: AL, llama: (ruta, o) => directo(ruta, o.cuerpo), local: web(), sesion: web(), nuevoId })
    const tB = await B.toma({ forzar: true }); await B.leeEstado()
    const rB = await B.envia('abrir', { par: 'EURUSD', lado: 'BUY', orden: 'limit', precio: '1.09', lotes: '1', sl: '1.08' })
    ver('control: la A perdio la respuesta (incierta) y la B abrio la suya: dos pendientes, version una mas', r.conclusion === 'incierto' && tB.ok && rB.conclusion === 'confirmado' && (await srv(sid)).length === 2 && Number((await leeSesion(sid)).version) === v1 + 1, tx({ r: r.conclusion, rB: rB.conclusion, srv: await srv(sid) }))
    // la A vuelve («Usar aqui») y resuelve su cola: recibo repetido, estado una version mas alla
    const tA = await pv.cliente.toma({ forzar: true })
    await pv.cliente.recupera()
    await asentado(b)
    const antes = await srv(sid)
    enviados.length = 0
    await TR.cancelaOrdenesDeDibujos(['D4'])
    await asentado(b, 300)
    const quedan = (await leeSesion(sid)).estado.ordenes.map(o => [o.id, Number(o.precio?.$b ?? o.precio)])
    oraculo('V1C13', 'D · la provisional de la A queda enlazada a SU pendiente: borrar D4 la cancela (1,095) y deja la de la B (1,090)', tA.ok && antes.length === 2 && quedan.length === 1 && quedan[0][1] === 109000, tx({ antes, quedan, enviados, pagina: b.ps().orders.map(o => [o.id, o.dibujo]) }))
  }

  titulo('E · R2-7: pasar de fase con el GET de estado caido tras el ACK')
  {
    const sid = await crea('2F')
    const f = await leeSesion(sid)
    const est = CA.deserializa(JSON.stringify(f.estado))
    est.motor.saldo_µ = 110500_000000n; est.estado = 'superada'; est.superada = { saldo_µ: 110500_000000n, dias: 4, en: { t: m(5) } }; est.dias_con_apertura = ['2025-01-01', '2025-01-02', '2025-01-03', '2025-01-06']
    uno(`update public.sim_sessions set estado = ${L(JSON.parse(CA.serializa(est)))}::jsonb where id = ${L(sid)}`)
    const g = await pagina(sid, { irA: null })
    await g.caja.valor.reto.refreshChallengeStatus(); await g.repinta(); await asienta(40); await g.repinta()
    ver('control: fase 1 superada en el servidor: el modal de fase', g.caja.valor.reto.challengeModal === 'passed_phase', tx(g.caja.valor.reto.challengeModal))
    T.caeTrasFase = true
    const nav0 = router.navegado.length
    await g.caja.valor.reto.handleChallengePass()
    const hija = uno(`select id from public.sim_sessions where challenge_parent_id = ${L(sid)}`)
    oraculo('V1C13', 'E · fase 1 → 2 confirmada con la lectura caida: la pagina va igual a la hija (lo confirmado se ve)', !!hija && tx(router.navegado.slice(nav0)) === tx([['push', `/session/${hija}`]]), tx({ hija, nav: router.navegado.slice(nav0), avisos: textos() }))
    T.estadoCaido = false
    // la ultima fase: la hija superada → completado
    const fh = await leeSesion(hija)
    const eh = CA.deserializa(JSON.stringify(fh.estado))
    eh.motor.saldo_µ = 105500_000000n; eh.estado = 'superada'; eh.superada = { saldo_µ: 105500_000000n, dias: 4, en: { t: m(5) } }; eh.dias_con_apertura = ['2025-01-01', '2025-01-02', '2025-01-03', '2025-01-06']
    uno(`update public.sim_sessions set estado = ${L(JSON.parse(CA.serializa(eh)))}::jsonb where id = ${L(hija)}`)
    uno("update public.sim_arrendamientos set hasta = now() - interval '1 minute'")
    const h = await pagina(hija, { irA: null })
    await h.caja.valor.reto.refreshChallengeStatus(); await h.repinta(); await asienta(40); await h.repinta()
    ver('control: fase 2 (la ultima) superada en el servidor: el modal de la ultima fase (passed_all), aun sin pasar (hija null, sin terminal)', h.caja.valor.reto.challengeModal === 'passed_all' && h.refs.v1Ref.current.hija == null && (await leeSesion(hija)).terminal == null, tx({ modal: h.caja.valor.reto.challengeModal, hija: h.refs.v1Ref.current.hija }))
    T.caeTrasFase = true
    const nav1 = router.navegado.length
    await h.caja.valor.reto.handleChallengePass()
    await h.repinta(); await asienta(40); await h.repinta()
    const fh2 = await leeSesion(hija)
    const ret = h.refs.v1Ref.current.estadoReto()
    oraculo('V1C13', 'E · la ultima fase confirmada con la lectura caida: el reto completado se ve (passed_all) sin navegar, como el servidor (terminal superado)',
      fh2.terminal === 'superado' && h.refs.v1Ref.current.hija === 'completado' && tx(ret).includes('passed_all') && router.navegado.length === nav1, tx({ terminal: fh2.terminal, hija: h.refs.v1Ref.current.hija, nav: router.navegado.slice(nav1), avisos: textos() }))
    T.estadoCaido = false
  }
  oraculo('V1C13', 'S · los espias de cierre a cero', sinCierres(), tx(espias()))
} finally { pg.cierra() }
fin()
