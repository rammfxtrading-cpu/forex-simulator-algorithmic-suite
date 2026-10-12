// lib/mercado/descarga.mjs — la descarga PROPIA de velas M1 del proveedor
// (bloque F, punto 4; CTO 5-oct-2026). La usa scripts/actualizar-diario.js.
//
// Por que propia: getHistoricalRates de dukascopy-node 1.46.4 reintenta por su
// cuenta y, si no hay error de red, convierte cualquier respuesta no-200 (o
// vacia, con retryOnEmpty) en «Unknown error»: no se sabia si era el servidor,
// la red o que no habia datos. Aqui se componen las MISMAS piezas que usa
// getHistoricalRates (dist/index.js:17209-17295: normaliseDates, generateUrls,
// processData, formatOutput, con sus valores por defecto: bid, m1, utcOffset 0,
// volumenes en millones, ignoreFlats) y cada URL se pide con nuestro fetch:
//   · log por intento: «PAR AAAA-MM-DD · intento i/n · HTTP s · b bytes · clase
//     · espera x s». NUNCA la URL ni ninguna clave.
//   · clases: «sin datos» (404, o 200 vacio: un vacio legitimo, no se
//     reintenta), «servidor» (429, 5xx: se reintenta; otro 4xx: no), «red» (el
//     fetch lanza: se reintenta).
//   · esperas crecientes con azar: base · 2^(i−1) · (0,5 + azar), con tope; un
//     Retry-After (segundos o fecha) manda si es mayor.
//   · presupuesto (punto 5): si la espera pasaria del limite, se para con la
//     clase «presupuesto».
//   · tiempo maximo (bloque G, punto 9; BF-03): cada intento lleva una señal
//     que se aborta a min(peticionMs, lo que queda hasta el limite): corta el
//     fetch Y la lectura del cuerpo. Abortado por el limite → «presupuesto»;
//     por su plazo de peticion → «red (plazo)», que se reintenta. Un intento
//     que termina despues del limite se descarta («presupuesto»), y con
//     ahora >= limite no se empieza ninguno.
// ⚠️ La composicion replica getHistoricalRates de la version instalada; no se
//    ha ensayado contra el proveedor real (las pruebas usan un doble).
// Bloque G, punto 8 (BF-02): de un error de red solo se escribe un codigo de la
// lista de lib/mercado/errores.mjs (o «otro»); nunca su message ni su cause.
import { codigo } from './errores.mjs'
import { plazoReal } from './limites.mjs'

export class ErrorDescarga extends Error {
  // el detalle es siempre nuestro (codigo de la lista, estado HTTP, segundos): propio
  constructor(tipo, detalle) { super(`${tipo}${detalle ? ': ' + detalle : ''}`); this.tipo = tipo; this.name = 'ErrorDescarga'; this.propio = true }
}
const coma = n => n.toFixed(1).replace('.', ',')

// Retry-After: segundos o fecha HTTP → ms (o null)
function retryAfterMs(valor, ahora) {
  if (valor == null) return null
  const s = Number(valor)
  if (Number.isFinite(s) && s >= 0) return s * 1000
  const t = Date.parse(valor)
  return Number.isFinite(t) ? Math.max(0, t - ahora) : null
}

// Una URL con reintentos. → { tipo: 'ok' | 'sin-datos', buffer }
// Lanza ErrorDescarga('servidor' | 'red' | 'presupuesto' | 'limite' (cualquier 429))
export async function pideUrl(url, { fetch, espera, log, etiqueta, intentos = 5, baseMs = 2000, topeMs = 60000, azar = Math.random, ahora = () => Date.now(), limite = Infinity, peticionMs = 60000, plazo = plazoReal, drenajeMs = 5000 }) {
  let ultimo = null
  // (MER-R1, 7-oct, recordaba un 429 visto para no convertirlo en «presupuesto»
  // tras esperar su Retry-After; desde el 9-oct un 429 corta en el acto y no hay
  // nada que recordar)
  const agotado = detalle => new ErrorDescarga('presupuesto', detalle)
  for (let i = 1; i <= intentos; i++) {
    const resta = limite - ahora()
    if (resta <= 0) throw agotado(`sin tiempo antes del intento ${i}`)
    const porLimite = resta <= peticionMs           // si vence la señal, ¿es el presupuesto o el plazo de la peticion?
    const senal = plazo(Math.min(peticionMs, resta))
    const t0 = performance.now()                  // CTO 6-oct: el log dice cuanto tardo cada intento
    let estado = null, bytes = 0, clase, buffer = null, ra = null
    try {
      const r = await fetch(url, { signal: senal })
      estado = r.status
      if (r.status === 200) {
        buffer = Buffer.from(await r.arrayBuffer()); bytes = buffer.length
        clase = bytes ? 'ok' : 'sin datos'
      } else {
        if (r.status === 404) clase = 'sin datos'
        else { clase = 'servidor'; ra = retryAfterMs(r.headers?.get?.('retry-after'), ahora()) }
        // CON-01 (Astra, cierres-5): el cuerpo que no se usa (429, 404, 5xx) se
        // lee entero, con tope, antes de seguir: si el job termina despues, no
        // cierra la conexion a medias. Si falla, el estado ya esta guardado.
        if (typeof r.descarta === 'function') { try { await r.descarta(plazo(drenajeMs)) } catch {} }
      }
    } catch (e) {
      if (senal.aborted && porLimite) throw agotado(`intento ${i} abortado al llegar el limite`)
      clase = 'red'; ultimo = senal.aborted ? `plazo ${coma(peticionMs / 1000)} s` : codigo(e)
    }
    // M-02 (Astra, 7-oct): el 429 se mira ANTES que el limite de tiempo: un 429
    // recibido al vencer el presupuesto sigue activando el corte global (no trae
    // datos que descartar; sin tiempo, su Retry-After no cabe y corta).
    // CTO 6-oct (tras la sonda 1): un 429 es un LIMITE DEL PROVEEDOR ENTERO, no
    // un fallo del dia. CTO 9-oct (Astra MD-03; sustituye a la espera con
    // reintento del 6/7-oct): CUALQUIER 429, tambien con Retry-After, corta
    // todo en ese momento: ErrorDescarga('limite') sin esperar ni reintentar;
    // quien llama corta el job y publica lo contiguo ya conseguido.
    if (estado === 429) {
      log?.(`${etiqueta} · intento ${i}/${intentos} · HTTP 429 · ${bytes} bytes · limite del proveedor${ra == null ? ' · sin Retry-After' : ` · Retry-After ${coma(ra / 1000)} s (no se espera: corte)`} · ${Math.round(performance.now() - t0)} ms`)
      throw Object.assign(new ErrorDescarga('limite', `HTTP 429${ra != null ? ` · Retry-After ${coma(ra / 1000)} s` : ''}`), { estado, retryAfterMs: ra })
    }
    // BF-03: el presupuesto se comprueba tambien AL TERMINAR la peticion
    if (ahora() >= limite) throw agotado(`el intento ${i} termino despues del limite: se descarta`)
    const reintentable = clase === 'red' || (clase === 'servidor' && estado >= 500)
    const ultimoIntento = i === intentos || !reintentable
    let pausa = 0
    if (reintentable && !ultimoIntento) {
      pausa = Math.min(topeMs, baseMs * 2 ** (i - 1) * (0.5 + azar()))
      if (ra != null) pausa = Math.min(Math.max(pausa, ra), Math.max(topeMs, ra))
    }
    const que = clase === 'red' ? `red (${ultimo})` : `HTTP ${estado} · ${bytes} bytes · ${clase}`
    const sinTiempo = pausa > 0 && ahora() + pausa >= limite
    log?.(`${etiqueta} · intento ${i}/${intentos} · ${que}${pausa ? (sinTiempo ? ` · no se espera: ${coma(pausa / 1000)} s pasaria del limite` : ` · espera ${coma(pausa / 1000)} s`) : ''} · ${Math.round(performance.now() - t0)} ms`)
    if (clase === 'ok') return { tipo: 'ok', buffer }
    if (clase === 'sin datos') return { tipo: 'sin-datos', buffer: Buffer.alloc(0) }
    // el error lleva el estado HTTP y el Retry-After (ms) para quien decida parar (sonda, actualizador)
    if (ultimoIntento) throw Object.assign(new ErrorDescarga(clase, clase === 'red' ? ultimo : `HTTP ${estado}`), { estado, retryAfterMs: ra })
    if (sinTiempo) throw agotado(`la espera de ${coma(pausa / 1000)} s pasaria del limite`)
    await espera(pausa)
  }
}

// Un dia UTC de un par. → { tipo: 'ok' | 'sin-datos', velas: [{ time (s), open, high, low, close, volume }] }
export async function bajaDia({ sdk, fetch, espera, log, par, dia, limite = Infinity, ...opciones }) {
  const instrument = String(par).toLowerCase()
  const from = new Date(dia + 'T00:00:00Z'), to = new Date(from.getTime() + 86400000)
  const [inicio, fin] = sdk.normaliseDates({ instrument, startDate: from, endDate: to, timeframe: 'm1', utcOffset: 0 })
  const urls = sdk.generateUrls({ instrument, timeframe: 'm1', priceType: 'bid', startDate: inicio, endDate: fin })
  const objetos = []
  for (const url of urls) {
    const r = await pideUrl(url, { fetch, espera, log, etiqueta: `${String(par).toUpperCase()} ${dia}`, limite, ...opciones })
    if (r.tipo === 'ok') objetos.push({ url, buffer: r.buffer, isCacheHit: false })
  }
  if (!objetos.length) return { tipo: 'sin-datos', velas: [] }
  const datos = sdk.processData({ instrument, requestedTimeframe: 'm1', bufferObjects: objetos, priceType: 'bid', volumes: true, volumeUnits: 'millions', ignoreFlats: true })
  const [a, b] = [+inicio, +fin]
  const enRango = datos.filter(([ts]) => ts && ts >= a && ts < b)
  const filas = sdk.formatOutput({ processedData: enRango, format: 'json', timeframe: 'm1' })
  return { tipo: 'ok', velas: filas.map(c => ({ time: Math.floor(c.timestamp / 1000), open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume })) }
}
