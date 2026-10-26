/**
 * SIMMOTOR1-03 (Astra; orden 1-121 del CTO) · `modificar` AJUSTA AL TICK la intencion y el sobre, como `abrir`.
 * Escrita ANTES que el codigo (contra db3c886: en rojo). Contra sim_comando REAL en PostgreSQL 17 local desechable
 * (montaje-v1, como pruebas/servidor-comando.mjs). Sesion de practica de los nueve pares (digitos mezclados: 5 y 3).
 *   1 una SELL LIMIT GBPUSD a 1,40000 se modifica con SL '1.410004': el p_sobre que llega a la RPC lleva "sl":"1.41"
 *     (no '1.410004') y el estado guarda 141000 ticks; un solo evento orden_modificada;
 *   2 el mismo command_id con el texto equivalente '1.41': 200 repetido, el mismo recibo (hoy: 409 clave_reutilizada);
 *   3 respuesta perdida: la RPC confirma y la respuesta no llega; el reintento con '1.42' (equivalente a '1.420004'):
 *     200 repetido y una sola modificacion;
 *   4 la orden DESAPARECE: un modificar de precio '1.300004' la vuelve ejecutable y se llena en el mismo comando (la
 *     orden ya no esta en el estado); respuesta perdida; el reintento con el mismo texto y con '1.3': 200 repetido y un
 *     solo fill. El par tiene que salir de la orden de forma estable, no del estado posterior (Astra; CTO 1-121).
 *   5 (orden 1-137, opcion A) el puerto nuevo de lib/servidor/http.mjs (parDeId): el par del evento que creo el id en
 *     sim_eventos (orden_creada / fill), leido como service_role; null si el id no es de esa sesion y alumno; y
 *     modificar sin ese puerto falla cerrado.
 */
import { cerrojoEnMemoria } from '../cerrojo-falso.mjs'
import { titulo, ver, oraculo, fin, importa } from '../lib.mjs'
import { hayPostgres } from '../pg-ensayo.mjs'
import { montajeV1, L } from '../montaje-v1.mjs'
const P = await importa('lib/mercado/publicador-v1.mjs')
const PV = await importa('lib/mercado/publica-v1.mjs')
const { minutoCerrado } = await importa('lib/mercado/calidad.mjs')
const CR = await importa('lib/servidor/crear.mjs'), TO = await importa('lib/servidor/tomar.mjs'), SO = await importa('lib/servidor/sobre.mjs'), CO = await importa('lib/servidor/comando.mjs')
const HT = await importa('lib/servidor/http.mjs')
const u = k => `00000000-0000-4000-8000-${String(k).padStart(12, '0')}`
const AHORA = Date.parse('2026-10-14T10:00:00Z')
const U = iso => Date.parse(iso) / 1000
const M0 = U('2025-01-06T00:00:00Z')
const m = k => M0 + 60 * k
let nCmd = 7000
const cmd = (o = {}) => ({ session_id: u(1001), command_id: u(++nCmd), epoca: 1, cliente_id: 'pestana-1', ...o })
const tx = x => JSON.stringify(x, (k, v) => (typeof v === 'bigint' ? `${v}n` : v))

// el mercado: los nueve pares, planos
const PX = { AUDCAD: '0.90000', AUDUSD: '0.65000', EURUSD: '1.10000', GBPJPY: '190.500', GBPUSD: '1.30000', NZDUSD: '0.60000', USDCAD: '1.37000', USDCHF: '0.88000', USDJPY: '150.200' }
function velas(par) { const o = []; for (let t = U('2025-01-06T00:00:00Z'); t < U('2025-01-11T00:00:00Z'); t += 60) if (!minutoCerrado(t)) { const p = Number(PX[par]); o.push({ time: t, open: p, high: p, low: p, close: p, volume: 1 }) } return o }
function almacen() { const o = new Map(); return { o, async lee(r) { return o.has(r) ? Buffer.from(o.get(r)) : null }, async sube(r, b, { upsert = false } = {}) { if (!upsert && o.has(r)) return 'existe'; o.set(r, Buffer.from(b)); return 'ok' }, async borra(r) { o.delete(r) }, async lista() { return [] } } }
const mercado = almacen()
const planes = SO.PARES.map(par => P.planificaPar({ par, velas: velas(par), texto: '', anterior: null, diasAceptados: new Map() }))
ver('control: los nueve pares publican', planes.every(p => p.estado === 'publica'), planes.map(p => p.estado).join())
await PV.publica({ cerrojo: cerrojoEnMemoria(), almacen: mercado, planes, dueno: 'mercado-v1-publica', ahora: '2026-10-14T09:00:00.000Z' })

if (!hayPostgres()) { ver('PostgreSQL 17 local: NO hay; la prueba contra la RPC real no se ha ejecutado', false); fin() }
const pg = montajeV1()
try {
  pg.arranca()
  const AL = u(1), d = 'mt'
  pg.base(d); pg.alumno(d, AL)
  const leeSesion = async id => { const t = pg.uno(d, `select row_to_json(s)::text from public.sim_sessions s where id = ${L(id)}`); return t ? JSON.parse(t) : null }
  const sobres = []
  let perder = false
  // la RPC real; con `perder`, confirma y la respuesta no llega (se pierde una vez)
  const rpc = async (n, a) => {
    if (n === 'sim_comando') sobres.push(a.p_sobre)
    const r = await pg.rpc(d)(n, a)
    if (n === 'sim_comando' && perder) { perder = false; throw new Error('respuesta perdida') }
    return r
  }
  // orden 1-137 (opcion A del CTO): el par de modificar sale del puerto REAL de lib/servidor/http.mjs (el evento que creo
  // el id en sim_eventos), leido aqui como lo lee supabase-js con service_role (montaje-v1 lectura)
  const parDeId = HT.puertosReales(pg.lectura(d)).parDeId
  const pu = { almacen: mercado, rpc, leeSesion, ahora: () => AHORA, parDeId }
  const ordena = async c => { try { return await CO.ordenComando({ actor: AL, cuerpo: c, puertos: pu }) } catch (e) { return { http: null, perdida: e.message } } }
  const version = () => Number(pg.uno(d, `select version from public.sim_sessions where id = '${u(1001)}'`))
  const estado = () => JSON.parse(pg.uno(d, `select estado::text from public.sim_sessions where id = '${u(1001)}'`))
  const cuenta = tipo => pg.uno(d, `select count(*) from public.sim_eventos where tipo = '${tipo}'`)
  const sinTasa = () => pg.uno(d, 'update public.sim_alumnos set siguiente_avance_desde = null')
  const sl = (s, k) => s ? JSON.parse(s).payload[k] : undefined

  ver('control: sesion creada', (await CR.ordenCrear({ actor: AL, cuerpo: { session_id: u(1001), command_id: u(2001), epoca: 1, name: 'S1', pair: 'EUR/USD', timeframe: 'H1', date_from: '2025-01-06', date_to: '2025-12-31', capital: '100000', challenge_type: null }, puertos: pu })).http === 201)
  const testigo = (await TO.ordenTomar({ actor: AL, cuerpo: { session_id: u(1001), command_id: u(++nCmd), epoca: 1, cliente_id: 'pestana-1', forzar: true }, puertos: pu })).cuerpo?.testigo
  sinTasa()
  ver('control: avanzar al minuto 10', (await ordena(cmd({ tipo: 'avanzar', version_esperada: 0, testigo, hasta: m(10), motivo: 'paso' }))).http === 200)
  const ab = await ordena(cmd({ tipo: 'abrir', version_esperada: 1, testigo, par: 'GBPUSD', lado: 'SELL', orden: 'limit', precio: '1.40000', lotes: '1' }))
  const o = estado().ordenes?.[0]
  ver('control: la SELL LIMIT GBPUSD a 1,40000 esta pendiente', ab.http === 200 && o?.par === 'GBPUSD' && o.precio?.$b === '140000', tx({ ab: ab.http, o }))
  ver('control: la sesion tiene pares de 5 y de 3 digitos', ['EURUSD', 'USDJPY'].every(p => estado().pares?.includes(p)), tx(estado().pares))

  titulo('1 · el sobre y el estado')
  sobres.length = 0
  const c1 = cmd({ tipo: 'modificar', version_esperada: version(), testigo, id: o.id, sl: '1.410004' })
  const r1 = await ordena(c1)
  const s1 = sobres[0]
  ver('control: el modificar se acepta', r1.http === 200 && r1.cuerpo?.recibo?.resultado === 'aceptado', tx(r1).slice(0, 300))
  oraculo('MODT', 'el p_sobre de la RPC lleva el SL ajustado: "sl":"1.41"', sl(s1, 'sl') === '1.41', s1)
  oraculo('MODT', 'el estado guarda el SL en 141000 ticks y hay un solo orden_modificada', estado().ordenes?.[0]?.sl?.$b === '141000' && cuenta('orden_modificada') === '1', tx({ sl: estado().ordenes?.[0]?.sl, n: cuenta('orden_modificada') }))

  titulo('2 · el mismo command_id con el texto equivalente')
  const v1 = version()
  const r2 = await ordena({ ...c1, sl: '1.41' })
  oraculo('MODT', "'1.41' con la misma clave que '1.410004': 200 repetido, el mismo recibo, sin version nueva", r2.http === 200 && r2.cuerpo?.repetido === true && r2.cuerpo.recibo?.id === r1.cuerpo?.recibo?.id && version() === v1, tx(r2).slice(0, 300))
  const r2b = await ordena(c1)
  oraculo('MODT', "el mismo texto '1.410004' otra vez: 200 repetido", r2b.http === 200 && r2b.cuerpo?.repetido === true, tx(r2b).slice(0, 200))

  titulo('3 · respuesta perdida')
  const c3 = cmd({ tipo: 'modificar', version_esperada: version(), testigo, id: o.id, sl: '1.420004' })
  perder = true
  const r3 = await ordena(c3)
  ver('control: la respuesta se pierde y la base confirma', r3.http === null && version() === v1 + 1, tx({ r3, v: version() }))
  const r3b = await ordena({ ...c3, sl: '1.42' })
  oraculo('MODT', "el reintento con '1.42': 200 repetido y una sola modificacion mas (SL 142000)", r3b.http === 200 && r3b.cuerpo?.repetido === true && cuenta('orden_modificada') === '2' && estado().ordenes?.[0]?.sl?.$b === '142000', tx({ r3b: r3b.cuerpo, n: cuenta('orden_modificada') }).slice(0, 300))

  titulo('4 · la orden desaparece (se llena en el mismo modificar)')
  const c4 = cmd({ tipo: 'modificar', version_esperada: version(), testigo, id: o.id, precio: '1.300004' })
  sobres.length = 0
  perder = true
  const r4 = await ordena(c4)
  ver('control: la respuesta se pierde; la orden se ha llenado (ya no esta) y hay un fill de GBPUSD', r4.http === null && !estado().ordenes?.some(x => x.id === o.id) && pg.uno(d, `select count(*) from public.sim_eventos where tipo = 'fill' and datos->>'par' = 'GBPUSD'`) === '1', tx({ r4, ordenes: estado().ordenes }))
  oraculo('MODT', 'el sobre del modificar que llena lleva el precio ajustado: "precio":"1.3"', sl(sobres[0], 'precio') === '1.3', sobres[0])
  const r4b = await ordena(c4)
  oraculo('MODT', "reintento con el mismo texto '1.300004' sin la orden en el estado: 200 repetido", r4b.http === 200 && r4b.cuerpo?.repetido === true, tx(r4b).slice(0, 300))
  const r4c = await ordena({ ...c4, precio: '1.3' })
  oraculo('MODT', "reintento con '1.3' sin la orden en el estado: 200 repetido y un solo fill", r4c.http === 200 && r4c.cuerpo?.repetido === true && pg.uno(d, `select count(*) from public.sim_eventos where tipo = 'fill' and datos->>'par' = 'GBPUSD'`) === '1', tx(r4c).slice(0, 300))

  titulo('5 · el puerto de lib/servidor/http.mjs (orden 1-137): el par del evento que creo el id, no del estado')
  const pid = pg.uno(d, `select datos->>'posicion' from public.sim_eventos where tipo = 'fill' and datos->>'par' = 'GBPUSD'`)
  ver('control: el fill de GBPUSD creo una posicion p…', /^p[1-9]\d*$/.test(pid ?? ''), pid)
  const par = async (o2 = {}) => { try { return await parDeId({ session_id: u(1001), user_id: AL, ...o2 }) } catch (e) { return `error: ${e.message}` } }
  oraculo('MODT', `parDeId: la orden ${o.id} (ya llenada, fuera del estado) es GBPUSD; la posicion que nacio de ella, GBPUSD`, typeof parDeId === 'function' && await par({ id: o.id }) === 'GBPUSD' && await par({ id: pid }) === 'GBPUSD', tx([await par({ id: o.id }), await par({ id: pid })]))
  oraculo('MODT', 'parDeId: un id que no se creo, la sesion de otro alumno o el id de otra sesion: null (sin par)', typeof parDeId === 'function' && await par({ id: 'o99' }) === null && await par({ id: o.id, user_id: u(2) }) === null && await par({ id: o.id, session_id: u(1002) }) === null, tx([await par({ id: 'o99' }), await par({ id: o.id, user_id: u(2) }), await par({ id: o.id, session_id: u(1002) })]))
  let sinPuerto
  try { sinPuerto = await CO.ordenComando({ actor: AL, cuerpo: cmd({ tipo: 'modificar', version_esperada: version(), testigo, id: o.id, sl: '1.5' }), puertos: { ...pu, parDeId: undefined } }) } catch (e) { sinPuerto = { error: e.message } }
  oraculo('MODT', 'modificar sin el puerto del par: falla cerrado (error), no manda un sobre sin ajustar', !!sinPuerto?.error, tx(sinPuerto).slice(0, 200))
} finally { pg.cierra() }
fin()
