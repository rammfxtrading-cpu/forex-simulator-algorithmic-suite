/**
 * OD01 · BORRAR EL DIBUJO DE POSICION CANCELA LA ORDEN PENDIENTE QUE NACIO DE EL (orden 1-136 del CTO; la queja de Ramon:
 * «eliminé el trade… solo se ha borrado el punto de entrada»). Escrita ANTES que el codigo (en f5b713b y en d50d028: en
 * rojo). La prueba de Chrome es pruebas/navegador/od02-borrar-dibujo-cancela-orden.mjs (con el turno).
 * El enlace: la orden creada desde el dibujo (LongShortModal → OrderModal → Colocar) lleva el id del dibujo (dibujo), en
 * memoria (las pendientes no se guardan en f5b713b). Al borrar dibujos, useTradingActions.cancelaOrdenesDeDibujos(ids)
 * cancela por el camino de hoy (cancelLimitOrder) las pendientes de esos dibujos. Una POSICION abierta desde el dibujo no
 * se cierra: cerrar sigue siendo una accion explicita.
 *   A · bandera APAGADA (banco del motor, como hoy): la pendiente del dibujo se cancela; la de otro dibujo y la del menu
 *       siguen; la llenada (posicion) no se cierra
 *   B · bandera ENCENDIDA (lib/servidor REAL + PostgreSQL desechable): cancelar = el comando cancelar, optimista (con la
 *       peticion retenida ya no se ve) y confirmado por el servidor; si el servidor lo rechaza, la orden vuelve con el
 *       aviso; borrar el dibujo con el abrir aun en vuelo la cancela igual; la llenada no se cierra (ni cancelar ni cerrar)
 *   C · el cableado de la pagina (_SessionInner y useDrawingTools): el id del dibujo viaja hasta la orden, y los borrados
 *       de dibujos (Supr, papelera, menu, grupo, borrar todo) avisan con sus ids
 *   S · con la bandera encendida: checkSLTP, checkLimitOrders, checkChallengeBreach, rutaComun y cierreEnVela no se llaman
 * Datos inventados.
 */
import { register } from 'node:module'
register('../espias-vela.mjs', import.meta.url)
const { titulo, ver, oraculo, fin, importa, fuente, asienta, escenario, sesionSim, vela } = await import('../lib.mjs')
const { banco, velasEnStorage } = await import('../banco-motor.mjs')
const tx = x => JSON.stringify(x, (k, v) => (typeof v === 'bigint' ? `${v}n` : v))
const N = 10
const UTA = fuente('components/useTradingActions.js')
if (!/cancelaOrdenesDeDibujos/.test(UTA)) { for (let i = 0; i < N; i++) oraculo('OD01', `caso ${i}: sin useTradingActions.cancelaOrdenesDeDibujos borrar el dibujo no cancela su orden`, false, 'no esta'); fin() }

titulo('A · bandera apagada: la pendiente del dibujo se cancela; la llenada no se cierra')
{
  const T = Date.parse('2025-03-03T10:00:00Z') / 1000
  const ses = sesionSim()
  escenario({ sim_sessions: [ses] })
  velasEnStorage('EUR/USD', [vela(T, 1.1020, 1.1022, 1.1018, 1.1020), vela(T + 60, 1.1010, 1.1015, 1.0995, 1.1005), vela(T + 120, 1.1005, 1.1008, 1.1001, 1.1004), vela(T + 180, 1.1004, 1.1006, 1.1002, 1.1004)], [2024], { tramoAbierto: true })
  const b = await banco({ sesion: ses })
  const SI = fuente('components/_SessionInner.js')
  // el onConfirm del OrderModal (limit) de hoy, con el enlace al dibujo: la linea tiene que seguir en _SessionInner
  const LINEA = "const order={...posData,id:`L${Date.now()}`,pair:orderModal.pair,side:orderModal.side==='BUY'?'BUY_LIMIT':'SELL_LIMIT',entry:entradaTick,createdTime:currentTime,dibujo:orderModal.dibujo??null}"
  ver('control: la linea del alta de la limit del OrderModal (con su dibujo) sigue en _SessionInner', SI.includes(LINEA))
  const alta = (id, side, entry, dibujo) => { const ps = b.ps(); const order = { lots: 1, sl: side === 'BUY' ? entry - 0.001 : entry + 0.001, tp: side === 'BUY' ? entry + 0.002 : entry - 0.002, slPips: 10, tpPips: 20, id, pair: 'EUR/USD', side: side === 'BUY' ? 'BUY_LIMIT' : 'SELL_LIMIT', entry, createdTime: b.estado.currentTime, dibujo }; ps.orders = [...(ps.orders ?? []), order]; return order }
  alta('L1', 'BUY', 1.0950, 'D1'); alta('L2', 'SELL', 1.1100, 'D2'); alta('L3', 'BUY', 1.0940, null)
  const T1 = b.caja.valor.trading
  T1.cancelaOrdenesDeDibujos(['D1'])
  oraculo('OD01', 'A · borrar el dibujo D1 cancela SU pendiente; la del dibujo D2 y la del menu (sin dibujo) siguen', tx(b.ps().orders.map(o => o.id)) === tx(['L2', 'L3']), tx(b.ps().orders.map(o => [o.id, o.dibujo])))
  T1.cancelaOrdenesDeDibujos(['D9', 'otro'])
  oraculo('OD01', 'A · borrar dibujos sin orden no toca nada', b.ps().orders.length === 2)
  alta('L4', 'BUY', 1.1000, 'D4')
  await b.paso(1)
  const llenada = b.ps().positions.find(p => p.entry === 1.1)
  ver('control: la pendiente del dibujo D4 se lleno (posicion abierta en 1,1000)', !!llenada && !b.ps().orders.some(o => o.id === 'L4'), tx({ pos: b.ps().positions, ord: b.ps().orders.map(o => o.id) }))
  T1.cancelaOrdenesDeDibujos(['D4'])
  await b.repinta()
  oraculo('OD01', 'A · borrar el dibujo de una orden YA llenada no cierra su posicion (ni trade ni cambio)', b.ps().positions.some(p => p.id === llenada?.id && p.lots === 1) && b.ps().trades.length === 0, tx({ pos: b.ps().positions.length, tr: b.ps().trades.length }))
}

titulo('C · el cableado de la pagina')
{
  const SI = fuente('components/_SessionInner.js'), DT = fuente('components/useDrawingTools.js')
  // orden 1-137 (1-136 (2)): el modal del dibujo se abre por abreOrden (pausa al abrir con la bandera; la limit pasa tal
  // cual, con su dibujo: v1c10 L), ya no por setOrderModal directo
  oraculo('OD01', 'C · _SessionInner: el id del dibujo viaja del LongShortModal al OrderModal y a la orden (sin bandera: dibujo; con ella: en lo que se pinta, extra.dibujo)',
    SI.includes('abreOrden({side:posData.side,entry:posData.entry,pair:activePair,isLimit:true,...posData,dibujo:longShortModal.toolId})') && SI.includes('{entry:entradaTick,openTime:currentTime,dibujo:m.dibujo??null}') && SI.includes('dibujo:orderModal.dibujo??null}'))
  oraculo('OD01', 'C · los borrados de dibujos avisan con sus ids: useDrawingTools (Supr, papelera, menu, borrar todo, deshacer) y el grupo; la pagina cancela con cancelaOrdenesDeDibujos',
    /const removeSelected = useCallback\(\(\) => \{[^\n]*quitados\(/.test(DT) && /const removeToolById = useCallback\([^\n]*quitados\(/.test(DT) && /const removeAll {6}= useCallback\([^\n]*quitados\(/.test(DT)
    && /removeLineToolsById\(_toDelete\)[^\n]*\n[^\n]*alQuitar/.test(SI) && SI.includes('drawingHandlersRef.current.alQuitar=cancelaOrdenesDeDibujos'))
}

const { hayPostgres } = await import('../pg-ensayo.mjs')
if (!hayPostgres()) { ver('PostgreSQL 17 local: NO hay', false); fin() }
const HOOK = await importa('components/useSesionV1.js').catch(() => null)
if (!HOOK?.default) { for (let i = 0; i < 5; i++) oraculo('OD01', `B ${i}: sin components/useSesionV1.js no hay bandera v1`, false, 'no esta'); fin() }
const { montajeV1, L, conUidDelMontaje } = await import('../montaje-v1.mjs')
const { cerrojoEnMemoria } = await import('../cerrojo-falso.mjs')
const OR = await importa('lib/sim/v1/ordenes.js'), VI = await importa('lib/sim/v1/vista.js'), AV = await importa('lib/sim/avisos.js')
const P = await importa('lib/mercado/publicador-v1.mjs'), PV = await importa('lib/mercado/publica-v1.mjs')
const { minutoCerrado } = await importa('lib/mercado/calidad.mjs')
const CR = await importa('lib/servidor/crear.mjs'), TO = await importa('lib/servidor/tomar.mjs'), SO = await importa('lib/servidor/sobre.mjs')
const CO = await importa('lib/servidor/comando.mjs'), ES = await importa('lib/servidor/estado.mjs')
const HUECO = "v_guarda pg_catalog.text := '⟦HUECO guarda canonica⟧';"
const deEnsayo = t => { if (t.split(HUECO).length !== 2) throw new Error('el hueco no esta una vez'); return t.replace(HUECO, "v_guarda pg_catalog.text := 'montaje de ensayo (od01)';") }
const S4B = conUidDelMontaje(fuente('sql/sim-004b-contrato-v1.sql')), S6 = deEnsayo(fuente('sql/sim-006-tope-de-pasos.sql'))
const u = k => `00000000-0000-4000-8000-${String(k).padStart(12, '0')}`
const U = iso => Date.parse(iso) / 1000
const M0 = U('2025-01-06T00:00:00Z'), m = k => M0 + 60 * k
const PX = { AUDCAD: 0.9, AUDUSD: 0.65, EURUSD: 1.1, GBPJPY: 190.5, GBPUSD: 1.3, NZDUSD: 0.6, USDCAD: 1.37, USDCHF: 0.88, USDJPY: 150.2 }
// EURUSD 1,1; 1,09 del minuto 10 al 19 (llena una BUY LIMIT en 1,095); 1,1 desde el 20
const precioEn = (par, t) => (par === 'EURUSD' && t >= m(10) && t < m(20) ? 1.09 : PX[par])
function velasDe(par) { const o = []; for (let t = M0; t < U('2025-01-11T00:00:00Z'); t += 60) if (!minutoCerrado(t)) { const p = precioEn(par, t); o.push({ time: t, open: p, high: p, low: p, close: p, volume: 1 }) } return o }
function almacen() { const o = new Map(); return { o, async lee(r) { return o.has(r) ? Buffer.from(o.get(r)) : null }, async sube(r, b, { upsert = false } = {}) { if (!upsert && o.has(r)) return 'existe'; o.set(r, Buffer.from(b)); return 'ok' }, async borra(r) { o.delete(r) }, async lista() { return [] } } }
const mercado = almacen()
await PV.publica({ cerrojo: cerrojoEnMemoria(), almacen: mercado, planes: SO.PARES.map(par => P.planificaPar({ par, velas: velasDe(par), texto: '', anterior: null, diasAceptados: new Map() })), dueno: 'mercado-v1-publica', ahora: '2026-10-14T09:00:00.000Z' })
const web = () => { const o = new Map(); return { getItem: k => (o.has(k) ? o.get(k) : null), setItem: (k, v) => o.set(k, String(v)), removeItem: k => o.delete(k) } }
const AL = u(1)
let nId = 93000
const nuevoId = () => u(++nId)
const cuenta = {}
const espia = (n, f) => (typeof f !== 'function' ? f : (...a) => { cuenta[n] = (cuenta[n] ?? 0) + 1; return f(...a) })
const espias = () => ({ ...cuenta, ...(globalThis.__espiasVela ?? {}) })
const cero = () => { for (const k of Object.keys(cuenta)) delete cuenta[k]; globalThis.__espiasVela = {} }
const sinCierres = () => { const e = espias(); return ['checkSLTP', 'checkLimitOrders', 'checkChallengeBreach', 'rutaComun', 'cierreEnVela'].every(k => !e[k]) }
const textos = () => AV.avisos().map(a => a.texto)
escenario({})
velasEnStorage('EUR/USD', velasDe('EURUSD'), [2024], { tramoAbierto: true })

const pg = montajeV1()
try {
  pg.arranca()
  const d = 'od1'
  pg.base(d)
  const a4 = pg.comoEjecutor(d, S4B), a6 = pg.comoEjecutor(d, S6)
  ver('control: sim-004b y sim-006 aplicadas', a4.ok && a6.ok, (a4.err + a6.err).slice(0, 200))
  pg.alumno(d, AL)
  const uno = q => pg.uno(d, q)
  const leeSesion = async id => { const t = uno(`select row_to_json(s)::text from public.sim_sessions s where id = ${L(id)}`); return t ? JSON.parse(t) : null }
  const puertos = { almacen: mercado, rpc: pg.rpc(d), parDeId: pg.parDeId(d), leeSesion, ahora: () => Date.parse('2026-10-14T10:00:00Z') }
  const orden = { '/api/sim/crear': CR.ordenCrear, '/api/sim/tomar': TO.ordenTomar, '/api/sim/comando': CO.ordenComando, '/api/sim/estado': ES.ordenEstado }
  const enviados = []
  let rechazaCancelar = false, retiene = false
  const colas = []
  async function llama(ruta, { cuerpo }) {
    if (ruta === '/api/sim/comando' && cuerpo?.tipo !== 'avanzar') {
      enviados.push(cuerpo?.tipo)
      if (retiene) await new Promise(r => colas.push(r))
      if (rechazaCancelar && cuerpo?.tipo === 'cancelar') return { http: 409, cuerpo: { ok: false, motivo: 'conflicto' } }
    }
    const r = await orden[ruta]({ actor: AL, cuerpo, puertos })
    if (r.http === 429 && r.cuerpo?.motivo === 'demasiados_avances') uno('update public.sim_alumnos set siguiente_avance_desde = null')
    return { http: r.http, cuerpo: r.cuerpo }
  }
  const suelta = () => { retiene = false; for (const r of colas.splice(0)) r() }
  let nS = 6100
  async function pagina() {
    const sid = u(++nS)
    const c = await llama('/api/sim/crear', { cuerpo: { session_id: sid, command_id: nuevoId(), epoca: 1, name: 'S', pair: 'EUR/USD', timeframe: 'M1', date_from: '2025-01-06', date_to: '2025-12-31', capital: '100000', challenge_type: null } })
    ver(`control: practica creada (${sid.slice(-4)})`, c.http === 201, tx(c))
    uno("update public.sim_arrendamientos set hasta = now() - interval '1 minute'")
    process.env.NEXT_PUBLIC_SIM_V1_PANTALLA = 'encendido'
    const b = await banco({ sesion: await leeSesion(sid), userId: AL, espia, v1: { puertos: { llama, nuevoId, local: web(), almacenSesion: web(), plazoMs: 5000, leeTrades: async () => [], buscaHija: async () => null } } })
    for (let k = 0; k < 50 && !b.ps()?.ready; k++) { await asienta(20); await b.repinta() }
    await b.refs.v1Ref.current?.arranca()
    await b.repinta()
    return b
  }
  const asentado = async b => { await b.refs.v1Ref.current.cliente.recupera(); await asienta(60); await b.repinta() }
  const servidor = b => VI.vistaDe(b.refs.v1Ref.current.cliente.estado)
  // el onConfirm del OrderModal en modo v1 (_SessionInner), con el id del dibujo en lo que se pinta
  const limitDelDibujo = (pv, entry, dibujo) => pv.envia(OR.comandoAbrir({ pair: 'EUR/USD', side: 'BUY_LIMIT', entry, lots: 1, sl: entry - 0.01, tp: entry + 0.02, cursor: pv.cursor() }), { entry, openTime: m(2), dibujo })
  const SI = fuente('components/_SessionInner.js')
  ver('control: el onConfirm del OrderModal v1 de _SessionInner manda { entry, openTime, dibujo } (lo que copia la prueba)', SI.includes('{entry:entradaTick,openTime:currentTime,dibujo:m.dibujo??null}'))

  titulo('B · bandera encendida: cancelar = el comando, optimista y confirmado')
  const b = await pagina()
  const pv = b.refs.v1Ref.current, TR = b.caja.valor.trading
  cero()
  await pv.avance({ engine: () => b.motor(), par: () => b.estado.activa }).irA(m(2))
  await limitDelDibujo(pv, 1.095, 'D1')
  await asentado(b)
  const o1 = b.ps().orders[0]
  ver('control: la limit del dibujo D1 confirmada, con su id del servidor y su dibujo', !!o1 && !String(o1.id).startsWith('v1-') && o1.dibujo === 'D1' && servidor(b).ordenes.length === 1, tx(b.ps().orders))
  retiene = true; enviados.length = 0
  const pc = TR.cancelaOrdenesDeDibujos(['D1'])
  await asienta(10)
  const alInstante = { ord: b.ps().orders.length, ret: colas.length, enviados: [...enviados] }
  suelta(); await pc; await asentado(b)
  oraculo('OD01', 'B · borrar el dibujo D1: con el cancelar retenido la orden ya no se ve; al confirmar, el servidor no tiene ninguna pendiente',
    alInstante.ord === 0 && alInstante.ret === 1 && tx(alInstante.enviados) === tx(['cancelar']) && b.ps().orders.length === 0 && servidor(b).ordenes.length === 0, tx({ alInstante, tras: b.ps().orders.length, srv: servidor(b).ordenes.length }))

  await limitDelDibujo(pv, 1.094, 'D2')
  await asentado(b)
  AV.vaciaAvisos()
  rechazaCancelar = true
  await TR.cancelaOrdenesDeDibujos(['D2'])
  await asentado(b)
  rechazaCancelar = false
  oraculo('OD01', 'B · si el servidor rechaza el cancelar, la orden vuelve (con su dibujo) y sale «El simulador ha rechazado la operación.»',
    b.ps().orders.length === 1 && b.ps().orders[0].dibujo === 'D2' && servidor(b).ordenes.length === 1 && textos().includes('El simulador ha rechazado la operación.'), tx({ ord: b.ps().orders, avisos: textos() }))
  await TR.cancelaOrdenesDeDibujos(['D2']); await asentado(b)

  retiene = true
  const pa = limitDelDibujo(pv, 1.093, 'D3')
  await asienta(10)
  const enVuelo = b.ps().orders.map(o => [String(o.id).startsWith('v1-'), o.dibujo])
  const pc3 = TR.cancelaOrdenesDeDibujos(['D3'])
  await asienta(10)
  const trasBorrar = b.ps().orders.length
  suelta(); await pa; await pc3; await asentado(b)
  oraculo('OD01', 'B · borrar el dibujo con su abrir aun en vuelo: la orden (provisional) desaparece al instante y, confirmados los dos, el servidor no tiene pendientes',
    tx(enVuelo) === tx([[true, 'D3']]) && trasBorrar === 0 && b.ps().orders.length === 0 && servidor(b).ordenes.length === 0, tx({ enVuelo, trasBorrar, srv: servidor(b).ordenes }))

  await limitDelDibujo(pv, 1.095, 'D4')
  await asentado(b)
  await pv.avance({ engine: () => b.motor(), par: () => b.estado.activa }).irA(m(12))
  await asentado(b)
  const pos = b.ps().positions[0]
  ver('control: la limit del dibujo D4 se lleno en el servidor (posicion abierta, sin pendientes)', !!pos && b.ps().orders.length === 0 && servidor(b).posiciones.length === 1, tx({ pos: b.ps().positions, ord: b.ps().orders }))
  enviados.length = 0
  await TR.cancelaOrdenesDeDibujos(['D4'])
  await asentado(b)
  oraculo('OD01', 'B · borrar el dibujo de una orden ya llenada: la posicion sigue abierta (ni cancelar ni cerrar al servidor)',
    enviados.length === 0 && b.ps().positions.some(p => p.id === pos?.id && p.lots === 1) && servidor(b).posiciones.length === 1, tx({ enviados, pos: b.ps().positions.length }))
  oraculo('OD01', 'S · en todo B: los espias de cierre a cero', sinCierres(), tx(espias()))
} finally { pg.cierra() }
fin()
