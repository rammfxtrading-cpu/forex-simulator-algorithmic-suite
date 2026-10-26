/**
 * SV06 · EL ORDERMODAL TAMPOCO HACE ARITMETICA BINARIA ANTES DEL AJUSTE AL TICK (orden 1-121 (a) del CTO; la familia de
 * SIMMOTOR1-02 de Astra, que sv05 cubre en el preview). Escrita ANTES que el codigo (contra 3d29a85: en rojo).
 *   components/OrderModal.js calculaba entrada ± pips × tamaño del pip en coma flotante y enseñaba ese numero con
 *   toFixed; _SessionInner.js lo ajustaba despues con alTick para guardarlo. En un medio tick el binario lo deja por
 *   debajo de la mitad: el modal enseña y guarda un tick de menos. Ahora: la misma cuenta entera desde el texto que el
 *   arreglo 02 (priceFromPips → alTickConPips).
 *   A · familia de medios ticks: EURUSD y USDJPY, BUY y SELL, SL y TP, pips 1/10/30 tecleados en el modal REAL,
 *       contra un ORACULO DECIMAL escrito aqui (BigInt; no importa nada del producto): lo que el modal ENSEÑA, lo que
 *       entrega al confirmar y lo que se GUARDA (el alTick de _SessionInner.js, como hace la pagina) son el oraculo.
 *   B · el caso de Astra con los valores con los que se abre el modal (SL 10, TP 20 pips), sin teclear nada.
 *   C · lo que no cambia: el modal que nace de un dibujo (sl/tp del dibujo, pips sin tocar) enseña los del dibujo.
 * Cambio visible aprobado (Ramon, orden 1-137): el SL/TP del modal puede moverse un tick en los medios ticks.
 */
import { titulo, ver, oraculo, fin, importa, fuente, escenario, monta } from '../lib.mjs'
const op = m => importa(m).catch(() => null)
const M = (await op('components/OrderModal.js'))?.default, V = await op('lib/sim/vela.js')
if (!M || !V?.alTick) { for (let i = 0; i < 16; i++) oraculo('SV06', `caso ${i}: sin OrderModal o alTick no se puede`, false, 'no estan'); fin() }
escenario({})

// ── el oraculo: decimales en BigInt, sin nada del producto ──────────────────────
const DEC = par => (par.includes('JPY') ? 3 : 5)
function entero(texto, escala) {
  const m = /^(\d+)(?:\.(\d+))?$/.exec(texto)
  if (!m) throw new Error(`oraculo: no es un decimal: ${texto}`)
  const f = m[2] ?? ''
  if (f.length > escala) throw new Error(`oraculo: ${texto} tiene mas de ${escala} decimales`)
  return BigInt(m[1] + f.padEnd(escala, '0'))
}
const texto = (x, escala) => { const s = x.toString().padStart(escala + 1, '0'); return `${s.slice(0, -escala)}.${s.slice(-escala)}` }
// entrada ± pips enteros (un pip = 10 ticks) → el precio ajustado (la mitad, arriba), como texto con los decimales del par
function oraculoPrecio({ largo, entrada, pips, par, pierna }) {
  const d = DEC(par), esc = d + 1
  const e = entero(entrada, esc), p = BigInt(pips) * 100n               // pips × 10 ticks × 10 (escala del medio tick)
  const x = (pierna === 'TP') === largo ? e + p : e - p
  return texto((x + 5n) / 10n, d)
}
ver('oraculo a mano: 1,100005 + 30 pips (BUY TP) = 1,10301', oraculoPrecio({ largo: true, entrada: '1.100005', pips: 30, par: 'EUR/USD', pierna: 'TP' }) === '1.10301')
ver('oraculo a mano: 1,100005 + 20 pips (BUY TP) = 1,10201', oraculoPrecio({ largo: true, entrada: '1.100005', pips: 20, par: 'EUR/USD', pierna: 'TP' }) === '1.10201')
ver('oraculo a mano: 151,2345 + 30 pips (SELL SL) = 151,535', oraculoPrecio({ largo: false, entrada: '151.2345', pips: 30, par: 'USD/JPY', pierna: 'SL' }) === '151.535')

// ── el modal real ──────────────────────────────────────────────────────────
// los campos por su etiqueta: [RIESGO %, RIESGO $, LOTS, ENTRADA, PRECIO (TP), PIPS (TP), PRECIO (SL), PIPS (SL)]
function abre(modal) {
  let enviado = null
  const r = monta(M, { modal, balance: 100000, initialBalance: 100000, isChallenge: false, currentPrice: modal.entry, onClose() {}, onConfirm: d => { enviado = d } })
  const campos = () => r.todos(x => x.tipo === 'input').map(i => ({ i, etiqueta: r.texto(i.padre.padre.hijos[0]) }))
  const de = (k) => campos()[k].i
  return {
    r, campos,
    teclea(tpPips, slPips) { r.escribe(de(5), String(tpPips)); r.render(); r.escribe(de(7), String(slPips)); r.render() },
    visto: () => ({ tp: de(4).props.value, sl: de(6).props.value }),
    confirma() { r.pulsa(r.busca(x => x.tipo === 'button' && /Colocar|Ejecutar/.test(r.texto(x)))); return enviado },
  }
}
{
  const m = abre({ side: 'BUY', entry: 1.1, pair: 'EUR/USD', isLimit: true })
  ver('control: el modal tiene los ocho campos en su orden', m.campos().map(c => c.etiqueta).join() === 'RIESGO %,RIESGO $,LOTS,ENTRADA,PRECIO,PIPS,PRECIO,PIPS', m.campos().map(c => c.etiqueta).join())
  const t = m.r.texto()
  ver('control: TAKE PROFIT va antes que STOP LOSS (los campos 4-5 son del TP y 6-7 del SL)', t.indexOf('TAKE PROFIT') > 0 && t.indexOf('TAKE PROFIT') < t.indexOf('STOP LOSS'))
  m.teclea(25, 12)
  ver('control: teclear los pips cambia el precio que se ve (1,1 + 25 pips = 1.10250; − 12 = 1.09880)', m.visto().tp === '1.10250' && m.visto().sl === '1.09880', JSON.stringify(m.visto()))
  const e = m.confirma()
  ver('control: confirmar entrega SL, TP y pips', e && e.tpPips === 25 && e.slPips === 12 && typeof e.sl === 'number' && typeof e.tp === 'number', JSON.stringify(e))
  m.r.desmonta()
}
// lo que se guarda: _SessionInner.js ajusta al tick lo que entrega el modal (orden 1-119) y eso va a la orden o al comando
ver('control: _SessionInner.js guarda alTick(posDatos.sl) y alTick(posDatos.tp) del modal', /const posData=\{\.\.\.posDatos, sl:alTick\(posDatos\.sl,orderModal\.pair\), tp:alTick\(posDatos\.tp,orderModal\.pair\)\}/.test(fuente('components/_SessionInner.js')))
const guarda = (x, par) => V.alTick(x, par)

// ── A · familia de medios ticks ──────────────────────────────────────────────
titulo('A · el modal: medios ticks contra el oraculo decimal (lo que enseña, lo que entrega, lo que se guarda)')
let semilla = 20261026
const azar = n => { semilla = (semilla * 1103515245 + 12345) % 2147483648; return semilla % n }
const ENTRADAS = {}
for (const par of ['EUR/USD', 'USD/JPY']) {
  const d = DEC(par), base = par.includes('JPY') ? 150000 : 110000, lo = par.includes('JPY') ? 80000 : 50000, rango = par.includes('JPY') ? 120000 : 150000
  const ticks = [...Array.from({ length: 50 }, (_, k) => base + k), ...Array.from({ length: 50 }, () => lo + azar(rango))]
  ENTRADAS[par] = ticks.map(t => texto(BigInt(t) * 10n + 5n, d + 1))
}
ver('control: 100 entradas por par, todas a medio tick y escritas igual como Number', Object.values(ENTRADAS).every(l => l.length === 100 && l.every(s => s.endsWith('5') && String(Number(s)) === s)))
let total = 0
for (const par of ['EUR/USD', 'USD/JPY']) for (const largo of [true, false]) for (const pips of [1, 10, 30]) {
  const malVisto = [], malEntregado = [], malGuardado = []
  for (const e of ENTRADAS[par]) {
    total++
    const sl = oraculoPrecio({ largo, entrada: e, pips, par, pierna: 'SL' }), tp = oraculoPrecio({ largo, entrada: e, pips, par, pierna: 'TP' })
    const m = abre({ side: largo ? 'BUY' : 'SELL', entry: Number(e), pair: par, isLimit: total % 2 === 0 })
    m.teclea(pips, pips)
    const v = m.visto(), x = m.confirma()
    m.r.desmonta()
    if (v.sl !== sl || v.tp !== tp) malVisto.push(`${e}: ${v.sl}/${v.tp} (oraculo ${sl}/${tp})`)
    if (x?.sl !== Number(sl) || x?.tp !== Number(tp)) malEntregado.push(`${e}: ${x?.sl}/${x?.tp} (oraculo ${sl}/${tp})`)
    const g = { sl: guarda(x?.sl, par), tp: guarda(x?.tp, par) }
    if (g.sl?.toFixed(DEC(par)) !== v.sl || g.tp?.toFixed(DEC(par)) !== v.tp || g.sl !== Number(sl) || g.tp !== Number(tp)) malGuardado.push(`${e}: guardado ${g.sl}/${g.tp}, visto ${v.sl}/${v.tp}`)
  }
  const que = `${par} ${largo ? 'BUY' : 'SELL'} ${pips} pips`
  oraculo('SV06', `A · ${que}: el SL y el TP que ENSEÑA el modal = el oraculo (100 medios ticks)`, malVisto.length === 0, malVisto.length ? `${malVisto.length} distintos; ${malVisto.slice(0, 2).join(' · ')}` : '100/100')
  oraculo('SV06', `A · ${que}: el SL y el TP que ENTREGA al confirmar = el oraculo`, malEntregado.length === 0, malEntregado.length ? `${malEntregado.length} distintos; ${malEntregado.slice(0, 2).join(' · ')}` : '100/100')
  oraculo('SV06', `A · ${que}: lo que se GUARDA = lo que enseña el modal = el oraculo`, malGuardado.length === 0, malGuardado.length ? `${malGuardado.length} distintos; ${malGuardado.slice(0, 2).join(' · ')}` : '100/100')
}
ver('control: 1.200 modales de la familia', total === 1200, String(total))

// ── B · el caso de Astra, sin teclear: el modal se abre con SL 10 y TP 20 pips ───
titulo('B · los valores con los que se abre el modal (SL 10, TP 20)')
for (const [side, entrada, par] of [['BUY', '1.100005', 'EUR/USD'], ['SELL', '1.100005', 'EUR/USD'], ['BUY', '151.2345', 'USD/JPY'], ['SELL', '151.2345', 'USD/JPY']]) {
  const largo = side === 'BUY'
  const sl = oraculoPrecio({ largo, entrada, pips: 10, par, pierna: 'SL' }), tp = oraculoPrecio({ largo, entrada, pips: 20, par, pierna: 'TP' })
  const m = abre({ side, entry: Number(entrada), pair: par, isLimit: true })
  const v = m.visto(), x = m.confirma()
  m.r.desmonta()
  oraculo('SV06', `B · ${side} LIMIT ${par} ${entrada} sin tocar los pips: enseña y guarda SL ${sl}, TP ${tp}`, v.sl === sl && v.tp === tp && guarda(x?.sl, par) === Number(sl) && guarda(x?.tp, par) === Number(tp), JSON.stringify({ visto: v, entregado: { sl: x?.sl, tp: x?.tp } }))
}

// ── C · lo que no cambia ─────────────────────────────────────────────────────
titulo('C · el modal que nace de un dibujo enseña el SL/TP del dibujo mientras no se tocan los pips')
{
  const m = abre({ side: 'BUY', entry: 1.1, pair: 'EUR/USD', isLimit: true, sl: 1.09873, tp: 1.10412, slPips: 12.7, tpPips: 41.2 })
  const v = m.visto(), x = m.confirma()
  m.r.desmonta()
  oraculo('SV06', 'C · dibujo sin tocar los pips: enseña y entrega 1.09873 / 1.10412 (los del dibujo)', v.sl === '1.09873' && v.tp === '1.10412' && x?.sl === 1.09873 && x?.tp === 1.10412, JSON.stringify({ v, sl: x?.sl, tp: x?.tp }))
}
fin()
