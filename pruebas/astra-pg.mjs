/**
 * ASTRA-PG (revision de codigo de la etapa 1, 13-oct: revisiones-suite/2026-10-13-astra-sim-etapa1.md,
 * E1-01 y E1-05), llevada a pruebas/ como permanente por orden del CTO (13-oct). Original, sin tocar:
 * revisiones-suite/2026-10-13-sim-etapa1-evidencias/copia/pruebas/astra-pg.mjs
 *
 * Los dos oraculos conservan su CONDICION. Lo que cambia respecto al original:
 *   E1-01  la pausa ya no es un UPDATE escrito a mano (balance=10000 capturado): es lo que
 *          MANDA la pausa real. Se monta _SessionInner con los dobles, se pulsa la pausa con
 *          el saldo confirmado aun en 10000 (antes del cierre) y cada UPDATE de sim_sessions
 *          que sale se traduce a SQL y se ejecuta, firmado, DESPUES del cierre +100. Contra el
 *          codigo de 958b6e8 eso es {balance:10000,last_timestamp} → rojo; con E1-01, verde.
 *
 * El comentario siguiente es el de pruebas/sim-004a.mjs, del que Astra partio.
 */
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
 *     deshabilitado, disparador de mas, cuerpo cambiado, grant de mas, columna de mas; y el
 *     control funcional aparte (B no falla con una fila anterior)
 *  10 la puerta: el cliente antiguo rechazado en las dos mitades, firmado / service_role /
 *     dueño pasan; reejecutar puerta y preparatoria en el estado 2; puerta alterada
 * ⚠️ No prueba el editor de Supabase ni PostgREST de verdad (eso lo midio k.4 b).
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { titulo, ver, oraculo, fin, REPO, escenario, sesionSim, importa, monta as montaReact, router, vela, nav, db as dbFalso, asienta } from './lib.mjs'
import { velasEnStorage } from './banco-motor.mjs'
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

// E1-01: lo que manda la pausa REAL, con el saldo confirmado aun en 10000 (antes del cierre)
const pausaReal = await (async () => {
  const Sesion = (await importa('components/_SessionInner.js')).default
  const T0 = Date.parse('2025-03-03T10:00:00Z') / 1000
  const VS = Array.from({ length: 30 }, (_, i) => vela(T0 + i * 60, 1.1 + i * .001, 1.1 + i * .001, 1.1 + i * .001, 1.1 + i * .001))
  const tecla = code => { for (const f of [...(nav.oyentes.keydown || [])]) f({ code, key: code, target: { tagName: 'DIV' }, preventDefault() {} }) }
  escenario({ sim_sessions: [sesionSim({ id: 'pausa', balance: 10000 })] }); velasEnStorage('EUR/USD', VS, [2024], { tramoAbierto: true }); router.query = { id: 'pausa' }
  const p = montaReact(Sesion, {}); await p.asienta(300)
  const ts = { getVisibleLogicalRange: () => ({ from: 0, to: 50 }), setVisibleLogicalRange() {}, scrollToPosition() {} }
  window.__chartMap.current['EUR/USD'] = { series: { setData() {}, update() {}, priceToCoordinate: () => 0, createPriceLine: () => ({}), removePriceLine() {} }, chart: { timeScale: () => ts, priceScale: () => ({ applyOptions() {} }) }, prevCount: 0 }
  tecla('ArrowRight'); await p.asienta(40); tecla('Space'); await p.asienta(20)
  dbFalso.log.length = 0; tecla('Space'); await p.asienta(60)
  const cargas = dbFalso.log.filter(c => c.tabla === 'sim_sessions' && c.op === 'update').map(c => c.payload)
  p.desmonta(); await asienta(30)
  return cargas
})()
ver('la pausa real manda al menos un UPDATE de sim_sessions', pausaReal.length > 0, JSON.stringify(pausaReal))

try {
 pg.arranca(); monta('p'); ver('preparatoria',pgx(PREP).ok);ver('puerta',pgx(PUERTA).ok);
 const trade={id:u(990),user_id:A,pair:'EURUSD',side:'BUY',entry_price:1.1,lots:1,pnl:100,opened_at:'2026-01-02T12:00:00Z'};
 const cierre=nuevo(`select public.sim_cierre_v0('${SA}',10100,null,${L(JSON.stringify(trade))}::jsonb);`);
 ver('cierre +100 confirmado',cierre.ok && n(`select balance from public.sim_sessions where id='${SA}'`)===10100,err1(cierre));
 const pausa=nuevo(pausaReal.map(c=>`update public.sim_sessions set ${Object.entries(c).map(([k,v])=>`${k}=${L(v)}`).join(',')} where id='${SA}';`).join('\n'));
 console.log('PAUSA_REAL',JSON.stringify(pausaReal));
 console.log('PAUSA_SQL',JSON.stringify({ok:pausa.ok,balance:n(`select balance from public.sim_sessions where id='${SA}'`),pnl:n(`select sum(pnl) from public.sim_trades where session_id='${SA}'`)}));
 oraculo('ASTRA-PG-pausa','saldo conserva el cierre ante pausa vieja que llega despues',n(`select balance from public.sim_sessions where id='${SA}'`)===10100);
 const g=pgx('grant update(mantenimiento) on public.sim_servicio to service_role;');
 ver('grant columna plantado',g.ok); const re=pgx(PREP); console.log('GRANT_COLUMNA_GUARDA',JSON.stringify({ok:re.ok,error:err1(re)}));
 const sr=escribe({rol:'service_role'},'update public.sim_servicio set mantenimiento=true where id=true;');
 console.log('GRANT_COLUMNA_EFECTO',JSON.stringify(sr));
 oraculo('ASTRA-PG-columna','reejecucion detecta grant UPDATE de columna a service_role',!re.ok);
} finally {pg.cierra()}
fin();
