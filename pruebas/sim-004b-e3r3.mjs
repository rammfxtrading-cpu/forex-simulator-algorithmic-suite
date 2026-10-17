/**
 * ETAPA 3 · ronda 4 · E3R3-01..04 (Astra r3; CTO 17-oct, orden 1-009): lo que el certificado de catalogo no veia, por familias,
 * igual en la s16 y en sim-004b. Rojo previo contra 78bfd2e (rojos/…).
 *
 * Contra PostgreSQL 17 local (montaje-v1, con la puerta), cada mutante en primera aplicacion y en reejecucion: la s16 dice
 * DIFIEREN y sim-004b aborta sin cambiar nada.
 *   · E3R3-01 sobrecargas: digest(bytea,text,integer DEFAULT 0), gen_random_bytes(integer,integer DEFAULT 0) y auth.uid(integer
 *     DEFAULT 0) (las de pgcrypto que hay, digest(text,text) incluida, son las acreditadas: el positivo);
 *   · E3R3-02 permiso efectivo: EXECUTE de auth.uid() retirado a authenticated; el de digest retirado a quien es dueño de las RPC;
 *     RE3-02/03 (revisor interno de c4d46e3): el dueño de las RPC sin INSERT en sim_recibos o sin EXECUTE en sim_bloquea_alumno;
 *   · E3R3-03 disparadores internos: WHEN (false) en la cascada de sim_recibos, en su check_ins y en la cascada de profiles (el
 *     otro extremo de la FK); y uno diferible;
 *   · E3R3-04 indices: indisready y indislive en sim_recibos_ultimo_avance_key, e indisready en uno no unico (el inventario).
 * Y los controles funcionales de Astra, con las RPC reales: la sobrecarga deja crear/tomar en 42725; sin EXECUTE de uid el alumno
 * no lee su recibo; con la cascada anulada el borrado deja un recibo; con el check_ins anulado entra un recibo huerfano; con el
 * indice no listo o no vivo el primer checkpoint falla. Cada uno con su limpio.
 * Las de pg_trigger y pg_index escriben el catalogo como superusuario: segun el criterio del CTO (17-oct, orden 1-009), a partir
 * de la ronda 4 un caso asi se documenta como limite y no bloquea; estos cuatro se arreglan igualmente.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { titulo, ver, oraculo, fin, importa, REPO } from './lib.mjs'
import { hayPostgres } from './pg-ensayo.mjs'
import { montajeV1, conUidDelMontaje } from './montaje-v1.mjs'
const lee = p => readFileSync(path.join(REPO, p), 'utf8')
const u = k => `00000000-0000-4000-8000-${String(k).padStart(12, '0')}`
const err1 = r => (r.err.split('\n').find(l => /ERROR/.test(l)) || r.err.split('\n')[0] || '').replace(/^.*ERROR:\s+/, '')
const CA = await importa('lib/motor/cartera.mjs'), RT = await importa('lib/motor/reto.mjs'), { COSTES_1 } = await importa('lib/motor/costes.mjs')

if (!hayPostgres()) { ver('PostgreSQL 17 local: NO hay, la prueba no se ha ejecutado', false); fin() }
const S4B = conUidDelMontaje(lee('sql/sim-004b-contrato-v1.sql')), S16 = conUidDelMontaje(lee('sql/consultas/s16-catalogo-sim004b.sql'))
const m = montajeV1()
const estado = () => JSON.parse(CA.serializa(RT.creaReto({ motor: CA.crea({ pares: ['EURUSD'], costes: COSTES_1, capital: '100000' }), inicio: 1736121600, reglas: RT.SUITE_1F })))
const crea = d => m.rpc(d)('sim_crear_sesion', { p_actor: u(1), p_session_id: u(2), p_command_id: u(3), p_sobre: '{"tipo":"crear"}', p_epoca: 1, p_sesion: { name: 'inventada', pair: 'EUR/USD', timeframe: 'H1', date_from: '2025-01-06', date_to: '2025-12-31', capital: '100000', challenge_type: '1F' }, p_estado: estado(), p_mercado: { EURUSD: 'EURUSD@v1.1:' + 'a'.repeat(64) }, p_resumen: {} })
const toma = d => m.rpc(d)('sim_tomar_escritor', { p_actor: u(1), p_session_id: u(2), p_command_id: u(4), p_sobre: '{"tipo":"tomar_escritor"}', p_epoca: 1, p_cliente_id: 'inventado', p_forzar: false })
const checkpoint = (d, testigo, k) => m.rpc(d)('sim_comando', { p_actor: u(1), p_session_id: u(2), p_command_id: u(k), p_tipo: 'checkpoint', p_sobre: JSON.stringify({ tipo: 'checkpoint', k }), p_epoca: 1, p_version_esperada: 0, p_cliente_id: 'inventado', p_testigo: testigo, p_resultado: { resultado: 'aceptado', clase: 'ultimo_avance', estado: estado(), eventos: [], trades: [], proyeccion: {}, resumen: { marca: k } } })
const http = r => r?.data?.http ?? (r?.error?.code || JSON.stringify(r?.error ?? r).slice(0, 60))
const leeRecibos = d => m.pg.psql(`begin; set local role authenticated; select set_config('request.jwt.claim.sub', '${u(1)}', true); select count(*) from public.sim_recibos; rollback;`, d)
// el arbol de WHEN (false) se saca de un disparador temporal (como en la reproduccion de Astra) y se copia al interno
const cuando = (tabla, funcion, fk, tablaFk) => `do $x$ declare q pg_node_tree; begin
  create trigger x_temporal after insert on ${tabla} for each row when (false) execute function pg_catalog."RI_FKey_check_ins"();
  select tgqual into q from pg_trigger where tgname = 'x_temporal'; drop trigger x_temporal on ${tabla};
  update pg_trigger set tgqual = q where tgrelid = '${tabla}'::regclass and tgfoid = 'pg_catalog."${funcion}"()'::regprocedure
     and tgconstraint = (select oid from pg_constraint where conrelid = '${tablaFk}'::regclass and conname = '${fk}');
  if not found then raise exception 'mutante: no encuentro el disparador'; end if; end $x$;`
try {
  m.arranca()
  let n = 0
  const base = () => { const d = m.base(`e3${++n}`); const p = m.comoEjecutor(d, lee('sql/sim-004a-puerta.sql')); if (!p.ok) throw new Error('puerta: ' + p.err); return d }
  const aplica = d => m.comoEjecutor(d, S4B)
  const s16 = d => m.comoEjecutor(d, `begin read only;\n${S16}\nrollback;`)
  const veredicto = q => (q.out.split('\n').find(l => l.startsWith('veredicto|')) ?? '').split('|')[1] ?? ''
  const foto = d => m.uno(d, `select md5(string_agg(x, ',' order by x)) from (
      select 'c:' || conrelid::regclass::text || conname || pg_get_constraintdef(oid) x from pg_constraint where connamespace = 'public'::regnamespace
      union all select 'i:' || pg_get_indexdef(indexrelid) || indisready || indislive from pg_index where indrelid in (select oid from pg_class where relnamespace = 'public'::regnamespace)
      union all select 't:' || tgrelid::regclass::text || tgname || tgenabled::text || coalesce(tgqual::text, '') from pg_trigger
      union all select 'f:' || p.oid::regprocedure::text || md5(p.prosrc) || coalesce(p.proacl::text, '') from pg_proc p where p.pronamespace in ('public'::regnamespace, 'extensions'::regnamespace, 'auth'::regnamespace)) s`)
  const nueva = despues => { const d = base(); if (despues) { const r = aplica(d); if (!r.ok) throw new Error('control: sim-004b no aplica: ' + err1(r)) } m.alumno(d, u(1)); return d }

  titulo('el positivo (las sobrecargas de pgcrypto que hay son las acreditadas)')
  for (const despues of [false, true]) {
    const d = nueva(despues)
    const q = s16(d)
    ver(`control: limpio ${despues ? 'con sim-004b aplicada' : 'antes de sim-004b'}: s16 OK (con sobrecarga, permiso y los internos coinciden) y sim-004b ${despues ? 'se reejecuta' : 'aplica'}`,
      veredicto(q) === 'OK' && /^inventario\|sobrecarga\|n=4 /m.test(q.out) && /^inventario\|permiso\|n=39 /m.test(q.out) && m.uno(d, "select count(*) from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'extensions' and p.proname = 'digest'") === '2' && aplica(d).ok,
      q.out.split('\n').filter(l => /DIFIERE|DE MAS|FALTA/.test(l)).join(' / ').slice(0, 200))
  }

  titulo('cada mutante: s16 DIFIEREN y sim-004b aborta sin cambiar nada, en primera aplicacion y en reejecucion')
  const CASOS = [
    // [familia, nombre, mutante (como superusuario)]
    ['E3R3-01', 'sobrecarga extensions.digest(bytea,text,integer DEFAULT 0)', "create function extensions.digest(bytea, text, integer default 0) returns bytea language sql as $$ select pg_catalog.decode('00', 'hex') $$;"],
    ['E3R3-01', 'sobrecarga extensions.gen_random_bytes(integer,integer DEFAULT 0)', "create function extensions.gen_random_bytes(integer, integer default 0) returns bytea language sql as $$ select pg_catalog.decode('00', 'hex') $$;"],
    ['E3R3-01', 'sobrecarga auth.uid(integer DEFAULT 0)', "create function auth.uid(integer default 0) returns uuid language sql stable as $$ select null::uuid $$;"],
    ['E3R3-02', 'EXECUTE de auth.uid() retirado a PUBLIC, anon y authenticated', 'revoke execute on function auth.uid() from public, anon, authenticated;'],
    ['E3R3-02', 'EXECUTE de extensions.digest(bytea,text) retirado a PUBLIC (el dueño de las RPC del montaje no lo es de digest)', 'revoke execute on function extensions.digest(bytea, text) from public;'],
    // el revisor interno de c4d46e3 (RE3-02, -03): el dueño de las RPC se retira a si mismo lo que usan sus cuerpos (DDL ordinario)
    ['RE3-02', 'el dueño de las RPC se retira INSERT en sim_recibos', 'revoke insert on public.sim_recibos from pgx;'],
    ['RE3-03', 'el dueño de las RPC se retira EXECUTE en sim_bloquea_alumno(uuid)', 'revoke execute on function public.sim_bloquea_alumno(uuid) from pgx;'],
    ['E3R3-03', 'WHEN (false) en la cascada de sim_recibos (RI_FKey_cascade_del en sim_sessions)', cuando('public.sim_sessions', 'RI_FKey_cascade_del', 'sim_recibos_session_id_fkey', 'public.sim_recibos')],
    ['E3R3-03', 'WHEN (false) en el check_ins de sim_recibos', cuando('public.sim_recibos', 'RI_FKey_check_ins', 'sim_recibos_session_id_fkey', 'public.sim_recibos')],
    ['E3R3-03', 'WHEN (false) en la cascada de profiles hacia sim_sessions (el otro extremo de la FK)', cuando('public.profiles', 'RI_FKey_cascade_del', 'sim_sessions_user_id_perfil_fkey', 'public.sim_sessions')],
    ['E3R3-03', 'el check_ins de sim_trades → sim_sessions, diferible e inicialmente diferido', "update pg_trigger set tgdeferrable = true, tginitdeferred = true where tgrelid = 'public.sim_trades'::regclass and tgfoid = 'pg_catalog.\"RI_FKey_check_ins\"()'::regprocedure and tgconstraint = (select oid from pg_constraint where conrelid = 'public.sim_trades'::regclass and conname = 'sim_trades_session_id_fkey');"],
    ['E3R3-04', 'indisready = false en sim_recibos_ultimo_avance_key', "update pg_index set indisready = false where indexrelid = 'public.sim_recibos_ultimo_avance_key'::regclass;"],
    ['E3R3-04', 'indislive = false en sim_recibos_ultimo_avance_key', "update pg_index set indislive = false where indexrelid = 'public.sim_recibos_ultimo_avance_key'::regclass;"],
    ['E3R3-04', 'indisready = false en sim_recibos_session_creado_idx (no unico: el inventario)', "update pg_index set indisready = false where indexrelid = 'public.sim_recibos_session_creado_idx'::regclass;"],
  ]
  ver('control: la familia cubre E3R3-01 (3 sobrecargas), E3R3-02 (2 permisos), RE3-02/03 (el dueño de las RPC), E3R3-03 (3 WHEN y un diferible) y E3R3-04 (listo y vivo, unico y no unico)', CASOS.length === 14)
  for (const [fam, nombre, mutante] of CASOS) {
    for (const despues of [false, true]) {
      const d = nueva(despues)
      const mu = m.pg.psql(mutante, d)
      const cuando = despues ? 'reejecucion' : 'primera aplicacion'
      if (!mu.ok) { oraculo(fam, `${nombre} (${cuando}): el mutante se aplica`, false, err1(mu)); continue }
      const q = s16(d)
      const malas = q.out.split('\n').filter(l => /(DIFIERE|DE MAS|FALTA)$|DIFIERE \(/.test(l))
      const a = foto(d)
      const r = aplica(d)
      oraculo(fam, `${nombre} (${cuando}): s16 DIFIEREN; sim-004b aborta y nada cambia`,
        q.ok && /^DIFIEREN \d+$/.test(veredicto(q)) && !r.ok && err1(r).startsWith('sim-004b: ') && foto(d) === a,
        `${malas.map(l => l.split('|').slice(0, 2).join('|')).join(', ').slice(0, 120)} · ${r.ok ? 'sim-004b APLICA' : err1(r).slice(0, 140)}`)
    }
  }

  titulo('controles funcionales (los de Astra): con el mutante la RPC cambia de verdad; con el limpio, no')
  {
    const d0 = nueva(true), d1 = nueva(true)
    m.pg.psql(CASOS[0][2], d1)
    const c0 = await crea(d0), c1 = await crea(d1)
    ver('control: sobrecarga de digest → crear da 42725 (ambigua); limpio, 201', http(c0) === 201 && /42725/.test(JSON.stringify(c1)), `${http(c0)} / ${JSON.stringify(c1).slice(0, 100)}`)
  }
  {
    const d0 = nueva(true), d1 = nueva(true)
    m.pg.psql(CASOS[1][2], d1)
    const c0 = await crea(d0), c1 = await crea(d1), t0 = await toma(d0), t1 = await toma(d1)
    ver('control: sobrecarga de gen_random_bytes → crear 201 pero tomar da 42725; limpio, 200', http(c0) === 201 && http(c1) === 201 && http(t0) === 200 && /42725/.test(JSON.stringify(t1)), `${http(t0)} / ${JSON.stringify(t1).slice(0, 100)}`)
  }
  {
    const d0 = nueva(true), d1 = nueva(true)
    m.pg.psql(CASOS[3][2], d1)
    await crea(d0); await crea(d1)
    const l0 = leeRecibos(d0), l1 = leeRecibos(d1)
    ver('control: sin EXECUTE de auth.uid() el alumno no lee su recibo (permission denied); limpio, lo lee', l0.ok && l0.out.split('\n').includes('1') && !l1.ok && /permission denied for function uid/.test(l1.err), `${l0.out.slice(-20)} / ${err1(l1).slice(0, 80)}`)
  }
  {
    const d0 = nueva(true), d1 = nueva(true)
    m.pg.psql(CASOS[7][2], d1)
    const resto = async d => { await crea(d); const r = await m.rpc(d)('sim_borrar_alumno', { p_user_id: u(1) }); return [http(r), m.uno(d, 'select count(*) from public.sim_sessions'), m.uno(d, 'select count(*) from public.sim_recibos')].join(' ') }
    const r0 = await resto(d0), r1 = await resto(d1)
    ver('control: con la cascada anulada, borrar el alumno da 200 y deja un recibo; limpio, 0 recibos', r0 === '200 0 0' && r1 === '200 0 1', `${r0} / ${r1}`)
  }
  {
    const d0 = nueva(true), d1 = nueva(true)
    m.pg.psql(CASOS[8][2], d1)
    const huerfano = d => m.pg.psql(`insert into public.sim_recibos (session_id, user_id, command_id, tipo, digest, epoca, version_partida, resultado, clase) values ('${u(99)}', '${u(1)}', '${u(44)}', 'crear', repeat('a', 64), 1, 0, 'aceptado', 'economico');`, d)
    const h0 = huerfano(d0), h1 = huerfano(d1)
    ver('control: con el check_ins anulado entra un recibo de una sesion que no existe; limpio, la FK lo rechaza', !h0.ok && /foreign key/.test(h0.err) && h1.ok, `${err1(h0).slice(0, 80)} / ${h1.ok ? 'entra' : err1(h1).slice(0, 80)}`)
  }
  {
    const d0 = nueva(true), d1 = nueva(true)
    m.pg.psql(CASOS[5][2], d1)
    const c0 = await crea(d0), c1 = await crea(d1)
    ver('control: el dueño sin INSERT en sim_recibos → crear da 42501; limpio, 201', http(c0) === 201 && /42501/.test(JSON.stringify(c1)), `${http(c0)} / ${JSON.stringify(c1).slice(0, 100)}`)
  }
  for (const i of [11, 12]) {
    const d0 = nueva(true), d1 = nueva(true)
    m.pg.psql(CASOS[i][2], d1)
    const ciclo = async d => { const c = await crea(d), t = await toma(d), k = await checkpoint(d, t.data?.testigo, 5); return [http(c), http(t), http(k)] }
    const z0 = await ciclo(d0), z1 = await ciclo(d1)
    ver(`control: ${CASOS[i][1]} → alta 201 y tomar 200, pero el primer checkpoint falla; limpio, 200`, z0.join(' ') === '201 200 200' && z1[0] === 201 && z1[1] === 200 && z1[2] !== 200, `${z0.join(' ')} / ${z1.join(' ')}`)
  }
} finally { m.cierra() }
fin()
