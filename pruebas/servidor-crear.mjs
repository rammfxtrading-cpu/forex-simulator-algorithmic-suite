/**
 * ETAPA 3 · CREAR UNA SESION v1 (diseño sim-004 b.1, b.2, e.1, q.1). Escrito ANTES
 * que el codigo (contra 5d5f595: en rojo).
 *
 *   1 la intencion (lib/servidor/sobre.mjs): validacion CERRADA (claves conocidas,
 *     tipos y rangos; lo que sobra, 422 carga_invalida con «en»); las reglas de
 *     fechas de hoy (dashboard.js: ≥ 1-jul-2024, ≤ ayer, ≥ 180 dias), en el
 *     servidor; capital: practica en centimos, reto en ACCOUNT_SIZES; el sobre
 *     canonico no depende del orden de las claves;
 *   2 la RPC (lib/servidor/rpc.mjs): 40P01 → como mucho 3 reintentos con los
 *     MISMOS argumentos; otro error, ninguno, y sale sin su texto;
 *   3 contra sim_crear_sesion REAL (montaje literal + sim-002 + sim-003 +
 *     preparatoria, pruebas/montaje-v1.mjs): practica y reto 2F con el estado
 *     inicial del motor y el mercado fijado de los NUEVE pares (A26); repetir →
 *     200 repetido; otra clave → 409; sin acceso → 403; cupo → 409; sin mercado
 *     publicado → 503 sin llamar a la RPC; 1F/3F → 422 hasta SUITE_1F/SUITE_3F;
 *   4 el endpoint POST /api/sim/crear: APAGADO sin SIM_V1_ENDPOINTS=encendido
 *     (503 sin autenticar ni llamar a nada); encendido: sim_servicio en
 *     mantenimiento → 503; admin sin simulador_activo → 403 (h.4); y de punta a
 *     punta con la RPC real.
 */
import { titulo, ver, oraculo, fin, importa, escenario, perfil, tok, db, A, ADM } from './lib.mjs'
import { llama } from './supabase-falso.mjs'
import { hayPostgres } from './pg-ensayo.mjs'
import { montajeV1 } from './montaje-v1.mjs'
const P = await importa('lib/mercado/publicador-v1.mjs')
const PV = await importa('lib/mercado/publica-v1.mjs')
const CA = await importa('lib/motor/cartera.mjs')
const { minutoCerrado } = await importa('lib/mercado/calidad.mjs')
const cargar = async p => { try { return await importa(p) } catch { return null } }
const SO = await cargar('lib/servidor/sobre.mjs'), RPC = await cargar('lib/servidor/rpc.mjs'), CR = await cargar('lib/servidor/crear.mjs')
const PARES = ['AUDCAD', 'AUDUSD', 'EURUSD', 'GBPJPY', 'GBPUSD', 'NZDUSD', 'USDCAD', 'USDCHF', 'USDJPY']
const u = k => `00000000-0000-4000-8000-${String(k).padStart(12, '0')}`
const AHORA = Date.parse('2026-10-14T10:00:00Z')
const base = (o = {}) => ({ session_id: u(1001), command_id: u(2001), epoca: 1, name: 'Mi sesion', pair: 'EUR/USD', timeframe: 'H1', date_from: '2025-01-01', date_to: '2025-12-31', capital: '10000', challenge_type: null, ...o })
const valida = c => (SO ? SO.validaCrear(c, { ahora: AHORA }) : { ok: null })

titulo('1 · la intencion')
const ok = valida(base())
oraculo('CREA', 'una practica valida: ok, con el par del motor (EURUSD) y el de la tabla (EUR/USD)', ok.ok === true && ok.intencion?.par === 'EURUSD' && ok.intencion?.pair === 'EUR/USD', JSON.stringify(ok))
const casos = [
  ['una clave de mas (balance)', base({ balance: 999999 }), 'balance'],
  ['estado en el cuerpo', base({ estado: {} }), 'estado'],
  ['session_id que no es UUID', base({ session_id: 'x' }), 'session_id'],
  ['epoca no entera', base({ epoca: '1' }), 'epoca'],
  ['nombre vacio', base({ name: '' }), 'name'],
  ['nombre de 101', base({ name: 'x'.repeat(101) }), 'name'],
  ['par desconocido', base({ pair: 'EUR/GBP' }), 'pair'],
  ['timeframe desconocido', base({ timeframe: 'H2' }), 'timeframe'],
  ['inicio antes del 1-jul-2024', base({ date_from: '2024-06-30', date_to: '2025-06-30' }), 'date_from'],
  ['fin despues de ayer', base({ date_from: '2026-01-01', date_to: '2026-10-14' }), 'date_to'],
  ['rango de 179 dias', base({ date_from: '2025-01-01', date_to: '2025-06-29' }), 'date_to'],
  ['fecha que no existe', base({ date_from: '2025-02-30' }), 'date_from'],
  ['capital con tres decimales', base({ capital: '10000.123' }), 'capital'],
  ['capital 0', base({ capital: '0' }), 'capital'],
  ['capital negativo', base({ capital: '-5' }), 'capital'],
  ['reto con capital fuera de ACCOUNT_SIZES', base({ challenge_type: '2F', capital: '12345' }), 'capital'],
  ['challenge_type desconocido', base({ challenge_type: '4F', capital: '100000' }), 'challenge_type'],
]
for (const [que, c, en] of casos) {
  const r = valida(c)
  oraculo('CREA', `${que}: 422 carga_invalida en «${en}»`, r.ok === false && r.http === 422 && r.motivo === 'carga_invalida' && r.en === en, JSON.stringify(r))
}
const borde = valida(base({ date_from: '2024-07-01', date_to: '2024-12-28' }))
oraculo('CREA', 'el borde: desde el 1-jul-2024 y 180 dias justos, valido; capital con dos decimales, valido', borde.ok === true && valida(base({ capital: '10000.50' })).ok === true && valida(base({ date_to: '2026-10-13' })).ok === true, JSON.stringify(borde))
const c1 = SO ? SO.canonico({ b: 1, a: { d: 2, c: [3, { f: 1, e: 0 }] } }) : null
oraculo('CREA', 'el sobre canonico ordena las claves (a todos los niveles) y no las listas', c1 === '{"a":{"c":[3,{"e":0,"f":1}],"d":2},"b":1}', c1)
const s1 = SO && ok.ok ? SO.sobreCrear(ok.intencion) : null, s2 = SO ? SO.sobreCrear(valida({ ...base(), name: 'Mi sesion' }).intencion) : null
oraculo('CREA', 'el sobre de crear: {tipo:"crear", payload}, el mismo para la misma intencion, y sin command_id ni epoca', s1 && s1 === s2 && JSON.parse(s1).tipo === 'crear' && !/command_id|epoca/.test(s1) && valida(base({ capital: '20000' })).ok && SO.sobreCrear(valida(base({ capital: '20000' })).intencion) !== s1, s1)

titulo('2 · la RPC: 40P01 y lo demas')
const rpcCon = (respuestas) => { const llamadas = []; return { llamadas, rpc: async (n, a) => { llamadas.push([n, structuredClone(a)]); return respuestas.shift() } } }
const bien = { data: { ok: true, http: 201 }, error: null }, dl = { data: null, error: { code: '40P01', message: 'deadlock detected FUGA123' } }
const r2 = rpcCon([dl, dl, bien])
const x2 = RPC ? await RPC.llamaRpc(r2.rpc, 'sim_x', { p_a: 1 }, { espera: async () => {} }).catch(e => ({ error: e })) : null
oraculo('CREA', '40P01 dos veces y despues bien: 3 llamadas, todas con los mismos argumentos; devuelve el jsonb', x2?.http === 201 && r2.llamadas.length === 3 && r2.llamadas.every(l => JSON.stringify(l) === JSON.stringify(r2.llamadas[0])), JSON.stringify({ x2, n: r2.llamadas.length }))
const r3 = rpcCon([dl, dl, dl, dl, bien])
const x3 = RPC ? await RPC.llamaRpc(r3.rpc, 'sim_x', {}, { espera: async () => {} }).catch(e => ({ error: e })) : null
oraculo('CREA', '40P01 cuatro veces: error propio tras 1 + 3 intentos, sin el texto ajeno', x3?.error?.propio === true && r3.llamadas.length === 4 && !/FUGA123|deadlock/.test(x3.error.message), JSON.stringify({ m: x3?.error?.message, n: r3.llamadas.length }))
const r4 = rpcCon([{ data: null, error: { code: '23505', message: 'duplicate FUGA123' } }])
const x4 = RPC ? await RPC.llamaRpc(r4.rpc, 'sim_x', {}, { espera: async () => {} }).catch(e => ({ error: e })) : null
oraculo('CREA', 'otro error de SQL: sin reintento, error propio con su codigo y sin su texto', x4?.error?.propio === true && r4.llamadas.length === 1 && /23505/.test(x4.error.message) && !/FUGA123/.test(x4.error.message), x4?.error?.message)

// ── el mercado publicado: los nueve pares, con trozos reales ──
function velas(desde, hasta, px) { const o = []; for (let t = Date.parse(desde + 'T00:00:00Z') / 1000; t < Date.parse(hasta + 'T00:00:00Z') / 1000; t += 60) if (!minutoCerrado(t)) o.push({ time: t, open: px, high: px, low: px, close: px, volume: 1 }); return o }
function almacen() { const o = new Map(), registro = []; return { o, registro, async lee(r) { registro.push(['lee', r]); return o.has(r) ? Buffer.from(o.get(r)) : null }, async sube(r, b, { upsert = false } = {}) { if (!upsert && o.has(r)) return 'existe'; o.set(r, Buffer.from(b)); return 'ok' }, async borra(r) { o.delete(r) }, async lista(p) { return [...o].filter(([k]) => k.startsWith(p)).map(([ruta, b]) => ({ ruta, bytes: b.length })) } } }
const PX = { AUDCAD: 0.9, AUDUSD: 0.65, EURUSD: 1.1, GBPJPY: 190.5, GBPUSD: 1.3, NZDUSD: 0.6, USDCAD: 1.37, USDCHF: 0.88, USDJPY: 150.2 }
const mercado = almacen()
const planes = PARES.map(par => P.planificaPar({ par, velas: velas('2025-01-06', '2025-01-11', PX[par]), texto: '', anterior: null, diasAceptados: new Map() }))
ver('control: los nueve pares publican', planes.every(p => p.estado === 'publica'), planes.map(p => p.estado).join())
await PV.publica({ almacen: mercado, planes, dueno: 'mercado-v1-publica', ahora: '2026-10-14T09:00:00.000Z' })
const fijados = Object.fromEntries(planes.map(p => [p.par, `${p.par}@${p.manifiesto.version}:${p.manifiesto.huella}`]))

if (!hayPostgres()) { ver('PostgreSQL 17 local: NO hay; la parte contra la RPC real no se ha ejecutado', false); fin() }
const m = montajeV1()
try {
  m.arranca()
  titulo('3 · contra sim_crear_sesion REAL')
  const d = m.base('c1')
  const AL = u(1), SIN = u(2)
  m.alumno(d, AL); m.alumno(d, SIN, { simulador_activo: false })
  const puertos = (o = {}) => ({ almacen: mercado, rpc: m.rpc(d), ahora: () => AHORA, ...o })
  const crea = (cuerpo, actor = AL, o) => (CR ? CR.ordenCrear({ actor, cuerpo, puertos: puertos(o) }) : Promise.resolve({ http: null }))
  const r1 = await crea(base())
  const fila = r1.http === 201 ? JSON.parse(m.uno(d, `select row_to_json(s)::text from (select motor_version, version, epoca, pair, timeframe, capital::text, balance::text, status, challenge_type, challenge_phase, creada_por_rpc, mercado, estado from public.sim_sessions where id = '${u(1001)}') s`)) : null
  oraculo('CREA', 'practica: 201 con recibo; la fila v1 (motor_version 1, version 0, epoca 1), par EUR/USD, saldo = capital y creada por la RPC', r1.http === 201 && r1.cuerpo?.recibo?.tipo === 'crear' && fila?.motor_version === 1 && fila.version === 0 && fila.epoca === 1 && fila.pair === 'EUR/USD' && fila.capital === '10000' && fila.balance === '10000' && fila.creada_por_rpc === true && fila.challenge_type === null, JSON.stringify({ http: r1.http, cuerpo: r1.cuerpo, fila: fila && { ...fila, estado: undefined } }).slice(0, 600))
  oraculo('CREA', 'el mercado fijado de los NUEVE pares (A26): en la columna y en el estado, identico al vigente', fila && JSON.stringify(Object.keys(fila.mercado).sort()) === JSON.stringify(PARES) && PARES.every(p => fila.mercado[p] === fijados[p] && fila.estado.versiones.mercado[p] === fijados[p]), JSON.stringify(fila?.mercado))
  const e0 = CA.crea({ pares: PARES, costes: (await importa('lib/motor/costes.mjs')).COSTES_1, capital: '10000', mercado: fijados })
  oraculo('CREA', 'el estado guardado es el de cartera.crea (sim-cartera@1), y vuelve a serializar igual', fila && fila.estado.esquema === 'sim-cartera@1' && CA.serializa(CA.deserializa(JSON.stringify(fila.estado))) === CA.serializa(e0), fila?.estado?.esquema)
  const rRep = await crea(base())
  oraculo('CREA', 'repetir lo mismo (respuesta perdida): 200 repetido, el mismo recibo, una sola fila', rRep.http === 200 && rRep.cuerpo?.repetido === true && rRep.cuerpo.recibo?.id === r1.cuerpo?.recibo?.id && m.uno(d, `select count(*) from public.sim_sessions where id = '${u(1001)}'`) === '1', JSON.stringify(rRep))
  const rOtra = await crea(base({ command_id: u(2002), name: 'Otra' }))
  oraculo('CREA', 'el mismo id de sesion con otra clave: 409 clave_reutilizada', rOtra.http === 409 && rOtra.cuerpo?.motivo === 'clave_reutilizada', JSON.stringify(rOtra))
  const r2f = await crea(base({ session_id: u(1002), command_id: u(2003), challenge_type: '2F', capital: '100000' }))
  const e2f = r2f.http === 201 ? JSON.parse(m.uno(d, `select estado::text from public.sim_sessions where id = '${u(1002)}'`)) : null
  const f2f = r2f.http === 201 ? m.uno(d, `select challenge_type || ' ' || challenge_phase from public.sim_sessions where id = '${u(1002)}'`) : null
  oraculo('CREA', 'reto 2F: 201; reto@1 con FTMO_2STEP, fase 1, objetivo 110.000 y la cartera de los nueve pares dentro; challenge_type 2F, fase 1', r2f.http === 201 && e2f?.esquema === 'reto@1' && e2f.reglas === 'ftmo-2step@2026-10-05' && e2f.fase === 1 && e2f.motor?.esquema === 'sim-cartera@1' && e2f.motor.pares.length === 9 && JSON.stringify(e2f.objetivo_µ) === JSON.stringify({ $b: '110000000000' }) && f2f === '2F 1', JSON.stringify({ http: r2f.http, c: r2f.cuerpo, e: e2f && { esquema: e2f.esquema, reglas: e2f.reglas, objetivo: e2f.objetivo_µ } }))
  for (const t of ['1F', '3F']) {
    const antes = m.uno(d, 'select count(*) from public.sim_recibos')
    const r = await crea(base({ session_id: u(1100), command_id: u(2100), challenge_type: t, capital: '100000' }))
    oraculo('CREA', `${t}: 422 reto_no_disponible hasta SUITE_${t} (q.3, commit 7), sin llamar a la RPC`, r.http === 422 && r.cuerpo?.motivo === 'reto_no_disponible' && m.uno(d, 'select count(*) from public.sim_recibos') === antes, JSON.stringify(r))
  }
  const rSin = await crea(base({ session_id: u(1003), command_id: u(2004) }), SIN)
  oraculo('CREA', 'alumno sin simulador_activo: la RPC responde 403 sin_acceso y no crea nada', rSin.http === 403 && rSin.cuerpo?.motivo === 'sin_acceso' && m.uno(d, `select count(*) from public.sim_sessions where id = '${u(1003)}'`) === '0', JSON.stringify(rSin))
  const vacio = almacen()
  const rVacio = await crea(base({ session_id: u(1004), command_id: u(2005) }), AL, { almacen: vacio })
  oraculo('CREA', 'sin mercado publicado: 503 mercado_no_disponible (codigo mercado_no_publicado), sin llamar a la RPC', rVacio.http === 503 && rVacio.cuerpo?.motivo === 'mercado_no_disponible' && rVacio.cuerpo.codigo === 'mercado_no_publicado' && m.uno(d, `select count(*) from public.sim_sessions where id = '${u(1004)}'`) === '0', JSON.stringify(rVacio))
  // el cupo: 6 raices con plan basic (dos ya creadas)
  const cupo = []
  for (let k = 0; k < 5; k++) cupo.push((await crea(base({ session_id: u(1200 + k), command_id: u(2200 + k) }))).http)
  oraculo('CREA', 'el cupo de la RPC real: cuatro mas entran (6 con plan basic) y la quinta, 409 limite_sesiones', cupo.join() === '201,201,201,201,409', cupo.join())

  titulo('4 · el endpoint POST /api/sim/crear')
  const handler = (await importa('pages/api/sim/crear.js')).default
  const montaFalso = (o = {}) => {
    escenario({ perfiles: [perfil(AL, { simulador_activo: true }), perfil(ADM, { rol_global: 'admin', simulador_activo: false })], ...o })
    db.tokens[tok(AL)] = { id: AL }
    db.storage.mercado = Object.fromEntries([...mercado.o].map(([k, v]) => [k, Buffer.from(v)]))
    db.rpcExterno = m.rpc(d)
  }
  const llamadasRpc = () => db.log.filter(l => l.op === 'rpc').length
  delete process.env.SIM_V1_ENDPOINTS
  montaFalso()
  const rA = await llama(handler, { method: 'POST', token: tok(AL), body: base({ session_id: u(1300), command_id: u(2300) }) })
  oraculo('CREA', 'sin SIM_V1_ENDPOINTS=encendido: 503 mantenimiento, sin autenticar ni llamar a nada', rA.estado === 503 && rA.cuerpo?.motivo === 'mantenimiento' && db.log.length === 0, JSON.stringify({ e: rA.estado, c: rA.cuerpo, log: db.log.length }))
  process.env.SIM_V1_ENDPOINTS = 'encendido'
  montaFalso({ sim_servicio: [{ id: true, mantenimiento: true, version_minima: '1', cambiado_en: '2026-10-13T00:00:00Z' }] })
  const rM = await llama(handler, { method: 'POST', token: tok(AL), body: base({ session_id: u(1301), command_id: u(2301) }) })
  oraculo('CREA', 'encendido y sim_servicio en mantenimiento: 503 mantenimiento, sin llamar a la RPC', rM.estado === 503 && rM.cuerpo?.motivo === 'mantenimiento' && llamadasRpc() === 0, JSON.stringify({ e: rM.estado, c: rM.cuerpo }))
  montaFalso()
  const rAdm = await llama(handler, { method: 'POST', token: tok(ADM), body: base({ session_id: u(1302), command_id: u(2302) }) })
  oraculo('CREA', 'un admin sin simulador_activo: 403 sin_acceso en el endpoint (h.4), sin llamar a la RPC', rAdm.estado === 403 && rAdm.cuerpo?.motivo === 'sin_acceso' && llamadasRpc() === 0, JSON.stringify({ e: rAdm.estado, c: rAdm.cuerpo }))
  const rGet = await llama(handler, { method: 'GET', token: tok(AL) })
  oraculo('CREA', 'GET: 405', rGet.estado === 405, String(rGet.estado))
  const d2 = m.base('c2'); m.alumno(d2, AL)
  montaFalso(); db.rpcExterno = m.rpc(d2)
  const rE = await llama(handler, { method: 'POST', token: tok(AL), body: base({ session_id: u(1303), command_id: u(2303) }) })
  oraculo('CREA', 'de punta a punta: endpoint → supabase (service_role) → sim_crear_sesion REAL: 201 y la fila con el mercado fijado', rE.estado === 201 && rE.cuerpo?.ok === true && JSON.parse(m.uno(d2, `select mercado::text from public.sim_sessions where id = '${u(1303)}'`)).USDJPY === fijados.USDJPY, JSON.stringify({ e: rE.estado, c: rE.cuerpo, x: rE.excepcion?.message }).slice(0, 400))
  const rBad = await llama(handler, { method: 'POST', token: tok(AL), body: base({ session_id: u(1304), command_id: u(2304), balance: 1 }) })
  oraculo('CREA', 'por la URL, una clave de mas: 422 carga_invalida, sin llamar a la RPC', rBad.estado === 422 && rBad.cuerpo?.motivo === 'carga_invalida' && llamadasRpc() === 1, JSON.stringify(rBad.cuerpo))
  db.rpcExterno = async () => ({ data: null, error: { code: '22P02', message: 'invalid input FUGA123 https://x.supabase.co' } })
  const rX = await llama(handler, { method: 'POST', token: tok(AL), body: base({ session_id: u(1305), command_id: u(2305) }) })
  oraculo('CREA', 'un error de SQL que no es del protocolo: 500 generico, sin su texto', rX.estado === 500 && !/FUGA123|supabase/.test(JSON.stringify(rX.cuerpo)), JSON.stringify(rX.cuerpo))
  delete process.env.SIM_V1_ENDPOINTS
  db.rpcExterno = null
} finally { m.cierra() }
fin()
