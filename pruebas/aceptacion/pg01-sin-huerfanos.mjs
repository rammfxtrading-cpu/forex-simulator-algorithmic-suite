/**
 * PG01 · ORDEN 1-183 (4) del CTO: ningun PostgreSQL de prueba se queda vivo al terminar, tampoco si la prueba falla. Medido en
 * r4: las corridas de Chrome dejaron 7 postmasters (padre 1) y una aceptacion caida (excepcion sin capturar) otro.
 * Cada forma de salir, en un proceso hijo (pruebas/navegador/huerfanos-hijo.mjs) que arranca su PostgreSQL desechable como
 * las pruebas y dice su carpeta; despues, ese PostgreSQL (pg_ctl status, no ps: en el sandbox ps no ve) tiene que estar parado:
 *   M · montajeV1 (aceptaciones con PG) y una excepcion sin capturar
 *   C1 · arnes de Chrome (motorV1Real) y process.exit sin cierra()      C2 · arnes de Chrome y una excepcion sin capturar
 *   C3 · SIGTERM al proceso de la prueba   C4 · SIGINT   C5 · SIGKILL (el hijo del motor se queda solo y tiene que cerrar)
 *   control · cierra() de siempre: 0
 * Si alguno queda, esta prueba lo para (pg_ctl stop -m fast sobre SU carpeta) para no dejar basura. Sin red.
 */
import { spawn, spawnSync } from 'node:child_process'
const { titulo, ver, oraculo, fin, REPO } = await import('../lib.mjs')
const { hayPostgres, BIN } = await import('../pg-ensayo.mjs')
if (!hayPostgres()) { ver('PostgreSQL 17 local: NO hay', false); fin() }
const tx = x => JSON.stringify(x)
const espera = ms => new Promise(r => setTimeout(r, ms))
// ¿esta vivo el PostgreSQL de esa carpeta? pg_ctl status (0: en marcha). No se usa ps: dentro del sandbox de la tanda ps no ve
// los procesos y la prueba aprobaria en vacio (medido: los controles lo cazaron)
const vivo = dir => spawnSync(BIN + '/pg_ctl', ['-D', dir + '/d', 'status'], { encoding: 'utf8' }).status === 0
async function caso(modo, senal = null) {
  const h = spawn(process.execPath, ['--import', './pruebas/sin-red.mjs', '--import', './pruebas/registro.mjs', 'pruebas/navegador/huerfanos-hijo.mjs', modo], { cwd: REPO, stdio: ['ignore', 'pipe', 'pipe'] })
  let salida = '', dir = null
  h.stdout.on('data', d => { salida += d; const m = salida.match(/LISTO DIR (\S+)/); if (m) dir = m[1] })
  h.stderr.on('data', d => { salida += d })
  const fuera = new Promise(r => h.on('exit', (c, s) => r({ c, s })))
  for (let k = 0; k < 600 && !dir && h.exitCode == null; k++) await espera(100)
  const vivoDurante = !!dir && vivo(dir)
  if (senal && dir) h.kill(senal)
  const fin_ = await Promise.race([fuera, espera(30000).then(() => ({ c: 'plazo' }))])
  // lo que tarde un cierre ordenado del hijo del motor (envia, pg_ctl stop): hasta 10 s
  let queda = false
  for (let k = 0; k < 50; k++) { queda = !!dir && vivo(dir); if (!queda) break; await espera(200) }
  if (queda && !/pg-ensayo-macro/.test(dir)) spawnSync(BIN + '/pg_ctl', ['-D', dir + '/d', '-m', 'fast', 'stop'])
  return { listo: !!dir, dir, vivosDurante: vivoDurante ? 1 : 0, fin: fin_, nuevos: queda ? [dir] : [], salida: salida.slice(-300) }
}
titulo('control: cierra() de siempre')
{
  const r = await caso('chrome-cierra')
  ver('control: el hijo arranco su PostgreSQL (se ve durante la prueba)', r.listo && r.vivosDurante >= 1, tx({ listo: r.listo, durante: r.vivosDurante, salida: r.salida }))
  ver('control: con cierra(), ningun postmaster nuevo al terminar', r.nuevos.length === 0, tx(r.nuevos))
}
for (const [id, modo, senal, que] of [['M', 'montaje-lanza', null, 'montajeV1 y una excepcion sin capturar'], ['C1', 'chrome-sale', null, 'arnes de Chrome y process.exit sin cierra()'],
  ['C2', 'chrome-lanza', null, 'arnes de Chrome y una excepcion sin capturar'], ['C3', 'chrome-espera', 'SIGTERM', 'SIGTERM a la prueba'], ['C4', 'chrome-espera', 'SIGINT', 'SIGINT a la prueba'],
  ['C5', 'chrome-espera', 'SIGKILL', 'SIGKILL a la prueba']]) {
  titulo(`${id} · ${que}`)
  const r = await caso(modo, senal)
  ver(`control: ${id} · el PostgreSQL estaba vivo antes de salir`, r.listo && r.vivosDurante >= 1, tx({ listo: r.listo, durante: r.vivosDurante, salida: r.salida }))
  oraculo('PG01', `${id} · ${que}: al terminar, 0 postmasters nuevos`, r.nuevos.length === 0, tx({ nuevos: r.nuevos, fin: r.fin }))
}
fin()
