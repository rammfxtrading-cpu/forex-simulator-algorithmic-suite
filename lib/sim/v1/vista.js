// DEL ESTADO CONFIRMADO DEL SERVIDOR A LA VISTA (etapa 2 del motor, pieza 2). Puro, sin React y sin lib/motor (la
// web no importa el motor): lee el estado tal como lo guarda la base y lo devuelve /api/sim/estado (BigInt como
// {"$b": "…"}, precios en ticks, lotes en centesimas, dinero en µUSD) y lo pone en la forma que pinta la pantalla de
// hoy (SessionPanels, posicionTradingView): par 'EUR/USD', side, entry/sl/tp en numero, lots, slPips/tpPips, y las
// pendientes como BUY_LIMIT / SELL_LIMIT / BUY_STOP / SELL_STOP. Solo lo confirmado: nada de lo que este en la cola.
// Pieza 5: la VALORACION la trae el servidor (snapshot.valoracion, calculada por el motor con los precios de todos los
// pares): equity, flotante de cada posicion, margen usado y, en un reto, sus limites y reglas. La vista no convierte ni
// suma: sin valoracion, equity y flotante quedan en null. delPar(vista, par) es lo que pinta la grafica del par visible.
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
  const val = snapshot?.valoracion ?? null
  // orden 1-134 (Ramon: el motor v1 cobra spread): la entrada que se ENSEÑA es la del motor (BUY al ask, SELL al bid)
  const posiciones = (c.posiciones ?? []).map(p => {
    const e = big(p.entrada), sl = big(p.sl), tp = big(p.tp)
    return { id: p.id, pair: conBarra(p.par), side: p.lado, entry: precio(p.par, e), sl: precio(p.par, sl), tp: precio(p.par, tp), lots: lotes(p.lotes_c),
      slPips: pips(e, sl), tpPips: pips(e, tp), openTime: momento(p.abierta_en), initialSlPips: pips(e, sl),
      flotante: val?.flotante_µ?.[p.id] != null ? usd(val.flotante_µ[p.id]) : null }
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
    equity: val?.equity_µ != null ? usd(val.equity_µ) : null,
    margenUsado: val?.margen_usado_µ != null ? usd(val.margen_usado_µ) : null,
    estado: c.estado ?? null,
    posiciones, ordenes, cotizaciones,
    reto: reto ? {
      reglas: reto.reglas, fase: reto.fase, estado: reto.estado, capital: usd(reto.capital_inicial_µ), objetivo: usd(reto.objetivo_µ), breach: reto.breach ?? null, superada: reto.superada ?? null,
      // orden 1-127 (5): la equity con que el motor vio roto el limite (el minimo de equity del reto quemado)
      equityBreach: reto.breach?.equity_µ != null ? usd(reto.breach.equity_µ) : null,
      saldoMedianoche: usd(reto.saldo_medianoche_µ), diasConApertura: [...(reto.dias_con_apertura ?? [])],
      limites: (val?.limites ?? []).map(l => ({ regla: l.regla, limite: usd(l.limite_µ) })),
      normas: val?.reglas ?? null,
    } : null,
    sinConfirmar: pendientes ? pendientes.length : 0,
  }
}

// lo que pinta la grafica del par visible ('EUR/USD'): sus posiciones, sus pendientes y su cotizacion. El resto de pares
// sigue en la vista (saldo, equity, lista de operaciones): sus SL, TP y fills los resuelve el servidor sin sus velas.
export function delPar(vista, par) {
  return { ...vista, posiciones: vista.posiciones.filter(p => p.pair === par), ordenes: vista.ordenes.filter(o => o.pair === par), cotizacion: vista.cotizaciones?.[par] ?? null }
}
