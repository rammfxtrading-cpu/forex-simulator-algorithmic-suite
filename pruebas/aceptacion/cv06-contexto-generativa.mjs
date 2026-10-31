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
// orden 1-189 (PSIMM6-01): la frontera unica del contexto (si existe) y los calculos derivados de verdad: el motor del replay
// (agregados de TODOS los timeframes, volumen incluido) y las killzones
const FR = await importa('lib/fronteraContexto.js').catch(() => null)
const RE = (await importa('lib/replayEngine.js')).default, { TIMEFRAMES } = await importa('lib/replayEngine.js')
const KZ = await importa('lib/killzonesDomain.js')
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
// ORDEN 1-187 (PSIMM5-01): el eje del TAMAÑO y los objetos que viajan por JSON sin metodos de conversion. Los MAXIMOS del
// servidor real: v1, una ventana de ≤ 31 dias (lib/servidor/velas.mjs VENTANA_DIAS, validaVelas) con un trozo M1 por dia → ≤ 31
// dias, ≤ 31 faltan y ≤ 31 × 1.440 = 44.640 velas; v0, /api/candles devuelve las velas M1 del año pedido entre from y to → ≤ los
// minutos de ese tramo (un año bisiesto entero: 527.040). Se prueba el maximo (se acepta) y por encima, mas listas enormes, un
// campo de 16 MB y un anidamiento profundo
const porJson = x => JSON.parse(JSON.stringify(x))
let anidado = null, anidadoNota = ''
try { anidado = JSON.parse('['.repeat(100000) + ']'.repeat(100000)); anidadoNota = '100.000 niveles' } catch (e) { anidadoNota = `JSON.parse no lo admite (${e.constructor.name}): el transporte lo deja en un cuerpo ilegible`; anidado = undefined }
function extrasV1(w, desde, hasta) {
  const out = [], f = (nombre, c) => out.push({ nombre, r: () => (c === undefined ? { cuerpoCrudo: null } : { cuerpo: c }) })
  const nDias = Math.round((D(hasta) - D(desde)) / 86400) + 1
  const todosLosDias = Array.from({ length: nDias }, (_, i) => ({ dia: new Date((D(desde) + i * 86400) * 1000).toISOString().slice(0, 10), sha256: HEX }))
  const maxVelas = []; for (let t = D(desde); t < D(hasta) + 86400; t += 60) maxVelas.push([t, 110000, 110010, 109990, 110005, 1])
  f('motivo sin toString (por JSON)', porJson({ ok: false, motivo: { toString: null } }))
  f('motivo lista sin toString (por JSON)', porJson({ ok: false, motivo: [{ toString: 0 }] }))
  f('fijado sin toString (por JSON)', porJson({ ...w, fijado: { toString: false } }))
  f('dias sin toString en un dia (por JSON)', porJson({ ...w, dias: [{ dia: { toString: null }, sha256: HEX }, ...w.dias.slice(1)] }))
  f(`tamaño · dias = ${nDias} (el maximo: todos los dias de la ventana)`, { ...w, dias: todosLosDias })
  f(`tamaño · dias = ${nDias + 1} (uno por encima)`, { ...w, dias: [...todosLosDias, todosLosDias[0]] })
  f('tamaño · dias = 150.000', { ...w, dias: Array.from({ length: 150000 }, () => w.dias[0]) })
  f('tamaño · faltan = 150.000', { ...w, faltan: Array.from({ length: 150000 }, () => ({ dia: desde, motivo: 'x' })) })
  f(`tamaño · velas = ${maxVelas.length} (el maximo: un minuto tras otro toda la ventana)`, { ...w, velas: maxVelas })
  f(`tamaño · velas = ${maxVelas.length + 1} (una por encima)`, { ...w, velas: [...maxVelas, maxVelas.at(-1)] })
  f('tamaño · velas = 200.000', { ...w, velas: Array.from({ length: 200000 }, () => w.velas[0]) })
  f('tamaño · un campo de 16 MB', { ...w, relleno: 'x'.repeat(16 * 1048576) })
  f(`tamaño · anidamiento (${anidadoNota})`, anidado === undefined ? undefined : { ...w, relleno: anidado })
  return out
}
// orden 1-189: CONTEXTO VALIDO EN FORMA PERO DEFECTUOSO EN VALORES, en las dos primeras velas (el mismo bloque H1 en v0, el mismo
// D1 en v1): volumen negativo, texto, objeto o lista sin conversion (por JSON), enorme hasta desbordar la suma, null (= NaN por
// JSON: compatible, cuenta 0); OHLC incoherente, por encima, negativo, cero; un hueco (legitimo); un duplicado con otros valores;
// dos velas fuera de orden. [ruta de la vela 0, ruta de la vela 1, como se cambia un valor]
const ACEPTABLES = /volumen null|hueco/
function valores(cuerpo, lista, campos) {
  const out = [], f = (nombre, mut) => { const c = structuredClone(cuerpo); mut(c[lista]); out.push({ nombre: `valores · ${nombre}`, r: () => ({ cuerpo: JSON.parse(JSON.stringify(c)) }) }) }
  const pon2 = (v, k, x) => { if (Array.isArray(v)) v[campos[k]] = x; else v[k] = x }
  const de = (v, k) => (Array.isArray(v) ? v[campos[k]] : v[k])
  f('volumen negativo', L => pon2(L[0], 'volume', -1))
  f('volumen texto', L => pon2(L[0], 'volume', 'x'))
  f('volumen objeto sin toString (por JSON)', L => pon2(L[0], 'volume', { toString: null, valueOf: null }))
  f('volumen lista sin toString (por JSON)', L => pon2(L[0], 'volume', [{ toString: 0 }]))
  f('volumen enorme: dos de 1e308 en el mismo bloque (la suma desborda)', L => { pon2(L[0], 'volume', 1e308); pon2(L[1], 'volume', 1e308) })
  f('volumen 1e300 (enorme pero finito)', L => pon2(L[0], 'volume', 1e300))
  f('volumen null (= NaN por JSON; compatible: 0)', L => pon2(L[0], 'volume', null))
  f('OHLC incoherente: high < low', L => { const h = de(L[0], 'high'); pon2(L[0], 'high', de(L[0], 'low')); pon2(L[0], 'low', h) })
  f('OHLC: open por encima de high', L => pon2(L[0], 'open', de(L[0], 'high') * 2))
  f('precio negativo', L => pon2(L[0], 'low', -de(L[0], 'low')))
  f('precio cero', L => { pon2(L[0], 'low', 0) })
  f('hueco (falta una vela intermedia; legitimo)', L => L.splice(2, 1))
  f('duplicado con otros valores', L => { const d = structuredClone(L[0]); pon2(d, 'close', de(d, 'close') + 0.0001 * (Array.isArray(d) ? 100000 : 1)); L.splice(1, 0, d) })
  f('dos velas fuera de orden', L => { const a = L[0]; L[0] = L[1]; L[1] = a })
  return out
}
function extrasV0(c, desde, hasta) {
  const out = [], f = (nombre, x) => out.push({ nombre, r: () => x })
  const maxVelas = []; for (let t = desde; t <= hasta; t += 60) maxVelas.push({ time: t, open: 1.1, high: 1.1001, low: 1.0999, close: 1.1, volume: 1 })
  f('HTTP 503 con error sin toString (por JSON)', { http: 503, cuerpoError: porJson({ error: { toString: null }, problemas: [{ toString: 0 }] }) })
  f('error sin toString en un 200 sin velas (por JSON)', { cuerpo: porJson({ error: { toString: null } }) })
  f(`tamaño · candles = ${maxVelas.length} (el maximo: un minuto tras otro todo el tramo pedido)`, { cuerpo: { ...c, candles: maxVelas } })
  f(`tamaño · candles = ${maxVelas.length + 1} (una por encima, repetida)`, { cuerpo: { ...c, candles: [...maxVelas, maxVelas.at(-1)] } })
  f('tamaño · candles = 600.000', { cuerpo: { ...c, candles: Array.from({ length: 600000 }, () => c.candles[0]) } })
  f('tamaño · un campo de 16 MB', { cuerpo: { ...c, relleno: 'x'.repeat(16 * 1048576) } })
  f(`tamaño · anidamiento (${anidadoNota})`, anidado === undefined ? { cuerpoCrudo: null } : { cuerpo: { ...c, relleno: anidado } })
  return out
}
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
// como el hook (components/usePairData.js cargaPar): la respuesta de la carga pasa por la frontera del contexto antes de nada
const comoElHook = r => { if (!FR?.fronteraContexto || !r || r.lanza || r.error) return r; try { return FR.fronteraContexto(r) } catch (e) { return { lanza: `frontera: ${e?.message ?? e}` } } }
const cargaV1 = async llama => { try { return comoElHook(await VV.cargaVelasV1({ llama, sessionId: 's', pair: 'EUR/USD', dateFrom: '2026-03-02', dateTo: '2026-03-06' })) } catch (e) { return { lanza: String(e?.message ?? e) } } }

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
    else retenApi.responde = s => (anio(s) !== anioObjetivo ? null : f.http ? respuesta(f.http, f.cuerpoError ?? { error: 'ficticio' }) : 'cuerpoCrudo' in f ? respuesta(200, f.cuerpoCrudo) : respuesta(200, f.cuerpo))
  }
  try { return comoElHook(await SD.fetchSessionCandles({ pair: 'EUR/USD', dateFrom: '2026-03-02', dateTo: '2026-03-06' })) } catch (e) { return { lanza: String(e?.message ?? e) } } finally { retenApi.antes = null; retenApi.responde = null }
}

// orden 1-189: los calculos derivados de verdad sobre lo cargado: el motor del replay en la ultima vela, getAggregated de cada
// timeframe (M1…W1: open/high/low/close/volume finitos, volumen ≥ 0, tiempos enteros en orden) y las killzones de cada uno
const KZ_TODAS = { asia: true, london: true, nyam: true, nypm: true }
function derivados(candles) {
  try {
    const e = new RE(); e.load(candles); e.seekToTime(candles.at(-1).time)
    for (const tf of Object.keys(TIMEFRAMES)) {
      e._aggCache = null
      const agg = e.getAggregated(tf)
      for (let i = 0; i < agg.length; i++) {
        const b = agg[i]
        if (!Number.isSafeInteger(b.time) || (i && agg[i - 1].time >= b.time) || ![b.open, b.high, b.low, b.close, b.volume].every(Number.isFinite) || b.volume < 0) return `agregado ${tf} no finito: ${tx(b).slice(0, 120)}`
      }
      for (const k of KZ.calcSessions(agg, KZ_TODAS)) if (![k.high, k.low].every(Number.isFinite)) return `killzone ${tf} no finita`
    }
    return null
  } catch (err) { return `un calculo derivado lanza: ${err?.message ?? err}` }
}
// ── el juicio ──
function juzga(que, r, sana) {
  const f = []
  if (r?.lanza) f.push(`lanza: ${r.lanza}`)
  if (!r?.lanza && !r?.error && r && Array.isArray(r.candles) && r.candles.length) { const d = derivados(r.candles); if (d) f.push(d) }
  if (que === 'contexto') {
    if (r?.error) f.push(`error del par: ${r.error}`)
    else if (!r?.lanza) {
      if (!finitasYEnOrden(r?.candles)) f.push('velas no finitas o fuera de orden')
      if (tx(deSesion(r?.candles, D('2026-03-02'))) !== tx(sana)) f.push('las velas de la sesion no son las de la respuesta sana')
    }
  // (null: «sin velas de la sesion»; el hook lo convierte en el error del par, components/usePairData.js C04/D5)
  } else if (!r?.lanza && !r?.error && r !== null && !finitasYEnOrden(r?.candles)) f.push('ni error ni velas finitas y en orden')
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
    const lim = modo === 'v1' ? (que === 'contexto' ? ['2026-01-01', '2026-01-31'] : ['2026-03-02', '2026-03-06']) : null
    // el tramo que pide fetchSessionCandles para cada año (las mismas cuentas: desde el contexto de 180 dias o el 1 de enero, hasta el
    // 31-dic 23:59:59 o el final de la sesion, en hora local), a minutos enteros
    const ctxTs = D('2026-03-02') - 180 * 86400, fin2025 = Math.floor(new Date('2025-12-31T23:59:59').getTime() / 1000), fin2026 = Math.floor(new Date('2026-03-06T23:59:59').getTime() / 1000)
    const aMinuto = t => Math.floor(t / 60) * 60
    const tramoV0 = que === 'contexto' ? [Math.ceil(ctxTs / 60) * 60, aMinuto(fin2025)] : [D('2026-01-01'), aMinuto(fin2026)]
    const fs_ = [...formas(base[que]), ...(modo === 'v1' ? extrasV1(base[que], ...lim) : extrasV0(base[que], ...tramoV0)),
      ...(modo === 'v1' ? valores(base[que], 'velas', { time: 0, open: 1, high: 2, low: 3, close: 4, volume: 5 }) : valores(base[que], 'candles', {}))]
    const mal = [], maximos = [], encima = [], vals = []
    let avisadas = 0
    for (const forma of fs_) {
      const r = await carga(objetivos[que], forma)
      if (r?.contextoIncompleto) avisadas++
      if (que === 'contexto' && /^tamaño.*el maximo/.test(forma.nombre)) maximos.push({ forma: forma.nombre, aviso: !!r?.contextoIncompleto, error: r?.error ?? null, lanza: r?.lanza ?? null })
      if (que === 'contexto' && /^valores · /.test(forma.nombre)) vals.push({ forma: forma.nombre, aviso: !!r?.contextoIncompleto, aceptable: ACEPTABLES.test(forma.nombre), error: r?.error ?? null, lanza: r?.lanza ?? null })
      if (que === 'contexto' && /^tamaño.*por encima/.test(forma.nombre)) encima.push({ forma: forma.nombre, aviso: !!r?.contextoIncompleto, lanza: r?.lanza ?? null })
      const fallos = juzga(que, r, sana)
      if (fallos.length) mal.push({ forma: forma.nombre, fallos })
    }
    total += fs_.length
    resumen[`${modo}/${que}`] = { formas: fs_.length, rompen: mal.length, ...(que === 'contexto' ? { avisan: avisadas } : {}) }
    if (que === 'contexto') ver(`control: ${modo} · el detector avisa en alguna forma del contexto (no aprueba en vacio)`, avisadas > 0, `${avisadas} de ${fs_.length}`)
    if (que === 'contexto') oraculo('CV06', `${modo} · tamaño: el maximo que devuelve el servidor real se acepta (sin aviso) y uno por encima se descarta con aviso`,
      maximos.length > 0 && encima.length > 0 && maximos.every(x => !x.aviso && !x.error && !x.lanza) && encima.every(x => x.aviso && !x.lanza), tx({ maximos, encima }))
    if (que === 'contexto') oraculo('CV06', `${modo} · valores (1-189): el contexto con valores defectuosos se descarta con aviso; el volumen null y el hueco se aceptan; nunca error ni excepcion`,
      vals.length > 0 && vals.every(x => !x.error && !x.lanza && (x.aceptable ? !x.aviso : x.aviso)), tx(vals.filter(x => x.error || x.lanza || (x.aceptable ? x.aviso : !x.aviso))))
    oraculo('CV06', `${modo} · ${que}: ${fs_.length} formas: ${que === 'contexto' ? 'ninguna lanza ni bloquea, la sesion intacta, sin NaN y todos los agregados y killzones finitos' : 'ninguna lanza; o error del par o velas finitas con agregados finitos'}`, mal.length === 0,
      `${mal.length} rompen · ${tx(mal.slice(0, 5))}${mal.length ? ' · todas: ' + mal.map(x => x.forma).join(' | ').slice(0, 1200) : ''}`)
  }
}
console.log(`\nFORMAS: ${total} en total · ${tx(resumen)} · anidamiento: ${anidadoNota}`)
fin()
