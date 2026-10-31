/**
 * PG02 · ORDEN 1-185 (02) del CTO: al arrancar cualquier tanda, un barrido de los clusters simpg-* HUERFANOS (sin proceso dueño
 * vivo), con recuento en el log. NUNCA toca un cluster cuyo dueño este vivo (p. ej. una tanda de Astra en paralelo), ni uno
 * sin dueño conocido, ni nada fuera de simpg-* (nunca ~/.pg-ensayo-macro).
 * En una raiz PROPIA (/tmp/pg02-*, el barrido solo mira esa con --raiz), tres clusters reales de PostgreSQL 17:
 *   A · dueño vivo (el proceso que lo arranco sigue en marcha)       → intacto        (el control que pide el CTO)
 *   B · dueño muerto con SIGKILL (no pudo pararlo: ningun gancho)     → parado y borrado
 *   C · sin dueño conocido (sin el fichero dueno)                      → intacto
 *   y un directorio que no es simpg-* (otro-*) con un fichero dueno de un pid muerto → intacto
 * Mas: pruebas/tanda.sh llama al barrido ANTES de la primera prueba y deja su recuento en el log.
 * Al terminar, esta prueba para lo que quede de los suyos (pg_ctl stop -m fast sobre SU raiz). Sin red.
 */
import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync, readFileSync } from 'node:fs'
const { titulo, ver, oraculo, fin, REPO } = await import('../lib.mjs')
const { hayPostgres, BIN } = await import('../pg-ensayo.mjs')
if (!hayPostgres()) { ver('PostgreSQL 17 local: NO hay', false); fin() }
const tx = x => JSON.stringify(x)
const espera = ms => new Promise(r => setTimeout(r, ms))
const vivo = dir => spawnSync(BIN + '/pg_ctl', ['-D', dir + '/d', 'status'], { encoding: 'utf8' }).status === 0
const raiz = mkdtempSync('/tmp/pg02-')
const hijos = [], dirs = []
async function arranca(modo) {
  const h = spawn(process.execPath, ['--import', './pruebas/sin-red.mjs', '--import', './pruebas/registro.mjs', 'pruebas/navegador/huerfanos-hijo.mjs', modo],
    { cwd: REPO, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, SIMPG_RAIZ: raiz } })
  hijos.push(h)
  let salida = '', dir = null
  h.stdout.on('data', d => { salida += d; const m = salida.match(/LISTO DIR (\S+)/); if (m) dir = m[1] })
  h.stderr.on('data', d => { salida += d })
  for (let k = 0; k < 600 && !dir && h.exitCode == null; k++) await espera(100)
  if (dir) dirs.push(dir)
  return { h, dir, salida: salida.slice(-300) }
}
try {
  const A = await arranca('montaje-vive'), B = await arranca('montaje-vive'), C = await arranca('montaje-sin-dueno')
  ver('control: los tres clusters arrancados y vivos', [A, B, C].every(x => x.dir && vivo(x.dir)), tx([A, B, C].map(x => ({ dir: x.dir, vivo: x.dir && vivo(x.dir), s: x.dir ? '' : x.salida }))))
  ver('control: los tres en la raiz propia, con nombre simpg-*', [A, B, C].every(x => x.dir?.startsWith(raiz + '/simpg-')), tx([A.dir, B.dir, C.dir]))
  B.h.kill('SIGKILL')
  await new Promise(r => (B.h.exitCode != null || B.h.signalCode ? r() : B.h.once('exit', r)))
  await espera(300)
  ver('control: B · su dueño murio (SIGKILL) y el PostgreSQL sigue vivo (huerfano)', !!B.dir && vivo(B.dir), tx({ dir: B.dir }))
  // un directorio que NO es simpg-* con un «dueno» muerto: el barrido no lo mira
  const otro = raiz + '/otro-pg'; mkdirSync(otro + '/d', { recursive: true }); writeFileSync(otro + '/dueno', '999999\n')
  const barre = spawnSync(process.execPath, ['pruebas/barre-huerfanos.mjs', '--raiz', raiz], { cwd: REPO, encoding: 'utf8' })
  const linea = (barre.stdout || '') + (barre.stderr || '')
  ver('control: el barrido existe y termina con 0', barre.status === 0, tx({ status: barre.status, salida: linea.slice(-400) }))
  oraculo('PG02', 'B · el cluster huerfano (dueño muerto) queda parado y su carpeta borrada', !!B.dir && !vivo(B.dir) && !existsSync(B.dir), tx({ vivo: B.dir && vivo(B.dir), existe: B.dir && existsSync(B.dir) }))
  oraculo('PG02', 'A · el cluster con dueño VIVO sigue vivo e intacto', !!A.dir && vivo(A.dir) && existsSync(A.dir + '/dueno'), tx({ vivo: A.dir && vivo(A.dir) }))
  oraculo('PG02', 'C · el cluster sin dueño conocido sigue vivo (no se toca)', !!C.dir && vivo(C.dir), tx({ vivo: C.dir && vivo(C.dir) }))
  oraculo('PG02', 'el directorio que no es simpg-* sigue ahi', existsSync(otro + '/dueno'), '')
  oraculo('PG02', 'el recuento: 1 huerfano parado, 1 con dueño vivo, 1 sin dueño conocido', /huerfanos parados: 1\b/.test(linea) && /con dueño vivo: 1\b/.test(linea) && /sin dueño conocido: 1\b/.test(linea), linea.trim().slice(-300))
  const tanda = readFileSync(REPO + 'pruebas/tanda.sh', 'utf8')
  const iB = tanda.indexOf('barre-huerfanos.mjs'), iC = tanda.indexOf('corre arnes')
  oraculo('PG02', 'tanda.sh llama al barrido antes de la primera prueba y lo deja en el log', iB > 0 && iB < iC && /barre-huerfanos\.mjs[^\n]*(LOG|tanda\.log)/.test(tanda.slice(iB - 200, iB + 300)), `barrido en ${iB}, primera prueba en ${iC}`)
} finally {
  for (const h of hijos) { try { h.kill('SIGTERM') } catch {} }
  await espera(1500)
  // los suyos (los que dijeron sus hijos), esten donde esten
  for (const d of dirs) if (/\/simpg-[^/]+$/.test(d) && !/pg-ensayo-macro/.test(d) && vivo(d)) { spawnSync(BIN + '/pg_ctl', ['-D', d + '/d', '-m', 'fast', 'stop']); rmSync(d, { recursive: true, force: true }) }
  rmSync(raiz, { recursive: true, force: true })
}
fin()
