/**
 * ETAPA 3 · R3E3B-01 y R3E3B-02 (revisor interno; CTO 17-oct): sim-004b y s16 acreditan el inventario EXACTO de las 14
 * tablas fuera de pg_proc y las tres funciones ajenas que llaman los cuerpos, con lo medido en produccion (s16b, 17-oct;
 * desde RINV3-01, CTO 17-oct, la s16e: los textos tal cual, con el search_path vacio y con el del editor).
 * Escrita ANTES que el codigo (contra 2d7a238: en rojo).
 *
 * Contra PostgreSQL 17 local (montaje-v1: sim-003 y la preparatoria, como en produccion; con la puerta).
 *   · procedencia: los valores esperados de los dos ficheros son los que da la s16b literal de produccion; el montaje
 *     reproduce las seis familias exactamente. auth.uid() es el unico que no puede reproducir (su cuerpo de Supabase
 *     no se conoce): la prueba cambia SOLO esa ficha por la del montaje, una vez en cada fichero (control);
 *   · el positivo, antes y despues de sim-004b;
 *   · un mutante por familia (tabla: herencia y particion; columna: tipo, NOT NULL, identity, generated, colacion y
 *     valor por defecto; restriccion: de mas, quitada; indice: de mas, parcial cambiado; regla; politica de mas en una
 *     no protegida; funcion ajena: COST, cuerpo y dueño), cada uno en s16 (DIFIERE en su familia y veredicto DIFIEREN) y
 *     en sim-004b (aborta nombrandola y no cambia nada), en reejecucion y, algunos, en primera aplicacion;
 *   · los escenarios del revisor como controles funcionales: con el mutante la RPC cambia de verdad.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { titulo, ver, oraculo, fin, importa, REPO } from './lib.mjs'
import { hayPostgres } from './pg-ensayo.mjs'
import { montajeV1, conUidDelMontaje, FICHA_UID_MONTAJE, FICHA_UID_PRODUCCION, sinEnvoltura } from './montaje-v1.mjs'
const lee = p => readFileSync(path.join(REPO, p), 'utf8')
const S4B0 = lee('sql/sim-004b-contrato-v1.sql'), S160 = lee('sql/consultas/s16-catalogo-sim004b.sql')
const CA = await importa('lib/motor/cartera.mjs'), RT = await importa('lib/motor/reto.mjs'), { COSTES_1 } = await importa('lib/motor/costes.mjs')
const u = k => `00000000-0000-4000-8000-${String(k).padStart(12, '0')}`
const err1 = r => (r.err.split('\n').find(l => /ERROR/.test(l)) || r.err.split('\n')[0] || '').replace(/^.*ERROR:\s+/, '')
const L = s => `'${s.replace(/'/g, "''")}'`

titulo('procedencia: los valores esperados son los de la s16f de produccion')
// RINV3-01 (CTO 17-oct, orden 1-008): los textos van tal cual, y su md5 depende del search_path. La s16e (salida literal
// de produccion) mide el bloque con el del editor ({public,extensions}: la s16) y con el vacio ({}: sim-004b). Desde la
// ronda 4 (E3R3-01..04, orden 1-009), la s16f: el mismo bloque con las sobrecargas, el permiso y el estado de los indices,
// y los disparadores internos de las FK de las 14 tablas
const S16E_SALIDA = 'sql/consultas/salidas/s16f-inventario-y-disparadores-internos-2026-10-17.txt'
// RINV4-01: una salida provisional (del montaje, para ensayar antes de tener la de produccion) lleva la marca
// «PROVISIONAL»: con ella, esta prueba no puede dar verde
const S16E_TEXTO = lee(S16E_SALIDA)
ver('control: la salida de la s16f es la de produccion (sin la marca «PROVISIONAL» del montaje)', !/PROVISIONAL/.test(S16E_TEXTO))
const PROD = S16E_TEXTO.replace(/\r/g, '').split('\n').map(l => l.trim()).filter(l => l.startsWith('s16f | {')).map(l => l.split(' | '))
const familias = ['ajeno', 'columna', 'identidad', 'indice', 'permiso', 'politica', 'regla', 'restriccion', 'sobrecarga', 'tabla']
const ESQUEMAS = ['{}', '{public,extensions}']
const esperado = Object.fromEntries(ESQUEMAS.flatMap(e => familias.map(f => {
  const fila = PROD.find(r => r[1] === e && r[2] === 'inventario' && r[3] === f)
  const x = /^n=(\d+) md5=([0-9a-f]{32})$/.exec(fila?.[4] ?? '')
  return [`${e}|${f}`, x ? [Number(x[1]), x[2]] : null]
})))
const fichas = Object.fromEntries(PROD.filter(r => r[1] === '{public,extensions}' && r[2] === 'funcion_ajena').map(r => [r[3], r[4]]))
ver('control: la salida de la s16f trae las 10 familias con los dos search_path, sin ninguna «(sim-004b espera …)», y las mismas 3 fichas con los dos', Object.values(esperado).every(Boolean) && Object.keys(fichas).length === 3 && PROD.filter(r => r[1] === '{}' && r[2] === 'funcion_ajena').every(r => fichas[r[3]] === r[4]), PROD.length + ' filas')
for (const [nombre, texto] of [['sim-004b', S4B0], ['s16', S160]]) {
  oraculo('INV', `${nombre}: los recuentos y md5 de las diez familias, con los dos search_path, son los de la s16f de produccion`, Object.entries(esperado).every(([k, v]) => { const [e, f] = k.split('|'); return v && texto.includes(`(${L(e)}, ${L(f)}, ${v[0]}, ${L(v[1])})`) }), Object.entries(esperado).map(([k, v]) => `${k} ${v?.join(' ')}`).join(' / ').slice(0, 600))
  oraculo('INV', `${nombre}: las fichas de las tres funciones ajenas son, literales, las de la s16f de produccion`, Object.entries(fichas).length === 3 && Object.entries(fichas).every(([f, d]) => texto.includes(`(${L(f)}, ${L(d)})`)), Object.keys(fichas).join(', '))
}
// E3R3-03: los disparadores internos de produccion (s16f) son, uno a uno, los que espera sim-004b (4.5)
const trgProd = S16E_TEXTO.replace(/\r/g, '').split('\n').map(l => l.trim()).filter(l => l.startsWith('s16f | disparador | ')).map(l => l.slice('s16f | disparador | '.length)).sort()
const trg4b = [...S4B0.matchAll(/^    '([^']*\|fk:[^']*)',?\)?;?$/gm)].map(x => x[1]).sort()
oraculo('INV', 'sim-004b: los 68 disparadores internos que espera son, uno a uno, los de la s16f de produccion', trg4b.length === 68 && trgProd.length === 68 && trg4b.every((x, i) => x === trgProd[i]), `${trg4b.length} esperados · ${trgProd.length} de produccion`)
const blk = t => { const a = t.indexOf('-- >>> inventario'), b = t.indexOf('-- <<< inventario'); return a >= 0 && b > a ? t.slice(a, b) : null }
oraculo('INV', 'el bloque «inventario» es el mismo texto, byte a byte, en sim-004b y en s16', blk(S4B0) !== null && blk(S4B0) === blk(S160))

if (!hayPostgres()) { ver('PostgreSQL 17 local: NO hay, la prueba no se ha ejecutado', false); fin() }
const m = montajeV1()
const estado = () => JSON.parse(CA.serializa(RT.creaReto({ motor: CA.crea({ pares: ['EURUSD'], costes: COSTES_1, capital: '100000' }), inicio: 1736121600, reglas: RT.SUITE_1F })))
const crea = (d, s, c) => m.rpc(d)('sim_crear_sesion', { p_actor: u(1), p_session_id: s, p_command_id: c, p_sobre: JSON.stringify({ tipo: 'crear' }), p_epoca: 1, p_sesion: { name: 'inventada', pair: 'EUR/USD', timeframe: 'H1', date_from: '2025-01-06', date_to: '2025-12-31', capital: '100000', challenge_type: '1F' }, p_estado: estado(), p_mercado: { EURUSD: 'EURUSD@v1.1:' + 'a'.repeat(64) }, p_resumen: {} })
try {
  m.arranca()
  let n = 0
  const base = () => { const d = m.base(`iv${++n}`); const p = m.comoEjecutor(d, lee('sql/sim-004a-puerta.sql')); if (!p.ok) throw new Error('puerta: ' + p.err); return d }
  // la ficha de auth.uid() del montaje (su cuerpo de Supabase no se conoce): la unica sustitucion de la prueba
  const d0 = base()
  const q0 = m.comoEjecutor(d0, `begin read only;\n${sinEnvoltura(S160)}\nrollback;`)
  const fila0 = q0.out.split('\n').find(l => l.startsWith('funcion_ajena|auth.uid()|')) || ''
  const uidMontaje = fila0.replace(/^funcion_ajena\|auth\.uid\(\)\|/, '').replace(/ \(sim-004b espera .*$/, '')
  const prodUid = `(${L('auth.uid()')}, ${L(fichas['auth.uid()'])})`, montUid = `(${L('auth.uid()')}, ${L(uidMontaje)})`
  const S4B = conUidDelMontaje(S4B0), S16 = conUidDelMontaje(sinEnvoltura(S160))
  ver('control: la ficha de auth.uid() del montaje, medida ahora, es la fija de montaje-v1.mjs (FICHA_UID_MONTAJE), y la de produccion es la literal de la s16b', uidMontaje === FICHA_UID_MONTAJE && FICHA_UID_PRODUCCION === fichas['auth.uid()'], uidMontaje.slice(0, 80))
  ver('control: la unica sustitucion (la ficha de auth.uid() por la del montaje) toca una sola linea en cada fichero', S4B0.split(prodUid).length === 2 && S160.split(prodUid).length === 2 && S4B !== S4B0 && S4B.length - S4B0.length === montUid.length - prodUid.length && /functiondef md5=[0-9a-f]{32} · prosrc md5=/.test(uidMontaje), uidMontaje.slice(0, 80))
  const aplica = d => m.comoEjecutor(d, S4B)
  const s16 = d => m.comoEjecutor(d, `begin read only;\n${S16}\nrollback;`)
  const foto = d => m.uno(d, `select md5(string_agg(x, ',' order by x)) from (select c.relname || ':' || coalesce((select string_agg(conname || pg_get_constraintdef(oid), ',' order by conname) from pg_constraint where conrelid = c.oid), '') x from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r') s`)
  const nueva = despues => { const d = base(); if (despues) { const r = aplica(d); if (!r.ok) throw new Error('control: sim-004b no aplica: ' + err1(r)) } m.alumno(d, u(1)); return d }

  titulo('el positivo')
  for (const despues of [false, true]) {
    const d = nueva(despues)
    const q = s16(d)
    const inv = q.out.split('\n').filter(l => /^(inventario|funcion_ajena)\|/.test(l))
    ver(`control: limpio ${despues ? 'con sim-004b aplicada' : 'antes de sim-004b'}: las 10 familias y las 3 funciones ajenas coinciden, s16 OK y sim-004b ${despues ? 'se reejecuta' : 'aplica'}`, q.ok && inv.length === 13 && inv.every(l => l.endsWith(' · coincide')) && /^veredicto\|OK\|/m.test(q.out) && aplica(d).ok, inv.filter(l => !l.endsWith('coincide')).join(' / ').slice(0, 300))
  }

  titulo('un mutante por familia: s16 DIFIERE en su familia y sim-004b aborta')
  const FAMILIA = [
    // [nombre, familia (objeto de la fila de s16), mutante, como superusuario, cuando]
    ['tabla · herencia: una tabla hija de sim_recibos', 'tabla', 'create table public.x_hija () inherits (public.sim_recibos);', false, 'despues'],
    ['tabla · particion: sim_alumnos colgada de una tabla particionada', 'tabla', 'create table public.x_part (like public.sim_alumnos) partition by list (user_id); alter table public.x_part attach partition public.sim_alumnos default;', false, 'despues'],
    ['columna · tipo: sim_trades.notes a varchar', 'columna', 'alter table public.sim_trades alter column notes type varchar(500);', false, 'despues'],
    ['columna · NOT NULL quitado: sim_sessions.name', 'columna', 'alter table public.sim_sessions alter column name drop not null;', false, 'despues'],
    ['columna · identity: sim_eventos.id GENERATED ALWAYS', 'columna', 'alter table public.sim_eventos alter column id set generated always;', false, 'despues'],
    ['columna · generated: una columna generada nueva en sim_recibos', 'columna', "alter table public.sim_recibos add column x_gen text generated always as (tipo || 'x') stored;", false, 'despues'],
    ['columna · colacion: sim_trades.notes con colacion C', 'columna', 'alter table public.sim_trades alter column notes type text collate "C";', false, 'despues'],
    ['columna · valor por defecto: sim_sessions.terminal = revocada (el del revisor)', 'columna', "alter table public.sim_sessions alter column terminal set default 'revocada';", false, 'despues'],
    ['columna · valor por defecto, en primera aplicacion', 'columna', "alter table public.sim_sessions alter column terminal set default 'revocada';", false, 'antes'],
    ['restriccion · de mas: CHECK NOT VALID en sim_recibos (la del revisor)', 'restriccion', "alter table public.sim_recibos add constraint x_check check (tipo <> 'crear') not valid;", false, 'despues'],
    ['restriccion · quitada: sim_trades_side_check', 'restriccion', 'alter table public.sim_trades drop constraint sim_trades_side_check;', false, 'despues'],
    ['indice · unico de mas: sim_recibos(session_id) (el del revisor)', 'indice', 'create unique index x_unico on public.sim_recibos (session_id);', false, 'despues'],
    // este lo para antes la comprobacion de los indices unicos de sim-003 (seccion 3), que lo nombra: vale igual
    ['indice · parcial cambiado: sim_recibos_ultimo_avance_key con otro WHERE', 'indice', "drop index public.sim_recibos_ultimo_avance_key; create unique index sim_recibos_ultimo_avance_key on public.sim_recibos (session_id) where (clase = 'economico');", false, 'despues', 'sim_recibos_ultimo_avance_key'],
    ['regla · do instead nothing en sim_recibos (la del revisor)', 'regla', 'create rule x_nada as on insert to public.sim_recibos do instead nothing;', false, 'despues'],
    ['regla · en primera aplicacion', 'regla', 'create rule x_nada as on update to public.sim_alumnos do instead nothing;', false, 'antes'],
    ['politica · de mas en sim_drawing_templates (no protegida)', 'politica', 'create policy x_todos on public.sim_drawing_templates for select to anon using (true);', false, 'despues'],
    ['funcion_ajena · extensions.gen_random_bytes con otro cuerpo (el del revisor)', 'extensions.gen_random_bytes(integer)', "create or replace function extensions.gen_random_bytes(integer) returns bytea language sql as $x$ select pg_catalog.decode(pg_catalog.repeat('00', $1), 'hex') $x$;", true, 'despues'],
    ['funcion_ajena · extensions.digest con otro COST', 'extensions.digest(bytea,text)', 'alter function extensions.digest(bytea, text) cost 7;', true, 'despues'],
    ['funcion_ajena · auth.uid() con otro dueño', 'auth.uid()', 'alter function auth.uid() owner to service_role;', true, 'despues'],
    // el revisor interno de 679d363 (RINV-01..05)
    ['tabla · RINV-01: sim_sessions con otro dueño (authenticated), quitandole lo que la 4.3 veria (el caso del revisor)', 'tabla', 'alter table public.sim_sessions owner to authenticated; revoke truncate, references, trigger on public.sim_sessions from authenticated;', true, 'despues', 'pertenencias del alumno'],
    // (desde E3R5-01, sim-004b lo para antes, en su seccion 0: authenticated ES dueño de una de las 14, un rol privilegiado)
    ['tabla · RINV-04: la RLS apagada en user_chart_config (no protegida)', 'tabla', 'alter table public.user_chart_config disable row level security;', false, 'despues'],
    ['columna · RINV-02: un dominio public.text en sim_sessions.name', 'columna', "create domain public.text as pg_catalog.text check (value <> 'inventada'); alter table public.sim_sessions alter column name type public.text;", false, 'despues'],
    ['identidad · RINV-03: sim_recibos.id con MAXVALUE 2', 'identidad', 'alter table public.sim_recibos alter column id set maxvalue 2;', false, 'despues'],
    ['identidad · RINV-03: sim_escrituras_v0.id con INCREMENT BY -1', 'identidad', 'alter table public.sim_escrituras_v0 alter column id set increment by -1 set minvalue -1000000;', false, 'despues'],
    ['restriccion · RINV-05: sim_trades_side_check cambiada (el mismo nombre y el mismo recuento)', 'restriccion', 'alter table public.sim_trades drop constraint sim_trades_side_check, add constraint sim_trades_side_check check (true);', false, 'despues'],
    ['politica · RINV-05: la de user_chart_config con otro USING (el mismo recuento)', 'politica', 'alter policy "user owns config" on public.user_chart_config using (true);', false, 'despues'],
    // el revisor interno de 15331a9 (RINV2-01, -02, -04): por familias
    ['ajeno · RINV2-01: un public.now() falso en el valor por defecto de sim_recibos.creado', 'ajeno', 'create function public.now() returns timestamptz language sql stable as $$ select null::timestamptz $$; alter table public.sim_recibos alter column creado set default public.now();', false, 'despues'],
    ['ajeno · RINV2-01: un public.gen_random_uuid() falso en el valor por defecto de sim_trades.id', 'ajeno', "create function public.gen_random_uuid() returns uuid language sql volatile as $$ select '00000000-0000-0000-0000-000000000000'::uuid $$; alter table public.sim_trades alter column id set default public.gen_random_uuid();", false, 'despues'],
    ['ajeno · RINV2-04: public.length() en el CHECK de sim_arrendamientos (el texto, igual)', 'ajeno', "create function public.length(text) returns integer language sql immutable as $$ select case when $1 = 'p' then 0 else pg_catalog.length($1) end $$; alter table public.sim_arrendamientos drop constraint sim_arrendamientos_cliente_id_check, add constraint sim_arrendamientos_cliente_id_check check (public.length(cliente_id) >= 1 and public.length(cliente_id) <= 100);", false, 'despues', 'sim_arrendamientos_cliente_id_check'],
    ['ajeno · un indice de expresion con una funcion de public', 'ajeno', "create function public.f_x(text) returns text language sql immutable as $$ select $1 $$; create index x_expr on public.sim_recibos (public.f_x(tipo));", false, 'despues'],
    ['columna · RINV2-02: una colacion public."por defecto" no determinista en sim_recibos.digest', 'columna', `create collation public."por defecto" (provider = icu, locale = 'und-u-ks-level2', deterministic = false); alter table public.sim_recibos drop constraint sim_recibos_digest_check; alter table public.sim_recibos alter column digest type text collate public."por defecto";`, false, 'despues', 'sim_recibos_digest_check'],
    ['columna · RINV2-02: una colacion public."por defecto" determinista (libc C) en sim_sessions.name', 'columna', `create collation public."por defecto" (provider = libc, locale = 'C'); alter table public.sim_sessions alter column name type text collate public."por defecto";`, false, 'despues'],
  ]
  ver('control: la familia cubre tabla (herencia, particion, dueño, RLS), las 6 de columna, el dominio y las dos colaciones, identidad (maximo, incremento), restriccion (de mas, quitada, cambiada), indice (de mas, parcial), regla, politica (de mas, cambiada), ajeno (now, gen_random_uuid, length, indice de expresion) y las 3 funciones ajenas', FAMILIA.length === 32)
  for (const [nombre, fam, mutante, su, cuando, antes] of FAMILIA) {
    const d = nueva(cuando === 'despues')
    const mu = su ? m.pg.psql(mutante, d) : m.comoEjecutor(d, mutante)
    if (!mu.ok) { oraculo('INV', `${nombre}: el mutante se aplica`, false, err1(mu)); continue }
    const q = s16(d)
    const fila = q.out.split('\n').find(l => new RegExp(`^(inventario|funcion_ajena)\\|${fam.replace(/[().]/g, '\\$&')}\\|`).test(l)) || ''
    const a = foto(d)
    const r = aplica(d)
    oraculo('INV', `${nombre} (${cuando === 'despues' ? 'reejecucion' : 'primera aplicacion'}${su ? ', superusuario' : ', el ejecutor'}): s16 DIFIERE en «${fam}» y veredicto DIFIEREN; sim-004b aborta nombrandola y nada cambia`,
      q.ok && fila.endsWith(' · DIFIERE') && /^veredicto\|DIFIEREN/m.test(q.out) && !r.ok && ((err1(r).startsWith('sim-004b: el catalogo de las 14 tablas o las funciones ajenas no son las medidas') && err1(r).includes(fam)) || (!!antes && err1(r).startsWith('sim-004b: ') && err1(r).includes(antes))) && foto(d) === a,
      `${fila.slice(0, 160)} · ${err1(r).slice(0, 160)}`)
  }

  titulo('controles funcionales (los escenarios del revisor): con el mutante, la RPC cambia de verdad')
  {
    const d = nueva(true); m.comoEjecutor(d, 'create rule x_nada as on insert to public.sim_recibos do instead nothing;')
    const c = await crea(d, u(2), u(3))
    ver('control: con la regla do instead nothing en sim_recibos, crear ya no crea (sin sesion ni recibo)', c.data?.http !== 201 && m.uno(d, 'select count(*) from public.sim_sessions') === '0', JSON.stringify(c.data ?? c.error).slice(0, 120))
  }
  {
    const d = nueva(true); m.comoEjecutor(d, "alter table public.sim_sessions alter column terminal set default 'revocada';")
    const c = await crea(d, u(2), u(3))
    ver('control: con el valor por defecto en terminal, la sesion nace revocada', c.data?.http === 201 && m.uno(d, `select terminal from public.sim_sessions where id = '${u(2)}'`) === 'revocada', String(c.data?.http))
  }
  {
    const d = nueva(true)
    const c = await crea(d, u(2), u(3))
    m.comoEjecutor(d, 'create table public.x_hija () inherits (public.sim_recibos);')
    const cols = m.uno(d, "select string_agg(quote_ident(attname), ',' order by attnum) from pg_attribute where attrelid = 'public.sim_recibos'::regclass and attnum > 0 and not attisdropped")
    const sel = cols.split(',').map(c => (c === 'id' ? 'id + 100000' : c === 'command_id' ? `'${u(9)}'::uuid` : c)).join(',')
    m.comoEjecutor(d, `insert into public.x_hija (${cols}) select ${sel} from only public.sim_recibos where session_id = '${u(2)}';`)
    const c2 = await crea(d, u(2), u(9))
    ver('control: con una tabla hija de sim_recibos y un recibo falso, crear con otro command_id da una repeticion (no 409 clave_reutilizada)', c.data?.http === 201 && c2.data?.repetido === true, JSON.stringify(c2.data).slice(0, 120))
  }
  {
    const d = nueva(true); m.comoEjecutor(d, "alter table public.sim_recibos add constraint x_check check (tipo <> 'crear') not valid;")
    const c = await crea(d, u(2), u(3))
    ver('control: con el CHECK de mas, crear falla', c.data?.http !== 201, JSON.stringify(c.data ?? c.error).slice(0, 120))
  }
  {
    const d = nueva(true); m.comoEjecutor(d, 'create unique index x_unico on public.sim_recibos (session_id);')
    const c = await crea(d, u(2), u(3))
    const t = await m.rpc(d)('sim_tomar_escritor', { p_actor: u(1), p_session_id: u(2), p_command_id: u(4), p_sobre: JSON.stringify({ tipo: 'tomar_escritor' }), p_epoca: 1, p_cliente_id: 'p', p_forzar: true })
    ver('control: con el indice unico de mas, crear da 201 pero tomar falla', c.data?.http === 201 && t.data?.http !== 200, JSON.stringify(t.data ?? t.error).slice(0, 120))
  }
  {
    // RINV-01: con otro dueño, la RLS (no forzada) no se aplica a ese dueño: un alumno lee las sesiones de otro
    const d = nueva(true)
    await crea(d, u(2), u(3))
    m.alumno(d, u(7))
    const ve = () => m.uno(d, `begin; set local role authenticated; select set_config('request.jwt.claim.sub', '${u(7)}', true); select count(*) from public.sim_sessions where user_id = '${u(1)}'; commit;`).split('\n').filter(x => /^\d+$/.test(x)).at(-1)
    const antes = ve()
    m.pg.psql('alter table public.sim_sessions owner to authenticated;', d)
    ver('control: con authenticated como dueño de sim_sessions, el alumno 7 pasa de ver 0 sesiones ajenas a verlas', antes === '0' && ve() !== '0', `${antes} → ${ve()}`)
  }
  {
    // RINV-04: sin RLS en una no protegida, sus politicas no se aplican
    const d = nueva(true)
    m.alumno(d, u(7))
    m.pg.psql(`insert into public.user_chart_config (user_id, config) values ('${u(1)}', '{}');`, d)
    const ve = () => m.uno(d, `begin; set local role authenticated; select set_config('request.jwt.claim.sub', '${u(7)}', true); select count(*) from public.user_chart_config where user_id = '${u(1)}'; commit;`).split('\n').filter(x => /^\d+$/.test(x)).at(-1)
    const antes = ve()
    m.comoEjecutor(d, 'alter table public.user_chart_config disable row level security;')
    ver('control: con la RLS apagada en user_chart_config, el alumno 7 pasa de ver 0 configuraciones ajenas a verlas', antes === '0' && ve() !== '0', `${antes} → ${ve()}`)
  }
  {
    // RINV2-01: con el public.now() falso, crear falla (el INSERT de sim_recibos no da creado)
    const d = nueva(true)
    m.comoEjecutor(d, 'create function public.now() returns timestamptz language sql stable as $$ select null::timestamptz $$; alter table public.sim_recibos alter column creado set default public.now();')
    const c = await crea(d, u(2), u(3))
    ver('control: con el public.now() falso en el valor por defecto, crear ya no crea', c.data?.http !== 201, JSON.stringify(c.data ?? c.error).slice(0, 120))
  }
  {
    // RINV2-04: con public.length() en el CHECK, tomar falla con un cliente_id «p»
    const d = nueva(true)
    const c = await crea(d, u(2), u(3))
    m.comoEjecutor(d, "create function public.length(text) returns integer language sql immutable as $$ select case when $1 = 'p' then 0 else pg_catalog.length($1) end $$; alter table public.sim_arrendamientos drop constraint sim_arrendamientos_cliente_id_check, add constraint sim_arrendamientos_cliente_id_check check (public.length(cliente_id) >= 1 and public.length(cliente_id) <= 100);")
    const t = await m.rpc(d)('sim_tomar_escritor', { p_actor: u(1), p_session_id: u(2), p_command_id: u(4), p_sobre: JSON.stringify({ tipo: 'tomar_escritor' }), p_epoca: 1, p_cliente_id: 'p', p_forzar: true })
    ver('control: con public.length() en el CHECK, crear da 201 pero tomar con cliente «p» falla', c.data?.http === 201 && t.data?.http !== 200, JSON.stringify(t.data ?? t.error).slice(0, 120))
  }
} finally { m.cierra() }
fin()
