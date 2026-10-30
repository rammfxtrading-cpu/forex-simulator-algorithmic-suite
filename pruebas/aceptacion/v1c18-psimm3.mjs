/**
 * V1C18 · LOS TRES HALLAZGOS DE PSIMM3 (Astra, dictamen 30-oct 18:15; orden 1-182 del CTO), cada uno con SU caso, sobre
 * lib/servidor REAL + PostgreSQL desechable. Los casos de Astra tal cual (pruebas/aceptacion/propia-familias-r3.mjs, en
 * revisiones-suite/2026-10-30-psimm3-astra-evidencias/actual/), mas los que pide la 1-182.
 *   A · PSIMM3-01 (la familia PSIMM1-01 → PSIMM2-01 → PSIMM3-01): la pantalla solo acepta una cartera COMPLETA y VERIFICADA.
 *       A1 cartera minima (Astra: {esquema, [], [], [], {}} en lugar del estado, el resto de la respuesta igual), A2 pares
 *       vacios, A3 esquema ajeno, A4 reto sin motor: aviso, la cartera sigue pintada, ninguna orden sale, y la relectura
 *       sana de la MISMA version recupera. A5 version igual con contenido distinto (huella recalculada: un estado
 *       coherente pero contradictorio con el instalado): relectura fallida. A6 abrir la pagina con la cartera minima: aviso
 *       y bloqueo (nada sale).
 *   B · PSIMM3-02: un avance confirmado sin relectura no pierde fills en ningun Step intermedio de la recuperacion. Step,
 *       Play y Go to por el mismo camino, cada uno con su prueba: B1 Go to (el caso de Astra: GET caido, relectura sana,
 *       Steps), B2 Go to sin relectura explicita (la reconcilia el Step), B3 Step, B4 Play.
 * Datos inventados. Sin red. En 2e1edc1 (r3): A1–A3, A5, A6 y B1–B2 en rojo.
 */
// orden 1-179 (a): el dia ancla del mercado de la prueba (crear exige las fechas dentro de lo publicado)
import { anclados } from '../mercado-ancla.mjs'
import { register } from 'node:module'
register('../espias-vela.mjs', import.meta.url)
const { titulo, ver, oraculo, fin, importa, fuente, asienta, escenario } = await import('../lib.mjs')
const HOOK = await importa('components/useSesionV1.js').catch(() => null)
const PA = await importa('lib/sim/v1/pantalla.js').catch(() => null)
if (!HOOK?.default || !PA?.creaPantallaV1) { for (let i = 0; i < 21; i++) oraculo('V1C18', `caso ${i}: sin la pantalla v1 no se puede`, false, 'no esta'); fin() }
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
const deEnsayo = t => { if (t.split(HUECO).length !== 2) throw new Error('el hueco no esta una vez'); return t.replace(HUECO, "v_guarda pg_catalog.text := 'montaje de ensayo (v1c18)';") }
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
  const d = 'v1c18'
  pg.base(d)
  const a4 = pg.comoEjecutor(d, S4B), a6 = pg.comoEjecutor(d, S6)
  ver('control: sim-004b y sim-006 aplicadas', a4.ok && a6.ok, (a4.err + a6.err).slice(0, 200))
  // plan extra (12 sesiones): esta prueba crea 10
  pg.alumno(d, AL, { plan: 'extra' })
  const uno = q => pg.uno(d, q)
  const leeSesion = async id => { const t = uno(`select row_to_json(s)::text from public.sim_sessions s where id = ${L(id)}`); return t ? JSON.parse(t) : null }
  const puertos = { almacen: mercado, rpc: pg.rpc(d), parDeId: pg.parDeId(d), leeSesion, ahora: () => Date.parse('2026-10-14T10:00:00Z') }
  const orden = { '/api/sim/crear': CR.ordenCrear, '/api/sim/tomar': TO.ordenTomar, '/api/sim/comando': CO.ordenComando, '/api/sim/estado': ES.ordenEstado, '/api/sim/avanzar-fase': FA.ordenFase }
  // las trampas del transporte de la pagina (nunca en el servidor)
  const T = { malFormado: false, invalidoEstado: false, fallaSiguiente: null, caeTrasAvanzar: false, pierdeAbrir: false, conflictosCancelar: 0, estadoCaido: false, caeTrasAbrir: false, caeTrasFase: false }
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
    if (ruta === '/api/sim/estado' && T.variante && r.http === 200) r = variante(r, T.variante)
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


  // las respuestas de Astra (propia-familias-r3) y la forja coherente de la 1-182 (A5): solo el transporte, nunca el servidor
  function variante(r, v) {
    r = structuredClone(r)
    const c = r.cuerpo
    if (v === 'pares-vacios') c.estado.pares = []
    if (v === 'cartera-minima') c.estado = { esquema: 'sim-cartera@1', posiciones: [], ordenes: [], pares: [], reloj: {} }
    if (v === 'reto-sin-motor') c.estado = { esquema: 'reto@1' }
    if (v === 'esquema-ajeno') c.estado = { esquema: 'ajeno', posiciones: [], ordenes: [], pares: [], reloj: {} }
    if (v === 'igual-sin-posiciones') {
      // otra cartera en la MISMA version, coherente: sin posiciones y, si el servidor manda huella, con la suya recalculada
      c.estado.posiciones = []
      if (c.huella && HU?.huellaDe) c.huella = HU.huellaDe(c.version, c.estado)
    }
    return r
  }
  const VARIANTES = [['A1', 'cartera-minima'], ['A2', 'pares-vacios'], ['A3', 'esquema-ajeno'], ['A4', 'reto-sin-motor']]
  for (const [n, variante] of VARIANTES) {
    titulo(`${n} · PSIMM3-01: GET 200 con ${variante}`)
    const v = await simple(); await abre(v.p)
    ver(`control: ${n} · una posicion confirmada y pintada`, v.pos().length === 1 && (await leeSesion(v.sid)).estado.posiciones.length === 1)
    T.variante = variante
    let error = null, r = null
    try { r = await abre(v.p) } catch (e) { error = String(e?.message ?? e) }
    const f = await leeSesion(v.sid)
    ver(`control: ${n} · la segunda apertura esta confirmada en PostgreSQL`, f.estado.posiciones.length === 2, tx({ r: r?.conclusion, pos: f.estado.posiciones.map(p => p.id) }))
    oraculo('V1C18', `${n} · ${variante}: relectura fallida: desincronizado con el aviso, las DOS posiciones pintadas y guardado() false (nada lanza)`,
      !error && v.p.cliente.desincronizado && v.avisos.includes(AVISO) && v.pos().length === 2 && v.p.cliente.guardado() === false,
      tx({ error, r: r?.conclusion, pantalla: v.pos().map(p => p.id), des: v.p.cliente.desincronizado, avisos: v.avisos }))
    enviados.length = 0
    try { await abre(v.p) } catch {}
    oraculo('V1C18', `${n} · ${variante}: otra orden NO sale mientras tanto`, enviados.length === 0 && (await leeSesion(v.sid)).estado.posiciones.length === 2, tx({ enviados }))
    T.variante = null
    await v.p.cliente.leeEstado(); v.p.vuelca()
    const g = await leeSesion(v.sid)
    oraculo('V1C18', `${n} · ${variante}: la relectura sana de la MISMA version recupera (pantalla = servidor, reconciliada)`,
      !v.p.cliente.desincronizado && v.p.cliente.estado?.version === Number(g.version) && v.pos().map(p => p.id).sort().join() === g.estado.posiciones.map(p => p.id).sort().join(),
      tx({ version: v.p.cliente.estado?.version, fila: g.version, pantalla: v.pos().map(p => p.id), des: v.p.cliente.desincronizado }))
  }

  titulo('A5 · version igual con contenido distinto (coherente): relectura fallida')
  {
    const v = await simple(); await abre(v.p)
    const f = await leeSesion(v.sid)
    ver('control: A5 · instalada la version de la fila con su posicion', v.p.cliente.estado?.version === Number(f.version) && v.pos().length === 1)
    v.avisos.length = 0
    T.variante = 'igual-sin-posiciones'
    let error = null
    try { await v.p.cliente.leeEstado(); v.p.vuelca() } catch (e) { error = String(e?.message ?? e) }
    oraculo('V1C18', 'A5 · la misma version con otra cartera no se instala: la posicion sigue pintada, desincronizado y el aviso',
      !error && v.pos().length === 1 && v.p.cliente.desincronizado && v.avisos.includes(AVISO), tx({ error, pantalla: v.pos().map(p => p.id), des: v.p.cliente.desincronizado, avisos: v.avisos }))
    enviados.length = 0
    try { await abre(v.p) } catch {}
    oraculo('V1C18', 'A5 · mientras tanto, otra orden NO sale', enviados.length === 0, tx({ enviados }))
    T.variante = null
    await v.p.cliente.leeEstado(); v.p.vuelca()
    oraculo('V1C18', 'A5 · la relectura sana recupera', !v.p.cliente.desincronizado && v.pos().length === 1, tx({ des: v.p.cliente.desincronizado, pantalla: v.pos().map(p => p.id) }))
  }

  titulo('A6 · abrir la pagina con la cartera minima: aviso y bloqueo')
  {
    const v0 = await simple(); await abre(v0.p)
    const sid = v0.sid, ps = { current: {} }, avisos = []
    // la pestaña de antes suelta el escritor (como al cerrarla)
    uno("update public.sim_arrendamientos set hasta = now() - interval '1 minute'")
    T.variante = 'cartera-minima'
    const p = PA.creaPantallaV1({ sessionId: sid, usuario: AL, sesion: await leeSesion(sid), nuevoId, local: web(), almacenSesion: web(), pairState: ps, llama, avisa: a => avisos.push(a), esperasRelectura: [0, 0, 0], esperasCancelar: [20, 40, 80] })
    let error = null
    try { await p.arranca() } catch (e) { error = String(e?.message ?? e) }
    enviados.length = 0
    let r = null
    try { r = await p.envia({ tipo: 'abrir', carga: { par: 'EURUSD', lado: 'BUY', orden: 'mercado', lotes: '1', cotizadoEn: m(2) } }, { entry: 1.1 }) } catch (e) { error ??= String(e?.message ?? e) }
    oraculo('V1C18', 'A6 · al abrir la pagina con la cartera minima: aviso, nada instalado y ninguna orden sale', !error && avisos.length > 0 && p.cliente.estado == null && enviados.length === 0,
      tx({ error, avisos, version: p.cliente.estado?.version ?? null, enviados, r: r?.conclusion }))
    T.variante = null
    await p.cliente.leeEstado(); p.vuelca()
    oraculo('V1C18', 'A6 · con la lectura sana, la cartera aparece', (ps.current['EUR/USD']?.positions ?? []).length === 1, tx({ pantalla: (ps.current['EUR/USD']?.positions ?? []).map(x => x.id) }))
  }

  // B: una limit a 1,095 y la vela m(5) con minimo 1,09 (velasDe): el motor la llena en m(5) como p<seq>
  async function conFill() {
    const v = await simple(); await limitDelDibujo(v.p, 1.095, 'Dfill')
    const fotos = []
    const engine = { candles: Array.from({ length: 40 }, (_, i) => ({ time: m(i) })), seekToTime: () => {} }
    const av = v.p.avance({ engine: () => engine, par: () => 'EUR/USD' })
    const foto = () => { v.p.vuelca(); fotos.push({ mostrado: av.mostrado, pos: v.pos().map(p => p.id), ord: v.ords().map(o => o.id) }) }
    return { ...v, av, fotos, foto }
  }
  const tFill = m(5)
  const bienEnElFill = fotos => fotos.some(f => f.mostrado != null && f.mostrado >= tFill) && fotos.filter(f => f.mostrado != null && f.mostrado >= tFill).every(f => f.pos.length === 1 && f.ord.length === 0)
  const bienAntes = fotos => fotos.filter(f => f.mostrado != null && f.mostrado < tFill).every(f => f.pos.length === 0 && f.ord.length === 1)
  async function filaFill(sid) { const f = await leeSesion(sid); return { pos: f.estado.posiciones.map(p => p.id), ord: f.estado.ordenes.map(o => o.id), cursor: f.estado.reloj.cursor } }

  for (const [n, explicita] of [['B1', true], ['B2', false]]) {
    titulo(`${n} · PSIMM3-02: Go to confirmado sin relectura y Steps de recuperacion${explicita ? ' (con la relectura explicita de Astra)' : ' (los reconcilia el Step)'}`)
    const v = await conFill()
    T.caeTrasAvanzar = true
    const r = await v.av.irA(m(14))
    const f = await filaFill(v.sid)
    ver(`control: ${n} · el Go to confirmo el fill en PostgreSQL y la lectura cayo`, r.conclusion === 'desincronizado' && f.pos.length === 1 && f.ord.length === 0 && f.cursor === m(14), tx({ r: r.conclusion, f }))
    T.estadoCaido = false
    if (explicita) await v.p.cliente.leeEstado()
    for (let i = 0; i < 14; i++) { await v.av.paso(); await asienta(); v.foto() }
    oraculo('V1C18', `${n} · Go to: en cada Step desde la vela del fill, la posicion (y no la pendiente)`, bienEnElFill(v.fotos), tx({ fotos: v.fotos }))
    ver(`control: ${n} · antes de la vela del fill, la pendiente`, bienAntes(v.fotos), tx({ fotos: v.fotos }))
  }

  titulo('B3 · PSIMM3-02: Step confirmado sin relectura (la vela del fill) y recuperacion')
  {
    const v = await conFill()
    await v.av.paso(); await v.av.paso()           // m(3), m(4)
    ver('control: B3 · en m(4), la pendiente', v.av.mostrado === m(4) && v.ords().length === 1, tx({ mostrado: v.av.mostrado }))
    T.caeTrasAvanzar = true
    const r = await v.av.paso()                    // m(5): el fill
    const f = await filaFill(v.sid)
    ver('control: B3 · el Step confirmo el fill y la lectura cayo', r.conclusion === 'desincronizado' && f.pos.length === 1 && f.cursor === m(5), tx({ r: r.conclusion, f }))
    T.estadoCaido = false
    for (let i = 0; i < 4; i++) { await v.av.paso(); await asienta(); v.foto() }
    oraculo('V1C18', 'B3 · Step: al recuperar, en la vela del fill y despues, la posicion (y no la pendiente)', bienEnElFill(v.fotos), tx({ fotos: v.fotos }))
  }

  titulo('B4 · PSIMM3-02: Play confirmado sin relectura y Steps de recuperacion')
  {
    const v = await conFill()
    T.caeTrasAvanzar = true
    const r = await v.av.play({ lote: 12, hasta: m(14) })
    const f = await filaFill(v.sid)
    ver('control: B4 · el lote del Play confirmo el fill y la lectura cayo', r.conclusion === 'desincronizado' && f.pos.length === 1, tx({ r: r.conclusion, f }))
    T.estadoCaido = false
    for (let i = 0; i < 14; i++) { await v.av.paso(); await asienta(); v.foto() }
    oraculo('V1C18', 'B4 · Play: en cada Step desde la vela del fill, la posicion (y no la pendiente)', bienEnElFill(v.fotos), tx({ fotos: v.fotos }))
  }
}finally{pg.cierra()}
fin();
