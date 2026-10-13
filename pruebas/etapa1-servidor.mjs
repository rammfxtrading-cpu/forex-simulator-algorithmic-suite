/**
 * ETAPA 1 · EL SERVIDOR RESPETA sim_servicio (diseño sim-004, o.12; CTO 13-oct sobre o.11.7)
 *
 * /api/challenge/create, /api/challenge/advance y /api/admin/wipe-simulador escriben economia
 * con service_role sin pasar por el cliente. Leen sim_servicio justo antes de escribir:
 *   mantenimiento = true      → 503 «Simulador en mantenimiento» y CERO escrituras
 *   la lectura falla          → 503 y cero escrituras (falla cerrado)
 *   sin mantenimiento         → igual que hoy
 * Handlers REALES sobre supabase-falso (sin red). El mutante: los tres endpoints sin la
 * comprobacion (copias en .pruebas/mutantes/servidor, con lib/ entero) → escriben en
 * mantenimiento → el oraculo lo ve.
 *
 * 3 · CAS de /api/challenge/advance (CTO 13-oct, sobre o.13.4): sus tres escrituras de
 *   balance (fail, passed_all, passed_phase) solo si el saldo sigue siendo el leido y la
 *   sesion activa. Otra pestaña guarda un cierre entre la lectura y el UPDATE → 409
 *   «saldo_cambiado» y nada escrito; sin carrera → igual que hoy. Mutante sin el CAS de
 *   saldo → escribe con la carrera → rojo.
 *
 * 4 · ronda 3 (CTO 13-oct; Astra E1R2-01 y E1R2-02):
 *   - el ABA de Astra (−7.000/+7.000, saldo final identico) y su orden inverso, con desenlace pass
 *     y fail: los dos cierres van por la cola y la RPC reales mientras advance espera su UPDATE →
 *     409, sin fase ni hija; mutante de advance sin el filtro rev_saldo → concede → rojo
 *   - status NULL = activa: pass y fail con NULL → 200; NULL que otro decide entre la lectura y el
 *     UPDATE → 409 y nada escrito
 *   - sin rev_saldo en la lectura (preparatoria sin aplicar) → 503 y nada escrito (falla cerrado)
 */
import { mkdirSync, cpSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { titulo, ver, oraculo, fin, escenario, sesionSim, tradeSim, importa, db, A, ADM, perfil, tok, REPO, puerta, asienta } from './lib.mjs'
import { llama } from './supabase-falso.mjs'

const RUTAS = { create: 'pages/api/challenge/create.js', advance: 'pages/api/challenge/advance.js', wipe: 'pages/api/admin/wipe-simulador.js' }
const escrituras = () => db.log.filter(l => ['insert', 'update', 'delete', 'upsert'].includes(l.op) && !String(l.tabla).startsWith('storage')).length

// los tres casos, con un cuerpo valido para cada endpoint (los de ap01 y d06)
const CASOS = {
  create: {
    monta: datos => escenario({ perfiles: [perfil(A)], ...datos }),
    llama: h => llama(h, { method: 'POST', token: tok(A), body: { challenge_type: '2F', capital: 100000, pair: 'EUR/USD', timeframe: 'H1', date_from: '2025-01-01', date_to: '2025-07-01', name: 'Reto' } }),
    hoy: r => r.estado === 200 && db.tablas.sim_sessions.some(s => s.challenge_type === '2F' && s.user_id === A),
  },
  advance: {
    monta: datos => escenario({ perfiles: [perfil(A)], sim_sessions: [sesionSim({ id: 'reto-p', challenge_type: '2F', challenge_phase: 1, capital: 100000, balance: 110000 })],
      sim_trades: [tradeSim({ session_id: 'reto-p', pnl: 10000, result: 'WIN', closed_at: '2025-03-04T12:00:00Z' })], ...datos }),
    llama: h => llama(h, { method: 'POST', token: tok(A), body: { session_id: 'reto-p', outcome: 'pass', end_timestamp: 1741100000 } }),
    hoy: r => r.estado === 200 && db.tablas.sim_sessions.filter(x => x.challenge_parent_id === 'reto-p').length === 1,
  },
  wipe: {
    monta: datos => escenario({ perfiles: [perfil(A), perfil(ADM, { rol_global: 'admin', simulador_activo: false })], sesion: ADM,
      sim_sessions: [sesionSim({ id: 'w1', user_id: A })], sim_trades: [tradeSim({ session_id: 'w1', user_id: A })], ...datos }),
    llama: h => llama(h, { method: 'POST', token: tok(ADM), body: { user_id: A, confirm_email: 'a@ejemplo.test' } }),
    hoy: r => r.estado === 200 && !db.tablas.sim_sessions.some(s => s.user_id === A),
  },
}
const MANT = [{ id: true, mantenimiento: true, version_minima: '1', cambiado_en: '2026-10-13T00:00:00Z' }]

async function prueba(handlers, etiqueta, { registrar = true } = {}) {
  const res = {}
  for (const [k, c] of Object.entries(CASOS)) {
    const h = handlers[k]
    if (!h) { res[k] = null; continue }
    c.monta({ sim_servicio: MANT }); db.log.length = 0
    const m = await c.llama(h)
    const mant = { estado: m.estado, error: m.cuerpo?.error, escrituras: escrituras() }
    c.monta({}); db.log.length = 0
    db.falla = ctx => ctx.tabla === 'sim_servicio' ? { message: 'upstream timeout', code: '57014' } : null
    const f = await c.llama(h); db.falla = null
    const fallo = { estado: f.estado, escrituras: escrituras() }
    c.monta({}); db.log.length = 0
    const o = await c.llama(h)
    const ok = { estado: o.estado, hoy: c.hoy(o), leeServicio: db.log.some(l => l.tabla === 'sim_servicio') }
    res[k] = { mant, fallo, ok }
  }
  return res
}

titulo('1 · los tres endpoints reales')
const reales = {}
for (const [k, p] of Object.entries(RUTAS)) reales[k] = (await importa(p)).default
const r = await prueba(reales, 'reales')
for (const k of Object.keys(RUTAS)) {
  const x = r[k]
  oraculo(`SRV-${k}-mantenimiento`, `${k}: con mantenimiento → 503 «Simulador en mantenimiento» y cero escrituras`,
    x.mant.estado === 503 && x.mant.error === 'Simulador en mantenimiento' && x.mant.escrituras === 0, JSON.stringify(x.mant))
  oraculo(`SRV-${k}-ilegible`, `${k}: si sim_servicio no se puede leer → 503 y cero escrituras (falla cerrado)`, x.fallo.estado === 503 && x.fallo.escrituras === 0, JSON.stringify(x.fallo))
  oraculo(`SRV-${k}-hoy`, `${k}: sin mantenimiento → igual que hoy (y ha leido sim_servicio)`, x.ok.hoy && x.ok.leeServicio, JSON.stringify(x.ok))
}

titulo('2 · mutante: los tres sin la comprobacion')
const dir = path.join(REPO, '.pruebas', 'mutantes', 'servidor')
rmSync(dir, { recursive: true, force: true })
cpSync(path.join(REPO, 'lib'), path.join(dir, 'lib'), { recursive: true })
const LINEA = /\n[^\n]*if \(!\(await servicioPermite\([^\n]*\n/
const mutantes = {}
for (const [k, p] of Object.entries(RUTAS)) {
  const txt = readFileSync(path.join(REPO, p), 'utf8')
  if (!LINEA.test(txt)) { mutantes[k] = null; continue }
  mkdirSync(path.dirname(path.join(dir, p)), { recursive: true })
  writeFileSync(path.join(dir, p), txt.replace(LINEA, '\n'))
  mutantes[k] = (await import(pathToFileURL(path.join(dir, p)).href)).default
}
oraculo('MUT-existe', 'la linea de la comprobacion esta en los tres endpoints (si no, no hay nada que mutar)', Object.values(mutantes).every(Boolean))
const rm = await prueba(mutantes, 'mutantes')
oraculo('MUT-sin-comprobacion', 'sin la comprobacion, los tres escriben en mantenimiento: el oraculo de mantenimiento lo ve en los tres',
  Object.keys(RUTAS).every(k => rm[k] && (rm[k].mant.estado !== 503 || rm[k].mant.escrituras > 0)), JSON.stringify(Object.fromEntries(Object.entries(rm).map(([k, v]) => [k, v?.mant]))))
titulo('3 · CAS de challenge/advance: las tres escrituras de balance')
const RETOS = {
  'passed_phase': { ses: { challenge_phase: 1, balance: 110000 }, trades: [{ pnl: 10000, result: 'WIN' }], outcome: 'pass', estado: 'passed_phase', hijas: 1 },
  'passed_all': { ses: { challenge_phase: 2, balance: 110000 }, trades: [{ pnl: 10000, result: 'WIN' }], outcome: 'pass', estado: 'passed_all', hijas: 0 },
  'failed': { ses: { challenge_phase: 1, balance: 94000 }, trades: [{ pnl: -6000, result: 'LOSS' }], outcome: 'fail', estado: 'failed_dd_daily', hijas: 0 },
}
const montaReto = c => escenario({ perfiles: [perfil(A)], sim_sessions: [sesionSim({ id: 'cas', challenge_type: '2F', capital: 100000, ...c.ses })],
  sim_trades: c.trades.map((t, i) => tradeSim({ session_id: 'cas', closed_at: `2025-03-04T1${i}:00:00Z`, ...t })) })
const pideAdvance = (h, c) => llama(h, { method: 'POST', token: tok(A), body: { session_id: 'cas', outcome: c.outcome, end_timestamp: 1741100000 } })
const madreCas = () => db.tablas.sim_sessions.find(x => x.id === 'cas')
const hijasCas = () => db.tablas.sim_sessions.filter(x => x.challenge_parent_id === 'cas').length
// la otra pestaña: un cierre de +1 (trade y saldo, como sim_cierre_v0) mientras advance espera su UPDATE
async function conCarrera(h, c) {
  montaReto(c)
  const g = puerta(); let retenido = false
  db.pausa = ctx => ctx.tabla === 'sim_sessions' && ctx.op === 'update' && !retenido ? (retenido = true, g.p) : null
  const r = pideAdvance(h, c); await asienta(40)
  db.tablas.sim_trades.push(tradeSim({ session_id: 'cas', pnl: 1, result: 'WIN', closed_at: '2025-03-04T18:00:00Z' }))
  madreCas().balance = Number(madreCas().balance) + 1
  madreCas().rev_saldo = (madreCas().rev_saldo ?? 0) + 1   // como el disparador sim_sessions_rev_saldo
  g.abrir(); const res = await r; db.pausa = null
  return { estado: res.estado, code: res.cuerpo?.code, error: res.cuerpo?.error, status: madreCas().status, balance: madreCas().balance, hijas: hijasCas(), retenido, saldoBase: Number(c.ses.balance) + 1 }
}
async function sinCarrera(h, c) { montaReto(c); const res = await pideAdvance(h, c); return { estado: res.estado, status: madreCas().status, balance: madreCas().balance, hijas: hijasCas() } }
const adv = reales.advance
for (const [k, c] of Object.entries(RETOS)) {
  const x = await conCarrera(adv, c)
  oraculo(`CAS-${k}-carrera`, `${k}: otra pestaña guarda un cierre entre la lectura y el UPDATE → 409 «saldo_cambiado» y nada escrito (sigue activa, su saldo, sin hija)`,
    x.retenido && x.estado === 409 && x.code === 'saldo_cambiado' && x.status === 'active' && x.balance === x.saldoBase && x.hijas === 0, JSON.stringify(x))
  const y = await sinCarrera(adv, c)
  oraculo(`CAS-${k}-hoy`, `${k}: sin carrera → igual que hoy (200, ${c.estado}, saldo = balanceNow${c.hijas ? ', una hija' : ''})`,
    y.estado === 200 && y.status === c.estado && Number(y.balance) === Number(c.ses.balance) && y.hijas === c.hijas, JSON.stringify(y))
}
{ // el mutante: advance sin el WHERE de balance
  const p = RUTAS.advance, txt = readFileSync(path.join(REPO, p), 'utf8')
  // ronda 3: el saldo lo vigilan dos filtros (rev_saldo y balance); el mutante quita los dos
  const linea = /\n[^\n]*\.eq\('balance', session\.balance(?:_texto)?\)[^\n]*\n/
  const lineaRev = /\n[^\n]*\.eq\('rev_saldo', session\.rev_saldo\)[^\n]*\n/
  oraculo('CAS-MUT-existe', 'los WHERE de balance y de rev_saldo estan en advance (si no, no hay nada que mutar)', linea.test(txt) && lineaRev.test(txt))
  const d = path.join(REPO, '.pruebas', 'mutantes', 'servidor-cas')
  rmSync(d, { recursive: true, force: true }); cpSync(path.join(REPO, 'lib'), path.join(d, 'lib'), { recursive: true })
  mkdirSync(path.dirname(path.join(d, p)), { recursive: true }); writeFileSync(path.join(d, p), txt.replace(linea, '\n').replace(lineaRev, '\n'))
  const mut = (await import(pathToFileURL(path.join(d, p)).href)).default
  const vistos = []
  for (const [k, c] of Object.entries(RETOS)) { const x = await conCarrera(mut, c); vistos.push(k + ':' + x.estado + ':' + x.status) }
  oraculo('CAS-MUT-sin-where', 'sin los WHERE de balance y rev_saldo, con la carrera los tres escriben (y el oraculo de carrera lo ve)', vistos.every(v => !/:409:active$/.test(v)), vistos.join(' · '))
}

titulo('4 · ronda 3: el contador rev_saldo (E1R2-01) y status NULL (E1R2-02)')
const CI = await importa('lib/sim/cierre.js')
const SV = await importa('lib/sim/servicio.js')
// la sesion de Astra: un +11.000 (pass) o un −6.000 (fail) ya guardado
const RONDA3 = {
  pass: { ses: { challenge_phase: 1, balance: 111000 }, trades: [{ pnl: 11000, result: 'WIN', closed_at: '2025-03-04T12:00:00Z' }], outcome: 'pass' },
  fail: { ses: { challenge_phase: 1, balance: 94000 }, trades: [{ pnl: -6000, result: 'LOSS', closed_at: '2025-03-04T12:00:00Z' }], outcome: 'fail' },
}
let nId = 0
const idR3 = () => `30000000-0000-4000-8000-${String(++nId).padStart(12, '0')}`
// advance retenido antes de su UPDATE; mientras, dos cierres compensados por la cola y la RPC reales
async function aba(h, c, orden, { status } = {}) {
  montaReto(c)
  if (status !== undefined) madreCas().status = status
  CI.fijaSaldoConfirmado('cas', Number(c.ses.balance)); await SV.leeServicio()
  const g = puerta(); let retenido = false
  db.pausa = ctx => ctx.tabla === 'sim_sessions' && ctx.op === 'update' && !retenido ? (retenido = true, g.p) : null
  const r = pideAdvance(h, c); await asienta(40)
  const rev0 = madreCas().rev_saldo
  const cierres = []
  for (const [pnl, hora] of orden === '-+' ? [[-7000, '2025-03-05T12:00:00Z'], [7000, '2025-03-05T13:00:00Z']] : [[7000, '2025-03-05T12:00:00Z'], [-7000, '2025-03-05T13:00:00Z']])
    cierres.push(await CI.persisteCierre({ sessionId: 'cas', delta: pnl, lastTimestamp: Date.parse(hora) / 1000,
      trade: { id: idR3(), user_id: A, pair: 'EUR/USD', side: 'BUY', lots: 1, pnl, result: pnl < 0 ? 'LOSS' : 'WIN', opened_at: '2025-03-05T10:00:00Z', closed_at: hora } }))
  g.abrir(); const res = await r; db.pausa = null
  return { estado: res.estado, code: res.cuerpo?.code, status: madreCas().status, balance: madreCas().balance, hijas: hijasCas(), retenido,
    cierres: cierres.map(x => x.estado).join(','), rev: `${rev0}→${madreCas().rev_saldo}`, trades: db.tablas.sim_trades.filter(t => t.session_id === 'cas').length }
}
for (const [k, c] of Object.entries(RONDA3)) for (const orden of ['-+', '+-']) {
  const x = await aba(adv, c, orden)
  oraculo(`R3-ABA-${k}-${orden}`, `${k}, ${orden === '-+' ? '−7.000 y +7.000' : '+7.000 y −7.000'} guardados mientras advance espera (saldo final identico): 409, sin fase ni hija; el contador subio 2`,
    x.retenido && x.cierres === 'guardado,guardado' && x.trades === 3 && Number(x.balance) === Number(c.ses.balance) && x.estado === 409 && x.code === 'saldo_cambiado'
    && x.status === 'active' && x.hijas === 0 && x.rev === '0→2', JSON.stringify(x))
}
{ // mutante: advance sin el filtro rev_saldo → el ABA concede
  const p = RUTAS.advance, txt = readFileSync(path.join(REPO, p), 'utf8')
  const lineaRev = /\n[^\n]*\.eq\('rev_saldo', session\.rev_saldo\)[^\n]*\n/
  const d = path.join(REPO, '.pruebas', 'mutantes', 'servidor-rev')
  rmSync(d, { recursive: true, force: true }); cpSync(path.join(REPO, 'lib'), path.join(d, 'lib'), { recursive: true })
  mkdirSync(path.dirname(path.join(d, p)), { recursive: true }); writeFileSync(path.join(d, p), txt.replace(lineaRev, '\n'))
  const mut = lineaRev.test(txt) ? (await import(pathToFileURL(path.join(d, p)).href)).default : null
  const x = mut ? await aba(mut, RONDA3.pass, '-+') : null
  oraculo('R3-MUT-sin-rev', 'mutante de advance sin el filtro rev_saldo: el ABA vuelve a conceder la fase (200 y una hija) → el oraculo R3-ABA lo ve',
    !!x && x.estado === 200 && x.status === 'passed_phase' && x.hijas === 1, JSON.stringify(x))
}
// status NULL = activa (o.14.2)
for (const [k, c] of Object.entries(RONDA3)) {
  montaReto(c); madreCas().status = null
  const res = await pideAdvance(adv, c)
  oraculo(`R3-NULL-${k}`, `${k} con status NULL: se trata como activa → 200 (${k === 'pass' ? 'passed_phase y una hija' : 'failed_dd_daily'})`,
    res.estado === 200 && madreCas().status === (k === 'pass' ? 'passed_phase' : 'failed_dd_daily') && hijasCas() === (k === 'pass' ? 1 : 0), JSON.stringify({ estado: res.estado, cuerpo: res.cuerpo?.error, status: madreCas().status }))
}
{ // NULL que otro decide entre la lectura y el UPDATE
  const c = RONDA3.pass; montaReto(c); madreCas().status = null
  const g = puerta(); let retenido = false
  db.pausa = ctx => ctx.tabla === 'sim_sessions' && ctx.op === 'update' && !retenido ? (retenido = true, g.p) : null
  const r = pideAdvance(adv, c); await asienta(40)
  madreCas().status = 'failed_dd_daily'
  g.abrir(); const res = await r; db.pausa = null
  oraculo('R3-NULL-decidido', 'status NULL que otro pone en failed_dd_daily entre la lectura y el UPDATE: 409 y nada escrito (sigue failed_dd_daily, sin hija)',
    retenido && res.estado === 409 && madreCas().status === 'failed_dd_daily' && hijasCas() === 0, JSON.stringify({ estado: res.estado, status: madreCas().status }))
}
{ // sin el contador en la lectura (la preparatoria no esta aplicada): falla cerrado
  const c = RONDA3.pass; montaReto(c); delete madreCas().rev_saldo; db.log.length = 0
  const res = await pideAdvance(adv, c)
  oraculo('R3-sin-contador', 'sin rev_saldo en la sesion (preparatoria sin aplicar): 503 y ninguna escritura',
    res.estado === 503 && escrituras() === 0 && madreCas().status === 'active' && hijasCas() === 0, JSON.stringify({ estado: res.estado, escrituras: escrituras() }))
}

fin()
