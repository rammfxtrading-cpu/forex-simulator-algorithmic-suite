/**
 * s10 · CONCILIACION DEL REGISTRO, ENSAYADA EN POSTGRESQL 17 LOCAL (etapa 1)
 *
 * Montaje: s04 literal + sim-002 + sim-003 + sim-004a-preparatoria (pgx, no superusuario, default
 * ACL de s06). Escrituras «de PostgREST» emuladas (SET LOCAL ROLE + claims + cabeceras), como en
 * sim-004a.mjs. s10 se corre ENTERA, tal cual, dentro de una transaccion READ ONLY, como pgx (el
 * dueño). Datos INVENTADOS. Nada toca Supabase.
 *
 * Las distancias de tiempo (> 10 s) se fabrican moviendo `en` como dueño con la inmutabilidad
 * quitada SOLO para el montaje, y se vuelve a poner (la guarda de la preparatoria lo comprueba).
 *
 *   1 la clasificacion de l.2 / m.1 / o.2 / o.3, caso por caso (l.5): cada sesion aislada
 *   2 los casos de Astra (m.1) y el cruce de pnl 0
 *   3 anomalias (k.3.10, l.4) y marcas huerfanas / duplicadas / en transaccion ajena (n.7, n.9)
 *   4 alumnos, volumen, service_role aparte, foto y hash (n.2, o.0)
 *   5 statement_timeout efectivo (l.1 c): con valor y con 0 (sin limite)
 *   6 solo lectura: la transaccion READ ONLY no se queja; el registro no cambia
 *   7 mutantes de l.5 y k.3.10 (sobre la propia s10 o sobre las parejas) → se ven
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { titulo, ver, oraculo, fin, REPO } from './lib.mjs'
import { BIN, hayPostgres, cluster } from './pg-ensayo.mjs'
import { PRODUCCION } from './estado-s04.mjs'
if (!hayPostgres()) { ver(`PostgreSQL 17 en ${BIN}: NO hay, la prueba no se ha ejecutado`, false); fin() }
const lee = p => readFileSync(path.join(REPO, p), 'utf8')
const S10 = lee('sql/consultas/s10-conciliacion.sql')
const pg = cluster()
const psqlEn = pg.psql
pg.psql = (q, db = 'p') => psqlEn(q, db)
const EJECUTOR = `
create role pgx login nosuperuser bypassrls createrole inherit;
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
const L = v => (v == null ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`)
const u = k => `00000000-0000-4000-8000-${String(k).padStart(12, '0')}`
const A = u(1), B = u(2)
let nSes = 100
// una sesion nueva de A, para aislar cada caso. Hija de una raiz de A: el cupo real de s04 (6
// raices) no cuenta las hijas, y la clasificacion no depende de ello.
const RAIZ = u(99)
const sesion = () => {
  const s = u(++nSes)
  const r = pg.psql(`insert into public.sim_sessions (id, user_id, name, pair, timeframe, date_from, date_to, capital, balance, challenge_parent_id) values ('${s}', '${A}', 'x', 'EURUSD', 'H1', '2026-01-01', '2026-02-01', 10000, 10000, '${RAIZ}');`)
  if (!r.ok) throw new Error('sesion del montaje: ' + r.err)
  return s
}
const escribe = ({ rol = 'authenticated', sub = A, cliente, claims, headers } = {}, q) => {
  const cl = claims !== undefined ? claims : JSON.stringify({ role: rol, sub })
  const he = headers !== undefined ? headers : JSON.stringify(cliente === undefined ? { 'user-agent': 'x' } : { 'x-sim-cliente': cliente })
  const r = pg.psql(`begin; set local role ${rol}; select set_config('request.jwt.claims', ${L(cl)}, true), set_config('request.jwt.claim.sub', ${L(sub)}, true), set_config('request.headers', ${L(he)}, true) \\g /dev/null
${q}
commit;`)
  if (!r.ok) throw new Error('escritura del montaje: ' + r.err)
  return r
}
const viejo = q => escribe({}, q)
let nT = 1000
const trade = (s, pnl) => viejo(`insert into public.sim_trades (id, session_id, user_id, pair, side, entry_price, lots, pnl, opened_at) values ('${u(++nT)}', '${s}', '${A}', 'EURUSD', 'BUY', 1.1, 1, ${pnl}, now());`)
const saldo = (s, d, extra = '') => viejo(`update public.sim_sessions set balance = balance + ${d}${extra} where id = '${s}';`)
// mover en (segundos) de las filas de una sesion que cumplan algo, como dueño, solo en el montaje
const mueve = (s, donde, seg) => {
  const r = pgx(`alter table public.sim_escrituras_v0 disable trigger sim_escrituras_v0_inmutable_fila;
update public.sim_escrituras_v0 set en = en + interval '${seg} seconds' where session_id = '${s}' and ${donde};
alter table public.sim_escrituras_v0 enable trigger sim_escrituras_v0_inmutable_fila;`)
  if (!r.ok) throw new Error('mueve: ' + r.err)
}
// fija la distancia exacta entre el INSERT del trade y el UPDATE de la sesion (segundos)
const separa = (s, seg) => {
  const r = pgx(`alter table public.sim_escrituras_v0 disable trigger sim_escrituras_v0_inmutable_fila;
update public.sim_escrituras_v0 set en = (select i.en from public.sim_escrituras_v0 i where i.session_id = '${s}' and i.tabla = 'sim_trades' and i.operacion = 'INSERT') + interval '${seg} seconds'
 where session_id = '${s}' and tabla = 'sim_sessions' and operacion = 'UPDATE';
alter table public.sim_escrituras_v0 enable trigger sim_escrituras_v0_inmutable_fila;`)
  if (!r.ok) throw new Error('separa: ' + r.err)
}
const corre = (sql = S10) => {
  const r = pgx(`begin transaction read only;\n${sql}\nrollback;`)
  return { ...r, filas: r.out.split('\n').filter(l => l && !/^(BEGIN|ROLLBACK)$/.test(l)).map(l => l.split('|')) }
}
const de = (res, s) => res.filas.filter(f => f[1] === s || (f[2] || '').includes(`sesion=${s}`))
const clases = (res, s) => res.filas.filter(f => ['incidencia', 'dudoso'].includes(f[0]) && f[2].includes(`sesion=${s}`)).map(f => f[2].split(' · ')[0]).sort()
const pares = (res, s) => res.filas.filter(f => f[0] === 'pareja' && f[1] === s).length

try {
  pg.arranca()
  psqlEn('create database p', 'postgres')
  const m = [pg.psql(PRODUCCION), pg.psql(lee('sql/sim-002-lectura-estable.sql')), pg.psql(EJECUTOR), pgx(lee('sql/sim-003-persistencia-aditiva.sql')),
    pg.psql(`insert into auth.users values ('${A}'), ('${B}'); insert into public.profiles (id, email, simulador_activo) values ('${A}', 'a@ejemplo.test', true), ('${B}', 'b@ejemplo.test', true);`),
    pgx(lee('sql/sim-004a-preparatoria.sql')),
    pg.psql(`insert into public.sim_sessions (id, user_id, name, pair, timeframe, date_from, date_to) values ('${RAIZ}', '${A}', 'raiz', 'EURUSD', 'H1', '2026-01-01', '2026-02-01');`)]
  ver('montaje: s04 + sim-002 + sim-003 + preparatoria (pgx)', m.every(x => x.ok) && /FIN\|sim-004a-preparatoria aplicada$/.test(m.at(-2).out), m.map(err1).join(' '))

  // ── los casos, cada uno en su sesion ───────────────────────────────────
  const C = {}
  C.total = sesion(); trade(C.total, 25); saldo(C.total, 25, ', last_timestamp = 1')                       // cierre total completo
  C.parcial = sesion(); viejo(`update public.sim_sessions set balance = balance + 10 where id = '${C.parcial}'; insert into public.sim_trades (session_id, user_id, pair, side, entry_price, lots, pnl, opened_at) values ('${C.parcial}', '${A}', 'EURUSD', 'BUY', 1.1, 1, 10, now());`)
  C.centimo = sesion(); trade(C.centimo, 12.34); saldo(C.centimo, 12.35)                                   // redondeo: 1 centimo
  C.dosCent = sesion(); trade(C.dosCent, 12.34); saldo(C.dosCent, 12.36)                                   // 2 centimos: no casan
  C.mas100 = sesion(); saldo(C.mas100, 100); saldo(C.mas100, -100)                                          // ±100 sin trades
  C.tradeSolo = sesion(); trade(C.tradeSolo, 5)                                                             // INSERT sin pareja
  C.lejos = sesion(); trade(C.lejos, 7); saldo(C.lejos, 7); separa(C.lejos, 10.000001)  // a 10 s y 1 µs
  C.cerca = sesion(); trade(C.cerca, 8); saldo(C.cerca, 8); separa(C.cerca, 10)          // a 10 s justos
  // o.10.3: frontera de 0,01 donde el float8 se equivoca SIEMPRE (IEEE-754, determinista)
  const FLOAT = [['0.30', '0.31'], ['1.10', '1.11'], ['0.29', '0.30'], ['100.00', '100.01']]
  C.float = FLOAT.map(([p, d]) => { const s = sesion(); trade(s, p); saldo(s, d); return s })
  C.centimoF = C.float[1]
  C.be = sesion(); trade(C.be, 0); viejo(`update public.sim_sessions set balance = balance, last_timestamp = 5 where id = '${C.be}';`) // break-even completo
  C.beSin = sesion(); viejo(`update public.sim_sessions set balance = balance, last_timestamp = 5 where id = '${C.beSin}';`)          // break-even sin trade
  C.pnl0Solo = sesion(); trade(C.pnl0Solo, 0)                                                               // trade pnl 0 sin UPDATE
  C.pausa = sesion(); viejo(`update public.sim_sessions set balance = balance, last_timestamp = 9 where id = '${C.pausa}';`)
  C.salida = sesion(); viejo(`update public.sim_sessions set last_timestamp = 10, balance = balance, timeframe = 'H1' where id = '${C.salida}';`)
  C.guardado = sesion(); viejo(`update public.sim_sessions set last_timestamp = 11, timeframe = 'H1' where id = '${C.guardado}';`)
  C.tf = sesion(); viejo(`update public.sim_sessions set timeframe = 'M5' where id = '${C.tf}';`)
  C.tfIgual = sesion(); viejo(`update public.sim_sessions set timeframe = 'H1' where id = '${C.tfIgual}';`)   // no cambia nada, no menciona balance (o.3)
  C.borra = sesion(); trade(C.borra, 3); saldo(C.borra, 3); viejo(`delete from public.sim_sessions where id = '${C.borra}';`)  // cascada
  C.delTrade = sesion(); trade(C.delTrade, 4); viejo(`delete from public.sim_trades where session_id = '${C.delTrade}';`) // DELETE suelto
  C.delLuego = sesion(); trade(C.delLuego, 4); viejo(`delete from public.sim_trades where session_id = '${C.delLuego}';`); viejo(`delete from public.sim_sessions where id = '${C.delLuego}';`) // DELETE de trade y, en OTRA transaccion, el de la sesion
  C.creaMal = u(++nSes); viejo(`insert into public.sim_sessions (id, user_id, name, pair, timeframe, date_from, date_to, capital, balance) values ('${C.creaMal}', '${A}', 'x', 'EURUSD', 'H1', '2026-01-01', '2026-02-01', 10000, 10500);`)
  C.creaBien = u(++nSes); viejo(`insert into public.sim_sessions (id, user_id, name, pair, timeframe, date_from, date_to, capital, balance) values ('${C.creaBien}', '${A}', 'x', 'EURUSD', 'H1', '2026-01-01', '2026-02-01', 10000, 10000);`)
  C.notas = sesion(); escribe({ cliente: 'etapa1-1' }, `insert into public.sim_trades (id, session_id, user_id, pair, side, entry_price, lots, pnl, opened_at) values ('${u(1900)}', '${C.notas}', '${A}', 'EURUSD', 'BUY', 1.1, 1, 1, now()); update public.sim_sessions set balance = balance + 1 where id = '${C.notas}';`)
  viejo(`update public.sim_trades set notes = 'n', tags = '{a}' where id = '${u(1900)}';`)
  C.pnlTrade = sesion(); escribe({ cliente: 'etapa1-1' }, `insert into public.sim_trades (id, session_id, user_id, pair, side, entry_price, lots, pnl, opened_at) values ('${u(1901)}', '${C.pnlTrade}', '${A}', 'EURUSD', 'BUY', 1.1, 1, 1, now()); update public.sim_sessions set balance = balance + 1 where id = '${C.pnlTrade}';`)
  viejo(`update public.sim_trades set pnl = 2, notes = 'n' where id = '${u(1901)}';`)
  C.firmado = sesion(); escribe({ cliente: 'etapa1-1' }, `update public.sim_sessions set balance = balance + 50 where id = '${C.firmado}';`)  // firmado: no se clasifica
  C.servidor = sesion(); escribe({ rol: 'service_role' }, `update public.sim_sessions set balance = balance + 60 where id = '${C.servidor}';`)
  // los dos casos de Astra (m.1) y el cruce
  C.astra1 = sesion(); viejo(`update public.sim_sessions set balance = balance, last_timestamp = 20 where id = '${C.astra1}';`) // INSERT fallido con {error}: solo queda el UPDATE
  C.astra2 = sesion(); viejo(`update public.sim_sessions set balance = balance where id = '${C.astra2}';`)          // parcial pnl 0, su trade perdido
  trade(C.astra2, 0); viejo(`update public.sim_sessions set balance = balance, last_timestamp = 21 where id = '${C.astra2}';`) // cierre total pnl 0 correcto
  C.reusa = sesion(); trade(C.reusa, 30); saldo(C.reusa, 30); saldo(C.reusa, 30)                           // dos UPDATE y un trade: uno sobra
  C.soloNoBal = sesion(); trade(C.soloNoBal, 0); viejo(`update public.sim_sessions set timeframe = 'M1' where id = '${C.soloNoBal}';`); viejo(`update public.sim_sessions set balance = balance, last_timestamp = 30 where id = '${C.soloNoBal}';`)
  // anomalias (k.3.10)
  C.anom = sesion()
  pgx(`update public.sim_sessions set timeframe = 'D1' where id = '${C.anom}';`)                                   // SQL directo del dueño: NULL / none
  pg.psql(`begin; set local role authenticated; select set_config('request.jwt.claim.sub', '${A}', true); update public.sim_sessions set timeframe = 'H4' where id = '${C.anom}'; commit;`) // SET ROLE sin JWT (solo el sub, para la RLS): NULL / authenticated
  pg.psql(`begin; select set_config('request.jwt.claims', '{"role":"authenticated","sub":"${A}"}', true); update public.sim_sessions set balance = balance + 70 where id = '${C.anom}'; commit;`) // JWT a mano: authenticated / none
  C.anon = sesion()
  pg.psql(`begin; select set_config('request.jwt.claims', '{"role":"anon"}', true); update public.sim_sessions set balance = balance + 80 where id = '${C.anon}'; commit;`) // JWT anon a mano, sin cabecera
  ver('montaje de los casos: sin errores', true)

  const r = corre()
  oraculo('S10-corre', 's10 entera, en una transaccion READ ONLY, como el dueño: sin error y acaba en FIN | s10 | consulta',
    r.ok && r.filas.at(-1)?.join('|') === 'FIN|s10|consulta'
    && ['hora', 'timeout', 'estado', 'volumen', 'alumno', 'pareja', 'incidencia', 'dudoso', 'anomalia', 'foto', 'service_role'].every(sec => r.filas.some(f => f[0] === sec)),
    err1(r) || r.filas.at(-1)?.join('|'))
  const nUltimo = pg.psql('select count(*) || max(id) from public.sim_escrituras_v0').out
  ver('el registro no cambia por correr s10', pg.psql('select count(*) || max(id) from public.sim_escrituras_v0').out === nUltimo)

  titulo('1 · clasificacion caso a caso (l.2, m.1, o.2, o.3; l.5)')
  // cada caso tiene que verse en la foto de s10 con sus abiertas: un «nada» sin foto aprobaria en vacio
  const O = (id, desc, s, esperadas, nPares, { sinFoto = false, ademas = true } = {}) => {
    const c = clases(r, s), p = pares(r, s)
    const fo = r.filas.find(f => f[0] === 'foto' && f[1] === s)?.[2] || ''
    const visto = sinFoto ? fo === '' : new RegExp(`^ids=[0-9,]+ · abiertas=${esperadas.length} · sha256=[0-9a-f]{64}$`).test(fo)
    oraculo(id, desc, ademas && visto && JSON.stringify(c) === JSON.stringify(esperadas.slice().sort()) && (nPares === undefined || p === nPares), `${JSON.stringify(c)} · parejas ${p} · foto ${fo.slice(0, 40) || '-'}`)
  }
  O('L-total', 'cierre total completo → 1 pareja, nada abierto', C.total, [], 1)
  O('L-parcial', 'cierre parcial (UPDATE antes que el INSERT) → 1 pareja, nada', C.parcial, [], 1)
  O('L-centimo', 'redondeo de 1 centimo (|d − p| = 0,01) → casa', C.centimo, [], 1)
  O('L-dos-centimos', '2 centimos → no casan: cambio de saldo sin pareja + trade sin pareja', C.dosCent, ['incidencia: INSERT de trade sin pareja', 'incidencia: cambio de saldo sin pareja'], 0)
  O('L-mas-menos-100', '±100 sin trades → dos incidencias', C.mas100, ['incidencia: cambio de saldo sin pareja', 'incidencia: cambio de saldo sin pareja'], 0)
  O('L-trade-solo', 'INSERT de trade sin UPDATE → incidencia', C.tradeSolo, ['incidencia: INSERT de trade sin pareja'], 0)
  O('L-10s-y-1us', 'trade y UPDATE a 10 s y 1 µs → no casan (l.6.2: incidencia falsa, nunca oculta)', C.lejos, ['incidencia: INSERT de trade sin pareja', 'incidencia: cambio de saldo sin pareja'], 0)
  O('L-10s', 'a 10 s justos → casan (≤ 10 s)', C.cerca, [], 1)
  FLOAT.forEach(([p, d], i) => O(`L-frontera-${p}-${d}`, `trade ${p} y +${d}: 0,01 exacto en numeric → casa`, C.float[i], [], 1))
  O('L-break-even', 'cierre total a break-even completo (trade 0 + UPDATE delta 0 que cambia last_timestamp) → 0 incidencias', C.be, [], 1)
  O('L-break-even-sin-trade', 'break-even sin su trade → DUDOSO (m.1)', C.beSin, ['dudoso: delta 0, menciona balance, sin pareja'], 0)
  O('L-pnl0-solo', 'trade de pnl 0 sin ningun UPDATE → incidencia', C.pnl0Solo, ['incidencia: INSERT de trade sin pareja'], 0)
  O('L-pausa', 'pausa sin pareja → dudoso (menciona balance)', C.pausa, ['dudoso: delta 0, menciona balance, sin pareja'])
  O('L-salida', 'salida sin pareja → dudoso', C.salida, ['dudoso: delta 0, menciona balance, sin pareja'])
  O('L-guardado', 'guardado periodico {last_timestamp, timeframe} → nada', C.guardado, [])
  O('L-tf', 'cambio de TF → nada', C.tf, [])
  O('L-tf-igual', 'UPDATE que no menciona balance y no cambia nada → nada (o.3, manda m.1)', C.tfIgual, [])
  O('L-borra-sesion', 'borrado de sesion con su trade en cascada → nada', C.borra, [])
  O('L-delete-trade', 'DELETE de trade suelto → incidencia', C.delTrade, ['incidencia: DELETE de trade sin el de su sesion en la misma transaccion', 'incidencia: INSERT de trade sin pareja'])
  O('L-delete-trade-otra-xact', 'DELETE de trade y el de su sesion en OTRA transaccion → incidencia (mira el id de transaccion)', C.delLuego, ['incidencia: DELETE de trade sin el de su sesion en la misma transaccion', 'incidencia: INSERT de trade sin pareja'])
  O('A-anon', 'una escritura con rol anon sin cabecera cuenta como «sin firma de alumno» (k.3.11): su +80 es incidencia', C.anon, ['incidencia: cambio de saldo sin pareja'])
  O('L-crea-mal', 'sesion creada con balance ≠ capital (delta 500) → incidencia (o.2)', C.creaMal, ['incidencia: sesion creada con balance distinto de capital'])
  O('L-crea-bien', 'sesion creada con balance = capital → nada', C.creaBien, [])
  O('L-update-trade-notas', 'UPDATE de trade sin firma que solo toca notes y tags → nada (o.3)', C.notas, [])
  O('L-update-trade-pnl', 'UPDATE de trade sin firma que toca pnl → incidencia (o.3)', C.pnlTrade, ['incidencia: UPDATE de trade con columnas economicas (o.3)'])
  const tot = r.filas.find(f => f[0] === 'estado' && f[1] === 'filas')?.[2] || ''
  O('L-firmado', 'escritura firmada (cliente de la etapa 1) → no se clasifica ni tiene foto, y el recuento la ve (5 firmadas en el montaje: 2 + 2 + 1)', C.firmado, [], 0, { sinFoto: true, ademas: / · firmadas=5 · /.test(tot) })
  O('L-service-role', 'service_role → no se clasifica ni tiene foto; va aparte (seccion 10)', C.servidor, [], 0,
    { sinFoto: true, ademas: r.filas.some(f => f[0] === 'service_role' && f[1] === A) })

  titulo('2 · los casos de Astra (m.1) y el recuento')
  O('M-astra-1', 'Astra 1: cierre total cuyo INSERT fallo con {error} → dudoso', C.astra1, ['dudoso: delta 0, menciona balance, sin pareja'], 0)
  O('M-astra-2', 'Astra 2: parcial pnl 0 perdido + cierre total pnl 0 correcto → 1 pareja y sobra un dudoso', C.astra2, ['dudoso: delta 0, menciona balance, sin pareja'], 1)
  O('M-reusa', 'dos UPDATE de +30 y un trade de 30 → 1 pareja y una incidencia (uno a uno, sin reutilizar)', C.reusa, ['incidencia: cambio de saldo sin pareja'], 1)
  O('M-inocua', 'un UPDATE que no menciona balance consume el trade de 0 → sobra el del cierre: dudoso (m.5.3)', C.soloNoBal, ['dudoso: delta 0, menciona balance, sin pareja'], 1)

  titulo('3 · anomalias (k.3.10, l.4, n.7, n.9)')
  const anom = r.filas.filter(f => f[0] === 'anomalia' && f[2].includes(`sesion=${C.anom}`)).map(f => f[2].split(' · ')[0]).sort()
  oraculo('A-tres-caminos', 'SQL directo del dueño (NULL ≠ none; tambien la creacion de la sesion del caso, que el montaje hace por SQL), SET ROLE sin JWT (NULL ≠ authenticated) y JWT a mano (authenticated ≠ none) → 4 anomalias',
    JSON.stringify(anom) === JSON.stringify(['rol_jwt=NULL ≠ rol_guc=authenticated', 'rol_jwt=NULL ≠ rol_guc=none', 'rol_jwt=NULL ≠ rol_guc=none', 'rol_jwt=authenticated ≠ rol_guc=none']), JSON.stringify(anom))
  O('A-jwt-a-mano-sin-firma', 'el JWT a mano sin cabecera es ademas «sin firma de alumno»: su +70 sin pareja es incidencia (dos predicados, l.4)', C.anom, ['incidencia: cambio de saldo sin pareja'])
  const pm = pgx(`alter table public.sim_escrituras_v0_marcas disable trigger sim_escrituras_v0_solo_disparador;
alter table public.sim_escrituras_v0_marcas alter column id set generated by default;
insert into public.sim_escrituras_v0_marcas (id, escritura_id, xact) values (900001, 999999, '1');
insert into public.sim_escrituras_v0_marcas (id, escritura_id, xact) select 900002, m.escritura_id, m.xact from public.sim_escrituras_v0_marcas m order by m.id limit 1;
insert into public.sim_escrituras_v0_marcas (id, escritura_id, xact) select 900003, e.id, '42' from public.sim_escrituras_v0 e where e.session_id = '${C.guardado}' limit 1;
alter table public.sim_escrituras_v0_marcas alter column id set generated always;
alter table public.sim_escrituras_v0_marcas enable trigger sim_escrituras_v0_solo_disparador;`)
  ver('montaje: tres marcas anomalas (con la guarda quitada y vuelta a poner)', pm.ok, err1(pm))
  const r2 = corre()
  const marcas = r2.filas.filter(f => f[0] === 'anomalia' && f[1].startsWith('marca 9000')).map(f => f[1] + ': ' + f[2].split(' (')[0]).sort()
  oraculo('A-marcas', 'marca huerfana, duplicada y en transaccion ajena → anomalias',
    marcas.length === 3 && marcas[0] === 'marca 900001: marca huerfana' && marcas[1] === 'marca 900002: marca duplicada' && marcas[2] === 'marca 900003: marca en una transaccion ajena', JSON.stringify(marcas))
  oraculo('A-duplicada-ambas', 'la duplicada se lista en sus dos marcas (la original y la nueva)', r2.filas.filter(f => f[0] === 'anomalia' && /marca duplicada/.test(f[2])).length === 2)
  ver('la preparatoria sigue reconociendo su estado (las guardas vuelven a estar)', /FIN\|sim-004a-preparatoria aplicada$/.test(pgx(lee('sql/sim-004a-preparatoria.sql')).out))

  titulo('4 · alumnos, volumen, service_role, foto y hash (k.1 e, k.3.7, k.4 d, n.2)')
  const al = r.filas.find(f => f[0] === 'alumno' && f[1] === A)?.[2] || ''
  oraculo('F-alumno', 'alumno A: ultima version firmada etapa1-1 y sus escrituras sin firma de las ultimas 72 h', /^ultima version firmada=etapa1-1 · sin firma 72 h=\d+ · ultima sin firma=\d{4}-/.test(al) && Number(al.match(/72 h=(\d+)/)?.[1]) > 30, al)
  oraculo('F-volumen', 'volumen: filas por dia', r.filas.some(f => f[0] === 'volumen' && /^\d+ filas$/.test(f[2])))
  oraculo('F-service-role', 'service_role aparte, con su alumno', r.filas.some(f => f[0] === 'service_role' && f[1] === A && /^1 escrituras · sim_sessions UPDATE/.test(f[2])))
  const foto = r.filas.find(f => f[0] === 'foto' && f[1] === C.astra2)?.[2] || ''
  const can = pgx(`select sha256 from public.sim_escrituras_v0_canonico('${C.astra2}')`).out
  oraculo('F-foto', 'foto de la sesion de Astra 2: sus 3 ids, 1 abierta y el sha256 de la canonica', /^ids=\d+,\d+,\d+ · abiertas=1 · sha256=[0-9a-f]{64}$/.test(foto) && foto.endsWith(can), foto)
  oraculo('F-estado', 'estado: registro instalado (puerta NO activa) y el recuento por tipo', r.filas.some(f => f[0] === 'estado' && f[2] === 'registro instalado (puerta NO activa)')
    && r.filas.some(f => f[0] === 'estado' && /^total=\d+ · sin firma de alumno=\d+ · firmadas=\d+ · service_role=1 · otras/.test(f[2])))

  titulo('5 · statement_timeout efectivo (l.1 c, paso 3)')
  pg.psql(`alter role authenticated set statement_timeout = '8s'; alter role anon in database p set statement_timeout = '3s';`)
  const t1 = corre()
  const to = rol => t1.filas.find(f => f[0] === 'timeout' && f[1] === rol)?.[2] || ''
  oraculo('T-valor', 'authenticated: rol=8s manda; anon: rol+base=3s manda', /rol=8s .*MANDA: 8s$/.test(to('authenticated')) && /^rol\+base=3s .*MANDA: 3s$/.test(to('anon')), to('authenticated') + ' || ' + to('anon'))
  pg.psql(`alter role authenticated set statement_timeout = 0;`)
  const t2 = corre()
  oraculo('T-cero', 'con 0 → «SIN LIMITE: … decide el CTO»', /MANDA: 0 · SIN LIMITE/.test(t2.filas.find(f => f[0] === 'timeout' && f[1] === 'authenticated')?.[2] || ''))
  pg.psql(`alter role authenticated reset statement_timeout; alter role anon in database p reset statement_timeout;`)

  titulo('6 · mutantes de l.5 y k.3.10: cada uno cambia lo que dice s10')
  const conParejas = (cuerpo) => pgx(`begin;
create or replace function public.sim_escrituras_v0_parejas(p_session_id uuid) returns table (orden integer, escritura_update bigint, escritura_insert bigint)
  language plpgsql stable set search_path = '' as $f$${cuerpo}$f$;
set transaction read only;
${S10}
rollback;`)
  const cuerpo = pg.psql(`select prosrc from pg_proc where proname = 'sim_escrituras_v0_parejas'`).out
  ver('el cuerpo de las parejas se lee del catalogo', cuerpo.length > 100)
  const mutaParejas = (desc, de2, a2, caso, esperado) => {
    if (!cuerpo.includes(de2)) { oraculo('MUT-' + desc.replace(/\W+/g, '-'), `mutante «${desc}»: el texto a cambiar existe en las parejas`, false); return }
    const rm = conParejas(cuerpo.replace(de2, a2))
    const rr = { filas: rm.out.split('\n').filter(l => l && !/^(BEGIN|ROLLBACK|CREATE FUNCTION|SET)$/.test(l)).map(l => l.split('|')) }
    const c = clases(rr, caso)
    oraculo('MUT-' + desc.replace(/\W+/g, '-'), `mutante «${desc}» → s10 cambia (lo caza ${esperado})`, rm.ok && JSON.stringify(c) !== JSON.stringify(clases(r, caso)), `${JSON.stringify(clases(r, caso))} → ${JSON.stringify(c)} ${err1(rm)}`)
  }
  mutaParejas('igualdad exacta en vez de la tolerancia', 'abs(r.delta - t.pnl) <= 0.01', 'r.delta = t.pnl', C.centimo, 'L-centimo')
  mutaParejas('emparejar con reutilizacion', 'AND NOT (t.id = ANY (v_usa))', '', C.reusa, 'M-reusa')
  mutaParejas('solo emparejan los UPDATE con delta ≠ 0', "AND e.cliente = 'sin-firma'", "AND e.delta <> 0 AND e.cliente = 'sin-firma'", C.be, 'L-break-even')
  {
    // el mutante float, una vez, y tiene que dar rojo en LOS CUATRO casos de frontera (o.10.3)
    const de2 = 'abs(r.delta - t.pnl) <= 0.01'
    const rm = conParejas(cuerpo.replace(de2, 'abs(r.delta::float8 - t.pnl::float8) <= 0.01::float8'))
    const rr = { filas: rm.out.split('\n').filter(l => l && !/^(BEGIN|ROLLBACK|CREATE FUNCTION|SET)$/.test(l)).map(l => l.split('|')) }
    const caidas = C.float.map(s => pares(rr, s) === 0 && clases(rr, s).length === 2)
    oraculo('MUT-comparacion-en-float', 'mutante «comparacion en float» → los 4 casos de frontera dejan de casar (cada uno: 2 incidencias)',
      cuerpo.includes(de2) && rm.ok && caidas.every(Boolean), `${caidas.map((c, i) => FLOAT[i].join('/') + (c ? ' cae' : ' NO cae')).join(', ')} ${err1(rm)}`)
  }
  const mutaS10 = (desc, de2, a2, mira, lo) => {
    if (!S10.includes(de2)) { oraculo('MUT-' + desc.replace(/\W+/g, '-'), `mutante «${desc}»: el texto a cambiar existe en s10`, false); return }
    const rm = corre(S10.replace(de2, a2))
    oraculo('MUT-' + desc.replace(/\W+/g, '-'), `mutante «${desc}» → s10 cambia (lo caza ${lo})`, rm.ok && JSON.stringify(mira(rm)) !== JSON.stringify(mira(r2)), `${JSON.stringify(mira(r2))} → ${JSON.stringify(mira(rm))} ${err1(rm)}`)
  }
  const anomalias = x => x.filas.filter(f => f[0] === 'anomalia').length
  mutaS10('DELETE de trade sin mirar la transaccion', 'and s.session_id = f.session_id and s.xact = f.xact', 'and s.session_id = f.session_id', x => clases(x, C.delLuego), 'L-delete-trade-otra-xact')
  mutaS10('<> en lugar de IS DISTINCT FROM en las anomalias', 'where e.rol_jwt is distinct from e.rol_guc', 'where e.rol_jwt <> e.rol_guc', anomalias, 'A-tres-caminos')
  mutaS10('ignorar el delta 0 que menciona balance (sin dudosos)', "then 'dudoso: delta 0, menciona balance, sin pareja'", "then 'nada'", x => clases(x, C.pausa), 'L-pausa')
  mutaS10('solo cuenta authenticated', "where e.cliente = 'sin-firma' and e.rol_jwt in ('authenticated', 'anon')", "where e.cliente = 'sin-firma' and e.rol_jwt in ('authenticated')", x => clases(x, C.anon), 'A-anon')
} finally {
  pg.cierra()
}
fin()
