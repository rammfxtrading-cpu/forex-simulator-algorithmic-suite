/**
 * WF01 · EL WORKFLOW DE VELAS, SOLO A MANO: SONDA O RECUPERAR UN PAR
 * (CTO, 7-oct-2026)
 *
 * Desde este equipo el proveedor responde 429 a la primera peticion (sonda
 * educada de las 09:41). Decision del CTO: probar desde GitHub Actions, con
 * otra IP de salida. .github/workflows/actualizar-velas.yml:
 *   · sin disparo programado: solo workflow_dispatch, con dos entradas: modo
 *     (sonda | recuperar) y pares (obligatoria en recuperar, UN solo par);
 *   · grupo de concurrencia sin cancelar lo que esta en curso; timeout;
 *   · sonda: scripts/sonda-proveedor.js con un solo dia (EURUSD 2026-07-20),
 *     sin Storage y SIN la clave de servicio en ese paso;
 *   · recuperar: scripts/actualizar-diario.js --subir --pares <par>, con
 *     MERCADO_GZIP sin definir;
 *   · imprime al final el codigo; ninguna clave ni URL; no llama a
 *     liberar-cerrojo. Secretos: los mismos de siempre, ninguno nuevo.
 *
 * ORACULOS: se lee el YAML (paquete yaml de node_modules) y se EJECUTA con
 * bash el bloque que valida el par (entre «# >>> valida-pares» y «# <<<»).
 */
import { titulo, oraculo, fin, fuente } from '../lib.mjs'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { REPO } from '../lib.mjs'
const YAML = createRequire(REPO + 'package.json')('yaml')

const texto = fuente('.github/workflows/actualizar-velas.yml')
let wf = null
try { wf = YAML.parse(texto) } catch { wf = null }
const on = wf?.on ?? wf?.[true] ?? {}
const job = Object.values(wf?.jobs ?? {})[0] ?? {}
const pasos = job.steps ?? []
const sonda = pasos.find(p => /sonda/.test(String(p.if ?? '')))
const recup = pasos.find(p => /recuperar/.test(String(p.if ?? '')))
const conSecretos = p => /secrets\./.test(JSON.stringify(p.env ?? {})) || /secrets\./.test(String(p.run ?? '')) || /secrets\./.test(JSON.stringify(p.with ?? {}))

titulo('1 · disparo y entradas')
oraculo('WF01', 'sin disparo programado: solo workflow_dispatch', !!wf && Object.keys(on).join() === 'workflow_dispatch' && !/schedule:|cron:/.test(texto), Object.keys(on).join())
const ins = on.workflow_dispatch?.inputs ?? {}
oraculo('WF01', 'entradas: modo (sonda | recuperar) y pares', ins.modo?.type === 'choice' && JSON.stringify(ins.modo?.options) === '["sonda","recuperar"]' && ins.pares?.type === 'string', JSON.stringify(ins))
oraculo('WF01', 'concurrencia sin cancelar lo que esta en curso, y timeout', !!wf?.concurrency?.group && wf.concurrency['cancel-in-progress'] === false && Number(job['timeout-minutes']) > 0, JSON.stringify({ c: wf?.concurrency, t: job['timeout-minutes'] }))

titulo('2 · modo sonda')
// CTO 7-oct: la sonda pide el dia de la entrada «dia» (PAR:AAAA-MM-DD; por defecto, EURUSD de ayer)
oraculo('WF01', 'la sonda pide UN dia, el de la entrada «dia» (por variable), con --cabeceras', !!sonda && ins.dia?.type === 'string' && /inputs\.dia/.test(String(sonda.env?.DIA ?? '')) && /node scripts\/sonda-proveedor\.js --cabeceras "\$DIA"\s*$/m.test(String(sonda.run)) && !/\$\{\{/.test(String(sonda.run)), String(sonda?.run ?? '(sin paso de sonda)'))
const bloqueDia = (String(sonda?.run ?? '').match(/# >>> valida-dia\n([\s\S]*?)# <<< valida-dia/) ?? [])[1] ?? ''
const validaDia = d => spawnSync('bash', ['-c', bloqueDia + '\nprintf "%s" "$DIA"; exit 0'], { env: { PATH: process.env.PATH, DIA: d }, encoding: 'utf8' })
const ayer = new Date(Date.now() - 864e5).toISOString().slice(0, 10)
const casosDia = { '': 0, 'AUDUSD:2026-07-20': 0, 'AUDUSD': 4, 'AUDUSD:2026-07-20..2026-07-21': 4, 'AUDUSD:2026-07-20,EURUSD:2026-07-20': 4, 'audusd:2026-07-20': 4, 'AUDUSD:2026-07-20;rm -rf /': 4, 'AUDUSD:2026-07-20\nEURUSD:2026-07-20': 4 }
const vistosDia = Object.fromEntries(Object.keys(casosDia).map(k => [k, bloqueDia ? validaDia(k).status : null]))
const porDefecto = bloqueDia ? validaDia('').stdout.trim() : ''
oraculo('WF01', 'la validacion del dia (ejecutada con bash): un PAR:AAAA-MM-DD; vacio = EURUSD de ayer; lo demas, 4', !!bloqueDia && Object.entries(casosDia).every(([k, v]) => vistosDia[k] === v) && porDefecto === `EURUSD:${ayer}`, `${JSON.stringify(vistosDia)} · por defecto ${porDefecto}`)
oraculo('WF01', 'en modo sonda ningun paso recibe la clave de servicio (ni el job)', !!sonda && !conSecretos(sonda) && !/secrets\./.test(JSON.stringify(job.env ?? {})) && pasos.filter(conSecretos).every(p => /recuperar/.test(String(p.if ?? ''))), pasos.filter(conSecretos).map(p => p.name).join(', '))

titulo('3 · modo recuperar')
oraculo('WF01', 'recuperar: actualizar-diario --subir --pares con el par de la entrada (por variable, no incrustado)', !!recup && /node scripts\/actualizar-diario\.js --subir --pares "\$PARES"/.test(String(recup.run)) && /inputs\.pares/.test(String(recup.env?.PARES ?? '')) && !/\$\{\{/.test(String(recup.run)), String(recup?.run ?? '(sin paso)'))
oraculo('WF01', 'MERCADO_GZIP sin definir (ni en env del workflow, del job o del paso)', !/MERCADO_GZIP\s*:/.test(texto) && /unset MERCADO_GZIP/.test(String(recup?.run ?? '')), '')
const bloque = (String(recup?.run ?? '').match(/# >>> valida-pares\n([\s\S]*?)# <<< valida-pares/) ?? [])[1] ?? ''
const valida = par => spawnSync('bash', ['-c', bloque + '\nexit 0'], { env: { PATH: process.env.PATH, PARES: par }, encoding: 'utf8' }).status
const casos = { 'AUDUSD': 0, 'AUDUSD,GBPUSD': 4, '': 4, 'audusd': 4, 'AUDUSD; rm -rf /': 4, 'AUDUSD GBPUSD': 4, 'AUDUSD\nGBPUSD': 4 }
const vistos = Object.fromEntries(Object.keys(casos).map(k => [k, bloque ? valida(k) : null]))
oraculo('WF01', 'la validacion (ejecutada con bash) admite UN par y rechaza el resto con 4', !!bloque && Object.entries(casos).every(([k, v]) => vistos[k] === v), JSON.stringify(vistos))

titulo('3b · objetivo (Astra M-03, CTO 7-oct): la lista PAR:FECHA del modo recuperar')
oraculo('WF01', 'entrada «objetivo» (texto) y el paso la pasa por variable a --objetivo, solo si viene', ins.objetivo?.type === 'string' && /inputs\.objetivo/.test(String(recup?.env?.OBJETIVO ?? '')) && /\$\{OBJETIVO:\+--objetivo "\$OBJETIVO"\}/.test(String(recup?.run ?? '')), String(recup?.run ?? ''))
const bloqueObj = (String(recup?.run ?? '').match(/# >>> valida-objetivo\n([\s\S]*?)# <<< valida-objetivo/) ?? [])[1] ?? ''
const validaObj = (par, obj) => spawnSync('bash', ['-c', bloqueObj + '\nexit 0'], { env: { PATH: process.env.PATH, PARES: par, OBJETIVO: obj }, encoding: 'utf8' }).status
const casosObj = { '': 0, 'AUDUSD:2026-07-20': 0, 'AUDUSD:2026-07-20,AUDUSD:2026-09-28': 0, 'GBPUSD:2026-07-20': 4, 'AUDUSD:2026-07-20,GBPUSD:2026-10-02': 4, 'AUDUSD:20260720': 4, 'AUDUSD:2026-07-20;rm -rf /': 4, 'AUDUSD:2026-07-20\nAUDUSD:2026-07-21': 4 }
const vistosObj = Object.fromEntries(Object.keys(casosObj).map(k => [k, bloqueObj ? validaObj('AUDUSD', k) : null]))
oraculo('WF01', 'la validacion del objetivo (ejecutada con bash): vacio o PAR:FECHA del mismo par; lo demas, 4', !!bloqueObj && Object.entries(casosObj).every(([k, v]) => vistosObj[k] === v), JSON.stringify(vistosObj))

titulo('4 · lo que no puede pasar')
oraculo('WF01', 'los dos modos imprimen el codigo de salida al final', /Codigo de salida/.test(String(sonda?.run ?? '')) && /Codigo de salida/.test(String(recup?.run ?? '')))
const secretos = [...new Set((texto.match(/secrets\.([A-Z0-9_]+)/g) || []).map(x => x.slice(8)))].sort()
oraculo('WF01', 'secretos: solo NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY (ninguno nuevo)', JSON.stringify(secretos) === '["NEXT_PUBLIC_SUPABASE_URL","SUPABASE_SERVICE_ROLE_KEY"]', secretos.join(', '))
oraculo('WF01', 'no llama a liberar-cerrojo ni activa el diagnostico de credenciales', !/liberar-cerrojo|DIAG_CREDS/.test(texto))
fin()
