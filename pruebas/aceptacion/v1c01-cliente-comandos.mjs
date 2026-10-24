/**
 * V1C01 · EL CLIENTE DE COMANDOS DE LA PANTALLA V1 (etapa 2 del motor, pieza 1; diseño sim-004 d5/d6 y
 * diseño-persistencia § 4.4 y § 6). Escrita ANTES que el codigo (lib/sim/v1/cliente.js no existe: en rojo).
 *
 * Contra el SERVIDOR REAL (lib/servidor: crear, tomar, comando, estado) y las RPC reales en PostgreSQL desechable
 * (montaje-v1). Lo unico doble es el transporte (`llama`), para perder respuestas y colgar peticiones. Datos inventados.
 *   A · toma el escritor y guarda el testigo en sessionStorage; lee el estado confirmado (version 0)
 *   B · un comando: sale de la cola con su recibo; la version y el estado son los del servidor; «guardado»
 *   C · respuesta PERDIDA tras confirmar: el comando se queda en la cola (incierto); al recuperar se reenvia la MISMA
 *       clave y la RPC da el recibo repetido: UNA posicion, una sola comision
 *   D · respuesta perdida ANTES de llegar: el reenvio de la misma clave lo ejecuta una vez
 *   E · la cola sobrevive a recargar: otro cliente con el mismo localStorage la recupera y la confirma
 *   F · una peticion colgada: al vencer el plazo, incierto (nunca congelado); se resuelve antes de seguir
 *   G · una sola peticion en vuelo: dos ordenes seguidas llegan en orden, la segunda con la version de la primera
 *   H · 409 conflicto (otra escritura cambio la version): sale de la cola sin efectos, relee el estado
 *   I · 409 comando_caducado de un avance cuyo recibo ya se sobrescribio: carga el estado confirmado y vacia la cola
 *   J · 429 demasiados_avances: reintento con la MISMA clave al vencer
 *   K · otra pestaña toma el escritor (forzar): 409 sin_arrendamiento → «usar aqui»; con toma({forzar}) vuelve a escribir
 *   L · una respuesta vieja (snapshot de version menor) no rebaja el estado
 */
import { titulo, ver, oraculo, fin, importa } from '../lib.mjs'
import { hayPostgres } from '../pg-ensayo.mjs'
import { montajeV1, L } from '../montaje-v1.mjs'
import { cerrojoEnMemoria } from '../cerrojo-falso.mjs'
const C = await importa('lib/sim/v1/cliente.js').catch(() => null)
const N = 26
if (!C?.creaCliente) { for (let i = 0; i < N; i++) oraculo('V1C01', `caso ${i}: sin lib/sim/v1/cliente.js no se puede`, false, 'no esta'); fin() }
if (!hayPostgres()) { ver('PostgreSQL 17 local: NO hay', false); fin() }
const P = await importa('lib/mercado/publicador-v1.mjs'), PV = await importa('lib/mercado/publica-v1.mjs')
const { minutoCerrado } = await importa('lib/mercado/calidad.mjs')
const CR = await importa('lib/servidor/crear.mjs'), TO = await importa('lib/servidor/tomar.mjs'), SO = await importa('lib/servidor/sobre.mjs')
const CO = await importa('lib/servidor/comando.mjs'), ES = await importa('lib/servidor/estado.mjs')
const u = k => `00000000-0000-4000-8000-${String(k).padStart(12, '0')}`
const U = iso => Date.parse(iso) / 1000
const M0 = U('2025-01-06T00:00:00Z'), m = k => M0 + 60 * k
const tx = x => JSON.stringify(x, (k, v) => (typeof v === 'bigint' ? `${v}n` : v))
const PX = { AUDCAD: 0.9, AUDUSD: 0.65, EURUSD: 1.1, GBPJPY: 190.5, GBPUSD: 1.3, NZDUSD: 0.6, USDCAD: 1.37, USDCHF: 0.88, USDJPY: 150.2 }
function velas(par) { const o = []; for (let t = U('2025-01-06T00:00:00Z'); t < U('2025-01-11T00:00:00Z'); t += 60) if (!minutoCerrado(t)) { const p = PX[par]; o.push({ time: t, open: p, high: p, low: p, close: p, volume: 1 }) } return o }
function almacen() { const o = new Map(); return { o, async lee(r) { return o.has(r) ? Buffer.from(o.get(r)) : null }, async sube(r, b, { upsert = false } = {}) { if (!upsert && o.has(r)) return 'existe'; o.set(r, Buffer.from(b)); return 'ok' }, async borra(r) { o.delete(r) }, async lista() { return [] } } }
const mercado = almacen()
await PV.publica({ cerrojo: cerrojoEnMemoria(), almacen: mercado, planes: SO.PARES.map(par => P.planificaPar({ par, velas: velas(par), texto: '', anterior: null, diasAceptados: new Map() })), dueno: 'mercado-v1-publica', ahora: '2026-10-14T09:00:00.000Z' })
const almacenWeb = () => { const o = new Map(); return { o, getItem: k => (o.has(k) ? o.get(k) : null), setItem: (k, v) => o.set(k, String(v)), removeItem: k => o.delete(k) } }
const AL = u(1), SID = u(1001)
let nId = 50000
const nuevoId = () => u(++nId)

const pg = montajeV1()
try {
  pg.arranca()
  // el servidor real detras de un transporte doble: { pierde: 'antes'|'despues', cuelga, tras429 }
  function servidor(d) {
    pg.base(d); pg.alumno(d, AL)
    const leeSesion = async id => { const t = pg.uno(d, `select row_to_json(s)::text from public.sim_sessions s where id = ${L(id)}`); return t ? JSON.parse(t) : null }
    const puertos = { almacen: mercado, rpc: pg.rpc(d), leeSesion, ahora: () => Date.parse('2026-10-14T10:00:00Z') }
    const fallos = []   // el siguiente fallo que se aplica a la siguiente llamada que case
    const vistos = []
    const orden = { '/api/sim/tomar': TO.ordenTomar, '/api/sim/comando': CO.ordenComando, '/api/sim/estado': ES.ordenEstado }
    async function llama(ruta, { metodo = 'POST', cuerpo } = {}) {
      vistos.push({ ruta, tipo: cuerpo?.tipo ?? null, command_id: cuerpo?.command_id ?? null, version_esperada: cuerpo?.version_esperada ?? null })
      const f = fallos.length && (!fallos[0].ruta || fallos[0].ruta === ruta) && (!fallos[0].tipo || fallos[0].tipo === cuerpo?.tipo) ? fallos.shift() : null
      if (f?.pierde === 'antes') throw new Error('red: la peticion no llego')
      if (f?.cuelga) return new Promise(() => {})
      const r = await orden[ruta]({ actor: AL, cuerpo, puertos })
      if (r.http === 429) pg.uno(d, 'update public.sim_alumnos set siguiente_avance_desde = null')   // pasa el tiempo
      if (f?.pierde === 'despues') throw new Error('red: la respuesta se perdio')
      return { http: r.http, cuerpo: r.cuerpo }
    }
    return { llama, fallos, vistos, puertos, leeSesion, sinTasa: () => pg.uno(d, 'update public.sim_alumnos set siguiente_avance_desde = null'),
      conTasa: () => pg.uno(d, "update public.sim_alumnos set siguiente_avance_desde = clock_timestamp() + interval '1 hour'"),
      fila: () => JSON.parse(pg.uno(d, `select row_to_json(s)::text from public.sim_sessions s where id = ${L(SID)}`)),
      cuenta: sql => Number(pg.uno(d, sql)) }
  }
  const crea = async sv => (await CR.ordenCrear({ actor: AL, cuerpo: { session_id: SID, command_id: u(2001), epoca: 1, name: 'S', pair: 'EUR/USD', timeframe: 'H1', date_from: '2025-01-06', date_to: '2025-12-31', capital: '100000', challenge_type: null }, puertos: sv.puertos })).http
  const cliente = (sv, extra = {}) => C.creaCliente({ sessionId: SID, usuario: AL, epoca: 1, llama: sv.llama, local: extra.local ?? almacenWeb(), sesion: extra.sesion ?? almacenWeb(), nuevoId, plazoMs: extra.plazoMs ?? 2000, espera429Ms: 5, ...extra })
  const cursorDe = c => c.estado?.estado?.reloj?.cursor ?? c.estado?.estado?.motor?.reloj?.cursor
  const posiciones = sv => sv.fila().estado.posiciones?.length ?? 0

  titulo('A–B · tomar, leer y un comando')
  const s1 = servidor('c1')
  ver('control: sesion creada', (await crea(s1)) === 201)
  const ses1 = almacenWeb(), c1 = cliente(s1, { sesion: ses1 })
  const t = await c1.toma()
  oraculo('V1C01', 'A · toma el escritor: testigo guardado en sessionStorage, no en localStorage', t?.ok === true && [...ses1.o.values()].some(v => v.length === 64), tx(t))
  await c1.leeEstado()
  oraculo('V1C01', 'A · el estado confirmado es el del servidor (version 0)', c1.estado?.version === 0 && c1.estado?.estado?.esquema != null, tx({ v: c1.estado?.version }))
  s1.sinTasa()
  const r1 = await c1.envia('avanzar', { hasta: m(5), motivo: 'paso' })
  oraculo('V1C01', 'B · un avanzar: confirmado, sale de la cola, la version y el cursor son los del servidor', r1?.conclusion === 'confirmado' && c1.pendientes().length === 0 && c1.estado?.version === Number(s1.fila().version) && cursorDe(c1) === m(5), tx({ r1: r1?.conclusion, v: c1.estado?.version, cursor: cursorDe(c1) }))
  const r2 = await c1.envia('abrir', { par: 'EURUSD', lado: 'BUY', orden: 'mercado', lotes: '1', cotizadoEn: cursorDe(c1) })
  oraculo('V1C01', 'B · abrir a mercado: confirmado con su recibo, una posicion en el estado instalado; guardado', r2?.conclusion === 'confirmado' && c1.estado?.estado?.posiciones?.length === 1 && c1.guardado() === true, tx({ c: r2?.conclusion, motivo: r2?.motivo, pos: c1.estado?.estado?.posiciones?.length }))

  titulo('C · respuesta perdida tras confirmar')
  s1.fallos.push({ ruta: '/api/sim/comando', pierde: 'despues' })
  const r3 = await c1.envia('abrir', { par: 'EURUSD', lado: 'SELL', orden: 'mercado', lotes: '1', cotizadoEn: cursorDe(c1) })
  oraculo('V1C01', 'C · la respuesta se perdio: incierto, el comando sigue en la cola y no hay «guardado»', r3?.conclusion === 'incierto' && c1.pendientes().length === 1 && c1.guardado() === false, tx({ c: r3?.conclusion, p: c1.pendientes().length }))
  const id3 = c1.pendientes()[0]?.command_id
  const rec = await c1.recupera()
  const reenvios = s1.vistos.filter(x => x.command_id === id3).length
  oraculo('V1C01', 'C · al recuperar reenvia la MISMA clave: recibo repetido, cola vacia, guardado', c1.pendientes().length === 0 && reenvios === 2 && c1.guardado() === true, tx({ rec, reenvios }))
  oraculo('V1C01', 'C · en la base: dos posiciones (BUY y SELL), no tres; un recibo por clave', posiciones(s1) === 2 && s1.cuenta(`select count(*) from public.sim_recibos where command_id = ${L(id3)}`) === 1, tx({ pos: posiciones(s1) }))

  titulo('D · respuesta perdida antes de llegar')
  s1.fallos.push({ ruta: '/api/sim/comando', pierde: 'antes' })
  const r4 = await c1.envia('cerrar', { id: 'p1' })
  const id4 = c1.pendientes()[0]?.command_id
  oraculo('V1C01', 'D · no llego: incierto y en la cola', r4?.conclusion === 'incierto' && c1.pendientes().length === 1, tx(r4?.conclusion))
  await c1.recupera()
  oraculo('V1C01', 'D · el reenvio con la misma clave lo ejecuta una vez: queda una posicion', c1.pendientes().length === 0 && posiciones(s1) === 1 && s1.cuenta(`select count(*) from public.sim_recibos where command_id = ${L(id4)}`) === 1, tx({ pos: posiciones(s1) }))

  titulo('E · la cola sobrevive a recargar')
  const loc = almacenWeb(), ses = almacenWeb()
  const c2 = cliente(s1, { local: loc, sesion: ses }); await c2.toma({ forzar: true }); await c2.leeEstado()
  s1.fallos.push({ ruta: '/api/sim/comando', pierde: 'antes' })
  await c2.envia('cerrar', { id: 'p2' })
  const c2b = cliente(s1, { local: loc, sesion: ses })   // la misma pestaña, recargada
  oraculo('V1C01', 'E · tras recargar, la cola esta (localStorage usuario/sesion/epoca) con su clave', c2b.pendientes().length === 1 && c2b.pendientes()[0].command_id === c2.pendientes()[0]?.command_id, tx(c2b.pendientes()))
  await c2b.leeEstado(); await c2b.recupera()
  oraculo('V1C01', 'E · la recupera y la confirma: sin posiciones', c2b.pendientes().length === 0 && posiciones(s1) === 0, tx({ pos: posiciones(s1) }))

  titulo('F · una peticion colgada: plazo, incierto, y se resuelve antes de seguir')
  s1.fallos.push({ ruta: '/api/sim/comando', cuelga: true })
  const t0 = Date.now()
  const r5 = await c2b.envia('abrir', { par: 'EURUSD', lado: 'BUY', orden: 'mercado', lotes: '1', cotizadoEn: cursorDe(c2b) })
  oraculo('V1C01', 'F · al vencer el plazo: incierto (no se queda esperando para siempre)', r5?.conclusion === 'incierto' && Date.now() - t0 < 6000 && c2b.pendientes().length === 1, tx({ c: r5?.conclusion, ms: Date.now() - t0 }))
  const id5 = c2b.pendientes()[0]?.command_id
  const r6 = await c2b.envia('abrir', { par: 'EURUSD', lado: 'SELL', orden: 'mercado', lotes: '1', cotizadoEn: cursorDe(c2b) })
  const orden56 = s1.vistos.filter(x => x.ruta === '/api/sim/comando').map(x => x.command_id)
  oraculo('V1C01', 'F · la siguiente orden resuelve antes el incierto (reenvio de su clave) y despues va ella', orden56.indexOf(id5) < orden56.lastIndexOf(id5) && orden56.lastIndexOf(id5) < orden56.length - 1 && r6?.conclusion === 'confirmado' && posiciones(s1) === 2, tx({ r6: r6?.conclusion, pos: posiciones(s1) }))

  titulo('G · una sola peticion en vuelo')
  const antes = s1.vistos.length
  const [g1, g2] = await Promise.all([c2b.envia('cerrar', { id: c2b.estado.estado.posiciones[0].id }), c2b.envia('cerrar', { id: c2b.estado.estado.posiciones[1].id })])
  const gv = s1.vistos.slice(antes).filter(x => x.ruta === '/api/sim/comando')
  oraculo('V1C01', 'G · dos ordenes seguidas: van en orden y la segunda con la version que dejo la primera', g1?.conclusion === 'confirmado' && g2?.conclusion === 'confirmado' && gv.length === 2 && gv[1].version_esperada === gv[0].version_esperada + 1 && posiciones(s1) === 0, tx({ g1: g1?.conclusion, g2: g2?.conclusion, gv }))

  titulo('H · 409 conflicto')
  // otra escritura (el servidor, con el testigo vigente de c2b) sube la version por detras del cliente
  s1.sinTasa()
  const otro = await CO.ordenComando({ actor: AL, cuerpo: { session_id: SID, command_id: nuevoId(), tipo: 'avanzar', epoca: 1, version_esperada: Number(s1.fila().version), cliente_id: c2b.clienteId, testigo: c2b.testigo(), hasta: m(30), motivo: 'paso' }, puertos: s1.puertos })
  ver('control: la otra escritura confirmo', otro.http === 200, tx(otro.cuerpo))
  const r7 = await c2b.envia('abrir', { par: 'EURUSD', lado: 'BUY', orden: 'mercado', lotes: '1', cotizadoEn: cursorDe(c2b) })
  oraculo('V1C01', 'H · conflicto: sale de la cola sin efectos y relee el estado (version y cursor nuevos)', r7?.conclusion === 'conflicto' && c2b.pendientes().length === 0 && posiciones(s1) === 0 && c2b.estado?.version === Number(s1.fila().version) && cursorDe(c2b) === m(30), tx({ c: r7?.conclusion, v: c2b.estado?.version, cursor: cursorDe(c2b) }))

  titulo('I · 409 comando_caducado')
  s1.sinTasa()
  s1.fallos.push({ ruta: '/api/sim/comando', tipo: 'avanzar', pierde: 'despues' })
  await c2b.envia('avanzar', { hasta: m(40), motivo: 'paso' })      // confirmado en la base; la respuesta se pierde
  s1.sinTasa()
  await CO.ordenComando({ actor: AL, cuerpo: { session_id: SID, command_id: nuevoId(), tipo: 'avanzar', epoca: 1, version_esperada: Number(s1.fila().version), cliente_id: c2b.clienteId, testigo: c2b.testigo(), hasta: m(50), motivo: 'paso' }, puertos: s1.puertos })
  s1.sinTasa()
  const r8 = await c2b.recupera()
  oraculo('V1C01', 'I · el reenvio del avance cuyo recibo se sobrescribio: comando_caducado → estado confirmado (cursor 00:50) y cola vacia', c2b.pendientes().length === 0 && cursorDe(c2b) === m(50) && c2b.estado?.version === Number(s1.fila().version), tx({ r8, cursor: cursorDe(c2b) }))

  titulo('J · 429 demasiados_avances')
  s1.conTasa()   // el siguiente avance del alumno, mas tarde: 429 (el transporte doble hace pasar el tiempo tras el 429)
  const r9 = await c2b.envia('avanzar', { hasta: m(55), motivo: 'paso' })
  const j = s1.vistos.filter(x => x.ruta === '/api/sim/comando').slice(-2)
  oraculo('V1C01', 'J · 429: reintenta con la MISMA clave al vencer y confirma', r9?.conclusion === 'confirmado' && j.length === 2 && j[0].command_id === j[1].command_id && cursorDe(c2b) === m(55), tx({ c: r9?.conclusion, j }))

  titulo('K · otra pestaña toma el escritor')
  const c3 = cliente(s1); await c3.toma({ forzar: true }); await c3.leeEstado()
  const r10 = await c2b.envia('abrir', { par: 'EURUSD', lado: 'BUY', orden: 'mercado', lotes: '1', cotizadoEn: cursorDe(c2b) })
  oraculo('V1C01', 'K · la pestaña vieja recibe sin_arrendamiento: «usar aqui», sin efectos y sin cola', r10?.conclusion === 'usar_aqui' && c2b.pendientes().length === 0 && posiciones(s1) === 0, tx(r10))
  const tk = await c2b.toma({ forzar: true })
  const r11 = await c2b.envia('abrir', { par: 'EURUSD', lado: 'BUY', orden: 'mercado', lotes: '1', cotizadoEn: cursorDe(c2b) })
  oraculo('V1C01', 'K · con «usar aqui» (forzar) vuelve a escribir', tk?.ok === true && r11?.conclusion === 'confirmado' && posiciones(s1) === 1, tx({ tk, r11: r11?.conclusion }))

  titulo('L · una respuesta vieja no rebaja el estado')
  const vAntes = c2b.estado.version
  c2b.instala({ version: vAntes - 3, epoca: 1, estado: { esquema: 'viejo' } })
  oraculo('V1C01', 'L · un snapshot de version menor no se instala', c2b.estado.version === vAntes && c2b.estado.estado.esquema !== 'viejo')
  oraculo('V1C01', 'L · ni uno de la misma version', (c2b.instala({ version: vAntes, epoca: 1, estado: { esquema: 'igual' } }), c2b.estado.estado.esquema !== 'igual'))

  titulo('M · respuestas de servicio')
  const sv503 = { llama: async () => ({ http: 503, cuerpo: { ok: false, http: 503, motivo: 'mantenimiento' } }) }
  const c5 = C.creaCliente({ sessionId: SID, usuario: AL, epoca: 1, llama: sv503.llama, local: almacenWeb(), sesion: almacenWeb(), nuevoId, plazoMs: 500 })
  const r12 = await c5.envia('avanzar', { hasta: m(60), motivo: 'paso' })
  oraculo('V1C01', 'M · 503 mantenimiento: «mantenimiento», sin cola', r12?.conclusion === 'mantenimiento' && c5.pendientes().length === 0, tx(r12))
  for (const [http, motivo, conclusion] of [[410, 'sesion_borrada', 'borrada'], [426, 'actualizar_cliente', 'actualizar'], [403, 'sin_acceso', 'sin_acceso']]) {
    const c6 = C.creaCliente({ sessionId: SID, usuario: AL, epoca: 1, llama: async () => ({ http, cuerpo: { ok: false, http, motivo } }), local: almacenWeb(), sesion: almacenWeb(), nuevoId, plazoMs: 500 })
    const r = await c6.envia('cerrar', { id: 'p1' })
    oraculo('V1C01', `M · ${http} ${motivo}: «${conclusion}», sin cola`, r?.conclusion === conclusion && c6.pendientes().length === 0, tx(r))
  }
  const c7 = C.creaCliente({ sessionId: SID, usuario: AL, epoca: 1, llama: async () => ({ http: 500, cuerpo: { ok: false, http: 500, motivo: 'error_interno' } }), local: almacenWeb(), sesion: almacenWeb(), nuevoId, plazoMs: 500 })
  const r13 = await c7.envia('cerrar', { id: 'p1' })
  oraculo('V1C01', 'M · 500 error_interno: incierto (pudo confirmarse): se queda en la cola para reenviar la misma clave', r13?.conclusion === 'incierto' && c7.pendientes().length === 1, tx(r13))
} finally { pg.cierra() }
fin()
