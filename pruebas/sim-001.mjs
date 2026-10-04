/**
 * sim-001 · PERMISOS E INTEGRIDAD, ENSAYADOS ANTES DE PEDIRLOS
 *
 * sql/sim-001-permisos-e-integridad.sql en un PostgreSQL 17 desechable con un
 * esquema INVENTADO que reproduce los hechos del resumen de la s04 (4-oct-2026,
 * sql/APLICADOS.md): RLS en las 9 tablas, politicas ALL auth.uid() = user_id en
 * las 7 del simulador, profiles y messages solo SELECT, anon y authenticated con
 * todos los grants en las 7, session_chart_config.session_id sin FK, user_id
 * nulable en tres tablas y session_id nulable en sim_trades, sin indices.
 * El estado esta en pruebas/estado-s04.mjs (compartido con sim-001b).
 *
 *   1. con datos limpios: aplica; anon no puede nada; authenticated sigue
 *      leyendo y escribiendo LO SUYO y no puede TRUNCATE; borrar una sesion
 *      arrastra su session_chart_config; indices y NOT NULL puestos; FIN
 *   2. idempotente: otra vez, el mismo informe
 *   3. huerfanos en session_chart_config: falla, dice cuantos, y NO aplica nada
 *   4. nulos: aplica todo lo demas y deja sin NOT NULL las columnas con nulos,
 *      diciendo cuantos
 *   5. un grant a PUBLIC: falla (la comprobacion lo ve) y no aplica nada
 *   6. una FK distinta ya puesta en session_chart_config.session_id: falla
 * ⚠️ No prueba el editor de Supabase.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { titulo, ver, fin, REPO } from './lib.mjs'
import { BIN, hayPostgres, cluster } from './pg-ensayo.mjs'
if (!hayPostgres()) { ver(`PostgreSQL 17 en ${BIN}: NO hay, la prueba no se ha ejecutado`, false); fin() }
const SQL = readFileSync(path.join(REPO, 'sql/sim-001-permisos-e-integridad.sql'), 'utf8')
import { A, B, S1, S2, SIETE, ESTADO, DATOS } from './estado-s04.mjs'
const pg = cluster()
const nueva = (nombre, extra = '') => {
  const c = pg.psql(`create database ${nombre}`, 'postgres')
  const r = pg.psql(ESTADO + DATOS + extra, nombre)
  if (!c.ok || !r.ok) throw new Error('montaje ' + nombre + ': ' + (c.err || r.err))
}
const aplica = db => pg.psql(SQL, db)
const filas = r => r.out.split('\n')
const anonPuede = db => pg.como('anon', A, 'select count(*) from sim_trades;', db)

try {
  pg.arranca()

  titulo('1 · datos limpios')
  nueva('limpia')
  ver('control del estado de partida: anon LEE sim_trades (por grant; RLS le da 0 filas)', anonPuede('limpia') === '0', anonPuede('limpia'))
  ver('control: authenticated puede TRUNCATE antes', pg.como('authenticated', A, 'truncate session_chart_config cascade;', 'limpia') !== 'DENEGADO')
  const r1 = aplica('limpia')
  ver('se aplica entero', r1.ok, r1.err.split('\n')[0])
  ver('acaba en FIN | sim-001 aplicada', filas(r1).at(-1) === 'FIN|sim-001 aplicada', filas(r1).at(-1))
  for (const t of SIETE) ver(`anon no puede leer ${t}`, pg.como('anon', A, `select count(*) from ${t};`, 'limpia') === 'DENEGADO')
  ver('anon no puede insertar', pg.como('anon', A, `insert into sim_sessions (user_id, name) values ('${A}', 'x');`, 'limpia') === 'DENEGADO')
  ver('el informe no tiene ninguna fila de grant para anon', !filas(r1).some(l => / · anon · /.test(l)), filas(r1).filter(l => l.startsWith('grant|')).join(' / '))
  ver('authenticated: TRUNCATE denegado', pg.como('authenticated', A, 'truncate session_chart_config cascade;', 'limpia') === 'DENEGADO')
  ver('authenticated A lee lo suyo (1 trade de 2)', pg.como('authenticated', A, 'select count(*) from sim_trades;', 'limpia') === '1')
  ver('authenticated A inserta, actualiza y borra lo suyo', pg.como('authenticated', A, `insert into sim_sessions (user_id, name) values ('${A}', 'nueva') returning name;
    update sim_sessions set balance = 1 where id = '${S1}' returning balance; delete from sim_drawing_templates where user_id = '${A}' returning name;`, 'limpia') === 'nueva 1 plantilla')
  ver('authenticated A no escribe a nombre de B (RLS intacta)', pg.como('authenticated', A, `insert into sim_sessions (user_id, name) values ('${B}', 'x');`, 'limpia') === 'RLS')
  ver('borrar la sesion de A arrastra su session_chart_config (y sus trades y dibujos)', pg.como('service_role', A, `delete from sim_sessions where id = '${S1}';
    select (select count(*) from session_chart_config where session_id = '${S1}') || '/' || (select count(*) from session_chart_config);`, 'limpia') === '0/1')
  ver('la FK es la de la s04 con CASCADE', filas(r1).some(l => l === 'fk|session_chart_config · session_chart_config_session_id_fkey · FOREIGN KEY (session_id) REFERENCES sim_sessions(id) ON DELETE CASCADE · validada=true'), filas(r1).filter(l => l.startsWith('fk|')).join(''))
  ver('los tres indices, validos', ['sim_sessions_user_id_idx ON public.sim_sessions USING btree (user_id)', 'sim_trades_session_id_idx ON public.sim_trades USING btree (session_id)',
    'sim_trades_user_id_closed_idx ON public.sim_trades USING btree (user_id, closed_at)'].every(d => filas(r1).some(l => l.includes(d) && l.endsWith('valido=true'))))
  ver('los cuatro NOT NULL, con 0 nulos', filas(r1).filter(l => /^not null\|.*not_null=true · nulos=0$/.test(l)).length === 4, filas(r1).filter(l => l.startsWith('not null|')).join(' / '))
  ver('profiles y messages sin tocar: siguen sus 2 politicas', pg.psql(`select count(*) from pg_policies where tablename in ('profiles','messages');`, 'limpia').out === '2')

  titulo('2 · idempotente')
  const r2 = aplica('limpia')
  ver('segunda vez: sin error y el mismo informe', r2.ok && r2.out === pg.psql(SQL.slice(SQL.indexOf('-- INFORME') - 80), 'limpia').out && filas(r2).at(-1) === 'FIN|sim-001 aplicada', r2.err.split('\n')[0])

  titulo('3 · huerfanos en session_chart_config')
  nueva('huerfanos', `insert into session_chart_config (user_id, session_id) values ('${A}', gen_random_uuid()), ('${B}', gen_random_uuid());`)
  const r3 = aplica('huerfanos')
  ver('falla con «sim-001:» y dice cuantas', !r3.ok && /sim-001: session_chart_config tiene 2 fila\(s\) huerfana\(s\)/.test(r3.err), r3.err.split('\n')[0])
  ver('y no aplica NADA: anon sigue leyendo y no hay indices', anonPuede('huerfanos') === '0' && pg.psql(`select count(*) from pg_indexes where indexname like 'sim_%_idx';`, 'huerfanos').out === '0')

  titulo('4 · nulos')
  nueva('nulos', `insert into sim_sessions (user_id, name) values (null, 'sin dueño'), (null, 'otra');
    insert into sim_trades (user_id, session_id, pnl) values ('${A}', null, 0);`)
  const r4 = aplica('nulos')
  ver('se aplica', r4.ok && filas(r4).at(-1) === 'FIN|sim-001 aplicada', r4.err.split('\n')[0])
  ver('sim_sessions.user_id: no aplicado, 2 nulos', filas(r4).includes('not null|sim_sessions.user_id · not_null=false · nulos=2'))
  ver('sim_trades.session_id: no aplicado, 1 nulo', filas(r4).includes('not null|sim_trades.session_id · not_null=false · nulos=1'))
  ver('los otros dos, aplicados', filas(r4).includes('not null|sim_trades.user_id · not_null=true · nulos=0') && filas(r4).includes('not null|sim_drawing_templates.user_id · not_null=true · nulos=0'))
  ver('y el resto si: anon fuera', anonPuede('nulos') === 'DENEGADO')

  titulo('5 · un grant a PUBLIC')
  nueva('publico', 'grant select on public.sim_trades to public;')
  const r5 = aplica('publico')
  ver('falla: anon conserva SELECT sobre sim_trades (¿grant a PUBLIC?)', !r5.ok && /sim-001: anon conserva SELECT sobre sim_trades \(¿grant a PUBLIC\?\)/.test(r5.err), r5.err.split('\n')[0])
  ver('y no aplica nada (sin indices)', pg.psql(`select count(*) from pg_indexes where indexname like 'sim_%_idx';`, 'publico').out === '0')

  titulo('6 · una FK distinta ya puesta')
  nueva('otrafk', `alter table session_chart_config add constraint scc_fk foreign key (session_id) references sim_sessions(id);`)
  const r6 = aplica('otrafk')
  ver('falla y la nombra', !r6.ok && /sim-001: session_chart_config.session_id ya tiene una FK distinta.*scc_fk/.test(r6.err), r6.err.split('\n')[0])
} catch (e) {
  ver('el ensayo arranco', false, e.message)
} finally {
  pg.cierra()
}
fin()
