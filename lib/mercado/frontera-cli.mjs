// lib/mercado/frontera-cli.mjs — la FRONTERA de los scripts del mercado v1
// (E2R2-04, Astra; CTO 14-oct). Todo el script corre dentro: un error que
// llegue hasta aqui (tambien uno sin capturar o una promesa rechazada) sale como
// mensaje propio o como «clase codigo» (lib/mercado/errores.mjs), nunca con su
// texto ni su pila, y el codigo de salida es 3 (no terminado).
import { texto } from './errores.mjs'

export async function frontera(nombre, f) {
  const sale = e => { console.log(`=== ⚠️ ATENCION: ${nombre}: no terminado (${texto(e)}) (codigo 3) ===`); process.exitCode = 3 }
  process.on('uncaughtException', e => { sale(e); process.exit(3) })
  process.on('unhandledRejection', e => { sale(e); process.exit(3) })
  try { await f() } catch (e) { sale(e) }
}
