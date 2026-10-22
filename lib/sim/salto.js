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

// La FRONTERA ECONOMICA, una sola para el salto, el Step y el Play (SIMGOTO2-01, Astra; orden 1-087 del
// CTO): tras una vela con algo nuevo (o cambio de dia de Madrid en un reto), no se pasa a la siguiente hasta
// que la cola ha aplicado los cierres y el reto se ha releido con la hora de ESA vela. Asi los tres leen el
// mismo estado del reto en el mismo momento. Devuelve una funcion sin argumentos: null si la vela no trajo
// nada (se sigue sin esperar) o una promesa: true para seguir, false si el reto ya no esta activo (se para).
// refresca(ct): el refresco del reto en la cola con esa hora (useChallengeFlow); devuelve su estado
export function creaFrontera({ engine, sid, pairState, esReto, refresca }) {
  let previa = huellaDe({ sid, engine, pairState, esReto })
  return () => {
    const ahora = huellaDe({ sid, engine, pairState, esReto })
    if (ahora === previa) return null
    return (async () => {
      await esperaCola(sid)
      if (esReto && refresca) {
        const data = await refresca(engine.currentTime)
        const st = data?.evaluation?.status
        if (st && st !== 'active') return false
      }
      previa = huellaDe({ sid, engine, pairState, esReto })
      return true
    })()
  }
}

// esperaAntes (el Go to): GOTOG1-01 (orden 1-089), antes de saltar, lo pedido y aun sin resolver (un cierre en
// vuelo): si falla y la posicion vuelve, vuelve ANTES de las velas que la tocan. El Step y el Play no esperan
// (contrato E102-sltp de la etapa 1): si un cierre falla, restaura apunta sus velas pasadas y reevaluaSLTP las
// revisa con la hora de cada vela (checkSLTP), lo mismo que el salto
// SGR4-01 (revision adversarial r4): un Step o un Go to pulsados con el Play pausado y SU frontera aun pendiente (un
// cierre de la vela anterior sin confirmar, o el reto sin releer) esperan a que se resuelva; si deja el motor
// bloqueado (breach), no avanzan. Si no, la frontera nueva nacia con ese cierre ya en su huella y no esperaba
export async function saltaA({ engine, hasta, sid, pairState, esReto, refresca, esperaAntes = true }) {
  if (engine.saltando) return false
  if (engine._esperando) {
    await engine._esperando
    if (engine.saltando || engine.bloqueado) return false
  }
  if (esperaAntes) await esperaCola(sid)
  const frontera = creaFrontera({ engine, sid, pairState, esReto, refresca })
  return engine.avanzaHasta(hasta, async () => (await frontera()) ?? true)
}

// el Step: UNA vela con la misma frontera (handleStep, _SessionInner.js); true si avanzo
export function pasoConFrontera({ engine, sid, pairState, esReto, refresca }) {
  const sig = engine.candles[engine.currentIndex + 1]
  if (!sig) { engine.nextCandle(1); return Promise.resolve(false) }
  return saltaA({ engine, hasta: sig.time, sid, pairState, esReto, refresca, esperaAntes: false })
}
