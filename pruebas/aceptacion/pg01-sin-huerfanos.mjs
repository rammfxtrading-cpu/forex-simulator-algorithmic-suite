/**
 * PG01 · ORDEN 1-183 (4) del CTO: ningun PostgreSQL de prueba se queda vivo al terminar, tampoco si la prueba falla. Medido en
 * r4: las corridas de Chrome dejaron 7 postmasters (padre 1) y una aceptacion caida (excepcion sin capturar) otro.
 * Cada forma de salir, en un proceso hijo (pruebas/navegador/huerfanos-hijo.mjs) que arranca su PostgreSQL desechable como
 * las pruebas; despues, los postmasters nuevos (los de antes, de quien sea, no se tocan ni se cuentan) tienen que ser 0:
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
// los postmasters de prueba: «postgres -D <dir>» con <dir> en una carpeta temporal simpg-* (nunca ~/.pg-ensayo-macro)
const postmasters = () => (spawnSync('ps', ['-axo', 'pid=,command='], { encoding: 'utf8' }).stdout || '').split('\n')
  .map(l => l.trim().match(/^(\d+)\s+\S*postgres -D (\S*simpg-[^/\s]+\/d)\b/)).filter(Boolean).map(m => ({ pid: Number(m[1]), dir: m[2] }))
async function caso(modo, senal = null) {
  const antes = new Set(postmasters().map(p => p.pid))
  const h = spawn(process.execPath, ['--import', './pruebas/sin-red.mjs', '--import', './pruebas/registro.mjs', 'pruebas/navegador/huerfanos-hijo.mjs', modo], { cwd: REPO, stdio: ['ignore', 'pipe', 'pipe'] })
  let salida = '', listo = false
  h.stdout.on('data', d => { salida += d; if (/LISTO/.test(salida)) listo = true })
  h.stderr.on('data', d => { salida += d })
  const fuera = new Promise(r => h.on('exit', (c, s) => r({ c, s })))
  for (let k = 0; k < 600 && !listo && h.exitCode == null; k++) await espera(100)
  const vivosDurante = postmasters().filter(p => !antes.has(p.pid)).length
  if (senal && listo) h.kill(senal)
  const fin_ = await Promise.race([fuera, espera(30000).then(() => ({ c: 'plazo' }))])
  // lo que tarde un cierre ordenado del hijo del motor (envia, pg_ctl stop): hasta 10 s
  let nuevos = []
  for (let k = 0; k < 50; k++) { nuevos = postmasters().filter(p => !antes.has(p.pid)); if (!nuevos.length) break; await espera(200) }
  for (const p of nuevos) if (!/pg-ensayo-macro/.test(p.dir)) spawnSync(BIN + '/pg_ctl', ['-D', p.dir, '-m', 'fast', 'stop'])
  return { listo, vivosDurante, fin: fin_, nuevos: nuevos.map(p => p.dir), salida: salida.slice(-300) }
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
