// EL RECUENTO DE CLUSTERS QUE PARECEN HUERFANOS (orden 1-187 del CTO, que simplifica la 1-185 · 02 tras PSIMM5-02/03 de Astra).
// Lo llama pruebas/tanda.sh al arrancar, antes de la primera prueba, y su salida queda en el log. NO PARA NI BORRA NADA: solo
// cuenta y lista. Parar lo suyo es cosa de cada proceso al salir (pruebas/pg-ensayo.mjs; navegador/motor-v1-real.mjs).
//   node pruebas/barre-huerfanos.mjs [--raiz <carpeta>]…     (por defecto: el tmp del sistema, /tmp y $TMPDIR)
// Mira solo las entradas simpg-<alfanumerico> de esas raices (nunca otra cosa; nunca ~/.pg-ensayo-macro), sin seguir enlaces:
//   · la carpeta o su «d» es un enlace → «enlace: <ruta>» (no se mira lo que hay detras)
//   · su PostgreSQL en marcha (pg_ctl status = 0) y el pid de su «dueno» ya no existe (kill 0 → ESRCH) → «parece huerfano»
//     (ruta · pid de dueno · estado); con dueño vivo (kill 0 bien o EPERM) se cuenta; sin «dueno» legible, «sin dueño conocido»
//   · sin PostgreSQL en marcha: se cuenta como parado
// Sale con 0 (2 si los argumentos estan mal).
import { readdirSync, readFileSync, lstatSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import { BIN } from './pg-ensayo.mjs'

const a = process.argv.slice(2), raices = []
for (let i = 0; i < a.length; i++) { if (a[i] === '--raiz' && a[i + 1]) raices.push(a[++i]); else { console.error(`barre-huerfanos: argumento no valido: ${a[i]}`); process.exit(2) } }
if (!raices.length) raices.push(os.tmpdir(), '/tmp', ...(process.env.TMPDIR ? [process.env.TMPDIR] : []))
const unicas = [...new Set(raices.map(r => path.resolve(r)))]
const enMarcha = dir => spawnSync(path.join(BIN, 'pg_ctl'), ['-D', path.join(dir, 'd'), 'status'], { encoding: 'utf8' }).status === 0
const esEnlace = p => { try { return lstatSync(p).isSymbolicLink() } catch { return false } }
const esCarpeta = p => { try { const s = lstatSync(p); return s.isDirectory() && !s.isSymbolicLink() } catch { return false } }
function dueño(dir) {
  if (esEnlace(path.join(dir, 'dueno'))) return { pid: null, vivo: null }
  let t
  try { t = readFileSync(path.join(dir, 'dueno'), 'utf8') } catch { return { pid: null, vivo: null } }
  const pid = Number(t.split('\n')[0])
  if (!Number.isSafeInteger(pid) || pid <= 1) return { pid: null, vivo: null }
  try { process.kill(pid, 0); return { pid, vivo: true } } catch (e) { return { pid, vivo: e.code !== 'ESRCH' } }
}
const c = { parecenHuerfanos: 0, conDueñoVivo: 0, sinDueño: 0, parados: 0, enlaces: 0 }, lineas = []
for (const raiz of unicas) {
  let nombres = []
  try { nombres = readdirSync(raiz) } catch { continue }
  for (const n of nombres.sort()) {
    if (!/^simpg-[A-Za-z0-9]+$/.test(n)) continue
    const dir = path.join(raiz, n)
    if (/pg-ensayo-macro/.test(dir)) continue
    if (esEnlace(dir) || esEnlace(path.join(dir, 'd'))) { c.enlaces++; lineas.push(`  enlace: ${dir} (no se sigue)`); continue }
    if (!esCarpeta(dir) || !esCarpeta(path.join(dir, 'd'))) continue
    if (!enMarcha(dir)) { c.parados++; continue }
    const d = dueño(dir)
    if (d.pid == null) { c.sinDueño++; continue }
    if (d.vivo) { c.conDueñoVivo++; continue }
    c.parecenHuerfanos++
    lineas.push(`  parece huerfano: ${dir} · dueno ${d.pid} · PostgreSQL en marcha (dueño no existe)`)
  }
}
console.log(`recuento simpg-* (${unicas.join(', ')}): parecen huerfanos: ${c.parecenHuerfanos} · con dueño vivo: ${c.conDueñoVivo} · sin dueño conocido: ${c.sinDueño} · parados: ${c.parados} · enlaces: ${c.enlaces} (no se para ni se borra nada)`)
for (const l of lineas) console.log(l)
