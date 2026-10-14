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
 *   6 E2R4-01 (Astra, CTO 14-oct): permisos EFECTIVOS, no solo el ACL directo.
 *     anon, authenticated y PUBLIC: ningun privilegio, contando herencia y
 *     pertenencias (tambien las de solo SET ROLE); service_role: exactamente
 *     SELECT, INSERT y DELETE, sin opcion de conceder; cualquier destinatario
 *     del ACL que no sea el dueño ni service_role aborta y se lista (no se le
 *     revoca a ciegas). En primera aplicacion y en reejecucion. El negativo de
 *     Astra (rol heredado con TRUNCATE por default privileges) y variantes con
 *     UPDATE y TRIGGER. El informe y el error dicen los privilegios por
 *     defecto del creador en public.
 *   7 E2R4-02: una regla de reescritura (DO INSTEAD NOTHING) aborta
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
// la foto del catalogo para «nada cambia». E2R4: con el montaje de s04, «relname || ':' || relkind» era
// ambiguo (text || "char") y la consulta fallaba: la foto salia vacia y «nada cambia» aprobaba en vacio.
// Ahora, con casts explicitos, y si la consulta falla, la prueba se para (no devuelve una foto vacia)
const catalogo = db => {
  const r = pg.psql(`select coalesce((select string_agg(relname::text || ':' || relkind::text, ',' order by relname) from pg_class where relnamespace = 'public'::regnamespace and relname::text like 'mercado_cerrojo%'), '-');
select coalesce((select relacl::text from pg_class where oid = to_regclass('public.mercado_cerrojo')), '-');`, db)
  if (!r.ok || r.out.split('\n').length !== 2) throw new Error(`catalogo ${db}: la foto no se puede tomar: ${r.err || r.out}`)
  return r.out
}
// una orden como un rol, en una transaccion que se deshace salvo que se pida
const como = (rol, q, db, { deshace = true } = {}) => pg.psql(`begin; set local role ${rol};\n${q}\n${deshace ? 'rollback' : 'commit'};`, db)
// la migracion ya aplicada (el DO), para montar las reejecuciones
const M0DO = M0.slice(M0.indexOf('do $m$'), M0.indexOf('select seccion'))

try {
  pg.arranca()
  // E2R5-01 completo (CTO 14-oct): authenticator como en un Supabase estandar (PostgREST entra con el y toma el rol
  // del JWT): miembro de anon, authenticated y service_role, y NO del dueño. Asi el caso limpio prueba que no hay falso positivo
  const rA = pg.psql(`do $r$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $r$; create role authenticator noinherit login; grant anon, authenticated, service_role to authenticator;`, 'postgres')
  if (!rA.ok) throw new Error(`authenticator: ${rA.err}`)
  titulo('1 · limpio: crea la tabla; segunda ejecucion, nada')
  const d1 = monta()
  const r1 = pg.psql(M0, d1)
  oraculo('M000', 'aplica: el informe dice la tabla con RLS, sin politicas, 0 filas, los permisos y acaba en FIN', r1.ok && /tabla\|public.mercado_cerrojo · rls=true · politicas=0 · filas=0/.test(r1.out) && /permisos\|service_role=DELETE, service_role=INSERT, service_role=SELECT$/m.test(r1.out) && /FIN\|mercado-000 aplicada$/.test(r1.out), r1.err || r1.out)
  const acl = pg.psql(`select coalesce(string_agg(r.rolname || '=' || x.privilege_type, ',' order by r.rolname, x.privilege_type), '') from pg_class c, aclexplode(c.relacl) x join pg_roles r on r.oid = x.grantee where c.oid = 'public.mercado_cerrojo'::regclass and r.rolname <> 'postgres'`, d1).out
  oraculo('M000', 'permisos: solo service_role, y solo SELECT, INSERT y DELETE (el default ACL de Supabase quitado); nada a PUBLIC', acl === 'service_role=DELETE,service_role=INSERT,service_role=SELECT' && pg.psql(`select count(*) from pg_class c, aclexplode(c.relacl) x where c.oid = 'public.mercado_cerrojo'::regclass and x.grantee = 0`, d1).out === '0', acl)
  const forma = pg.psql(`select string_agg(a.attname || ' ' || format_type(a.atttypid, a.atttypmod) || case when a.attnotnull then ' nn' else '' end, ', ' order by a.attnum) from pg_attribute a where a.attrelid = 'public.mercado_cerrojo'::regclass and a.attnum > 0 and not a.attisdropped`, d1).out
  oraculo('M000', 'columnas: recurso text (clave), dueno uuid, desde timestamptz, descripcion text, todas not null', forma === 'recurso text nn, dueno uuid nn, desde timestamp with time zone nn, descripcion text nn', forma)
  const antes2 = catalogo(d1)
  ver('control: la foto del catalogo ve la tabla y su ACL (no esta vacia)', /^mercado_cerrojo:r,mercado_cerrojo_pkey:i\n\{.*service_role=ard\//.test(antes2), antes2)
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
    ['la tabla buena con un grant a anon', `${M0.split('do $m$')[0]}\n${M0.slice(M0.indexOf('do $m$'), M0.indexOf('select seccion'))} grant select on public.mercado_cerrojo to anon;`, /permisos de public\.mercado_cerrojo NO ACREDITADOS \(.*destinatarios ajenos: anon=SELECT/],
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

  titulo('6 · E2R4-01: permisos efectivos (herencia, pertenencias, destinatarios ajenos)')
  // los roles inventados son del cluster: se crean una vez y cada montaje los usa o no
  pg.psql(`create role heredado; create role solo_set; create role dueno_ficticio nosuperuser noinherit; create role intermedio_ficticio noinherit;`, 'postgres')
  const HER = `grant heredado to authenticated;`
  const DEF = priv => `${HER} alter default privileges for role postgres in schema public grant ${priv} on tables to heredado;`
  // las pertenencias son del cluster, no de la base: se quitan despues de cada caso
  const limpiaRoles = () => { const r = pg.psql(`revoke heredado from authenticated; revoke solo_set from authenticated; revoke service_role from anon; revoke postgres from service_role; revoke dueno_ficticio from authenticated; revoke dueno_ficticio from service_role;
    revoke postgres from authenticator; revoke intermedio_ficticio from authenticated; revoke postgres from intermedio_ficticio;
    alter role authenticated nobypassrls; alter role anon nocreaterole; alter role service_role nocreaterole;`, 'postgres'); if (!r.ok) throw new Error(`limpiar roles: ${r.err}`) }
  {
    // el control de Astra: en ese montaje, una tabla nueva cualquiera SI deja a authenticated hacer TRUNCATE
    const d = monta(`${DEF('truncate')} create table public.testigo (x int);`)
    ver('control (Astra): con TRUNCATE por defecto a heredado, una tabla nueva de public a la que se le quitan los grants directos (como hace mercado-000) sigue dejando a authenticated hacer TRUNCATE', pg.psql(`revoke all on public.testigo from public, anon, authenticated, service_role; select has_table_privilege('authenticated', 'public.testigo', 'TRUNCATE') and not exists (select 1 from pg_class c, aclexplode(c.relacl) x where c.oid = 'public.testigo'::regclass and x.grantee = 'authenticated'::regrole)`, d).out === 't')
    const a = catalogo(d)
    const r = pg.psql(M0, d)
    oraculo('E2R4-01', 'el negativo de Astra, primera aplicacion: aborta, lista heredado y el TRUNCATE efectivo de authenticated, enseña el default ACL del creador, y no crea nada', !r.ok && /mercado-000: permisos de public\.mercado_cerrojo NO ACREDITADOS/.test(r.err) && /destinatarios ajenos: heredado=TRUNCATE/.test(r.err) && /authenticated tiene TRUNCATE/.test(r.err) && /por defecto de postgres: en public: .*heredado=TRUNCATE/.test(r.err) && catalogo(d) === a && a.startsWith('-'), err1(r))
    const t = como('authenticated', `truncate public.testigo;`, d)
    ver('control: el TRUNCATE de authenticated sobre la tabla testigo funciona (el riesgo era real en el montaje)', t.ok, t.err)
    limpiaRoles()
  }
  for (const [que, sql, error] of [
    ['authenticator miembro del dueño', `grant postgres to authenticator;`, /authenticator puede actuar como el dueño \(postgres\)/],
    ['authenticated con BYPASSRLS', `alter role authenticated bypassrls;`, /authenticated tiene BYPASSRLS/],
    ['anon con CREATEROLE', `alter role anon createrole;`, /anon tiene CREATEROLE/],
  ]) {
    const d = monta(sql)
    const a = catalogo(d)
    const r = pg.psql(M0, d)
    oraculo('E2R5-01', `primera aplicacion con ${que}: aborta, lo lista y no crea nada`, !r.ok && /mercado-000: permisos de public\.mercado_cerrojo NO ACREDITADOS/.test(r.err) && error.test(r.err) && catalogo(d) === a && a.startsWith('-'), err1(r))
    limpiaRoles()
  }
  {
    // quien ejecuta es uno de los roles de la API: el dueño seria anon
    const d = monta(`grant create on schema public to anon;`)
    const a = catalogo(d)
    const r = pg.psql(`set role anon;\n${M0}`, d)
    oraculo('E2R5-01', 'primera aplicacion ejecutada como anon: aborta («quien ejecuta es anon») y no crea nada', !r.ok && /quien ejecuta es anon, un rol de la API/.test(r.err) && catalogo(d) === a && a.startsWith('-'), err1(r))
  }
  for (const [priv, PRIV] of [['update', 'UPDATE'], ['trigger', 'TRIGGER']]) {
    const d = monta(DEF(priv))
    const a = catalogo(d)
    const r = pg.psql(M0, d)
    oraculo('E2R4-01', `variante ${PRIV} heredado por default privileges: aborta, lo lista (heredado=${PRIV}, authenticated tiene ${PRIV}) y no crea nada`, !r.ok && new RegExp(`destinatarios ajenos: heredado=${PRIV}`).test(r.err) && new RegExp(`authenticated tiene ${PRIV}`).test(r.err) && catalogo(d) === a, err1(r))
    limpiaRoles()
  }
  const DUENO_SIN_ACL = `alter table public.mercado_cerrojo owner to dueno_ficticio; revoke all on public.mercado_cerrojo from dueno_ficticio;`
  {
    // el control de E2R5-01: en ese montaje la escalada es real (authenticated toma el dueño, se concede TRUNCATE y vacia la tabla)
    const d = monta(`${M0DO} ${DUENO_SIN_ACL} grant dueno_ficticio to authenticated with inherit false, set true; insert into public.mercado_cerrojo (recurso, dueno, descripcion) values ('mercado/v1', '11111111-2222-4333-8444-555555555555', 'mercado-v1-publica');`)
    const e = pg.psql(`begin; set local session authorization authenticated; select has_table_privilege('authenticated', 'public.mercado_cerrojo', 'TRUNCATE'); set local role dueno_ficticio; grant truncate on public.mercado_cerrojo to authenticated; reset role; truncate public.mercado_cerrojo; reset session authorization; select count(*) from public.mercado_cerrojo; rollback;`, d)
    ver('control (E2R5-01): authenticated no tiene TRUNCATE, pero toma el dueño sin permisos, se lo concede y vacia la tabla', e.ok && e.out === 'f\n0', e.err || e.out)
    limpiaRoles()
  }
  const REEJ = [
    ['TRUNCATE concedido despues a heredado (el de Astra, en reejecucion)', `${HER} ${M0DO} grant truncate on public.mercado_cerrojo to heredado;`, /destinatarios ajenos: heredado=TRUNCATE.*authenticated tiene TRUNCATE/],
    ['UPDATE concedido despues a heredado', `${HER} ${M0DO} grant update on public.mercado_cerrojo to heredado;`, /destinatarios ajenos: heredado=UPDATE.*authenticated tiene UPDATE/],
    ['TRIGGER concedido despues a heredado', `${HER} ${M0DO} grant trigger on public.mercado_cerrojo to heredado;`, /destinatarios ajenos: heredado=TRIGGER.*authenticated tiene TRIGGER/],
    ['un grant a PUBLIC', `${M0DO} grant select on public.mercado_cerrojo to public;`, /destinatarios ajenos: PUBLIC=SELECT.*PUBLIC tiene SELECT/],
    ['un grant a un rol que authenticated solo puede tomar con SET ROLE (sin herencia)', `grant solo_set to authenticated with inherit false; ${M0DO} grant delete on public.mercado_cerrojo to solo_set;`, /destinatarios ajenos: solo_set=DELETE.*authenticated tiene DELETE/],
    ['anon miembro de service_role, sin herencia (solo SET ROLE): sin ningun grant ajeno', `${M0DO} grant service_role to anon with inherit false;`, /anon tiene DELETE,INSERT,SELECT/],
    ['service_role miembro del dueño (hereda todo)', `${M0DO} grant postgres to service_role;`, /service_role tiene DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE \(tienen que ser exactamente DELETE,INSERT,SELECT\)/],
    ['service_role con TRUNCATE directo', `${M0DO} grant truncate on public.mercado_cerrojo to service_role;`, /service_role tiene DELETE,INSERT,SELECT,TRUNCATE/],
    ['service_role con MAINTAIN (PostgreSQL 17)', `${M0DO} grant maintain on public.mercado_cerrojo to service_role;`, /service_role tiene DELETE,INSERT,MAINTAIN,SELECT/],
    ['service_role con opcion de conceder', `${M0DO} grant select on public.mercado_cerrojo to service_role with grant option;`, /service_role puede conceder/],
    // E2R5-01 (Astra r5): el dueño con su ACL revocado sigue pudiendo conceder; authenticated o service_role pueden ser el
    ['authenticated puede actuar como el dueño (SET ROLE, sin herencia), con el ACL del dueño revocado (E2R5-01)', `${M0DO} ${DUENO_SIN_ACL} grant dueno_ficticio to authenticated with inherit false, set true;`, /authenticated puede actuar como el dueño \(dueno_ficticio\)/],
    ['service_role puede actuar como el dueño (SET ROLE, sin herencia), con el ACL del dueño revocado (E2R5-01)', `${M0DO} ${DUENO_SIN_ACL} grant dueno_ficticio to service_role with inherit false, set true;`, /service_role puede actuar como el dueño \(dueno_ficticio\)/],
    // E2R5-01 completo (CTO 14-oct)
    ['el dueño cambiado a otro rol, con su ACL', `${M0DO} alter table public.mercado_cerrojo owner to dueno_ficticio;`, /el dueño es dueno_ficticio y no quien ejecuta \(postgres\)/],
    ['el dueño cambiado a otro rol, sin ACL', `${M0DO} ${DUENO_SIN_ACL}`, /el dueño es dueno_ficticio y no quien ejecuta \(postgres\)/],
    ['authenticator miembro del dueño', `${M0DO} grant postgres to authenticator;`, /authenticator puede actuar como el dueño \(postgres\)/],
    ['una cadena de dos niveles hasta el dueño (authenticated → intermedio → dueño, solo SET ROLE)', `${M0DO} grant postgres to intermedio_ficticio with inherit false, set true; grant intermedio_ficticio to authenticated with inherit false, set true;`, /authenticated puede actuar como el dueño \(postgres\)/],
    ['authenticated con BYPASSRLS', `${M0DO} alter role authenticated bypassrls;`, /authenticated tiene BYPASSRLS/],
    ['anon con CREATEROLE', `${M0DO} alter role anon createrole;`, /anon tiene CREATEROLE/],
    ['service_role con CREATEROLE', `${M0DO} alter role service_role createrole;`, /service_role tiene CREATEROLE/],
  ]
  for (const [que, sql, error] of REEJ) {
    const d = monta(sql)
    const a = catalogo(d)
    const r = pg.psql(M0, d)
    oraculo('E2R4-01', `reejecucion con ${que}: aborta, lo lista y no toca nada`, !r.ok && /mercado-000: permisos de public\.mercado_cerrojo NO ACREDITADOS/.test(r.err) && error.test(r.err) && catalogo(d) === a, err1(r))
    limpiaRoles()
  }
  ver('control: tras limpiar, ni anon ni authenticated ni service_role pertenecen a ningun rol', pg.psql(`select count(*) from pg_auth_members m where m.member in ('anon'::regrole, 'authenticated'::regrole, 'service_role'::regrole)`, 'postgres').out === '0')
  {
    // el ACL limpio, con el default ACL de s06: aplica, y el informe lo acredita y lo enseña
    const d = monta()
    const r = pg.psql(M0, d)
    oraculo('E2R4-01', 'limpio: el informe dice los efectivos (PUBLIC, anon y authenticated nada; service_role DELETE,INSERT,SELECT) y ningun destinatario ajeno', r.ok && /^efectivos\|PUBLIC=- · anon=- · authenticated=- · service_role=DELETE,INSERT,SELECT · ajenos=ninguno$/m.test(r.out), r.err || r.out)
    oraculo('E2R4-01', 'limpio: el informe enseña los privilegios por defecto del creador en public (los de s06, que la migracion quita)', r.ok && /^por defecto\|postgres: en public: anon=.*TRUNCATE.*; authenticated=.*; service_role=.* · global: -$/m.test(r.out), r.out)
    const r2 = pg.psql(M0, d)
    oraculo('E2R5-01', 'limpio, con un authenticator como el de Supabase (miembro de los tres roles, no del dueño): el informe dice el dueño, los atributos y que authenticator no puede actuar como el dueño', r.ok && /^roles\|dueño=postgres \(quien ejecuta\) · anon: - · authenticated: - · service_role: BYPASSRLS \(el de Supabase: se informa\) · authenticator: no puede actuar como el dueño$/m.test(r.out), r.out)
    oraculo('E2R4-01', 'reejecucion limpia: el mismo informe', r2.ok && /^efectivos\|PUBLIC=- · anon=- · authenticated=- · service_role=DELETE,INSERT,SELECT · ajenos=ninguno$/m.test(r2.out), r2.err || r2.out)
    const tr = ['anon', 'authenticated'].map(rol => como(rol, `truncate public.mercado_cerrojo;`, d))
    oraculo('E2R4-01', 'anon y authenticated: TRUNCATE denegado', tr.every(x => !x.ok && /permission denied for table mercado_cerrojo/.test(x.err)), tr.map(err1).join(' / '))
  }

  titulo('7 · E2R4-02: reglas de reescritura')
  {
    const d = monta(`${M0DO} create rule no_insert as on insert to public.mercado_cerrojo do instead nothing;`)
    ver('control (Astra): con la regla, el INSERT de service_role «funciona» y no deja fila', pg.psql(`begin; set local role service_role; insert into public.mercado_cerrojo (recurso, dueno, descripcion) values ('mercado/v1', '11111111-2222-4333-8444-555555555555', 'mercado-v1-publica'); select count(*) from public.mercado_cerrojo; rollback;`, d).out === '0')
    const a = catalogo(d)
    const r = pg.psql(M0, d)
    oraculo('E2R4-02', 'reejecucion con una regla DO INSTEAD NOTHING: aborta «tiene reglas» y no toca nada', !r.ok && /otra forma \(.*tiene reglas de reescritura/.test(r.err) && catalogo(d) === a && pg.psql(`select count(*) from pg_rewrite where ev_class = 'public.mercado_cerrojo'::regclass`, d).out === '1', err1(r))
  }
} finally { pg.cierra() }
fin()
