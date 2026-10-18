/**
 * ETAPA 3 · E3R2-01 (Astra r2; CTO 16-oct): sim-004b y s16 acreditan TODOS los atributos de pg_proc que cambian la
 * ejecucion de sus funciones, y el md5 de pg_get_functiondef completo. Escrita ANTES que el codigo (contra f252152:
 * en rojo).
 *
 * Contra PostgreSQL 17 local (montaje-v1: sim-003 y la preparatoria, como en produccion). Un mutante por atributo:
 *   proisstrict (los tres de Astra: STRICT en sim_avanzar_fase con sim-004b aplicada, y en sim_borrar_sesion y
 *   sim_cierre_v0 antes de la primera aplicacion), proleakproof, proparallel, prokind, proretset, prorettype,
 *   proargtypes, proargmodes, proargnames, proargdefaults, pronargdefaults, provolatile, prosecdef, proconfig,
 *   procost, prorows, y uno que solo cambia pg_get_functiondef (SUPPORT, prosupport).
 * Los que ALTER FUNCTION no puede cambiar se ponen tocando el catalogo, como en los escenarios de Astra.
 * Cada mutante: en primera aplicacion (sobre una funcion que sim-004b conserva) o en reejecucion (sobre una de las
 * tres que sustituye, con sim-004b ya aplicada). En los dos sitios: s16 dice DIFIERE en esa funcion y el veredicto
 * DIFIEREN; sim-004b aborta nombrandola y no cambia nada.
 * Controles: el montaje limpio aplica y s16 da OK (antes y despues); una de las sustituidas en STRICT ANTES de la
 * primera aplicacion es inocua (el CREATE OR REPLACE la vuelve a fijar); y el control funcional de Astra: la ultima
 * fase con p_hija_id = NULL da SQL NULL con STRICT y 200 sin el.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { titulo, ver, oraculo, fin, importa, REPO } from './lib.mjs'
import { hayPostgres } from './pg-ensayo.mjs'
import { montajeV1, conUidDelMontaje, sinEnvoltura } from './montaje-v1.mjs'
const lee = p => readFileSync(path.join(REPO, p), 'utf8')
// R3E3B-02: la ficha de auth.uid() de produccion, por la del montaje (la unica adaptacion; montaje-v1.mjs)
const S4B = conUidDelMontaje(lee('sql/sim-004b-contrato-v1.sql')), S16 = conUidDelMontaje(sinEnvoltura(lee('sql/consultas/s16-catalogo-sim004b.sql')))
const CA = await importa('lib/motor/cartera.mjs'), RT = await importa('lib/motor/reto.mjs'), { COSTES_1 } = await importa('lib/motor/costes.mjs')
const u = k => `00000000-0000-4000-8000-${String(k).padStart(12, '0')}`
const err1 = r => (r.err.split('\n').find(l => /ERROR/.test(l)) || r.err.split('\n')[0] || '').replace(/^.*ERROR:\s+/, '')
if (!hayPostgres()) { ver('PostgreSQL 17 local: NO hay, la prueba no se ha ejecutado', false); fin() }
const m = montajeV1()
const FASE = 'sim_avanzar_fase(uuid,uuid,uuid,uuid,text,integer,bigint,jsonb,jsonb,jsonb,jsonb)'
const cat = (fn, set) => `update pg_catalog.pg_proc set ${set} where oid = 'public.${fn}'::regprocedure;`
// [nombre, funcion, mutante, cuando: 'antes' (sobre una conservada, antes de aplicar) | 'despues' (sim-004b aplicada)]
const FAMILIA = [
  ['proisstrict · STRICT en sim_avanzar_fase (Astra)', FASE, `alter function public.${FASE} strict;`, 'despues'],
  ['proisstrict · STRICT en sim_borrar_sesion (Astra)', 'sim_borrar_sesion(uuid,uuid)', 'alter function public.sim_borrar_sesion(uuid,uuid) strict;', 'antes'],
  ['proisstrict · STRICT en sim_cierre_v0 (Astra)', 'sim_cierre_v0(uuid,numeric,bigint,jsonb)', 'alter function public.sim_cierre_v0(uuid,numeric,bigint,jsonb) strict;', 'antes'],
  ['proisstrict · STRICT en sim_borrar_sesion con sim-004b aplicada', 'sim_borrar_sesion(uuid,uuid)', 'alter function public.sim_borrar_sesion(uuid,uuid) strict;', 'despues'],
  ['proleakproof · LEAKPROOF', 'sim_error(integer,text,jsonb)', 'alter function public.sim_error(integer,text,jsonb) leakproof;', 'antes'],
  ['proparallel · PARALLEL SAFE', 'sim_crear_sesion(uuid,uuid,uuid,text,integer,jsonb,jsonb,jsonb,jsonb)', 'alter function public.sim_crear_sesion(uuid,uuid,uuid,text,integer,jsonb,jsonb,jsonb,jsonb) parallel safe;', 'antes'],
  ['prokind · procedimiento (catalogo)', 'sim_bloquea_alumno(uuid)', cat('sim_bloquea_alumno(uuid)', "prokind = 'p'"), 'antes'],
  ['proretset · devuelve un conjunto (catalogo)', 'sim_error(integer,text,jsonb)', cat('sim_error(integer,text,jsonb)', 'proretset = true'), 'antes'],
  ['prorettype · devuelve json (catalogo)', 'sim_error(integer,text,jsonb)', cat('sim_error(integer,text,jsonb)', "prorettype = 'json'::regtype"), 'antes'],
  ['proargtypes · otro tipo de argumento (catalogo; la firma ya no existe)', 'sim_error(integer,text,jsonb)', cat('sim_error(integer,text,jsonb)', "proargtypes = '23 25 114'::oidvector"), 'antes'],
  ['proargmodes · modos explicitos (catalogo)', 'sim_error(integer,text,jsonb)', cat('sim_error(integer,text,jsonb)', "proargmodes = '{i,i,i}'"), 'antes'],
  ['proargnames · otros nombres (catalogo)', 'sim_error(integer,text,jsonb)', cat('sim_error(integer,text,jsonb)', "proargnames = '{a,b,c}'"), 'antes'],
  ['proargdefaults · otro valor por defecto (CREATE OR REPLACE, el mismo cuerpo)', 'sim_error(integer,text,jsonb)', `do $d$ begin execute pg_catalog.format('create or replace function public.sim_error(p_http integer, p_motivo text, p_extra jsonb default ''{"x": 1}''::jsonb) returns jsonb language sql immutable security definer set search_path = '''' as %L', (select prosrc from pg_catalog.pg_proc where oid = 'public.sim_error(integer,text,jsonb)'::regprocedure)); end $d$;`, 'antes'],
  ['pronargdefaults · un valor por defecto en una que no tenia (CREATE OR REPLACE, el mismo cuerpo)', 'sim_bloquea_alumno(uuid)', `do $d$ begin execute pg_catalog.format('create or replace function public.sim_bloquea_alumno(p_actor uuid default null) returns jsonb language plpgsql volatile security definer set search_path = '''' as %L', (select prosrc from pg_catalog.pg_proc where oid = 'public.sim_bloquea_alumno(uuid)'::regprocedure)); end $d$;`, 'antes'],
  ['provolatile · STABLE', 'sim_comando(uuid,uuid,uuid,text,text,integer,bigint,text,text,jsonb)', 'alter function public.sim_comando(uuid,uuid,uuid,text,text,integer,bigint,text,text,jsonb) stable;', 'despues'],
  ['prosecdef · SECURITY INVOKER', 'sim_tomar_escritor(uuid,uuid,uuid,text,integer,text,boolean)', 'alter function public.sim_tomar_escritor(uuid,uuid,uuid,text,integer,text,boolean) security invoker;', 'despues'],
  ['proconfig · SET work_mem', 'sim_borrar_legacy(uuid,uuid)', "alter function public.sim_borrar_legacy(uuid,uuid) set work_mem = '64kB';", 'antes'],
  ['procost · COST 7', 'sim_borrar_alumno(uuid)', 'alter function public.sim_borrar_alumno(uuid) cost 7;', 'antes'],
  ['prorows · ROWS 5 (una que devuelve un conjunto)', 'sim_escrituras_v0_parejas(uuid)', 'alter function public.sim_escrituras_v0_parejas(uuid) rows 5;', 'antes'],
  ['solo pg_get_functiondef · SUPPORT (prosupport, catalogo)', 'sim_error(integer,text,jsonb)', cat('sim_error(integer,text,jsonb)', "prosupport = 'pg_catalog.textlike_support'::regproc"), 'antes'],
]
try {
  m.arranca()
  const aplica = d => m.comoEjecutor(d, S4B)
  const s16 = d => m.comoEjecutor(d, `begin read only;\n${S16}\nrollback;`)
  const foto = d => m.uno(d, `select md5(string_agg(concat_ws('|', oid::regprocedure::text, proisstrict::text, proleakproof::text, proparallel::text, prokind::text, procost::text, prorows::text, coalesce(proconfig::text, ''), md5(prosrc)), ',' order by oid)) from pg_proc where pronamespace = 'public'::regnamespace`)
    + m.uno(d, `select count(*) from pg_constraint where conname in ('sim_sessions_terminal_valida', 'sim_eventos_tipo_check') and pg_get_constraintdef(oid) like '%superado%'`)
  let n = 0
  const nueva = (despues) => { const d = m.base(`at${++n}`); if (despues) { const r = aplica(d); if (!r.ok) throw new Error(`control: sim-004b no aplica en el montaje limpio: ${err1(r)}`) } return d }

  titulo('controles')
  for (const despues of [false, true]) {
    const d = nueva(despues)
    const q = s16(d)
    ver(`control: limpio ${despues ? 'con sim-004b aplicada' : 'antes de sim-004b'}: s16 da OK y sim-004b ${despues ? 'se reejecuta' : 'aplica'}`, q.ok && /^veredicto\|OK\|/m.test(q.out) && aplica(d).ok, (q.out.split('\n').find(l => l.startsWith('veredicto')) || q.err).slice(0, 200))
  }
  {
    const d = nueva(false)
    m.comoEjecutor(d, `alter function public.${FASE} strict;`)
    const r = aplica(d)
    ver('control: STRICT en una de las sustituidas ANTES de la primera aplicacion es inocuo: sim-004b aplica y la deja sin STRICT (CREATE OR REPLACE)', r.ok && m.uno(d, `select proisstrict from pg_proc where oid = 'public.${FASE}'::regprocedure`) === 'f', err1(r))
  }
  {
    // el control funcional de Astra: la ultima fase con p_hija_id = NULL
    const d = nueva(true)
    m.alumno(d, u(1))
    const e = RT.creaReto({ motor: CA.crea({ pares: ['EURUSD'], costes: COSTES_1, capital: '100000' }), inicio: 1736121600, reglas: RT.SUITE_1F })
    e.estado = 'superada'
    const c = await m.rpc(d)('sim_crear_sesion', { p_actor: u(1), p_session_id: u(2), p_command_id: u(3), p_sobre: JSON.stringify({ tipo: 'crear' }), p_epoca: 1, p_sesion: { name: 'inventada', pair: 'EUR/USD', timeframe: 'H1', date_from: '2025-01-06', date_to: '2025-12-31', capital: '100000', challenge_type: '1F' }, p_estado: JSON.parse(CA.serializa(e)), p_mercado: { EURUSD: 'EURUSD@v1.1:' + 'a'.repeat(64) }, p_resumen: {} })
    const args = `'${u(1)}'::uuid, '${u(2)}'::uuid, null::uuid, '${u(4)}'::uuid, '{"tipo":"avanzar_fase"}'::text, 1, 0::bigint, null::jsonb, null::jsonb, null::jsonb, '{}'::jsonb`
    m.comoEjecutor(d, `alter function public.${FASE} strict;`)
    const conStrict = m.uno(d, `select coalesce(public.sim_avanzar_fase(${args})::text, 'SQL_NULL')`)
    const r4b = aplica(d), q = s16(d)
    m.comoEjecutor(d, `alter function public.${FASE} called on null input;`)
    const sin = JSON.parse(m.uno(d, `select public.sim_avanzar_fase(${args})::text`))
    oraculo('ATR', 'Astra: con STRICT en sim_avanzar_fase, la ultima fase (p_hija_id NULL) da SQL NULL; sim-004b lo para y s16 dice DIFIERE; sin STRICT, la misma peticion da 200 completado', c.data?.http === 201 && conStrict === 'SQL_NULL' && !r4b.ok && /no es la prevista/.test(err1(r4b)) && /^funcion_sustituida\|sim_avanzar_fase.*DIFIERE/m.test(q.out) && sin.http === 200 && sin.recibo?.resumen?.completado === true, JSON.stringify({ alta: c.data?.http, conStrict: conStrict.slice(0, 40), sim004b: err1(r4b).slice(0, 120), sin: sin.http }))
  }

  titulo('un mutante por atributo: s16 DIFIERE y sim-004b aborta, en primera aplicacion y en reejecucion')
  ver(`control: la familia cubre los ${new Set(FAMILIA.map(x => x[0].split(' · ')[0])).size} atributos pedidos y el de solo pg_get_functiondef`, new Set(FAMILIA.map(x => x[0].split(' · ')[0])).size === 17)
  for (const [nombre, fn, mutante, cuando] of FAMILIA) {
    const d = nueva(cuando === 'despues')
    // como superusuario: LEAKPROOF y los cambios de catalogo lo exigen (los de Astra, igual)
    const mu = m.pg.psql(mutante, d)
    if (!mu.ok) { oraculo('ATR', `${nombre}: el mutante se aplica`, false, err1(mu)); continue }
    const nom = fn.split('(')[0]
    const q = s16(d)
    const fila = q.out.split('\n').find(l => new RegExp(`^funcion(_sustituida)?\\|${nom}\\(`).test(l)) || ''
    const a = foto(d)
    const r = aplica(d)
    oraculo('ATR', `${nombre} (${cuando === 'despues' ? 'reejecucion' : 'primera aplicacion'}): s16 DIFIERE en ${nom} y veredicto DIFIEREN; sim-004b aborta nombrandola y nada cambia`, q.ok && /DIFIERE/.test(fila) && /^veredicto\|DIFIEREN/m.test(q.out) && !r.ok && /^sim-004b: /.test(err1(r)) && err1(r).includes(`public.${nom}(`) && foto(d) === a, `${fila.slice(0, 120)} · ${err1(r).slice(0, 160)}`)
  }

  titulo('R3E3-03 y R3E3-04 (revisor interno): EXECUTE con opcion de concesion, y homonimos')
  for (const [nombre, fn, mutante, cuando, fila] of [
    ['EXECUTE con opcion de concesion a service_role (una conservada)', 'sim_borrar_sesion(uuid,uuid)', 'grant execute on function public.sim_borrar_sesion(uuid,uuid) to service_role with grant option;', 'antes', 'funcion'],
    ['EXECUTE con opcion de concesion a service_role (una sustituida, con sim-004b aplicada)', FASE, `grant execute on function public.${FASE} to service_role with grant option;`, 'despues', 'funcion_sustituida'],
    ['un homonimo: sim_error(integer,text), otra firma', 'sim_error(integer,text)', "create function public.sim_error(integer, text) returns jsonb language sql security definer set search_path = '' as $x$ select '{}'::jsonb $x$;", 'antes', 'homonimos'],
    ['un homonimo de una sustituida: sim_comando con otra firma, con sim-004b aplicada', 'sim_comando(text)', "create function public.sim_comando(p_actor text) returns jsonb language sql as $x$ select '{}'::jsonb $x$;", 'despues', 'homonimos'],
  ]) {
    const d = nueva(cuando === 'despues')
    const mu = m.pg.psql(mutante, d)
    if (!mu.ok) { oraculo('ATR', `${nombre}: el mutante se aplica`, false, err1(mu)); continue }
    const nom = fn.split('(')[0]
    const q = s16(d)
    const linea = q.out.split('\n').find(l => fila === 'homonimos' ? l.startsWith('homonimos|') : new RegExp(`^${fila}\\|${nom}\\(`).test(l)) || ''
    const a = foto(d)
    const r = aplica(d)
    oraculo('ATR', `${nombre}: s16 DIFIERE (${fila}) y veredicto DIFIEREN; sim-004b aborta nombrandola y nada cambia`, q.ok && /DIFIERE/.test(linea) && (fila !== 'homonimos' || linea.includes(fn)) && /^veredicto\|DIFIEREN/m.test(q.out) && !r.ok && /^sim-004b: /.test(err1(r)) && err1(r).includes(fila === 'homonimos' ? fn : `public.${nom}(`) && foto(d) === a, `${linea.slice(0, 160)} · ${err1(r).slice(0, 160)}`)
  }
  {
    const q = s16(nueva(false))
    ver('control: sin homonimos, la fila «homonimos» dice ninguno · coincide', /^homonimos\|public\|ninguno · coincide$/m.test(q.out), (q.out.split('\n').find(l => l.startsWith('homonimos')) || q.err).slice(0, 160))
  }
} finally { m.cierra() }
fin()
