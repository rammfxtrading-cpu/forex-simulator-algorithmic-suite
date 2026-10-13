/**
 * S12 · FILAS EN UNA SESION AJENA O INEXISTENTE · ENSAYO EN POSTGRESQL 17 LOCAL
 * (CTO 13-oct, o.16.7 y o.16.9: paso previo OBLIGATORIO a la preparatoria en el runbook, junto a s11)
 * Tablas: sim_trades, session_drawings, session_chart_config (session_id) y sim_sessions
 * (challenge_parent_id).
 *
 * Montaje: produccion segun s04 LITERAL + sql/sim-002 + sql/sim-003 (como s11). Datos inventados.
 *   1 limpio: en una transaccion READ ONLY, los ocho totales a 0 y ninguna fila de caso; FIN
 *   2 CONTROL: ocho casos plantados (como superusuario), uno por tabla y tipo: de A en la sesion de B,
 *     y con una sesion que no existe (FK desactivada para plantarlo). Los ocho aparecen, cada uno en
 *     su seccion, con su id, a donde apunta y su fecha; cada total dice 1; las filas sanas no salen
 *   3 nada personal: ninguna fila trae emails, nombres, importes ni el user_id
 *   4 una sola sentencia SELECT, sin escrituras ni EXECUTE (el texto, sin comentarios)
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { titulo, ver, oraculo, fin, REPO } from './lib.mjs'
import { BIN, hayPostgres, cluster } from './pg-ensayo.mjs'
import { PRODUCCION } from './estado-s04.mjs'
if (!hayPostgres()) { ver(`PostgreSQL 17 en ${BIN}: NO hay, la prueba no se ha ejecutado`, false); fin() }
const lee = p => readFileSync(path.join(REPO, p), 'utf8')
const S12 = lee('sql/consultas/s12-trades-sesion-ajena.sql')
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
end $$;`
const pgx = (texto, db) => {
  const f = path.join(pg.dir, 'x.sql'); writeFileSync(f, texto)
  const r = spawnSync(path.join(BIN, 'psql'), ['-h', pg.dir, '-p', pg.puerto, '-U', 'pgx', '-X', '-q', '-tA', '-F', '|', '-v', 'ON_ERROR_STOP=1', '-d', db, '-f', f],
    { encoding: 'utf8', env: { PATH: process.env.PATH, LC_ALL: 'en_US.UTF-8', LANG: 'en_US.UTF-8' } })
  return { ok: r.status === 0, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() }
}
const u = k => `00000000-0000-4000-8000-${String(k).padStart(12, '0')}`
const A = u(1), B = u(2), SA = u(101), SB = u(102), T1 = u(901), T2 = u(902), T3 = u(903), FANTASMA = u(999)
const D2 = u(912), D3 = u(913), C2 = u(922), C3 = u(923), H2 = u(932), H3 = u(933), SANA_D = u(911), SANA_C = u(921), SANA_H = u(931)
const DATOS = `
insert into auth.users values ('${A}'), ('${B}');
insert into public.profiles (id, email, plan, simulador_activo) values ('${A}', 'a@ejemplo.test', 'basic', true), ('${B}', 'b@ejemplo.test', 'basic', true);
insert into public.sim_sessions (id, user_id, name, pair, timeframe, date_from, date_to, capital, balance) values
  ('${SA}', '${A}', 'Alumno A sesion', 'EURUSD', 'H1', '2026-01-01', '2026-02-01', 10000, 10000),
  ('${SB}', '${B}', 'Alumno B sesion', 'EURUSD', 'H1', '2026-01-01', '2026-02-01', 10000, 10000);
insert into public.sim_trades (id, session_id, user_id, pair, side, entry_price, lots, pnl, opened_at, closed_at) values
  ('${T1}', '${SA}', '${A}', 'EURUSD', 'BUY', 1.1, 1, 123.45, '2026-01-05T10:00:00Z', '2026-01-05T11:00:00Z');
insert into public.session_drawings (id, session_id, user_id, pair, data, updated_at) values ('${SANA_D}', '${SA}', '${A}', 'EURUSD', '[{"secreto":1}]', '2026-01-05T10:00:00Z');
insert into public.session_chart_config (id, session_id, user_id, config, updated_at) values ('${SANA_C}', '${SA}', '${A}', '{"secreto":1}', '2026-01-05T10:00:00Z');
insert into public.sim_sessions (id, user_id, name, pair, timeframe, date_from, date_to, capital, balance, challenge_parent_id) values
  ('${SANA_H}', '${A}', 'Alumno A hija', 'EURUSD', 'H1', '2026-01-01', '2026-02-01', 10000, 10000, '${SA}');`
const monta = db => {
  const pasos = [pg.psql(`create database ${db}`, 'postgres'), pg.psql(PRODUCCION, db), pg.psql(S2, db), pg.psql(EJECUTOR, db), pgx(S3, db), pg.psql(DATOS, db)]
  if (!pasos.every(x => x.ok)) throw new Error(`montaje ${db}: ${pasos.map(x => x.err).join(' ')}`)
}
const s12 = db => {
  const r = pg.psql(`begin transaction read only;\n\\pset fieldsep '|'\n${S12}\nrollback;`, db)
  return { ok: r.ok, err: r.err, texto: r.out, filas: r.out.split('\n').filter(l => l.includes('|')).map(l => { const [s, o, ...d] = l.split('|'); return { s, o, d: d.join('|') } }) }
}
const total = (r, k) => r.filas.find(f => f.s === 'total' && f.o === k)?.d
const TOTALES = ['sim_trades', 'session_drawings', 'session_chart_config', 'sim_sessions'].flatMap(t => [t + '.usuario_distinto', t + '.sesion_inexistente'])

try {
  pg.arranca()
  titulo('1 · limpio')
  monta('p')
  const r = s12('p')
  oraculo('S12-limpio', 'limpio, en una transaccion READ ONLY: los ocho totales a 0 (cuatro tablas × dos tipos), ninguna fila de caso, y acaba en FIN | s12 | consulta',
    r.ok && TOTALES.every(k => total(r, k) === '0') && !r.filas.some(f => /\.(usuario_distinto|sesion_inexistente)$/.test(f.s))
    && r.filas.at(-1)?.s === 'FIN' && r.filas.at(-1)?.o === 's12', r.err.split('\n')[0] || r.texto.slice(0, 200))

  titulo('2 · CONTROL: dos casos plantados')
  monta('c')
  const planta = pg.psql(`insert into public.sim_trades (id, session_id, user_id, pair, side, entry_price, lots, pnl, opened_at, closed_at) values
  ('${T2}', '${SB}', '${A}', 'EURUSD', 'SELL', 1.2, 2, -55.5, '2026-01-06T10:00:00Z', '2026-01-06T12:30:00Z');
set session_replication_role = replica;
insert into public.sim_trades (id, session_id, user_id, pair, side, entry_price, lots, pnl, opened_at) values
  ('${T3}', '${FANTASMA}', '${A}', 'EURUSD', 'BUY', 1.3, 1, 7, '2026-01-07T09:00:00Z');
insert into public.session_drawings (id, session_id, user_id, pair, data, updated_at) values ('${D3}', '${FANTASMA}', '${A}', 'GBPUSD', '[]', '2026-01-08T08:00:00Z');
insert into public.session_chart_config (id, session_id, user_id, config, updated_at) values ('${C3}', '${FANTASMA}', '${A}', '{}', '2026-01-08T09:00:00Z');
insert into public.sim_sessions (id, user_id, name, pair, timeframe, date_from, date_to, capital, balance, challenge_parent_id, created_at) values
  ('${H3}', '${A}', 'Alumno A huerfana', 'EURUSD', 'H1', '2026-01-01', '2026-02-01', 10000, 10000, '${FANTASMA}', '2026-01-08T10:00:00Z');
set session_replication_role = origin;
insert into public.session_drawings (id, session_id, user_id, pair, data, updated_at) values ('${D2}', '${SB}', '${A}', 'EURUSD', '[{"secreto":2}]', '2026-01-06T08:00:00Z');
insert into public.session_chart_config (id, session_id, user_id, config, updated_at) values ('${C2}', '${SB}', '${A}', '{"secreto":2}', '2026-01-06T09:00:00Z');
insert into public.sim_sessions (id, user_id, name, pair, timeframe, date_from, date_to, capital, balance, challenge_parent_id, created_at) values
  ('${H2}', '${A}', 'Alumno A con padre de B', 'EURUSD', 'H1', '2026-01-01', '2026-02-01', 10000, 10000, '${SB}', '2026-01-06T10:00:00Z');`, 'c')
  ver('control: los ocho casos se plantan (como superusuario; la FK, desactivada para los de sesion inexistente)', planta.ok, planta.err.split('\n')[0])
  const c = s12('c')
  const caso = (s, id) => c.filas.find(f => f.s === s && f.o === id)
  oraculo('S12-control', 'los ocho casos aparecen, cada uno en su seccion (tabla.tipo), con a donde apunta y su fecha; cada total dice 1; las filas sanas (trade, dibujo, config e hija propios) no salen',
    c.ok && TOTALES.every(k => total(c, k) === '1')
    && caso('sim_trades.usuario_distinto', T2)?.d === `sesion=${SB} · fecha=2026-01-06 12:30:00 UTC`
    && caso('sim_trades.sesion_inexistente', T3)?.d === `sesion=${FANTASMA} · fecha=2026-01-07 09:00:00 UTC`
    && caso('session_drawings.usuario_distinto', D2)?.d === `sesion=${SB} · fecha=2026-01-06 08:00:00 UTC`
    && caso('session_drawings.sesion_inexistente', D3)?.d === `sesion=${FANTASMA} · fecha=2026-01-08 08:00:00 UTC`
    && caso('session_chart_config.usuario_distinto', C2)?.d === `sesion=${SB} · fecha=2026-01-06 09:00:00 UTC`
    && caso('session_chart_config.sesion_inexistente', C3)?.d === `sesion=${FANTASMA} · fecha=2026-01-08 09:00:00 UTC`
    && caso('sim_sessions.usuario_distinto', H2)?.d === `padre=${SB} · fecha=2026-01-06 10:00:00 UTC`
    && caso('sim_sessions.sesion_inexistente', H3)?.d === `padre=${FANTASMA} · fecha=2026-01-08 10:00:00 UTC`
    && ![T1, SANA_D, SANA_C, SANA_H].some(id => c.filas.some(f => f.o === id)), c.filas.filter(f => f.s !== 'hora').map(f => `${f.s}|${f.o}|${f.d}`).join(' / '))
  oraculo('S12-nada-personal', 'nada personal en la salida: ni emails, ni nombres de sesion, ni importes, ni contenido de dibujos o config, ni el user_id',
    !/@ejemplo\.test|Alumno|123\.45|55\.5|-55|\b7\.00\b|secreto/.test(c.texto.replace(/^hora\|.*$/m, '')) && !c.texto.includes(A) && !c.texto.includes(B), c.texto.slice(0, 300))
  const rl = r.filas.filter(f => f.s === 'rls')
  oraculo('S12-rls', 'limpio: rls=true en las cuatro tablas (Astra E1R3-01)', rl.length === 4 && rl.every(f => f.d === 'rls=true'), rl.map(f => f.o + ' ' + f.d).join(' / '))
  pg.psql('alter table public.session_chart_config disable row level security;', 'c')
  const rc = s12('c').filas.filter(f => f.s === 'rls')
  oraculo('S12-rls-control', 'CONTROL: con la RLS apagada en session_chart_config, s12 la muestra rls=false', rc.find(f => f.o === 'session_chart_config')?.d === 'rls=false' && rc.filter(f => f.d === 'rls=true').length === 3, rc.map(f => f.o + ' ' + f.d).join(' / '))
  const sinComentarios = S12.replace(/--.*$/gm, '')
  oraculo('S12-una-select', 'el texto es UNA sola sentencia SELECT (con WITH), sin escrituras ni EXECUTE',
    (sinComentarios.match(/;/g) || []).length === 1 && /^\s*with\b/i.test(sinComentarios) && !/\b(insert|update|delete|truncate|execute|create|alter|drop|grant|revoke|call|do)\b/i.test(sinComentarios), '')
} finally { pg.cierra() }
fin()
