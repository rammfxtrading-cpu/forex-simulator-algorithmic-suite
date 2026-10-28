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
// (objetivo alcanzado o quemado), el salto para ahi y el motor queda bloqueado (el Play no se para: orden 1-124).
import { esperaCola, cierresPendientes, hayOcupadas, posicionOcupada } from './cola'
import { conPlazo, VENCIDO } from './plazo'
import { avisa } from './avisos'
import { leeServicio, inciertosDe, TEXTO_BLOQUEO } from './servicio'

// ORDEN 1-117 (cambia SIMGOTO4-01): las esperas a la cola del Play, el Step y el Go to tienen PLAZO (lib/sim/plazo.js).
// Al vencer, el avance se para REANUDABLE (no bloqueado: ni `pidiendo` ni `_esperando` quedan pendientes) y se avisa.
// Antes de volver a avanzar, antesDeReanudar vuelve a leer del servidor lo pendiente (abajo).
export const PLAZO_VENCIDO = 'plazo'
export const TEXTO_PLAZO = 'Un cierre está tardando en confirmarse: el avance se ha parado. Pulsa de nuevo para seguir.'
const esperaConPlazo = async sid => {
  if ((await conPlazo(esperaCola(sid))) !== VENCIDO) return true
  avisa(TEXTO_PLAZO); return false
}

const diaMadrid = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' })

// lo que cambia cuando pasa algo en una vela: posiciones, pendientes, cierres y el dia
// Orden 1-139 (punto 5, el Go to lento): el cambio de dia de Madrid solo cuenta con algo abierto (una posicion, una
// pendiente o un cierre en la cola). Sin nada abierto, el reto no puede cambiar al pasar el dia (su estado sale del
// saldo y de los cierres: lib/challengeEngine.js) y la vela siguiente no tiene nada que evaluar con el; esperar a
// releerlo en el servidor (/api/challenge/status) en cada medianoche del salto hacia que el Go to de un reto tardara
// una ida y vuelta al servidor por dia, y en f5b713b no espera nada. Con algo abierto, igual que antes (1-080, 1-087)
function huellaDe({ sid, engine, pairState, esReto }) {
  const estados = Object.values(pairState.current)
  const pares = Object.entries(pairState.current).map(([k, ps]) =>
    `${k}:${(ps?.positions || []).map(p => p.id).join(',')}/${(ps?.orders || []).map(o => o.id).join(',')}/${ps?.trades?.length || 0}`)
  const pendientes = cierresPendientes(sid)
  const abierto = pendientes > 0 || estados.some(ps => ps?.positions?.length || ps?.orders?.length)
  const dia = esReto && abierto && engine.currentTime ? diaMadrid.format(new Date(engine.currentTime * 1000)) : ''
  return `${pares.join(';')}|${pendientes}|${dia}`
}

// La FRONTERA ECONOMICA, una sola para el salto, el Step y el Play (SIMGOTO2-01, Astra; orden 1-087 del
// CTO): tras una vela con algo nuevo (o cambio de dia de Madrid en un reto), no se pasa a la siguiente hasta
// que la cola ha aplicado los cierres y el reto se ha releido con la hora de ESA vela. Asi los tres leen el
// mismo estado del reto en el mismo momento. Devuelve una funcion sin argumentos: null si la vela no trajo
// nada (se sigue sin esperar) o una promesa: true para seguir, false si el reto ya no esta activo (el salto y el
// Step se paran; el Play sigue: orden 1-124, lib/replayEngine.js).
// refresca(ct): el refresco del reto en la cola con esa hora (useChallengeFlow); devuelve su estado
// play (orden 1-153, fallos 02 y 05; la frontera del Play de la pagina con la bandera v1 apagada): la confirmacion del
// servidor no para el Play fuera de lo pactado. El Play solo espera tras una vela con un CIERRE (pedido o aplicado): la
// cola, con su plazo y su aviso (ordenes 1-117 y 1-124, sg20), y la relectura del reto, que es la que ve el breach diario
// que ese cierre provoca (sg13, sg14). Una pendiente que se llena o un cambio de dia sin cierre no hacen esperar: el reto
// se relee en segundo plano, como en produccion (f5b713b: useChallengeFlow al cambiar el dia de Madrid). Y si la relectura
// del reto no llega en el plazo, el Play sigue sin aviso (no es un cierre: el aviso decia «Un cierre está tardando» y no
// lo habia). Antes el Play se quedaba quieto al llenarse una limit lo que tardara /api/challenge/status (fallo 02) y, a la
// medianoche de Madrid con algo abierto, si tardaba mas de 12 s, se paraba con ese aviso sin cierre alguno (fallo 05).
// El Step y el Go to no cambian (play: false): siguen esperando a la cola y al reto en cada frontera (SIMGOTO2-01)
// La espera tras un CIERRE la cambia la orden 1-157 (abajo): va por detras y solo se espera con algo abierto
const huellaPlay = ({ sid, pairState }) =>
  `${Object.entries(pairState.current).map(([k, ps]) => `${k}:${ps?.trades?.length || 0}`).join(';')}|${cierresPendientes(sid)}`
// Orden 1-157 (el 02 de la prueba 4: el Play se paraba al saltar el SL o el TP): la confirmacion del cierre va POR DETRAS.
// En e8326d5 el Play esperaba tras cada cierre a la cola y a la relectura del reto (pl02: ~3 s quieto con la relectura
// lenta); en f5b713b, produccion, no espera nada. Ahora, tras una vela con un cierre, la cola y la relectura del reto (con
// la hora de ESA vela) se esperan en segundo plano y el Play sigue. Al terminar: si el reto ya no esta activo, el motor
// queda bloqueado (como antes: Step y Go to; el Play sigue, orden 1-124); si el CIERRE no se confirma en el plazo (12 s),
// el Play se para con su aviso (lo pactado, ordenes 1-117 y 1-124, sg20).
// El breach diario (sg13, sg14): la vela siguiente a un cierre solo puede quemar el reto si queda ALGO ABIERTO (otra
// posicion, o una pendiente que se puede llenar): con todo cerrado no hay flotante ni nada que evaluar. Solo entonces, y
// solo mientras esa confirmacion siga pendiente, el Play la espera antes de la vela, como hasta ahora: el detector de
// breach (useChallengeFlow) necesita el DD del dia con ese cierre, que lo da el reto releido. Lo normal (un trade y su
// SL o su TP) no espera nada
const algoAbierto = (sid, pairState) => Object.values(pairState.current).some(ps =>
  ps?.orders?.length || ps?.positions?.some(p => !posicionOcupada(sid, p.id)))
export function creaFrontera({ engine, sid, pairState, esReto, refresca, play = false }) {
  if (play) {
    let previa = huellaPlay({ sid, pairState })
    let fondo = null   // la confirmacion en curso (cola y reto), en segundo plano
    const confirma = ct => (async () => {
      if (cierresPendientes(sid) > 0 && !(await esperaConPlazo(sid))) return PLAZO_VENCIDO
      if (esReto && refresca) {
        const data = await conPlazo(refresca(ct))
        const st = data === VENCIDO ? null : data?.evaluation?.status
        if (st && st !== 'active') return false
      }
      return true
    })()
    const lanza = () => {
      const p = confirma(engine.currentTime).catch(() => true).then(v => {
        if (fondo === p) fondo = null
        previa = huellaPlay({ sid, pairState })
        if (v === false) engine.bloqueado = true
        // el cierre no se confirmo en el plazo (el aviso ya salio en esperaConPlazo): parado y reanudable
        if (v === PLAZO_VENCIDO && engine.isPlaying) { engine.pause(); engine.onPausa?.() }
        return v
      })
      fondo = p
      return p
    }
    // tras la vela: null (sigue sin esperar) salvo que quede algo abierto con la confirmacion pendiente
    const frontera = () => {
      if (!fondo && huellaPlay({ sid, pairState }) !== previa) lanza()
      return fondo && algoAbierto(sid, pairState) ? fondo : null
    }
    // antes de la vela: un cierre incierto (ocupada sin nada en la cola) para el Play, como antes; con algo abierto y la
    // confirmacion pendiente, se espera a ella (true para seguir, o el plazo vencido)
    frontera.antes = () => {
      if (cierresPendientes(sid) === 0 && hayOcupadas(sid)) return false
      if ((fondo || cierresPendientes(sid) > 0) && algoAbierto(sid, pairState)) {
        if (!fondo) lanza()
        return fondo.then(v => (v === PLAZO_VENCIDO ? PLAZO_VENCIDO : true))
      }
      return null
    }
    return frontera
  }
  let previa = huellaDe({ sid, engine, pairState, esReto })
  const frontera = () => {
    const ahora = huellaDe({ sid, engine, pairState, esReto })
    if (ahora === previa) return null
    return (async () => {
      if (!(await esperaConPlazo(sid))) return PLAZO_VENCIDO
      if (esReto && refresca) {
        const data = await conPlazo(refresca(engine.currentTime))
        if (data === VENCIDO) { avisa(TEXTO_PLAZO); return PLAZO_VENCIDO }
        const st = data?.evaluation?.status
        // orden 1-124: la huella se apunta tambien aqui; el Play sigue tras un false (lib/replayEngine.js) y,
        // sin esto, cada vela posterior volveria a esperar a la cola y a releer el reto
        if (st && st !== 'active') { previa = huellaDe({ sid, engine, pairState, esReto }); return false }
      }
      previa = huellaDe({ sid, engine, pairState, esReto })
      return true
    })()
  }
  // SIMGOTO4-01 (Astra; orden 1-093 del CTO): ANTES de cada vela, en los tres modos, si hay un cierre en vuelo
  // (pedido y sin confirmar, o una posicion ocupada) se espera a la cola. Asi ninguna vela se evalua con una
  // posicion provisionalmente fuera (o a medio cerrar): SL/TP, pendientes y el breach intravela ven siempre el
  // estado confirmado, el mismo en el salto, el Step y el Play, salga el cierre bien o mal
  // Una posicion ocupada SIN cierre en la cola es un cierre INCIERTO (lib/sim/cierre.js: no se suelta hasta que
  // servicio.js lo resuelve, >= 20 s): no hay nada que esperar en la cola y la vela no se puede evaluar; devuelve
  // false y el avance se para (revision adversarial r5: esperar a la cola vacia giraba sin ceder el hilo)
  frontera.antes = () => cierresPendientes(sid) > 0 ? esperaConPlazo(sid).then(ok => (ok ? true : PLAZO_VENCIDO)) : hayOcupadas(sid) ? false : null
  return frontera
}

// esperaAntes (el Go to): GOTOG1-01 (orden 1-089), antes de saltar, lo pedido y aun sin resolver (un cierre en
// vuelo): si falla y la posicion vuelve, vuelve ANTES de las velas que la tocan. Desde SIMGOTO4-01 (orden 1-093)
// los tres modos lo hacen ademas antes de CADA vela (frontera.antes): el Step y el Play ya no recorren velas con
// un cierre en vuelo (E102-sltp, actualizada: el Step espera a la cola)
// SGR4-01 (revision adversarial r4): un Step o un Go to pulsados con el Play pausado y SU frontera aun pendiente (un
// cierre de la vela anterior sin confirmar, o el reto sin releer) esperan a que se resuelva; si deja el motor
// bloqueado (breach), no avanzan. Si no, la frontera nueva nacia con ese cierre ya en su huella y no esperaba
// SIMGOTO5-01 (Astra; orden 1-095 del CTO): una pausa DURANTE estas esperas (la de la pagina al rechazarse un cierre,
// pausaPorBloqueo; un cambio de par) cancela el avance: tras cada espera se mira si el motor se ha pausado desde que se
// pidio, la misma comprobacion que hace avanzaHasta tras su espera de cada vela. Antes el Go to la perdia (aun no
// estaba «saltando») y arrancaba despues como una orden nueva
// SGR6-02 (revision adversarial r6): mientras espera, el motor queda «pidiendo» (engine.ocupado): la pagina no arranca
// Play, Step ni otro Go to encima y, al cambiar de par, lo pausa como a uno que ya salta (usePairData)
export async function saltaA({ engine, hasta, sid, pairState, esReto, refresca, esperaAntes = true }) {
  if (engine.saltando || engine.pidiendo) return false
  const m = engine._pausas
  engine.pidiendo = true
  try {
    if (engine._esperando) {
      await engine._esperando
      if (engine.saltando || engine.bloqueado || engine._pausas !== m) return false
    }
    if (esperaAntes) {
      if (!(await esperaConPlazo(sid))) return false
      if (engine.saltando || engine.bloqueado || engine._pausas !== m) return false
    }
    const frontera = creaFrontera({ engine, sid, pairState, esReto, refresca })
    return await engine.avanzaHasta(hasta, async () => (await frontera()) ?? true, frontera.antes)
  } finally {
    engine.pidiendo = false
  }
}

// el Step: UNA vela con la misma frontera (handleStep, _SessionInner.js); true si avanzo
export function pasoConFrontera({ engine, sid, pairState, esReto, refresca }) {
  const sig = engine.candles[engine.currentIndex + 1]
  if (!sig) { engine.nextCandle(1); return Promise.resolve(false) }
  return saltaA({ engine, hasta: sig.time, sid, pairState, esReto, refresca, esperaAntes: false })
}

// Antes de reanudar tras un plazo vencido (orden 1-117): lo pendiente se vuelve a leer del SERVIDOR, para no dar por
// cerrado lo que no consta. Un cierre sin respuesta queda INCIERTO (cierre.js): se relee su trade (servicio.js
// resuelveInciertos). Si consta guardado, se confirma y se sigue; si consta que no esta (pasada la ventana de 20 s de
// servicio.js), la posicion vuelve y se sigue; si no se puede saber todavia, no se avanza y se avisa (nunca congelado:
// basta volver a pulsar). Un cierre aun en la cola no se toca aqui: lo espera la frontera, con su plazo. true si se avanza
export async function antesDeReanudar(sid) {
  if (cierresPendientes(sid) > 0 || (!hayOcupadas(sid) && inciertosDe(sid) === 0)) return true
  await conPlazo(leeServicio())
  if (cierresPendientes(sid) > 0 || (!hayOcupadas(sid) && inciertosDe(sid) === 0)) return true
  avisa(TEXTO_BLOQUEO.incierto); return false
}
