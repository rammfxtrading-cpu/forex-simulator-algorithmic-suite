// EL HIJO DE pruebas/aceptacion/pg01-sin-huerfanos.mjs (orden 1-183 (4)): arranca un PostgreSQL de prueba como lo hacen las
// pruebas y sale de una manera; quien lo llama mira despues si quedo algun postmaster. No es una prueba (no lo corre la tanda).
//   montaje-lanza   montajeV1 (las aceptaciones con PG) y una excepcion sin capturar (lib.mjs: process.exit(3), sin finally)
//   chrome-sale     motorV1Real (el arnes de Chrome) y process.exit(1) sin cierra()
//   chrome-lanza    motorV1Real y una excepcion sin capturar
//   chrome-cierra   motorV1Real y cierra() (lo de siempre): el control
//   chrome-espera   motorV1Real y espera: quien lo llama le manda una señal (SIGTERM, SIGINT o SIGKILL)
const modo = process.argv[2]
await import('../lib.mjs')
const listo = () => console.log('LISTO')
if (modo === 'montaje-lanza') {
  const { montajeV1 } = await import('../montaje-v1.mjs')
  const m = montajeV1(); m.arranca(); listo()
  setTimeout(() => { throw new Error('fallo ficticio con el PostgreSQL vivo') }, 50)
} else {
  const { motorV1Real } = await import('./motor-v1-real.mjs')
  const m = await motorV1Real(); listo()
  if (modo === 'chrome-sale') setTimeout(() => process.exit(1), 50)
  if (modo === 'chrome-lanza') setTimeout(() => { throw new Error('fallo ficticio con el motor vivo') }, 50)
  if (modo === 'chrome-cierra') setTimeout(() => { m.cierra(); setTimeout(() => process.exit(0), 3000) }, 1500)
  if (modo === 'chrome-espera') setInterval(() => {}, 1000)
}
