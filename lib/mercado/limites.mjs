// lib/mercado/limites.mjs — plazos con cancelacion real (bloque G, punto 9;
// Astra BF-03; CTO 6-oct-2026).
//
// plazoReal(ms) → una AbortSignal que se aborta a los ms (AbortSignal.timeout:
//   su temporizador es interno, no el setTimeout global). Se inyecta `plazo`
//   en las pruebas para adelantar el tiempo a mano.
// fetchConLimite(base, ms) → un fetch que aborta cada peticion a los ms (y su
//   cuerpo: con undici, abortar la señal corta tambien la lectura del cuerpo).
//   Es el fetch del cliente de Storage de los scripts (createClient global.fetch):
//   storage-js 2.102 solo acepta señal en download; asi upload, info y remove
//   tambien se cancelan de verdad.
// hastaSenal(promesa, señal, que) → la promesa, o un error de tiempo si la
//   señal se aborta antes. NO cancela la operacion: eso lo hace quien recibe
//   la señal (download) o el fetch con plazo. Por eso una SUBIDA que vence aqui
//   tiene resultado incierto y se reconcilia (lib/mercado/ficheros.mjs).

export const plazoReal = ms => AbortSignal.timeout(Math.max(0, Math.floor(ms)))

export function fetchConLimite(base, ms, plazo = plazoReal) {
  const f = (url, init = {}) => {
    const limite = plazo(ms)
    const signal = init?.signal ? AbortSignal.any([init.signal, limite]) : limite
    return base(url, { ...init, signal })
  }
  f.conLimite = ms
  return f
}

export class ErrorTiempo extends Error {
  constructor(que, ms) { super(`${que}: sin respuesta en ${Math.round(ms / 1000)} s (tiempo agotado)`); this.name = 'TimeoutError'; this.propio = true }
}

export function hastaSenal(promesa, senal, que, ms) {
  if (senal.aborted) return Promise.reject(new ErrorTiempo(que, ms))
  return new Promise((ok, mal) => {
    const fuera = () => mal(new ErrorTiempo(que, ms))
    senal.addEventListener('abort', fuera, { once: true })
    Promise.resolve(promesa).then(v => { senal.removeEventListener('abort', fuera); ok(v) }, e => { senal.removeEventListener('abort', fuera); mal(e) })
  })
}
