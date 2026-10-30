/**
 * CV02 · UNA SOLA CARGA DE VELAS POR PAR, Y NUNCA UNA ESPERA SIN FINAL (orden 1-179 (e) y (b) del CTO), en el camino v0
 * (bandera v1 apagada: /api/candles). El banco del motor: usePairData REAL, fetchSessionCandles REAL, /api/candles REAL
 * sobre el Storage falso. Sesion v0 EUR/USD del 2 al 6-mar-2026 (el contexto de 180 dias cae en 2025).
 *   E · al abrir, cada año (2025, 2026) se pide UNA vez. En la pagina real (pruebas/navegador/cv01) lo pedian tres
 *       disparadores (usePairData :299 y :303 y el montaje del grafico); en el banco, sin grafico, los dos de usePairData
 *   B1 · el año de CONTEXTO (2025) no esta: la sesion abre y se AVISA (antes, en silencio)
 *   B2 · el año de la SESION (2026) da 503: error en el par (sin motor) y, al reintentar con el año ya servido, abre
 *   B3 · el año de la sesion NO RESPONDE nunca: con el plazo (aqui 300 ms; en la pagina 60 s) error en el par con su texto,
 *        nunca cargando para siempre; al reintentar, abre
 *   B4 · el año de contexto no responde nunca: la sesion abre con el aviso
 * Datos: la semana real del fixture (pruebas/fixtures/velas). Sin red.
 */
globalThis.__simPlazoVelas = { ms: 300 }   // antes de importar lib/sessionData.js (PLAZO_VELAS)
const { titulo, ver, oraculo, fin, importa, escenario, perfil, A, api, retenApi, asienta, sesionSim, fuente } = await import('../lib.mjs')
const { respuesta } = await import('../entorno.mjs')
const { banco, velasEnStorage } = await import('../banco-motor.mjs')
import fs from 'node:fs'
const REPO = new URL('../../', import.meta.url).pathname
const fx = JSON.parse(fs.readFileSync(REPO + 'pruebas/fixtures/velas/eurusd-2026-03-02-semana.json', 'utf8'))
const velas = fx.velas.map(([time, open, high, low, close]) => ({ time, open, high, low, close, volume: 1 }))
const tx = x => JSON.stringify(x)
escenario({ perfiles: [perfil(A)] })
velasEnStorage('EUR/USD', velas, [], { tramoAbierto: true })
const anio = s => new URL(s, 'http://x').searchParams.get('year')
const sesion = () => sesionSim({ user_id: A, pair: 'EUR/USD', date_from: '2026-03-02', date_to: '2026-03-06', capital: 10000, balance: 10000, last_timestamp: null })
const nunca = new Promise(() => {})
async function abre({ responde = null, antes = null } = {}) {
  retenApi.responde = responde; retenApi.antes = antes
  const desde = api.llamadas.length
  const b = await banco({ sesion: sesion(), userId: A })
  for (let k = 0; k < 60 && !b.ps()?.ready && !b.ps()?.error; k++) { await asienta(20); await new Promise(r => setTimeout(r, 20)); await b.repinta() }
  const pedidas = () => api.llamadas.slice(desde).filter(x => x.ruta === '/api/candles')
  return { b, pedidas }
}
async function reintenta(b) {
  retenApi.responde = null; retenApi.antes = null
  // como _SessionInner.js reintentaPar: quita el error y vuelve a cargar el par
  const st = b.ps(); if (st) delete st.error
  await b.caja.valor.datos.loadPair('EUR/USD')
  for (let k = 0; k < 60 && !b.ps()?.ready; k++) { await asienta(20); await b.repinta() }
}
const no2025 = s => (anio(s) === '2025' ? respuesta(503, { error: 'El historico de EURUSD 2025 no esta disponible.' }) : null)

titulo('E · una sola carga por par')
{
  const { b, pedidas } = await abre({ responde: no2025 })
  const p = pedidas()
  ver('control: se pidieron 2025 (contexto) y 2026 (sesion)', p.length > 0 && b.ps()?.ready === true, tx({ n: p.length, ready: b.ps()?.ready, error: b.ps()?.error }))
  const años = p.map(x => x.estado)
  const n2025 = p.filter(x => x.estado === 503).length, n2026 = p.filter(x => x.estado === 200).length
  oraculo('CV02', 'E · al abrir la sesion, cada año se pide UNA vez (2025 una, 2026 una), aunque varios disparadores llamen a loadPair', n2025 === 1 && n2026 === 1, tx({ n2025, n2026, estados: años }))
  await Promise.all([b.caja.valor.datos.loadPair('EUR/USD'), b.caja.valor.datos.loadPair('EUR/USD')])
  ver('control: con el par ya cargado, loadPair no vuelve a pedir', pedidas().length === p.length, String(pedidas().length))

  titulo('B1 · el año de contexto no esta: abre y se avisa')
  oraculo('CV02', 'B1 · la sesion abre (motor, sin error) y el aviso del par nombra el contexto que falta (2025)',
    b.ps()?.ready === true && !b.ps()?.error && /no se ha podido cargar el historico anterior a la sesion \(2025\)/.test(b.ps()?.avisoDatos ?? ''), tx({ aviso: b.ps()?.avisoDatos }))
}

titulo('B2 · el año de la sesion da 503: error con reintento')
{
  const { b } = await abre({ responde: s => (anio(s) === '2026' ? respuesta(503, { error: 'El historico de EURUSD 2026 no esta disponible.' }) : null) })
  const e = b.ps()?.error ?? ''
  const conError = !b.ps()?.ready && /Las velas de EURUSD 2026 no estan disponibles \(HTTP 503/.test(e)
  await reintenta(b)
  oraculo('CV02', 'B2 · error en el par con su texto (sin motor) y, al reintentar con el año servido, la sesion abre', conError && b.ps()?.ready === true && !b.ps()?.error, tx({ e, ready: b.ps()?.ready }))
}

titulo('B3 · el año de la sesion no responde nunca: error a tiempo, no carga infinita')
{
  const t0 = Date.now()
  const { b } = await abre({ antes: s => (anio(s) === '2026' ? nunca : null) })
  const e = b.ps()?.error ?? ''
  oraculo('CV02', 'B3 · con el plazo vencido, el par tiene su error («no han llegado a tiempo»), no se queda cargando', !b.ps()?.ready && /Las velas de EURUSD 2026 no han llegado a tiempo/.test(e), tx({ e, ready: b.ps()?.ready, ms: Date.now() - t0 }))
  await reintenta(b)
  oraculo('CV02', 'B3 · y el reintento (con la red de vuelta) abre la sesion', b.ps()?.ready === true && !b.ps()?.error, tx({ ready: b.ps()?.ready, error: b.ps()?.error }))
}

titulo('B4 · el año de contexto no responde nunca: abre con el aviso')
{
  const { b } = await abre({ antes: s => (anio(s) === '2025' ? nunca : null) })
  oraculo('CV02', 'B4 · la sesion abre y avisa del contexto que falta (2025)', b.ps()?.ready === true && /historico anterior a la sesion \(2025\)/.test(b.ps()?.avisoDatos ?? ''), tx({ ready: b.ps()?.ready, error: b.ps()?.error, aviso: b.ps()?.avisoDatos }))
  retenApi.antes = null
}
fin()
