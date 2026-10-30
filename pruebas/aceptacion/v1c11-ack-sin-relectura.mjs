/**
 * V1C11 · LO CONFIRMADO POR EL SERVIDOR ACABA VISIBLE AUNQUE FALLE LA RELECTURA (PSIMM1-01 de Astra, ALTA; orden 1-175 del
 * CTO). Escrita ANTES que el arreglo (en d3fa792: en rojo). La reproduccion de Astra: revisiones-suite/2026-10-30-psimm1-
 * evidencias/propia-ack-sin-estado.mjs y propias-pg.mjs («ACK confirmado y GET estado 503»).
 * La regla del CTO: todo lo confirmado por el servidor tiene que acabar visible. Si la relectura falla, se reintenta. Si
 * sigue fallando, el Play se para con un aviso claro («hay una operación confirmada que no se ha podido mostrar: recarga») y
 * no se sigue operando hasta reconciliar con el servidor. Nunca una posicion viva invisible.
 *   A · abrir a mercado: el ACK llega (200, aplicado) y el GET de estado posterior falla de cuatro maneras (503, corte de
 *       red, 200 con la version de antes, 200 invalido). La posicion confirmada se ve; sale el aviso; la relectura se
 *       reintenta; guardado() no lo da por guardado; otra orden NO llega al servidor mientras no se reconcilia. Al volver
 *       la lectura, la siguiente orden reconcilia primero (pantalla = servidor, sin duplicar lo retenido) y se envia
 *   B · cerrar con la relectura caida: el cierre confirmado se ve (la posicion no sigue abierta en la pantalla), aviso
 *   C · el Play: el ACK de un avanzar con la relectura caida PARA el Play con el aviso; pulsar Play otra vez sin lectura no
 *       manda ningun avanzar; con la lectura de vuelta, reconcilia (el cursor de la pantalla = el del servidor) y sigue
 *   D · contra lib/servidor REAL y PostgreSQL desechable (montaje-v1 + sim-004b + sim-006): el ACK real de abrir con el GET
 *       de estado en 503: la posicion se ve y sale el aviso; con el GET de vuelta, pantalla = servidor
 *   Controles sanos (ver): con la lectura bien, confirmado, sin aviso y guardado; el doble rechaza una version vieja (409).
 * Transporte sintetico en A–C (un servidor en memoria que aplica cada comando y sube la version, como la RPC). Datos
 * inventados. Sin red.
 */
const { titulo, ver, oraculo, fin, importa, fuente, asienta } = await import('../lib.mjs')
const N = 34
const PA = await importa('lib/sim/v1/pantalla.js').catch(() => null)
if (!PA?.creaPantallaV1) { for (let i = 0; i < N; i++) oraculo('V1C11', `caso ${i}: sin lib/sim/v1/pantalla.js no se puede`, false, 'no esta'); fin() }
const tx = x => JSON.stringify(x, (k, v) => (typeof v === 'bigint' ? `${v}n` : v))
const web = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) } }
const AVISO = /operación confirmada que no se ha podido mostrar: recarga/i
const T0 = 1736121900
const ticks = x => (x == null ? null : String(Math.round(Number(x) * 1e5)))

// el servidor sintetico: aplica cada comando sobre su estado, sube la version y devuelve el ACK como la RPC (recibo con
// version_partida y version_resultante); el GET de estado falla segun `fallo` (null: bien)
function servidor() {
  const s = { version: 0, estado: { esquema: 'cartera@1', estado: 'activo', pares: ['EURUSD'], reloj: { cursor: T0 }, saldo_µ: '100000000000', posiciones: [], ordenes: [],
    cotizaciones: { EURUSD: { bid: '110000' } }, costes: { spread_ticks: { EURUSD: '3' } } } }
  const x = { s, fallo: null, falloTrasAck: null, gets: 0, comandos: [], seq: 0, conflictos: 0 }
  x.llama = async (ruta, { cuerpo: c }) => {
    if (ruta.endsWith('/tomar')) return { http: 200, cuerpo: { ok: true, testigo: 'ensayo' } }
    if (ruta.endsWith('/estado')) {
      x.gets++
      if (x.fallo === 'red') throw new Error('corte de red ficticio')
      if (x.fallo === '503') return { http: 503, cuerpo: { ok: false, motivo: 'no_disponible' } }
      if (x.fallo === '200_obsoleto') return { http: 200, cuerpo: { ok: true, version: 0, epoca: 1, estado: { ...structuredClone(s.estado), posiciones: [], ordenes: [] } } }
      if (x.fallo === '200_invalido') return { http: 200, cuerpo: { ok: true, version: 'no-es-un-numero', epoca: 1 } }
      return { http: 200, cuerpo: { ok: true, version: s.version, epoca: 1, estado: structuredClone(s.estado) } }
    }
    x.comandos.push({ tipo: c.tipo, id: c.id ?? null, version_esperada: c.version_esperada })
    if (c.version_esperada !== s.version) { x.conflictos++; return { http: 409, cuerpo: { ok: false, motivo: 'conflicto', version: s.version } } }
    const partida = s.version, e = s.estado
    let extra = {}
    if (c.tipo === 'abrir' && c.orden === 'mercado') e.posiciones.push({ id: 'p' + ++x.seq, par: 'EURUSD', lado: c.lado, entrada: '110003', lotes_c: String(Math.round(Number(c.lotes) * 100)), sl: ticks(c.sl), tp: ticks(c.tp) })
    else if (c.tipo === 'abrir') e.ordenes.push({ id: 'o' + ++x.seq, par: 'EURUSD', lado: c.lado, tipo: c.orden, precio: ticks(c.precio), lotes_c: String(Math.round(Number(c.lotes) * 100)), sl: ticks(c.sl), tp: ticks(c.tp) })
    else if (c.tipo === 'cerrar') e.posiciones = e.posiciones.filter(p => p.id !== c.id)
    else if (c.tipo === 'cancelar') e.ordenes = e.ordenes.filter(o => o.id !== c.id)
    else if (c.tipo === 'modificar') { for (const p of [...e.posiciones, ...e.ordenes]) if (p.id === c.id) { if ('sl' in c) p.sl = ticks(c.sl); if ('tp' in c) p.tp = ticks(c.tp) } }
    else if (c.tipo === 'avanzar') { e.reloj.cursor = c.hasta; extra = { alcanzado: c.hasta, cortado: false } }
    s.version++
    if (x.falloTrasAck !== null) x.fallo = x.falloTrasAck
    return { http: 200, cuerpo: { ok: true, version: s.version, recibo: { resultado: 'aceptado', version_partida: partida, version_resultante: s.version }, ...extra } }
  }
  return x
}
async function pantalla(x) {
  let n = 0
  const ps = { current: {} }, avisos = []
  const p = PA.creaPantallaV1({ sessionId: 'sesion-ficticia', sesion: {}, usuario: 'alumno-ficticio', nuevoId: () => `id-${++n}`, local: web(), almacenSesion: web(), pairState: ps, llama: x.llama, avisa: a => avisos.push(a), plazoMs: 2000 })
  await p.arranca()
  return { p, ps, avisos, pos: () => (ps.current['EUR/USD']?.positions ?? []).map(q => q.id) }
}
const ABRIR = { tipo: 'abrir', carga: { par: 'EURUSD', lado: 'BUY', orden: 'mercado', lotes: '1', sl: '1.09' } }

titulo('controles sanos')
{
  const x = servidor(), v = await pantalla(x)
  const r = await v.p.envia(ABRIR)
  ver('control: con la lectura bien, abrir se confirma, la pantalla tiene la posicion del servidor (p1), sin avisos y guardado', r.conclusion === 'confirmado' && tx(v.pos()) === tx(['p1']) && v.avisos.length === 0 && v.p.cliente.guardado() === true, tx({ r: r.conclusion, pos: v.pos(), avisos: v.avisos }))
  const viejo = await x.llama('/api/sim/comando', { cuerpo: { tipo: 'abrir', orden: 'mercado', par: 'EURUSD', lado: 'BUY', lotes: '1', version_esperada: 0 } })
  ver('control: el doble rechaza una version vieja (409 conflicto), como la RPC', viejo.http === 409 && x.s.estado.posiciones.length === 1, tx(viejo))
}

titulo('A · abrir a mercado: ACK confirmado y la relectura falla')
for (const fallo of ['503', 'red', '200_obsoleto', '200_invalido']) {
  const x = servidor(), v = await pantalla(x)
  x.falloTrasAck = fallo
  const gets0 = x.gets
  const r = await v.p.envia(ABRIR)
  const tras = { conclusion: r.conclusion, pos: v.pos(), servidor: x.s.estado.posiciones.map(p => p.id), version: v.p.cliente.estado?.version, versionServidor: x.s.version, gets: x.gets - gets0, avisos: [...v.avisos] }
  oraculo('V1C11', `A (${fallo}) · la posicion confirmada por el servidor se ve en la pantalla (nunca una posicion viva invisible)`, tx(tras.servidor) === tx(['p1']) && tras.pos.length === 1, tx(tras))
  oraculo('V1C11', `A (${fallo}) · sale el aviso «hay una operación confirmada que no se ha podido mostrar: recarga»`, tras.avisos.some(a => AVISO.test(a)), tx(tras.avisos))
  oraculo('V1C11', `A (${fallo}) · la relectura se reintenta (mas de un GET de estado tras el ACK)`, tras.gets >= 2, tx(tras.gets))
  oraculo('V1C11', `A (${fallo}) · guardado() no la da por guardada mientras la pantalla no tiene la version confirmada`, v.p.cliente.guardado() === false, tx({ guardado: v.p.cliente.guardado(), version: tras.version, versionServidor: tras.versionServidor }))
  const c0 = x.comandos.length
  const r2 = await v.p.envia(ABRIR)
  oraculo('V1C11', `A (${fallo}) · sin reconciliar no se sigue operando: otra orden NO llega al servidor ni se confirma, y la pantalla sigue con la posicion`, x.comandos.length === c0 && r2.conclusion !== 'confirmado' && v.pos().length === 1 && x.s.estado.posiciones.length === 1, tx({ r2: r2.conclusion, enviados: x.comandos.length - c0, pos: v.pos(), conflictos: x.conflictos }))
  x.fallo = null; x.falloTrasAck = null
  const r3 = await v.p.envia(ABRIR)
  oraculo('V1C11', `A (${fallo}) · con la lectura de vuelta, la siguiente orden reconcilia y se envia: pantalla = servidor (p1, p2), sin duplicar lo retenido, guardado`, r3.conclusion === 'confirmado' && tx(v.pos()) === tx(['p1', 'p2']) && tx(x.s.estado.posiciones.map(p => p.id)) === tx(['p1', 'p2']) && v.p.cliente.estado.version === x.s.version && v.p.cliente.guardado() === true && x.conflictos === 0, tx({ r3: r3.conclusion, pos: v.pos(), conflictos: x.conflictos }))
}

titulo('B · cerrar: ACK confirmado y la relectura cae')
{
  const x = servidor(), v = await pantalla(x)
  await v.p.envia(ABRIR)
  ver('control: la posicion p1 abierta y confirmada', tx(v.pos()) === tx(['p1']))
  x.falloTrasAck = '503'
  const r = await v.p.envia({ tipo: 'cerrar', carga: { id: 'p1' } })
  oraculo('V1C11', 'B · el cierre confirmado se ve: la posicion ya no esta abierta en la pantalla (como en el servidor)', x.s.estado.posiciones.length === 0 && v.pos().length === 0, tx({ r: r.conclusion, pos: v.pos() }))
  oraculo('V1C11', 'B · y sale el aviso de la operacion confirmada sin mostrar', v.avisos.some(a => AVISO.test(a)), tx(v.avisos))
  x.fallo = null; x.falloTrasAck = null
  const r2 = await v.p.envia(ABRIR)
  oraculo('V1C11', 'B · con la lectura de vuelta, reconcilia: pantalla = servidor (solo p2)', r2.conclusion === 'confirmado' && tx(v.pos()) === tx(['p2']) && v.p.cliente.estado.version === x.s.version, tx({ r2: r2.conclusion, pos: v.pos() }))
}

titulo('C · el Play: ACK de un avanzar con la relectura caida')
{
  const x = servidor(), v = await pantalla(x)
  const velas = Array.from({ length: 40 }, (_, i) => ({ time: T0 + 60 * (i + 1) }))
  let visto = null
  const engine = { candles: velas, seekToTime: t => { visto = t } }
  const av = v.p.avance({ engine: () => engine, par: () => 'EUR/USD' })
  x.falloTrasAck = '503'
  const r = await av.play({ lote: 1, hasta: T0 + 60 * 30 })
  const avanzar1 = x.comandos.filter(c => c.tipo === 'avanzar').length
  ver('control: el doble aplica el avanzar (el cursor del servidor pasa a la vela siguiente)', x.s.estado.reloj.cursor === T0 + 60, tx(x.s.estado.reloj.cursor))
  oraculo('V1C11', 'C · el Play se para tras el ACK sin relectura (no sigue pidiendo lotes: un solo avanzar) y no queda sonando', avanzar1 === 1 && av.reproduciendo === false && !['llegado', 'confirmado'].includes(r.conclusion), tx({ r: r.conclusion, avanzar1 }))
  oraculo('V1C11', 'C · con el aviso de la operacion confirmada sin mostrar', v.avisos.some(a => AVISO.test(a)), tx(v.avisos))
  const r2 = await av.play({ lote: 1, hasta: T0 + 60 * 30 })
  oraculo('V1C11', 'C · Play otra vez sin lectura: no manda ningun avanzar (no se sigue hasta reconciliar)', x.comandos.filter(c => c.tipo === 'avanzar').length === 1 && r2.conclusion !== 'llegado', tx({ r2: r2.conclusion, avanzar: x.comandos.filter(c => c.tipo === 'avanzar').length, conflictos: x.conflictos }))
  x.fallo = null; x.falloTrasAck = null
  const r3 = await av.play({ lote: 1, hasta: T0 + 60 * 3 })
  oraculo('V1C11', 'C · con la lectura de vuelta, el Play reconcilia y sigue: llega a su vela, cursor de la pantalla = el del servidor, sin conflictos',
    r3.conclusion === 'llegado' && v.p.cursor() === x.s.estado.reloj.cursor && v.p.cursor() === T0 + 180 && x.conflictos === 0, tx({ r3: r3.conclusion, cursor: v.p.cursor(), servidor: x.s.estado.reloj.cursor, visto, conflictos: x.conflictos }))
}

// D · el servidor real (lib/servidor) y PostgreSQL desechable
const { hayPostgres } = await import('../pg-ensayo.mjs')
if (!hayPostgres()) { ver('PostgreSQL 17 local: NO hay', false); fin() }
const { montajeV1, L, conUidDelMontaje } = await import('../montaje-v1.mjs')
const { cerrojoEnMemoria } = await import('../cerrojo-falso.mjs')
const P = await importa('lib/mercado/publicador-v1.mjs'), PV = await importa('lib/mercado/publica-v1.mjs')
const CR = await importa('lib/servidor/crear.mjs'), TO = await importa('lib/servidor/tomar.mjs'), SO = await importa('lib/servidor/sobre.mjs')
const CO = await importa('lib/servidor/comando.mjs'), ES = await importa('lib/servidor/estado.mjs')
const { minutoCerrado } = await importa('lib/mercado/calidad.mjs')
const HUECO = "v_guarda pg_catalog.text := '⟦HUECO guarda canonica⟧';"
const deEnsayo = t => { if (t.split(HUECO).length !== 2) throw new Error('el hueco no esta una vez'); return t.replace(HUECO, "v_guarda pg_catalog.text := 'montaje de ensayo (v1c11)';") }
const S4B = conUidDelMontaje(fuente('sql/sim-004b-contrato-v1.sql')), S6 = deEnsayo(fuente('sql/sim-006-tope-de-pasos.sql'))
const u = k => `00000000-0000-4000-8000-${String(k).padStart(12, '0')}`
const M0 = Date.parse('2025-01-06T00:00:00Z') / 1000
const PX = { AUDCAD: 0.9, AUDUSD: 0.65, EURUSD: 1.1, GBPJPY: 190.5, GBPUSD: 1.3, NZDUSD: 0.6, USDCAD: 1.37, USDCHF: 0.88, USDJPY: 150.2 }
function velasDe(par) { const o = []; for (let t = M0; t < M0 + 5 * 86400; t += 60) if (!minutoCerrado(t)) o.push({ time: t, open: PX[par], high: PX[par], low: PX[par], close: PX[par], volume: 1 }); return o }
function almacen() { const o = new Map(); return { async lee(r) { return o.has(r) ? Buffer.from(o.get(r)) : null }, async sube(r, b, { upsert = false } = {}) { if (!upsert && o.has(r)) return 'existe'; o.set(r, Buffer.from(b)); return 'ok' }, async borra(r) { o.delete(r) }, async lista() { return [] } } }
const mercado = almacen()
await PV.publica({ cerrojo: cerrojoEnMemoria(), almacen: mercado, planes: SO.PARES.map(par => P.planificaPar({ par, velas: velasDe(par), texto: '', anterior: null, diasAceptados: new Map() })), dueno: 'mercado-v1-publica', ahora: '2026-10-14T09:00:00.000Z' })
const AL = u(1)
let nId = 71000
const nuevoId = () => u(++nId)
const pg = montajeV1()
try {
  pg.arranca()
  const d = 'v1c11'
  pg.base(d)
  const a4 = pg.comoEjecutor(d, S4B), a6 = pg.comoEjecutor(d, S6)
  ver('control: sim-004b y sim-006 aplicadas', a4.ok && a6.ok, (a4.err + a6.err).slice(0, 200))
  pg.alumno(d, AL)
  const uno = q => pg.uno(d, q)
  const leeSesion = async id => { const t = uno(`select row_to_json(s)::text from public.sim_sessions s where id = ${L(id)}`); return t ? JSON.parse(t) : null }
  const puertos = { almacen: mercado, rpc: pg.rpc(d), parDeId: pg.parDeId(d), leeSesion, ahora: () => Date.parse('2026-10-14T10:00:00Z') }
  const orden = { '/api/sim/crear': CR.ordenCrear, '/api/sim/tomar': TO.ordenTomar, '/api/sim/comando': CO.ordenComando, '/api/sim/estado': ES.ordenEstado }
  let estadoCaido = false, caeTrasAbrir = false, gets = 0
  const llama = async (ruta, { cuerpo }) => {
    if (ruta === '/api/sim/estado') { gets++; if (estadoCaido) return { http: 503, cuerpo: { ok: false, motivo: 'no_disponible' } } }
    const r = await orden[ruta]({ actor: AL, cuerpo, puertos })
    if (r.http === 429 && r.cuerpo?.motivo === 'demasiados_avances') uno('update public.sim_alumnos set siguiente_avance_desde = null')
    if (ruta === '/api/sim/comando' && cuerpo.tipo === 'abrir' && r.http === 200 && caeTrasAbrir) estadoCaido = true
    return { http: r.http, cuerpo: r.cuerpo }
  }
  const sid = nuevoId()
  const c = await llama('/api/sim/crear', { cuerpo: { session_id: sid, command_id: nuevoId(), epoca: 1, name: 'S', pair: 'EUR/USD', timeframe: 'M1', date_from: '2025-01-06', date_to: '2025-12-31', capital: '100000', challenge_type: null } })
  ver('control: practica creada', c.http === 201, tx(c))
  uno("update public.sim_arrendamientos set hasta = now() - interval '1 minute'")
  const ps = { current: {} }, avisos = []
  const p = PA.creaPantallaV1({ sessionId: sid, sesion: await leeSesion(sid), usuario: AL, llama, nuevoId, local: web(), almacenSesion: web(), pairState: ps, avisa: a => avisos.push(a), plazoMs: 5000 })
  await p.arranca()
  await p.avance({ engine: () => ({ candles: velasDe('EURUSD').slice(0, 30), seekToTime: () => {} }), par: () => 'EUR/USD' }).irA(M0 + 6 * 60)
  ver('control: el cursor confirmado en el minuto 6', p.cursor() === M0 + 360, tx(p.cursor()))
  const real = async () => (await leeSesion(sid))
  caeTrasAbrir = true
  const g0 = gets
  const r = await p.envia({ tipo: 'abrir', carga: { par: 'EURUSD', lado: 'BUY', orden: 'mercado', lotes: '1', sl: '1.09', cotizadoEn: M0 + 360 } })
  const f = await real()
  const tras = { conclusion: r.conclusion, posUI: (ps.current['EUR/USD']?.positions ?? []).length, posServidor: f.estado.posiciones.length, versionUI: p.cliente.estado.version, versionServidor: Number(f.version), gets: gets - g0, avisos }
  oraculo('V1C11', 'D (PG real) · el ACK real de abrir con el GET de estado en 503: la posicion viva del servidor se ve en la pantalla', tras.posServidor === 1 && tras.posUI === 1, tx(tras))
  oraculo('V1C11', 'D (PG real) · sale el aviso y la relectura se reintenta', avisos.some(a => AVISO.test(a)) && tras.gets >= 2 && p.cliente.guardado() === false, tx(tras))
  estadoCaido = false; caeTrasAbrir = false
  const r2 = await p.envia({ tipo: 'modificar', carga: { id: f.estado.posiciones[0]?.id, sl: '1.08' } })
  const f2 = await real()
  const pv = ps.current['EUR/USD']?.positions ?? []
  oraculo('V1C11', 'D (PG real) · con el GET de vuelta, la siguiente orden reconcilia y se aplica: pantalla = servidor (1 posicion, SL 1,08, misma version)',
    r2.conclusion === 'confirmado' && pv.length === 1 && f2.estado.posiciones.length === 1 && pv[0].id === f2.estado.posiciones[0].id && pv[0].sl === 1.08 && p.cliente.estado.version === Number(f2.version) && p.cliente.guardado() === true,
    tx({ r2: r2.conclusion, pv: pv.map(q => [q.id, q.sl]), servidor: f2.estado.posiciones.map(q => [q.id, q.sl]), v: [p.cliente.estado.version, f2.version] }))
} finally { pg.cierra() }
fin()
