/**
 * CV04 · PSIMM3-03 (Astra, dictamen 30-oct 18:15; orden 1-182 del CTO): un fallo SOLO del contexto v0 avisa y no bloquea;
 * solo bloquea lo que sea de la sesion. El caso de Astra (pruebas/aceptacion/propia-cargas-r3.mjs, ultimo bloque, en
 * revisiones-suite/2026-10-30-psimm3-astra-evidencias/actual/): el fetch del año de CONTEXTO RECHAZA (TypeError, la red)
 * y la pagina daba el error del par en vez del aviso. El banco del motor: usePairData REAL, fetchSessionCandles REAL,
 * /api/candles REAL sobre el Storage falso. Sesion v0 EUR/USD del 2 al 6-mar-2026 (el contexto de 180 dias cae en 2025).
 * Cada forma de fallo, por separado (lo que pide Astra): rechazo inmediato, rechazo tardio, 503 y vencimiento del plazo,
 *   en el CONTEXTO (2025): abre y avisa;  en la SESION (2026): error del par con «Reintentar», y el reintento abre.
 *   R · el caso de Astra tal cual: rechazo del contexto, y despues dos «Reintentar» a la vez
 * Datos: la semana real del fixture (pruebas/fixtures/velas). Sin red. En 2e1edc1: rojos los rechazos del contexto (y R).
 */
globalThis.__simPlazoVelas = { ms: 300 }   // antes de importar lib/sessionData.js (PLAZO_VELAS)
const { titulo, ver, oraculo, fin, escenario, perfil, A, api, retenApi, asienta, sesionSim } = await import('../lib.mjs')
const { respuesta } = await import('../entorno.mjs')
const { banco, velasEnStorage } = await import('../banco-motor.mjs')
import fs from 'node:fs'
const REPO = new URL('../../', import.meta.url).pathname
const fx = JSON.parse(fs.readFileSync(REPO + 'pruebas/fixtures/velas/eurusd-2026-03-02-semana.json', 'utf8'))
const velas = fx.velas.map(([time, open, high, low, close]) => ({ time, open, high, low, close, volume: 1 }))
const tx = x => JSON.stringify(x)
escenario({ perfiles: [perfil(A)] })
// el contexto existe (la misma semana 13 semanas antes, 1-dic-2025): sin fallos, la sesion abre SIN aviso de contexto
const contexto = velas.map(v => ({ ...v, time: v.time - 91 * 86400 }))
velasEnStorage('EUR/USD', [...contexto, ...velas], [], { tramoAbierto: true })
const anio = s => new URL(s, 'http://x').searchParams.get('year')
const sesion = () => sesionSim({ user_id: A, pair: 'EUR/USD', date_from: '2026-03-02', date_to: '2026-03-06', capital: 10000, balance: 10000, last_timestamp: null })
const nunca = new Promise(() => {})
const tarde = ms => new Promise((_, no) => setTimeout(() => no(new TypeError('Failed to fetch (ficticio, tardio)')), ms))
async function abre({ responde = null, antes = null } = {}) {
  retenApi.responde = responde; retenApi.antes = antes
  const desde = api.llamadas.length
  const b = await banco({ sesion: sesion(), userId: A })
  for (let k = 0; k < 60 && !b.ps()?.ready && !b.ps()?.error; k++) { await asienta(20); await new Promise(r => setTimeout(r, 20)); await b.repinta() }
  return { b, pedidas: () => api.llamadas.slice(desde).filter(x => x.ruta === '/api/candles') }
}
async function reintenta(b) {
  retenApi.responde = null; retenApi.antes = null
  // como _SessionInner.js reintentaPar: quita el error y vuelve a cargar el par
  const st = b.ps(); if (st) delete st.error
  await b.caja.valor.datos.loadPair('EUR/USD')
  for (let k = 0; k < 60 && !b.ps()?.ready; k++) { await asienta(20); await b.repinta() }
}
const AVISO = /no se ha podido cargar el historico anterior a la sesion \(2025\)/
const FORMAS = {
  'rechazo inmediato': y => ({ antes: s => { if (anio(s) === y) throw new TypeError('Failed to fetch (ficticio, inmediato)') } }),
  'rechazo tardio': y => ({ antes: s => (anio(s) === y ? tarde(60) : null) }),
  '503': y => ({ responde: s => (anio(s) === y ? respuesta(503, { error: `El historico de EURUSD ${y} no esta disponible.` }) : null) }),
  'plazo vencido': y => ({ antes: s => (anio(s) === y ? nunca : null) }),
}

titulo('control: sin fallos la sesion abre sin aviso de contexto')
{
  const { b, pedidas } = await abre()
  ver('control: abre, sin error y sin el aviso del contexto', b.ps()?.ready === true && !b.ps()?.error && !AVISO.test(b.ps()?.avisoDatos ?? ''), tx({ ready: b.ps()?.ready, error: b.ps()?.error, aviso: b.ps()?.avisoDatos, n: pedidas().length }))
}

titulo('C · el fallo es SOLO del contexto (2025): abre y avisa')
for (const [forma, f] of Object.entries(FORMAS)) {
  const { b } = await abre(f('2025'))
  oraculo('CV04', `C · ${forma} del contexto: la sesion abre (motor, sin error del par) y el aviso nombra el historico que falta (2025)`,
    b.ps()?.ready === true && !b.ps()?.error && AVISO.test(b.ps()?.avisoDatos ?? ''), tx({ ready: b.ps()?.ready, error: b.ps()?.error, aviso: b.ps()?.avisoDatos }))
  retenApi.antes = null; retenApi.responde = null
}

titulo('S · el fallo es de la SESION (2026): error del par con reintento, y el reintento abre')
for (const [forma, f] of Object.entries(FORMAS)) {
  const { b } = await abre(f('2026'))
  const e = b.ps()?.error ?? ''
  const conError = b.ps()?.ready !== true && e.length > 0 && /2026|EURUSD|EUR\/USD/.test(e)
  await reintenta(b)
  oraculo('CV04', `S · ${forma} de la sesion: error del par (sin motor) y, al reintentar con la red de vuelta, la sesion abre`, conError && b.ps()?.ready === true && !b.ps()?.error, tx({ e, ready: b.ps()?.ready }))
}

titulo('R · el caso de Astra: rechazo del contexto y dos «Reintentar» a la vez')
{
  const { b } = await abre({ antes: s => { if (anio(s) === '2025') throw new TypeError('Failed to fetch (sintetico contexto)') } })
  oraculo('CV04', 'R · PSIMM3-03: con el rechazo de transporte solo del contexto la sesion abre y avisa', b.ps()?.ready === true && AVISO.test(b.ps()?.avisoDatos ?? ''), tx({ ready: b.ps()?.ready, error: b.ps()?.error, aviso: b.ps()?.avisoDatos }))
  retenApi.antes = null
  await Promise.all([reintenta(b), reintenta(b)])
  ver('control: R · tras dos Reintentar a la vez la sesion esta abierta', b.ps()?.ready === true, tx({ ready: b.ps()?.ready }))
}
fin()
