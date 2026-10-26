/**
 * sim-005-progreso-monotono · ENSAYO EN POSTGRESQL 17 LOCAL (SIMGOTO3-01 y 05; orden 1-090 del CTO)
 *
 * El disparador BEFORE UPDATE OF last_timestamp en sim_sessions, con la canonica v4. Montaje: produccion segun s04 +
 * sim-002/003/004a (pruebas/montaje-v1.mjs base), aplicada por el ejecutor de s06. Datos INVENTADOS.
 * Lo esperado (grafo y fichas de las 26 tablas del cierre) se MIDE en el montaje y se pone con aMontaje en el texto;
 * el texto TAL CUAL lleva el ⟦HUECO s-contexto v4⟧ y tiene que PARAR sin tocar nada.
 *   0 tal cual: PARA (S005-CC) y nada creado
 *   1 antes (rojo previo): un UPDATE ordinario y un cierre con p_last_timestamp menor BAJAN last_timestamp
 *   2 aplicar: «FIN | sim-005 aplicada…»; funcion INVOKER, search_path vacio, sin EXECUTE para nadie; disparador exacto
 *   3 despues, como authenticated: el UPDATE ordinario y el cierre no bajan; subir sube; NULL no borra; desde NULL fija
 *   4 reejecutar: el mismo informe, nada cambia
 *   5 deriva: un disparador mas en sim_sessions, o una tabla del cierre con otra ficha → PARA (S005-CC) sin tocar
 *   6 estado mixto (solo la funcion): PARA (S005-01)
 *   7 vuelta atras: quita los dos y last_timestamp vuelve a poder bajar; reejecutarla no cambia nada
 * ⚠️ No prueba el editor de Supabase ni PostgREST de verdad.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { titulo, ver, oraculo, fin, REPO } from './lib.mjs'
import { hayPostgres } from './pg-ensayo.mjs'
import { montajeV1, L } from './montaje-v1.mjs'
import { TABLAS, CUERPO, DISPARADOR, migracion, vuelta, consulta } from './genera-sim-005.mjs'
const CC = await import(pathToFileURL('/Users/principal/Desktop/revisiones-suite/guardas/contexto.mjs').href)
const P = await import(pathToFileURL('/Users/principal/Desktop/revisiones-suite/guardas/produccion.mjs').href)
titulo('los .sql son los que genera pruebas/genera-sim-005.mjs (nadie los ha tocado a mano)')
for (const [f, t] of [['sql/sim-005-progreso-monotono.sql', migracion], ['sql/sim-005-vuelta-atras.sql', vuelta], ['sql/consultas/s-contexto-sim.sql', consulta]])
  oraculo('S5', `${f}: identico al generado`, readFileSync(path.join(REPO, f), 'utf8') === t)
oraculo('S5', 'la canonica v4 en la sim-005 y en su vuelta atras (comprueba: BLOQUE tal cual y ORIGEN antes de cada escritura)', CC.comprueba(migracion).ok && CC.comprueba(vuelta).ok)
if (!hayPostgres()) { ver('PostgreSQL 17 local: NO hay, la prueba no se ha ejecutado', false); fin() }
const S5 = readFileSync(path.join(REPO, 'sql/sim-005-progreso-monotono.sql'), 'utf8')
const V5 = readFileSync(path.join(REPO, 'sql/sim-005-vuelta-atras.sql'), 'utf8')
const u = k => `00000000-0000-4000-8000-${String(k).padStart(12, '0')}`
const A = u(1), S = u(101)
const m = montajeV1()
const err1 = r => (r.err || '').split('\n').find(l => /ERROR/.test(l)) ?? r.err
const hay = d => m.uno(d, `select (select count(*) from pg_proc where proname = 'sim_sessions_progreso_monotono') || '/' || (select count(*) from pg_trigger where tgname = 'sim_sessions_progreso_monotono')`)
// lo que mide la canonica en el montaje: el grafo y la ficha de cada tabla del cierre
// con el search_path de la migracion (y de la s-contexto): con otro, los regclass salen sin «public.» y no casan
const SP = 'set search_path = pg_catalog, pg_temp;\n'
const fichas = d => Object.fromEntries(TABLAS.map(t => [t, m.uno(d, SP + CC.mide.tabla(t))]))
// el ejecutor de produccion (postgres) lee auth.users: «postgres=ar*wdDxtm/supabase_auth_admin», medido en la s-contexto v4
// (revisiones-suite/guardas/salidas/s-contexto-v4.csv). La cuenta de huerfanos de la canonica lo necesita; el montaje no lo daba
const base = db => { m.base(db); m.uno(db, 'grant select on auth.users to pgx'); return db }
const conMontaje = (texto, grafo, partida, dest) => P.aMontaje(texto, { grafo, CC_DISP_PARTIDA: partida, CC_DISP_DESTINO: dest })
try {
  m.arranca()
  const d = base('p5')
  m.alumno(d, A)
  m.uno(d, `insert into public.sim_sessions (id, user_id, name, pair, timeframe, date_from, date_to, balance, last_timestamp) values (${L(S)}, ${L(A)}, 's', 'EURUSD', 'H1', '2026-01-01', '2026-02-01', 10000, 2000)`)
  let k = 500
  const firmado = `begin; set local role authenticated; select set_config('request.jwt.claims', ${L(JSON.stringify({ role: 'authenticated', sub: A }))}, true), set_config('request.jwt.claim.sub', ${L(A)}, true), set_config('request.headers', ${L(JSON.stringify({ 'x-sim-cliente': 'etapa1-1' }))}, true) \\g /dev/null\n`
  const cierra = ts => {
    const t = JSON.stringify({ id: u(k++), user_id: A, pair: 'EURUSD', side: 'BUY', lots: '1.00', entry_price: '1.10000', exit_price: '1.10100', pnl: '1.00', result: 'WIN', opened_at: '2026-01-05T10:00:00Z', closed_at: '2026-01-05T11:00:00Z' })
    return m.pg.psql(`${firmado}select public.sim_cierre_v0(${L(S)}, 10001, ${ts == null ? 'null' : ts}, ${L(t)}::jsonb); commit;`, d)
  }
  // el UPDATE ordinario, como lo haria el cliente con su sesion (PostgREST, authenticated, su propia fila)
  const actualiza = v => m.pg.psql(`${firmado}update public.sim_sessions set last_timestamp = ${v == null ? 'null' : v} where id = ${L(S)}; commit;`, d)
  const ultimo = () => m.uno(d, `select coalesce(last_timestamp::text, '-') from public.sim_sessions where id = ${L(S)}`)
  const pon = v => m.uno(d, `alter table public.sim_sessions disable trigger user; update public.sim_sessions set last_timestamp = ${v == null ? 'null' : v} where id = ${L(S)}; alter table public.sim_sessions enable trigger user`)

  // lo esperado: partida medida aqui; destino, medido en una copia con la funcion y el disparador puestos a mano
  const grafo = m.uno(d, SP + CC.mide.grafo()), partida = fichas(d)
  const dd = base('p5d')
  // como el ejecutor, que es quien la aplica: el dueño de la funcion entra en la ficha del disparador
  const rd = m.comoEjecutor(dd, `create function public.sim_sessions_progreso_monotono() returns trigger language plpgsql volatile security invoker set search_path = '' as ${L(CUERPO)};
revoke all on function public.sim_sessions_progreso_monotono() from public, anon, authenticated, service_role; ${DISPARADOR}`)
  if (!rd.ok) throw new Error('destino a mano: ' + err1(rd))
  const destino = fichas(dd)
  ver('control: entre partida y destino solo cambia la ficha de sim_sessions', Object.keys(partida).filter(t => partida[t] !== destino[t]).join() === 'public.sim_sessions')
  ver('control: el grafo del montaje no cambia con la copia', m.uno(dd, SP + CC.mide.grafo()) === grafo)
  const S5m = conMontaje(S5, grafo, partida, destino), V5m = conMontaje(V5, grafo, partida, destino)

  titulo('0 · tal cual (con el hueco): PARA y nada creado')
  const r00 = m.comoEjecutor(d, S5)
  oraculo('S5', 'tal cual: ERROR S005-CC y ni funcion ni disparador', !r00.ok && /S005-CC/.test(r00.err) && hay(d) === '0/0', r00.ok ? 'se aplico' : err1(r00))

  titulo('1 · antes de sim-005: last_timestamp baja (el fallo)')
  const r0 = actualiza(1000)
  ver('control: sin sim-005, un UPDATE ordinario con 1000 sobre 2000 deja 1000 (SIMGOTO3-01)', r0.ok && ultimo() === '1000', r0.ok ? ultimo() : err1(r0))
  pon(2000); const r0b = cierra(1000)
  ver('control: sin sim-005, un cierre con 1000 sobre 2000 deja 1000', r0b.ok && ultimo() === '1000', r0b.ok ? ultimo() : err1(r0b))

  titulo('2 · aplicar')
  const r1 = m.comoEjecutor(d, S5m)
  const informe1 = r1.out.split('\n').filter(Boolean)
  oraculo('S5', 'se aplica y la ultima fila dice «FIN | sim-005 aplicada…»', r1.ok && /^FIN\|sim-005 aplicada/.test(informe1.at(-1)?.replace(/ \| /, '|')), r1.ok ? informe1.join(' / ') : err1(r1))
  oraculo('S5', 'funcion: INVOKER, VOLATILE, search_path vacio, sin EXECUTE para nadie mas que su dueño',
    m.uno(d, `select p.prosecdef || '|' || p.provolatile::text || '|' || (p.proconfig = array['search_path=""']) || '|' || coalesce((select string_agg(a.grantee::regrole::text, ',') from aclexplode(p.proacl) a where a.grantee <> p.proowner), '-') from pg_proc p where proname = 'sim_sessions_progreso_monotono'`) === 'false|v|true|-')
  oraculo('S5', 'el disparador, exacto y activo', m.uno(d, SP + `select pg_get_triggerdef(oid) || '|' || tgenabled::text from pg_trigger where tgname = 'sim_sessions_progreso_monotono'`) === DISPARADOR + '|O')
  oraculo('S5', 'la ficha de las tablas del cierre es la del destino medido', JSON.stringify(fichas(d)) === JSON.stringify(destino))

  titulo('3 · despues: last_timestamp no baja, venga de donde venga')
  pon(2000); const r2 = actualiza(1000)
  oraculo('S5', 'un UPDATE ordinario (authenticated) con 1000 sobre 2000 deja 2000', r2.ok && ultimo() === '2000', r2.ok ? ultimo() : err1(r2))
  const r2b = m.pg.psql(`update public.sim_sessions set last_timestamp = 1000 where id = ${L(S)}`, d)
  oraculo('S5', 'un UPDATE del dueño de la tabla tampoco lo baja', r2b.ok && ultimo() === '2000', r2b.ok ? ultimo() : err1(r2b))
  const r3 = cierra(1000)
  oraculo('S5', 'un cierre con 1000 sobre 2000 deja 2000', r3.ok && ultimo() === '2000', r3.ok ? ultimo() : err1(r3))
  const r4 = cierra(3000)
  oraculo('S5', 'un cierre con 3000 sobre 2000 deja 3000', r4.ok && ultimo() === '3000', r4.ok ? ultimo() : err1(r4))
  const r5 = actualiza(null)
  oraculo('S5', 'un UPDATE a NULL no borra el progreso (3000)', r5.ok && ultimo() === '3000', r5.ok ? ultimo() : err1(r5))
  const r6 = cierra(null)
  oraculo('S5', 'un cierre parcial (NULL) conserva 3000', r6.ok && ultimo() === '3000', r6.ok ? ultimo() : err1(r6))
  pon(null); const r7 = actualiza(1500)
  oraculo('S5', 'sin last_timestamp guardado, un UPDATE con 1500 lo fija en 1500', r7.ok && ultimo() === '1500', r7.ok ? ultimo() : err1(r7))
  const r8 = m.pg.psql(`${firmado}update public.sim_sessions set name = 'otro' where id = ${L(S)}; commit;`, d)
  oraculo('S5', 'un UPDATE que no toca last_timestamp sigue funcionando', r8.ok && ultimo() === '1500' && m.uno(d, `select name from public.sim_sessions where id = ${L(S)}`) === 'otro', r8.ok ? '' : err1(r8))

  titulo('4 · reejecutar')
  const r9 = m.comoEjecutor(d, S5m)
  oraculo('S5', 'reejecutar: el mismo informe y nada cambia', r9.ok && r9.out === r1.out && hay(d) === '1/1' && JSON.stringify(fichas(d)) === JSON.stringify(destino), r9.ok ? r9.out : err1(r9))

  titulo('5 · deriva: PARA ante cualquier diferencia con lo medido')
  const d2 = base('p5b')
  m.uno(d2, `create function public.rev_otro() returns trigger language plpgsql as 'begin return new; end'; create trigger rev_otro before update on public.sim_sessions for each row execute function public.rev_otro()`)
  const r10 = m.comoEjecutor(d2, S5m)
  oraculo('S5', 'un disparador mas en sim_sessions: ERROR S005-CC y nada creado', !r10.ok && /S005-CC/.test(r10.err) && hay(d2) === '0/0', r10.ok ? 'se aplico' : err1(r10))
  const d3 = base('p5c')
  m.uno(d3, `alter table public.ia_uso add column rev_x int`)
  const r11 = m.comoEjecutor(d3, S5m)
  oraculo('S5', 'una tabla del cierre (ia_uso) con otra ficha: ERROR S005-CC y nada creado', !r11.ok && /S005-CC/.test(r11.err) && hay(d3) === '0/0', r11.ok ? 'se aplico' : err1(r11))
  const d4 = base('p5e')
  m.uno(d4, `grant select on public.sim_sessions to public`)
  const r12 = m.comoEjecutor(d4, S5m)
  oraculo('S5', 'sim_sessions con otro permiso: ERROR S005-CC y nada creado', !r12.ok && /S005-CC/.test(r12.err) && hay(d4) === '0/0', r12.ok ? 'se aplico' : err1(r12))

  titulo('6 · estado mixto')
  const d5 = base('p5f')
  m.uno(d5, `create function public.sim_sessions_progreso_monotono() returns trigger language plpgsql volatile security invoker set search_path = '' as ${L(CUERPO)}`)
  const r13 = m.comoEjecutor(d5, S5m)
  oraculo('S5', 'solo la funcion, sin disparador: ERROR S005-01 y no se toca', !r13.ok && /S005-01/.test(r13.err) && hay(d5) === '1/0', r13.ok ? 'se aplico' : err1(r13))

  titulo('7 · vuelta atras')
  const v0 = m.comoEjecutor(d, V5)
  oraculo('S5', 'vuelta atras tal cual (con el hueco): ERROR V005-CC y no quita nada', !v0.ok && /V005-CC/.test(v0.err) && hay(d) === '1/1', v0.ok ? 'se aplico' : err1(v0))
  const v1 = m.comoEjecutor(d, V5m)
  oraculo('S5', 'vuelta atras: «FIN | sim-005 retirada…», sin funcion ni disparador y las fichas, las de partida',
    v1.ok && /sim-005 retirada/.test(v1.out) && hay(d) === '0/0' && JSON.stringify(fichas(d)) === JSON.stringify(partida), v1.ok ? v1.out : err1(v1))
  pon(2000); const v2 = actualiza(1000)
  oraculo('S5', 'tras la vuelta atras, un UPDATE vuelve a poder bajar (1000)', v2.ok && ultimo() === '1000', v2.ok ? ultimo() : err1(v2))
  const v3 = m.comoEjecutor(d, V5m)
  oraculo('S5', 'reejecutar la vuelta atras: no cambia nada', v3.ok && hay(d) === '0/0', v3.ok ? v3.out : err1(v3))
} finally { m.cierra() }
fin()
