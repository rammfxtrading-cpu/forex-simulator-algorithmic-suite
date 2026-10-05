// Fixture de pruebas/scripts-falsos.mjs: termina segun MODO. No es del producto.
const modo = process.env.MODO
console.log('empieza')
if (modo === 'exit') { process.exit(5); console.log('DESPUES DEL EXIT') }
if (modo === 'exit-async') setImmediate(() => { process.exit(4); console.log('DESPUES DEL EXIT') })
if (modo === 'final') { process.exitCode = 1; console.log('Done.') }
if (modo === 'sin-final') console.log('trabajando y no acaba nunca')
