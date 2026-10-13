/**
 * S11 · ACL DE COLUMNA Y PRIVILEGIOS EFECTIVOS POR COLUMNA · ENSAYO EN POSTGRESQL 17 LOCAL
 * (CTO 13-oct, o.14: paso previo OBLIGATORIO a la preparatoria en el runbook)
 *
 * Montaje: produccion segun s04 LITERAL + sql/sim-002 + sql/sim-003 (aplicada por el ejecutor no
 * superusuario de s06, como en pruebas/sim-004a.mjs). Datos: ninguno (solo catalogo).
 *
 *   1 limpio: la consulta corre en una transaccion READ ONLY, trae las 6 tablas, «total 0» y
 *     ninguna «DIFIERE»; y lo efectivo por columna coincide con has_table_privilege
 *   2 CONTROL: ACL plantadas (UPDATE de columna a anon en sim_sessions, SELECT de columna a anon
 *     en sim_eventos, y un rol con SELECT de columna en sim_arrendamientos hecho miembro de
 *     authenticated) → aparecen en acl_columna, y en efectivo las que cambian el privilegio
 *     salen «DIFIERE DE LA TABLA» con su columna, la heredada incluida
 *   3 sin sim-003: dice «NO EXISTE» de esas tablas y no falla
 * ⚠️ No prueba el editor de Supabase (una sola SELECT: el editor la acepta como s10).
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { titulo, ver, oraculo, fin, REPO } from './lib.mjs'
import { BIN, hayPostgres, cluster } from './pg-ensayo.mjs'
import { PRODUCCION } from './estado-s04.mjs'
if (!hayPostgres()) { ver(`PostgreSQL 17 en ${BIN}: NO hay, la prueba no se ha ejecutado`, false); fin() }
const lee = p => readFileSync(path.join(REPO, p), 'utf8')
const S11 = lee('sql/consultas/s11-acl-columna.sql')
const S2 = lee('sql/sim-002-lectura-estable.sql')
const S3 = lee('sql/sim-003-persistencia-aditiva.sql')
const pg = cluster()
const EJECUTOR = `
do $r$ begin if not exists (select 1 from pg_roles where rolname = 'pgx') then
  create role pgx login nosuperuser bypassrls createrole inherit; end if; end $r$;
grant anon, authenticated, service_role to pgx with admin option;
grant usage, create on schema public to pgx;
grant usage on schema auth, extensions to pgx;
do $$ declare r record; begin
  for r in select c.oid::regclass t from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind in ('r','p','v','m') loop
    execute format('alter table %s owner to pgx', r.t); end loop;
  for r in select p.oid::regprocedure f from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' loop
    execute format('alter function %s owner to pgx', r.f); end loop;
end $$;
alter default privileges for role pgx in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges for role pgx in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges for role pgx in schema public grant all on functions to anon, authenticated, service_role;`
const pgx = (texto, db) => {
  const f = path.join(pg.dir, 'x.sql'); writeFileSync(f, texto)
  const r = spawnSync(path.join(BIN, 'psql'), ['-h', pg.dir, '-p', pg.puerto, '-U', 'pgx', '-X', '-q', '-tA', '-F', '|', '-v', 'ON_ERROR_STOP=1', '-d', db, '-f', f],
    { encoding: 'utf8', env: { PATH: process.env.PATH, LC_ALL: 'en_US.UTF-8', LANG: 'en_US.UTF-8' } })
  return { ok: r.status === 0, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() }
}
const monta = (db, { s3 = true } = {}) => {
  const pasos = [pg.psql(`create database ${db}`, 'postgres'), pg.psql(PRODUCCION, db), pg.psql(S2, db), pg.psql(EJECUTOR, db), s3 ? pgx(S3, db) : { ok: true }]
  if (!pasos.every(x => x.ok)) throw new Error(`montaje ${db}: ${pasos.map(x => x.err).join(' ')}`)
}
// la consulta como la pega Ramon, pero dentro de una transaccion READ ONLY; filas «seccion|objeto|detalle»
const s11 = db => {
  const r = pg.psql(`begin transaction read only;\n\\pset fieldsep '|'\n${S11}\nrollback;`, db)
  return { ok: r.ok, err: r.err, filas: r.out.split('\n').filter(l => l.includes('|')).map(l => { const [s, o, ...d] = l.split('|'); return { s, o, d: d.join('|') } }) }
}
const de = (r, s) => r.filas.filter(f => f.s === s)

try {
  pg.arranca()
  titulo('1 · limpio (s04 + sim-002 + sim-003)')
  monta('p')
  const r = s11('p')
  ver('la consulta corre entera en una transaccion READ ONLY', r.ok, r.err.split('\n')[0])
  const tablas = de(r, 'tabla'), ef = de(r, 'efectivo')
  // lo efectivo por columna, contrastado aparte con has_table_privilege (sin la consulta)
  const tablaNivel = pg.psql(`select string_agg(t||' · '||r||' · '||p||'='||has_table_privilege(r, 'public.'||t, p), E'\\n')
    from unnest(array['sim_sessions','sim_trades','sim_alumnos','sim_arrendamientos','sim_recibos','sim_eventos']) t,
         unnest(array['anon','authenticated','service_role']) r, unnest(array['SELECT','INSERT','UPDATE','REFERENCES']) p`, 'p').out.split('\n')
  const coincide = tablaNivel.every(l => { const [k, v] = l.split('='); const f = ef.find(x => x.o === k); return f && f.d.startsWith('tabla=' + v + ' ') })
  oraculo('S11-limpio', 'limpio: las 6 tablas existen, «total 0 columnas con ACL propia», ninguna «DIFIERE», 6 × 3 × 4 = 72 filas de efectivo que coinciden con has_table_privilege, y acaba en FIN',
    r.ok && tablas.length === 6 && tablas.every(f => / columnas · dueño /.test(f.d)) && de(r, 'acl_columna').length === 1 && de(r, 'acl_columna')[0].d === '0 columnas con ACL propia'
    && ef.length === 72 && !ef.some(f => /DIFIERE/.test(f.d)) && coincide && r.filas.at(-1).s === 'FIN' && r.filas.at(-1).o === 's11',
    `${tablas.length} tablas · ${de(r, 'acl_columna').map(f => f.d)} · ${ef.length} efectivo · coincide ${coincide}`)

  titulo('2 · CONTROL: ACL de columna plantadas')
  monta('c')
  const antes = pg.psql(`select has_table_privilege('anon', 'public.sim_eventos', 'SELECT')||','||has_table_privilege('authenticated', 'public.sim_arrendamientos', 'SELECT')`, 'c').out
  const col = pg.psql(`select attname from pg_attribute where attrelid = 'public.sim_arrendamientos'::regclass and attnum = 1`, 'c').out
  const planta = pg.psql(`grant update (balance) on public.sim_sessions to anon;
grant select (id) on public.sim_eventos to anon;
create role zz_s11 nologin; grant select (${col}) on public.sim_arrendamientos to zz_s11; grant zz_s11 to authenticated;`, 'c')
  ver('control: las tres ACL se plantan (como superusuario)', planta.ok, planta.err.split('\n')[0])
  ver('control: sin ellas, anon no lee sim_eventos y authenticated no lee sim_arrendamientos a nivel de tabla (si no, el grant de columna no cambiaria lo efectivo)', antes === 'false,false', antes)
  const c = s11('c')
  const acl = de(c, 'acl_columna'), efc = de(c, 'efectivo')
  const linea = k => efc.find(f => f.o === k)?.d ?? ''
  oraculo('S11-control-acl', 'las ACL plantadas aparecen en acl_columna (sim_sessions.balance, sim_eventos.id, sim_arrendamientos.<1.ª columna>) y el total dice 3',
    c.ok && ['sim_sessions.balance', 'sim_eventos.id', 'sim_arrendamientos.' + col].every(k => acl.some(f => f.o === k)) && acl.find(f => f.o === 'total')?.d === '3 columnas con ACL propia'
    && /anon=w/.test(acl.find(f => f.o === 'sim_sessions.balance')?.d) && /zz_s11=r/.test(acl.find(f => f.o === 'sim_arrendamientos.' + col)?.d), acl.map(f => f.o + ' ' + f.d).join(' | '))
  oraculo('S11-control-efectivo', 'en efectivo, el SELECT de columna de anon en sim_eventos y el HEREDADO de authenticated en sim_arrendamientos salen «DIFIERE DE LA TABLA» con su columna',
    /tabla=false · columnas: 1 de \d+: id · DIFIERE DE LA TABLA/.test(linea('sim_eventos · anon · SELECT'))
    && new RegExp(`tabla=false · columnas: 1 de \\d+: ${col} · DIFIERE DE LA TABLA`).test(linea('sim_arrendamientos · authenticated · SELECT')),
    `${linea('sim_eventos · anon · SELECT')} | ${linea('sim_arrendamientos · authenticated · SELECT')}`)

  titulo('3 · sin sim-003')
  monta('n', { s3: false })
  const n = s11('n')
  const no = de(n, 'tabla').filter(f => f.d === 'NO EXISTE').map(f => f.o).sort().join(',')
  oraculo('S11-sin-tablas', 'sin las tablas de sim-003: dice «NO EXISTE» de las cuatro, no falla, y sigue con sim_sessions y sim_trades (2 × 12 filas de efectivo)',
    n.ok && no === 'sim_alumnos,sim_arrendamientos,sim_eventos,sim_recibos' && de(n, 'efectivo').length === 24 && n.filas.at(-1).s === 'FIN', `${no} · ${de(n, 'efectivo').length} · ${n.err.split('\n')[0]}`)
} finally { pg.cierra() }
fin()
