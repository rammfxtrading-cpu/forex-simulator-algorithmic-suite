/**
 * sim-004a-preparatoria y sim-004a-puerta · ENSAYO EN POSTGRESQL 17 LOCAL (etapa 1)
 *
 * Montaje: produccion segun s04 LITERAL (estado-s04.mjs) + sql/sim-002 + sql/sim-003, aplicadas
 * por un ejecutor como el postgres de produccion segun s06: NO superusuario, bypassrls, createrole,
 * miembro con admin de anon/authenticated/service_role, dueño de public y con el default ACL
 * literal de s06 (tablas, secuencias y funciones nuevas: todo a los tres roles). Datos INVENTADOS.
 * Las escrituras «de PostgREST» se emulan con SET LOCAL ROLE + request.jwt.claims +
 * request.headers (k.4 b midio que PostgREST 13.0.8 y 16.4 dan lo mismo). Nada toca Supabase.
 *
 *   1 aplicar (estado 0 → 1), reejecutar (mismo informe y catalogo), y lo que lo para:
 *     un disparador de mas antes, a medias, nombre ocupado
 *   2 sim-003 despues (o.1): sin error, mismo informe, catalogo identico; mutante
 *   3 registro A/B: varias filas, varias sentencias, una transaccion; delta, columnas, pnl,
 *     INSERT de sesion (o.2); contexto normalizado y SET LOCAL + COMMIT / ROLLBACK (l.4)
 *   4 inmutabilidad (UPDATE, DELETE, TRUNCATE del dueño) e INSERT a mano (profundidad 1)
 *   5 matriz efectiva de privilegios (tablas, secuencias, funciones; PUBLIC y los tres)
 *   6 cascadas: borrado de sesion, de perfil y de auth.users con las FK reales; sim_borrar_alumno
 *   7 cierre atomico: total, parcial, {error} sin efectos, claves no admitidas, quien lo ejecuta
 *   8 canonica y parejas (o.0, o.4): cada uno de los 16 campos cambia el hash; NULL ≠ ''
 *   9 guarda final del catalogo (m.5.5, S4R5-02, S4R6-02): B antes que A, sin B, A
 *     deshabilitado, disparador de mas, cuerpo cambiado, grant de mas (de tabla y de columna,
 *     E1-05), columna de mas; y el
 *     control funcional aparte (B no falla con una fila anterior)
 *  10 la puerta: el cliente antiguo rechazado en las dos mitades, firmado / service_role /
 *     dueño pasan; reejecutar puerta y preparatoria en el estado 2; puerta alterada
 * ⚠️ No prueba el editor de Supabase ni PostgREST de verdad (eso lo midio k.4 b).
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { titulo, ver, oraculo, fin, REPO } from './lib.mjs'
import { BIN, hayPostgres, cluster } from './pg-ensayo.mjs'
import { PRODUCCION } from './estado-s04.mjs'
if (!hayPostgres()) { ver(`PostgreSQL 17 en ${BIN}: NO hay, la prueba no se ha ejecutado`, false); fin() }
const lee = p => readFileSync(path.join(REPO, p), 'utf8')
const PREP = lee('sql/sim-004a-preparatoria.sql')
const PUERTA = lee('sql/sim-004a-puerta.sql')
const S3 = lee('sql/sim-003-persistencia-aditiva.sql')
const S2 = lee('sql/sim-002-lectura-estable.sql')
const pg = cluster()
// la base por defecto de las ordenes es la del ensayo, p (la de pg-ensayo.mjs es sim)
const psqlEn = pg.psql
pg.psql = (q, db = 'p') => psqlEn(q, db)

// ── el ejecutor no superusuario (s06) ─────────────────────────────────────
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
const pgx = (texto, db = 'p') => {
  const f = path.join(pg.dir, 'x.sql'); writeFileSync(f, texto)
  const r = spawnSync(path.join(BIN, 'psql'), ['-h', pg.dir, '-p', pg.puerto, '-U', 'pgx', '-X', '-q', '-tA', '-F', '|', '-v', 'ON_ERROR_STOP=1', '-d', db, '-f', f],
    { encoding: 'utf8', env: { PATH: process.env.PATH, LC_ALL: 'en_US.UTF-8', LANG: 'en_US.UTF-8' } })
  return { ok: r.status === 0, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() }
}
const err1 = r => (r.err.split('\n').find(l => /ERROR/.test(l)) || r.err.split('\n')[0] || '').replace(/^.*ERROR:\s+/, '')
const fin1 = r => r.out.split('\n').filter(Boolean).at(-1)
const uno = (q, db = 'p') => pg.psql(q, db).out
const n = (q, db = 'p') => Number(uno(q, db))

// ── datos inventados ──────────────────────────────────────────────────────
const u = k => `00000000-0000-4000-8000-${String(k).padStart(12, '0')}`
const A = u(1), B = u(2), C = u(3)
const SA = u(101), SB = u(102), SA2 = u(103), SC = u(104), SH = u(105)
const DATOS = `
insert into auth.users values ('${A}'), ('${B}'), ('${C}');
insert into public.profiles (id, email, plan, simulador_activo) values ('${A}', 'a@ejemplo.test', 'basic', true), ('${B}', 'b@ejemplo.test', 'basic', true), ('${C}', 'c@ejemplo.test', 'basic', true);
insert into public.sim_sessions (id, user_id, name, pair, timeframe, date_from, date_to, capital, balance) values
  ('${SA}', '${A}', 'a', 'EURUSD', 'H1', '2026-01-01', '2026-02-01', 10000, 10000),
  ('${SB}', '${B}', 'b', 'EURUSD', 'H1', '2026-01-01', '2026-02-01', 10000, 10000),
  ('${SA2}', '${A}', 'a2', 'EURUSD', 'H1', '2026-01-01', '2026-02-01', 10000, 10000),
  ('${SC}', '${C}', 'c', 'EURUSD', 'H1', '2026-01-01', '2026-02-01', 10000, 10000);
insert into public.sim_sessions (id, user_id, name, pair, timeframe, date_from, date_to, capital, balance, challenge_parent_id) values
  ('${SH}', '${C}', 'c hija', 'EURUSD', 'H1', '2026-01-01', '2026-02-01', 10000, 10000, '${SC}');
insert into public.sim_trades (session_id, user_id, pair, side, entry_price, lots, pnl, opened_at) values
  ('${SC}', '${C}', 'EURUSD', 'BUY', 1.1, 1, 5, now()), ('${SH}', '${C}', 'EURUSD', 'BUY', 1.1, 1, 6, now());`
const L = v => (v == null ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`)

// una escritura «de PostgREST»: rol del JWT, sub y cabeceras, en su propia transaccion
const FIRMADO = 'etapa1-1'
const escribe = ({ rol = 'authenticated', sub = A, cliente, claims, headers } = {}, q, db = 'p') => {
  const cl = claims !== undefined ? claims : JSON.stringify({ role: rol, sub })
  const he = headers !== undefined ? headers : JSON.stringify(cliente === undefined ? { 'user-agent': 'x' } : { 'x-sim-cliente': cliente })
  return pg.psql(`begin; set local role ${rol}; select set_config('request.jwt.claims', ${L(cl)}, true), set_config('request.jwt.claim.sub', ${L(sub)}, true), set_config('request.headers', ${L(he)}, true) \\g /dev/null
${q}
commit;`, db)
}
const viejo = (q, sub = A, db = 'p') => escribe({ sub }, q, db)              // cliente v0: sin cabecera
const nuevo = (q, sub = A, db = 'p') => escribe({ sub, cliente: FIRMADO }, q, db)
const registro = (db = 'p', desdeId = 0) => pg.psql(`select e.tabla||' '||e.operacion||' '||coalesce(e.session_id::text,'-')||' cols='||array_to_string(e.columnas, ',')||' delta='||coalesce(trim_scale(e.delta)::text,'-')
  ||' pnl='||coalesce(trim_scale(e.pnl)::text,'-')||' trade='||(e.trade_id is not null)||' cli='||e.cliente||' jwt='||coalesce(e.rol_jwt,'NULL')||' guc='||coalesce(e.rol_guc,'NULL')
  ||' marca='||(select count(*) from public.sim_escrituras_v0_marcas m where m.escritura_id = e.id) from public.sim_escrituras_v0 e where e.id > ${desdeId} order by e.id`, db).out.split('\n').filter(Boolean)
const ultimo = (db = 'p') => n('select coalesce(max(id), 0) from public.sim_escrituras_v0', db)
// las filas registradas despues del id k (los ROLLBACK dejan huecos en la identidad: por id, nunca por posicion)
const desde = (k, db = 'p') => registro(db, k)

// ── la foto del catalogo (multiconjunto ordenado) ─────────────────────────
const FOTO = `select md5(string_agg(x, E'\\n' order by x collate "C")) from (
  select 'rel '||n.nspname||'.'||c.relname||' '||c.relkind::text||' '||coalesce(c.relacl::text,'-')||' '||c.relrowsecurity||' '||pg_get_userbyid(c.relowner) x
    from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname in ('public', 'auth')
  union all select 'att '||a.attrelid::regclass||'.'||a.attname||' '||format_type(a.atttypid, a.atttypmod)||' '||a.attnotnull||' '||a.attnum
    from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and a.attnum > 0 and not a.attisdropped
  union all select 'con '||k.conrelid::regclass||'.'||k.conname||' '||pg_get_constraintdef(k.oid)||' '||k.convalidated
    from pg_constraint k join pg_namespace n on n.oid = k.connamespace where n.nspname = 'public'
  union all select 'idx '||pg_get_indexdef(i.indexrelid) from pg_index i join pg_class c on c.oid = i.indexrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public'
  union all select 'trg '||t.tgrelid::regclass||' '||case when t.tgisinternal then coalesce(k.conname, '?')||' '||t.tgfoid::regproc::text else pg_get_triggerdef(t.oid) end||' '||t.tgenabled::text
    from pg_trigger t left join pg_constraint k on k.oid = t.tgconstraint join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public'
  union all select 'fun '||p.oid::regprocedure||' '||md5(p.prosrc)||' '||p.prosecdef||' '||coalesce(p.proconfig::text,'-')||' '||coalesce(p.proacl::text,'-')
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'
  union all select 'pol '||schemaname||'.'||tablename||'.'||policyname||' '||cmd||' '||roles::text||' '||coalesce(qual,'-')||' '||coalesce(with_check,'-') from pg_policies) s`
const foto = (db = 'p') => uno(FOTO, db)

// ── montajes ──────────────────────────────────────────────────────────────
const monta = (db, { datos = true, s3 = true } = {}) => {
  const c = pg.psql(`create database ${db}`, 'postgres')
  const r = pg.psql(PRODUCCION, db), r2 = pg.psql(S2, db), e = pg.psql(EJECUTOR, db)
  const r3 = s3 ? pgx(S3, db) : { ok: true }
  const d = datos ? pg.psql(DATOS, db) : { ok: true }
  if (![c, r, r2, e, r3, d].every(x => x.ok)) throw new Error(`montaje ${db}: ${[c, r, r2, e, r3, d].map(x => x.err).join(' ')}`)
  return r3
}

try {
  pg.arranca()

  // ═══════════════════════════════════════════════════════════════════════
  titulo('1 · aplicar (estado 0 → 1), reejecutar, y lo que lo para')
  const s3primera = monta('p')
  ver('montaje: s04 literal + sim-002 + sim-003 aplicada por pgx (no superusuario), FIN', /FIN\|sim-003 aplicada$/.test(fin1(s3primera)))
  ver('pgx: no superusuario, bypassrls, createrole (s06)', uno(`select rolsuper||','||rolbypassrls||','||rolcreaterole from pg_roles where rolname = 'pgx'`) === 'false,true,true')
  const foto0 = foto()
  const ap1 = pgx(PREP)
  oraculo('E1-aplica', 'la preparatoria se aplica entera como pgx y acaba en FIN | sim-004a-preparatoria aplicada',
    ap1.ok && fin1(ap1) === 'FIN|sim-004a-preparatoria aplicada', err1(ap1) || fin1(ap1))
  oraculo('E1-informe', 'informe: estado «registro instalado», 3 tablas con RLS, 7 funciones, sim_servicio sin mantenimiento y version 1',
    /^estado\|registro instalado$/m.test(ap1.out) && (ap1.out.match(/^tabla\|.* rls=true/gm) || []).length === 3
    && (ap1.out.match(/^funcion\|/gm) || []).length === 7 && /^sim_servicio\|mantenimiento=false · version_minima=1$/m.test(ap1.out), ap1.out.split('\n').length + ' lineas')
  const foto1 = foto()
  const ap2 = pgx(PREP)
  oraculo('E1-reejecuta', 'segunda ejecucion: FIN, el mismo informe, el catalogo identico (y distinto del de antes de aplicar)',
    ap2.ok && fin1(ap2) === 'FIN|sim-004a-preparatoria aplicada' && ap2.out === ap1.out && foto() === foto1 && foto1 !== foto0, err1(ap2))
  pg.psql(`update public.sim_servicio set mantenimiento = true, version_minima = '7'`, 'p')
  const ap3 = pgx(PREP)
  oraculo('E1-servicio-intacto', 'reejecutar no toca la fila de sim_servicio (el dueño activo el mantenimiento)',
    ap3.ok && uno(`select mantenimiento||','||version_minima from public.sim_servicio`) === 'true,7', err1(ap3))
  pg.psql(`update public.sim_servicio set mantenimiento = false, version_minima = '1'`, 'p')

  monta('p0')
  pgx(`create function public.otro_disp() returns trigger language plpgsql as $$ begin return new; end $$;
       create trigger zz_otro after update on public.sim_sessions for each row execute function public.otro_disp();`, 'p0')
  const foto0b = foto('p0')
  const x0 = pgx(PREP, 'p0')
  oraculo('E1-estado0-exacto', 'un disparador de mas en sim_sessions ANTES de la preparatoria → aborta con «sim-004a: …» y no crea nada',
    !x0.ok && /sim-004a: los disparadores no son los del estado 0/.test(err1(x0)) && foto('p0') === foto0b, err1(x0).slice(0, 160))
  monta('pm')
  pgx(PREP, 'pm'); pgx('drop table public.sim_servicio;', 'pm')
  const fotoM = foto('pm'), xm = pgx(PREP, 'pm')
  oraculo('E1-a-medias', 'a medias (sin sim_servicio) → aborta y no toca nada', !xm.ok && /A MEDIAS/.test(err1(xm)) && foto('pm') === fotoM, err1(xm))
  monta('po')
  pg.psql('create schema otro; create table otro.sim_servicio (x int);', 'po')
  const fotoO = foto('po'), xo = pgx(PREP, 'po')
  oraculo('E1-nombre-ocupado', 'un nombre ocupado en otro esquema → aborta y no crea nada', !xo.ok && /nombre ocupado: otro\.sim_servicio/.test(err1(xo)) && foto('po') === fotoO, err1(xo))
  monta('ps', { s3: false })
  const xs = pgx(PREP, 'ps')
  oraculo('E1-sin-sim003', 'sin sim-003 aplicada → aborta', !xs.ok && /sim-003 no esta aplicada/.test(err1(xs)), err1(xs))

  // ═══════════════════════════════════════════════════════════════════════
  titulo('2 · sim-003 despues de la preparatoria (o.1, k.1 c)')
  const sucesion = (db, prep) => {
    const s3a = monta(db)
    const p = pgx(prep, db)
    const antes = foto(db)
    const s3b = pgx(S3, db)
    return { prep: p.ok && fin1(p) === 'FIN|sim-004a-preparatoria aplicada' && uno(`select to_regclass('public.sim_escrituras_v0') is not null`, db) === 't', ok: s3b.ok, mismoInforme: s3b.ok && s3b.out === s3a.out, mismoCatalogo: foto(db) === antes, err: err1(s3b) || err1(p) }
  }
  const su = sucesion('q', PREP)
  oraculo('E2-sim003-inofensiva', 'tras la preparatoria, sim-003 termina SIN error, con el mismo informe (FIN | sim-003 aplicada) y el catalogo identico',
    su.prep && su.ok && su.mismoInforme && su.mismoCatalogo, JSON.stringify(su))
  // mutante: una preparatoria que cambia un objeto de sim-003 (lo que hara sim-004b)
  const MUT = PREP + `\nALTER TABLE public.sim_sessions DROP CONSTRAINT sim_sessions_terminal_valida,
  ADD CONSTRAINT sim_sessions_terminal_valida CHECK (terminal IS NULL OR terminal IN ('borrada', 'revocada', 'superado'));\nselect 'FIN', 'sim-004a-preparatoria aplicada';\n`
  const sm = sucesion('qm', MUT)
  oraculo('E2-mutante-se-ve', 'mutante «la preparatoria cambia sim_sessions_terminal_valida»: sim-003 aborta con su error prefijado → el oraculo E2 se pondria en ROJO',
    sm.prep && !sm.ok && /sim-003: la restriccion sim_sessions\.sim_sessions_terminal_valida/.test(sm.err) && sm.mismoCatalogo, sm.err.slice(0, 120))
  // (el mutante deja el catalogo tal cual porque sim-003 aborta entero: no prueba nada mas)

  // ═══════════════════════════════════════════════════════════════════════
  titulo('3 · registro A/B: varias filas, varias sentencias, una transaccion (m.1, n.7, o.2)')
  let k = ultimo()
  const CASOS = [
    ['parcial pnl 0: {balance} mismo valor', `update public.sim_sessions set balance = 10000 where id = '${SA}';`, 'cols= delta=0', 1],
    ['pausa: {balance, last_timestamp}', `update public.sim_sessions set balance = 10000, last_timestamp = 1767600000 where id = '${SA}';`, 'cols=last_timestamp delta=0', 1],
    ['salida: {last_timestamp, balance, timeframe}', `update public.sim_sessions set last_timestamp = 1767600060, balance = 10000, timeframe = 'H1' where id = '${SA}';`, 'cols=last_timestamp delta=0', 1],
    ['cierre total pnl 0: {balance, last_timestamp}', `update public.sim_sessions set balance = 10000, last_timestamp = 1767600120 where id = '${SA}';`, 'cols=last_timestamp delta=0', 1],
    ['guardado: {last_timestamp, timeframe}', `update public.sim_sessions set last_timestamp = 1767600180, timeframe = 'H1' where id = '${SA}';`, 'cols=last_timestamp delta=0', 0],
    ['TF: {timeframe}', `update public.sim_sessions set timeframe = 'M5' where id = '${SA}';`, 'cols=timeframe delta=0', 0],
    ['{balance} +12,34', `update public.sim_sessions set balance = 10012.34 where id = '${SA}';`, 'cols=balance delta=12.34', 1]]
  const marcas = []
  for (const [desc, q, esperado, m] of CASOS) {
    const r = viejo(q)
    const filas = desde(k); k = ultimo()
    const bien = r.ok && filas.length === 1 && filas[0].includes(esperado) && filas[0].endsWith(`marca=${m}`) && filas[0].includes('cli=sin-firma jwt=authenticated guc=authenticated')
    marcas.push(bien ? (m ? 'T' : 'F') : '?')
    oraculo('E3-' + marcas.length, desc + ` → ${esperado}, marca ${m ? 'si' : 'no'}`, bien, filas.join(' / ') || err1(r))
  }
  let r = viejo(`update public.sim_sessions set balance = balance where user_id = '${A}';`)
  let filas = desde(k); k = ultimo()
  oraculo('E3-varias-filas-balance', 'una sentencia sobre 2 filas SET balance = balance → 2 filas, 2 marcas', r.ok && filas.length === 2 && filas.every(f => f.endsWith('marca=1')), filas.join(' / '))
  r = viejo(`update public.sim_sessions set timeframe = 'H4' where user_id = '${A}';`)
  filas = desde(k); k = ultimo()
  oraculo('E3-varias-filas-tf', 'una sentencia sobre 2 filas SET timeframe → 2 filas, 0 marcas', r.ok && filas.length === 2 && filas.every(f => f.endsWith('marca=0')), filas.join(' / '))
  r = viejo(`update public.sim_sessions set timeframe = 'H1' where id = '${SA}'; update public.sim_sessions set balance = balance where id = '${SA}';`)
  filas = desde(k); k = ultimo()
  oraculo('E3-dos-sentencias', 'una transaccion: 1.ª sin balance, 2.ª con balance, misma sesion → marca no, si (cada una en su fila)',
    r.ok && filas.length === 2 && filas[0].endsWith('marca=0') && filas[1].endsWith('marca=1'), filas.join(' / '))
  console.log(`    marcas de los 7 cuerpos v0: ${marcas.join('')} (se espera TTTTFFT)`)
  oraculo('E3-marcas-misma-xact', 'cada marca en la transaccion de su fila (0 en una ajena), sin huerfanas ni duplicadas',
    n(`select count(*) from public.sim_escrituras_v0_marcas`) >= 8 &&
    n(`select count(*) from public.sim_escrituras_v0_marcas m left join public.sim_escrituras_v0 e on e.id = m.escritura_id where e.id is null or e.xact is distinct from m.xact`) === 0
    && n(`select count(*) from (select escritura_id from public.sim_escrituras_v0_marcas group by 1 having count(*) > 1) d`) === 0)
  r = nuevo(`insert into public.sim_sessions (id, user_id, name, pair, timeframe, date_from, date_to, capital, balance) values ('${u(201)}', '${A}', 'n', 'EURUSD', 'H1', '2026-01-01', '2026-02-01', 5000, 5000), ('${u(202)}', '${A}', 'n2', 'EURUSD', 'H1', '2026-01-01', '2026-02-01', 5000, 5100);`)
  filas = desde(k); k = ultimo()
  oraculo('E3-insert-sesion', 'INSERT de sesion: delta = balance − capital (0 y 100), la fila entera como nombres, firmado',
    r.ok && filas.length === 2 && /delta=0 .*cli=etapa1-1/.test(filas[0]) && /delta=100 /.test(filas[1]) && /cols=.*balance.*capital.*user_id/.test(filas[0]), filas.join(' / ') || err1(r))
  r = viejo(`insert into public.sim_trades (id, session_id, user_id, pair, side, entry_price, lots, pnl, notes, opened_at) values ('${u(301)}', '${SA}', '${A}', 'EURUSD', 'BUY', 1.1, 1, -7.5, 'secreto del alumno', now());`)
  filas = desde(k); k = ultimo()
  oraculo('E3-insert-trade', 'INSERT de trade: id y pnl; columnas por NOMBRE, nunca el texto de notes (m.4)',
    r.ok && filas.length === 1 && /pnl=-7.5 trade=true/.test(filas[0]) && /notes/.test(filas[0])
    && uno(`select count(*) from public.sim_escrituras_v0 where columnas::text like '%secreto%'`) === '0', filas.join(' / '))
  r = viejo(`update public.sim_trades set notes = 'otra' where id = '${u(301)}';`)
  filas = desde(k); k = ultimo()
  oraculo('E3-update-trade', 'UPDATE de trade: columnas cambiadas {notes}, trade_id, sin pnl ni delta', r.ok && filas.length === 1 && /UPDATE .* cols=notes delta=- pnl=- trade=true/.test(filas[0]), filas.join(' / '))
  // contexto normalizado (l.4)
  r = escribe({ headers: '' }, `update public.sim_sessions set timeframe = 'M1' where id = '${SA}';`)
  filas = desde(k); k = ultimo()
  oraculo('E3-cabeceras-vacias', "request.headers = '' → sin-firma, sin error", r.ok && filas.length === 1 && /cli=sin-firma jwt=authenticated/.test(filas[0]), filas.join(' / ') || err1(r))
  r = escribe({ cliente: '' }, `update public.sim_sessions set timeframe = 'M5' where id = '${SA}';`)
  filas = desde(k); k = ultimo()
  oraculo('E3-cabecera-vacia', "x-sim-cliente = '' → sin-firma (ausente y vacia son lo mismo)", r.ok && filas.length === 1 && /cli=sin-firma/.test(filas[0]), filas.join(' / ') || err1(r))
  r = escribe({ claims: '' }, `update public.sim_sessions set timeframe = 'M1' where id = '${SA}';`)
  filas = desde(k); k = ultimo()
  oraculo('E3-claims-vacios', "request.jwt.claims = '' → rol_jwt NULL, sin error", r.ok && filas.length === 1 && /jwt=NULL guc=authenticated/.test(filas[0]), filas.join(' / ') || err1(r))
  r = pg.psql(`begin; set local role authenticated; select set_config('request.jwt.claims', '{"role":"authenticated","sub":"${A}"}', true), set_config('request.jwt.claim.sub', '${A}', true), set_config('request.headers', '{"x-sim-cliente":"etapa1-1"}', true) \\g /dev/null
update public.sim_sessions set timeframe = 'H1' where id = '${SA}';
commit;
update public.sim_sessions set timeframe = 'M5' where id = '${SA}';
begin; set local role authenticated; select set_config('request.headers', '{"x-sim-cliente":"etapa1-1"}', true) \\g /dev/null
rollback;
update public.sim_sessions set timeframe = 'H1' where id = '${SA}';`)
  filas = desde(k); k = ultimo()
  oraculo('E3-set-local-commit-rollback', 'misma conexion: tras SET LOCAL + COMMIT y tras ROLLBACK, la escritura del dueño sin contexto se registra (rol_jwt NULL, guc none: anomalia) y no falla',
    r.ok && filas.length === 3 && /cli=etapa1-1/.test(filas[0]) && /cli=sin-firma jwt=NULL guc=none/.test(filas[1]) && /cli=sin-firma jwt=NULL guc=none/.test(filas[2]), filas.join(' / ') || err1(r))
  r = escribe({ rol: 'service_role', sub: A }, `update public.sim_sessions set balance = balance + 1 where id = '${SB}';`)
  filas = desde(k); k = ultimo()
  oraculo('E3-service-role', 'service_role sin cabecera: registrado con su rol (no es «sin firma de alumno»)', r.ok && filas.length === 1 && /jwt=service_role guc=service_role marca=1/.test(filas[0]), filas.join(' / ') || err1(r))

  // ═══════════════════════════════════════════════════════════════════════
  titulo('4 · inmutabilidad e INSERT a mano (n.7, n.9)')
  for (const t of ['sim_escrituras_v0', 'sim_escrituras_v0_marcas']) {
    const up = pgx(`update public.${t} set xact = 'x' where id = (select min(id) from public.${t});`)
    const de = pgx(`delete from public.${t} where id = (select min(id) from public.${t});`)
    const tr = pgx(`truncate public.${t};`)
    oraculo('E4-inmutable-' + t, `${t}: UPDATE, DELETE y TRUNCATE del dueño, rechazados con «sim_escrituras_v0: … es inmutable»`,
      [up, de, tr].every(x => !x.ok && /sim_escrituras_v0: .* es inmutable/.test(err1(x))), [up, de, tr].map(err1).join(' | ').slice(0, 200))
  }
  const insR = pgx(`insert into public.sim_escrituras_v0 (session_id, user_id, tabla, operacion, xact, cliente, columnas, en) values ('${SA}', '${A}', 'sim_trades', 'INSERT', '1', 'sin-firma', '{}', now());`)
  const insM = pgx(`insert into public.sim_escrituras_v0_marcas (escritura_id, xact) values (1, '1');`)
  const insD = pgx(`do $$ begin insert into public.sim_escrituras_v0_marcas (escritura_id, xact) values (1, '1'); end $$;`)
  oraculo('E4-insert-a-mano', 'INSERT a mano del dueño en las dos tablas, y desde un DO (profundidad 1) → rechazado',
    [insR, insM, insD].every(x => !x.ok && /solo inserta su disparador \(profundidad 1\)/.test(err1(x))), [insR, insM, insD].map(err1).join(' | ').slice(0, 200))
  const supUp = pg.psql(`update public.sim_escrituras_v0 set xact = 'x' where id = 1;`)
  oraculo('E4-superusuario', 'tambien el superusuario de initdb choca con el disparador (no es un permiso: es la regla)', !supUp.ok && /inmutable/.test(supUp.err))

  // ═══════════════════════════════════════════════════════════════════════
  titulo('5 · matriz efectiva de privilegios (l.4, n.7, o.5)')
  pg.psql(`do $r$ begin if not exists (select 1 from pg_roles where rolname = 'cualquiera') then create role cualquiera nologin; end if; end $r$;`)
  const ROLES = ['anon', 'authenticated', 'service_role', 'cualquiera']
  const matriz = uno(`select string_agg(x, ' ' order by x) from (
    select r||':'||t||':'||p||'='||has_table_privilege(r, 'public.'||t, p) x from unnest(array[${ROLES.map(L)}]) r,
      unnest(array['sim_escrituras_v0','sim_escrituras_v0_marcas','sim_servicio']) t, unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p
    union all select r||':'||s||':'||p||'='||has_sequence_privilege(r, 'public.'||s, p) from unnest(array[${ROLES.map(L)}]) r,
      unnest(array['sim_escrituras_v0_id_seq','sim_escrituras_v0_marcas_id_seq']) s, unnest(array['USAGE','SELECT','UPDATE']) p
    union all select r||':'||f||':EXECUTE='||has_function_privilege(r, ('public.'||f)::regprocedure, 'EXECUTE') from unnest(array[${ROLES.map(L)}]) r,
      unnest(array['sim_cierre_v0(uuid,numeric,bigint,jsonb)','sim_escrituras_v0_registra()','sim_escrituras_v0_marca_balance()','sim_escrituras_v0_inmutable()',
                   'sim_escrituras_v0_solo_disparador()','sim_escrituras_v0_parejas(uuid)','sim_escrituras_v0_canonico(uuid)']) f) m`).split(' ')
  const verdaderos = matriz.filter(x => x.endsWith('=true'))
  oraculo('E5-matriz', 'de 4 roles × (3 tablas × 7 + 2 secuencias × 3 + 7 funciones): solo SELECT de sim_servicio (authenticated y service_role, o.12) y EXECUTE de sim_cierre_v0 (authenticated)',
    matriz.length === 4 * (21 + 6 + 7) && verdaderos.join(' ') === 'authenticated:sim_cierre_v0(uuid,numeric,bigint,jsonb):EXECUTE=true authenticated:sim_servicio:SELECT=true service_role:sim_servicio:SELECT=true',
    `${matriz.length} casillas · verdaderas: ${verdaderos.join(' ')}`)
  const acl = uno(`select count(*) from (
    select a.grantee from pg_class c, aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
     where c.oid in ('public.sim_escrituras_v0'::regclass, 'public.sim_escrituras_v0_marcas'::regclass, 'public.sim_servicio'::regclass,
                     'public.sim_escrituras_v0_id_seq'::regclass, 'public.sim_escrituras_v0_marcas_id_seq'::regclass)
       and a.grantee not in (c.relowner, 'authenticated'::regrole)
       and not (a.grantee = 'service_role'::regrole and c.relname = 'sim_servicio' and a.privilege_type = 'SELECT')
    union all select a.grantee from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
     where (p.proname like 'sim\\_escrituras\\_v0\\_%' or p.proname = 'sim_cierre_v0') and a.grantee not in (p.proowner, 'authenticated'::regrole)) g`)
  oraculo('E5-public', 'ningun receptor mas (PUBLIC incluido) en tablas, secuencias y funciones nuevas', acl === '0', acl)
  // ronda 2 (CTO 13-oct, Astra E1-05): tambien por COLUMNA. Privilegios efectivos de cada columna (con herencia) para
  // PUBLIC, los tres roles y uno cualquiera, y ninguna ACL de columna (pg_attribute.attacl) en las tablas nuevas ni en
  // sim_sessions/sim_trades
  const colMatriz = uno(`select string_agg(x, ' ' order by x) from (
    select r||':'||c.relname||'.'||a.attname||':'||p||'='||has_column_privilege(r, c.oid, a.attnum, p) x
      from unnest(array['public', ${ROLES.map(L)}]) r, pg_class c join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped,
           unnest(array['SELECT','INSERT','UPDATE','REFERENCES']) p
     where c.oid in ('public.sim_escrituras_v0'::regclass, 'public.sim_escrituras_v0_marcas'::regclass, 'public.sim_servicio'::regclass)) m`).split(' ')
  const colVerdad = colMatriz.filter(x => x.endsWith('=true'))
  const colsServicio = uno(`select count(*) from pg_attribute where attrelid = 'public.sim_servicio'::regclass and attnum > 0 and not attisdropped`)
  const attacl = uno(`select count(*) from pg_attribute a where a.attrelid in ('public.sim_escrituras_v0'::regclass, 'public.sim_escrituras_v0_marcas'::regclass,
    'public.sim_servicio'::regclass, 'public.sim_sessions'::regclass, 'public.sim_trades'::regclass) and a.attnum > 0 and coalesce(cardinality(a.attacl), 0) > 0`)
  oraculo('E5-columnas', 'por columna (5 receptores × columnas de las 3 tablas × SELECT/INSERT/UPDATE/REFERENCES): solo SELECT de cada columna de sim_servicio para authenticated y service_role; y ninguna ACL de columna en las 3 tablas ni en sim_sessions/sim_trades',
    colMatriz.length > 100 && colVerdad.length === 2 * Number(colsServicio) && colVerdad.every(x => /^(authenticated|service_role):sim_servicio\.[a-z_]+:SELECT=true$/.test(x)) && attacl === '0',
    `${colMatriz.length} casillas · verdaderas ${colVerdad.length} (sim_servicio tiene ${colsServicio} columnas) · attacl ${attacl}`)
  const intentos = [
    escribe({}, 'select count(*) from public.sim_escrituras_v0;'), escribe({ rol: 'service_role' }, 'select count(*) from public.sim_escrituras_v0;'),
    escribe({}, 'select count(*) from public.sim_escrituras_v0_marcas;'), escribe({}, `update public.sim_servicio set mantenimiento = true;`),
    escribe({ rol: 'service_role' }, `update public.sim_servicio set mantenimiento = true;`), escribe({ rol: 'anon' }, 'select count(*) from public.sim_servicio;'),
    escribe({}, `select public.sim_escrituras_v0_canonico('${SA}');`)]
  oraculo('E5-intentos', 'de verdad: authenticated y service_role no leen el registro; nadie escribe sim_servicio; anon no la lee; canonico no se ejecuta',
    intentos.every(x => !x.ok && /permission denied/.test(x.err)), intentos.map(x => x.ok ? 'PASA' : 'denegado').join(','))
  const lect = escribe({}, 'select mantenimiento||\',\'||version_minima from public.sim_servicio;')
  const lectSR = escribe({ rol: 'service_role' }, 'select mantenimiento::text from public.sim_servicio;')
  const escSR = [escribe({ rol: 'service_role' }, `insert into public.sim_servicio values (true, true, '1', now());`), escribe({ rol: 'service_role' }, 'delete from public.sim_servicio;'),
    escribe({ rol: 'service_role' }, 'truncate public.sim_servicio;')]
  oraculo('E5-servicio-lectura', 'authenticated y service_role leen sim_servicio (una fila); service_role no la escribe (INSERT, DELETE, TRUNCATE denegados)',
    lect.ok && lect.out === 'false,1' && lectSR.ok && lectSR.out === 'false' && escSR.every(x => !x.ok && /permission denied/.test(x.err)), `${lect.out} · ${lectSR.out || err1(lectSR)} · ${escSR.map(x => x.ok ? 'PASA' : 'denegado')}`)

  // ═══════════════════════════════════════════════════════════════════════
  titulo('6 · cascadas con las FK reales (sesion, perfil, auth.users, sim_borrar_alumno)')
  k = ultimo()
  r = viejo(`delete from public.sim_sessions where id = '${SC}';`, C)
  filas = desde(k); k = ultimo()
  oraculo('E6-borra-padre', 'DELETE de una sesion padre: su DELETE, el de su trade (misma xact) y el UPDATE de la hija (SET NULL, sin marca)',
    r.ok && filas.length === 3 && filas.some(f => /^sim_sessions DELETE/.test(f)) && filas.some(f => /^sim_trades DELETE/.test(f)) && filas.some(f => /^sim_sessions UPDATE .*cols=challenge_parent_id .*marca=0/.test(f))
    && n(`select count(distinct xact) from public.sim_escrituras_v0 where id in (select id from public.sim_escrituras_v0 order by id desc limit 3)`) === 1, filas.join(' / ') || err1(r))
  r = pg.psql(`delete from public.profiles where id = '${C}';`)
  filas = desde(k); k = ultimo()
  oraculo('E6-borra-perfil', 'DELETE del perfil (profiles → sim_sessions → sim_trades, FK de sim-003): sin error, cada fila registrada',
    r.ok && filas.length === 2 && filas.every(f => /DELETE/.test(f)) && n(`select count(*) from public.sim_sessions where user_id = '${C}'`) === 0, filas.join(' / ') || err1(r))
  r = pg.psql(`delete from auth.users where id = '${B}';`)
  filas = desde(k); k = ultimo()
  oraculo('E6-borra-usuario', 'DELETE de auth.users (lo que hace el hub): las dos rutas en cascada, sin error', r.ok && filas.length === 1 && /^sim_sessions DELETE/.test(filas[0]), filas.join(' / ') || err1(r))
  pg.psql(`insert into auth.users values ('${u(9)}'); insert into public.profiles (id, email, simulador_activo) values ('${u(9)}', 'z@ejemplo.test', true);
    insert into public.sim_sessions (id, user_id, name, pair, timeframe, date_from, date_to) values ('${u(109)}', '${u(9)}', 'z', 'EURUSD', 'H1', '2026-01-01', '2026-02-01');
    insert into public.sim_trades (session_id, user_id, pair, side, entry_price, lots, pnl, opened_at) values ('${u(109)}', '${u(9)}', 'EURUSD', 'BUY', 1.1, 1, 1, now());`)
  k = ultimo()
  r = escribe({ rol: 'service_role' }, `select public.sim_borrar_alumno('${u(9)}');`)
  filas = desde(k); k = ultimo()
  oraculo('E6-sim-borrar-alumno', 'sim_borrar_alumno (sim-003, DEFINER): borra con el registro activo, sin error', r.ok && filas.length >= 2 && /"ok": true/.test(r.out), filas.join(' / ') || err1(r))

  // ═══════════════════════════════════════════════════════════════════════
  titulo('7 · cierre atomico sim_cierre_v0 (i.1 S4-01a, o.7)')
  const T = (id, pnl, extra = {}) => JSON.stringify({ id, user_id: A, pair: 'EURUSD', side: 'BUY', lots: '1.00', entry_price: '1.10000', exit_price: '1.10100',
    sl_price: null, tp_price: null, rr: '1.50', pnl, result: 'WIN', notes: '', session_type: 'london', opened_at: '2026-01-05T10:00:00Z', closed_at: '2026-01-05T11:00:00Z', ...extra })
  const saldo = s => uno(`select trim_scale(balance)||','||coalesce(last_timestamp::text,'-') from public.sim_sessions where id = '${s}'`)
  pg.psql(`update public.sim_sessions set balance = 10000, last_timestamp = 100 where id = '${SA2}'`)
  k = ultimo()
  r = nuevo(`select public.sim_cierre_v0('${SA2}', 10097, 1767700000, ${L(T(u(401), '97.00'))});`)
  filas = desde(k); k = ultimo()
  oraculo('E7-total', 'total: trade + saldo + last_timestamp en una transaccion, firmado; devuelve el id del trade',
    r.ok && r.out === u(401) && saldo(SA2) === '10097,1767700000' && filas.length === 2 && /^sim_trades INSERT .*pnl=97 trade=true cli=etapa1-1/.test(filas[0])
    && /^sim_sessions UPDATE .*cols=balance,last_timestamp delta=97 .*marca=1/.test(filas[1])
    && n(`select count(distinct xact) from public.sim_escrituras_v0 where id in (select id from public.sim_escrituras_v0 order by id desc limit 2)`) === 1, filas.join(' / ') || err1(r))
  r = nuevo(`select public.sim_cierre_v0('${SA2}', 10087, null, ${L(T(u(402), '-10.00'))});`)
  filas = desde(k); k = ultimo()
  oraculo('E7-parcial', 'parcial: last_timestamp NULL = se conserva; solo SET balance (como hoy)',
    r.ok && saldo(SA2) === '10087,1767700000' && filas.length === 2 && /^sim_sessions UPDATE .*cols=balance delta=-10 /.test(filas[1]), filas.join(' / ') || err1(r))
  const antesB = saldo(SB)
  const e1 = nuevo(`select public.sim_cierre_v0('${u(999)}', 1, 1, ${L(T(u(403), '1.00'))});`)
  const e2 = nuevo(`select public.sim_cierre_v0('${SA2}', 1, 1, ${L(T(u(404), '1.00', { evento_id: 5 }))});`)
  const e3 = nuevo(`select public.sim_cierre_v0('${SA2}', 1, 1, ${L(T(null, '1.00'))});`)
  const e4 = nuevo(`select public.sim_cierre_v0('${SA}', 1, 1, ${L(T(u(405), '1.00', { user_id: B }))});`)
  oraculo('E7-error-sin-efectos', '{error}: sesion inexistente (con el trade ya insertado dentro), clave no admitida, sin id, trade de otro → error prefijado y NADA guardado',
    !e1.ok && /sim_trades_session_id_fkey|sim_cierre_v0: la sesion .* no existe o no es tuya/.test(err1(e1)) && !e2.ok && /claves no admitidas en el trade: evento_id/.test(err1(e2))
    && !e3.ok && /necesita su id/.test(err1(e3)) && !e4.ok
    && n(`select count(*) from public.sim_trades where id in ('${u(403)}', '${u(404)}', '${u(405)}')`) === 0 && saldo(SA2) === '10087,1767700000' && saldo(SB) === antesB
    && ultimo() === k, [e1, e2, e3, e4].map(err1).join(' | ').slice(0, 240))
  pg.psql(`insert into auth.users values ('${B}'); insert into public.profiles (id, email, simulador_activo) values ('${B}', 'b@ejemplo.test', true);
    insert into public.sim_sessions (id, user_id, name, pair, timeframe, date_from, date_to) values ('${SB}', '${B}', 'b', 'EURUSD', 'H1', '2026-01-01', '2026-02-01');`)
  k = ultimo()
  const e5 = nuevo(`select public.sim_cierre_v0('${SB}', 1, 1, ${L(T(u(406), '1.00'))});`)
  oraculo('E7-sesion-ajena', 'cierre de A en la sesion de B: RLS deja 0 filas en el UPDATE → error y el trade no queda',
    !e5.ok && /no existe o no es tuya/.test(err1(e5)) && n(`select count(*) from public.sim_trades where id = '${u(406)}'`) === 0, err1(e5))
  const ea = escribe({ rol: 'anon' }, `select public.sim_cierre_v0('${SA2}', 1, 1, ${L(T(u(407), '1.00'))});`)
  const es = escribe({ rol: 'service_role' }, `select public.sim_cierre_v0('${SA2}', 1, 1, ${L(T(u(408), '1.00'))});`)
  oraculo('E7-quien', 'anon y service_role no pueden ejecutarlo (EXECUTE solo authenticated)', !ea.ok && !es.ok && [ea, es].every(x => /permission denied for function/.test(x.err)), [ea, es].map(err1).join(' | '))
  // ronda 2 (CTO 13-oct, Astra E1-04): solo sobre una sesion activa
  const cerradas = []
  for (const [i, st] of ['passed_phase', 'passed_all', 'failed_dd_daily', 'failed_dd_total'].entries()) {
    pg.psql(`update public.sim_sessions set status = '${st}' where id = '${SA2}'`)
    const antes = saldo(SA2); k = ultimo()
    const e = nuevo(`select public.sim_cierre_v0('${SA2}', 20000, 1, ${L(T(u(420 + i), '9.00'))});`)
    cerradas.push({ st, ok: !e.ok && /sim_cierre_v0: sesion cerrada: /.test(err1(e)) && saldo(SA2) === antes && ultimo() === k
      && n(`select count(*) from public.sim_trades where id = '${u(420 + i)}'`) === 0, err: err1(e) })
  }
  oraculo('E7-sesion-cerrada', 'sesion con el reto decidido (passed_phase, passed_all, failed_dd_daily, failed_dd_total): error prefijado «sim_cierre_v0: sesion cerrada:» y NADA guardado (ni trade, ni saldo, ni registro)',
    cerradas.every(x => x.ok), cerradas.map(x => x.st + ' ' + (x.ok ? 'ok' : x.err)).join(' | ').slice(0, 240))
  pg.psql(`update public.sim_sessions set status = null where id = '${SA2}'`)
  const eNull = nuevo(`select public.sim_cierre_v0('${SA2}', 10090, 1767700001, ${L(T(u(425), '3.00'))});`)
  pg.psql(`update public.sim_sessions set status = 'active' where id = '${SA2}'`)
  oraculo('E7-status-null', 'status NULL es activa (como en el cliente: session.status || «active»): el cierre se guarda', eNull.ok && saldo(SA2) === '10090,1767700001', err1(eNull))
  // la carrera: el paso de fase (service_role, como challenge/advance) tiene la fila cuando llega el cierre;
  // el cierre espera su cerrojo, el UPDATE vuelve a mirar el status y no actualiza nada → error y nada guardado
  {
    const { spawn } = await import('node:child_process')
    const f2 = path.join(pg.dir, 'fase.sql')
    writeFileSync(f2, `begin; set local role service_role; update public.sim_sessions set status = 'passed_phase', balance = 10090 where id = '${SA2}'; select pg_sleep(1.5); commit;`)
    const hijo = spawn(path.join(BIN, 'psql'), ['-h', pg.dir, '-p', pg.puerto, '-U', 'postgres', '-X', '-q', '-tA', '-v', 'ON_ERROR_STOP=1', '-d', 'p', '-f', f2],
      { env: { PATH: process.env.PATH, LC_ALL: 'en_US.UTF-8', LANG: 'en_US.UTF-8' } })
    const fase = new Promise(r => hijo.on('exit', c => r(c)))
    await new Promise(r => setTimeout(r, 400))
    const t0 = Date.now()
    const eC = nuevo(`select public.sim_cierre_v0('${SA2}', 10190, 1767700002, ${L(T(u(426), '100.00'))});`)
    const espero = Date.now() - t0
    const cf = await fase
    ver('carrera: el paso de fase termino bien y el cierre espero su cerrojo (≥ 0,8 s)', cf === 0 && espero >= 800, `fase ${cf} · espera ${espero} ms`)
    oraculo('E7-carrera-fase', 'el paso de fase confirma mientras el cierre espera la fila: el cierre se rechaza («sesion cerrada») y no guarda nada; queda el saldo de la fase',
      !eC.ok && /sim_cierre_v0: sesion cerrada: /.test(err1(eC)) && saldo(SA2) === '10090,1767700001' && n(`select count(*) from public.sim_trades where id = '${u(426)}'`) === 0, err1(eC))
    pg.psql(`update public.sim_sessions set status = 'active' where id = '${SA2}'`)
  }

  // ═══════════════════════════════════════════════════════════════════════
  titulo('8 · parejas y texto canonico (o.0, o.4)')
  monta('h')
  pgx(PREP, 'h')
  // sesion SA: un cierre total completo (trade 25 + UPDATE +25), un parcial con UPDATE sin trade (+10), un guardado
  viejo(`insert into public.sim_trades (id, session_id, user_id, pair, side, entry_price, lots, pnl, opened_at) values ('${u(501)}', '${SA}', '${A}', 'EURUSD', 'BUY', 1.1, 1, 25, now());`, A, 'h')
  viejo(`update public.sim_sessions set balance = 10025, last_timestamp = 1 where id = '${SA}';`, A, 'h')
  viejo(`update public.sim_sessions set balance = 10035 where id = '${SA}';`, A, 'h')
  viejo(`update public.sim_sessions set last_timestamp = 2, timeframe = 'H1' where id = '${SA}';`, A, 'h')
  const par = uno(`select string_agg(orden||':'||escritura_update||'-'||escritura_insert, ',') from public.sim_escrituras_v0_parejas('${SA}')`, 'h')
  const ids = uno(`select string_agg(id::text, ',' order by id) from public.sim_escrituras_v0 where session_id = '${SA}'`, 'h').split(',')
  oraculo('E8-parejas', 'el INSERT de 25 casa con el UPDATE de +25 (no con el de +10 ni con el guardado)', par === `1:${ids[1]}-${ids[0]}`, `${par} · ids ${ids}`)
  const canon = () => uno(`select sha256 from public.sim_escrituras_v0_canonico('${SA}')`, 'h')
  const texto = uno(`select texto from public.sim_escrituras_v0_canonico('${SA}')`, 'h')
  let parsed = null; try { parsed = JSON.parse(texto) } catch { parsed = null }
  oraculo('E8-texto', 'el texto canonico es JSON valido, con version, 4 filas de 16 campos, la marca en la fila de +10 y su sha256 = sha256(texto)',
    parsed?.version === 'sim-escrituras-canonico@1' && parsed.filas.length === 4 && parsed.filas.every(f => f.length === 16) && parsed.parejas.length === 1
    && parsed.filas[2][14] !== null && parsed.filas[3][14] === null && canon() === createHash('sha256').update(texto, 'utf8').digest('hex'), texto.slice(0, 200))
  const h0 = canon()
  ver('el hash es estable entre dos lecturas', canon() === h0)
  const CAMPOS = [['id', `id = id + 1000`], ['session_id', `session_id = '${u(777)}'`], ['user_id', `user_id = '${u(778)}'`], ['tabla', `tabla = 'sim_trades'`],
    ['operacion', `operacion = 'DELETE'`], ['xact', `xact = xact || '0'`], ['cliente', `cliente = 'etapa1-9'`], ['rol_jwt', `rol_jwt = 'anon'`],
    ['rol_guc', `rol_guc = 'none'`], ['columnas', `columnas = columnas || '{zz}'`], ['delta', `delta = delta + 0.01`], ['trade_id', `trade_id = '${u(779)}'`],
    ['pnl', `pnl = coalesce(pnl, 0) + 0.01`], ['en', `en = en + interval '1 microsecond'`]]
  // (id es GENERATED ALWAYS: para cambiarlo se pasa a BY DEFAULT dentro de la transaccion que se deshace)
  const cambia = (tabla, set, donde) => uno(`begin; alter table public.${tabla} disable trigger sim_escrituras_v0_inmutable_fila;
    alter table public.${tabla} alter column id set generated by default;
    update public.${tabla} set ${set} where ${donde};
    select sha256 from public.sim_escrituras_v0_canonico('${SA}'); rollback;`, 'h').split('\n').filter(l => /^[0-9a-f]{64}$/.test(l)).at(-1)
  const cambios = CAMPOS.map(([c, set]) => {
    const donde = ['pnl', 'trade_id'].includes(c) ? `id = ${ids[0]}` : `id = ${ids[2]}`
    const h = cambia('sim_escrituras_v0', set, donde)
    return [c, h && h !== h0 && /^[0-9a-f]{64}$/.test(h)]
  })
  const hm1 = cambia('sim_escrituras_v0_marcas', `id = id + 1000`, `true`), hm2 = cambia('sim_escrituras_v0_marcas', `xact = xact || '0'`, `true`)
  cambios.push(['marca.id', hm1 && hm1 !== h0], ['marca.xact', hm2 && hm2 !== h0])
  oraculo('E8-cada-campo', 'cambiar CADA uno de los 16 campos por separado cambia el hash (S4R6-01)', cambios.every(c => c[1]), cambios.filter(c => !c[1]).map(c => c[0]).join(',') || '16/16')
  const hNul = cambia('sim_escrituras_v0', `rol_guc = NULL`, `id = ${ids[2]}`), hVac = cambia('sim_escrituras_v0', `rol_guc = ''`, `id = ${ids[2]}`)
  oraculo('E8-null-vacio', 'NULL y cadena vacia dan hashes distintos', hNul && hVac && hNul !== hVac && hNul !== h0 && hVac !== h0)
  const sinMarca = uno(`begin; alter table public.sim_escrituras_v0_marcas disable trigger sim_escrituras_v0_inmutable_fila; delete from public.sim_escrituras_v0_marcas;
    select sha256 from public.sim_escrituras_v0_canonico('${SA}'); rollback;`, 'h').split('\n').filter(l => /^[0-9a-f]{64}$/.test(l)).at(-1)
  oraculo('E8-sin-marca', 'quitar la marca de balance cambia el hash', sinMarca && sinMarca !== h0)

  // ═══════════════════════════════════════════════════════════════════════
  titulo('9 · la guarda final del catalogo (m.5.5, S4R5-02, S4R6-02) y el control funcional aparte')
  const MUTANTES = [
    ['B renombrado para ordenar ANTES de A', `alter trigger sim_escrituras_v0_b_balance on public.sim_sessions rename to sim_escrituras_v0_0_balance;`],
    ['sin B', `drop trigger sim_escrituras_v0_b_balance on public.sim_sessions;`],
    ['sin A en sim_trades', `drop trigger sim_escrituras_v0_a on public.sim_trades;`],
    ['A deshabilitado', `alter table public.sim_sessions disable trigger sim_escrituras_v0_a;`],
    ['sin inmutabilidad de TRUNCATE en marcas', `drop trigger sim_escrituras_v0_inmutable_truncate on public.sim_escrituras_v0_marcas;`],
    ['un disparador del dueño de mas en sim_sessions', `create function public.zz() returns trigger language plpgsql as $$ begin return null; end $$; create trigger zz after insert on public.sim_sessions for each row execute function public.zz();`],
    ['sin el cupo', `drop trigger trg_enforce_sim_session_limit on public.sim_sessions;`],
    ['cuerpo de A cambiado', `create or replace function public.sim_escrituras_v0_registra() returns trigger language plpgsql security definer set search_path = '' as $$ begin return null; end $$;`],
    ['canonico pasa a DEFINER', `alter function public.sim_escrituras_v0_canonico(uuid) security definer;`],
    ['SELECT del registro a service_role', `grant select on public.sim_escrituras_v0 to service_role;`],
    ['UPDATE de sim_servicio a service_role (o.12: solo SELECT)', `grant update on public.sim_servicio to service_role;`],
    ['SELECT de sim_servicio a anon', `grant select on public.sim_servicio to anon;`],
    ['EXECUTE de PUBLIC en parejas', `grant execute on function public.sim_escrituras_v0_parejas(uuid) to public;`],
    ['columna nueva en el registro', `alter table public.sim_escrituras_v0 add column extra text;`],
    ['politica en el registro', `create policy p on public.sim_escrituras_v0 for select to authenticated using (true);`],
    ['FK de las marcas al registro', `alter table public.sim_escrituras_v0_marcas add constraint mf foreign key (escritura_id) references public.sim_escrituras_v0 (id);`],
    // ronda 2 (Astra E1-05): grants de COLUMNA, que has_table_privilege y relacl no ven
    ['UPDATE de columna de sim_servicio a service_role (el de Astra)', `grant update (mantenimiento) on public.sim_servicio to service_role;`],
    ['INSERT de columna de sim_servicio a authenticated', `grant insert (mantenimiento) on public.sim_servicio to authenticated;`],
    ['SELECT de columna de sim_servicio a anon', `grant select (mantenimiento) on public.sim_servicio to anon;`],
    ['SELECT de columna del registro a authenticated', `grant select (session_id) on public.sim_escrituras_v0 to authenticated;`],
    ['REFERENCES de columna de las marcas a anon', `grant references (id) on public.sim_escrituras_v0_marcas to anon;`],
    ['SELECT de columna del registro a PUBLIC', `grant select (id) on public.sim_escrituras_v0 to public;`],
    ['UPDATE de columna heredado: un rol con el grant, miembro authenticated', `create role zz_columna nologin; grant update (mantenimiento) on public.sim_servicio to zz_columna; grant zz_columna to authenticated;`],
    ['UPDATE de columna de sim_sessions a anon', `grant update (balance) on public.sim_sessions to anon;`],
    ['UPDATE de columna de sim_trades a authenticated', `grant update (pnl) on public.sim_trades to authenticated;`]]
  monta('g')
  pgx(PREP, 'g')
  for (const [desc, q] of MUTANTES) {
    const m = pg.psql(`begin;\n${q}\n` + PREP.replace(/\nselect seccion, detalle from \([\s\S]*$/, '\n') + '\nrollback;', 'g')
    oraculo('E9-' + desc.replace(/\W+/g, '-'), `mutante «${desc}» → la reejecucion aborta con «sim-004a: …»`, !m.ok && /sim-004a: /.test(err1(m)), err1(m).slice(0, 140))
  }
  oraculo('E9-deshechos', 'tras los mutantes (deshechos con ROLLBACK), la base g sigue en el estado 1', fin1(pgx(PREP, 'g')) === 'FIN|sim-004a-preparatoria aplicada')
  // control funcional (n.5): B no falla con una fila anterior de A en la misma transaccion y sesion
  const fn = pg.psql(`begin;
alter trigger sim_escrituras_v0_b_balance on public.sim_sessions rename to sim_escrituras_v0_0_balance;
set local role authenticated; select set_config('request.jwt.claims', '{"role":"authenticated","sub":"${A}"}', true), set_config('request.jwt.claim.sub', '${A}', true) \\g /dev/null
update public.sim_sessions set timeframe = 'M5' where id = '${SA}';
update public.sim_sessions set balance = balance where id = '${SA}';
reset role;
select (select e.columnas::text from public.sim_escrituras_v0 e where e.id = m.escritura_id) from public.sim_escrituras_v0_marcas m order by m.id desc limit 1;
rollback;`, 'g')
  oraculo('E9-control-funcional', 'control funcional aparte (S4R5-02): con B antes de A y una fila anterior, B NO falla y marca la fila equivocada ({timeframe}); por eso la defensa es la guarda',
    fn.ok && fn.out.split('\n').filter(l => /^\{/.test(l)).at(-1) === '{timeframe}', fn.out + err1(fn))

  // ═══════════════════════════════════════════════════════════════════════
  titulo('10 · la puerta (l.1 b, m.3, m.4)')
  const sinRegistro = pgx(PUERTA, 'ps')
  oraculo('E10-sin-registro', 'la puerta sin la preparatoria → aborta', !sinRegistro.ok && /el registro no esta instalado/.test(err1(sinRegistro)), err1(sinRegistro))
  const shaPuerta = createHash('sha256').update(PUERTA.match(/v_puerta text := \$c\$([\s\S]*?)\$c\$;/)?.[1] ?? "", "utf8").digest('hex')
  oraculo('E10-sha-puerta', 'el sha256 de la puerta que fija la preparatoria es el del cuerpo de sql/sim-004a-puerta.sql', PREP.includes(`v_puerta_sha constant text := '${shaPuerta}'`), shaPuerta.slice(0, 16))
  const listas = t => (t.match(/v_hoy text := concat_ws\([\s\S]*?\);\n[\s\S]*?v_lapuerta text := concat_ws\([\s\S]*?\);/) || [''])[0]
  oraculo('E10-listas', 'las listas de disparadores de los dos ficheros son el mismo texto', listas(PREP) !== '' && listas(PREP).replace(/\n *-- .*$/gm, '') === listas(PUERTA).replace(/\n *-- .*$/gm, ''))
  k = ultimo()
  const fotoP1 = foto()
  const pu1 = pgx(PUERTA)
  oraculo('E10-activa', 'la puerta se activa como pgx: FIN | sim-004a-puerta aplicada, estado «registro + puerta»',
    pu1.ok && fin1(pu1) === 'FIN|sim-004a-puerta aplicada' && /^estado\|registro \+ puerta$/m.test(pu1.out), err1(pu1))
  const fotoP2 = foto()
  oraculo('E10-activa-cambia', 'la activacion cambia el catalogo (la foto la ve)', pu1.ok && fotoP2 !== fotoP1)
  const v1 = viejo(`insert into public.sim_trades (id, session_id, user_id, pair, side, entry_price, lots, pnl, opened_at) values ('${u(601)}', '${SA}', '${A}', 'EURUSD', 'BUY', 1.1, 1, 5, now());`)
  const v2 = viejo(`update public.sim_sessions set balance = balance + 5 where id = '${SA}';`)
  const v3 = viejo(`update public.sim_sessions set timeframe = 'M5' where id = '${SA}';`)
  const v4 = viejo(`delete from public.sim_sessions where id = '${SA2}';`)
  const v5 = escribe({ cliente: '' }, `update public.sim_sessions set balance = balance where id = '${SA}';`)
  const v6 = escribe({ claims: JSON.stringify({ role: 'authenticated', sub: A }), headers: '{}' }, `update public.sim_sessions set balance = balance where id = '${SA}';`)
  oraculo('E10-viejo-rechazado', 'cliente antiguo: INSERT de trade, UPDATE de saldo, UPDATE de TF, DELETE, cabecera vacia y JWT a mano sin cabecera → rechazados con el prefijo; nada registrado',
    [v1, v2, v3, v4, v5, v6].every(x => !x.ok && /sim_escrituras_v0_puerta: escritura sin x-sim-cliente rechazada/.test(err1(x))) && ultimo() === k
    && n(`select count(*) from public.sim_trades where id = '${u(601)}'`) === 0, [v1, v2, v3, v4, v5, v6].map(x => x.ok ? 'PASA' : 'rechazado').join(','))
  const fA = nuevo(`update public.sim_sessions set timeframe = 'M5' where id = '${SA}';`)
  const fC = nuevo(`select public.sim_cierre_v0('${SA2}', 10090, null, ${L(T(u(602), '3.00'))});`)
  const fS = escribe({ rol: 'service_role' }, `update public.sim_sessions set balance = balance where id = '${SA}';`)
  const fO = pgx(`update public.sim_sessions set timeframe = 'H1' where id = '${SA}';`)
  const fV = viejo(`select public.sim_cierre_v0('${SA2}', 10093, null, ${L(T(u(603), '3.00'))});`)
  oraculo('E10-pasan', 'pasan: firmado (UPDATE y cierre atomico), service_role y el dueño; el cierre atomico sin cabecera, rechazado entero',
    fA.ok && fC.ok && fS.ok && fO.ok && !fV.ok && n(`select count(*) from public.sim_trades where id = '${u(603)}'`) === 0, [fA, fC, fS, fO, fV].map(x => x.ok ? 'pasa' : err1(x).slice(0, 40)).join(','))
  const pu2 = pgx(PUERTA)
  oraculo('E10-reejecuta-puerta', 'reejecutar la puerta: sin error, no la duplica (catalogo identico) y el cliente antiguo sigue rechazado',
    pu2.ok && fin1(pu2) === 'FIN|sim-004a-puerta aplicada' && foto() === fotoP2 && !viejo(`update public.sim_sessions set balance = balance where id = '${SA}';`).ok, err1(pu2))
  const ap4 = pgx(PREP)
  oraculo('E10-reejecuta-preparatoria', 'reejecutar la preparatoria con la puerta: reconoce el estado 2, no lo cambia, y la puerta sigue cerrada (m.4)',
    ap4.ok && /^estado\|registro \+ puerta$/m.test(ap4.out) && foto() === fotoP2 && !viejo(`update public.sim_sessions set balance = balance where id = '${SA}';`).ok, err1(ap4))
  const su2 = pgx(S3)
  oraculo('E10-sim003-estado2', 'sim-003 tambien en el estado 2: sin error y catalogo identico (o.1)', pu1.ok && fotoP2 !== fotoP1 && su2.ok && /FIN\|sim-003 aplicada$/.test(fin1(su2)) && foto() === fotoP2, err1(su2))
  const alt = pg.psql(`begin; create or replace function public.sim_escrituras_v0_puerta() returns trigger language plpgsql set search_path = '' as $$ begin return new; end $$;\n`
    + PREP.replace(/\nselect seccion, detalle from \([\s\S]*$/, '\n') + '\nrollback;')
  const alt2 = pg.psql(`begin; create or replace function public.sim_escrituras_v0_puerta() returns trigger language plpgsql set search_path = '' as $$ begin return new; end $$;\n`
    + PUERTA.replace(/\nselect seccion, detalle from \([\s\S]*$/, '\n') + '\nrollback;')
  oraculo('E10-puerta-alterada', 'una puerta con otro cuerpo (que deja pasar todo) → la preparatoria y la puerta abortan al reejecutarse',
    !alt.ok && /la puerta activa no es la de sql\/sim-004a-puerta\.sql/.test(err1(alt)) && !alt2.ok && /no es la de este fichero/.test(err1(alt2)), err1(alt) + ' | ' + err1(alt2))
  const sinUna = pg.psql(`begin; drop trigger sim_escrituras_v0_puerta on public.sim_trades;\n` + PREP.replace(/\nselect seccion, detalle from \([\s\S]*$/, '\n') + '\nrollback;')
  const sinUna2 = pg.psql(`begin; drop trigger sim_escrituras_v0_puerta on public.sim_trades;\n` + PUERTA.replace(/\nselect seccion, detalle from \([\s\S]*$/, '\n') + '\nrollback;')
  oraculo('E10-puerta-a-medias', 'la puerta solo en una tabla → la preparatoria y la puerta abortan (no la «completan» ni la dan por buena)',
    !sinUna.ok && /puerta esta A MEDIAS/.test(err1(sinUna)) && !sinUna2.ok && /ni los del estado 1 ni los del 2/.test(err1(sinUna2)), err1(sinUna) + ' | ' + err1(sinUna2))
} finally {
  pg.cierra()
}
fin()
