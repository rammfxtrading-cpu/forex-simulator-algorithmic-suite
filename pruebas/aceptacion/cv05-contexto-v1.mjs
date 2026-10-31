/**
 * CV05 · ORDEN 1-183 (3) del CTO: en v1, igual que en v0 (cv04), una ventana de CONTEXTO que falla avisa y no bloquea; solo
 * bloquea lo que sea de la sesion. lib/sim/v1/velas.js REAL (cargaVelasV1) sobre un transporte doble con la forma de
 * GET /api/sim/velas (lib/servidor/velas.mjs: rango con fijado/digitos/primer_dia/ultimo_dia; ventana con dias/faltan/velas).
 * Sesion EUR/USD del 2 al 6-mar-2026; publicado desde el 1-dic-2025 (contexto 1-dic → 1-mar, ventanas de 31 dias).
 * Cada forma de fallo, por separado, en UNA ventana de contexto y en UNA de la sesion: 503, rechazo inmediato, rechazo
 * tardio, plazo vencido, 200 sin velas y otra identidad (fijado); y (orden 1-185, PSIMM4-01) las cinco de Astra: dias ausente,
 * null u objeto, primera vela null u objeto, mas el OHLC no numerico (NaN). La generativa de todas: cv06.
 *   C · contexto: hay velas de la sesion, sin error, contextoIncompleto y la ventana que falta nombrada
 *   S · sesion: { error } (el par con su «Reintentar»), nunca una excepcion
 * Datos inventados. Sin red. En c5f2ac0 (r4): rojos los seis del contexto y los dos rechazos de la sesion (lanzan).
 */
globalThis.__simPlazoVelas = { ms: 150 }
const { titulo, ver, oraculo, fin, importa } = await import('../lib.mjs')
const VV = await importa('lib/sim/v1/velas.js')
const tx = x => JSON.stringify(x)
const D = d => Date.parse(d + 'T00:00:00Z') / 1000
const FIJADO = 'EURUSD@v1:abc123'
const PRIMERO = '2025-12-01', ULTIMO = '2026-03-06'
// una vela por hora de cada dia laborable de la ventana (ticks enteros, 5 digitos)
function ventana(desde, hasta) {
  const velas = [], dias = []
  for (let t = D(desde); t <= D(hasta); t += 86400) {
    const w = new Date(t * 1000).getUTCDay(); if (w === 0 || w === 6) continue
    const dia = new Date(t * 1000).toISOString().slice(0, 10)
    dias.push({ dia, sha256: 'ab'.repeat(32) })
    for (let h = 0; h < 24; h++) velas.push([t + h * 3600, 110000, 110010, 109990, 110005, 1])
  }
  return { ok: true, http: 200, par: 'EURUSD', fijado: FIJADO, digitos: 5, primer_dia: PRIMERO, ultimo_dia: ULTIMO, desde, hasta, dias, faltan: [], velas }
}
const nunca = new Promise(() => {})
const FORMAS = {
  '503': () => ({ http: 503, cuerpo: { ok: false, http: 503, motivo: 'mercado_no_disponible' } }),
  'rechazo inmediato': () => { throw new TypeError('Failed to fetch (ficticio, inmediato)') },
  'rechazo tardio': () => new Promise((_, no) => setTimeout(() => no(new TypeError('Failed to fetch (ficticio, tardio)')), 40)),
  'plazo vencido': () => nunca,
  '200 sin velas': (w) => ({ http: 200, cuerpo: { ...w, velas: undefined } }),
  'otra identidad': (w) => ({ http: 200, cuerpo: { ...w, fijado: 'EURUSD@v1:otra' } }),
  // PSIMM4-01 (Astra, propia-contexto-r4b.mjs): 200 con ok, identidad y velas, pero la ventana incompleta o no verificable
  'dias ausente (Astra)': (w) => { const c = { ...w }; delete c.dias; return { http: 200, cuerpo: c } },
  'dias null (Astra)': (w) => ({ http: 200, cuerpo: { ...w, dias: null } }),
  'dias objeto (Astra)': (w) => ({ http: 200, cuerpo: { ...w, dias: {} } }),
  'primera vela null (Astra)': (w) => ({ http: 200, cuerpo: { ...w, velas: [null, ...w.velas.slice(1)] } }),
  'primera vela objeto (Astra)': (w) => ({ http: 200, cuerpo: { ...w, velas: [{}, ...w.velas.slice(1)] } }),
  'OHLC no numerico (Astra: NaN)': (w) => ({ http: 200, cuerpo: { ...w, velas: [[w.velas[0][0], 'x', 'x', 'x', 'x', 1], ...w.velas.slice(1)] } }),
}
// falla: { que: 'contexto' | 'sesion', forma }
function llamaCon(falla) {
  const pedidas = []
  const llama = (ruta, { cuerpo }) => {
    pedidas.push(cuerpo.desde ?? 'rango')
    if (!cuerpo.desde) return Promise.resolve({ http: 200, cuerpo: { ok: true, http: 200, par: 'EURUSD', fijado: FIJADO, digitos: 5, primer_dia: PRIMERO, ultimo_dia: ULTIMO } })
    const w = ventana(cuerpo.desde, cuerpo.hasta)
    const esSesion = cuerpo.hasta >= '2026-03-02'
    if (falla && (falla.que === 'sesion') === esSesion && (falla.que === 'sesion' || cuerpo.desde === falla.desde)) {
      try { return Promise.resolve(FORMAS[falla.forma](w)) } catch (e) { return Promise.reject(e) }
    }
    return Promise.resolve({ http: 200, cuerpo: w })
  }
  return { llama, pedidas }
}
const carga = async llama => { try { return await VV.cargaVelasV1({ llama, sessionId: 's', pair: 'EUR/USD', dateFrom: '2026-03-02', dateTo: '2026-03-06' }) } catch (e) { return { lanza: String(e?.message ?? e) } } }
const deSesion = r => (r?.candles ?? []).filter(c => c.time >= D('2026-03-02')).length

titulo('control: sin fallos')
let ventanasCtx = []
{
  const { llama, pedidas } = llamaCon(null)
  const r = await carga(llama)
  ventanasCtx = pedidas.filter(p => p !== 'rango' && p < '2026-03-02')
  ver('control: abre con velas de la sesion y del contexto, sin aviso de contexto', !r?.error && !r?.lanza && deSesion(r) > 0 && r.candles.length > deSesion(r) && !r.contextoIncompleto, tx({ error: r?.error, n: r?.candles?.length, ctx: r?.contextoIncompleto }))
  ver('control: hay ventanas de contexto (de 31 dias) antes de la sesion', ventanasCtx.length >= 2, tx(pedidas))
}

titulo('C · falla UNA ventana de contexto: abre y avisa')
for (const forma of Object.keys(FORMAS)) {
  const desde = ventanasCtx[1]
  const { llama } = llamaCon({ que: 'contexto', forma, desde })
  const r = await carga(llama)
  oraculo('CV05', `C · ${forma} en la ventana de contexto del ${desde}: sin error, con las velas de la sesion, contextoIncompleto y la ventana nombrada`,
    !r?.error && !r?.lanza && deSesion(r) > 0 && r.contextoIncompleto === true && (r.contextoQueFalta ?? []).some(x => String(x).includes(desde)) && r.candles.every(c => [c.open, c.high, c.low, c.close].every(Number.isFinite)), tx({ error: r?.error, lanza: r?.lanza, sesion: deSesion(r), ctx: r?.contextoIncompleto, falta: r?.contextoQueFalta }))
}

titulo('S · falla la ventana de la sesion: error (con reintento), nunca una excepcion')
for (const forma of Object.keys(FORMAS)) {
  const { llama } = llamaCon({ que: 'sesion', forma })
  const r = await carga(llama)
  oraculo('CV05', `S · ${forma} en la ventana de la sesion: { error } del par`, typeof r?.error === 'string' && !r?.lanza, tx({ error: r?.error, lanza: r?.lanza }))
}
fin()
