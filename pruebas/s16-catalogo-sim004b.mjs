/**
 * s16 · el catalogo que acredita sim-004b, medido ANTES de aplicarla (sql/consultas/s16-catalogo-sim004b.sql;
 * CTO 15-oct, diseño q.16.6). ENSAYO LOCAL; en produccion NO se ha corrido (la corre Ramon despues de la
 * puerta y antes de sim-004b).
 *   · una sola SELECT, dentro de una transaccion READ ONLY y como el ejecutor NO superusuario del montaje;
 *     acaba en «FIN | s16 | consulta»; los textos van tal cual (RINV3-01, CTO 17-oct): exige el search_path del
 *     editor ({public,extensions}; el ejecutor del montaje lo tiene como el postgres de Supabase) y con otro dice DIFIEREN;
 *   · sobre el montaje de hoy (y con la puerta): veredicto OK, y sim-004b aplica;
 *   · lo que da por bueno es lo que exige sim-004b: los sha256 de las funciones que conserva son los de
 *     sim-004b, y cada desvio de los que sim-004b acredita (RLS, force, politicas, funciones, disparadores)
 *     da veredicto «DIFIEREN» en la s16 Y aborta sim-004b.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { titulo, ver, oraculo, fin, REPO } from './lib.mjs'
import { hayPostgres } from './pg-ensayo.mjs'
import { montajeV1, conUidDelMontaje } from './montaje-v1.mjs'
const lee = p => { try { return readFileSync(path.join(REPO, p), 'utf8') } catch { return null } }
// R3E3B-02: la ficha de auth.uid() de produccion, por la del montaje (la unica adaptacion; montaje-v1.mjs)
const S16 = conUidDelMontaje(lee('sql/consultas/s16-catalogo-sim004b.sql')), S4B = conUidDelMontaje(lee('sql/sim-004b-contrato-v1.sql')), PUERTA = lee('sql/sim-004a-puerta.sql')
titulo('1 · la consulta y sim-004b dan por buenas las mismas funciones')
const shas = t => new Set([...(t ?? '').matchAll(/'([0-9a-f]{64})'/g)].map(x => x[1]).concat([...(t ?? '').matchAll(/\|([0-9a-f]{64})\|/g)].map(x => x[1])))
const s16 = shas(S16), s4b = shas(S4B)
// sim-004b: 20 funciones + la puerta; la s16 no mide las tres que sim-004b sustituye
const sustituye = ['94f4db481cc09a2bc9b5d86512931186d8ec5aa98689bf6dc54bd6418798bc36', 'f58af2b0e4945d9313ea2c3bb55f4be7c003521be80ed92a5a0a56b5cdc03d48', '3409a208f5b26211be3406f8d4a93ed074cd1e1a72c6c3eed32f5b2d9c99526b']
const fun4b = [...s4b].filter(x => !sustituye.includes(x) && /ARRAY\[[^\]]*'/.test(S4B) && new RegExp(`ARRAY\\['[^']+\\([^)]*\\)', '[a-z]+', '(true|false)', '[a-z]', '[^']*', '${x}'`).test(S4B))
oraculo('S16', 'los sha256 de las funciones de la s16 son, uno a uno, los de las que sim-004b conserva (17 y la puerta) y los de los 3 cuerpos que pone (su estado «aplicada»)', S16 != null && fun4b.length === 18 && fun4b.every(x => s16.has(x)) && sustituye.every(x => s16.has(x)) && [...s16].every(x => fun4b.includes(x) || sustituye.includes(x)), `s16 ${s16.size} · sim-004b ${fun4b.length} + 3`)
// H1: las definiciones de las secciones 0-3 que mide la s16 son COPIA literal de las de sim-004b (las 25
// restricciones y los 10 indices de su seccion 3, y las 4 definiciones viejas y nuevas de las dos que cambia)
const literales = (t, re) => [...(t ?? '').matchAll(re)].map(x => x[0])
const seccion3 = S4B?.slice(S4B.indexOf('FOR v_rel, f, v_def IN SELECT'), S4B.indexOf(') c(nombre, def)'))
const r4b = [...literales(seccion3, /\('sim_[a-z_]+', 'sim_[a-z_0-9]+', '(?:[^']|'')*'\)/g), ...literales(seccion3, /\('sim_[a-z_0-9]+', 'CREATE UNIQUE INDEX (?:[^']|'')*'\)/g)]
const d4b = ['v_terminal_vieja', 'v_terminal_nueva', 'v_tipo_viejo', 'v_tipo_nuevo'].map(v => (new RegExp(`^  ${v} text := ('(?:[^']|'')*');$`, 'm').exec(S4B ?? '') ?? [])[1])
oraculo('S16', 'las 25 restricciones, los 10 indices y las 4 definiciones de las dos que cambia son, literales, las de sim-004b', r4b.length === 35 && r4b.every(x => (S16 ?? '').includes(x)) && d4b.every(x => x && (S16 ?? '').includes(x)), `${r4b.filter(x => !(S16 ?? '').includes(x)).length} de ${r4b.length} sin copiar (se esperaban 35)`)
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
  const r = corre(d), r0 = corre(d, "set search_path = '';\n"), r1 = corre(d, 'set search_path = public;\n')
  const lineas = r.out.split('\n').filter(Boolean)
  oraculo('S16', 'en READ ONLY y como no superusuario: veredicto OK y acaba en «FIN|s16|consulta»', r.ok && veredicto(r) === 'OK' && lineas.at(-1) === 'FIN|s16|consulta', r.ok ? lineas.filter(l => /DIFIERE|DE MAS|FALTA|veredicto/.test(l)).join(' / ').slice(0, 600) : r.err)
  // RINV3-01: sin normalizar, la salida depende del search_path; la s16 exige el del editor (por sus esquemas efectivos)
  ver('control: el ejecutor del montaje tiene el search_path del editor de Supabase ({public,extensions})', m.comoEjecutor(d, 'select pg_catalog.current_schemas(false)::text').out === '{public,extensions}')
  const reqSp = x => (x.out.split('\n').find(l => l.startsWith('requisito|search_path|')) ?? '')
  oraculo('S16', 'con el search_path vacio o con «public» a secas: el requisito «search_path» DIFIERE y veredicto DIFIEREN', r0.ok && r1.ok && reqSp(r).endsWith(' · coincide') && reqSp(r0).endsWith(' · DIFIERE') && reqSp(r1).endsWith(' · DIFIERE') && /^DIFIEREN \d+$/.test(veredicto(r0)) && /^DIFIEREN \d+$/.test(veredicto(r1)), [reqSp(r0), veredicto(r0), reqSp(r1), veredicto(r1)].join(' / ').slice(0, 400))
  oraculo('S16', 'sus filas: 14 rls, 13 politicas, 17 funciones y 81 disparadores (con los 18 del otro extremo de las FK, E3R3-03), todas «coincide»', lineas.filter(l => l.startsWith('rls|')).length === 14 && lineas.filter(l => l.startsWith('funcion|') && l.endsWith('coincide')).length === 17 && lineas.filter(l => l.startsWith('disparador|') && l.endsWith('coincide')).length === 81, String((r.out.match(/coincide$/gm) ?? []).length))
  // CTO 15-oct (ronda 2): la s16 mide TODO lo que sim-004b exige, tambien las ACL de tabla (su 4.3): la
  // matriz efectiva de los siete privilegios en las 11 protegidas, los receptores de mas en las 7 nuevas
  // y sus 4 secuencias, y ninguna ACL de columna en las 11
  const acl = lineas.filter(l => /^acl_(tabla|receptores|columna)\|/.test(l))
  oraculo('S16', 'y las ACL de tabla: 11 filas acl_tabla, 11 acl_receptores y 1 acl_columna, todas «coincide»', acl.filter(l => l.startsWith('acl_tabla|')).length === 11 && acl.filter(l => l.startsWith('acl_receptores|')).length === 11 && acl.filter(l => l.startsWith('acl_columna|')).length === 1 && acl.every(l => l.endsWith('coincide')) && (r.out.match(/coincide$/gm) ?? []).length === 14 + 13 + 17 + 81 + 23 + 43 + 1 + 11 + 1 + 2 + 2 + 2 + 1, acl.join(' / ').slice(0, 500))
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

  titulo('4 · la familia de las ACL de tabla: cada tabla y cada privilegio (CTO 15-oct, ronda 2)')
  // Cada desvio, en UNA base (la del montaje), dentro de una transaccion que se deshace: el desvio + la
  // s16, y el desvio + sim-004b. Exhaustiva, sin azar: las 11 protegidas × los 7 privilegios concedidos a
  // anon (77); en las 4 de s04, un privilegio ESPERADO quitado (authenticated pierde DELETE; 4); USAGE a
  // anon en cada una de las 4 secuencias (4); y una ACL de columna (SELECT de la primera columna a anon)
  // en cada una de las 11 (11). Total 96: en todos, la s16 dice DIFIEREN y sim-004b aborta.
  const PROTEGIDAS = ['sim_alumnos', 'sim_arrendamientos', 'sim_recibos', 'sim_eventos', 'sim_escrituras_v0', 'sim_escrituras_v0_marcas', 'sim_servicio', 'sim_sessions', 'sim_trades', 'session_drawings', 'session_chart_config']
  const S04 = ['sim_sessions', 'sim_trades', 'session_drawings', 'session_chart_config']
  const SECUENCIAS = ['sim_recibos_id_seq', 'sim_eventos_id_seq', 'sim_escrituras_v0_id_seq', 'sim_escrituras_v0_marcas_id_seq']
  const PRIV = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']
  const familia = [
    ...PROTEGIDAS.flatMap(t => PRIV.map(p => [`${p} a anon en ${t}`, `grant ${p} on public.${t} to anon`])),
    ...S04.map(t => [`authenticated sin DELETE en ${t}`, `revoke delete on public.${t} from authenticated`]),
    ...SECUENCIAS.map(q => [`USAGE a anon en ${q}`, `grant usage on sequence public.${q} to anon`]),
    ...PROTEGIDAS.map(t => [`ACL de columna en ${t}`, `do $c$ begin execute format('grant select (%I) on public.${t} to anon', (select attname from pg_attribute where attrelid = 'public.${t}'::regclass and attnum = 1)); end $c$`]),
  ]
  ver(`control: la familia tiene 96 desvios (${familia.length})`, familia.length === 96)
  const fam = m.base('s16f')
  const fallan = []
  for (const [que, sql] of familia) {
    const rs = m.comoEjecutor(fam, `begin;\n${sql};\n${S16 ?? 'select 1/0;'}\nrollback;`)
    const ra = m.comoEjecutor(fam, `begin;\n${sql};\n${S4B}\nrollback;`)
    if (!(rs.ok && /^DIFIEREN \d+$/.test(veredicto(rs)) && !ra.ok && /sim-004b: /.test(ra.err))) fallan.push(`${que}: s16 ${rs.ok ? veredicto(rs) : 'error'} · sim-004b ${ra.ok ? 'APLICA' : 'aborta'}`)
  }
  ver('control: tras la familia la base sigue intacta (veredicto OK y sim-004b aplica en una transaccion)', veredicto(corre(fam)) === 'OK' && m.comoEjecutor(fam, `begin;\n${S4B}\nrollback;`).ok)
  oraculo('S16', `los 96 desvios de ACL de tabla: la s16 dice DIFIEREN y sim-004b aborta en todos`, fallan.length === 0, `${fallan.length} fallan: ${fallan.slice(0, 6).join(' · ')}`)

  titulo('5 · la familia de FORCE: las 14 tablas (CTO 15-oct, q.17.1)')
  // RLS FORZADA en cada una de las 14 que acredita sim-004b (las 11 protegidas y las tres de las que solo
  // acredita disparadores): la s16 dice DIFIEREN y sim-004b aborta. Cobertura de lo que ya exigia 7ba487f
  // (que tenia negativos solo en sim_eventos y user_tool_config): sin rojo previo.
  const CATORCE = [...PROTEGIDAS, 'sim_drawing_templates', 'user_chart_config', 'user_tool_config']
  const fallanF = []
  for (const t of CATORCE) {
    const sql = `alter table public.${t} force row level security`
    const rs = m.comoEjecutor(fam, `begin;\n${sql};\n${S16 ?? 'select 1/0;'}\nrollback;`)
    const ra = m.comoEjecutor(fam, `begin;\n${sql};\n${S4B}\nrollback;`)
    if (!(rs.ok && /^DIFIEREN \d+$/.test(veredicto(rs)) && !ra.ok && /sim-004b: /.test(ra.err))) fallanF.push(`${t}: s16 ${rs.ok ? veredicto(rs) : 'error'} · sim-004b ${ra.ok ? 'APLICA' : 'aborta'}`)
  }
  oraculo('S16', `FORCE en cada una de las 14 tablas: la s16 dice DIFIEREN y sim-004b aborta (${CATORCE.length})`, CATORCE.length === 14 && fallanF.length === 0, fallanF.join(' · '))

  titulo('6 · las secciones 0-3 de sim-004b, en las DOS direcciones (revisor de d20dcef: H1, H2, H3)')
  // La regla del CTO: la s16 mide TODO lo que sim-004b exige, ni mas ni menos. Para cada desvio: «la s16
  // dice DIFIEREN» si y solo si «sim-004b aborta». Familia exhaustiva (sin azar):
  //   · las 25 restricciones de sim-003 que sim-004b compara al pie de la letra, quitadas una a una;
  //   · los 2 indices unicos que no sostienen una restriccion (los otros 8 caen con la suya), quitados;
  //   · el estado de las dos restricciones que cambia sim-004b: cada una alterada, y el estado mixto (una
  //     ya nueva y la otra vieja): la rama «A MEDIAS»;
  //   · las 3 RPC que sustituye: EXECUTE a anon, a authenticated y a PUBLIC, y sin EXECUTE de service_role
  //     (4 × 3);
  //   · y la otra direccion, lo que sim-004b NO exige antes de aplicarse: las 4 secuencias renombradas (H2)
  //     y, en las 3 RPC que sustituye, otro search_path o SECURITY INVOKER (su CREATE OR REPLACE los rehace):
  //     las dos dicen bien.
  // Incluye los seis casos del script del revisor (rojos/s16-huecos-revisor-contra-d20dcef.txt).
  const RESTR = [['sim_alumnos', 'sim_alumnos_pkey'], ['sim_alumnos', 'sim_alumnos_user_id_fkey'], ['sim_arrendamientos', 'sim_arrendamientos_pkey'], ['sim_arrendamientos', 'sim_arrendamientos_session_id_fkey'], ['sim_arrendamientos', 'sim_arrendamientos_cliente_id_check'], ['sim_arrendamientos', 'sim_arrendamientos_testigo_hash_check'], ['sim_recibos', 'sim_recibos_pkey'], ['sim_recibos', 'sim_recibos_session_id_fkey'], ['sim_recibos', 'sim_recibos_session_command_key'], ['sim_recibos', 'sim_recibos_tipo_check'], ['sim_recibos', 'sim_recibos_clase_check'], ['sim_recibos', 'sim_recibos_clase_tipo'], ['sim_recibos', 'sim_recibos_digest_check'], ['sim_recibos', 'sim_recibos_resultado_check'], ['sim_eventos', 'sim_eventos_pkey'], ['sim_eventos', 'sim_eventos_session_id_fkey'], ['sim_eventos', 'sim_eventos_session_seq_key'], ['sim_eventos', 'sim_eventos_session_command_ordinal_key'], ['sim_eventos', 'sim_eventos_seq_check'], ['sim_eventos', 'sim_eventos_ordinal_check'], ['sim_sessions', 'sim_sessions_user_id_perfil_fkey'], ['sim_sessions', 'sim_sessions_v1_coherente'], ['sim_trades', 'sim_trades_evento_id_fkey'], ['sim_trades', 'sim_trades_evento_id_key'], ['sim_trades', 'sim_trades_v1_coherente']]
  const SUST = ['sim_comando(uuid,uuid,uuid,text,text,integer,bigint,text,text,jsonb)', 'sim_tomar_escritor(uuid,uuid,uuid,text,integer,text,boolean)', 'sim_avanzar_fase(uuid,uuid,uuid,uuid,text,integer,bigint,jsonb,jsonb,jsonb,jsonb)']
  const TIPO_NUEVO = "check (tipo in ('orden_creada', 'orden_modificada', 'orden_cancelada', 'fill', 'cierre', 'reset_diario', 'breach', 'fase_superada', 'fin_de_datos', 'posicion_modificada', 'no_valorable', 'hueco_aceptado'))"
  const malos = [
    ...RESTR.map(([t, c]) => [`restriccion ${c} quitada`, `alter table public.${t} drop constraint ${c} cascade`]),
    ['indice sim_recibos_ultimo_avance_key quitado', 'drop index public.sim_recibos_ultimo_avance_key'],
    ['indice sim_sessions_una_hija_v1_key quitado', 'drop index public.sim_sessions_una_hija_v1_key'],
    ['terminal_valida alterada', "alter table public.sim_sessions drop constraint sim_sessions_terminal_valida, add constraint sim_sessions_terminal_valida check (terminal is null or terminal in ('borrada'))"],
    ['tipo_check alterada', "alter table public.sim_eventos drop constraint sim_eventos_tipo_check, add constraint sim_eventos_tipo_check check (tipo in ('fill', 'cierre'))"],
    ['estado mixto: tipo_check ya nueva y terminal vieja', `alter table public.sim_eventos drop constraint sim_eventos_tipo_check, add constraint sim_eventos_tipo_check ${TIPO_NUEVO}`],
    ...SUST.flatMap(f => [
      [`EXECUTE a anon en ${f}`, `grant execute on function public.${f} to anon`],
      [`EXECUTE a authenticated en ${f}`, `grant execute on function public.${f} to authenticated`],
      [`EXECUTE a PUBLIC en ${f}`, `grant execute on function public.${f} to public`],
      [`sin EXECUTE de service_role en ${f}`, `revoke execute on function public.${f} from service_role`],
    ]),
  ]
  // y lo que sim-004b NO exige antes de aplicarse: las secuencias (H2) y, en las 3 RPC que sustituye,
  // SECURITY y search_path (su CREATE OR REPLACE los vuelve a fijar; solo los comprueba ya aplicada)
  const buenos = [
    ...SECUENCIAS.map(q => [`secuencia ${q} renombrada (sim-004b no la exige)`, `alter sequence public.${q} rename to ${q}_x`]),
    ...SUST.flatMap(f => [
      [`search_path de ${f} (sim-004b lo rehace)`, `alter function public.${f} set search_path = public`],
      [`SECURITY INVOKER en ${f} (sim-004b lo rehace)`, `alter function public.${f} security invoker`],
    ]),
  ]
  ver(`control: la familia tiene ${malos.length} desvios que sim-004b rechaza (25 + 2 + 3 + 12 = 42) y ${buenos.length} que acepta (4 + 6)`, malos.length === 42 && buenos.length === 10)
  const desacuerdo = [], noRechazan = [], noAceptan = []
  for (const [que, sql, debe] of [...malos.map(x => [...x, 'aborta']), ...buenos.map(x => [...x, 'aplica'])]) {
    const rs = m.comoEjecutor(fam, `begin;\n${sql};\n${S16 ?? 'select 1/0;'}\nrollback;`)
    const ra = m.comoEjecutor(fam, `begin;\n${sql};\n${S4B}\nrollback;`)
    const s16Mal = rs.ok && /^DIFIEREN \d+$/.test(veredicto(rs)), aborta = !ra.ok && /sim-004b: /.test(ra.err), aplica = ra.ok
    const linea = `${que}: s16 ${rs.ok ? veredicto(rs) : 'error'} · sim-004b ${aplica ? 'APLICA' : aborta ? 'aborta' : 'error ajeno'}`
    if (s16Mal !== aborta || (!aborta && !aplica)) desacuerdo.push(linea)
    if (debe === 'aborta' && !aborta) noRechazan.push(linea)
    if (debe === 'aplica' && !aplica) noAceptan.push(linea)
  }
  ver('control: sim-004b aborta en los 42 desvios y aplica en los 10 que no exige', noRechazan.length === 0 && noAceptan.length === 0, [...noRechazan, ...noAceptan].slice(0, 4).join(' · '))
  oraculo('S16', 'en los 52 (42 + 10), la s16 dice DIFIEREN si y solo si sim-004b aborta (ninguno en un sentido ni en el otro)', desacuerdo.length === 0, `${desacuerdo.length} en desacuerdo: ${desacuerdo.slice(0, 6).join(' · ')}`)
  titulo('7 · con sim-004b YA aplicada: los atributos de las 3 RPC si cuentan')
  const apl = m.base('s16apl')
  ver('control: sim-004b aplicada en la base', aplica(apl).ok)
  const sinNada = m.comoEjecutor(apl, `begin;\n${S16}\nrollback;`), reApl = m.comoEjecutor(apl, `begin;\n${S4B}\nrollback;`)
  oraculo('S16', 'aplicada y sin desvio: la s16 dice OK (estado «aplicada») y sim-004b se reejecuta', veredicto(sinNada) === 'OK' && /sim004b_estado\|[^\n]*aplicada[^\n]*coincide/.test(sinNada.out) && reApl.ok, `s16 ${veredicto(sinNada)} · sim-004b ${reApl.ok ? 'APLICA' : 'aborta'}`)
  const malosApl = SUST.flatMap(f => [
    [`search_path de ${f}`, `alter function public.${f} set search_path = public`],
    [`SECURITY INVOKER en ${f}`, `alter function public.${f} security invoker`],
    [`EXECUTE a anon en ${f}`, `grant execute on function public.${f} to anon`],
  ])
  const desApl = []
  for (const [que, sql] of malosApl) {
    const rs = m.comoEjecutor(apl, `begin;\n${sql};\n${S16}\nrollback;`)
    const ra = m.comoEjecutor(apl, `begin;\n${sql};\n${S4B}\nrollback;`)
    if (!(rs.ok && /^DIFIEREN \d+$/.test(veredicto(rs)) && !ra.ok && /sim-004b: /.test(ra.err))) desApl.push(`${que}: s16 ${rs.ok ? veredicto(rs) : 'error'} · sim-004b ${ra.ok ? 'APLICA' : 'aborta'}`)
  }
  oraculo('S16', `aplicada: en las 3 RPC, otro search_path, SECURITY INVOKER o EXECUTE a anon → la s16 dice DIFIEREN y sim-004b aborta (${malosApl.length})`, desApl.length === 0, desApl.join(' · '))
  const filasNuevas = lineas.filter(l => /^(requisito|sim004b_estado|restriccion|indice|funcion_sustituida)\|/.test(l))
  oraculo('S16', 'y en el montaje: 10 requisito (con el search_path, los dos ajustes de RE3-01, pgrst.*, los roles del alumno y el uso de esquemas de RE4-01), 1 sim004b_estado, 25 restriccion, 10 indice y 3 funcion_sustituida, todas «coincide»', filasNuevas.filter(l => l.startsWith('requisito|')).length === 10 && filasNuevas.filter(l => l.startsWith('sim004b_estado|')).length === 1 && filasNuevas.filter(l => l.startsWith('restriccion|')).length === 25 && filasNuevas.filter(l => l.startsWith('indice|')).length === 10 && filasNuevas.filter(l => l.startsWith('funcion_sustituida|')).length === 3 && filasNuevas.every(l => l.endsWith('coincide')), filasNuevas.filter(l => !l.endsWith('coincide')).join(' / ').slice(0, 400))
} finally { m.cierra() }
fin()
