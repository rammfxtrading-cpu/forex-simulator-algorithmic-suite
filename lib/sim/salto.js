// El salto del Go to (orden 1-080 del CTO, el caso de Luis). Un salto se comporta igual
// que el replay vela a vela: se recorren TODAS las velas M1 del tramo, en orden, con el
// mismo onTick (SL/TP, activacion de pendientes, breach del reto). Antes era UN onTick para
// todo el tramo y un reset de cursores: una pendiente que se llenaba dentro del salto no
// miraba nunca su SL ni su TP (M04, variante Go to).
//
// Entre vela y vela, lo que el replay hace solo porque pasa el tiempo: tras una vela con algo
// nuevo (una pendiente llenada, un cierre pedido) o con cambio de dia de Madrid en un reto, se
// espera a que la cola aplique los cierres (saldo y posiciones) y se relee el reto con la hora
// de ESA vela (lib/sim/cola.js: va detras de los cierres). Si el reto ya no esta activo
// (objetivo alcanzado o quemado), el salto para ahi, como el replay, que queda bloqueado.
import { esperaCola, cierresPendientes } from './cola'

const diaMadrid = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' })

// lo que cambia cuando pasa algo en una vela: posiciones, pendientes, cierres y el dia
function huellaDe({ sid, engine, pairState, esReto }) {
  const pares = Object.entries(pairState.current).map(([k, ps]) =>
    `${k}:${(ps?.positions || []).map(p => p.id).join(',')}/${(ps?.orders || []).map(o => o.id).join(',')}/${ps?.trades?.length || 0}`)
  const dia = esReto && engine.currentTime ? diaMadrid.format(new Date(engine.currentTime * 1000)) : ''
  return `${pares.join(';')}|${cierresPendientes(sid)}|${dia}`
}

// refresca(ct): el refresco del reto en la cola con esa hora (useChallengeFlow); devuelve su estado
export function saltaA({ engine, hasta, sid, pairState, esReto, refresca }) {
  let previa = huellaDe({ sid, engine, pairState, esReto })
  const trasVela = async () => {
    const ahora = huellaDe({ sid, engine, pairState, esReto })
    if (ahora === previa) return true
    await esperaCola(sid)
    if (esReto && refresca) {
      const data = await refresca(engine.currentTime)
      const st = data?.evaluation?.status
      if (st && st !== 'active') return false
    }
    previa = huellaDe({ sid, engine, pairState, esReto })
    return true
  }
  return engine.avanzaHasta(hasta, trasVela)
}
