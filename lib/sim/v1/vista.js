// DEL ESTADO CONFIRMADO DEL SERVIDOR A LA VISTA (etapa 2 del motor, pieza 2). Puro, sin React y sin lib/motor (la
// web no importa el motor): lee el estado tal como lo guarda la base y lo devuelve /api/sim/estado (BigInt como
// {"$b": "…"}, precios en ticks, lotes en centesimas, dinero en µUSD) y lo pone en la forma que pinta la pantalla de
// hoy (SessionPanels, posicionTradingView): par 'EUR/USD', side, entry/sl/tp en numero, lots, slPips/tpPips, y las
// pendientes como BUY_LIMIT / SELL_LIMIT / BUY_STOP / SELL_STOP. Solo lo confirmado: nada de lo que este en la cola.
const big = x => (x == null ? null : typeof x === 'object' && typeof x.$b === 'string' ? BigInt(x.$b) : BigInt(x))
const digitos = par => (par.endsWith('JPY') ? 3 : 5)
const conBarra = par => `${par.slice(0, 3)}/${par.slice(3)}`
const precio = (par, t) => { const v = big(t); if (v == null) return null; const d = digitos(par), s = v.toString().padStart(d + 1, '0'); return Number(`${s.slice(0, -d)}.${s.slice(-d)}`) }
const usd = µ => { const v = big(µ); if (v == null) return null; const neg = v < 0n, a = neg ? -v : v; return Number(`${neg ? '-' : ''}${a / 1000000n}.${(a % 1000000n).toString().padStart(6, '0')}`) }
const lotes = c => Number(big(c)) / 100
const pips = (a, b) => (a == null || b == null ? null : Number((a > b ? a - b : b - a)) / 10)
const momento = en => (en == null ? null : en.t ?? en.vela ?? null)

export function vistaDe(snapshot, { pendientes = null } = {}) {
  const raiz = snapshot?.estado ?? {}
  const reto = raiz.esquema === 'reto@1' ? raiz : null
  const c = reto ? raiz.motor : raiz
  const posiciones = (c.posiciones ?? []).map(p => {
    const e = big(p.entrada), sl = big(p.sl), tp = big(p.tp)
    return { id: p.id, pair: conBarra(p.par), side: p.lado, entry: precio(p.par, e), sl: precio(p.par, sl), tp: precio(p.par, tp), lots: lotes(p.lotes_c),
      slPips: pips(e, sl), tpPips: pips(e, tp), openTime: momento(p.abierta_en), initialSlPips: pips(e, sl) }
  })
  const ordenes = (c.ordenes ?? []).map(o => {
    const e = big(o.precio), sl = big(o.sl), tp = big(o.tp)
    return { id: o.id, pair: conBarra(o.par), side: `${o.lado}_${o.tipo === 'stop' ? 'STOP' : 'LIMIT'}`, entry: precio(o.par, e), sl: precio(o.par, sl), tp: precio(o.par, tp), lots: lotes(o.lotes_c),
      slPips: pips(e, sl), tpPips: pips(e, tp), createdTime: momento(o.creada_en) }
  })
  const cotizaciones = {}
  for (const [par, q] of Object.entries(c.cotizaciones ?? {})) {
    const bid = big(q?.bid); if (bid == null) continue
    const sp = big(c.costes?.spread_ticks?.[par] ?? 0)
    cotizaciones[conBarra(par)] = { bid: precio(par, bid), ask: precio(par, bid + sp), en: q.en ?? null }
  }
  return {
    version: snapshot?.version ?? null,
    cursor: c.reloj?.cursor ?? null,
    pares: (c.pares ?? []).map(conBarra),
    saldo: usd(c.saldo_µ),
    estado: c.estado ?? null,
    posiciones, ordenes, cotizaciones,
    reto: reto ? { reglas: reto.reglas, fase: reto.fase, estado: reto.estado, capital: usd(reto.capital_inicial_µ), objetivo: usd(reto.objetivo_µ), breach: reto.breach ?? null, superada: reto.superada ?? null } : null,
    sinConfirmar: pendientes ? pendientes.length : 0,
  }
}
