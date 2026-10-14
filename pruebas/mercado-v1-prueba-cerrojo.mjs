/**
 * MERCADO V1 · EL CICLO DE PRUEBA DEL CERROJO CONTRA POSTGREST (etapa 2; CTO
 * 14-oct, ronda 5: el primer paso operativo tras mercado-000, antes de publicar
 * nada). Escrita antes que el codigo.
 *
 * lib/mercado/prueba-cerrojo-v1.mjs ordenPruebaCerrojo(args, deps):
 *   · SIMULACRO POR DEFECTO: dice el ciclo y no llama a nada (codigo 1);
 *   · --ejecuta: con la tabla vacia, y con dos UUID de prueba P y Q:
 *       1 adquirir P → ok;  2 adquirir Q → «existe» (23505);
 *       3 SELECT → dueño P;  4 DELETE condicional con Q → 0 filas, y P sigue;
 *       5 DELETE con P → 1 fila;  6 SELECT → no hay cerrojo.  Codigo 0;
 *   · si hay un cerrojo puesto, no prueba ni toca nada (codigo 2);
 *   · si algo no cuadra, PARA en ese paso (codigo 2; si lo ajeno falla, 3), sin
 *     seguir ni «arreglar»: relee UNA vez (medido, no deducido) y dice que
 *     fila queda y, si es de la prueba, como se libera (no la libera);
 *   · con CI o GITHUB_ACTIONS definidos no hace nada;
 *   · el puerto real (cerrojoDe): la secuencia de ordenes a PostgREST;
 *   · el script real, sin red: simulacro, uso y CI (nunca --ejecuta: leeria claves);
 *   · lo ajeno no sale en el log (E2-04).
 * Codigos: 0 ciclo correcto · 1 no ejecutado · 2 no cuadra (PARAR) · 3 error (PARAR) · 4 uso.
 */
import { titulo, ver, oraculo, fin, importa } from './lib.mjs'
import { cerrojoEnMemoria } from './cerrojo-falso.mjs'
const T = await importa('lib/mercado/prueba-cerrojo-v1.mjs')
const CER = 'mercado/v1'
const P = '11111111-2222-4333-8444-555555555555', Q = '66666666-7777-4888-9999-aaaaaaaaaaaa'
const uuids = () => { const l = [P, Q]; return () => l.shift() }
const deps = (cer, o = {}) => ({ cerrojo: () => cer, uuid: uuids(), entorno: {}, ...o })
const FUGA = /FUGA123|supabase\.co|apikey/
const ultima = r => r.lineas.at(-1)
// un puerto que delega en el doble salvo lo que se cambie
const conCambio = (cer, cambio) => ({ adquiere: (...a) => (cambio.adquiere ?? cer.adquiere)(...a), lee: (...a) => (cambio.lee ?? cer.lee)(...a), suelta: (...a) => (cambio.suelta ?? cer.suelta)(...a) })

titulo('1 · simulacro por defecto, uso y CI')
{
  const cer = cerrojoEnMemoria()
  const r = await T.ordenPruebaCerrojo([], deps(cer))
  oraculo('CICLO', 'sin argumentos: SIMULACRO, dice el ciclo y como ejecutarlo; no llama a nada (codigo 1)', r.codigo === 1 && cer.registro.length === 0 && /SIMULACRO/.test(r.lineas[0]) && r.lineas.some(l => /--ejecuta/.test(l)) && r.lineas.some(l => /23505/.test(l)), r.lineas.join(' | '))
  const u = await T.ordenPruebaCerrojo(['--ejecutar'], deps(cer))
  oraculo('CICLO', 'un argumento desconocido: uso (codigo 4) y nada', u.codigo === 4 && cer.registro.length === 0, ultima(u))
  const ci = await T.ordenPruebaCerrojo(['--ejecuta'], deps(cer, { entorno: { GITHUB_ACTIONS: 'true' } }))
  oraculo('CICLO', 'con GITHUB_ACTIONS: no hace nada (codigo 1)', ci.codigo === 1 && cer.registro.length === 0, ultima(ci))
}

titulo('2 · el ciclo, con la semantica de la base')
{
  const cer = cerrojoEnMemoria()
  const r = await T.ordenPruebaCerrojo(['--ejecuta'], deps(cer))
  const pasos = cer.registro.map(x => x.join(' ')).join(' | ')
  oraculo('CICLO', 'tabla vacia: SELECT, adquirir P, adquirir Q (existe), SELECT (P), DELETE con Q (0), SELECT (P), DELETE con P (1), SELECT (nada); codigo 0', r.codigo === 0 && pasos === `lee ${CER} | adquiere ${CER} ${P} mercado-v1-prueba | adquiere ${CER} ${Q} mercado-v1-prueba | lee ${CER} | suelta ${CER} ${Q} | lee ${CER} | suelta ${CER} ${P} | lee ${CER}` && cer.filas.size === 0, `${pasos} · ${ultima(r)}`)
  oraculo('CICLO', 'el informe dice cada paso con lo esperado y lo obtenido, y acaba en «ciclo correcto»', r.lineas.filter(l => /^paso \d: .* → esperado .* · obtenido .* ✓$/.test(l)).length === 6 && /ciclo correcto/.test(ultima(r)), r.lineas.join('\n'))
}

titulo('3 · si algo no cuadra, para en ese paso')
const CASOS = [
  ['ya hay un cerrojo puesto', cer => { cer.pon(CER, { dueno: '0b7c2f4e-1a2b-4c3d-8e9f-a0b1c2d3e4f5', descripcion: 'mercado-v1-publica' }); return cer }, 2, /hay un cerrojo puesto/, ['lee'], '0b7c2f4e-1a2b-4c3d-8e9f-a0b1c2d3e4f5'],
  ['el duplicado entra (sin clave unica)', cer => conCambio(cer, { adquiere: async (r, d) => (d === Q ? (cer.registro.push(['adquiere', r, d]), 'ok') : cer.adquiere(r, d, 'mercado-v1-prueba')) }), 2, /paso 2: .*obtenido ok ✗/, ['lee', 'adquiere', 'adquiere', 'lee'], P],
  ['el SELECT no ve a P', cer => conCambio(cer, { lee: async () => (cer.registro.push(['lee']), cer.filas.size ? { dueno: Q, descripcion: 'mercado-v1-prueba', desde: '2026-10-14T10:00:00.000Z' } : null) }), 2, /paso 3: .* ✗/, ['lee', 'adquiere', 'adquiere', 'lee', 'lee'], Q],
  ['el DELETE con otro UUID borra (sin la condicion del dueño)', cer => conCambio(cer, { suelta: async (r, d) => { cer.registro.push(['suelta', r, d]); const n = cer.filas.size; cer.filas.clear(); return n } }), 2, /paso 4: .*obtenido 1 ✗/, ['lee', 'adquiere', 'adquiere', 'lee', 'suelta', 'lee'], null],
  ['el DELETE con el propio no borra', cer => conCambio(cer, { suelta: async (r, d) => (cer.registro.push(['suelta', r, d]), 0) }), 2, /paso 5: .*obtenido 0 ✗/, ['lee', 'adquiere', 'adquiere', 'lee', 'suelta', 'lee', 'suelta', 'lee'], P],
]
for (const [que, monta, codigo, dice, ops, queda] of CASOS) {
  const cer = cerrojoEnMemoria()
  const puerto = monta(cer)
  const r = await T.ordenPruebaCerrojo(['--ejecuta'], deps(puerto))
  const hechas = cer.registro.map(x => x[0])
  oraculo('CICLO', `${que}: para (codigo ${codigo}), lo dice y no da ni un paso mas`, r.codigo === codigo && r.lineas.some(l => dice.test(l)) && JSON.stringify(hechas) === JSON.stringify(ops) && /PARAR/.test(ultima(r)), `${hechas.join(',')} · ${r.lineas.join(' | ')}`)
  oraculo('CICLO', `${que}: dice que fila queda${queda ? ' y como se libera (sin hacerlo)' : ''}`, queda ? r.lineas.some(l => l.includes(queda) && /queda/.test(l)) && (![P, Q].includes(queda) || r.lineas.some(l => l.includes(`--confirmo ${queda}`))) && ([P, Q].includes(queda) || r.lineas.some(l => /no es de esta prueba: no se toca/.test(l))) : r.lineas.some(l => /no queda ningun cerrojo/.test(l)), r.lineas.join(' | '))
}
{
  const cer = cerrojoEnMemoria({ fallos: { adquiere: (r, d) => (d === Q ? Object.assign(new Error('permission denied https://x.supabase.co/?apikey=FUGA123'), { code: '42501' }) : undefined) } })
  const r = await T.ordenPruebaCerrojo(['--ejecuta'], deps(cer))
  oraculo('CICLO', 'un error ajeno en el duplicado (no 23505): para con codigo 3, saneado, y dice que queda el cerrojo de P', r.codigo === 3 && /PARAR/.test(ultima(r)) && !r.lineas.some(l => FUGA.test(l)) && r.lineas.some(l => l.includes(P) && /queda/.test(l)), r.lineas.join(' | '))
}
{
  const cer = cerrojoEnMemoria({ fallos: { adquiere: () => 'perdida' } })
  const r = await T.ordenPruebaCerrojo(['--ejecuta'], deps(cer))
  oraculo('CICLO', 'la respuesta del primer INSERT se pierde (la fila entra): codigo 3, y relee para decir que queda el cerrojo de P', r.codigo === 3 && r.lineas.some(l => l.includes(P) && /queda/.test(l)) && cer.filas.get(CER)?.dueno === P, r.lineas.join(' | '))
}

titulo('4 · el puerto real (cerrojoDe): lo que pide a PostgREST, en orden')
{
  const { cerrojoDe } = await import('../scripts/mercado-v1-dependencias.mjs')
  const llamadas = [], filas = new Map()
  // un PostgREST minimo con la semantica de la tabla: el 23505, el maybeSingle y el DELETE ... RETURNING
  const responde = c => {
    const op = c.pasos[0][0], eq = Object.fromEntries(c.pasos.filter(p => p[0] === 'eq').map(p => [p[1], p[2]]))
    if (op === 'insert') { const f = c.pasos[0][1]; if (filas.has(f.recurso)) return { data: null, error: { code: '23505', message: 'duplicate key' } }; filas.set(f.recurso, { ...f, desde: '2026-10-14T10:00:00.123456+00:00' }); return { data: null, error: null } }
    if (op === 'select') { const f = filas.get(eq.recurso); return { data: f ? { dueno: f.dueno, desde: f.desde, descripcion: f.descripcion } : null, error: null } }
    if (op === 'delete') { const f = filas.get(eq.recurso); if (f && f.dueno === eq.dueno) { filas.delete(eq.recurso); return { data: [{ dueno: f.dueno }], error: null } } return { data: [], error: null } }
  }
  const cliente = () => ({ from(tabla) {
    const c = { tabla, pasos: [] }
    const q = new Proxy({}, { get: (_, k) => (k === 'then' ? (res, rej) => Promise.resolve(responde(c)).then(res, rej) : (...a) => { c.pasos.push([k, ...a]); return q }) })
    llamadas.push(c); return q
  } })
  const r = await T.ordenPruebaCerrojo(['--ejecuta'], deps(cerrojoDe(cliente)))
  const vistas = llamadas.map(c => c.pasos.map(p => p[0] === 'eq' ? `eq ${p[1]}=${p[2]}` : p[0]).join(' '))
  ver('control: todas a mercado_cerrojo', llamadas.every(c => c.tabla === 'mercado_cerrojo'))
  oraculo('CICLO', 'con el puerto real: SELECT, INSERT, INSERT (23505), SELECT, DELETE con Q (0), SELECT, DELETE con P (1), SELECT; codigo 0', r.codigo === 0 && JSON.stringify(vistas) === JSON.stringify([
    `select eq recurso=${CER} maybeSingle`, 'insert', 'insert', `select eq recurso=${CER} maybeSingle`,
    `delete eq recurso=${CER} eq dueno=${Q} select`, `select eq recurso=${CER} maybeSingle`, `delete eq recurso=${CER} eq dueno=${P} select`, `select eq recurso=${CER} maybeSingle`,
  ]) && filas.size === 0, `${vistas.join(' | ')} · ${ultima(r)}`)
}

titulo('5 · el script real, sin red (humo): simulacro, uso y CI; nunca --ejecuta aqui (leeria claves)')
{
  const { spawnSync } = await import('child_process')
  const nodo = (args, env = {}) => spawnSync(process.execPath, ['--import', './pruebas/sin-red.mjs', 'scripts/mercado-v1-prueba-cerrojo.mjs', ...args], { encoding: 'utf8', env: { PATH: process.env.PATH, HOME: process.env.HOME, TZ: 'Europe/Madrid', ...env } })
  const s0 = nodo([])
  oraculo('CICLO', 'el script sin argumentos: SIMULACRO, codigo 1, sin construir el cliente', s0.status === 1 && /SIMULACRO/.test(s0.stdout) && !/Fatal|faltan|claves/.test(s0.stdout + s0.stderr), s0.stdout + s0.stderr)
  const s4 = nodo(['--ejecuta', 'ya'])
  oraculo('CICLO', 'el script con argumentos de mas: uso, codigo 4', s4.status === 4, s4.stdout + s4.stderr)
  const sc = nodo(['--ejecuta'], { CI: '1' })
  oraculo('CICLO', 'el script con CI y --ejecuta: codigo 1, no hace nada', sc.status === 1 && /automatizad/.test(sc.stdout), sc.stdout + sc.stderr)
}
fin()
