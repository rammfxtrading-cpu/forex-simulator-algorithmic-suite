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
 */
import { mkdirSync, cpSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { titulo, ver, oraculo, fin, escenario, sesionSim, tradeSim, importa, db, A, ADM, perfil, tok, REPO } from './lib.mjs'
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
fin()
