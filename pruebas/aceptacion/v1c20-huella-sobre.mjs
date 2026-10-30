/**
 * V1C20 · ORDEN 1-183 (2) del CTO: entran en la huella los campos del sobre que cambian lo que el alumno ve o puede hacer:
 * terminal, escritor y valoracion (epoca y legado, fuera: declarados). Servidor REAL + PostgreSQL desechable.
 *   F · cada uno cambiado en el transporte (la huella del servidor intacta): relectura fallida (aviso, desincronizado, otra
 *       orden no sale) y la relectura sana de la misma version recupera
 *   E · el escritor cambia DE VERDAD sin subir la version (otra pestaña «Usar aqui»: sim_tomar_escritor no sube version):
 *       la respuesta verificada se instala (el escritor nuevo), sin bloquear: no es una cartera distinta
 * Datos inventados. Sin red. En c5f2ac0 (r4): F en rojo (se aceptaban) y E en rojo (la misma version no se reinstalaba).
 */
// orden 1-179 (a): el dia ancla del mercado de la prueba (crear exige las fechas dentro de lo publicado)
import { anclados } from '../mercado-ancla.mjs'
import { register } from 'node:module'
register('../espias-vela.mjs', import.meta.url)
const { titulo, ver, oraculo, fin, importa, fuente, asienta, escenario } = await import('../lib.mjs')
const HOOK = await importa('components/useSesionV1.js').catch(() => null)
const PA = await importa('lib/sim/v1/pantalla.js').catch(() => null)
if (!HOOK?.default || !PA?.creaPantallaV1) { for (let i = 0; i < 7; i++) oraculo('V1C20', `caso ${i}: sin la pantalla v1 no se puede`, false, 'no esta'); fin() }
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
const CA = await importa('lib/motor/cartera.mjs')
const HU = await importa('lib/sim/v1/huella.mjs').catch(() => null)
const tx = x => JSON.stringify(x, (k, v) => (typeof v === 'bigint' ? `${v}n` : v))
const HUECO = "v_guarda pg_catalog.text := '⟦HUECO guarda canonica⟧';"
const deEnsayo = t => { if (t.split(HUECO).length !== 2) throw new Error('el hueco no esta una vez'); return t.replace(HUECO, "v_guarda pg_catalog.text := 'montaje de ensayo (v1c20)';") }
const S4B = conUidDelMontaje(fuente('sql/sim-004b-contrato-v1.sql')), S6 = deEnsayo(fuente('sql/sim-006-tope-de-pasos.sql'))
const u = k => `00000000-0000-4000-8000-${String(k).padStart(12, '0')}`
const M0 = Date.parse('2025-01-06T00:00:00Z') / 1000, m = k => M0 + 60 * k
const PX = { AUDCAD: 0.9, AUDUSD: 0.65, EURUSD: 1.1, GBPJPY: 190.5, GBPUSD: 1.3, NZDUSD: 0.6, USDCAD: 1.37, USDCHF: 0.88, USDJPY: 150.2 }
function velasDe(par) { const o = []; for (let t = M0; t < M0 + 5 * 86400; t += 60) if (!minutoCerrado(t)) o.push({ time: t, open: PX[par], high: PX[par], low: par==='EURUSD' && t===m(5)?1.09:PX[par], close: PX[par], volume: 1 }); return o }
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
  const d = 'v1c20'
  pg.base(d)
  const a4 = pg.comoEjecutor(d, S4B), a6 = pg.comoEjecutor(d, S6)
  ver('control: sim-004b y sim-006 aplicadas', a4.ok && a6.ok, (a4.err + a6.err).slice(0, 200))
  // plan extra (12 sesiones): esta prueba crea 4
  pg.alumno(d, AL, { plan: 'extra' })
  const uno = q => pg.uno(d, q)
  const leeSesion = async id => { const t = uno(`select row_to_json(s)::text from public.sim_sessions s where id = ${L(id)}`); return t ? JSON.parse(t) : null }
  const puertos = { almacen: mercado, rpc: pg.rpc(d), parDeId: pg.parDeId(d), leeSesion, ahora: () => Date.parse('2026-10-14T10:00:00Z') }
  const orden = { '/api/sim/crear': CR.ordenCrear, '/api/sim/tomar': TO.ordenTomar, '/api/sim/comando': CO.ordenComando, '/api/sim/estado': ES.ordenEstado, '/api/sim/avanzar-fase': FA.ordenFase }
  // las trampas del transporte de la pagina (nunca en el servidor)
  const T = { sobre: null, malFormado: false, invalidoEstado: false, fallaSiguiente: null, caeTrasAvanzar: false, pierdeAbrir: false, conflictosCancelar: 0, estadoCaido: false, caeTrasAbrir: false, caeTrasFase: false }
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
    if (ruta === '/api/sim/comando' && T.fallaSiguiente) { const motivo=T.fallaSiguiente;T.fallaSiguiente=null;return {http:409,cuerpo:{ok:false,motivo}} }
    let r = await directo(ruta, cuerpo)
    if (ruta === '/api/sim/estado' && T.sobre && r.http === 200) { r = structuredClone(r); T.sobre(r.cuerpo) }
    if (ruta === '/api/sim/estado' && T.invalidoEstado && r.http===200) {const cuerpo={...r.cuerpo};delete cuerpo.estado;return {...r,cuerpo}}
    if (ruta === '/api/sim/estado' && T.malFormado && r.http===200) {const cuerpo={...r.cuerpo,estado:{...r.cuerpo.estado,posiciones:'no-es-una-lista'}};return {...r,cuerpo}}
    if (ruta === '/api/sim/comando' && cuerpo.tipo === 'avanzar' && T.caeTrasAvanzar && r.http===200) {T.caeTrasAvanzar=false;T.estadoCaido=true}
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


  async function simple() {
    const sid=await crea(), ps={current:{}}, avisos=[];
    const p=PA.creaPantallaV1({sessionId:sid,usuario:AL,sesion:await leeSesion(sid),nuevoId,local:web(),almacenSesion:web(),pairState:ps,llama,avisa:a=>avisos.push(a),esperasRelectura:[0,0,0],esperasCancelar:[20,40,80]});
    await p.arranca();await p.cliente.envia('avanzar',{hasta:m(2),motivo:'goto'});p.vuelca();
    return {sid,p,ps,avisos,pos:()=>ps.current['EUR/USD']?.positions??[],ords:()=>ps.current['EUR/USD']?.orders??[]};
  }
  const abre=(p,more={})=>p.envia({tipo:'abrir',carga:{par:'EURUSD',lado:'BUY',orden:'mercado',lotes:'1',cotizadoEn:p.cursor(),...more}},{entry:1.1});



  const CAMBIOS = {
    terminal: c => { c.terminal = 'superada' },
    escritor: c => { c.escritor = { cliente_id: 'pestana-ajena', hasta: '2030-01-01T00:00:00Z' } },
    valoracion: c => { c.valoracion = { ...(c.valoracion ?? {}), equity_µ: '1' } },
  }
  for (const [campo, cambia] of Object.entries(CAMBIOS)) {
    titulo(`F · ${campo} cambiado en el transporte (la huella intacta)`)
    const v = await simple(); await abre(v.p)
    ver(`control: F ${campo} · una posicion confirmada y pintada`, v.pos().length === 1 && !v.p.cliente.desincronizado)
    v.avisos.length = 0
    T.sobre = cambia
    let error = null
    try { await v.p.cliente.leeEstado(); v.p.vuelca() } catch (e) { error = String(e?.message ?? e) }
    enviados.length = 0
    try { await abre(v.p) } catch (e) { error ??= String(e?.message ?? e) }
    oraculo('V1C20', `F · ${campo} cambiado: relectura fallida: desincronizado con el aviso, la posicion pintada y otra orden no sale`,
      !error && v.p.cliente.desincronizado && v.avisos.includes(AVISO) && v.pos().length === 1 && enviados.length === 0, tx({ error, des: v.p.cliente.desincronizado, avisos: v.avisos, pos: v.pos().map(p => p.id), enviados }))
    T.sobre = null
    await v.p.cliente.leeEstado(); v.p.vuelca()
    const f = await leeSesion(v.sid)
    oraculo('V1C20', `F · ${campo}: la relectura sana de la misma version recupera`, !v.p.cliente.desincronizado && v.p.cliente.estado?.version === Number(f.version) && v.pos().length === 1,
      tx({ des: v.p.cliente.desincronizado, v: v.p.cliente.estado?.version, fila: f.version }))
  }

  titulo('E · el escritor cambia de verdad en la misma version (otra pestaña toma el escritor)')
  {
    const v = await simple(); await abre(v.p)
    const antes = await leeSesion(v.sid)
    const yo = v.p.cliente.estado?.escritor?.cliente_id ?? null
    const t = await directo('/api/sim/tomar', { session_id: v.sid, command_id: nuevoId(), epoca: 1, cliente_id: 'pestana-otra', forzar: true })
    const despues = await leeSesion(v.sid)
    ver('control: E · la otra pestaña toma el escritor sin subir la version', t.http === 200 && Number(despues.version) === Number(antes.version) && despues.escritor?.cliente_id === 'pestana-otra' && yo !== 'pestana-otra', tx({ t: t.http, v: [antes.version, despues.version], escritor: despues.escritor?.cliente_id, yo }))
    v.avisos.length = 0
    let error = null
    try { await v.p.cliente.leeEstado(); v.p.vuelca() } catch (e) { error = String(e?.message ?? e) }
    oraculo('V1C20', 'E · la respuesta verificada con el escritor nuevo se instala (escritor de la otra pestaña), sin bloquear ni avisar',
      !error && !v.p.cliente.desincronizado && v.p.cliente.estado?.escritor?.cliente_id === 'pestana-otra' && v.avisos.length === 0 && v.pos().length === 1,
      tx({ error, des: v.p.cliente.desincronizado, escritor: v.p.cliente.estado?.escritor, avisos: v.avisos }))
  }
}finally{pg.cierra()}
fin();
