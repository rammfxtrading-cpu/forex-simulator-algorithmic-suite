/**
 * S16g (QUE NOMBRES DE AJUSTE HAY FIJADOS PARA LA BASE Y LOS ROLES POR LOS QUE PASA LA EJECUCION) · ENSAYO EN POSTGRESQL 17
 * LOCAL (etapa 3, ronda 4; orden 1-011).
 *   1 READ ONLY, una sola SELECT, acaba en FIN; de pg_db_role_setting solo lee el NOMBRE (split_part(…, '=', 1))
 *   2 en el montaje limpio: los roles de la lista y el dueño de las RPC; ningun ajuste fijado
 *   3 con authenticator, un pgrst.db_schemas fijado y un rol nuevo del que authenticator es miembro (y otro miembro de
 *     authenticator) con session_replication_role: salen por nombre, y el valor no sale en ningun sitio
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { titulo, ver, oraculo, fin, REPO } from './lib.mjs'
import { hayPostgres } from './pg-ensayo.mjs'
import { montajeV1 } from './montaje-v1.mjs'
const lee = p => readFileSync(path.join(REPO, p), 'utf8')
const S16G = lee('sql/consultas/s16g-ajustes-por-nombre.sql')
titulo('1 · solo lectura y solo nombres')
const sin = S16G.replace(/--.*$/gm, '').replace(/'[^']*'/g, "''")
oraculo('S16g', 'una sola SELECT: sin escrituras, EXECUTE ni set_config; no lee ninguna de las 14 tablas', !/\b(insert|update|delete|truncate|alter|create|drop|grant|revoke|execute|perform|call|do|set_config)\b/i.test(sin) && (sin.match(/;/g) || []).length === 1 && !/\b(from|join)\s+(public\.)?(sim_|session_|user_)/i.test(sin))
oraculo('S16g', 'de pg_db_role_setting solo lee el nombre: cada c.x va dentro de split_part(c.x, \'=\', 1)', (S16G.match(/\bc\.x\b/g) || []).length > 0 && (S16G.match(/\bc\.x\b/g) || []).length === (S16G.match(/split_part\(c\.x, '=', 1\)/g) || []).length)
if (!hayPostgres()) { ver('PostgreSQL 17 local: NO hay, la prueba no se ha ejecutado', false); fin() }
const m = montajeV1()
try {
  m.arranca()
  const d = m.base('sg1'); m.comoEjecutor(d, lee('sql/sim-004a-puerta.sql'))
  const corre = () => m.comoEjecutor(d, `begin read only;\n${S16G}\nrollback;`)
  titulo('2 · el montaje limpio')
  const r = corre(), ls = r.out.split('\n').filter(l => l && !/^(BEGIN|ROLLBACK)$/.test(l))
  oraculo('S16g', 'en READ ONLY acaba en «FIN|s16g|consulta»; los roles de la lista y el dueño de las RPC; ningun ajuste fijado', r.ok && ls.at(-1) === 'FIN|s16g|consulta' && ['anon', 'authenticated', 'service_role', 'pgx'].every(x => ls.some(l => l.startsWith(`rol|${x}|`))) && !ls.some(l => l.startsWith('fijado|')), (r.err || ls.join(' / ')).slice(0, 300))
  titulo('3 · authenticator, sus roles y sus ajustes salen por nombre, sin valor')
  const prep = m.pg.psql(`create role authenticator noinherit login; create role sim_x nologin; grant sim_x to authenticator; create role sim_y nologin; grant authenticator to sim_y;
    alter role authenticator set pgrst.db_schemas = 'valor_secreto_1'; alter role sim_x set session_replication_role = replica; alter role sim_y set row_security = off;
    alter database ${d} set pgrst.db_pre_request = 'valor_secreto_2';`, d)
  const q = corre(), lq = q.out.split('\n')
  try {
    oraculo('S16g', 'authenticator y los dos roles nuevos (miembro de authenticator, y del que authenticator es miembro) salen en «rol»', prep.ok && ['authenticator', 'sim_x', 'sim_y'].every(x => lq.some(l => l.startsWith(`rol|${x}|`))) && lq.some(l => l.startsWith('rol|sim_x|') && l.includes('authenticator es miembro')) && lq.some(l => l.startsWith('rol|sim_y|') && l.includes('miembro de authenticator')), (prep.err || lq.filter(l => l.startsWith('rol|')).join(' / ')).slice(0, 300))
    oraculo('S16g', 'los cuatro ajustes salen por nombre y donde (base, rol authenticator, rol sim_x, rol sim_y)', ['fijado|base|pgrst.db_pre_request', 'fijado|rol authenticator (en todas las bases)|pgrst.db_schemas', 'fijado|rol sim_x (en todas las bases)|session_replication_role', 'fijado|rol sim_y (en todas las bases)|row_security'].every(x => lq.includes(x)), lq.filter(l => l.startsWith('fijado|')).join(' / '))
    oraculo('S16g', 'y ningun valor sale en ningun sitio', !/valor_secreto|replica\b|\|off\b/.test(q.out + q.err), '')
  } finally { m.pg.psql(`alter database ${d} reset all; drop owned by sim_x; drop owned by sim_y; revoke sim_x from authenticator; revoke authenticator from sim_y; alter role authenticator reset all; drop role sim_x; drop role sim_y; drop role authenticator;`, d) }
} finally { m.cierra() }
fin()
