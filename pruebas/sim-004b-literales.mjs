/**
 * ETAPA 3 · RINV3-01 (revisor interno de ce8b315; CTO 17-oct, orden 1-008, opcion b): sim-004b y s16 comparan los textos
 * del catalogo TAL CUAL, sin quitar «public.» con regexp_replace (que tambien lo quitaba de dentro de los literales).
 * Rojo previo contra el SQL de ce8b315: los 4 casos del revisor (sim-004b aplica y la s16 da OK) y el predicado de indice
 * (la s16 da OK; sim-004b ya lo paraba por su seccion 3). Los demas ya los paraba la comparacion exacta: son cobertura.
 *
 * Contra PostgreSQL 17 local (montaje-v1, con la puerta), cada mutante en primera aplicacion y en reejecucion: la s16 dice
 * DIFIEREN y sim-004b aborta sin cambiar nada.
 *   · los 4 casos del revisor: 'public.active' en el valor por defecto de sim_sessions.status, 'public.BUY' en
 *     sim_trades_side_check, 'public.sim_sessions' en sim_escrituras_v0_tabla_check y 'public.[]' en el de session_drawings.data;
 *   · el literal 'public.…' en cada tipo de expresion que guarda texto: valor por defecto y CHECK (los de arriba), predicado
 *     de indice, expresion de indice, politica (no protegida y protegida), regla y disparador con WHEN;
 *   · lo que «ajeno» no mira (politicas, reglas, disparadores y opclass): una funcion o un opclass de public en cada una lo
 *     para la comparacion exacta del texto.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { titulo, ver, oraculo, fin, REPO } from './lib.mjs'
import { hayPostgres } from './pg-ensayo.mjs'
import { montajeV1, conUidDelMontaje, sinEnvoltura } from './montaje-v1.mjs'
const lee = p => readFileSync(path.join(REPO, p), 'utf8')
const u = k => `00000000-0000-4000-8000-${String(k).padStart(12, '0')}`
const err1 = r => (r.err.split('\n').find(l => /ERROR/.test(l)) || r.err.split('\n')[0] || '').replace(/^.*ERROR:\s+/, '')

titulo('0 · ninguna comparacion quita prefijos')
const S4B0 = lee('sql/sim-004b-contrato-v1.sql'), S160 = lee('sql/consultas/s16-catalogo-sim004b.sql')
const sinComentarios = t => t.replace(/--.*$/gm, '')
oraculo('LIT', 'ni sim-004b ni la s16 usan regexp_replace ni quitan «public.» de ningun texto', ![S4B0, S160].some(t => /regexp_replace|replace\([^)]*public/i.test(sinComentarios(t))))

if (!hayPostgres()) { ver('PostgreSQL 17 local: NO hay, la prueba no se ha ejecutado', false); fin() }
const S4B = conUidDelMontaje(S4B0), S16 = conUidDelMontaje(sinEnvoltura(S160))
const m = montajeV1()
try {
  m.arranca()
  let n = 0
  const base = () => { const d = m.base(`li${++n}`); const p = m.comoEjecutor(d, lee('sql/sim-004a-puerta.sql')); if (!p.ok) throw new Error('puerta: ' + p.err); return d }
  const aplica = d => m.comoEjecutor(d, S4B)
  const s16 = d => m.comoEjecutor(d, `begin read only;\n${S16}\nrollback;`)
  const veredicto = q => (q.out.split('\n').find(l => l.startsWith('veredicto|')) ?? '').split('|')[1] ?? ''
  const foto = d => m.uno(d, `select md5(string_agg(x, ',' order by x)) from (
      select 'c:' || conrelid::regclass::text || conname || pg_get_constraintdef(oid) x from pg_constraint where connamespace = 'public'::regnamespace
      union all select 'i:' || pg_get_indexdef(indexrelid) from pg_index where indrelid in (select oid from pg_class where relnamespace = 'public'::regnamespace)
      union all select 'd:' || adrelid::regclass::text || adnum || pg_get_expr(adbin, adrelid) from pg_attrdef
      union all select 'p:' || tablename || policyname || coalesce(qual, '') || coalesce(with_check, '') from pg_policies where schemaname = 'public'
      union all select 'r:' || rulename || definition from pg_rules where schemaname = 'public'
      union all select 't:' || tgname || pg_get_triggerdef(oid) from pg_trigger where not tgisinternal
      union all select 'f:' || p.oid::regprocedure::text || md5(p.prosrc) from pg_proc p where p.pronamespace = 'public'::regnamespace) s`)
  const nueva = despues => { const d = base(); if (despues) { const r = aplica(d); if (!r.ok) throw new Error('control: sim-004b no aplica: ' + err1(r)) } m.alumno(d, u(1)); return d }

  titulo('el positivo')
  for (const despues of [false, true]) {
    const d = nueva(despues)
    ver(`control: limpio ${despues ? 'con sim-004b aplicada' : 'antes de sim-004b'}: s16 OK y sim-004b ${despues ? 'se reejecuta' : 'aplica'}`, veredicto(s16(d)) === 'OK' && aplica(d).ok)
  }

  const FUNC = "create function public.f_lit(uuid) returns boolean language sql immutable as $$ select true $$;"
  const CASOS = [
    // [nombre, mutante, como superusuario]
    // los 4 del revisor (RINV3-01)
    ["valor por defecto · 'public.active' en sim_sessions.status (revisor)", "alter table public.sim_sessions alter column status set default 'public.active';"],
    ["CHECK · 'public.BUY' en sim_trades_side_check (revisor)", "alter table public.sim_trades drop constraint sim_trades_side_check, add constraint sim_trades_side_check check (side = any (array['public.BUY'::text, 'SELL'::text]));"],
    ["CHECK · 'public.sim_sessions' en sim_escrituras_v0_tabla_check (revisor)", "alter table public.sim_escrituras_v0 drop constraint sim_escrituras_v0_tabla_check, add constraint sim_escrituras_v0_tabla_check check (tabla = any (array['public.sim_sessions'::text, 'sim_trades'::text]));"],
    ["valor por defecto · 'public.[]' en session_drawings.data (revisor)", "alter table public.session_drawings alter column data set default 'public.[]';"],
    // el literal en cada tipo de expresion que guarda texto
    ["predicado de indice · 'public.ultimo_avance' en sim_recibos_ultimo_avance_key", "drop index public.sim_recibos_ultimo_avance_key; create unique index sim_recibos_ultimo_avance_key on public.sim_recibos (session_id) where (clase = 'public.ultimo_avance');"],
    ["expresion de indice · un indice con 'public.abrir' en sim_recibos", "create index x_lit on public.sim_recibos ((tipo = 'public.abrir'));"],
    ["politica (no protegida) · 'public.x' en la de user_chart_config", `alter policy "user owns config" on public.user_chart_config using ((auth.uid() = user_id) and (current_user <> 'public.x'));`],
    ["politica (protegida) · 'public.x' en sim_recibos_select_propios", "alter policy sim_recibos_select_propios on public.sim_recibos using ((auth.uid() = user_id) and (current_user <> 'public.x'));"],
    ["regla · con 'public.x' en sim_alumnos", "create rule x_lit as on update to public.sim_alumnos where (old.user_id::text <> 'public.x') do instead nothing;"],
    ["disparador con WHEN · 'public.x' en sim_alumnos", "create trigger x_lit before update on public.sim_alumnos for each row when (new.user_id::text <> 'public.x') execute function public.sim_escrituras_v0_inmutable();"],
    // lo que «ajeno» no mira: la comparacion exacta del texto
    ['politica · una funcion de public en la de user_chart_config', `${FUNC} alter policy "user owns config" on public.user_chart_config using (public.f_lit(user_id));`],
    ['regla · una funcion de public en sim_alumnos', `${FUNC} create rule x_lit as on update to public.sim_alumnos where public.f_lit(old.user_id) do instead nothing;`],
    ['disparador con WHEN · una funcion de public en sim_alumnos', `${FUNC} create trigger x_lit before update on public.sim_alumnos for each row when (public.f_lit(new.user_id)) execute function public.sim_escrituras_v0_inmutable();`],
    ['opclass · uno de public en sim_escrituras_v0_sesion_xact_idx (mismo nombre y columnas)', 'create operator class public.x_text_ops for type text using btree as operator 1 pg_catalog.< , operator 2 pg_catalog.<= , operator 3 pg_catalog.= , operator 4 pg_catalog.>= , operator 5 pg_catalog.> , function 1 pg_catalog.bttextcmp(text, text); drop index public.sim_escrituras_v0_sesion_xact_idx; create index sim_escrituras_v0_sesion_xact_idx on public.sim_escrituras_v0 (session_id, xact public.x_text_ops);', true],
  ]
  ver('control: la familia cubre los 4 casos del revisor, los 7 tipos de expresion con texto y los 4 que «ajeno» no mira', CASOS.length === 14)
  for (const [nombre, mutante, su] of CASOS) {
    for (const despues of [false, true]) {
      const d = nueva(despues)
      const mu = su ? m.pg.psql(mutante, d) : m.comoEjecutor(d, mutante)
      const cuando = despues ? 'reejecucion' : 'primera aplicacion'
      if (!mu.ok) { oraculo('LIT', `${nombre} (${cuando}): el mutante se aplica`, false, err1(mu)); continue }
      const q = s16(d)
      const malas = q.out.split('\n').filter(l => /(DIFIERE|DE MAS|FALTA)$|DIFIERE \(/.test(l))
      const a = foto(d)
      const r = aplica(d)
      oraculo('LIT', `${nombre} (${cuando}): s16 DIFIEREN; sim-004b aborta y nada cambia`,
        q.ok && /^DIFIEREN \d+$/.test(veredicto(q)) && !r.ok && err1(r).startsWith('sim-004b: ') && foto(d) === a,
        `${malas.map(l => l.split('|').slice(0, 2).join('|')).join(', ').slice(0, 120)} · ${r.ok ? 'sim-004b APLICA' : err1(r).slice(0, 140)}`)
    }
  }
} finally { m.cierra() }
fin()
