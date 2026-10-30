/**
 * V1C15 · CREAR SOLO DENTRO DEL MERCADO PUBLICADO (orden 1-179 (a) del CTO). lib/servidor REAL + PostgreSQL desechable.
 * La regla: al crear, date_from y date_to dentro del rango publicado del manifiesto vigente (primer–ultimo dia); si no, 409
 * con texto claro; el cliente toma sus valores por defecto de ese rango (modal del reto y formulario del dashboard en v1).
 * Rango de la sesion = el comun a los NUEVE pares (la sesion los fija todos y el motor convierte con ellos): el mayor de
 * los primeros dias y el menor de los ultimos (lib/servidor/mercado.mjs rangoPublicado).
 *   A · servidor: antes del primer dia publicado → 409 fuera_de_mercado con el texto y el rango, SIN llamar a la RPC; despues
 *       del ultimo → igual; dentro → 201; si un par acaba antes (USDJPY el 30-dic), el ultimo dia es el suyo
 *   B · GET /api/sim/mercado → { primer_dia, ultimo_dia }; sin mercado publicado → 503 mercado_no_disponible
 *   C · cliente: fechasPorDefecto (hasta = ultimo dia; desde = 6 meses antes, sin pasar del primero); creaRetoV1 (el modal)
 *       crea con esas fechas; creaSesionV1 (el dashboard) enseña el texto del 409 tal cual; el dashboard en v1 lee el rango
 *       al abrir «Nueva sesion» y lo pone de limites y valores por defecto de las fechas
 * Datos inventados. Sin red.
 */
import { anclados } from '../mercado-ancla.mjs'
const { titulo, ver, oraculo, fin, importa, fuente } = await import('../lib.mjs')
const CR = await importa('lib/servidor/crear.mjs'), CRV = await importa('lib/sim/v1/crear.js')
const { hayPostgres } = await import('../pg-ensayo.mjs')
if (!hayPostgres()) { ver('PostgreSQL 17 local: NO hay', false); fin() }
const { montajeV1, L } = await import('../montaje-v1.mjs')
const { cerrojoEnMemoria } = await import('../cerrojo-falso.mjs')
const P = await importa('lib/mercado/publicador-v1.mjs'), PV = await importa('lib/mercado/publica-v1.mjs')
const { minutoCerrado } = await importa('lib/mercado/calidad.mjs')
const SO = await importa('lib/servidor/sobre.mjs')
const tx = x => JSON.stringify(x)
const u = k => `00000000-0000-4000-8000-${String(k).padStart(12, '0')}`
const M0 = Date.parse('2025-01-06T00:00:00Z') / 1000
const PX = { AUDCAD: 0.9, AUDUSD: 0.65, EURUSD: 1.1, GBPJPY: 190.5, GBPUSD: 1.3, NZDUSD: 0.6, USDCAD: 1.37, USDCHF: 0.88, USDJPY: 150.2 }
function velasDe(par) { const o = []; for (let t = M0; t < M0 + 5 * 86400; t += 60) if (!minutoCerrado(t)) o.push({ time: t, open: PX[par], high: PX[par], low: PX[par], close: PX[par], volume: 1 }); return o }
function almacen() { const o = new Map(); return { async lee(r) { return o.has(r) ? Buffer.from(o.get(r)) : null }, async sube(r, b, { upsert = false } = {}) { if (!upsert && o.has(r)) return 'existe'; o.set(r, Buffer.from(b)); return 'ok' }, async borra(r) { o.delete(r) }, async lista() { return [] } } }
const planes = () => SO.PARES.map(par => P.planificaPar({ par, velas: velasDe(par), texto: '', anterior: null, diasAceptados: new Map() }))
// el mercado de la prueba: del 6-ene-2025 al 31-dic-2025 (los nueve pares)
const mercado = almacen()
await PV.publica({ cerrojo: cerrojoEnMemoria(), almacen: mercado, planes: anclados(planes(), '2025-12-31'), dueno: 'mercado-v1-publica', ahora: '2026-10-14T09:00:00.000Z' })
// otro: USDJPY acaba el 30-dic y los demas el 31
const corto = almacen()
await PV.publica({ cerrojo: cerrojoEnMemoria(), almacen: corto, planes: planes().map(p => anclados([p], p.par === 'USDJPY' ? '2025-12-30' : '2025-12-31')[0]), dueno: 'mercado-v1-publica', ahora: '2026-10-14T09:00:00.000Z' })
const vacio = almacen()
const AL = u(1)
let nId = 98000
const nuevoId = () => u(++nId)

const pg = montajeV1()
try {
  pg.arranca()
  const d = 'v1c15'
  pg.base(d)
  pg.alumno(d, AL)
  const uno = q => pg.uno(d, q)
  const leeSesion = async id => { const t = uno(`select row_to_json(s)::text from public.sim_sessions s where id = ${L(id)}`); return t ? JSON.parse(t) : null }
  let rpcs = 0
  const rpc = pg.rpc(d)
  const puertos = alm => ({ almacen: alm, rpc: async (n, a) => { rpcs++; return rpc(n, a) }, leeSesion, ahora: () => Date.parse('2026-10-14T10:00:00Z') })
  const orden = { '/api/sim/crear': CR.ordenCrear, '/api/sim/mercado': CR.ordenMercado }
  const llamadas = []
  const llamaCon = alm => async (ruta, { metodo = 'POST', cuerpo = {} } = {}) => {
    llamadas.push({ ruta, metodo, cuerpo })
    if (!orden[ruta]) return { http: 404, cuerpo: { ok: false, motivo: 'no_existe' } }
    const r = await orden[ruta]({ actor: AL, cuerpo, puertos: puertos(alm) })
    return { http: r.http, cuerpo: r.cuerpo }
  }
  const llama = llamaCon(mercado)
  const crea = (alm, desde, hasta) => llamaCon(alm)('/api/sim/crear', { cuerpo: { session_id: nuevoId(), command_id: nuevoId(), epoca: 1, name: 'S', pair: 'EUR/USD', timeframe: 'H1', date_from: desde, date_to: hasta, capital: '10000', challenge_type: null } })

  titulo('A · el servidor: dentro del rango publicado o 409, sin RPC')
  rpcs = 0
  const antes = await crea(mercado, '2025-01-03', '2025-12-31')
  oraculo('V1C15', 'A · date_from antes del primer dia publicado (3-ene; el mercado empieza el 6): 409 fuera_de_mercado con su texto y el rango, sin RPC',
    antes.http === 409 && antes.cuerpo?.motivo === 'fuera_de_mercado' && antes.cuerpo.texto === 'Las fechas de la sesión tienen que estar dentro del mercado publicado: del 06/01/2025 al 31/12/2025.' && antes.cuerpo.primer_dia === '2025-01-06' && antes.cuerpo.ultimo_dia === '2025-12-31' && rpcs === 0, tx({ r: antes, rpcs }))
  rpcs = 0
  const despues = await crea(mercado, '2025-06-01', '2026-01-15')
  oraculo('V1C15', 'A · date_to despues del ultimo dia publicado (15-ene-2026; acaba el 31-dic): 409 fuera_de_mercado, sin RPC', despues.http === 409 && despues.cuerpo?.motivo === 'fuera_de_mercado' && rpcs === 0, tx({ r: despues, rpcs }))
  const dentro = await crea(mercado, '2025-01-06', '2025-12-31')
  oraculo('V1C15', 'A · dentro (del primer al ultimo dia, justos): 201', dentro.http === 201 && dentro.cuerpo?.ok === true, tx(dentro).slice(0, 200))
  const unPar = await crea(corto, '2025-01-06', '2025-12-31')
  oraculo('V1C15', 'A · USDJPY acaba el 30-dic: el rango es el comun a los nueve pares y el 31 queda fuera (409, ultimo dia 30/12/2025)', unPar.http === 409 && unPar.cuerpo?.ultimo_dia === '2025-12-30' && /al 30\/12\/2025\./.test(unPar.cuerpo?.texto ?? ''), tx(unPar))

  titulo('B · GET /api/sim/mercado')
  const rm = CR.ordenMercado ? await llama('/api/sim/mercado', { metodo: 'GET', cuerpo: {} }) : { http: null }
  const rv = CR.ordenMercado ? await llamaCon(vacio)('/api/sim/mercado', { metodo: 'GET', cuerpo: {} }) : { http: null }
  oraculo('V1C15', 'B · el rango: { primer_dia: 2025-01-06, ultimo_dia: 2025-12-31 }; sin mercado publicado, 503 mercado_no_disponible',
    rm.http === 200 && rm.cuerpo?.primer_dia === '2025-01-06' && rm.cuerpo?.ultimo_dia === '2025-12-31' && rv.http === 503 && rv.cuerpo?.motivo === 'mercado_no_disponible', tx({ rm, rv }))
  const ep = (() => { try { return fuente('pages/api/sim/mercado.js') } catch { return '' } })()
  oraculo('V1C15', 'B · pages/api/sim/mercado.js: GET por lo comun de /api/sim/* (interruptor, guard, mantenimiento) con ordenMercado', /atiende\(req, res, \{[^}]*orden: ordenMercado[^}]*metodo: 'GET'/.test(ep))

  titulo('C · el cliente: valores por defecto del rango')
  const fpd = CRV.fechasPorDefecto
  oraculo('V1C15', 'C · fechasPorDefecto: hasta = ultimo dia publicado, desde = 6 meses antes (31-dic → 1-jul, como setMonth) y, si no llega, el primer dia publicado',
    !!fpd && tx(fpd({ primer_dia: '2025-01-06', ultimo_dia: '2025-12-31' })) === tx({ dateFrom: '2025-07-01', dateTo: '2025-12-31' }) && tx(fpd({ primer_dia: '2025-09-01', ultimo_dia: '2025-12-31' })) === tx({ dateFrom: '2025-09-01', dateTo: '2025-12-31' }),
    tx(fpd ? [fpd({ primer_dia: '2025-01-06', ultimo_dia: '2025-12-31' }), fpd({ primer_dia: '2025-09-01', ultimo_dia: '2025-12-31' })] : null))
  llamadas.length = 0
  const rr = await CRV.creaRetoV1({ llama, nuevoId, tipo: '1F', capital: 100000 })
  const fr = rr.ok ? await leeSesion(rr.id) : null
  const crearR = llamadas.find(x => x.ruta === '/api/sim/crear')
  oraculo('V1C15', 'C · creaRetoV1 (el modal del reto con la bandera): lee el rango y crea con hasta = 31-dic-2025 (el ultimo publicado) y desde = 1-jul-2025; 201',
    rr.ok === true && llamadas[0]?.ruta === '/api/sim/mercado' && crearR?.cuerpo?.date_to === '2025-12-31' && crearR?.cuerpo?.date_from === '2025-07-01' && fr?.date_to === '2025-12-31' && fr?.challenge_type === '1F', tx({ rr, llamadas: llamadas.map(x => [x.ruta, x.cuerpo?.date_from, x.cuerpo?.date_to]) }))
  const rs = await CRV.creaSesionV1({ llama, nuevoId, form: { name: 'Fuera', pair: 'EUR/USD', dateFrom: '2025-06-01', dateTo: '2026-01-15', capital: 10000 } })
  oraculo('V1C15', 'C · creaSesionV1 (el dashboard con la bandera) fuera del rango: el error es el texto del servidor, tal cual', rs.ok === false && rs.error === 'Las fechas de la sesión tienen que estar dentro del mercado publicado: del 06/01/2025 al 31/12/2025.', tx(rs))
  const DB = fuente('pages/dashboard.js')
  oraculo('V1C15', 'C · el dashboard con la bandera lee el rango al abrir «Nueva sesion» (rangoMercado), rellena las fechas vacias con fechasPorDefecto y pone min/max de los dos campos de fecha desde el rango',
    /if \(!showNew \|\| !pantallaV1\(\)\) return/.test(DB) && DB.includes('rangoMercado(llamaConFetch(supabase))') && DB.includes('fechasPorDefecto(r)') && (DB.match(/min=\{rangoV1\?\.primer_dia \?\? "2024-07-01"\} max=\{rangoV1\?\.ultimo_dia \?\? MAX_DATE\}/g) ?? []).length === 2)
} finally { pg.cierra() }
fin()
