/**
 * AF01 · «CONTINUE TO PHASE 2» NO SE QUEDA EN SILENCIO POR LA HORA DEL CIERRE (orden 1-129 A del CTO; INFORME 1-128).
 * Escrita ANTES que el codigo (contra 0c02d75 y contra f5b713b: en rojo).
 * /api/challenge/advance da 400 si end_timestamp es nulo, decimal o texto («requerido») o > ahora+1 dia («fuera de
 * rango»). El cliente (components/useChallengeFlow.js) lo manda con getMasterTime() sin comprobarlo y el error solo va a
 * la consola: el alumno vuelve al boton sin saber por que.
 *   A · el servidor (handler REAL sobre supabase-falso): un decimal o una cadena numerica se redondean hacia abajo
 *       (Math.floor) y el paso de fase sale (200, la hija nace en esa hora entera); nulo, texto y milisegundos siguen en
 *       400 con un mensaje claro; CADA 400 deja console.error('[challenge/advance] 400 <motivo>') con solo el
 *       session_id (S05: ni posiciones, ni usuario, ni email). Control: el entero de siempre, 200 y la misma hija.
 *       El periodo de la fase 2 no cambia (FTMO-real: hereda date_from/date_to y arranca en end_timestamp).
 *   B · el cliente (hooks REALES en el banco, bandera apagada): la hora que manda es un entero en segundos (decimal →
 *       floor; milisegundos → segundos); sin hora valida, la last_timestamp de la sesion; sin ella, el closed_at del
 *       ultimo trade; sin nada, un aviso claro y no se envia. Un 400 del servidor se ve: aviso con el motivo.
 *   C · con la bandera v1 el paso de fase va por avanzar-fase (pasaFase de la pantalla v1) y no depende de la hora:
 *       sin hora valida, igual pasa y navega a la hija; no se manda /api/challenge/advance ni se avisa de la hora.
 * Datos inventados. Nada toca Supabase.
 */
import { titulo, ver, oraculo, fin, escenario, sesionSim, tradeSim, importa, db, api, A, perfil, tok, asienta } from '../lib.mjs'
import { llama } from '../supabase-falso.mjs'
import { banco } from '../banco-motor.mjs'
const { router } = await import('../next-falso.mjs')

const adv = (await importa('pages/api/challenge/advance.js')).default
const tx = x => JSON.stringify(x)
const T = 1747051200   // 2025-05-12 12:00 UTC
const P = 'reto-af01'
const madre = extra => sesionSim({ id: P, name: 'Challenge 2 Fases · $100K · EURUSD', challenge_type: '2F', challenge_phase: 1, capital: 100000, balance: 110840,
  date_from: '2025-04-26', date_to: '2025-10-26', last_timestamp: null, ...extra })
const trades = [tradeSim({ session_id: P, pnl: 6000, result: 'WIN', closed_at: '2025-05-04T12:00:00Z' }), tradeSim({ session_id: P, pnl: 4840, result: 'WIN', closed_at: '2025-05-12T11:00:00Z' })]
const monta = extra => escenario({ perfiles: [perfil(A)], sim_sessions: [madre(extra)], sim_trades: trades.map(t => ({ ...t })) })
const hija = () => db.tablas.sim_sessions.find(x => x.challenge_parent_id === P) ?? null
const capturado = []
for (const k of ['log', 'error', 'warn', 'info']) { const o = console[k]; console[k] = (...a) => { capturado.push({ k, t: a.map(x => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ') }); o(...a) } }
const errores400 = () => capturado.filter(c => c.k === 'error' && c.t.startsWith('[challenge/advance] 400 '))

titulo('A · el servidor: decimal y cadena numerica → entero; lo demas, 400 claro y registrado')
const pide = async (end_timestamp, outcome = 'pass', extra = {}) => { capturado.length = 0; return llama(adv, { method: 'POST', token: tok(A), body: { session_id: P, outcome, end_timestamp, ...extra } }) }
monta({})
const r0 = await pide(T)
ver('control: el entero de siempre → 200 phase_passed, la hija nace en esa hora con el periodo de la madre', r0.estado === 200 && r0.cuerpo?.action === 'phase_passed' && hija()?.last_timestamp === T && hija()?.date_from === '2025-04-26' && hija()?.date_to === '2025-10-26', tx({ e: r0.estado, c: r0.cuerpo?.action ?? r0.cuerpo?.error, h: hija() && { lt: hija().last_timestamp, d: [hija().date_from, hija().date_to] } }))
const casos200 = [['decimal 1747051200,5', T + 0.5], ['cadena numerica «1747051200»', String(T)], ['cadena con decimales «1747051200.9»', `${T}.9`]]
for (const [n, v] of casos200) {
  monta({})
  const r = await pide(v)
  const madreFila = db.tablas.sim_sessions.find(x => x.id === P)
  oraculo('AF01', `A · ${n}: 200 phase_passed; madre e hija con last_timestamp ${T} (Math.floor), mismo periodo (date_from/date_to de la madre)`,
    r.estado === 200 && r.cuerpo?.action === 'phase_passed' && hija()?.last_timestamp === T && madreFila?.last_timestamp === T && hija()?.date_from === '2025-04-26' && hija()?.date_to === '2025-10-26',
    tx({ e: r.estado, c: r.cuerpo?.action ?? r.cuerpo?.error, h: hija()?.last_timestamp, m: madreFila?.last_timestamp }))
}
const casos400 = [['nulo', null, 'falta'], ['texto «ayer»', 'ayer', 'falta'], ['milisegundos 1747051200000', T * 1000, 'rango'], ['cero', 0, 'falta']]
for (const [n, v, clase] of casos400) {
  monta({})
  const r = await pide(v)
  const e = errores400()
  const msg = String(r.cuerpo?.error ?? '')
  const claro = clase === 'falta' ? msg === 'Falta la hora del cierre de la fase o no es válida.' : msg === 'La hora del cierre de la fase está fuera de rango.'
  oraculo('AF01', `A · ${n}: 400 con mensaje claro, sin hija, y un console.error('[challenge/advance] 400 …') con el session_id`,
    r.estado === 400 && claro && !hija() && e.length === 1 && e[0].t.includes(P), tx({ e: r.estado, msg, logs: e.map(x => x.t) }))
}
// los demas 400 del fichero tambien se registran (sin datos del alumno: ni posiciones, ni usuario)
monta({ balance: 100000 }); db.tablas.sim_trades.length = 0
const POS = [{ position_id: 'pos-SECRETA-af01', pair: 'GBP/USD', side: 'SELL', entry_price: 1.23457, lots: 3.21 }]
const rT = await pide(T, 'pass', { open_positions: POS })
const eT = errores400()
oraculo('AF01', 'A · «aún no has alcanzado el profit target» (400): registrado con su motivo y el session_id, sin posiciones ni usuario',
  rT.estado === 400 && eT.length === 1 && eT[0].t.includes(P) && !['pos-SECRETA-af01', '1.23457', A].some(x => capturado.map(c => c.t).join('\n').includes(x)), tx({ e: rT.estado, logs: eT.map(x => x.t) }))
capturado.length = 0
const rS = await llama(adv, { method: 'POST', token: tok(A), body: { outcome: 'pass', end_timestamp: T } })
oraculo('AF01', 'A · sin session_id (400): también registrado', rS.estado === 400 && errores400().length === 1, tx({ e: rS.estado, logs: errores400().map(x => x.t) }))

titulo('B · el cliente: la hora que manda, y el 400 visible')
const AV = await importa('lib/sim/avisos.js')
async function pagina(extra = {}, tr = trades) {
  const fila = madre(extra)
  escenario({ perfiles: [perfil(A)], sim_sessions: [fila], sim_trades: tr.map(t => ({ ...t })) })
  const b = await banco({ sesion: fila, userId: A })
  await b.caja.valor.reto.refreshChallengeStatus(); await b.repinta(); await asienta(40); await b.repinta()
  return b
}
const enviado = n0 => api.llamadas.slice(n0).filter(l => l.ruta === '/api/challenge/advance').map(l => ({ e: l.estado, t: l.body?.end_timestamp }))
async function pasa(b, hora) {
  globalThis.window.__algSuiteCurrentTime = hora
  AV.vaciaAvisos()
  const n0 = api.llamadas.length
  await b.caja.valor.reto.handleChallengePass(); await asienta(40)
  return { env: enviado(n0), avisos: AV.avisos().map(a => a.texto) }
}
{
  const b = await pagina()
  ver('control: el reto superado saca su modal de fase (como hoy)', b.caja.valor.reto.challengeModal === 'passed_phase', tx({ modal: b.caja.valor.reto.challengeModal }))
  const r = await pasa(b, T + 0.75)
  oraculo('AF01', 'B · getMasterTime decimal: manda el entero (floor) y pasa de fase (200)', tx(r.env) === tx([{ e: 200, t: T }]), tx(r))
}
{
  const b = await pagina()
  const r = await pasa(b, T * 1000 + 999)
  oraculo('AF01', 'B · getMasterTime en milisegundos: lo pasa a segundos enteros y pasa de fase (200)', tx(r.env) === tx([{ e: 200, t: T }]), tx(r))
}
{
  const b = await pagina({ last_timestamp: T - 600 })
  const r = await pasa(b, null)
  oraculo('AF01', 'B · sin hora del simulador: usa la last_timestamp de la sesion', tx(r.env) === tx([{ e: 200, t: T - 600 }]), tx(r))
}
{
  const b = await pagina()
  // los trades de la sesion en pairState, como los carga _SessionInner (closeTime en segundos)
  const ps = (b.refs.pairState.current['EUR/USD'] ??= { engine: null, ready: false, positions: [], trades: [], orders: [] })
  ps.trades = trades.map(t => ({ id: t.id, pair: t.pair, side: t.side, pnl: t.pnl, closeTime: Math.floor(Date.parse(t.closed_at) / 1000) }))
  const r = await pasa(b, 'texto')
  const ultimo = Date.parse('2025-05-12T11:00:00Z') / 1000
  oraculo('AF01', 'B · hora no valida y sin last_timestamp: usa el closed_at del ultimo trade', tx(r.env) === tx([{ e: 200, t: ultimo }]), tx(r))
}
{
  const b = await pagina()
  // la pagina no tiene ningun trade cargado con su hora (ni hora del simulador ni last_timestamp)
  for (const p of Object.values(b.refs.pairState.current)) if (p) p.trades = []
  const r = await pasa(b, NaN)
  oraculo('AF01', 'B · sin ninguna hora valida: no se envia y el alumno ve un aviso claro',
    r.env.length === 0 && r.avisos.includes('No se ha podido pasar de fase: falta la hora del simulador. Recarga la página e inténtalo de nuevo.'), tx(r))
}
{
  const b = await pagina()
  const r = await pasa(b, Math.floor(Date.now() / 1000) + 3 * 86400)
  oraculo('AF01', 'B · el servidor responde 400 (fuera de rango): el alumno ve el motivo, no vuelve al boton en silencio',
    r.env.length === 1 && r.env[0].e === 400 && r.avisos.includes('No se ha podido pasar de fase: La hora del cierre de la fase está fuera de rango.'), tx(r))
}

titulo('C · con la bandera v1, el paso de fase va por avanzar-fase y no depende de la hora')
{
  const b = await pagina()
  let pasaFase = 0
  b.refs.v1Ref.current = { pasaFase: async () => { pasaFase++; return { conclusion: 'confirmado', hija: 'hija-v1' } }, estadoReto: () => null }
  await b.repinta()
  const nav0 = router.navegado.length
  const r = await pasa(b, null)
  oraculo('AF01', 'C · v1 sin hora valida: pasaFase una vez, navega a la hija, sin /api/challenge/advance y sin aviso de la hora',
    pasaFase === 1 && r.env.length === 0 && tx(router.navegado.slice(nav0)) === tx([['push', '/session/hija-v1']]) && !r.avisos.some(a => a.includes('hora')), tx({ pasaFase, r, nav: router.navegado.slice(nav0) }))
  b.refs.v1Ref.current = null
}
fin()
