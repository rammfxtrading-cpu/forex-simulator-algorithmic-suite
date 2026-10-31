// EL BARRIDO DE CLUSTERS HUERFANOS (orden 1-185 · 02 del CTO). Lo llama pruebas/tanda.sh al arrancar, antes de la primera prueba,
// y deja su recuento en el log. No es una prueba (la tanda no lo corre como tal).
//   node pruebas/barre-huerfanos.mjs [--raiz <carpeta>]…     (por defecto: el tmp del sistema, /tmp y $TMPDIR)
// Mira SOLO las carpetas simpg-* (las de pruebas/pg-ensayo.mjs) de esas raices, nunca otra cosa (nunca ~/.pg-ensayo-macro). Para
// cada una con su PostgreSQL EN MARCHA (pg_ctl status = 0):
//   · HUERFANO = su fichero «dueno» dice un pid que ya no vive (kill 0 → ESRCH), o que vive pero arranco a otra hora (pid
//     reutilizado; solo si la hora quedo apuntada) → pg_ctl stop -m fast y se borra la carpeta.
//   · con dueño vivo (kill 0 bien o EPERM: en la duda, vivo) → no se toca (p. ej. una tanda de Astra en paralelo).
//   · sin dueño conocido (sin «dueno» legible: clusters de antes de r4c u otros) → no se toca; se cuenta.
// Las paradas (sin PostgreSQL en marcha) no se tocan. Sale con 0 (2 si los argumentos estan mal).
import { readdirSync, readFileSync, lstatSync, rmSync, existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import { BIN, arranqueDe } from './pg-ensayo.mjs'

const a = process.argv.slice(2), raices = []
for (let i = 0; i < a.length; i++) { if (a[i] === '--raiz' && a[i + 1]) raices.push(a[++i]); else { console.error(`barre-huerfanos: argumento no valido: ${a[i]}`); process.exit(2) } }
if (!raices.length) raices.push(os.tmpdir(), '/tmp', ...(process.env.TMPDIR ? [process.env.TMPDIR] : []))
const unicas = [...new Set(raices.map(r => { try { return path.resolve(r) } catch { return r } }))]
const vivoPg = dir => spawnSync(path.join(BIN, 'pg_ctl'), ['-D', path.join(dir, 'd'), 'status'], { encoding: 'utf8' }).status === 0
function dueñoVivo(dir) {
  let t
  try { t = readFileSync(path.join(dir, 'dueno'), 'utf8') } catch { return null }
  const [p, hora = ''] = t.split('\n'), pid = Number(p)
  if (!Number.isSafeInteger(pid) || pid <= 1) return null
  try { process.kill(pid, 0) } catch (e) { if (e.code === 'ESRCH') return false; return true }
  if (hora.trim()) { const ahora = arranqueDe(pid); if (ahora && ahora !== hora.trim()) return false }
  return true
}
const cuenta = { vivos: 0, huerfanos: 0, conDueño: 0, sinDueño: 0 }, parados = []
for (const raiz of unicas) {
  let nombres = []
  try { nombres = readdirSync(raiz) } catch { continue }
  for (const n of nombres) {
    if (!/^simpg-[A-Za-z0-9]+$/.test(n)) continue
    const dir = path.join(raiz, n)
    if (/pg-ensayo-macro/.test(dir)) continue
    try { if (!lstatSync(dir).isDirectory()) continue } catch { continue }
    if (!existsSync(path.join(dir, 'd')) || !vivoPg(dir)) continue
    cuenta.vivos++
    const d = dueñoVivo(dir)
    if (d === null) { cuenta.sinDueño++; continue }
    if (d) { cuenta.conDueño++; continue }
    spawnSync(path.join(BIN, 'pg_ctl'), ['-D', path.join(dir, 'd'), '-m', 'fast', 'stop'], { encoding: 'utf8' })
    if (!vivoPg(dir)) { rmSync(dir, { recursive: true, force: true }); cuenta.huerfanos++; parados.push(dir) }
  }
}
console.log(`barrido simpg-* (${unicas.join(', ')}): vivos: ${cuenta.vivos} · huerfanos parados: ${cuenta.huerfanos} · con dueño vivo: ${cuenta.conDueño} · sin dueño conocido: ${cuenta.sinDueño}${parados.length ? ' · parados: ' + parados.join(', ') : ''}`)
