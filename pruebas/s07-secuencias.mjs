/**
 * S07 · PERMISOS DE LAS SECUENCIAS Y TABLAS NUEVAS DE sim-003, ENSAYADA ANTES DE PEDIRLA
 *
 * sql/consultas/s07-secuencias-y-permisos.sql se le pide a Ramon tras aplicar
 * sim-003 (12-oct): ninguna guarda del DO comprueba el REVOKE de las dos
 * secuencias nuevas. Sobre el montaje LITERAL de s04 + sim-002 + sim-003:
 *   1 corre entera en BEGIN READ ONLY, acaba en FIN, y el texto no tiene
 *     ninguna orden de escritura
 *   2 trae lo esperado: secuencias sin nada para anon, authenticated,
 *     service_role ni PUBLIC; su ACL crudo; y en las 4 tablas solo SELECT de
 *     authenticated y service_role en sim_recibos y sim_eventos
 *   3 control positivo (otra base): un GRANT USAGE a anon y otro a PUBLIC en
 *     una secuencia, y un INSERT a authenticated en una tabla: salen true
 *   4 sin sim-003: dice NO EXISTE (no aprueba en vacio)
 * ⚠️ El montaje no es la base viva; no prueba el editor de Supabase.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { titulo, ver, fin, REPO } from './lib.mjs'
import { BIN, hayPostgres, cluster } from './pg-ensayo.mjs'
import { PRODUCCION } from './estado-s04.mjs'
if (!hayPostgres()) { ver(`PostgreSQL 17 en ${BIN}: NO hay, la prueba no se ha ejecutado`, false); fin() }
const lee = p => readFileSync(path.join(REPO, p), 'utf8')
const consulta = lee('sql/consultas/s07-secuencias-y-permisos.sql')
const q = consulta.replace(/--.*$/mg, '').trim().replace(/;\s*$/, '')
const pg = cluster()
// sin campos con comas ni saltos: basta partir por lineas y por la primera y segunda coma
const s07 = db => {
  const r = pg.psql(`begin read only;\ncopy (${q}) to stdout with (format csv, header);\ncommit;`, db)
  const filas = r.ok ? r.out.split('\n').slice(1).map(l => { const m = l.match(/^([^,]*),([^,]*),(.*)$/); return m ? [m[1], m[2], m[3].replace(/^"|"$/g, '')] : [l] }) : []
  return { ...r, filas }
}
const una = (F, s, o) => F.find(f => f[0] === s && f[1] === o)?.[2] ?? ''
const SECS = ['sim_recibos_id_seq', 'sim_eventos_id_seq'], ROLES = ['anon', 'authenticated', 'service_role']
const TABLAS = ['sim_alumnos', 'sim_arrendamientos', 'sim_recibos', 'sim_eventos']

try {
  pg.arranca()
  titulo('1 · montaje literal + sim-003, y solo lectura')
  for (const db of ['p', 'q', 'v']) {
    pg.psql(`create database ${db}`, 'postgres')
    const m = pg.psql(PRODUCCION, db), m2 = pg.psql(lee('sql/sim-002-lectura-estable.sql'), db)
    const m3 = db === 'v' ? { ok: true, err: '' } : pg.psql(lee('sql/sim-003-persistencia-aditiva.sql'), db)
    ver(`base ${db}: PRODUCCION + sim-002${db === 'v' ? ' (SIN sim-003)' : ' + sim-003'}`, m.ok && m2.ok && m3.ok, (m.err + m2.err + m3.err).split('\n')[0])
  }
  const r = s07('p'), F = r.filas
  ver('corre entera dentro de BEGIN READ ONLY', r.ok, r.err.split('\n')[0])
  ver('acaba en FIN | s07 | consulta; 8 + 2 + 12 filas y FIN', F.at(-1)?.join('|') === 'FIN|s07|consulta' && F.length === 23, F.length)
  const control = pg.psql(`begin read only;\ncreate table public.escritura_de_control (i integer);\ncommit;`, 'p')
  ver('control: en esa transaccion una escritura SI falla', !control.ok && /read-only transaction/.test(control.err), control.err.split('\n')[0])
  ver('el texto de la consulta no contiene ninguna orden de escritura', !/\b(insert|update|delete|drop|alter|create|grant|revoke|truncate|copy|set|do|call|perform)\b/i.test(consulta.replace(/--.*$/mg, '').replace(/'[^']*'/g, "''")))

  titulo('2 · lo esperado tras sim-003')
  ver('secuencias: usage, select y update false para anon, authenticated, service_role y PUBLIC (8 filas)',
    SECS.every(s => [...ROLES, 'PUBLIC'].every(ro => una(F, 'secuencia', `${s} · ${ro}`) === 'usage=false · select=false · update=false')),
    F.filter(f => f[0] === 'secuencia').map(f => f[1] + ' ' + f[2]).join(' / '))
  ver('acl crudo: solo el dueño, con rwU', SECS.every(s => una(F, 'acl', s) === 'dueño=postgres · relacl={postgres=rwU/postgres}'), F.filter(f => f[0] === 'acl').map(f => f[2]).join(' / '))
  ver('tablas: solo SELECT de authenticated y service_role en sim_recibos y sim_eventos; ninguna escritura',
    TABLAS.every(t => ROLES.every(ro => una(F, 'tabla', `${t} · ${ro}`) === `select=${ro !== 'anon' && /recibos|eventos/.test(t)} · insert=false · update=false · delete=false`)),
    F.filter(f => f[0] === 'tabla').map(f => f[1] + ' ' + f[2]).join(' / '))

  titulo('3 · control positivo: permisos plantados (base q)')
  ver('plantados: USAGE a anon y a PUBLIC en sim_eventos_id_seq, INSERT a authenticated en sim_alumnos',
    pg.psql('grant usage on sequence public.sim_eventos_id_seq to anon, public; grant insert on public.sim_alumnos to authenticated;', 'q').ok)
  const Q = s07('q').filas
  ver('sim_eventos_id_seq · anon y · PUBLIC: usage=true', una(Q, 'secuencia', 'sim_eventos_id_seq · anon').startsWith('usage=true') && una(Q, 'secuencia', 'sim_eventos_id_seq · PUBLIC').startsWith('usage=true'),
    una(Q, 'secuencia', 'sim_eventos_id_seq · PUBLIC'))
  ver('authenticated hereda el de PUBLIC (usage=true); sim_recibos_id_seq sigue en false', una(Q, 'secuencia', 'sim_eventos_id_seq · authenticated').startsWith('usage=true')
    && una(Q, 'secuencia', 'sim_recibos_id_seq · anon') === 'usage=false · select=false · update=false')
  ver('el acl crudo los muestra', /anon=U\/postgres/.test(una(Q, 'acl', 'sim_eventos_id_seq')) && /(^|[{,])=U\/postgres/.test(una(Q, 'acl', 'sim_eventos_id_seq')), una(Q, 'acl', 'sim_eventos_id_seq'))
  ver('sim_alumnos · authenticated: insert=true', una(Q, 'tabla', 'sim_alumnos · authenticated') === 'select=false · insert=true · update=false · delete=false', una(Q, 'tabla', 'sim_alumnos · authenticated'))

  titulo('4 · sin sim-003 (base v)')
  const V = s07('v')
  ver('corre y dice NO EXISTE en las 22 filas (no aprueba en vacio)', V.ok && V.filas.filter(f => /^NO EXISTE/.test(f[2] ?? '')).length === 22, V.ok ? V.filas.filter(f => /^NO EXISTE/.test(f[2] ?? '')).length : V.err.split('\n')[0])
} finally {
  pg.cierra()
}
fin()
