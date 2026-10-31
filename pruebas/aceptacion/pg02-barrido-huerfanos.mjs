/**
 * PG02 · EL RECUENTO DE CLUSTERS QUE PARECEN HUERFANOS (orden 1-187 del CTO, que simplifica la 1-185 · 02 tras PSIMM5-02/03 de
 * Astra). Al arrancar la tanda, pruebas/barre-huerfanos.mjs SOLO CUENTA Y LISTA en el log los simpg-* que parecen huerfanos
 * (ruta, pid de «dueno», estado); NO para ni borra nada. Cada proceso para lo suyo al salir (pg-ensayo, arnes de Chrome: pg01).
 * En una raiz PROPIA (/tmp/pg02-*, el barrido solo mira esa con --raiz), clusters reales de PostgreSQL 17:
 *   A · dueño vivo · B · dueño muerto con SIGKILL · C · sin dueño conocido · y un directorio otro-pg (no simpg-*)
 *   Astra PSIMM5-02: un cluster con dueño VIVO arrancado con TZ=UTC y el barrido con TZ=Europe/Madrid
 *   Astra PSIMM5-03: simpg-alias (dueño muerto) cuyo «d» es un ENLACE a un PostgreSQL vivo fuera de la raiz barrida
 * El invariante: despues del barrido, TODOS siguen vivos y con su carpeta; B sale en la lista (ruta, pid, estado); A y el de la
 * zona horaria no; el alias sale como enlace, sin seguirlo. Al terminar, esta prueba para lo suyo (pg_ctl -m fast). Sin red.
 */
import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync, readFileSync, symlinkSync } from 'node:fs'
const { titulo, ver, oraculo, fin, REPO } = await import('../lib.mjs')
const { hayPostgres, BIN } = await import('../pg-ensayo.mjs')
if (!hayPostgres()) { ver('PostgreSQL 17 local: NO hay', false); fin() }
const tx = x => JSON.stringify(x)
const espera = ms => new Promise(r => setTimeout(r, ms))
const vivo = dir => spawnSync(BIN + '/pg_ctl', ['-D', dir + '/d', 'status'], { encoding: 'utf8' }).status === 0
const raiz = mkdtempSync('/tmp/pg02-'), barrida = raiz + '/b', externa = raiz + '/e'
mkdirSync(barrida); mkdirSync(externa)
const hijos = [], dirs = []
async function arranca(modo, raizCluster, env = {}) {
  const h = spawn(process.execPath, ['--import', './pruebas/sin-red.mjs', '--import', './pruebas/registro.mjs', 'pruebas/navegador/huerfanos-hijo.mjs', modo],
    { cwd: REPO, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, SIMPG_RAIZ: raizCluster, ...env } })
  hijos.push(h)
  let salida = '', dir = null
  h.stdout.on('data', d => { salida += d; const m = salida.match(/LISTO DIR (\S+)/); if (m) dir = m[1] })
  h.stderr.on('data', d => { salida += d })
  for (let k = 0; k < 600 && !dir && h.exitCode == null; k++) await espera(100)
  if (dir) dirs.push(dir)
  return { h, dir, salida: salida.slice(-300) }
}
const barre = (env = {}) => { const b = spawnSync(process.execPath, ['pruebas/barre-huerfanos.mjs', '--raiz', barrida], { cwd: REPO, encoding: 'utf8', env: { ...process.env, ...env } }); return { status: b.status, linea: (b.stdout || '') + (b.stderr || '') } }
try {
  const A = await arranca('montaje-vive', barrida), B = await arranca('montaje-vive', barrida), C = await arranca('montaje-sin-dueno', barrida)
  const Z = await arranca('montaje-vive', barrida, { TZ: 'UTC' }), X = await arranca('montaje-vive', externa)
  const todos = { A, B, C, Z, X }
  ver('control: los cinco clusters arrancados, vivos y en su raiz', Object.values(todos).every(x => x.dir && vivo(x.dir)) && [A, B, C, Z].every(x => x.dir.startsWith(barrida + '/simpg-')) && X.dir.startsWith(externa + '/simpg-'),
    tx(Object.fromEntries(Object.entries(todos).map(([k, x]) => [k, { dir: x.dir, vivo: !!x.dir && vivo(x.dir), s: x.dir ? '' : x.salida }]))))
  B.h.kill('SIGKILL')
  await new Promise(r => (B.h.exitCode != null || B.h.signalCode ? r() : B.h.once('exit', r)))
  await espera(300)
  ver('control: B · su dueño murio (SIGKILL) y su PostgreSQL sigue vivo', !!B.dir && vivo(B.dir))
  // otro-pg: no es simpg-*; simpg-alias: dueño muerto y su «d» enlazado al PostgreSQL vivo X (fuera de la raiz barrida)
  const otro = barrida + '/otro-pg'; mkdirSync(otro + '/d', { recursive: true }); writeFileSync(otro + '/dueno', '999999\n')
  const alias = barrida + '/simpg-alias1'; mkdirSync(alias); writeFileSync(alias + '/dueno', '999999\n'); symlinkSync(X.dir + '/d', alias + '/d')
  const pidB = (readFileSync(B.dir + '/dueno', 'utf8').split('\n')[0] || '').trim()
  const b1 = barre({ TZ: 'Europe/Madrid' })
  ver('control: el barrido termina con 0', b1.status === 0, tx(b1))
  const L = b1.linea
  oraculo('PG02', 'el barrido NO para ni borra nada: los cinco PostgreSQL siguen vivos y con su carpeta (tambien B, el que parece huerfano)', Object.values(todos).every(x => vivo(x.dir) && existsSync(x.dir + '/d')) && existsSync(alias) && existsSync(otro + '/dueno'),
    tx(Object.fromEntries(Object.entries(todos).map(([k, x]) => [k, vivo(x.dir)]))))
  oraculo('PG02', 'B sale en la lista de los que parecen huerfanos, con su ruta, el pid de «dueno» y su estado', new RegExp(`parece huerfano: ${B.dir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} · dueno ${pidB} · PostgreSQL en marcha`).test(L), L.slice(-600))
  oraculo('PG02', 'A (dueño vivo) no sale como huerfano', !L.includes(`parece huerfano: ${A.dir}`), '')
  oraculo('PG02', 'PSIMM5-02 (Astra): el de dueño vivo arrancado con TZ=UTC, barrido con TZ=Europe/Madrid, sigue vivo y no sale como huerfano', vivo(Z.dir) && !L.includes(`parece huerfano: ${Z.dir}`), '')
  oraculo('PG02', 'PSIMM5-03 (Astra): el «d» enlazado no se sigue: el PostgreSQL de fuera (X) sigue vivo y el alias sale como enlace, no como huerfano', vivo(X.dir) && new RegExp(`enlace: ${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(L) && !L.includes(`parece huerfano: ${alias}`), L.slice(-600))
  oraculo('PG02', 'el recuento: parecen huerfanos 1 (B), con dueño vivo 2 (A y Z), sin dueño conocido 1 (C), enlaces 1', /parecen huerfanos: 1\b/.test(L) && /con dueño vivo: 2\b/.test(L) && /sin dueño conocido: 1\b/.test(L) && /enlaces: 1\b/.test(L), L.trim().slice(-400))
  const tanda = readFileSync(REPO + 'pruebas/tanda.sh', 'utf8')
  const iB = tanda.indexOf('barre-huerfanos.mjs'), iC = tanda.indexOf('corre arnes')
  oraculo('PG02', 'tanda.sh llama al recuento antes de la primera prueba y lo deja en el log', iB > 0 && iB < iC && /barre-huerfanos\.mjs[^\n]*(LOG|tanda\.log)/.test(tanda.slice(iB - 200, iB + 300)), `en ${iB}, primera prueba en ${iC}`)
  const fuente = readFileSync(REPO + 'pruebas/barre-huerfanos.mjs', 'utf8')
  oraculo('PG02', 'el barrido no contiene ordenes de parar ni de borrar (stop, kill, rm)', !/['"]stop['"]|rmSync|unlinkSync|process\.kill\([^)]*,\s*['"]SIG/.test(fuente), '')
} finally {
  for (const h of hijos) { try { h.kill('SIGTERM') } catch {} }
  await espera(1500)
  for (const d of dirs) if (/\/simpg-[^/]+$/.test(d) && !/pg-ensayo-macro/.test(d) && vivo(d)) { spawnSync(BIN + '/pg_ctl', ['-D', d + '/d', '-m', 'fast', 'stop']); rmSync(d, { recursive: true, force: true }) }
  rmSync(raiz, { recursive: true, force: true })
}
fin()
