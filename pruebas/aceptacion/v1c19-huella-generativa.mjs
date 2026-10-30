/**
 * V1C19 · PRUEBA GENERATIVA DE LA RELECTURA (orden 1-182 del CTO; PSIMM3-01, la 3.ª vez de la familia). La regla: la pantalla
 * v1 solo acepta una cartera COMPLETA y VERIFICADA (lib/sim/v1/huella.mjs); todo lo demas es una relectura fallida.
 * Se generan TODAS las formas de respuesta de GET /api/sim/estado a partir de respuestas REALES (lib/servidor + PostgreSQL
 * desechable, capturadas una vez): cada campo (y cada campo de la cartera, de la primera posicion y orden y de la huella)
 * ausente, null o con otro tipo; cada lista vacia, cortada por delante o por detras o con un elemento repetido; cada entero
 * ±1; la version (y la de la huella) igual, menor y mayor; cuerpos enteros (null, vacio, lista, {ok}, {ok, version}); la
 * respuesta coherente de la version anterior; y, sobre la misma version, otra cartera COHERENTE (huella recalculada) sin una
 * posicion o sin una orden. Cada forma se pasa por cinco entradas (tras abrir, tras Step, tras Go to, tras un lote del Play
 * y una relectura de la version instalada) y en cartera y en reto (2F), con la pantalla v1 REAL (pantalla.js) sobre un
 * transporte que devuelve lo capturado.
 * EL INVARIANTE, en cada forma: (1) nada lanza; (2) ninguna posicion u orden viva que se veia deja de verse; (3) si lo pintado
 * no es exactamente el servidor (o la version no es la suya), la pantalla esta desincronizada, con el aviso, y ni una orden
 * nueva ni un Step salen al servidor; (4) con la respuesta sana de vuelta (la misma version), se reconcilia y pinta = servidor
 * (tras un avance, con los Steps de la recuperacion hasta el cursor confirmado, como en PSIMM3-02).
 * Controles: la forma sana se acepta sin bloqueo; el detector bloquea alguna forma (no aprueba en vacio); SHA-256 de la
 * huella = node:crypto. Datos inventados. Sin red.
 */
import { createHash } from 'node:crypto'
// orden 1-179 (a): el dia ancla del mercado de la prueba (crear exige las fechas dentro de lo publicado)
import { anclados } from '../mercado-ancla.mjs'
import { register } from 'node:module'
register('../espias-vela.mjs', import.meta.url)
const { titulo, ver, oraculo, fin, importa, fuente, asienta, escenario } = await import('../lib.mjs')
const HOOK = await importa('components/useSesionV1.js').catch(() => null)
const PA = await importa('lib/sim/v1/pantalla.js').catch(() => null)
if (!HOOK?.default || !PA?.creaPantallaV1) { for (let i = 0; i < 22; i++) oraculo('V1C19', `caso ${i}: sin la pantalla v1 no se puede`, false, 'no esta'); fin() }
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
const deEnsayo = t => { if (t.split(HUECO).length !== 2) throw new Error('el hueco no esta una vez'); return t.replace(HUECO, "v_guarda pg_catalog.text := 'montaje de ensayo (v1c19)';") }
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
  const d = 'v1c19'
  pg.base(d)
  const a4 = pg.comoEjecutor(d, S4B), a6 = pg.comoEjecutor(d, S6)
  ver('control: sim-004b y sim-006 aplicadas', a4.ok && a6.ok, (a4.err + a6.err).slice(0, 200))
  // plan extra (12 sesiones): esta prueba crea 8
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



  const tick = () => new Promise(r => setImmediate(r))
  // ── 1 · LA CAPTURA: respuestas reales del servidor (una sesion por entrada y tipo) ──
  // el transporte real que, ademas, apunta la ultima respuesta del comando y la primera lectura de estado despues
  let captura = null
  async function llamaCaptura(ruta, o) {
    const r = await directo(ruta, o.cuerpo)
    if (captura && ruta === '/api/sim/comando') { captura.ack = structuredClone(r); captura.despues = null }
    if (captura && ruta === '/api/sim/estado' && captura.ack && !captura.despues) captura.despues = structuredClone(r)
    return r
  }
  const engine = { candles: Array.from({ length: 40 }, (_, i) => ({ time: m(i) })), seekToTime: () => {} }
  const MERCADO = { par: 'EURUSD', lado: 'BUY', orden: 'mercado', lotes: '1' }
  async function prepara(reto) {
    const sid = await crea(reto), ps = { current: {} }
    const p = PA.creaPantallaV1({ sessionId: sid, usuario: AL, sesion: await leeSesion(sid), nuevoId, local: web(), almacenSesion: web(), pairState: ps, llama: llamaCaptura, esperasRelectura: [0, 0, 0] })
    await p.arranca()
    await p.cliente.envia('avanzar', { hasta: m(4), motivo: 'goto' })
    await p.envia({ tipo: 'abrir', carga: { ...MERCADO, cotizadoEn: p.cursor() } }, { entry: 1.1 })
    await p.envia(OR.comandoAbrir({ pair: 'EUR/USD', side: 'BUY_LIMIT', entry: 1.095, lots: 1, sl: 1.085, tp: 1.115, cursor: p.cursor() }), { entry: 1.095 })
    const antes = structuredClone(await directo('/api/sim/estado', { session_id: sid }))
    return { sid, p, antes }
  }
  const ENTRADAS = ['abrir', 'paso', 'goto', 'play', 'relectura']
  const hace = async (p, entrada) => {
    if (entrada === 'abrir') return p.envia({ tipo: 'abrir', carga: { ...MERCADO, cotizadoEn: p.cursor() } }, { entry: 1.1 })
    if (entrada === 'relectura') { await p.cliente.leeEstado(); p.vuelca(); return null }
    const av = p.avance({ engine: () => engine, par: () => 'EUR/USD' })
    ultimoAvance = av
    if (entrada === 'paso') return av.paso()
    if (entrada === 'goto') return av.irA(m(14))
    return av.play({ lote: 12, hasta: m(14) })
  }
  let ultimoAvance = null
  const capturado = {}
  for (const [tipo, reto] of [['cartera', null], ['reto', '2F']]) {
    for (const entrada of ENTRADAS.filter(e => e !== 'relectura')) {
      const { sid, p, antes } = await prepara(reto)
      captura = { ack: null, despues: null }
      await hace(p, entrada)
      const fila = await leeSesion(sid)
      const c = captura; captura = null
      ver(`control: captura ${tipo}/${entrada}: ACK 200 confirmado y lectura de la version de la fila`, c.ack?.http === 200 && c.despues?.http === 200 && c.despues.cuerpo.version === Number(fila.version) && c.despues.cuerpo.version > antes.cuerpo.version,
        tx({ ack: c.ack?.http, v: c.despues?.cuerpo?.version, fila: fila.version, antes: antes.cuerpo.version }))
      capturado[`${tipo}/${entrada}`] = { antes, ack: c.ack, despues: c.despues }
      if (entrada === 'abrir') capturado[`${tipo}/relectura`] = { antes, ack: null, despues: antes }
    }
  }
  const idsServidor = cuerpo => { const e = cuerpo.estado, c = e.esquema === 'reto@1' ? e.motor : e; return { pos: c.posiciones.map(x => x.id), ord: c.ordenes.map(x => x.id) } }
  for (const [k, v] of Object.entries(capturado)) {
    const a = idsServidor(v.antes.cuerpo), d = idsServidor(v.despues.cuerpo)
    ver(`control: ${k}: antes y despues con posiciones y ordenes${k.endsWith('/abrir') || k.endsWith('/relectura') ? '' : ' (y el fill de la limit: una orden menos)'}`, a.pos.length >= 1 && a.ord.length === 1 && (k.endsWith('/abrir') || k.endsWith('/relectura') ? d.ord.length === 1 : d.ord.length === 0 && d.pos.length === 2), tx({ a, d }))
  }

  // ── 2 · LAS FORMAS ──
  const NO_BAJAR = new Set(['costes', 'versiones', 'cotizaciones', 'limites', 'sincronizacion', 'valoracion', 'escritor', 'reglas', 'breach', 'superada', 'objetivo', 'dias_con_apertura', 'abierta_en', 'creada_en'])
  function rutas(x, pre = [], prof = 0, out = []) {
    if (x == null || typeof x !== 'object') return out
    const claves = Array.isArray(x) ? (x.length ? [0] : []) : Object.keys(x)
    for (const k of claves) {
      const r = [...pre, k]
      out.push(r)
      if (prof < 5 && !NO_BAJAR.has(String(k))) rutas(x[k], r, prof + 1, out)
    }
    return out
  }
  const lee = (o, r) => r.reduce((a, k) => (a == null ? a : a[k]), o)
  function pon(o, r, f) {
    const c = structuredClone(o)
    if (!r.length) return f(c)
    const padre = lee(c, r.slice(0, -1)), k = r.at(-1)
    if (padre == null || typeof padre !== 'object') return null
    const v = f(padre[k])
    if (v === QUITA) { if (Array.isArray(padre)) padre.splice(k, 1); else delete padre[k] } else padre[k] = v
    return c
  }
  const QUITA = Symbol('quita')
  const TIPOS = [['texto', () => 'x'], ['entero', () => 7], ['decimal', () => 7.5], ['booleano', () => true], ['lista', () => []], ['objeto', () => ({})]]
  function formas(cuerpo, anterior, conCoherentes) {
    const out = []
    const mete = (nombre, c) => { if (c !== null && JSON.stringify(c) !== JSON.stringify(cuerpo)) out.push({ nombre, cuerpo: c }) }
    for (const r of rutas(cuerpo)) {
      const n = r.join('.'), v = lee(cuerpo, r)
      mete(`${n} ausente`, pon(cuerpo, r, () => QUITA))
      mete(`${n} null`, pon(cuerpo, r, () => null))
      for (const [t, f] of TIPOS) mete(`${n} ${t}`, pon(cuerpo, r, f))
      if (Array.isArray(v)) {
        mete(`${n} vacia`, pon(cuerpo, r, () => []))
        if (v.length) {
          mete(`${n} sin el ultimo`, pon(cuerpo, r, a => a.slice(0, -1)))
          mete(`${n} sin el primero`, pon(cuerpo, r, a => a.slice(1)))
          mete(`${n} con el primero repetido`, pon(cuerpo, r, a => [a[0], ...a]))
        }
      }
      if (Number.isInteger(v)) { mete(`${n} -1`, pon(cuerpo, r, x => x - 1)); mete(`${n} +1`, pon(cuerpo, r, x => x + 1)) }
    }
    // la version, junto a la de la huella (si la hay): menor y mayor con el MISMO contenido
    for (const d of [-1, 1]) {
      const c = structuredClone(cuerpo); c.version += d; if (c.huella && Number.isInteger(c.huella.version)) c.huella.version += d
      mete(`version y huella.version ${d < 0 ? 'menor' : 'mayor'} (mismo contenido)`, c)
    }
    // cuerpos enteros
    mete('cuerpo null', { __cuerpo: null }); mete('cuerpo texto vacio', { __cuerpo: '' }); mete('cuerpo lista', { __cuerpo: [] })
    mete('cuerpo {}', { __cuerpo: {} }); mete('cuerpo {ok}', { __cuerpo: { ok: true } }); mete('cuerpo {ok, version}', { __cuerpo: { ok: true, version: cuerpo.version } })
    // la respuesta coherente de la version anterior (menor) y, en la misma version, otra cartera coherente
    if (anterior && anterior.version !== cuerpo.version) {
      mete('version anterior coherente (la respuesta real de antes)', structuredClone(anterior))
      // la version que ya tiene la pantalla (la anterior), coherente pero con otra cartera: contradice la instalada
      for (const [que, lista] of [['sin una posicion', 'posiciones'], ['sin una orden', 'ordenes']]) {
        const c = structuredClone(anterior), e = c.estado.esquema === 'reto@1' ? c.estado.motor : c.estado
        if (!e[lista].length) continue
        e[lista] = e[lista].slice(1)
        if (c.huella && HU?.huellaDe) c.huella = HU.huellaDe(c.version, c.estado)
        mete(`version instalada (la anterior) coherente ${que} (huella recalculada)`, c)
      }
    }
    if (conCoherentes) for (const [que, lista] of [['sin una posicion', 'posiciones'], ['sin una orden', 'ordenes']]) {
      const c = structuredClone(cuerpo), e = c.estado.esquema === 'reto@1' ? c.estado.motor : c.estado
      if (!e[lista].length) continue
      e[lista] = e[lista].slice(1)
      if (c.huella && HU?.huellaDe) c.huella = HU.huellaDe(c.version, c.estado)
      mete(`misma version coherente ${que} (huella recalculada)`, c)
    }
    return out
  }
  const respuestaDe = f => ('__cuerpo' in f.cuerpo ? { http: 200, cuerpo: f.cuerpo.__cuerpo } : { http: 200, cuerpo: f.cuerpo })

  // ── 3 · LA REPRODUCCION: la pantalla v1 real sobre lo capturado ──
  const pintado = ps => {
    const pos = [], ord = []
    for (const st of Object.values(ps.current)) { for (const x of st?.positions ?? []) pos.push(x.id); for (const x of st?.orders ?? []) ord.push(x.id) }
    return { pos, ord }
  }
  // (1) «nada lanza» incluye lo que lanza FUERA de la llamada (p. ej. un repintado en segundo plano): mientras corre una
  // forma, una excepcion o promesa rechazada sin capturar se apunta como fallo DE ESA FORMA (rojo), no tumba la prueba;
  // fuera de una forma, el manejador de lib.mjs de siempre (codigo 3)
  let enCurso = null
  for (const ev of ['uncaughtException', 'unhandledRejection']) {
    const previos = process.listeners(ev)
    process.removeAllListeners(ev)
    process.on(ev, e => { if (enCurso) { enCurso.fallos.push(`(1) lanza en segundo plano: ${String(e?.stack ?? e).slice(0, 300)}`); return } for (const f of previos) f(e) })
  }
  const reales = l => l.filter(i => !String(i).startsWith('v1-'))
  const igual = (a, b) => [...a].sort().join() === [...b].sort().join()
  async function corre(cap, entrada, forma) {
    const fase = { despues: false, mutar: true }, enviados = []
    const sano = cap.despues
    async function llamaF(ruta, o) {
      await tick()
      if (ruta === '/api/sim/tomar') return { http: 200, cuerpo: { ok: true, testigo: 'testigo-ficticio' } }
      if (ruta === '/api/sim/estado') {
        if (entrada === 'relectura') return fase.despues && fase.mutar ? respuestaDe(forma) : structuredClone(sano)
        if (!fase.despues) return structuredClone(cap.antes)
        return fase.mutar ? respuestaDe(forma) : structuredClone(sano)
      }
      if (ruta === '/api/sim/comando') {
        if (fase.despues) { enviados.push(o.cuerpo?.tipo); return { http: 409, cuerpo: { ok: false, motivo: 'conflicto' } } }
        fase.despues = true
        return structuredClone(cap.ack)
      }
      return { http: 404, cuerpo: { ok: false } }
    }
    const ps = { current: {} }, avisos = []
    const p = PA.creaPantallaV1({ sessionId: cap.antes.cuerpo.session_id, usuario: AL, sesion: { epoca: 1 }, nuevoId, local: web(), almacenSesion: web(), pairState: ps, llama: llamaF, avisa: a => avisos.push(a), esperasRelectura: [0, 0, 0], esperasCancelar: [5, 5, 5] })
    const out = { forma: forma?.nombre ?? 'sana', entrada, fallos: [] }
    enCurso = out
    try {
      await p.arranca(); p.vuelca()
      const visto = pintado(ps)
      if (entrada === 'relectura') fase.despues = true
      ultimoAvance = null
      await hace(p, entrada); p.vuelca()
      const avEntrada = ultimoAvance
      const srv = idsServidor(sano.cuerpo), pin = pintado(ps)
      const vivas = [...srv.pos, ...srv.ord]
      // (2) lo que se veia y sigue vivo se sigue viendo
      const perdidas = [...visto.pos, ...visto.ord].filter(i => vivas.includes(i) && !reales([...pin.pos, ...pin.ord]).includes(i))
      if (perdidas.length) out.fallos.push(`(2) dejan de verse vivas: ${perdidas}`)
      const exacto = igual(reales(pin.pos), srv.pos) && igual(reales(pin.ord), srv.ord) && !pin.pos.concat(pin.ord).some(i => String(i).startsWith('v1-')) && p.cliente.estado?.version === sano.cuerpo.version
      out.bloqueada = p.cliente.desincronizado
      out.avisos = avisos.length
      if (!exacto) {
        // (3) desincronizada, con aviso, y nada nuevo sale
        if (!p.cliente.desincronizado) out.fallos.push(`(3) pintado ≠ servidor sin bloqueo: ${tx({ pin, srv, v: p.cliente.estado?.version })}`)
        if (!avisos.length) out.fallos.push('(3) sin aviso')
        enviados.length = 0
        await p.envia({ tipo: 'abrir', carga: { ...MERCADO, cotizadoEn: p.cursor() } }, { entry: 1.1 })
        await p.avance({ engine: () => engine, par: () => 'EUR/USD' }).paso()
        if (enviados.length) out.fallos.push(`(3) salen al servidor: ${enviados}`)
      }
      // (4) la respuesta sana de vuelta: se reconcilia (la misma version, leida de nuevo y completa)
      fase.mutar = false
      await p.cliente.reconcilia(); await p.cliente.leeEstado(); p.vuelca()
      // tras un avance confirmado sin relectura, lo confirmado se enseña con los Steps de la recuperacion (PSIMM3-02:
      // vela a vela, con sus paradas): se dan hasta alcanzar el cursor confirmado
      if (avEntrada) for (let k = 0; k < 20 && (avEntrada.mostrado ?? -1) < (p.cursor() ?? -1); k++) { await avEntrada.paso(); p.vuelca() }
      const fin2 = pintado(ps)
      if (p.cliente.desincronizado || !igual(fin2.pos, srv.pos) || !igual(fin2.ord, srv.ord)) out.recupera = false, out.fallos.push(`(4) no se recupera: ${tx({ fin2, srv, des: p.cliente.desincronizado })}`)
      else out.recupera = true
    } catch (e) { out.fallos.push(`(1) lanza: ${String(e?.stack ?? e).slice(0, 300)}`) }
    for (let k = 0; k < 20; k++) await tick()
    enCurso = null
    return out
  }

  titulo('control: el SHA-256 de la huella es el de node:crypto')
  {
    const textos = ['', 'abc', 'x'.repeat(55), 'x'.repeat(64), 'sim-huella@1|v=3|p=p1,p2|o=o3', 'ñ€😀'.repeat(30)]
    const ok = HU?.sha256Hex ? textos.every(t => HU.sha256Hex(t) === createHash('sha256').update(t, 'utf8').digest('hex')) : null
    if (ok === null) console.log('  (sin lib/sim/v1/huella.mjs: no hay SHA-256 que comprobar)')
    else ver('control: sha256Hex = node:crypto en 6 textos', ok)
  }

  let total = 0
  const resumen = {}
  for (const [k, cap] of Object.entries(capturado)) {
    const [tipo, entrada] = k.split('/')
    titulo(`${tipo} · ${entrada}`)
    const sana = await corre(cap, entrada, { nombre: 'sana', cuerpo: cap.despues.cuerpo })
    ver(`control: ${k} · la respuesta sana se acepta sin bloqueo y pinta = servidor`, !sana.bloqueada && !sana.fallos.length, tx(sana))
    // la misma version coherente con otra cartera solo contradice algo en la relectura (alli es la instalada); tras un ACK
    // es una version NUEVA coherente: indistinguible de un servidor que dice otra cosa (limite declarado de la huella)
    const fs_ = formas(cap.despues.cuerpo, entrada === 'relectura' ? null : cap.antes.cuerpo, entrada === 'relectura')
    let mal = [], bloqueadas = 0, noRecupera = [], bloqueadasDe = [], aceptadas = []
    const DEBE = /^(estado ausente|estado null|cuerpo |misma version coherente|estado(\.motor)?\.(posiciones|ordenes) (vacia|sin el))/
    for (const f of fs_) {
      const r = await corre(cap, entrada, f)
      if (DEBE.test(f.nombre)) bloqueadasDe.push(r)
      if (r.bloqueada) bloqueadas++; else aceptadas.push(r.forma)
      if (r.fallos.some(x => !x.startsWith('(4)'))) mal.push(r)
      if (r.recupera === false || r.fallos.some(x => x.startsWith('(1)'))) noRecupera.push(r)
    }
    total += fs_.length
    resumen[k] = { formas: fs_.length, bloqueadas, rompen: mal.length, sinRecuperar: noRecupera.length }
    // las que se aceptan (sin bloqueo): el invariante ya exige que pinten = servidor; aqui, cuales son
    console.log(`  aceptadas sin bloqueo (${aceptadas.length}): ${aceptadas.join(' | ')}`)
    if (entrada !== 'relectura') ver(`control: ${k} · el detector bloquea alguna forma (no aprueba en vacio)`, bloqueadas > 0, `${bloqueadas} de ${fs_.length}`)
    // la relectura de la version instalada: lo pintado sigue siendo el servidor aunque la respuesta falle, pero la 1-182 pide
    // que una relectura fallida avise y bloquee: al menos las que no traen cartera completa o traen otra en la misma version
    else oraculo('V1C19', `${k} · una relectura fallida (sin estado, cuerpo sin cartera, listas cortadas, otra cartera en la misma version) avisa y bloquea`,
      bloqueadasDe.length > 0 && bloqueadasDe.every(r => r.bloqueada && r.avisos > 0), `${bloqueadasDe.filter(r => !(r.bloqueada && r.avisos > 0)).length} de ${bloqueadasDe.length} sin bloquear · ${bloqueadasDe.filter(r => !(r.bloqueada && r.avisos > 0)).slice(0, 8).map(r => r.forma).join(' | ')}`)
    oraculo('V1C19', `${k} · ${fs_.length} formas: ninguna deja una posicion u orden viva invisible ni una orden nueva sin bloqueo (y nada lanza)`, mal.length === 0,
      `${mal.length} rompen · ${tx(mal.slice(0, 4).map(r => ({ forma: r.forma, fallos: r.fallos.map(x => x.slice(0, 220)) })))}${mal.length ? ' · todas: ' + mal.map(r => r.forma).join(' | ').slice(0, 1500) : ''}`)
    oraculo('V1C19', `${k} · con la respuesta sana de la misma version de vuelta, las ${fs_.length} se reconcilian (pinta = servidor)`, noRecupera.length === 0,
      `${noRecupera.length} sin recuperar · ${tx(noRecupera.slice(0, 3).map(r => ({ forma: r.forma, fallos: r.fallos.map(x => x.slice(0, 300)) })))} · ${noRecupera.slice(3, 12).map(r => r.forma).join(' | ')}`)
  }
  console.log(`\nFORMAS: ${total} en total (${Object.keys(capturado).length} entradas × tipo) · ${tx(resumen)}`)
}finally{pg.cierra()}
fin();
