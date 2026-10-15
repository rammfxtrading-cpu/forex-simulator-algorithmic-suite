/**
 * s16 · el catalogo que acredita sim-004b, medido ANTES de aplicarla (sql/consultas/s16-catalogo-sim004b.sql;
 * CTO 15-oct, diseño q.16.6). ENSAYO LOCAL; en produccion NO se ha corrido (la corre Ramon despues de la
 * puerta y antes de sim-004b).
 *   · una sola SELECT, dentro de una transaccion READ ONLY y como el ejecutor NO superusuario del montaje;
 *     acaba en «FIN | s16 | consulta»; la salida es la misma con search_path vacio y con el de defecto;
 *   · sobre el montaje de hoy (y con la puerta): veredicto OK, y sim-004b aplica;
 *   · lo que da por bueno es lo que exige sim-004b: los sha256 de las funciones que conserva son los de
 *     sim-004b, y cada desvio de los que sim-004b acredita (RLS, force, politicas, funciones, disparadores)
 *     da veredicto «DIFIEREN» en la s16 Y aborta sim-004b.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { titulo, ver, oraculo, fin, REPO } from './lib.mjs'
import { hayPostgres } from './pg-ensayo.mjs'
import { montajeV1 } from './montaje-v1.mjs'
const lee = p => { try { return readFileSync(path.join(REPO, p), 'utf8') } catch { return null } }
const S16 = lee('sql/consultas/s16-catalogo-sim004b.sql'), S4B = lee('sql/sim-004b-contrato-v1.sql'), PUERTA = lee('sql/sim-004a-puerta.sql')
titulo('1 · la consulta y sim-004b dan por buenas las mismas funciones')
const shas = t => new Set([...(t ?? '').matchAll(/'([0-9a-f]{64})'/g)].map(x => x[1]).concat([...(t ?? '').matchAll(/\|([0-9a-f]{64})\|/g)].map(x => x[1])))
const s16 = shas(S16), s4b = shas(S4B)
// sim-004b: 20 funciones + la puerta; la s16 no mide las tres que sim-004b sustituye
const sustituye = ['94f4db481cc09a2bc9b5d86512931186d8ec5aa98689bf6dc54bd6418798bc36', 'f58af2b0e4945d9313ea2c3bb55f4be7c003521be80ed92a5a0a56b5cdc03d48', '3409a208f5b26211be3406f8d4a93ed074cd1e1a72c6c3eed32f5b2d9c99526b']
const fun4b = [...s4b].filter(x => !sustituye.includes(x) && /ARRAY\[[^\]]*'/.test(S4B) && new RegExp(`ARRAY\\['[^']+\\([^)]*\\)', '[a-z]+', '(true|false)', '[a-z]', '[^']*', '${x}'`).test(S4B))
oraculo('S16', 'los sha256 de las funciones de la s16 son, uno a uno, los de las que sim-004b conserva (17 y la puerta)', S16 != null && fun4b.length === 18 && fun4b.every(x => s16.has(x)) && [...s16].every(x => fun4b.includes(x)), `s16 ${s16.size} · sim-004b ${fun4b.length}`)
if (!hayPostgres()) { ver('PostgreSQL 17 local: NO hay, la parte contra la base no se ha ejecutado', false); fin() }
const m = montajeV1()
try {
  m.arranca()
  const corre = (d, prefijo = '') => m.comoEjecutor(d, `begin read only;\n${prefijo}${S16 ?? 'select 1/0;'}\ncommit;`)
  const veredicto = r => (r.out.split('\n').find(l => l.startsWith('veredicto|')) ?? '').split('|')[1] ?? ''
  const aplica = d => m.comoEjecutor(d, S4B)
  titulo('2 · solo lectura, no superusuario, sobre el montaje de hoy')
  const d = m.base('s16a')
  ver('control: el ejecutor del montaje NO es superusuario', m.comoEjecutor(d, 'select rolsuper from pg_roles where rolname = current_user').out === 'f')
  const r = corre(d), r0 = corre(d, "set search_path = '';\n")
  const lineas = r.out.split('\n').filter(Boolean)
  oraculo('S16', 'en READ ONLY y como no superusuario: veredicto OK y acaba en «FIN|s16|consulta»', r.ok && veredicto(r) === 'OK' && lineas.at(-1) === 'FIN|s16|consulta', r.ok ? lineas.filter(l => /DIFIERE|DE MAS|FALTA|veredicto/.test(l)).join(' / ').slice(0, 600) : r.err)
  oraculo('S16', 'la misma salida con el search_path vacio que con el de defecto', r0.ok && r0.out === r.out, r0.ok ? '' : r0.err)
  oraculo('S16', 'sus filas: 14 rls, 13 politicas, 17 funciones y 63 disparadores, todas «coincide»', lineas.filter(l => l.startsWith('rls|')).length === 14 && lineas.filter(l => l.startsWith('funcion|') && l.endsWith('coincide')).length === 17 && lineas.filter(l => l.startsWith('disparador|') && l.endsWith('coincide')).length === 63 && (r.out.match(/coincide$/gm) ?? []).length === 14 + 13 + 17 + 63, String((r.out.match(/coincide$/gm) ?? []).length))
  oraculo('S16', 'y con eso sim-004b aplica', aplica(d).ok)
  const dp = m.base('s16p')
  const pp = m.comoEjecutor(dp, PUERTA)
  oraculo('S16', 'con la puerta (estado 2): veredicto OK (la puerta y sus 2 disparadores) y sim-004b aplica', pp.ok && veredicto(corre(dp)) === 'OK' && aplica(dp).ok, pp.ok ? '' : pp.err)

  titulo('3 · cada desvio: la s16 dice DIFIEREN y sim-004b aborta')
  const desvios = [
    ['RLS apagada en sim_eventos', 'alter table public.sim_eventos disable row level security'],
    ['RLS FORZADA en sim_eventos', 'alter table public.sim_eventos force row level security'],
    ['RLS FORZADA en user_tool_config', 'alter table public.user_tool_config force row level security'],
    ['cuerpo ajeno en sim_borrar_alumno', "create or replace function public.sim_borrar_alumno(p_user_id uuid) returns jsonb language plpgsql volatile security definer set search_path='' as $$ begin return jsonb_build_object('ok',true,'http',200); end $$"],
    ['politica alterada', 'drop policy sim_eventos_select_propios on public.sim_eventos; create policy sim_eventos_select_propios on public.sim_eventos for select to authenticated using (true)'],
    ['politica de mas', 'create policy sim_recibos_todo on public.sim_recibos for select to anon using (true)'],
    ['disparador desactivado', 'alter table public.sim_sessions disable trigger sim_sessions_rev_saldo'],
    ['disparador de mas', 'create trigger x_de_mas before insert on public.sim_eventos for each row execute function public.sim_escrituras_v0_solo_disparador()'],
    ['cupo de produccion cambiado', 'create or replace function public.enforce_sim_session_limit() returns trigger language plpgsql security definer set search_path = public as $$ begin return new; end $$'],
    ['search_path de sim_crear_sesion', 'alter function public.sim_crear_sesion(uuid,uuid,uuid,text,integer,jsonb,jsonb,jsonb,jsonb) set search_path = public'],
    ['sim_cierre_v0 SECURITY DEFINER', 'alter function public.sim_cierre_v0(uuid,numeric,bigint,jsonb) security definer'],
    ['otro dueño de sim_error', 'alter function public.sim_error(integer,text,jsonb) owner to service_role'],
    ['EXECUTE de mas en sim_bloquea_alumno', 'grant execute on function public.sim_bloquea_alumno(uuid) to service_role'],
  ]
  let k = 0
  for (const [que, sql] of desvios) {
    const dd = m.base(`s16d${++k}`)
    m.uno(dd, sql)
    const v = veredicto(corre(dd)), a = aplica(dd)
    oraculo('S16', `${que}: la s16 dice DIFIEREN y sim-004b aborta`, /^DIFIEREN \d+$/.test(v) && !a.ok && /sim-004b: /.test(a.err), `s16 ${v || '(sin veredicto)'} · sim-004b ${a.ok ? 'APLICA' : 'aborta'}`)
  }
  const dq = m.base('s16q')
  m.comoEjecutor(dq, PUERTA)
  m.uno(dq, "create or replace function public.sim_escrituras_v0_puerta() returns trigger language plpgsql volatile security invoker set search_path = '' as $$ begin return coalesce(new, old); end $$")
  const vq = veredicto(corre(dq)), aq = aplica(dq)
  oraculo('S16', 'una puerta de otro cuerpo: la s16 dice DIFIEREN y sim-004b aborta', /^DIFIEREN/.test(vq) && !aq.ok, `s16 ${vq} · sim-004b ${aq.ok ? 'APLICA' : 'aborta'}`)
} finally { m.cierra() }
fin()
