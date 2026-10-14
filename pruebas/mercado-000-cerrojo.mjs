/**
 * MERCADO-000 (EL CERROJO DEL PUBLICADOR EN LA BASE) · ENSAYO EN POSTGRESQL 17 LOCAL
 * (etapa 2; Astra E2R3-01, CTO 14-oct). Escrito antes que el SQL.
 *
 * Montaje: produccion segun s04 LITERAL, con los permisos por defecto de
 * postgres en public que midio s06 (tablas nuevas: todo a anon, authenticated y
 * service_role), que es lo que haria aparecer grants en la tabla nueva.
 *   1 limpio: crea public.mercado_cerrojo con su forma, RLS activa, sin
 *     politicas, y SOLO service_role con SELECT, INSERT y DELETE; el informe
 *     acaba en FIN; segunda ejecucion: no toca nada
 *   2 guardas, en rojo y sin crear nada: nombre ocupado (tabla, vista, indice,
 *     tipo), tabla con otra forma (columna, grant a anon, politica, RLS apagada,
 *     disparador), roles que faltan
 *   3 la semantica que usa el publicador, como service_role: INSERT que falla
 *     (23505) si ya hay fila; DELETE condicional que no toca a otro dueño
 *     (el DELETE tardio de E2R3-01); recurso y descripcion con forma cerrada
 *   4 anon y authenticated no leen, ni escriben, ni borran (permission denied)
 *   5 como el postgres no superusuario de s06 tambien aplica
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { titulo, ver, oraculo, fin, REPO } from './lib.mjs'
import { BIN, hayPostgres, cluster } from './pg-ensayo.mjs'
import { PRODUCCION } from './estado-s04.mjs'
if (!hayPostgres()) { ver(`PostgreSQL 17 en ${BIN}: NO hay, la prueba no se ha ejecutado`, false); fin() }
const M0 = readFileSync(path.join(REPO, 'sql/mercado-000-cerrojo.sql'), 'utf8')
const pg = cluster()
// s06: el default ACL de postgres en public (tablas arwdDxtm a los tres roles)
const DEFAULT_ACL = `alter default privileges for role postgres in schema public grant all on tables to anon, authenticated, service_role;`
const PGX = `do $r$ begin if not exists (select 1 from pg_roles where rolname = 'pgx') then create role pgx login nosuperuser bypassrls createrole inherit; end if; end $r$;
grant anon, authenticated, service_role to pgx with admin option; grant create, usage on schema public to pgx;`
let n = 0
const monta = (extra = '') => {
  const db = `c${++n}`
  const pasos = [pg.psql(`create database ${db}`, 'postgres'), pg.psql(PRODUCCION, db), pg.psql(DEFAULT_ACL, db), ...(extra ? [pg.psql(extra, db)] : [])]
  if (!pasos.every(x => x.ok)) throw new Error(`montaje ${db}: ${pasos.map(x => x.err).join(' ')}`)
  return db
}
const err1 = r => (r.err.split('\n').find(l => /ERROR/.test(l)) || r.err.split('\n')[0] || '').replace(/^.*ERROR:\s+/, '')
const catalogo = db => pg.psql(`select coalesce((select string_agg(relname || ':' || relkind, ',' order by relname) from pg_class where relnamespace = 'public'::regnamespace and relname like 'mercado_cerrojo%'), '-');
select coalesce((select relacl::text from pg_class where oid = to_regclass('public.mercado_cerrojo')), '-');`, db).out
// una orden como un rol, en una transaccion que se deshace salvo que se pida
const como = (rol, q, db, { deshace = true } = {}) => pg.psql(`begin; set local role ${rol};\n${q}\n${deshace ? 'rollback' : 'commit'};`, db)

try {
  pg.arranca()
  titulo('1 · limpio: crea la tabla; segunda ejecucion, nada')
  const d1 = monta()
  const r1 = pg.psql(M0, d1)
  oraculo('M000', 'aplica: el informe dice la tabla con RLS, sin politicas, 0 filas, los permisos y acaba en FIN', r1.ok && /tabla\|public.mercado_cerrojo · rls=true · politicas=0 · filas=0/.test(r1.out) && /permisos\|service_role=DELETE, service_role=INSERT, service_role=SELECT$/m.test(r1.out) && /FIN\|mercado-000 aplicada$/.test(r1.out), r1.err || r1.out)
  const acl = pg.psql(`select coalesce(string_agg(r.rolname || '=' || x.privilege_type, ',' order by r.rolname, x.privilege_type), '') from pg_class c, aclexplode(c.relacl) x join pg_roles r on r.oid = x.grantee where c.oid = 'public.mercado_cerrojo'::regclass and r.rolname <> 'postgres'`, d1).out
  oraculo('M000', 'permisos: solo service_role, y solo SELECT, INSERT y DELETE (el default ACL de Supabase quitado); nada a PUBLIC', acl === 'service_role=DELETE,service_role=INSERT,service_role=SELECT' && pg.psql(`select count(*) from pg_class c, aclexplode(c.relacl) x where c.oid = 'public.mercado_cerrojo'::regclass and x.grantee = 0`, d1).out === '0', acl)
  const forma = pg.psql(`select string_agg(a.attname || ' ' || format_type(a.atttypid, a.atttypmod) || case when a.attnotnull then ' nn' else '' end, ', ' order by a.attnum) from pg_attribute a where a.attrelid = 'public.mercado_cerrojo'::regclass and a.attnum > 0 and not a.attisdropped`, d1).out
  oraculo('M000', 'columnas: recurso text (clave), dueno uuid, desde timestamptz, descripcion text, todas not null', forma === 'recurso text nn, dueno uuid nn, desde timestamp with time zone nn, descripcion text nn', forma)
  const antes2 = catalogo(d1)
  const r1b = pg.psql(M0, d1)
  oraculo('M000', 'segunda ejecucion: termina bien, dice que ya estaba y no cambia nada', r1b.ok && /ya existe; se comprueba su forma y no se toca/.test(r1b.err) && catalogo(d1) === antes2 && /FIN\|mercado-000 aplicada$/.test(r1b.out), r1b.err)
  oraculo('M000', 'el SQL no crea politicas, funciones ni disparadores (fuera comentarios)', !/\bcreate\s+(policy|function|trigger|or replace)\b/i.test(M0.replace(/--.*$/gm, '')))

  titulo('2 · guardas: abortan sin crear nada')
  const GUARDAS = [
    ['una tabla ajena con ese nombre (otra forma)', `create table public.mercado_cerrojo (id int primary key);`, /existe con otra forma \(columnas distintas/],
    ['una vista con ese nombre', `create view public.mercado_cerrojo as select 1 x;`, /otra forma \(no es una tabla/],
    ['un indice con el nombre de su clave', `create table public.otra (x int); create index mercado_cerrojo_pkey on public.otra (x);`, /nombre mercado_cerrojo .* ya esta ocupado/],
    ['un tipo compuesto con ese nombre (crea tambien una relacion)', `create type public.mercado_cerrojo as (x int);`, /ya esta ocupado|otra forma \(no es una tabla/],
    ['un tipo enumerado con el nombre del tipo de su arreglo', `create type public._mercado_cerrojo as enum ('x');`, /ya esta ocupado/],
    ['la tabla buena con un grant a anon', `${M0.split('do $m$')[0]}\n${M0.slice(M0.indexOf('do $m$'), M0.indexOf('select seccion'))} grant select on public.mercado_cerrojo to anon;`, /otra forma \(PUBLIC, anon o authenticated tienen permisos/],
    ['la tabla buena con una politica', `${M0.slice(M0.indexOf('do $m$'), M0.indexOf('select seccion'))} create policy p on public.mercado_cerrojo for select to authenticated using (true);`, /otra forma \(tiene politicas/],
    ['la tabla buena con la RLS apagada', `${M0.slice(M0.indexOf('do $m$'), M0.indexOf('select seccion'))} alter table public.mercado_cerrojo disable row level security;`, /otra forma \(RLS apagada/],
    ['la tabla buena con un disparador', `${M0.slice(M0.indexOf('do $m$'), M0.indexOf('select seccion'))} create function public.f() returns trigger language plpgsql as $f$ begin return new; end $f$; create trigger t before insert on public.mercado_cerrojo for each row execute function public.f();`, /otra forma \(tiene disparadores/],
    ['la tabla buena con un permiso de columna', `${M0.slice(M0.indexOf('do $m$'), M0.indexOf('select seccion'))} grant update (descripcion) on public.mercado_cerrojo to service_role;`, /otra forma \(.*permisos de columna/],
  ]
  for (const [que, sql, error] of GUARDAS) {
    const d = monta(sql)
    const a = catalogo(d)
    const r = pg.psql(M0, d)
    oraculo('M000', `aborta con ${que}: mensaje «mercado-000:» y nada cambia`, !r.ok && /mercado-000:/.test(r.err) && error.test(r.err) && catalogo(d) === a, err1(r))
  }
  const dSin = `s${++n}`; pg.psql(`create database ${dSin}`, 'postgres')
  const rSin = pg.psql(M0, dSin)
  oraculo('M000', 'sin los roles de Supabase: aborta «faltan los roles» (en una base sin anon)', pg.psql(`select count(*) from pg_roles where rolname = 'anon'`, dSin).out !== '0' || (!rSin.ok && /faltan los roles/.test(rSin.err)), err1(rSin))

  titulo('3 · la semantica del publicador, como service_role')
  const d3 = monta(); pg.psql(M0, d3)
  const A = '11111111-2222-4333-8444-555555555555', B = '22222222-3333-4444-8555-666666666666'
  const ins = id => `insert into public.mercado_cerrojo (recurso, dueno, descripcion) values ('mercado/v1', '${id}', 'mercado-v1-publica');`
  ver('control: service_role inserta el cerrojo de A', como('service_role', ins(A), d3, { deshace: false }).ok)
  const dup = como('service_role', ins(B), d3)
  oraculo('M000', 'adquirir con un cerrojo puesto: el INSERT falla con 23505 (clave repetida)', !dup.ok && /duplicate key value violates unique constraint "mercado_cerrojo_pkey"/.test(dup.err), err1(dup))
  const tardio = como('service_role', `delete from public.mercado_cerrojo where recurso = 'mercado/v1' and dueno = '${B}' returning dueno;`, d3)
  oraculo('M000', 'el DELETE condicional de otro dueño (el tardio de E2R3-01) no borra nada y el de A sigue', tardio.ok && !tardio.out.includes(B) && pg.psql(`select dueno from public.mercado_cerrojo`, d3).out === A, tardio.out || tardio.err)
  const suelta = como('service_role', `delete from public.mercado_cerrojo where recurso = 'mercado/v1' and dueno = '${A}' returning dueno;`, d3, { deshace: false })
  oraculo('M000', 'el DELETE condicional de su dueño lo borra (devuelve su fila)', suelta.ok && suelta.out.includes(A) && pg.psql(`select count(*) from public.mercado_cerrojo`, d3).out === '0', suelta.out)
  const desde = como('service_role', `${ins(A)} select (now() - desde) < interval '1 minute' from public.mercado_cerrojo;`, d3)
  oraculo('M000', '«desde» lo pone la base (default now())', desde.ok && /\bt$/m.test(desde.out), desde.out)
  for (const [que, sql] of [['otro recurso', `insert into public.mercado_cerrojo (recurso, dueno, descripcion) values ('otro', '${A}', 'mercado-v1-publica');`], ['una descripcion ajena', `insert into public.mercado_cerrojo (recurso, dueno, descripcion) values ('mercado/v1', '${A}', 'https://x.supabase.co/?apikey=FUGA123');`], ['sin dueño', `insert into public.mercado_cerrojo (recurso, descripcion) values ('mercado/v1', 'mercado-v1-publica');`]]) {
    const r = como('service_role', sql, d3)
    oraculo('M000', `${que}: la base lo rechaza`, !r.ok && /violates (check|not-null) constraint/.test(r.err), err1(r))
  }
  const upd = como('service_role', `${ins(A)} update public.mercado_cerrojo set dueno = '${B}';`, d3)
  oraculo('M000', 'service_role tampoco puede cambiar el dueño (sin UPDATE)', !upd.ok && /permission denied/.test(upd.err), err1(upd))

  titulo('4 · anon y authenticated, nada')
  como('service_role', ins(A), d3, { deshace: false })
  for (const rol of ['anon', 'authenticated']) for (const [op, q] of [['SELECT', 'select * from public.mercado_cerrojo;'], ['INSERT', ins(B)], ['DELETE', `delete from public.mercado_cerrojo;`], ['UPDATE', `update public.mercado_cerrojo set descripcion = 'x';`]]) {
    const r = como(rol, q, d3)
    oraculo('M000', `${rol} ${op}: permission denied`, !r.ok && /permission denied for table mercado_cerrojo/.test(r.err), err1(r))
  }

  titulo('5 · como el postgres no superusuario de s06')
  const d5 = monta(PGX)
  const f = path.join(pg.dir, 'x0.sql'); writeFileSync(f, M0)
  const r5 = spawnSync(path.join(BIN, 'psql'), ['-h', pg.dir, '-p', pg.puerto, '-U', 'pgx', '-X', '-q', '-tA', '-v', 'ON_ERROR_STOP=1', '-d', d5, '-f', f], { encoding: 'utf8', env: { PATH: process.env.PATH, LC_ALL: 'en_US.UTF-8', LANG: 'en_US.UTF-8' } })
  oraculo('M000', 'pgx (no superusuario, bypassrls): aplica y acaba en FIN', r5.status === 0 && /FIN\|mercado-000 aplicada$/.test((r5.stdout || '').trim()), (r5.stderr || '').split('\n').find(l => /ERROR/.test(l)) || r5.stdout)
  const r5b = pg.psql(`begin;\n${M0}\ncommit;`, monta())
  oraculo('M000', 'en una sola transaccion (como el editor): el informe dice lock_timeout=5s · statement_timeout=30s', r5b.ok && /limites\|lock_timeout=5s · statement_timeout=30s/.test(r5b.out), err1(r5b) || r5b.out)
} finally { pg.cierra() }
fin()
