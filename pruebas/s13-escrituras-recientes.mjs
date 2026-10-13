/**
 * S13 · ESCRITURAS DE LOS ULTIMOS 30 MINUTOS · ENSAYO EN POSTGRESQL 17 LOCAL
 * (CTO 13-oct: runbook de la etapa 1, paso 7, la comprobacion de punta a punta de o.9 y k.4 e)
 *
 * Montaje: produccion segun s04 LITERAL + sql/sim-002 + sql/sim-003 + sql/sim-004a-preparatoria (como
 * sim-004a.mjs, aplicada por el ejecutor no superusuario pgx). Datos inventados. s13 se corre ENTERA,
 * tal cual, dentro de una transaccion READ ONLY.
 *   1 limpio: registro vacio → ninguna fila «escritura», totales 0 y 0 (de servicio: 0), FIN
 *   2 un cierre FIRMADO (sim_cierre_v0 con x-sim-cliente) y un cierre SIN FIRMA (cliente viejo: INSERT y
 *     UPDATE sueltos) → aparecen sus cuatro escrituras bien clasificadas (firma y «saldo: cambia»);
 *     ademas una pausa vieja (mismo saldo: «no cambia (lo menciona)»), una de service_role (firmada ·
 *     servicio) y una del dueño por SQL (sin firma, ninguno)
 *   3 la ventana: una escritura de hace 31 minutos NO aparece y una de hace 29 SI (plantadas en el
 *     registro como superusuario, con los disparadores desactivados: el registro es inmutable)
 *   4 nada personal (ni user_id, ni emails, ni importes) y una sola SELECT sin escrituras ni EXECUTE
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { titulo, ver, oraculo, fin, REPO } from './lib.mjs'
import { BIN, hayPostgres, cluster } from './pg-ensayo.mjs'
import { PRODUCCION } from './estado-s04.mjs'
if (!hayPostgres()) { ver(`PostgreSQL 17 en ${BIN}: NO hay, la prueba no se ha ejecutado`, false); fin() }
const lee = p => readFileSync(path.join(REPO, p), 'utf8')
const S13 = lee('sql/consultas/s13-escrituras-recientes.sql')
const S2 = lee('sql/sim-002-lectura-estable.sql')
const S3 = lee('sql/sim-003-persistencia-aditiva.sql')
const PREP = lee('sql/sim-004a-preparatoria.sql')
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
const L = v => (v == null ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`)
const u = k => `00000000-0000-4000-8000-${String(k).padStart(12, '0')}`
const A = u(1), SA = u(101), SV = u(102)
const DATOS = `
insert into auth.users values ('${A}');
insert into public.profiles (id, email, plan, simulador_activo) values ('${A}', 'a@ejemplo.test', 'basic', true);
insert into public.sim_sessions (id, user_id, name, pair, timeframe, date_from, date_to, capital, balance) values
  ('${SA}', '${A}', 'Alumno A sesion', 'EURUSD', 'H1', '2026-01-01', '2026-02-01', 10000, 10000),
  ('${SV}', '${A}', 'Alumno A vieja', 'EURUSD', 'H1', '2026-01-01', '2026-02-01', 10000, 10000);`
const monta = db => {
  const pasos = [pg.psql(`create database ${db}`, 'postgres'), pg.psql(PRODUCCION, db), pg.psql(S2, db), pg.psql(EJECUTOR, db), pgx(S3, db), pg.psql(DATOS, db), pgx(PREP, db)]
  if (!pasos.every(x => x.ok)) throw new Error(`montaje ${db}: ${pasos.map(x => x.err).join(' ')}`)
}
// una escritura «de PostgREST»: rol del JWT, sub y cabeceras
const escribe = ({ rol = 'authenticated', cliente } = {}, q, db) => pg.psql(`begin; set local role ${rol}; select set_config('request.jwt.claims', ${L(JSON.stringify({ role: rol, sub: A }))}, true), set_config('request.jwt.claim.sub', ${L(A)}, true), set_config('request.headers', ${L(JSON.stringify(cliente ? { 'x-sim-cliente': cliente } : { 'user-agent': 'x' }))}, true) \\g /dev/null
${q}
commit;`, db)
const s13 = db => {
  const r = pg.psql(`begin transaction read only;\n\\pset fieldsep '|'\n${S13}\nrollback;`, db)
  return { ok: r.ok, err: r.err, texto: r.out, filas: r.out.split('\n').filter(l => l.includes('|')).map(l => { const [s, o, ...d] = l.split('|'); return { s, o, d: d.join('|') } }) }
}
const total = (r, k) => r.filas.find(f => f.s === 'total' && f.o === k)?.d
const escrituras = r => r.filas.filter(f => f.s === 'escritura')
const trade = (id, pnl) => JSON.stringify({ id, user_id: A, pair: 'EURUSD', side: 'BUY', lots: '1.00', entry_price: '1.10000', exit_price: '1.12345', pnl, result: 'WIN', opened_at: '2026-01-05T10:00:00Z', closed_at: '2026-01-05T11:00:00Z' })

try {
  pg.arranca()
  titulo('1 · limpio')
  monta('p')
  const r = s13('p')
  oraculo('S13-limpio', 'registro vacio, en una transaccion READ ONLY: ninguna escritura, totales «firmadas 0 (de servicio: 0)» y «sin firma 0», y acaba en FIN | s13 | consulta',
    r.ok && escrituras(r).length === 0 && total(r, 'firmadas') === '0 (de servicio: 0)' && total(r, 'sin firma') === '0'
    && r.filas.at(-1)?.s === 'FIN' && r.filas.at(-1)?.o === 's13', r.err.split('\n')[0] || r.texto.slice(0, 300))

  titulo('2 · un cierre firmado y otro sin firma (y tres mas)')
  monta('c')
  const firmado = escribe({ cliente: 'etapa1-1' }, `select public.sim_cierre_v0('${SA}', 10123.45, 1767700000, ${L(trade(u(901), '123.45'))}::jsonb) \\g /dev/null`, 'c')
  const viejo = escribe({}, `insert into public.sim_trades (id, session_id, user_id, pair, side, entry_price, lots, pnl, opened_at) values ('${u(902)}', '${SV}', '${A}', 'EURUSD', 'SELL', 1.2, 1, -55.5, now());
update public.sim_sessions set balance = 9944.5 where id = '${SV}';`, 'c')
  const pausa = escribe({}, `update public.sim_sessions set balance = 9944.5, last_timestamp = 1767700100 where id = '${SV}';`, 'c')
  const servicio = escribe({ rol: 'service_role' }, `update public.sim_sessions set status = 'active' where id = '${SA}';`, 'c')
  const duenio = pg.psql(`update public.sim_sessions set timeframe = 'M5' where id = '${SV}';`, 'c')
  ver('control: las cinco escrituras se hacen (cierre firmado, cierre viejo, pausa vieja, service_role, dueño)', [firmado, viejo, pausa, servicio, duenio].every(x => x.ok), [firmado, viejo, pausa, servicio, duenio].map(x => x.err.split('\n')[0]).join(' | '))
  const c = s13('c'), es = escrituras(c)
  const hay = re => es.filter(f => re.test(f.d)).length
  oraculo('S13-firmado', 'el cierre firmado: sim_trades INSERT y sim_sessions UPDATE de su sesion, «firmada · etapa1-1 (authenticated)», y el UPDATE con «saldo: cambia»',
    hay(new RegExp(`^sim_trades INSERT · sesion=${SA} · firmada · etapa1-1 \\(authenticated\\) · saldo: -$`)) === 1
    && hay(new RegExp(`^sim_sessions UPDATE · sesion=${SA} · firmada · etapa1-1 \\(authenticated\\) · saldo: cambia$`)) === 1, es.map(f => f.d).join(' / '))
  oraculo('S13-sin-firma', 'el cierre sin firma (cliente viejo): sim_trades INSERT y sim_sessions UPDATE «sin firma (authenticated)», el UPDATE con «saldo: cambia»; la pausa vieja «no cambia (lo menciona)»',
    hay(new RegExp(`^sim_trades INSERT · sesion=${SV} · sin firma \\(authenticated\\) · saldo: -$`)) === 1
    && hay(new RegExp(`^sim_sessions UPDATE · sesion=${SV} · sin firma \\(authenticated\\) · saldo: cambia$`)) === 1
    && hay(new RegExp(`^sim_sessions UPDATE · sesion=${SV} · sin firma \\(authenticated\\) · saldo: no cambia \\(lo menciona\\)$`)) === 1, es.map(f => f.d).join(' / '))
  oraculo('S13-otras-firmas', 'service_role sale «firmada · servicio (service_role, sin cabecera)» y el SQL directo del dueño «sin firma (ninguno)», los dos con «saldo: no cambia»',
    hay(new RegExp(`^sim_sessions UPDATE · sesion=${SA} · firmada · servicio \\(service_role, sin cabecera\\) · saldo: no cambia$`)) === 1
    && hay(new RegExp(`^sim_sessions UPDATE · sesion=${SV} · sin firma \\(ninguno\\) · saldo: no cambia$`)) === 1, es.map(f => f.d).join(' / '))
  oraculo('S13-totales', 'totales: 7 escrituras; firmadas 3 (de servicio: 1) y sin firma 4; con la hora (UTC, milisegundos) y en orden',
    es.length === 7 && total(c, 'firmadas') === '3 (de servicio: 1)' && total(c, 'sin firma') === '4'
    && es.every(f => /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d\.\d{3}$/.test(f.o)) && es.map(f => f.o).join() === [...es.map(f => f.o)].sort().join(), `${es.length} · ${total(c, 'firmadas')} · ${total(c, 'sin firma')}`)
  oraculo('S13-nada-personal', 'nada personal: ni el user_id, ni emails, ni nombres, ni importes (pnl, delta, saldos)',
    !c.texto.includes(A) && !/@ejemplo\.test|Alumno|123\.45|55\.5|10123|9944|1\.12345/.test(c.texto.replace(/^hora\|.*$/gm, '')), c.texto.slice(0, 300))

  titulo('3 · la ventana de 30 minutos')
  const planta = pg.psql(`set session_replication_role = replica;
insert into public.sim_escrituras_v0 (session_id, user_id, tabla, operacion, xact, cliente, rol_jwt, rol_guc, columnas, delta, trade_id, pnl, en) values
  ('${u(931)}', '${A}', 'sim_sessions', 'UPDATE', '1', 'etapa1-1', 'authenticated', 'authenticated', '{balance}', 1, null, null, now() - interval '31 minutes'),
  ('${u(929)}', '${A}', 'sim_sessions', 'UPDATE', '2', 'etapa1-1', 'authenticated', 'authenticated', '{balance}', 1, null, null, now() - interval '29 minutes');
set session_replication_role = origin;`, 'c')
  ver('control: dos filas plantadas en el registro, de hace 31 y 29 minutos (como superusuario, sin disparadores)', planta.ok, planta.err.split('\n')[0])
  const v = s13('c'), ev = escrituras(v)
  oraculo('S13-ventana', 'la de hace 31 minutos NO aparece; la de hace 29 SI (firmada, saldo cambia); los totales la cuentan',
    !ev.some(f => f.d.includes(u(931))) && ev.filter(f => f.d.includes(u(929)) && /firmada · etapa1-1 \(authenticated\) · saldo: cambia$/.test(f.d)).length === 1
    && total(v, 'firmadas') === '4 (de servicio: 1)', ev.map(f => f.d).join(' / '))
  // sin comentarios y sin los literales de texto (s13 compara con 'UPDATE', que no es una orden)
  const sinComentarios = S13.replace(/--.*$/gm, ''), sinLiterales = sinComentarios.replace(/'[^']*'/g, "''")
  const ordenes = sinLiterales.match(/\b(insert|update|delete|truncate|execute|create|alter|drop|grant|revoke|call|do)\b/gi) || []
  oraculo('S13-una-select', 'el texto es UNA sola sentencia SELECT (con WITH), sin escrituras ni EXECUTE fuera de los literales, y sin nada que editar (ni uuid ni email)',
    (sinComentarios.match(/;/g) || []).length === 1 && /^\s*with\b/i.test(sinComentarios) && ordenes.length === 0
    && !/[0-9a-f]{8}-[0-9a-f]{4}-|@/.test(sinComentarios), ordenes.join(','))
} finally { pg.cierra() }
fin()
