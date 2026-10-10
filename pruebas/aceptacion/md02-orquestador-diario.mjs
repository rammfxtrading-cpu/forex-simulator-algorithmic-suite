/**
 * MD02 · LA ACTUALIZACION DIARIA: NUEVE PARES, UNO POR PASO
 * (mercado diario, punto 3; CTO 9-oct-2026)
 *
 * scripts/mercado-diario.sh, llamado desde .github/workflows/mercado-diario.yml:
 *   paso PAR    corre scripts/actualizar-diario.js --subir --pares PAR (un par
 *               por paso del workflow), con 2 min de pausa antes si ya corrio
 *               otro par, y le pasa en MERCADO_TOPE_BYTES lo que queda del tope
 *               de la ejecucion (MERCADO_TOPE_BYTES del job menos lo descargado,
 *               leido de la linea «Transferencia» de cada par). Si un par ve un
 *               429 («PROVEEDOR LIMITA (HTTP 429)»), corte total: los pasos
 *               siguientes no piden nada.
 *   reintento   UN reintento final, con su pausa, de los pares que salieron
 *               con 2 (proveedor no disponible: 503, red o plazo) sin 429.
 *   resumen     tabla por par, bytes descargados y el codigo: 429 → 2 (1 si
 *               ademas fallo una publicacion); si no, manda 1, 4, 3, 2.
 *
 * ORACULOS con un node FALSO (un guion de codigo y bytes por par y llamada)
 * y una espera falsa que apunta los segundos: ni proveedor ni Storage.
 */
import { titulo, ver, oraculo, omitido, fin, fuente, REPO } from '../lib.mjs'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
const YAML = createRequire(REPO + 'package.json')('yaml')
const NUEVE = ['EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'AUDUSD', 'USDCAD', 'NZDUSD', 'AUDCAD', 'GBPJPY']
const SCRIPT = REPO + 'scripts/mercado-diario.sh'
const hayScript = fs.existsSync(SCRIPT)

// node falso: lee el guion (lineas «PAR codigo bytes [429]», una por llamada a ese par, en orden)
const NODE_FALSO = `#!/bin/sh
par=""; prev=""
for a in "$@"; do [ "$prev" = "--pares" ] && par="$a"; prev="$a"; done
echo "$* | tope=\${MERCADO_TOPE_BYTES-} | par=$par" >> "$FALSO_DIR/llamadas"
n=$(grep -c "^$par " "$FALSO_DIR/llamadas_$par" 2>/dev/null); n=\${n:-0}
echo "$par x" >> "$FALSO_DIR/llamadas_$par"
linea=$(grep "^$par " "$FALSO_DIR/guion" | sed -n "$((n + 1))p")
[ -z "$linea" ] && linea="$par 0 0"
set -- $linea
echo "  $1... resultado falso"
[ "$3" != "sin" ] && echo "  Transferencia (objetos anuales leidos del bucket): 1 descarga(s), $3 bytes"
[ "$4" = "429" ] && echo "=== PROVEEDOR LIMITA (HTTP 429) — job cortado en $1; no se ha pedido nada mas ==="
exit $2
`
function corre(guion, { tope = '', pasos = NUEVE, reintento = true, pausa = null } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'md02-'))
  fs.writeFileSync(path.join(dir, 'node'), NODE_FALSO, { mode: 0o755 })
  fs.writeFileSync(path.join(dir, 'espera'), `#!/bin/sh\necho "$1" >> "$FALSO_DIR/esperas"\n`, { mode: 0o755 })
  fs.writeFileSync(path.join(dir, 'guion'), guion.join('\n') + '\n')
  const env = { PATH: process.env.PATH, FALSO_DIR: dir, MERCADO_NODE: path.join(dir, 'node'), MERCADO_ESPERA: path.join(dir, 'espera'), MERCADO_ESTADO: path.join(dir, 'estado'), ...(tope !== '' ? { MERCADO_TOPE_BYTES: String(tope) } : {}), ...(pausa != null ? { PAUSA_ENTRE_PARES_S: String(pausa) } : {}) }
  const sal = []
  const sh = args => { const r = spawnSync('sh', [SCRIPT, ...args], { cwd: REPO, env, encoding: 'utf8', timeout: 60000 }); sal.push(r.stdout + r.stderr); return r.status }
  const codigos = pasos.map(p => sh(['paso', p]))
  if (reintento) codigos.push(sh(['reintento']))
  const final = sh(['resumen'])
  const lee = f => { try { return fs.readFileSync(path.join(dir, f), 'utf8').trim().split('\n').filter(Boolean) } catch { return [] } }
  const llamadas = lee('llamadas')
  return { codigos, final, salida: sal.join('\n'), llamadas, pares: llamadas.map(l => l.match(/par=(\w+)/)?.[1]), topes: llamadas.map(l => l.match(/tope=(\S*)/)?.[1]), esperas: lee('esperas') }
}
const ok = p => `${p} 0 0`

titulo('1 · los nueve, en orden, uno por paso, 2 min entre pares')
const a = hayScript ? corre(NUEVE.map(ok)) : null
oraculo('MD02', 'nueve llamadas, una por par y en orden, cada una con --subir --pares PAR', !!a && JSON.stringify(a.pares) === JSON.stringify(NUEVE) && a.llamadas.every(l => /scripts\/actualizar-diario\.js --subir --pares [A-Z]{6} /.test(l)), a ? a.llamadas.join(' / ') : '(sin scripts/mercado-diario.sh)')
oraculo('MD02', 'ocho pausas de 120 s (entre pares, ni antes del primero ni tras el ultimo)', !!a && a.esperas.length === 8 && a.esperas.every(s => s === '120'), a ? a.esperas.join(',') : '')
oraculo('MD02', 'todo bien: cada paso sale con 0 y el resumen tambien, con 0 bytes en total', !!a && a.codigos.every(c => c === 0) && a.final === 0 && /total.*0 bytes/i.test(a.salida), a ? `${a.codigos.join(',')} → ${a.final}` : '')
const pausaConf = hayScript ? corre(NUEVE.slice(0, 3).map(ok), { pasos: NUEVE.slice(0, 3), pausa: 7 }) : null
oraculo('MD02', 'la pausa se configura (PAUSA_ENTRE_PARES_S=7: dos pausas de 7 s)', !!pausaConf && pausaConf.esperas.join(',') === '7,7', pausaConf?.esperas.join(',') ?? '')

titulo('2 · un 429 corta todo')
const b = hayScript ? corre([ok('EURUSD'), ok('GBPUSD'), 'USDJPY 2 0 429', ...NUEVE.slice(3).map(ok)]) : null
oraculo('MD02', '429 en el tercer par: solo tres llamadas; los seis siguientes no piden nada y no hay reintento', !!b && JSON.stringify(b.pares) === JSON.stringify(NUEVE.slice(0, 3)), b?.pares.join(',') ?? '')
oraculo('MD02', 'tras el 429 no se espera mas (2 pausas, las de antes del 2.º y el 3.º)', !!b && b.esperas.length === 2, b?.esperas.join(',') ?? '')
oraculo('MD02', 'el resumen sale con 2, dice el corte por 429 y marca los seis como no empezados', !!b && b.final === 2 && /429/.test(b.salida) && NUEVE.slice(3).every(p => new RegExp(`${p}.*no empezado`, 'i').test(b.salida)), b ? `final ${b.final}` : '')
const b2 = hayScript ? corre([ok('EURUSD'), 'GBPUSD 1 0 429', ...NUEVE.slice(2).map(ok)]) : null
oraculo('MD02', '429 con una publicacion fallida en ese par (salio con 1): el resumen sale con 1', !!b2 && b2.final === 1 && b2.pares.length === 2, b2 ? `final ${b2.final} · ${b2.pares.join(',')}` : '')

titulo('3 · un 503 en un par: siguen los demas y un reintento final')
const c = hayScript ? corre(['EURUSD 0 0', 'GBPUSD 2 0', 'GBPUSD 0 0', ...NUEVE.slice(2).map(ok)]) : null
oraculo('MD02', 'GBPUSD sale con 2 (503): los otros siete se corren igual y GBPUSD se reintenta UNA vez al final', !!c && JSON.stringify(c.pares) === JSON.stringify([...NUEVE, 'GBPUSD']), c?.pares.join(',') ?? '')
oraculo('MD02', 'el reintento tiene su pausa de 120 s (9 pausas en total) y, si sale bien, todo 0', !!c && c.esperas.length === 9 && c.final === 0, c ? `${c.esperas.length} pausas · final ${c.final}` : '')
const c2 = hayScript ? corre(['EURUSD 0 0', 'GBPUSD 2 0', 'GBPUSD 2 0', 'GBPUSD 0 0', ...NUEVE.slice(2).map(ok)]) : null
oraculo('MD02', 'si el reintento vuelve a dar 2: no hay tercer intento y el resumen sale con 2', !!c2 && c2.pares.filter(p => p === 'GBPUSD').length === 2 && c2.final === 2, c2 ? `${c2.pares.filter(p => p === 'GBPUSD').length} llamadas a GBPUSD · final ${c2.final}` : '')
const c3 = hayScript ? corre(['EURUSD 1 0', 'GBPUSD 3 0', 'USDJPY 4 0', ...NUEVE.slice(3).map(ok)]) : null
oraculo('MD02', 'no se reintentan los codigos 1, 3 ni 4; manda 1', !!c3 && c3.pares.length === 9 && c3.final === 1, c3 ? `${c3.pares.length} llamadas · final ${c3.final}` : '')
const c4 = hayScript ? corre(['EURUSD 2 0', 'EURUSD 2 0 429', 'GBPUSD 2 0', ...NUEVE.slice(2).map(ok)]) : null
oraculo('MD02', 'un 429 en el reintento corta los reintentos que quedan (GBPUSD no se reintenta)', !!c4 && JSON.stringify(c4.pares) === JSON.stringify([...NUEVE, 'EURUSD']) && c4.final === 2, c4?.pares.join(',') ?? '')

titulo('4 · tope de descarga de la ejecucion')
const d = hayScript ? corre(['EURUSD 0 60', 'GBPUSD 0 30', 'USDJPY 3 0', ...NUEVE.slice(3).map(ok)], { tope: 100 }) : null
oraculo('MD02', 'cada par recibe lo que queda del tope: 100, 40, 10, 10…', !!d && d.topes.slice(0, 4).join(',') === '100,40,10,10', d?.topes.join(',') ?? '')
oraculo('MD02', 'el resumen dice el total descargado (90 bytes) y el tope', !!d && /total.*90 bytes/i.test(d.salida) && /tope.*100/i.test(d.salida), '')
const d2 = hayScript ? corre(['EURUSD 0 sin', ...NUEVE.slice(1).map(ok)], { tope: 100 }) : null
oraculo('MD02', 'un par que no dice lo que descargo (sin linea de transferencia) agota el tope: los siguientes reciben 0', !!d2 && d2.topes[0] === '100' && d2.topes.slice(1).every(t => t === '0'), d2?.topes.join(',') ?? '')
const d3 = hayScript ? corre(NUEVE.map(ok)) : null
oraculo('MD02', 'sin tope configurado no se pasa ninguno (cadena vacia)', !!d3 && d3.topes.every(t => t === ''), d3?.topes.join(',') ?? '')

titulo('5 · el workflow diario')
// CTO 10-oct: el fichero falta A PROPOSITO en la rama de despliegue (entra en main en el paso 7). Solo entonces
// sus comprobaciones salen omitidas, visibles; si esta y esta mal, son rojas
const ausente = !fs.existsSync(REPO + '.github/workflows/mercado-diario.yml')
const delYml = (id, desc, correcto, cifras) => (ausente ? omitido(id, desc, 'fichero ausente hasta el paso 7 (CTO 10-oct: mercado-diario.yml entra en main en el paso 7 del despliegue)') : oraculo(id, desc, correcto, cifras))
let wf = null, texto = ''
try { texto = fuente('.github/workflows/mercado-diario.yml'); wf = YAML.parse(texto) } catch { wf = null }
const on = wf?.on ?? wf?.[true] ?? {}
const job = Object.values(wf?.jobs ?? {})[0] ?? {}
const pasos = job.steps ?? []
const crons = (on.schedule ?? []).map(s => s.cron)
const horaOk = c => { const [m, h] = String(c).split(/\s+/); return /^\d+$/.test(m) && /^\d+$/.test(h) && Number(h) < 21 }
delYml('MD02', 'un solo horario diario fijo, fuera de 21:00-23:59 UTC', crons.length === 1 && horaOk(crons[0]) && /^\d+ \d+ \* \* \*$/.test(crons[0]), crons.join(' | ') || '(sin schedule)')
delYml('MD02', 'mismo grupo de concurrencia que el manual (actualizar-velas), sin cancelar lo que esta en curso', wf?.concurrency?.group === 'actualizar-velas' && wf.concurrency['cancel-in-progress'] === false, JSON.stringify(wf?.concurrency ?? null))
const pasosPar = pasos.filter(p => /mercado-diario\.sh paso [A-Z]{6}/.test(String(p.run ?? '')))
delYml('MD02', 'un paso por par, los nueve en orden; despues reintento y resumen', JSON.stringify(pasosPar.map(p => String(p.run).match(/paso ([A-Z]{6})/)[1])) === JSON.stringify(NUEVE) && pasos.some(p => /mercado-diario\.sh reintento/.test(String(p.run ?? ''))) && /mercado-diario\.sh resumen/.test(String(pasos[pasos.length - 1]?.run ?? '')), pasosPar.map(p => p.name).join(', '))
delYml('MD02', 'cache de Actions de los ficheros anuales (restaurar antes, guardar despues) y MERCADO_CACHE en esa carpeta', pasos.some(p => /actions\/cache\/restore@/.test(String(p.uses ?? ''))) && pasos.some(p => /actions\/cache\/save@/.test(String(p.uses ?? ''))) && /MERCADO_CACHE/.test(texto), pasos.map(p => p.uses ?? p.name).join(', '))
const tope = pasos.find(p => p.id === 'tope')
// CTO 9-oct: 45 MB por ejecucion por defecto en el propio workflow; la variable del repo solo sobrescribe
delYml('MD02', 'tope por defecto 45 MB (45.000.000 bytes) en el workflow; la variable del repo MERCADO_TOPE_BYTES solo lo sobrescribe', /^\$\{\{\s*vars\.MERCADO_TOPE_BYTES\s*\|\|\s*'45000000'\s*\}\}$/.test(String(job.env?.MERCADO_TOPE_BYTES ?? '')), String(job.env?.MERCADO_TOPE_BYTES ?? '(sin)'))
delYml('MD02', 'un tope no valido no deja correr ningun par: los pasos de par y el reintento dependen del paso que lo comprueba', !!tope && /\^\[0-9\]\+\$/.test(String(tope.run)) && /exit 4/.test(String(tope.run)) && [...pasosPar, pasos.find(p => /reintento/.test(String(p.run ?? '')))].every(p => /steps\.tope\.outcome == 'success'/.test(String(p?.if ?? ''))), pasosPar.map(p => p.if).join(' · '))
oraculo('MD02', 'el workflow manual no cambia: sigue sin horario y con sus dos modos', (() => { try { const m = YAML.parse(fuente('.github/workflows/actualizar-velas.yml')); const o = m.on ?? m[true]; return Object.keys(o).join() === 'workflow_dispatch' && JSON.stringify(o.workflow_dispatch.inputs.modo.options) === '["sonda","recuperar"]' } catch { return false } })(), '')
fin()
