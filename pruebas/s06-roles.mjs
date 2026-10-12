/**
 * S06 · ROLES, EJECUTOR Y CATALOGO ANTES DE APLICAR sim-003, ENSAYADA ANTES DE PEDIRLA
 *
 * sql/consultas/s06-roles-y-ejecutor.sql se le pide a Ramon antes de aplicar
 * sim-003 (Astra sim-003 ronda 2, 12-oct: «Lista exacta antes de aplicar»).
 * Sobre el montaje LITERAL de s04 (estado-s04.mjs PRODUCCION + sql/sim-002):
 *   1 corre entera en BEGIN READ ONLY, acaba en FIN, y el texto no tiene
 *     ninguna orden de escritura
 *   2 trae cada seccion pedida, con lo que el montaje tiene (version,
 *     ejecutor, roles, esquemas, auth.uid, FK, default ACL)
 *   3 su inventario es EXACTAMENTE el de la guarda de sql/sim-003 (se leen
 *     los arrays del fichero: si uno cambia y el otro no, rojo)
 *   4 base limpia: todo LIBRE y 0 huerfanos
 *   5 control positivo (otra base): un huerfano, un nombre ocupado y una
 *     membresia authenticated → service_role plantados: salen 1, OCUPADO y la
 *     membresia; y ningun dato de alumno en la salida (centinelas)
 *   6 control: con sim-003 aplicado, todo el inventario sale OCUPADO (salvo
 *     los tipos con nombre de funcion, que una funcion no crea)
 *   7 control: un ejecutor al que la RLS le filtra filas lo dice (el numero
 *     de huerfanos no vale)
 * ⚠️ El montaje no es la base viva: lo que s04 no leyo (roles, default ACL,
 *    auth.uid) es lo que esta consulta va a traer. No prueba el editor.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { titulo, ver, fin, REPO } from './lib.mjs'
import { BIN, hayPostgres, cluster } from './pg-ensayo.mjs'
import { PRODUCCION } from './estado-s04.mjs'
if (!hayPostgres()) { ver(`PostgreSQL 17 en ${BIN}: NO hay, la prueba no se ha ejecutado`, false); fin() }
const lee = p => readFileSync(path.join(REPO, p), 'utf8')
const consulta = lee('sql/consultas/s06-roles-y-ejecutor.sql')
const sim003 = lee('sql/sim-003-persistencia-aditiva.sql')

// CSV con comillas y saltos de linea dentro del campo → [[campos]]
function csv(texto) {
  const filas = []
  let fila = [], campo = '', dentro = false
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i]
    if (dentro) {
      if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++ }
      else if (c === '"') dentro = false
      else campo += c
    } else if (c === '"') dentro = true
    else if (c === ',') { fila.push(campo); campo = '' }
    else if (c === '\n') { fila.push(campo); filas.push(fila); fila = []; campo = '' }
    else campo += c
  }
  if (campo || fila.length) { fila.push(campo); filas.push(fila) }
  return filas
}
const q = consulta.replace(/--.*$/mg, '').trim().replace(/;\s*$/, '')
const pg = cluster()
// corre s06 en READ ONLY (con un SET LOCAL ROLE opcional) → { ok, err, filas: [[seccion, objeto, detalle]] }
const s06 = (db, rol) => {
  const r = pg.psql(`begin read only;\n${rol ? `set local role ${rol};\n` : ''}copy (${q}) to stdout with (format csv, header);\ncommit;`, db)
  return { ...r, filas: r.ok ? csv(r.out + '\n').slice(1).filter(f => f.length === 3) : [] }
}
const de = (filas, s) => filas.filter(f => f[0] === s)
const una = (filas, s, o) => filas.find(f => f[0] === s && f[1] === o)?.[2] ?? ''
const inventario = filas => Object.fromEntries(de(filas, 'inventario').filter(f => f[1] !== '~ total').map(f => [f[1], f[2]]))
const corto = s => s.length > 300 ? s.slice(0, 300) + '…' : s

try {
  pg.arranca()
  titulo('1 · montaje literal y solo lectura')
  for (const db of ['p', 'q', 'a']) {
    pg.psql(`create database ${db}`, 'postgres')
    const m = pg.psql(PRODUCCION, db), m2 = pg.psql(lee('sql/sim-002-lectura-estable.sql'), db)
    ver(`base ${db}: PRODUCCION + sql/sim-002`, m.ok && m2.ok, (m.err + m2.err).split('\n')[0])
  }
  // sim-003 en la base a ANTES de plantar nada: los roles son del cluster, y la
  // membresia plantada en 5 la ve tambien la guarda de sim-003 (y aborta)
  const ap = pg.psql(sim003, 'a')
  ver('sql/sim-003 se aplica en la base a (para el control 6)', ap.ok, ap.err.split('\n')[0])
  const r = s06('p')
  ver('corre entera dentro de BEGIN READ ONLY', r.ok, r.err.split('\n')[0])
  const F = r.filas
  ver('acaba en FIN | s06 | consulta, y todas las filas tienen 3 campos', F.at(-1)?.join('|') === 'FIN|s06|consulta' && csv(r.out + '\n').slice(1).every(f => f.length === 3), F.length)
  const control = pg.psql(`begin read only;\ncreate table public.escritura_de_control (i integer);\ncommit;`, 'p')
  ver('control: en esa transaccion una escritura SI falla', !control.ok && /read-only transaction/.test(control.err), control.err.split('\n')[0])
  ver('el texto de la consulta no contiene ninguna orden de escritura', !/\b(insert|update|delete|drop|alter|create|grant|revoke|truncate|copy|set|do|call|perform)\b/i.test(consulta.replace(/--.*$/mg, '').replace(/'[^']*'/g, "''")))

  titulo('2 · cada seccion pedida, con lo que tiene el montaje')
  const verdad = c => pg.psql(`select ${c}`, 'p').out.trim()
  ver('version: version() y server_version_num del servidor', una(F, 'version', 'version()') === verdad('version()') && una(F, 'version', 'server_version_num') === verdad(`current_setting('server_version_num')`), una(F, 'version', 'version()'))
  ver('ejecutor: current_user y session_user (aqui postgres)', una(F, 'ejecutor', 'current_user') === 'postgres' && una(F, 'ejecutor', 'session_user') === 'postgres')
  ver('rol: anon, authenticated, service_role, postgres; el ejecutor no se repite', de(F, 'rol').map(f => f[1]).join(',') === 'anon,authenticated,postgres,service_role', de(F, 'rol').map(f => f[1]).join(','))
  ver('rol: atributos (service_role bypassrls; anon no; postgres superuser en el montaje)', /^superuser=false · bypassrls=true · inherit=true · createrole=false/.test(una(F, 'rol', 'service_role'))
    && /^superuser=false · bypassrls=false/.test(una(F, 'rol', 'anon')) && /^superuser=true/.test(una(F, 'rol', 'postgres')), de(F, 'rol').map(f => f[2]).join(' / '))
  ver('miembro / puede_ser: en el montaje no hay membresias entre ellos (postgres, superusuario, puede ser todos)', de(F, 'miembro').length === 0
    && de(F, 'puede_ser').map(f => f[1]).join(',') === 'postgres → anon,postgres → authenticated,postgres → service_role', de(F, 'puede_ser').map(f => f[1]).join(','))
  const nAcl = verdad(`count(*) from pg_default_acl where defaclrole = 'postgres'::regrole and (defaclnamespace = 0 or defaclnamespace = 'public'::regnamespace)`)
  ver(`default_acl: las ${nAcl} entradas de postgres (global y public), con su ACL`, de(F, 'default_acl').length === Number(nAcl) && Number(nAcl) > 0 && de(F, 'default_acl').every(f => /^\{.*\}$/.test(f[2])), de(F, 'default_acl').map(f => f[1] + ' ' + f[2]).join(' / '))
  ver('esquema: 9 filas (3 esquemas × 3 roles); anon con USAGE en public y sin CREATE', de(F, 'esquema').length === 9 && una(F, 'esquema', 'public · anon') === 'usage=true · create=false', de(F, 'esquema').map(f => f[1] + ' ' + f[2]).join(' / '))
  ver('auth.uid: la definicion entera, con dueño y ACL', /CREATE OR REPLACE FUNCTION auth\.uid\(\)/.test(una(F, 'auth.uid', 'auth.uid()')) && /request\.jwt\.claim\.sub/.test(una(F, 'auth.uid', 'auth.uid()')) && /dueño=postgres/.test(una(F, 'auth.uid', 'auth.uid()')), corto(una(F, 'auth.uid', 'auth.uid()')))
  ver('fk: profiles → auth.users CASCADE y la de fases SET NULL, validadas', /REFERENCES auth\.users\(id\) ON DELETE CASCADE · validada=true/.test(una(F, 'fk', 'profiles.profiles_id_fkey'))
    && /REFERENCES (public\.)?sim_sessions\(id\) ON DELETE SET NULL · validada=true/.test(una(F, 'fk', 'sim_sessions.sim_sessions_challenge_parent_id_fkey')), una(F, 'fk', 'sim_sessions.sim_sessions_challenge_parent_id_fkey'))
  const nFk = verdad(`count(*) from pg_constraint where contype = 'f' and (conrelid in ('public.sim_sessions'::regclass, 'public.profiles'::regclass) or confrelid in ('public.sim_sessions'::regclass, 'public.profiles'::regclass))`)
  ver(`fk: las ${nFk} que salen de sim_sessions/profiles o llegan a ellas (las 15 entrantes incluidas)`, de(F, 'fk').length === Number(nFk) && Number(nFk) >= 20, de(F, 'fk').length)

  titulo('3 · el inventario es el de la guarda de sim-003')
  const arr = nombre => { const m = sim003.match(new RegExp(`${nombre}\\s+text\\[\\] := ARRAY\\[([^\\]]*)\\]`)); return m ? [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]) : null }
  const g = { tablas: arr('v_tablas'), funciones: arr('v_funciones'), relaciones: arr('v_relaciones'), restr: arr('v_restr'), ses: arr('v_col_ses'), tra: arr('v_col_tra') }
  ver('los 6 arrays se leen del SQL', Object.values(g).every(a => a?.length > 0), Object.entries(g).map(([k, a]) => `${k}=${a?.length}`).join(' '))
  const esperado = [...g.relaciones.map(x => 'relacion · ' + x), ...g.funciones.map(x => 'funcion · ' + x), ...[...g.tablas, ...g.funciones].map(x => 'tipo · ' + x),
    ...g.restr.map(x => 'restriccion · ' + x), ...g.ses.map(x => 'columna · sim_sessions.' + x), ...g.tra.map(x => 'columna · sim_trades.' + x)].sort()
  const I = inventario(F), tiene = Object.keys(I).sort()
  ver(`s06 pregunta por los mismos ${esperado.length} nombres que la guarda, ni uno mas ni uno menos`, JSON.stringify(tiene) === JSON.stringify(esperado),
    `faltan: ${esperado.filter(x => !tiene.includes(x)).join(', ') || '-'} · sobran: ${tiene.filter(x => !esperado.includes(x)).join(', ') || '-'}`)

  titulo('4 · base limpia')
  ver('todo el inventario LIBRE', Object.values(I).every(v => v === 'LIBRE'), Object.entries(I).filter(([, v]) => v !== 'LIBRE').join(' / '))
  ver('total: «N nombres · 0 ocupados»', una(F, 'inventario', '~ total') === `${esperado.length} nombres · 0 ocupados`, una(F, 'inventario', '~ total'))
  ver('huerfanos: 0, y el ejecutor ve todas las filas', una(F, 'huerfanos', 'sesiones_sin_perfil') === '0 · el ejecutor ve todas las filas: sim_sessions=si · profiles=si', una(F, 'huerfanos', 'sesiones_sin_perfil'))

  titulo('5 · control positivo: huerfano, nombre ocupado y membresia plantados (base q)')
  const u = '00000000-0000-0000-0000-0000000000c1', h = '00000000-0000-0000-0000-0000000000c2'
  const pl = pg.psql(`insert into auth.users (id) values ('${u}'), ('${h}');
    insert into public.profiles (id, email) values ('${u}', 'centinela-correo@ejemplo.test');
    insert into public.sim_sessions (user_id, name, pair, timeframe, date_from, date_to) values
      ('${u}', 'CENTINELA-PRIVADO', 'EURUSD', 'H1', '2026-01-01', '2026-02-01'), ('${h}', 'CENTINELA-HUERFANA', 'EURUSD', 'H1', '2026-01-01', '2026-02-01');
    create function public.sim_error(integer) returns integer language sql as $$ select 1 $$;
    grant service_role to authenticated;`, 'q')
  ver('plantados: una sesion con perfil, una sin perfil, public.sim_error(integer) y authenticated → service_role', pl.ok, pl.err.split('\n')[0])
  const rq = s06('q'), Q = rq.filas
  ver('corre en READ ONLY', rq.ok, rq.err.split('\n')[0])
  ver('huerfanos: exactamente 1', una(Q, 'huerfanos', 'sesiones_sin_perfil').startsWith('1 · '), una(Q, 'huerfanos', 'sesiones_sin_perfil'))
  const IQ = inventario(Q)
  ver('el nombre plantado sale OCUPADO con su firma; los demas siguen LIBRE', IQ['funcion · sim_error'] === 'OCUPADO · sim_error(integer)'
    && Object.entries(IQ).filter(([k]) => k !== 'funcion · sim_error').every(([, v]) => v === 'LIBRE') && una(Q, 'inventario', '~ total') === `${esperado.length} nombres · 1 ocupados`, una(Q, 'inventario', '~ total'))
  ver('miembro: authenticated → service_role, con sus opciones', /^admin=false · inherit=true · set=true · concedido_por=postgres$/.test(una(Q, 'miembro', 'authenticated → service_role')), una(Q, 'miembro', 'authenticated → service_role'))
  ver('puede_ser: authenticated → service_role (y USAGE, porque hereda)', una(Q, 'puede_ser', 'authenticated → service_role') === 'member=si · usage=si', una(Q, 'puede_ser', 'authenticated → service_role'))
  ver('ningun dato de alumno en la salida (ni nombres de sesion, ni correo, ni ids)', !/CENTINELA|centinela-correo|0000000000c[12]/.test(rq.out))
  ver('la membresia plantada se retira (es del cluster)', pg.psql('revoke service_role from authenticated;', 'q').ok)

  titulo('6 · control: sim-003 aplicado (base a)')
  const IA = inventario(s06('a').filas)
  const libres = Object.entries(IA).filter(([, v]) => v === 'LIBRE').map(([k]) => k).sort()
  ver('todo el inventario OCUPADO salvo los 9 tipos con nombre de funcion', JSON.stringify(libres) === JSON.stringify(g.funciones.map(x => 'tipo · ' + x).sort()), libres.join(', '))
  ver('las columnas salen con su tipo', IA['columna · sim_sessions.version'] === 'OCUPADA · bigint' && IA['columna · sim_trades.ambigua']?.startsWith('OCUPADA · '), IA['columna · sim_sessions.version'])

  titulo('7 · control: un ejecutor al que la RLS filtra')
  const ra = s06('q', 'authenticated')
  ver('como authenticated corre, y lo dice: sim_sessions=NO (el numero no vale)', ra.ok && /· el ejecutor ve todas las filas: sim_sessions=NO · profiles=NO$/.test(una(ra.filas, 'huerfanos', 'sesiones_sin_perfil')), ra.ok ? una(ra.filas, 'huerfanos', 'sesiones_sin_perfil') : ra.err.split('\n')[0])
} finally {
  pg.cierra()
}
fin()
