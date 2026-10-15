/**
 * ETAPA 3 · LA DETENCION EN EL RECIBO (decision del CTO del 15-oct, diseño q.17.4). Escrita ANTES que
 * el codigo (contra 21525c6: en rojo).
 *
 * Contra sim_comando REAL (montaje-v1): un reto 1F que se quema en un avance.
 *   · el recibo de ese avance guarda en resumen.detencion, tal cual, { motivo: 'breach', en: el minuto
 *     del breach, regla: la del evento breach } (la regla es la del evento guardado en sim_eventos, no
 *     una recalculada); y el ACK sale de ese recibo;
 *   · el avance siguiente no calcula: recibo con resumen.detencion { motivo: 'sesion_terminada' }, sin
 *     eventos y sin version nueva.
 * La practica del servidor no tiene limites: crear no se los pone, asi que no se quema (CTO 15-oct,
 * q.17.7): una practica de 80 lotes que pierde el 80 % no devuelve ninguna detencion de breach. (Una
 * practica CON limites, la del motor, sigue la regla del reto: pruebas/motor/tramos-fuentes.mjs.)
 */
import { cerrojoEnMemoria } from './cerrojo-falso.mjs'
import { titulo, ver, oraculo, fin, importa } from './lib.mjs'
import { hayPostgres } from './pg-ensayo.mjs'
import { montajeV1, L } from './montaje-v1.mjs'
const P = await importa('lib/mercado/publicador-v1.mjs')
const PV = await importa('lib/mercado/publica-v1.mjs')
const { minutoCerrado } = await importa('lib/mercado/calidad.mjs')
const CR = await importa('lib/servidor/crear.mjs'), TO = await importa('lib/servidor/tomar.mjs'), SO = await importa('lib/servidor/sobre.mjs'), CO = await importa('lib/servidor/comando.mjs')
const u = k => `00000000-0000-4000-8000-${String(k).padStart(12, '0')}`
const U = iso => Date.parse(iso) / 1000
const M0 = U('2025-01-06T00:00:00Z'), m = k => M0 + 60 * k
const AHORA = Date.parse('2026-10-14T10:00:00Z')
// con las claves ordenadas: jsonb guarda las claves en su propio orden (los valores, tal cual)
const ordena_ = v => (Array.isArray(v) ? v.map(ordena_) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, ordena_(v[k])])) : v)
const tx = x => JSON.stringify(ordena_(x))
// EURUSD cae 1.000 ticks en el minuto 30
const PX = { AUDCAD: 0.9, AUDUSD: 0.65, EURUSD: 1.1, GBPJPY: 190.5, GBPUSD: 1.3, NZDUSD: 0.6, USDCAD: 1.37, USDCHF: 0.88, USDJPY: 150.2 }
const ovhl = (par, t) => (par === 'EURUSD' && t === m(30) ? [1.1, 1.1, 1.09, 1.09] : par === 'EURUSD' && t > m(30) ? [1.09, 1.09, 1.09, 1.09] : [PX[par], PX[par], PX[par], PX[par]])
function velas(par) { const o = []; for (let t = M0; t < U('2025-01-09T00:00:00Z'); t += 60) if (!minutoCerrado(t)) { const [a, h, l, c] = ovhl(par, t); o.push({ time: t, open: a, high: h, low: l, close: c, volume: 1 }) } return o }
function almacen() { const o = new Map(); return { async lee(r) { return o.has(r) ? Buffer.from(o.get(r)) : null }, async sube(r, b, { upsert = false } = {}) { if (!upsert && o.has(r)) return 'existe'; o.set(r, Buffer.from(b)); return 'ok' }, async borra(r) { o.delete(r) }, async lista() { return [] } } }
const mercado = almacen()
await PV.publica({ cerrojo: cerrojoEnMemoria(), almacen: mercado, planes: SO.PARES.map(par => P.planificaPar({ par, velas: velas(par), texto: '', anterior: null, diasAceptados: new Map() })), dueno: 'mercado-v1-publica', ahora: '2026-10-14T09:00:00.000Z' })

if (!hayPostgres()) { ver('PostgreSQL 17 local: NO hay; la prueba no se ha ejecutado', false); fin() }
const pg = montajeV1()
try {
  pg.arranca()
  const d = pg.base('det1'), AL = u(1)
  pg.alumno(d, AL)
  const leeSesion = async id => { const t = pg.uno(d, `select row_to_json(s)::text from public.sim_sessions s where id = ${L(id)}`); return t ? JSON.parse(t) : null }
  const pu = { almacen: mercado, rpc: pg.rpc(d), leeSesion, ahora: () => AHORA }
  const sinTasa = () => pg.uno(d, 'update public.sim_alumnos set siguiente_avance_desde = null')
  const version = () => Number(pg.uno(d, `select version from public.sim_sessions where id = ${L(u(1001))}`))
  let n = 5000
  const cmd = o => ({ session_id: u(1001), command_id: u(++n), epoca: 1, cliente_id: 'p', ...o })
  ver('control: reto 1F creado', (await CR.ordenCrear({ actor: AL, cuerpo: { session_id: u(1001), command_id: u(2001), epoca: 1, name: 'R', pair: 'EUR/USD', timeframe: 'H1', date_from: '2025-01-06', date_to: '2025-12-31', capital: '100000', challenge_type: '1F' }, puertos: pu })).http === 201)
  const testigo = (await TO.ordenTomar({ actor: AL, cuerpo: { session_id: u(1001), command_id: u(3001), epoca: 1, cliente_id: 'p', forzar: true }, puertos: pu })).cuerpo?.testigo
  const ordena = c => CO.ordenComando({ actor: AL, cuerpo: c, puertos: pu })
  sinTasa()
  const a1 = await ordena(cmd({ tipo: 'avanzar', version_esperada: 0, testigo, hasta: m(10), motivo: 'paso' }))
  const ab = await ordena(cmd({ tipo: 'abrir', version_esperada: version(), testigo, par: 'EURUSD', lado: 'BUY', orden: 'mercado', lotes: '10', cotizadoEn: m(10) }))
  ver('control: avanzar y abrir 10 lotes', a1.http === 200 && ab.http === 200, tx({ a1: a1.http, ab: ab.cuerpo?.motivo }))

  titulo('el avance que quema el reto')
  sinTasa()
  const v0 = version()
  const q = await ordena(cmd({ tipo: 'avanzar', version_esperada: v0, testigo, hasta: m(40), motivo: 'play' }))
  const ev = JSON.parse(pg.uno(d, `select coalesce(json_agg(datos order by seq), '[]')::text from public.sim_eventos where session_id = ${L(u(1001))} and tipo = 'breach'`))
  const resumen = JSON.parse(pg.uno(d, `select resumen::text from public.sim_recibos where session_id = ${L(u(1001))} and command_id = ${L(q.cuerpo?.recibo?.command_id ?? u(0))}`) || 'null')
  ver('control: el avance confirma y hay un evento breach guardado', q.http === 200 && ev.length === 1, tx({ q: q.http, ev: ev.length }))
  oraculo('DETS', 'el recibo guarda resumen.detencion = { motivo: breach, en: el minuto 30, regla: la del evento breach guardado }', tx(resumen?.detencion) === tx({ motivo: 'breach', en: m(30), regla: ev[0]?.regla }) && ev[0]?.regla === 'perdida_diaria', tx({ det: resumen?.detencion, regla: ev[0]?.regla }))
  oraculo('DETS', 'y el ACK sale de ese recibo (la detencion, la misma)', tx(q.cuerpo?.recibo?.resumen?.detencion) === tx(resumen?.detencion), tx(q.cuerpo?.recibo?.resumen))

  titulo('la llamada siguiente, sobre el reto ya quemado')
  sinTasa()
  const v1 = version()
  const t2 = await ordena(cmd({ tipo: 'avanzar', version_esperada: v1, testigo, hasta: m(60), motivo: 'play' }))
  const r2 = JSON.parse(pg.uno(d, `select resumen::text from public.sim_recibos where session_id = ${L(u(1001))} and command_id = ${L(t2.cuerpo?.recibo?.command_id ?? u(0))}`) || 'null')
  oraculo('DETS', 'no calcula: recibo con resumen.detencion { motivo: sesion_terminada }, sin eventos y sin version nueva', t2.http === 200 && tx(r2?.detencion) === tx({ motivo: 'sesion_terminada' }) && r2?.eventos === 0 && version() === v1, tx({ t2: t2.http, r2 }))

  // CTO 15-oct (diseño q.17.7): la practica no tiene limites; ninguna perdida la detiene por breach
  titulo('la practica sin limites: ninguna perdida la detiene')
  const P1 = u(1002)
  let k = 7000
  const pcmd = o => ({ session_id: P1, command_id: u(++k), epoca: 1, cliente_id: 'p', ...o })
  const pversion = () => Number(pg.uno(d, `select version from public.sim_sessions where id = ${L(P1)}`))
  ver('control: practica creada (sin challenge_type)', (await CR.ordenCrear({ actor: AL, cuerpo: { session_id: P1, command_id: u(2002), epoca: 1, name: 'P', pair: 'EUR/USD', timeframe: 'H1', date_from: '2025-01-06', date_to: '2025-12-31', capital: '100000', challenge_type: null }, puertos: pu })).http === 201)
  const pt = (await TO.ordenTomar({ actor: AL, cuerpo: { session_id: P1, command_id: u(3002), epoca: 1, cliente_id: 'p', forzar: true }, puertos: pu })).cuerpo?.testigo
  sinTasa()
  const p1 = await ordena(pcmd({ tipo: 'avanzar', version_esperada: pversion(), testigo: pt, hasta: m(10), motivo: 'paso' }))
  const pab = await ordena(pcmd({ tipo: 'abrir', version_esperada: pversion(), testigo: pt, par: 'EURUSD', lado: 'BUY', orden: 'mercado', lotes: '80', cotizadoEn: m(10) }))
  ver('control: avanzar y abrir 80 lotes (la caida de 1.000 ticks pierde 80.000 de 100.000)', p1.http === 200 && pab.http === 200, tx({ p1: p1.http, ab: pab.cuerpo?.motivo }))
  const est0 = JSON.parse(pg.uno(d, `select estado::text from public.sim_sessions where id = ${L(P1)}`))
  ver('control: la practica no tiene limites', Array.isArray(est0?.limites) && est0.limites.length === 0, tx(est0?.limites))
  const dets = []
  for (const hasta of [m(29), m(30), m(31), m(120)]) {
    sinTasa()
    const r = await ordena(pcmd({ tipo: 'avanzar', version_esperada: pversion(), testigo: pt, hasta, motivo: 'play' }))
    const rs = JSON.parse(pg.uno(d, `select resumen::text from public.sim_recibos where session_id = ${L(P1)} and command_id = ${L(r.cuerpo?.recibo?.command_id ?? u(0))}`) || 'null')
    dets.push({ http: r.http, det: rs?.detencion ?? null })
  }
  const est1 = JSON.parse(pg.uno(d, `select estado::text from public.sim_sessions where id = ${L(P1)}`))
  const nb = Number(pg.uno(d, `select count(*) from public.sim_eventos where session_id = ${L(P1)} and tipo = 'breach'`))
  const CA = await importa('lib/motor/cartera.mjs')
  const eq = est1 ? CA.equity_µ(CA.deserializa(JSON.stringify(est1))) : null
  ver('control: la perdida ocurrio (posicion abierta, cursor pasado la caida, equity ≤ 20.001 de 100.000)', est1?.posiciones?.length === 1 && est1?.reloj?.cursor >= m(120) && eq != null && eq <= 20_001_000_000n, tx({ pos: est1?.posiciones?.length, cursor: est1?.reloj?.cursor, eq: String(eq) }))
  ver('control positivo: el mismo criterio caza el breach del reto de arriba', resumen?.detencion?.motivo === 'breach', tx(resumen?.detencion))
  oraculo('DETS', 'practica sin limites: cuatro avances por la caida, ninguna detencion de breach, sin evento breach y la sesion activa', dets.every(x => x.http === 200 && x.det?.motivo !== 'breach') && nb === 0 && est1?.estado === 'activo', tx({ dets, nb, estado: est1?.estado }))
} finally { pg.cierra() }
fin()
