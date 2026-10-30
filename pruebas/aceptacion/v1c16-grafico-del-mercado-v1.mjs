/**
 * V1C16 · EN V1, EL GRAFICO PINTA DEL MERCADO V1: EL MISMO TROZO Y LA MISMA VERSION QUE EL MOTOR (orden 1-179 (d) del CTO:
 * «motor ≠ grafico no es aceptable»). lib/servidor REAL + PostgreSQL desechable; el grafico, lib/sim/v1/velas.js (lo que
 * usa la pagina) contra GET /api/sim/velas (lib/servidor/velas.mjs); el motor, como lo lee el comando (comando.mjs:
 * manifiestosFijados + creaLector().fuentes + fuente.tramo).
 *   A · LA PRUEBA EXPLICITA: la sesion se crea con el mercado v1.1; despues se publica v1.2 (el vigente cambia). El motor
 *       avanza la sesion hasta el 7-ene-2025 10:00. Para esa vela (el cursor) y para todas las del tramo del motor: el
 *       grafico trae la MISMA identidad fijada (PAR@v1.1:huella, no la vigente v1.2), el MISMO sha256 de trozo por dia que
 *       el manifiesto con el que lee el motor, y los mismos OHLC (los ticks del motor / 10^5 = el numero del grafico)
 *   B · un trozo ALTERADO en el almacen (el 8-ene): el grafico no lo pinta y lo avisa (dias incompletos) y el motor se
 *       detiene en ese mismo dia (trozo_alterado): los dos rechazan el mismo trozo
 *   C · las peticiones: solo /api/sim/velas, primero el rango y luego ventanas de ≤ 31 dias, cada una una vez y dentro de
 *       lo publicado; el contexto previo NO publicado se omite sin pedirlo y sin error (sesion desde el primer dia); con la
 *       sesion desde el 8-ene, el contexto se pide desde el primer dia publicado (6-ene), nunca antes
 *   D · la pagina (banco con la pantalla v1, usePairData REAL): ninguna peticion a /api/candles, y la vela del motor de la
 *       grafica en el cursor es la del motor del servidor
 * Datos inventados. Sin red.
 */
import { anclados, siguiente } from '../mercado-ancla.mjs'
import { register } from 'node:module'
register('../espias-vela.mjs', import.meta.url)
const { titulo, ver, oraculo, fin, importa, fuente, asienta, escenario, api } = await import('../lib.mjs')
const VE = await importa('lib/servidor/velas.mjs').catch(() => null), CV = await importa('lib/sim/v1/velas.js').catch(() => null)
// sin esos modulos (el codigo de f54e987) A, B y C salen en rojo por AUSENCIA; D (la pagina) corre igual: es el rojo semantico
const falta = !VE?.ordenVelas || !CV?.cargaVelasV1
const ausente = (n, que) => { for (let i = 0; i < n; i++) oraculo('V1C16', `${que} ${i + 1}: sin lib/servidor/velas.mjs ni lib/sim/v1/velas.js el grafico v1 no lee el mercado v1`, false, 'no esta') }
const { hayPostgres } = await import('../pg-ensayo.mjs')
if (!hayPostgres()) { ver('PostgreSQL 17 local: NO hay', false); fin() }
const { banco } = await import('../banco-motor.mjs')
const { montajeV1, L, conUidDelMontaje } = await import('../montaje-v1.mjs')
const { cerrojoEnMemoria } = await import('../cerrojo-falso.mjs')
const P = await importa('lib/mercado/publicador-v1.mjs'), PV = await importa('lib/mercado/publica-v1.mjs')
const { minutoCerrado } = await importa('lib/mercado/calidad.mjs')
const CR = await importa('lib/servidor/crear.mjs'), TO = await importa('lib/servidor/tomar.mjs'), SO = await importa('lib/servidor/sobre.mjs')
const CO = await importa('lib/servidor/comando.mjs'), ES = await importa('lib/servidor/estado.mjs'), ME = await importa('lib/servidor/mercado.mjs')
const CA = await importa('lib/motor/cartera.mjs'), FU = await importa('lib/motor/fuente.mjs'), IN = await importa('lib/motor/instrumentos.mjs')
const tx = x => JSON.stringify(x, (k, v) => (typeof v === 'bigint' ? `${v}n` : v))
const HUECO = "v_guarda pg_catalog.text := '⟦HUECO guarda canonica⟧';"
const deEnsayo = t => { if (t.split(HUECO).length !== 2) throw new Error('el hueco no esta una vez'); return t.replace(HUECO, "v_guarda pg_catalog.text := 'montaje de ensayo (v1c16)';") }
const S4B = conUidDelMontaje(fuente('sql/sim-004b-contrato-v1.sql')), S6 = deEnsayo(fuente('sql/sim-006-tope-de-pasos.sql'))
const u = k => `00000000-0000-4000-8000-${String(k).padStart(12, '0')}`
const D = d => Date.parse(d + 'T00:00:00Z') / 1000
const M0 = D('2025-01-06')
// EURUSD con un precio DISTINTO en cada minuto (ticks enteros): una vela de otro dia o de otra version no coincide por azar
const PX = { AUDCAD: 0.9, AUDUSD: 0.65, GBPJPY: 190.5, GBPUSD: 1.3, NZDUSD: 0.6, USDCAD: 1.37, USDCHF: 0.88, USDJPY: 150.2 }
function velasDe(par) {
  const o = []
  for (let t = M0; t < M0 + 5 * 86400; t += 60) {
    if (minutoCerrado(t)) continue
    if (par !== 'EURUSD') { o.push({ time: t, open: PX[par], high: PX[par], low: PX[par], close: PX[par], volume: 1 }); continue }
    const k = (t - M0) / 60, op = 110000 + (k % 997)
    o.push({ time: t, open: op / 1e5, high: (op + 7) / 1e5, low: (op - 5) / 1e5, close: (op + 3) / 1e5, volume: 1 + (k % 5) })
  }
  return o
}
function almacen() { const o = new Map(); return { o, async lee(r) { return o.has(r) ? Buffer.from(o.get(r)) : null }, async sube(r, b, { upsert = false } = {}) { if (!upsert && o.has(r)) return 'existe'; o.set(r, Buffer.from(b)); return 'ok' }, async borra(r) { o.delete(r) }, async lista() { return [] } } }
const mercado = almacen()
const planes11 = anclados(SO.PARES.map(par => P.planificaPar({ par, velas: velasDe(par), texto: '', anterior: null, diasAceptados: new Map() })), '2025-12-31')
await PV.publica({ cerrojo: cerrojoEnMemoria(), almacen: mercado, planes: planes11, dueno: 'mercado-v1-publica', ahora: '2026-10-14T09:00:00.000Z' })
const v11 = (await ME.manifiestosVigentes(mercado, SO.PARES)).fijados
const web = () => { const o = new Map(); return { getItem: k => (o.has(k) ? o.get(k) : null), setItem: (k, v) => o.set(k, String(v)), removeItem: k => o.delete(k) } }
const AL = u(1)
let nId = 97000
const nuevoId = () => u(++nId)
escenario({})
const T = D('2025-01-07') + 10 * 3600

const pg = montajeV1()
try {
  pg.arranca()
  const d = 'v1c16'
  pg.base(d)
  const a4 = pg.comoEjecutor(d, S4B), a6 = pg.comoEjecutor(d, S6)
  ver('control: sim-004b y sim-006 aplicadas', a4.ok && a6.ok, (a4.err + a6.err).slice(0, 200))
  pg.alumno(d, AL)
  const uno = q => pg.uno(d, q)
  const leeSesion = async id => { const t = uno(`select row_to_json(s)::text from public.sim_sessions s where id = ${L(id)}`); return t ? JSON.parse(t) : null }
  const puertos = { almacen: mercado, rpc: pg.rpc(d), parDeId: pg.parDeId(d), leeSesion, ahora: () => Date.parse('2026-10-14T10:00:00Z') }
  const orden = { '/api/sim/crear': CR.ordenCrear, '/api/sim/tomar': TO.ordenTomar, '/api/sim/comando': CO.ordenComando, '/api/sim/estado': ES.ordenEstado, ...(VE ? { '/api/sim/velas': VE.ordenVelas } : {}) }
  const llamadas = []
  let cacheVelas = null   // B: una cache nueva para el grafico (la del modulo ya tiene el trozo bueno)
  async function llama(ruta, { cuerpo } = {}) {
    llamadas.push({ ruta, ...(ruta === '/api/sim/velas' ? { desde: cuerpo.desde ?? null, hasta: cuerpo.hasta ?? null } : {}) })
    const r = await orden[ruta]({ actor: AL, cuerpo, puertos: cacheVelas ? { ...puertos, cache: cacheVelas } : puertos })
    if (r.http === 429 && r.cuerpo?.motivo === 'demasiados_avances') uno('update public.sim_alumnos set siguiente_avance_desde = null')
    return { http: r.http, cuerpo: r.cuerpo }
  }
  async function crea(desde) {
    const sid = nuevoId()
    const c = await llama('/api/sim/crear', { cuerpo: { session_id: sid, command_id: nuevoId(), epoca: 1, name: 'S', pair: 'EUR/USD', timeframe: 'M1', date_from: desde, date_to: '2025-12-31', capital: '100000', challenge_type: null } })
    ver(`control: sesion creada desde el ${desde}`, c.http === 201, tx(c).slice(0, 300))
    return sid
  }
  const S1 = await crea('2025-01-06'), S2 = await crea('2025-01-08')
  // despues de crear, el vigente cambia a v1.2 (un dia mas, tras el ancla)
  await PV.publica({ cerrojo: cerrojoEnMemoria(), almacen: mercado, planes: planes11.map(p => siguiente(p, '2026-01-07')), dueno: 'mercado-v1-publica', ahora: '2026-10-14T09:30:00.000Z' })
  const v12 = (await ME.manifiestosVigentes(mercado, SO.PARES)).fijados
  ver('control: el vigente es v1.2 y la sesion fija v1.1', v12.EURUSD !== v11.EURUSD && /@v1\.2:/.test(v12.EURUSD) && (await leeSesion(S1)).mercado?.EURUSD === v11.EURUSD)
  // el motor avanza la sesion hasta T
  const t = await llama('/api/sim/tomar', { cuerpo: { session_id: S1, command_id: nuevoId(), epoca: 1, cliente_id: 'v1c16', forzar: true } })
  for (let k = 0; k < 6; k++) {
    uno('update public.sim_alumnos set siguiente_avance_desde = null')
    const f = await leeSesion(S1)
    if ((f.estado.reloj?.cursor ?? 0) >= T) break
    const r = await llama('/api/sim/comando', { cuerpo: { session_id: S1, command_id: nuevoId(), epoca: 1, cliente_id: 'v1c16', testigo: t.cuerpo.testigo, version_esperada: Number(f.version), tipo: 'avanzar', hasta: T, motivo: 'goto' } })
    if (r.http !== 200) { ver('control: el motor avanza', false, tx(r).slice(0, 300)); break }
  }
  uno('update public.sim_alumnos set siguiente_avance_desde = null')
  const f1 = await leeSesion(S1)
  const est = CA.deserializa(JSON.stringify(f1.estado))
  const cursor = est.reloj.cursor
  ver('control: el motor llego al 7-ene 10:00', cursor === T, String(cursor))

  // el motor, como lo lee el comando
  const fijadoMotor = FU.mercadoEfectivo(est.versiones, 'EURUSD')
  const manM = (await ME.manifiestosFijados(mercado, est.versiones, ['EURUSD'])).EURUSD
  const fuenteM = (await ME.creaLector({ almacen: mercado }).fuentes({ EURUSD: manM }, { desde: M0, hasta: T })).EURUSD
  const velasMotor = fuenteM.tramo(null, T, { desde: M0 }).velas
  const num = x => Number(IN.deTicks('EURUSD', x))
  const shaM = new Map(manM.dias.map(x => [x.dia, x.sha256]))

  titulo('A · el grafico y el motor: la misma version, el mismo trozo, la misma vela')
  if (falta) ausente(7, 'A y C')
  else {
  llamadas.length = 0
  const g = await CV.cargaVelasV1({ llama, sessionId: S1, pair: 'EUR/USD', dateFrom: '2025-01-06', dateTo: '2025-12-31' })
  const llamadasA = [...llamadas]
  oraculo('V1C16', 'A · la identidad: el grafico trae la version FIJADA en el estado de la sesion (v1.1), la misma que lee el motor, no la vigente (v1.2)',
    g?.mercado?.fijado === fijadoMotor && fijadoMotor === v11.EURUSD && g.mercado.fijado !== v12.EURUSD && MFfija(manM) === fijadoMotor, tx({ g: g?.mercado?.fijado, motor: fijadoMotor, v12: v12.EURUSD }))
  function MFfija(m) { return `${m.par}@${m.version}:${m.huella}` }
  const diasG = g?.mercado?.dias ?? []
  // publicados: del 6 al 9-ene (el 10, ultimo de las velas, el publicador lo retiene: «sin_vela_siguiente») y el ancla
  oraculo('V1C16', 'A · el trozo: cada dia que pinta el grafico tiene el sha256 del manifiesto con el que lee el motor (los 4 dias publicados de la semana y el ancla)',
    diasG.length === 5 && diasG.length === manM.dias.length && diasG.every(x => shaM.get(x.dia) === x.sha256), tx(diasG.map(x => [x.dia, x.sha256.slice(0, 8), (shaM.get(x.dia) ?? '').slice(0, 8)])))
  const vG = g?.candles?.find(c => c.time === cursor), vM = velasMotor.find(v => v.time === cursor)
  oraculo('V1C16', 'A · LA MISMA VELA: la del cursor del motor (7-ene 10:00) en el grafico tiene los OHLC del motor (ticks / 10^5)',
    !!vG && !!vM && vG.open === num(vM.open) && vG.high === num(vM.high) && vG.low === num(vM.low) && vG.close === num(vM.close) && vG.volume === vM.volume,
    tx({ grafico: vG, motor: vM && { o: vM.open, h: vM.high, l: vM.low, c: vM.close } }))
  const gTramo = (g?.candles ?? []).filter(c => c.time >= M0 && c.time <= T)
  const iguales = gTramo.length === velasMotor.length && velasMotor.every((v, i) => gTramo[i].time === v.time && gTramo[i].open === num(v.open) && gTramo[i].high === num(v.high) && gTramo[i].low === num(v.low) && gTramo[i].close === num(v.close))
  oraculo('V1C16', 'A · y todas las del tramo del motor (6-ene 00:00 → 7-ene 10:00): las mismas velas, en el mismo orden, con los mismos precios', iguales, `grafico ${gTramo.length} · motor ${velasMotor.length}`)

  titulo('C · las peticiones del grafico')
  const ventanas = llamadasA.filter(x => x.desde)
  const dias = (a, b) => (D(b) - D(a)) / 86400 + 1
  oraculo('V1C16', 'C · solo /api/sim/velas: primero el rango (sin fechas) y despues ventanas de ≤ 31 dias, cada una UNA vez, dentro de lo publicado (6-ene → 31-dic) y que cubren la sesion',
    llamadasA.every(x => x.ruta === '/api/sim/velas') && llamadasA[0]?.desde === null && ventanas.length === 12 && ventanas.every(w => dias(w.desde, w.hasta) <= 31 && w.desde >= '2025-01-06' && w.hasta <= '2025-12-31') &&
    new Set(ventanas.map(w => w.desde)).size === ventanas.length && ventanas[0].desde === '2025-01-06' && ventanas.at(-1).hasta === '2025-12-31',
    tx(llamadasA.map(x => x.desde ? `${x.desde}..${x.hasta}` : 'rango')))
  // (los dias del 10-ene al 30-dic, sin trozo entre las velas de la prueba y el ancla, son de la SESION: el motor no los
  // valora y el grafico los avisa; son del montaje de la prueba, pruebas/mercado-ancla.mjs)
  oraculo('V1C16', 'C · contexto NO publicado (la sesion empieza el primer dia): ninguna ventana antes del 6-ene, sin error y sin aviso de contexto', !g?.error && !ventanas.some(w => w.desde < '2025-01-06') && g?.contextoIncompleto === false && !(g?.diasIncompletos ?? []).some(x => x < '2025-01-10'), tx({ e: g?.error, di0: (g?.diasIncompletos ?? []).slice(0, 2) }))
  llamadas.length = 0
  const g2 = await CV.cargaVelasV1({ llama, sessionId: S2, pair: 'EUR/USD', dateFrom: '2025-01-08', dateTo: '2025-12-31' })
  const v2 = llamadas.filter(x => x.desde)
  oraculo('V1C16', 'C · sesion desde el 8-ene: el contexto se pide desde el primer dia publicado (6-ene), nunca antes, y trae las velas del 6 y el 7',
    !g2?.error && v2[0]?.desde === '2025-01-06' && v2[0]?.hasta === '2025-01-07' && !v2.some(w => w.desde < '2025-01-06') && (g2?.candles ?? []).some(c => c.time < D('2025-01-08')) && (g2?.candles ?? []).some(c => c.time === T),
    tx(v2.map(w => `${w.desde}..${w.hasta}`)))
  }

  titulo('D · la pagina (usePairData REAL con la pantalla v1)')
  {
    process.env.NEXT_PUBLIC_SIM_V1_PANTALLA = 'encendido'
    const antes = api.llamadas.length
    llamadas.length = 0
    const b = await banco({ sesion: f1, userId: AL, v1: { puertos: { llama, nuevoId, local: web(), almacenSesion: web(), plazoMs: 5000, leeTrades: async () => [], buscaHija: async () => null } } })
    for (let k = 0; k < 100 && !b.ps()?.ready; k++) { await asienta(20); await b.repinta() }
    const candles = api.llamadas.slice(antes).filter(x => x.ruta === '/api/candles')
    oraculo('V1C16', 'D · la pagina en v1 no pide NADA a /api/candles y si a /api/sim/velas', b.ps()?.ready === true && candles.length === 0 && llamadas.some(x => x.ruta === '/api/sim/velas'), tx({ ready: b.ps()?.ready, error: b.ps()?.error, candles: candles.length, velas: llamadas.filter(x => x.ruta === '/api/sim/velas').length }))
    const e = b.motor()
    const vM = velasMotor.find(v => v.time === cursor)
    const vP = e?.candles?.find(c => c.time === cursor)
    oraculo('V1C16', 'D · la grafica de la pagina tiene en el cursor la vela del motor del servidor, y arranca en el cursor confirmado',
      !!vP && !!vM && vP.close === num(vM.close) && vP.open === num(vM.open) && e.currentTime === cursor, tx({ pagina: vP, ct: e?.currentTime, cursor }))
    const reqVelas = llamadas.filter(x => x.ruta === '/api/sim/velas')
    oraculo('V1C16', 'D · una sola carga: cada peticion de velas de la pagina sale una vez', new Set(reqVelas.map(x => `${x.desde}..${x.hasta}`)).size === reqVelas.length, tx(reqVelas.map(x => `${x.desde}..${x.hasta}`)))
    delete process.env.NEXT_PUBLIC_SIM_V1_PANTALLA
  }

  titulo('B · un trozo alterado: el grafico y el motor rechazan el mismo dia')
  if (falta) ausente(1, 'B')
  else {
    const ruta = PV.rutaTrozo('EURUSD', '2025-01-08', shaM.get('2025-01-08'))
    const buena = mercado.o.get(ruta)
    ver('control: el trozo del 8-ene esta en el almacen', !!buena)
    const otro = PV.rutaTrozo('EURUSD', '2025-01-09', shaM.get('2025-01-09'))
    mercado.o.set(ruta, Buffer.from(mercado.o.get(otro)))   // el trozo de otro dia con el nombre del 8
    cacheVelas = ME.creaCache()
    const gB = await CV.cargaVelasV1({ llama, sessionId: S1, pair: 'EUR/USD', dateFrom: '2025-01-06', dateTo: '2025-12-31' })
    const fB = (await ME.creaLector({ almacen: mercado, cache: ME.creaCache() }).fuentes({ EURUSD: manM }, { desde: M0, hasta: D('2025-01-09') })).EURUSD
    const tB = fB.tramo(null, D('2025-01-09'), { desde: M0 })
    oraculo('V1C16', 'B · el grafico no pinta el 8-ene (lo avisa como dia incompleto) y el motor se detiene ese mismo dia por trozo_alterado',
      !gB?.error && (gB?.diasIncompletos ?? []).includes('2025-01-08') && !(gB?.candles ?? []).some(c => c.time >= D('2025-01-08') && c.time < D('2025-01-09')) && tB.detencion?.motivo === 'trozo_alterado' && tB.detencion?.dia === '2025-01-08',
      tx({ di: gB?.diasIncompletos, det: tB.detencion }))
    mercado.o.set(ruta, buena); cacheVelas = null
  }
} finally { pg.cierra() }
fin()
