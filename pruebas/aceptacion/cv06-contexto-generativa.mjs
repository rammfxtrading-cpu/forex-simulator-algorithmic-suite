/**
 * CV06 · PRUEBA GENERATIVA DEL CONTEXTO (orden 1-185 · 01 del CTO; PSIMM4-01 de Astra). La regla: cualquier fallo SOLO del
 * contexto (red, 503, 200 incompleto, huella mala, cualquier respuesta no verificable), en v0 y en v1, avisa y no bloquea;
 * solo bloquea lo de la sesion.
 * Se generan las formas de la respuesta de UN trozo de contexto y de UN trozo de la sesion a partir de respuestas sanas:
 *   v1 · una ventana de GET /api/sim/velas (lib/sim/v1/velas.js REAL, cargaVelasV1; la forma de lib/servidor/velas.mjs)
 *   v0 · un año de GET /api/candles (lib/sessionData.js REAL, fetchSessionCandles; /api/candles REAL sobre el Storage falso)
 * Cada campo (y cada campo del primer dia, del primer faltan, de la primera vela y de cada valor de la primera vela) ausente,
 * null y con seis tipos cambiados; cada lista vacia, sin el primero, sin el ultimo y con el primero repetido; cada entero ±1;
 * cada numero NaN-able como texto; cuerpos enteros (null, '', [], {}, {ok}) y el transporte (503, 404, rechazo inmediato,
 * rechazo tardio, plazo).
 * EL INVARIANTE: (C) en el CONTEXTO: nada lanza, NO hay error, las velas de la sesion son exactamente las de la respuesta sana,
 *   y todas las velas son finitas y en orden (sin NaN); si la respuesta no se usa, contextoIncompleto. (S) en la SESION: nada
 *   lanza; o { error } (el par con «Reintentar») o velas finitas y en orden.
 * Controles: la forma sana abre sin aviso de contexto; el detector avisa en alguna forma (no aprueba en vacio). Sin red.
 */
globalThis.__simPlazoVelas = { ms: 150 }
const { titulo, ver, oraculo, fin, importa, escenario, perfil, A, retenApi } = await import('../lib.mjs')
const { respuesta } = await import('../entorno.mjs')
const { velasEnStorage } = await import('../banco-motor.mjs')
const VV = await importa('lib/sim/v1/velas.js')
const SD = await importa('lib/sessionData.js')
import fs from 'node:fs'
const REPO = new URL('../../', import.meta.url).pathname
const tx = x => JSON.stringify(x)
const D = d => Date.parse(d + 'T00:00:00Z') / 1000
const nunca = new Promise(() => {})
const tarde = () => new Promise((_, no) => setTimeout(() => no(new TypeError('Failed to fetch (ficticio, tardio)')), 30))

// ── las formas ──
const QUITA = Symbol('quita')
const TIPOS = [['texto', () => 'x'], ['entero', () => 7], ['decimal', () => 7.5], ['booleano', () => true], ['lista', () => []], ['objeto', () => ({})]]
const lee = (o, r) => r.reduce((a, k) => (a == null ? a : a[k]), o)
function pon(o, r, f) {
  const c = structuredClone(o)
  const padre = lee(c, r.slice(0, -1)), k = r.at(-1)
  if (padre == null || typeof padre !== 'object') return null
  const v = f(padre[k])
  if (v === QUITA) { if (Array.isArray(padre)) padre.splice(k, 1); else delete padre[k] } else padre[k] = v
  return c
}
function rutas(x, pre = [], prof = 0, out = []) {
  if (x == null || typeof x !== 'object' || prof > 3) return out
  const claves = Array.isArray(x) ? (x.length ? [0] : []) : Object.keys(x)
  for (const k of claves) { const r = [...pre, k]; out.push(r); rutas(x[k], r, prof + 1, out) }
  return out
}
function formas(cuerpo) {
  const out = []
  const mete = (nombre, c) => { if (c !== null && JSON.stringify(c) !== JSON.stringify(cuerpo)) out.push({ nombre, r: () => respuestaDe(c) }) }
  for (const r of rutas(cuerpo)) {
    const n = r.join('.'), v = lee(cuerpo, r)
    mete(`${n} ausente`, pon(cuerpo, r, () => QUITA)); mete(`${n} null`, pon(cuerpo, r, () => null))
    for (const [t, f] of TIPOS) mete(`${n} ${t}`, pon(cuerpo, r, f))
    if (Array.isArray(v)) {
      mete(`${n} vacia`, pon(cuerpo, r, () => []))
      if (v.length) { mete(`${n} sin el ultimo`, pon(cuerpo, r, a => a.slice(0, -1))); mete(`${n} sin el primero`, pon(cuerpo, r, a => a.slice(1))); mete(`${n} con el primero repetido`, pon(cuerpo, r, a => [a[0], ...a])) }
    }
    if (Number.isInteger(v)) { mete(`${n} -1`, pon(cuerpo, r, x => x - 1)); mete(`${n} +1`, pon(cuerpo, r, x => x + 1)) }
    if (typeof v === 'number') mete(`${n} como texto no numerico`, pon(cuerpo, r, () => 'NaN'))
  }
  for (const [n, c] of [['cuerpo null', null], ['cuerpo texto vacio', ''], ['cuerpo lista', []], ['cuerpo {}', {}], ['cuerpo {ok}', { ok: true }]]) out.push({ nombre: n, r: () => ({ cuerpoCrudo: c }) })
  out.push({ nombre: 'HTTP 503', r: () => ({ http: 503 }) }, { nombre: 'HTTP 404', r: () => ({ http: 404 }) }, { nombre: 'rechazo inmediato', r: () => ({ rechazo: 'ya' }) },
    { nombre: 'rechazo tardio', r: () => ({ rechazo: 'tarde' }) }, { nombre: 'plazo vencido', r: () => ({ plazo: true }) })
  return out
}
const respuestaDe = c => ({ cuerpo: c })
const finitasYEnOrden = cs => Array.isArray(cs) && cs.every(c => c && Number.isInteger(c.time) && [c.open, c.high, c.low, c.close].every(Number.isFinite)) && cs.every((c, i) => i === 0 || cs[i - 1].time < c.time)
const deSesion = (cs, desde) => (cs ?? []).filter(c => c.time >= desde)

// ═══ v1 ═══
const FIJADO = 'EURUSD@v1:abc123', PRIMERO = '2025-12-01', ULTIMO = '2026-03-06'
const HEX = 'ab'.repeat(32)
function ventana(desde, hasta) {
  const velas = [], dias = []
  for (let t = D(desde); t <= D(hasta); t += 86400) {
    const w = new Date(t * 1000).getUTCDay(); if (w === 0 || w === 6) continue
    dias.push({ dia: new Date(t * 1000).toISOString().slice(0, 10), sha256: HEX })
    for (let h = 0; h < 24; h++) velas.push([t + h * 3600, 110000, 110010, 109990, 110005, 1])
  }
  const faltan = desde < '2026-01-02' && hasta >= '2026-01-02' ? [{ dia: '2026-01-02', motivo: 'no_valorable' }] : []
  return { ok: true, http: 200, par: 'EURUSD', fijado: FIJADO, digitos: 5, primer_dia: PRIMERO, ultimo_dia: ULTIMO, desde, hasta, dias, faltan, velas }
}
function llamaV1(objetivo, forma) {
  return async (ruta, { cuerpo }) => {
    if (!cuerpo.desde) return { http: 200, cuerpo: { ok: true, http: 200, par: 'EURUSD', fijado: FIJADO, digitos: 5, primer_dia: PRIMERO, ultimo_dia: ULTIMO } }
    const w = ventana(cuerpo.desde, cuerpo.hasta)
    if (!forma || cuerpo.desde !== objetivo) return { http: 200, cuerpo: w }
    const f = forma.r()
    if (f.rechazo === 'ya') throw new TypeError('Failed to fetch (ficticio, inmediato)')
    if (f.rechazo === 'tarde') return tarde()
    if (f.plazo) return nunca
    if (f.http) return { http: f.http, cuerpo: { ok: false, http: f.http, motivo: 'ficticio' } }
    if ('cuerpoCrudo' in f) return { http: 200, cuerpo: f.cuerpoCrudo }
    return { http: 200, cuerpo: f.cuerpo }
  }
}
const cargaV1 = async llama => { try { return await VV.cargaVelasV1({ llama, sessionId: 's', pair: 'EUR/USD', dateFrom: '2026-03-02', dateTo: '2026-03-06' }) } catch (e) { return { lanza: String(e?.message ?? e) } } }

// ═══ v0 ═══
escenario({ perfiles: [perfil(A)] })
const fx = JSON.parse(fs.readFileSync(REPO + 'pruebas/fixtures/velas/eurusd-2026-03-02-semana.json', 'utf8'))
const velasFx = fx.velas.map(([time, open, high, low, close]) => ({ time, open, high, low, close, volume: 1 }))
velasEnStorage('EUR/USD', [...velasFx.map(v => ({ ...v, time: v.time - 91 * 86400 })), ...velasFx], [], { tramoAbierto: true })
const anio = s => new URL(s, 'http://x').searchParams.get('year')
async function cargaV0(anioObjetivo, forma) {
  retenApi.antes = null; retenApi.responde = null
  if (forma) {
    const f = forma.r()
    if (f.rechazo === 'ya') retenApi.antes = s => { if (anio(s) === anioObjetivo) throw new TypeError('Failed to fetch (ficticio, inmediato)') }
    else if (f.rechazo === 'tarde') retenApi.antes = s => (anio(s) === anioObjetivo ? tarde() : null)
    else if (f.plazo) retenApi.antes = s => (anio(s) === anioObjetivo ? nunca : null)
    else retenApi.responde = s => (anio(s) !== anioObjetivo ? null : f.http ? respuesta(f.http, { error: 'ficticio' }) : 'cuerpoCrudo' in f ? respuesta(200, f.cuerpoCrudo) : respuesta(200, f.cuerpo))
  }
  try { return await SD.fetchSessionCandles({ pair: 'EUR/USD', dateFrom: '2026-03-02', dateTo: '2026-03-06' }) } catch (e) { return { lanza: String(e?.message ?? e) } } finally { retenApi.antes = null; retenApi.responde = null }
}

// ── el juicio ──
function juzga(que, r, sana) {
  const f = []
  if (r?.lanza) f.push(`lanza: ${r.lanza}`)
  if (que === 'contexto') {
    if (r?.error) f.push(`error del par: ${r.error}`)
    else if (!r?.lanza) {
      if (!finitasYEnOrden(r?.candles)) f.push('velas no finitas o fuera de orden')
      if (tx(deSesion(r?.candles, D('2026-03-02'))) !== tx(sana)) f.push('las velas de la sesion no son las de la respuesta sana')
    }
  } else if (!r?.lanza && !r?.error && !finitasYEnOrden(r?.candles)) f.push('ni error ni velas finitas y en orden')
  return f
}
const resumen = {}
let total = 0
for (const [modo, carga, objetivos] of [
  ['v1', async (obj, f) => cargaV1(llamaV1(obj, f)), { contexto: '2026-01-01', sesion: '2026-03-02' }],
  ['v0', async (obj, f) => cargaV0(obj, f), { contexto: '2025', sesion: '2026' }]]) {
  titulo(`${modo}`)
  const sano = await carga(null, null)
  const sana = deSesion(sano?.candles, D('2026-03-02'))
  ver(`control: ${modo} · sin fallos abre, sin aviso de contexto y con velas de la sesion finitas`, !sano?.error && !sano?.lanza && sana.length > 0 && !sano.contextoIncompleto && finitasYEnOrden(sano.candles), tx({ error: sano?.error, lanza: sano?.lanza, n: sana.length, ctx: sano?.contextoIncompleto }))
  // la respuesta sana del trozo de cada objetivo, de donde salen las formas
  let base = {}
  if (modo === 'v1') base = { contexto: ventana('2026-01-01', '2026-01-31'), sesion: ventana('2026-03-02', '2026-03-06') }
  else {
    for (const [q, y] of Object.entries(objetivos)) {
      let c = null
      retenApi.responde = null
      const t = await fetch(`/api/candles?pair=EURUSD&timeframe=M1&from=${y === '2025' ? D('2025-12-01') : D('2026-03-02')}&to=${y === '2025' ? D('2025-12-31') : D('2026-03-06') + 86399}&year=${y}`)
      c = await t.json()
      base[q] = c
    }
    ver('control: v0 · /api/candles sano de los dos años con velas', base.contexto?.candles?.length > 0 && base.sesion?.candles?.length > 0, tx({ c: base.contexto?.candles?.length, s: base.sesion?.candles?.length }))
  }
  for (const que of ['contexto', 'sesion']) {
    const fs_ = formas(base[que]).map(f => ({ ...f, r: f.r }))
    const mal = []
    let avisadas = 0
    for (const forma of fs_) {
      const r = await carga(objetivos[que], forma)
      if (r?.contextoIncompleto) avisadas++
      const fallos = juzga(que, r, sana)
      if (fallos.length) mal.push({ forma: forma.nombre, fallos })
    }
    total += fs_.length
    resumen[`${modo}/${que}`] = { formas: fs_.length, rompen: mal.length, ...(que === 'contexto' ? { avisan: avisadas } : {}) }
    if (que === 'contexto') ver(`control: ${modo} · el detector avisa en alguna forma del contexto (no aprueba en vacio)`, avisadas > 0, `${avisadas} de ${fs_.length}`)
    oraculo('CV06', `${modo} · ${que}: ${fs_.length} formas: ${que === 'contexto' ? 'ninguna lanza ni bloquea, la sesion intacta y sin NaN' : 'ninguna lanza; o error del par o velas finitas'}`, mal.length === 0,
      `${mal.length} rompen · ${tx(mal.slice(0, 5))}${mal.length ? ' · todas: ' + mal.map(x => x.forma).join(' | ').slice(0, 1200) : ''}`)
  }
}
console.log(`\nFORMAS: ${total} en total · ${tx(resumen)}`)
fin()
