/**
 * SV05 · NADA DE ARITMETICA BINARIA ANTES DEL AJUSTE AL TICK (SIMMOTOR1-02 de Astra; orden 1-121 del CTO). Escrita ANTES
 * que el codigo (contra db3c886: en rojo).
 *   A · el caso de Astra por el hook REAL (useTradingActions): previewOrder('BUY_LIMIT', 1.100005, 'EUR/USD') con los
 *       valores de siempre (SL 10, TP 30 pips). A mano: 1,100005 − 0,0010 = 1,099005 → 1,09901; 1,100005 + 0,0030 =
 *       1,103005 → 1,10301 (la mitad, arriba). Lo mismo tras confirmLimitOrder (entrada 1,10001). Hoy: TP 1,10300.
 *       Y su espejo SELL_LIMIT y USD/JPY 151,2345 (BUY y SELL).
 *   B · familia de medios ticks: EURUSD y USDJPY, BUY y SELL, SL y TP, pips 1/10/30, contra un ORACULO DECIMAL escrito
 *       aqui (enteros BigInt a la escala del medio tick; no importa nada del producto): entrada ± pips × 10 ticks, y el
 *       ajuste una sola vez, la mitad hacia arriba (la regla de lib/motor/instrumentos.mjs aTicks). Mas los tres casos
 *       de pips fraccionarios de Astra (0,15 y 0,25 pips).
 *   C · exponentes: aTickDelPar('1512345e-4', 'USD/JPY') = aTickDelPar('151.2345', …) = 151.235 (hoy 151.234), y la
 *       familia de los mismos medios ticks escritos con exponente (e, E, negativo, positivo, mantisa con punto).
 * Cambio visible que fija: el SL/TP que el preview calcula desde pips puede moverse un tick cuando el decimal exacto es
 * un medio tick (hoy el binario lo deja por debajo de la mitad).
 */
import { titulo, ver, oraculo, fin, importa, sonda, asienta, escenario, A } from '../lib.mjs'
const op = m => importa(m).catch(() => null)
const OR = await op('lib/trading/orders.js'), V = await op('lib/sim/vela.js'), H = (await op('components/useTradingActions.js'))?.default
if (!OR?.priceFromPips || !V?.aTickDelPar || !H) { for (let i = 0; i < 12; i++) oraculo('SV05', `caso ${i}: sin priceFromPips, aTickDelPar o useTradingActions no se puede`, false, 'no estan'); fin() }

// ── el oraculo: decimales en BigInt, sin nada del producto ──────────────────────
// un par: decimales del tick (5, o 3 con JPY); un pip = 10 ticks
const DEC = par => (par.includes('JPY') ? 3 : 5)
// texto decimal positivo → BigInt a la escala `escala` (exacto: falla si sobra precision)
function entero(texto, escala) {
  const m = /^(\d+)(?:\.(\d+))?$/.exec(texto)
  if (!m) throw new Error(`oraculo: no es un decimal: ${texto}`)
  const f = m[2] ?? ''
  if (f.length > escala) throw new Error(`oraculo: ${texto} tiene mas de ${escala} decimales`)
  return BigInt(m[1] + f.padEnd(escala, '0'))
}
// BigInt a escala → texto decimal
const texto = (x, escala) => { const s = x.toString().padStart(escala + 1, '0'); return `${s.slice(0, -escala)}.${s.slice(-escala)}` }
// entrada ± pips (texto) en el par → precio ajustado, como texto con los decimales del par
function oraculoPrecio({ largo, entrada, pips, par, pierna }) {
  const d = DEC(par), esc = d + 4                                   // 4 decimales de holgura: medio tick y pips fraccionarios
  // pips con hasta 4 decimales: P × 10⁻⁴ pips × 10⁻⁽ᵈ⁻¹⁾ de precio = P × 10⁻⁽ᵈ⁺³⁾, es decir P × 10 a la escala d+4
  const e = entero(entrada, esc), p = entero(pips, 4) * 10n
  const sube = (pierna === 'TP') === largo
  const x = sube ? e + p : e - p
  const u = 10n ** BigInt(esc - d)
  return texto((2n * x + u) / (2n * u), d)                          // la mitad, arriba (x > 0)
}
ver('oraculo a mano: 1,100005 + 30 pips (BUY TP) = 1,10301', oraculoPrecio({ largo: true, entrada: '1.100005', pips: '30', par: 'EUR/USD', pierna: 'TP' }) === '1.10301')
ver('oraculo a mano: 1,100005 − 10 pips (BUY SL) = 1,09901', oraculoPrecio({ largo: true, entrada: '1.100005', pips: '10', par: 'EUR/USD', pierna: 'SL' }) === '1.09901')
ver('oraculo a mano: 151,2345 − 30 pips (SELL TP) = 150,935', oraculoPrecio({ largo: false, entrada: '151.2345', pips: '30', par: 'USD/JPY', pierna: 'TP' }) === '150.935')
ver('oraculo a mano: 1,10001 − 0,15 pips (BUY SL) = 1,099995 → 1,1', oraculoPrecio({ largo: true, entrada: '1.10001', pips: '0.15', par: 'EUR/USD', pierna: 'SL' }) === '1.10000')
ver('oraculo a mano: 1,10001 + 0,25 pips (BUY TP) = 1,100035 → 1,10004', oraculoPrecio({ largo: true, entrada: '1.10001', pips: '0.25', par: 'EUR/USD', pierna: 'TP' }) === '1.10004')

// ── A · el hook real ─────────────────────────────────────────────────────────
titulo('A · previewOrder y confirmLimitOrder (useTradingActions real)')
escenario({})
function previewYConfirma(side, entrada, par) {
  const ps = { current: { [par]: { positions: [], orders: [], trades: [] } } }
  let preview = null
  const props = () => ({ id: 's-sv05', activePair: par, currentPrice: entrada, currentTime: 1736251140, lots: 1, preview, pairState: ps, chartMap: { current: {} },
    sessionRef: { current: {} }, balanceRef: { current: 100000 }, userIdRef: { current: A }, soloLecturaRef: { current: false },
    setPreview: v => { preview = typeof v === 'function' ? v(preview) : v }, setCtxMenu() {}, setTick() {}, setBalance() {}, refreshChallengeStatus() {} })
  const caja = sonda(() => H(props()))
  caja.valor.previewOrder(side, entrada, par)
  caja.repinta()
  const calculado = preview ? { ...preview } : null
  caja.valor.confirmLimitOrder()
  caja.repinta()
  const guardada = ps.current[par].orders[0] ?? null
  caja.raiz.desmonta()
  return { calculado, guardada }
}
for (const [side, entrada, par] of [['BUY_LIMIT', 1.100005, 'EUR/USD'], ['SELL_LIMIT', 1.100005, 'EUR/USD'], ['BUY_LIMIT', 151.2345, 'USD/JPY'], ['SELL_LIMIT', 151.2345, 'USD/JPY']]) {
  const largo = side === 'BUY_LIMIT', d = DEC(par)
  const sl = oraculoPrecio({ largo, entrada: String(entrada), pips: '10', par, pierna: 'SL' }), tp = oraculoPrecio({ largo, entrada: String(entrada), pips: '30', par, pierna: 'TP' })
  const ent = texto((2n * entero(String(entrada), d + 1) + 10n) / 20n, d)
  const { calculado: c, guardada: g } = previewYConfirma(side, entrada, par)
  ver(`${side} ${par} ${entrada}: el preview existe y la orden se guarda`, !!c && !!g, JSON.stringify({ c, g }))
  oraculo('SV05', `A · preview ${side} ${par} ${entrada} (SL 10, TP 30): SL ${sl}, TP ${tp}`, c?.sl === Number(sl) && c?.tp === Number(tp), JSON.stringify({ sl: c?.sl, tp: c?.tp }))
  oraculo('SV05', `A · confirmLimitOrder ${side} ${par}: entrada ${ent}, SL ${sl}, TP ${tp} (lo mismo que el preview)`, g?.entry === Number(ent) && g?.sl === Number(sl) && g?.tp === Number(tp), JSON.stringify({ entry: g?.entry, sl: g?.sl, tp: g?.tp }))
}
await asienta()

// ── B · familia de medios ticks ──────────────────────────────────────────────
titulo('B · priceFromPips: medios ticks contra el oraculo decimal')
// entradas a medio tick: 100 seguidas (como Astra) y 100 repartidas con una semilla fija
let semilla = 20261026
const azar = n => { semilla = (semilla * 1103515245 + 12345) % 2147483648; return semilla % n }
const ENTRADAS = {}
for (const par of ['EUR/USD', 'USD/JPY']) {
  const d = DEC(par), base = par.includes('JPY') ? 150000 : 110000, lo = par.includes('JPY') ? 80000 : 50000, rango = par.includes('JPY') ? 120000 : 150000
  const ticks = [...Array.from({ length: 100 }, (_, k) => base + k), ...Array.from({ length: 100 }, () => lo + azar(rango))]
  ENTRADAS[par] = ticks.map(t => texto(BigInt(t) * 10n + 5n, d + 1))      // el medio tick: un 5 en el decimal d+1
}
ver('control: 200 entradas por par, todas a medio tick', Object.values(ENTRADAS).every(l => l.length === 200 && l.every(s => s.endsWith('5'))))
let total = 0
for (const par of ['EUR/USD', 'USD/JPY']) for (const largo of [true, false]) for (const pierna of ['SL', 'TP']) for (const pips of [1, 10, 30]) {
  const malos = []
  for (const e of ENTRADAS[par]) {
    total++
    const esperado = Number(oraculoPrecio({ largo, entrada: e, pips: String(pips), par, pierna }))
    const r = OR.priceFromPips({ isLong: largo, entry: Number(e), pips, pair: par, leg: pierna })
    if (r !== esperado) malos.push(`${e}→${r} (oraculo ${esperado})`)
  }
  oraculo('SV05', `B · ${par} ${largo ? 'BUY' : 'SELL'} ${pierna} ${pips} pips: 200 medios ticks = el oraculo decimal`, malos.length === 0, malos.length ? `${malos.length} distintos; ${malos.slice(0, 3).join(' · ')}` : '200/200')
}
ver('control: 4.800 casos de la familia', total === 4800, String(total))
{
  const casos = [{ isLong: true, entry: 1.10001, pips: 0.15, pair: 'EUR/USD', leg: 'SL' }, { isLong: true, entry: 1.10001, pips: 0.25, pair: 'EUR/USD', leg: 'TP' }, { isLong: true, entry: 150.001, pips: 0.15, pair: 'USD/JPY', leg: 'SL' }]
  const r = casos.map(c => ({ c, r: OR.priceFromPips(c), o: Number(oraculoPrecio({ largo: c.isLong, entrada: String(c.entry), pips: String(c.pips), par: c.pair, pierna: c.leg })) }))
  oraculo('SV05', 'B · pips fraccionarios de Astra: 1,10001 − 0,15 = 1,1; 1,10001 + 0,25 = 1,10004; 150,001 − 0,15 = 150', r.every(x => x.r === x.o) && r.map(x => x.o).join() === '1.1,1.10004,150', r.map(x => `${x.r}/${x.o}`).join(' · '))
}

// ── C · exponentes ───────────────────────────────────────────────────────────
titulo('C · el mismo decimal con exponente')
oraculo('SV05', "C · aTickDelPar('1512345e-4', 'USD/JPY') = aTickDelPar('151.2345', 'USD/JPY') = 151235", V.aTickDelPar('1512345e-4', 'USD/JPY') === 151235n && V.aTickDelPar('151.2345', 'USD/JPY') === 151235n, `${V.aTickDelPar('1512345e-4', 'USD/JPY')} · ${V.aTickDelPar('151.2345', 'USD/JPY')}`)
oraculo('SV05', "C · alTick('1512345e-4', 'USD/JPY') = 151,235", V.alTick('1512345e-4', 'USD/JPY') === 151.235, String(V.alTick('1512345e-4', 'USD/JPY')))
// las formas: digitos e-k, digitos E-k, mantisa con punto e0, mantisa/10 e+1
const formas = (e) => {
  const [ent, fr] = e.split('.'), dig = (ent + fr).replace(/^0+(?=\d)/, ''), k = fr.length
  return [`${dig}e-${k}`, `${dig}E-${k}`, `${e}e0`, `${ent.length > 1 ? ent.slice(0, -1) + '.' + ent.slice(-1) : '0.' + ent}${fr}e+1`]
}
ver('control: las formas de 1,100005 son 1100005e-6, 1100005E-6, 1.100005e0, 0.1100005e+1', formas('1.100005').join() === '1100005e-6,1100005E-6,1.100005e0,0.1100005e+1', formas('1.100005').join())
for (const par of ['EUR/USD', 'USD/JPY']) {
  const d = DEC(par), malos = []
  let n = 0
  for (const e of ENTRADAS[par]) {
    const esperado = (entero(e, d + 1) + 5n) / 10n                       // el medio tick, arriba
    for (const f of formas(e)) { n++; let r; try { r = V.aTickDelPar(f, par) } catch (err) { r = err.message } if (r !== esperado) malos.push(`${f}→${r} (oraculo ${esperado})`) }
  }
  oraculo('SV05', `C · ${par}: ${n} medios ticks con exponente = el oraculo decimal`, malos.length === 0 && n === 800, malos.length ? `${malos.length} distintos; ${malos.slice(0, 3).join(' · ')}` : `${n}/${n}`)
}
fin()
