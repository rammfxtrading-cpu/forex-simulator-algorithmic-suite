/**
 * CV07 · LA FRONTERA UNICA DEL CONTEXTO (orden 1-189 del CTO; PSIMM6-01 de Astra). Todo lo que viene del contexto (v0 y v1) se
 * valida y se aisla en UN punto, lib/fronteraContexto.js, ANTES de que nada lo use: si falla en cualquier fase (valores o calculos
 * derivados: agregados de todos los timeframes, volumen, killzones), ese contexto se descarta con aviso y la sesion sigue.
 *   A · el caso de Astra (propia-volumen-r4d.mjs), con el HOOK REAL (usePairData) y H1 seleccionado: dos velas M1 del contexto
 *       2025 (1-dic 00:00 y 00:01, el mismo bloque H1), solo cambia el volumen: 1 (control), objeto y lista sin conversion (por
 *       JSON), «x», 1e308 (la suma desborda) y null (compatible). El par abre; los defectuosos con el aviso del historico; los
 *       agregados de TODOS los timeframes del motor del par, finitos; la sesion igual a la sana.
 *   G · la garantia de que ningun calculo derivado lee contexto sin pasar por la frontera, sobre el CODIGO:
 *       G1 · las dos cargas (fetchSessionCandles, v0; cargaVelasV1 / pantalla.velas, v1) solo se llaman en components/usePairData.js
 *       G2 · alli, lo que devuelven pasa por fronteraContexto antes de cualquier otro uso
 *       G3 · el unico engine.load de todo components/, lib/ y pages/ es el de usePairData y carga lo que salio de la frontera
 *       (todo lo demas —agregados, killzones, SL/TP, Go to de sesiones, el grafico— lee del motor: engine.candles / getAggregated)
 * Sin red. En 568e36a (r4d): A rojo (objetos: el par no abre; «x» y 1e308: sin aviso y agregados no finitos) y G rojo (no hay frontera).
 */
const { titulo, ver, oraculo, fin, importa, escenario, perfil, A, retenApi, asienta, sesionSim, REPO } = await import('../lib.mjs')
const { respuesta } = await import('../entorno.mjs')
const { banco, velasEnStorage } = await import('../banco-motor.mjs')
import fs from 'node:fs'
import path from 'node:path'
const { TIMEFRAMES } = await importa('lib/replayEngine.js')
const tx = x => JSON.stringify(x)
const D = d => Date.parse(d + 'T00:00:00Z') / 1000
const fx = JSON.parse(fs.readFileSync(REPO + 'pruebas/fixtures/velas/eurusd-2026-03-02-semana.json', 'utf8'))
const velasFx = fx.velas.map(([time, open, high, low, close]) => ({ time, open, high, low, close, volume: 1 }))
escenario({ perfiles: [perfil(A)] })
velasEnStorage('EUR/USD', velasFx, [2025], { tramoAbierto: true })
const anio = s => new URL(s, 'http://x').searchParams.get('year')
const AVISO = /no se ha podido cargar el historico anterior a la sesion/

titulo('A · el caso de Astra: volumen del contexto con el hook real y H1')
{
  const sesion = sesionSim({ user_id: A, pair: 'EUR/USD', date_from: '2026-03-02', date_to: '2026-03-06', capital: 10000, balance: 10000, last_timestamp: null })
  const b = await banco({ sesion, userId: A })
  for (let i = 0; i < 60 && !b.ps()?.ready; i++) { await asienta(40); await new Promise(r => setTimeout(r, 20)); await b.repinta() }
  ver('control: A · el par abre sano', b.ps()?.ready === true, tx({ error: b.ps()?.error }))
  b.refs.pairTfRef.current['EUR/USD'] = 'H1'
  const sesionSana = (b.ps()?.engine?.candles ?? []).filter(c => c.time >= D('2026-03-02'))
  const base = [0, 60].map(x => ({ time: D('2025-12-01') + x, open: 1.1, high: 1.2, low: 1, close: 1.15, volume: 1 }))
  const FORMAS = [['1 (control sano)', 1, false], ['objeto sin toString ni valueOf', { toString: null, valueOf: null }, true], ['lista sin toString', [{ toString: 0 }], true],
    ['texto «x»', 'x', true], ['1e308 en las dos (la suma desborda)', 1e308, true], ['null (compatible: 0)', null, false]]
  for (const [nombre, volume, defectuoso] of FORMAS) {
    const candles = JSON.parse(JSON.stringify(base.map(c => ({ ...c, volume }))))
    retenApi.responde = s => (anio(s) === '2025' ? respuesta(200, { candles }) : null)
    b.ps().ready = false; delete b.ps().error
    await b.caja.valor.datos.loadPair('EUR/USD'); await b.repinta()
    retenApi.responde = null
    const ps = b.ps(), e = ps?.engine
    let agregados = null
    try {
      agregados = Object.keys(TIMEFRAMES).every(tf => { e._aggCache = null; return e.getAggregated(tf).every(x => [x.open, x.high, x.low, x.close, x.volume].every(Number.isFinite) && x.volume >= 0) })
    } catch (err) { agregados = `lanza: ${err?.message}` }
    const sesion2 = (e?.candles ?? []).filter(c => c.time >= D('2026-03-02'))
    oraculo('CV07', `A · volumen ${nombre}: el par abre${defectuoso ? ', con el aviso del historico' : ' sin aviso de contexto'}, la sesion igual y los agregados de todos los timeframes finitos`,
      ps?.ready === true && !ps?.error && AVISO.test(ps?.avisoDatos ?? '') === defectuoso && tx(sesion2) === tx(sesionSana) && agregados === true,
      tx({ ready: ps?.ready, error: ps?.error ?? null, aviso: ps?.avisoDatos, sesionIgual: tx(sesion2) === tx(sesionSana), agregados }))
  }
}

titulo('G · la garantia sobre el codigo: ningun calculo derivado lee el contexto sin pasar por la frontera')
{
  const fuentes = []
  const recorre = d => { for (const n of fs.readdirSync(path.join(REPO, d))) { const p = path.join(d, n); const st = fs.statSync(path.join(REPO, p)); if (st.isDirectory()) { if (n !== 'node_modules' && !n.startsWith('.')) recorre(p) } else if (/\.(m?js|jsx)$/.test(n)) fuentes.push(p) } }
  for (const d of ['components', 'lib', 'pages']) recorre(d)
  const lee = p => fs.readFileSync(path.join(REPO, p), 'utf8')
  // quita comentarios de linea y de bloque (para no contar menciones en la documentacion)
  const codigo = t => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
  ver('control: G · se leen las fuentes de components/, lib/ y pages/', fuentes.length > 50 && fuentes.includes('components/usePairData.js'), String(fuentes.length))
  const llamadas = re => fuentes.filter(p => re.test(codigo(lee(p))))
  const cargas = llamadas(/\bfetchSessionCandles\s*\(|\bcargaVelasV1\s*\(|\.velas\s*\(\s*\{/)
  oraculo('CV07', 'G1 · las cargas de velas (fetchSessionCandles, cargaVelasV1, pantalla.velas) solo se usan en usePairData (y donde se definen)',
    cargas.every(p => ['components/usePairData.js', 'lib/sessionData.js', 'lib/sim/v1/velas.js', 'lib/sim/v1/pantalla.js'].includes(p)) && cargas.includes('components/usePairData.js'), tx(cargas))
  const hook = codigo(lee('components/usePairData.js'))
  const iCarga = hook.search(/const\s+bruto\s*=\s*pv0\s*\?/), iFrontera = hook.search(/const\s+result\s*=\s*fronteraContexto\s*\(\s*bruto\s*\)/), iLoad = hook.search(/engine\.load\(/)
  const usosBruto = (hook.match(/\bbruto\b/g) ?? []).length
  oraculo('CV07', 'G2 · en usePairData lo que devuelve la carga (bruto) solo se usa para pasarlo por fronteraContexto, antes que nada',
    iCarga >= 0 && iFrontera > iCarga && iLoad > iFrontera && usosBruto === 2, tx({ iCarga, iFrontera, iLoad, usosBruto }))
  const loads = fuentes.filter(p => /\.load\s*\(/.test(codigo(lee(p))) && !/^lib\/replayEngine\.js$/.test(p))
  const cargaDeFrontera = /engine\.load\(\s*result\.candles\s*\)/.test(hook) || /const\s*\{\s*candles\s*:\s*ordinalCandles[^}]*\}\s*=\s*result\b/.test(hook)
  oraculo('CV07', 'G3 · el unico engine.load (fuera del propio motor) es el de usePairData y carga lo que sale de la frontera',
    tx(loads) === tx(['components/usePairData.js']) && cargaDeFrontera, tx({ loads, cargaDeFrontera }))
}
fin()
