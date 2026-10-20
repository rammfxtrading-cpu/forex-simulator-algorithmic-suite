/**
 * S16p (¿ESTA APLICADA LA PUERTA?) · ENSAYO EN POSTGRESQL 17 LOCAL (orden 1-027, D3; S16RO-01, orden 1-031).
 *   1 READ ONLY, una sola SELECT, acaba en FIN; no lee ninguna de las 14 tablas
 *   2 la guarda: pegada por partes, falla cerrada sin dar datos
 *   3 en el estado 1 (sin puerta): SIN APLICAR; tras sql/sim-004a-puerta.sql: APLICADA, la funcion «exacta» y sus 2
 *     disparadores «exacto»
 *   4 S16RO-01: la familia de Astra (otra funcion con el mismo nombre de disparador, solo INSERT, WHEN(false), AFTER,
 *     FOR EACH STATEMENT, SECURITY DEFINER, otro search_path) y las de antes (sin un disparador, desactivado, otro
 *     cuerpo), mas UPDATE OF una columna, EXECUTE a anon, un tercer disparador que llama a la puerta, y (RG-06, RG-02)
 *     un argumento, ENABLE ALWAYS / REPLICA, dos en sim_sessions y ninguno en sim_trades, otro nombre en sim_trades y
 *     un disparador en otro esquema que la llama: todas A MEDIAS.
 *     GR1-01 (Astra, guardas r1): las tres SUSTITUCIONES por una tabla temporal homonima (sim_sessions, sim_trades y
 *     las dos) con el disparador exacto: A MEDIAS, y cada disparador sale con su esquema real (pg_temp_N), no «public.».
 *     Con a6bb3a5 daban APLICADA (rojo previo: S16P_FICHERO con el SQL de a6bb3a5).
 *     Control funcional: con la puerta exacta, un UPDATE de alumno sin x-sim-cliente se rechaza; con las tres de Astra
 *     que lo dejan pasar, pasa (por eso tienen que salir A MEDIAS). Cada desvio, en una transaccion que se deshace
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { titulo, ver, oraculo, fin, REPO } from './lib.mjs'
import { hayPostgres } from './pg-ensayo.mjs'
import { montajeV1 } from './montaje-v1.mjs'
const lee = p => readFileSync(path.join(REPO, p), 'utf8')
const APL = 'APLICADA (los objetos de sim-004a-puerta, exactos; que bloquee lo acredita la s16 completa)'   // RG-01
const S16P = lee(process.env.S16P_FICHERO || 'sql/consultas/s16p-puerta-aplicada.sql'), PUERTA = lee('sql/sim-004a-puerta.sql')
titulo('1 · solo lectura')
const sin = S16P.replace(/--.*$/gm, '').replace(/'[^']*'/g, "''")
oraculo('S16p', 'BEGIN READ ONLY, SET LOCAL search_path = pg_catalog, pg_temp (S10RO-01), una sola SELECT y ROLLBACK (regla del LEEME, 18-oct): sin escrituras, EXECUTE ni set_config; no lee ninguna de las 14 tablas', /^begin read only;$/m.test(S16P) && /^rollback;$/m.test(S16P) && !/\b(insert|update|delete|truncate|alter|create|drop|grant|revoke|execute|perform|call|do|set_config)\b/i.test(sin) && (sin.match(/;/g) || []).length === 4 && /^set local search_path = pg_catalog, pg_temp;$/m.test(S16P) && !/\b(from|join)\s+(public\.)?(sim_|session_|user_)/i.test(sin))
if (!hayPostgres()) { ver('PostgreSQL 17 local: NO hay, la prueba no se ha ejecutado', false); fin() }
const m = montajeV1()
try {
  m.arranca()
  const corre = d => m.comoEjecutor(d, S16P)
  const filas = r => r.out.split('\n').filter(l => l && !/^(BEGIN|ROLLBACK|SET|CREATE FUNCTION|DROP TRIGGER|CREATE TRIGGER|ALTER FUNCTION|ALTER TABLE|GRANT)$/.test(l))
  const veredicto = r => (filas(r).find(l => l.startsWith('veredicto|')) ?? '').split('|')[2] ?? ''
  const d = m.base('sp1')
  titulo('2 · la guarda: pegada por partes, falla cerrada sin dar datos')
  const partes = [S16P.replace(/^begin read only;$/m, ''), S16P.replace(/^begin read only;$/m, '').replace(/^rollback;$/m, ''), S16P.replace(/^begin read only;$/m, 'begin;')].map(t => m.comoEjecutor(d, t))
  oraculo('S16p', 'sin su BEGIN READ ONLY, solo la SELECT o con BEGIN ordinario: error «s16p: pegala ENTERA…» y ninguna fila', partes.every(r => !r.ok && /s16p: pegala ENTERA/.test(r.err) && !/FIN\|s16p/.test(r.out)), partes.map(r => r.err).join(' / ').slice(0, 200))
  titulo('3 · sin puerta y con la puerta exacta')
  const r0 = corre(d), l0 = filas(r0)
  oraculo('S16p', 'estado 1 (sin puerta): «funcion|…|no existe», ningun disparador, veredicto SIN APLICAR y FIN', r0.ok && l0.includes('funcion|public.sim_escrituras_v0_puerta()|no existe') && !l0.some(l => l.startsWith('disparador|')) && veredicto(r0) === 'SIN APLICAR' && l0.at(-1) === 'FIN|s16p|consulta', (r0.err || l0.join(' / ')).slice(0, 300))
  const ap = m.comoEjecutor(d, PUERTA)
  ver('control: sql/sim-004a-puerta.sql aplica en el montaje', ap.ok && /FIN\|sim-004a-puerta aplicada/.test(ap.out), ap.err)
  const r1 = corre(d), l1 = filas(r1)
  const fn1 = l1.find(l => l.startsWith('funcion|')) ?? ''
  oraculo('S16p', 'tras la puerta: la funcion con su cuerpo y su ficha (plpgsql, INVOKER, VOLATILE, search_path vacio, trigger, sin argumentos, dueño = ejecutor, nadie mas la ejecuta) «exacta»; sus 2 disparadores «exacto» (llaman a la puerta, tgtype 31, sin WHEN, columnas ni argumentos, activos); APLICADA',
    r1.ok && fn1 === 'funcion|public.sim_escrituras_v0_puerta()|existe · cuerpo sha256=fe4c7c32b146e7d525665760047af0ad49d85d2dc538e1afcf3b080a9f305883 (el de sim-004a-puerta) · plpgsql|definer=false|v|search_path=""|ret=trigger|args=0|dueño=ejecutor · la ejecutan ademas del dueño: nadie · exacta'
    && ['sim_sessions', 'sim_trades'].every(t => l1.includes(`disparador|public.${t}.sim_escrituras_v0_puerta|llama a la puerta · tgtype=31 · when=no · columnas=ninguna · args=0 · interno=false · restriccion=false · tgenabled=O · exacto`))
    && veredicto(r1) === APL, (r1.err || l1.join(' / ')).slice(0, 600))
  titulo('4 · S16RO-01: la familia de Astra y las demas, A MEDIAS; y el control funcional')
  const uid = 'aaaaaaaa-0000-4000-8000-000000000001', sid = 'bbbbbbbb-0000-4000-8000-000000000001'
  m.alumno('sp1', uid, {})
  m.uno('sp1', `insert into public.sim_sessions (id, user_id, name, pair, timeframe, date_from, date_to, capital, balance) values ('${sid}', '${uid}', 'sintetica', 'EUR/USD', 'M1', '2026-01-01', '2026-01-31', 100000, 100000)`)
  // un alumno por PostgREST SIN la cabecera x-sim-cliente (un cliente anterior a la etapa 1)
  const sinCabecera = `set local role authenticated; set local request.jwt.claim.sub = '${uid}'; set local request.jwt.claims = '{"role":"authenticated"}'; set local request.headers = '{}'; update public.sim_sessions set balance = 99990 where id = '${sid}' returning balance`
  const escribe = (ddl = '') => m.comoEjecutor(d, `begin;\n${ddl ? ddl + ';\n' : ''}${sinCabecera};\nrollback;`)
  const ctl = escribe()
  ver('control funcional: con la puerta exacta, el UPDATE sin cabecera se rechaza', !ctl.ok && /escritura sin x-sim-cliente rechazada/.test(ctl.err), ctl.err || ctl.out)
  const T = 'drop trigger sim_escrituras_v0_puerta on public.sim_sessions; create trigger sim_escrituras_v0_puerta'
  // una tabla temporal con el nombre de la de public y el disparador EXACTO (nombre, funcion, tgtype 31, activo)
  const TEMP = t => `create temporary table ${t} (x integer); create trigger sim_escrituras_v0_puerta before insert or update or delete on pg_temp.${t} for each row execute function public.sim_escrituras_v0_puerta()`
  const desvios = [
    ['otra funcion, mismo nombre de disparador', `create function public.otra_noop() returns trigger language plpgsql as $f$ begin return new; end $f$; ${T} before insert or update or delete on public.sim_sessions for each row execute function public.otra_noop()`, true],
    ['solo INSERT', `${T} before insert on public.sim_sessions for each row execute function public.sim_escrituras_v0_puerta()`, true],
    ['WHEN(false)', `${T} before insert or update or delete on public.sim_sessions for each row when (false) execute function public.sim_escrituras_v0_puerta()`, true],
    ['AFTER en lugar de BEFORE', `${T} after insert or update or delete on public.sim_sessions for each row execute function public.sim_escrituras_v0_puerta()`],
    ['FOR EACH STATEMENT', `${T} before insert or update or delete on public.sim_sessions for each statement execute function public.sim_escrituras_v0_puerta()`],
    ['UPDATE OF una columna', `${T} before insert or update of timeframe or delete on public.sim_sessions for each row execute function public.sim_escrituras_v0_puerta()`],
    ['SECURITY DEFINER', 'alter function public.sim_escrituras_v0_puerta() security definer'],
    ['search_path public', 'alter function public.sim_escrituras_v0_puerta() set search_path = public'],
    ['EXECUTE a anon', 'grant execute on function public.sim_escrituras_v0_puerta() to anon'],
    ['un tercer disparador que llama a la puerta', 'create trigger otro_con_la_puerta before update on public.sim_drawing_templates for each row execute function public.sim_escrituras_v0_puerta()'],
    ['sin el disparador de sim_trades', 'drop trigger sim_escrituras_v0_puerta on public.sim_trades'],
    ['con el de sim_sessions desactivado', 'alter table public.sim_sessions disable trigger sim_escrituras_v0_puerta'],
    // RG-06 y RG-02 (revisor interno): las ramas de «exacto» y del veredicto que no se ensayaban
    ['con un argumento', `${T} before insert or update or delete on public.sim_sessions for each row execute function public.sim_escrituras_v0_puerta('x')`],
    ['ENABLE ALWAYS', 'alter table public.sim_sessions enable always trigger sim_escrituras_v0_puerta'],
    ['ENABLE REPLICA', 'alter table public.sim_sessions enable replica trigger sim_escrituras_v0_puerta'],
    ['dos en sim_sessions y ninguno en sim_trades', 'drop trigger sim_escrituras_v0_puerta on public.sim_trades; create trigger z_otra_puerta before insert or update or delete on public.sim_sessions for each row execute function public.sim_escrituras_v0_puerta()'],
    ['en sim_trades, otro nombre en lugar del suyo', 'drop trigger sim_escrituras_v0_puerta on public.sim_trades; create trigger z_otra_puerta before insert or update or delete on public.sim_trades for each row execute function public.sim_escrituras_v0_puerta()'],
    ['un disparador en una tabla de OTRO esquema que llama a la puerta', 'create temporary table h_otro (x integer); create trigger h_otro_puerta before insert on h_otro for each row execute function public.sim_escrituras_v0_puerta()'],
    // GR1-01 (Astra): SUSTITUIR el de public por uno exacto en una tabla temporal con el mismo nombre
    ['GR1-01: sim_sessions sustituida por una temporal homonima', `drop trigger sim_escrituras_v0_puerta on public.sim_sessions; ${TEMP('sim_sessions')}`, true],
    ['GR1-01: sim_trades sustituida por una temporal homonima', `drop trigger sim_escrituras_v0_puerta on public.sim_trades; ${TEMP('sim_trades')}`],
    ['GR1-01: las dos sustituidas por temporales homonimas', `drop trigger sim_escrituras_v0_puerta on public.sim_sessions; drop trigger sim_escrituras_v0_puerta on public.sim_trades; ${TEMP('sim_sessions')}; ${TEMP('sim_trades')}`, true],
    ['con otro cuerpo', "create or replace function public.sim_escrituras_v0_puerta() returns trigger language plpgsql set search_path = '' as $f$ begin return new; end $f$"],
  ]
  const cuerpo = S16P.replace(/^begin read only;$/m, '').replace(/^rollback;$/m, '')
  const mal = [], pasan = []
  for (const [que, ddl, funcional] of desvios) {
    const r = m.comoEjecutor(d, `begin;\n${ddl};\nset transaction read only;\n${cuerpo}\nrollback;`)
    if (!(r.ok && veredicto(r) === 'A MEDIAS: PARAR (decide el CTO)')) mal.push(`${que}: ${r.err ? r.err.slice(0, 120) : veredicto(r)}`)
    if (funcional) { const w = escribe(ddl); if (w.ok && /99990/.test(w.out)) pasan.push(que) }
  }
  oraculo('S16p', `S16RO-01 y GR1-01: los ${desvios.length} desvios (los 7 de Astra, los 3 de antes, las 3 sustituciones por homonimas y los demas) dan A MEDIAS`, mal.length === 0, mal.join(' · '))
  ver('control funcional: con las 3 de Astra (otra funcion, solo INSERT, WHEN(false)) y las 2 sustituciones de sim_sessions el UPDATE sin cabecera PASA: por eso no pueden salir APLICADA', pasan.length === 5, pasan.join(', '))
  {
    // GR1-01: lo que se imprime es el esquema REAL (antes, «public.» delante de una temporal)
    const ddl = `drop trigger sim_escrituras_v0_puerta on public.sim_sessions; ${TEMP('sim_sessions')}`
    const r = m.comoEjecutor(d, `begin;\n${ddl};\nset transaction read only;\n${cuerpo}\nrollback;`), l = filas(r)
    const disp = l.filter(x => x.startsWith('disparador|'))
    oraculo('S16p', 'GR1-01: con sim_sessions sustituida, el disparador de la temporal sale como pg_temp_N.sim_sessions (no exacto) y el de public.sim_trades, exacto',
      r.ok && disp.some(x => /^disparador\|pg_temp_\d+\.sim_sessions\.sim_escrituras_v0_puerta\|.* · NO es el de sim-004a-puerta$/.test(x)) && disp.some(x => /^disparador\|public\.sim_trades\.sim_escrituras_v0_puerta\|.* · exacto$/.test(x)) && !disp.some(x => x.startsWith('disparador|public.sim_sessions.')), disp.join(' / ').slice(0, 400))
  }
  ver('control: tras todo, la puerta sigue APLICADA (cada desvio se deshizo) y el UPDATE sin cabecera se sigue rechazando', veredicto(corre(d)) === APL && !escribe().ok)
} finally { m.cierra() }
fin()
