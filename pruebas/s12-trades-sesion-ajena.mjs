/**
 * S12 · TRADES EN UNA SESION AJENA O INEXISTENTE · ENSAYO EN POSTGRESQL 17 LOCAL
 * (CTO 13-oct, o.16.7: paso previo OBLIGATORIO a la preparatoria en el runbook, junto a s11)
 *
 * Montaje: produccion segun s04 LITERAL + sql/sim-002 + sql/sim-003 (como s11). Datos inventados.
 *   1 limpio: en una transaccion READ ONLY, los dos totales a 0 y ninguna fila de caso; FIN
 *   2 CONTROL: dos casos plantados (como superusuario): un trade de A en la sesion de B y un trade
 *     con un session_id que no existe (FK desactivada para plantarlo). Los dos aparecen, cada uno en
 *     su seccion, con su id, su sesion y su fecha; los totales dicen 1 y 1
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
const DATOS = `
insert into auth.users values ('${A}'), ('${B}');
insert into public.profiles (id, email, plan, simulador_activo) values ('${A}', 'a@ejemplo.test', 'basic', true), ('${B}', 'b@ejemplo.test', 'basic', true);
insert into public.sim_sessions (id, user_id, name, pair, timeframe, date_from, date_to, capital, balance) values
  ('${SA}', '${A}', 'Alumno A sesion', 'EURUSD', 'H1', '2026-01-01', '2026-02-01', 10000, 10000),
  ('${SB}', '${B}', 'Alumno B sesion', 'EURUSD', 'H1', '2026-01-01', '2026-02-01', 10000, 10000);
insert into public.sim_trades (id, session_id, user_id, pair, side, entry_price, lots, pnl, opened_at, closed_at) values
  ('${T1}', '${SA}', '${A}', 'EURUSD', 'BUY', 1.1, 1, 123.45, '2026-01-05T10:00:00Z', '2026-01-05T11:00:00Z');`
const monta = db => {
  const pasos = [pg.psql(`create database ${db}`, 'postgres'), pg.psql(PRODUCCION, db), pg.psql(S2, db), pg.psql(EJECUTOR, db), pgx(S3, db), pg.psql(DATOS, db)]
  if (!pasos.every(x => x.ok)) throw new Error(`montaje ${db}: ${pasos.map(x => x.err).join(' ')}`)
}
const s12 = db => {
  const r = pg.psql(`begin transaction read only;\n\\pset fieldsep '|'\n${S12}\nrollback;`, db)
  return { ok: r.ok, err: r.err, texto: r.out, filas: r.out.split('\n').filter(l => l.includes('|')).map(l => { const [s, o, ...d] = l.split('|'); return { s, o, d: d.join('|') } }) }
}
const total = (r, k) => r.filas.find(f => f.s === 'total' && f.o === k)?.d

try {
  pg.arranca()
  titulo('1 · limpio')
  monta('p')
  const r = s12('p')
  oraculo('S12-limpio', 'limpio, en una transaccion READ ONLY: los dos totales a 0, ninguna fila de caso, y acaba en FIN | s12 | consulta',
    r.ok && total(r, 'usuario_distinto') === '0' && total(r, 'sesion_inexistente') === '0' && !r.filas.some(f => /^(usuario_distinto|sesion_inexistente)$/.test(f.s))
    && r.filas.at(-1)?.s === 'FIN' && r.filas.at(-1)?.o === 's12', r.err.split('\n')[0] || r.texto.slice(0, 200))

  titulo('2 · CONTROL: dos casos plantados')
  monta('c')
  const planta = pg.psql(`insert into public.sim_trades (id, session_id, user_id, pair, side, entry_price, lots, pnl, opened_at, closed_at) values
  ('${T2}', '${SB}', '${A}', 'EURUSD', 'SELL', 1.2, 2, -55.5, '2026-01-06T10:00:00Z', '2026-01-06T12:30:00Z');
set session_replication_role = replica;
insert into public.sim_trades (id, session_id, user_id, pair, side, entry_price, lots, pnl, opened_at) values
  ('${T3}', '${FANTASMA}', '${A}', 'EURUSD', 'BUY', 1.3, 1, 7, '2026-01-07T09:00:00Z');
set session_replication_role = origin;`, 'c')
  ver('control: los dos casos se plantan (como superusuario; la FK, desactivada para el segundo)', planta.ok, planta.err.split('\n')[0])
  const c = s12('c')
  const caso = (s, id) => c.filas.find(f => f.s === s && f.o === id)
  oraculo('S12-control', 'los dos casos aparecen, cada uno en su seccion, con su sesion y su fecha (closed_at, o opened_at si no hay); totales 1 y 1; el trade sano no sale',
    c.ok && total(c, 'usuario_distinto') === '1' && total(c, 'sesion_inexistente') === '1'
    && caso('usuario_distinto', T2)?.d === `sesion=${SB} · fecha=2026-01-06 12:30:00 UTC`
    && caso('sesion_inexistente', T3)?.d === `sesion=${FANTASMA} · fecha=2026-01-07 09:00:00 UTC`
    && !c.filas.some(f => f.o === T1), c.filas.filter(f => f.s !== 'hora').map(f => `${f.s}|${f.o}|${f.d}`).join(' / '))
  oraculo('S12-nada-personal', 'nada personal en la salida: ni emails, ni nombres de sesion, ni importes, ni el user_id',
    !/@ejemplo\.test|Alumno|123\.45|55\.5|-55|\b7\.00\b/.test(c.texto.replace(/^hora\|.*$/m, '')) && !c.texto.includes(A) && !c.texto.includes(B), c.texto.slice(0, 300))
  const sinComentarios = S12.replace(/--.*$/gm, '')
  oraculo('S12-una-select', 'el texto es UNA sola sentencia SELECT (con WITH), sin escrituras ni EXECUTE',
    (sinComentarios.match(/;/g) || []).length === 1 && /^\s*with\b/i.test(sinComentarios) && !/\b(insert|update|delete|truncate|execute|create|alter|drop|grant|revoke|call|do)\b/i.test(sinComentarios), '')
} finally { pg.cierra() }
fin()
