/**
 * sim-003 · PERSISTENCIA ADITIVA, ENSAYADA EN POSTGRESQL 17 LOCAL
 *
 * Esquema de partida: produccion segun la salida LITERAL de s04/s05 del 10-oct (estado-s04.mjs,
 * PRODUCCION) + sql/sim-002 tal cual, con los privilegios por defecto de
 * Supabase. Datos INVENTADOS. Nada de esto toca Supabase.
 *
 *   1 aplicar y repetir; a medias; nombre ocupado en otro esquema; sesion sin
 *     perfil; pgcrypto fuera de extensions; un fallo DESPUES de crear (no
 *     queda nada)
 *   2 permisos (§ 8): anon, authenticated (A, B), un rol cualquiera y
 *     service_role contra tablas y funciones nuevas; la web actual sigue
 *     escribiendo como hoy; la ventana hasta sim-004, medida
 *   3 crear: idempotencia, 409 sin revelar, 410/403/426/422, cupo (6 / 12,
 *     legado y hijas no cuentan) y la barrera con dos creaciones a la vez
 *   4 tomar el escritor: testigo (solo su hash en la base), reintento sin
 *     testigo, ocupado, forzar, D-18 otra sesion activa
 *   5 comando: avance, tasa 429, ultimo_avance sobrescrito, comando_caducado,
 *     eventos y trades, 422 sin efectos, rechazo puro, conflicto, idempotencia,
 *     actor ajeno, testigo y caducidad, y V4-01 (caduca MIENTRAS espera el
 *     bloqueo: 409 aunque al empezar era valido)
 *   6 pasar de fase; 7 borrar: sesion y legacy dejan la fila como lapida
 *     (terminal = 'borrada', A24: 410 al recrear; fuera del cupo), alumno la borra
 *   8 el DELETE del hub: los dos ordenes simples, I1, I2 e I3 (interbloqueo)
 * ⚠️ No prueba el editor de Supabase.
 */
import { readFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { titulo, ver, fin, REPO, espera } from './lib.mjs'
import { BIN, hayPostgres, cluster } from './pg-ensayo.mjs'
import { PRODUCCION } from './estado-s04.mjs'
if (!hayPostgres()) { ver(`PostgreSQL 17 en ${BIN}: NO hay, la prueba no se ha ejecutado`, false); fin() }
const SQL = readFileSync(path.join(REPO, 'sql/sim-003-persistencia-aditiva.sql'), 'utf8')
const SQL2 = readFileSync(path.join(REPO, 'sql/sim-002-lectura-estable.sql'), 'utf8')
const pg = cluster()
const como = (rol, sub, q) => pg.como(rol, sub, q, 'p')

// ── datos inventados ──────────────────────────────────────────────────────
const u = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const A = u(1), B = u(2), R = u(3), NUL = u(4), E = u(5), X = u(6), Y = u(7), Z = u(8), W = u(9), SINP = u(10)
const PERFILES = [[A, 'basic', 'true'], [B, 'basic', 'true'], [R, 'basic', 'true'], [NUL, 'basic', 'null'], [E, 'extra', 'true'],
  [X, 'basic', 'true'], [Y, 'basic', 'true'], [Z, 'basic', 'true'], [W, 'basic', 'true']]
const DATOS = `
insert into auth.users values ${[...PERFILES.map(p => p[0]), SINP].map(id => `('${id}')`).join(', ')};
insert into public.profiles (id, email, plan, simulador_activo) values ${PERFILES.map(([id, plan, act]) => `('${id}', '${id.slice(-2)}@ejemplo.test', '${plan}', ${act})`).join(', ')};
insert into public.sim_sessions (id, user_id, name, pair, timeframe, date_from, date_to) values
  ('${u(101)}', '${A}', 'legado A', 'EURUSD', 'H1', '2026-01-01', '2026-02-01'),
  ('${u(102)}', '${B}', 'legado B', 'EURUSD', 'H1', '2026-01-01', '2026-02-01');
insert into public.sim_trades (session_id, user_id, pair, side, entry_price, lots, pnl, opened_at) values
  ('${u(101)}', '${A}', 'EURUSD', 'BUY', 1.1, 1, 10, now());
`
const L = v => (v == null ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`)
const J = v => (v === undefined ? 'NULL' : `${L(JSON.stringify(v))}::jsonb`)
const lineas = r => r.out.split('\n').filter(l => l && !/^(SET|BEGIN|COMMIT|ROLLBACK)$/.test(l))
// una llamada como service_role (como el servidor); el jsonb de vuelta, o { error }
const SR = (q, db = 'p') => {
  const r = pg.psql(`set role service_role;\n${q}`, db)
  if (!r.ok) return { error: r.err.split('\n').find(l => /ERROR/.test(l)) || r.err.split('\n')[0] }
  const l = lineas(r).at(-1)
  try { return JSON.parse(l) } catch { return { crudo: l } }
}
const uno = (q, db = 'p') => pg.psql(q, db).out
const n = (q, db = 'p') => Number(uno(q, db))
const eti = r => (r?.ok ? `${r.http}` : r?.error ? r.error : `${r?.http} ${r?.motivo}`)

const SESION = { name: 'v1', pair: 'EURUSD', timeframe: 'H1', date_from: '2026-01-01', date_to: '2026-03-01', capital: 10000 }
const MERCADO = { EURUSD: 'EURUSD@1:abc' }
const EST0 = { esquema: 'sim-cartera@1', saldo_µ: { $b: '10000000000' }, cursor: null }
const sobreCrear = (sid, k = 1) => JSON.stringify({ tipo: 'crear', sesion: sid, k })
const crear = (actor, sid, cid, o = {}) => SR(`select public.sim_crear_sesion(${L(actor)}, ${L(sid)}, ${L(cid)}, ${L(o.sobre ?? sobreCrear(sid))}, ${o.epoca ?? 1}, ${J(o.sesion ?? SESION)}, ${J(o.estado ?? EST0)}, ${J(o.mercado ?? MERCADO)}, ${J(o.resumen ?? {})});`, o.db)
const tomar = (actor, sid, cid, o = {}) => SR(`select public.sim_tomar_escritor(${L(actor)}, ${L(sid)}, ${L(cid)}, ${L(o.sobre ?? JSON.stringify({ tipo: 'tomar_escritor', k: o.k ?? 1 }))}, ${o.epoca ?? 1}, ${L(o.cliente ?? 'pestana-1')}, ${o.forzar ? 'true' : 'false'});`, o.db)
const ev = (ordinal, tipo, datos = {}) => ({ ordinal, tipo, t_mercado: 1767600000 + ordinal * 60, datos: { tipo, ...datos } })
const TRADE = ordinal => ({ ordinal, pair: 'EURUSD', side: 'BUY', entry_price: '1.10000', exit_price: '1.10100', lots: '1.00', pnl: '97.00',
  result: 'WIN', opened_at: '2026-01-05T10:00:00Z', closed_at: '2026-01-05T11:00:00Z', bruto_micro: 100000000, neto_micro: 97000000,
  comision_micro: 3000000, spread_micro: 0, swap_micro: 0, ambigua: false, conversion: { par: 'EURUSD', valor: '1' } })
const res = (o = {}) => ({ resultado: o.resultado ?? 'aceptado', motivo: o.motivo ?? null, clase: o.clase ?? 'economico', estado: o.estado ?? EST0,
  eventos: o.eventos ?? [], trades: o.trades ?? [], proyeccion: o.proyeccion ?? {}, resumen: o.resumen ?? {} })
const sqlComando = (actor, sid, cid, tipo, o) => `select public.sim_comando(${L(actor)}, ${L(sid)}, ${L(cid)}, ${L(tipo)}, ${L(o.sobre ?? JSON.stringify({ tipo, k: o.k ?? 0 }))}, ${o.epoca ?? 1}, ${o.version ?? 0}, ${L(o.cliente ?? 'pestana-1')}, ${L(o.testigo)}, ${J(o.resultado ?? res())});`
const comando = (actor, sid, cid, tipo, o = {}) => SR(sqlComando(actor, sid, cid, tipo, o), o.db)
const libera = (actor, db = 'p') => pg.psql(`update public.sim_alumnos set siguiente_avance_desde = null where user_id = '${actor}';`, db)

// ── conexiones que se quedan esperando (para los intercalados) ─────────────
function conexion(db = 'p') {
  const p = spawn(path.join(BIN, 'psql'), ['-h', pg.dir, '-p', pg.puerto, '-U', 'postgres', '-X', '-q', '-tA', '-d', db],
    { env: { PATH: process.env.PATH, LC_ALL: 'en_US.UTF-8', LANG: 'en_US.UTF-8' } })
  let out = '', err = '', k = 0
  p.stdout.on('data', d => { out += d }); p.stderr.on('data', d => { err += d })
  const manda = sql => {
    const m = `@@fin${++k}@@`, o0 = out.length, e0 = err.length
    p.stdin.write(`${sql}\n\\echo ${m}\n`)
    return (async () => {
      for (let i = 0; !out.includes(m, o0); i++) { if (i > 1500) throw new Error('conexion colgada: ' + sql.slice(0, 80)); await espera(20) }
      await espera(40)
      const o = out.slice(o0, out.indexOf(m, o0)).split('\n').filter(l => l && !/^(SET|BEGIN|COMMIT|ROLLBACK)$/.test(l))
      let json = null; try { json = JSON.parse(o.at(-1)) } catch { json = null }
      return { out: o, json, err: err.slice(e0).trim() }
    })()
  }
  return { manda, cierra: () => p.stdin.end() }
}
const esperando = async (k, db = 'p') => {
  for (let i = 0; i < 400; i++) {
    if (n(`select count(*) from pg_stat_activity where datname = '${db}' and wait_event_type = 'Lock'`, db) >= k) return true
    await espera(25)
  }
  return false
}

const nueva = (nombre, extra = '', datos = DATOS) => {
  const c = pg.psql(`create database ${nombre}`, 'postgres')
  const r = pg.psql(PRODUCCION + extra, nombre)
  const r2 = pg.psql(SQL2, nombre)
  const r3 = pg.psql(datos, nombre)
  if (!c.ok || !r.ok || !r2.ok || !r3.ok) throw new Error('montaje ' + nombre + ': ' + (c.err || r.err || r2.err || r3.err))
}
const nadaCreado = db => uno(`select count(*) from pg_class where relnamespace = 'public'::regnamespace and relname in ('sim_alumnos','sim_arrendamientos','sim_recibos','sim_eventos')`, db) === '0'
  && uno(`select count(*) from pg_proc where proname like 'sim\\_%' and proname not like 'sim_trades_de_%'`, db) === '0'
  && uno(`select count(*) from pg_attribute where attrelid = 'public.sim_sessions'::regclass and attname = 'motor_version'`, db) === '0'

try {
  pg.arranca()

  titulo('1 · aplicar, repetir, y lo que lo para')
  nueva('p')
  const r1 = pg.psql(SQL, 'p')
  ver('se aplica entero y acaba en FIN | sim-003 aplicada', r1.ok && lineas(r1).at(-1) === 'FIN|sim-003 aplicada', r1.err.split('\n')[0] || lineas(r1).at(-1))
  ver('informe: 9 funciones SECURITY DEFINER, search_path vacio, nadie mas que service_role (y los 2 auxiliares, ni el)',
    lineas(r1).filter(l => /^funcion\|.* · security_definer=true · config=search_path="" · execute: anon=false authenticated=false service_role=(true|false) PUBLIC=false$/.test(l)).length === 9
    && lineas(r1).filter(l => /^funcion\|sim_(error|bloquea_alumno)\(.*service_role=false/.test(l)).length === 2, lineas(r1).filter(l => l.startsWith('funcion')).length)
  ver('informe: la FK sim_sessions.user_id → profiles ON DELETE CASCADE, validada', lineas(r1).some(l => l === 'restriccion|sim_sessions.sim_sessions_user_id_perfil_fkey · FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE · validada=true'))
  ver('montaje fiel a s04: FK sim_sessions_user_id_fkey (auth.users, CASCADE) y sim_sessions_challenge_parent_id_fkey (SET NULL); opened_at timestamptz NOT NULL; codigo P0001 del cupo',
    uno(`select string_agg(conname || ':' || confdeltype::text, ',' order by conname) from pg_constraint where conrelid = 'public.sim_sessions'::regclass and contype = 'f' and conname in ('sim_sessions_user_id_fkey', 'sim_sessions_challenge_parent_id_fkey')`) === 'sim_sessions_challenge_parent_id_fkey:n,sim_sessions_user_id_fkey:c'
    && uno(`select format_type(atttypid, atttypmod) || ',' || attnotnull from pg_attribute where attrelid = 'public.sim_trades'::regclass and attname = 'opened_at'`) === 'timestamp with time zone,true'
    && /using errcode = 'P0001'/.test(uno(`select prosrc from pg_proc where proname = 'enforce_sim_session_limit'`)))
  ver('las filas que habia no cambian de sentido: legado A sigue v0, epoca 0, version 0, no legado, sin estado',
    uno(`select motor_version||','||epoca||','||version||','||legado||','||coalesce(estado::text,'-')||','||creada_por_rpc from sim_sessions where id = '${u(101)}'`) === '0,0,0,false,-,false')
  const r1b = pg.psql(SQL, 'p')
  ver('segunda ejecucion: sin error y el mismo informe, que acaba en FIN', r1b.ok && r1b.out === r1.out && lineas(r1b).at(-1) === 'FIN|sim-003 aplicada', r1b.err.split('\n')[0])

  nueva('medias', 'create table public.sim_alumnos (user_id uuid);')
  const rm = pg.psql(SQL, 'medias')
  ver('una tabla nueva ya en public (a medias / nombre ocupado): se para y no toca nada', !rm.ok && /sim-003: A MEDIAS o con nombres ocupados en public \(1 de 33/.test(rm.err) && uno(`select count(*) from pg_attribute where attrelid = 'public.sim_sessions'::regclass and attname = 'motor_version'`, 'medias') === '0', rm.err.split('\n')[0])
  nueva('otroesq', 'create schema macro; create table macro.sim_eventos (id int);')
  const ro = pg.psql(SQL, 'otroesq')
  ver('nombre ocupado en OTRO esquema (macro.sim_eventos): se para y no queda nada', !ro.ok && /nombre ocupado: macro\.sim_eventos/.test(ro.err) && nadaCreado('otroesq'), ro.err.split('\n')[0])
  nueva('huerfana', '', DATOS + `insert into public.sim_sessions (user_id, name, pair, timeframe, date_from, date_to) values ('${SINP}', 'sin perfil', 'EURUSD', 'H1', '2026-01-01', '2026-02-01');`)
  const rh = pg.psql(SQL, 'huerfana')
  ver('una sesion sin perfil: se para con el numero y no queda nada', !rh.ok && /sim-003: 1 sesion\(es\) sin perfil/.test(rh.err) && nadaCreado('huerfana'), rh.err.split('\n')[0])
  nueva('cripto', 'drop extension pgcrypto; create extension pgcrypto schema public;')
  const rc = pg.psql(SQL, 'cripto')
  ver('pgcrypto fuera de extensions: se para y no queda nada', !rc.ok && /pgcrypto no esta instalada en el esquema extensions/.test(rc.err) && nadaCreado('cripto'), rc.err.split('\n')[0])
  // authenticated miembro de service_role hereda su EXECUTE (en esta base y,
  // como los roles son del cluster, se deshace justo despues): la comprobacion
  // final revienta DESPUES de crear todo; el DO entero se deshace
  nueva('heredado', 'grant service_role to authenticated;')
  const r5 = pg.psql(SQL, 'heredado')
  ver('un fallo despues de crear (authenticated hereda EXECUTE): revienta y no queda NADA', !r5.ok && /sim-003: authenticated puede ejecutar/.test(r5.err) && nadaCreado('heredado'), r5.err.split('\n')[0])
  // los roles son del cluster entero, no de la base: se deshace ya
  pg.psql('revoke service_role from authenticated;', 'postgres')

  titulo('2 · permisos (§ 8) y la web de hoy')
  const s1 = u(201)
  const c1 = crear(A, s1, u(901))
  ver('montaje: A crea una sesion v1 (service_role)', c1.ok && c1.http === 201, eti(c1))
  pg.psql('create role cualquiera nologin; grant usage on schema public to cualquiera;', 'p')
  const FIRMAS = ['sim_crear_sesion(uuid,uuid,uuid,text,integer,jsonb,jsonb,jsonb,jsonb)', 'sim_tomar_escritor(uuid,uuid,uuid,text,integer,text,boolean)',
    'sim_comando(uuid,uuid,uuid,text,text,integer,bigint,text,text,jsonb)', 'sim_avanzar_fase(uuid,uuid,uuid,uuid,text,integer,bigint,jsonb,jsonb,jsonb,jsonb)',
    'sim_borrar_sesion(uuid,uuid)', 'sim_borrar_legacy(uuid,uuid)', 'sim_borrar_alumno(uuid)', 'sim_error(integer,text,jsonb)', 'sim_bloquea_alumno(uuid)']
  const llamada = f => `select public.${f.split('(')[0]}(${f.split('(')[1].replace(')', '').split(',').map(() => 'NULL').join(', ')});`
  ver('anon, authenticated y un rol cualquiera: ninguna de las 9 funciones (permission denied)',
    ['anon', 'authenticated', 'cualquiera'].every(rol => FIRMAS.every(f => como(rol, A, llamada(f)) === 'DENEGADO')))
  ver('service_role: ejecuta las 7 RPC y NO los 2 auxiliares',
    FIRMAS.slice(0, 7).every(f => como('service_role', A, llamada(f)) !== 'DENEGADO') && FIRMAS.slice(7).every(f => como('service_role', A, llamada(f)) === 'DENEGADO'))
  ver('authenticated A: lee SU recibo; B no ve el de A (RLS); anon: denegado',
    como('authenticated', A, `select count(*) from sim_recibos where session_id = '${s1}';`) === '1'
    && como('authenticated', B, `select count(*) from sim_recibos where session_id = '${s1}';`) === '0'
    && como('anon', A, 'select count(*) from sim_recibos;') === 'DENEGADO')
  ver('authenticated: ni INSERT, ni UPDATE, ni DELETE en recibos/eventos; sim_alumnos y sim_arrendamientos ni se leen',
    como('authenticated', A, `update sim_recibos set motivo = 'x';`) === 'DENEGADO' && como('authenticated', A, 'delete from sim_eventos;') === 'DENEGADO'
    && como('authenticated', A, `insert into sim_eventos (session_id, user_id, seq, command_id, ordinal, tipo, t_mercado, datos) values ('${s1}', '${A}', 1, '${u(1)}', 0, 'fill', 0, '{}');`) === 'DENEGADO'
    && como('authenticated', A, 'select count(*) from sim_alumnos;') === 'DENEGADO' && como('authenticated', A, 'select count(*) from sim_arrendamientos;') === 'DENEGADO')
  ver('service_role: lee recibos y eventos; NO escribe en ellos ni lee arrendamientos ni alumnos (todo por RPC)',
    como('service_role', A, 'select count(*) from sim_recibos;') !== 'DENEGADO' && como('service_role', A, `delete from sim_recibos;`) === 'DENEGADO'
    && como('service_role', A, 'select count(*) from sim_arrendamientos;') === 'DENEGADO' && como('service_role', A, 'select count(*) from sim_alumnos;') === 'DENEGADO')
  ver('la web de hoy: A inserta una sesion como dashboard.js, un trade y actualiza balance (nace v0)',
    como('authenticated', A, `insert into sim_sessions (user_id, name, pair, timeframe, date_from, date_to, capital, balance, status) values ('${A}', 'web', 'EURUSD', 'H1', '2026-01-01', '2026-02-01', 5000, 5000, 'active') returning motor_version||','||legado;`) === '0,false'
    && como('authenticated', A, `insert into sim_trades (session_id, user_id, pair, side, entry_price, lots, pnl, opened_at) values ('${u(101)}', '${A}', 'EURUSD', 'SELL', 1.2, 0.5, -3, now()) returning motor_version;`) === '0'
    && como('authenticated', A, `update sim_sessions set balance = 10010 where id = '${u(101)}' returning balance;`) === '10010')
  ver('un trade con evento_id lo para el CHECK (v0 sin evento) y un v1 sin importes tambien',
    /sim_trades_v1_coherente/.test(como('authenticated', A, `insert into sim_trades (session_id, user_id, pair, side, entry_price, lots, opened_at, motor_version) values ('${u(101)}', '${A}', 'EURUSD', 'BUY', 1.1, 1, now(), 1);`)))
  const ventana = como('authenticated', A, `update sim_sessions set motor_version = 1, creada_por_rpc = true, estado = '{}', mercado = '{"x":1}' where id = '${u(101)}' returning motor_version;`)
  console.log(`  · medido (ventana hasta sim-004): authenticated pone motor_version = 1 en SU sesion legado → ${ventana === '1' ? 'PUEDE' : ventana}`)

  titulo('3 · crear (§ 4.3.2)')
  const rep = crear(A, s1, u(901))
  ver('mismo id, misma clave, mismo sobre → 200 repetido, el mismo recibo, una sola sesion', rep.ok && rep.repetido && rep.recibo?.id === c1.recibo?.id && n(`select count(*) from sim_sessions where id = '${s1}'`) === 1, eti(rep))
  ver('mismo id con otra clave, o con otro sobre → 409 clave_reutilizada', crear(A, s1, u(902)).motivo === 'clave_reutilizada' && crear(A, s1, u(901), { sobre: sobreCrear(s1, 2) }).motivo === 'clave_reutilizada')
  const ajena = crear(B, s1, u(901))
  ver('el id de A desde B → 409 clave_reutilizada, la misma respuesta (no revela de quien es)', ajena.http === 409 && ajena.motivo === 'clave_reutilizada' && Object.keys(ajena).length === 3, JSON.stringify(ajena))
  ver('sin perfil → 410 perfil_borrado', crear(SINP, u(203), u(903)).motivo === 'perfil_borrado')
  ver('acceso: simulador_activo false → 403; NULL → 403 (solo true vale)', (pg.psql(`update profiles set simulador_activo = false where id = '${R}'`, 'p'), crear(R, u(204), u(904)).http === 403) && crear(NUL, u(205), u(905)).http === 403)
  ver('epoca distinta de 1 → 426 actualizar_cliente; sobre de otro tipo → 422; carga con clave extraña → 422',
    crear(A, u(206), u(906), { epoca: 0 }).http === 426 && crear(A, u(206), u(906), { sobre: JSON.stringify({ tipo: 'abrir' }) }).motivo === 'sobre_invalido'
    && crear(A, u(206), u(906), { sesion: { ...SESION, balance: 1 } }).motivo === 'carga_invalida')
  ver('nada de lo rechazado dejo fila (y la funcion existe: no aprueba en vacio)', uno(`select to_regprocedure('public.sim_crear_sesion(uuid,uuid,uuid,text,integer,jsonb,jsonb,jsonb,jsonb)') is not null`) === 't' && n(`select count(*) from sim_sessions where id in ('${u(203)}','${u(204)}','${u(205)}','${u(206)}')`) === 0)
  // A tiene: legado A, 'web' (rollback: no existe), s1 → 2 raices
  for (let k = 0; k < 4; k++) crear(A, u(210 + k), u(910 + k))
  const lim = crear(A, u(220), u(920))
  ver('cupo basic: con 6 raices, la 7.ª → 409 limite_sesiones (limite 6)', lim.motivo === 'limite_sesiones' && lim.limite === 6, eti(lim) + ' · raices ' + n(`select count(*) from sim_sessions where user_id = '${A}' and challenge_parent_id is null`))
  pg.psql(`update sim_sessions set legado = true where id = '${u(101)}'`, 'p')
  const conDisparador = crear(A, u(220), u(920))
  ver('con una legado: el disparador de HOY aun la cuenta y para la 7.ª con su texto literal (s04: «Limite de sesiones alcanzado para el plan % (max %).», P0001); se ajusta en sim-004', /ERROR: {2}Limite de sesiones alcanzado para el plan basic \(max 6\)\.$/.test(conDisparador.error ?? ''), eti(conDisparador))
  ver('…y el dashboard de hoy lo reconoce (busca «limite de sesiones» en minusculas, pages/dashboard.js:191)', (conDisparador.error ?? '').toLowerCase().includes('limite de sesiones'))
  pg.psql('alter table sim_sessions disable trigger trg_enforce_sim_session_limit', 'p')
  const conLegado = crear(A, u(220), u(920))
  ver('sin ese disparador (como quedara tras sim-004): las legado no cuentan en sim_crear_sesion y la 7.ª entra', conLegado.http === 201, eti(conLegado))
  pg.psql('alter table sim_sessions enable trigger trg_enforce_sim_session_limit', 'p')
  pg.psql(`update sim_sessions set legado = false where id = '${u(101)}'`, 'p')
  for (let k = 0; k < 11; k++) crear(E, u(300 + k), u(1300 + k))
  ver('cupo extra: 11 entran y la 12.ª tambien; la 13.ª → 409 (limite 12)', crear(E, u(311), u(1311)).http === 201 && crear(E, u(312), u(1312)).limite === 12)
  // barrera: dos creaciones a la vez con una plaza libre
  pg.psql(`delete from sim_sessions where id = '${u(311)}'`, 'p')
  const k1 = conexion(), k2 = conexion()
  await k1.manda(`begin; set role service_role; select public.sim_crear_sesion('${E}', '${u(330)}', '${u(1330)}', ${L(sobreCrear(u(330)))}, 1, ${J(SESION)}, ${J(EST0)}, ${J(MERCADO)}, '{}');`)
  const p2 = k2.manda(`set role service_role; select public.sim_crear_sesion('${E}', '${u(331)}', '${u(1331)}', ${L(sobreCrear(u(331)))}, 1, ${J(SESION)}, ${J(EST0)}, ${J(MERCADO)}, '{}');`)
  const espero = await esperando(1)
  await k1.manda('commit;')
  const b2 = await p2
  ver('barrera: con una plaza, la segunda creacion ESPERA a la primera y despues da 409 limite_sesiones', espero && b2.json?.motivo === 'limite_sesiones' && n(`select count(*) from sim_sessions where user_id = '${E}' and challenge_parent_id is null`) === 12, `${espero} · ${b2.json?.motivo ?? b2.err}`)
  k1.cierra(); k2.cierra()

  titulo('4 · tomar el escritor (§ 4.2, D-16, D-18)')
  const t1 = tomar(A, s1, u(940))
  ver('toma: 200 con testigo de 64 hex; en la base solo su hash (no el testigo)', t1.ok && /^[0-9a-f]{64}$/.test(t1.testigo)
    && uno(`select testigo_hash from sim_arrendamientos where session_id = '${s1}'`) === uno(`select encode(extensions.digest('${t1.testigo}', 'sha256'), 'hex')`)
    && uno(`select count(*) from sim_arrendamientos where testigo_hash = '${t1.testigo}'`) === '0', eti(t1))
  ver('sim_sessions.escritor dice quien y hasta cuando, sin testigo', uno(`select escritor->>'cliente_id' || ',' || (escritor ? 'testigo') from sim_sessions where id = '${s1}'`) === 'pestana-1,false')
  const t1r = tomar(A, s1, u(940))
  ver('reintento con la misma clave: el mismo recibo, SIN testigo (no esta guardado)', t1r.ok && t1r.repetido && t1r.recibo?.id === t1.recibo?.id && !('testigo' in t1r), eti(t1r))
  ver('otra pestaña con el arrendamiento vigente → 409 escritor_ocupado', tomar(A, s1, u(941), { cliente: 'pestana-2', k: 2 }).motivo === 'escritor_ocupado')
  const t2 = tomar(A, s1, u(942), { cliente: 'pestana-2', k: 3, forzar: true })
  ver('forzar («Usar aquí»): 200 y testigo nuevo', t2.ok && t2.testigo !== t1.testigo, eti(t2))
  const s2 = u(211)
  const d18 = tomar(A, s2, u(943), { cliente: 'pestana-3', k: 4 })
  ver('D-18: otra sesion de A con arrendamiento vigente → 409 otra_sesion_activa', d18.motivo === 'otra_sesion_activa' && d18.sesiones?.[0] === s1, eti(d18))
  const d18f = tomar(A, s2, u(944), { cliente: 'pestana-3', k: 5, forzar: true })
  ver('D-18 forzado: toma s2 y el arrendamiento de s1 desaparece', d18f.ok && n(`select count(*) from sim_arrendamientos where session_id = '${s1}'`) === 0, eti(d18f))
  ver('legado → 409 no_es_v1 (v0); legado marcado → 409 solo_lectura',
    tomar(A, u(101), u(945)).motivo === 'no_es_v1' && (pg.psql(`update sim_sessions set legado = true where id = '${u(101)}'`, 'p'), tomar(A, u(101), u(946)).motivo === 'solo_lectura'))
  pg.psql(`update sim_sessions set legado = false where id = '${u(101)}'`, 'p')

  titulo('5 · el comando (§ 4.3)')
  const tk = tomar(A, s1, u(950), { k: 6, forzar: true })
  const T = tk.testigo
  const EST1 = { ...EST0, cursor: 1767600060 }
  const a1 = comando(A, s1, u(951), 'avanzar', { testigo: T, version: 0, k: 1, resultado: res({ clase: 'ultimo_avance', estado: EST1, proyeccion: { last_timestamp: 1767600060 } }) })
  ver('avanzar sin eventos: 200, version 0→1 (el estado cambio), recibo ultimo_avance, last_timestamp proyectado', a1.ok && a1.version === 1 && a1.recibo?.clase === 'ultimo_avance' && uno(`select last_timestamp from sim_sessions where id = '${s1}'`) === '1767600060', eti(a1))
  const a2 = comando(A, s1, u(952), 'avanzar', { testigo: T, version: 1, k: 2, resultado: res({ clase: 'ultimo_avance', estado: { ...EST0, cursor: 1767600120 } }) })
  ver('otro avance antes de 5 s → 429 demasiados_avances, sin efectos', a2.http === 429 && uno(`select version from sim_sessions where id = '${s1}'`) === '1', eti(a2))
  libera(A)
  const a3 = comando(A, s1, u(953), 'avanzar', { testigo: T, version: 1, k: 3, resultado: res({ clase: 'ultimo_avance', estado: { ...EST0, cursor: 1767600120 } }) })
  ver('pasados los 5 s: 200, version 2 y UN solo recibo ultimo_avance (sobrescrito)', a3.ok && a3.version === 2 && n(`select count(*) from sim_recibos where session_id = '${s1}' and clase = 'ultimo_avance'`) === 1 && uno(`select command_id from sim_recibos where session_id = '${s1}' and clase = 'ultimo_avance'`) === u(953), eti(a3))
  libera(A)
  const a1bis = comando(A, s1, u(951), 'avanzar', { testigo: T, version: 0, k: 1, resultado: res({ clase: 'ultimo_avance', estado: EST1 }) })
  ver('reintento del primer avance (su recibo ya no esta) → 409 comando_caducado con la version vigente', a1bis.motivo === 'comando_caducado' && a1bis.version === 2, eti(a1bis))
  const a4 = comando(A, s1, u(954), 'checkpoint', { testigo: T, version: 2, k: 4, resultado: res({ clase: 'ultimo_avance', estado: { ...EST0, cursor: 1767600120 } }) })
  ver('checkpoint que no cambia nada: 200 y la version NO sube', a4.ok && a4.version === 2, eti(a4))
  libera(A)
  const EST2 = { ...EST0, cursor: 1767600180, posiciones: [1] }
  const ab = comando(A, s1, u(955), 'abrir', { testigo: T, version: 2, k: 5, resultado: res({ estado: EST2, eventos: [ev(0, 'orden_creada'), ev(1, 'fill')] }) })
  ver('abrir con 2 eventos: 200, version 3, recibo economico, seq 1 y 2', ab.ok && ab.version === 3 && ab.recibo?.clase === 'economico' && JSON.stringify((ab.eventos ?? []).map(e => e.seq)) === '[1,2]', eti(ab))
  const EST3 = { ...EST0, cursor: 1767600240, saldo_µ: { $b: '10097000000' } }
  const ce = comando(A, s1, u(956), 'cerrar', { testigo: T, version: 3, k: 6, resultado: res({ estado: EST3, eventos: [ev(0, 'cierre')], trades: [TRADE(0)], proyeccion: { balance: '10097' } }) })
  ver('cerrar: un trade v1 ligado a su evento cierre, con sus importes µ; balance proyectado; seq 3', ce.ok && ce.trades === 1 && ce.eventos?.[0]?.seq === 3
    && uno(`select t.motor_version||','||t.neto_micro||','||t.pnl||','||e.tipo from sim_trades t join sim_eventos e on e.id = t.evento_id where t.session_id = '${s1}'`) === '1,97000000,97.00,cierre'
    && uno(`select balance from sim_sessions where id = '${s1}'`) === '10097', eti(ce))
  const antes = uno(`select version||','||(select count(*) from sim_eventos where session_id = '${s1}')||','||(select count(*) from sim_recibos where session_id = '${s1}')||','||(select count(*) from sim_trades where session_id = '${s1}') from sim_sessions where id = '${s1}'`)
  const sinEfecto = () => uno(`select version||','||(select count(*) from sim_eventos where session_id = '${s1}')||','||(select count(*) from sim_recibos where session_id = '${s1}')||','||(select count(*) from sim_trades where session_id = '${s1}') from sim_sessions where id = '${s1}'`) === antes
  ver('un cierre sin su trade → 422 resultado_invalido (trades), sin efectos', comando(A, s1, u(957), 'cerrar', { testigo: T, version: 4, k: 7, resultado: res({ estado: EST2, eventos: [ev(0, 'cierre')] }) }).en === 'trades' && sinEfecto())
  ver('un trade de mas, o un trade que no se convierte (lots «x»), o ordinales con hueco → 422, sin efectos',
    comando(A, s1, u(957), 'cerrar', { testigo: T, version: 4, k: 7, resultado: res({ estado: EST2, eventos: [ev(0, 'fill')], trades: [TRADE(0)] }) }).http === 422
    && comando(A, s1, u(957), 'cerrar', { testigo: T, version: 4, k: 7, resultado: res({ estado: EST2, eventos: [ev(0, 'cierre')], trades: [{ ...TRADE(0), lots: 'x' }] }) }).en === 'tipos'
    && comando(A, s1, u(957), 'abrir', { testigo: T, version: 4, k: 7, resultado: res({ estado: EST2, eventos: [ev(1, 'fill')] }) }).en === 'eventos' && sinEfecto())
  ver('clase incoherente (avanzar con un fill declarado ultimo_avance) → 422 clase_incoherente, sin efectos',
    comando(A, s1, u(957), 'avanzar', { testigo: T, version: 4, k: 7, resultado: res({ clase: 'ultimo_avance', estado: EST2, eventos: [ev(0, 'fill')] }) }).motivo === 'clase_incoherente' && sinEfecto())
  ver('proyeccion de una columna no permitida (capital) → 422, sin efectos', comando(A, s1, u(957), 'abrir', { testigo: T, version: 4, k: 7, resultado: res({ estado: EST2, proyeccion: { capital: 1 } }) }).http === 422 && sinEfecto())
  const rz = comando(A, s1, u(958), 'abrir', { testigo: T, version: 4, k: 8, resultado: res({ resultado: 'rechazado', motivo: 'margen_insuficiente', estado: EST3 }) })
  ver('rechazo puro (margen): 200, recibo economico «rechazado», la version NO sube', rz.ok && rz.version === 4 && rz.recibo?.resultado === 'rechazado' && rz.recibo?.motivo === 'margen_insuficiente', eti(rz))
  const cf = comando(A, s1, u(959), 'abrir', { testigo: T, version: 3, k: 9, resultado: res({ estado: EST2 }) })
  ver('version esperada vieja → 409 conflicto con la version vigente', cf.motivo === 'conflicto' && cf.version === 4, eti(cf))
  const idem = comando(A, s1, u(956), 'cerrar', { testigo: T, version: 3, k: 6, resultado: res({ estado: EST3, eventos: [ev(0, 'cierre')], trades: [TRADE(0)] }) })
  ver('el cierre reenviado (misma clave y sobre): el recibo original, sin ejecutar (un solo trade)', idem.ok && idem.repetido && idem.recibo?.id === ce.recibo?.id && n(`select count(*) from sim_trades where session_id = '${s1}'`) === 1, eti(idem))
  ver('misma clave con otro sobre → 409 clave_reutilizada', comando(A, s1, u(956), 'cerrar', { testigo: T, version: 4, k: 99, resultado: res({ estado: EST3, eventos: [ev(0, 'cierre')], trades: [TRADE(0)] }) }).motivo === 'clave_reutilizada')
  ver('actor ajeno (B), incluso con una clave que tiene recibo → 404, sin devolver el recibo', comando(B, s1, u(956), 'cerrar', { testigo: T, version: 4, k: 6, resultado: res({ estado: EST3, eventos: [ev(0, 'cierre')], trades: [TRADE(0)] }) }).motivo === 'sesion_no_encontrada')
  ver('testigo equivocado, u otra pestaña con el testigo bueno → 409 sin_arrendamiento',
    comando(A, s1, u(960), 'abrir', { testigo: 'f'.repeat(64), version: 4, k: 10, resultado: res({ estado: EST2 }) }).motivo === 'sin_arrendamiento'
    && comando(A, s1, u(960), 'abrir', { testigo: T, cliente: 'pestana-9', version: 4, k: 10, resultado: res({ estado: EST2 }) }).motivo === 'sin_arrendamiento')
  pg.psql(`update sim_arrendamientos set hasta = clock_timestamp() - interval '1 second' where session_id = '${s1}'`, 'p')
  ver('arrendamiento caducado → 409 sin_arrendamiento', comando(A, s1, u(960), 'abrir', { testigo: T, version: 4, k: 10, resultado: res({ estado: EST2 }) }).motivo === 'sin_arrendamiento')
  const tk2 = tomar(A, s1, u(961), { k: 11 })
  const T2 = tk2.testigo
  ver('epoca distinta → 426; acceso retirado → 403 sin_acceso',
    comando(A, s1, u(962), 'abrir', { testigo: T2, epoca: 0, version: 4, k: 12, resultado: res({ estado: EST2 }) }).http === 426
    && (pg.psql(`update profiles set simulador_activo = false where id = '${A}'`, 'p'), comando(A, s1, u(962), 'abrir', { testigo: T2, version: 4, k: 12, resultado: res({ estado: EST2 }) }).motivo === 'sin_acceso'))
  pg.psql(`update profiles set simulador_activo = true where id = '${A}'`, 'p')
  ver('una sesion v0 → 409 no_es_v1', comando(A, u(101), u(963), 'abrir', { testigo: T2, version: 0, k: 13, resultado: res() }).motivo === 'no_es_v1')
  // V4-01: el arrendamiento es valido al EMPEZAR la llamada y caduca mientras espera la barrera
  const tk3 = tomar(A, s1, u(964), { k: 14 })
  pg.psql(`update sim_arrendamientos set hasta = clock_timestamp() + interval '1 second' where session_id = '${s1}'`, 'p')
  const q1 = conexion(), q2 = conexion()
  await q1.manda(`begin; select 1 from public.sim_alumnos where user_id = '${A}' for update;`)
  const pv = q2.manda(`set role service_role; ${sqlComando(A, s1, u(965), 'abrir', { testigo: tk3.testigo, version: 4, k: 15, resultado: res({ estado: EST2 }) })}`)
  const esperaV = await esperando(1)
  await espera(1600)
  await q1.manda('commit;')
  const v41 = await pv
  ver('V4-01: valido al empezar, caduca MIENTRAS espera el bloqueo → 409 sin_arrendamiento (hora tomada tras los bloqueos)', esperaV && v41.json?.motivo === 'sin_arrendamiento', `${esperaV} · ${v41.json?.motivo ?? v41.err}`)
  q1.cierra(); q2.cierra()
  const tk4 = tomar(A, s1, u(966), { k: 16 })
  ver('control: sin espera, el mismo comando con un arrendamiento vigente → 200', comando(A, s1, u(967), 'abrir', { testigo: tk4.testigo, version: 4, k: 17, resultado: res({ estado: EST2 }) }).ok)

  titulo('6 · pasar de fase (D07)')
  const P = u(400), H = u(401)
  crear(Y, P, u(1400), { sesion: { ...SESION, challenge_type: 'ftmo' }, estado: { esquema: 'reto@1', fase: 1, estado: 'en_curso' } })
  const tY = tomar(Y, P, u(1401))
  const nosup = SR(`select public.sim_avanzar_fase('${Y}', '${P}', '${H}', '${u(1402)}', ${L(JSON.stringify({ tipo: 'avanzar_fase', padre: P }))}, 1, 0, '{}', ${J({ esquema: 'reto@1', fase: 2, estado: 'en_curso' })}, ${J(MERCADO)}, '{}');`)
  ver('fase 1 sin superar → 409 fase_no_superada', nosup.motivo === 'fase_no_superada', eti(nosup))
  comando(Y, P, u(1403), 'cerrar', { testigo: tY.testigo, version: 0, resultado: res({ estado: { esquema: 'reto@1', fase: 1, estado: 'superada' }, eventos: [ev(0, 'cierre'), ev(1, 'fase_superada')], trades: [TRADE(0)] }) })
  const fase = sobre => SR(`select public.sim_avanzar_fase('${Y}', '${P}', '${H}', '${u(1404)}', ${L(sobre)}, 1, 1, ${J({ name: 'fase 2' })}, ${J({ esquema: 'reto@1', fase: 2, estado: 'en_curso' })}, ${J(MERCADO)}, '{}');`)
  ver('un sobre de tipo crear para pasar de fase → 422 sobre_invalido', fase(JSON.stringify({ tipo: 'crear', padre: P })).motivo === 'sobre_invalido')
  const f1 = fase(JSON.stringify({ tipo: 'avanzar_fase', padre: P }))
  ver('superada: 201, hija fase 2 con el capital del padre, padre passed_phase; recibo en la hija de tipo avanzar_fase (no crear)', f1.ok && f1.http === 201
    && f1.recibo?.tipo === 'avanzar_fase' && f1.recibo?.session_id === H
    && uno(`select challenge_phase||','||capital||','||challenge_parent_id||','||motor_version from sim_sessions where id = '${H}'`) === `2,10000,${P},1`
    && uno(`select status from sim_sessions where id = '${P}'`) === 'passed_phase', eti(f1))
  ver('reintento identico → el mismo recibo; otra hija → 409 transicion_hecha', fase(JSON.stringify({ tipo: 'avanzar_fase', padre: P })).recibo?.id === f1.recibo?.id
    && SR(`select public.sim_avanzar_fase('${Y}', '${P}', '${u(402)}', '${u(1405)}', ${L(JSON.stringify({ tipo: 'avanzar_fase', padre: P, otra: 1 }))}, 1, 1, '{}', ${J({ esquema: 'reto@1', fase: 2, estado: 'en_curso' })}, ${J(MERCADO)}, '{}');`).motivo === 'transicion_hecha')
  ver('la hija no cuenta en el cupo (Y: 1 raiz)', n(`select count(*) from sim_sessions where user_id = '${Y}' and challenge_parent_id is null`) === 1)

  titulo('7 · borrar (CD07; CTO 10-oct, decision 6; CTO 11-oct, opcion a)')
  ver('montaje: un dibujo en s1', pg.psql(`insert into session_drawings (user_id, session_id, pair) values ('${A}', '${s1}', 'EURUSD');`, 'p').ok)
  const bs = SR(`select public.sim_borrar_sesion('${A}', '${s1}');`)
  ver('sim_borrar_sesion: 200; la fila QUEDA como lapida (terminal = borrada) y se van recibos, eventos, trades, dibujos y arrendamiento',
    bs.ok && uno(`select terminal from sim_sessions where id = '${s1}'`) === 'borrada'
    && ['sim_recibos', 'sim_eventos', 'sim_trades', 'session_drawings', 'sim_arrendamientos'].every(t => n(`select count(*) from ${t} where session_id = '${s1}'`) === 0), eti(bs))
  ver('otra vez → 410; la de otro → 404; una v0 → 409 no_es_v1', SR(`select public.sim_borrar_sesion('${A}', '${s1}');`).http === 410
    && SR(`select public.sim_borrar_sesion('${B}', '${u(212)}');`).http === 404 && SR(`select public.sim_borrar_sesion('${A}', '${u(101)}');`).motivo === 'no_es_v1')
  const s1re = crear(A, s1, u(901))
  ver('A24: la creacion reintentada con ese id (misma clave y sobre) → 410 sesion_borrada; no resucita', s1re.http === 410 && s1re.motivo === 'sesion_borrada'
    && uno(`select terminal from sim_sessions where id = '${s1}'`) === 'borrada' && n(`select count(*) from sim_recibos where session_id = '${s1}'`) === 0, eti(s1re))
  ver('sobre la lapida: tomar el escritor → 410; un comando → 410', tomar(A, s1, u(970), { k: 20 }).motivo === 'sesion_borrada'
    && comando(A, s1, u(971), 'abrir', { testigo: 'x', version: 5, k: 21, resultado: res() }).motivo === 'sesion_borrada')
  // cupo: E tiene 12 raices v1 (300..310 y 330); una pasa a lapida
  SR(`select public.sim_borrar_sesion('${E}', '${u(330)}');`)
  const conDisp = crear(E, u(340), u(1340))
  ver('cupo con una lapida: el disparador de HOY aun la cuenta y para la 13.ª (se ajusta en sim-004, no aqui)', /imite de sesiones/i.test(conDisp.error ?? ''), eti(conDisp))
  pg.psql('alter table sim_sessions disable trigger trg_enforce_sim_session_limit', 'p')
  const sinDisp = crear(E, u(340), u(1340))
  pg.psql('alter table sim_sessions enable trigger trg_enforce_sim_session_limit', 'p')
  ver('sin ese disparador (como quedara tras sim-004): sim_crear_sesion no cuenta la lapida y entra', sinDisp.http === 201, eti(sinDisp))
  const bl = SR(`select public.sim_borrar_legacy('${A}', '${u(101)}');`)
  ver('sim_borrar_legacy: la v0 de A → 200; la fila queda como lapida, sin su trade; una v1 → 409 no_es_legado; la de otro → 404',
    bl.ok && uno(`select terminal from sim_sessions where id = '${u(101)}'`) === 'borrada' && n(`select count(*) from sim_trades where session_id = '${u(101)}'`) === 0
    && SR(`select public.sim_borrar_legacy('${A}', '${u(212)}');`).motivo === 'no_es_legado' && SR(`select public.sim_borrar_legacy('${A}', '${u(102)}');`).http === 404, eti(bl))
  ver('sim_borrar_legacy otra vez → 410', SR(`select public.sim_borrar_legacy('${A}', '${u(101)}');`).http === 410)
  // S003-01 (Astra 11-oct): borrar el reto P se lleva tambien su fase H. Oraculo P → H → borrar P → comando H
  const tH = tomar(Y, H, u(1410), { k: 30, forzar: true })
  const abH = comando(Y, H, u(1411), 'abrir', { testigo: tH.testigo, version: 0, k: 31, resultado: res({ estado: { esquema: 'reto@1', fase: 2, estado: 'en_curso', pos: 1 }, eventos: [ev(0, 'orden_creada')] }) })
  ver('montaje S003-01: la fase H de P con arrendamiento, un comando confirmado y un dibujo', tH.ok && abH.ok
    && pg.psql(`insert into session_drawings (user_id, session_id, pair) values ('${Y}', '${H}', 'EURUSD');`, 'p').ok, `${eti(tH)} · ${eti(abH)}`)
  const bP = SR(`select public.sim_borrar_sesion('${Y}', '${P}');`)
  ver('S003-01: borrar P → 200 y P y su fase H quedan como lapida', bP.ok && uno(`select string_agg(coalesce(terminal, '-'), ',' order by id) from sim_sessions where id in ('${P}', '${H}')`) === 'borrada,borrada', eti(bP))
  ver('S003-01: de H no queda nada: recibos, eventos, trades, dibujos ni arrendamiento',
    ['sim_recibos', 'sim_eventos', 'sim_trades', 'session_drawings', 'sim_arrendamientos'].every(t => n(`select count(*) from ${t} where session_id = '${H}'`) === 0))
  ver('S003-01: un comando sobre H (con su testigo de antes) → 410; tomar H → 410; borrar H → 410; comando sobre P → 410',
    comando(Y, H, u(1412), 'abrir', { testigo: tH.testigo, version: 1, k: 32, resultado: res() }).motivo === 'sesion_borrada'
    && tomar(Y, H, u(1413), { k: 33 }).motivo === 'sesion_borrada' && SR(`select public.sim_borrar_sesion('${Y}', '${H}');`).http === 410
    && comando(Y, P, u(1414), 'abrir', { testigo: 'x', version: 1, k: 34, resultado: res() }).motivo === 'sesion_borrada')
  // y en legacy: el reto v0 de B con su fase v0 (como las crea hoy la web), con un trade y un dibujo en la fase
  const LP = u(700), LH = u(701)
  ver('montaje S003-01 legacy: reto v0 LP de B y su fase LH, con un trade y un dibujo', pg.psql(`insert into sim_sessions (id, user_id, name, pair, timeframe, date_from, date_to, challenge_type, challenge_phase) values
      ('${LP}', '${B}', 'reto', 'EURUSD', 'H1', '2026-01-01', '2026-02-01', 'ftmo', 1);
    insert into sim_sessions (id, user_id, name, pair, timeframe, date_from, date_to, challenge_type, challenge_phase, challenge_parent_id) values
      ('${LH}', '${B}', 'fase 2', 'EURUSD', 'H1', '2026-01-01', '2026-02-01', 'ftmo', 2, '${LP}');
    insert into sim_trades (session_id, user_id, pair, side, entry_price, lots, pnl, opened_at) values ('${LH}', '${B}', 'EURUSD', 'BUY', 1.1, 1, 5, now());
    insert into session_drawings (user_id, session_id, pair) values ('${B}', '${LH}', 'EURUSD');`, 'p').ok)
  const bLP = SR(`select public.sim_borrar_legacy('${B}', '${LP}');`)
  ver('S003-01 legacy: borrar LP → 200; LP y LH lapidas; ni el trade ni el dibujo de LH; borrar LH → 410',
    bLP.ok && uno(`select string_agg(coalesce(terminal, '-'), ',' order by id) from sim_sessions where id in ('${LP}', '${LH}')`) === 'borrada,borrada'
    && n(`select count(*) from sim_trades where session_id = '${LH}'`) === 0 && n(`select count(*) from session_drawings where session_id = '${LH}'`) === 0
    && SR(`select public.sim_borrar_legacy('${B}', '${LH}');`).http === 410, eti(bLP))
  crear(W, u(500), u(1500))
  ver('montaje: W con config de grafico y una plantilla (columnas de s04)', pg.psql(`insert into user_chart_config (user_id) values ('${W}'); insert into sim_drawing_templates (user_id, name, data) values ('${W}', 'p', '[]');`, 'p').ok)
  const ba = SR(`select public.sim_borrar_alumno('${W}');`)
  ver('sim_borrar_alumno: la fila SI se va (no deja lapida); no queda nada de W en las tablas del simulador; B intacto', ba.ok && ['sim_sessions', 'sim_recibos', 'sim_trades', 'user_chart_config', 'sim_drawing_templates', 'sim_arrendamientos'].every(t => n(`select count(*) from ${t} where user_id = '${W}'`) === 0)
    && n(`select count(*) from sim_sessions where id = '${u(102)}' and terminal is null`) === 1, eti(ba))

  titulo('8 · el DELETE del hub (§ 6.1)')
  // orden simple 1: el hub borra antes; orden simple 2: la RPC confirma antes
  const sx = u(600)
  crear(X, sx, u(1600))
  const tX = tomar(X, sx, u(1601))
  pg.psql(`set role service_role; delete from sim_sessions where user_id = '${X}';`, 'p')
  ver('DELETE antes de la RPC → 410 sesion_borrada, sin efectos', comando(X, sx, u(1602), 'abrir', { testigo: tX.testigo, version: 0, resultado: res() }).motivo === 'sesion_borrada' && n(`select count(*) from sim_recibos where user_id = '${X}'`) === 0)
  crear(X, sx, u(1603)); const tX2 = tomar(X, sx, u(1604))
  const okX = comando(X, sx, u(1605), 'abrir', { testigo: tX2.testigo, version: 0, resultado: res({ estado: EST2, eventos: [ev(0, 'orden_creada')] }) })
  pg.psql(`set role service_role; delete from sim_sessions where user_id = '${X}';`, 'p')
  ver('RPC antes del DELETE → 200, y despues la cascada se lo lleva todo', okX.ok && ['sim_recibos', 'sim_eventos', 'sim_arrendamientos'].every(t => n(`select count(*) from ${t} where user_id = '${X}'`) === 0))
  // I1: el hub ya borro las sesiones; una creacion en vuelo; el hub borra la cuenta
  const i1a = conexion(), i1b = conexion()
  await i1a.manda(`begin; set role service_role; select public.sim_crear_sesion('${X}', '${u(610)}', '${u(1610)}', ${L(sobreCrear(u(610)))}, 1, ${J(SESION)}, ${J(EST0)}, ${J(MERCADO)}, '{}');`)
  const pb = i1b.manda(`delete from auth.users where id = '${X}';`)
  const espI1 = await esperando(1)
  await i1a.manda('commit;')
  const rI1 = await pb
  ver('I1: el borrado de la cuenta ESPERA a la creacion en vuelo (perfil FOR KEY SHARE) y al acabar no queda nada de X',
    espI1 && !rI1.err && ['sim_sessions', 'sim_recibos', 'sim_alumnos', 'sim_arrendamientos', 'sim_eventos', 'sim_trades'].every(t => n(`select count(*) from ${t} where user_id = '${X}'`) === 0), `${espI1} · ${rI1.err}`)
  ver('I1: y con el perfil ya borrado, crear → 410 perfil_borrado', crear(X, u(611), u(1611)).motivo === 'perfil_borrado')
  i1a.cierra(); i1b.cierra()
  // I2: pasar de fase en vuelo mientras el hub borra
  const P2 = u(620), H2 = u(621)
  crear(Z, P2, u(1620), { sesion: { ...SESION, challenge_type: 'ftmo' }, estado: { esquema: 'reto@1', fase: 1, estado: 'superada' } })
  const i2a = conexion(), i2b = conexion()
  await i2a.manda(`begin; set role service_role; select public.sim_avanzar_fase('${Z}', '${P2}', '${H2}', '${u(1621)}', ${L(JSON.stringify({ tipo: 'avanzar_fase', padre: P2 }))}, 1, 0, '{}', ${J({ esquema: 'reto@1', fase: 2, estado: 'en_curso' })}, ${J(MERCADO)}, '{}');`)
  const pb2 = i2b.manda(`set role service_role; delete from sim_sessions where user_id = '${Z}';`)
  const espI2 = await esperando(1)
  await i2a.manda('commit;')
  await pb2
  const hijaTras2 = n(`select count(*) from sim_sessions where id = '${H2}'`)
  await i2b.manda(`reset role; delete from auth.users where id = '${Z}';`)
  ver('I2: el DELETE espera al padre; al acabar el borrado (cuenta incluida) ninguna hija sobrevive', espI2 && n(`select count(*) from sim_sessions where user_id = '${Z}'`) === 0, `${espI2}`)
  console.log(`  · medido I2: tras el DELETE de sim_sessions la hija ${hijaTras2 ? 'SIGUE (su instantanea no la veia; cae con la cuenta)' : 'ya no esta'}`)
  i2a.cierra(); i2b.cierra()
  // I3: interbloqueo padre/hija. El hub toma H y despues necesita P; la RPC sobre H tiene P y espera H
  const V = u(11)
  ver('montaje I3: el alumno V (email NOT NULL, como en s04)', pg.psql(`insert into auth.users values ('${V}'); insert into profiles (id, email, plan, simulador_activo) values ('${V}', 'v@ejemplo.test', 'basic', true);`, 'p').ok)
  const P3 = u(630), H3 = u(631)
  crear(V, P3, u(1630), { sesion: { ...SESION, challenge_type: 'ftmo' }, estado: { esquema: 'reto@1', fase: 1, estado: 'superada' } })
  SR(`select public.sim_avanzar_fase('${V}', '${P3}', '${H3}', '${u(1631)}', ${L(JSON.stringify({ tipo: 'avanzar_fase', padre: P3 }))}, 1, 0, '{}', ${J({ esquema: 'reto@1', fase: 2, estado: 'en_curso' })}, ${J(MERCADO)}, '{}');`)
  const tV = tomar(V, H3, u(1632))
  const hub = conexion(), rpc = conexion()
  await hub.manda(`begin; set role service_role; select 1 from public.sim_sessions where id = '${H3}' for update;`)
  const cmdI3 = `set role service_role; ${sqlComando(V, H3, u(1633), 'abrir', { testigo: tV.testigo, version: 0, resultado: res({ estado: EST2, eventos: [ev(0, 'orden_creada')] }) })}`
  const pr = rpc.manda(cmdI3)
  const espI3 = await esperando(1)
  const ph = hub.manda(`delete from public.sim_sessions where user_id = '${V}';`)
  const [rr, rh3] = await Promise.all([pr, ph])
  const muere = [/deadlock detected/.test(rr.err) ? 'rpc' : null, /deadlock detected/.test(rh3.err) ? 'hub' : null].filter(Boolean)
  let final = ''
  if (muere[0] === 'rpc') {
    await hub.manda('commit;')
    const reint = await rpc.manda(cmdI3)
    final = reint.json?.motivo
  } else if (muere[0] === 'hub') {
    await hub.manda('rollback;')
    const otra = await hub.manda(`set role service_role; delete from public.sim_sessions where user_id = '${V}';`)
    final = (rr.json?.ok ? 'rpc 200' : 'rpc ?') + (otra.err ? ' / hub ' + otra.err : ' / hub repetido')
  }
  ver('I3: exactamente una de las dos aborta con 40P01 (interbloqueo)', espI3 && muere.length === 1, `${espI3} · ${muere.join(',') || 'ninguna'} · ${(rr.err || rh3.err).split('\n')[0]}`)
  ver('I3: tras el reintento (410 si murio la RPC) o el borrado repetido, nada de V en ninguna tabla; ningun medio comando',
    (muere[0] === 'rpc' ? final === 'sesion_borrada' : /rpc 200 \/ hub repetido/.test(final))
    && ['sim_sessions', 'sim_recibos', 'sim_eventos', 'sim_arrendamientos', 'sim_trades'].every(t => n(`select count(*) from ${t} where user_id = '${V}'`) === 0), `murio ${muere[0]} · ${final}`)
  hub.cierra(); rpc.cierra()
} finally {
  pg.cierra()
}
fin()
