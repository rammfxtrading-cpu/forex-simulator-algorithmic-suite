// EL HIJO DE pruebas/aceptacion/pg01-sin-huerfanos.mjs (orden 1-183 (4)): arranca un PostgreSQL de prueba como lo hacen las
// pruebas y sale de una manera (1,5 s despues de LISTO, para que quien lo llama lo vea vivo); quien lo llama mira despues si quedo algun postmaster. No es una prueba (no lo corre la tanda).
//   montaje-vive / montaje-sin-dueno   pg02: montajeV1 y espera (dueño vivo; o sin el fichero dueno)
//   montaje-lanza   montajeV1 (las aceptaciones con PG) y una excepcion sin capturar (lib.mjs: process.exit(3), sin finally)
//   chrome-sale     motorV1Real (el arnes de Chrome) y process.exit(1) sin cierra()
//   chrome-lanza    motorV1Real y una excepcion sin capturar
//   chrome-cierra   motorV1Real y cierra() (lo de siempre): el control
//   chrome-espera   motorV1Real y espera: quien lo llama le manda una señal (SIGTERM, SIGINT o SIGKILL)
//   chrome-cierra-hijo-muere   PSIMM4-02 (Astra, propia-cierre-r4b / propia-padre-salida): el hijo del motor suspendido
//                   (SIGSTOP), cierra() pedido, el hijo muerto con SIGKILL antes de cerrar; el padre espera 6 s y sale con 0
const modo = process.argv[2]
await import('../lib.mjs')
// LISTO y la carpeta del PostgreSQL (quien llama mira su estado con pg_ctl status: ps puede no ver procesos en el sandbox)
const listo = dir => console.log(`LISTO DIR ${dir}`)
if (modo === 'montaje-vive' || modo === 'montaje-sin-dueno') {
  // orden 1-185 (02), pg02: un cluster con su dueño vivo (este proceso, que espera) o sin dueño conocido (sin el fichero dueno)
  const { montajeV1 } = await import('../montaje-v1.mjs')
  const { rmSync } = await import('node:fs')
  const m = montajeV1(); m.arranca()
  if (modo === 'montaje-sin-dueno') rmSync(m.pg.dir + '/dueno', { force: true })
  listo(m.pg.dir)
  setInterval(() => {}, 1000)
} else if (modo === 'montaje-lanza') {
  const { montajeV1 } = await import('../montaje-v1.mjs')
  const m = montajeV1(); m.arranca(); listo(m.pg.dir)
  setTimeout(() => { throw new Error('fallo ficticio con el PostgreSQL vivo') }, 1500)
} else {
  const { motorV1Real } = await import('./motor-v1-real.mjs')
  const m = await motorV1Real(); listo(m.dir())
  if (modo === 'chrome-sale') setTimeout(() => process.exit(1), 1500)
  if (modo === 'chrome-lanza') setTimeout(() => { throw new Error('fallo ficticio con el motor vivo') }, 1500)
  if (modo === 'chrome-cierra') setTimeout(() => { m.cierra(); setTimeout(() => process.exit(0), 3000) }, 1500)
  if (modo === 'chrome-espera') setInterval(() => {}, 1000)
  if (modo === 'chrome-cierra-hijo-muere') setTimeout(() => { process.kill(m.pid(), 'SIGSTOP'); m.cierra(); process.kill(m.pid(), 'SIGKILL'); setTimeout(() => process.exit(0), 6000) }, 1500)
}
