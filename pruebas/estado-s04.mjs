// EL ESTADO DE LA s04, INVENTADO EN SU FORMA, para ensayar el SQL de permisos
// (pruebas/sim-001.mjs y pruebas/sim-001b.mjs parten de exactamente lo mismo).
// Hechos del resumen de la s04 (4-oct-2026, sql/APLICADOS.md): RLS en las 9
// tablas, politicas ALL auth.uid() = user_id en las 7 del simulador, profiles y
// messages solo SELECT, anon y authenticated con todos los grants en las 7,
// session_chart_config.session_id sin FK, user_id nulable en tres tablas,
// session_id nulable en sim_trades, sin indices. Y de la salida real (CTO,
// 4-oct): sim_trades y session_drawings → sim_sessions ON DELETE CASCADE.
export const A = '00000000-0000-0000-0000-00000000000a', B = '00000000-0000-0000-0000-00000000000b'
export const S1 = '10000000-0000-0000-0000-000000000001', S2 = '10000000-0000-0000-0000-000000000002'
export const SIETE = ['sim_sessions', 'sim_trades', 'session_drawings', 'session_chart_config', 'sim_drawing_templates', 'user_chart_config', 'user_tool_config']

export const ESTADO = `
create extension if not exists pgcrypto;
do $r$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $r$;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;
grant usage on schema public to anon, authenticated, service_role;
create table public.profiles (id uuid primary key, email text, rol_global text default 'user', simulador_activo boolean default false);
create table public.messages (id uuid primary key default gen_random_uuid(), user_id uuid, texto text);
alter table public.profiles enable row level security;
alter table public.messages enable row level security;
create policy profiles_select on public.profiles for select to authenticated using (auth.uid() = id);
create policy messages_select on public.messages for select to authenticated using (auth.uid() = user_id);
create table public.sim_sessions (id uuid primary key default gen_random_uuid(), user_id uuid, name text, capital numeric, balance numeric);
create table public.sim_trades (id uuid primary key default gen_random_uuid(), user_id uuid,
  session_id uuid references public.sim_sessions(id) on delete cascade, pnl numeric, closed_at timestamptz);
create table public.session_drawings (id uuid primary key default gen_random_uuid(), user_id uuid not null,
  session_id uuid references public.sim_sessions(id) on delete cascade, pair text, data jsonb);
create table public.session_chart_config (id uuid primary key default gen_random_uuid(), user_id uuid not null, session_id uuid, config jsonb);
create table public.sim_drawing_templates (id uuid primary key default gen_random_uuid(), user_id uuid, name text, data text);
create table public.user_chart_config (user_id uuid primary key, config jsonb);
create table public.user_tool_config (user_id uuid primary key, config jsonb);
${SIETE.map(t => `alter table public.${t} enable row level security;
create policy ${t}_policy on public.${t} for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
grant all on public.${t} to anon, authenticated, service_role;`).join('\n')}
`
export const DATOS = `
insert into sim_sessions (id, user_id, name, capital, balance) values ('${S1}', '${A}', 'uno', 10000, 10000), ('${S2}', '${B}', 'dos', 10000, 10000);
insert into sim_trades (user_id, session_id, pnl, closed_at) values ('${A}', '${S1}', 100, now()), ('${B}', '${S2}', -50, now());
insert into session_drawings (user_id, session_id, pair) values ('${A}', '${S1}', 'EURUSD');
insert into session_chart_config (user_id, session_id, config) values ('${A}', '${S1}', '{}'), ('${B}', '${S2}', '{}');
insert into sim_drawing_templates (user_id, name) values ('${A}', 'plantilla');
insert into user_chart_config values ('${A}', '{}'); insert into user_tool_config values ('${A}', '{}');
`

// ── PRODUCCION SEGUN LA SALIDA LITERAL DE s04 Y s05 DEL 10-oct-2026 ─────────
// Para sim-003. Fuente: sql/consultas/salidas/s04-esquema-simulador-2026-10-10.csv
// y s05-nombres-libres-2026-10-10.csv (Ramon, copiados tal cual de
// revisiones-suite). pruebas/estado-s04-literal.mjs corre las mismas consultas
// sobre este montaje y exige las mismas filas, una a una, y ninguna mas.
//
// LITERAL (lo comprueba esa prueba): las 9 tablas con sus columnas en orden,
// tipos, NULL y defaults; todas sus restricciones con su ON DELETE, incluida
// profiles.id → auth.users CASCADE y las 15 FK ENTRANTES a profiles de otros
// productos (ia_*, macro_*, notas, trades); indices; los dos triggers con el
// cuerpo real de sus funciones (enforce_sim_session_limit y
// sync_plataformas_activas), is_admin y handle_new_user con su ACL; RLS,
// politicas y grants de tabla; el bucket forex-data y la RLS de
// storage.objects (sin politicas); en s05, los nombres libres, el prefijo sim_
// y pgcrypto 1.3 en extensions.
//
// NO CONSTA en s04/s05 (se marca aqui y se pregunta; no se da por hecho):
//   · auth.users: solo su id. Sus demas columnas y sus triggers (si
//     handle_new_user cuelga de un trigger de auth.users) no los lee s04;
//     aqui no hay trigger y los perfiles se insertan a mano.
//   · auth.uid(): la del arnes lee request.jwt.claim.sub.
//   · las 15 tablas entrantes: solo su columna con la FK; lo demas no consta.
//   · storage.buckets/objects: solo las columnas que lee la consulta.
//   · roles: que existan anon, authenticated y service_role (BYPASSRLS) y sus
//     membresias; s04 no lee pg_roles ni pg_auth_members.
//   · privilegios por defecto (pg_default_acl): s04 no los lee. En funciones
//     se DEDUCEN de la ACL literal de las cuatro de s04 (PUBLIC, postgres,
//     anon, authenticated y service_role con EXECUTE); en tablas y secuencias
//     se SUPONEN como los de Supabase (todo a anon, authenticated y
//     service_role) y se ponen al final: sim-003 tiene que quitarlos el mismo.
//   · la version de PostgreSQL de produccion; aqui, 17.
// Despues se aplica sql/sim-002 tal cual (sus funciones existen en produccion,
// dueño postgres: s05).
const ENTRANTES = [['ia_alertas', 'alumno_id'], ['ia_borrados', 'alumno_id'], ['ia_consentimiento', 'user_id'], ['ia_conversaciones', 'user_id'],
  ['ia_notas_mentor', 'alumno_id'], ['ia_operaciones', 'user_id'], ['ia_perfil_alumno', 'user_id'], ['ia_recados', 'alumno_id'], ['ia_turnos', 'alumno_id'],
  ['ia_uso', 'user_id'], ['macro_conversaciones', 'user_id'], ['macro_ia_uso', 'user_id'], ['macro_planes', 'user_id'], ['notas', 'alumno_id'], ['trades', 'user_id']]
const SIETE_P = ['session_chart_config', 'session_drawings', 'sim_drawing_templates', 'sim_sessions', 'sim_trades', 'user_chart_config', 'user_tool_config']
export const PRODUCCION = `
do $r$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $r$;
create schema extensions;
create extension pgcrypto with schema extensions;
grant usage on schema extensions to anon, authenticated, service_role;
create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated, service_role; grant execute on function auth.uid() to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
-- deducido de la ACL literal de las funciones de s04
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;

create table public.profiles (
  id uuid not null constraint profiles_id_fkey references auth.users(id) on delete cascade,
  email text not null,
  nombre text,
  rol text default 'alumno',
  capital numeric default 100000,
  riesgo numeric default 0.5,
  created_at timestamptz default timezone('utc', now()),
  journal_activo boolean default false,
  simulador_activo boolean default false,
  rol_global text not null default 'user',
  indicadores_activos jsonb not null default '{}'::jsonb,
  tv_username text,
  plataformas_activas jsonb not null default '{}'::jsonb,
  plan text not null default 'basic',
  agoge_ediciones smallint not null default 0,
  es_elite boolean not null default false,
  agoge_estado text,
  constraint profiles_pkey primary key (id),
  constraint profiles_email_key unique (email),
  constraint profiles_plan_check check (plan in ('basic', 'extra')),
  constraint profiles_agoge_estado_chk check (agoge_estado is null or agoge_estado in ('en_curso', 'expulsado')));
create function public.is_admin()
 returns boolean
 language sql
 stable security definer
 set search_path = public, pg_temp
as $function$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND rol_global = 'admin'
  );
$function$;
create function public.handle_new_user()
 returns trigger
 language plpgsql
 security definer
 set search_path = public, pg_temp
as $function$
BEGIN
  INSERT INTO public.profiles (
    id, email, nombre, rol_global, journal_activo, simulador_activo
  )
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'nombre', split_part(new.email, '@', 1)),
    'user',
    false,
    false
  );
  RETURN new;
END;
$function$;
create function public.sync_plataformas_activas()
 returns trigger
 language plpgsql
as $function$
BEGIN
  NEW.plataformas_activas =
    COALESCE(NEW.plataformas_activas, '{}'::jsonb)
    || jsonb_build_object(
         'journal',   COALESCE(NEW.journal_activo, false),
         'simulator', COALESCE(NEW.simulador_activo, false)
       );
  RETURN NEW;
END;
$function$;
create trigger profiles_sync_plataformas_activas before insert or update on public.profiles for each row execute function public.sync_plataformas_activas();
alter table public.profiles enable row level security;
create policy profiles_select on public.profiles for select to authenticated using (auth.uid() = id or is_admin());

create table public.messages (
  id uuid not null default gen_random_uuid(),
  to_user_id uuid not null,
  from_user_id uuid,
  subject text not null,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint messages_pkey primary key (id),
  constraint messages_to_user_id_fkey foreign key (to_user_id) references auth.users(id) on delete cascade,
  constraint messages_from_user_id_fkey foreign key (from_user_id) references auth.users(id) on delete set null);
create index messages_to_user_idx on public.messages (to_user_id, read_at, created_at desc);
alter table public.messages enable row level security;
create policy "User reads own messages" on public.messages for select to authenticated using (auth.uid() = to_user_id);

create table public.sim_sessions (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  name text not null,
  pair text not null,
  timeframe text not null,
  date_from date not null,
  date_to date not null,
  capital numeric not null default 10000,
  balance numeric not null default 10000,
  status text default 'active',
  created_at timestamptz default now(),
  last_timestamp bigint,
  challenge_type text,
  challenge_phase integer,
  challenge_parent_id uuid,
  constraint sim_sessions_pkey primary key (id),
  constraint sim_sessions_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade,
  constraint sim_sessions_challenge_parent_id_fkey foreign key (challenge_parent_id) references public.sim_sessions(id) on delete set null);
create index sim_sessions_user_id_idx on public.sim_sessions (user_id);
create function public.enforce_sim_session_limit()
 returns trigger
 language plpgsql
 security definer
 set search_path = public
as $function$
declare
  v_plan  text;
  v_limit int;
  v_count int;
begin
  -- Las fases hijas de un challenge (parent_id no nulo) no consumen cupo:
  -- son continuacion de una challenge ya contada. Dejar pasar siempre.
  if new.challenge_parent_id is not null then
    return new;
  end if;

  select plan into v_plan from public.profiles where id = new.user_id;
  if v_plan is null then
    v_plan := 'basic';
  end if;

  if v_plan = 'extra' then
    v_limit := 12;
  else
    v_limit := 6;
  end if;

  -- Cuenta solo filas raiz (cada practice y cada challenge una vez).
  select count(*) into v_count
  from public.sim_sessions
  where user_id = new.user_id
    and challenge_parent_id is null;

  if v_count >= v_limit then
    raise exception 'Limite de sesiones alcanzado para el plan % (max %).', v_plan, v_limit
      using errcode = 'P0001';
  end if;

  return new;
end;
$function$;
create trigger trg_enforce_sim_session_limit before insert on public.sim_sessions for each row execute function public.enforce_sim_session_limit();

create table public.sim_trades (
  id uuid not null default gen_random_uuid(),
  session_id uuid not null,
  user_id uuid not null,
  pair text not null,
  side text not null,
  entry_price numeric(10,5) not null,
  exit_price numeric(10,5),
  sl_price numeric(10,5),
  tp_price numeric(10,5),
  lots numeric(10,2) not null,
  risk_percent numeric(5,2),
  risk_amount numeric(10,2),
  rr numeric(10,2),
  pnl numeric(10,2),
  result text,
  session_type text,
  tags text[],
  notes text,
  opened_at timestamptz not null,
  closed_at timestamptz,
  created_at timestamptz default now(),
  constraint sim_trades_pkey primary key (id),
  constraint sim_trades_session_id_fkey foreign key (session_id) references public.sim_sessions(id) on delete cascade,
  constraint sim_trades_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade,
  constraint sim_trades_side_check check (side in ('BUY', 'SELL')),
  constraint sim_trades_result_check check (result in ('WIN', 'LOSS', 'BREAKEVEN', 'OPEN')),
  constraint sim_trades_session_type_check check (session_type in ('asia', 'london', 'nyam', 'nypm')));
create index sim_trades_session_id_idx on public.sim_trades (session_id);
create index sim_trades_user_id_closed_idx on public.sim_trades (user_id, closed_at);

create table public.session_chart_config (
  id uuid not null default gen_random_uuid(),
  session_id uuid not null,
  user_id uuid not null,
  config jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now(),
  constraint session_chart_config_pkey primary key (id),
  constraint session_chart_config_session_id_key unique (session_id),
  constraint session_chart_config_session_id_fkey foreign key (session_id) references public.sim_sessions(id) on delete cascade,
  constraint session_chart_config_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade);
create table public.session_drawings (
  id uuid not null default gen_random_uuid(),
  session_id uuid not null,
  user_id uuid not null,
  data text not null default '[]',
  updated_at timestamptz default now(),
  pair text not null,
  constraint session_drawings_pkey primary key (id),
  constraint session_drawings_session_id_pair_key unique (session_id, pair),
  constraint session_drawings_session_id_fkey foreign key (session_id) references public.sim_sessions(id) on delete cascade,
  constraint session_drawings_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade);
create table public.sim_drawing_templates (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  name text not null,
  data text not null,
  created_at timestamptz default now(),
  tool_key text,
  config text,
  constraint sim_drawing_templates_pkey primary key (id),
  constraint sim_drawing_templates_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade);
${['user_chart_config', 'user_tool_config'].map(t => `create table public.${t} (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  config jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now(),
  constraint ${t}_pkey primary key (id),
  constraint ${t}_user_id_key unique (user_id),
  constraint ${t}_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade);`).join('\n')}
${[['session_chart_config', 'user owns session config'], ['session_drawings', 'user owns session drawings'], ['sim_drawing_templates', 'Users manage own templates'],
  ['sim_sessions', 'Users see own sessions'], ['sim_trades', 'Users see own trades'], ['user_chart_config', 'user owns config'], ['user_tool_config', 'user owns tool config']]
  .map(([t, p]) => `alter table public.${t} enable row level security;
create policy "${p}" on public.${t} for all to public using (auth.uid() = user_id);`).join('\n')}

-- FK entrantes a profiles de otros productos (solo la columna con la FK)
${ENTRANTES.map(([t, c]) => `create table public.${t} (${c} uuid references public.profiles(id) on delete cascade);`).join('\n')}

-- grants de tabla, los de s04
grant references, select, trigger on public.messages to anon, authenticated;
grant select on public.profiles to anon, authenticated;
grant select, insert, update, delete on ${SIETE_P.map(t => 'public.' + t).join(', ')} to authenticated;
grant select, insert, update, delete, truncate, references, trigger on public.messages, public.profiles, ${SIETE_P.map(t => 'public.' + t).join(', ')} to service_role;

-- storage: el bucket y la RLS de objects (sin politicas)
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean default false, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text);
alter table storage.objects enable row level security;
insert into storage.buckets (id, name, public) values ('forex-data', 'forex-data', true);

-- supuesto (NO CONSTA): privilegios por defecto de Supabase en tablas y secuencias
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`
