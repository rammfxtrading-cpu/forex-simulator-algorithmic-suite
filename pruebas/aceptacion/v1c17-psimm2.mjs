/**
 * V1C17 · LOS DOS HALLAZGOS DE PSIMM2 (Astra, dictamen 30-oct 15:37; orden 1-180 del CTO), con los casos de Astra tal cual
 * (sus reproductores pruebas/propias/familias-psimm2.mjs P5 y play-paradas.mjs / play-contraste.mjs P6, en
 * revisiones-suite/2026-10-30-psimm2-astra-evidencias/actual/), sobre lib/servidor REAL + PostgreSQL desechable.
 *   P5 · PSIMM2-01: abrir una posicion; el ACK confirma y el GET de estado responde 200 con la version pero SIN estado. La
 *        regla del CTO: un GET 200 sin cartera nunca oculta posiciones reales ni deja enviar ordenes: es una relectura
 *        fallida (aviso y bloqueo de PSIMM1-01), y la relectura sana de la MISMA version la recupera
 *   P5b · familia: la variante con la cartera mal formada (posiciones que no es una lista) y otra orden pulsada mientras
 *        tanto: no sale
 *   P6 · PSIMM2-02: Play lote 12 con un fill intermedio de una limit; el ACK confirma y el GET cae. Al volver la lectura,
 *        con Steps, en la vela del fill (y despues) se ve la posicion, no la pendiente
 *   P6b · el contraste de Astra (play-contraste): igual, con la relectura explicita del estado antes de los Steps
 * Datos inventados. Sin red. En f54e987 (r2): P5 rojo (2), P6 rojo (Astra: 1 rojo en r2, verde en r1).
 */
// orden 1-179 (a): el dia ancla del mercado de la prueba (crear exige las fechas dentro de lo publicado)
import { anclados } from '../mercado-ancla.mjs'
import { register } from 'node:module'
register('../espias-vela.mjs', import.meta.url)
const { titulo, ver, oraculo, fin, importa, fuente, asienta, escenario } = await import('../lib.mjs')
const HOOK = await importa('components/useSesionV1.js').catch(() => null)
const PA = await importa('lib/sim/v1/pantalla.js').catch(() => null)
if (!HOOK?.default || !PA?.creaPantallaV1) { for (let i = 0; i < 6; i++) oraculo('V1C17', `caso ${i}: sin la pantalla v1 no se puede`, false, 'no esta'); fin() }
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
const tx = x => JSON.stringify(x, (k, v) => (typeof v === 'bigint' ? `${v}n` : v))
const HUECO = "v_guarda pg_catalog.text := '⟦HUECO guarda canonica⟧';"
const deEnsayo = t => { if (t.split(HUECO).length !== 2) throw new Error('el hueco no esta una vez'); return t.replace(HUECO, "v_guarda pg_catalog.text := 'montaje de ensayo (v1c17)';") }
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
  const d = 'v1c17'
  pg.base(d)
  const a4 = pg.comoEjecutor(d, S4B), a6 = pg.comoEjecutor(d, S6)
  ver('control: sim-004b y sim-006 aplicadas', a4.ok && a6.ok, (a4.err + a6.err).slice(0, 200))
  pg.alumno(d, AL)
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
    const r = await directo(ruta, cuerpo)
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

  titulo('P6 · Play con fill intermedio, ACK sin lectura y reconciliación por Step');
  {
    const v=await simple();await limitDelDibujo(v.p,1.095,'Dfill');
    const pasos=[];
    const engine={candles:Array.from({length:40},(_,i)=>({time:m(i)})),seekToTime:t=>pasos.push({t,pos:v.pos().map(p=>p.id),ord:v.ords().map(o=>o.id)})};
    const av=v.p.avance({engine:()=>engine,par:()=> 'EUR/USD'});
    T.caeTrasAvanzar=true;const r=await av.play({lote:12,hasta:m(14)});
    const tFill=r.paradas?.find(q=>q.tipo==='fill')?.t;const f=await leeSesion(v.sid);ver('fill real en el lote confirmado y lectura caída',r.conclusion==='desincronizado'&&Number.isInteger(tFill)&&f.estado.posiciones.length===1&&f.estado.ordenes.length===0,tx({r:r.conclusion,pos:f.estado.posiciones.map(p=>p.id),cursor:f.estado.reloj.cursor,tFill,paradas:r.paradas}));
    const bloqueado=await av.irA(m(16));
    ver('control: P6 · Go to bloqueado mientras no se reconciliaba',bloqueado.conclusion==='desincronizado');
    T.estadoCaido=false;
    const fotos=[];
    for(let i=0;i<12;i++){await av.paso();await asienta();v.p.vuelca();fotos.push({mostrado:av.mostrado,pos:v.pos().map(p=>p.id),ord:v.ords().map(o=>o.id)})}
    oraculo('V1C17','P6 · PSIMM2-02: al volver a mostrar la vela del fill (Steps tras volver la lectura), se ve la posicion confirmada y no la pendiente',fotos.filter(f=>f.mostrado>=tFill).every(f=>f.pos.length===1&&f.ord.length===0),tx({tFill,fotos,pasos}));
  }

  titulo('P6b · el contraste de Astra: relectura explicita antes de los Steps');
  {
    const v=await simple();await limitDelDibujo(v.p,1.095,'Dfill');
    const engine={candles:Array.from({length:40},(_,i)=>({time:m(i)})),seekToTime:()=>{}};
    const av=v.p.avance({engine:()=>engine,par:()=> 'EUR/USD'});
    T.caeTrasAvanzar=true;const r=await av.play({lote:12,hasta:m(14)});
    const tFill=r.paradas?.find(q=>q.tipo==='fill')?.t;
    ver('control: P6b · fill en el lote y lectura caida',['desincronizado','sin_avance'].includes(r.conclusion)&&Number.isInteger(tFill),tx({r:r.conclusion,tFill}));
    T.estadoCaido=false;await v.p.cliente.leeEstado();
    const fotos=[];
    for(let i=0;i<12;i++){await av.paso();await asienta();v.p.vuelca();fotos.push({mostrado:av.mostrado,pos:v.pos().map(p=>p.id),ord:v.ords().map(o=>o.id)})}
    oraculo('V1C17','P6b · (contraste) con la relectura explicita, en la vela del fill y despues: la posicion, no la pendiente',fotos.filter(f=>f.mostrado>=tFill).every(f=>f.pos.length===1&&f.ord.length===0)&&fotos.some(f=>f.mostrado>=tFill),tx({tFill,fotos}));
  }

  titulo('P5 · PSIMM2-01: GET 200 con version y SIN estado');
  {
    const v=await simple();T.invalidoEstado=true;enviados.length=0;
    const r=await abre(v.p);const f=await leeSesion(v.sid);
    ver("control: P5 · ACK aceptado y una posicion en PostgreSQL",r.recibo?.resultado==='aceptado'&&f.estado.posiciones.length===1);
    const tras={r:r.conclusion,version:v.p.cliente.estado.version,servidor:f.estado.posiciones.map(o=>o.id),pantalla:v.pos().map(o=>o.id),avisos:v.avisos,guardado:v.p.cliente.guardado(),desincronizado:v.p.cliente.desincronizado};
    oraculo('V1C17','P5 · una respuesta sin estado no reconcilia ni hace invisible la posicion: desincronizado, con el aviso, la posicion pintada y guardado() false',v.p.cliente.desincronizado&&v.avisos.includes(AVISO)&&v.pos().length===1&&v.p.cliente.guardado()===false,tx(tras));
    enviados.length=0;
    const r2=await abre(v.p);
    oraculo('V1C17','P5 · mientras tanto otra orden NO sale (bloqueo de PSIMM1-01) y sigue el aviso',r2.conclusion==='desincronizado'&&enviados.filter(e=>e.tipo==='abrir').length===0&&(await leeSesion(v.sid)).estado.posiciones.length===1,tx({r2:r2.conclusion,enviados}));
    T.invalidoEstado=false;await v.p.cliente.leeEstado();v.p.vuelca();
    oraculo('V1C17','P5 · la relectura valida de la MISMA version recupera la posicion (y se reconcilia)',v.pos().length===1&&!v.p.cliente.desincronizado&&v.p.cliente.estado.version===f.version,tx({version:v.p.cliente.estado.version,fila:f.version,pantalla:v.pos().map(o=>o.id),des:v.p.cliente.desincronizado}));
  }

  titulo('P5b · familia: cartera mal formada (posiciones no es una lista)');
  {
    const v=await simple();T.malFormado=true;
    // en f54e987 la cartera mal formada se instala y la vista LANZA al pintarla: se cuenta como rojo (con su mensaje), no como fallo de la prueba
    let r=null, lanza=null
    try { r=await abre(v.p) } catch (e) { lanza=String(e?.message??e) }
    oraculo('V1C17','P5b · un 200 con la cartera mal formada tampoco reconcilia: desincronizado, aviso y la posicion pintada (y nada lanza)',!lanza&&v.p.cliente.desincronizado&&v.avisos.includes(AVISO)&&v.pos().length===1,tx({r:r?.conclusion,lanza,avisos:v.avisos}));
    T.malFormado=false;
  }
}finally{pg.cierra()}
fin();
