// ESPIAS DE LA REGLA DE LA VELA DE LA PANTALLA (pieza 6, SIMMOTOR1-01 de Astra). Un cargador que se encadena DELANTE
// de cargador.mjs (la prueba lo registra con module.register antes de importar nada que use lib/sim/vela.js) y envuelve
// rutaComun y cierreEnVela: cada llamada, tambien las de dentro de vela.js, suma en globalThis.__espiasVela[nombre].
// Si el texto compilado no tiene exactamente una «export function <nombre>(», revienta: nunca espia en vacio.
const ESPIADAS = ['rutaComun', 'cierreEnVela']
export async function load(u, ctx, next) {
  const r = await next(u, ctx)
  if (!/\/lib\/sim\/vela\.js$/.test(u) || u.includes('/pruebas/')) return r
  let src = String(r.source)
  for (const n of ESPIADAS) {
    const de = `export function ${n}(`
    if (src.split(de).length !== 2) throw new Error(`espias-vela: «${de}» no esta exactamente una vez en lib/sim/vela.js`)
    src = src.replace(de, `export function ${n}(...__a) { __espia(${JSON.stringify(n)}); return __${n}(...__a) }\nfunction __${n}(`)
  }
  src += '\nfunction __espia(n) { const g = globalThis.__espiasVela ??= {}; g[n] = (g[n] ?? 0) + 1 }\n'
  return { ...r, source: src }
}
